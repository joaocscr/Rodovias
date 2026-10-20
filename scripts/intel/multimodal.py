"""Contexto multimodal: ferrovias, portos/ETCs, fluxos ferroviários (SIADE), exportação (Comex) e fretes (CONAB).

Gera data/intel/multimodal.json a partir de data/raw/graos/ (recon: memo graos §4, §5, §7, §8, §9).

- ferrovias: BaseFerro (MT/ONTL, abr/2024), só `tip_situac` = "Em Operação"; trechos unidos por (sigla, nome) e
  simplificados (Douglas-Peucker 0,002°), codificados com `snvbase.encode_line`.
- portos: ANTAQ instalações portuárias (06/05/2025), só Brasil; o .dbf está em latin1 (o .cpg diz UTF-8); latitude e
  longitude em texto com "°" (sem texto → ponto do shape). UF: campo `estado`; senão o código `BRuuNNN`; senão o
  município mais próximo.
- siade: ANTT SIADE produção origem-destino 2025 (ponto = milhar, latin1), soja, milho, farelo de soja, açúcar e
  fertilizantes, somados por (origem, destino, produto), pares ≥ 50.000 t. Coordenadas das estações pela tabela do
  GeoPackage IBGE Logística dos Transportes 2024 (ferroviário detalhado), por nome normalizado + UF; senão pela sede
  do município homônimo.
- exportacao: Comex Stat EXP_2025 (base bruta), kg por SH4 × UF × URF × via, SH4 de grãos e agro (memo §4).
- fretes: CONAB Boletim Logístico set/2026 (dados de ago/2026), extraído do PDF para conab/fretes_boletim_set2026.csv.

Uso: python scripts/intel/multimodal.py [fetch|build|all]
"""
import csv
import datetime as dt
import io
import json
import math
import re
import sqlite3
import subprocess
import sys
import unicodedata
import zipfile
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from intel.fontes import Manifest, fetch as baixar  # noqa: E402
from intel.snvbase import encode_line  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "raw" / "graos"
OUT = ROOT / "data" / "intel"
SEP = (",", ":")

LIC_GOV = "Dados abertos do governo federal (Decreto 8.777/2016); citar a fonte"
COMEX_BD = "https://balanca.mdic.gov.br/balanca/bd"
GPKG_FERR = RAW / "logistica" / "detalhados" / "Fluxos_Ferroviarios" / "fluxos_ferr_od.gpkg"
FRETES_CSV = RAW / "conab" / "fretes_boletim_set2026.csv"
FRETES_PDF = RAW / "conab" / "boletim-setembro-2026-pdf.pdf"
SERPRO_AIA = "http://secure.globalsign.com/cacert/acserproar46ovtlsca2025.crt"
CA_PROXY = Path("/root/.ccr/ca-bundle.crt")

ARQUIVOS = [
    # (url, arquivo relativo a data/raw/graos, descrição, período, comex?)
    ("https://www.gov.br/transportes/pt-br/assuntos/dados-de-transportes/bit/Base-GEO/BaseFerro.zip/@@download/file",
     "multimodal/BaseFerro.zip", "BaseFerro — malha ferroviária (shapefile)", "abr/2024", False),
    ("https://www.gov.br/antaq/pt-br/central-de-conteudos/Instalaesporturias06052025.zip",
     "multimodal/antaq_instalacoes.zip", "ANTAQ — instalações portuárias (shapefile)", "06/05/2025", False),
    ("https://dados.antt.gov.br/dataset/438a5184-09db-49a3-88c8-0bad418b4409/resource/"
     "d7263808-bd77-4153-9910-49e041d73b21/download/producao_origem_destino_2025.csv",
     "antt/producao_origem_destino_2025.csv", "ANTT SIADE — produção origem-destino 2025", "jan–dez/2025", False),
    ("https://geoftp.ibge.gov.br/organizacao_do_territorio/redes_e_fluxos_geograficos/logistica_dos_transportes/2024/"
     "Base_de_dados/Fluxos_Detalhados_OD_de_Mercadorias/Fluxos_Ferroviarios.zip",
     "logistica/detalhados/Fluxos_Ferroviarios.zip", "IBGE Logística dos Transportes 2024 — fluxos ferroviários O/D",
     "2024", False),
    (f"{COMEX_BD}/comexstat-bd/ncm/EXP_2025.csv", "comex/EXP_2025.csv", "Comex Stat — exportações 2025 por NCM",
     "jan–dez/2025", True),
    (f"{COMEX_BD}/tabelas/URF.csv", "comex/URF.csv", "Comex Stat — tabela de URF", "", True),
    (f"{COMEX_BD}/tabelas/VIA.csv", "comex/VIA.csv", "Comex Stat — tabela de vias", "", True),
    ("https://www.gov.br/conab/pt-br/atuacao/logistica/boletim-logistico/boletim-logistico-setembro-2026-pdf.pdf/"
     "@@download/file", "conab/boletim-setembro-2026-pdf.pdf", "CONAB — Boletim Logístico set/2026 (PDF)",
     "ago/2026", False),
]
SH4 = {"1201": "Soja", "1005": "Milho", "2304": "Farelo de soja", "1701": "Açúcar", "4703": "Celulose",
       "5201": "Algodão", "0201": "Carne bovina fresca ou refrigerada", "0202": "Carne bovina congelada",
       "0207": "Carne de aves", "0901": "Café", "1001": "Trigo", "1507": "Óleo de soja"}
