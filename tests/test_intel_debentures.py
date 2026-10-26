"""Debêntures (scripts/intel/debentures.py): leitura das planilhas, classificação dos emissores, spread sobre a NTN-B,
agregados e bloco data/intel/debentures.json. As planilhas de teste são sintéticas (tests/fixtures/debentures/gerar.py);
as do usuário ficam fora do git e só são lidas no último teste, pulado sem elas."""
import datetime as dt
import json
import os
import shutil
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import build  # noqa: E402
import curadoria  # noqa: E402
from intel import curva_anbima as anb  # noqa: E402
from intel import debentures as deb  # noqa: E402
from intel import debentures_planilhas as dp  # noqa: E402
from intel import debentures_texto as tx  # noqa: E402
from intel import snd as snd_mod  # noqa: E402

FIX = ROOT / "tests" / "fixtures" / "debentures"
PUBLICO = FIX / "publico"
CURVAS = PUBLICO / anb.SUBPASTA
SND = FIX / "snd.txt"
EMISSORES = FIX / "emissores.json"
BLOCO = ROOT / "data" / "intel" / "debentures.json"
HOJE = dt.date(2026, 10, 22)


def _dias(a, b):
    return (dt.date.fromisoformat(b) - dt.date.fromisoformat(a)).days


def _ntnb(venc, pontos):
    """Interpolação linear à mão entre os dois vizinhos de `pontos` [(vencimento, taxa)]."""
    (v0, t0), (v1, t1) = pontos
    return t0 + (t1 - t0) * _dias(v0, venc) / _dias(v0, v1)


class _Manifesto:
    """Manifesto em memória: o teste não toca em data/manifest/."""
    def __init__(self, items=None):
        self.items = list(items or [])

    def save(self):
        pass


def _downloads(dia="2026-10-22"):
    """Registros de download das séries públicas, como o `fetch` grava no manifesto."""
    urls = [deb.SGS.format(c, n) for c, n, _ in deb.SERIES.values()] + [deb.FOCUS_URL, snd_mod.URL]
    return [{"url": u, "acesso": dia, "baixado": dia, "sha256": u[-8:]} for u in urls]


@pytest.fixture(scope="module")
def bloco():
    return deb.montar(FIX, PUBLICO, EMISSORES, hoje="2026-10-22", manifesto=_Manifesto(_downloads()), snd=SND)


def _por(lista, campo):
    return {r[campo]: r for r in lista}


# ---------- leitura ----------

def test_taxas_normalizadas_em_pct_ao_ano():
    mov = dp.ler_negocios(FIX / "negocios.xlsx")
    neg = mov["negocios"]
    assert [n["taxa"] for n in neg[:3]] == [7.0, 7.2, 7.1]              # BTG: número
    assert mov["intencoes"][0]["taxa"] == 7.6                             # XP: texto "7,60%"
    assert {n["indexador"] for n in neg} == {"IPCA+", "PRÉ"}
    assert {i["indexador"] for i in mov["intencoes"]} == {"IPCA+", "DI+"}
    assert mov["intencoes"][0]["direcao"] == "compra" and mov["intencoes"][1]["direcao"] == "venda"
    # horário de Brasília (UTC−3): 19:30 UTC do dia 1º continua no dia 1º
    assert (neg[1]["data"], neg[1]["hora"]) == ("2026-10-01", "16:30")
    assert neg[0]["vencimento"] == "2032-05-15" and mov["intencoes"][0]["vencimento"] == "2032-05-15"
    telas = dp.ler_telas(FIX / "telas.xlsx")
    t = {(x["origem"], x["ticker"]): x for x in telas}
    assert t[("BTG", "TSTR11")]["taxa_emissao"] == 6.5                    # "IPCA + 6,5000%"
    assert t[("BTG", "TSTR21")]["taxa_emissao"] == 13.2                   # "13.2000%"
    assert t[("XP", "TSTR11")]["taxa_emissao"] == pytest.approx(6.5)     # fração 0,065
    assert t[("XP", "FERX99")]["indexador"] == "DI+"
    assert t[("BTG", "TSTR21")]["incentivada"] is False and t[("XP", "TSTR11")]["incentivada"] is True
    assert t[("BTG", "TSTR11")]["volume_emitido"] == 500_000_000 and t[("XP", "TSTR11")]["rating"] == "AAA Fitch"
    assert t[("BTG", "TSTR11")]["setor"] == "Transporte" and t[("XP", "TSTR11")]["setor"] is None


def test_numeros_e_taxas_em_texto():
    assert tx.numero("1.000") == 1000 and tx.numero("1.000.000") == 1_000_000 and tx.numero("5.408,11") == 5408.11
    assert tx.numero("1234.5") == 1234.5 and tx.numero(14713.2) == 14713.2 and tx.numero("-") is None
    assert tx.taxa_pct("13.7000%") == 13.7 and tx.taxa_pct("IPCA + 6,3170%") == 6.317
    assert tx.taxa_pct("1.067,00%") == 1067.0 and tx.taxa_pct("7,60%") == 7.6 and tx.taxa_pct("") is None


def test_horario_ilegivel_vira_data_vazia():
    assert dp._hora_btg("sem horário") == (None, None) and dp._hora_xp("31-10") == (None, None)
    assert dp._hora_btg("2026-10-02T02:30:00Z") == ("2026-10-01", "23:30")    # Brasília: ainda o dia anterior


def test_linha_sem_data_fica_fora_e_vai_para_curadoria():
    def ler(path):
        m = dp.ler_negocios(path)
        if m["negocios"]:
            m["negocios"].append({**m["negocios"][0], "data": None, "hora": None, "volume": 999.0})
        return m
    b = deb.montar(FIX, PUBLICO, EMISSORES, ler_negocios=ler)
    neg = b["secundario"]["negocios"]
    assert sum(r["n"] for r in neg["por_dia"]) == 7 and sum(r["volume"] for r in neg["por_dia"]) == 770_000
    assert b["pendencias"]["linhas_sem_data"] == [{"origem": "negócios BTG", "n": 1}]
    itens = [i for i in curadoria.itens({}, {"debentures": b}, {}, HOJE) if i["tipo"] == "linha_sem_data"]
    assert [i["item"] for i in itens] == ["negócios BTG"]


