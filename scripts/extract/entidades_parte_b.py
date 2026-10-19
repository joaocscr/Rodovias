import json

OUT = "/home/user/Rodovias/data/roadshow/"

def C(*items):
    return [{"marco": m, "data": d} for m, d in items]

# Common cronograma notes: "Até 2025" column stored as year "2025".
S = [
 dict(id="rota-integracao-do-sul", nome="Rota Integração do Sul", brs=["116","158","290","392"], ufs=["RS"], p=131,
      trecho="Camaquã - Porto Alegre - Cruz Alta - Sta. Maria - Santana da Boa Vista", cid=["Camaquã","Santana da Boa Vista"],
      estr="BNDES", km=674.10, capex=6.50, opex=4.01, cvpl=3.24, ovpl=1.08, db="jan/2025", leilao="2027-06", edital="2027-03",
      status="Audiência Pública", atual="2026-06-15", tipo="nova",
      f=dict(wacc=11.23, empregos=94176, tkm=0.135, carga="Cargas Gerais Conteinerizáveis (CGC)", duplicacao_km=None, faixa_adicional_km=225.00,
             contorno_km=None, marginais_km=27.43, obras_relevantes="71 dispostivos e interseções (novos e remodelados); 8 passarelas de pedestres (novas); e 1 Ponto de Parada e Descanso",
             pracas_implantar=0, pracas_existentes=0, porticos=None, capex_km=9.64, opex_km=5.95, custo_duplicacao_km=None, custo_manutencao=0.08,
             fluxo_caixa_acum=8.78, receita_nominal=27.05, receita_vpl=6.12, cagr_trafego=1.80, capex_receita_vpl=53, ciclo_obras="3º ano ao 8º ano",
             garantia_proposta=61.00, capital_minimo=426.12, garantia_execucao=306.00, veq_dia_praca=16846,
             extras=[{"rotulo":"Pórticos a implantar","valor":"A definir"}]),
      anual={3:978.64,4:679.68,5:747.64,6:415.94,7:303.68,8:302.62},
      cron=C(("TCU","2025"),("Edital","2027-03"),("Leilão","2027-06"))),
 dict(id="rota-portuaria-do-sul", nome="Rota Portuária do Sul", brs=["116","392"], ufs=["RS"], p=133,
      trecho="Pelotas - Santa Maria", cid=["Pelotas","Santa Maria"],
      estr="INFRA S.A.", km=456.20, capex=6.08, opex=5.73, cvpl=2.51, ovpl=1.39, db="jan/2025", leilao="2027-06", edital="2027-03",
      status="Audiência Pública", atual="2026-02-27", tipo="nova",
      f=dict(wacc=12.49, empregos=88091, tkm=0.1007, carga="Cargas Gerais Conteinerizáveis (CGC)", duplicacao_km=81.21, faixa_adicional_km=0,
             contorno_km=0, marginais_km=38.58, obras_relevantes="64 dispostivos e interseções (novos e remodelados); 39 passarelas de pedestres (novas e remodeladas); e 2 ponto de Parada e Descanso.",
             pracas_implantar=0, pracas_existentes=0, porticos=5, capex_km=13.23, opex_km=12.46, custo_duplicacao_km=5.16, custo_manutencao=0.15,
             fluxo_caixa_acum=10.61, receita_nominal=34.44, receita_vpl=6.42, cagr_trafego=2.86, capex_receita_vpl=39, ciclo_obras="3º ano ao 7º ano",
             garantia_proposta=64, capital_minimo=412, garantia_execucao=321, veq_dia_praca=10264, extras=[]),
      anual={3:659.53,4:683.18,5:600.90,6:633.77,7:529.48},
      cron=C(("AP","2025"),("TCU","2025"),("Edital","2027-03"),("Leilão","2027-06"))),
 dict(id="rota-vale-do-itajai", nome="Rota Vale do Itajaí", brs=["153","282","470"], ufs=["SC"], p=135,
      trecho="BR-153/282/470/SC", cid=None, alt_nome="Rodovias Integradas de Santa Catarina - Lote 01",
      estr="INFRA S.A.", km=515.16, capex=6.40, opex=6.71, cvpl=2.87, ovpl=1.62, db="jul/2024", leilao="2027-07", edital="2027-04",
      status="Audiência Pública", atual="2026-06-02", tipo="nova",
      f=dict(wacc=12.33, empregos=92728, tkm=0.097, carga="Cargas Gerais Conteinerizáveis (CGC)", duplicacao_km=50.81, faixa_adicional_km=102.60,
             contorno_km=None, marginais_km=78.81, obras_relevantes="111 dispositivos e interseções, 29 passarelas de pedestres (novas e remodeladas) e 2 pontos de parada e descanso para motoristas profissionais",
             pracas_implantar=0, pracas_existentes=0, porticos=13, capex_km=12.41, opex_km=13.01, custo_duplicacao_km=6.55, custo_manutencao=0.12,
             fluxo_caixa_acum=11.61, receita_nominal=33.63, receita_vpl=6.26, cagr_trafego=1.71, capex_receita_vpl=46, ciclo_obras="3º ano ao 8º ano",
             garantia_proposta=63, capital_minimo=473, garantia_execucao=337, veq_dia_praca=10304,
             extras=[{"rotulo":"Subtítulo","valor":"Malha Catarinense - Lote 01"}]),
      anual={3:482.82,4:533.91,5:595.79,6:730.53,7:558.18,8:599.44},
      cron=C(("AP","2025"),("TCU","2025"),("Edital","2027-04"),("Leilão","2027-07"))),
 dict(id="rota-meio-oeste", nome="Rota Meio Oeste Catarinense", brs=["153","282","480"], ufs=["SC"], p=137,
      trecho="BR-153/282/480/SC", cid=None, alt_nome="Rodovias Integradas de Santa Catarina - Lote 03",
      estr="INFRA S.A.", km=166.0, capex=2.71, opex=3.04, cvpl=1.35, ovpl=0.84, db="jul/2024", leilao="2027-07", edital="2027-04",
      status="Audiência Pública", atual="2026-04-07", tipo="nova",
      f=dict(wacc=11.07, empregos=39264, tkm=0.099, carga="Cargas Gerais Conteinerizáveis (CGC)", duplicacao_km=29.36, faixa_adicional_km=31.51,
             contorno_km=None, marginais_km=24.21, obras_relevantes="53 dispostivos e interseções (novos e remodelados); 15 passarelas de pedestre; e 1 Ponto de Parada e Descanso",
             pracas_implantar=0, pracas_existentes=0, porticos=5, capex_km=16.33, opex_km=18.29, custo_duplicacao_km=5.08, custo_manutencao=0.15,
             fluxo_caixa_acum=4.67, receita_nominal=14.05, receita_vpl=3.00, cagr_trafego=3.23, capex_receita_vpl=45, ciclo_obras="3º ano ao 7º ano",
             garantia_proposta=30, capital_minimo=282, garantia_execucao=162, veq_dia_praca=8526,
             extras=[{"rotulo":"Subtítulo","valor":"Malha Catarinense - Lote 03"}]),
      anual={3:291.50,4:334.17,5:329.15,6:305.83,7:244.17},
      cron=C(("AP","2025"),("TCU","2025"),("Edital","2027-04"),("Leilão","2027-07"))),
 dict(id="rota-vale-do-cafe", nome="Rota Vale do Café", brs=["393"], ufs=["RJ"], p=139,
      trecho="Barra Mansa/RJ - Além Paraíba/MG", cid=["Barra Mansa/RJ","Além Paraíba/MG"],
      estr="INFRA S.A.", km=204.7, capex=3.22, opex=2.98, cvpl=1.75, ovpl=0.75, db="abr/2024", leilao="2027-09", edital="2027-06",
      status="Estudo aprovado pelo MT, em vias de abertura de AP", atual="2026-09-21", tipo="nova",
      f=dict(wacc=11.07, empregos=46654, tkm=0.163, carga="Cargas Gerais Conteinerizáveis (CGC)", duplicacao_km=15.02, faixa_adicional_km=6.23,
             contorno_km=18.89, marginais_km=2.91, obras_relevantes="71 dispostivos e interseções (novos e remodelados) 6 passarelas de pedestres (novas e remodeladas), e 1 ponto de Parada e Descanso.",
             pracas_implantar=0, pracas_existentes=None, porticos=6, capex_km=15.74, opex_km=13.10, custo_duplicacao_km=11.49, custo_manutencao=0.12,
             fluxo_caixa_acum=4.83, receita_nominal=14.48, receita_vpl=3.51, cagr_trafego=1.00, capex_receita_vpl=50, ciclo_obras="2º ano ao 5º ano",
             garantia_proposta=35.13, capital_minimo=238.65, garantia_execucao=178.83, veq_dia_praca=25210,
             extras=[{"rotulo":"WACC","valor":"Atualizado quando publicado o edital"}]),
      anual={3:107.71,4:611.00,5:735.14,6:533.01},
      cron=C(("AP","2025"),("TCU","2027-01"),("Edital","2027-06"),("Leilão","2027-09"))),
 dict(id="transbrasiliana-otimizacao", nome="Rodovia Transbrasiliana", brs=["153"], ufs=["SP"], p=141,
      trecho="Icém/SP - Ourinhos/SP", cid=["Icém/SP","Ourinhos/SP"],
      estr=None, km=321.6, capex=3.56, opex=4.35, cvpl=1.72, ovpl=1.67, db="jan/2022", leilao="2027-10", edital="2027-07",
      status="Depende de acordo entre as partes e aprovação do TCU", atual="2025-09-08", tipo="otimizacao", rel=["transbrasiliana"],
      f=dict(wacc=9.21, empregos=51609, tkm=0.180, carga="Cargas Gerais Conteinerizáveis (CGC)", duplicacao_km=182.7, faixa_adicional_km=23.73,
             contorno_km=0, marginais_km=40.84, obras_relevantes="4 OAE, 3 Acessos e 11 Interseções, 2 PPD",
             pracas_implantar=None, pracas_existentes=None, porticos=None, capex_km=11.08, opex_km=13.52, custo_duplicacao_km=5.03, custo_manutencao=0.05,
             fluxo_caixa_acum=1.74, receita_nominal=11.58, receita_vpl=4.27, cagr_trafego=1.53, capex_receita_vpl=40.2, ciclo_obras=None,
             garantia_proposta=None, capital_minimo=None, garantia_execucao=208, veq_dia_praca=17290,
             extras=[{"rotulo":"Obs.","valor":"Ficha em revisão"},{"rotulo":"Tipo","valor":"OTIMIZAÇÃO CONTRATUAL do contrato de concessão da BR-153/SP"}]),
      anual={1:356.22,2:300.72,3:283.90,4:141.60,5:164.39,6:97.54,7:79.27,8:122.30,9:97.46,10:205.76},
      cron=C(("TCU","2025"),("Edital","2027-07"),("Leilão","2027-10"))),
 dict(id="rota-portuaria-itaqui", nome="Rota Portuária Itaqui", brs=["135","316"], ufs=["MA"], p=143,
      trecho="São Luis - Teresina", cid=["São Luís","Teresina"],
      estr="INFRA S.A.", km=441.29, capex=6.25, opex=4.70, cvpl=2.82, ovpl=1.15, db="abr/2025", leilao="2027-10", edital="2027-07",
      status="Em estudo", atual="2026-09-29", tipo="nova",
      f=dict(wacc=12.49, empregos=90554, tkm=0.114, carga="Cargas Gerais Conteinerizáveis (CGC)", duplicacao_km=138.19, faixa_adicional_km=31.55,
             contorno_km=0, marginais_km=1.93, obras_relevantes="177 dispositivos e interseções (novos e remodelados), 38 passarelas (novas e remodeladas) e 2 pontos de parada e descanso",
             pracas_implantar=0, pracas_existentes=0, porticos=11, capex_km=14.16, opex_km=10.65, custo_duplicacao_km=4.82, custo_manutencao=0.14,
             fluxo_caixa_acum=10.00, receita_nominal=28.60, receita_vpl=5.68, cagr_trafego=2.40, capex_receita_vpl=50, ciclo_obras="3º ao 7º ano",
             garantia_proposta=57, capital_minimo=298, garantia_execucao=306, veq_dia_praca=29213, extras=[]),
      anual={1:308.91,2:505.34,3:740.30,4:672.73,5:637.54,6:658.92,7:384.20,8:142.10,9:121.99,10:136.54},
      cron=C(("AP","2025"),("TCU","2027-02"),("Edital","2027-07"),("Leilão","2027-10"))),
 dict(id="rota-norte-catarinense", nome="Rota Norte Catarinense", brs=["280"], ufs=["SC"], p=145,
      trecho="Joinville - Mafra/SC", cid=["Joinville","Mafra/SC"], alt_nome="Rodovias Integradas de Santa Catarina - Lote 02",
      estr="INFRA S.A.", km=170.5, capex=3.26, opex=3.38, cvpl=1.46, ovpl=0.83, db="jul/2024", leilao="2027-11", edital="2026-08",
      status="Em Estudo", atual="2026-03-16", tipo="nova",
      f=dict(wacc=12.33, empregos=47223, tkm=0.186, carga="Cargas Gerais Conteinerizáveis (CGC)", duplicacao_km=48.72, faixa_adicional_km=75.31,
             contorno_km=12.73, marginais_km=11.15, obras_relevantes="36 dispositivos e interseções (novos e remodelados), 20 passarelas (novas e remodeladas) e 1 ponto de parada e descanso",
             pracas_implantar=None, pracas_existentes=None, porticos=5, capex_km=19.11, opex_km=19.84, custo_duplicacao_km=6.07, custo_manutencao=0.15,
             fluxo_caixa_acum=5.37, receita_nominal=16.19, receita_vpl=3.09, cagr_trafego=2.62, capex_receita_vpl=47, ciclo_obras="4º ao 8º ano",
             garantia_proposta=30.85, capital_minimo=197.38, garantia_execucao=154, veq_dia_praca=23695,
             extras=[{"rotulo":"Subtítulo","valor":"Malha Catarinense - Lote 02"}]),
      anual={4:559.25,5:265.56,6:336.64,7:304.24,8:485.16},
      cron=C(("AP","2025"),("TCU","2027-03"),("Edital","2027-08"),("Leilão","2027-11"))),
 dict(id="planalto-sul-otimizacao", nome="Rota Planalto Sul", brs=["116"], ufs=["PR","SC"], p=147,
      trecho="Curitiba/PR - Div. SC/RS", cid=["Curitiba/PR","Div. SC/RS"],
      estr=None, km=412.7, capex=4.15, opex=4.45, cvpl=1.94, ovpl=1.43, db="mar/2023", leilao="2027-11", edital="2027-08",
      status="Depende de acordo entre as partes e aprovação do TCU", atual="2025-09-08", tipo="otimizacao", rel=["autopista-planalto-sul"],
      f=dict(wacc=10.61, empregos=60143, tkm=0.113, carga="Cargas Gerais (CG)", duplicacao_km=12.5, faixa_adicional_km=13.2,
             contorno_km=0, marginais_km=23.6, obras_relevantes="9 Retornos em Desnível; 5 Passarelas; 2 Balanças; 1 Ponto de Parada e Descanso",
             pracas_implantar=None, pracas_existentes=None, porticos=None, capex_km=10.06, opex_km=11.01, custo_duplicacao_km=6.98, custo_manutencao=0.07,
             fluxo_caixa_acum=2.59, receita_nominal=14.40, receita_vpl=4.40, cagr_trafego=4.99, capex_receita_vpl=44.1, ciclo_obras="1º ano ao 15º ano",
             garantia_proposta=None, capital_minimo=None, garantia_execucao=None, veq_dia_praca=18594,
             extras=[{"rotulo":"Obs.","valor":"Ficha em revisão"},{"rotulo":"Tipo","valor":"OTIMIZAÇÃO CONTRATUAL do contrato de concessão da BR-116/PR/SC"}]),
      anual={1:135.22,2:317.61,3:437.57,4:443.4,5:418.18,6:222.07,7:144.93,8:100.70,9:116.33,10:159.72},
      cron=C(("TCU","2025"),("Edital","2027-08"),("Leilão","2027-11"))),
 dict(id="rota-do-acu", nome="Rota do Açu", brs=["356"], ufs=["MG","RJ"], p=149,
      trecho="Muriaé/MG - São João da Barra/RJ", cid=["Muriaé/MG","São João da Barra/RJ"],
      estr="INFRA S.A.", km=306.33, capex=2.10, opex=1.95, cvpl=0.92, ovpl=0.21, db="abr/2026", leilao="2027-12", edital="2027-09",
      status="Em estudo", atual="2026-10-01", tipo="nova",
      f=dict(wacc=11.07, empregos=30426, tkm=0.173, carga="Cargas Gerais Conteinerizáveis (CGC)", duplicacao_km=None, faixa_adicional_km=None,
             contorno_km=None, marginais_km=None, obras_relevantes="Melhoria em 224 km de acostamentos, 41 travessias em nível, 6 correção de traçado, Iluminação em 46,55 km e 12 passagens de fauna.",
             pracas_implantar=None, pracas_existentes=None, porticos=5, capex_km=6.86, opex_km=6.37, custo_duplicacao_km=None, custo_manutencao=None,
             fluxo_caixa_acum=None, receita_nominal=None, receita_vpl=None, cagr_trafego=None, capex_receita_vpl=None, ciclo_obras=None,
             garantia_proposta=None, capital_minimo=75, garantia_execucao=None, veq_dia_praca=None,
             extras=[{"rotulo":"Obs.","valor":"Ficha em revisão"}]),
      anual=None,
      cron=C(("AP","2027-01"),("TCU","2027-04"),("Edital","2027-09"),("Leilão","2027-12"))),
 dict(id="rota-centro-sul-baiano", nome="Rota Centro-Sul Baiano", brs=["101"], ufs=["BA"], p=151,
      trecho="Feira de Santana - div. BA/MG", cid=["Feira de Santana","div. BA/MG"],
      estr="INFRA S.A.", km=783.23, capex=9.35, opex=5.79, cvpl=3.50, ovpl=1.33, db="ago/2025", leilao="2027-12", edital="2027-09",
      status="Em estudo", atual="2026-10-08", tipo="nova",
      f=dict(wacc=12.65, empregos=113157, tkm=None, carga="Cargas Gerais Conteinerizáveis (CGC)", duplicacao_km=75.20, faixa_adicional_km=139.97,
             contorno_km=None, marginais_km=None, obras_relevantes="9 passagens de fauna e 35 correções de traçado, 4 PPD",
             pracas_implantar=None, pracas_existentes=None, porticos=18, capex_km=9.97, opex_km=6.78, custo_duplicacao_km=None, custo_manutencao=None,
             fluxo_caixa_acum=None, receita_nominal=None, receita_vpl=None, cagr_trafego=None, capex_receita_vpl=None, ciclo_obras=None,
             garantia_proposta=None, capital_minimo=375, garantia_execucao=None, veq_dia_praca=None,
             extras=[{"rotulo":"Obs.","valor":"Ficha em revisão"}]),
      anual=None,
      cron=C(("AP","2027-02"),("TCU","2027-04"),("Edital","2027-09"),("Leilão","2027-12"))),
]