SIADE_PROD = {"Soja": "Soja", "Grãos - Milho": "Milho", "Farelo de Soja": "Farelo de soja", "Açúcar": "Açúcar",
              "Adubo Fert em Geral a Granel  - Perigoso": "Fertilizantes", "Adubo Orgânico a Granel": "Fertilizantes",
              "Adubo Orgânico acondicionado": "Fertilizantes", "Cloreto de Potássio": "Fertilizantes",
              "Fosfato": "Fertilizantes", "Ureia": "Fertilizantes",
              "Outros - adubos e Fertiliz - Perigoso": "Fertilizantes",
              "Outros - adubos e Fertilizantes": "Fertilizantes"}
SIADE_MIN_T = 50_000
SIMPLIFICA_FERRO = 0.002
UFS = {"AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI",
       "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"}
MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]
MINUSC = {"da", "de", "do", "das", "dos", "e"}


# ---------- utilitários ----------

def parse_grau(s):
    """'-23.011943°' → -23.011943 (aceita vírgula decimal); vazio → None."""
    s = (s or "").replace("°", "").replace(",", ".").strip()
    return float(s) if s else None


def parse_milhar(s):
    """'16.578.555' (ponto = milhar) → 16578555."""
    return int(str(s).replace(".", "").strip())


def norm_nome(s):
    """Sem acento, minúsculo, sem '(UF)' e sem nada além de letras e dígitos."""
    s = unicodedata.normalize("NFKD", str(s)).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"\(\w\w\)", "", s)
    return re.sub(r"[^a-z0-9]", "", s)


def split_uf(s):
    """'SORRISO (MT)' → ('SORRISO', 'MT'); 'Ponta da Madeira - (MA)' → ('Ponta da Madeira', 'MA').
    Texto depois do '(UF)' é anexado ao nome com ' - '."""
    m = re.match(r"^(.*?)\s*-?\s*\(([A-Z]{2})\)\s*(?:-\s*)?(.*)$", s.strip())
    if not m:
        return s.strip(), None
    nome = m.group(1).strip()
    if m.group(3).strip():
        nome = f"{nome} - {m.group(3).strip()}"
    return nome, m.group(2)


def gpkg_geom(blob):
    """Blob de geometria GeoPackage (LineString/Point em WKB little/big endian) → shapely."""
    from shapely import wkb
    flags = blob[3]
    env = {0: 0, 1: 32, 2: 48, 3: 48, 4: 64}[(flags >> 1) & 7]
    return wkb.loads(bytes(blob[8 + env:]))


def _titulo(s):
    out = []
    for i, w in enumerate(s.lower().split()):
        out.append(w if (i and w in MINUSC) else w[:1].upper() + w[1:])
    return " ".join(out)


