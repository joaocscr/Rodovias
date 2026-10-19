import json, statistics
out = "/home/user/Rodovias/data/roadshow/mercado.json"

# p7: leilões por ano
lpa = {1993:3,1994:2,1995:0,1996:0,1997:1,2007:7,2008:0,2009:1,2010:0,2011:0,2012:1,2013:5,2014:1,2015:1,
       2016:0,2017:0,2018:1,2019:1,2020:1,2021:3,2022:1,2023:2,2024:7,2025:13,2026:7,2027:11,2028:9,2029:8,2030:8}
for y in range(1998,2007): lpa[y]=0
assert sum(v for y,v in lpa.items() if y<=2022)==29
leiloes = [{"ano":y,"n":lpa[y],"previsto":y>=2026} for y in sorted(lpa)]

# p97 table: (leilao, ano, n, desagio)
p97 = [
 ("Rodovias Integradas do Paraná - Lote 1",2023,2,18.25),
 ("Rodovias Integradas do Paraná - Lote 2",2023,1,0.08),
 ("Belo Horizonte - Juiz de Fora",2024,3,11.21),
 ("Governador Valadares - Belo Horizonte",2024,1,0.94),
 ("Rota dos Cristais",2024,4,14.32),
 ("Rota Zebu",2024,2,15.30),
 ("Rodovias Integradas do Paraná - Lote 3",2024,3,26.60),
 ("Rota Verde",2024,4,18.07),
 ("Rodovias Integradas do Paraná - Lote 6",2024,1,0.08),
 ("Rota Agro Norte",2025,1,0.05),
 ("Juiz de Fora/MG - Rio de Janeiro/RJ",2025,3,14.00),
 ("Rota da Celulose (delegação a MS)",2025,4,9.00),
 ("Otimização Motiva Pantanal",2025,1,0.05),
 ("Otimização Ecovias Capixaba",2025,1,0.05),
 ("Ponte Binacional São Borja/BRA a Santo Tomé/ARG",2025,3,0.38),
 ("Rota Agro",2025,5,19.60),
 ("Rodovias Integradas do Paraná - Lote 4",2025,4,21.30),
 ("Rodovias Integradas do Paraná - Lote 5",2025,2,21.83),
 ("Rota Sertaneja",2025,4,24.80),
 ("Via Liberdade (delegação a MG)",2025,2,13.20),
 ("Otimização Autopista Fluminense",2025,1,0.00),
 ("Otimização Autopista Fernão Dias",2025,3,17.05),
 ("Rota Gerais",2026,3,19.00),
 ("Rota dos Sertões",2026,3,19.60),
 ("Otimização Autopista Régis Bittencourt",2026,3,22.53),
]
conc = [{"leilao":l,"ano":a,"n":n,"desagio":d} for l,a,n,d in p97]