# km in the p127 map summary
KM127 = {"rota-integracao-do-sul":674.10,"rota-portuaria-do-sul":456.20,"rota-vale-do-itajai":515.16,"rota-meio-oeste":166.0,
         "rota-vale-do-cafe":204.7,"transbrasiliana-otimizacao":321.6,"rota-portuaria-itaqui":441.29,"rota-norte-catarinense":170.5,
         "planalto-sul-otimizacao":412.7,"rota-do-acu":306.33,"rota-centro-sul-baiano":783.6}

FICHA_KEYS = ["trecho_inicio","trecho_fim","extensao_km","wacc","empregos","tkm","carga","duplicacao_km","faixa_adicional_km","contorno_km",
  "marginais_km","obras_relevantes","pracas_implantar","pracas_existentes","porticos","capex_km","opex_km","custo_duplicacao_km",
  "custo_manutencao","fluxo_caixa_acum","receita_nominal","receita_vpl","cagr_trafego","capex_receita_vpl","ciclo_obras",
  "garantia_proposta","capital_minimo","garantia_execucao","veq_dia_praca","capex_anual","data_base","extras"]

ents = []
for s in S:
    p = s["p"]
    f = dict(s["f"])
    f["trecho_inicio"] = s["cid"][0] if s["cid"] else None
    f["trecho_fim"] = s["cid"][1] if s["cid"] else None
    f["extensao_km"] = s["km"]
    f["capex_anual"] = [{"ano": a, "valor": v} for a, v in sorted(s["anual"].items())] if s["anual"] else None
    f["data_base"] = s["db"]
    ficha = {k: f.get(k) for k in FICHA_KEYS}
    assert set(f) <= set(FICHA_KEYS), set(f) - set(FICHA_KEYS)

    fontes = {}
    for k in ["km","capex","opex","capex_ficha","opex_ficha","capex_vpl","opex_vpl"]:
        fontes[k] = p
    for k, v in ficha.items():
        if isinstance(v, (int, float)) and not isinstance(v, bool):
            fontes["ficha." + k] = p
        elif k == "capex_anual" and v:
            fontes["ficha.capex_anual"] = p
    fontes["leilao"] = p
    fontes["edital"] = p
    fontes["cronograma"] = 153

    div = []
    if abs(KM127[s["id"]] - s["km"]) > 1e-9:
        div.append({"campo":"km","exibido":s["km"],"alternativas":[{"valor":KM127[s["id"]],"pagina":127}],
                    "nota":"Extensão da ficha (p%d) difere da do mapa da Carteira 2027 (p127)." % p})
    if s["anual"]:
        tot = sum(s["anual"].values())
        if abs(tot/1000 - s["capex"]) / s["capex"] > 0.02:
            anos = sorted(s["anual"])
            nota = ("O gráfico de CAPEX anual (p%d) mostra só os anos %dº a %dº; Σ = R$ %.2f mi (R$ %.2f bi) ≠ CAPEX da ficha R$ %.2f bi."
                    % (p, anos[0], anos[-1], tot, tot/1000, s["capex"]))
            if s["id"] == "rota-vale-do-cafe":
                nota += " Além disso, o ciclo de obras declarado é 2º ao 5º ano, mas o gráfico vai do 3º ao 6º ano."
            div.append({"campo":"ficha.capex_anual","exibido":round(tot/1000, 4),"alternativas":[{"valor":s["capex"],"pagina":p}],"nota":nota})
    if s.get("alt_nome"):
        div.append({"campo":"nome","exibido":s["nome"],"alternativas":[{"valor":s["alt_nome"],"pagina":127}],
                    "nota":"O mapa da p127 usa o nome do lote; a ficha (p%d) e o cronograma (p153) usam o nome da rota." % p})
    if s["id"] == "rota-norte-catarinense":
        div.append({"campo":"edital","exibido":"2026-08","alternativas":[{"valor":"2027-08","pagina":153}],
                    "nota":"A ficha (p145) traz edital \"Agosto/2026\" com leilão em novembro/2027; o cronograma (p153) põe o edital em agosto/2027. Provável erro de digitação; mantido como impresso."})
    if s["id"] == "rota-do-acu":
        div.append({"campo":"ufs","exibido":["MG","RJ"],"alternativas":[{"valor":["RJ"],"pagina":127}],
                    "nota":"Título da ficha (p149) e cronograma (p153): BR-356/MG/RJ; mapa da p127: BR-356/RJ. O trecho começa em Muriaé/MG."})
    if s["id"] == "rota-vale-do-cafe":
        div.append({"campo":"ufs","exibido":["RJ"],"alternativas":[{"valor":["RJ","MG"],"pagina":139}],
                    "nota":"Título BR-393/RJ, mas o trecho termina em Além Paraíba/MG (p139)."})
    e = {
        "id": s["id"], "nome": s["nome"], "nome_contrato": None, "brs": s["brs"], "ufs": s["ufs"],
        "trecho_texto": s["trecho"], "trecho_cidades": s["cid"], "estado": "projeto2027", "ano_programa": 2027,
        "tipo": s["tipo"], "estruturador": s["estr"], "grupo_vencedor": None,
        "km": s["km"], "capex": s["capex"], "opex": s["opex"], "data_base": s["db"],
        "capex_ficha": s["capex"], "opex_ficha": s["opex"], "data_base_ficha": s["db"],
        "capex_vpl": s["cvpl"], "opex_vpl": s["ovpl"],
        "leilao": s["leilao"], "edital": s["edital"], "assinatura": None, "assinatura_aditivo": None, "inicio_operacao": None,
        "participantes": None, "participantes_lista": None, "desagio": None,
        "status_texto": s["status"], "atualizado_em": s["atual"], "ficha": ficha, "cronograma": s["cron"],
        "fontes": fontes, "divergencias": div, "notas_base": [], "relaciona": s.get("rel", []), "linha_p5": None,
    }
    ents.append(e)

