"""Dados do RoadShow 2026-2027: validação, recorte curado (km → trechos físicos do SNV) e payload `window.CONC`."""
import json
from pathlib import Path

ESTADOS = [
    ("agendado2026", "Leilão agendado 2026"),
    ("projeto2027", "Projeto 2027"),
    ("programa", "Contrato do programa 2023–26"),
    ("vigente", "Contrato vigente anterior"),
    ("snv", "Concessão no SNV, fora do RoadShow"),
    ("pos2027", "Estudo pós-2027"),
    ("nenhum", "Sem concessão"),
]
CONTRATO = {"vigente", "programa"}
CONCESSAO_SNV = "Concessão Federal"
TOL_OK_PCT, TOL_OK_KM, TOL_APROX_PCT = 0.05, 10.0, 0.20
EDICAO = "edição de 14/10/2026"


def _load(data_dir, name, default=None):
    path = Path(data_dir) / name
    if not path.exists():
        if default is not None:
            return default
        raise FileNotFoundError(path)
    return json.loads(path.read_text(encoding="utf-8"))


def resolve_ranges(records, groups, ranges, codigos=()):
    """Físicos com um registro da BR/UF/tipo do intervalo coberto em ≥ 50% da própria extensão.

    Contornos, acessos e travessias têm numeração de km própria, por isso cada intervalo
    vale para um tipo de trecho (padrão: Eixo Principal). `codigos` inclui trechos avulsos.
    """
    out = set()
    wanted = set(codigos)
    if wanted:
        out |= {j for j, g in enumerate(groups) if any(records[i]["vl_codigo"] in wanted for i in g)}
    for rg in ranges:
        lo, hi = sorted((rg["km_ini"], rg["km_fim"]))
        tipo = rg.get("tipo", "Eixo Principal")
        for j, g in enumerate(groups):
            for i in g:
                r = records[i]
                if r["vl_br"] != rg["br"] or r["sg_uf"] != rg["uf"] or r.get("nm_tipo_tr", "Eixo Principal") != tipo:
                    continue
                ki, kf = sorted((r["vl_km_inic"], r["vl_km_fina"]))
                length = kf - ki
                overlap = min(kf, hi) - max(ki, lo)
                if (length > 0 and overlap >= 0.5 * length) or (length == 0 and lo <= ki <= hi):
                    out.add(j)
                    break
    return out


def coverage(records, groups, fis_ids):
    return sum(records[groups[j][0]]["vl_extensa"] for j in fis_ids)


def classify(km_decl, km_map):
    if not km_decl:
        return "aproximado"
    diff = abs(km_decl - km_map)
    if diff <= TOL_OK_KM or diff <= TOL_OK_PCT * km_decl:
        return "ok"
    if diff <= TOL_APROX_PCT * km_decl:
        return "aproximado"
    return "falha"


def qualidade_recorte(cfg, km_decl, km_map):
    """Qualidade do recorte de uma entidade: a marcada à mão em trechos.json; sem intervalos nem códigos, 'falha';
    senão a comparação do km declarado com o mapeado."""
    if cfg.get("qualidade"):
        return cfg["qualidade"]
    if not cfg.get("ranges") and not cfg.get("codigos"):
        return "falha"
    return classify(km_decl, km_map)


def cobertos(entidades, ent_fis):
    """Físicos dos contratos (estado em CONTRATO): ficam fora de "concessão no SNV, fora do RoadShow"."""
    return {j for e, fis in zip(entidades, ent_fis) if e["estado"] in CONTRATO for j in fis}


def snv_only(records, groups, covered):
    return [j for j, g in enumerate(groups)
            if j not in covered and any(records[i]["ds_tipo_ad"] == CONCESSAO_SNV for i in g)]


def _fis_by_br_uf(records, groups, brs, ufs):
    return sorted(j for j, g in enumerate(groups)
                  if any(records[i]["vl_br"] in brs and records[i]["sg_uf"] in ufs for i in g))


