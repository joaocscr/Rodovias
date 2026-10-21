import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import build  # noqa: E402
import roadshow  # noqa: E402
import verificacao  # noqa: E402

BASE = ROOT / "data" / "base"
ROADSHOW = ROOT / "data" / "roadshow"


def grab(html, name):
    i = html.index(f"window.{name}=") + len(f"window.{name}=")
    return json.JSONDecoder().raw_decode(html, i)[0]


def test_base_existe_e_coerente():
    snv = json.loads((BASE / "snv.json").read_text(encoding="utf-8"))
    conc = json.loads((BASE / "conc.json").read_text(encoding="utf-8"))
    assert snv["versao"] == "202607A"
    assert len(snv["trechos"]) == 7673 and len(snv["fis"]) == 6815
    assert all(0 <= t[15] < len(snv["fis"]) for t in snv["trechos"])
    assert len(conc["entFis"]) == len(conc["entidades"])


def test_build_pela_base_reproduz_payloads(tmp_path):
    out = tmp_path / "m.html"
    build.build_from_base(BASE, out, intel={})
    html = out.read_text(encoding="utf-8")
    assert grab(html, "SNV") == json.loads((BASE / "snv.json").read_text(encoding="utf-8"))
    base = roadshow.curados(json.loads((BASE / "conc.json").read_text(encoding="utf-8")), ROADSHOW)
    conc = verificacao.aplicar(base, verificacao.carregar(), verificacao.carregar_aliases())
    assert grab(html, "CONC") == conc
    assert grab(html, "INTEL") == {}
    assert "/*__" not in html


def test_curados_releem_mercado_e_regulatorio(tmp_path):
    # data/roadshow/*.json é a fonte única de `mercado` e `regulatorio`: a cópia da base congelada não vale
    (tmp_path / "mercado.json").write_text(json.dumps({"abdib": {"serie": []}}), encoding="utf-8")
    (tmp_path / "regulatorio.json").write_text(json.dumps({"diagramas": []}), encoding="utf-8")
    base = {"entidades": [1], "mercado": {"velho": 1}, "regulatorio": {"velho": 1}}
    out = roadshow.curados(base, tmp_path)
    assert out == {"entidades": [1], "mercado": {"abdib": {"serie": []}}, "regulatorio": {"diagramas": []}}
    assert base["mercado"] == {"velho": 1}  # sem mutar a entrada


def test_build_pela_base_usa_os_json_curados(tmp_path):
    out = tmp_path / "m.html"
    build.build_from_base(BASE, out, intel={})
    conc = grab(out.read_text(encoding="utf-8"), "CONC")
    reg = json.loads((ROADSHOW / "regulatorio.json").read_text(encoding="utf-8"))
    merc = json.loads((ROADSHOW / "mercado.json").read_text(encoding="utf-8"))
    assert conc["regulatorio"] == reg
    for k in ("abdib", "debentures", "pavimento", "comparativos", "notas", "fontes"):
        assert conc["mercado"][k] == merc[k], k


def test_curados_falha_sem_arquivo(tmp_path):
    # sem o JSON curado o build para com mensagem clara, em vez de publicar Mercado/Regulatório vazios
    import pytest
    (tmp_path / "regulatorio.json").write_text("{}", encoding="utf-8")
    with pytest.raises(FileNotFoundError, match=r"arquivo curado do RoadShow ausente: .*mercado\.json"):
        roadshow.curados({}, tmp_path)
    (tmp_path / "regulatorio.json").unlink()
    (tmp_path / "mercado.json").write_text("{}", encoding="utf-8")
    with pytest.raises(FileNotFoundError, match=r"regulatorio\.json"):
        roadshow.curados({}, tmp_path)
    with pytest.raises(FileNotFoundError, match=r"mercado\.json"):
        build.build_from_base(BASE, tmp_path / "m.html", intel={}, roadshow_dir=tmp_path / "vazio")


# ---------- campos curados das entidades sem o shapefile (data/roadshow/entidades.json → CONC) ----------

def _base():
    return (json.loads((BASE / "conc.json").read_text(encoding="utf-8")),
            json.loads((BASE / "snv.json").read_text(encoding="utf-8")))


def _copia_roadshow(tmp_path):
    d = tmp_path / "roadshow"
    d.mkdir()
    for p in ROADSHOW.glob("*.json"):
        (d / p.name).write_text(p.read_text(encoding="utf-8"), encoding="utf-8")
    return d


