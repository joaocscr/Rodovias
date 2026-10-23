"""IDA, Índice de Debêntures ANBIMA: número-índice, duration e spread sobre a NTN-B dos quatro subíndices, e a taxa
indicativa dos papéis de transporte.

Fonte: "Resultado diário por índice" do site da ANBIMA (consulta em CSV, sem login). Um pedido por índice e por dia
devolve texto latin-1 separado por `;`: a linha do índice (número-índice, variações, duration, valor de mercado) e a
carteira teórica do dia (código, vencimento, indexador, taxa indicativa e peso de cada papel). Dia sem resultado
(feriado, fim de semana) vem com um aviso no lugar do arquivo ou sem a linha do índice.

- `fetch` baixa só os dias que faltam no cache `data/raw/ida/cache.json`, com pausa entre os pedidos e novas tentativas.
  Os dias pedidos são o último dia útil de cada semana dos últimos 24 meses e todos os dias úteis dos últimos 31 dias;
  semana cuja sexta-feira não tem resultado (feriado) recua até o primeiro dia com resultado. O site só entrega os
  resultados recentes (em out/2026, os de 14/10 em diante; o histórico está no ANBIMA Feed, com login): as semanas são
  percorridas da mais recente para a mais antiga e a volta termina depois de 4 semanas seguidas sem resultado. A série
  cresce a cada execução. Dia sem resultado fica no cache como "sem_dado"; dia que falhou nas tentativas não entra e é
  pedido de novo na próxima vez. A carteira do dia
  mais recente de cada índice fica em `data/raw/ida/carteira_<ÍNDICE>_<data>.csv`; a do IPCA Infraestrutura de cada dia
  fica no cache em forma enxuta (vencimento, taxa e peso dos papéis IPCA), de onde sai a série de spread.
- `build` lê só o cache (nunca a rede). "Hoje", para a janela de amostragem, é o último dia com resultado no cache, não o
  relógio: o bloco não muda com o dia em que o comando roda.
- Spread = taxa indicativa − NTN-B do Tesouro Direto (taxa de compra) do mesmo dia, interpolada pelo vencimento
  (`debentures.spread`). Média ponderada pelo peso na carteira; dia sem curva fica sem valor.
"""
import datetime as dt
import json
import re
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from intel import debentures as _deb  # noqa: E402
from intel.debentures_texto import numero, para_data  # noqa: E402
from intel.fontes import RAW, ROOT, UA, Manifest  # noqa: E402

URL = "https://www.anbima.com.br/informacoes/ida/IDA_down.asp"
PAGINA = "https://www.anbima.com.br/informacoes/ida/default.asp"
PASTA = RAW / "ida"
OUT = ROOT / "data" / "intel" / "ida.json"
DEBENTURES = ROOT / "data" / "intel" / "debentures.json"
LICENCA = "Consulta pública do site da ANBIMA; a página não declara licença de reuso"

INDICES = {"IPCA_INFRAESTRUTURA": "IDA-IPCA Infraestrutura", "IPCA": "IDA-IPCA", "GERAL": "IDA-Geral", "DI": "IDA-DI"}
INFRA = "IPCA_INFRAESTRUTURA"
SEM_DADO = "sem_dado"
AVISO_SEM_DADO = "Ocorreu um erro na leitura do arquivo XML"  # resposta do site para feriado e fim de semana
MARCA = "Índice de Debêntures ANBIMA"                          # título que toda resposta com dados traz
MESES = 24
DIAS_RECENTES = 31
PAUSA = 0.5
ESPERAS = (5, 30)             # entre as 3 tentativas de cada pedido (o site responde 429 em rajadas)
SALVAR_A_CADA = 40
SEMANAS_VAZIAS = 4            # o site só guarda os resultados recentes: depois de 4 semanas seguidas sem nenhum, para de recuar
FALHAS_SEGUIDAS = 6           # pedidos seguidos que falham: o site está fora do ar, o índice fica para a próxima vez
BUSCA_PAPEIS = (INFRA, "IPCA", "GERAL")   # carteiras onde se procura a taxa indicativa dos papéis de transporte
CAMPOS_INDICE = ("numero_indice", "var_dia", "var_mes", "var_ano", "var_12m", "var_24m", "duration_du", "valor_mercado")


# ---------- leitura do CSV ----------

