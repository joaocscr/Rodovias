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

// ---------- Task 10: camadas e cartões de ponto ----------
test('rodLabel: BR- como está, número vira <uf>-<n>, senão o texto original', () => {
  assert.equal(IntelModel.rodLabel('BR-101', 'RJ'), 'BR-101');
  assert.equal(IntelModel.rodLabel('151', 'PR'), 'PR-151');
  assert.equal(IntelModel.rodLabel('092', 'PR'), 'PR-092');
  assert.equal(IntelModel.rodLabel('ACESSOPARASP-278', 'PR'), 'ACESSOPARASP-278');
  assert.equal(IntelModel.rodLabel('151', null), '151');
  assert.equal(IntelModel.rodLabel(null, 'PR'), '—');
  assert.equal(IntelModel.rodLabel('', 'PR'), '—');
});

test('decodeLine: primeiro par absoluto ×1e5, depois deltas -> [lat, lng]', () => {
  assert.deepEqual(IntelModel.decodeLine([-4700000, -1500000, 100, -200, 50, 0]),
    [[-15, -47], [-15.002, -46.999], [-15.002, -46.9985]]);
  assert.deepEqual(IntelModel.decodeLine([]), []);
  assert.deepEqual(IntelModel.decodeLine(null), []);
});

test('pointRadius: ∝ √VMD entre 3 e 10 px; sem VMD = mínimo', () => {
  assert.equal(IntelModel.pointRadius(100, 100), 10);
  assert.equal(IntelModel.pointRadius(25, 100), 5);
  close(IntelModel.pointRadius(49, 100), 7);
  assert.equal(IntelModel.pointRadius(1, 100), 3);
  assert.equal(IntelModel.pointRadius(null, 100), 3);
  assert.equal(IntelModel.pointRadius(0, 100), 3);
  assert.equal(IntelModel.pointRadius(50, 0), 3);
  assert.equal(IntelModel.pointRadius(400, 100), 10);
});

test('lineWeight: espessura ∝ t, mínimo 1 px', () => {
  assert.equal(IntelModel.lineWeight(100, 100), 8);
  assert.equal(IntelModel.lineWeight(50, 100), 4);
  assert.equal(IntelModel.lineWeight(1, 100), 1);
  assert.equal(IntelModel.lineWeight(null, 100), 1);
  assert.equal(IntelModel.lineWeight(10, 0), 1);
});

test('portoTipo: só os 4 tipos, com rótulos curtos', () => {
  assert.equal(IntelModel.portoTipo('Porto Organizado'), 'Porto Organizado');
  assert.equal(IntelModel.portoTipo('Terminal de uso privado'), 'TUP');
  assert.equal(IntelModel.portoTipo('Estação de transbordo de cargas'), 'ETC');
  assert.equal(IntelModel.portoTipo('Porto Público'), 'Porto público');
  for (const t of ['IP4', 'Registro - Terminal de uso privado', 'TNA', 'Plataforma Marítima', null]) assert.equal(IntelModel.portoTipo(t), null, t);
});

test('monthLabel: AAAA-MM -> mmm/aaaa', () => {
  assert.equal(IntelModel.monthLabel('2024-01'), 'jan/2024');
  assert.equal(IntelModel.monthLabel('2026-09'), 'set/2026');
  assert.equal(IntelModel.monthLabel('x'), 'x');
});

const agroIntel = {
  municipios: { ids: ['1', '2', '3', '4', '5', '6', '7'], nomes: ['A', 'B', 'C', 'D', 'E', 'F', 'G'], uf: ['MT', 'MT', 'GO', 'GO', 'PR', 'PR', 'SP'] },
  agro: {
    ids: ['1', '2', '3', '4', '5', '6', '7'], ano: 2025,
    produtos: {
      soja: [10, 20, 30, 40, 50, 0, null], milho1: [1, null, 0, 2, null, 3, null], milho2: [5, null, 1, null, null, 0, null],
      cana: [0, 0, 0, 0, 0, 0, 0], algodao: [], trigo: [], cafe: [],
    },
    armazenagem: { periodo: '2º sem/2025', cap: [100, null, 0, 300, 400, 500, 600], sigilo: [0, 1, 0, 0, 0, 0, 0] },
  },
};