def _zip_shapefile(path, encoding):
    import shapefile
    z = zipfile.ZipFile(path)
    names = {Path(n).suffix.lower(): n for n in z.namelist()}
    return shapefile.Reader(shp=io.BytesIO(z.read(names[".shp"])), shx=io.BytesIO(z.read(names[".shx"])),
                            dbf=io.BytesIO(z.read(names[".dbf"])), encoding=encoding)


def _municipios():
    """(nome normalizado, UF) → (nome IBGE, [lon, lat]) a partir de data/intel/municipios.json (agro.py)."""
    m = json.loads((OUT / "municipios.json").read_text(encoding="utf-8"))
    return {(norm_nome(n), u): (n, c) for n, u, c in zip(m["nomes"], m["uf"], m["centro"])}, m


# ---------- blocos ----------

def build_ferrovias():
    from shapely.geometry import LineString, MultiLineString
    from shapely.ops import linemerge
    rd = _zip_shapefile(RAW / "multimodal" / "BaseFerro.zip", "utf-8")
    grupos = defaultdict(list)
    for sr in rd.iterShapeRecords():
        rec = sr.record
        if rec["tip_situac"] != "Em Operação":
            continue
        pts, parts = sr.shape.points, list(sr.shape.parts) + [len(sr.shape.points)]
        for a, b in zip(parts, parts[1:]):
            if b - a >= 2:
                grupos[(rec["sigla"], rec["nome"])].append(LineString(pts[a:b]))
    out = []
    for (sigla, nome), linhas in sorted(grupos.items()):
        m = linemerge(MultiLineString(linhas))
        for ln in (m.geoms if hasattr(m, "geoms") else [m]):
            s = ln.simplify(SIMPLIFICA_FERRO)
            if s.length < SIMPLIFICA_FERRO:
                continue
            out.append({"p": encode_line(list(s.coords)), "sit": "Em Operação", "sigla": sigla, "nome": nome})
    return out


def build_portos():
    _, m = _municipios()
    rd = _zip_shapefile(RAW / "multimodal" / "antaq_instalacoes.zip", "latin1")
    out = []
    for sr in rd.iterShapeRecords():
        r = sr.record
        if r["cdbigrama"] != "BR":
            continue
        lat, lon = parse_grau(r["latitude"]), parse_grau(r["longitude"])
        if lat is None or lon is None:
            lon, lat = sr.shape.points[0]
        uf = r["estado"].strip()
        if uf not in UFS:
            mc = re.fullmatch(r"BR([A-Z]{2})\d{3}", r["cdi_tuaria"].strip())
            uf = mc.group(1) if mc and mc.group(1) in UFS else None
        if uf is None:  # município mais próximo
            k = min(range(len(m["centro"])),
                    key=lambda i: (m["centro"][i][0] - lon) ** 2 + (m["centro"][i][1] - lat) ** 2)
            uf = m["uf"][k]
        nome = re.sub(r"\s+", " ", r["nome"].replace("\xa0", " ")).strip()
        out.append({"nome": nome, "tipo": r["tipo"].strip(), "uf": uf, "lat": round(lat, 5), "lon": round(lon, 5)})
    out.sort(key=lambda p: (p["uf"], p["nome"]))
    return out


def _estacoes():
    """(nome normalizado, UF) → (lon, lat) das estações do GeoPackage ferroviário IBGE (início/fim de cada O/D)."""
    st = {}
    con = sqlite3.connect(f"file:{GPKG_FERR}?mode=ro", uri=True)
    for geom, ro, rd in con.execute("select geom, ROT_TF_O, ROT_TF_D from base_para_app_produtos_ferr"):
        coords = list(gpkg_geom(geom).coords)
        for rot, p in ((ro, coords[0]), (rd, coords[-1])):
            nome, uf = split_uf(rot)
            st[(norm_nome(nome), uf)] = [round(p[0], 5), round(p[1], 5)]
    con.close()
    return st


