# Curva ANBIMA, dispersão spread × duration e ordem da aba · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Trocar a referência de todos os spreads pela curva de NTN-B indicativa da ANBIMA, adicionar a dispersão spread × duration e reordenar a aba Debêntures.

**Architecture:** Um módulo novo (`scripts/intel/curva_anbima.py`) baixa e lê os arquivos diários da ANBIMA e substitui o `ler_tesouro` em `debentures.py` e em `ida.py`. O bloco `debentures` ganha `dispersao`. A tela usa funções puras em `src/debentures-model.js` e um gráfico de dispersão em `src/charts.js`.

**Tech Stack:** Python 3 + pytest; JS ES2020, `node --test`; Playwright e2e.

**Spec:** `docs/superpowers/specs/2026-10-26-curva-anbima-dispersao-design.md`

## Global Constraints
- HTML único ≤ 15 MB, zero requisições de rede, sem dependências novas.
- Atualização em um comando.
  - Nenhum `data/intel/*.json` editado à mão.
  - e2e compara com o modelo, nunca com números literais.
  - O bloco não depende do dia em que o comando roda: a data de acesso é a do primeiro dia em que o arquivo foi visto, guardada com o sha256.
  - Brutos ficam em `data/raw/`, fora do git; os testes usam fixtures sintéticas.
- Spread = taxa − NTN-B indicativa ANBIMA interpolada linearmente pelo vencimento, no mesmo dia. Sem curva ou vencimento fora da curva → `None` ("—"). Só agregados das planilhas de corretora.
- Português claro, datas dd/mm/aaaa, unidades nos eixos, cores dos tokens com legenda. Sem o nome da empresa do autor e sem rótulos de versão.

## Review Focus
1. **Dia útil sem arquivo da ANBIMA** (feriado ou atraso): o dia fica sem curva, o spread vira "—" e não há erro. Teste da Task 1: `test_dia_sem_arquivo_anbima`.
2. **Papel com vencimento depois da última NTN-B:** spread `None`, nunca extrapolado. Teste da Task 1, já coberto por `spread`.
3. **Papel da tela sem duration ou sem taxa indicativa:** fora da dispersão e contado na nota. Teste da Task 2: `test_dispersao_exclui_sem_duration`.
4. **Filtro de subsetor:** muda a tabela e a dispersão juntas. Teste da Task 2, e2e.

---

### Task 1: Curva de NTN-B indicativa ANBIMA em todo o painel

**Files:** Create `scripts/intel/curva_anbima.py`. Modify `scripts/intel/debentures.py` (troca `ler_tesouro` por `curva_anbima`, remove o download do Tesouro e o código exclusivo dele), `scripts/intel/ida.py` (mesma troca), `data/fontes_descricao.json`, `data/glossario.json` (spread e NTN-B: "taxa indicativa ANBIMA"; edição em texto), `README.md`, `docs/HANDOFF.md`, `src/debentures.js` e `src/debentures-model.js` (só os textos que citam o Tesouro Direto). Tests: `tests/test_curva_anbima.py` (novo), `tests/fixtures/debentures/publico/` (um `msAAMMDD.txt` sintético com 4 NTN-B), e ajustes em `tests/test_intel_debentures.py` e `tests/test_intel_ida.py`.

**Interfaces:**
- **Arquivo:** `https://www.anbima.com.br/informacoes/merc-sec/arqs/msAAMMDD.txt`, texto latin-1, campos separados por `@`. O cabeçalho começa com `Titulo@Data Referencia@...`. Nas linhas `NTN-B`, o vencimento é o campo 5 (`AAAAMMDD`) e a taxa é `Tx. Indicativas` (pt-BR "5,3523").
- `curva_anbima.ler(texto) -> list[(vencimento_iso, taxa)]`, só NTN-B e ordenada.
- `curva_anbima.fetch(datas, pasta) -> {data: bool}`: baixa só os dias que faltam no cache, com pausa de 0,5 s e 3 tentativas. Um 404 vira "sem_arquivo", registrado em `pasta/indice.json` para não ser pedido de novo, exceto nos últimos 5 dias úteis.
- `curva_anbima.curvas(datas, pasta) -> {data: [(venc, taxa)]}` lê só o cache. A interface é compatível com a usada por `debentures.curva_ntnb` e `debentures.spread`, que continuam como estão.
- **Dias pedidos pelo `fetch` de `debentures`:** os dias de negócios e intenções, o dia da tela e o último dia útil.
- **Dias pedidos pelo `fetch` de `ida`:** os dias da série.
- **Curva do cenário de juros** (`macro.ntnb`): passa a ser a curva ANBIMA do último dia com arquivo.

