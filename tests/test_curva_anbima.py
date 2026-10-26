"""Curva das NTN-B indicativas da ANBIMA (scripts/intel/curva_anbima.py): leitor do arquivo diário, cache com dias sem
arquivo, spread sobre a curva e o bloco de debêntures sem depender do dia do build. Os arquivos de teste são sintéticos
(tests/fixtures/debentures/gerar.py); nada vai à rede."""
import datetime as dt
import json
import shutil
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
from intel import curva_anbima as anb  # noqa: E402
from intel import debentures as deb  # noqa: E402
from intel import snd as snd_mod  # noqa: E402

FIX = ROOT / "tests" / "fixtures" / "debentures"
CURVAS = FIX / "publico" / anb.SUBPASTA
EMISSORES = FIX / "emissores.json"
SND = FIX / "snd.txt"
SEGUNDA = dt.date(2026, 10, 26)          # "hoje" dos testes de download: os últimos 5 dias úteis são 20 a 26/10


class _Manifesto:
    def __init__(self, items=None):
        self.items = list(items or [])

    def save(self):
        pass


def _downloads(dia="2026-10-22"):
    """Registros de download das séries públicas, como o `fetch` grava no manifesto."""
    urls = [deb.SGS.format(c, n) for c, n, _ in deb.SERIES.values()] + [deb.FOCUS_URL, snd_mod.URL]
    return [{"url": u, "acesso": dia, "baixado": dia, "sha256": u[-8:]} for u in urls]


def _arquivo(dia, ntnb=(("20300815", "6,0000"),), com_cabecalho=True, ref=None):
    """Texto do arquivo da ANBIMA do `dia` (AAAAMMDD), em bytes latin-1, no formato do site."""
    linhas = ["ANBIMA - Associação Brasileira das Entidades dos Mercados Financeiro e de Capitais", ""]
    if com_cabecalho:
        linhas.append("Titulo@Data Referencia@Codigo SELIC@Data Base/Emissao@Data Vencimento@Tx. Compra@Tx. Venda@Tx. Indicativas@PU")
    linhas += [f"NTN-B@{ref or dia}@760199@20000715@{v}@{t}@{t}@{t}@4000,0" for v, t in ntnb]
    return "\r\n".join(linhas).encode("latin-1")


class _Site:
    """Site falso: `respostas` {AAAAMMDD: (código, corpo)}; dia fora dele responde 404. Guarda os pedidos feitos."""
    def __init__(self, respostas=None):
        self.respostas, self.pedidos = dict(respostas or {}), []

    def __call__(self, endereco):
        dia = endereco.rsplit("/", 1)[-1][2:8]
        self.pedidos.append(dia)
        return self.respostas.get(dia, (404, b"<html>404 - File or directory not found.</html>"))


def _baixar(site, datas, pasta, hoje=SEGUNDA, avisos=None):
    return anb.fetch(datas, pasta, consultar=site, dormir=lambda _s: None, hoje=hoje,
                     log=(avisos.append if avisos is not None else (lambda _m: None)))


# ---------- leitura ----------

def test_ler_ms_fixture():
    texto = (CURVAS / "ms261001.txt").read_bytes().decode("latin-1")
    # 4 NTN-B em ordem de vencimento; a LTN e a NTN-F do arquivo ficam de fora; taxa = Tx. Indicativas, pt-BR
    assert anb.ler(texto) == [("2029-05-15", 5.8), ("2030-08-15", 6.0), ("2035-05-15", 6.5), ("2035-08-15", 6.55)]
    assert anb.ler(texto.replace("\r\n", "\n")) == anb.ler(texto)         # fim de linha do Windows ou do Unix
    # a taxa vem da coluna pelo nome: com Tx. Compra e Tx. Venda diferentes, vale a indicativa
    linha = "NTN-B@20261001@760199@20000715@20300815@7,0000@5,0000@6,1234@4000,0"
    cab = "Titulo@Data Referencia@Codigo SELIC@Data Base/Emissao@Data Vencimento@Tx. Compra@Tx. Venda@Tx. Indicativas@PU"
    assert anb.ler(f"{cab}\n{linha}\n") == [("2030-08-15", 6.1234)]
    assert anb.ler(f"{cab}\nLTN@20261001@100000@20230101@20270701@9,0@9,0@9,0@900,0\n") == []
    assert anb.nome("2026-10-01") == "ms261001.txt" and anb.data_do_arquivo("ms261001.txt") == "2026-10-01"
    assert anb.url("2026-10-01") == "https://www.anbima.com.br/informacoes/merc-sec/arqs/ms261001.txt"


