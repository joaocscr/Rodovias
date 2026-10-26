"""Malha rodoviária estadual e concessões estaduais.

Malha: Infra S.A., camada `Hosted/Rodovias_Estaduais` (CIDE 2021 + Base DNIT 2002 nas UFs sem cadastro). A camada
`Rodovias_Estaduais` (ano-base 2024) não respondeu a nenhuma consulta no recon; a cópia hospedada traz as mesmas UFs.
Ficam fora: feições federais (código com "B" na 4ª posição ou jurisdição Federal), feições sem UF e feições com mais de
80% do comprimento a até 55 m de um físico do SNV (as coincidentes, ex. RSC-287 sobre a BR-287 planejada). Entram as
pavimentadas (PAV, DUP, EOP) e qualquer outra feição usada por uma concessão estadual. Geometria simplificada
(Douglas-Peucker 0,0003°) e codificada como o SNV (`snvbase.encode_line`).

Concessões estaduais (`entidades`, com `entEst`/`entFis`/`entGeo` paralelos):
- SP: fichas ARTESP (controlador, início, prazo, km, capex, trechos com km) + pasta "Traçado" dos KMZ do portal de dados abertos da ARTESP;
  ViaRondon (l19) e Rota Mogiana (sem KMZ) por rodovia + km na malha SP; Via SP Serra pelos "Ativos Lineares" do l26.
- RS: códigos SRE dos trechos da AGERGS (XLSX); partes RSC/BRS também como físicos do SNV.
- MT: tabela "Rodovias Pedagiadas" da Ager-MT (rodovias + municípios) recortada pelos polígonos municipais do IBGE.
- MG, MS, BA, PA, PE, RJ, PI: fichas ABCR (complementar) e curadoria; BRs delegadas pelo SNV (adm. estadual/convênio).
Só é `vigente` a concessão com assinatura, início de operação ou contrato identificado. Datas incoerentes da ABCR
(assinatura depois do início; fim que não confere com assinatura/início + prazo, ± 1 ano) são descartadas com nota; datas
de fim estimadas não são gravadas.
Qualidade: `ok` se |km_map − km_decl| ≤ 10% ou ≤ 10 km; `aproximado` até 35% ou quando o recorte é por rodovia
inteira (ou por município); senão `nao_mapeado`, sempre com nota.

    python scripts/intel/estaduais.py [fetch|build|all]
"""
import datetime as dt
import html as htmlmod
import json
import math
import re
import sys
import time
import unicodedata
import zipfile
from collections import defaultdict
from pathlib import Path
import xml.etree.ElementTree as ET

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from intel.fontes import RAW, ROOT, Manifest, fetch as _fetch  # noqa: E402
from intel.snvbase import decode_line, encode_line, snv  # noqa: E402

DIR = RAW / "estaduais"
PAGES = DIR / "infrasa" / "hosted_pages"
OUT = ROOT / "data" / "intel" / "estaduais.json"
MUNICIPIOS = ROOT / "data" / "intel" / "municipios.json"

INFRA_URL = ("https://geo.infrasa.gov.br/server/rest/services/Hosted/Rodovias_Estaduais/FeatureServer/0/query"
             "?where=1%3D1&outFields=*&orderByFields=fid&resultOffset={off}&resultRecordCount=2000&outSR=4326&f=geojson")
INFRA_LAYER = "https://geo.infrasa.gov.br/server/rest/services/Hosted/Rodovias_Estaduais/FeatureServer/0"
ARTESP_CKAN = "https://dadosabertos.artesp.sp.gov.br/dataset/malha-rodoviaria"
ARTESP_RES = "https://dadosabertos.artesp.sp.gov.br/dataset/d60ee312-79b7-4d2c-9049-a1777ef1d377/resource/{}/download/{}"
ARTESP_KMZ = {
    "l01": "b3e0ca4a-fcd2-4d2b-9c5b-28f16f8d119e", "l06": "e03b2b0d-059f-4f21-8c61-0e2254372a7b",
    "l07": "c99ae83e-baaf-4150-82d0-5c88e2992791", "l11": "2eb11203-6ada-434b-9179-8eb933f01634",
    "l13": "92e279f4-f80b-4500-9d78-7b2ea206f116", "l16": "bd5c740f-d117-45e2-9927-36b89cdfe8c2",
    "l19": "568bd8d4-66f9-4bb3-acba-e89d52480d1d", "l20": "5fd8fe8f-e122-4170-ba93-a6b93ace1389",
    "l21": "baf90801-af68-45b8-abbb-3541e0cd9b49", "l22": "0ce6a39a-f83d-4622-9245-025a7d3c15c0",
    "l23": "e2763c68-6856-4537-a004-f1960d52c31b", "l24": "a7d37c93-f612-439a-b1af-b809ae71c1b8",
    "l25": "364f9ddf-bb1d-4853-a3c9-7e3f0cf2c78f", "l26": "92027973-48ce-406c-ac92-72258fb894e5",
    "l27": "fc9d9621-2cd3-435b-9903-60435eda73bb", "l28": "0d32e861-63bf-4c21-9cea-8b388a718763",
    "l29": "0006bf89-9366-4a6d-943c-4975d0216fc0", "l30": "2b1728ba-6c29-4c7b-a04d-ac823286804c",
    "l31": "96823d5d-f015-47ee-9c52-ddd079e2937a", "l32": "932b32a6-2b22-4bdf-bf51-3c398fe94df7",
    "l33": "f011fa3c-a0b4-43d0-b1ff-571c6cb3044a", "l34": "4e764449-5859-44d2-ac81-945a76e8ca56",
    "l35": "cb23e58e-bae1-4764-9600-805bf2ee0edf",
}
ARTESP_FICHA = "https://www.artesp.sp.gov.br/artesp/setor-regulado/rodovia/concessionarias/{}"
AGERGS_PAGE = "https://agergs.rs.gov.br/rodovias-concedidas"
AGERGS_XLSX = "https://agergs.rs.gov.br/upload/arquivos/202404/28221449-trechos-rsm-e-csg.xlsx"
ABCR_API = "https://melhoresrodovias.org.br/wp-json/wp/v2/cadastro-concessiona?per_page=100"
ABCR_TAX = "https://melhoresrodovias.org.br/wp-json/wp/v2/{}?per_page=100"
ABCR_LISTA = "https://melhoresrodovias.org.br/concessoes/"
AGER_MT = "https://www.ager.mt.gov.br/rodovias-pedagiadas"
CHROME_UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"

BUF_M = 55            # buffer sobre o SNV (≈ 0,0005°, como no protótipo est_coinc.py)
FRAC_MAX = 0.8        # acima disso a feição é coincidente com o SNV
DP = 0.0003           # simplificação da geometria publicada (graus)
DP_MED = 0.0001       # simplificação para medir sobreposição e comprimento
R_CORR = 100          # pistas a até 100 m contam uma vez no comprimento do Traçado KMZ
PAVIMENTADAS = {"PAV", "DUP", "EOP"}
BRASIL = (-75.0, -35.0, -28.0, 6.0)
ADM_ESTADUAL = {"Convênio Adm.Federal/Estadual", "Estadual"}
UFS = ("AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI",
       "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO")


# ====================================================================================================== fetch

def _ok_html(path, marca):
    try:
        return marca in Path(path).read_text(encoding="utf-8", errors="replace")
    except OSError:
        return False


MARCA_FICHA = "Topo e base"        # rótulo que o leitor da ficha usa; a página de bloqueio do site não o tem
PAUSAS_FICHA = (10, 30, 60)       # segundos antes de cada nova tentativa; o site limita pedidos em sequência
PAUSA_ENTRE_FICHAS = 3


def baixar_ficha(url, dest, marca=MARCA_FICHA, pausas=PAUSAS_FICHA, baixar=None, dormir=None):
    """Baixa a ficha para um arquivo temporário e só a aceita se trouxer `marca` (o site responde HTTP 200 com uma página
    de bloqueio quando limita os pedidos). Tenta de novo depois de cada pausa de `pausas`. Aceita: troca o arquivo e
    devolve True. Falha: o arquivo anterior fica como estava e devolve False."""
    baixar, dormir = baixar or _fetch, dormir or time.sleep
    dest = Path(dest)
    novo = dest.with_name(dest.name + ".novo")
    for k in range(len(pausas) + 1):
        novo.unlink(missing_ok=True)
        try:
            baixar(url, novo, tries=2, extra=("-A", CHROME_UA), force=True)   # Incapsula exige UA de navegador
        except RuntimeError:
            pass
        if _ok_html(novo, marca):
            novo.replace(dest)
            return True
        novo.unlink(missing_ok=True)
        if k < len(pausas):
            dormir(pausas[k])
    return False


