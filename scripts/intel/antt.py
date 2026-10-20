"""ANTT: praças de pedágio, SATs, capas das concessões, séries financeiras e obras do acompanhamento anual.

Lê data/raw/antt/ (baixado por `fetch()`) e grava data/intel/antt.json (contrato no plano v3, Task 2).

    python scripts/intel/antt.py [fetch|build|all]

Junções:
- nome ANTT da concessionária → id de entidade de data/base/conc.json por `NAMEMAP` (nomes normalizados);
- praças e SATs → físico do SNV por snap da coordenada (≤ 500 m, mesma BR);
- obras → físico por BR + UF + km (`snv().find_km`), ponto interpolado no físico.
"""
import calendar
import datetime as dt
import html as htmllib
import json
import re
import sys
import unicodedata
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from intel.fontes import Manifest, fetch as fetch_url  # noqa: E402
from intel.snvbase import snv  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "raw" / "antt"
OUT = ROOT / "data" / "intel" / "antt.json"
CKAN = "https://dados.antt.gov.br/api/3/action/package_show?id="
GOVBR = "https://www.gov.br/antt/pt-br/assuntos/rodovias/concessionarias"
LICENCA = "Creative Commons Atribuição (CC-BY)"
SNAP_M = 500
SNAP_LIVRE_M = 100  # acessos/alças sem BR do SNV: qualquer físico até 100 m
MESES = [f"{y}-{m:02d}" for y in (2024, 2025, 2026) for m in range(1, 13)][:32]  # 2024-01 .. 2026-08
ANOS = list(range(2010, 2026))
DESC_MAX = 64  # mantém o bloco < 400 kB (400.000 bytes)


# ============================================================ nomes → entidades

def norm(s):
    s = unicodedata.normalize("NFKD", str(s)).encode("ascii", "ignore").decode().upper()
    return re.sub(r"[^A-Z0-9]+", " ", s).strip()


# Nome normalizado (norm) nos datasets ANTT → id de entidade (data/base/conc.json). Recon antt.md §10.
NAMEMAP = {
    "AUTOPISTA FLUMINENSE": "autopista-fluminense", "AF": "autopista-fluminense",
    "AUTOPISTA LITORAL SUL": "autopista-litoral-do-sul", "ALS": "autopista-litoral-do-sul",
    "AUTOPISTA PLANALTO SUL": "autopista-planalto-sul", "APS": "autopista-planalto-sul",
    "AUTOPISTA REGIS BITTENCOURT": "regis-bittencourt", "ARB": "regis-bittencourt",
    "CONCEBRA": "concebra",
    "ECOVIAS MINAS GOIAS": "ecovias-minas-goias", "ECO050": "ecovias-minas-goias", "MGO": "ecovias-minas-goias",
    "ECOVIAS CAPIXABA": "ecovias-capixaba", "ECO101": "ecovias-capixaba", "ECOVIAS101": "ecovias-capixaba",
    "ECOVIAS 101": "ecovias-capixaba", "ECO101 CONCESSIONARIA DE RODOVIAS S A": "ecovias-capixaba",
    "ECOVIAS PONTE": "ecovias-ponte", "ECOPONTE": "ecovias-ponte", "ECOVIASPONTE": "ecovias-ponte",
    "ECOVIAS RIO MINAS": "ecovias-rio-minas", "ECORIOMINAS": "ecovias-rio-minas", "ECO RIOMINAS": "ecovias-rio-minas",
    "ECOVIAS RIOMINAS": "ecovias-rio-minas",
    "ECOVIAS DO ARAGUAIA": "ecovias-araguaia", "ECOVIAS ARAGUAIA": "ecovias-araguaia",
    "ECOVIAS DO CERRADO": "ecovias-cerrado", "ECOVIAS CERRADO": "ecovias-cerrado",
    "ECOVIAS DAS GERAIS": "rotas-gerais",
    "ELOVIAS": "juiz-de-fora-rio-de-janeiro",
    "EPR IGUACU": "rodovias-integradas-do-parana-lote-6",
    "EPR PARANA": "rodovias-integradas-do-parana-lote-4",
    "LITORAL PIONEIRO": "rodovias-integradas-do-parana-lote-2",
    "EPR LITORAL PIONEIRO": "rodovias-integradas-do-parana-lote-2",
    "EPR VIA MINEIRA": "belo-horizonte-juiz-de-fora", "VIA MINEIRA": "belo-horizonte-juiz-de-fora",
    "VIAMINEIRA": "belo-horizonte-juiz-de-fora",
    "MOTIVA MINAS SP": "fernao-dias", "AUTOPISTA FERNAO DIAS": "fernao-dias", "AFD": "fernao-dias",
    "MOTIVA PARANA": "rodovias-integradas-do-parana-lote-3", "PRVIAS": "rodovias-integradas-do-parana-lote-3",
    "PR VIAS": "rodovias-integradas-do-parana-lote-3",
    "PANTANAL": "motiva-pantanal", "MOTIVA PANTANAL": "motiva-pantanal", "MSVIA": "motiva-pantanal",
    "MSVIA PANTANAL": "motiva-pantanal",
    "NOVA ROTA DO OESTE": "nova-rota-do-oeste", "CRO": "nova-rota-do-oeste", "ROTA DO OESTE": "nova-rota-do-oeste",
    "NOVA 364": "rota-agro-norte", "NOVA 381": "nova-381",
    "RIOSP": "rio-sp", "RIO SP": "rio-sp",
    "ROTA VERDE GOIAS": "rota-verde-goias", "ROTA VERDE": "rota-verde-goias",
    "TRANSBRASILIANA": "transbrasiliana", "TRANS": "transbrasiliana", "RODOVIA TRANSBRASILIANA": "transbrasiliana",
    "VIA ARAUCARIA": "rodovias-integradas-do-parana-lote-1", "VIA ARAUCARIAS": "rodovias-integradas-do-parana-lote-1",
    "VIA BRASIL": "via-brasil", "VIABRASIL": "via-brasil", "VIA BRASIL BR 163": "via-brasil",
    "VIA COSTEIRA": "via-costeira", "VIACOSTEIRA": "via-costeira",
    "VIA CRISTAIS": "rota-dos-cristais", "VIACRISTAIS": "rota-dos-cristais", "VIA DOS CRISTAIS": "rota-dos-cristais",
    "VIA SUL": "via-sul", "VIASUL": "via-sul",
    "VIA CAMPO": "rodovias-integradas-do-parana-lote-5",
    "WAY 153": "rota-sertaneja", "WAY153": "rota-sertaneja",
    "WAY 262": "rota-zebu", "WAY262": "rota-zebu",
    "WAY 364": "rota-agro", "WAY364": "rota-agro",
    "116 SERTOES": "rota-dos-sertoes",
}

