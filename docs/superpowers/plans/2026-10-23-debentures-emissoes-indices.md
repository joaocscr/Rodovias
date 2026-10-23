# Debêntures: data de emissão, filtro por subsetor, IDA e IDEX-Infra · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A tabela de emissões da aba Debêntures ganha a data de emissão, o coordenador líder, a indicação "só incentivadas" e um filtro por subsetor. A aba ganha uma seção com o IDA (ANBIMA) e o IDEX-Infra (IDEX Analytics), com a evolução no tempo e a comparação com as debêntures de transporte.

**Architecture:** O desenho segue o do projeto: um módulo Python por fonte (`fetch`/`build`) grava um bloco JSON em `data/intel/`, e o `build.py` embute o bloco no HTML. O cadastro SND entra no bloco `debentures`. Dois blocos são novos: `ida` (baixado da ANBIMA) e `idex` (arquivos do usuário em `data/raw/idex/`). A tela usa funções puras em `src/debentures-model.js`.

**Tech Stack:** Python 3 + pytest + openpyxl + pymupdf; JS ES2020 sem bundler, `node --test`; Playwright e2e (`--test-concurrency=1`).

**Spec:** `docs/superpowers/specs/2026-10-23-debentures-emissoes-indices-design.md`

## Global Constraints

- HTML único, **≤ 15 MB**, **zero requisições de rede**. Sem dependências novas além de `requirements.txt`, que já tem pymupdf e openpyxl.
- **Atualização em um comando** (`python scripts/atualizar.py --baixar`).
  - Nenhum `data/intel/*.json` editado à mão. Nada de dado digitado na interface.
  - Os e2e comparam a tela com o modelo, nunca com números literais.
  - Rodar duas vezes em dias diferentes, com os mesmos insumos, dá blocos e HTML idênticos byte a byte. A data de acesso é a do primeiro dia em que o arquivo foi visto, guardada com o sha256, como já faz `debentures.registrar_planilhas`.
- **Arquivos brutos fora do git** (`data/raw/` é ignorado): planilhas de corretora, arquivos do IDEX, CSVs do IDA, exportação do SND. Os testes usam arquivos sintéticos pequenos e versionados em `tests/fixtures/`.
- **Só agregados das planilhas de corretora**, como já é hoje. Do IDEX, só agregados diários e o spread dos papéis de transporte. Do IDA, só a série dos índices e a taxa indicativa dos papéis de transporte.
- **Spread** = taxa − NTN-B do Tesouro Direto (taxa de compra) do mesmo dia, interpolada pelo vencimento. Reutilize `debentures.ler_tesouro`, `curva_ntnb` e `spread`. Sem curva no dia → `None`, mostrado como "—".
- Português claro, datas dd/mm/aaaa, números pt-BR. Toda fonte e todo período na tela vêm dos dados. Termos novos ligados ao Glossário.
- Sem o nome da empresa do autor e sem rótulos de versão (`tests/test_sem_mencoes.py`).
- Commits no branch `claude/confident-brown-k72wi2`, com as linhas de atribuição.

## Review Focus

1. **Dia sem resultado no IDA** (feriado, ou a ANBIMA não publicou): o dia é pulado e registrado como "sem dado" no cache, para não ser consultado de novo; nunca vira zero nem erro. Teste da Task 3: `test_dia_sem_resultado_nao_quebra`.
2. **Relatório do IDEX em layout diferente ou ilegível:** o build segue com os retornos já conhecidos, e o relatório entra no relatório de curadoria. Teste da Task 4: `test_relatorio_ilegivel_vai_para_curadoria`.
3. **Papel de transporte fora da carteira do IDA ou da amostra do IDEX:** a célula mostra "—", e o papel não some da tabela. Teste da Task 5, e2e `papel fora do índice mostra traço`.
4. **Filtro de subsetor e CSV:** o CSV exporta exatamente as linhas visíveis, e a contagem de cada opção bate com o modelo. Teste da Task 2, e2e `filtro de subsetor e CSV`.
5. **SND fora do ar:** o build usa o último cadastro baixado. Sem nenhum cadastro, a data de emissão fica "—" e entra na curadoria. Teste da Task 1: `test_sem_cadastro_snd_data_fica_nula`.

---

### Task 1: Cadastro SND da ANBIMA → data de emissão e coordenador líder

