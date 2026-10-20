"""Pipeline de concessões rodoviárias (federal e estadual): data/intel/pipeline.csv → data/intel/pipeline.json.

`pipeline.csv` é a fonte curada e editável (versionada). O rascunho bruto (data/raw/pipeline/pipeline_rascunho.csv, 63
linhas) foi convertido uma vez para o contrato por `converter_rascunho()` (comando `seed`), com as revisões abaixo;
depois disso edita-se o CSV à mão a cada versão da carteira do MT e o JSON é regenerado por `build()`.

Convenções do CSV (colunas do contrato + `estudo`):
- `uf` e `rodovias`: listas separadas por `;`.
- `status`: chave do contrato (STATUS). `verificado`: `true` quando a fonte citada é página/documento oficial.
- `ent`: id de entidade de data/base/conc.json (ou vazio). `estudo`: índice (base 0) em conc.json `estudos` para os
  estudos pós-2027, que não têm entidade (então `ent` fica vazio).
- `data_prevista`: AAAA-MM-DD ou AAAA-MM; vazio quando a fonte não dá data.

Uso: python scripts/intel/pipeline.py [fetch|build|seed|all]
"""
import csv
import io
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from intel.fontes import RAW, ROOT, Manifest, fetch as baixar  # noqa: E402

DOMINIO = "pipeline"
RAW_DIR = RAW / DOMINIO
CSV = ROOT / "data" / "intel" / "pipeline.csv"
OUT = ROOT / "data" / "intel" / "pipeline.json"
CONC = ROOT / "data" / "base" / "conc.json"
RASCUNHO = RAW_DIR / "pipeline_rascunho.csv"
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
COLUNAS = ["id", "nome", "esfera", "uf", "rodovias", "km", "status", "data_prevista", "ent", "estudo", "verificado",
           "fonte_url", "fonte_data", "obs"]

