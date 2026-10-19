import sys
from pathlib import Path
import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
from snv import load_records, group_physical, check_group_consistency, simplify, encode_line, build_payload  # noqa: E402

RAW = ROOT / "data" / "raw" / "SNV_202607A.shp"
needs_raw = pytest.mark.skipif(not RAW.exists(), reason="dado bruto ausente")


def rec(codigo, desc_coinc, ds_coinc, br="010", **kw):
    r = {"vl_codigo": codigo, "desc_coinc": desc_coinc, "ds_coinc": ds_coinc, "vl_br": br,
         "sg_uf": "DF", "ds_legenda": "Duplicada", "ds_tipo_ad": "Federal", "ds_jurisdi": "Federal",
         "vl_extensa": 1.0, "points": [(0.0, 0.0), (1.0, sum(map(ord, codigo)) / 1000)]}
    r.update(kw)
    return r


def test_group_coincident():
    recs = [rec("010BDF0010", "Coinc", "010BDF0010;020BDF0010", br="010"),
            rec("020BDF0010", "Coinc", "020BDF0010;010BDF0010", br="020"),
            rec("040BDF0010", "-", "", br="040")]
    assert group_physical(recs) == [[0, 1], [2]]


def test_group_principal_without_coinc_flag():
    # O registro principal vem com desc_coinc "-", mas o mesmo ds_coinc dos secundários.
    recs = [rec("010BDF0010", "-", "010BDF0010;020BDF0010;030BDF0010", br="010"),
            rec("020BDF0010", "Coinc", "010BDF0010;020BDF0010;030BDF0010", br="020"),
            rec("030BDF0010", "Coinc", "010BDF0010;020BDF0010;030BDF0010", br="030")]
    assert group_physical(recs) == [[0, 1, 2]]


def test_group_inconsistent_ds_coinc_merged_by_geometry():
    line = [(-44.0, -19.0), (-44.1, -19.1)]
    recs = [rec("050BMG0250", "-", "050BMG0250;455BMG0007", br="050", points=line),
            rec("455BMG0007", "Coinc", "050BMG0250;050NMG1020;455BMG0007", br="455", points=line),
            rec("050NMG1020", "Coinc", "050NMG1020;455BMG0007", br="050", points=list(reversed(line))),
            rec("040BMG0010", "-", "", br="040")]
    assert sorted(map(sorted, group_physical(recs))) == [[0, 1, 2], [3]]


def test_group_sorted_by_br():
    recs = [rec("020BDF0010", "Coinc", "020BDF0010;010BDF0010", br="020"),
            rec("010BDF0010", "Coinc", "010BDF0010;020BDF0010", br="010")]
    assert group_physical(recs) == [[1, 0]]


def test_consistency_warns_on_mismatch():
    recs = [rec("a", "Coinc", "a;b", br="010"), rec("b", "Coinc", "b;a", br="020", ds_legenda="Pavimentada")]
    assert check_group_consistency(recs, group_physical(recs)) != []


def test_simplify_keeps_two_points():
    assert len(simplify([(0, 0)], 0.01)) == 2
    assert len(simplify([(0, 0), (0.00001, 0)], 0.01)) == 2
    assert simplify([(0, 0), (1, 0.0001), (2, 0)], 0.001) == [(0, 0), (2, 0)]
    assert simplify([(0, 0), (1, 1), (2, 0)], 0.001) == [(0, 0), (1, 1), (2, 0)]


def test_encode_line_roundtrip():
    assert encode_line([(-47.12345, -15.5), (-47.12245, -15.4999)]) == [-4712345, -1550000, 100, 10]


def test_build_payload_shape():
    recs = [rec("010BDF0010", "Coinc", "010BDF0010;020BDF0010", br="010", vl_extensa=10.0),
            rec("020BDF0010", "Coinc", "020BDF0010;010BDF0010", br="020", vl_extensa=10.0),
            rec("040BDF0010", "-", "", br="040", vl_extensa=5.0, ds_legenda="Pavimentada")]
    for r in recs:
        r.update(nm_tipo_tr="Eixo Principal", ds_superfi="PAV", ul="Brasília", vl_km_inic=0.0,
                 vl_km_fina=r["vl_extensa"], ds_local_i="A", ds_local_f="B", est_coinc="", sup_est_co="")
    p = build_payload(recs, group_physical(recs), 0.0005)
    assert p["dict"]["br"] == ["010", "020", "040"]
    assert len(p["trechos"]) == 3 and len(p["fis"]) == 2
    assert p["fis"][0]["r"] == [0, 1] and p["fis"][0]["ext"] == 10.0
    t = p["trechos"][2]
    assert t[0] == "040BDF0010" and p["dict"]["br"][t[1]] == "040" and t[15] == 1
    assert p["dict"]["situacao"][t[4]] == "Pavimentada"


@needs_raw
def test_real_data_totals():
    recs = load_records(str(RAW))
    groups = group_physical(recs)
    assert len(recs) == 7673 and len(groups) == 6815
    assert round(sum(r["vl_extensa"] for r in recs), 1) == 131690.7
    assert round(sum(recs[g[0]]["vl_extensa"] for g in groups), 1) == 122394.9
    assert check_group_consistency(recs, groups) == []
    assert any("BRASÍLIA" in r["ds_local_i"] for r in recs)
    assert all(len(r["points"]) >= 1 for r in recs)


UFS = {"AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR",
       "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"}


def _coords(geom):
    polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
    return [pt for poly in polys for ring in poly for pt in ring]


def test_ufs_geojson():
    import json
    path = ROOT / "data" / "ufs.geojson"
    assert path.stat().st_size < 1.5e6
    fc = json.loads(path.read_text(encoding="utf-8"))
    assert len(fc["features"]) == 27
    assert {f["properties"]["sigla"] for f in fc["features"]} == UFS
    for f in fc["features"]:
        pts = _coords(f["geometry"])
        lon, lat = f["properties"]["label"]
        assert min(p[0] for p in pts) <= lon <= max(p[0] for p in pts)
        assert min(p[1] for p in pts) <= lat <= max(p[1] for p in pts)


def test_vendor_assets():
    for rel in ["leaflet/leaflet.js", "leaflet/leaflet.css", "fonts/inter-latin-400.woff2",
                "fonts/inter-latin-600.woff2", "fonts/hind-latin-500.woff2", "fonts/hind-latin-700.woff2"]:
        assert (ROOT / "vendor" / rel).stat().st_size > 0, rel


@needs_raw
def test_build_output(tmp_path):
    import re
    import subprocess
    out = tmp_path / "mapa.html"
    res = subprocess.run([sys.executable, str(ROOT / "scripts" / "build.py"), "--shp", str(RAW),
                          "--out", str(out)], capture_output=True, text=True)
    assert res.returncode == 0, res.stderr
    assert "122.394,9" in res.stdout
    html = out.read_text(encoding="utf-8")
    assert out.stat().st_size < 15e6
    assert "window.SNV=" in html
    markup = re.sub(r"<script>.*?</script>", "", html, flags=re.S)
    assert not re.search(r"""(src|href)\s*=\s*["']https?:""", markup)
    assert not re.search(r"""url\(\s*["']?https?:""", html)
    assert "/*__" not in html
