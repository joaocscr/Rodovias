"""data/fontes_descricao.json: uma frase curada por fonte embutida (aba Resumo, "Sobre este painel").

A tabela do Resumo é gerada dos blocos embutidos (INTEL.fontes, bases do painel e verificação dos leilões); a frase de
cada um vem deste arquivo, pelo nome do bloco. Fonte nova sem descrição falha aqui, listada.
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import build  # noqa: E402

DESCRICAO = ROOT / "data" / "fontes_descricao.json"
VERIFICACAO = "verificacao"  # CONC.verificacao: não passa por INTEL.fontes
# O nome da empresa do autor é montado em partes para este arquivo não citá-lo.
PROIBIDOS = re.compile(r"\bv[1-4]\b|\bv40\b|gal" + "[aá]" + "pagos|\\d{4}-\\d{2}|\\w+_\\w+", re.I)


def descricoes():
    return json.loads(DESCRICAO.read_text(encoding="utf-8"))


def blocos_embutidos():
    fontes = json.loads((ROOT / "data" / "intel" / "fontes.json").read_text(encoding="utf-8"))
    return {f["bloco"] for f in fontes["fontes"]} | {b["bloco"] for b in fontes["base"]} | {VERIFICACAO}


def test_toda_fonte_embutida_tem_descricao():
    faltam = sorted(blocos_embutidos() - set(descricoes()))
    assert not faltam, f"fontes sem descrição em data/fontes_descricao.json: {', '.join(faltam)}"


def test_nenhuma_descricao_sobra():
    sobram = sorted(set(descricoes()) - blocos_embutidos())
    assert not sobram, f"descrições de fontes que não estão embutidas: {', '.join(sobram)}"


def test_campos_e_linguagem_clara():
    for bloco, d in descricoes().items():
        assert set(d) <= {"nome", "oQue", "termo"}, (bloco, set(d))
        assert d["nome"].strip() and d["oQue"].strip(), bloco
        assert 40 <= len(d["oQue"]) <= 420, f"{bloco}: descrição fora de 40–420 caracteres ({len(d['oQue'])})"
        achado = PROIBIDOS.search(d["nome"] + " " + d["oQue"])
        assert not achado, (bloco, achado.group(0))
        assert ("{edicao}" in d["oQue"]) == (bloco == "roadshow"), bloco  # a edição vem de CONC.edicaoRoadshow


def test_termos_do_glossario_existem():
    ids = {e["id"] for e in json.loads((ROOT / "data" / "glossario.json").read_text(encoding="utf-8"))}
    for bloco, d in descricoes().items():
        assert d.get("termo", "x") in ids | {"x"}, (bloco, d["termo"])


def test_roadshow_e_explicado_sem_sigla_solta():
    d = descricoes()["roadshow"]["oQue"]
    assert d.startswith("Apresentação do Ministério dos Transportes a investidores sobre a carteira de concessões rodoviárias 2026–2027")


def test_build_embute_as_descricoes(tmp_path):
    out = tmp_path / "m.html"
    build.build_from_base(ROOT / "data" / "base", out, intel={})
    html = out.read_text(encoding="utf-8")
    m = re.search(r"window\.FONTES_DESCRICAO=(\{.*?\});", html, flags=re.S)
    assert m, "window.FONTES_DESCRICAO não está no HTML"
    assert json.loads(m.group(1).replace("<\\/", "</")) == descricoes()
    assert "src/resumo-model.js" in "".join(build.JS_FILES)
