"""Bloco de fontes e manifesto consolidado: data/intel/fontes.json e data/intel/manifest.json.

- `fontes.json` (embutido no HTML, aba de fontes): uma linha por item `fonte` de cada data/intel/<bloco>.json
  (`bloco` = nome do arquivo; `tipo` = `tipo` do item, senão o do bloco, senão o dos sub-blocos quando todos
  concordam, senão "—"); `base` (SNV e RoadShow, que não passam por data/intel/); `indisponiveis` (fontes tentadas
  que não deram dado, com o motivo, curadas dos memos de reconhecimento).
- `manifest.json` (fora do HTML; copiado para o Drive): união de data/manifest/*.json ordenada por domínio e arquivo,
  com o resumo `arquivos` e `bytes`. Formato: {"arquivos": n, "bytes": total, "itens": [...]}.

Uso: python scripts/intel/fontes_bloco.py [build]
"""
import copy
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from intel.fontes import MANIFEST_DIR, ROOT  # noqa: E402

INTEL = ROOT / "data" / "intel"
OUT_FONTES = INTEL / "fontes.json"
OUT_MANIFEST = INTEL / "manifest.json"
GERADOS = {"fontes", "manifest"}
SEM_TIPO = "—"
ACESSO = "2026-10-20"

BASE = [
    {"nome": "SNV 202607A, Sistema Nacional de Viação (DNIT)",
     "url": "https://www.gov.br/dnit/pt-br/assuntos/atlas-e-mapas/pnv-e-snv", "periodo": "versão 202607A (jul/2026)",
     "acesso": ACESSO, "licenca": "não declarada na fonte",
     "nota": "arquivo 202607A.zip obtido do Google Drive do usuário; o rodapé do site do DNIT declara CC BY-ND 3.0, mas a página não cita a versão 202607A; congelado em data/base/snv.json."},
    {"nome": "RoadShow 2026-2027 v40 (Ministério dos Transportes)",
     "url": "https://www.gov.br/transportes/pt-br/assuntos/concessoes/concessoes-rodoviarias-2027",
     "periodo": "14/10/2026", "acesso": ACESSO, "licenca": "Informação pública (LAI, Lei 12.527/2011)",
     "nota": "PDF extraído e curado à mão em data/roadshow/; congelado em data/base/conc.json."},
]

INDISPONIVEIS = [
    {"nome": "DNIT, portal PNCT (contagem contínua e VMDa nacional)", "url": "https://servicos.dnit.gov.br/dadospnct",
     "motivo": "Inacessível em todas as tentativas (conexão resetada ou 503); sem contagem por posto, o VMDa vem do modelo da Infra S.A."},
    {"nome": "Infra S.A., SNV_VMDA_2021",
     "url": "https://geo.infrasa.gov.br/server/rest/services/Hosted/SNV_VMDA_2021/FeatureServer",
     "motivo": "Timeout sistemático; dispensável, porque o VMDa 2023 é mais recente."},
    {"nome": "Infra S.A., Rodovias_Estaduais ano-base 2024",
     "url": "https://geo.infrasa.gov.br/server/rest/services/Rodovias_Estaduais/FeatureServer/0",
     "motivo": "Nenhuma consulta respondeu; foi usada a camada Hosted/Rodovias_Estaduais (CIDE 2021 e Base DNIT 2002)."},
    {"nome": "DNIT, Andamento de Obras", "url": "https://servicos.dnit.gov.br/",
     "motivo": "Conexão resetada em todas as tentativas; as obras vêm dos dados abertos da ANTT."},
    {"nome": "PPI, Programa de Parcerias de Investimentos", "url": "https://www.ppi.gov.br/",
     "motivo": "Resposta 503 ou vazia; a carteira PPI e os pilotos SE/BA ficaram só por notícia."},
    {"nome": "Sinfra-MT, concessões rodoviárias", "url": "https://www.sinfra.mt.gov.br/",
     "motivo": "Certificado expirado; composição dos lotes da Fase 2 e status posterior a jul/2026 desconhecidos."},
    {"nome": "ANTT, painel de movimentação de cargas", "url": "https://dados.antt.gov.br/",
     "motivo": "Só em Power BI, sem arquivo aberto; dados por LAI (cgdam@antt.gov.br), não solicitados."},
    {"nome": "Infra S.A., carregamento PNL 2050 por link", "url": "https://ontl.infrasa.gov.br/",
     "motivo": "Sem carregamento por link de rodovia; só por LAI (observatorio@infrasa.gov.br), não solicitado."},
    {"nome": "OpenStreetMap, Overpass API", "url": "https://overpass-api.de/api/interpreter",
     "motivo": "Connection reset e 504; PI-397/262 (Transcerrados) ficou fora da malha estadual."},
]


def _lista(fonte):
    return fonte if isinstance(fonte, list) else [fonte]


def _tipo_do_bloco(dados):
    """Tipo do bloco; sem ele, o dos sub-blocos quando todos concordam."""
    if dados.get("tipo"):
        return dados["tipo"]
    tipos = {v["tipo"] for v in dados.values() if isinstance(v, dict) and v.get("tipo")}
    return tipos.pop() if len(tipos) == 1 else SEM_TIPO


def fontes_dos_blocos(intel_dir=INTEL):
    linhas = []
    for p in sorted(Path(intel_dir).glob("*.json")):
        if p.stem in GERADOS:
            continue
        dados = json.loads(p.read_text(encoding="utf-8"))
        if not isinstance(dados, dict) or "fonte" not in dados:
            continue
        tipo_bloco = _tipo_do_bloco(dados)
        for f in _lista(dados["fonte"]):
            linhas.append({"bloco": p.stem, "nome": f["nome"], "url": f["url"], "periodo": f.get("periodo", ""),
                           "acesso": f["acesso"], "licenca": f["licenca"], "tipo": f.get("tipo") or tipo_bloco,
                           "nota": f.get("nota", "")})
    return linhas


def montar(intel_dir=INTEL):
    return {"fontes": fontes_dos_blocos(intel_dir), "indisponiveis": copy.deepcopy(INDISPONIVEIS), "base": copy.deepcopy(BASE)}


def montar_manifesto(manifest_dir=MANIFEST_DIR):
    itens = []
    for p in sorted(Path(manifest_dir).glob("*.json")):
        itens += json.loads(p.read_text(encoding="utf-8"))
    itens.sort(key=lambda i: (i["dominio"], i["arquivo"]))
    return {"arquivos": len(itens), "bytes": sum(i["bytes"] for i in itens), "itens": itens}


def build():
    fontes = montar()
    OUT_FONTES.write_text(json.dumps(fontes, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    manifesto = montar_manifesto()
    OUT_MANIFEST.write_text(json.dumps(manifesto, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"fontes: {len(fontes['fontes'])} em {len({f['bloco'] for f in fontes['fontes']})} blocos, "
          f"{len(fontes['indisponiveis'])} indisponíveis | manifesto: {manifesto['arquivos']} arquivos, "
          f"{manifesto['bytes'] / 1e6:.1f} MB")


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else "build"
    if cmd not in ("build", "all"):
        sys.exit("Uso: python scripts/intel/fontes_bloco.py [build]")
    build()


if __name__ == "__main__":
    main()
