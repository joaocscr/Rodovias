import copy
import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
from verificacao import (  # noqa: E402
    CAMPOS, MOTIVOS, aplicar, carregar, carregar_aliases, cobertura, nomes_do_ranking, relatorio_markdown,
    tipo_campo, validar,
)

RS15 = {"tipo": "roadshow", "pagina": 15}
OFICIAL = {"tipo": "oficial", "orgao": "ANTT", "titulo": "Contrato", "data": "2024-01-31",
           "url": "https://www.gov.br/antt/x", "acesso": "2026-10-21", "trecho": "assinado em 31/01/2024"}
IMPRENSA = {"tipo": "imprensa", "orgao": "Agência iNFRA", "titulo": "Leilão", "data": "2025-10-30",
            "url": "https://agenciainfra.com/x", "acesso": "2026-10-21"}


@pytest.fixture
def conc():
    return {
        "entidades": [
            {"id": "lote-5", "nome": "Lote 5", "desagio": 21.83, "leilao": "2025-10-30",
             "assinatura": "2026-03-16", "grupo_vencedor": "Rune Rodovias",
             "fontes": {"desagio": 97, "assinatura": 97, "leilao": 97},
             "divergencias": [{"campo": "desagio", "exibido": 21.83,
                               "alternativas": [{"valor": 23.83, "pagina": 15}],
                               "nota": "Deságio do vencedor: 21,83% (p97) × 23,83% (p15),"}]},
            {"id": "celulose", "nome": "Rota da Celulose", "desagio": 9.0, "leilao": "2025-05-22",
             "assinatura": "2025-11-30", "grupo_vencedor": "Caminhos da Celulose",
             "fontes": {"desagio": [99, 15], "assinatura": 99}, "divergencias": []},
        ],
        "mercado": {
            "participantes": [
                {"ano": 2007, "lote": "Transbrasiliana", "vencedor": "TPI – Triunfo", "desagio_vencedor": None,
                 "outros": [{"grupo": "TPI Triunfo Participações", "desagio": 5.68}]},
                {"ano": 2025, "lote": "Lote 5", "vencedor": "Reune", "desagio_vencedor": 21.83, "outros": []},
            ],
            "concorrentes_desagio": [{"leilao": "Rodovias Integradas do Paraná - Lote 5", "ano": 2025, "n": 2,
                                      "desagio": 21.83}],
        },
    }


# grupos dos nomes que o fixture `conc` já traz em participantes (vencedor e demais proponentes)
ALIASES_FIXTURE = [{"nome": "TPI – Triunfo", "grupo": "Triunfo", "motivo": "grafia"},
                   {"nome": "TPI Triunfo Participações", "grupo": "Triunfo", "motivo": "grafia"},
                   {"nome": "Reune", "grupo": "Pátria", "motivo": "razão social do grupo"}]


def com_fixture(*aliases):
    return {"aliases": ALIASES_FIXTURE + list(aliases)}


def verif(leiloes, fontes=None):
    return {"versao": 1, "fontes": {"rs-p15": RS15, "antt": OFICIAL, "infra": IMPRENSA} if fontes is None else fontes,
            "leiloes": leiloes}


def leilao(campos, **kw):
    return {"chave": "rip-lote-5", "ent": "lote-5", "campos": campos, **kw}


def test_tipo_campo_hierarquia():
    assert tipo_campo([IMPRENSA, RS15]) == "roadshow"
    assert tipo_campo([IMPRENSA, OFICIAL]) == "oficial"
    assert tipo_campo([IMPRENSA]) == "imprensa"


def test_campos_sao_os_nove_de_leilao():
    assert set(CAMPOS) == {"leilao", "grupo_vencedor", "desagio", "assinatura", "assinatura_aditivo",
                           "inicio_operacao", "tarifa_teto", "tarifa_vencedora", "prazo_anos"}


def test_validar_aceita_camada_correta(conc):
    v = verif([leilao({"desagio": {"valor": 23.83, "fontes": ["rs-p15", "infra"]},
                       "assinatura": {"valor": "2026-03-16", "fontes": ["antt"]}},
                      participantes={"ano": 2025, "lote": "Lote 5"},
                      concorrentes="Rodovias Integradas do Paraná - Lote 5",
                      notas=[{"texto": "Fato novo.", "fontes": ["infra"]}],
                      inabilitados=[{"grupo": "K&G", "desagio": 9.0, "data": "2025-08-04", "fontes": ["infra"]}])])
    assert validar(v, conc) == []


