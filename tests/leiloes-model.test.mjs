import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const LeiloesModel = createRequire(import.meta.url)('../src/leiloes-model.js');

const row = (o) => Object.assign({ ano: 2020, lote: 'L', vencedor: 'X', desagio_vencedor: 10, outros: [] }, o);
const por = (r, g) => r.find(x => x.grupo === g);

test('grupoDe: usa o alias; sem alias devolve o próprio nome', () => {
  const al = [{ nome: 'CCR', grupo: 'Motiva' }];
  assert.equal(LeiloesModel.grupoDe('CCR', al), 'Motiva');
  assert.equal(LeiloesModel.grupoDe('Outro', al), 'Outro');
  assert.equal(LeiloesModel.grupoDe('CCR', undefined), 'CCR');
});

test('rsDiverge mantém grupos diferentes', () => {
  const al = [{ nome: 'Consórcio BRVias', grupo: 'Consórcio BRVias' },
    { nome: 'Ecorodovias Concessões e Serviços S.A.', grupo: 'Ecorodovias' }];
  assert.equal(LeiloesModel.rsDiverge('Consórcio BRVias', 'TPI – Triunfo Participações e Investimentos S.A. (antigo Consórcio BRVias)', al), true);
  assert.equal(LeiloesModel.rsDiverge('Ecorodovias Concessões e Serviços S.A.', 'Ecorodovias', al), false);
  // sem nome do RoadShow não há linha
  assert.equal(LeiloesModel.rsDiverge('Ecorodovias Concessões e Serviços S.A.', null, al), false);
  assert.equal(LeiloesModel.rsDiverge('Ecorodovias Concessões e Serviços S.A.', '', al), false);
  // sem aliases, só o mesmo nome coincide
  assert.equal(LeiloesModel.rsDiverge('Ecorodovias Concessões e Serviços S.A.', 'Ecorodovias', []), true);
  // grafia do RoadShow: acento, caixa, pontuação e "Consórcio" não contam; nome que começa pelo grupo é do grupo
  const g = [{ nome: 'Infraestrutura Brasil Holding XXI S.A.', grupo: 'Pátria' }, { nome: 'Consórcio Caminhos da Celulose', grupo: 'XP' },
    { nome: 'Ecorodovias Concessões e Serviços S.A.', grupo: 'Ecorodovias' }, { nome: 'Obrascon Huarte Lain Brasil S.A. (OHL Brasil)', grupo: 'OHL Brasil' }];
  assert.equal(LeiloesModel.rsDiverge('Infraestrutura Brasil Holding XXI S.A.', 'Patria', g), false);
  assert.equal(LeiloesModel.rsDiverge('Ecorodovias Concessões e Serviços S.A.', 'EcoRodovias Concessões e Ser. S.A', g), false);
  assert.equal(LeiloesModel.rsDiverge('Consórcio Caminhos da Celulose', 'XP Infra V Fundo de Investimento', g), false);
  assert.equal(LeiloesModel.rsDiverge('Consórcio Nova Estrada Real', 'Nova Estrada Real (Construcap; Copasa; Ohla)', []), false);
  // "Nome (Grupo)": vale o nome ou o que vem entre parênteses
  assert.equal(LeiloesModel.rsDiverge('Consórcio Caminhos da Celulose', 'Consórcio Caminhos da Celulose (XP infra V fundo de Investimento)', g), false);
  assert.equal(LeiloesModel.rsDiverge('Infraestrutura Brasil Holding XXI S.A.', 'Infraestrutura Holding XXI S.A. (Patria)', g), false);
  // grupo de outra época continua visível
  assert.equal(LeiloesModel.rsDiverge('Obrascon Huarte Lain Brasil S.A. (OHL Brasil)', 'Arteris (Antiga OHL)', g), true);
  assert.equal(LeiloesModel.rsDiverge('Consórcio Planalto', 'Ecorodovias', g), true);
  const h = [{ nome: 'Consórcio Rodovia da Vitória', grupo: 'Ecorodovias' }, { nome: 'Consórcio Acciona', grupo: 'Acciona' }];
  // consórcio liderado pela Ecorodovias: o RoadShow lista os membros começando pelo grupo (ECO101, 2012)
  assert.equal(LeiloesModel.rsDiverge('Consórcio Rodovia da Vitória', 'Ecorodovias e SBS Engenharia e Construções', h), false);
  // K-Infra comprou depois: grupo da época (Acciona) continua divergente
  assert.equal(LeiloesModel.rsDiverge('Consórcio Acciona', 'K-Infra (antigo Consórcio Acciona)', h), true);
});

