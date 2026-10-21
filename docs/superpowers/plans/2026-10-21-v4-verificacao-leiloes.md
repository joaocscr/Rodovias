# v4 — Leilões verificados, deságios 2007–2022, ranking de grupos e CSV · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrar os campos de leilão com o valor oficial e a fonte que o respalda (RoadShow e imprensa como níveis inferiores, sempre rotulados), preencher os leilões de 2007–2022, criar o ranking de grupos e a série de deságio, e exportar CSV em todas as tabelas.

**Architecture:** Uma camada curada `data/roadshow/verificacao.json` é aplicada em Python sobre a base congelada (`data/base/conc.json`) no `build.py` e no `scripts/intel/pipeline.py`, por `scripts/verificacao.py`; `entidades.json` e `mercado.json` continuam sendo a transcrição do RoadShow. O front recebe os valores exibidos já aplicados, mais `verif` (origem e fontes por campo); funções puras novas (`src/leiloes-model.js`, `src/csv.js`) fazem ranking, série e CSV.

**Tech Stack:** Python 3 + pytest; JS ES2020 sem bundler, `node --test`; Playwright (e2e, `--test-concurrency=1`); HTML único offline.

**Spec:** `docs/superpowers/specs/2026-10-21-v4-verificacao-leiloes-design.md`

## Global Constraints

- HTML único, **≤ 15 MB**, **zero requisições de rede**; nenhuma dependência nova (Python ou JS).
- Campos de leilão (únicos que a camada altera): `leilao`, `grupo_vencedor`, `desagio`, `assinatura`, `assinatura_aditivo`, `inicio_operacao`, `tarifa_teto`, `tarifa_vencedora`, `prazo_anos`.
- Hierarquia: `oficial` > `roadshow` > `imprensa`. Imprensa é sempre exibida como **"imprensa — não oficial"**, com veículo, data e link.
- Nada entra sem fonte; o valor do RoadShow nunca é apagado (vira divergência com a página). Nenhum número copiado do dashboard do colega sem documento achado e lido.
- Ranking: crédito ao **grupo da época do leilão**; aquisição posterior **não** junta nomes. Vencedor = **adjudicatário que assinou**; melhor lance inabilitado = participação com derrota + nota; deságio do adjudicatário não localizado → `—`, fora de médias, medianas e série.
- Agregados impressos pelo RoadShow (p. 25 deságio por nº de concorrentes; p. 27 faixas) ficam como impressos.
- Cores: só os tokens existentes (`Charts.C` Galapagos; `src/styles-map.js`); texto nunca na cor da série; toda marca com legenda.
- Linguagem da interface em português claro, sem nomes de campo; datas `dd/mm/aaaa`; números pt-BR.
- Desenvolvimento no branch `claude/confident-brown-k72wi2`; commit ao fim de cada tarefa.

## Review Focus

1. **Campo verificado como não localizado (`valor: null`)** — ficha, comparador, participantes e média mostram "—" e nunca `NaN`; o leilão sai da média e da série. Teste em Task 1 (`test_aplicar_nao_localizado_zera_valor_e_registra_roadshow`) e Task 5 (`mediaDesagio ignora nulos`).
2. **Valor novo igual a uma alternativa já registrada** (Lote 5: 23,83% da p. 15) — a divergência passa a mostrar 21,83% (p. 97) e não duplica 23,83%. Teste em Task 1 (`test_aplicar_troca_exibido_sem_duplicar_alternativa`).
3. **Mesmo grupo como vencedor e entre os demais proponentes do mesmo leilão** — conta uma vitória, sem derrota. Teste em Task 5 (`ranking conta grupo uma vez por leilão`).
4. **Célula de CSV com `;`, aspas, quebra de linha ou começando por `=`/`+`/`-`/`@`** — escapada e protegida. Teste em Task 6 (`Csv.cell protege e escapa`).
5. **Vencedor verificado com nome ausente de `grupos_alias.json`** — `validar` acusa erro e o build falha, em vez de o ranking contar o nome cru. Teste em Task 1 (`test_validar_nome_sem_alias`).

---

### Task 1: Camada de verificação em Python (esquema, validação, aplicação, relatório) e ligação no build e no pipeline

