# Atualização dos dados — 17/11/2026

Gerado por `python scripts/atualizar.py` (--baixar). Diferenças em relação à versão de `data/intel/` no último commit do git.

## Precisa de você

- **Debêntures — telas e negócios das corretoras (XP e BTG)** — tela de 16/11/2026; negócios e intenções até 13/11/2026 (4 dias atrás). Exporte as telas de debêntures isentas da XP e da BTG (do dia) e os negócios (BTG) e intenções (XP) desde 13/11/2026 e mande na conversa ou salve na pasta Rodovias do Google Drive.
- **IDEX-Infra (IDEX Analytics)** — planilha de dados até 16/11/2026 (1 dia atrás); relatório mensal até 10/2026. Salve na pasta Rodovias do Google Drive a planilha de dados mais recente do IDEX-Infra Geral (datafile .xlsx) e o último relatório mensal em PDF.

## Não atualizou nesta rodada

Nada: todos os domínios pedidos rodaram.

## Novidades nas fontes (pedem ajuste no código)

Nenhuma.

## Passos

| Passo | Resultado | Detalhe |
|---|---|---|
| trafego | ok |  |
| antt | ok |  |
| carga | ok |  |
| agro | ok |  |
| multimodal | ok |  |
| pipeline | ok |  |
| debentures | ok |  |
| ida | ok |  |
| idex | ok |  |
| estaduais | ok |  |
| vmda2025 | ok |  |
| rotas | ok |  |
| fontes_bloco | ok |  |
| validação da verificação | ok |  |
| build.py (HTML) | ok |  |
| RoadShow (PDF) | pulado | data/raw/roadshow.pdf ausente: os testes que conferem o PDF ficam pulados; os dados do RoadShow vêm de data/roadshow/*.json e não mudam com este comando |

## O que mudou por bloco

Registros: itens das coleções principais de cada bloco (valores preenchidos); KB: JSON compacto, como entra no HTML.

| Bloco | Registros antes | Registros depois | KB antes | KB depois | Mudou |
|---|---:|---:|---:|---:|---|
| agro | 5.571 | 5.571 | 210,6 | 210,6 | não |
| antt | 1.938 | 2.084 | 399,2 | 423,1 | sim (+24,0 KB) |
| carga | 4.312 | 4.312 | 141,3 | 141,3 | não |
| debentures | 262 | 262 | 128,1 | 128,1 | não |
| estaduais | 16.238 | 16.238 | 2.949,8 | 2.949,8 | não |
| fontes | 57 | 57 | 31,2 | 31,3 | sim (+104 bytes) |
| ida | 103 | 103 | 15,2 | 15,2 | não |
| idex | 116 | 131 | 9,8 | 11,1 | sim (+1,3 KB) |
| multimodal | 3.188 | 3.168 | 413,9 | 412,8 | sim (−1,1 KB) |
| municipios | 5.571 | 5.571 | 1.687,6 | 1.687,6 | não |
| pipeline | 64 | 64 | 42,9 | 43,7 | sim (+807 bytes) |
| rotas | 232 | 232 | 157,8 | 157,8 | não |
| trafego | 11.963 | 11.963 | 132,4 | 132,4 | não |
| vmda2025 | 14.923 | 14.923 | 229,2 | 229,3 | sim (+108 bytes) |

## Curadoria manual

24 itens. Cada um diz o arquivo a editar; depois rode de novo o comando.

### Leilão realizado sem resultado na camada de verificação (1)

- **Rota Arco Norte (rota-arco-norte)** — leilão em 12/11/2026, a entrada em data/roadshow/verificacao.json tem só a data do edital: acrescente o resultado (data do leilão, vencedor, deságio, assinatura) com as fontes (receita em docs/HANDOFF.md §2)

### Concessão ainda como a leiloar, com leilão já passado (1)

- **Rota Arco Norte (rota-arco-norte)** — estado "Leilão agendado 2026", mas o leilão foi em 12/11/2026: atualize o `estado` (e `status_texto`) da concessão em data/roadshow/entidades.json e o status em data/intel/pipeline.csv, e rode `python scripts/atualizar.py`

### Itens do pipeline sem fonte oficial (9)

- **BA - PPP rodoviária estadual (~1.000 km, FDIRS/PPI; inclui piloto Oeste ~700 km) (ba-ppp-fdirs)** — fonte só de imprensa (verificado = false): procure página ou documento oficial e atualize fonte_url e verificado em data/intel/pipeline.csv
- **MG - Quadrilátero Ferrífero (mg-quadrilatero)** — fonte só de imprensa (verificado = false): procure página ou documento oficial e atualize fonte_url e verificado em data/intel/pipeline.csv
- **MG Lote 9 - Zona da Mata (mg-lote9-zona-da-mata)** — fonte só de imprensa (verificado = false): procure página ou documento oficial e atualize fonte_url e verificado em data/intel/pipeline.csv
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

### Debêntures sem série pública ou sem curva das NTN-B (indicador ou spread "—") (2)

- **Curva das NTN-B (taxa indicativa da ANBIMA)** — sem arquivo da ANBIMA em 15/10/2026, 30/10/2026, 03/11/2026, 04/11/2026, 05/11/2026, 06/11/2026 (feriado ou dia ainda não publicado): o spread dos negócios e intenções desses dias fica "—"; rode `python scripts/atualizar.py --baixar --dominios debentures` quando a ANBIMA publicar
- **Curva das NTN-B, dias anteriores ao primeiro arquivo (sem ação)** — sem arquivo da ANBIMA em 01/10/2026, 02/10/2026, 05/10/2026, 06/10/2026, 07/10/2026, 08/10/2026, 09/10/2026, 13/10/2026: são anteriores a 14/10/2026, o primeiro dia com curva, e o site da ANBIMA só guarda os arquivos recentes, então não voltam a ser publicados; o spread desses dias fica "—" de forma permanente e não há o que baixar

### Taxas de debêntures fora do intervalo plausível (fora das médias) (9)

- **COMT11 (negócios BTG)** — taxa de 60,00% (IPCA+) em 2 linha(s) da planilha, provável erro de digitação: ficou fora da taxa média e do spread, mas conta no volume e no número; confira com a corretora e, se for o caso, corrija a planilha em data/raw/debentures/ e rode de novo
- **ENTV12 (negócios BTG)** — taxa de 65,00% (IPCA+) em 3 linha(s) da planilha, provável erro de digitação: ficou fora da taxa média e do spread, mas conta no volume e no número; confira com a corretora e, se for o caso, corrija a planilha em data/raw/debentures/ e rode de novo
- **ENTV13 (negócios BTG)** — taxa de 125,00% (IPCA+) em 1 linha(s) da planilha, provável erro de digitação: ficou fora da taxa média e do spread, mas conta no volume e no número; confira com a corretora e, se for o caso, corrija a planilha em data/raw/debentures/ e rode de novo
- **ENTV13 (negócios BTG)** — taxa de 130,00% (IPCA+) em 1 linha(s) da planilha, provável erro de digitação: ficou fora da taxa média e do spread, mas conta no volume e no número; confira com a corretora e, se for o caso, corrija a planilha em data/raw/debentures/ e rode de novo
- **HARG11 (negócios BTG)** — taxa de 110,00% (IPCA+) em 2 linha(s) da planilha, provável erro de digitação: ficou fora da taxa média e do spread, mas conta no volume e no número; confira com a corretora e, se for o caso, corrija a planilha em data/raw/debentures/ e rode de novo
- **MGPRA0 (negócios BTG)** — taxa de 140,00% (IPCA+) em 1 linha(s) da planilha, provável erro de digitação: ficou fora da taxa média e do spread, mas conta no volume e no número; confira com a corretora e, se for o caso, corrija a planilha em data/raw/debentures/ e rode de novo
- **MGPRA0 (negócios BTG)** — taxa de 160,00% (IPCA+) em 2 linha(s) da planilha, provável erro de digitação: ficou fora da taxa média e do spread, mas conta no volume e no número; confira com a corretora e, se for o caso, corrija a planilha em data/raw/debentures/ e rode de novo
- **STBP35 (negócios BTG)** — taxa de 75,00% (IPCA+) em 1 linha(s) da planilha, provável erro de digitação: ficou fora da taxa média e do spread, mas conta no volume e no número; confira com a corretora e, se for o caso, corrija a planilha em data/raw/debentures/ e rode de novo
- **VBRR11 (intenções XP)** — taxa de 1.067,00% (IPCA+) em 1 linha(s) da planilha, provável erro de digitação: ficou fora da taxa média e do spread, mas conta no volume e no número; confira com a corretora e, se for o caso, corrija a planilha em data/raw/debentures/ e rode de novo
