import json
import struct
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
from intel import multimodal  # noqa: E402
from intel.snvbase import decode_line  # noqa: E402

MM = ROOT / "data" / "intel" / "multimodal.json"
RAW = ROOT / "data" / "raw" / "graos"
CAMPOS_FONTE = {"nome", "url", "periodo", "acesso", "licenca", "nota"}
BBOX_BR = (-74.5, -34.5, -28.0, 5.5)


def _no_brasil(lon, lat):
    return BBOX_BR[0] <= lon <= BBOX_BR[2] and BBOX_BR[1] <= lat <= BBOX_BR[3]


@pytest.fixture(scope="module")
def mm():
    return json.loads(MM.read_text(encoding="utf-8"))


# ---------- funções puras ----------

def test_parse_grau():
    assert multimodal.parse_grau("-23.011943°") == -23.011943
    assert multimodal.parse_grau(" -48.69333300000001° ") == pytest.approx(-48.693333)
    assert multimodal.parse_grau("-4,27389") == -4.27389
    assert multimodal.parse_grau("") is None


def test_parse_milhar():
    assert multimodal.parse_milhar("81.059") == 81059
    assert multimodal.parse_milhar("16.578.555") == 16578555
    assert multimodal.parse_milhar("512") == 512


def test_norm_nome():
    assert multimodal.norm_nome("Rondonópolis") == multimodal.norm_nome("RONDONOPOLIS ") == "rondonopolis"
    assert multimodal.norm_nome("Ponta da Madeira - (MA)") == "pontadamadeira"


def test_split_uf():
    assert multimodal.split_uf("SORRISO (MT)") == ("SORRISO", "MT")
    assert multimodal.split_uf("Ponta da Madeira - (MA)") == ("Ponta da Madeira", "MA")


def test_gpkg_geom():
    # Cabeçalho GPKG (envelope xy, 32 bytes) + WKB LineString de 2 pontos.
    wkb = struct.pack("<BII4d", 1, 2, 2, -44.3, -2.5, -47.8, -8.1)
    blob = b"GP\x00\x03" + struct.pack("<i", 4674) + struct.pack("<4d", -47.8, -44.3, -8.1, -2.5) + wkb
    g = multimodal.gpkg_geom(blob)
    assert list(g.coords) == [(-44.3, -2.5), (-47.8, -8.1)]


# ---------- multimodal.json ----------

def test_fonte(mm):
    assert isinstance(mm["fonte"], list) and len(mm["fonte"]) >= 5
    assert all(CAMPOS_FONTE <= set(f) for f in mm["fonte"])


def test_ferrovias(mm):
    fe = mm["ferrovias"]
    assert len(fe) >= 200
    assert all(f["sit"] == "Em Operação" for f in fe)
    assert all({"p", "sit", "sigla", "nome"} <= set(f) for f in fe)
    for f in fe:
        pts = decode_line(f["p"])
        assert len(pts) >= 2 and all(_no_brasil(*p) for p in pts)
    assert len(json.dumps(fe, ensure_ascii=False, separators=(",", ":")).encode()) <= 400_000
    assert MM.stat().st_size <= 450_000


