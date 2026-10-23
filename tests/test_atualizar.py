"""Orquestração de scripts/atualizar.py com domínios simulados: ordem, pular com aviso, falha isolada, JSON intacto,
código de saída e relatório. A execução real (sem --baixar) é conferida à mão: ver o relatório da Task 8."""
import datetime as dt
import json
import sys
import types
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import atualizar  # noqa: E402

HOJE = dt.date(2026, 10, 21)


def _modulos(chamadas, tmp_path, falha=None, sem_bruto=None, zip_existe=True, renovam=None):
    """Módulo simulado por domínio: fetch/registrar/build anotam a chamada; `falha` levanta RuntimeError no build,
    `sem_bruto` levanta FileNotFoundError (bruto ausente); `renovam`: {domínio: função chamada no fetch}."""
    renovam = renovam or {}
    zip_ = tmp_path / "vgeo_vmda2025.zip"
    if zip_existe:
        zip_.write_bytes(b"zip")
    mods = {}
    for d in atualizar.ORDEM:
        def build(d=d):
            chamadas.append(f"{d}.build")
            if d == falha:
                raise RuntimeError("quebrou")
            if d == sem_bruto:
                raise FileNotFoundError(2, "No such file or directory", str(atualizar.ROOT / "data/raw/x/y.csv"))
        def fetch(force=False, d=d):
            chamadas.append(f"{d}.fetch" + ("(force)" if force else ""))
            if d in renovam:
                renovam[d]()
        m = types.SimpleNamespace(build=build, fetch=fetch)
        if d == "vmda2025":
            m = types.SimpleNamespace(build=build, ZIP=zip_, registrar=lambda: chamadas.append("vmda2025.registrar"))
        if d == "debentures":  # com planilha na pasta de entrada
            m = types.SimpleNamespace(build=build, fetch=fetch, PASTA=tmp_path, planilhas=lambda: [tmp_path / "a.xlsx"])
        if d == "idex":  # com arquivos na pasta de entrada
            m = types.SimpleNamespace(build=build, fetch=fetch, PASTA=tmp_path,
                                      arquivos=lambda: {"datafiles": [tmp_path / "a.xlsx"], "relatorios": []})
        mods[f"intel.{d}"] = m
    return mods.__getitem__


def _roda(passos, tmp_path):
    return atualizar.executar(passos, intel_dir=tmp_path, manifest_dir=None, indices_dir=None)


def test_ordem_fixa_e_so_build_sem_baixar(tmp_path):
    chamadas = []
    passos = atualizar.passos_dominios(["rotas", "trafego", "vmda2025", "antt"], baixar=False,
                                       importar=_modulos(chamadas, tmp_path))
    assert [n for n, _ in passos] == ["trafego", "antt", "vmda2025", "rotas"]
    res = _roda(passos, tmp_path)
    assert [r["estado"] for r in res] == ["ok"] * 4
    assert chamadas == ["trafego.build", "antt.build", "vmda2025.build", "rotas.build"]


def test_baixar_chama_fetch_antes_do_build(tmp_path):
    chamadas = []
    passos = atualizar.passos_dominios(atualizar.ORDEM, baixar=True, importar=_modulos(chamadas, tmp_path))
    _roda(passos, tmp_path)
    esperado = []
    for d in atualizar.ORDEM:
        esperado += [f"{d}.{'registrar' if d == 'vmda2025' else 'fetch'}", f"{d}.build"]
    assert chamadas == esperado


def test_vmda2025_sem_zip_pula_com_aviso(tmp_path):
    chamadas = []
    passos = atualizar.passos_dominios(["vmda2025", "rotas"], baixar=True,
                                       importar=_modulos(chamadas, tmp_path, zip_existe=False))
    res = _roda(passos, tmp_path)
    assert [r["estado"] for r in res] == ["pulado", "ok"]
    assert "vgeo_vmda2025.zip" in res[0]["detalhe"]
    assert chamadas == ["rotas.fetch", "rotas.build"]


