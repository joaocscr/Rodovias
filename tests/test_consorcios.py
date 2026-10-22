"""Base de consórcios (data/roadshow/consorcios.json): composição de cada consórcio, com fonte para todo dado.

Os testes da primeira parte usam dados mínimos (regras da validação); os da segunda leem o arquivo real, aplicado
como no build (base congelada + JSON curados + camada de verificação).
"""
import copy
import json
import sys
import unicodedata
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
from verificacao import (  # noqa: E402
    aplicar, carregar, carregar_aliases, carregar_consorcios, validar, validar_consorcios,
)
import curadoria  # noqa: E402

FONTES = {"ata": {"tipo": "oficial", "orgao": "ANTT", "titulo": "Ata", "data": "2024-04-23",
                  "url": "https://www.gov.br/antt/x", "acesso": "2026-10-22", "trecho": "..."},
          "jornal": {"tipo": "imprensa", "orgao": "Jornal", "titulo": "Notícia", "data": "2024-04-12",
                     "url": "https://jornal.example/x", "acesso": "2026-10-22"}}


@pytest.fixture
def conc_min():
    """Camada de leilões mínima: um leilão com vencedor, um outro proponente e um inabilitado."""
    return {"mercado": {"participantes": [
        {"ano": 2024, "lote": "BR-1", "vencedor": "Consórcio Alfa", "outros": [{"grupo": "Consórcio Beta"}],
         "inabilitados": [{"grupo": "Consórcio Gama"}]}]}}


def consorcio(**kw):
    c = {"nome": "Consórcio Alfa", "ano": 2024, "lote": "BR-1", "venceu": True,
         "integrantes": [{"nome": "Empresa A S.A.", "grupo": "A", "participacao": 60, "lider": True},
                         {"nome": "Empresa B Ltda.", "grupo": "B", "participacao": 40, "lider": False}],
         "fontes": ["ata", "jornal"]}
    c.update(kw)
    return c


def erros(*cs, conc=None):
    return validar_consorcios({"versao": 1, "consorcios": list(cs)}, FONTES, conc)


def test_consorcio_valido_nao_tem_erros(conc_min):
    assert erros(consorcio(), conc=conc_min) == []


def test_nome_precisa_casar_com_proponente_do_mesmo_leilao(conc_min):
    e = erros(consorcio(nome="Consórcio Delta", venceu=False), conc=conc_min)
    assert any("Consórcio Delta" in m and "proponente" in m for m in e), e


def test_nome_fora_da_camada_so_com_marca(conc_min):
    c = consorcio(nome="Consórcio Delta", venceu=False, fora_da_camada=True, fontes=["ata"], nota="Só a ata traz.")
    assert erros(c, conc=conc_min) == []
    # sem a ata oficial ou sem nota, a marca não basta (não pode calar uma grafia errada)
    for kw in ({"fontes": ["jornal"], "nota": "x"}, {"fontes": ["ata"]}):
        e = erros(consorcio(nome="Consórcio Delta", venceu=False, fora_da_camada=True, **kw), conc=conc_min)
        assert any("exige nota" in m for m in e), (kw, e)
    # a marca não vale para quem já casa: ficaria esquecida depois que a camada ganhar o nome
    e = erros(consorcio(venceu=True, fora_da_camada=True), conc=conc_min)
    assert any("fora_da_camada" in m for m in e), e


def test_casa_com_inabilitado_e_com_outros(conc_min):
    assert erros(consorcio(nome="Consórcio Gama", venceu=False), conc=conc_min) == []
    assert erros(consorcio(nome="Consórcio Beta", venceu=False), conc=conc_min) == []


def test_leilao_inexistente(conc_min):
    e = erros(consorcio(lote="BR-9"), conc=conc_min)
    assert any("BR-9" in m for m in e), e


def test_venceu_precisa_concordar_com_o_vencedor_do_leilao(conc_min):
    assert any("venceu" in m for m in erros(consorcio(venceu=False), conc=conc_min))
    assert any("venceu" in m for m in erros(consorcio(nome="Consórcio Beta"), conc=conc_min))


def test_todo_dado_com_fonte(conc_min):
    assert any("sem fonte" in m for m in erros(consorcio(fontes=[]), conc=conc_min))
    e = erros(consorcio(fontes=["ata", "inexistente"]), conc=conc_min)
    assert any("inexistente" in m for m in e), e


def test_soma_das_participacoes_quando_todas_informadas(conc_min):
    c = consorcio()
    c["integrantes"][1]["participacao"] = 30
    assert any("soma" in m for m in erros(c, conc=conc_min))
    c["integrantes"][1]["participacao"] = 40.005  # dentro de ±0,01
    assert erros(c, conc=conc_min) == []


