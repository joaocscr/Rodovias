# Atualização dos dados — 22/10/2026

Gerado por `python scripts/atualizar.py` (sem --baixar). Diferenças em relação à versão de `data/intel/` no último commit do git.

## Passos

| Passo | Resultado | Detalhe |
|---|---|---|
| trafego | pulado | arquivo ausente: data/raw/trafego/infrasa/vmda2023_data.json (baixe com `--baixar`) |
| antt | ok |  |
| carga | pulado | arquivo ausente: data/raw/graos/multimodal/pnl2035_cenario_base.zip (baixe com `--baixar`) |
| agro | pulado | arquivo ausente: data/raw/graos/malha/ibge_municipios.json (baixe com `--baixar`) |
| multimodal | ok |  |
| pipeline | ok |  |
| estaduais | pulado | arquivo ausente: data/raw/estaduais/abcr/api_conc.json (baixe com `--baixar`) |
| vmda2025 | pulado | falta data/raw/trafego/vmda2025/vgeo_vmda2025.zip (shapefile do Google Drive do usuário; ver README, "Atualizar os dados"); vmda2025.json ficou como estava |
| rotas | pulado | arquivo ausente: data/raw/rotas/apresentacao_rotas_2026-07-01.pdf (baixe com `--baixar`) |
| fontes_bloco | ok |  |
| validação da verificação | ok |  |
| build.py (HTML) | ok |  |

## O que mudou por bloco

Registros: itens das coleções principais de cada bloco (valores preenchidos); KB: JSON compacto, como entra no HTML.

| Bloco | Registros antes | Registros depois | KB antes | KB depois | Mudou |
|---|---:|---:|---:|---:|---|
| agro | 5.571 | 5.571 | 210,5 | 210,5 | não |
| antt | 1.938 | 1.938 | 399,2 | 399,2 | não |
| carga | 4.312 | 4.312 | 141,3 | 141,3 | não |
| estaduais | 16.238 | 16.238 | 2.949,8 | 2.949,8 | não |
| fontes | 49 | 49 | 24,5 | 24,5 | sim (+20 bytes) |
| multimodal | 3.188 | 3.188 | 413,9 | 413,9 | não |
| municipios | 5.571 | 5.571 | 1.687,6 | 1.687,6 | não |
| pipeline | 64 | 64 | 42,9 | 42,9 | não |
| rotas | 232 | 232 | 157,8 | 157,8 | não |
| trafego | 11.963 | 11.963 | 132,4 | 132,4 | não |
| vmda2025 | 14.923 | 14.923 | 229,2 | 229,2 | não |

## Curadoria manual

14 itens. Cada um diz o arquivo a editar; depois rode de novo o comando.

### Pipeline com data passada ainda como previsto (1)

- **MG Lote 10 - Noroeste (mg-lote10-noroeste)** — a data prevista (20/03/2026) já passou e o status ainda é "Edital publicado": atualize status e data em data/intel/pipeline.csv

### Itens do pipeline sem fonte oficial (13)

- **BA - PPP rodoviária estadual (~1.000 km, FDIRS/PPI; inclui piloto Oeste ~700 km) (ba-ppp-fdirs)** — fonte só de imprensa (verificado = false): procure página ou documento oficial e atualize fonte_url e verificado em data/intel/pipeline.csv
- **MG - Quadrilátero Ferrífero (mg-quadrilatero)** — fonte só de imprensa (verificado = false): procure página ou documento oficial e atualize fonte_url e verificado em data/intel/pipeline.csv
- **MG Lote 10 - Noroeste (mg-lote10-noroeste)** — fonte só de imprensa (verificado = false): procure página ou documento oficial e atualize fonte_url e verificado em data/intel/pipeline.csv
- **MG Lote 8 - Vetor Norte (PPP) (mg-lote8-vetor-norte)** — fonte só de imprensa (verificado = false): procure página ou documento oficial e atualize fonte_url e verificado em data/intel/pipeline.csv
- **MG Lote 9 - Zona da Mata (mg-lote9-zona-da-mata)** — fonte só de imprensa (verificado = false): procure página ou documento oficial e atualize fonte_url e verificado em data/intel/pipeline.csv
- **MT Fase 2 - Lote C (MT-100) (mt-fase2-lote-c)** — fonte só de imprensa (verificado = false): procure página ou documento oficial e atualize fonte_url e verificado em data/intel/pipeline.csv
- **MT Fase 2 - Lote D (MT-110/270) (mt-fase2-lote-d)** — fonte só de imprensa (verificado = false): procure página ou documento oficial e atualize fonte_url e verificado em data/intel/pipeline.csv
- **MT Fase 2 - demais lotes (A, B, F, G, H, I, J, K) (mt-fase2-demais)** — fonte só de imprensa (verificado = false): procure página ou documento oficial e atualize fonte_url e verificado em data/intel/pipeline.csv
- **RS Bloco 2 (PPP, free flow, Vale do Taquari e Norte) (rs-bloco-2)** — fonte só de imprensa (verificado = false): procure página ou documento oficial e atualize fonte_url e verificado em data/intel/pipeline.csv
- **SE - Piloto PPI de concessão simplificada (~300 km, PPP administrativa sem pedágio) (se-piloto-ppi)** — fonte só de imprensa (verificado = false): procure página ou documento oficial e atualize fonte_url e verificado em data/intel/pipeline.csv
- **SP - Lote Centro-Oeste Paulista (sp-centro-oeste)** — fonte só de imprensa (verificado = false): procure página ou documento oficial e atualize fonte_url e verificado em data/intel/pipeline.csv
- **SP - Lote Litoral Norte (sp-litoral-norte)** — fonte só de imprensa (verificado = false): procure página ou documento oficial e atualize fonte_url e verificado em data/intel/pipeline.csv
- **SP - Rota Verde (sp-rota-verde)** — fonte só de imprensa (verificado = false): procure página ou documento oficial e atualize fonte_url e verificado em data/intel/pipeline.csv
