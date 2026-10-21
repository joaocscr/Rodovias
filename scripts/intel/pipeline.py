"""Pipeline de concessões rodoviárias (federal e estadual): data/intel/pipeline.csv → data/intel/pipeline.json.

`pipeline.csv` é a única fonte curada e editável (versionada): edita-se à mão a cada versão da carteira do Ministério
dos Transportes e o JSON
é regenerado por `build()`, que valida cada linha. A conversão do rascunho bruto (data/raw/pipeline/
pipeline_rascunho.csv, 63 linhas) para o contrato foi uma migração única, já feita; não há código que a refaça.

Colunas do CSV (as do contrato mais `estudo`):
- `uf` e `rodovias`: listas separadas por `;`. `uf` com siglas das 27 UFs; `rodovias` só com códigos (ex.: BR-163,
  ERS-010); vazio quando a fonte não detalha as rodovias.
- `status`: chave do contrato (STATUS). `verificado`: `true` quando a fonte citada em `fonte_url` é página ou
  documento oficial (gov.br, ANTT, BNDES Hub, agência estadual, B3, TCU); `false` quando é só imprensa.
- `ent`: id de entidade federal de data/base/conc.json (item federal) ou de concessão estadual de
  data/intel/estaduais.json (item estadual, ex.: RS Bloco 3 → rs-caminhos-da-serra-gaucha), ou vazio.
- `estudo` (campo extra do contrato): índice base 0 em conc.json `estudos`, só para os 27 estudos pós-2027, que não têm
  entidade (então `ent` fica vazio); null nos demais itens.
- `km`: número > 0, ou vazio quando a fonte não informa.
- `data_prevista` (AAAA-MM-DD ou AAAA-MM; vazio quando a fonte não dá data), conforme o status:
  - edital, leilao_agendado, tcu, consulta_publica, estudo (e suspenso/cancelado, quando houver): data do leilão;
  - leiloado: data da assinatura do contrato (prevista);
  - contrato: data da assinatura do contrato (efetiva).
  Quando o item tem `ent`, a data segue data/base/conc.json (`leilao`, `assinatura`, `assinatura_aditivo`) ou a ficha
  estadual (`assinatura`) para coincidir com as demais abas; divergências de outras fontes (ex.: BNDES Hub) ficam em
  `obs`. O `km` de item com ficha estadual é o `km_decl` da ficha.
- `obs`: texto exibido ao usuário; fatos em linguagem direta.

Uso: python scripts/intel/pipeline.py [fetch|build|all]
"""
import csv
import datetime as dt
import json
import math
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from intel.fontes import RAW, ROOT, Manifest, fetch as baixar  # noqa: E402
from verificacao import aplicar, carregar, carregar_aliases, validar  # noqa: E402

DOMINIO = "pipeline"
RAW_DIR = RAW / DOMINIO
CSV = ROOT / "data" / "intel" / "pipeline.csv"
OUT = ROOT / "data" / "intel" / "pipeline.json"
CONC = ROOT / "data" / "base" / "conc.json"
ESTADUAIS = ROOT / "data" / "intel" / "estaduais.json"
ACESSO = "2026-10-20"