def o(*pairs): return [{"grupo":g,"desagio":d} for g,d in pairs]
N=None
part = [
 (2007,"Transbrasiliana","TPI – Triunfo Participações e Investimentos S.A. (antigo Consórcio BRVias)",N,o(
   ("Consórcio Acciona",27.74),("Consórcio Cegems",26.98),("Galvão-Alusa",18.76),("Consórcio Bertin Equipav",15.16),("Consórcio Elo",14.69),
   ("Consórcio Isolux",10.09),("Consórcio Alpha-Federais",8.00),("TPI Triunfo Participações",5.68),("Consórcio Flora Brasil",5.92))),
 (2007,"Autopista Régis Bittencourt","Arteris (antiga OHL)",N,o(
   ("Consórcio BR Vias",42.27),("Consórcio Oicn",30.8),("Consórcio Cowan CBM",30.05),("TPI Triunfo Participações",27.33),("Galvão-Alusa",26.59),
   ("Consórcio Bertin Equipav",25.92),("CCR",20.52),("Primav Ecorodovias",20.33),("Consórcio Isolux",20.14),("CRB Consórcio Rodovias Brasileiras",16.01),
   ("Consórcio AB-Vias",6.85),("Consórcio Qualivias",6.55))),
 (2007,"Autopista Fluminense","Arteris (antiga OHL)",N,o(
   ("Consórcio Acciona",29.0),("Consórcio AB Vias",25.99),("Consórcio Qualivias",15.53),("Consórcio AB Vias",25.99),
   ("Consórcio Bertin Equipav",15.08),("Consórcio Isolux",3.39),("TPI Triunfo Participações",17.59),("Consórcio Ivaí",0.0))),
 (2007,"Autopista Litoral Sul","Arteris (antiga OHL)",N,o(
   ("Consórcio BRVias",47.34),("Consórcio PR/SC",41.53),("Consórcio Cowan CBM",29.26),("Consórcio Bertin Equipav",34.74),("Copel",29.19),
   ("Oinco",29.04),("CCR",14.05),("Consórcio Rodovias Brasileiras",15.03),("Consórcio Coparco",21.93),("Bolognesi",22.04),
   ("Primav Ecorodovias",11.07),("Consórcio Alpha-Federais",7.98),("Consórcio AB-Vias",5.48),("Galvão-Alusa",28.43),("CCR",14.05))),
 (2007,"Autopista Planalto Sul","Arteris (antiga OHL)",N,o(
   ("TPI Triunfo Participações",29.15),("Consórcio Isolux",25.01),("Consórcio Elo",35.19),("Consórcio Acciona",27.0),
   ("Consórcio Rodovias Brasileiras",26.02),("Consórcio Via Nova",18.72),("Consórcio J. Malucelli",17.0),("Consórcio Qualivias",12.05),
   ("Consórcio Bertin Equipav",11.7),("TPI Triunfo Participações",10.43),("Consórcio Coparco",10.14))),
 (2007,"Autopista Fernão Dias","Arteris (antiga OHL)",N,o(
   ("Consórcio BRVias",60.12),("Consórcio Acciona",53.13),("Oiicno",42.16),("Consórcio Flora Brasil Torc",37.89),("Consórcio Bertin Equipav",34.29),
   ("Consórcio Qualivias",24.2),("CCR",22.01),("TPI Triunfo Participações",21.94),("Consórcio Isolux",20.0),("Consórcio Rodovias Brasil",17.23),
   ("Consórcio Cegems",17.12),("Consórcio Cowan CBM",16.12),("Consórcio AB-Vias",13.0),("Consórcio Rodovias Brasileiras",3.01))),
 (2007,"Rodovia do Aço","K-Infra (antigo Consórcio Acciona)",N,o(
   ("Consórcio Bertin Equipav",4.60),("TPI Triunfo Participações e Investimentos",2.00))),
 (2009,"Via Bahia","Consórcio RodoBahia",N,o(("Consórcio Cia Brasileira de Rodovias",2.52))),
 (2012,"ECO101","Ecorodovias e SBS Engenharia e Construções",N,o(
   ("Consórcio Rodovia Capixaba",42.08),("TPI Triunfo Participações",36.68),("Consórcio Via Espírito Santo BR-101",N),
   ("Consórcio Odebrecht Transport - Invepar",28.10),("Consórcio Integração Sudeste",17.31),("Obrascon Huarte Lain Brasil S.A.",15.82),("Consórcio Itaúna",10.24))),
 (2013,"ECO050","Ecorodovias",N,o(
   ("Triunfo Participações e Investimentos S.A.",36.98),("Consórcio Verdemar",35.64),("Consórcio Rodovia do Sertão",35.54),
   ("Construtora Queiroz Galvão S.A.",34.57),("Consórcio Odebrecht Transport-Invepar",23.78),("Companhia de Participações em Concessões",13.59),("Arteris S.A.",5.09))),
 (2013,"CONCEBRA","Triunfo Participações e Investimentos - TPI",N,o(
   ("Invepar",42.13),("Consórcio Via Capital",41.19),("Consórcio Rodovias Federais 2013",37.99),("Companhia de Participações em Concessões - CPC",21.41))),
 (2013,"MS Via","Companhia de Participações em Concessões - CPC",N,o(
   ("Consórcio Rota do Futuro",44.17),("Consórcio Queiroz Galvão Infraestrutura",41.11),("Invepar",31.00),
   ("Odebrecht Transport S/A",8.50),("Triunfo Participações e Investimentos S/A",2.99))),
 (2013,"Via 040","Invepar",N,o(
   ("Consórcio Via Capital",44.63),("Contern Construções e Comércio Ltda",42.90),("Consórcio Integração",29.29),("Consórcio Caminho Novo",23.99),
   ("Companhia de Participações em Concessões - CCR",15.22),("TPI Triunfo Participações e Investimentos S/A",9.98),("Consórcio Queiroz Galvão Infraestrutura",4.99))),
 (2013,"Rota do Oeste","Odebrecht Transport",N,o(
   ("TPI Triunfo Participações e Investimentos S/A",46.00),("Invepar",43.09),("Companhia de Participações em Concessões - CCR",35.54),
   ("Consórcio Integração",31.29),("Consórcio Rota do Futuro",27.69),("Galvão Engenharia S/A",3.00))),
 (2015,"EcoPonte","Ecorodovias Infraestrutura e Logística S/A",N,o(
   ("Consórcio Nova Guanabara",35.23),("Triunfo Participações e Investimentos - TPI",25.38))),
 (2018,"BR-101/290/386/448/RS","CCR S.A.",N,o(
   ("Consórcio Integrasul",27.20),("Eco Rodovias",37.02),("Sacyr",27.43),("Infraestrutura Brasil Holding II S.A.",38.73))),
 (2019,"BR-364/365/MG/GO","Ecorodovias",N,o(
   ("Silva & Bertoli Empreendimentos",18.0),("Consórcio Way (construtoras da antiga MGO e GLP)",17.0))),
 (2020,"BR-101/SC","CCR S.A.",N,o(("Ecorodovias",51.63),("Consórcio Way",16.0))),
 (2021,"BR-101/116/SP/RJ","CCR S.A.",N,o(("Ecorodovias",10.6))),
 (2021,"BR-163/230/MT/PA","Consórcio Via Brasil BR-163 (Conasa Infraestrutura S/A, Zeta Infraestrutura S.A., Construtora Rocha Cavalcante Ltda., Engenharia de Materiais Ltda. e M4 Investimentos Ltda.)",N,[]),
 (2021,"BR-153/080/414/GO/TO","Ecorodovias",N,o(("CCR",16.25))),
 (2022,"BR-116/493/465/RJ/MG","Ecorodovias",N,o(("Ecorodovias",10.6))),
 (2023,"Lote 1 - BR-277/373/376/476/PR e PR-418/423/427","Pátria",18.25,o(("EPR (Equipav)",8.30))),
 (2023,"Lote 2 - BR-153/277/369/PR e PR-092/151/239/407/408/411/508/804/855","EPR",0.08,[]),
 (2024,"BR-040/MG","EPR",11.21,o(("EPR (Equipav)",8.30))),
 (2024,"BR-381/MG","4UM Investimentos",0.94,o(("Consórcio Opportunity Dinâmico FIP Multiestratégia Investimentos no Exterior",0.1))),
 (2024,"BR-040/GO/MG","Vinci",14.32,o(("Consórcio Nova BR-040",9.09),("BTG Pactual Infraestrutura",7.5),("CCR S.A.",1.75))),
 (2024,"BR-262/MG","Way Concessões",15.30,o(("BTG Pactual Infraestrutura",15.2))),
 (2024,"Lote 3 - BR-369/373/376/PR e PR-090/170/323/445","Motiva",26.60,o(
   ("Consórcio Infraestrutura PR (Necton Investimentos)",25.8),("INFRA BR V Missouri Holding S.A. (Terra Investimentos)",25.20))),
 (2024,"CN 1 - BR-060/452/GO","Aviva Fundo de Investimento",18.07,o(
   ("BTG Pactual Infraestrutura III - Itaú",17.97),("Consórcio Rota Cerrado - Guide",10.88),("Consórcio Infraestrutura GO",0.90))),
 (2024,"Lote 6 - BR-163/277/PR e PR-158/180/182/280/483","EPR",0.08,[]),
 (2025,"BR-364/RO - Rota Agro Norte","4UM Investimentos",0.05,o(("EPR (Equipav)",8.30))),
 (2025,"BR-040/495/RJ/MG","Construcap; Copasa; Ohla",14.00,o(("Sacyr",1.0),("EPR",3.0))),
 (2025,"BR-163/MS - MSVIA Otimização","Motiva",0.05,[]),
 (2025,"BR-262/267/MS e MS-040/338/395 - Rota da Celulose","XP Infra V Fundo de Investimento",9.00,o(
   ("Fundos de investimentos BTG",N),("XP e um consórcio formado por Kinea e Way",N))),
 (2025,"BR-101/ES/BA Otimização ECO101","Ecorodovias",0.05,[]),
 (2025,"Ponte Internacional São Borja - São Tomé","CS Infra S.A.",0.38,o(
   ("PLUS BYTE SRL (desclassificada)",9.43),("Ponta Negra (não admitida)",N))),
 (2025,"Rota Agro BR-060/364/GO/MT","Way Concessões",19.60,o(
   ("EPR Participações S.A.",N),("Consórcio Rota do Cerrado",N),("V.F Gomes Participações Ltda",N))),
 (2025,"Rodovias Integradas do Paraná - Lote 4","EPR",21.30,o(
   ("Consórcio Infraestrutura PR",18.52),("Mota-Engil Latam Portugal, S.A.",6.23),("Motiva Infraestrutura de Mobilidade S.A.",9.14),("Reúne Rodovias Holding S.A.",21.20))),
 (2025,"Rodovias Integradas do Paraná - Lote 5","Pátria",21.83,o(
   ("Reune Rodovias Holding II S.A.",23.83),("Way Concessões S.A.",16.70))),
 (2025,"Rota Sertaneja","Way Concessões",24.80,o(
   ("Consórcio Rota do Cerrado",20.36),("Consórcio Caminho do Cerrado",14.00),("Vinci Highways do Brasil - Participações S.A.",0.11))),
 (2025,"Via Liberdade - BR-356/MG, MG-262/329","Construtora Metropolitana S.A.",13.20,o(
   ("Houer Consultoria e Concessões Ltda",0.02))),
 (2025,"BR-101/RJ - Otimização Autopista Fluminense","Arteris",0.00,[]),
 (2025,"Fernão Dias - BR-381/MG - Otimização","Motiva",17.05,o(("Arteris S.A.",0.00),("Infraestrutura MG",11.25))),
 (2026,"Rota Gerais - BR-116/251/MG","Ecorodovias",19.00,o(("Monte Rodovias",0.01))),
 (2026,"BR-116/324/BA/PE - Rota dos Sertões","Neo Invest Latam",19.60,o(("Consórcio Atlas Rodovias",19.50))),
 (2026,"BR-116/PR/SP - Otimização Régis Bittencourt","EPR",22.53,o(
   ("Arteris S.A.",0.01),("Motiva Infraestrutura de Mobilidade S.A.",12.10),("Consórcio Via dos Sertões",13.10))),
]
participantes=[{"ano":a,"lote":l,"vencedor":v,"desagio_vencedor":d,"outros":ot} for a,l,v,d,ot in part]