def test_portos(mm):
    po = mm["portos"]
    assert len(po) >= 1000
    assert all({"nome", "tipo", "uf", "lat", "lon"} <= set(p) for p in po)
    assert all(_no_brasil(p["lon"], p["lat"]) for p in po)
    assert all(len(p["uf"]) == 2 for p in po)
    etc_miri = [p for p in po if p["tipo"] == "Estação de transbordo de cargas"
                and abs(p["lat"] - -4.27) < 0.05 and abs(p["lon"] - -55.945) < 0.05]
    assert len(etc_miri) >= 4
    assert any("Cargill" in p["nome"] for p in etc_miri)
    assert any("Hidrovias do Brasil" in p["nome"] for p in etc_miri)
    # todo ponto em terra dentro (ou a menos de 200 km, no mar) da UF do registro; o que não estava foi para o município do
    # cadastro. As bacias sedimentares ("Plataforma Marítima", fora da camada do mapa) ficam no mar, longe da costa.
    ufs = multimodal._ufs_geo()
    from shapely.geometry import Point
    longe = [p["nome"] for p in po if p["tipo"] != "Plataforma Marítima"
             and ufs[p["uf"]].distance(Point(p["lon"], p["lat"])) * 111 > multimodal.PORTO_MAX_KM_UF]
    assert longe == []
    # ponto aproximado = centro de um município da própria UF (regra de ponto_porto); Keppel Fels (Niterói, com o ponto
    # do shape da ANTAQ em Corumbá) está entre eles
    _, m = multimodal._municipios()
    centros_uf = {(round(c[0], 5), round(c[1], 5), u) for c, u in zip(m["centro"], m["uf"])}
    aprox = [p for p in po if p.get("aprox")]
    assert all(p["aprox"] is True for p in aprox)
    for p in aprox:
        assert (p["lon"], p["lat"], p["uf"]) in centros_uf, p
    assert any(p["nome"] == "Keppel Fels" and p["uf"] == "RJ" for p in aprox)


def test_siade(mm):
    s = mm["siade"]
    assert all(r["t"] >= 50_000 for r in s)
    assert {r["prod"] for r in s} <= {"Soja", "Milho", "Farelo de soja", "Açúcar", "Fertilizantes"}
    soja = sum(r["t"] for r in s if r["prod"] == "Soja")
    assert soja >= 35e6
    assert sum(1 for r in s if r["lo"] and r["ld"]) / len(s) > 0.95
    for r in s:
        for k in ("lo", "ld"):
            if r[k]:
                assert _no_brasil(*r[k])
    top = max(s, key=lambda r: r["t"])
    assert (top["o"], top["uo"], top["ud"], top["prod"]) == ("Rondonópolis", "MT", "SP", "Soja")


def test_exportacao(mm):
    ex = mm["exportacao"]
    assert ex["ano"] == 2025 and ex["campos"] == ["sh4", "uf", "urf", "via", "kg"]
    assert set(ex["sh4"]) == {"1201", "1005", "2304", "1701", "4703", "5201", "0201", "0202", "0207", "0901", "1001",
                              "1507"}
    soja = sum(r[4] for r in ex["linhas"] if r[0] == "1201")
    assert 105e9 <= soja <= 110e9
    assert all(isinstance(r[4], int) for r in ex["linhas"])
    santos = sum(r[4] for r in ex["linhas"] if r[0] == "1201" and "SANTOS" in r[2])
    assert 33e9 < santos < 36e9


def test_distancia_reta():
    # Sorriso (MT) → Santos (SP): ~1.500 km em linha reta; mesmo ponto = 0.
    assert multimodal.distancia_reta([-55.71, -12.55], [-46.33, -23.96]) == pytest.approx(1597, rel=0.02)
    assert multimodal.distancia_reta([-50.0, -15.0], [-50.0, -15.0]) == 0


def test_km_suspeito_regra():
    """Suspeito: km < 0,9 × linha reta, km > 3 × linha reta, ou origem = destino; sem km ou sem reta não julga."""
    assert multimodal.km_suspeito(100, 100) is False
    assert multimodal.km_suspeito(90, 100) is False       # limite inferior incluso
    assert multimodal.km_suspeito(89, 100) is True
    assert multimodal.km_suspeito(300, 100) is False      # limite superior incluso
    assert multimodal.km_suspeito(301, 100) is True
    assert multimodal.km_suspeito(240, 844) is True       # Chapadão do Sul → Paranaguá (fonte com km 4× menor)
    assert multimodal.km_suspeito(50, 0, mesma=True) is True
    assert multimodal.km_suspeito(None, 100) is False
    assert multimodal.km_suspeito(100, None) is False