def build_siade():
    import pandas as pd
    d = pd.read_csv(RAW / "antt" / "producao_origem_destino_2025.csv", sep=";", encoding="latin1", thousands=".",
                    dtype={"TU": "int64"})
    assert d["Mes_Ano"].str.endswith("/2025").all()
    d["prod"] = d["Mercadoria_ANTT"].map(SIADE_PROD)
    d = d[d["prod"].notna()]
    g = d.groupby(["Estacao_Origem", "UF_Origem", "Estacao_Destino", "UF_Destino", "prod"], as_index=False)["TU"].sum()
    g = g[g["TU"] >= SIADE_MIN_T].sort_values("TU", ascending=False)
    st = _estacoes()
    mun, _ = _municipios()

    def coord(nome, uf):
        k = (norm_nome(nome), uf)
        if k in st:
            return st[k]
        return mun[k][1] if k in mun else None

    return [{"o": r.Estacao_Origem, "uo": r.UF_Origem, "d": r.Estacao_Destino, "ud": r.UF_Destino,
             "lo": coord(r.Estacao_Origem, r.UF_Origem), "ld": coord(r.Estacao_Destino, r.UF_Destino),
             "prod": r.prod, "t": int(r.TU)} for r in g.itertuples()]


def build_exportacao():
    import pandas as pd
    d = pd.read_csv(RAW / "comex" / "EXP_2025.csv", sep=";", dtype=str,
                    usecols=["CO_ANO", "CO_NCM", "SG_UF_NCM", "CO_VIA", "CO_URF", "KG_LIQUIDO"])
    assert (d["CO_ANO"] == "2025").all()
    d["sh4"] = d["CO_NCM"].str[:4]
    d = d[d["sh4"].isin(SH4)]
    d["kg"] = d["KG_LIQUIDO"].astype("int64")
    urf = pd.read_csv(RAW / "comex" / "URF.csv", sep=";", dtype=str, encoding="latin1")
    via = pd.read_csv(RAW / "comex" / "VIA.csv", sep=";", dtype=str, encoding="latin1")
    urf_nome = {c: re.sub(r"^\d+\s*-\s*", "", n).strip() for c, n in zip(urf["CO_URF"], urf["NO_URF"])}
    via_nome = dict(zip(via["CO_VIA"], via["NO_VIA"].str.strip()))
    g = d.groupby(["sh4", "SG_UF_NCM", "CO_URF", "CO_VIA"], as_index=False)["kg"].sum()
    g = g[g["kg"] > 0].sort_values(["sh4", "kg"], ascending=[True, False])
    linhas = [[r.sh4, r.SG_UF_NCM, urf_nome.get(r.CO_URF, r.CO_URF), via_nome.get(r.CO_VIA, r.CO_VIA), int(r.kg)]
              for r in g.itertuples()]
    return {"ano": 2025, "campos": ["sh4", "uf", "urf", "via", "kg"], "linhas": linhas, "sh4": SH4}


def _num_br(s):
    s = (s or "").strip()
    if s in ("", "SI", "-"):
        return None
    return float(s.replace(".", "").replace(",", "."))


def distancia_reta(a, b):
    """Distância em linha reta (km, grande círculo) entre dois pontos [lon, lat]."""
    lon1, lat1, lon2, lat2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 2 * 6371.0088 * math.asin(math.sqrt(h))


# Plausibilidade da distância do boletim: a rota rodoviária fica entre 0,9× e 3× a linha reta entre as sedes.
KM_MIN_RETA, KM_MAX_RETA = 0.9, 3.0
# Só para achar a sede na verificação (o nome exibido não muda): localidades do boletim que não são município.
SEDE_ALIAS = {("miritituba", "PA"): ("itaituba", "PA"), ("colinas", "TO"): ("colinasdotocantins", "TO"),
              ("braganca", "SP"): ("bragancapaulista", "SP")}


def km_suspeito(km, reta, mesma=False):
    """True quando a distância informada é implausível: origem = destino, km < 0,9 × linha reta ou km > 3 × linha
    reta. Sem km ou sem linha reta (sede não encontrada), não há como julgar: False."""
    if mesma:
        return True
    if km is None or reta is None:
        return False
    return km < KM_MIN_RETA * reta or km > KM_MAX_RETA * reta


def nome_colado(chave, uf, mun):
    """True quando o nome normalizado é a junção de dois municípios da mesma UF (artefato de células mescladas no
    boletim, ex.: 'Ribeirão Preto Santos')."""
    return (chave, uf) not in mun and any((chave[:i], uf) in mun and (chave[i:], uf) in mun
                                          for i in range(3, len(chave) - 2))


