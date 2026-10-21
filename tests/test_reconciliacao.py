"""Reconciliação do RoadShow 2026-2027: totais DECLARADOS no PDF × totais RECALCULADOS dos dados curados.

Os declarados ficam em data/roadshow/reconciliacao.json (valor, casas impressas e página de cada um), lidos do
PDF; uma nova versão do RoadShow só precisa atualizar esse arquivo. Os recalculados vêm de
data/roadshow/entidades.json e data/roadshow/mercado.json.

Valores exibidos × valores do RoadShow: a camada de verificação dos leilões (v4: data/roadshow/verificacao.json)
pode sobrescrever campos de leilão na interface (ex.: deságio do Lote 5, da Rota da Celulose, das otimizações
Motiva Pantanal e Ecovias Capixaba). Aqui a conta é sobre a TRANSCRIÇÃO do RoadShow: usa-se o que está em
entidades.json / mercado.json como transcrito (p. 97 etc.), nunca os valores verificados.

Tolerância: 1 unidade da última casa impressa (10^-casas do declarado). Contagens (nº de leilões, de contratos)
são inteiros exatos e comparam por igualdade.

Divergências conhecidas viram `xfail(strict=True)` com o motivo (dicionário DIVERGENCIAS): não são silenciadas
nem puladas, e, se uma delas deixar de existir, o teste passa a FALHAR (strict) e o motivo precisa ser revisado.
Um erro de transcrição novo falha o teste comum correspondente.
"""
import json
import re
import statistics
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data" / "roadshow"
PDF = ROOT / "data" / "raw" / "roadshow.pdf"
try:
    import pymupdf
except ImportError:  # pragma: no cover
    pymupdf = None
needs_pdf = pytest.mark.skipif(pymupdf is None or not PDF.exists(), reason="PDF do RoadShow ausente em data/raw/")

EPS = 1e-9
ANOS = ["2023", "2024", "2025", "2026", "2027"]
LOTE_5 = "rodovias-integradas-do-parana-lote-5"


def _json(nome):
    return json.loads((DATA / nome).read_text(encoding="utf-8"))


DECL = _json("reconciliacao.json")
ENTIDADES = _json("entidades.json")
MERCADO = _json("mercado.json")

# ---------- divergências conhecidas (xfail strict) ----------
# chave: (seção, campo[, ano ou nº de concorrentes]) — o valor é o motivo, mostrado no relatório do pytest.
LINHA_23 = ("a linha 23 (PR Vias) é impressa na p. 5 com capex+opex = 17,05, mas capex 9,87 + opex 6,04 = 15,91 (a "
            "p. 97 imprime 15,91): erro de impressão do RoadShow, não de transcrição "
            "(ver test_*_explicado_pela_linha_23)")
P17_X_P3P5 = ("a p. 17 e as pp. 3/5 imprimem totais diferentes para os mesmos 39 contratos: as linhas da p. 17 fecham "
              "com o total da p. 17 (test_grupos_linhas_fecham_com_total_p17) e as 39 linhas das pp. 3/5 fecham com "
              "o das pp. 3/5; o RoadShow não reconcilia as duas tabelas. Causa não identificada")
P25_X_P97 = ("as médias por nº de concorrentes da p. 25 não saem dos deságios da p. 97 (nota de mercado.json, "
             "desagio_por_n_concorrentes)")
