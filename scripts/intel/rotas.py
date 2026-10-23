"""Rotas de Integração Sul-Americana (MPO): bloco ESQUEMÁTICO para o mapa e o cartão de cada rota.

Não existe geodado oficial das 5 Rotas. O traçado vem do mapa vetorial da apresentação do MPO de 01/07/2026
(p. 7, "Mapa geral"): as linhas foram separadas pela cor (uma cor por rota; azul fino sobre a rota = hidrovia;
arco tracejado = cabotagem; marrom = trecho em pavimentação; cinza escuro = trecho em estudos) e
georreferenciadas por 70 cidades do próprio mapa (projeção plate carrée, RMS ~1,7 pt, cerca de 9 km).
É generalização cartográfica de apresentação, não o eixo das vias. Ferrovias de fundo do mapa ficam de fora.

Os textos do cartão (países, UFs, nós, rodovias, hidrovias, obras) são transcrições curtas dos relatórios
anuais do MPO (2024 e 2025) e dos slides por rota da apresentação de 01/07/2026. Os nós seguem as imagens
oficiais de cada rota (gov.br). Os contornos dos países vêm do Natural Earth 1:50m (Brasil fica fora: o mapa
já tem as UFs; a Guiana Francesa sai do polígono da França).

    python scripts/intel/rotas.py [fetch|build|all]
"""
import datetime as dt
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from intel.fontes import RAW, ROOT, Manifest, fetch as _fetch  # noqa: E402
from intel.snvbase import encode_line  # noqa: E402

GOV = "https://www.gov.br/planejamento/pt-br/assuntos"
URL_PAGINA = f"{GOV}/assuntos-internacionais-e-desenvolvimento/rotas-de-integracao-sul-americana"
URL_APRESENTACAO = (f"{GOV}/articulacao-institucional/repositorio-de-arquivos-legislacao-eleitoral/"
                    "apresentacao-rotas-de-integracao-01-07-26-defeso.pdf/@@display-file/file")
URL_RELATORIO = {a: f"{GOV}/articulacao-institucional/publicacoes/relatorio-{a}-rotas-de-integracao-sul-americana/"
                    "@@download/file" for a in (2024, 2025)}
URL_IMAGEM = {n: f"{URL_PAGINA}/imagens/rota-{n}.jpg/@@images/image" for n in range(1, 6)}
URL_NE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson"

DIR = RAW / "rotas"
PDF = DIR / "apresentacao_rotas_2026-07-01.pdf"
NE = DIR / "ne" / "ne_50m_admin_0_countries.geojson"
OUT = ROOT / "data" / "intel" / "rotas.json"

LICENCA_MPO = "Publicação oficial do MPO (gov.br); licença não declarada no documento"
LICENCA_NE = "Domínio público (Natural Earth)"

# (url, arquivo, descrição, período, licença) — tudo o que o bloco usa, para o manifesto.
DOCS = [
    (URL_APRESENTACAO, PDF, "Apresentação Rotas de Integração Sul-Americana, 01/07/2026 (PDF vetorial; p. 7 mapa "
     "geral, p. 10-20 por rota)", "01/07/2026", LICENCA_MPO),
    (URL_RELATORIO[2025], DIR / "relatorio_2025.pdf", "Relatório 2025 — Rotas de Integração Sul-Americana", "2025",
     LICENCA_MPO),
    (URL_RELATORIO[2024], DIR / "relatorio_2024.pdf", "Relatório 2024 — Rotas de Integração Sul-Americana", "2024",
     LICENCA_MPO),
    *[(URL_IMAGEM[n], DIR / f"govbr_rota-{n}.jpg", f"Imagem oficial da Rota {n} (nós, portos e trechos)", "2026",
       LICENCA_MPO) for n in range(1, 6)],
    (URL_NE, NE, "Natural Earth 1:50m, Admin 0 – Countries (GeoJSON)", "versão do ramo master", LICENCA_NE),
]

# --- extração do mapa vetorial (p. 7) -------------------------------------------------------------------------
PAGINA = 6  # índice 0 da p. 7
CX = (21.43903567443516, 2519.8557530278113)  # x_pt = a·lon + b (ajuste em 70 cidades; RMS 1,73 pt)
CY = (-21.445098371388532, 276.4124449226929)  # y_pt = a·lat + b
COR_ROTA = {(0.99, 0.76, 0.0): "1", (0.92, 0.38, 0.62): "2", (0.0, 0.64, 0.33): "3", (0.91, 0.31, 0.21): "4",
            (0.0, 0.55, 0.82): "5", (0.68, 0.14, 0.13): "4"}
