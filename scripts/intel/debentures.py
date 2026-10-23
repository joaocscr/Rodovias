"""Debêntures de infraestrutura de transporte → data/intel/debentures.json.

Universo: emissores de rodovias, ferrovias, portos e terminais, aeroportos, hidrovias e mobilidade urbana sobre trilhos,
classificados à mão em data/debentures/emissores.json (emissor → subsetor e grupo, com as grafias vistas nas fontes).

Entradas
- Planilhas do usuário em data/raw/debentures/*.xlsx (nomes livres, fora do git). Cada aba é reconhecida pelo
  cabeçalho, não pelo nome: tela BTG (com "Setor"), tela XP (com "Índice" e "Rating"), negócios fechados BTG (com
  "transact_time") e intenções de compra e venda XP (com "Direção" e "Taxa Bruta").
- Séries públicas, baixadas por `fetch` para data/raw/debentures/publico/: Banco Central (SGS: Selic meta 432, CDI 12
  e IPCA 12 meses 13522; Olinda: expectativa Focus do IPCA 12 meses) e Tesouro Nacional (taxas do Tesouro Direto, de
  onde sai a curva diária das NTN-B).

Saída: só agregados (por dia, emissor, subsetor e, nas intenções, direção) e o último negócio e a última intenção de
cada papel; nunca a lista de negócios ou intenções linha a linha. Intenções ficam à parte dos negócios, com o mesmo
formato de agregado (`volume`, `n`, `taxa_media` e `volume_taxa` por indexador, `spread_medio` e `volume_spread`),
para a tela poder somá-los. Spread só para IPCA+: taxa − NTN-B do mesmo dia interpolada em linha reta pelo vencimento;
sem curva no dia ou fora dela, None (nunca extrapola, nunca zero). Emissor que não casa com a classificação e não é
sabidamente de outro setor fica fora e vai para `pendencias` (relatório de curadoria), assim como série pública ausente
e dia sem curva.

Troca das planilhas pela API interna
  O formato das planilhas fica só em debentures_planilhas.py (`planilhas`, `ler_telas`, `ler_negocios`), cujo início
  descreve o contrato de saída. Para ler da API, escreva um módulo irmão com as mesmas funções e passe-as a `montar`
  (`ler_telas=`, `ler_negocios=`); ajuste também as duas primeiras fontes de `_fontes`, que dizem "planilha enviada pelo
  usuário". Os conversores de texto comuns ficam em debentures_texto.py.

Séries públicas: são dados diários, então `fetch` (o `--baixar` do atualizar.py) sempre baixa de novo; se uma fonte
não responde, fica o arquivo anterior e o aviso.

    python scripts/intel/debentures.py [fetch|build|all]
"""
import datetime as dt
import json
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from intel import debentures_planilhas as _planilhas  # noqa: E402
from intel.debentures_planilhas import ler_negocios, ler_telas  # noqa: E402,F401 — leitores padrão de `montar`
from intel.debentures_texto import normalizar, para_data, taxa_pct  # noqa: E402
from intel.fontes import RAW, ROOT, Manifest, fetch as _fetch, sha256  # noqa: E402

PASTA = RAW / "debentures"
PUBLICO = PASTA / "publico"
EMISSORES = ROOT / "data" / "debentures" / "emissores.json"
OUT = ROOT / "data" / "intel" / "debentures.json"

SUBSETORES = ("rodovias", "ferrovias", "portos e terminais", "aeroportos", "hidrovias", "mobilidade urbana")
SETOR_TRANSPORTE = "Transporte"
DIAS_UTEIS = 252
# taxa fora destes limites (% a.a.; no "% DI", % do CDI) é erro de digitação na planilha: sai das médias e do spread
# (conta no volume e no número) e vai para a curadoria
LIMITES_TAXA = {"% DI": (0, 300), "DI+": (-5, 20)}
LIMITES_PADRAO = (-10, 50)
ORIGEM = {"negocios": "negócios BTG", "intencoes": "intenções XP"}

