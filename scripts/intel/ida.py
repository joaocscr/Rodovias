"""IDA, Índice de Debêntures ANBIMA: número-índice, duration e spread sobre a NTN-B dos quatro subíndices, e a taxa
indicativa dos papéis de transporte.

Fonte: "Resultado diário por índice" do site da ANBIMA (consulta em CSV, sem login). Um pedido por índice e por dia
devolve texto latin-1 separado por `;`: a linha do índice (número-índice, variações, duration, valor de mercado) e a
carteira teórica do dia (código, vencimento, indexador, taxa indicativa e peso de cada papel). Dia sem resultado
(feriado, fim de semana) vem com um aviso no lugar do arquivo ou sem a linha do índice.

- `fetch` baixa só os dias que faltam. Por padrão tenta os dias úteis depois do último dia que já está no histórico ou no
  cache, mais os últimos 10 dias úteis (uma execução de rotina são poucos pedidos). Sem nenhum dia ainda, com `force` ou
  com `completo` (argumento, ou a variável de ambiente IDA_COMPLETO=1), segue a amostra completa: o último dia útil de
  cada semana dos últimos 24 meses e todos os dias úteis dos últimos 31 dias; semana cuja sexta-feira não tem resultado
  (feriado) recua até o primeiro dia com resultado. O site só entrega os resultados recentes (em out/2026, os de 14/10 em
  diante; o histórico está no ANBIMA Feed, com login): nessa volta as semanas são percorridas da mais recente para a mais
  antiga e ela termina depois de 4 semanas seguidas sem resultado. A série cresce a cada execução. Dia sem resultado fica
  no cache como "sem_dado" (e é pedido de novo enquanto estiver nos últimos 10 dias úteis, porque a ANBIMA às vezes
  publica com atraso); dia que falhou nas tentativas, ou cuja resposta não tem o número-índice, não entra e é pedido de
  novo na próxima vez.
  A carteira do dia mais recente de cada índice fica em `data/raw/ida/carteira_<ÍNDICE>_<data>.csv`; a do IPCA
  Infraestrutura de cada dia fica no cache em forma enxuta (vencimento, taxa e peso dos papéis IPCA), de onde sai a série
  de spread.
- `data/indices/ida_historico.json` (versionado, gerado pelo `build`): por índice e por dia, a linha do índice e, no IPCA
  Infraestrutura, o spread médio; o dia que o site respondeu "sem resultado" (feriado, ou ainda não publicado) fica como
  "sem_dado", para o bloco ser o mesmo com ou sem `data/raw/`. É o histórico acumulado: `data/raw/` não vai para o git e pode se perder, o histórico não.
  O `build` junta o histórico com o cache (o cache e o dia novo valem mais) e grava o resultado de volta. O spread de um
  dia é recalculado quando o cache tem a carteira e a curva do dia existe; senão fica o que já estava no histórico.
- `build` nunca vai à rede. "Hoje", para a janela de amostragem, é o último dia com resultado, não o relógio: o bloco não
  muda com o dia em que o comando roda.
- Spread = taxa indicativa − taxa indicativa da NTN-B da ANBIMA do mesmo dia, interpolada pelo vencimento
  (`debentures.spread`). Média ponderada pelo peso na carteira; dia sem curva fica sem valor. A curva vem do arquivo
  diário da ANBIMA (`curva_anbima.py`): o `fetch` baixa, depois dos índices, a curva dos dias da série que faltam no cache
  (data/raw/debentures/publico/anbima_ms/, a mesma pasta do domínio debentures) e o `build` só a lê.
"""
import datetime as dt
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from intel import curva_anbima as _anbima  # noqa: E402
from intel import debentures as _deb  # noqa: E402
from intel.debentures_texto import numero, para_data  # noqa: E402
from intel.fontes import RAW, ROOT, UA, Manifest  # noqa: E402

