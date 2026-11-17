"""Sentinelas da atualização: o que o download sozinho não percebe.

`scripts/atualizar.py` baixa e regera os blocos, mas não sabe (1) quais insumos só o usuário fornece e quão velhos estão,
(2) quando uma fonte com período fixo no código publicou um período novo (um ano a mais, outra edição) e (3) se há
branch de atualização sem merge, que levaria consigo dias que a ANBIMA já tirou do ar. Este módulo responde às três
perguntas; o relatório (`curadoria.relatorio`) as transforma nas seções "Precisa de você", "Não atualizou nesta rodada"
e "Novidades nas fontes".

Cada item é {grupo, fonte, situacao, acao}:
- grupo "usuario": insumo que só o usuário fornece (planilhas das corretoras, IDEX-Infra) ou que ele precisa conferir
  (SNV do DNIT, que não se baixa daqui);
- grupo "novidade": a fonte publicou período ou edição que o código ainda não lê (ajuste de constante ou extração);
- grupo "sem_verificacao": a checagem não pôde ser feita (site fora do ar); o motivo vai na situação;
- grupo "git": branch de atualização com commits fora do `main`.

As checagens com rede recebem `pedir(url) -> texto` (padrão: curl com o proxy do ambiente) para os testes não
dependerem da internet; as demais leem só os blocos e os arquivos brutos.
"""
import datetime as dt
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

UA = "Mozilla/5.0 (X11; Linux x86_64) rodovias-intel"
INFRASA = "https://geo.infrasa.gov.br/server/rest/services/Hosted"
SNV_INFRASA = f"{INFRASA}/Rodovias_Federais_SNV/FeatureServer/0/query?where=1%3D1&outFields=versao_snv" \
              "&returnDistinctValues=true&returnGeometry=false&f=json"
MT_2026 = "https://www.gov.br/transportes/++api++/pt-br/assuntos/concessoes/concessoes-rodoviarias-2026"
ROTAS_PAGINA = ("https://www.gov.br/planejamento/pt-br/assuntos/assuntos-internacionais-e-desenvolvimento/"
                "rotas-de-integracao-sul-americana")
PAM_PERIODOS = "https://servicodados.ibge.gov.br/api/v3/agregados/1612/periodos"
DNIT_SNV = "https://www.gov.br/dnit/pt-br/assuntos/atlas-e-mapas/pnv-e-snv"
PASTA_DRIVE = "pasta Rodovias do Google Drive"
DIAS_INSUMO_VELHO = 21          # planilhas das corretoras e IDEX: acima disso, o relatório pede com destaque
MESES_SNV_VELHO = 6             # SNV: o DNIT publica versões ao longo do ano; acima disso, pedir conferência


def item(grupo, fonte, situacao, acao):
    return {"grupo": grupo, "fonte": fonte, "situacao": situacao, "acao": acao}


def pedir_curl(url, timeout=60):
    r = subprocess.run(["curl", "-sS", "-L", "-A", UA, "-m", str(timeout), url], capture_output=True)
    if r.returncode != 0:
        raise RuntimeError(r.stderr.decode(errors="replace").strip() or f"curl saiu com {r.returncode}")
    return r.stdout.decode("utf-8", errors="replace")


def _datas_br(texto):
    """Datas DD/MM/AAAA do texto, em ISO, na ordem em que aparecem."""
    return [f"{a}-{m}-{d}" for d, m, a in re.findall(r"(\d{2})/(\d{2})/(\d{4})", texto or "")]


def _dias(de, hoje):
    return (hoje - dt.date.fromisoformat(de)).days


def _idade(dias):
    return "hoje" if dias == 0 else "1 dia atrás" if dias == 1 else f"{dias} dias atrás"


def _br(iso):
    return dt.date.fromisoformat(iso).strftime("%d/%m/%Y")


# ---------- 1. insumos do usuário (sem rede) ----------