- [ ] **Testes RED.** `test_ler_ms_fixture`, `test_dia_sem_arquivo_anbima`, `test_spread_com_curva_anbima` (dois papéis calculados à mão sobre a fixture) e `test_bloco_nao_depende_do_dia`.
- [ ] **Implementar e regenerar.** Rodar `python scripts/atualizar.py --baixar --dominios debentures,ida`. Os spreads de 16 a 22/10 aparecem. Conferir à mão o spread de 2 negócios reais contra o arquivo ANBIMA do dia.
- [ ] **Suítes verdes.** Commit `feat: NTN-B indicative curve from ANBIMA replaces the Tesouro Direto buy rate in every spread`.

### Task 2: Dispersão spread × duration e nova ordem da aba

**Files:** Modify `scripts/intel/debentures.py` (`dispersao`), `scripts/intel/debentures_planilhas.py` (`ler_telas` passa a devolver `duration` em anos e `taxa_indicativa` de cada papel, BTG: `Duration` e `Taxa Indicativa Anbima`; XP: `Duration` e `Anbima`), `src/debentures-model.js`, `src/debentures.js`, `src/charts.js` (só se `scatterSvg` não aceitar cor por grupo, dica e unidades). Tests: unit (py e js) e e2e.

**Interfaces:**
- **Consome** da Task 1: `curva_anbima.curvas` e `debentures.spread`.
- **Bloco:** `debentures.dispersao = {data, pontos: [{ticker, emissor, subsetor, duration_anos, taxa_indicativa, spread}], excluidos: n}`.
  - Entram só os papéis IPCA+ do universo.
  - A tela BTG tem prioridade sobre a XP.
  - `data` é o dia da tela.
- `DebenturesModel.dispersao(bloco, filtro) -> {pontos, subsetores, nota}`: usa o mesmo filtro de subsetor da tabela.
- **Tela:**
  - Cartão "Spread sobre a NTN-B × duration das debêntures de transporte", acima da tabela de emissões.
  - Eixo X "Duration (anos)" e eixo Y "Spread sobre a NTN-B (p.p.)".
  - Cor por subsetor, com legenda.
  - Dica (`<title>`) "TICKER — Emissor · duration X anos · taxa Y% · spread Z p.p.".
  - Fonte e data tiradas dos dados.
  - Nota "N papéis sem duration ou taxa ficaram de fora" quando `excluidos` > 0.
- **Ordem das seções:**
  1. cenário de juros;
  2. índices de debêntures;
  3. emissões (dispersão e tabela);
  4. mercado secundário;
  5. série do RoadShow.

- [ ] **Testes RED.** `test_dispersao_exclui_sem_duration`, `test_dispersao_prefere_btg` e `test_dispersao_so_ipca`. Unit JS: o filtro reduz os pontos, e os subsetores saem na ordem fixa.
- [ ] **Implementar e regenerar.**
- [ ] **e2e.**
  - O número de pontos e de itens da legenda bate com o modelo.
  - O filtro "Rodovias" reduz a tabela e o gráfico juntos.
  - A ordem dos títulos das seções está certa.
  - A 390 px não há rolagem lateral; não há NaN nem rede.
- [ ] **Suítes verdes e verificação.** Rodar `python scripts/atualizar.py` duas vezes e confirmar que o HTML sai idêntico. Commit `feat: spread × duration scatter of transport debentures; indices section moved under the rates scenario`.
