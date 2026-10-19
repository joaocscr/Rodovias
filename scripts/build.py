"""Gera mapa-rodovias.html: um arquivo único e offline com dados, código, estilos e fontes.

Uso: python scripts/build.py --shp data/raw/SNV_202607A.shp --out mapa-rodovias.html
"""
import argparse
import base64
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from roadshow import build_conc, cobertura_markdown  # noqa: E402
from snv import build_payload, check_group_consistency, group_physical, load_records  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
MAX_BYTES = 15_000_000
JS_FILES = ["vendor/leaflet/leaflet.js", "src/model.js", "src/conc-model.js", "src/styles-map.js", "src/charts.js", "src/map.js",
            "src/ficha.js", "src/projetos.js", "src/mercado.js", "src/regulatorio.js", "src/ui.js", "src/tabs.js", "src/main.js"]
ROADSHOW = ROOT / "data" / "roadshow"
FONTS = [  # (família, peso, arquivo)
    ("Inter", 400, "inter-latin-400.woff2"),
    ("Inter", 600, "inter-latin-600.woff2"),
    ("Hind", 500, "hind-latin-500.woff2"),
    ("Hind", 700, "hind-latin-700.woff2"),
]


def br(x):
    return f"{x:,.1f}".replace(",", "X").replace(".", ",").replace("X", ".")


def font_faces():
    faces = []
    for family, weight, name in FONTS:
        b64 = base64.b64encode((ROOT / "vendor" / "fonts" / name).read_bytes()).decode()
        faces.append(f"@font-face{{font-family:'{family}';font-style:normal;font-weight:{weight};"
                     f"font-display:swap;src:url(data:font/woff2;base64,{b64}) format('woff2');}}")
    return "\n".join(faces)


def leaflet_css():
    css = (ROOT / "vendor" / "leaflet" / "leaflet.css").read_text(encoding="utf-8")
    # Sem marcadores nem controle de camadas: remove as imagens externas.
    return re.sub(r"url\(\s*images/[^)]*\)", "none", css)


def script_safe(text):
    return text.replace("</", "<\\/")


def build(shp, out, tol, rascunho=False):
    records = load_records(shp)
    groups = group_physical(records)
    warnings = check_group_consistency(records, groups)
    for w in warnings:
        print("AVISO:", w, file=sys.stderr)

    payload = build_payload(records, groups, tol)
    payload["ufs"] = json.loads((ROOT / "data" / "ufs.geojson").read_text(encoding="utf-8"))
    conc, report = build_conc(records, groups, ROADSHOW)
    (ROADSHOW / "cobertura.md").write_text(cobertura_markdown(records, groups, conc, report), encoding="utf-8")
    falhas = [r for r in report if r["qualidade"] == "falha"]

    raw_km = sum(r["vl_extensa"] for r in records)
    dedup_km = sum(records[g[0]]["vl_extensa"] for g in groups)
    v_before = sum(len(r["points"]) for r in records)
    v_after = sum(len(f["p"]) // 2 for f in payload["fis"])

    css = "\n".join([font_faces(), leaflet_css(), (ROOT / "src" / "styles.css").read_text(encoding="utf-8")])
    js = "\n;\n".join((ROOT / p).read_text(encoding="utf-8") for p in JS_FILES if (ROOT / p).exists())
    data = ("window.SNV=" + json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + ";\n"
            "window.CONC=" + json.dumps(conc, ensure_ascii=False, separators=(",", ":")) + ";")

    html = (ROOT / "src" / "template.html").read_text(encoding="utf-8")
    html = html.replace("{{VERSAO}}", payload["versao"])
    for key, value in [("CSS", css), ("DATA", script_safe(data)), ("JS", script_safe(js))]:
        html = html.replace(f"/*__{key}__*/", value)

    Path(out).write_text(html, encoding="utf-8")
    size = Path(out).stat().st_size
    print(f"registros: {len(records)} | trechos físicos: {len(groups)}")
    print(f"extensão bruta: {br(raw_km)} km | deduplicada: {br(dedup_km)} km")
    print(f"vértices: {v_before:,} -> {v_after:,} (tol {tol})".replace(",", "."))
    print(f"arquivo: {out} ({size / 1e6:.2f} MB)")
    q = {}
    for r in report:
        q[r["qualidade"]] = q.get(r["qualidade"], 0) + 1
    print(f"roadshow: {len(report)} entidades | recorte {q} | snv fora do RoadShow: {len(conc['snvOnly'])} trechos | cobertura em data/roadshow/cobertura.md")
    for r in falhas:
        print(f"FALHA no recorte: {r['id']} (declarado {r['km_decl']} km, mapeado {r['km_map']} km)", file=sys.stderr)
    if falhas and not rascunho:
        sys.exit("Falha: entidades sem recorte válido (veja data/roadshow/cobertura.md)")
    if warnings:
        sys.exit("Falha: atributos divergentes dentro de grupos coincidentes")
    if size > MAX_BYTES:
        sys.exit(f"Falha: arquivo maior que {MAX_BYTES / 1e6:.0f} MB")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--shp", default=str(ROOT / "data" / "raw" / "SNV_202607A.shp"))
    ap.add_argument("--out", default=str(ROOT / "mapa-rodovias.html"))
    ap.add_argument("--tol", type=float, default=0.0001)
    ap.add_argument("--rascunho", action="store_true", help="não falha por recorte incompleto (desenvolvimento)")
    args = ap.parse_args()
    build(args.shp, args.out, args.tol, args.rascunho)


if __name__ == "__main__":
    main()
