"""Malha municipal (IBGE, TopoJSON mínimo + 3 polígonos MT 2025), PAM 2025 e Estoques 2º sem/2025.

Gera data/intel/municipios.json e data/intel/agro.json a partir de data/raw/graos/ (recon: memo graos §1–§3).

- Malha: API IBGE v3 `qualidade=minima` em TopoJSON (5.570 polígonos, anterior a 2025). Boa Esperança do Norte (5101837,
  criado em 2025) não existe nela, e Sorriso (5107925) e Nova Ubiratã (5106240) têm a área antiga. Os três vêm do
  shapefile MT_Municipios_2025, simplificados (~0,003°) e quantizados com o `transform` da topologia como arcos novos;
  os arcos antigos que ficarem sem referência são removidos. Bordas com vizinhos podem ter frestas de centenas de metros.
- Centroides: `/metadados` da malha; Boa Esperança do Norte (e qualquer centroide que caia fora do polígono 2025) pelo
  polígono.
- PAM (SIDRA 1612/839/1613, variável 214, t) e Estoques (SIDRA 5459, v153 capacidade útil, t): "-" → 0, "..." → null,
  "X" → null com sigilo=1. Município ausente da tabela → null (PAM) ou 0 (Estoques: sem unidade armazenadora).

Uso: python scripts/intel/agro.py [fetch|build|all]
"""
import datetime as dt
import io
import json
import sys
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from intel.fontes import Manifest, fetch as baixar  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "raw" / "graos"
OUT = ROOT / "data" / "intel"
SEP = (",", ":")

IBGE_LIC = "Dados abertos IBGE: uso livre com citação da fonte"
SIDRA = "https://apisidra.ibge.gov.br/values"
MALHA_API = "https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR"
ARQUIVOS = [
    # (url, arquivo relativo a data/raw/graos, descrição, período)
    (f"{MALHA_API}?intrarregiao=municipio&qualidade=minima&formato=application/json", "malha/br_mun_minima.topojson",
     "Malha municipal IBGE, qualidade mínima (TopoJSON)", "malha anterior a 2025 (5.570 municípios)"),
    (f"{MALHA_API}/metadados?intrarregiao=municipio", "malha/metadados_mun.json",
     "Metadados da malha municipal IBGE (centroides, área)", "malha anterior a 2025"),
    ("https://servicodados.ibge.gov.br/api/v1/localidades/municipios?view=nivelado", "malha/ibge_municipios.json",
     "Lista de municípios IBGE (localidades, nivelado)", "2025 (5.571 municípios)"),
    ("https://geoftp.ibge.gov.br/organizacao_do_territorio/malhas_territoriais/malhas_municipais/municipio_2025/UFs/MT/"
     "MT_Municipios_2025.zip", "malha/MT_Municipios_2025.zip", "Malha municipal 2025 de Mato Grosso (shapefile)", "2025"),
    (f"{SIDRA}/t/1612/n6/all/v/214/p/2025/c81/2713,2711,2696,2689,2716", "sidra/pam1612_2025.json",
     "PAM tabela 1612: soja, milho, cana, algodão herbáceo, trigo (t)", "2025"),
    (f"{SIDRA}/t/839/n6/all/v/214/p/2025/c81/114253,114254", "sidra/pam839_2025.json",
     "PAM tabela 839: milho 1ª e 2ª safra (t)", "2025"),
    (f"{SIDRA}/t/1613/n6/all/v/214/p/2025/c82/2723,31619,31620", "sidra/pam1613_2025.json",
     "PAM tabela 1613: café total, arábica, canéfora (t)", "2025"),
    (f"{SIDRA}/t/5459/n6/all/v/152,153/p/last/c166/all/c11278/39324", "sidra/est5459_last.json",
     "Pesquisa de Estoques tabela 5459 por município: estabelecimentos e capacidade útil (t)", "2º semestre 2025"),
    (f"{SIDRA}/t/5459/n1/all/n3/all/v/152,153/p/last/c166/114630/c11278/39324", "sidra/est5459_n1n3.json",
     "Pesquisa de Estoques tabela 5459, Brasil e UF", "2º semestre 2025"),
]
MT_NOVOS = ("5101837", "5107925", "5106240")  # Boa Esperança do Norte, Sorriso, Nova Ubiratã
SIMPLIFICA_GRAUS = 0.003
# produto → (arquivo SIDRA, código da categoria)
PRODUTOS = {"soja": ("pam1612_2025", "2713"), "milho1": ("pam839_2025", "114253"),
            "milho2": ("pam839_2025", "114254"), "cana": ("pam1612_2025", "2696"),
            "algodao": ("pam1612_2025", "2689"), "trigo": ("pam1612_2025", "2716"),
            "cafe": ("pam1613_2025", "2723")}
# Comex Stat CO_MUN → IBGE: só os 2 primeiros dígitos mudam nestas UFs (memo §4).
COMEX_UF = {"34": "35", "53": "52", "52": "50", "54": "53"}