def test_participacao_parcial_nao_exige_soma_mas_nao_passa_de_100(conc_min):
    c = consorcio()
    c["integrantes"][1]["participacao"] = None
    assert erros(c, conc=conc_min) == []
    c["integrantes"][0]["participacao"] = 101
    assert erros(c, conc=conc_min)
    c["integrantes"][0]["participacao"] = 70
    c["integrantes"][1]["participacao"] = None
    c["integrantes"].append({"nome": "C", "grupo": "C", "participacao": 35, "lider": False})
    assert any("passa de 100" in m for m in erros(c, conc=conc_min))


def test_participacao_invalida(conc_min):
    for ruim in (0, -5, "40%", True):
        c = consorcio()
        c["integrantes"][1]["participacao"] = ruim
        assert erros(c, conc=conc_min), ruim


def test_integrante_sem_nome_ou_grupo(conc_min):
    c = consorcio()
    c["integrantes"][0]["grupo"] = ""
    assert any("grupo" in m for m in erros(c, conc=conc_min))
    c = consorcio()
    del c["integrantes"][0]["nome"]
    assert any("nome" in m for m in erros(c, conc=conc_min))


def test_composicao_nao_localizada_exige_nota(conc_min):
    assert any("nota" in m for m in erros(consorcio(integrantes=[]), conc=conc_min))
    assert erros(consorcio(integrantes=[], nota="Composição não localizada."), conc=conc_min) == []


def test_mesmo_consorcio_no_mesmo_leilao_so_uma_vez(conc_min):
    assert any("repetido" in m for m in erros(consorcio(), consorcio(), conc=conc_min))


def test_mesmo_nome_em_leiloes_diferentes_e_valido():
    conc = {"mercado": {"participantes": [
        {"ano": 2024, "lote": "BR-1", "vencedor": "Consórcio Alfa", "outros": []},
        {"ano": 2025, "lote": "BR-2", "vencedor": "Consórcio Alfa", "outros": []}]}}
    assert erros(consorcio(), consorcio(ano=2025, lote="BR-2"), conc=conc) == []


def test_marcas_sao_booleanas(conc_min):
    assert erros(consorcio(fora_da_ata="sim"), conc=conc_min)


# ---------- dados reais ----------

@pytest.fixture(scope="module")
def tudo():
    """(consorcios.json, conc com a camada aplicada, verificacao.json, aliases), como no build."""
    from roadshow import conc_da_base
    ler = lambda n: json.loads((ROOT / "data" / "base" / n).read_text(encoding="utf-8"))  # noqa: E731
    conc = conc_da_base(ler("conc.json"), ROOT / "data" / "roadshow", ler("snv.json"))
    verif, aliases, cons = carregar(), carregar_aliases(), carregar_consorcios()
    return cons, aplicar(conc, verif, aliases, cons), verif, aliases, conc


def test_arquivo_real_valida(tudo):
    cons, aplicado, verif, aliases, conc = tudo
    assert validar_consorcios(cons, verif["fontes"], aplicado) == []
    assert validar(verif, conc, aliases, cons) == []


def test_aplicado_traz_consorcios_com_fontes_resolvidas(tudo):
    cons, aplicado, verif, _, _ = tudo
    assert len(aplicado["consorcios"]) == len(cons["consorcios"]) >= 30
    for c, bruto in zip(aplicado["consorcios"], cons["consorcios"]):
        assert [f["id"] for f in c["fontes"]] == bruto["fontes"]
        for f in c["fontes"]:
            assert f["tipo"] in ("oficial", "roadshow", "imprensa") and f["url"]
    assert "consorcios" not in aplicar(tudo[4], verif, tudo[3])  # sem o arquivo, o bloco não existe


def test_nomes_casam_com_a_camada_de_leiloes_ou_estao_marcados(tudo):
    cons, aplicado, _, _, _ = tudo
    linhas = {(r["ano"], r["lote"]): r for r in aplicado["mercado"]["participantes"]}
    marcados = []
    for c in cons["consorcios"]:
        r = linhas[(c["ano"], c["lote"])]
        nomes = {r.get("vencedor")} | {o["grupo"] for o in r.get("outros") or []} | {
            i["grupo"] for i in r.get("inabilitados") or []}
        assert (c["nome"] in nomes) != bool(c.get("fora_da_camada")), (c["nome"], c["ano"], c["lote"])
        if c.get("fora_da_camada"):
            marcados.append(c)
            assert c["nota"], c  # a marca diz de onde vem o nome
    assert marcados  # as atas da ANTT trazem proponentes que a camada de leilões não tem