# Concessões encerradas (sem entidade própria): slug da capa → (id próprio, [sucessores]); nomes nos datasets → slug.
ENCERRADAS = {
    "ccr-ponte": ("ccr-ponte", ["ecovias-ponte"]),
    "concepa": ("concepa", ["via-sul"]),
    "crt": ("crt", ["ecovias-rio-minas"]),
    "galvao-br-153": ("galvao-br-153", ["ecovias-araguaia"]),
    "nova-dutra": ("nova-dutra", ["rio-sp"]),
    "via-040": ("via-040", ["rota-dos-cristais", "belo-horizonte-juiz-de-fora"]),
    "via-bahia": ("via-bahia", ["rota-2-de-julho"]),
    "rodovia-do-aco-caducidade-declarada": ("rodovia-do-aco", ["rota-vale-do-cafe"]),
    "concer": ("concer", ["juiz-de-fora-rio-de-janeiro"]),
    "ecosul-contrato-encerrado": ("ecosul", ["rota-portuaria-do-sul"]),
}
ENC_NAMES = {
    "CCR PONTE": "ccr-ponte", "CONCEPA": "concepa", "CRT": "crt", "GALVAO BR 153": "galvao-br-153",
    "NOVADUTRA": "nova-dutra", "NOVA DUTRA": "nova-dutra", "VIA 040": "via-040", "VIA040": "via-040",
    "VIA BAHIA": "via-bahia", "VIABAHIA": "via-bahia", "RODOVIA DO ACO": "rodovia-do-aco-caducidade-declarada",
    "ACO": "rodovia-do-aco-caducidade-declarada", "CONCER": "concer", "ECOSUL": "ecosul-contrato-encerrado",
    "ECOVIAS SUL": "ecosul-contrato-encerrado",
}

# Slug da capa (gov.br/antt) → id de entidade, para as 36 concessões ativas.
CAPA_ENT = {
    "116-sertoes": "rota-dos-sertoes", "Transbrasiliana": "transbrasiliana",
    "autopista-fluminense": "autopista-fluminense", "autopista-litoral-sul": "autopista-litoral-do-sul",
    "autopista-planalto-sul": "autopista-planalto-sul", "autopista-regis-bittencourt": "regis-bittencourt",
    "ccr-rio-sp": "rio-sp", "ccr-viacosteira": "via-costeira", "concebra": "concebra",
    "eco050": "ecovias-minas-goias", "ecoponte": "ecovias-ponte", "ecoriominas": "ecovias-rio-minas",
    "ecovias-araguaia": "ecovias-araguaia", "ecovias-capixaba": "ecovias-capixaba",
    "ecovias-das-gerais": "rotas-gerais", "ecovias-do-cerrado": "ecovias-cerrado",
    "elovias": "juiz-de-fora-rio-de-janeiro", "epr-iguacu": "rodovias-integradas-do-parana-lote-6",
    "epr-litoral-pioneiro": "rodovias-integradas-do-parana-lote-2",
    "epr-parana": "rodovias-integradas-do-parana-lote-4",
    "epr-via-mineira": "belo-horizonte-juiz-de-fora", "motiva-minas-sp": "fernao-dias",
    "motiva-pantanal": "motiva-pantanal", "nova-364": "rota-agro-norte", "nova-381": "nova-381",
    "pr-vias": "rodovias-integradas-do-parana-lote-3", "rota-agro": "rota-agro",
    "rota-do-oeste": "nova-rota-do-oeste", "rota-sertaneja": "rota-sertaneja", "rota-verde-goias": "rota-verde-goias",
    "via-araucaria": "rodovias-integradas-do-parana-lote-1", "via-brasil": "via-brasil",
    "via-campos": "rodovias-integradas-do-parana-lote-5", "via-cristais": "rota-dos-cristais",
    "viasul": "via-sul", "way-262": "rota-zebu",
}


def ent_of(name):
    return NAMEMAP.get(norm(name)) if name is not None else None


def enc_of(name):
    """Nome ANTT de concessão encerrada → (id próprio, sucessor principal) ou None."""
    slug = ENC_NAMES.get(norm(name))
    if not slug:
        return None
    own, suc = ENCERRADAS[slug]
    return own, suc[0]


# ============================================================ conversões

MES_PT = {m: i + 1 for i, m in enumerate(["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto",
                                           "setembro", "outubro", "novembro", "dezembro"])}


