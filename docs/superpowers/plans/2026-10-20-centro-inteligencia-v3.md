# Centro de Inteligência Rodoviária (v3) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Acrescentar ao `mapa-rodovias.html` as camadas de inteligência da spec v3: tráfego (VMDa, praças, SATs), acidentes, carga agrícola, ANTT (capas, séries, obras), malha e concessões estaduais, agro municipal, multimodal, pipeline e fontes.

**Architecture:** `scripts/intel/<dominio>.py` lê `data/raw/<dominio>/` (baixado por `fetch_<dominio>()` no mesmo arquivo, com `intel.fontes.fetch` + `Manifest`) e grava `data/intel/<bloco>.json` (versionado). Junções com o SNV só via `scripts/intel/snvbase.py` (`snv()`, `fis_of_km`, `snap`, `nearest`). `scripts/build.py` (já pronto) injeta `window.INTEL = {bloco: json}`. No navegador, `src/intel-model.js` é puro e testado com `node --test`; UI em módulos por aba.

**Tech Stack:** Python 3 + pandas + shapely + pyproj + pytest; Leaflet 1.9.4 vendorizado; JS ES2020 concatenado; `node --test`; Playwright (`npm run test:e2e`).

**Spec:** `docs/superpowers/specs/2026-10-20-centro-inteligencia-v3-design.md` (e v2/v1 em `docs/superpowers/specs/`).

**Recon (insumo obrigatório de cada tarefa de dados):** `/tmp/claude-0/-home-user-Rodovias/6776b381-5a2d-5604-a15f-01a4ae95c02c/scratchpad/recon/<dominio>.md`, com URLs que funcionaram, esquemas, pegadinhas e scripts de protótipo (caminhos citados no memo). Brutos já baixados em `data/raw/<dominio>/`.

## Global Constraints

- HTML único ≤ 15 MB, zero requisições de rede, abre em `file://`.
- Só as 5 cores da marca (`#183C80`, `#0071BB`, `#231F20`, `#525254`, `#F7F7F8`) mais opacidade. Texto ≥ 14 px; grid de 8 px; animações 150–300 ms.
- Formatos pt-BR: `R$ 7,34 bi`, `19,60%`, `734,9 km`, `12.345 veíc./dia`, `dd/mm/aaaa` ou `set/2026`; ausente = `—`.
- **Todo bloco `data/intel/*.json` tem `"fonte": {"nome", "url", "periodo", "acesso" (AAAA-MM-DD), "licenca", "nota"}`** (ou lista de fontes) e o rótulo modelado × medido: `"tipo": "modelado"` (VMDa, PNL) ou `"medido"` (praças, SATs, PRF, PAM, Comex, SIADE).
- Arrays por físico têm **exatamente 6.815 posições, na ordem de `data/base/snv.json` `fis`**; sem dado = `null` (não 0, que é valor real).
- Inteiros onde der; coordenadas com 5 casas; JSON compacto (`separators=(",", ":")`).
- `data/raw/` é gitignored e nunca é lido pelo build. Os testes de `data/intel/*.json` rodam sem `data/raw/`; testes que exigem brutos usam `skipif(not raw.exists())`.
- Cada script de dados expõe `fetch()` (baixa o que falta, registra em `data/manifest/<dominio>.json`) e `build()` (gera o JSON), e roda com `python scripts/intel/<dominio>.py [fetch|build|all]`. Convenção de import: no topo do módulo, `sys.path.insert(0, str(Path(__file__).resolve().parents[1]))` e então `from intel.snvbase import snv` / `from intel.fontes import fetch, Manifest`. Testes fazem `sys.path.insert(0, str(ROOT / 'scripts'))` e `from intel import <dominio>`.
- Não alterar `data/base/`, `data/roadshow/`, nem comportamento da v2 (testes da v2 seguem verdes).
- Testes Python em `tests/test_intel_<dominio>.py`.

## Contratos de dados (o front-end da Task 8+ depende deles)