DIVERGENCIAS = {
    ("contratos", "capex_opex"): ("pp. 3/5: total 455 × 453,81 recalculado; a soma da coluna capex+opex impressa nas "
                                  "pp. 3/5 dá 454,93 (a das colunas km, capex e opex fecha com os totais). " + LINHA_23),
    ("grupos_x_contratos", "km"): "p. 17: 19.195 km × 19.198 km das pp. 3/5. " + P17_X_P3P5,
    ("grupos_x_contratos", "capex"): "p. 17: R$ 269,3 bi × R$ 264 bi das pp. 3/5. " + P17_X_P3P5,
    ("grupos_x_contratos", "opex"): "p. 17: R$ 196,3 bi × R$ 190 bi das pp. 3/5. " + P17_X_P3P5,
    ("grupos_x_contratos", "capex_opex"): "p. 17: R$ 465,63 bi × R$ 455 bi das pp. 3/5. " + P17_X_P3P5,
    ("leiloes", "km"): ("p. 97: total 12.198 km × 12.203,73 km, que é também a soma da coluna km impressa na p. 97 (igual às "
                        "pp. 3/5). O total coincide com a soma dos anos da p. 125/p. 95 (1.077 + 3.221 + 6.279 + "
                        "1.620 = 12.197), cujo 2024 (3.221) fica 6,25 km abaixo das 7 linhas de 2024 (3.227,25). "
                        "Causa não identificada"),
    ("leiloes", "capex_opex"): ("p. 97: total 283,8 × 282,63 recalculado, que é também a soma da coluna capex+opex impressa "
                                "na p. 97 (e 169,04 + 113,6 = 282,64). O total impresso coincide com a soma trocando a "
                                "linha 23 por 17,05 (283,77): " + LINHA_23),
    ("programa", "km", "2024"): ("p. 125: 3.221 km × 3.227,25 km das 7 linhas de 2024 da p. 97 (mesmos valores das "
                                 "pp. 3/5). Mesma diferença de 6,25 km do total da p. 97. Causa não identificada"),
    ("programa", "capex", "2026"): ("p. 125: R$ 53,8 bi × 55,37 recalculado das 7 entidades de 2026. A p. 101 divide em "
                                    "4 novos estudos (R$ 32 bi) + 3 otimizações (R$ 21,8 bi); as fichas somam 33,74 e "
                                    "21,63. Fichas e p. 101 não fecham; causa não identificada"),
    ("programa", "opex", "2026"): ("p. 125: R$ 36,2 bi × 38,11 recalculado das 7 entidades de 2026 (p. 101: 23,6 + 12,6; "
                                   "as fichas somam 25,87 + 12,24). Causa não identificada"),
    ("programa", "km", "2027"): ("p. 125: 4.455 km × 4.451,81 recalculado das 11 entidades de 2027. A p. 129 dá 9 novos "
                                 "estudos 3.721,38 km + 2 otimizações 734,3 km; as 2 otimizações fecham, os 9 estudos "
                                 "somam 3.717,51 nas fichas. Causa não identificada"),
    ("programa", "capex", "2027"): ("p. 125: R$ 54,9 bi × 53,58 recalculado das 11 entidades de 2027 (p. 129: 47,15 + "
                                    "7,71; as otimizações fecham, os 9 estudos somam 45,87 nas fichas). Causa não "
                                    "identificada"),
    ("programa", "opex", "2027"): ("p. 125: R$ 47,8 bi × 47,09 recalculado das 11 entidades de 2027 (p. 129: 39,01 + 8,8; "
                                   "as otimizações fecham, os 9 estudos somam 38,29 nas fichas). Causa não identificada"),
    ("programa_total", "km"): "p. 125: 19.416 km × 19.418,44 recalculado; reflete as diferenças de 2024 e 2027 acima",
    ("desagio", "media"): ("pp. 25/27: média 12,36% × 12,29% recalculada com os 25 deságios da p. 97. Com o Lote 5 a "
                           "23,83% (p. 15) em vez de 21,83% (p. 97), a média arredonda para 12,37%, a 1 centésimo do "
                           "impresso (ver test_desagio_explicado_pelo_lote_5)"),
    ("desagio", "maior"): "p. 27: maior deságio 25,9% × 26,6% (Lote 3, p. 97). Causa não identificada",
    ("desagio_faixa", "de_0_a_10"): ("p. 27: 6 leilões em >0% e <10% × 8 pela p. 97 (0,05% ×3, 0,08% ×2, 0,38%, 0,94%, "
                                     "9%); a p. 27 provavelmente conta 0,05% e 0,08% como 0%"),
    ("desagio_faixa", "zero"): "p. 27: 3 leilões com 0% × 1 pela p. 97 (só o Fluminense tem 0,00%); ver faixa >0% e <10%",
    ("desagio_n", "2"): ("p. 25: média 17,65% × 17,145% da p. 97; a p. 25 se reproduz com o Lote 5 a 23,83% "
                         "(ver test_desagio_explicado_pelo_lote_5)"),
    ("desagio_n", "3"): "p. 25: média 18,47% × 16,30% recalculada. " + P25_X_P97 + "; causa não identificada",
    ("desagio_n", "4"): ("p. 25: média 17,30% × 17,50% da p. 97; reproduz-se com a Rota da Celulose a 8% (valor do "
                         "adjudicatário, da camada de verificação; a p. 97 imprime 9%). " + P25_X_P97),
    ("desagio_n", "5"): "p. 25: média 19,70% × 19,60% (Rota Agro, único leilão com 5 concorrentes). Causa não identificada",
}


