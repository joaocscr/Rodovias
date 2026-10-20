import json
import re
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
from intel import estaduais  # noqa: E402
from intel.snvbase import decode_line  # noqa: E402

JSON = ROOT / "data" / "intel" / "estaduais.json"
MANIFEST = ROOT / "data" / "manifest" / "estaduais.json"
RAW = ROOT / "data" / "raw" / "estaduais"
UFS = {"AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI",
       "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"}
CAMPOS = ["uf", "via", "sre", "sup", "km_i", "km_f", "ext"]
QUALIDADES = {"ok", "aproximado", "nao_mapeado"}
METODOS = {"kmz", "sre", "snv", "rod_km", "rod"}


@pytest.fixture(scope="module")
def dados():
    return json.loads(JSON.read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def ents(dados):
    return dados["entidades"]


# ---------------- funções puras ----------------

def test_qualidade_regra():
    q = estaduais.qualidade
    assert q(612.8, 600.35, False) == "ok"            # 2%
    assert q(108.0, 100.0, False) == "ok"             # 8 km
    assert q(30.0, 21.0, False) == "ok"               # 9 km < 10 km, apesar de 43%
    assert q(130.0, 100.0, False) == "aproximado"     # 30%
    assert q(150.0, 100.0, False) == "nao_mapeado"    # 50%
    assert q(150.0, 100.0, True) == "aproximado"      # rodovia inteira: no máximo aproximado
    assert q(101.0, 100.0, True) == "aproximado"
    assert q(0, 100.0, False) == "nao_mapeado"
    assert q(None, 100.0, False) == "nao_mapeado"
    assert q(50.0, None, False) == "nao_mapeado"


def test_parse_trechos_artesp():
    p = estaduais.parse_trecho_artesp
    assert p("SP 147 - Rodovias Deputado Laércio Corte - Do km 41,36 ao km 60,7 / Do km 62,450 ao km 106,32") == \
        [("SP-147", 41.36, 60.7), ("SP-147", 62.45, 106.32)]
    assert p("SP 330 - Rodovia Anhanguera - Do km 11 ao km 158.") == [("SP-330", 11.0, 158.0)]
    assert p("SPA 376/300 – Acesso Avaí - Do km 0 ao km 4,26") == [("SPA-376/300", 0.0, 4.26)]
    assert p("SP 257- Rodovia Deputado Aldo Lupo - Do km 0 e 19,500") == [("SP-257", 0.0, 19.5)]
    assert p("SPI 117/060 - Via de Interligação com a BR 116 - Do km 0, ao km 4,700.") == [("SPI-117/060", 0.0, 4.7)]
    assert p("SP-326 - Rodovia Brigadeiro Faria Lima (entre o município de Bebedouro e Barretos);") == []


def test_via_e_sre():
    assert estaduais.via_de("SP", "330", "330ESP0010") == "SP-330"
    assert estaduais.via_de("MG", "", "050EMG0010") == "MG-050"
    assert estaduais.via_de("RS", "87", "") == "RS-087"
    assert estaduais.e_federal({"codigo_snv": "287BRS0090", "codigo_sre": "", "jurisdicao": "Estadual"})
    assert estaduais.e_federal({"codigo_snv": "", "codigo_sre": "", "jurisdicao": "Federal"})
    assert not estaduais.e_federal({"codigo_snv": "287RSC0035", "codigo_sre": "287RSC0035", "jurisdicao": "Estadual"})


def test_corredor_conta_pistas_paralelas_uma_vez():
    from shapely.geometry import LineString
    a = LineString([(0, 0), (10000, 0)])
    b = LineString([(0, 30), (10000, 30)])            # pista paralela a 30 m
    c = LineString([(0, 5000), (4000, 5000)])         # outra via, longe
    km, keep = estaduais.corredor([a, b, c])
    assert abs(km - 14.0) < 0.2
    assert sorted(keep) == [0, 2]


# ---------------- contrato do JSON ----------------

def test_estrutura_e_fontes(dados):
    assert dados["tipo"] == "cadastro"
    fontes = dados["fonte"]
    assert isinstance(fontes, list) and len(fontes) >= 4
    for f in fontes:
        for k in ("nome", "url", "periodo", "acesso", "licenca", "nota"):
            assert f.get(k), (f.get("nome"), k)
        assert re.fullmatch(r"\d{4}-\d{2}-\d{2}", f["acesso"])
    urls = " ".join(f["url"] for f in fontes)
    for pedaco in ("Hosted/Rodovias_Estaduais", "artesp", "agergs", "melhoresrodovias"):
        assert pedaco in urls, pedaco


def test_manifesto():
    itens = json.loads(MANIFEST.read_text(encoding="utf-8"))
    assert itens and all(i["sha256"] and i["url"].startswith("http") for i in itens)


def test_tamanho_maximo():
    assert JSON.stat().st_size <= 3.2e6, JSON.stat().st_size


def test_malha_linhas_e_p(dados):
    m = dados["malha"]
    assert m["base"] == "Infra S.A. Hosted/Rodovias_Estaduais (cide2021)"
    assert m["campos"][:7] == CAMPOS
    assert len(m["linhas"]) == len(m["p"])
    assert len(m["linhas"]) >= 15000
    for row in m["linhas"]:
        assert len(row) == len(m["campos"])


def test_malha_geometria_no_brasil(dados):
    for p in dados["malha"]["p"]:
        pts = decode_line(p)
        assert len(pts) >= 2
        for x, y in pts:
            assert -75 < x < -28 and -35 < y < 6


def test_nenhuma_feicao_federal(dados):
    m = dados["malha"]
    i_sre, i_via = m["campos"].index("sre"), m["campos"].index("via")
    for row in m["linhas"]:
        sre = row[i_sre] or ""
        assert not (len(sre) >= 4 and sre[3] == "B"), sre
        assert not (row[i_via] or "").startswith("BR"), row


def test_campos_texto_e_superficie(dados):
    m = dados["malha"]
    c = {k: m["campos"].index(k) for k in CAMPOS}
    for row in m["linhas"]:
        assert row[c["uf"]] in UFS
        assert len(row[c["sre"]] or "") <= 10
        assert row[c["ext"]] is not None and row[c["ext"]] >= 0
        for k in ("km_i", "km_f"):
            assert row[c[k]] is None or isinstance(row[c[k]], (int, float))
    sups = {row[c["sup"]] for row in m["linhas"]}
    assert {"PAV", "DUP"} <= sups


def test_ufs_cobertas_e_registradas(dados):
    m = dados["malha"]
    i_uf = m["campos"].index("uf")
    presentes = {row[i_uf] for row in m["linhas"]}
    sem = set(m["ufs_sem_malha"])
    assert presentes | sem == UFS
    assert not presentes & sem
    assert len(sem) <= 7, sem


def test_entidades_basico(ents):
    assert len(ents) >= 45
    ids = [e["id"] for e in ents]
    assert len(ids) == len(set(ids))
    for e in ents:
        assert e["esfera"] == "estadual"
        assert e["qualidade"] in QUALIDADES, e["id"]
        assert e["estado"] in ("vigente", "encerrado"), e["id"]
        assert e["fonte_url"].startswith("http"), e["id"]
        assert e["uf"] in UFS
        assert e["geo_metodo"] is None or e["geo_metodo"] in METODOS, e["id"]
        if e["qualidade"] != "ok":
            assert e.get("nota"), e["id"]


def test_entidades_excluidas(ents):
    nomes = " ".join(e["nome"].lower() for e in ents)
    assert "via liberdade" not in nomes and "binacional" not in nomes
    assert not [e for e in ents if e["uf"] == "PR"]
    ids = {e["id"] for e in ents}
    assert "sp-artesp-mota-engil" not in ids          # ficha ARTESP vazia (sem contrato identificável)
    assert "mt-lote6-rodovia-multimodal" not in ids   # leiloado, sem contrato: vai para o pipeline


def test_vigente_tem_evidencia(ents):
    for e in ents:
        if e["estado"] == "vigente":
            assert e.get("assinatura") or e.get("inicio") or e.get("contrato"), e["id"]


def test_datas_coerentes(ents):
    for e in ents:
        assert "fim_estimado" not in e
        a, i = e.get("assinatura"), e.get("inicio")
        if a and i:
            k = min(len(a), len(i))
            assert a[:k] <= i[:k], e["id"]
        for k in ("assinatura", "inicio", "fim"):
            assert e.get(k) is None or re.fullmatch(r"\d{4}-\d{2}(-\d{2})?", e[k]), (e["id"], k)
    por = {e["id"]: e for e in ents}
    assert por["rj-rota-116"]["fim"] is None                     # sem data de fim na fonte: nada estimado
    assert por["ba-cln"]["assinatura"] is None and "descartada" in por["ba-cln"]["nota"]
    assert por["pe-rota-dos-coqueiros"]["assinatura"] == "2006-12-28"
    assert por["sp-lt32-novo-litoral"]["assinatura"] is None
    assert por["sp-lt37-rota-mogiana"]["assinatura"] == "2026-08-27"
    assert por["sp-lt37-rota-mogiana"]["grupo"] == "Azevedo & Travassos + Quimassa"
    assert [por[f"mg-epr-{x}"]["lote"] for x in ("triangulo", "sul-de-minas", "vias-do-cafe")] == ["1", "2", "3"]
    assert por["mg-epr-triangulo"]["assinatura"] == por["mg-epr-sul-de-minas"]["assinatura"] == "2022-11-16"


def test_notas_sem_jargao(ents):
    for e in ents:
        for termo in ("entFis", "entEst", "entGeo", "km_map", "físicos"):
            assert termo not in (e.get("nota") or ""), (e["id"], termo)


def test_regra_de_datas():
    f = estaduais.datas_coerentes
    # assinatura depois do início: a que não confere com o fim cai
    assert f("2010-08-17", "2000-03-20", "2050-03-20", 50)[:3] == (None, "2000-03-20", "2050-03-20")
    # fim que não confere com assinatura + prazo cai
    assert f("1996-12-23", "1997-01-13", "2047-01-12", 40)[:3] == ("1996-12-23", "1997-01-13", None)
    # início oficial (ARTESP) nunca cai
    assert f("2024-10-03", "2024-06", None, 30, ini_oficial=True)[:2] == (None, "2024-06")
    assert f("2022-11-16", "2023-03-24", "2052-11-11", 30) == ("2022-11-16", "2023-03-24", "2052-11-11", [])


def test_paralelos_validos(dados, ents):
    n_lin = len(dados["malha"]["linhas"])
    for k in ("entEst", "entFis", "entGeo"):
        assert len(dados[k]) == len(ents), k
    for est in dados["entEst"]:
        assert all(isinstance(i, int) and 0 <= i < n_lin for i in est)
    for fis in dados["entFis"]:
        assert all(isinstance(j, int) and 0 <= j < 6815 for j in fis)
    for geo in dados["entGeo"]:
        for p in geo:
            assert len(decode_line(p)) >= 2


def test_sp_25_com_geometria(dados, ents):
    sp = [(i, e) for i, e in enumerate(ents) if e["uf"] == "SP"]
    assert len(sp) >= 25
    assert next(e for _, e in sp if e["id"] == "sp-lt03-tebe")["estado"] == "encerrado"
    for i, e in sp:
        if e["qualidade"] != "nao_mapeado":
            assert dados["entGeo"][i] or dados["entEst"][i], e["id"]
    kmz = [e for _, e in sp if e["geo_metodo"] == "kmz"]
    assert len(kmz) >= 20


def test_rs_rota_de_santa_maria(dados, ents):
    i, e = next((i, e) for i, e in enumerate(ents) if e["id"] == "rs-rota-de-santa-maria")
    assert e["qualidade"] == "ok"
    assert abs(e["km_map"] - 204.5) <= 2
    assert dados["entFis"][i] or dados["entEst"][i]
    assert e["trechos"] == [{"rod": "RSC-287", "km_i": 28.03, "km_f": 232.54}]
    assert e["regulador"] == "AGERGS" and e["km_decl"] == 204.51   # AGERGS, não a ABCR


def test_qualidade_coerente(ents):
    for e in ents:
        if e["km_map"] and e["km_decl"]:
            esperado = estaduais.qualidade(e["km_map"], e["km_decl"], e.get("recorte") == "rodovia")
            assert e["qualidade"] == esperado, e["id"]


def test_entidades_esperadas(ents):
    ids = {e["id"] for e in ents}
    for i in ("sp-lt31-ecovias-noroeste", "sp-lt37-rota-mogiana", "sp-lt19-viarondon", "rs-caminhos-da-serra-gaucha",
              "mg-epr-triangulo", "mg-via-nascentes", "ms-way-112", "ms-way-306", "pi-transcerrados",
              "pe-rota-dos-coqueiros", "rj-via-lagos", "pa-conquista-do-para", "mt-via-brasil-mt100"):
        assert i in ids, i
    pi = next(e for e in ents if e["id"] == "pi-transcerrados")
    assert pi["qualidade"] == "nao_mapeado" and pi["nota"]
    noro = next(e for e in ents if e["id"] == "sp-lt31-ecovias-noroeste")
    assert noro["regulador"] == "ARTESP" and noro["lote"] == "31" and noro["grupo"] == "EcoRodovias"
    assert noro["capex_bi"] == 11.3 and noro["km_decl"] == 600.35
    assert noro["assinatura"] is None or not noro["assinatura"].startswith("2008")  # erro conhecido da ABCR
    assert noro["trechos"][0] == {"rod": "SP-310", "km_i": 227.8, "km_f": 454.3}


# ---------------- brutos (só onde existem) ----------------

@pytest.mark.skipif(not RAW.exists(), reason="sem data/raw/estaduais")
def test_ficha_artesp_autoban():
    f = estaduais.parse_ficha_artesp(RAW / "artesp" / "fichas" / "autoban.html")
    assert f["km"] == 319.8 and f["capex_bi"] == 14.3
    assert ("SP-348", 13.0, 173.0) in f["trechos"]


@pytest.mark.skipif(not RAW.exists(), reason="sem data/raw/estaduais")
def test_kmz_tracado_rodoanel_oeste():
    linhas = estaduais.kmz_linhas(RAW / "artesp" / "dl" / "l24.kmz")
    assert linhas and all(len(l) >= 2 for l in linhas)
