"""Glossário: data/glossario.json é íntegro e todo Glossario.link('termo') das abas aponta para um termo que existe."""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import build  # noqa: E402

GLOSSARIO = ROOT / "data" / "glossario.json"
CATEGORIAS = {"Malha e tráfego", "Cargas", "Concessões e leilões", "Regulação", "Finanças", "Debêntures e juros", "Instituições"}
# Termos que o painel precisa explicar (spec §3.5): o teste falha se algum sair do arquivo.
TERMOS_OBRIGATORIOS = {
    "vmda", "vmd", "sat", "praca-de-pedagio", "free-flow", "pam", "pnl", "medido-modelado", "snv", "trecho-fisico", "desagio",
    "aporte-recursos-vinculados", "otimizacao-contratual", "relicitacao", "capex", "opex", "vpl", "wacc", "tir", "tkm", "data-base",
    "roadshow", "debenture-incentivada", "debenture-infraestrutura", "ntn-b", "spread", "duration", "ipca-mais", "cdi", "selic", "focus",
    "taxa-indicativa-anbima",
}
# Glossario.link('id') e Glossario.link("id", ...): só ids literais entram na checagem
LINK = re.compile(r"""Glossario\.link\(\s*(['"])([^'"]+)\1""")


def carregar():
    return json.loads(GLOSSARIO.read_text(encoding="utf-8"))


def links_nas_abas():
    """{id: [arquivos]} de todo Glossario.link('id') em src/*.js e dos termos declarados em data/fontes_descricao.json."""
    achados = {}
    for js in sorted((ROOT / "src").glob("*.js")):
        for m in LINK.finditer(js.read_text(encoding="utf-8")):
            achados.setdefault(m.group(2), []).append(js.name)
    # a aba Resumo também liga termos pelas descrições curadas das fontes (data/fontes_descricao.json)
    desc = json.loads((ROOT / "data" / "fontes_descricao.json").read_text(encoding="utf-8"))
    for d in desc.values():
        for i in [d["termo"]] if "termo" in d else []:
            achados.setdefault(i, []).append("fontes_descricao.json")
        for t in d.get("termos", []):
            achados.setdefault(t["id"], []).append("fontes_descricao.json")
    return achados


def test_ids_unicos_e_no_formato():
    ids = [e["id"] for e in carregar()]
    assert len(ids) == len(set(ids)), sorted({i for i in ids if ids.count(i) > 1})
    for i in ids:
        assert re.fullmatch(r"[a-z0-9]+(-[a-z0-9]+)*", i), i


def test_termos_unicos():
    termos = [e["termo"].lower() for e in carregar()]
    assert len(termos) == len(set(termos))


def test_campos_obrigatorios_e_categorias():
    for e in carregar():
        assert e["termo"].strip(), e["id"]
        assert e["definicao"].strip(), e["id"]
        assert 40 <= len(e["definicao"]) <= 500, f"{e['id']}: definição fora de 40–500 caracteres ({len(e['definicao'])})"
        assert e["categorias"] and set(e["categorias"]) <= CATEGORIAS, (e["id"], e["categorias"])
        assert set(e) <= {"id", "termo", "sigla", "definicao", "fonte", "categorias"}, (e["id"], set(e))
        if "sigla" in e:
            assert e["sigla"].strip(), e["id"]


def test_fonte_tem_nome_e_url_https_quando_ha():
    for e in carregar():
        f = e.get("fonte")
        if f is None:
            continue
        assert f["nome"].strip(), e["id"]
        assert set(f) <= {"nome", "url"}, e["id"]
        if "url" in f:
            assert f["url"].startswith("https://"), (e["id"], f["url"])


def test_termos_da_spec_estao_no_glossario():
    faltam = TERMOS_OBRIGATORIOS - {e["id"] for e in carregar()}
    assert not faltam, f"termos da spec §3.5 ausentes: {sorted(faltam)}"


def test_links_do_glossario_existem():
    ids = {e["id"] for e in carregar()}
    achados = links_nas_abas()
    assert achados, "nenhum Glossario.link encontrado em src/*.js: a busca está quebrada ou as abas perderam os links"
    faltam = {t: arqs for t, arqs in achados.items() if t not in ids}
    assert not faltam, "termos citados em Glossario.link e ausentes de data/glossario.json: " + "; ".join(
        f"{t} ({', '.join(sorted(set(a)))})" for t, a in sorted(faltam.items()))


def test_busca_de_links_reconhece_aspas_simples_e_duplas():
    texto = "x ${Glossario.link('vmda')} y ${Glossario.link( \"free-flow\", 'texto')}"
    assert [m.group(2) for m in LINK.finditer(texto)] == ["vmda", "free-flow"]


def test_link_nao_se_repete_no_mesmo_arquivo():
    # só a primeira menção de cada termo em cada aba vira link
    for js in sorted((ROOT / "src").glob("*.js")):
        if js.name == "glossario.js":
            continue
        ids = [m.group(2) for m in LINK.finditer(js.read_text(encoding="utf-8"))]
        repetidos = sorted({i for i in ids if ids.count(i) > 1})
        assert not repetidos, f"{js.name}: link repetido (só a primeira menção de cada termo): {repetidos}"


def test_build_embute_o_glossario(tmp_path):
    out = tmp_path / "m.html"
    build.build_from_base(ROOT / "data" / "base", out, intel={})
    html = out.read_text(encoding="utf-8")
    m = re.search(r"window\.GLOSSARIO=(\[.*?\]);\n", html, flags=re.S)
    assert m, "window.GLOSSARIO não está no HTML"
    assert json.loads(m.group(1).replace("<\\/", "</")) == carregar()
    assert 'id="page-glossario"' in html
    assert "src/glossario.js" in "".join(build.JS_FILES)