def iso_date(s):
    """'12/03/2014', '2 9/12/2008', '29 de setembro de 2021' → 'AAAA-MM-DD'; outro texto volta como veio."""
    if s is None:
        return None
    s = str(s).replace("﻿", "").strip()
    if not s:
        return None
    t = re.sub(r"(?<=\d) (?=\d)", "", s)
    m = re.fullmatch(r"(\d{1,2})/(\d{1,2})/(\d{4})", t)
    if m:
        d, mo, y = map(int, m.groups())
    else:
        m = re.fullmatch(r"(\d{1,2})º? de ([a-zçA-ZÇ]+) de (\d{4})", t)
        mo = MES_PT.get(norm(m.group(2)).lower()) if m else None
        if not mo:
            return s
        d, y = int(m.group(1)), int(m.group(3))
    try:
        return dt.date(y, mo, d).isoformat()
    except ValueError:
        return s


def num(s):
    """'1.001,20' / '805713,00' / '40.5' → float (None se vazio)."""
    if s is None:
        return None
    s = str(s).strip().replace("%", "")
    if not s or s.lower() == "nan":
        return None
    if "," in s:
        s = s.replace(".", "").replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None


def km_of(s):
    m = re.search(r"(\d[\d.]*(?:,\d+)?)\s*km", str(s or ""), flags=re.I)
    return num(m.group(1)) if m else None


def split_rod(s):
    """'BR-386/RS' → ('BR-386','RS'); 'BR-40' → ('BR-040', None); 'PR-151' → ('PR-151','PR')."""
    s = str(s or "").strip().upper().replace(" ", "")
    m = re.match(r"([A-Z]{2})-?(\d+)(?:/([A-Z]{2}))?", s)
    if not m:
        return (s or None), None
    pre, n, uf = m.groups()
    if pre == "BR":
        return f"BR-{int(n):03d}", uf
    return f"{pre}-{int(n):03d}", uf or pre


def pfe_key(nome):
    """Par free flow da RIOSP ('Free Flow PFE004 - PFS003 Sul') → código do pórtico de entrada ('PFE004')."""
    m = re.match(r"\s*free flow (P(?:FE|PF)\d+)\b.*-", str(nome), flags=re.I)
    return m.group(1).upper() if m else None


def snap_ponto(S, lon, lat, rod):
    """Físico do ponto: ≤ SNAP_M na mesma BR quando `rod` é uma BR do SNV; quando não é (acesso, alça, BR
    inexistente como 'BR-038'), o físico mais próximo a ≤ SNAP_LIVRE_M. None se não casar."""
    if lon is None or lat is None:
        return None
    br, _ = split_rod(rod)
    if br and br.startswith("BR-") and br[3:] in {b for b, _ in S.by_br_uf}:
        fis, _ = S.snap(lon, lat, max_m=SNAP_M, br=br)
    else:
        fis, _ = S.snap(lon, lat, max_m=SNAP_LIVRE_M)
    return None if fis is None else int(fis)


def r5(x):
    return None if x is None else round(float(x), 5)


def ci(x):
    """Inteiro quando o número é inteiro (JSON compacto: 1.0 → 1)."""
    return int(x) if isinstance(x, float) and x.is_integer() else x


def days(ym):
    y, m = int(ym[:4]), int(ym[5:7])
    return calendar.monthrange(y, m)[1]


def ckan_meta(slug):
    p = RAW / "ckan" / f"{slug}.json"
    return json.loads(p.read_text(encoding="utf-8"))["result"] if p.exists() else None


# ============================================================ fetch

# (pasta em data/raw/antt, slug CKAN, arquivo, descrição, período)
ARQUIVOS = [
    ("praca", "praca-de-pedagio", "dados-dos-pracas-de-pedagio6_2026.csv", "Cadastro de praças de pedágio", "6/2026"),
    ("volume", "volume-trafego-praca-pedagio", "volume-trafego-praca-pedagio-2024_mensal_consolidado.csv",
     "Volume de tráfego por praça (mensal consolidado)", "2024"),
    ("volume", "volume-trafego-praca-pedagio", "volume-trafego-praca-pedagio-2025_mensal_consolidado.csv",
     "Volume de tráfego por praça (mensal consolidado)", "2025"),
    ("volume", "volume-trafego-praca-pedagio", "volume-trafego-praca-pedagio-2026_mensal_consolidado.csv",
     "Volume de tráfego por praça (mensal consolidado)", "01-08/2026"),
    ("receita-por-praca", "receita-por-praca", "receita_por_praca_2025.csv", "Receita por praça de pedágio", "2025"),
    ("receita-pedagio", "receita-pedagio", "receita_de_pedagio.csv", "Receita de pedágio por concessão", "2010-2025"),
    ("investimentos", "investimentos", "investimentos.csv", "Investimentos realizados por concessão", "2010-2025"),
    ("custos-operacionais", "custos-operacionais", "custos_operacionais.csv", "Custos operacionais por concessão",
     "2010-2025"),
    ("acompanhamento-anual", "acompanhamento-anual", "acompanhamento-anual-investimentos.csv",
     "Acompanhamento anual de investimentos (obras)", "2023-2026"),
]
SAT_SLUG = "volume-sat"
DATASETS = sorted({a[1] for a in ARQUIVOS} | {SAT_SLUG})


def _resource_url(meta, fname):
    for r in meta.get("resources", []):
        u = r.get("url") or ""
        base = u.rsplit("/", 1)[-1]
        if base == fname or (fname.startswith(r["id"] + "_") and base == fname[len(r["id"]) + 1:]):
            return u
    return None


def sat_files():
    return sorted((RAW / "sat").glob("*mensal_consolidado.csv"))


