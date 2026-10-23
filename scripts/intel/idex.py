"""IDEX-Infra (IDEX Analytics) → data/intel/idex.json.

Entradas: os arquivos do usuário em data/raw/idex/ (fora do git; leitura em idex_arquivos.py)
- a planilha de dados (`*datafile*.xlsx`, aba "Detalhado"): por dia e por debênture, o peso no índice, a duration e o
  spread sobre a NTN-B em pontos-base;
- o relatório mensal (PDF): tabela "Histórico de performance", com o retorno mensal do IDEX-Infra Geral e do Core.
Não há o que baixar: `fetch` não faz nada.

Saída: só agregados. Do IDEX entram o spread médio e a duration média do Geral por dia (médias ponderadas pelo peso) e o
spread dos papéis de transporte (os `ticker` de data/intel/debentures.json) no último dia da planilha; nunca a carteira
inteira. O retorno mensal do Geral e do Core vem do relatório; `acumulado_12m` é o produto dos doze últimos retornos
mensais (sem doze meses seguidos, None).

Histórico: data/indices/idex_historico.json guarda os agregados diários já vistos e é gerado e versionado de propósito
(a planilha cobre um mês; a série cresce a cada planilha nova). O dia da planilha atual vence o do histórico.

O bloco não depende do dia em que roda: a data de acesso de cada arquivo é a do primeiro dia em que o conteúdo foi visto
(SHA-256 no manifesto, data/manifest/idex.json). Relatório que não se lê e retorno anual que não bate com o acumulado
impresso vão em `pendencias`, só para a curadoria (build.py não os embute no HTML).
"""
import datetime as dt
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from intel import idex_arquivos  # noqa: E402
from intel.fontes import RAW, ROOT, Manifest, sha256  # noqa: E402

PASTA = RAW / "idex"
HISTORICO = ROOT / "data" / "indices" / "idex_historico.json"
DEBENTURES = ROOT / "data" / "intel" / "debentures.json"
OUT = ROOT / "data" / "intel" / "idex.json"
URL = "https://www.idexanalytics.com.br/"
NOME_FONTE = "IDEX Analytics — IDEX-Infra (arquivos fornecidos ao projeto: planilha de dados e relatório mensal)"
LICENCA = ("Dados da IDEX Analytics fornecidos ao projeto; os termos de uso pedem autorização para reproduzir os "
           "índices")
TOLERANCIA_PP = 0.05  # o produto dos retornos mensais do ano pode diferir do acumulado impresso em até 0,05 p.p.
MESES_12M = 12


def arquivos(pasta=PASTA):
    """Arquivos do IDEX na pasta de entrada (ver idex_arquivos.arquivos)."""
    return idex_arquivos.arquivos(pasta)


def fetch(force=False):  # noqa: ARG001 — os arquivos vêm do usuário; existe pela interface comum dos domínios
    """Nada a baixar: salve a planilha e o relatório novos em data/raw/idex/."""


# ---------- agregados ----------

def _media(linhas, campo):
    """Média de `campo` ponderada pelo peso, só sobre os papéis que têm o campo; None sem nenhum."""
    pares = [(l["peso"], l[campo]) for l in linhas if l[campo] is not None]
    total = sum(p for p, _ in pares)
    return sum(p * v for p, v in pares) / total if total else None


def _r(v, casas):
    return None if v is None else round(v, casas)


def agregar_dia(linhas):
    """{data, spread_medio_bps, duration_media, n_papeis} de um dia: médias ponderadas pelo peso no índice."""
    if not linhas:
        raise ValueError("dia sem papéis")
    (data,) = {l["data"] for l in linhas}
    return {"data": data, "spread_medio_bps": _r(_media(linhas, "spread_bps"), 2),
            "duration_media": _r(_media(linhas, "duration"), 2), "n_papeis": len(linhas)}


def agregar_dias(linhas):
    """Um agregado por dia da planilha, em ordem de data."""
    por_dia = {}
    for l in linhas:
        por_dia.setdefault(l["data"], []).append(l)
    return [agregar_dia(por_dia[d]) for d in sorted(por_dia)]


def mesclar(historico, novos):
    """Histórico + dias novos, em ordem de data; no mesmo dia vale o novo."""
    por_dia = {d["data"]: d for d in historico}
    por_dia.update({d["data"]: d for d in novos})
    return [por_dia[d] for d in sorted(por_dia)]


def ler_historico(path=HISTORICO):
    p = Path(path)
    if not p.exists():
        return []
    return json.loads(p.read_text(encoding="utf-8"))["spread"]


