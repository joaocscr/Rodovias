import json, re, unicodedata, sys

OUT = "/home/user/Rodovias/data/roadshow/_parte_a.json"

def slug(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")

def d(s):
    if not s or s == "-":
        return None
    dd, mm, yy = s.replace("*", "").split("/")
    return f"{yy}-{mm}-{dd}"

def parse_brs_ufs(t):
    fed = re.split(r"\s+e\s+|\s+-\s+", t)[0] if " e " in t else t
    brs, ufs = [], []
    # federal part: everything starting with BR-
    for m in re.finditer(r"BR-([0-9/\-]+?)(?:/([A-Z]{2}(?:/[A-Z]{2})*))?(?=\s|$|PR|e\b)", t):
        pass
    # simpler manual approach
    parts = re.findall(r"BR-[0-9A-Z/\-]+", t)
    for p in parts:
        toks = re.split(r"[/\-]", p[3:])
        for tk in toks:
            if re.fullmatch(r"\d{3}", tk):
                if tk not in brs: brs.append(tk)
            elif re.fullmatch(r"\d{3}[A-Z]{2}", tk):  # e.g. 277PR
                if tk[:3] not in brs: brs.append(tk[:3])
                if tk[3:] not in ufs: ufs.append(tk[3:])
            elif re.fullmatch(r"[A-Z]{2}", tk):
                if tk not in ufs: ufs.append(tk)
    return brs, ufs

# ---- table p3/p5 ----
# (linha, nome_p5, trecho, assinatura(s), km, capex, opex)
T = [
 (1, "Autopista Litoral do Sul", "BR-116-376/PR e BR-101/SC", ["14/02/2008"], 405.90, 6.33, 5.48),
 (2, "Autopista Planalto Sul", "BR-116/PR/SC", ["14/02/2008"], 412.70, 2.24, 3.26),
 (3, "Transbrasiliana", "BR-153/SP", ["14/02/2008"], 321.60, 2.53, 2.31),
 (4, "Ecovias Minas Goiás", "BR-050/GO/MG", ["05/12/2013"], 436.60, 6.18, 4.01),
 (5, "Concebra", "BR-060/153/262/DF/GO/MG", ["31/01/2014"], 211.00, 2.50, 2.00),
 (6, "Nova Rota do Oeste", "BR-163/MT", ["12/03/2014"], 850.90, 8.07, 4.64),
 (7, "Ecovias Ponte", "BR-101/RJ", ["18/05/2015"], 13.20, 2.34, 1.55),
 (8, "Via Sul", "BR-101/290/386/448/RS", ["11/01/2019"], 472.00, 11.00, 7.96),
 (9, "Ecovias Cerrado", "BR-364/365/MG/GO", ["19/12/2019"], 437.00, 3.10, 3.81),
 (10, "Via Costeira", "BR-101/SC", ["06/07/2020"], 220.42, 4.58, 4.78),
 (11, "Ecovias Araguaia", "BR-153/080/414/TO/GO", ["29/09/2021"], 850.70, 10.62, 8.44),
 (12, "Rio SP", "BR-116/101/SP/RJ", ["28/01/2022"], 625.80, 20.12, 14.79),
 (13, "Via Brasil", "BR-163/230/MT/PA", ["01/04/2022"], 1009.52, 2.55, 1.43),
 (14, "EcoVias Rio Minas", "BR-116/465/493/RJ/MG", ["19/08/2022"], 726.90, 12.93, 11.63),
 (15, "EPR Litoral Pioneiro", "BR-153/277/369/PR e PR-092/151/239/407/408/411/508/804/855", ["30/01/2024"], 604.16, 10.78, 6.45),
 (16, "Via Araucária", "BR-277/373/376/476/PR e PR-418/423/427", ["30/01/2024"], 473.01, 7.91, 5.16),
 (17, "Via Mineira", "BR-040/MG", ["04/07/2024"], 232.10, 5.04, 3.65),
 (18, "Nova 381", "BR-381/MG", ["23/01/2025"], 303.40, 5.58, 3.76),
 (19, "Via Cristais", "BR-040/GO/MG", ["10/02/2025"], 594.80, 6.49, 5.60),
 (20, "Way-262", "BR-262/MG", ["14/02/2025"], 438.90, 4.39, 4.14),
 (21, "Rota Verde Goiás", "BR-060/452/GO", ["28/03/2025"], 426.20, 4.03, 2.84),
 (22, "EPR Iguaçu", "BR-163/277PR e PR-158/180/182/280/483", ["11/04/2025"], 662.10, 12.67, 7.44),
 (23, "PR Vias", "BR-369/373/376/PR e PR-090/170/323/445", ["14/04/2025"], 569.75, 9.87, 6.04),
 (24, "Nova 364", "BR-364/RO", ["18/07/2025"], 686.70, 6.35, 3.88),
 (25, "Motiva Pantanal (Otimização)", "BR-163/MS", ["12/03/2014", "01/08/2025"], 847.20, 9.44, 7.15),
 (26, "Ecovias Capixaba (Otimização)", "BR-101/ES/BA", ["17/04/2013", "26/08/2025"], 478.70, 7.06, 3.31),
 (27, "Nova Estrada Real", "BR-040/495/RJ/MG", ["02/10/2025"], 218.90, 5.02, 3.82),
 (28, "Rota da Celulose (rodovias delegadas ao estado de MS)", "BR-262/267/MS e MS-040/338/395", ["30/11/2025"], 870.30, 6.91, 3.19),
 (29, "Ponte Binacional São Borja/BRA - Santo Tomé/ARG", "BR-287/RS - Brasil-Argentina", ["25/11/2025"], 15.20, 0.18, 0.39),
 (30, "Rota Agro", "BR-060/364/GO/MT", ["20/11/2025"], 490.07, 4.42, 2.84),
 (31, "Via Liberdade (rodovias delegadas ao estado de MG)", "BR-356/MG e MG-262/329", [None], 190.10, 3.63, 1.95),
 (32, "Rodovias Integradas do Paraná - Lote 4", "BR-272/369/376/PR e PR-182/272/317/323/444/862/897/986", ["06/02/2026"], 627.52, 10.82, 7.37),
 (33, "Rodovias Integradas do Paraná - Lote 5", "BR-163/368/467/PR e PR-158/317/467/977/978", ["06/02/2026"], 432.77, 6.68, 5.18),
 (34, "Rota Sertaneja", "BR-153/262/GO/MG", ["20/02/2026"], 530.60, 5.53, 4.95),
 (35, "Autopista Fluminense (Otimização)", "BR-101/RJ", ["14/08/2008", "06/03/2026"], 322.10, 6.06, 4.12),
 (36, "Motiva MG/SP (Otimização)", "BR-381/MG/SP", ["14/08/2008", "11/05/2026"], 569.00, 9.50, 5.40),
 (37, "Rotas Gerais", "BR-116/251/MG", ["31/03/2026"], 734.90, 7.34, 5.82),
 (38, "Rota dos Sertões", "BR-116/324/BA/PE", ["28/05/2026"], 502.00, 6.27, 5.08),
 (39, "Autopista Régis Bittencourt (Otimização)", "BR-116/SP/PR", ["14/08/2008", "21/12/2026*"], 383.25, 7.07, 4.06),
]
P5_TOTAL = {23: 17.05}  # capex+opex printed

# ---- p97: linha -> (nome_p97, ano, leilao dd/mm, particip, vencedor, assinatura, inicio, desagio, km, capex, opex, total)
P97 = {
 16: ("Rodovias Integradas do Paraná – Lote 1", 2023, "25/08", 2, "Infraestrutura Holding XXI S.A.", "30/01/2024", "28/02/2024", 18.25, 13.07),
 15: ("Rodovias Integradas do Paraná – Lote 2", 2023, "29/09", 1, "Consórcio Infraestrutura PR", "30/01/2024", "28/02/2024", 0.08, 17.23),
 17: ("Belo Horizonte – Juiz de Fora", 2024, "11/04", 3, "Consórcio Infraestrutura MG", "04/07/2024", "06/08/2024", 11.21, 8.69),
 18: ("Governador Valadares – Belo Horizonte", 2024, "29/08", 1, "4UM Investimentos", "23/01/2025", "03/02/2025", 0.94, 9.34),
 19: ("Rota dos Cristais", 2024, "26/09", 4, "VINCI Highways S.A.S", "10/02/2025", "10/03/2025", 14.32, 12.09),
 20: ("Rota Zebu", 2024, "31/10", 2, "Rotas do Brasil S.A.", "14/02/2025", "20/03/2025", 15.30, 8.53),
 23: ("Rodovias Integradas do Paraná – Lote 3", 2024, "12/12", 3, "CCR S.A.", "14/04/2025", "08/05/2025", 26.60, 15.91),
 21: ("Rota Verde", 2024, "12/12", 4, "Consórcio Rota Verde Goiás", "28/03/2025", "28/04/2025", 18.07, 6.87),
 22: ("Rodovias Integradas do Paraná – Lote 6", 2024, "19/12", 1, "Consórcio Infraestrutura PR", "11/04/2025", "08/05/2025", 0.08, 20.11),
 24: ("Rota Agro Norte", 2025, "27/02", 1, "4UM-Opportunity", "18/07/2025", "21/08/2025", 0.05, 10.23),
 27: ("Juiz de Fora – Rio de Janeiro", 2025, "30/04", 3, "Nova Estrada Real", "02/10/2025", "01/11/2025", 14.00, 8.84),
 28: ("Rota da Celulose", 2025, "08/05", 4, "Consórcio Caminhos da Celulose", "30/11/2025", "30/12/2025", 9.00, 10.10),
 25: ("Motiva Pantanal", 2025, "22/05", 1, "Motiva Infraestrutura de Mobilidade S.A", "01/08/2025", "01/09/2025", 0.05, 16.59),
 26: ("Ecovias Capixaba", 2025, "26/06", 1, "EcoRodovias", "12/09/2025", "12/10/2025", 0.05, 10.37),
 29: ("Ponte Binacional São Borja – Santo Tomé", 2025, "16/07", 3, "CSINFRA", "25/11/2025", "02/12/2025", 0.38, 0.57),
 30: ("Rota Agro", 2025, "14/08", 5, "Way Concessões S.A.", "03/03/2026", "03/04/2026", 19.60, 7.26),
 32: ("Rodovias Integradas do Paraná – Lote 4", 2025, "23/10", 4, "Consórcio Infraestrutura PR", "06/02/2026", "09/03/2026", 21.30, 18.19),
 33: ("Rodovias Integradas do Paraná – Lote 5", 2025, "30/10", 2, "Rune Rodovias Holding II S.A. (Grupo Pátria)", "16/03/2026", "16/04/2026", 21.83, 11.86),
 34: ("Rota Sertaneja", 2025, "06/11", 4, "Way Concessões (Corretora Safra)", "03/03/2026", "03/04/2026", 24.80, 10.48),
 31: ("Via Liberdade", 2025, "18/09", 2, "Consórcio Rota da Liberdade", "20/01/2026", "20/02/2026", 13.20, 5.58),
 35: ("Autopista Fluminense", 2025, "11/11", 1, "Ateris SA (Corretora Itaú)", "06/03/2026", "06/04/2026", 0.00, 10.18),
 36: ("Autopista Fernão Dias", 2025, "11/12", 3, "Motiva Infraestrutura de Mobilidade S.A (Terra)", "11/05/2026", "11/06/2026", 17.05, 14.90),
 37: ("Rotas Gerais", 2026, "31/03", 3, "EcoRodovias Concessões e Ser. S.A. (Mirae Asset)", "03/06/2026", "03/07/2026", 19.00, 13.16),
 38: ("Rota dos Sertões", 2026, "28/05", 3, "Consórcio 116 Sertões (Galapagos)", "11/09/2026*", "11/10/2026*", 19.60, 11.35),
 39: ("Régis Bittencourt", 2026, "23/07", 3, "EPR Participações S.A.", "21/12/2026*", "21/01/2027*", 22.53, 11.13),
}
GRUPO_LIDER_P23 = {16: "PATRIA", 15: "EPR", 17: "EPR", 18: "4UM Fundo de Investimento", 19: "VINCI", 20: "Way Concessões",
    23: "Motiva", 21: "Aviva Fundo de Investimento", 22: "EPR", 24: "4UM Fundo de Investimento", 27: "Construcap; Copasa; Ohla",
    25: "Motiva", 28: "XP Infra V Fundo de Investimento", 26: "Ecorodovias", 29: "CS Infra S.A.", 30: "Way Concessões", 32: "EPR",
    33: "Pátria", 34: "Way Concessões", 31: "Construtora Metropolitana S.A.", 35: "Arteris", 36: "Motiva", 37: "Ecorodovias",
    38: "Neo Invest Latam", 39: "EPR"}
DOTS_P23 = {28: 5, 30: 6}  # where p23 dot count differs from p97

IDS = {2: "autopista-planalto-sul", 3: "transbrasiliana", 5: "concebra", 13: "via-brasil", 37: "rotas-gerais",
       38: "rota-dos-sertoes", 39: "regis-bittencourt", 21: "rota-verde-goias", 18: "nova-381", 36: "fernao-dias"}
NOME_VIG = {}

# participants p11-15: linha -> (pagina, ano_leilao, vencedor_lider, [(grupo, desagio)])
PART = {
 1: (11, 2007, "Arteris (Antiga OHL)", [("Consórcio BRVias", 47.34), ("Consórcio PR/SC", 41.53), ("Consórcio Cowan CBM", 29.26), ("Consórcio Bertin Equipav", 34.74), ("Copel", 29.19), ("Oinco", 29.04), ("CCR", 14.05), ("TPI triunfo participações", 29.15), ("Consórcio Isolux", 25.01), ("Consórcio Rodovias Brasileiras", 15.03), ("Consórcio Coparco", 21.93), ("Bolognesi", 22.04), ("Primav Ecorodovias", 11.07), ("Consórcio Alpha- Federais", 7.98), ("Consórcio AB-Vias", 5.48), ("Galvão Alusa", 28.43), ("CCR", 14.05)]),
 2: (11, 2007, "Arteris (Antiga OHL)", [("Consórcio Elo", 35.19), ("Consórcio Acciona", 27.0), ("Consórcio Rodovias Brasileiras", 26.02), ("Consórcio Via Nova", 18.72), ("Consórcio J. Malucelli", 17.0), ("Consórcio Qualivias", 12.05), ("Consórcio Bertin Equipav", 11.7), ("TPI Triunfo Participações", 10.43), ("Consórcio Coparco", 10.14)]),
 3: (11, 2007, "TPI – Triunfo Participações e Investimentos S. A. (Antigo Consórcio BRVIAS)", [("Consórcio ACCIONA", 27.74), ("Consórcio Cegems", 26.98), ("Galvão-Alusa", 18.76), ("Consórcio Bertin Equipav", 15.16), ("Consórcio Elo", 14.69), ("Consórcio Isolux", 10.09), ("Consórcio Alpha-Federais", 8.00), ("TPI triunfo participações", 5.68), ("Consórcio Flora Brasil", 5.92)]),
 4: (11, 2013, "Ecorodovias", [("Triunfo Participações e investimentos SA", 36.98), ("Consórcio Verdemar", 35.64), ("Consórcio Rodovia do Sertão", 35.54), ("Construtora Queiroz Galvão SA", 34.57), ("Consórcio Odebrecht Transport-Invepar", 23.78), ("Companhia de participações em concessões", 13.59), ("Arteris SA", 5.09)]),
 5: (11, 2013, "Triunfo Participações e Investimentos - TPI", [("INVEPAR", 42.13), ("Consórcio Via Capital", 41.19), ("Consórcio Rodovias Federais 2013", 37.99), ("Companhia de Participações em Conceções- CPC", 21.41)]),
 6: (13, 2013, "Odebrecht Transport", [("TPI trinfo participações e investimentos S/A", 46.00), ("INVEPAR", 43.09), ("Companhia de participações em concessões- CCR", 35.54), ("Consórcio integração", 31.29), ("Consórcio Rota do Futuro", 27.69), ("Galvão Engenharia S/A", 3.00)]),
 7: (13, 2015, "Ecorodovias Infraestrutura e Logística S/A", [("Consórcio Nova Guanabara", 35.23), ("Triunfo partcipações e investimentos - TPI", 25.38)]),
 8: (13, 2018, "CCR S.A", [("Consórcio Integrasul", 27.20), ("Eco Rodovias", 37.02), ("Sacyr", 27.43), ("Infraestrutura Brasil Holding II SA", 38.73)]),
 9: (13, 2019, "Ecorodovias", [("Silva & Bertoli Empreendimentos", 18.0), ("Consórcio Way - formado por construtoras que compunham a antiga MGO e pela companhia de logística GLP", 17.0)]),
 10: (13, 2020, "CCR S.A", [("Ecorodovias", 51.63), ("Consório Way", 16.0)]),
 11: (13, 2021, "Ecorodovias", [("CCR", 16.25)]),
 12: (13, 2021, "CCR S.A", [("Ecorodovias", 10.6)]),
 13: (13, 2021, "Consórcio Via Brasil BR-163 (Conasa Infraestrutura S/A, Zeta Infraestrutura S.A., Construtora Rocha Cavalcante Ltda., Engenharia de Materiais Ltda. e M4 Investimentos Ltda.)", []),
 14: (13, 2022, "Ecorodovias", [("Ecorodovias", 10.6)]),
 16: (13, 2023, "Patria", [("EPR (Equipav)", 8.30)]),
 15: (13, 2023, "EPR", []),
 17: (13, 2024, "EPR", [("EPR (Equipav)", 8.30)]),
 18: (13, 2024, "4UM Investimentos", [("Consórcio Opportunity Dinâmico FIP Multiestratégia Investimentos no Exterior", 0.1)]),
 19: (13, 2024, "Vinci", [("Consórcio Nova BR-040", 9.09), ("BTG Pactual Infraestrutura", 7.5), ("CCR S.A", 1.75)]),
 20: (13, 2024, "Way Concessões", [("BTG Pactual Infraestrutura", 15.2)]),
 23: (15, 2024, "Motiva", [("Consorcio Infraestrutura PR (Necton Investimentos)", 25.8), ("INFRA BR V Missouri Holding S.A (Terra Investimentos)", 25.20)]),
 21: (15, 2024, "Aviva Fundo de Investimento", [("BTG Pactual Infraestrutura III - Itaú", 17.97), ("Consórcio Rota Cerrado - Guide", 10.88), ("Consorcio Infraestrutura GO", 0.90)]),
 22: (15, 2024, "EPR", []),
 24: (15, 2025, "4UM Investimentos", [("EPR (Equipav)", 8.30)]),
 27: (15, 2025, "Construcap; Copasa; Ohla", [("Sacyr", 1.0), ("EPR", 3.0)]),
 25: (15, 2025, "Motiva", []),
 28: (15, 2025, "XP infra V fundo de Investimento", [("Fundos de investimentos BTG", None), ("XP e um consórcio formado por Kinea e Way", None)]),
 26: (15, 2025, "Ecorodovias", []),
 29: (15, 2025, "CS Infra S. A.", [("PLUS BYTE SRL (desclassificada)", 9.43), ("Ponta Negra (não admitida)", None)]),
 30: (15, 2025, "Way Concessões", [("WAY CONCESSÕES S.A.", None), ("EPR PARTICIPAÇÕES S.A.", None), ("CONSÓRCIO ROTA DO CERRADO", None), ("V.F GOMES PARTICIPAÇÕES LTD", None)]),
 32: (15, 2025, "EPR", [("Consórcio Infraestrutura PR", 18.52), ("Mota-Engil Latam Portugal, S.A.", 6.23), ("Motiva Infraestrutura de Mobilidade S.A.", 9.14), ("Reúne Rodovias Holding S.A.", 21.20)]),
 33: (15, 2025, "Patria", [("Reune Rodovias Holding II S.A.", 23.83), ("Way Concessões S.A.", 16.70)]),
 34: (15, 2025, "Way Concessões", [("Consórcio Rota do Cerrado", 20.36), ("Way Concessões S.A.", 24.80), ("Consórcio Caminho do Cerrado", 14.00), ("Vinci Highways do Brasil - Participações S.A.", 0.11)]),
 31: (15, 2025, "Construtora Metropolitana S. A.", [("Consórcio Rota da Liberdade", 13.20), ("Houer Consultoria e Concessões LTDA", 0.02)]),
 35: (15, 2025, "Arteris", [("Ateris S.A (Corretora Itaú)", 0.00)]),
 36: (15, 2025, "Motiva", [("Arteris S.A", 0.00), ("Motiva", 17.05), ("Infrastrutura MG", 11.25)]),
 37: (15, 2026, "Ecorodovias", [("Monte Rodovias", 0.01), ("EcoRodovias Concessões e Ser. S.A", 19.00)]),
 38: (15, 2026, "Neo Invest Latam", [("Consórcio 116 Sertões", 19.60), ("Consórcio Atlas Rodovias", 19.50)]),
 39: (15, 2026, "EPR", [("EPR PARTICIPAÇÕES S.A", 22.53), ("ARTERIS S.A.", 0.01), ("MOTIVA UNFRAESTRUTURA DE MOBILIDADE S.A.", 12.10), ("Consórcio Via dos Sertões", 13.10)]),
}
# which entry of the list is the winner (index), when the winner appears in the list itself
WIN_IDX = {34: 1, 31: 0, 35: 0, 36: 1, 37: 1, 38: 0, 39: 0, 33: 0, 32: 0, 30: 0}

# p33 optimization status for vigentes
P33 = {
 6: "Otimização contratual (Portaria 848/2023) em execução: prorrogação de 5 anos, sem relicitação (p33).",
 13: "Contrato vigente; otimização contratual (Rota Arco Norte) com edital publicado, leilão agendado para 12/11/2026 (p33, p117).",
 5: "Contrato vigente; otimização contratual do trecho Pequi (Rota do Pequi) com edital publicado, leilão agendado para 11/12/2026 (p33, p117).",
 3: "Contrato vigente; otimização contratual em estudo, status \"na ANTT\" (p33); prevista na carteira 2027.",
 2: "Contrato vigente; otimização contratual em estudo, status \"na ANTT\" (p33); prevista na carteira 2027.",
}
REL = {13: ["rota-arco-norte"], 5: ["rota-do-pequi"], 3: ["transbrasiliana-otimizacao"], 2: ["planalto-sul-otimizacao"]}
TRECHO_CID = {17: ["Belo Horizonte", "Juiz de Fora"], 18: ["Governador Valadares", "Belo Horizonte"],
              27: ["Juiz de Fora/MG", "Rio de Janeiro/RJ"], 29: ["São Borja/BRA", "Santo Tomé/ARG"]}

FICHA_KEYS = ['trecho_inicio', 'trecho_fim', 'extensao_km', 'wacc', 'empregos', 'tkm', 'carga', 'duplicacao_km', 'faixa_adicional_km', 'contorno_km', 'marginais_km', 'obras_relevantes', 'pracas_implantar', 'pracas_existentes', 'porticos', 'capex_km', 'opex_km', 'custo_duplicacao_km', 'custo_manutencao', 'fluxo_caixa_acum', 'receita_nominal', 'receita_vpl', 'cagr_trafego', 'capex_receita_vpl', 'ciclo_obras', 'garantia_proposta', 'capital_minimo', 'garantia_execucao', 'veq_dia_praca', 'capex_anual', 'data_base', 'extras']

def ficha(**kw):
    f = {k: None for k in FICHA_KEYS}
    f["extras"] = []
    ca = kw.pop("anos")
    f["capex_anual"] = [{"ano": a, "valor": v} for a, v in ca]
    f.update(kw)
    return f

# ---- fichas ----
FICHAS = {
 "rotas-gerais": dict(page=103, capex=7.34, opex=5.82, vpl=(2.97, 1.29), base="abr/2023", desagio=19.0, atual="2026-03-31",
    status="Leilão realizado", edital="2025-12-19", leilao="2026-03-31",
    f=ficha(trecho_inicio="Montes Claros/MG", trecho_fim="Gov. Valadares/MG", extensao_km=734.90, wacc=13.76, empregos=106347, tkm=0.126,
      carga="Cargas Gerais Conteinerizáveis (CGC)", duplicacao_km=186.59, faixa_adicional_km=159.88, contorno_km=16.87, marginais_km=11.41,
      obras_relevantes="196 Dispositivos e interseções (novos e remodelados); 21 passarelas; e 2 pontos de parada e descanso",
      pracas_implantar=9, pracas_existentes=0, porticos=0, capex_km=9.99, opex_km=7.91, custo_duplicacao_km=9.48, custo_manutencao=0.07,
      fluxo_caixa_acum=12.21, receita_nominal=35.92, receita_vpl=6.07, cagr_trafego=1.71, capex_receita_vpl=49, ciclo_obras="3º ano ao 10º ano",
      garantia_proposta=61.00, capital_minimo=307.00, garantia_execucao=303.33, veq_dia_praca=21859, data_base="abr/2023",
      anos=[(3, 734.16), (4, 626.21), (5, 793.51), (6, 624.30), (7, 531.51), (8, 589.97), (9, 465.28), (10, 624.74)])),
 "rota-dos-sertoes": dict(page=105, capex=4.13, opex=4.40, vpl=(1.90, 1.11), base="mar/2023", desagio=19.6, atual="2026-04-14",
    status="Leilão realizado", edital="2026-02-13", leilao="2026-05-28",
    f=ficha(trecho_inicio="Feira de Santana/BA", trecho_fim="Salgueiro/PE", extensao_km=502.0, wacc=12.49, empregos=59838, tkm=0.095,
      carga="Cargas Gerais Conteinerizáveis (CGC)", duplicacao_km=94.21, faixa_adicional_km=5.16, contorno_km=7.11, marginais_km=44.52,
      obras_relevantes="68 dispositivos e interserções (novos e remodelados), 12 passarelas de pedestres (novas) e 1 Ponto de Parada e Descanso",
      pracas_implantar=5, pracas_existentes=0, porticos=0, capex_km=8.23, opex_km=8.76, custo_duplicacao_km=6.82, custo_manutencao=0.06,
      fluxo_caixa_acum=6.28, receita_nominal=20.62, receita_vpl=4.18, cagr_trafego=2.50, capex_receita_vpl=45, ciclo_obras="3º ano ao 8º ano",
      garantia_proposta=42.00, capital_minimo=234.00, garantia_execucao=209.00, veq_dia_praca=23509, data_base="mar/2023",
      anos=[(3, 388.79), (4, 563.08), (5, 657.11), (6, 565.30), (7, 207.61), (8, 164.83)])),
 "regis-bittencourt": dict(page=107, capex=7.07, opex=4.06, vpl=(4.21, 1.81), base="abr/2023", desagio=22.53, atual="2026-04-16",
    status="Leilão realizado", edital="2026-04-14", leilao="2026-07-23",
    f=ficha(trecho_inicio="Curitiba/PR", trecho_fim="São Paulo/SP", extensao_km=383.25, wacc=11.41, empregos=102435, tkm=0.059,
      carga="Cargas Gerais (CG); Granéis Líquido (GL)", faixa_adicional_km=68.91, marginais_km=32.80,
      obras_relevantes="18 passarelas, 13 melhorias de interseção, 2 melhorias de acesso, 14 pontos de ônibus, 32,8 km de ciclovias, 116 caixas de produtos perigosos, 19 passagens de fauna, 4 macrodrenagem, 91,4 km de iluminação em serra e 27 correções de traçado.",
      capex_km=18.49, opex_km=10.63, custo_duplicacao_km=None, custo_manutencao=0.14,
      fluxo_caixa_acum=3.16, receita_nominal=18.16, receita_vpl=7.92, cagr_trafego=1.63, capex_receita_vpl=53, ciclo_obras="1º ano ao 9º ano",
      garantia_proposta=79.25, capital_minimo=270.05, garantia_execucao=396.0, veq_dia_praca=29075, data_base="abr/2023",
      extras=[{"rotulo": "Macrodrenagem", "valor": "4 unid."}, {"rotulo": "Iluminação em Serra", "valor": "91,4 km"},
              {"rotulo": "Correções de Traçado", "valor": "27,38 km"}, {"rotulo": "Dispositivos", "valor": "8"},
              {"rotulo": "Túnel", "valor": "2 unid."}, {"rotulo": "Custos duplicação (milhões/km)", "valor": "-"},
              {"rotulo": "Garantia da Proposta (texto original)", "valor": "R$ 79,25,00 milhões"},
              {"rotulo": "Valor consensuado de saída, a ser pago ao grupo controlador atual, pelo vencedor do Processo Competitivo", "valor": "R$ 120 milhões"}],
      anos=[(1, 932.46), (2, 773.82), (3, 768.39), (4, 912.17), (5, 936.97), (6, 568.01), (7, 453.64), (8, 372.40), (9, 271.67)])),
 "rota-arco-norte": dict(page=109, capex=10.42, opex=4.72, vpl=(4.71, 1.64), base="dez/2024", desagio=None, atual="2026-07-17",
    status="Leilão agendado", edital="2025-07-17", leilao="2026-11-12",
    f=ficha(trecho_inicio="Sinop/MT", trecho_fim="Miritituba/PA", extensao_km=1010.0, wacc=12.65, empregos=150914, tkm=0.0940,
      carga="Cargas Gerais (CG); Carga Agrícola e Pecuária (CAP)", duplicacao_km=245.8, faixa_adicional_km=116.7, contorno_km=None, marginais_km=30.64,
      obras_relevantes="Acesso aos Portos de Santarenzinho (19,73 km) e de Itapacura (14,75 km), 15 Rotatórias Alongadas, 2 Remoções de Pontes de Madeira, 23 Viadutos e Pontes, 5 Passarelas, 5 Diamantes, 4 Trombetas, 187 Acessos e 20 Pontos de Ônibus.",
      pracas_implantar=None, pracas_existentes=3, porticos=None, capex_km=12.33, opex_km=5.58, custo_duplicacao_km=5.93, custo_manutencao=0.090,
      fluxo_caixa_acum=7.12, receita_nominal=29.74, receita_vpl=8.82, cagr_trafego=3.38, capex_receita_vpl=53, ciclo_obras="1º ano ao 9º ano",
      garantia_proposta=88.00, capital_minimo=28.44, garantia_execucao=441.00, veq_dia_praca=9128, data_base="dez/2024",
      extras=[{"rotulo": "Contorno", "valor": "-"}, {"rotulo": "Praças a implantar", "valor": "-"}, {"rotulo": "Pórticos a implantar", "valor": "-"}],
      anos=[(1, 656.51), (2, 854.14), (3, 911.21), (4, 845.48), (5, 795.13), (6, 687.44), (7, 802.58), (8, 784.59), (9, 809.19)])),
 "rota-do-pequi": dict(page=111, capex=4.14, opex=3.46, vpl=(2.02, 0.91), base="jul/2023", desagio=None, atual="2025-09-26",
    status="Leilão agendado", edital="2026-09-02", leilao="2026-12-11",
    f=ficha(trecho_inicio="Hidrolândia/GO", trecho_fim="Brasília/DF", extensao_km=211.6, wacc=12.33, empregos=59983, tkm=0.117,
      carga="Cargas Gerais Conteinerizáveis (CGC)", duplicacao_km=0.0, faixa_adicional_km=52.9, contorno_km=43.52, marginais_km=12.08,
      obras_relevantes="5 Trombetas, 10 Diamantes, 1 Trevo Completo, 1 Parclo, 10 Passagens Inferiores, 3 Retornos em X, 9 Retornos em U, 1 Rotatória Alongada, 13 Passarelas, 81 Acessos, 112 Pontos de Ônibus e 5 Passagens de Fauna.",
      pracas_implantar=0, pracas_existentes=2, porticos=0, capex_km=19.56, opex_km=16.34, custo_duplicacao_km=None, custo_manutencao=0.050,
      fluxo_caixa_acum=5.60, receita_nominal=18.52, receita_vpl=4.13, cagr_trafego=1.86, capex_receita_vpl=49, ciclo_obras="1º ano ao 6º ano",
      garantia_proposta=None, capital_minimo=None, garantia_execucao=None, veq_dia_praca=37385, data_base="jul/2023",
      extras=[{"rotulo": "Custos duplicação (milhões/km)", "valor": "-"}, {"rotulo": "Garantia da Proposta", "valor": "-"},
              {"rotulo": "Capital Social Mínimo Obrigatório", "valor": "-"}, {"rotulo": "Garantia de Execução do Contrato", "valor": "-"}],
      anos=[(1, 243.68), (2, 140.12), (3, 503.93), (4, 895.55), (5, 741.12), (6, 375.55)])),
 "rota-agro-central": dict(page=113, capex=6.13, opex=4.29, vpl=(2.82, 1.18), base="jan/2025", desagio=None, atual="2025-09-03",
    status="Leilão agendado", edital="2026-09-04", leilao="2026-12-17",
    f=ficha(trecho_inicio="Vilhena/RO", trecho_fim="Cuiabá/MT", extensao_km=888.0, wacc=11.07, empregos=89919, tkm=0.1576,
      carga="Granéis Sólidos Agrícolas (GSA)", duplicacao_km=22.80, faixa_adicional_km=162.90, contorno_km=None, marginais_km=12.37,
      obras_relevantes="58 dispositivos e interseções (novos e remodelados) 8 passarelas de pedestres (novas), 20 travessias em nível e 2 Ponto de Parada e Descanso",
      pracas_implantar=0, pracas_existentes=7, porticos=0, capex_km=6.91, opex_km=4.84, custo_duplicacao_km=13.71, custo_manutencao=0.05,
      fluxo_caixa_acum=6.84, receita_nominal=23.78, receita_vpl=5.56, cagr_trafego=1.42, capex_receita_vpl=51, ciclo_obras="3º ano ao 8º ano",
      garantia_proposta=55.0, capital_minimo=419.0, garantia_execucao=274.0, veq_dia_praca=None, data_base="jan/2025",
      extras=[{"rotulo": "WACC", "valor": "Atualizado quando publicado o edital"}, {"rotulo": "Contorno", "valor": "-"}, {"rotulo": "VEQ/dia/praça", "valor": "-"}],
      anos=[(3, 595.66), (4, 638.99), (5, 511.25), (6, 669.94), (7, 840.68), (8, 209.39)])),
 "rota-2-de-julho": dict(page=115, capex=14.0, opex=10.68, vpl=(6.57, 2.64), base="out/2024", desagio=None, atual="2025-11-14",
    status="Leilão agendado", edital="2026-09-04", leilao="2026-12-18",
    f=ficha(trecho_inicio="Salvador", trecho_fim="Divisa BA/MG", extensao_km=653.30, wacc=12.33, empregos=202842, tkm=0.0840,
      carga="Carga Agrícola, Pecuária, Industrial e Petroquímico", duplicacao_km=307.75, faixa_adicional_km=257.46, contorno_km=0.0, marginais_km=37.22,
      obras_relevantes="52 passarelas de pedestres (novas e remodeladas); e 3 pontos de parada e descanso",
      pracas_implantar=0, pracas_existentes=7, porticos=14, capex_km=21.43, opex_km=16.35, custo_duplicacao_km=6.45, custo_manutencao=0.17,
      fluxo_caixa_acum=24.52, receita_nominal=67.76, receita_vpl=13.20, cagr_trafego=2.14, capex_receita_vpl=50, ciclo_obras="3º ano ao 8º ano",
      garantia_proposta=132.0, capital_minimo=773.0, garantia_execucao=660.0, veq_dia_praca=42606, data_base="out/2024",
      extras=[{"rotulo": "Trecho (texto original)", "valor": "Salvador - Feira de Santana - Divisa BA/MG"}],
      anos=[(3, 2080.24), (4, 1969.05), (5, 1893.49), (6, 1221.27), (7, 799.04), (8, 988.46)])),
}
CRONO = {
 "rotas-gerais": [("Edital", "2025-12-19"), ("Leilão", "2026-03-31")],
 "rota-dos-sertoes": [("TCU", "2025"), ("Edital", "2026-02-13"), ("Leilão", "2026-05-28")],
 "regis-bittencourt": [("Consulta Pública", "2025"), ("Edital", "2026-04-14"), ("Leilão", "2026-07-23")],
 "rota-arco-norte": [("Edital", "2026-07-17"), ("Leilão", "2026-11-12")],
 "rota-do-pequi": [("Edital", "2026-09-02"), ("Leilão", "2026-12-11")],
 "rota-agro-central": [("TCU", "2025"), ("Edital", "2026-09-04"), ("Leilão", "2026-12-17")],
 "rota-2-de-julho": [("Audiência Pública", "2025"), ("TCU", "2026-01-30"), ("Edital", "2026-09-04"), ("Leilão", "2026-12-18")],
}
ESTRUT = {"rotas-gerais": "BNDES", "rota-dos-sertoes": "BNDES", "regis-bittencourt": "Otimização", "rota-arco-norte": "Otimização",
          "rota-do-pequi": "Otimização", "rota-agro-central": "BNDES", "rota-2-de-julho": "Infra S.A."}

TOP_KEYS = ['id', 'nome', 'nome_contrato', 'brs', 'ufs', 'trecho_texto', 'trecho_cidades', 'estado', 'ano_programa', 'tipo', 'estruturador', 'grupo_vencedor', 'km', 'capex', 'opex', 'data_base', 'capex_ficha', 'opex_ficha', 'data_base_ficha', 'capex_vpl', 'opex_vpl', 'leilao', 'edital', 'assinatura', 'assinatura_aditivo', 'inicio_operacao', 'participantes', 'participantes_lista', 'desagio', 'status_texto', 'atualizado_em', 'ficha', 'cronograma', 'fontes', 'divergencias', 'notas_base', 'relaciona', 'linha_p5']

def blank():
    e = {k: None for k in TOP_KEYS}
    e.update(fontes={}, divergencias=[], notas_base=[], relaciona=[], cronograma=[])
    return e

def div(e, campo, exibido, alts, nota):
    e["divergencias"].append({"campo": campo, "exibido": exibido, "alternativas": [{"valor": v, "pagina": p} for v, p in alts], "nota": nota})

def apply_ficha(e, fid):
    F = FICHAS[fid]; pg = F["page"]
    e["ficha"] = F["f"]
    e["capex_ficha"], e["opex_ficha"], e["data_base_ficha"] = F["capex"], F["opex"], F["base"]
    e["capex_vpl"], e["opex_vpl"] = F["vpl"]
    e["atualizado_em"] = F["atual"]
    e["edital"] = F["edital"]
    e["cronograma"] = [{"marco": m, "data": dt} for m, dt in CRONO[fid]]
    e["estruturador"] = ESTRUT[fid]
    t = e["trecho_cidades"] = [F["f"]["trecho_inicio"], F["f"]["trecho_fim"]]
    for k in ("capex_ficha", "opex_ficha", "capex_vpl", "opex_vpl", "atualizado_em", "edital"):
        e["fontes"][k] = pg
    e["fontes"]["cronograma"] = 117
    for k, v in F["f"].items():
        if k in ("capex_anual",) and v:
            e["fontes"]["ficha.capex_anual"] = pg
        elif isinstance(v, (int, float)) and not isinstance(v, bool):
            e["fontes"]["ficha." + k] = pg
    # leilao check
    if e.get("leilao") and e["leilao"] != F["leilao"]:
        div(e, "leilao", e["leilao"], [(F["leilao"], pg)], "Data do leilão difere entre p97 e a ficha.")
    # capex_anual sum check
    s = round(sum(x["valor"] for x in F["f"]["capex_anual"]), 2)
    if abs(s / 1000 - F["capex"]) / F["capex"] > 0.02:
        anos = [x["ano"] for x in F["f"]["capex_anual"]]
        div(e, "ficha.capex_anual", round(s / 1000, 4), [(F["capex"], pg)],
            f"O quadro de CAPEX anual (p{pg}) mostra só os anos {anos[0]}º a {anos[-1]}º; Σ = R$ {s:.2f} mi (R$ {s/1000:.2f} bi) ≠ CAPEX da ficha R$ {F['capex']:.2f} bi.")
    # desagio check
    if F["desagio"] is not None and e.get("desagio") is not None and abs(F["desagio"] - e["desagio"]) > 0.005:
        div(e, "desagio", e["desagio"], [(F["desagio"], pg)], "Deságio difere entre p97 e ficha.")
    # km check
    if e.get("km") is not None and abs(F["f"]["extensao_km"] - e["km"]) > 0.005:
        div(e, "km", e["km"], [(F["f"]["extensao_km"], pg)], "Extensão difere entre tabela e ficha.")
    return F

ents = []
for (ln, nome5, trecho, ass, km, capex, opex) in T:
    e = blank()
    pg5 = 3 if ln <= 20 else 5
    brs, ufs = parse_brs_ufs(trecho)
    e.update(nome_contrato=re.sub(r"\s*\((Otimização|rodovias delegadas.*)\)$", "", nome5), trecho_texto=trecho, brs=brs, ufs=ufs,
             km=km, capex=capex, opex=opex, data_base="dez/2024", linha_p5=ln)
    e["trecho_cidades"] = TRECHO_CID.get(ln)
    for k in ("km", "capex", "opex", "linha_p5"):
        e["fontes"][k] = pg5
    otm = "(Otimização)" in nome5
    e["tipo"] = "otimizacao" if otm else ("delegada" if ln in (28, 31) else "nova")
    notes = []
    if ln in P97:
        nm, ano, lei, npart, venc, ass97, ini, des, tot = P97[ln]
        e["nome"] = nm
        e.update(estado="programa", ano_programa=ano, leilao=d(f"{lei}/{ano}"), participantes=npart, grupo_vencedor=venc,
                 inicio_operacao=d(ini), desagio=des)
        for k in ("ano_programa", "leilao", "participantes", "grupo_vencedor", "inicio_operacao", "desagio"):
            e["fontes"][k] = 97
        # p97 values check vs table
        if ln in P5_TOTAL:
            div(e, "capex+opex", round(capex + opex, 2), [(P5_TOTAL[ln], pg5)],
                "Total capex+opex impresso na p5 = 17,05; capex 9,87 + opex 6,04 = 15,91, igual ao total da p97.")
        elif abs(round(capex + opex, 2) - tot) > 0.011:
            div(e, "capex+opex", round(capex + opex, 2), [(tot, 97)], "Total capex+opex da p97 difere da soma da tabela p3/p5.")
        if otm:
            e["assinatura"] = d(ass[0]); e["fontes"]["assinatura"] = pg5
            e["assinatura_aditivo"] = d(ass97); e["fontes"]["assinatura_aditivo"] = 97
            if d(ass[1]) != d(ass97):
                div(e, "assinatura_aditivo", d(ass97), [(d(ass[1]), pg5)], f"Data do termo aditivo: {ass97} (p97) × {ass[1]} (p{pg5}).")
        else:
            e["assinatura"] = d(ass97); e["fontes"]["assinatura"] = 97
            if d(ass[0]) != d(ass97):
                alt = d(ass[0]) if ass[0] else "-"
                nota = f"Assinatura: {ass97} (p97) × {ass[0] or '-'} (p{pg5})."
                if ln in (37, 38):
                    nota += " A data da p5 coincide com a data do leilão."
                div(e, "assinatura", d(ass97), [(alt, pg5)], nota)
        if "*" in ass97 or "*" in ini:
            notes.append(f"Assinatura ({ass97.replace('*','')}) e início da operação ({ini.replace('*','')}) são previsões (p97, \"* Previsão\").")
        notes.insert(0, f"Leilão realizado em {lei}/{ano} (p97); grupo líder: {GRUPO_LIDER_P23[ln]} (p23).")
        if ln in DOTS_P23:
            div(e, "participantes", npart, [(DOTS_P23[ln], 23)], f"p97 informa {npart} participantes; o gráfico de bolinhas da p23 mostra {DOTS_P23[ln]}.")
    else:
        e["nome"] = NOME_VIG.get(ln, nome5)
        e["estado"] = "vigente"
        e["assinatura"] = d(ass[0]); e["fontes"]["assinatura"] = pg5
        if len(ass) > 1:
            e["assinatura_aditivo"] = d(ass[1]); e["fontes"]["assinatura_aditivo"] = pg5
        if ln in P33:
            notes.append(P33[ln])
        else:
            notes.append("Contrato vigente.")
    # optimization rows: if p97 handled; Régis forecast
    if ln == 39:
        notes.append("Assinatura do termo aditivo \"21/12/2026*\" na p5 também é previsão.")
    # ids
    e["id"] = IDS.get(ln) or slug(e["nome"])
    # participants
    if ln in PART:
        pg, anol, lider, lst = PART[ln]
        pl = []
        wi = WIN_IDX.get(ln)
        if wi is None:
            pl.append({"grupo": lider if ln not in P97 else f"{P97[ln][4]} ({lider})", "desagio": P97[ln][7] if ln in P97 else None, "vencedor": True})
        for i, (g, ds) in enumerate(lst):
            pl.append({"grupo": g, "desagio": ds, "vencedor": i == wi})
        e["participantes_lista"] = pl
        e["fontes"]["participantes_lista"] = pg
        if ln not in P97:
            e["grupo_vencedor"] = lider; e["fontes"]["grupo_vencedor"] = pg
            notes.append(f"Leilão de {anol} (p{pg}).")
        elif anol != P97[ln][1]:
            pass
        if ln in P97:
            # count check
            if len(pl) > P97[ln][3]:
                div(e, "participantes_lista", P97[ln][3], [(len(pl), pg)], f"p{pg} lista {len(pl)} proponentes (incluindo o vencedor); p97 informa {P97[ln][3]} participantes.")
            if wi is not None and lst[wi][1] is not None and abs(lst[wi][1] - P97[ln][7]) > 0.005:
                div(e, "desagio", P97[ln][7], [(lst[wi][1], pg)], f"Deságio do vencedor: {P97[ln][7]:.2f}% (p97) × {lst[wi][1]:.2f}% (p{pg}).".replace(".", ","))
    e["relaciona"] = REL.get(ln, [])
    e["status_texto"] = " ".join(notes)
    ents.append(e)

byid = {e["id"]: e for e in ents}

# ---- specific divergences ----
lote5 = next(e for e in ents if e["linha_p5"] == 33)
div(lote5, "brs", ["163", "368", "467"], [(["158", "163", "369", "467"], 23)], "p5: BR-163/368/467/PR e PR-158/317/467/977/978; p23: BR-158/163/369/467 e PR-317.")
fd = byid["fernao-dias"]
div(fd, "ufs", ["MG", "SP"], [(["MG"], 23)], "p5: BR-381/MG/SP; p23 e p15: BR-381/MG.")
eco = next(e for e in ents if e["linha_p5"] == 26)
div(eco, "km", 478.70, [(475.9, 33), (480.20, 33)], "Tabela de otimizações da p33 informa 475,9 km; o mapa da mesma página, 480,20 km.")
nro = next(e for e in ents if e["linha_p5"] == 6)
div(nro, "km", 850.90, [(850, 33), (858.90, 33)], "p33: 850 km na tabela e 858,90 km no mapa.")
flu = next(e for e in ents if e["linha_p5"] == 35)
div(flu, "km", 322.10, [(320.10, 33)], "Mapa da p33 informa 320,10 km (tabela da p33: 322,1).")
# Régis: p15 lists 4; Agro Norte/GV lists > count handled automatically
# Rota Agro: p15 lists winner + 3; p97 5; p23 6 dots (handled)

# ---- apply fichas to programa rows ----
for fid in ("rotas-gerais", "rota-dos-sertoes", "regis-bittencourt"):
    e = byid[fid]
    F = apply_ficha(e, fid)
    pg = F["page"]
    if F["base"] != "dez/2024":
        e["notas_base"] += [{"campo": "capex", "valor": F["capex"], "data_base": F["base"], "pagina": pg},
                            {"campo": "opex", "valor": F["opex"], "data_base": F["base"], "pagina": pg},
                            {"campo": "capex_vpl", "valor": F["vpl"][0], "data_base": F["base"], "pagina": pg},
                            {"campo": "opex_vpl", "valor": F["vpl"][1], "data_base": F["base"], "pagina": pg}]
byid["regis-bittencourt"]["nome"] = "Régis Bittencourt"
byid["regis-bittencourt"]["status_texto"] += " Otimização contratual do contrato de 2008 (Arteris); inclui valor consensuado de saída de R$ 120 milhões ao grupo controlador atual (p107)."
byid["rotas-gerais"]["nome"] = "Rotas Gerais"

# ---- agendados ----
AG = [
 ("rota-arco-norte", "Rota Arco Norte", "BR-163/MT/PA", ["163"], ["MT", "PA"], "otimizacao", ["via-brasil"],
  "Leilão agendado para 12/11/2026 (p109, p117). Otimização contratual do contrato de concessão da BR-163/MT/PA (Via Brasil); na p33, \"Edital publicado\"."),
 ("rota-do-pequi", "Rota do Pequi", "BR-060/153/DF/GO", ["060", "153"], ["DF", "GO"], "otimizacao", ["concebra"],
  "Leilão agendado para 11/12/2026 (p111, p117). Otimização contratual da concessão da BR-060/153/DF/GO (Concebra – Trecho Pequi, p33: \"Edital publicado\")."),
 ("rota-agro-central", "Rota Agro Central", "BR-070/174/364/MT/RO", ["070", "174", "364"], ["MT", "RO"], "nova", [],
  "Leilão agendado para 17/12/2026 (p113, p117)."),
 ("rota-2-de-julho", "Rota 2 de Julho", "BR-116/324/BA", ["116", "324"], ["BA"], "nova", [],
  "Leilão agendado para 18/12/2026 (p115, p117). Nova concessão decorrente do encerramento da ViaBahia (contrato vigente encerrado; p33), que não consta entre os 39 contratos das pp. 3–5."),
]
for fid, nome, trecho, brs, ufs, tipo, rel, st in AG:
    e = blank()
    e.update(id=fid, nome=nome, trecho_texto=trecho, brs=brs, ufs=ufs, estado="agendado2026", ano_programa=2026, tipo=tipo, relaciona=rel, status_texto=st)
    F = FICHAS[fid]; pg = F["page"]
    e.update(km=F["f"]["extensao_km"], capex=F["capex"], opex=F["opex"], data_base=F["base"], leilao=F["leilao"])
    for k in ("km", "capex", "opex", "leilao"):
        e["fontes"][k] = pg
    e["fontes"]["ano_programa"] = 117
    apply_ficha(e, fid)
    ents.append(e)
byid = {e["id"]: e for e in ents}

an = byid["rota-arco-norte"]
div(an, "edital", "2025-07-17", [("2026-07-17", 117)], "A ficha (p109) informa edital em 17/07/2025, com leilão em 12/11/2026; o cronograma da p117 coloca o edital em 17/07 de 2026. Provável erro de digitação na ficha; mantido como está.")
div(an, "km", 1010.0, [(1009.52, 33), (1009.00, 33)], "p33: 1.009,52 km (tabela; mesmo valor do contrato Via Brasil na p3) e 1.009,00 km (mapa).")
div(an, "capex+opex", round(10.42 + 4.72, 2), [(15.44, 33)], "Ficha: capex 10,42 + opex 4,72 = 15,14 (dez/2024); tabela de otimizações da p33: 15,44 (data-base não informada na p33).")
pq = byid["rota-do-pequi"]
pq["notas_base"].append({"campo": "capex+opex", "valor": 7.67, "data_base": "não informada (p33)", "pagina": 33})
r2 = byid["rota-2-de-julho"]
div(r2, "km", 653.30, [(653, 33), (663.00, 33)], "p33: 653 km na tabela e 663,00 km no mapa.")

json.dump(ents, open(OUT, "w"), ensure_ascii=False, indent=2)
print("wrote", len(ents))