test('ranking conta vitória e derrota', () => {
  const r = LeiloesModel.rankingGrupos([
    row({ vencedor: 'X', outros: [{ grupo: 'Y', desagio: 1 }] }),
    row({ vencedor: 'Y', outros: [{ grupo: 'X', desagio: 1 }, { grupo: 'Z', desagio: 1 }] }),
  ], []);
  assert.deepEqual(
    (({ participacoes, vitorias, derrotas, taxa }) => ({ participacoes, vitorias, derrotas, taxa }))(por(r, 'X')),
    { participacoes: 2, vitorias: 1, derrotas: 1, taxa: 50 });
  assert.deepEqual(
    (({ participacoes, vitorias, derrotas, taxa }) => ({ participacoes, vitorias, derrotas, taxa }))(por(r, 'Z')),
    { participacoes: 1, vitorias: 0, derrotas: 1, taxa: 0 });
});

test('ranking conta grupo uma vez por leilão', () => {
  const al = [{ nome: 'CCR', grupo: 'Motiva' }, { nome: 'Motiva Infra', grupo: 'Motiva' }];
  const r = LeiloesModel.rankingGrupos([row({ vencedor: 'CCR', outros: [{ grupo: 'Motiva Infra', desagio: 5 }] })], al);
  assert.equal(r.length, 1);
  assert.deepEqual([r[0].grupo, r[0].participacoes, r[0].vitorias, r[0].derrotas], ['Motiva', 1, 1, 0]);
});

test('ranking inclui inabilitados como derrota', () => {
  const r = LeiloesModel.rankingGrupos([row({ vencedor: 'X', outros: [{ grupo: 'Y', desagio: 1 }],
    inabilitados: [{ grupo: 'K', desagio: 9, data: '2025-08-04' }, { grupo: 'Y' }] })], []);
  assert.deepEqual([por(r, 'K').participacoes, por(r, 'K').vitorias, por(r, 'K').derrotas], [1, 0, 1]);
  assert.equal(por(r, 'Y').participacoes, 1); // Y está em outros e inabilitados: uma vez só
});

test('ranking filtra período e calcula primeira/última', () => {
  const ps = [
    row({ ano: 2007, vencedor: 'X', outros: [{ grupo: 'Y' }] }),
    row({ ano: 2015, vencedor: 'Y', outros: [{ grupo: 'X' }] }),
    row({ ano: 2024, vencedor: 'X', outros: [{ grupo: 'Y' }] }),
  ];
  const todos = LeiloesModel.rankingGrupos(ps, []);
  assert.deepEqual([por(todos, 'X').primeira, por(todos, 'X').ultima], [2007, 2024]);
  const meio = LeiloesModel.rankingGrupos(ps, [], { de: 2010, ate: 2020 });
  assert.equal(por(meio, 'X').participacoes, 1);
  assert.deepEqual([por(meio, 'X').primeira, por(meio, 'X').ultima], [2015, 2015]);
  assert.equal(LeiloesModel.rankingGrupos(ps, [], { de: 2010 }).length, 2);
  assert.equal(por(LeiloesModel.rankingGrupos(ps, [], { ate: 2010 }), 'X').participacoes, 1);
});