def test_debentures_sem_planilhas_pula_sem_baixar_as_series(tmp_path):
    chamadas = []
    mods = _modulos(chamadas, tmp_path)
    deb = types.SimpleNamespace(PASTA=atualizar.ROOT / "data/raw/debentures", planilhas=lambda: [],
                                fetch=lambda force=False: chamadas.append("debentures.fetch"),
                                build=lambda: chamadas.append("debentures.build"))
    importar = lambda nome: deb if nome == "intel.debentures" else mods(nome)  # noqa: E731
    passos = atualizar.passos_dominios(["debentures", "rotas"], baixar=True, importar=importar)
    res = _roda(passos, tmp_path)
    assert [r["passo"] for r in res] == ["debentures", "rotas"]
    assert [r["estado"] for r in res] == ["pulado", "ok"]
    assert "data/raw/debentures/" in res[0]["detalhe"] and "planilhas" in res[0]["detalhe"]
    assert chamadas == ["rotas.fetch", "rotas.build"]
    assert atualizar.ORDEM.index("debentures") == atualizar.ORDEM.index("pipeline") + 1


def test_bruto_ausente_pula_e_falha_nao_derruba_os_outros(tmp_path):
    chamadas = []
    passos = atualizar.passos_dominios(["trafego", "antt", "carga"], baixar=False,
                                       importar=_modulos(chamadas, tmp_path, falha="antt", sem_bruto="trafego"))
    res = _roda(passos, tmp_path)
    assert [(r["passo"], r["estado"]) for r in res] == [("trafego", "pulado"), ("antt", "falhou"), ("carga", "ok")]
    assert "data/raw/x/y.csv" in res[0]["detalhe"] and "--baixar" in res[0]["detalhe"]
    assert "quebrou" in res[1]["detalhe"]
    assert chamadas == ["trafego.build", "antt.build", "carga.build"]


def test_passo_que_falha_deixa_os_json_como_estavam(tmp_path):
    (tmp_path / "a.json").write_text('{"v": 1}', encoding="utf-8")

    def estraga():
        (tmp_path / "a.json").write_text('{"v": 2}', encoding="utf-8")
        (tmp_path / "b.json").write_text("{}", encoding="utf-8")
        raise SystemExit("Falha na verificação")

    def escreve():
        (tmp_path / "a.json").write_text('{"v": 3}', encoding="utf-8")

    res = _roda([("estraga", estraga), ("escreve", escreve)], tmp_path)
    assert [r["estado"] for r in res] == ["falhou", "ok"]
    assert "Falha na verificação" in res[0]["detalhe"]
    assert sorted(p.name for p in tmp_path.glob("*.json")) == ["a.json"]
    assert json.loads((tmp_path / "a.json").read_text(encoding="utf-8")) == {"v": 3}


def _atualiza(tmp_path, chamadas, erros=(), build_falha=False, html=True, renovar=(), dominios=("antt",),
              manifest_dir=None, log=None, **kw):
    intel = tmp_path / "intel"
    intel.mkdir(exist_ok=True)
    (intel / "pipeline.json").write_text(json.dumps({"itens": [{"id": "x", "nome": "X", "verificado": False}]}),
                                         encoding="utf-8")

    def construir():
        chamadas.append("html")
        if build_falha == "longo":
            raise SystemExit("Falha: " + "x" * 600 + " FIM")
        if build_falha == "arquivo":
            raise FileNotFoundError(2, "No such file or directory", str(atualizar.ROOT / "vendor/leaflet/leaflet.js"))
        if build_falha:
            raise SystemExit("Falha: arquivo maior que 15 MB")

    def validar():
        chamadas.append("validar")
        return list(erros), (None if erros else {"entidades": []}), {"leiloes": []}

    saida = tmp_path / "atualizacao.md"
    md_dir = manifest_dir or tmp_path / "manifest"
    md_dir.mkdir(exist_ok=True)
    codigo = atualizar.atualizar(list(dominios), baixar=False, renovar=renovar, html=html, hoje=HOJE, intel_dir=intel,
                                 saida=saida, manifest_dir=md_dir, log=log or (lambda *_: None),
                                 importar=_modulos(chamadas, tmp_path, **kw), validar=validar, construir=construir,
                                 fontes=lambda: chamadas.append("fontes_bloco"),
                                 anterior=lambda _d: {"pipeline": {"itens": []}})
    return codigo, saida.read_text(encoding="utf-8")


