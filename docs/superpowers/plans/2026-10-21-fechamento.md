# Fechamento do projeto · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar o projeto: resolver todas as pendências do HANDOFF §6 que dependem só de nós, entregar as funcionalidades adiadas na v4 (aba Resumo, linha do tempo, pista SNV, gráficos e diagramas do RoadShow, reconciliação, fichas dos lotes sem ficha) e entregar o HTML final.

**Architecture:** Mesma arquitetura (dados → blocos → HTML único). Dados novos do RoadShow vão para `data/roadshow/mercado.json` / `regulatorio.json` com página; dados de leilão seguem a camada `data/roadshow/verificacao.json`; cálculos em módulos puros (`intel-model`, `conc-model`, `leiloes-model`) testados com `node --test`; UI por aba.

**Tech Stack:** Python 3 + pytest + PyMuPDF; JS ES2020 sem bundler, `node --test`; Playwright e2e (`--test-concurrency=1`).

**Spec:** `docs/superpowers/specs/2026-10-21-fechamento-design.md` (e, para a regra de fontes, `docs/superpowers/specs/2026-10-21-v4-verificacao-leiloes-design.md`)

## Global Constraints

- HTML único, **≤ 15 MB**, **zero requisições de rede**; nenhuma dependência nova.
- Fontes dos campos de leilão: `oficial` > `roadshow` > `imprensa` ("imprensa — não oficial"); nada sem fonte; valor do RoadShow nunca apagado.
- Ranking pelo grupo da época; aquisição posterior não junta nomes; vencedor = adjudicatário.
- Cores só dos tokens existentes (`Charts.C` Galapagos, `src/styles-map.js`); toda marca com legenda; texto nunca na cor da série.
- Português claro na interface, sem nomes de campo; datas dd/mm/aaaa; números pt-BR.
- Todo número do RoadShow carrega a página de origem (ímpar, páginas em português).
- PDF do RoadShow em `data/raw/roadshow.pdf` (fora do git; baixar do Drive id `1zStkFuN8kJSMWYRygewJw6ZI70TZMwy9` se faltar).
- Commits no branch `claude/confident-brown-k72wi2`, terminando com as linhas de atribuição.

## Review Focus

1. **Aba Resumo como página inicial** — hash vazio ou inválido abre o Resumo; `#mapa` continua abrindo o mapa e o mapa é desenhado certo ao trocar de aba (Task 9, e2e `resumo é a página inicial e o mapa abre por #mapa`).
2. **Achado do Resumo calculado de dado ausente** — se um bloco faltar, o achado some em vez de mostrar `NaN`/"undefined" (Task 9, unit `resumoAchados sem dados não quebra`).
3. **Linha do "RoadShow: …" suprimida só quando o grupo é o mesmo** — divergência real (BRVias × TPI) continua visível (Task 1, unit `rsDiverge mantém grupos diferentes`).
4. **Pista SNV de concessão sem recorte** (`entFis` vazio ou qualidade "falha") — mostra "sem recorte no SNV", nunca 0 km (Task 6, unit).
5. **Linha do tempo com lote sem data de edital** — desenha só o leilão; lote sem data nenhuma não aparece e é contado no rodapé (Task 7, unit).

---

### Task 1: Pendências da verificação dos leilões

**Files:** `data/roadshow/verificacao.json`, `data/roadshow/grupos_alias.json`, `scripts/verificacao.py`, `src/conc-model.js` (`rotuloOrigem`), `src/selo.js`, `src/mercado.js`, `src/ficha.js`, `src/leiloes-model.js`; tests `tests/test_verificacao.py`, `tests/conc-model.test.mjs`, `tests/leiloes-model.test.mjs`, `tests/e2e.test.mjs`.