def test_abas_reconhecidas_pelo_cabecalho_e_nao_pelo_nome_do_arquivo(tmp_path):
    shutil.copy(FIX / "telas.xlsx", tmp_path / "qualquer nome.xlsx")
    assert dp.ler_negocios(tmp_path / "qualquer nome.xlsx") == {"negocios": [], "intencoes": []}
    assert len(dp.ler_telas(tmp_path / "qualquer nome.xlsx")) == 8
    assert dp.ler_telas(FIX / "negocios.xlsx") == []


# ---------- classificação ----------

def test_classificar_casa_grafias_por_nome_normalizado():
    real = deb.carregar_emissores(deb.EMISSORES)
    a = deb.classificar("ECORODOVIAS CONCESSOES E SERVICOS S/A", real)
    b = deb.classificar("ECORODOVIAS", real)
    assert a and a == b and a["subsetor"] == "rodovias" and a["grupo"] == "Ecorodovias"
    assert deb.classificar("Ecorodovias Concessões e Serviços S.A.", real) == a     # acento, caixa e S.A.
    assert deb.classificar("ECORODOVIAS INFRAESTRUTURA E LOGISTICA", real) is None   # não casa por pedaço
    assert deb.classificar("RUMO", real)["subsetor"] == "ferrovias"
    assert deb.classificar("RUMOS", real) is None
    assert deb.classificar("LOCALIZA RENT A CAR", real) is None                      # locadora: fora do universo
    fx = deb.carregar_emissores(EMISSORES)
    assert deb.classificar("TESTE RODOVIAS", fx) == {"nome": "Emissora Teste Rodovias", "subsetor": "rodovias",
                                                      "grupo": "Grupo Teste"}


def test_emissores_json_curado():
    dados = deb.carregar_emissores(deb.EMISSORES)
    assert set(dados) == {"nota", "emissores", "fora_do_universo"}
    vistos = {}
    for e in dados["emissores"]:
        assert set(e) == {"nome", "subsetor", "grupo", "nomes"}, e
        assert e["subsetor"] in deb.SUBSETORES, e
        assert e["nomes"], e
        for n in e["nomes"] + [e["nome"]]:
            k = tx.normalizar(n)
            assert vistos.get(k, e["nome"]) == e["nome"], f"grafia em dois emissores: {n}"
            vistos[k] = e["nome"]
    fora = {tx.normalizar(n) for n in dados["fora_do_universo"]}
    assert not fora & set(vistos), sorted(fora & set(vistos))
    # grupo de rodovia casa com o nome usado no ranking de grupos (data/roadshow/grupos_alias.json)
    grupos = {a["grupo"] for a in json.loads((ROOT / "data/roadshow/grupos_alias.json").read_text("utf-8"))["aliases"]}
    for e in dados["emissores"]:
        if e["subsetor"] == "rodovias" and e["grupo"]:
            assert e["grupo"] in grupos, e
    for nome in ("LOCALIZA RENT A CAR", "MOVIDA", "VAMOS", "SIMPAR", "UNIDAS", "ARMAC"):
        assert tx.normalizar(nome) in fora, nome


def test_emissor_sem_classificacao_vai_para_curadoria(bloco):
    pend = {p["nome"]: p for p in bloco["pendencias"]["emissores_sem_classificacao"]}
    assert set(pend) == {"CONCESSIONARIA NOVA SEM CADASTRO S.A.", "OUTRA EMPRESA NOVA"}
    assert pend["CONCESSIONARIA NOVA SEM CADASTRO S.A."]["origens"] == ["negócios BTG", "tela BTG"]
    assert pend["OUTRA EMPRESA NOVA"]["origens"] == ["intenções XP"]
    # fora do universo: não aparece em nenhum agregado nem nas emissões
    texto = json.dumps({k: v for k, v in bloco.items() if k != "pendencias"}, ensure_ascii=False)
    for n in ("NOVA11", "XYZW11", "NOVA SEM CADASTRO", "OUTRA EMPRESA", "ENRG11", "ENERGIA FICTICIA", "LOCA11", "LOCADORA"):
        assert n not in texto, n
    itens = curadoria.itens({}, {"debentures": bloco}, {}, HOJE)
    sem = [i for i in itens if i["tipo"] == "emissor_sem_classificacao"]
    assert [i["item"] for i in sem] == ["CONCESSIONARIA NOVA SEM CADASTRO S.A.", "OUTRA EMPRESA NOVA"]
    assert all("data/debentures/emissores.json" in i["motivo"] for i in sem)
    assert "Emissores de debêntures sem classificação" in curadoria.relatorio(HOJE, [], [], itens)


# ---------- spread ----------

def test_spread_interpola_entre_as_ntnb_vizinhas():
    curvas = anb.curvas(None, CURVAS)
    c1 = deb.curva_ntnb("2026-10-01", curvas)
    # só as NTN-B do arquivo da ANBIMA, pela taxa indicativa; a LTN e a NTN-F do arquivo ficam de fora
    assert c1 == [("2029-05-15", 5.8), ("2030-08-15", 6.0), ("2035-05-15", 6.5), ("2035-08-15", 6.55)]
    esperado = 7.0 - _ntnb("2032-05-15", [("2030-08-15", 6.0), ("2035-05-15", 6.5)])
    assert deb.spread(7.0, "2032-05-15", c1) == pytest.approx(esperado)
    assert deb.spread(6.0, "2030-08-15", c1) == pytest.approx(0.0)            # no vértice
    assert deb.spread(7.0, "2029-01-15", c1) is None                          # antes do primeiro vencimento
    assert deb.spread(7.0, "2040-05-15", c1) is None                          # além do último: não extrapola
    assert deb.spread(None, "2032-05-15", c1) is None