def ler_csv(texto):
    """{"indice": {data, numero_indice, var_dia, var_mes, var_ano, var_12m, var_24m, duration_du, valor_mercado} | None,
    "carteira": [{codigo, emissor, vencimento, indexador, taxa_indicativa, peso}]}. Números pt-BR já convertidos, datas
    AAAA-MM-DD. Dia sem resultado não traz a linha do índice: "indice" None. Sem carteira, lista vazia."""
    linhas = texto.splitlines()
    indice, carteira, colunas = None, [], None
    for k, linha in enumerate(linhas):
        campos = [c.strip() for c in linha.split(";")]
        if campos[0] == "Data" and len(campos) > 1 and campos[1] == "Número Índice":
            prox = linhas[k + 1].split(";") if k + 1 < len(linhas) else []
            data = para_data(prox[0]) if len(prox) >= 10 else None
            if data:
                v = [numero(c) for c in prox[1:10]]
                indice = {"data": data, "numero_indice": v[0], "var_dia": v[1], "var_mes": v[2], "var_ano": v[3],
                          "var_12m": v[4], "var_24m": v[5], "duration_du": v[6], "valor_mercado": v[8]}
        elif campos[0] == "Data" and len(campos) > 1 and campos[1] == "Código":
            colunas = {c: i for i, c in enumerate(campos)}
        elif colunas and para_data(campos[0]) and len(campos) >= len(colunas) - 1:
            def col(nome):
                i = colunas.get(nome)
                return campos[i] if i is not None and i < len(campos) else ""
            carteira.append({"codigo": col("Código"), "emissor": col("Nome do Emissor"),
                             "vencimento": para_data(col("Data de Vencimento")), "indexador": col("Indexador"),
                             "taxa_indicativa": numero(col("Taxa Indicativa (% a.a.)")), "peso": numero(col("Peso (%)"))})
    return {"indice": indice, "carteira": carteira}


def spread_medio(carteira, curva):
    """Média ponderada pelo peso dos spreads (pontos percentuais) dos papéis IPCA da carteira que têm spread na `curva`
    do dia. Papel sem spread (sem curva, vencimento fora dela, sem taxa ou sem peso) sai do numerador e do denominador;
    sem nenhum spread, None. Carteira: itens com vencimento, indexador, taxa_indicativa e peso."""
    soma = pesos = 0.0
    for p in carteira:
        if p.get("indexador") != "IPCA" or not p.get("peso"):
            continue
        s = _deb.spread(p.get("taxa_indicativa"), p.get("vencimento"), curva, "IPCA+")
        if s is not None:
            soma += p["peso"] * s
            pesos += p["peso"]
    return soma / pesos if pesos else None


# ---------- datas da amostra ----------

def _data(v):
    return v if isinstance(v, dt.date) else dt.date.fromisoformat(v)


def _menos_meses(d, n):
    m = d.year * 12 + d.month - 1 - n
    ano, mes = divmod(m, 12)
    mes += 1
    dia = d.day
    while True:
        try:
            return dt.date(ano, mes, dia)
        except ValueError:
            dia -= 1


def plano(hoje):
    """(recentes, semanas): `recentes` são os dias úteis dos últimos 31 dias até `hoje`; `semanas`, uma lista por semana
    da janela de 24 meses com os dias úteis em ordem decrescente (sexta a segunda), dos quais vale o primeiro que tem
    resultado."""
    hoje = _data(hoje)
    ini = _menos_meses(hoje, MESES)
    recentes = [hoje - dt.timedelta(days=k) for k in range(DIAS_RECENTES - 1, -1, -1)]
    recentes = [d for d in recentes if d.weekday() < 5]
    semanas = []
    seg = ini - dt.timedelta(days=ini.weekday())
    while seg <= hoje:
        dias = [seg + dt.timedelta(days=k) for k in range(4, -1, -1)]
        dias = [d for d in dias if ini <= d <= hoje]
        if dias:
            semanas.append(dias)
        seg += dt.timedelta(days=7)
    return recentes, semanas


def lacunas(cache_indice, hoje):
    """Dias do plano que o cache do índice não tem (e por isso precisam de download): todo dia útil recente, e em cada
    semana o primeiro dia, da sexta para trás, até achar um com resultado. Dias anteriores ao primeiro resultado do
    cache não contam: o site só guarda os resultados recentes e o que nunca existiu não é falha."""
    inicio = min(_dias_com_dado(cache_indice), default=None)
    if inicio is None:
        return []
    recentes, semanas = plano(hoje)
    falta = {d.isoformat() for d in recentes if d.isoformat() >= inicio and d.isoformat() not in cache_indice}
    for dias in semanas:
        for d in dias:
            v = cache_indice.get(d.isoformat())
            if v is None:
                if d.isoformat() >= inicio:
                    falta.add(d.isoformat())
                    break
                continue
            if v != SEM_DADO:
                break
    return sorted(falta)