def caso(*chave):
    """pytest.param da `chave` (o último item é o id do caso); xfail estrito se for divergência conhecida."""
    motivo = DIVERGENCIAS.get(chave)
    marks = [pytest.mark.xfail(strict=True, reason=motivo)] if motivo else []
    return pytest.param(*chave[1:], marks=marks, id="-".join(chave[1:]))


def casos(secao, *itens):
    return [caso(secao, *(i if isinstance(i, tuple) else (i,))) for i in itens]


# ---------- ferramentas ----------

def unidade(d):
    """1 unidade da última casa impressa."""
    return 10 ** -d["casas"]


def fecha(recalculado, d, unidade_=None):
    return abs(recalculado - d["valor"]) <= (unidade_ if unidade_ is not None else unidade(d)) + EPS


def msg(nome, recalculado, d):
    return f"{nome}: recalculado {recalculado:.4f} × declarado {d['valor']} (p. {d['pagina']}, tolerância {unidade(d)})"


def soma(ents, campo):
    if campo == "capex_opex":
        return sum(x["capex"] + x["opex"] for x in ents)
    return sum(x[campo] for x in ents)


def contratos():
    return [x for x in ENTIDADES if x.get("linha_p5")]


def leiloes_realizados():
    return [x for x in ENTIDADES if x["estado"] == "programa"]


def do_ano(ano):
    return [x for x in ENTIDADES if x["ano_programa"] == int(ano)]


def soma_com_total_impresso(ents, paginas):
    """capex+opex somando, nas linhas com total divergente impresso nessas páginas, o total impresso."""
    t = 0.0
    for x in ents:
        v = x["capex"] + x["opex"]
        for d in x.get("divergencias") or []:
            if d["campo"] == "capex+opex":
                v = next((a["valor"] for a in d["alternativas"] if a["pagina"] in paginas), v)
        t += v
    return t


def desagios():
    """Deságios dos 25 leilões como transcritos da p. 97 (mercado.json, não os exibidos da camada de verificação)."""
    return [x["desagio"] for x in MERCADO["concorrentes_desagio"]]


def folhas(no, caminho=""):
    """Todos os declarados (dicts com `valor`) de reconciliacao.json, com o caminho."""
    if isinstance(no, dict):
        if "valor" in no:
            yield caminho, no
        else:
            for k, v in no.items():
                if not k.startswith("_"):
                    yield from folhas(v, f"{caminho}/{k}")


# ---------- o arquivo de declarados ----------

def test_declarados_bem_formados():
    fs = list(folhas(DECL))
    assert len(fs) > 80
    for caminho, d in fs:
        assert isinstance(d["valor"], (int, float)) and isinstance(d["casas"], int) and d["casas"] >= 0, caminho
        for p in [d["pagina"], *d.get("tambem_em", [])]:
            assert isinstance(p, int) and p % 2 == 1, (caminho, p)  # só páginas ímpares (em português)
        # o valor tem, no máximo, as casas impressas
        assert abs(round(d["valor"], d["casas"]) - d["valor"]) < EPS, caminho


def _impresso(d):
    if "impresso" in d:
        return d["impresso"]
    s = f"{abs(d['valor']):,.{d['casas']}f}"
    return s.replace(",", "X").replace(".", ",").replace("X", ".")


@needs_pdf
def test_declarados_conferem_com_o_pdf():
    # cada declarado aparece, como número inteiro (token), no texto da página de origem
    with pymupdf.open(PDF) as doc:
        textos = {}
        for caminho, d in folhas(DECL):
            for p in [d["pagina"], *d.get("tambem_em", [])]:
                if p not in textos:
                    textos[p] = " ".join(doc[p - 1].get_text().split())
                padrao = r"(?<![\d.,])" + re.escape(_impresso(d)) + r"(?!\d|[.,]\d)"
                assert re.search(padrao, textos[p]), (caminho, _impresso(d), p)