def test_spread_sem_curva_do_dia(bloco, tmp_path):
    curvas = anb.curvas(None, CURVAS)
    assert deb.curva_ntnb("2026-10-05", curvas) == []
    assert deb.spread(7.3, "2032-05-15", []) is None
    ult = {(u["ticker"], u["origem"]): u for u in bloco["secundario"]["ultimo_por_ticker"]}
    assert ult[("TSTR11", "negocio")]["data"] == "2026-10-05" and ult[("TSTR11", "negocio")]["spread"] is None
    assert bloco["pendencias"]["dias_sem_curva"] == ["2026-10-05"]
    dia = _por(bloco["secundario"]["negocios"]["por_dia"], "data")["2026-10-05"]
    assert dia["spread_medio"] is None and dia["volume_spread"] == 0 and dia["taxa_media"] == {"IPCA+": 7.3}
    # curva da ANBIMA ausente (nenhum arquivo baixado): spread "—" em tudo, aviso na curadoria, nenhum zero
    pub = tmp_path / "publico"
    shutil.copytree(PUBLICO, pub)
    shutil.rmtree(pub / anb.SUBPASTA)
    sem = deb.montar(FIX, pub, EMISSORES)
    sec = sem["secundario"]
    linhas = [r for grupo in ("negocios", "intencoes") for v in sec[grupo].values() for r in v]
    assert all(r["spread_medio"] is None and r["volume_spread"] == 0 for r in linhas)
    assert all(u["spread"] is None for u in sec["ultimo_por_ticker"])
    assert sem["macro"]["ntnb"] == []
    assert [s["serie"] for s in sem["pendencias"]["series_indisponiveis"]] == ["Taxa indicativa das NTN-B (ANBIMA)"]
    assert not any(f["url"] == anb.PAGINA for f in sem["fonte"])
    itens = curadoria.itens({}, {"debentures": sem}, {}, HOJE)
    assert any(i["tipo"] == "debentures_sem_serie" and "ANBIMA" in i["item"] for i in itens)


def test_pre_e_di_sem_spread(bloco):
    curva = deb.curva_ntnb("2026-10-02", anb.curvas(None, CURVAS))
    assert deb.spread(13.5, "2032-05-15", curva, "PRÉ") is None
    assert deb.spread(1.2, "2032-05-15", curva, "DI+") is None
    ult = {(u["ticker"], u["origem"]): u for u in bloco["secundario"]["ultimo_por_ticker"]}
    assert ult[("TSTR21", "negocio")]["spread"] is None and ult[("FERX99", "intencao")]["spread"] is None
    assert ult[("FERX11", "negocio")]["spread"] is None    # IPCA+ com vencimento além da última NTN-B


# ---------- agregados ----------

def test_agregados_batem_com_somas_manuais(bloco):
    curvas = anb.curvas(None, CURVAS)
    ntnb1 = _ntnb("2032-05-15", [("2030-08-15", 6.0), ("2035-05-15", 6.5)])
    ntnb2 = _ntnb("2032-05-15", [("2030-08-15", 6.1), ("2035-05-15", 6.4)])
    assert deb.curva_ntnb("2026-10-02", curvas)[1:3] == [("2030-08-15", 6.1), ("2035-05-15", 6.4)]
    neg = bloco["secundario"]["negocios"]
    dia = _por(neg["por_dia"], "data")
    assert list(dia) == ["2026-10-01", "2026-10-02", "2026-10-05"]
    d1, d2 = dia["2026-10-01"], dia["2026-10-02"]
    assert (d1["volume"], d1["n"]) == (400_000, 2)
    assert d1["taxa_media"] == {"IPCA+": pytest.approx((7.0 * 100 + 7.2 * 300) / 400, abs=1e-4)}
    assert d1["spread_medio"] == pytest.approx((7.0 - ntnb1) * 0.25 + (7.2 - ntnb1) * 0.75, abs=1e-4)
    assert d1["volume_spread"] == 400_000
    assert (d2["volume"], d2["n"]) == (350_000, 3)
    assert d2["taxa_media"] == {"IPCA+": pytest.approx((7.1 * 200 + 7.4 * 100) / 300, abs=1e-4), "PRÉ": 13.5}
    assert d2["volume_taxa"] == {"IPCA+": 300_000, "PRÉ": 50_000}
    assert d2["spread_medio"] == pytest.approx(7.1 - ntnb2, abs=1e-4) and d2["volume_spread"] == 200_000
    em = _por(neg["por_emissor"], "emissor")
    assert list(em) == ["Emissora Teste Rodovias", "Ferrovia Exemplo"]                   # maior volume primeiro
    assert (em["Emissora Teste Rodovias"]["volume"], em["Emissora Teste Rodovias"]["n"]) == (670_000, 6)
    assert em["Emissora Teste Rodovias"]["grupo"] == "Grupo Teste"
    assert em["Emissora Teste Rodovias"]["subsetor"] == "rodovias"
    assert _por(neg["por_subsetor"], "subsetor")["ferrovias"]["volume"] == 100_000
    assert sum(r["volume"] for r in neg["por_dia"]) == sum(r["volume"] for r in neg["por_emissor"]) == 770_000
    d5 = dia["2026-10-05"]   # linha de volume zero conta em n e fica fora da média (a taxa dela, 50, não pesa)
    assert (d5["n"], d5["volume"], d5["taxa_media"], d5["volume_taxa"]) == (2, 20_000, {"IPCA+": 7.3}, {"IPCA+": 20_000})
    it = bloco["secundario"]["intencoes"]
    dire = _por(it["por_direcao"], "direcao")
    assert list(dire) == ["compra", "venda"]
    assert (dire["compra"]["volume"], dire["compra"]["n"]) == (230_000, 2)
    assert (dire["venda"]["volume"], dire["venda"]["n"]) == (50_000, 1)
    i2 = _por(it["por_dia"], "data")["2026-10-02"]
    assert i2["por_direcao"] == {"compra": {"volume": 80_000, "n": 1}, "venda": {"volume": 50_000, "n": 1}}
    assert i2["taxa_media"] == {"IPCA+": 7.0, "DI+": 1.2}
    assert i2["spread_medio"] == pytest.approx(7.0 - ntnb2, abs=1e-4)
    assert bloco["secundario"]["periodo"] == {"de": "2026-10-01", "ate": "2026-10-05"}