def fetch(force=False):
    """Baixa o que falta em data/raw/estaduais/ e registra tudo no manifesto (não rebaixa o que existe; com `force`,
    baixa tudo de novo)."""
    m = Manifest("estaduais")
    off = 0
    while True:  # Infra S.A.: páginas de 2000 feições até a última incompleta
        dest = PAGES / f"p_{off:06d}.geojson"
        url = INFRA_URL.format(off=off)
        _fetch(url, dest, timeout=300, force=force)
        m.add(url, dest, f"Infra S.A. Hosted/Rodovias_Estaduais, feições {off}–{off + 1999} (GeoJSON, EPSG:4326)",
              periodo="CIDE 2021 / Base DNIT 2002", licenca="Dado público federal (Infra S.A.)")
        n = dest.read_text(encoding="utf-8").count('"geometry":')
        if n < 2000:
            break
        off += 2000
    for lote, rid in ARTESP_KMZ.items():
        url = ARTESP_RES.format(rid, f"{lote}.kmz")
        dest = _fetch(url, DIR / "artesp" / "dl" / f"{lote}.kmz", force=force)
        m.add(url, dest, f"ARTESP — KMZ do lote {lote[1:]} (CKAN malha-rodoviaria)", periodo="2026",
              licenca="CC-BY (portal de dados abertos da ARTESP)")
    sem_ficha = []
    for slug, *_ in SP:
        dest = DIR / "artesp" / "fichas" / f"{slug}.html"
        url = ARTESP_FICHA.format(slug)
        if force or not _ok_html(dest, MARCA_FICHA):
            ok = baixar_ficha(url, dest)
            if not ok:
                print(f"aviso: a ficha ARTESP {slug} não veio ({'o arquivo anterior fica' if _ok_html(dest, MARCA_FICHA) else 'sem arquivo válido'}); "
                      "o site pode ter bloqueado o pedido")
            time.sleep(PAUSA_ENTRE_FICHAS)
        if _ok_html(dest, MARCA_FICHA):
            m.add(url, dest, f"ARTESP — ficha da concessionária {slug}", periodo="2026", licenca="Página pública ARTESP")
        else:
            sem_ficha.append(slug)
    for url, dest, desc in ((AGERGS_XLSX, DIR / "agergs" / "trechos-rsm-e-csg.xlsx", "AGERGS — trechos SRE RSC-287 e Bloco 3"),
                            (AGERGS_PAGE, DIR / "agergs" / "rodovias-concedidas.html", "AGERGS — rodovias concedidas"),
                            (AGER_MT, DIR / "mt" / "ager_rodovias_pedagiadas.html", "Ager-MT — rodovias pedagiadas")):
        _fetch(url, dest, extra=("-A", CHROME_UA), force=force)
        m.add(url, dest, desc, periodo="2026", licenca="Página pública do regulador estadual")
    accept = ("-H", "Accept: text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8")
    api = _fetch(ABCR_API, DIR / "abcr" / "api_conc.json", extra=accept, force=force)
    m.add(ABCR_API, api, "ABCR — lista de fichas de concessionárias (API WordPress)", periodo="2026",
          licenca="Página pública ABCR")
    for t in ("atuacao", "categoria", "estado"):
        dest = _fetch(ABCR_TAX.format(t), DIR / "abcr" / f"tax_{t}.json", extra=accept, force=force)
        m.add(ABCR_TAX.format(t), dest, f"ABCR — taxonomia {t}", periodo="2026", licenca="Página pública ABCR")
    for e in json.loads(api.read_text(encoding="utf-8")):
        dest = DIR / "abcr" / "fichas" / f"{e['slug']}.html"
        if force or not dest.exists():
            _fetch(e["link"], dest, extra=accept, force=force)
            time.sleep(1)
        m.add(e["link"], dest, f"ABCR — ficha {e['slug']}", periodo="2026", licenca="Página pública ABCR")
    m.save()
    if sem_ficha:
        raise RuntimeError(f"fichas ARTESP sem conteúdo válido (bloqueio do site?): {', '.join(sem_ficha)}; rode de novo "
                           "com --baixar mais tarde")
    return m


# ====================================================================================================== utilidades

def _limpa(v):
    return re.sub(r"\s+", " ", str(v or "")).strip()


def _sem_acento(s):
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn").lower().strip()


def _num(x, nd=2):
    if x is None:
        return None
    v = round(float(x), nd)
    return int(v) if v == int(v) else v


def _float_br(s):
    """'4,700' → 4.7; '1.273' → 1273 (ponto de milhar); '158.' → 158."""
    s = s.strip().rstrip(".,")
    if "," in s or re.fullmatch(r"\d{1,3}(\.\d{3})+", s):
        s = s.replace(".", "").replace(",", ".")
    return float(s)


def via_de(uf, rod, sre):
    rod = _limpa(rod)
    if not rod.isdigit() and (sre or "")[:3].isdigit():
        rod = sre[:3]
    return f"{uf}-{int(rod):03d}" if rod.isdigit() else rod


def e_federal(pr):
    for k in ("codigo_snv", "codigo_sre"):
        c = _limpa(pr.get(k))
        if len(c) >= 4 and c[3] == "B":
            return True
    return _limpa(pr.get("jurisdicao")) == "Federal"


def qualidade(km_map, km_decl, inteira):
    """ok ≤ 10% ou ≤ 10 km; aproximado ≤ 35% ou recorte por rodovia inteira; senão nao_mapeado."""
    if not km_map or not km_decl:
        return "nao_mapeado"
    d = abs(km_map - km_decl)
    if d <= 0.10 * km_decl or d <= 10:
        return "aproximado" if inteira else "ok"
    if d <= 0.35 * km_decl or inteira:
        return "aproximado"
    return "nao_mapeado"


def _somar_intervalos(iv):
    """Comprimento da união de intervalos [(a, b)]."""
    tot, fim = 0.0, None
    for a, b in sorted(iv):
        if fim is None or a > fim:
            tot += b - a
            fim = b
        elif b > fim:
            tot += b - fim
            fim = b
    return tot


def _mes_ano(s):
    m = re.search(r"(\d{2})/(\d{4})", s or "")
    return f"{m.group(2)}-{m.group(1)}" if m else None


def _data_br(s):
    m = re.search(r"(\d{2})/(\d{2})/(\d{4})", s or "")
    return f"{m.group(3)}-{m.group(2)}-{m.group(1)}" if m else None


def _anos(s):
    m = re.search(r"(\d+(?:[.,]\d+)?)\s*anos", s or "", re.I)
    return float(m.group(1).replace(",", ".")) if m else None


def _somar_anos(ini, anos):
    """'2023-05' ou '2023-05-01' + 30 anos → mesmo formato."""
    if not ini or not anos:
        return None
    p = ini.split("-")
    meses = int(p[0]) * 12 + int(p[1]) - 1 + round(anos * 12)
    out = f"{meses // 12:04d}-{meses % 12 + 1:02d}"
    return out + (f"-{p[2]}" if len(p) == 3 else "")


def _html_linhas(s):
    t = re.sub(r"<script.*?</script>|<style.*?</style>", "", s, flags=re.S)
    t = re.sub(r"<br\s*/?>", "\n", t)
    txt = htmlmod.unescape(re.sub(r"<[^>]+>", "\n", t)).replace("​", "")
    txt = re.sub(r"[ \t\xa0]+", " ", txt)
    return [ln.strip() for ln in txt.split("\n") if ln.strip()]


# ====================================================================================================== ARTESP

RE_ROD_SP = re.compile(r"^\s*(SP[AIDM]?)\s*-?\s*(\d{1,3})(?:\s*/\s*(\d{1,3}))?", re.I)
RE_KM = re.compile(r"km\s*([\d.,]+)\s*(?:ao|até o|até|a|e)\s*(?:km\s*)?([\d.,]+\d)", re.I)


def parse_trecho_artesp(txt):
    """'SP 147 - ... - Do km 41,36 ao km 60,7 / Do km 62,450 ao km 106,32' → [('SP-147', 41.36, 60.7), ...]."""
    m = RE_ROD_SP.match(txt)
    if not m:
        return []
    pre = m.group(1).upper()
    rod = f"{pre}-{m.group(2).zfill(3)}" + (f"/{m.group(3).zfill(3)}" if m.group(3) else "")
    out = []
    for a, b in RE_KM.findall(txt[m.end():]):
        try:
            out.append((rod, _float_br(a), _float_br(b)))
        except ValueError:
            pass
    return out


def parse_ficha_artesp(path):
    """Bloco 'LT.xx' da ficha da concessionária (porta do protótipo artesp_ficha.py)."""
    L = _html_linhas(Path(path).read_text(encoding="utf-8", errors="replace"))
    M = []
    for ln in L:  # rótulo e ': valor' às vezes vêm em linhas separadas
        if ln.startswith(":") and M:
            M[-1] += ln
        else:
            M.append(ln)
    i = next((k for k, ln in enumerate(M) if ln == "Topo e base"), None)
    if i is None or i + 1 >= len(M):
        return None
    chaves = {"Empresa(s) Controladora(s)": "controlador", "Empresa Controladora": "controlador",
              "Início da Concessão": "inicio", "Prazo da Concessão": "prazo", "Extensão": "extensao",
              "Principais Rodovias": "rodovias", "Rodovias": "rodovias"}
    out = {"lote_titulo": M[i + 1]}
    cur = None
    for ln in M[i + 2:]:
        if ln.startswith("Site da Concession") or ln == "Visualizador do Conteúdo da Web" or ln.startswith("Z7_"):
            break
        key = next((v for k, v in chaves.items() if ln.startswith(k)), None)
        if key is None and ln.startswith("Investimentos"):
            key = "investimentos"
            out["investimentos_ref"] = ln
        if key:
            cur = key
            rest = ln.split(":", 1)[1].strip() if ":" in ln else ""
            out.setdefault(cur, [])
            if rest:
                out[cur].append(rest)
        elif cur:
            out[cur].append(ln)
    if "rodovias" not in out:
        return None
    for k in list(out):
        if isinstance(out[k], list) and k != "rodovias":
            out[k] = " ".join(out[k])
    m = re.search(r"([\d.,]+)\s*km", out.get("extensao", ""))
    out["km"] = _float_br(m.group(1)) if m else None
    m = re.search(r"R\$\s*([\d.,]+)\s*(bilh|milh)", out.get("investimentos", ""))
    out["capex_bi"] = (_float_br(m.group(1)) / (1 if m.group(2) == "bilh" else 1000)) if m else None
    m = re.search(r"ref\.?\s*(\d{4})", out.get("investimentos_ref", ""), re.I)
    out["capex_ref"] = m.group(1) if m else None
    ini = out.get("inicio", "")
    out["inicio_mes"] = _mes_ano(ini)
    out["anos"] = _anos(out.get("prazo")) or _anos(ini)
    m = re.search(r"T[ée]rm\w*\s+da\s+Concess\w*:?\s*(\d{2}/\d{4})", ini)
    out["termino"] = _mes_ano(m.group(1)) if m else None
    out["trechos"] = [t for r in out["rodovias"] for t in parse_trecho_artesp(r)]
    out["rods"] = []
    for r in out["rodovias"]:
        m = RE_ROD_SP.match(r)
        if m:
            rod = f"{m.group(1).upper()}-{m.group(2).zfill(3)}" + (f"/{m.group(3).zfill(3)}" if m.group(3) else "")
            if rod not in out["rods"]:
                out["rods"].append(rod)
    return out


# ------------------------------------------------------------------ KMZ

def _strip(tag):
    return tag.rsplit("}", 1)[-1]


