import copy
import datetime as dt
import json
import re
import sys
import unicodedata
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
from verificacao import (  # noqa: E402
    CAMPOS, MOTIVOS, aplicar, carregar, carregar_aliases, cobertura, nomes_do_ranking, relatorio_markdown,
    tipo_campo, validar,
)
import verificacao  # noqa: E402

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


def test_campos_sao_os_dez_de_leilao():
    assert set(CAMPOS) == {"leilao", "grupo_vencedor", "desagio", "assinatura", "assinatura_aditivo",
                           "inicio_operacao", "tarifa_teto", "tarifa_vencedora", "prazo_anos", "edital"}


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


def test_validar_url_so_http_em_todo_tipo(conc):
    def com(fonte):
        return verif([leilao({"assinatura": {"valor": "2026-03-16", "fontes": ["f"]}})], fontes={"f": fonte})
    for url in ("javascript:alert(1)", "data:text/html,x", "ftp://agenciainfra.com/x", "agenciainfra.com/x"):
        erros = validar(com({**IMPRENSA, "url": url}), conc)
        assert len(erros) == 1 and "http" in erros[0], (url, erros)
        assert len(validar(com({**RS15, "url": url}), conc)) == 1, url
    assert validar(com({**IMPRENSA, "url": "HTTP://agenciainfra.com/x"}), conc) == []
    assert validar(com({**RS15, "url": "https://www.gov.br/transportes/roadshow.pdf"}), conc) == []


def test_validar_url_http_sem_host(conc):
    def com(fonte):
        return verif([leilao({"assinatura": {"valor": "2026-03-16", "fontes": ["f"]}})], fontes={"f": fonte})
    for url in ("http:", "https:", "http:///x", "https://", "http://:80/x"):
        for base in (IMPRENSA, RS15, OFICIAL):
            erros = validar(com({**base, "url": url}), conc)
            assert len(erros) == 1 and "http" in erros[0], (url, base["tipo"], erros)


def test_fmt_nao_arredonda_texto_nem_tarifa():
    # tarifa e texto não levam sufixo nem arredondamento (valor numérico ilegítimo não é truncado em silêncio)
    assert verificacao._fmt("tarifa_teto", 4.083) == "4,083"
    assert verificacao._fmt("tarifa_vencedora", 2.4525) == "2,4525"
    assert verificacao._fmt("grupo_vencedor", "Rune Rodovias") == "Rune Rodovias"
    assert verificacao._fmt("tarifa_teto", "R$ 4,083 por praça (jul/2007)") == "R$ 4,083 por praça (jul/2007)"
    # numéricos de verdade seguem como antes
    assert verificacao._fmt("desagio", 21.83) == "21,83%"
    assert verificacao._fmt("desagio", 21.8) == "21,80%"
    assert verificacao._fmt("prazo_anos", 30) == "30 anos"
    assert verificacao._fmt("assinatura", "2026-03-16") == "16/03/2026"


def test_validar_estruturas_malformadas_dao_erro_legivel(conc):
    ok = {"desagio": {"valor": 23.83, "fontes": ["rs-p15"]}}
    casos = {
        "campos-lista": {"chave": "m1", "ent": "lote-5", "campos": [1, 2]},
        "campos-texto": {"chave": "m2", "ent": "lote-5", "campos": "desagio"},
        "campo-nao-dict": {"chave": "m3", "ent": "lote-5", "campos": {"desagio": 23.83}},
        "notas-dict": {"chave": "m4", "ent": "lote-5", "campos": ok, "notas": {"texto": "x"}},
        "nota-nao-dict": {"chave": "m5", "ent": "lote-5", "campos": ok, "notas": ["x"]},
        "inabilitados-dict": {"chave": "m6", "ent": "lote-5", "campos": ok, "inabilitados": {"grupo": "K&G"}},
        "inabilitado-nao-dict": {"chave": "m7", "ent": "lote-5", "campos": ok, "inabilitados": ["K&G"]},
        "ano-lista": {"chave": "m8", "participantes": {"ano": [2025], "lote": "Lote 5"}, "campos": ok},
        "lote-dict": {"chave": "m9", "participantes": {"ano": 2025, "lote": {"x": 1}}, "campos": ok},
        "participantes-lista": {"chave": "m10", "participantes": [2025, "Lote 5"], "campos": ok},
        "concorrentes-lista": {"chave": "m11", "concorrentes": ["a"], "campos": ok},
        "concorrentes-dict": {"chave": "m12", "concorrentes": {"a": 1}, "campos": ok},
    }
    for nome, caso in casos.items():
        erros = validar(verif([caso]), conc)  # não levanta
        assert erros and all(isinstance(e, str) for e in erros), nome
        assert any(caso["chave"] in e for e in erros), (nome, erros)


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
    com_conc = verif([leilao({"desagio": {"valor": 15.31, "limitado_pelo_edital": True, "fontes": ["antt"]}},
                             concorrentes="Rodovias Integradas do Paraná - Lote 5")])
    [c] = aplicar(conc, com_conc, {"aliases": []})["mercado"]["concorrentes_desagio"]
    assert c["verif"]["desagio"]["limitado_pelo_edital"] is True
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


