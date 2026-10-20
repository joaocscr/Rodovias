import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
from intel.snvbase import decode_line, encode_line, norm_br, snv  # noqa: E402


def test_codec_ida_e_volta():
    pts = [(-47.85885, -15.68816), (-47.85415, -15.68717), (-47.83735, -15.6818)]
    assert decode_line(encode_line(pts)) == pts


def test_norm_br():
    assert norm_br("BR-040") == norm_br("40") == norm_br(40) == norm_br("BR-040/MG") == "040"


def test_find_km_e_fis():
    s = snv()
    j = s.fis_of_km("BR-163", "MT", 300.0)
    assert j is not None
    t = s.main_trecho(j)
    assert t["br"] in {r["br"] for r in (s.trechos[i] for i in s.fis[j]["r"])}


def test_snap_coordenada_no_trecho_certo():
    s = snv()
    # Ponto sobre o 1º vértice do 1º físico: distância ~0 e o próprio físico.
    lon, lat = s.points(0)[0]
    j, d = s.snap(lon, lat, max_m=50)
    assert j == 0 and d < 1
    assert s.snap(-30.0, -10.0, max_m=500) == (None, None)  # no oceano
