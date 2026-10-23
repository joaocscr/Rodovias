# v4 — Leilões verificados em fonte oficial, deságios 2007–2022, ranking de grupos e exportação CSV — Design

Data: 2026-10-21 · Base: v3.1 (`main` 4d88be8) · Escopo aprovado em chat ("Está bom assim, pode redigir o design"). Decisões do ranking e do vencedor inabilitado aprovadas em chat ("recomendações").

## 1. Intenção

Um colega montou um dashboard do RoadShow (`dashboard-concessoes-rodovias.html`, enviado pelo usuário em 21/10/2026) com pesquisa na web sobre os leilões. A comparação mostrou que vale aproveitar dele:

1. **Correções de dados** em leilões de 2023–2026 onde o RoadShow erra ou diverge de documentos oficiais.
2. **Deságio do vencedor e dados dos leilões de 2007–2022**, que hoje aparecem como "—" na tabela de participantes.
3. **Ranking de grupos econômicos** (vitórias, derrotas, taxa de êxito) de 2007 a 2026.
4. **Exportar CSV** nas tabelas.

O porquê, nas palavras do usuário: quando um deságio ou uma data sai do painel (material, conversa com cliente), ele precisa ver **o valor oficial, com a fonte pública que o respalda** — de órgão público, porque há um poder concedente no jogo.

A v4 muda um critério do projeto: até a v3.1 o RoadShow era a referência e as divergências eram só entre páginas dele. Na v4, para os campos de leilão, vale a hierarquia de fontes abaixo, e o RoadShow passa a ser uma das fontes.

## 2. Regra de fontes (decidida com o usuário)

Vale para os **campos de leilão**: data do leilão, vencedor (consórcio/proponente vencedor e grupo), deságio do vencedor, tarifa-teto e tarifa vencedora (quando houver), data de assinatura do contrato e data de início da operação. Os demais campos (capex, opex, km, WACC etc.) continuam como estão, com o RoadShow como fonte.

Ordem de prioridade do valor exibido:

1. **Documento do ato, de órgão público** — `oficial`: resultado/ata da B3, deliberação, nota técnica ou página da ANTT, contrato, Diário Oficial (União ou estado), TCU, governo estadual e suas agências (ex.: Artemig, Agems, Ager-MT).
2. **RoadShow** — `roadshow`: é do Ministério dos Transportes, portanto oficial, mas é compilação posterior e tem erros e divergências internas. Quando duas páginas divergem e uma é corroborada por imprensa, exibe-se a página corroborada (ex.: Lote 5 do Paraná, 23,83% da p. 15 × 21,83% da p. 97).
3. **Imprensa** — `imprensa`: exibida **marcada como "não oficial"**, dizendo que a fonte é imprensa (veículo, data, link). Só entra quando não há 1 nem 2 para o campo.

Regras complementares:
- O valor impresso no RoadShow que não for o exibido **continua registrado** como divergência, com a página.
- **Fatos novos da imprensa** encontrados durante a pesquisa (ex.: "o consórcio K&G venceu com 9% e foi inabilitado em 04/08/2025") entram como **nota** no item, marcada como imprensa, mesmo quando não mudam um valor.
- **Nada entra sem fonte.** A pesquisa do colega é só ponto de partida (onde procurar); nenhum número dele entra sem o documento achado e lido por nós. Campo sem fonte encontrada fica como está (RoadShow) ou "—", com a nota "não localizado em fonte oficial".
- Cada fonte guarda: tipo (`oficial` / `roadshow` / `imprensa`), órgão ou veículo, título, data do documento, URL, data de acesso e, se aplicável, página/trecho.

## 3. Escopo

### 3.1 Correções em leilões de 2023–2026

Sete correções levantadas pelo colega (RIP Lotes 1 e 2 dividem uma linha), a verificar uma a uma em fonte oficial:

| Leilão | Campo | RoadShow | Indicação do colega |
|---|---|---|---|
| Rodovias Integradas do Paraná – Lote 5 | deságio | 21,83% (p. 97); 23,83% (p. 15) | 23,83% (3 veículos de imprensa); reconcilia a média 12,36% das pp. 25/27 |
| Rota da Celulose | vencedor, deságio, assinatura | Caminhos da Celulose, 9%, 30/11/2025 | K&G venceu com 9% e foi inabilitado (04/08/2025); Caminhos da Celulose assumiu com deságio não confirmado; assinatura 02/02/2026 (contrato do Governo de MS por delegação) |
| RIP Lotes 1 e 2 | assinatura | 30/01/2024 | 31/01/2024 (página da ANTT) |
| RIP Lote 4 | assinatura | 06/02/2026 | 05/02/2026 (página da ANTT) |
| Via Liberdade | início da operação | 20/02/2026 | 20/03/2026 (Governo de MG); é PPP estadual regulada pela Artemig, não concessão da ANTT |
| Autopista Fluminense | vencedor | "Ateris SA (Corretora Itaú)" | grafia: Arteris S.A. |

Além desses, conferir na mesma passada **os 25 leilões de 2023–2026** nos campos de leilão da seção 2 (vencedor, deságio, data, assinatura, início), porque o critério novo vale para todos. Onde a fonte oficial confirma o RoadShow, registra-se a fonte oficial (o selo passa a ser `oficial`) sem mudar o valor.

Otimizações (Régis Bittencourt, Autopista Fluminense, Fernão Dias, Ecovias Capixaba, Motiva Pantanal) têm dois leilões: o original (2007–2013) e o processo competitivo de 2025–26. `assinatura` é o contrato original e `assinatura_aditivo` é o aditivo; os dois são conferidos e exibidos com rótulos distintos (decisão do construtor, registrada aqui).

A natureza da Via Liberdade (PPP estadual) entra como **nota** na ficha; a entidade **não** muda de esfera nem de estado de concessão na v4.

### 3.2 Leilões de 2007–2022

Os 22 leilões de 2007–2022 da tabela de participantes (`mercado.json` → `participantes`, pp. 11–15). Para cada um, buscar em fonte oficial (ANTT: atas, notas técnicas, deliberações de homologação; DOU; TCU):
- data do leilão;
- proponente vencedor oficial (e o grupo, se o vencedor depois foi adquirido);
- deságio do vencedor;
- tarifa-teto e tarifa vencedora, com data-base;
- assinatura do contrato e prazo (anos), quando o documento trouxer.

Os 14 contratos vigentes que resultam desses leilões (ex.: `transbrasiliana`, `autopista-litoral-do-sul`) recebem os valores verificados em todas as telas (ficha, cartão do mapa, comparador), não só na tabela de participantes.

Divergência já conhecida a verificar: Transbrasiliana (2007) — RoadShow dá TPI/Triunfo; o colega achou na ANTT o Consórcio BRVias vencedor com 39,99% (a Triunfo comprou o controle depois e teve lance de 5,68%).

Os deságios dos demais proponentes (pp. 11–15) continuam como impressos, com a ressalva já conhecida de que o critério do percentual não é rotulado no PDF.

### 3.3 Ranking de grupos econômicos (aba Mercado)

Tabela nova, uma linha por grupo econômico, de 2007 a 2026, ordenável, com filtro de período (ano inicial e final):

- participações (leilões em que o grupo aparece como vencedor ou proponente);
- vitórias;
- derrotas (participações sem vitória);
- taxa de êxito = vitórias ÷ participações;
- primeira e última aparição (ano).

Base: os leilões de `participantes`, usando o **vencedor exibido** (verificado, seção 2), não o impresso, quando diferirem.

**Crédito pelo grupo da época do leilão** (decidido com o usuário): a vitória ou a derrota conta para o grupo que disputou naquele leilão, não para o dono atual. Exemplo: Transbrasiliana 2007 é vitória do BRVias e derrota da Triunfo, embora a Triunfo tenha comprado o controle depois.

**Vencedor é quem foi adjudicado e assinou o contrato** (decidido com o usuário). Quem deu o melhor lance e foi inabilitado conta como participação com derrota, com a nota "inabilitado" e a data. O deságio exibido é o do adjudicatário; se não for localizado, fica "—" com nota e o leilão sai das médias, medianas e da série de deságio. Exemplo: Rota da Celulose — K&G (9%, inabilitado em 04/08/2025) é derrota; o deságio do Caminhos da Celulose só aparece se for achado.

