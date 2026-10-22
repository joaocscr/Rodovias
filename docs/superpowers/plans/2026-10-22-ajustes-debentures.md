# Ajustes de leitura, consórcios, glossário e debêntures · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar cada tela autoexplicativa para quem nunca viu as fontes, corrigir os pontos da aba Mercado, criar a base de consórcios, o Glossário e a página de debêntures de infraestrutura de transporte, e retirar do projeto as menções à empresa do usuário e às versões.

**Architecture:** Mesma arquitetura (dados curados e blocos → HTML único). Novos dados curados: `data/roadshow/consorcios.json`, `data/glossario.json`, `data/debentures/emissores.json`; novo bloco `data/intel/debentures.json` gerado por `scripts/intel/debentures.py` a partir das planilhas do usuário (`data/raw/debentures/`, fora do git) e de séries públicas (Banco Central, Tesouro). Novas abas: Glossário e Debêntures. Cálculos em módulos puros testados.

**Tech Stack:** Python 3 + pytest + openpyxl; JS ES2020 sem bundler, `node --test`; Playwright e2e (`--test-concurrency=1`).

**Spec:** `docs/superpowers/specs/2026-10-22-ajustes-debentures-design.md`

## Global Constraints

- HTML único, **≤ 15 MB**, **zero requisições de rede**; dependências: só o que já está em `requirements.txt` (openpyxl já está).
- **Atualização fácil:** nada de dado digitado no código da interface; nenhum `data/intel/*.json` editado à mão; e2e compara com o modelo; todo dado novo entra no `scripts/atualizar.py` e no relatório de curadoria quando pede ação manual.
- **Fontes:** nenhum número sem fonte; imprensa sempre "imprensa — não oficial"; valor do RoadShow nunca apagado.
- **Critério de clareza (do usuário):** um título/subtítulo é necessário se a resposta a "um leitor que nunca viu os materiais de base entenderia o que a informação representa e ao que faz referência?" for não. Contexto mínimo, uma linha, sem excesso.
- **Sem versões no HTML:** nenhuma menção a versões do projeto (v1…v4, "bases da v1/v2", "fontes da v3") no texto visível nem no código embutido; o RoadShow é citado pela edição ("edição de 14/10/2026"), não por "v40".
- **Sem "Galapagos"/"Galápagos"** em nenhum arquivo do repositório nem no HTML, **exceto** em registros públicos de leilão (nomes de consórcio em `data/roadshow/*.json`, `data/base/conc.json`, `data/roadshow/verificacao.md` e no bloco/HTML gerado a partir deles). Histórico do Git não é reescrito.
- **Debêntures:** universo = emissores de rodovias e infraestrutura de transporte (setor "Transporte" das telas: rodovias, ferrovias, portos e terminais, aeroportos, hidrovias, metrô). Aba XP da planilha de negócios = **intenções**, à parte por padrão, com opção na tela para **ver somado** como se fossem negócios (rotulado). **Só agregados** no bloco e no HTML (por emissor, subsetor e dia) e o último negócio de cada papel; planilhas fora do git; testes com arquivo sintético versionado.
- Português claro, datas dd/mm/aaaa, números pt-BR; cores só dos tokens existentes (renomeados para nomes neutros); toda marca com legenda.
- Commits no branch `claude/confident-brown-k72wi2`, com as linhas de atribuição.

## Review Focus

1. **Emissor das planilhas sem classificação** em `emissores.json` — não entra na página (fora do universo), é listado no relatório de curadoria; nunca some em silêncio nem quebra o build (Task 8, `test_emissor_sem_classificacao_vai_para_curadoria`).
2. **NTN-B do dia indisponível** (Tesouro fora do ar, feriado, papel além do último vencimento) — spread "—", nunca extrapolação nem zero (Task 8, `test_spread_sem_curva_do_dia`).
3. **Opção "ver somado" ligada** — todos os números e gráficos afetados mudam juntos e o rótulo diz "negócios + intenções"; desligada volta exatamente aos negócios (Task 9, e2e `alternar somado`).
4. **Grupo sem consórcio na base** (empresa que disputou sozinha) ou consórcio sem composição localizada — a ficha abre e diz "composição não localizada"/"participou sozinho", nunca vazia (Task 7, e2e).
5. **Termo do glossário citado numa aba e ausente do `glossario.json`** — teste que falha listando o termo (Task 4, `test_links_do_glossario_existem`).

