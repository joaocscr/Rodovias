"""Pipeline de concessões rodoviárias (federal e estadual): data/intel/pipeline.csv → data/intel/pipeline.json.

`pipeline.csv` é a fonte curada e editável (versionada). O rascunho bruto (data/raw/pipeline/pipeline_rascunho.csv, 63
linhas) foi convertido uma vez para o contrato por `converter_rascunho()` (comando `seed`); depois disso edita-se o CSV
à mão a cada versão da carteira do MT e o JSON é regenerado por `build()`, que valida cada linha.

Colunas do CSV (as do contrato mais `estudo`):
- `uf` e `rodovias`: listas separadas por `;`. `uf` com siglas das 27 UFs; `rodovias` só com códigos (ex.: BR-163,
  ERS-010); vazio quando a fonte não detalha as rodovias.
- `status`: chave do contrato (STATUS). `verificado`: `true` quando a fonte citada em `fonte_url` é página ou
  documento oficial (gov.br, ANTT, BNDES Hub, agência estadual, B3, TCU); `false` quando é só imprensa.
- `ent`: id de entidade de data/base/conc.json, ou vazio.
- `estudo` (campo extra do contrato): índice base 0 em conc.json `estudos`, só para os 27 estudos pós-2027, que não têm
  entidade (então `ent` fica vazio); null nos demais itens.
- `km`: número > 0, ou vazio quando a fonte não informa.
- `data_prevista` (AAAA-MM-DD ou AAAA-MM; vazio quando a fonte não dá data), conforme o status:
  - edital, leilao_agendado, tcu, consulta_publica, estudo (e suspenso/cancelado, quando houver): data do leilão;
  - leiloado: data da assinatura do contrato (prevista);
  - contrato: data da assinatura do contrato (efetiva).
  Quando o item tem `ent`, a data segue data/base/conc.json (`leilao`, `assinatura`, `assinatura_aditivo`) para
  coincidir com as demais abas; divergências de outras fontes (ex.: BNDES Hub) ficam em `obs`.
- `obs`: texto exibido ao usuário; fatos em linguagem direta.

Uso: python scripts/intel/pipeline.py [fetch|build|seed|all]
"""
import csv
import datetime as dt
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
UFS = frozenset("AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split())
RE_RODOVIA = re.compile(r"[A-Z]{2,3}-\d{3}")
RE_DATA = re.compile(r"\d{4}-\d{2}(-\d{2})?")
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
URL_PORTALTELA = "https://www.portaltela.com/noticias/economia/2026/06/03/leilao-de-rodovias-do-rs-e-cancelado-por-" \
                 "falta-de-propostas/"
SP_NAO_LISTADO = ("Projeto citado apenas em catálogo e imprensa; o portal oficial de parcerias de SP lista só Rota "
                  "Mogiana e Circuito das Águas no eixo Rodovias (consulta de 20/10/2026). Sem extensão nem rodovias "
                  "na fonte.")
IMPRENSA = "Fonte apenas de imprensa. "

# Revisões sobre o rascunho: campos que substituem os do rascunho (inclui `obs`, sempre em texto para o usuário).
AJUSTES = {
    "fed-rota-dos-sertoes": {
        "data_prevista": "2026-09-11",
        "obs": "Leilão em 28/05/2026 (Edital 1/2026). Assinatura prevista para 11/09/2026 (RoadShow); o Hub BNDES "
               "indica 04/09/2026 e marca o contrato como em andamento. Nenhuma das datas foi confirmada. A página "
               "da ANTT ainda lista o projeto em \"Editais\"."},
    "fed-regis-bittencourt": {
        "data_prevista": "2026-12-21",
        "obs": "Leilão realizado em 23/07/2026 (carteira MT p.11 e RoadShow). A data é a assinatura do termo aditivo, "
               "prevista para 21/12/2026 (RoadShow). A página da ANTT de reestruturação está desatualizada (diz data "
               "\"a ser definido\", CP 2/2025, TCU Acórdão 2206/2025)."},
    "fed-rotas-gerais": {
        "data_prevista": "2026-06-03",
        "obs": "Leilão em 31/03/2026. Contrato assinado em 03/06/2026 (RoadShow); o Hub BNDES marca o contrato como "
               "concluído com data 17/07/2026."},
    "fed-rota-portuaria-do-sul": {
        "obs": "Infra S.A. AP 4/2026 (06/03-22/04/2026, encerrada). Cronograma MT: AP e TCU até 2026, edital "
               "mar/2027, leilão jun/2027. Extensão: 459,63 km na ANTT; 456,2 km no RoadShow."},
    "fed-sc-lote1-vale-itajai": {
        "obs": "Infra S.A. e BID. AP 6/2026 (15/05-29/06/2026, encerrada). Cronograma MT: TCU até 2026, edital "
               "abr/2027, leilão jul/2027. BR-282 km 325-436,4. Extensão: 516,6 km na ANTT e no MT; 515,16 km no "
               "RoadShow."},
    "fed-rota-vale-do-cafe": {
        "obs": "Cronograma MT: AP até dez/2026, TCU jan/2027, edital jun/2027, leilão set/2027. Abertura da AP não "
               "confirmada no ParticipANTT."},
    "fed-pos2027-03": {
        "obs": "Possível inclusão na carteira 2027 (asterisco na carteira MT). Estudo contratado (Infra S.A., BNDES e "
               "BID), sem extensão nem estruturador por projeto na fonte. EVTEA da BR-020/BA/GO (523 km) e da "
               "BR-242/BA/TO (870 km) iniciado em out/2025, segundo notícia do Conexão TO."},
    "go-polo-goiania": {
        "obs": "Rodovias estaduais geridas pela ANTT via Convênio de Delegação 08/2023; AP ANTT 01/2024 (abr/2024); "
               "35 anos; capex R$ 5,2 bi. Fora do RoadShow e da carteira MT. É parte do pacote BNDES de Goiás "
               "(1.152 km). Leilão sem data. Fonte complementar: https://goias.gov.br/goiasparcerias/"
               "rodovias-estaduais/"},
    "go-pacote-bndes": {
        "obs": "Sobreposição: cerca de 572 km (GO-020, GO-060, GO-070 e GO-080) seguiram como Polo Goiânia "
               "(go-polo-goiania); não somar as extensões. O restante (GO-010 85 km, GO-139 147 km, GO-330 185 km e "
               "trechos não incluídos) não tem status próprio."},
    "rs-bloco-2": {
        "status": "cancelado", "verificado": "false", "fonte_url": URL_PORTALTELA, "fonte_data": "2026-06-03 (Portal Tela)",
        "obs": "Edital 0097/2025 publicado. O leilão de 10/06/2026 foi cancelado por falta de propostas (envelopes "
               "recebidos em 03/06/2026, segundo o Portal Tela e o Sul21); o governo reavalia a modelagem, sem nova "
               "data. Página oficial (https://parcerias.rs.gov.br/rodovias-649f2b1de5fe5) informa a data de "
               "10/06/2026 e dos envelopes, sem registrar o resultado. O Hub BNDES ainda mostra o leilão em "
               "andamento, previsto para 16/11/2026 (não confirmado). Aporte FUNRIGS R$ 1,5 bi; capex de R$ 5,9 a "
               "6,0 bi."},
    "rs-bloco-3": {
        "data_prevista": "2022-12-22",
        "obs": "Concessão vigente: leilão em 13/04/2022 e contrato assinado em 22/12/2022 (Integrasul). Consta também "
               "na camada de concessões estaduais vigentes. Trechos com km na página oficial (ERS-122 km 0-168 "
               "etc.)."},
    "mg-lote8-vetor-norte": {
        "status": "suspenso", "fonte_url": URL_OTEMPO, "verificado": "false",
        "obs": IMPRENSA + "Edital de fev/2025 suspenso pelo TCE-MG desde abr/2025 (tarifa e consulta a municípios); a "
                          "Justiça negou a retomada (O Tempo, 26/01/2026). O projeto consta no Hub BNDES, sem "
                          "marcos: https://hubdeprojetos.bndes.gov.br/cms/projeto/Rodovias-MG-Vetor-Norte/ "
                          "Extensão: 153,71 km no Hub; 123,4 km na imprensa."},
    "mg-lote9-zona-da-mata": {
        "obs": IMPRENSA + "Em estruturação; o secretário fala em leilão no 2º semestre de 2026 (não confirmado). "
                          "Capex R$ 5,4 bi, opex R$ 3,2 bi. BR-354 e BR-267 em MG têm trechos estaduais ou "
                          "delegados."},
    "mg-lote10-noroeste": {
        "obs": IMPRENSA + "Edital publicado em 21/01/2026; leilão marcado para 20/03/2026 na B3, com resultado não "
                          "localizado. Concessão pura; R$ 7,5 bi em 30 anos. Falta a transferência do trecho da "
                          "BR-365 Patrocínio-Montes Claros pela União."},
    "mg-quadrilatero": {
        "obs": IMPRENSA + "Em reavaliação; o governo não descarta investimento público em vez de concessão. São 15 "
                          "rodovias, não listadas."},
    "mt-fase2-lote-c": {
        "obs": IMPRENSA + "Consulta de 16/03 a 16/04/2026 e audiência em 27/03/2026. Barra do Garças-Alto "
                          "Araguaia."},
    "mt-fase2-lote-d": {
        "obs": IMPRENSA + "Mesma consulta do Lote C. Região de Rondonópolis e Tesouro."},
    "mt-fase2-demais": {
        "obs": IMPRENSA + "Audiência pública de 21/07/2026 noticiada como suspensa (imprensa), sem nova data. Fase 2 "
                          "com 10 lotes (cerca de 2.200 km incluindo C e D, logo cerca de 1.670 km nos demais); a "
                          "composição por lote não consta nas fontes consultadas. Rodovias não detalhadas."},
    "sp-circuito-das-aguas": {
        "obs": "Minuta de edital em 20/02/2025, consulta pública 03/2025 e audiências de 10 a 14/03/2025; não "
               "leiloado. Investimento de R$ 10 bi; free flow; cerca de 37 pórticos previstos geraram reação; o "
               "MPSP (ago/2026) cita possível desistência de novos pedágios. Rodovias não listadas na fonte (33 "
               "municípios, região de Campinas)."},
    "sp-rota-verde": {"fonte_url": URL_SPI, "fonte_data": "2026-10-20 (consulta ao portal)", "obs": SP_NAO_LISTADO},
    "sp-centro-oeste": {"fonte_url": URL_SPI, "fonte_data": "2026-10-20 (consulta ao portal)",
                        "obs": SP_NAO_LISTADO},
    "sp-litoral-norte": {"fonte_url": URL_SPI, "fonte_data": "2026-10-20 (consulta ao portal)",
                         "obs": SP_NAO_LISTADO + " Pode se tratar do Novo Litoral (LT.32), já contratado."},
    "ba-ppp-fdirs": {
        "obs": IMPRENSA + "\"Bahia fecha com FDIRS estruturação de PPP para mil km de rodovias\" (Agência iNFRA); "
                          "piloto PPI de cerca de 700 km no Oeste (out/2025), possivelmente com tarifa só para "
                          "caminhões. Os 1.024 km vêm de catálogo (BRL Trust) e não foram confirmados em fonte "
                          "oficial. Rodovias não detalhadas (Oeste, entorno do Anel da Soja)."},
    "se-piloto-ppi": {
        "obs": IMPRENSA + "Decreto 12.626/2025 qualifica no PPI a política de parcerias em rodovias estaduais; TO, SC "
                          "e GO em conversa. Sem pedágio (contraprestação). Rodovias não detalhadas."},
}
# Estaduais com fonte oficial (página de governo, BNDES Hub, portal de parcerias); os demais são só imprensa.
ESTADUAL_OFICIAL = {"go-polo-goiania", "go-pacote-bndes", "rs-bloco-1", "rs-bloco-2", "rs-bloco-3",
                    "sp-circuito-das-aguas"}


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
            linha.update(AJUSTES.get(r["id"], {}))
            codigos = [x for x in _lista(linha["rodovias"]) if RE_RODOVIA.fullmatch(x)]
            linha["rodovias"] = ";".join(codigos)  # texto livre ("não detalhadas") não é rodovia
            if not RE_DATA.fullmatch(linha["data_prevista"]):  # "2027?", "pos-2027", "2026-S2": sem data
                linha["data_prevista"] = ""
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
        if not km > 0:
            erro(f"km deve ser > 0, veio {r['km']!r}")
    return {
        "id": r["id"], "nome": r["nome"], "esfera": r["esfera"], "uf": ufs,
        "rodovias": rodovias, "km": round(km, 2) if km is not None else None,
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
