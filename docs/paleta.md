# Paleta de dados (v3.1)

Spec: `docs/superpowers/specs/2026-10-20-v3.1-rotas-paleta-vmda2025-design.md` §4. Tokens em `src/styles-map.js`; validador em `scripts/validate_palette.js` (cópia sem alteração do validador do método dataviz; `scripts/package.json` marca a pasta como ES module para o Node rodar o arquivo como está). O teste `tests/palette.test.mjs` (no `npm test`) roda as mesmas validações como funções.

## Regras

- **Interface Galapagos.** Fundo, texto, botões, painéis, malha federal base (modos Concessões e Situação física), praças de pedágio, fundo municipal e realce de seleção continuam com `COLORS` (`#183C80`, `#0071BB`, `#231F20`, `#525254`, `#F7F7F8`).
- **Cores de dado só dos tokens** `DATA`, `ROTAS`, `RAMPS`, `ROTAS_EXTRA` e `PIPE_STATUS` de `src/styles-map.js` (lista completa em `DATA_TOKENS`). O e2e confere que as linhas do mapa em cada modo e as feições de cada camada ligada só usam esses tokens (`MapView.lineColors()`, `Layers.colorsUsed()`).
- **Cor fixa por entidade**, nunca por posição. Toda cor de dado tem legenda ou rótulo; o texto fica na cor de texto, nunca na cor da série.
- **Superfície de validação:** fundo do mapa `#F7F7F8` (`--surface "#F7F7F8"`, modo claro; o app não tem tema escuro).
- Contraste abaixo de 3:1 (WARN "relief") é aceito porque toda cor tem legenda no painel ou na legenda do mapa; amarelo, magenta, verde-água e laranja ficam nesse caso.

## Slots categóricos (`DATA`)

Ordem validada do método (adjacente), sem troca de hex.

| Slot | Nome | Hex |
|---|---|---|
| 1 | azul | `#2a78d6` |
| 2 | laranja | `#eb6834` |
| 3 | verde-água | `#1baf7a` |
| 4 | amarelo | `#eda100` |
| 5 | magenta | `#e87ba4` |
| 6 | verde | `#008300` |
| 7 | violeta | `#6250d6` |
| 8 | vermelho | `#e34948` |

## Rotas de Integração (`ROTAS`)

| Rota | Nome | Slot | Hex |
|---|---|---|---|
| 1 | Ilha das Guianas | amarelo | `#eda100` |
| 2 | Amazônica | violeta | `#6250d6` |
| 3 | Quadrante Rondon | verde | `#008300` |
| 4 | Bioceânica de Capricórnio | vermelho | `#e34948` |
| 5 | Bioceânica do Sul | verde-água | `#1baf7a` |

All-pairs: o pior par sob CVD (verde-água × vermelho, ΔE 6,9) fica na faixa WARN 6–8, aceita com rótulo direto "Rota N · Nome" sobre cada linha e traço.

Cada rota é uma linha de 3 px na sua cor sobre um contorno Snow White `#F7F7F8` (+3 px, opacidade 0,9) que a separa da malha federal embaixo (`ROTA_LINHA`). O rótulo direto "Rota N · Nome" fica na ponta da rota que dá para fora do traçado (Rota 1 ao norte, Rotas 2 a 4 a oeste, Rota 5 ao sul), com o texto em Spacial Grey `#231F20` sobre Snow White e uma amostra de 16 × 4 px na cor da rota; o rótulo abre o cartão da rota. Rota selecionada: a própria cor, 5 px, sobre halo Snow White.

Elementos da camada de rotas além das 5 linhas (`ROTAS_EXTRA`), desenhados por cima das rotas (no mapa do MPO o trecho fluvial também tem a linha da rota) e todos com rótulo na legenda da camada:

| Elemento | Cor | Traço |
|---|---|---|
| Hidrovia | slot azul `#2a78d6` | 2,5 px, traço-ponto `12 4 2 4` |
| Cabotagem | slot azul `#2a78d6` | 2 px, pontilhado `1 5` (pontas redondas) |
| Trecho em pavimentação | marrom = passo 4 da rampa laranja `#8a2e00` | 2,5 px, contínuo |
| Trecho em estudos | cinza Galapagos `#525254` | 2 px, tracejado `4 4` |

A hidrovia não repete o estilo "Em obra" da malha federal (Bright Blue `#0071BB`, 2,5 px, tracejado `6 4`): as duas são azuis (ΔE normal 4,9 entre o slot azul e o Bright Blue), então o que as distingue é o traço — traço-ponto na hidrovia, tracejado simples na obra — e o rótulo "Hidrovia" na legenda da camada.

Países vizinhos (`ROTAS_PAIS`): preenchimento Snow White `#F7F7F8` e borda Light Grey `#525254` (1 px, opacidade 0,6), cores da interface, com o nome do país (ou a sigla ISO quando o país tem menos de 5° de largura: Guiana, Suriname, Guiana Francesa) em Light Grey.

## Rampas dos modos quantitativos (`RAMPS`)

Cinco passos claro → escuro, um tom por modo; cor sólida por classe (opacidade 1) e espessura 1,5 → 6 px como antes. "Sem dado" continua em cinza `#525254` tracejado. As quatro rampas usam a mesma escada de luminosidade OKLCH (L 0,717 · 0,622 · 0,527 · 0,433 · 0,338), então uma classe tem o mesmo peso visual em qualquer modo.

- **Tráfego (azul):** passos 300/400/500/600/700 da rampa azul documentada do método. O passo 250 (`#86b6ef`) dá 1,97:1 sobre `#F7F7F8` (abaixo do piso de 2:1), por isso a rampa começa no 300.
- **Pesados (violeta), Carga agrícola (laranja), Acidentes (vermelho):** mesmo matiz OKLCH do slot categórico (violeta 283,4°, laranja 40,6°, vermelho 24,9°), L da escada acima e croma do slot, reduzido só quando sai do gama sRGB. Onde o slot cai na escada ele é o próprio passo: `#6250d6` é o passo 3 do violeta e `#e34948` é o passo 2 do vermelho. O laranja `#eb6834` (L 0,671) fica entre dois passos e não entra.

| Modo | 1 (claro) | 2 | 3 | 4 | 5 (escuro) |
|---|---|---|---|---|---|
| Tráfego | `#6da7ec` | `#3987e5` | `#256abf` | `#184f95` | `#0d366b` |
| Pesados | `#9895ff` | `#7c6ef7` | `#6250d6` | `#4a30b6` | `#360396` |
| Carga agrícola | `#fb7744` | `#da5821` | `#b43f00` | `#8a2e00` | `#621e00` |
| Acidentes | `#ff6f69` | `#e34948` | `#c1252c` | `#9a0016` | `#6e000c` |

## Camadas (atribuição fixa)

| Camada | Cor | Hex | Marca |
|---|---|---|---|
| Concessões estaduais | magenta (slot 5) | `#e87ba4` | 3 px com halo Spacial Grey `#231F20` 35 % (+3 px) |
| Malha estadual | verde (slot 6) | `#008300` | 1 px, opacidade 0,6 |
| Ferrovias em operação | amarelo (slot 4) | `#eda100` | 2 px tracejado `6 3` |
| Fluxos ferroviários de grãos (SIADE) | vermelho (slot 8) | `#e34948` | origem → destino, 1–8 px ∝ t, opacidade 0,8 |
| Portos e ETCs | violeta (slot 7) | `#6250d6` | quadrado (organizado/público) ou círculo (TUP/ETC), borda `#F7F7F8` |
| Obras ANTT | laranja (slot 2) | `#eb6834` | ponto 3 px, opacidade 0,9 |
| SATs | verde-água (slot 3) | `#1baf7a` | círculo vazado, traço 2 px |
| Praças de pedágio | Bright Blue (Galapagos) | `#0071BB` | círculo ∝ √VMD, borda `#F7F7F8` (sem mudança) |
| Fundo municipal | Deep Blue (Galapagos) | `#183C80` | opacidade por classe (sem mudança) |

