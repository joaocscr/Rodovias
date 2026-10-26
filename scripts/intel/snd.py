"""Cadastro de debêntures do SND (ANBIMA) → data de emissão, coordenador líder, incentivo fiscal e CNPJ de cada papel.

Fonte: exportação "Características das debêntures públicas" do SND, um arquivo com todas as séries registradas (o
endereço devolve tudo, qualquer que seja a consulta). É texto separado por tabulação, em latin-1, com linhas de aviso antes
do cabeçalho, que começa por `Codigo do Ativo`. As colunas usadas são `Codigo do Ativo`, `Data de Emissao`,
`Coordenador Lider`, `Deb. Incent. (Lei 12.431)` (S/N) e `CNPJ`; o casamento com as planilhas das corretoras é pelo código.

`fetch` baixa o arquivo para data/raw/debentures/publico/snd_caracteristicas.txt (fora do git); `ler` o lê. O domínio
debentures (debentures.py) chama as duas.
"""
import datetime as dt
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from intel.debentures_texto import para_data  # noqa: E402
from intel.fontes import RAW, Manifest, fetch as _fetch  # noqa: E402

URL = ("https://www.debentures.com.br/exploreosnd/consultaadados/emissoesdedebentures/"
       "caracteristicas_e.asp?tip_deb=publicas&op_exc=False")
DEST = RAW / "debentures" / "publico" / "snd_caracteristicas.txt"
LICENCA = "Consulta pública do SND (debentures.com.br, ANBIMA); a página não declara licença de reuso"
CABECALHO = "Codigo do Ativo"
COLUNAS = {"ticker": CABECALHO, "data_emissao": "Data de Emissao", "coordenador_lider": "Coordenador Lider",
           "incentivada": "Deb. Incent. (Lei 12.431)", "cnpj": "CNPJ"}


def _texto(v):
    """Texto sem os espaços do fim (o SND preenche as colunas até a largura) e com espaços repetidos reduzidos a um;
    vazio → None."""
    s = re.sub(r"\s+", " ", v or "").strip()
    return s or None


def ler(path):
    """{código: {data_emissao: "AAAA-MM-DD"|None, coordenador_lider: str|None, incentivada: bool|None, cnpj: str|None}}.
    `incentivada`: S → True, N → False, outro valor → None. O mesmo código em duas linhas vale pela primeira. Arquivo que
    não tem o cabeçalho do cadastro (a página devolveu outra coisa) é ValueError; arquivo ausente, OSError."""
    linhas = Path(path).read_bytes().decode("latin-1").splitlines()
    i = next((k for k, l in enumerate(linhas) if l.startswith(CABECALHO)), None)
    if i is None:
        raise ValueError(f"{path}: sem a linha de cabeçalho '{CABECALHO}' do cadastro do SND")
    nomes = [c.strip() for c in linhas[i].split("\t")]
    falta = [c for c in COLUNAS.values() if c not in nomes]
    if falta:
        raise ValueError(f"{path}: colunas do SND ausentes: {', '.join(falta)}")
    pos = {k: nomes.index(c) for k, c in COLUNAS.items()}
    out = {}
    for linha in linhas[i + 1:]:
        campos = linha.split("\t")
        if len(campos) <= max(pos.values()):
            continue
        ticker = _texto(campos[pos["ticker"]])
        if not ticker or ticker in out:
            continue
        flag = campos[pos["incentivada"]].strip().upper()
        out[ticker] = {"data_emissao": para_data(campos[pos["data_emissao"]]),
                       "coordenador_lider": _texto(campos[pos["coordenador_lider"]]),
                       "incentivada": True if flag == "S" else False if flag == "N" else None,
                       "cnpj": re.sub(r"\D", "", campos[pos["cnpj"]]) or None}
    return out


def gerado_em(path):
    """Dia em que o SND gerou o arquivo (AAAA-MM-DD), da linha de aviso "... Gerado em dd/mm/aaaa hh:mm:ss"; None se o
    arquivo não a traz. É a posição do cadastro, que não depende do dia em que o painel é montado."""
    with open(path, "rb") as f:
        topo = f.read(8192).decode("latin-1")
    m = re.search(r"Gerado em (\d{2}/\d{2}/\d{4})", topo)
    return para_data(m.group(1)) if m else None


def fetch(dest=DEST, manifesto=None, tentativas=5):
    """Baixa o cadastro para `dest` (sempre de novo) e o registra no manifesto de debentures (`manifesto`; sem ele, abre e
    grava o do domínio). Devolve False, com aviso, se não baixou ou se a resposta não é o cadastro: o arquivo anterior
    fica como está (o download vai para um arquivo temporário e só o substitui depois de lido)."""
    dest = Path(dest)
    novo = dest.with_name(dest.name + ".novo")
    try:
        _fetch(URL, novo, tries=tentativas, force=True)
        ler(novo)
    except (RuntimeError, OSError, ValueError) as e:
        novo.unlink(missing_ok=True)
        print(f"AVISO: cadastro do SND sem download: {e}", file=sys.stderr)
        return False
    novo.replace(dest)
    proprio = manifesto is None
    manifesto = Manifest("debentures") if proprio else manifesto
    manifesto.add(URL, dest, "ANBIMA, cadastro de debêntures (SND): características das debêntures públicas",
                  licenca=LICENCA)["baixado"] = dt.date.today().isoformat()
    if proprio:
        manifesto.save()
    return True