**Interfaces:**
- Campo da camada aceita `"nao_se_aplica": true` (com `valor: null`, `fontes` com a fonte que explica o critério); `aplicar` passa `verif[campo].nao_se_aplica = true`; `cobertura` conta `nao_se_aplica` à parte.
- `ConcModel.rotuloOrigem(v)` → `"não se aplica (leilão por outorga)"` quando `v.nao_se_aplica`; `Selo.badge` usa a classe `selo--nao-se-aplica`.
- `LeiloesModel.rsDiverge(nomeExibido, nomeRoadShow, aliases) -> boolean` — falso quando `grupoDe` dos dois coincide; Mercado e ficha só desenham a linha "RoadShow: …" de nome quando `rsDiverge` é verdadeiro (deságio diferente sempre aparece).

- [ ] Testes RED: `test_nao_se_aplica_valida_e_aplica`, `test_cobertura_conta_nao_se_aplica`; `rotuloOrigem nao_se_aplica`; `rsDiverge mantém grupos diferentes` (BRVias × "TPI – Triunfo …" → true; "Ecorodovias Concessões e Serviços S.A." × "Ecorodovias" → false).
- [ ] Implementar; dados: Ponte São Borja deságio → `nao_se_aplica`; Régis `prazo_anos` 15 com a B3 (25) registrada como nota e como fonte declarada da divergência; trecho da Nova 381 sem "[…]"; rótulo único "4UM" (todas as aliases); cláusula "tarifa = referência ⇒ 0,00%" no trecho do edital das duas otimizações; tirar a fonte de imprensa redundante do deságio da Rota Agro; motivo do Rota do Cerrado → "consórcio liderado por" com fonte, ou "mesmo nome".
- [ ] e2e: ficha da Ponte mostra "não se aplica (leilão por outorga)"; linha de participantes da Rotas Gerais sem "RoadShow: …" de mesmo grupo; Transbrasiliana mantém "RoadShow: TPI…".
- [ ] `python -m pytest -q && npm test && python scripts/build.py && npm run test:e2e` → verde. Commit.

### Task 2: Menores de código da v4

**Files:** `scripts/verificacao.py`, `src/leiloes-model.js`, `src/charts.js`, `src/csv.js`, `src/mercado.js`, `src/conc-model.js`; tests correspondentes.

- [ ] `verificacao.py`: `_fmt` não arredonda texto/tarifas; `validar` devolve erro legível (não exceção) para `campos`/`notas`/`inabilitados` não-dicionário e para `ano`/`lote`/`concorrentes` malformados; URL `http:` sem host rejeitada. Testes RED→GREEN.
- [ ] `anoDecimal` rejeita mês 1–12 / dia fora do mês; rótulo da série usa "—" para vencedor nulo; eixo x do `dotsSvg` sempre rotula o último ano; asserção negativa do teste fortalecida; troca de classe do eixo y sem `replace` frágil (passar a classe ao `yAxis`).
- [ ] `csv.js`: coleta de links a partir do clone (sem `<details>`); `queueMicrotask` removido; teste DOM do filtro de linhas ocultas (jsdom não existe: teste no e2e escondendo uma linha antes de exportar).
- [ ] `mercado.js`: `esc(fmtData(...))`; seletores de/até sincronizam após troca; `SERIE_NOTA` só quando há ponto limitado; teste negativo do desempate por deságio em `participantesExibidos`.
- [ ] Suítes verdes. Commit.

### Task 3: Menores antigos (mapa, formatação, dados, textos)

**Files:** `src/map.js`, `src/layers.js`, `src/ui.js`, `src/styles.css`, `src/intel-model.js`, `src/cargas.js`, `scripts/intel/multimodal.py`, `scripts/intel/antt.py`, `data/intel/*.json` regenerados só pelos scripts (ou correção pontual documentada se o bruto faltar), textos em `src/ficha.js`/`src/ui.js`/`src/projetos.js`, `docs/superpowers/specs/2026-10-20-v3.1-rotas-paleta-vmda2025-design.md`.

