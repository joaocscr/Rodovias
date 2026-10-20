import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const IntelModel = createRequire(import.meta.url)('../src/intel-model.js');

const snv = { fis: [{ ext: 10 }, { ext: 20 }, { ext: 0 }, { ext: 5 }] };
const intel = {
  trafego: {
    vmda: { tipo: 'modelado', ano: 2023, l: [1000, 2000, 500, null], p: [200, 300, 0, null] },
    acidentes: { tipo: 'medido', anos: [2024, 2025], n: [4, 0, 6, 10], m: [2, 0, 0, 4], fg: [], fl: [] },
  },
  carga: { tipo: 'modelado', ano_base: 2017, gsa: [100, 0, null, 50], total: [], veic: [], dist_m: [] },
};
const vis = Uint8Array.from([1, 1, 1, 0]);
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test('rows: objetos a partir de campos/linhas', () => {
  const r = IntelModel.rows({ campos: ['nome', 'fis'], linhas: [['A', 3], ['B', null]] });
  assert.deepEqual(r, [{ nome: 'A', fis: 3 }, { nome: 'B', fis: null }]);
  assert.deepEqual(IntelModel.rows(undefined), []);
});

test('MODES: quatro modos com rótulo, unidade, tipo e fonte', () => {
  assert.deepEqual(Object.keys(IntelModel.MODES), ['trafego', 'pesados', 'carga', 'acidentes']);
  assert.deepEqual(Object.values(IntelModel.MODES).map(m => m.tipo), ['modelado', 'modelado', 'modelado', 'medido']);
  for (const m of Object.values(IntelModel.MODES)) {
    assert.equal(typeof m.label, 'string');
    assert.equal(typeof m.unidade, 'string');
    assert.equal(typeof m.fonte(intel), 'string');
    assert.equal(m.fonte({}), '—');
  }
});

test('metricArray por modo', () => {
  assert.deepEqual(IntelModel.metricArray(intel, snv, 'trafego'), [1200, 2300, 500, null]);
  assert.deepEqual(IntelModel.metricArray(intel, snv, 'pesados'), [200, 300, 0, null]);
  assert.deepEqual(IntelModel.metricArray(intel, snv, 'carga'), [100, 0, null, 50]);
  // n / anos / ext; ext 0 -> null
  assert.deepEqual(IntelModel.metricArray(intel, snv, 'acidentes'), [0.2, 0, null, 1]);
});

test('metricArray: bloco ausente -> todos null', () => {
  assert.deepEqual(IntelModel.metricArray({}, snv, 'trafego'), [null, null, null, null]);
  assert.deepEqual(IntelModel.metricArray({ trafego: {} }, snv, 'acidentes'), [null, null, null, null]);
  assert.deepEqual(IntelModel.metricArray({}, snv, 'carga'), [null, null, null, null]);
});

test('quantileBreaks: k-1 cortes crescentes, 2 algarismos, ignora null e <= 0', () => {
  const v = [null, 0, ...Array.from({ length: 100 }, (_, i) => 1000 + i * 37)];
  const b = IntelModel.quantileBreaks(v, 5);
  assert.equal(b.length, 4);
  assert.ok(b.every((x, i) => i === 0 || x > b[i - 1]));
  for (const x of b) assert.equal(x, Number(x.toPrecision(2)));
  assert.deepEqual(b, [1700, 2500, 3200, 4000]);
});

test('quantileBreaks: sem repetidos e casos degenerados', () => {
  assert.deepEqual(IntelModel.quantileBreaks([5, 5, 5, 5, 5, 5], 5), [5]);
  assert.deepEqual(IntelModel.quantileBreaks([1, 1, 1, 1, 9, 9, 9, 9], 5), [1, 9]);
  assert.deepEqual(IntelModel.quantileBreaks([null, 0, -3], 5), []);
  assert.deepEqual(IntelModel.quantileBreaks([], 5), []);
  assert.equal(IntelModel.quantileBreaks([1, 2, 3, 4, 5, 6, 7, 8], 3).length, 2);
});