test('ranking ordena por participações, vitórias e nome', () => {
  const r = LeiloesModel.rankingGrupos([
    row({ vencedor: 'Beta', outros: [{ grupo: 'Álamo' }, { grupo: 'Zeta' }] }),
    row({ vencedor: 'Beta', outros: [{ grupo: 'Zeta' }] }),
  ], []);
  assert.deepEqual(r.map(x => x.grupo), ['Beta', 'Zeta', 'Álamo']);
  const empate = LeiloesModel.rankingGrupos([row({ vencedor: 'Zed', outros: [{ grupo: 'Ágata' }, { grupo: 'Bia' }] })], []);
  assert.deepEqual(empate.map(x => x.grupo), ['Zed', 'Ágata', 'Bia']);
});

test('leiloesSemLista conta outros vazio', () => {
  const ps = [row({ ano: 2020 }), row({ ano: 2021, outros: [{ grupo: 'Y' }] }), row({ ano: 2022, outros: [] })];
  assert.equal(LeiloesModel.leiloesSemLista(ps), 2);
  assert.equal(LeiloesModel.leiloesSemLista(ps, { de: 2021 }), 1);
  assert.equal(LeiloesModel.leiloesSemLista(ps, { ate: 2020 }), 1);
});

test('serieDesagio usa data e exclui nulos', () => {
  const s = LeiloesModel.serieDesagio([
    row({ ano: 2025, lote: 'Sertões', vencedor: 'Consórcio 116', data: '2025-08-14', desagio_vencedor: 19.6, verif: { desagio: { tipo: 'oficial' } } }),
    row({ ano: 2007, desagio_vencedor: null }),
    row({ ano: 2013, lote: 'M', vencedor: 'V', desagio_vencedor: 5 }),
  ]);
  assert.equal(s.length, 2);
  assert.ok(Math.abs(s[0].x - 2025.62) < 0.01, String(s[0].x));
  assert.equal(s[0].y, 19.6);
  assert.equal(s[0].tipo, 'oficial');
  assert.match(s[0].label, /Sertões/);
  assert.equal(s[1].x, 2013.5);
  assert.equal(s[1].tipo, 'roadshow');
});

test('serieDesagio: data impossível cai no meio do ano; rótulo sem vencedor usa "—"', () => {
  const x = (data) => LeiloesModel.serieDesagio([row({ ano: 2025, data, desagio_vencedor: 5 })])[0].x;
  assert.ok(Math.abs(x('2025-08-14') - 2025.62) < 0.01);
  assert.ok(Math.abs(x('2024-02-29') - 2024.16) < 0.01, 'bissexto vale');
  for (const ruim of ['2025-13-01', '2025-00-10', '2025-02-30', '2025-02-29', '2025-04-31', '2025-01-00', '2025-01-32']) {
    assert.equal(x(ruim), 2025.5, ruim);
  }
  const s = LeiloesModel.serieDesagio([row({ lote: 'Lote 7', vencedor: null, desagio_vencedor: 5 }),
    row({ lote: 'Lote 8', vencedor: undefined, desagio_vencedor: 6 })]);
  assert.deepEqual(s.map(p => p.label), ['Lote 7 · —', 'Lote 8 · —']);
});

test('serieDesagio traz limitado do edital (padrão false)', () => {
  const s = LeiloesModel.serieDesagio([
    row({ data: '2021-10-29', desagio_vencedor: 15.31, verif: { desagio: { tipo: 'oficial', limitado_pelo_edital: true } } }),
    row({ data: '2021-07-08', desagio_vencedor: 8.1, verif: { desagio: { tipo: 'imprensa', limitado_pelo_edital: false } } }),
    row({ ano: 2010, desagio_vencedor: 3 }),
  ]);
  assert.deepEqual(s.map(p => p.limitado), [true, false, false]);
  assert.equal(s[1].tipo, 'imprensa');
});

test('mediaDesagio ignora nulos', () => {
  assert.equal(LeiloesModel.mediaDesagio([10, null, 20]), 15);
  assert.equal(LeiloesModel.mediaDesagio([]), null);
  assert.equal(LeiloesModel.mediaDesagio([null, undefined]), null);
});

