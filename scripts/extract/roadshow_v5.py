"""Extrator das séries do RoadShow que ganharam gráfico no fechamento (ABDIB, debêntures, pavimento, comparativos).

Lê o PDF com PyMuPDF e atualiza só estas chaves de data/roadshow/mercado.json, preservando o resto do arquivo e os
campos curados à mão (fonte original, base de preços, rótulos e notas). Os números são lidos dos rótulos do PDF:
nos gráficos de barras, cada rótulo vai para o ano mais próximo no eixo x (posição de `page.get_text("dict")`).

Uso:  python scripts/extract/roadshow_v5.py [caminho/do/roadshow.pdf]      (padrão: data/raw/roadshow.pdf)
Depois: conferir o diff do JSON contra as imagens das páginas e rodar `python -m pytest tests/test_roadshow.py`.

Os textos dos diagramas do Regulatório (data/roadshow/regulatorio.json, `diagramas`) são curados à mão; o script
lista os trechos com "18%" das pp. 61, 65 e 73 para conferir as duas redações do limite do aporte.
Numeração de página = a do RoadShow (1 = primeira; em português, só as ímpares).
"""
import json
import re
import sys
from pathlib import Path

import pymupdf

ROOT = Path(__file__).resolve().parents[2]
PDF = ROOT / "data" / "raw" / "roadshow.pdf"
MERCADO = ROOT / "data" / "roadshow" / "mercado.json"

P_ABDIB, P_DEBENTURES, P_PAVIMENTO, P_COMP_TIPO, P_COMP_MALHA = 39, 77, 35, 41, 45
ANO = re.compile(r"^(19|20)\d\d$")
NUM = re.compile(r"^\d+(,\d+)?$")
ESTADOS = ["Bom", "Regular", "Ruim", "Péssimo"]


def num(s):
    """'84,5' → 84.5; '54' → 54 (inteiro quando o PDF imprime sem casas)."""
    v = float(s.replace(".", "").replace(",", ".")) if "," in s else float(s)
    return int(v) if v.is_integer() else v


def linhas(page):
    """Linhas de texto com posição: [(x0, y0, x1, y1, texto)]."""
    out = []
    for b in page.get_text("dict")["blocks"]:
        for ln in b.get("lines", []):
            t = "".join(s["text"] for s in ln["spans"]).strip()
            if t:
                out.append((*ln["bbox"], t))
    return out


def texto(page):
    return " ".join(page.get_text().split())


def _por_ano(page, x_max=None):
    """Rótulos numéricos acima do eixo de anos, agrupados pelo ano mais próximo em x: {ano: [(y, valor)]}."""
    ls = [ln for ln in linhas(page) if x_max is None or ln[2] <= x_max]
    anos = [(int(t), (x0 + x1) / 2, y0) for x0, y0, x1, _, t in ls if ANO.match(t)]
    if not anos:
        raise ValueError("eixo de anos não encontrado")
    y_eixo = min(y for _, _, y in anos)
    grupos = {a: [] for a, _, _ in anos}
    for x0, y0, x1, _, t in ls:
        if NUM.match(t) and not ANO.match(t) and y0 < y_eixo:
            xc = (x0 + x1) / 2
            ano = min(anos, key=lambda a: abs(a[1] - xc))[0]
            grupos[ano].append((y0, num(t)))
    return {a: sorted(v) for a, v in sorted(grupos.items())}


def abdib(doc, pag=P_ABDIB):
    """p. 39: por ano, três rótulos empilhados — total (bolinha, em cima), privado (meio) e público (embaixo)."""
    out = []
    for ano, vals in _por_ano(doc[pag - 1]).items():
        if len(vals) != 3:
            raise ValueError(f"ABDIB {ano}: {len(vals)} rótulos")
        tot, priv, pub = (v for _, v in vals)
        out.append({"ano": ano, "publico": pub, "privado": priv, "total": tot})
    return out


def debentures(doc, pag=P_DEBENTURES):
    """p. 77: um rótulo por ano no gráfico da coluna esquerda (a direita tem anos de leis)."""
    page = doc[pag - 1]
    out = []
    for ano, vals in _por_ano(page, x_max=page.rect.width / 2).items():
        if len(vals) != 1:
            raise ValueError(f"debêntures {ano}: {len(vals)} rótulos")
        out.append({"ano": ano, "valor": vals[0][1]})
    return out


def debentures_destaque(doc, pag=P_DEBENTURES):
    m = re.search(r"R\$ ?(\d+(?:,\d+)?) bi emitidos em debêntures\*? incentivadas para rodovias em (\d{4})", texto(doc[pag - 1]))
    return {"ano": int(m.group(2)), "valor": num(m.group(1))}


def pavimento(doc, pag=P_PAVIMENTO):
    """p. 35: aumento do custo operacional do transporte de cargas por estado do pavimento e acréscimo médio."""
    t = texto(doc[pag - 1])
    vals = dict(re.findall(r"(Bom|Regular|Ruim|Péssimo) (\d+(?:,\d+)?)%", t))
    media = re.search(r"é de (\d+(?:,\d+)?)% devido", t).group(1)
    return {"acrescimo_medio": num(media), "estados": [{"estado": e, "aumento_pct": num(vals[e])} for e in ESTADOS]}


def _lado(periodo, anos, valor, previsto, media=None):
    d = {"periodo": periodo, "anos": anos, "valor": valor, "previsto": previsto}
    if media is not None:
        d["media_anual"] = media
    return d