test('FUNDOS: 7 opções na ordem, com fonte', () => {
  assert.deepEqual(IntelModel.FUNDOS.map(f => f.label), ['Soja', 'Milho', 'Cana', 'Algodão', 'Café', 'Trigo', 'Armazenagem']);
  assert.equal(IntelModel.fundoFonte(agroIntel, 'soja'), 'IBGE PAM 2025');
  assert.equal(IntelModel.fundoFonte(agroIntel, 'armazenagem'), 'IBGE Estoques 2º sem/2025');
  assert.equal(IntelModel.fundoFonte({}, 'soja'), '—');
});

test('fundoValues: produto, milho = 1ª + 2ª safra, armazenagem; ausente -> null', () => {
  assert.deepEqual(IntelModel.fundoValues(agroIntel, 'soja'), [10, 20, 30, 40, 50, 0, null]);
  assert.deepEqual(IntelModel.fundoValues(agroIntel, 'milho'), [6, null, 1, 2, null, 3, null]);
  assert.deepEqual(IntelModel.fundoValues(agroIntel, 'armazenagem'), [100, null, 0, 300, 400, 500, 600]);
  assert.equal(IntelModel.fundoValues({}, 'soja'), null);
  assert.equal(IntelModel.fundoValues(agroIntel, 'xyz'), null);
});

test('fundoClasses: quantis sobre valores > 0; zero e sem dado = -1', () => {
  const v = [10, 20, 30, 40, 50, 0, null];
  const q = IntelModel.fundoClasses(v, 5);
  assert.deepEqual(q.breaks, IntelModel.quantileBreaks(v, 5));
  assert.deepEqual([...q.cls], [0, 1, 2, 3, 4, -1, -1]);
  assert.equal(q.min, 10); assert.equal(q.max, 50);
  const z = IntelModel.fundoClasses([0, 0, null], 5);
  assert.deepEqual([...z.cls], [-1, -1, -1]);
  assert.equal(z.max, null);
});

test('munInfo: nome, UF, 7 produtos e armazenagem com sigilo', () => {
  const m = IntelModel.munInfo(agroIntel, '2');
  assert.equal(m.nome, 'B'); assert.equal(m.uf, 'MT');
  assert.equal(m.prod.soja, 20); assert.equal(m.prod.milho1, null);
  assert.deepEqual(Object.keys(m.prod), ['soja', 'milho1', 'milho2', 'cana', 'algodao', 'trigo', 'cafe']);
  assert.equal(m.cap, null); assert.equal(m.sigilo, true);
  const a = IntelModel.munInfo(agroIntel, '1');
  assert.equal(a.cap, 100); assert.equal(a.sigilo, false); assert.equal(a.prod.algodao, null);
  assert.equal(IntelModel.munInfo(agroIntel, '999'), null);
});

test('pointInRings: par-ímpar, buraco excluído; ringsBBox', () => {
  const outer = [[0, 0], [0, 10], [10, 10], [10, 0], [0, 0]], hole = [[4, 4], [4, 6], [6, 6], [6, 4], [4, 4]];
  assert.equal(IntelModel.pointInRings(1, 1, [outer, hole]), true);
  assert.equal(IntelModel.pointInRings(5, 5, [outer, hole]), false);
  assert.equal(IntelModel.pointInRings(11, 5, [outer, hole]), false);
  assert.deepEqual(IntelModel.ringsBBox([outer, hole]), [0, 0, 10, 10]);
});

test('fonteRef: "nome · período" da fonte que casa', () => {
  const f = [{ nome: 'ANTT — Praças', periodo: '2024-01 a 2026-08' }, { nome: 'ANTT — SAT', periodo: '2025' }];
  assert.equal(IntelModel.fonteRef(f, /SAT/), 'ANTT — SAT · 2025');
  assert.equal(IntelModel.fonteRef({ nome: 'X', periodo: '2021' }, /X/), 'X · 2021');
  assert.equal(IntelModel.fonteRef(f, /nada/), '—');
  assert.equal(IntelModel.fonteRef(null, /x/), '—');
});

test('estConcLines: por entidade, feições da malha (entEst) + físicos do SNV (entFis) + traçado próprio (entGeo)', () => {
  const est = {
    malha: { p: [[100000, 200000, 100, 0], [300000, 400000, 0, 100]] },
    entidades: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
    entEst: [[1], [], [0, 9]], entFis: [[], [0], []], entGeo: [[[500000, 600000, 100, 100]], [], []],
  };
  const snvFis = { fis: [{ p: [700000, 800000, -100, 0] }] };
  const out = IntelModel.estConcLines(est, snvFis);
  assert.equal(out.length, 3);
  assert.deepEqual(out[0], [[[4, 3], [4.001, 3]], [[6, 5], [6.001, 5.001]]]);
  // Rota de Santa Maria: só entFis
  assert.deepEqual(out[1], [[[8, 7], [8, 6.999]]]);
  // índice inválido ignorado
  assert.deepEqual(out[2], [[[2, 1], [2, 1.001]]]);
  // entFis sem SNV ou chaves ausentes não quebram
  assert.deepEqual(IntelModel.estConcLines({ malha: { p: [] }, entidades: [{}] }, null), [[]]);
  assert.deepEqual(IntelModel.estConcLines(null, snvFis), []);
});