// ---------- Resumo (aba inicial) ----------
// SNV mínimo: registro com 16 posições (adm na 7); dois físicos, um concedido.
// SNV mínimo: registro com 16 posições (situação na 4, adm na 7); um físico concedido, um só planejado.
const snvFix = () => {
  const t = (sit, adm) => Object.assign(new Array(16).fill(0), { 4: sit, 7: adm });
  return { versao: '202601A', dict: { situacao: ['Pavimentada', 'Planejada'], adm: ['Concessão Federal', 'Federal'] }, trechos: [t(0, 0), t(1, 1)],
    fis: [{ r: [0], ext: 100 }, { r: [1], ext: 300 }] };
};
const concFix = () => ({
  grupos_alias: [{ nome: 'Alfa SA', grupo: 'Alfa' }],
  mercado: {
    fontes: { programa_por_ano: [95, 129], concorrentes_desagio: [23, 97], participantes: [11, 97], gestao: 37, leiloes_por_ano: [7, 9] },
    gestao: [{ ano: 2025, privada_km: 50, total_km: 200 }, { ano: 2026, privada_km: 60, total_km: 200 }],
    leiloes_por_ano: [{ ano: 2007, n: 2, previsto: false }, { ano: 2010, n: 1, previsto: false }, { ano: 2023, n: 2, previsto: false },
      { ano: 2024, n: 1, previsto: false }, { ano: 2027, n: 4, previsto: true }],
    programa_por_ano: [{ ano: 2023, leiloes: 2, capex: 10, opex: 5, previsto: false },
      { ano: 2024, leiloes: 3, capex: 20, opex: 10, previsto: false }, { ano: 2027, leiloes: 4, capex: 30, opex: 30, previsto: true }],
    participantes: [
      row({ ano: 2007, lote: 'P1', vencedor: 'A', desagio_vencedor: 40, verif: { desagio: { tipo: 'oficial' } } }),
      row({ ano: 2007, lote: 'P2', vencedor: 'B', desagio_vencedor: 50, verif: { desagio: { tipo: 'oficial' } } }),
      row({ ano: 2023, lote: 'L1', vencedor: 'Alfa SA', desagio_vencedor: 20, verif: { desagio: { tipo: 'oficial' } } }),
      row({ ano: 2023, lote: 'L2', vencedor: 'Beta', desagio_vencedor: 0, verif: { desagio: { tipo: 'oficial' } } }),
      row({ ano: 2024, lote: 'L3', vencedor: 'Alfa SA', desagio_vencedor: 10 }),
    ],
    concorrentes_desagio: [{ leilao: 'L1', ano: 2023, n: 1, desagio: 0.5, verif: { desagio: { tipo: 'oficial' } } },
      { leilao: 'L2', ano: 2023, n: 3, desagio: 20, verif: { desagio: { tipo: 'oficial' } } },
      { leilao: 'L3', ano: 2024, n: 2, desagio: 19 }, { leilao: 'L4', ano: 2024, n: 2, desagio: null, verif: { desagio: { tipo: null, nao_se_aplica: true } } }],
  },
  regulatorio: { diagramas: [{ redacoes: [{ texto: 'aporte a partir de 18% de deságio', pagina: 61 }, { texto: 'maiores do que 18%', pagina: 65 },
    { texto: 'acima de 18% de deságio', pagina: 73 }] }] },
});
const intelFix = () => ({ pipeline: {
  fonte: [{ nome: 'Carteira do Ministério' }, { nome: 'Jornal', origem: 'imprensa' }],
  status: [{ key: 'leilao_agendado', label: 'Leilão agendado' }, { key: 'estudo', label: 'Em estudo' }],
  itens: [{ id: 'a', nome: 'Lote X', esfera: 'federal', status: 'leilao_agendado', data_prevista: '2026-11-12' },
    { id: 'b', nome: 'Lote Y', esfera: 'estadual', status: 'estudo', data_prevista: '2027-06' },
    { id: 'c', nome: 'Antigo', esfera: 'federal', status: 'leilao_agendado', data_prevista: '2026-03-02' },
    { id: 'd', nome: 'Cancelado', esfera: 'federal', status: 'cancelado', data_prevista: '2026-12-01' },
    { id: 'e', nome: 'Sem data', esfera: 'federal', status: 'estudo', data_prevista: null }],
} });
const HOJE = new Date(2026, 9, 21);
const semLixo = s => !/NaN|undefined|null|Infinity/.test(s);

