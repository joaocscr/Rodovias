// e2e da v3 (camadas de inteligência no mapa): modos de cor quantitativos, legenda, números da seleção, cartão.
// Rodar: NODE_PATH=$(npm root -g) node --test tests/e2e-intel.test.mjs  (requer mapa-rodovias.html gerado)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const HTML = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'mapa-rodovias.html');
const LABELS = ['Concessões', 'Situação física', 'Tráfego', 'Pesados', 'Carga agrícola', 'Acidentes'];

let browser, page;
const external = [], errors = [];

async function openPage(errs, ext, transform) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.route('**/*', r => {
    const url = r.request().url();
    if (transform && url.startsWith('file:') && url.endsWith('.html')) {
      return r.fulfill({ contentType: 'text/html; charset=utf-8', body: transform(fs.readFileSync(HTML, 'utf8')) });
    }
    if (url.startsWith('file:') || url.startsWith('data:')) return r.continue();
    ext.push(url);
    return r.abort();
  });
  const p = await context.newPage();
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto('file://' + HTML);
  await p.waitForSelector('#kpi-km');
  return p;
}

before(async () => {
  browser = await chromium.launch();
  page = await openPage(errors, external);
});
after(async () => { await browser?.close(); });

const legend = () => page.textContent('#legend');
async function mode(m) {
  await page.click(`#legend [data-mode="${m}"]`);
  await page.waitForTimeout(50);
}

test('título da página e do topo', async () => {
  assert.equal(await page.title(), 'Rodovias do Brasil · Centro de Inteligência');
  assert.equal((await page.textContent('.topbar__title')).trim(), 'Rodovias do Brasil · Centro de Inteligência');
  assert.match(await page.textContent('.topbar__sub'), /SNV .*RoadShow/);
});

test('(a) seletor "Cor das rodovias" com os 6 rótulos na ordem, acessível', async () => {
  const g = page.locator('#legend [role="radiogroup"]');
  assert.equal(await g.getAttribute('aria-label'), 'Cor das rodovias');
  assert.deepEqual(await g.locator('[role="radio"]').allTextContents(), LABELS);
  assert.equal(await page.evaluate(() => MapView.colorMode()), 'concessoes');
  assert.equal(await g.locator('[role="radio"][aria-checked="true"]').textContent(), 'Concessões');
});

test('(b, c) modo Tráfego: legenda com 5 faixas, "Sem dado" e "Estimativa de modelo"', async () => {
  await mode('trafego');
  assert.equal(await page.evaluate(() => MapView.colorMode()), 'trafego');
  assert.equal(await page.locator('#legend .legend__row[data-class]').count(), 5);
  const t = await legend();
  assert.match(t, /Sem dado/);
  assert.match(t, /Estimativa de modelo/);
  assert.match(t, /veíc\.\/dia/);
  assert.match(t, /VMDa 2023/);
  // faixas "a – b" formatadas, contíguas
  const rows = await page.$$eval('#legend .legend__row[data-class] .legend__range', es => es.map(e => e.textContent));
  for (const r of rows) assert.match(r, /^[\d.,]+ – [\d.,]+$/, r);
  for (let i = 1; i < rows.length; i++) assert.equal(rows[i].split(' – ')[0], rows[i - 1].split(' – ')[1]);
  assert.ok(!/NaN|undefined|null/.test(t));
});

test('modos quantitativos: classes por quantil, sem halo, classe maior por cima', async () => {
  const r = await page.evaluate(() => {
    const q = MapView.classes('trafego');
    const vals = IntelModel.metricArray(window.INTEL, window.SNV, 'trafego');
    return { breaks: q.breaks, expected: IntelModel.quantileBreaks(vals), halos: MapView.haloCount() };
  });
  assert.deepEqual(r.breaks, r.expected);
  assert.equal(r.breaks.length, 4);
  assert.equal(r.halos, 0);
  const st = await page.evaluate(() => ({ q: QUANT_STYLES, none: QUANT_NONE }));
  assert.deepEqual(st.q.map(x => [x.color, x.opacity]),
    [['#0071BB', 0.45], ['#0071BB', 0.7], ['#183C80', 0.75], ['#183C80', 0.9], ['#183C80', 1]]);
  assert.equal(st.q[0].weight, 1.5);
  assert.equal(st.q[4].weight, 6);
  assert.ok(st.q.every((x, i) => i === 0 || (x.weight > st.q[i - 1].weight && x.z > st.q[i - 1].z)));
  assert.deepEqual(st.none, { color: '#525254', weight: 1, dash: '2 4', opacity: 0.5, z: 0 });
});

