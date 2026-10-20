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

// Mede na página principal antes de qualquer modo quantitativo ser usado: uma 2ª página headless aberta ao mesmo
// tempo atrasa os quadros da outra (~150 ms), o que tornava a medição instável.
test('(g) primeira troca (cache frio) para cada modo quantitativo em menos de 300 ms', async t => {
  for (const m of ['trafego', 'pesados', 'carga', 'acidentes']) {
    const r = await page.evaluate(m => new Promise(resolve => {
      const cold = MapView.classesCached(m) === false;
      const t0 = performance.now();
      document.querySelector(`#legend [data-mode="${m}"]`).click();
      requestAnimationFrame(() => requestAnimationFrame(() => resolve({ ms: performance.now() - t0, cold })));
    }), m);
    t.diagnostic(`${m} (frio): ${r.ms.toFixed(0)} ms`);
    assert.equal(r.cold, true, `${m} já estava em cache`);
    assert.equal(await page.evaluate(() => MapView.colorMode()), m);
    assert.ok(r.ms < 300, `${m} (frio): levou ${r.ms.toFixed(0)} ms`);
  }
  await mode('concessoes');
  assert.equal(await page.evaluate(() => MapView.colorMode()), 'concessoes');
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

test('(f) Rodovias estaduais só aparece com INTEL.estaduais; concessões estaduais distintas das federais', async () => {
  const has = await page.evaluate(() => !!(window.INTEL.estaduais && window.INTEL.estaduais.malha));
  assert.equal(await layerBox('estaduais').count(), has ? 1 : 0);
  if (!has) assert.doesNotMatch(await page.textContent('#layers-section'), /Rodovias estaduais/);
  const st = await page.evaluate(() => LAYER_STYLES.estConc);
  assert.deepEqual([st.color, st.weight, st.halo, st.haloOpacity, st.haloExtra], ['#0071BB', 3, '#231F20', 0.35, 3]);
  if (has) {
    // entidades só com entFis (ex.: Rota de Santa Maria) também têm geometria
    const r = await page.evaluate(() => {
      const e = window.INTEL.estaduais, lines = IntelModel.estConcLines(e, window.SNV);
      const so = e.entidades.map((_, k) => k).filter(k => !(e.entEst[k] || []).length && !(e.entGeo[k] || []).length && (e.entFis[k] || []).length);
      return { so: so.length, ok: so.every(k => lines[k].length > 0) };
    });
    assert.ok(r.ok, 'entidade só com entFis sem geometria');
  }
});

test('(f) com um bloco estaduais (contrato da Task 6) a camada liga e desenha malha e concessões', async () => {
  const errs = [], ext = [];
  const fake = { fonte: [{ nome: 'Infra S.A. — Rodovias estaduais', periodo: '2021' }], tipo: 'medido',
    malha: { campos: ['uf', 'via', 'sre', 'sup', 'km_i', 'km_f', 'ext'], linhas: [['SP', 'SP-330', 'x', 'PAV', 0, 1, 1], ['SP', 'SP-310', 'y', 'PAV', 0, 1, 1]],
      p: [[-4700000, -2300000, 1000, 1000], [-4800000, -2200000, 500, -500, 500, 0]] },
    entidades: [{ id: 'sp-x', nome: 'Concessão X', uf: 'SP', regulador: 'ARTESP', rodovias: ['SP-310'], km_decl: 10, km_map: 9.5, qualidade: 'ok',
      grupo: 'Grupo Y', assinatura: '2020-01-02', fim: '2050-01-01', capex_bi: 1.5, capex_ref: '2024', fonte_url: 'https://example.org/x' },
      { id: 'rs-y', nome: 'Só SNV', uf: 'RS', qualidade: 'aproximado', nota: 'Recorte por rodovia inteira.' }],
    entEst: [[1], []], entFis: [[], [0]], entGeo: [[[-4750000, -2250000, 2000, 0]], []] };
  // Substitui (ou cria) INTEL.estaduais logo depois da linha de dados, valendo com ou sem o bloco real no build.
  const inject = html => {
    const i = html.indexOf('</script>', html.indexOf('window.INTEL='));
    return `${html.slice(0, i)};window.INTEL.estaduais=${JSON.stringify(fake)};${html.slice(i)}`;
  };
  const p = await openPage(errs, ext, inject);
  const real = await p.evaluate(() => window.INTEL.estaduais.malha.p.length);
  assert.equal(real, 2);
  const box = p.locator('#layers-section input[data-layer="estaduais"]');
  assert.equal(await box.count(), 1);
  assert.match(await p.textContent('#layers-section'), /Rodovias estaduais/);
  assert.match(await p.textContent('#layers-section .layer-sub'), /Concessões estaduais/);
  await box.check();
  await p.waitForTimeout(50);
  assert.equal(await p.evaluate(() => Layers.count('estaduais')), real);
  assert.equal(await p.evaluate(() => Layers.isOn('estaduais')), true);
  {
    // entFis (físico 0 do SNV) também é desenhado: as duas entidades têm geometria
    assert.equal(await p.evaluate(() => Layers.count('estconc')), 2);
    // clique real no meio do traçado próprio (entGeo) da 1ª entidade abre o cartão dela
    const xy = await p.evaluate(() => {
      MapView.map.setView([-22.5, -47.49], 12, { animate: false });
      const pt = MapView.map.latLngToContainerPoint([-22.5, -47.49]), box = MapView.map.getContainer().getBoundingClientRect();
      return [box.left + pt.x, box.top + pt.y];
    });
    await p.waitForTimeout(150);
    await p.mouse.click(xy[0], xy[1] + 2);
    await p.waitForSelector('#card:not([hidden])');
    const t = await p.textContent('#card');
    for (const re of [/Concessão X/, /Concessão estadual · SP · ARTESP/, /SP-310/, /10,0 km × 9,5 km/, /Recorte ok/, /Grupo Y/, /02\/01\/2020 \/ 01\/01\/2050/, /R\$ 1,50 bi \(ref\. 2024\)/]) assert.match(t, re);
    assert.equal(await p.getAttribute('#card a[href="https://example.org/x"]', 'target'), '_blank');
    assert.deepEqual(await p.evaluate(() => Layers.selected()), { key: 'estconc', i: 0 });
  }
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
  // clique real no centroide de Sorriso (zoom 8): clique do mapa -> munAt -> cartão
  const xy = await page.evaluate(() => {
    const mu = window.INTEL.municipios, [lon, lat] = mu.centro[mu.ids.indexOf('5107925')];
    MapView.map.setView([lat, lon], 8, { animate: false });
    const pt = MapView.map.latLngToContainerPoint([lat, lon]), box = MapView.map.getContainer().getBoundingClientRect();
    return [box.left + pt.x, box.top + pt.y];
  });
  await page.waitForTimeout(250);
  await page.mouse.move(xy[0], xy[1]);
  await page.waitForTimeout(80);
  assert.equal(await page.evaluate(() => !!document.querySelector('.leaflet-overlay-pane canvas.leaflet-interactive')), false, 'há rodovia sob o centroide');
  await page.mouse.click(xy[0], xy[1]);
  await page.waitForSelector('#card:not([hidden])');
  assert.equal((await page.textContent('#card .card__title')).trim(), 'Sorriso / MT');
  assert.deepEqual(await page.evaluate(() => Layers.selected()), { key: 'mun', i: '5107925' });
  await page.click('#card-close');
  // clique real numa rodovia com o fundo ligado: abre o trecho, não o município (notePick)
  let road = null;
  for (let x = 420; x < 1300 && !road; x += 9) for (let y = 120; y < 800 && !road; y += 9) {
    await page.mouse.move(x, y);
    if (await page.evaluate(() => !!document.querySelector('.leaflet-overlay-pane canvas.leaflet-interactive'))) road = [x, y];
  }
  assert.ok(road, 'nenhuma rodovia sob o cursor');
  await page.mouse.click(...road);
  await page.waitForSelector('#card:not([hidden])');
  assert.match(await page.textContent('#card .card__code'), /\d{3}B[A-Z]{2}\d{4}/);
  assert.doesNotMatch(await page.textContent('#card .card__code'), /Município/);
  assert.equal(await page.evaluate(() => Layers.selected()), null);
  await page.click('#card-close');
  await page.evaluate(() => MapView.fitBrasil(false));
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

// ---------- Task 11: ficha com ANTT, ficha estadual, Projetos com esfera e pipeline ----------
async function go(hash) {
  await page.evaluate(h => { location.hash = h; }, hash);
  await page.waitForTimeout(250);
}
const fichaText = () => page.textContent('#ficha');
const blockTitles = () => page.$$eval('#ficha .fblock h3', hs => hs.map(h => h.textContent));

test('(a) ficha Nova Rota do Oeste: ANTT, controladora, gráfico de receita e praças por VMD', async () => {
  await go('#mapa'); await go('#ficha/nova-rota-do-oeste');
  const t = await fichaText();
  assert.match(t, /ANTT/);
  assert.match(t, /MTPAR/);
  for (const re of [/Controladora/, /Trecho/, /Extensão/, /850,9 km/, /12\/03\/2014/, /003\/2013/, /06\/09\/2015/, /21\/set/]) assert.match(t, re);
  // prazo é o vigente (com prorrogações), em caixa baixa
  const kv = await page.$$eval('#ficha .fblock', bs => {
    const b = bs.find(x => x.querySelector('h3').textContent === 'ANTT');
    return Object.fromEntries([...b.querySelectorAll('dt')].map(dt => [dt.textContent, dt.nextElementSibling.textContent]));
  });
  assert.equal(kv['Prazo atual (com prorrogações)'], '30 anos');
  assert.ok(!('Prazo' in kv));
  const url = await page.evaluate(() => window.INTEL.antt.capas['nova-rota-do-oeste'].url);
  const link = page.locator('#ficha a', { hasText: 'Página da concessão na ANTT' });
  assert.equal(await link.getAttribute('href'), url);
  assert.equal(await link.getAttribute('target'), '_blank');
  assert.ok(await page.locator('#ficha-antt-serie svg.chart').count() >= 1);
  assert.match(await page.getAttribute('#ficha-antt-serie svg.chart', 'aria-label'), /Receita/);
  assert.match(await page.textContent('#ficha-antt-serie'), /R\$ nominais · ANTT/);
  assert.match(await page.textContent('#ficha-antt-serie .chart-legend'), /Receita.*Investimento.*Custo/);
  const n = await page.locator('#ficha-pracas tbody tr').count();
  assert.ok(n >= 1, String(n));
  const exp = await page.evaluate(() => IntelModel.pracasDe(window.INTEL, 'nova-rota-do-oeste'));
  assert.equal(n, exp.linhas.length);
  assert.deepEqual(await page.$$eval('#ficha-pracas tbody tr td:first-child', tds => tds.map(td => td.textContent)), exp.linhas.map(p => p.nome));
  const vmds = exp.linhas.map(p => p.vmd);
  assert.deepEqual(vmds, [...vmds].sort((a, b) => b - a));
  assert.match(await page.textContent('#ficha-pracas tfoot'), new RegExp(exp.receita ? (await page.evaluate(v => IntelModel.fmtBRL(v), exp.receita)).replace(/[$.]/g, '\\$&') : '—'));
  assert.match(t, /Contagem medida · ANTT 2025/);
  assert.doesNotMatch(t, /undefined|NaN/);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  assert.equal(await page.evaluate(() => location.hash), '#mapa');
});

test('(a) contrato anterior listado e com série rotulada; obras e pipeline na ficha', async () => {
  const r = await page.evaluate(() => {
    const ids = window.CONC.entidades.map(e => e.id);
    const ant = ids.find(id => IntelModel.anttAnteriores(window.INTEL, id).length && IntelModel.anttSeries(window.INTEL, id).some(s => s.anterior));
    const obra = ids.find(id => IntelModel.obrasResumo(window.INTEL, id).total >= 12);
    const pipe = ids.find(id => IntelModel.pipelineDe(window.INTEL, id).length);
    return { ant, antNome: ant && IntelModel.anttAnteriores(window.INTEL, ant)[0].nome, obra, obras: obra && IntelModel.obrasResumo(window.INTEL, obra), pipe,
      pipeItem: pipe && IntelModel.pipelineDe(window.INTEL, pipe)[0], pipeLabel: pipe && IntelModel.statusLabel(window.INTEL, IntelModel.pipelineDe(window.INTEL, pipe)[0].status) };
  });
  assert.ok(r.ant && r.obra && r.pipe, JSON.stringify(r).slice(0, 200));
  await go('#ficha/' + r.ant);
  assert.ok((await fichaText()).includes(`Contrato anterior: ${r.antNome} (encerrado)`));
  assert.ok((await page.textContent('#ficha-antt-serie')).includes(r.antNome));
  assert.ok(await page.locator('#ficha-antt-serie svg.chart').count() >= 1);

  await go('#ficha/' + r.obra);
  const o = r.obras;
  const kv = await page.$$eval('#ficha-obras dl.fgrid dt', dts => Object.fromEntries(dts.map(dt => [dt.textContent, dt.nextElementSibling.textContent])));
  assert.equal(kv['Concluídas'], String(o.concluidas));
  assert.equal(kv['Em andamento'], String(o.andamento));
  assert.equal(kv['Não iniciadas'], String(o.naoIniciadas));
  assert.equal(await page.locator('#ficha-obras tbody tr').count(), Math.min(10, o.top.length));
  assert.ok(o.concluidas + o.andamento + o.naoIniciadas + o.semDado === o.total);

  await go('#ficha/' + r.pipe);
  const pt = await page.textContent('#ficha-pipeline');
  assert.ok(pt.includes(r.pipeLabel), pt);
  if (r.pipeItem.fonte_url) assert.equal(await page.locator(`#ficha-pipeline a[href="${r.pipeItem.fonte_url}"]`).count(), 1);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
});

test('(b) ficha sem capa ANTT não mostra o bloco ANTT; nenhuma ficha mostra "undefined" ou "NaN"', async () => {
  const id = await page.evaluate(() => window.CONC.entidades.find(e => e.estado === 'projeto2027' && !IntelModel.anttCapa(window.INTEL, e.id) &&
    !IntelModel.anttAnteriores(window.INTEL, e.id).length).id);
  await go('#ficha/' + id);
  const titles = await blockTitles();
  assert.ok(!titles.some(h => /ANTT|Receita, investimento|Praças da concessão/.test(h)), titles.join(' | '));
  assert.doesNotMatch(await fichaText(), /undefined|NaN/);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  const bad = await page.evaluate(() => {
    const ids = window.CONC.entidades.map(e => e.id).concat(window.INTEL.estaduais.entidades.map(e => e.id));
    const out = [];
    for (const id of ids) {
      if (!Ficha.exists(id)) { out.push('não existe: ' + id); continue; }
      Ficha.open(id);
      if (/undefined|NaN|\[object|\d (Anos|Meses)\b/.test(document.getElementById('ficha').textContent)) out.push(id);
      Ficha.close(true);
    }
    return out;
  });
  assert.deepEqual(bad, []);
  await go('#mapa');
});

test('(c) ficha estadual: etiqueta, campos e "Ver no mapa" liga a camada, realça e enquadra', async () => {
  const s = await page.evaluate(() => {
    const e = window.INTEL.estaduais, lines = IntelModel.estConcLines(e, window.SNV);
    const k = e.entidades.findIndex((x, i) => lines[i].length && x.regulador && x.fonte_url && x.trechos && x.trechos.length);
    const nm = e.entidades.findIndex((x, i) => x.qualidade === 'nao_mapeado' && !lines[i].length);
    const flat = lines[k].flat();
    return { k, e: e.entidades[k], nm: nm >= 0 ? e.entidades[nm].id : null,
      center: [flat.reduce((a, p) => a + p[0], 0) / flat.length, flat.reduce((a, p) => a + p[1], 0) / flat.length] };
  });
  assert.ok(s.k >= 0);
  await go('#projetos'); await go('#ficha/' + s.e.id);
  assert.equal(await page.isVisible('#ficha'), true);
  const t = await fichaText();
  assert.ok(t.includes(s.e.nome));
  assert.ok(t.includes(`Concessão estadual · ${s.e.uf} · ${s.e.regulador}`), t.slice(0, 300));
  for (const re of [/Poder concedente/, /Rodovias/, /Trechos/, /km declarado × mapeado/, /Qualidade do recorte/, /Assinatura/, /Fim/]) assert.match(t, re);
  const prazo = await page.$$eval('#ficha dt', dts => { const d = dts.find(x => x.textContent === 'Prazo atual (com prorrogações)'); return d ? d.nextElementSibling.textContent : null; });
  assert.equal(prazo, s.e.prazo.replace(/\bAnos\b/, 'anos'));
  assert.ok(t.includes(s.e.trechos[0].rod));
  assert.equal(await page.locator(`#ficha a[href="${s.e.fonte_url}"]`).count() >= 1, true);
  assert.doesNotMatch(t, /undefined|NaN/);
  // Esc volta à aba anterior
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  assert.equal(await page.evaluate(() => location.hash), '#projetos');
  assert.equal(await page.isVisible('#ficha'), false);
  // Ver no mapa
  await go('#ficha/' + s.e.id);
  assert.equal(await page.isDisabled('#ficha-map'), false);
  await page.click('#ficha-map');
  await page.waitForTimeout(400);
  assert.equal(await page.evaluate(() => location.hash), '#mapa');
  assert.equal(await page.isVisible('#ficha'), false);
  assert.equal(await page.evaluate(() => Layers.isOn('estaduais')), true);
  assert.equal(await page.isChecked('#layers-section input[data-layer="estaduais"]'), true);
  assert.deepEqual(await page.evaluate(() => Layers.selected()), { key: 'estconc', i: s.k });
  assert.equal(await page.evaluate(c => MapView.map.getBounds().contains(c), s.center), true);
  assert.ok(await page.evaluate(() => MapView.map.getZoom()) >= 6);
  await page.click('#card-close');
  await page.locator('#layers-section input[data-layer="estaduais"]').uncheck();
  // não mapeada sem geometria: botão desabilitado com explicação
  if (s.nm) {
    await go('#ficha/' + s.nm);
    assert.equal(await page.isDisabled('#ficha-map'), true);
    assert.match(await page.getAttribute('#ficha-map', 'title'), /sem traçado/i);
    assert.match(await fichaText(), /sem traçado no mapa/i);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
  }
  await page.evaluate(() => MapView.fitBrasil(false));
});

test('(d) Projetos: coluna e filtro Esfera; Estadual mostra só estaduais e totais iguais à soma', async () => {
  await go('#projetos');
  const nEst = await page.evaluate(() => window.INTEL.estaduais.entidades.length);
  const nFed = await page.evaluate(() => window.CONC.entidades.length);
  assert.equal(await page.locator('#proj-table tbody tr').count(), nFed + nEst);
  assert.ok((await page.$$eval('#proj-table thead th', ths => ths.map(t => t.textContent.trim()))).includes('Esfera'));
  await page.selectOption('#proj-esfera', 'estadual');
  assert.equal(await page.locator('#proj-table tbody tr').count(), nEst);
  const r = await page.evaluate(() => {
    const rows = Projetos.rowsShown(), nf = d => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
    const km = rows.reduce((a, x) => a + (x.km || 0), 0), capex = rows.reduce((a, x) => a + (x.capex || 0), 0);
    return { all: rows.every(x => x.esfera === 'estadual'), km: nf(1).format(km), capex: nf(2).format(capex),
      shownKm: document.getElementById('proj-total-km').textContent, shownCapex: document.getElementById('proj-total-capex').textContent,
      esferaCells: [...document.querySelectorAll('#proj-table tbody tr')].map(tr => tr.children[1].textContent) };
  });
  assert.equal(r.all, true);
  assert.equal(r.shownKm, r.km);
  assert.equal(r.shownCapex, r.capex);
  assert.ok(r.esferaCells.every(c => c === 'Estadual'), r.esferaCells.slice(0, 3).join());
  // estados estaduais têm chip próprio; "Contrato vigente anterior" (federal) não inclui estaduais
  await page.selectOption('#proj-esfera', '');
  await page.click('[data-f="estado"][data-v="estadual_vigente"]');
  const v = await page.evaluate(() => Projetos.rowsShown().map(x => x.esfera));
  assert.ok(v.length > 0 && v.every(x => x === 'estadual'));
  assert.match(await page.textContent('#proj-table tbody'), /Contrato estadual vigente/);
  await page.click('[data-f="estado"][data-v="estadual_vigente"]');
  await page.click('[data-f="estado"][data-v="vigente"]');
  assert.ok((await page.evaluate(() => Projetos.rowsShown().map(x => x.esfera))).every(x => x === 'federal'));
  await page.click('[data-f="estado"][data-v="vigente"]');
  // linha estadual abre a ficha estadual
  await page.selectOption('#proj-esfera', 'estadual');
  await page.locator('#proj-table tbody tr').first().click();
  await page.waitForTimeout(250);
  assert.match(await fichaText(), /Concessão estadual/);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  await page.selectOption('#proj-esfera', '');
});

test('(e, f) Pipeline: ≥ 60 linhas por data prevista, filtros, contagem por status, "não verificado", linha abre a ficha', async () => {
  await go('#projetos');
  const order = await page.evaluate(() => {
    const ids = ['proj-table', 'pipeline', 'estudos-list'].map(id => document.getElementById(id));
    return ids.every(Boolean) && (ids[0].compareDocumentPosition(ids[1]) & 4) && (ids[1].compareDocumentPosition(ids[2]) & 4) ? true : false;
  });
  assert.equal(order, true, 'Pipeline entre o comparador e os estudos pós-2027');
  const rows = page.locator('#pipe-table tbody tr');
  const n = await rows.count();
  assert.ok(n >= 60, String(n));
  const ds = await page.$$eval('#pipe-table tbody tr', trs => trs.map(tr => tr.dataset.data || ''));
  const withD = ds.filter(Boolean);
  assert.deepEqual(withD, [...withD].sort());
  assert.ok(ds.slice(withD.length).every(d => d === ''), 'sem data no fim');
  assert.deepEqual(await page.$$eval('#pipe-table thead th', ths => ths.map(t => t.textContent.trim())),
    ['Nome', 'Esfera', 'UF', 'Rodovias', 'km', 'Status', 'Data prevista', 'Fonte']);
  // (f) etiqueta "não verificado"
  const nv = await page.evaluate(() => window.INTEL.pipeline.itens.filter(i => i.verificado === false).length);
  assert.ok(nv > 0);
  assert.equal(await page.locator('#pipe-table .tag-nv').count(), nv);
  assert.equal(await page.locator('#pipe-table .tag-nv').first().textContent(), 'não verificado');
  // contagem por status no topo
  const counts = await page.evaluate(() => IntelModel.pipelineCounts(window.INTEL.pipeline.itens, window.INTEL.pipeline.status));
  const top = await page.textContent('#pipe-counts');
  for (const c of counts) assert.ok(top.includes(`${c.label} ${c.n}`), `${c.label} ${c.n}`);
  // filtro de esfera e de status
  await page.selectOption('#pipe-esfera', 'estadual');
  const nE = await page.evaluate(() => window.INTEL.pipeline.itens.filter(i => i.esfera === 'estadual').length);
  assert.equal(await rows.count(), nE);
  assert.ok((await page.$$eval('#pipe-table tbody tr td:nth-child(2)', tds => tds.map(t => t.textContent))).every(t => t === 'Estadual'));
  await page.selectOption('#pipe-esfera', '');
  await page.click('#pipe-counts [data-pstatus="estudo"]');
  const nS = await page.evaluate(() => window.INTEL.pipeline.itens.filter(i => i.status === 'estudo').length);
  assert.equal(await rows.count(), nS);
  assert.equal(await page.getAttribute('#pipe-counts [data-pstatus="estudo"]', 'aria-pressed'), 'true');
  await page.click('#pipe-counts [data-pstatus="estudo"]');
  assert.equal(await rows.count(), n);
  // status ativo ausente na nova esfera: o filtro é limpo (nunca um filtro invisível com a tabela vazia)
  await page.click('#pipe-counts [data-pstatus="leilao_agendado"]');
  const nL = await page.evaluate(() => window.INTEL.pipeline.itens.filter(i => i.status === 'leilao_agendado').length);
  assert.equal(await rows.count(), nL);
  await page.selectOption('#pipe-esfera', 'estadual');
  const shownStatus = await page.$$eval('#pipe-counts [data-pstatus]', bs => bs.map(b => [b.dataset.pstatus, b.getAttribute('aria-pressed')]));
  const visiblePressed = shownStatus.filter(([, a]) => a === 'true').map(([k]) => k);
  const nRows = await rows.count();
  assert.ok(nRows > 0, 'tabela vazia');
  if (!shownStatus.some(([k]) => k === 'leilao_agendado')) {
    assert.deepEqual(visiblePressed, []);
    assert.equal(nRows, nE);
  } else assert.deepEqual(visiblePressed, ['leilao_agendado']);
  await page.selectOption('#pipe-esfera', '');
  assert.equal(await rows.count(), n);
  // linha com ent abre #ficha/<ent>
  const ent = await page.getAttribute('#pipe-table tbody tr[data-ent]', 'data-ent');
  await page.locator('#pipe-table tbody tr[data-ent]').first().click();
  await page.waitForTimeout(250);
  assert.equal(await page.evaluate(() => location.hash), '#ficha/' + ent);
  assert.equal(await page.isVisible('#ficha'), true);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  assert.equal(await page.evaluate(() => location.hash), '#projetos');
  // link de fonte não navega para a ficha
  assert.equal(await page.getAttribute('#pipe-table tbody tr a[href^="http"]', 'target'), '_blank');
  await go('#mapa');
});

test('sem window.INTEL: Projetos e ficha da v2 sem esfera, pipeline nem ANTT, sem erros', async () => {
  const errs = [], ext = [];
  const p = await openPage(errs, ext, html => html.replace('window.INTEL=', 'window.INTEL_AUSENTE='));
  await p.evaluate(() => { location.hash = '#projetos'; });
  await p.waitForTimeout(250);
  assert.equal(await p.locator('#proj-table tbody tr').count(), 54);
  assert.equal(await p.locator('#pipeline').count(), 0);
  assert.equal(await p.locator('#estudos-list li').count(), 27);
  await p.evaluate(() => { location.hash = '#ficha/nova-rota-do-oeste'; });
  await p.waitForTimeout(250);
  assert.equal(await p.isVisible('#ficha'), true);
  const titles = await p.$$eval('#ficha .fblock h3', hs => hs.map(h => h.textContent));
  assert.ok(!titles.some(h => /ANTT|Praças da concessão|Pipeline/.test(h)));
  await p.evaluate(() => { location.hash = '#ficha/sp-lt01-autoban'; });
  await p.waitForTimeout(250);
  assert.equal(await p.evaluate(() => location.hash), '#mapa');
  assert.deepEqual(errs, []);
  await p.context().close();
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

// ---------- Task 12: abas Tráfego, Cargas e Fontes ----------
const TABS7 = ['Mapa', 'Projetos', 'Tráfego', 'Cargas', 'Mercado', 'Regulatório', 'Fontes'];

test('(a) barra de abas com as 7 abas na ordem', async () => {
  await go('#mapa');
  assert.deepEqual(await page.$$eval('#tabs a', as => as.map(a => a.textContent)), TABS7);
  assert.deepEqual(await page.$$eval('#tabs a', as => as.map(a => a.getAttribute('href'))),
    ['#mapa', '#projetos', '#trafego', '#cargas', '#mercado', '#regulatorio', '#fontes']);
});

test('(b) Tráfego: ≥ 5 gráficos, "Fonte:" em cada cartão, KPIs do modelo, sem undefined/NaN', async () => {
  await go('#trafego');
  assert.equal(await page.isVisible('#page-trafego'), true);
  assert.equal(await page.isVisible('#map'), false);
  assert.ok(await page.locator('#page-trafego svg.chart').count() >= 5);
  const cards = await page.$$eval('#page-trafego .ccard', cs => cs.map(c => ({ id: c.id, src: [...c.querySelectorAll('.src')].map(p => p.textContent).join(' ') })));
  assert.ok(cards.length >= 6, cards.map(c => c.id).join());
  for (const c of cards) assert.match(c.src, /Fonte: \S/, c.id);
  for (const c of cards) assert.match(c.src, /medido|modelado/, c.id);
  const k = await page.evaluate(() => {
    const x = IntelModel.trafegoKpis(window.INTEL, window.SNV);
    return { n: IntelModel.fmtInt(x.nPracas), acid: IntelModel.fmtInt(x.acidAno), pes: IntelModel.fmtPct(x.pctPes) };
  });
  assert.equal(await page.textContent('#kpi-pracas b'), k.n);
  assert.equal(await page.textContent('#kpi-acid b'), k.acid);
  assert.equal(await page.textContent('#kpi-pes b'), k.pes);
  const t = await page.textContent('#page-trafego');
  assert.doesNotMatch(t, /undefined|NaN/);
  assert.match(t, /índice 1999 = 100, rodovias pedagiadas, não é volume/i);
  assert.match(t, /Entram só as \d+ praças/);
  assert.equal(await page.locator('#chart-t-rank .hrow[data-k]').count(), 20);
  assert.equal(await page.locator('#chart-t-taxa .hrow').count(), 15);
  assert.equal(await page.locator('#chart-t-uf-a .hrow').count(), await page.evaluate(() => IntelModel.acidentesPorUf(window.INTEL, window.SNV).length));
  // dicas da série mensal e do ABCR em mmm/aaaa
  assert.match(await page.innerHTML('#chart-t-serie'), /<title>jan\/2024 · Leves:/);
  assert.match(await page.innerHTML('#chart-t-abcr'), /<title>Leves out\/2016:/);
});

test('(b) clicar na 1ª praça do ranking abre o Mapa com a camada Praças e o cartão da praça', async () => {
  await go('#trafego');
  const top = await page.evaluate(() => IntelModel.pracasRanking(window.INTEL, 1)[0]);
  assert.equal(await page.getAttribute('#chart-t-rank .hrow[data-k]', 'data-k'), String(top.i));
  await page.click('#chart-t-rank .hrow[data-k] rect.cbar');
  await page.waitForTimeout(400);
  assert.equal(await page.evaluate(() => location.hash), '#mapa');
  assert.equal(await page.evaluate(() => Layers.isOn('pracas')), true);
  assert.equal(await page.isChecked('#layers-section input[data-layer="pracas"]'), true);
  assert.deepEqual(await page.evaluate(() => Layers.selected()), { key: 'pracas', i: top.i });
  assert.equal(await page.isVisible('#card'), true);
  assert.equal(await page.textContent('#card .card__title'), top.nome);
  assert.equal(await page.evaluate(([lat, lon]) => MapView.map.getBounds().contains([lat, lon]), [top.lat, top.lon]), true);
  await page.click('#card-close');
  await page.locator('#layers-section input[data-layer="pracas"]').uncheck();
  await page.evaluate(() => MapView.fitBrasil(false));
});

test('(b) Enter numa linha do ranking também abre a praça', async () => {
  await go('#trafego');
  const second = await page.$$eval('#chart-t-rank .hrow[data-k]', gs => gs[1].dataset.k);
  await page.focus(`#chart-t-rank .hrow[data-k="${second}"]`);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  assert.equal(await page.evaluate(() => location.hash), '#mapa');
  assert.deepEqual(await page.evaluate(() => Layers.selected()), { key: 'pracas', i: Number(second) });
  await page.click('#card-close');
  await page.locator('#layers-section input[data-layer="pracas"]').uncheck();
});

test('(c) Cargas: KPI de soja = fmtT(soma), "Fonte:" em cada cartão, sem undefined/NaN', async () => {
  await go('#cargas');
  assert.equal(await page.isVisible('#page-cargas'), true);
  const soja = await page.evaluate(() => IntelModel.fmtT(window.INTEL.agro.produtos.soja.reduce((a, v) => a + (v || 0), 0)));
  assert.equal(await page.textContent('#kpi-soja b'), soja);
  const cards = await page.$$eval('#page-cargas .ccard', cs => cs.map(c => ({ id: c.id, src: [...c.querySelectorAll('.src')].map(p => p.textContent).join(' ') })));
  assert.equal(cards.length, 7, cards.map(c => c.id).join());
  for (const c of cards) assert.match(c.src, /Fonte: \S.*(medido|modelado)/, c.id);
  assert.match(cards.find(c => c.id === 'card-c-pnl').src, /modelado/);
  assert.doesNotMatch(await page.textContent('#page-cargas'), /undefined|NaN/);
  assert.equal(await page.locator('#chart-c-mun .hrow[data-k]').count(), 20);
  assert.equal(await page.locator('#chart-c-siade .hrow').count(), 15);
  assert.equal(await page.locator('#pnl-table tbody tr').count(), 15);
  assert.equal(await page.locator('#chart-c-exp-mat tbody tr').count(), 10);
  assert.equal(await page.locator('#chart-c-exp-mat thead th').count(), 9);
});

test('(c) trocar o produto da exportação muda o gráfico e a matriz', async () => {
  await go('#cargas');
  const before = await page.innerHTML('#chart-c-exp-bars');
  assert.equal(await page.inputValue('#exp-sh4'), '1201');
  assert.ok((await page.locator('#exp-sh4 option').count()) >= 10);
  await page.selectOption('#exp-sh4', '1005');
  const after = await page.innerHTML('#chart-c-exp-bars');
  assert.notEqual(after, before);
  assert.match(after, /Milho/);
  const top = await page.evaluate(() => IntelModel.exportPorUrf(window.INTEL, '1005', 1)[0].urf);
  assert.equal(await page.textContent('#chart-c-exp-bars .hrow text'), top);
  await page.selectOption('#exp-sh4', '1201');
});

test('(c) fretes: ordena por R$/t, filtra UF de origem e marca origem aproximada', async () => {
  await go('#cargas');
  const vals = () => page.$$eval('#frete-table tbody tr', trs => trs.map(t => t.dataset.rst).filter(Boolean).map(Number));
  const isSorted = (v, dir) => v.every((x, i) => i === 0 || (dir === 'desc' ? x <= v[i - 1] : x >= v[i - 1]));
  // padrão: R$/t decrescente; clique no cabeçalho inverte
  assert.ok(isSorted(await vals(), 'desc'));
  await page.click('#frete-table [data-fsort="rs_t"]');
  assert.ok(isSorted(await vals(), 'asc'));
  assert.equal(await page.getAttribute('#frete-table th[aria-sort]', 'aria-sort'), 'ascending');
  await page.click('#frete-table [data-fsort="km"]');
  await page.click('#frete-table [data-fsort="rs_t"]');
  assert.ok(isSorted(await vals(), 'desc'));
  const n = await page.evaluate(() => window.INTEL.multimodal.fretes.linhas.length);
  assert.equal(await page.locator('#frete-table tbody tr').count(), n);
  const nAprox = await page.evaluate(() => window.INTEL.multimodal.fretes.linhas.filter(l => l[6] === 'aprox').length);
  assert.equal(await page.locator('#frete-table .tag-nv', { hasText: 'origem aproximada' }).count(), nAprox);
  await page.selectOption('#frete-uf', 'MT');
  const ufs = await page.$$eval('#frete-table tbody tr td:nth-child(2)', tds => [...new Set(tds.map(t => t.textContent))]);
  assert.deepEqual(ufs, ['MT']);
  await page.selectOption('#frete-uf', '');
});

test('(c) município de soja abre no mapa com o fundo Soja; trecho de carga abre o cartão do trecho', async () => {
  await go('#cargas');
  const m = await page.evaluate(() => IntelModel.topMunicipios(window.INTEL, 'soja', 1)[0]);
  await page.click('#chart-c-mun .hrow[data-k] rect.cbar');
  await page.waitForTimeout(600);
  assert.equal(await page.evaluate(() => location.hash), '#mapa');
  assert.equal(await page.evaluate(() => Layers.fundo()), 'soja');
  assert.equal(await page.isChecked('#layers-section input[name="fundo"][value="soja"]'), true);
  assert.equal(await page.isVisible('#fundo-legend'), true);
  assert.deepEqual(await page.evaluate(() => Layers.selected()), { key: 'mun', i: m.id });
  assert.match(await page.textContent('#card .card__title'), new RegExp(`^${m.nome} / ${m.uf}$`));
  await page.click('#card-close');
  await page.check('#layers-section input[name="fundo"][value=""]');
  assert.equal(await page.evaluate(() => Layers.fundo()), null);

  await go('#cargas');
  const j = await page.evaluate(() => IntelModel.cargaTop(window.INTEL, window.SNV, 1)[0].j);
  await page.click('#pnl-table tbody tr');
  await page.waitForTimeout(400);
  assert.equal(await page.evaluate(() => location.hash), '#mapa');
  assert.equal(await page.isVisible('#card'), true);
  assert.deepEqual(await page.evaluate(() => MapView.highlighted()), [j]);
  assert.match(await page.textContent('#card'), /Carga agrícola/);
  await page.click('#card-close');
  await page.evaluate(() => MapView.fitBrasil(false));
});

test('(d) Fontes: ≥ 30 fontes, ≥ 9 indisponíveis com motivo, bases v1/v2 e explicação medido × modelado', async () => {
  await go('#fontes');
  assert.ok(await page.locator('#fontes-table tbody tr').count() >= 30);
  assert.ok(await page.locator('#fontes-indisp-table tbody tr').count() >= 9);
  assert.equal(await page.locator('#fontes-base-table tbody tr').count(), await page.evaluate(() => window.INTEL.fontes.base.length));
  const t = await page.textContent('#page-fontes');
  assert.match(t, /Medido × modelado/);
  assert.match(t, /Não disponíveis neste ambiente/);
  assert.match(t, /Bases da v1\/v2/);
  assert.match(t, /20\/10\/2026/);
  assert.doesNotMatch(t, /undefined|NaN|2026-10-20/);
  const motivos = await page.$$eval('#fontes-indisp-table tbody tr td:nth-child(2)', tds => tds.map(t => t.textContent));
  assert.ok(motivos.every(m => m.length > 5));
  assert.equal(await page.getAttribute('#fontes-table tbody tr a', 'target'), '_blank');
  const tipos = await page.$$eval('#fontes-table tbody tr td:nth-child(6)', tds => [...new Set(tds.map(t => t.textContent))].sort());
  assert.ok(tipos.includes('Medido') && tipos.includes('Modelado'), tipos.join());
});

test('(e) hashes inválidos continuam caindo no Mapa', async () => {
  for (const h of ['#xyz', '#trafego/x%zz', '#Fontes']) {
    await go(h);
    assert.equal(await page.evaluate(() => location.hash), '#mapa', h);
    assert.equal(await page.isVisible('#map'), true);
  }
  await go('#cargas');
  assert.equal(await page.isVisible('#page-cargas'), true);
  await go('#mapa');
});

test('sem window.INTEL as abas Tráfego, Cargas e Fontes degradam sem erros', async () => {
  const errs = [], ext = [];
  const p = await openPage(errs, ext, html => html.replace('window.INTEL=', 'window.INTEL_AUSENTE='));
  assert.deepEqual(await p.$$eval('#tabs a', as => as.map(a => a.textContent)), TABS7);
  for (const [h, re] of [['#trafego', /não estão neste arquivo/], ['#cargas', /não estão neste arquivo/], ['#fontes', /não está neste arquivo/]]) {
    await p.evaluate(x => { location.hash = x; }, h);
    await p.waitForTimeout(250);
    const t = await p.textContent('#page-' + h.slice(1));
    assert.match(t, re, h);
    assert.doesNotMatch(t, /undefined|NaN/);
  }
  assert.deepEqual(errs, []);
  await p.context().close();
});

test('com só parte dos blocos cada aba mostra só os cartões que têm dado', async () => {
  const errs = [], ext = [];
  const p = await openPage(errs, ext, html => html.replace('window.INTEL=', 'window.INTEL_FULL=').replace('</script>',
    '</script><script>window.INTEL={trafego:window.INTEL_FULL.trafego,agro:window.INTEL_FULL.agro,municipios:window.INTEL_FULL.municipios};</script>'));
  await p.evaluate(() => { location.hash = '#trafego'; });
  await p.waitForTimeout(250);
  const tr = await p.$$eval('#page-trafego .ccard', cs => cs.map(c => c.id));
  assert.ok(!tr.includes('card-t-rank') && !tr.includes('card-t-serie') && tr.includes('card-t-abcr') && tr.includes('card-t-taxa'), tr.join());
  assert.equal(await p.locator('#kpi-pracas').count(), 0);
  await p.evaluate(() => { location.hash = '#cargas'; });
  await p.waitForTimeout(250);
  const ca = await p.$$eval('#page-cargas .ccard', cs => cs.map(c => c.id));
  assert.deepEqual(ca, ['card-c-kpis', 'card-c-uf', 'card-c-mun']);
  assert.doesNotMatch(await p.textContent('#page-cargas') + await p.textContent('#page-trafego'), /undefined|NaN/);
  assert.deepEqual(errs, []);
  await p.context().close();
});

test('nenhuma requisição externa', () => assert.deepEqual(external, []));

test('(h) sem erros no console', () => assert.deepEqual(errors, []));