**Files:**
- Create: `scripts/verificacao.py`
- Create: `data/roadshow/verificacao.json` (semente: `{"versao": 1, "fontes": {}, "leiloes": []}`)
- Create: `data/roadshow/grupos_alias.json` (semente: `{"aliases": []}`)
- Modify: `scripts/build.py` (`build_from_base` e `build`: aplicar a camada depois de carregar/gerar `conc`; gravar `data/roadshow/verificacao.md`; `sys.exit` se `validar` retornar erros)
- Modify: `scripts/intel/pipeline.py` (`montar`: aplicar a camada ao `conc` lido antes de montar os itens)
- Test: `tests/test_verificacao.py`

**Interfaces:**
- Produces (Python, `scripts/verificacao.py`):
  - `CAMPOS: tuple[str, ...]` = os 9 campos de leilão das Global Constraints.
  - `PART_KEY: dict[str, str]` = `{"grupo_vencedor": "vencedor", "desagio": "desagio_vencedor", "leilao": "data"}` (demais campos: mesmo nome na linha de `participantes`).
  - `DOMINIOS_OFICIAIS: tuple[str, ...]` — sufixos aceitos para fonte `oficial`: `"gov.br"`, `"b3.com.br"`, `"jus.br"`, `"leg.br"`, `"imprensaoficial.com.br"`; extensível.
  - `carregar(path=ROADSHOW/"verificacao.json") -> dict`; `carregar_aliases(path=ROADSHOW/"grupos_alias.json") -> dict`.
  - `tipo_campo(fontes: list[dict]) -> str` — `"oficial"` se houver alguma oficial, senão `"roadshow"`, senão `"imprensa"`.
  - `validar(verif: dict, conc: dict, aliases: dict | None = None) -> list[str]` — mensagens de erro em português.
  - `aplicar(conc: dict, verif: dict, aliases: dict) -> dict` — devolve cópia profunda; não muta a entrada.
  - `cobertura(verif: dict) -> dict` com chaves `leiloes`, `oficial`, `roadshow`, `imprensa`, `nao_localizado` (contagem de campos).
  - `relatorio_markdown(verif: dict, conc_aplicado: dict) -> str`.
- Produces (dados no `conc` aplicado, consumidos pelo front nas Tasks 5–8):
  - Na entidade e na linha de `conc.mercado.participantes` / `conc.mercado.concorrentes_desagio`: `verif: {campo: {tipo: "oficial"|"roadshow"|"imprensa"|null, nao_localizado: bool, fontes: [Fonte], roadshow: valor_original|null}}`; `notas_verif: [{texto, fontes: [Fonte]}]`; `inabilitados: [{grupo, desagio, data, fontes: [Fonte]}]`.
  - `Fonte` = `{id, tipo, orgao, titulo, data, url, pagina, acesso, trecho}` (chaves ausentes = `null`).
  - `conc.verificacao = {fontes: [Fonte ordenadas por tipo e órgão], cobertura: cobertura(verif)}`; `conc.grupos_alias = aliases["aliases"]`.

Formato de `verificacao.json` (o validador impõe):

```json
{
  "versao": 1,
  "fontes": {
    "rs-p15": {"tipo": "roadshow", "pagina": 15},
    "antt-rip12-assinatura": {"tipo": "oficial", "orgao": "ANTT", "titulo": "…", "data": "2024-01-31",
                              "url": "https://www.gov.br/antt/…", "acesso": "2026-10-21", "trecho": "citação curta"},
    "infra-rip5": {"tipo": "imprensa", "orgao": "Agência iNFRA", "titulo": "…", "data": "2025-…", "url": "https://…", "acesso": "2026-10-21"}
  },
  "leiloes": [
    {"chave": "rip-lote-5", "ent": "rodovias-integradas-do-parana-lote-5",
     "participantes": {"ano": 2025, "lote": "<texto exato da linha>"}, "concorrentes": "<leilao exato>",
     "campos": {"desagio": {"valor": 23.83, "fontes": ["rs-p15", "infra-rip5"]}},
     "notas": [{"texto": "…", "fontes": ["…"]}],
     "inabilitados": [{"grupo": "…", "desagio": 9.0, "data": "2025-08-04", "fontes": ["…"]}]}
  ]
}
```

