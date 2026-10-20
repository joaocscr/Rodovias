"""VMDa 2025 (DNIT, "VMDa – Modelagem 2025", camada VGeo fornecida pelo usuário): volume médio diário anual
MODELADO por link da rede vetorizada, total e por sentido (sem leves/pesados), para os físicos do SNV e para as
linhas da malha estadual (data/intel/estaduais.json, `malha`).

Uso: python scripts/intel/vmda2025.py [registrar|build|all]

Regras (spec docs/superpowers/specs/2026-10-20-v3.1-rotas-paleta-vmda2025-design.md, contrato no plano):
- Federal, por código: cada trecho do SNV recebe a média, ponderada pela `extensao`, dos links com o mesmo
  `codigo_snv` e `vmda_total` > 0 (total, crescente, decrescente). No físico vale o trecho de maior total
  (trechos coincidentes), como em trafego.py.
- Federal, fallback geométrico (nenhum trecho do físico tem código no VMDa; físicos planejados ficam de fora):
  link federal mais próximo de 3 pontos do físico (25/50/75%), como em carga.py; só vale se a mediana das 3
  distâncias for ≤ 100 m; valor = mediana dos links casados com valor.
  Físico planejado (PLA) só tem valor pelo código: o próprio VMDa associa o código planejado à estrada
  estadual existente (mesma regra do VMDa 2023 em trafego.py).
- Estadual: mesma junção geométrica por linha da malha, com os links não federais e não conectores.
- `ns` = 1 quando a maior parte (extensão, ou nº de links na mediana) dos links usados é "Não Simulável" na
  `classifica` (área urbana/metropolitana; a fonte pede uso restrito). Total 0 ou ausente = sem dado (null).
"""
import datetime as dt
import json
import statistics
import sys
import zipfile
from collections import namedtuple
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import numpy as np  # noqa: E402

from intel.fontes import RAW, ROOT, Manifest  # noqa: E402
from intel.snvbase import decode_line, snv  # noqa: E402

DRIVE_URL = "https://drive.google.com/file/d/1gnXpMWMLs4uZ9mWZf2SxlNe6R8LcdFha/view"
DIR = RAW / "trafego" / "vmda2025"
ZIP = DIR / "vgeo_vmda2025.zip"  # arquivo do Drive do usuário
PASTA = DIR / "VMDa - Modelagem 2025"
SHP = PASTA / "VMDa - Modelagem 2025.shp"
ESTADUAIS = ROOT / "data" / "intel" / "estaduais.json"
OUT = ROOT / "data" / "intel" / "vmda2025.json"

MAX_M = 100  # distância máxima (mediana dos 3 pontos) para aceitar o casamento geométrico
PONTOS = (0.25, 0.5, 0.75)
NS = "Não Simulável"
LICENCA = "Dado público federal (DNIT); licença não declarada na fonte"

Links = namedtuple("Links", "cod jur tipo ext t c d ns geoms")


# ============================== funções puras ==============================
def _valido(lk):
    return lk["t"] is not None and lk["t"] > 0


def media_links(links):
    """{t, c, d, ns} médios dos links com total > 0, ponderados pela extensão; None se nenhum. Sentido null se
    algum link não o tiver; ns = 1 se mais da metade da extensão é não simulável."""
    v = [lk for lk in links if _valido(lk)]
    if not v:
        return None
    w = [lk["ext"] if lk["ext"] and lk["ext"] > 0 else 1e-6 for lk in v]
    W = sum(w)

    def med(k):
        if any(lk[k] is None for lk in v):
            return None
        return int(round(sum(wi * lk[k] for wi, lk in zip(w, v)) / W))

    ns = sum(wi for wi, lk in zip(w, v) if lk["ns"]) / W
    return {"t": med("t"), "c": med("c"), "d": med("d"), "ns": int(ns > 0.5)}


def mediana_links(links):
    """{t, c, d, ns}: mediana dos links casados com total > 0; ns = 1 se mais da metade deles é não simulável."""
    v = [lk for lk in links if _valido(lk)]
    if not v:
        return None

    def med(k):
        if any(lk[k] is None for lk in v):
            return None
        return int(round(statistics.median(lk[k] for lk in v)))

    return {"t": med("t"), "c": med("c"), "d": med("d"), "ns": int(sum(lk["ns"] for lk in v) > len(v) / 2)}


