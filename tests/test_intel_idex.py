"""IDEX-Infra (scripts/intel/idex_arquivos.py e idex.py): leitura da planilha de dados e do relatório mensal, agregados
diários, histórico acumulado, reconciliação dos retornos e bloco data/intel/idex.json. Os arquivos de teste são sintéticos
(tests/fixtures/idex/gerar.py); os do usuário ficam fora do git e só são lidos no último teste, pulado sem eles."""
import copy
import datetime as dt
import importlib.util
import json
import os
import shutil
import sys
import types
from pathlib import Path

import openpyxl
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

_spec = importlib.util.spec_from_file_location("idex_gerar", FIX / "gerar.py")
gerar = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(gerar)


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


def test_arquivos_acha_planilhas_e_relatorios(pasta):
    a = ia.arquivos(pasta)
    assert a["datafiles"] == [pasta / DATAFILE.name]
    assert a["relatorios"] == [pasta / RELATORIO.name]
    vazio = ia.arquivos(pasta / "nao_existe")
    assert vazio == {"datafiles": [], "relatorios": []}


def _planilha(destino, dias, mtime=None):
    """Planilha sintética: `dias` = [(AAAA-MM-DD, [(ticker, peso, duration, spread_bps)])]; `mtime` fixa a data de modificação."""
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Detalhado"
    ws.append(gerar.CABECALHO)
    for dia, papeis in dias:
        for ticker, peso, duration, spread in papeis:
            ws.append([dt.datetime.fromisoformat(dia), ticker, peso, 0, 0, 0, duration, spread, "Teste", False, "Emissor Teste",
                       1.0, 1000.0])
    wb.save(destino)
    if mtime:
        os.utime(destino, (mtime, mtime))
    return destino


def test_arquivos_lista_todas_as_planilhas_por_nome_sem_olhar_a_data_de_modificacao(pasta):
    b = _planilha(pasta / "a_datafile_antiga.xlsx", [("2026-08-10", [("TSTR11", 1.0, 3.0, 90.0)])], mtime=2_000_000_000)
    os.utime(pasta / DATAFILE.name, (1_000_000_000, 1_000_000_000))
    (pasta / "~$lock_datafile.xlsx").write_bytes(b"")
    assert ia.arquivos(pasta)["datafiles"] == [b, pasta / DATAFILE.name]


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

def test_varias_planilhas_juntam_por_dia_e_a_de_ultimo_dia_mais_recente_dita_os_papeis(pasta, universo, tmp_path):
    # a planilha antiga é a de modificação mais nova: a ordem vem dos dias, não do arquivo
    _planilha(pasta / "outra_datafile.xlsx",
              [("2026-09-10", [("TSTR11", 1.0, 3.0, 80.0)]),
               ("2026-09-22", [("TSTR11", 0.5, 3.0, 999.0), ("FERX11", 0.5, 3.0, 999.0)])], mtime=2_000_000_000)
    m = _Manifesto()
    bloco, historico = _montar(pasta, universo, tmp_path, manifesto=m)
    assert [d["data"] for d in bloco["spread"]] == ["2026-09-10", "2026-09-22", "2026-09-23"]
    assert bloco["spread"][0]["spread_medio_bps"] == 80.0  # dia que só a outra planilha traz
    assert bloco["spread"][1]["spread_medio_bps"] == 105.0  # dia nas duas: vale a planilha de último dia mais recente
    assert bloco["papeis"] == {"FERX11": {"spread_bps": 140.0, "data": "2026-09-23"},
                               "TSTR11": {"spread_bps": 110.0, "data": "2026-09-23"}}
    assert "22/09/2026 a 23/09/2026" in bloco["fonte"][0]["periodo"]  # o período da fonte é o da planilha mais recente
    assert "desde 10/09/2026" in bloco["fonte"][0]["periodo"]
    periodos = {i["arquivo"].rsplit("/", 1)[-1]: i["periodo"] for i in m.items if i["arquivo"].endswith(".xlsx")}
    assert periodos == {DATAFILE.name: "22/09/2026 a 23/09/2026", "outra_datafile.xlsx": "10/09/2026 a 22/09/2026"}
    assert historico == {"spread": bloco["spread"]}