def qualidade_frete(atribuicao, suspeito):
    """'ok' | 'aprox' (origem atribuída por proximidade) e, com distância implausível, 'km_suspeito' ou
    'aprox+km_suspeito' (as duas ressalvas)."""
    if not suspeito:
        return atribuicao
    return "km_suspeito" if atribuicao == "ok" else f"{atribuicao}+km_suspeito"


def build_fretes():
    if not FRETES_CSV.exists():
        extrair_fretes(FRETES_PDF, FRETES_CSV)
    mun, _ = _municipios()

    def lugar(s):
        nome, uf = split_uf(s)
        base = nome.split(" - ")[0]
        k = (norm_nome(base), uf)
        if k in mun:
            nome = mun[k][0] + nome[len(base):].title()
        else:
            nome = _titulo(nome)
        return nome, uf

    def sede(s):
        """(chave normalizada da sede, [lon, lat] ou None)."""
        nome, uf = split_uf(s)
        k = (norm_nome(nome.split(" - ")[0]), uf)
        k = SEDE_ALIAS.get(k, k)
        return k[0], (mun[k][1] if k in mun else None)

    linhas, meses = [], set()
    with open(FRETES_CSV, encoding="utf-8", newline="") as f:
        for r in csv.DictReader(f):
            meses.add(r["mes3"])
            o, uo = lugar(r["origem"])
            de, ud = lugar(r["destino"])
            km = int(r["km"]) if r["km"].strip().isdigit() else None
            (no, co), (nd, cd) = sede(r["origem"]), sede(r["destino"])
            reta = distancia_reta(co, cd) if co and cd else None
            atrib = r["atribuicao_origem"]
            if any(nome_colado(n, u, mun) for n, u in ((no, uo), (nd, ud))):
                atrib = "aprox"
            qual = qualidade_frete(atrib, km_suspeito(km, reta, mesma=no == nd))
            linhas.append([o, uo, de, ud, km, _num_br(r["rs_t_mes3"]), qual])
    (mes,) = meses
    mm, aa = mes.split("/")
    assert mm in MESES
    return {"mes": f"{mm}/20{aa}", "campos": ["origem", "uf_o", "destino", "uf_d", "km", "rs_t", "qualidade"],
            "linhas": linhas}


def _acesso():
    m = Manifest("multimodal")
    return min((i["acesso"] for i in m.items), default=dt.date.today().isoformat())


def fontes():
    a = _acesso()

    def f(nome, url, periodo, nota, licenca=LIC_GOV, tipo=None):
        d = {"nome": nome, "url": url, "periodo": periodo, "acesso": a, "licenca": licenca, "nota": nota}
        if tipo:
            d["tipo"] = tipo  # cadastro: registro de infraestrutura, sem número medido
        return d

    fonte = [
        f("Ministério dos Transportes / ONTL — BaseFerro (BIT)", ARQUIVOS[0][0], "abr/2024",
          "Só trechos em operação, unidos por sigla e operadora e simplificados.", tipo="cadastro"),
        f("ANTAQ — Instalações portuárias", ARQUIVOS[1][0], "06/05/2025",
          "Só Brasil; tipo como na fonte (ETC = 'Estação de transbordo de cargas'). Coordenadas da própria ANTAQ.",
          tipo="cadastro"),
        f("ANTT — SIADE, produção origem-destino", ARQUIVOS[2][0], "2025",
          "Toneladas úteis (TU) somadas no ano por estação de origem, estação de destino e produto; só pares "
          "com 50.000 t ou mais. Fertilizantes reúne adubos, cloreto de potássio, fosfato e ureia."),
        f("IBGE — Logística dos Transportes 2024, fluxos ferroviários O/D", ARQUIVOS[3][0], "2024",
          "Usado só para localizar as estações do SIADE no mapa (por nome e UF); quando não há correspondência, "
          "vale a sede do município.",
          licenca="Dados abertos IBGE: uso livre com citação da fonte", tipo="cadastro"),
        f("MDIC — Comex Stat, base bruta de exportações", ARQUIVOS[4][0], "jan/2025 a dez/2025",
          "Quilos líquidos por produto (código SH4), UF de origem da mercadoria, unidade da Receita Federal (URF) "
          "de despacho e via de transporte. A URF é a unidade onde ocorreu o despacho, não o ponto de entrada "
          "rodoviário."),
        f("CONAB — Boletim Logístico", ARQUIVOS[7][0], "ago/2026 (boletim de set/2026)",
          "Fretes rodoviários de grãos (R$/t) e distância (km), extraídos do PDF do boletim. Na origem "
          "aproximada, a rota foi atribuída por proximidade, porque o boletim traz a origem numa célula mesclada. "
          "Distância suspeita: a distância do boletim é menor que 0,9 vez ou maior que 3 vezes a linha reta entre "
          "as sedes dos municípios (ou origem e destino são o mesmo município); nessas rotas o R$/t·km não é "
          "calculado."),
    ]
    return fonte