FONTE = [
    {"nome": "Carteira de Concessões Rodoviárias 2023-2027 (Ministério dos Transportes, v40)",
     "url": "https://www.gov.br/transportes/pt-br/assuntos/concessoes/concessoes-rodoviarias-2027",
     "periodo": "carteira de 14/10/2026", "acesso": ACESSO, "licenca": "Informação pública (LAI, Lei 12.527/2011)",
     "nota": "PDF só imagem, transcrito à mão (slide 12 otimizações, slide 24 cronograma 2027, slide 26 estudos)."},
    {"nome": "ANTT: Novos projetos em rodovias e Reestruturação de contratos de concessão",
     "url": "https://www.gov.br/antt/pt-br/assuntos/rodovias/novos-projetos-em-rodovias",
     "periodo": "páginas acessadas em 20/10/2026", "acesso": ACESSO,
     "licenca": "Informação pública (LAI, Lei 12.527/2011)",
     "nota": "Algumas páginas estão desatualizadas em relação à carteira do MT (Régis, Integração do Sul)."},
    {"nome": "BNDES Hub de Projetos (API aberta /cms/projetos)",
     "url": "https://hubdeprojetos.bndes.gov.br/cms/projetos?__locale=pt",
     "periodo": "marcos até 26/06/2026 (federais) e out/2026 (RS)", "acesso": ACESSO,
     "licenca": "Dados públicos do BNDES",
     "nota": "Marcos às vezes sem atualização (Bloco 2 do RS ainda mostra leilão em andamento após leilão deserto)."},
    {"nome": "Parcerias RS e Goiás Parcerias (páginas oficiais estaduais)",
     "url": "https://parcerias.rs.gov.br/rodovias", "periodo": "jan/2026 a out/2026", "acesso": ACESSO,
     "licenca": "Informação pública (LAI, Lei 12.527/2011)", "nota": "Portal SPI de SP aberto via WebFetch."},
    {"nome": "Imprensa especializada (Agência iNFRA, O Tempo, Itatiaia, Atlas Público)",
     "url": "https://agenciainfra.com/", "periodo": "out/2025 a jul/2026", "acesso": ACESSO,
     "licenca": "Fatos noticiados, citados com link; sem reprodução de texto",
     "nota": "Itens só com fonte de imprensa têm verificado=false e podem estar desatualizados."},
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


# ---------- conversão do rascunho (feita uma vez; o CSV versionado passa a ser a fonte) ----------

URL_SPI = "https://www.parceriaseminvestimentos.sp.gov.br/"
URL_OTEMPO = ("https://www.otempo.com.br/politica/2026/1/26/plano-de-concessoes-rodoviarias-de-romeu-zema-fica-"
              "pelo-caminho")
NAO_VERIF_SP = ("NÃO VERIFICADO: citado só no catálogo/imprensa; o portal SPI lista apenas Rota Mogiana e Circuito das "
                "Águas no eixo Rodovias (20/10/2026). Não usar no mapa sem nova fonte.")

# Revisões sobre o rascunho (contra o memo recon/pipeline.md e conc.json). `obs` substitui; `obs_add` acrescenta
# (antes do texto original quando o status mudou, depois nos demais casos).
AJUSTES = {
    "fed-rota-dos-sertoes": {"obs_add": "Datas de assinatura divergem: Hub BNDES 04/09/2026, RoadShow 11/09/2026 (ambas "
                                    "previsões, não confirmadas)."},
    "fed-regis-bittencourt": {"data_prevista": "2026-12-21",
                              "obs_add": "Leilão 23/07/2026 (RoadShow); data_prevista é a assinatura do termo aditivo, "
                                     "prevista pelo RoadShow."},
    "fed-rotas-gerais": {"obs_add": "Assinatura segundo o RoadShow: 03/06/2026 (previsão); vale a data do Hub."},
    "fed-rota-portuaria-do-sul": {"obs_add": "Extensão: ANTT 459,63 km; conc.json (RoadShow) 456,2 km."},
    "fed-sc-lote1-vale-itajai": {"obs_add": "Extensão: ANTT/MT 516,6 km; conc.json (RoadShow) 515,16 km."},
    "rs-bloco-2": {"status": "cancelado", "data_prevista": "",
                   "obs_add": "Status mapeado de 'edital' para 'cancelado' (leilão deserto): o rascunho trazia edital "
                          "publicado, mas o leilão de 10/06/2026 não teve propostas e não há nova data."},
    "mg-lote8-vetor-norte": {"status": "suspenso", "fonte_url": URL_OTEMPO, "verificado": "false",
                             "obs_add": "Status mapeado de 'edital' para 'suspenso' (TCE-MG). Suspensão confirmada só "
                                    "pela imprensa; projeto no Hub BNDES: "
                                    "https://hubdeprojetos.bndes.gov.br/cms/projeto/Rodovias-MG-Vetor-Norte/"},
    "mt-fase2-demais": {"status": "suspenso",
                        "obs_add": "Status mapeado de 'consulta_publica' para 'suspenso': a audiência de 21/07/2026 foi "
                               "noticiada como suspensa (não confirmado em fonte oficial)."},
    "sp-rota-verde": {"fonte_url": URL_SPI, "fonte_data": "2026-10-20 (acesso; não listado no portal SPI)",
                      "verificado": "false", "obs": NAO_VERIF_SP},
    "sp-centro-oeste": {"fonte_url": URL_SPI, "fonte_data": "2026-10-20 (acesso; não listado no portal SPI)",
                        "verificado": "false", "obs": NAO_VERIF_SP},
    "sp-litoral-norte": {"fonte_url": URL_SPI, "fonte_data": "2026-10-20 (acesso; não listado no portal SPI)",
                         "verificado": "false",
                         "obs": NAO_VERIF_SP + " 'Litoral Norte' pode ser confusão com o Novo Litoral (LT.32, já "
                                               "contratado)."},
}
# Estaduais com fonte oficial (página de governo, BNDES Hub, portal de parcerias); os demais são só imprensa.
ESTADUAL_OFICIAL = {"go-polo-goiania", "go-pacote-bndes", "rs-bloco-1", "rs-bloco-2", "rs-bloco-3",
                    "sp-circuito-das-aguas"}


def _data(v, obs):
    """Data do contrato (AAAA-MM-DD ou AAAA-MM); texto livre do rascunho vira nota em `obs`."""
    if not v or re.fullmatch(r"\d{4}-\d{2}(-\d{2})?", v):
        return v, obs
    nota = {"2027?": "",
            "pos-2027": "Sem data: estudo da carteira pós-2027.",
            "2026-S2": "Sem data: promessa de leilão no 2º semestre de 2026 (não confirmado)."}[v]
    return "", f"{obs} {nota}".strip()


def _estudo_idx(ja):
    return str(int(ja.split("#")[1]) - 1) if ja.startswith("estudo#") else ""


def converter_rascunho(path=RASCUNHO):
    """Rascunho (63 linhas) → texto do pipeline.csv no contrato."""
    saida = io.StringIO()
    w = csv.DictWriter(saida, COLUNAS, lineterminator="\n")
    w.writeheader()
    with open(path, encoding="utf-8", newline="") as f:
        for r in csv.DictReader(f):
            ja = r["ja_no_roadshow"]
            linha = {
                "id": r["id"], "nome": r["nome"], "esfera": r["esfera"], "uf": r["uf"],
                "rodovias": r["rodovias"], "km": r["km"], "status": r["status"], "data_prevista": r["data_prevista"],
                "ent": "" if ja.startswith("estudo#") else ja, "estudo": _estudo_idx(ja),
                "verificado": "true" if r["esfera"] == "federal" or r["id"] in ESTADUAL_OFICIAL else "false",
                "fonte_url": r["fonte_url"], "fonte_data": r["fonte_data"], "obs": r["observacao"],
            }
            aj = dict(AJUSTES.get(r["id"], {}))
            extra = aj.pop("obs_add", "")
            linha.update(aj)
            if extra:
                linha["obs"] = f"{extra} {linha['obs']}".strip() if "status" in aj else f"{linha['obs']} {extra}".strip()
            codigos = [x for x in _lista(linha["rodovias"]) if re.fullmatch(r"[A-Z]{2,3}-\d{3}", x)]
            if len(codigos) < len(_lista(linha["rodovias"])):  # texto livre ("não detalhadas") não é rodovia
                linha["obs"] = f"{linha['obs']} Rodovias na fonte: {linha['rodovias']}.".strip()
                linha["rodovias"] = ";".join(codigos)
            linha["data_prevista"], linha["obs"] = _data(linha["data_prevista"], linha["obs"])
            w.writerow(linha)
    return saida.getvalue()


def seed():
    CSV.parent.mkdir(parents=True, exist_ok=True)
    CSV.write_text(converter_rascunho(), encoding="utf-8")


# ---------- CSV → JSON ----------

def _lista(v):
    return [x.strip() for x in v.split(";") if x.strip()]


def item_de_linha(r, ents, n_estudos):
    """Linha do CSV → item do contrato; levanta ValueError em valor fora do contrato."""
    def erro(msg):
        raise ValueError(f"{r.get('id')}: {msg}")

    if r["status"] not in CHAVES:
        erro(f"status inválido {r['status']!r}")
    if r["esfera"] not in ("federal", "estadual"):
        erro(f"esfera inválida {r['esfera']!r}")
    if r["verificado"] not in ("true", "false"):
        erro(f"verificado deve ser true/false, veio {r['verificado']!r}")
    ent = r["ent"] or None
    if ent is not None and ent not in ents:
        erro(f"ent {ent!r} não existe em conc.json")
    estudo = None
    if r["estudo"] != "":
        if not r["estudo"].isdigit() or int(r["estudo"]) >= n_estudos:
            erro(f"estudo {r['estudo']!r} fora de conc.json estudos")
        estudo = int(r["estudo"])
        if ent is not None:
            erro("estudo pós-2027 não tem entidade (ent deve ficar vazio)")
    data = r["data_prevista"] or None
    if data is not None and not re.fullmatch(r"\d{4}-\d{2}(-\d{2})?", data):
        erro(f"data_prevista inválida {data!r}")
    return {
        "id": r["id"], "nome": r["nome"], "esfera": r["esfera"], "uf": _lista(r["uf"]),
        "rodovias": _lista(r["rodovias"]), "km": round(float(r["km"]), 2) if r["km"] else None,
        "status": r["status"], "data_prevista": data, "ent": ent, "estudo": estudo,
        "verificado": r["verificado"] == "true", "fonte_url": r["fonte_url"], "fonte_data": r["fonte_data"],
        "obs": r["obs"],
    }


def montar(csv_path=CSV, conc_path=CONC):
    conc = json.loads(Path(conc_path).read_text(encoding="utf-8"))
    ents = {e["id"] for e in conc["entidades"]}
    with open(csv_path, encoding="utf-8", newline="") as f:
        itens = [item_de_linha(r, ents, len(conc["estudos"])) for r in csv.DictReader(f)]
    return {"fonte": FONTE, "itens": itens, "status": [{"key": k, "label": v} for k, v in STATUS]}


def build():
    OUT.write_text(json.dumps(montar(), ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


if __name__ == "__main__":
    for passo in (sys.argv[1:] or ["all"]):
        if passo in ("fetch", "all"):
            fetch()
        if passo == "seed":
            seed()
        if passo in ("build", "all"):
            build()
