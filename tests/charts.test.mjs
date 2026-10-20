import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const Charts = createRequire(import.meta.url)('../src/charts.js');

test('barsSvg: uma barra por item, título com valor exato, só cores da paleta', () => {
  const svg = Charts.barsSvg([{ label: '2023', value: 2 }, { label: '2024', value: 7, alt: true }], { unit: 'leilões', format: v => String(v) });
  assert.equal((svg.match(/<rect class="cbar/g) || []).length, 2);
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
  assert.equal((svg.match(/<rect class="cbar/g) || []).length, 3);
});
test('linesSvg: formatX nos rótulos do eixo e nas dicas; r = raio dos pontos (padrão 4, v2 igual)', () => {
  const s = [{ name: 'Leves', points: [{ x: 2016.75, y: 100 }, { x: 2018.75, y: 120 }] }];
  const base = Charts.linesSvg(s, {});
  assert.match(base, / r="4" /);
  assert.match(base, />2016.75</);
  const svg = Charts.linesSvg(s, { formatX: x => `X${x}`, r: 2.5 });
  assert.match(svg, />X2016.75</);
  assert.match(svg, /<title>Leves X2016.75:/);
  assert.match(svg, / r="2.5" /);
  assert.doesNotMatch(svg, / r="4" /);
});
test('linesSvg: stepX define o passo dos rótulos do eixo x (série mensal curta)', () => {
  const s = [{ name: 'Leves', points: [0, 1, 2, 3, 4, 5].map(k => ({ x: 2025 + (10 + k) / 12, y: 10 + k })) }];
  const lab = x => `m${Math.round(x * 12)}`;
  const ticks = svg => [...svg.matchAll(/<text [^>]*text-anchor="middle"[^>]*>([^<]*)<\/text>/g)].map(m => m[1]);
  assert.deepEqual(ticks(Charts.linesSvg(s, { formatX: lab })), ['m24310']);
  assert.deepEqual(ticks(Charts.linesSvg(s, { formatX: lab, stepX: 2 / 12 })), ['m24310', 'm24312', 'm24314']);
});
test('stackedSvg: o.left alarga a margem dos rótulos do eixo y', () => {
  const d = [{ label: 'a', parts: [150000, 50000] }];
  assert.match(Charts.stackedSvg(d, {}), /<text x="48" /);
  assert.match(Charts.stackedSvg(d, { left: 72 }), /<text x="64" /);
});
test('stackedSvg: item.tip substitui o rótulo nas dicas (eixo continua com o rótulo)', () => {
  const svg = Charts.stackedSvg([{ label: 'jan/24', tip: 'jan/2024', parts: [3, 4] }], { names: ['Leves', 'Pesados'] });
  assert.match(svg, /<title>jan\/2024 · Leves:/);
  assert.match(svg, />jan\/24</);
  assert.match(Charts.stackedSvg([{ label: '2020', parts: [1] }], { names: ['A'] }), /<title>2020 · A:/);
});
test('hstackSvg: barras horizontais empilhadas, linhas clicáveis com data-k, título e proporção', () => {
  const svg = Charts.hstackSvg([{ label: 'A <x>', parts: [30, 10], k: 5 }, { label: 'B', parts: [10, null], k: 7 }],
    { width: 600, names: ['Leves', 'Pesados'], format: v => String(v), unit: 'veíc./dia', clickable: true, labelWidth: 200 });
  assert.equal((svg.match(/class="hrow"/g) || []).length, 2);
  assert.match(svg, /data-k="5"/);
  assert.match(svg, /data-k="7"/);
  assert.match(svg, /role="button" tabindex="0"/);
  // com linhas interativas o SVG é um grupo, não uma imagem
  assert.match(svg, /^<svg[^>]*role="group"/);
  assert.match(svg, /A &lt;x&gt; · Leves: 30 veíc\.\/dia/);
  assert.doesNotMatch(svg, /NaN|undefined/);
  const w = [...svg.matchAll(/<rect class="cbar"[^>]*width="([\d.]+)"/g)].map(m => Number(m[1]));
  assert.equal(w.length, 3);
  assert.ok(Math.abs(w[0] / w[1] - 3) < 0.01 && Math.abs(w[0] / w[2] - 3) < 0.01);
  for (const c of svg.match(/#[0-9A-Fa-f]{6}/g) || []) assert.ok(['#183C80', '#0071BB', '#231F20', '#525254', '#F7F7F8'].includes(c.toUpperCase()), c);
  const plain = Charts.hstackSvg([{ label: 'A', parts: [1] }]);
  assert.doesNotMatch(plain, /role="button"/);
  assert.match(plain, /^<svg[^>]*role="img"/);
  assert.match(Charts.hstackSvg([]), /Sem dados/);
});
