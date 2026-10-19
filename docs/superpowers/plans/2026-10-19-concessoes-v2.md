# Mapa de Rodovias v2 — Estudo das Concessões — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Estender `mapa-rodovias.html` com os dados do RoadShow 2026-2027: entidades de concessão ligadas aos trechos do SNV por recorte curado, modo de cor "Concessões", ficha do projeto, comparador, aba Mercado e aba Regulatório. Tudo num único HTML offline.

**Architecture:** Dados curados em `data/roadshow/*.json`, gerados por um rascunho de extração e revisados à mão, com a página de origem de cada número. `scripts/roadshow.py` valida esses dados, resolve o recorte (intervalos de km → ids de trechos físicos) e gera `window.CONC` no build. No navegador, `src/conc-model.js` é puro e testado com `node --test`. Os módulos de UI ficam um por aba, mais um roteador por `#hash`.

**Tech Stack:** a da v1: Python 3 + pyshp + pytest; Leaflet 1.9.4 vendorizado; JS ES2020 concatenado; `node --test`; Playwright. Gráficos em SVG próprio, sem biblioteca. `pdftotext`/`pdftoppm` só no rascunho de extração, nunca no build.

**Spec:** `docs/superpowers/specs/2026-10-19-concessoes-v2-design.md` (e a v1: `docs/superpowers/specs/2026-10-19-mapa-rodovias-design.md`)

## Global Constraints

- Usar só as **páginas ímpares (PT)** do PDF. Números de página = página do PDF, não o rodapé.
- HTML único `mapa-rodovias.html`, ≤ 15 MB, zero requisições de rede; texto ≥ 14 px; só as 5 cores da marca (`#183C80`, `#0071BB`, `#231F20`, `#525254`, `#F7F7F8`) mais opacidade; grid de 8 px; animações de 150–300 ms.
- Formatos: `R$ 7,34 bi`; `19,60%`; `dd/mm/aaaa`, ou `jun/2027` quando só houver mês/ano; km como na v1 (`734,9 km`). Campo ausente = `—`.
- **Regra de preços (spec §3.2):** comparador, totais, painel e cartão usam capex/opex da tabela em dez/2024 (p3–5/p97) quando existir; senão a ficha. A coluna Data-base vai em toda linha. A ficha mostra os próprios valores, com a data-base dela, e o valor em dez/2024 ao lado.
- **Divergências:** diferença entre fontes com a mesma data-base → `divergencias` (ícone de aviso). Com data-base diferente → nota de data-base, não divergência.
- **Contagens:** 39 contratos vigentes; 40 projetos do programa por ano 2023/24/25/26/27 = 2/7/13/7/11; 25 leilões realizados (inclui Régis Bittencourt, 23/07/2026); 4 agendados em 2026 (Arco Norte, Pequi, Rota Agro Central, Rota 2 de Julho); 27 estudos pós-2027.
- **Estados e prioridade** (spec §5.1), chaves fixas: `agendado2026` > `projeto2027` > `programa` > `vigente` > `snv` > `pos2027` > `nenhum`.
- **Recorte:** diferença ≤ 5% ou ≤ 10 km → `ok`; ≤ 20% → `aproximado`; acima disso o build falha, salvo se `trechos.json` trouxer `qualidade` + `nota`.
- O PDF fica em `data/raw/` (gitignored). O build não lê o PDF.

## Review Focus

1. **Trecho com várias entidades** (contrato vigente + otimização futura, por exemplo Transbrasiliana BR-153/SP) → a cor segue a prioridade, e o cartão lista as duas com "Ver ficha" para cada uma. Teste na Task 4 (`stateOfFis` com duas entidades) e na Task 5 (e2e do cartão).
2. **Entidade `nao_mapeado` ou sem ficha** (contrato vigente pré-2023, estudo pós-2027) → a ficha abre sem blocos vazios, sem "undefined", e "Ver no mapa" fica desabilitado com explicação. Teste na Task 6.
3. **Ordenar o comparador por coluna com nulos** (WACC ausente nos contratos vigentes) → nulos sempre no fim, nas duas direções. Teste na Task 4 (`sortRows`).
4. **`#hash` inválido ou id inexistente** (`#ficha/nao-existe`, `#xyz`) → cai na aba Mapa sem erro no console. Teste na Task 5.
5. **Filtro de concessão combinado com filtro físico que zera a seleção** → mapa vazio, painel "0,0 km", nenhum `NaN` em "Por estado". Teste na Task 4 e na Task 5.