def comparativos(doc, pags=(P_COMP_TIPO, P_COMP_MALHA)):
    """pp. 41 (público × privado, um quadro em cada metade da página) e 45 (malha federal: acumulado e por km/ano)."""
    p41, p45 = (doc[p - 1] for p in pags)
    t41 = texto(p41)
    per = re.search(r"Público: (\d{4} a \d{4}) x (\d{4} a \d{4}) \| Privado: (\d{4} a \d{4}) x (\d{4} a \d{4})", t41).groups()
    meio = p41.rect.width / 2
    out = []
    for k, (cid, rotulo, curto) in enumerate([("publico", "Investimento público em rodovias", "Público"),
                                              ("privado", "Investimento privado em rodovias", "Privado")]):
        lado = sorted((ln for ln in linhas(p41) if ((ln[0] + ln[2]) / 2 < meio) == (k == 0)), key=lambda ln: ln[0])
        acum = [num(m.group(1)) for *_, t in lado if (m := re.match(r"^R\$ (\d+(?:,\d+)?) bi$", t))]
        media = [num(m.group(1)) for *_, t in lado if (m := re.match(r"^R\$ (\d+(?:,\d+)?) bi/ano$", t))]
        anos = [(int(m.group(1)), "previsto" in t) for *_, t in lado if (m := re.match(r"^(\d+) anos", t))]
        mult = next(num(m.group(1)) for *_, t in lado if (m := re.match(r"^(\d+,\d+)x$", t)))
        var = next(int(m.group(1)) for *_, t in lado if (m := re.match(r"^\+ ?(\d+)%$", t)))
        out.append({"id": cid, "rotulo": rotulo, "curto": curto, "pagina": pags[0], "unidade": "R$ bi",
                    "base": _lado(per[2 * k], anos[0][0], acum[0], anos[0][1], media[0]),
                    "comparado": _lado(per[2 * k + 1], anos[1][0], acum[1], anos[1][1], media[1]),
                    "multiplo": mult, "variacao_pct": var})
    t45 = texto(p45)
    pers = re.findall(r"• (\d{4}) a (\d{4}) \((\d+) anos, (realizado|previsto)\)", t45)
    acum = re.search(r"Investimento total acumulado R\$ (\S+) bi R\$ (\S+) bi \+ ?(\d+)%", t45).groups()
    media = re.search(r"Média anual de investimento R\$ (\S+) bi/ano R\$ (\S+) bi/ano \+ ?(\d+)%", t45).groups()
    km = re.search(r"Investimento por km/ano R\$ (\S+) mi > R\$ (\S+) mi \+ ?(\d+)%", t45).groups()
    mult = num(re.search(r"(\d+,\d+)x", t45).group(1))
    lados = [(f"{a} a {b}", int(n), st == "previsto") for a, b, n, st in pers]
    out.append({"id": "total", "rotulo": "Investimento total na malha federal", "curto": "Malha federal", "pagina": pags[1], "unidade": "R$ bi",
                "base": _lado(*lados[0][:2], num(acum[0]), lados[0][2], num(media[0])),
                "comparado": _lado(*lados[1][:2], num(acum[1]), lados[1][2], num(media[1])),
                "multiplo": mult, "variacao_pct": int(acum[2])})
    out.append({"id": "por_km", "rotulo": "Investimento por km por ano na malha federal", "curto": "Malha federal por km", "pagina": pags[1], "unidade": "R$ mi por km/ano",
                "base": _lado(*lados[0][:2], num(km[0]), lados[0][2]),
                "comparado": _lado(*lados[1][:2], num(km[1]), lados[1][2]),
                "multiplo": mult, "variacao_pct": int(km[2])})
    return out


def trechos_18(doc, pags):
    """[(página, trecho)] de cada menção a "18%" nas páginas dadas (para conferir a redação do limite do aporte)."""
    out = []
    for p in pags:
        t = texto(doc[p - 1])
        out += [(p, t[max(0, m.start() - 120):m.end() + 30]) for m in re.finditer(r"18 ?%", t)]
    return out


def main(pdf=PDF):
    m = json.loads(MERCADO.read_text(encoding="utf-8"))
    with pymupdf.open(pdf) as doc:
        m["abdib"] = {**m.get("abdib", {}), "serie": abdib(doc)}
        m["debentures"] = {**m.get("debentures", {}), "serie": debentures(doc), "destaque": debentures_destaque(doc)}
        m["pavimento"] = {**m.get("pavimento", {}), **pavimento(doc)}
        m["comparativos"] = comparativos(doc)
        trechos = trechos_18(doc, [61, 65, 73])
    m["fontes"].update(abdib=P_ABDIB, debentures=P_DEBENTURES, pavimento=P_PAVIMENTO, comparativos=[P_COMP_TIPO, P_COMP_MALHA])
    MERCADO.write_text(json.dumps(m, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"gravado {MERCADO.relative_to(ROOT)}: abdib, debentures, pavimento, comparativos")
    print("Trechos com 18% (conferir data/roadshow/regulatorio.json, diagramas[fluxo-projeto].redacoes):")
    for p, t in trechos:
        print(f"  p. {p}: …{t}…")


if __name__ == "__main__":
    main(Path(sys.argv[1]) if len(sys.argv) > 1 else PDF)