faixas=[{"faixa":"≥18%","n":10},{"faixa":"10% a <18%","n":6},{"faixa":">0% e <10%","n":6},{"faixa":"0%","n":3}]
por_n=[{"concorrentes":5,"leiloes":1,"pct_total":4.0,"desagio_medio":19.70},
       {"concorrentes":4,"leiloes":5,"pct_total":20.0,"desagio_medio":17.30},
       {"concorrentes":3,"leiloes":8,"pct_total":32.0,"desagio_medio":18.47},
       {"concorrentes":2,"leiloes":4,"pct_total":16.0,"desagio_medio":17.65},
       {"concorrentes":1,"leiloes":7,"pct_total":28.0,"desagio_medio":0.18}]

grupos=[{"grupo":g,"n_concessoes":n,"km":k,"pct_km":p,"capex":c,"opex":op,"capex_opex":t} for g,n,k,p,c,op,t in [
 ("EcoRodovias",7,3675.20,19.15,50.22,38.87,89.09),("Motiva",6,3304.17,17.21,66.14,47.65,113.79),
 ("EPR",5,2509.13,13.07,45.67,31.23,76.90),("Way Concessões",3,1459.56,7.60,14.67,12.20,26.87),
 ("Arteris",3,1140.70,5.94,14.63,12.86,27.49),("Conasa",1,1009.52,5.26,2.55,1.43,3.98),
 ("4UM Fundo de Investimento",2,990.10,5.16,12.73,8.16,20.89),("Pátria",2,905.78,4.72,16.03,11.29,27.32),
 ("XP Infra V Fundo de Investimento",1,870.30,4.53,6.91,3.19,10.10),("MT Participações e Projetos SA - MTPAR",1,850.90,4.43,8.07,4.64,12.71),
 ("VINCI",1,594.80,3.10,6.86,5.91,12.77),("Outros 6 grupos",7,1884.90,9.82,24.82,18.90,43.72)]]