test('distToSegment: distância de ponto a segmento (pixels)', () => {
  assert.equal(IntelModel.distToSegment(5, 3, 0, 0, 10, 0), 3);
  assert.equal(IntelModel.distToSegment(-4, 3, 0, 0, 10, 0), 5);
  assert.equal(IntelModel.distToSegment(13, 4, 0, 0, 10, 0), 5);
  assert.equal(IntelModel.distToSegment(3, 4, 0, 0, 0, 0), 5);
});

// ---------- Task 11: ficha com ANTT, ficha estadual, Projetos com esfera e pipeline ----------
const antt = {
  capas: {
    novo: { nome: 'Novo', situacao: 'ativa', sucessor: null, controladora: 'C', url: 'https://x/novo' },
    velho: { nome: 'Velho', situacao: 'encerrada', sucessor: 'novo', url: 'https://x/velho' },
    partido: { nome: 'Partido', situacao: 'encerrada', sucessor: 'outro', sucessores: ['outro', 'novo'] },
    solto: { nome: 'Solto', situacao: 'ativa', sucessor: null },
  },
  series: {
    novo: { anos: [2024, 2025], receita: [10, 20], investimento: [1, null], custo: [null, 3] },
    velho: { anos: [2024, 2025], receita: [5, null], investimento: [null, null], custo: [null, null] },
    partido: { anos: [2024, 2025], receita: [null, null], investimento: [null, null], custo: [null, null] },
  },
  pracas: { campos: ['nome', 'ent', 'vmd', 'pesados', 'receita'], linhas: [
    ['P1', 'novo', 100, 25, 1000], ['P2', 'novo', 300, null, null], ['P3', 'novo', null, null, 500], ['PX', 'outro', 900, 1, 9],
  ] },
  obras: { campos: ['ent', 'descricao', 'br', 'uf', 'km_i', 'km_f', 'previsto', 'executado'], linhas: [
    ['novo', 'A', 'BR-1', 'MT', 1, 2, 1, 1], ['novo', 'B', 'BR-1', 'MT', 3, null, 0.5, 0.2], ['novo', 'C', 'BR-1', 'MT', 4, 5, 0.9, 0],
    ['novo', 'D', 'BR-1', 'MT', 6, 7, null, null], ['novo', 'E', 'BR-1', 'MT', 8, 9, 1, 1.2], ['outro', 'Z', 'BR-2', 'PA', 0, 0, 1, 0],
  ] },
};

test('anttCapa e anttAnteriores: sucessor ou sucessores apontando para o id', () => {
  const I = { antt };
  assert.equal(IntelModel.anttCapa(I, 'novo').controladora, 'C');
  assert.equal(IntelModel.anttCapa(I, 'nada'), null);
  assert.equal(IntelModel.anttCapa({}, 'novo'), null);
  assert.deepEqual(IntelModel.anttAnteriores(I, 'novo').map(c => c.id), ['velho', 'partido']);
  assert.deepEqual(IntelModel.anttAnteriores(I, 'outro').map(c => c.id), ['partido']);
  assert.deepEqual(IntelModel.anttAnteriores(I, 'solto'), []);
  assert.deepEqual(IntelModel.anttAnteriores(null, 'novo'), []);
});

test('anttSeries: série do contrato e dos anteriores (rotuladas), sem séries vazias', () => {
  const s = IntelModel.anttSeries({ antt }, 'novo');
  assert.deepEqual(s.map(x => [x.id, x.nome, x.anterior]), [['novo', 'Novo', false], ['velho', 'Velho', true]]);
  assert.deepEqual(s[0].receita, [10, 20]);
  assert.deepEqual(IntelModel.anttSeries({ antt }, 'solto'), []);
  assert.deepEqual(IntelModel.anttSeries({}, 'novo'), []);
});