def test_ler_recusa_o_que_nao_e_o_arquivo():
    with pytest.raises(ValueError):
        anb.ler("<html><title>404 - File or directory not found.</title></html>")
    with pytest.raises(ValueError):                                           # cabeçalho sem a taxa indicativa
        anb.ler("Titulo@Data Referencia@Data Vencimento@Tx. Compra\nNTN-B@20261001@20300815@6,0\n")


# ---------- download e dias sem arquivo ----------

def test_dia_sem_arquivo_anbima(tmp_path):
    site = _Site({"261013": (200, _arquivo("20261013"))})
    pasta = tmp_path / "ms"
    # 13/10 (terça) tem arquivo; 12/10 (feriado) responde 404; 24/10 é sábado: nem se pede
    r = _baixar(site, ["2026-10-12", "2026-10-13", "2026-10-24"], pasta)
    assert r == {"2026-10-12": False, "2026-10-13": True, "2026-10-24": False}
    assert site.pedidos == ["261012", "261013"]
    assert (pasta / "ms261013.txt").exists() and not (pasta / "ms261012.txt").exists()
    assert json.loads((pasta / "indice.json").read_text(encoding="utf-8")) == {
        "2026-10-12": anb.SEM_ARQUIVO, "2026-10-24": anb.SEM_ARQUIVO}
    # segunda rodada: nada é pedido de novo (12/10 já é "sem_arquivo" e é antigo; 13/10 está no cache)
    site.pedidos.clear()
    assert _baixar(site, ["2026-10-12", "2026-10-13"], pasta) == {"2026-10-12": False, "2026-10-13": True}
    assert site.pedidos == []
    assert anb.curvas({"2026-10-12", "2026-10-13"}, pasta) == {"2026-10-13": [("2030-08-15", 6.0)]}   # sem arquivo: fora


def test_dia_recente_sem_arquivo_e_pedido_de_novo(tmp_path):
    """Nos últimos 5 dias úteis o 404 pode ser publicação atrasada: o dia é pedido de novo, e o arquivo, quando sai, entra
    no cache e some do índice."""
    pasta = tmp_path / "ms"
    site = _Site()
    assert _baixar(site, ["2026-10-23"], pasta) == {"2026-10-23": False}
    assert _baixar(site, ["2026-10-23"], pasta) == {"2026-10-23": False}
    assert site.pedidos == ["261023", "261023"]
    site.respostas["261023"] = (200, _arquivo("20261023"))
    assert _baixar(site, ["2026-10-23"], pasta) == {"2026-10-23": True}
    assert "2026-10-23" not in json.loads((pasta / "indice.json").read_text(encoding="utf-8"))
    # dois dias depois o mesmo dia já é antigo: o 404 não é repetido
    pasta2, site2 = tmp_path / "ms2", _Site()
    _baixar(site2, ["2026-10-14"], pasta2)
    _baixar(site2, ["2026-10-14"], pasta2)
    assert site2.pedidos == ["261014"]


def test_falha_do_site_nao_vira_dia_sem_arquivo(tmp_path):
    """429 e resposta que não é o arquivo: três tentativas, nada no cache nem no índice, aviso; o dia é pedido na próxima vez."""
    pasta, avisos = tmp_path / "ms", []
    site = _Site({"261013": (429, b"muitas requisicoes"), "261014": (200, b"<html>manutencao</html>"),
                  "261015": (200, _arquivo("20261016"))})     # arquivo de outro dia
    r = _baixar(site, ["2026-10-13"], pasta, avisos=avisos)
    assert r == {"2026-10-13": False} and site.pedidos == ["261013"] * 3
    assert len(avisos) == 1 and "13/10/2026" in avisos[0] and "429" in avisos[0]
    site.pedidos.clear()
    _baixar(site, ["2026-10-14"], pasta, avisos=avisos)
    assert site.pedidos == ["261014"] * 3
    _baixar(site, ["2026-10-15"], pasta, avisos=avisos)
    assert not list(pasta.glob("ms*.txt")) and not (pasta / "indice.json").exists()
    site.respostas["261013"] = (200, _arquivo("20261013"))
    assert _baixar(site, ["2026-10-13"], pasta) == {"2026-10-13": True}