def fetch():
    man = Manifest("antt")
    for slug in DATASETS:
        dest = RAW / "ckan" / f"{slug}.json"
        fetch_url(CKAN + slug, dest)
        man.add(CKAN + slug, dest, f"Metadados CKAN: {slug}", licenca=LICENCA)
    for pasta, slug, fname, desc, periodo in ARQUIVOS:
        url = _resource_url(ckan_meta(slug), fname)
        if url is None:
            raise RuntimeError(f"recurso {fname} não está em {slug}")
        man.add(url, fetch_url(url, RAW / pasta / fname), desc, periodo, LICENCA)
    meta = ckan_meta(SAT_SLUG)
    sat_res = [r for r in meta["resources"] if (r.get("url") or "").endswith("mensal_consolidado.csv")]
    for r in sat_res:
        base = r["url"].rsplit("/", 1)[-1]
        fname = base if base != "volume-sat-_mensal_consolidado.csv" else f"{r['id']}_{base}"
        man.add(r["url"], fetch_url(r["url"], RAW / "sat" / fname), "Volume nos SATs (mensal consolidado)",
                "2022-2026", LICENCA)
    lista = RAW / "capas" / "lista.html"
    fetch_url(GOVBR, lista)
    man.add(GOVBR, lista, "Lista de concessões (gov.br/antt)")
    urls = RAW / "capas" / "capas_urls.txt"
    if not urls.exists():
        urls.write_text("\n".join(capa_urls_from_list(lista.read_text(encoding="utf-8"))) + "\n", encoding="utf-8")
    for u in urls.read_text(encoding="utf-8").split():
        dest = RAW / "capas" / (u.split("/lista-de-concessoes/")[1].replace("/", "__") + ".html")
        man.add(u, fetch_url(u, dest), "Capa da concessão (gov.br/antt)")
    man.save()
    return man


# ============================================================ capas

CAPA_CAMPOS = {
    "controladora": r"Empresas? Controladoras?",
    "trecho": r"Trecho Objeto da Concessão",
    "extensao": r"Extensão do Trecho Concedido",
    "assinatura": r"Data da Assinatura(?: do Contrato)?",
    "inicio": r"Início da Concessão",
    "prazo": r"Prazo da Concessão",
    "edital": r"Edital",
    "cobranca": r"Início da Cobrança de Pedágio",
    "database": r"Data Base de reajuste da tarifa de pedágio|Data de reajuste anual da tarifa de pedágio|Data-base",
}
_ALL_LABELS = "|".join(f"(?:{v})" for v in CAPA_CAMPOS.values())
_JUNK = ("Revisões Tarifárias", "Tarifas de Pedágio", "Site da Concessionária", "Ouvidoria")


def _text(block):
    b = re.sub(r"<script.*?</script>", "", block, flags=re.S)
    b = re.sub(r"<(br|p|li|tr|h\d|div)[^>]*>", "\n", b)
    b = htmllib.unescape(re.sub(r"<[^>]+>", " ", b))
    return re.sub(r"[ \t\xa0]+", " ", b)


def capa_urls_from_list(lista_html):
    return sorted({m for m in re.findall(r'href="([^"]*/lista-de-concessoes/[^"#?]+)"', lista_html)})


def parse_lista(lista_html):
    """[(slug, nome, extensao_km, situacao)] na ordem da página; seção 'Contratos Encerrados' → encerrada."""
    b = lista_html[lista_html.find('id="content"'):]
    out, situ = [], "ativa"
    for m in re.finditer(r'<h\d[^>]*>(.*?)</h\d>|<strong>(.*?)</strong>|<a [^>]*href="[^"]*lista-de-concessoes/'
                         r'([^"]+)"[^>]*>(.*?)</a>', b, flags=re.S):
        if m.group(3) is None:
            if "encerrad" in norm(m.group(1) or m.group(2)).lower():
                situ = "encerrada"
            continue
        txt = re.sub(r"\s+", " ", htmllib.unescape(re.sub(r"<[^>]+>", " ", m.group(4)))).strip()
        nome = re.split(r"\s*(?:\(|Área de atuação|Extensão)", txt)[0].strip()
        out.append((m.group(3).split("/")[-1], nome, km_of(txt.split("Extens")[-1]) if "Extens" in txt else None,
                    situ))
    return out


def parse_capa(page):
    i = page.find('id="content"')
    b = _text(page[i:i + 60000])
    r = {}
    for k, lab in CAPA_CAMPOS.items():
        m = re.search(r"(?:%s)\s*:\s*([^\n]*)" % lab, b, flags=re.I)
        val = m.group(1).strip() if m else ""
        val = re.split(r"(?:%s)\s*:" % _ALL_LABELS, val, flags=re.I)[0].strip().replace("﻿", "")
        if val.startswith(_JUNK):
            val = ""
        r[k] = val or None
    return r


def build_capas():
    lista = (RAW / "capas" / "lista.html").read_text(encoding="utf-8")
    urls = {u.split("/lista-de-concessoes/")[1].split("/")[-1]: u
            for u in (RAW / "capas" / "capas_urls.txt").read_text(encoding="utf-8").split()}
    out = {}
    for slug, nome, ext_lista, situ in parse_lista(lista):
        url = urls[slug]
        page = (RAW / "capas" / (url.split("/lista-de-concessoes/")[1].replace("/", "__") + ".html"))
        c = parse_capa(page.read_text(encoding="utf-8"))
        if situ == "ativa":
            key, suc, sucs = CAPA_ENT[slug], None, None
        else:
            key, sucs = ENCERRADAS[slug]
            suc = sucs[0]
        # a Nova 381 e a Motiva Paraná trazem o site da concessionária no lugar da data
        site = re.compile(r"\.(com|br)\b|www", flags=re.I)
        cob = None if c["cobranca"] and site.search(c["cobranca"]) else c["cobranca"]
        db = None if c["database"] and site.search(c["database"]) else c["database"]
        item = {
            "nome": nome, "situacao": situ, "sucessor": suc, "controladora": c["controladora"],
            "trecho": c["trecho"], "extensao_km": km_of(c["extensao"]) or ext_lista,
            "assinatura": iso_date(c["assinatura"]), "inicio": iso_date(c["inicio"]), "prazo": c["prazo"],
            "edital": c["edital"], "cobranca": iso_date(cob), "database": db, "url": url,
        }
        if sucs and len(sucs) > 1:
            item["sucessores"] = sucs
        out[key] = item
    return out


