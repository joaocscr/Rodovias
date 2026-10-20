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
Insumo: `recon/estaduais.md` e brutos em `data/raw/estaduais/` (Infra S.A. `Hosted/Rodovias_Estaduais` cide2021 em `infrasa/hosted_pages/`, ARTESP KMZ + fichas em `artesp/`, AGERGS XLSX, ABCR `abcr/abcr_fichas.json`; scripts de protótipo citados no memo: `est_coinc.py`, `kmz_scan.py`, `abcr_parse.py`, `est_tests.py`).
Contrato (substitui o provisório):
```json
{"fonte":[...],"tipo":"medido",
 "malha":{"base":"Infra S.A. Hosted/Rodovias_Estaduais (cide2021)","campos":["uf","via","sre","sup","km_i","km_f","ext"],"linhas":[[...]],"p":[[linha codificada], ...]},
 "entidades":[{"id":"sp-lt31-ecovias-noroeste","nome":"Ecovias Noroeste Paulista","esfera":"estadual","uf":"SP","poder":"Governo do Estado de SP","regulador":"ARTESP",
   "lote":"31","rodovias":["SP-310"],"trechos":[{"rod":"SP-310","km_i":227.8,"km_f":454.3}],"grupo":"EcoRodovias","estado":"vigente|encerrado",
   "km_decl":600.35,"km_map":612.8,"qualidade":"ok|aproximado|nao_mapeado","nota":"...","assinatura":"2023-05-01","fim":"2053-04-30","prazo":"30 anos",
   "capex_bi":11.3,"capex_ref":"2024","geo_metodo":"kmz|sre|snv|rod_km|rod","fonte_url":"..."}],
 "entEst":[[índices de malha.linhas]], "entFis":[[índices de fis do SNV]], "entGeo":[[linhas codificadas próprias]]}
```
Regras:
- Malha: descartar feições com fração > 0,8 sobre o SNV (buffer ~55 m, como `est_coinc.py`) e as federais; manter só pavimentadas (`PAV`, `DUP`, `EOP`) **mais** qualquer feição usada por uma entidade estadual; `tipo_trech` limpo; `sre` = 10 primeiros caracteres; DP 0,0003°; codificação `snvbase.encode_line`. `uf`/`via` em texto ("SP", "SP-330"). Feições sem UF descartadas.
- Entidades (todas as vigentes confirmadas do catálogo + as que só a ABCR traz): SP 25 contratos ARTESP + Rota Mogiana (geometria: Traçado do KMZ em `entGeo`; l19/l26/Mogiana por rod+km na malha SP), RS Rota de Santa Maria e Caminhos da Serra Gaúcha (por `sre` AGERGS; partes RSC/BRS também em `entFis` via SNV), MG (EPR Triângulo, EPR Sul de Minas, EPR Vias do Café, Via Nascentes, Ecovias Norte Minas; rodovias inteiras → `aproximado` salvo km), MT (Via Brasil MT-100 e MT-320/208, Lotes 1, 2, 5, 6, 8), MS (Way-306, MS-112 + BR-158/436 em `entFis`), BA (Bahia Norte, CLN BA-099, Estrada do Feijão BA-052), PA (Conquista do Pará), PE (Rota dos Coqueiros PE-024 km 0–6,5; Rota do Atlântico), RJ (Rota 116, Via Lagos: feições inteiras → `aproximado`), PI Transcerrados (`nao_mapeado` com nota). Não incluir Via Liberdade nem Ponte Binacional (já são entidades federais do RoadShow) nem os 6 lotes do PR (federais).
- Qualidade: `ok` se |km_map − km_decl| ≤ 10% ou ≤ 10 km; `aproximado` até 35% ou quando o recorte é por rodovia inteira; senão `nao_mapeado` com nota. ABCR só como fonte complementar (nunca sobrescreve ARTESP/AGERGS).
- Sem acentos recuperáveis na malha: manter como vem.
- [ ] Testes `tests/test_intel_estaduais.py`: `malha.linhas` e `malha.p` do mesmo tamanho; nenhuma feição federal; ≥ 15.000 feições; todas as 27 UFs exceto as sem malha (registrar quais); estaduais.json ≤ 3,2 MB; ≥ 45 entidades, ids únicos, todas com `qualidade` e `fonte_url`; SP ≥ 25 entidades (ruling: sem placeholders), todas com geometria (`entGeo` ou `entEst` não vazios) exceto as marcadas `nao_mapeado`; RS Rota de Santa Maria `ok` com km_map 204,5 ± 2; índices de `entEst` válidos; `entFis` válidos (< 6.815).
- [ ] Gera `data/intel/estaduais.json`; PASS.