def test_site_fora_do_ar_para_depois_de_dois_dias(tmp_path):
    site = _Site({f"2610{d}": (503, b"") for d in (13, 14, 15, 16)})
    r = _baixar(site, ["2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16"], tmp_path / "ms")
    assert set(r.values()) == {False} and site.pedidos == ["261013"] * 3 + ["261014"] * 3


def test_pausa_entre_pedidos_e_tres_tentativas(tmp_path):
    esperas = []
    site = _Site({"261013": (429, b""), "261014": (200, _arquivo("20261014"))})
    anb.fetch(["2026-10-13", "2026-10-14"], tmp_path / "ms", consultar=site, dormir=esperas.append, hoje=SEGUNDA, log=lambda _m: None)
    assert esperas.count(anb.PAUSA) == 4                    # uma pausa depois de cada pedido (3 do 13/10 e 1 do 14/10)
    assert [e for e in esperas if e != anb.PAUSA] == list(anb.ESPERAS)   # e a espera maior entre as tentativas do 13/10


def test_ultimos_dias_uteis():
    assert anb.ultimos_dias_uteis(SEGUNDA, 5) == ["2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-26"]
    assert anb.ultimos_dias_uteis(dt.date(2026, 10, 25), 1) == ["2026-10-23"]      # domingo: a sexta


# ---------- spread sobre a curva ----------

def _dias(a, b):
    return (dt.date.fromisoformat(b) - dt.date.fromisoformat(a)).days


def test_spread_com_curva_anbima():
    """Dois papéis calculados à mão sobre a fixture: cada um sobre a curva do próprio dia, interpolada pelo vencimento."""
    curvas = anb.curvas(None, CURVAS)
    # 1) 7,00% com vencimento em 15/05/2032 em 01/10/2026: entre as NTN-B de 15/08/2030 (6,00) e 15/05/2035 (6,50).
    #    639 dias de 1.734 → NTN-B = 6,00 + 0,50 × 639 / 1734; spread = 7,00 − 6,18426… = 0,81574… p.p.
    assert (_dias("2030-08-15", "2032-05-15"), _dias("2030-08-15", "2035-05-15")) == (639, 1734)
    esperado1 = 7.0 - (6.0 + 0.5 * 639 / 1734)
    assert esperado1 == pytest.approx(0.81574, abs=1e-5)
    assert deb.spread(7.0, "2032-05-15", deb.curva_ntnb("2026-10-01", curvas)) == pytest.approx(esperado1)
    # 2) 6,90% com vencimento em 15/11/2033 em 02/10/2026: entre as NTN-B de 15/08/2030 (6,10) e 15/05/2035 (6,40).
    #    1.188 dias de 1.734 → NTN-B = 6,10 + 0,30 × 1188 / 1734; spread = 6,90 − 6,30554… = 0,59446… p.p.
    assert (_dias("2030-08-15", "2033-11-15"), _dias("2030-08-15", "2035-05-15")) == (1188, 1734)
    esperado2 = 6.9 - (6.1 + 0.3 * 1188 / 1734)
    assert esperado2 == pytest.approx(0.59446, abs=1e-5)
    assert deb.spread(6.9, "2033-11-15", deb.curva_ntnb("2026-10-02", curvas)) == pytest.approx(esperado2)
    # no vértice, o spread é a diferença direta; fora da curva e em dia sem arquivo, None
    assert deb.spread(6.0, "2030-08-15", deb.curva_ntnb("2026-10-01", curvas)) == pytest.approx(0.0)
    assert deb.spread(7.0, "2036-01-15", deb.curva_ntnb("2026-10-01", curvas)) is None
    assert deb.spread(7.0, "2032-05-15", deb.curva_ntnb("2026-10-05", curvas)) is None


# ---------- o bloco não depende do dia ----------

