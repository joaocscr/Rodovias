"""IDA (scripts/intel/ida.py): leitura do CSV da ANBIMA, spread médio sobre a NTN-B, amostragem de dias, cache incremental
e o bloco. Os CSVs de tests/fixtures/ida/ são sintéticos: o formato é o da consulta (texto latin-1 separado por `;`), as
linhas são inventadas; o servidor é simulado por uma função que devolve o texto de um deles com a data trocada."""
import datetime as dt
import json
import re
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
from intel import ida  # noqa: E402

FIX = ROOT / "tests" / "fixtures" / "ida"
A = (FIX / "ipca_infra_a.csv").read_bytes().decode("latin-1")
B = (FIX / "ipca_infra_b.csv").read_bytes().decode("latin-1")
# curva sintética: vencimentos nos mesmos dias dos papéis da fixture, para a conta manual não depender de interpolação
CURVA = [("2030-01-01", 6.0), ("2040-01-01", 7.0)]


class _Manifesto:
    def __init__(self, items=None):
        self.items = list(items or [])
        self.registrados = []

    def add(self, url, path, descricao, periodo="", licenca=""):
        self.registrados.append(Path(path).name)
        return {}

    def save(self):
        pass


def servidor(feriados=(), sem_indice=(), quebrados=(), chamadas=None, desde=None):
    """consultar(indice, 'AAAA-MM-DD') → bytes, como o site: fim de semana e feriado devolvem o aviso; `sem_indice`, o
    arquivo sem a linha do índice; `quebrados`, uma página de erro; `desde`, o primeiro dia que o site guarda (antes dele,
    o aviso, como o site de verdade, que só tem os dias recentes); dia de semana, a fixture A com a data trocada e o
    número-índice crescendo com o dia."""
    def consultar(indice, iso):
        if chamadas is not None:
            chamadas.append((indice, iso))
        d = dt.date.fromisoformat(iso)
        if iso in quebrados:
            return "<html>Serviço indisponível</html>".encode("latin-1")
        if d.weekday() >= 5 or iso in feriados or (desde and iso < desde):
            return b"Ocorreu um erro na leitura do arquivo XML. Por favor, verifique se a data escolhida n\xe3o \xe9 feriado ou fim de semana."
        br = f"{iso[8:]}/{iso[5:7]}/{iso[:4]}"
        numero = f"{1000 + d.toordinal() % 1000},500000"
        texto = A.replace("19/10/2026", br).replace("2.000,500000", numero)
        if iso in sem_indice:
            texto = "\r\n".join(l for l in texto.splitlines() if not l.startswith(f"{br};{numero}"))
        return texto.encode("latin-1")
    return consultar


def rodar(pasta, hoje, **kw):
    kw.setdefault("consultar", servidor())
    return ida.fetch(hoje=hoje, pausa=0, dormir=lambda s: None, pasta=pasta, manifesto=_Manifesto(), log=lambda *_: None,
                     indices=kw.pop("indices", (ida.INFRA, "IPCA")), **kw)


def cache_de(pasta):
    return json.loads((Path(pasta) / "cache.json").read_text(encoding="utf-8"))


# ---------- leitura ----------

def test_ler_csv_fixture():
    r = ida.ler_csv(A)
    assert r["indice"] == {"data": "2026-10-19", "numero_indice": 2000.5, "var_dia": 0.1, "var_mes": 1.2, "var_ano": 3.4,
                           "var_12m": 5.6, "var_24m": 7.8, "duration_du": 1234.0, "valor_mercado": 123456.7}
    assert r["carteira"][0] == {"codigo": "TSTR11", "emissor": "EMISSORA TESTE UM S.A.", "vencimento": "2030-01-01",
                                "indexador": "IPCA", "taxa_indicativa": 7.0, "peso": 2.0}
    assert [p["codigo"] for p in r["carteira"]] == ["TSTR11", "TSTR21", "OUTR11"]
    assert ida.ler_csv(B)["indice"]["numero_indice"] == 2010.625