def sidra_num(v):
    """Valor SIDRA → (int ou None, sigilo). '-' = 0; '...'/'..'/vazio = None; 'X' = None com sigilo."""
    if v is None:
        return None, 0
    s = str(v).strip()
    if s == "-":
        return 0, 0
    if s == "X":
        return None, 1
    try:
        return int(round(float(s))), 0
    except ValueError:
        return None, 0


def comex_mun_to_ibge(code):
    s = str(code).zfill(7)
    return COMEX_UF.get(s[:2], s[:2]) + s[2:]


def quantize_ring(coords, transform):
    """Anel (lon, lat) → arco TopoJSON quantizado e delta-codificado, sem pontos repetidos e fechado."""
    (sx, sy), (tx, ty) = transform["scale"], transform["translate"]
    q = []
    for x, y in coords:
        p = (round((x - tx) / sx), round((y - ty) / sy))
        if not q or p != q[-1]:
            q.append(p)
    if q[0] != q[-1]:
        q.append(q[0])
    arc, px, py = [], 0, 0
    for i, (x, y) in enumerate(q):
        arc.append([x, y] if i == 0 else [x - px, y - py])
        px, py = x, y
    return arc


def _rings(g):
    return g["arcs"] if g["type"] == "Polygon" else [r for p in g["arcs"] for r in p]


def prune_arcs(topo):
    """Remove arcos sem referência e reindexa as geometrias (in place)."""
    geoms = [g for o in topo["objects"].values() for g in o["geometries"]]
    used = sorted({a if a >= 0 else ~a for g in geoms for r in _rings(g) for a in r})
    new = {old: i for i, old in enumerate(used)}

    def ring(r):
        return [new[a] if a >= 0 else ~new[~a] for a in r]

    for g in geoms:
        g["arcs"] = [ring(r) for r in g["arcs"]] if g["type"] == "Polygon" else [[ring(r) for r in p] for p in g["arcs"]]
    topo["arcs"] = [topo["arcs"][i] for i in used]
    return topo


def _load(rel):
    return json.loads((RAW / rel).read_text(encoding="utf-8"))


def _fonte(nome, url, periodo, nota, licenca=IBGE_LIC, acesso=None):
    return {"nome": nome, "url": url, "periodo": periodo, "acesso": acesso or _acesso(), "licenca": licenca,
            "nota": nota}


def _acesso():
    m = Manifest("agro")
    return min((i["acesso"] for i in m.items), default=dt.date.today().isoformat())


def _mt2025():
    """{código: shapely geometry} dos 3 municípios MT 2025, lidos direto do zip."""
    import shapefile
    from shapely.geometry import shape
    with zipfile.ZipFile(RAW / "malha" / "MT_Municipios_2025.zip") as z:
        names = {Path(n).suffix.lower(): n for n in z.namelist()}
        rd = shapefile.Reader(shp=io.BytesIO(z.read(names[".shp"])), shx=io.BytesIO(z.read(names[".shx"])),
                              dbf=io.BytesIO(z.read(names[".dbf"])), encoding="utf-8")
        out = {}
        for sr in rd.iterShapeRecords():
            cd = sr.record["CD_MUN"]
            if cd in MT_NOVOS:
                out[cd] = shape(sr.shape.__geo_interface__).buffer(0)
    assert set(out) == set(MT_NOVOS), out.keys()
    return out


def _geom_arcs(geom, topo):
    """Polígono shapely → geometria TopoJSON com arcos novos anexados a topo['arcs']."""
    from shapely.geometry import Polygon
    from shapely.geometry.polygon import orient
    polys = [geom] if isinstance(geom, Polygon) else list(geom.geoms)
    out = []
    for p in polys:
        p = orient(p, sign=-1.0)  # exterior horário, como na malha IBGE
        rings = []
        for k, ring in enumerate([p.exterior, *p.interiors]):
            arc = quantize_ring(list(ring.coords), topo["transform"])
            if len(arc) < 4:
                if k == 0:
                    break
                continue
            topo["arcs"].append(arc)
            rings.append([len(topo["arcs"]) - 1])
        if rings:
            out.append(rings)
    assert out
    return {"type": "Polygon", "arcs": out[0]} if len(out) == 1 else {"type": "MultiPolygon", "arcs": out}