### Task 7: Fontes, manifesto, build e documentação
Arquivos: novo `scripts/intel/fontes_bloco.py`, `data/intel/fontes.json`, `data/intel/manifest.json`, `tests/test_intel_fontes.py`, `scripts/build.py` (só o relatório de tamanho), `requirements.txt`, `README.md`.
- `fontes.json` = `{"fontes":[{"bloco","nome","url","periodo","acesso","licenca","tipo","nota"}], "indisponiveis":[{"nome","url","motivo"}], "base":[...]}`: uma linha por item de `fonte` de cada `data/intel/<bloco>.json` (bloco = nome do arquivo; `tipo` = `tipo` do item, senão o `tipo` do bloco/sub-bloco, senão "—"); `base` com o SNV 202607A (DNIT, via Drive do usuário, arquivo `202607A.zip`) e o RoadShow v40 (Ministério dos Transportes, 14/10/2026); `indisponiveis` curado a partir dos memos `recon/*.md` ("Não consegui / incerto"): portal PNCT do DNIT (`servicos.dnit.gov.br/dadospnct`), `SNV_VMDA_2021` e `Rodovias_Estaduais` ano-base 2024 da Infra S.A., DNIT Andamento de Obras, PPI, Sinfra-MT, painel ANTT de movimentação de cargas (só Power BI; LAI cgdam@antt.gov.br), carregamento PNL 2050 por link (LAI observatorio@infrasa.gov.br), Overpass/OSM — com o motivo em uma frase.
- `manifest.json` = união de `data/manifest/*.json` (lista; ordenada por domínio e arquivo), mais um resumo `{"arquivos": n, "bytes": total}`. O build **não** embute `manifest.json` (já excluído em `load_intel`) mas embute `fontes.json`.
- `scripts/build.py`: depois de montar, imprimir uma linha por bloco INTEL com o tamanho em KB (JSON compacto) e o total; manter a falha > 15 MB.
- `requirements.txt`: acrescentar `pandas`, `openpyxl`, `xlrd`, `shapely`, `pyproj`, `numpy` (com `>=` das versões instaladas).
- `README.md`: título "Rodovias do Brasil · Centro de Inteligência"; seção nova "Camadas de inteligência (v3)" com a tabela bloco → fonte → período → modelado/medido; "Atualizar os dados" com a ordem `python scripts/intel/{trafego,antt,carga,agro,multimodal,pipeline,estaduais}.py all`, depois `python scripts/intel/fontes_bloco.py` e `python scripts/build.py`; nota de que os brutos ficam em `data/raw/` (fora do git) e de que o manifesto e os JSON processados estão também na pasta Rodovias do Google Drive (subpasta `v3-dados`); atualizar a lista de estrutura e de testes. Manter o texto da v2 que continua válido; estilo de escrita do README atual.
- [ ] Testes: todo item `fonte` de todo bloco aparece em `fontes.json`; toda `url` começa com `http`; `indisponiveis` ≥ 6 itens; `manifest.json` tem tantos itens quanto a soma dos manifestos por domínio; `build.build_from_base` num `tmp_path` gera HTML ≤ 15 MB com `window.INTEL.fontes` presente e sem `manifest`.

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