def test_nome_colado():
    mun = {("ribeiraopreto", "SP"): 1, ("santos", "SP"): 1, ("sorriso", "MT"): 1}
    assert multimodal.nome_colado("ribeiraopretosantos", "SP", mun) is True
    assert multimodal.nome_colado("santos", "SP", mun) is False          # município de verdade
    assert multimodal.nome_colado("ribeiraopretosorriso", "SP", mun) is False  # UF diferente
    assert multimodal.nome_colado("miritituba", "PA", mun) is False


def test_rota_frete_separa_nome_colado_e_corrige_uf_trocada():
    mun, _ = multimodal._municipios()
    # Boletim CONAB set/2026, p. 26: "RIBEIRÃO PRETO SANTOS (SP) 410 175,00 200,00 192,50" — a origem (sem "(SP)") veio
    # colada ao destino; a linha não é de Presidente Prudente (origem do bloco anterior).
    assert multimodal.rota_frete("PRESIDENTE PRUDENTE (SP)", "RIBEIRÃO PRETO SANTOS (SP)", "aprox", mun) == \
        ("Ribeirão Preto (SP)", "Santos (SP)", "ok")
    # p. 9: "RIO VERDE (RO) - PLATAFORMA FERROVIÁRIA" sob a origem RIO VERDE (GO): não há Rio Verde em RO; vale a UF da origem.
    assert multimodal.rota_frete("RIO VERDE (GO)", "RIO VERDE (RO) - PLATAFORMA FERROVIÁRIA", "ok", mun) == \
        ("RIO VERDE (GO)", "RIO VERDE (GO) - PLATAFORMA FERROVIÁRIA", "ok")
    # rotas comuns ficam como estão (inclusive destino de mesmo nome em outra UF que existe lá)
    for o, d in (("SORRISO (MT)", "SANTOS (SP)"), ("BOM JESUS (PI)", "SÃO LUÍS (MA)"), ("RIO VERDE (GO)", "SANTOS (SP)")):
        assert multimodal.rota_frete(o, d, "ok", mun) == (o, d, "ok")
    assert multimodal.rota_frete("X (PI)", "TERESINA (PI)", "aprox", mun) == ("X (PI)", "TERESINA (PI)", "aprox")


def test_ponto_porto_fora_da_uf_vai_para_o_municipio_do_cadastro():
    _, m = multimodal._municipios()
    ufs, centros = multimodal._ufs_geo(), multimodal._centros(m)
    # ANTAQ, instalações portuárias 06/05/2025, BRRJ002 "Keppel Fels": sem latitude/longitude em texto e o ponto do shape
    # em Corumbá (MS); o próprio cadastro diz Rua Barão de Jaceguai, Ponta d'Areia, CEP 24040-000, município 3303302
    # (Niterói, RJ).
    assert multimodal.ponto_porto(-57.621397, -18.998937, "RJ", "3303302", ufs, centros) == (*centros["3303302"], True)
    assert centros["3303302"] == [-43.0547, -22.9151]
    # ponto na UF, ou no mar perto da costa (plataforma a 73 km), fica como está
    assert multimodal.ponto_porto(-44.247, -23.0, "RJ", "3300100", ufs, centros) == (-44.247, -23.0, False)
    assert multimodal.ponto_porto(-40.343, -22.162, "RJ", "3301009", ufs, centros) == (-40.343, -22.162, False)
    # UF desconhecida: não há com o que comparar
    assert multimodal.ponto_porto(-57.62, -19.0, None, "3303302", ufs, centros) == (-57.62, -19.0, False)
    # fora da UF e sem município no cadastro: sem ponto (fica fora do mapa)
    assert multimodal.ponto_porto(-57.62, -19.0, "RJ", "", ufs, centros) == (None, None, False)


def test_qualidade_frete():
    assert multimodal.qualidade_frete("ok", False) == "ok"
    assert multimodal.qualidade_frete("aprox", False) == "aprox"
    assert multimodal.qualidade_frete("ok", True) == "km_suspeito"
    assert multimodal.qualidade_frete("aprox", True) == "aprox+km_suspeito"


