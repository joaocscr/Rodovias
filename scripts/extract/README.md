# Extração do RoadShow 2026-2027 (rascunho, uso em desenvolvimento)

Os JSON de `data/roadshow/` foram gerados por estes scripts e **revisados à mão** contra as imagens das páginas do PDF. Cada número traz a página de origem em `fontes`.

- Os scripts leem o texto por página (`pdftotext -f N -l N -layout data/raw/roadshow.pdf`). Os caminhos de entrada e saída no topo de cada script apontam para o diretório temporário usado na curadoria: ajuste-os antes de rodar.
- Muitos valores (gráficos, selos, mapas) foram lidos das imagens e estão escritos diretamente nos scripts.
- Use só as páginas ímpares (PT). As pares estão em milhas e US$.
- O build (`scripts/build.py`) **não** usa estes scripts nem o PDF: lê só os JSON.

Fluxo para uma nova versão do RoadShow: gerar o texto por página → adaptar e rodar os scripts → revisar contra as imagens → `python -m pytest tests/test_roadshow.py` → `python scripts/build.py`.
