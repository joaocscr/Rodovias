"""Atualiza os dados do HTML em um comando e escreve o relatório data/atualizacao.md.

Uso: python scripts/atualizar.py [--baixar] [--renovar [dominios]] [--dominios trafego,antt,...] [--sem-html]

Ordem: os domínios de `ORDEM` (o `build` de cada script de scripts/intel/; com --baixar, antes o `fetch`, que baixa só
o que falta; com --renovar, o `fetch(force=True)`, que baixa tudo de novo), o bloco de fontes (`fontes_bloco.py`), a
validação da camada de verificação dos leilões e o `build.py` (HTML único). Cada passo chama a função do script
existente; nada de lógica de dados aqui.

- Domínio cujo bruto falta em data/raw/ (sem --baixar) ou cujo arquivo do usuário falta (VMDa 2025) é pulado com
  aviso; domínio que falha (download, build) também não derruba os outros. Em ambos os casos os JSON de data/intel/
  ficam como estavam antes do passo.
- O código de saída só é diferente de 0 quando a validação da verificação ou o build do HTML falham (qualquer
  resultado do HTML que não seja ok conta como falha, nunca como passo pulado).
- Domínio renovado cujos arquivos brutos vieram com o mesmo SHA-256 do manifesto entra no relatório como "fonte
  renovada sem dado novo".
- O relatório compara cada bloco com a versão do último commit (`git show HEAD:data/intel/<bloco>.json`; sem git, com
  a cópia lida antes de rodar) e lista o que precisa de curadoria manual (`curadoria.itens`).
"""
import argparse
import datetime as dt
import importlib
import json
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import curadoria  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
INTEL = ROOT / "data" / "intel"
MANIFESTO = ROOT / "data" / "manifest"
BASE = ROOT / "data" / "base"
ROADSHOW = ROOT / "data" / "roadshow"
SAIDA = ROOT / "data" / "atualizacao.md"
HTML = ROOT / "mapa-rodovias.html"
PDF_ROADSHOW = ROOT / "data" / "raw" / "roadshow.pdf"
# vmda2025 lê a malha estadual (estaduais.json); pipeline confere `ent` contra conc.json e estaduais.json
ORDEM = ("trafego", "antt", "carga", "agro", "multimodal", "pipeline", "estaduais", "vmda2025", "rotas")
# o zip do VMDa 2025 vem do Drive do usuário: não há o que baixar de novo
RENOVAVEIS = tuple(d for d in ORDEM if d != "vmda2025")
PASSO_HTML = "build.py (HTML)"


class Pular(Exception):
    """Passo pulado com aviso: falta um arquivo que só o usuário fornece."""


def _rel(p):
    try:
        return str(Path(p).resolve().relative_to(ROOT))
    except ValueError:
        return str(p)


# ---------- passos ----------

def passos_dominios(dominios, baixar, importar=importlib.import_module, renovar=()):
    """[(nome, função)] dos domínios pedidos, sempre na ordem de ORDEM. Com `baixar`, `fetch` (no vmda2025,
    `registrar`, que só grava no manifesto o zip fornecido pelo usuário) antes do `build`; os domínios de `renovar`
    usam `fetch(force=True)`."""
    renovar = set(renovar)

    def passo(d):
        def rodar():
            m = importar(f"intel.{d}")
            if d == "vmda2025":
                if not Path(m.ZIP).exists():
                    raise Pular(f"falta {_rel(m.ZIP)} (shapefile do Google Drive do usuário; ver README, "
                                "\"Atualizar os dados\"); vmda2025.json ficou como estava")
                if baixar:
                    m.registrar()
            elif d in renovar:
                m.fetch(force=True)
            elif baixar:
                m.fetch()
            m.build()
        return d, rodar
    pedidos = set(dominios)
    return [passo(d) for d in ORDEM if d in pedidos]