def maior_total(valores):
    """Entre trechos coincidentes de um físico, o de maior total (None se nenhum tem valor)."""
    v = [x for x in valores if x]
    return max(v, key=lambda x: x["t"]) if v else None


# ============================== leitura ==============================
def find_shp():
    if not SHP.exists():
        with zipfile.ZipFile(ZIP) as z:
            z.extractall(DIR)
    return SHP


def load_links(shp=None):
    """Links não conectores, com atributos e geometria em EPSG:5880 (m). Lê o shapefile em fluxo."""
    import shapefile
    import shapely
    from pyproj import Transformer

    r = shapefile.Reader(str(shp or find_shp()), encoding="utf-8")
    cod, jur, tipo, ext, t, c, d, ns, partes, ids = [], [], [], [], [], [], [], [], [], []
    for sr in r.iterShapeRecords():
        a = sr.record.as_dict()
        pts = sr.shape.points
        if a["tipo_link"] == "Conector" or len(pts) < 2:
            continue
        ids.append(np.full(len(pts), len(cod)))
        partes.append(np.asarray(pts, dtype=float))
        cod.append(a["codigo_snv"] or "")
        jur.append(a["jurisdicao"] or "")
        tipo.append(a["tipo_link"])
        ext.append(float(a["extensao"] or 0))
        tot = a["vmda_total"]
        t.append(int(tot) if tot else None)
        c.append(a["vmda_cresc"])
        d.append(a["vmda_decre"])
        ns.append(int(a["classifica"] == NS))
    xy = np.concatenate(partes)
    del partes
    tr = Transformer.from_crs(4326, 5880, always_xy=True)  # WGS84 → policônica Brasil (m)
    px, py = tr.transform(xy[:, 0], xy[:, 1])
    geoms = shapely.linestrings(np.column_stack([px, py]), indices=np.concatenate(ids))
    return Links(cod, jur, tipo, ext, t, c, d, ns, geoms)


def _link(lk, i):
    return {"ext": lk.ext[i], "t": lk.t[i], "c": lk.c[i], "d": lk.d[i], "ns": lk.ns[i]}


# ============================== junção ==============================
def casar(lk, cand, linhas):
    """Para cada linha (EPSG:5880): mediana_links dos links `cand` mais próximos de 3 pontos, se a mediana das 3
    distâncias for ≤ MAX_M (links a mais de MAX_M não entram); senão None. Devolve (valores, distâncias)."""
    import shapely
    from shapely.strtree import STRtree

    cand = np.asarray(cand)
    tree = STRtree(lk.geoms[cand])
    linhas = np.asarray(linhas, dtype=object)
    pts = np.concatenate([shapely.line_interpolate_point(linhas, f, normalized=True) for f in PONTOS])
    (src, dst), dist = tree.query_nearest(pts, return_distance=True, all_matches=False)
    idx = np.empty(len(pts), dtype=int)
    dd = np.empty(len(pts))
    idx[src], dd[src] = cand[dst], dist  # sem max_distance: um resultado por ponto
    n = len(linhas)
    idx, dd = idx.reshape(len(PONTOS), n), dd.reshape(len(PONTOS), n)
    out, dmed = [], []
    for j in range(n):
        m = float(np.median(dd[:, j]))
        dmed.append(m)
        out.append(mediana_links([_link(lk, idx[k, j]) for k in range(len(PONTOS)) if dd[k, j] <= MAX_M])
                   if m <= MAX_M else None)
    return out, dmed


def por_fis(lk, s):
    """Lista (uma posição por físico) de {t, c, d, ns} ou None, e a contagem por método."""
    por_cod = {}
    for i, cd in enumerate(lk.cod):
        if cd:
            por_cod.setdefault(cd, []).append(i)
    por_trecho = [media_links([_link(lk, i) for i in por_cod[t["codigo"]]]) if t["codigo"] in por_cod else None
                  for t in s.trechos]
    res, sem_cod = [], []
    for j, f in enumerate(s.fis):
        if any(s.trechos[r]["codigo"] in por_cod for r in f["r"]):
            res.append(maior_total([por_trecho[r] for r in f["r"]]))
        else:
            res.append(None)
            if s.main_trecho(j)["superficie"] != "PLA":
                sem_cod.append(j)
    fed = [i for i in range(len(lk.cod)) if lk.cod[i] or lk.jur[i] == "Federal"]
    geo, _ = casar(lk, fed, [s.geom_m(j) for j in sem_cod]) if sem_cod else ([], [])
    for j, v in zip(sem_cod, geo):
        res[j] = v
    geo_j = set(sem_cod)
    cont = {"codigo": sum(v is not None for j, v in enumerate(res) if j not in geo_j),
            "geometria": sum(v is not None for v in geo), "sem_codigo": len(sem_cod)}
    return res, cont