def build():
    fonte = fontes()
    ferrovias = build_ferrovias()
    obj = {"fonte": fonte, "tipo": "medido", "ferrovias": ferrovias, "portos": build_portos(), "siade": build_siade(),
           "exportacao": build_exportacao(), "fretes": build_fretes()}
    OUT.mkdir(parents=True, exist_ok=True)
    p = OUT / "multimodal.json"
    p.write_text(json.dumps(obj, ensure_ascii=False, separators=SEP), encoding="utf-8")
    sz = {k: len(json.dumps(v, ensure_ascii=False, separators=SEP).encode()) for k, v in obj.items()}
    print(f"{p.relative_to(ROOT)}: {p.stat().st_size / 1e3:.0f} KB", {k: f"{v / 1e3:.0f} KB" for k, v in sz.items()})
    assert sz["ferrovias"] <= 400_000


# ---------- fetch ----------

def _cacert_serpro():
    """balanca.mdic.gov.br não envia o intermediário SERPRO: bundle do proxy + intermediário (AIA da GlobalSign)."""
    dest = RAW / "comex" / "cabundle_plus_serpro.pem"
    if dest.exists():
        return dest
    crt = baixar(SERPRO_AIA, RAW / "comex" / "serpro_int.crt")
    pem = subprocess.run(["openssl", "x509", "-inform", "DER", "-in", str(crt)], capture_output=True, text=True,
                         check=True).stdout
    base = CA_PROXY if CA_PROXY.exists() else Path("/etc/ssl/certs/ca-certificates.crt")
    dest.write_text(base.read_text() + "\n" + pem)
    return dest


def fetch():
    m = Manifest("multimodal")
    for url, rel, desc, periodo, comex in ARQUIVOS:
        dest = RAW / rel
        extra = () if dest.exists() or not comex else ("--cacert", str(_cacert_serpro()))
        baixar(url, dest, extra=extra)
        m.add(url, dest, desc, periodo=periodo, licenca=LIC_GOV)
    if not GPKG_FERR.exists():
        with zipfile.ZipFile(RAW / "logistica" / "detalhados" / "Fluxos_Ferroviarios.zip") as z:
            (n,) = [n for n in z.namelist() if n.endswith(".gpkg")]
            GPKG_FERR.parent.mkdir(parents=True, exist_ok=True)
            GPKG_FERR.write_bytes(z.read(n))
    if not FRETES_CSV.exists():
        extrair_fretes(FRETES_PDF, FRETES_CSV)
    m.add(ARQUIVOS[7][0], FRETES_CSV, "CONAB — fretes extraídos do Boletim Logístico set/2026 (derivado do PDF)",
          periodo="ago/2026", licenca=LIC_GOV)
    m.save()
    return m


# ---------- extrator CONAB (do protótipo graos_scripts/conab_fretes.py) ----------

