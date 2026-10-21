"""Relatório de curadoria da atualização (scripts/curadoria.py): funções puras, fixtures pequenas e `hoje` explícito."""
import datetime as dt
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import curadoria  # noqa: E402

HOJE = dt.date(2026, 10, 21)
STATUS = [{"key": "estudo", "label": "Em estudo"}, {"key": "edital", "label": "Edital publicado"},
          {"key": "leilao_agendado", "label": "Leilão agendado"}, {"key": "leiloado", "label": "Leiloado"},
          {"key": "contrato", "label": "Contrato assinado"}, {"key": "cancelado", "label": "Cancelado/deserto"}]


def _item(id_, status, data, ent=None, esfera="federal", verificado=True):
    return {"id": id_, "nome": f"Nome {id_}", "esfera": esfera, "status": status, "data_prevista": data, "ent": ent,
            "verificado": verificado}


def _em_dia():
    """Tudo em dia: leilão passado verificado, pipeline com datas futuras, fontes recentes, nomes com grupo."""
    conc = {"entidades": [{"id": "a", "nome": "Concessão A", "leilao": "2026-03-10"},
                          {"id": "b", "nome": "Concessão B", "leilao": "2027-06"}],
            "mercado": {"participantes": [{"ano": 2026, "lote": "Lote A", "vencedor": "Grupo A S.A.",
                                           "outros": [{"grupo": "Consórcio X"}], "inabilitados": []}]},
            "grupos_alias": [{"nome": "Grupo A S.A.", "grupo": "Grupo A"}, {"nome": "Consórcio X", "grupo": "X"}]}
    intel = {"pipeline": {"status": STATUS, "itens": [
                _item("p1", "leilao_agendado", "2026-12-11", ent="b"),
                _item("p2", "contrato", "2026-04-01", ent="a"),
                _item("p3", "estudo", "2026-10"),            # mês corrente: ainda não atrasou
                _item("p4", "cancelado", "2025-01-01"),      # fora de "agendado ou previsto"
                _item("p5", "estudo", None, esfera="estadual")]},
             "fontes": {"fontes": [{"bloco": "antt", "nome": "ANTT praças", "url": "https://x", "acesso": "2026-01-02"}],
                        "base": [{"nome": "SNV", "url": "https://dnit", "acesso": "2025-10-21"}]}}
    verif = {"leiloes": [{"chave": "a", "ent": "a", "participantes": {"ano": 2026, "lote": "Lote A"},
                          "campos": {"grupo_vencedor": {"valor": "Grupo A S.A.", "fontes": []}}}]}
    return conc, intel, verif


def _tipos(itens):
    return [(i["tipo"], i["item"]) for i in itens]


def test_tudo_em_dia_lista_vazia():
    assert curadoria.itens(*_em_dia(), hoje=HOJE) == []


def test_item_do_pipeline_atrasado():
    conc, intel, verif = _em_dia()
    intel["pipeline"]["itens"] += [_item("p6", "edital", "2026-03-20", esfera="estadual"),
                                   _item("p7", "estudo", "2026-09"),           # mês já terminou
                                   _item("p8", "leiloado", "2026-10-20")]      # assinatura prevista passou
    itens = curadoria.itens(conc, intel, verif, hoje=HOJE)
    assert [i["item"] for i in itens if i["tipo"] == "pipeline_atrasado"] == ["Nome p6 (p6)", "Nome p7 (p7)", "Nome p8 (p8)"]
    m = next(i["motivo"] for i in itens if i["item"] == "Nome p6 (p6)")
    assert "20/03/2026" in m and "Edital publicado" in m and "pipeline.csv" in m
    assert "09/2026" in next(i["motivo"] for i in itens if i["item"] == "Nome p7 (p7)")


def test_leilao_realizado_sem_entrada_na_verificacao():
    conc, intel, verif = _em_dia()
    conc["entidades"].append({"id": "c", "nome": "Concessão C", "leilao": "2026-09-30"})
    conc["mercado"]["participantes"].append({"ano": 2026, "lote": "Lote C", "vencedor": "Grupo A S.A.", "outros": []})
    intel["pipeline"]["itens"].append(_item("p9", "leiloado", "2026-12-01"))  # leiloado, sem ficha (ent vazio)
    intel["pipeline"]["itens"].append(_item("p10", "contrato", "2026-08-01", ent="c"))  # mesma entidade: uma vez só
    itens = [i for i in curadoria.itens(conc, intel, verif, hoje=HOJE) if i["tipo"] == "leilao_sem_verificacao"]
    assert [i["item"] for i in itens] == ["Concessão C (c)", "Lote C (2026)", "Nome p9 (p9)"]
    assert all("verificacao.json" in i["motivo"] for i in itens)


def test_leilao_futuro_ou_estadual_nao_entra():
    conc, intel, verif = _em_dia()
    conc["entidades"].append({"id": "d", "nome": "Concessão D", "leilao": "2026-10-21"})  # hoje: ainda não passou
    intel["pipeline"]["itens"].append(_item("p11", "contrato", "2022-12-22", esfera="estadual"))
    assert [i for i in curadoria.itens(conc, intel, verif, hoje=HOJE) if i["tipo"] == "leilao_sem_verificacao"] == []


def test_pipeline_nao_verificado():
    conc, intel, verif = _em_dia()
    intel["pipeline"]["itens"].append(_item("p12", "estudo", None, verificado=False))
    itens = curadoria.itens(conc, intel, verif, hoje=HOJE)
    assert _tipos(itens) == [("pipeline_nao_verificado", "Nome p12 (p12)")]
    assert "oficial" in itens[0]["motivo"]