COR_TRECHO = {(0.58, 0.36, 0.0): "brown", (0.29, 0.29, 0.29): "gray"}
FAIXA_MIN = 20  # itens: faixa preenchida na cor de uma rota (descarta as bolinhas da legenda, com 4)
COR_RIO, COR_CABOTAGEM = (0.19, 0.32, 0.63), (0.16, 0.26, 0.47)

# --- bloco ------------------------------------------------------------------------------------------------------
TIPO_POR_KIND = {"rota": "rota", "hidrovia_overlay": "hidrovia", "cabotagem": "cabotagem",
                 "trecho_brown": "pavimentacao", "trecho_gray": "estudo"}
TOL = 0.005  # Douglas-Peucker, graus
CABOTAGEM_R1 = 0.5  # arco de cabotagem com uma ponta a até 0,5° de uma linha da Rota 1 pertence a ela
AS = (-82.0, -56.0, -34.0, 13.0)  # caixa da América do Sul: descarta as ilhas do Pacífico (Ilha de Páscoa etc.)
AREA_MIN = 0.02  # graus²: descarta ilhotas
PAISES = {"AR": "Argentina", "BO": "Bolívia", "CL": "Chile", "CO": "Colômbia", "EC": "Equador", "GY": "Guiana",
          "GF": "Guiana Francesa", "PY": "Paraguai", "PE": "Peru", "SR": "Suriname", "UY": "Uruguai",
          "VE": "Venezuela"}
NE_ISO = {"ARG": "AR", "BOL": "BO", "CHL": "CL", "COL": "CO", "ECU": "EC", "GUY": "GY", "FRA": "GF", "PRY": "PY",
          "PER": "PE", "SUR": "SR", "URY": "UY", "VEN": "VE"}