SGS = "https://api.bcb.gov.br/dados/serie/bcdata.sgs.{}/dados/ultimos/{}?formato=json"
SERIES = {  # chave → (código SGS, quantos valores, arquivo)
    "selic": (432, 20, "sgs_432.json"),
    "cdi": (12, 20, "sgs_12.json"),
    "ipca12m": (13522, 12, "sgs_13522.json"),
}
FOCUS_URL = ("https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/odata/ExpectativasMercadoInflacao12Meses"
             "?%24top=20&%24filter=Indicador%20eq%20'IPCA'%20and%20Suavizada%20eq%20'S'%20and%20baseCalculo%20eq%200"
             "&%24orderby=Data%20desc&%24format=json")
FOCUS = "focus_ipca12m.json"
TESOURO_URL = ("https://www.tesourotransparente.gov.br/ckan/dataset/df56aa42-484a-4a59-8184-7676580c81e3/resource/"
               "796d2059-14e9-44e3-80c9-2d9e30b405c1/download/precotaxatesourodireto.csv")
TESOURO_PAGINA = "https://www.tesourotransparente.gov.br/ckan/dataset/taxas-dos-titulos-ofertados-pelo-tesouro-direto"
TESOURO = "tesouro_direto.csv"
NTNB = {"Tesouro IPCA+ com Juros Semestrais": "NTN-B", "Tesouro IPCA+": "NTN-B Principal"}
TENTATIVAS_TESOURO = 7  # o site devolve 429 (Retry-After 30 s) em rajadas: espera 2, 4, …, 128 s

ROTULO_SERIE = {"selic": "Selic meta (SGS 432)", "cdi": "CDI (SGS 12)", "ipca12m": "IPCA 12 meses (SGS 13522)",
                "focus": "Focus, IPCA 12 meses", "tesouro": "Tesouro Direto (NTN-B)"}
ARQUIVO_SERIE = {**{k: v[2] for k, v in SERIES.items()}, "focus": FOCUS, "tesouro": TESOURO}


# ---------- entradas ----------

def planilhas(pasta=PASTA):
    """Planilhas de entrada (data/raw/debentures/*.xlsx)."""
    return _planilhas.planilhas(pasta)


# ---------- classificação ----------

def carregar_emissores(path=EMISSORES):
    return json.loads(Path(path).read_text(encoding="utf-8"))


class _Indice(dict):
    """grafia normalizada → {nome, subsetor, grupo}."""


def indexar(emissores):
    if isinstance(emissores, _Indice):
        return emissores
    idx = _Indice()
    for e in emissores.get("emissores", []):
        c = {"nome": e["nome"], "subsetor": e["subsetor"], "grupo": e.get("grupo")}
        for n in [e["nome"], *e.get("nomes", [])]:
            idx[normalizar(n)] = c
    return idx


def classificar(nome, emissores):
    """{nome, subsetor, grupo} do emissor cuja grafia (normalizada) é igual a `nome`; None se nenhuma casa.
    `emissores`: o conteúdo de emissores.json ou o índice de `indexar`."""
    c = indexar(emissores).get(normalizar(nome))
    return dict(c) if c else None


# ---------- curva das NTN-B e spread ----------

def ler_tesouro(path, datas=None):
    """{data: [(vencimento, taxa, título)]} das NTN-B (com juros semestrais e principal) do CSV do Tesouro Direto,
    com a taxa de compra da manhã. No mesmo vencimento vale a NTN-B com juros semestrais. `datas`: só esses dias."""
    import csv
    brutos = defaultdict(dict)
    with open(path, encoding="utf-8", errors="replace", newline="") as f:
        for r in csv.DictReader(f, delimiter=";"):
            titulo = NTNB.get((r.get("Tipo Titulo") or "").strip())
            data = para_data(r.get("Data Base"))
            if not titulo or not data or (datas is not None and data not in datas):
                continue
            venc, taxa = para_data(r.get("Data Vencimento")), taxa_pct(r.get("Taxa Compra Manha"))
            if venc is None or taxa is None:
                continue
            atual = brutos[data].get(venc)
            if atual is None or titulo == "NTN-B":
                brutos[data][venc] = (taxa, titulo)
    return {d: sorted((v, t, tit) for v, (t, tit) in pontos.items()) for d, pontos in brutos.items()}


def curva_ntnb(data, curvas):
    """[(vencimento, taxa)] da curva das NTN-B do dia, em ordem de vencimento; [] se o Tesouro não tem o dia."""
    return [(v, t) for v, t, _ in curvas.get(data, [])]