# ---------- pp. 3 e 5: 39 contratos vigentes ----------

def test_contratos_n():
    assert len(contratos()) == DECL["contratos_vigentes"]["n"]["valor"]


@pytest.mark.parametrize("campo", casos("contratos", "km", "capex", "opex", "capex_opex"))
def test_contratos_totais(campo):
    d = DECL["contratos_vigentes"][campo]
    r = soma(contratos(), campo)
    assert fecha(r, d), msg(campo, r, d)


def test_contratos_capex_opex_explicado_pela_linha_23():
    # trocando o total da linha 23 pelo impresso na p. 5 (17,05), o total impresso (455) fecha
    d = DECL["contratos_vigentes"]["capex_opex"]
    r = soma_com_total_impresso(contratos(), {3, 5})
    assert r > soma(contratos(), "capex_opex") + 1, "a linha 23 deveria trazer total divergente (divergencias.capex+opex)"
    assert fecha(r, d), msg("capex_opex com a linha 23 como impressa", r, d)


# ---------- p. 17: grupos ----------

@pytest.mark.parametrize("campo,chave", [("n_concessoes", "n_concessoes"), ("km", "km"), ("pct_km", "pct_km"),
                                         ("capex", "capex"), ("opex", "opex"), ("capex_opex", "capex_opex")])
def test_grupos_linhas_fecham_com_total_p17(campo, chave):
    d = DECL["grupos"][campo]
    r = sum(g[chave] for g in MERCADO["grupos"])
    if campo == "n_concessoes":
        assert r == d["valor"]
    else:
        assert fecha(r, d), msg(f"soma dos grupos ({campo})", r, d)


def test_grupos_capex_opex_por_linha():
    for g in MERCADO["grupos"]:  # cada linha imprime capex+opex com 2 casas
        assert abs(g["capex"] + g["opex"] - g["capex_opex"]) <= 0.01 + EPS, g["grupo"]


def test_grupos_total_p17_tem_o_n_dos_contratos():
    assert DECL["grupos"]["n_concessoes"]["valor"] == DECL["contratos_vigentes"]["n"]["valor"] == len(contratos())


@pytest.mark.parametrize("campo", casos("grupos_x_contratos", "km", "capex", "opex", "capex_opex"))
def test_grupos_p17_x_totais_das_pp3_5(campo):
    a, b = DECL["grupos"][campo], DECL["contratos_vigentes"][campo]
    assert abs(a["valor"] - b["valor"]) <= max(unidade(a), unidade(b)) + EPS, (campo, a["valor"], b["valor"])


# ---------- p. 97: 25 leilões ----------

def test_leiloes_n():
    d = DECL["leiloes_p97"]["n"]
    assert len(leiloes_realizados()) == len(MERCADO["concorrentes_desagio"]) == d["valor"]


@pytest.mark.parametrize("campo", casos("leiloes", "km", "capex", "opex", "capex_opex"))
def test_leiloes_totais(campo):
    d = DECL["leiloes_p97"][campo]
    r = soma(leiloes_realizados(), campo)
    assert fecha(r, d), msg(campo, r, d)


def test_leiloes_capex_opex_explicado_pela_linha_23():
    d = DECL["leiloes_p97"]["capex_opex"]
    r = soma_com_total_impresso(leiloes_realizados(), {5})
    assert r > soma(leiloes_realizados(), "capex_opex") + 1
    assert fecha(r, d), msg("capex_opex com a linha 23 como impressa", r, d)


# ---------- p. 125: programa por ano ----------

def caso_ano(campo, ano):
    motivo = DIVERGENCIAS.get(("programa", campo, ano))
    marks = [pytest.mark.xfail(strict=True, reason=motivo)] if motivo else []
    return pytest.param(ano, campo, marks=marks, id=f"{ano}-{campo}")


@pytest.mark.parametrize("ano", ANOS)
def test_programa_n_de_leiloes(ano):
    assert len(do_ano(ano)) == DECL["programa_por_ano"]["anos"][ano]["leiloes"]["valor"]


