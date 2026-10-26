# Atualização dos dados — 26/10/2026

Gerado por `python scripts/atualizar.py` (sem --baixar). Diferenças em relação à versão de `data/intel/` no último commit do git.

## Passos

| Passo | Resultado | Detalhe |
|---|---|---|
| trafego | ok |  |
| antt | ok |  |
| carga | ok |  |
| agro | pulado | arquivo ausente: data/raw/graos/malha/ibge_municipios.json (baixe com `--baixar`) |
| multimodal | ok |  |
| pipeline | ok |  |
| debentures | ok |  |
| ida | ok |  |
| idex | ok |  |
| estaduais | ok |  |
| vmda2025 | pulado | falta data/raw/trafego/vmda2025/vgeo_vmda2025.zip (shapefile do Google Drive do usuário; ver README, "Atualizar os dados"); vmda2025.json ficou como estava |
| rotas | ok |  |
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
| debentures | 236 | 236 | 96,6 | 96,7 | sim (+140 bytes) |
| estaduais | 16.238 | 16.238 | 2.949,8 | 2.949,8 | não |
| fontes | 57 | 57 | 30,9 | 31,1 | sim (+140 bytes) |
| ida | 99 | 99 | 11,5 | 11,5 | não |
| idex | 116 | 116 | 9,8 | 9,8 | não |
| multimodal | 3.188 | 3.188 | 413,9 | 413,9 | não |
| municipios | 5.571 | 5.571 | 1.687,6 | 1.687,6 | não |
| pipeline | 64 | 64 | 42,9 | 42,9 | não |
| rotas | 232 | 232 | 157,8 | 157,8 | não |
| trafego | 11.963 | 11.963 | 132,4 | 132,4 | não |
| vmda2025 | 14.923 | 14.923 | 229,2 | 229,2 | não |

## Curadoria manual

21 itens. Cada um diz o arquivo a editar; depois rode de novo o comando.

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

### Consórcios vencedores sem composição na base de consórcios (1)

- **Consórcio Acciona (Rodovia do Aço, 2007)** — vencedor sem composição localizada: pesquise os integrantes (ata do leilão, ato de homologação, concessionária) e preencha data/roadshow/consorcios.json

### Consórcios que a ata do leilão não lista (1)

- **Consórcio Via dos Sertões (BR-116/PR/SP - Otimização Régis Bittencourt, 2026)** — o nome está na lista de proponentes do leilão, mas a ata oficial não o traz (provável erro de entrada): confira a fonte e corrija o proponente em data/roadshow/mercado.json, ou tire a marca fora_da_ata de data/roadshow/consorcios.json

### Emissores de debêntures sem classificação (1)

- **APOLLO 17** — aparece em intenções XP, tela XP (1 papel) e ficou fora da página: classifique-o em data/debentures/emissores.json (subsetor e grupo, numa entrada nova ou como grafia em `nomes` de um emissor que já existe) ou, se não for de transporte, ponha o nome em `fora_do_universo`; depois rode `python scripts/atualizar.py --dominios debentures`

### Debêntures sem série pública ou sem curva das NTN-B (indicador ou spread "—") (1)

- **Curva das NTN-B (taxa indicativa da ANBIMA)** — sem arquivo da ANBIMA em 01/10/2026, 02/10/2026, 05/10/2026, 06/10/2026, 07/10/2026, 08/10/2026, 09/10/2026, 13/10/2026, 15/10/2026 (feriado, dia ainda não publicado ou mais antigo que os últimos dias úteis que o site da ANBIMA guarda): o spread dos negócios e intenções desses dias fica "—"; rode `python scripts/atualizar.py --baixar --dominios debentures` quando a ANBIMA publicar

### Taxas de debêntures fora do intervalo plausível (fora das médias) (2)

- **COMT11 (negócios BTG)** — taxa de 60,00% (IPCA+) em 2 linha(s) da planilha, provável erro de digitação: ficou fora da taxa média e do spread, mas conta no volume e no número; confira com a corretora e, se for o caso, corrija a planilha em data/raw/debentures/ e rode de novo
- **VBRR11 (intenções XP)** — taxa de 1.067,00% (IPCA+) em 1 linha(s) da planilha, provável erro de digitação: ficou fora da taxa média e do spread, mas conta no volume e no número; confira com a corretora e, se for o caso, corrija a planilha em data/raw/debentures/ e rode de novo

### Retornos mensais do IDEX-Infra que não fecham com o acumulado do ano impresso (1)

- **Idex-Infra Geral, 2026** — os retornos mensais de 2026 compõem 2,24%, mas o relatório (data/raw/idex/idex-infra-relatorio-mensal-2026-07.pdf) imprime 1,54% de acumulado no ano (tolerância de 0,05 ponto percentual): provável erro de digitação no relatório; confira com a IDEX Analytics. Os retornos mensais são usados como estão e o acumulado de 12 meses sai do produto deles
