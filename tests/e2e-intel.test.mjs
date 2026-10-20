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

test('(g) primeira troca (cache frio) para cada modo quantitativo em menos de 300 ms', async t => {
  const errs = [], ext = [];
  const p = await openPage(errs, ext);
  for (const m of ['trafego', 'pesados', 'carga', 'acidentes']) {
    const r = await p.evaluate(m => new Promise(resolve => {
      const cold = MapView.classesCached(m) === false;
      const t0 = performance.now();
      document.querySelector(`#legend [data-mode="${m}"]`).click();
      requestAnimationFrame(() => requestAnimationFrame(() => resolve({ ms: performance.now() - t0, cold })));
    }), m);
    t.diagnostic(`${m} (frio): ${r.ms.toFixed(0)} ms`);
    assert.equal(r.cold, true, `${m} já estava em cache`);
    assert.equal(await p.evaluate(() => MapView.colorMode()), m);
    assert.ok(r.ms < 300, `${m} (frio): levou ${r.ms.toFixed(0)} ms`);
  }
  assert.deepEqual(errs, []);
  await p.context().close();
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

// ---------- Task 10: camadas de sobreposição e cartões de ponto ----------
const LAYER_LABELS = ['Praças de pedágio', 'SATs', 'Obras ANTT', 'Ferrovias em operação', 'Portos e ETCs', 'Fluxos ferroviários de grãos'];
const layerBox = key => page.locator(`#layers-section input[data-layer="${key}"]`);
async function setLayer(p, key, on) {
  const box = p.locator(`#layers-section input[data-layer="${key}"]`);
  if (on) await box.check(); else await box.uncheck();
  await p.waitForTimeout(50);
}

test('(a) seção Camadas acima de Filtros, aberta, com os rótulos, fontes e nota', async () => {
  const order = await page.$$eval('#panel > section', ss => ss.map(s => s.id));
  assert.ok(order.indexOf('layers-section') >= 0 && order.indexOf('layers-section') < order.indexOf('filters-section'), order.join());
  assert.equal(await page.locator('#layers-section details[open]').count(), 1);
  const t = await page.textContent('#layers-section');
  assert.match(t, /Camadas/);
  for (const l of LAYER_LABELS) assert.ok(t.includes(l), l);
  for (const l of ['Fundo municipal', 'Nenhum', 'Soja', 'Milho', 'Cana', 'Algodão', 'Café', 'Trigo', 'Armazenagem']) assert.ok(t.includes(l), l);
  assert.match(t, /Medido: praças, SATs \(ANTT\), PAM, Estoques\. Modelado: VMDa, carga PNL\./);
  // todas desligadas por padrão; fundo = Nenhum
  assert.equal(await page.locator('#layers-section input[data-layer]:checked').count(), 0);
  assert.equal(await page.locator('#layers-section input[name="fundo"]:checked').getAttribute('value'), '');
  // cada camada com title de fonte e período
  for (const title of await page.$$eval('#layers-section label:has(input[data-layer])', ls => ls.map(l => l.title))) {
    assert.ok(title.length > 15 && !/undefined|null/.test(title) && !title.startsWith('—'), title);
  }
});

test('(f) Rodovias estaduais só aparece com INTEL.estaduais', async () => {
  const has = await page.evaluate(() => !!(window.INTEL.estaduais && window.INTEL.estaduais.malha));
  assert.equal(await layerBox('estaduais').count(), has ? 1 : 0);
  if (!has) assert.doesNotMatch(await page.textContent('#layers-section'), /Rodovias estaduais/);
});

test('(f) com um bloco estaduais (contrato da Task 6) a camada liga e desenha malha e concessões', async () => {
  const errs = [], ext = [];
  const fake = { fonte: [{ nome: 'Infra S.A. — Rodovias estaduais', periodo: '2021' }], tipo: 'medido',
    malha: { campos: ['uf', 'via', 'sre', 'sup', 'km_i', 'km_f', 'ext'], linhas: [['SP', 'SP-330', 'x', 'PAV', 0, 1, 1], ['SP', 'SP-310', 'y', 'PAV', 0, 1, 1]],
      p: [[-4700000, -2300000, 1000, 1000], [-4800000, -2200000, 500, -500, 500, 0]] },
    entidades: [{ id: 'sp-x', nome: 'X', uf: 'SP' }], entEst: [[1]], entFis: [[]], entGeo: [[[-4750000, -2250000, 2000, 0]]] };
  const p = await openPage(errs, ext, html => html.replace('window.INTEL={', `window.INTEL={"estaduais":${JSON.stringify(fake)},`));
  const real = await p.evaluate(() => window.INTEL.estaduais.malha.p.length);
  const box = p.locator('#layers-section input[data-layer="estaduais"]');
  assert.equal(await box.count(), 1);
  assert.match(await p.textContent('#layers-section'), /Rodovias estaduais/);
  await box.check();
  await p.waitForTimeout(50);
  assert.equal(await p.evaluate(() => Layers.count('estaduais')), real);
  assert.equal(await p.evaluate(() => Layers.isOn('estaduais')), true);
  await box.uncheck();
  assert.deepEqual(errs, []);
  await p.context().close();
});

// Mede na página principal (única aberta nesse momento): uma 2ª página headless em segundo plano atrasa os quadros da outra.
test('(g) ligar cada camada leva menos de 400 ms (1ª vez); fundo municipal < 1.200 ms', async t => {
  const timeClick = sel => page.evaluate(sel => new Promise(resolve => {
    const t0 = performance.now();
    document.querySelector(sel).click();
    requestAnimationFrame(() => requestAnimationFrame(() => resolve(performance.now() - t0)));
  }), sel);
  const keys = ['pracas', 'sats', 'obras', 'ferrovias', 'portos', 'siade'];
  if (await layerBox('estaduais').count()) keys.push('estaduais');
  for (const key of keys) {
    assert.equal(await page.evaluate(k => Layers.count(k), key), 0, `${key} já construída`);
    const ms = await timeClick(`#layers-section input[data-layer="${key}"]`);
    t.diagnostic(`${key}: ${ms.toFixed(0)} ms`);
    assert.ok(ms < 400, `${key}: ${ms.toFixed(0)} ms`);
  }
  const mun = await timeClick('#layers-section input[name="fundo"][value="soja"]');
  t.diagnostic(`fundo municipal (1ª vez): ${mun.toFixed(0)} ms`);
  assert.ok(mun < 1200, `fundo: ${mun.toFixed(0)} ms`);
  const mun2 = await timeClick('#layers-section input[name="fundo"][value="milho"]');
  t.diagnostic(`fundo municipal (troca): ${mun2.toFixed(0)} ms`);
  assert.ok(mun2 < 400, `troca de fundo: ${mun2.toFixed(0)} ms`);
  await page.check('#layers-section input[name="fundo"][value=""]');
  for (const key of keys) await setLayer(page, key, false);
  assert.deepEqual(errors, []);
});

test('(b) Praças: ≥ 230 pontos; cartão da maior VMD com veíc./dia, gráfico e fonte', async () => {
  await setLayer(page, 'pracas', true);
  assert.ok(await page.evaluate(() => Layers.count('pracas')) >= 230);
  const top = await page.evaluate(() => {
    const rows = Layers.rowsOf('pracas');
    let best = 0;
    rows.forEach((r, i) => { if ((r.vmd || 0) > (rows[best].vmd || 0)) best = i; });
    return { i: best, nome: rows[best].nome, ent: rows[best].ent, ficha: !!rows[best].ent && Ficha.exists(rows[best].ent) };
  });
  await page.evaluate(i => Layers.open('pracas', i), top.i);
  await page.waitForSelector('#card:not([hidden])');
  const t = await page.textContent('#card');
  assert.ok(t.includes(top.nome));
  assert.match(t, /veíc\.\/dia/);
  assert.match(t, /VMD 2025/);
  assert.match(t, /% pesados/);
  assert.match(t, /Eixos médios do comercial/);
  assert.match(t, /Receita 2025/);
  assert.match(t, /Contagem medida · ANTT/);
  assert.match(t, /jan\/2024 a ago\/2026/);
  assert.ok(await page.locator('#card svg.chart path.line').count() >= 2);
  assert.match(await page.locator('#card svg.chart title').first().textContent(), /^Leves [a-z]{3}\/\d{4}: /);
  assert.equal(await page.locator('#card a[href^="#ficha/"]').count(), top.ficha ? 1 : 0);
  assert.ok(!/NaN|undefined|null/.test(t));
  assert.deepEqual(await page.evaluate(() => Layers.selected()), { key: 'pracas', i: top.i });
  await page.click('#card-close');
  assert.equal(await page.evaluate(() => Layers.selected()), null);
});

test('(b) clique real no mapa sobre uma praça abre o cartão dela (antes da rodovia embaixo)', async () => {
  const r = await page.evaluate(() => {
    const rows = Layers.rowsOf('pracas');
    const i = rows.findIndex(x => x.vmd > 20000);
    MapView.map.setView([rows[i].lat, rows[i].lon], 10, { animate: false });
    const pt = MapView.map.latLngToContainerPoint([rows[i].lat, rows[i].lon]);
    const box = MapView.map.getContainer().getBoundingClientRect();
    return { i, nome: rows[i].nome, x: box.left + pt.x, y: box.top + pt.y };
  });
  await page.waitForTimeout(200);
  await page.mouse.move(r.x + 1, r.y + 1);
  await page.waitForTimeout(80);
  assert.match(await page.textContent('.leaflet-tooltip.pt-tip'), /veíc\.\/dia/);
  await page.mouse.click(r.x + 1, r.y + 1);
  await page.waitForSelector('#card:not([hidden])');
  assert.equal((await page.textContent('#card .card__title')).trim(), r.nome);
  await page.click('#card-close');
});

test('cartão do trecho lista "Medições no trecho" e abre o cartão da praça', async () => {
  const fis = await page.evaluate(() => Layers.rowsOf('pracas').find(r => r.fis != null && r.vmd > 0).fis);
  await page.evaluate(j => MapView.pick(j), fis);
  await page.waitForSelector('#card:not([hidden])');
  assert.match(await page.textContent('#card'), /Medições no trecho/);
  const btn = page.locator('#card .meas[data-pt="pracas"]').first();
  const nome = (await btn.locator('.meas__name').textContent());
  assert.match(await btn.textContent(), /veíc\.\/dia/);
  await btn.click();
  assert.match(await page.textContent('#card .card__code'), /Praça de pedágio/);
  assert.ok(nome.startsWith((await page.textContent('#card .card__title')).trim()));
  await page.click('#card-close');
});

test('SATs e Obras: cartões com período, % pesados e previsto × executado', async () => {
  await setLayer(page, 'sats', true);
  await setLayer(page, 'obras', true);
  assert.ok(await page.evaluate(() => Layers.count('sats')) >= 400);
  assert.ok(await page.evaluate(() => Layers.count('obras')) >= 900);
  const i = await page.evaluate(() => Layers.rowsOf('sats').findIndex(r => r.periodo && r.periodo.includes('/')));
  await page.evaluate(i => Layers.open('sats', i), i);
  let t = await page.textContent('#card');
  assert.match(t, /% pesados/); assert.match(t, /% motos/); assert.match(t, /Período/);
  assert.match(t, /set\/2025 a ago\/2026/);
  const o = await page.evaluate(() => Layers.items('obras')[0]);
  await page.evaluate(i => Layers.open('obras', i), o);
  t = await page.textContent('#card');
  assert.match(t, /Previsto/); assert.match(t, /Executado/); assert.match(t, /\d%/);
  assert.ok(!/NaN|undefined|null/.test(t));
  await page.click('#card-close');
  await setLayer(page, 'sats', false);
  await setLayer(page, 'obras', false);
});

test('(c) Portos e ETCs: só os 4 tipos', async () => {
  await setLayer(page, 'portos', true);
  const r = await page.evaluate(() => {
    const rows = Layers.rowsOf('portos');
    const shown = Layers.items('portos').map(i => rows[i].tipoLabel);
    return { n: Layers.count('portos'), tipos: [...new Set(shown)].sort(), raw: [...new Set(Layers.items('portos').map(i => rows[i].tipo))].sort() };
  });
  assert.ok(r.n > 300, String(r.n));
  assert.deepEqual(r.tipos, ['ETC', 'Porto Organizado', 'Porto público', 'TUP']);
  assert.deepEqual(r.raw, ['Estação de transbordo de cargas', 'Porto Organizado', 'Porto Público', 'Terminal de uso privado']);
  const i = await page.evaluate(() => Layers.items('portos')[0]);
  await page.evaluate(i => Layers.open('portos', i), i);
  assert.match(await page.textContent('#card'), /UF/);
  await page.click('#card-close');
});

test('(e) Ferrovias e fluxos SIADE ligam sem erro', async () => {
  await setLayer(page, 'ferrovias', true);
  await setLayer(page, 'siade', true);
  assert.ok(await page.evaluate(() => Layers.count('ferrovias')) > 100);
  assert.ok(await page.evaluate(() => Layers.count('siade')) > 50);
  assert.equal(await page.evaluate(() => Layers.isOn('ferrovias') && Layers.isOn('siade')), true);
  assert.deepEqual(errors, []);
});

test('(d) Fundo Soja: legenda com 5 faixas e "IBGE PAM 2025"; Sorriso mostra a produção', async () => {
  await page.check('#layers-section input[name="fundo"][value="soja"]');
  await page.waitForSelector('#fundo-legend:not([hidden])');
  assert.equal(await page.locator('#fundo-legend .legend__row[data-class]').count(), 5);
  const lt = await page.textContent('#fundo-legend');
  assert.match(lt, /IBGE PAM 2025/);
  assert.match(lt, /Soja/);
  assert.match(lt, /Sem dado ou zero/);
  const rows = await page.$$eval('#fundo-legend .legend__row[data-class] .legend__range', es => es.map(e => e.textContent));
  for (let i = 1; i < rows.length; i++) assert.equal(rows[i].split(' – ')[0], rows[i - 1].split(' – ')[1]);
  assert.equal(await page.evaluate(() => Layers.fundo()), 'soja');
  assert.ok(await page.evaluate(() => Layers.count('mun')) > 5000);
  // hit test por polígono: um ponto dentro de Sorriso
  const inside = await page.evaluate(() => {
    const mu = window.INTEL.municipios, k = mu.ids.indexOf('5107925');
    const [lon, lat] = mu.centro[k];
    return Layers.munAt(lat, lon);
  });
  assert.equal(inside, '5107925');
  await page.evaluate(() => Layers.open('mun', '5107925'));
  await page.waitForSelector('#card:not([hidden])');
  const t = await page.textContent('#card');
  assert.match(t, /Sorriso \/ MT/);
  assert.match(t, /2\.343\.000 t|2,3 Mt/);
  assert.match(t, /Milho 2ª safra/);
  assert.match(t, /Capacidade útil/);
  assert.ok(!/NaN|undefined|null/.test(t));
  await page.click('#card-close');
  // armazenagem explica o sigilo
  await page.check('#layers-section input[name="fundo"][value="armazenagem"]');
  const at = await page.textContent('#fundo-legend');
  assert.match(at, /IBGE Estoques 2º sem\/2025/);
  assert.match(at, /Sigilo/);
  await page.check('#layers-section input[name="fundo"][value=""]');
  assert.equal(await page.isHidden('#fundo-legend'), true);
  assert.equal(await page.evaluate(() => Layers.fundo()), null);
});

test('clique real numa rodovia continua abrindo o cartão do trecho depois de um realce', async () => {
  for (const key of ['pracas', 'portos', 'ferrovias', 'siade']) await setLayer(page, key, false);
  await page.evaluate(() => MapView.pick(100));
  await page.click('#card-close');
  await page.evaluate(() => MapView.map.setView([-15.8, -47.9], 9, { animate: false }));
  await page.waitForTimeout(250);
  // acha um pixel de rodovia pelo cursor do canvas
  let pt = null;
  for (let x = 500; x < 1300 && !pt; x += 9) for (let y = 200; y < 800 && !pt; y += 9) {
    await page.mouse.move(x, y);
    if (await page.evaluate(() => !!document.querySelector('.leaflet-overlay-pane canvas.leaflet-interactive'))) pt = [x, y];
  }
  assert.ok(pt, 'nenhuma rodovia sob o cursor');
  await page.mouse.click(...pt);
  await page.waitForSelector('#card:not([hidden])');
  assert.match(await page.textContent('#card .card__code'), /\d{3}B[A-Z]{2}\d{4}/);
  await page.click('#card-close');
  await page.evaluate(() => MapView.fitBrasil(false));
});

test('sem window.INTEL a seção Camadas não quebra', async () => {
  const errs = [], ext = [];
  const p = await openPage(errs, ext, html => html.replace('window.INTEL=', 'window.INTEL_AUSENTE='));
  assert.match(await p.textContent('#layers-section'), /Camadas/);
  assert.equal(await p.locator('#layers-section input[data-layer]').count(), 0);
  assert.equal(await p.locator('#layers-section input[name="fundo"]').count(), 0);
  await p.evaluate(() => MapView.pick(0));
  await p.waitForSelector('#card:not([hidden])');
  assert.doesNotMatch(await p.textContent('#card'), /Medições no trecho/);
  assert.deepEqual(errs, []);
  await p.context().close();
});

test('nenhuma requisição externa', () => assert.deepEqual(external, []));

test('(h) sem erros no console', () => assert.deepEqual(errors, []));