# ============================================================ séries por concessão

def build_series():
    import pandas as pd
    files = {"receita": RAW / "receita-pedagio" / "receita_de_pedagio.csv",
             "investimento": RAW / "investimentos" / "investimentos.csv",
             "custo": RAW / "custos-operacionais" / "custos_operacionais.csv"}
    acc = defaultdict(lambda: defaultdict(dict))  # key → campo → ano → valor
    suc = {}
    for campo, f in files.items():
        d = pd.read_csv(f, sep=";", encoding="latin1", dtype=str)
        d.columns = [c.lower() for c in d.columns]
        for nome, ano, valor in zip(d.concessionaria, d.ano, d.valor):
            e = ent_of(nome)
            if e is None:
                enc = enc_of(nome)
                if enc is None:
                    raise ValueError(f"concessionária sem mapeamento: {nome!r}")
                e, suc[enc[0]] = enc
            v, a = num(valor), int(ano)
            if v is None or a not in ANOS:
                continue
            cell = acc[e][campo]
            # nomes diferentes do mesmo contrato (ECO050/MGO, MSVIA/PANTANAL) cobrem anos distintos; se repetir, soma
            cell[a] = cell.get(a, 0) + v
    out = {}
    for e in sorted(acc):
        item = {"anos": ANOS}
        for campo in files:
            item[campo] = [None if a not in acc[e][campo] else int(round(acc[e][campo][a])) for a in ANOS]
        if e in suc:
            item["sucessor"] = suc[e]
        out[e] = item
    return out


# ============================================================ praças

def _load_volumes():
    import pandas as pd
    L = []
    for y in (2024, 2025, 2026):
        d = pd.read_csv(RAW / "volume" / f"volume-trafego-praca-pedagio-{y}_mensal_consolidado.csv", sep=";",
                        encoding="latin1", dtype=str)
        L.append(d)
    V = pd.concat(L, ignore_index=True)
    V["v"] = V.volume_total.map(num).fillna(0.0)
    V["ym"] = V.mes_ano.str.strip().str[-7:].map(lambda s: f"{s[3:7]}-{s[0:2]}")
    tv = V.tipo_de_veiculo.str.strip().str.capitalize()
    V["tv"] = tv.replace({"Veículo pequeno": "Passeio"})
    eix = V.categoria_eixo.str.extract(r"(\d+)")[0].astype(float)
    eix[V.categoria_eixo.str.contains("moto", case=False, na=False)] = 2
    V["eixos"] = eix
    V["key"] = [ent_of(c) or norm(c) for c in V.concessionaria]
    V["pn"] = V.praca.map(norm)
    return V


def _pcode(s):
    m = re.search(r"\bP\s?0?(\d+)\b", s)
    return m.group(1) if m else None


def _match_names(pairs, cad_by_key):
    """{(key, pn) → índice do cadastro}: exato, código P único ou difflib (≥ 0,6)."""
    import difflib
    out = {}
    for key, pn in pairs:
        c = cad_by_key.get(key, [])
        cid = next((i for i, n in c if n == pn), None)
        if cid is None:
            pc = _pcode(pn)
            cc = [i for i, n in c if pc and _pcode(n) == pc]
            if len(cc) == 1:
                cid = cc[0]
        if cid is None and c:
            best = difflib.get_close_matches(pn, [n for _, n in c], n=1, cutoff=0.6)
            if best:
                cid = next(i for i, n in c if n == best[0])
        if cid is not None:
            out[(key, pn)] = cid
    return out


