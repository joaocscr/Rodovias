import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
from intel import fontes_bloco  # noqa: E402
import build  # noqa: E402

INTEL = ROOT / "data" / "intel"
EXCLUIDOS = {"fontes", "manifest"}


def _json(p):
    return json.loads(Path(p).read_text(encoding="utf-8"))


def _blocos():
    return {p.stem: _json(p) for p in sorted(INTEL.glob("*.json")) if p.stem not in EXCLUIDOS}


@pytest.fixture(scope="module")
def fontes():
    return _json(INTEL / "fontes.json")


@pytest.fixture(scope="module")
def manifest():
    return _json(INTEL / "manifest.json")


def test_toda_fonte_de_todo_bloco_esta_em_fontes_json(fontes):
    linhas = {(f["bloco"], f["nome"], f["url"]) for f in fontes["fontes"]}
    esperado = 0
    for bloco, dados in _blocos().items():
        itens = dados["fonte"]
        itens = itens if isinstance(itens, list) else [itens]
        assert itens, bloco
        for it in itens:
            esperado += 1
            assert (bloco, it["nome"], it["url"]) in linhas, (bloco, it["nome"])
    assert len(fontes["fontes"]) == esperado


def test_campos_e_urls_das_fontes(fontes):
    chaves = {"bloco", "nome", "url", "periodo", "acesso", "licenca", "tipo", "nota"}
    for f in fontes["fontes"]:
        assert set(f) == chaves
        assert f["url"].startswith("http"), f
        assert f["nome"] and f["acesso"] and f["licenca"]
        assert f["tipo"] in ("modelado", "medido", "—"), f


def test_tipo_herdado_do_bloco_ou_subbloco(fontes):
    por = {(f["bloco"], f["nome"]): f["tipo"] for f in fontes["fontes"]}
    assert por[("carga", next(n for b, n in por if b == "carga"))] == "modelado"
    assert {f["tipo"] for f in fontes["fontes"] if f["bloco"] == "pipeline"} == {"—"}
    assert {f["tipo"] for f in fontes["fontes"] if f["bloco"] == "antt"} == {"medido"}
    assert {f["tipo"] for f in fontes["fontes"] if f["bloco"] == "trafego"} == {"modelado", "medido"}


def test_indisponiveis_e_base(fontes):
    assert len(fontes["indisponiveis"]) >= 6
    for i in fontes["indisponiveis"]:
        assert set(i) == {"nome", "url", "motivo"}
        assert i["nome"] and i["motivo"] and i["url"].startswith("http"), i
    nomes = " ".join(b["nome"] for b in fontes["base"])
    assert "202607A" in nomes and "RoadShow" in nomes
    assert all(b["url"].startswith("http") or b["url"] == "" for b in fontes["base"])


def test_fontes_json_esta_em_dia_com_os_blocos(fontes):
    assert fontes_bloco.montar() == fontes


def test_manifesto_e_a_uniao_dos_manifestos_por_dominio(manifest):
    por_dominio = [_json(p) for p in sorted((ROOT / "data" / "manifest").glob("*.json"))]
    total = sum(len(m) for m in por_dominio)
    assert len(manifest["itens"]) == total
    assert manifest["arquivos"] == total
    assert manifest["bytes"] == sum(i["bytes"] for m in por_dominio for i in m)
    ordem = [(i["dominio"], i["arquivo"]) for i in manifest["itens"]]
    assert ordem == sorted(ordem)


def test_build_embute_fontes_e_nao_o_manifesto(tmp_path, capsys):
    assert (INTEL / "manifest.json").exists()
    out = tmp_path / "mapa.html"
    size = build.build_from_base(ROOT / "data" / "base", out)
    assert size <= build.MAX_BYTES and out.stat().st_size == size
    html = out.read_text(encoding="utf-8")
    marca = "window.INTEL="
    pre = html.index(marca) + len(marca)
    intel, _ = json.JSONDecoder().raw_decode(html, pre)
    assert "fontes" in intel and "manifest" not in intel
    assert intel["fontes"]["fontes"]
    assert "window.INTEL.manifest" not in html
    saida = capsys.readouterr().out
    assert "intel/fontes:" in saida and "intel/manifest" not in saida and "intel total:" in saida
    assert all(f"intel/{b}:" in saida for b in _blocos())