def test_intencoes_nunca_entram_em_negocios(bloco):
    neg, it = bloco["secundario"]["negocios"], bloco["secundario"]["intencoes"]
    assert "FERX99" not in json.dumps(neg)                         # papel só com intenção
    assert sum(r["n"] for r in neg["por_dia"]) == 7                # 7 negócios do universo, nenhuma intenção
    assert sum(r["n"] for r in it["por_dia"]) == 3
    assert set(neg) == {"por_dia", "por_emissor", "por_subsetor"}
    assert set(it) == {"por_dia", "por_emissor", "por_subsetor", "por_direcao"}
    # formatos compatíveis: a opção "ver somado" soma linha com linha
    for grupo in ("por_dia", "por_emissor", "por_subsetor"):
        for a, b in ((neg[grupo][0], it[grupo][0]),):
            assert {"volume", "n", "taxa_media", "volume_taxa", "spread_medio", "volume_spread"} <= set(a) & set(b)


def test_bloco_so_tem_agregados_e_o_ultimo_de_cada_papel(bloco):
    sec = bloco["secundario"]
    assert set(sec) == {"periodo", "negocios", "intencoes", "ultimo_por_ticker"}
    ult = sec["ultimo_por_ticker"]
    chaves = [(u["ticker"], u["origem"]) for u in ult]
    assert len(chaves) == len(set(chaves))
    assert sorted(chaves) == [("FERX11", "negocio"), ("FERX99", "intencao"), ("TSTR11", "intencao"),
                              ("TSTR11", "negocio"), ("TSTR21", "negocio")]
    u = {(x["ticker"], x["origem"]): x for x in ult}
    assert (u[("TSTR11", "negocio")]["taxa"], u[("TSTR11", "negocio")]["hora"]) == (7.3, "17:00")   # não o de volume zero
    assert (u[("TSTR11", "intencao")]["direcao"], u[("TSTR11", "intencao")]["taxa"]) == ("venda", 7.0)
    texto = json.dumps(bloco, ensure_ascii=False)
    for horario in ("10:00", "16:30", "10:15"):        # horários de negócios e intenções que não são os últimos
        assert horario not in texto, horario
    for chave in ("agressor", "quantidade", "pu"):
        assert f'"{chave}"' not in texto, chave


def test_emissoes_recebem_data_e_coordenador(bloco):
    em = _por(bloco["emissoes"], "ticker")
    assert em["TSTR11"]["data_emissao"] == "2022-05-15"
    assert em["TSTR11"]["coordenador_lider"] == "BANCO TESTE DE INVESTIMENTO S/A"
    assert em["TSTR21"]["data_emissao"] == "2020-08-15" and em["TSTR21"]["incentivada"] is False
    assert em["FERX11"]["data_emissao"] == "2020-05-15" and em["FERX11"]["coordenador_lider"] is None
    assert em["FERX11"]["fontes"] == ["BTG", "SND"]
    assert all("coordenadores" not in e for e in bloco["emissoes"])
    # papel fora do cadastro: sem data nem coordenador, sem "SND" nas fontes, e na pendência
    assert em["FERX99"]["coordenador_lider"] is None and "SND" not in em["FERX99"]["fontes"]
    assert bloco["pendencias"]["emissoes_sem_snd"] == [{"ticker": "FERX99", "emissor": "Ferrovia Exemplo"}]


def test_incentivada_do_snd_vale_sobre_a_tela(tmp_path):
    """O cadastro é a fonte do incentivo fiscal: quando existe, vale sobre o que a tela da corretora diz."""
    linhas = SND.read_bytes().decode("latin-1").splitlines()
    k = linhas[4].split("\t").index("Deb. Incent. (Lei 12.431)")
    campos = linhas[6].split("\t")            # TSTR21: a tela BTG diz "N"
    assert campos[0].strip() == "TSTR21" and campos[k] == "N"
    campos[k] = "S"
    linhas[6] = "\t".join(campos)
    arq = tmp_path / "snd.txt"
    arq.write_bytes(("\r\n".join(linhas) + "\r\n").encode("latin-1"))
    b = deb.montar(FIX, PUBLICO, EMISSORES, hoje="2026-10-22", manifesto=_Manifesto(_downloads()), snd=arq)
    assert _por(b["emissoes"], "ticker")["TSTR21"]["incentivada"] is True


def test_sem_cadastro_snd_data_fica_nula():
    """Sem o arquivo do SND (a pasta pública de teste não o tem), as emissões ficam sem data e sem coordenador e há um
    item de curadoria por papel."""
    b = deb.montar(FIX, PUBLICO, EMISSORES, hoje="2026-10-22", manifesto=_Manifesto(_downloads()))
    assert b["emissoes"] and all(e["data_emissao"] is None and e["coordenador_lider"] is None for e in b["emissoes"])
    assert all("SND" not in e["fontes"] for e in b["emissoes"])
    assert not any(f["nome"].startswith("ANBIMA — cadastro") for f in b["fonte"])
    itens = [i for i in curadoria.itens({}, {"debentures": b}, {}, HOJE) if i["tipo"] == "emissao_sem_cadastro_snd"]
    assert [i["item"] for i in itens] == sorted(e["ticker"] for e in b["emissoes"])
    assert all("snd_caracteristicas.txt" in i["motivo"] and "--baixar" in i["motivo"] for i in itens)
    assert "Debêntures fora do cadastro do SND" in curadoria.relatorio(HOJE, [], [], itens)