def gravar_historico(historico, path=HISTORICO):
    """Um dia por linha, para o diff do git acompanhar o que entrou."""
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    corpo = ",\n".join(" " + json.dumps(d, ensure_ascii=False, separators=(",", ":")) for d in historico)
    p.write_text('{"spread":[\n' + corpo + '\n]}\n', encoding="utf-8")


# ---------- retornos ----------

def _produto(valores):
    p = 1.0
    for v in valores:
        p *= 1 + v / 100
    return (p - 1) * 100


def acumulado_12m(por_mes):
    """Produto dos retornos dos 12 últimos meses ({"AAAA-MM": pct}); None se esses meses não são seguidos."""
    meses = sorted(por_mes)[-MESES_12M:]
    if len(meses) < MESES_12M:
        return None
    a, m = int(meses[0][:4]), int(meses[0][5:])
    esperado = [f"{a + (m - 1 + k) // 12}-{(m - 1 + k) % 12 + 1:02d}" for k in range(MESES_12M)]
    return round(_produto([por_mes[x] for x in meses]), 2) if meses == esperado else None


def reconciliar(relatorio):
    """Anos em que o produto dos retornos mensais difere do acumulado impresso em mais de 0,05 p.p.:
    [{nome, ano, produto, acumulado}]."""
    out = []
    for nome, anos in relatorio["acumulado_ano"].items():
        for ano, acum in sorted(anos.items()):
            meses = [v for m, v in sorted(relatorio["retornos"][nome].items()) if m.startswith(ano)]
            produto = _produto(meses)
            if abs(produto - acum) > TOLERANCIA_PP + 1e-9:
                out.append({"nome": nome, "ano": ano, "produto": round(produto, 2), "acumulado": acum})
    return out


# ---------- manifesto e fonte ----------

def _rel(p):
    try:
        return Path(p).resolve().relative_to(ROOT).as_posix()
    except ValueError:
        return str(p)


def _br(iso):
    """'AAAA-MM-DD' → dd/mm/aaaa; 'AAAA-MM' → mm/aaaa."""
    return f"{iso[8:10]}/{iso[5:7]}/{iso[:4]}" if len(iso) == 10 else f"{iso[5:7]}/{iso[:4]}"


def _intervalo(a, b):
    return _br(a) if a == b else f"{_br(a)} a {_br(b)}"


def registrar_arquivos(manifesto, itens, hoje):
    """Registra no manifesto os arquivos do IDEX em uso: `itens` = [(Path, descrição, período)]. `acesso` é o dia em que
    o conteúdo foi visto pela primeira vez (o mesmo SHA-256 mantém a data; arquivo novo ou alterado leva `hoje`). Arquivo
    que saiu da pasta sai do manifesto. Devolve {caminho: acesso}."""
    antes = {i["sha256"]: i["acesso"] for i in manifesto.items if i.get("acesso")}
    novos, acessos = [], {}
    for p, descricao, periodo in itens:
        sha = sha256(p)
        acessos[Path(p)] = antes.get(sha, hoje)
        novos.append({"dominio": "idex", "descricao": descricao, "url": "", "arquivo": _rel(p), "bytes": Path(p).stat().st_size,
                      "sha256": sha, "periodo": periodo, "licenca": LICENCA, "acesso": acessos[Path(p)]})
    manifesto.items = novos
    return acessos


def _fonte(periodos, acesso, desde):
    partes = []
    if periodos.get("dados"):
        partes.append("planilha de dados: " + periodos["dados"] + (f" (série acumulada desde {_br(desde)})" if desde else ""))
    if periodos.get("relatorio"):
        partes.append("relatório mensal: " + periodos["relatorio"])
    return {"nome": NOME_FONTE, "url": URL, "periodo": "; ".join(partes), "acesso": acesso, "licenca": LICENCA,
            "tipo": "medido",
            "nota": "Arquivos do IDEX-Infra fornecidos ao projeto (não há endereço público para estes dados). Da planilha "
                    "vêm, por dia, o spread sobre a NTN-B em pontos-base e a duration de cada debênture do IDEX-Infra "
                    "Geral; entram só a média ponderada pelo peso no índice, por dia, e o spread das debêntures de "
                    "transporte do painel no último dia. Do relatório mensal vêm os retornos mensais do IDEX-Infra "
                    "Geral e do Core; o acumulado em 12 meses é o produto dos doze últimos retornos mensais. A série de "
                    "spread cresce a cada planilha de dados nova que o usuário fornece."}


# ---------- bloco ----------

def _universo(path):
    try:
        return {e["ticker"].strip().upper() for e in json.loads(Path(path).read_text(encoding="utf-8"))["emissoes"]}
    except (OSError, ValueError, KeyError):
        return set()