def test_ler_csv_sem_linha_do_indice():
    sem = A.replace("19/10/2026;2.000,500000;", "x;")
    r = ida.ler_csv("\r\n".join(l for l in sem.splitlines() if not l.startswith("x;")))
    assert r["indice"] is None
    assert ida.ler_csv("Ocorreu um erro") == {"indice": None, "carteira": []}


def test_spread_medio_ponderado():
    """3 papéis: 7,0% em 2030 (curva 6,0 → spread 1,0; peso 2), 8,5% em 2040 (curva 7,0 → 1,5; peso 1) e um em 2050, fora
    da curva (sem spread: sai do numerador e do denominador)."""
    carteira = ida.ler_csv(A)["carteira"]
    assert ida.spread_medio(carteira, CURVA) == pytest.approx((2 * 1.0 + 1 * 1.5) / 3)
    assert ida.spread_medio(carteira, []) is None                     # sem curva
    assert ida.spread_medio([{**carteira[0], "indexador": "DI"}], CURVA) is None  # só papel IPCA conta


# ---------- download e cache ----------

def test_dia_sem_resultado_nao_quebra(tmp_path):
    """Feriado (aviso do site) e arquivo sem a linha do índice viram "sem_dado" no cache e saem da série."""
    feriado, vazio = "2026-10-12", "2026-10-14"
    rodar(tmp_path, "2026-10-21", consultar=servidor(feriados=(feriado,), sem_indice=(vazio,)))
    c = cache_de(tmp_path)[ida.INFRA]
    assert c[feriado] == ida.SEM_DADO and c[vazio] == ida.SEM_DADO
    assert c["2026-10-13"]["numero_indice"] > 0
    carteiras = {ind: (d, ida.ler_csv((p).read_bytes().decode("latin-1"))["carteira"])
                 for ind, (d, p) in ida.carteiras_baixadas(tmp_path).items()}
    bloco = ida.montar(cache_de(tmp_path), carteiras, ["TSTR11"], {}, hoje="2026-10-21")
    datas = [p["data"] for p in bloco["indices"][ida.INFRA]["serie"]]
    assert feriado not in datas and vazio not in datas and "2026-10-13" in datas
    assert bloco["pendencias"]["dias_sem_download"] == []


def test_so_pede_os_dias_que_faltam(tmp_path):
    chamadas = []
    n = rodar(tmp_path, "2026-10-21", consultar=servidor(chamadas=chamadas))
    assert n == len(chamadas) > 100
    chamadas.clear()
    rodar(tmp_path, "2026-10-21", consultar=servidor(chamadas=chamadas))
    assert chamadas == []                                           # nada falta
    rodar(tmp_path, "2026-10-22", consultar=servidor(chamadas=chamadas))
    assert {d for _, d in chamadas} == {"2026-10-22"}               # só o dia novo (uma vez por índice)
    assert len(chamadas) == 2


def test_dia_ainda_nao_publicado_nao_fica_no_cache(tmp_path):
    """Dia depois do último com resultado volta com o aviso porque o site ainda não publicou: não vira "sem_dado"."""
    rodar(tmp_path, "2026-10-21", consultar=servidor(feriados=("2026-10-21",)))
    c = cache_de(tmp_path)[ida.INFRA]
    assert "2026-10-21" not in c and c["2026-10-20"] != ida.SEM_DADO


def test_semana_com_sexta_feriado_vale_a_quinta(tmp_path):
    rodar(tmp_path, "2026-10-21", consultar=servidor(feriados=("2026-07-03",)))
    c = cache_de(tmp_path)[ida.INFRA]
    assert c["2026-07-03"] == ida.SEM_DADO and c["2026-07-02"] != ida.SEM_DADO
    assert "2026-07-01" not in c                                    # a quarta não é pedida: a quinta já tem resultado
    bloco = ida.montar(cache_de(tmp_path), {}, [], {}, hoje="2026-10-21")
    datas = [p["data"] for p in bloco["indices"][ida.INFRA]["serie"]]
    assert "2026-07-02" in datas and "2026-07-01" not in datas      # uma amostra por semana fora dos últimos 31 dias


