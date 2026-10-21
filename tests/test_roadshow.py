"""Testes dos dados curados do RoadShow 2026-2027 (data/roadshow/)."""
import json
from collections import Counter
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data" / "roadshow"
ESTADOS = {"agendado2026", "projeto2027", "programa", "vigente", "snv", "pos2027", "nenhum"}
TIPOS = {"nova", "otimizacao", "delegada"}
NUM_TOP = ["km", "capex", "opex", "capex_ficha", "opex_ficha", "capex_vpl", "opex_vpl", "participantes", "desagio"]


def load_json(name):
    return json.loads((DATA / name).read_text(encoding="utf-8"))


def entidades():
    return load_json("entidades.json")


def by_id(i):
    return next(x for x in entidades() if x["id"] == i)


# ---------- Task 1: entidades ----------

def test_contagens():
    e = entidades()
    assert sorted(x["linha_p5"] for x in e if x.get("linha_p5")) == list(range(1, 40))
    prog = [x for x in e if x["ano_programa"]]
    assert Counter(x["ano_programa"] for x in prog) == {2023: 2, 2024: 7, 2025: 13, 2026: 7, 2027: 11}
    assert {x["id"] for x in e if x["estado"] == "agendado2026"} == {
        "rota-arco-norte", "rota-do-pequi", "rota-agro-central", "rota-2-de-julho"}
    assert sum(1 for x in e if x["estado"] == "projeto2027") == 11
    assert sum(1 for x in e if x["estado"] == "programa") == 25
    assert len(load_json("estudos_pos2027.json")) == 27


def test_ids_unicos_e_relaciona_valido():
    e = entidades()
    ids = [x["id"] for x in e]
    assert len(ids) == len(set(ids))
    for x in e:
        for r in x.get("relaciona") or []:
            assert r in ids, (x["id"], r)


def test_estado_e_tipo_validos():
    for x in entidades():
        assert x["estado"] in ESTADOS, x["id"]
        assert x["tipo"] in TIPOS, x["id"]
        assert x["brs"] and x["ufs"], x["id"]


def test_fontes_cobrem_numeros():
    for x in entidades():
        for k in NUM_TOP:
            if x.get(k) is not None:
                assert k in x["fontes"], (x["id"], k)
        for k, v in (x.get("ficha") or {}).items():
            if isinstance(v, (int, float)) and not isinstance(v, bool):
                assert f"ficha.{k}" in x["fontes"], (x["id"], k)


def test_valores_conhecidos():
    g = by_id("rotas-gerais")
    assert (g["km"], g["ficha"]["wacc"], g["ficha"]["pracas_implantar"]) == (734.9, 13.76, 9)
    assert g["capex"] == 7.34 and g["data_base"] == "dez/2024"
    s = by_id("rota-dos-sertoes")
    assert (s["capex"], s["capex_ficha"], s["data_base_ficha"]) == (6.27, 4.13, "mar/2023")
    assert by_id("rota-verde-goias")["km"] == 426.2
    assert by_id("regis-bittencourt")["estado"] == "programa"
    assert by_id("rota-2-de-julho")["tipo"] == "nova"
    assert by_id("nova-381")["brs"] == ["381"] and by_id("fernao-dias")["brs"] == ["381"]


def test_divergencia_vs_nota_base():
    # capex/opex com data-base diferente é nota de data-base, não divergência
    for x in entidades():
        for d in x.get("divergencias") or []:
            assert d["alternativas"], x["id"]
            for a in d["alternativas"]:
                assert a.get("pagina"), x["id"]
                if d["campo"] in ("capex", "opex"):
                    assert a.get("data_base", x["data_base"]) == x["data_base"], (x["id"], d)
        for n in x.get("notas_base") or []:
            assert n["data_base"] and n["pagina"], x["id"]


def test_capex_anual_nao_excede_capex_ficha():
    # O gráfico das fichas cobre só o ciclo de obras: a soma pode ser menor que o capex total, nunca maior.
    for x in entidades():
        f = x.get("ficha") or {}
        if f.get("capex_anual") and x.get("capex_ficha"):
            total = sum(a["valor"] for a in f["capex_anual"]) / 1000
            assert 0 < total <= 1.02 * x["capex_ficha"], (x["id"], total, x["capex_ficha"])


