"""Curva das NTN-B indicativas da ANBIMA, a referência de todos os spreads do painel.

Fonte: "Mercado secundário de títulos públicos" do site da ANBIMA, um arquivo de texto por dia útil,
`https://www.anbima.com.br/informacoes/merc-sec/arqs/msAAMMDD.txt` (latin-1, campos separados por `@`). O cabeçalho
começa com `Titulo@Data Referencia@...`; nas linhas `NTN-B`, o vencimento é `Data Vencimento` (AAAAMMDD) e a taxa é
`Tx. Indicativas` (% a.a., pt-BR). Fim de semana, feriado e dia ainda não publicado respondem 404, e o site só guarda os
últimos dias úteis (a página diz cinco; em out/2026 os arquivos de 14/10 em diante): a série cresce a cada execução e dia
que o site já apagou não volta (por isso a pasta de cache, fora do git, não deve ser apagada).

- `ler`: texto do arquivo → [(vencimento AAAA-MM-DD, taxa)] só das NTN-B, em ordem de vencimento.
- `fetch`: baixa só os dias que faltam no cache (uma pasta de arquivos `msAAMMDD.txt`), com pausa entre pedidos e 3
  tentativas. Um 404 é "sem_arquivo": fica em `indice.json` e o dia não é pedido de novo, a não ser nos últimos 5 dias úteis
  (a ANBIMA publica no fim do dia). Fim de semana nem é pedido. Pedido que falha nas tentativas não entra no índice e
  fica para a próxima vez.
- `curvas`: lê só o cache (nada de rede) → {dia: [(vencimento, taxa)]}, a interface de `debentures.curva_ntnb` e
  `debentures.spread`.
- `data/indices/curva_ntnb_anbima.json` (versionado, gerado pelos builds): a curva de cada dia já visto, uma linha por dia,
  e os dias sem arquivo ("sem_arquivo") anteriores ao último dia com curva. `data/raw/` não vai para o git, e o site da ANBIMA
  só guarda os últimos dias úteis: o histórico é o único lugar onde a série sobrevive. `curvas` o junta ao cache (o cache e o
  dia novo valem mais); sem o cache, o resultado é o mesmo. `atualizar_historico` grava a junção.
- `registrar`: põe os arquivos do cache no manifesto (caminho, SHA-256 e `acesso`, o dia em que o conteúdo foi visto pela
  primeira vez: o mesmo SHA-256 mantém a data, então o bloco não muda quando o comando roda em outro dia).
"""
import datetime as dt
import json
import re
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from intel.debentures_texto import numero  # noqa: E402
from intel.fontes import RAW, ROOT, UA, sha256  # noqa: E402

BASE = "https://www.anbima.com.br/informacoes/merc-sec/arqs/"
PAGINA = "https://www.anbima.com.br/informacoes/merc-sec/default.asp"
SUBPASTA = "anbima_ms"
PASTA = RAW / "debentures" / "publico" / SUBPASTA
INDICE = "indice.json"
SEM_ARQUIVO = "sem_arquivo"
LICENCA = "Consulta pública do site da ANBIMA; a página não declara licença de reuso"
TITULO = "NTN-B"
PAUSA = 0.5
ESPERAS = (5, 30)            # entre as 3 tentativas de cada dia
DIAS_RECENTES = 5            # "sem_arquivo" nos últimos 5 dias úteis pode ser publicação atrasada: pede de novo
DIAS_SEGUIDOS = 2            # dias seguidos que falham em todas as tentativas: o site está fora do ar, o resto fica para depois
HISTORICO = ROOT / "data" / "indices" / "curva_ntnb_anbima.json"
COLUNAS = {"vencimento": "Data Vencimento", "taxa": "Tx. Indicativas", "referencia": "Data Referencia"}


# ---------- nomes ----------

def nome(data):
    """AAAA-MM-DD → msAAMMDD.txt."""
    return f"ms{data[2:4]}{data[5:7]}{data[8:10]}.txt"


def url(data):
    return BASE + nome(data)


def data_do_arquivo(arquivo):
    """msAAMMDD.txt → AAAA-MM-DD; None se o nome não é de um arquivo da ANBIMA."""
    m = re.fullmatch(r"ms(\d{2})(\d{2})(\d{2})\.txt", Path(arquivo).name)
    return f"20{m.group(1)}-{m.group(2)}-{m.group(3)}" if m else None