---

### Task 1: Retirar menções à empresa e às versões

**Files:** todos os arquivos que `git grep -n -i "galapagos\|galápagos"` lista (fora as exceções da Global Constraints) — README.md, docs/*, src/styles.css, src/styles-map.js, src/charts.js, tests/charts.test.mjs, scripts/intel/rotas.py, scripts/extract/entidades_parte_a.py; comentários e textos com versões em src/*.js e src/template.html; `data/intel/fontes.json` via `scripts/intel/fontes_bloco.py` (nome da base do RoadShow sem "v40"); `src/fontes.js` (títulos "Bases da v1/v2", "Fontes da v3"); Test: `tests/test_sem_mencoes.py` (novo), `tests/charts.test.mjs`.

**Interfaces:** Produces: nomes neutros dos tokens de cor (ex.: constante `C` / `COLORS` com chaves inalteradas e comentários sem a marca); o teste `test_sem_mencoes.py` usado pelas demais tarefas.

- [ ] Write `tests/test_sem_mencoes.py`: (a) `git grep -n -i -E "galapagos|galápagos"` só retorna caminhos da lista de exceções (`data/roadshow/`, `data/base/conc.json`); (b) `mapa-rodovias.html` só contém "Galapagos" dentro dos dados embutidos (`window.CONC=`), nunca no CSS/JS; (c) o HTML não contém `/\bv(1|2|3|4)(\.\d)?\b/` nem "v40" fora de URLs. Run → FAIL.
- [ ] Renomear/limpar: tokens e comentários "Galapagos" → "paleta base"; docs e README reescritos sem a marca; comentários `// v3:`/`// v4:` etc. reescritos sem versão; aba Fontes sem títulos com versão (as seções passam a "Bases do painel", "Fontes de dados"); `fontes_bloco.py` grava "RoadShow 2026-2027, Ministério dos Transportes (edição de 14/10/2026)". `conc.versaoRoadshow` deixa de aparecer em texto visível (ficha usa a edição).
- [ ] `python -m pytest -q`, `npm test`, `python scripts/atualizar.py`, e2e → verde. Commit `chore: remove company and version mentions from the project`.

### Task 2: Aba Mercado — typo, "Outros" por último, tooltip, diagnóstico por ano, títulos

**Files:** `src/mercado.js`, `src/charts.js` (se o tooltip de `hbars` precisar de `detail`), `src/leiloes-model.js` ou novo `src/mercado-model.js` (funções puras), `data/roadshow/mercado.json` (só textos de subtítulo/nota se forem curados), tests `tests/charts.test.mjs`, `tests/mercado-model.test.mjs` (novo), `tests/e2e.test.mjs`.

**Interfaces:** Produces `MercadoModel.diagnosticoPorAno(conc, intel) -> [{ano, contratos, km, valor, invest_executado_acum, fontes: {campo: texto}, previsto: bool}]` e `MercadoModel.grupoOutrosPorUltimo(rows) -> rows`.

- [ ] Unit RED: `plural` correto ("1 concorrente (1 leilão)", "2 concorrentes (5 leilões)"); `grupoOutrosPorUltimo` põe a linha cujo nome começa por "Outros" no fim, preservando a ordem das demais; `diagnosticoPorAno` traz 2022, 2023, 2024, 2025 (contratos = entidades com assinatura até 31/12 do ano e estado de contrato; km = `gestao[ano].privada_km` da p. 37; investimento executado acumulado = soma da série da ANTT até o ano), 2026, 2027 e 2030 da p. 29 marcados com a fonte, e **não** traz 2028/2029.
- [ ] Implementar. Barras de grupos com "Outros" por último (ordenação `sort` respeita a regra). Tooltip do gráfico de investimento por grupo mostra "capex X + opex Y" (corrigir `hbarsSvg` para usar `detail` no `<title>`; teste unitário). Cartão do diagnóstico renderiza a tabela de `diagnosticoPorAno` com a fonte de cada linha e a nota "2028 e 2029: nenhuma fonte publica esses anos". Títulos/subtítulos da aba pelo critério de clareza (ex.: "Indicadores dos 40 leilões do programa federal de concessões rodoviárias 2023–2027 (Ministério dos Transportes)"; "Deságio do vencedor nos leilões de concessões rodoviárias federais (ANTT), 2007–2026"); períodos derivados dos dados.
- [ ] e2e: "Outros" é a última barra nos dois gráficos; tooltip do investimento contém "capex"; diagnóstico tem os anos do modelo e nenhum 2028/2029. Suítes verdes. Commit.

### Task 3: Revisão de clareza das demais abas e da aba Fontes

**Files:** `src/ui.js`, `src/map.js`/`src/layers.js` (legendas e cartões), `src/projetos.js`, `src/trafego.js`, `src/cargas.js`, `src/regulatorio.js`, `src/ficha.js`, `src/fontes.js`, `src/resumo.js` (títulos), tests e2e.

- [ ] Aplicar o critério de clareza a cada título, subtítulo, legenda, cabeçalho de tabela e cartão do mapa (universo, período, unidade em uma linha). Listar no relatório cada texto mudado (antes → depois).
- [ ] Aba Fontes: lista exatamente as fontes dos blocos e camadas embutidos no HTML (derivada de `INTEL.fontes`, `CONC.verificacao.fontes`, bloco de debêntures e glossário quando houver fonte), sem histórico; seção de indisponíveis mantida, renomeada sem versão. e2e: toda fonte listada pertence a um bloco embutido.
- [ ] Suítes verdes. Commit.

(Executar depois das Tasks 4–9, para cobrir também Glossário, Resumo, consórcios e Debêntures.)

### Task 4: Aba Glossário

**Files:** `data/glossario.json` (novo), `src/glossario.js` (novo; `Glossario.init(dados)`, `Glossario.link(termo, texto?) -> html`), `src/tabs.js` (aba `glossario` depois de Fontes), `src/template.html`, `src/main.js`, `scripts/build.py` (embute `window.GLOSSARIO` e `JS_FILES`), `src/styles.css`; tests `tests/test_glossario.py`, `tests/glossario.test.mjs`, e2e.

**Interfaces:** `data/glossario.json` = `[{id, termo, sigla?, definicao, fonte?: {nome, url?}, categorias: [..]}]`; `Glossario.link('vmda')` → `<a href="#glossario/vmda" class="glossario-link">VMDa</a>`; rota `#glossario/<id>` rola até o termo.

- [ ] Pytest: ids únicos; definição não vazia; `test_links_do_glossario_existem` — todo `Glossario.link('x')` encontrado em `src/*.js` tem id em `glossario.json`.
- [ ] Conteúdo: os termos da spec §3.5, definições curtas em português simples; fonte quando a definição vier de norma (ex.: Portaria MT 995/2023, Lei 12.431/2011). Busca por termo na aba; ordem alfabética; categorias.
- [ ] Links: primeira menção de cada termo nas abas (Resumo, Mapa, Tráfego, Cargas, Mercado, Regulatório, Debêntures) usa `Glossario.link`.
- [ ] e2e: aba existe, busca filtra, link de outra aba abre o termo. Suítes verdes. Commit.

### Task 5: Resumo — "Sobre este painel"

**Files:** `src/resumo.js`, `src/leiloes-model.js` ou novo `src/resumo-model.js` (`sobrePainel(conc, intel, snv) -> {fontes: [{nome, oQue, dataBase, acesso}]}`), `data/fontes_descricao.json` (novo, curado: uma frase do que é cada fonte por `bloco`/base), tests unit + e2e.

- [ ] Unit RED: `sobrePainel` gera uma linha por fonte principal com a data-base (período) e o acesso **lidos dos blocos** (`INTEL.fontes`, `fontes.base`, `CONC.verificacao`, bloco de debêntures); nenhuma data digitada; fonte sem descrição curada → teste falha listando-a.
- [ ] UI: bloco no topo do Resumo com "Para que serve", "De onde vêm as informações" (RoadShow explicado como "apresentação do Ministério dos Transportes a investidores sobre a carteira de concessões rodoviárias 2026–2027, edição de 14/10/2026"; ANTT, DNIT/SNV, IBGE, PRF, ABCR, Infra S.A., MPO, CVM, Banco Central, Tesouro, corretoras) e "Data-base das informações" (tabela gerada). Links do glossário nos termos.
- [ ] e2e compara com o modelo. Suítes verdes. Commit.

### Task 6: Base de consórcios — pesquisa e dados

**Files:** `data/roadshow/consorcios.json` (novo), `scripts/verificacao.py` (validação e aplicação: `conc.consorcios`), `scripts/curadoria.py` (consórcio vencedor sem composição), tests `tests/test_consorcios.py`.

**Interfaces:** `consorcios.json` = `{"consorcios": [{"nome": "<como nos leilões>", "integrantes": [{"nome", "grupo", "participacao": number|null}], "fontes": [ids de verificacao.json fontes ou novas com o mesmo formato], "nota"?}]}`; aplicado como `conc.consorcios` (lista com fontes resolvidas).

- [ ] Pytest RED: nome casa com algum nome de `participantes`/`inabilitados` aplicados; todo dado com fonte; soma das participações = 100 (±0,01) quando todas informadas; `grupo` de integrante existe em `grupos_alias` (ou é nome próprio novo com alias).
- [ ] Pesquisa (regra de fontes da v4; DOU inacessível daqui): consórcios vencedores 2007–2026 e demais consórcios de 2023–2026 — atas da ANTT/B3 (integrantes e líder), atos de homologação, páginas das concessionárias, imprensa (marcada). Participação só quando publicada; senão `null`.
- [ ] Curadoria: consórcio vencedor sem composição vira item. Suítes verdes; build. Commit.

### Task 7: Ficha de grupo e consórcio (aba Mercado)

**Files:** `src/consorcios.js` (novo; `Consorcios.abrir(grupoOuConsorcio)`), `src/leiloes-model.js` (`fichaGrupo(nome, conc) -> {grupo, consorcios:[…], leiloes:[{ano, lote, resultado, consorcio}], fontes}`), `src/mercado.js` (cliques no ranking, nos gráficos de grupos e nos nomes da tabela de participantes), `src/styles.css`; tests unit + e2e.

- [ ] Unit: `fichaGrupo` para grupo com consórcios, grupo que disputou sozinho, consórcio sem composição.
- [ ] UI: painel/modal acessível (Esc fecha, foco), composição com participação (barra) ou "não informada", leilões com vitória/derrota, fontes com selo; nome clicável no ranking, nos gráficos de grupos e na tabela de participantes.
- [ ] e2e: abrir pelo ranking e pela tabela; caso sem composição. Suítes verdes. Commit.

### Task 8: Debêntures — dados (script, classificação, agregados, séries públicas)

**Files:** `scripts/intel/debentures.py` (novo: `fetch(force=False)`, `build()`, `ler_telas(path) -> list[dict]`, `ler_negocios(path) -> {"negocios": [...], "intencoes": [...]}`, `classificar(nome, emissores) -> {subsetor, grupo}|None`, `curva_ntnb(data) -> [(vencimento, taxa)]`, `spread(taxa, vencimento, curva) -> float|None`, `agregar(...)`), `data/debentures/emissores.json` (novo, curado), `tests/fixtures/debentures/` (planilhas sintéticas pequenas), `scripts/atualizar.py` (domínio `debentures` na ordem, depois de `pipeline`), `scripts/curadoria.py` (`emissor_sem_classificacao`), `scripts/intel/fontes_bloco.py`, `README.md` (tabela de domínios), tests `tests/test_intel_debentures.py`.

**Interfaces (bloco `data/intel/debentures.json`):** `{fonte: [...], macro: {selic: {valor, data}, cdi: {...}, ipca12m: {...}, focus_ipca: {...}, ntnb: [{vencimento, taxa, data}]}, emissoes: [{ticker, emissor, subsetor, grupo, indexador, taxa_emissao, vencimento, volume_emitido|null, incentivada: bool|null, rating|null, data_emissao|null, coordenadores|null, fontes}], secundario: {periodo: {de, ate}, negocios: {por_dia, por_emissor, por_subsetor}, intencoes: {por_dia, por_emissor, por_subsetor, por_direcao}, ultimo_por_ticker: [{ticker, data, taxa, spread, origem: "negocio"|"intencao"}]}}` — agregados com `volume`, `n`, `taxa_media` (ponderada pelo volume), `spread_medio` (só IPCA+).

- [ ] Pytest RED com fixtures: taxas normalizadas (BTG 7.34 → 7.34; XP "7,60%" → 7.6); `classificar` casa grafias (ex.: "ECORODOVIAS CONCESSOES E SERVICOS S/A" e "ECORODOVIAS"); `test_emissor_sem_classificacao_vai_para_curadoria`; `spread` interpola linearmente entre as duas NTN-B vizinhas pelo vencimento; `test_spread_sem_curva_do_dia` → `None`; PRÉ/DI+ → `None`; agregados batem com somas manuais das fixtures; intenções nunca entram em `negocios`; o bloco não contém lista de negócios linha a linha (só agregados e `ultimo_por_ticker`).
- [ ] `fetch`: Banco Central (SGS: Selic meta 432, CDI 12, IPCA 12 meses 13522; Olinda/Focus IPCA 12 meses), Tesouro (preço e taxa do Tesouro Direto, NTN-B/Tesouro IPCA+ com juros semestrais e principal) com novas tentativas; se o Tesouro não responder, spread "—" e aviso no relatório. Planilhas: lidas de `data/raw/debentures/` (nomes livres `*.xlsx`; abas BTG/XP), instruções no README.
- [ ] `emissores.json`: classificação inicial manual de todos os emissores de setor "Transporte" das telas e dos que aparecem só nos negócios/intenções (por nome), com subsetor (rodovias, ferrovias, portos e terminais, aeroportos, hidrovias, mobilidade urbana) e grupo (casando com `grupos_alias` quando for o mesmo grupo).
- [ ] Colocar as duas planilhas do usuário em `data/raw/debentures/` (copiar de `/tmp/claude-0/-home-user-Rodovias/95e8feae-1f3c-506d-b2f2-a4238ed38365/scratchpad/deb-xlsx/`), rodar `python scripts/atualizar.py`, conferir o bloco. Suítes verdes. Commit (bloco + script + curados + fixtures; nunca as planilhas).

### Task 9: Aba Debêntures

**Files:** `src/debentures.js` (novo), `src/debentures-model.js` (novo, puro: `kpis`, `series(bloco, {somado})`, `tabelaEmissoes`), `src/tabs.js`/`src/template.html`/`src/main.js`/`scripts/build.py`, `src/mercado.js` (série de debêntures do RoadShow p. 77 sai do Mercado e vem para esta aba; Mercado ganha link), `src/charts.js` se precisar de forma nova, `src/styles.css`; tests unit + e2e.

- [ ] Unit: `series(bloco, {somado:false})` usa só negócios; `{somado:true}` soma intenções e devolve `rotulo: "negócios + intenções (somados como se fossem negócios)"`.
- [ ] UI: (1) indicadores macro com data; curva de NTN-B; (2) emissões de rodovias e infraestrutura de transporte (tabela ordenável com CSV; "—" onde a fonte não traz); (3) mercado secundário: volume e número de negócios por dia, taxa média e spread por emissor e por subsetor, último negócio por papel; intenções à parte; **opção "ver somado"**; (4) série de debêntures incentivadas para rodovias do RoadShow (p. 77). Cada cartão com fonte e período; títulos pelo critério de clareza; links do glossário.
- [ ] e2e `alternar somado` (todos os cartões afetados mudam e o rótulo aparece; desligar volta aos negócios), números comparados com o modelo, sem NaN, 390 px sem rolagem lateral. Suítes verdes. Commit.

### Task 10: Documentação, build final e entrega

**Files:** `README.md`, `docs/HANDOFF.md`, `mapa-rodovias.html`.

- [ ] README e HANDOFF: abas novas (Glossário, Debêntures), consórcios, como trocar as planilhas de debêntures (e onde a API entrará: `ler_negocios`/`ler_telas`), domínio `debentures` no `atualizar.py`, decisões e pendências; sem a marca da empresa.
- [ ] `python scripts/atualizar.py`, três suítes; HTML ≤ 15 MB. Commit e push.

(O documento para o TI é feito pelo controlador, fora do repositório.)