def test_varias_planilhas_dia_repetido_vale_o_arquivo_de_ultimo_dia_mais_recente_qualquer_que_seja_o_nome(pasta, universo,
                                                                                                         tmp_path):
    _planilha(pasta / "zzz_datafile.xlsx", [("2026-09-22", [("TSTR11", 1.0, 3.0, 999.0)])])  # nome por último, dias antigos
    bloco, _ = _montar(pasta, universo, tmp_path)
    assert next(d for d in bloco["spread"] if d["data"] == "2026-09-22")["spread_medio_bps"] == 105.0
    assert bloco["papeis"]["TSTR11"]["data"] == "2026-09-23"


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


def _relatorio_antigo(destino, monkeypatch, soma=1.0):
    """Relatório só até dez/2025, com o acumulado de 2025 impresso `soma` p.p. acima do produto dos meses."""
    antes = gerar.acumulado
    monkeypatch.setattr(gerar, "RETORNOS", {2025: gerar.RETORNOS[2025]})
    monkeypatch.setattr(gerar, "acumulado", lambda meses: round(antes(meses) + soma, 2))
    gerar.relatorio(destino)


def test_reconciliacao_gera_aviso_para_a_tela(pasta, universo, tmp_path, monkeypatch):
    (pasta / RELATORIO.name).unlink()
    _relatorio_antigo(pasta / "antigo.pdf", monkeypatch)
    bloco, _ = _montar(pasta, universo, tmp_path)
    assert [x["nome"] for x in bloco["avisos"]] == [CORE, GERAL]  # por nome, e os dois índices divergem
    geral = bloco["avisos"][1]
    assert geral == {"tipo": "reconciliacao", "nome": GERAL, "ano": "2025", "produto": 6.05, "acumulado_impresso": 7.05,
                     "relatorio": "2025-12"}
    assert len(bloco["pendencias"]["reconciliacao"]) == 2  # o mesmo achado segue na curadoria


def test_sem_divergencia_nao_ha_aviso(pasta, universo, tmp_path):
    bloco, _ = _montar(pasta, universo, tmp_path)
    assert bloco["avisos"] == [] and bloco["pendencias"]["reconciliacao"] == []


def test_relatorio_substituido_por_outro_mais_novo_nao_deixa_pendencia(pasta, universo, tmp_path, monkeypatch):
    _relatorio_antigo(pasta / "antigo.pdf", monkeypatch)  # imprime acumulado errado em 2025; o relatório de 03/2026 corrige
    bloco, _ = _montar(pasta, universo, tmp_path)
    assert bloco["pendencias"]["reconciliacao"] == [] and bloco["avisos"] == []
    assert len(bloco["retornos"][GERAL]) == 15  # os meses não se repetem


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
    vazio = types.SimpleNamespace(PASTA=ROOT / "data/raw/idex", arquivos=lambda: {"datafiles": [], "relatorios": []},
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


@pytest.mark.skipif(not (ia.arquivos(REAL)["datafiles"] and ia.arquivos(REAL)["relatorios"]),
                    reason="arquivos do IDEX do usuário ausentes em data/raw/idex/")
def test_arquivos_reais_leem_e_reconciliam():
    a = ia.arquivos(REAL)
    dias = {l["data"] for f in a["datafiles"] for l in ia.ler_datafile(f)}
    assert len(dias) >= 1
    for r in a["relatorios"]:
        rel = ia.ler_relatorio(r)
        assert not [x for x in idex.reconciliar(rel) if x["ano"] in ("2024", "2025")]  # anos fechados: dentro de 0,05 p.p.