**Files:** Create `scripts/intel/snd.py`. Modify `scripts/intel/debentures.py` (`_emissoes`, `fetch`, `_fontes`), `scripts/curadoria.py`, `data/fontes_descricao.json` (só a descrição do bloco `debentures`). Tests: `tests/test_intel_snd.py` (novo), `tests/fixtures/debentures/snd.txt` (sintético: o cabeçalho real do SND e 4 linhas inventadas), `tests/test_intel_debentures.py`.

**Interfaces:**
- **Fonte:** URL `https://www.debentures.com.br/exploreosnd/consultaadados/emissoesdedebentures/caracteristicas_e.asp?tip_deb=publicas&op_exc=False`. A resposta é texto separado por tabulação, em latin-1. Há linhas de aviso antes do cabeçalho, que começa por `Codigo do Ativo`. As colunas usadas são `Codigo do Ativo`, `Data de Emissao`, `Coordenador Lider`, `Deb. Incent. (Lei 12.431)` (`S`/`N`) e `CNPJ`.
- `snd.fetch(dest: Path) -> bool`: baixa para `data/raw/debentures/publico/snd_caracteristicas.txt` com novas tentativas e registra o arquivo no manifesto de `debentures`. Devolve `False` se não baixou; nesse caso o arquivo anterior fica como está.
- `snd.ler(path: Path) -> dict[str, dict]`: `{ticker: {"data_emissao": "AAAA-MM-DD"|None, "coordenador_lider": str|None, "incentivada": bool|None, "cnpj": str|None}}`.
- **Bloco `debentures.emissoes[]`:** o campo `coordenadores` sai. Entram `data_emissao` (ISO) e `coordenador_lider`, preenchidos pelo SND. `incentivada` passa a vir do SND quando houver, senão continua vindo da tela. O campo `fontes` do papel ganha `"SND"` quando o cadastro foi usado.
- **Curadoria:** item `emissao_sem_cadastro_snd` para o papel do universo que não está no SND.

- [ ] **Testes RED.**
  - `test_ler_snd_fixture`: datas convertidas para ISO, `S` vira `True`, `N` vira `False`.
  - `test_emissoes_recebem_data_e_coordenador`: um bloco montado das fixtures tem `data_emissao` e `coordenador_lider`.
  - `test_sem_cadastro_snd_data_fica_nula`: sem o arquivo, `data_emissao` é `None` e há um item de curadoria por papel.
  - `test_bloco_nao_depende_do_dia_do_build`, que já existe, continua passando.
- [ ] **Implementar e ligar** `snd.fetch` dentro de `debentures.fetch`. A fonte "ANBIMA — cadastro de debêntures (SND)" entra em `debentures.fonte`.
- [ ] **Validar com dados reais.** Rodar `python scripts/atualizar.py --baixar --dominios debentures`: as 108 emissões ganham data e coordenador. Rodar as três suítes. Commit `feat: issue date and lead coordinator from the ANBIMA SND registry`.

### Task 2: Tabela de emissões — colunas, indicação e filtro de subsetor

**Files:** Modify `src/debentures-model.js`, `src/debentures.js`. Tests: `tests/debentures-model.test.mjs` e e2e em `tests/e2e-intel.test.mjs`.

**Interfaces:**
- **Consome** da Task 1: `emissoes[].data_emissao` e `coordenador_lider`.
- `DebenturesModel.contagemSubsetor(emissoes) -> {todos, rodovias, outros}`.
- `DebenturesModel.filtrarSubsetor(emissoes, filtro: 'todos'|'rodovias'|'outros') -> emissoes`. "outros" é todo subsetor diferente de "rodovias".
- `DebenturesModel.notaIncentivadas(emissoes) -> string`:
  - quando todas são incentivadas: "Somente debêntures incentivadas (Lei 12.431): as telas recebidas são de debêntures isentas.";
  - quando há mistura: "N incentivadas (Lei 12.431) e M não incentivadas".
- **Tabela:**
  - colunas "Data de emissão" (dd/mm/aaaa) e "Coordenador líder"; a regra genérica de ocultar coluna que é "—" em todas as linhas continua valendo;
  - a nota fica numa linha acima da tabela;
  - o filtro é um grupo de botões acessível (`role="radiogroup"`) com os rótulos "Todos (N)", "Rodovias (N)" e "Outros transportes (N)";
  - o CSV exporta só as linhas filtradas, e o nome do arquivo leva o sufixo do filtro.