- [ ] Legenda reavalia o recolhimento no `resize` (debounce); rótulos GF e SR sem sobreposição; legenda do Tráfego não cobre o leste do Brasil em 1366×768 (e2e em 1366×768); `_animatingZoom` isolado numa função `zoomAnimando(map)` com comentário e teste e2e do enquadramento repetido (ou API pública se existir).
- [ ] `fmtPeriodo` trata `AAAA-MM-DD` e intervalos ISO (unit); tipo dos portos com rótulo em português (dicionário em `intel-model`, unit); nomes dos fretes sem artefatos (limpeza no script ou no front, unit com exemplos reais).
- [ ] Coordenada do estaleiro Keppel Fels corrigida com fonte; VMD 0 de praça vira `null` (script + teste pytest).
- [ ] Textos: trecho planejado (PLA) com valores ganha explicação; "carteira MT v40" → texto claro; "≤ 5%" da ficha explicado em linguagem simples; linha "relatórios 2023–2025" da spec v3.1 → 2024–2025.
- [ ] Suítes verdes. Commit.

### Task 4: Gráficos e diagramas do RoadShow que faltam

**Files:** `scripts/extract/` (novo `roadshow_v5.py` ou extensão do extrator de mercado), `data/roadshow/mercado.json` (`abdib`, `debentures`, `pavimento`, `comparativos`), `data/roadshow/regulatorio.json` (`diagramas`), `src/mercado.js`, `src/regulatorio.js`, `src/charts.js` (se faltar forma), tests `tests/test_roadshow.py`, `tests/e2e.test.mjs`.

- [ ] Extrair do PDF, com página: ABDIB p. 39 (público e privado, R$ bi, 2010–2024); debêntures incentivadas para rodovias p. 77 (série anual, R$ bi, base fev/2025); estado do pavimento p. 35 (participações %); comparativos pp. 41 e 45 (valores base × comparado, variação). Testes pytest pinam 3 valores de cada série contra o PDF e que somas/variações impressas fecham (tolerância de arredondamento).
- [ ] Mercado: cartões "Investimento em infraestrutura (ABDIB)", "Debêntures incentivadas para rodovias", "Comparativos público × privado"; Regulatório (ou Mercado): "Estado do pavimento". Cada um com "Fonte: RoadShow 2026-2027, p. N".
- [ ] Regulatório: dois diagramas SVG (fluxo do estudo ao leilão, p. 61, com a decisão "deságio acima de 18% → aporte de recursos vinculados" e as duas redações da p. 61 × pp. 65/73; fluxo de financiamento pp. 73–77), cores Galapagos, legenda, `role="img"` com título e descrição.
- [ ] e2e: cartões e diagramas presentes, sem `NaN`. Suítes verdes; build ≤ 15 MB. Commit.

### Task 5: Reconciliação do RoadShow como teste

**Files:** `tests/test_reconciliacao.py`, `data/roadshow/reconciliacao.json` (totais declarados com página).

- [ ] Testes que recalculam dos dados curados e comparam com o declarado: km/capex/opex dos 39 contratos (pp. 3 e 5), grupos (p. 17), 25 leilões (p. 97), programa por ano (p. 125), média de deságio impressa (pp. 25/27). Divergências conhecidas viram casos `xfail` com o motivo (não silenciados). Tolerância: 1 unidade da última casa impressa.
- [ ] `python -m pytest -q` verde. Commit.

### Task 6: Pista pelo SNV na ficha e no cartão da concessão

**Files:** `src/conc-model.js` (`pistaSNV`), `src/ficha.js`, `src/ui.js`; tests `tests/conc-model.test.mjs`, e2e.

**Interfaces:** `ConcModel.pistaSNV(conc, snv, idx) -> {km, duplicada, obraDup, simples, naoPav, semRecorte: boolean}` (km pela extensão dos físicos de `conc.entFis[idx]`, sem dupla contagem; categorias pela situação do registro principal do físico).

- [ ] Unit RED: soma bate com `km_mapeado`; concessão sem recorte → `semRecorte: true` e nenhum número.
- [ ] Ficha: bloco "Pista no SNV" (km e % de cada categoria, rótulo "pelo recorte curado; aproximado quando o recorte é aproximado"); cartão do trecho no mapa: uma linha resumo.
- [ ] e2e numa concessão conhecida. Suítes verdes. Commit.

### Task 7: Linha do tempo de editais e leilões 2026–2027