---

## File Structure

```
data/raw/roadshow.pdf                  (gitignored) fonte
data/roadshow/entidades.json           entidades curadas (contratos + projetos)
data/roadshow/estudos_pos2027.json     27 estudos
data/roadshow/mercado.json             séries dos gráficos
data/roadshow/regulatorio.json         seções de texto + 11 otimizações
data/roadshow/trechos.json             recorte curado (id → intervalos de km)
data/roadshow/cobertura.md             GERADO pelo build: relatório de cobertura
scripts/extract_roadshow.py            rascunho de extração (dev; usa pdftotext)
scripts/snv_lookup.py                  ferramenta de curadoria: lista trechos SNV por BR/UF com km e localidades
scripts/roadshow.py                    validação + resolução do recorte + payload CONC
scripts/build.py                       (mod) embute window.CONC; novos JS
src/conc-model.js                      puro: estados, filtros de concessão, comparador, formatos
src/tabs.js                            roteador por hash + barra de abas
src/charts.js                          primitivas SVG
src/ficha.js                           ficha do projeto
src/projetos.js                        aba Projetos
src/mercado.js                         aba Mercado
src/regulatorio.js                     aba Regulatório
src/map.js, src/ui.js, src/styles-map.js, src/styles.css, src/template.html, src/main.js   (mod)
tests/test_roadshow.py                 pytest: dados + recorte
tests/conc-model.test.mjs              node --test
tests/e2e.test.mjs                     (mod) Playwright
```

## Contratos de dados

**`entidades.json`**: lista de objetos. Campos (spec §4.1; ausente = `null`):
`id` (slug), `nome`, `nome_contrato`, `brs` (["116","251"]), `ufs` (["MG"]), `trecho_texto`, `trecho_cidades` ([ini, fim] | null), `estado` (uma das chaves), `ano_programa` (2023..2027 | null), `tipo` (`nova`|`otimizacao`|`delegada`), `estruturador`, `grupo_vencedor`, `km`, `capex`, `opex` (R$ bi, base comparável), `data_base` ("dez/2024" | …), `capex_ficha`, `opex_ficha` (R$ bi), `data_base_ficha`, `capex_vpl`, `opex_vpl` (R$ bi), `leilao` ("2026-03-31" | "2027-06" | null), `edital`, `assinatura`, `assinatura_aditivo`, `inicio_operacao` (ISO; mês-only "AAAA-MM"), `participantes` (int), `participantes_lista` ([{grupo, desagio|null, vencedor: bool}]), `desagio` (número em %, ex. 19.6), `status_texto`, `atualizado_em`, `ficha` (objeto abaixo | null), `cronograma` ([{marco, data}]), `fontes` ({campo: página}), `divergencias` ([{campo, exibido, alternativas: [{valor, pagina}], nota}]), `notas_base` ([{campo, valor, data_base, pagina}]), `relaciona` ([ids]).

**`ficha`** (unidades fixas): `trecho_inicio`, `trecho_fim` (texto); `extensao_km`; `wacc` (%); `empregos` (int); `tkm` (R$/km); `carga` (texto); `duplicacao_km`, `faixa_adicional_km`, `contorno_km`, `marginais_km`; `obras_relevantes` (texto); `pracas_implantar`, `pracas_existentes`, `porticos` (int); `capex_km`, `opex_km`, `custo_duplicacao_km` (R$ mi/km); `custo_manutencao` (R$ mi/ano/faixa); `fluxo_caixa_acum`, `receita_nominal`, `receita_vpl` (R$ bi); `cagr_trafego` (%); `capex_receita_vpl` (%); `ciclo_obras` (texto); `garantia_proposta`, `capital_minimo`, `garantia_execucao` (R$ mi); `veq_dia_praca` (int); `capex_anual` ([{ano: 1.., valor: R$ mi}]); `data_base`; `extras` ([{rotulo, valor}]). Se a ficha usar outra unidade, converter e registrar em `extras` o texto original.

