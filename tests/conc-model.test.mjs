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

// ---------- v4: origem dos campos de leilão ----------
const vf = (tipo, o = {}) => Object.assign({ tipo, nao_localizado: false, fontes: [], roadshow: null }, o);
test('comparatorRows traz desagioOrigem', () => {
  const rows = ConcModel.comparatorRows({ entidades: [
    ent({ id: 'i', nome: 'Imprensa', estado: 'vigente', desagio: 12.5, verif: { desagio: vf('imprensa') } }),
    ent({ id: 'r', nome: 'Só RoadShow', estado: 'vigente', desagio: 30 }),
    ent({ id: 's', nome: 'Sem deságio', estado: 'programa' }),
    ent({ id: 'o', nome: 'Oficial', estado: 'vigente', desagio: 8, verif: { desagio: vf('oficial') } }),
    ent({ id: 'n', nome: 'Não localizado', estado: 'vigente', verif: { desagio: vf(null, { nao_localizado: true }) } }),
    ent({ id: 'v', nome: 'Verif sem deságio', estado: 'vigente', desagio: 5, verif: { leilao: vf('oficial') } }),
  ] });
  assert.deepEqual(rows.map(r => r.desagioOrigem),
    ['imprensa — não oficial', 'RoadShow', null, 'oficial', 'não localizado em fonte oficial', 'RoadShow']);
});
test('rotuloOrigem e origemCampo', () => {
  assert.deepEqual(['oficial', 'roadshow', 'imprensa', null, undefined].map(ConcModel.rotuloOrigem),
    ['oficial', 'RoadShow', 'imprensa — não oficial', 'não localizado em fonte oficial', 'não localizado em fonte oficial']);
  const e = ent({ leilao: '2025-01-01', verif: { leilao: vf('roadshow'), assinatura: vf('oficial', { nao_localizado: true }) } });
  assert.equal(ConcModel.origemCampo(e, 'leilao'), 'RoadShow');
  assert.equal(ConcModel.origemCampo(e, 'assinatura'), 'não localizado em fonte oficial');
  assert.equal(ConcModel.origemCampo(e, 'desagio'), null);
});
test('participantesExibidos: um só vencedor, o verificado', () => {
  const V = vf('oficial');
  // proponente diferente (nome, grupo e deságio): o verificado entra no topo; a linha do RoadShow perde a marca
  const lista = [{ grupo: 'TPI (Antigo Consórcio BRV)', desagio: null, vencedor: true }, { grupo: 'Outro', desagio: 4, vencedor: false }];
  const fora = ConcModel.participantesExibidos(ent({ grupo_vencedor: 'Consórcio BRV', desagio: 39.99,
    participantes_lista: lista, verif: { grupo_vencedor: V, desagio: V } }));
  assert.deepEqual(fora.map(p => [p.grupo, p.desagio, p.vencedor, !!p.verificado]),
    [['Consórcio BRV', 39.99, true, true], ['TPI (Antigo Consórcio BRV)', null, false, false], ['Outro', 4, false, false]]);
  assert.equal(lista[0].vencedor, true, 'não altera a entidade');
  // mesmo proponente com outra grafia e deságio do RoadShow diferente: a linha dele, com o valor exibido
  const cel = ConcModel.participantesExibidos(ent({ grupo_vencedor: 'Consórcio Caminhos', desagio: 8,
    participantes_lista: [{ grupo: 'Consórcio Caminhos (Fundo XP)', desagio: 9, vencedor: true }, { grupo: 'BTG', desagio: null, vencedor: false }],
    verif: { grupo_vencedor: V, desagio: V } }));
  assert.deepEqual(cel.map(p => [p.grupo, p.desagio, p.vencedor]), [['Consórcio Caminhos', 8, true], ['BTG', null, false]]);
  assert.deepEqual(cel[0].roadshow, { grupo: 'Consórcio Caminhos (Fundo XP)', desagio: 9 });
  // acento, caixa, pontuação, prefixo e nome entre parênteses; marca só a linha certa
  const g = (venc, nomes, o = {}) => ConcModel.participantesExibidos(ent(Object.assign({ grupo_vencedor: venc, desagio: 5,
    participantes_lista: nomes.map((n, i) => ({ grupo: n, desagio: i ? 1 : 5, vencedor: i === 1 })), verif: { grupo_vencedor: V } }, o)), o.aliases)
    .map(p => p.vencedor);
  assert.deepEqual(g('OUTRO S.A.', ['Réu', 'Outro SA']), [false, true]);
  assert.deepEqual(g('Reúne Participações', ['Reune', 'Outro']), [true, false]);
  assert.deepEqual(g('Réu Participações', ['Reu', 'Outro']), [true, false, false], 'prefixo curto (< 4) não basta');
  assert.deepEqual(g('CS Infra S.A.', ['CSINFRA (CS Infra S. A.)', 'Outro']), [true, false]);
  assert.equal(g('Odebrecht Transport S.A.', ['Odebrecht Transport', 'X'])[0], true);
  // mesmo grupo econômico pelos aliases
  const al = [{ nome: 'Consórcio ECO', grupo: 'Eco' }, { nome: 'Ecorod', grupo: 'Eco' }];
  const viaAlias = ConcModel.participantesExibidos(ent({ grupo_vencedor: 'Consórcio ECO', desagio: 16,
    participantes_lista: [{ grupo: 'Ecorod', desagio: null, vencedor: true }], verif: { grupo_vencedor: V, desagio: V } }), al);
  assert.deepEqual(viaAlias.map(p => [p.grupo, p.desagio, p.vencedor]), [['Consórcio ECO', 16, true]]);
  assert.deepEqual(viaAlias[0].roadshow, { grupo: 'Ecorod', desagio: null });
  // sem nome em comum, mas a linha marcada pelo RoadShow tem o mesmo deságio: é o lance vencedor
  const mesmoLance = ConcModel.participantesExibidos(ent({ grupo_vencedor: 'Infra Brasil Holding', desagio: 18.25,
    participantes_lista: [{ grupo: 'Holding XXI (Patria)', desagio: 18.25, vencedor: true }], verif: { grupo_vencedor: V } }));
  assert.deepEqual(mesmoLance.map(p => [p.grupo, p.vencedor]), [['Infra Brasil Holding', true]]);
  // sem verificação do vencedor: lista como veio
  assert.deepEqual(ConcModel.participantesExibidos(ent({ grupo_vencedor: 'Consórcio X', participantes_lista: lista })), lista);
  assert.deepEqual(ConcModel.participantesExibidos(ent({})), []);
});