def test_dados_sem_mudanca_dao_o_mesmo_conc():
    """Com entidades.json igual ao da base, a releitura não muda nada: o HTML sai idêntico."""
    conc, snv = _base()
    assert roadshow.conc_da_base(conc, ROADSHOW, snv) == roadshow.curados(conc, ROADSHOW)


def test_estado_editado_em_entidades_json_chega_ao_conc_sem_shp(tmp_path):
    conc, snv = _base()
    d = _copia_roadshow(tmp_path)
    ents = json.loads((d / "entidades.json").read_text(encoding="utf-8"))
    i = next(k for k, e in enumerate(ents) if e["estado"] == "agendado2026")
    ents[i]["estado"], ents[i]["status_texto"] = "programa", "Contrato assinado"
    (d / "entidades.json").write_text(json.dumps(ents, ensure_ascii=False), encoding="utf-8")
    novo = roadshow.conc_da_base(conc, d, snv)
    e = novo["entidades"][i]
    assert (e["estado"], e["status_texto"]) == ("programa", "Contrato assinado")
    # campos do recorte no SNV continuam os da base
    b = conc["entidades"][i]
    assert (e["idx"], e["km_mapeado"], e["qualidade"], e["nota_trecho"]) == (b["idx"], b["km_mapeado"], b["qualidade"], b["nota_trecho"])
    assert novo["entFis"] == conc["entFis"] and novo["fisEnt"] == conc["fisEnt"]
    # contrato novo cobre os físicos dele: saem da lista "concessão no SNV, fora do RoadShow"
    assert set(novo["snvOnly"]) == set(conc["snvOnly"]) - set(conc["entFis"][i])


def test_km_declarado_editado_reclassifica_o_recorte(tmp_path):
    conc, snv = _base()
    d = _copia_roadshow(tmp_path)
    ents = json.loads((d / "entidades.json").read_text(encoding="utf-8"))
    trechos = json.loads((ROADSHOW / "trechos.json").read_text(encoding="utf-8"))
    i = next(k for k, e in enumerate(conc["entidades"])
             if e["qualidade"] == "ok" and e.get("km") and not trechos.get(e["id"], {}).get("qualidade"))
    ents[i]["km"] = conc["entidades"][i]["km_mapeado"] * 3  # declarado muito maior que o recorte
    (d / "entidades.json").write_text(json.dumps(ents, ensure_ascii=False), encoding="utf-8")
    assert roadshow.conc_da_base(conc, d, snv)["entidades"][i]["qualidade"] == "falha"


def test_entidade_nova_ou_removida_falha_com_mensagem(tmp_path):
    import pytest
    conc, snv = _base()
    d = _copia_roadshow(tmp_path)
    ents = json.loads((d / "entidades.json").read_text(encoding="utf-8"))
    (d / "entidades.json").write_text(json.dumps(ents + [dict(ents[0], id="concessao-nova")], ensure_ascii=False),
                                      encoding="utf-8")
    msg = r"entidade nova/removida precisa de recorte no SNV: rode build\.py --shp \(ou ajuste trechos\.json\)"
    with pytest.raises(ValueError, match=msg + r".*concessao-nova"):
        roadshow.conc_da_base(conc, d, snv)
    (d / "entidades.json").write_text(json.dumps(ents[1:], ensure_ascii=False), encoding="utf-8")
    with pytest.raises(ValueError, match=msg + rf".*{ents[0]['id']}"):
        roadshow.conc_da_base(conc, d, snv)
    # pelo build: sai com a mensagem, sem gerar o HTML
    with pytest.raises(SystemExit, match=msg):
        build.build_from_base(BASE, tmp_path / "m.html", intel={}, roadshow_dir=d)
    assert not (tmp_path / "m.html").exists()


def test_estudo_com_outras_brs_falha(tmp_path):
    import pytest
    conc, snv = _base()
    d = _copia_roadshow(tmp_path)
    est = json.loads((d / "estudos_pos2027.json").read_text(encoding="utf-8"))
    est[0]["brs"] = ["999"]
    (d / "estudos_pos2027.json").write_text(json.dumps(est, ensure_ascii=False), encoding="utf-8")
    with pytest.raises(ValueError, match=r"precisa de recorte no SNV"):
        roadshow.conc_da_base(conc, d, snv)