def test_aplicar_nota_ignora_alternativa_sem_valor(conc):
    # o RoadShow imprime "-" numa das páginas: a alternativa fica registrada, mas não entra na nota
    conc["entidades"][0]["divergencias"].append(
        {"campo": "assinatura", "exibido": "2026-03-16", "alternativas": [{"valor": "-", "pagina": 5}, {"valor": "", "pagina": 6}],
         "nota": "Assinatura: 16/03/2026 (p97) × - (p5)"})
    v = verif([leilao({"assinatura": {"valor": "2026-03-20", "fontes": ["antt"]}})])
    [d] = [x for x in aplicar(conc, v, {"aliases": []})["entidades"][0]["divergencias"] if x["campo"] == "assinatura"]
    assert d["alternativas"] == [{"valor": "2026-03-16", "pagina": 97}, {"valor": "-", "pagina": 5}, {"valor": "", "pagina": 6}]
    assert d["nota"] == "RoadShow imprime 16/03/2026 (p. 97); exibido o valor de fonte oficial."


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
    assert out == {**conc, "verificacao": {"fontes": [], "cobertura": {"leiloes": 0, "so_edital": 0, "oficial": 0, "roadshow": 0,
                                                                       "imprensa": 0, "nao_localizado": 0,
                                                                       "nao_se_aplica": 0}},
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
    assert cobertura(v) == {"leiloes": 2, "so_edital": 0, "oficial": 2, "roadshow": 1, "imprensa": 1,
                            "nao_localizado": 1, "nao_se_aplica": 0}


def test_cobertura_conta_entrada_so_com_edital_a_parte(conc):
    # a entrada só com a data do edital (cronograma) não é leilão verificado: conta em so_edital
    v = verif([leilao({"leilao": {"valor": "2025-10-30", "fontes": ["antt"]}}),
               {"chave": "celulose", "ent": "celulose", "campos": {"edital": {"valor": "2026-07", "fontes": ["rs-p15"]}}}])
    assert cobertura(v) == {"leiloes": 1, "so_edital": 1, "oficial": 1, "roadshow": 1, "imprensa": 0,
                            "nao_localizado": 0, "nao_se_aplica": 0}
    md = relatorio_markdown(v, aplicar(conc, v, {"aliases": []}))
    assert "| Leilões verificados | Entradas só com edital |" in md and "| 1 | 1 | 1 | 1 | 0 | 0 | 0 |" in md


def test_nao_se_aplica_valida_e_aplica(conc):
    # leilão por outorga: o deságio não se aplica (valor null), com a fonte que explica o critério
    ok = {"desagio": {"valor": None, "nao_se_aplica": True, "fontes": ["antt"]}}
    v = verif([{"chave": "celulose", "ent": "celulose", "campos": ok}])
    assert validar(v, conc) == []
    casos = [{"desagio": {"valor": None, "nao_se_aplica": True, "fontes": []}},           # sem fonte
             {"desagio": {"valor": 9.0, "nao_se_aplica": True, "fontes": ["antt"]}},      # com valor
             {"desagio": {"valor": None, "nao_se_aplica": "sim", "fontes": ["antt"]}},    # não booleano
             {"desagio": {"valor": None, "nao_se_aplica": True, "nao_localizado": True, "fontes": ["antt"]}},
             {"assinatura": {"valor": None, "nao_se_aplica": True, "fontes": ["antt"]}}]  # só no deságio
    for campos in casos:
        erros = validar(verif([leilao(campos)]), conc)
        assert len(erros) == 1 and "nao_se_aplica" in erros[0], (campos, erros)
    e = aplicar(conc, v, {"aliases": []})["entidades"][1]
    assert e["desagio"] is None
    info = e["verif"]["desagio"]
    assert info["nao_se_aplica"] is True and info["nao_localizado"] is False and info["tipo"] is None
    assert info["roadshow"] == 9.0 and [f["id"] for f in info["fontes"]] == ["antt"]
    [d] = e["divergencias"]
    assert d["nota"] == "RoadShow imprime 9,00%; não se aplica (leilão por outorga)."
    outro = aplicar(conc, verif([leilao({"desagio": {"valor": 23.83, "fontes": ["antt"]}})]), {"aliases": []})
    assert outro["entidades"][0]["verif"]["desagio"]["nao_se_aplica"] is False
    md = relatorio_markdown(v, aplicar(conc, v, {"aliases": []}))
    assert "| celulose | desagio | — | não se aplica (leilão por outorga) | 9,00% | antt |" in md


def test_cobertura_conta_nao_se_aplica():
    v = verif([leilao({"desagio": {"valor": None, "nao_se_aplica": True, "fontes": ["antt"]},
                       "assinatura": {"valor": None, "nao_localizado": True, "fontes": []},
                       "leilao": {"valor": "2025-10-30", "fontes": ["antt"]}})])
    assert cobertura(v) == {"leiloes": 1, "so_edital": 0, "oficial": 1, "roadshow": 0, "imprensa": 0,
                            "nao_localizado": 1, "nao_se_aplica": 1}


def test_alternativa_declarada_valida_e_aplica(conc):
    # outra fonte dá outro valor (não exibido): fica como divergência declarada, com a fonte
    b3 = {**OFICIAL, "orgao": "B3", "data": "2026-07-23", "url": "https://www.b3.com.br/x"}
    fontes = {"antt": OFICIAL, "b3": b3, "rs-p15": RS15}
    campos = {"prazo_anos": {"valor": 15, "fontes": ["antt"], "alternativas": [{"valor": 25, "fontes": ["b3"]}]}}
    v = verif([leilao(campos)], fontes)
    assert validar(v, conc) == []
    ruins = [[{"valor": 25, "fontes": []}], [{"valor": "25", "fontes": ["b3"]}], [{"valor": 25, "fontes": ["x"]}],
             [{"valor": 15, "fontes": ["b3"]}], {"valor": 25}]
    for alts in ruins:
        erros = validar(verif([leilao({"prazo_anos": {**campos["prazo_anos"], "alternativas": alts}})], fontes), conc)
        assert len(erros) == 1 and "alternativa" in erros[0], (alts, erros)
    e = aplicar(conc, v, {"aliases": []})["entidades"][0]
    assert e["prazo_anos"] == 15
    [d] = [x for x in e["divergencias"] if x["campo"] == "prazo_anos"]
    assert d == {"campo": "prazo_anos", "exibido": 15, "alternativas": [{"valor": 25, "fonte": "B3, 23/07/2026"}],
                 "nota": "B3 (23/07/2026) informa 25 anos; exibido o valor de fonte oficial."}
    # com o valor do RoadShow trocado, a alternativa declarada se soma à divergência do RoadShow
    com_rs = {"desagio": {"valor": 23.83, "fontes": ["antt"], "alternativas": [{"valor": 22.0, "fontes": ["b3"]}]}}
    [d] = [x for x in aplicar(conc, verif([leilao(com_rs)], fontes), {"aliases": []})["entidades"][0]["divergencias"]
           if x["campo"] == "desagio"]
    assert d["alternativas"] == [{"valor": 21.83, "pagina": 97}, {"valor": 22.0, "fonte": "B3, 23/07/2026"}]
    assert d["nota"] == ("RoadShow imprime 21,83% (p. 97); exibido o valor de fonte oficial. "
                         "B3 (23/07/2026) informa 22,00%.")


def test_alternativas_so_em_leilao_com_entidade(conc):
    # sem `ent` não há divergência onde registrar a alternativa: aplicar a descartaria em silêncio
    campos = {"desagio": {"valor": 21.83, "fontes": ["antt"], "alternativas": [{"valor": 22.0, "fontes": ["antt"]}]}}
    erros = validar(verif([{"chave": "lote-5", "participantes": {"ano": 2025, "lote": "Lote 5"}, "campos": campos}]), conc)
    assert len(erros) == 1 and "alternativas" in erros[0] and "ent" in erros[0], erros
    assert validar(verif([leilao(campos)]), conc) == []


def test_relatorio_markdown(conc):
    v = verif([leilao({"desagio": {"valor": 23.83, "fontes": ["rs-p15"]}})])
    md = relatorio_markdown(v, aplicar(conc, v, {"aliases": []}))
    assert md.startswith("# ")
    assert "rip-lote-5" in md and "23,83" in md and "21,83" in md
    vazio = {"versao": 1, "fontes": {}, "leiloes": []}
    assert "Nenhum leilão" in relatorio_markdown(vazio, aplicar(conc, vazio, {"aliases": []}))


# ---------- edital: data completa ou só mês; edital não pode ser posterior ao leilão ----------
def test_validar_edital_aceita_dia_ou_mes(conc):
    for ok in ("2025-07-17", "2025-08"):
        assert validar(verif([leilao({"edital": {"valor": ok, "fontes": ["rs-p15"]}})]), conc) == [], ok
    for ruim in ("2027", "2027-13", "2026-02-30", "ago/2027", "2027-8", 20270817):
        erros = validar(verif([leilao({"edital": {"valor": ruim, "fontes": ["rs-p15"]}})]), conc)
        assert len(erros) == 1 and "edital" in erros[0], (ruim, erros)
    # as outras datas continuam exigindo o dia
    erros = validar(verif([leilao({"assinatura": {"valor": "2026-03", "fontes": ["antt"]}})]), conc)
    assert len(erros) == 1 and "assinatura" in erros[0]


def test_aplicar_edital_troca_exibido_e_guarda_o_impresso(conc):
    conc["entidades"][0]["edital"] = "2025-06"
    conc["entidades"][0]["fontes"]["edital"] = 145
    v = verif([leilao({"edital": {"valor": "2025-08", "fontes": ["rs-p15"]}})])
    out = aplicar(conc, v, {"aliases": []})
    e = out["entidades"][0]
    assert e["edital"] == "2025-08"
    assert e["verif"]["edital"]["tipo"] == "roadshow" and e["verif"]["edital"]["roadshow"] == "2025-06"
    [d] = [x for x in e["divergencias"] if x["campo"] == "edital"]
    assert d["exibido"] == "2025-08" and d["alternativas"] == [{"valor": "2025-06", "pagina": 145}]
    assert "jun/2025" in d["nota"] and "2025-06" not in d["nota"]


def sequencia(edital, leilao_):
    c = {"entidades": [{"id": "x", "nome": "X", "edital": edital, "leilao": leilao_, "fontes": {}}], "mercado": {}}
    return validar({"versao": 1, "fontes": {}, "leiloes": []}, c)


def test_validar_edital_nao_pode_ser_posterior_ao_leilao():
    assert sequencia("2026-09-02", "2026-12-11") == []
    assert sequencia("2026-12-11", "2026-12-11") == []
    assert sequencia(None, "2026-12-11") == [] and sequencia("2026-12-11", None) == []
    [e] = sequencia("2026-12-12", "2026-12-11")
    assert "x" in e and "edital" in e and "12/12/2026" in e and "11/12/2026" in e
    # mês sem dia: compara no mês (mesmo mês vale; mês seguinte não)
    assert sequencia("2027-06-30", "2027-06") == [] and sequencia("2027-06", "2027-06-01") == []
    assert len(sequencia("2027-07", "2027-06-30")) == 1
    assert len(sequencia("2027-07-01", "2027-06")) == 1
    assert len(sequencia("2028-01", "2027-12")) == 1


def test_sequencia_vale_para_o_valor_exibido_depois_da_camada(conc):
    conc["entidades"][0].update({"edital": "2027-01-10", "leilao": "2026-12-01"})
    erros = validar(verif([]), conc)  # base com edital depois do leilão
    assert len(erros) == 1 and "lote-5" in erros[0]
    corrige = verif([leilao({"edital": {"valor": "2026-09-01", "fontes": ["rs-p15"]}})])
    assert validar(corrige, conc) == []


def _conc_real():
    """O CONC do build: base congelada + JSON curados de data/roadshow/ (mercado, entidades…), como em build.py."""
    from roadshow import conc_da_base
    ler = lambda nome: json.loads((ROOT / "data" / "base" / nome).read_text(encoding="utf-8"))  # noqa: E731
    return conc_da_base(ler("conc.json"), ROOT / "data" / "roadshow", ler("snv.json"))


def test_dados_reais_validos():
    assert validar(carregar(), _conc_real(), carregar_aliases()) == []


def test_dados_ponte_nao_se_aplica_e_regis_com_b3():
    ents = {e["id"]: e for e in aplicar(_conc_real(), carregar(), carregar_aliases())["entidades"]}
    ponte = ents["ponte-binacional-sao-borja-santo-tome"]
    assert ponte["desagio"] is None and ponte["verif"]["desagio"]["nao_se_aplica"] is True
    regis = ents["regis-bittencourt"]
    assert regis["prazo_anos"] == 15
    [d] = [x for x in regis["divergencias"] if x["campo"] == "prazo_anos"]
    assert d["alternativas"] == [{"valor": 25, "fonte": "B3, 23/07/2026"}]


def test_aliases_cobrem_todos_os_nomes():
    nomes = {a["nome"] for a in carregar_aliases()["aliases"]}
    aplicado = aplicar(_conc_real(), carregar(), carregar_aliases())
    assert [n for n in nomes_do_ranking(aplicado) if n not in nomes] == []


def test_alias_motivo_valido():
    aliases = carregar_aliases()["aliases"]
    assert [a["nome"] for a in aliases if a.get("motivo") not in MOTIVOS] == []
    nomes = [a["nome"] for a in aliases]
    assert sorted({n for n in nomes if nomes.count(n) > 1}) == []


def _normal(texto):
    """Minúsculas, sem acentos e sem pontuação (só letras e dígitos)."""
    sem_acento = unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]", "", sem_acento.lower())