@pytest.mark.parametrize("ano,campo", [caso_ano(c, a) for a in ANOS for c in ("km", "capex", "opex")])
def test_programa_totais_por_ano(ano, campo):
    d = DECL["programa_por_ano"]["anos"][ano][campo]
    r = soma(do_ano(ano), campo)
    assert fecha(r, d), msg(f"{ano} {campo}", r, d)


def test_programa_n_total():
    assert len([x for x in ENTIDADES if x["ano_programa"]]) == DECL["programa_por_ano"]["total"]["leiloes"]["valor"]


@pytest.mark.parametrize("campo", casos("programa_total", "km", "capex", "opex"))
def test_programa_totais_recalculados(campo):
    d = DECL["programa_por_ano"]["total"][campo]
    r = soma([x for x in ENTIDADES if x["ano_programa"]], campo)
    assert fecha(r, d), msg(f"total {campo}", r, d)


@pytest.mark.parametrize("campo", ["leiloes", "km", "capex", "opex", "capex_opex", "duplicacao_km", "faixa_km"])
def test_programa_p125_anos_fecham_com_o_total(campo):
    tot = DECL["programa_por_ano"]["total"][campo]
    r = sum(DECL["programa_por_ano"]["anos"][a][campo]["valor"] for a in ANOS)
    assert fecha(r, tot), msg(f"soma dos anos ({campo})", r, tot)


@pytest.mark.parametrize("ano", ANOS)
def test_programa_p125_total_do_ano_e_capex_mais_opex(ano):
    a = DECL["programa_por_ano"]["anos"][ano]
    assert abs(a["capex"]["valor"] + a["opex"]["valor"] - a["capex_opex"]["valor"]) <= unidade(a["capex_opex"]) + EPS


@pytest.mark.parametrize("ano", ANOS)
def test_programa_mercado_transcrito_confere_com_p125(ano):
    # mercado.json (programa_por_ano) × declarado da p. 125: detecta erro de transcrição da série
    m = next(x for x in MERCADO["programa_por_ano"] if x["ano"] == int(ano))
    a = DECL["programa_por_ano"]["anos"][ano]
    assert m["leiloes"] == a["leiloes"]["valor"]
    for campo in ("km", "capex", "opex", "duplicacao_km", "faixa_km"):
        assert fecha(m[campo], a[campo]), msg(f"{ano} {campo}", m[campo], a[campo])
    assert fecha(m["capex"] + m["opex"], a["capex_opex"], unidade(a["capex"]))


def test_programa_realizado_ate_jul_2026():
    d = DECL["programa_por_ano"]["realizado_ate_jul_2026"]
    ents = [x for x in do_ano(2026) if x["estado"] == "programa"]
    assert len(ents) == d["leiloes"]["valor"]
    for campo in ("km", "capex", "opex", "capex_opex"):
        r = soma(ents, campo)
        assert fecha(r, d[campo]), msg(f"realizado 2026 {campo}", r, d[campo])
    m = next(x for x in MERCADO["programa_por_ano"] if x["ano"] == 2026)["realizado_ate_jul_2026"]
    assert m["leiloes"] == d["leiloes"]["valor"]
    for campo in ("km", "capex", "opex"):
        assert fecha(m[campo], d[campo]), campo


# ---------- pp. 25/27: deságio ----------

def test_desagio_n_de_leiloes():
    assert len(desagios()) == DECL["desagio"]["n_leiloes"]["valor"]


@pytest.mark.parametrize("estat", casos("desagio", "media", "mediana", "maior", "menor"))
def test_desagio_estatisticas(estat):
    d = DECL["desagio"][estat]
    ds = desagios()
    r = {"media": statistics.fmean(ds), "mediana": statistics.median(ds), "maior": max(ds), "menor": min(ds)}[estat]
    assert fecha(r, d), msg(estat, r, d)


def _com_lote_5_da_p15():
    """Deságios da p. 97 trocando o do Lote 5 pelo da p. 15 (divergencias.desagio da entidade)."""
    e = next(x for x in ENTIDADES if x["id"] == LOTE_5)
    alt = next(a["valor"] for d in e["divergencias"] if d["campo"] == "desagio" for a in d["alternativas"] if a["pagina"] == 15)
    return [alt if x["leilao"].endswith("Lote 5") else x["desagio"] for x in MERCADO["concorrentes_desagio"]]


