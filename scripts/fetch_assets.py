"""Baixa uma vez os assets que o HTML embute para rodar offline.

- Malha das UFs (IBGE) -> data/ufs.geojson, simplificada e com ponto de rótulo
- Leaflet 1.9.4 -> vendor/leaflet/
- Fontes Inter e Hind (woff2, subset latino) -> vendor/fonts/
"""
import gzip
import json
import math
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from snv import simplify  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
IBGE_MALHA = ("https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR"
              "?formato=application/vnd.geo+json&intrarregiao=UF&qualidade=intermediaria")
IBGE_ESTADOS = "https://servicodados.ibge.gov.br/api/v1/localidades/estados"
LEAFLET = "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/"
FONTS = {
    "inter-latin-400.woff2": "https://cdn.jsdelivr.net/npm/@fontsource/inter@5.0.18/files/inter-latin-400-normal.woff2",
    "inter-latin-600.woff2": "https://cdn.jsdelivr.net/npm/@fontsource/inter@5.0.18/files/inter-latin-600-normal.woff2",
    "hind-latin-500.woff2": "https://cdn.jsdelivr.net/npm/@fontsource/hind@5.0.12/files/hind-latin-500-normal.woff2",
    "hind-latin-700.woff2": "https://cdn.jsdelivr.net/npm/@fontsource/hind@5.0.12/files/hind-latin-700-normal.woff2",
}
UF_TOL = 0.01


def fetch(url):
    with urllib.request.urlopen(url, timeout=120) as resp:
        data = resp.read()
    return gzip.decompress(data) if data[:2] == b"\x1f\x8b" else data


def _rings(geom):
    return geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]


def _ring_area(ring):
    return abs(sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(ring, ring[1:]))) / 2


def _inside(pt, ring):
    x, y, inside = pt[0], pt[1], False
    for (x1, y1), (x2, y2) in zip(ring, ring[1:]):
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            inside = not inside
    return inside


def _edge_dist(pt, ring):
    best = math.inf
    for a, b in zip(ring, ring[1:]):
        dx, dy = b[0] - a[0], b[1] - a[1]
        L = dx * dx + dy * dy
        t = 0 if L == 0 else max(0, min(1, ((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dy) / L))
        best = min(best, math.hypot(pt[0] - a[0] - t * dx, pt[1] - a[1] - t * dy))
    return best


def label_point(geom, steps=40):
    """Ponto interno mais distante da borda (busca em grade no maior polígono)."""
    outer = max((poly[0] for poly in _rings(geom)), key=_ring_area)
    xs, ys = [p[0] for p in outer], [p[1] for p in outer]
    best, best_d = None, -1
    for i in range(1, steps):
        for j in range(1, steps):
            pt = (min(xs) + (max(xs) - min(xs)) * i / steps, min(ys) + (max(ys) - min(ys)) * j / steps)
            if _inside(pt, outer):
                d = _edge_dist(pt, outer)
                if d > best_d:
                    best, best_d = pt, d
    if best is None:
        best = (sum(xs) / len(xs), sum(ys) / len(ys))
    return [round(best[0], 4), round(best[1], 4)]


def _simplify_ring(ring):
    s = simplify([tuple(p) for p in ring], UF_TOL)
    s = s if len(s) >= 4 else [tuple(p) for p in ring]
    return [[round(x, 4), round(y, 4)] for x, y in s]


def build_ufs():
    malha = json.loads(fetch(IBGE_MALHA))
    siglas = {str(e["id"]): e["sigla"] for e in json.loads(fetch(IBGE_ESTADOS))}
    features = []
    for f in malha["features"]:
        geom = f["geometry"]
        polys = [[_simplify_ring(r) for r in poly] for poly in _rings(geom)]
        new_geom = {"type": "MultiPolygon", "coordinates": polys}
        features.append({"type": "Feature",
                         "properties": {"sigla": siglas[str(f["properties"]["codarea"])],
                                        "label": label_point(new_geom)},
                         "geometry": new_geom})
    out = ROOT / "data" / "ufs.geojson"
    out.write_text(json.dumps({"type": "FeatureCollection", "features": features},
                              ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"ufs.geojson: {len(features)} UFs, {out.stat().st_size / 1e3:.0f} kB")


def main():
    (ROOT / "vendor" / "leaflet").mkdir(parents=True, exist_ok=True)
    (ROOT / "vendor" / "fonts").mkdir(parents=True, exist_ok=True)
    for name in ["leaflet.js", "leaflet.css"]:
        (ROOT / "vendor" / "leaflet" / name).write_bytes(fetch(LEAFLET + name))
    for name, url in FONTS.items():
        (ROOT / "vendor" / "fonts" / name).write_bytes(fetch(url))
    build_ufs()


if __name__ == "__main__":
    main()