`ent`, `participantes` e `concorrentes` são opcionais (ao menos um); campo não localizado = `{"valor": null, "nao_localizado": true, "fontes": []}`.

Formato de `grupos_alias.json`: `{"aliases": [{"nome": "<como impresso ou verificado>", "grupo": "<grupo econômico>", "motivo": "mesmo nome|troca de nome|grafia|razão social do grupo|consórcio liderado por"}]}`.

- [ ] **Step 1: Write the failing tests** em `tests/test_verificacao.py`, com um `conc` mínimo de fixture (2 entidades, 2 linhas de `participantes`, 1 de `concorrentes_desagio`):
  - `test_tipo_campo_hierarquia`: `[imprensa, roadshow] → "roadshow"`; `[imprensa, oficial] → "oficial"`; `[imprensa] → "imprensa"`.
  - `test_validar_exige_fonte`: campo com `fontes: []` e sem `nao_localizado` → 1 erro contendo a chave do leilão.
  - `test_validar_oficial_dominio`: oficial com `url` `https://exemplo.com/x` → erro; `https://www.gov.br/antt/x` e `https://www.b3.com.br/x` → sem erro.
  - `test_validar_imprensa_completa`: imprensa sem `data` → erro.
  - `test_validar_ligacoes`: `ent` inexistente, `participantes` que não casa exatamente uma linha, `concorrentes` inexistente, campo fora de `CAMPOS`, fonte não declarada → um erro cada.
  - `test_validar_nome_sem_alias`: com aliases sem o nome verificado do vencedor → erro citando o nome; com o alias → sem erro.
  - `test_aplicar_troca_exibido_sem_duplicar_alternativa`: entidade com `desagio: 21.83`, `fontes: {"desagio": 97}`, divergência `{"campo": "desagio", "exibido": 21.83, "alternativas": [{"valor": 23.83, "pagina": 15}]}`; verificação `desagio = 23.83` (fontes `rs-p15`) → `e["desagio"] == 23.83`; divergência `exibido == 23.83`, `alternativas == [{"valor": 21.83, "pagina": 97}]`; `e["verif"]["desagio"]["tipo"] == "roadshow"`, `["roadshow"] == 21.83`.
  - `test_aplicar_nao_localizado_zera_valor_e_registra_roadshow`: `desagio: 9.0` → verificação não localizada → `e["desagio"] is None`, `verif.desagio.nao_localizado is True`, divergência criada com alternativa `{"valor": 9.0, "pagina": <página de e["fontes"]["desagio"]>}`.
  - `test_aplicar_participantes_e_concorrentes`: `grupo_vencedor` → linha `vencedor`; `desagio` → `desagio_vencedor` e `concorrentes_desagio[].desagio`; `leilao` → `data`; cada linha ganha `verif`.
  - `test_aplicar_nao_muta_entrada` e `test_aplicar_confirmacao_sem_mudanca`: valor oficial igual ao RoadShow → valor igual, `verif.tipo == "oficial"`, `roadshow is None`, nenhuma divergência nova.
  - `test_cobertura_conta_por_tipo`.
  - `test_dados_reais_validos`: `validar(carregar(), json de data/base/conc.json, carregar_aliases()) == []` (com a semente vazia já passa; garante as tarefas de dados).

- [ ] **Step 2: Run** `python -m pytest tests/test_verificacao.py -v` → FAIL (`ModuleNotFoundError: verificacao`).

- [ ] **Step 3: Implement `scripts/verificacao.py`** com as interfaces acima. A alternativa do RoadShow usa a página de `e["fontes"][campo]` (pode ser lista: use o primeiro número) ou `null`. A nota da divergência criada: `"RoadShow imprime {valor}; exibido o valor de fonte {rótulo}."` com rótulo `oficial` / `RoadShow` / `imprensa (não oficial)`.

- [ ] **Step 4: Ligue no build e no pipeline.** Em `build_from_base` e `build`: `verif, aliases = carregar(), carregar_aliases()`; `erros = validar(verif, conc, aliases)` → `sys.exit("Falha na verificação dos leilões:\n" + "\n".join(erros))` se houver; `conc = aplicar(conc, verif, aliases)`; gravar `ROADSHOW / "verificacao.md"`; imprimir uma linha `verificação: N leilões | oficial a | roadshow b | imprensa c | não localizado d`. O modo `--shp` grava em `data/base/conc.json` o conc **antes** de aplicar (a base continua sendo transcrição). Em `pipeline.montar`, aplicar a camada ao `conc` lido (import via `sys.path` de `scripts/`, como `build.py` faz).