def linhas_malha(s, path=ESTADUAIS):
    from shapely.geometry import LineString
    m = json.loads(Path(path).read_text(encoding="utf-8"))["malha"]
    out = []
    for p in m["p"]:
        pts = decode_line(p)
        if len(pts) < 2:
            pts = pts * 2
        xs, ys = s.to_m([q[0] for q in pts], [q[1] for q in pts])
        out.append(LineString(list(zip(xs, ys))))
    return out


def por_estadual(lk, s):
    cand = [i for i in range(len(lk.cod)) if lk.jur[i] != "Federal"]
    return casar(lk, cand, linhas_malha(s))


# ============================== bloco ==============================
def registrar():
    """O arquivo vem do Drive do usuário (sem download aqui): registra o zip no manifesto."""
    m = Manifest("vmda2025")
    m.add(DRIVE_URL, ZIP, "VMDa – Modelagem 2025 (shapefile com volume por link e dicionário de dados); "
                          "camada VGeo/DNIT fornecida pelo usuário", periodo="2025", licenca=LICENCA)
    m.save()


def _fonte():
    acesso = dt.date.today().isoformat()
    for i in Manifest("vmda2025").items:
        if i["url"] == DRIVE_URL:
            acesso = i["acesso"]
    return {
        "nome": "DNIT — VMDa 2025 (volume médio diário anual modelado, total e por sentido)",
        "url": DRIVE_URL, "periodo": "2025", "acesso": acesso, "licenca": LICENCA, "tipo": "modelado",
        "nota": ("Camada VGeo/DNIT fornecida pelo usuário. Estimativa modelada por trecho da rede, não é contagem; "
                 "traz só o total de veículos por dia e os dois sentidos, sem separar leves e pesados. Cada trecho "
                 "federal recebeu a média dos trechos do modelo com o mesmo código do SNV, ponderada pela extensão; "
                 "onde há trechos coincidentes vale o de maior volume total. Sem código correspondente, vale a "
                 "mediana dos trechos federais do modelo mais próximos em 3 pontos (a 25%, 50% e 75% do "
                 "comprimento), quando a mediana das distâncias é de até 100 m. As rodovias estaduais receberam, "
                 "do mesmo modo, a mediana dos trechos estaduais, distritais ou municipais mais próximos. Volume "
                 "zero ou sem estimativa fica sem valor; um trecho federal planejado só tem valor quando o próprio "
                 "modelo o associa pelo código a uma estrada existente. Onde a fonte marca o "
                 "trecho como não simulável (perto de grandes áreas urbanas), o valor é mantido com uso restrito."),
    }


def build(write=True):
    s = snv()
    lk = load_links()
    fis, cont = por_fis(lk, s)
    est, _ = por_estadual(lk, s)

    def col(vals, k):
        return [v[k] if v else (0 if k == "ns" else None) for v in vals]

    doc = {"fonte": [_fonte()], "tipo": "modelado", "ano": 2025,
           "fis": {k: col(fis, k) for k in ("t", "c", "d", "ns")},
           "estaduais": {k: col(est, k) for k in ("t", "ns")}}
    if write:
        OUT.parent.mkdir(parents=True, exist_ok=True)
        OUT.write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        print(f"{OUT.relative_to(ROOT)}: {OUT.stat().st_size / 1024:.0f} KB | físicos com valor: "
              f"{sum(v is not None for v in fis)}/{s.n} (código {cont['codigo']}, geometria {cont['geometria']} de "
              f"{cont['sem_codigo']} sem código) | linhas estaduais com valor: {sum(v is not None for v in est)}/{len(est)}")
    return doc


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "all"
    if cmd in ("registrar", "all"):
        registrar()
    if cmd in ("build", "all"):
        build()
