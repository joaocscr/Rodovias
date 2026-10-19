# Mapa de Rodovias v2: Estudo das Concessões — Design

Data: 2026-10-19 · Base: v1 (`docs/superpowers/specs/2026-10-19-mapa-rodovias-design.md`, já em `main`)
Nova fonte: **RoadShow 2026-2027**, Ministério dos Transportes / SNTR, v40, atualizado em 14/10/2026 — `RoadShow-PT-EN (v40) 2026.10.14 [Impressão].pdf` (Drive do usuário, pasta "Claude Projects / Rodovias", fileId `1zStkFuN8kJSMWYRygewJw6ZI70TZMwy9`, 156 páginas).

## 1. Intenção

Transformar o mapa da malha federal num **ambiente de estudo das concessões rodoviárias federais**, com tudo o que o RoadShow traz de mercado, ligado aos trechos do mapa. Usos (todos, segundo o usuário): escolher quais leilões estudar a fundo, comparar retornos e indicadores entre projetos, acompanhar mercado e concorrência.

Continua valendo da v1: arquivo HTML único, offline, design system Galapagos estrito (só as 5 cores, 8 px, texto ≥ 14 px), foco em desktop, só em português.

## 2. Metas, não-metas, anti-metas

**Metas**
- Ligar cada contrato vigente e cada projeto do programa aos trechos do SNV com **recorte curado** (só o trecho concedido, não a BR inteira na UF).
- Navegação em **abas**: Mapa | Projetos | Mercado | Regulatório. A **ficha do projeto** abre a partir de qualquer aba.
- Todos os dados extraíveis do RoadShow, com a **página de origem** guardada nos dados.
- Divergências do PDF: usar a ficha do projeto (fonte mais detalhada e recente) e mostrar um **ícone de aviso** com os valores alternativos e as páginas.

**Não-metas**
- Exportar CSV, imprimir ficha, número com fonte no hover, versão em inglês (o usuário recusou os extras). A página de origem fica nos dados e aparece só nos avisos de divergência e no rodapé da ficha ("Fonte: RoadShow p. 103").
- Dados que o PDF não tem: localização de praças, tarifa por praça, fim de contrato, VDM por trecho. Não inventar nem buscar fora.
- Atualização automática a partir de novas versões do PDF. O fluxo é: reextrair e revisar os JSON.

**Anti-metas**
- Número no HTML diferente do PDF sem aviso.
- Trecho pintado como concedido onde não é (é melhor ficar sem marcação e sinalizado como "trecho não mapeado" do que pintar errado).
- Perder a performance da v1 (filtro < 200 ms, pan/zoom fluido).
- Cores fora da paleta.

## 3. Conteúdo do RoadShow (inventário)

Usar **só as páginas ímpares (PT)**. As pares (EN) convertem para milhas e US$ e não são tradução literal. Números de página = páginas do PDF (o rodapé impresso difere).

| Págs | Conteúdo | Destino |
|---|---|---|
| 3–5 | 39 contratos vigentes: concessionária, trecho (BRs/UFs), assinatura (e aditivo nas otimizações), km, capex, opex, capex+opex (R$ bi dez/2024); cor da linha = ano do leilão (só na imagem) | Entidades + mapa + Projetos |
| 7–9 | Leilões por ano 1993–2030 | Mercado |
| 11–15 | Participantes dos leilões 2007–2026 (ano, lote, vencedor, demais proponentes com %) | Mercado + ficha |
| 17–19 | Km, capex, opex por grupo líder | Mercado |
| 21 | Concorrência 2023–26 (18 grupos, 14.962 km…) | Mercado |
| 23–27 | Vencedores dos 25 leilões; concorrentes × deságio; faixas de deságio | Mercado |
| 29 | Diagnóstico 2022/2026/2027/2030 | Mercado |
| 33 | 11 otimizações contratuais (Portaria 848/2023): km, capex+opex, prorrogação, relicitação, status | Regulatório + entidades |
| 35–55 | Contexto: pavimento, gestão direta × privada 2011–26, investimentos públicos/privados 1995–2029, indicadores agregados dos 40 leilões | Mercado |
| 57–61 | Estrutura do MT, estruturadores, fluxo de projeto | Regulatório |
| 63–77 | Portaria 995/2023 (modelo, matriz de risco, aporte, bandas de demanda, proteção cambial), garantias, BNDES, debêntures | Regulatório |
| 79–85 | Sustentabilidade (Portaria 622/2024), segurança viária, conectividade | Regulatório |
| 87–91 | Rotas de integração sul-americana; corredores logísticos (esquemáticos) | Regulatório (texto/legenda; sem mapa) |
| 93–97 | Carteira 2023–26; **tabela dos 25 leilões (p97)**: km, capex, opex, data do leilão, nº de participantes, vencedor, assinatura, início da operação, deságio | Entidades + Projetos |
| 99–129 | Carteiras 2026 e 2027, resumos, cronogramas (p117, p153), 27 estudos pós-2027 (p121) | Entidades + Mercado |
| 103–115, 131–151 | **18 fichas de projeto** (7 de 2026, 11 de 2027) | Ficha + Projetos |