def test_estudos_pos2027():
    for s in load_json("estudos_pos2027.json"):
        assert s["brs"] and s["ufs"] and s["pagina"]
        assert isinstance(s["possivel_2027"], bool)
    assert sum(s["possivel_2027"] for s in load_json("estudos_pos2027.json")) == 3


# ---------- Task 2: mercado e regulatório ----------

MERCADO_KEYS = ["leiloes_por_ano", "participantes", "concorrentes_desagio", "faixas_desagio", "grupos",
                "gestao", "investimentos", "indicadores_40", "diagnostico"]
SECOES = ["modelo", "riscos", "garantias", "financiamento", "otimizacoes", "sustentabilidade", "estruturadores", "estudos"]


def test_mercado_series():
    m = load_json("mercado.json")
    for k in MERCADO_KEYS:
        assert m[k], k
        assert k in m["fontes"], k
    anos = [x["ano"] for x in m["leiloes_por_ano"]]
    assert len(anos) == len(set(anos)) and min(anos) <= 1993 and max(anos) >= 2030
    assert len(m["concorrentes_desagio"]) == 25
    ind = {x["rotulo"]: x["valor"] for x in m["indicadores_40"]}
    for rot, val in [("Duplicação", 4374), ("Faixa adicional", 3702), ("Contornos", 442), ("Marginais", 959)]:
        assert any(rot.lower() in k.lower() and v == val for k, v in ind.items()), rot


def test_regulatorio():
    r = load_json("regulatorio.json")
    assert [s["id"] for s in r["secoes"]] == SECOES
    for s in r["secoes"]:
        assert s["titulo"] and s["pagina"] and s["blocos"], s["id"]
    assert len(r["otimizacoes"]) == 11
    modelo = json.dumps(next(s for s in r["secoes"] if s["id"] == "modelo"), ensure_ascii=False)
    assert "18%" in modelo and "10%" in modelo and "5%" in modelo


# ---------- Task 3: recorte e payload ----------

import sys  # noqa: E402
sys.path.insert(0, str(ROOT / "scripts"))
RAW_SHP = ROOT / "data" / "raw" / "SNV_202607A.shp"
needs_raw = pytest.mark.skipif(not RAW_SHP.exists(), reason="dado bruto ausente")


def _rec(code, br, uf, ki, kf, adm="Federal"):
    return {"vl_codigo": code, "vl_br": br, "sg_uf": uf, "vl_km_inic": ki, "vl_km_fina": kf,
            "vl_extensa": kf - ki, "ds_tipo_ad": adm, "nm_tipo_tr": "Eixo Principal", "desc_coinc": "-", "ds_coinc": "",
            "points": [(ki / 100, 0.0), (kf / 100, 0.0)]}


def test_resolve_ranges_overlap():
    from roadshow import resolve_ranges
    recs = [_rec("a", "116", "MG", 0, 10), _rec("b", "116", "MG", 10, 20), _rec("c", "116", "MG", 20, 30),
            _rec("d", "116", "BA", 10, 20)]
    groups = [[0], [1], [2], [3]]
    assert resolve_ranges(recs, groups, [{"br": "116", "uf": "MG", "km_ini": 9, "km_fim": 25}]) == {1, 2}


def test_resolve_ranges_tipo_e_codigos():
    from roadshow import resolve_ranges
    recs = [_rec("a", "381", "MG", 0, 10), dict(_rec("b", "381", "MG", 2, 5), nm_tipo_tr="Contorno"),
            dict(_rec("c", "381", "MG", 50, 60), nm_tipo_tr="Contorno")]
    groups = [[0], [1], [2]]
    assert resolve_ranges(recs, groups, [{"br": "381", "uf": "MG", "km_ini": 0, "km_fim": 10}]) == {0}
    assert resolve_ranges(recs, groups, [{"br": "381", "uf": "MG", "km_ini": 0, "km_fim": 10, "tipo": "Contorno"}]) == {1}
    assert resolve_ranges(recs, groups, [], codigos=["c"]) == {2}


def test_coverage_counts_each_physical_once():
    from roadshow import coverage
    recs = [_rec("a", "116", "MG", 0, 10), _rec("b", "116", "MG", 10, 20)]
    assert coverage(recs, [[0], [1]], {0, 1}) == 20