O slot 1 (azul) fica fora das camadas: é quase igual ao Bright Blue da malha federal (ΔE normal 4,9) e vai para hidrovias e cabotagem na camada de rotas.

**Como a atribuição foi escolhida.** Busca exaustiva das 8 cores nas 7 camadas (`8!/1!` = 40.320 atribuições). O critério é maximizar o pior par entre os que aparecem juntos no mapa, medido como min(ΔE normal / 15, ΔE CVD / 8) com as funções do validador. Pares prioritários: malha × concessões estaduais; concessões estaduais × federais (`#0071BB`, `#183C80`); ferrovias × SIADE × portos; portos × obras × SATs; ferrovias × malha; concessões estaduais × ferrovias. Na atribuição escolhida, todos esses pares passam os dois pisos (normal ≥ 15 e CVD ≥ 8). Pares secundários que ficam abaixo do piso, cada um com codificação secundária:

- Portos (violeta) × malha federal e praças (Bright Blue): ΔE normal 11,6, CVD 4,9. Quadrado ou círculo com borda clara contra linha ou círculo proporcional.
- Concessões estaduais (magenta) × SIADE (vermelho): ΔE 13,2 normal e 12,3 CVD. Halo escuro e traçado na rodovia contra reta origem → destino.
- Malha estadual (verde) × SIADE (vermelho): CVD 7,2. Linha fina contra reta larga.
- Obras (laranja) × SIADE (vermelho): ΔE 7,1 normal. Ponto contra linha.

**Limite conhecido.** Uma camada pode coincidir com a rampa do modo ativo: obras em laranja no modo Carga agrícola, portos em violeta no modo Pesados, SIADE em vermelho no modo Acidentes. Com 8 matizes, 4 rampas e 7 camadas, alguma coincidência é inevitável. As quatro camadas de linha (estaduais, concessões estaduais, ferrovias, SIADE) usam matizes fora das rampas dos modos sempre que possível; as de ponto distinguem-se pela forma.

## Status do pipeline (`PIPE_STATUS`)

Cada chip de status da seção Pipeline (aba Projetos) ganha um ponto colorido antes do texto. As etapas seguem uma rampa ordinal verde-água de 7 passos: quanto mais avançada a etapa, mais escuro o ponto. Suspenso e cancelado usam as cores de status fixas do método (alerta e crítico), que não reaproveitam slots categóricos. O CSS é gerado dos tokens (`dataTokenCss()`, injetado por `UI.init`). O texto do status continua no chip e na tabela.

| Status | Hex |
|---|---|
| Em estudo | `#35be88` |
| Consulta pública | `#0eaa75` |
| No TCU/TCE | `#009565` |
| Edital publicado | `#007f56` |
| Leilão agendado | `#006a47` |
| Leiloado | `#005639` |
| Contrato assinado | `#00432b` |
| Suspenso | `#fab219` (status alerta) |
| Cancelado/deserto | `#d03b3b` (status crítico) |

## Saídas do validador

Todas com `--surface "#F7F7F8"`; a linha final "scope" do modo categórico foi omitida.

### DATA (adjacente)

```
$ node scripts/validate_palette.js "#2a78d6,#eb6834,#1baf7a,#eda100,#e87ba4,#008300,#6250d6,#e34948" --mode light --surface "#F7F7F8"
Palette (light, surface #F7F7F8, categorical): 8 slots
  [PASS] Lightness band         all 8 inside L 0.43–0.77
  [PASS] Chroma floor           all 8 >= 0.1
  [PASS] CVD separation         worst adjacent #eda100↔#1baf7a ΔE 9.1 (protan) · tritan 5.8
  [PASS] Normal-vision floor    worst adjacent #e87ba4↔#eda100 ΔE 19.6 (normal)
  [WARN] Contrast vs surface    below 3:1 — relief required (visible labels or table view): [["#eb6834",2.99],["#1baf7a",2.63],["#eda100",2.02],["#e87ba4",2.51]]
  → ALL CHECKS PASS  (CVD in the 6–8 floor band is legal ONLY with secondary encoding: direct labels, gaps, or texture)
(exit 0)
```