def build_conc(records, groups, data_dir):
    entidades = _load(data_dir, "entidades.json")
    trechos = _load(data_dir, "trechos.json", {})
    estudos = _load(data_dir, "estudos_pos2027.json", [])
    ent_fis, report = [], []
    for idx, e in enumerate(entidades):
        cfg = trechos.get(e["id"], {})
        fis = resolve_ranges(records, groups, cfg.get("ranges", []), cfg.get("codigos", []))
        km_map = round(coverage(records, groups, fis), 1)
        q = qualidade_recorte(cfg, e.get("km"), km_map)
        e = dict(e, idx=idx, qualidade=q, km_mapeado=km_map, nota_trecho=cfg.get("nota"))
        entidades[idx] = e
        ent_fis.append(sorted(fis))
        dif = (km_map - e["km"]) / e["km"] * 100 if e.get("km") else None
        report.append({"id": e["id"], "nome": e["nome"], "estado": e["estado"], "km_decl": e.get("km"),
                       "km_map": km_map, "dif_pct": None if dif is None else round(dif, 1),
                       "qualidade": q, "nota": cfg.get("nota") or ""})
    fis_ent = {}
    for idx, fis in enumerate(ent_fis):
        for j in fis:
            fis_ent.setdefault(j, []).append(idx)
    covered = cobertos(entidades, ent_fis)
    estudos_out = [dict(s, fis=_fis_by_br_uf(records, groups, s["brs"], s["ufs"])) for s in estudos]
    conc = {
        "estados": [{"key": k, "label": label} for k, label in ESTADOS],
        "entidades": entidades,
        "entFis": ent_fis,
        "fisEnt": fis_ent,
        "snvOnly": snv_only(records, groups, covered),
        "estudos": estudos_out,
        "edicaoRoadshow": EDICAO,
    }
    return curados(conc, data_dir), report


def curados(conc, data_dir):
    """`conc` com `mercado` e `regulatorio` relidos de data/roadshow/: os JSON curados são a fonte única desses
    blocos também no build pela base congelada (a cópia em data/base/conc.json pode estar defasada).
    Arquivo ausente falha o build, em vez de publicar as abas Mercado e Regulatório vazias."""
    out = dict(conc)
    for chave in ("mercado", "regulatorio"):
        path = Path(data_dir) / f"{chave}.json"
        if not path.exists():
            raise FileNotFoundError(f"arquivo curado do RoadShow ausente: {path} (fonte única de `{chave}` no build)")
        out[chave] = json.loads(path.read_text(encoding="utf-8"))
    return out


# Campos de cada entidade que dependem do recorte no SNV (build_conc com o shapefile); os demais vêm de entidades.json.
CAMPOS_RECORTE = ("idx", "km_mapeado", "nota_trecho")  # + qualidade, reclassificada com o km declarado atual
RECORTE_NOVO = "entidade nova/removida precisa de recorte no SNV: rode build.py --shp (ou ajuste trechos.json)"


def snv_only_payload(payload, covered):
    """snv_only a partir do SNV congelado (data/base/snv.json): físicos com algum registro "Concessão Federal" que
    nenhum contrato cobre. Mesmo resultado de snv_only, sem o shapefile."""
    k = 1 + list(payload["dict"]).index("adm")  # trechos: [código, *categorias na ordem de dict, ...]
    adm = payload["dict"]["adm"]
    if CONCESSAO_SNV not in adm:
        return []
    alvo = adm.index(CONCESSAO_SNV)
    return [j for j, f in enumerate(payload["fis"])
            if j not in covered and any(payload["trechos"][i][k] == alvo for i in f["r"])]


