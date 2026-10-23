"""Relatório da atualização (data/atualizacao.md): o que mudou por bloco e o que precisa de curadoria manual.

Funções puras, usadas por `scripts/atualizar.py`; a data de referência (`hoje`) vem sempre de fora, para os testes não
dependerem do relógio.

- `itens(conc_aplicado, intel, verif, hoje)`: lista de curadoria `[{tipo, item, motivo}]`, nos tipos de `TIPOS`.
- `diff_blocos(antes, depois)`: registros e tamanho (KB, JSON compacto, como no HTML) de cada bloco antes e depois.
- `relatorio(...)`: o Markdown de data/atualizacao.md.
"""
import datetime as dt
import json

from verificacao import nomes_do_ranking, tem_resultado

TIPOS = {
    "pipeline_atrasado": "Pipeline com data passada ainda como previsto",
    "leilao_sem_verificacao": "Leilão realizado sem resultado na camada de verificação",
    "estado_vencido": "Concessão ainda como a leiloar, com leilão já passado",
    "pipeline_nao_verificado": "Itens do pipeline sem fonte oficial",
    "fonte_antiga": "Fontes acessadas há mais de 12 meses",
    "nome_sem_grupo": "Nomes de proponentes sem grupo econômico",
    "consorcio_sem_composicao": "Consórcios vencedores sem composição na base de consórcios",
    "consorcio_fora_da_ata": "Consórcios que a ata do leilão não lista",
    "emissor_sem_classificacao": "Emissores de debêntures sem classificação",
    "emissao_sem_cadastro_snd": "Debêntures fora do cadastro do SND (data de emissão e coordenador líder \"—\")",
    "debentures_sem_serie": "Debêntures sem série pública ou sem curva das NTN-B (indicador ou spread \"—\")",
    "taxa_fora_do_intervalo": "Taxas de debêntures fora do intervalo plausível (fora das médias)",
    "linha_sem_data": "Linhas das planilhas de debêntures sem data legível (fora dos totais)",
    "ida_dias_com_falha": "Dias do IDA (ANBIMA) que não foram baixados (faltam na série)",
    "idex_arquivo_antigo": "Planilha do IDEX-Infra com o último dia muito antes dos dados de debêntures",
    "idex_relatorio_ilegivel": "Relatórios mensais do IDEX-Infra que não puderam ser lidos",
    "idex_reconciliacao": "Retornos mensais do IDEX-Infra que não fecham com o acumulado do ano impresso",
}
# status do pipeline cuja data ainda é uma previsão (leilão; no "leiloado", a assinatura prevista)
PREVISTOS = ("estudo", "consulta_publica", "tcu", "edital", "leilao_agendado", "leiloado")
REALIZADOS = ("leiloado", "contrato")
# estados do RoadShow de concessão ainda a leiloar (chaves do modelo, em data/base/conc.json `estados`)
ESTADOS_A_LEILOAR = ("agendado2026", "projeto2027")
# fontes curadas à mão: a data de acesso é uma constante do script, não a de um download
ACESSO_CURADO = {
    "pipeline": "revise as fontes e as linhas de data/intel/pipeline.csv e atualize ACESSO e FONTE em "
                "scripts/intel/pipeline.py",
    "base": "revise a fonte e atualize ACESSO e BASE em scripts/intel/fontes_bloco.py",
    "idex": "os arquivos vêm do usuário: salve a planilha de dados e o relatório mensal novos do IDEX-Infra em data/raw/idex/ e "
            "rode `python scripts/atualizar.py --dominios idex`",
    "vmda2025": "o arquivo vem do Google Drive do usuário: troque o zip em data/raw/trafego/vmda2025/ por uma versão nova "
                "e rode `python scripts/atualizar.py --baixar --dominios vmda2025`",
}
# fonte de um bloco que o usuário fornece (não se renova por download): o que fazer quando o acesso passa de um ano
ACESSO_CURADO_FONTE_DO_USUARIO = ("a data é a de quando a planilha das corretoras foi vista pela primeira vez: exporte planilhas "
                                  "novas para data/raw/debentures/ e rode `python scripts/atualizar.py --dominios debentures`")