`trafego.json`
```json
{"fonte":[...],"vmda":{"tipo":"modelado","ano":2023,"base_snv":"202401A","l":[...6815],"p":[...6815]},
 "acidentes":{"tipo":"medido","anos":[2024,2025],"n":[...],"m":[...],"fg":[...],"fl":[...]},
 "abcr":{"meses":["2016-10",...,"2026-09"],"leves":[...],"pesados":[...],"total":[...]}}
```
`vmda.l/p`: veíc./dia (int) ou null. `acidentes.*`: **totais somados dos anos listados** (int, 0 se nenhum, para todo fis — acidente zero é dado). ABCR: série original Brasil, 120 meses, 1 casa decimal.

`antt.json`
```json
{"fonte":[...],
 "pracas":{"tipo":"medido","campos":["nome","ent","conc","br","uf","km","lat","lon","fis","vmd","leves","pesados","moto","eixos","receita","meses"],
           "linhas":[[...]],"serie_meses":["2024-01",...,"2026-08"],"serie_l":[[...]],"serie_p":[[...]]},
 "sats":{"tipo":"medido","ano":2025,"campos":["id","conc","ent","br","uf","lat","lon","fis","vmd","pes","moto","meses"],"linhas":[[...]]},
 "capas":{"<ent_id>":{"nome":"...","situacao":"ativa|encerrada","sucessor":null,"controladora":"...","trecho":"...","extensao_km":850.9,
          "assinatura":"2014-03-12","inicio":"...","prazo":"30 anos","edital":"...","cobranca":"2015-09-06","database":"21/set","url":"..."}},
 "series":{"<ent_id>":{"anos":[2010,...,2025],"receita":[...],"investimento":[...],"custo":[...]}},
 "obras":{"tipo":"medido","campos":["ent","descricao","tipo","br","uf","km_i","km_f","fis","ano","previsto","executado","lat","lon"],"linhas":[[...]]}}
```
`ent` = id de entidade de `data/base/conc.json` ou null; `fis` = int ou null; `vmd`/`leves`/`pesados`/`moto` = média diária 2025 (dois sentidos); `eixos` = eixos médios do comercial (1 casa); `receita` = R$ 2025 (int); `meses` = meses de 2025 com dado; `pes`/`moto` em fração 0–1 (3 casas). Encerradas apontam `sucessor` (id). Valores R$ nominais.

`carga.json`
```json
{"fonte":[...],"tipo":"modelado","ano_base":2017,"cenario":"PNL 2035 base","gsa":[...6815],"total":[...6815],"veic":[...6815],"dist_m":[...6815]}
```
`gsa`/`total` em t/ano (int), `veic` veíc./dia (int) ou null quando o físico não casou (≤ 100 m) ou é `PLA`.

`municipios.json`
```json
{"fonte":[...],"topo":{TopoJSON objeto "mun", propriedades {"id":"5107925"}},"ids":["1100015",...],"nomes":["Alta Floresta D'Oeste",...],"uf":["RO",...],"centro":[[lon,lat],...]}
```
`agro.json`
```json
{"fonte":[...],"ids":[mesma ordem de municipios.ids],"ano":2025,
 "produtos":{"soja":[...],"milho1":[...],"milho2":[...],"cana":[...],"algodao":[...],"trigo":[...],"cafe":[...]},
 "armazenagem":{"periodo":"2º sem/2025","cap":[...],"sigilo":[0|1,...]}}
```
t (int) ou null (`"..."`); `"X"` → null com `sigilo=1`; `"-"` → 0.