def _arquivo_ausente(e):
    """Caminho do arquivo que faltou, quando a exceção é de arquivo ausente (a do Python ou a do PyMuPDF, que tem o
    mesmo nome mas outra classe); senão None."""
    if type(e).__name__ != "FileNotFoundError":
        return None
    nome = getattr(e, "filename", None)
    if not nome:
        m = re.search(r"'([^']+)'", str(e))
        nome = m.group(1) if m else str(e)
    return _rel(nome)


def _instantaneo(pastas):
    return {p: p.read_bytes() for d in pastas if d is not None for p in Path(d).glob("*.json")}


def _restaura(pastas, antes):
    for d in pastas:
        if d is None:
            continue
        for p in Path(d).glob("*.json"):
            if p not in antes:
                p.unlink()
    for p, conteudo in antes.items():
        if not p.exists() or p.read_bytes() != conteudo:
            p.write_bytes(conteudo)


def executar(passos, intel_dir=INTEL, baixar=False, log=print, manifest_dir=MANIFESTO, critico=False):
    """Roda cada passo; um passo pulado ou que falha não interrompe os seguintes e tem os JSON de `intel_dir` e o
    manifesto (`manifest_dir`) restaurados. `baixar`: True/False, ou o conjunto dos passos que baixam (para eles,
    arquivo ausente é falha). `critico` (o HTML): nunca é pulado; qualquer resultado que não seja ok é falha, sem a
    dica de --baixar. Devolve [{passo, estado ('ok' | 'pulado' | 'falhou'), detalhe}]."""
    out, pastas = [], (intel_dir, manifest_dir)
    for nome, rodar in passos:
        log(f"== {nome}")
        baixou = baixar if isinstance(baixar, bool) else nome in baixar
        antes = _instantaneo(pastas)
        estado, detalhe = "ok", ""
        try:
            rodar()
        except Pular as e:
            estado, detalhe = "falhou" if critico else "pulado", str(e)
        except SystemExit as e:
            estado, detalhe = "falhou", str(e.code)
        except Exception as e:  # noqa: BLE001 — qualquer falha do domínio vira aviso no relatório
            ausente = _arquivo_ausente(e)
            if ausente and critico:
                estado, detalhe = "falhou", f"arquivo ausente: {ausente}"
            elif ausente:  # sem --baixar o bruto ausente é esperado (pula); com --baixar, o download não o trouxe (falha)
                estado = "falhou" if baixou else "pulado"
                detalhe = f"arquivo ausente: {ausente}" + ("" if baixou else " (baixe com `--baixar`)")
            else:
                estado, detalhe = "falhou", f"{type(e).__name__}: {e}"
        if estado != "ok":
            _restaura(pastas, antes)
            if not critico:  # o passo crítico é relatado por quem chama, com a mensagem própria
                log(f"AVISO: {nome} {estado}: {detalhe}")
        out.append({"passo": nome, "estado": estado, "detalhe": detalhe[:400]})
    return out


# ---------- funções padrão (scripts existentes) ----------

def fontes_bloco():
    from intel import fontes_bloco as fb
    fb.build()


def validar_camada():
    """(erros, conc com a camada aplicada ou None, verificacao.json): a mesma validação do build.py, sem sair, sobre o
    mesmo CONC (base congelada + JSON curados de data/roadshow/, inclusive as entidades)."""
    from roadshow import conc_da_base
    from verificacao import aplicar, carregar, carregar_aliases, validar
    ler = lambda nome: json.loads((BASE / nome).read_text(encoding="utf-8"))  # noqa: E731
    conc = conc_da_base(ler("conc.json"), ROADSHOW, ler("snv.json"))
    verif, aliases = carregar(), carregar_aliases()
    erros = validar(verif, conc, aliases)
    try:
        aplicado = aplicar(conc, verif, aliases)
    except Exception:  # noqa: BLE001 — camada malformada: a lista de curadoria fica para depois da correção
        aplicado = None
    return erros, aplicado, verif


def construir_html():
    import build
    build.build_from_base(BASE, str(HTML))


def carregar_blocos(intel_dir):
    """{bloco: dados} de data/intel/ (sem o manifesto), como o build.py lê."""
    return {p.stem: json.loads(p.read_text(encoding="utf-8")) for p in sorted(Path(intel_dir).glob("*.json"))
            if p.stem != "manifest"}