URL = "https://www.anbima.com.br/informacoes/ida/IDA_down.asp"
PAGINA = "https://www.anbima.com.br/informacoes/ida/default.asp"
PASTA = RAW / "ida"
OUT = ROOT / "data" / "intel" / "ida.json"
HISTORICO = ROOT / "data" / "indices" / "ida_historico.json"
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
DIAS_ROTINA = 10              # além dos dias novos, a rotina repete os últimos 10 dias úteis (o que falhou ou ainda não saiu)
SEMANAS_VAZIAS = 4            # o site só guarda os resultados recentes: depois de 4 semanas seguidas sem nenhum, para de recuar
FALHAS_SEGUIDAS = 3           # pedidos seguidos que falham: o site está fora do ar, o resto (outros índices e a carteira) fica para a próxima vez
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


def ultimos_dias_uteis(hoje, n):
    """Os `n` últimos dias úteis (segunda a sexta) até `hoje`, do mais antigo ao mais novo."""
    d, out = _data(hoje), []
    while len(out) < n:
        if d.weekday() < 5:
            out.append(d)
        d -= dt.timedelta(days=1)
    return out[::-1]


def lacunas(cache_indice, historico_indice, hoje):
    """Dias úteis dos últimos 10 que nem o cache nem o histórico têm (nem como resultado, nem como "sem_dado") (o `fetch` de rotina os pede de novo). Dias anteriores
    ao primeiro resultado conhecido não contam: o site só guarda os resultados recentes e o que nunca existiu não é falha."""
    conhecidos = set(cache_indice) | set(historico_indice)
    inicio = min(set(_dias_com_dado(cache_indice)) | set(_dias_com_dado(historico_indice)), default=None)
    if inicio is None:
        return []
    return sorted(d.isoformat() for d in ultimos_dias_uteis(hoje, DIAS_ROTINA)
                  if d.isoformat() >= inicio and d.isoformat() not in conhecidos)


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
    if linha["numero_indice"] is None:
        raise ValueError("resposta do IDA sem o número-índice legível")
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


def ler_historico(path=HISTORICO):
    """{índice: {AAAA-MM-DD: {numero_indice, var_*, duration_du, valor_mercado[, spread_medio]} | "sem_dado"}} do arquivo
    versionado; ausente ou ilegível, vazio."""
    try:
        dados = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    return {i: d for i, d in dados.items() if i in INDICES and isinstance(d, dict)} if isinstance(dados, dict) else {}


def _gravar_historico(path, dias):
    """Um dia por linha (diferenças legíveis no git), índices e dias em ordem."""
    corpos = []
    for ind in INDICES:
        linhas = ",\n".join(f' "{d}":{json.dumps(v, ensure_ascii=False, separators=(",", ":"))}'
                            for d, v in sorted((dias.get(ind) or {}).items()))
        corpos.append(f'"{ind}":{{\n{linhas}\n}}')
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("{\n" + ",\n".join(corpos) + "\n}\n", encoding="utf-8")


def mesclar(historico, cache, curvas):
    """Histórico (arquivo versionado) + cache: {índice: {dia: agregado | "sem_dado"}}. O cache e o dia novo valem mais que
    o histórico; um "sem_dado" nunca apaga um dia que já tem resultado, e o "sem_dado" depois do último dia com resultado
    (ainda não publicado) não fica. No IPCA Infraestrutura entra `spread_medio`: recalculado da carteira enxuta do cache
    com a curva do dia, quando ambas existem; senão o do histórico para o mesmo número-índice; senão None."""
    out = {}
    for ind in INDICES:
        dias = {d: (v if v == SEM_DADO else dict(v)) for d, v in ((historico or {}).get(ind) or {}).items()}
        for d, l in (cache.get(ind) or {}).items():
            if l == SEM_DADO:
                dias.setdefault(d, SEM_DADO)
                continue
            ant = dias.get(d)
            ant = ant if isinstance(ant, dict) else {}
            novo = {k: l[k] for k in CAMPOS_INDICE}
            if ind == INFRA:
                s = None
                curva = _deb.curva_ntnb(d, curvas)
                if l.get("carteira") and curva:
                    s = spread_medio(_carteira_do_cache(l["carteira"]), curva)
                    s = None if s is None else round(s, 4)
                if s is None and ant.get("numero_indice") == novo["numero_indice"]:
                    s = ant.get("spread_medio")
                novo["spread_medio"] = s
            dias[d] = novo
        ultimo = max(_dias_com_dado(dias), default="")
        out[ind] = {d: v for d, v in sorted(dias.items()) if v != SEM_DADO or d < ultimo}
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


