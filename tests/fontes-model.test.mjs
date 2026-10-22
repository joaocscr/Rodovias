// Testes do modelo da aba Fontes: a lista sai só dos blocos embutidos (fontes por bloco, bases do painel, documentos dos
// leilões e consórcios, glossário), sem nada digitado; bloco novo entra sozinho, com o nome do arquivo de descrições.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const FontesModel = require('../src/fontes-model.js');

const desc = {
  roadshow: { nome: 'Carteira do Ministério' },
  snv: { nome: 'Malha federal' },
  antt: { nome: 'Concessões e pedágios (ANTT)' },
  agro: { nome: 'Produção agrícola' },
  debentures: { nome: 'Debêntures de transporte' },
};
const intel = {
  fontes: {
    base: [{ bloco: 'snv', nome: 'SNV' }, { bloco: 'roadshow', nome: 'RoadShow' }],
    fontes: [
      { bloco: 'agro', nome: 'PAM' },
      { bloco: 'antt', nome: 'Praças' },
      { bloco: 'novo', nome: 'Fonte sem descrição' },
      { bloco: 'debentures', nome: 'Negócios' },
      { bloco: 'agro', nome: 'Estoques' },
    ],
    indisponiveis: [{ nome: 'Portal fora do ar', motivo: 'sem resposta' }],
  },
};
const doc = (id, extra = {}) => Object.assign({ id, tipo: 'oficial', titulo: `Doc ${id}` }, extra);
const conc = {
  verificacao: { fontes: [doc('a'), doc('b')] },
  consorcios: [
    { nome: 'Consórcio X', fontes: [doc('b'), doc('c', { tipo: 'imprensa' })] },
    { nome: 'Consórcio Y', fontes: [] },
    { nome: 'Consórcio Z' },
  ],
};
const glossario = [
  { id: 'selic', termo: 'Taxa Selic', fonte: { nome: 'Banco Central', url: 'https://bcb.gov.br' } },
  { id: 'focus', termo: 'Boletim Focus', fonte: { nome: 'Banco Central', url: 'https://bcb.gov.br' } },
  { id: 'capex', termo: 'Capex' },
  { id: 'relicitacao', termo: 'Relicitação', fonte: { nome: 'Lei nº 13.448/2017' } },
  { id: 'vazio', termo: 'Sem nome', fonte: {} },
];

test('fontes de dados: uma linha por fonte de cada bloco, na ordem do arquivo de descrições; bloco sem descrição no fim', () => {
  const r = FontesModel.listar(intel, conc, glossario, desc);
  assert.deepEqual(r.dados.map(f => [f.bloco, f.nome]),
    [['antt', 'Praças'], ['agro', 'PAM'], ['agro', 'Estoques'], ['debentures', 'Negócios'], ['novo', 'Fonte sem descrição']]);
});

test('nome do bloco vem do arquivo de descrições; sem descrição, a chave do bloco (e o bloco é apontado)', () => {
  const r = FontesModel.listar(intel, conc, glossario, desc);
  assert.equal(r.dados.find(f => f.bloco === 'debentures').rotulo, 'Debêntures de transporte');
  assert.equal(r.dados.find(f => f.bloco === 'novo').rotulo, 'novo');
  assert.deepEqual(r.semDescricao, ['novo']);
  assert.deepEqual(r.base.map(f => f.rotulo), ['Malha federal', 'Carteira do Ministério']);
});

test('documentos: os da verificação dos leilões e os dos consórcios, cada um uma vez', () => {
  const r = FontesModel.listar(intel, conc, glossario, desc);
  assert.deepEqual(r.documentos.map(d => d.id), ['a', 'b', 'c']);
  assert.equal(r.documentos[2].tipo, 'imprensa');
});

test('glossário: uma linha por fonte citada, com os termos que a usam; termo sem fonte fica de fora', () => {
  const r = FontesModel.listar(intel, conc, glossario, desc);
  assert.deepEqual(r.glossario, [
    { nome: 'Banco Central', url: 'https://bcb.gov.br', termos: [{ id: 'selic', termo: 'Taxa Selic' }, { id: 'focus', termo: 'Boletim Focus' }] },
    { nome: 'Lei nº 13.448/2017', url: null, termos: [{ id: 'relicitacao', termo: 'Relicitação' }] },
  ]);
});

test('indisponíveis vêm do bloco de fontes', () => {
  assert.deepEqual(FontesModel.listar(intel, conc, glossario, desc).indisponiveis, intel.fontes.indisponiveis);
});

test('sem blocos: listas vazias, nada quebra', () => {
  const r = FontesModel.listar(null, null, null, null);
  assert.deepEqual(r, { dados: [], base: [], documentos: [], glossario: [], indisponiveis: [], semDescricao: [] });
  const s = FontesModel.listar({ fontes: { fontes: [{ bloco: 'x', nome: 'X' }] } }, { verificacao: {} }, [], undefined);
  assert.deepEqual(s.dados.map(f => f.rotulo), ['x']);
});
