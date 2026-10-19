# Mapa Interativo da Malha Rodoviária Federal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gerar `mapa-rodovias.html`, um arquivo único e offline com o mapa interativo dos 7.673 trechos do SNV 202607A sobre as UFs, com busca, filtros e painel de números, no design system Galapagos.

**Architecture:** Um pipeline Python (`scripts/`) lê o shapefile, agrupa os trechos coincidentes em trechos físicos, simplifica e quantiza as geometrias e injeta dados + JS + CSS + fontes + Leaflet num template, gerando um HTML autocontido. No navegador, um módulo JS puro (`src/model.js`, testado com `node --test`) faz filtro, agregação e busca. `src/map.js` desenha com Leaflet em canvas e `src/ui.js` monta o painel. Um teste Playwright abre o HTML via `file://` com a rede bloqueada.

**Tech Stack:** Python 3 + pyshp + pytest; Leaflet 1.9.4 (vendorizado); JS ES2020 sem bundler (módulos concatenados num `<script>`); Node 22 `node --test`; Playwright 1.56 (Chromium em `/opt/pw-browsers`).

**Spec:** `docs/superpowers/specs/2026-10-19-mapa-rodovias-design.md`

## Global Constraints

- Arquivo final único `mapa-rodovias.html` na raiz do repositório, **≤ 15 MB** (ideal 5–8 MB); zero requisições de rede em runtime (sem CDN, Google Fonts ou tiles).
- Cores: exclusivamente `#183C80` (Deep Blue), `#0071BB` (Bright Blue), `#231F20` (Spacial Grey), `#525254` (Light Grey), `#F7F7F8` (Snow White), com opacidade como único recurso extra. Exceção: os tons de cinza das UFs e das bordas são derivados por opacidade do Light Grey sobre o Snow White.
- Tokens CSS no `:root` exatamente como na skill Galapagos (`--color-deep-blue` … `--transition: 150ms ease-in-out`). Grid 8 px; texto ≥ 14 px; animações 150–300 ms ease-in-out; títulos `'Gadugi', 'Hind', 'Inter', sans-serif`; corpo Inter (woff2 embutido); ícones Material Symbols Outlined como SVG inline.
- Formato numérico brasileiro: `131.085,2 km`.
- Regra de soma: cada trecho físico conta uma vez, sempre (spec §3.4). Total sem filtros = **131.085,2 km** em **7.591** trechos físicos (7.673 registros; 77 grupos coincidentes; soma bruta 131.690,7 km).
- O dado bruto (`data/raw/`) fica no `.gitignore`. `data/ufs.geojson`, `vendor/` e o HTML gerado são commitados.
- Rótulos de exibição: superfície `PAV`→"Pavimentada", `N_PAV`→"Não pavimentada", `PLA`→"Planejada"; BR exibida como `BR-116` (zero-padded de 3 dígitos vindo de `vl_br`).

## Review Focus

1. Busca sem acento/caixa ("sao paulo", "BR116", "br 116", " 116 ") → acha as mesmas coisas que a grafia exata; teste em Task 3.
2. Filtros que zeram a seleção → mapa vazio, painel "0 km · 0 trechos", sem `NaN` nem divisão por zero nas porcentagens; teste em Task 3.
3. Trecho coincidente em que só uma das BRs passa no filtro → aparece e conta uma vez com a extensão inteira; teste em Task 3.
4. Abrir via `file://` em Chromium com a rede bloqueada → carrega, sem erro no console; teste em Task 6.
5. Feições com geometria degenerada (1 ponto, ou que a simplificação colapsa) → mantidas com pelo menos 2 pontos, nunca descartadas em silêncio; teste em Task 1.

---

## File Structure

```
.gitignore                    data/raw/, __pycache__, node_modules
README.md                     como regenerar
requirements.txt              pyshp, pytest
scripts/fetch_assets.py       baixa uma vez: malha UF IBGE → data/ufs.geojson; leaflet → vendor/; Inter/Hind woff2 → vendor/fonts/
scripts/snv.py                leitura, agrupamento, simplificação e encode dos trechos (lógica pura)
scripts/build.py              CLI: monta o HTML final a partir de snv.py + assets + src/
src/template.html             esqueleto com placeholders /*__CSS__*/ /*__DATA__*/ /*__JS__*/
src/styles.css                tokens Galapagos + layout
src/model.js                  filtro/agregação/busca (puro, sem DOM)
src/styles-map.js             tabela situação → estilo de linha
src/map.js                    Leaflet: UFs, rótulos, trechos, hover, seleção
src/ui.js                     busca, filtros, painel, cartão, legenda
src/main.js                   decodifica dados e liga tudo
tests/test_snv.py             pytest do pipeline
tests/model.test.mjs          node --test do model.js
tests/e2e.test.mjs            Playwright offline
mapa-rodovias.html            GERADO
```

