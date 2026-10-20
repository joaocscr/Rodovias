import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
from intel import rotas  # noqa: E402
from intel.snvbase import decode_line  # noqa: E402

JSON = ROOT / "data" / "intel" / "rotas.json"
MANIFEST = ROOT / "data" / "manifest" / "rotas.json"
NOMES = ["Ilha das Guianas", "Amazônica", "Quadrante Rondon", "Bioceânica de Capricórnio", "Bioceânica do Sul"]
TIPOS = {"rota", "hidrovia", "cabotagem", "pavimentacao", "estudo"}
# Caixa da América do Sul continental (lon mín, lat mín, lon máx, lat máx).
AS = (-82.0, -56.0, -34.0, 13.0)
# Nós que o traçado de cada rota precisa tocar (lon, lat), a até ~40 km da linha (o ajuste tem RMS de ~9 km).
NOS = {
    "r1": {"Boa Vista": (-60.67, 2.82), "Macapá": (-51.07, 0.03), "Georgetown": (-58.16, 6.80),
           "Oiapoque": (-51.83, 3.84)},
    "r2": {"Iquitos": (-73.25, -3.75), "Tabatinga": (-69.94, -4.25), "Pucallpa": (-74.55, -8.38),
           "Yurimaguas": (-76.09, -5.90), "Tumaco": (-78.79, 1.81)},
    "r3": {"Porto Velho": (-63.90, -8.76), "Rio Branco": (-67.81, -9.97), "Cuiabá": (-56.10, -15.60),
           "La Paz": (-68.15, -16.50), "Corumbá": (-57.65, -19.01)},
    "r4": {"Campo Grande": (-54.62, -20.47), "Assunção": (-57.58, -25.28), "Salta": (-65.41, -24.79),
           "Porto Murtinho": (-57.88, -21.70), "Foz do Iguaçu": (-54.59, -25.55)},
    "r5": {"Porto Alegre": (-51.23, -30.03), "Montevidéu": (-56.16, -34.90), "Santiago": (-70.65, -33.45),
           "Uruguaiana": (-57.09, -29.75), "Buenos Aires": (-58.38, -34.60)},
}


@pytest.fixture(scope="module")
def dados():
    return json.loads(JSON.read_text(encoding="utf-8"))


def _dentro(lon, lat):
    return AS[0] <= lon <= AS[2] and AS[1] <= lat <= AS[3]


def test_estrutura_e_fonte(dados):
    assert dados["tipo"] == "cadastro"
    assert dados["esquematico"] is True
    assert isinstance(dados["fonte"], list) and len(dados["fonte"]) >= 3
    for f in dados["fonte"]:
        for k in ("nome", "url", "periodo", "acesso", "licenca", "nota"):
            assert f.get(k), (f.get("nome"), k)
    urls = " ".join(f["url"] for f in dados["fonte"])
    assert "apresentacao-rotas-de-integracao-01-07-26" in urls
    assert "relatorio-2025-rotas-de-integracao-sul-americana" in urls
    assert "natural-earth" in urls
    assert "esquemático" in " ".join(f["nota"] for f in dados["fonte"])


def test_cinco_rotas_com_nomes_exatos(dados):
    rs = dados["rotas"]
    assert [r["id"] for r in rs] == ["r1", "r2", "r3", "r4", "r5"]
    assert [r["n"] for r in rs] == [1, 2, 3, 4, 5]
    assert [r["nome"] for r in rs] == NOMES


def test_cartao_de_cada_rota(dados):
    for r in dados["rotas"]:
        for k in ("paises", "ufs", "cidades", "rodovias", "hidrovias", "obras"):
            assert isinstance(r[k], list) and r[k] and all(isinstance(x, str) and x.strip() for x in r[k]), (r["id"], k)
        assert r["paises"][0] == "Brasil" and len(r["paises"]) >= 3, r["id"]
        assert all(len(u) == 2 and u.isupper() for u in r["ufs"]), r["id"]
        assert 80 <= len(r["descricao"]) <= 700, r["id"]
        assert r["fonte_url"].startswith("https://www.gov.br/planejamento/"), r["id"]
        assert r["fonte_ref"] and r["previsao"], r["id"]
        texto = json.dumps(r, ensure_ascii=False)
        for ruim in ("undefined", "NaN", "None", "null"):
            assert ruim not in texto, (r["id"], ruim)


def test_conteudo_fiel_aos_relatorios(dados):
    r = {x["id"]: x for x in dados["rotas"]}
    assert {"BR-174", "BR-156", "BR-401"} <= set(r["r1"]["rodovias"])
    assert "Guiana Francesa" in r["r1"]["paises"] and {"RR", "AP"} <= set(r["r1"]["ufs"])
    assert {"Colômbia", "Peru", "Equador"} <= set(r["r2"]["paises"]) and "Tabatinga" in r["r2"]["cidades"]
    assert {"BR-364", "BR-317", "BR-070", "BR-163"} <= set(r["r3"]["rodovias"])
    assert {"Peru", "Bolívia", "Chile"} <= set(r["r3"]["paises"])
    assert {"Porto Murtinho", "Foz do Iguaçu", "Dionísio Cerqueira", "Salta"} <= set(r["r4"]["cidades"])
    assert {"Paraguai", "Argentina", "Chile"} <= set(r["r4"]["paises"])
    assert any("BR-290" in x for x in r["r5"]["rodovias"]) and {"Uruguai", "Argentina", "Chile"} <= set(r["r5"]["paises"])
    assert any("Solimões" in o for o in r["r2"]["obras"])
    assert any("Porto Murtinho" in o for o in r["r4"]["obras"])