- [ ] **Step 5: Run** `python -m pytest -q` (tudo verde), `python scripts/build.py` (imprime a linha de verificação, gera `data/roadshow/verificacao.md`) e `python scripts/intel/pipeline.py build` (sem diferença em `pipeline.json`, porque a semente está vazia).

- [ ] **Step 6: Commit** — `feat: verification layer for auction fields applied over the frozen base (build and pipeline)`.

---

### Task 2: Pesquisa e curadoria — leilões de 2023–2026

**Files:**
- Modify: `data/roadshow/verificacao.json`, `data/roadshow/grupos_alias.json` (nomes novos que surgirem)
- Generated: `data/roadshow/verificacao.md`, `data/intel/pipeline.json`, `mapa-rodovias.html`

**Interfaces:**
- Consumes: formato e `validar` da Task 1.
- Produces: entradas `leiloes[]` para os 25 leilões de 2023–2026 (`estado == "programa"` em `conc.entidades`), cada uma com `ent`, `participantes` (quando a linha existir) e `concorrentes`.

- [ ] **Step 1:** Para cada um dos 25 leilões, procure o documento oficial de cada campo de leilão: resultado/ata da B3, deliberação de homologação e página do contrato na ANTT, extrato do contrato no Diário Oficial, página do governo estadual (delegadas). O DOU (`in.gov.br`) não responde deste ambiente: use a página da ANTT ou do governo que reproduz o ato, e registre isso no `trecho`. Leia o documento antes de registrar.
- [ ] **Step 2:** Resolva as 7 correções da spec §3.1 (RIP Lote 5 deságio; Rota da Celulose vencedor, deságio, assinatura e nota K&G inabilitado em `inabilitados`; RIP Lotes 1, 2 e 4 assinatura; Via Liberdade início + nota "PPP estadual regulada pela Artemig"; Autopista Fluminense grafia do vencedor — na otimização de 2026, campo `grupo_vencedor`). Otimizações: conferir `assinatura` (contrato original) e `assinatura_aditivo` separadamente.
- [ ] **Step 3:** Onde só a imprensa traz o número, registre-a (`tipo: imprensa`). Fatos novos relevantes de imprensa viram `notas`.
- [ ] **Step 4:** Cada vencedor verificado novo entra em `grupos_alias.json`. Run `python -m pytest tests/test_verificacao.py -q` → PASS (inclui `test_dados_reais_validos`).
- [ ] **Step 5:** Run `python scripts/intel/pipeline.py build && python scripts/build.py`; confira `verificacao.md` (25 leilões; nenhum campo das 7 correções ausente).
- [ ] **Step 6: Commit** — `data: auction fields 2023-2026 verified against official sources`.

---

### Task 3: Pesquisa e curadoria — leilões de 2007–2022

**Files:** os mesmos da Task 2.

**Interfaces:**
- Consumes: Task 1; não depende da Task 2 (podem rodar em paralelo, cuidando do merge do JSON).
- Produces: entradas para os 22 leilões de 2007–2022 de `participantes`, com `participantes: {ano, lote}` e, quando o leilão originou um contrato vigente (14 casos, ex.: `transbrasiliana`, `autopista-litoral-do-sul`), `ent`.

- [ ] **Step 1:** Para cada leilão, procure na ANTT (atas, notas técnicas, deliberações de homologação, páginas da concessão), no TCU e no Diário Oficial: data do leilão, proponente vencedor (adjudicatário), deságio do vencedor, tarifa-teto e tarifa vencedora (com data-base, como texto), assinatura e prazo. O dashboard do colega só indica onde procurar.
- [ ] **Step 2:** Transbrasiliana 2007: confirmar vencedor (BRVias, 39,99% segundo o colega) e registrar a aquisição pela Triunfo como `nota`, não como alias.
- [ ] **Step 3:** Campos não achados ficam fora do JSON (valor do RoadShow mantido) ou `nao_localizado` quando o RoadShow não traz valor e a busca foi feita.
- [ ] **Step 4:** Aliases dos vencedores novos; run `python -m pytest tests/test_verificacao.py -q` → PASS; `python scripts/build.py`.
- [ ] **Step 5: Commit** — `data: 2007-2022 auctions — winner discount, dates and tariffs from official sources`.

