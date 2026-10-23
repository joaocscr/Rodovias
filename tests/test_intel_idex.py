"""IDEX-Infra (scripts/intel/idex_arquivos.py e idex.py): leitura da planilha de dados e do relatório mensal, agregados
diários, histórico acumulado, reconciliação dos retornos e bloco data/intel/idex.json. Os arquivos de teste são sintéticos
(tests/fixtures/idex/gerar.py); os do usuário ficam fora do git e só são lidos no último teste, pulado sem eles."""
import copy
import datetime as dt
import json
import shutil
import sys
import types
from pathlib import Path

import pymupdf
import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import atualizar  # noqa: E402
import curadoria  # noqa: E402
from intel import idex  # noqa: E402
from intel import idex_arquivos as ia  # noqa: E402

FIX = ROOT / "tests" / "fixtures" / "idex"
DATAFILE = FIX / "idex_teste_datafile.xlsx"
RELATORIO = FIX / "relatorio_teste.pdf"
GERAL, CORE = "Idex-Infra Geral", "Idex-Infra Core"


class _Manifesto:
    """Manifesto em memória: o teste não toca em data/manifest/."""
    def __init__(self, items=None):
        self.items = list(items or [])

    def save(self):
        pass


@pytest.fixture
def pasta(tmp_path):
    p = tmp_path / "idex"
    p.mkdir()
    shutil.copy(DATAFILE, p / DATAFILE.name)
    shutil.copy(RELATORIO, p / RELATORIO.name)
    return p


@pytest.fixture
def universo(tmp_path):
    """Bloco de debêntures mínimo: duas das três debêntures da planilha de teste são de transporte."""
    p = tmp_path / "debentures.json"
    p.write_text(json.dumps({"emissoes": [{"ticker": "TSTR11"}, {"ticker": "FERX11"}, {"ticker": "SEMIDEX"}],
                             "secundario": {"periodo": {"de": "2026-09-01", "ate": "2026-10-21"}}}), encoding="utf-8")
    return p


def _montar(pasta, universo, tmp_path, historico=None, hoje="2026-10-23", manifesto=None):
    h = tmp_path / "idex_historico.json"
    if historico is not None:
        h.write_text(json.dumps({"spread": historico}), encoding="utf-8")
    return idex.montar(pasta, h, universo, hoje=hoje, manifesto=manifesto if manifesto is not None else _Manifesto())


# ---------- leitura dos arquivos ----------

def test_ler_datafile_fixture():
    linhas = ia.ler_datafile(DATAFILE)
    assert len(linhas) == 6
    assert linhas[0] == {"data": "2026-09-22", "ticker": "TSTR11", "peso": 0.5, "duration": 4.0, "spread_bps": 100.0}
    assert {l["data"] for l in linhas} == {"2026-09-22", "2026-09-23"}
    assert [l["ticker"] for l in linhas[3:]] == ["TSTR11", "FERX11", "ENRG11"]


def test_arquivos_acha_datafile_e_relatorios(pasta):
    a = ia.arquivos(pasta)
    assert a["datafile"] == pasta / DATAFILE.name
    assert a["relatorios"] == [pasta / RELATORIO.name]
    vazio = ia.arquivos(pasta / "nao_existe")
    assert vazio == {"datafile": None, "relatorios": []}


def test_ler_relatorio_fixture():
    r = ia.ler_relatorio(RELATORIO)
    assert r["mes_referencia"] == "2026-03"
    geral = r["retornos"][GERAL]
    # ano incompleto: os três meses ficam em jan, fev e mar de 2026; o quarto número é o acumulado, não abril
    assert [m for m in geral if m.startswith("2026")] == ["2026-01", "2026-02", "2026-03"]
    assert geral["2026-01"] == 1.5 and geral["2026-02"] == -0.4 and geral["2026-03"] == 0.3
    assert r["acumulado_ano"][GERAL]["2026"] == 1.4
    assert len([m for m in geral if m.startswith("2025")]) == 12 and geral["2025-12"] == 0.3
    assert r["acumulado_ano"][GERAL]["2025"] == 6.05
    assert r["retornos"][CORE]["2026-03"] == 0.2 and r["acumulado_ano"][CORE]["2026"] == 1.09


