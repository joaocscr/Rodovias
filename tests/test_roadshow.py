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