def test_desagio_explicado_pelo_lote_5():
    # média: com o Lote 5 da p. 15, arredondada às 2 casas impressas, cai a 1 centésimo da impressa (12,36%)
    ds = _com_lote_5_da_p15()
    assert ds != desagios()
    d = DECL["desagio"]["media"]
    assert fecha(round(statistics.fmean(ds), 2), d), statistics.fmean(ds)
    # média dos leilões com 2 concorrentes: reproduz a p. 25 (17,65%)
    n2 = DECL["desagio"]["por_concorrentes"]["2"]["media"]
    dois = [v for v, x in zip(ds, MERCADO["concorrentes_desagio"]) if x["n"] == 2]
    assert len(dois) == 4 and fecha(round(statistics.fmean(dois), 2), n2), dois


@pytest.mark.parametrize("faixa", casos("desagio_faixa", "ge_18", "de_10_a_18", "de_0_a_10", "zero"))
def test_desagio_faixas_recalculadas(faixa):
    ds = desagios()
    r = {"ge_18": sum(d >= 18 for d in ds), "de_10_a_18": sum(10 <= d < 18 for d in ds),
         "de_0_a_10": sum(0 < d < 10 for d in ds), "zero": sum(d == 0 for d in ds)}[faixa]
    assert r == DECL["desagio"]["faixas"][faixa]["valor"]


def test_desagio_faixas_transcritas_conferem_com_p27():
    # mercado.json (faixas_desagio) × declarado da p. 27: a tabela curada reproduz o RoadShow (as divergências com a
    # p. 97 estão em test_desagio_faixas_recalculadas)
    ordem = ["ge_18", "de_10_a_18", "de_0_a_10", "zero"]
    assert [f["n"] for f in MERCADO["faixas_desagio"]] == [DECL["desagio"]["faixas"][k]["valor"] for k in ordem]
    assert sum(DECL["desagio"]["faixas"][k]["valor"] for k in ordem) == DECL["desagio"]["n_leiloes"]["valor"]


def test_desagio_3_ou_mais_concorrentes():
    ns = [x["n"] for x in MERCADO["concorrentes_desagio"]]
    n3 = sum(n >= 3 for n in ns)
    assert n3 == DECL["desagio"]["leiloes_3_ou_mais_concorrentes"]["valor"]
    assert fecha(100 * n3 / len(ns), DECL["desagio"]["pct_3_ou_mais_concorrentes"])


@pytest.mark.parametrize("n", ["5", "4", "3", "2", "1"])
def test_desagio_por_concorrentes_contagem(n):
    d = DECL["desagio"]["por_concorrentes"][n]
    ns = [x["n"] for x in MERCADO["concorrentes_desagio"]]
    c = ns.count(int(n))
    assert c == d["leiloes"]["valor"]
    assert fecha(100 * c / len(ns), d["pct_total"])


@pytest.mark.parametrize("n", casos("desagio_n", "5", "4", "3", "2", "1"))
def test_desagio_por_concorrentes_media(n):
    d = DECL["desagio"]["por_concorrentes"][n]["media"]
    r = statistics.fmean(x["desagio"] for x in MERCADO["concorrentes_desagio"] if x["n"] == int(n))
    assert fecha(r, d), msg(f"média com {n} concorrente(s)", r, d)


def test_desagio_tabela_p25_transcrita():
    # mercado.json (desagio_por_n_concorrentes) × declarado da p. 25
    linhas = {str(x["concorrentes"]): x for x in MERCADO["desagio_por_n_concorrentes"]}
    assert sorted(linhas) == sorted(DECL["desagio"]["por_concorrentes"])
    for n, d in DECL["desagio"]["por_concorrentes"].items():
        assert linhas[n]["leiloes"] == d["leiloes"]["valor"], n
        assert abs(linhas[n]["pct_total"] - d["pct_total"]["valor"]) <= EPS, n
        assert abs(linhas[n]["desagio_medio"] - d["media"]["valor"]) <= EPS, n