# bloco de data/intel/ → domínio (script de scripts/intel/) que o gera, quando o nome difere
DOMINIO_DO_BLOCO = {"municipios": "agro"}
DIAS_FONTE_ANTIGA = 365
DIAS_IDEX_ANTIGO = 45  # último dia da planilha do IDEX × data do bloco de debêntures
# o que conta como registro em cada bloco: caminhos (a.b) de listas — conta os valores preenchidos — ou de dicionários
# — conta as chaves. Bloco fora daqui: listas de primeiro nível e `linhas` dos sub-blocos (sem `fonte`).
REGISTROS = {
    "agro": ["ids"],
    "antt": ["pracas.linhas", "sats.linhas", "capas", "series", "obras.linhas"],
    "carga": ["gsa"],
    "debentures": ["emissoes", "secundario.ultimo_por_ticker"],
    "ida": ["indices", "papeis"],
    "estaduais": ["malha.linhas", "entidades"],
    "idex": ["spread", "papeis"],
    "fontes": ["fontes", "indisponiveis", "base"],
    "multimodal": ["ferrovias", "portos", "siade", "exportacao.linhas", "fretes.linhas"],
    "municipios": ["ids"],
    "pipeline": ["itens"],
    "rotas": ["paises", "rotas", "linhas"],
    "trafego": ["vmda.l", "acidentes.n", "abcr.total"],
    "vmda2025": ["fis.t", "estaduais.t"],
}


# ---------- datas ----------