**Files:** `src/conc-model.js` ou `src/intel-model.js` (`linhaDoTempo`), `src/charts.js` (`timelineSvg`), `src/projetos.js`; tests unit + e2e.

**Interfaces:** `linhaDoTempo(conc, pipeline) -> [{nome, id, edital: 'AAAA-MM-DD'|null, leilao: 'AAAA-MM-DD'|'AAAA-MM', status}]` para itens federais e estaduais com leilão de 2026 em diante; `Charts.timelineSvg(rows, {de, ate})` — círculo vazado = edital, losango = leilão, linha entre os dois, cor por status com legenda; mês sem dia desenhado no meio do mês e marcado "(mês)".

- [ ] Unit: ordenação por data de leilão; sem edital desenha só o leilão; sem data nenhuma fica fora e é contado. 
- [ ] Projetos > Pipeline: cartão "Linha do tempo: editais e leilões 2026–2027", nome clicável abre a ficha. e2e. Suítes verdes. Commit.

### Task 8: Fichas dos lotes sem ficha no RoadShow (pesquisa)

**Files:** `data/roadshow/verificacao.json` (campos novos de escopo), `scripts/verificacao.py` (campos), `src/ficha.js`; tests.

- [ ] Ampliar a camada com campos de escopo de contrato: `pracas` (int), `duplicacao_km` (número), `tir_regulatoria` (texto, ex. "8,47% a.a. real"), sem mudar a regra de fontes; validar tipos (RED→GREEN).
- [ ] Pesquisar, para os leilões de 2023–2025 sem ficha no RoadShow, na página da concessão/projeto da ANTT, edital e PER: praças, duplicação e TIR/WACC regulatória. Registrar só o que for lido no documento; o resto fica ausente.
- [ ] Ficha mostra esses campos com selo. Suítes verdes; build. Commit.

### Task 9: Aba Resumo (página inicial)

**Files:** `src/resumo.js` (novo), `src/tabs.js` (`TABS` começa com `['resumo','Resumo']`; padrão `resumo`), `src/template.html` (`<section class="page" data-tab="resumo" id="page-resumo">`), `src/main.js`, `scripts/build.py` (`JS_FILES`), `src/intel-model.js` ou `src/leiloes-model.js` (`resumoKpis`, `resumoAchados`), `src/styles.css`; tests unit + e2e (ajustar os que assumem o Mapa inicial).

**Interfaces:**
- `resumoKpis(conc, intel, snv) -> [{rotulo, valor, unidade, fonte}]` — km da malha federal, km concedidos, leilões 2023–2027 (feitos/previstos), capex+opex do programa, deságio médio exibido, nº de grupos vencedores.
- `resumoAchados(conc, intel) -> [{titulo, texto, formula, fonte}]` — ao menos: concorrência × deságio (1 proponente vs 2+), leilões acima de 18%, deságios 2007 × 2023–26, concentração por grupo (ranking), calendário dos próximos leilões, opex na carteira 2027. Cada achado só entra se os dados existirem.

- [ ] Unit RED: valores dos KPIs com fixture; `resumoAchados sem dados não quebra`.
- [ ] UI: KPIs, achados com "Como foi calculado" (`<details>`) e fonte, atalhos para as abas; aviso "análise com dados públicos; não é recomendação".
- [ ] e2e `resumo é a página inicial e o mapa abre por #mapa`; ajustar testes do v2 sobre aba inicial/hash inválido. Suítes verdes. Commit.

### Task 10: Documentação, build final e entrega

**Files:** `README.md`, `docs/HANDOFF.md`, `mapa-rodovias.html`.

- [ ] README: v4 final (aba Resumo, linha do tempo, pista SNV, gráficos e diagramas novos, reconciliação, fichas enriquecidas).
- [ ] HANDOFF: estado final; §6 reduzido a "O que depende de você" (PNCT, LAI, ANTAQ, malha estadual 2024, editais estaduais, reclassificação por esfera) e itens novos com motivo; contagens de testes.
- [ ] Três suítes e build (≤ 15 MB). Commit e push do branch.