## Formato de dados embutido (contrato entre Python e JS)

`window.SNV = { versao, ufs, dict, trechos, fis }`:
- `dict`: listas de valores para os campos categóricos, para que os registros guardem índices: `{br, uf, tipo, situacao, superficie, jurisdicao, adm, ul}`.
- `trechos`: array de registros, um por linha do SNV: `[codigo, iBr, iUf, iTipo, iSit, iSup, iJur, iAdm, iUl, kmIni, kmFim, ext, locIni, locFim, estCoinc, idFis]`.
- `fis`: array de trechos físicos, `{p: [lon0*1e5, lat0*1e5, dlon1, dlat1, ...] (inteiros delta-codificados), r: [índices em trechos], ext}`.
- `ufs`: `{type:"FeatureCollection"}` simplificado, com `properties.sigla` e `properties.label: [lon, lat]`.

---

### Task 1: Pipeline de dados (`scripts/snv.py`)

**Files:**
- Create: `requirements.txt`, `.gitignore`, `scripts/snv.py`, `tests/test_snv.py`

**Interfaces:**
- Produces:
  - `load_records(shp_path: str) -> list[dict]`: um dict por feição com os campos do SNV + `"points": list[tuple[float,float]]`, texto decodificado em UTF-8.
  - `group_physical(records: list[dict]) -> list[list[int]]`: grupos de índices; chave = `";".join(sorted(ds_coinc.split(";")))` se `desc_coinc == "Coinc"`, senão `vl_codigo`. Ordem dos grupos = ordem da primeira ocorrência. Dentro do grupo, ordenado por `vl_br`.
  - `check_group_consistency(records, groups) -> list[str]`: avisos quando situação/adm/UF/jurisdição/extensão diferem dentro de um grupo.
  - `simplify(points, tol: float) -> list[tuple]`: Douglas-Peucker iterativo; sempre devolve ≥ 2 pontos (duplicando o ponto se a entrada tiver 1).
  - `encode_line(points) -> list[int]`: quantiza ×1e5 com arredondamento e delta-codifica.
  - `build_payload(records, groups, tol) -> dict`: o objeto `window.SNV` sem `ufs` (contrato acima).

- [ ] **Step 1: Write failing tests** in `tests/test_snv.py`. Fixtures pequenas montadas em memória (dicts), mais um teste de integração marcado `@pytest.mark.skipif(not RAW.exists())` usando `data/raw/SNV_202607A.shp`:

```python
def test_group_coincident():
    recs = [rec("010BDF0010", "Coinc", "010BDF0010;020BDF0010", br="010"),
            rec("020BDF0010", "Coinc", "020BDF0010;010BDF0010", br="020"),
            rec("040BDF0010", "-", "", br="040")]
    assert group_physical(recs) == [[0, 1], [2]]

def test_simplify_keeps_two_points():
    assert len(simplify([(0, 0)], 0.01)) == 2
    assert len(simplify([(0, 0), (0.00001, 0)], 0.01)) == 2
    assert simplify([(0, 0), (1, 0.0001), (2, 0)], 0.001) == [(0, 0), (2, 0)]

def test_encode_line_roundtrip():
    assert encode_line([(-47.12345, -15.5), (-47.12245, -15.4999)]) == [-4712345, -1550000, 100, 10]

def test_real_data_totals():  # skip se dado bruto ausente
    recs = load_records(RAW); groups = group_physical(recs)
    assert len(recs) == 7673 and len(groups) == 7591
    assert round(sum(r["vl_extensa"] for r in recs), 1) == 131690.7
    assert round(sum(recs[g[0]]["vl_extensa"] for g in groups), 1) == 131085.2
    assert check_group_consistency(recs, groups) == []
    assert any("BRASÍLIA" in r["ds_local_i"] for r in recs)
```

- [ ] **Step 2:** `pip install -r requirements.txt && python -m pytest tests/test_snv.py -v` → FAIL (import error).
- [ ] **Step 3:** Implementar as funções acima. Copiar o zip do Drive (link direto `https://drive.usercontent.google.com/download?id=1PRZr6mPqbNVyqwF6cBxk049g3Tqya7gO&export=download&confirm=t`) e extrair em `data/raw/`.
- [ ] **Step 4:** `python -m pytest tests/test_snv.py -v` → todos PASS (incluindo o de integração).
- [ ] **Step 5:** Commit `feat: SNV data pipeline (load, group, simplify, encode)`.