def _git(*args):
    return subprocess.run(["git", "-C", str(ROOT), *args], capture_output=True, check=True).stdout


def versao_anterior(intel_dir):
    """Blocos do último commit (`git show HEAD:…`; bloco que não está no commit fica de fora e aparece como novo). Sem
    git, ou com `intel_dir` fora do repositório, a cópia dos arquivos lida antes de rodar."""
    atuais = carregar_blocos(intel_dir)
    try:
        _git("rev-parse", "--verify", "HEAD")
        rel = Path(intel_dir).resolve().relative_to(ROOT).as_posix()
    except (ValueError, OSError, subprocess.CalledProcessError):
        return atuais
    out = {}
    for bloco in atuais:
        try:
            out[bloco] = json.loads(_git("show", f"HEAD:{rel}/{bloco}.json").decode("utf-8"))
        except (subprocess.CalledProcessError, json.JSONDecodeError):
            continue
    return out


# ---------- orquestração ----------

def _shas(manifest_dir, dominio):
    """Conteúdo registrado no manifesto do domínio: {arquivo: sha256}."""
    p = Path(manifest_dir) / f"{dominio}.json"
    try:
        return {i["arquivo"]: i.get("sha256") for i in json.loads(p.read_text(encoding="utf-8"))}
    except (OSError, ValueError, KeyError, TypeError):
        return {}


SEM_NOVIDADE = "renovado: nenhum arquivo mudou (a fonte não publicou dado novo ou o endereço mudou)"


def atualizar(dominios=ORDEM, baixar=False, html=True, hoje=None, intel_dir=INTEL, saida=SAIDA, renovar=(),
              manifest_dir=MANIFESTO, importar=importlib.import_module, validar=validar_camada, construir=construir_html,
              fontes=fontes_bloco, anterior=versao_anterior, log=print):
    """Roda a atualização e escreve o relatório em `saida`; devolve o código de saída (0, ou 1 se a validação ou o
    HTML falharem). `renovar`: domínios baixados de novo (fetch com force). As funções injetáveis existem para os
    testes."""
    hoje = hoje or dt.date.today()
    renovar = set(renovar)
    antes = anterior(intel_dir)
    shas_antes = {d: _shas(manifest_dir, d) for d in renovar}
    baixam = set(ORDEM) if baixar else renovar
    passos = executar(passos_dominios(dominios, baixar, importar, renovar) + [("fontes_bloco", fontes)], intel_dir,
                      baixam, log, manifest_dir)
    sem_novidade = []
    for p in passos:
        d = p["passo"]
        if d in renovar and p["estado"] == "ok" and _shas(manifest_dir, d) == shas_antes[d]:
            sem_novidade.append(d)
            p["detalhe"] = SEM_NOVIDADE

    log("== validação da camada de verificação")
    try:
        erros, aplicado, verif = validar()
    except Exception as e:  # noqa: BLE001 — JSON ilegível etc.
        erros, aplicado, verif = [f"{type(e).__name__}: {e}"], None, {}
    passos.append({"passo": "validação da verificação", "estado": "falhou" if erros else "ok",
                   "detalhe": f"{len(erros)} erro(s), listados abaixo" if erros else ""})
    if erros:
        passos.append({"passo": PASSO_HTML, "estado": "pulado", "detalhe": "a validação da verificação falhou"})
    elif not html:
        passos.append({"passo": PASSO_HTML, "estado": "pulado", "detalhe": "--sem-html"})
    else:
        (r,) = executar([(PASSO_HTML, construir)], intel_dir, False, log, None, critico=True)
        if r["estado"] != "ok":  # o HTML nunca é "pulado": qualquer resultado que não seja ok é falha
            r["detalhe"] = f"o HTML não foi gerado: {r['detalhe']}"
            log(f"ERRO: {r['detalhe']}")
        passos.append(r)
    if not PDF_ROADSHOW.exists():
        passos.append({"passo": "RoadShow (PDF)", "estado": "pulado",
                       "detalhe": "data/raw/roadshow.pdf ausente: os testes que conferem o PDF ficam pulados; os "
                                  "dados do RoadShow vêm de data/roadshow/*.json e não mudam com este comando"})

    depois = carregar_blocos(intel_dir)
    diff = curadoria.diff_blocos(antes, depois)
    itens = None if aplicado is None else curadoria.itens(aplicado, depois, verif, hoje)
    pedidos = set(dominios)
    opcoes = ", ".join(["--baixar" if baixar else "sem --baixar"]
                       + ([f"--renovar {','.join(d for d in ORDEM if d in renovar)}"] if renovar else [])
                       + ([f"--dominios {','.join(d for d in ORDEM if d in pedidos)}"] if pedidos != set(ORDEM) else [])
                       + ([] if html else ["--sem-html"]))
    Path(saida).write_text(curadoria.relatorio(hoje, passos, diff, itens, opcoes, erros, sem_novidade), encoding="utf-8")

    conta = {e: sum(p["estado"] == e for p in passos) for e in ("ok", "pulado", "falhou")}
    mudou = [d["bloco"] for d in diff if (d["registros_antes"], d["kb_antes"]) != (d["registros_depois"], d["kb_depois"])]
    log(f"\natualização: {conta['ok']} passos ok, {conta['pulado']} pulados, {conta['falhou']} com falha | "
        f"blocos que mudaram: {', '.join(mudou) or 'nenhum'} | curadoria: "
        f"{'não calculada' if itens is None else len(itens)} item(ns) | relatório em {_rel(saida)}")
    for p in passos:
        if p["estado"] != "ok" or p["passo"] in sem_novidade:
            log(f"  {p['estado']}: {p['passo']} — {p['detalhe']}")
    falhou = erros or any(p["passo"] == PASSO_HTML and p["estado"] == "falhou" for p in passos)
    return 1 if falhou else 0