def test_atualizar_ordem_relatorio_e_codigo_zero(tmp_path):
    chamadas = []
    codigo, md = _atualiza(tmp_path, chamadas)
    assert codigo == 0
    assert chamadas == ["antt.build", "fontes_bloco", "validar", "html"]
    assert md.startswith("# Atualização dos dados — 21/10/2026")
    assert "| pipeline | 0 | 1 |" in md          # diff contra a versão anterior
    assert "X (x)" in md                       # curadoria: pipeline não verificado


def test_falha_de_dominio_nao_muda_o_codigo_de_saida(tmp_path):
    codigo, md = _atualiza(tmp_path, [], falha="antt")
    assert codigo == 0 and "| antt | falhou |" in md


def test_validacao_com_erro_nao_gera_html_e_sai_com_1(tmp_path):
    chamadas = []
    codigo, md = _atualiza(tmp_path, chamadas, erros=["leilão x: sem fonte"])
    assert codigo == 1 and "html" not in chamadas
    assert "leilão x: sem fonte" in md and "não foi calculada" in md


def test_build_que_falha_sai_com_1(tmp_path):
    codigo, md = _atualiza(tmp_path, [], build_falha=True)
    assert codigo == 1 and "15 MB" in md


def test_sem_html(tmp_path):
    chamadas = []
    codigo, md = _atualiza(tmp_path, chamadas, html=False)
    assert codigo == 0 and "html" not in chamadas and "--sem-html" in md


def test_dominio_desconhecido_e_erro_de_uso():
    with pytest.raises(SystemExit) as e:
        atualizar.main(["--dominios", "antt,xyz"])
    assert e.value.code == 2


def test_arquivo_ausente_do_pymupdf_tambem_pula(tmp_path):
    class FileNotFoundError(RuntimeError):  # noqa: A001 — mesma forma da exceção do PyMuPDF (rotas.py)
        pass

    def rotas():
        raise FileNotFoundError(f"no such file: '{atualizar.ROOT / 'data/raw/rotas/a.pdf'}'")

    (r,) = _roda([("rotas", rotas)], tmp_path)
    assert (r["estado"], r["detalhe"]) == ("pulado", "arquivo ausente: data/raw/rotas/a.pdf (baixe com `--baixar`)")


def test_versao_anterior_vem_do_git_e_fora_do_repositorio_da_copia(tmp_path):
    antes = atualizar.versao_anterior(atualizar.INTEL)
    assert "pipeline" in antes and "manifest" not in antes
    # fora do repositório: a cópia dos arquivos atuais
    (tmp_path / "x.json").write_text('{"itens": [1]}', encoding="utf-8")
    assert atualizar.versao_anterior(tmp_path) == {"x": {"itens": [1]}}


def test_com_baixar_arquivo_ainda_ausente_e_falha(tmp_path):
    chamadas = []
    passos = atualizar.passos_dominios(["trafego", "antt"], baixar=True,
                                       importar=_modulos(chamadas, tmp_path, sem_bruto="trafego"))
    res = atualizar.executar(passos, intel_dir=tmp_path, baixar=True, manifest_dir=None)
    assert [(r["estado"], r["detalhe"]) for r in res] == [("falhou", "arquivo ausente: data/raw/x/y.csv"), ("ok", "")]
    assert chamadas == ["trafego.fetch", "trafego.build", "antt.fetch", "antt.build"]