def test_ler_relatorio_sem_a_pagina_levanta(tmp_path):
    p = tmp_path / "outro.pdf"
    doc = pymupdf.open()
    doc.new_page().insert_text((50, 50), "Outro relatório, sem a tabela de performance")
    doc.save(p)
    with pytest.raises(ValueError, match="Histórico de performance"):
        ia.ler_relatorio(p)


# ---------- agregados ----------

def test_agregar_dia_ponderado():
    linhas = [l for l in ia.ler_datafile(DATAFILE) if l["data"] == "2026-09-22"]
    assert idex.agregar_dia(linhas) == {"data": "2026-09-22", "spread_medio_bps": 105.0, "duration_media": 5.6,
                                        "n_papeis": 3}


def test_agregar_dia_ignora_papel_sem_spread_na_media():
    linhas = [{"data": "2026-09-22", "ticker": "A", "peso": 0.6, "duration": 4.0, "spread_bps": 100.0},
              {"data": "2026-09-22", "ticker": "B", "peso": 0.4, "duration": 6.0, "spread_bps": None}]
    a = idex.agregar_dia(linhas)
    assert a["spread_medio_bps"] == 100.0  # B sai do numerador e do denominador
    assert a["duration_media"] == 4.8 and a["n_papeis"] == 2


def test_historico_cresce_e_dia_novo_vence(pasta, universo, tmp_path):
    antigo = [{"data": "2026-08-31", "spread_medio_bps": 90.0, "duration_media": 5.0, "n_papeis": 500},
              {"data": "2026-09-23", "spread_medio_bps": 999.0, "duration_media": 9.0, "n_papeis": 1}]
    bloco, historico = _montar(pasta, universo, tmp_path, antigo)
    datas = [d["data"] for d in bloco["spread"]]
    assert datas == ["2026-08-31", "2026-09-22", "2026-09-23"]  # o dia antigo fica; o histórico cresce
    novo = next(d for d in bloco["spread"] if d["data"] == "2026-09-23")
    assert novo["spread_medio_bps"] == 0.4 * 110 + 0.4 * 140 + 0.2 * 60 and novo["n_papeis"] == 3  # o dia novo vence
    assert historico == {"spread": bloco["spread"]}
    # rodar de novo com o histórico gravado não muda nada
    h = tmp_path / "idex_historico.json"
    h.write_text(json.dumps(historico), encoding="utf-8")
    assert idex.montar(pasta, h, universo, hoje="2026-10-23", manifesto=_Manifesto())[0] == bloco


# ---------- retornos e reconciliação ----------

def test_bloco_retornos_e_acumulado_12m(pasta, universo, tmp_path):
    bloco, _ = _montar(pasta, universo, tmp_path)
    geral = bloco["retornos"][GERAL]
    assert geral[0] == {"mes": "2025-01", "pct": 1.1} and geral[-1] == {"mes": "2026-03", "pct": 0.3}
    assert [m["mes"] for m in geral] == sorted(m["mes"] for m in geral) and len(geral) == 15
    # últimos 12 meses (abr/2025 a mar/2026), à mão
    p = 1.0
    for m in geral[-12:]:
        p *= 1 + m["pct"] / 100
    assert bloco["acumulado_12m"][GERAL] == round((p - 1) * 100, 2)


def test_acumulado_12m_nulo_sem_doze_meses():
    assert idex.acumulado_12m({"2026-01": 1.0, "2026-02": 1.0}) is None
    buraco = {f"2025-{m:02d}": 1.0 for m in range(1, 13)}
    del buraco["2025-06"]
    assert idex.acumulado_12m(buraco) is None


