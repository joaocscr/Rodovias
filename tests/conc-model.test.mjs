import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const ConcModel = createRequire(import.meta.url)('../src/conc-model.js');

const ent = (o) => Object.assign({ brs: ['116'], ufs: ['MG'], km: 100, capex: 1, opex: 1, data_base: 'dez/2024',
  ficha: null, leilao: null, assinatura: null, desagio: null, participantes: null, grupo_vencedor: null,
  ano_programa: null, tipo: 'nova' }, o);
const conc = {
  entidades: [
    ent({ id: 'a', nome: 'Contrato A', estado: 'programa', ano_programa: 2024, leilao: '2024-04-11', km: 200, capex: 4, opex: 2, ficha: { wacc: 13.76 } }),
    ent({ id: 'b', nome: 'Otimização B', estado: 'projeto2027', ano_programa: 2027, leilao: '2027-06', tipo: 'otimizacao', capex: null, ficha: { wacc: 9.1 } }),
    ent({ id: 'c', nome: 'São Vigente', estado: 'vigente', assinatura: '2008-02-14', ufs: ['SP'] }),
    ent({ id: 'd', nome: 'Agendado D', estado: 'agendado2026', ano_programa: 2026, leilao: '2026-12-11' }),
  ],
  entFis: [[0], [0], [1], []],
  fisEnt: { 0: [0, 1], 1: [2] },
  snvOnly: [2],
  estudos: [{ brs: ['319'], ufs: ['AM'], fis: [3] }],
};
const snv = { fis: [{ ext: 10 }, { ext: 20 }, { ext: 5 }, { ext: 7 }, { ext: 3 }] };
const states = ConcModel.stateArray(conc, 5);

test('prioridade', () => assert.equal(ConcModel.stateOfFis(conc, 0), 'projeto2027'));
test('snv, pos2027 e nenhum', () => assert.deepEqual([2, 3, 4].map(j => ConcModel.stateOfFis(conc, j)), ['snv', 'pos2027', 'nenhum']));
test('stateArray', () => assert.deepEqual(states, ['projeto2027', 'vigente', 'snv', 'pos2027', 'nenhum']));
test('entitiesOfFis ordenado pela prioridade', () => { assert.deepEqual(ConcModel.entitiesOfFis(conc, 0), [1, 0]); assert.deepEqual(ConcModel.entitiesOfFis(conc, 4), []); });
test('passes por estado, entidade e ano', () => {
  const cf = ConcModel.emptyConcFilters();
  assert.equal(ConcModel.passes(conc, states, 4, cf), true);
  cf.estado.add('vigente');
  assert.deepEqual([0, 1, 2].map(j => ConcModel.passes(conc, states, j, cf)), [false, true, false]);
  const cf2 = ConcModel.emptyConcFilters(); cf2.ent.add(0);
  assert.deepEqual([0, 1].map(j => ConcModel.passes(conc, states, j, cf2)), [true, false]);
  const cf3 = ConcModel.emptyConcFilters(); cf3.ano.add(2024);
  assert.deepEqual([0, 1, 4].map(j => ConcModel.passes(conc, states, j, cf3)), [true, false, false]);
});
test('kmPorEstado', () => {
  const vis = Uint8Array.from([1, 1, 1, 0, 1]);
  assert.deepEqual(ConcModel.kmPorEstado(conc, states, vis, snv), [{ key: 'projeto2027', km: 10 }, { key: 'vigente', km: 20 }, { key: 'snv', km: 5 }, { key: 'nenhum', km: 3 }]);
});
test('kmPorEstado vazio sem NaN', () => assert.deepEqual(ConcModel.kmPorEstado(conc, states, new Uint8Array(5), snv), []));
test('comparatorRows', () => {
  const rows = ConcModel.comparatorRows(conc);
  assert.equal(rows.length, 4);
  assert.equal(rows[0].capexKm, 20);
  assert.equal(rows[1].capexKm, null);
  assert.equal(rows[0].dataChave, '2024-04-11');
  assert.equal(rows[2].dataChave, '2008-02-14');
  assert.equal(rows[0].wacc, 13.76);
  assert.equal(rows[0].brsUfs, 'BR-116/MG');
});
test('filterRows', () => {
  const rows = ConcModel.comparatorRows(conc);
  assert.deepEqual(ConcModel.filterRows(rows, { estado: new Set(['vigente']) }).map(r => r.idx), [2]);
  assert.deepEqual(ConcModel.filterRows(rows, { uf: new Set(['SP']) }).map(r => r.idx), [2]);
  assert.deepEqual(ConcModel.filterRows(rows, { q: 'sao' }).map(r => r.idx), [2]);
  assert.deepEqual(ConcModel.filterRows(rows, { ano: new Set([2027]), tipo: new Set(['otimizacao']) }).map(r => r.idx), [1]);
});
test('sortRows nulos no fim nas duas direções', () => {
  const rows = [{ wacc: 13.76 }, { wacc: null }, { wacc: 9.1 }];
  assert.deepEqual(ConcModel.sortRows(rows, 'wacc', 'asc').map(r => r.wacc), [9.1, 13.76, null]);
  assert.deepEqual(ConcModel.sortRows(rows, 'wacc', 'desc').map(r => r.wacc), [13.76, 9.1, null]);
  assert.deepEqual(ConcModel.sortRows([{ nome: 'b' }, { nome: 'Á' }], 'nome', 'asc').map(r => r.nome), ['Á', 'b']);
});
test('totals ignora nulos', () => {
  assert.deepEqual(ConcModel.totals([{ km: 10, capex: 1, opex: null }, { km: 5, capex: null, opex: 2 }]), { km: 15, capex: 1, opex: 2, n: 2 });
});
test('formatos', () => {
  assert.equal(ConcModel.fmtBi(7.34), 'R$ 7,34 bi');
  assert.equal(ConcModel.fmtBi(null), '—');
  assert.equal(ConcModel.fmtPct(19.6), '19,60%');
  assert.equal(ConcModel.fmtData('2026-03-31'), '31/03/2026');
  assert.equal(ConcModel.fmtData('2027-06'), 'jun/2027');
  assert.equal(ConcModel.fmtData(null), '—');
});
