# Centro de Inteligência Rodoviária (v3) — Design

Data: 2026-10-20 · Base: v2 (`mapa-rodovias.html`, SNV 202607A + RoadShow v40) · Catálogo de fontes: `bases-publicas-mapa-rodovias.md` (20/10/2026, enviado pelo usuário)

## 1. Intenção

Transformar o mapa da malha federal num **centro de inteligência das rodovias e concessões do país**: tráfego e tipos de veículo, densidade de fluxos, cargas e grãos, concessões federais e estaduais com seus dados, novos projetos. O usuário pediu para começar direto, sem a rodada de perguntas. As decisões de produto abaixo são **chamadas do builder** e estão marcadas como tal.

Uso (herdado da v1/v2): análise interna, desktop, offline. Perguntas típicas que a v3 precisa responder:
- "Quanto tráfego pesado passa nesta concessão e como evoluiu?"
- "Por onde sai a soja do MT e quais trechos carregam mais grão?"
- "Quais concessões estaduais existem no MT e no SP e onde estão?"
- "O que está no pipeline (federal e estadual), com que status e data?"

## 2. Metas, não-metas, anti-metas

**Metas**
- Novos modos de cor no mapa: Tráfego (VMDa), Pesados (% e VMD), Carga agrícola (PNL), Acidentes, além dos modos da v2.
- Camadas de sobreposição: rodovias estaduais, concessões estaduais, praças de pedágio, SATs, obras ANTT, ferrovias, portos e ETCs, fundo municipal (produção agrícola e armazenagem).
- Cartão do trecho com tráfego, acidentes e carga; cartões de ponto (praça, SAT, obra, porto, município).
- Ficha da concessão federal enriquecida com ANTT: capa, tráfego das praças, receita, capex/opex realizados, obras.
- Concessões estaduais como entidades (mesmo modelo da v2, `esfera: estadual`) no comparador e no mapa.
- Pipeline unificado (federal + estadual) com status e data.
- Abas novas: **Tráfego** e **Cargas**. Aba **Fontes** com cada base, data, URL e licença.
- Ingestão reproduzível: um script por fonte, manifesto com URL, data e hash.

**Não-metas**
- Contagem PNCT por posto (portal do DNIT fora do ar em 20/10/2026).
- Estimar carregamento de grãos 2025 por roteamento próprio (fica para depois; ver §6).
- Tiles, satélite, backend, edição.

**Anti-metas (falharia mesmo funcionando)**
- Número sem fonte e data visíveis.
- Misturar estimativa modelada com contagem medida sem dizer qual é qual.
- HTML > 15 MB, qualquer requisição de rede, cores fora da paleta, filtro lento (> 200 ms).
- Quebrar o que a v2 faz (testes da v2 continuam passando).

## 3. Restrições (herdadas)

HTML único ≤ 15 MB, offline (`file://`). Só as 5 cores da marca Galapagos (`#183C80`, `#0071BB`, `#231F20`, `#525254`, `#F7F7F8`) mais opacidade. Texto ≥ 14 px, grid de 8 px. Formatos pt-BR (`R$ 7,34 bi`, `19,60%`, `734,9 km`, `12.345 veíc./dia`). Campo ausente = `—`.

## 4. Base do SNV sem o shapefile (chamada do builder)

O shapefile do SNV está no Drive (68 MB) e não passa pelo conector. O HTML v2 já embute o SNV processado (códigos, km, BR, UF, geometria simplificada, trechos físicos) e o `CONC`. A v3 congela esses dois payloads em `data/base/snv.json` e `data/base/conc.json` (versionados) e o build passa a ler deles por padrão. `--shp` continua regenerando a base quando o shapefile estiver em `data/raw/`. Todas as camadas novas se ligam ao índice de trecho físico (`fis`, 6.815 posições).

## 5. Dados

Pipeline: `scripts/fetch/<fonte>.py` baixa para `data/raw/<dominio>/` (gitignored) e registra no manifesto; `scripts/intel/<dominio>.py` processa para `data/intel/<dominio>.json` (versionado, pequeno, revisável); o build injeta `window.INTEL`. Cada bloco carrega `fonte`, `periodo`, `data_acesso` e `url`.

| Bloco | Fonte | Chave | Conteúdo embutido | Orçamento |
|---|---|---|---|---|
| `vmda` | Infra S.A. `Hosted/VMDa_2023` (estimativa modelada, SNV 202401A) | fis | `[leves, pesados]` por fis; 0 = sem dado | ~70 KB |
| `acidentes` | PRF DATATRAN 2024–2025 (ocorrências) | fis (BR+UF+km validado pela coordenada) | `[acid, mortos, fer_graves, fer_leves]` média anual por fis | ~60 KB |
| `pracas` | ANTT cadastro + volume mensal consolidado 2024–26 + receita 2025 | snap ≤ 500 m, mesma BR | ponto, entidade, VMD 2025, leves/pesados/moto, eixos médios, receita, série mensal | ~150 KB |
| `sats` | ANTT volume-sat mensal consolidado 2025 | snap ≤ 500 m | ponto, VMD, % pesados, % moto, meses | ~35 KB |
| `carga` | PNL 2035 cenário-base 2017 (carregamento modelado por link) | map-matching (link mais próximo, mediana de 3 pontos ≤ 100 m) | `TO_GSA`, `TO_TOTAL`, `V_TOTAL` por fis | ~80 KB |
| `antt` | Capas das 46 concessões; receita, investimentos, custos por ano; acompanhamento de obras | entidade (namemap) ; obras por BR+UF+km | capa por entidade, séries 2010–2025, obras como pontos | ~150 KB |
| `estaduais` | Malha estadual (Infra S.A. `Rodovias_Estaduais`, ano-base 2024) + concessões estaduais (ARTESP KMZ, AGERGS, fichas ABCR, curadoria) | geometria própria (`efis`) | linhas simplificadas + entidades estaduais | ≤ 4 MB |
| `municipios` | IBGE malha `qualidade=minima` (TopoJSON) + 3 polígonos MT 2025 | código IBGE | TopoJSON decodificado no cliente | ~1,5 MB |
| `agro` | IBGE PAM 2025 (soja, milho 1ª/2ª, cana, algodão, trigo, café) + Estoques 2º sem/2025 | código IBGE | inteiros por município | ~200 KB |
| `multimodal` | BaseFerro (em operação), ANTAQ instalações (portos, TUPs, ETCs), SIADE 2025 grãos, Comex 2025 UF×URF, fretes CONAB set/2026 | geometria / nomes | linhas, pontos, tabelas | ~450 KB |
| `pipeline` | Carteira MT v40, ANTT novos projetos/reestruturação, BNDES Hub, notícias marcadas | entidade ou BR/UF | status, data, fonte, `verificado` | ~25 KB |
| `abcr` | Índice ABCR set/2026 | — | Brasil leves/pesados/total, 120 meses | ~5 KB |