def test_arquivo_do_snd_ilegivel_vale_como_ausente(tmp_path):
    ruim = tmp_path / "snd.txt"
    ruim.write_bytes(b"<html>erro</html>")
    b = deb.montar(FIX, PUBLICO, EMISSORES, hoje="2026-10-22", manifesto=_Manifesto(_downloads()), snd=ruim)
    assert all(e["data_emissao"] is None for e in b["emissoes"])
    assert len(b["pendencias"]["emissoes_sem_snd"]) == len(b["emissoes"])


def test_emissoes_e_macro(bloco):
    em = _por(bloco["emissoes"], "ticker")
    assert set(em) == {"TSTR11", "TSTR21", "FERX11", "FERX99"}
    t = em["TSTR11"]
    assert t == {"ticker": "TSTR11", "emissor": "Emissora Teste Rodovias", "subsetor": "rodovias", "grupo": "Grupo Teste",
                 "indexador": "IPCA+", "taxa_emissao": 6.5, "vencimento": "2032-05-15", "volume_emitido": 500_000_000,
                 "incentivada": True, "rating": "AAA Fitch", "data_emissao": "2022-05-15",
                 "coordenador_lider": "BANCO TESTE DE INVESTIMENTO S/A", "fontes": ["BTG", "XP", "SND"]}
    assert "coordenadores" not in t
    assert em["FERX99"]["fontes"] == ["XP"] and em["FERX99"]["data_emissao"] is None and em["FERX99"]["volume_emitido"] is None
    assert em["FERX99"]["indexador"] == "DI+" and em["FERX99"]["taxa_emissao"] == pytest.approx(1.2)
    assert em["TSTR21"]["rating"] is None and em["TSTR21"]["incentivada"] is False
    m = bloco["macro"]
    assert m["selic"] == {"valor": 14.25, "data": "2026-10-02"}
    assert m["cdi"]["data"] == "2026-10-02"
    assert m["cdi"]["valor"] == pytest.approx(((1 + 0.051 / 100) ** 252 - 1) * 100, abs=0.01)
    assert m["ipca12m"] == {"valor": 4.58, "data": "2026-09"}
    assert m["focus_ipca"] == {"valor": 4.51, "data": "2026-10-02"}
    assert [(n["vencimento"], n["taxa"], n["data"]) for n in m["ntnb"]] == [
        ("2029-05-15", 5.7, "2026-10-02"), ("2030-08-15", 6.1, "2026-10-02"), ("2035-05-15", 6.4, "2026-10-02"),
        ("2035-08-15", 6.45, "2026-10-02")]
    assert {n["titulo"] for n in m["ntnb"]} == {"NTN-B"}
    assert bloco["pendencias"]["series_indisponiveis"] == []


def test_selic_publicada_para_dias_futuros_vale_a_de_hoje(tmp_path):
    pub = tmp_path / "publico"
    shutil.copytree(PUBLICO, pub)
    serie = json.loads((pub / "sgs_432.json").read_text(encoding="utf-8"))
    (pub / "sgs_432.json").write_text(json.dumps(serie + [{"data": "05/11/2026", "valor": "13.00"}]), encoding="utf-8")
    m = deb.montar(FIX, pub, EMISSORES, hoje="2026-10-22")["macro"]
    assert m["selic"] == {"valor": 14.25, "data": "2026-10-02"}


def _pasta_com_planilhas(tmp_path):
    pasta = tmp_path / "entrada"
    pasta.mkdir()
    for nome in ("telas.xlsx", "negocios.xlsx"):
        shutil.copy(FIX / nome, pasta / nome)
    return pasta


def test_bloco_nao_depende_do_dia_do_build(tmp_path):
    """Mesmas entradas, builds em dias diferentes (com o manifesto gravado entre eles): bloco idêntico byte a byte; a data
    de acesso das planilhas é a do primeiro dia, e uma planilha nova leva a data do dia em que apareceu."""
    pasta = _pasta_com_planilhas(tmp_path)
    man = _Manifesto(_downloads())
    a = deb.montar(pasta, PUBLICO, EMISSORES, hoje="2026-10-22", manifesto=man, snd=SND)
    man.save()
    b = deb.montar(pasta, PUBLICO, EMISSORES, hoje="2026-12-01", manifesto=man, snd=SND)
    assert json.dumps(a, sort_keys=True) == json.dumps(b, sort_keys=True)
    btg = next(f for f in b["fonte"] if f["nome"].startswith("BTG"))
    assert btg["acesso"] == "2026-10-22"
    # a curva da ANBIMA: o acesso é o do primeiro dia em que o arquivo foi visto (guardado com o SHA-256)
    assert next(f for f in b["fonte"] if f["nome"].startswith("ANBIMA — Taxas indicativas"))["acesso"] == "2026-10-22"
    assert {i["acesso"] for i in man.items if "anbima_ms" in i.get("arquivo", "")} == {"2026-10-22"}
    # planilha alterada (outro conteúdo): data nova; a outra continua com a antiga
    shutil.copy(FIX / "negocios.xlsx", pasta / "negocios2.xlsx")
    wb = pasta / "negocios2.xlsx"
    wb.write_bytes(wb.read_bytes() + b"\0")
    c = deb.montar(pasta, PUBLICO, EMISSORES, hoje="2026-12-01", manifesto=man, snd=SND)
    datas = {i["arquivo"].rsplit("/", 1)[-1]: i["acesso"] for i in man.items if not i["url"]}
    assert datas == {"negocios.xlsx": "2026-10-22", "telas.xlsx": "2026-10-22", "negocios2.xlsx": "2026-12-01"}
    assert next(f for f in c["fonte"] if f["nome"].startswith("BTG"))["acesso"] == "2026-12-01"


