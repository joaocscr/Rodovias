import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
from intel import carga  # noqa: E402
from intel.snvbase import snv  # noqa: E402

JSON = ROOT / "data" / "intel" / "carga.json"
MANIFEST = ROOT / "data" / "manifest" / "carga.json"
CHAVES = ("gsa", "total", "veic", "dist_m")


@pytest.fixture(scope="module")
def dados():
    return json.loads(JSON.read_text(encoding="utf-8"))


def test_estrutura_e_fonte(dados):
    assert dados["tipo"] == "modelado"
    assert dados["ano_base"] == 2017
    assert dados["cenario"] == "PNL 2035 base"
    fonte = dados["fonte"]
    fontes = fonte if isinstance(fonte, list) else [fonte]
    for f in fontes:
        for k in ("nome", "url", "periodo", "acesso", "licenca", "nota"):
            assert f.get(k), k
    nota = " ".join(f["nota"] for f in fontes)
    assert "TO_" in nota and "PNL 2035" in nota and "2017" in nota
    assert any("Cenario-base-PNL00M2017" in f["url"] for f in fontes)


def test_6815_posicoes_na_ordem_do_snv(dados):
    s = snv()
    assert s.n == 6815
    for k in CHAVES:
        assert len(dados[k]) == 6815, k


def test_valores_inteiros_ou_null(dados):
    for k in CHAVES:
        for v in dados[k]:
            assert v is None or (isinstance(v, int) and not isinstance(v, bool) and v >= 0), (k, v)


def test_nulos_coerentes(dados):
    # gsa, total, veic e dist_m ficam nulos juntos: sem casamento (> 100 m) ou PLA.
    for j in range(6815):
        nulos = {dados[k][j] is None for k in CHAVES}
        assert len(nulos) == 1, j


def test_pavimentado_com_gsa(dados):
    s = snv()
    km_pav = km_ok = 0.0
    for j in range(s.n):
        if s.pavimentado(j):
            km_pav += s.ext(j)
            if dados["gsa"][j] is not None:
                km_ok += s.ext(j)
    assert km_ok / km_pav >= 0.95


def test_pla_sempre_null(dados):
    s = snv()
    pla = [j for j in range(s.n) if s.main_trecho(j)["superficie"] == "PLA"]
    assert pla
    for j in pla:
        for k in CHAVES:
            assert dados[k][j] is None, (j, k)


def test_maior_gsa_em_polo_graneleiro(dados):
    s = snv()
    j = max((j for j in range(s.n) if dados["gsa"][j] is not None), key=lambda j: dados["gsa"][j])
    assert dados["gsa"][j] > 1_000_000
    assert s.main_trecho(j)["uf"] in {"MT", "GO", "MS", "PR"}


def test_distancia_ate_100m_onde_ha_valor(dados):
    n = 0
    for j in range(6815):
        if dados["gsa"][j] is not None:
            n += 1
            assert dados["dist_m"][j] <= carga.MAX_M
    assert n > 4000


def test_total_maior_ou_igual_gsa(dados):
    # Total inclui GSA (mediana de links distintos pode divergir; confere só a ordem de grandeza global).
    pares = [(g, t) for g, t in zip(dados["gsa"], dados["total"]) if g is not None]
    assert sum(t for _, t in pares) >= sum(g for g, _ in pares)


def test_json_compacto(dados):
    txt = JSON.read_text(encoding="utf-8")
    assert txt == json.dumps(dados, ensure_ascii=False, separators=(",", ":"))
    assert JSON.stat().st_size < 200_000


def test_veic_por_dia_coerente_com_toneladas(dados):
    # total (t/ano) ÷ (veic/dia × 365) = t por veículo de carga: ordem de 20–45 t na mediana.
    r = sorted(t / (v * 365) for t, v in zip(dados["total"], dados["veic"]) if t and v)
    assert 20 <= r[len(r) // 2] <= 45
    assert max(v for v in dados["veic"] if v is not None) < 30_000


def test_manifesto_registra_o_zip():
    itens = json.loads(MANIFEST.read_text(encoding="utf-8"))
    assert any(i["url"] == carga.URL and i["sha256"] and i["bytes"] > 0 for i in itens)
    assert carga.URL == "https://ontl.infrasa.gov.br/wp-content/uploads/2024/05/Cenario-base-PNL00M2017.zip"


def test_mediana_de_tres():
    assert carga.mediana_int([1.0, 5.0, 3.0]) == 3
    assert carga.mediana_int([10.0, 20.0, 30.4]) == 20


RAW_ZIP = ROOT / "data" / "raw" / "graos" / "multimodal" / "pnl2035_cenario_base.zip"
RAW_SHP = list((ROOT / "data" / "raw" / "graos" / "multimodal" / "x_pnl2035_cenario_base").glob("*/PNL00M2017.shp"))


@pytest.mark.skipif(not (RAW_SHP or RAW_ZIP.exists()), reason="brutos do PNL ausentes (data/raw/)")
def test_casamento_reproduz_json_em_poucos_fisicos(dados):
    s = snv()
    links = carga.load_links(carga.find_shp())
    # Os 3 de maior gsa, um PLA e um físico qualquer pavimentado.
    topo = sorted((j for j in range(s.n) if dados["gsa"][j] is not None), key=lambda j: -dados["gsa"][j])[:3]
    pla = next(j for j in range(s.n) if s.main_trecho(j)["superficie"] == "PLA")
    pav = next(j for j in range(s.n) if s.pavimentado(j) and dados["gsa"][j] is not None)
    for j in topo + [pav]:
        r = carga.match_fis(links, s, j)
        assert r["dist_m"] <= carga.MAX_M
        assert (r["gsa"], r["total"], r["veic"], r["dist_m"]) == tuple(dados[k][j] for k in CHAVES), j
    assert carga.match_fis(links, s, pla)["dist_m"] is not None  # a distância existe; o build anula PLA