test('pracasDe: praças da entidade por VMD decrescente (sem VMD no fim), % pesados e soma da receita', () => {
  const r = IntelModel.pracasDe({ antt }, 'novo');
  assert.deepEqual(r.linhas.map(p => p.nome), ['P2', 'P1', 'P3']);
  assert.equal(r.linhas[1].pctPes, 0.25);
  assert.equal(r.linhas[0].pctPes, null);
  assert.equal(r.receita, 1500);
  assert.deepEqual(IntelModel.pracasDe({ antt }, 'nada'), { linhas: [], receita: null });
  assert.deepEqual(IntelModel.pracasDe({}, 'novo'), { linhas: [], receita: null });
});

test('obrasResumo: concluídas (≥ 1), em andamento, não iniciadas e as maiores previstas ainda não concluídas', () => {
  const o = IntelModel.obrasResumo({ antt }, 'novo', 10);
  assert.deepEqual([o.total, o.concluidas, o.andamento, o.naoIniciadas, o.semDado], [5, 2, 1, 1, 1]);
  assert.deepEqual(o.top.map(x => x.descricao), ['C', 'B', 'D']);
  assert.deepEqual(IntelModel.obrasResumo({ antt }, 'novo', 1).top.map(x => x.descricao), ['C']);
  assert.equal(IntelModel.obrasResumo({ antt }, 'nada').total, 0);
  assert.equal(IntelModel.obrasResumo({}, 'novo').total, 0);
});

const pipeline = {
  status: [{ key: 'estudo', label: 'Em estudo' }, { key: 'edital', label: 'Edital publicado' }, { key: 'leiloado', label: 'Leiloado' }],
  itens: [
    { id: 'a', nome: 'A', esfera: 'federal', status: 'estudo', data_prevista: null, ent: null, verificado: true },
    { id: 'b', nome: 'B', esfera: 'estadual', status: 'edital', data_prevista: '2027-06', ent: null, verificado: false },
    { id: 'c', nome: 'C', esfera: 'federal', status: 'estudo', data_prevista: '2026-11-12', ent: 'novo', verificado: true },
    { id: 'd', nome: 'D', esfera: 'federal', status: 'leiloado', data_prevista: '2027-06-01', ent: 'novo', verificado: true },
  ],
};

test('pipelineRows: ordenado por data prevista crescente, sem data no fim; filtro por esfera e status', () => {
  const r = IntelModel.pipelineRows({ pipeline });
  assert.deepEqual(r.map(x => x.id), ['c', 'b', 'd', 'a']);
  assert.deepEqual(IntelModel.filterPipeline(r, { esfera: new Set(['federal']) }).map(x => x.id), ['c', 'd', 'a']);
  assert.deepEqual(IntelModel.filterPipeline(r, { status: new Set(['estudo']) }).map(x => x.id), ['c', 'a']);
  assert.deepEqual(IntelModel.filterPipeline(r, { esfera: new Set(['estadual']), status: new Set(['estudo']) }), []);
  assert.deepEqual(IntelModel.filterPipeline(r, {}).length, 4);
  assert.deepEqual(IntelModel.pipelineRows({}), []);
});

test('pipelineCounts, statusLabel e pipelineDe', () => {
  const r = IntelModel.pipelineRows({ pipeline });
  assert.deepEqual(IntelModel.pipelineCounts(r, pipeline.status), [
    { key: 'estudo', label: 'Em estudo', n: 2 }, { key: 'edital', label: 'Edital publicado', n: 1 }, { key: 'leiloado', label: 'Leiloado', n: 1 }]);
  assert.deepEqual(IntelModel.pipelineCounts(r.slice(0, 1), pipeline.status).map(x => x.key), ['estudo']);
  assert.equal(IntelModel.statusLabel({ pipeline }, 'edital'), 'Edital publicado');
  assert.equal(IntelModel.statusLabel({ pipeline }, 'xyz'), 'xyz');
  assert.equal(IntelModel.statusLabel({}, null), '—');
  assert.deepEqual(IntelModel.pipelineDe({ pipeline }, 'novo').map(x => x.id), ['c', 'd']);
  assert.deepEqual(IntelModel.pipelineDe({}, 'novo'), []);
});

const estaduais = {
  entidades: [
    { id: 'sp-a', nome: 'A', esfera: 'estadual', uf: 'SP', rodovias: ['SP-330', 'SP-348'], estado: 'vigente', assinatura: '1998-05-01',
      km_decl: 319.8, capex_bi: 14.3, capex_ref: '2024', grupo: 'Motiva', trechos: [{ rod: 'SP-330', km_i: 11, km_f: 158.5 }] },
    { id: 'mt-b', nome: 'B', uf: 'MT', rodovias: [], estado: 'encerrado', assinatura: null, km_decl: null, capex_bi: null, capex_ref: null, grupo: null },
  ],
};