def test_fretes(mm):
    fr = mm["fretes"]
    assert fr["mes"] == "ago/2026"
    assert fr["campos"] == ["origem", "uf_o", "destino", "uf_d", "km", "rs_t", "qualidade"]
    ok = [r for r in fr["linhas"] if r[4] and r[5] is not None]
    assert len(ok) >= 100
    assert all(r[6] in ("ok", "aprox", "km_suspeito", "aprox+km_suspeito") for r in fr["linhas"])
    sorriso_santos = [r for r in fr["linhas"] if r[0] == "Sorriso" and r[2] == "Santos"]
    assert sorriso_santos and sorriso_santos[0][4] == 1961 and sorriso_santos[0][5] == 490.0
    assert sorriso_santos[0][6] == "ok"
    # MS: as 17 rotas para os portos (PR, SP, RS) têm km 4 a 5 vezes menor que a distância real na fonte.
    ms = [r for r in fr["linhas"] if r[1] == "MS" and r[3] in ("PR", "SP", "RS")]
    assert len(ms) == 17 and all(r[6] == "km_suspeito" for r in ms)
    # destino no mesmo município da origem (ex.: plataforma ferroviária de Rio Verde): mesma UF (a UF trocada do boletim
    # é corrigida) e distância suspeita (origem = destino)
    base = lambda n: multimodal.norm_nome(n.split(" - ")[0])
    mesmo = [r for r in fr["linhas"] if base(r[0]) == base(r[2])]
    assert mesmo and all(r[1] == r[3] and "km_suspeito" in r[6] for r in mesmo)
    # nenhum nome de origem ou destino é a junção de dois municípios da UF (artefato de células mescladas)
    mun, _ = multimodal._municipios()
    for r in fr["linhas"]:
        for nome, uf in ((r[0], r[1]), (r[2], r[3])):
            assert not multimodal.nome_colado(base(nome), uf, mun), (nome, uf)

    # Só a qualidade muda: km e R$/t continuam os da fonte.
    assert sum(1 for r in fr["linhas"] if "km_suspeito" in r[6]) == 25


@pytest.mark.skipif(not multimodal.FRETES_CSV.exists(), reason="sem o CSV de fretes extraído do boletim")
def test_fretes_nome_colado_vira_origem_e_destino(mm):
    """Cada linha do boletim cujo destino é a junção de dois municípios (origem sem "(UF)" colada, ex.: "RIBEIRÃO PRETO
    SANTOS (SP)") sai como origem = 1º município, destino = 2º, com o km e o R$/t da linha e a origem como conferida."""
    import csv
    mun, _ = multimodal._municipios()
    linhas = {tuple(r[:6]): r[6] for r in mm["fretes"]["linhas"]}
    with open(multimodal.FRETES_CSV, encoding="utf-8", newline="") as f:
        colados = [r for r in csv.DictReader(f) if (lambda n, u: u and multimodal.nome_colado(
            multimodal.norm_nome(n.split(" - ")[0]), u, mun))(*multimodal.split_uf(r["destino"]))]
    assert colados  # o boletim de set/2026 tem ao menos um (Ribeirão Preto → Santos)
    for r in colados:
        o, d, atrib = multimodal.rota_frete(r["origem"], r["destino"], r["atribuicao_origem"], mun)
        (no, uo), (nd, ud) = multimodal.split_uf(o), multimodal.split_uf(d)
        chave = (no, uo, nd, ud, int(r["km"]), multimodal._num_br(r["rs_t_mes3"]))
        assert atrib == "ok" and chave in linhas and not linhas[chave].startswith("aprox"), chave


@pytest.mark.skipif(not RAW.exists(), reason="sem data/raw/graos")
def test_manifesto_multimodal():
    m = json.loads((ROOT / "data" / "manifest" / "multimodal.json").read_text(encoding="utf-8"))
    assert all(i["url"].startswith("http") and i["sha256"] for i in m)
    assert any(i["url"].endswith("BaseFerro.zip/@@download/file") for i in m)