json.dump(ents, open(OUT + "_parte_b.json", "w", encoding="utf-8"), ensure_ascii=False, indent=2)

EST_POSS = [(["319"],["AM"]),(["070","158"],["MT"]),(["020","242"],["BA","DF","GO","TO"])]
EST = [(["155","158"],["MT","PA"]),(["364"],["MT"]),(["235"],["MA","TO"]),(["262"],["MG","ES"]),(["282"],["SC"]),
       (["285"],["RS"]),(["367"],["MG"]),(["392"],["RS"]),(["438","486"],["RS","SC"]),(["040"],["DF","GO"]),
       (["020"],["CE"]),(["222"],["CE"]),(["101","235"],["BA","SE"]),(["101"],["SE","AL","PE"]),(["232"],["PE"]),
       (["101","230"],["PB","PE"]),(["101","304","116"],["PB","RN","CE"]),(["010"],["MA","PA"]),(["135"],["MA"]),
       (["153"],["PA","TO"]),(["226"],["PI","MA","TO"]),(["104"],["PB","PE","AL"]),(["116"],["PB","CE","PE"]),(["423"],["PE","AL"])]
est = [{"brs":b,"ufs":u,"possivel_2027":True,"pagina":121} for b,u in EST_POSS] + \
      [{"brs":b,"ufs":u,"possivel_2027":False,"pagina":121} for b,u in EST]
json.dump(est, open(OUT + "estudos_pos2027.json", "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print("ok")