### Task 2: Assets offline (`scripts/fetch_assets.py`)

**Files:**
- Create: `scripts/fetch_assets.py`, `data/ufs.geojson`, `vendor/leaflet/leaflet.js`, `vendor/leaflet/leaflet.css`, `vendor/fonts/inter-latin-{400,600}.woff2`, `vendor/fonts/hind-latin-{500,700}.woff2`
- Test: `tests/test_snv.py` (adicionar)

**Interfaces:**
- Produces: `data/ufs.geojson`, FeatureCollection de 27 features com `properties.sigla` (ex. "MG") e `properties.label: [lon, lat]` (ponto interno, *pole of inaccessibility* aproximado ou centroide do maior polígono, ajustado para cair dentro do polígono), geometria simplificada com tolerância ~0,01°.
- Fontes: IBGE `https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR?formato=application/vnd.geo+json&intrarregiao=UF&qualidade=intermediaria` (o `codarea` mapeia para sigla via `https://servicodados.ibge.gov.br/api/v1/localidades/estados`); Leaflet `https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/`; fontes `https://cdn.jsdelivr.net/npm/@fontsource/inter@5.0.18/files/inter-latin-400-normal.woff2` (idem 600; `@fontsource/hind@5.0.12` 500/700).

- [ ] **Step 1:** Teste `test_ufs_geojson`: 27 features, siglas = conjunto das 27 UFs, cada `label` dentro do bbox da própria feature, arquivo < 1,5 MB.
- [ ] **Step 2:** Rodar → FAIL (arquivo ausente).
- [ ] **Step 3:** Implementar `fetch_assets.py` (usa `simplify` de `snv.py` nos anéis; anéis com < 4 pontos após simplificação ficam com o original). Rodar uma vez.
- [ ] **Step 4:** Teste PASS; `ls -la vendor/**` mostra todos os arquivos com tamanho > 0.
- [ ] **Step 5:** Commit `chore: vendor offline assets (IBGE UFs, Leaflet, fonts)`.

### Task 3: Modelo JS (`src/model.js`)

**Files:**
- Create: `src/model.js`, `tests/model.test.mjs`, `package.json` (`{"type":"commonjs","scripts":{"test":"node --test tests/"}}`)

**Interfaces:**
- Consumes: contrato `window.SNV` (seção "Formato de dados").
- Produces (`src/model.js` define `const Model = {...}`; também `if (typeof module!=="undefined") module.exports = Model;`):
  - `Model.normalize(s: string) -> string`: minúsculas, sem acentos (NFD + remoção de diacríticos), espaços colapsados.
  - `Model.createIndex(snv) -> Index`: pré-computa o texto normalizado de busca por registro.
  - `Model.emptyFilters() -> Filters`: `{br:Set, uf:Set, situacao:Set, superficie:Set, jurisdicao:Set, adm:Set, tipo:Set}` (Sets de índices de dicionário; vazio = sem restrição).
  - `Model.recordPasses(snv, iRec, filters) -> boolean`.
  - `Model.visibleFis(snv, filters) -> Uint8Array`: 1 se algum registro do físico passa.
  - `Model.aggregate(snv, filters, visible) -> {km, n, porSituacao: [{i, km, pct}], porAdm: [...], porUf: [...]}`: soma `fis.ext` de cada físico visível uma vez. Para a quebra por categoria usa o registro principal (`r[0]`) do físico, **exceto** quando o filtro restringe aquele campo: aí usa o primeiro registro do físico que passa. Listas ordenadas por km desc, sem categorias com 0; `pct` = 0 quando `km` total = 0.
  - `Model.search(index, query, limit=12) -> [{kind:"br"|"trecho"|"local", label, sub, iBr?, iRec?}]`: regex `^\s*(br)?[\s-]*(\d{1,3})\s*$` → BR (primeiro resultado); query normalizada que casa com o prefixo de um código → trecho; senão substring em locIni/locFim → local (um resultado por registro, label = localidade, sub = `BR-xxx/UF · km a–b`).
  - `Model.fmtKm(x) -> string`: `Intl.NumberFormat('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})` + `" km"`.

- [ ] **Step 1: Failing tests** com um `snv` fixture de 4 registros / 3 físicos (um físico coincidente BR-010+BR-020 de 10 km, Duplicada, Concessão; um BR-040 de 5 km Pavimentada; um BR-116 de 2,5 km Planejada em "SÃO PAULO"):