def _dias_da_serie(cache, hist):
    """Dias com resultado (AAAA-MM-DD) de qualquer índice, no cache ou no histórico: os dias da série, que precisam da curva."""
    return {d for ind in INDICES for fonte in (cache, hist) for d in _dias_com_dado(fonte.get(ind) or {})}


def pasta_curva(pasta=PASTA):
    """Cache da curva da ANBIMA: o do domínio debentures; para uma pasta de teste, uma subpasta dela."""
    return _anbima.PASTA if Path(pasta) == PASTA else Path(pasta) / _anbima.SUBPASTA


def historico_curva(pasta=PASTA):
    """Arquivo versionado da curva da ANBIMA: o de verdade para o domínio, um arquivo da pasta de teste para as outras."""
    return _anbima.HISTORICO if Path(pasta) == PASTA else Path(pasta) / "curva_historico.json"


def _fetch_curva(pasta, cache, hist, hoje, proprio):
    """Baixa a curva da ANBIMA dos dias da série que faltam no cache. Com `proprio` (execução de verdade), registra os
    arquivos no manifesto do domínio debentures, o dono da pasta."""
    destino = pasta_curva(pasta)
    _anbima.fetch(_dias_da_serie(cache, hist), destino, hoje=hoje)
    if proprio:
        m = Manifest("debentures")
        _anbima.registrar(m, destino)
        m.save()


