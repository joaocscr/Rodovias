import json
import math
import re
import statistics
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
from intel import vmda2025  # noqa: E402
from intel.snvbase import snv  # noqa: E402

OUT = ROOT / "data" / "intel" / "vmda2025.json"
MANIFEST = ROOT / "data" / "manifest" / "vmda2025.json"
TRAFEGO = ROOT / "data" / "intel" / "trafego.json"
ESTADUAIS = ROOT / "data" / "intel" / "estaduais.json"
DRIVE = "https://drive.google.com/file/d/1gnXpMWMLs4uZ9mWZf2SxlNe6R8LcdFha/view"
N = 6815
# Mesmo critério de tests/test_intel_fontes.py: texto visível sem nomes de campo nem jargão.
PROIBIDOS = re.compile(
    r"TO_GSA|TO_TOTAL|V_TOTAL|GTYPE|dist_m|km_map|entFis|entEst|entGeo|fonte_url|verificado=|sigilo=|CKAN|"
    r"\b(?:fis|snap|null|JSON|CSV|campos|campo|periodo|revisar)\b|\(revisar\)|[≤≥]|data/|\d{4}-(?:0[1-9]|1[0-2])\b|\w+_\w+",
    re.IGNORECASE)


def L(ext, t, c=None, d=None, ns=0):
    return {"ext": ext, "t": t, "c": c, "d": d, "ns": ns}


# ---------- funções puras ----------
def test_media_links_ponderada_pela_extensao():
    r = vmda2025.media_links([L(1, 1000, 400, 600), L(3, 2000, 1000, 1000)])
    assert r == {"t": 1750, "c": 850, "d": 900, "ns": 0}


def test_media_links_ignora_total_zero_ou_ausente():
    assert vmda2025.media_links([L(5, None), L(5, 0)]) is None
    assert vmda2025.media_links([]) is None
    assert vmda2025.media_links([L(5, 0), L(1, 3000, 1500, 1500)])["t"] == 3000


def test_media_links_sentido_null_se_faltar_em_algum_link():
    r = vmda2025.media_links([L(1, 1000, 400, 600), L(1, 3000)])
    assert r["t"] == 2000 and r["c"] is None and r["d"] is None


def test_media_links_uso_restrito_pela_maior_parte_da_extensao():
    assert vmda2025.media_links([L(3, 1000, ns=1), L(1, 1000)])["ns"] == 1
    assert vmda2025.media_links([L(1, 1000, ns=1), L(3, 1000)])["ns"] == 0


def test_maior_total_entre_trechos_coincidentes():
    a, b = {"t": 900, "c": 400, "d": 500, "ns": 0}, {"t": 4000, "c": 2000, "d": 2000, "ns": 1}
    assert vmda2025.maior_total([a, None, b]) is b
    assert vmda2025.maior_total([None, None]) is None


def test_mediana_dos_links_casados():
    r = vmda2025.mediana_links([L(1, 1000, ns=1), L(1, 5000), L(1, 3000)])
    assert r == {"t": 3000, "c": None, "d": None, "ns": 0}
    assert vmda2025.mediana_links([L(1, None), L(1, 0)]) is None
    assert vmda2025.mediana_links([L(1, None), L(1, 800, ns=1)]) == {"t": 800, "c": None, "d": None, "ns": 1}