def test_falha_nao_entra_no_cache_e_vira_pendencia(tmp_path):
    chamadas, esperas = [], []
    r = ida.fetch(hoje="2026-10-21", pausa=0, dormir=esperas.append, pasta=tmp_path, manifesto=_Manifesto(),
                  log=lambda *_: None, indices=(ida.INFRA,),
                  consultar=servidor(quebrados=("2026-10-15",), chamadas=chamadas))
    assert "2026-10-15" not in cache_de(tmp_path)[ida.INFRA]
    assert [d for _, d in chamadas].count("2026-10-15") == 3        # três tentativas
    assert ida.ESPERAS[0] in esperas and ida.ESPERAS[1] in esperas  # com espera entre elas
    bloco = ida.montar(cache_de(tmp_path), {}, [], {}, hoje="2026-10-21")
    assert bloco["pendencias"]["dias_sem_download"] == [{"indice": ida.INFRA, "data": "2026-10-15"}]
    # na vez seguinte o dia que falhou é pedido de novo
    chamadas.clear()
    rodar(tmp_path, "2026-10-21", indices=(ida.INFRA,), consultar=servidor(chamadas=chamadas))
    assert chamadas == [(ida.INFRA, "2026-10-15")]
    assert r > 0


def test_carteira_guarda_so_o_dia_mais_recente(tmp_path):
    rodar(tmp_path, "2026-10-20")
    assert sorted(p.name for p in tmp_path.glob("carteira_*")) == ["carteira_IPCA_2026-10-20.csv",
                                                                   "carteira_IPCA_INFRAESTRUTURA_2026-10-20.csv"]
    rodar(tmp_path, "2026-10-21")
    assert sorted(p.name for p in tmp_path.glob("carteira_*")) == ["carteira_IPCA_2026-10-21.csv",
                                                                   "carteira_IPCA_INFRAESTRUTURA_2026-10-21.csv"]
    assert ida.ler_csv((tmp_path / "carteira_IPCA_2026-10-21.csv").read_bytes().decode("latin-1"))["indice"]["data"] == "2026-10-21"


def test_cache_guarda_a_carteira_enxuta_so_do_infra(tmp_path):
    rodar(tmp_path, "2026-10-20")
    c = cache_de(tmp_path)
    assert c[ida.INFRA]["2026-10-20"]["carteira"][0] == ["2030-01-01", 7.0, 2.0]
    assert "carteira" not in c["IPCA"]["2026-10-20"]


def test_force_pede_tudo_e_mantem_o_anterior_se_falhar(tmp_path):
    rodar(tmp_path, "2026-10-21", indices=(ida.INFRA,))
    antes = cache_de(tmp_path)[ida.INFRA]["2026-10-15"]
    chamadas = []
    rodar(tmp_path, "2026-10-21", indices=(ida.INFRA,), force=True,
          consultar=servidor(quebrados=("2026-10-15",), chamadas=chamadas))
    assert len(chamadas) > 100
    assert cache_de(tmp_path)[ida.INFRA]["2026-10-15"] == antes


def test_fetch_registra_no_manifesto(tmp_path):
    man = _Manifesto()
    ida.fetch(hoje="2026-10-20", pausa=0, dormir=lambda s: None, pasta=tmp_path, manifesto=man, log=lambda *_: None,
              indices=(ida.INFRA,), consultar=servidor())
    assert sorted(man.registrados) == ["cache.json", "carteira_IPCA_INFRAESTRUTURA_2026-10-20.csv"]


# ---------- bloco ----------