**`trechos.json`**: `{ "<id>": { "ranges": [{"br":"116","uf":"MG","km_ini":0,"km_fim":409.2}], "qualidade": null|"aproximado"|"nao_mapeado", "nota": "…" } }`. `qualidade` só é preenchida à mão para forçar exceção; senão o build calcula.

**`window.CONC`** (produzido pela Task 3, consumido pelas Tasks 4–8):
```
{ estados: [{key, label}],                 // ordem = prioridade
  entidades: [ ...entidades.json com +idx, +qualidade, +km_mapeado ],
  entFis: [[fisId,...]],                   // paralelo a entidades
  fisEnt: {fisId: [entIdx,...]},
  snvOnly: [fisId,...],                    // Concessão Federal no SNV fora dos contratos
  estudos: [{brs, ufs, possivel_2027, pagina, fis: [fisId]}],
  mercado, regulatorio, versaoRoadshow: "v40 · 14/10/2026" }
```

---

### Task 1: Entidades curadas (`entidades.json`, `estudos_pos2027.json`)

**Files:**
- Create: `scripts/extract_roadshow.py`, `data/roadshow/entidades.json`, `data/roadshow/estudos_pos2027.json`, `tests/test_roadshow.py`
- Modify: `README.md` (seção "Fonte RoadShow")

**Interfaces:**
- Produces: os arquivos JSON nos contratos acima; `tests/test_roadshow.py::load_json(name) -> object`.

- [ ] **Step 1: Failing tests** em `tests/test_roadshow.py`:

```python
def test_contagens():
    e = load_json("entidades.json")
    assert sum(1 for x in e if x["estado"] in ("vigente", "programa") and x["assinatura"]) == 39
    prog = [x for x in e if x["ano_programa"]]
    assert Counter(x["ano_programa"] for x in prog) == {2023: 2, 2024: 7, 2025: 13, 2026: 7, 2027: 11}
    assert sum(1 for x in e if x["estado"] == "agendado2026") == 4
    assert {x["id"] for x in e if x["estado"] == "agendado2026"} == {"rota-arco-norte", "rota-do-pequi", "rota-agro-central", "rota-2-de-julho"}
    assert len(load_json("estudos_pos2027.json")) == 27

def test_ids_unicos_e_relaciona_valido(): ...      # ids únicos; todo id em relaciona existe
def test_estado_valido(): ...                      # estado ∈ 7 chaves; tipo ∈ 3
def test_fontes_cobrem_numeros():                  # todo campo numérico não-nulo de topo e da ficha tem página em fontes (chave "ficha.<campo>" para a ficha)
def test_valores_conhecidos():
    g = by_id("rotas-gerais")
    assert (g["km"], g["ficha"]["wacc"], g["ficha"]["pracas_implantar"]) == (734.9, 13.76, 9)
    assert g["capex"] == 7.34 and g["data_base"] == "dez/2024"
    s = by_id("rota-dos-sertoes")
    assert (s["capex"], s["capex_ficha"], s["data_base_ficha"]) == (6.27, 4.13, "mar/2023")
    assert by_id("rota-verde-goias")["km"] == 426.2           # p5 linha 21 corrigida
    assert by_id("regis-bittencourt")["estado"] == "programa"
    assert by_id("rota-2-de-julho")["tipo"] == "nova"
def test_divergencia_vs_nota_base():               # nenhuma divergência cujas alternativas tenham data_base diferente da exibida
def test_capex_anual_soma_proxima_capex_ficha():   # para fichas com capex_anual: |Σ/1000 − capex_ficha| ≤ 2% (senão registrar divergência e marcar no teste com allowlist explícita)
```