`multimodal.json`
```json
{"fonte":[...],
 "ferrovias":[{"p":[linha codificada],"sit":"Em Operação","sigla":"EF-364","nome":"..."}],
 "portos":[{"nome":"...","tipo":"ETC|TUP|Porto Organizado|...","uf":"PA","lat":-4.3,"lon":-55.9}],
 "siade":[{"o":"Rondonópolis","uo":"MT","d":"Santos","ud":"SP","lo":[lon,lat],"ld":[lon,lat],"prod":"Soja","t":14700000}],
 "exportacao":{"ano":2025,"campos":["sh4","uf","urf","via","kg"],"linhas":[...],"sh4":{"1201":"Soja",...}},
 "fretes":{"mes":"ago/2026","campos":["origem","uf_o","destino","uf_d","km","rs_t","qualidade"],"linhas":[...]}}
```
`pipeline.json`
```json
{"fonte":[...],"itens":[{"id":"...","nome":"...","esfera":"federal|estadual","uf":["MT"],"rodovias":["BR-163"],"km":1009.5,
  "status":"estudo|consulta_publica|tcu|edital|leilao_agendado|leiloado|contrato|suspenso|cancelado","data_prevista":"2026-11-12",
  "ent":"rota-arco-norte","verificado":true,"fonte_url":"...","fonte_data":"...","obs":"..."}],
 "status":[{"key":"estudo","label":"Em estudo"},...]}
```
`estaduais.json` (Task 6; detalhada após o recon de estaduais)
```json
{"fonte":[...],"efis":[{"p":[...],"uf":"SP","via":"SP-330","cod":"...","sup":"PAV","km_i":0,"km_f":12.3,"ext":12.3,"conc":0|1}],
 "entidades":[{"id":"...","nome":"...","uf":"SP","poder":"ARTESP","grupo":"...","rodovias":["SP-330"],"km_decl":316.0,"km_map":312.5,
   "qualidade":"ok|aproximado|nao_mapeado","nota":"...","assinatura":"...","prazo":"...","capex":"...","fonte_url":"...","efis":[...],"fis":[...]}]}
```
`fontes.json` (Task 7): `[{"bloco","nome","url","periodo","acesso","licenca","tipo","nota"}]` + `"indisponiveis":[{"nome","url","motivo"}]`, gerado a partir dos `fonte` dos blocos e dos manifestos.

---

### Task 1: Tráfego — VMDa 2023, acidentes PRF, índice ABCR (`scripts/intel/trafego.py`)
- [ ] Testes em `tests/test_intel_trafego.py`: arrays com 6.815 posições; cobertura VMDa ≥ 85% dos km de físicos pavimentados (`snv().pavimentado(j)`), com null fora; mediana do total em pavimentados entre 1.500 e 6.000; acidentes: soma de `n` ≥ 98% das ocorrências 2024+2025 (73.202 + 72.529) e `m` ≥ 98% de 6.163 + 6.043; ABCR com 120 meses terminando em `2026-09`; `fonte` presente com `tipo`.
- [ ] Implementar a partir de `data/raw/trafego/` (`infrasa/vmda2023_data.json`, `prf/*`, `abcr/base_0926.xlsx`) e dos protótipos `data/raw/trafego/derivados/join_vmda.py` e `prf_join.py` (regras do memo: VMDa por código+km ponderado, fallback BR+UF+km; físicos coincidentes = maior total; PRF por BR+UF+km se a coordenada está a ≤ 5 km do físico, senão snap ≤ 500 m).
- [ ] `fetch()` com as URLs do memo (paginação ArcGIS com backoff) e manifesto.
- [ ] Gera `data/intel/trafego.json`; PASS.

### Task 2: ANTT — praças, SATs, capas, séries, obras (`scripts/intel/antt.py`)
- [ ] Testes `tests/test_intel_antt.py`: ≥ 250 praças com `fis` (de 277), ≥ 220 com `vmd` 2025; `serie_meses` de `2024-01` a `2026-08` e séries do mesmo tamanho; todo `ent` não nulo existe em `data/base/conc.json`; capas: as 36 ativas com `ent` válido e encerradas com `sucessor`; séries com anos 2010–2025; ≥ 450 SATs com fis e `pes` em [0,1]; ≥ 900 obras com `fis`; tamanho do JSON ≤ 400 KB.
- [ ] Implementar a partir de `data/raw/antt/` e dos protótipos em `scratchpad/antt/` (`namemap.py`, `snap_pracas.py`, `vol_agg.py`, `sat2.py`, `capas.py`): snap por coordenada ≤ 500 m mesma BR; RIOSP pórticos free flow: manter só o de entrada (PFE) e marcar no nome; dedupe de SAT por (entidade, identificador, mês, sentido, faixa, velocidade, tipo); filtrar SAT com < 6 meses ou NI > 30% ou VMD < 100.
- [ ] Gera `data/intel/antt.json`; PASS.