### 3.1 Campos da ficha de projeto (os 18)
Identificação (título, BRs/UFs, nome da rota, selo de status/deságio, descrição); STATUS e "Atualizado em"; trecho (cidade inicial–final); extensão; capex e opex (nominal e VPL); WACC; empregos estimados; TKM (PS) em R$/km; categoria de carga predominante; km de duplicação, faixa adicional, contorno, marginais; obras relevantes (texto); praças a implantar, praças existentes, pórticos free flow; CAPEX/km, OPEX/km, custo de manutenção, custo de duplicação/km, fluxo de caixa acumulado, receita bruta (nominal e VPL), CAGR de tráfego, CAPEX/Receita (VPL); datas de edital e leilão, ciclo de obras, garantia da proposta, capital social mínimo, garantia de execução, VEQ/dia/praça; **CAPEX anual por ano de concessão**; data-base.

Variantes: Régis Bittencourt (p107) tem campos próprios (macrodrenagem, iluminação de serra, túnel, valor de saída de R$ 120 mi). Transbrasiliana, Planalto Sul, Açu e Centro-Sul estão "Ficha em revisão", com campos "-". Campo ausente vira `null` e é exibido como "—". Campos extras de uma ficha entram numa lista genérica `extras: [{rotulo, valor}]`.

### 3.2 Divergências já conhecidas (lista não exaustiva; o builder deve registrar as que achar)
- Rota dos Sertões: capex 6,27 / opex 5,08 (p97) × 4,13 / 4,40 (ficha p105).
- Lote 3: capex+opex 17,05 (p5) × 9,87 + 6,04 = 15,91.
- Assinaturas: Rota Agro 20/11/2025 × 03/03/2026; Lote 5 06/02 × 16/03/2026; Sertaneja 20/02 × 03/03/2026 (p5 × p97).
- Lote 5: BR-163/368/467 (p5) × BR-158/163/369/467 (p23).
- Deságio máximo 25,9% (p27) × 26,60% (p97); Rota Agro 5 participantes (p97) × 7 (p23).
- Centro-Sul Baiano 783,23 km (p151) × 783,6 (p127); totais de 2027 e dos 25 leilões não fecham com as somas.
- p5 linha 21 (Rota Verde Goiás): o texto extraído intercala dados ocultos da linha 1. O correto (conferido na imagem) é 426,20 km | 4,03 | 2,84 | 6,87.
- Edital do Arco Norte "17/07/2025" e do Norte Catarinense "Agosto/2026" com leilão em nov/2027: provável erro de digitação. Mostrar como está, com aviso.

**Regra:** valor exibido = ficha do projeto se existir; senão p97 (para os 25 leilões); senão p3–5. Toda diferença entre fontes vira um registro em `divergencias` (ver §4.1), mesmo quando a regra decide.

## 4. Dados

### 4.1 Arquivos curados (no repositório, revisáveis à mão)
Pasta `data/roadshow/`, gerada por script de extração e **revisada à mão** (o PDF tem quebras de texto; a revisão é parte do trabalho). Cada número carrega a página de origem.

