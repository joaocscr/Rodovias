import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import build  # noqa: E402
import roadshow  # noqa: E402
import verificacao  # noqa: E402

BASE = ROOT / "data" / "base"
ROADSHOW = ROOT / "data" / "roadshow"


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
    base = roadshow.curados(json.loads((BASE / "conc.json").read_text(encoding="utf-8")), ROADSHOW)
    conc = verificacao.aplicar(base, verificacao.carregar(), verificacao.carregar_aliases())
    assert grab(html, "CONC") == conc
    assert grab(html, "INTEL") == {}
    assert "/*__" not in html


def test_curados_releem_mercado_e_regulatorio(tmp_path):
    # data/roadshow/*.json é a fonte única de `mercado` e `regulatorio`: a cópia da base congelada não vale
    (tmp_path / "mercado.json").write_text(json.dumps({"abdib": {"serie": []}}), encoding="utf-8")
    (tmp_path / "regulatorio.json").write_text(json.dumps({"diagramas": []}), encoding="utf-8")
    base = {"entidades": [1], "mercado": {"velho": 1}, "regulatorio": {"velho": 1}}
    out = roadshow.curados(base, tmp_path)
    assert out == {"entidades": [1], "mercado": {"abdib": {"serie": []}}, "regulatorio": {"diagramas": []}}
    assert base["mercado"] == {"velho": 1}  # sem mutar a entrada


def test_build_pela_base_usa_os_json_curados(tmp_path):
    out = tmp_path / "m.html"
    build.build_from_base(BASE, out, intel={})
    conc = grab(out.read_text(encoding="utf-8"), "CONC")
    reg = json.loads((ROADSHOW / "regulatorio.json").read_text(encoding="utf-8"))
    merc = json.loads((ROADSHOW / "mercado.json").read_text(encoding="utf-8"))
    assert conc["regulatorio"] == reg
    for k in ("abdib", "debentures", "pavimento", "comparativos", "notas", "fontes"):
        assert conc["mercado"][k] == merc[k], k