dd={2011:(59341,4629,63970,7.2),2012:(60091,4629,64720,7.2),2013:(60291,4629,64920,7.11),2014:(61165,5105,66270,7.7),
 2015:(55537,9353,64890,14.4),2016:(55497,9353,64850,14.4),2017:(56257,9353,65610,14.3),2018:(56138,9232,65370,14.1),
 2019:(56278,9232,65510,14.1),2020:(54316,9704,64020,15.2),2021:(55369,10361,65730,15.8),2022:(54096,13022,66120,17.0),
 2023:(51926,14107,66030,21.4),2024:(50566,15954,66520,24.0),2025:(47991,18620,66610,27.9),2026:(45960,20651,66610,31.0)}
gestao=[{"ano":y,"direta_km":a,"privada_km":b,"total_km":t,"pct_concedido":p} for y,(a,b,t,p) in dd.items()]

priv={2003:1.18,2004:1.48,2005:1.56,2006:1.6,2007:1.61,2008:3.01,2009:6.48,2010:5.26,2011:5.57,2012:5.98,2013:6.47,2014:12.05,
 2015:9.91,2016:8.27,2017:7.79,2018:6.95,2019:7.64,2020:6.23,2021:7.02,2022:9.19,2023:11.38,2024:13.57,2025:19.15,2026:32.59,
 2027:44.17,2028:47.87,2029:54.5}
