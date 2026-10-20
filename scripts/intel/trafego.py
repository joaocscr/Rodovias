"""Tráfego: VMDa 2023 (Infra S.A., modelado), acidentes PRF 2024+2025 (medido) e índice ABCR (medido).

Uso: python scripts/intel/trafego.py [fetch|build|all]

- `fetch()` baixa o que falta em data/raw/trafego/ e registra tudo (inclusive o que já existia, com a URL
  original) em data/manifest/trafego.json.
- `build()` gera data/intel/trafego.json (contrato em docs/superpowers/plans/2026-10-20-centro-inteligencia-v3.md).

Regras de junção com o SNV congelado (data/base/snv.json):
- VMDa: média ponderada pelo comprimento da sobreposição de km entre o trecho do SNV e os subtrechos de
  modelagem do mesmo código; sem sobreposição, média do código; código inexistente (mudou entre versões do
  SNV), BR+UF+km. Em físico com trechos coincidentes vale o registro de maior total. VMDa total 0 (fonte diz
  "não simulável") vira null: zero veículo/dia não é dado.
- PRF: BR+UF+km (tolerância de 2 km) se a coordenada está a <= 5 km do físico; senão, snap <= 500 m.
"""
import datetime as dt
import json
import sys
import urllib.parse
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from intel.fontes import Manifest, fetch as baixar  # noqa: E402
from intel.snvbase import ROOT, norm_br, snv  # noqa: E402

RAW = ROOT / "data" / "raw" / "trafego"
OUT = ROOT / "data" / "intel" / "trafego.json"

VMDA_LAYER = "https://geo.infrasa.gov.br/server/rest/services/Hosted/VMDa_2023/FeatureServer/3"
VMDA_FILE = RAW / "infrasa" / "vmda2023_data.json"
ABCR_URL = "https://melhoresrodovias.org.br/wp-content/uploads/2026/10/base_0926.xlsx"
ABCR_FILE = RAW / "abcr" / "base_0926.xlsx"
PRF_PAGINA = "https://www.gov.br/prf/pt-br/acesso-a-informacao/dados-abertos/dados-abertos-da-prf"
PRF_IDS = {  # DATATRAN agrupado por ocorrência (Google Drive, ZIP com um CSV)
    2024: "14lB0vqMFkaZj8HZ44b0njYgxs9nAN8KO",
    2025: "1-G3MdmHBt6CprDwcW99xxC4BZ2DU5ryR",
    2026: "1A3IirNm0AzRaSosA1IS94DOVmvKsn0Ol",  # jan-ago/2026, parcial: baixado, fora do bloco
}
ANOS = [2024, 2025]
ABCR_MESES = 120
PRF_KM_MAX_COORD = 5000.0  # m: coordenada deve cair a até 5 km do físico achado por BR+UF+km
PRF_SNAP_M = 500.0
PRF_KM_TOL = 2.0


def prf_zip(ano):
    return RAW / "prf" / f"datatran{ano}.zip"


def prf_csv(ano):
    return RAW / "prf" / f"x{ano}" / f"datatran{ano}.csv"


def prf_url(ano):
    return f"https://drive.google.com/uc?export=download&id={PRF_IDS[ano]}"


# ============================== fetch ==============================
def _arcgis_pagina(url, tries=5):
    """Uma página de query ArcGIS; o servidor oscila (reset, 5xx embutido em JSON), então repete com backoff."""
    import time
    tmp = RAW / "infrasa" / ".pagina.json"
    ultimo = None
    for k in range(tries):
        try:
            baixar(url, tmp, tries=1, timeout=120, force=True)
            d = json.loads(tmp.read_text(encoding="utf-8"))
            if "error" in d:
                raise RuntimeError(d["error"])
            return d
        except Exception as e:  # noqa: BLE001
            ultimo = e
            time.sleep(2 ** (k + 1))
    raise RuntimeError(f"falha em {url}: {ultimo}")