test('estaduaisRows: mesmo formato de comparatorRows, esfera estadual e estados próprios', () => {
  const r = IntelModel.estaduaisRows({ estaduais });
  assert.equal(r.length, 2);
  assert.deepEqual(r[0], {
    idx: null, k: 0, esfera: 'estadual', id: 'sp-a', nome: 'A', brsUfs: 'SP-330/SP-348/SP', estado: 'estadual_vigente', dataChave: '1998-05-01',
    km: 319.8, capex: 14.3, opex: null, dataBase: '2024', capexKm: null, wacc: null, tkm: null, desagio: null,
    participantes: null, vencedor: 'Motiva', ano: null, tipo: null, ufs: ['SP'], ficha: {},
  });
  assert.equal(r[1].brsUfs, 'MT');
  assert.equal(r[1].estado, 'estadual_encerrado');
  assert.equal(r[1].km, null);
  assert.deepEqual(IntelModel.EST_ESTADOS.map(s => s.label), ['Contrato estadual vigente', 'Contrato estadual encerrado']);
  assert.deepEqual(IntelModel.estaduaisRows({}), []);
});

test('byEsfera, estIndex e trechosLabel', () => {
  const rows = [{ esfera: 'federal' }, { esfera: 'estadual' }];
  assert.equal(IntelModel.byEsfera(rows, new Set()).length, 2);
  assert.deepEqual(IntelModel.byEsfera(rows, new Set(['estadual'])), [{ esfera: 'estadual' }]);
  assert.equal(IntelModel.estIndex({ estaduais }, 'mt-b'), 1);
  assert.equal(IntelModel.estIndex({ estaduais }, 'x'), -1);
  assert.equal(IntelModel.estIndex(null, 'x'), -1);
  assert.deepEqual(IntelModel.trechosLabel([{ rod: 'SP-330', km_i: 11, km_f: 158.5 }, { rod: 'SP-300', km_i: null, km_f: null }]),
    ['SP-330: km 11,0 a 158,5', 'SP-300']);
  assert.deepEqual(IntelModel.trechosLabel(null), []);
});

// ---------- Task 12: abas Tráfego, Cargas e Fontes ----------
const rec = (cod, br, uf, ini, fim) => [cod, br, uf, 0, 0, 0, 0, 0, 0, 0, 0, 0, ini, fim, '', 0];
const snvT = {
  dict: { br: ['116', '163'], uf: ['SP', 'MT'] },
  trechos: [rec('116BSP0010', 0, 0, 'A', 'B'), rec('116BSP0020', 0, 0, 'B', 'C'), rec('163BMT0010', 1, 1, 'Sinop', 'Sorriso'),
    rec('163BMT0020', 1, 1, 'Sorriso', 'Lucas'), rec('116BMT0010', 0, 1, 'X', 'Y')],
  fis: [{ r: [0], ext: 8 }, { r: [1], ext: 4 }, { r: [2], ext: 20 }, { r: [3, 4], ext: 5 }],
};
const intelT = {
  trafego: {
    vmda: { ano: 2023, l: [1000, 3000, 500, null], p: [500, 1000, 1500, null] },
    acidentes: { anos: [2024, 2025], n: [40, 20, 30, 10], m: [4, 2, 6, 2] },
    abcr: { meses: ['2024-01', '2024-02', '2025-01', '2025-02'], leves: [90, 100, 110, 120], pesados: [80, 90, 100, 110], total: [100, 110, 120, 130] },
  },
  antt: { pracas: {
    campos: ['nome', 'br', 'uf', 'lat', 'lon', 'fis', 'vmd', 'leves', 'pesados'],
    linhas: [['A', 'BR-116', 'SP', -23, -46, 0, 1000, 600, 400], ['B', 'BR-163', 'MT', -12, -55, 2, 3000, 1000, 2000],
      ['C', 'BR-163', 'MT', -13, -55, 2, null, null, null], ['D', 'BR-116', 'SP', -24, -47, 1, 500, 500, null]],
    serie_meses: ['2024-01', '2024-02'],
    serie_l: [[10, 20], [30, null], [1, 2], [5, 5]], serie_p: [[1, 2], [3, 4], [null, null], [5, 5]],
  } },
};