# ---------- contrato do JSON ----------
@pytest.fixture(scope="module")
def d():
    return json.loads(OUT.read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def malha():
    return json.loads(ESTADUAIS.read_text(encoding="utf-8"))["malha"]


def test_estrutura(d, malha):
    assert d["tipo"] == "modelado" and d["ano"] == 2025
    assert snv().n == N
    for k in ("t", "c", "d", "ns"):
        assert len(d["fis"][k]) == N, k
    for k in ("t", "ns"):
        assert len(d["estaduais"][k]) == len(malha["linhas"]) == len(malha["p"]), k


def _int(v):
    return isinstance(v, int) and not isinstance(v, bool)


def test_tipos_e_nulos_coerentes(d):
    f, e = d["fis"], d["estaduais"]
    for j in range(N):
        t = f["t"][j]
        assert t is None or (_int(t) and t > 0), (j, t)
        for k in ("c", "d"):
            assert f[k][j] is None or (_int(f[k][j]) and f[k][j] >= 0), (j, k)
            if t is None:
                assert f[k][j] is None, (j, k)
        assert f["ns"][j] in (0, 1) and (t is not None or f["ns"][j] == 0), j
    assert any(v is None for v in f["t"])  # sem dado é null, não 0
    for t, ns in zip(e["t"], e["ns"]):
        assert t is None or (_int(t) and t > 0)
        assert ns in (0, 1) and (t is not None or ns == 0)
    assert 0 < sum(f["ns"]) < N and 0 < sum(e["ns"])


def test_sentidos_somam_o_total(d):
    f = d["fis"]
    pares = [(f["t"][j], f["c"][j] + f["d"][j]) for j in range(N) if f["c"][j] is not None and f["d"][j] is not None]
    assert len(pares) > 0.8 * sum(t is not None for t in f["t"])
    assert all(abs(t - s) <= 0.02 * t + 2 for t, s in pares)


def test_cobertura_federal_em_pavimentados(d):
    s = snv()
    t = d["fis"]["t"]
    pav = [j for j in range(N) if s.pavimentado(j)]
    km = sum(s.ext(j) for j in pav)
    km_ok = sum(s.ext(j) for j in pav if t[j] is not None)
    assert km_ok / km >= 0.90


def test_mediana_federal_plausivel(d):
    s = snv()
    t = d["fis"]["t"]
    assert 2000 <= statistics.median(t[j] for j in range(N) if s.pavimentado(j) and t[j] is not None) <= 8000


def _fake(trechos, fis, links):
    """SNV e Links mínimos para por_fis: trechos {codigo, superficie}, fis [[trechos]], links (cod, jur, t, linha)."""
    from types import SimpleNamespace

    import numpy as np
    from shapely.geometry import LineString
    ts = [{"codigo": c, "superficie": sup} for c, sup, _ in trechos]
    s = SimpleNamespace(trechos=ts, fis=[{"r": r} for r in fis],
                        main_trecho=lambda j: ts[fis[j][0]], geom_m=lambda j: LineString(trechos[fis[j][0]][2]))
    n = len(links)
    lk = vmda2025.Links(cod=[x[0] for x in links], jur=[x[1] for x in links], tipo=["Rodovia"] * n, ext=[1.0] * n,
                        t=[x[2] for x in links], c=[None] * n, d=[None] * n, ns=[0] * n,
                        geoms=np.array([LineString(x[3]) for x in links], dtype=object))
    return s, lk


def test_por_fis_codigo_coincidentes_e_fallback():
    reta = [(0, 0), (1000, 0)]
    longe = [(0, 5000), (1000, 5000)]
    s, lk = _fake(
        trechos=[("A", "PAV", reta), ("B", "PAV", reta), ("X", "PAV", longe), ("Y", "PAV", [(0, 9000), (1000, 9000)]),
                 ("P", "PLA", [(0, 20000), (1000, 20000)]), ("Q", "PLA", [(0, 30000), (1000, 30000)])],
        fis=[[0, 1], [2], [3], [4], [5]],
        links=[("A", "Federal", 1000, reta), ("B", "Estadual", 4000, reta),
               ("Z", "Federal", 7000, [(0, 5050), (1000, 5050)]),  # 50 m do físico 1, código diferente
               ("W", "Federal", 9000, [(0, 9300), (1000, 9300)]),  # 300 m do físico 2: longe demais
               ("P", "Estadual", 2500, [(0, 20000), (1000, 20000)]),  # planejado associado pelo código
               ("", "Federal", 8000, [(0, 30000), (1000, 30000)])])  # planejado sem código: sem fallback
    res, cont = vmda2025.por_fis(lk, s)
    assert [r and r["t"] for r in res] == [4000, 7000, None, 2500, None]
    assert cont == {"codigo": 2, "geometria": 1, "sem_codigo": 2}


def test_planejados_so_com_valor_pelo_codigo(d):
    s = snv()
    pla = [j for j in range(N) if s.main_trecho(j)["superficie"] == "PLA"]
    assert pla and sum(d["fis"]["t"][j] is not None for j in pla) < len(pla)


def test_correlacao_log_com_vmda_2023(d):
    v23 = json.loads(TRAFEGO.read_text(encoding="utf-8"))["vmda"]
    xs, ys = [], []
    for j in range(N):
        a, l, p = d["fis"]["t"][j], v23["l"][j], v23["p"][j]
        if a and l is not None and l + p > 0:
            xs.append(math.log(a))
            ys.append(math.log(l + p))
    assert len(xs) > 4000
    assert statistics.correlation(xs, ys) >= 0.85


def test_estaduais_pavimentadas_com_valor(d, malha):
    t = d["estaduais"]["t"]
    pav = [i for i, ln in enumerate(malha["linhas"]) if ln[3] in ("PAV", "DUP")]
    assert sum(t[i] is not None for i in pav) / len(pav) >= 0.50
    assert 1000 <= statistics.median(t[i] for i in pav if t[i] is not None) <= 8000


def test_maiores_volumes_em_regioes_metropolitanas(d):
    s = snv()
    t = d["fis"]["t"]
    top = sorted((j for j in range(N) if t[j] is not None), key=lambda j: -t[j])[:20]
    assert t[top[0]] > 50_000
    assert sum(s.main_trecho(j)["uf"] in {"SP", "RJ", "MG", "PR", "RS", "SC", "DF", "GO", "BA", "PE"} for j in top) >= 16


def test_json_compacto(d):
    assert OUT.stat().st_size <= 250 * 1024


def test_fonte_em_linguagem_clara(d):
    assert isinstance(d["fonte"], list) and d["fonte"]
    for f in d["fonte"]:
        for k in ("nome", "url", "periodo", "acesso", "licenca", "nota", "tipo"):
            assert f.get(k), k
        assert f["url"] == DRIVE and f["tipo"] == "modelado" and "2025" in f["periodo"]
        assert "fornecida pelo usuário" in f["nota"] and "uso restrito" in f["nota"]
        for k in ("nome", "periodo", "nota", "licenca"):
            achado = PROIBIDOS.search(f[k])
            assert not achado, (k, achado.group(0))


def test_manifesto_registra_o_arquivo_do_drive():
    itens = json.loads(MANIFEST.read_text(encoding="utf-8"))
    it = next(i for i in itens if i["url"] == DRIVE)
    assert it["dominio"] == "vmda2025" and "fornecida pelo usuário" in it["descricao"]
    assert (ROOT / it["arquivo"]).stat().st_size == it["bytes"] and len(it["sha256"]) == 64