def fetch_vmda(dest=VMDA_FILE, page=2000):
    """Tabela `data` do VMDa 2023, paginada (maxRecordCount 2000), no formato {count, features}."""
    if dest.exists() and dest.stat().st_size > 0:
        return dest
    q = {"where": "1=1", "returnCountOnly": "true", "f": "json"}
    n = _arcgis_pagina(f"{VMDA_LAYER}/query?" + urllib.parse.urlencode(q))["count"]
    feats = []
    while len(feats) < n:
        q = {"where": "1=1", "outFields": "*", "returnGeometry": "false", "resultOffset": len(feats),
             "resultRecordCount": page, "orderByFields": "objectid", "f": "json"}
        fs = _arcgis_pagina(f"{VMDA_LAYER}/query?" + urllib.parse.urlencode(q)).get("features", [])
        if not fs:
            break
        feats += fs
    (RAW / "infrasa" / ".pagina.json").unlink(missing_ok=True)
    if len(feats) != n:
        raise RuntimeError(f"VMDa incompleto: {len(feats)} de {n}")
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps({"count": n, "features": feats}), encoding="utf-8")
    return dest


def fetch():
    """Baixa o que falta e registra no manifesto (arquivos já existentes entram com a URL original)."""
    mf = Manifest("trafego")
    fetch_vmda()
    mf.add(VMDA_LAYER, VMDA_FILE, "VMDa 2023 por subtrecho de modelagem (Leves/Pesados), tabela `data`, SNV 202401A",
           "2023", "Dados abertos Infra S.A.")
    baixar(ABCR_URL, ABCR_FILE)
    mf.add(ABCR_URL, ABCR_FILE, "Índice ABCR de fluxo de veículos pedagiados, série mensal 1999-set/2026", "1999-2026-09",
           "Divulgação pública ABCR (citar a fonte)")
    for ano in PRF_IDS:
        z = baixar(prf_url(ano), prf_zip(ano))
        if not prf_csv(ano).exists():
            with zipfile.ZipFile(z) as zf:
                nome = next(n for n in zf.namelist() if n.lower().endswith(".csv"))
                prf_csv(ano).parent.mkdir(parents=True, exist_ok=True)
                prf_csv(ano).write_bytes(zf.read(nome))
        mf.add(prf_url(ano), z, f"PRF DATATRAN {ano} agrupado por ocorrência (ZIP; página: {PRF_PAGINA})",
               str(ano) if ano < 2026 else "2026-01 a 2026-08 (parcial)", "CC BY-ND 3.0 (PRF, dados abertos)")
    mf.save()
    return mf.items


# ============================== VMDa ==============================
def _num(x):
    try:
        return float(str(x).replace(",", "."))
    except (TypeError, ValueError):
        return None


def vmda_segmentos(rows):
    """Linhas da tabela (atributos) → subtrechos de modelagem {cod, br, uf, ki, kf, L, P}.
    A tabela tem uma linha por categoria; as sem categoria/valor (trechos não modelados) são descartadas."""
    seg = {}
    for r in rows:
        if not r.get("vhr_categoria"):
            continue
        k = (r["vhr_codigo"], _num(r["flt_kminicialestim"]), _num(r["flt_kmfinalestim"]))
        s = seg.setdefault(k, {"cod": k[0], "br": norm_br(r["vhr_rodovia"]), "uf": r["vhr_uf"], "ki": k[1], "kf": k[2]})
        s["L" if r["vhr_categoria"] == "Leves" else "P"] = r["ftl_vmda"]
    return [s for s in seg.values() if s["ki"] is not None and s["kf"] is not None]


def media_ponderada(cands, ki, kf):
    """(L, P) médios dos subtrechos `cands` ponderados pela sobreposição com [ki, kf]; None sem sobreposição."""
    tot = l = p = 0.0
    for s in cands:
        ov = min(kf, s["kf"]) - max(ki, s["ki"])
        if ov > 0:
            tot += ov
            l += ov * (s.get("L") or 0)
            p += ov * (s.get("P") or 0)
    return (l / tot, p / tot) if tot > 0 else None


def _media_codigo(cands):
    tot = sum(s["kf"] - s["ki"] for s in cands) or 1
    return (sum((s["kf"] - s["ki"]) * (s.get("L") or 0) for s in cands) / tot,
            sum((s["kf"] - s["ki"]) * (s.get("P") or 0) for s in cands) / tot)


