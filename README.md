# Malha Rodoviária Federal: mapa interativo

Mapa interativo dos trechos do **SNV (Sistema Nacional de Viação, DNIT)**, versão 202607A, sobre o mapa das UFs do Brasil. Feito para análise interna, no design system Galapagos.

**Abrir:** dê duplo clique em [`mapa-rodovias.html`](mapa-rodovias.html). É um arquivo único (~3,5 MB) que roda offline: dados, código, estilos e fontes estão embutidos.

## O que dá para fazer

- **Buscar** uma BR (`116`, `BR-116`), um código de trecho (`040BMG`) ou uma localidade (`sobradinho`, sem precisar de acento). O resultado é realçado e o mapa dá zoom nele.
- **Filtrar** por situação, administração (incluindo concessões), UF, BR, superfície, jurisdição e tipo de trecho. Os filtros se combinam.
- **Ver os números** da seleção: km totais, km por situação, por administração e por UF. Clicar numa barra aplica o filtro.
- **Clicar num trecho** para ver BR, UF, km inicial e final, extensão, localidades, situação, superfície, jurisdição, administração e coincidências.

### Como os km são somados

O SNV repete o mesmo trecho físico uma vez para cada BR que passa por ele: por exemplo, a BR-010, a BR-020 e a BR-030 na saída de Brasília. O mapa desenha e soma cada trecho físico **uma vez**, mesmo com várias BRs selecionadas:

| | |
|---|---|
| Registros no SNV 202607A | 7.673 |
| Trechos físicos | 6.815 |
| Soma bruta de `vl_extensa` | 131.690,7 km |
| Extensão sem dupla contagem (total exibido) | 122.394,9 km |

Registros do mesmo trecho físico são agrupados por dois critérios: os códigos citados em `ds_coinc` e a geometria idêntica.

## Regenerar com um SNV novo

1. Baixe o shapefile do SNV (site do DNIT, *Atlas e Mapas / PNV e SNV*) e extraia os arquivos `.shp/.shx/.dbf/.prj/.cpg` em `data/raw/`. A pasta `data/raw/` não vai para o git.
2. Instale as dependências: `pip install -r requirements.txt`.
3. Gere o HTML:
   ```bash
   python scripts/build.py --shp data/raw/SNV_AAAAMMX.shp --out mapa-rodovias.html
   ```
   O build mostra o número de registros, de trechos físicos, os totais em km e o tamanho do arquivo. Ele falha se os registros de um mesmo trecho coincidente tiverem atributos diferentes, ou se o arquivo passar de 15 MB.

Para atualizar os contornos das UFs (IBGE), o Leaflet ou as fontes, rode `python scripts/fetch_assets.py`. Esse passo precisa de internet; o resultado fica em `data/ufs.geojson` e `vendor/`.

## Testes

```bash
python -m pytest tests/test_snv.py   # pipeline de dados (os testes com dado real exigem data/raw/)
npm test                             # filtro, soma e busca (JS)
npm run test:e2e                     # navegador: offline, interações, desempenho (requer Playwright)
```

## Estrutura

| Caminho | Conteúdo |
|---|---|
| `scripts/snv.py` | leitura do shapefile, agrupamento dos coincidentes, simplificação e codificação |
| `scripts/build.py` | monta o HTML único |
| `scripts/fetch_assets.py` | baixa as UFs do IBGE, o Leaflet e as fontes |
| `src/` | template, CSS (tokens Galapagos) e JS (`model`, `map`, `ui`) |
| `docs/superpowers/` | design e plano de implementação |