def build_pracas():
    import pandas as pd
    S = snv()
    cad = pd.read_csv(RAW / "praca" / "dados-dos-pracas-de-pedagio6_2026.csv", sep=";", encoding="latin1", dtype=str)
    cad = cad.fillna("")
    # --- linhas de saída: cada registro do cadastro, exceto os pares free flow da RIOSP (um por pórtico de entrada)
    grupos, gid_of = [], {}
    for i, r in cad.iterrows():
        e = ent_of(r.concessionaria)
        pk = pfe_key(r.praca_de_pedagio) if e == "rio-sp" else None
        g = (e, pk) if pk else ("cad", i)
        if g not in gid_of:
            gid_of[g] = len(grupos)
            nome = r.praca_de_pedagio.strip()
            if pk:
                sent = re.search(r"\b(Norte|Sul)\s*$", nome)
                nome = f"Free Flow {pk}{' ' + sent.group(1) if sent else ''} (pórtico de entrada)"
            grupos.append({"nome": nome, "ent": e, "conc": r.concessionaria.strip(), "rod": r.rodovia, "uf": r.uf,
                           "km": num(r.km_m), "lat": num(r.latitude), "lon": num(r.longitude), "cids": []})
        grupos[gid_of[g]]["cids"].append(i)
    grp_of_cid = {c: k for k, g in enumerate(grupos) for c in g["cids"]}

    # --- volumes 2024–26 → grupo
    V = _load_volumes()
    cad_by_key = defaultdict(list)
    for i, r in cad.iterrows():
        cad_by_key[ent_of(r.concessionaria) or norm(r.concessionaria)].append((i, norm(r.praca_de_pedagio)))
    pairs = V[["key", "pn"]].drop_duplicates().itertuples(index=False, name=None)
    mt = _match_names(list(pairs), cad_by_key)
    V["g"] = [grp_of_cid.get(mt.get((k, p))) for k, p in zip(V.key, V.pn)]
    V = V[V.g.notna()].copy()
    V["g"] = V.g.astype(int)
    V["cls"] = V.tv.map({"Passeio": "l", "Moto": "m", "Comercial": "p"}).fillna("p")
    mon = V.groupby(["g", "ym", "cls"]).v.sum().unstack(fill_value=0.0)
    for c in "lmp":
        if c not in mon:
            mon[c] = 0.0
    com = V[V.cls == "p"]
    y25 = com[com.ym.str[:4] == "2025"]
    eix = (y25.eixos * y25.v).groupby(y25.g).sum() / y25.v.groupby(y25.g).sum()

    # --- receita 2025 → grupo (nome; senão coordenada a ≤ 1 km na mesma concessionária)
    R = pd.read_csv(RAW / "receita-por-praca" / "receita_por_praca_2025.csv", sep=";", encoding="latin1", dtype=str)
    R["key"] = [ent_of(c) or norm(c) for c in R.Concessionaria]
    R["pn"] = R.Praca_de_pedagio.map(norm)
    R["v"] = R.Receita_Praca_de_Pedagio.map(num).fillna(0.0)
    mr = _match_names(list(R[["key", "pn"]].drop_duplicates().itertuples(index=False, name=None)), cad_by_key)
    rec = defaultdict(float)
    for key, pn, la, lo, v in zip(R.key, R.pn, R.Latitude, R.Longitude, R.v):
        cid = mr.get((key, pn))
        if cid is None:
            la, lo = num(la), num(lo)
            if la is None:
                continue
            cands = [(abs(grupos[grp_of_cid[i]]["lat"] - la) + abs(grupos[grp_of_cid[i]]["lon"] - lo), i)
                     for i, _ in cad_by_key.get(key, [])]
            cands = [c for c in cands if c[0] < 0.01]
            if not cands:
                continue
            cid = min(cands)[1]
        rec[grp_of_cid[cid]] += v

    # --- linhas
    linhas, sl, sp, ncad = [], [], [], []
    for k, g in enumerate(grupos):
        br, _ = split_rod(g["rod"])
        fis = None
        if br and br.startswith("BR") and g["lat"] is not None:
            fis, _ = S.snap(g["lon"], g["lat"], max_m=SNAP_M, br=br)
        m25 = [ym for ym in MESES if ym[:4] == "2025" and (k, ym) in mon.index]
        vmd = leves = pes = moto = eixos = None
        if m25:
            dd = sum(days(ym) for ym in m25)
            tl, tm, tp = (sum(mon.loc[(k, ym), c] for ym in m25) for c in "lmp")
            leves, moto, pes = round(tl / dd), round(tm / dd), round(tp / dd)
            vmd = round((tl + tm + tp) / dd)
            eixos = round(float(eix[k]), 1) if k in eix.index and eix[k] == eix[k] else None
        receita = int(round(rec[k])) if rec.get(k) else None
        linhas.append([g["nome"], g["ent"], g["conc"], br, g["uf"] or None, ci(g["km"]), r5(g["lat"]), r5(g["lon"]),
                       None if fis is None else int(fis), vmd, leves, pes, moto, eixos, receita, len(m25) or None])
        sl.append([round((mon.loc[(k, ym), "l"] + mon.loc[(k, ym), "m"]) / days(ym)) if (k, ym) in mon.index
                   else None for ym in MESES])
        sp.append([round(mon.loc[(k, ym), "p"] / days(ym)) if (k, ym) in mon.index else None for ym in MESES])
        ncad.append(len(g["cids"]))
    return {"tipo": "medido",
            "campos": ["nome", "ent", "conc", "br", "uf", "km", "lat", "lon", "fis", "vmd", "leves", "pesados", "moto",
                       "eixos", "receita", "meses"],
            "linhas": linhas, "n_cadastro": ncad, "serie_meses": MESES, "serie_l": sl, "serie_p": sp}


# ============================================================ SATs

SAT_ANO = 2025
SAT_JANELA = ("2025-09", "2026-08")  # últimos 12 meses publicados: reserva para SATs com < 6 meses em 2025
SAT_MIN_MESES, SAT_MAX_NI, SAT_MIN_VMD = 6, 0.30, 100


def sat_periodo(meses):
    """Meses 'AAAA-MM' de um SAT → (rótulo, meses usados) ou None: 2025 se tiver ≥ 6 meses; senão a janela
    2025-09..2026-08 se tiver ≥ 6 meses nela (Ecovias Rio Minas, Elovias e Concebra começam depois de 2025)."""
    m25 = sorted(m for m in meses if m[:4] == str(SAT_ANO))
    if len(m25) >= SAT_MIN_MESES:
        return str(SAT_ANO), m25
    mw = sorted(m for m in meses if SAT_JANELA[0] <= m <= SAT_JANELA[1])
    if len(mw) >= SAT_MIN_MESES:
        return f"{SAT_JANELA[0]}/{SAT_JANELA[1]}", mw
    return None