- [ ] **Step 2:** `python -m pytest tests/test_roadshow.py -q` → FAIL (arquivo ausente).
- [ ] **Step 3:** Escrever `extract_roadshow.py`: lê `data/raw/roadshow.pdf` página a página (`pdftotext -f N -l N -layout`) e gera `data/roadshow/_rascunho_*.json` (gitignored) para p3–5, p97 e as fichas p103–115 e p131–151. Revisar à mão contra as imagens (`pdftoppm -r 80`) e montar `entidades.json` com: os 39 contratos (unificando com os 25 leilões da p97), os 4 agendados e os 11 de 2027, com `relaciona` para as otimizações (Arco Norte → Via Brasil/contrato BR-163 MT/PA; Pequi → Concebra; Transbrasiliana e Planalto Sul → respectivos contratos de 2008). Participantes de p11–15/p23/p97; cronograma de p117 (2026) e p153 (2027, mês). Divergências conhecidas da spec §3.2, mais as que achar.
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** Commit `data: curated RoadShow entities and post-2027 studies`.

### Task 2: Mercado e Regulatório (`mercado.json`, `regulatorio.json`)

**Files:**
- Create: `data/roadshow/mercado.json`, `data/roadshow/regulatorio.json`
- Test: `tests/test_roadshow.py`

**Interfaces:**
- Produces:
  - `mercado.json`: `{fontes: {serie: pagina}, leiloes_por_ano: [{ano, n, previsto}], participantes: [{ano, lote, vencedor, outros: [{grupo, desagio}]}], concorrentes_desagio: [{leilao, ano, n, desagio}], faixas_desagio: [{faixa, n}], grupos: [{grupo, km, capex, opex}], gestao: [{ano, direta_km, privada_km}], investimentos: [{ano, publico, privado}], indicadores_40: [{rotulo, valor, unidade}], diagnostico: [{ano, contratos, km, valor}]}`.
  - `regulatorio.json`: `{secoes: [{id, titulo, pagina, blocos: [{tipo: "p"|"lista"|"tabela", texto?|itens?|cabecalho?, linhas?}]}], otimizacoes: [{nome, km, capex_opex, prorrogacao_anos, relicitacao, status, pagina}]}`, com as seções da spec §5.2 Regulatório, nesta ordem: `modelo`, `riscos`, `garantias`, `financiamento`, `otimizacoes`, `sustentabilidade`, `estruturadores`, `estudos`.

- [ ] **Step 1: Failing tests:** `test_mercado_series` (todas as chaves presentes e não vazias; toda série em `fontes`; `leiloes_por_ano` cobre 1993–2030 sem anos repetidos; `concorrentes_desagio` tem 25 itens 2023–26; `indicadores_40` contém duplicação 4.374 km, faixa adicional 3.702 km, contornos 442 km, marginais 959 km); `test_regulatorio` (8 seções nessa ordem, todas com página e ≥ 1 bloco; 11 otimizações; a seção `modelo` menciona "18%" e as bandas "±10%" e "±5%").
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Extrair das páginas listadas na spec §3 e revisar contra as imagens. Os textos do regulatório são resumos fiéis em frases curtas, sem interpretação.
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** Commit `data: RoadShow market series and regulatory summaries`.

### Task 3: Recorte curado e payload (`trechos.json`, `scripts/roadshow.py`)

**Files:**
- Create: `scripts/snv_lookup.py`, `scripts/roadshow.py`, `data/roadshow/trechos.json`
- Modify: `scripts/build.py` (embute `window.CONC`, grava `cobertura.md`, falha em erro de validação)
- Test: `tests/test_roadshow.py`

