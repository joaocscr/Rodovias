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
LINK = re.compile(r"""Glossario\.link\(\s*(['"])([^'"]+)\1""")  # Glossario.link('id'...) em src/*.js
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
        assert set(d) <= {"nome", "oQue", "termo", "termos"}, (bloco, set(d))
        assert d["nome"].strip() and d["oQue"].strip(), bloco
        assert 40 <= len(d["oQue"]) <= 420, f"{bloco}: descrição fora de 40–420 caracteres ({len(d['oQue'])})"
        achado = PROIBIDOS.search(d["nome"] + " " + d["oQue"])
        assert not achado, (bloco, achado.group(0))
        assert ("{edicao}" in d["oQue"]) == (bloco == "roadshow"), bloco  # a edição vem de CONC.edicaoRoadshow


def glossario():
    return {e["id"]: e for e in json.loads((ROOT / "data" / "glossario.json").read_text(encoding="utf-8"))}


def test_termos_do_glossario_existem():
    ids = set(glossario())
    for bloco, d in descricoes().items():
        assert d.get("termo", "x") in ids | {"x"}, (bloco, d["termo"])
        for t in d.get("termos", []):
            assert set(t) == {"id", "texto"}, (bloco, t)
            assert t["id"] in ids, (bloco, t["id"])
            assert t["texto"] in d["oQue"], f"{bloco}: o texto '{t['texto']}' não aparece na descrição"


def test_cada_termo_e_ligado_uma_vez_so():
    # só a primeira menção de cada termo leva link (na ordem em que as linhas aparecem)
    ligados = [d["termo"] for d in descricoes().values() if "termo" in d]
    ligados += [t["id"] for d in descricoes().values() for t in d.get("termos", [])]
    assert len(ligados) == len(set(ligados)), sorted({i for i in ligados if ligados.count(i) > 1})


def test_sigla_do_glossario_tem_link_na_primeira_mencao():
    # links que a própria página do Resumo já faz antes da tabela (src/resumo.js)
    antes = {m.group(2) for m in LINK.finditer((ROOT / "src" / "resumo.js").read_text(encoding="utf-8"))}
    ligados = set(antes)
    gl = glossario()
    ja = set()
    for bloco, d in descricoes().items():
        ligados |= {d["termo"]} if "termo" in d else set()
        ligados |= {t["id"] for t in d.get("termos", [])}
        texto = d["nome"] + " " + d["oQue"]
        for i, e in gl.items():
            sigla = e.get("sigla")
            if sigla and i not in ja and re.search(rf"(?<!\w){re.escape(sigla)}(?!\w)", texto):
                ja.add(i)
                assert i in ligados, f"{bloco}: a sigla {sigla} é citada pela primeira vez sem link para o glossário ('{i}')"


def test_siglas_de_orgaos_sao_explicadas_na_primeira_mencao():
    # quem lê pela primeira vez precisa do nome por extenso (ou de uma explicação) junto da sigla
    por_extenso = {
        "DNIT": "Departamento Nacional de Infraestrutura de Transportes", "BNDES": "Banco Nacional de Desenvolvimento Econômico e Social",
        "IBGE": "Instituto Brasileiro de Geografia e Estatística", "Conab": "Companhia Nacional de Abastecimento",
        "ABCR": "Associação Brasileira de Concessionárias de Rodovias|associação das concessionárias", "Infra S.A.": "empresa pública federal",
        "PRF": "Polícia Rodoviária Federal", "ANTT": "Agência Nacional de Transportes Terrestres", "MPO": "Ministério do Planejamento e Orçamento",
        "PNL": "Plano Nacional de Logística",
    }
    vistos = set()
    anteriores = ""  # frases das linhas já mostradas, incluindo a atual
    for bloco, d in descricoes().items():
        anteriores += " " + d["oQue"]
        for sigla, ext in por_extenso.items():
            if sigla not in vistos and re.search(rf"(?<!\w){re.escape(sigla)}(?!\w)", d["oQue"]):
                vistos.add(sigla)
                assert re.search(ext, anteriores), f"{bloco}: a sigla {sigla} aparece sem explicação ('{ext}')"


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
