# Handoff · Rodovias do Brasil · Centro de Inteligência

Documento para retomar o projeto numa conversa nova. Estado em 21/10/2026, `main` em `6f0da81`.

**Para começar uma sessão nova:** abra o repositório `joaocscr/Rodovias` em claude.ai/code e mande como primeira mensagem algo como *"Leia `docs/HANDOFF.md` e o `README.md`. Quero continuar com …"*.

## 1. Onde estamos

| Versão | O que entrou | PR |
|---|---|---|
| v1 | Mapa da malha federal (SNV 202607A), filtros, busca, soma de km | — |
| v2 | Concessões do RoadShow (federais), abas Projetos, Mercado e Regulatório | — |
| v3 | Centro de inteligência: tráfego (VMDa 2023, PRF, ABCR), ANTT (praças, SATs, obras), carga agrícola (PNL 2035), municípios e produção (PAM, armazéns), multimodal (ferrovias, portos, SIADE, Comex, fretes CONAB), pipeline de concessões, malha e concessões estaduais, catálogo de fontes | [joaocscr/Rodovias#1](https://github.com/joaocscr/Rodovias/pull/1) |
| v3.1 | Rotas de Integração Sul-Americana (MPO), paleta de dados estendida, VMDa Modelagem 2025 (federal e estadual, por sentido) | [joaocscr/Rodovias#2](https://github.com/joaocscr/Rodovias/pull/2) |

Entregável: `mapa-rodovias.html` (arquivo único, offline, ~10,3 MB; limite de 15 MB imposto pelo build). Testes verdes no fechamento da v3.1: pytest 188 passaram e 3 foram pulados, `npm test` 133, e2e 91.

Specs e planos de cada versão: `docs/superpowers/specs/` e `docs/superpowers/plans/`. Paleta: `docs/paleta.md`. Uso, camadas e comandos: `README.md`.

## 2. Arquitetura em uma página

- **Dados → blocos → HTML.** Cada `scripts/intel/<domínio>.py` tem `fetch` (baixa para `data/raw/<domínio>/` e registra no manifesto), `build` (gera `data/intel/<bloco>.json`) e `all`. O `scripts/build.py` lê a base congelada (`data/base/snv.json`, `conc.json`) e todos os `data/intel/*.json` (menos `manifest.json`), injeta como `window.SNV`, `window.CONC` e `window.INTEL` e concatena o JS na ordem de `JS_FILES`.
- **Ordem de regeneração:** `trafego antt carga agro multimodal pipeline estaduais`, depois `vmda2025` (lê a malha estadual), `rotas`, `fontes_bloco.py` e `build.py`. Comandos completos no README, seção "Atualizar os dados".
- **Junção com o SNV:** `scripts/intel/snvbase.py` (`snv()`, `.trechos`, `.fis` com os 6.815 físicos, `find_km`, `fis_of_km`, `snap`, `nearest`, `geom_m` em EPSG:5880, `encode_line`/`decode_line`, `norm_br`). Todo array "por físico" tem 6.815 posições na ordem de `data/base/snv.json`; `null` significa sem dado.
- **Front:** Leaflet 1.9.4 vendorizado, renderização em canvas, JS ES2020 sem bundler. `src/intel-model.js` é puro e testado com `node --test`. Os módulos de UI são `ui`, `map`, `layers`, `ficha`, `projetos`, `trafego`, `cargas`, `fontes` e `tabs`. O e2e usa Playwright com `--test-concurrency=1`, porque em paralelo fica instável.
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
- **A base do SNV está congelada** em `data/base/`, extraída dos payloads da v2, porque o shapefile não desceu pelo conector. Para regenerar, use `build.py --shp`, que também reescreve `data/base/`.
- **As rotas do MPO não têm geodado oficial.** Foram extraídas do PDF vetorial (apresentação de 01/07/2026, p. 7) e georreferenciadas por 70 cidades (RMS ~9 km), por isso são rotuladas "esquemático". Os insumos derivados ficam em `data/raw/rotas/derived/`.

## 5. Decisões já tomadas (não reabrir sem motivo)

Cada uma com o que custa se estiver errada.

| Decisão | Custo se errada |
|---|---|
| VMDa = 0 vira `null` (sem dado) | trechos de tráfego real ~0 aparecem como "sem dado" |
| Veículos PNL: anual ÷ 365 | escala diária da carga desloca se a base for dias úteis |
| Datas do pipeline seguem `conc.json` | divergência com a fonte do pipeline quando houver atualização só em um lado |
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

## 6. Pendências

### Adiadas pelo usuário ("para um segundo momento")

- **PNCT por posto de contagem** (contagens medidas do DNIT). O portal não é acessível daqui; precisa de download pelo usuário.
- **Pedidos via LAI:**
  - Cargas da ANTT: cgdam@antt.gov.br.
  - PNL 2050 / matrizes OD: observatorio@infrasa.gov.br.
- **ANTAQ:** Estatístico Aquaviário (movimentação portuária).
- **Malha estadual de 2024:** a atual é a CIDE 2021 da Infra S.A.
- **Editais dos lotes estaduais com km inicial e final:** hoje há cortes aproximados.

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

Brainstorming e spec, depois plano, depois execução por subagentes: uma tarefa por vez, cada uma com brief, implementação com TDD, revisão de spec e revisão de qualidade. No fim, uma revisão do branch inteiro e uma rodada de correções. Antes de abrir o PR, rodar as três suítes e `python scripts/build.py`, conferindo o tamanho. O desenvolvimento é feito num branch `claude/*` e entra na `main` por PR, com merge só quando o usuário pede.