- `entidades.json`: uma entrada por **concessão ou projeto** (unidade que aparece no mapa e na tabela):
  - `id` (slug estável, ex. `rotas-gerais`), `nome`, `nome_contrato` (concessionária, quando houver), `brs` (lista), `ufs`, `trecho_texto` (como no PDF), `trecho_cidades` (inicial, final), `estado` (ver §5.1), `ano_programa` (2023–2027 ou null), `tipo` (`nova` | `otimizacao` | `delegada`), `estruturador`, `grupo_vencedor`, `km`, `capex`, `opex`, `capex_vpl`, `opex_vpl`, datas (`leilao`, `edital`, `assinatura`, `assinatura_aditivo`, `inicio_operacao`), `participantes`, `desagio`, `status_texto`, `atualizado_em`, `ficha` (objeto com os campos de §3.1, ou null), `fontes` (mapa campo → página), `divergencias` (`[{campo, exibido, alternativas: [{valor, pagina}], nota}]`), `relaciona` (ids relacionados, ex. contrato vigente que uma otimização substitui).
  - Contratos vigentes que são também um dos 25 leilões do programa são **uma** entidade (ex. EPR Iguaçu = RIPR Lote 6).
  - Otimizações em estudo para 2027 (Transbrasiliana, Planalto Sul) e as agendadas para 2026 (Arco Norte, Pequi, Régis) são entidades `otimizacao` com `relaciona` apontando para o contrato vigente atual, que continua existindo como entidade própria.
- `estudos_pos2027.json`: as 27 BRs/UFs da p121 (`{brs, ufs, possivel_2027: bool, pagina}`).
- `mercado.json`: séries para os gráficos (leilões por ano, participantes 2007–26, concorrentes × deságio, grupos, gestão direta × privada, investimentos, indicadores agregados, diagnóstico), cada série com `fonte` (página).
- `regulatorio.json`: conteúdo textual estruturado por tema (seções com título, parágrafos curtos e tabelas pequenas) e a tabela das 11 otimizações (p33).
- `trechos.json`: o **recorte curado** (ver §4.2): para cada entidade, `[{br, uf, km_ini, km_fim}]` + `qualidade` (`ok` | `aproximado` | `nao_mapeado`) + `nota`.

### 4.2 Recorte curado (entidade → trechos do SNV)
- Para cada entidade, o builder define intervalos de km por (BR, UF) usando o `trecho_texto` e as cidades do PDF, as localidades `ds_local_i/f` do SNV e, para contratos já assinados, a administração `Concessão Federal` do SNV como pista (o SNV 202607A pode ainda não refletir contratos muito recentes).
- **Validação automática** no build: Σ `vl_extensa` dos trechos físicos do SNV cobertos × `km` declarado. Diferença ≤ 5% ou ≤ 10 km → `ok`; até 20% → `aproximado`; acima disso, o build falha, a menos que a entidade esteja marcada com `qualidade` e `nota` explicando (ex. delegadas e lotes do PR incluem rodovias estaduais fora do SNV federal; nesse caso compara-se só a parte federal, se o PDF permitir, ou marca-se `aproximado` com nota).
- O build imprime um relatório de cobertura (entidade, km declarado, km mapeado, diferença, qualidade) e o grava em `data/roadshow/cobertura.md`, commitado, para o usuário revisar.
- Um trecho físico do SNV pode pertencer a mais de uma entidade (contrato vigente + otimização futura). O mapa usa a **prioridade de estado** (§5.1). O cartão e a ficha listam todas.
- Estudos pós-2027: BR+UF inteira, sempre `aproximado` (o PDF não dá mais que isso).

### 4.3 Extração
Script `scripts/extract_roadshow.py` gera rascunhos a partir do texto (`pdftotext -layout` por página) para as tabelas p3–5, p97 e as 18 fichas. O resultado é revisado e salvo nos JSON curados. O script não roda no build. O build lê só os JSON, para não depender do PDF nem do `pdftotext`. O PDF (33 MB) não vai para o repositório; vai para `data/raw/` (gitignored), com o README explicando a origem.