def test_regra_de_fonte_do_alias():
    # razão social pede fonte quando o grupo não se lê no nome (sem acento, caixa ou pontuação)
    casos = {("Companhia de Participações em Concessões", "Motiva", "razão social do grupo"): True,
             ("Reúne Rodovias Holding II S.A.", "Pátria", "razão social do grupo"): True,
             ("VINCI Highways S.A.S", "Vinci", "razão social do grupo"): False,
             ("Mota-Engil Latam Portugal, S.A.", "Mota-Engil", "razão social do grupo"): False,
             ("Galvão Engenharia S/A", "Galvão Engenharia", "razão social do grupo"): False,
             ("Consórcio X", "Grupo Y", "consórcio liderado por"): True,
             ("CCR", "Motiva", "troca de nome"): True,
             ("Eco Rodovias", "Ecorodovias", "grafia"): False}
    for (nome, grupo, motivo), esperado in casos.items():
        assert _precisa_fonte({"nome": nome, "grupo": grupo, "motivo": motivo}) is esperado, (nome, grupo)


def _precisa_fonte(a):
    """Junções que não se leem no próprio nome: consórcio liderado por, troca de nome e razão social cujo grupo não
    aparece no nome."""
    if a["motivo"] in ("consórcio liderado por", "troca de nome"):
        return True
    return a["motivo"] == "razão social do grupo" and _normal(a["grupo"]) not in _normal(a["nome"])