**Agrupamento de nomes:** os nomes como impressos (consórcios, razões sociais, grafias) são ligados a um grupo econômico por uma tabela curada, visível e editável em `data/roadshow/grupos_alias.json`, com o **motivo** de cada junção. Juntam: troca de nome (CCR → Motiva), grafia, razão social ou SPE do mesmo grupo, e consórcio liderado por um grupo. **Aquisição posterior ao leilão não junta**; ela pode aparecer como nota ("controle adquirido pela Triunfo em 2014/2015"). Consórcio com mais de um grupo conta para o **grupo líder**, quando a fonte indicar; senão, para cada grupo nomeado (decisão do construtor, documentada na tabela). A aba mostra, abaixo do ranking, a lista de junções com o motivo.

**Aviso fixo:** em leilões sem lista de proponentes no PDF, só o vencedor é contado (as derrotas ficam subestimadas). A tabela marca quantos leilões estão nessa situação no período filtrado.

### 3.4 Série de deságio 2007–2026 (aba Mercado)

Gráfico novo: deságio do vencedor em cada leilão ao longo do tempo (eixo x: data do leilão; eixo y: deságio %). Ponto com fonte oficial e ponto não oficial (imprensa) com **marca diferente** e legenda; leilões sem deságio localizado não aparecem e a contagem deles é dita no rodapé do cartão. Tooltip: leilão, vencedor, deságio, fonte. Linha de referência em 18% (faixa do aporte de recursos vinculados, Portaria 995/2023) só para leilões a partir de 2023, onde a regra vale.

### 3.5 Exportar CSV

Botão "Exportar CSV" em **toda tabela de dados** do painel (todo `table.grid`), por um único helper compartilhado:
- exporta o que está na tela: filtros e ordenação aplicados;
- separador `;`, UTF-8 com BOM, decimal com vírgula e datas `dd/mm/aaaa` (abre direto no Excel em português);
- células que começam com `=`, `+`, `-`, `@`, tab ou CR recebem prefixo `'` (evita fórmula ao abrir no Excel);
- inclui a coluna de fonte e, quando houver, o tipo da fonte (`oficial`, `RoadShow`, `imprensa — não oficial`);
- nome do arquivo: `<tabela>-<aaaa-mm-dd>.csv`.

Funciona offline (Blob + download), sem dependência nova. Gráficos não exportam.

## 4. Onde a informação aparece

- **Ficha do projeto:** cada campo de leilão mostra o valor exibido e um selo de origem (`oficial` / `RoadShow` / `imprensa — não oficial`) com link para a fonte. O ícone de divergência existente passa a listar também o valor do RoadShow quando ele não é o exibido ("RoadShow imprime X na p. N"). Notas de fatos novos aparecem num bloco "Notas" da ficha.
- **Cartão do trecho no mapa** e **comparador de Projetos:** usam o valor exibido; o comparador ganha o tipo da fonte na coluna (ou numa coluna "Fonte do deságio"), e o CSV leva a fonte.
- **Pipeline:** datas de leilão e assinatura seguem o valor exibido (substitui a decisão "datas do pipeline seguem `conc.json`" para esses campos). Como `scripts/intel/pipeline.py` lê `conc.json` antes do `build.py`, a camada de verificação é aplicada também ali.
- **Mercado:**
  - tabela de participantes: deságio do vencedor 2007–2022 preenchido quando localizado, com selo e link;
  - cálculos nossos (média, mediana, dispersão concorrentes × deságio) passam a usar o valor exibido;
  - **agregados impressos pelo RoadShow** (deságio médio por número de concorrentes da p. 25, faixas da p. 27) continuam como impressos, rotulados como tal;
  - a nota sobre a média 12,29% × 12,36% é revista à luz do valor exibido do Lote 5.
- **Fontes:** o catálogo ganha um bloco para a verificação dos leilões (lista de documentos usados, com tipo e acesso).

## 5. Dados e build

