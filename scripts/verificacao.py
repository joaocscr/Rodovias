"""Camada de verificação dos leilões: valores de campos de leilão conferidos em fonte, aplicados sobre a base congelada.

`data/roadshow/verificacao.json` guarda, por leilão, os campos verificados (valor + fontes), notas e proponentes
inabilitados; `data/roadshow/grupos_alias.json` liga nomes impressos/verificados a grupos econômicos. `entidades.json`,
`mercado.json` e `data/base/conc.json` continuam sendo a transcrição do RoadShow: a camada só é aplicada no build
(`build.py`) e no pipeline (`intel/pipeline.py`).

Hierarquia do valor exibido: `oficial` > `roadshow` > `imprensa`. O valor do RoadShow que deixa de ser exibido fica
registrado (em `verif[campo].roadshow` e, na entidade, como alternativa da divergência com a página).
"""
import copy
import datetime as dt
import json
import re
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent.parent
ROADSHOW = ROOT / "data" / "roadshow"

CAMPOS = ("leilao", "grupo_vencedor", "desagio", "assinatura", "assinatura_aditivo", "inicio_operacao",
          "tarifa_teto", "tarifa_vencedora", "prazo_anos")
CAMPOS_DATA = ("leilao", "assinatura", "assinatura_aditivo", "inicio_operacao")
CAMPOS_NUM = ("desagio", "prazo_anos")
# tarifas levam unidade e data-base ("R$ 4,083 por praça (jul/2007)"): texto livre não vazio
CAMPOS_TEXTO = ("grupo_vencedor", "tarifa_teto", "tarifa_vencedora")
# campo da camada → chave na linha de mercado.participantes (os demais têm o mesmo nome)
PART_KEY = {"grupo_vencedor": "vencedor", "desagio": "desagio_vencedor", "leilao": "data"}
# campo da camada → chave na linha de mercado.concorrentes_desagio (só o deságio existe ali)
CONC_KEY = {"desagio": "desagio"}
DOMINIOS_OFICIAIS = ("gov.br", "b3.com.br", "jus.br", "leg.br", "imprensaoficial.com.br")
TIPOS = ("oficial", "roadshow", "imprensa")
ROTULO = {"oficial": "oficial", "roadshow": "RoadShow", "imprensa": "imprensa (não oficial)"}
CHAVES_FONTE = ("id", "tipo", "orgao", "titulo", "data", "url", "pagina", "acesso", "trecho")
# campos obrigatórios por tipo de fonte (além de `tipo`)
EXIGIDOS = {"oficial": ("orgao", "url", "acesso"), "roadshow": ("pagina",),
            "imprensa": ("orgao", "data", "url", "acesso")}
MOTIVOS = ("mesmo nome", "troca de nome", "grafia", "razão social do grupo", "consórcio liderado por")
RE_DATA_FONTE = re.compile(r"\d{4}(-\d{2}(-\d{2})?)?")


def carregar(path=ROADSHOW / "verificacao.json"):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def carregar_aliases(path=ROADSHOW / "grupos_alias.json"):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def tipo_campo(fontes):
    """Tipo do valor pela fonte mais forte: oficial > roadshow > imprensa; None sem fontes (não localizado)."""
    tipos = {f["tipo"] for f in fontes}
    return next((t for t in TIPOS if t in tipos), None)


# ---------- validação ----------

def _dominio_oficial(url):
    if not isinstance(url, str):
        return False
    u = urlparse(url)
    host = u.hostname or ""
    return u.scheme in ("http", "https") and any(
        host == d or host.endswith("." + d) for d in DOMINIOS_OFICIAIS)