def fetch(force=False, consultar=_consultar, hoje=None, pausa=PAUSA, dormir=time.sleep, pasta=PASTA, manifesto=None,
          indices=tuple(INDICES), log=print, completo=None, historico=HISTORICO):
    """Baixa os dias que faltam (ver o topo do arquivo). De rotina: os dias úteis depois do último dia que o histórico ou
    o cache já têm, mais os últimos 10 dias úteis. Sem nenhum dia ainda, com `force` ou com `completo` (None: lê a variável
    de ambiente IDA_COMPLETO), a amostra completa. Com `force`, pede de novo todos os dias da amostra e
    só troca o que veio bom: o dia que falha continua com o valor anterior. `hoje`: dia de referência da janela (padrão:
    o relógio, porque aqui o que importa é o que já foi publicado). Na amostra completa as semanas são percorridas da mais
    recente para a mais antiga e a volta termina depois de `SEMANAS_VAZIAS` semanas seguidas sem resultado nenhum (o site
    só guarda os dias recentes). Pedido que falha em 3 tentativas não derruba os outros: o dia fica de fora do cache e a curadoria avisa;
    `FALHAS_SEGUIDAS` pedidos assim, um depois do outro, dão o site como fora do ar: o índice e os que faltam ficam para
    a próxima vez (sem rede, não se gasta o tempo das tentativas de cada índice). Por fim baixa a curva das NTN-B da
    ANBIMA dos dias da série que faltam no cache (`curva_anbima.fetch`; ela não conta nos pedidos). Devolve o número de pedidos feitos."""
    pasta = Path(pasta)
    hoje = _data(hoje) if hoje else dt.date.today()
    cache = _ler_cache(pasta)
    hist = ler_historico(historico)
    completo = bool(os.environ.get("IDA_COMPLETO")) if completo is None else completo
    recentes, semanas = plano(hoje)
    reask = {d.isoformat() for d in ultimos_dias_uteis(hoje, DIAS_ROTINA)}
    feitos, ultimo_bruto, falhas, pedidos, seguidas = set(), {}, [], [0], [0]

    def pedir(ind, d):
        iso = d.isoformat()
        cache.setdefault(ind, {})
        if (ind, iso) in feitos:
            return cache[ind].get(iso)
        atual, h = cache[ind].get(iso), (hist.get(ind) or {}).get(iso)
        if h is not None and h != SEM_DADO and atual in (None, SEM_DADO):
            atual = "historico"                  # já está no histórico versionado: não pede de novo
        elif atual is None and h is not None:
            atual = h
        # "sem_dado" nos últimos 10 dias úteis pode ser publicação atrasada: pede de novo; mais antigo que isso, não
        if atual is not None and not force and not (atual == SEM_DADO and iso in reask):
            return atual
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

    fora_do_ar = False
    for ind in indices:
        cache.setdefault(ind, {})
        if fora_do_ar:
            continue
        seguidas[0] = 0
        try:
            ultimo = max(set(_dias_com_dado(cache[ind])) | set(_dias_com_dado(hist.get(ind) or {})), default=None)
            if completo or force or ultimo is None:
                for d in recentes:
                    pedir(ind, d)
                vazias = 0
                for dias in reversed(semanas):
                    estado = "vazia"
                    for d in dias:                 # da sexta para trás, até o primeiro dia com resultado
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
            else:
                novos = [hoje - dt.timedelta(days=k) for k in range((hoje - dt.date.fromisoformat(ultimo)).days)]
                for d in sorted({*ultimos_dias_uteis(hoje, DIAS_ROTINA), *[x for x in novos if x.weekday() < 5]}):
                    pedir(ind, d)
        except _SiteForaDoAr:
            fora_do_ar = True
            print(f"AVISO: IDA {ind}: o site não respondeu a {FALHAS_SEGUIDAS} pedidos seguidos; o resto (inclusive os outros "
                  "índices) fica para a próxima vez", file=sys.stderr)
        # dia sem resultado depois do último com resultado ainda pode não ter sido publicado: não fica no cache
        ultimo_dado = max(set(_dias_com_dado(cache[ind])) | set(_dias_com_dado(hist.get(ind) or {})), default="")
        for iso in [i for i, v in cache[ind].items() if v == SEM_DADO and i > ultimo_dado]:
            del cache[ind][iso]
    _gravar_cache(pasta, cache)

    for ind in indices:
        dias = sorted(set(_dias_com_dado(cache.get(ind) or {})) | set(_dias_com_dado(hist.get(ind) or {})))
        if not dias:
            continue
        alvo = pasta / f"carteira_{ind}_{dias[-1]}.csv"
        if ultimo_bruto.get(ind, ("",))[0] == dias[-1]:
            alvo.write_bytes(ultimo_bruto[ind][1])
        elif not alvo.exists() and not fora_do_ar:
            try:
                bruto = consultar(ind, dias[-1])
                dormir(pausa)
                pedidos[0] += 1
                if _interpretar(bruto, dias[-1], ind) == SEM_DADO:   # aviso do site ou arquivo sem o índice: não serve
                    raise ValueError("resposta sem a carteira do dia")
                alvo.write_bytes(bruto)
            except (RuntimeError, ValueError, OSError) as e:
                falhas.append(f"{ind} carteira de {dias[-1]}: {e}")
        if alvo.exists():                     # as carteiras antigas só saem quando a nova está em disco
            for velho in pasta.glob("carteira_*.csv"):
                if velho != alvo and velho.name.startswith(f"carteira_{ind}_") and re.fullmatch(
                        r"\d{4}-\d{2}-\d{2}\.csv", velho.name[len(f"carteira_{ind}_"):]):
                    velho.unlink()
    for f in falhas:
        print(f"AVISO: IDA sem download: {f}", file=sys.stderr)
    _fetch_curva(pasta, cache, hist, hoje, proprio=manifesto is None)
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