- [ ] **Testes unitários RED.** Contagens com uma fixture de 3 subsetores; o filtro devolve só rodovias; as duas formas da nota.
- [ ] **Implementar.**
- [ ] **e2e "filtro de subsetor e CSV".** A contagem de cada botão é igual à do modelo. Ao clicar em "Rodovias", toda linha visível tem subsetor rodovias, e o CSV tem o mesmo número de linhas. A nota bate com `notaIncentivadas`. As datas aparecem em dd/mm/aaaa. Em 390 px, sem rolagem lateral.
- [ ] **Suítes verdes.** Commit `feat: issue date column, incentivized-only note and subsector filter on the emissions table`.

### Task 3: Bloco IDA (ANBIMA)

**Files:** Create `scripts/intel/ida.py`. Modify `scripts/atualizar.py` (domínio `ida` depois de `debentures`), `scripts/curadoria.py`, `scripts/intel/fontes_bloco.py` se for preciso, `data/fontes_descricao.json` (entrada `ida`), `data/manifest/ida.json` (gerado). Tests: `tests/test_intel_ida.py` e `tests/fixtures/ida/` (dois CSVs sintéticos no formato real).

**Interfaces:**
- **Download:** POST em `https://www.anbima.com.br/informacoes/ida/IDA_down.asp` com `tipo=cd&indice=<IND>&escolha=2&Idioma=PT&saida=csv&DataIniD=dd/mm/aaaa`. `IND` ∈ `IPCA_INFRAESTRUTURA`, `IPCA`, `GERAL`, `DI`.
- **Formato da resposta:** texto latin-1 separado por `;`. A linha `Data;Número Índice;Variação Diária (%);Variação no Mês (%);Variação no Ano (%);Variação 12 meses (%);Variação 24 meses (%);Duration (d.u.);Peso (%);Valor de Mercado (R$ milhões)` vem seguida da linha do índice. Depois vem a carteira, sob `Data;Código;Nome do Emissor;Código ISIN;Data de Vencimento;Indexador;Taxa Indicativa (% a.a.);PU (R$);…;Peso (%);…`. Um dia sem resultado não traz a linha do índice.
- **Amostragem:** o último dia útil de cada semana nos últimos 24 meses, mais todos os dias úteis dos últimos 31 dias.
- **Cache:** `data/raw/ida/cache.json`, com `{IND: {"AAAA-MM-DD": linha_resumo | "sem_dado"}}`. Só a carteira do dia mais recente é guardada, em `data/raw/ida/carteira_<IND>_<data>.csv`. Mais a carteira do IPCA Infraestrutura de cada dia da amostra, resumida ao spread médio, para a série de spread.
- **Ritmo do download:** pausa de 0,5 s entre consultas, até 3 tentativas, e só pede os dias que faltam no cache.
- `ida.ler_csv(texto: str) -> {"indice": {data, numero_indice, var_dia, var_mes, var_ano, var_12m, var_24m, duration_du, valor_mercado}|None, "carteira": [{codigo, emissor, vencimento, indexador, taxa_indicativa, peso}]}`.
- `ida.spread_medio(carteira, curva) -> float|None`: média ponderada pelo peso dos spreads dos papéis IPCA com curva no dia. Papel sem spread sai do numerador e do denominador. Sem nenhum spread → `None`.
- **Bloco `data/intel/ida.json`:**

```
{fonte: [...],
 indices: {IND: {nome, serie: [{data, numero_indice, base100, duration_du, spread_medio|null}],
                 ultimo: {data, var_mes, var_ano, var_12m, var_24m, duration_du, valor_mercado}}},
 papeis: {ticker: {taxa_indicativa, spread, data}}}
```

  - `spread_medio` existe só no `IPCA_INFRAESTRUTURA`.
  - `papeis` traz só os tickers de `data/intel/debentures.json`.
- **Curadoria:** `ida_dias_com_falha` (dias que falharam no download depois das tentativas).

- [ ] **Testes RED.**
  - `test_ler_csv_fixture`: o número-índice e as variações saem como número pt-BR convertido.
  - `test_spread_medio_ponderado`: confere com um cálculo manual de 3 papéis.
  - `test_dia_sem_resultado_nao_quebra`: o dia vira "sem_dado" e sai da série.
  - `test_base100`: o primeiro ponto da janela vale 100.
  - `test_papeis_so_do_universo`.
  - `test_bloco_ida_nao_depende_do_dia`: o build roda com dois "hoje" diferentes e dá o mesmo bloco.
