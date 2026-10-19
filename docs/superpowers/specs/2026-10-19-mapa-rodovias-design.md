# Mapa Interativo da Malha Rodoviária Federal — Design

Data: 2026-10-19 · Fonte de dados: DNIT, SNV versão 202607A

## 1. Intenção

Um mapa interativo, em um único arquivo HTML que roda **offline**, mostrando toda a malha rodoviária federal do SNV sobre o mapa do Brasil (contornos das UFs). Uso principal: **análise interna** do time, em **computador (desktop)**. A pergunta típica é "quantos km duplicados e concedidos há no PR?" ou "onde estão as obras de pavimentação?". Por isso a combinação filtros + números vale mais que enfeite visual.

Referência visual dada pelo usuário: UFs em cinza claro com bordas finas e siglas centralizadas, rodovias em azuis e cinza escuro por cima (estilo "mapa institucional limpo").

## 2. Metas, não-metas, anti-metas

**Metas (v1)**
- Desenhar os 7.673 trechos do SNV 202607A sobre os contornos das 27 UFs.
- Filtros combináveis, busca e painel de números que reage aos filtros.
- Cartão de detalhe ao clicar num trecho.
- Seguir estritamente o design system Galapagos (skill `galapagos-brand`).
- Arquivo único, autocontido, abrindo com duplo clique (`file://`), sem nenhuma requisição de rede.

**Não-metas (v1)**
- Exportar CSV.
- Fundo de satélite ou mapa de ruas (tiles).
- Edição de dados, login, backend.
- Uso otimizado para celular (deve funcionar razoavelmente, mas o alvo é desktop ≥ 1280 px).

**Anti-metas (falharia mesmo "funcionando")**
- Cores fora da paleta da marca.
- Lentidão ao filtrar/arrastar (meta: filtro aplicado em < 200 ms, pan/zoom fluido em notebook comum).
- Números do painel que não batem com a extensão oficial do SNV (dupla contagem de coincidências no total geral).
- Depender de internet (CDN, Google Fonts, tiles).

## 3. Dados

### 3.1 Fonte
`SNV_202607A.shp` (dentro de `202607A.zip`, Google Drive do usuário, pasta "Claude Projects / Rodovias", fileId `1PRZr6mPqbNVyqwF6cBxk049g3Tqya7gO`). Polylines em SIRGAS 2000 lat/long. 7.673 feições, ~5,74 milhões de vértices (shp de 92 MB). O `.cpg` declara UTF-8 e o texto é de fato UTF-8.

Contornos das UFs: malha do IBGE (API de malhas `servicodados.ibge.gov.br/api/v3/malhas/paises/BR?intrarregiao=UF`, acessível neste ambiente), baixada **uma vez no build** e embutida no HTML.

### 3.2 Campos usados

| Campo | Uso |
|---|---|
| `vl_br` | BR (ex. "116") — filtro, busca, cartão |
| `sg_uf` | UF — filtro, painel, cartão |
| `vl_codigo` | Código do trecho (ex. "010BDF0010") — busca, cartão, chave |
| `nm_tipo_tr` | Tipo de trecho: Eixo Principal, Contorno, Acesso, Travessia Urbana, Anel, Variante — filtro |
| `ds_local_i` / `ds_local_f` | Localidade início/fim — busca, cartão |
| `vl_km_inic` / `vl_km_fina` / `vl_extensa` | km inicial, final, extensão (km) — cartão; `vl_extensa` é a base de todos os totais |
| `ds_legenda` | Situação (9 valores): Pavimentada, Planejada, Duplicada, Implantada, Em obra de Duplicação, Em obra de Pavimentação, Em obra de Implantação, Leito Natural, Travessia — estilo da linha, filtro, painel |
| `ds_superfi` | Superfície: PAV, N_PAV, PLA → exibir "Pavimentada", "Não pavimentada", "Planejada" — filtro |
| `ds_jurisdi` | Jurisdição: Federal, Estadual, Municipal, Distrital — filtro, cartão |
| `ds_tipo_ad` | Administração: Federal, Estadual, Concessão Federal, Municipal, Convênio Adm.Federal/Estadual, Distrital, Convênio Adm.Federal/Municipal — filtro, painel, realce de concessão |
| `desc_coinc` / `ds_coinc` | Coincidência entre BRs (844 trechos "Coinc") — deduplicação (ver 3.4) e cartão ("Coincide com BR-020, BR-030") |
| `est_coinc` / `sup_est_co` | Coincidência com rodovia estadual — cartão |
| `ul` | Unidade local DNIT — cartão |

Campos ignorados: `sg_tipo_tr`, `ds_sup_fed`, `ds_obra`, `ds_ato_leg`, `sg_legenda`, `leg_multim`, `versao_snv`, `id_versao`, `marcador`, `id_trecho_` (exceto como id interno, se útil). A versão "202607A" aparece no rodapé.