Testes de dados (pytest) conferem: 39 contratos; 40 projetos do programa (2+7+13+7+11 por ano; a contagem por ano vem de p95/101/123–129); totais declarados × somas (com as divergências conhecidas registradas, não escondidas); todo número de entidade com página em `fontes`; cada entidade com recorte (`trechos.json`) ou `nao_mapeado` explícito.

## 5. Interface

### 5.1 Estados da concessão (camada do mapa)
| Estado | Definição | Estilo (só paleta) |
|---|---|---|
| Leilão agendado 2026 | 4 entidades com leilão nov–dez/2026 | Bright Blue `#0071BB`, grosso, com halo Bright Blue 30% |
| Projeto 2027 | 11 entidades de 2027 | Bright Blue, médio, tracejado |
| Contrato do programa 2023–26 | 25 leilões realizados (inclui 2026 já leiloados) | Deep Blue `#183C80`, grosso |
| Contrato vigente anterior | Contratos vigentes leiloados antes de 2023 | Deep Blue, médio, com contorno Spacial Grey 35% |
| Estudo pós-2027 | 27 estudos (BR+UF inteira) | Light Grey `#525254`, pontilhado |
| Sem concessão | resto da malha | Light Grey, fino, 50% de opacidade |

Prioridade quando um trecho tem mais de um estado: agendado 2026 > projeto 2027 > programa 2023–26 > vigente anterior > pós-2027. (Decisão do designer: o mapa privilegia o que está por vir. Cartão e ficha mostram todas as entidades do trecho.)

O mapa ganha um **seletor de modo de cor**: "Situação física" (estilos da v1) | "Concessões" (estilos acima, **padrão na v2**). A legenda acompanha o modo.

### 5.2 Abas
Barra de abas logo abaixo da barra superior (ou integrada a ela): **Mapa | Projetos | Mercado | Regulatório**. Troca sem recarregar, preservando o estado de cada aba. A aba ativa fica na URL via `#hash` (`#mapa`, `#projetos`, `#ficha/rotas-gerais`…), para "voltar" funcionar. Funciona em `file://`.

**Mapa** (v1 + concessões)
- Novos filtros: Estado da concessão; Projeto/contrato (lista com busca); Ano do programa.
- Busca passa a encontrar também nomes de projeto e concessionária ("Rotas Gerais", "EPR", "Arco Norte").
- O painel de números ganha "Por estado da concessão" (km).
- Cartão do trecho: novo bloco "Concessão" com as entidades do trecho (nome, estado, data-chave) e botão **Ver ficha**.

**Ficha do projeto** (painel grande sobre a aba atual, ou rota `#ficha/<id>`)
- Cabeçalho: nome, BRs/UFs, estado (selo), data-chave (leilão ou assinatura), deságio se houver; botão "Ver no mapa" (vai à aba Mapa com o projeto realçado e enquadrado).
- Blocos: Resumo (km, capex, opex nominal e VPL, WACC, TKM, empregos); Obras (duplicação, faixa, contorno, marginais, obras relevantes); Pedágio (praças a implantar e existentes, pórticos); Indicadores econômicos; Leilão e garantias; **Gráfico de CAPEX anual** (barras por ano de concessão); Cronograma (marcos de p117/p153 quando houver); Participantes do leilão (quando houver, p11–15/p97); Entidades relacionadas; Trecho no mapa (qualidade do recorte); Fonte (páginas).
- Ícone de aviso ao lado de cada campo com divergência: tooltip/popover com os valores alternativos e as páginas.
- Entidades sem ficha (contratos vigentes) mostram os campos que tiverem, sem blocos vazios.

**Projetos (comparador)**
- Tabela única com as entidades (contratos vigentes + projetos do programa; estudos pós-2027 numa seção separada abaixo, por não terem números).
- Colunas padrão: Nome, BRs/UFs, Estado, Data-chave, km, Capex, Opex, Capex/km, WACC, TKM, Deságio, Participantes, Vencedor. Seletor de colunas para incluir qualquer campo numérico da ficha.
- Ordenação por qualquer coluna; filtros por estado, UF, ano do programa, tipo; busca por nome.
- Linha de totais da seleção (km, capex, opex).
- Clicar na linha abre a ficha. Ícone "ver no mapa" por linha.