def build_sats():
    import pandas as pd
    S = snv()
    D = pd.concat([pd.read_csv(f, sep=";", encoding="latin1", dtype=str) for f in sat_files()], ignore_index=True)
    D["ym"] = D.data_de_passagem.str.strip().str[-7:].map(lambda s: f"{s[3:7]}-{s[0:2]}")
    D = D[(D.ym >= f"{SAT_ANO}-01") & (D.ym <= SAT_JANELA[1])].copy()
    D["key"] = [ent_of(c) or norm(c) for c in D.concessionaria]
    D["identificador"] = D.identificador.str.strip()
    # arquivos sobrepostos (MSVIA = PANTANAL, CRO = NOVA ROTA DO OESTE, recurso sem nome com 3 concessionárias)
    D = D.drop_duplicates(["key", "identificador", "ym", "sentido_da_passagem", "faixa_da_passagem",
                           "faixa_de_velocidade", "tipo_de_veiculo"])
    D["v"] = D.volume_total.map(num).fillna(0.0)
    D["cls"] = D.tipo_de_veiculo.map(norm).map({"VEICULO LEVE": "l", "VEICULO PESADO": "p", "MOTO": "m"}).fillna("ni")
    ents = set(NAMEMAP.values())
    linhas = []
    for (key, ident), g in D.groupby(["key", "identificador"]):
        per = sat_periodo(set(g.ym))
        if per is None:
            continue
        rot, ms = per
        g = g[g.ym.isin(ms)]
        t = g.groupby("cls").v.sum()
        l, p, m, ni = (float(t.get(c, 0.0)) for c in ("l", "p", "m", "ni"))
        alln, idn = l + p + m + ni, l + p + m
        if not idn:
            continue
        vmd = alln / sum(days(x) for x in ms)
        if ni / alln > SAT_MAX_NI or vmd < SAT_MIN_VMD:
            continue
        coord = g.groupby(["latitude", "longitude"]).size().idxmax()
        lat, lon = num(coord[0]), num(coord[1])
        br, uf = split_rod(g.rodovia.iloc[0])
        uf = g.uf.dropna().str.strip().mode().iloc[0] if g.uf.notna().any() else uf
        fis = snap_ponto(S, lon, lat, g.rodovia.iloc[0])
        conc = g.concessionaria.str.strip().mode().iloc[0]
        linhas.append([ident, conc, key if key in ents else None, br, uf, r5(lat), r5(lon),
                       fis, round(vmd), ci(round(p / idn, 3)), ci(round(m / idn, 3)),
                       len(ms), rot])
    return {"tipo": "medido", "ano": SAT_ANO,
            "campos": ["id", "conc", "ent", "br", "uf", "lat", "lon", "fis", "vmd", "pes", "moto", "meses", "periodo"],
            "linhas": linhas}


# ============================================================ obras

def _read_acomp():
    """CSV cp1252 com uma linha que tem ';' a mais na descrição: junta os campos excedentes na descrição."""
    import csv
    import io
    txt = (RAW / "acompanhamento-anual" / "acompanhamento-anual-investimentos.csv").read_bytes().decode("cp1252")
    rd = csv.reader(io.StringIO(txt), delimiter=";")
    head = next(rd)
    n, idesc = len(head), head.index("descricao")
    out = []
    for row in rd:
        if not row:
            continue
        if len(row) > n:
            extra = len(row) - n
            row = row[:idesc] + [";".join(row[idesc:idesc + extra + 1])] + row[idesc + extra + 1:]
        if len(row) == n:
            out.append(dict(zip(head, row)))
    return out


def _orient(S, j, t):
    """True se o 1º vértice do físico j fica no km inicial do trecho t (pelo vizinho anterior/seguinte)."""
    from shapely.geometry import Point
    pts = S.points(j)
    a, b = Point(*S.to_m(*pts[0])), Point(*S.to_m(*pts[-1]))
    for km, start in ((t["km_ini"] - 0.05, True), (t["km_fim"] + 0.05, False)):
        nb = [S.trechos[i]["fis"] for i in S.find_km(t["br"], t["uf"], km) if S.trechos[i]["fis"] != j]
        if nb:
            g = S.geom_m(nb[0])
            return (g.distance(a) <= g.distance(b)) == start
    return None


def point_at_km(S, j, t, km):
    """(lon, lat) do km no físico j (trecho t); sem orientação conhecida, o meio do físico."""
    from shapely.geometry import LineString
    pts = S.points(j)
    line = LineString(pts if len(pts) > 1 else pts * 2)
    ori = _orient(S, j, t)
    span = t["km_fim"] - t["km_ini"]
    if ori is None or span <= 0 or km is None:
        p = line.interpolate(0.5, normalized=True)
    else:
        f = min(max((km - t["km_ini"]) / span, 0.0), 1.0)
        p = line.interpolate(f if ori else 1 - f, normalized=True)
    return p.x, p.y


