# Rodovias do Brasil · Centro de Inteligência

Mapa interativo dos trechos do **SNV (Sistema Nacional de Viação, DNIT)**, versão 202607A, sobre o mapa das UFs do Brasil, com os dados de mercado do **RoadShow 2026-2027** do Ministério dos Transportes (v40, 14/10/2026) para estudar as concessões rodoviárias federais. Na v3, o mapa ganha camadas de tráfego, praças de pedágio, carga, agro, multimodal, rodovias estaduais e a carteira de projetos. Feito para análise interna, no design system Galapagos.

**Abrir:** dê duplo clique em [`mapa-rodovias.html`](mapa-rodovias.html). É um arquivo único (até 15 MB; hoje ~9,7 MB) que roda offline: dados, código, estilos e fontes estão embutidos.

## Abas

- **Mapa:** a malha federal. No modo **Concessões** (padrão), cada trecho tem o estado da concessão: leilão agendado 2026, projeto 2027, contrato do programa 2023–26, contrato vigente anterior, concessão no SNV fora do RoadShow, estudo pós-2027 ou sem concessão. Quando um trecho tem mais de um estado, a cor segue essa ordem de prioridade. No modo **Situação física**, valem as cores da v1. Há filtros por estado, projeto e ano, e a busca também encontra nomes de projeto. O cartão do trecho lista as concessões dele, com "Ver ficha".
- **Ficha do projeto:** todos os campos do RoadShow: capex e opex (nominal e VPL), WACC, tarifa, obras, praças, indicadores, garantias, CAPEX anual do ciclo de obras, cronograma e participantes. Um ícone de aviso marca as divergências entre páginas do PDF, mostrando os valores alternativos e as páginas.
- **Projetos:** comparador ordenável dos 39 contratos e dos 15 projetos futuros, com filtros, seleção de colunas da ficha e totais. Abaixo, os 27 estudos pós-2027.
- **Mercado:** leilões por ano, concorrentes × deságio, grupos econômicos, gestão direta × concedida, investimentos e participantes de cada leilão de 2007 a 2026.
- **Regulatório:** Portaria 995/2023, matriz de riscos, garantias, financiamento, otimizações contratuais (Portaria 848/2023), sustentabilidade e estruturadores.

### Regras dos dados do RoadShow

- Só as páginas em **português** (ímpares) do PDF. As páginas em inglês convertem para milhas e US$.
- **Data-base dos preços:** o comparador, os totais e o cartão usam capex e opex das tabelas em **dez/2024** (p. 3–5 e p. 97) sempre que existirem. Quem só tem ficha usa a data-base da ficha, mostrada na coluna "Data-base". A ficha mostra os próprios valores, com a data-base dela, e o valor em dez/2024 ao lado.
- **Divergências** entre páginas do PDF ficam registradas em `data/roadshow/entidades.json` (`divergencias`) e aparecem na ficha. Uma diferença de preço que só se deve à data-base vira nota (`notas_base`), não divergência.
- **Trechos:** cada contrato ou projeto é ligado aos trechos do SNV por intervalos de km curados à mão (`data/roadshow/trechos.json`). O build confere a soma dos km com a extensão declarada e grava [`data/roadshow/cobertura.md`](data/roadshow/cobertura.md). Lotes com rodovias estaduais (Paraná, Rota da Celulose, Via Liberdade) aparecem como "aproximado", porque só a parte federal está no SNV.

## Camadas de inteligência (v3)

Cada bloco fica em `data/intel/<bloco>.json` (versionado) e é embutido no HTML como `window.INTEL.<bloco>`. Todo bloco traz `fonte` (nome, URL, período, data de acesso, licença e nota) e o rótulo **modelado** (estimativa de modelo) ou **medido** (contagem ou registro observado). Os arrays por trecho físico têm 6.815 posições, na ordem de `data/base/snv.json`, e `null` onde não há dado.

| Bloco | Fonte | Período | Modelado × medido |
|---|---|---|---|
| `trafego` | Infra S.A./DNIT (VMDa), PRF (acidentes), ABCR (fluxo pedagiado) | VMDa 2023; PRF 2024–2025; ABCR 2016–2026 | VMDa modelado; PRF e ABCR medidos |
| `antt` | ANTT dados abertos (praças, SATs, receita, capas, investimentos) | 2024-01 a 2026-08; investimentos 2010–2025 | medido |
| `carga` | ONTL/Infra S.A., PNL 2035 (cenário-base) | ano-base 2017 | modelado |
| `agro` e `municipios` | IBGE (PAM, estoques, malha municipal) | 2025 | medido |
| `multimodal` | BaseFerro, ANTAQ, ANTT SIADE, IBGE Logística, Comex Stat, CONAB | 2024 a set/2026 | medido |
| `estaduais` | Infra S.A. (malha estadual), ARTESP, AGERGS, Ager-MT, ABCR | CIDE 2021 e fichas de 2024–2026 | medido |
| `pipeline` | MT (carteira v40), ANTT, BNDES Hub, portais estaduais, imprensa | 14/10/2026 a out/2026 | sem rótulo (carteira curada) |
| `fontes` | lista de todas as fontes, as da base e as indisponíveis | gerado a partir dos blocos | não se aplica |

O bloco `fontes` relaciona também o que **não** foi possível obter, com o motivo (por exemplo, o portal PNCT do DNIT, o painel de cargas da ANTT, que só existe em Power BI, e o PNL 2050 por link de rodovia).

## O que dá para fazer