def vmda_por_fis(segs, s=None):
    """([l], [p]) com uma posição por físico do SNV (int ou None)."""
    s = s or snv()
    por_cod, por_bruf = {}, {}
    for g in segs:
        por_cod.setdefault(g["cod"], []).append(g)
        por_bruf.setdefault((g["br"], g["uf"]), []).append(g)
    por_trecho = []
    for t in s.trechos:
        v = None
        if t["codigo"] in por_cod:
            v = media_ponderada(por_cod[t["codigo"]], t["km_ini"], t["km_fim"]) or _media_codigo(por_cod[t["codigo"]])
        else:
            v = media_ponderada(por_bruf.get((t["br"], t["uf"]), []), t["km_ini"], t["km_fim"])
        por_trecho.append(v)
    L, P = [], []
    for f in s.fis:
        melhor = None
        for ti in f["r"]:
            v = por_trecho[ti]
            if v and (melhor is None or v[0] + v[1] > melhor[0] + melhor[1]):
                melhor = v
        if melhor and round(melhor[0]) + round(melhor[1]) > 0:
            L.append(round(melhor[0]))
            P.append(round(melhor[1]))
        else:
            L.append(None)
            P.append(None)
    return L, P


def build_vmda():
    rows = [f["attributes"] for f in json.loads(VMDA_FILE.read_text(encoding="utf-8"))["features"]]
    l, p = vmda_por_fis(vmda_segmentos(rows))
    return {"tipo": "modelado", "ano": 2023, "base_snv": "202401A", "l": l, "p": p}


# ============================== PRF ==============================
def prf_num(x):
    """'146,1' → 146.1; 'NA'/vazio → None."""
    if x is None:
        return None
    x = str(x).strip()
    if x in ("", "NA", "nan"):
        return None
    try:
        return float(x.replace(",", "."))
    except ValueError:
        return None


def _trecho_por_km(s, br, uf, km):
    """Trecho do SNV por BR+UF+km: o que contém o km (eixo principal e menor extensão primeiro); senão o de
    ponta mais próxima até PRF_KM_TOL."""
    c = s.by_br_uf.get((br, uf))
    if not c or km is None:
        return None
    T = s.trechos
    dentro = [i for i in c if T[i]["km_ini"] - 1e-6 <= km <= T[i]["km_fim"] + 1e-6]
    if dentro:
        return min(dentro, key=lambda i: (T[i]["codigo"][3] != "B", T[i]["km_fim"] - T[i]["km_ini"]))
    d, i = min((min(abs(km - T[i]["km_ini"]), abs(km - T[i]["km_fim"])), i) for i in c)
    return i if d <= PRF_KM_TOL else None


def prf_fis(df, s=None):
    """Atribui um físico a cada ocorrência (lista de int|None, alinhada ao df com colunas br, uf, km, lat, lon)."""
    import numpy as np
    import shapely
    s = s or snv()
    n = len(df)
    por_km = [None] * n
    cache = {}
    for i, (br, uf, km) in enumerate(zip(df["br"], df["uf"], df["km"])):
        k = (br, uf, km)
        if k not in cache:
            ti = _trecho_por_km(s, br, uf, km) if br else None
            cache[k] = s.trechos[ti]["fis"] if ti is not None else None
        por_km[i] = cache[k]
    lat, lon = df["lat"].to_numpy(float), df["lon"].to_numpy(float)
    coord = (np.isfinite(lat) & np.isfinite(lon) & (lat > -34) & (lat < 6) & (lon > -75) & (lon < -28))
    x = np.full(n, np.nan)
    y = np.full(n, np.nan)
    if coord.any():
        x[coord], y[coord] = s.to_m(lon[coord], lat[coord])
    geoms = np.array(s._geo[1], dtype=object)
    dist = np.full(n, np.nan)
    idx = np.array([j is not None and coord[i] for i, j in enumerate(por_km)])
    if idx.any():
        pts = shapely.points(x[idx], y[idx])
        dist[idx] = shapely.distance(pts, geoms[[por_km[i] for i in np.flatnonzero(idx)]])
    out = []
    for i in range(n):
        j = por_km[i]
        if j is not None and (not coord[i] or dist[i] <= PRF_KM_MAX_COORD):
            out.append(int(j))
        elif coord[i]:
            f, _ = s.snap(float(lon[i]), float(lat[i]), max_m=PRF_SNAP_M)
            out.append(f)
        else:
            out.append(None)
    return out