**Interfaces:**
- Consumes: `snv.load_records`, `snv.group_physical` (v1); JSON das Tasks 1–2.
- Produces:
  - `snv_lookup.py BR UF [--adm]`: imprime os registros do SNV daquela BR/UF ordenados por km (km_ini, km_fim, extensão, local início → fim, administração). Ferramenta de curadoria; sem testes.
  - `resolve_ranges(records, groups, ranges) -> set[int]`: ids de físicos (índice em `groups`) cujo registro com BR/UF do range tem sobreposição ≥ 50% da própria extensão com `[km_ini, km_fim]`.
  - `coverage(records, groups, fis_ids) -> float`: Σ ext dos físicos (uma vez cada).
  - `classify(km_decl, km_map) -> "ok"|"aproximado"|"falha"` com os limites das Global Constraints.
  - `snv_only(records, groups, covered: set[int]) -> list[int]`: físicos com algum registro `ds_tipo_ad == "Concessão Federal"` que não estão em nenhum contrato (`estado` ∈ vigente/programa).
  - `build_conc(records, groups, data_dir) -> (conc: dict, report: list[dict])`, no formato `window.CONC`; `report` = [{id, nome, km_decl, km_map, dif_pct, qualidade, nota}].
  - `build.py` grava `data/roadshow/cobertura.md` (tabela do report + lista dos `snvOnly` agrupada por BR/UF) e sai com código ≠ 0 se alguma entidade der `falha` sem `qualidade` manual.

- [ ] **Step 1: Failing tests:**

```python
def test_resolve_ranges_overlap():   # fixture com 3 registros 0–10, 10–20, 20–30 na BR-116/MG; range 9–25 → físicos dos 2º e 3º (o 1º tem só 10%)
def test_classify():
    assert classify(100, 96) == "ok" and classify(500, 492) == "ok"
    assert classify(100, 85) == "aproximado" and classify(100, 70) == "falha"
@needs_raw
def test_todas_entidades_mapeadas():  # build_conc no dado real: nenhuma "falha" sem qualidade manual; toda entidade com estado != pos2027 tem entFis não vazio ou qualidade "nao_mapeado"
@needs_raw
def test_nova381_e_fernao_dias_separadas():  # BR-381/MG: entFis de "nova-381" e "fernao-dias" disjuntos e ambos não vazios
@needs_raw
def test_ecosul_snv_only():   # algum físico da BR-392/RS está em snvOnly
```

- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implementar `roadshow.py` e `snv_lookup.py`; curar `trechos.json` para todas as entidades (cidades do PDF × localidades do SNV; para contratos assinados, partir dos trechos `Concessão Federal`). Iterar até não haver `falha`. Delegadas e lotes do PR com rodovias estaduais: comparar só a parte federal quando o PDF permitir; senão `aproximado` + nota. Integrar ao `build.py`.
- [ ] **Step 4:** PASS; `python scripts/build.py` imprime o resumo de cobertura e gera `cobertura.md`.
- [ ] **Step 5:** Commit `feat: curated concession segments, coverage report, CONC payload`.

### Task 4: Modelo de concessões (`src/conc-model.js`)

**Files:**
- Create: `src/conc-model.js`, `tests/conc-model.test.mjs`
- Modify: `package.json` (`test` roda os dois arquivos de teste unitário)

