import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import build  # noqa: E402

BASE = ROOT / "data" / "base"


def grab(html, name):
    i = html.index(f"window.{name}=") + len(f"window.{name}=")
    return json.JSONDecoder().raw_decode(html, i)[0]


def test_base_existe_e_coerente():
    snv = json.loads((BASE / "snv.json").read_text(encoding="utf-8"))
    conc = json.loads((BASE / "conc.json").read_text(encoding="utf-8"))
    assert snv["versao"] == "202607A"
    assert len(snv["trechos"]) == 7673 and len(snv["fis"]) == 6815
    assert all(0 <= t[15] < len(snv["fis"]) for t in snv["trechos"])
    assert len(conc["entFis"]) == len(conc["entidades"])


def test_build_pela_base_reproduz_payloads(tmp_path):
    out = tmp_path / "m.html"
    build.build_from_base(BASE, out, intel={})
    html = out.read_text(encoding="utf-8")
    assert grab(html, "SNV") == json.loads((BASE / "snv.json").read_text(encoding="utf-8"))
    assert grab(html, "CONC") == json.loads((BASE / "conc.json").read_text(encoding="utf-8"))
    assert grab(html, "INTEL") == {}
    assert "/*__" not in html
