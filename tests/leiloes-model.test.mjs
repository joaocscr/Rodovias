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