---

### Task 4: Agrupamento de nomes para o ranking

**Files:**
- Modify: `data/roadshow/grupos_alias.json`
- Modify: `scripts/verificacao.py` (`validar` passa a exigir alias para **todo** nome de `participantes[].vencedor`, `participantes[].outros[].grupo` e `inabilitados[].grupo`, já com os valores verificados aplicados)
- Test: `tests/test_verificacao.py`

**Interfaces:**
- Consumes: Tasks 1–3 (nomes verificados).
- Produces: `grupos_alias.json` completo, usado pela Task 5 como `conc.grupos_alias`.

- [ ] **Step 1: Write the failing test** `test_aliases_cobrem_todos_os_nomes` (dados reais: lista de nomes sem alias == `[]`) e `test_alias_motivo_valido` (motivo ∈ conjunto do formato; sem nome duplicado).
- [ ] **Step 2: Run** → FAIL listando os nomes sem alias.
- [ ] **Step 3:** Curar um alias por nome. Juntam: troca de nome (CCR → Motiva), grafia, razão social ou SPE do grupo, consórcio liderado por um grupo (quando a fonte indicar o líder; senão o próprio consórcio é o grupo). Aquisição posterior **não** junta.
- [ ] **Step 4: Run** `python -m pytest -q` → PASS.
- [ ] **Step 5: Commit** — `data: economic group aliases for the 2007-2026 bidders`.

---

### Task 5: Modelo de leilões (JS puro) e gráfico de pontos no tempo

**Files:**
- Create: `src/leiloes-model.js` (exporta `LeiloesModel`, `module.exports` como os demais)
- Modify: `src/charts.js` (`dotsSvg` + `dots: into(dotsSvg)`)
- Modify: `scripts/build.py` (`JS_FILES`: `src/leiloes-model.js` logo depois de `src/conc-model.js`)
- Modify: `package.json` (`test` inclui `tests/leiloes-model.test.mjs`)
- Test: `tests/leiloes-model.test.mjs`, `tests/charts.test.mjs`

**Interfaces:**
- Consumes: forma das linhas de `conc.mercado.participantes` aplicadas (Task 1): `{ano, lote, vencedor, desagio_vencedor, data?, outros: [{grupo, desagio}], inabilitados?: [{grupo}], verif?}`; `conc.grupos_alias`.
- Produces:
  - `LeiloesModel.grupoDe(nome, aliases) -> string` (sem alias: o próprio nome).
  - `LeiloesModel.rankingGrupos(participantes, aliases, {de, ate} = {}) -> [{grupo, participacoes, vitorias, derrotas, taxa, primeira, ultima}]`, `taxa` em % (0–100), ordenado por participações desc, vitórias desc, grupo asc (`localeCompare` pt-BR).
  - `LeiloesModel.leiloesSemLista(participantes, {de, ate} = {}) -> number` (linhas com `outros` vazio).
  - `LeiloesModel.serieDesagio(participantes) -> [{x, y, label, tipo}]` — `x` = ano decimal de `data` (`AAAA-MM-DD`) ou `ano + 0.5`; `tipo` = `verif.desagio.tipo` ou `"roadshow"`; exclui `desagio_vencedor == null`.
  - `LeiloesModel.mediaDesagio(valores: (number|null)[]) -> number|null`.
  - `Charts.dotsSvg(data, {refY, refFromX, formatY, title, width, height}) -> string` — eixo x de min a max dos anos (não começa em 0); marcas: `oficial` círculo cheio `C.deep`, `roadshow` círculo cheio `C.bright`, `imprensa` círculo vazado `C.grey` tracejado; `<title>` por ponto com `label`; linha de referência horizontal em `refY` só a partir de `refFromX`.