def insumos_do_usuario(intel, hoje):
    """Itens "usuario" a partir dos blocos: sempre listados, com a data dos dados em uso, para o pedido ao usuário ser
    concreto ("negócios até 13/11; mande de 14/11 em diante")."""
    out = []
    deb = intel.get("debentures") or {}
    per = " ".join(f.get("periodo") or "" for f in deb.get("fonte", []) if f["nome"].startswith(("BTG", "XP")))
    telas = _datas_br(" ".join(re.findall(r"tela de \d{2}/\d{2}/\d{4}", per)))
    fins = _datas_br(" ".join(re.findall(r" a \d{2}/\d{2}/\d{4}", per)))     # fim dos períodos de negócios e intenções
    if telas or fins:
        fim = max(fins or telas)
        idade = _dias(fim, hoje)
        out.append(item("usuario", "Debêntures — telas e negócios das corretoras (XP e BTG)",
                        (f"tela de {_br(max(telas))}; " if telas else "")
                        + f"negócios e intenções até {_br(fim)} ({_idade(idade)})"
                        + (" — desatualizado" if idade > DIAS_INSUMO_VELHO else ""),
                        f"Exporte as telas de debêntures isentas da XP e da BTG (do dia) e os negócios (BTG) e intenções "
                        f"(XP) desde {_br(fim)} e mande na conversa ou salve na {PASTA_DRIVE}."))
    idex = intel.get("idex") or {}
    per = " ".join(f.get("periodo") or "" for f in idex.get("fonte", []))
    datas = _datas_br(" ".join(re.findall(r"planilha de dados: [^;(]*", per)))
    rel = re.findall(r"relatório mensal: \d{2}/\d{4} a (\d{2})/(\d{4})", per)
    if datas or rel:
        fim = max(datas) if datas else None
        situ = []
        if fim:
            situ.append(f"planilha de dados até {_br(fim)} ({_idade(_dias(fim, hoje))})")
        if rel:
            situ.append(f"relatório mensal até {rel[0][0]}/{rel[0][1]}")
        out.append(item("usuario", "IDEX-Infra (IDEX Analytics)", "; ".join(situ),
                        f"Salve na {PASTA_DRIVE} a planilha de dados mais recente do IDEX-Infra Geral (datafile .xlsx) e "
                        "o último relatório mensal em PDF."))
    return out


def _versao_snv(intel):
    base = next((b for b in (intel.get("fontes") or {}).get("base", []) if b.get("bloco") == "snv"), None)
    m = re.search(r"(\d{6}[A-Z])", (base or {}).get("periodo") or (base or {}).get("nome") or "")
    return m.group(1) if m else None


def snv_para_conferir(intel, hoje):
    """O SNV não se baixa daqui (portais do DNIT bloqueados): pede conferência quando a versão em uso tem mais de
    MESES_SNV_VELHO meses."""
    v = _versao_snv(intel)
    if not v:
        return []
    ano, mes = int(v[:4]), int(v[4:6])
    meses = (hoje.year - ano) * 12 + hoje.month - mes
    if meses < MESES_SNV_VELHO:
        return []
    return [item("usuario", "SNV (DNIT)", f"o painel usa a versão {v}, de {meses} meses atrás",
                 f"Veja em {DNIT_SNV} (seção do SNV) se há versão mais nova; se houver, salve o zip na {PASTA_DRIVE}.")]


# ---------- 2. novidades nas fontes ----------

def _max_mes_antt(raw):
    """Último mês (AAAA-MM) do volume mensal de 2026 da ANTT em disco, ou None."""
    achados = []
    for p in Path(raw).glob("volume-trafego-praca-pedagio*/*.csv"):
        try:
            texto = p.read_bytes()[:20_000_000].decode("latin1", errors="replace")
        except OSError:
            continue
        for m, a in re.findall(r"(?:^|;)\"?(\d{2})[-/](\d{4})\"?(?=;)", texto, re.M):
            achados.append(f"{a}-{m}")
        for a, m in re.findall(r"(?:^|;)(\d{4})-(\d{2})(?:-\d{2})?(?=;)", texto, re.M):
            achados.append(f"{a}-{m}")
    return max(achados) if achados else None


def antt_meses(raw, ultimo_no_codigo):
    mx = _max_mes_antt(raw)
    if mx and mx > ultimo_no_codigo:
        return [item("novidade", "ANTT — volume mensal das praças",
                     f"o arquivo baixado vai até {mx}, e o código corta em {ultimo_no_codigo}",
                     "Estenda MESES (e SAT_JANELA e os períodos das fontes) em scripts/intel/antt.py e rode "
                     "`python scripts/atualizar.py --dominios antt`.")]
    return []