**Interfaces:**
- Consumes: formato `window.CONC`.
- Produces (`const ConcModel = {...}` + `module.exports`):
  - `ConcModel.PRIORITY = ['agendado2026','projeto2027','programa','vigente','snv','pos2027','nenhum']`
  - `stateOfFis(conc, j) -> key`: melhor estado entre as entidades do físico, `snv` se j ∈ snvOnly, `pos2027` se em algum estudo, senão `nenhum`.
  - `stateArray(conc, nFis) -> string[]` (pré-computado uma vez).
  - `entitiesOfFis(conc, j) -> number[]` ordenadas pela prioridade do estado.
  - `emptyConcFilters() -> {estado: Set<key>, ent: Set<idx>, ano: Set<int>}`.
  - `passes(conc, states, j, cf) -> boolean` (E entre grupos; `ent` e `ano` testam as entidades do físico).
  - `kmPorEstado(conc, states, visible, snv) -> [{key, km}]` (Σ `fis.ext` uma vez cada; sem estados zerados).
  - `comparatorRows(conc) -> [{idx, nome, brsUfs, estado, dataChave, km, capex, opex, dataBase, capexKm, wacc, tkm, desagio, participantes, vencedor, ano, tipo, ufs}]`; `capexKm = capex*1000/km` (R$ mi/km), null-safe.
  - `filterRows(rows, {estado, uf, ano, tipo, q}) -> rows` (q sem acento, como `Model.normalize`).
  - `sortRows(rows, key, dir) -> rows` (nulos sempre no fim).
  - `totals(rows) -> {km, capex, opex, n}` (ignora nulos).
  - `fmtBi(x) -> "R$ 7,34 bi"`, `fmtPct(x) -> "19,60%"`, `fmtData(s) -> "31/03/2026" | "jun/2027" | "—"`.

- [ ] **Step 1: Failing tests** com um `conc` fixture de 4 entidades em 5 físicos: um físico com `programa` + `projeto2027` (otimização), um `snvOnly`, um em estudo pós-2027, um sem nada.

```js
test('prioridade', () => assert.equal(ConcModel.stateOfFis(conc, 0), 'projeto2027'));
test('snv e pos2027 e nenhum', () => assert.deepEqual([2,3,4].map(j => ConcModel.stateOfFis(conc, j)), ['snv','pos2027','nenhum']));
test('entitiesOfFis ordenado', () => assert.deepEqual(ConcModel.entitiesOfFis(conc, 0), [1, 0]));
test('passes por entidade', ...);  test('kmPorEstado vazio sem NaN', ...);
test('sortRows nulos no fim nas duas direções', () => { /* wacc [13.76, null, 9.1] → asc [9.1,13.76,null]; desc [13.76,9.1,null] */ });
test('totals ignora nulos', ...);
test('formatos', () => { assert.equal(ConcModel.fmtBi(7.34), 'R$ 7,34 bi'); assert.equal(ConcModel.fmtPct(19.6), '19,60%');
  assert.equal(ConcModel.fmtData('2026-03-31'), '31/03/2026'); assert.equal(ConcModel.fmtData('2027-06'), 'jun/2027'); assert.equal(ConcModel.fmtData(null), '—'); });
```

- [ ] **Step 2:** `npm test` → FAIL. **Step 3:** implementar. **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat: concession model (states, filters, comparator helpers)`.

### Task 5: Abas, modo Concessões no mapa, filtros e cartão

**Files:**
- Create: `src/tabs.js`
- Modify: `src/template.html`, `src/styles.css`, `src/styles-map.js`, `src/map.js`, `src/ui.js`, `src/main.js`, `scripts/build.py` (`JS_FILES` na ordem: leaflet, model, conc-model, styles-map, charts, map, ficha, projetos, mercado, regulatorio, ui, tabs, main)
- Test: `tests/e2e.test.mjs`

**Interfaces:**
- Consumes: `ConcModel.*` (Task 4), `window.CONC` (Task 3).
- Produces:
  - `Tabs.init()`, `Tabs.go(route: string)`, `Tabs.current() -> {tab, arg}`; rotas `#mapa` (padrão), `#projetos`, `#mercado`, `#regulatorio`, `#ficha/<id>` (abre a ficha sobre a última aba). Hash inválido → `#mapa`. Cada aba é uma `<section data-tab="…">`; troca por `hidden`.
  - `CONC_STYLES` em `styles-map.js`: estilos da spec §5.1 por chave, mais rótulos para a legenda.
  - `MapView.setColorMode('fisica'|'concessoes')` (padrão `concessoes`), `MapView.colorMode()`, `MapView.fitEntity(entIdx)`, `MapView.highlightEntity(entIdx)` (realça os `entFis`).
  - UI: seletor de modo de cor acima da legenda; novos grupos de filtro "Estado da concessão", "Projeto/contrato" (lista com busca), "Ano do programa"; `Model.search` passa a receber também nomes de entidade (resultado `kind: 'entidade'` → realça e enquadra); painel ganha "Por estado da concessão"; cartão ganha o bloco "Concessão" com as entidades (`ConcModel.entitiesOfFis`), cada uma com nome, estado, data-chave e botão "Ver ficha" (`Tabs.go('#ficha/<id>')`).