def _serie(ind, dias_indice, hoje):
    """Pontos da amostra (ver `_amostra`) de um índice. `dias_indice`: {dia: agregado} de `mesclar`. `base100`: número-índice
    sobre o do primeiro ponto da série, que vale 100."""
    serie = []
    for d in _amostra(sorted(dias_indice), hoje):
        l = dias_indice[d]
        ponto = {"data": d, "numero_indice": l["numero_indice"], "base100": None, "duration_du": l["duration_du"]}
        if ind == INFRA:
            ponto["spread_medio"] = l.get("spread_medio")
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


def _acesso(manifesto, fim):
    """Dia em que o cache do IDA foi visto pela primeira vez (manifesto); sem registro, o último dia com resultado, que é
    um dado e não o relógio."""
    datas = [i["acesso"] for i in getattr(manifesto, "items", []) if i.get("arquivo", "").endswith("ida/cache.json")
             and i.get("acesso")]
    return max(datas) if datas else fim


def montar(cache, carteiras, tickers, curvas, manifesto=None, historico=None, mesclado=None):
    """Bloco do IDA. `cache`: o de `fetch`; `historico`: o arquivo versionado (ver `mesclar`: o cache vale mais);
    `carteiras`: {índice: (data, [papel])} da carteira mais recente de cada índice; `tickers`: papéis de transporte;
    `curvas`: de `curva_anbima.curvas`; `mesclado`: o resultado de `mesclar`, se quem chama já o tem. A janela parte do
    último dia com resultado; nada aqui depende do relógio. `tickers` None: a lista de papéis de transporte não estava
    disponível (vira pendência e `papeis` fica vazio)."""
    cache, historico = cache or {}, historico or {}
    mesclado = mesclar(historico, cache, curvas) if mesclado is None else mesclado
    mesclado = {i: {d: v for d, v in dias.items() if v != SEM_DADO} for i, dias in mesclado.items()}
    dias = [d for ind in INDICES for d in mesclado[ind]]
    if not dias:
        raise ValueError("o IDA não tem nenhum dia com resultado (nem no cache nem no histórico): rode `python "
                         "scripts/atualizar.py --baixar --dominios ida`")
    fim = max(dias)
    indices, sem_download = {}, []
    for ind, nome in INDICES.items():
        d = mesclado[ind]
        if not d:
            continue
        sem_download += [{"indice": ind, "data": x} for x in lacunas(cache.get(ind) or {}, historico.get(ind) or {}, fim)]
        ultimo = max(d)
        u = d[ultimo]
        indices[ind] = {"nome": nome, "serie": _serie(ind, d, fim),
                        "ultimo": {"data": ultimo, "var_mes": u["var_mes"], "var_ano": u["var_ano"],
                                   "var_12m": u["var_12m"], "var_24m": u["var_24m"], "duration_du": u["duration_du"],
                                   "valor_mercado": u["valor_mercado"]}}
    series = [p["data"] for i in indices.values() for p in i["serie"]]
    periodo = f"{_br(min(series))} a {_br(max(series))}" if min(series) != max(series) else _br(min(series))
    fonte = [{"nome": "ANBIMA — Índice de Debêntures ANBIMA (IDA), resultado diário", "url": PAGINA, "periodo": periodo,
              "acesso": _acesso(manifesto, fim), "licenca": LICENCA, "tipo": "medido",
              "nota": "Consulta pública \"Resultado diário por índice\" da ANBIMA, um pedido por índice e por dia: "
                      "número-índice, variações, duration, valor de mercado e carteira teórica com a taxa indicativa de "
                      "cada papel. O site só entrega os resultados recentes e o histórico completo exige o ANBIMA Feed "
                      "(com login): a série é acumulada a partir do primeiro download e cresce a cada atualização; "
                      "as variações no mês, no ano, em 12 e em 24 meses são as publicadas pela ANBIMA no último dia. "
                      "Na série entram o último dia útil de cada semana e todos os dias dos últimos 31 dias, e o "
                      "número-índice é rebaseado em 100 no primeiro ponto. O spread médio do "
                      "IDA-IPCA Infraestrutura é a média, ponderada pelo peso na carteira, de taxa indicativa − NTN-B "
                      "(taxa indicativa da ANBIMA) do mesmo dia, interpolada pelo vencimento; sem curva no dia, "
                      "fica sem valor. Das carteiras ficam só os papéis de transporte da tabela de emissões."}]
    pendencias = {"dias_sem_download": sem_download}
    if tickers is None:
        pendencias["sem_lista_de_papeis"] = True
    return {"fonte": fonte, "indices": indices, "papeis": _papeis(carteiras, set(tickers or ()), curvas),
            "pendencias": pendencias}