def test_classify():
    from roadshow import classify
    assert classify(100, 96) == "ok" and classify(500, 492) == "ok"
    assert classify(100, 85) == "aproximado" and classify(100, 70) == "falha"


def test_snv_only():
    from roadshow import snv_only
    recs = [_rec("a", "392", "RS", 0, 10, "Concessão Federal"), _rec("b", "116", "MG", 0, 10, "Concessão Federal"),
            _rec("c", "116", "MG", 10, 20)]
    assert snv_only(recs, [[0], [1], [2]], covered={1}) == [0]


@needs_raw
def test_todas_entidades_mapeadas():
    from roadshow import build_conc
    from snv import group_physical, load_records
    recs = load_records(str(RAW_SHP))
    conc, report = build_conc(recs, group_physical(recs), DATA)
    assert not [r for r in report if r["qualidade"] == "falha"]
    for e, fis in zip(conc["entidades"], conc["entFis"]):
        assert fis or e["qualidade"] == "nao_mapeado", e["id"]
    ids = {e["id"]: i for i, e in enumerate(conc["entidades"])}
    a, b = set(conc["entFis"][ids["nova-381"]]), set(conc["entFis"][ids["fernao-dias"]])
    assert a and b and not (a & b)
    assert conc["snvOnly"]
    br392 = {j for j, g in enumerate(group_physical(recs)) if recs[g[0]]["vl_br"] == "392" and recs[g[0]]["sg_uf"] == "RS"}
    assert br392 & set(conc["snvOnly"])


def test_notas_de_trecho_sem_fontes_externas():
    # Spec v2: nada de fora do RoadShow na interface (as notas aparecem na ficha).
    import re
    for k, v in load_json("trechos.json").items():
        nota = v.get("nota") or ""
        assert not re.search(r"\bPER\b|edital|briefing|http|Diário|imprensa", nota, re.I), (k, nota)


# ---------- Fechamento (Task 4): ABDIB, debêntures, pavimento, comparativos e diagramas ----------

sys.path.insert(0, str(ROOT / "scripts" / "extract"))
PDF = ROOT / "data" / "raw" / "roadshow.pdf"
try:
    import pymupdf
except ImportError:  # pragma: no cover
    pymupdf = None
needs_pdf = pytest.mark.skipif(pymupdf is None or not PDF.exists(), reason="PDF do RoadShow ausente em data/raw/")


def _texto(pag):
    """Texto da página `pag` (numeração do RoadShow, 1 = primeira) com espaços normalizados."""
    with pymupdf.open(PDF) as doc:
        return " ".join(doc[pag - 1].get_text().split())


def _br(v):
    """84.5 → '84,5'; 54.0 → '54' (como o RoadShow imprime)."""
    s = repr(float(v))
    return (s[:-2] if s.endswith(".0") else s).replace(".", ",")


def _intervalo(v, casas):
    """Faixa de valores que, arredondados a `casas` decimais, são impressos como `v`."""
    h = 0.5 * 10 ** -casas
    return v - h, v + h


def _casas(v):
    s = _br(v)
    return len(s.split(",")[1]) if "," in s else 0


def _razao_fecha(base, comp, impresso):
    """`impresso` (múltiplo) cabe na razão comp/base, considerando o arredondamento de cada valor impresso."""
    b0, b1 = _intervalo(base, _casas(base))
    c0, c1 = _intervalo(comp, _casas(comp))
    i0, i1 = _intervalo(impresso, _casas(impresso))
    return c0 / b1 <= i1 and c1 / b0 >= i0


ABDIB_PINS = [(2010, 84.5, 109.3, 193.8), (2017, 54, 105.6, 159.6), (2024, 62.2, 197.1, 259.3)]
DEB_PINS = [(2018, 1.6), (2021, 7.5), (2025, 28.2)]
PAV_PINS = [("Bom", 18.8), ("Ruim", 65.6), ("Péssimo", 91.5)]
# (id, lado, valor acumulado impresso) — pelo menos 3 valores por página
COMP_PINS = [("publico", "base", 26.22), ("publico", "comparado", 48.29), ("privado", "comparado", 218),
             ("total", "base", 118.29), ("total", "comparado", 353.53), ("por_km", "base", 0.88), ("por_km", "comparado", 2.64)]