def main(argv=None):
    ap = argparse.ArgumentParser(description="Atualiza os dados do HTML e escreve data/atualizacao.md.")
    ap.add_argument("--baixar", action="store_true", help="baixa antes as fontes públicas (fetch de cada domínio)")
    ap.add_argument("--renovar", nargs="?", const="", metavar="DOMINIOS",
                    help="baixa de novo, mesmo o que já existe em data/raw/, os domínios listados (vírgula) ou, sem "
                         f"lista, todos os pedidos; não vale para vmda2025 (arquivo do usuário). Entre: {','.join(RENOVAVEIS)}")
    ap.add_argument("--dominios", help=f"lista separada por vírgula, entre: {','.join(ORDEM)} (padrão: todos)")
    ap.add_argument("--sem-html", action="store_true", help="não gera o mapa-rodovias.html")
    args = ap.parse_args(argv)
    lista = lambda txt: [d.strip() for d in txt.split(",") if d.strip()]  # noqa: E731
    dominios = ORDEM
    if args.dominios:
        dominios = lista(args.dominios)
        ruins = [d for d in dominios if d not in ORDEM]
        if ruins:
            ap.error(f"domínio(s) desconhecido(s): {', '.join(ruins)} (use: {', '.join(ORDEM)})")
    renovar = ()
    if args.renovar is not None:
        renovar = lista(args.renovar) or [d for d in dominios if d in RENOVAVEIS]
        if "vmda2025" in renovar:
            ap.error("vmda2025 vem do Google Drive do usuário: troque o zip em data/raw/trafego/vmda2025/ e rode sem "
                     "--renovar")
        ruins = [d for d in renovar if d not in ORDEM]
        if ruins:
            ap.error(f"domínio(s) desconhecido(s) em --renovar: {', '.join(ruins)} (use: {', '.join(RENOVAVEIS)})")
        fora = [d for d in renovar if d not in dominios]
        if fora:
            ap.error(f"--renovar {', '.join(fora)}: domínio fora de --dominios")
    return atualizar(dominios, baixar=args.baixar, html=not args.sem_html, renovar=renovar)


if __name__ == "__main__":
    sys.exit(main())