def _data(s):
    """'AAAA-MM-DD' → date; 'AAAA-MM' → último dia do mês; outro valor → None."""
    if not isinstance(s, str):
        return None
    try:
        if len(s) == 10:
            return dt.date.fromisoformat(s)
        if len(s) == 7:
            a, m = int(s[:4]), int(s[5:])
            return dt.date(a + m // 12, m % 12 + 1, 1) - dt.timedelta(days=1)
    except ValueError:
        return None
    return None


def _fmt(s):
    """'AAAA-MM-DD' → dd/mm/aaaa; 'AAAA-MM' → mm/aaaa."""
    return f"{s[8:10]}/{s[5:7]}/{s[:4]}" if len(s) == 10 else f"{s[5:7]}/{s[:4]}"


def _passou(s, hoje):
    d = _data(s)
    return d is not None and d < hoje


# ---------- lista de curadoria ----------

def _nome(i):
    return f"{i.get('nome') or i.get('id')} ({i.get('id')})"


def _pipeline_atrasado(itens, rotulo, hoje, ents_federais):
    """`ents_federais`: ids das concessões federais — com ficha, a data do item vem da concessão (pipeline.montar),
    não do CSV."""
    out = []
    for i in itens:
        if i.get("status") in PREVISTOS and _passou(i.get("data_prevista"), hoje):
            o_que = "a assinatura prevista" if i["status"] == "leiloado" else "a data prevista"
            onde = ("atualize status em data/intel/pipeline.csv; data em data/roadshow/verificacao.json (ou "
                    "entidades.json)" if i.get("ent") in ents_federais else
                    "atualize status e data em data/intel/pipeline.csv")
            out.append(("pipeline_atrasado", _nome(i),
                        f"{o_que} ({_fmt(i['data_prevista'])}) já passou e o status ainda é "
                        f"\"{rotulo.get(i['status'], i['status'])}\": {onde}"))
    return out


def _leilao_sem_verificacao(conc, itens, verif, hoje):
    leiloes = verif.get("leiloes") or []
    # só conta a entrada com resultado: a criada só para a data do edital não verifica o leilão
    ents = {l["ent"] for l in leiloes if "ent" in l and tem_resultado(l)}
    so_edital = {l["ent"] for l in leiloes if "ent" in l} - ents
    parts = {(l["participantes"].get("ano"), l["participantes"].get("lote")) for l in leiloes
             if isinstance(l.get("participantes"), dict)}
    msg = "adicione o leilão a data/roadshow/verificacao.json (receita em docs/HANDOFF.md §2)"
    out, vistos = [], set()
    for e in conc.get("entidades") or []:
        if e.get("id") not in ents and _passou(e.get("leilao"), hoje):
            vistos.add(e["id"])
            o_que = ("a entrada em data/roadshow/verificacao.json tem só a data do edital: acrescente o resultado "
                     "(data do leilão, vencedor, deságio, assinatura) com as fontes (receita em docs/HANDOFF.md §2)"
                     if e["id"] in so_edital else f"sem verificação: {msg}")
            out.append(("leilao_sem_verificacao", _nome(e), f"leilão em {_fmt(e['leilao'])}, {o_que}"))
    for p in (conc.get("mercado") or {}).get("participantes") or []:
        if (p.get("ano"), p.get("lote")) not in parts:
            out.append(("leilao_sem_verificacao", f"{p.get('lote')} ({p.get('ano')})",
                        f"linha de participantes do RoadShow sem verificação: {msg}"))
    for i in itens:  # o pipeline anda antes do RoadShow: leilão federal novo aparece primeiro aqui
        if i.get("esfera") != "federal" or i.get("status") not in REALIZADOS or i.get("ent") in vistos:
            continue
        if i.get("ent") is None or i["ent"] not in ents:
            vistos.add(i.get("ent"))
            sem_ficha = " e sem ficha (ent vazio)" if i.get("ent") is None else ""
            out.append(("leilao_sem_verificacao", _nome(i), f"status \"{i['status']}\" no pipeline{sem_ficha}: {msg}"))
    return out


def _estado_vencido(conc, hoje):
    """Concessão que o RoadShow dá como a leiloar e cuja data de leilão já passou, com ou sem verificação."""
    rotulo = {s.get("key"): s.get("label") for s in conc.get("estados") or []}
    return [("estado_vencido", _nome(e),
             f"estado \"{rotulo.get(e['estado'], e['estado'])}\", mas o leilão foi em {_fmt(e['leilao'])}: atualize o "
             "`estado` (e `status_texto`) da concessão em data/roadshow/entidades.json e o status em "
             "data/intel/pipeline.csv, e rode `python scripts/atualizar.py`")
            for e in conc.get("entidades") or []
            if e.get("estado") in ESTADOS_A_LEILOAR and _passou(e.get("leilao"), hoje)]


def _pipeline_nao_verificado(itens):
    return [("pipeline_nao_verificado", _nome(i),
             "fonte só de imprensa (verificado = false): procure página ou documento oficial e atualize "
             "fonte_url e verificado em data/intel/pipeline.csv") for i in itens if i.get("verificado") is False]


def _fonte_antiga(fontes, hoje):
    out, vistos = [], set()
    linhas = [(f, f.get("bloco")) for f in fontes.get("fontes") or []] + [(f, "base") for f in fontes.get("base") or []]
    for f, bloco in linhas:
        d = _data(f.get("acesso"))
        chave = (f.get("nome"), f.get("url"))
        if d is None or chave in vistos or (hoje - d).days <= DIAS_FONTE_ANTIGA:
            continue
        vistos.add(chave)
        o_que = ACESSO_CURADO_FONTE_DO_USUARIO if (bloco == "debentures" and "corretora" in (f.get("licenca") or "")) else None
        o_que = o_que or ACESSO_CURADO.get(bloco) or (
            f"rode `python scripts/atualizar.py --renovar {DOMINIO_DO_BLOCO.get(bloco, bloco)}`; se nada mudar, a fonte não publicou dado novo ou o "
            "endereço mudou (veja a tabela de constantes por domínio no README)")
        out.append(("fonte_antiga", f"{f.get('nome')} ({bloco})",
                    f"acesso em {_fmt(f['acesso'])}, há {(hoje - d).days} dias: {o_que}"))
    return out


def _nome_sem_grupo(conc, verif):
    if not conc:
        return []
    grupos = {a.get("nome") for a in conc.get("grupos_alias") or []}
    nomes = set(nomes_do_ranking(conc))
    for l in verif.get("leiloes") or []:
        v = ((l.get("campos") or {}).get("grupo_vencedor") or {}).get("valor")
        if isinstance(v, str) and v:
            nomes.add(v)
    return [("nome_sem_grupo", n, "sem grupo econômico em data/roadshow/grupos_alias.json: o ranking de grupos não "
             "consegue creditá-lo (o build falha até a junção existir)") for n in sorted(nomes - grupos)]


def _rotulo_consorcio(nome, lote, ano):
    return f"{nome} ({lote}, {ano})"


def _consorcios(conc):
    """Consórcio vencedor sem composição (ficha sem integrantes ou, na camada de leilões, sem ficha) e consórcio
    marcado `fora_da_ata`. Sem `conc.consorcios` (base ainda não carregada) não há o que conferir."""
    if "consorcios" not in (conc or {}):
        return []
    fichas = conc["consorcios"]
    out = [("consorcio_sem_composicao", _rotulo_consorcio(c["nome"], c["lote"], c["ano"]),
            "vencedor sem composição localizada: pesquise os integrantes (ata do leilão, ato de homologação, "
            "concessionária) e preencha data/roadshow/consorcios.json")
           for c in fichas if c.get("venceu") and not c.get("integrantes")]
    tem = {(c["ano"], c["lote"], c["nome"]) for c in fichas}
    for r in (conc.get("mercado") or {}).get("participantes") or []:
        v = r.get("vencedor")
        if isinstance(v, str) and v.startswith("Consórcio") and (r.get("ano"), r.get("lote"), v) not in tem:
            out.append(("consorcio_sem_composicao", _rotulo_consorcio(v, r.get("lote"), r.get("ano")),
                        "consórcio vencedor sem ficha: acrescente a composição em data/roadshow/consorcios.json"))
    out += [("consorcio_fora_da_ata", _rotulo_consorcio(c["nome"], c["lote"], c["ano"]),
             "o nome está na lista de proponentes do leilão, mas a ata oficial não o traz (provável erro de entrada): "
             "confira a fonte e corrija o proponente em data/roadshow/mercado.json, ou tire a marca fora_da_ata de "
             "data/roadshow/consorcios.json")
            for c in fichas if c.get("fora_da_ata")]
    return out


def _debentures(bloco):
    """Pendências do bloco de debêntures (scripts/intel/debentures.py): emissor das planilhas sem classificação (fica
    fora da página), papel fora do cadastro do SND, série pública ausente e dias de negócio ou intenção IPCA+ sem curva das
    NTN-B do Tesouro."""
    pend = (bloco or {}).get("pendencias") or {}
    refazer = "depois rode `python scripts/atualizar.py --dominios debentures`"
    out = [("emissor_sem_classificacao", p["nome"],
            f"aparece em {', '.join(p['origens'])} ({p['papeis']} {'papéis' if p['papeis'] != 1 else 'papel'}) e ficou fora "
            "da página: classifique-o em data/debentures/emissores.json (subsetor e grupo, numa entrada nova ou como "
            f"grafia em `nomes` de um emissor que já existe) ou, se não for de transporte, ponha o nome em "
            f"`fora_do_universo`; {refazer}")
           for p in pend.get("emissores_sem_classificacao") or []]
    out += [("emissao_sem_cadastro_snd", p["ticker"],
             f"{p['emissor']}: o papel não está no cadastro de debêntures do SND (data/raw/debentures/publico/"
             "snd_caracteristicas.txt), então a data de emissão e o coordenador líder ficam \"—\"; rode "
             "`python scripts/atualizar.py --baixar --dominios debentures` (série recém-registrada pode demorar a entrar "
             "no cadastro) e, se o código da planilha estiver diferente do da ANBIMA, corrija a planilha em "
             "data/raw/debentures/")
            for p in pend.get("emissoes_sem_snd") or []]
    out += [("debentures_sem_serie", s["serie"],
             f"sem arquivo em {s['arquivo']} (a fonte não respondeu): o indicador fica \"—\" e, sem o Tesouro, todos os "
             "spreads também; rode `python scripts/atualizar.py --baixar --dominios debentures` mais tarde")
            for s in pend.get("series_indisponiveis") or []]
    dias = pend.get("dias_sem_curva") or []
    if dias:
        out.append(("debentures_sem_serie", "Curva das NTN-B (Tesouro Direto)",
                    f"sem taxas do Tesouro Direto em {', '.join(_fmt(d) for d in dias)} (feriado, ou o arquivo do "
                    "Tesouro ainda não chegou a esses dias): o spread dos negócios e intenções desses dias fica \"—\"; "
                    "rode `python scripts/atualizar.py --renovar debentures` quando o Tesouro publicar"))
    for t in pend.get("taxas_descartadas") or []:
        taxa = f"{t['taxa']:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
        out.append(("taxa_fora_do_intervalo", f"{t['ticker']} ({t['origem']})",
                    f"taxa de {taxa}% ({t['indexador']}) em {t['n']} linha(s) da planilha, provável erro de digitação: "
                    "ficou fora da taxa média e do spread, mas conta no volume e no número; confira com a corretora e, "
                    "se for o caso, corrija a planilha em data/raw/debentures/ e rode de novo"))
    out += [("linha_sem_data", s["origem"],
             f"{s['n']} linha(s) com data e hora ilegíveis ficaram fora dos totais: confira a coluna de horário da "
             f"planilha em data/raw/debentures/ e rode de novo") for s in pend.get("linhas_sem_data") or []]
    return out


def _ida(bloco):
    """Dias do IDA que o cache não tem e o `fetch` não conseguiu baixar (ou que ainda não foram pedidos), por índice."""
    dias = ((bloco or {}).get("pendencias") or {}).get("dias_sem_download") or []
    por_indice = {}
    for d in dias:
        por_indice.setdefault(d["indice"], []).append(d["data"])
    return [("ida_dias_com_falha", ind,
             f"{len(datas)} dia(s) sem download no cache de data/raw/ida/ ({', '.join(_fmt(d) for d in datas[:6])}"
             f"{', …' if len(datas) > 6 else ''}): a série fica sem esses pontos; rode "
             "`python scripts/atualizar.py --baixar --dominios ida` (o site da ANBIMA responde \"muitas requisições\" "
             "em rajadas; só os dias que faltam são pedidos de novo)")
            for ind, datas in sorted(por_indice.items())]


def _idex(bloco, debentures):
    """Pendências do bloco do IDEX-Infra (scripts/intel/idex.py): planilha com o último dia muito antes do fim dos dados de
    debêntures, relatório mensal que não se lê e ano cujos retornos mensais não fecham com o acumulado impresso."""
    bloco = bloco or {}
    pend = bloco.get("pendencias") or {}
    salvar = "salve o arquivo certo em data/raw/idex/ e rode `python scripts/atualizar.py --dominios idex`"
    out = []
    ultimo = ((bloco.get("spread") or [{}])[-1] or {}).get("data")
    ate = (((debentures or {}).get("secundario") or {}).get("periodo") or {}).get("ate")
    if _data(ultimo) and _data(ate) and (_data(ate) - _data(ultimo)).days > DIAS_IDEX_ANTIGO:
        out.append(("idex_arquivo_antigo", "Planilha de dados do IDEX-Infra",
                    f"o último dia da planilha é {_fmt(ultimo)}, {(_data(ate) - _data(ultimo)).days} dias antes do fim dos "
                    f"dados de debêntures ({_fmt(ate)}): o spread do IDEX-Infra ficou para trás; exporte a planilha de "
                    f"dados mais recente e {salvar}"))
    out += [("idex_relatorio_ilegivel", p["arquivo"],
             f"o relatório não pôde ser lido ({p['motivo']}); os retornos mensais saem sem ele: confira se é o relatório "
             f"mensal do IDEX-Infra com a página \"Histórico de performance\" e {salvar}")
            for p in pend.get("relatorios_ilegiveis") or []]
    out += [("idex_reconciliacao", f"{p['nome']}, {p['ano']}",
             f"os retornos mensais de {p['ano']} compõem {_n(p['produto'], 2)}%, mas o relatório ({p['arquivo']}) imprime "
             f"{_n(p['acumulado'], 2)}% de acumulado no ano (tolerância de 0,05 ponto percentual): provável erro de "
             "digitação no relatório; confira com a IDEX Analytics. Os retornos mensais são usados como estão e o "
             "acumulado de 12 meses sai do produto deles")
            for p in pend.get("reconciliacao") or []]
    return out


def itens(conc_aplicado, intel, verif, hoje=None):
    """Lista de curadoria manual `[{tipo, item, motivo}]`, na ordem de `TIPOS` e, dentro do tipo, por item.
    `conc_aplicado`: CONC com a camada de verificação aplicada; `intel`: {bloco: dados} de data/intel/; `verif`:
    data/roadshow/verificacao.json; `hoje`: data de referência (padrão: hoje)."""
    hoje = hoje or dt.date.today()
    conc_aplicado, intel, verif = conc_aplicado or {}, intel or {}, verif or {}
    pipe = intel.get("pipeline") or {}
    lista = pipe.get("itens") or []
    rotulo = {s["key"]: s["label"] for s in pipe.get("status") or []}
    ents_federais = {e.get("id") for e in conc_aplicado.get("entidades") or []}
    brutos = (_pipeline_atrasado(lista, rotulo, hoje, ents_federais) + _leilao_sem_verificacao(conc_aplicado, lista, verif, hoje)
              + _estado_vencido(conc_aplicado, hoje) + _pipeline_nao_verificado(lista) + _fonte_antiga(intel.get("fontes") or {}, hoje)
              + _nome_sem_grupo(conc_aplicado, verif) + _consorcios(conc_aplicado) + _debentures(intel.get("debentures"))
              + _ida(intel.get("ida")) + _idex(intel.get("idex"), intel.get("debentures")))
    ordem = {t: k for k, t in enumerate(TIPOS)}
    brutos.sort(key=lambda x: (ordem[x[0]], x[1]))
    return [{"tipo": t, "item": i, "motivo": m} for t, i, m in brutos]


# ---------- diferença por bloco ----------

def _em(dados, caminho):
    for k in caminho.split("."):
        dados = dados.get(k) if isinstance(dados, dict) else None
    return dados


def _conta(v):
    if isinstance(v, list):
        return sum(x is not None for x in v)
    return len(v) if isinstance(v, dict) else 0


def registros(bloco, dados):
    """Número de registros do bloco (ver REGISTROS)."""
    if not isinstance(dados, dict):
        return _conta(dados)
    if bloco in REGISTROS:
        return sum(_conta(_em(dados, c)) for c in REGISTROS[bloco])
    return sum(_conta(v) if isinstance(v, list) else _conta(v.get("linhas")) if isinstance(v, dict) else 0
               for k, v in dados.items() if k != "fonte")


def _kb(dados):
    return round(len(json.dumps(dados, ensure_ascii=False, separators=(",", ":")).encode("utf-8")) / 1e3, 3)


def diff_blocos(antes, depois):
    """Uma linha por bloco presente antes ou depois: {bloco, registros_antes, registros_depois, kb_antes, kb_depois}
    (None onde o bloco não existe)."""
    out = []
    for b in sorted(set(antes) | set(depois)):
        a, d = antes.get(b), depois.get(b)
        out.append({"bloco": b,
                    "registros_antes": None if b not in antes else registros(b, a),
                    "registros_depois": None if b not in depois else registros(b, d),
                    "kb_antes": None if b not in antes else _kb(a),
                    "kb_depois": None if b not in depois else _kb(d)})
    return out


# ---------- relatório ----------

def _n(v, casas=0):
    if v is None:
        return "—"
    s = f"{v:,.{casas}f}"
    return s.replace(",", "X").replace(".", ",").replace("X", ".")


def _md(s):
    return str(s).replace("|", "\\|").replace("\n", " ")


def _curto(s, n=400):
    """Texto de célula do relatório: até `n` caracteres (o log do atualizar traz o texto inteiro)."""
    s = str(s)
    return s if len(s) <= n else s[:n - 1] + "…"


def _mudou(d):
    """'não', 'novo', 'removido' ou 'sim (+9 bytes)' / 'sim (−1,2 KB)': a variação aparece mesmo quando o KB arredondado
    não muda."""
    if (d["registros_antes"], d["kb_antes"]) == (d["registros_depois"], d["kb_depois"]):
        return "não"
    if d["kb_antes"] is None or d["kb_depois"] is None:
        return "novo" if d["kb_antes"] is None else "removido"
    delta = round((d["kb_depois"] - d["kb_antes"]) * 1000)
    sinal = "+" if delta >= 0 else "−"
    return f"sim ({sinal}{_n(abs(delta))} bytes)" if abs(delta) < 1000 else f"sim ({sinal}{_n(abs(delta) / 1e3, 1)} KB)"


def relatorio(hoje, passos, diff, itens_curadoria, opcoes="", erros=(), sem_novidade=()):
    """Markdown de data/atualizacao.md. `passos`: [{passo, estado, detalhe}]; `diff`: saída de diff_blocos;
    `itens_curadoria`: saída de itens (None quando não pôde ser calculada); `erros`: da validação da verificação;
    `sem_novidade`: domínios renovados (--renovar) cujos arquivos brutos vieram iguais."""
    linhas = [f"# Atualização dos dados — {hoje.strftime('%d/%m/%Y')}", "",
              f"Gerado por `python scripts/atualizar.py`{f' ({opcoes})' if opcoes else ''}. Diferenças em relação à "
              "versão de `data/intel/` no último commit do git.", "",
              "## Passos", "", "| Passo | Resultado | Detalhe |", "|---|---|---|"]
    linhas += [f"| {_md(p['passo'])} | {p['estado']} | {_md(_curto(p.get('detalhe') or ''))} |" for p in passos]
    if erros:
        linhas += ["", "## Erros da camada de verificação", "",
                   "O HTML não foi gerado. Corrija `data/roadshow/verificacao.json`, `grupos_alias.json` ou `consorcios.json`:", ""]
        linhas += [f"- {_md(e)}" for e in erros]
    if sem_novidade:
        linhas += ["", "## Fontes renovadas sem dado novo", "",
                   "Baixados de novo com `--renovar`, os arquivos destes domínios vieram com o mesmo conteúdo (SHA-256): "
                   "a fonte não publicou dado novo ou o endereço mudou. Confira a página da fonte e as constantes do "
                   "período no script do domínio (README, \"Como atualizar\").", ""]
        linhas += [f"- {d}" for d in sem_novidade]
    linhas += ["", "## O que mudou por bloco", "",
               "Registros: itens das coleções principais de cada bloco (valores preenchidos); KB: JSON compacto, como "
               "entra no HTML.", "",
               "| Bloco | Registros antes | Registros depois | KB antes | KB depois | Mudou |", "|---|---:|---:|---:|---:|---|"]
    for d in diff:
        linhas.append(f"| {d['bloco']} | {_n(d['registros_antes'])} | {_n(d['registros_depois'])} | "
                      f"{_n(d['kb_antes'], 1)} | {_n(d['kb_depois'], 1)} | {_mudou(d)} |")
    linhas += ["", "## Curadoria manual", ""]
    if itens_curadoria is None:
        linhas.append("A lista não foi calculada: a camada de verificação não pôde ser aplicada (veja os erros acima).")
    elif not itens_curadoria:
        linhas.append("Nada a revisar.")
    else:
        linhas.append(f"{len(itens_curadoria)} itens. Cada um diz o arquivo a editar; depois rode de novo o comando.")
        for tipo, titulo in TIPOS.items():
            grupo = [i for i in itens_curadoria if i["tipo"] == tipo]
            if grupo:
                linhas += ["", f"### {titulo} ({len(grupo)})", ""]
                linhas += [f"- **{_md(i['item'])}** — {_md(i['motivo'])}" for i in grupo]
    return "\n".join(linhas) + "\n"
