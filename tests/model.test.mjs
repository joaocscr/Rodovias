import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const Model = createRequire(import.meta.url)('../src/model.js');

const dict = {
  br: ['010', '020', '040', '116'], uf: ['DF', 'PR', 'SP'], tipo: ['Eixo Principal'],
  situacao: ['Duplicada', 'Pavimentada', 'Planejada'], superficie: ['PAV', 'PLA'],
  jurisdicao: ['Federal'], adm: ['Concessão Federal', 'Federal'], ul: ['Brasília'],
};
// [codigo, iBr, iUf, iTipo, iSit, iSup, iJur, iAdm, iUl, kmIni, kmFim, ext, locIni, locFim, estCoinc, idFis]
const snv = {
  dict,
  trechos: [
    ['010BDF0010', 0, 0, 0, 0, 0, 0, 0, 0, 0, 10, 10, 'ENTR BR-020 (BRASÍLIA)', 'SOBRADINHO', '', 0],
    ['020BDF0010', 1, 0, 0, 0, 0, 0, 0, 0, 0, 10, 10, 'ENTR BR-020 (BRASÍLIA)', 'SOBRADINHO', '', 0],
    ['040BPR0010', 2, 1, 0, 1, 0, 0, 1, 0, 0, 5, 5, 'CURITIBA', 'PONTA GROSSA', '', 1],
    ['116BSP0010', 3, 2, 0, 2, 1, 0, 1, 0, 0, 2.5, 2.5, 'SÃO PAULO', 'GUARULHOS', '', 2],
  ],
  fis: [{ p: [], r: [0, 1], ext: 10 }, { p: [], r: [2], ext: 5 }, { p: [], r: [3], ext: 2.5 }],
};
const idx = Model.createIndex(snv);

function filters(spec) {
  const f = Model.emptyFilters();
  for (const [k, vals] of Object.entries(spec)) for (const v of vals) f[k].add(dict[k].indexOf(v));
  return f;
}
function agg(spec) {
  const f = filters(spec);
  return Model.aggregate(snv, f, Model.visibleFis(snv, f));
}

test('sem filtros soma físico uma vez', () => { const a = agg({}); assert.equal(a.km, 17.5); assert.equal(a.n, 3); });
test('só BR-020 conta o coincidente inteiro', () => assert.equal(agg({ br: ['020'] }).km, 10));
test('BR-010 + BR-020 conta uma vez', () => assert.equal(agg({ br: ['010', '020'] }).km, 10));
test('filtro sem resultado', () => {
  const a = agg({ uf: ['SP'], situacao: ['Duplicada'] });
  assert.equal(a.km, 0); assert.equal(a.n, 0);
  assert.deepEqual(a.porSituacao, []); assert.deepEqual(a.porAdm, []); assert.deepEqual(a.porUf, []);
});
test('quebra por situação ordenada e com pct', () => {
  const a = agg({});
  assert.deepEqual(a.porSituacao.map(x => dict.situacao[x.i]), ['Duplicada', 'Pavimentada', 'Planejada']);
  assert.ok(Math.abs(a.porSituacao[0].pct - 10 / 17.5) < 1e-9);
});
test('visibleFis marca físico se qualquer registro passa', () => {
  assert.deepEqual(Array.from(Model.visibleFis(snv, filters({ br: ['020'] }))), [1, 0, 0]);
});
test('busca BR em várias grafias', () => {
  for (const q of ['116', 'BR-116', 'br 116', ' BR116 ']) {
    const r = Model.search(idx, q)[0];
    assert.equal(r.kind, 'br'); assert.equal(r.label, 'BR-116'); assert.equal(r.iBr, 3);
  }
});
test('busca BR inexistente não inventa BR', () => assert.ok(Model.search(idx, '999').every(r => r.kind !== 'br')));
test('busca código de trecho', () => {
  const r = Model.search(idx, '040bpr')[0];
  assert.equal(r.kind, 'trecho'); assert.equal(r.iRec, 2);
});
test('busca local sem acento', () => {
  const r = Model.search(idx, 'sao paulo')[0];
  assert.equal(r.kind, 'local'); assert.equal(r.iRec, 3); assert.match(r.sub, /BR-116\/SP/);
});
test('busca vazia', () => assert.deepEqual(Model.search(idx, '  '), []));
test('normalize', () => assert.equal(Model.normalize('  São   PAULO '), 'sao paulo'));
test('fmtKm', () => { assert.equal(Model.fmtKm(131085.2), '131.085,2 km'); assert.equal(Model.fmtKm(0), '0,0 km'); });
test('busca não repete o mesmo trecho físico', () => {
  const r = Model.search(idx, 'sobradinho');
  assert.equal(r.length, 1);
  assert.equal(r[0].kind, 'local');
});
