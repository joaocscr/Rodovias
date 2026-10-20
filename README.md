# Rodovias do Brasil · Centro de Inteligência

Mapa interativo dos trechos do **SNV (Sistema Nacional de Viação, DNIT)**, versão 202607A, sobre o mapa das UFs do Brasil, com os dados de mercado do **RoadShow 2026-2027** do Ministério dos Transportes (v40, 14/10/2026) para estudar as concessões rodoviárias federais. Na v3, o painel ganha camadas e abas de tráfego, praças de pedágio, carga, agro, multimodal, rodovias estaduais e a carteira de projetos, cada uma com a fonte e o rótulo modelado × medido. A v3.1 acrescenta as Rotas de Integração Sul-Americana, uma paleta de cores de dados e o VMDa 2025 do DNIT nas rodovias federais e estaduais (veja [Novidades da v3.1](#novidades-da-v31)). Feito para análise interna, no design system Galapagos.

**Abrir:** dê duplo clique em [`mapa-rodovias.html`](mapa-rodovias.html). É um arquivo único (até 15 MB, hoje cerca de 10,3 MB) que roda offline: dados, código, estilos e fontes estão embutidos.

## Abas

- **Mapa:** a malha federal. No modo **Concessões** (padrão), cada trecho tem o estado da concessão: leilão agendado 2026, projeto 2027, contrato do programa 2023–26, contrato vigente anterior, concessão no SNV fora do RoadShow, estudo pós-2027 ou sem concessão. Quando um trecho tem mais de um estado, a cor segue essa ordem de prioridade. No modo **Situação física**, valem as cores da v1. Há também os modos de cor **Tráfego** (VMDa 2025 do DNIT, modelado), **Pesados** (VMDa 2023 da Infra S.A., modelado), **Carga agrícola** (PNL 2035, modelado) e **Acidentes** (PRF, medido). Há filtros por estado, projeto e ano, e a busca também encontra nomes de projeto. O cartão do trecho lista as concessões dele, com "Ver ficha". Camadas opcionais: rodovias estaduais (com as concessões estaduais), praças de pedágio, SATs, obras da ANTT, ferrovias em operação, portos e terminais, fluxos ferroviários de grãos, as Rotas de Integração Sul-Americana (com os países vizinhos) e, como fundo por município, a produção de soja, milho, cana, algodão, café e trigo e a capacidade de armazenagem.
- **Ficha do projeto:** todos os campos do RoadShow: capex e opex (nominal e VPL), WACC, tarifa, obras, praças, indicadores, garantias, CAPEX anual do ciclo de obras, cronograma e participantes. Um ícone de aviso marca as divergências entre páginas do PDF, mostrando os valores alternativos e as páginas. Na v3, a ficha federal acrescenta as obras acompanhadas pela ANTT, as séries realizadas e o pipeline; as concessões estaduais têm ficha própria.
- **Projetos:** comparador ordenável dos 39 contratos e dos 15 projetos futuros, com filtros (inclusive por esfera, federal ou estadual), seleção de colunas da ficha e totais; as concessões estaduais também entram no comparador. Abaixo, os 27 estudos pós-2027. A seção Pipeline lista os próximos leilões, consultas e estudos, federais e estaduais.
- **Tráfego:** praças de pedágio da ANTT (VMD de 2025, contagem medida), tráfego mensal, Índice ABCR de fluxo pedagiado, VMDa modelado e acidentes da PRF.
- **Cargas:** produção agrícola por UF e município, fluxos ferroviários de grãos (SIADE), exportação por unidade da Receita (Comex Stat), fretes rodoviários (CONAB) e os trechos com maior carga agrícola (PNL 2035).
- **Mercado:** leilões por ano, concorrentes × deságio, grupos econômicos, gestão direta × concedida, investimentos e participantes de cada leilão de 2007 a 2026.
- **Regulatório:** Portaria 995/2023, matriz de riscos, garantias, financiamento, otimizações contratuais (Portaria 848/2023), sustentabilidade e estruturadores.
- **Fontes:** todas as fontes da v3 (nome, período, data de acesso, licença, tipo e nota), as bases da v1/v2 e as fontes tentadas que não deram dado. Cada cartão das abas também traz a sua linha "Fonte:".

### Regras dos dados do RoadShow

- Só as páginas em **português** (ímpares) do PDF. As páginas em inglês convertem para milhas e US$.
- **Data-base dos preços:** o comparador, os totais e o cartão usam capex e opex das tabelas em **dez/2024** (p. 3–5 e p. 97) sempre que existirem. Quem só tem ficha usa a data-base da ficha, mostrada na coluna "Data-base". A ficha mostra os próprios valores, com a data-base dela, e o valor em dez/2024 ao lado.
- **Divergências** entre páginas do PDF ficam registradas em `data/roadshow/entidades.json` (`divergencias`) e aparecem na ficha. Uma diferença de preço que só se deve à data-base vira nota (`notas_base`), não divergência.
- **Trechos:** cada contrato ou projeto é ligado aos trechos do SNV por intervalos de km curados à mão (`data/roadshow/trechos.json`). O build confere a soma dos km com a extensão declarada e grava [`data/roadshow/cobertura.md`](data/roadshow/cobertura.md). Lotes com rodovias estaduais (Paraná, Rota da Celulose, Via Liberdade) aparecem como "aproximado", porque só a parte federal está no SNV.

## Camadas de inteligência (v3)

Cada bloco fica em `data/intel/<bloco>.json` (versionado) e é embutido no HTML como `window.INTEL.<bloco>`. Todo bloco traz `fonte` (nome, URL, período, data de acesso, licença e nota, escritas em português claro, sem nomes de campo) e o rótulo **modelado** (estimativa de modelo), **medido** (contagem ou registro observado) ou **cadastro** (registro de infraestrutura ou de contratos, como malhas, portos e fichas de concessões, sem número medido nem modelado). Os arrays por trecho físico têm 6.815 posições, na ordem de `data/base/snv.json`, e `null` onde não há dado.

| Bloco | Fonte | Período | Tipo |
|---|---|---|---|
| `trafego` | Infra S.A./DNIT (VMDa), PRF (acidentes), ABCR (fluxo pedagiado) | VMDa 2023; PRF 2024–2025; ABCR 2016–2026 | VMDa modelado; PRF e ABCR medidos |
| `vmda2025` (v3.1) | DNIT, VMDa – Modelagem 2025 (camada VGeo enviada pelo usuário) | 2025 | modelado |
| `antt` | ANTT dados abertos (praças, SATs, receita, capas, investimentos) | jan/2024 a ago/2026; investimentos 2010 a 2025 | medido; capas das concessões: cadastro |
| `carga` | ONTL/Infra S.A., PNL 2035 (cenário-base) | ano-base 2017 | modelado |
| `agro` e `municipios` | IBGE (PAM, estoques, malha municipal) | 2025 | PAM e estoques medidos; malha municipal: cadastro |
| `multimodal` | BaseFerro, ANTAQ, ANTT SIADE, IBGE Logística, Comex Stat, CONAB | 2024 a set/2026 | SIADE, Comex e CONAB medidos; BaseFerro, ANTAQ e estações IBGE: cadastro |
| `estaduais` | Infra S.A. (malha estadual), ARTESP, AGERGS, Ager-MT, ABCR | CIDE 2021 (malha); fichas 2024–2026; imprensa e releases 2019–2026 | cadastro |
| `pipeline` | Ministério dos Transportes (carteira v40), ANTT, BNDES Hub, portais estaduais, imprensa | out/2025 a out/2026 | sem rótulo (carteira curada) |
| `rotas` (v3.1) | MPO (apresentação de 01/07/2026, relatórios 2024 e 2025, imagens oficiais das rotas), Natural Earth (países) | 2024 a 2026 | cadastro (traçado esquemático) |
| `fontes` | lista de todas as fontes, as da base e as indisponíveis | gerado a partir dos blocos | não se aplica |

O bloco `fontes` relaciona também o que **não** foi possível obter, com o motivo (por exemplo, o portal PNCT do DNIT, o painel de cargas da ANTT, que só existe em Power BI, e o PNL 2050 por link de rodovia).

## Novidades da v3.1

Design em [`docs/superpowers/specs/2026-10-20-v3.1-rotas-paleta-vmda2025-design.md`](docs/superpowers/specs/2026-10-20-v3.1-rotas-paleta-vmda2025-design.md).

- **Rotas de Integração Sul-Americana** (camada "Rotas e países vizinhos" no painel Camadas). As 5 rotas do MPO: Ilha das Guianas, Amazônica, Quadrante Rondon, Bioceânica de Capricórnio e Bioceânica do Sul. Cada rota tem a sua cor e um rótulo direto "Rota N · Nome". A camada mostra também as hidrovias, a cabotagem, os trechos em pavimentação e em estudos, e o contorno dos países vizinhos. Ao ligar, o mapa enquadra a América do Sul e a malha federal fica esmaecida. Clicar numa rota (ou no rótulo, ou na legenda) abre o cartão com países, UFs, cidades e portos em ordem, rodovias, hidrovias, obras citadas pelo MPO e a fonte. O traçado é **esquemático**: o MPO não publica geodado das rotas. As linhas vêm do mapa vetorial da apresentação de 01/07/2026 (p. 7), georreferenciadas por 70 cidades (erro médio de cerca de 9 km), e o mapa e o cartão dizem isso.
- **Paleta de cores de dados.** A interface e a malha federal base continuam no Galapagos. As camadas temáticas, as rotas e os modos quantitativos usam uma paleta de dados validada para daltonismo e legibilidade, com cor fixa por entidade e sempre com legenda ou rótulo. Cada modo quantitativo tem um tom, do claro ao escuro: Tráfego azul, Pesados violeta, Carga agrícola laranja e Acidentes vermelho. Os tokens estão em `src/styles-map.js`. A documentação, com as saídas do validador, os pares de cores conferidos e os limites conhecidos, está em [`docs/paleta.md`](docs/paleta.md). O validador `scripts/validate_palette.js` roda no `npm test` (`tests/palette.test.mjs`).
- **VMDa 2025 (DNIT, modelado), federal e estadual.** O modo Tráfego e o veíc·km passam a usar o VMDa 2025: total e os dois sentidos do SNV por trecho físico. Pesados continua no VMDa 2023 da Infra S.A., porque o 2025 não separa leves e pesados. No cartão, os pesados de 2025 são uma estimativa (total 2025 × % de pesados de 2023), e o rótulo diz isso. Trechos que o modelo marca como não simuláveis (áreas urbanas) aparecem com "uso restrito". Com a camada de rodovias estaduais ligada no modo Tráfego, as estaduais são coloridas pelo VMDa 2025. Elas usam as mesmas classes e cores da malha federal, com traço mais fino; sem dado, ficam em cinza contínuo. A aba Tráfego mostra o veíc·km/dia da malha federal e o das rodovias estaduais, com a cobertura. Em todos os casos, VMDa 0 conta como sem dado.

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

Cada script de `scripts/intel/` baixa o que falta em `data/raw/<domínio>/` (`fetch`), registra a origem em `data/manifest/<domínio>.json` e gera o bloco (`build`). Sem argumento ou com `all`, faz os dois. Rode nesta ordem (o `vmda2025` depois do `estaduais`, porque lê a malha estadual):

```bash
for d in trafego antt carga agro multimodal pipeline estaduais; do python scripts/intel/$d.py all; done
python scripts/intel/vmda2025.py all   # VMDa 2025 (v3.1): registra o zip no manifesto e gera data/intel/vmda2025.json
python scripts/intel/rotas.py all      # Rotas de Integração (v3.1): baixa os PDFs e imagens do MPO e o Natural Earth; gera data/intel/rotas.json
python scripts/intel/fontes_bloco.py   # data/intel/fontes.json e data/intel/manifest.json
python scripts/build.py                # HTML único; imprime o tamanho de cada bloco em KB
```

- **`vmda2025.py`** não baixa nada. O shapefile "VMDa – Modelagem 2025" (camada VGeo do DNIT) veio do Google Drive do usuário ([link](https://drive.google.com/file/d/1gnXpMWMLs4uZ9mWZf2SxlNe6R8LcdFha/view)). Coloque o zip em `data/raw/trafego/vmda2025/vgeo_vmda2025.zip`; o `build` o extrai na mesma pasta na primeira vez. `registrar` grava o zip no manifesto e `build` gera o bloco; `all` faz os dois.
- **`rotas.py`** baixa a apresentação de 01/07/2026, os relatórios 2024 e 2025 e as imagens das 5 rotas do site do MPO, além dos países do Natural Earth. O `build` lê o mapa vetorial do PDF com o PyMuPDF (`pymupdf`, no `requirements.txt`). Os textos dos cartões (países, nós, rodovias, obras) estão transcritos no próprio script.

Os brutos ficam em `data/raw/` (fora do git, ~4,0 GB em disco; o manifesto lista 264 arquivos, ~1,3 GB baixados ou recebidos) e o build nunca os lê. O manifesto (`data/intel/manifest.json`, com URL, data de acesso, tamanho e SHA-256 de cada arquivo baixado) fica no repositório; na pasta Rodovias do Google Drive, subpasta `v3-dados`, estão uma versão em planilha dele (`manifesto-fontes-v3.csv`, sem os hashes), `fontes.json` e `pipeline.csv`. Essas cópias são as da v3; a v3.1 não as atualizou (o manifesto e o `fontes.json` do repositório já incluem `vmda2025` e `rotas`). Os demais JSON processados ficam só no repositório. O manifesto não vai para o HTML; o bloco `fontes` vai. O pipeline de concessões vem de `data/intel/pipeline.csv`, editado à mão; `python scripts/intel/pipeline.py build` valida o CSV e regenera o JSON.

## Regenerar com um SNV novo

1. Baixe o shapefile do SNV (site do DNIT, *Atlas e Mapas / PNV e SNV*) e extraia os arquivos `.shp/.shx/.dbf/.prj/.cpg` em `data/raw/`. A pasta `data/raw/` não vai para o git.
2. Instale as dependências (pandas, shapely, pyproj, numpy, leitores de Excel, pyshp e PyMuPDF): `pip install -r requirements.txt`.
3. Gere o HTML:
   ```bash
   python scripts/build.py --shp data/raw/SNV_AAAAMMX.shp --out mapa-rodovias.html
   ```
   O build mostra o número de registros, de trechos físicos, os totais em km e o tamanho do arquivo. Ele falha se os registros de um mesmo trecho coincidente tiverem atributos diferentes, ou se o arquivo passar de 15 MB.

Para atualizar os contornos das UFs (IBGE), o Leaflet ou as fontes, rode `python scripts/fetch_assets.py`. Esse passo precisa de internet; o resultado fica em `data/ufs.geojson` e `vendor/`.

## Testes

```bash
python -m pytest                     # pipeline SNV, RoadShow e blocos de data/intel/, incluindo a linguagem das notas de fonte (os testes com bruto exigem data/raw/ e são pulados sem ele)
npm test                             # filtro, soma, busca, concessões, gráficos e paleta de dados (JS)
npm run test:e2e                     # navegador: offline, interações, desempenho (requer Playwright)
```

## Estrutura

| Caminho | Conteúdo |
|---|---|
| `scripts/snv.py` | leitura do shapefile, agrupamento dos coincidentes, simplificação e codificação |
| `scripts/build.py` | monta o HTML único |
| `scripts/fetch_assets.py` | baixa as UFs do IBGE, o Leaflet e as fontes |
| `scripts/roadshow.py` | recorte curado (km → trechos), validação e payload das concessões |
| `scripts/intel/` | um script por domínio (`trafego`, `antt`, `carga`, `agro`, `multimodal`, `pipeline`, `estaduais` e, na v3.1, `vmda2025` e `rotas`), a junção com o SNV (`snvbase.py`), o download com manifesto (`fontes.py`) e o bloco de fontes (`fontes_bloco.py`) |
| `scripts/validate_palette.js` | validador de paleta do método dataviz (daltonismo, luminosidade, contraste), usado por `tests/palette.test.mjs` |
| `data/base/` | SNV e concessões congelados (`snv.json`, `conc.json`), lidos pelo build |
| `data/roadshow/` | dados curados do RoadShow e relatório de cobertura |
| `data/intel/` | blocos da v3 (`<bloco>.json`), `pipeline.csv`, `fontes.json` e `manifest.json` |
| `data/manifest/` | manifesto de download por domínio |
| `tests/` | testes Python (`test_*.py`) e JS (`*.test.mjs`) |
| `src/` | template, CSS (tokens Galapagos), tokens de cor de dados (`styles-map.js`) e JS (`model`, `map`, `layers`, `ui` e uma aba por arquivo) |
| `docs/paleta.md` | paleta de dados: tokens, atribuição por camada, rampas e saídas do validador |
| `docs/superpowers/` | design e plano de implementação |