test('trafegoKpis: praças com contagem, VMD somado, % pesados ponderado, veíc·km/dia e PRF por ano', () => {
  const k = IntelModel.trafegoKpis(intelT, snvT);
  assert.deepEqual(k, { nPracas: 3, vmdTotal: 4500, pctPes: 0.6, vkm: 68000, acidAno: 50, mortosAno: 7 });
  assert.deepEqual(IntelModel.trafegoKpis({}, snvT), { nPracas: null, vmdTotal: null, pctPes: null, vkm: null, acidAno: null, mortosAno: null });
});

test('pracasRanking: maiores VMD com índice da linha; sem VMD fica de fora', () => {
  const r = IntelModel.pracasRanking(intelT, 2);
  assert.deepEqual(r.map(p => [p.i, p.nome, p.vmd, p.leves, p.pesados]), [[1, 'B', 3000, 1000, 2000], [0, 'A', 1000, 600, 400]]);
  assert.equal(IntelModel.pracasRanking(intelT).length, 3);
  assert.deepEqual(IntelModel.pracasRanking({}), []);
});

test('pracasSerie: soma mensal só das praças com todos os meses (leves e pesados)', () => {
  assert.deepEqual(IntelModel.pracasSerie(intelT), { meses: ['2024-01', '2024-02'], l: [15, 25], p: [6, 7], n: 2, total: 4 });
  assert.equal(IntelModel.pracasSerie({}), null);
});

test('abcrSazonal: média por mês do calendário; mês sem dado = null', () => {
  const s = IntelModel.abcrSazonal(intelT.trafego.abcr, 'total');
  assert.equal(s.length, 12);
  assert.deepEqual(s.slice(0, 3), [110, 120, null]);
  assert.deepEqual(IntelModel.abcrSazonal(intelT.trafego.abcr, 'pesados').slice(0, 2), [90, 100]);
  assert.equal(IntelModel.abcrSazonal(null, 'total'), null);
});

test('acidentesPorUf: média anual por UF do trecho principal, maior primeiro', () => {
  assert.deepEqual(IntelModel.acidentesPorUf(intelT, snvT), [{ uf: 'SP', acidAno: 30, mortosAno: 3 }, { uf: 'MT', acidAno: 20, mortosAno: 4 }]);
  assert.deepEqual(IntelModel.acidentesPorUf({}, snvT), []);
});

test('taxaPorBrUf: acidentes por 10⁶ veíc·km por BR/UF, só trechos com VMDa e extensão mínima', () => {
  const r = IntelModel.taxaPorBrUf(intelT, snvT, { minKm: 10 });
  assert.deepEqual(r.map(x => [x.br, x.uf, x.km, x.acidAno, x.vkm]), [['BR-116', 'SP', 12, 30, 28000], ['BR-163', 'MT', 20, 15, 40000]]);
  close(r[0].taxa, 30 / (28000 * 365) * 1e6);
  close(r[1].taxa, 15 / (40000 * 365) * 1e6);
  assert.deepEqual(IntelModel.taxaPorBrUf(intelT, snvT, { minKm: 15 }).map(x => x.br), ['BR-163']);
  assert.equal(IntelModel.taxaPorBrUf(intelT, snvT, { minKm: 10, n: 1 }).length, 1);
  assert.deepEqual(IntelModel.taxaPorBrUf({}, snvT), []);
});

const intelC = {
  municipios: { ids: ['1', '2', '3'], nomes: ['Sorriso', 'Lucas', 'Rio Verde'], uf: ['MT', 'MT', 'GO'], centro: [[-55.7, -12.5], [-55.9, -13], [-50.9, -17.8]] },
  agro: { ids: ['1', '2', '3'], ano: 2025,
    produtos: { soja: [100, null, 50], milho1: [10, 0, 5], milho2: [200, 20, null], cana: [0, 0, 1000], algodao: [], trigo: [], cafe: [] },
    armazenagem: { periodo: '2º sem/2025', cap: [1000, null, 500], sigilo: [0, 1, 0] } },
  multimodal: {
    exportacao: { ano: 2025, campos: ['sh4', 'uf', 'urf', 'via', 'kg'], linhas: [
      ['1201', 'MT', 'SANTOS', 'MARITIMA', 5e6], ['1201', 'MT', 'SANTOS', 'RODOVIARIA', 1e6], ['1201', 'GO', 'PARANAGUA', 'MARITIMA', 2e6],
      ['1005', 'MT', 'SANTOS', 'MARITIMA', 3e6], ['1005', 'GO', 'SANTOS', 'MARITIMA', 1e6]], sh4: { 1201: 'Soja', 1005: 'Milho', 1701: 'Açúcar' } },
    siade: [{ o: 'Rondonópolis', uo: 'MT', d: 'Santos', ud: 'SP', prod: 'Soja', t: 100 }, { o: 'Rondonópolis', uo: 'MT', d: 'Santos', ud: 'SP', prod: 'Milho', t: 50 },
      { o: 'Rio Verde', uo: 'GO', d: 'Santos', ud: 'SP', prod: 'Soja', t: 120 }, { o: 'X', uo: 'MT', d: 'Y', ud: 'SP', prod: 'Açúcar', t: 1000 }],
    fretes: { mes: 'ago/2026', campos: ['origem', 'uf_o', 'destino', 'uf_d', 'km', 'rs_t', 'qualidade'], linhas: [
      ['Sorriso', 'MT', 'Santos', 'SP', 2000, 400, 'ok'], ['Rio Verde', 'GO', 'Santos', 'SP', 1000, 250, 'aprox'], ['Q', 'MT', 'W', 'PR', null, null, 'ok']] },
  },
  carga: { ano_base: 2017, gsa: [100, null, 300, 200] },
};