def test_bloco_nao_depende_do_dia(tmp_path):
    """A mesma pasta de curvas, builds em dias diferentes com o manifesto gravado entre eles: bloco idêntico byte a byte.
    O `acesso` da fonte é o do primeiro dia em que o arquivo foi visto; arquivo alterado leva a data do dia em que apareceu."""
    pub = tmp_path / "publico"
    shutil.copytree(FIX / "publico", pub)
    pasta = tmp_path / "entrada"
    pasta.mkdir()
    for n in ("telas.xlsx", "negocios.xlsx"):
        shutil.copy(FIX / n, pasta / n)
    man = _Manifesto(_downloads())
    a = deb.montar(pasta, pub, EMISSORES, hoje="2026-10-22", manifesto=man, snd=SND)
    b = deb.montar(pasta, pub, EMISSORES, hoje="2026-12-01", manifesto=man, snd=SND)
    assert json.dumps(a, sort_keys=True) == json.dumps(b, sort_keys=True)
    fonte = next(f for f in b["fonte"] if f["nome"].startswith("ANBIMA — Taxas indicativas"))
    assert fonte["acesso"] == "2026-10-22"
    registrados = {i["arquivo"].rsplit("/", 1)[-1]: i for i in man.items if "/anbima_ms/" in i.get("arquivo", "")}
    assert set(registrados) == {"ms261001.txt", "ms261002.txt"}
    assert all(i["acesso"] == "2026-10-22" and i["url"] == anb.url(anb.data_do_arquivo(n)) and len(i["sha256"]) == 64
               for n, i in registrados.items())
    # arquivo de um dia novo: leva a data do dia em que apareceu; os antigos ficam com a primeira
    (pub / anb.SUBPASTA / "ms261005.txt").write_bytes(_arquivo("20261005"))
    c = deb.montar(pasta, pub, EMISSORES, hoje="2026-12-01", manifesto=man, snd=SND)
    datas = {i["arquivo"].rsplit("/", 1)[-1]: i["acesso"] for i in man.items if "/anbima_ms/" in i.get("arquivo", "")}
    assert datas == {"ms261001.txt": "2026-10-22", "ms261002.txt": "2026-10-22", "ms261005.txt": "2026-12-01"}
    # 05/10 agora tem curva, mas só com um vértice (2030): o papel de 2032 fica fora dela, "—"
    assert c["pendencias"]["dias_sem_curva"] == []
    assert next(f for f in c["fonte"] if f["nome"].startswith("ANBIMA — Taxas indicativas"))["acesso"] == "2026-12-01"
    # sem registro no manifesto, a data vem dos dados (último dia com curva), nunca do relógio
    d = deb.montar(pasta, pub, EMISSORES, hoje="2027-03-01", manifesto=_Manifesto(_downloads()), snd=SND)
    e = deb.montar(pasta, pub, EMISSORES, hoje="2027-03-01", manifesto=_Manifesto(_downloads()), snd=SND)
    assert d == e


def test_registrar_mantem_o_acesso_do_mesmo_conteudo(tmp_path):
    pasta = tmp_path / "ms"
    pasta.mkdir()
    (pasta / "ms261013.txt").write_bytes(_arquivo("20261013"))
    man = _Manifesto([{"dominio": "debentures", "url": "https://x", "arquivo": "outra/coisa.csv", "acesso": "2026-01-01"}])
    anb.registrar(man, pasta, acesso="2026-10-26")
    anb.registrar(man, pasta, acesso="2026-11-30")                       # o mesmo conteúdo: a data de 26/10 fica
    (pasta / "ms261014.txt").write_bytes(_arquivo("20261014"))
    anb.registrar(man, pasta, acesso="2026-11-30")
    por_nome = {i["arquivo"].rsplit("/", 1)[-1]: i["acesso"] for i in man.items}
    assert por_nome == {"coisa.csv": "2026-01-01", "ms261013.txt": "2026-10-26", "ms261014.txt": "2026-11-30"}
    (pasta / "ms261013.txt").write_bytes(_arquivo("20261013", (("20300815", "6,1000"),)))   # conteúdo novo: data nova
    anb.registrar(man, pasta, acesso="2026-12-15")
    assert {i["arquivo"].rsplit("/", 1)[-1]: i["acesso"] for i in man.items}["ms261013.txt"] == "2026-12-15"
    (pasta / "ms261014.txt").unlink()                                    # o cache cru se perdeu: o manifesto (no git) guarda
    anb.registrar(man, pasta, acesso="2026-12-15")
    assert sorted(i["arquivo"].rsplit("/", 1)[-1] for i in man.items) == ["coisa.csv", "ms261013.txt", "ms261014.txt"]
    assert anb.acesso_dos_dias(man, {"2026-10-13"}, pasta) == "2026-12-15"
    assert anb.acesso_dos_dias(man, {"2026-10-20"}, pasta) is None


