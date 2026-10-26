# Curva ANBIMA, dispersão spread × duration e ordem da aba Debêntures — Design

Data: 26/10/2026 · Branch: `claude/confident-brown-k72wi2` (continua o trabalho de 23/10, ainda não mergeado).

## Pedido do usuário

1. Subir a seção "Índices de debêntures (IDA e IDEX-Infra)", com o spread sobre a NTN-B, para o topo da aba, logo abaixo do cenário de juros.
2. Incluir um gráfico de dispersão do spread de cada emissão contra a duration do papel.
3. ~~Botão para atualizar preços no HTML~~: descartado pelo usuário, porque o HTML deve continuar offline.

## Decisões do usuário

**Gráfico, como descrito na conversa:**
- cada ponto é uma debênture;
- eixo horizontal: duration em anos; eixo vertical: spread sobre a NTN-B em p.p.;
- cor por subsetor, com legenda;
- o nome do papel e do emissor aparecem ao passar o mouse.

**Opção 1:** tudo passa a usar a ANBIMA.
- **Taxa de cada debênture:** a taxa indicativa ANBIMA que vem nas telas.
- **Referência para todos os spreads do painel:** a curva de NTN-B do arquivo público diário da ANBIMA ("Mercado secundário de títulos públicos", `https://www.anbima.com.br/informacoes/merc-sec/arqs/msAAMMDD.txt`, campo `Tx. Indicativas` das linhas `NTN-B`). Ela substitui a taxa de compra do Tesouro Direto.
  - Vale para os negócios e intenções, o IDA, a dispersão e a curva mostrada no cenário de juros.
  - Os spreads já exibidos mudam alguns centésimos.
  - Os dias sem curva do Tesouro (de 16/10 em diante) passam a ter spread.

## Escopo

### Curva de NTN-B ANBIMA
- **Download:** um arquivo por dia útil necessário, com cache em `data/raw/debentures/publico/anbima_ms/`. São necessários os dias com negócios e intenções, o dia da tela, os dias do IDA e o último dia útil disponível, para a curva do cenário de juros.
- **Ritmo:** pausa entre pedidos e novas tentativas. Dia sem arquivo (feriado ou ainda não publicado) é registrado e não vira erro.
- **Cálculo do spread:** a regra é a mesma de hoje. Spread = taxa − NTN-B interpolada linearmente pelo vencimento, na curva do mesmo dia. Sem curva no dia, ou vencimento fora da curva → "—".
- **Sem dependência do Tesouro Direto:** o download do Tesouro sai do `fetch`. O código que só servia ao Tesouro é removido.
- **Textos:** fontes, glossário (spread, NTN-B), descrições e README passam a dizer "taxa indicativa ANBIMA".
- **Determinismo:** o bloco continua sem depender do dia em que o comando roda. A data de acesso é a do primeiro dia em que o arquivo foi visto, guardada com o hash.

### Dispersão spread × duration
- **Dados:** papéis do universo de transporte (as emissões da tabela), só IPCA+.
  - Duration (anos) e taxa indicativa ANBIMA vêm da tela BTG; se faltarem, da tela XP.
  - O spread é calculado contra a curva ANBIMA do dia da tela.
  - Papel sem duration, sem taxa ou sem curva não entra, e a quantidade de excluídos aparece em nota.
- **Bloco:** `debentures.dispersao = [{ticker, emissor, subsetor, duration_anos, taxa_indicativa, spread, data}]`, mais a data de referência.
- **Tela:** cartão "Spread sobre a NTN-B × duration das debêntures de transporte" na seção de emissões, acima da tabela.
  - Pontos coloridos por subsetor, com legenda.
  - Dica com ticker, emissor, duration, taxa e spread.
  - Eixos com unidade: duration em anos, spread em p.p.
  - Fonte e data tiradas dos dados.
  - O filtro "Todos | Rodovias | Outros transportes" da tabela vale também para o gráfico.

### Ordem da aba
A ordem fica:
1. cenário de juros (indicadores e curva de NTN-B);
2. índices de debêntures (IDA, IDEX e spread comparado);
3. emissões (dispersão e tabela);
4. mercado secundário;
5. série do RoadShow.

## Fora de escopo
- Botão de atualização (decisão do usuário).
- Histórico da curva ANBIMA além dos dias usados.

## Aceite
- Os testes de dados conferem o leitor do arquivo ANBIMA com uma fixture sintética, a interpolação e o spread de 2 papéis calculados à mão com a curva ANBIMA real.
- O e2e compara o gráfico com o modelo: número de pontos e cores por subsetor com legenda. O filtro de subsetor muda o gráfico junto com a tabela. A nova ordem das seções é conferida.
- Três suítes verdes. HTML ≤ 15 MB. Rodar duas vezes dá o mesmo HTML.

## Abordagens consideradas
1. **Tudo ANBIMA (escolhida pelo usuário).** Uma curva só, a referência de mercado, e preenche os dias sem curva do Tesouro.
2. **Curva ANBIMA só no gráfico.** O painel ficaria com duas curvas.
3. **Spread do último negócio de cada papel.** Pontos de datas diferentes, e só papéis negociados.