def _iso(compacta):
    """AAAAMMDD → AAAA-MM-DD; None se não é uma data."""
    if not re.fullmatch(r"\d{8}", compacta or ""):
        return None
    try:
        return dt.date(int(compacta[:4]), int(compacta[4:6]), int(compacta[6:])).isoformat()
    except ValueError:
        return None


def ultimos_dias_uteis(hoje, n):
    """Os `n` últimos dias úteis (segunda a sexta) até `hoje`, do mais antigo ao mais novo (AAAA-MM-DD). Feriados não
    entram na conta: o arquivo do dia simplesmente não existe."""
    d, out = hoje if isinstance(hoje, dt.date) else dt.date.fromisoformat(hoje), []
    while len(out) < n:
        if d.weekday() < 5:
            out.append(d.isoformat())
        d -= dt.timedelta(days=1)
    return out[::-1]


# ---------- leitura ----------

def _ler(texto):
    """(datas de referência, [(vencimento, taxa)]) das linhas NTN-B. ValueError se não há o cabeçalho do arquivo ou se ele
    não traz as colunas de vencimento e taxa indicativa (o formato mudou, ou a resposta não é o arquivo)."""
    colunas, refs, pontos = None, set(), {}
    for linha in texto.splitlines():
        campos = [c.strip() for c in linha.split("@")]
        if campos[0] == "Titulo":
            colunas = {c: i for i, c in enumerate(campos)}
            continue
        if colunas is None or campos[0] != TITULO:
            continue
        try:
            venc, taxa = _iso(campos[colunas[COLUNAS["vencimento"]]]), numero(campos[colunas[COLUNAS["taxa"]]])
            ref = campos[colunas[COLUNAS["referencia"]]]
        except (KeyError, IndexError):
            continue
        if venc and taxa is not None:
            pontos[venc] = taxa
            refs.add(_iso(ref))
    if colunas is None or any(c not in colunas for c in COLUNAS.values()):
        raise ValueError("não é o arquivo de taxas indicativas da ANBIMA (sem o cabeçalho esperado)")
    return refs, sorted(pontos.items())


def ler(texto):
    """[(vencimento AAAA-MM-DD, taxa indicativa % a.a.)] das NTN-B do arquivo da ANBIMA, em ordem de vencimento. Outros
    títulos (LTN, NTN-F, LFT) ficam de fora; no mesmo vencimento vale a última linha. ValueError se o texto não é o
    arquivo."""
    return _ler(texto)[1]


# ---------- cache ----------