def test_validar_exige_fonte(conc):
    erros = validar(verif([leilao({"desagio": {"valor": 23.83, "fontes": []}})]), conc)
    assert len(erros) == 1 and "rip-lote-5" in erros[0]


def test_validar_oficial_dominio(conc):
    def com_url(url):
        return verif([leilao({"assinatura": {"valor": "2026-03-16", "fontes": ["antt"]}})],
                     fontes={"antt": {**OFICIAL, "url": url}})
    assert len(validar(com_url("https://exemplo.com/x"), conc)) == 1
    assert len(validar(com_url("https://gov.br.exemplo.com/x"), conc)) == 1
    assert validar(com_url("https://www.gov.br/antt/x"), conc) == []
    assert validar(com_url("https://www.b3.com.br/x"), conc) == []


def test_validar_imprensa_completa(conc):
    sem_data = {k: v for k, v in IMPRENSA.items() if k != "data"}
    v = verif([leilao({"desagio": {"valor": 23.83, "fontes": ["infra"]}})], fontes={"infra": sem_data})
    erros = validar(v, conc)
    assert len(erros) == 1 and "infra" in erros[0]


def test_validar_ligacoes(conc):
    ok = {"desagio": {"valor": 23.83, "fontes": ["rs-p15"]}}
    casos = [
        {"chave": "a", "ent": "nao-existe", "campos": ok},
        {"chave": "b", "participantes": {"ano": 2025, "lote": "Lote 55"}, "campos": ok},
        {"chave": "c", "concorrentes": "Lote inexistente", "campos": ok},
        {"chave": "d", "ent": "lote-5", "campos": {"capex": {"valor": 1.0, "fontes": ["rs-p15"]}}},
        {"chave": "e", "ent": "lote-5", "campos": {"desagio": {"valor": 23.83, "fontes": ["nao-declarada"]}}},
    ]
    for caso in casos:
        erros = validar(verif([caso]), conc)
        assert len(erros) == 1 and caso["chave"] in erros[0], (caso, erros)


def test_validar_exige_ligacao(conc):
    erros = validar(verif([{"chave": "x", "campos": {"desagio": {"valor": 1.0, "fontes": ["rs-p15"]}}}]), conc)
    assert len(erros) == 1 and "x" in erros[0]


def test_validar_chave_duplicada(conc):
    l1 = leilao({"desagio": {"valor": 23.83, "fontes": ["rs-p15"]}})
    erros = validar(verif([l1, {**copy.deepcopy(l1), "ent": "celulose"}]), conc)
    assert len(erros) == 1 and "chave repetida" in erros[0]


def test_validar_alvo_ligado_a_dois_leiloes(conc):
    ok = {"desagio": {"valor": 23.83, "fontes": ["rs-p15"]}}
    casos = [
        [{"chave": "a", "ent": "lote-5", "campos": ok}, {"chave": "b", "ent": "lote-5", "campos": ok}],
        [{"chave": "a", "participantes": {"ano": 2025, "lote": "Lote 5"}, "campos": ok},
         {"chave": "b", "ent": "celulose", "participantes": {"ano": 2025, "lote": "Lote 5"}, "campos": ok}],
        [{"chave": "a", "concorrentes": "Rodovias Integradas do Paraná - Lote 5", "campos": ok},
         {"chave": "b", "concorrentes": "Rodovias Integradas do Paraná - Lote 5", "notas": []}],
    ]
    for leiloes in casos:
        erros = validar(verif(leiloes), conc)
        assert len(erros) == 1 and erros[0].startswith("b:") and "'a'" in erros[0], erros
    # ligações distintas do mesmo leilão de dois leilões diferentes passam
    assert validar(verif([{"chave": "a", "ent": "lote-5", "campos": ok},
                          {"chave": "b", "ent": "celulose", "campos": ok}]), conc) == []


def test_validar_campo_sem_onde_aplicar(conc):
    so_conc = {"chave": "x", "concorrentes": "Rodovias Integradas do Paraná - Lote 5",
               "campos": {"assinatura": {"valor": "2026-03-16", "fontes": ["antt"]}}}
    erros = validar(verif([so_conc]), conc)
    assert len(erros) == 1 and "x" in erros[0] and "assinatura" in erros[0]
    # deságio cabe na linha de concorrentes; assinatura cabe na linha de participantes
    assert validar(verif([{**so_conc, "campos": {"desagio": {"valor": 23.83, "fontes": ["rs-p15"]}}}]), conc) == []
    assert validar(verif([{**so_conc, "participantes": {"ano": 2025, "lote": "Lote 5"}}]), conc) == []