### Task 3: Carga agrícola — PNL 2035 cenário-base (`scripts/intel/carga.py`)
- [ ] Testes `tests/test_intel_carga.py`: 6.815 posições; ≥ 95% dos km pavimentados com `gsa` não nulo; `PLA` sempre null; o físico de maior `gsa` está em MT, GO, MS ou PR; `dist_m` ≤ 100 onde há valor.
- [ ] Implementar a partir de `data/raw/graos/` (Cenario-base-PNL00M2017) e `scratchpad/graos_scripts/pnl35_match.py`: 3 pontos por físico (25/50/75% do comprimento), link rodoviário (`GTYPE`=1) mais próximo de cada, mediana da distância ≤ 100 m, valor = mediana dos 3 links. Documentar na `fonte.nota` que `TO_*` é o carregamento modelado do PNL 2035, ano-base 2017.
- [ ] Gera `data/intel/carga.json`; PASS.

### Task 4: Municípios, agro, multimodal (`scripts/intel/agro.py`, `scripts/intel/multimodal.py`)
- [ ] Testes `tests/test_intel_agro.py` e `tests/test_intel_multimodal.py`: `municipios.ids` com 5.571 códigos (inclui 5101837 Boa Esperança do Norte); TopoJSON válido (cada geometria referencia arcos existentes); `municipios.json` ≤ 1,8 MB; soja Brasil 2025 entre 160 e 170 Mt e Sorriso (5107925) = 2.343.000 t; capacidade de armazenagem somada ≤ 210,5 Mt e ≥ 180 Mt; ferrovias só "Em Operação" com ≥ 200 linhas e JSON ≤ 400 KB; portos ≥ 1.000 no Brasil com as ETCs de Miritituba; SIADE com soja ≥ 35 Mt; exportação soja 2025 entre 105 e 110 Mt; fretes ≥ 100 rotas com `km` e `rs_t`.
- [ ] Implementar a partir de `data/raw/graos/` e do memo (§1–§9): malha `qualidade=minima` + 3 polígonos MT 2025 (5101837, 5107925, 5106240) simplificados e convertidos para arcos; centroides do `/metadados` (BEN pelo polígono); códigos Comex → IBGE (SP 34→35, GO 53→52, MS 52→50, DF 54→53); ANTAQ dbf em latin1; BaseFerro com `/@@download/file`; fretes do `conab/fretes_boletim_set2026.csv` (manter `qualidade`).
- [ ] Gera `data/intel/municipios.json`, `agro.json`, `multimodal.json`; PASS.

### Task 5: Pipeline (`scripts/intel/pipeline.py`)
- [ ] Testes `tests/test_intel_pipeline.py`: status só da lista do contrato; todo `ent` existe em `conc.json`; federal com `ent` para todos os projetos 2026–27 de `conc.json` (estados `agendado2026`, `projeto2027`); estaduais com `verificado` booleano e `fonte_url`; Polo Goiânia presente.
- [ ] Implementar a partir de `data/raw/pipeline/pipeline_rascunho.csv` (63 linhas), revisando contra o memo `recon/pipeline.md`; converter para o contrato; `data/intel/pipeline.csv` versionado como fonte editável e o JSON gerado dele.
- [ ] PASS.

### Task 6: Malha e concessões estaduais (`scripts/intel/estaduais.py`)
Detalhada após o recon `recon/estaduais.md` (ver ledger). Contrato acima; orçamento ≤ 4 MB.

