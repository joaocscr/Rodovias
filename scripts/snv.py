"""Leitura e preparo do SNV (DNIT) para o mapa interativo.

Funções puras: ler o shapefile, agrupar trechos coincidentes em trechos
físicos, simplificar e codificar geometrias e montar o payload `window.SNV`.
"""
import shapefile

# Campos categóricos guardados como índices de dicionário, na ordem do registro.
DICT_FIELDS = [
    ("br", "vl_br"),
    ("uf", "sg_uf"),
    ("tipo", "nm_tipo_tr"),
    ("situacao", "ds_legenda"),
    ("superficie", "ds_superfi"),
    ("jurisdicao", "ds_jurisdi"),
    ("adm", "ds_tipo_ad"),
    ("ul", "ul"),
]

CONSISTENCY_FIELDS = ["ds_legenda", "ds_tipo_ad", "sg_uf", "ds_jurisdi", "vl_extensa"]


def load_records(shp_path):
    reader = shapefile.Reader(shp_path, encoding="utf-8")
    names = [f[0] for f in reader.fields[1:]]
    records = []
    for sr in reader.iterShapeRecords():
        r = dict(zip(names, sr.record))
        r["points"] = [tuple(p) for p in sr.shape.points]
        records.append(r)
    return records


def _geom_key(points):
    a, b = (tuple(round(c, 6) for c in points[0]), tuple(round(c, 6) for c in points[-1]))
    return (min(a, b), max(a, b), len(points))


def group_physical(records):
    """Agrupa registros que são o mesmo trecho físico (union-find).

    Une registros citados juntos em `ds_coinc` (o principal vem com desc_coinc "-",
    os secundários com "Coinc") e registros com geometria idêntica, o que corrige
    `ds_coinc` inconsistentes entre os registros de um mesmo trecho.
    """
    parent = list(range(len(records)))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    def union(i, j):
        ri, rj = find(i), find(j)
        if ri != rj:
            parent[max(ri, rj)] = min(ri, rj)

    by_code = {r["vl_codigo"]: i for i, r in enumerate(records)}
    by_geom = {}
    for i, r in enumerate(records):
        for code in (r.get("ds_coinc") or "").split(";"):
            if code in by_code:
                union(i, by_code[code])
        if r.get("points"):
            union(i, by_geom.setdefault(_geom_key(r["points"]), i))

    groups = {}
    for i in range(len(records)):
        groups.setdefault(find(i), []).append(i)
    return [sorted(g, key=lambda i: (records[i]["vl_br"], i)) for _, g in sorted(groups.items())]


def check_group_consistency(records, groups):
    warnings = []
    for g in groups:
        if len(g) < 2:
            continue
        for f in CONSISTENCY_FIELDS:
            values = {records[i][f] for i in g}
            if len(values) > 1:
                codes = ",".join(records[i]["vl_codigo"] for i in g)
                warnings.append(f"{codes}: campo {f} difere ({sorted(map(str, values))})")
    return warnings


def _seg_dist2(p, a, b):
    ax, ay = a
    dx, dy = b[0] - ax, b[1] - ay
    if dx == 0 and dy == 0:
        return (p[0] - ax) ** 2 + (p[1] - ay) ** 2
    t = max(0.0, min(1.0, ((p[0] - ax) * dx + (p[1] - ay) * dy) / (dx * dx + dy * dy)))
    return (p[0] - ax - t * dx) ** 2 + (p[1] - ay - t * dy) ** 2


def simplify(points, tol):
    """Douglas-Peucker iterativo; sempre devolve pelo menos 2 pontos."""
    pts = list(points)
    if len(pts) == 1:
        return [pts[0], pts[0]]
    if len(pts) <= 2:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    tol2 = tol * tol
    stack = [(0, len(pts) - 1)]
    while stack:
        s, e = stack.pop()
        best, idx = -1.0, -1
        for i in range(s + 1, e):
            d = _seg_dist2(pts[i], pts[s], pts[e])
            if d > best:
                best, idx = d, i
        if idx != -1 and best > tol2:
            keep[idx] = True
            stack.append((s, idx))
            stack.append((idx, e))
    return [p for p, k in zip(pts, keep) if k]


def encode_line(points):
    out, px, py = [], 0, 0
    for i, (x, y) in enumerate(points):
        qx, qy = round(x * 1e5), round(y * 1e5)
        if i == 0:
            out += [qx, qy]
        else:
            out += [qx - px, qy - py]
        px, py = qx, qy
    return out


def build_payload(records, groups, tol):
    dicts = {key: sorted({str(r.get(field) or "") for r in records}) for key, field in DICT_FIELDS}
    index = {key: {v: i for i, v in enumerate(vals)} for key, vals in dicts.items()}
    fis_of = {}
    fis = []
    for gi, g in enumerate(groups):
        main = records[g[0]]
        fis.append({"p": encode_line(simplify(main["points"], tol)), "r": g, "ext": main["vl_extensa"]})
        for i in g:
            fis_of[i] = gi
    trechos = []
    for i, r in enumerate(records):
        cats = [index[key][str(r.get(field) or "")] for key, field in DICT_FIELDS]
        est = r.get("est_coinc") or ""
        if est and r.get("sup_est_co"):
            est = f"{est} ({r['sup_est_co']})"
        trechos.append([r["vl_codigo"], *cats, r["vl_km_inic"], r["vl_km_fina"], r["vl_extensa"],
                        r.get("ds_local_i") or "", r.get("ds_local_f") or "", est, fis_of[i]])
    return {"versao": str(records[0].get("versao_snv", "")) if records else "",
            "dict": dicts, "trechos": trechos, "fis": fis}