pub={2010:27,2011:21.6,2012:16.7,2013:15.4,2014:15.7,2015:9.5,2016:12.9,2017:11.2,2018:10.2,2019:8.6,2020:8.5,2021:6.8,2022:7,
 2023:20.4,2024:18.4,2025:18.4,2026:18.4,2027:18.4,2028:18.4,2029:18.4}
investimentos=[{"ano":y,"publico":pub.get(y),"privado":priv[y],"previsto":y>=2023} for y in sorted(priv)]

ind=[("Extensão total dos 40 leilões",19416,"km"),("Ampliação de capacidade (duplicação + faixa adicional + contornos)",8518,"km"),
 ("Duplicação",4374,"km"),("Faixa adicional",3702,"km"),("Contornos",442,"km"),("Marginais",959,"km"),
 ("PPDs (pontos de parada e descanso)",68,"unidades"),("Dispositivos em nível",662,"unidades"),("Dispositivos em desnível",2389,"unidades"),
 ("Passarelas",797,"unidades"),("Infraestrutura resiliente",9.89,"R$ bi"),("CFTVs",11976,"unidades"),("Ambulâncias",395,"unidades"),
 ("Guinchos",373,"unidades"),("Empregos (diretos, indiretos e efeito-renda)",4.5,"milhões"),("Cobertura WiFi e 4G",19416,"km"),
 ("ISSQN (arrecadação para estados e municípios)",38,"R$ bi"),("Municípios beneficiados",616,"municípios"),
 ("Investimentos totais",400,"R$ bi"),("Malha com ampliação de capacidade",47,"%"),("Dispositivos (nível + desnível + passarelas): 1 a cada",5,"km"),
 ("PPD: 1 a cada",299,"km"),("CFTV: 1 a cada",1.6,"km"),("Ambulância: 1 a cada",49,"km"),("Guincho: 1 a cada",52,"km"),
 ("Infraestrutura resiliente por km",0.51,"R$ mi/km"),("ISSQN por km",1.96,"R$ mi/km")]
indicadores=[{"rotulo":r,"valor":v,"unidade":u} for r,v,u in ind]