### Task 7: Fontes e build (`scripts/intel/fontes_bloco.py`, `scripts/build.py`)
- [ ] `fontes.json` consolidado; manifesto `data/intel/manifest.json` (união de `data/manifest/*.json`); README atualizado com o fluxo `python -m scripts.intel.<d> all` + `python scripts/build.py`; build imprime tamanho por bloco; teste de tamanho total ≤ 15 MB.

### Task 8: `src/intel-model.js` (puro) + `tests/intel-model.test.mjs`
Módulo `IntelModel` no padrão de `src/conc-model.js` (IIFE, sem DOM, `if (typeof module !== 'undefined') module.exports = IntelModel;`), registrado em `scripts/build.py` `JS_FILES` logo após `src/conc-model.js` e em `package.json` `test`.
API (todas testadas com fixtures pequenas, sem ler `data/intel`):
- `rows(block)` → objetos a partir de `{campos, linhas}`.
- `MODES` = `{trafego, pesados, carga, acidentes}`, cada um `{label, unidade, tipo:'modelado'|'medido', fonte(intel) → texto curto}`.
- `metricArray(intel, snv, mode)` → array de 6.815 números ou `null`: `trafego` = `l+p`; `pesados` = `p`; `carga` = `gsa`; `acidentes` = `n / anos / ext` (acidentes por km por ano; `ext` de `snv.fis[j].ext`, null se ext = 0). Bloco ausente → todos null.
- `quantileBreaks(values, k = 5)` → `k-1` cortes crescentes sobre os valores não nulos e > 0 (quantis por posição, arredondados a 2 algarismos significativos, sem cortes repetidos; menos valores distintos → menos cortes).
- `classOf(v, breaks)` → `-1` (null), `0..breaks.length`.
- `aggregateIntel(intel, snv, visible)` → `{vkm, vkmPes, kmVmda, kmPav, acidAno, mortosAno, tkm, kmCarga}`: soma só físicos visíveis; `vkm = Σ (l+p)·ext`, `vkmPes = Σ p·ext`, `acidAno = Σ n / anos`, `tkm = Σ gsa·ext` (t·km/ano). Campos de bloco ausente = null.
- `taxaAcidentes(nTotal, anos, vmd, ext)` → acidentes por 10⁶ veíc·km: `nTotal / anos / (vmd · ext · 365) · 1e6`, null se vmd ou ext ausentes/0.
- `pointsOfFis(rows, j)` → índices das linhas com `fis === j` (praças, SATs, obras).
- `decodeTopo(topo, name = 'mun')` → `[{id, rings: [[[lat, lng], ...], ...]}]` para Polygon e MultiPolygon (todos os anéis achatados), aplicando `transform` (scale/translate) e deltas dos arcos; arco negativo `~i` invertido; ponto repetido na junção de arcos removido.
- Formatos pt-BR: `fmtInt(12345)` → `12.345`; `fmtVmd(12345)` → `12.345 veíc./dia`; `fmtT(27463308)` → `27,5 Mt`, `850000` → `850 mil t`, `950` → `950 t`; `fmtPct(0.33)` → `33,0%`; `fmtBRL(7.34e9)` → `R$ 7,34 bi`, `8.5e8` → `R$ 850,0 mi`; `fmtVkm(1.2e9)` → `1,2 bi veíc·km/dia`; null/undefined → `—` em todos.
- [ ] RED → GREEN → `npm test` verde (incluindo os testes v2).