def test_serie_publica_nao_vale_depois_do_download(tmp_path):
    """Selic meta com data futura no arquivo: vale até o dia do download registrado, qualquer que seja o "hoje"."""
    pub = tmp_path / "publico"
    shutil.copytree(PUBLICO, pub)
    serie = json.loads((pub / "sgs_432.json").read_text(encoding="utf-8"))
    (pub / "sgs_432.json").write_text(json.dumps(serie + [{"data": "05/11/2026", "valor": "13.00"}]), encoding="utf-8")
    url = deb.SGS.format(*deb.SERIES["selic"][:2])
    man = _Manifesto([{"url": url, "acesso": "2026-10-10", "baixado": "2026-10-22", "sha256": "x"}])
    for hoje in ("2026-10-22", "2026-11-10"):
        b = deb.montar(FIX, pub, EMISSORES, hoje=hoje, manifesto=man)
        assert b["macro"]["selic"] == {"valor": 14.25, "data": "2026-10-02"}
        sgs = next(f for f in b["fonte"] if f["nome"].startswith("Banco Central do Brasil — Sistema"))
        assert sgs["acesso"] == "2026-10-22"


def test_taxa_implausivel_sai_das_medias_e_vai_para_curadoria():
    """Leitor trocado (como faria a API interna): uma intenção com "1.067%" (erro de digitação) a mais."""
    def ler(path):
        m = deb.ler_negocios(path)
        if m["intencoes"]:
            m["intencoes"].append({**m["intencoes"][1], "taxa": 1067.0, "volume": 1000.0})
        return m
    b = deb.montar(FIX, PUBLICO, EMISSORES, ler_negocios=ler)
    d2 = _por(b["secundario"]["intencoes"]["por_dia"], "data")["2026-10-02"]
    assert (d2["n"], d2["volume"]) == (3, 131_000)
    assert d2["taxa_media"] == {"IPCA+": 7.0, "DI+": 1.2} and d2["volume_taxa"]["IPCA+"] == 50_000
    assert b["pendencias"]["taxas_descartadas"] == [{"ticker": "TSTR11", "origem": "intenções XP", "indexador": "IPCA+",
                                                     "taxa": 1067.0, "n": 1}]
    itens = [i for i in curadoria.itens({}, {"debentures": b}, {}, HOJE) if i["tipo"] == "taxa_fora_do_intervalo"]
    assert len(itens) == 1 and "1.067,00%" in itens[0]["motivo"]
    assert deb.plausivel(105.0, "% DI") and not deb.plausivel(105.0, "IPCA+") and deb.plausivel(None, "PRÉ")


def test_fontes_do_bloco(bloco):
    fontes = bloco["fonte"]
    assert len(fontes) == 6
    for f in fontes:
        assert set(f) == {"nome", "url", "periodo", "acesso", "licenca", "tipo", "nota"}, f
        assert f["url"].startswith("https://") and f["tipo"] == "medido"
    corretoras = [f for f in fontes if "fornecid" in f["nota"] or "enviad" in f["nota"]]
    assert len(corretoras) == 2
    btg, xp = corretoras
    # datas dos dados: tela BTG pela atualização do livro; a tela XP só traz a hora e usa a da BTG; negócios e intenções
    # pelo horário de cada linha; acesso = dia em que as planilhas foram vistas pela primeira vez (aqui, o "hoje" do teste)
    assert btg["periodo"] == "tela de 21/10/2026 a 22/10/2026; negócios de 01/10/2026 a 05/10/2026"
    assert xp["periodo"] == "tela de 21/10/2026 a 22/10/2026; intenções de 01/10/2026 a 03/10/2026"
    assert "traz só a hora" in xp["nota"] and "traz só a hora" not in xp["periodo"]
    assert btg["acesso"] == xp["acesso"] == "2026-10-22"
    cadastro = next(f for f in fontes if f["nome"] == "ANBIMA — cadastro de debêntures (SND)")
    assert cadastro["url"] == "https://www.debentures.com.br/" and cadastro["acesso"] == "2026-10-22"
    assert cadastro["periodo"] == "cadastro de 23/10/2026"       # dia em que o SND gerou o arquivo, não o do build
    assert "data de emissão" in cadastro["nota"] and "coordenador líder" in cadastro["nota"]
    curva = next(f for f in fontes if f["nome"].startswith("ANBIMA — Taxas indicativas"))
    assert curva["url"] == anb.PAGINA and curva["periodo"] == "01/10/2026 a 02/10/2026"
    assert "taxa indicativa da NTN-B interpolada pelo vencimento (não pela duration)" in curva["nota"]
    assert "Tesouro" not in json.dumps(fontes, ensure_ascii=False)


def test_datas_nao_dependem_da_data_do_arquivo(tmp_path, bloco):
    pasta = tmp_path / "entrada"
    pasta.mkdir()
    for nome in ("telas.xlsx", "negocios.xlsx"):
        shutil.copy(FIX / nome, pasta / nome)
        os.utime(pasta / nome, (0, 0))                 # 01/01/1970
    novo = deb.montar(pasta, PUBLICO, EMISSORES, hoje="2026-10-22", manifesto=_Manifesto(_downloads()), snd=SND)
    assert novo["fonte"] == bloco["fonte"]


_RESPOSTAS = {"sgs": '[{"data":"01/10/2026","valor":"14.25"}]',
              "focus": '{"value":[{"Data":"2026-10-02","Mediana":4.51}]}'}
_HTML = "<html><title>Requisição inválida!</title><body>A sua requisição foi rejeitada.</body></html>"


