"""O projeto não cita a empresa do autor nem versões do próprio projeto.

(a) O nome da empresa só pode aparecer em registros públicos de leilão (nomes de consórcio).
(b) No HTML gerado, o nome só pode estar nos dados embutidos (`window.CONC=`), nunca em CSS, JS ou texto da interface.
(c) O HTML não cita versões do projeto (v1 a v4, "v40"): nem em texto visível nem em comentários do código embutido.

Como a versão é procurada (c): o HTML tem URLs de APIs externas (`.../api/v3/malhas`, `.../v1/odata`) e blocos
em base64 que contêm "v1", "v3" por acaso. Antes de procurar, o teste retira (1) URLs `http(s)://...`, (2) todo segmento de
caminho `/vN` (ex.: `api/v3/malhas`, sem http), (3) o nome da API externa "API de malhas v3" (versão da API do IBGE,
citada na fonte da malha municipal) e (4) sequências longas de base64. Sobra o texto da interface, os comentários e os
textos dos dados, onde "v3" só pode ser uma versão do projeto.
"""
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HTML = ROOT / "mapa-rodovias.html"

# Registros públicos de leilão: nomes de consórcio exatamente como saem nos documentos oficiais e no RoadShow.
PERMITIDOS = (
    "data/roadshow/",
    "data/base/conc.json",
    # O HTML embute os dados acima em `window.CONC=`; a linha é verificada à parte (test_html_marca_so_nos_dados_embutidos).
    "mapa-rodovias.html",
    # O extrator guarda a linha do leilão da Rota dos Sertões como veio no RoadShow ("Consórcio 116 Sertões (...)"):
    # é o mesmo registro público dos JSON acima, em literal de dados (não é comentário nem texto de interface).
    "scripts/extract/entidades_parte_a.py",
)
MARCA = re.compile(r"galapagos|gal[áa]pagos", re.I)
VERSAO = re.compile(r"\bv(?:[1-4](?:\.\d)?|40)\b")


def _git_grep_marca():
    r = subprocess.run(["git", "grep", "-n", "-i", "-I", "-E", "galapagos|galápagos"], cwd=ROOT,
                       capture_output=True, text=True, encoding="utf-8")
    return [ln for ln in r.stdout.splitlines() if ln]


def test_marca_so_em_registros_publicos_de_leilao():
    fora = [ln[:160] for ln in _git_grep_marca()
            if ln.split(":", 1)[0] != "tests/test_sem_mencoes.py"
            and not ln.split(":", 1)[0].startswith(PERMITIDOS)]
    assert not fora, "nome da empresa fora dos registros públicos:\n" + "\n".join(fora)


def test_html_marca_so_nos_dados_embutidos():
    fora = []
    for n, ln in enumerate(HTML.read_text(encoding="utf-8").splitlines(), 1):
        if MARCA.search(ln) and not ln.startswith("window.CONC="):
            fora.append(f"linha {n}: {ln[max(0, MARCA.search(ln).start() - 60):][:140]}")
    assert not fora, "nome da empresa no CSS/JS do HTML:\n" + "\n".join(fora)


def test_html_sem_versoes_do_projeto():
    html = HTML.read_text(encoding="utf-8")
    html = re.sub(r"https?://[^\s\"'<>\\)]+", " ", html)
    html = re.sub(r"/v\d+", " ", html)
    html = html.replace("API de malhas v3", " ")
    html = re.sub(r"[A-Za-z0-9+/=]{80,}", " ", html)
    achados = [html[max(0, m.start() - 50):m.end() + 40].replace("\n", " ") for m in VERSAO.finditer(html)]
    assert not achados, f"{len(achados)} menções a versões:\n" + "\n".join(achados[:30])