test('classOf', () => {
  const b = [10, 20, 30];
  assert.equal(IntelModel.classOf(null, b), -1);
  assert.equal(IntelModel.classOf(undefined, b), -1);
  assert.deepEqual([0, 9, 10, 19, 20, 30, 99].map(v => IntelModel.classOf(v, b)), [0, 0, 1, 1, 2, 3, 3]);
  assert.equal(IntelModel.classOf(5, []), 0);
});

test('aggregateIntel: só visíveis', () => {
  const a = IntelModel.aggregateIntel(intel, snv, vis);
  assert.equal(a.vkm, 1200 * 10 + 2300 * 20 + 500 * 0);
  assert.equal(a.vkmPes, 200 * 10 + 300 * 20);
  assert.equal(a.kmVmda, 30);
  assert.equal(a.kmPav, 30);
  close(a.acidAno, (4 + 0 + 6) / 2);
  close(a.mortosAno, (2 + 0 + 0) / 2);
  assert.equal(a.tkm, 100 * 10 + 0 * 20);
  assert.equal(a.kmCarga, 30);
  const all = IntelModel.aggregateIntel(intel, snv, Uint8Array.from([1, 1, 1, 1]));
  assert.equal(all.kmPav, 35);
  assert.equal(all.kmVmda, 30);
  assert.equal(all.kmCarga, 35);
  assert.equal(all.tkm, 1000 + 50 * 5);
});

test('aggregateIntel: bloco ausente = null', () => {
  const a = IntelModel.aggregateIntel({}, snv, vis);
  assert.deepEqual(a, { vkm: null, vkmPes: null, kmVmda: null, kmPav: 30, acidAno: null, mortosAno: null, tkm: null, kmCarga: null });
});

test('taxaAcidentes', () => {
  // 730 / 2 / (1000 * 10 * 365) * 1e6 = 100
  close(IntelModel.taxaAcidentes(730, 2, 1000, 10), 100);
  assert.equal(IntelModel.taxaAcidentes(10, 2, null, 10), null);
  assert.equal(IntelModel.taxaAcidentes(10, 2, 0, 10), null);
  assert.equal(IntelModel.taxaAcidentes(10, 2, 1000, 0), null);
  assert.equal(IntelModel.taxaAcidentes(10, 2, 1000, undefined), null);
});

test('pointsOfFis', () => {
  const r = [{ fis: 3 }, { fis: 1 }, { fis: 3 }, { fis: null }];
  assert.deepEqual(IntelModel.pointsOfFis(r, 3), [0, 2]);
  assert.deepEqual(IntelModel.pointsOfFis(r, 9), []);
});

test('decodeTopo: Polygon, deltas, transform, arco invertido e junção', () => {
  const topo = {
    type: 'Topology',
    transform: { scale: [0.5, 0.25], translate: [10, 20] },
    objects: { mun: { type: 'GeometryCollection', geometries: [
      { type: 'Polygon', arcs: [[0, 1]], properties: { id: 'A' } },
      { type: 'Polygon', arcs: [[~1, ~0]], properties: { id: 'B' } },
    ] } },
    // arco 0: (0,0)->(2,0)->(2,4) ; arco 1: (2,4)->(0,4)->(0,0)
    arcs: [[[0, 0], [2, 0], [0, 4]], [[2, 4], [-2, 0], [0, -4]]],
  };
  const out = IntelModel.decodeTopo(topo);
  assert.equal(out.length, 2);
  assert.equal(out[0].id, 'A');
  // [lat, lng] = [y*0.25+20, x*0.5+10]; sem ponto repetido na junção
  assert.deepEqual(out[0].rings, [[[20, 10], [20, 11], [21, 11], [21, 10], [20, 10]]]);
  // B: arco 1 invertido ((0,0),(0,4),(2,4)) depois arco 0 invertido ((2,4),(2,0),(0,0))
  assert.deepEqual(out[1].rings, [[[20, 10], [21, 10], [21, 11], [20, 11], [20, 10]]]);
});