**Mercado** (gráficos em SVG próprio, sem biblioteca, só paleta)
- Leilões por ano 1993–2030 (barras; realizados × previstos por estilo).
- Concorrentes × deságio por leilão (dispersão) e faixas de deságio.
- Participantes por leilão 2007–26 (tabela com vencedor e demais proponentes).
- Grupos econômicos: km, capex, opex por grupo (barras horizontais ordenáveis).
- Malha sob gestão direta × privada 2011–26 (linhas ou áreas).
- Investimentos públicos × privados (barras empilhadas, só azuis/cinzas).
- Indicadores agregados dos 40 leilões (blocos de números) e diagnóstico 2022/2026/2027/2030.
- Cada gráfico com título, unidade, fonte (página) e tooltip com o valor exato.

**Regulatório**
- Seções navegáveis (índice à esquerda): Modelo regulatório (Portaria 995), Matriz de riscos e mitigação, Garantias e capital, Financiamento (BNDES, debêntures), Otimizações contratuais (tabela das 11), Sustentabilidade e segurança viária, Estruturadores e fluxo de projeto, Estudos pós-2027 (lista, com "ver no mapa" para BR+UF).
- Texto resumido fiel ao PDF, com a página de cada seção. Sem interpretação jurídica própria.

## 6. Decisões técnicas (do designer, ajustáveis pelo builder)
- Mesmo pipeline da v1: `scripts/build.py` passa a ler também `data/roadshow/*.json`, valida o recorte e embute `window.CONC` (entidades, trechos resolvidos para ids de trechos físicos, mercado, regulatório).
- O recorte é resolvido **no build** em lista de ids de trechos físicos por entidade, e o inverso (trecho físico → entidades) é guardado. O navegador não recalcula interseções de km.
- JS separado por responsabilidade: `src/conc-model.js` (puro: estados, prioridade, filtros de concessão, ordenação e totais do comparador), `src/tabs.js` (roteamento por hash), `src/ficha.js`, `src/projetos.js`, `src/charts.js` (primitivas SVG: barras, barras horizontais, dispersão, linhas), `src/mercado.js`, `src/regulatorio.js`. `ui.js` e `map.js` estendidos (modo de cor, filtros novos, bloco de concessão no cartão).
- Formatos: R$ bi com 2 casas (`R$ 7,34 bi`), percentuais com 2 casas (`19,60%`), datas `dd/mm/aaaa`, mês/ano quando só isso existe (`jun/2027`).
- Tamanho: orçamento do HTML continua ≤ 15 MB (os dados novos são pequenos).
- Testes: pytest (dados e recorte), `node --test` (conc-model), Playwright e2e (abas, ficha, comparador, modo de cor, offline).

## 7. Critérios de aceite
- 39 contratos + 40 projetos do programa + 27 estudos presentes; contagem por ano do programa = 2/7/13/7/11.
- Toda entidade do programa e todo contrato com `trechos.json` `ok`/`aproximado`, ou `nao_mapeado` com nota; `cobertura.md` gerado.
- Ficha da Rotas Gerais mostra 734,90 km, capex R$ 7,34 bi, WACC 13,76%, 9 praças a implantar e o gráfico de capex anual; a da Rota dos Sertões mostra o aviso de capex (4,13 na ficha × 6,27 na p97).
- Comparador ordena por Capex/km e por Deságio; os totais da seleção batem com a soma das linhas.
- Modo "Concessões": clicar num trecho da BR-381/MG mostra Nova 381 e Fernão Dias conforme o km; "Ver ficha" abre a ficha certa; "Ver no mapa" volta e enquadra.
- Abas funcionam com voltar/avançar do navegador em `file://`.
- Continua offline (zero requisições externas), sem erros de console, filtro < 200 ms, checklist da marca cumprido.

## 8. Deixado ao builder
Layout fino de cada aba e da ficha; quais campos da ficha entram como colunas padrão além das listadas; forma exata de cada gráfico, dentro do que §5.2 lista; texto dos resumos regulatórios (fiel ao PDF); método do script de extração; tolerâncias exatas da validação do recorte, se as de §4.2 se mostrarem irreais com os dados (registrar a decisão).