def test_fonte_antiga():
    conc, intel, verif = _em_dia()
    intel["fontes"]["fontes"].append({"bloco": "agro", "nome": "IBGE PAM", "url": "https://y", "acesso": "2025-10-20"})
    itens = curadoria.itens(conc, intel, verif, hoje=HOJE)
    assert _tipos(itens) == [("fonte_antiga", "IBGE PAM (agro)")]
    assert "20/10/2025" in itens[0]["motivo"] and "366 dias" in itens[0]["motivo"]


def test_nome_sem_grupo():
    conc, intel, verif = _em_dia()
    conc["mercado"]["participantes"][0]["outros"].append({"grupo": "Consórcio Novo"})
    verif["leiloes"][0]["campos"]["grupo_vencedor"]["valor"] = "Vencedor Novo S.A."
    itens = curadoria.itens(conc, intel, verif, hoje=HOJE)
    assert _tipos(itens) == [("nome_sem_grupo", "Consórcio Novo"), ("nome_sem_grupo", "Vencedor Novo S.A.")]
    assert all("grupos_alias.json" in i["motivo"] for i in itens)


def test_ordem_dos_tipos():
    conc, intel, verif = _em_dia()
    intel["pipeline"]["itens"].append(_item("p13", "edital", "2026-01-01", verificado=False))
    intel["fontes"]["fontes"][0]["acesso"] = "2024-01-01"
    assert [i["tipo"] for i in curadoria.itens(conc, intel, verif, hoje=HOJE)] == [
        "pipeline_atrasado", "pipeline_nao_verificado", "fonte_antiga"]


def test_sem_blocos_nao_quebra():
    assert curadoria.itens({}, {}, {}, hoje=HOJE) == []


def test_diff_blocos():
    antes = {"pipeline": {"fonte": [{}], "itens": [1, 2, 3]}, "carga": {"fonte": [], "gsa": [1, None, 2]},
             "velho": {"itens": [1]}}
    depois = {"pipeline": {"fonte": [{}], "itens": [1, 2, 3, 4]}, "carga": {"fonte": [], "gsa": [1, None, 2]},
              "novo": {"linhas": [1, 2]}}
    d = {x["bloco"]: x for x in curadoria.diff_blocos(antes, depois)}
    assert list(d) == ["carga", "novo", "pipeline", "velho"]
    assert (d["pipeline"]["registros_antes"], d["pipeline"]["registros_depois"]) == (3, 4)
    assert (d["carga"]["registros_antes"], d["carga"]["registros_depois"]) == (2, 2)  # conta só os preenchidos
    assert d["novo"]["registros_antes"] is None and d["novo"]["kb_antes"] is None and d["novo"]["registros_depois"] == 2
    assert d["velho"]["registros_depois"] is None and d["velho"]["kb_depois"] is None
    assert d["pipeline"]["kb_depois"] > d["pipeline"]["kb_antes"] > 0
    assert set(d["carga"]) == {"bloco", "registros_antes", "registros_depois", "kb_antes", "kb_depois"}


def test_registros_por_bloco_real():
    """Coleções que contam como registro nos blocos de data/intel/ (os caminhos existem nos JSON atuais)."""
    import json
    for p in sorted((ROOT / "data" / "intel").glob("*.json")):
        if p.stem == "manifest":
            continue
        dados = json.loads(p.read_text(encoding="utf-8"))
        assert curadoria.registros(p.stem, dados) > 0, p.stem


def test_relatorio_markdown():
    passos = [{"passo": "trafego", "estado": "pulado", "detalhe": "arquivo ausente: data/raw/x.json"},
              {"passo": "build", "estado": "ok", "detalhe": ""}]
    diff = [{"bloco": "pipeline", "registros_antes": 3, "registros_depois": 4, "kb_antes": 1.0, "kb_depois": 1.26},
            {"bloco": "antt", "registros_antes": 9, "registros_depois": 9, "kb_antes": 399.2, "kb_depois": 399.209},
            {"bloco": "agro", "registros_antes": 9, "registros_depois": 9, "kb_antes": 210.5, "kb_depois": 208.0},
            {"bloco": "novo", "registros_antes": None, "registros_depois": 1, "kb_antes": None, "kb_depois": 0.1},
            {"bloco": "igual", "registros_antes": 1, "registros_depois": 1, "kb_antes": 0.1, "kb_depois": 0.1}]
    itens = [{"tipo": "fonte_antiga", "item": "IBGE PAM (agro)", "motivo": "acesso em 20/10/2025"}]
    md = curadoria.relatorio(HOJE, passos, diff, itens, opcoes="sem --baixar")
    assert md.startswith("# Atualização dos dados — 21/10/2026\n")
    assert "| trafego | pulado | arquivo ausente: data/raw/x.json |" in md
    assert "| pipeline | 3 | 4 | 1,0 | 1,3 | sim (+260 bytes) |" in md
    assert "| antt | 9 | 9 | 399,2 | 399,2 | sim (+9 bytes) |" in md      # variação que o KB arredondado esconde
    assert "| agro | 9 | 9 | 210,5 | 208,0 | sim (−2,5 KB) |" in md
    assert "| novo | — | 1 | — | 0,1 | novo |" in md and "| igual | 1 | 1 | 0,1 | 0,1 | não |" in md
    assert "IBGE PAM (agro)" in md and "acesso em 20/10/2025" in md
    vazio = curadoria.relatorio(HOJE, passos, diff, [], opcoes="")
    assert "Nada a revisar" in vazio
    com_erro = curadoria.relatorio(HOJE, passos, diff, None, opcoes="", erros=["x: sem fonte"])
    assert "x: sem fonte" in com_erro and "não foi calculada" in com_erro
