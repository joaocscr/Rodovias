import json
import re
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
from intel import pipeline  # noqa: E402

STATUS = ["estudo", "consulta_publica", "tcu", "edital", "leilao_agendado", "leiloado", "contrato", "suspenso",
          "cancelado"]
LABELS = {"estudo": "Em estudo", "consulta_publica": "Consulta pública", "tcu": "No TCU/TCE",
          "edital": "Edital publicado", "leilao_agendado": "Leilão agendado", "leiloado": "Leiloado",
          "contrato": "Contrato assinado", "suspenso": "Suspenso", "cancelado": "Cancelado/deserto"}
UFS = set("AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split())
RASCUNHO = ROOT / "data" / "raw" / "pipeline" / "pipeline_rascunho.csv"


@pytest.fixture(scope="module")
def blk():
    return json.loads((ROOT / "data" / "intel" / "pipeline.json").read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def conc():
    return json.loads((ROOT / "data" / "base" / "conc.json").read_text(encoding="utf-8"))


def test_status_so_da_lista_do_contrato(blk):
    assert [s["key"] for s in blk["status"]] == STATUS
    assert {s["key"]: s["label"] for s in blk["status"]} == LABELS
    assert {i["status"] for i in blk["itens"]} <= set(STATUS)


def test_estrutura_do_item_e_fonte(blk):
    assert blk["fonte"] and all(f.get("nome") and f.get("url") and f.get("acesso") and f.get("licenca")
                                 and "periodo" in f and "nota" in f for f in blk["fonte"])
    ids = [i["id"] for i in blk["itens"]]
    assert len(ids) == len(set(ids)) == 63
    for i in blk["itens"]:
        assert set(i) == {"id", "nome", "esfera", "uf", "rodovias", "km", "status", "data_prevista", "ent", "estudo",
                          "verificado", "fonte_url", "fonte_data", "obs"}
        assert i["esfera"] in ("federal", "estadual")
        assert isinstance(i["uf"], list) and i["uf"] and set(i["uf"]) <= UFS
        assert isinstance(i["rodovias"], list) and all(re.fullmatch(r"[A-Z]{2,3}-\d{3}", r) for r in i["rodovias"])
        assert i["km"] is None or (isinstance(i["km"], (int, float)) and i["km"] > 0)
        assert i["data_prevista"] is None or re.fullmatch(r"\d{4}-\d{2}(-\d{2})?", i["data_prevista"])
        assert isinstance(i["verificado"], bool)


def test_todo_ent_existe_em_conc(blk, conc):
    ids = {e["id"] for e in conc["entidades"]}
    usados = [i["ent"] for i in blk["itens"] if i["ent"] is not None]
    assert usados and set(usados) <= ids
    assert len(usados) == len(set(usados))  # um item por entidade


def test_federal_cobre_projetos_2026_2027(blk, conc):
    alvo = {e["id"] for e in conc["entidades"] if e["estado"] in ("agendado2026", "projeto2027")}
    assert len(alvo) == 15
    fed = {i["ent"] for i in blk["itens"] if i["esfera"] == "federal"}
    assert alvo <= fed
    for i in blk["itens"]:
        if i["ent"] in alvo:
            assert i["esfera"] == "federal"


def test_estudos_pos_2027_referenciam_indice(blk, conc):
    n = len(conc["estudos"])
    est = [i for i in blk["itens"] if i["estudo"] is not None]
    assert sorted(i["estudo"] for i in est) == list(range(n))
    for i in est:
        assert i["ent"] is None and i["esfera"] == "federal" and isinstance(i["estudo"], int)
        e = conc["estudos"][i["estudo"]]
        assert sorted(r.replace("BR-", "") for r in i["rodovias"]) == sorted(e["brs"])
        assert sorted(i["uf"]) == sorted(e["ufs"])


def test_estaduais_com_verificado_booleano_e_fonte_url(blk):
    est = [i for i in blk["itens"] if i["esfera"] == "estadual"]
    assert len(est) >= 15
    for i in est:
        assert i["verificado"] in (True, False)
        assert i["fonte_url"].startswith("http"), i["id"]
        assert i["ent"] is None and i["estudo"] is None
    # só notícia => não verificado; página oficial => verificado
    por_id = {i["id"]: i for i in est}
    assert por_id["rs-bloco-1"]["verificado"] is True
    assert por_id["mg-lote10-noroeste"]["verificado"] is False


def test_polo_goiania_presente(blk):
    p = [i for i in blk["itens"] if i["id"] == "go-polo-goiania"]
    assert len(p) == 1
    p = p[0]
    assert p["esfera"] == "estadual" and p["uf"] == ["GO"] and p["status"] == "tcu" and p["km"] == 572.0
    assert p["rodovias"] == ["GO-020", "GO-060", "GO-070", "GO-080"] and p["verificado"] is True


def test_status_mapeados_do_rascunho_com_nota(blk):
    por_id = {i["id"]: i for i in blk["itens"]}
    assert por_id["rs-bloco-2"]["status"] == "cancelado"
    assert por_id["mg-lote8-vetor-norte"]["status"] == "suspenso"
    assert por_id["fed-rota-dos-sertoes"]["status"] == "leiloado"
    for k in ("rs-bloco-2", "mg-lote8-vetor-norte"):
        assert "Status" in por_id[k]["obs"]


def test_csv_gera_o_json_publicado(blk):
    assert pipeline.montar() == blk
    raw = (ROOT / "data" / "intel" / "pipeline.json").read_text(encoding="utf-8")
    assert raw == json.dumps(blk, ensure_ascii=False, separators=(",", ":"))


def test_validacao_rejeita_status_e_ent_invalidos():
    linha = {"id": "x", "nome": "x", "esfera": "federal", "uf": "MT", "rodovias": "BR-163", "km": "10",
             "status": "estudo", "data_prevista": "", "ent": "", "estudo": "", "verificado": "true",
             "fonte_url": "http://x", "fonte_data": "", "obs": ""}
    ok = pipeline.item_de_linha(linha, {"rota-arco-norte"}, 27)
    assert ok["uf"] == ["MT"] and ok["km"] == 10.0 and ok["ent"] is None and ok["estudo"] is None
    for campo, valor in [("status", "agendado"), ("ent", "nao-existe"), ("verificado", "talvez"),
                         ("esfera", "municipal"), ("estudo", "99"), ("data_prevista", "breve")]:
        with pytest.raises(ValueError):
            pipeline.item_de_linha({**linha, campo: valor}, {"rota-arco-norte"}, 27)


@pytest.mark.skipif(not RASCUNHO.exists(), reason="data/raw/ ausente")
def test_conversao_do_rascunho_reproduz_o_csv():
    assert pipeline.converter_rascunho(RASCUNHO) == (ROOT / "data" / "intel" / "pipeline.csv").read_text(
        encoding="utf-8")
