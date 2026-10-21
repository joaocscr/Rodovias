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


def _modulos(chamadas, tmp_path, falha=None, sem_bruto=None, zip_existe=True):
    """Módulo simulado por domínio: fetch/registrar/build anotam a chamada; `falha` levanta RuntimeError no build,
    `sem_bruto` levanta FileNotFoundError (bruto ausente)."""
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
        m = types.SimpleNamespace(build=build, fetch=lambda d=d: chamadas.append(f"{d}.fetch"))
        if d == "vmda2025":
            m = types.SimpleNamespace(build=build, ZIP=zip_, registrar=lambda: chamadas.append("vmda2025.registrar"))
        mods[f"intel.{d}"] = m
    return mods.__getitem__


def _roda(passos, tmp_path):
    return atualizar.executar(passos, intel_dir=tmp_path)


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


def _atualiza(tmp_path, chamadas, erros=(), build_falha=False, html=True, **kw):
    intel = tmp_path / "intel"
    intel.mkdir(exist_ok=True)
    (intel / "pipeline.json").write_text(json.dumps({"itens": [{"id": "x", "nome": "X", "verificado": False}]}),
                                         encoding="utf-8")

    def construir():
        chamadas.append("html")
        if build_falha:
            raise SystemExit("Falha: arquivo maior que 15 MB")

    def validar():
        chamadas.append("validar")
        return list(erros), (None if erros else {"entidades": []}), {"leiloes": []}

    saida = tmp_path / "atualizacao.md"
    codigo = atualizar.atualizar(["antt"], baixar=False, html=html, hoje=HOJE, intel_dir=intel, saida=saida,
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
    res = atualizar.executar(passos, intel_dir=tmp_path, baixar=True)
    assert [(r["estado"], r["detalhe"]) for r in res] == [("falhou", "arquivo ausente: data/raw/x/y.csv"), ("ok", "")]
    assert chamadas == ["trafego.fetch", "trafego.build", "antt.fetch", "antt.build"]
