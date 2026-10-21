import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const Regulatorio = require('../src/regulatorio.js');
const reg = JSON.parse(fs.readFileSync(new URL('../data/roadshow/regulatorio.json', import.meta.url), 'utf8'));
const diag = id => reg.diagramas.find(d => d.id === id);
const PALETA = ['#183C80', '#0071BB', '#231F20', '#525254', '#F7F7F8'];
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function comum(svg, d) {
  assert.match(svg, /^<svg class="diagrama__svg"[^>]* role="img"/);
  assert.ok(svg.includes(`<title id="dg-${d.id}-t">${esc(d.titulo)}</title>`), 'título');
  assert.ok(svg.includes(`<desc id="dg-${d.id}-d">${esc(d.descricao)}</desc>`), 'descrição');
  assert.ok(svg.includes(`aria-labelledby="dg-${d.id}-t dg-${d.id}-d"`));
  assert.ok(!/NaN|undefined|null/.test(svg), 'sem NaN/undefined/null');
  for (const c of svg.match(/#[0-9A-Fa-f]{6}/g) || []) assert.ok(PALETA.includes(c.toUpperCase()), c);
  const vb = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
  assert.ok(vb && +vb[1] > 0 && +vb[2] > 0);
}

test('fluxoSvg: uma etapa por item, decisão dos 18% e aporte, textos só do JSON', () => {
  const d = diag('fluxo-projeto');
  const svg = Regulatorio.fluxoSvg(d);
  comum(svg, d);
  assert.deepEqual([...svg.matchAll(/data-etapa="([^"]+)"/g)].map(m => m[1]), d.etapas.map(e => e.id));
  for (const e of d.etapas) assert.ok(svg.includes(`<title>${esc(e.titulo)}`), e.id);
  assert.ok(svg.includes('class="decisao"') && svg.includes(`<title>${esc(d.decisao.pergunta)}`));
  assert.ok(svg.includes('class="aporte"') && svg.includes(`<title>${esc(d.decisao.sim)}`));
  assert.ok(svg.includes(`>${esc(d.decisao.rotulo_sim)}<`) && svg.includes(`>${esc(d.decisao.rotulo_nao)}<`));
  assert.ok(svg.includes('marker-end="url(#dg-fluxo-projeto-seta)"'));
});

test('colunasSvg: um nó por item, uma seta por aresta, garantia tracejada', () => {
  const d = diag('fluxo-financiamento');
  const svg = Regulatorio.colunasSvg(d);
  comum(svg, d);
  assert.deepEqual([...svg.matchAll(/data-no="([^"]+)"/g)].map(m => m[1]), d.nos.map(n => n.id));
  const setas = svg.match(/<line class="aresta[^"]*"[^>]*>/g) || [];
  assert.equal(setas.length, d.arestas.length);
  assert.equal(setas.filter(s => s.includes('stroke-dasharray')).length, d.arestas.filter(a => a.tipo === 'garantia').length);
  for (const n of d.nos) assert.ok(svg.includes(`<title>${esc(n.titulo)}`), n.id);
  // página visível em cada nó que tem página (não só na dica)
  for (const n of d.nos.filter(x => x.pagina)) {
    const g = svg.slice(svg.indexOf(`data-no="${n.id}"`)).split('</g>')[0];
    assert.match(g, new RegExp(`<text[^>]*>p\\. ${n.pagina}</text>`), n.id);
  }
});

test('rodapé diz o que é do RoadShow e o que é nosso, a partir de origem e páginas do JSON', () => {
  assert.equal(Regulatorio.rodape(diag('fluxo-financiamento')), 'Esquema elaborado com o texto do RoadShow 2026-2027, p. 73, 75, 77');
  assert.equal(Regulatorio.rodape(diag('fluxo-projeto')), 'Baseado na figura da p. 61 e nos textos das pp. 65 e 73 do RoadShow 2026-2027');
  assert.equal(Regulatorio.rodape({ origem: 'adaptado', pagina_figura: 61, paginas: [61, 65] }), 'Baseado na figura da p. 61 e no texto da p. 65 do RoadShow 2026-2027');
  assert.equal(Regulatorio.rodape({ paginas: [61] }), 'Fonte: RoadShow 2026-2027, p. 61');
});

test('diagramas sem dados não quebram', () => {
  const vazio = { id: 'x', titulo: 't', descricao: 'd', etapas: [], nos: [], arestas: [] };
  for (const svg of [Regulatorio.fluxoSvg(vazio), Regulatorio.colunasSvg(vazio)]) assert.ok(!/NaN|undefined/.test(svg));
});

test('quebra de linha respeita o limite de caracteres', () => {
  assert.deepEqual(Regulatorio.quebra('Aprovação do Plano de Outorga', 14), ['Aprovação do', 'Plano de', 'Outorga']);
  assert.deepEqual(Regulatorio.quebra('', 10), []);
});