def _kml_root(raw):
    """Corrige os KML quebrados da ARTESP (namespace inválido no l22, prefixo não declarado no l29)."""
    raw = re.sub(rb'(xmlns:\w+=)"\{[^"]*\}"', rb'\1"urn:x-bad"', raw, count=5)
    usados = set(re.findall(rb"</?([A-Za-z_][\w.-]*):", raw)) | set(re.findall(rb"\s([A-Za-z_][\w.-]*):[\w.-]+=", raw))
    decl = set(re.findall(rb"xmlns:([\w.-]+)=", raw))
    falta = [u for u in usados - decl if u not in (b"xmlns", b"xml", b"http", b"https")]
    if falta:
        m = re.search(rb"<([\w]+:)?kml\b", raw)
        raw = raw[:m.end()] + b"".join(b" xmlns:" + u + b'="urn:x-' + u + b'"' for u in falta) + raw[m.end():]
    return ET.fromstring(raw)


def _coords(txt):
    out = []
    for t in (txt or "").split():
        p = t.split(",")
        if len(p) >= 2:
            try:
                out.append((float(p[0]), float(p[1])))
            except ValueError:
                pass
    return out


def kmz_linhas(path, todas=False):
    """LineStrings da pasta 'Traçado' (em qualquer nível) do KMZ; com `todas`, todas as linhas do arquivo."""
    linhas = []
    with zipfile.ZipFile(path) as z:
        for nome in [n for n in z.namelist() if n.lower().endswith(".kml")]:
            root = _kml_root(z.read(nome))

            def walk(node, dentro):
                for ch in node:
                    t = _strip(ch.tag)
                    if t in ("Folder", "Document"):
                        nm = next((_limpa(c.text) for c in ch if _strip(c.tag) == "name"), "")
                        walk(ch, dentro or _sem_acento(nm) == "tracado")
                    elif t == "Placemark" and (dentro or todas):
                        for g in ch.iter():
                            if _strip(g.tag) == "LineString":
                                for c in g:
                                    if _strip(c.tag) == "coordinates":
                                        cs = _coords(c.text)
                                        if len(cs) >= 2:
                                            linhas.append(cs)
            walk(root, False)
    return linhas


def corredor(linhas_m, r=R_CORR, passo=1000.0):
    """Comprimento (km) do corredor de um conjunto de linhas em metros: as linhas são cortadas em peças de até
    `passo` m e cada peça só conta a parte a mais de `r` m das peças já contadas (das linhas mais longas primeiro e,
    na mesma linha, das peças anteriores que não sejam vizinhas ao longo do traçado: a pista de volta de uma linha
    fechada conta uma vez). Devolve (km, índices das linhas que acrescentam ≥ 20% do próprio comprimento)."""
    import shapely
    from shapely.ops import substring
    from shapely.strtree import STRtree
    pecas = []  # (geometria, linha, início ao longo da linha)
    for p, g in enumerate(linhas_m):
        L = g.length
        if L <= 0:
            continue
        n = max(1, math.ceil(L / passo))
        for k in range(n):
            pecas.append((substring(g, k * L / n, (k + 1) * L / n), p, k * L / n))
    if not pecas:
        return 0.0, []
    ordem = sorted(range(len(pecas)), key=lambda i: (-linhas_m[pecas[i][1]].length, pecas[i][1], pecas[i][2]))
    pos = {i: k for k, i in enumerate(ordem)}
    tree = STRtree([pc[0] for pc in pecas])
    bufs = {}
    novo_linha = defaultdict(float)
    for i in ordem:
        g, p, s0 = pecas[i]
        cand = [int(j) for j in tree.query(g, predicate="dwithin", distance=r) if pos[int(j)] < pos[i]
                and not (pecas[int(j)][1] == p and abs(pecas[int(j)][2] - s0) <= passo + 2 * r)]
        cob = 0.0
        if cand:
            for j in cand:
                if j not in bufs:
                    bufs[j] = pecas[j][0].buffer(r)
            cob = g.intersection(shapely.union_all([bufs[j] for j in cand])).length
        novo_linha[p] += max(g.length - cob, 0.0)
    keep = [p for p in range(len(linhas_m)) if novo_linha[p] >= 0.2 * linhas_m[p].length > 0]
    return sum(novo_linha.values()) / 1000, keep


# ====================================================================================================== ABCR

ABCR_ROTULOS = ["Nome Fantasia", "Razão Social", "Endereço/Bairro", "CEP/Cidade/Estado", "Telefones", "E-mail", "Site",
                "Poder Concedente", "Rodovia(s) Sigla/Nome", "Extensão Total Concedida",
                "Duração do Contrato de Concessão", "Data de Assinatura do contrato",
                "Data de Início de Operação/Cobrança", "Data Fim de Operação", "Capital Social Realizado", "Acionista",
                "Diretoria", "Trechos Concedidos"]


def parse_ficha_abcr(path):
    L = _html_linhas(Path(path).read_text(encoding="utf-8", errors="replace"))
    try:
        i0 = L.index("Nome Fantasia")
    except ValueError:
        return None
    i1 = L.index("Youtube", i0) if "Youtube" in L[i0:] else len(L)
    out, cur = {}, None
    for ln in L[i0:i1]:
        if ln in ABCR_ROTULOS:
            cur = ln
            out[cur] = []
        elif cur:
            out[cur].append(ln)
    f = {k: " | ".join(v) if v and v != ["–"] else None for k, v in out.items()}
    m = re.search(r"([\d.]+,\d+|[\d.]+)\s*km", f.get("Extensão Total Concedida") or "", re.I)
    f["km"] = _float_br(m.group(1)) if m else None
    return f


def carregar_abcr():
    d = DIR / "abcr"
    res = {}
    for e in json.loads((d / "api_conc.json").read_text(encoding="utf-8")):
        p = d / "fichas" / f"{e['slug']}.html"
        f = parse_ficha_abcr(p) if p.exists() else None
        if f:
            f["link"] = e["link"]
            res[e["slug"]] = f
    return res


def _abcr_data(f, k):
    v = (f or {}).get(k) or ""
    m = re.search(r"\d{4}-\d{2}-\d{2}", v)
    return m.group(0) if m else None


# ====================================================================================================== municípios

def poligonos_municipais(chaves):
    """{(uf, nome_sem_acento): Polygon/MultiPolygon} a partir do TopoJSON de data/intel/municipios.json."""
    from shapely.geometry import MultiPolygon, Polygon
    d = json.loads(MUNICIPIOS.read_text(encoding="utf-8"))
    topo = d["topo"]
    sx, sy = topo["transform"]["scale"]
    tx, ty = topo["transform"]["translate"]
    arcs = []
    for a in topo["arcs"]:
        x = y = 0
        pts = []
        for dx, dy in a:
            x += dx
            y += dy
            pts.append((x * sx + tx, y * sy + ty))
        arcs.append(pts)

    def anel(idx):
        pts = []
        for i in idx:
            a = arcs[i] if i >= 0 else arcs[~i][::-1]
            pts.extend(a if not pts else a[1:])
        return pts

    pos = {mid: k for k, mid in enumerate(d["ids"])}
    out = {}
    for g in topo["objects"]["mun"]["geometries"]:
        k = pos.get(g["properties"]["id"])
        if k is None:
            continue
        chave = (d["uf"][k], _sem_acento(d["nomes"][k]))
        if chave not in chaves:
            continue
        if g["type"] == "Polygon":
            rings = [anel(r) for r in g["arcs"]]
            out[chave] = Polygon(rings[0], rings[1:]).buffer(0)
        elif g["type"] == "MultiPolygon":
            out[chave] = MultiPolygon([Polygon(anel(p[0]), [anel(r) for r in p[1:]]) for p in g["arcs"]]).buffer(0)
    return out


# ====================================================================================================== malha Infra

def iter_infra(pages=PAGES):
    """(properties, [(lon, lat), ...]) por feição, lendo cada página com raw_decode (uma feição por vez em memória)."""
    dec = json.JSONDecoder()
    for p in sorted(Path(pages).glob("p_*.geojson")):
        s = p.read_text(encoding="utf-8")
        i = s.index('"features":[') + len('"features":[')
        while True:
            while s[i] in " \r\n\t,":
                i += 1
            if s[i] == "]":
                break
            f, i = dec.raw_decode(s, i)
            g = f.get("geometry") or {}
            partes = [g.get("coordinates") or []] if g.get("type") == "LineString" else (g.get("coordinates") or [])
            for cs in partes:
                yield f["properties"], cs
        del s


def carregar_malha(s):
    """Lê a camada Infra e mede a sobreposição de cada feição com o SNV (em metros, EPSG:5880)."""
    import numpy as np
    import shapely
    from shapely.geometry import LineString

    tr, geoms, tree = s._geo
    snv_buf = shapely.buffer(np.array(geoms, dtype=object), BUF_M, cap_style="flat")
    snv_len = np.array([g.length for g in geoms])
    F = []
    x0, y0, x1, y1 = BRASIL
    for pr, cs in iter_infra():
        pts = [(x, y) for x, y, *_ in cs if x0 < x < x1 and y0 < y < y1]
        if len(pts) < 2:
            continue
        ln = LineString(pts)
        out = shapely.simplify(ln, DP)
        med = shapely.simplify(ln, DP_MED)
        xs, ys = tr.transform([p[0] for p in med.coords], [p[1] for p in med.coords])
        gm = LineString(list(zip(xs, ys)))
        L = gm.length
        frac, fis = 0.0, []
        if L > 0:
            idx = tree.query(gm, predicate="dwithin", distance=BUF_M)
            if len(idx):
                frac = gm.intersection(shapely.union_all(snv_buf[idx])).length / L
                if frac > 0.2:
                    ov = shapely.length(shapely.intersection(gm, snv_buf[idx]))
                    fis = [int(j) for j, o in zip(idx, ov) if o >= 0.5 * min(snv_len[j], L)]
        sre = _limpa(pr.get("codigo_sre"))
        rod = _limpa(pr.get("codigo_rod"))
        uf = _limpa(pr.get("unidade_fe"))
        ki, kf = pr.get("quilometra") or 0, pr.get("quilom") or 0
        ext = pr.get("extensao") or 0
        tem_km = bool(ki or kf)
        acc = re.search(r"/(\d+)", sre)
        F.append({
            "uf": uf, "rod": rod.zfill(3) if rod.isdigit() else (sre[:3] if sre[:3].isdigit() else rod),
            "via": via_de(uf, rod, sre) if uf else rod, "sre": sre[:10], "acc": int(acc.group(1)) if acc else None,
            "sup": _limpa(pr.get("superficie")), "tipo": _limpa(pr.get("tipo_trech")),
            "km_i": float(ki) if tem_km else None, "km_f": float(kf) if tem_km else None,
            # extensão do atributo; se zero/negativa (Base 2002, erros de cadastro), |km_f − km_i| ou a geometria
            "ext": float(ext) if ext > 0 else (abs(kf - ki) if tem_km and kf != ki else L / 1000), "fed": e_federal(pr), "frac": frac, "fis": fis,
            "p": encode_line(list(out.coords)), "len_km": L / 1000,
        })
    return F