test('(d) KPI de veíc·km com filtro UF = MT bate com o modelo', async () => {
  const det = page.locator('details[data-group="uf"]');
  if (!(await det.evaluate(d => d.open))) await det.locator('summary').click();
  await page.locator('input[data-filter="uf"][data-label="MT"]').check();
  await page.waitForTimeout(150);
  const expected = await page.evaluate(() => {
    const f = Model.emptyFilters();
    f.uf.add(window.SNV.dict.uf.indexOf('MT'));
    const mask = Model.visibleFis(window.SNV, f);
    const a = IntelModel.aggregateIntel(window.INTEL, window.SNV, mask);
    return { vkm: IntelModel.fmtVkm(a.vkm), acid: a.acidAno, tkm: a.tkm };
  });
  assert.equal((await page.textContent('#kpi-vkm')).trim(), expected.vkm);
  assert.notEqual(expected.vkm, '—');
  assert.match(await page.textContent('#kpi-acid'), /\d/);
  assert.match(await page.textContent('#kpi-tkm'), /t·km\/ano/);
  for (const id of ['#kpi-vkm', '#kpi-acid', '#kpi-tkm']) {
    assert.ok((await page.locator(id).evaluate(e => e.closest('[title]').title)).length > 20, id);
  }
  assert.ok(!/NaN|undefined/.test(await page.textContent('#stats-section')));
  await page.click('#clear-filters');
  await page.waitForTimeout(100);
});

test('(e) cartão de físico com VMDa mostra o bloco "Tráfego e segurança"', async () => {
  const j = await page.evaluate(() => {
    const v = window.INTEL.trafego.vmda, c = window.INTEL.carga;
    return window.SNV.fis.findIndex((_, j) => v.l[j] != null && v.p[j] != null && c.gsa[j] > 0);
  });
  assert.ok(j >= 0);
  await page.evaluate(j => MapView.pick(j), j);
  await page.waitForSelector('#card:not([hidden])');
  const t = await page.textContent('#card');
  assert.match(t, /Tráfego e segurança/);
  assert.match(t, /veíc\.\/dia/);
  assert.match(t, /estimado, 2023/);
  assert.match(t, /modelo PNL, 2017/);
  assert.match(t, /10⁶ veíc·km/);
  assert.ok(!/NaN|undefined|null/.test(t));
  await page.click('#card-close');
});

test('(f) modos Acidentes e Carga mudam a legenda', async () => {
  const trafego = await legend();
  await mode('acidentes');
  const acid = await legend();
  assert.notEqual(acid, trafego);
  assert.match(acid, /Acidentes/);
  assert.match(acid, /Contagem medida/);
  assert.match(acid, /PRF/);
  await mode('carga');
  const carga = await legend();
  assert.notEqual(carga, acid);
  assert.match(carga, /Carga agrícola/);
  assert.match(carga, /Estimativa de modelo/);
  assert.match(carga, /PNL/);
  await mode('pesados');
  assert.match(await legend(), /Pesados/);
  assert.equal(await page.evaluate(() => MapView.colorMode()), 'pesados');
});

test('seletor responde a setas do teclado', async () => {
  await page.focus('#legend [role="radio"][aria-checked="true"]');
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(50);
  assert.equal(await page.evaluate(() => MapView.colorMode()), 'carga');
  assert.equal(await page.evaluate(() => document.activeElement.dataset.mode), 'carga');
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(50);
  assert.equal(await page.evaluate(() => MapView.colorMode()), 'pesados');
});

test('(g) troca de modo em menos de 300 ms', async t => {
  for (const m of ['trafego', 'acidentes', 'concessoes', 'carga', 'fisica']) {
    const ms = await page.evaluate(m => new Promise(resolve => {
      const t0 = performance.now();
      document.querySelector(`#legend [data-mode="${m}"]`).click();
      requestAnimationFrame(() => requestAnimationFrame(() => resolve(performance.now() - t0)));
    }), m);
    assert.equal(await page.evaluate(() => MapView.colorMode()), m);
    t.diagnostic(`${m}: ${ms.toFixed(0)} ms`);
    assert.ok(ms < 300, `${m}: levou ${ms.toFixed(0)} ms`);
  }
});

test('(i) volta ao modo Concessões com legenda e halo da v2', async () => {
  await mode('concessoes');
  assert.equal(await page.evaluate(() => MapView.colorMode()), 'concessoes');
  assert.match(await legend(), /Leilão agendado 2026/);
  assert.ok(await page.evaluate(() => MapView.haloCount()) > 0);
});

test('sem window.INTEL tudo degrada para "sem dado"', async () => {
  const errs = [], ext = [];
  const p = await openPage(errs, ext, html => html.replace('window.INTEL=', 'window.INTEL_AUSENTE='));
  assert.equal(await p.evaluate(() => typeof window.INTEL), 'undefined');
  assert.equal((await p.textContent('#kpi-vkm')).trim(), '—');
  await p.click('#legend [data-mode="trafego"]');
  assert.equal(await p.evaluate(() => MapView.colorMode()), 'trafego');
  assert.match(await p.textContent('#legend'), /Sem dado/);
  assert.equal(await p.locator('#legend .legend__row[data-class]').count(), 0);
  await p.evaluate(() => MapView.pick(0));
  await p.waitForSelector('#card:not([hidden])');
  assert.doesNotMatch(await p.textContent('#card'), /Tráfego e segurança/);
  assert.deepEqual(errs, []);
  assert.deepEqual(ext, []);
  await p.context().close();
});

test('nenhuma requisição externa', () => assert.deepEqual(external, []));

test('(h) sem erros no console', () => assert.deepEqual(errors, []));