### Task 10: Mapa — camadas de sobreposição e cartões de ponto
Arquivos: novo `src/layers.js` (camadas Leaflet; registrado em `scripts/build.py` `JS_FILES` depois de `src/map.js`), `src/ui.js`, `src/main.js`, `src/styles.css`, `src/styles-map.js`, `src/intel-model.js` (helpers puros novos + testes), `tests/e2e-intel.test.mjs`, `tests/intel-model.test.mjs`.
- Seção "Camadas" no painel esquerdo, acima de "Filtros", `<details open>` com checkboxes (todas desligadas por padrão, exceto nenhuma): **Rodovias estaduais** (só se `INTEL.estaduais` existir; linhas `#525254` 1 px opacidade 0,6; concessões estaduais por cima em `#183C80` 2,5 px — entidades de `estaduais.entidades` via `entEst`/`entGeo`), **Praças de pedágio** (círculo `#0071BB`, borda `#F7F7F8` 1 px, raio 3–10 px ∝ √VMD; sem VMD = 3 px opacidade 0,5), **SATs** (círculo vazado `#183C80` 1,5 px, raio 3), **Obras ANTT** (círculo `#231F20` raio 3, opacidade 0,7), **Ferrovias em operação** (`#231F20` 1,5 px tracejado `6 3`, opacidade 0,7), **Portos e ETCs** (só tipos Porto Organizado, Terminal de uso privado → "TUP", Estação de transbordo de cargas → "ETC", Porto Público → "Porto público"; quadrado/círculo `#231F20` raio 4), **Fluxos ferroviários de grãos** (SIADE: arcos retos origem→destino, espessura ∝ t, `#0071BB` opacidade 0,5).
- "Fundo municipal" (radio, padrão Nenhum): Soja · Milho (milho1+milho2) · Cana · Algodão · Café · Trigo · Armazenagem. Coroplético com 5 classes por quantil (`IntelModel.quantileBreaks` sobre valores > 0), preenchimento `#183C80` com opacidades 0,12/0,25/0,4/0,55/0,7, sem dado/zero sem preenchimento, borda `#525254` 0,3 px opacidade 0,3; pane abaixo das rodovias e acima das UFs. Legenda própria do fundo (faixas em t, ano e fonte "IBGE PAM 2025" / "IBGE Estoques 2º sem/2025"; sigilo explicado). Polígonos de `IntelModel.decodeTopo(INTEL.municipios.topo)`, construídos só quando o fundo é ligado pela 1ª vez.
- Clique num ponto/município abre o `#card` com cartão próprio: **praça** (nome, concessão com link "Ver ficha" se `ent` tiver ficha, rodovia/UF/km, VMD 2025, leves, pesados, motos, % pesados, eixos médios do comercial, receita 2025, gráfico mensal leves × pesados 2024-01..2026-08 com `Charts.lines`, rótulo "Contagem medida · ANTT"); **SAT** (id, concessão, VMD, % pesados, % motos, período = `periodo`, meses); **obra** (descrição, tipo, rodovia/km, ano, previsto × executado em %); **porto** (nome, tipo, UF); **município** (nome/UF, produção 2025 dos 7 produtos, armazenagem ou "sigilo"). Rótulo de rodovia: se `br` começa com "BR-" usa como está; se é só número, `"<uf>-<n>"`; senão o texto original.
- Cartão do trecho: lista "Medições no trecho" com as praças e SATs de `IntelModel.pointsOfFis` (nome, VMD medido), clicáveis.
- Fontes: cada camada tem `title` com fonte e período; nota no fim da seção Camadas: "Medido: praças, SATs (ANTT), PAM, Estoques. Modelado: VMDa, carga PNL."
- Desempenho: ligar qualquer camada < 400 ms (municípios: < 1.200 ms na 1ª vez); pan/zoom sem travar (canvas renderer próprio por camada).
- e2e: (a) seção Camadas com os rótulos; (b) ligar Praças → `Layers.count('pracas')` ≥ 230 e clicar programaticamente na praça de maior VMD mostra "veíc./dia" e um `svg` no cartão; (c) Portos mostra só os 4 tipos; (d) Fundo Soja → legenda do fundo com 5 faixas e "IBGE PAM 2025", clique em Sorriso (5107925) mostra "2.343.000 t" ou "2,3 Mt"; (e) Ferrovias e SIADE ligam sem erro; (f) Rodovias estaduais: se `INTEL.estaduais` ausente, checkbox não aparece; (g) tempo de ligar Praças < 400 ms; (h) nenhum erro de console; v2 e Task 9 seguem verdes.