def atualiza_entidades(conc, data_dir, payload):
    """Cópia de `conc` (base congelada) com os campos curados das entidades e dos estudos relidos de data/roadshow/
    (entidades.json, estudos_pos2027.json), por id e na mesma ordem. Ficam da base os campos do recorte no SNV
    (CAMPOS_RECORTE, entFis, fisEnt, estudos[].fis); `qualidade` é reclassificada com o km declarado atual e `snvOnly`
    recalculado com os estados atuais. Entidade nova ou removida (ou estudo com outras BRs/UFs) pede recorte novo no
    SNV: ValueError com a mensagem do que fazer."""
    novas = _load(data_dir, "entidades.json")
    base = conc["entidades"]
    ids_b, ids_n = [e["id"] for e in base], [e["id"] for e in novas]
    if ids_b != ids_n:
        novos = [i for i in ids_n if i not in set(ids_b)]
        removidos = [i for i in ids_b if i not in set(ids_n)]
        detalhe = (f"novas: {', '.join(novos) or '—'}; removidas: {', '.join(removidos) or '—'}" if novos or removidos
                   else "a ordem das entidades em entidades.json mudou")
        raise ValueError(f"{RECORTE_NOVO} ({detalhe})")
    trechos = _load(data_dir, "trechos.json", {})
    entidades = []
    for b, n in zip(base, novas):
        km_map = b["km_mapeado"]
        entidades.append(dict(n, idx=b["idx"], qualidade=qualidade_recorte(trechos.get(n["id"], {}), n.get("km"), km_map),
                              km_mapeado=km_map, nota_trecho=b.get("nota_trecho")))
    est = _load(data_dir, "estudos_pos2027.json", [])
    if [(s["brs"], s["ufs"]) for s in est] != [(s["brs"], s["ufs"]) for s in conc.get("estudos", [])]:
        raise ValueError("estudo pós-2027 novo, removido ou com outras BRs/UFs precisa de recorte no SNV: rode "
                         "build.py --shp")
    estudos = [dict(s, fis=b["fis"]) for s, b in zip(est, conc.get("estudos", []))]
    out = dict(conc, estados=[{"key": k, "label": label} for k, label in ESTADOS], entidades=entidades,
               estudos=estudos, edicaoRoadshow=EDICAO)
    out["snvOnly"] = snv_only_payload(payload, cobertos(entidades, conc["entFis"]))
    return out


def conc_da_base(conc, data_dir, payload):
    """CONC do build sem o shapefile: base congelada + JSON curados de data/roadshow/ (mercado, regulatorio, entidades
    e estudos). A camada de verificação é aplicada depois, por quem chama."""
    return atualiza_entidades(curados(conc, data_dir), data_dir, payload)


def _br(x):
    return "—" if x is None else f"{x:,.1f}".replace(",", "X").replace(".", ",").replace("X", ".")


def cobertura_markdown(records, groups, conc, report):
    lines = ["# Cobertura do recorte curado (RoadShow × SNV)", "",
             "Gerado por `scripts/build.py`. km mapeado = soma da extensão SNV dos trechos físicos cobertos.",
             "Qualidade: `ok` (≤ 5% ou ≤ 10 km), `aproximado` (≤ 20% ou marcado à mão), `nao_mapeado`.", "",
             "| Entidade | Estado | km declarado | km mapeado | Dif. % | Qualidade | Nota |", "|---|---|---:|---:|---:|---|---|"]
    for r in report:
        dif = "—" if r["dif_pct"] is None else f"{r['dif_pct']:+.1f}".replace(".", ",")
        lines.append(f"| {r['nome']} | {r['estado']} | {_br(r['km_decl'])} | {_br(r['km_map'])} | {dif} | {r['qualidade']} | {r['nota']} |")
    by = {}
    for j in conc["snvOnly"]:
        r = records[groups[j][0]]
        key = (r["vl_br"], r["sg_uf"])
        by[key] = by.get(key, 0) + r["vl_extensa"]
    lines += ["", "## Concessão no SNV, fora do RoadShow", "",
              "Trechos com administração `Concessão Federal` no SNV que não caem em nenhum dos 39 contratos.", "",
              "| BR/UF | km |", "|---|---:|"]
    for (br, uf), km in sorted(by.items()):
        lines.append(f"| BR-{br}/{uf} | {_br(km)} |")
    return "\n".join(lines) + "\n"