- **Buscar** uma BR (`116`, `BR-116`), um código de trecho (`040BMG`) ou uma localidade (`sobradinho`, sem precisar de acento). O resultado é realçado e o mapa dá zoom nele.
- **Filtrar** por situação, administração (incluindo concessões), UF, BR, superfície, jurisdição e tipo de trecho. Os filtros se combinam.
- **Ver os números** da seleção: km totais, km por situação, por administração e por UF. Clicar numa barra aplica o filtro.
- **Clicar num trecho** para ver BR, UF, km inicial e final, extensão, localidades, situação, superfície, jurisdição, administração e coincidências.

### Como os km são somados

O SNV repete o mesmo trecho físico uma vez para cada BR que passa por ele: por exemplo, a BR-010, a BR-020 e a BR-030 na saída de Brasília. O mapa desenha e soma cada trecho físico **uma vez**, mesmo com várias BRs selecionadas:

| | |
|---|---|
| Registros no SNV 202607A | 7.673 |
| Trechos físicos | 6.815 |
| Soma bruta de `vl_extensa` | 131.690,7 km |
| Extensão sem dupla contagem (total exibido) | 122.394,9 km |

Registros do mesmo trecho físico são agrupados por dois critérios: os códigos citados em `ds_coinc` e a geometria idêntica.

## Atualizar o RoadShow

O PDF fica em `data/raw/roadshow.pdf` (fora do git). Os dados estão em `data/roadshow/*.json`, com a página de origem de cada número. O roteiro de reextração está em [`scripts/extract/README.md`](scripts/extract/README.md). Depois de editar os JSON, rode `python -m pytest tests/test_roadshow.py` e `python scripts/build.py`. Para consultar os trechos de uma BR ao curar o recorte, use `python scripts/snv_lookup.py 116 MG --adm`.

## Atualizar os dados

Cada script de `scripts/intel/` baixa o que falta em `data/raw/<domínio>/` (`fetch`), registra a origem em `data/manifest/<domínio>.json` e gera o bloco (`build`). Sem argumento ou com `all`, faz os dois. Rode nesta ordem:

```bash
for d in trafego antt carga agro multimodal pipeline estaduais; do python scripts/intel/$d.py all; done
python scripts/intel/fontes_bloco.py   # data/intel/fontes.json e data/intel/manifest.json
python scripts/build.py                # HTML único; imprime o tamanho de cada bloco em KB
```

Os brutos ficam em `data/raw/` (fora do git, ~1 GB) e o build nunca os lê. O manifesto (`data/intel/manifest.json`, com URL, data de acesso, tamanho e SHA-256 de cada arquivo baixado) e os JSON processados estão também na pasta Rodovias do Google Drive, subpasta `v3-dados`. O manifesto não vai para o HTML; o bloco `fontes` vai. O pipeline de concessões vem de `data/intel/pipeline.csv`, editado à mão; `python scripts/intel/pipeline.py build` valida o CSV e regenera o JSON.

## Regenerar com um SNV novo

1. Baixe o shapefile do SNV (site do DNIT, *Atlas e Mapas / PNV e SNV*) e extraia os arquivos `.shp/.shx/.dbf/.prj/.cpg` em `data/raw/`. A pasta `data/raw/` não vai para o git.
2. Instale as dependências (pandas, shapely, pyproj, numpy e leitores de Excel, além do pyshp): `pip install -r requirements.txt`.
3. Gere o HTML:
   ```bash
   python scripts/build.py --shp data/raw/SNV_AAAAMMX.shp --out mapa-rodovias.html
   ```
   O build mostra o número de registros, de trechos físicos, os totais em km e o tamanho do arquivo. Ele falha se os registros de um mesmo trecho coincidente tiverem atributos diferentes, ou se o arquivo passar de 15 MB.

Para atualizar os contornos das UFs (IBGE), o Leaflet ou as fontes, rode `python scripts/fetch_assets.py`. Esse passo precisa de internet; o resultado fica em `data/ufs.geojson` e `vendor/`.

## Testes

```bash
python -m pytest                     # pipeline SNV, RoadShow e blocos de data/intel/ (os testes com bruto exigem data/raw/)
npm test                             # filtro, soma, busca, concessões e gráficos (JS)
npm run test:e2e                     # navegador: offline, interações, desempenho (requer Playwright)
```

## Estrutura

| Caminho | Conteúdo |
|---|---|
| `scripts/snv.py` | leitura do shapefile, agrupamento dos coincidentes, simplificação e codificação |
| `scripts/build.py` | monta o HTML único |
| `scripts/fetch_assets.py` | baixa as UFs do IBGE, o Leaflet e as fontes |
| `scripts/roadshow.py` | recorte curado (km → trechos), validação e payload das concessões |
| `scripts/intel/` | um script por domínio (`trafego`, `antt`, `carga`, `agro`, `multimodal`, `pipeline`, `estaduais`), a junção com o SNV (`snvbase.py`), o download com manifesto (`fontes.py`) e o bloco de fontes (`fontes_bloco.py`) |
| `data/base/` | SNV e concessões congelados (`snv.json`, `conc.json`), lidos pelo build |
| `data/roadshow/` | dados curados do RoadShow e relatório de cobertura |
| `data/intel/` | blocos da v3 (`<bloco>.json`), `pipeline.csv`, `fontes.json` e `manifest.json` |
| `data/manifest/` | manifesto de download por domínio |
| `tests/` | testes Python (`test_*.py`) e JS (`*.test.mjs`) |
| `src/` | template, CSS (tokens Galapagos) e JS (`model`, `map`, `ui`) |
| `docs/superpowers/` | design e plano de implementação |
