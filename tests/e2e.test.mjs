// Testes de ponta a ponta: abre o HTML gerado via file:// no Chromium.
// Rodar: NODE_PATH=$(npm root -g) node --test tests/e2e.test.mjs  (requer mapa-rodovias.html gerado)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const HTML = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'mapa-rodovias.html');

let browser, page;
const external = [], errors = [];

before(async () => {
  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.route('**/*', r => {
    const url = r.request().url();
    if (url.startsWith('file:') || url.startsWith('data:')) return r.continue();
    external.push(url);
    return r.abort();
  });
  page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('file://' + HTML);
  await page.waitForSelector('#kpi-km');
});
after(async () => { await browser?.close(); });

const kpi = () => page.textContent('#kpi-km');
async function check(group, label) {
  const det = page.locator(`details[data-group="${group}"]`);
  if (!(await det.evaluate(d => d.open))) await det.locator('summary').click();
  await page.locator(`input[data-filter="${group}"][data-label="${label}"]`).check();
}

test('KPI inicial', async () => {
  assert.equal((await kpi()).trim(), '122.394,9 km');
  assert.match(await page.textContent('#kpi-n'), /6\.815/);
});

test('filtro combinado bate com o modelo', async () => {
  await check('uf', 'PR');
  await check('situacao', 'Duplicada');
  await check('adm', 'Concessão Federal');
  await page.waitForTimeout(150);
  const expected = await page.evaluate(() => {
    const f = Model.emptyFilters(), d = window.SNV.dict;
    f.uf.add(d.uf.indexOf('PR')); f.situacao.add(d.situacao.indexOf('Duplicada')); f.adm.add(d.adm.indexOf('Concessão Federal'));
    const a = Model.aggregate(window.SNV, f, Model.visibleFis(window.SNV, f));
    return { txt: Model.fmtKm(a.km), km: a.km };
  });
  assert.ok(expected.km > 0);
  assert.equal((await kpi()).trim(), expected.txt);
});

test('limpar filtros volta ao inicial', async () => {
  await page.click('#clear-filters');
  await page.waitForTimeout(150);
  assert.equal((await kpi()).trim(), '122.394,9 km');
});

test('busca 116 realça a BR inteira sem mudar o KPI', async () => {
  await page.fill('#search-input', '116');
  await page.waitForSelector('#suggestions li');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  assert.ok(await page.evaluate(() => MapView.highlighted().length) > 10);
  assert.equal((await kpi()).trim(), '122.394,9 km');
  await page.keyboard.press('Escape');
});

test('busca sobradinho sugere a localidade', async () => {
  await page.fill('#search-input', 'sobradinho');
  await page.waitForSelector('#suggestions li');
  assert.match(await page.locator('#suggestions li').first().textContent(), /SOBRADINHO/);
  await page.keyboard.press('Escape');
});

test('clicar num trecho abre o cartão', async () => {
  await page.evaluate(() => MapView.pick(0));
  await page.waitForSelector('#card:not([hidden])');
  assert.match(await page.textContent('#card'), /BR-\d{3}/);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#card').isHidden(), true);
});