def test_renovar_baixa_de_novo_so_os_dominios_pedidos(tmp_path):
    chamadas = []
    passos = atualizar.passos_dominios(["antt", "agro", "vmda2025"], baixar=False, renovar={"antt"},
                                       importar=_modulos(chamadas, tmp_path))
    atualizar.executar(passos, intel_dir=tmp_path, manifest_dir=None)
    assert chamadas == ["antt.fetch(force)", "antt.build", "agro.build", "vmda2025.build"]


def test_renovar_sem_mudanca_vai_para_o_relatorio(tmp_path):
    md_dir = tmp_path / "manifest"
    md_dir.mkdir()
    for d, sha in (("antt", "a1"), ("agro", "g1")):
        (md_dir / f"{d}.json").write_text(json.dumps([{"arquivo": f"data/raw/{d}/x", "sha256": sha}]), encoding="utf-8")

    def agro_mudou():  # a fonte do agro publicou arquivo novo; a da ANTT devolveu o mesmo conteúdo
        (md_dir / "agro.json").write_text(json.dumps([{"arquivo": "data/raw/agro/x", "sha256": "g2"}]), encoding="utf-8")

    chamadas = []
    codigo, md = _atualiza(tmp_path, chamadas, renovar={"antt", "agro"}, dominios=("antt", "agro"), manifest_dir=md_dir,
                           renovam={"agro": agro_mudou})
    assert codigo == 0
    assert chamadas[:4] == ["antt.fetch(force)", "antt.build", "agro.fetch(force)", "agro.build"]
    assert "## Fontes renovadas sem dado novo" in md
    secao = md.split("## Fontes renovadas sem dado novo")[1].split("##")[0]
    assert "- antt" in secao and "agro" not in secao
    assert "| antt | ok | renovado: nenhum arquivo mudou" in md


def test_passo_que_falha_restaura_tambem_o_manifesto(tmp_path):
    intel, md_dir = tmp_path / "intel", tmp_path / "manifest"
    intel.mkdir()
    md_dir.mkdir()
    (md_dir / "antt.json").write_text("[1]", encoding="utf-8")

    def estraga():
        (md_dir / "antt.json").write_text("[2]", encoding="utf-8")
        raise RuntimeError("build quebrou depois do download")

    (r,) = atualizar.executar([("antt", estraga)], intel_dir=intel, manifest_dir=md_dir)
    assert r["estado"] == "falhou" and (md_dir / "antt.json").read_text(encoding="utf-8") == "[1]"


def test_passo_que_falha_restaura_tambem_os_historicos_de_indices(tmp_path):
    intel, hist = tmp_path / "intel", tmp_path / "indices"
    intel.mkdir()
    hist.mkdir()
    (hist / "ida_historico.json").write_text("[1]", encoding="utf-8")

    def estraga():
        (hist / "ida_historico.json").write_text("[2]", encoding="utf-8")
        (hist / "novo.json").write_text("{}", encoding="utf-8")
        raise RuntimeError("build quebrou depois de gravar o histórico")

    def grava():
        (hist / "ida_historico.json").write_text("[3]", encoding="utf-8")

    res = atualizar.executar([("ida", estraga), ("idex", grava)], intel_dir=intel, manifest_dir=None, indices_dir=hist)
    assert [r["estado"] for r in res] == ["falhou", "ok"]
    assert sorted(p.name for p in hist.glob("*.json")) == ["ida_historico.json"]
    assert (hist / "ida_historico.json").read_text(encoding="utf-8") == "[3]"
    # só o passo que falhou é desfeito
    (r,) = atualizar.executar([("ida", estraga)], intel_dir=intel, manifest_dir=None, indices_dir=hist)
    assert r["estado"] == "falhou" and (hist / "ida_historico.json").read_text(encoding="utf-8") == "[3]"