def test_validar_nao_localizado_sem_valor(conc):
    ok = {"desagio": {"valor": None, "nao_localizado": True, "fontes": []}}
    assert validar(verif([leilao(ok)]), conc) == []
    ruim = {"desagio": {"valor": 9.0, "nao_localizado": True, "fontes": []}}
    assert len(validar(verif([leilao(ruim)]), conc)) == 1


def test_validar_tipo_do_valor(conc):
    casos = [{"assinatura": {"valor": "31/01/2024", "fontes": ["antt"]}},
             {"desagio": {"valor": "23,83", "fontes": ["rs-p15"]}},
             {"grupo_vencedor": {"valor": "", "fontes": ["rs-p15"]}}]
    for campos in casos:
        assert len(validar(verif([leilao(campos)]), conc)) == 1, campos


def test_validar_tarifas_sao_texto(conc):
    # tarifa leva unidade e data-base ("R$ 4,083 por praça (jul/2007)"): texto, não número
    ok = {"tarifa_teto": {"valor": "R$ 4,083 por praça (jul/2007)", "fontes": ["antt"]},
          "tarifa_vencedora": {"valor": "R$ 2,452 por praça (jul/2007)", "fontes": ["antt"]}}
    assert validar(verif([leilao(ok)]), conc) == []
    for campo in ("tarifa_teto", "tarifa_vencedora"):
        for ruim in (4.083, "", "   "):
            erros = validar(verif([leilao({campo: {"valor": ruim, "fontes": ["antt"]}})]), conc)
            assert len(erros) == 1 and campo in erros[0] and "texto" in erros[0], (campo, ruim, erros)


def test_validar_nome_sem_alias(conc):
    v = verif([leilao({"grupo_vencedor": {"valor": "Consórcio BRVias", "fontes": ["antt"]}})])
    erros = validar(v, conc, com_fixture({"nome": "Outro", "grupo": "Outro", "motivo": "mesmo nome"}))
    assert len(erros) == 1 and "Consórcio BRVias" in erros[0]
    com = com_fixture({"nome": "Consórcio BRVias", "grupo": "BRVias", "motivo": "mesmo nome"})
    assert validar(v, conc, com) == []
    assert validar(v, conc) == []  # sem tabela de aliases, não confere nomes


def test_validar_exige_alias_para_todo_nome_de_participantes(conc):
    # vencedor exibido (verificado), demais proponentes e inabilitados ligados à linha precisam de grupo
    v = verif([{"chave": "transbrasiliana", "participantes": {"ano": 2007, "lote": "Transbrasiliana"},
                "campos": {"grupo_vencedor": {"valor": "Consórcio BRVias", "fontes": ["antt"]}},
                "inabilitados": [{"grupo": "K&G", "desagio": 9.0, "data": "2025-08-04", "fontes": ["infra"]}]}])
    aliases = {"aliases": [{"nome": "Consórcio BRVias", "grupo": "BRVias", "motivo": "mesmo nome"}]}
    erros = validar(v, conc, aliases)
    # "TPI – Triunfo" deixou de ser o vencedor exibido: não precisa de grupo
    assert sorted(erros) == sorted(f"participantes: nome {n!r} sem grupo em grupos_alias.json"
                                   for n in ("K&G", "Reune", "TPI Triunfo Participações")), erros
    tudo = {"aliases": aliases["aliases"] + [{"nome": n, "grupo": n, "motivo": "mesmo nome"}
                                             for n in ("K&G", "Reune", "TPI Triunfo Participações")]}
    assert validar(v, conc, tudo) == []


def test_nomes_do_ranking_usa_valores_aplicados(conc):
    v = verif([{"chave": "transbrasiliana", "participantes": {"ano": 2007, "lote": "Transbrasiliana"},
                "campos": {"grupo_vencedor": {"valor": "Consórcio BRVias", "fontes": ["antt"]}},
                "inabilitados": [{"grupo": "K&G", "fontes": ["infra"]}]}])
    assert nomes_do_ranking(aplicar(conc, v, {"aliases": []})) == [
        "Consórcio BRVias", "K&G", "Reune", "TPI Triunfo Participações"]