def _tickers(path=DEBENTURES):
    """Papéis de transporte (os `ticker` das emissões de debentures.json); None se o arquivo não existe ou não se lê: sem a
    lista, `papeis` fica vazio e a curadoria avisa, em vez de um bloco vazio sem explicação."""
    try:
        return [e["ticker"] for e in json.loads(Path(path).read_text(encoding="utf-8")).get("emissoes") or []]
    except (OSError, ValueError, KeyError, AttributeError):
        return None


def build(pasta=PASTA, out=OUT, debentures=DEBENTURES, curvas_pasta=None, manifesto=None, historico=HISTORICO,
          curvas_historico=None):
    """Lê o cache e as carteiras de data/raw/ida/ e o histórico versionado (nada de rede), grava o histórico atualizado e
    data/intel/ida.json. Sem o cache e sem histórico: FileNotFoundError (o `atualizar` pula o domínio e diz para baixar).
    Sem as carteiras (data/raw/ perdido), os papéis ficam como estavam no bloco anterior. `curvas_pasta`: o cache da curva da
    ANBIMA (padrão, `pasta_curva`); `curvas_historico`: o arquivo versionado
    da curva, que o build atualiza e que vale quando o cache se perde (padrão, `historico_curva`)."""
    pasta, out = Path(pasta), Path(out)
    cache, hist = _ler_cache(pasta), ler_historico(historico)
    if not cache and not hist:
        raise FileNotFoundError(str(pasta / "cache.json"))
    carteiras = {ind: (data, ler_csv(Path(caminho).read_bytes().decode("latin-1"))["carteira"])
                 for ind, (data, caminho) in carteiras_baixadas(pasta).items()}
    datas = {d for ind in INDICES for d in (cache.get(ind) or {})} | {d for ind in INDICES for d in (hist.get(ind) or {})} \
        | {d for d, _ in carteiras.values()}
    curvas_pasta = curvas_pasta or pasta_curva(pasta)
    curvas_historico = curvas_historico or historico_curva(pasta)
    _anbima.atualizar_historico(curvas_pasta, curvas_historico)         # a curva de cada dia fica no git
    curvas = _anbima.curvas(datas, curvas_pasta, curvas_historico)
    proprio = manifesto is None
    manifesto = Manifest("ida") if proprio else manifesto
    registrar(manifesto, pasta)
    mesclado = mesclar(hist, cache, curvas)
    doc = montar(cache, carteiras, _tickers(debentures), curvas, manifesto=manifesto, historico=hist, mesclado=mesclado)
    if not carteiras:
        try:
            doc["papeis"] = json.loads(out.read_text(encoding="utf-8")).get("papeis") or {}
        except (OSError, ValueError):
            pass
    if proprio:
        manifesto.save()
    _gravar_historico(historico, mesclado)
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