R25, R24 = URL_RELATORIO[2025], URL_RELATORIO[2024]
ROTAS = [
    {
        "id": "r1", "n": 1, "nome": "Ilha das Guianas", "previsao": "Previsão de conclusão em 2026 (Brasil)",
        "paises": ["Brasil", "Venezuela", "Guiana", "Suriname", "Guiana Francesa"],
        "ufs": ["RR", "AP", "AM", "PA"],
        "cidades": ["Puerto La Cruz", "Puerto Ordaz", "Santa Elena de Uairén", "Pacaraima", "Boa Vista", "Bonfim",
                    "Lethem", "Mabura Hill", "Linden", "Georgetown", "New Amsterdam", "Paramaribo", "Caiena",
                    "Saint-Georges", "Oiapoque", "Calçoene", "Macapá", "Laranjal do Jari", "Belém", "Santarém",
                    "Itacoatiara", "Manaus", "Presidente Figueiredo", "Rorainópolis"],
        "rodovias": ["BR-174", "BR-401", "BR-156", "Troncal 10 (Venezuela)"],
        "hidrovias": ["Rio Amazonas: Manaus–Santarém–Macapá e Belém"],
        "obras": ["Extensão do linhão de energia de Tucuruí (PA) a Boa Vista (RR), passando por Manaus",
                  "Restauração e asfaltamento da BR-174",
                  "Pavimentação do último trecho da BR-156, ao norte de Macapá (AP)",
                  "Ponte sobre o rio Jari, entre Amapá e Pará",
                  "Concessão e arrendamentos no Porto de Santana (AP)",
                  "Pavimentação, na Guiana, da rodovia que continua a BR-401",
                  "Infovia estadual (fases 1 a 3)"],
        "descricao": ("Rota de rodovias e hidrovias. Inclui Roraima e Amapá inteiros e parte do Amazonas e do Pará, "
                      "e abarca Guiana Francesa, Suriname, Guiana e Venezuela. A BR-174 liga Roraima à Venezuela e a "
                      "Manaus; a BR-156 percorre o Amapá, de Laranjal do Jari ao Oiapoque; a BR-401 liga Boa Vista a "
                      "Bonfim, na fronteira com a Guiana. Pelo rio Amazonas navega-se de Manaus a Macapá e a Belém, "
                      "portos de onde se pode desenvolver a cabotagem."),
        "fonte_url": R25, "fonte_ref": "Relatório 2025, p. 16; apresentação de 01/07/2026, p. 11",
    },
    {
        "id": "r2", "n": 2, "nome": "Amazônica", "previsao": "Concluída em 2025 (Brasil)",
        "paises": ["Brasil", "Colômbia", "Peru", "Equador"],
        "ufs": ["AM", "PA", "AP"],
        "cidades": ["Manaus", "Tefé", "Santo Antônio do Içá", "Puerto Asís", "Pasto", "Tumaco", "Tabatinga",
                    "Letícia", "Santa Rosa", "Iquitos", "Providência", "Quito", "Manta", "Yurimaguas", "Paita",
                    "Pucallpa", "Chancay"],
        "rodovias": ["Puerto Asís–Tumaco (Colômbia)", "Providência–Manta (Equador)", "Yurimaguas–Paita (Peru)",
                     "Pucallpa–Chancay (Peru)"],
        "hidrovias": ["Rio Solimões: Manaus–Tabatinga", "Rio Içá/Putumayo: Santo Antônio do Içá–Puerto Asís",
                      "Rios Amazonas e Napo: Tabatinga–Providência",
                      "Rios Amazonas, Marañón e Huallaga: Tabatinga–Yurimaguas",
                      "Rios Amazonas e Ucayali: Tabatinga–Pucallpa",
                      "Rio Amazonas: Manaus–Atlântico (com a Rota 1)"],
        "obras": ["Dragagem da hidrovia do Solimões, entre Manaus e Tabatinga",
                  "Sinalização no rio Solimões, entre Manaus e Tabatinga",
                  "Recinto aduaneiro em Tabatinga (AM)"],
        "descricao": ("Rota multimodal. Percorre todo o Amazonas pelos rios Amazonas e Solimões, desde o Amapá e o "
                      "Pará. O caminho principal é a hidrovia do Solimões até Tabatinga, na fronteira com Santa Rosa "
                      "(Peru) e Letícia (Colômbia). Pelo rio Içá, chamado Putumayo na Colômbia, chega-se a Puerto "
                      "Asís e, por rodovia, ao porto de Tumaco. De Tabatinga, hidrovias levam a Providência "
                      "(Equador), Yurimaguas e Pucallpa (Peru), de onde rodovias seguem aos portos de Manta, Paita e "
                      "Chancay."),
        "fonte_url": R25, "fonte_ref": "Relatório 2025, p. 18; apresentação de 01/07/2026, p. 13",
    },
    {
        "id": "r3", "n": 3, "nome": "Quadrante Rondon", "previsao": "Previsão de conclusão em 2027-29 (Brasil)",
        "paises": ["Brasil", "Peru", "Bolívia", "Chile"],
        "ufs": ["AC", "RO", "AM", "MT", "MS"],
        "cidades": ["Brasília", "Cuiabá", "Vilhena", "Porto Velho", "Rio Branco", "Brasiléia", "Assis Brasil",
                    "Iñapari", "Puerto Maldonado", "Chancay", "Ilo", "Matarani", "Guajará-Mirim", "Riberalta",
                    "La Paz", "Oruro", "Arica", "Iquique", "Cáceres", "Vila Bela da Santíssima Trindade",
                    "San Matías", "San Ignacio de Velasco", "Santa Cruz de la Sierra", "Cochabamba", "Corumbá",
                    "Puerto Quijarro", "Humaitá", "Manaus", "Sinop", "Itaituba", "Santarém"],
        "rodovias": ["BR-364", "BR-317", "BR-070", "BR-425", "BR-163", "IIRSA Sur (Peru)"],
        "hidrovias": ["Rio Madeira: Porto Velho–Manaus"],
        "obras": ["Construção do contorno de Brasiléia, na BR-317",
                  ("Duas pontes na BR-425, entre Nova Mamoré e Guajará-Mirim (RO), inauguradas segundo o "
                   "relatório 2024"),
                  "Ponte Brasil–Bolívia sobre o rio Mamoré, em Guajará-Mirim (RO)",
                  "Duplicação da BR-364 entre Vilhena e Porto Velho",
                  "Dragagem do rio Madeira",
                  "Infovia MT: 5 mil km de fibra óptica"],
        "descricao": ("Rota hoje majoritariamente rodoviária. Abrange Acre e Rondônia inteiros e parte do Amazonas, "
                      "de Mato Grosso e de Mato Grosso do Sul. As BRs 070, 317 e 364 ligam o Centro-Oeste ao Peru e "
                      "à Bolívia, com destino a cinco portos no Pacífico: Chancay, Ilo e Matarani (Peru), Arica e "
                      "Iquique (Chile). As saídas do Brasil são Assis Brasil (AC), Guajará-Mirim (RO), Cáceres e "
                      "Vila Bela da Santíssima Trindade (MT) e Corumbá (MS); a BR-163 oferece saída pelo Arco Norte."),
        "fonte_url": R25, "fonte_ref": "Relatório 2025, p. 20; relatório 2024, p. 27; apresentação de 01/07/2026, "
                                       "p. 15",
    },
    {
        "id": "r4", "n": 4, "nome": "Bioceânica de Capricórnio",
        "previsao": "Previsão de conclusão em 2026-27 (Brasil)",
        "paises": ["Brasil", "Paraguai", "Argentina", "Chile"],
        "ufs": ["MS", "SP", "PR", "SC"],
        "cidades": ["Santos", "Campo Grande", "Porto Murtinho", "Carmelo Peralta", "Loma Plata",
                    "Mariscal Estigarribia", "Pozo Hondo", "Misión La Paz", "Tartagal", "San Salvador de Jujuy",
                    "Salta", "Calama", "Antofagasta", "Mejillones", "Iquique", "Paranaguá", "Cascavel",
                    "Foz do Iguaçu", "Assunção", "Resistência", "Itajaí", "Dionísio Cerqueira"],
        "rodovias": ["BR-267", "BR-282", "Picada 500 (Chaco paraguaio)"],
        "hidrovias": ["Rio Paraguai: Corumbá–Assunção–Rosario–Buenos Aires"],
        "obras": ["Ponte binacional sobre o rio Paraguai, entre Porto Murtinho (MS) e Carmelo Peralta",
                  "Contorno rodoviário de acesso à ponte, na BR-267, em Porto Murtinho (MS)",
                  "Asfaltamento de 225 km da Picada 500, no Chaco paraguaio",
                  "Melhorias nas aduanas e na ponte sobre o rio Pilcomayo, entre Pozo Hondo e Misión La Paz",
                  "Acesso à ponte de Foz do Iguaçu (PR)",
                  "Adequação da BR-282",
                  "Concessão da Malha Oeste (ferrovia)"],
        "descricao": ("Rota essencialmente rodoviária entre o Atlântico e o Pacífico. Liga Santos (SP) e Paranaguá "
                      "(PR) a Iquique, Antofagasta e Mejillones, no Chile, passando por Paraguai e Argentina. "
                      "Contempla Mato Grosso do Sul, São Paulo, Paraná e Santa Catarina. As saídas por Porto Murtinho "
                      "(MS), Foz do Iguaçu (PR) e Dionísio Cerqueira (SC) convergem para Salta e San Salvador de "
                      "Jujuy antes de cruzar os Andes. Há opções multimodais: a ferrovia Corumbá–Santos e a hidrovia "
                      "do rio Paraguai."),
        "fonte_url": R24, "fonte_ref": "Relatório 2024, p. 29; apresentação de 01/07/2026, p. 17",
    },
    {
        "id": "r5", "n": 5, "nome": "Bioceânica do Sul", "previsao": "Previsão de conclusão em 2026 (Brasil)",
        "paises": ["Brasil", "Uruguai", "Argentina", "Chile"],
        "ufs": ["RS", "SC"],
        "cidades": ["Imbituba", "Porto Alegre", "Rio Grande", "Pelotas", "Jaguarão", "Chuí", "Montevidéu",
                    "Santana do Livramento", "Uruguaiana", "Paso de los Libres", "São Borja", "Porto Xavier",
                    "Itaqui", "Santa Fe", "Rosario", "Buenos Aires", "Nueva Palmira", "Córdoba", "San Juan",
                    "Mendoza", "Santiago", "Valparaíso", "San Antonio"],
        "rodovias": ["BR-290 (Rodovia do Mercosul)", "BR-116", "BR-285"],
        "hidrovias": ["Rios Jacuí, Taquari, Sinos, Gravataí e Jaguarão",
                      "Lagoa dos Patos, canal São Gonçalo e Lagoa Mirim"],
        "obras": ["Duplicação da BR-290 (125 km entre Porto Alegre e Pantano Grande no Novo PAC)",
                  "Duplicação da BR-116",
                  "Ponte entre Itaqui e Uruguaiana",
                  "Restauração da ponte de Uruguaiana",
                  "Ponte binacional em Porto Xavier (RS)",
                  "Ponte binacional em Jaguarão (RS)",
                  "Dragagem e sinalização na Lagoa Mirim"],
        "descricao": ("Rota bioceânica e multimodal, de rodovias e hidrovias. Inclui o Rio Grande do Sul e trechos de "
                      "Santa Catarina em torno da BR-285; os vizinhos são Uruguai, Argentina e Chile. Há vários "
                      "roteiros: com a Argentina, sobretudo por São Borja e Uruguaiana, rumo aos portos de Valparaíso "
                      "e San Antonio; com o Uruguai, sobretudo por Jaguarão e Chuí. A rede hidroviária tem mais de "
                      "1.850 km navegáveis, dos rios gaúchos à Lagoa dos Patos e à Lagoa Mirim."),
        "fonte_url": R25, "fonte_ref": "Relatório 2025, p. 24; relatório 2024, p. 31; apresentação de 01/07/2026, "
                                       "p. 19",
    },
]


