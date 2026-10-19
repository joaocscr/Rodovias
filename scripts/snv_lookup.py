"""Ferramenta de curadoria: lista os trechos do SNV de uma BR/UF ordenados por km.

Uso: python scripts/snv_lookup.py 116 MG [--adm]
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from snv import load_records  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent


def main():
    br, uf = sys.argv[1].zfill(3), sys.argv[2].upper()
    show_adm = "--adm" in sys.argv
    recs = [r for r in load_records(str(ROOT / "data" / "raw" / "SNV_202607A.shp"))
            if r["vl_br"] == br and r["sg_uf"] == uf]
    for r in sorted(recs, key=lambda r: (r["nm_tipo_tr"] != "Eixo Principal", r["vl_km_inic"])):
        adm = f" | {r['ds_tipo_ad']}" if show_adm else ""
        print(f"{r['vl_km_inic']:8.1f} {r['vl_km_fina']:8.1f} {r['vl_extensa']:6.1f} | {r['nm_tipo_tr'][:6]} | "
              f"{r['ds_local_i']} → {r['ds_local_f']}{adm}")
    print(f"# {len(recs)} registros, {sum(r['vl_extensa'] for r in recs):.1f} km")


if __name__ == "__main__":
    main()
