import json
import re
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
from intel import antt  # noqa: E402

OUT = ROOT / "data" / "intel" / "antt.json"
RAW = ROOT / "data" / "raw" / "antt"
N_CAD = 277  # registros do cadastro de praças (versão 6/2026)


@pytest.fixture(scope="module")
def A():
    return json.loads(OUT.read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def ENT():
    conc = json.loads((ROOT / "data" / "base" / "conc.json").read_text(encoding="utf-8"))
    return {e["id"] for e in conc["entidades"]}


def rows(block):
    return [dict(zip(block["campos"], r)) for r in block["linhas"]]


# ---------------- unidades puras ----------------

def test_norm_e_namemap():
    assert antt.norm(" Ecovias  Minas Goiás ") == "ECOVIAS MINAS GOIAS"
    assert antt.ent_of("ECO050") == antt.ent_of("ECOVIAS MINAS GOIÁS") == antt.ent_of("MGO") == "ecovias-minas-goias"
    assert antt.ent_of("AUTOPISTA FERNÃO DIAS") == antt.ent_of("MOTIVA MINAS SP") == "fernao-dias"
    assert antt.ent_of("MSVIA/PANTANAL") == "motiva-pantanal"
    assert antt.ent_of("VIA 040") is None and antt.ent_of("xyz") is None


def test_namemap_so_aponta_para_entidades_existentes(ENT):
    assert set(antt.NAMEMAP.values()) <= ENT
    for slug, (own, suc) in antt.ENCERRADAS.items():
        assert own not in ENT and set(suc) <= ENT
    assert set(antt.CAPA_ENT.values()) <= ENT


def test_iso_data_e_extensao():
    assert antt.iso_date("12/03/2014") == "2014-03-12"
    assert antt.iso_date("2 9/12/2008") == "2008-12-29"
    assert antt.iso_date("﻿04/11/2025") == "2025-11-04"
    assert antt.iso_date("29 de setembro de 2021") == "2021-09-29"
    assert antt.iso_date("8 de Outubro de 2021") == "2021-10-08"
    assert antt.iso_date("21/set") == "21/set"
    assert antt.iso_date("") is None and antt.iso_date(None) is None
    assert antt.km_of("1.001,20 km") == 1001.2
    assert antt.km_of("850,90 Km") == 850.9
    assert antt.km_of("569,10Km") == 569.1
    assert antt.km_of("502 Km") == 502.0


def test_vmd_2025_zero_vira_null():
    """Praça cujo VMD de 2025 arredonda para 0 (menos de 1 veículo/dia) não tem VMD 0: não é contagem de tráfego, então
    VMD, leves, pesados, motos e meses ficam null. Caso real: Free Flow Candeias - P01 (NOVA 364), só nov/2025, com
    9 veículos no mês (VMD 0,3)."""
    assert antt.vmd_2025(9.0, 0.0, 0.0, 30, 1) == (None, None, None, None, None)
    assert antt.vmd_2025(0.0, 0.0, 0.0, 31, 1) == (None, None, None, None, None)
    assert antt.vmd_2025(10.0, 3.0, 2.0, 30, 1) == (None, None, None, None, None)  # 0,5/dia arredonda para 0 também
    assert antt.vmd_2025(3100.0, 310.0, 620.0, 31, 1) == (130, 100, 20, 10, 1)
    assert antt.vmd_2025(0.0, 0.0, 0.0, 0, 0) == (None, None, None, None, None)
    v = antt.vmd_2025(36500.0, 0.0, 0.0, 365, 12)
    assert v == (100, 100, 0, 0, 12)


def test_sat_periodo():
    a25 = [f"2025-{m:02d}" for m in range(1, 7)]
    assert antt.sat_periodo(set(a25)) == ("2025", a25)
    rm = [f"2025-{m:02d}" for m in range(9, 13)] + ["2026-01", "2026-02"]
    assert antt.sat_periodo(set(rm) | {"2025-03"}) == ("2025-09/2026-08", rm)
    assert antt.sat_periodo({"2025-01", "2025-02"}) is None


def test_snap_ponto():
    from intel.snvbase import snv
    S = snv()
    # BR-050 em Uberlândia, a 9 m do físico: casa na mesma BR; com outra BR existente, não casa
    assert antt.snap_ponto(S, -48.20879, -18.8787, "BR-050") is not None
    assert antt.snap_ponto(S, -48.20879, -18.8787, "BR-116") is None
    # acesso da Ponte Rio–Niterói e BR inexistente no SNV ("BR-038"): qualquer físico a ≤ 100 m
    assert antt.snap_ponto(S, -43.11377, -22.88007, "ACESSON02") == antt.snap_ponto(S, -43.11377, -22.88007, None)
    assert antt.snap_ponto(S, -43.11377, -22.88007, "ACESSON02") is not None
    assert antt.snap_ponto(S, -48.20879, -18.8787, "BR-038") is not None
    # longe de tudo (Atlântico): nada
    assert antt.snap_ponto(S, -40.0, -25.0, "ACESSO") is None
    assert antt.snap_ponto(S, None, None, "BR-050") is None


def test_rodovia_e_pfe():
    assert antt.split_rod("BR-386/RS") == ("BR-386", "RS")
    assert antt.split_rod("BR-40") == ("BR-040", None)
    assert antt.split_rod("PR-151") == ("PR-151", "PR")
    assert antt.split_rod("PR-PR-408") == ("PR-408", "PR")
    # acessos, alças e contornos: texto da fonte limpo (espaços preservados, caixa de frase, códigos intactos)
    assert antt.split_rod("ACESSO PARA SP-278") == ("Acesso para SP-278", None)
    assert antt.split_rod("Acesso para SP-278") == ("Acesso para SP-278", None)
    assert antt.split_rod("SAÍDA PARA BR-153") == ("Saída para BR-153", None)
    assert antt.split_rod("ALÇA DE ENTRADA DA BR-040") == ("Alça de Entrada da BR-040", None)
    assert antt.split_rod("ACESSO PORTO NOVO") == ("Acesso Porto Novo", None)
    assert antt.split_rod("CONTORNO DE FLORIANÓPOLIS") == ("Contorno de Florianópolis", None)
    assert antt.split_rod("Acesso  R1A ") == ("Acesso R1A", None)
    assert antt.split_rod("ACESSO N01") == ("Acesso N01", None)
    assert antt.split_rod("Acesso R 1 A") == ("Acesso R1A", None)
    assert antt.split_rod("Acesso N 01") == ("Acesso N01", None)
    assert antt.split_rod("Acesso km 71") == ("Acesso km 71", None)
    assert antt.split_rod("") == (None, None)
    assert antt.pfe_key("Free Flow PFE004 - PFS003 Sul") == "PFE004"
    assert antt.pfe_key("Free Flow PPF001 Sul - PFS002 Sul") == "PPF001"
    assert antt.pfe_key("Free Flow Itaguaí") is None


# ---------------- bloco gerado ----------------

def test_fontes_e_tamanho(A):
    assert OUT.stat().st_size <= 450_000  # vale para kB e KiB
    assert isinstance(A["fonte"], list) and len(A["fonte"]) >= 5
    for f in A["fonte"]:
        assert {"nome", "url", "periodo", "acesso", "licenca", "nota"} <= set(f)
        assert len(f["acesso"]) == 10 and f["url"].startswith("https://")


def test_pracas(A, ENT):
    P = A["pracas"]
    assert P["tipo"] == "medido"
    assert P["campos"] == ["nome", "ent", "conc", "br", "uf", "km", "lat", "lon", "fis", "vmd", "leves", "pesados",
                           "moto", "eixos", "receita", "meses"]
    L = rows(P)
    # cada linha representa 1+ registros do cadastro (os pares free flow da RIOSP viram um pórtico de entrada)
    assert sum(P["n_cadastro"]) == N_CAD and len(P["n_cadastro"]) == len(L)
    com_fis = sum(n for n, r in zip(P["n_cadastro"], L) if r["fis"] is not None)
    com_vmd = sum(n for n, r in zip(P["n_cadastro"], L) if r["vmd"] is not None)
    assert com_fis >= 250, com_fis
    assert com_vmd >= 220, com_vmd
    assert all(r["fis"] is None or 0 <= r["fis"] < 6815 for r in L)
    assert all(r["ent"] is None or r["ent"] in ENT for r in L)
    assert sum(r["ent"] is not None for r in L) >= 0.95 * len(L)
    riosp = [r for r in L if r["ent"] == "rio-sp" and "PF" in r["nome"]]
    assert riosp and all("pórtico de entrada" in r["nome"] for r in riosp)
    assert not any(" - PFS" in r["nome"] for r in L)
    for r in L:
        if r["vmd"] is not None:
            assert r["vmd"] == pytest.approx(r["leves"] + r["pesados"] + r["moto"], abs=2)
            assert 1 <= r["meses"] <= 12
            assert r["vmd"] >= 1, (r["nome"], r["vmd"])  # VMD 0 não é contagem: fica null
        else:
            assert r["leves"] is r["pesados"] is r["moto"] is r["meses"] is None, r["nome"]
        assert r["eixos"] is None or 2 <= r["eixos"] <= 20
        assert r["receita"] is None or isinstance(r["receita"], int)
    assert sum(r["receita"] is not None for r in L) >= 150
    meses = P["serie_meses"]
    assert meses[0] == "2024-01" and meses[-1] == "2026-08" and len(meses) == 32
    assert len(P["serie_l"]) == len(P["serie_p"]) == len(L)
    assert all(len(s) == 32 for s in P["serie_l"] + P["serie_p"])
    assert all(v is None or (isinstance(v, int) and v >= 0) for s in P["serie_l"] + P["serie_p"] for v in s)


def test_rotulos_de_rodovia_limpos(A):
    """Rodovias de praças, SATs e obras: código (BR-101, PR-151, número das estaduais do PR) ou texto legível, nunca
    palavras coladas da fonte ('ACESSOPARASP-278') nem prefixo repetido ('PR-PR-408')."""
    for bloco in ("pracas", "sats", "obras"):
        for r in rows(A[bloco]):
            br = r["br"]
            if br is None:
                continue
            assert not re.search(r"[A-ZÀ-Ú]{12,}", br), (bloco, br)
            assert not re.match(r"([A-Z]{2})-\1-", br), (bloco, br)
            assert br == " ".join(br.split()), (bloco, br)
    textos = {r["br"] for b in ("pracas", "sats") for r in rows(A[b])}
    assert {"Acesso para SP-278", "Saída para BR-153"} <= textos


def test_praca_conhecida(A):
    L = rows(A["pracas"])
    p = next(r for r in L if r["ent"] == "ecovias-ponte")
    assert 70000 <= p["vmd"] <= 90000 and p["br"] == "BR-101" and p["uf"] == "RJ"


def test_sats(A, ENT):
    S = A["sats"]
    assert S["tipo"] == "medido" and S["ano"] == 2025
    assert S["campos"] == ["id", "conc", "ent", "br", "uf", "lat", "lon", "fis", "vmd", "pes", "moto", "meses",
                           "periodo"]
    L = rows(S)
    # base 2025; SAT com < 6 meses em 2025 usa os últimos 12 meses publicados (2025-09..2026-08)
    assert {r["periodo"] for r in L} <= {"2025", "2025-09/2026-08"}
    assert sum(r["periodo"] == "2025" for r in L) >= 280
    ok = [r for r in L if r["fis"] is not None and 0 <= r["pes"] <= 1]
    # com o filtro de ≥ 6 meses só 310 SATs têm 2025 utilizável; com a janela de reserva 469 passam nos filtros;
    # 443 casam a ≤ 500 m na mesma BR e os acessos/alças (rodovia fora do SNV) casam a ≤ 100 m de qualquer físico
    assert len(ok) >= 450, len(ok)
    assert all(r["meses"] >= 6 and r["vmd"] >= 100 and 0 <= r["moto"] <= 1 for r in L)
    assert all(r["ent"] is None or r["ent"] in ENT for r in L)
    assert len({(r["ent"] or r["conc"], r["id"]) for r in L}) == len(L)


def test_capas(A, ENT):
    C = A["capas"]
    ativas = {k: v for k, v in C.items() if v["situacao"] == "ativa"}
    enc = {k: v for k, v in C.items() if v["situacao"] == "encerrada"}
    assert len(ativas) == 36 and set(ativas) <= ENT
    assert len(enc) == 10
    for k, v in enc.items():
        assert k not in ENT and v["sucessor"] in ENT
    campos = {"nome", "situacao", "sucessor", "controladora", "trecho", "extensao_km", "assinatura", "inicio", "prazo",
              "edital", "cobranca", "database", "url"}
    assert all(campos <= set(v) for v in C.values())
    ro = C["nova-rota-do-oeste"]
    assert ro["assinatura"] == "2014-03-12" and ro["extensao_km"] == 850.9 and ro["database"] == "21/set"
    assert ro["cobranca"] == "2015-09-06"
    assert C["ecovias-araguaia"]["assinatura"] == "2021-09-29"
    assert all(v["url"].startswith("https://www.gov.br/antt/") for v in C.values())


def test_series(A, ENT):
    S = A["series"]
    assert len(S) >= 30
    for k, v in S.items():
        assert v["anos"] == list(range(2010, 2026))
        for c in ("receita", "investimento", "custo"):
            assert len(v[c]) == 16 and all(x is None or isinstance(x, int) for x in v[c])
        if k in ENT:
            assert v.get("sucessor") is None
        else:
            assert v["sucessor"] in ENT
    assert S["nova-rota-do-oeste"]["receita"][2016 - 2010] is not None  # CRO, cobrança desde 2015
    assert S["via-040"]["sucessor"] in ENT


def test_obras(A, ENT):
    O = A["obras"]
    assert O["tipo"] == "medido"
    assert O["campos"] == ["ent", "descricao", "tipo", "br", "uf", "km_i", "km_f", "fis", "ano", "previsto",
                           "executado", "lat", "lon"]
    L = rows(O)
    assert sum(r["fis"] is not None for r in L) >= 900
    assert all(r["ent"] is None or r["ent"] in ENT for r in L)
    assert all(r["descricao"] is None or len(r["descricao"]) <= 64 for r in L)
    for r in L:
        for c in ("previsto", "executado"):
            assert r[c] is None or 0 <= r[c] <= 1
        if r["fis"] is not None:
            assert r["lat"] is not None and -34 < r["lat"] < 6 and -74 < r["lon"] < -34
        assert 2020 <= r["ano"] <= 2027


@pytest.mark.skipif(not RAW.exists(), reason="sem data/raw/antt")
def test_manifesto_registra_brutos_existentes():
    m = json.loads((ROOT / "data" / "manifest" / "antt.json").read_text(encoding="utf-8"))
    arqs = {i["arquivo"] for i in m}
    assert "data/raw/antt/praca/dados-dos-pracas-de-pedagio6_2026.csv" in arqs
    assert "data/raw/antt/capas/lista.html" in arqs
    assert all(i["url"].startswith("https://") and i["sha256"] for i in m)