def fetch(force=False):
    """Garante os documentos brutos (não rebaixa o que já existe; com `force`, baixa de novo) e os registra no
    manifesto."""
    m = Manifest("rotas")
    for url, dest, desc, periodo, lic in DOCS:
        _fetch(url, dest, force=force)
        m.add(url, dest, desc, periodo=periodo, licenca=lic)
    m.save()


# --- extração -------------------------------------------------------------------------------------------------
def _achatar(itens, n=10):
    """Itens de desenho do PyMuPDF (linhas e Béziers cúbicas) → lista de pontos em pt."""
    pts = []
    for it in itens:
        if it[0] == "l":
            if not pts:
                pts.append((it[1].x, it[1].y))
            pts.append((it[2].x, it[2].y))
        elif it[0] == "c":
            p0, c1, c2, p1 = it[1:5]
            if not pts:
                pts.append((p0.x, p0.y))
            for i in range(1, n + 1):
                t = i / n
                a, b, c, d = (1 - t) ** 3, 3 * (1 - t) ** 2 * t, 3 * (1 - t) * t * t, t ** 3
                pts.append((a * p0.x + b * c1.x + c * c2.x + d * p1.x, a * p0.y + b * c1.y + c * c2.y + d * p1.y))
    return pts


def _eixo(anel):
    """Eixo de uma faixa preenchida (traço convertido em contorno): divide o anel nas duas pontas mais distantes e
    tira a média dos dois lados, reamostrados a cada ~1 pt."""
    import numpy as np
    from shapely.geometry import LineString

    a = np.array(anel[:-1] if anel[0] == anel[-1] else anel)
    d = ((a[:, None, :] - a[None, :, :]) ** 2).sum(-1)
    i, j = sorted(np.unravel_index(int(d.argmax()), d.shape))
    l1, l2 = LineString(a[i:j + 1]), LineString(np.vstack([a[j:], a[:i + 1]])[::-1])
    n = max(2, int(max(l1.length, l2.length)))
    out = []
    for t in np.linspace(0, 1, n):
        p, q = l1.interpolate(t, normalized=True), l2.interpolate(t, normalized=True)
        out.append(((p.x + q.x) / 2, (p.y + q.y) / 2))
    return out