# ====================================================================================================== catálogo

ESTADO_SP = "Governo do Estado de SP"
# (slug ARTESP, lote, id, nome, geometria, grupo, slug ABCR)
SP = [
    ("autoban", "01", "sp-lt01-autoban", "AutoBAn", "l01", "Motiva", "ccr-autoban-estadual"),
    ("tebe", "03", "sp-lt03-tebe", "TEBE", None, "Way Brasil", None),
    ("arteris-intervias", "06", "sp-lt06-intervias", "Intervias", "l06", "Arteris", "intervias"),
    ("rota-bandeiras", "07", "sp-lt07-rota-das-bandeiras", "Rota das Bandeiras", "l07", "Rodovias do Brasil Holding",
     "rota-das-bandeiras-estadual"),
    ("renovias", "11", "sp-lt11-renovias", "Renovias", "l11", "Encalso / Motiva", "renovias-estadual"),
    ("via-colinas", "13", "sp-lt13-via-colinas", "Via Colinas", "l13", "Via Appia", "via-colinas-estadual"),
    ("cart", "16", "sp-lt16-cart", "CART", "l16", "Pátria", None),
    ("viarondon", "19", "sp-lt19-viarondon", "ViaRondon", "rod_km", "BRVias", "viarondon-estadual"),
    ("spvias", "20", "sp-lt20-spvias", "SPVias", "l20", "Motiva", "ccr-spvias-estadual"),
    ("rodovias-tiete", "21", "sp-lt21-rodovias-do-tiete", "Rodovias do Tietê", "l21", "Via Appia / FIP-IE Tietê", None),
    ("ecovias-imigrantes", "22", "sp-lt22-ecovias-imigrantes", "Ecovias Imigrantes", "l22", "EcoRodovias",
     "ecovias-imigrantes"),
    ("ecovias-leste", "23", "sp-lt23-ecovias-leste-paulista", "Ecovias Leste Paulista", "l23", "EcoRodovias",
     "ecovias-leste-paulista-estadual"),
    ("rodoanel-oeste", "24", "sp-lt24-rodoanel-oeste", "Rodoanel Oeste", "l24", "Motiva", "ccr-rodoanel-oeste-estadual"),
    ("spmar", "25", "sp-lt25-spmar", "SPMar", "l25", "Bertin", "spmar-estadual"),
    ("spserra", "26", "sp-lt26-via-sp-serra", "Via SP Serra (Rodoanel Norte)", "l26*", "Via Appia", "via-sp-serra-estadual"),
    ("tamoios", "27", "sp-lt27-tamoios", "Tamoios", "l27", "Queiroz Galvão", "tamoios-estadual"),
    ("entrevias", "28", "sp-lt28-entrevias", "Entrevias", "l28", "Pátria / Vinci Highways", "entrevias-estadual"),
    ("viapaulista", "29", "sp-lt29-viapaulista", "ViaPaulista", "l29", "Arteris", "viapaulista"),
    ("eixo-sp", "30", "sp-lt30-eixo-sp", "Eixo SP", "l30", "Pátria", None),
    ("ecovias-noroeste", "31", "sp-lt31-ecovias-noroeste", "Ecovias Noroeste Paulista", "l31", "EcoRodovias",
     "ecovias-noroeste-paulista-estadual"),
    ("cnl", "32", "sp-lt32-novo-litoral", "Novo Litoral", "l32", "CBI / CLD", "novo-litoral-estadual"),
    ("rota-sorocabana", "33", "sp-lt33-rota-sorocabana", "Rota Sorocabana", "l33", "Motiva", "rota-sorocabana-s-a"),
    ("ecovias-raposo-castello", "34", "sp-lt34-ecovias-raposo-castello", "Ecovias Raposo Castello", "l34", "EcoRodovias",
     "ecovias-raposo-castello"),
    ("via-raposo", "35", "sp-lt35-via-raposo", "Via Raposo", "l35", "Pátria", None),
    ("rota-mogiana", "37", "sp-lt37-rota-mogiana", "Rota Mogiana", "rod_km", "Azevedo & Travassos + Quimassa", None),
]
NOTA_SP = {
    "sp-lt03-tebe": "Contrato encerrado em 03/2025 (ficha ARTESP). As rodovias (SP-326, SP-351 e SP-323) passaram à Ecovias "
                    "Noroeste Paulista (LT.31). A ficha não traz km por trecho, então o lote não foi desenhado.",
    "sp-lt26-via-sp-serra": "Rodoanel Norte (SP-021, km 129,1 a 172), ainda ausente da malha estadual de 2021. O desenho usa "
                            "todas as linhas do arquivo oficial da ARTESP, que traz o eixo em pedaços junto com alças e "
                            "dispositivos; por isso a extensão desenhada passa da declarada.",
    "sp-lt19-viarondon": "O arquivo oficial da ARTESP para o lote traz só marginais e dispositivos, sem o eixo. O desenho "
                         "segue os trechos com km da ficha (SP-300 e acessos) sobre a malha estadual. A extensão da ficha "
                         "(660,6 km) não bate com a soma dos trechos da própria ficha nem com a ABCR (413,37 km).",
    "sp-lt37-rota-mogiana": "Sem traçado oficial publicado: desenho pelos 10 trechos com km da ficha ARTESP sobre a malha "
                            "estadual. Inclui as rodovias da Renovias (LT.11, prazo encerrado em 04/2026). Leilão na B3 em "
                            "27/02/2026 (https://www.b3.com.br/pt_br/noticias/leiloes-8AA8D0CC9C7094A7019CA0E114932F96.htm); "
                            "contrato assinado em 27/08/2026.",
    "sp-lt11-renovias": "Prazo de 28 anos a partir de 04/1998 (ficha ARTESP): encerrado em 04/2026. As rodovias estão no "
                        "lote Rota Mogiana (LT.37).",
}
# datas e grupos de fontes oficiais que faltam na ficha ARTESP (a ABCR não sobrescreve)
CURADO_SP = {"sp-lt37-rota-mogiana": {"assinatura": "2026-08-27"}}

# Ager-MT: nome na tabela → (id, lote, grupo, municípios extras)
MT = {
    "Rodovia da Mudança": ("mt-rodovia-da-mudanca", None, None, ()),
    "Intervias": ("mt-intervias-sorriso", None, None, ()),
    "APASI": ("mt-apasi", None, None, ()),
    "SPS": ("mt-sps", None, None, ()),
    "Morro da Mesa": ("mt-morro-da-mesa", None, None, ()),
    "Via Brasil MT100": ("mt-via-brasil-mt100", None, "Via Brasil", ()),
    "Via Brasil MT320": ("mt-via-brasil-mt320", None, "Via Brasil", ()),
    "Via Norte Sul": ("mt-via-norte-sul", None, None, ()),
    "Via Brasil MT246": ("mt-via-brasil-mt246", None, "Via Brasil", ()),
    "Rota dos Grãos": ("mt-rota-dos-graos", None, None, ()),
    "Rota da Produção": ("mt-lote2-rota-da-producao", "2", "Consórcio Rodoviário Rota da Produção",
                         ("Diamantino", "Nova Maringá", "Nova Marilândia", "Santo Afonso")),
    "Rota da Integração": ("mt-lote5-rota-da-integracao", "5", None, ("Campinápolis", "Água Boa")),
    "Vale do Arinos": ("mt-lote1-vale-do-arinos", "1", "V. F. Gomes Participações", ()),
    "Rota Dourada": ("mt-lote8-rota-dourada", "8", None, ()),
}

AGENCIA_MINAS = ("https://www.agenciaminas.mg.gov.br/noticia/governo-de-minas-assina-concessao-de-rodovias-do-triangulo-"
                 "mineiro-e-sul-do-estado-115093")