def test_baixar_sempre_renova_as_series_publicas(monkeypatch, tmp_path):
    chamadas = []

    def falso(url, dest, tries=5, force=False):
        chamadas.append((Path(dest).name.removesuffix(".novo"), force))       # baixa para um arquivo ao lado e só então troca
        Path(dest).parent.mkdir(parents=True, exist_ok=True)
        Path(dest).write_text(_RESPOSTAS["focus" if "olinda" in url else "sgs"], encoding="utf-8")
        return dest

    class Manif:
        def __init__(self, dominio):
            self.items = []

        def add(self, *a, **k):
            return {}

        def save(self):
            pass
    cadastro = []
    monkeypatch.setattr(deb, "_fetch", falso)
    monkeypatch.setattr(deb, "Manifest", Manif)
    curva = []
    monkeypatch.setattr(deb, "PUBLICO", tmp_path)
    monkeypatch.setattr(deb, "PASTA", tmp_path / "sem_planilhas")          # sem planilhas: só o último dia útil
    monkeypatch.setattr(anb, "fetch", lambda datas, pasta, **k: curva.append((set(datas), Path(pasta))) or {d: True for d in datas})
    monkeypatch.setattr(snd_mod, "fetch", lambda dest, manifesto=None: cadastro.append((Path(dest), manifesto)) or True)
    deb.fetch()                                         # sem force: o --baixar comum
    assert [c[0] for c in cadastro] == [tmp_path / "snd_caracteristicas.txt"]      # o cadastro do SND vem junto
    assert cadastro[0][1] is not None                                              # e é registrado no mesmo manifesto
    assert sorted(chamadas) == sorted([("sgs_432.json", True), ("sgs_12.json", True), ("sgs_13522.json", True),
                                       ("focus_ipca12m.json", True)])                  # o Tesouro não é mais baixado
    assert len(curva) == 1 and curva[0][1] == tmp_path / "anbima_ms"               # a curva da ANBIMA, só os dias que faltam
    assert curva[0][0] == {anb.ultimos_dias_uteis(dt.date.today(), 1)[0]}


def test_resposta_invalida_nao_substitui_o_arquivo_anterior(monkeypatch, tmp_path, capsys):
    """O Banco Central às vezes responde HTTP 200 com uma página de erro: o arquivo anterior fica, o aviso sai e a série
    que respondeu direito é trocada. Resposta de forma errada (JSON de outro formato) também não vale."""
    pub = tmp_path / "publico"
    pub.mkdir()
    for arq in ("sgs_432.json", "sgs_12.json", "sgs_13522.json"):
        (pub / arq).write_text('[{"data":"01/09/2026","valor":"1"}]', encoding="utf-8")
    (pub / "focus_ipca12m.json").write_text('{"value":[{"Data":"2026-09-01","Mediana":4.0}]}', encoding="utf-8")
    ruins = {"sgs_13522": _HTML, "sgs_12": '{"erro": "x"}', "focus": "[]"}

    def falso(url, dest, tries=5, force=False):
        chave = "focus" if "olinda" in url else f"sgs_{url.split('sgs.')[1].split('/')[0]}"
        Path(dest).write_text(ruins.get(chave, _RESPOSTAS["focus" if chave == "focus" else "sgs"]), encoding="utf-8")
        return dest

    class Manif:
        def __init__(self, dominio):
            self.items, self.adicionados = [], []

        def add(self, url, dest, *a, **k):
            self.adicionados.append(Path(dest).name)
            return {}

        def save(self):
            pass
    monkeypatch.setattr(deb, "_fetch", falso)
    monkeypatch.setattr(deb, "Manifest", Manif)
    monkeypatch.setattr(deb, "ESPERA_INVALIDA", ())
    monkeypatch.setattr(deb, "PUBLICO", pub)
    monkeypatch.setattr(deb, "PASTA", tmp_path / "sem_planilhas")
    monkeypatch.setattr(anb, "fetch", lambda datas, pasta, **k: {d: True for d in datas})
    monkeypatch.setattr(snd_mod, "fetch", lambda dest, manifesto=None: True)
    deb.fetch()
    assert json.loads((pub / "sgs_432.json").read_text(encoding="utf-8")) == [{"data": "01/10/2026", "valor": "14.25"}]   # trocado
    antigo = '[{"data":"01/09/2026","valor":"1"}]'
    assert (pub / "sgs_13522.json").read_text(encoding="utf-8") == antigo        # HTML: o anterior fica
    assert (pub / "sgs_12.json").read_text(encoding="utf-8") == antigo           # JSON de outra forma: idem
    assert "Mediana\":4.0" in (pub / "focus_ipca12m.json").read_text(encoding="utf-8")
    assert not list(pub.glob("*.novo"))                                          # nada de arquivo temporário
    erro = capsys.readouterr().err
    assert "sgs_13522.json" in erro and "sgs_12.json" in erro and "focus_ipca12m.json" in erro and "arquivo anterior ficou" in erro
    # a resposta rejeitada é pedida de novo: se a segunda vem boa, vale
    respostas = iter([_HTML, _RESPOSTAS["sgs"]])
    ruins.clear()
    monkeypatch.setattr(deb, "ESPERA_INVALIDA", (0,))
    monkeypatch.setattr(deb, "_fetch", lambda url, dest, tries=5, force=False: Path(dest).write_text(next(respostas), encoding="utf-8") or dest)
    deb._baixar_valido("https://x", pub / "sgs_12.json", 5, deb._valida_sgs, dormir=lambda _s: None)
    assert json.loads((pub / "sgs_12.json").read_text(encoding="utf-8"))[0]["valor"] == "14.25"


