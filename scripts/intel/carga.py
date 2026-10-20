"""Carga agrícola modelada: PNL 2035, cenário-base (ano-base 2017), carregamento por link → físicos do SNV.

O shapefile do cenário traz, por link da rede multimodal do PNL, as toneladas (`TO_*`) e os veículos (`V_*`)
alocados pelo modelo de rede. Aqui o link rodoviário (`GTYPE` = 1) mais próximo de 3 pontos de cada físico
(25/50/75% do comprimento) empresta seu valor ao físico: valor = mediana dos 3 links; só vale se a mediana das
3 distâncias for ≤ 100 m. Físicos planejados (`PLA`) ficam sem valor: os links do PNL que coincidem com o traçado
planejado são estradas estaduais existentes, não o trecho federal.

    python scripts/intel/carga.py [fetch|build|all]
"""
import datetime as dt
import glob
import json
import sys
import zipfile
from collections import namedtuple
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import numpy as np  # noqa: E402

from intel.fontes import RAW, ROOT, Manifest, fetch as _fetch  # noqa: E402
from intel.snvbase import snv  # noqa: E402

URL = "https://ontl.infrasa.gov.br/wp-content/uploads/2024/05/Cenario-base-PNL00M2017.zip"
DIR = RAW / "graos" / "multimodal"
ZIP = DIR / "pnl2035_cenario_base.zip"
EXTRAIDO = DIR / "x_pnl2035_cenario_base"
OUT = ROOT / "data" / "intel" / "carga.json"

MAX_M = 100  # distância máxima (mediana dos 3 pontos) para aceitar o casamento
PONTOS = (0.25, 0.5, 0.75)
DIAS = 365  # V_TOTAL__1 é anual (média ~31 t por veículo de carga); o contrato guarda veíc./dia
G_RODOVIARIO = 1
CAMPOS = ("GTYPE", "TO_GSA", "TO_TOTAL_2", "V_TOTAL__1")  # nomes truncados do .dbf
BRASIL = (-76.0, -35.0, -27.0, 7.0)  # lon/lat mín/máx: descarta links internacionais antes de projetar

Links = namedtuple("Links", "geoms tree gsa total veic")


def fetch():
    """Garante o zip bruto (não rebaixa se já existe) e o registra no manifesto."""
    dest = _fetch(URL, ZIP)
    m = Manifest("carga")
    m.add(URL, dest, "PNL 2035, cenário-base 2017 (shapefile com carregamento por link + dicionário de dados)",
          periodo="2017 (cenário-base do PNL 2035)",
          licenca="Dado público da ONTL/Infra S.A.; licença não declarada na fonte")
    m.save()
    return dest


def find_shp():
    """Caminho do .shp extraído; extrai do zip se preciso. O nome da pasta tem acento (encoding variável): usa glob."""
    achados = glob.glob(str(EXTRAIDO / "*" / "PNL00M2017.shp"))
    if not achados:
        with zipfile.ZipFile(ZIP) as z:
            z.extractall(EXTRAIDO)
        achados = glob.glob(str(EXTRAIDO / "*" / "PNL00M2017.shp"))
    return achados[0]


def mediana_int(valores):
    return int(round(float(np.median(valores))))


def load_links(shp):
    """Links rodoviários no Brasil, em EPSG:5880 (m), com STRtree e os 3 atributos. Lê só os campos necessários."""
    import shapefile
    import shapely
    from pyproj import Transformer
    from shapely.strtree import STRtree

    xs, ys, ids, gsa, tot, veic = [], [], [], [], [], []
    r = shapefile.Reader(shp)
    recs = r.iterRecords(fields=list(CAMPOS))
    k = 0
    for i, rec in enumerate(recs):
        if int(rec["GTYPE"]) != G_RODOVIARIO:
            continue
        try:
            shp_ = r.shape(i)
            pts = shp_.points
            x0, y0, x1, y1 = shp_.bbox
        except Exception:  # 9 shapes vazios no arquivo
            continue
        if len(pts) < 2 or x1 < BRASIL[0] or x0 > BRASIL[2] or y1 < BRASIL[1] or y0 > BRASIL[3]:
            continue
        xs.extend(p[0] for p in pts)
        ys.extend(p[1] for p in pts)
        ids.extend([k] * len(pts))
        gsa.append(rec["TO_GSA"])
        tot.append(rec["TO_TOTAL_2"])
        veic.append(rec["V_TOTAL__1"])
        k += 1
    tr = Transformer.from_crs(4674, 5880, always_xy=True)  # SIRGAS 2000 geográfico → polocônica Brasil
    px, py = tr.transform(np.array(xs), np.array(ys))
    coords = np.column_stack([px, py])
    geoms = list(shapely.linestrings(coords, indices=np.array(ids)))
    return Links(geoms, STRtree(geoms), np.array(gsa, float), np.array(tot, float), np.array(veic, float))


def match_fis(links, s, j):
    """Valor do PNL para o físico j: mediana dos 3 links mais próximos; dist_m = mediana das 3 distâncias (int, m)."""
    g = s.geom_m(j)
    dist, idx = [], []
    for t in PONTOS:
        p = g.interpolate(t, normalized=True)
        i = int(links.tree.nearest(p))
        dist.append(links.geoms[i].distance(p))
        idx.append(i)
    return {"gsa": mediana_int(links.gsa[idx]), "total": mediana_int(links.total[idx]),
            "veic": mediana_int(links.veic[idx] / DIAS), "dist_m": mediana_int(dist)}


def _fonte():
    acesso = dt.date.today().isoformat()
    for i in Manifest("carga").items:
        if i["url"] == URL:
            acesso = i["acesso"]
    return {
        "nome": "ONTL/Infra S.A. — PNL 2035, Cenário-base PNL00M2017 (carregamento por link)",
        "url": URL,
        "periodo": "ano-base 2017 (cenário-base do PNL 2035)",
        "acesso": acesso,
        "licenca": "Dado público da ONTL/Infra S.A.; licença não declarada na fonte",
        "nota": ("Carregamento MODELADO (alocação da carga na rede) do PNL 2035, cenário-base com ano-base 2017; não é "
                 "contagem. Granel sólido agrícola e carga total são dados em toneladas por ano; os veículos de carga "
                 "por dia vêm do valor anual dividido por 365 (cerca de 31 t por veículo). O dicionário de dados da "
                 "fonte não informa a periodicidade nem se cada link já soma os dois sentidos; os valores foram tratados "
                 "como t/ano. Cada trecho recebeu a mediana dos valores dos links rodoviários mais próximos em 3 pontos "
                 "(a 25%, 50% e 75% do comprimento) e só tem valor quando a mediana das distâncias é de até 100 m. "
                 "Trechos planejados (ainda não implantados) e trechos sem link correspondente ficam sem valor."),
    }


def build():
    s = snv()
    links = load_links(find_shp())
    out = {k: [] for k in ("gsa", "total", "veic", "dist_m")}
    for j in range(s.n):
        r = match_fis(links, s, j)
        pla = s.main_trecho(j)["superficie"] == "PLA"
        if pla or r["dist_m"] > MAX_M:
            r = dict.fromkeys(out)
        for k in out:
            out[k].append(r[k])
    doc = {"fonte": [_fonte()], "tipo": "modelado", "ano_base": 2017, "cenario": "PNL 2035 base", **out}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    n = sum(v is not None for v in out["gsa"])
    print(f"{OUT.relative_to(ROOT)}: {n}/{s.n} físicos com valor")
    return doc


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "all"
    if cmd in ("fetch", "all"):
        fetch()
    if cmd in ("build", "all"):
        build()