diag=[{"ano":2022,"contratos":24,"km":13022,"valor":198,"invest_executado_acum":129},
      {"ano":2026,"contratos":41,"km":20739,"valor":489,"invest_executado_acum":170},
      {"ano":2027,"contratos":50,"km":24459,"valor":575,"invest_executado_acum":195},
      {"ano":2030,"contratos":77,"km":32959,"valor":770,"invest_executado_acum":430}]

conc2326={"grupos_novos_entrantes":18,"km":14962,"capex":202,"opex":135,"capex_opex":337,"empregos_milhoes":4.0}

prog=[{"ano":2023,"leiloes":2,"km":1077,"capex":18.7,"opex":11.6,"duplicacao_km":694,"faixa_km":349,"previsto":False},
      {"ano":2024,"leiloes":7,"km":3221,"capex":48.1,"opex":33.5,"duplicacao_km":951,"faixa_km":789,"previsto":False},
      {"ano":2025,"leiloes":13,"km":6279,"capex":81.6,"opex":53.6,"duplicacao_km":1331,"faixa_km":1182,"previsto":False},
      {"ano":2026,"leiloes":7,"km":4383,"capex":53.8,"opex":36.2,"duplicacao_km":855,"faixa_km":831,"previsto":True,
       "realizado_ate_jul_2026":{"leiloes":3,"km":1620,"capex":20.68,"opex":14.96,"duplicacao_km":295,"faixa_km":234}},
      {"ano":2027,"leiloes":11,"km":4455.68,"capex":54.87,"opex":47.82,"duplicacao_km":569.07,"faixa_km":550.29,"previsto":True}]