### Task 11: Ficha com ANTT, ficha estadual, Projetos com esfera e pipeline
Arquivos: `src/ficha.js`, `src/projetos.js`, `src/intel-model.js` (helpers puros + testes), `src/main.js`, `src/tabs.js` (se preciso para `#ficha/<id estadual>`), `src/styles.css`, `tests/intel-model.test.mjs`, `tests/e2e-intel.test.mjs`. `Ficha.init`/`Projetos.init` passam a receber também `INTEL` (opcional; tudo degrada sem ele).
- **Ficha federal**, novos blocos (cada um omitido sem dado), depois dos blocos da v2:
  - "ANTT" (de `INTEL.antt.capas[id]`): controladora, trecho, extensão, assinatura, início, prazo, edital, início da cobrança, data-base de reajuste, link "Página da concessão na ANTT" (`url`). Contratos anteriores: capas com `sucessor === id` (ou `sucessores` contendo id) listadas como "Contrato anterior: <nome> (encerrado)".
  - "Receita, investimento e custo realizados" (de `INTEL.antt.series[id]` e das séries dos contratos anteriores, rotuladas): gráfico anual 2010–2025 em R$ nominais (barras agrupadas ou linhas de `Charts`), legenda e nota "R$ nominais · ANTT".
  - "Praças da concessão" (praças com `ent === id`): tabela nome · VMD 2025 · % pesados · receita 2025, ordenada por VMD; linha de soma da receita; nota "Contagem medida · ANTT 2025".
  - "Obras acompanhadas pela ANTT" (obras com `ent === id`): contagem concluídas (executado ≥ 1) · em andamento (0 < executado < 1) · não iniciadas (0), e as 10 com maior previsto ainda não concluídas (descrição, rodovia/km, executado %).
  - "Pipeline" (item de `INTEL.pipeline.itens` com `ent === id`): status (label), data prevista, fonte (link; etiqueta "não verificado" se `verificado === false`), obs.
- **Ficha estadual** (`#ficha/<id>` com id de `INTEL.estaduais.entidades`): título, etiqueta "Concessão estadual · <UF> · <regulador>", campos (poder concedente, grupo, rodovias, trechos com km, km declarado × mapeado, qualidade + nota, assinatura, fim, prazo, capex e referência, fonte com link), botão "Ver no mapa" que liga a camada de rodovias estaduais, realça e enquadra as linhas da entidade (via `Layers`), desabilitado com explicação se `nao_mapeado` sem geometria. `Ficha.exists` aceita ids estaduais. Esc e voltar funcionam como na v2.
- **Projetos**: coluna "Esfera" (Federal/Estadual) e filtro de esfera; linhas estaduais de um helper puro `IntelModel.estaduaisRows(intel)` no mesmo formato de `ConcModel.comparatorRows` (nome, brsUfs = rodovias/UF, estado `vigente`/`encerrado` com rótulos "Contrato estadual vigente"/"Contrato estadual encerrado", dataChave = assinatura, km = km_decl, capex = capex_bi, dataBase = capex_ref, vencedor = grupo; demais null). Filtros de estado da v2 não escondem as estaduais por engano (estado estadual entra na lista de estados do filtro). Totais somam o que está visível.
- **Pipeline** (nova seção na aba Projetos, entre o comparador e os estudos pós-2027): tabela nome · esfera · UF · rodovias · km · status · data prevista · fonte; filtros esfera e status; ordenada por data prevista crescente (sem data no fim); `verificado === false` mostra a etiqueta "não verificado"; linha com `ent` abre `#ficha/<ent>`; contagem por status no topo.
- e2e: (a) `#ficha/nova-rota-do-oeste` mostra "ANTT", "MTPAR", um `svg` de receita e a tabela de praças com ≥ 1 linha; (b) uma ficha sem capa ANTT (ex. projeto 2027) não mostra o bloco ANTT nem "undefined"/"NaN"; (c) `#ficha/<id estadual com geometria>` mostra "Concessão estadual" e "Ver no mapa" leva à aba Mapa com camada estadual ligada; (d) filtro Esfera = Estadual → só linhas estaduais e totais iguais à soma; (e) seção Pipeline com ≥ 60 linhas, ordenada por data, linha com `ent` abre a ficha; (f) itens não verificados mostram a etiqueta; (g) v2 (39 + 4 + 11 linhas com filtros vazios **e esfera federal**) continua válida: ajustar só o que a nova esfera muda, sem enfraquecer o teste; (h) nenhum erro de console.

