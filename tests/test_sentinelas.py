"""Sentinelas da atualização (scripts/sentinelas.py): insumos do usuário, edições novas das fontes e branches sem merge.
A rede é simulada: nenhum teste depende da internet."""
import datetime as dt
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import sentinelas as S  # noqa: E402

HOJE = dt.date(2026, 11, 17)
INTEL = {
    "debentures": {"fonte": [
        {"nome": "BTG — tela", "periodo": "tela de 16/11/2026; negócios de 01/10/2026 a 12/11/2026"},
        {"nome": "XP — tela", "periodo": "tela de 16/11/2026; intenções de 01/10/2026 a 13/11/2026"},
        {"nome": "ANBIMA — curva", "periodo": "14/10/2026 a 16/11/2026"}]},
    "idex": {"fonte": [{"nome": "IDEX", "periodo": "planilha de dados: 19/10/2026 a 16/11/2026 (série acumulada desde "
                                                   "22/09/2026); relatório mensal: 01/2024 a 10/2026"}]},
    "fontes": {"base": [{"bloco": "snv", "nome": "SNV 202607A", "periodo": "versão 202607A (jul/2026)"}]},
}
CODIGO = {"antt_ultimo_mes": "2026-08", "antt_ano": 2025, "prf_ano": 2025, "siade_ano": 2025, "comex_ano": 2025,
          "pam_ano": 2025, "vmda_ano": 2025, "roadshow_versao": 40, "rotas_data": "2026-07-01"}


def test_insumos_do_usuario_dizem_ate_quando_ha_dado():
    its = S.insumos_do_usuario(INTEL, HOJE)
    deb, idex = its
    assert deb["grupo"] == idex["grupo"] == "usuario"
    assert "tela de 16/11/2026" in deb["situacao"] and "até 13/11/2026 (4 dias atrás)" in deb["situacao"]
    assert "desatualizado" not in deb["situacao"] and "desde 13/11/2026" in deb["acao"]
    assert "até 16/11/2026" in idex["situacao"] and "relatório mensal até 10/2026" in idex["situacao"]
    velho = S.insumos_do_usuario(INTEL, dt.date(2026, 12, 20))[0]
    assert "desatualizado" in velho["situacao"]


def test_snv_so_pede_conferencia_depois_de_seis_meses():
    assert S.snv_para_conferir(INTEL, HOJE) == []                    # 202607A em nov/2026: 4 meses
    (it,) = S.snv_para_conferir(INTEL, dt.date(2027, 2, 1))
    assert it["grupo"] == "usuario" and "202607A" in it["situacao"]


def test_antt_com_mes_novo_no_arquivo(tmp_path):
    d = tmp_path / "volume-trafego-praca-pedagio"
    d.mkdir()
    (d / "v_2026.csv").write_text('concessionaria;mes_ano;volume\n"X";"08/2026";1\n"X";"10/2026";2\n', encoding="latin1")
    (it,) = S.antt_meses(tmp_path, "2026-08")
    assert it["grupo"] == "novidade" and "2026-10" in it["situacao"]
    assert S.antt_meses(tmp_path, "2026-10") == []


def test_ano_fechado_so_depois_que_o_ano_seguinte_termina():
    assert S.anos_fechados(HOJE, [("PRF", 2025, "ANOS")]) == []        # 2026 ainda corre
    (it,) = S.anos_fechados(dt.date(2027, 3, 1), [("PRF", 2025, "ANOS")])
    assert "2026 já fechou" in it["situacao"]


def test_checagens_de_rede_com_respostas_simuladas():
    respostas = {
        S.INFRASA + "?f=json": json.dumps({"services": [{"name": "Hosted/ONTL_Rodoviario_VMDa_Modelagem_2025"},
                                                        {"name": "Hosted/ONTL_Rodoviario_VMDa_Modelagem_2026"}]}),
        S.SNV_INFRASA: json.dumps({"features": [{"attributes": {"versao_snv": "202601A"}}]}),
        S.PAM_PERIODOS: json.dumps([{"id": "2024"}, {"id": "2025"}]),
        S.MT_2026: 'alt "RoadShow-PT (v40) - Ficha" e "RoadShow-PT (v41) - Cronograma"',
        S.ROTAS_PAGINA: 'href="apresentacao-rotas-de-integracao-01-07-26-defeso.pdf"',
    }
    its = S.verificar(INTEL, HOJE, pedir=respostas.__getitem__, raw=Path("/nao-existe"), git=lambda *a: "",
                      codigo=CODIGO)
    novidades = {i["fonte"]: i for i in its if i["grupo"] == "novidade"}
    assert set(novidades) == {"VMDa (Infra S.A./DNIT)", "RoadShow (Ministério dos Transportes)"}
    assert "2026" in novidades["VMDa (Infra S.A./DNIT)"]["situacao"] and "v41" in novidades[
        "RoadShow (Ministério dos Transportes)"]["situacao"]
    assert not [i for i in its if i["grupo"] == "sem_verificacao"]   # SNV da Infra S.A. é mais velho: nada


def test_site_fora_do_ar_vira_sem_verificacao_e_nao_interrompe():
    def pedir(url):
        raise RuntimeError("Connection reset by peer")
    its = S.verificar(INTEL, HOJE, pedir=pedir, raw=Path("/nao-existe"), git=lambda *a: "", codigo=CODIGO)
    sem = [i for i in its if i["grupo"] == "sem_verificacao"]
    assert len(sem) == 5 and all("Connection reset" in i["situacao"] for i in sem)
    assert [i["grupo"] for i in its[:2]] == ["usuario", "usuario"]


def test_sem_rede_so_o_que_nao_precisa_de_internet():
    def pedir(url):
        raise AssertionError("não deveria pedir nada")
    its = S.verificar(INTEL, HOJE, rede=False, pedir=pedir, raw=Path("/nao-existe"), git=lambda *a: "", codigo=CODIGO)
    assert {i["grupo"] for i in its} == {"usuario"}


def test_branch_de_atualizacao_sem_merge():
    def git(*a):
        if a[:2] == ("branch", "-r"):
            return "  origin/claude/awesome-edison-e7gc88\n  origin/claude/wizardly-maxwell-472sba\n  origin/outra\n"
        if a[0] == "rev-list":
            return "1\n"
        return ""
    (it,) = S.branches_sem_merge(git, atual="claude/wizardly-maxwell-472sba")
    assert it["grupo"] == "git" and it["fonte"] == "claude/awesome-edison-e7gc88" and "1 commit" in it["situacao"]


def test_valores_do_codigo_lidos_dos_scripts():
    c = S.no_codigo()
    assert set(c) == set(CODIGO)
    assert c["antt_ultimo_mes"] >= "2026-08" and c["roadshow_versao"] >= 40 and len(c["rotas_data"]) == 10