test('resumoKpis: valores dos KPIs com fixture', () => {
  const k = Object.fromEntries(LeiloesModel.resumoKpis(concFix(), intelFix(), snvFix()).map(x => [x.id, x]));
  assert.deepEqual(Object.keys(k), ['malha', 'concessao', 'leiloes', 'investimento', 'desagio', 'grupos']);
  assert.equal(k.malha.valor, 400);
  assert.equal(k.malha.texto, '400 km');
  assert.match(k.malha.rotulo, /cadastrada no SNV, incluindo 300 km só planejados/);
  assert.equal(k.malha.nota, 'Sem os trechos planejados: 100 km.');
  assert.match(k.malha.fonte, /SNV 202601A/);
  // concessão: último ano da série gestão (a do Mercado); o cadastro do SNV vai na linha secundária
  assert.equal(k.concessao.valor, 60);
  assert.match(k.concessao.rotulo, /pavimentada sob concessão em 2026: 30,0% de 200 km/);
  assert.match(k.concessao.nota, /SNV 202601A, 100 km têm administração "Concessão Federal"; o cadastro ainda não reflete/);
  assert.equal(k.concessao.fonte, 'RoadShow 2026-2027, p. 37');
  assert.equal(k.leiloes.valor, 3, 'participantes de 2023 a 2027');
  assert.match(k.leiloes.rotulo, /de 9 no programa 2023–2027 \(realizados e previstos\)/);
  assert.equal(k.investimento.valor, 105);
  assert.equal(k.investimento.texto, 'R$ 105,0 bi');
  assert.match(k.investimento.fonte, /RoadShow 2026-2027, pp\. 95 e 129/);
  assert.ok(Math.abs(k.desagio.valor - 39.5 / 3) < 1e-9);
  assert.equal(k.desagio.texto, '13,17%');
  assert.match(k.desagio.rotulo, /dos 3 leilões de 2023–2024 com deságio de tarifa/);
  assert.equal(k.desagio.nota, 'Fora da média: L4 (leilão por outorga, sem deságio de tarifa).');
  assert.equal(k.grupos.valor, 2, 'Alfa (pelo alias) e Beta');
  for (const x of Object.values(k)) {
    assert.ok(x.rotulo && x.texto && x.unidade && x.fonte, x.id);
    assert.ok(semLixo(JSON.stringify(x)), x.id);
  }
});