def _lonlat(x, y):
    return [round((x - CX[1]) / CX[0], 3), round((y - CY[1]) / CY[0], 3)]


def extrair(pdf=PDF):
    """Separa as linhas da p. 7 por cor/espessura → GeoJSON georreferenciado (kind/rota).

    Ferrovias de fundo ficam de fora.
    Quase todas as rotas são traços (stroke). O ramal Tumaco–Puerto Asís–Putumayo (Rota 2) e dois trechos da Rota 1
    perto de Macapá/Belém vêm como faixas preenchidas: delas se tira o eixo."""
    import warnings

    import numpy as np
    import pymupdf
    from shapely.geometry import LineString

    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        drawings = pymupdf.open(pdf)[PAGINA].get_drawings()
    rotas_, trechos, rios, cab = [], [], [], []
    for d in drawings:
        f = tuple(round(x, 2) for x in d["fill"]) if d.get("fill") else None
        if d["type"] == "f" and f in COR_ROTA and len(d["items"]) >= FAIXA_MIN:
            rotas_.append((COR_ROTA[f], _eixo(_achatar(d["items"]))))
            continue
        if d["type"] != "s":
            continue
        c = tuple(round(x, 2) for x in d["color"]) if d["color"] else None
        w, da = round(d["width"], 2), d.get("dashes")
        pts = _achatar(d["items"])
        if len(pts) < 2:
            continue
        if 2.5 <= w <= 3.3 and c in COR_ROTA:
            rotas_.append((COR_ROTA[c], pts))
        elif w >= 2.5 and c in COR_TRECHO:
            trechos.append((COR_TRECHO[c], pts))
        elif c == COR_RIO and w == 0.97:
            rios.append(pts)
        elif c == COR_CABOTAGEM and w == 1.94 and da and da != "[] 0":
            cab.append(pts)
    # hidrovia: trecho de rio desenhado sobre a linha de uma rota (≥ 70% de 15 amostras a < 2,5 pt)
    rv = np.array([q for _, p in rotas_ for q in p])
    hid = []
    for p in rios:
        ls = LineString(p)
        if ls.length < 8:
            continue
        s = np.array([[q.x, q.y] for q in (ls.interpolate(i / 14, normalized=True) for i in range(15))])
        dmin = np.sqrt(((s[:, None, :] - rv[None, :, :]) ** 2).sum(-1)).min(1)
        if (dmin < 2.5).mean() > 0.7:
            hid.append(p)

    def feat(kind, rota, pts, tol=0.01):
        ls = LineString([_lonlat(x, y) for x, y in pts]).simplify(tol)
        return {"type": "Feature", "properties": {"kind": kind, "rota": rota},
                "geometry": {"type": "LineString", "coordinates": [list(c) for c in ls.coords]}}

    fs = [feat("rota", r, p) for r, p in rotas_] + [feat("trecho_" + k, None, p) for k, p in trechos]
    fs += [feat("hidrovia_overlay", None, p) for p in hid] + [feat("cabotagem", None, p, 0.02) for p in cab]
    return {"type": "FeatureCollection", "features": fs}


