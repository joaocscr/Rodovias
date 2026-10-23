# Handoff · Rodovias do Brasil · Centro de Inteligência

Documento para retomar o projeto numa conversa nova. Estado em 23/10/2026: `main` em `4d88be8` (v3.1 e a primeira versão deste HANDOFF). A verificação dos leilões, o fechamento do projeto e os ajustes seguintes (abas Debêntures e Glossário, fichas de grupo e consórcio, "Sobre este painel", aba Fontes derivada dos blocos, clareza das abas) estão no branch `claude/confident-brown-k72wi2`, no PR [joaocscr/Rodovias#4](https://github.com/joaocscr/Rodovias/pull/4), aberto e ainda sem merge (o merge só sai quando o usuário pede).

**Para começar uma sessão nova:** abra o repositório `joaocscr/Rodovias` em claude.ai/code e mande como primeira mensagem algo como *"Leia `docs/HANDOFF.md` e o `README.md`. Quero continuar com …"*.

## 1. Onde estamos

| Versão | O que entrou | PR |
|---|---|---|
| v1 | Mapa da malha federal (SNV 202607A), filtros, busca, soma de km | — |
| v2 | Concessões do RoadShow (federais), abas Projetos, Mercado e Regulatório | — |
| v3 | Centro de inteligência: tráfego (VMDa 2023, PRF, ABCR), ANTT (praças, SATs, obras), carga agrícola (PNL 2035), municípios e produção (PAM, armazéns), multimodal (ferrovias, portos, SIADE, Comex, fretes CONAB), pipeline de concessões, malha e concessões estaduais, catálogo de fontes | [joaocscr/Rodovias#1](https://github.com/joaocscr/Rodovias/pull/1) |
| v3.1 | Rotas de Integração Sul-Americana (MPO), paleta de dados estendida, VMDa Modelagem 2025 (federal e estadual, por sentido) | [joaocscr/Rodovias#2](https://github.com/joaocscr/Rodovias/pull/2) |
| v4 — final | Verificação dos leilões em fonte oficial (47 leilões), selo de origem, série de deságio 2007–2026, ranking de grupos econômicos, exportação CSV. Fechamento: aba Resumo como página inicial, linha do tempo de editais e leilões, pista pelo SNV nas concessões, gráficos e diagramas do RoadShow que faltavam, reconciliação dos totais, atualização em um comando com relatório de curadoria | [joaocscr/Rodovias#4](https://github.com/joaocscr/Rodovias/pull/4) (aberto) |
| ajustes e debêntures (mesmo PR) | Aba **Debêntures** (emissões, cenário de juros, mercado secundário com spread sobre a NTN-B e a chave "ver somado"), aba **Glossário** (61 termos ligados às outras abas), **ficha de grupo e de consórcio** no Mercado (base `consorcios.json`, 34 consórcios), **Sobre este painel** no Resumo, aba **Fontes** montada dos blocos embutidos (`fontes_descricao.json`), diagnóstico por ano e correções do Mercado, passe de clareza em todas as abas, retirada de menções a versões e à empresa do autor | [joaocscr/Rodovias#4](https://github.com/joaocscr/Rodovias/pull/4) (aberto) |

**Regra de versão:** cada entrega que entra na `main` por PR ganha um **número inteiro** (v4, v5…). Não há mais "ponto um" (a v3.1 foi a última).

Entregável: `mapa-rodovias.html` (arquivo único, offline, ~12,1 MB; limite de 15 MB imposto pelo build). Testes verdes na entrega: pytest 460 passaram, 9 foram pulados e 22 são falhas esperadas (`xfail`, as divergências do próprio RoadShow da reconciliação); `npm test` 267; e2e 152. Os pulados são os que exigem `data/raw/` ou o PDF do RoadShow; a contagem de passados muda conforme o que existe em `data/raw/`, então compare só no mesmo container.

Specs e planos de cada versão: `docs/superpowers/specs/` e `docs/superpowers/plans/`. Paleta: `docs/paleta.md`. Uso, camadas e comandos: `README.md`.

## 2. Arquitetura em uma página

- **Dados → blocos → HTML.** Cada `scripts/intel/<domínio>.py` tem `fetch` (baixa para `data/raw/<domínio>/` e registra no manifesto), `build` (gera `data/intel/<bloco>.json`) e `all`. O `scripts/build.py` lê a base congelada (`data/base/snv.json`, `conc.json`) e todos os `data/intel/*.json` (menos `manifest.json`), injeta como `window.SNV`, `window.CONC` e `window.INTEL` e concatena o JS na ordem de `JS_FILES`.
- **Camada de verificação dos leilões.** `data/roadshow/verificacao.json` é uma camada curada, separada: por leilão, a chave de ligação (id da entidade, ou ano + lote de `mercado.participantes`), os campos de leilão com valor e ids de fontes, notas e proponentes inabilitados, e o catálogo de fontes (tipo `oficial`, `roadshow` ou `imprensa`). `scripts/verificacao.py` valida a camada (`validar`) e a aplica (`aplicar`) sobre o CONC montado por `roadshow.conc_da_base` (base congelada `data/base/conc.json`, de onde vem só o recorte do SNV, mais os JSON curados de `data/roadshow/`: `entidades.json`, `mercado.json`, `regulatorio.json`): o front recebe o valor exibido, a origem (`verif`) e o valor do RoadShow quando difere (`divergencias`). `entidades.json` e `mercado.json` continuam sendo a transcrição do RoadShow. O `build.py` e o `scripts/intel/pipeline.py` aplicam a camada (por isso o pipeline lê datas de leilão e assinatura já verificadas) e o `build.py` gera `data/roadshow/verificacao.md` e imprime a linha de cobertura. `data/roadshow/grupos_alias.json` liga cada nome de proponente a um grupo econômico (motivo, `fontes` opcional) para o ranking. `data/roadshow/consorcios.json` traz a composição dos consórcios (por nome, ano e lote do leilão; integrantes com grupo e participação, `null` quando não publicada; `fora_da_camada` para nome que só as atas trazem, `fora_da_ata` para nome da camada que a ata não lista), com ids do catálogo de fontes de `verificacao.json`; `validar` o confere e `aplicar` o entrega como `conc.consorcios`. No front: `src/leiloes-model.js` (ranking, série e médias, puro), `src/selo.js` (selo de origem), `src/csv.js` (exportação) e `src/conc-model.js` (`origemCampo`, `participantesExibidos`). Os testes de dados estão em `tests/test_verificacao.py`.
- **Camada de verificação, acréscimos do fechamento.**
  - `nao_se_aplica: true` num campo (hoje só no `desagio`, com `valor: null` e ao menos uma fonte que explique o critério): o front mostra o selo "não se aplica (leilão por outorga)", o campo fica fora das séries e médias, e a cobertura o conta à parte (`cobertura.nao_se_aplica`). Não se combina com `nao_localizado`.
  - `alternativas: [{valor, fontes}]` num campo: outra fonte oficial dá um valor diferente do exibido. Entra como alternativa da divergência da ficha ("25 (B3, 23/07/2026)"). Só vale em leilão ligado a uma entidade (`ent`), e o valor tem de diferir do exibido.
  - Campo `edital` (data `AAAA-MM-DD` ou só `AAAA-MM`, só em `ent`): serve para corrigir a data do edital quando o RoadShow se contradiz (Rota Arco Norte e Rota Norte Catarinense, pelo cronograma das pp. 117 e 153; a data da ficha fica como divergência). Depois de aplicada, a camada confere edital ≤ leilão e falha o build se a sequência for impossível.
  - A camada tem, por isso, 49 entradas: 47 leilões verificados e 2 só com a data do edital. Uma entrada só com `edital` não conta como leilão verificado: a cobertura a conta à parte (`cobertura.so_edital`, "entradas só com edital") e o relatório de curadoria continua pedindo o resultado depois da data do leilão (`verificacao.tem_resultado`).
  - `rsDiverge` (em `src/leiloes-model.js`) decide se a linha "RoadShow: …" aparece: some quando o nome impresso pertence ao mesmo grupo econômico do nome verificado (compara pelo grupo, ignora acento, caixa, pontuação e "Consórcio"), e fica quando é grupo de outra época (BRVias × TPI).
- **Campos curados relidos a cada build.** `build_from_base` relê de `data/roadshow/` os blocos `mercado.json` e `regulatorio.json` e, por `id`, os campos das entidades de `entidades.json` (estado, datas, valores, textos). Da base congelada (`data/base/conc.json`) fica só o que depende do SNV: `idx`, `entFis`, `fisEnt`, `km_mapeado`, `nota_trecho` (a `qualidade` é recalculada com o km declarado atual). Entidade nova ou removida em `entidades.json` pára o build com a mensagem "precisa de recorte no SNV: rode build.py --shp". O `scripts/intel/pipeline.py` usa o mesmo caminho (`roadshow.conc_da_base`), então uma data editada em `entidades.json` chega também à aba Projetos.
- **Atualização em um comando.**
  - `scripts/atualizar.py` roda, na ordem, o `fetch` (com `--baixar`, só do que falta; com `--renovar [domínios]`, refazendo o download) e o `build` de cada domínio, o bloco de fontes, a validação da camada de verificação e o `build.py`. Passo cujo bruto falta é pulado com aviso (os JSON voltam ao que eram); só a validação ou o HTML com falha dão saída 1.
  - `scripts/curadoria.py` (funções puras) gera o relatório `data/atualizacao.md`: o que mudou por bloco em relação ao último commit e a lista de curadoria manual, em doze tipos: os seis do leilão e do pipeline (pipeline atrasado, leilão sem verificação, concessão ainda "a leiloar" com leilão passado, item sem fonte oficial, fonte com mais de 12 meses, nome sem grupo), os dois dos consórcios (`consorcio_sem_composicao`, `consorcio_fora_da_ata`) e os quatro das debêntures (`emissor_sem_classificacao`, `debentures_sem_serie`, que inclui os dias sem curva das NTN-B, `taxa_fora_do_intervalo` e `linha_sem_data`).
  - A data de acesso de um arquivo só muda quando o SHA-256 muda. Testes: `tests/test_atualizar.py`, `tests/test_curadoria.py`, `tests/test_build_base.py`.
- **Debêntures (domínio `debentures`).**
  - **Fluxo.** `scripts/atualizar.py` roda o domínio logo depois do `pipeline`. Ele lê as planilhas de `data/raw/debentures/*.xlsx` (fora do git), baixa as séries públicas (Selic, CDI, IPCA 12 meses, Focus e histórico do Tesouro Direto, em `data/raw/debentures/publico/`; o `--baixar` sempre as renova) e gera `data/intel/debentures.json`. Sem planilha na pasta, o domínio é pulado e o bloco fica como estava.
  - **Só agregados.** O bloco guarda totais por dia, emissor, subsetor e (nas intenções) direção, mais o último negócio e a última intenção de cada papel; nunca as linhas das planilhas (há teste). Os negócios fechados (BTG) e as intenções de compra e venda (XP) ficam em listas separadas; a chave "ver somado" da tela os recombina no navegador (`src/debentures-model.js`), ponderando taxa e spread pelo volume e sem misturar indexadores.
  - **Universo** pela lista curada `data/debentures/emissores.json` (nome inteiro normalizado, sem acento, caixa e "S.A."), porque a coluna "Setor" da tela BTG não é confiável (classifica concessionárias de rodovia como "Comércio" ou "Construção Civil"). Emissor novo que não casa vai para a curadoria (`emissor_sem_classificacao`) e fica fora da página; o grupo econômico é `null` quando não confirmado.
  - **Spread** só para IPCA+: taxa da debênture menos a NTN-B do mesmo dia, interpolada linearmente pelo vencimento (não pela duration), com a taxa de compra do Tesouro Direto (NTN-B e NTN-B Principal; onde há as duas no mesmo vencimento, vale a NTN-B). Sem curva no dia ou fora dela, "—": nunca extrapola nem zera.
  - **Troca futura.** `scripts/intel/debentures_planilhas.py` (`planilhas`, `ler_telas`, `ler_negocios`) é o único arquivo que conhece o formato das planilhas, e o início dele documenta o que cada função devolve. Uma API interna de dados de mercado entra com um módulo irmão de mesmas funções passado a `debentures.montar(ler_telas=, ler_negocios=)`; o resto (classificação, agregados, spread, bloco e tela) não muda. O contrato está resumido no README, roteiro 4. Testes com planilhas sintéticas: `tests/fixtures/debentures/` (`gerar.py` as refaz) e `tests/test_intel_debentures.py`.
- **Glossário, Fontes e "Sobre este painel".** `data/glossario.json` (61 termos) alimenta a aba Glossário (`src/glossario.js`); as outras abas ligam a primeira menção de cada termo com `Glossario.link('id')`, e `tests/test_glossario.py` falha, listando o termo, se um link citar um id ausente. `data/fontes_descricao.json` traz uma frase por fonte embutida (chave = nome do bloco); `src/resumo-model.js` (`sobrePainel`) a combina com `INTEL.fontes`, as bases e a verificação para montar a tabela do Resumo, e `src/fontes-model.js` (`listar`) monta a aba Fontes dos mesmos blocos, dos documentos da verificação e dos consórcios e das fontes do glossário. Bloco novo com `fonte` sem entrada em `fontes_descricao.json` falha `tests/test_fontes_descricao.py`.
- **Fichas de grupo e consórcio.** `src/leiloes-model.js` (`fichaGrupo`, `resolverGrupo`, `ehConsorcio`) cruza `conc.consorcios`, o ranking e os aliases; `src/consorcios.js` desenha o painel (diálogo acessível: foco, Esc, fundo inerte). A ficha conta cada lote uma vez por grupo, mostra as fontes por consórcio e nunca abre vazia ("composição não localizada", "participou sozinho", "este nome não consta como proponente").
- **Reconciliação.** `data/roadshow/reconciliacao.json` guarda os totais que o RoadShow imprime (com página e casas decimais) e `tests/test_reconciliacao.py` os recalcula dos dados curados. Divergências conhecidas do próprio RoadShow são `xfail(strict=True)` no dicionário `DIVERGENCIAS`, com o motivo só do que foi verificado; se uma passar a fechar, o teste falha e o motivo precisa de revisão.
- **Front do fechamento.**
  - `src/resumo.js` (aba Resumo; o cálculo está em `src/leiloes-model.js`: `resumoKpis` e `resumoAchados`, cada item some se faltar dado).
  - `IntelModel.linhaDoTempoResumo` e `Charts.timelineSvg` (linha do tempo, na seção Pipeline de `src/projetos.js`).
  - `ConcModel.pistaSNV` (pista pelo SNV, na ficha e no cartão do mapa) e `IntelModel.fisSit`.
  - Gráficos novos em `src/mercado.js` e diagramas em `src/regulatorio.js`, com dados de `mercado.json` e `regulatorio.json`.
  - O módulo `tabs.js` tem o Resumo como `INICIAL`: hash vazio ou inválido abre o Resumo, `#mapa` abre o mapa.
- **Ordem de regeneração:** `trafego antt carga agro multimodal pipeline estaduais`, depois `vmda2025` (lê a malha estadual), `rotas`, `fontes_bloco.py` e `build.py`. Comandos completos no README, seção "Atualizar os dados"; `python scripts/atualizar.py` faz tudo isso em um comando.
- **Junção com o SNV:** `scripts/intel/snvbase.py` (`snv()`, `.trechos`, `.fis` com os 6.815 físicos, `find_km`, `fis_of_km`, `snap`, `nearest`, `geom_m` em EPSG:5880, `encode_line`/`decode_line`, `norm_br`). Todo array "por físico" tem 6.815 posições na ordem de `data/base/snv.json`; `null` significa sem dado.
- **Front:** Leaflet 1.9.4 vendorizado, renderização em canvas, JS ES2020 sem bundler, concatenado na ordem de `JS_FILES` (`scripts/build.py`). Os módulos puros, testados com `node --test`, são `model`, `conc-model`, `leiloes-model`, `intel-model`, `mercado-model`, `resumo-model`, `fontes-model`, `debentures-model`, `styles-map` (paleta), `charts`, `selo` e `csv` (a parte que não toca o DOM). Os módulos de UI são `map`, `layers`, `ficha`, `projetos`, `resumo`, `trafego`, `cargas`, `mercado`, `debentures`, `regulatorio`, `fontes`, `glossario`, `consorcios`, `ui`, `tabs` e `main`. O e2e usa Playwright com `--test-concurrency=1`, porque em paralelo fica instável.
- **Cada bloco** tem `fonte` e `tipo` (`modelado`, `medido` ou `cadastro`). A interface rotula modelado × medido e mostra o ano.
- **Paleta:**
  - A interface e a malha federal base usam a paleta base (`#183C80`, `#0071BB`, `#231F20`, `#525254`, `#F7F7F8`).
  - As cores de dados vêm só dos tokens de `src/styles-map.js`:
    - `DATA`: 8 slots categóricos.
    - `ROTAS`: 5 cores.
    - `RAMPS`: um tom por modo (Tráfego azul, Pesados roxo, Carga laranja, Acidentes vermelho).
    - `ROTAS_DIM`: fator 0,35.
  - Toda cor de dado tem legenda ou rótulo, e o texto nunca vem na cor da série.
  - `tests/palette.test.mjs` roda o validador.

### Como acrescentar um leilão verificado

1. Em `data/roadshow/verificacao.json`, acrescente o leilão em `leiloes`: uma `chave` única, a ligação (`ent` com o id da entidade, `participantes` com `ano` e `lote` da linha de `mercado.participantes`, `concorrentes` com o nome do leilão em `mercado.concorrentes_desagio`; uma ou mais), os `campos` com `valor` e `fontes` (ou `nao_localizado`, ou, no deságio de leilão por outorga, `nao_se_aplica: true` com a fonte que explica), e `notas` e `inabilitados` quando houver. Outra fonte oficial com valor diferente do exibido vai em `alternativas` do campo (só com `ent`); uma data de edital que o RoadShow imprime errada vai no campo `edital` (só com `ent`). Leilão que o RoadShow ainda não traz nas listas de `mercado.json`: a linha nova leva `"fora_do_roadshow": true` (README, "Como atualizar", roteiro 3).
2. No mesmo arquivo, cadastre em `fontes` cada documento citado: `oficial` (órgão, título, URL http(s) de domínio oficial, data de acesso e trecho), `imprensa` (órgão, data, URL e acesso; só em notas, junções e inabilitações) ou `roadshow` (página).
3. Em `data/roadshow/grupos_alias.json`, ligue cada nome novo de proponente (vencedor, demais e inabilitados) a um grupo econômico, com o `motivo` e, quando a junção não se lê no nome, `fontes`. O crédito é do grupo da época do leilão: aquisição posterior não junta nomes.
4. Rode `python -m pytest tests/test_verificacao.py`: a validação acusa fonte faltando, URL fora de http(s), ligação inexistente ou repetida, valor de tipo errado e nome sem grupo.
5. Rode `python scripts/atualizar.py` (ou `python scripts/build.py`): ele valida de novo, regenera `data/roadshow/verificacao.md` (cobertura e divergências) e o `mapa-rodovias.html`.

### Como atualizar

Os cinco roteiros (dados públicos em um comando, nova versão do RoadShow, leilão novo, debêntures e arquivos curados: consórcios, glossário, descrição das fontes e emissores) e a tabela das constantes de período de cada domínio estão no [`README.md`](../README.md), seção "Como atualizar", que é a única fonte: não são repetidos aqui. Em resumo: `python scripts/atualizar.py [--baixar | --renovar [domínios]]`, depois ler `data/atualizacao.md` (o que mudou e o que pede curadoria, com o arquivo a editar em cada item), rodar as três suítes e fazer o commit dos JSON, do relatório e do HTML. Regra de ouro: nenhum `data/intel/*.json` se edita à mão; a correção vai no script gerador ou no arquivo curado de origem (`pipeline.csv`, `data/roadshow/*.json`).

## 3. Restaurar os brutos (`data/raw/`, fora do git, ~4 GB)

- **Fontes públicas:** `python scripts/intel/<domínio>.py fetch` baixa de novo (o manifesto em `data/intel/manifest.json` tem URL, data, tamanho e SHA-256).
- **Arquivos do usuário (Google Drive):** só descem se estiverem compartilhados por link. Use `curl -L "https://drive.usercontent.google.com/download?id=<ID>&export=download&confirm=t" -o <destino>`.

| Arquivo | ID no Drive | Destino |
|---|---|---|
| VMDa – Modelagem 2025 (VGeo/DNIT) | `1gnXpMWMLs4uZ9mWZf2SxlNe6R8LcdFha` | `data/raw/trafego/vmda2025/vgeo_vmda2025.zip` |
| RoadShow (PDF) | `1zStkFuN8kJSMWYRygewJw6ZI70TZMwy9` | `data/raw/roadshow.pdf` |
| SNV `202607A.zip` | `1PRZr6mPqbNVyqwF6cBxk049g3Tqya7gO` (precisa de link compartilhado) | extrair em `data/raw/` (só para `build.py --shp`) |

- **Planilhas de debêntures** (XP e BTG): são do usuário, ficam em `data/raw/debentures/` e não têm cópia no Drive nem no git. Sem elas o build funciona (o bloco do repositório basta) e os testes que as leem são pulados; para testar o fluxo, use as planilhas sintéticas de `tests/fixtures/debentures/`.
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
- **A base do SNV está congelada** em `data/base/`, extraída dos payloads da v2, porque o shapefile não desceu pelo conector. Para regenerar, use `build.py --shp`, que também reescreve `data/base/`. Da base, o build pela base usa só o SNV e o recorte das concessões (`entFis`, `km_mapeado`, `nota_trecho`); os campos curados das concessões e dos estudos (estado, datas, valores, fichas) são relidos de `data/roadshow/entidades.json` e `estudos_pos2027.json` a cada build (`roadshow.conc_da_base`), e `snvOnly` é recalculado com os estados atuais. Basta editar o JSON e rodar `scripts/atualizar.py`. Concessão nova ou removida, ou estudo com outras BRs/UFs, para o build e pede `--shp`.
- **As rotas do MPO não têm geodado oficial.** Foram extraídas do PDF vetorial (apresentação de 01/07/2026, p. 7) e georreferenciadas por 70 cidades (RMS ~9 km), por isso são rotuladas "esquemático". Os insumos derivados ficam em `data/raw/rotas/derived/`.

## 5. Decisões já tomadas (não reabrir sem motivo)

Cada uma com o que custa se estiver errada.

| Decisão | Custo se errada |
|---|---|
| VMDa = 0 vira `null` (sem dado) | trechos de tráfego real ~0 aparecem como "sem dado" |
| Veículos PNL: anual ÷ 365 | escala diária da carga desloca se a base for dias úteis |
| Datas de leilão e assinatura do pipeline seguem o valor exibido pela camada de verificação (na v3 seguiam `conc.json`); as demais datas vêm dos campos curados das concessões (base congelada + `entidades.json`, por `roadshow.conc_da_base`) | divergência com a fonte do pipeline quando houver atualização só em um lado |
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
| **v4 (substituída no fechamento pela linha `nao_se_aplica`, abaixo):** Ponte São Borja: 0,38% é ágio sobre a outorga mínima, não deságio de tarifa; deságio `não localizado` (sai de séries e médias), RoadShow fica como divergência | a ficha mostra "—" onde o RoadShow imprime 0,38 |
| **v4:** `tarifa_teto` e `tarifa_vencedora` são texto (valor, unidade e data-base), porque as unidades variam (R$/praça, R$/100 km) | sem ordenação numérica de tarifas |
| **v4:** nas otimizações, `assinatura` é o contrato original e `assinatura_aditivo` o aditivo (rótulos distintos); o `prazo_anos` conta do aditivo | — |
| **v4:** a ficha mostra também tarifa-teto, tarifa vencedora e prazo da concessão (campos de leilão da spec) | o prazo pode repetir um valor dos extras |
| **v4:** o início da operação da Rota da Celulose fica "não localizado" (o do RoadShow, 30/12/2025, é anterior à assinatura exibida) | um campo com "—" |
| **v4:** Rota dos Sertões passou de "leiloado" a "contrato" no pipeline, com a assinatura de 29/09/2026 | uma linha do pipeline |
| **v4:** a nota de `mercado.concorrentes_desagio` foi reescrita (comentário nosso, não transcrição) em `mercado.json`, em `data/base/conc.json` e em `scripts/extract/mercado.py` | o texto diverge da promessa de "intocado" |
| **v4:** Via Liberdade segue como concessão na lista; a natureza de PPP estadual é só nota | a esfera da entidade fica como no RoadShow |
| **Fechamento:** `nao_se_aplica` é um marcador próprio da camada (hoje só no deságio), com selo próprio, em vez de "não localizado" | o selo diz "não se aplica" onde alguém acharia que o dado existe e não foi achado |
| **Fechamento:** Régis Bittencourt mostra 15 anos (minuta do aditivo e página da ANTT) e registra os 25 anos da B3 como divergência declarada (`alternativas`) | se a B3 estiver certa, a ficha mostra 15 e a B3 aparece só no ícone de divergência |
| **Fechamento:** "RoadShow: …" só aparece quando o nome impresso é de outro grupo econômico; o teste de "mesmo grupo" compara também a grafia normalizada e o início do nome | um rótulo diferente do mesmo grupo (ex.: "Ecorodovias e SBS Engenharia", ECO101 2012) fica escondido |
| **Fechamento:** "4UM" é um grupo só (RoadShow p. 23, grupo líder dos dois leilões); "Ateris S.A" é grafia da Arteris | o ranking dá 2 vitórias à 4UM; se forem fundos distintos, o número cai |
| **Fechamento:** correção de dado vai só no script gerador ou no arquivo curado; nunca no JSON gerado (revê a ideia inicial de remendar o JSON quando o bruto falta) | uma correção pode ficar sem aplicar neste HTML se a fonte não responder |
| **Fechamento:** Keppel Fels fica no centro do município do próprio cadastro (Niterói) por regra genérica (ponto a mais de 200 km da UF vai para o município), e VMD de praça que arredonda a 0 vira "sem dado" (Free Flow Candeias) | a posição do estaleiro erra cerca de 7 km; uma praça com tráfego mínimo real aparece sem dado |
| **Fechamento:** data de edital que o RoadShow imprime duas vezes vale a do cronograma, pela camada de verificação, e a outra fica como divergência | se a ficha estiver certa, o edital aparece um ano antes do real |
| **Fechamento:** o gráfico "Estado do pavimento" (p. 35) mostra o aumento do custo do frete por condição do pavimento (CNT), que é o que a página traz, e não participação na malha | — (reflete a página) |
| **Fechamento:** os dois diagramas do Regulatório são esquemas nossos, feitos do texto do RoadShow (o fluxo de financiamento das pp. 73–77 é uma síntese: essas páginas não têm diagrama), com a página em cada elemento e dito na legenda; duas posições são leitura nossa: o aporte entre o leilão e a assinatura, e o ramo "não → assinatura" da decisão dos 18% | a leitura de um bloco pode diferir da intenção do Ministério |
| **Fechamento:** o limiar do aporte é "acima de 18%" (pp. 65 e 73; a p. 61 diz "a partir de 18%"), igual no diagrama e no Resumo | um leilão exatamente em 18% seria contado pela redação das pp. 65/73; hoje nenhum leilão está em 18% |
| **Fechamento:** o texto "aporte … proporcional ao deságio ofertado" do Regulatório fica; a p. 63 do PDF (premissas gerais) diz que os aportes, quando ultrapassado o desconto máximo do projeto, são "proporcionais ao deságio ofertado" | — (conferido na página) |
| **Fechamento:** reconciliação declarado × recalculado como teste, com a divergência conhecida como `xfail` estrito e motivo só do que foi provado | um `xfail` pode esconder um erro novo no mesmo item (o estrito falha se o item passar a fechar) |
| **Fechamento:** KPI "km sob concessão" do Resumo = RoadShow p. 37 (o mesmo do Mercado); o SNV vai como segunda linha; o KPI de malha avisa que inclui trechos só planejados | dois números de km sob concessão convivem, com nota |
| **Fechamento:** pista pelo SNV: Pavimentada = pista simples; Duplicada; Em obra de Duplicação; tudo o mais (planejada, leito natural, obras de pavimentação, travessia) = "sem pavimento ou planejada"; sem recorte mostra "sem recorte no SNV", nunca 0 km | trecho de situação rara cai em "sem pavimento ou planejada" |
| **Fechamento:** o `--baixar` baixa só o que falta e o `--renovar` refaz o download; a data de acesso só muda se o SHA-256 mudar | fonte que muda de endereço sem mudar o arquivo aparece como "sem dado novo" |
| **Fechamento:** não descobrir períodos novos automaticamente; as constantes de período ficam documentadas por domínio no README | período novo exige uma edição pequena por domínio |
| **Fechamento:** `build_from_base` relê da pasta `data/roadshow/` os campos curados das entidades e estudos (e `mercado.json`/`regulatorio.json`); do SNV congelado fica só o recorte; entidade nova ou removida pára o build pedindo `--shp` | um caminho a mais para manter igual ao do `--shp` (há teste) |
| **Fechamento:** a linha do tempo e o achado de calendário contam a partir do ano e do dia em que o arquivo é aberto | um HTML antigo perde itens sozinho com o passar do tempo |
| **Fechamento:** a aba Resumo é a página inicial (hash vazio ou inválido abre o Resumo; `#mapa` abre o mapa) | quem tinha o mapa como atalho agora precisa de `#mapa` |
| **Fechamento:** fichas dos lotes sem ficha no RoadShow ficaram de fora (princípio de atualização fácil) | esses lotes têm ficha só com o que o RoadShow e a verificação trazem |
| Debêntures: o bloco e o HTML levam só agregados (por dia, emissor, subsetor e direção) e o último negócio e a última intenção de cada papel; as planilhas ficam em `data/raw/` fora do git | não dá para recalcular um corte novo sem as planilhas; só o que foi agregado está no HTML |
| Debêntures: intenções (XP) ficam à parte dos negócios (BTG) por padrão; a chave "ver somado" as soma "como se fossem negócios", com rótulo "negócios + intenções" em todo cartão afetado | quem liga a chave lê um volume que não é de negócios fechados; o rótulo e o texto da tela avisam |
| Debêntures: o spread é a taxa IPCA+ menos a NTN-B do mesmo dia, interpolada linearmente pelo vencimento (não pela duration), com a taxa de compra do Tesouro Direto; PRÉ, DI+ e % DI não têm spread; sem curva no dia ou fora do último vencimento, "—" | o spread difere do que se calcularia com a curva indicativa da ANBIMA ou pela duration |
| Debêntures: o arquivo do Tesouro atrasa alguns dias; os últimos dias ficam sem spread em vez de usar a curva do último dia disponível | a tela mostra "—" nos dias mais recentes até o Tesouro publicar |
| Debêntures: o universo é a lista curada `data/debentures/emissores.json`, não a coluna "Setor" da tela BTG (que põe concessionárias de rodovia em "Comércio" e "Construção Civil"); emissor sem classificação fica fora da página e vai para a curadoria | um emissor de transporte novo só entra depois de classificado |
| Debêntures: `grupo` é `null` quando o controlador não está confirmado (Entrevias, MetrôRio e MS-306 ficaram assim depois da conferência em fontes públicas) | esses emissores não somam em nenhum grupo |
| Debêntures: taxa fora de (−10, 50] % a.a. (DI+: (−5, 20]; % DI: 0 a 300) é erro provável de digitação: sai das médias e do spread, mas conta no volume e no número, e vai para a curadoria; negócio de volume zero conta no número e nunca é o "último negócio"; a Selic é o último valor até a data de hoje (a série traz datas futuras) | uma taxa real extrema ficaria fora das médias até alguém confirmar |
| Consórcios: o grupo é o da época do leilão; quando o integrante é um fundo sem controlador identificado em registro, o grupo é o próprio nome (Infra I FIP, do 116 Sertões); participação `null` quando não publicada; composição não localizada fica `integrantes: []` com nota dizendo onde se procurou | a ficha mostra "composição não localizada" onde existe composição ainda não achada |
| Consórcios: comunicado de empresa e brief de organismo multilateral entram como fonte `imprensa` ("não oficial"), porque o validador só aceita `oficial` em domínio de órgão público ou da B3 | 4 fontes ficam com a marca "não oficial" mesmo sendo primárias |
| Mercado, diagnóstico por ano: de 2023 a 2025 só a extensão concedida (RoadShow p. 37) é mostrada; contratos, valor e investimento acumulado ficam "—" ("não publicado"), sem reconstruir a partir das concessões de hoje ou da série da ANTT | a tabela tem buracos que o RoadShow não preenche |
| A aba Fontes e a tabela "Sobre este painel" são derivadas dos blocos embutidos; só a frase de cada fonte é curada (`data/fontes_descricao.json`) | bloco novo sem frase falha o teste, de propósito |
| O painel não menciona versões do projeto nem a empresa do autor; o RoadShow é citado pela edição ("edição de 14/10/2026"). `tests/test_sem_mencoes.py` confere o repositório e o HTML (o nome só pode aparecer em registros públicos de leilão) | — (histórico fica no git) |
| Glossário: SAT descrito sem expandir a sigla (o repositório não a expande e não foi confirmada); aporte de recursos vinculados sem percentual, para não divergir do Regulatório | o glossário é menos informativo nesses dois termos |

## 6. Pendências

### (a) O que depende de você

Nada disto se resolve daqui; cada item diz o que falta.

- **PNCT por posto de contagem** (contagens medidas do DNIT): o portal não é acessível daqui; precisa de download feito por você.
- **Pedidos via LAI:** cargas da ANTT (cgdam@antt.gov.br) e PNL 2050 / matrizes OD (observatorio@infrasa.gov.br).
- **ANTAQ, Estatístico Aquaviário** (movimentação portuária): o painel não tem dado aberto utilizável.
- **Malha estadual de 2024:** não foi publicada; a atual é a CIDE 2021 da Infra S.A.
- **Editais dos lotes estaduais com km inicial e final:** hoje há cortes aproximados; é pesquisa manual por lote.
- **Reclassificar entidades por esfera** (ex.: Via Liberdade como PPP estadual): muda o modelo de estados; a nota da Via Liberdade basta por ora.
- **Curadoria que o relatório achou:** o **MG Lote 10 - Noroeste** está no `data/intel/pipeline.csv` como "Edital publicado" com data prevista de 20/03/2026, já vencida. Procure a fonte oficial (ou a notícia do leilão), atualize status, data e `fonte_url` e rode `python scripts/atualizar.py`. Na lista de `data/atualizacao.md` (20 itens) há ainda 13 itens do pipeline com `verificado = false` (só fonte de imprensa): trocar por fonte oficial quando houver; a composição do Consórcio Acciona (Rodovia do Aço, 2007), que nenhuma fonte consultada traz; e o proponente "Consórcio Via dos Sertões" do lote Régis Bittencourt, que a ata oficial não lista (provável erro de entrada do RoadShow).
- **APOLLO 17 (debêntures):** aparece na tela XP (1 papel, APOL11) e nas intenções, e não está em `data/debentures/emissores.json`; ficou fora da página de propósito. Confirme se é emissor de transporte e classifique-o (subsetor e grupo, ou `fora_do_universo`); ele sai do relatório de curadoria quando for classificado.
- **Arquivo do Tesouro Direto atrasado:** o CSV do Tesouro termina em 15/10/2026 (as planilhas vão até 21/10), então 16, 19, 20 e 21/10 estão sem curva das NTN-B e o spread desses dias é "—". Rode `python scripts/atualizar.py --baixar --dominios debentures` mais tarde; quando o Tesouro publicar, os spreads aparecem sozinhos. O relatório de curadoria lista os dias sem curva.
- **Links de normas no Glossário:** as URLs de `planalto.gov.br` (Leis 12.431/2011, 13.448/2017 e 14.801/2024) não puderam ser abertas daqui; seguem o padrão do portal. Clique em cada uma antes de mostrar o painel a terceiros.
- **Fontes oficiais que este ambiente não alcança:** o extrato do contrato da Rota da Celulose no DOE-MS (a assinatura exibida, 06/02/2026, vem da agência de notícias do governo de MS; a imprensa diz 02/02/2026; o início da operação segue não localizado) e as páginas do Ministério dos Transportes sobre o leilão e a assinatura da Ponte São Borja (assinatura de 25/11/2025 só pela imprensa).

### (b) Limitações conhecidas e próximos passos

- **Período novo de uma fonte exige uma edição pequena.** Os scripts de `scripts/intel/` baixam endereços fixos, e vários trazem ano ou mês no nome. O `--baixar` e o `--renovar` não descobrem períodos novos sozinhos (cada fonte tem lógica de endereço própria; automatizar seria arriscado). A tabela "Período novo de uma fonte" do README diz, por domínio, quais constantes editar. Descobrir o período novo automaticamente fica como próximo passo, domínio a domínio.
- **Colunas sem dado na tabela de emissões:** as telas das corretoras não trazem data de emissão nem coordenadores; a tela oculta uma coluna vazia em todas as linhas e a mostra sozinha quando houver dado (por exemplo, vindo de uma API). A curva das NTN-B usa a taxa de compra do Tesouro Direto, não a indicativa da ANBIMA.
- **Fichas dos lotes sem ficha no RoadShow** (os 22 lotes de 2023–2025: edital, tarifa-teto, TIR, praças, duplicação): retirado do fechamento pelo princípio de atualização fácil, porque seriam cerca de 100 campos de pesquisa manual sem caminho automático de atualização. Continua sendo uma melhoria opcional.
- **Um leilão novo não muda logo o Mercado nem o Resumo.** O resultado entra na ficha, na aba Projetos (pipeline e linha do tempo) e no mapa (pelo `estado`). A série de deságio, o ranking de grupos, concorrentes × deságio e os números do Resumo contam pelas listas do RoadShow em `mercado.json`; até a próxima versão, a linha pode ser acrescentada à mão com `fora_do_roadshow: true` e ligada à verificação (README, roteiro 3).
- **Datas previstas do RoadShow sem fonte melhor** seguem exibidas (ex.: início previsto da Rota dos Sertões, 11/10/2026). O relatório de curadoria não as pega: revise ao ler o RoadShow novo.
- **A linha do tempo e o calendário do Resumo dependem do relógio de quem abre o arquivo.** A linha do tempo começa no ano corrente (leilões de 2026 saem dela a partir de 01/01/2027) e o achado de calendário só conta datas futuras. É a regra decidida; um HTML antigo "envelhece" sozinho.
- **Dois números de km sob concessão convivem:** 20.651 km (RoadShow, p. 37, o do Resumo e do Mercado) e 15.828 km (cadastro do SNV, na segunda linha do KPI e na nota). O SNV 202607A ainda não reflete todos os contratos recentes.
- **Divergências do próprio RoadShow sem causa identificada** (22 `xfail` em `tests/test_reconciliacao.py`: p. 17 × pp. 3/5, anos 2026 e 2027 da p. 125, faixas e médias por concorrentes das pp. 25/27): ficam registradas com o que foi verificado; nenhuma foi atribuída a erro nosso ou do PDF sem prova.
- **Julgamentos de grupo econômico que seguem como julgamento:** "liderado" no Consórcio Infraestrutura GO → EPR (Reuters: "A EPR…"; o consórcio é EPR + Perfin); o líder do 116 Sertões não consta do documento oficial; quatro leilões usam atas por não terem ato de homologação localizado.
- **Mapa e layout:**
  - A legenda "Cor das rodovias" ainda cobre parte do litoral do Nordeste em 1366 px com a camada de rotas ligada, e em telas menores que 1366 px os rótulos e legendas mantêm a sobreposição antiga (o layout foi afinado para 1440×900 e 1366×768).
  - No celular, o cabeçalho rola na horizontal mas não mostra pista de que há mais abas, e o título do site é cortado em 390 px.
  - Abrir direto um `#ficha/…` deixa nenhuma aba destacada.
  - As linhas com `role="button"` (linha do tempo, rankings) respondem a Enter e clique, não à tecla Espaço (vale para o projeto todo).
- **Rótulos:** "Sem pavimento ou planejada" (pista SNV) junta Travessia e obras de pavimentação (a ficha explica na nota quando a categoria aparece); o texto "não se aplica (leilão por outorga)" está duplicado em `scripts/verificacao.py` e `src/conc-model.js`; as sublinhas de lista de integrantes aparecem ou somem conforme a redação do nome.
- **Gráfico de comparativos público × privado** mistura períodos de base diferentes (2016–22 × 2023–29 etc.); os rótulos e a nota explicam, e a nota registra onde o RoadShow não fecha com a própria série da p. 43.
- **Testes que podem ser mais firmes:**
  - falta teste negativo da nota da série (`SERIE_NOTA`);
  - o auxiliar `rankPeriodo` do e2e depende da ordem das opções;
  - `periodo()` em `mercado.js` tem min/max redundante depois da troca de de/até;
  - o seletor da legenda do e2e da linha do tempo depende do dado;
  - o regex `\b0 km` do e2e de pista é frágil;
  - falta teste de regressão do `km_mapeado` com dado real;
  - a conferência das contagens pequenas contra o PDF (reconciliação) só prova que o número aparece na página;
  - a explicação de n = 4 concorrentes não tem teste próprio.
- **Menores antigos que permanecem:** `tipo_campo([])` devolve `None` (o front trata como "—"); números negativos saem como texto no CSV (regra da spec); `antt.json` (399 KB) está perto do limite de 450 KB do teste (alerta); a correlação VMDa 2023 × 2025 é 0,861 contra o mínimo de 0,85 do teste (propriedade dos dados, não defeito); o `--renovar` não foi exercitado contra a rede inteira (cerca de 1 GB), só com domínios simulados, e o "sem dado novo" é por SHA-256, então uma fonte que muda de endereço sem mudar o arquivo aparece como "renovada sem dado novo" e pede olhar manual; itens do pipeline de concessão estadual ainda tiram a data do CSV (é o ponto de edição curado).

## 7. Processo usado

Brainstorming e spec, depois plano, depois execução por subagentes: uma tarefa por vez, cada uma com brief, implementação com TDD, revisão de spec e revisão de qualidade. No fim, uma revisão do branch inteiro e uma rodada de correções (no fechamento da v4, cada tarefa teve revisão própria e as correções saíram em rodadas; o histórico do PR mostra quais). Antes de abrir o PR, rodar as três suítes e `python scripts/atualizar.py` (ou `python scripts/build.py`), conferindo o tamanho; o e2e exige o HTML gerado antes. O desenvolvimento é feito num branch `claude/*` e entra na `main` por PR, com merge só quando o usuário pede.