```js
test('sem filtros soma físico uma vez', () => { const a = agg({}); assert.equal(a.km, 17.5); assert.equal(a.n, 3); });
test('só BR-020 conta o coincidente inteiro', () => assert.equal(agg({br:['020']}).km, 10));
test('BR-010 + BR-020 conta uma vez', () => assert.equal(agg({br:['010','020']}).km, 10));
test('filtro vazio de resultado', () => { const a = agg({uf:['AC']}); assert.equal(a.km, 0); assert.deepEqual(a.porSituacao, []); });
test('busca BR em várias grafias', () => { for (const q of ['116','BR-116','br 116',' BR116 ']) assert.equal(Model.search(idx,q)[0].label, 'BR-116'); });
test('busca sem acento', () => assert.equal(Model.search(idx,'sao paulo')[0].kind, 'local'));
test('fmtKm', () => assert.equal(Model.fmtKm(131085.2), '131.085,2 km'));
```

- [ ] **Step 2:** `node --test tests/model.test.mjs` → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat: client-side filter/aggregate/search model`.

### Task 4: Build do HTML (`scripts/build.py`) + mapa básico

**Files:**
- Create: `scripts/build.py`, `src/template.html`, `src/styles.css`, `src/styles-map.js`, `src/map.js`, `src/main.js`
- Test: `tests/test_snv.py` (adicionar `test_build_output`)

**Interfaces:**
- Consumes: `build_payload` (Task 1), assets (Task 2), `Model` (Task 3).
- Produces:
  - `python scripts/build.py --shp data/raw/SNV_202607A.shp --tol 0.0005 --out mapa-rodovias.html`, que imprime registros, físicos, soma bruta, soma deduplicada, vértices antes/depois e tamanho final em MB; sai com código ≠ 0 se `check_group_consistency` avisar ou se o arquivo passar de 15 MB.
  - Fontes embutidas como `@font-face { src: url(data:font/woff2;base64,...) }`; o CSS do Leaflet é embutido com as referências a imagens removidas (não usamos marcadores).
  - `LINE_STYLES` em `src/styles-map.js`: mapa nome-da-situação → `{color, weight, dash, opacity, z}`, com os valores da spec §4.2 (Duplicada `#183C80` peso 3.5 z 6; Pavimentada `#0071BB` 2.5 z 5; Em obra ×3 `#0071BB` 2.5 dash `"6 4"` z 4; Implantada `#525254` 2 dash `"6 4"` z 3; Leito Natural `#525254` 1.5 dash `"4 4"` z 2; Planejada `#525254` 1.5 dash `"1 4"` opacity 0.6 z 1; Travessia `#525254` 1.5 dash `"1 8"` z 2). Halo de concessão: mesma polyline por baixo em `#231F20`, peso +3, opacity 0.35. Pesos multiplicados por `zoomFactor(z) = clamp(0.6 + 0.15*(z-4), 0.6, 2)`.
  - `MapView` em `src/map.js`: `MapView.init(el, snv)`, `MapView.setVisible(visible: Uint8Array)`, `MapView.highlight(fisIds: number[] | null)`, `MapView.fitTo(fisIds)`, `MapView.fitBrasil()`, `MapView.onPick(cb(fisId, latlng))`. Usa `L.canvas({padding:0.5, tolerance:6})` e uma `L.Polyline` por físico (ordem por `z`). UFs: preenchimento `#525254` com opacidade 0.08, borda `#525254` 0.8 px com opacidade 0.5; siglas como `L.tooltip` permanentes (classe `.uf-label`, Inter 600 14 px, `#525254`). Mapa com `maxBounds` do Brasil + margem, zoom 4–13, `zoomSnap 0.5`.

- [ ] **Step 1:** Teste `test_build_output` (skip sem dado bruto): roda o build num diretório temporário; HTML existe, < 15 MB, não contém `http://`/`https://` em `src=`/`href=`/`url(` (regex), contém `window.SNV=`.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implementar o build, o template, os tokens no CSS e o mapa (UFs + trechos + hover que engrossa). Calibrar `--tol`: começar em 0.0005; se o arquivo ficar > 8 MB, subir para 0.001.
- [ ] **Step 4:** Teste PASS. Screenshot Playwright de `file://…/mapa-rodovias.html` em 1440×900, comparada visualmente com a imagem de referência (UFs cinza, siglas, linhas azuis/cinza).
- [ ] **Step 5:** Commit `feat: self-contained HTML build with base map and roads`.