# --- montagem -------------------------------------------------------------------------------------------------
def rota_mais_proxima(pts, por_rota):
    """Id da rota cujas linhas ficam, em média, mais perto dos pontos (graus; só para escolher)."""
    from shapely.geometry import MultiLineString, Point

    geo = {r: MultiLineString(ls) for r, ls in por_rota.items()}
    return min(geo, key=lambda r: sum(geo[r].distance(Point(p)) for p in pts) / len(pts))


def _amostra(ls, n=15):
    return [ls.interpolate(i / (n - 1), normalized=True).coords[0] for i in range(n)]


def _enc(coords):
    return encode_line([(round(x, 3), round(y, 3)) for x, y in coords])


def linhas(geojson):
    """Feições de `extrair()` → linhas do bloco (rota, hidrovia, cabotagem, pavimentação, estudo)."""
    from shapely.geometry import LineString, Point

    fs = [f for f in geojson["features"] if f["properties"]["kind"] in TIPO_POR_KIND]
    por_rota = {}
    for f in fs:
        if f["properties"]["kind"] == "rota":
            por_rota.setdefault("r" + f["properties"]["rota"], []).append(LineString(f["geometry"]["coordinates"]))
    out = []
    for f in fs:
        kind = f["properties"]["kind"]
        ls = LineString(f["geometry"]["coordinates"])
        if kind == "rota":
            rota = "r" + f["properties"]["rota"]
        elif kind == "cabotagem":
            r1 = por_rota["r1"]
            pontas = (Point(ls.coords[0]), Point(ls.coords[-1]))
            rota = "r1" if min(g.distance(p) for g in r1 for p in pontas) <= CABOTAGEM_R1 else None
        else:
            rota = rota_mais_proxima(_amostra(ls), por_rota)
        simp = ls.simplify(TOL, preserve_topology=False)
        out.append({"rota": rota, "tipo": TIPO_POR_KIND[kind], "p": _enc(simp.coords)})
    ordem = list(TIPO_POR_KIND.values())
    out.sort(key=lambda x: (ordem.index(x["tipo"]), x["rota"] or "r9"))
    return out