def build_municipios():
    from shapely.geometry import Point
    lst = sorted(_load("malha/ibge_municipios.json"), key=lambda m: m["municipio-id"])
    ids = [str(m["municipio-id"]) for m in lst]
    nomes = [m["municipio-nome"] for m in lst]
    ufs = [m["UF-sigla"] for m in lst]
    meta = {m["id"]: (m["centroide"]["longitude"], m["centroide"]["latitude"]) for m in _load("malha/metadados_mun.json")}

    topo = _load("malha/br_mun_minima.topojson")
    (obj,) = topo["objects"].values()
    old = {g["properties"]["codarea"]: g for g in obj["geometries"]}
    assert set(old) <= set(ids), set(old) - set(ids)
    mt = _mt2025()
    for cd in MT_NOVOS:
        old[cd] = _geom_arcs(mt[cd].simplify(SIMPLIFICA_GRAUS, preserve_topology=True), topo)
    geoms = []
    for cd in ids:
        g = old[cd]
        geoms.append({"type": g["type"], "arcs": g["arcs"], "properties": {"id": cd}})
    topo = {"type": "Topology", "transform": topo["transform"], "objects": {"mun": {"type": "GeometryCollection",
                                                                                     "geometries": geoms}},
            "arcs": topo["arcs"]}
    prune_arcs(topo)

    centro = []
    for cd in ids:
        c = meta.get(cd)
        if cd in mt and (c is None or not mt[cd].contains(Point(c))):
            p = mt[cd].centroid if mt[cd].contains(mt[cd].centroid) else mt[cd].representative_point()
            c = (p.x, p.y)
        centro.append([round(c[0], 5), round(c[1], 5)])

    fonte = [
        _fonte("IBGE — Malha municipal (API de malhas v3, qualidade mínima)", ARQUIVOS[0][0], "malha vigente na API",
               "TopoJSON quantizado; propriedade id = código IBGE de 7 dígitos. A malha da API é anterior a 2025."),
        _fonte("IBGE — Malha municipal 2025, Mato Grosso", ARQUIVOS[3][0], "2025",
               "Polígonos de Boa Esperança do Norte (5101837), Sorriso e Nova Ubiratã substituídos pela malha 2025, "
               "simplificados (~0,003°); bordas com vizinhos podem ter frestas pequenas."),
        _fonte("IBGE — Metadados da malha e localidades", ARQUIVOS[1][0], "2025",
               "Centroides oficiais do /metadados; Boa Esperança do Norte pelo polígono 2025. Nomes e UF de "
               "/localidades/municipios (5.571)."),
    ]
    return {"fonte": fonte, "tipo": "medido", "topo": topo, "ids": ids, "nomes": nomes, "uf": ufs, "centro": centro}


def build_agro(ids):
    pam = {}
    for arq in {a for a, _ in PRODUTOS.values()}:
        for r in _load(f"sidra/{arq}.json")[1:]:
            pam[(arq, r["D4C"], r["D1C"])] = r["V"]
    produtos = {}
    for k, (arq, cat) in PRODUTOS.items():
        produtos[k] = [sidra_num(pam.get((arq, cat, cd)))[0] for cd in ids]

    est = {r["D1C"]: r["V"] for r in _load("sidra/est5459_last.json")[1:] if r["D2C"] == "153" and r["D4C"] == "114630"}
    periodo = next(r["D3N"] for r in _load("sidra/est5459_last.json")[1:])
    assert periodo == "2º semestre 2025", periodo
    cap, sig = [], []
    for cd in ids:
        v, s = sidra_num(est[cd]) if cd in est else (0, 0)
        cap.append(v)
        sig.append(s)
    br = next(int(r["V"]) for r in _load("sidra/est5459_n1n3.json")[1:]
              if r["D1C"] == "1" and r["D2C"] == "153" and r["D4C"] == "114630")

    fonte = [
        _fonte("IBGE — Produção Agrícola Municipal (PAM), SIDRA tabelas 1612, 839 e 1613", ARQUIVOS[4][0], "2025",
               "Quantidade produzida (t). Algodão = herbáceo em caroço; café = total (arábica + canéfora); milho por "
               "safra (tabela 839). '-' = 0; '...' = sem dado (null)."),
        _fonte("IBGE — Pesquisa de Estoques, SIDRA tabela 5459", ARQUIVOS[7][0], "2º semestre 2025",
               "Capacidade útil (t) de armazéns graneleiros/granelizados e silos. 'X' = sigilo (null, sigilo=1); "
               "município fora da tabela = 0. A soma municipal publicada fica abaixo do total Brasil por causa do "
               "sigilo."),
    ]
    return {"fonte": fonte, "tipo": "medido", "ids": ids, "ano": 2025, "produtos": produtos,
            "armazenagem": {"periodo": "2º sem/2025", "cap": cap, "sigilo": sig, "total_brasil": br}}


def _write(name, obj):
    OUT.mkdir(parents=True, exist_ok=True)
    p = OUT / name
    p.write_text(json.dumps(obj, ensure_ascii=False, separators=SEP), encoding="utf-8")
    return p


def fetch():
    m = Manifest("agro")
    for url, rel, desc, periodo in ARQUIVOS:
        dest = baixar(url, RAW / rel)
        m.add(url, dest, desc, periodo=periodo, licenca=IBGE_LIC)
    m.save()
    return m


def build():
    mun = build_municipios()
    p1 = _write("municipios.json", mun)
    assert p1.stat().st_size <= 1.8e6, p1.stat().st_size
    p2 = _write("agro.json", build_agro(mun["ids"]))
    for p in (p1, p2):
        print(f"{p.relative_to(ROOT)}: {p.stat().st_size / 1e3:.0f} KB")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "all"
    if cmd in ("fetch", "all"):
        fetch()
    if cmd in ("build", "all"):
        build()
