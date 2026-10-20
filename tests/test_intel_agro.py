import json
import math
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
from intel import agro  # noqa: E402

MUN = ROOT / "data" / "intel" / "municipios.json"
AGRO = ROOT / "data" / "intel" / "agro.json"
RAW = ROOT / "data" / "raw" / "graos"
CAMPOS_FONTE = {"nome", "url", "periodo", "acesso", "licenca", "nota"}


@pytest.fixture(scope="module")
def mun():
    return json.loads(MUN.read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def ag():
    return json.loads(AGRO.read_text(encoding="utf-8"))


# ---------- funções puras ----------

def test_sidra_num():
    assert agro.sidra_num("2343000") == (2343000, 0)
    assert agro.sidra_num("-") == (0, 0)
    assert agro.sidra_num("...") == (None, 0)
    assert agro.sidra_num("X") == (None, 1)
    assert agro.sidra_num(None) == (None, 0)


def test_comex_mun_to_ibge():
    assert agro.comex_mun_to_ibge("5318805") == "5218805"  # Rio Verde (GO 53→52)
    assert agro.comex_mun_to_ibge("3450308") == "3550308"  # São Paulo (SP 34→35)
    assert agro.comex_mun_to_ibge("5202704") == "5002704"  # Campo Grande (MS 52→50)
    assert agro.comex_mun_to_ibge("5400108") == "5300108"  # Brasília (DF 54→53)
    assert agro.comex_mun_to_ibge("5107925") == "5107925"  # MT inalterado


def test_quantize_ring_ida_e_volta():
    tr = {"scale": [0.001, 0.002], "translate": [-74.0, -34.0]}
    ring = [(-55.0, -13.0), (-54.9, -13.0), (-54.9, -12.9), (-55.0, -13.0)]
    arc = agro.quantize_ring(ring, tr)
    x = y = 0
    pts = []
    for dx, dy in arc:
        x += dx
        y += dy
        pts.append((x * 0.001 - 74.0, y * 0.002 - 34.0))
    for (a, b), (c, d) in zip(pts, ring):
        assert abs(a - c) < 1e-9 and abs(b - d) < 1e-9


def test_prune_arcs_reindexa():
    topo = {"arcs": [[[0, 0]], [[1, 1]], [[2, 2]], [[3, 3]]],
            "objects": {"mun": {"type": "GeometryCollection", "geometries": [
                {"type": "Polygon", "arcs": [[0, ~2]]},
                {"type": "MultiPolygon", "arcs": [[[2]], [[3, ~0]]]}]}}}
    agro.prune_arcs(topo)
    assert topo["arcs"] == [[[0, 0]], [[2, 2]], [[3, 3]]]
    g = topo["objects"]["mun"]["geometries"]
    assert g[0]["arcs"] == [[0, ~1]]
    assert g[1]["arcs"] == [[[1]], [[2, ~0]]]


# ---------- municipios.json ----------

def test_municipios_ids(mun):
    ids = mun["ids"]
    assert len(ids) == 5571 and len(set(ids)) == 5571
    assert ids == sorted(ids)
    assert "5101837" in ids and "5107925" in ids
    for k in ("nomes", "uf", "centro"):
        assert len(mun[k]) == 5571
    i = ids.index("5101837")
    assert mun["nomes"][i] == "Boa Esperança do Norte" and mun["uf"][i] == "MT"
    lon, lat = mun["centro"][i]
    assert abs(lon - -55.018) < 0.1 and abs(lat - -13.480) < 0.1
    assert mun["nomes"][ids.index("5107925")] == "Sorriso"


def test_topojson_valido(mun):
    topo = mun["topo"]
    assert topo["type"] == "Topology" and set(topo["objects"]) == {"mun"}
    n = len(topo["arcs"])
    geoms = topo["objects"]["mun"]["geometries"]
    assert [g["properties"]["id"] for g in geoms] == mun["ids"]

    def rings(g):
        return g["arcs"] if g["type"] == "Polygon" else [r for p in g["arcs"] for r in p]

    usados = set()
    for g in geoms:
        assert g["type"] in ("Polygon", "MultiPolygon")
        for ring in rings(g):
            assert ring
            for a in ring:
                k = a if a >= 0 else ~a
                assert 0 <= k < n
                usados.add(k)
    assert usados == set(range(n))  # sem arcos órfãos


def _area_km2(topo, gid):
    sx, sy = topo["transform"]["scale"]
    tx, ty = topo["transform"]["translate"]

    def arc_pts(k):
        a = topo["arcs"][k if k >= 0 else ~k]
        x = y = 0
        pts = []
        for dx, dy in a:
            x += dx
            y += dy
            pts.append((x * sx + tx, y * sy + ty))
        return pts if k >= 0 else pts[::-1]

    g = next(g for g in topo["objects"]["mun"]["geometries"] if g["properties"]["id"] == gid)
    polys = [g["arcs"]] if g["type"] == "Polygon" else g["arcs"]
    tot = 0.0
    for poly in polys:
        for j, ring in enumerate(poly):
            pts = []
            for k in ring:
                p = arc_pts(k)
                pts += p if not pts else p[1:]
            s = sum(x1 * y2 - x2 * y1 for (x1, y1), (x2, y2) in zip(pts, pts[1:] + pts[:1])) / 2
            lat = sum(p[1] for p in pts) / len(pts)
            a = abs(s) * 111.32 ** 2 * math.cos(math.radians(lat))
            tot += a if j == 0 else -a
    return tot


def test_poligonos_mt_2025(mun):
    topo = mun["topo"]
    assert 4200 < _area_km2(topo, "5101837") < 5200   # BEN 4.704 km²
    assert 7600 < _area_km2(topo, "5107925") < 9300   # Sorriso 2025: 8.455 km² (antes 9.294)
    assert 7800 < _area_km2(topo, "5106240") < 9600   # Nova Ubiratã 8.721 km²


def test_municipios_tamanho():
    assert MUN.stat().st_size <= 1.8e6


def test_fonte_municipios(mun):
    fontes = mun["fonte"] if isinstance(mun["fonte"], list) else [mun["fonte"]]
    assert fontes and all(CAMPOS_FONTE <= set(f) for f in fontes)


# ---------- agro.json ----------

def test_agro_formato(ag, mun):
    assert ag["ids"] == mun["ids"] and ag["ano"] == 2025 and ag["tipo"] == "medido"
    assert set(ag["produtos"]) == {"soja", "milho1", "milho2", "cana", "algodao", "trigo", "cafe"}
    for v in ag["produtos"].values():
        assert len(v) == 5571 and all(x is None or (isinstance(x, int) and x >= 0) for x in v)
    fontes = ag["fonte"] if isinstance(ag["fonte"], list) else [ag["fonte"]]
    assert fontes and all(CAMPOS_FONTE <= set(f) for f in fontes)


def test_soja_2025(ag):
    soja = ag["produtos"]["soja"]
    assert 160e6 <= sum(x or 0 for x in soja) <= 170e6
    assert soja[ag["ids"].index("5107925")] == 2343000
    assert soja[ag["ids"].index("5101837")] == 972000


def test_milho_safras(ag):
    p = ag["produtos"]
    m1, m2 = sum(x or 0 for x in p["milho1"]), sum(x or 0 for x in p["milho2"])
    assert 20e6 < m1 < 32e6 and 105e6 < m2 < 125e6


def test_armazenagem(ag):
    a = ag["armazenagem"]
    assert a["periodo"] == "2º sem/2025"
    assert len(a["cap"]) == len(a["sigilo"]) == 5571
    tot = sum(x or 0 for x in a["cap"])
    assert 180e6 <= tot <= 210.5e6
    assert all(s in (0, 1) for s in a["sigilo"])
    assert all(c is None for c, s in zip(a["cap"], a["sigilo"]) if s == 1)
    assert sum(a["sigilo"]) > 500  # 851 municípios com capacidade total em sigilo
    assert a["cap"][ag["ids"].index("5107925")] == 5791707


@pytest.mark.skipif(not RAW.exists(), reason="sem data/raw/graos")
def test_manifesto_agro():
    m = json.loads((ROOT / "data" / "manifest" / "agro.json").read_text(encoding="utf-8"))
    assert all(i["url"].startswith("http") and i["sha256"] for i in m)
    assert any(i["arquivo"].endswith("br_mun_minima.topojson") for i in m)