### Task 5: Interface — busca, filtros, painel, cartão, legenda (`src/ui.js`)

**Files:**
- Create: `src/ui.js`
- Modify: `src/template.html`, `src/styles.css`, `src/main.js`

**Interfaces:**
- Consumes: `Model.*` (Task 3), `MapView.*` e `LINE_STYLES` (Task 4).
- Produces: `UI.init(snv, index)`, que monta o DOM. Estado único `filters`; cada mudança chama `refresh()` = `visibleFis` → `MapView.setVisible` → `aggregate` → render do painel (debounce de 50 ms).
- Layout: barra superior 56 px (Snow White, borda inferior, título Gadugi Bold Deep Blue 20 px "Malha Rodoviária Federal" + "SNV 202607A · DNIT" Light Grey 14 px); painel esquerdo 360 px rolável com seções colapsáveis: Busca, Filtros (cada grupo é um `<details>`; BR é uma lista com campo de busca e checkboxes; Situação tem atalhos "Pavimentadas" = {Duplicada, Pavimentada}, "Não pavimentadas" = {Implantada, Leito Natural}, "Em obra" = os 3 "Em obra…", "Planejadas" = {Planejada}), Números (KPI km + trechos em Deep Blue 32 px; barras horizontais por situação com amostra do estilo de linha em SVG, por administração, top 10 UF + "ver todas"; clicar numa barra adiciona aquele valor ao filtro). "Limpar filtros (n)" no topo dos filtros. Nota "Trechos coincidentes contados uma vez" abaixo do KPI.
- Cartão: painel flutuante no canto superior direito do mapa (320 px), aberto ao clicar num trecho, com os campos da spec §4.6; um bloco por registro quando o físico é coincidente; botão fechar (Esc também fecha).
- Busca: dropdown de sugestões navegável por teclado (↑↓ Enter Esc); selecionar dá `MapView.fitTo` + `highlight` (demais trechos com opacidade 0.25) e abre o cartão se o resultado for um trecho/local.
- Legenda: canto inferior direito do mapa, amostras SVG dos estilos + halo de concessão.
- Abaixo de 900 px o painel vira gaveta com botão (ícone `tune`).

- [ ] **Step 1:** Adicionar a `tests/e2e.test.mjs` os testes de interação (vão falhar): (a) KPI inicial contém `131.085,2 km` e `7.591`; (b) marcar UF=PR + Situação=Duplicada + Adm=Concessão Federal → KPI igual a `Model.aggregate` calculado no `page.evaluate` com os mesmos filtros e > 0; (c) digitar "116" e Enter → `MapView` com highlight ativo e KPI inalterado; (d) digitar "sobradinho" → primeira sugestão contém "SOBRADINHO"; (e) clicar em "Limpar filtros" volta ao KPI inicial.
- [ ] **Step 2:** Rodar → FAIL.
- [ ] **Step 3:** Implementar a UI; rebuild.
- [ ] **Step 4:** PASS; screenshots 1440×900 (estado inicial, filtro PR, cartão aberto) revisadas contra o checklist da marca (§10 do brand guide).
- [ ] **Step 5:** Commit `feat: search, filters, stats panel, detail card, legend`.

### Task 6: Verificação offline, performance e README

**Files:**
- Create/Modify: `tests/e2e.test.mjs`, `README.md`

- [ ] **Step 1:** Testes e2e: (a) `context.route('**/*', r => r.request().url().startsWith('file:') ? r.continue() : r.abort())` e lista de requisições não-`file:` == []; (b) zero `console.error`/`pageerror`; (c) aplicar um filtro e medir o tempo até o KPI mudar: < 200 ms; (d) `document.fonts.check('16px Inter')` true.
- [ ] **Step 2:** Rodar; corrigir o que falhar (rodar com `NODE_PATH=$(npm root -g)` ou `/root/node-tools/node_modules`, `executablePath` padrão do Playwright já aponta para `/opt/pw-browsers`).
- [ ] **Step 3:** README: o que é; como abrir (duplo clique); como regenerar (baixar o zip do SNV do DNIT/Drive → `data/raw/`; `pip install -r requirements.txt`; `python scripts/build.py ...`); como rodar os testes (`pytest`, `npm test`).
- [ ] **Step 4:** Rodar tudo: `python -m pytest -v && node --test tests/` → PASS.
- [ ] **Step 5:** Commit `test: offline/perf e2e checks; docs: README`.