NOTA_BR_SNV = "o trecho coincide com rodovias federais do SNV e aparece desenhado sobre elas"
# Demais UFs. `sel`: ("agergs", aba) | ("rodkm", uf, rod, a, b) | ("rod", uf, rod) | ("brkm", uf, br, a, b) | ("brest", uf, br)
# Datas curadas (assinatura/inicio) vêm de fonte oficial ou do regulador e prevalecem sobre a ABCR.
OUTRAS = [
    dict(id="rs-rota-de-santa-maria", nome="Rota de Santa Maria", uf="RS", poder="Governo do Estado do RS",
         regulador="AGERGS", rodovias=["RSC-287"], grupo="Sacyr", assinatura="2021-07-22", prazo="30 anos",
         contrato="20/2021", abcr="rota-de-santa-maria-estadual", fonte_url=AGERGS_PAGE, sel=[("agergs", 0)],
         nota="Trechos da AGERGS: RSC-287 de Tabaí (km 28,03) a Santa Maria (km 232,54). A RSC-287 é a BR-287 "
              "planejada: " + NOTA_BR_SNV + "."),
    dict(id="rs-caminhos-da-serra-gaucha", nome="Caminhos da Serra Gaúcha", uf="RS", lote="Bloco 3",
         poder="Governo do Estado do RS", regulador="AGERGS",
         rodovias=["ERS-122", "ERS-240", "RSC-287", "ERS-446", "RSC-453", "BRS-470"],
         grupo="Integrasul (Silva & Bertoli / Gregor)", contrato="50/2022",
         abcr="caminhos-da-serra-gaucha-estadual", fonte_url=AGERGS_PAGE, sel=[("agergs", 1)],
         nota="Trechos da AGERGS (Bloco 3). As ERS estão na malha estadual; nas RSC-287, RSC-453 e BRS-470 (convênio) "
              + NOTA_BR_SNV + "."),
    dict(id="mg-epr-triangulo", nome="EPR Triângulo", uf="MG", lote="1", poder="Governo do Estado de MG",
         regulador="Seinfra-MG",
         rodovias=["BR-365", "CMG-452", "BR-452", "LMG-798", "MG-190", "MG-462", "MG-427", "LMG-812", "LMG-782"],
         grupo="EPR (Equipav + Perfin)", assinatura="2022-11-16", prazo="30 anos", abcr="epr-triangulo-estadual",
         fonte_url=AGENCIA_MINAS,
         sel=[("brest", "MG", "365"), ("brest", "MG", "452"), ("rod", "MG", "452"), ("rod", "MG", "798"),
              ("rod", "MG", "190"), ("rod", "MG", "462"), ("rod", "MG", "427"), ("rod", "MG", "812"),
              ("rod", "MG", "782")]),
    dict(id="mg-epr-sul-de-minas", nome="EPR Sul de Minas", uf="MG", lote="2", poder="Governo do Estado de MG",
         regulador="Seinfra-MG", rodovias=["CMG-146", "MG-173", "MG-290", "MG-295", "MG-455", "BR-459", "MG-459",
                                            "LMG-877"],
         grupo="EPR (Equipav + Perfin)", assinatura="2022-11-16", prazo="30 anos", abcr="epr-sul-de-minas-estadual",
         fonte_url=AGENCIA_MINAS,
         sel=[("brest", "MG", "146"), ("rod", "MG", "146"), ("rod", "MG", "173"), ("rod", "MG", "290"),
              ("rod", "MG", "295"), ("rod", "MG", "455"), ("brest", "MG", "459"), ("rod", "MG", "459"),
              ("rod", "MG", "877")]),
    dict(id="mg-epr-vias-do-cafe", nome="EPR Vias do Café", uf="MG", lote="3", poder="Governo do Estado de MG",
         regulador="Seinfra-MG", rodovias=["MG-167", "BR-265", "LMG-863", "CMG-491", "BR-146", "CMG-369"], grupo="EPR",
         inicio="2023-10-23", abcr="epr-vias-do-cafe-estadual",
         sel=[("rod", "MG", "167"), ("brest", "MG", "265"), ("rod", "MG", "863"), ("brest", "MG", "491"),
              ("rod", "MG", "491"), ("brest", "MG", "146"), ("brest", "MG", "369"), ("rod", "MG", "369")]),
    dict(id="mg-via-nascentes", nome="Via Nascentes", uf="MG", poder="Governo do Estado de MG", regulador="Seinfra-MG",
         rodovias=["MG-050", "BR-491", "BR-265"], grupo="Via Appia", abcr="via-nascentes-estadual",
         trechos=[("MG-050", 57.6, 402.0), ("BR-491", 0.0, 4.65), ("BR-265", 637.2, 659.5)],
         sel=[("rodkm", "MG", "050", 57.6, 402.0), ("brkm", "MG", "491", 0.0, 4.65), ("brkm", "MG", "265", 637.2, 659.5)],
         nota="Trechos com km da ficha ABCR: MG-050 sobre a malha estadual; nas BR-491 e BR-265 (delegadas) "
              + NOTA_BR_SNV + "."),
    dict(id="mg-ecovias-norte-minas", nome="Ecovias Norte Minas", uf="MG", poder="Governo do Estado de MG",
         regulador="Seinfra-MG", rodovias=["BR-135", "MG-231", "LMG-754"], grupo="EcoRodovias",
         abcr="ecovias-norte-minas-estadual",
         sel=[("brkm", "MG", "135", 363.6, 673.8), ("rod", "MG", "231"), ("rod", "MG", "754")],
         nota="BR-135 entre Montes Claros (km 363,6) e o entroncamento com a BR-040 perto de Curvelo (km 673,8), como "
              "descreve a ABCR; MG-231 e LMG-754 desenhadas por inteiro."),
    dict(id="ms-way-306", nome="Way-306", uf="MS", poder="Governo do Estado de MS", regulador="AGEMS",
         rodovias=["MS-306"], grupo="Way Brasil", km_decl=218.1, prazo="30 anos", inicio="2020-04",
         trechos=[("MS-306", 0.0, 218.1)],
         fonte_url=("https://correiodoestado.com.br/cidades/governo-assina-contrato-de-concessao-e-consorcio-inicia-"
                    "obras-na-ms306-em-um-mes/369397"),
         sel=[("rodkm", "MS", "306", 0.0, 218.1)],
         nota="MS-306 do km 0 (divisa com MT) ao km 218,1 (BR-158, Cassilândia). Contrato assinado no início de 2020 "
              "(imprensa); a Way-306 opera a rodovia desde 04/2020, sob regulação da AGEMS (reajustes anuais de "
              "pedágio). Data exata de assinatura não localizada."),
    dict(id="ms-way-112", nome="Way-112", uf="MS", poder="Governo do Estado de MS", regulador="AGEMS",
         rodovias=["MS-112", "BR-158", "BR-436"], grupo="Way Brasil", km_decl=412.4, assinatura="2023-03-23",
         prazo="30 anos", trechos=[("BR-158", 1.1, 194.9), ("BR-436", 0.0, 18.1)],
         fonte_url=("https://www.campograndenews.com.br/brasil/cidades/"
                    "governo-do-estado-assina-entrega-de-tres-rodovias-a-grupo-privado"),
         sel=[("rod", "MS", "112"), ("brkm", "MS", "158", 1.1, 194.9), ("brkm", "MS", "436", 0.0, 18.1)],
         nota="MS-112 de Três Lagoas a Cassilândia desenhada por inteiro; BR-158 da MS-306 (Cassilândia) à MS-444 "
              "(Selvíria) e BR-436 até o fim da ponte rodoferroviária, delegadas ao estado: " + NOTA_BR_SNV + "."),
    dict(id="ba-bahia-norte", nome="Bahia Norte", uf="BA", poder="Governo do Estado da BA", regulador="AGERBA",
         rodovias=["BA-093", "BA-512", "BA-521", "BA-524", "BA-526", "BA-535"], grupo="Monte Rodovias",
         abcr="bahia-norte-estadual",
         sel=[("rod", "BA", r) for r in ("093", "512", "521", "524", "526", "535")]),
    dict(id="ba-cln", nome="CLN – Concessionária Litoral Norte", uf="BA", poder="Governo do Estado da BA",
         regulador="AGERBA", rodovias=["BA-099"], grupo="Monte Rodovias", abcr="cln-estadual",
         sel=[("rod", "BA", "099")]),
    dict(id="ba-estrada-do-feijao", nome="Estrada do Feijão (Concef)", uf="BA", poder="Governo do Estado da BA",
         regulador="AGERBA", rodovias=["BA-052"], grupo=None, km_decl=545.4, contrato="01/2018",
         fonte_url="https://www.ba.gov.br/agerba/sites/site-agerba/files/2025-11/Res312025.pdf",
         sel=[("rod", "BA", "052")],
         nota="Concessão patrocinada (PPP), Contrato de Concessão nº 01/2018 (Resolução AGERBA nº 31/2025, reajuste da "
              "praça da BA-052). Sistema BA-052 de Feira de Santana a Xique-Xique e Barra, 545,4 km com acessos e a "
              "BA-160 (imprensa)."),
    dict(id="pa-conquista-do-para", nome="Conquista do Pará (Rota do Pará)", uf="PA", poder="Governo do Estado do PA",
         regulador="ARCON-PA", rodovias=["PA-150", "PA-475", "PA-252", "PA-151", "PA-483"],
         grupo="Consórcio Conquista do Pará", km_decl=526.0, prazo="30 anos", inicio="2024-08",
         contrato="Edital de Concessão 001/2023",
         fonte_url="https://diariodopara.com.br/para/melhorias-em-rodovias-da-rota-do-para-ja-alcancam-mais-de-200-km",
         sel=[("rod", "PA", r) for r in ("150", "475", "252", "151", "483")],
         nota="Leilão na B3 em 15/03/2023 (526 km: PA-150 entre Morada Nova e Goianésia do Pará, cerca de 333 km, "
              "PA-475, PA-252, PA-151 e Alça Viária/PA-483). A Rota do Pará administra as rodovias desde 08/2024 "
              "(imprensa); data de assinatura não localizada."),
    dict(id="pe-rota-dos-coqueiros", nome="Rota dos Coqueiros", uf="PE", poder="Governo do Estado de PE",
         regulador="ARPE", rodovias=["PE-024"], grupo="Monte Rodovias", abcr="rota-dos-coqueiros-estadual",
         assinatura="2006-12-28", contrato="Concessão Patrocinada CGPE nº 001/2006",
         fonte_url="https://www.legisweb.com.br/legislacao/?id=393234",
         trechos=[("PE-024", 0.0, 6.5)], sel=[("rodkm", "PE", "024", 0.0, 6.5)],
         nota="Contrato CGPE nº 001/2006, de 28/12/2006, citado na Resolução ARPE nº 160/2020."),
    dict(id="pe-rota-do-atlantico", nome="Rota do Atlântico", uf="PE", poder="Governo do Estado de PE",
         regulador="ARPE", rodovias=["Expressway de Suape"], grupo="Monte Rodovias", abcr="rota-do-atlantico-estadual",
         sel=[],
         nota="Complexo Viário e Logístico de Suape (Expressway, TDR Norte e Sul, contornos e acessos): vias sem código "
              "estadual na malha da Infra S.A., por isso não desenhadas."),
    dict(id="rj-rota-116", nome="Rota 116", uf="RJ", poder="Governo do Estado do RJ", regulador="AGETRANSP",
         rodovias=["RJ-116", "RJ-104"], grupo="DTP Participações", abcr="rota-116-estadual",
         fonte_url="https://www.agetransp.rj.gov.br/operadoras/rota116",
         trechos=[("RJ-116", 0.0, 40.0), ("RJ-116", 43.0, 78.5), ("RJ-116", 88.0, 138.0), ("RJ-104", 0.0, 1.0)],
         sel=[("rod", "RJ", "116")],
         nota="A malha do RJ não tem km: a RJ-116 foi desenhada por inteiro e o km 0 a 1 da RJ-104 não foi desenhado. "
              "Prazo original de 25 anos desde 2001 (terminaria por volta de 2026); há registro de prorrogação por mais "
              "25 anos, sob análise do TCE-RJ (jul/2026). Data de fim não informada."),
    dict(id="rj-via-lagos", nome="Via Lagos", uf="RJ", poder="Governo do Estado do RJ", regulador="AGETRANSP",
         rodovias=["RJ-124"], grupo="Motiva", abcr="vialagos-estadual",
         fonte_url="https://www.agetransp.rj.gov.br/operadoras/vialagos", sel=[("rod", "RJ", "124")],
         nota="RJ-124 de Rio Bonito a São Pedro da Aldeia desenhada por inteiro (a malha do RJ não tem km). A ficha da "
              "ABCR traz poder concedente 'Governo do Estado de São Paulo', erro de cadastro corrigido aqui."),
    dict(id="pi-transcerrados", nome="Transcerrados", uf="PI", poder="Governo do Estado do PI", regulador=None,
         rodovias=["PI-397", "PI-262"], grupo="Simpar (CS Infra)", km_decl=276.8, assinatura="2021-07-26",
         prazo="30 anos", contrato="PPP 003/2021 (Suparc-PI)",
         fonte_url="https://www.moneytimes.com.br/consorcio-graos-do-piaui-assina-contrato-de-concessao-da-rodovia-transcerrados/",
         sel=[],
         nota="Consórcio Grãos do Piauí. As PI-397 e PI-262 não estão na malha estadual da Infra S.A. (o PI só tem a "
              "base de 2002, sem códigos nem km), por isso não foram desenhadas."),
]


