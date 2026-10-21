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
