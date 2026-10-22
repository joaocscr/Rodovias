# Ajustes de leitura, base de consórcios, glossário e página de debêntures — Design

Data: 2026-10-22 · Base: branch `claude/confident-brown-k72wi2` (PR joaocscr/Rodovias#4 aberto) · Pedido do usuário em 13 itens (22/10/2026), escolhas confirmadas em chat.

## 1. Intenção

O painel vai ser mostrado a pessoas que nunca viram as fontes (RoadShow, bases da ANTT, DNIT etc.). Cada tela precisa se explicar sozinha. O usuário também quer uma página de debêntures de rodovias e infraestrutura de transporte, que depois será alimentada por uma API interna, e um projeto sem nenhuma menção à empresa onde trabalha até a migração para a plataforma interna.

Princípios que continuam valendo: atualização fácil (um comando, nada digitado à mão na interface, testes que sobrevivem a dados novos); nenhum número sem fonte; imprensa marcada "não oficial"; HTML único offline ≤ 15 MB.

## 2. Critério de clareza (do usuário)

Um título ou subtítulo é necessário quando a resposta a esta pergunta é "sim": *um leitor que nunca viu os materiais usados como base entenderia o que a informação representa e ao que faz referência?* Se não entenderia, o cartão ganha o contexto mínimo: o universo (ex.: concessões federais leiloadas pela ANTT; programa federal de concessões 2023–2027 do Ministério dos Transportes), o período e a unidade. Sem excesso: uma linha.

## 3. Escopo

### 3.1 Aba Resumo — "Sobre este painel"
Bloco no topo, curto:
- **Para que serve:** visão de mercado das concessões rodoviárias no Brasil (malha, carteira de projetos, leilões, tráfego, cargas, financiamento).
- **De onde vêm as informações:** lista das fontes principais em linguagem simples, cada uma com uma frase do que é. O RoadShow é apresentado como "apresentação do Ministério dos Transportes a investidores sobre a carteira de concessões rodoviárias 2026–2027 (edição de 14/10/2026)", não pela sigla; ANTT, DNIT/SNV, IBGE, PRF, ABCR, Infra S.A., CVM, Banco Central etc.
- **Data-base:** por bloco de dados, a data ou o período a que os números se referem e a data de acesso, **gerados dos próprios dados** (bloco `fontes` e camadas), nunca digitados.
- Na primeira menção de cada termo técnico, link para o Glossário.

### 3.2 Correções na aba Mercado
- **Typo** no cartão de deságio médio por número de concorrentes ("leilãoões"); revisar todas as flexões de plural geradas no código.
- **"Outros N grupos"** sempre na última linha dos gráficos de grupos (extensão e investimento), mesmo que a barra seja maior.
- **Tooltip** do gráfico de investimento por grupo: o detalhe (capex + opex) precisa aparecer ao passar o mouse — hoje não aparece.
- **Diagnóstico da carteira:** a p. 29 do RoadShow só traz 2022, 2026, 2027 e 2030. 2023–2025 entram de fontes oficiais que o projeto já tem: extensão concedida (RoadShow p. 37), contratos (fichas, por data de assinatura) e investimento executado (série da ANTT). 2028–2029 não são publicados: ficam fora, com nota dizendo que nenhuma fonte os publica (sem interpolar). A tabela é montada pelo código a partir dos dados (atualiza sozinha quando as fontes mudam), e cada célula diz a fonte.
- **Títulos e subtítulos** revistos pelo critério da §2 em todos os cartões; em especial "Indicadores dos leilões do programa" (qual programa) e "Deságio do vencedor, 2007–2026" (concessões rodoviárias federais leiloadas pela ANTT).

### 3.3 Revisão de clareza em todas as abas
Aplicar a §2 a todos os títulos, subtítulos, legendas, cartões do mapa e cabeçalhos de tabela de todas as abas, inclusive a de debêntures.

### 3.4 Base de consórcios (aba Mercado)
- Arquivo curado `data/roadshow/consorcios.json`: por consórcio (nome como aparece nos leilões), os integrantes e a participação de cada um (%), com fonte (mesma regra de fontes da v4; imprensa marcada "não oficial"). Participação não publicada → "não informada"; composição não localizada → o consórcio aparece com "composição não localizada".
- Escopo de pesquisa: consórcios **vencedores** de 2007–2026 e os demais consórcios de 2023–2026 (onde as atas da ANTT listam integrantes). Empresas que participam sozinhas não precisam de ficha (são o próprio grupo).
- Ao clicar num grupo (ranking, gráficos de grupos) ou num nome de consórcio (tabela de participantes), abre uma ficha com: os consórcios em que o grupo esteve, a composição e a participação de cada integrante, os leilões disputados (vitórias e derrotas) e as fontes.
- Validação no pytest (fonte para todo dado, soma das participações = 100% quando todas informadas, nomes casando com os da camada de leilões).

### 3.5 Aba Glossário
Aba própria com os termos de mercado e técnicos usados no painel (ex.: VMDa, VMD, SAT, praça de pedágio, free flow, PAM, PNL, carga modelada × medida, SNV, físico, deságio, aporte de recursos vinculados, otimização contratual, relicitação, capex, opex, VPL, WACC, TIR, TKM, data-base, debênture incentivada/infraestrutura, NTN-B, spread, duration, IPCA+, CDI, Selic, Focus). Definições curtas em português simples, com a fonte quando a definição vier de norma. Conteúdo em JSON curado (`data/glossario.json`), não no código; as outras abas linkam para os termos.

### 3.6 Fontes sem versões
Nenhuma menção a versões do projeto no material (v1, v2, v3, v3.1, v4, "bases da v1/v2", "novidades da v…"). A aba Fontes lista exatamente as fontes usadas no HTML gerado — derivada dos blocos e camadas embutidos —, sem histórico. O histórico fica no GitHub.

### 3.7 Página de debêntures (aba nova)
Universo: **emissores de rodovias e infraestrutura de transporte** (rodovias, ferrovias, portos e terminais, aeroportos, hidrovias, mobilidade urbana sobre trilhos). Classificação por arquivo curado `data/debentures/emissores.json` (emissor → subsetor), que casa os nomes das diferentes fontes; tickers sem emissor classificado vão para o relatório de curadoria.

Conteúdo:
- **Indicadores macroeconômicos** (séries públicas, atualizáveis): Selic meta, CDI, IPCA 12 meses, expectativa de IPCA (Boletim Focus) e taxas das NTN-B (Tesouro Nacional), com data.
- **Emissões:** emissores, subsetor, coordenadores/distribuidores quando a fonte trouxer, volume emitido, data de emissão, vencimento, indexador, taxa de emissão, incentivada (Lei 12.431) ou não, rating. Fontes: telas XP e BTG (arquivo enviado pelo usuário em 22/10/2026) e, se acessível, dados abertos da CVM (ofertas registradas) para emissor/coordenador/volume.
- **Mercado secundário** (planilha de negócios de 01/10 a 21/10/2026 enviada pelo usuário; abas BTG e XP): volume negociado, número de negócios, taxa média ponderada e spread sobre a NTN-B de referência por emissor, por subsetor e ao longo do período; últimos negócios por ticker. Spread = taxa do negócio − taxa da NTN-B de vencimento mais próximo na mesma data (fonte: Tesouro Nacional / ANBIMA, conforme disponível); quando a NTN-B do dia não estiver disponível, o spread fica "—".
- **Atualização:** as planilhas entram por uma pasta de entrada (`data/raw/debentures/`), lidas por `scripts/intel/debentures.py` (com `fetch` para as séries públicas e `build` para o bloco), integrado ao `scripts/atualizar.py`. A leitura das planilhas fica atrás de uma interface única (`ler_negocios`, `ler_telas`) para ser trocada pela API interna depois sem mexer no resto. Arquivos do usuário não vão para o git (como os demais brutos); o bloco gerado vai.
- **Fontes:** a página e a aba Fontes dizem que os dados de mercado secundário vêm de telas e negócios de corretoras (XP e BTG) fornecidos pelo usuário, com o período.

### 3.8 Remover menções à empresa do usuário
Nenhuma menção a "Galapagos"/"Galápagos" nos arquivos atuais do repositório nem no HTML: README, docs (specs, planos, HANDOFF, paleta), código (nomes de tokens e comentários), testes e dados. Tokens de cor passam a ter nomes neutros (ex.: "paleta base"). O histórico do Git **não** é reescrito (decisão do usuário): a `main` fica sem menções quando este trabalho entrar nela.

### 3.9 Documento para o TI (fora do projeto)
Documento simples, só para o usuário, fora do repositório: o que é o projeto, arquitetura em uma página, como rodar e atualizar, dependências e fontes, o que a migração precisa (hospedagem do HTML ou de um serviço, agendamento do `atualizar.py`, acesso às fontes, substituição das planilhas pela API interna, segredos), riscos e um roteiro de demonstração de 15 minutos.

## 4. Fora de escopo
- Integração com a API interna de debêntures (fica a interface pronta para ela).
- Reescrever o histórico do Git.
- Tempo real: o HTML continua uma fotografia gerada pelo comando de atualização.

## 5. Critérios de aceite
- Itens 3.1–3.8 feitos, com teste quando há código; nenhuma ocorrência de "galapagos" (sem acento ou com) em `git grep -i` nem no HTML; nenhuma menção a versão do projeto no HTML.
- Página de debêntures gerada pelo comando de atualização a partir das planilhas e das séries públicas; spreads e volumes conferidos contra a planilha num teste.
- Três suítes verdes; HTML ≤ 15 MB; documento do TI entregue ao usuário.
