# Fechamento do projeto — Design

Data: 2026-10-21 · Base: branch `claude/confident-brown-k72wi2` (v4, PR joaocscr/Rodovias#4 aberto) · Pedido do usuário: "O que falta para fecharmos o projeto? Monte um plano de execução e finalize o html."

## 1. Intenção

Fechar o projeto: entregar um HTML final sem pendências que dependam só de nós, com tudo que o `HANDOFF.md` §6 lista como possível de fazer daqui, e deixar registrado, de forma curta, o que depende do usuário ou de terceiros.

O trabalho vai no mesmo branch e entra no PR joaocscr/Rodovias#4: a entrega continua sendo a **v4** (regra de versão: um número inteiro por PR mergeado), que passa a se chamar "v4 — final" na documentação.

## 2. Escopo (decisões do controlador; o usuário pediu para executar)

### 2.1 Pendências da verificação dos leilões
- Régis Bittencourt: manter 15 anos (minuta do aditivo + página da ANTT) e registrar a B3 (25 anos) como divergência visível.
- Ponte São Borja: o deságio passa a "não se aplica (leilão por outorga)" — novo marcador `nao_se_aplica` no campo, com rótulo próprio no selo; continua fora da série e das médias.
- Limpezas de rótulos e notas: trecho da Nova 381 sem emenda "[…]"; rótulo único "4UM"; cláusula de derivação do 0,00% (tarifa = referência) no trecho do edital das otimizações; fonte de imprensa redundante do deságio da Rota Agro removida; motivo do Rota do Cerrado corrigido (não é "grafia").
- Linhas "RoadShow: …" de nome que pertence ao mesmo grupo econômico do nome verificado deixam de aparecer (Mercado e ficha); as divergências reais continuam.

### 2.2 Menores de código abertos (v4 e anteriores)
Todos os itens das listas "Menores de código da v4" e "Menores, registrados nas revisões" do HANDOFF §6, exceto: a folga da correlação VMDa (é propriedade dos dados, não defeito) e o tamanho de `antt.json` (fica como alerta). `_animatingZoom` passa a ser usado só por trás de uma função isolada com teste de versão do Leaflet, ou é substituído por API pública se houver equivalente.

### 2.3 Funcionalidades adiadas na v4
- **Aba Resumo** ("Leitura em 60 segundos"), **primeira aba e página inicial**: KPIs da malha, das concessões e dos leilões, 5–6 achados calculados com fórmula e fonte (página do RoadShow ou documento oficial), e atalhos para as abas. Números calculados em `intel-model`/`leiloes-model`, nunca digitados à mão.
- **Linha do tempo de editais e leilões 2026–2027** na seção Pipeline (aba Projetos).
- **Pista pelo SNV** na ficha e no cartão da concessão: km duplicados, em pista simples, em obra de duplicação e não pavimentados, pelo recorte curado.
- **Gráficos do RoadShow que faltam**, extraídos do PDF (agora baixável do Drive) com página de origem: ABDIB (p. 39), debêntures incentivadas (p. 77), estado do pavimento (p. 35), comparativos público × privado (pp. 41 e 45); e dois diagramas no Regulatório: fluxo do projeto ao leilão (p. 61) e fluxo de financiamento (pp. 73–77).
- **Reconciliação** declarado × recalculado do RoadShow como teste pytest (totais das pp. 3, 5, 17, 97, 125).
- **Fichas dos lotes sem ficha no RoadShow** (leilões de 2023–2025): praças, duplicação, tarifa-teto e TIR/WACC regulatória quando a ANTT publicar, pela mesma regra de fontes da v4 (oficial > RoadShow > imprensa não oficial).

### 2.4 Fora (depende do usuário ou de terceiros)
PNCT por posto (portal inacessível daqui), pedidos via LAI (ANTT cargas, PNL 2050), ANTAQ Estatístico (painel sem dado aberto utilizável), malha estadual 2024 (não publicada), editais estaduais com km (por lote, manual), reclassificar entidades por esfera (muda o modelo de estados; a nota da Via Liberdade basta). Ficam numa seção curta "O que depende de você" no HANDOFF.

## 3. Restrições
- As da v4: HTML único offline ≤ 15 MB, zero requisição de rede, toda cor de dado com legenda, só tokens de cor existentes, português claro, datas dd/mm/aaaa, nenhum número sem fonte.
- O PDF do RoadShow fica em `data/raw/` (fora do git); números extraídos vão para `data/roadshow/*.json` com a página.
- e2e continua verde; a aba Resumo como página inicial exige ajustar os testes que assumem o Mapa como inicial.

## 4. Critérios de aceite
- Todas as linhas de §2.1–2.3 feitas, com teste quando há código.
- HANDOFF §6 reduzido ao que está em §2.4 e a eventuais itens novos com motivo.
- Três suítes verdes; build ≤ 15 MB; HTML entregue ao usuário.