def test_abdib_serie_e_totais():
    m = load_json("mercado.json")
    a = m["abdib"]
    assert m["fontes"]["abdib"] == 39 and m["notas"]["abdib"]
    assert a["fonte_original"]
    anos = [x["ano"] for x in a["serie"]]
    assert anos == list(range(anos[0], anos[-1] + 1)) and anos[0] == 2010 and anos[-1] == 2024
    for x in a["serie"]:  # total impresso = público + privado (cada um com 1 casa)
        assert abs(x["publico"] + x["privado"] - x["total"]) <= 0.15, x
    por_ano = {x["ano"]: x for x in a["serie"]}
    for ano, pub, priv, tot in ABDIB_PINS:
        assert (por_ano[ano]["publico"], por_ano[ano]["privado"], por_ano[ano]["total"]) == (pub, priv, tot)


def test_debentures_serie():
    m = load_json("mercado.json")
    d = m["debentures"]
    assert m["fontes"]["debentures"] == 77 and m["notas"]["debentures"]
    assert "fev/2025" in d["precos"]
    anos = [x["ano"] for x in d["serie"]]
    assert anos == list(range(2018, 2026))
    por_ano = {x["ano"]: x["valor"] for x in d["serie"]}
    for ano, v in DEB_PINS:
        assert por_ano[ano] == v
    assert d["destaque"] == {"ano": 2025, "valor": por_ano[2025]}  # "R$ 28,2 bi emitidos ... em 2025" = último ponto


def test_pavimento():
    m = load_json("mercado.json")
    p = m["pavimento"]
    assert m["fontes"]["pavimento"] == 35 and m["notas"]["pavimento"]
    assert [e["estado"] for e in p["estados"]] == ["Bom", "Regular", "Ruim", "Péssimo"]
    vals = {e["estado"]: e["aumento_pct"] for e in p["estados"]}
    for est, v in PAV_PINS:
        assert vals[est] == v
    assert p["acrescimo_medio"] == 32.5 and p["fonte_original"]
    assert sorted(vals.values()) == [vals[e] for e in ["Bom", "Regular", "Ruim", "Péssimo"]]  # cresce com a piora


def test_comparativos_fecham():
    m = load_json("mercado.json")
    assert m["fontes"]["comparativos"] == [41, 45] and m["notas"]["comparativos"]
    cs = {c["id"]: c for c in m["comparativos"]}
    assert list(cs) == ["publico", "privado", "total", "por_km"]
    for cid, lado, v in COMP_PINS:
        assert cs[cid][lado]["valor"] == v, (cid, lado)
    for c in cs.values():
        assert c["pagina"] in (41, 45) and c["rotulo"] and c["curto"] and c["unidade"]
        b, k = c["base"], c["comparado"]
        assert not b["previsto"] and k["previsto"]
        for lado in (b, k):  # período "AAAA a AAAA" com o número de anos impresso
            ini, fim = map(int, lado["periodo"].split(" a "))
            assert fim - ini + 1 == lado["anos"], c["id"]
            if "media_anual" in lado:  # média anual impressa = acumulado ÷ anos, no arredondamento
                lo, hi = _intervalo(lado["valor"], _casas(lado["valor"]))
                m0, m1 = _intervalo(lado["media_anual"], _casas(lado["media_anual"]))
                assert lo / lado["anos"] <= m1 and hi / lado["anos"] >= m0, (c["id"], lado)
        assert _razao_fecha(b["valor"], k["valor"], c["multiplo"]), c["id"]
        # variação impressa (+84%, +311%, +199%) = múltiplo − 1, no arredondamento dos valores
        assert _razao_fecha(b["valor"], k["valor"], round(1 + c["variacao_pct"] / 100, 2)), c["id"]


def test_comparativo_total_reconcilia_com_serie_anual():
    # p. 45, 2016–2022: público + privado da série anual da p. 43 (investimentos) = R$ 118,29 bi
    m = load_json("mercado.json")
    tot = next(c for c in m["comparativos"] if c["id"] == "total")
    inv = [x for x in m["investimentos"] if 2016 <= x["ano"] <= 2022]
    assert abs(sum((x["publico"] or 0) + x["privado"] for x in inv) - tot["base"]["valor"]) < 0.01