def test_validar_aliases_formato(conc):
    ruins = [{"nome": "A", "grupo": "A", "motivo": "aquisição"},
             {"nome": "", "grupo": "A", "motivo": "mesmo nome"}]
    for a in ruins:
        assert len(validar(verif([]), conc, com_fixture(a))) == 1, a
    dup = [{"nome": "A", "grupo": "A", "motivo": "mesmo nome"}, {"nome": "A", "grupo": "B", "motivo": "grafia"}]
    assert len(validar(verif([]), conc, com_fixture(*dup))) == 1


def test_validar_alias_fontes(conc):
    # `fontes` (opcional) cita ids declarados em verificacao.json
    ok = {"nome": "A", "grupo": "A", "motivo": "consórcio liderado por", "fontes": ["antt"]}
    assert validar(verif([]), conc, com_fixture(ok)) == []
    for ruim in (["nao-declarada"], "antt", []):
        erros = validar(verif([]), conc, com_fixture({**ok, "fontes": ruim}))
        assert len(erros) == 1 and "'A'" in erros[0], (ruim, erros)


def test_validar_limitado_pelo_edital(conc):
    ok = {"desagio": {"valor": 15.31, "limitado_pelo_edital": True, "fontes": ["antt"]}}
    assert validar(verif([leilao(ok)]), conc) == []
    casos = [{"desagio": {"valor": 15.31, "limitado_pelo_edital": "sim", "fontes": ["antt"]}},
             {"assinatura": {"valor": "2026-03-16", "limitado_pelo_edital": True, "fontes": ["antt"]}}]
    for campos in casos:
        erros = validar(verif([leilao(campos)]), conc)
        assert len(erros) == 1 and "limitado_pelo_edital" in erros[0], (campos, erros)


def test_aplicar_limitado_pelo_edital(conc):
    v = verif([leilao({"desagio": {"valor": 15.31, "limitado_pelo_edital": True, "fontes": ["antt"]}},
                      participantes={"ano": 2025, "lote": "Lote 5"})])
    out = aplicar(conc, v, {"aliases": []})
    assert out["entidades"][0]["verif"]["desagio"]["limitado_pelo_edital"] is True
    assert out["mercado"]["participantes"][1]["verif"]["desagio"]["limitado_pelo_edital"] is True
    sem = aplicar(conc, verif([leilao({"desagio": {"valor": 23.83, "fontes": ["antt"]}})]), {"aliases": []})
    assert sem["entidades"][0]["verif"]["desagio"]["limitado_pelo_edital"] is False


def test_aplicar_resolve_fontes_dos_aliases(conc):
    aliases = {"aliases": [{"nome": "A", "grupo": "G", "motivo": "consórcio liderado por", "fontes": ["antt"]}]}
    [a] = aplicar(conc, verif([]), aliases)["grupos_alias"]
    assert a["fontes"][0]["id"] == "antt" and a["fontes"][0]["orgao"] == "ANTT"
    assert aliases["aliases"][0]["fontes"] == ["antt"]  # entrada intacta


def test_aplicar_troca_exibido_sem_duplicar_alternativa(conc):
    out = aplicar(conc, verif([leilao({"desagio": {"valor": 23.83, "fontes": ["rs-p15"]}})]), {"aliases": []})
    e = out["entidades"][0]
    assert e["desagio"] == 23.83
    d = [x for x in e["divergencias"] if x["campo"] == "desagio"]
    assert len(d) == 1
    assert d[0]["exibido"] == 23.83
    assert d[0]["alternativas"] == [{"valor": 21.83, "pagina": 97}]
    assert d[0]["nota"] == "RoadShow imprime 21,83% (p. 97); exibido o valor de fonte RoadShow."
    assert e["verif"]["desagio"]["tipo"] == "roadshow"
    assert e["verif"]["desagio"]["roadshow"] == 21.83
    assert e["verif"]["desagio"]["nao_localizado"] is False
    assert e["verif"]["desagio"]["fontes"] == [{"id": "rs-p15", "tipo": "roadshow", "orgao": None, "titulo": None,
                                                "data": None, "url": None, "pagina": 15, "acesso": None,
                                                "trecho": None}]


