# Debêntures: data de emissão, filtro por subsetor, IDA e IDEX-Infra — Design

Data: 23/10/2026 · Base: `main` em e3d1b4a (PR joaocscr/Rodovias#4 mergeado) · Branch: `claude/confident-brown-k72wi2`, recomeçado da `main`.

## 1. Intenção

Na aba Debêntures, a tabela de emissões ganha a data de emissão e um filtro por subsetor (rodovias × outros transportes). A aba passa a mostrar dois índices de mercado de debêntures, o IDA (ANBIMA) e o IDEX-Infra (IDEX Analytics). O objetivo é comparar as debêntures de transporte com o mercado de infraestrutura e acompanhar os índices ao longo do tempo.

O IDEX entra agora por arquivos que o usuário salva (pasta Rodovias do Drive → `data/raw/idex/`). Num segundo momento, a ideia é acessá-lo por API.

Continuam valendo os princípios do projeto:
- atualização em um comando;
- nada digitado na interface;
- nenhum número sem fonte;
- só agregados das planilhas de corretora;
- HTML único offline ≤ 15 MB;
- testes que sobrevivem a dados novos.

## 2. Decisões do usuário (23/10/2026)

- A tabela de emissões fica **só com as debêntures isentas das telas**. Todas são incentivadas pela Lei 12.431 (conferido no cadastro da ANBIMA: 108 de 108).
- **Sem filtro convencional × incentivada.** No lugar dele, uma indicação de que a tabela mostra apenas debêntures incentivadas (Lei 12.431).
- **Filtro rodovias × outros transportes** na tabela de emissões.
- **IDA e IDEX-Infra:** mostrar os dois, tanto a comparação com as debêntures de transporte quanto a evolução no tempo.
- **Fonte do IDEX agora:** os arquivos salvos no Drive, que são a planilha de dados do IDEX-Infra Geral e o relatório mensal em PDF. API num segundo momento.

## 3. Escopo

### 3.1 Tabela de emissões
- **Data de emissão e coordenador líder:** vêm do cadastro público de debêntures da ANBIMA (SND, exportação "Características das debêntures públicas", um arquivo com todas as séries registradas). O casamento é pelo código do ativo. A busca é automática (`fetch`), como as séries do Banco Central.
  - A coluna "Coordenadores" passa a se chamar "Coordenador líder".
  - Papel que não estiver no cadastro fica "—" e vira item de curadoria.
- **Indicação acima da tabela**, numa linha, com o número vindo dos dados: "Somente debêntures incentivadas (Lei 12.431): as telas recebidas são de debêntures isentas." Se um dia aparecer uma emissão não incentivada, a frase muda sozinha para dizer quantas há de cada tipo.
- **Filtro de subsetor:** "Todos | Rodovias | Outros transportes". Ele vale para a tabela e para o CSV exportado, e mostra a contagem em cada opção.

### 3.2 IDA — Índice de Debêntures ANBIMA
- **Fonte:** resultados diários publicados no site da ANBIMA (consulta "Resultado diário por índice", em CSV), sem login. Cada dia traz o número-índice, a variação no dia, no mês, no ano, em 12 e em 24 meses, a duration, o valor de mercado e a carteira teórica com a taxa indicativa de cada papel.
- **Subíndices:** IDA-IPCA Infraestrutura (o principal para a comparação), IDA-IPCA, IDA-Geral e IDA-DI.
- **Histórico:** 24 meses de dias úteis, baixados uma vez e depois só os dias novos. É uma consulta por dia, com pausa entre elas e novas tentativas. O cache bruto fica em `data/raw/ida/`, fora do git.
- **Evolução:** número-índice rebaseado em 100 no início da janela, para os quatro subíndices. Para o IDA-IPCA Infraestrutura, também o spread médio sobre a NTN-B.
  - O spread de cada papel é a taxa indicativa menos a NTN-B interpolada pelo vencimento, na curva do Tesouro Direto do mesmo dia. É o mesmo método já usado nas debêntures de transporte.
  - A média é ponderada pelo peso de cada papel na carteira.
  - Dia sem curva fica "—".
- **Comparação:** spread e taxa média das debêntures de transporte (negócios, e somado quando a opção estiver ligada) ao lado do spread e da taxa do IDA-IPCA Infraestrutura no mesmo período. Para cada papel de transporte que está na carteira do IDA, entra também a taxa indicativa da ANBIMA.

### 3.3 IDEX-Infra (IDEX Analytics)
- **Entrada:** arquivos em `data/raw/idex/`, fora do git, com nomes livres.
  - **Planilha de dados** (`*datafile*.xlsx`, aba "Detalhado"): por dia e por debênture, o peso no índice, a duration e o spread sobre a NTN-B em pontos-base. Hoje cobre de 22/09 a 22/10/2026, 22 dias e 538 papéis.
  - **Relatório mensal** (PDF): tabela "Histórico de performance", com o retorno mensal do IDEX-Infra Geral e do Core desde 2024.
- **Leitura isolada** num módulo (`scripts/intel/idex_arquivos.py`), com o mesmo desenho das planilhas de corretora. A troca futura pela API mexe só nele.
- **Evolução:**
  - spread médio ponderado diário e duration média do IDEX-Infra Geral, na janela da planilha;
  - retorno mensal e acumulado do Geral e do Core, tirados do relatório.
- **Histórico que cresce sozinho:** cada execução guarda os agregados diários já vistos (spread médio, duration, número de papéis) em `data/manifest/idex.json`. Assim, a série de spread passa a cobrir mais de um mês conforme novas planilhas forem salvas. Retorno mensal novo entra quando um relatório novo for salvo.
- **Comparação:**
  - spread das debêntures de transporte (negócios) contra o spread médio do IDEX-Infra no mesmo período;
  - para cada papel de transporte presente no IDEX (94 de 108 hoje), o spread IDEX do último dia ao lado do spread calculado pelo painel.
- **Sem arquivo:** o cartão diz que aguarda os arquivos e explica onde salvá-los. O build não quebra.
- **Uso dos dados:** os termos de uso da IDEX Analytics pedem autorização para reproduzir os índices. A decisão de usar os arquivos é do usuário. O painel cita a fonte e a data de cada arquivo, e o bloco guarda só agregados e os spreads dos papéis de transporte.

### 3.4 Onde fica na aba
Uma seção nova, "Índices de debêntures (IDA e IDEX-Infra)", entre o mercado secundário e a série do RoadShow, com três cartões:
1. Evolução dos índices (dois gráficos: IDA rebaseado e retorno do IDEX).
2. Spread sobre a NTN-B: IDA-IPCA Infraestrutura × IDEX-Infra × debêntures de transporte.
3. Tabela por papel: spread do painel, taxa ANBIMA e spread IDEX.

Cada cartão traz a fonte e o período tirados dos dados, e os termos novos ganham links para o Glossário.

### 3.5 Glossário, Fontes e Resumo
- **Glossário:** entradas para IDA, IDEX-Infra, carteira teórica e ponto-base. Cada definição traz a fonte quando houver.
- **Fontes e Resumo:** os blocos novos (`ida`, `idex` e o cadastro SND dentro de `debentures`) aparecem sozinhos, porque as duas abas leem os blocos embutidos. As descrições em linguagem simples ficam em `data/fontes_descricao.json`.

## 4. Atualização
- **Novo domínio em `scripts/atualizar.py`:** `indices_debentures` (IDA e IDEX), depois de `debentures`. Com `--baixar`, ele baixa o cadastro SND e os dias novos do IDA.
- **IDEX:** basta salvar a planilha e o relatório novos em `data/raw/idex/` e rodar o comando.
- **Novos itens de curadoria:**
  - papel sem cadastro SND;
  - arquivo do IDEX com mais de 45 dias;
  - relatório do IDEX que não pôde ser lido;
  - dias do IDA que falharam no download.
- **Datas:** o bloco não depende do dia em que o comando roda. É a mesma regra das planilhas de corretora: a data de acesso é a do primeiro dia em que o arquivo foi visto, guardada no manifesto com o hash.

## 5. Fora de escopo
- Debêntures convencionais e a lista completa do cadastro ANBIMA (decisão do usuário: só isentas).
- API do IDEX e API interna (fica a interface pronta).
- IDEX-Infra Core além do retorno mensal: a planilha salva é a do Geral.

## 6. Critérios de aceite
- Cada item dos §3.1 a §3.5 implementado, com teste de dados (pytest) e de tela (e2e) que comparam com o modelo, não com números digitados.
- O spread do IDA confere com um cálculo manual de dois dias num teste.
- O spread médio do IDEX confere com a planilha num teste.
- O parser do relatório confere a soma: o produto dos retornos mensais bate com o acumulado do ano impresso.
- Sem os arquivos do IDEX ou sem rede, o build termina com aviso e os cartões dizem o que falta.
- Três suítes verdes, HTML ≤ 15 MB, rodar duas vezes em dias diferentes dá o mesmo HTML.

## 7. Abordagens consideradas
1. **IDA agora e IDEX só com licença ou API.** Descartada: o usuário quer os dois já.
2. **IDA pela ANBIMA e IDEX pelos arquivos que o usuário salva (escolhida).** Mostra os dois agora. Respeita a decisão do usuário sobre o uso do IDEX e deixa a troca pela API isolada num módulo.
3. **Só o IDA.** Descartada pelo mesmo motivo da primeira.

## 8. Decisões do construtor (podem ser revistas)
- Subíndices do IDA mostrados: Infraestrutura, IPCA, Geral e DI.
- Janela de 24 meses para o IDA.
- Coordenador líder entra junto com a data de emissão, porque vem do mesmo arquivo.
- O spread do IDA é calculado pelo painel, com a mesma curva usada nas debêntures de transporte, para a comparação ser justa.
- Os spreads do IDEX são exibidos como a IDEX publica (pontos-base sobre a NTN-B de referência) e convertidos para p.p. ao lado dos nossos.