def build_obras():
    S = snv()
    rows = _read_acomp()
    last = {}
    for r in rows:
        k = (norm(r["concessionaria"]), r["id_sigicor"].strip())
        rank = (int(r["ano_do_planejamento"] or 0), int(r["versao"] or 0), r["data_do_planejamento"])
        if k not in last or rank >= last[k][0]:
            last[k] = (rank, r)
    linhas = []
    ordem = sorted(last.values(), key=lambda x: (norm(x[1]["concessionaria"]), x[1]["rodovia"],
                                                 num(x[1]["km_Inicial"]) or 0))
    for rank, r in ordem:
        br, uf = split_rod(r["rodovia"])
        ki, kf = num(r["km_Inicial"]), num(r["km_Final"])
        fis = lat = lon = None
        if br and br.startswith("BR") and uf and ki is not None:
            c = S.find_km(br, uf, ki) or S.find_km(br, uf, ki, tol=0.5)
            if c:
                t = S.trechos[c[0]]
                fis = t["fis"]
                lon, lat = point_at_km(S, fis, t, ki)
        ant, prev, acum = (num(r[c]) for c in ("executado_acumulado_anterior", "previsto_anual",
                                               "executado_acumulado_anterior_executado_anual"))
        previsto = None if prev is None else round(min(1.0, ((ant or 0) + prev) / 100), 3)
        executado = None if acum is None else round(min(1.0, acum / 100), 3)
        desc = re.sub(r"\s+", " ", r["descricao"]).strip()
        if len(desc) > DESC_MAX:
            desc = desc[:DESC_MAX - 1].rstrip() + "…"
        if kf is not None and ki is not None and kf == 0 and ki > 0:
            kf = None  # km final "0" com km inicial > 0 é campo vazio preenchido com zero
        linhas.append([ent_of(r["concessionaria"]), desc or None, r["tipo"].strip() or None, br, uf, ci(ki), ci(kf),
                       fis, rank[0], ci(previsto), ci(executado), r5(lat), r5(lon)])
    return {"tipo": "medido",
            "campos": ["ent", "descricao", "tipo", "br", "uf", "km_i", "km_f", "fis", "ano", "previsto", "executado",
                       "lat", "lon"],
            "linhas": linhas}


# ============================================================ build

def fontes():
    man = {i["arquivo"]: i for i in (Manifest("antt").items or [])}

    def acesso(*arqs):
        ds = [man[a]["acesso"] for a in arqs if a in man]
        return min(ds) if ds else dt.date.today().isoformat()

    def ds(slug):
        m = ckan_meta(slug) or {}
        return f"https://dados.antt.gov.br/dataset/{m.get('name', slug)}"

    rp = "data/raw/antt/"
    return [
        {"nome": "ANTT — Praças de pedágio (cadastro) e volume de tráfego por praça",
         "url": ds("volume-trafego-praca-pedagio"),
         "periodo": "2024-01 a 2026-08", "acesso": acesso(rp + "praca/dados-dos-pracas-de-pedagio6_2026.csv"),
         "licenca": LICENCA,
         "nota": "Mensal consolidado. VMD 2025 = soma dos dois sentidos ÷ dias dos meses com dado; leves = Passeio, "
                 "pesados = Comercial (inclui ônibus), moto à parte. Pares free flow da RIOSP agregados no pórtico de "
                 "entrada. Snap ao SNV ≤ 500 m na mesma BR."},
        {"nome": "ANTT — Receita por praça de pedágio", "url": ds("receita-por-praca"), "periodo": "2025",
         "acesso": acesso(rp + "receita-por-praca/receita_por_praca_2025.csv"), "licenca": LICENCA,
         "nota": "R$ nominais, soma dos meses de 2025."},
        {"nome": "ANTT — Tráfego nos equipamentos de contagem (SAT)", "url": ds("volume-sat"), "periodo": "2025",
         "acesso": acesso(*[str(f.relative_to(ROOT)) for f in sat_files()]), "licenca": LICENCA,
         "nota": "Mensal consolidado; deduplicado por (entidade, SAT, mês, sentido, faixa, velocidade, tipo). VMD = "
                 "todos os tipos ÷ dias dos meses com dado; % pesados e moto sobre os identificados. Excluídos SATs "
                 "com < 6 meses, > 30% não identificado ou VMD < 100; SAT com < 6 meses em 2025 usa 2025-09..2026-08 "
                 "(campo periodo). Snap ≤ 500 m na mesma BR; acessos/alças (rodovia fora do SNV) ≤ 100 m de qualquer "
                 "físico, com o código do acesso em br. O sentido não é confiável como cobertura."},
        {"nome": "ANTT — Capas das concessões rodoviárias", "url": GOVBR, "periodo": "out/2026",
         "acesso": acesso(rp + "capas/lista.html"), "licenca": "Conteúdo público gov.br",
         "nota": "36 ativas e 10 encerradas; datas em AAAA-MM-DD quando legíveis. Encerradas apontam o sucessor."},
        {"nome": "ANTT — Receita de pedágio, investimentos e custos operacionais", "url": ds("receita-pedagio"),
         "periodo": "2010-2025",
         "acesso": acesso(rp + "receita-pedagio/receita_de_pedagio.csv", rp + "investimentos/investimentos.csv",
                          rp + "custos-operacionais/custos_operacionais.csv"),
         "licenca": LICENCA, "nota": "R$ nominais por concessão e ano; ausente = null."},
        {"nome": "ANTT — Acompanhamento anual de investimentos", "url": ds("acompanhamento-anual"),
         "periodo": "planejamentos 2023-2026",
         "acesso": acesso(rp + "acompanhamento-anual/acompanhamento-anual-investimentos.csv"), "licenca": LICENCA,
         "nota": "Última versão por (concessionária, id SIGICOR). previsto = acumulado anterior + previsto no ano; "
                 "executado = acumulado executado (fração 0–1, físico). Ponto interpolado no físico pelo km inicial."},
    ]


def build(out=OUT):
    data = {"fonte": fontes(), "pracas": build_pracas(), "sats": build_sats(), "capas": build_capas(),
            "series": build_series(), "obras": build_obras()}
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    return data


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "all"
    if cmd in ("fetch", "all"):
        fetch()
    if cmd in ("build", "all"):
        d = build()
        print(f"{OUT.relative_to(ROOT)}: {OUT.stat().st_size / 1024:.0f} KB; praças {len(d['pracas']['linhas'])}, "
              f"SATs {len(d['sats']['linhas'])}, capas {len(d['capas'])}, séries {len(d['series'])}, "
              f"obras {len(d['obras']['linhas'])}")