def _ler_indice(pasta):
    try:
        dados = json.loads((Path(pasta) / INDICE).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    return dados if isinstance(dados, dict) else {}


def _gravar_indice(pasta, indice):
    pasta = Path(pasta)
    pasta.mkdir(parents=True, exist_ok=True)
    tmp = pasta / (INDICE + ".novo")
    tmp.write_text(json.dumps(indice, ensure_ascii=False, sort_keys=True, indent=1), encoding="utf-8")
    tmp.replace(pasta / INDICE)


def _no_cache(pasta, data):
    p = Path(pasta) / nome(data)
    return p.is_file() and p.stat().st_size > 0


def _do_cache(datas, pasta):
    pasta = Path(pasta)
    dias = sorted(datas) if datas is not None else sorted(d for d in map(data_do_arquivo, (p.name for p in pasta.glob("ms*.txt"))) if d)
    out = {}
    for d in dias:
        p = pasta / nome(d)
        try:
            pontos = ler(p.read_bytes().decode("latin-1"))
        except (OSError, ValueError):
            continue
        if pontos:
            out[d] = pontos
    return out


def ler_historico(path=HISTORICO):
    """{dia: [(vencimento, taxa)] | "sem_arquivo"} do arquivo versionado; ausente ou ilegível, vazio."""
    try:
        dados = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    if not isinstance(dados, dict):
        return {}
    return {d: (SEM_ARQUIVO if v == SEM_ARQUIVO else [(p[0], p[1]) for p in v])
            for d, v in dados.items() if v == SEM_ARQUIVO or (isinstance(v, list) and v)}


def mesclar(historico, do_cache, indice):
    """{dia: [(vencimento, taxa)] | "sem_arquivo"}: o histórico mais o cache (o cache vale mais) e os 404 do `indice` de
    dias úteis. O "sem_arquivo" nunca apaga uma curva e só fica antes do último dia com curva: depois dele o arquivo pode
    ainda não ter sido publicado. Fim de semana não entra."""
    out = dict(historico)
    out.update(do_cache)
    for d, v in indice.items():
        if v == SEM_ARQUIVO and d not in out and dt.date.fromisoformat(d).weekday() < 5:
            out[d] = SEM_ARQUIVO
    ultimo = max((d for d, v in out.items() if v != SEM_ARQUIVO), default="")
    return {d: v for d, v in sorted(out.items()) if v != SEM_ARQUIVO or d < ultimo}


def _junto(pasta, historico):
    return mesclar(ler_historico(historico) if historico else {}, _do_cache(None, pasta), _ler_indice(pasta))


def curvas(datas, pasta=PASTA, historico=None):
    """{dia: [(vencimento, taxa)]} dos arquivos do cache `pasta` (só leitura, nada de rede), junto com o histórico versionado
    `historico` (caminho; None, só o cache). O cache vale mais. `datas`: só esses dias; None, todos. Dia sem arquivo, ou com
    arquivo ilegível, fica de fora."""
    juntas = _junto(pasta, historico) if historico else _do_cache(None, pasta)
    return {d: v for d, v in sorted(juntas.items()) if v != SEM_ARQUIVO and (datas is None or d in datas)}


def atualizar_historico(pasta=PASTA, historico=HISTORICO):
    """Grava em `historico` a junção do arquivo atual com o cache e o índice de `pasta` (um dia por linha, em ordem, diferenças
    legíveis no git). Devolve o conteúdo gravado."""
    juntas = _junto(pasta, historico)
    linhas = ",\n".join(f' "{d}":{json.dumps(v, ensure_ascii=False, separators=(",", ":"))}' for d, v in juntas.items())
    historico = Path(historico)
    historico.parent.mkdir(parents=True, exist_ok=True)
    historico.write_text("{\n" + linhas + "\n}\n", encoding="utf-8")
    return juntas


# ---------- download ----------

def _consultar(endereco, timeout=60):
    """Um pedido ao site: (código HTTP, corpo). RuntimeError se o curl falha (sem rede, tempo esgotado)."""
    r = subprocess.run(["curl", "-sS", "-A", UA, "-m", str(timeout), "-w", "\n%{http_code}", endereco], capture_output=True)
    if r.returncode != 0:
        raise RuntimeError(r.stderr.decode("latin-1", "replace").strip() or "sem resposta")
    corpo, _, codigo = r.stdout.rpartition(b"\n")
    return int(codigo or 0), corpo


def _validar(corpo, data):
    """Texto do arquivo se `corpo` é o arquivo da ANBIMA do dia `data` (as NTN-B trazem esta data de referência); senão
    ValueError."""
    texto = corpo.decode("latin-1")
    refs, pontos = _ler(texto)
    if not pontos:
        raise ValueError("arquivo sem NTN-B")
    if refs != {data}:
        raise ValueError(f"arquivo de outro dia: {', '.join(sorted(r or '?' for r in refs))}")
    return texto


def fetch(datas, pasta=PASTA, consultar=_consultar, dormir=time.sleep, pausa=PAUSA, hoje=None, esperas=ESPERAS, log=None):
    """Baixa para `pasta` os arquivos dos `datas` (AAAA-MM-DD) que ainda não estão lá (ver o topo do arquivo). Devolve
    {dia: bool}: True se o dia tem arquivo no cache depois da chamada; False se a ANBIMA não tem arquivo (fim de semana,
    feriado, ainda não publicado) ou o pedido falhou (o aviso sai em stderr). `consultar(url) -> (código, corpo)`."""
    pasta, hoje = Path(pasta), (hoje or dt.date.today())
    log = log or (lambda msg: print(msg, file=sys.stderr))
    indice, recentes = _ler_indice(pasta), set(ultimos_dias_uteis(hoje, DIAS_RECENTES))
    out, mudou, seguidos = {}, False, 0
    for d in sorted(set(datas)):
        if _no_cache(pasta, d):
            out[d] = True
            continue
        if dt.date.fromisoformat(d).weekday() >= 5:      # fim de semana: não há arquivo, nem se pede
            out[d] = False
            if indice.get(d) != SEM_ARQUIVO:
                indice[d], mudou = SEM_ARQUIVO, True
            continue
        if indice.get(d) == SEM_ARQUIVO and d not in recentes:
            out[d] = False
            continue
        if seguidos >= DIAS_SEGUIDOS:                    # site fora do ar: o resto fica para a próxima vez
            out[d] = False
            continue
        estado, erro = None, None
        for k in range(len(esperas) + 1):
            try:
                codigo, corpo = consultar(url(d))
                if codigo == 404:
                    estado = SEM_ARQUIVO
                elif codigo == 200:
                    texto = _validar(corpo, d)
                    pasta.mkdir(parents=True, exist_ok=True)
                    tmp = pasta / (nome(d) + ".part")
                    tmp.write_bytes(texto.encode("latin-1"))
                    tmp.replace(pasta / nome(d))
                    estado = "ok"
                else:
                    erro = f"resposta {codigo}"
            except (RuntimeError, ValueError, OSError) as e:
                erro = str(e) or type(e).__name__
            dormir(pausa)
            if estado:
                break
            if k < len(esperas):
                dormir(esperas[k])
        if estado == "ok":
            out[d], seguidos = True, 0
            if d in indice:
                del indice[d]
                mudou = True
        elif estado == SEM_ARQUIVO:
            out[d], seguidos = False, 0
            if indice.get(d) != SEM_ARQUIVO:
                indice[d], mudou = SEM_ARQUIVO, True
        else:
            out[d], seguidos = False, seguidos + 1
            log(f"AVISO: curva ANBIMA de {d[8:]}/{d[5:7]}/{d[:4]} sem download: {erro}")
    if mudou:
        _gravar_indice(pasta, indice)
    return out


# ---------- manifesto ----------

def rel(p):
    try:
        return Path(p).resolve().relative_to(ROOT).as_posix()
    except ValueError:
        return str(p)


def registrar(manifesto, pasta=PASTA, acesso=None, dominio="debentures"):
    """Registra no manifesto os arquivos do cache `pasta` (caminho, SHA-256 e `acesso`). `acesso` (padrão, hoje) vale só
    para arquivo novo ou alterado: o mesmo SHA-256 mantém o dia em que foi visto pela primeira vez. Arquivo que saiu da
    pasta (o `data/raw/` se perdeu) continua no manifesto, versionado, com a sua data. Só mexe nos itens desta pasta."""
    pasta = Path(pasta)
    acesso = acesso or dt.date.today().isoformat()
    prefixo = rel(pasta) + "/"
    antes = {i["arquivo"]: i for i in manifesto.items if i.get("arquivo", "").startswith(prefixo)}
    novos = []
    for p in sorted(pasta.glob("ms*.txt")):
        d = data_do_arquivo(p.name)
        if not d:
            continue
        sha, arq = sha256(p), rel(p)
        a = antes.get(arq)
        br = f"{d[8:]}/{d[5:7]}/{d[:4]}"
        novos.append({"dominio": dominio, "descricao": f"ANBIMA, taxas indicativas dos títulos públicos de {br} (NTN-B)",
                      "url": url(d), "arquivo": arq, "bytes": p.stat().st_size, "sha256": sha, "periodo": br,
                      "licenca": LICENCA,
                      "acesso": a["acesso"] if a and a.get("sha256") == sha and a.get("acesso") else acesso})
    todos = {**antes, **{i["arquivo"]: i for i in novos}}            # os que saíram da pasta ficam como estavam
    manifesto.items = [i for i in manifesto.items if i not in antes.values()] + [todos[a] for a in sorted(todos)]


def acesso_dos_dias(manifesto, dias, pasta=PASTA):
    """Dia mais recente em que se viu pela primeira vez um dos arquivos de `dias` (manifesto); None se nenhum está lá."""
    prefixo = rel(pasta) + "/"
    nomes = {prefixo + nome(d) for d in dias}
    datas = [i["acesso"] for i in manifesto.items if i.get("arquivo") in nomes and i.get("acesso")]
    return max(datas) if datas else None