def test_historico_junta_cache_e_arquivo_e_o_cache_vale_mais(tmp_path):
    pasta, hist = tmp_path / "ms", tmp_path / "h.json"
    pasta.mkdir()
    (pasta / "ms261013.txt").write_bytes(_arquivo("20261013", (("20300815", "6,1000"),)))
    (pasta / "ms261016.txt").write_bytes(_arquivo("20261016", (("20300815", "6,3000"),)))
    anb._gravar_indice(pasta, {"2026-10-14": anb.SEM_ARQUIVO, "2026-10-17": anb.SEM_ARQUIVO, "2026-10-19": anb.SEM_ARQUIVO,
                               "2026-10-13": anb.SEM_ARQUIVO})
    g = anb.atualizar_historico(pasta, hist)
    # 14/10 sem arquivo (dia útil antes da última curva); 17/10 é sábado e 19/10 vem depois da última curva: fora; a curva de 13/10 não é apagada por um 404
    assert g == {"2026-10-13": [("2030-08-15", 6.1)], "2026-10-14": anb.SEM_ARQUIVO, "2026-10-16": [("2030-08-15", 6.3)]}
    assert anb.ler_historico(hist) == g
    linhas = hist.read_text(encoding="utf-8").splitlines()
    assert len(linhas) == 5 and linhas[1].startswith(' "2026-10-13":')            # um dia por linha
    # o cache se perde e um dia novo chega com outra taxa para o 16/10: o cache vale mais; o resto vem do arquivo
    (pasta / "ms261013.txt").unlink()
    (pasta / "ms261016.txt").write_bytes(_arquivo("20261016", (("20300815", "6,4000"),)))
    assert anb.curvas(None, pasta, hist) == {"2026-10-13": [("2030-08-15", 6.1)], "2026-10-16": [("2030-08-15", 6.4)]}
    assert anb.curvas({"2026-10-16"}, pasta, hist) == {"2026-10-16": [("2030-08-15", 6.4)]}
    assert anb.curvas(None, tmp_path / "vazia", hist) == {"2026-10-13": [("2030-08-15", 6.1)], "2026-10-16": [("2030-08-15", 6.3)]}
    assert anb.curvas(None, tmp_path / "vazia") == {}                               # sem histórico, só o cache
    assert anb.ler_historico(tmp_path / "nao_existe.json") == {}
    hist.write_text("não é json", encoding="utf-8")
    assert anb.ler_historico(hist) == {}


def test_arquivo_sem_cabecalho_ou_sem_ntnb_nao_entra_no_cache(tmp_path):
    """200 com uma página HTML, sem o cabeçalho "Titulo@Data Referencia", ou com o cabeçalho e nenhuma NTN-B."""
    cab = "Titulo@Data Referencia@Codigo SELIC@Data Base/Emissao@Data Vencimento@Tx. Compra@Tx. Venda@Tx. Indicativas\n"
    site = _Site({"261013": (200, b"<html><title>Requisicao invalida</title></html>"),
                  "261014": (200, ("sem cabecalho\nNTN-B@20261014@760199@20000715@20300815@6,0@6,0@6,0\n").encode("latin-1")),
                  "261015": (200, (cab + "LTN@20261015@100000@20230101@20270701@9,0@9,0@9,0\n").encode("latin-1"))})
    pasta = tmp_path / "ms"
    for dia in ("2026-10-13", "2026-10-14", "2026-10-15"):
        assert _baixar(site, [dia], pasta) == {dia: False}
    assert not list(pasta.glob("ms*.txt")) and not (pasta / "indice.json").exists()