### 3.3 Pipeline de preparo (Python, no repositório)
`scripts/build_data.py` (ou equivalente) que:
1. Lê o shapefile (pyshp) em UTF-8.
2. Simplifica as geometrias (Douglas-Peucker, tolerância a calibrar; ponto de partida ~0,0005°–0,001° ≈ 50–100 m) e quantiza coordenadas (5 casas decimais ou inteiros delta-codificados).
3. Baixa/lê a malha de UFs do IBGE, simplifica e calcula pontos para os rótulos das siglas.
4. Gera o HTML final injetando dados + JS + CSS + fontes num template.

Meta de tamanho: HTML final **≤ 15 MB**, idealmente 5–8 MB. Se a simplificação deixar curvas visivelmente quebradas no zoom máximo útil (escala de cidade), reduzir a tolerância, já que o orçamento permite.

O dado bruto (zip de 68 MB) **não** vai para o repositório. Vai para `.gitignore`, com instrução no README de onde baixar (Drive / site do DNIT). O HTML gerado **vai** para o repositório (é o entregável).

### 3.4 Coincidências e totais
Trechos coincidentes (mesma pista com mais de uma BR) aparecem como registros separados, um por BR, com mesma geometria.
- **Desenho:** cada geometria física é desenhada uma vez. Agrupamento por union-find: une os registros citados juntos em `ds_coinc` (o registro principal vem com `desc_coinc = "-"` e os secundários com "Coinc", mas todos compartilham o `ds_coinc`) e os registros com geometria idêntica (mesmos extremos e mesmo número de vértices), o que corrige um caso em MG com `ds_coinc` inconsistente. Um trecho físico está visível se *qualquer* um dos seus registros passa nos filtros.
- **Regra única de soma (decisão do designer):** a seleção é um conjunto de trechos físicos e **cada trecho físico conta uma vez, sempre**, inclusive com várias BRs selecionadas (BR-020 + BR-030 juntas contam o trecho compartilhado uma vez, que é o km real de estrada). Com uma única BR filtrada, isso já dá a extensão completa daquela BR.
- **Atributos do grupo:** verificado nos dados que os registros de um mesmo grupo têm situação, administração, UF, jurisdição e extensão idênticos. Qualquer registro serve como "principal"; usar o de menor `vl_br`. O build deve verificar isso de novo e avisar se mudar numa versão futura do SNV.
- **Painel:** mostrar uma nota curta "Trechos coincidentes contados uma vez" quando aplicável.

Números de referência medidos nesta versão: 7.673 registros → 6.815 trechos físicos (775 grupos com mais de um registro; os 844 registros "Coinc" têm todos par geométrico); Σ `vl_extensa` bruta = 131.690,7 km; deduplicada = 122.394,9 km. (Uma primeira versão deste documento dizia 7.591 / 131.085,2 km porque só agrupava registros marcados "Coinc" e deixava o principal de fora; corrigido durante a implementação.) Não há um número oficial publicado do DNIT como alvo. A validação é de consistência interna: o build imprime esses dois totais e o HTML sem filtros deve exibir o deduplicado.

## 4. Interface

### 4.1 Layout (desktop)
- **Barra superior** fina (Deep Blue ou Snow White): título "Malha Rodoviária Federal", subtítulo "SNV 202607A · DNIT".
- **Painel lateral esquerdo** (~360 px, rolável): busca → filtros → painel de números.
- **Mapa** ocupa o resto. Fundo Snow White, UFs em cinza muito claro com borda fina cinza e siglas no centro (como a imagem de referência). Controles de zoom (+/−/"Brasil inteiro") no canto.
- **Legenda** fixa no canto inferior do mapa, explicando estilo de linha × situação e o realce de concessão.
- Abaixo de ~900 px de largura o painel vira gaveta recolhível. Basta funcionar; não precisa ser polido.

### 4.2 Estilo das linhas (marca estrita: só paleta oficial)
Categorias distinguidas por cor da paleta + espessura + tracejado:

| Situação | Estilo |
|---|---|
| Duplicada | Deep Blue `#183C80`, grossa |
| Pavimentada | Bright Blue `#0071BB`, média |
| Em obra (duplicação / pavimentação / implantação) | Bright Blue, média, tracejada |
| Implantada | Light Grey `#525254`, média, tracejada |
| Leito Natural | Light Grey, fina, tracejada |
| Planejada | Light Grey, fina, pontilhada, opacidade reduzida |
| Travessia (balsa) | Light Grey, fina, pontilhado espaçado |

**Concessão** (`ds_tipo_ad` = "Concessão Federal", e opcionalmente convênios): realce por contorno/halo Spacial Grey `#231F20` sob a linha. É palpite do designer; o builder pode ajustar se ficar poluído, desde que siga a paleta.