- [ ] **Implementar** `fetch(force=False)` e `build()`, e ligar o domínio `ida`.
- [ ] **Baixar e conferir com dados reais.** Rodar `python scripts/atualizar.py --baixar --dominios ida`. A primeira carga leva alguns minutos; registrar o tempo no relatório. Conferir à mão o spread de 2 dias contra a carteira baixada. Rodar as suítes. Commit `feat: IDA block from ANBIMA daily results, with spread over NTN-B for IDA-IPCA Infraestrutura`.

### Task 4: Bloco IDEX-Infra (arquivos do usuário)

**Files:** Create `scripts/intel/idex_arquivos.py` (só a leitura dos arquivos) e `scripts/intel/idex.py` (`fetch` é no-op; `build`). Create `data/indices/idex_historico.json` (gerado e versionado: agregados diários acumulados). Modify `scripts/atualizar.py` (domínio `idex` depois de `ida`; pula com aviso sem arquivos), `scripts/curadoria.py`, `data/fontes_descricao.json` (`idex`). Tests: `tests/test_intel_idex.py`, `tests/fixtures/idex/` (xlsx sintético com aba "Detalhado" de 2 dias × 3 papéis, mais o texto de um relatório gerado em PDF pelo pymupdf).

**Interfaces:**
- `idex_arquivos.arquivos(pasta=Path('data/raw/idex')) -> {"datafile": Path|None, "relatorios": [Path]}`. `datafile` é o `*datafile*.xlsx` mais recente.
- `idex_arquivos.ler_datafile(path) -> [{data, ticker, peso, duration, spread_bps}]`. Lê a aba "Detalhado", colunas `Data`, `Debênture`, `Peso no índice (%)`, `Duration` e `MID spread (Bps/NTNB)`.
- `idex_arquivos.ler_relatorio(path) -> {"mes_referencia": "AAAA-MM", "retornos": {"Idex-Infra Geral": {"AAAA-MM": pct}, "Idex-Infra Core": {...}}, "acumulado_ano": {nome: {AAAA: pct}}}`. Lê a página "Histórico de performance" pelo pymupdf. Os meses se alinham da esquerda (jan) para a direita; o último número da linha é o "Acum. Ano".
- `idex.agregar_dia(linhas) -> {data, spread_medio_bps, duration_media, n_papeis}`: médias ponderadas pelo peso.
- **Bloco `data/intel/idex.json`:**

```
{fonte: [...],
 spread: [{data, spread_medio_bps, duration_media, n_papeis}],
 retornos: {nome: [{mes, pct}]},
 acumulado_12m: {nome: pct|null},
 papeis: {ticker: {spread_bps, data}}}
```

  - `spread` junta o histórico de `data/indices/idex_historico.json` com os dias do datafile atual; o dia novo vence.
  - `papeis` traz só os tickers de `data/intel/debentures.json`, no último dia.
- **Curadoria:** `idex_arquivo_antigo` (datafile com último dia há mais de 45 dias da data do bloco de debêntures); `idex_relatorio_ilegivel`; `idex_reconciliacao` (o produto dos retornos mensais do ano difere do acumulado impresso em mais de 0,05 p.p.).
- **Sem arquivos:** o domínio é pulado com aviso, e o bloco anterior fica como está. Sem bloco nenhum, a tela mostra o aviso da Task 5.

- [ ] **Testes RED.**
  - `test_ler_datafile_fixture`.
  - `test_agregar_dia_ponderado`.
  - `test_historico_cresce_e_dia_novo_vence`.
  - `test_ler_relatorio_fixture`: confere o alinhamento dos meses no ano incompleto.
  - `test_reconciliacao_ano`.
  - `test_relatorio_ilegivel_vai_para_curadoria`.
  - `test_sem_arquivos_pula`.
  - `test_bloco_idex_nao_depende_do_dia`.
