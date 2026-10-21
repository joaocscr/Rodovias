"""Atualiza os dados do HTML em um comando e escreve o relatório data/atualizacao.md.

Uso: python scripts/atualizar.py [--baixar] [--dominios trafego,antt,...] [--sem-html]

Ordem: os domínios de `ORDEM` (o `build` de cada script de scripts/intel/; com --baixar, antes o `fetch`), o bloco de
fontes (`fontes_bloco.py`), a validação da camada de verificação dos leilões e o `build.py` (HTML único). Cada passo
chama a função do script existente; nada de lógica de dados aqui.

- Domínio cujo bruto falta em data/raw/ (sem --baixar) ou cujo arquivo do usuário falta (VMDa 2025) é pulado com
  aviso; domínio que falha (download, build) também não derruba os outros. Em ambos os casos os JSON de data/intel/
  ficam como estavam antes do passo.
- O código de saída só é diferente de 0 quando a validação da verificação ou o build do HTML falham.
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
BASE = ROOT / "data" / "base"
ROADSHOW = ROOT / "data" / "roadshow"
SAIDA = ROOT / "data" / "atualizacao.md"
HTML = ROOT / "mapa-rodovias.html"
PDF_ROADSHOW = ROOT / "data" / "raw" / "roadshow.pdf"
# vmda2025 lê a malha estadual (estaduais.json); pipeline confere `ent` contra conc.json e estaduais.json
ORDEM = ("trafego", "antt", "carga", "agro", "multimodal", "pipeline", "estaduais", "vmda2025", "rotas")


class Pular(Exception):
    """Passo pulado com aviso: falta um arquivo que só o usuário fornece."""


def _rel(p):
    try:
        return str(Path(p).resolve().relative_to(ROOT))
    except ValueError:
        return str(p)


# ---------- passos ----------

def passos_dominios(dominios, baixar, importar=importlib.import_module):
    """[(nome, função)] dos domínios pedidos, sempre na ordem de ORDEM. Com `baixar`, `fetch` (no vmda2025,
    `registrar`, que só grava no manifesto o zip fornecido pelo usuário) antes do `build`."""
    def passo(d):
        def rodar():
            m = importar(f"intel.{d}")
            if d == "vmda2025":
                if not Path(m.ZIP).exists():
                    raise Pular(f"falta {_rel(m.ZIP)} (shapefile do Google Drive do usuário; ver README, "
                                "\"Atualizar os dados\"); vmda2025.json ficou como estava")
                if baixar:
                    m.registrar()
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


def _instantaneo(intel_dir):
    return {p.name: p.read_bytes() for p in Path(intel_dir).glob("*.json")}


def _restaura(intel_dir, antes):
    for p in Path(intel_dir).glob("*.json"):
        if p.name not in antes:
            p.unlink()
    for nome, conteudo in antes.items():
        p = Path(intel_dir) / nome
        if not p.exists() or p.read_bytes() != conteudo:
            p.write_bytes(conteudo)


def executar(passos, intel_dir=INTEL, baixar=False, log=print):
    """Roda cada passo; um passo pulado ou que falha não interrompe os seguintes e tem os JSON de `intel_dir`
    restaurados. Devolve [{passo, estado ('ok' | 'pulado' | 'falhou'), detalhe}]."""
    out = []
    for nome, rodar in passos:
        log(f"== {nome}")
        antes = _instantaneo(intel_dir)
        estado, detalhe = "ok", ""
        try:
            rodar()
        except Pular as e:
            estado, detalhe = "pulado", str(e)
        except SystemExit as e:
            estado, detalhe = "falhou", str(e.code)
        except Exception as e:  # noqa: BLE001 — qualquer falha do domínio vira aviso no relatório
            ausente = _arquivo_ausente(e)
            if ausente:  # sem --baixar o bruto ausente é esperado (pula); com --baixar, o download não o trouxe (falha)
                estado = "falhou" if baixar else "pulado"
                detalhe = f"arquivo ausente: {ausente}" + ("" if baixar else " (baixe com `--baixar`)")
            else:
                estado, detalhe = "falhou", f"{type(e).__name__}: {e}"
        if estado != "ok":
            _restaura(intel_dir, antes)
            log(f"AVISO: {nome} {estado}: {detalhe}")
        out.append({"passo": nome, "estado": estado, "detalhe": detalhe[:400]})
    return out


# ---------- funções padrão (scripts existentes) ----------

def fontes_bloco():
    from intel import fontes_bloco as fb
    fb.build()


def validar_camada():
    """(erros, conc com a camada aplicada ou None, verificacao.json): a mesma validação do build.py, sem sair."""
    from roadshow import curados
    from verificacao import aplicar, carregar, carregar_aliases, validar
    conc = curados(json.loads((BASE / "conc.json").read_text(encoding="utf-8")), ROADSHOW)
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

def atualizar(dominios=ORDEM, baixar=False, html=True, hoje=None, intel_dir=INTEL, saida=SAIDA,
              importar=importlib.import_module, validar=validar_camada, construir=construir_html, fontes=fontes_bloco,
              anterior=versao_anterior, log=print):
    """Roda a atualização e escreve o relatório em `saida`; devolve o código de saída (0, ou 1 se a validação ou o
    HTML falharem). As funções injetáveis existem para os testes."""
    hoje = hoje or dt.date.today()
    antes = anterior(intel_dir)
    passos = executar(passos_dominios(dominios, baixar, importar) + [("fontes_bloco", fontes)], intel_dir, baixar, log)

    log("== validação da camada de verificação")
    try:
        erros, aplicado, verif = validar()
    except Exception as e:  # noqa: BLE001 — JSON ilegível etc.
        erros, aplicado, verif = [f"{type(e).__name__}: {e}"], None, {}
    passos.append({"passo": "validação da verificação", "estado": "falhou" if erros else "ok",
                   "detalhe": f"{len(erros)} erro(s), listados abaixo" if erros else ""})
    if erros:
        passos.append({"passo": "build.py (HTML)", "estado": "pulado", "detalhe": "a validação da verificação falhou"})
    elif not html:
        passos.append({"passo": "build.py (HTML)", "estado": "pulado", "detalhe": "--sem-html"})
    else:
        passos += executar([("build.py (HTML)", construir)], intel_dir, baixar, log)
    if not PDF_ROADSHOW.exists():
        passos.append({"passo": "RoadShow (PDF)", "estado": "pulado",
                       "detalhe": "data/raw/roadshow.pdf ausente: os testes que conferem o PDF ficam pulados; os "
                                  "dados do RoadShow vêm de data/roadshow/*.json e não mudam com este comando"})

    depois = carregar_blocos(intel_dir)
    diff = curadoria.diff_blocos(antes, depois)
    itens = None if aplicado is None else curadoria.itens(aplicado, depois, verif, hoje)
    opcoes = ", ".join(["--baixar" if baixar else "sem --baixar"]
                       + ([f"--dominios {','.join(d for d in ORDEM if d in set(dominios))}"]
                          if set(dominios) != set(ORDEM) else [])
                       + ([] if html else ["--sem-html"]))
    Path(saida).write_text(curadoria.relatorio(hoje, passos, diff, itens, opcoes, erros), encoding="utf-8")

    conta = {e: sum(p["estado"] == e for p in passos) for e in ("ok", "pulado", "falhou")}
    mudou = [d["bloco"] for d in diff if (d["registros_antes"], d["kb_antes"]) != (d["registros_depois"], d["kb_depois"])]
    log(f"\natualização: {conta['ok']} passos ok, {conta['pulado']} pulados, {conta['falhou']} com falha | "
        f"blocos que mudaram: {', '.join(mudou) or 'nenhum'} | curadoria: "
        f"{'não calculada' if itens is None else len(itens)} item(ns) | relatório em {_rel(saida)}")
    for p in passos:
        if p["estado"] != "ok":
            log(f"  {p['estado']}: {p['passo']} — {p['detalhe']}")
    falhou = erros or any(p["passo"] == "build.py (HTML)" and p["estado"] == "falhou" for p in passos)
    return 1 if falhou else 0


def main(argv=None):
    ap = argparse.ArgumentParser(description="Atualiza os dados do HTML e escreve data/atualizacao.md.")
    ap.add_argument("--baixar", action="store_true", help="baixa antes as fontes públicas (fetch de cada domínio)")
    ap.add_argument("--dominios", help=f"lista separada por vírgula, entre: {','.join(ORDEM)} (padrão: todos)")
    ap.add_argument("--sem-html", action="store_true", help="não gera o mapa-rodovias.html")
    args = ap.parse_args(argv)
    dominios = ORDEM
    if args.dominios:
        dominios = [d.strip() for d in args.dominios.split(",") if d.strip()]
        ruins = [d for d in dominios if d not in ORDEM]
        if ruins:
            ap.error(f"domínio(s) desconhecido(s): {', '.join(ruins)} (use: {', '.join(ORDEM)})")
    return atualizar(dominios, baixar=args.baixar, html=not args.sem_html)


if __name__ == "__main__":
    sys.exit(main())