- [ ] **Step 1: Write the failing tests** em `tests/leiloes-model.test.mjs`:
  - `ranking conta vitória e derrota`: leilão A (vencedor X, outros [Y]) e B (vencedor Y, outros [X, Z]) → X `{participacoes: 2, vitorias: 1, derrotas: 1, taxa: 50}`, Z `{1, 0, 1, 0}`.
  - `ranking conta grupo uma vez por leilão`: vencedor "CCR" e outros ["Motiva"] com alias CCR→Motiva → Motiva `{participacoes: 1, vitorias: 1, derrotas: 0}`.
  - `ranking inclui inabilitados como derrota`.
  - `ranking filtra período e calcula primeira/última`.
  - `leiloesSemLista conta outros vazio`.
  - `serieDesagio usa data e exclui nulos`: `{data: "2025-08-14", desagio_vencedor: 19.6}` → `x ≈ 2025.62`; `{ano: 2007, desagio_vencedor: null}` → excluído.
  - `mediaDesagio ignora nulos`: `[10, null, 20] → 15`; `[] → null`.
  - Em `tests/charts.test.mjs`: `dotsSvg: marca por tipo, referência só depois de refFromX, só cores da paleta, sem NaN` e `dotsSvg vazio não quebra`.
- [ ] **Step 2: Run** `npm test` → FAIL.
- [ ] **Step 3: Implement** `src/leiloes-model.js` e `Charts.dotsSvg`.
- [ ] **Step 4: Run** `npm test` → PASS.
- [ ] **Step 5: Commit** — `feat: auctions model (group ranking, discount series) and time dot chart`.

---

### Task 6: Exportar CSV em todas as tabelas

**Files:**
- Create: `src/csv.js` (exporta `Csv`)
- Modify: `src/main.js` (chamar `Csv.init()` depois da montagem inicial)
- Modify: `src/styles.css` (`.csv-btn`, estilo de botão secundário existente)
- Modify: `scripts/build.py` (`JS_FILES`: `src/csv.js` antes de `src/ui.js`), `package.json` (`tests/csv.test.mjs`)
- Test: `tests/csv.test.mjs`, `tests/e2e.test.mjs`

**Interfaces:**
- Produces:
  - `Csv.cell(v) -> string` — `null`/`undefined` → `""`; prefixo `'` se começar com `=`, `+`, `-`, `@`, tab ou CR; sempre entre aspas, aspas dobradas.
  - `Csv.build(headers: string[], rows: string[][]) -> string` — `"﻿"` + linhas unidas por `\r\n`, campos por `;`.
  - `Csv.fromTable(table: HTMLTableElement) -> {headers, rows}` — `thead th` e `tbody tr` visíveis (ignora linhas com `display:none` ou `hidden`); texto com espaços normalizados; célula com link acrescenta ` (<href>)`.
  - `Csv.filename(base: string, date = new Date()) -> string` — `<slug>-AAAA-MM-DD.csv`; `base` = `table.dataset.csvName` || `table.id` || título `h3` do cartão mais próximo || `"tabela"`.
  - `Csv.enhance(root = document)` — insere um `<button type="button" class="csv-btn">Exportar CSV</button>` antes de cada `table.grid` sem `data-csv` e marca a tabela; o clique lê a tabela **na hora** (filtros e ordenação atuais) e baixa via `Blob` + `a.download`.
  - `Csv.init()` — `enhance()` + `MutationObserver` em `document.body` que chama `enhance` para tabelas novas.

- [ ] **Step 1: Write the failing tests** em `tests/csv.test.mjs`:
  - `Csv.cell protege e escapa`: `'=1+1' → '"\'=1+1"'`; `'-5' → '"\'-5"'`; `'a;b' → '"a;b"'`; `'diz "x"' → '"diz ""x"""'`; `null → '""'`.
  - `Csv.build usa BOM, ; e CRLF`: `build(['A','B'], [['1','2']]) === '﻿"A";"B"\r\n"1";"2"'`.
  - `Csv.filename`: `filename('Participantes 2007–2026', new Date('2026-10-21T12:00:00')) === 'participantes-2007-2026-2026-10-21.csv'`.
