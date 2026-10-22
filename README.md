# Rodovias do Brasil · Centro de Inteligência

Mapa interativo dos trechos do **SNV (Sistema Nacional de Viação, DNIT)**, versão 202607A, sobre o mapa das UFs do Brasil, com os dados de mercado do **RoadShow 2026-2027** do Ministério dos Transportes (v40, 14/10/2026) para estudar as concessões rodoviárias federais. Na v3, o painel ganha camadas e abas de tráfego, praças de pedágio, carga, agro, multimodal, rodovias estaduais e a carteira de projetos, cada uma com a fonte e o rótulo modelado × medido. A v3.1 acrescenta as Rotas de Integração Sul-Americana, uma paleta de cores de dados e o VMDa 2025 do DNIT nas rodovias federais e estaduais (veja [Novidades da v3.1](#novidades-da-v31)). A **v4 — final** confere os leilões em fonte oficial, mostra a origem de cada dado de leilão, acrescenta a série de deságio 2007–2026, o ranking de grupos econômicos e a exportação CSV (veja [Novidades da v4](#novidades-da-v4)), e fecha o projeto: aba **Resumo** como página inicial, linha do tempo de editais e leilões, pista pelo SNV nas concessões, os gráficos e diagramas do RoadShow que faltavam, a reconciliação dos totais e a atualização dos dados em um comando (veja [Fechamento da v4](#fechamento-da-v4--final) e [Como atualizar](#como-atualizar)). Feito para análise interna, com a paleta de cores base descrita em [`docs/paleta.md`](docs/paleta.md).

**Abrir:** dê duplo clique em [`mapa-rodovias.html`](mapa-rodovias.html). É um arquivo único (até 15 MB, hoje cerca de 11,7 MB) que roda offline: dados, código, estilos e fontes estão embutidos.

## Abas

O arquivo abre na aba **Resumo**; o endereço `#mapa` (ou o clique em "Mapa") abre o mapa direto.

- **Resumo:** a "leitura em 60 segundos". Seis números-chave (malha federal, km sob concessão, leilões realizados, investimento do programa, deságio médio, grupos vencedores), seis achados calculados (concorrência × deságio, leilões acima de 18% e o aporte de recursos vinculados, deságio de 2007 × programa atual, concentração em poucos grupos, calendário dos próximos leilões, peso do opex), cada achado com "Como foi calculado" e a fonte (página do RoadShow ou documento oficial), e atalhos para as outras abas. Nada é digitado: tudo é calculado dos dados na hora e, se um bloco faltar, o achado some em vez de mostrar valor vazio. Os números do Resumo são os mesmos das abas de origem (o km sob concessão é o da aba Mercado, p. 37 do RoadShow; o do cadastro do SNV aparece como segunda linha).
- **Mapa:** a malha federal. No modo **Concessões** (padrão), cada trecho tem o estado da concessão: leilão agendado 2026, projeto 2027, contrato do programa 2023–26, contrato vigente anterior, concessão no SNV fora do RoadShow, estudo pós-2027 ou sem concessão. Quando um trecho tem mais de um estado, a cor segue essa ordem de prioridade. No modo **Situação física**, valem as cores da v1. Há também os modos de cor **Tráfego** (VMDa 2025 do DNIT, modelado), **Pesados** (VMDa 2023 da Infra S.A., modelado), **Carga agrícola** (PNL 2035, modelado) e **Acidentes** (PRF, medido). Há filtros por estado, projeto e ano, e a busca também encontra nomes de projeto. O cartão do trecho lista as concessões dele, com "Ver ficha" e, em cada uma, a linha "Pista da concessão" (km pelo SNV e o que é duplicado, simples, em obra de duplicação ou sem pavimento). Camadas opcionais: rodovias estaduais (com as concessões estaduais), praças de pedágio, SATs, obras da ANTT, ferrovias em operação, portos e terminais, fluxos ferroviários de grãos, as Rotas de Integração Sul-Americana (com os países vizinhos) e, como fundo por município, a produção de soja, milho, cana, algodão, café e trigo e a capacidade de armazenagem.
- **Ficha do projeto:** todos os campos do RoadShow: capex e opex (nominal e VPL), WACC, tarifa, obras, praças, indicadores, garantias, CAPEX anual do ciclo de obras, cronograma e participantes. Um ícone de aviso marca as divergências entre fontes, mostrando o valor exibido e os alternativos, inclusive o que o RoadShow imprime. Na v4, cada dado de leilão da ficha (data do leilão, vencedor, deságio, tarifa-teto e vencedora, assinatura, início da operação, prazo) traz um selo de origem com link, e o bloco "Notas da verificação" reúne os fatos novos e os proponentes inabilitados. Na ficha das concessões há também o bloco **Pista no SNV**: km e % de pista duplicada, pista simples pavimentada, em obra de duplicação e sem pavimento ou planejada, pelo recorte curado dos trechos (aproximado quando o recorte é aproximado; sem recorte, a ficha diz "sem recorte no SNV" e não mostra 0 km). Na v3, a ficha federal acrescenta as obras acompanhadas pela ANTT, as séries realizadas e o pipeline; as concessões estaduais têm ficha própria.
- **Projetos:** comparador ordenável dos 39 contratos e dos 15 projetos futuros, com filtros (inclusive por esfera, federal ou estadual), seleção de colunas da ficha e totais; as concessões estaduais também entram no comparador. Abaixo, os 27 estudos pós-2027. A seção Pipeline lista os próximos leilões, consultas e estudos, federais e estaduais, e abre com a **linha do tempo de editais e leilões** (círculo vazado = edital, losango = leilão, cor pelo status; o nome abre a ficha; itens sem data de leilão não aparecem e são contados no rodapé). A linha do tempo começa no ano em que o arquivo é aberto.
- **Tráfego:** praças de pedágio da ANTT (VMD de 2025, contagem medida), tráfego mensal, Índice ABCR de fluxo pedagiado, VMDa modelado e acidentes da PRF.
- **Cargas:** produção agrícola por UF e município, fluxos ferroviários de grãos (SIADE), exportação por unidade da Receita (Comex Stat), fretes rodoviários (CONAB) e os trechos com maior carga agrícola (PNL 2035).
- **Mercado:** leilões por ano, série de deságio do vencedor de 2007 a 2026, concorrentes × deságio, grupos econômicos (com o ranking de vitórias e derrotas e a lista de como os nomes foram agrupados), gestão direta × concedida, investimentos (com a série da ABDIB, p. 39), debêntures incentivadas (p. 77), estado do pavimento e custo do frete (p. 35), comparativos público × privado (pp. 41 e 45) e participantes de cada leilão de 2007 a 2026, com data, deságio do vencedor e selo de origem (abaixo do vencedor e do deságio, o que o RoadShow imprime quando difere).
- **Regulatório:** Portaria 995/2023, matriz de riscos, garantias, financiamento, otimizações contratuais (Portaria 848/2023), sustentabilidade e estruturadores, com dois diagramas: o fluxo do projeto ao leilão (p. 61) e o fluxo de financiamento (pp. 73–77). Os dois dizem que são esquemas nossos, feitos do texto do RoadShow, e cada elemento traz a página.
- **Fontes:** todas as fontes de dados (nome, período, data de acesso, licença, tipo e nota), as bases da v1/v2, as fontes tentadas que não deram dado e, na v4, a lista dos documentos usados na verificação dos leilões (tipo, órgão ou veículo, título, data, link e acesso). Cada cartão das abas também traz a sua linha "Fonte:". Toda tabela de dados tem o botão **Exportar CSV** (v4).
- **Glossário:** o que significam os termos técnicos e de mercado do painel (VMDa, deságio, capex, NTN-B, spread etc.), com busca por termo e filtro por categoria, e a fonte quando a definição vem de norma. O conteúdo está em `data/glossario.json` (edite o arquivo e rode `python scripts/build.py`); as outras abas ligam a primeira menção de cada termo ao glossário com `Glossario.link('id')`, e o pytest falha se algum link citar um termo que não está no arquivo.

### Regras dos dados do RoadShow

- Só as páginas em **português** (ímpares) do PDF. As páginas em inglês convertem para milhas e US$.
- **Data-base dos preços:** o comparador, os totais e o cartão usam capex e opex das tabelas em **dez/2024** (p. 3–5 e p. 97) sempre que existirem. Quem só tem ficha usa a data-base da ficha, mostrada na coluna "Data-base". A ficha mostra os próprios valores, com a data-base dela, e o valor em dez/2024 ao lado.
- **Divergências** entre páginas do PDF ficam registradas em `data/roadshow/entidades.json` (`divergencias`) e aparecem na ficha. Uma diferença de preço que só se deve à data-base vira nota (`notas_base`), não divergência.
- **Leilões: regra de fontes (v4).** Para os campos de leilão (data do leilão, vencedor, deságio do vencedor, tarifa-teto e tarifa vencedora, assinatura, início da operação, prazo), o valor exibido segue a hierarquia **oficial > RoadShow > imprensa**:
  1. **Oficial:** documento do ato, de órgão público (ata ou resultado da B3, deliberação ou página da ANTT, contrato, diário oficial, TCU, governo estadual e agências). Fica na camada `data/roadshow/verificacao.json`, com tipo, órgão, título, data do documento, URL, data de acesso e trecho.
  2. **RoadShow:** do Ministério dos Transportes, mas compilação posterior, com erros e divergências internas.
  3. **Imprensa:** só entra quando não há 1 nem 2, sempre marcada como **"não oficial"**, com veículo, data e link.
  - O valor do RoadShow que não for o exibido **continua registrado** como divergência, com a página. Fatos novos da imprensa viram nota. Nada entra sem fonte: campo sem fonte achada fica como está (RoadShow) ou "—", com a marca "não localizado em fonte oficial". O `entidades.json` e o `mercado.json` não são reescritos; a camada é aplicada no build.
  - Os agregados que o RoadShow imprime (deságio médio por número de concorrentes, p. 25; faixas, p. 27) continuam como impressos e rotulados assim. Os cálculos do painel (média, mediana, dispersão, série) usam o valor exibido.
  - O relatório de cobertura (leilões, campos por tipo de fonte e não localizados) é gerado em [`data/roadshow/verificacao.md`](data/roadshow/verificacao.md). O pytest falha se um valor não tiver fonte, se uma fonte oficial não for de domínio de órgão público ou B3, se uma fonte de imprensa não tiver veículo, data e URL, se uma chave não casar com uma entidade ou linha de participantes, ou se um nome de proponente não tiver grupo em `grupos_alias.json`.
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
- **Paleta de cores de dados.** A interface e a malha federal base continuam na paleta base. As camadas temáticas, as rotas e os modos quantitativos usam uma paleta de dados validada para daltonismo e legibilidade, com cor fixa por entidade e sempre com legenda ou rótulo. Cada modo quantitativo tem um tom, do claro ao escuro: Tráfego azul, Pesados violeta, Carga agrícola laranja e Acidentes vermelho. Os tokens estão em `src/styles-map.js`. A documentação, com as saídas do validador, os pares de cores conferidos e os limites conhecidos, está em [`docs/paleta.md`](docs/paleta.md). O validador `scripts/validate_palette.js` roda no `npm test` (`tests/palette.test.mjs`).
- **VMDa 2025 (DNIT, modelado), federal e estadual.** O modo Tráfego e o veíc·km passam a usar o VMDa 2025: total e os dois sentidos do SNV por trecho físico. Pesados continua no VMDa 2023 da Infra S.A., porque o 2025 não separa leves e pesados. No cartão, os pesados de 2025 são uma estimativa (total 2025 × % de pesados de 2023), e o rótulo diz isso. Trechos que o modelo marca como não simuláveis (áreas urbanas) aparecem com "uso restrito". Com a camada de rodovias estaduais ligada no modo Tráfego, as estaduais são coloridas pelo VMDa 2025. Elas usam as mesmas classes e cores da malha federal, com traço mais fino; sem dado, ficam em cinza contínuo. A aba Tráfego mostra o veíc·km/dia da malha federal e o das rodovias estaduais, com a cobertura. Em todos os casos, VMDa 0 conta como sem dado.

## Novidades da v4

Design em [`docs/superpowers/specs/2026-10-21-v4-verificacao-leiloes-design.md`](docs/superpowers/specs/2026-10-21-v4-verificacao-leiloes-design.md). Um dashboard do RoadShow montado por um colega serviu só de pista de onde procurar; nenhum número dele entrou sem o documento achado e lido.

- **47 leilões verificados** (25 de 2023–2026 e 22 de 2007–2022), com 297 campos em fonte oficial, nenhum só de imprensa, 1 não localizado (o início da operação da Rota da Celulose) e 1 "não se aplica" (o deságio da Ponte São Borja, leilão por outorga). Mais 2 entradas só de data de edital (Rota Arco Norte e Rota Norte Catarinense), tiradas do cronograma do RoadShow (pp. 117 e 153) porque a ficha imprime outra data. São 204 fontes catalogadas (172 oficiais, 25 de imprensa, 7 do RoadShow). A regra está em "Regras dos dados do RoadShow".
- **Selo de origem** (`oficial`, `RoadShow`, `imprensa — não oficial`, `não localizado em fonte oficial`, `não se aplica (leilão por outorga)`) com link na ficha, na tabela de participantes, no comparador de Projetos (coluna "Fonte do deságio") e na aba Fontes. O ícone de divergência lista o valor exibido e o que o RoadShow imprime.
- **O que a verificação confirmou e corrigiu:**
  - RIP Lotes 1, 2 e 4: as datas de assinatura do RoadShow (30/01/2024 e 06/02/2026) estão certas; a indicação do dashboard externo, que apontava outras datas, não se confirmou.
  - RIP Lote 5: deságio de 23,83% (p. 15), confirmado pela B3; a p. 97 imprime 21,83%.
  - Rota da Celulose: o Consórcio K&G (9%) foi declarado vencedor na sessão e inabilitado em 04/08/2025; o Consórcio Caminhos da Celulose, com 8% (DOE-MS), foi adjudicado. O RoadShow atribui a ele os 9% do K&G. A assinatura exibida é 06/02/2026 (Agência de Notícias do Governo de MS); o início da operação fica não localizado.
  - Via Liberdade (PPP estadual, regulada pela Artemig): início da operação em 20/03/2026 e assinatura em 12/01/2026. A natureza estadual entra como nota; a entidade não muda de esfera.
  - Autopista Fluminense: o vencedor é Arteris S.A. (o RoadShow imprime "Ateris SA (Corretora Itaú)").
  - Transbrasiliana (2007): o vencedor foi o Consórcio BRVias, com 39,99%, e não a Triunfo.
  - Ponte binacional São Borja–Santo Tomé: o leilão foi decidido pela maior outorga; os 0,38% que o RoadShow imprime como deságio são ágio sobre a outorga mínima. O deságio passa a "não se aplica (leilão por outorga)", com selo próprio, e o ativo sai das séries e médias.
  - Régis Bittencourt (otimização): o prazo exibido é 15 anos (minuta do termo aditivo e página da ANTT); a B3 informa 25 anos e isso fica registrado como divergência visível na ficha.
  - Leilões de 2007–2022: data, vencedor da época, deságio, tarifa-teto e vencedora (como texto, com unidade e data-base) e prazo, nos 14 contratos vigentes e na tabela de participantes.
- **Mercado:**
  - **Série de deságio 2007–2026:** um ponto por leilão (cheio para oficial e RoadShow, anel tracejado para imprensa, anel externo para os deságios limitados pelo edital), linha de 18% a partir de 2023 (Portaria 995/2023) e contagem dos leilões sem deságio.
  - **Ranking de grupos econômicos:** participações, vitórias, derrotas, taxa de êxito, primeira e última aparição, com filtro de período, ordenação e o aviso de que, onde o PDF não lista proponentes, só o vencedor é contado. Vale o grupo da época do leilão, e vencedor é o adjudicatário (quem foi inabilitado conta como derrota). Os nomes são ligados a grupos por [`data/roadshow/grupos_alias.json`](data/roadshow/grupos_alias.json) (127 nomes em 79 grupos, cada junção com motivo e, quando não óbvia, fonte), listada abaixo do ranking. Aquisição ou venda de controle posterior ao leilão não junta (os 5 lotes de 2007 contam para a OHL Brasil, não para a Arteris).
- **Exportar CSV** em toda `table.grid`: o que está na tela (filtros e ordenação), separador `;`, UTF-8 com BOM, decimal com vírgula, datas `dd/mm/aaaa`, proteção contra fórmula (prefixo `'`), coluna de fonte e nome de arquivo `<tabela>-<aaaa-mm-dd>.csv`. Funciona offline, sem dependência nova.
- **Pipeline:** as datas de leilão e assinatura seguem o valor exibido (a Rota dos Sertões passou a "contrato", com a assinatura de 29/09/2026).

### Fechamento da v4 — final

Design em [`docs/superpowers/specs/2026-10-21-fechamento-design.md`](docs/superpowers/specs/2026-10-21-fechamento-design.md). O fechamento entra no mesmo PR da v4.

- **Aba Resumo** como página inicial (veja "Abas").
- **Linha do tempo** de editais e leilões na seção Pipeline. Se o RoadShow imprime duas datas de edital diferentes, vale a do cronograma, pela camada de verificação (campo `edital`), e a conferência da camada exige edital não posterior ao leilão.
- **Pista pelo SNV** na ficha e no cartão do mapa das concessões.
- **Gráficos e diagramas do RoadShow que faltavam**: ABDIB, debêntures, estado do pavimento, comparativos público × privado, fluxo do projeto e fluxo de financiamento. O texto e os números ficam em `data/roadshow/mercado.json` e `regulatorio.json`, com página; o código só desenha. O gráfico de estado do pavimento mostra o aumento do custo do frete por condição do pavimento (CNT), não participação na malha.
- **Reconciliação** dos totais que o RoadShow imprime (pp. 3, 5, 17, 25, 27, 97 e 125) contra os dados curados, em `tests/test_reconciliacao.py` e `data/roadshow/reconciliacao.json`. As divergências do próprio RoadShow estão registradas com o motivo, como falha esperada (22 casos); quando a causa não foi identificada, o teste diz isso, sem afirmar de quem é o erro.
- **Verificação dos leilões**: o marcador `nao_se_aplica` (hoje só no deságio, com a fonte que explica por que não se aplica), e a divergência declarada `alternativas` registra o valor de outra fonte que não é o exibido (a B3 no prazo do Régis). Linhas "RoadShow: …" cujo nome pertence ao mesmo grupo econômico do nome verificado deixam de aparecer; as divergências reais (por exemplo BRVias × TPI) continuam.
- **Mapa e textos**: enquadramento e legendas a 1366 px, zoom pela API pública do Leaflet (sem `_animatingZoom`), tipos de porto em português, nota nos trechos planejados, praça com VMD que arredonda a 0 vira "sem dado", localização do estaleiro Keppel Fels pelo município do cadastro, e as correções menores de robustez da camada de verificação, dos gráficos e do CSV.
- **Atualização em um comando** (`python scripts/atualizar.py`, com `--baixar` e `--renovar`) e o relatório `data/atualizacao.md`: veja a próxima seção.
- **Atualização sem editar o código da interface**: a média impressa do deságio, o período de concorrência, os anos do programa, a data-base, os anos de VMD, receita e praças, o ano-base do PNL e a data da apresentação das rotas saem dos dados. Os testes de navegador comparam a tela com o que a página calcula, e os testes que conferem um valor concreto ficam em `tests/test_dados_conferidos.py` e `tests/test_reconciliacao.py`.

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

## Como atualizar

São três roteiros. Todos terminam do mesmo jeito: o `mapa-rodovias.html` gerado de novo e o relatório `data/atualizacao.md`, que diz o que mudou e o que ainda precisa de revisão manual. Nenhum arquivo de `data/intel/*.json` se edita à mão: uma correção vai no script que gera o bloco ou no arquivo curado de origem (`data/intel/pipeline.csv`, `data/roadshow/*.json`). A interface não tem número nem período digitado: títulos como "Programa 2023–2027" e os anos dos filtros saem dos dados.

### 1. Dados públicos (um comando)

```bash
python scripts/atualizar.py --baixar                         # baixa o que falta, gera todos os blocos, valida e gera o HTML
python scripts/atualizar.py --renovar                        # baixa de novo tudo (mesmo o que já está em data/raw/) e gera
python scripts/atualizar.py --renovar antt,agro              # baixa de novo só esses domínios; os outros usam o que há
python scripts/atualizar.py                                  # sem baixar: usa só os brutos que já estão em data/raw/
python scripts/atualizar.py --dominios antt,pipeline --sem-html   # só alguns domínios, sem gerar o HTML
```

- A ordem é fixa: `trafego`, `antt`, `carga`, `agro`, `multimodal`, `pipeline`, `estaduais`, `vmda2025`, `rotas`; depois o bloco de fontes, a validação da camada de verificação dos leilões e o `build.py`. O comando chama os scripts de `scripts/intel/` (os mesmos da seção "Atualizar os dados", abaixo).
- Domínio sem o arquivo bruto (sem `--baixar`), ou cujo download falha, é pulado com aviso no relatório, e o bloco dele fica como estava. O VMDa 2025 é pulado se o zip do Google Drive não estiver em `data/raw/trafego/vmda2025/`.
- O comando só termina com erro quando a validação da verificação ou a geração do HTML falham. Se o HTML não puder ser gerado por qualquer motivo, o passo aparece como falha (nunca como pulado).
- `--baixar` baixa só o que falta: arquivo que já está em `data/raw/` não é baixado de novo. Para trazer a versão mais nova de uma fonte, use `--renovar` (todos os domínios) ou `--renovar antt,agro` (só esses): o download é refeito mesmo que o arquivo exista. O arquivo anterior fica guardado ao lado, como `<arquivo>.anterior`, até o bloco do domínio ser gerado: se o download ou a geração falham, ele volta para o lugar (com o manifesto) e o detalhe do passo no relatório diz "bruto anterior restaurado". Não apague pastas de `data/raw/` à mão: ali também ficam arquivos que só você tem (o zip do VMDa 2025) e brutos usados por mais de um domínio (`data/raw/graos/`).
- A data de acesso de cada arquivo (manifesto e aba Fontes) só muda quando o conteúdo baixado muda (SHA-256 diferente). Se um domínio renovado vier igual, o relatório lista-o em "Fontes renovadas sem dado novo": a fonte não publicou dado novo ou o endereço mudou (muitas URLs trazem o ano ou o mês no nome; veja a tabela abaixo).
- Depois, leia `data/atualizacao.md`:
  - **O que mudou por bloco**: registros e tamanho de cada bloco antes e depois, comparados com o último commit.
  - **Curadoria manual**: cada item diz o arquivo a editar. São seis tipos: item do pipeline com data passada ainda como previsto (status em `pipeline.csv`; num item com concessão federal, a data em `data/roadshow/verificacao.json` ou `entidades.json`); leilão realizado sem resultado na camada de verificação, inclusive quando a entrada da concessão só tem a data do edital (roteiro 3); concessão ainda como "a leiloar" com leilão já passado (roteiro 3); item do pipeline sem fonte oficial; fonte acessada há mais de 12 meses (para fontes baixadas, `--renovar` o domínio; para as curadas, a constante `ACESSO` no script indicado); nome de proponente sem grupo econômico (`data/roadshow/grupos_alias.json`).
- Rode os testes (seção "Testes"). Os testes de navegador comparam a tela com o que a própria página calcula e passam com dados novos. Os testes que conferem um valor concreto (`tests/test_dados_conferidos.py` e os `tests/test_intel_*.py`) falham com a mensagem "dado mudou: revise …": confira o novo valor na fonte indicada e, se estiver certo, atualize o valor esperado no teste.
- Faça o commit dos JSON, do relatório e do HTML.

**Período novo de uma fonte.** Os scripts baixam endereços fixos, e vários trazem o ano ou o mês no nome do arquivo. Quando a fonte publica um período novo (um ano a mais da ANTT, outro boletim da CONAB), edite estas constantes no script do domínio antes de `--renovar`:

| Domínio | Script | O que editar para um período novo |
|---|---|---|
| trafego | `scripts/intel/trafego.py` | VMDa da Infra S.A.: `VMDA_LAYER` e `VMDA_FILE` (camada `VMDa_2023`), `"ano": 2023` em `build_vmda` e o texto das fontes; ABCR: `ABCR_URL`/`ABCR_FILE` (`base_0926.xlsx`, mês no nome), `ABCR_MESES` (janela de 120 meses) e os períodos "1999-set/2026" (`fetch`) e "out/2016 a set/2026" (`fontes`); PRF: `PRF_IDS` (id do Drive por ano), `ANOS` (anos somados) e os textos "2024 e 2025" e "2026-01 a 2026-08 (parcial)" |
| antt | `scripts/intel/antt.py` | `MESES` (anos 2024–2026 e o corte `[:32]`, até ago/2026), `ANOS` (`range(2010, 2026)`, séries anuais), `ARQUIVOS` (nomes com ano: `dados-dos-pracas-de-pedagio6_2026.csv`, `volume-trafego-praca-pedagio-<ano>_mensal_consolidado.csv`, `receita_por_praca_2025.csv`), os anos em `_load_volumes` (2024, 2025, 2026), os mesmos nomes de arquivo lidos em `build_pracas`, `PRACAS_ANO`, `SAT_ANO`, `SAT_JANELA`, o período "2022-2026" dos SATs em `fetch` e os períodos das fontes ("jan/2024 a ago/2026", "2025", "2010 a 2025", "planejamentos de 2023 a 2026") |
| carga | `scripts/intel/carga.py` | Fixo: PNL 2035, cenário-base 2017 (`URL`, `"ano_base": 2017`). Um cenário novo do PNL é trabalho de script |
| agro | `scripts/intel/agro.py` | `ARQUIVOS` (URLs do SIDRA com `/p/2025/` e arquivos `pam*_2025.json`; a Pesquisa de Estoques usa `p/last`, mas o texto "2º semestre 2025" está escrito), `PRODUTOS` (chaves `pam1612_2025` etc.), a malha 2025 de MT (`MT_NOVOS`, `_mt2025`) se surgirem municípios novos, e os períodos nos `_fonte` |
| multimodal | `scripts/intel/multimodal.py` | `ARQUIVOS` (BaseFerro abr/2024; ANTAQ com data no nome; `producao_origem_destino_2025.csv`; IBGE Logística 2024; `EXP_2025.csv`; boletim `boletim-logistico-setembro-2026`), `FRETES_CSV`/`FRETES_PDF`, as conferências de ano em `build_siade` (`"/2025"`) e `build_exportacao` (`CO_ANO == "2025"`, `"ano": 2025`), o mês dos fretes em `fetch` e os períodos em `fontes` |
| pipeline | `scripts/intel/pipeline.py` | O conteúdo é curado em `data/intel/pipeline.csv`; ao revisar a carteira, atualize `ACESSO` e os períodos de `FONTE` (e `BRUTOS`, que guarda a carteira e as APIs 2026/2027) |
| estaduais | `scripts/intel/estaduais.py` | `INFRA_URL` (camada com CIDE 2021/DNIT 2002; a de ano-base 2024 não respondia), `ARTESP_KMZ` (id de recurso por lote), `AGERGS_XLSX` (caminho com data), os dicionários curados das concessões (`CURADO_SP` e as fichas das demais UFs) e o período "2026" em `fetch` |
| vmda2025 | `scripts/intel/vmda2025.py` | Arquivo do usuário (Google Drive): `ZIP`, `PASTA`, `SHP`, `"ano": 2025` em `build` e os textos de período; um VMDa de outro ano é, na prática, um bloco novo |
| rotas | `scripts/intel/rotas.py` | `PDF` (`apresentacao_rotas_2026-07-01.pdf`), `URL_APRESENTACAO`, `URL_RELATORIO` (2024 e 2025), `DOCS`, os textos de `ROTAS` (transcritos), `PAGINA` e os coeficientes `CX`/`CY` (georreferência do mapa do PDF) |
| fontes | `scripts/intel/fontes_bloco.py` | `ACESSO` e `BASE` (versão do SNV e do RoadShow), `INDISPONIVEIS` |

Depois de editar, rode `python scripts/atualizar.py --renovar <domínio>` e confira o relatório e os testes "dado mudou".

### 2. Nova versão do RoadShow

1. Coloque o PDF novo em `data/raw/roadshow.pdf` (fora do git).
2. Extraia de novo seguindo [`scripts/extract/README.md`](scripts/extract/README.md): os gráficos saem do PDF com `scripts/extract/roadshow_v5.py`; fichas, mercado e regulatório são conferidos à mão contra as páginas (só as ímpares, em português). Todo número leva a página de origem.
3. Releia os totais impressos e atualize `data/roadshow/reconciliacao.json`. `python -m pytest tests/test_reconciliacao.py` diz se os dados curados fecham com o que o RoadShow declara (divergências conhecidas do próprio RoadShow estão listadas no teste, com o motivo).
4. As duas constantes impressas que a interface mostra ficam em `data/roadshow/mercado.json`, com a página em `fontes`: `desagio_medio_impresso` (média dos deságios, pp. 25 e 27) e `periodo_concorrencia` (período dos totais de concorrência, pp. 21, 25 e 27).
5. Rode `python -m pytest tests/test_roadshow.py tests/test_reconciliacao.py tests/test_dados_conferidos.py` e `python scripts/atualizar.py`.
6. O nome "RoadShow 2026-2027", a edição (`EDICAO` em `scripts/roadshow.py`) e as categorias de estado das concessões ("Leilão agendado 2026", "Projeto 2027", "Contrato do programa 2023–26", em `scripts/roadshow.py` e `src/styles-map.js`) fazem parte do modelo: uma versão com outros anos pede revisar esses rótulos (o build os relê de `scripts/roadshow.py` a cada execução). Concessões novas ou removidas em `entidades.json` precisam de recorte no SNV: `python scripts/build.py --shp …` (seção "Regenerar com um SNV novo").

Para consultar os trechos de uma BR ao curar o recorte, use `python scripts/snv_lookup.py 116 MG --adm`.

### 3. Um leilão novo

1. Atualize o item em `data/intel/pipeline.csv` (status `leiloado` ou `contrato`, data, fonte oficial em `fonte_url` e `verificado = true`) e rode `python scripts/atualizar.py --dominios pipeline`. Num item ligado a uma concessão federal (`ent`), a data exibida vem da concessão (`data/roadshow/entidades.json`, com a camada de verificação), como nas demais abas; a do CSV só vale quando a concessão não tem a data.
2. O relatório passa a listar o leilão em "Leilão realizado sem resultado na camada de verificação" (também quando a concessão já tem entrada, mas só com a data do edital, como a Rota Arco Norte e a Rota Norte Catarinense) e, se a concessão ainda estiver como "Leilão agendado" ou "Projeto" no RoadShow, em "Concessão ainda como a leiloar, com leilão já passado". Mude o `estado` (e o `status_texto`) da concessão em `data/roadshow/entidades.json` (por exemplo, de `agendado2026` para `programa` depois da assinatura) e rode `python scripts/atualizar.py`: o build relê os campos curados das concessões a cada execução, sem o shapefile do SNV. Do SNV fica só o recorte (os trechos de cada concessão). Uma concessão nova ou removida em `entidades.json` precisa de recorte novo: o build para com a mensagem "entidade nova/removida precisa de recorte no SNV: rode build.py --shp (ou ajuste trechos.json)".
3. Acrescente o resultado à camada de verificação seguindo a receita de [`docs/HANDOFF.md`](docs/HANDOFF.md) (§2, "Como acrescentar um leilão verificado"): `data/roadshow/verificacao.json` (na entrada da concessão, `ent`, os campos `leilao`, `grupo_vencedor`, `desagio`, `assinatura`…, com as fontes) e `data/roadshow/grupos_alias.json` (grupo econômico de cada proponente).
4. Rode `python -m pytest tests/test_verificacao.py` e `python scripts/atualizar.py`.

**O que mostra o resultado logo e o que espera o próximo RoadShow.** Com os passos 1 a 3, o resultado aparece na ficha da concessão (data, vencedor, deságio e assinatura, com o selo de origem), na aba Projetos (tabela, pipeline e linha do tempo) e no mapa (cor pelo `estado` da concessão). A aba Mercado (série de deságio do vencedor, ranking de grupos e concorrentes × deságio) e o Resumo (leilões realizados, deságio médio, grupos e achados) contam os leilões pelas listas do RoadShow em `data/roadshow/mercado.json` (`participantes` e `concorrentes_desagio`), e só mudam quando a próxima versão do RoadShow trouxer a linha.

Para contar o leilão nessas abas antes disso:

1. Acrescente a linha em `data/roadshow/mercado.json`, no mesmo formato das existentes: em `participantes` (`ano`, `lote`, `vencedor`, `desagio_vencedor`, `outros` com `grupo` e `desagio` de cada demais proponente) e, para leilões de 2023 em diante, em `concorrentes_desagio` (`leilao`, `ano`, `n` = número de proponentes, `desagio`). Marque as duas com `"fora_do_roadshow": true`: assim os testes de reconciliação, que comparam a transcrição com os totais impressos no RoadShow, não as contam.
2. Ligue a entrada da verificação a elas, além do `ent`: `"participantes": {"ano": …, "lote": "<lote>"}` e `"concorrentes": "<leilao>"`. Com isso, data, vencedor e deságio mostram a fonte oficial. Os demais proponentes não têm selo próprio: cite a fonte deles numa `nota` da entrada.
3. Rode `python -m pytest tests/test_verificacao.py tests/test_reconciliacao.py` e `python scripts/atualizar.py`. Os agregados impressos pelo RoadShow (totais de concorrência, média impressa, faixas de deságio) não mudam.
4. Na versão seguinte do RoadShow, a nova extração refaz as duas listas e a linha passa a vir dele. Se o nome do lote mudar, a validação acusa "casa 0 linhas" e basta ajustar `participantes.lote` e `concorrentes` na entrada da verificação.

O teste `test_roteiro_3_resultado_antes_do_proximo_roadshow` (`tests/test_verificacao.py`) faz esse caminho numa cópia de `data/roadshow/`. Um leilão federal sem concessão no RoadShow (sem `ent`) fica no pipeline, com fonte e observação, até a próxima versão, e o relatório continua lembrando dele.

## Atualizar os dados

O roteiro 1 de "Como atualizar" faz tudo isto em um comando. Abaixo, os detalhes de cada domínio, para rodar à mão.

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

Os brutos ficam em `data/raw/` (fora do git, ~4,0 GB em disco; o manifesto lista 264 arquivos, ~1,3 GB baixados ou recebidos) e o build nunca os lê. O manifesto (`data/intel/manifest.json`, com URL, data de acesso, tamanho e SHA-256 de cada arquivo baixado) fica no repositório; na pasta Rodovias do Google Drive, subpasta `v3-dados`, estão uma versão em planilha dele (`manifesto-fontes-v3.csv`, sem os hashes), `fontes.json` e `pipeline.csv`. As cópias estão atualizadas com a v3.1 (incluem `vmda2025` e `rotas`). Os demais JSON processados ficam só no repositório. O manifesto não vai para o HTML; o bloco `fontes` vai. O pipeline de concessões vem de `data/intel/pipeline.csv`, editado à mão; `python scripts/intel/pipeline.py build` valida o CSV e regenera o JSON.

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
python -m pytest                     # pipeline SNV, RoadShow, verificação dos leilões, reconciliação dos totais (test_reconciliacao.py), blocos de data/intel/ (incluindo a linguagem das notas de fonte), atualização em um comando (test_atualizar.py, test_curadoria.py) e valores conferidos (test_dados_conferidos.py); os testes com bruto exigem data/raw/ e são pulados sem ele
npm test                             # filtro, soma, busca, concessões, gráficos, paleta, leilões, Resumo, linha do tempo e CSV (JS)
npm run test:e2e                     # navegador: offline, interações, desempenho (requer Playwright; gere o HTML antes com python scripts/build.py)
```

## Estrutura

| Caminho | Conteúdo |
|---|---|
| `scripts/snv.py` | leitura do shapefile, agrupamento dos coincidentes, simplificação e codificação |
| `scripts/build.py` | monta o HTML único |
| `scripts/atualizar.py` | atualização em um comando (blocos, fontes, validação, HTML) e relatório `data/atualizacao.md` |
| `scripts/curadoria.py` | funções do relatório: diferença por bloco e lista de curadoria manual |
| `scripts/fetch_assets.py` | baixa as UFs do IBGE, o Leaflet e as fontes |
| `scripts/roadshow.py` | recorte curado (km → trechos), validação e payload das concessões |
| `scripts/intel/` | um script por domínio (`trafego`, `antt`, `carga`, `agro`, `multimodal`, `pipeline`, `estaduais` e, na v3.1, `vmda2025` e `rotas`), a junção com o SNV (`snvbase.py`), o download com manifesto (`fontes.py`) e o bloco de fontes (`fontes_bloco.py`) |
| `scripts/verificacao.py` | camada de verificação dos leilões: valida `verificacao.json` e `grupos_alias.json` e a aplica sobre as concessões (usada pelo `build.py` e por `scripts/intel/pipeline.py`) |
| `scripts/validate_palette.js` | validador de paleta do método dataviz (daltonismo, luminosidade, contraste), usado por `tests/palette.test.mjs` |
| `data/base/` | SNV e recorte das concessões congelados (`snv.json`, `conc.json`), lidos pelo build; os campos curados das concessões (estado, datas, valores) são relidos de `data/roadshow/entidades.json` a cada build |
| `data/roadshow/` | dados curados do RoadShow e relatório de cobertura |
| `data/roadshow/verificacao.json` | v4: leilões verificados, com valor, tipo e fontes de cada campo, notas e inabilitados (a hierarquia de fontes está em "Regras dos dados do RoadShow") |
| `data/roadshow/grupos_alias.json` | v4: nome impresso → grupo econômico, com motivo e fontes, para o ranking |
| `data/roadshow/verificacao.md` | v4: relatório de cobertura da verificação, gerado pelo `build.py` |
| `data/intel/` | blocos da v3 (`<bloco>.json`), `pipeline.csv`, `fontes.json` e `manifest.json` |
| `data/manifest/` | manifesto de download por domínio |
| `data/atualizacao.md` | relatório da última atualização (gerado por `scripts/atualizar.py`) |
| `tests/` | testes Python (`test_*.py`) e JS (`*.test.mjs`) |
| `src/` | template, CSS (tokens da paleta base), tokens de cor de dados (`styles-map.js`) e JS (`model`, `map`, `layers`, `ui` e uma aba por arquivo) |
| `src/leiloes-model.js` | v4: funções puras do ranking de grupos, da série de deságio e das médias, testadas com `node --test` |
| `src/csv.js` | v4: exportação CSV compartilhada por todas as tabelas |
| `src/resumo.js` | fechamento: aba Resumo (KPIs, achados e atalhos); o cálculo está em `src/leiloes-model.js` (`resumoKpis`, `resumoAchados`) |
| `data/roadshow/reconciliacao.json` | fechamento: totais que o RoadShow imprime, com página, para `tests/test_reconciliacao.py` |
| `src/selo.js` | v4: selo de origem e texto das fontes (ficha, tabela de participantes, aba Fontes) |
| `docs/paleta.md` | paleta de dados: tokens, atribuição por camada, rampas e saídas do validador |
| `docs/superpowers/` | design e plano de implementação |