- [ ] **Step 1: Failing e2e:** (a) a barra de abas tem 4 abas e `#mapa` é a ativa; (b) `#projetos` e voltar (`page.goBack()`) restauram as abas; (c) `#xyz` e `#ficha/nao-existe` → aba Mapa, sem erro no console; (d) o modo padrão é `concessoes` e a legenda lista "Leilão agendado 2026"; (e) filtro Estado = Projeto 2027 → KPI > 0 e igual a `Model.aggregate` com a mesma máscara; (f) busca "Rotas Gerais" → primeira sugestão `kind` entidade e `MapView.highlighted().length > 0`; (g) `MapView.pick` num físico da Transbrasiliana → o cartão lista 2 entidades e "Ver ficha" leva a `#ficha/…`; (h) filtro de concessão + UF que zera → "0,0 km", sem "NaN" no painel.
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** PASS, mais as e2e da v1 ajustadas (o modo padrão mudou; os testes de KPI continuam válidos).
- [ ] **Step 5:** Commit `feat: tabs, concessions color mode, concession filters and card block`.

### Task 6: Ficha do projeto (`src/ficha.js`) + `src/charts.js`

**Files:**
- Create: `src/ficha.js`, `src/charts.js`
- Modify: `src/styles.css`
- Test: `tests/e2e.test.mjs`

**Interfaces:**
- Produces:
  - `Charts.bars(el, data: [{label, value}], {unit, format, title, fonte}) -> void`; `Charts.hbars(...)`; `Charts.scatter(el, data: [{x, y, label}], {...})`; `Charts.lines(el, series: [{name, points: [{x, y}], style}], {...})`. SVG responsivo, tooltip com valor exato (`<title>` + popover no hover), só paleta.
  - `Ficha.open(id)`, `Ficha.close()`. Renderiza na `<div id="ficha" role="dialog">` sobre a aba atual; Esc e o botão fechar voltam ao hash anterior.
  - Blocos da spec §5.2 Ficha, cada um omitido se todos os campos forem nulos. Campos com divergência: ícone `⚠` em SVG outline (classe `.div-flag`, botão acessível) que abre um popover com as alternativas e as páginas. Nota de data-base: "R$ 6,27 bi em dez/2024 (p97)" logo abaixo do capex/opex.
  - "Ver no mapa": `Tabs.go('#mapa')` + `MapView.fitEntity` + `MapView.highlightEntity`; desabilitado (com `title` explicativo) se `entFis` estiver vazio.
  - Rodapé: "Fonte: RoadShow 2026-2027 (v40, 14/10/2026), p. N" com as páginas da entidade.