def paises(ne_path=NE):
    """Contornos dos vizinhos (sem o Brasil), um anel externo por parte, rótulo no polo de inacessibilidade."""
    from shapely.geometry import box, shape
    from shapely.ops import polylabel

    caixa = box(*AS)
    out = []
    for f in json.loads(Path(ne_path).read_text(encoding="utf-8"))["features"]:
        iso = NE_ISO.get(f["properties"]["ADM0_A3"])
        if not iso:
            continue
        g = shape(f["geometry"])
        partes = [p for p in getattr(g, "geoms", [g]) if caixa.contains(p.centroid) and p.area >= AREA_MIN]
        if not partes:
            continue
        aneis = []
        for p in partes:
            ext = p.exterior.simplify(TOL, preserve_topology=False)
            if len(ext.coords) >= 4:
                aneis.append(_enc(ext.coords))
        maior = max(partes, key=lambda p: p.area)
        lab = polylabel(maior, tolerance=0.05)
        out.append({"nome": PAISES[iso], "iso": iso, "p": aneis, "label": [round(lab.x, 2), round(lab.y, 2)]})
    return sorted(out, key=lambda p: p["nome"])


def _acessos():
    return {i["url"]: i["acesso"] for i in Manifest("rotas").items}


def _fontes():
    hoje = dt.date.today().isoformat()
    ac = _acessos()
    return [
        {"nome": "MPO — Apresentação Rotas de Integração Sul-Americana (01/07/2026)", "url": URL_APRESENTACAO,
         "periodo": "01/07/2026", "acesso": ac.get(URL_APRESENTACAO, hoje), "licenca": LICENCA_MPO,
         "nota": ("Traçado esquemático: as linhas da p. 7 (mapa geral, vetorial) foram separadas pela cor de cada "
                  "rota e georreferenciadas por 70 cidades do próprio mapa (erro médio de cerca de 9 km). É "
                  "generalização cartográfica de apresentação, não o eixo das vias. Trechos marrom e cinza do mapa, "
                  "sem legenda no PDF, aparecem como trecho em pavimentação e trecho em estudos. As obras de cada "
                  "rota vêm dos slides 11, 13, 15, 17 e 19.")},
        {"nome": "MPO — Relatório 2025, Rotas de Integração Sul-Americana", "url": URL_RELATORIO[2025],
         "periodo": "2025", "acesso": ac.get(URL_RELATORIO[2025], hoje), "licenca": LICENCA_MPO,
         "nota": "Descrição das Rotas 1, 2, 3 e 5 (p. 16 a 24): países, UFs, vias, portos e obras."},
        {"nome": "MPO — Relatório 2024, Rotas de Integração Sul-Americana", "url": URL_RELATORIO[2024],
         "periodo": "2024", "acesso": ac.get(URL_RELATORIO[2024], hoje), "licenca": LICENCA_MPO,
         "nota": "Descrição da Rota 4 (p. 29; a página da Rota 4 no relatório 2025 é só imagem) e detalhes das "
                 "Rotas 3 e 5 (ponte de Guajará-Mirim, BR-290)."},
        {"nome": "MPO — Imagens oficiais das Rotas 1 a 5 (gov.br)", "url": URL_PAGINA,
         "periodo": "2026", "acesso": ac.get(URL_IMAGEM[1], hoje), "licenca": LICENCA_MPO,
         "nota": "Nós (cidades e portos) de cada rota, na ordem do traçado, e a situação no Brasil (previsão de "
                 "conclusão)."},
        {"nome": "Natural Earth — Admin 0 Countries 1:50m", "url": URL_NE,
         "periodo": "versão publicada no repositório oficial (out/2026)", "acesso": ac.get(URL_NE, hoje),
         "licenca": LICENCA_NE,
         "nota": "Contorno dos países vizinhos, simplificado (cerca de 0,005°). O Brasil fica fora (o mapa já tem as "
                 "UFs); a Guiana Francesa sai do polígono da França; ilhas pequenas e distantes ficam de fora."},
    ]


def build():
    geo = extrair()
    doc = {"fonte": _fontes(), "tipo": "cadastro", "esquematico": True, "paises": paises(), "rotas": ROTAS,
           "linhas": linhas(geo)}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    n = {}
    for ln in doc["linhas"]:
        n[ln["tipo"]] = n.get(ln["tipo"], 0) + 1
    print(f"{OUT.relative_to(ROOT)}: {len(doc['paises'])} países, {len(ROTAS)} rotas, linhas {n}, "
          f"{OUT.stat().st_size / 1024:.0f} KB")
    return doc


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "all"
    if cmd in ("fetch", "all"):
        fetch()
    if cmd in ("build", "all"):
        build()