- [ ] **Step 2: Run** `npm test` → FAIL.
- [ ] **Step 3: Implement** `src/csv.js`, ligar em `main.js`, CSS.
- [ ] **Step 4: Write e2e** em `tests/e2e.test.mjs`: `v4: toda table.grid visível tem botão CSV` (aba Projetos e Mercado) e `v4: CSV do comparador respeita filtro` (aplica um filtro de estado, `page.waitForEvent('download')`, lê o arquivo: começa com BOM, separador `;`, nº de linhas = linhas visíveis + 1).
- [ ] **Step 5: Run** `npm test`, `python scripts/build.py`, `npm run test:e2e` → PASS.
- [ ] **Step 6: Commit** — `feat: CSV export on every data table (offline, Excel pt-BR, formula-safe)`.

---

### Task 7: Selo de origem — ficha, comparador, cartão e Fontes

**Files:**
- Create: `src/selo.js` (exporta `Selo`; em `JS_FILES` antes de `src/ficha.js`)
- Modify: `src/ficha.js` (`rows`: selo após o valor quando há `campo`; popover; bloco "Notas da verificação"), `src/conc-model.js` (`comparatorRows`: `desagioOrigem`), `src/projetos.js` (`BASE_COLS`: `['desagioOrigem', 'Fonte do deságio', null, false]` logo após `desagio`), `src/fontes.js` (seção da verificação), `src/styles.css` (`.selo`, `.selo--oficial`, `.selo--roadshow`, `.selo--imprensa`)
- Test: `tests/conc-model.test.mjs`, `tests/e2e.test.mjs`

**Interfaces:**
- Consumes: `e.verif`, `e.notas_verif`, `e.inabilitados`, `conc.verificacao` (Task 1).
- Produces:
  - `Selo.rotulo(tipo) -> string`: `oficial → "oficial"`, `roadshow → "RoadShow"`, `imprensa → "imprensa — não oficial"`, `null`/não localizado → `"não localizado em fonte oficial"`.
  - `Selo.badge(v) -> string` (HTML): `''` se `v` ausente; senão `<span class="selo selo--<tipo>">rótulo</span>` com link (`target="_blank" rel="noopener"`) para a primeira fonte com `url`, e `title` listando todas as fontes (órgão, título, data).
  - `Selo.fonteTexto(f) -> string`: `"ANTT — <título> (dd/mm/aaaa)"`; RoadShow: `"RoadShow, p. N"`.
  - `ConcModel.comparatorRows` acrescenta `desagioOrigem: Selo.rotulo(...)`-equivalente em texto puro (`"oficial" | "RoadShow" | "imprensa — não oficial" | "não localizado em fonte oficial" | null`), sem depender de `Selo` (ConcModel é testado em node).

- [ ] **Step 1: Write the failing tests:** em `tests/conc-model.test.mjs`, `comparatorRows traz desagioOrigem` (entidade com `verif.desagio.tipo = "imprensa"` → `"imprensa — não oficial"`; sem `verif` e com deságio → `"RoadShow"`; sem deságio → `null`).
- [ ] **Step 2: Run** `npm test` → FAIL; **Step 3: Implement**; **Step 4: Run** `npm test` → PASS.
- [ ] **Step 5:** Ficha: o popover passa a se chamar "Divergência entre fontes" e lista alternativas como `valor (p. N)` ou `valor (fonte)`; bloco "Notas da verificação" com cada nota, os inabilitados ("<grupo>: <deságio>, inabilitado em dd/mm/aaaa") e as fontes. Fontes: seção "Verificação dos leilões" com a cobertura e uma `table.grid` (tipo, órgão/veículo, título, data, link, acesso).
- [ ] **Step 6: Write e2e:** `v4: ficha do Lote 5 do Paraná mostra selo e RoadShow na divergência` (ficha `#ficha/rodovias-integradas-do-parana-lote-5`: `.selo` presente no deságio; popover contém "p. 97"); `v4: ficha da Rota da Celulose mostra nota de inabilitação`; ajustar o teste `v2: aviso de divergência mostra páginas` ao novo título.
- [ ] **Step 7: Run** `python scripts/build.py && npm run test:e2e` → PASS.
- [ ] **Step 8: Commit** — `feat: source seals for auction fields (ficha, comparator, sources tab)`.

---

### Task 8: Aba Mercado — participantes verificados, série de deságio e ranking de grupos