def spread(taxa, vencimento, curva, indexador="IPCA+"):
    """Taxa − NTN-B interpolada em linha reta (por dias) entre os dois vencimentos vizinhos, em pontos percentuais.
    None para indexador que não seja IPCA+, sem taxa, sem curva ou com vencimento fora dela (não extrapola)."""
    if indexador != "IPCA+" or taxa is None or not vencimento or len(curva) < 1:
        return None
    alvo = dt.date.fromisoformat(vencimento)
    pontos = [(dt.date.fromisoformat(v), t) for v, t in curva]
    for (v0, t0), (v1, t1) in zip(pontos, pontos[1:]):
        if v0 <= alvo <= v1:
            ref = t0 + (t1 - t0) * (alvo - v0).days / (v1 - v0).days
            return taxa - ref
    if len(pontos) == 1 and pontos[0][0] == alvo:
        return taxa - pontos[0][1]
    return None


# ---------- agregados ----------

def _r(v, casas):
    return None if v is None else round(v, casas)


def _medidas(linhas, com_direcao=False):
    volume = sum(l["volume"] or 0 for l in linhas)
    peso_taxa, soma_taxa = defaultdict(float), defaultdict(float)
    peso_spread = soma_spread = 0.0
    for l in linhas:
        v = l["volume"] or 0
        if v <= 0:
            continue
        if l["taxa"] is not None and l["indexador"]:
            peso_taxa[l["indexador"]] += v
            soma_taxa[l["indexador"]] += v * l["taxa"]
        if l.get("spread") is not None:
            peso_spread += v
            soma_spread += v * l["spread"]
    out = {"volume": _r(volume, 2), "n": len(linhas),
           "taxa_media": {i: _r(soma_taxa[i] / p, 4) for i, p in peso_taxa.items()},
           "volume_taxa": {i: _r(p, 2) for i, p in peso_taxa.items()},
           "spread_medio": _r(soma_spread / peso_spread, 4) if peso_spread else None,
           "volume_spread": _r(peso_spread, 2)}
    if com_direcao:
        out["por_direcao"] = {d: {"volume": _r(sum(l["volume"] or 0 for l in linhas if l["direcao"] == d), 2),
                                  "n": sum(l["direcao"] == d for l in linhas)} for d in ("compra", "venda")}
    return out


def agregar(linhas, campos, com_direcao=False):
    """Uma linha por valor de `campos` (ex.: ("data",) ou ("emissor", "subsetor", "grupo")), com volume (R$), n,
    taxa média ponderada pelo volume por indexador (`taxa_media`, pesos em `volume_taxa`), spread médio ponderado só dos
    IPCA+ com spread (`spread_medio`, peso em `volume_spread`) e, com `com_direcao`, volume e n de compra e venda.
    Linha sem volume conta em `n` e fica fora das médias."""
    grupos = defaultdict(list)
    for l in linhas:
        grupos[tuple(l[c] for c in campos)].append(l)
    return [{**dict(zip(campos, k)), **_medidas(ls, com_direcao)} for k, ls in grupos.items()]


def _conjunto(linhas, com_direcao=False):
    por_vol = lambda r: (-r["volume"], str(r.get("emissor") or r.get("subsetor")))  # noqa: E731
    out = {"por_dia": sorted(agregar(linhas, ("data",), com_direcao), key=lambda r: r["data"]),
           "por_emissor": sorted(agregar(linhas, ("emissor", "subsetor", "grupo"), com_direcao), key=por_vol),
           "por_subsetor": sorted(agregar(linhas, ("subsetor",), com_direcao), key=por_vol)}
    if com_direcao:
        out["por_direcao"] = [{"direcao": d, **_medidas([l for l in linhas if l["direcao"] == d])}
                              for d in ("compra", "venda")]
    return out