STATUS = [
    ("estudo", "Em estudo"),
    ("consulta_publica", "Consulta pública"),
    ("tcu", "No TCU/TCE"),
    ("edital", "Edital publicado"),
    ("leilao_agendado", "Leilão agendado"),
    ("leiloado", "Leiloado"),
    ("contrato", "Contrato assinado"),
    ("suspenso", "Suspenso"),
    ("cancelado", "Cancelado/deserto"),
]
CHAVES = [k for k, _ in STATUS]
UFS = frozenset("AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split())
RE_RODOVIA = re.compile(r"[A-Z]{2,3}-\d{3}")
RE_DATA = re.compile(r"\d{4}-\d{2}(-\d{2})?")
COLUNAS = ["id", "nome", "esfera", "uf", "rodovias", "km", "status", "data_prevista", "ent", "estudo", "verificado",
           "fonte_url", "fonte_data", "obs"]

FONTE = [
    {"nome": "Carteira de Concessões Rodoviárias 2023-2027 (Ministério dos Transportes, v40)",
     "url": "https://www.gov.br/transportes/pt-br/assuntos/concessoes/concessoes-rodoviarias-2027",
     "periodo": "carteira de 14/10/2026", "acesso": ACESSO, "licenca": "Informação pública (LAI, Lei 12.527/2011)",
     "nota": "O PDF da carteira é só imagem e foi transcrito à mão (slide 12, otimizações; slide 24, cronograma de 2027; slide 26, estudos)."},
    {"nome": "ANTT: Novos projetos em rodovias e Reestruturação de contratos de concessão",
     "url": "https://www.gov.br/antt/pt-br/assuntos/rodovias/novos-projetos-em-rodovias",
     "periodo": "páginas acessadas em 20/10/2026", "acesso": ACESSO,
     "licenca": "Informação pública (LAI, Lei 12.527/2011)",
     "nota": "Algumas páginas estão desatualizadas em relação à carteira do Ministério dos Transportes (Régis, Integração do Sul)."},
    {"nome": "BNDES Hub de Projetos (dados abertos)",
     "url": "https://hubdeprojetos.bndes.gov.br/cms/projetos?__locale=pt",
     "periodo": "marcos até 26/06/2026 (federais) e out/2026 (RS)", "acesso": ACESSO,
     "licenca": "Dados públicos do BNDES",
     "nota": "Marcos às vezes sem atualização (Bloco 2 do RS ainda mostra leilão em andamento após leilão deserto)."},
    {"nome": "Parcerias RS e Goiás Parcerias (páginas oficiais estaduais)",
     "url": "https://parcerias.rs.gov.br/rodovias", "periodo": "jan/2026 a out/2026", "acesso": ACESSO,
     "licenca": "Informação pública (LAI, Lei 12.527/2011)", "nota": "Portal de parcerias de SP (SPI) consultado em 20/10/2026."},
    {"nome": "Imprensa especializada (Agência iNFRA, O Tempo, Itatiaia, Atlas Público)",
     "url": "https://agenciainfra.com/", "periodo": "out/2025 a jul/2026", "acesso": ACESSO,
     "licenca": "Fatos noticiados, citados com link; sem reprodução de texto",
     "nota": "Itens com fonte apenas de imprensa aparecem como não verificados e podem estar desatualizados."},
]

# Arquivos brutos registrados no manifesto: (arquivo em data/raw/pipeline, URL, descrição, período)
BRUTOS = [
    ("bndes/hub_projetos.json", "https://hubdeprojetos.bndes.gov.br/cms/projetos?__locale=pt",
     "BNDES Hub de Projetos: lista de 162 projetos (13 rodoviários)", "out/2026"),
    ("antt_projeto.csv",
     "https://dados.antt.gov.br/dataset/4b54f988-7a11-47a9-8403-0427cea92faa/resource/"
     "f33b7006-a5fb-4eb7-88b3-408cd0797d93/download/projeto-concessao-rodovias.csv",
     "ANTT: projeto-concessao-rodovias (agregado trimestral)", "2023T1-2026T3"),
    ("mt_api_2026.json",
     "https://www.gov.br/transportes/++api++/pt-br/assuntos/concessoes/concessoes-rodoviarias-2026",
     "MT: Concessões Rodoviárias 2026 (API Plone)", "18/10/2026"),
    ("mt_api_2027.json",
     "https://www.gov.br/transportes/++api++/pt-br/assuntos/concessoes/concessoes-rodoviarias-2027",
     "MT: Concessões Rodoviárias 2027 (API Plone)", "18/10/2026"),
    ("mt_carteira_2023_2027.pdf",
     "https://www.gov.br/transportes/pt-br/assuntos/concessoes/conteudos-rodovias-2026/"
     "carteira_de_concessoes_2023_2027_sem_gestao_publica_privada.pdf/@@display-file/file",
     "MT: carteira de concessões 2023-2027 (v40, só imagem)", "14/10/2026"),
]


def fetch():
    """Baixa o que falta em data/raw/pipeline/ e registra em data/manifest/pipeline.json."""
    m = Manifest(DOMINIO)
    for nome, url, descricao, periodo in BRUTOS:
        dest = baixar(url, RAW_DIR / nome)
        m.add(url, dest, descricao, periodo=periodo, licenca="Informação pública")
    m.save()
    return m


# ---------- CSV → JSON ----------

def _lista(v):
    return [x.strip() for x in v.split(";") if x.strip()]


def item_de_linha(r, ents, n_estudos, ents_est=frozenset()):
    """Linha do CSV → item do contrato; levanta ValueError em valor fora do contrato. `ents`: ids federais
    (conc.json); `ents_est`: ids das concessões estaduais (estaduais.json), válidos só em item estadual."""
    def erro(msg):
        raise ValueError(f"{r.get('id')}: {msg}")

    # vírgula fora de aspas desloca as colunas: o DictReader guarda o excesso em None (ou deixa colunas faltando)
    if None in r or any(r.get(c) is None for c in COLUNAS):
        erro(f"linha com {len(COLUNAS)} colunas esperadas, veio outra contagem (vírgula sem aspas?)")

    if r["status"] not in CHAVES:
        erro(f"status inválido {r['status']!r}")
    if r["esfera"] not in ("federal", "estadual"):
        erro(f"esfera inválida {r['esfera']!r}")
    if r["verificado"] not in ("true", "false"):
        erro(f"verificado deve ser true/false, veio {r['verificado']!r}")
    ent = r["ent"] or None
    if ent is not None and ent not in ents and ent not in ents_est:
        erro(f"ent {ent!r} não existe em conc.json nem em estaduais.json")
    if ent in ents_est and r["esfera"] != "estadual":
        erro(f"ent estadual {ent!r} em item {r['esfera']}")
    estudo = None
    if r["estudo"] != "":
        if not r["estudo"].isdigit() or int(r["estudo"]) >= n_estudos:
            erro(f"estudo {r['estudo']!r} fora de conc.json estudos")
        estudo = int(r["estudo"])
        if ent is not None:
            erro("estudo pós-2027 não tem entidade (ent deve ficar vazio)")
    data = r["data_prevista"] or None
    if data is not None:
        try:
            if not RE_DATA.fullmatch(data):
                raise ValueError
            dt.date.fromisoformat(data if len(data) == 10 else data + "-01")
        except ValueError:
            erro(f"data_prevista inválida {data!r} (AAAA-MM-DD ou AAAA-MM, data real)")
    ufs = _lista(r["uf"])
    if not ufs or not set(ufs) <= UFS:
        erro(f"uf inválida {r['uf']!r}")
    rodovias = _lista(r["rodovias"])
    ruins = [x for x in rodovias if not RE_RODOVIA.fullmatch(x)]
    if ruins:
        erro(f"rodovias fora do padrão XX-000: {ruins}")
    km = None
    if r["km"]:
        try:
            km = float(r["km"])
        except ValueError:
            erro(f"km inválido {r['km']!r}")
        if not math.isfinite(km) or not km > 0:
            erro(f"km deve ser finito e > 0, veio {r['km']!r}")
    return {
        "id": r["id"], "nome": r["nome"], "esfera": r["esfera"], "uf": ufs,
        "rodovias": rodovias, "km": round(km, 2) if km is not None else None,
        "status": r["status"], "data_prevista": data, "ent": ent, "estudo": estudo,
        "verificado": r["verificado"] == "true", "fonte_url": r["fonte_url"], "fonte_data": r["fonte_data"],
        "obs": r["obs"],
    }


def montar(csv_path=CSV, conc_path=CONC, est_path=ESTADUAIS):
    # valores de leilão exibidos (camada de verificação sobre a base congelada), validada como no build
    conc = json.loads(Path(conc_path).read_text(encoding="utf-8"))
    verif, aliases = carregar(), carregar_aliases()
    erros = validar(verif, conc, aliases)
    if erros:
        sys.exit("Falha na verificação dos leilões:\n" + "\n".join(erros))
    conc = aplicar(conc, verif, aliases)
    ents = {e["id"] for e in conc["entidades"]}
    est = Path(est_path)
    ents_est = {e["id"] for e in json.loads(est.read_text(encoding="utf-8"))["entidades"]} if est.exists() else set()
    with open(csv_path, encoding="utf-8", newline="") as f:
        itens = [item_de_linha(r, ents, len(conc["estudos"]), ents_est) for r in csv.DictReader(f)]
    return {"fonte": FONTE, "itens": itens, "status": [{"key": k, "label": v} for k, v in STATUS]}


def build():
    OUT.write_text(json.dumps(montar(), ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


if __name__ == "__main__":
    for passo in (sys.argv[1:] or ["all"]):
        if passo in ("fetch", "all"):
            fetch()
        if passo in ("build", "all"):
            build()