ds=[c["desagio"] for c in conc]
notas={
 "leiloes_por_ano":"Gráfico da p7 omite 1998–2006 (marcador '(...)' com valor 0); como a soma 1993–2022 dá 29 (= p9), esses anos foram registrados como 0. 2026 marcado como previsto (projeção ao fim de 2026; 3 leilões realizados até jul/2026 segundo p95/p97). p9: médias 1,0 (1993–2022), 7,14 (2023 até agora, 25 leilões) e 7,25 (2023–2026).",
 "participantes":"Tabela pp.11–15 não informa o deságio do vencedor; para 2023–2026 'desagio_vencedor' vem da tabela da p97, antes de 2023 é null. Nomes mantidos como na fonte (inclusive grafias como 'Oinco', 'Oiicno'). Entradas idênticas ao vencedor (mesmo nome e deságio da p97) foram retiradas de 'outros' (Rota Agro, Rota Sertaneja, Via Liberdade, Fluminense, Fernão Dias, Rota Gerais, Rota dos Sertões, Régis 2026). Prováveis erros de cópia na fonte: 'EPR (Equipav) (8,30%)' repetido em Lote 1/2023, BR-040/MG/2024 e Rota Agro Norte/2025; 2022 repete a linha de 2021 ('Ecorodovias (10,6%)'); duplicatas em 2007 (AB Vias em Fluminense, CCR em Litoral Sul). Contagens divergem da p97 (ex.: BR-381/MG e Rota Agro Norte listam outro proponente, mas a p97 indica 1 participante; Régis 2026 lista 4 proponentes vs 3 na p97; Lote 5 lista 'Reune Rodovias Holding II' 23,83% como concorrente, mas p97 a dá como vencedora com 21,83%).",
 "concorrentes_desagio":f"Fonte principal p97 (nº de participantes e deságio). p23 (bolinhas) diverge em Rota da Celulose (5 vs 4) e Rota Agro (7 vs 5); adotada a p97, que bate com a distribuição da p25. Média calculada {str(round(statistics.mean(ds),2)).replace(".",",")}% (p25/p27: 12,36%), mediana {str(round(statistics.median(ds),2)).replace(".",",")}% (p27: 14,32%). Maior deságio na p97 é 26,60% (Lote 3) contra 25,9% na p27.",
 "faixas_desagio":"Faixas da p27. Pela p97 só há 1 leilão com 0,00% (Fluminense) e 4 com 0,05%; pela p97 as faixas seriam ≥18%: 10, 10–<18%: 6, >0–<10%: 8, 0%: 1 (a p27 dá 6 e 3, provavelmente contando 0,05%/0,08% como 0%). desagio_por_n_concorrentes vem da p25; as médias da p25 não batem com a p97 (recalculadas: 2 conc. 17,14%; 3 conc. 16,30%; 4 conc. 17,50%; 5 conc. 19,60% vs 17,65/18,47/17,30/19,70 na p25).",
 "grupos":"p17 (2008–2026, 39 concessões, 19.195 km, R$ 269,3 bi capex, R$ 196,3 bi opex). p19 traz só contagens (inclui 'TPI - Triunfo' com 2 concessões, que na p17 está em 'Outros 6 grupos'); p21 não acrescenta grupos.",
 "gestao":"p37, km da malha federal pavimentada; pct_concedido conforme rótulos do gráfico.",
 "investimentos":"Série anual da p43 (rodovias federais): 'publico' = Públicas (OGU), 'privado' = Capex + Opex das concessões, R$ bi, base de preços não informada na p43 (p47 indica valores nominais). 2003–2009 sem barra pública (null); eixo '1995...' sem valor. 2023–2029 previstos. Soma privada 2003–2022 = 115,25 vs 'R$ 129 bi realizado 1995–2022'; soma 2023–2029 = 223,23 vs 'R$ 218 bi'. p41 dá público 2023–2026 = R$ 48,29 bi, enquanto a p43 soma 75,6. p39 (ABDIB, toda a infraestrutura) não foi usada.",
 "indicadores_40":"pp.51–55. p125 traz 4.400 km de duplicação e 3.701 km de faixa adicional (vs 4.374/3.702 na p51). p53 diz R$ 400 bi, p125 R$ 440 bi.",
 "diagnostico":"p29. 'valor' = 'R$ X bi de rodovias concedidas' (valor dos contratos); 'invest_executado_acum' = investimentos executados acumulados.",
 "concorrencia_2023_26":"p21 (29 leilões previstos e realizados 2023–2026, igual à p123). Difere do total dos 25 leilões realizados da p97: 12.198 km, capex R$ 169,04 bi, opex R$ 113,6 bi.",
 "programa_por_ano":"2023–2025 de p95/p123; 2026 previsto (7 leilões) de p101/p123, realizado até jul/2026 de p95; 2027 de p129 (p125 arredonda). Valores em R$ bi."
}
fontes={"leiloes_por_ano":[7,9],"participantes":[11,13,15,97],"concorrentes_desagio":[23,25,27,97],"faixas_desagio":[25,27],
 "desagio_por_n_concorrentes":25,"grupos":[17,19],"gestao":37,"investimentos":[41,43,47,49],"indicadores_40":[51,53,55],
 "diagnostico":29,"concorrencia_2023_26":21,"programa_por_ano":[95,101,123,125,129]}
d={"fontes":fontes,"notas":notas,"leiloes_por_ano":leiloes,"participantes":participantes,"concorrentes_desagio":conc,
   "faixas_desagio":faixas,"desagio_por_n_concorrentes":por_n,"grupos":grupos,"gestao":gestao,"investimentos":investimentos,
   "indicadores_40":indicadores,"diagnostico":diag,"concorrencia_2023_26":conc2326,"programa_por_ano":prog}
json.dump(d,open(out,"w"),ensure_ascii=False,indent=1)

# checks
d=json.load(open(out))
series=[k for k in d if k not in("fontes","notas")]
for k in series: assert d[k], k; assert k in d["fontes"], k
assert set(d["fontes"])==set(series)
anos=[e["ano"] for e in d["leiloes_por_ano"]]; assert anos==list(range(1993,2031))
assert len(d["concorrentes_desagio"])==25
from collections import Counter
print(Counter(c["n"] for c in conc))
fx=Counter(">=18" if x>=18 else "10-18" if x>=10 else ">0-10" if x>0 else "0" for x in ds); print("faixas p97:",fx)
for n in range(1,6): v=[c["desagio"] for c in conc if c["n"]==n]; print(n,round(statistics.mean(v),2))
print("sum 2023-26 leiloes", sum(e["n"] for e in d["leiloes_por_ano"] if 2023<=e["ano"]<=2026))
print("OK", series)