def test_curva_sem_o_cache_cru_vale_o_historico_versionado(tmp_path):
    """Apagado o cache da ANBIMA em data/raw/ (fora do git), o bloco é o mesmo, byte a byte: a curva de cada dia e os dias
    sem arquivo ficam no histórico versionado, e o manifesto guarda o dia em que cada arquivo foi visto."""
    pub = tmp_path / "publico"
    shutil.copytree(PUBLICO, pub)
    hist = tmp_path / "indices" / "curva_ntnb_anbima.json"
    man = _Manifesto(_downloads())
    anb._gravar_indice(pub / anb.SUBPASTA, {"2026-10-05": anb.SEM_ARQUIVO, "2026-09-30": anb.SEM_ARQUIVO})
    gravado = anb.atualizar_historico(pub / anb.SUBPASTA, hist)
    assert list(gravado) == ["2026-09-30", "2026-10-01", "2026-10-02"]           # o 05/10 vem depois da última curva: fica de fora
    assert gravado["2026-09-30"] == anb.SEM_ARQUIVO and gravado["2026-10-01"][0] == ("2029-05-15", 5.8)
    com = deb.montar(FIX, pub, EMISSORES, hoje="2026-10-22", manifesto=man, snd=SND, historico=hist)
    shutil.rmtree(pub / anb.SUBPASTA)                                             # data/raw/ perdido
    sem = deb.montar(FIX, pub, EMISSORES, hoje="2026-12-01", manifesto=man, snd=SND, historico=hist)
    assert json.dumps(com, sort_keys=True) == json.dumps(sem, sort_keys=True)
    assert com["macro"]["ntnb"] and sem["pendencias"]["series_indisponiveis"] == []
    nota = next(f for f in sem["fonte"] if f["nome"].startswith("ANBIMA — Taxas indicativas"))["nota"]
    assert ("A ANBIMA mantém online só os arquivos dos últimos dias; os spreads de dias anteriores ao primeiro download "
            "(01/10/2026) ficam sem curva.") in nota
    # sem cache e sem histórico: sem curva (spread "—"), como antes
    nada = deb.montar(FIX, pub, EMISSORES, hoje="2026-10-22", manifesto=_Manifesto(_downloads()), snd=SND)
    assert nada["macro"]["ntnb"] == []


def test_curadoria_nao_vai_para_o_html(tmp_path):
    if not BLOCO.exists():
        pytest.skip("data/intel/debentures.json ainda não gerado")
    assert "pendencias" in json.loads(BLOCO.read_text(encoding="utf-8"))     # o relatório de curadoria lê daqui
    out = tmp_path / "m.html"
    build.build_from_base(ROOT / "data" / "base", out)
    html = out.read_text(encoding="utf-8")
    marca = "window.INTEL="
    intel, _ = json.JSONDecoder().raw_decode(html, html.index(marca) + len(marca))
    assert "debentures" in intel and "pendencias" not in intel["debentures"]
    assert "taxas_descartadas" not in html and "emissores_sem_classificacao" not in html


def test_sem_planilhas_e_arquivo_ausente(tmp_path):
    assert deb.planilhas(tmp_path) == []
    (tmp_path / "~$aberta.xlsx").write_bytes(b"")      # arquivo temporário do Excel não conta
    assert deb.planilhas(tmp_path) == []
    with pytest.raises(FileNotFoundError):
        deb.montar(tmp_path, PUBLICO, EMISSORES)


# ---------- bloco gerado ----------

def test_bloco_gerado_estrutura():
    if not BLOCO.exists():
        pytest.skip("data/intel/debentures.json ainda não gerado")
    b = json.loads(BLOCO.read_text(encoding="utf-8"))
    assert set(b) == {"fonte", "tipo", "macro", "emissoes", "secundario", "pendencias"}
    assert set(b["secundario"]["negocios"]) == {"por_dia", "por_emissor", "por_subsetor"}
    assert b["emissoes"] and b["secundario"]["ultimo_por_ticker"]
    chaves = [(u["ticker"], u["origem"]) for u in b["secundario"]["ultimo_por_ticker"]]
    assert len(chaves) == len(set(chaves))
    assert all(e["subsetor"] in deb.SUBSETORES for e in b["emissoes"])


def test_bloco_confere_com_as_planilhas_do_usuario():
    """Spreads e volumes do bloco versionado conferidos contra as planilhas (só onde elas estão)."""
    if not deb.planilhas(deb.PASTA) or not BLOCO.exists():
        pytest.skip("planilhas do usuário ausentes em data/raw/debentures/")
    gravado = json.loads(BLOCO.read_text(encoding="utf-8"))
    novo = deb.montar()
    assert novo["secundario"] == gravado["secundario"], "dado mudou: rode python scripts/atualizar.py --dominios debentures"
    assert novo["emissoes"] == gravado["emissoes"]
    # volume e spread conferidos com uma conta direta sobre as linhas da planilha
    emis = deb.carregar_emissores(deb.EMISSORES)
    telas = [t for p in deb.planilhas(deb.PASTA) for t in deb.ler_telas(p)]
    nomes = {}
    for t in telas:
        nomes.setdefault(t["ticker"], []).append(t["emissor"])
    no_universo = lambda r: any(deb.classificar(n, emis) for n in [r["emissor"], *nomes.get(r["ticker"], [])])  # noqa: E731
    neg = [n for p in deb.planilhas(deb.PASTA) for n in deb.ler_negocios(p)["negocios"] if no_universo(n)]
    total = sum(r["volume"] for r in gravado["secundario"]["negocios"]["por_dia"])
    assert total == pytest.approx(sum(n["volume"] or 0 for n in neg), abs=0.05)
    assert sum(r["n"] for r in gravado["secundario"]["negocios"]["por_dia"]) == len(neg)
    curvas = anb.curvas(None, deb.PUBLICO / anb.SUBPASTA)
    ult = {u["ticker"]: u for u in gravado["secundario"]["ultimo_por_ticker"] if u["origem"] == "negocio"}
    for u in ult.values():
        esperado = deb.spread(u["taxa"], u["vencimento"], deb.curva_ntnb(u["data"], curvas), u["indexador"])
        assert u["spread"] == (None if esperado is None else round(esperado, 4)), u["ticker"]