@needs_pdf
def test_pins_contra_o_pdf():
    t39, t77, t35 = _texto(39), _texto(77), _texto(35)
    for _, pub, priv, tot in ABDIB_PINS:
        for v in (pub, priv, tot):
            assert _br(v) in t39.split(), v
    for _, v in DEB_PINS:
        assert _br(v) in t77.split(), v
    for est, v in PAV_PINS:
        assert f"{est} {_br(v)}%" in t35, (est, v)
    assert "é de 32,5% devido" in t35
    t = {41: _texto(41), 45: _texto(45)}
    m = load_json("mercado.json")
    pag = {c["id"]: c["pagina"] for c in m["comparativos"]}
    for cid, _, v in COMP_PINS:
        assert f"R$ {_br(v)} {'mi' if cid == 'por_km' else 'bi'}" in t[pag[cid]], (cid, v)


@needs_pdf
def test_extrator_reproduz_o_json():
    import roadshow_v5
    m = load_json("mercado.json")
    with pymupdf.open(PDF) as doc:
        assert roadshow_v5.abdib(doc) == m["abdib"]["serie"]
        assert roadshow_v5.debentures(doc) == m["debentures"]["serie"]
        assert roadshow_v5.pavimento(doc) == {"acrescimo_medio": m["pavimento"]["acrescimo_medio"], "estados": m["pavimento"]["estados"]}
        assert roadshow_v5.comparativos(doc) == m["comparativos"]


DIAGRAMAS = ["fluxo-projeto", "fluxo-financiamento"]


def test_diagramas_regulatorio():
    r = load_json("regulatorio.json")
    ds = {d["id"]: d for d in r["diagramas"]}
    assert list(ds) == DIAGRAMAS
    secoes = {s["id"] for s in r["secoes"]}
    for d in ds.values():
        assert d["secao"] in secoes and d["titulo"] and d["descricao"] and d["paginas"]
        assert all(p % 2 == 1 for p in d["paginas"]), d["id"]  # só páginas em português
        assert d["legenda"]
        assert d["origem"] in ("adaptado", "esquema"), d["id"]  # nenhum dos dois é cópia de figura do RoadShow
    f = ds["fluxo-projeto"]
    assert f["origem"] == "adaptado" and f["pagina_figura"] in f["paginas"]
    assert "acrescentados por nós" in f["nota"] and "leitura nossa" in f["nota"]
    ids = [e["id"] for e in f["etapas"]]
    assert len(ids) == len(set(ids)) == 10 and all(e["titulo"] for e in f["etapas"])
    dec = f["decisao"]
    assert dec["apos"] in ids and dec["para"] in ids and ids.index(dec["para"]) == ids.index(dec["apos"]) + 1
    assert "18%" in dec["pergunta"] and "aporte" in dec["sim"].lower()
    assert [x["pagina"] for x in f["redacoes"]] == [61, 65, 73] and f["nota"]
    g = ds["fluxo-financiamento"]
    assert g["origem"] == "esquema" and "não é uma figura do RoadShow" in g["nota"]
    nos = {n["id"]: n for n in g["nos"]}
    assert {n["tipo"] for n in nos.values()} == {"fonte", "concessionaria", "destino", "garantia"}
    assert all(n["pagina"] in (65, 73, 75, 77) for n in nos.values() if n["tipo"] != "concessionaria")
    for a in g["arestas"]:
        assert a["de"] in nos and a["para"] in nos and a["tipo"] in ("recursos", "garantia"), a
    for tipo in ("fonte", "concessionaria", "destino", "garantia", "recursos"):
        assert g["legenda"].get(tipo), tipo


@needs_pdf
def test_diagramas_contra_o_pdf():
    import roadshow_v5
    r = load_json("regulatorio.json")
    f = next(d for d in r["diagramas"] if d["id"] == "fluxo-projeto")
    for red in f["redacoes"]:  # as duas redações do limite de 18% estão como citadas
        assert red["texto"] in _texto(red["pagina"]), red
    t61 = _texto(61)
    assert "a partir de 18% de deságio" in t61
    for e in f["etapas"]:
        if e.get("responsavel"):
            assert e["responsavel"] in t61, e
    with pymupdf.open(PDF) as doc:
        assert [p for p, _ in roadshow_v5.trechos_18(doc, [61, 65, 73])] == [61, 65, 73]