Espessuras escalam com o zoom. Ao passar o mouse, o trecho engrossa. Trecho selecionado/encontrado na busca: realce forte (ex.: halo Bright Blue largo) com os demais esmaecidos.

A paleta de dados é uma exceção explícita ao "nunca usar cores fora da paleta"? **Não.** Tudo acima usa só as 5 cores oficiais, com opacidade como único recurso extra.

### 4.3 Filtros
Combináveis (E entre grupos, OU dentro do grupo):
- **BR:** seleção múltipla com busca (167 valores, exibidos "BR-116").
- **UF:** seleção múltipla (27).
- **Situação:** checkboxes (9), com atalhos para grupos ("Pavimentadas", "Não pavimentadas", "Em obra", "Planejadas").
- **Superfície:** Pavimentada / Não pavimentada / Planejada.
- **Jurisdição:** 4 valores.
- **Administração:** 7 valores.
- **Tipo de trecho:** 6 valores.
- Botão "Limpar filtros" e contagem de filtros ativos.

Trechos que não passam no filtro são **ocultados** (não esmaecidos), para o mapa refletir exatamente o que o painel soma. Ao filtrar por UF/BR, o mapa pode oferecer "zoom na seleção" (botão, não automático).

### 4.4 Busca
Campo único, com sugestões enquanto digita:
- "116", "BR-116", "br 116" → a BR inteira (zoom e realce).
- Código do trecho "116BMG..." → aquele trecho.
- Texto livre → localidades em `ds_local_i`/`ds_local_f`, sem diferenciar acentos/maiúsculas ("sobradinho" encontra "SOBRADINHO"). Cada sugestão mostra BR, UF e km.
- Selecionar uma sugestão dá zoom e realce; Esc limpa.

### 4.5 Painel de números (reage aos filtros)
- **KPI principal:** km totais da seleção e número de trechos.
- **Por situação:** barras horizontais com km e % (cores/estilos iguais aos da legenda).
- **Por administração:** barras horizontais (Federal, Concessão Federal, Estadual, ...).
- **Por UF:** lista ordenada por km (top 10 + "ver todas").
- Clicar numa barra aplica aquele filtro (atalho). É um extra desejável, não obrigatório.
- Números em formato brasileiro (`12.345,6 km`).

### 4.6 Cartão de detalhe (clique no trecho)
Popup ou painel fixo com: BR-xxx/UF, código, tipo de trecho, localidade início → fim, km inicial–final, extensão, situação, superfície, jurisdição, administração, unidade local, coincidências (outras BRs e rodovia estadual). Se o trecho físico for coincidente, listar todas as BRs.

## 5. Decisões técnicas (do designer, ajustáveis pelo builder)
- **Renderização:** Leaflet 1.9.x com `preferCanvas` (ou canvas próprio), código da biblioteca **embutido** no HTML. Sem tiles. As UFs são uma camada vetorial. Alternativa aceitável: MapLibre GL com estilo local, se o builder preferir por performance, desde que o arquivo continue único e offline.
- **Fontes:** Inter embutida como woff2 base64 (subset latino). Gadugi via `font-family: 'Gadugi', 'Hind', 'Inter', sans-serif` (fonte de sistema Windows); Hind embutida como fallback se o tamanho permitir. Nada de Google Fonts em runtime.
- **Ícones:** Material Symbols Outlined, só os poucos usados, embutidos como SVG inline.
- **Design system:** tokens CSS no `:root` exatamente como a skill Galapagos especifica; grid 8 px; texto ≥ 14 px; animações 150–300 ms ease-in-out; estados hover/foco/ativo visíveis.
- **Sem tema escuro** (não pedido; a marca é baseada em Snow White).

## 6. Entregáveis
1. `index.html` (ou `mapa-rodovias.html`) autocontido, no repositório `joaocscr/rodovias`.
2. Script de build + README curto (como regenerar com um SNV novo).
3. Opcional: publicar como Artifact privado para visualização rápida (o usuário decide).

## 7. Critérios de aceite
- Abre via `file://` com rede desligada; nenhuma requisição externa (verificar no DevTools/Playwright).
- 7.673 registros carregados; soma de `vl_extensa` sem filtro e sem dedupe confere com a soma do shapefile (sanity check exibido no build).
- Filtrar "UF = PR" + "Situação = Duplicada" + "Administração = Concessão Federal" mostra só esses trechos e o painel soma exatamente seus km.
- Busca "116" realça toda a BR-116; busca "sobradinho" encontra os trechos de Sobradinho (DF).
- Acentos corretos em todo lugar.
- Checklist da marca Galapagos (seção 10 do brand guide) cumprido.

## 8. Deixado ao builder
Tolerância exata de simplificação; formato interno dos dados (GeoJSON, arrays compactos, TopoJSON); estrutura do código JS; detalhes de microinteração; ordem de desenho das camadas (sugestão: planejadas embaixo, duplicadas em cima).