**Files:**
- Modify: `src/mercado.js`, `src/styles.css` (se preciso)
- Test: `tests/e2e-intel.test.mjs` (ou `tests/e2e.test.mjs`, onde já estão os testes da aba Mercado)

**Interfaces:**
- Consumes: `LeiloesModel` (Task 5), `Charts.dots` (Task 5), `Selo` (Task 7), `conc.mercado` aplicado e `conc.grupos_alias` (Task 1).

- [ ] **Step 1:** Tabela de participantes: colunas novas "Data" (`data`, `dd/mm/aaaa`) e "Fonte" (`Selo.badge(p.verif?.desagio || p.verif?.grupo_vencedor)`); inabilitados listados nos demais proponentes com "(inabilitado)".
- [ ] **Step 2:** Cartão novo largo "Deságio do vencedor, 2007–2026" com `Charts.dots(box, LeiloesModel.serieDesagio(m.participantes), {refY: 18, refFromX: 2023, formatY: v => nf1.format(v) + '%'})`; legenda (oficial / RoadShow / imprensa — não oficial / linha de 18%: aporte de recursos vinculados, Portaria 995/2023, a partir de 2023); rodapé: "N leilões sem deságio do vencedor localizado".
- [ ] **Step 3:** Cartão "Concorrentes × deságio": subtítulo com `Média dos deságios exibidos: X% (RoadShow, pp. 25 e 27: 12,36%)` via `mediaDesagio`; pontos com deságio nulo não aparecem. Os cartões das pp. 25 e 27 ganham "como impresso no RoadShow" no subtítulo. Atualize `mercado.json` → `notas.concorrentes_desagio` para refletir o valor exibido do Lote 5 (nota é nossa, não transcrição).
- [ ] **Step 4:** Cartão largo "Grupos nos leilões, 2007–2026": filtros "de"/"até" (anos), `table.grid` `id="ranking-grupos"` com Grupo, Participações, Vitórias, Derrotas, Êxito (%), 1ª aparição, Última, ordenável por clique no cabeçalho; aviso fixo "Em N leilões do período o RoadShow não lista os demais proponentes: neles só o vencedor é contado." (`leiloesSemLista`); abaixo, `<details>` "Como os nomes foram agrupados" com a lista `nome → grupo (motivo)`.
- [ ] **Step 5: Write e2e:** `v4: Mercado mostra ranking com taxa de êxito e filtro de período altera as linhas`; `v4: série de deságio desenha pontos de 2007 a 2026 com legenda`; `v4: Transbrasiliana 2007 aparece com o vencedor verificado`.
- [ ] **Step 6: Run** `python scripts/build.py && npm test && npm run test:e2e` → PASS.
- [ ] **Step 7: Commit** — `feat: Mercado — verified bidders table, winner discount series 2007-2026, group ranking`.

---

### Task 9: Documentação, versão e fechamento

**Files:**
- Modify: `README.md` (abertura cita a v4; seção "Novidades da v4"; regra de fontes dos leilões em "Regras dos dados do RoadShow"; `verificacao.json`, `grupos_alias.json`, `verificacao.md`, `src/leiloes-model.js`, `src/csv.js`, `src/selo.js` na tabela de Estrutura; comando de testes inalterado)
- Modify: `docs/HANDOFF.md` (tabela de versões com a v4; **regra: cada entrega que entra na `main` por PR ganha um número inteiro**; arquitetura: camada de verificação; decisões novas — hierarquia de fontes, agregados impressos como impressos, crédito pelo grupo da época, vencedor = adjudicatário, aquisição não junta; pegadinha: DOU inacessível daqui; pendências da spec §6; contagens finais de testes)
- Generated: `mapa-rodovias.html`, `data/roadshow/verificacao.md`

- [ ] **Step 1:** Escrever README e HANDOFF.
- [ ] **Step 2: Run** `python -m pytest -q`, `npm test`, `python scripts/build.py` (≤ 15 MB, imprime a linha da verificação), `npm run test:e2e` → todos verdes; anote as contagens no HANDOFF.
- [ ] **Step 3: Commit** — `docs: v4 — README, HANDOFF (version rule, source hierarchy) and final build`; push para `claude/confident-brown-k72wi2`.