def _fontes(acesso):
    return [
        {"nome": "Infra S.A. — Rodovias Estaduais (camada Rodovias Estaduais: CIDE 2021 e Base DNIT 2002)",
         "url": INFRA_LAYER, "periodo": "CIDE 2021 (PA: CIDE 2020; AC, AL, AP, PI, RJ, RN e RR: Base DNIT 2002)",
         "acesso": acesso, "licenca": "Dado público federal (Infra S.A.); licença não declarada na camada",
         "nota": ("Malha estadual sem os trechos federais, sem os trechos sem UF e sem os que ficam em mais de 80% da "
                  "extensão a até 55 m do SNV (coincidentes). Só trechos pavimentados, duplicados ou em obras de "
                  "pavimentação, mais os trechos usados por concessões. O código SRE foi reduzido aos 10 primeiros "
                  "caracteres e o desenho foi simplificado (tolerância de cerca de 30 m). Os acentos perdidos na "
                  "origem ('?') foram mantidos. A camada com ano-base 2024 não respondeu nas consultas (erro 503).")},
        {"nome": "ARTESP — dados abertos (malha rodoviária por lote) e fichas das concessionárias",
         "url": ARTESP_CKAN, "periodo": "arquivos e fichas consultados em out/2026; investimentos com referência em 2024 (Via Raposo, 2025)",
         "acesso": acesso, "licenca": "CC-BY (portal de dados abertos da ARTESP); fichas: página pública",
         "nota": ("O desenho vem da pasta 'Traçado' dos arquivos KMZ da ARTESP; a extensão desenhada conta uma só "
                  "vez as pistas que ficam a até 100 m umas das outras. As fichas trazem controlador, início, prazo, "
                  "extensão, investimentos e trechos com km (https://www.artesp.sp.gov.br/artesp/setor-regulado/"
                  "rodovia/concessionarias).")},
        {"nome": "AGERGS — Rodovias concedidas (trechos SRE RSC-287 e Bloco 3)", "url": AGERGS_XLSX,
         "periodo": "2024", "acesso": acesso, "licenca": "Página pública do regulador",
         "nota": "Códigos SRE e km dos subtrechos da Rota de Santa Maria e dos Caminhos da Serra Gaúcha."},
        {"nome": "Ager-MT — Rodovias pedagiadas", "url": AGER_MT, "periodo": "2026", "acesso": acesso,
         "licenca": "Página pública do regulador",
         "nota": ("Concessionária, rodovias, municípios, contrato, extensão, assinatura e vigência. O recorte usa os "
                  "limites municipais do IBGE; o número dos lotes vem da Sinfra-MT.")},
        {"nome": "ABCR — Melhores Rodovias, fichas das concessionárias", "url": ABCR_LISTA, "periodo": "2026",
         "acesso": acesso, "licenca": "Página pública ABCR",
         "nota": ("Fonte complementar: preenche datas, acionistas e trechos onde ARTESP/AGERGS são omissos, nunca os "
                  "sobrescreve. Erros conhecidos (Noroeste assinada em 2008, Via Lagos com poder concedente SP) "
                  "descartados.")},
        {"nome": "Reguladores e governos estaduais (Agência Minas, AGERBA, ARPE, AGETRANSP, B3) e imprensa (MS, PA, PI)",
         "url": "https://www.agenciaminas.mg.gov.br/", "periodo": "2006–2026",
         "acesso": acesso, "licenca": "Páginas públicas; conteúdo jornalístico: só fatos citados",
         "nota": ("Cada concessão traz o link da página usada. Só entram como vigentes concessões com assinatura, "
                  "início de operação ou contrato identificado; datas da ABCR incoerentes entre si (assinatura depois "
                  "do início, fim que não confere com o prazo) são descartadas e citadas na nota da concessão.")},
    ]


# ====================================================================================================== build

class Malha:
    """Índices da malha Infra para os seletores das entidades."""

    def __init__(self, F):
        self.F = F
        self.by_rod = defaultdict(list)
        self.by_sre = defaultdict(list)
        for i, f in enumerate(F):
            self.by_rod[(f["uf"], f["rod"])].append(i)
            if f["sre"]:
                self.by_sre[f["sre"]].append(i)

    def rod(self, uf, rod, munis=None):
        """Rodovia inteira (só eixo, estadual e pavimentada: PAV/DUP/EOP/EOD), opcionalmente só nos municípios."""
        out = {}
        for i in self.by_rod.get((uf, rod.zfill(3)), []):
            f = self.F[i]
            if f["fed"] or f["acc"] is not None or f["sup"] not in PAVIMENTADAS | {"EOD"}:
                continue
            if munis is not None and not munis(f):
                continue
            out[i] = f["ext"]
        return out

    def rodkm(self, uf, rod, a, b, acc=None):
        """{i: (a', b')} das feições da rodovia com ≥ 50% do intervalo próprio dentro de [a, b]."""
        out = {}
        for i in self.by_rod.get((uf, rod.zfill(3)), []):
            f = self.F[i]
            if f["fed"] or f["km_i"] is None or f["acc"] != acc:
                continue
            ki, kf = sorted((f["km_i"], f["km_f"]))
            ov = min(kf, b) - max(ki, a)
            if ov > 0 and ov >= 0.5 * max(kf - ki, 1e-6):
                out[i] = (max(ki, a), min(kf, b))
        return out


def _sel_snv(s, tipo, uf, br, a=None, b=None):
    """{fis: (chave, a', b')} pelos trechos do SNV; brest = trechos com administração estadual/convênio."""
    out = {}
    for t in (s.trechos[i] for i in s.by_br_uf.get((br.zfill(3), uf), [])):
        if tipo == "brest":
            if t["adm"] in ADM_ESTADUAL:
                out.setdefault(t["fis"], (("BR", br, uf), t["km_ini"], t["km_fim"]))
        else:
            ov = min(t["km_fim"], b) - max(t["km_ini"], a)
            if ov > 0 and ov >= 0.5 * (t["km_fim"] - t["km_ini"]):
                out.setdefault(t["fis"], (("BR", br, uf), max(t["km_ini"], a), min(t["km_fim"], b)))
    return out


def _linhas_kmz(path, todas, tr):
    """Linhas do KMZ: junta segmentos (linemerge), mede o corredor e devolve as linhas mantidas já simplificadas."""
    import shapely
    from shapely.geometry import LineString, MultiLineString
    brutas = [[(round(x, 6), round(y, 6)) for x, y in ln] for ln in kmz_linhas(path, todas=todas)]
    if not brutas:
        return 0.0, []
    m = shapely.line_merge(MultiLineString(brutas))
    partes = list(m.geoms) if hasattr(m, "geoms") else [m]
    partes = [shapely.simplify(p, DP_MED) for p in partes if p.length > 0]
    met = []
    for p in partes:
        xs, ys = tr.transform([c[0] for c in p.coords], [c[1] for c in p.coords])
        met.append(LineString(list(zip(xs, ys))))
    km, keep = corredor(met)
    linhas = []
    for i in sorted(keep):
        g = shapely.simplify(partes[i], DP)
        if len(g.coords) >= 2:
            linhas.append(encode_line(list(g.coords)))
    return km, linhas


def _agergs(aba):
    import openpyxl
    wb = openpyxl.load_workbook(DIR / "agergs" / "trechos-rsm-e-csg.xlsx", data_only=True)
    ws = wb.worksheets[aba]
    ci = 1 if aba == 0 else 2
    out, vistos, total = [], set(), None
    for r in list(ws.iter_rows(values_only=True))[1:]:
        c = r[ci]
        if r[0] == "Total":
            total = r[ci + 5] if aba == 0 else r[7]
        if not isinstance(c, str) or len(c) != 10 or c in vistos:
            continue
        vistos.add(c)
        out.append((c, float(r[ci + 3]), float(r[ci + 4])))
    return out, total