def test_html_que_falha_por_arquivo_ausente_nao_e_pulado(tmp_path):
    linhas = []
    codigo, md = _atualiza(tmp_path, [], build_falha="arquivo", log=linhas.append)
    assert codigo == 1
    assert "| build.py (HTML) | falhou | o HTML não foi gerado: arquivo ausente: vendor/leaflet/leaflet.js |" in md
    html = [x for x in linhas if "build.py (HTML)" in x or "HTML não foi gerado" in x]
    assert html and not any("pulado" in x or "--baixar" in x for x in html), html
    assert any(x.startswith("ERRO: o HTML não foi gerado: arquivo ausente: vendor/leaflet/leaflet.js") for x in linhas)


@pytest.mark.parametrize("args", [["--renovar", "vmda2025"], ["--dominios", "antt", "--renovar", "agro"],
                                  ["--renovar", "xyz"]])
def test_renovar_invalido_e_erro_de_uso(args):
    with pytest.raises(SystemExit) as e:
        atualizar.main(args)
    assert e.value.code == 2



def test_erro_do_html_sai_inteiro_no_log_e_encurtado_no_relatorio(tmp_path):
    linhas = []
    codigo, md = _atualiza(tmp_path, [], build_falha="longo", log=linhas.append)
    assert codigo == 1
    erro = next(x for x in linhas if x.startswith("ERRO: "))
    assert erro.endswith(" FIM") and len(erro) > 600
    celula = next(x for x in md.splitlines() if x.startswith("| build.py (HTML) | falhou |"))
    assert " FIM" not in celula and "…" in celula


def _renova(tmp_path, build_falha):
    """--renovar antt com fakes: o bruto listado no manifesto é baixado de novo (conteúdo novo) e o build passa ou
    falha. Devolve (resultado do passo, pasta de brutos, pasta do manifesto)."""
    md_dir, raw = tmp_path / "manifest", tmp_path / "data" / "raw" / "antt"
    md_dir.mkdir()
    raw.mkdir(parents=True)
    (raw / "x.csv").write_text("velho", encoding="utf-8")
    (md_dir / "antt.json").write_text(json.dumps([{"arquivo": "data/raw/antt/x.csv", "sha256": "v"}]), encoding="utf-8")

    def baixa_de_novo():  # a fonte devolve 200 com página de erro: o fetch troca o bruto e o manifesto
        (raw / "x.csv").write_text("<html>erro</html>", encoding="utf-8")
        (md_dir / "antt.json").write_text(json.dumps([{"arquivo": "data/raw/antt/x.csv", "sha256": "n"}]),
                                          encoding="utf-8")

    chamadas = []
    passos = atualizar.passos_dominios(["antt"], baixar=False, renovar={"antt"}, manifest_dir=md_dir, raiz=tmp_path,
                                       importar=_modulos(chamadas, tmp_path, falha="antt" if build_falha else None,
                                                         renovam={"antt": baixa_de_novo}))
    (r,) = atualizar.executar(passos, intel_dir=tmp_path / "intel", baixar={"antt"}, manifest_dir=md_dir)
    return r, raw, md_dir


def test_renovar_com_build_que_falha_devolve_o_bruto_anterior(tmp_path):
    r, raw, md_dir = _renova(tmp_path, build_falha=True)
    assert r["estado"] == "falhou"
    assert (raw / "x.csv").read_text(encoding="utf-8") == "velho"
    assert json.loads((md_dir / "antt.json").read_text(encoding="utf-8"))[0]["sha256"] == "v"
    assert sorted(p.name for p in raw.iterdir()) == ["x.csv"]
    assert "quebrou" in r["detalhe"] and "bruto anterior restaurado: data/raw/antt/x.csv" in r["detalhe"], r["detalhe"]


def test_renovar_com_build_ok_fica_com_o_bruto_novo(tmp_path):
    r, raw, md_dir = _renova(tmp_path, build_falha=False)
    assert r["estado"] == "ok"
    assert (raw / "x.csv").read_text(encoding="utf-8") == "<html>erro</html>"
    assert sorted(p.name for p in raw.iterdir()) == ["x.csv"]  # a cópia .anterior some depois do build