def test_linhas_tipos_e_rotas(dados):
    ids = {r["id"] for r in dados["rotas"]}
    tipos = set()
    for ln in dados["linhas"]:
        assert ln["tipo"] in TIPOS
        assert ln["rota"] is None or ln["rota"] in ids
        assert len(ln["p"]) >= 4 and len(ln["p"]) % 2 == 0
        tipos.add(ln["tipo"])
    assert tipos == TIPOS
    for i in ids:
        assert any(ln["rota"] == i and ln["tipo"] == "rota" for ln in dados["linhas"]), i
    # trechos em pavimentação e em estudos sempre ligados a uma rota
    assert all(ln["rota"] for ln in dados["linhas"] if ln["tipo"] in ("pavimentacao", "estudo"))


def test_coordenadas_na_america_do_sul(dados):
    for ln in dados["linhas"]:
        for lon, lat in decode_line(ln["p"]):
            assert _dentro(lon, lat), (ln["rota"], ln["tipo"], lon, lat)
    for p in dados["paises"]:
        assert _dentro(*p["label"]), p["nome"]
        for anel in p["p"]:
            pts = decode_line(anel)
            assert len(pts) >= 4 and pts[0] == pts[-1], p["nome"]
            for lon, lat in pts:
                assert _dentro(lon, lat), (p["nome"], lon, lat)


def test_paises(dados):
    ps = dados["paises"]
    assert len(ps) >= 12
    isos = [p["iso"] for p in ps]
    assert len(set(isos)) == len(isos)
    assert "BR" not in isos and "Brasil" not in [p["nome"] for p in ps]
    assert {"GF", "GY", "SR", "VE", "CO", "EC", "PE", "BO", "CL", "AR", "PY", "UY"} <= set(isos)
    nomes = {p["iso"]: p["nome"] for p in ps}
    assert nomes["GF"] == "Guiana Francesa" and nomes["BO"] == "Bolívia" and nomes["CO"] == "Colômbia"


def test_tracado_passa_pelos_nos(dados):
    from shapely.geometry import LineString, MultiLineString, Point

    for rid, nos in NOS.items():
        linhas = [LineString(decode_line(ln["p"])) for ln in dados["linhas"]
                  if ln["rota"] == rid and ln["tipo"] in ("rota", "hidrovia")]
        geo = MultiLineString(linhas)
        for nome, (lon, lat) in nos.items():
            d = geo.distance(Point(lon, lat))
            assert d <= 0.4, (rid, nome, round(d, 3))


def test_tamanho():
    assert JSON.stat().st_size <= 300 * 1024


def test_manifesto():
    itens = json.loads(MANIFEST.read_text(encoding="utf-8"))
    urls = {i["url"] for i in itens}
    for u in (rotas.URL_APRESENTACAO, rotas.URL_RELATORIO[2025], rotas.URL_RELATORIO[2024], rotas.URL_NE):
        assert u in urls, u
    for i in itens:
        assert i["sha256"] and i["bytes"] > 0 and i["acesso"]


def test_tipo_por_kind():
    assert rotas.TIPO_POR_KIND == {"rota": "rota", "hidrovia_overlay": "hidrovia", "cabotagem": "cabotagem",
                                   "trecho_brown": "pavimentacao", "trecho_gray": "estudo"}


def test_rota_mais_proxima():
    from shapely.geometry import LineString

    por_rota = {"r1": [LineString([(0, 0), (1, 0)])], "r2": [LineString([(0, 1), (1, 1)])]}
    assert rotas.rota_mais_proxima([(0, 0.1), (1, 0.2)], por_rota) == "r1"
    assert rotas.rota_mais_proxima([(0, 0.9), (1, 0.8)], por_rota) == "r2"


def test_eixo_de_faixa_preenchida():
    # traço de 1 pt com pontas redondas, convertido em contorno fechado (como no PDF) → eixo em y = 0,5
    import math

    cap_d = [(10 + 0.5 * math.sin(math.pi * k / 8), 0.5 - 0.5 * math.cos(math.pi * k / 8)) for k in range(9)]
    cap_e = [(0 - 0.5 * math.sin(math.pi * k / 8), 0.5 + 0.5 * math.cos(math.pi * k / 8)) for k in range(9)]
    anel = [(0, 0), (5, 0)] + cap_d + [(5, 1)] + cap_e
    eixo = rotas._eixo(anel)
    assert len(eixo) >= 10
    assert all(abs(y - 0.5) < 0.05 for _, y in eixo)
    assert sorted([round(eixo[0][0], 1), round(eixo[-1][0], 1)]) == [-0.5, 10.5]
