import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const Charts = createRequire(import.meta.url)('../src/charts.js');

test('barsSvg: uma barra por item, título com valor exato, só cores da paleta', () => {
  const svg = Charts.barsSvg([{ label: '2023', value: 2 }, { label: '2024', value: 7, alt: true }], { unit: 'leilões', format: v => String(v) });
  assert.equal((svg.match(/<rect class="bar/g) || []).length, 2);
  assert.match(svg, /<title>2024: 7 leilões<\/title>/);
  for (const c of svg.match(/#[0-9A-Fa-f]{6}/g) || []) assert.ok(['#183C80', '#0071BB', '#231F20', '#525254', '#F7F7F8'].includes(c.toUpperCase()), c);
});
test('barsSvg vazio não quebra', () => assert.match(Charts.barsSvg([], {}), /Sem dados/));
test('barsSvg com nulos e zero', () => {
  const svg = Charts.barsSvg([{ label: 'a', value: 0 }, { label: 'b', value: null }], {});
  assert.ok(!/NaN/.test(svg));
});
test('hbarsSvg ordena desc quando pedido', () => {
  const svg = Charts.hbarsSvg([{ label: 'x', value: 1 }, { label: 'y', value: 3 }], { sort: true });
  assert.ok(svg.indexOf('>y<') < svg.indexOf('>x<'));
});
test('scatterSvg', () => {
  const svg = Charts.scatterSvg([{ x: 2, y: 18.25, label: 'Lote 1' }, { x: 7, y: 19.6, label: 'Rota Agro' }], { xLabel: 'Concorrentes', yLabel: 'Deságio' });
  assert.equal((svg.match(/<circle/g) || []).length, 2);
  assert.ok(!/NaN/.test(svg));
});
test('linesSvg', () => {
  const svg = Charts.linesSvg([{ name: 'Privada', points: [{ x: 2011, y: 10 }, { x: 2026, y: 30 }] }, { name: 'Direta', points: [{ x: 2011, y: 50 }, { x: 2026, y: 40 }], dash: true }], {});
  assert.equal((svg.match(/<path class="line/g) || []).length, 2);
  assert.match(svg, /stroke-dasharray/);
});
test('stackedSvg', () => {
  const svg = Charts.stackedSvg([{ label: '2020', parts: [3, 4] }, { label: '2021', parts: [null, 2] }], { names: ['Público', 'Privado'] });
  assert.equal((svg.match(/<rect class="bar/g) || []).length, 3);
});