test('decodeTopo: MultiPolygon achata todos os anéis, buracos incluídos', () => {
  const topo = {
    transform: { scale: [1, 1], translate: [0, 0] },
    objects: { mun: { geometries: [
      { type: 'MultiPolygon', arcs: [[[0], [1]], [[2]]], properties: { id: 'M' } },
    ] } },
    arcs: [[[0, 0], [1, 0], [0, 1], [-1, 0], [0, -1]], [[0, 0], [0, 1], [1, 0], [0, -1]], [[5, 5], [1, 0], [0, 1], [-1, -1]]],
  };
  const [m] = IntelModel.decodeTopo(topo, 'mun');
  assert.equal(m.id, 'M');
  assert.equal(m.rings.length, 3);
  // arco 2 em (x,y): (5,5),(6,5),(6,6),(5,5) -> [lat, lng] = [y, x]
  assert.deepEqual(m.rings[2], [[5, 5], [5, 6], [6, 6], [5, 5]]);
});

test('decodeTopo: objeto ausente -> []', () => {
  assert.deepEqual(IntelModel.decodeTopo({ objects: {}, arcs: [] }, 'mun'), []);
});

test('formatos pt-BR', () => {
  assert.equal(IntelModel.fmtInt(12345), '12.345');
  assert.equal(IntelModel.fmtVmd(12345), '12.345 veíc./dia');
  assert.equal(IntelModel.fmtT(27463308), '27,5 Mt');
  assert.equal(IntelModel.fmtT(850000), '850 mil t');
  assert.equal(IntelModel.fmtT(950), '950 t');
  assert.equal(IntelModel.fmtPct(0.33), '33,0%');
  assert.equal(IntelModel.fmtBRL(7.34e9), 'R$ 7,34 bi');
  assert.equal(IntelModel.fmtBRL(8.5e8), 'R$ 850,0 mi');
  assert.equal(IntelModel.fmtVkm(1.2e9), '1,2 bi veíc·km/dia');
  for (const f of ['fmtInt', 'fmtVmd', 'fmtT', 'fmtPct', 'fmtBRL', 'fmtVkm']) {
    assert.equal(IntelModel[f](null), '—', f);
    assert.equal(IntelModel[f](undefined), '—', f);
  }
});

test('MODES.acidentes.fonte sem anos não quebra', () => {
  const semAnos = { trafego: { acidentes: { tipo: 'medido', n: [1, 2] } } };
  assert.doesNotThrow(() => IntelModel.MODES.acidentes.fonte(semAnos));
  assert.equal(IntelModel.MODES.acidentes.fonte(semAnos), 'PRF, DATATRAN (medido)');
  assert.equal(IntelModel.MODES.acidentes.fonte({ trafego: { acidentes: { n: [1], anos: [] } } }), 'PRF, DATATRAN (medido)');
  assert.equal(IntelModel.MODES.acidentes.fonte(intel), 'PRF, DATATRAN 2024 e 2025 (medido)');
});

test('formatos escolhem a unidade depois de arredondar', () => {
  assert.equal(IntelModel.fmtT(999600), '1,0 Mt');
  assert.equal(IntelModel.fmtT(999400), '999 mil t');
  assert.equal(IntelModel.fmtT(999.6), '1 mil t');
  assert.equal(IntelModel.fmtT(999.4), '999 t');
  assert.equal(IntelModel.fmtBRL(999.96e6), 'R$ 1,00 bi');
  assert.equal(IntelModel.fmtBRL(999.94e6), 'R$ 999,9 mi');
  assert.equal(IntelModel.fmtBRL(999999.6), 'R$ 1,0 mi');
  assert.equal(IntelModel.fmtVkm(999.96e6), '1,0 bi veíc·km/dia');
  assert.equal(IntelModel.fmtVkm(999999.6), '1,0 mi veíc·km/dia');
  assert.equal(IntelModel.fmtTkm(999.96e9), '1,0 tri t·km/ano');
});