def _cache_curto():
    """Dois dias de um índice, com a carteira enxuta do dia, e o mesmo nos outros três."""
    def linha(a):
        return {"numero_indice": a, "var_dia": 0.1, "var_mes": 1.0, "var_ano": 2.0, "var_12m": 3.0, "var_24m": 4.0,
                "duration_du": 1000.0, "valor_mercado": 5000.0}
    cache = {}
    for ind in ida.INDICES:
        cache[ind] = {"2026-10-19": linha(2000.0), "2026-10-20": linha(2010.0), "2026-10-21": linha(2020.0)}
    for d in ("2026-10-19", "2026-10-20", "2026-10-21"):
        cache[ida.INFRA][d]["carteira"] = [["2030-01-01", 7.0, 2.0], ["2040-01-01", 8.5, 1.0]]
    return cache


def test_base100():
    bloco = ida.montar(_cache_curto(), {}, [], {})
    for ind in ida.INDICES:
        serie = bloco["indices"][ind]["serie"]
        assert serie[0]["base100"] == 100.0
        assert serie[1]["base100"] == pytest.approx(2010 / 2000 * 100)
        assert serie[2]["base100"] == pytest.approx(2020 / 2000 * 100)
        assert bloco["indices"][ind]["nome"] == ida.INDICES[ind]
    assert bloco["indices"][ida.INFRA]["ultimo"] == {"data": "2026-10-21", "var_mes": 1.0, "var_ano": 2.0, "var_12m": 3.0,
                                                    "var_24m": 4.0, "duration_du": 1000.0, "valor_mercado": 5000.0}


def test_base100_parte_do_primeiro_ponto_da_janela():
    """Dia mais antigo que 24 meses antes do último fica fora; o primeiro ponto que sobra vale 100."""
    cache = _cache_curto()
    cache[ida.INFRA]["2024-01-05"] = {**cache[ida.INFRA]["2026-10-19"], "numero_indice": 100.0}
    cache[ida.INFRA]["2024-10-22"] = {**cache[ida.INFRA]["2026-10-19"], "numero_indice": 1500.0}
    serie = ida.montar(cache, {}, [], {})["indices"][ida.INFRA]["serie"]
    assert [p["data"] for p in serie][:2] == ["2024-10-22", "2026-10-19"]
    assert serie[0]["base100"] == 100.0 and serie[1]["base100"] == pytest.approx(2000 / 1500 * 100)


def test_spread_medio_so_no_infra_e_sem_curva_fica_nulo():
    curvas = {"2026-10-19": [(v, t, "NTN-B") for v, t in CURVA], "2026-10-21": [(v, t, "NTN-B") for v, t in CURVA]}
    bloco = ida.montar(_cache_curto(), {}, [], curvas)
    spreads = {p["data"]: p["spread_medio"] for p in bloco["indices"][ida.INFRA]["serie"]}
    assert spreads == {"2026-10-19": pytest.approx((2 * 1.0 + 1 * 1.5) / 3, abs=1e-4), "2026-10-20": None,
                       "2026-10-21": pytest.approx((2 * 1.0 + 1 * 1.5) / 3, abs=1e-4)}
    for ind in ("IPCA", "GERAL", "DI"):
        assert all("spread_medio" not in p for p in bloco["indices"][ind]["serie"])


def test_papeis_so_do_universo():
    carteira = ida.ler_csv(A)["carteira"]
    curvas = {"2026-10-19": [(v, t, "NTN-B") for v, t in CURVA]}
    bloco = ida.montar(_cache_curto(), {ida.INFRA: ("2026-10-19", carteira)}, ["TSTR11", "TSTR21", "SEM_NA_CARTEIRA"], curvas)
    assert bloco["papeis"] == {"TSTR11": {"taxa_indicativa": 7.0, "spread": 1.0, "data": "2026-10-19"},
                               "TSTR21": {"taxa_indicativa": 8.5, "spread": 1.5, "data": "2026-10-19"}}   # OUTR11 fica de fora
    sem_curva = ida.montar(_cache_curto(), {ida.INFRA: ("2026-10-19", carteira)}, ["TSTR11"], {})
    assert sem_curva["papeis"]["TSTR11"]["spread"] is None


def test_papel_que_nao_e_ipca_nao_entra_nos_papeis():
    carteira = [{**ida.ler_csv(A)["carteira"][0], "indexador": "DI"}]
    assert ida.montar(_cache_curto(), {"DI": ("2026-10-19", carteira)}, ["TSTR11"], {})["papeis"] == {}