def _ultimos(linhas, origem):
    """Último negócio (ou intenção) de cada papel, entre as linhas com volume e taxa (a planilha traz registros com
    volume zero, às vezes com taxa fora do lugar, que não são o preço do papel)."""
    ult = {}
    for l in linhas:
        if not (l["volume"] or 0) > 0 or l["taxa"] is None:
            continue
        k = (l["data"] or "", l["hora"] or "")
        if l["ticker"] not in ult or k >= (ult[l["ticker"]]["data"] or "", ult[l["ticker"]]["hora"] or ""):
            ult[l["ticker"]] = l
    out = []
    for t, l in sorted(ult.items()):
        u = {"ticker": t, "emissor": l["emissor_classe"], "subsetor": l["subsetor"], "grupo": l["grupo"],
             "indexador": l["indexador"], "vencimento": l["vencimento"], "data": l["data"], "hora": l["hora"],
             "taxa": l["taxa"], "spread": _r(l["spread"], 4), "origem": origem}
        if origem == "intencao":
            u["direcao"] = l["direcao"]
        out.append(u)
    return out


# ---------- universo ----------

def _universo(telas, mov, emissores):
    """Classifica cada linha (pelo nome dela; senão pelo nome do mesmo papel nas telas). Devolve (classificação por
    linha via função, pendências). Nome sem classificação fica fora; vai para a curadoria, salvo quando está em
    `fora_do_universo` ou quando todos os papéis dele estão na tela BTG em setor que não é Transporte."""
    idx = indexar(emissores)
    fora = {normalizar(n) for n in emissores.get("fora_do_universo", [])}
    setor = {t["ticker"]: t["setor"] for t in telas if t["origem"] == "BTG" and t["setor"]}
    nomes_tela = defaultdict(list)
    for t in telas:
        nomes_tela[t["ticker"]].append(t["emissor"])

    def classe(nome, ticker):
        c = classificar(nome, idx)
        for n in ([] if c else nomes_tela.get(ticker, [])):
            c = classificar(n, idx)
            if c:
                break
        return c

    sem = defaultdict(lambda: {"origens": set(), "tickers": set()})
    fontes = ([(t, f"tela {t['origem']}") for t in telas] + [(n, "negócios BTG") for n in mov["negocios"]]
              + [(i, "intenções XP") for i in mov["intencoes"]])
    for row, origem in fontes:
        if classe(row["emissor"], row["ticker"]) is None:
            s = sem[row["emissor"]]
            s["origens"].add(origem)
            s["tickers"].add(row["ticker"])
    pend = []
    for nome, s in sorted(sem.items(), key=lambda x: str(x[0])):
        setores = {setor.get(t) for t in s["tickers"]}
        if normalizar(nome) in fora or (None not in setores and SETOR_TRANSPORTE not in setores):
            continue
        pend.append({"nome": nome, "origens": sorted(s["origens"]), "papeis": len(s["tickers"])})
    return classe, pend


def _emissoes(telas, classe):
    por = defaultdict(dict)
    for t in telas:
        por[t["ticker"]].setdefault(t["origem"], t)
    out = []
    for ticker, fontes in por.items():
        btg, xp = fontes.get("BTG"), fontes.get("XP")
        c = classe(btg["emissor"], ticker) if btg else None
        c = c or (classe(xp["emissor"], ticker) if xp else None)
        if not c:
            continue
        val = lambda k: next((f[k] for f in (btg, xp) if f and f[k] is not None), None)  # noqa: E731
        out.append({"ticker": ticker, "emissor": c["nome"], "subsetor": c["subsetor"], "grupo": c["grupo"],
                    "indexador": val("indexador"), "taxa_emissao": _r(val("taxa_emissao"), 4),
                    "vencimento": val("vencimento"), "volume_emitido": val("volume_emitido"),
                    "incentivada": val("incentivada"), "rating": val("rating"), "data_emissao": None,
                    "coordenadores": None, "fontes": [o for o in ("BTG", "XP") if o in fontes]})
    return sorted(out, key=lambda e: (e["emissor"], e["vencimento"] or "", e["ticker"]))


# ---------- séries públicas ----------

def _ler_json(path):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def _baixado(manifesto, urls):
    """Dia do último download dos arquivos de `urls` (o mais recente entre eles), ou None se o manifesto não os traz."""
    datas = [i.get("baixado") or i["acesso"] for i in manifesto.items if i.get("url") in urls and i.get("acesso")]
    return max(datas) if datas else None