def test_todo_consorcio_vencedor_da_camada_tem_ficha(tudo):
    cons, aplicado, _, _, _ = tudo
    tem = {(c["ano"], c["lote"], c["nome"]) for c in cons["consorcios"]}
    faltam = [(r["ano"], r["lote"], r["vencedor"]) for r in aplicado["mercado"]["participantes"]
              if (r["vencedor"] or "").startswith("Consórcio") and (r["ano"], r["lote"], r["vencedor"]) not in tem]
    assert not faltam, faltam


def test_composicao_com_fonte_e_participacao_so_quando_publicada(tudo):
    cons = tudo[0]["consorcios"]
    for c in cons:
        assert c["fontes"]
        for i in c["integrantes"]:
            assert i["participacao"] is None or 0 < i["participacao"] <= 100
    # as participações da imprensa vêm de fonte marcada como imprensa (não oficial)
    fontes = tudo[2]["fontes"]
    for c in cons:
        if any(i["participacao"] is not None for i in c["integrantes"]):
            assert any(fontes[f]["tipo"] in ("oficial", "imprensa") for f in c["fontes"]), c["nome"]


def norm(s):
    return "".join(ch for ch in unicodedata.normalize("NFD", s.casefold()) if not unicodedata.combining(ch))


def test_grupos_existentes_ou_novos_sem_duplicar(tudo, record_property):
    """`grupo` é o do alias (grupo econômico à época do leilão) ou um nome novo, usado sempre com a mesma grafia."""
    cons, _, _, aliases, _ = tudo
    existentes = {a["grupo"] for a in aliases["aliases"]}
    por_nome = {a["nome"]: a["grupo"] for a in aliases["aliases"]}
    usados = {i["grupo"] for c in cons["consorcios"] for i in c["integrantes"]}
    novos = sorted(usados - existentes)
    record_property("grupos_novos", "; ".join(novos))
    norm_exist = {norm(g): g for g in existentes}
    for g in novos:
        assert norm(g) not in norm_exist, f"grupo novo {g!r} é grafia de {norm_exist[norm(g)]!r}"
        assert por_nome.get(g, g) == g, f"{g!r} já é nome ligado ao grupo {por_nome[g]!r}: use o grupo"
    grafias = {}
    for g in usados:
        grafias.setdefault(norm(g), []).append(g)
    assert all(len(v) == 1 for v in grafias.values()), [v for v in grafias.values() if len(v) > 1]


def test_mesmo_integrante_sempre_no_mesmo_grupo(tudo):
    por = {}
    for c in tudo[0]["consorcios"]:
        for i in c["integrantes"]:
            por.setdefault(norm(i["nome"]), set()).add(i["grupo"])
    assert not {n: g for n, g in por.items() if len(g) > 1}


# ---------- curadoria ----------

def test_curadoria_lista_vencedor_sem_composicao_e_nome_fora_da_ata(tudo):
    cons, aplicado, _, _, _ = tudo
    its = curadoria.itens(aplicado, {}, {}, hoje=__import__("datetime").date(2026, 10, 22))
    sem = [i for i in its if i["tipo"] == "consorcio_sem_composicao"]
    assert any("Acciona" in i["item"] for i in sem), sem
    assert all("data/roadshow/consorcios.json" in i["motivo"] for i in sem)
    fora = [i for i in its if i["tipo"] == "consorcio_fora_da_ata"]
    assert len(fora) == 1 and "Via dos Sertões" in fora[0]["item"] and "Régis" in fora[0]["item"], fora


def test_curadoria_vencedor_consorcio_sem_ficha(tudo):
    """Consórcio vencedor na camada de leilões sem entrada em consorcios.json também vira item."""
    _, aplicado, _, _, _ = tudo
    ap = copy.deepcopy(aplicado)
    ap["consorcios"] = [c for c in ap["consorcios"] if c["nome"] != "Consórcio Planalto"]
    its = curadoria.itens(ap, {}, {}, hoje=__import__("datetime").date(2026, 10, 22))
    assert any(i["tipo"] == "consorcio_sem_composicao" and "Planalto" in i["item"]
               and "sem ficha" in i["motivo"] for i in its)


def test_curadoria_sem_consorcios_nao_acusa_nada():
    assert [i for i in curadoria.itens({"mercado": {"participantes": []}}, {}, {}) if "consorcio" in i["tipo"]] == []