- [ ] **Implementar e rodar com dados reais.** Rodar `python scripts/atualizar.py --dominios idex` com os arquivos reais em `data/raw/idex/`. Conferir: 22 dias de spread, retornos de jan/2024 a jun/2026, e a reconciliação de 2024 e 2025 dentro de 0,05 p.p. Rodar as suítes. Commit `feat: IDEX-Infra block from user-provided datafile and monthly report`.

### Task 5: Seção "Índices de debêntures (IDA e IDEX-Infra)"

**Files:** Modify `src/debentures-model.js`, `src/debentures.js`, `src/charts.js` (só se faltar forma), `scripts/build.py` (embutir `ida` e `idex`, se não for automático), `data/glossario.json` (entradas `ida`, `idex-infra`, `carteira-teorica`, `ponto-base`, com edição em texto que preserva a formatação). Tests: unit e e2e.

**Interfaces:**
- **Consome** os blocos das Tasks 3 e 4 e `DebenturesModel.series(bloco, {somado})`, que já existe.
- `DebenturesModel.evolucaoIda(ida) -> [{nome, pontos: [{data, base100}]}]`.
- `DebenturesModel.retornosIdex(idex) -> [{nome, pontos: [{mes, acumulado_pct}]}]`: o retorno composto desde o primeiro mês.
- `DebenturesModel.comparacaoSpread(bloco, ida, idex, {somado}) -> [{rotulo, spread_pp, periodo, fonte}]`. São três linhas:
  - "Debêntures de transporte (negócios)", ou "(negócios + intenções)" quando a opção somado está ligada;
  - "IDA-IPCA Infraestrutura";
  - "IDEX-Infra Geral".

  O IDEX é convertido de pontos-base para p.p. (÷ 100). A média é sobre o período comum das três séries quando houver; senão, sobre o último dia de cada uma, com o período dito.
- `DebenturesModel.tabelaIndicesPorPapel(bloco, ida, idex) -> [{ticker, emissor, spread_painel, taxa_anbima, spread_idex_pp}]`. Papel fora de um índice → `null`, mostrado como "—".
- **UI**, entre o mercado secundário e a série do RoadShow:
  - título "Índices de debêntures (IDA e IDEX-Infra)" e uma linha que explica os dois índices, com link ao Glossário;
  - cartão 1: gráfico do IDA rebaseado (4 linhas, com legenda) e gráfico do retorno acumulado do IDEX (Geral e Core);
  - cartão 2: barras do spread comparado, que respondem à opção "ver somado";
  - cartão 3: tabela por papel (ordenável, com CSV);
  - em cada cartão, fonte e período tirados dos dados. Sem bloco `idex`, o cartão do IDEX diz: "Aguardando os arquivos do IDEX-Infra (planilha de dados e relatório mensal) em data/raw/idex/."

- [ ] **Testes unitários RED.** Base 100; retorno composto (1,01 × 1,02 − 1 = 3,02%); conversão de bps para p.p.; papel fora do índice dá `null`; o rótulo muda com somado.
- [ ] **Implementar.**
- [ ] **e2e.**
  - Os gráficos têm o número de séries do modelo.
  - Os valores do spread comparado batem com o modelo, com somado desligado e ligado.
  - "papel fora do índice mostra traço".
  - Bloco `idex` ausente (injetado) mostra o aviso.
  - Sem NaN, sem rede, 390 px sem rolagem lateral.
  - Glossário com os 4 ids novos (`test_links_do_glossario_existem`).
  - A aba Fontes e o Resumo listam `ida` e `idex` (os testes bidirecionais existentes).
- [ ] **Suítes verdes.** Commit `feat: IDA and IDEX-Infra section on the debentures tab`.

### Task 6: Documentação, build final e entrega

**Files:** `README.md`, `docs/HANDOFF.md`, `data/atualizacao.md` (gerado), `mapa-rodovias.html`.

- [ ] **README.** Atualizar a tabela de domínios (`ida`, `idex`), o roteiro "como atualizar o IDEX" (salvar a planilha e o relatório em `data/raw/idex/` e rodar o comando), a origem da data de emissão (SND) e onde entraria a API do IDEX (`scripts/intel/idex_arquivos.py`).
- [ ] **HANDOFF.** Módulos novos e itens de curadoria novos. Registrar a pendência sobre os termos de uso do IDEX, que é decisão do usuário, já registrada.
- [ ] **Build e verificação.** Rodar `python scripts/atualizar.py` e as três suítes. Conferir HTML ≤ 15 MB. Commit e push.