def test_aplicar_nao_localizado_zera_valor_e_registra_roadshow(conc):
    v = verif([{"chave": "celulose", "ent": "celulose",
                "campos": {"desagio": {"valor": None, "nao_localizado": True, "fontes": []}}}])
    out = aplicar(conc, v, {"aliases": []})
    e = out["entidades"][1]
    assert e["desagio"] is None
    assert e["verif"]["desagio"]["nao_localizado"] is True
    assert e["verif"]["desagio"]["tipo"] is None
    assert e["verif"]["desagio"]["roadshow"] == 9.0
    [d] = e["divergencias"]
    assert d["campo"] == "desagio" and d["exibido"] is None
    assert d["alternativas"] == [{"valor": 9.0, "pagina": 99}]
    assert "9" in d["nota"] and "não localizado" in d["nota"]


def test_aplicar_nao_localizado_com_divergencia_existente(conc):
    v = verif([leilao({"desagio": {"valor": None, "nao_localizado": True, "fontes": []}})])
    [d] = [x for x in aplicar(conc, v, {"aliases": []})["entidades"][0]["divergencias"] if x["campo"] == "desagio"]
    assert d["exibido"] is None
    assert d["alternativas"] == [{"valor": 21.83, "pagina": 97}, {"valor": 23.83, "pagina": 15}]
    assert d["nota"] == "RoadShow imprime 21,83% (p. 97) e 23,83% (p. 15); não localizado em fonte oficial."


def test_aplicar_cria_divergencia_com_nota(conc):
    v = verif([{"chave": "celulose", "ent": "celulose",
                "campos": {"assinatura": {"valor": "2026-02-02", "fontes": ["antt"]}}}])
    e = aplicar(conc, v, {"aliases": []})["entidades"][1]
    assert e["assinatura"] == "2026-02-02"
    [d] = e["divergencias"]
    assert d == {"campo": "assinatura", "exibido": "2026-02-02",
                 "alternativas": [{"valor": "2025-11-30", "pagina": 99}],
                 "nota": "RoadShow imprime 30/11/2025; exibido o valor de fonte oficial."}


def test_aplicar_participantes_e_concorrentes(conc):
    v = verif([
        {"chave": "transbrasiliana", "participantes": {"ano": 2007, "lote": "Transbrasiliana"},
         "campos": {"grupo_vencedor": {"valor": "Consórcio BRVias", "fontes": ["antt"]},
                    "desagio": {"valor": 39.99, "fontes": ["antt"]},
                    "leilao": {"valor": "2007-10-09", "fontes": ["antt"]}}},
        {"chave": "rip-lote-5", "ent": "lote-5", "participantes": {"ano": 2025, "lote": "Lote 5"},
         "concorrentes": "Rodovias Integradas do Paraná - Lote 5",
         "campos": {"desagio": {"valor": 23.83, "fontes": ["rs-p15", "infra"]}},
         "notas": [{"texto": "Fato novo.", "fontes": ["infra"]}]},
    ])
    out = aplicar(conc, v, {"aliases": []})
    t, l5 = out["mercado"]["participantes"]
    assert t["vencedor"] == "Consórcio BRVias" and t["desagio_vencedor"] == 39.99 and t["data"] == "2007-10-09"
    assert t["verif"]["grupo_vencedor"]["roadshow"] == "TPI – Triunfo"
    assert t["verif"]["desagio"]["roadshow"] is None and t["verif"]["desagio"]["tipo"] == "oficial"
    assert t["verif"]["leilao"]["tipo"] == "oficial"
    assert t["notas_verif"] == [] and t["inabilitados"] == []
    assert l5["desagio_vencedor"] == 23.83 and l5["verif"]["desagio"]["roadshow"] == 21.83
    [c] = out["mercado"]["concorrentes_desagio"]
    assert c["desagio"] == 23.83 and c["verif"]["desagio"]["tipo"] == "roadshow"
    assert c["leilao"] == "Rodovias Integradas do Paraná - Lote 5"
    assert out["entidades"][0]["notas_verif"][0]["texto"] == "Fato novo."
    assert out["entidades"][0]["notas_verif"][0]["fontes"][0]["orgao"] == "Agência iNFRA"
    assert l5["notas_verif"] == out["entidades"][0]["notas_verif"]


def test_aplicar_inabilitados(conc):
    v = verif([{"chave": "celulose", "ent": "celulose",
                "inabilitados": [{"grupo": "K&G", "desagio": 9.0, "data": "2025-08-04", "fontes": ["infra"]}]}])
    e = aplicar(conc, v, {"aliases": []})["entidades"][1]
    [i] = e["inabilitados"]
    assert (i["grupo"], i["desagio"], i["data"]) == ("K&G", 9.0, "2025-08-04")
    assert i["fontes"][0]["id"] == "infra" and i["fontes"][0]["tipo"] == "imprensa"