def test_alias_motivos_com_evidencia_tem_fonte():
    # essas junções citam a fonte (ids de verificacao.json)
    assert [a["nome"] for a in carregar_aliases()["aliases"] if _precisa_fonte(a) and not a.get("fontes")] == []


def test_dados_reais_editais_corrigidos_pela_camada():
    ents = {e["id"]: e for e in aplicar(_conc_real(), carregar(), carregar_aliases())["entidades"]}
    base = {e["id"]: e for e in _conc_real()["entidades"]}
    # base congelada = transcrição do RoadShow, intacta; a camada mostra o cronograma (p. 117 e p. 153)
    assert (base["rota-arco-norte"]["edital"], base["rota-norte-catarinense"]["edital"]) == ("2025-07-17", "2026-08")
    for id_, exibido, impresso, pg_ficha, pg_cron in [("rota-arco-norte", "2026-07-17", "2025-07-17", 109, 117),
                                                      ("rota-norte-catarinense", "2027-08", "2026-08", 145, 153)]:
        e = ents[id_]
        assert e["edital"] == exibido, id_
        assert [m["data"] for m in e["cronograma"] if m["marco"] == "Edital"] == [exibido], id_
        assert e["verif"]["edital"]["roadshow"] == impresso
        assert [f["pagina"] for f in e["verif"]["edital"]["fontes"]] == [pg_cron]
        [d] = [x for x in e["divergencias"] if x["campo"] == "edital"]
        assert d["exibido"] == exibido and d["alternativas"] == [{"valor": impresso, "pagina": pg_ficha}], id_
        assert any("ficha" in n["texto"] and str(pg_ficha) in n["texto"] for n in e["notas_verif"]), id_