def test_reconciliacao_ano():
    r = ia.ler_relatorio(RELATORIO)
    assert idex.reconciliar(r) == []  # o acumulado impresso bate com o produto dos meses (±0,05 p.p.)
    ruim = copy.deepcopy(r)
    ruim["acumulado_ano"][GERAL]["2025"] = 6.2  # produto dos meses: 6,05
    (p,) = idex.reconciliar(ruim)
    assert (p["nome"], p["ano"], p["acumulado"]) == (GERAL, "2025", 6.2) and p["produto"] == 6.05
    quase = copy.deepcopy(r)
    quase["acumulado_ano"][GERAL]["2025"] = 6.09  # 0,04 p.p. de diferença: dentro da tolerância
    assert idex.reconciliar(quase) == []


def test_relatorio_ilegivel_vai_para_curadoria(pasta, universo, tmp_path):
    (pasta / "quebrado.pdf").write_bytes(b"isto nao e um pdf")
    bloco, _ = _montar(pasta, universo, tmp_path)
    (ilegivel,) = bloco["pendencias"]["relatorios_ilegiveis"]
    assert ilegivel["arquivo"].endswith("quebrado.pdf") and ilegivel["motivo"]
    assert bloco["retornos"][GERAL]  # o relatório bom continua valendo
    itens = curadoria.itens({}, {"idex": bloco}, {}, dt.date(2026, 10, 23))
    achados = [i for i in itens if i["tipo"] == "idex_relatorio_ilegivel"]
    assert len(achados) == 1 and "quebrado.pdf" in achados[0]["item"] and "data/raw/idex" in achados[0]["motivo"]


def test_reconciliacao_vai_para_curadoria(pasta, universo, tmp_path, monkeypatch):
    ler = ia.ler_relatorio

    def adulterado(path):
        r = ler(path)
        r["acumulado_ano"][CORE]["2025"] = 9.99
        return r

    monkeypatch.setattr(idex.idex_arquivos, "ler_relatorio", adulterado)
    bloco, _ = _montar(pasta, universo, tmp_path)
    (p,) = bloco["pendencias"]["reconciliacao"]
    assert (p["nome"], p["ano"], p["acumulado"]) == (CORE, "2025", 9.99)
    itens = curadoria.itens({}, {"idex": bloco}, {}, dt.date(2026, 10, 23))
    achados = [i for i in itens if i["tipo"] == "idex_reconciliacao"]
    assert len(achados) == 1 and CORE in achados[0]["item"] and "2025" in achados[0]["item"]


def test_arquivo_antigo_vai_para_curadoria():
    bloco = {"spread": [{"data": "2026-09-23", "spread_medio_bps": 1, "duration_media": 1, "n_papeis": 1}]}
    deb = lambda ate: {"secundario": {"periodo": {"de": "2026-09-01", "ate": ate}}}  # noqa: E731
    hoje = dt.date(2026, 10, 23)
    em_dia = curadoria.itens({}, {"idex": bloco, "debentures": deb("2026-11-07")}, {}, hoje)  # 45 dias: ainda vale
    assert [i for i in em_dia if i["tipo"] == "idex_arquivo_antigo"] == []
    velho = curadoria.itens({}, {"idex": bloco, "debentures": deb("2026-11-08")}, {}, hoje)  # 46 dias
    (item,) = [i for i in velho if i["tipo"] == "idex_arquivo_antigo"]
    assert "23/09/2026" in item["motivo"] and "08/11/2026" in item["motivo"] and "data/raw/idex" in item["motivo"]


# ---------- bloco ----------

def test_papeis_so_do_universo_de_transporte_no_ultimo_dia(pasta, universo, tmp_path):
    bloco, _ = _montar(pasta, universo, tmp_path)
    assert bloco["papeis"] == {"FERX11": {"spread_bps": 140.0, "data": "2026-09-23"},
                               "TSTR11": {"spread_bps": 110.0, "data": "2026-09-23"}}  # ENRG11 e SEMIDEX ficam fora