- [ ] **Step 1: Failing e2e:** (a) `#ficha/rotas-gerais` mostra "734,9 km", "R$ 7,34 bi", "13,76%", praças a implantar 9 e um `svg` de capex anual com ≥ 10 barras; (b) `#ficha/rota-dos-sertoes` mostra "R$ 4,13 bi", "mar/2023" e "R$ 6,27 bi em dez/2024"; (c) uma ficha com divergência tem `.div-flag`, e o clique mostra página(s) "p."; (d) um contrato vigente pré-2023 abre sem "undefined", "null" nem "NaN" no texto e sem blocos vazios; (e) um estudo sem trecho → botão "Ver no mapa" desabilitado; (f) "Ver no mapa" na Rotas Gerais → aba Mapa e `MapView.highlighted()` não vazio; (g) Esc fecha e volta ao hash anterior.
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat: project sheet with capex chart, divergence flags, map link`.

### Task 7: Aba Projetos (`src/projetos.js`)

**Files:**
- Create: `src/projetos.js`
- Modify: `src/styles.css`
- Test: `tests/e2e.test.mjs`

**Interfaces:**
- Consumes: `ConcModel.comparatorRows/filterRows/sortRows/totals/fmt*`, `Ficha.open`, `MapView.fitEntity`.
- Produces: `Projetos.init(conc)`. Tabela com cabeçalho fixo; colunas padrão da spec (Nome, BRs/UFs, Estado, Data-chave, km, Capex, Opex, Data-base, Capex/km, WACC, TKM, Deságio, Participantes, Vencedor); seletor de colunas que adiciona os campos numéricos da ficha; filtros (estado, UF, ano, tipo, busca); linha de totais; clique na linha → `Tabs.go('#ficha/<id>')`; botão "ver no mapa" por linha. Abaixo, a seção "Estudos pós-2027" (BRs/UFs, "possível 2027", "ver no mapa").

- [ ] **Step 1: Failing e2e:** (a) a tabela tem 39 + 4 + 11 linhas com filtros vazios (contratos + agendados + 2027, sem duplicar os leiloados); (b) ordenar por Capex/km desc → os valores da coluna ficam não crescentes, com nulos no fim; (c) ordenar por Deságio; (d) filtro Estado = Projeto 2027 → 11 linhas, e a linha de totais é igual à soma das linhas visíveis (comparada no `page.evaluate` com `ConcModel.totals`); (e) clicar numa linha abre `#ficha/<id>`; (f) a seção de estudos tem 27 itens.
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat: projects comparator tab`.

### Task 8: Abas Mercado e Regulatório

**Files:**
- Create: `src/mercado.js`, `src/regulatorio.js`
- Modify: `src/styles.css`
- Test: `tests/e2e.test.mjs`

**Interfaces:**
- Consumes: `Charts.*`, `CONC.mercado`, `CONC.regulatorio`, `CONC.estudos`, `MapView`.
- Produces: `Mercado.init(conc)`, que renderiza, em grade de cards, os gráficos da spec §5.2 Mercado (cada um com título, unidade, "Fonte: p. N"). A tabela de participantes 2007–26 é rolável e filtrável por ano. `Regulatorio.init(conc)` tem um índice lateral (âncoras para as 8 seções), os blocos de texto, a tabela de otimizações e a lista de estudos com "ver no mapa" (realça os `fis` do estudo).

- [ ] **Step 1: Failing e2e:** (a) `#mercado` tem ≥ 7 `svg` de gráfico, e cada card tem "Fonte: p."; (b) passar o mouse numa barra de "Leilões por ano" mostra o valor exato; (c) `#regulatorio` tem 8 seções no índice, e clicar em "Matriz de riscos" rola até ela; (d) a tabela de otimizações tem 11 linhas; (e) "ver no mapa" de um estudo → aba Mapa com realce.
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat: market and regulatory tabs`.

### Task 9: Verificação final, desempenho e documentação

**Files:**
- Modify: `tests/e2e.test.mjs`, `README.md`

- [ ] **Step 1:** As e2e da v1 continuam: zero requisições externas, zero erros de console, fonte Inter, filtro < 200 ms, agora com o modo Concessões ativo e um filtro de concessão. Novo: trocar de aba < 300 ms.
- [ ] **Step 2:** Rodar `python -m pytest -q && npm test && npm run test:e2e` → tudo PASS; build ≤ 15 MB.
- [ ] **Step 3:** README: as abas, de onde vêm os dados (RoadShow v40, páginas PT), a regra de data-base, as divergências, `cobertura.md` e como reextrair numa nova versão do RoadShow (`extract_roadshow.py` → revisar → `build.py`).
- [ ] **Step 4:** Screenshots 1440×900 de cada aba e de uma ficha, revisadas contra o checklist da marca.
- [ ] **Step 5:** Commit `test/docs: v2 verification and README`.