Restrição: `entidades.json` só chega à tela por `build.py --shp`, que precisa do shapefile do SNV (fora do repositório e hoje indisponível). O build normal usa `data/base/conc.json` congelado.

Por isso a verificação é uma **camada separada**, aplicada no build sobre a base congelada:
- novo arquivo curado `data/roadshow/verificacao.json` (formato a cargo do construtor), com, por leilão: chave de ligação (id da entidade para 2023–2026 e contratos vigentes; ano + lote de `participantes` para 2007–2022), os campos verificados com valor e fontes, e as notas;
- `entidades.json` e `mercado.json` **não são reescritos**: continuam sendo a transcrição do RoadShow;
- o build aplica a camada e entrega ao front o valor exibido, a origem e o valor do RoadShow quando diferente;
- `data/roadshow/grupos_alias.json` para o agrupamento de nomes.

Validação (pytest), falhando o build/teste se:
- algum valor da camada não tiver fonte;
- fonte `oficial` sem URL de domínio de órgão público ou B3 (lista de domínios permitida no teste: `gov.br` e subdomínios estaduais `*.gov.br`, `in.gov.br`, `b3.com.br`, `tcu.gov.br` etc.; a lista é extensível, porque há diários oficiais estaduais fora de `gov.br`);
- fonte `imprensa` sem veículo, data e URL;
- chave de ligação que não casa com uma entidade ou linha de `participantes`;
- nome de vencedor/proponente sem grupo em `grupos_alias.json` (para o ranking).

## 6. Fora de escopo (próximos passos, a registrar no HANDOFF)

- Enriquecer a ficha dos 22 lotes de 2023–2025 sem ficha no RoadShow (edital, tarifa-teto, TIR, praças, duplicação).
- Aba Resumo ("leitura em 60 segundos").
- Linha do tempo de editais e leilões 2026–2027.
- Pista pelo SNV no cartão da concessão (km duplicados, simples, em obra).
- Gráficos de conteúdo do RoadShow ainda sem gráfico (ABDIB p. 39, debêntures p. 77, pavimento p. 35, comparativos pp. 41/45, diagramas pp. 61 e 73–77).
- Reconciliação declarado × recalculado como teste.
- Reclassificar entidades por esfera (ex.: Via Liberdade como PPP estadual).

**Anti-objetivos** (falha mesmo que funcione):
- número exibido sem fonte, ou fonte de imprensa sem a marca "não oficial";
- valor do RoadShow apagado quando não é o exibido;
- número copiado do dashboard do colega sem documento achado por nós;
- qualquer requisição de rede no HTML (continua offline) ou HTML acima de 15 MB.

## 7. Versão e documentação

- Esta entrega é a **v4**. Regra nova, a registrar no `HANDOFF.md`: **cada entrega que entra na `main` por PR ganha um número inteiro** (v4, v5…); não há mais "ponto um".
- README: seção "Novidades da v4" e a regra de fontes dos leilões.
- HANDOFF: estado, decisões novas (hierarquia de fontes; agregados impressos ficam como impressos; crédito pelo grupo da época; vencedor = adjudicatário; consórcio no ranking), pendências (seção 6).

## 8. Critérios de aceite

- As 7 correções da tabela 3.1 resolvidas: valor exibido com fonte, ou registrado como "não localizado em fonte oficial", e o valor do RoadShow preservado.
- Os 25 leilões de 2023–2026 conferidos nos campos de leilão; os 22 de 2007–2022 com o que for localizado, e um relatório (`data/roadshow/verificacao.md`, gerado) com a cobertura: quantos campos `oficial`, `roadshow`, `imprensa` e não localizados.
- Ranking de grupos e série de deságio na aba Mercado, com a lista de junções visível.
- Botão CSV em todas as tabelas `table.grid`; e2e baixa um CSV e confere separador, BOM, filtro aplicado e a proteção contra fórmula.
- Funções puras novas (ranking, aplicação da camada de verificação, montagem do CSV) testadas com `node --test`; validações de dados no pytest; e2e para selo de origem na ficha, ranking e CSV.
- Todos os testes atuais verdes; HTML ≤ 15 MB; zero requisições de rede.
