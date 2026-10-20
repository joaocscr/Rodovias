import json
import statistics
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
from intel import trafego  # noqa: E402
from intel.snvbase import snv  # noqa: E402

OUT = ROOT / "data" / "intel" / "trafego.json"
RAW = ROOT / "data" / "raw" / "trafego"
N = 6815
OCORR = 73202 + 72529
MORTOS = 6163 + 6043


@pytest.fixture(scope="module")
def d():
    return json.loads(OUT.read_text(encoding="utf-8"))


# ---------- funções puras (sem brutos) ----------
def test_media_ponderada_pelo_comprimento_da_sobreposicao():
    segs = [{"ki": 0, "kf": 10, "L": 1000, "P": 100}, {"ki": 10, "kf": 30, "L": 4000, "P": 400}]
    L, P = trafego.media_ponderada(segs, 0, 20)  # 10 km a 1000 e 10 km a 4000
    assert (L, P) == (2500, 250)
    assert trafego.media_ponderada(segs, 40, 50) is None  # sem sobreposição


def test_prf_num_aceita_virgula_decimal():
    assert trafego.prf_num("146,1") == 146.1
    assert trafego.prf_num("NA") is None


# ---------- contrato do JSON ----------
def test_arrays_com_6815_posicoes(d):
    assert snv().n == N
    for k in ("l", "p"):
        assert len(d["vmda"][k]) == N
    for k in ("n", "m", "fg", "fl"):
        assert len(d["acidentes"][k]) == N


def test_vmda_cobertura_e_mediana_em_pavimentados(d):
    s = snv()
    l, p = d["vmda"]["l"], d["vmda"]["p"]
    assert all((a is None) == (b is None) for a, b in zip(l, p))  # null junto
    pav = [j for j in range(N) if s.pavimentado(j)]
    km = sum(s.ext(j) for j in pav)
    km_ok = sum(s.ext(j) for j in pav if l[j] is not None)
    assert km_ok / km >= 0.85
    assert any(v is None for v in l)  # null fora da cobertura (não 0)
    tot = [l[j] + p[j] for j in pav if l[j] is not None]
    assert 1500 <= statistics.median(tot) <= 6000
    assert all(isinstance(v, int) and v >= 0 for v in l if v is not None)


def test_vmda_metadados(d):
    v = d["vmda"]
    assert v["tipo"] == "modelado" and v["ano"] == 2023 and v["base_snv"] == "202401A"


def test_acidentes_somas(d):
    a = d["acidentes"]
    assert a["tipo"] == "medido" and a["anos"] == [2024, 2025]
    assert sum(a["n"]) >= 0.98 * OCORR
    assert sum(a["n"]) <= OCORR
    assert sum(a["m"]) >= 0.98 * MORTOS
    assert sum(a["m"]) <= MORTOS
    for k in ("n", "m", "fg", "fl"):
        assert all(isinstance(v, int) and v >= 0 for v in a[k])  # zero é dado, nunca null


def test_abcr_120_meses_ate_2026_09(d):
    b = d["abcr"]
    assert len(b["meses"]) == 120
    assert b["meses"][0] == "2016-10" and b["meses"][-1] == "2026-09"
    assert b["meses"] == sorted(set(b["meses"]))
    for k in ("leves", "pesados", "total"):
        assert len(b[k]) == 120
        assert all(isinstance(v, float) and round(v, 1) == v for v in b[k])
    assert b["leves"][-1] == 168.6 and b["pesados"][-1] == 185.8 and b["total"][-1] == 172.0


def test_fonte_com_tipo(d):
    fontes = d["fonte"]
    assert isinstance(fontes, list) and len(fontes) >= 3
    for f in fontes:
        for k in ("nome", "url", "periodo", "acesso", "licenca", "nota", "tipo"):
            assert f.get(k), (k, f)
        assert f["tipo"] in ("modelado", "medido")
        assert len(f["acesso"]) == 10
    assert {f["tipo"] for f in fontes} == {"modelado", "medido"}


def test_json_compacto(d):
    txt = OUT.read_text(encoding="utf-8")
    assert txt == json.dumps(d, ensure_ascii=False, separators=(",", ":"))


# ---------- reprodutibilidade (exige brutos) ----------
@pytest.mark.skipif(not RAW.exists(), reason="data/raw ausente")
def test_build_reproduz_o_json_versionado(d):
    assert trafego.build(write=False) == d


@pytest.mark.skipif(not RAW.exists(), reason="data/raw ausente")
def test_manifesto_registra_urls_originais():
    mf = json.loads((ROOT / "data" / "manifest" / "trafego.json").read_text(encoding="utf-8"))
    urls = {i["url"] for i in mf}
    assert any("geo.infrasa.gov.br" in u and "VMDa_2023" in u for u in urls)
    assert any(u.endswith("base_0926.xlsx") for u in urls)
    assert sum("drive.google.com" in u for u in urls) >= 2
    assert all(i["sha256"] and i["bytes"] > 0 for i in mf)