def _macro(publico, hoje, manifesto):
    """(macro, curvas, séries ausentes). Vale o último valor até o dia em que o arquivo da série foi baixado (a Selic
    meta vem publicada para os dias seguintes, até a próxima reunião do Copom: nunca vale uma data posterior ao
    download); sem registro do download no manifesto, até `hoje`. Assim o resultado depende do arquivo, não do dia em
    que o build roda. Série sem arquivo (ou ilegível) fica None e vai para as pendências."""
    publico = Path(publico)
    macro, ausentes = {}, []
    for chave, (cod, n, arq) in SERIES.items():
        dados = _ler_json(publico / arq)
        limite = _baixado(manifesto, {SGS.format(cod, n)}) or hoje
        validos = [d for d in dados if (para_data(d.get("data")) or "9") <= limite] if isinstance(dados, list) else []
        ult = validos[-1] if validos else None
        if not ult:
            macro[chave] = None
            ausentes.append(chave)
            continue
        valor, data = float(ult["valor"]), para_data(ult["data"])
        if chave == "cdi":  # SGS 12 é a taxa diária (% a.d.): anualizada em 252 dias úteis
            valor = ((1 + valor / 100) ** DIAS_UTEIS - 1) * 100
        if chave == "ipca12m":
            data = data[:7]
        macro[chave] = {"valor": round(valor, 2), "data": data}
    focus = _ler_json(publico / FOCUS)
    vals = (focus or {}).get("value") if isinstance(focus, dict) else None
    if vals:
        f = max(vals, key=lambda v: v["Data"])
        macro["focus_ipca"] = {"valor": round(float(f["Mediana"]), 2), "data": f["Data"]}
    else:
        macro["focus_ipca"] = None
        ausentes.append("focus")
    curvas = {}
    if (publico / TESOURO).exists():
        curvas = ler_tesouro(publico / TESOURO)
    else:
        ausentes.append("tesouro")
    ultima = max(curvas) if curvas else None
    macro["ntnb"] = [{"vencimento": v, "taxa": t, "data": ultima, "titulo": tit} for v, t, tit in curvas.get(ultima, [])]
    return macro, curvas, ausentes


# ---------- fontes ----------

def _br(iso):
    return f"{iso[8:10]}/{iso[5:7]}/{iso[:4]}" if iso and len(iso) == 10 else (f"{iso[5:7]}/{iso[:4]}" if iso else "")


def _intervalo(datas):
    datas = sorted(d for d in datas if d)
    if not datas:
        return ""
    return _br(datas[0]) if datas[0] == datas[-1] else f"{_br(datas[0])} a {_br(datas[-1])}"


def registrar_planilhas(manifesto, arquivos, hoje):
    """Registra no manifesto as planilhas do usuário (arquivo, SHA-256, `acesso`). `acesso` é o dia em que o conteúdo
    foi visto pela primeira vez: o mesmo SHA-256, com o mesmo nome ou outro, mantém a data; arquivo novo ou alterado
    leva `hoje`. Assim o bloco não muda quando o build roda de novo em outro dia. Planilha que saiu da pasta sai do
    manifesto. Devolve {caminho: acesso}."""
    antes = {i["sha256"]: i["acesso"] for i in manifesto.items if not i.get("url") and i.get("acesso")}
    novos, acessos = [], {}
    for p in arquivos:
        p = Path(p)
        sha = sha256(p)
        acessos[p] = antes.get(sha, hoje)
        novos.append({"dominio": "debentures", "descricao": "Planilha de debêntures das corretoras, fornecida ao projeto",
                      "url": "", "arquivo": _rel(p), "bytes": p.stat().st_size, "sha256": sha, "periodo": "",
                      "licenca": "Dados de corretora, fornecidos ao projeto; uso restrito", "acesso": acessos[p]})
    manifesto.items = [i for i in manifesto.items if i.get("url")] + novos
    return acessos