test('resumoAchados: achados calculados com fórmula e fonte', () => {
  const a = Object.fromEntries(LeiloesModel.resumoAchados(concFix(), intelFix(), HOJE).map(x => [x.id, x]));
  assert.deepEqual(Object.keys(a), ['concorrencia', 'aporte', 'desagio-historico', 'concentracao', 'calendario', 'opex']);
  assert.match(a.concorrencia.texto, /1 leilão com um só proponente.*0,50%/);
  assert.match(a.concorrencia.texto, /2 leilões com dois ou mais.*19,50%/);
  assert.match(a.aporte.texto, /2 dos 3 leilões de 2023–2024 com deságio de tarifa ficaram acima de 18%/);
  assert.doesNotMatch(a.aporte.texto, /proporcional/);
  assert.match(a.aporte.formula, /p\. 61 diz "a partir de 18%"; nenhum leilão tem deságio de exatamente 18%/);
  assert.match(a.aporte.fonte, /Portaria MT nº 995\/2023, RoadShow 2026-2027, pp\. 61, 65 e 73/);
  assert.match(a['desagio-historico'].texto, /2007.*45,00%.*2023–2024.*10,00%/);
  // 1 vencedor sem verificação (L3): a fonte cita o RoadShow além da camada de verificação
  assert.match(a['desagio-historico'].fonte, /camada de verificação \(fontes oficiais\); RoadShow 2026-2027, pp\. 11 e 97/);
  assert.match(a.concentracao.texto, /Nos 5 leilões de 2007–2024 com vencedor listado no RoadShow, venceram 4 grupos/);
  assert.match(a.concentracao.texto, /Alfa \(2\).*2 deles \(40,0%\)/);
  // 2010 tem 1 leilão no gráfico por ano e nenhum na lista; 2027 (previsto) não conta
  assert.match(a.concentracao.texto, /mais 1 leilão no período \(2010\) sem vencedor na lista/);
  assert.match(a.concentracao.fonte, /leilões por ano: RoadShow 2026-2027, pp\. 7 e 9/);
  assert.match(a.calendario.texto, /federais e estaduais tem 2 leilões com data \(1 federal e 1 estadual\)/);
  assert.match(a.calendario.texto, /1 com leilão agendado \(até nov\/2026\) e 1 com data prevista em 2027 \(em estudo\)/);
  assert.match(a.calendario.texto, /Lote X, em 12\/11\/2026/);
  assert.match(a.calendario.fonte, /Carteira do Ministério; Jornal \(imprensa — não oficial\)/);
  assert.doesNotMatch(a.calendario.texto, /Antigo|Cancelado/);
  assert.match(a.opex.titulo, /2027/);
  assert.match(a.opex.texto, /50,0%/);
  assert.match(a.opex.texto, /2023–2024.*33,3%/);
  // deságio de exatamente 18%: a formulação "a partir de" contaria esse leilão, e a fórmula diz isso
  const c18 = concFix();
  c18.mercado.concorrentes_desagio[2].desagio = 18;
  const ap = LeiloesModel.resumoAchados(c18, null, HOJE).find(x => x.id === 'aporte');
  assert.match(ap.texto, /1 dos 3 leilões .* ficou acima de 18%/);
  assert.match(ap.formula, /1 leilão tem deságio de exatamente 18% e entraria por essa redação/);
  for (const x of Object.values(a)) {
    assert.ok(x.titulo && x.texto && x.formula && x.fonte, x.id);
    assert.ok(semLixo(JSON.stringify(x)), x.id);
  }
});

test('resumoAchados sem dados não quebra', () => {
  for (const [c, i] of [[undefined, undefined], [null, null], [{}, {}], [{ mercado: {} }, { pipeline: {} }],
    [{ mercado: { programa_por_ano: [], participantes: [], concorrentes_desagio: [] } }, { pipeline: { itens: [] } }]]) {
    assert.deepEqual(LeiloesModel.resumoAchados(c, i, HOJE), []);
    assert.deepEqual(LeiloesModel.resumoKpis(c, i, null), []);
  }
  // blocos parciais: só entra o que tem dado, sem NaN nem undefined
  const c = concFix();
  c.mercado.concorrentes_desagio.forEach(x => { x.n = null; });  // sem número de proponentes
  c.mercado.participantes = c.mercado.participantes.filter(p => p.ano >= 2023);  // sem leilões de antes do programa
  c.mercado.programa_por_ano = c.mercado.programa_por_ano.map(p => Object.assign({}, p, { opex: null }));
  c.mercado.gestao = [{ ano: 2026, privada_km: null, total_km: 200 }];  // série de gestão sem valor
  const ids = LeiloesModel.resumoAchados(c, null, HOJE).map(x => x.id);
  assert.deepEqual(ids, ['aporte', 'concentracao']);
  delete c.regulatorio;  // sem as redações do limite do aporte, o achado some
  assert.deepEqual(LeiloesModel.resumoAchados(c, null, HOJE).map(x => x.id), ['concentracao']);
  const k = LeiloesModel.resumoKpis(c, null, null);
  assert.deepEqual(k.map(x => x.id), ['leiloes', 'desagio', 'grupos']);
  assert.ok(semLixo(JSON.stringify(LeiloesModel.resumoAchados(c, null, HOJE))));
  assert.ok(semLixo(JSON.stringify(k)));
});