def montar(pasta=PASTA, historico=HISTORICO, debentures=DEBENTURES, hoje=None, manifesto=None):
    """(bloco data/intel/idex.json, histórico atualizado) a partir dos arquivos de `pasta`, do histórico em `historico`
    (caminho) e dos papéis de transporte do bloco de debêntures em `debentures` (caminho). `hoje`: dia de arquivo visto
    pela primeira vez (AAAA-MM-DD; padrão, hoje). `manifesto`: onde fica o dia em que cada arquivo foi visto (padrão, o
    do domínio; quem chama grava com `save`). Sem arquivo nenhum: FileNotFoundError."""
    achados = arquivos(pasta)
    if not achados["datafile"] and not achados["relatorios"]:
        raise FileNotFoundError(2, "nenhum arquivo do IDEX-Infra", str(Path(pasta)))
    hoje = hoje or dt.date.today().isoformat()
    manifesto = manifesto if manifesto is not None else Manifest("idex")
    anterior = ler_historico(historico)

    linhas = idex_arquivos.ler_datafile(achados["datafile"]) if achados["datafile"] else []
    dias = agregar_dias(linhas)
    serie = mesclar(anterior, dias)

    papeis, universo = {}, _universo(debentures)
    if linhas:
        ultimo = max(l["data"] for l in linhas)
        papeis = {l["ticker"]: {"spread_bps": round(l["spread_bps"], 2), "data": ultimo}
                  for l in sorted(linhas, key=lambda l: l["ticker"])
                  if l["data"] == ultimo and l["ticker"] in universo and l["spread_bps"] is not None}

    lidos, ilegiveis = [], []
    for r in achados["relatorios"]:
        try:
            rel = idex_arquivos.ler_relatorio(r)
        except Exception as e:  # noqa: BLE001 — PDF corrompido ou outro: o arquivo vai para a curadoria
            ilegiveis.append({"arquivo": _rel(r), "motivo": f"{type(e).__name__}: {e}"})
            continue
        lidos.append((r, rel))
    retornos, reconciliacao = {}, []
    for r, rel in sorted(lidos, key=lambda x: (x[1]["mes_referencia"], x[0].name)):  # o relatório mais novo vence
        for nome, meses in rel["retornos"].items():
            retornos.setdefault(nome, {}).update(meses)
        reconciliacao += [{**p, "arquivo": _rel(r)} for p in reconciliar(rel)]

    itens = ([(achados["datafile"], "Planilha de dados do IDEX-Infra, fornecida ao projeto",
               _intervalo(dias[0]["data"], dias[-1]["data"]) if dias else "")] if achados["datafile"] else [])
    for r, rel in lidos:
        m = sorted({m for v in rel["retornos"].values() for m in v})
        itens.append((r, "Relatório mensal do IDEX-Infra, fornecido ao projeto", _intervalo(m[0], m[-1])))
    for i in ilegiveis:
        itens.append((ROOT / i["arquivo"] if not Path(i["arquivo"]).is_absolute() else Path(i["arquivo"]),
                      "Relatório mensal do IDEX-Infra, fornecido ao projeto (não pôde ser lido)", ""))
    acessos = registrar_arquivos(manifesto, itens, hoje)

    todos = sorted({m for v in retornos.values() for m in v})
    periodos = {"dados": _intervalo(dias[0]["data"], dias[-1]["data"]) if dias else "",
                "relatorio": _intervalo(todos[0], todos[-1]) if todos else ""}
    desde = serie[0]["data"] if dias and serie[0]["data"] < dias[0]["data"] else None
    bloco = {
        "fonte": [_fonte(periodos, max(acessos.values()), desde)],
        "spread": serie,
        "retornos": {n: [{"mes": m, "pct": v} for m, v in sorted(meses.items())] for n, meses in sorted(retornos.items())},
        "acumulado_12m": {n: acumulado_12m(meses) for n, meses in sorted(retornos.items())},
        "papeis": papeis,
        "pendencias": {"relatorios_ilegiveis": ilegiveis, "reconciliacao": reconciliacao},
    }
    return bloco, {"spread": serie}


def build():
    manifesto = Manifest("idex")
    bloco, historico = montar(manifesto=manifesto)
    manifesto.save()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(bloco, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    gravar_historico(historico["spread"])
    p = bloco["pendencias"]
    meses = {n: len(v) for n, v in bloco["retornos"].items()}
    print(f"{OUT.relative_to(ROOT)}: {len(bloco['spread'])} dias de spread | retornos mensais: "
          f"{', '.join(f'{n} {k}' for n, k in meses.items()) or 'nenhum'} | {len(bloco['papeis'])} papéis de transporte | "
          f"relatórios ilegíveis: {len(p['relatorios_ilegiveis'])} | anos que não reconciliam: {len(p['reconciliacao'])}")
    return bloco


if __name__ == "__main__":
    build()