# ---------- download ----------

def _consultar(indice, data):
    """Uma consulta ao site (POST): os bytes da resposta. RuntimeError se o curl falha ou o site responde com erro."""
    corpo = f"tipo=cd&indice={indice}&escolha=2&Idioma=PT&saida=csv&DataIniD={data[8:]}/{data[5:7]}/{data[:4]}"
    r = subprocess.run(["curl", "-sS", "--fail", "-A", UA, "-m", "120", "-X", "POST", "-d", corpo, URL],
                       capture_output=True)
    if r.returncode != 0 or not r.stdout:
        raise RuntimeError(r.stderr.decode("latin-1", "replace").strip() or "resposta vazia")
    return r.stdout


def _interpretar(bruto, data, indice):
    """Resposta do dia → SEM_DADO ou a linha de resumo do cache. ValueError se a resposta não é nem uma coisa nem outra
    (página de erro, limite de pedidos): o dia não entra no cache e é pedido de novo na próxima vez."""
    texto = bruto.decode("latin-1")
    if AVISO_SEM_DADO in texto:
        return SEM_DADO
    if MARCA not in texto:
        raise ValueError("resposta que não é a do IDA: " + texto[:80].replace("\n", " "))
    lido = ler_csv(texto)
    linha = lido["indice"]
    if linha is None or linha["data"] != data:
        return SEM_DADO
    resumo = {k: linha[k] for k in CAMPOS_INDICE}
    if indice == INFRA:
        resumo["carteira"] = [[p["vencimento"], p["taxa_indicativa"], p["peso"]] for p in lido["carteira"]
                              if p["indexador"] == "IPCA" and p["vencimento"]]
    return resumo