def _fontes(telas, mov, macro, curvas, dias_usados, manifesto, acesso_corretora, hoje):
    """Fontes do bloco. Datas das planilhas vêm dos dados (data da tela, horário dos negócios e das intenções); o acesso
    de cada corretora é o dia em que se viu pela primeira vez a planilha mais recente que a traz (`acesso_corretora`), o
    das séries públicas é o do último download (manifesto). Nenhuma data vem do dia em que o bloco é gerado."""
    tela_btg = _intervalo(t["data"] for t in telas if t["origem"] == "BTG")
    tela_xp = _intervalo(t["data"] for t in telas if t["origem"] == "XP")
    xp_sem_data = not tela_xp  # a tela XP traz só a hora da atualização: vale a data da tela BTG (dito na nota da fonte)
    if xp_sem_data:
        tela_xp = tela_btg or "sem data na planilha"
    tela_btg = tela_btg or "sem data na planilha"
    neg = _intervalo(n["data"] for n in mov["negocios"])
    inten = _intervalo(i["data"] for i in mov["intencoes"])
    usuario = "Planilha exportada da plataforma da corretora e fornecida ao projeto; não há endereço público para estes dados."
    out = [
        {"nome": "BTG — tela de debêntures e negócios fechados no mercado secundário", "url": "https://www.btgpactual.com/",
         "periodo": f"tela de {tela_btg}; negócios de {neg}" if neg else f"tela de {tela_btg}",
         "acesso": acesso_corretora.get("BTG") or hoje,
         "licenca": "Dados de corretora, fornecidos ao projeto; uso restrito", "tipo": "medido",
         "nota": usuario + " Da tela vêm emissor, setor, indexador, taxa de emissão, vencimento, volume emitido e se a "
                 "debênture é incentivada. O universo são os emissores de transporte classificados à mão a partir do "
                 "setor Transporte da tela e dos nomes que aparecem nas planilhas (a tela põe algumas concessionárias "
                 "de rodovia em outros setores). Os negócios fechados entram só somados por dia, emissor e subsetor, "
                 "com o último negócio de cada papel; registros com volume zero contam no número de negócios, mas "
                 "não nas médias."},
        {"nome": "XP — tela de debêntures e intenções de compra e venda", "url": "https://www.xpi.com.br/",
         "periodo": f"tela de {tela_xp}; intenções de {inten}" if inten else f"tela de {tela_xp}",
         "acesso": acesso_corretora.get("XP") or hoje,
         "licenca": "Dados de corretora, fornecidos ao projeto; uso restrito", "tipo": "medido",
         "nota": usuario + " Da tela vêm a taxa de emissão e a nota de crédito (rating). As intenções são pedidos de "
                 "compra ou venda, não negócios realizados: ficam à parte, somadas por direção, dia, emissor e "
                 "subsetor, com o último pedido de cada papel."
                 + (" A tela da XP traz só a hora da atualização, não a data; vale a data da tela da BTG." if xp_sem_data else "")},
    ]
    sgs = [k for k in SERIES if macro.get(k)]
    if sgs:
        urls = {SGS.format(SERIES[k][0], SERIES[k][1]) for k in sgs}
        datas = {k: macro[k]["data"] for k in sgs}
        out.append({"nome": "Banco Central do Brasil — Sistema Gerenciador de Séries Temporais (Selic, CDI e IPCA)",
                    "url": "https://www3.bcb.gov.br/sgspub/", "acesso": _baixado(manifesto, urls) or hoje,
                    "periodo": "; ".join(f"{ROTULO_SERIE[k].split(' (')[0]}: {_br(d)}" for k, d in datas.items()),
                    "licenca": "Dados abertos do Banco Central do Brasil", "tipo": "medido",
                    "nota": "Último valor publicado da Selic meta (série 432), do CDI (série 12, taxa diária anualizada "
                            "em 252 dias úteis) e do IPCA acumulado em 12 meses (série 13522)."})
    if macro.get("focus_ipca"):
        out.append({"nome": "Banco Central do Brasil — Expectativas de mercado (Boletim Focus), IPCA dos próximos 12 meses",
                    "url": "https://www.bcb.gov.br/publicacoes/focus", "acesso": _baixado(manifesto, {FOCUS_URL}) or hoje,
                    "periodo": _br(macro["focus_ipca"]["data"]), "licenca": "Dados abertos do Banco Central do Brasil",
                    "tipo": "medido",
                    "nota": "Mediana das expectativas das instituições pesquisadas para o IPCA dos próximos 12 meses "
                            "(série suavizada), na data mais recente."})
    if curvas:
        out.append({"nome": "Tesouro Nacional — Taxas dos títulos ofertados pelo Tesouro Direto (NTN-B)",
                    "url": TESOURO_PAGINA, "acesso": _baixado(manifesto, {TESOURO_URL}) or hoje,
                    "periodo": _intervalo(dias_usados | {max(curvas)}),
                    "licenca": "Licença Aberta para Bases de Dados (ODbL) do Open Data Commons", "tipo": "medido",
                    "nota": "Taxa de compra da manhã do Tesouro IPCA+ com Juros Semestrais (NTN-B) e do Tesouro IPCA+ "
                            "(NTN-B Principal); no mesmo vencimento vale a NTN-B com juros. Spread = taxa da debênture "
                            "IPCA+ − NTN-B (Tesouro Direto, taxa de compra) interpolada pelo vencimento (não pela "
                            "duration), em linha reta entre os dois vencimentos vizinhos na curva do mesmo dia. Sem "
                            "curva no dia, ou com vencimento fora da curva, o spread fica sem valor: não há "
                            "extrapolação."})
    return out


