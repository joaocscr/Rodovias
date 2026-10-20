"""Base comum das camadas de inteligência: o SNV congelado (data/base/snv.json) e as junções com ele.

Toda camada nova se liga ao índice de trecho físico (`fis`). Três caminhos de junção:
- código SNV (exato, mesma versão);
- BR + UF + km (referência linear; o km de outras versões do SNV pode desviar);
- coordenada (snap ao físico mais próximo, em metros, EPSG:5880).
"""
import json
from functools import cached_property
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / "data" / "base"

# Posições no registro de `trechos` (ver scripts/snv.py, build_payload).
I_COD, I_BR, I_UF, I_TIPO, I_SIT, I_SUP, I_JUR, I_ADM, I_UL, I_KMI, I_KMF, I_EXT, I_LOCI, I_LOCF, I_EST, I_FIS = range(16)


def decode_line(p):
    """Linha codificada (1º par absoluto, demais deltas, ×1e5) → [(lon, lat), ...]."""
    out, x, y = [], 0, 0
    for i in range(0, len(p), 2):
        x += p[i]
        y += p[i + 1]
        out.append((x / 1e5, y / 1e5))
    return out


def encode_line(points):
    out, px, py = [], 0, 0
    for i, (x, y) in enumerate(points):
        qx, qy = round(x * 1e5), round(y * 1e5)
        out += [qx, qy] if i == 0 else [qx - px, qy - py]
        px, py = qx, qy
    return out


def norm_br(br):
    """'BR-040', '40', 40, '040' → '040'."""
    s = str(br).upper().replace("BR", "").replace("-", "").strip()
    s = s.split("/")[0].strip()
    return s.zfill(3) if s.isdigit() else s


class SNV:
    def __init__(self, path=BASE / "snv.json"):
        self.raw = json.loads(Path(path).read_text(encoding="utf-8"))
        d = self.raw["dict"]
        self.versao = self.raw["versao"]
        self.trechos = [
            {"codigo": t[I_COD], "br": d["br"][t[I_BR]], "uf": d["uf"][t[I_UF]], "tipo": d["tipo"][t[I_TIPO]],
             "situacao": d["situacao"][t[I_SIT]], "superficie": d["superficie"][t[I_SUP]], "adm": d["adm"][t[I_ADM]],
             "km_ini": t[I_KMI], "km_fim": t[I_KMF], "ext": t[I_EXT], "fis": t[I_FIS]}
            for t in self.raw["trechos"]
        ]
        self.fis = self.raw["fis"]
        self.n = len(self.fis)
        self.by_code = {t["codigo"]: i for i, t in enumerate(self.trechos)}
        self.by_br_uf = {}
        for i, t in enumerate(self.trechos):
            self.by_br_uf.setdefault((t["br"], t["uf"]), []).append(i)

    def ext(self, j):
        return self.fis[j]["ext"]

    def main_trecho(self, j):
        return self.trechos[self.fis[j]["r"][0]]

    def pavimentado(self, j):
        return self.main_trecho(j)["superficie"] == "PAV"

    def points(self, j):
        return decode_line(self.fis[j]["p"])

    def find_km(self, br, uf, km, tol=0.0, prefer_principal=True):
        """Índices de trechos da BR/UF cujo intervalo de km contém `km` (± tol). Eixo principal ('B') primeiro."""
        cands = [i for i in self.by_br_uf.get((norm_br(br), uf), [])
                 if self.trechos[i]["km_ini"] - tol - 1e-9 <= km <= self.trechos[i]["km_fim"] + tol + 1e-9]
        if prefer_principal:
            cands.sort(key=lambda i: (self.trechos[i]["codigo"][3] != "B", i))
        return cands

    def fis_of_km(self, br, uf, km, tol=0.0):
        c = self.find_km(br, uf, km, tol)
        return self.trechos[c[0]]["fis"] if c else None

    # ---------- geometria (lazy: só quem faz snap paga o custo) ----------
    @cached_property
    def _geo(self):
        from pyproj import Transformer
        from shapely.geometry import LineString
        from shapely.strtree import STRtree
        tr = Transformer.from_crs(4326, 5880, always_xy=True)
        geoms = []
        for f in self.fis:
            pts = decode_line(f["p"])
            if len(pts) < 2:
                pts = pts * 2
            xs, ys = tr.transform([p[0] for p in pts], [p[1] for p in pts])
            geoms.append(LineString(list(zip(xs, ys))))
        return tr, geoms, STRtree(geoms)

    def to_m(self, lon, lat):
        return self._geo[0].transform(lon, lat)

    def geom_m(self, j):
        return self._geo[1][j]

    def nearest(self, lon, lat, max_m=500, k=5, br=None):
        """[(dist_m, fis)] mais próximos até max_m; com `br`, só físicos que tenham essa BR."""
        from shapely.geometry import Point
        tr, geoms, tree = self._geo
        P = Point(*tr.transform(lon, lat))
        idx = tree.query(P.buffer(max_m))
        if br is not None:
            b = norm_br(br)
            idx = [j for j in idx if any(self.trechos[r]["br"] == b for r in self.fis[j]["r"])]
        res = sorted((geoms[j].distance(P), int(j)) for j in idx)
        return [(d, j) for d, j in res if d <= max_m][:k]

    def snap(self, lon, lat, max_m=500, br=None):
        r = self.nearest(lon, lat, max_m=max_m, k=1, br=br)
        return (r[0][1], r[0][0]) if r else (None, None)


_SNV = None


def snv():
    """Instância compartilhada (carregar o SNV custa ~1 s)."""
    global _SNV
    if _SNV is None:
        _SNV = SNV()
    return _SNV