def prf_ler(ano):
    import pandas as pd
    df = pd.read_csv(prf_csv(ano), sep=";", encoding="latin-1", dtype=str, keep_default_na=False)
    r = pd.DataFrame({
        "br": [norm_br(b) if b not in ("", "NA") else "" for b in df["br"]],
        "uf": df["uf"],
        "km": [prf_num(k) for k in df["km"]],
        "lat": [prf_num(v) if prf_num(v) is not None else float("nan") for v in df["latitude"]],
        "lon": [prf_num(v) if prf_num(v) is not None else float("nan") for v in df["longitude"]],
    })
    for dst, src in (("m", "mortos"), ("fg", "feridos_graves"), ("fl", "feridos_leves")):
        r[dst] = [int(prf_num(v) or 0) for v in df[src]]
    r["ano"] = df["data_inversa"].str[:4].astype(int)
    return r


def build_acidentes(anos=ANOS):
    import pandas as pd
    s = snv()
    df = pd.concat([prf_ler(a) for a in anos], ignore_index=True)
    df["fis"] = prf_fis(df, s)
    n, m, fg, fl = ([0] * s.n for _ in range(4))
    for j, mm, g, l in zip(df["fis"], df["m"], df["fg"], df["fl"]):
        if j is None or j != j:
            continue
        j = int(j)
        n[j] += 1
        m[j] += int(mm)
        fg[j] += int(g)
        fl[j] += int(l)
    return {"tipo": "medido", "anos": list(anos), "n": n, "m": m, "fg": fg, "fl": fl}


# ============================== ABCR ==============================
def build_abcr(meses=ABCR_MESES):
    """Brasil, série "(C) Original" (índice 1999=100), colunas B-D (leves, pesados, total), últimos `meses` meses."""
    import openpyxl
    ws = openpyxl.load_workbook(ABCR_FILE, data_only=True, read_only=True)["(C) Original"]
    linhas = [r for r in ws.iter_rows(min_row=4, max_col=4, values_only=True)
              if isinstance(r[0], dt.datetime) and all(isinstance(v, (int, float)) for v in r[1:4])]
    linhas = sorted(linhas, key=lambda r: r[0])[-meses:]
    return {"meses": [r[0].strftime("%Y-%m") for r in linhas],
            "leves": [round(float(r[1]), 1) for r in linhas],
            "pesados": [round(float(r[2]), 1) for r in linhas],
            "total": [round(float(r[3]), 1) for r in linhas]}


# ============================== bloco ==============================
def _acesso(url):
    for i in Manifest("trafego").items:
        if i["url"] == url:
            return i["acesso"]
    return dt.date.today().isoformat()


def fontes():
    return [
        {"nome": "Infra S.A. / DNIT — VMDa 2023 (volume médio diário anual modelado, Leves e Pesados)",
         "url": VMDA_LAYER, "periodo": "2023 (SNV 202401A)", "acesso": _acesso(VMDA_LAYER),
         "licenca": "Dados abertos Infra S.A.", "tipo": "modelado",
         "nota": "Estimativa modelada por subtrecho, não contagem. Junção por código SNV e km ponderado, com "
                 "fallback BR+UF+km; coincidentes = maior total; total 0 (não simulável) e trechos fora do "
                 "modelo ficam sem valor (null)."},
        {"nome": "PRF — DATATRAN, acidentes por ocorrência", "url": PRF_PAGINA, "periodo": "2024 e 2025 (anos completos)",
         "acesso": _acesso(prf_url(2025)), "licenca": "CC BY-ND 3.0 (PRF, dados abertos)", "tipo": "medido",
         "nota": "Totais somados de 2024 e 2025; 2026 (parcial) fora. Físico por BR+UF+km se a coordenada está a "
                 "até 5 km, senão snap até 500 m; ocorrências sem físico (cerca de 1%) não entram."},
        {"nome": "ABCR — Índice ABCR de fluxo de veículos pedagiados (série original, Brasil)", "url": ABCR_URL,
         "periodo": "2016-10 a 2026-09", "acesso": _acesso(ABCR_URL), "licenca": "Divulgação pública ABCR (citar a fonte)",
         "tipo": "medido", "nota": "Número-índice 1999=100 em praças de pedágio; mede variação, não volume. "
                                   "Leves, pesados e total."},
    ]


def build(write=True):
    d = {"fonte": fontes(), "vmda": build_vmda(), "acidentes": build_acidentes(), "abcr": build_abcr()}
    if write:
        OUT.parent.mkdir(parents=True, exist_ok=True)
        OUT.write_text(json.dumps(d, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    return d


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "all"
    if cmd in ("fetch", "all"):
        fetch()
    if cmd in ("build", "all"):
        d = build()
        print(f"{OUT.relative_to(ROOT)}: {OUT.stat().st_size / 1024:.0f} KB")