def anos_fechados(hoje, fontes_ano):
    """Fontes anuais com o ano fixo no código: quando um ano mais novo já fechou (o ano passado), pede conferência.
    `fontes_ano`: [(fonte, ano no código, o que editar)]."""
    out = []
    for fonte, ano, onde in fontes_ano:
        if hoje.year - 1 > ano:
            out.append(item("novidade", fonte, f"o código usa {ano}; {hoje.year - 1} já fechou",
                            f"Confira se a fonte publicou {hoje.year - 1} e edite {onde}."))
    return out


def vmda_novo(pedir, ano_no_codigo=2025):
    nomes = [s["name"] for s in json.loads(pedir(f"{INFRASA}?f=json")).get("services", [])]
    anos = sorted({int(m.group(1)) for n in nomes for m in [re.search(r"VMDa_Modelagem_(\d{4})$", n)] if m})
    if anos and anos[-1] > ano_no_codigo:
        return [item("novidade", "VMDa (Infra S.A./DNIT)", f"a Infra S.A. publica a modelagem {anos[-1]}",
                     f"Crie o bloco do VMDa {anos[-1]} a partir de scripts/intel/vmda2025.py (CAMADA).")]
    return []


def snv_infrasa(pedir, versao_no_painel):
    d = json.loads(pedir(SNV_INFRASA))
    vs = sorted({f["attributes"]["versao_snv"] for f in d.get("features", []) if f["attributes"].get("versao_snv")})
    if vs and versao_no_painel and vs[-1] > versao_no_painel:
        return [item("novidade", "SNV (DNIT)", f"a Infra S.A. já publica a versão {vs[-1]} (o painel usa {versao_no_painel})",
                     "Baixe o SNV novo do DNIT (ou da camada Rodovias_Federais_SNV da Infra S.A.) e regenere a base com "
                     "`python scripts/build.py --shp` (README, \"Regenerar com um SNV novo\").")]
    return []


def pam_nova(pedir, ano_no_codigo):
    periodos = [int(p["id"]) for p in json.loads(pedir(PAM_PERIODOS)) if str(p.get("id", "")).isdigit()]
    if periodos and max(periodos) > ano_no_codigo:
        return [item("novidade", "IBGE — Produção Agrícola Municipal (PAM)", f"o SIDRA já tem {max(periodos)}",
                     f"Troque /p/{ano_no_codigo}/ e as chaves pam*_{ano_no_codigo} em scripts/intel/agro.py.")]
    return []


def roadshow_novo(pedir, versao_no_painel):
    texto = pedir(MT_2026)
    vs = [int(v) for v in re.findall(r"RoadShow-PT \(v(\d+)\)", texto)]
    if vs and max(vs) > versao_no_painel:
        return [item("novidade", "RoadShow (Ministério dos Transportes)",
                     f"as fichas do site já são da versão v{max(vs)} (o painel usa a v{versao_no_painel})",
                     f"Salve o PDF da edição nova na {PASTA_DRIVE}; a extração segue o roteiro 2 do README.")]
    return []


def rotas_nova(pedir, data_no_codigo):
    datas = []
    for d, m, a in re.findall(r"apresentacao-rotas-de-integracao-(\d{2})-(\d{2})-(\d{2})", pedir(ROTAS_PAGINA)):
        datas.append(f"20{a}-{m}-{d}")
    if datas and max(datas) > data_no_codigo:
        return [item("novidade", "Rotas de Integração Sul-Americana (MPO)",
                     f"há apresentação de {_br(max(datas))} (o painel usa a de {_br(data_no_codigo)})",
                     "Atualize PDF e URL_APRESENTACAO em scripts/intel/rotas.py e confira a georreferência.")]
    return []


# ---------- 3. git ----------