def _trechos_sre(cods):
    """Subtrechos SRE ('287RSC0035', km_i, km_f) → trechos contíguos por rodovia [{'rod': 'RSC-287', ...}]."""
    por = defaultdict(list)
    for c, a, b in cods:
        por[f"{c[3:6]}-{c[:3]}"].append((a, b))
    out = []
    for rod, iv in por.items():
        cur = None
        for a, b in sorted(iv):
            if cur and a <= cur[1] + 0.01:
                cur[1] = max(cur[1], b)
            else:
                if cur:
                    out.append({"rod": rod, "km_i": _num(cur[0], 3), "km_f": _num(cur[1], 3)})
                cur = [a, b]
        out.append({"rod": rod, "km_i": _num(cur[0], 3), "km_f": _num(cur[1], 3)})
    return out


def _ager_mt():
    s = (DIR / "mt" / "ager_rodovias_pedagiadas.html").read_text(encoding="utf-8", errors="replace")
    t = s[s.find("<table"):s.find("</table>")]
    rows = []
    for r in re.findall(r"<tr.*?</tr>", t, flags=re.S):
        cells = [_limpa(htmlmod.unescape(re.sub(r"<[^>]+>", " ", c))) for c in re.findall(r"<t[dh].*?</t[dh]>", r, flags=re.S)]
        if len(cells) == 7 and cells[0] != "Concessionária":
            rows.append(cells)
    return rows


def _ano_frac(d):
    p = [int(x) for x in d.split("-")]
    return p[0] + (p[1] - 1) / 12 + ((p[2] - 1) / 365 if len(p) > 2 else 0)


def _br(d):
    p = d.split("-")
    return "/".join(reversed(p))


def _antes(a, b):
    """a é posterior a b? Compara na precisão comum ('2023-05' × '2023-05-20' empatam)."""
    k = min(len(a), len(b))
    return a[:k] > b[:k]


def datas_coerentes(ass, ini, fim, anos, ini_oficial=False):
    """Assinatura ≤ início de operação e (assinatura ou início) + prazo ≈ fim (± 1 ano).
    Devolve (ass, ini, fim, avisos); o campo incoerente vira None e o aviso explica. Com `ini_oficial` (ficha ARTESP),
    o início nunca é descartado."""
    av = []

    def bate(base):
        return bool(base and fim and anos and abs(_ano_frac(base) + anos - _ano_frac(fim)) <= 1)

    if ass and ini and _antes(ass, ini):
        ok_a, ok_i = bate(ass), bate(ini)
        if ini_oficial or (ok_i and not ok_a):
            av.append(f"A data de assinatura informada ({_br(ass)}) é posterior ao início ({_br(ini)}) e foi descartada.")
            ass = None
        elif ok_a and not ok_i:
            av.append(f"A data de início informada ({_br(ini)}) é anterior à assinatura ({_br(ass)}) e foi descartada.")
            ini = None
        else:
            av.append(f"Assinatura ({_br(ass)}) e início ({_br(ini)}) são incoerentes entre si; as duas foram "
                      "descartadas.")
            ass = ini = None
    base = ass or ini
    if fim and anos and base and not bate(base):
        av.append(f"A data de fim informada ({_br(fim)}) não confere com {_br(base)} + {_num(anos)} anos e foi "
                  "descartada.")
        fim = None
    return ass, ini, fim, av


def _junta_nota(*partes):
    txt = " ".join(p for p in partes if p)
    return txt or None


def _entidades_sp(abcr, hoje):
    ents, ilegiveis = [], []
    for slug, lote, eid, nome, geo, grupo, aslug in SP:
        p = DIR / "artesp" / "fichas" / f"{slug}.html"
        f = parse_ficha_artesp(p) if p.exists() else None
        if p.exists() and f is None:   # arquivo que não é a ficha (página de bloqueio do site): não vale tratar como vazio
            ilegiveis.append(slug)
        f = f or {}
        a = abcr.get(aslug) if aslug else None
        cur = CURADO_SP.get(eid, {})
        ini = f.get("inicio_mes")
        anos = f.get("anos")
        av = []
        ass = cur.get("assinatura")
        ass_abcr = _abcr_data(a, "Data de Assinatura do contrato")
        if not ass and ass_abcr:
            if ini and abs(int(ass_abcr[:4]) - int(ini[:4])) <= 1:
                ass = ass_abcr
            else:                                  # ABCR incoerente com a ARTESP (ex.: Noroeste "2008")
                av.append(f"A ABCR informa assinatura em {_br(ass_abcr)}, incoerente com o início na ficha ARTESP "
                          f"({_br(ini) if ini else 'sem data'}); data descartada.")
        # fim: só o término explícito da ARTESP ou o fim da ABCR que confere com início + prazo da ARTESP
        fim = f.get("termino") or _abcr_data(a, "Data Fim de Operação")
        ass, ini, fim, av2 = datas_coerentes(ass, ini, fim, anos, ini_oficial=True)
        if f.get("termino"):
            fim = f["termino"]
        fim_calc = f.get("termino") or _somar_anos(ini, anos)      # só para o estado; não vai para `fim`
        prazo = f"{_num(anos)} anos" if anos else None
        sel = []
        if geo == "rod_km":
            for rod, ka, kb in f.get("trechos", []):
                m = re.match(r"SP[AIDM]?-(\d{3})(?:/(\d{3}))?", rod)
                if not m:
                    continue
                if m.group(2):
                    sel.append(("rodkm", "SP", m.group(2), ka, kb, int(m.group(1))))
                else:
                    sel.append(("rodkm", "SP", m.group(1), ka, kb))
        elif geo:
            sel.append(("kmz", geo.rstrip("*"), geo.endswith("*")))
        estado = "encerrado" if fim_calc and fim_calc[:7] < hoje[:7] else "vigente"
        ents.append({
            "id": eid, "nome": nome, "esfera": "estadual", "uf": "SP", "poder": ESTADO_SP, "regulador": "ARTESP",
            "lote": lote, "rodovias": f.get("rods", []),
            "trechos": [{"rod": r, "km_i": _num(ka, 3), "km_f": _num(kb, 3)} for r, ka, kb in f.get("trechos", [])],
            "grupo": grupo, "controlador": _limpa(f.get("controlador")) or None, "estado": estado,
            "km_decl": _num(f.get("km")), "km_trechos": _num(sum(kb - ka for _, ka, kb in f.get("trechos", [])), 1)
            if f.get("trechos") else None, "assinatura": ass, "inicio": ini, "fim": fim, "prazo": prazo,
            "capex_bi": _num(f.get("capex_bi")), "capex_ref": f.get("capex_ref") if f.get("capex_bi") else None,
            "fonte_url": ARTESP_FICHA.format(slug), "abcr_url": a["link"] if a else None,
            "nota": _junta_nota(NOTA_SP.get(eid), *av, *av2), "_sel": sel,
        })
    if ilegiveis:
        raise ValueError(f"fichas ARTESP ilegíveis (bloqueio do site?): {', '.join(ilegiveis)}; confira os arquivos de "
                         "data/raw/estaduais/artesp/fichas/ e rode de novo com --baixar")
    return ents


def _entidades_mt(hoje):
    ents = []
    for nome, rods, munis, contrato, ext, data, vig in _ager_mt():
        if nome not in MT:
            print(f"aviso: concessionária MT sem mapeamento: {nome}")
            continue
        eid, lote, grupo, extra = MT[nome]
        rr = re.findall(r"MT-(\d{3})", rods)
        mm = [m.strip() for m in munis.split("/") if m.strip()] + list(extra)
        ass = _data_br(data)
        fim_calc = _somar_anos(ass, _anos(vig))   # só para o estado; a Ager-MT dá a vigência, não a data de fim
        ents.append({
            "id": eid, "nome": nome + (f" (Lote {lote})" if lote else ""), "esfera": "estadual", "uf": "MT",
            "poder": "Governo do Estado de MT", "regulador": "Ager-MT", "lote": lote,
            "rodovias": [f"MT-{r}" for r in rr], "trechos": [], "grupo": grupo, "estado":
                "encerrado" if fim_calc and fim_calc < hoje else "vigente",
            "km_decl": _num(_float_br(re.sub(r"[^\d.,]", "", ext))), "assinatura": ass, "inicio": None, "fim": None,
            "prazo": vig, "capex_bi": None, "capex_ref": None, "contrato": contrato,
            "fonte_url": AGER_MT, "municipios": mm,
            "nota": f"Rodovias {', '.join('MT-' + r for r in rr)} desenhadas nos municípios {', '.join(mm)} "
                    f"(tabela da Ager-MT{'; número do lote da Sinfra-MT' if lote else ''}).",
            "_sel": [("rod", "MT", r, tuple(mm)) for r in rr],
        })
    return ents


def _entidades_outras(abcr, hoje):
    ents = []
    for c in OUTRAS:
        a = abcr.get(c.get("abcr")) if c.get("abcr") else None
        ass = c.get("assinatura") or _abcr_data(a, "Data de Assinatura do contrato")
        ini = c.get("inicio") or _data_br((a or {}).get("Data de Início de Operação/Cobrança"))
        fim = c.get("fim") or _abcr_data(a, "Data Fim de Operação")
        prazo = c.get("prazo") or (_limpa((a or {}).get("Duração do Contrato de Concessão")) or None)
        ass, ini, fim, av = datas_coerentes(ass, ini, fim, _anos(prazo))
        km = c.get("km_decl") or (a or {}).get("km")
        tre = c.get("trechos") or []
        ents.append({
            "id": c["id"], "nome": c["nome"], "esfera": "estadual", "uf": c["uf"], "poder": c["poder"],
            "regulador": c["regulador"], "lote": c.get("lote"), "rodovias": c["rodovias"],
            "trechos": [{"rod": r, "km_i": _num(ka, 3), "km_f": _num(kb, 3)} for r, ka, kb in tre],
            "grupo": c.get("grupo"), "estado": "encerrado" if fim and fim < hoje else "vigente",
            "km_decl": _num(km), "assinatura": ass, "inicio": ini, "fim": fim, "prazo": prazo,
            "capex_bi": None, "capex_ref": None, "contrato": c.get("contrato"),
            "fonte_url": c.get("fonte_url") or (a or {}).get("link"), "abcr_url": (a or {}).get("link"),
            "trecho_texto": _limpa((a or {}).get("Trechos Concedidos")) or None,
            "nota": _junta_nota(c.get("nota"), *av), "_sel": c["sel"],
        })
    return ents