Total estimado: 3,7 MB (v2) + ~7 MB = ~10–11 MB.

Regras dos dados:
- **Modelado × medido**: VMDa e carga PNL são estimativas de modelo e aparecem com o rótulo "estimado (modelo)". Praças e SATs são contagem medida.
- **Ano de referência** visível em todo número.
- **Concessões estaduais**: só as confirmadas (catálogo §"vigentes confirmadas" + ARTESP + AGERGS). Geometria: KMZ oficial (SP), km sobre a malha estadual (demais). Qualidade do recorte como na v2 (`ok`/`aproximado`/`nao_mapeado` com nota).
- **Pipeline**: linha sem fonte oficial vai com `verificado: false` e a fonte (notícia) aparece.

## 6. Interface

**Mapa** (aba existente):
- Seletor "Cor das rodovias": Concessões (padrão) · Situação física · Tráfego · Pesados · Carga agrícola · Acidentes. Modos quantitativos: classes por quantil em espessura + tons de azul (opacidade), legenda com faixas, "sem dado" em cinza tracejado fino.
- Painel "Camadas": rodovias estaduais (e concessões estaduais em destaque), praças (círculo ∝ VMD), SATs, obras ANTT, ferrovias, portos/ETCs, fundo municipal (nenhum · soja · milho · cana · algodão · café · trigo · armazenagem).
- Cartão do trecho: blocos novos Tráfego (VMDa leves/pesados, % pesados, veíc·km/dia, praças e SATs no trecho com contagem medida), Acidentes (por ano, por km, por 10⁶ veíc·km), Carga (t/ano GSA e total, PNL).
- Cartões de ponto: praça (VMD, mix, série mensal, receita, eixos), SAT, obra (descrição, % executado), porto/ETC, município (produção, armazenagem).
- Painel de números reage aos filtros: km, veíc·km/dia, acidentes/ano, mortos/ano, t·km de carga na seleção.

**Ficha** (existente): bloco "ANTT" para entidades com capa: controladora, assinatura, prazo, edital, início da cobrança, data-base; gráfico de receita, investimento e custo realizados por ano; tráfego das praças (VMD e série); obras com % executado. Concessão estadual abre ficha própria (campos disponíveis).

**Projetos** (existente): coluna Esfera e filtro federal/estadual; linhas das estaduais; seção Pipeline com status, data e fonte.

**Tráfego** (nova): ranking de praças (VMD, % pesados), série mensal por concessão, índice ABCR (tendência e sazonalidade leves × pesados), acidentes por BR/UF.

**Cargas** (nova): produção por UF e top municípios, exportação por porto (Comex UF × URF), fluxos ferroviários de grãos (SIADE), fretes CONAB por rota, maiores trechos por carga agrícola.

**Fontes** (nova): tabela de cada base com período, data de acesso, URL, licença e o que não foi possível obter.

## 7. Decisões técnicas (do builder)

- `window.INTEL` com um bloco por domínio; JS puro testável (`intel-model.js`) para classes, agregados, junções ponto→fis, formatação.
- Modo quantitativo: quebras por quantis (5 classes) calculadas no build sobre os fis com dado.
- Pontos em `L.circleMarker` num canvas próprio; municípios em canvas próprio abaixo das rodovias.
- TopoJSON decodificado por um decoder próprio (~40 linhas), sem biblioteca.
- Estaduais com o mesmo esquema de linha codificada do SNV e simplificação mais forte.

## 8. Critérios de aceite

- Testes v2 passam; novos testes pytest para cada `scripts/intel/*` (contagens, cobertura, chaves) e `node --test` para `intel-model.js`; e2e para modos, camadas, cartões, abas novas.
- Cobertura mínima: VMDa ≥ 85% dos km pavimentados; PRF ≥ 98% das ocorrências atribuídas; praças ≥ 90% com fis; carga ≥ 95% dos km pavimentados.
- HTML ≤ 15 MB, zero requisições de rede, filtro < 200 ms.
- Manifesto de fontes e `data/intel/*.json` copiados para a pasta Rodovias do Drive.

## 9. Deixado ao builder

Layout fino das abas novas, gráficos exatos, quebras de classe, texto dos rótulos, ordem das camadas, tolerâncias de snap dentro do que os recon validaram.