def _ler_cache(pasta):
    try:
        dados = json.loads((Path(pasta) / "cache.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    return dados if isinstance(dados, dict) else {}


def _gravar_cache(pasta, cache):
    pasta = Path(pasta)
    pasta.mkdir(parents=True, exist_ok=True)
    tmp = pasta / "cache.json.novo"
    tmp.write_text(json.dumps(cache, ensure_ascii=False, sort_keys=True, separators=(",", ":")), encoding="utf-8")
    tmp.replace(pasta / "cache.json")


def _dias_com_dado(cache_indice):
    return sorted(d for d, v in cache_indice.items() if v != SEM_DADO)


def carteiras_baixadas(pasta=PASTA):
    """{índice: (data, caminho)} do arquivo `carteira_<ÍNDICE>_<data>.csv` mais recente de cada índice."""
    out = {}
    for p in sorted(Path(pasta).glob("carteira_*_*.csv")):
        m = re.fullmatch(r"carteira_(.+)_(\d{4}-\d{2}-\d{2})\.csv", p.name)
        if m and m.group(1) in INDICES and (m.group(1) not in out or m.group(2) > out[m.group(1)][0]):
            out[m.group(1)] = (m.group(2), p)
    return out


def _periodo(cache):
    dias = sorted(d for ind in INDICES for d in _dias_com_dado(cache.get(ind) or {}))
    if not dias:
        return ""
    return _br(dias[0]) if dias[0] == dias[-1] else f"{_br(dias[0])} a {_br(dias[-1])}"


def registrar(manifesto, pasta=PASTA):
    """Registra no manifesto o cache e as carteiras mais recentes (caminho, SHA-256 e `acesso`, que é o dia em que o
    conteúdo apareceu pela primeira vez: o mesmo SHA-256 mantém a data)."""
    pasta = Path(pasta)
    if (pasta / "cache.json").exists():
        manifesto.add(URL, pasta / "cache.json",
                      "ANBIMA, IDA: resultado diário dos quatro subíndices (dias baixados)",
                      periodo=_periodo(_ler_cache(pasta)), licenca=LICENCA)
    for ind, (data, caminho) in sorted(carteiras_baixadas(pasta).items()):
        manifesto.add(URL, caminho, f"ANBIMA, IDA: carteira teórica do {INDICES[ind]} em {_br(data)}",
                      periodo=_br(data), licenca=LICENCA)


class _SiteForaDoAr(Exception):
    pass


def fetch(force=False, consultar=_consultar, hoje=None, pausa=PAUSA, dormir=time.sleep, pasta=PASTA, manifesto=None,
          indices=tuple(INDICES), log=print):
    """Baixa os dias que faltam no cache (ver o topo do arquivo). Com `force`, pede de novo todos os dias da amostra e
    só troca o que veio bom: o dia que falha continua com o valor anterior. `hoje`: dia de referência da janela (padrão:
    o relógio, porque aqui o que importa é o que já foi publicado). As semanas são percorridas da mais recente para a mais
    antiga e a volta termina depois de `SEMANAS_VAZIAS` semanas seguidas sem resultado nenhum (o site só guarda os dias
    recentes). Pedido que falha em 3 tentativas não derruba os outros: o dia fica de fora do cache e a curadoria avisa;
    `FALHAS_SEGUIDAS` pedidos assim, um depois do outro, encerram o índice (site fora do ar). Devolve o número de
    pedidos feitos."""
    pasta = Path(pasta)
    hoje = _data(hoje) if hoje else dt.date.today()
    cache = _ler_cache(pasta)
    recentes, semanas = plano(hoje)
    feitos, ultimo_bruto, falhas, pedidos, seguidas = set(), {}, [], [0], [0]

    def pedir(ind, d):
        iso = d.isoformat()
        cache.setdefault(ind, {})
        if (ind, iso) in feitos or (iso in cache[ind] and not force):
            return cache[ind].get(iso)
        feitos.add((ind, iso))
        valor, erro = None, None
        for k in range(len(ESPERAS) + 1):
            try:
                bruto = consultar(ind, iso)
                valor = _interpretar(bruto, iso, ind)
                erro = None
            except (RuntimeError, ValueError, OSError) as e:
                erro = e
            pedidos[0] += 1
            dormir(pausa)
            if erro is None:
                break
            if k < len(ESPERAS):
                dormir(ESPERAS[k])
        if erro is not None:
            falhas.append(f"{ind} {iso}: {erro}")
            seguidas[0] += 1
            if seguidas[0] >= FALHAS_SEGUIDAS:
                raise _SiteForaDoAr(ind)
            return cache[ind].get(iso)
        seguidas[0] = 0
        cache[ind][iso] = valor
        if valor != SEM_DADO and iso >= ultimo_bruto.get(ind, ("",))[0]:
            ultimo_bruto[ind] = (iso, bruto)
        if pedidos[0] % SALVAR_A_CADA == 0:
            _gravar_cache(pasta, cache)
            log(f"IDA: {pedidos[0]} pedidos")
        return valor

    for ind in indices:
        cache.setdefault(ind, {})
        seguidas[0] = 0
        try:
            for d in recentes:
                pedir(ind, d)
            vazias = 0
            for dias in reversed(semanas):
                estado = "vazia"
                for d in dias:                     # da sexta para trás, até o primeiro dia com resultado
                    v = pedir(ind, d)
                    if v is None:
                        estado = "incerta"
                        break
                    if v != SEM_DADO:
                        estado = "dado"
                        break
                vazias = vazias + 1 if estado == "vazia" else 0
                if vazias >= SEMANAS_VAZIAS:
                    break
        except _SiteForaDoAr:
            print(f"AVISO: IDA {ind}: o site não respondeu a {FALHAS_SEGUIDAS} pedidos seguidos; o resto fica para a "
                  "próxima vez", file=sys.stderr)
        # dia sem resultado depois do último com resultado ainda pode não ter sido publicado: não fica no cache
        ultimo = max(_dias_com_dado(cache[ind]), default="")
        for iso in [i for i, v in cache[ind].items() if v == SEM_DADO and i > ultimo]:
            del cache[ind][iso]
    _gravar_cache(pasta, cache)

    for ind in indices:
        dias = _dias_com_dado(cache.get(ind) or {})
        if not dias:
            continue
        alvo = pasta / f"carteira_{ind}_{dias[-1]}.csv"
        if ultimo_bruto.get(ind, ("",))[0] == dias[-1]:
            alvo.write_bytes(ultimo_bruto[ind][1])
        elif not alvo.exists():
            try:
                alvo.write_bytes(consultar(ind, dias[-1]))
                dormir(pausa)
                pedidos[0] += 1
            except (RuntimeError, OSError) as e:
                falhas.append(f"{ind} carteira de {dias[-1]}: {e}")
        for velho in pasta.glob("carteira_*.csv"):
            if velho != alvo and velho.name.startswith(f"carteira_{ind}_") and re.fullmatch(
                    r"\d{4}-\d{2}-\d{2}\.csv", velho.name[len(f"carteira_{ind}_"):]):
                velho.unlink()
    for f in falhas:
        print(f"AVISO: IDA sem download: {f}", file=sys.stderr)
    if manifesto is None:
        manifesto = Manifest("ida")
        registrar(manifesto, pasta)
        manifesto.save()
    else:
        registrar(manifesto, pasta)
    return pedidos[0]


# ---------- bloco ----------

def _br(iso):
    return f"{iso[8:10]}/{iso[5:7]}/{iso[:4]}"


def _segunda(d):
    return d - dt.timedelta(days=d.weekday())


def _amostra(dias, hoje):
    """Dos dias com resultado (`dias`, AAAA-MM-DD, em ordem), os da janela de 24 meses até `hoje` que são dos últimos 31
    dias ou o último dia com resultado da semana."""
    hoje = _data(hoje)
    ini, recente = _menos_meses(hoje, MESES).isoformat(), (hoje - dt.timedelta(days=DIAS_RECENTES - 1)).isoformat()
    ultimo_da_semana = {_segunda(dt.date.fromisoformat(d)): d for d in dias}  # fica o último de cada semana
    return [d for d in dias if ini <= d <= hoje.isoformat()
            and (d >= recente or ultimo_da_semana[_segunda(dt.date.fromisoformat(d))] == d)]


def _carteira_do_cache(linhas):
    return [{"vencimento": v, "indexador": "IPCA", "taxa_indicativa": t, "peso": p} for v, t, p in linhas]


def _serie(ind, cache_indice, hoje, curvas):
    dias = _amostra(_dias_com_dado(cache_indice), hoje)
    serie = []
    for d in dias:
        l = cache_indice[d]
        ponto = {"data": d, "numero_indice": l["numero_indice"], "base100": None, "duration_du": l["duration_du"]}
        if ind == INFRA:
            s = spread_medio(_carteira_do_cache(l.get("carteira") or []), _deb.curva_ntnb(d, curvas))
            ponto["spread_medio"] = None if s is None else round(s, 4)
        serie.append(ponto)
    base = serie[0]["numero_indice"] if serie else None
    for p in serie:
        p["base100"] = round(p["numero_indice"] / base * 100, 4) if base else None
    return serie


def _papeis(carteiras, tickers, curvas):
    """{código: {taxa_indicativa, spread, data}} dos papéis de `tickers` na carteira mais recente do IDA (primeiro o IPCA
    Infraestrutura, depois o IPCA e o Geral); só papéis IPCA, para a taxa ser comparável à IPCA+ do painel."""
    out = {}
    for ind in BUSCA_PAPEIS:
        if ind not in carteiras:
            continue
        data, carteira = carteiras[ind]
        curva = _deb.curva_ntnb(data, curvas)
        for p in carteira:
            if p["codigo"] in tickers and p["indexador"] == "IPCA" and p["codigo"] not in out:
                s = _deb.spread(p["taxa_indicativa"], p["vencimento"], curva, "IPCA+")
                out[p["codigo"]] = {"taxa_indicativa": p["taxa_indicativa"], "spread": None if s is None else round(s, 4),
                                    "data": data}
    return dict(sorted(out.items()))


def _acesso(manifesto, hoje):
    datas = [i["acesso"] for i in getattr(manifesto, "items", []) if i.get("arquivo", "").endswith("ida/cache.json")
             and i.get("acesso")]
    return max(datas) if datas else hoje


def montar(cache, carteiras, tickers, curvas, manifesto=None, hoje=None):
    """Bloco do IDA. `cache`: o de `fetch`; `carteiras`: {índice: (data, [papel])} da carteira mais recente de cada
    índice; `tickers`: papéis de transporte; `curvas`: de `debentures.ler_tesouro`. A janela parte do último dia com
    resultado no cache; `hoje` (o relógio) só entra como data de acesso quando o manifesto não registra o cache."""
    dias = [d for ind in INDICES for d in _dias_com_dado(cache.get(ind) or {})]
    if not dias:
        raise ValueError("o cache do IDA não tem nenhum dia com resultado: rode `python scripts/atualizar.py --baixar "
                         "--dominios ida`")
    fim = max(dias)
    indices, sem_download = {}, []
    for ind, nome in INDICES.items():
        c = cache.get(ind) or {}
        validos = _dias_com_dado(c)
        if not validos:
            continue
        sem_download += [{"indice": ind, "data": d} for d in lacunas(c, fim)]
        u = c[validos[-1]]
        indices[ind] = {"nome": nome, "serie": _serie(ind, c, fim, curvas),
                        "ultimo": {"data": validos[-1], "var_mes": u["var_mes"], "var_ano": u["var_ano"],
                                   "var_12m": u["var_12m"], "var_24m": u["var_24m"], "duration_du": u["duration_du"],
                                   "valor_mercado": u["valor_mercado"]}}
    series = [p["data"] for i in indices.values() for p in i["serie"]]
    periodo = f"{_br(min(series))} a {_br(max(series))}" if min(series) != max(series) else _br(min(series))
    fonte = [{"nome": "ANBIMA — Índice de Debêntures ANBIMA (IDA), resultado diário", "url": PAGINA, "periodo": periodo,
              "acesso": _acesso(manifesto, hoje), "licenca": LICENCA, "tipo": "medido",
              "nota": "Consulta pública \"Resultado diário por índice\" da ANBIMA, um pedido por índice e por dia: "
                      "número-índice, variações, duration, valor de mercado e carteira teórica com a taxa indicativa de "
                      "cada papel. Entram o último dia útil de cada semana dos últimos 24 meses e todos os dias úteis "
                      "dos últimos 31 dias. O número-índice é rebaseado em 100 no início da janela. O spread médio do "
                      "IDA-IPCA Infraestrutura é a média, ponderada pelo peso na carteira, de taxa indicativa − NTN-B "
                      "(Tesouro Direto, taxa de compra) do mesmo dia, interpolada pelo vencimento; sem curva no dia, "
                      "fica sem valor. Das carteiras ficam só os papéis de transporte da tabela de emissões."}]
    return {"fonte": fonte, "indices": indices, "papeis": _papeis(carteiras, set(tickers), curvas),
            "pendencias": {"dias_sem_download": sem_download}}


def _tickers(path=DEBENTURES):
    try:
        return [e["ticker"] for e in json.loads(Path(path).read_text(encoding="utf-8")).get("emissoes") or []]
    except (OSError, ValueError, KeyError):
        return []


def build(pasta=PASTA, out=OUT, debentures=DEBENTURES, tesouro=None, manifesto=None):
    """Lê o cache e as carteiras de data/raw/ida/ (nada de rede) e grava data/intel/ida.json. Sem o cache: FileNotFoundError
    (o `atualizar` pula o domínio e diz para baixar)."""
    pasta = Path(pasta)
    if not (pasta / "cache.json").exists():
        raise FileNotFoundError(str(pasta / "cache.json"))
    cache = _ler_cache(pasta)
    carteiras = {ind: (data, ler_csv(Path(caminho).read_bytes().decode("latin-1"))["carteira"])
                 for ind, (data, caminho) in carteiras_baixadas(pasta).items()}
    tesouro = Path(tesouro or _deb.PUBLICO / _deb.TESOURO)
    datas = {d for ind in INDICES for d in (cache.get(ind) or {})} | {d for d, _ in carteiras.values()}
    curvas = _deb.ler_tesouro(tesouro, datas) if tesouro.exists() else {}
    proprio = manifesto is None
    manifesto = Manifest("ida") if proprio else manifesto
    registrar(manifesto, pasta)
    doc = montar(cache, carteiras, _tickers(debentures), curvas, manifesto=manifesto, hoje=dt.date.today().isoformat())
    if proprio:
        manifesto.save()
    out = Path(out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    n = {i: len(v["serie"]) for i, v in doc["indices"].items()}
    print(f"{out.name}: dias por índice {n} | {len(doc['papeis'])} papéis de transporte | "
          f"dias sem download: {len(doc['pendencias']['dias_sem_download'])} | "
          f"dias sem curva (IPCA Infraestrutura): "
          f"{sum(p.get('spread_medio') is None for p in doc['indices'].get(INFRA, {}).get('serie', []))}")
    return doc


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "all"
    if cmd in ("fetch", "all"):
        fetch()
    if cmd in ("build", "all"):
        build()