### Task 9: Mapa — modos de cor quantitativos, legenda, painel de números
Arquivos: `src/styles-map.js`, `src/map.js`, `src/ui.js`, `src/main.js`, `src/styles.css`, `src/template.html` (título), novo `tests/e2e-intel.test.mjs` (mesmo harness de `tests/e2e.test.mjs`: Chromium, `file://`, bloqueio de rede, captura de erros) + `package.json` `test:e2e` rodando os dois arquivos.
- `main.js` passa `window.INTEL` (pode faltar: tudo degrada para "sem dado") a `MapView.init` e `UI.init`.
- Modos: o `mode-switch` vira um seletor "Cor das rodovias" com 6 opções na ordem Concessões · Situação física · Tráfego · Pesados · Carga agrícola · Acidentes (rótulos exatos), acessível (`role="radiogroup"` ou `<select>`), `MapView.setColorMode(m)` com `m ∈ {concessoes, fisica, trafego, pesados, carga, acidentes}`.
- Modos quantitativos (usam `IntelModel.metricArray` + `quantileBreaks` + `classOf`, calculados uma vez por modo): 5 classes; espessura crescente (1,5 → 6 px antes do `zoomFactor`) e cor das 5 classes em azul: classes 0–1 `#0071BB` com opacidade 0,45/0,7, classes 2–4 `#183C80` com opacidade 0,75/0,9/1; classe maior desenhada por cima (z). Sem dado: `#525254`, 1 px, tracejado `2 4`, opacidade 0,5. Halo de concessão não aparece nesses modos.
- Legenda nos modos quantitativos: título do modo + unidade, 5 linhas com faixa `a – b` formatada (`IntelModel` formats), linha "Sem dado", rótulo "Estimativa de modelo" ou "Contagem medida" (de `MODES[m].tipo`), e a fonte curta (`MODES[m].fonte(intel)`) com ano.
- Painel "Números da seleção": abaixo do KPI de km, novo bloco com `aggregateIntel` (só itens com dado): veíc·km/dia e % de pesados (Tráfego VMDa 2023), acidentes/ano e mortos/ano (PRF 2024–25), carga agrícola t·km/ano (PNL 2035 base 2017), cada um com `title` explicando a fonte. IDs: `#kpi-vkm`, `#kpi-acid`, `#kpi-tkm`.
- Cartão do trecho: bloco "Tráfego e segurança" com VMDa leves, pesados, total, % pesados (rótulo "estimado, 2023"), acidentes/ano, mortos/ano, taxa por 10⁶ veíc·km, carga agrícola t/ano (rótulo "modelo PNL, 2017"); omitido se nada houver.
- Título da página e do topo: "Rodovias do Brasil · Centro de Inteligência"; subtítulo mantém SNV e RoadShow.
- Performance: trocar de modo < 300 ms (medir no e2e com `performance.now()`), filtro segue < 200 ms.
- e2e (`tests/e2e-intel.test.mjs`): (a) seletor tem os 6 rótulos na ordem; (b) modo Tráfego → legenda com 5 faixas + "Sem dado" e "Estimativa de modelo"; (c) `MapView.colorMode()` = 'trafego'; (d) KPI `#kpi-vkm` igual a `IntelModel.fmtVkm(IntelModel.aggregateIntel(INTEL, SNV, mask).vkm)` com filtro UF = MT; (e) clicar num físico com VMDa (via `MapView.pick`) mostra "veíc./dia" no cartão; (f) modo Acidentes e Carga mudam a legenda; (g) troca de modo < 300 ms; (h) nenhum erro de console; (i) e2e da v2 seguem verdes (o modo padrão continua Concessões).

### Task 10: Mapa — camadas e cartões
- [ ] Painel "Camadas" (estaduais, concessões estaduais, praças, SATs, obras, ferrovias, portos, fundo municipal por produto/armazenagem); cartões de ponto; blocos novos no cartão do trecho; e2e.

### Task 11: Ficha ANTT, Projetos com esfera e pipeline
- [ ] Bloco ANTT na ficha; ficha de concessão estadual; coluna/filtro Esfera; seção Pipeline; e2e.

### Task 12: Abas Tráfego, Cargas, Fontes
- [ ] Novas abas no roteador; gráficos com `charts.js`; e2e.

### Task 13: Verificação final, desempenho, README, Drive
- [ ] e2e completos + v2; tamanho ≤ 15 MB; filtro < 200 ms; README; enviar `data/intel/manifest.json`, `data/intel/fontes.json` e os `data/intel/*.json` pequenos para a pasta Rodovias do Drive (subpasta `v3-dados`).