# ---------- bloco ----------

def plausivel(taxa, indexador):
    lo, hi = LIMITES_TAXA.get(indexador, LIMITES_PADRAO)
    return taxa is None or lo < taxa <= hi


def montar(pasta=PASTA, publico=PUBLICO, emissores=EMISSORES, ler_telas=ler_telas, ler_negocios=ler_negocios,
           hoje=None, manifesto=None):
    """Bloco data/intel/debentures.json a partir das planilhas de `pasta`, das séries de `publico` e da classificação
    `emissores` (caminho). `ler_telas`/`ler_negocios`: leitores trocáveis (ver o início do arquivo). `hoje`: data de
    referência de planilha vista pela primeira vez e das séries sem registro de download (AAAA-MM-DD; padrão, hoje).
    `manifesto`: onde ficam o dia em que cada planilha foi vista e o do download das séries (padrão, o do domínio; quem
    chama grava com `save`). Sem planilhas: FileNotFoundError."""
    arquivos = planilhas(pasta)
    if not arquivos:
        raise FileNotFoundError(2, "nenhuma planilha .xlsx", str(Path(pasta) / "*.xlsx"))
    hoje = hoje or dt.date.today().isoformat()
    manifesto = manifesto if manifesto is not None else Manifest("debentures")
    acessos = registrar_planilhas(manifesto, arquivos, hoje)
    telas, mov, acesso_corretora = [], {"negocios": [], "intencoes": []}, {}
    for p in arquivos:
        ts, m = ler_telas(p), ler_negocios(p)
        telas += ts
        mov["negocios"] += m["negocios"]
        mov["intencoes"] += m["intencoes"]
        traz = {t["origem"] for t in ts} | ({"BTG"} if m["negocios"] else set()) | ({"XP"} if m["intencoes"] else set())
        for o in traz:
            acesso_corretora[o] = max(acesso_corretora.get(o, ""), acessos[Path(p)])
    emis = carregar_emissores(emissores)
    classe, pend = _universo(telas, mov, emis)
    macro, curvas, ausentes = _macro(publico, hoje, manifesto)

    dias_sem_curva, dias_usados, descartadas, sem_data = set(), set(), defaultdict(int), defaultdict(int)
    universo = {}
    for tipo in ("negocios", "intencoes"):
        linhas = []
        for l in mov[tipo]:
            c = classe(l["emissor"], l["ticker"])
            if not c:
                continue
            if not l["data"]:  # horário ilegível: fora dos totais, contado na curadoria
                sem_data[ORIGEM[tipo]] += 1
                continue
            if not plausivel(l["taxa"], l["indexador"]):
                descartadas[(l["ticker"], ORIGEM[tipo], l["indexador"], l["taxa"])] += 1
                l = {**l, "taxa": None}
            curva = curva_ntnb(l["data"], curvas)
            if l["indexador"] == "IPCA+":
                (dias_usados if curva else dias_sem_curva).add(l["data"])
            linhas.append({**l, "emissor_classe": c["nome"], "subsetor": c["subsetor"], "grupo": c["grupo"],
                           "spread": spread(l["taxa"], l["vencimento"], curva, l["indexador"])})
        universo[tipo] = linhas
    agreg = lambda ls, d=False: _conjunto([{**l, "emissor": l["emissor_classe"]} for l in ls], d)  # noqa: E731
    datas = [l["data"] for t in ("negocios", "intencoes") for l in mov[t] if l["data"]]
    return {
        "fonte": _fontes(telas, mov, macro, curvas, dias_usados, manifesto, acesso_corretora, hoje),
        "tipo": "medido",
        "macro": macro,
        "emissoes": _emissoes(telas, classe),
        "secundario": {
            "periodo": {"de": min(datas), "ate": max(datas)} if datas else {"de": None, "ate": None},
            "negocios": agreg(universo["negocios"]),
            "intencoes": agreg(universo["intencoes"], True),
            "ultimo_por_ticker": sorted(_ultimos(universo["negocios"], "negocio") + _ultimos(universo["intencoes"], "intencao"),
                                        key=lambda u: (u["ticker"], u["origem"])),
        },
        "pendencias": {
            "emissores_sem_classificacao": pend,
            "series_indisponiveis": [{"serie": ROTULO_SERIE[k], "arquivo": _rel(Path(publico) / ARQUIVO_SERIE[k])}
                                     for k in ausentes],
            "dias_sem_curva": sorted(dias_sem_curva) if curvas else [],
            "taxas_descartadas": [{"ticker": t, "origem": o, "indexador": i, "taxa": x, "n": n}
                                  for (t, o, i, x), n in sorted(descartadas.items())],
            "linhas_sem_data": [{"origem": o, "n": n} for o, n in sorted(sem_data.items())],
        },
    }


