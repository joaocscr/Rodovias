// Testes das partes puras do Glossario (links, busca, ordem); a aba montada no DOM é coberta no e2e.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const Glossario = require('../src/glossario.js');
const dados = JSON.parse(fs.readFileSync(new URL('../data/glossario.json', import.meta.url), 'utf8'));

const amostra = [
  { id: 'vmda', termo: 'Volume médio diário anual', sigla: 'VMDa', definicao: 'Média diária de veículos no ano.', categorias: ['Malha e tráfego'] },
  { id: 'desagio', termo: 'Deságio', definicao: 'Desconto sobre a tarifa-teto.', categorias: ['Concessões e leilões'] },
  { id: 'debenture', termo: 'Debênture', definicao: 'Título de dívida de empresa.', categorias: ['Debêntures e juros'] },
  { id: 'ntn-b', termo: 'Nota do Tesouro Nacional, série B', sigla: 'NTN-B', definicao: 'Título público com IPCA.', categorias: ['Debêntures e juros'] },
];

test('link usa a sigla (ou o termo) como texto e o href da rota do glossário', () => {
  Glossario.init(amostra);
  assert.equal(Glossario.link('vmda'), '<a href="#glossario/vmda" class="glossario-link">VMDa</a>');
  assert.equal(Glossario.link('desagio'), '<a href="#glossario/desagio" class="glossario-link">Deságio</a>');
  assert.equal(Glossario.link('ntn-b', 'a NTN-B'), '<a href="#glossario/ntn-b" class="glossario-link">a NTN-B</a>');
});

test('link escapa o texto e não quebra com id desconhecido nem sem init', () => {
  Glossario.init(amostra);
  assert.equal(Glossario.link('vmda', '<b>x</b>'), '<a href="#glossario/vmda" class="glossario-link">&lt;b&gt;x&lt;/b&gt;</a>');
  assert.equal(Glossario.link('nao-existe'), '<a href="#glossario/nao-existe" class="glossario-link">nao-existe</a>');
  Glossario.init(undefined);
  assert.equal(Glossario.link('vmda', 'VMDa'), '<a href="#glossario/vmda" class="glossario-link">VMDa</a>');
});

test('ordenar: alfabética sem acento, estável e sem mutar a entrada', () => {
  const entrada = [{ id: 'z', termo: 'Zebra' }, { id: 'e', termo: 'Édito' }, { id: 'a', termo: 'abacate' }, { id: 'd', termo: 'Deságio' }];
  const copia = JSON.stringify(entrada);
  assert.deepEqual(Glossario.ordenar(entrada).map(e => e.id), ['a', 'd', 'e', 'z']);
  assert.equal(JSON.stringify(entrada), copia);
});

test('filtrar: busca no termo, na sigla e na definição, sem acento nem caixa', () => {
  const ids = (q, c) => Glossario.filtrar(amostra, q, c).map(e => e.id);
  assert.deepEqual(ids('', ''), ['vmda', 'desagio', 'debenture', 'ntn-b']);
  assert.deepEqual(ids('desagio'), ['desagio']);
  assert.deepEqual(ids('DEBENTURE'), ['debenture']);
  assert.deepEqual(ids('vmda'), ['vmda']);
  assert.deepEqual(ids('ntn'), ['ntn-b']);
  assert.deepEqual(ids('tarifa-teto'), ['desagio']);   // na definição
  assert.deepEqual(ids('  título '), ['debenture', 'ntn-b']);
  assert.deepEqual(ids('xyz'), []);
});

test('filtrar: a categoria restringe e combina com a busca', () => {
  const ids = (q, c) => Glossario.filtrar(amostra, q, c).map(e => e.id);
  assert.deepEqual(ids('', 'Debêntures e juros'), ['debenture', 'ntn-b']);
  assert.deepEqual(ids('nota', 'Debêntures e juros'), ['ntn-b']);
  assert.deepEqual(ids('nota', 'Cargas'), []);
});

test('categorias: únicas e em ordem alfabética', () => {
  assert.deepEqual(Glossario.categorias(amostra), ['Concessões e leilões', 'Debêntures e juros', 'Malha e tráfego']);
});

test('o arquivo real: todo id de termo gera link e a busca por sigla acha o termo', () => {
  Glossario.init(dados);
  for (const e of dados) assert.ok(Glossario.link(e.id).includes(`#glossario/${e.id}"`), e.id);
  assert.ok(Glossario.filtrar(dados, 'vmda', '').some(e => e.id === 'vmda'));
  assert.ok(Glossario.filtrar(dados, 'desagio', '').some(e => e.id === 'desagio'));
  assert.ok(Glossario.filtrar(dados, 'ipca', '').length >= 2);
});
