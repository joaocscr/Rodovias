// Testes das partes puras do Csv (célula, montagem, nome de arquivo); a tabela/DOM é coberta no e2e.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Csv = require('../src/csv.js');

test('Csv.cell protege e escapa', () => {
  assert.equal(Csv.cell('=1+1'), '"\'=1+1"');
  assert.equal(Csv.cell('-5'), '"\'-5"');
  assert.equal(Csv.cell('a;b'), '"a;b"');
  assert.equal(Csv.cell('diz "x"'), '"diz ""x"""');
  assert.equal(Csv.cell(null), '""');
  assert.equal(Csv.cell(undefined), '""');
  assert.equal(Csv.cell('+1'), '"\'+1"');
  assert.equal(Csv.cell('@soma'), '"\'@soma"');
  assert.equal(Csv.cell('\tx'), '"\'\tx"');
  assert.equal(Csv.cell('\rx'), '"\'\rx"');
  assert.equal(Csv.cell(12.5), '"12.5"');
});

test('Csv.build usa BOM, ; e CRLF', () => {
  assert.equal(Csv.build(['A', 'B'], [['1', '2']]), '﻿"A";"B"\r\n"1";"2"');
  assert.equal(Csv.build(['A'], []), '﻿"A"');
});

test('Csv.filename', () => {
  assert.equal(Csv.filename('Participantes 2007–2026', new Date('2026-10-21T12:00:00')), 'participantes-2007-2026-2026-10-21.csv');
  assert.equal(Csv.filename('Deságio médio (%)', new Date('2026-01-05T12:00:00')), 'desagio-medio-2026-01-05.csv');
  assert.equal(Csv.filename('', new Date('2026-01-05T12:00:00')), 'tabela-2026-01-05.csv');
});