def branches_sem_merge(git=None, atual=None):
    """Branches remotas de atualização (claude/*) com commits que nem origin/main nem o branch atual têm."""
    git = git or (lambda *a: subprocess.run(["git", *a], cwd=ROOT, capture_output=True, text=True).stdout)
    atual = atual or git("rev-parse", "--abbrev-ref", "HEAD").strip()
    out = []
    for b in git("branch", "-r", "--no-merged", "origin/main").split():
        b = b.strip()
        if not b.startswith("origin/claude/") or b == f"origin/{atual}":
            continue
        if git("rev-list", "--count", f"HEAD..{b}").strip() == "0":   # já junto a este branch: vai no mesmo PR
            continue
        n = git("rev-list", "--count", f"origin/main..{b}").strip()
        out.append(item("git", b.removeprefix("origin/"), f"{n} commit(s) fora do main",
                        "Junte ao branch desta atualização (git merge) antes de gerar os blocos: históricos versionados "
                        "(data/indices/) podem ter dias que as fontes já tiraram do ar. Depois, o merge no main é do usuário."))
    return out


# ---------- o que o código usa hoje (lido dos próprios scripts, para não haver uma segunda cópia) ----------

def no_codigo():
    """{chave: valor} dos períodos e edições fixos nos scripts dos domínios."""
    from intel import agro, antt, fontes_bloco, multimodal, rotas, trafego, vmda2025
    arqs = " ".join(a[1] for a in multimodal.ARQUIVOS)
    return {
        "antt_ultimo_mes": antt.MESES[-1],
        "antt_ano": antt.PRACAS_ANO,
        "prf_ano": max(trafego.ANOS),
        "siade_ano": int(re.search(r"producao_origem_destino_(\d{4})", arqs).group(1)),
        "comex_ano": int(re.search(r"EXP_(\d{4})", arqs).group(1)),
        "pam_ano": int(re.search(r"/p/(\d{4})/", " ".join(a[0] for a in agro.ARQUIVOS)).group(1)),
        "vmda_ano": int(re.search(r"VMDa_Modelagem_(\d{4})", vmda2025.CAMADA).group(1)),
        "roadshow_versao": fontes_bloco.ROADSHOW_VERSAO,
        "rotas_data": re.search(r"(\d{4}-\d{2}-\d{2})", str(rotas.PDF)).group(1),
    }


# ---------- tudo junto ----------

def verificar(intel, hoje, rede=True, pedir=pedir_curl, raw=ROOT / "data" / "raw", git=None, codigo=None):
    """Todos os itens. Sem `rede`, só os que não precisam de internet. Checagem que falha vira "sem_verificacao"."""
    out = insumos_do_usuario(intel, hoje) + snv_para_conferir(intel, hoje)
    c = codigo or no_codigo()
    out += antt_meses(raw / "antt", c["antt_ultimo_mes"])
    out += anos_fechados(hoje, [
        ("PRF — acidentes (DATATRAN)", c["prf_ano"], "ANOS e PRF_IDS em scripts/intel/trafego.py"),
        ("ANTT — SIADE, produção ferroviária", c["siade_ano"],
         "o arquivo producao_origem_destino_AAAA em scripts/intel/multimodal.py"),
        ("MDIC — Comex Stat, exportações", c["comex_ano"], "EXP_AAAA e o ano em build_exportacao (scripts/intel/multimodal.py)"),
        ("ANTT — receita por praça e séries anuais", c["antt_ano"], "PRACAS_ANO, SAT_ANO e ANOS em scripts/intel/antt.py"),
    ])
    if rede:
        versao = _versao_snv(intel)
        for fonte, f in [("VMDa (Infra S.A./DNIT)", lambda: vmda_novo(pedir, c["vmda_ano"])),
                         ("SNV (DNIT)", lambda: snv_infrasa(pedir, versao)),
                         ("IBGE — PAM", lambda: pam_nova(pedir, c["pam_ano"])),
                         ("RoadShow", lambda: roadshow_novo(pedir, c["roadshow_versao"])),
                         ("Rotas de Integração", lambda: rotas_nova(pedir, c["rotas_data"]))]:
            try:
                out += f()
            except Exception as e:  # noqa: BLE001 — site fora do ar ou resposta inesperada
                out.append(item("sem_verificacao", fonte, f"não consegui conferir se há edição nova ({type(e).__name__}: "
                                f"{str(e)[:160]})", "Tento de novo na próxima atualização."))
    try:
        out += branches_sem_merge(git)
    except Exception:  # noqa: BLE001 — fora de um clone do git
        pass
    return out