### Task 12: Abas Tráfego, Cargas e Fontes
Arquivos: novos `src/trafego.js`, `src/cargas.js`, `src/fontes.js` (registrados em `scripts/build.py` `JS_FILES` antes de `src/ui.js`), `src/tabs.js` (abas na ordem Mapa · Projetos · Tráfego · Cargas · Mercado · Regulatório · Fontes), `src/template.html` (3 `section.page`), `src/main.js`, `src/styles.css`, `src/intel-model.js` (agregações puras + testes), `tests/intel-model.test.mjs`, `tests/e2e-intel.test.mjs`. Mesmo padrão visual da aba Mercado (`ccard`, `grid-cards`, `Charts.*Svg`, legenda, "Fonte: …" em cada cartão com período e rótulo medido/modelado). Cada aba degrada sem o bloco correspondente.
- **Tráfego**: (1) KPIs: praças com contagem 2025, VMD total somado, % pesados ponderado, veíc·km/dia (VMDa 2023), acidentes/ano e mortos/ano (PRF 2024–25); (2) ranking das 20 praças de maior VMD 2025 (barras horizontais leves × pesados empilhadas; clique abre a praça no mapa: aba Mapa, camada Praças ligada, cartão aberto); (3) série mensal 2024-01..2026-08 do VMD somado das praças com 32 meses completos (leves × pesados), com nota de quantas praças entram; (4) Índice ABCR: série de 120 meses leves × pesados × total (linhas) e perfil sazonal médio por mês (barras), nota "índice 1999 = 100, rodovias pedagiadas, não é volume"; (5) acidentes por UF (barras: acidentes/ano e mortos/ano, PRF por físico agregado à UF do trecho principal) e as 15 BRs/UF com maior taxa por 10⁶ veíc·km (só trechos com VMDa e ≥ 10 km somados).
- **Cargas**: (1) KPIs: soja, milho (1ª + 2ª), cana 2025 (PAM, t), capacidade de armazenagem (Mt), exportação 2025 de soja e milho (Mt); (2) produção de soja e milho por UF (barras empilhadas milho 1ª/2ª); (3) top 20 municípios de soja (barras; clique liga o fundo Soja no mapa e abre o município); (4) exportação 2025 por porto/URF para o produto escolhido (select entre os SH4 do bloco; barras horizontais top 12) e matriz UF × URF do produto (tabela das 10 maiores UFs × 8 maiores URFs, Mt); (5) fluxos ferroviários de grãos 2025 (SIADE, top 15 pares origem → destino, t); (6) fretes CONAB (tabela ordenável origem/UF → destino, km, R$/t, R$/t·km; filtro UF de origem; linhas `qualidade = aprox` com etiqueta "origem aproximada"); (7) trechos com maior carga agrícola modelada (PNL 2035 base 2017, top 15 físicos: BR/UF, local início → fim, t/ano; clique leva ao trecho no mapa).
- **Fontes**: tabela de `INTEL.fontes.fontes` (bloco, nome com link, período, acesso dd/mm/aaaa, licença, medido/modelado, nota), seção "Bases da v1/v2" (`base`), seção "Não disponíveis neste ambiente" (`indisponiveis`, com motivo), e um parágrafo explicando "medido × modelado" e a data de acesso.
- e2e: (a) barra de abas com as 7 abas na ordem; (b) `#trafego` tem ≥ 5 `svg`, cada cartão com "Fonte:"; clicar na 1ª praça do ranking leva a `#mapa` com o cartão da praça; (c) `#cargas` mostra KPI de soja igual a `IntelModel.fmtT(soma de agro.produtos.soja)`; trocar o produto da exportação muda o gráfico; tabela de fretes ordena por R$/t; (d) `#fontes` lista ≥ 30 fontes e ≥ 9 indisponíveis; (e) hashes inválidos continuam caindo no Mapa; (f) nenhum "undefined"/"NaN"; nenhum erro de console; v2/Tasks 9–11 verdes.

### Task 13: Verificação final, desempenho, README, Drive
- [ ] e2e completos + v2; tamanho ≤ 15 MB; filtro < 200 ms; README; enviar `data/intel/manifest.json`, `data/intel/fontes.json` e os `data/intel/*.json` pequenos para a pasta Rodovias do Drive (subpasta `v3-dados`).