def _rel(p):
    try:
        return Path(p).resolve().relative_to(ROOT).as_posix()
    except ValueError:
        return str(p)


def fetch(force=False):  # noqa: ARG001 — `force` existe pela interface comum; aqui sempre se baixa de novo
    """Baixa de novo as séries públicas (dados diários: Selic, CDI, IPCA, Focus e o histórico do Tesouro Direto) para
    data/raw/debentures/publico/ e registra no manifesto, com ou sem `force`. Série que não responde depois das novas
    tentativas não interrompe as outras: fica o arquivo anterior (o download vai para um arquivo temporário) e o aviso;
    sem arquivo nenhum, o `build` gera o bloco sem ela e a curadoria pede nova tentativa (sem o Tesouro, spread "—")."""
    m = Manifest("debentures")
    bcb = "Dados abertos do Banco Central do Brasil"
    alvos = [(SGS.format(c, n), arq, f"Banco Central, SGS série {c} ({ROTULO_SERIE[k].split(' (')[0]})", 5, bcb)
             for k, (c, n, arq) in SERIES.items()]
    alvos += [(FOCUS_URL, FOCUS, "Banco Central, expectativas de mercado (Focus): IPCA 12 meses", 5, bcb),
              (TESOURO_URL, TESOURO, "Tesouro Nacional, preço e taxa dos títulos do Tesouro Direto (histórico)",
               TENTATIVAS_TESOURO, "Licença Aberta para Bases de Dados (ODbL) do Open Data Commons")]
    falhas = []
    for url, arq, descricao, tentativas, licenca in alvos:
        try:
            dest = _fetch(url, PUBLICO / arq, tries=tentativas, force=True)
        except RuntimeError as e:
            falhas.append(arq)
            print(f"AVISO: {e}", file=sys.stderr)
            continue
        m.add(url, dest, descricao, licenca=licenca)["baixado"] = dt.date.today().isoformat()
    m.save()
    if falhas:
        print(f"AVISO: séries públicas sem download: {', '.join(falhas)}", file=sys.stderr)


def build():
    manifesto = Manifest("debentures")
    doc = montar(manifesto=manifesto)
    manifesto.save()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    sec, p = doc["secundario"], doc["pendencias"]
    n = lambda g: sum(r["n"] for r in sec[g]["por_dia"])  # noqa: E731
    print(f"{OUT.relative_to(ROOT)}: {len(doc['emissoes'])} emissões de {len({e['emissor'] for e in doc['emissoes']})} "
          f"emissores | {n('negocios')} negócios e {n('intencoes')} intenções no universo | "
          f"{len(p['emissores_sem_classificacao'])} emissores sem classificação | "
          f"séries ausentes: {', '.join(s['serie'] for s in p['series_indisponiveis']) or 'nenhuma'} | "
          f"linhas sem data: {sum(x['n'] for x in p['linhas_sem_data'])} | "
          f"dias sem curva: {len(p['dias_sem_curva'])}")
    return doc


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "all"
    if cmd in ("fetch", "all"):
        fetch()
    if cmd in ("build", "all"):
        build()