def test_aplicar_nao_muta_entrada(conc):
    antes = copy.deepcopy(conc)
    v = verif([leilao({"desagio": {"valor": 23.83, "fontes": ["rs-p15"]}},
                      participantes={"ano": 2025, "lote": "Lote 5"})])
    v_antes = copy.deepcopy(v)
    aplicar(conc, v, {"aliases": []})
    assert conc == antes and v == v_antes


def test_aplicar_confirmacao_sem_mudanca(conc):
    v = verif([leilao({"assinatura": {"valor": "2026-03-16", "fontes": ["antt", "rs-p15"]}})])
    e = aplicar(conc, v, {"aliases": []})["entidades"][0]
    assert e["assinatura"] == "2026-03-16"
    assert e["verif"]["assinatura"]["tipo"] == "oficial"
    assert e["verif"]["assinatura"]["roadshow"] is None
    assert e["divergencias"] == conc["entidades"][0]["divergencias"]


def test_aplicar_resumo_e_aliases(conc):
    aliases = {"aliases": [{"nome": "Reune", "grupo": "Pátria", "motivo": "consórcio liderado por"}]}
    out = aplicar(conc, verif([leilao({"desagio": {"valor": 23.83, "fontes": ["rs-p15"]}})]), aliases)
    assert out["grupos_alias"] == aliases["aliases"]
    assert [f["id"] for f in out["verificacao"]["fontes"]] == ["antt", "rs-p15", "infra"]
    assert out["verificacao"]["cobertura"]["leiloes"] == 1


def test_aplicar_semente_vazia_so_acrescenta_chaves(conc):
    out = aplicar(conc, {"versao": 1, "fontes": {}, "leiloes": []}, {"aliases": []})
    assert out == {**conc, "verificacao": {"fontes": [], "cobertura": {"leiloes": 0, "oficial": 0, "roadshow": 0,
                                                                       "imprensa": 0, "nao_localizado": 0}},
                   "grupos_alias": []}


def test_cobertura_conta_por_tipo():
    v = verif([
        leilao({"desagio": {"valor": 23.83, "fontes": ["rs-p15", "infra"]},
                "assinatura": {"valor": "2026-03-16", "fontes": ["antt", "rs-p15"]},
                "leilao": {"valor": "2025-10-30", "fontes": ["infra"]}}),
        {"chave": "celulose", "ent": "celulose",
         "campos": {"desagio": {"valor": None, "nao_localizado": True, "fontes": []},
                    "assinatura": {"valor": "2026-02-02", "fontes": ["antt"]}}},
    ])
    assert cobertura(v) == {"leiloes": 2, "oficial": 2, "roadshow": 1, "imprensa": 1, "nao_localizado": 1}


def test_relatorio_markdown(conc):
    v = verif([leilao({"desagio": {"valor": 23.83, "fontes": ["rs-p15"]}})])
    md = relatorio_markdown(v, aplicar(conc, v, {"aliases": []}))
    assert md.startswith("# ")
    assert "rip-lote-5" in md and "23,83" in md and "21,83" in md
    vazio = {"versao": 1, "fontes": {}, "leiloes": []}
    assert "Nenhum leilão" in relatorio_markdown(vazio, aplicar(conc, vazio, {"aliases": []}))


def _conc_real():
    return json.loads((ROOT / "data" / "base" / "conc.json").read_text(encoding="utf-8"))


def test_dados_reais_validos():
    assert validar(carregar(), _conc_real(), carregar_aliases()) == []


def test_aliases_cobrem_todos_os_nomes():
    nomes = {a["nome"] for a in carregar_aliases()["aliases"]}
    aplicado = aplicar(_conc_real(), carregar(), carregar_aliases())
    assert [n for n in nomes_do_ranking(aplicado) if n not in nomes] == []


def test_alias_motivo_valido():
    aliases = carregar_aliases()["aliases"]
    assert [a["nome"] for a in aliases if a.get("motivo") not in MOTIVOS] == []
    nomes = [a["nome"] for a in aliases]
    assert sorted({n for n in nomes if nomes.count(n) > 1}) == []


def test_alias_motivos_com_evidencia_tem_fonte():
    # junções que não se leem no próprio nome citam a fonte (ids de verificacao.json)
    aliases = carregar_aliases()["aliases"]
    precisa = ("consórcio liderado por", "troca de nome")
    assert [a["nome"] for a in aliases if a["motivo"] in precisa and not a.get("fontes")] == []