def _rank(sel):
    if sel[0] in ("rod", "brest"):
        return 1 if (sel[0] == "rod" and len(sel) > 3) else 2
    return 0


def build(F=None):
    """Gera data/intel/estaduais.json. `F` (saída de carregar_malha) só para reaproveitar a leitura em depuração."""
    s = snv()
    hoje = dt.date.today().isoformat()
    t0 = time.time()
    F = F if F is not None else carregar_malha(s)
    print(f"malha Infra: {len(F)} feições em {time.time() - t0:.0f} s")
    M = Malha(F)
    abcr = carregar_abcr()
    ents = _entidades_sp(abcr, hoje) + _entidades_outras(abcr, hoje) + _entidades_mt(hoje)
    tr = s._geo[0]

    # polígonos municipais para os recortes do MT
    chaves = {("MT", _sem_acento(m)) for e in ents for sel in e["_sel"] if sel[0] == "rod" and len(sel) > 3
              for m in sel[3]}
    polis = poligonos_municipais(chaves)
    faltam = sorted(k[1] for k in chaves - set(polis))
    if faltam:
        print("aviso: municípios sem polígono:", faltam)
    from shapely.geometry import Point
    meio = {}

    def no_municipio(nomes):
        ps = [polis[("MT", _sem_acento(m))] for m in nomes if ("MT", _sem_acento(m)) in polis]

        def f(feat):
            k = id(feat)
            if k not in meio:
                pts = decode_line(feat["p"])
                meio[k] = Point(pts[len(pts) // 2])
            return any(p.contains(meio[k]) for p in ps)
        return f

    # 1) seleções brutas por entidade
    for e in ents:
        e["_inf"], e["_fis"], e["_kmz"] = {}, {}, None
        e["_rk"] = {}
        for sel in e["_sel"]:
            k = sel[0]
            if k == "kmz":
                km, linhas = _linhas_kmz(DIR / "artesp" / "dl" / f"{sel[1]}.kmz", sel[2], tr)
                e["_kmz"] = (km, linhas)
            elif k == "agergs":
                cods, total = _agergs(sel[1])
                e["km_decl"] = _num(total)          # AGERGS é a fonte primária (a ABCR não sobrescreve)
                e["trechos"] = _trechos_sre(cods)
                for cod, ka, kb in cods:
                    for i in M.by_sre.get(cod, []):
                        e["_inf"][i] = F[i]["ext"]
                        e["_rk"][("i", i)] = 0
                    alt = cod.replace("RSC", "BRS")
                    for c2 in (cod, alt):
                        if c2 in s.by_code:
                            j = s.trechos[s.by_code[c2]]["fis"]
                            e["_fis"].setdefault(j, None)
                            e["_rk"][("f", j)] = 0
            elif k == "rodkm":
                acc = sel[5] if len(sel) > 5 else None
                for i, iv in M.rodkm(sel[1], sel[2], sel[3], sel[4], acc).items():
                    e["_inf"][i] = (("I", sel[1], sel[2], acc),) + iv
                    e["_rk"][("i", i)] = 0
            elif k == "rod":
                filtro = no_municipio(sel[3]) if len(sel) > 3 else None
                for i, km in M.rod(sel[1], sel[2], filtro).items():
                    if i not in e["_inf"]:
                        e["_inf"][i] = km
                        e["_rk"][("i", i)] = _rank(sel)
            elif k in ("brkm", "brest"):
                for j, iv in _sel_snv(s, k, sel[1], sel[2], *sel[3:5]).items():
                    if j not in e["_fis"]:
                        e["_fis"][j] = iv
                        e["_rk"][("f", j)] = _rank(sel)
        e["recorte"] = "rodovia" if any(sel[0] in ("rod", "brest") for sel in e["_sel"]) else (
            "kmz" if e["_kmz"] else "sre" if any(sel[0] == "agergs" for sel in e["_sel"]) else
            ("km" if e["_sel"] else None))

    # 2) prioridade: item reivindicado com recorte mais preciso por outra entidade da UF sai dos recortes inteiros
    melhor = {}
    for n, e in enumerate(ents):
        for key, r in e["_rk"].items():
            melhor.setdefault((e["uf"], key), []).append((r, n))
    for n, e in enumerate(ents):
        for key, r in list(e["_rk"].items()):
            outros = [rr for rr, nn in melhor[(e["uf"], key)] if nn != n]
            if outros and min(outros) < r:
                if key[0] == "i":
                    e["_inf"].pop(key[1], None)
                else:
                    e["_fis"].pop(key[1], None)

    # 3) malha final: estaduais não coincidentes, pavimentadas ou usadas por entidade
    usadas = {i for e in ents for i in e["_inf"]}
    idx_linha, linhas, ps = {}, [], []
    tipos = []
    for i, f in enumerate(F):
        if not f["uf"] or f["fed"] or f["frac"] > FRAC_MAX:
            continue
        if f["sup"] not in PAVIMENTADAS and i not in usadas:
            continue
        if f["tipo"] not in tipos:
            tipos.append(f["tipo"])
        idx_linha[i] = len(linhas)
        linhas.append([f["uf"], f["via"], f["sre"], f["sup"], _num(f["km_i"]), _num(f["km_f"]), _num(f["ext"]),
                       tipos.index(f["tipo"])])
        ps.append(f["p"])
    ufs = sorted({row[0] for row in linhas})

    # 4) saída por entidade
    entEst, entFis, entGeo = [], [], []
    for e in ents:
        est = sorted(idx_linha[i] for i in e["_inf"] if i in idx_linha)
        fis = set(j for j, v in e["_fis"].items())
        for i in e["_inf"]:
            if i not in idx_linha and F[i]["frac"] > FRAC_MAX:
                fis.update(F[i]["fis"])
        # km: ext das feições Infra (rodovia/SRE) + união dos intervalos de km (rod+km na malha e BR+km no SNV).
        # Os físicos herdados de feições coincidentes e os do código SRE→SNV não somam de novo.
        iv = defaultdict(list)
        km = 0.0
        for v in list(e["_inf"].values()) + [v for v in e["_fis"].values() if v is not None]:
            if isinstance(v, tuple):
                iv[v[0]].append(v[1:])
            else:
                km += v
        km += sum(_somar_intervalos(x) for x in iv.values())
        geo = []
        if e["_kmz"]:
            km, geo = e["_kmz"]
        e["km_map"] = _num(km, 1) if km else None
        inteira = e["recorte"] == "rodovia"
        e["qualidade"] = qualidade(e["km_map"], e["km_decl"], inteira)
        if not (est or fis or geo):
            e["qualidade"] = "nao_mapeado"
            e["km_map"] = None
        metodos = [sel[0] for sel in e["_sel"]]
        e["geo_metodo"] = ("kmz" if "kmz" in metodos else "sre" if "agergs" in metodos else
                           "rod_km" if "rodkm" in metodos and "rod" not in metodos else
                           "rod" if ("rod" in metodos or "brest" in metodos) else
                           "snv" if "brkm" in metodos else None)
        if e["qualidade"] != "ok" and not e.get("nota"):
            e["nota"] = _nota_padrao(e)
        elif e["qualidade"] != "ok" and e["km_map"] and e["km_decl"]:
            e["nota"] += _extensoes(e)
        entEst.append(est)
        entFis.append(sorted(fis))
        entGeo.append(geo)

    ordem = ["id", "nome", "esfera", "uf", "poder", "regulador", "lote", "rodovias", "trechos", "grupo", "controlador",
             "estado", "km_decl", "km_trechos", "km_map", "qualidade", "recorte", "nota", "assinatura", "inicio", "fim",
             "prazo",
             "capex_bi", "capex_ref", "geo_metodo", "fonte_url", "abcr_url", "contrato", "municipios", "trecho_texto"]
    opcionais = {"controlador", "abcr_url", "contrato", "municipios", "trecho_texto", "km_trechos"}
    saida = [{k: e.get(k) for k in ordem if k in e and not (k in opcionais and e.get(k) is None)} for e in ents]
    acesso = _acesso()
    # cadastro: malha e fichas de concessões (registros), sem número medido ou modelado
    doc = {"fonte": _fontes(acesso), "tipo": "cadastro",
           "malha": {"base": "Infra S.A. Hosted/Rodovias_Estaduais (cide2021)",
                     "campos": ["uf", "via", "sre", "sup", "km_i", "km_f", "ext", "tipo"], "tipos": tipos,
                     "ufs_sem_malha": [u for u in UFS if u not in ufs], "linhas": linhas, "p": ps},
           "entidades": saida, "entEst": entEst, "entFis": entFis, "entGeo": entGeo}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{OUT.relative_to(ROOT)}: {OUT.stat().st_size / 1e6:.2f} MB; {len(linhas)} feições; UFs sem malha "
          f"{doc['malha']['ufs_sem_malha']}; {len(saida)} entidades")
    return doc


def _fmt(x):
    return f"{x:,.1f}".replace(",", "X").replace(".", ",").replace("X", ".")


def _nota_padrao(e):
    if e["recorte"] == "rodovia":
        base = ("Desenho pelas rodovias inteiras, porque os km de cada trecho não foram publicados em fonte aberta; nas "
                "rodovias federais, só os trechos sob administração estadual ou convênio; trechos já desenhados com "
                "km por outra concessão foram retirados.")
    elif e["recorte"] == "kmz":
        base = ("Traçado oficial da ARTESP; a extensão desenhada conta uma vez as pistas paralelas e difere da "
                "extensão da ficha.")
    else:
        base = "Desenho pelos km dos trechos."
    return base + _extensoes(e)


def _extensoes(e):
    if e.get("km_map") and e.get("km_decl"):
        return f" Extensão desenhada {_fmt(e['km_map'])} km; declarada {_fmt(e['km_decl'])} km."
    return ""


def _acesso():
    m = Manifest("estaduais")
    datas = sorted(i["acesso"] for i in m.items)
    return datas[0] if datas else dt.date.today().isoformat()


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "all"
    if cmd in ("fetch", "all"):
        fetch()
    if cmd in ("build", "all"):
        build()