def test_fonte_cita_origem_e_periodo_dos_arquivos(pasta, universo, tmp_path):
    bloco, _ = _montar(pasta, universo, tmp_path)
    (f,) = bloco["fonte"]
    assert f["nome"] == ("IDEX Analytics — IDEX-Infra (arquivos fornecidos ao projeto: planilha de dados e relatório "
                         "mensal)")
    assert "22/09/2026 a 23/09/2026" in f["periodo"] and "01/2025 a 03/2026" in f["periodo"]
    assert f["acesso"] == "2026-10-23" and f["tipo"] == "medido" and f["url"].startswith("https://")


def test_manifesto_guarda_sha_e_primeiro_dia_visto(pasta, universo, tmp_path):
    m = _Manifesto()
    _montar(pasta, universo, tmp_path, manifesto=m, hoje="2026-10-23")
    assert sorted(i["arquivo"].rsplit("/", 1)[-1] for i in m.items) == [DATAFILE.name, RELATORIO.name]
    assert all(len(i["sha256"]) == 64 and i["acesso"] == "2026-10-23" and i["dominio"] == "idex" for i in m.items)
    _montar(pasta, universo, tmp_path, manifesto=m, hoje="2026-11-30")
    assert {i["acesso"] for i in m.items} == {"2026-10-23"}  # mesmo conteúdo: a data do primeiro dia visto fica


def test_bloco_idex_nao_depende_do_dia(pasta, universo, tmp_path):
    m = _Manifesto()
    a = _montar(pasta, universo, tmp_path, manifesto=m, hoje="2026-10-23")
    b = _montar(pasta, universo, tmp_path, manifesto=m, hoje="2027-03-01")
    assert json.dumps(a[0], sort_keys=True) == json.dumps(b[0], sort_keys=True)
    assert a[1] == b[1]


def test_sem_arquivos_levanta_arquivo_ausente(tmp_path, universo):
    vazia = tmp_path / "vazia"
    vazia.mkdir()
    with pytest.raises(FileNotFoundError):
        idex.montar(vazia, tmp_path / "h.json", universo, manifesto=_Manifesto())


def test_sem_arquivos_pula(tmp_path):
    chamadas = []
    vazio = types.SimpleNamespace(PASTA=ROOT / "data/raw/idex", arquivos=lambda: {"datafile": None, "relatorios": []},
                                  fetch=lambda force=False: chamadas.append("idex.fetch"),
                                  build=lambda: chamadas.append("idex.build"))
    outro = types.SimpleNamespace(fetch=lambda force=False: chamadas.append("rotas.fetch"),
                                  build=lambda: chamadas.append("rotas.build"))
    importar = lambda nome: vazio if nome == "intel.idex" else outro  # noqa: E731
    passos = atualizar.passos_dominios(["idex", "rotas"], baixar=True, importar=importar)
    res = atualizar.executar(passos, intel_dir=tmp_path, manifest_dir=None)
    assert [(r["passo"], r["estado"]) for r in res] == [("idex", "pulado"), ("rotas", "ok")]
    assert "data/raw/idex/" in res[0]["detalhe"] and "idex.json ficou como estava" in res[0]["detalhe"]
    assert chamadas == ["rotas.fetch", "rotas.build"]
    assert atualizar.ORDEM.index("idex") > atualizar.ORDEM.index("debentures")


def test_fetch_e_no_op():
    assert idex.fetch() is None and idex.fetch(force=True) is None


# ---------- arquivos reais do usuário ----------

REAL = ROOT / "data" / "raw" / "idex"


@pytest.mark.skipif(not (ia.arquivos(REAL)["datafile"] and ia.arquivos(REAL)["relatorios"]),
                    reason="arquivos do IDEX do usuário ausentes em data/raw/idex/")
def test_arquivos_reais_leem_e_reconciliam():
    a = ia.arquivos(REAL)
    dias = {l["data"] for l in ia.ler_datafile(a["datafile"])}
    assert len(dias) >= 1
    for r in a["relatorios"]:
        rel = ia.ler_relatorio(r)
        assert not [x for x in idex.reconciliar(rel) if x["ano"] in ("2024", "2025")]  # anos fechados: dentro de 0,05 p.p.