def test_roteiro_3_resultado_antes_do_proximo_roadshow(tmp_path):
    """README, roteiro 3: para o Mercado e o Resumo contarem um leilão antes do próximo RoadShow, acrescenta-se a linha
    em mercado.json (participantes e concorrentes_desagio, no mesmo formato) e a entrada em verificacao.json ligada a
    ela (chaves participantes e concorrentes); `fora_do_roadshow` tira a linha da reconciliação com os totais impressos.
    Numa cópia de data/roadshow/: a linha entra no CONC aplicado com a fonte."""
    import shutil
    from roadshow import conc_da_base
    from curadoria import itens as curadoria_itens
    rs = tmp_path / "roadshow"
    shutil.copytree(ROOT / "data" / "roadshow", rs)
    base = ROOT / "data" / "base"
    ler = lambda p: json.loads(Path(p).read_text(encoding="utf-8"))  # noqa: E731
    m = ler(rs / "mercado.json")
    lote, nome = "Lote Novo do Teste", "Lote Novo do Teste (leilão)"
    m["participantes"].append({"ano": 2026, "lote": lote, "vencedor": "EPR", "desagio_vencedor": 10.5,
                               "outros": [{"grupo": "Arteris S.A.", "desagio": 3.2}], "fora_do_roadshow": True})
    m["concorrentes_desagio"].append({"leilao": nome, "ano": 2026, "n": 2, "desagio": 10.5, "fora_do_roadshow": True})
    (rs / "mercado.json").write_text(json.dumps(m, ensure_ascii=False, indent=1), encoding="utf-8")
    v = ler(rs / "verificacao.json")
    v["fontes"]["teste-ata"] = {"tipo": "oficial", "orgao": "ANTT", "titulo": "Ata do leilão (teste)", "data": "2026-11-12",
                                "url": "https://www.gov.br/antt/teste", "acesso": "2026-11-13"}
    v["leiloes"].append({"chave": "lote-novo-teste", "participantes": {"ano": 2026, "lote": lote}, "concorrentes": nome,
                         "campos": {"leilao": {"valor": "2026-11-12", "fontes": ["teste-ata"]},
                                    "grupo_vencedor": {"valor": "EPR Participações S.A.", "fontes": ["teste-ata"]},
                                    "desagio": {"valor": 10.5, "fontes": ["teste-ata"]}}})
    (rs / "verificacao.json").write_text(json.dumps(v, ensure_ascii=False, indent=1), encoding="utf-8")

    conc = conc_da_base(ler(base / "conc.json"), rs, ler(base / "snv.json"))
    verif, aliases = carregar(rs / "verificacao.json"), carregar_aliases(rs / "grupos_alias.json")
    assert validar(verif, conc, aliases) == []
    out = aplicar(conc, verif, aliases)
    [p] = [r for r in out["mercado"]["participantes"] if r["lote"] == lote]
    assert (p["vencedor"], p["desagio_vencedor"], p["data"]) == ("EPR Participações S.A.", 10.5, "2026-11-12")
    assert p["verif"]["desagio"]["tipo"] == "oficial" and p["verif"]["grupo_vencedor"]["tipo"] == "oficial"
    [c] = [r for r in out["mercado"]["concorrentes_desagio"] if r["leilao"] == nome]
    assert c["desagio"] == 10.5 and c["verif"]["desagio"]["tipo"] == "oficial"
    assert "EPR Participações S.A." in nomes_do_ranking(out)
    # verificada, a linha não vai para a curadoria
    assert not [i for i in curadoria_itens(out, {}, verif, dt.date(2026, 11, 20)) if lote in i["item"]]