test('cargasKpis: soja, milho (1ª + 2ª), cana, armazenagem e exportação de soja e milho (t)', () => {
  assert.deepEqual(IntelModel.cargasKpis(intelC), { soja: 150, milho: 235, cana: 1000, cap: 1500, expSoja: 8000, expMilho: 4000 });
  assert.deepEqual(IntelModel.cargasKpis({}), { soja: null, milho: null, cana: null, cap: null, expSoja: null, expMilho: null });
});

test('producaoPorUf: soja e milho por safra somados por UF, maior primeiro', () => {
  assert.deepEqual(IntelModel.producaoPorUf(intelC), [{ uf: 'MT', soja: 100, milho1: 10, milho2: 220 }, { uf: 'GO', soja: 50, milho1: 5, milho2: 0 }]);
  assert.deepEqual(IntelModel.producaoPorUf({}), []);
});

test('topMunicipios: maiores produtores com índice, nome e UF; null e zero fora', () => {
  assert.deepEqual(IntelModel.topMunicipios(intelC, 'soja', 5), [
    { k: 0, id: '1', nome: 'Sorriso', uf: 'MT', v: 100 }, { k: 2, id: '3', nome: 'Rio Verde', uf: 'GO', v: 50 }]);
  assert.equal(IntelModel.topMunicipios(intelC, 'soja', 1).length, 1);
  assert.deepEqual(IntelModel.topMunicipios({}, 'soja'), []);
});

test('exportação: produtos com fluxo, por URF (t) e matriz UF × URF', () => {
  assert.deepEqual(IntelModel.exportProdutos(intelC), [{ sh4: '1201', nome: 'Soja', t: 8000 }, { sh4: '1005', nome: 'Milho', t: 4000 }]);
  assert.deepEqual(IntelModel.exportPorUrf(intelC, '1201'), [{ urf: 'SANTOS', t: 6000 }, { urf: 'PARANAGUA', t: 2000 }]);
  assert.deepEqual(IntelModel.exportPorUrf(intelC, '1201', 1), [{ urf: 'SANTOS', t: 6000 }]);
  assert.deepEqual(IntelModel.exportMatriz(intelC, '1201'), { ufs: ['MT', 'GO'], urfs: ['SANTOS', 'PARANAGUA'], m: [[6000, null], [null, 2000]] });
  assert.deepEqual(IntelModel.exportMatriz(intelC, '1201', 1, 1), { ufs: ['MT'], urfs: ['SANTOS'], m: [[6000]] });
  assert.deepEqual(IntelModel.exportProdutos({}), []);
  assert.deepEqual(IntelModel.exportPorUrf({}, '1201'), []);
  assert.deepEqual(IntelModel.exportMatriz({}, '1201'), { ufs: [], urfs: [], m: [] });
});

test('siadePares: pares origem → destino somando os produtos pedidos, partes na ordem dos produtos', () => {
  assert.deepEqual(IntelModel.siadePares(intelC, ['Soja', 'Milho'], 15), [
    { o: 'Rondonópolis', uo: 'MT', d: 'Santos', ud: 'SP', t: 150, parts: [100, 50] },
    { o: 'Rio Verde', uo: 'GO', d: 'Santos', ud: 'SP', t: 120, parts: [120, 0] }]);
  assert.equal(IntelModel.siadePares(intelC, ['Soja', 'Milho'], 1).length, 1);
  assert.deepEqual(IntelModel.siadePares({}, ['Soja']), []);
});