### ROTAS (all-pairs)

```
$ node scripts/validate_palette.js "#eda100,#6250d6,#008300,#e34948,#1baf7a" --pairs all --surface "#F7F7F8"
Palette (light, surface #F7F7F8, categorical): 5 slots
  [PASS] Lightness band         all 5 inside L 0.43–0.77
  [PASS] Chroma floor           all 5 >= 0.1
  [WARN] CVD separation         worst all-pairs #1baf7a↔#e34948 ΔE 6.9 (deutan) · tritan 7.6
  [PASS] Normal-vision floor    worst all-pairs #1baf7a↔#008300 ΔE 15.6 (normal)
  [WARN] Contrast vs surface    below 3:1 — relief required (visible labels or table view): [["#eda100",2.02],["#1baf7a",2.63]]
  → ALL CHECKS PASS  (CVD in the 6–8 floor band is legal ONLY with secondary encoding: direct labels, gaps, or texture)
(exit 0)
```

### Rampas (ordinal)

```
$ node scripts/validate_palette.js "#6da7ec,#3987e5,#256abf,#184f95,#0d366b" --ordinal --surface "#F7F7F8"
Palette (light, surface #F7F7F8, ordinal ramp): 5 slots
  [PASS] Lightness monotone     steps read light→dark
  [PASS] Adjacent ΔL            all gaps >= 0.06
  [PASS] Light-end contrast     #6da7ec at 2.34:1 vs surface
  [PASS] Single hue             hue spread 3°
  → ALL CHECKS PASS  (ordinal: one hue, monotone L, visible step gaps, light end clears surface)
(exit 0)

$ node scripts/validate_palette.js "#9895ff,#7c6ef7,#6250d6,#4a30b6,#360396" --ordinal --surface "#F7F7F8"
Palette (light, surface #F7F7F8, ordinal ramp): 5 slots
  [PASS] Lightness monotone     steps read light→dark
  [PASS] Adjacent ΔL            all gaps >= 0.06
  [PASS] Light-end contrast     #9895ff at 2.43:1 vs surface
  [PASS] Single hue             hue spread 1°
  → ALL CHECKS PASS  (ordinal: one hue, monotone L, visible step gaps, light end clears surface)
(exit 0)

$ node scripts/validate_palette.js "#fb7744,#da5821,#b43f00,#8a2e00,#621e00" --ordinal --surface "#F7F7F8"
Palette (light, surface #F7F7F8, ordinal ramp): 5 slots
  [PASS] Lightness monotone     steps read light→dark
  [PASS] Adjacent ΔL            all gaps >= 0.06
  [PASS] Light-end contrast     #fb7744 at 2.51:1 vs surface
  [PASS] Single hue             hue spread 0°
  → ALL CHECKS PASS  (ordinal: one hue, monotone L, visible step gaps, light end clears surface)
(exit 0)

$ node scripts/validate_palette.js "#ff6f69,#e34948,#c1252c,#9a0016,#6e000c" --ordinal --surface "#F7F7F8"
Palette (light, surface #F7F7F8, ordinal ramp): 5 slots
  [PASS] Lightness monotone     steps read light→dark
  [PASS] Adjacent ΔL            all gaps >= 0.06
  [PASS] Light-end contrast     #ff6f69 at 2.54:1 vs surface
  [PASS] Single hue             hue spread 0°
  → ALL CHECKS PASS  (ordinal: one hue, monotone L, visible step gaps, light end clears surface)
(exit 0)

$ node scripts/validate_palette.js "#35be88,#0eaa75,#009565,#007f56,#006a47,#005639,#00432b" --ordinal --surface "#F7F7F8"
Palette (light, surface #F7F7F8, ordinal ramp): 7 slots
  [PASS] Lightness monotone     steps read light→dark
  [PASS] Adjacent ΔL            all gaps >= 0.06
  [PASS] Light-end contrast     #35be88 at 2.21:1 vs surface
  [PASS] Single hue             hue spread 0°
  → ALL CHECKS PASS  (ordinal: one hue, monotone L, visible step gaps, light end clears surface)
(exit 0)
```