def _data_iso(v):
    if not isinstance(v, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", v):
        return False
    try:
        dt.date.fromisoformat(v)
    except ValueError:
        return False
    return True


def _erros_fonte(fid, f):
    tipo = f.get("tipo") if isinstance(f, dict) else None
    if tipo not in TIPOS:
        return [f"fonte {fid}: tipo {tipo!r} fora de {TIPOS}"]
    erros = [f"fonte {fid} ({tipo}): falta {k}" for k in EXIGIDOS[tipo] if f.get(k) in (None, "")]
    if tipo == "oficial" and f.get("url") and not _dominio_oficial(f["url"]):
        erros.append(f"fonte {fid} (oficial): URL {f['url']} fora dos domínios oficiais {DOMINIOS_OFICIAIS}")
    if tipo == "roadshow" and f.get("pagina") is not None and not (
            isinstance(f["pagina"], int) and not isinstance(f["pagina"], bool) and f["pagina"] > 0):
        erros.append(f"fonte {fid} (roadshow): página {f['pagina']!r} inválida")
    for k in ("data", "acesso"):
        if f.get(k) and not RE_DATA_FONTE.fullmatch(str(f[k])):
            erros.append(f"fonte {fid}: {k} {f[k]!r} fora do formato AAAA, AAAA-MM ou AAAA-MM-DD")
    return erros


def _erros_valor(campo, v):
    if campo in CAMPOS_DATA and not _data_iso(v):
        return f"{campo} deve ser data AAAA-MM-DD, veio {v!r}"
    if campo in CAMPOS_NUM and (isinstance(v, bool) or not isinstance(v, (int, float))):
        return f"{campo} deve ser número, veio {v!r}"
    if campo in CAMPOS_TEXTO and (not isinstance(v, str) or not v.strip()):
        return f"{campo} deve ser texto não vazio, veio {v!r}"
    return None


def _erros_refs(chave, onde, ids, fontes, exige=True):
    if not isinstance(ids, list) or (exige and not ids):
        return [f"{chave}: {onde} sem fonte"]
    return [f"{chave}: {onde} cita fonte não declarada {fid!r}" for fid in ids if fid not in fontes]


def _linhas(conc, nome):
    return (conc.get("mercado") or {}).get(nome) or []


def _ligacoes(l):
    """(identidade do alvo, mapa campo→chave na linha) para cada ligação do leilão."""
    lig = []
    if "ent" in l:
        lig.append((("ent", l["ent"]), {c: c for c in CAMPOS}))
    if "participantes" in l:
        p = l["participantes"] or {}
        lig.append((("participantes", p.get("ano"), p.get("lote")), {c: PART_KEY.get(c, c) for c in CAMPOS}))
    if "concorrentes" in l:
        lig.append((("concorrentes", l["concorrentes"]), CONC_KEY))
    return lig


def _erros_aliases(aliases, fontes):
    erros, vistos = [], {}
    for i, a in enumerate(aliases.get("aliases", [])):
        nome, grupo = a.get("nome"), a.get("grupo")
        if not nome or not grupo:
            erros.append(f"grupos_alias #{i}: nome e grupo são obrigatórios ({a!r})")
            continue
        if a.get("motivo") not in MOTIVOS:
            erros.append(f"grupos_alias {nome!r}: motivo {a.get('motivo')!r} fora de {MOTIVOS}")
        if "fontes" in a:  # opcional: evidência da junção, ids de verificacao.json
            erros += _erros_refs(f"grupos_alias {nome!r}", "junção", a["fontes"], fontes)
        if nome in vistos and vistos[nome] != grupo:
            erros.append(f"grupos_alias {nome!r}: ligado a dois grupos ({vistos[nome]!r} e {grupo!r})")
        vistos.setdefault(nome, grupo)
    return erros


def validar(verif, conc, aliases=None):
    """Confere a camada contra a base: fontes completas, ligações que casam, campos e valores válidos e, com
    `aliases`, grupo econômico para cada vencedor verificado e para todo nome que o ranking conta (participantes já
    com a camada aplicada). Devolve as mensagens de erro (lista vazia = válido)."""
    erros = []
    if verif.get("versao") != 1:
        erros.append(f"verificacao.json: versao {verif.get('versao')!r}, esperada 1")
    fontes = verif.get("fontes") or {}
    for fid, f in fontes.items():
        erros += _erros_fonte(fid, f)

    ents = {e["id"] for e in conc.get("entidades", [])}
    part = _linhas(conc, "participantes")
    concs = _linhas(conc, "concorrentes_desagio")
    nomes_alias = {a.get("nome") for a in (aliases or {}).get("aliases", [])}
    chaves, donos = set(), {}
    for l in verif.get("leiloes", []):
        chave = l.get("chave")
        if not chave:
            erros.append(f"leilão sem chave: {l!r}")
            continue
        if chave in chaves:
            erros.append(f"{chave}: chave repetida")
        chaves.add(chave)

        if not any(k in l for k in ("ent", "participantes", "concorrentes")):
            erros.append(f"{chave}: sem ligação (ent, participantes ou concorrentes)")
        if "ent" in l and l["ent"] not in ents:
            erros.append(f"{chave}: entidade {l['ent']!r} não existe em conc.json")
        if "participantes" in l:
            p = l["participantes"] or {}
            n = sum(1 for r in part if r.get("ano") == p.get("ano") and r.get("lote") == p.get("lote"))
            if n != 1:
                erros.append(f"{chave}: participantes {p!r} casa {n} linhas (esperada exatamente 1)")
        if "concorrentes" in l:
            n = sum(1 for r in concs if r.get("leilao") == l["concorrentes"])
            if n != 1:
                erros.append(f"{chave}: concorrentes {l['concorrentes']!r} casa {n} linhas (esperada exatamente 1)")
        # um alvo por leilão: um segundo leilão leria o valor já trocado como original do RoadShow
        ligacoes = _ligacoes(l)
        for alvo, _ in ligacoes:
            if alvo in donos:
                erros.append(f"{chave}: {alvo[0]} {alvo[1:]!r} já ligado ao leilão {donos[alvo]!r}")
            else:
                donos[alvo] = chave

        for campo, c in (l.get("campos") or {}).items():
            if campo not in CAMPOS:
                erros.append(f"{chave}: campo {campo!r} fora dos campos de leilão {CAMPOS}")
                continue
            if ligacoes and not any(campo in mapa for _, mapa in ligacoes):
                erros.append(f"{chave}: campo {campo!r} não tem onde ser aplicado nas ligações "
                             f"{[a[0] for a, _ in ligacoes]}")
            lim = c.get("limitado_pelo_edital")
            if "limitado_pelo_edital" in c and (campo != "desagio" or not isinstance(lim, bool)):
                erros.append(f"{chave}.{campo}: limitado_pelo_edital só vale em desagio e deve ser true/false, "
                             f"veio {lim!r}")
            if c.get("nao_localizado"):
                if c.get("valor") is not None:
                    erros.append(f"{chave}.{campo}: não localizado deve ter valor null, veio {c['valor']!r}")
                erros += _erros_refs(chave, campo, c.get("fontes", []), fontes, exige=False)
                continue
            if "valor" not in c or c["valor"] is None:
                erros.append(f"{chave}.{campo}: sem valor (use nao_localizado: true)")
            else:
                e = _erros_valor(campo, c["valor"])
                if e:
                    erros.append(f"{chave}.{campo}: {e}")
            erros += _erros_refs(chave, campo, c.get("fontes"), fontes)
            if (aliases is not None and campo == "grupo_vencedor" and isinstance(c.get("valor"), str)
                    and c["valor"] and c["valor"] not in nomes_alias):
                erros.append(f"{chave}: vencedor {c['valor']!r} sem grupo em grupos_alias.json")

        for i, nota in enumerate(l.get("notas") or []):
            if not nota.get("texto"):
                erros.append(f"{chave}: nota #{i} sem texto")
            erros += _erros_refs(chave, f"nota #{i}", nota.get("fontes"), fontes)
        for i, inab in enumerate(l.get("inabilitados") or []):
            if not inab.get("grupo"):
                erros.append(f"{chave}: inabilitado #{i} sem grupo")
            if inab.get("data") is not None and not _data_iso(inab["data"]):
                erros.append(f"{chave}: inabilitado #{i} com data {inab['data']!r} fora de AAAA-MM-DD")
            erros += _erros_refs(chave, f"inabilitado #{i}", inab.get("fontes"), fontes)

    if aliases is not None:
        erros += _erros_aliases(aliases, fontes)
        if not erros:  # `aplicar` supõe a camada válida; com erros, os nomes ficam para a próxima rodada
            faltam = [n for n in nomes_do_ranking(aplicar(conc, verif, aliases)) if n not in nomes_alias]
            erros += [f"participantes: nome {n!r} sem grupo em grupos_alias.json" for n in faltam]
    return erros


# ---------- aplicação ----------

def _fonte(fid, fontes):
    f = fontes[fid]
    return {k: (fid if k == "id" else f.get(k)) for k in CHAVES_FONTE}


def _pagina(e, campo):
    """Página do RoadShow do campo na entidade (`fontes` pode ser número ou lista: vale o primeiro número)."""
    p = (e.get("fontes") or {}).get(campo)
    if isinstance(p, list):
        p = next((x for x in p if isinstance(x, (int, float)) and not isinstance(x, bool)), None)
    return p if isinstance(p, (int, float)) and not isinstance(p, bool) else None


def _fmt(campo, v):
    if isinstance(v, str) and _data_iso(v):
        a, m, d = v.split("-")
        return f"{d}/{m}/{a}"
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        s = f"{v:.2f}".replace(".", ",") if isinstance(v, float) else str(v)
        return s + ("%" if campo == "desagio" else "")
    return str(v)


def _divergencia(e, campo, original, valor, tipo):
    """Registra na entidade o valor do RoadShow que deixou de ser exibido (sem duplicar o novo valor exibido)."""
    divs = e.setdefault("divergencias", [])
    alt_rs = {"valor": original, "pagina": _pagina(e, campo)}
    d = next((x for x in divs if x.get("campo") == campo), None)
    if d is None:
        sufixo = "não localizado em fonte oficial." if tipo is None else f"exibido o valor de fonte {ROTULO[tipo]}."
        divs.append({"campo": campo, "exibido": valor, "alternativas": [alt_rs],
                     "nota": f"RoadShow imprime {_fmt(campo, original)}; {sufixo}"})
        return
    resto = [a for a in d.get("alternativas", []) if a.get("valor") != valor and a.get("valor") != original]
    d["exibido"] = valor
    d["alternativas"] = [alt_rs] + resto
    impressos = [_fmt(campo, a["valor"]) + (f" (p. {a['pagina']})" if a.get("pagina") is not None else "")
                 for a in d["alternativas"]]
    lista = impressos[0] if len(impressos) == 1 else ", ".join(impressos[:-1]) + " e " + impressos[-1]
    sufixo = "não localizado em fonte oficial." if tipo is None else f"exibido o valor de fonte {ROTULO[tipo]}."
    d["nota"] = f"RoadShow imprime {lista}; {sufixo}"


def _aplicar_campo(alvo, chave, campo, c, fontes, entidade):
    valor = None if c.get("nao_localizado") else c["valor"]
    fs = [_fonte(fid, fontes) for fid in c.get("fontes", [])]
    tipo = None if c.get("nao_localizado") else tipo_campo(fs)
    original = alvo.get(chave)
    mudou = original != valor
    if mudou:
        alvo[chave] = valor
        if entidade and original is not None:
            _divergencia(alvo, campo, original, valor, tipo)
    info = alvo.setdefault("verif", {})[campo] = {
        "tipo": tipo, "nao_localizado": bool(c.get("nao_localizado")), "fontes": fs,
        "roadshow": original if mudou else None}
    if campo == "desagio":  # critério híbrido: deságio no teto do edital, desempate por outorga
        info["limitado_pelo_edital"] = bool(c.get("limitado_pelo_edital"))


def _alvos(conc, l):
    """(linha, mapa campo→chave, é entidade) para cada ligação do leilão."""
    alvos = []
    for alvo, mapa in _ligacoes(l):
        if alvo[0] == "ent":
            r = next(x for x in conc["entidades"] if x["id"] == alvo[1])
        elif alvo[0] == "participantes":
            r = next(x for x in conc["mercado"]["participantes"] if (x["ano"], x["lote"]) == alvo[1:])
        else:
            r = next(x for x in conc["mercado"]["concorrentes_desagio"] if x["leilao"] == alvo[1])
        alvos.append((r, mapa, alvo[0] == "ent"))
    return alvos


def aplicar(conc, verif, aliases):
    """Cópia de `conc` com a camada aplicada (supõe `validar` sem erros). Cada linha ligada ganha `verif`,
    `notas_verif` e `inabilitados`; `conc.verificacao` resume fontes e cobertura; `conc.grupos_alias` leva os aliases
    (com as fontes da junção resolvidas)."""
    out = copy.deepcopy(conc)
    fontes = verif.get("fontes") or {}
    for l in verif.get("leiloes", []):
        notas = [{"texto": n["texto"], "fontes": [_fonte(fid, fontes) for fid in n["fontes"]]}
                 for n in l.get("notas") or []]
        inabs = [{"grupo": i["grupo"], "desagio": i.get("desagio"), "data": i.get("data"),
                  "fontes": [_fonte(fid, fontes) for fid in i["fontes"]]} for i in l.get("inabilitados") or []]
        for alvo, chaves, entidade in _alvos(out, l):
            alvo.setdefault("verif", {})
            for campo, c in (l.get("campos") or {}).items():
                if campo in chaves:
                    _aplicar_campo(alvo, chaves[campo], campo, c, fontes, entidade)
            alvo.setdefault("notas_verif", []).extend(copy.deepcopy(notas))
            alvo.setdefault("inabilitados", []).extend(copy.deepcopy(inabs))
    ordem = {t: i for i, t in enumerate(TIPOS)}
    lista = sorted((_fonte(fid, fontes) for fid in fontes),
                   key=lambda f: (ordem.get(f["tipo"], len(TIPOS)), f["orgao"] or "", f["id"]))
    out["verificacao"] = {"fontes": lista, "cobertura": cobertura(verif)}
    out["grupos_alias"] = [{**copy.deepcopy(a), "fontes": [_fonte(fid, fontes) for fid in a["fontes"]]}
                           if "fontes" in a else copy.deepcopy(a) for a in aliases.get("aliases", [])]
    return out


def nomes_do_ranking(conc_aplicado):
    """Nomes que o ranking de grupos conta, já com a camada aplicada: vencedor exibido, demais proponentes e
    inabilitados de cada linha de `mercado.participantes` (ordenados, sem repetição)."""
    nomes = set()
    for r in _linhas(conc_aplicado, "participantes"):
        nomes.add(r.get("vencedor"))
        nomes.update(o.get("grupo") for o in r.get("outros") or [])
        nomes.update(i.get("grupo") for i in r.get("inabilitados") or [])
    return sorted(n for n in nomes if isinstance(n, str) and n)


def cobertura(verif):
    """Contagem de campos verificados por tipo da fonte mais forte, e de campos não localizados."""
    fontes = verif.get("fontes") or {}
    cont = {"leiloes": len(verif.get("leiloes", [])), "oficial": 0, "roadshow": 0, "imprensa": 0, "nao_localizado": 0}
    for l in verif.get("leiloes", []):
        for c in (l.get("campos") or {}).values():
            tipo = None if c.get("nao_localizado") else tipo_campo([fontes[fid] for fid in c.get("fontes", [])])
            cont[tipo or "nao_localizado"] += 1
    return cont


# ---------- relatório ----------

def _md(v):
    return "—" if v is None else str(v).replace("|", "\\|")


def relatorio_markdown(verif, conc_aplicado):
    """Relatório de cobertura (data/roadshow/verificacao.md): totais por tipo e, por leilão, cada campo verificado."""
    cob = cobertura(verif)
    linhas = [
        "# Verificação dos leilões",
        "",
        "Gerado por `scripts/build.py` a partir de `data/roadshow/verificacao.json`. Hierarquia do valor exibido: "
        "oficial > RoadShow > imprensa (não oficial).",
        "",
        "## Cobertura",
        "",
        "| Leilões | Campos oficial | Campos RoadShow | Campos imprensa | Não localizados |",
        "|---:|---:|---:|---:|---:|",
        f"| {cob['leiloes']} | {cob['oficial']} | {cob['roadshow']} | {cob['imprensa']} | {cob['nao_localizado']} |",
        "",
        "## Campos verificados",
        "",
    ]
    if not verif.get("leiloes"):
        return "\n".join(linhas + ["Nenhum leilão verificado ainda.", ""])
    linhas += ["| Leilão | Campo | Exibido | Origem | RoadShow (quando difere) | Fontes |",
               "|---|---|---|---|---|---|"]
    for l in verif["leiloes"]:
        alvos = _alvos(conc_aplicado, l)
        for campo, c in (l.get("campos") or {}).items():
            alvo, chaves = next(((a, k) for a, k, _ in alvos if campo in k), (None, None))
            info = ((alvo or {}).get("verif") or {}).get(campo) or {}
            exibido = alvo.get(chaves[campo]) if alvo is not None else c.get("valor")
            origem = "não localizado" if c.get("nao_localizado") else ROTULO.get(info.get("tipo"), "—")
            rs = info.get("roadshow")
            linhas.append(f"| {_md(l['chave'])} | {campo} | {_md(None if exibido is None else _fmt(campo, exibido))} | "
                          f"{origem} | {_md(None if rs is None else _fmt(campo, rs))} | "
                          f"{_md(', '.join(c.get('fontes', [])) or None)} |")
    notas = [(l["chave"], n["texto"]) for l in verif["leiloes"] for n in l.get("notas") or []]
    inabs = [(l["chave"], i) for l in verif["leiloes"] for i in l.get("inabilitados") or []]
    if notas:
        linhas += ["", "## Notas", ""] + [f"- **{k}**: {t}" for k, t in notas]
    if inabs:
        linhas += ["", "## Inabilitados", ""] + [
            f"- **{k}**: {i['grupo']} ({_fmt('desagio', i['desagio']) if i.get('desagio') is not None else '—'}), "
            f"inabilitado em {_fmt('leilao', i['data']) if i.get('data') else '—'}" for k, i in inabs]
    return "\n".join(linhas + [""])