def test_bloco_ida_nao_depende_do_dia(tmp_path):
    """O build roda com dois "hoje" diferentes (e o manifesto gravado entre eles): o mesmo bloco, byte a byte. A janela
    parte do último dia do cache, não do relógio."""
    rodar(tmp_path, "2026-10-21")
    cache = cache_de(tmp_path)
    cart = {ind: (d, ida.ler_csv(p.read_bytes().decode("latin-1"))["carteira"]) for ind, (d, p) in ida.carteiras_baixadas(tmp_path).items()}
    man = _Manifesto([{"arquivo": "data/raw/ida/cache.json", "acesso": "2026-10-21", "sha256": "x"}])
    curvas = {"2026-10-20": [(v, t, "NTN-B") for v, t in CURVA]}
    a = ida.montar(cache, cart, ["TSTR11"], curvas, manifesto=man, hoje="2026-10-22")
    b = ida.montar(cache, cart, ["TSTR11"], curvas, manifesto=man, hoje="2027-03-01")
    assert json.dumps(a) == json.dumps(b)
    assert a["fonte"][0]["acesso"] == "2026-10-21"
    assert a["indices"][ida.INFRA]["serie"][-1]["data"] == "2026-10-21"


def test_fonte_com_periodo_e_licenca():
    f = ida.montar(_cache_curto(), {}, [], {}, hoje="2026-10-22")["fonte"][0]
    assert f["periodo"] == "19/10/2026 a 21/10/2026" and f["acesso"] == "2026-10-22"
    assert f["tipo"] == "medido" and f["url"].startswith("https://www.anbima.com.br/") and f["licenca"]


def test_cache_sem_dias_e_erro_claro():
    with pytest.raises(ValueError, match="atualizar.py --baixar"):
        ida.montar({ida.INFRA: {"2026-10-18": ida.SEM_DADO}}, {}, [], {})


def test_build_sem_cache_e_arquivo_ausente(tmp_path):
    with pytest.raises(FileNotFoundError):
        ida.build(pasta=tmp_path, out=tmp_path / "ida.json", manifesto=_Manifesto())


def test_build_le_so_o_cache(tmp_path, monkeypatch):
    """Do cache e das carteiras de data/raw/ida/ ao JSON, sem rede (a função de download nem é chamada)."""
    rodar(tmp_path, "2026-10-21")
    monkeypatch.setattr(ida, "_consultar", lambda *a: pytest.fail("o build não pode ir à rede"))
    deb = tmp_path / "debentures.json"
    deb.write_text(json.dumps({"emissoes": [{"ticker": "TSTR11"}]}), encoding="utf-8")
    out = tmp_path / "saida" / "ida.json"
    doc = ida.build(pasta=tmp_path, out=out, debentures=deb, tesouro=tmp_path / "nao_existe.csv", manifesto=_Manifesto())
    assert json.loads(out.read_text(encoding="utf-8")) == doc
    assert set(doc["papeis"]) == {"TSTR11"} and doc["papeis"]["TSTR11"]["spread"] is None   # sem o arquivo do Tesouro
    assert set(doc["indices"]) == {ida.INFRA, "IPCA"}


def test_dias_sem_download_vao_para_a_curadoria():
    sys.path.insert(0, str(ROOT / "scripts"))
    import curadoria
    bloco = {"pendencias": {"dias_sem_download": [{"indice": ida.INFRA, "data": "2026-10-15"},
                                                  {"indice": ida.INFRA, "data": "2026-10-16"}]}}
    itens = [i for i in curadoria.itens({}, {"ida": bloco}, {}, dt.date(2026, 10, 21)) if i["tipo"] == "ida_dias_com_falha"]
    assert len(itens) == 1 and itens[0]["item"] == ida.INFRA
    assert "15/10/2026" in itens[0]["motivo"] and "--dominios ida" in itens[0]["motivo"]
    assert not [i for i in curadoria.itens({}, {"ida": {"pendencias": {"dias_sem_download": []}}}, {}, dt.date(2026, 10, 21))
                if i["tipo"] == "ida_dias_com_falha"]