test('formatos: NaN e infinito viram travessão', () => {
  for (const f of ['fmtInt', 'fmtVmd', 'fmtT', 'fmtPct', 'fmtBRL', 'fmtVkm', 'fmtTkm', 'fmtDec']) {
    assert.equal(IntelModel[f](NaN), '—', f);
    assert.equal(IntelModel[f](Infinity), '—', f);
    assert.equal(IntelModel[f](null), '—', f);
  }
});

test('fmtDec e fmtTkm', () => {
  assert.equal(IntelModel.fmtDec(0.2), '0,20');
  assert.equal(IntelModel.fmtDec(1234.5, 1), '1.234,5');
  assert.equal(IntelModel.fmtDec(3, 0), '3');
  assert.equal(IntelModel.fmtTkm(123456), '123.456 t·km/ano');
  assert.equal(IntelModel.fmtTkm(2.5e6), '2,5 mi t·km/ano');
  assert.equal(IntelModel.fmtTkm(1.234e11), '123,4 bi t·km/ano');
});

test('acessores e utilitários exportados', () => {
  assert.equal(IntelModel.has(0), true);
  assert.equal(IntelModel.has(NaN), false);
  assert.equal(IntelModel.has(null), false);
  assert.equal(IntelModel.sumNullable(null, null), null);
  assert.equal(IntelModel.sumNullable(3, null), 3);
  assert.equal(IntelModel.sumNullable(3, 4), 7);
  assert.equal(IntelModel.vmdaOf(intel).ano, 2023);
  assert.deepEqual(IntelModel.acidOf(intel).anos, [2024, 2025]);
  assert.equal(IntelModel.cargaOf(intel).ano_base, 2017);
  assert.equal(IntelModel.cargaOf({ carga: { tipo: 'modelado' } }), null);
  for (const f of ['vmdaOf', 'acidOf', 'cargaOf']) {
    assert.equal(IntelModel[f](null), null, f);
    assert.equal(IntelModel[f]({}), null, f);
  }
  assert.equal(IntelModel.nAnos(IntelModel.acidOf(intel)), 2);
  assert.equal(IntelModel.nAnos({}), 1);
});

test('fisIntel: números do cartão, coerentes com aggregateIntel', () => {
  const f0 = IntelModel.fisIntel(intel, snv, 0);
  assert.equal(f0.l, 1000); assert.equal(f0.p, 200); assert.equal(f0.tot, 1200);
  close(f0.pctPes, 200 / 1200);
  close(f0.acidAno, 2); close(f0.mortosAno, 1);
  close(f0.taxa, IntelModel.taxaAcidentes(4, 2, 1200, 10));
  assert.equal(f0.gsa, 100);
  // ext 0: taxa null; pesados 0 com total > 0 -> 0%
  const f2 = IntelModel.fisIntel(intel, snv, 2);
  assert.equal(f2.taxa, null); assert.equal(f2.pctPes, 0); assert.equal(f2.gsa, null);
  // sem VMDa: tot/pctPes/taxa null, acidentes seguem
  const f3 = IntelModel.fisIntel(intel, snv, 3);
  assert.equal(f3.tot, null); assert.equal(f3.pctPes, null); assert.equal(f3.taxa, null);
  close(f3.acidAno, 5);
  // soma de fisIntel bate com aggregateIntel
  const a = IntelModel.aggregateIntel(intel, snv, vis);
  let vkm = 0, acid = 0;
  for (let j = 0; j < 3; j++) { const f = IntelModel.fisIntel(intel, snv, j); vkm += (f.tot || 0) * snv.fis[j].ext; acid += f.acidAno || 0; }
  assert.equal(vkm, a.vkm); close(acid, a.acidAno);
  // sem INTEL: tudo null
  assert.deepEqual(IntelModel.fisIntel(null, snv, 0),
    { l: null, p: null, tot: null, pctPes: null, acidAno: null, mortosAno: null, taxa: null, gsa: null });
});
