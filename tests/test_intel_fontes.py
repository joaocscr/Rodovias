import json
import re
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
        assert f["tipo"] in ("modelado", "medido", "cadastro", "—"), f


def test_tipo_herdado_do_bloco_ou_subbloco(fontes):
    por = {(f["bloco"], f["nome"]): f["tipo"] for f in fontes["fontes"]}
    assert por[("carga", next(n for b, n in por if b == "carga"))] == "modelado"
    assert {f["tipo"] for f in fontes["fontes"] if f["bloco"] == "pipeline"} == {"—"}
    assert {f["tipo"] for f in fontes["fontes"] if f["bloco"] == "antt"} == {"medido", "cadastro"}
    assert {f["tipo"] for f in fontes["fontes"] if f["bloco"] == "trafego"} == {"modelado", "medido"}


def test_cadastros_nao_sao_medidos(fontes):
    """Registros (malha municipal, malha e fichas estaduais, capas ANTT, BaseFerro, ANTAQ, estações IBGE) são
    'cadastro': não trazem número medido nem modelado."""
    por = {(f["bloco"], f["nome"]): f["tipo"] for f in fontes["fontes"]}
    assert {t for (b, _), t in por.items() if b in ("municipios", "estaduais")} == {"cadastro"}
    assert por[("antt", "ANTT — Capas das concessões rodoviárias")] == "cadastro"
    cad_mm = {n for (b, n), t in por.items() if b == "multimodal" and t == "cadastro"}
    assert len(cad_mm) == 3 and any("BaseFerro" in n for n in cad_mm) and any("ANTAQ" in n for n in cad_mm)
    med = {n for (b, n), t in por.items() if t == "medido"}
    assert any("Praças de pedágio" in n for n in med) and any("CONAB" in n for n in med) and any("PAM" in n for n in med)


def test_indisponiveis_e_base(fontes):
    assert len(fontes["indisponiveis"]) >= 6
    for i in fontes["indisponiveis"]:
        assert set(i) == {"nome", "url", "motivo"}
        assert i["nome"] and i["motivo"] and i["url"].startswith("http"), i
    nomes = " ".join(b["nome"] for b in fontes["base"])
    assert "202607A" in nomes and "RoadShow" in nomes
    assert all(b["url"].startswith("http") or b["url"] == "" for b in fontes["base"])


def test_montar_devolve_copias_profundas():
    m = fontes_bloco.montar()
    antes = json.dumps([fontes_bloco.INDISPONIVEIS, fontes_bloco.BASE], sort_keys=True)
    m["indisponiveis"][0]["motivo"] = "x"
    m["indisponiveis"].append({})
    m["base"][0]["nome"] = "x"
    assert json.dumps([fontes_bloco.INDISPONIVEIS, fontes_bloco.BASE], sort_keys=True) == antes


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


# Termos de implementação que não podem aparecer em texto visível ao usuário (nomes de campo, siglas de código).
PROIBIDOS = re.compile(
    r"TO_GSA|TO_TOTAL|V_TOTAL|GTYPE|dist_m|km_map|entFis|entEst|entGeo|fonte_url|verificado=|sigilo=|CKAN|"
    r"\b(?:fis|snap|null|JSON|CSV|campos|campo|periodo|revisar)\b|\(revisar\)|[≤≥]|data/|\d{4}-(?:0[1-9]|1[0-2])\b|\w+_\w+",
    re.IGNORECASE)


def _textos_visiveis(fontes):
    for f in fontes["fontes"]:
        yield ("fonte", f["bloco"], f["nome"]), f["nome"]
        yield ("periodo", f["bloco"], f["nome"]), f["periodo"]
        yield ("nota", f["bloco"], f["nome"]), f["nota"]
        yield ("licenca", f["bloco"], f["nome"]), f["licenca"]
    for b in fontes["base"]:
        for k in ("nome", "periodo", "nota", "licenca"):
            yield ("base", k, b["nome"]), b[k]
    for i in fontes["indisponiveis"]:
        for k in ("nome", "motivo"):
            yield ("indisponivel", k, i["nome"]), i[k]


def test_notas_das_fontes_em_linguagem_clara(fontes):
    """Nome, período e nota de cada fonte são frases em pt-BR: sem nomes de campo, siglas de código nem AAAA-MM."""
    for onde, texto in _textos_visiveis(fontes):
        achado = PROIBIDOS.search(texto)
        assert not achado, (onde, achado.group(0), texto)


def test_periodo_em_formato_pt_br(fontes):
    for f in fontes["fontes"] + fontes["base"]:
        assert not re.search(r"\d{4}-\d{2}", f["periodo"]), f["periodo"]



def test_manifesto_mantem_o_acesso_quando_o_arquivo_nao_mudou(tmp_path, monkeypatch):
    """Arquivo baixado de novo com o mesmo conteúdo não ganha data de acesso nova (senão a fonte parece atual)."""
    from intel import fontes
    import datetime as dt
    monkeypatch.setattr(fontes, "ROOT", tmp_path)
    monkeypatch.setattr(fontes, "MANIFEST_DIR", tmp_path / "manifest")
    arq = tmp_path / "data" / "x.csv"
    arq.parent.mkdir(parents=True)
    arq.write_text("a", encoding="utf-8")

    class Dia(dt.date):
        atual = dt.date(2026, 1, 1)

        @classmethod
        def today(cls):
            return cls.atual
    monkeypatch.setattr(fontes.dt, "date", Dia)
    m = fontes.Manifest("teste")
    assert m.add("https://x", arq, "x")["acesso"] == "2026-01-01"
    Dia.atual = dt.date(2026, 6, 1)
    assert m.add("https://x", arq, "x")["acesso"] == "2026-01-01"   # mesmo SHA-256: a data fica
    arq.write_text("b", encoding="utf-8")
    assert m.add("https://x", arq, "x")["acesso"] == "2026-06-01"   # conteúdo novo: data nova
    assert len(m.items) == 1
