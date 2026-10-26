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
test('hbarsSvg mantém a ordem recebida (quem chama ordena; "Outros" fica por último)', () => {
  const svg = Charts.hbarsSvg([{ label: 'x', value: 1 }, { label: 'y', value: 3 }, { label: 'Outros 2 grupos', value: 9 }]);
  assert.ok(svg.indexOf('>x<') < svg.indexOf('>y<') && svg.indexOf('>y<') < svg.indexOf('>Outros 2 grupos<'));
});
test('scatterSvg', () => {
  const svg = Charts.scatterSvg([{ x: 2, y: 18.25, label: 'Lote 1' }, { x: 7, y: 19.6, label: 'Rota Agro' }], { xLabel: 'Concorrentes', yLabel: 'Deságio' });
  assert.equal((svg.match(/<circle/g) || []).length, 2);
  assert.ok(!/NaN/.test(svg));
});
test('scatterSvg: sem as opções novas a saída é a de sempre (um só estilo, dica com rótulo e valores)', () => {
  const svg = Charts.scatterSvg([{ x: 2, y: 18.25, label: 'Lote 1' }], { xLabel: 'Concorrentes' });
  assert.match(svg, /fill="#0071BB" fill-opacity="0.7" stroke="#183C80"/);
  assert.match(svg, /<title>Lote 1: 2 Concorrentes · 18,3%<\/title>/);
  assert.ok(!/data-grupo|class="ylabel"/.test(svg));
});
test('scatterSvg: cor por ponto, grupo, dica própria e unidades nos dois eixos', () => {
  const svg = Charts.scatterSvg([
    { x: 4.1, y: 0.8, color: '#C0392B', group: 'rodovias', tip: 'AAA11 — Alfa · duration 4,10 anos · taxa 7,00% · spread 0,80 p.p.' },
    { x: 9, y: 1.7, color: '#2E7D32', group: 'ferrovias', tip: 'BBB11 — Beta <b>' },
  ], { xLabel: 'Duration (anos)', yLabel: 'Spread sobre a NTN-B (p.p.)', formatY: v => `${v}`.replace('.', ',') });
  assert.equal((svg.match(/<circle/g) || []).length, 2);
  assert.match(svg, /<circle [^>]*fill="#C0392B"[^>]*stroke="#C0392B"[^>]*data-grupo="rodovias"/);
  assert.match(svg, /<circle [^>]*fill="#2E7D32"[^>]*data-grupo="ferrovias"/);
  assert.match(svg, /<title>AAA11 — Alfa · duration 4,10 anos · taxa 7,00% · spread 0,80 p.p.<\/title>/);
  assert.match(svg, /<title>BBB11 — Beta &lt;b&gt;<\/title>/, 'a dica é escapada');
  assert.match(svg, />Duration \(anos\)</);
  assert.match(svg, /class="ylabel"[^>]*>Spread sobre a NTN-B \(p\.p\.\)</);
  assert.ok(!/NaN/.test(svg));
});
test('scatterSvg: y negativo abre o eixo para baixo do zero, e os pontos ficam dentro do gráfico', () => {
  const svg = Charts.scatterSvg([{ x: 2, y: -0.4, tip: 'a' }, { x: 6, y: 1.6, tip: 'b' }], { width: 600, height: 300 });
  const cy = [...svg.matchAll(/<circle [^>]*cy="([\d.]+)"/g)].map(m => +m[1]);
  assert.equal(cy.length, 2);
  assert.ok(cy.every(v => v >= 16 && v <= 300 - 48), cy.join());
  assert.ok(cy[0] > cy[1], 'o ponto negativo fica abaixo do positivo');
  const rotulos = [...svg.matchAll(/text-anchor="end"[^>]*>([^<]+)</g)].map(m => m[1]);
  assert.ok(rotulos.some(t => t.startsWith('-')), rotulos.join());
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
test('linesSvg: formatX nos rótulos do eixo e nas dicas; r = raio dos pontos (padrão 4)', () => {
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
test('dotsSvg: marca por tipo, referência só depois de refFromX, só cores da paleta, sem NaN', () => {
  const data = [
    { x: 2007.78, y: 39.99, label: 'Transbrasiliana', tipo: 'oficial' },
    { x: 2013.5, y: 12, label: 'Rota B', tipo: 'roadshow' },
    { x: 2021.5, y: 8.1, label: 'Rota C', tipo: 'imprensa' },
    { x: 2025.62, y: 19.6, label: 'Rota D', tipo: 'oficial' },
  ];
  const svg = Charts.dotsSvg(data, { refY: 20, refFromX: 2020, formatY: v => `${v}%` });
  assert.equal((svg.match(/<circle/g) || []).length, 4);
  assert.match(svg, /<circle[^>]*data-tipo="oficial"[^>]*fill="#183C80"/);
  assert.match(svg, /<circle[^>]*data-tipo="roadshow"[^>]*fill="#0071BB"/);
  assert.match(svg, /<circle[^>]*data-tipo="imprensa"[^>]*fill="none"[^>]*stroke="#525254"[^>]*stroke-dasharray/);
  assert.match(svg, /<title>Rota D[^<]*19.6%/);
  // imprensa sempre como "imprensa — não oficial"
  assert.match(svg, /<title>Rota C: 8\.1% · imprensa — não oficial<\/title>/);
  // eixo x começa no primeiro ano dos dados (2007), não em 0
  assert.match(svg, /text-anchor="middle"[^>]*>2007</);
  assert.match(svg, /text-anchor="middle"[^>]*>2010</);
  // todos os rótulos do eixo x são anos entre o primeiro e o fim do eixo (nada de 0, 1, 2 nem anos antes de 2007)
  const anos = [...svg.matchAll(/text-anchor="middle"[^>]*>([^<]*)</g)].map(m => m[1]);
  assert.ok(anos.length >= 4, anos.join());
  for (const a of anos) assert.ok(/^\d{4}$/.test(a) && +a >= 2007 && +a <= 2026, a);
  assert.equal(new Set(anos).size, anos.length, 'sem rótulo repetido');
  // referência: uma linha horizontal que não começa na margem esquerda, mas em 2020
  const ref = svg.match(/<line class="ref"[^>]*>/);
  assert.ok(ref, 'linha de referência');
  const x1 = +ref[0].match(/x1="([\d.]+)"/)[1], x2 = +ref[0].match(/x2="([\d.]+)"/)[1];
  const left = +svg.match(/<line class="grid"[^>]*x1="([\d.]+)"/)[1];
  assert.ok(x1 > left + 100 && x2 > x1, `${x1} ${x2} ${left}`);
  assert.equal((Charts.dotsSvg(data, { refY: 20 }).match(/<line class="ref"/g) || []).length, 1);
  assert.equal((Charts.dotsSvg(data, {}).match(/<line class="ref"/g) || []).length, 0);
  assert.equal((Charts.dotsSvg(data, { refY: 20, refFromX: 2030 }).match(/<line class="ref"/g) || []).length, 0);
  for (const c of svg.match(/#[0-9A-Fa-f]{6}/g) || []) assert.ok(['#183C80', '#0071BB', '#231F20', '#525254', '#F7F7F8'].includes(c.toUpperCase()), c);
  assert.ok(!/NaN|undefined/.test(svg));
});
test('dotsSvg: o eixo x sempre rotula o último ano, sem rótulos colados', () => {
  const rotulos = (data) => [...Charts.dotsSvg(data, {}).matchAll(/<text x="([\d.]+)"[^>]*text-anchor="middle"[^>]*>(\d{4})</g)]
    .map(m => [+m[1], +m[2]]);
  // 2007–2026: o passo (3) pararia em 2025; o fim do eixo (2026) toma o lugar do rótulo colado
  const a = rotulos([{ x: 2007.78, y: 5 }, { x: 2025.62, y: 7 }]);
  assert.equal(a[0][1], 2007);
  assert.equal(a[a.length - 1][1], 2026);
  assert.ok(!a.some(r => r[1] === 2025));
  // 2007–2025: o passo já termina no último ano
  const b = rotulos([{ x: 2007.2, y: 5 }, { x: 2024.5, y: 7 }]);
  assert.equal(b[b.length - 1][1], 2025);
  // 2020–2027 (passo 1): todos os anos, inclusive o último
  const c = rotulos([{ x: 2020.5, y: 5 }, { x: 2026.5, y: 7 }]);
  assert.deepEqual(c.map(r => r[1]), [2020, 2021, 2022, 2023, 2024, 2025, 2026, 2027]);
  // rótulos nunca se sobrepõem (pelo menos 44 px entre eles)
  for (const l of [a, b, c]) l.slice(1).forEach((r, i) => assert.ok(r[0] - l[i][0] >= 44, `${l[i]} ${r}`));
});
test('dotsSvg: ponto limitado pelo edital leva a observação no título', () => {
  const svg = Charts.dotsSvg([
    { x: 2021.83, y: 15.31, label: 'BR-101/116', tipo: 'oficial', limitado: true },
    { x: 2022.5, y: 10, label: 'Outro', tipo: 'oficial' },
  ], {});
  assert.match(svg, /<title>BR-101\/116[^<]* · limitado pelo edital \(desempate por outorga\)<\/title>/);
  assert.equal((svg.match(/limitado pelo edital/g) || []).length, 1);
});
test('dotsSvg: um ponto só, rótulos escapados e valores inválidos ignorados', () => {
  const svg = Charts.dotsSvg([{ x: 2020.5, y: 5, label: 'A & <B>', tipo: 'oficial' }, { x: NaN, y: 3, label: 'x' }, { x: 2021, y: null, label: 'y' }], {});
  assert.equal((svg.match(/<circle/g) || []).length, 1);
  assert.match(svg, /A &amp; &lt;B&gt;/);
  assert.ok(!/NaN/.test(svg));
});
test('dotsSvg vazio não quebra', () => {
  assert.match(Charts.dotsSvg([], {}), /Sem dados/);
  assert.match(Charts.dotsSvg(undefined, {}), /Sem dados/);
});
test('legendHtml: formato antigo (array) segue com retângulo; objetos desenham ponto, anel tracejado e linha', () => {
  const old = Charts.legendHtml([['Realizados', '#183C80'], ['Previstos', '#0071BB', 0.45]]);
  assert.equal((old.match(/<rect /g) || []).length, 2);
  assert.match(old, /fill="#0071BB" fill-opacity="0.45"/);
  const leg = Charts.legendHtml([
    { label: 'oficial', color: '#183C80', shape: 'dot' },
    { label: 'imprensa — não oficial', color: '#525254', shape: 'ring' },
    { label: 'linha de 18% & <x>', color: '#231F20', shape: 'line' },
  ]);
  assert.match(leg, /<circle[^>]*fill="#183C80"/);
  assert.match(leg, /<circle[^>]*fill="none"[^>]*stroke="#525254"[^>]*stroke-dasharray/);
  assert.match(leg, /<line[^>]*stroke="#231F20"[^>]*stroke-dasharray/);
  assert.match(leg, /linha de 18% &amp; &lt;x&gt;/);
  assert.doesNotMatch(leg, /<rect /);
});
test('dotsSvg: ponto limitado pelo edital ganha um anel que não captura o mouse', () => {
  const svg = Charts.dotsSvg([
    { x: 2021.83, y: 15.31, label: 'A', tipo: 'oficial', limitado: true },
    { x: 2022.5, y: 10, label: 'B', tipo: 'oficial' },
  ], {});
  assert.equal((svg.match(/<circle class="dot"/g) || []).length, 2);
  assert.equal((svg.match(/<circle class="dot-limite"[^>]*fill="none"[^>]*pointer-events="none"/g) || []).length, 1);
});

test('legendHtml: formas de diagrama (seta cheia e losango) só com a cor dada', () => {
  const html = Charts.legendHtml([{ label: 'Sequência', color: Charts.C.spacial, shape: 'arrow' }, { label: 'Decisão', color: Charts.C.bright, shape: 'diamond' }]);
  assert.match(html, /<path d="M17,2 L23,6 L17,10 Z" fill="#231F20"\/><\/svg>Sequência/);
  assert.match(html, /<path d="M7,1 L13,7 L7,13 L1,7 Z" fill="none" stroke="#0071BB"[^>]*\/><\/svg>Decisão/);
});

// ---------- timelineSvg: linha do tempo de editais e leilões ----------
const S_MAP = createRequire(import.meta.url)('../src/styles-map.js');
const PALETA_BASE = ['#183C80', '#0071BB', '#231F20', '#525254', '#F7F7F8'];
const tlRows = [
  { nome: 'Rota A', id: 'a', k: 'a', edital: '2026-09-02', leilao: '2026-12-11', status: 'leilao_agendado' },
  { nome: 'Rota B só leilão', id: 'b', k: null, edital: null, leilao: '2027-06', status: 'tcu' },
  { nome: 'Rota C <x> & "y"', id: 'c', k: 'c', edital: '2027-03', leilao: '2027-10-15', status: 'estudo' },
];
const tlOpts = { de: 2026, ate: 2027, colors: S_MAP.PIPE_STATUS, statusLabel: k => ({ leilao_agendado: 'Leilão agendado', tcu: 'No TCU/TCE', estudo: 'Em estudo' }[k]) };

test('timelineSvg: um losango por leilão, círculo vazado só quando há edital, linha entre os dois, cor por status', () => {
  const svg = Charts.timelineSvg(tlRows, tlOpts);
  assert.equal((svg.match(/<path class="tl-leilao"/g) || []).length, 3);
  assert.equal((svg.match(/<circle class="tl-edital"/g) || []).length, 2);
  assert.equal((svg.match(/<line class="tl-span"/g) || []).length, 2);
  assert.match(svg, /<circle class="tl-edital"[^>]*fill="none"[^>]*stroke="#006a47"/);
  assert.match(svg, /<path class="tl-leilao"[^>]*fill="#006a47"/);
  assert.match(svg, /<path class="tl-leilao"[^>]*fill="#009565"/); // tcu
  assert.ok(!/NaN|undefined|null/.test(svg));
});

test('timelineSvg: posição proporcional à data; mês sem dia no meio do mês e marcado "(mês)"', () => {
  const svg = Charts.timelineSvg(tlRows, tlOpts);
  const x = id => { const m = svg.match(new RegExp(`data-id="${id}"[^>]*data-leilao-x="([\\d.]+)"`)); return Number(m[1]); };
  assert.ok(x('a') < x('b') && x('b') < x('c'));
  // 2027-06 (mês) cai no dia 15 de junho: o mesmo x que 2027-06-15
  const m15 = Charts.timelineSvg([{ nome: 'm', id: 'm', edital: null, leilao: '2027-06', status: 'tcu' }, { nome: 'd', id: 'd', edital: null, leilao: '2027-06-15', status: 'tcu' }], tlOpts);
  const xs = [...m15.matchAll(/data-leilao-x="([\d.]+)"/g)].map(v => v[1]);
  assert.equal(xs[0], xs[1]);
  assert.match(svg, /jun\/2027 \(mês\)/);
  assert.match(svg, /11\/12\/2026/);
  assert.ok(!/11\/12\/2026 \(mês\)/.test(svg));
});

test('timelineSvg: eixo pelos anos recebidos (e, sem eles, pelos dados); nome escapado e clicável só com ficha', () => {
  const svg = Charts.timelineSvg(tlRows, tlOpts);
  const anos = [...svg.matchAll(/<text class="tl-ano"[^>]*>(\d{4})</g)].map(v => v[1]);
  assert.deepEqual(anos, ['2026', '2027']);
  const auto = Charts.timelineSvg(tlRows, { colors: S_MAP.PIPE_STATUS });
  assert.deepEqual([...auto.matchAll(/<text class="tl-ano"[^>]*>(\d{4})</g)].map(v => v[1]), ['2026', '2027']);
  const largo = Charts.timelineSvg(tlRows, Object.assign({}, tlOpts, { de: 2025, ate: 2029 }));
  assert.deepEqual([...largo.matchAll(/<text class="tl-ano"[^>]*>(\d{4})</g)].map(v => v[1]), ['2025', '2026', '2027', '2028', '2029']);
  assert.match(svg, /Rota C &lt;x&gt; &amp; &quot;y&quot;/);
  const clk = Charts.timelineSvg(tlRows, Object.assign({ clickable: true }, tlOpts));
  assert.equal((clk.match(/<g class="hrow tl-row"[^>]*data-k=/g) || []).length, 2); // a e c têm ficha
  assert.equal((clk.match(/role="button"/g) || []).length, 2);
  assert.equal((svg.match(/data-k=/g) || []).length, 0);
});

test('timelineSvg: só a paleta base mais os tokens de status; nunca cor de série em texto', () => {
  const svg = Charts.timelineSvg(tlRows, tlOpts);
  const ok = new Set([...PALETA_BASE, ...S_MAP.DATA_TOKENS]);
  for (const c of svg.match(/#[0-9A-Fa-f]{6}/g) || []) assert.ok(ok.has(c.toUpperCase()), c);
  for (const t of svg.match(/<text[^>]*>/g) || []) assert.ok(!Object.values(S_MAP.PIPE_STATUS).some(c => t.includes(c)), t);
  // sem cores de status, usa só a paleta base
  for (const c of Charts.timelineSvg(tlRows, {}).match(/#[0-9A-Fa-f]{6}/g) || []) assert.ok(PALETA_BASE.includes(c.toUpperCase()), c);
});

test('timelineSvg: sem linhas, "Sem dados"; linha sem leilão é ignorada; título de cada marca traz a data completa', () => {
  assert.match(Charts.timelineSvg([], tlOpts), /Sem dados/);
  assert.match(Charts.timelineSvg([{ nome: 'x', id: 'x', edital: '2026-01-01', leilao: null, status: 'tcu' }], tlOpts), /Sem dados/);
  const svg = Charts.timelineSvg(tlRows, tlOpts);
  assert.match(svg, /<title>Rota A · edital: 02\/09\/2026<\/title>/);
  assert.match(svg, /<title>Rota A · leilão: 11\/12\/2026 · Leilão agendado<\/title>/);
});

test('timelineSvg: linha não verificada leva "(não verificado)" no rótulo e "fonte: imprensa — não oficial" nas dicas', () => {
  const nv = [{ nome: 'MG Lote 10 - Noroeste com nome bem comprido demais', id: 'nv', k: null, edital: null, leilao: '2026-03-20', status: 'edital', verificado: false }].concat(tlRows);
  const svg = Charts.timelineSvg(nv, Object.assign({ width: 640 }, tlOpts));
  const rot = [...svg.matchAll(/<text x="[\d.]+" y="[\d.]+" text-anchor="end"[^>]*>(.*?)<\/text>/g)].map(m => m[1].replace(/<title>.*?<\/title>/, ''));
  assert.match(rot[0], / \(não verificado\)$/); // o nome é encurtado, a marca fica visível
  assert.ok(rot.slice(1).every(t => !t.includes('não verificado')), rot.join('|'));
  assert.match(svg, /<title>MG Lote 10 - Noroeste com nome bem comprido demais · leilão: 20\/03\/2026[^<]* · fonte: imprensa — não oficial<\/title>/);
  assert.match(svg, /<title>MG Lote 10 - Noroeste com nome bem comprido demais \(não verificado; fonte: imprensa — não oficial\)<\/title>/);
  assert.equal((svg.match(/não oficial/g) || []).length, 2);
});

test('legendHtml: formas do cronograma (círculo vazado e losango cheio) na cor dada', () => {
  const html = Charts.legendHtml([{ label: 'Edital', color: Charts.C.spacial, shape: 'circle' }, { label: 'Leilão', color: Charts.C.spacial, shape: 'diamondFill' }]);
  assert.match(html, /<circle[^>]*fill="none"[^>]*stroke="#231F20"[^>]*\/><\/svg>Edital/);
  assert.match(html, /<path[^>]*fill="#231F20"[^>]*\/><\/svg>Leilão/);
});

test('hbarsSvg: o detalhe aparece na dica da barra e na dica da linha inteira (rótulo, barra e valor)', () => {
  const svg = Charts.hbarsSvg([{ label: 'Grupo A', value: 10, detail: 'capex 6 + opex 4' }, { label: 'Grupo B', value: 0.4, detail: 'capex 0,3 + opex 0,1' }],
    { unit: 'R$ bi', format: v => String(v).replace('.', ',') });
  assert.match(svg, /<title>Grupo A: 10 R\$ bi \(capex 6 \+ opex 4\)<\/title>/);
  assert.match(svg, /<title>Grupo B: 0,4 R\$ bi \(capex 0,3 \+ opex 0,1\)<\/title>/);
  // a barra de B é minúscula: a linha toda (<g class="hrow-tip">) carrega a dica, com área de acerto de largura total
  const linhas = svg.match(/<g class="hrow-tip">.*?<\/g>/gs) || [];
  assert.equal(linhas.length, 2);
  assert.match(linhas[1], /^<g class="hrow-tip"><title>Grupo B: 0,4 R\$ bi \(capex 0,3 \+ opex 0,1\)<\/title>/);
  assert.match(linhas[1], /class="hit"[^>]*width="640"/);
});
test('hbarsSvg: sem detalhe a dica é só rótulo e valor', () => {
  const svg = Charts.hbarsSvg([{ label: 'X', value: 3 }], { unit: 'km' });
  assert.match(svg, /<title>X: 3 km<\/title>/);
  assert.ok(!/\(undefined|\(\)/.test(svg));
});

test('hbarsSvg clicável: linha com k vira botão acessível; linha sem k (ex.: "Outros") e gráfico comum não', () => {
  const rows = [{ label: 'Grupo "A"', value: 3, k: 'Grupo "A"' }, { label: 'Outros 2 grupos', value: 1 }];
  const svg = Charts.hbarsSvg(rows, { clickable: true, rowLabel: r => `Abrir a ficha de ${r.label}` });
  const linhas = svg.match(/<g class="hrow-tip[^>]*>/g);
  assert.equal(linhas.length, 2);
  assert.match(linhas[0], /class="hrow-tip hrow" data-k="Grupo &quot;A&quot;" role="button" tabindex="0" aria-label="Abrir a ficha de Grupo &quot;A&quot;"/);
  assert.equal(linhas[1], '<g class="hrow-tip">', '"Outros" não é clicável');
  assert.match(svg, /role="group"/);
  const comum = Charts.hbarsSvg(rows);
  assert.ok(!/data-k|role="button"|tabindex/.test(comum));
  assert.match(comum, /role="img"/);
});

test('linesSvg: yMin faz o eixo y começar acima de zero e espalha os pontos; sem yMin nada muda', () => {
  const s = [{ name: 'Curva', points: [{ x: 2029, y: 6.77 }, { x: 2040, y: 6.75 }, { x: 2055, y: 6.71 }, { x: 2060, y: 6.83 }] }];
  const eixo = svg => [...svg.matchAll(/<text [^>]*text-anchor="end"[^>]*>([^<]*)<\/text>/g)].map(m => m[1]);
  const cys = svg => [...svg.matchAll(/<circle [^>]*cy="([\d.]+)"/g)].map(m => +m[1]);
  const sem = Charts.linesSvg(s, {}), com = Charts.linesSvg(s, { yMin: 6.7 });
  assert.equal(Charts.linesSvg(s, { yMin: undefined }), sem, 'sem yMin é o mesmo desenho de antes');
  assert.equal(eixo(sem)[0], '0');
  const marcas = eixo(com).map(t => Number(t.replace(',', '.')));
  assert.ok(marcas[0] > 6 && marcas[0] <= 6.7, `primeira marca ${marcas[0]}`);
  assert.ok(marcas[marcas.length - 1] >= 6.83);
  const alturaSem = Math.max(...cys(sem)) - Math.min(...cys(sem)), alturaCom = Math.max(...cys(com)) - Math.min(...cys(com));
  assert.ok(alturaCom > 10 * alturaSem, `com yMin as diferenças aparecem (${alturaCom} × ${alturaSem})`);
  // o maior valor fica na marca mais alta do eixo e nenhum ponto sai da área do gráfico
  assert.ok(cys(com).every(y => y >= 16 - 1e-6 && y <= 280 - 40 + 1e-6));
  assert.deepEqual(Charts.linesSvg(s, { yMin: 99 }), sem, 'yMin acima dos dados é ignorado');
});

test('ticksFrom: marcas entre o mínimo e o máximo, a primeira no múltiplo do passo abaixo do mínimo', () => {
  assert.deepEqual(Charts.ticksFrom(6.7, 6.83), [6.7, 6.75, 6.8, 6.85]);
  assert.deepEqual(Charts.ticksFrom(6.71, 6.83), [6.7, 6.75, 6.8, 6.85]);
  assert.deepEqual(Charts.ticksFrom(5, 5), [5]);
});

test('hbarsSvg: rótulo comprido termina em "…" com o texto inteiro na dica, e a coluna cresce até 55% da largura', () => {
  const longo = 'Deságio médio por número de concorrentes (7 leilões)';
  const svg = Charts.hbarsSvg([{ label: longo, value: 3 }, { label: 'Curto', value: 1 }], { width: 342 });
  const texto = svg.match(/<text x="(\d+)" y="\d+" text-anchor="end" fill="#231F20">(.*?)<\/text>/);
  assert.ok(Number(texto[1]) <= 342 * 0.55, 'coluna de rótulos limitada a 55% da largura');
  assert.match(texto[2], new RegExp(`^<title>${longo.replace(/[()]/g, '\\$&')}</title>.+…$`));
  const curto = svg.match(/fill="#231F20">(Curto)<\/text>/);
  assert.ok(curto, 'rótulo que cabe não leva título nem reticências');
  const largo = Charts.hbarsSvg([{ label: longo, value: 3 }], { width: 900 });
  assert.ok(largo.includes(`fill="#231F20">${longo}</text>`), 'com espaço o rótulo aparece inteiro');
});

test('hstackSvg: rótulo cortado leva o texto inteiro na dica do rótulo', () => {
  const svg = Charts.hstackSvg([{ label: 'Concessionária de Rodovias do Interior Paulista S.A.', parts: [3] }], { width: 342, labelWidth: 280 });
  assert.match(svg, /<title>Concessionária de Rodovias do Interior Paulista S\.A\.<\/title>[^<]+…<\/text>/);
  assert.ok(Number(svg.match(/<text x="(\d+)" y="\d+" text-anchor="end"/)[1]) <= 342 * 0.55);
});

test('linesSvg: o último rótulo do eixo x cabe na margem direita', () => {
  const svg = Charts.linesSvg([{ name: 'S', points: [{ x: 2029, y: 1 }, { x: 2055, y: 2 }] }], { width: 342, stepX: 6 });
  const ultimo = [...svg.matchAll(/<text x="([\d.]+)" y="\d+" text-anchor="middle" fill="#525254">(\d{4})<\/text>/g)].pop();
  assert.ok(Number(ultimo[1]) + 15 <= 342, `último rótulo em x=${ultimo[1]}`);
});

test('linesSvg: quatro séries ganham quatro traços distintos (a quarta em Spacial Grey, tracejada se pedido)', () => {
  const pts = y => [{ x: 1, y }, { x: 2, y: y + 1 }];
  const svg = Charts.linesSvg([{ name: 'A', points: pts(1) }, { name: 'B', points: pts(2) }, { name: 'C', points: pts(3) }, { name: 'D', points: pts(4), dash: true }], {});
  const tracos = [...svg.matchAll(/<path class="line"[^>]*stroke="([^"]+)"([^>]*)\/>/g)].map(m => [m[1], /stroke-dasharray/.test(m[2])]);
  assert.deepEqual(tracos, [['#183C80', false], ['#0071BB', false], ['#525254', false], ['#231F20', true]]);
});

test('linesSvg: color da série, quebra da linha antes de um ponto e unidade do eixo (yLabel)', () => {
  const s = [{ name: 'A', color: '#eb6834', points: [{ x: 1, y: 1 }, { x: 2, y: 2 }, { x: 4, y: 2, quebra: true }, { x: 5, y: 3 }] }];
  const svg = Charts.linesSvg(s, { yLabel: 'p.p.' });
  const d = /<path class="line" d="([^"]+)"/.exec(svg)[1];
  assert.equal((d.match(/M/g) || []).length, 2, 'a linha é interrompida no ponto marcado: dois trechos');
  assert.equal((d.match(/L/g) || []).length, 2);
  assert.match(svg, /stroke="#eb6834"/);
  assert.match(svg, /<text class="ylabel"[^>]*>p\.p\.<\/text>/);
  assert.doesNotMatch(Charts.linesSvg(s, {}), /ylabel/);
  assert.equal((/<path class="line" d="([^"]+)"/.exec(Charts.linesSvg([{ name: 'A', points: s[0].points.map(p => ({ x: p.x, y: p.y })) }], {}))[1].match(/M/g) || []).length, 1);
  // nenhum ponto sai da área do gráfico com a unidade no topo
  const cys = [...svg.matchAll(/<circle [^>]*cy="([\d.]+)"/g)].map(m => +m[1]);
  assert.ok(cys.every(y => y >= 36 - 1e-6 && y <= 280 - 40 + 1e-6), cys.join());
});

test('hbarsSvg: labelAbove põe o rótulo acima da barra, com a barra na largura toda; big engrossa as barras', () => {
  const rows = [{ label: 'IDA-IPCA Infraestrutura · 14/10', value: 1.13 }, { label: 'Transporte + intenções · 15/10', value: 1.81 }];
  const lado = Charts.hbarsSvg(rows, { width: 306 }), acima = Charts.hbarsSvg(rows, { width: 306, labelAbove: true });
  const bar = svg => [...svg.matchAll(/<rect class="cbar" x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="(\d+)"/g)].map(m => m.slice(1).map(Number));
  assert.equal(bar(acima)[0][0], 0, 'a barra começa na borda esquerda');
  assert.ok(bar(acima)[1][2] > bar(lado)[1][2] * 2, 'barra bem mais larga sem a coluna de rótulos');
  assert.match(acima, /<text x="0" [^>]*text-anchor="start"[^>]*>IDA-IPCA Infraestrutura · 14\/10<\/text>/, 'rótulo inteiro, sem corte');
  assert.ok(!/…/.test(acima));
  const grande = Charts.hbarsSvg(rows, { width: 640, big: true }), normal = Charts.hbarsSvg(rows, { width: 640 });
  assert.equal(bar(normal)[0][3], 16);
  assert.equal(bar(grande)[0][3], 24);
  assert.ok(+/height="(\d+)"/.exec(grande)[1] > +/height="(\d+)"/.exec(normal)[1]);
  // com valor nulo a linha continua com "—"
  assert.match(Charts.hbarsSvg([{ label: 'x', value: null }], { width: 400, labelAbove: true }), />—<\/text>/);
});