test('fretesRows: linhas com R$/t·km (null sem distância) e flag de origem aproximada', () => {
  const r = IntelModel.fretesRows(intelC);
  assert.equal(r.length, 3);
  assert.equal(r[0].rs_tkm, 0.2);
  assert.equal(r[0].aprox, false);
  assert.equal(r[1].aprox, true);
  assert.equal(r[2].rs_tkm, null);
  assert.deepEqual(IntelModel.fretesRows({}), []);
});

test('cargaTop: físicos com maior carga agrícola modelada, com BR/UF e locais do trecho principal', () => {
  assert.deepEqual(IntelModel.cargaTop(intelC, snvT, 2), [
    { j: 2, br: 'BR-163', uf: 'MT', ini: 'Sinop', fim: 'Sorriso', gsa: 300 }, { j: 3, br: 'BR-163', uf: 'MT', ini: 'Sorriso', fim: 'Lucas', gsa: 200 }]);
  assert.deepEqual(IntelModel.cargaTop({}, snvT), []);
});

test('fmtDia e fontesData: dd/mm/aaaa e listas com padrão vazio', () => {
  assert.equal(IntelModel.fmtDia('2026-10-20'), '20/10/2026');
  assert.equal(IntelModel.fmtDia(null), '—');
  assert.equal(IntelModel.fmtDia('2026'), '2026');
  const f = IntelModel.fontesData({ fontes: { fontes: [{ nome: 'A' }], indisponiveis: [{ nome: 'B' }] } });
  assert.deepEqual(f, { fontes: [{ nome: 'A' }], indisponiveis: [{ nome: 'B' }], base: [] });
  assert.equal(IntelModel.fontesData({}), null);
});


test('fonteTipo: "nome · período · medido|modelado" (tipo da fonte ou do bloco)', () => {
  const b = { tipo: 'medido', fonte: [{ nome: 'ANTT — Praças', periodo: '2025' }, { nome: 'VMDa', periodo: '2023', tipo: 'modelado' }] };
  assert.equal(IntelModel.fonteTipo(b, /Praças/), 'ANTT — Praças · 2025 · medido');
  assert.equal(IntelModel.fonteTipo(b, /VMDa/), 'VMDa · 2023 · modelado');
  assert.equal(IntelModel.fonteTipo({ fonte: { nome: 'X' } }, /X/), 'X');
  assert.equal(IntelModel.fonteTipo(b, /nada/), '—');
  assert.equal(IntelModel.fonteTipo(null, /./), '—');
  // tipo explícito quando nem a fonte nem o bloco o têm (ex.: antt.pracas.tipo)
  assert.equal(IntelModel.fonteTipo({ fonte: [{ nome: 'ANTT', periodo: '2025' }] }, /ANTT/, 'medido'), 'ANTT · 2025 · medido');
  assert.equal(IntelModel.fonteTipo(b, /VMDa/, 'medido'), 'VMDa · 2023 · modelado');
  // período AAAA-MM em pt-BR
  assert.equal(IntelModel.fonteTipo({ tipo: 'medido', fonte: [{ nome: 'P', periodo: '2024-01 a 2026-08' }] }, /P/), 'P · jan/2024 a ago/2026 · medido');
});

test('fmtPeriodo: AAAA-MM vira mmm/aaaa; anos, intervalos de anos e datas ficam como estão', () => {
  assert.equal(IntelModel.fmtPeriodo('2016-10 a 2026-09'), 'out/2016 a set/2026');
  assert.equal(IntelModel.fmtPeriodo('2024-01 a 2026-08'), 'jan/2024 a ago/2026');
  assert.equal(IntelModel.fmtPeriodo('2010-2025'), '2010-2025');
  assert.equal(IntelModel.fmtPeriodo('planejamentos 2023-2026'), 'planejamentos 2023-2026');
  assert.equal(IntelModel.fmtPeriodo('2024-13'), '2024-13');
  assert.equal(IntelModel.fmtPeriodo('14/10/2026'), '14/10/2026');
  assert.equal(IntelModel.fmtPeriodo(null), '—');
});

test('fmtMt: t em Mt com 2 casas; abaixo de 0,005 Mt vira "< 0,01"; ausente = —', () => {
  assert.equal(IntelModel.fmtMt(14784148.77), '14,78');
  assert.equal(IntelModel.fmtMt(5000), '0,01');
  assert.equal(IntelModel.fmtMt(1560.652), '< 0,01');
  assert.equal(IntelModel.fmtMt(0), '0,00');
  assert.equal(IntelModel.fmtMt(null), '—');
});
