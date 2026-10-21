# Extração do RoadShow 2026-2027 (rascunho, uso em desenvolvimento)

Os JSON de `data/roadshow/` foram gerados por estes scripts e **revisados à mão** contra as imagens das páginas do PDF. Cada número traz a página de origem em `fontes`.

- Os scripts leem o texto por página (`pdftotext -f N -l N -layout data/raw/roadshow.pdf`). Os caminhos de entrada e saída no topo de cada script apontam para o diretório temporário usado na curadoria: ajuste-os antes de rodar.
- Muitos valores (gráficos, selos, mapas) foram lidos das imagens e estão escritos diretamente nos scripts.
- Use só as páginas ímpares (PT). As pares estão em milhas e US$.
- O build (`scripts/build.py`) **não** usa estes scripts nem o PDF: lê só os JSON.

Fluxo para uma nova versão do RoadShow: gerar o texto por página → adaptar e rodar os scripts → revisar contra as imagens → `python -m pytest tests/test_roadshow.py` → `python scripts/build.py`.

## Gráficos e diagramas do fechamento (`roadshow_v5.py`)

ABDIB (p. 39), debêntures incentivadas para rodovias (p. 77), estado do pavimento (p. 35) e comparativos público × privado (pp. 41 e 45) ficam em `data/roadshow/mercado.json` (`abdib`, `debentures`, `pavimento`, `comparativos`, com página em `fontes` e ressalvas em `notas`). Os textos dos dois diagramas do Regulatório (fluxo do projeto, p. 61; financiamento, pp. 73–77) ficam em `data/roadshow/regulatorio.json` (`diagramas`): o código só desenha forma e cor.

Para uma nova versão do RoadShow:

1. Coloque o PDF em `data/raw/roadshow.pdf` (fora do git) e confira se as páginas mudaram de número; se mudaram, ajuste as constantes `P_*` no topo de `roadshow_v5.py` (numeração do RoadShow: 1 = primeira página; só as ímpares, em português).
2. `python scripts/extract/roadshow_v5.py` — lê o PDF com PyMuPDF (`pip install pymupdf`) e regrava só as quatro chaves acima e as páginas em `fontes`, preservando o resto do arquivo e os campos curados (fonte original, base de preços). Nos gráficos de barras, cada rótulo numérico vai para o ano mais próximo no eixo x; na p. 39, os três rótulos de cada ano são, de cima para baixo, total, privado e público.
3. Confira o `git diff` de `data/roadshow/mercado.json` contra as imagens das páginas e revise as `notas` (abdib, debentures, pavimento, comparativos), que citam números.
4. O script também imprime os trechos com "18%" das pp. 61, 65 e 73: confira as citações em `diagramas[fluxo-projeto].redacoes` e a `nota` sobre as duas redações do limite do aporte; revise à mão os demais textos dos diagramas contra as pp. 61 e 73–77.
5. `python -m pytest tests/test_roadshow.py` — os testes conferem 3 valores de cada série e as citações contra o PDF (pulados se o PDF não estiver em `data/raw/`), que o extrator reproduz o JSON e que totais, médias anuais, múltiplos e variações impressos fecham dentro do arredondamento.
6. `python scripts/build.py`. O build pela base congelada relê `mercado.json` e `regulatorio.json` de `data/roadshow/` (`roadshow.curados`): não é preciso editar `data/base/conc.json` para atualizar esses blocos.

`mercado.py` e `regulatorio.py` (rascunhos da primeira extração) preservam essas chaves se forem rodados de novo; rode `roadshow_v5.py` depois deles.