def test_site_so_guarda_dias_recentes_a_volta_para_sozinha(tmp_path):
    """Como o site de verdade (só os dias recentes): a volta pelas semanas termina depois de 4 semanas seguidas sem
    resultado, em vez de pedir 24 meses de dias que não existem; o que nunca existiu não vira falha."""
    chamadas = []
    rodar(tmp_path, "2026-10-22", consultar=servidor(desde="2026-10-14", chamadas=chamadas), indices=(ida.INFRA,))
    c = cache_de(tmp_path)[ida.INFRA]
    assert _dados(c) == ["2026-10-14", "2026-10-15", "2026-10-16", "2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22"]
    assert len(chamadas) < 22 + 5 * (ida.SEMANAS_VAZIAS + 1)           # os 31 dias recentes + as semanas vazias
    assert min(c) >= "2026-09-01"
    bloco = ida.montar(cache_de(tmp_path), {}, [], {})
    assert bloco["pendencias"]["dias_sem_download"] == []
    chamadas.clear()
    rodar(tmp_path, "2026-10-22", consultar=servidor(desde="2026-10-14", chamadas=chamadas), indices=(ida.INFRA,))
    assert chamadas == []                                               # a segunda volta não pede nada
    rodar(tmp_path, "2026-10-26", consultar=servidor(desde="2026-10-14", chamadas=chamadas), indices=(ida.INFRA,))
    assert {d for _, d in chamadas} == {"2026-10-23", "2026-10-26"}   # só os dias novos, sem recuar de novo


def test_site_fora_do_ar_encerra_o_indice(tmp_path, capsys):
    chamadas = []

    def fora(indice, iso):
        chamadas.append(iso)
        raise RuntimeError("curl: (7) falha de conexão")
    rodar(tmp_path, "2026-10-22", consultar=fora)
    assert len(chamadas) == ida.FALHAS_SEGUIDAS * 3 * 2                 # 3 tentativas por pedido, 2 índices
    assert "não respondeu" in capsys.readouterr().err
    assert cache_de(tmp_path) == {ida.INFRA: {}, "IPCA": {}}


def _dados(c):
    return sorted(d for d, v in c.items() if v != ida.SEM_DADO)


def test_spread_do_bloco_confere_com_calculo_manual_de_dois_dias():
    """Dois dias com curvas diferentes, contas feitas à mão sobre as fixtures A (19/10) e B (20/10). Dia A: papéis de 7,0%
    (curva 6,0; spread 1,0; peso 2) e 8,5% (curva 7,0; 1,5; peso 1); o de 2050 fica fora da curva. Dia B: 7,1% (curva 6,5;
    0,6; peso 2) e 8,6% (curva 7,5; 1,1; peso 1)."""
    def enxuta(texto):
        return [[p["vencimento"], p["taxa_indicativa"], p["peso"]] for p in ida.ler_csv(texto)["carteira"]]
    cache = _cache_curto()
    cache[ida.INFRA] = {"2026-10-19": {**cache[ida.INFRA]["2026-10-19"], "carteira": enxuta(A)},
                        "2026-10-20": {**cache[ida.INFRA]["2026-10-20"], "carteira": enxuta(B)}}
    curvas = {"2026-10-19": [("2030-01-01", 6.0, "NTN-B"), ("2040-01-01", 7.0, "NTN-B")],
              "2026-10-20": [("2030-01-01", 6.5, "NTN-B"), ("2040-01-01", 7.5, "NTN-B")]}
    serie = ida.montar(cache, {}, [], curvas)["indices"][ida.INFRA]["serie"]
    assert [p["spread_medio"] for p in serie] == [round((2 * 1.0 + 1 * 1.5) / 3, 4), round((2 * 0.6 + 1 * 1.1) / 3, 4)]
    assert [p["spread_medio"] for p in serie] == [1.1667, 0.7667]
