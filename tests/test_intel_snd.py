"""Cadastro de debêntures do SND (scripts/intel/snd.py): leitura da exportação em texto e download com arquivo anterior
preservado. O arquivo de teste (tests/fixtures/debentures/snd.txt) é sintético: o cabeçalho é o da exportação, as linhas
são inventadas."""
import shutil
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
from intel import snd  # noqa: E402

SND = ROOT / "tests" / "fixtures" / "debentures" / "snd.txt"


class _Manifesto:
    def __init__(self):
        self.chamadas = []

    def add(self, url, path, descricao, periodo="", licenca=""):
        self.chamadas.append((url, Path(path).name, descricao, licenca))
        return {}


def test_ler_snd_fixture():
    r = snd.ler(SND)
    assert set(r) == {"TSTR11", "TSTR21", "FERX11", "ENRG11"}       # o código vem sem os espaços do fim
    assert r["TSTR11"] == {"data_emissao": "2022-05-15", "coordenador_lider": "BANCO TESTE DE INVESTIMENTO S/A",
                           "incentivada": True, "cnpj": "11111111000111"}
    assert r["TSTR21"]["data_emissao"] == "2020-08-15" and r["TSTR21"]["incentivada"] is False
    assert r["FERX11"]["coordenador_lider"] is None                  # campo vazio no cadastro
    assert r["ENRG11"]["incentivada"] is None                        # nem S nem N


def test_gerado_em_vem_da_linha_de_aviso(tmp_path):
    assert snd.gerado_em(SND) == "2026-10-23"
    sem = tmp_path / "x.txt"
    sem.write_bytes(b"Codigo do Ativo\r\n")
    assert snd.gerado_em(sem) is None


def test_ler_snd_sem_cabecalho_e_erro(tmp_path):
    ruim = tmp_path / "x.txt"
    ruim.write_bytes(b"<html>erro</html>\r\n")
    with pytest.raises(ValueError):
        snd.ler(ruim)
    with pytest.raises(OSError):
        snd.ler(tmp_path / "nao_existe.txt")


def _falso(conteudo):
    def baixar(url, dest, tries=5, force=False):
        Path(dest).parent.mkdir(parents=True, exist_ok=True)
        Path(dest).write_bytes(conteudo)
        return Path(dest)
    return baixar


def test_fetch_baixa_valida_e_registra(monkeypatch, tmp_path):
    monkeypatch.setattr(snd, "_fetch", _falso(SND.read_bytes()))
    dest, man = tmp_path / "publico" / "snd_caracteristicas.txt", _Manifesto()
    assert snd.fetch(dest, manifesto=man) is True
    assert dest.read_bytes() == SND.read_bytes() and not list(dest.parent.glob("*.novo"))
    assert [(c[0], c[1]) for c in man.chamadas] == [(snd.URL, "snd_caracteristicas.txt")]


def test_fetch_que_falha_deixa_o_arquivo_anterior(monkeypatch, tmp_path, capsys):
    dest = tmp_path / "snd_caracteristicas.txt"
    shutil.copy(SND, dest)
    antes = dest.read_bytes()

    def falha(url, dest, tries=5, force=False):
        raise RuntimeError("429")
    monkeypatch.setattr(snd, "_fetch", falha)
    man = _Manifesto()
    assert snd.fetch(dest, manifesto=man) is False
    assert dest.read_bytes() == antes and man.chamadas == []
    assert "AVISO" in capsys.readouterr().err


def test_fetch_com_resposta_que_nao_e_o_cadastro_deixa_o_anterior(monkeypatch, tmp_path):
    dest = tmp_path / "snd_caracteristicas.txt"
    shutil.copy(SND, dest)
    monkeypatch.setattr(snd, "_fetch", _falso(b"<html>manutencao</html>"))
    man = _Manifesto()
    assert snd.fetch(dest, manifesto=man) is False
    assert dest.read_bytes() == SND.read_bytes() and man.chamadas == [] and not list(tmp_path.glob("*.novo"))