### Camadas que aparecem juntas (all-pairs)

```
$ node scripts/validate_palette.js "#008300,#e87ba4" --pairs all --surface "#F7F7F8"      # malha × concessões estaduais
Palette (light, surface #F7F7F8, categorical): 2 slots
  [PASS] Lightness band         all 2 inside L 0.43–0.77
  [PASS] Chroma floor           all 2 >= 0.1
  [PASS] CVD separation         worst all-pairs #e87ba4↔#008300 ΔE 17.6 (protan) · tritan 31.7
  [PASS] Normal-vision floor    worst all-pairs #e87ba4↔#008300 ΔE 35.9 (normal)
  [WARN] Contrast vs surface    below 3:1 — relief required (visible labels or table view): [["#e87ba4",2.51]]
  → ALL CHECKS PASS
(exit 0)

$ node scripts/validate_palette.js "#eda100,#e34948,#6250d6" --pairs all --surface "#F7F7F8"   # ferrovias × SIADE × portos
Palette (light, surface #F7F7F8, categorical): 3 slots
  [PASS] Lightness band         all 3 inside L 0.43–0.77
  [PASS] Chroma floor           all 3 >= 0.1
  [PASS] CVD separation         worst all-pairs #e34948↔#eda100 ΔE 15.3 (deutan) · tritan 17.1
  [PASS] Normal-vision floor    worst all-pairs #e34948↔#eda100 ΔE 20.8 (normal)
  [WARN] Contrast vs surface    below 3:1 — relief required (visible labels or table view): [["#eda100",2.02]]
  → ALL CHECKS PASS
(exit 0)

$ node scripts/validate_palette.js "#6250d6,#eb6834,#1baf7a" --pairs all --surface "#F7F7F8"   # portos × obras × SATs
Palette (light, surface #F7F7F8, categorical): 3 slots
  [PASS] Lightness band         all 3 inside L 0.43–0.77
  [PASS] Chroma floor           all 3 >= 0.1
  [PASS] CVD separation         worst all-pairs #1baf7a↔#eb6834 ΔE 9.2 (deutan) · tritan 18.0
  [PASS] Normal-vision floor    worst all-pairs #1baf7a↔#eb6834 ΔE 27.6 (normal)
  [WARN] Contrast vs surface    below 3:1 — relief required (visible labels or table view): [["#eb6834",2.99],["#1baf7a",2.63]]
  → ALL CHECKS PASS
(exit 0)
```

As 7 cores de camada juntas em all-pairs **não** passam. É o limite de séries do método: com 8 matizes, nenhum conjunto de mais de 3 passa all-pairs. Por isso a validação é feita por grupo de camadas que aparecem juntas, e não com as 7 de uma vez.

```
$ node scripts/validate_palette.js "#008300,#e87ba4,#eda100,#e34948,#6250d6,#eb6834,#1baf7a" --pairs all --surface "#F7F7F8"
  [FAIL] CVD separation         worst all-pairs #eb6834↔#008300 ΔE 3.2 (protan) · tritan 5.1
  [FAIL] Normal-vision floor    worst all-pairs #eb6834↔#e34948 ΔE 7.1 (normal) — below 15, hard to tell apart even with full color vision
(exit 1)
```