def extrair_fretes(pdf_path, out_csv):
    """Tabelas 'Preços de fretes praticados em …' do Boletim Logístico → CSV. A célula de origem é mesclada e
    centralizada na vertical: as linhas são atribuídas às origens resolvendo grupos contíguos cujo centro coincide
    com a posição do texto da origem; sem solução exata, origem mais próxima e `aprox`."""
    import pdfplumber
    num = r"(\d{1,3}(?:\.\d{3})*,\d{2}|SI|-)"
    pct = r"(-?\d+(?:,\d+)?%|-|SI)"
    row_rx = re.compile(r"^(?:\d{1,2}\s+)?(.*?)\s+(\d{1,5})\s+" + num + r"\s+" + num + r"\s+" + num +
                        r"(?:\s+" + pct + r")?(?:\s+" + pct + r")?\s*$")
    uf_rx = re.compile(r"\([A-Z]{2}\)")
    orig_rx = re.compile(r"^(?:\d{1,2}\s+)?([A-ZÀ-Ü][A-ZÀ-Ü\s'\.-]+\([A-Z]{2}\))\s*$")
    rows_out = []
    state = {"tabela": "", "hdr": ("", "", ""), "last": None}

    def flush(seg):
        rows = [x for x in seg if x[0] == "row"]
        n = len(rows)
        if not n:
            return
        centers, ri = [], 0
        for x in seg:
            if x[0] == "row":
                if x[3]:
                    centers.append((x[3], ri))
                ri += 1
            else:
                centers.append((x[1], ri - 0.5))
        assign, best = [None] * n, None
        first_c = centers[0][1] if centers else n
        for b0 in range(0, int(first_c) + 1):
            b, ok = [b0], True
            for _, c in centers:
                nb = 2 * c + 1 - b[-1]
                if nb != int(nb) or nb <= b[-1]:
                    ok = False
                    break
                b.append(int(nb))
            if ok and b[-1] == n:
                best = b
                break
        if best is None:
            for i in range(n):
                if centers:
                    assign[i] = min(centers, key=lambda nc: abs(nc[1] - i))[0]
            flag = "aprox"
        else:
            for i in range(best[0]):
                assign[i] = state["last"]
            for k, (name, _) in enumerate(centers):
                for i in range(best[k], best[k + 1]):
                    assign[i] = name
            flag = "ok"
        if centers:
            state["last"] = centers[-1][0]
        for i, r in enumerate(rows):
            rows_out.append([r[4], state["tabela"], *state["hdr"], assign[i] or state["last"], r[1], *r[2], flag])

    with pdfplumber.open(pdf_path) as pdf:
        for pi, p in enumerate(pdf.pages):
            seg, in_tab = [], False
            for line in (p.extract_text() or "").split("\n"):
                line = line.strip()
                mt = re.search(r"Preços de fretes praticados (?:em|no|na|nos) ([A-Za-zÀ-ü ]+)", line)
                if mt:
                    state["tabela"] = re.sub(r"\s+\d+$", "", mt.group(1).strip())
                    state["last"] = None
                h = re.search(r"KM\s+(\w{3}/\d{2})\s+(\w{3}/\d{2})\s+(\w{3}/\d{2})", line)
                if h:
                    state["hdr"], in_tab, seg = h.groups(), True, []
                    continue
                if line.startswith("FONTE") or line.startswith("Nota"):
                    if in_tab:
                        flush(seg)
                        seg = []
                    in_tab = False
                    continue
                mr = row_rx.match(line)
                if mr and uf_rx.search(mr.group(1)):
                    label = mr.group(1)
                    ufs = list(uf_rx.finditer(label))
                    origin = None
                    if len(ufs) >= 2:
                        origin, dest = label[:ufs[0].end()].strip(), label[ufs[0].end():].strip()
                    else:
                        dest = label.strip()
                    seg.append(("row", dest, mr.groups()[1:], origin, pi + 1))
                    in_tab = True
                    continue
                mo = orig_rx.match(line)
                if mo and in_tab:
                    seg.append(("orig", mo.group(1).strip()))
            if in_tab and seg:
                flush(seg)
    Path(out_csv).parent.mkdir(parents=True, exist_ok=True)
    with open(out_csv, "w", newline="", encoding="utf-8") as fo:
        w = csv.writer(fo)
        w.writerow(["pagina", "tabela", "mes1", "mes2", "mes3", "origem", "destino", "km", "rs_t_mes1", "rs_t_mes2",
                    "rs_t_mes3", "var_ano", "var_mes", "atribuicao_origem"])
        w.writerows(rows_out)
    return out_csv


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "all"
    if cmd in ("fetch", "all"):
        fetch()
    if cmd in ("build", "all"):
        build()
