"""Valores concretos conferidos à mão que antes ficavam fixos nos testes de navegador (e2e).

Os e2e agora comparam a tela com o modelo calculado na própria página, então continuam válidos depois de uma
atualização dos dados. Os números abaixo só mudam quando o dado muda: se um teste falhar depois de uma atualização,
confira o novo valor na fonte indicada na mensagem e, se estiver certo, atualize o esperado aqui.
"""
import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
from roadshow import curados  # noqa: E402
from verificacao import ROADSHOW, aplicar, carregar, carregar_aliases  # noqa: E402

INTEL = ROOT / "data" / "intel"


def _json(p):
    return json.loads(Path(p).read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def conc():
    """CONC como vai para o HTML: base congelada + JSON curados do RoadShow + camada de verificação."""
    return aplicar(curados(_json(ROOT / "data" / "base" / "conc.json"), ROADSHOW), carregar(), carregar_aliases())


@pytest.fixture(scope="module")
def ent(conc):
    return {e["id"]: e for e in conc["entidades"]}


def _part(conc, ano, lote):
    return next(p for p in conc["mercado"]["participantes"] if p["ano"] == ano and lote in p["lote"])


def _alt(e, campo):
    d = next(d for d in e["divergencias"] if d["campo"] == campo)
    return [(a["valor"], a.get("pagina") or a.get("fonte")) for a in d["alternativas"]]


# ---------- SNV (base congelada) ----------

def test_snv_extensao_total():
    s = _json(ROOT / "data" / "base" / "snv.json")
    assert (round(sum(f["ext"] for f in s["fis"]), 1), len(s["fis"])) == (122394.9, 6815), \
        "dado mudou: revise o SNV de data/base/snv.json (KPI inicial do mapa: 122.394,9 km em 6.815 trechos)"


# ---------- RoadShow: fichas e contagens ----------

def test_fichas_rotas_gerais_e_rota_dos_sertoes(ent):
    rg, rs = ent["rotas-gerais"], ent["rota-dos-sertoes"]
    assert (rg["km"], rg["capex_ficha"], rg["ficha"]["wacc"], rg["ficha"]["pracas_implantar"]) == (734.9, 7.34, 13.76, 9), \
        "dado mudou: revise a ficha da Rotas Gerais no RoadShow (data/roadshow/entidades.json)"
    assert (rs["capex_ficha"], rs["data_base_ficha"], rs["capex"], rs["data_base"]) == (4.13, "mar/2023", 6.27, "dez/2024"), \
        "dado mudou: revise a ficha da Rota dos Sertões (capex na data-base da ficha e em dez/2024)"


def test_contagens_do_comparador_e_do_regulatorio(conc):
    assert len(conc["entidades"]) == 54, "dado mudou: revise as 54 concessões federais (39 contratos + 4 + 11) do RoadShow"
    assert len(conc["regulatorio"]["otimizacoes"]) == 11, "dado mudou: revise as 11 otimizações do Regulatório"
    m = conc["mercado"]
    assert (m["leiloes_por_ano"][0]["ano"], min(p["ano"] for p in m["participantes"]),
            max(p["ano"] for p in m["participantes"])) == (1993, 2007, 2026), \
        "dado mudou: revise os períodos do Mercado (leilões por ano desde 1993; participantes 2007–2026)"
    assert (m["desagio_medio_impresso"], m["periodo_concorrencia"]) == (12.36, "2023–2026"), \
        "dado mudou: revise a média dos deságios impressa (pp. 25 e 27) e o período dos agregados de concorrência"


def test_media_impressa_igual_a_da_reconciliacao(conc):
    rec = _json(ROADSHOW / "reconciliacao.json")["desagio"]["media"]
    m = conc["mercado"]
    assert m["desagio_medio_impresso"] == rec["valor"], \
        "dado mudou: mercado.json (desagio_medio_impresso) e reconciliacao.json (desagio.media) divergem — releia a p. 25"
    assert rec["pagina"] in m["fontes"]["desagio_medio_impresso"]


# ---------- camada de verificação dos leilões ----------

def test_lote_5_do_parana(ent, conc):
    e = ent["rodovias-integradas-do-parana-lote-5"]
    f = e["verif"]["desagio"]["fontes"][0]
    assert (e["desagio"], _alt(e, "desagio"), f["orgao"], f["data"]) == (23.83, [(21.83, 97)], "B3", "2025-10-30"), \
        "dado mudou: revise o deságio do Lote 5 do Paraná em verificacao.json (B3, 30/10/2025; RoadShow p. 97: 21,83%)"
    p = _part(conc, 2025, "Lote 5")
    assert (p["vencedor"], p["desagio_vencedor"], p["verif"]["desagio"]["roadshow"]) == ("Reúne Rodovias Holding II S.A.", 23.83, 21.83)


def test_rota_da_celulose(ent, conc):
    e = ent["rota-da-celulose"]
    i = e["inabilitados"][0]
    assert (e["desagio"], i["grupo"], i["desagio"], i["data"]) == (8.0, "Consórcio K&G Rota da Celulose", 9.0, "2025-08-04"), \
        "dado mudou: revise a Rota da Celulose em verificacao.json (vencedor a 8%; K&G inabilitado a 9% em 04/08/2025)"
    assert e["verif"]["inicio_operacao"]["nao_localizado"] is True
    p = _part(conc, 2025, "Rota da Celulose")
    assert (p["vencedor"], p["desagio_vencedor"], p["verif"]["desagio"]["roadshow"]) == ("Consórcio Caminhos da Celulose", 8.0, 9.0)


def test_transbrasiliana_e_regis_2007(conc, ent):
    e = ent["transbrasiliana"]
    assert (e["grupo_vencedor"], e["desagio"], e["leilao"]) == ("Consórcio BRVias", 39.99, "2007-10-09"), \
        "dado mudou: revise a Transbrasiliana em verificacao.json (Consórcio BRVias, 39,99%, 09/10/2007)"
    regis = _part(conc, 2007, "Régis Bittencourt")
    assert (regis["vencedor"], regis["desagio_vencedor"]) == ("Obrascon Huarte Lain Brasil S.A. (OHL Brasil)", 49.19)


def test_ohl_brasil_vence_5_lotes_em_2007(conc):
    """Ranking pelo grupo da época: os 5 lotes da OHL Brasil em 2007 não vão para a Arteris (controle vendido em 2012)."""
    grupo = {a["nome"]: a["grupo"] for a in conc["grupos_alias"]}
    vit = [grupo.get(p["vencedor"]) for p in conc["mercado"]["participantes"] if p["ano"] == 2007]
    assert (vit.count("OHL Brasil"), vit.count("Arteris"), vit.count("Consórcio BRVias")) == (5, 0, 1), \
        "dado mudou: revise os vencedores de 2007 em mercado.json/verificacao.json e os grupos em grupos_alias.json"


def test_regis_via_liberdade_e_sao_borja(ent):
    r = ent["regis-bittencourt"]
    assert (r["assinatura"], r["assinatura_aditivo"], r["prazo_anos"], _alt(r, "prazo_anos")) == \
        ("2008-02-14", "2026-12-21", 15, [(25, "B3, 23/07/2026")]), \
        "dado mudou: revise a Régis Bittencourt em verificacao.json (contrato de 2008, aditivo, 15 anos × B3 25 anos)"
    assert _alt(ent["via-liberdade"], "assinatura") == [("2026-01-20", 97), ("-", 5)], \
        "dado mudou: revise a assinatura da Via Liberdade (RoadShow p. 97: 20/01/2026)"
    sb = ent["ponte-binacional-sao-borja-santo-tome"]
    assert (sb["desagio"], sb["verif"]["desagio"]["nao_se_aplica"], _alt(sb, "desagio")) == (None, True, [(0.38, 97)]), \
        "dado mudou: revise o deságio da Ponte São Borja (leilão por outorga; RoadShow imprime 0,38%)"


def test_rotas_gerais_vencedor(ent):
    e = ent["rotas-gerais"]
    assert (e["grupo_vencedor"], e["desagio"]) == ("Ecorodovias Concessões e Serviços S.A.", 19.0), \
        "dado mudou: revise o vencedor da Rotas Gerais em verificacao.json"


# ---------- blocos públicos (data/intel/) ----------

def test_praca_e_series_antt():
    a = _json(INTEL / "antt.json")
    p = a["pracas"]
    assert (p["ano"], p["serie_meses"][0], p["serie_meses"][-1]) == (2025, "2024-01", "2026-08"), \
        "dado mudou: revise o ano do VMD das praças e o período da série mensal da ANTT (scripts/intel/antt.py)"
    c = a["capas"]["nova-rota-do-oeste"]
    assert (c["extensao_km"], c["assinatura"], c["edital"], c["cobranca"], c["database"], c["prazo"]) == \
        (850.9, "2014-03-12", "003/2013", "2015-09-06", "21/set", "30 anos"), \
        "dado mudou: revise a capa da Nova Rota do Oeste na ANTT (extensão, assinatura, edital, cobrança, data-base, prazo)"


def test_sorriso_soja():
    agro, mun = _json(INTEL / "agro.json"), _json(INTEL / "municipios.json")
    k = mun["ids"].index("5107925")
    assert (agro["ano"], agro["produtos"]["soja"][k]) == (2025, 2343000), \
        "dado mudou: revise a soja de Sorriso/MT na PAM do IBGE (agro.json)"


def test_fretes_com_distancia_suspeita():
    f = _json(INTEL / "multimodal.json")["fretes"]
    sus = [l for l in f["linhas"] if "km_suspeito" in l[6]]
    i_uf = f["campos"].index("uf_o")
    assert (len(sus), sum(1 for l in sus if l[i_uf] == "MS")) == (25, 17), \
        "dado mudou: revise as rotas de frete com distância suspeita (boletim da CONAB, scripts/intel/multimodal.py)"
