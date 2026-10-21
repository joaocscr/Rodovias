# Handoff · Rodovias do Brasil · Centro de Inteligência

Documento para retomar o projeto numa conversa nova. Estado em 21/10/2026: `main` em `4d88be8` (v3.1 e este HANDOFF); a v4 está no branch `claude/confident-brown-k72wi2`, aguardando o PR.

**Para começar uma sessão nova:** abra o repositório `joaocscr/Rodovias` em claude.ai/code e mande como primeira mensagem algo como *"Leia `docs/HANDOFF.md` e o `README.md`. Quero continuar com …"*.

## 1. Onde estamos

| Versão | O que entrou | PR |
|---|---|---|
| v1 | Mapa da malha federal (SNV 202607A), filtros, busca, soma de km | — |
| v2 | Concessões do RoadShow (federais), abas Projetos, Mercado e Regulatório | — |
| v3 | Centro de inteligência: tráfego (VMDa 2023, PRF, ABCR), ANTT (praças, SATs, obras), carga agrícola (PNL 2035), municípios e produção (PAM, armazéns), multimodal (ferrovias, portos, SIADE, Comex, fretes CONAB), pipeline de concessões, malha e concessões estaduais, catálogo de fontes | [joaocscr/Rodovias#1](https://github.com/joaocscr/Rodovias/pull/1) |
| v3.1 | Rotas de Integração Sul-Americana (MPO), paleta de dados estendida, VMDa Modelagem 2025 (federal e estadual, por sentido) | [joaocscr/Rodovias#2](https://github.com/joaocscr/Rodovias/pull/2) |
| v4 | Verificação dos leilões em fonte oficial (47 leilões), selo de origem, série de deságio 2007–2026, ranking de grupos econômicos, exportação CSV | a abrir (branch `claude/confident-brown-k72wi2`) |

**Regra de versão:** cada entrega que entra na `main` por PR ganha um **número inteiro** (v4, v5…). Não há mais "ponto um" (a v3.1 foi a última).

Entregável: `mapa-rodovias.html` (arquivo único, offline, ~11,6 MB; limite de 15 MB imposto pelo build). Testes verdes no fechamento da v4: pytest 221 passaram e 12 foram pulados, `npm test` 161, e2e 104. (Na v3.1 eram pytest 188 e 3 pulados, `npm test` 133, e2e 91; os 12 pulados de agora são os que exigem `data/raw/`, ausente neste container, então a contagem de passados não se compara com a da v3.1.)

Specs e planos de cada versão: `docs/superpowers/specs/` e `docs/superpowers/plans/`. Paleta: `docs/paleta.md`. Uso, camadas e comandos: `README.md`.

## 2. Arquitetura em uma página

- **Dados → blocos → HTML.** Cada `scripts/intel/<domínio>.py` tem `fetch` (baixa para `data/raw/<domínio>/` e registra no manifesto), `build` (gera `data/intel/<bloco>.json`) e `all`. O `scripts/build.py` lê a base congelada (`data/base/snv.json`, `conc.json`) e todos os `data/intel/*.json` (menos `manifest.json`), injeta como `window.SNV`, `window.CONC` e `window.INTEL` e concatena o JS na ordem de `JS_FILES`.
- **Camada de verificação dos leilões (v4).** `data/roadshow/verificacao.json` é uma camada curada, separada: por leilão, a chave de ligação (id da entidade, ou ano + lote de `mercado.participantes`), os campos de leilão com valor e ids de fontes, notas e proponentes inabilitados, e o catálogo de fontes (tipo `oficial`, `roadshow` ou `imprensa`). `scripts/verificacao.py` valida a camada (`validar`) e a aplica (`aplicar`) sobre as concessões lidas de `data/base/conc.json`: o front recebe o valor exibido, a origem (`verif`) e o valor do RoadShow quando difere (`divergencias`). `entidades.json` e `mercado.json` continuam sendo a transcrição do RoadShow. O `build.py` e o `scripts/intel/pipeline.py` aplicam a camada (por isso o pipeline lê datas de leilão e assinatura já verificadas) e o `build.py` gera `data/roadshow/verificacao.md` e imprime a linha de cobertura. `data/roadshow/grupos_alias.json` liga cada nome de proponente a um grupo econômico (motivo, `fontes` opcional) para o ranking. No front: `src/leiloes-model.js` (ranking, série e médias, puro), `src/selo.js` (selo de origem), `src/csv.js` (exportação) e `src/conc-model.js` (`origemCampo`, `participantesExibidos`). Os testes de dados estão em `tests/test_verificacao.py`.
- **Ordem de regeneração:** `trafego antt carga agro multimodal pipeline estaduais`, depois `vmda2025` (lê a malha estadual), `rotas`, `fontes_bloco.py` e `build.py`. Comandos completos no README, seção "Atualizar os dados".
- **Junção com o SNV:** `scripts/intel/snvbase.py` (`snv()`, `.trechos`, `.fis` com os 6.815 físicos, `find_km`, `fis_of_km`, `snap`, `nearest`, `geom_m` em EPSG:5880, `encode_line`/`decode_line`, `norm_br`). Todo array "por físico" tem 6.815 posições na ordem de `data/base/snv.json`; `null` significa sem dado.
- **Front:** Leaflet 1.9.4 vendorizado, renderização em canvas, JS ES2020 sem bundler, concatenado na ordem de `JS_FILES` (`scripts/build.py`). Os módulos puros, testados com `node --test`, são `model`, `conc-model`, `leiloes-model`, `intel-model`, `styles-map` (paleta), `charts`, `selo` e `csv` (a parte que não toca o DOM). Os módulos de UI são `map`, `layers`, `ficha`, `projetos`, `trafego`, `cargas`, `mercado`, `regulatorio`, `fontes`, `ui`, `tabs` e `main`. O e2e usa Playwright com `--test-concurrency=1`, porque em paralelo fica instável.
- **Cada bloco** tem `fonte` e `tipo` (`modelado`, `medido` ou `cadastro`). A interface rotula modelado × medido e mostra o ano.
- **Paleta:**
  - A interface e a malha federal base usam o Galapagos (`#183C80`, `#0071BB`, `#231F20`, `#525254`, `#F7F7F8`).
  - As cores de dados vêm só dos tokens de `src/styles-map.js`:
    - `DATA`: 8 slots categóricos.
    - `ROTAS`: 5 cores.
    - `RAMPS`: um tom por modo (Tráfego azul, Pesados roxo, Carga laranja, Acidentes vermelho).
    - `ROTAS_DIM`: fator 0,35.
  - Toda cor de dado tem legenda ou rótulo, e o texto nunca vem na cor da série.
  - `tests/palette.test.mjs` roda o validador.

### Como acrescentar um leilão verificado

1. Em `data/roadshow/verificacao.json`, acrescente o leilão em `leiloes`: uma `chave` única, a ligação (`ent` com o id da entidade, `participantes` com `ano` e `lote` da linha de `mercado.participantes`, `concorrentes` com o nome do leilão em `mercado.concorrentes_desagio`; uma ou mais), os `campos` com `valor` e `fontes` (ou `nao_localizado`), e `notas` e `inabilitados` quando houver.
2. No mesmo arquivo, cadastre em `fontes` cada documento citado: `oficial` (órgão, título, URL http(s) de domínio oficial, data de acesso e trecho), `imprensa` (órgão, data, URL e acesso; só em notas, junções e inabilitações) ou `roadshow` (página).
3. Em `data/roadshow/grupos_alias.json`, ligue cada nome novo de proponente (vencedor, demais e inabilitados) a um grupo econômico, com o `motivo` e, quando a junção não se lê no nome, `fontes`. O crédito é do grupo da época do leilão: aquisição posterior não junta nomes.
4. Rode `python -m pytest tests/test_verificacao.py`: a validação acusa fonte faltando, URL fora de http(s), ligação inexistente ou repetida, valor de tipo errado e nome sem grupo.
5. Rode `python scripts/build.py`: ele valida de novo, regenera `data/roadshow/verificacao.md` (cobertura e divergências) e o `mapa-rodovias.html`.

## 3. Restaurar os brutos (`data/raw/`, fora do git, ~4 GB)

- **Fontes públicas:** `python scripts/intel/<domínio>.py fetch` baixa de novo (o manifesto em `data/intel/manifest.json` tem URL, data, tamanho e SHA-256).
- **Arquivos do usuário (Google Drive):** só descem se estiverem compartilhados por link. Use `curl -L "https://drive.usercontent.google.com/download?id=<ID>&export=download&confirm=t" -o <destino>`.

| Arquivo | ID no Drive | Destino |
|---|---|---|
| VMDa – Modelagem 2025 (VGeo/DNIT) | `1gnXpMWMLs4uZ9mWZf2SxlNe6R8LcdFha` | `data/raw/trafego/vmda2025/vgeo_vmda2025.zip` |
| RoadShow (PDF) | `1zStkFuN8kJSMWYRygewJw6ZI70TZMwy9` | `data/raw/roadshow.pdf` |
| SNV `202607A.zip` | `1PRZr6mPqbNVyqwF6cBxk049g3Tqya7gO` (precisa de link compartilhado) | extrair em `data/raw/` (só para `build.py --shp`) |

- **Pastas no Drive:**
  - `Rodovias`: `12dLB6bWWw46hpY6DXwSi-410tFPh5eV2`.
  - Subpasta `v3-dados`: `1snRqfTWHDxCv_ryc-XGOON7off6QTS-L`, com `manifesto-fontes-v3.csv`, `fontes.json` e `pipeline.csv`, atualizados na v3.1.
- **Sem os brutos,** o `build.py` funciona normalmente, porque lê só `data/base/` e `data/intel/`. Os testes que exigem bruto são pulados.

## 4. Pegadinhas do ambiente

- **Portais inacessíveis daqui:** os do DNIT (`dadospnct`, VGeo). Por isso o VMDa 2025 veio do Drive. Os portais gov.br e da Infra S.A. oscilam; o `fontes.fetch` tem novas tentativas.
- **`balanca.mdic.gov.br` (Comex):** exige a cadeia intermediária SERPRO acrescentada ao bundle de CA. Nunca desligue a verificação TLS.
- **Conector do Google Drive:**
  - Só carrega arquivos de texto pequenos. Use `textContent` com quebras LF; base64 e CRLF truncam.
  - `update_file` não substitui conteúdo; para isso, crie um arquivo novo e mande o antigo para a lixeira.
  - Arquivos grandes descem pelo link de download acima.
- **O container reinicia e mata processos em segundo plano.** Antes de retomar, confira o que ficou em disco.
- **O DOU (`www.in.gov.br`) não responde daqui.** Os atos do DOU foram lidos em reproduções oficiais (ANTTlegis, Atlas Público) ou em páginas da ANTT, e cada fonte diz isso no trecho. O extrato da assinatura da Rota da Celulose no DOE-MS também não pôde ser consultado (o site de imprensa oficial de MS responde 403).
- **Sites do governo de Minas Gerais** (`artemig.mg.gov.br`, `infraestrutura.mg.gov.br`) falham na verificação TLS: um usa a raiz nova da Let's Encrypt (ISRG Root YR) ausente do container e o outro não envia o certificado intermediário. Baixe `root-yr.pem` e `int-yr2.pem` de `letsencrypt.org/certs` (por TLS verificado), acrescente-os a uma **cópia** do bundle do proxy no scratchpad e use `curl --cacert`. Nunca desligue a verificação TLS.
- **Campo Grande News e a gazeta de MS** respondem 403 de forma intermitente por `curl`; o `WebFetch` ou uma nova tentativa costuma funcionar.
- **A base do SNV está congelada** em `data/base/`, extraída dos payloads da v2, porque o shapefile não desceu pelo conector. Para regenerar, use `build.py --shp`, que também reescreve `data/base/`.
- **As rotas do MPO não têm geodado oficial.** Foram extraídas do PDF vetorial (apresentação de 01/07/2026, p. 7) e georreferenciadas por 70 cidades (RMS ~9 km), por isso são rotuladas "esquemático". Os insumos derivados ficam em `data/raw/rotas/derived/`.

## 5. Decisões já tomadas (não reabrir sem motivo)

Cada uma com o que custa se estiver errada.

| Decisão | Custo se errada |
|---|---|
| VMDa = 0 vira `null` (sem dado) | trechos de tráfego real ~0 aparecem como "sem dado" |
| Veículos PNL: anual ÷ 365 | escala diária da carga desloca se a base for dias úteis |
| Datas de leilão e assinatura do pipeline seguem o valor exibido pela camada de verificação (na v3 seguiam `conc.json`); as demais datas continuam do `conc.json` | divergência com a fonte do pipeline quando houver atualização só em um lado |
| Limiares de praça contados por entrada do cadastro | praça com várias entradas pesa mais |
| SAT: janela de 12 meses com fallback para o último período disponível | período diferente entre SATs |
| Concessões estaduais desenhadas a partir dos físicos (entFis), com estilo próprio | trechos de cortes aproximados podem sobrar ou faltar |
| "Vigente" exige evidência positiva; a entidade de exemplo da Mota-Engil foi removida; o limiar de SP é ≥ 25 | concessões reais podem ficar fora até haver fonte |
| MT Lote 6 está no pipeline como "leiloado"; MT fase 2 não está marcada como suspensa; as 8 entidades da Ager-MT foram aceitas | status desatualizado se houver novidade |
| Cortes de rodovia inteira marcados "aproximado" | — (só rótulo) |
| No Drive ficam só arquivos pequenos (CSV/JSON); os brutos não | restaurar exige rodar o `fetch` |
| O ranking de praças mostra motos | — |
| Série de tráfego por concessão acrescentada | — |
| Fretes CONAB com distância implausível (25 rotas) marcados `km_suspeito` | — (sinalizados, não removidos) |
| Participações com 1 casa decimal | — |
| PLA fora do ranking de taxa de acidentes (os trechos com valor continuam no mapa) | — |
| Rótulo de tipo "Cadastro" | — |
| Linhas estaduais com espessura ×0,55 no modo Tráfego | hierarquia visual federal × estadual |
| Cores das rotas aprovadas; camadas temáticas esmaecidas a 0,35 com as rotas ligadas | — |
| "Uso restrito" só para "Não Simulável" (não para < 200 veíc./dia num sentido) | links de baixo volume sem aviso |
| VMDa 2025 é a base do Tráfego e do veíc·km; Pesados continua em 2023; pesados 2025 = 2025 × participação 2023, rotulado "estimativa" | estimativa de pesados enviesada onde o mix mudou |
| **v4:** hierarquia de fontes dos campos de leilão: oficial (ato de órgão público) > RoadShow > imprensa, esta sempre marcada "não oficial" | um valor de imprensa ou do RoadShow aparece onde havia ato oficial não achado |
| **v4:** o valor do RoadShow que não é o exibido fica registrado como divergência; nada entra sem fonte; `entidades.json` e `mercado.json` não são reescritos | — (reversível) |
| **v4:** agregados impressos pelo RoadShow (médias da p. 25, faixas da p. 27) continuam como impressos, rotulados; só os cálculos do painel usam o valor exibido | a média impressa (12,36%, 25 leilões) e a exibida (12,83%, 24 leilões, sem a Ponte São Borja) convivem, com nota que explica |
| **v4:** crédito pelo grupo da época do leilão; aquisição posterior não junta (vira nota) | uma vitória fica com o grupo antigo (ex.: Transbrasiliana 2007 é do BRVias, não da Triunfo) |
| **v4:** vencedor é o adjudicatário que assinou; quem deu o melhor lance e foi inabilitado é participação com derrota, com nota e data (Rota da Celulose: K&G 9% inabilitado em 04/08/2025; Caminhos da Celulose 8%) | — |
| **v4:** em vigentes, o "Vencedor" é o da época do leilão (BRVias, OHL Brasil, Planalto…), com o rótulo do RoadShow como divergência e a aquisição como nota | a ficha mostra o vencedor histórico e não o controlador atual |
| **v4:** OHL Brasil (vencedora dos 5 lotes de 2007) é um grupo próprio no ranking, separado da Arteris: o controle foi vendido em 2012 à Abertis e à Brookfield, e o nome mudou depois; a nota de cada lote explica | a Arteris aparece sem as vitórias de 2007 |
| **v4:** consórcio no ranking conta para o grupo líder quando a fonte indica, senão para cada grupo nomeado; "razão social do grupo" só exige `fontes` quando a expansão não é óbvia (o teste confere) | alguns nomes triviais sem fonte |
| **v4:** deságio limitado pelo edital (Rio-SP 15,31%, Araguaia 16,25%, desempate por outorga) tem o flag `limitado_pelo_edital`; entra nas médias e aparece com anel na série | dois pontos com ressalva em vez de excluídos |
| **v4:** Ponte São Borja: 0,38% é ágio sobre a outorga mínima, não deságio de tarifa; deságio `não localizado` (sai de séries e médias), RoadShow fica como divergência | a ficha mostra "—" onde o RoadShow imprime 0,38 |
| **v4:** `tarifa_teto` e `tarifa_vencedora` são texto (valor, unidade e data-base), porque as unidades variam (R$/praça, R$/100 km) | sem ordenação numérica de tarifas |
| **v4:** nas otimizações, `assinatura` é o contrato original e `assinatura_aditivo` o aditivo (rótulos distintos); o `prazo_anos` conta do aditivo | — |
| **v4:** a ficha mostra também tarifa-teto, tarifa vencedora e prazo da concessão (campos de leilão da spec) | o prazo pode repetir um valor dos extras |
| **v4:** o início da operação da Rota da Celulose fica "não localizado" (o do RoadShow, 30/12/2025, é anterior à assinatura exibida) | um campo com "—" |
| **v4:** Rota dos Sertões passou de "leiloado" a "contrato" no pipeline, com a assinatura de 29/09/2026 | uma linha do pipeline |
| **v4:** a nota de `mercado.concorrentes_desagio` foi reescrita (comentário nosso, não transcrição) em `mercado.json`, em `data/base/conc.json` e em `scripts/extract/mercado.py` | o texto diverge da promessa de "intocado" |
| **v4:** Via Liberdade segue como concessão na lista; a natureza de PPP estadual é só nota | a esfera da entidade fica como no RoadShow |

## 6. Pendências

### Adiadas pelo usuário ("para um segundo momento")

- **PNCT por posto de contagem** (contagens medidas do DNIT). O portal não é acessível daqui; precisa de download pelo usuário.
- **Pedidos via LAI:**
  - Cargas da ANTT: cgdam@antt.gov.br.
  - PNL 2050 / matrizes OD: observatorio@infrasa.gov.br.
- **ANTAQ:** Estatístico Aquaviário (movimentação portuária).
- **Malha estadual de 2024:** a atual é a CIDE 2021 da Infra S.A.
- **Editais dos lotes estaduais com km inicial e final:** hoje há cortes aproximados.

### Fora do escopo da v4 (próximos passos, spec §6)

- Enriquecer a ficha dos 22 lotes de 2023–2025 sem ficha no RoadShow (edital, tarifa-teto, TIR, praças, duplicação).
- Aba Resumo ("leitura em 60 segundos").
- Linha do tempo de editais e leilões 2026–2027.
- Pista pelo SNV no cartão da concessão (km duplicados, simples, em obra).
- Gráficos de conteúdo do RoadShow ainda sem gráfico (ABDIB p. 39, debêntures p. 77, pavimento p. 35, comparativos pp. 41 e 45, diagramas pp. 61 e 73–77).
- Reconciliação declarado × recalculado como teste.
- Reclassificar entidades por esfera (ex.: Via Liberdade como PPP estadual).

### Pendências da verificação dos leilões (dados)

- **Fontes que não puderam ser lidas daqui:** o extrato do contrato da Rota da Celulose no DOE-MS (a assinatura exibida, 06/02/2026, vem da agência de notícias do governo de MS; a imprensa diz 02/02/2026) e as páginas do Ministério dos Transportes sobre o leilão e a assinatura da Ponte São Borja (assinatura de 25/11/2025 só pela imprensa). O início da operação da Rota da Celulose segue não localizado em fonte oficial.
- **Régis Bittencourt:** o prazo de 15 anos vem de minuta de aditivo e a B3 dá 25; registrar a B3 como divergência.
- **Ponte São Borja:** a ficha diz "não localizado em fonte oficial" para o deságio, mas o critério não se aplica (leilão por outorga); um rótulo como "não se aplica (leilão por outorga)" seria mais exato (a nota já explica).
- **Datas previstas do RoadShow sem fonte** continuam exibidas onde não há fonte melhor (ex.: início previsto da Rota dos Sertões, 11/10/2026).
- **Rótulos e notas:** Nova 381 tem um trecho de citação emendado com "[…]"; o rótulo "4UM" é inconsistente; quatro leilões usam atas por não terem ato de homologação localizado; a cláusula de derivação do 0,00% das otimizações (tarifa = referência) falta no trecho do edital; a nota do Rota Agro cita imprensa redundante para o deságio; a nota da Rio Minas não diz "outorga" no critério; a tarifa da Via 040 ("por praça") é inferida e deveria usar o texto da nota técnica ("TBP, categoria 1"); a nota da EcoPonte diz "duas" de forma ambígua.
- **Grupos:** "grafia" no Rota do Cerrado é exagero; "liderado" no Consórcio Infraestrutura GO → EPR segue como julgamento (Reuters: "A EPR…"; o consórcio é EPR + Perfin); o líder do 116 Sertões não consta do documento oficial.

### Menores de código da v4, ainda abertos

- **`scripts/verificacao.py`:**
  - `_fmt` arredonda números de `tarifa_*` (hoje são texto, então só vale se voltarem a ser números).
  - `tipo_campo([])` devolve `None` (o front trata como "—").
  - `campos` que não são dicionário levantam `AttributeError`.
  - `ano`, `lote` ou `concorrentes` malformados (lista ou dicionário) levantam `TypeError` na validação.
- **Gráficos (`src/charts.js`, `src/leiloes-model.js`):** `anoDecimal` aceita mês e dia fora do intervalo; o rótulo imprime "null" se o vencedor for nulo; o último rótulo do eixo x pode faltar; uma asserção negativa é fraca; a troca de classe do eixo y é frágil.
- **CSV (`src/csv.js`):** o filtro que esconde linhas não tem teste; o `queueMicrotask` é redundante; números negativos saem como texto (pela regra da spec); a coleta de links (`csv.js:35`) lê a célula original, o que pode vazar links de dentro de `<details>`.
- **Mercado e ficha:** `fmtData(i.data)` não passa por `esc` em `proponentesTxt`; os seletores de período (de > até) não sincronizam depois da troca; a nota da série (`SERIE_NOTA`) aparece sempre; falta teste negativo do desempate por deságio na regra de mesmo proponente (`participantesExibidos`).

### Menores, registrados nas revisões

- **Mapa e layout:**
  - O recolhimento da legenda não é reavaliado quando a janela muda de tamanho.
  - Os rótulos GF e SR se sobrepõem.
  - A legenda do Tráfego cobre o leste do Brasil em 1366 px.
  - O layout foi afinado para 1440×900.
  - O código usa `_animatingZoom`, que é privado do Leaflet.
- **Formatação:**
  - `fmtPeriodo` não trata datas ISO completas.
  - O `tipo` dos portos aparece cru.
  - Os nomes dos fretes têm artefatos.
- **Dados:**
  - A coordenada do estaleiro Keppel Fels está imprecisa.
  - VMD 0 de praça deveria virar `null`.
  - `antt.json` está perto do limite de tamanho do teste.
  - A correlação VMDa 2023 × 2025 é 0,861, com o teste exigindo ≥ 0,85: pouca folga.
- **Textos:**
  - Os trechos PLA com valores precisam de texto explicativo.
  - Revisar o texto "carteira MT v40".
  - Revisar o "≤ 5%" da ficha.
  - Na spec v3.1, a linha "relatórios 2023–2025" deveria dizer 2024–2025 (o que foi baixado).

## 7. Processo usado

Brainstorming e spec, depois plano, depois execução por subagentes: uma tarefa por vez, cada uma com brief, implementação com TDD, revisão de spec e revisão de qualidade. No fim, uma revisão do branch inteiro e uma rodada de correções (na v4, a revisão final corrige parte dos menores acima; confira o histórico do PR para ver quais). Antes de abrir o PR, rodar as três suítes e `python scripts/build.py`, conferindo o tamanho. O desenvolvimento é feito num branch `claude/*` e entra na `main` por PR, com merge só quando o usuário pede.
