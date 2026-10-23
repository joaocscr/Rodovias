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

async function openPage(errs, ext, transform, viewport = { width: 1440, height: 900 }) {
  const context = await browser.newContext({ viewport });
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
  await p.goto('file://' + HTML + '#mapa');  // a página inicial é o Resumo; estes testes partem do mapa
  await p.waitForSelector('#kpi-km');
  return p;
}

// Anos e períodos dos blocos, lidos do INTEL da página: os rótulos da tela seguem o dado, e o teste também (os valores
// conferidos estão em tests/test_dados_conferidos.py). v25: VMDa do DNIT (bloco vmda2025); v23: VMDa da Infra S.A.
// (trafego); pnl: ano-base do PNL; pracas: ano do VMD das praças da ANTT; pam/arm: IBGE PAM e Estoques.
let A;
const anosDe = p => p.evaluate(() => {
  const I = window.INTEL, IM = IntelModel;
  return { v25: I.vmda2025 && I.vmda2025.ano, v23: I.trafego.vmda.ano, pnl: I.carga.ano_base, pracas: I.antt.pracas.ano, pam: I.agro.ano,
    arm: I.agro.armazenagem.periodo, perPracas: I.antt.fonte.find(f => /Praças de pedágio/.test(f.nome)).periodo,
    mes0: IM.monthLabel(I.antt.pracas.serie_meses[0]), abcr0: IM.monthLabel(I.trafego.abcr.meses[0]),
    agendado: window.CONC.estados.find(x => x.key === 'agendado2026').label,
    notaRotas: IM.rotasNota(I.rotas), apresentacao: IM.rotasDocs(I.rotas).apresentacao };
});

before(async () => {
  browser = await chromium.launch();
  page = await openPage(errors, external);
  A = await anosDe(page);
});
after(async () => { await browser?.close(); });

const legend = () => page.textContent('#legend');
// Antes de medir tempo: espera a página ficar ociosa (sem tarefa pendente da carga ou do teste anterior) e dois quadros.
const settle = p => p.evaluate(() => new Promise(res =>
  requestIdleCallback(() => requestAnimationFrame(() => requestAnimationFrame(res)), { timeout: 3000 })));
async function mode(m) {
  await page.click(`#legend [data-mode="${m}"]`);
  await page.waitForTimeout(50);
}

test('título da página e do topo', async () => {
  assert.equal(await page.title(), 'Rodovias do Brasil · Centro de Inteligência');
  assert.equal((await page.textContent('.topbar__title')).trim(), 'Rodovias do Brasil · Centro de Inteligência');
  assert.match(await page.textContent('.topbar__sub'), /SNV .*RoadShow/);
});

// Título e linha de origem (malha e concessões) legíveis sem passar o mouse: nada cortado, em telas largas e no celular,
// com as 10 abas (a barra de abas rola dentro do topo).
test('topo: título e linha de origem sem corte em 1440, 1280, 1024 e 390 px, com 10 abas', async () => {
  for (const width of [1440, 1280, 1024, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 800 } });
    await context.route('**/*', r => (/^(file|data):/.test(r.request().url()) ? r.continue() : r.abort()));
    const p = await context.newPage();
    await p.goto('file://' + HTML + '#mapa');
    await p.waitForSelector('#kpi-km');
    for (const abas of [10]) {
      const r = await p.evaluate(abas => {
        const nav = document.getElementById('tabs');
        if (nav.children.length !== abas) throw new Error(`esperava ${abas} abas, há ${nav.children.length}`);
        const m = el => ({ sw: el.scrollWidth, cw: el.clientWidth, sh: el.scrollHeight, ch: el.clientHeight, vis: el.offsetParent !== null });
        const sub = document.getElementById('topbar-sub'), map = document.getElementById('map').getBoundingClientRect();
        return { titulo: m(document.querySelector('.topbar__titles')), sub: m(sub), txt: sub.innerText, doc: document.documentElement.scrollWidth,
          vw: innerWidth, mapTop: map.top, subBottom: sub.getBoundingClientRect().bottom };
      }, abas);
      const tag = `${width} px, ${abas} abas`;
      for (const k of ['titulo', 'sub']) {
        assert.ok(r[k].vis, `${tag}: ${k} visível`);
        assert.ok(r[k].sw <= r[k].cw, `${tag}: ${k} cortado na largura ${JSON.stringify(r[k])}`);
      }
      assert.ok(r.sub.sh <= r.sub.ch, `${tag}: linha de origem cortada na altura ${JSON.stringify(r.sub)}`);
      assert.match(r.txt, /Malha rodoviária federal: SNV \S+ \(DNIT\) · Concessões: RoadShow/, tag);
      assert.ok(r.doc <= r.vw, `${tag}: página alargou`);
      assert.ok(Math.abs(r.mapTop - r.subBottom) < 1, `${tag}: o mapa começa logo abaixo da linha de origem`);
    }
    await context.close();
  }
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
    await settle(page);
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
  // v3.1: Tráfego colorido pelo VMDa 2025 (DNIT, modelado), com o ano visível no título e na fonte
  assert.ok((await page.textContent('#legend .legend__title')).includes(`VMDa ${A.v25}, modelado`));
  assert.ok((await page.textContent('#legend .legend__src')).includes(`DNIT, VMDa ${A.v25} (modelado)`));
  assert.ok(!t.includes(`VMDa ${A.v23}`));
  // camada de estaduais desligada: a legenda não fala delas
  assert.doesNotMatch(t, /estaduais/i);
  // faixas "a – b" formatadas, contíguas
  const rows = await page.$$eval('#legend .legend__row[data-class] .legend__range', es => es.map(e => e.textContent));
  for (const r of rows) assert.match(r, /^[\d.,]+ – [\d.,]+$/, r);
  for (let i = 1; i < rows.length; i++) assert.equal(rows[i].split(' – ')[0], rows[i - 1].split(' – ')[1]);
  assert.ok(!/NaN|undefined|null/.test(t));
  // v3.1: amostras da legenda na rampa azul do Tráfego, claro → escuro, cor sólida; "Sem dado" em cinza tracejado
  const sw = await page.$$eval('#legend .legend__row[data-class] svg line', ls => ls.map(l => [l.getAttribute('stroke'), l.getAttribute('stroke-opacity')]));
  assert.deepEqual(sw, (await page.evaluate(() => RAMPS.trafego)).map(c => [c, '1']));
  assert.equal(await page.getAttribute('#legend .legend__row:not([data-class]) svg line', 'stroke'), '#525254');
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
  // v3.1: cor sólida por classe, da rampa do modo (claro → escuro), espessura crescente
  const st = await page.evaluate(() => ({ q: QUANT_MODES.map(m => [0, 1, 2, 3, 4].map(c => quantStyle(c, m))), ramps: RAMPS, none: QUANT_NONE }));
  assert.deepEqual(st.ramps.trafego, ['#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b']);
  assert.deepEqual(st.ramps.pesados, ['#9895ff', '#7c6ef7', '#6250d6', '#4a30b6', '#360396']);
  assert.deepEqual(st.ramps.carga, ['#fb7744', '#da5821', '#b43f00', '#8a2e00', '#621e00']);
  assert.deepEqual(st.ramps.acidentes, ['#ff6f69', '#e34948', '#c1252c', '#9a0016', '#6e000c']);
  for (const [k, q] of ['trafego', 'pesados', 'carga', 'acidentes'].map((m, k) => [m, st.q[k]])) {
    assert.deepEqual(q.map(x => [x.color, x.opacity]), st.ramps[k].map(c => [c, 1]), k);
    assert.equal(q[0].weight, 1.5);
    assert.equal(q[4].weight, 6);
    assert.ok(q.every((x, i) => i === 0 || (x.weight > q[i - 1].weight && x.z > q[i - 1].z)));
  }
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
    // v3.1: veíc·km = Σ VMDa 2025 × extensão; pesados = 2025 × participação de pesados 2023 (estimativa)
    let vkm25 = 0;
    const t = window.INTEL.vmda2025.fis.t;
    for (let j = 0; j < mask.length; j++) if (mask[j] && t[j] != null) vkm25 += t[j] * window.SNV.fis[j].ext;
    return { vkm: IntelModel.fmtVkm(a.vkm), acid: a.acidAno, tkm: a.tkm, ano: a.anoVmda, ok25: Math.abs(vkm25 - a.vkm) < 1e-6 * a.vkm,
      pct: IntelModel.fmtPct(a.vkmPes / a.vkmBasePes) };
  });
  assert.equal((await page.textContent('#kpi-vkm')).trim(), expected.vkm);
  assert.notEqual(expected.vkm, '—');
  assert.equal(expected.ano, A.v25);
  assert.ok(expected.ok25);
  const sub = await page.locator('#kpi-vkm').evaluate(e => e.nextElementSibling.textContent);
  assert.ok(sub.startsWith(`${expected.pct} pesados (estimativa: % de ${A.v23}) · Tráfego VMDa ${A.v25}, modelado`), sub);
  assert.match(await page.textContent('#kpi-acid'), /\d/);
  assert.match(await page.textContent('#kpi-tkm'), /t·km\/ano/);
  // cobertura sobre os km pavimentados da seleção
  const cov = await page.evaluate(() => {
    const f = Model.emptyFilters();
    f.uf.add(window.SNV.dict.uf.indexOf('MT'));
    const a = IntelModel.aggregateIntel(window.INTEL, window.SNV, Model.visibleFis(window.SNV, f));
    const n = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    return { vm: `${n.format(a.kmVmda)} km com dado de ${n.format(a.kmPav)} km pavimentados`, ok: a.kmVmda <= a.kmPav && a.kmCarga <= a.kmPav };
  });
  assert.ok(cov.ok);
  assert.ok((await page.textContent('#stats-section .ikpis')).includes(cov.vm), cov.vm);
  for (const id of ['#kpi-vkm', '#kpi-acid', '#kpi-tkm']) {
    assert.ok((await page.locator(id).evaluate(e => e.closest('[title]').title)).length > 20, id);
  }
  assert.ok(!/NaN|undefined/.test(await page.textContent('#stats-section')));
  await page.click('#clear-filters');
  await page.waitForTimeout(100);
});

test('(e) cartão de físico com VMDa mostra o bloco "Tráfego e segurança"', async () => {
  const j = await page.evaluate(() => {
    const v = window.INTEL.trafego.vmda, c = window.INTEL.carga, f = window.INTEL.vmda2025.fis;
    return window.SNV.fis.findIndex((_, j) => v.l[j] != null && v.p[j] != null && v.p[j] > 0 && c.gsa[j] > 0
      && f.t[j] != null && f.c[j] != null && f.d[j] != null && !f.ns[j] && IntelModel.fisSup(window.SNV, j) === 'PAV');
  });
  assert.ok(j >= 0);
  await page.evaluate(j => MapView.pick(j), j);
  await page.waitForSelector('#card:not([hidden])');
  const t = await page.textContent('#card');
  assert.match(t, /Tráfego e segurança/);
  assert.match(t, /veíc\.\/dia/);
  assert.ok(t.includes(`VMDa ${A.v23} · modelado · leves e pesados`));
  // v3.1: VMDa 2025 total e por sentido; pesados 2025 rotulados "estimativa"; bloco 2023 leves/pesados mantido
  const subs = await page.$$eval('#card .card__intel dt.card__sub', ds => ds.map(d => d.textContent));
  // grupos paralelos: "VMDa <ano> · modelado · <o que traz>"
  const G25 = `VMDa ${A.v25} · modelado · total e por sentido`, G23 = `VMDa ${A.v23} · modelado · leves e pesados`;
  assert.ok(subs.some(s => s === G25), subs.join(' | '));
  assert.ok(subs.some(s => s === G23), subs.join(' | '));
  const k25 = await page.evaluate(j => {
    const f = window.INTEL.vmda2025.fis, x = IntelModel.fisIntel(window.INTEL, window.SNV, j);
    return { t: IntelModel.fmtVmd(f.t[j]), c: IntelModel.fmtVmd(f.c[j]), d: IntelModel.fmtVmd(f.d[j]), pes: IntelModel.fmtVmd(x.pes25),
      l: IntelModel.fmtVmd(window.INTEL.trafego.vmda.l[j]), p: IntelModel.fmtVmd(window.INTEL.trafego.vmda.p[j]) };
  }, j);
  const rows25 = await page.$$eval('#card .card__intel dt.card__sub', ds => {
    const out = {};
    let g = null;
    for (const el of ds[0].parentElement.children) {
      if (el.matches('dt.card__sub')) g = el.textContent;
      else if (el.matches('dt')) out[`${g}|${el.textContent}`] = el.nextElementSibling.textContent;
    }
    return out;
  });
  assert.equal(rows25[`${G25}|Total`], k25.t);
  assert.equal(rows25[`${G25}|Sentido crescente (SNV)`], k25.c);
  assert.equal(rows25[`${G25}|Sentido decrescente (SNV)`], k25.d);
  assert.equal(rows25[`${G25}|Pesados (estimativa)`], k25.pes);
  assert.equal(rows25[`${G23}|Leves`], k25.l);
  assert.equal(rows25[`${G23}|Pesados`], k25.p);
  assert.match(t, new RegExp(`Pesados \\(estimativa\\) = total ${A.v25} × [\\d,]+% de pesados no VMDa ${A.v23} do trecho`));
  assert.equal(await page.locator('#card .card__flag[data-ns]').count(), 0);
  assert.ok(t.includes(`modelo PNL, ${A.pnl}`));
  assert.match(t, /10⁶ veíc·km/);
  // veíc·km/dia do trecho, acidentes por km por ano e carga total do PNL
  const f = await page.evaluate(j => {
    const x = IntelModel.fisIntel(window.INTEL, window.SNV, j);
    return { vkm: IntelModel.fmtVkm(x.vkm), akm: x.acidKmAno == null ? null : IntelModel.fmtDec(x.acidKmAno, 2), tot: x.cargaTotal == null ? null : `${IntelModel.fmtT(x.cargaTotal)}/ano` };
  }, j);
  const kv = await page.$$eval('#card .card__intel dt:not(.card__sub)', dts => Object.fromEntries(dts.map(d => [d.textContent, d.nextElementSibling.textContent])));
  assert.equal(kv['Veículos × extensão'], f.vkm);
  assert.match(f.vkm, /veíc·km\/dia/);
  if (f.akm) assert.equal(kv['Acidentes por km por ano'], f.akm);
  if (f.tot) assert.equal(kv['Carga total (todas as mercadorias)'], f.tot);
  assert.doesNotMatch(t, /trecho planejado no SNV/);
  assert.ok(!/NaN|undefined|null/.test(t));
  await page.click('#card-close');
});

test('cartão de trecho planejado (PLA) marca tráfego e acidentes como "trecho planejado no SNV"', async () => {
  const j = await page.evaluate(() => {
    const v = window.INTEL.trafego.vmda;
    return window.SNV.fis.findIndex((_, j) => IntelModel.fisSup(window.SNV, j) === 'PLA' && v.l[j] != null);
  });
  assert.ok(j >= 0);
  await page.evaluate(j => MapView.pick(j), j);
  await page.waitForSelector('#card:not([hidden])');
  const tags = await page.$$eval('#card .card__intel .card__sub .tag-nv', ts => ts.map(t => t.textContent));
  assert.ok(tags.length >= 1 && tags.every(t => t === 'trecho planejado no SNV'), tags.join());
  // trecho planejado com valores: uma nota explica de onde vêm os números (estrada existente no traçado)
  const nota = await page.$$eval('#card .card__intel [data-pla]', ns => ns.map(n => n.textContent));
  assert.equal(nota.length, 1);
  assert.match(nota[0], /ainda não foi implantada/);
  assert.match(nota[0], /estrada que já existe nesse traçado/);
  await page.click('#card-close');
  // trecho pavimentado: sem a nota
  const k = await page.evaluate(() => window.SNV.fis.findIndex((_, j) => IntelModel.fisSup(window.SNV, j) === 'PAV' && window.INTEL.trafego.vmda.l[j] != null));
  await page.evaluate(k => MapView.pick(k), k);
  await page.waitForSelector('#card:not([hidden])');
  assert.equal(await page.locator('#card [data-pla]').count(), 0);
  await page.click('#card-close');
});

test('trecho "não simulável" no VMDa 2025 mostra "uso restrito (área urbana)" no cartão', async () => {
  const j = await page.evaluate(() => {
    const f = window.INTEL.vmda2025.fis;
    return window.SNV.fis.findIndex((_, j) => f.ns[j] === 1 && f.t[j] != null);
  });
  assert.ok(j >= 0);
  await page.evaluate(j => MapView.pick(j), j);
  await page.waitForSelector('#card:not([hidden])');
  assert.equal(await page.locator('#card .card__flag[data-ns]').count(), 1);
  assert.match(await page.textContent('#card .card__flag[data-ns]'), /^uso restrito \(área urbana\) trecho não simulável no modelo$/);
  // o valor é mantido
  assert.match(await page.textContent('#card .card__intel'), new RegExp(
    (await page.evaluate(j => IntelModel.fmtVmd(window.INTEL.vmda2025.fis.t[j]), j)).replace(/\./g, '\\.')));
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
  // Pesados segue o VMDa da Infra S.A. (leves/pesados), rotulado com o ano dele
  assert.ok((await page.textContent('#legend .legend__title')).includes(`VMDa ${A.v23}, modelado`));
  assert.ok((await page.textContent('#legend .legend__src')).includes(`VMDa ${A.v23}`));
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
    await settle(page);
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

test('(i) volta ao modo Concessões com legenda e halo', async () => {
  await mode('concessoes');
  assert.equal(await page.evaluate(() => MapView.colorMode()), 'concessoes');
  assert.ok((await legend()).includes(A.agendado));
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
const LAYER_LABELS = ['Praças de pedágio', 'Contadores de tráfego (SAT)', 'Obras nas concessões federais', 'Ferrovias em operação', 'Portos e terminais', 'Fluxos ferroviários de grãos'];
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
  assert.match(t, /Medido: praças e contadores de tráfego \(SAT\) da ANTT, PAM, Estoques\. Modelado: VMDa, carga PNL\./);
  // todas desligadas por padrão; fundo = Nenhum
  assert.equal(await page.locator('#layers-section input[data-layer]:checked').count(), 0);
  assert.equal(await page.locator('#layers-section input[name="fundo"]:checked').getAttribute('value'), '');
  // cada camada com title de fonte e período
  for (const title of await page.$$eval('#layers-section label:has(input[data-layer])', ls => ls.map(l => l.title))) {
    assert.ok(title.length > 15 && !/undefined|null/.test(title) && !title.startsWith('—'), title);
  }
  // acessibilidade: sem título dentro do <summary>; fonte de cada camada e de cada fundo ligada ao controle (aria-describedby)
  assert.equal(await page.locator('#layers-section summary :is(h1, h2, h3, h4)').count(), 0);
  assert.equal((await page.textContent('#layers-section summary')).trim(), 'Camadas');
  const desc = await page.$$eval('#layers-section input[data-layer], #layers-section input[name="fundo"][value]:not([value=""])', is => is.map(i => {
    const d = document.getElementById(i.getAttribute('aria-describedby') || '');
    return [i.dataset.layer || i.value, d ? d.textContent : null, i.closest('label').title];
  }));
  assert.ok(desc.length >= 13);
  for (const [k, d, title] of desc) assert.ok(d && d === `Fonte: ${title}`, `${k}: ${d}`);
});

test('(f) Rodovias estaduais só aparece com INTEL.estaduais; concessões estaduais distintas das federais', async () => {
  const has = await page.evaluate(() => !!(window.INTEL.estaduais && window.INTEL.estaduais.malha));
  assert.equal(await layerBox('estaduais').count(), has ? 1 : 0);
  if (!has) assert.doesNotMatch(await page.textContent('#layers-section'), /Rodovias estaduais/);
  const st = await page.evaluate(() => LAYER_STYLES.estConc);
  assert.deepEqual([st.color, st.weight, st.halo, st.haloOpacity, st.haloExtra], ['#e87ba4', 3, '#231F20', 0.35, 3]);
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
  const timeClick = async sel => { await settle(page); return page.evaluate(sel => new Promise(resolve => {
    const t0 = performance.now();
    document.querySelector(sel).click();
    requestAnimationFrame(() => requestAnimationFrame(() => resolve(performance.now() - t0)));
  }), sel); };
  const keys = ['pracas', 'sats', 'obras', 'ferrovias', 'portos', 'siade'];
  if (await layerBox('estaduais').count()) keys.push('estaduais');
  if (await layerBox('rotas').count()) keys.push('rotas');
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
  assert.ok(t.includes(`VMD ${A.pracas}`));
  assert.match(t, /% pesados/);
  assert.match(t, /Eixos médios do comercial/);
  assert.ok(t.includes(`Receita ${A.pracas}`));
  assert.match(t, /Contagem medida · ANTT/);
  assert.ok(t.includes(A.perPracas), A.perPracas);
  assert.ok(await page.locator('#card svg.chart path.line').count() >= 2);
  assert.match(await page.locator('#card svg.chart title').first().textContent(), /^Leves [a-z]{3}\/\d{4}: /);
  assert.equal(await page.locator('#card a[href^="#ficha/"]').count(), top.ficha ? 1 : 0);
  assert.ok(!/NaN|undefined|null/.test(t));
  assert.deepEqual(await page.evaluate(() => Layers.selected()), { key: 'pracas', i: top.i });
  await page.click('#card-close');
  assert.equal(await page.evaluate(() => Layers.selected()), null);
});

test('gráfico da praça cuja série não começa em janeiro: eixo e dicas em mmm/aaaa, nunca ano decimal', async () => {
  const i = await page.evaluate(() => {
    const p = window.INTEL.antt.pracas;
    return p.serie_l.findIndex((s, i) => { const k = s.findIndex(v => v != null), k2 = p.serie_p[i].findIndex(v => v != null);
      const first = Math.min(...[k, k2].filter(x => x >= 0)); return first > 0 && !p.serie_meses[first].endsWith('-01'); });
  });
  assert.ok(i >= 0);
  await page.evaluate(i => Layers.open('pracas', i), i);
  await page.waitForSelector('#card:not([hidden]) svg.chart');
  const ticks = await page.$$eval('#card svg.chart > text', ts => ts.map(t => t.textContent).filter(x => !/^[\d.]+$/.test(x)));
  assert.ok(ticks.length >= 2, ticks.join());
  for (const x of ticks) assert.match(x, /^[a-z]{3}\/\d{4}$/, x);
  const svg = await page.innerHTML('#card .card__svg');
  assert.doesNotMatch(svg, /\d{4}\.\d/);
  assert.match(svg, /<title>(Leves|Pesados) [a-z]{3}\/\d{4}: /);
  await page.click('#card-close');
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

test('Contadores de tráfego (SAT) e obras: cartões com período, % pesados e previsto × executado', async () => {
  await setLayer(page, 'sats', true);
  await setLayer(page, 'obras', true);
  assert.ok(await page.evaluate(() => Layers.count('sats')) >= 400);
  assert.ok(await page.evaluate(() => Layers.count('obras')) >= 900);
  const sat = await page.evaluate(() => {
    const rows = Layers.rowsOf('sats'), i = rows.findIndex(r => r.periodo && r.periodo.includes('/'));
    return { i, per: rows[i].periodo.split('/').map(IntelModel.monthLabel).join(' a ') };
  });
  await page.evaluate(i => Layers.open('sats', i), sat.i);
  let t = await page.textContent('#card');
  assert.match(t, /% pesados/); assert.match(t, /% motos/); assert.match(t, /Período/);
  assert.ok(t.includes(sat.per), sat.per);
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
  // rótulos em português do dicionário (IntelModel.PORTO_TIPOS), nunca a grafia crua da ANTAQ
  const dic = await page.evaluate(() => IntelModel.PORTO_TIPOS);
  assert.deepEqual(r.tipos, Object.values(dic).sort());
  assert.deepEqual(r.raw, Object.keys(dic).sort());
  const i = await page.evaluate(() => Layers.items('portos')[0]);
  await page.evaluate(i => Layers.open('portos', i), i);
  assert.match(await page.textContent('#card'), /UF/);
  // cada tipo: o cartão mostra só o rótulo em português (uma linha "Tipo", sem a grafia da ANTAQ)
  for (const [raw, label] of Object.entries(dic)) {
    const k = await page.evaluate(raw => { const rows = Layers.rowsOf('portos'); return Layers.items('portos').find(i => rows[i].tipo === raw); }, raw);
    await page.evaluate(k => Layers.open('portos', k), k);
    const g = await page.$$eval('#card .card__grid dt', ds => ds.map(d => [d.textContent, d.nextElementSibling.textContent]));
    assert.deepEqual(g.filter(([dt]) => /Tipo/.test(dt)), [['Tipo', label]], raw);
    const t = await page.textContent('#card');
    assert.doesNotMatch(t, /Tipo ANTAQ/);
    if (!label.includes(raw)) assert.ok(!t.includes(raw), raw);
  }
  // ponto corrigido no script (fora da UF na fonte): o cartão diz que a localização é aproximada; os demais não
  const ap = await page.evaluate(() => { const rows = Layers.rowsOf('portos'); return Layers.items('portos').filter(i => rows[i].aprox); });
  const nAprox = await page.evaluate(() => window.INTEL.multimodal.portos.filter(p => p.aprox && IntelModel.portoTipo(p.tipo)).length);
  assert.ok(nAprox > 0, 'nenhum porto com localização aproximada no modelo');
  assert.equal(ap.length, nAprox);
  for (const k of ap) {
    await page.evaluate(k => Layers.open('portos', k), k);
    assert.match(await page.textContent('#card .card__grid'), /Localização\s*aproximada/);
  }
  await page.evaluate(i => Layers.open('portos', i), i);
  assert.doesNotMatch(await page.textContent('#card .card__grid'), /aproximada/);
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
  assert.ok(lt.includes(`IBGE PAM ${A.pam}`));
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
  const soja = await page.evaluate(() => IntelModel.fmtInt(window.INTEL.agro.produtos.soja[window.INTEL.municipios.ids.indexOf('5107925')]));
  assert.ok(t.includes(`${soja} t`), soja);
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
  await settle(page);
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
  assert.ok(at.includes(`IBGE Estoques ${A.arm}`));
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
  await settle(page);
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
// Navega e espera o roteador terminar (condição real, não um tempo fixo): ficha aberta com o título da entidade,
// ou a aba exibida com a ficha fechada.
function routed(p, hash) {
  return p.waitForFunction(h => {
    if (location.hash !== h) return false;
    if (h.startsWith('#ficha/')) {
      const id = decodeURIComponent(h.slice(7));
      const e = window.CONC.entidades.find(x => x.id === id) || ((window.INTEL && window.INTEL.estaduais && window.INTEL.estaduais.entidades) || []).find(x => x.id === id);
      const t = document.getElementById('ficha-title');
      return Ficha.isOpen() && !!e && !!t && t.textContent === e.nome;
    }
    return !Ficha.isOpen() && Tabs.current().active === h.slice(1);
  }, hash);
}
async function go(hash, p = page) {
  await p.evaluate(h => { location.hash = h; }, hash);
  await routed(p, hash);
}
// Esc fecha a ficha e o roteador volta para a aba anterior.
async function escFicha(p = page) {
  await p.keyboard.press('Escape');
  await p.waitForFunction(() => !Ficha.isOpen() && !location.hash.startsWith('#ficha/') && Tabs.current().active === location.hash.slice(1));
}
const fichaText = () => page.textContent('#ficha');
const blockTitles = () => page.$$eval('#ficha .fblock h3', hs => hs.map(h => h.textContent));

test('(a) ficha Nova Rota do Oeste: ANTT, controladora, gráfico de receita e praças por VMD', async () => {
  await go('#mapa'); await go('#ficha/nova-rota-do-oeste');
  const t = await fichaText();
  assert.match(t, /ANTT/);
  assert.match(t, /MTPAR/);
  for (const re of [/Controladora/, /Trecho/, /Extensão/]) assert.match(t, re);
  const capa = await page.evaluate(() => {
    const c = window.INTEL.antt.capas['nova-rota-do-oeste'];
    return { prazo: c.prazo, s: [Model.fmtKm(c.extensao_km), ConcModel.fmtData(c.assinatura), c.edital, ConcModel.fmtData(c.cobranca), c.database] };
  });
  for (const x of capa.s) assert.ok(t.includes(x), x);
  // prazo é o vigente (com prorrogações), em caixa baixa
  const kv = await page.$$eval('#ficha .fblock', bs => {
    const b = bs.find(x => x.querySelector('h3').textContent === 'Cadastro na ANTT');
    return Object.fromEntries([...b.querySelectorAll('dt')].map(dt => [dt.textContent, dt.nextElementSibling.textContent]));
  });
  assert.equal(kv['Prazo atual (com prorrogações)'], capa.prazo.toLowerCase());
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
  assert.ok(t.includes(`Contagem medida · ANTT ${A.pracas}`));
  // série mensal leves × pesados das praças da concessão (mesma regra da aba Tráfego, filtrada pela concessão)
  const s = await page.evaluate(() => IntelModel.pracasSerie(window.INTEL, p => p.ent === 'nova-rota-do-oeste'));
  assert.ok(s.n >= 1 && s.n <= s.total && s.total === exp.linhas.length, JSON.stringify([s.n, s.total]));
  const st = await page.textContent('#ficha-pracas-serie');
  assert.ok(st.includes(`Entram ${s.n} de ${s.total} praças da concessão`), st);
  const per = await page.evaluate(m => `${IntelModel.monthLabel(m[0])} a ${IntelModel.monthLabel(m[m.length - 1])}`, s.meses);
  assert.ok(st.includes(per), per);
  assert.equal(await page.locator('#ficha-pracas-serie svg.chart rect.cbar').count(), s.meses.length * 2);
  assert.match(await page.textContent('#ficha-pracas-serie .chart-legend'), /Leves.*Pesados/);
  const tip = await page.evaluate(v => IntelModel.fmtInt(v), s.l[0]);
  const mes0 = await page.evaluate(m => IntelModel.monthLabel(m), s.meses[0]);
  assert.ok((await page.innerHTML('#ficha-pracas-serie')).includes(`<title>${mes0} · Leves: ${tip} veíc./dia</title>`));
  assert.doesNotMatch(t, /undefined|NaN/);
  await escFicha();
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
  assert.equal(await page.textContent('#ficha-obras .fserie__name'), `Obras não concluídas com maior avanço previsto (${o.top.length})`);
  assert.ok(o.concluidas + o.andamento + o.naoIniciadas + o.semDado === o.total);

  await go('#ficha/' + r.pipe);
  const pt = await page.textContent('#ficha-pipeline');
  assert.ok(pt.includes(r.pipeLabel), pt);
  if (r.pipeItem.fonte_url) assert.equal(await page.locator(`#ficha-pipeline a[href="${r.pipeItem.fonte_url}"]`).count(), 1);
  await escFicha();
});

test('(b) ficha sem capa ANTT não mostra o bloco ANTT; nenhuma ficha mostra "undefined" ou "NaN"', async () => {
  const id = await page.evaluate(() => window.CONC.entidades.find(e => e.estado === 'projeto2027' && !IntelModel.anttCapa(window.INTEL, e.id) &&
    !IntelModel.anttAnteriores(window.INTEL, e.id).length).id);
  await go('#ficha/' + id);
  const titles = await blockTitles();
  assert.ok(!titles.some(h => /ANTT|Receita, investimento|Praças da concessão/.test(h)), titles.join(' | '));
  assert.doesNotMatch(await fichaText(), /undefined|NaN/);
  await escFicha();
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
  const qual = await page.$$eval('#ficha dt', dts => { const d = dts.find(x => x.textContent === 'Qualidade do recorte'); return d ? d.nextElementSibling.textContent : null; });
  assert.equal(qual, await page.evaluate(q => IntelModel.qualidadeRecorte(q), s.e.qualidade));
  assert.ok(['Recorte ok', 'Recorte aproximado', 'Não mapeado'].includes(qual), qual);
  const prazo = await page.$$eval('#ficha dt', dts => { const d = dts.find(x => x.textContent === 'Prazo atual (com prorrogações)'); return d ? d.nextElementSibling.textContent : null; });
  assert.equal(prazo, s.e.prazo.replace(/\bAnos\b/, 'anos'));
  assert.ok(t.includes(s.e.trechos[0].rod));
  assert.equal(await page.locator(`#ficha a[href="${s.e.fonte_url}"]`).count() >= 1, true);
  assert.doesNotMatch(t, /undefined|NaN/);
  // Esc volta à aba anterior
  await escFicha();
  assert.equal(await page.evaluate(() => location.hash), '#projetos');
  assert.equal(await page.isVisible('#ficha'), false);
  // Ver no mapa
  await go('#ficha/' + s.e.id);
  assert.equal(await page.isDisabled('#ficha-map'), false);
  await page.click('#ficha-map');
  await page.waitForFunction(() => location.hash === '#mapa' && Tabs.current().active === 'mapa' && !!Layers.selected() && Layers.selected().key === 'estconc');
  assert.equal(await page.evaluate(() => location.hash), '#mapa');
  assert.equal(await page.isVisible('#ficha'), false);
  assert.equal(await page.evaluate(() => Layers.isOn('estaduais')), true);
  assert.equal(await page.isChecked('#layers-section input[data-layer="estaduais"]'), true);
  assert.deepEqual(await page.evaluate(() => Layers.selected()), { key: 'estconc', i: s.k });
  assert.equal(await page.evaluate(c => MapView.map.getBounds().contains(c), s.center), true);
  assert.ok(await page.evaluate(() => MapView.map.getZoom()) >= 6);
  // o cartão do mapa usa o mesmo rótulo de recorte da ficha
  assert.match(await page.textContent('#card .card__badges'), new RegExp(qual));
  assert.ok((await page.evaluate(() => Layers.colorsUsed().selecao || [])).length > 0);
  // desligar "Rodovias estaduais" com a concessão aberta limpa a seleção (contorno) e fecha o cartão
  await page.locator('#layers-section input[data-layer="estaduais"]').uncheck();
  await page.waitForSelector('#card', { state: 'hidden' });
  assert.equal(await page.evaluate(() => Layers.selected()), null);
  assert.equal(await page.evaluate(() => Layers.colorsUsed().selecao), undefined);
  // não mapeada sem geometria: botão desabilitado com explicação
  if (s.nm) {
    await go('#ficha/' + s.nm);
    assert.equal(await page.isDisabled('#ficha-map'), true);
    assert.match(await page.getAttribute('#ficha-map', 'title'), /sem traçado/i);
    assert.match(await fichaText(), /sem traçado no mapa/i);
    await escFicha();
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
  await page.waitForFunction(() => Ficha.isOpen() && location.hash.startsWith('#ficha/'));
  assert.match(await fichaText(), /Concessão estadual/);
  await escFicha();
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
  // v3.1: cada status com ponto colorido do token PIPE_STATUS, além do texto
  const rgb = h => `rgb(${[1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)).join(', ')})`;
  const dots = await page.$$eval('#pipe-counts [data-pstatus]', bs => bs.map(b => [b.dataset.pstatus, getComputedStyle(b, '::before').backgroundColor]));
  const pipeTok = await page.evaluate(() => PIPE_STATUS);
  assert.ok(dots.length >= 5);
  for (const [k, bg] of dots) assert.equal(bg, rgb(pipeTok[k]), k);
  // o mesmo ponto (mesmo token) em cada linha da tabela, ao lado do texto do status
  const rowDots = await page.$$eval('#pipe-table tbody tr td:nth-child(6) .pstatus', ss => ss.map(s =>
    [s.dataset.pdot, s.textContent, getComputedStyle(s, '::before').backgroundColor, getComputedStyle(s, '::before').width]));
  assert.equal(rowDots.length, await page.locator('#pipe-table tbody tr').count());
  const lbl = await page.evaluate(() => Object.fromEntries(window.INTEL.pipeline.itens.map(i => [i.status, IntelModel.statusLabel(window.INTEL, i.status)])));
  for (const [k, txt, bg, w] of rowDots) {
    assert.equal(bg, rgb(pipeTok[k]), k);
    assert.equal(w, '10px', k);
    assert.equal(txt, lbl[k], k);
  }
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
  await routed(page, '#ficha/' + ent);
  assert.equal(await page.evaluate(() => location.hash), '#ficha/' + ent);
  assert.equal(await page.isVisible('#ficha'), true);
  await escFicha();
  assert.equal(await page.evaluate(() => location.hash), '#projetos');
  // link de fonte não navega para a ficha
  assert.equal(await page.getAttribute('#pipe-table tbody tr a[href^="http"]', 'target'), '_blank');
  // item estadual com concessão vigente abre a ficha estadual (RS Bloco 3 → Caminhos da Serra Gaúcha), km como na ficha
  const b3 = page.locator('#pipe-table tbody tr[data-ent="rs-caminhos-da-serra-gaucha"]');
  assert.equal(await b3.count(), 1);
  const kmB3 = await page.evaluate(() => {
    const e = window.INTEL.estaduais.entidades.find(x => x.id === 'rs-caminhos-da-serra-gaucha');
    return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(e.km_decl);
  });
  assert.equal(await b3.locator('td.num').textContent(), kmB3);
  // observação: detalhe expansível na linha, sem abrir a ficha
  const nObs = await page.evaluate(() => window.INTEL.pipeline.itens.filter(i => i.obs).length);
  assert.equal(await page.locator('#pipe-table details.pipe-obs').count(), nObs);
  const obs = await page.evaluate(() => window.INTEL.pipeline.itens.find(i => i.id === 'rs-bloco-3').obs);
  await b3.locator('details.pipe-obs summary').click();
  assert.equal(await b3.locator('details.pipe-obs').evaluate(d => d.open), true);
  assert.equal(await b3.locator('details.pipe-obs p').textContent(), obs);
  assert.equal(await page.evaluate(() => location.hash), '#projetos');
  assert.equal(await page.isVisible('#ficha'), false);
  // a observação aberta continua aberta depois de um filtro
  await page.selectOption('#pipe-esfera', 'estadual');
  assert.equal(await b3.locator('details.pipe-obs').evaluate(d => d.open), true);
  await page.selectOption('#pipe-esfera', '');
  await b3.locator('td.name').click({ position: { x: 4, y: 4 } });
  await routed(page, '#ficha/rs-caminhos-da-serra-gaucha');
  assert.match(await fichaText(), /Concessão estadual · RS/);
  assert.match(await page.textContent('#ficha-pipeline'), /Contrato assinado/);
  await escFicha();
  assert.equal(await page.evaluate(() => location.hash), '#projetos');
  await go('#mapa');
});

test('Pipeline: linha do tempo de editais e leilões bate com o modelo (linhas, marcas, cores, rodapé) e o nome abre a ficha', async () => {
  await go('#projetos');
  const m = await page.evaluate(() => {
    const res = IntelModel.linhaDoTempoResumo(window.CONC, window.INTEL.pipeline);
    return { res, ficha: res.rows.map(r => !!(r.ent && Ficha.exists(r.ent))), cor: Object.fromEntries(Object.entries(PIPE_STATUS)),
      lbl: Object.fromEntries(window.INTEL.pipeline.status.map(x => [x.key, x.label])) };
  });
  const { res } = m;
  // o recorte começa no ano corrente: o número de linhas muda com o relógio e com os dados; a tela segue o modelo
  if (!res.rows.length) { assert.equal(await page.isHidden('#pipe-timeline'), true); await go('#mapa'); return; }
  // linhas de item só de imprensa (verificado = false no pipeline) levam "(não verificado)" no rótulo e "não oficial" na dica
  const nvModelo = await page.evaluate(ids => ids.filter(id => window.INTEL.pipeline.itens.find(i => i.id === id).verificado === false), res.rows.map(r => r.id));
  const marcados = await page.$$eval('#pipe-timeline svg.chart .tl-row', gs => gs.filter(g => / \(não verificado\)$/.test(g.querySelector('text[text-anchor="end"]').textContent))
    .map(g => g.querySelector('.tl-leilao').dataset.id));
  assert.deepEqual(marcados, nvModelo);
  for (const id of nvModelo) assert.match(await page.$eval(`#pipe-timeline .tl-leilao[data-id="${id}"] title`, t => t.textContent), /fonte: imprensa — não oficial$/, id);
  // cartão dentro do Pipeline, antes da tabela; título com os anos dos leilões
  const pos = await page.evaluate(() => {
    const c = document.getElementById('pipe-timeline'), t = document.getElementById('pipe-table');
    return { dentro: !!c.closest('#pipeline'), antes: !!(c.compareDocumentPosition(t) & 4), hidden: c.hidden, h3: c.querySelector('h3').textContent };
  });
  assert.deepEqual([pos.dentro, pos.antes, pos.hidden], [true, true, false]);
  assert.equal(pos.h3, `Linha do tempo: editais e leilões ${res.anos.de}–${res.anos.ate}`);
  // uma linha e um losango por item do modelo, na mesma ordem; círculo só onde há edital
  const sel = '#pipe-timeline svg.chart';
  assert.deepEqual(await page.$$eval(`${sel} .tl-leilao`, ps => ps.map(p => p.dataset.id)), res.rows.map(r => r.id));
  assert.equal(await page.locator(`${sel} .tl-row`).count(), res.rows.length);
  assert.deepEqual(await page.$$eval(`${sel} .tl-edital`, cs => cs.map(c => c.dataset.id)), res.rows.filter(r => r.edital).map(r => r.id));
  assert.equal(await page.locator(`${sel} .tl-span`).count(), res.rows.filter(r => r.edital).length);
  // posição cresce com a data do leilão; o eixo mostra cada ano entre de e ate (do modelo)
  const xs = await page.$$eval(`${sel} .tl-leilao`, ps => ps.map(p => Number(p.dataset.leilaoX)));
  assert.deepEqual(xs, [...xs].sort((a, b) => a - b));
  const anos = await page.$$eval(`${sel} .tl-ano`, ts => ts.map(t => Number(t.textContent)));
  assert.deepEqual(anos, Array.from({ length: res.ate - res.de + 1 }, (_, k) => res.de + k));
  // cor de cada losango e círculo = token do status; legenda com os status usados e as duas marcas
  const rgb = h => `rgb(${[1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)).join(', ')})`;
  const fills = await page.$$eval(`${sel} .tl-leilao`, ps => ps.map(p => getComputedStyle(p).fill));
  fills.forEach((f, i) => assert.equal(f, rgb(m.cor[res.rows[i].status]), res.rows[i].id));
  const strokes = await page.$$eval(`${sel} .tl-edital`, cs => cs.map(c => [getComputedStyle(c).stroke, getComputedStyle(c).fill]));
  const comEdital = res.rows.filter(r => r.edital);
  strokes.forEach(([st, fl], i) => { assert.equal(st, rgb(m.cor[comEdital[i].status])); assert.equal(fl, 'none'); });
  const leg = await page.textContent('#pipe-timeline .chart-legend:first-of-type');
  for (const k of new Set(res.rows.map(r => r.status))) assert.ok(leg.includes(m.lbl[k]), k);
  // amostra da legenda: mesma forma e cor cheia do losango da linha (sem transparência), um por status usado
  const usados = [...new Set(res.rows.map(r => r.status))];
  const amostras = await page.$$eval('#pipe-timeline .chart-legend:first-of-type span', ss => ss.map(sp => {
    const el = sp.querySelector('svg path'), cs = getComputedStyle(el);
    return [sp.textContent.trim(), cs.fill, cs.fillOpacity, el.getAttribute('d')];
  }));
  assert.equal(amostras.length, usados.length);
  const formaMarca = await page.$eval(`${sel} .tl-leilao`, p => p.getAttribute('d').match(/L/g).length);
  amostras.forEach(([txt, fill, op, d], i) => {
    assert.equal(txt, m.lbl[usados.find(k => m.lbl[k] === txt)], txt);
    assert.equal(fill, rgb(m.cor[usados.find(k => m.lbl[k] === txt)]), txt);
    assert.equal(op, '1', txt);
    assert.equal(d.match(/L/g).length, formaMarca, txt); // losango: M + 3 L + Z, como a marca
  });
  assert.match(await page.textContent('#pipe-timeline'), /Edital\s*Leilão|Edital.*Leilão/);
  // só tokens do projeto nas marcas
  const cores = await page.$$eval(sel + ' [fill], ' + sel + ' [stroke]', els => els.flatMap(e => [e.getAttribute('fill'), e.getAttribute('stroke')]).filter(c => c && c[0] === '#'));
  const ok = new Set(await page.evaluate(() => [...DATA_TOKENS, '#183C80', '#0071BB', '#231F20', '#525254', '#F7F7F8']));
  for (const c of cores) assert.ok(ok.has(c.toUpperCase()), c);
  // rodapé: itens do pipeline sem data de leilão, contados pelo modelo
  const fora = page.locator('#pipe-timeline-fora');
  if (res.semData) assert.match(await fora.textContent(), new RegExp(`^${res.semData}\\s`)); else assert.equal(await fora.count(), 0);
  // data só com mês: marca "(mês)" no texto e na dica, e não nas datas completas
  const textos = await page.$$eval(`${sel} .tl-row`, gs => gs.map(g => [...g.querySelectorAll(':scope > text')].pop().textContent));
  res.rows.forEach((r, i) => assert.equal(/\(mês\)$/.test(textos[i]), r.leilao.length === 7, r.id));
  assert.ok(!/NaN|undefined|null/.test(await page.innerHTML(sel)));
  // o nome abre a ficha só nas linhas com ficha
  const ks = await page.$$eval(`${sel} .tl-row`, gs => gs.map(g => g.dataset.k || null));
  assert.deepEqual(ks, res.rows.map((r, i) => (m.ficha[i] ? r.ent : null)));
  const i0 = ks.findIndex(Boolean);
  if (i0 >= 0) { // depende dos dados: alguma linha com ficha no recorte
    await page.locator(`${sel} .tl-row`).nth(i0).locator(':scope > text').first().click();
    await routed(page, '#ficha/' + ks[i0]);
    await escFicha();
    // teclado: Enter na linha abre a ficha
    await page.locator(`${sel} .tl-row[data-k]`).first().focus();
    await page.keyboard.press('Enter');
    await routed(page, '#ficha/' + ks[i0]);
    await escFicha();
  }
  // linha sem ficha não navega
  const semFicha = ks.findIndex(k => !k);
  if (semFicha >= 0) {
    await page.locator(`${sel} .tl-row`).nth(semFicha).locator(':scope > text').first().click();
    assert.equal(await page.evaluate(() => location.hash), '#projetos');
  }
  await go('#mapa');
});

test('sem window.INTEL: Projetos e ficha sem esfera, pipeline nem ANTT, sem erros', async () => {
  const errs = [], ext = [];
  const p = await openPage(errs, ext, html => html.replace('window.INTEL=', 'window.INTEL_AUSENTE='));
  await go('#projetos', p);
  assert.equal(await p.locator('#proj-table tbody tr').count(), 54);
  assert.equal(await p.locator('#pipeline').count(), 0);
  assert.equal(await p.locator('#estudos-list li').count(), 27);
  await go('#ficha/nova-rota-do-oeste', p);
  assert.equal(await p.isVisible('#ficha'), true);
  const titles = await p.$$eval('#ficha .fblock h3', hs => hs.map(h => h.textContent));
  assert.ok(!titles.some(h => /ANTT|Praças da concessão|Pipeline/.test(h)));
  await p.evaluate(() => { location.hash = '#ficha/sp-lt01-autoban'; });
  // ficha inexistente (sem INTEL) cai na página inicial
  await p.waitForFunction(() => location.hash === '#resumo' && Tabs.current().active === 'resumo' && !Ficha.isOpen());
  assert.equal(await p.evaluate(() => location.hash), '#resumo');
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
const ABAS = ['Resumo', 'Mapa', 'Projetos', 'Tráfego', 'Cargas', 'Mercado', 'Debêntures', 'Regulatório', 'Fontes', 'Glossário'];
// Espera a condição real (aba Mapa exibida, cartão aberto, seleção feita) em vez de um tempo fixo.
const untilMapCard = (p, extra = 'true') => p.waitForFunction(`location.hash === '#mapa' && Tabs.current().active === 'mapa' && !document.getElementById('card').hidden && (${extra})`);
async function goTab(p, hash) {
  await p.evaluate(h => { location.hash = h; }, hash);
  await p.waitForFunction(h => Tabs.current().active === h.slice(1) && document.querySelector(`#page-${h.slice(1)} .page__inner`), hash);
}

test('(a) barra de abas na ordem (Resumo primeiro, Glossário por último)', async () => {
  await page.evaluate(() => { location.hash = '#mapa'; });
  await page.waitForFunction(() => Tabs.current().active === 'mapa');
  assert.deepEqual(await page.$$eval('#tabs a', as => as.map(a => a.textContent)), ABAS);
  assert.deepEqual(await page.$$eval('#tabs a', as => as.map(a => a.getAttribute('href'))),
    ['#resumo', '#mapa', '#projetos', '#trafego', '#cargas', '#mercado', '#debentures', '#regulatorio', '#fontes', '#glossario']);
});

test('(b) Tráfego: ≥ 5 gráficos, "Fonte:" em cada cartão, KPIs do modelo, sem undefined/NaN', async () => {
  await goTab(page, '#trafego');
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
  assert.equal(await page.textContent('#kpi-vkm b'), await page.evaluate(() => IntelModel.fmtVkm(IntelModel.trafegoKpis(window.INTEL, window.SNV).vkm)));
  // v3.1: veíc·km/dia federal = aggregateIntel (VMDa 2025) em toda a malha; estadual 2025 = Σ total × extensão das linhas
  const v = await page.evaluate(() => {
    const all = new Uint8Array(window.SNV.fis.length).fill(1), a = IntelModel.aggregateIntel(window.INTEL, window.SNV, all);
    const m = window.INTEL.estaduais.malha, iExt = m.campos.indexOf('ext'), t = window.INTEL.vmda2025.estaduais.t;
    let est = 0;
    t.forEach((x, i) => { if (x != null && x > 0) est += x * m.linhas[i][iExt]; });
    return { fed: IntelModel.fmtVkm(a.vkm), est: IntelModel.fmtVkm(est), ano: a.anoVmda };
  });
  assert.equal(v.ano, A.v25);
  assert.equal(await page.textContent('#kpi-vkm b'), v.fed);
  assert.equal(await page.textContent('#kpi-vkm span'), `na malha federal (VMDa ${A.v25}, modelado)`);
  assert.equal(await page.textContent('#kpi-vkm-est b'), v.est);
  assert.equal(await page.textContent('#kpi-vkm-est span'), `nas rodovias estaduais (VMDa ${A.v25}, modelado)`);
  const kSrc = await page.textContent('#card-t-kpis');
  assert.match(kSrc, new RegExp(`DNIT — VMDa ${A.v25} .* · ${A.v25} · modelado`));
  assert.match(kSrc, /Rodovias estaduais: .* km com estimativa de .* km/);
  // cobertura exata: a malha inclui duplicados e em obras (não só "pavimentadas") e não afirma "fora das BRs"
  assert.match(kSrc, /pavimentados, duplicados ou em obras de pavimentação, mais os usados por concessões estaduais/);
  assert.match(kSrc, /se sobrepõem a rodovias federais do SNV em mais de 80% da extensão/);
  assert.doesNotMatch(kSrc, /fora das BRs/);
  // a taxa de acidentes segue com o VMDa 2023 (leves/pesados), rotulada
  assert.ok((await page.textContent('#card-t-taxa')).includes(`÷ VMDa ${A.v23}`));
  // períodos das fontes em pt-BR
  assert.ok((await page.textContent('#card-t-rank .src:last-child')).includes(A.perPracas));
  assert.doesNotMatch(await page.textContent('#page-trafego'), /\b\d{4}-(0[1-9]|1[0-2])\b/);
  const t = await page.textContent('#page-trafego');
  assert.doesNotMatch(t, /undefined|NaN/);
  assert.equal(await page.getAttribute('#chart-t-rank svg.chart', 'role'), 'group');
  assert.equal(await page.getAttribute('#chart-t-taxa svg.chart', 'role'), 'img');
  assert.match(t, /índice 1999 = 100, rodovias pedagiadas, não é volume/i);
  assert.match(t, /Entram só as \d+ praças/);
  assert.match(await page.textContent('#card-t-taxa'), /trechos planejados no SNV ficam de fora/);
  assert.equal(await page.locator('#chart-t-rank .hrow[data-k]').count(), 20);
  assert.equal(await page.locator('#chart-t-taxa .hrow').count(), 15);
  assert.equal(await page.locator('#chart-t-uf-a .hrow').count(), await page.evaluate(() => IntelModel.acidentesPorUf(window.INTEL, window.SNV).length));
  // dicas da série mensal e do ABCR em mmm/aaaa
  assert.ok((await page.innerHTML('#chart-t-serie')).includes(`<title>${A.mes0} · Leves:`));
  assert.ok((await page.innerHTML('#chart-t-abcr')).includes(`<title>Leves ${A.abcr0}:`));
});

test('(b) clicar na 1ª praça do ranking abre o Mapa com a camada Praças e o cartão da praça', async () => {
  await goTab(page, '#trafego');
  const top = await page.evaluate(() => IntelModel.pracasRanking(window.INTEL, 1)[0]);
  assert.equal(await page.getAttribute('#chart-t-rank .hrow[data-k]', 'data-k'), String(top.i));
  await page.click('#chart-t-rank .hrow[data-k] rect.cbar');
  await untilMapCard(page, `JSON.stringify(Layers.selected()) === '${JSON.stringify({ key: 'pracas', i: top.i })}'`);
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
  await goTab(page, '#trafego');
  const second = await page.$$eval('#chart-t-rank .hrow[data-k]', gs => gs[1].dataset.k);
  await page.focus(`#chart-t-rank .hrow[data-k="${second}"]`);
  await page.keyboard.press('Enter');
  await untilMapCard(page, `Layers.selected() && Layers.selected().i === ${Number(second)}`);
  assert.equal(await page.evaluate(() => location.hash), '#mapa');
  assert.deepEqual(await page.evaluate(() => Layers.selected()), { key: 'pracas', i: Number(second) });
  await page.click('#card-close');
  await page.locator('#layers-section input[data-layer="pracas"]').uncheck();
});

test('(c) Cargas: KPI de soja = fmtT(soma), "Fonte:" em cada cartão, sem undefined/NaN', async () => {
  await goTab(page, '#cargas');
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
  // mesma carga, mesmo formato do cartão e da legenda (fmtT)
  const pnl = await page.evaluate(() => IntelModel.cargaTop(window.INTEL, window.SNV, 15).map(r => IntelModel.fmtT(r.gsa)));
  assert.deepEqual(await page.$$eval('#pnl-table tbody tr td:nth-child(3)', tds => tds.map(t => t.textContent)), pnl);
  assert.equal(await page.locator('#chart-c-exp-mat tbody tr').count(), 10);
  assert.equal(await page.locator('#chart-c-exp-mat thead th').count(), 9);
  assert.match(await page.textContent('#kpi-arm'), /sem municípios sob sigilo/);
  // matriz: nada positivo aparece como 0,00
  const cells = await page.$$eval('#chart-c-exp-mat tbody td.num', tds => tds.map(t => t.textContent));
  assert.ok(!cells.includes('0,00'), cells.join(' '));
  assert.ok(cells.includes('< 0,01'));
});

test('(c) trocar o produto da exportação muda o gráfico e a matriz', async () => {
  await goTab(page, '#cargas');
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
  await goTab(page, '#cargas');
  // a ordem vale entre as rotas sem ressalva de distância; as de distância suspeita vêm depois de todas
  const vals = () => page.$$eval('#frete-table tbody tr:not([data-suspeito])', trs => trs.map(t => t.dataset.rst).filter(Boolean).map(Number));
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
  const nAprox = await page.evaluate(() => window.INTEL.multimodal.fretes.linhas.filter(l => l[6].split('+').includes('aprox')).length);
  assert.equal(await page.locator('#frete-table .tag-nv', { hasText: 'origem aproximada' }).count(), nAprox);
  // distância suspeita na fonte: R$/t·km "—" com etiqueta, e essas rotas sempre no fim (em qualquer ordenação)
  const nSus = await page.evaluate(() => window.INTEL.multimodal.fretes.linhas.filter(l => l[6].includes('km_suspeito')).length);
  assert.ok(nSus > 0);
  for (const key of ['rs_t', 'rs_tkm', 'km', 'origem']) {
    await page.click(`#frete-table [data-fsort="${key}"]`);
    const flags = await page.$$eval('#frete-table tbody tr', trs => trs.map(t => t.dataset.suspeito === '1'));
    assert.equal(flags.filter(Boolean).length, nSus, key);
    assert.ok(flags.slice(flags.length - nSus).every(Boolean), `${key}: suspeitas fora do fim`);
  }
  const cells = await page.$$eval('#frete-table tbody tr[data-suspeito] td:nth-child(7)', tds => tds.map(t => t.textContent.trim()));
  assert.ok(cells.every(c => c === '— distância suspeita na fonte'), cells[0]);
  const ms = await page.$$eval('#frete-table tbody tr[data-suspeito]', trs => trs.filter(t => t.children[1].textContent === 'MS').length);
  const msEsperado = await page.evaluate(() => {
    const f = window.INTEL.multimodal.fretes, k = f.campos.indexOf('uf_o');
    return f.linhas.filter(l => l[6].includes('km_suspeito') && l[k] === 'MS').length;
  });
  assert.ok(msEsperado > 0);
  assert.equal(ms, msEsperado);
  await page.click('#frete-table [data-fsort="rs_t"]');
  if ((await page.getAttribute('#frete-table th[aria-sort]', 'aria-sort')) !== 'descending') await page.click('#frete-table [data-fsort="rs_t"]');
  assert.ok(isSorted(await vals(), 'desc'));
  await page.selectOption('#frete-uf', 'MT');
  const ufs = await page.$$eval('#frete-table tbody tr td:nth-child(2)', tds => [...new Set(tds.map(t => t.textContent))]);
  assert.deepEqual(ufs, ['MT']);
  await page.selectOption('#frete-uf', '');
});

test('(c) município de soja abre no mapa com o fundo Soja; trecho de carga abre o cartão do trecho', async () => {
  await goTab(page, '#cargas');
  const m = await page.evaluate(() => IntelModel.topMunicipios(window.INTEL, 'soja', 1)[0]);
  await page.click('#chart-c-mun .hrow[data-k] rect.cbar');
  await untilMapCard(page, `Layers.selected() && Layers.selected().key === 'mun'`);
  assert.equal(await page.evaluate(() => location.hash), '#mapa');
  assert.equal(await page.evaluate(() => Layers.fundo()), 'soja');
  assert.equal(await page.isChecked('#layers-section input[name="fundo"][value="soja"]'), true);
  assert.equal(await page.isVisible('#fundo-legend'), true);
  assert.deepEqual(await page.evaluate(() => Layers.selected()), { key: 'mun', i: m.id });
  assert.match(await page.textContent('#card .card__title'), new RegExp(`^${m.nome} / ${m.uf}$`));
  await page.click('#card-close');
  await page.check('#layers-section input[name="fundo"][value=""]');
  assert.equal(await page.evaluate(() => Layers.fundo()), null);

  await goTab(page, '#cargas');
  const j = await page.evaluate(() => IntelModel.cargaTop(window.INTEL, window.SNV, 1)[0].j);
  await page.click('#pnl-table tbody tr');
  await untilMapCard(page, `MapView.highlighted().includes(${j})`);
  assert.equal(await page.evaluate(() => location.hash), '#mapa');
  assert.equal(await page.isVisible('#card'), true);
  assert.deepEqual(await page.evaluate(() => MapView.highlighted()), [j]);
  assert.match(await page.textContent('#card'), /Carga agrícola/);
  await page.click('#card-close');
  await page.evaluate(() => MapView.fitBrasil(false));
});

test('(d) Fontes: ≥ 30 fontes, ≥ 9 indisponíveis com motivo, bases do painel e explicação medido × modelado', async () => {
  await goTab(page, '#fontes');
  assert.ok(await page.locator('#fontes-table tbody tr').count() >= 30);
  assert.ok(await page.locator('#fontes-indisp-table tbody tr').count() >= 9);
  assert.equal(await page.locator('#fontes-base-table tbody tr').count(), await page.evaluate(() => window.INTEL.fontes.base.length));
  const t = await page.textContent('#page-fontes');
  assert.match(t, /Medido × modelado/);
  assert.match(t, /Fontes procuradas e não obtidas/);
  assert.match(t, /Bases do painel/);
  const acessos = await page.evaluate(() => [...new Set(window.INTEL.fontes.fontes.map(f => f.acesso))]);
  for (const a of acessos) assert.ok(t.includes(a.split('-').reverse().join('/')), `acesso ${a} em dd/mm/aaaa`);
  assert.ok(t.includes(A.perPracas), A.perPracas);
  // coluna Período em pt-BR (as notas ficam como na fonte)
  const periodos = await page.$$eval('#fontes-table tbody tr td:nth-child(3), #fontes-base-table tbody tr td:nth-child(2)', tds => tds.map(t => t.textContent));
  for (const x of periodos) assert.doesNotMatch(x, /\b\d{4}-(0[1-9]|1[0-2])\b/, x);
  const leg = await page.textContent('#fontes-legenda');
  for (const re of [/Medido/, /Modelado/, /Cadastro/, /"—": fonte de apoio/]) assert.match(leg, re);
  assert.match(t, /Cadastro é registro de infraestrutura ou de contratos/);
  assert.doesNotMatch(t, /undefined|NaN/);
  for (const a of acessos) assert.ok(!t.includes(a), `data crua ${a}`);
  const motivos = await page.$$eval('#fontes-indisp-table tbody tr td:nth-child(2)', tds => tds.map(t => t.textContent));
  assert.ok(motivos.every(m => m.length > 5));
  assert.equal(await page.getAttribute('#fontes-table tbody tr a', 'target'), '_blank');
  const tipos = await page.$$eval('#fontes-table tbody tr td:nth-child(6)', tds => [...new Set(tds.map(t => t.textContent))].sort());
  assert.ok(tipos.includes('Medido') && tipos.includes('Modelado') && tipos.includes('Cadastro'), tipos.join());
  // registros (malha municipal, estaduais, capas ANTT) não aparecem como "Medido"
  const tipoDe = await page.$$eval('#fontes-table tbody tr', trs => trs.map(tr => [tr.children[0].textContent, tr.children[1].textContent, tr.children[5].textContent]));
  for (const [b, n, tp] of tipoDe) {
    if (b === 'Municípios' || b === 'Estaduais' || /Capas das concessões/.test(n)) assert.equal(tp, 'Cadastro', n);
  }
  // blocos com o nome do arquivo de descrições (o mesmo do Resumo), nunca a chave interna; VMDa 2025 modelado e rotas como cadastro
  const nomeDe = await page.evaluate(() => Object.fromEntries(Object.entries(window.FONTES_DESCRICAO).map(([k, v]) => [k, v.nome])));
  const blocos = new Set(tipoDe.map(r => r[0]));
  assert.ok(blocos.has(nomeDe.vmda2025) && blocos.has(nomeDe.rotas), [...blocos].join());
  for (const b of blocos) assert.doesNotMatch(b, /^[a-z0-9]+$/, b);
  for (const [b, n, tp] of tipoDe) {
    if (b === nomeDe.vmda2025) assert.equal(tp, 'Modelado', n);
    if (b === nomeDe.rotas) assert.equal(tp, 'Cadastro', n);
  }
});

// Fontes listadas na aba × fontes dos blocos embutidos no HTML, nos dois sentidos (nada a mais, nada a menos).
const fontesListadas = p => p.evaluate(() => {
  const rows = sel => [...document.querySelectorAll(sel)];
  return {
    dados: rows('#fontes-table tbody tr').map(tr => `${tr.dataset.bloco}|${tr.children[1].textContent}`).sort(),
    base: rows('#fontes-base-table tbody tr').map(tr => tr.dataset.bloco).sort(),
    docs: rows('#fontes-verificacao-table tbody tr').map(tr => tr.dataset.doc).sort(),
    glossario: rows('#fontes-glossario-table tbody tr').map(tr => tr.children[0].textContent).sort(),
    rotulos: Object.fromEntries(rows('#fontes-table tbody tr').map(tr => [tr.dataset.bloco, tr.children[0].textContent])),
  };
});
const fontesEmbutidas = p => p.evaluate(() => {
  const I = window.INTEL, C = window.CONC, G = window.GLOSSARIO || [];
  const lista = x => (Array.isArray(x) ? x : x ? [x] : []);
  const dados = Object.entries(I).filter(([k]) => k !== 'fontes').flatMap(([k, b]) => lista(b && b.fonte).map(f => `${k}|${f.nome}`)).sort();
  // bases do painel: a malha (window.SNV) e a carteira (window.CONC), embutidas fora do INTEL
  const base = [window.SNV && 'snv', C && 'roadshow'].filter(Boolean).sort();
  const docs = [...new Set([...lista(C.verificacao && C.verificacao.fontes), ...lista(C.consorcios).flatMap(c => lista(c.fontes))].map(d => d.id))].sort();
  const glossario = [...new Set(G.filter(e => e.fonte && e.fonte.nome).map(e => e.fonte.nome))].sort();
  return { dados, base, docs, glossario };
});

test('Fontes: lista exatamente as fontes dos blocos embutidos (dados, bases, documentos dos leilões e consórcios, glossário)', async () => {
  await goTab(page, '#fontes');
  const l = await fontesListadas(page), e = await fontesEmbutidas(page);
  assert.deepEqual(l.dados, e.dados, 'fontes de dados = itens "fonte" de cada bloco do INTEL');
  assert.deepEqual(l.base, e.base);
  assert.deepEqual(l.docs, e.docs);
  assert.deepEqual(l.glossario, e.glossario);
  assert.ok(e.dados.length && e.docs.length && e.glossario.length);
  const t = await page.textContent('#page-fontes');
  assert.doesNotMatch(t, /neste ambiente|Centro de Inteligência|novidades/i);  // sem histórico do projeto (versões: test_sem_mencoes.py)
});

test('Fontes: bloco novo com fonte (bloco fictício) e fonte nova no glossário entram sozinhos', async () => {
  const errs = [], ext = [];
  const inject = html => {
    const i = html.indexOf('</script>', html.indexOf('window.INTEL='));
    return `${html.slice(0, i)};(() => { const I = window.INTEL;
      const f = { nome: 'Corretora X — negócios de exemplo', url: 'https://exemplo.invalid/', periodo: '2026-10-01/2026-10-21', acesso: '2026-10-22', licenca: 'uso restrito', tipo: 'medido' };
      I.bloco_exemplo = { fonte: [f] };
      I.fontes.fontes.push(Object.assign({ bloco: 'bloco_exemplo', nota: '' }, f));
      window.FONTES_DESCRICAO.bloco_exemplo = { nome: 'Bloco de exemplo', oQue: 'Exemplo.' };
      window.GLOSSARIO.push({ id: 'termo-exemplo', termo: 'Termo de exemplo', definicao: 'Exemplo.', fonte: { nome: 'Norma de exemplo nº 1/2026' }, categorias: ['Finanças'] });
    })();${html.slice(i)}`;
  };
  const p = await openPage(errs, ext, inject);
  await goTab(p, '#fontes');
  const l = await fontesListadas(p), e = await fontesEmbutidas(p);
  assert.ok(l.dados.includes('bloco_exemplo|Corretora X — negócios de exemplo'), l.dados.join('\n'));
  assert.deepEqual(l.dados, e.dados);
  assert.equal(l.rotulos.bloco_exemplo, 'Bloco de exemplo');
  assert.ok(l.glossario.includes('Norma de exemplo nº 1/2026'));
  assert.deepEqual(l.glossario, e.glossario);
  assert.match(await p.textContent('#fontes-table tr[data-bloco="bloco_exemplo"]'), /01\/10\/2026 a 21\/10\/2026/);
  assert.deepEqual(errs, []);
  assert.deepEqual(ext, []);
  await p.context().close();
});

test('(e) hashes inválidos caem no Resumo (página inicial)', async () => {
  for (const h of ['#xyz', '#trafego/x%zz', '#Fontes']) {
    await goTab(page, '#fontes');
    await page.evaluate(x => { location.hash = x; }, h);
    await page.waitForFunction(() => location.hash === '#resumo' && Tabs.current().active === 'resumo');
    assert.equal(await page.isVisible('#page-resumo'), true);
    assert.equal(await page.isVisible('#map'), false);
  }
  await goTab(page, '#cargas');
  assert.equal(await page.isVisible('#page-cargas'), true);
  await go('#mapa');
});

test('sem window.INTEL as abas Resumo, Tráfego, Cargas e Fontes degradam sem erros', async () => {
  const errs = [], ext = [];
  const p = await openPage(errs, ext, html => html.replace('window.INTEL=', 'window.INTEL_AUSENTE='));
  assert.deepEqual(await p.$$eval('#tabs a', as => as.map(a => a.textContent)), ABAS);
  // Resumo sem INTEL: o achado do calendário (pipeline) some; os demais continuam, sem undefined/NaN
  await goTab(p, '#resumo');
  const ids = await p.$$eval('#resumo-achados .achado', as => as.map(a => a.dataset.achado));
  assert.deepEqual(ids, await p.evaluate(() => LeiloesModel.resumoAchados(window.CONC, undefined).map(a => a.id)));
  assert.ok(!ids.includes('calendario'));
  assert.doesNotMatch(await p.textContent('#page-resumo'), /undefined|NaN/);
  for (const [h, re] of [['#trafego', /não estão neste arquivo/], ['#cargas', /não estão neste arquivo/], ['#fontes', /não está neste arquivo/],
    ['#debentures', /Os dados de mercado das debêntures .* não estão neste arquivo/]]) {
    await goTab(p, h);
    const t = await p.textContent('#page-' + h.slice(1));
    assert.match(t, re, h);
    assert.doesNotMatch(t, /undefined|NaN/);
  }
  assert.equal(await p.locator('#card-d-incentivadas').count(), 1, 'a série do RoadShow não depende do bloco debentures');
  assert.deepEqual(errs, []);
  await p.context().close();
});

test('com só parte dos blocos cada aba mostra só os cartões que têm dado', async () => {
  const errs = [], ext = [];
  const p = await openPage(errs, ext, html => html.replace('window.INTEL=', 'window.INTEL_FULL=').replace('</script>',
    '</script><script>window.INTEL={trafego:window.INTEL_FULL.trafego,agro:window.INTEL_FULL.agro,municipios:window.INTEL_FULL.municipios};</script>'));
  await goTab(p, '#trafego');
  const tr = await p.$$eval('#page-trafego .ccard', cs => cs.map(c => c.id));
  assert.ok(!tr.includes('card-t-rank') && !tr.includes('card-t-serie') && tr.includes('card-t-abcr') && tr.includes('card-t-taxa'), tr.join());
  assert.equal(await p.locator('#kpi-pracas').count(), 0);
  await goTab(p, '#cargas');
  const ca = await p.$$eval('#page-cargas .ccard', cs => cs.map(c => c.id));
  assert.deepEqual(ca, ['card-c-kpis', 'card-c-uf', 'card-c-mun']);
  assert.doesNotMatch(await p.textContent('#page-cargas') + await p.textContent('#page-trafego'), /undefined|NaN/);
  assert.deepEqual(errs, []);
  await p.context().close();
});

// ---------- v3.1, Task 3: paleta de dados estendida ----------
test('paleta: nenhuma cor de dado fora dos tokens; modos na rampa do modo; camadas na cor documentada', async () => {
  await page.evaluate(() => { location.hash = '#mapa'; });
  await page.waitForFunction(() => Tabs.current().active === 'mapa');
  const tokens = new Set(await page.evaluate(() => DATA_TOKENS));
  assert.ok(tokens.has('#183C80') && tokens.has('#2A78D6') && tokens.has('#0D366B'));
  for (const m of ['concessoes', 'fisica', 'trafego', 'pesados', 'carga', 'acidentes']) {
    await mode(m);
    const used = await page.evaluate(() => MapView.lineColors());
    for (const c of Object.keys(used)) assert.ok(tokens.has(c), `${m}: ${c}`);
    if (['trafego', 'pesados', 'carga', 'acidentes'].includes(m)) {
      const ramp = await page.evaluate(m => RAMPS[m].map(c => c.toUpperCase()), m);
      // só os 5 passos da rampa + cinza "sem dado"; os 5 passos presentes
      assert.deepEqual(Object.keys(used).filter(c => c !== '#525254').sort(), [...ramp].sort(), m);
    }
  }
  await mode('concessoes');
  const keys = await page.$$eval('#layers-section input[data-layer]', is => is.map(i => i.dataset.layer));
  for (const k of keys) await setLayer(page, k, true);
  const used = await page.evaluate(() => Layers.colorsUsed());
  for (const [k, cs] of Object.entries(used)) for (const c of cs) assert.ok(tokens.has(c), `${k}: ${c}`);
  const D = await page.evaluate(() => Object.fromEntries(Object.entries(DATA).map(([k, v]) => [k, v.toUpperCase()])));
  const R = await page.evaluate(() => [...Object.values(ROTAS), ...Object.values(ROTAS_EXTRA).map(x => x.color)].map(c => c.toUpperCase()));
  const expect = { ferrovias: [D.yellow], portos: [D.violet, '#F7F7F8'], siade: [D.red], sats: [D.aqua], obras: [D.orange],
    estaduais: [D.green, D.magenta, '#231F20'], pracas: ['#0071BB', '#F7F7F8'], rotas: [...new Set([...R, '#F7F7F8', '#525254'])] };
  for (const [k, cs] of Object.entries(expect)) {
    if (!keys.includes(k)) continue;
    assert.deepEqual([...used[k]].sort(), [...cs].sort(), k);
  }
  for (const k of keys) await setLayer(page, k, false);
});

// ---------- v3.1, Task 4: Rotas de Integração Sul-Americana ----------
const rotasBox = () => page.locator('#layers-section input[data-layer="rotas"]');
const rectOf = (p, sel) => p.$$eval(sel, es => es.map(e => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, text: e.textContent.trim() }; }));
const overlap = (a, b) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
// Fim do enquadramento: nenhuma animação de zoom em curso e a vista já na área das rotas (sul além de -42°; a do Brasil para em -38°)
// ou de volta ao Brasil.
const naAreaDasRotas = (p = page) => p.waitForFunction(() => !MapView.zoomAnimando() && MapView.map.getBounds().getSouth() < -42);
const noBrasil = (p = page) => p.waitForFunction(() => !MapView.zoomAnimando() && MapView.map.getBounds().getSouth() > -42);


test('rotas: ligar mostra países, linhas, rótulos diretos e legenda; enquadra a América do Sul; desligar volta ao Brasil', async t => {
  await page.evaluate(() => { location.hash = '#mapa'; });
  await page.waitForFunction(() => Tabs.current().active === 'mapa');
  await page.evaluate(() => MapView.fitBrasil(false));
  await page.waitForFunction(() => !MapView.zoomAnimando());
  const b0 = await page.evaluate(() => MapView.map.getBounds().toBBoxString().split(',').map(Number));
  const R = await page.evaluate(() => window.INTEL.rotas.rotas.map(r => ({ id: r.id, t: `Rota ${r.n} · ${r.nome}`, c: ROTAS[r.id] })));
  assert.equal(R.length, 5);
  // grupo próprio no painel Camadas, desligado, com fonte no title e no texto oculto
  const g = await page.textContent('#layers-section .rotas-group');
  assert.match(g, /Rotas de Integração Sul-Americana/);
  assert.ok(g.includes(A.notaRotas), A.notaRotas);
  assert.equal(await rotasBox().isChecked(), false);
  const title = await page.locator('#layers-section label:has(input[data-layer="rotas"])').getAttribute('title');
  assert.ok(A.apresentacao);
  assert.match(title, new RegExp(`MPO .*${A.apresentacao}.*traçado esquemático`));
  assert.equal(await page.textContent('#layer-src-rotas'), `Fonte: ${title}`);
  // ligar em menos de 400 ms (a 1ª vez é medida no teste "(g) ligar cada camada")
  await settle(page);
  const ms = await page.evaluate(() => new Promise(resolve => {
    const t0 = performance.now();
    document.querySelector('#layers-section input[data-layer="rotas"]').click();
    requestAnimationFrame(() => requestAnimationFrame(() => resolve(performance.now() - t0)));
  }));
  t.diagnostic(`rotas: ${ms.toFixed(0)} ms`);
  assert.ok(ms < 400, `rotas: ${ms.toFixed(0)} ms`);
  await naAreaDasRotas();
  assert.equal(await page.evaluate(() => Layers.isOn('rotas')), true);
  assert.ok(await page.evaluate(() => Layers.count('rotas')) > 0);
  // enquadra o Brasil e as linhas das rotas (oeste além de -70°), zoom ≥ 4, com a Patagônia cortada como no mapa do MPO
  const b1 = await page.evaluate(() => MapView.map.getBounds().toBBoxString().split(',').map(Number));
  assert.ok(b1[0] < -70, b1.join());
  assert.ok(b1[1] > -52, `Patagônia inteira: ${b1.join()}`);
  assert.equal(await page.evaluate(() => MapView.map.getBounds().contains(IntelModel.rotasBounds(window.INTEL.rotas, true))), true);
  assert.ok(await page.evaluate(() => MapView.map.getZoom()) >= 4);
  // malha federal esmaecida enquanto as rotas estão ligadas
  assert.equal(await page.evaluate(() => MapView.baseDimmed()), true);
  assert.ok(await page.evaluate(() => MapView.maxLineOpacity()) <= 0.35 + 1e-9);
  // países vizinhos com rótulo; cores só de tokens (rotas, extras, Snow White, Light Grey)
  assert.equal(await page.locator('.leaflet-tooltip.pais-label').count(), await page.evaluate(() => window.INTEL.rotas.paises.length));
  assert.match(await page.textContent('.leaflet-pane'), /Argentina/);
  // legenda própria: as 5 rotas, os 4 elementos extras e a nota
  await page.waitForSelector('#rotas-legend:not([hidden])');
  assert.deepEqual(await page.$$eval('#rotas-legend [data-rota]', bs => bs.map(b => b.textContent.trim())), R.map(r => r.t));
  const lt = await page.textContent('#rotas-legend');
  for (const re of [/Hidrovia/, /Cabotagem/, /Trecho em pavimentação/, /Trecho em estudos/]) assert.match(lt, re);
  assert.ok(lt.includes(A.notaRotas));
  assert.doesNotMatch(lt, /undefined|NaN/);
  // recolhível como "Camadas", aberta por padrão, sem título dentro do <summary>
  assert.equal(await page.locator('#rotas-legend details[open]').count(), 1);
  assert.equal((await page.textContent('#rotas-legend summary')).trim(), 'Rotas de Integração');
  assert.equal(await page.locator('#rotas-legend summary :is(h1, h2, h3, h4)').count(), 0);
  await page.click('#rotas-legend summary');
  assert.equal(await page.isVisible('#rotas-legend [data-rota="0"]'), false);
  await page.click('#rotas-legend summary');
  assert.equal(await page.isVisible('#rotas-legend [data-rota="0"]'), true);
  // rótulo direto em cada rota: texto na cor de texto (Spacial Grey), ≥ 14 px, amostra na cor da rota
  const labs = await page.$$eval('.leaflet-tooltip.rota-label', es => es.map(e => {
    const cs = getComputedStyle(e), sw = e.querySelector('.rota-label__sw');
    return { text: e.textContent.trim(), color: cs.color, size: parseFloat(cs.fontSize), sw: sw ? getComputedStyle(sw).backgroundColor : null };
  }));
  const rgb = h => `rgb(${[1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)).join(', ')})`;
  assert.deepEqual(labs.map(l => l.text), R.map(r => r.t));
  for (const [k, l] of labs.entries()) {
    assert.equal(l.color, 'rgb(35, 31, 32)', l.text);
    assert.ok(l.size >= 14, l.text);
    assert.equal(l.sw, rgb(R[k].c), l.text);
  }
  // no enquadramento da América do Sul, os rótulos ficam dentro do mapa e fora das legendas e dos botões
  const map = (await rectOf(page, '#map'))[0], boxes = [...await rectOf(page, '#rotas-legend'), ...await rectOf(page, '#legend'), ...await rectOf(page, '#map-controls')];
  const lr = await rectOf(page, '.leaflet-tooltip.rota-label');
  for (const l of lr) {
    assert.ok(l.l >= map.l && l.r <= map.r && l.t >= map.t && l.b <= map.b, `${l.text} fora do mapa`);
    for (const b of boxes) assert.ok(!overlap(l, b), `${l.text} sob uma legenda`);
    for (const o of lr) if (o !== l) assert.ok(!overlap(l, o), `${l.text} × ${o.text}`);
  }
  // rótulos dos países: acima das linhas das rotas (pane), com halo claro, sem cobrir rótulos de rota nem uns aos outros
  const pr = await rectOf(page, '.leaflet-tooltip.pais-label');
  for (const l of pr) {
    for (const o of lr) assert.ok(!overlap(l, o), `${l.text} × ${o.text}`);
    for (const o of pr) if (o !== l) assert.ok(!overlap(l, o), `${l.text} × ${o.text}`);
  }
  const pane = await page.evaluate(() => {
    const z = n => Number(getComputedStyle(MapView.map.getPane(n)).zIndex), e = document.querySelector('.leaflet-tooltip.pais-label');
    return { pais: z('l-paisLabels'), rotas: z('l-rotas'), rotulos: z('l-rotasLabels'), dentro: MapView.map.getPane('l-paisLabels').contains(e), sombra: getComputedStyle(e).textShadow };
  });
  assert.ok(pane.dentro && pane.pais > pane.rotas && pane.pais < pane.rotulos, JSON.stringify(pane));
  assert.match(pane.sombra, /rgb\(247, 247, 248\)/);
  // desligar: legenda e rótulos somem, volta ao Brasil
  await rotasBox().uncheck();
  await noBrasil();
  assert.equal(await page.isHidden('#rotas-legend'), true);
  assert.equal(await page.evaluate(() => MapView.baseDimmed()), false);
  assert.equal(await page.evaluate(() => MapView.maxLineOpacity()), 1);
  assert.equal(await page.locator('.leaflet-tooltip.rota-label').count(), 0);
  assert.equal(await page.locator('.leaflet-tooltip.pais-label').count(), 0);
  const b2 = await page.evaluate(() => MapView.map.getBounds().toBBoxString().split(',').map(Number));
  b2.forEach((v, k) => assert.ok(Math.abs(v - b0[k]) < 0.5, `${b2.join()} != ${b0.join()}`));
  assert.deepEqual(errors, []);
});

test('rotas: clique real numa linha da Rota 4 abre o cartão; rótulo e legenda também abrem; desligar fecha', async () => {
  await rotasBox().check();
  await naAreaDasRotas();
  // vértice da Rota 4 mais distante das outras rotas, com zoom para não haver ambiguidade
  const xy = await page.evaluate(() => {
    const ls = IntelModel.rotaLinhas(window.INTEL.rotas);
    const outras = ls.filter(l => l.rota !== 'r4').flatMap(l => l.ll);
    let best = null, bd = -1;
    for (const l of ls.filter(x => x.rota === 'r4' && x.tipo === 'rota')) for (const p of l.ll) {
      const d = Math.min(...outras.map(o => Math.hypot(o[0] - p[0], o[1] - p[1])));
      if (d > bd) { bd = d; best = p; }
    }
    MapView.map.setView(best, 7, { animate: false });
    const c = MapView.map.latLngToContainerPoint(best), r = MapView.map.getContainer().getBoundingClientRect();
    return [r.left + c.x, r.top + c.y];
  });
  await page.mouse.move(xy[0], xy[1]);
  await page.waitForSelector('.leaflet-tooltip.pt-tip');
  assert.match(await page.textContent('.leaflet-tooltip.pt-tip'), /Rota 4 · Bioceânica de Capricórnio · traçado esquemático/);
  await page.mouse.click(xy[0], xy[1]);
  await page.waitForSelector('#card:not([hidden])');
  const t = await page.textContent('#card');
  for (const re of [/Rota 4 · Bioceânica de Capricórnio/, /Traçado esquemático/, /Paraguai/, /MS, SP, PR, SC/, /BR-267/,
    /Porto Murtinho/, /Rio Paraguai/, /Ponte binacional/, /Fonte: MPO/, /não é o eixo das vias/]) assert.match(t, re);
  assert.doesNotMatch(t, /undefined|NaN/);
  const url = await page.evaluate(() => window.INTEL.rotas.rotas[3].fonte_url);
  assert.equal(await page.getAttribute(`#card a[href="${url}"]`, 'target'), '_blank');
  assert.deepEqual(await page.evaluate(() => Layers.selected()), { key: 'rotas', i: 3 });
  assert.ok((await page.evaluate(() => Layers.colorsUsed().selecao)).includes('#E34948'));
  // rótulo direto da Rota 2 abre o cartão dela
  await page.evaluate(() => MapView.fitAmericaSul(false));
  await naAreaDasRotas();
  await page.click('.leaflet-tooltip.rota-label:has-text("Rota 2")');
  await page.waitForFunction(() => /Amazônica/.test(document.querySelector('#card .card__title').textContent));
  assert.deepEqual(await page.evaluate(() => Layers.selected()), { key: 'rotas', i: 1 });
  // legenda: botão por rota, acessível pelo teclado
  await page.focus('#rotas-legend [data-rota="4"]');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => /Bioceânica do Sul/.test(document.querySelector('#card .card__title').textContent));
  // desligar a camada fecha o cartão da rota e limpa a seleção
  await rotasBox().uncheck();
  await noBrasil();
  assert.equal(await page.isHidden('#card'), true);
  assert.equal(await page.evaluate(() => Layers.selected()), null);
  assert.deepEqual(errors, []);
});

// Clica no checkbox das rotas e, no início da animação de zoom que esse clique dispara, clica de novo `extra` vezes.
// Devolve se zoomAnimando() já marcava a animação nesse momento.
const togglesDuranteAnimacao = (extra) => page.evaluate(n => new Promise(res => {
  const box = document.querySelector('#layers-section input[data-layer="rotas"]');
  MapView.map.once('zoomanim', () => { const a = MapView.zoomAnimando(); for (let k = 0; k < n; k++) box.click(); res(a); });
  box.click();
}), extra);
// A vista continua a mesma depois de alguns quadros (nenhum enquadramento pendente mudou a vista depois da espera).
const vistaEstavel = async () => {
  const b = () => page.evaluate(() => MapView.map.getBounds().toBBoxString());
  const b1 = await b();
  await page.waitForTimeout(600);
  assert.equal(await page.evaluate(() => MapView.zoomAnimando()), false);
  assert.equal(await b(), b1);
};

test('enquadramento repetido: o último pedido feito durante a animação de zoom vale (ligar/desligar as rotas em seguida)', async () => {
  await page.evaluate(() => { location.hash = '#mapa'; });
  await page.waitForFunction(() => Tabs.current().active === 'mapa');
  assert.equal(await rotasBox().isChecked(), false);
  await page.evaluate(() => MapView.fitBrasil(false));
  await noBrasil();
  assert.equal(await page.evaluate(() => MapView.zoomAnimando()), false);
  // ligar e, com a animação em curso, desligar: termina no Brasil (o Leaflet sozinho descartaria o 2º enquadramento)
  assert.equal(await togglesDuranteAnimacao(1), true);
  assert.equal(await rotasBox().isChecked(), false);
  await noBrasil();
  await vistaEstavel();
  assert.ok(await page.evaluate(() => MapView.map.getBounds().getSouth()) > -42);
  // ligar e esperar; depois desligar e, com a animação em curso, religar: termina na área das rotas
  await rotasBox().check();
  await naAreaDasRotas();
  assert.equal(await togglesDuranteAnimacao(1), true);
  assert.equal(await rotasBox().isChecked(), true);
  await naAreaDasRotas();
  await vistaEstavel();
  assert.equal(await page.evaluate(() => MapView.map.getBounds().contains(IntelModel.rotasBounds(window.INTEL.rotas, true))), true);
  // desligar e, durante a mesma animação, três pedidos (liga, desliga, liga): vale o último, a área das rotas
  assert.equal(await togglesDuranteAnimacao(3), true);
  assert.equal(await rotasBox().isChecked(), true);
  await naAreaDasRotas();
  await vistaEstavel();
  await rotasBox().uncheck();
  await noBrasil();
  assert.deepEqual(errors, []);
});

test('sem o bloco rotas: sem grupo no painel, "enquadrar a América do Sul" cai no Brasil, sem erros', async () => {
  const errs = [], ext = [];
  const inject = html => {
    const i = html.indexOf('</script>', html.indexOf('window.INTEL='));
    return `${html.slice(0, i)};delete window.INTEL.rotas;${html.slice(i)}`;
  };
  const p = await openPage(errs, ext, inject);
  assert.equal(await p.locator('#layers-section .rotas-group').count(), 0);
  assert.equal(await p.locator('#layers-section input[data-layer="rotas"]').count(), 0);
  const b0 = await p.evaluate(() => MapView.map.getBounds().toBBoxString());
  await p.evaluate(() => MapView.fitAmericaSul(false));
  assert.equal(await p.evaluate(() => MapView.map.getBounds().toBBoxString()), b0);
  assert.deepEqual(errs, []);
  assert.deepEqual(ext, []);
  await p.context().close();
});

// ---------- v3.1, Task 5: VMDa 2025 no front ----------
// Cores das estaduais (camada ligada) e classes desenhadas.
const estColors = p => p.evaluate(() => (Layers.colorsUsed().estaduais || []).slice().sort());
const closeTo = (a, b, eps = 1e-9) => assert.ok(Number.isFinite(a) && Math.abs(a - b) < eps, `${a} != ${b}`);

test('VMDa 2025: no modo Tráfego, as estaduais (camada ligada) usam a rampa e as classes federais; sem dado em cinza fino', async t => {
  await page.evaluate(() => { location.hash = '#mapa'; });
  await page.waitForFunction(() => Tabs.current().active === 'mapa');
  await mode('trafego');
  await settle(page);
  const box = layerBox('estaduais');
  // 1ª vez no modo Tráfego: monta a malha e as classes
  const ms = await page.evaluate(() => new Promise(resolve => {
    const t0 = performance.now();
    document.querySelector('#layers-section input[data-layer="estaduais"]').click();
    requestAnimationFrame(() => requestAnimationFrame(() => resolve(performance.now() - t0)));
  }));
  t.diagnostic(`estaduais no modo Tráfego (1ª vez): ${ms.toFixed(0)} ms`);
  assert.ok(ms < 600, `levou ${ms.toFixed(0)} ms`);
  assert.equal(await box.isChecked(), true);
  const r = await page.evaluate(() => {
    const et = IntelModel.estTrafego(window.INTEL), br = MapView.classes('trafego').breaks, exp = {};
    const dec = window.INTEL.estaduais.malha.p.map(IntelModel.decodeLine);
    et.t.forEach((v, i) => { if (dec[i].length >= 2) { const c = IntelModel.classOf(v, br); exp[c] = (exp[c] || 0) + 1; } });
    return { got: Layers.estTrafego(), exp, n: et.t.filter(x => x != null).length };
  });
  // classes = classOf(VMDa 2025 estadual, quebras federais), linha a linha
  assert.deepEqual(r.got.porClasse, r.exp);
  assert.equal(r.got.n, r.n);
  assert.equal(r.got.ano, A.v25);
  for (let c = 0; c < 5; c++) assert.ok(r.exp[c] > 0, `classe ${c} vazia`);
  // cores: os 5 passos da rampa do Tráfego, cinza sem dado, concessões estaduais (magenta + halo); sem o verde da malha
  const T = await page.evaluate(() => RAMPS.trafego.map(c => c.toUpperCase()));
  const D = await page.evaluate(() => DATA);
  assert.deepEqual(await estColors(page), [...T, '#525254', D.magenta.toUpperCase(), '#231F20'].sort());
  // sem dado: cinza fino contínuo (o federal é tracejado)
  assert.deepEqual(await page.evaluate(() => Layers.EST_NONE), { color: '#525254', weight: 0.75, opacity: 0.5 });
  // legenda: inclui as estaduais, faixas cobrem também os valores estaduais, linha "Sem dado (estadual)"
  const lg = await legend();
  assert.ok(lg.toLowerCase().includes(`inclui rodovias estaduais (vmda ${A.v25})`), lg);
  assert.match(lg, /Sem dado \(federal\)/);
  assert.match(lg, /Sem dado \(estadual\)/);
  assert.equal(await page.locator('#legend .legend__row[data-class]').count(), 5);
  const rows = await page.$$eval('#legend .legend__row[data-class] .legend__range', es => es.map(e => e.textContent));
  const lim = await page.evaluate(() => {
    const q = MapView.classes('trafego'), e = Layers.estTrafego();
    return [IntelModel.fmtInt(Math.min(q.min, e.min)), IntelModel.fmtInt(Math.max(q.max, e.max))];
  });
  assert.equal(rows[0].split(' – ')[0], lim[0]);
  assert.equal(rows[4].split(' – ')[1], lim[1]);
  assert.equal(await page.getAttribute('#legend [data-est-none] svg line', 'stroke'), '#525254');
  assert.equal(await page.getAttribute('#legend [data-est-none] svg line', 'stroke-dasharray'), null);
  // espessura acompanha o zoom como a federal, × 0,55 da federal na mesma classe (classe 4: federal 6 px × zoomFactor,
  // estadual 6 × 0,55 × zoomFactor); a malha federal continua a rede principal
  assert.equal(await page.evaluate(() => EST_TRAF.weightFactor), 0.55);
  await page.evaluate(() => { MapView.map.setZoom(7, { animate: false }); });
  await page.waitForTimeout(100);
  const w = await page.evaluate(() => {
    const est = [], fed = [];
    MapView.map.eachLayer(l => {
      const r = l.options && l.options.renderer;
      if (!(l instanceof L.Polyline) || !r || l.options.color !== RAMPS.trafego[4]) return;
      (r.options.pane === 'l-estaduais' ? est : fed).push(l.options.weight);
    });
    return { est, fed: [...new Set(fed)], f: zoomFactor(MapView.map.getZoom()) };
  });
  assert.ok(w.est.length === 1 && Math.abs(w.est[0] - 6 * 0.55 * w.f) < 1e-9, JSON.stringify(w));
  assert.ok(w.fed.length === 1 && Math.abs(w.fed[0] - 6 * w.f) < 1e-9, JSON.stringify(w));
  closeTo(w.est[0] / w.fed[0], 0.55);
  // demais classes: mesma razão (pesos-base da rampa × 0,55); sem dado estadual fica com a espessura própria (0,75 px)
  const wc = await page.evaluate(() => {
    const out = {};
    MapView.map.eachLayer(l => {
      const r = l.options && l.options.renderer;
      if (l instanceof L.Polyline && r && r.options.pane === 'l-estaduais') out[l.options.color] = l.options.weight;
    });
    return { out, f: zoomFactor(MapView.map.getZoom()), base: QUANT_STYLES.map(s => s.weight) };
  });
  for (let c = 0; c < 5; c++) closeTo(wc.out[(await page.evaluate(k => RAMPS.trafego[k], c))], wc.base[c] * 0.55 * wc.f);
  closeTo(wc.out['#525254'], 0.75 * wc.f);
  await page.evaluate(() => MapView.fitBrasil(false));
  // outro modo: estaduais voltam ao verde e a legenda não fala delas; de volta ao Tráfego, coloridas de novo
  await mode('pesados');
  assert.deepEqual(await estColors(page), [D.green.toUpperCase(), D.magenta.toUpperCase(), '#231F20'].sort());
  assert.doesNotMatch(await legend(), /estaduais/i);
  await mode('trafego');
  assert.ok((await estColors(page)).includes(T[4]));
  // desligar a camada no modo Tráfego tira as estaduais da legenda; religar volta
  await box.uncheck();
  await page.waitForTimeout(50);
  assert.doesNotMatch(await legend(), /estaduais/i);
  assert.equal(await page.evaluate(() => Layers.estTrafego()), null);
  await box.check();
  await page.waitForTimeout(50);
  assert.ok((await legend()).toLowerCase().includes(`inclui rodovias estaduais (vmda ${A.v25})`));
  await box.uncheck();
  await mode('concessoes');
  assert.deepEqual(errors, []);
});

test('VMDa 2025: sem o bloco vmda2025 tudo volta ao VMDa 2023, sem erros', async () => {
  const errs = [], ext = [];
  const inject = html => {
    const i = html.indexOf('</script>', html.indexOf('window.INTEL='));
    return `${html.slice(0, i)};delete window.INTEL.vmda2025;${html.slice(i)}`;
  };
  const p = await openPage(errs, ext, inject);
  assert.equal(await p.evaluate(() => window.INTEL.vmda2025), undefined);
  // painel: veíc·km do 2023 (leves + pesados), rotulado 2023, pesados sem "estimativa"
  const a = await p.evaluate(() => {
    const all = new Uint8Array(window.SNV.fis.length).fill(1), x = IntelModel.aggregateIntel(window.INTEL, window.SNV, all), v = window.INTEL.trafego.vmda;
    let s = 0;
    for (let j = 0; j < all.length; j++) { const t = IntelModel.sumNullable(v.l[j], v.p[j]); if (t != null) s += t * window.SNV.fis[j].ext; }
    return { fmt: IntelModel.fmtVkm(x.vkm), ok: Math.abs(s - x.vkm) < 1e-6 * s, ano: x.anoVmda };
  });
  assert.equal(a.ano, A.v23);
  assert.ok(a.ok);
  assert.equal((await p.textContent('#kpi-vkm')).trim(), a.fmt);
  const sub = await p.locator('#kpi-vkm').evaluate(e => e.nextElementSibling.textContent);
  assert.ok(sub.includes(`pesados · Tráfego VMDa ${A.v23}, modelado`), sub);
  assert.doesNotMatch(sub, /estimativa/);
  // modo Tráfego: legenda 2023, estaduais continuam verdes e fora da legenda
  await p.click('#legend [data-mode="trafego"]');
  assert.ok((await p.textContent('#legend .legend__title')).includes(`VMDa ${A.v23}, modelado`));
  assert.ok((await p.textContent('#legend .legend__src')).includes(`Infra S.A./DNIT, VMDa ${A.v23}`));
  assert.equal(await p.locator('#legend .legend__row[data-class]').count(), 5);
  await p.locator('#layers-section input[data-layer="estaduais"]').check();
  await p.waitForTimeout(50);
  assert.equal(await p.evaluate(() => Layers.estTrafego()), null);
  assert.ok((await estColors(p)).includes((await p.evaluate(() => DATA.green)).toUpperCase()));
  assert.doesNotMatch(await p.textContent('#legend'), /estaduais/i);
  // cartão: sem bloco 2025 nem sentidos; veíc·km no bloco 2023
  const j = await p.evaluate(() => { const v = window.INTEL.trafego.vmda; return window.SNV.fis.findIndex((_, j) => v.l[j] > 0 && v.p[j] > 0); });
  await p.evaluate(j => MapView.pick(j), j);
  await p.waitForSelector('#card:not([hidden])');
  const t = await p.textContent('#card');
  assert.doesNotMatch(t, new RegExp(`VMDa ${A.v25}|Sentido crescente|uso restrito|estimativa`));
  assert.ok(t.includes(`VMDa ${A.v23} · modelado · leves e pesados`));
  assert.match(t, /Veículos × extensão/);
  // aba Tráfego: só o veíc·km federal 2023, sem o estadual
  await goTab(p, '#trafego');
  assert.equal(await p.textContent('#kpi-vkm b'), a.fmt);
  assert.ok((await p.textContent('#kpi-vkm span')).includes(`VMDa ${A.v23}, modelado`));
  assert.equal(await p.locator('#kpi-vkm-est').count(), 0);
  assert.doesNotMatch(await p.textContent('#page-trafego'), new RegExp(`undefined|NaN|VMDa ${A.v25}`));
  assert.deepEqual(errs, []);
  assert.deepEqual(ext, []);
  await p.context().close();
});

// ---------- v3.1, revisão final: rotas × camadas temáticas, rótulos em telas menores ----------
test('rotas ligadas: malha federal e camadas temáticas (estaduais no Tráfego inclusive) a ≤ 0,35; desligar restaura; × 0,55 mantido', async () => {
  await page.evaluate(() => { location.hash = '#mapa'; });
  await page.waitForFunction(() => Tabs.current().active === 'mapa');
  await mode('trafego');
  const DIM = await page.evaluate(() => ROTAS_DIM);
  assert.equal(DIM.factor, 0.35);
  const keys = (await page.$$eval('#layers-section input[data-layer]', is => is.map(i => i.dataset.layer))).filter(k => k !== 'rotas');
  // com as rotas, todas as camadas de linha e ponto do painel ficam esmaecidas (fundo municipal e seleção ficam fora)
  assert.deepEqual([...keys].sort(), [...DIM.layers].filter(k => keys.includes(k)).sort());
  // uma camada ligada antes das rotas e as demais depois (construídas já com as rotas ligadas)
  await setLayer(page, 'estaduais', true);
  const antes = await page.evaluate(() => Layers.maxOpacity());
  assert.ok(antes.estaduais > 0.35, JSON.stringify(antes));
  await rotasBox().check();
  await naAreaDasRotas();
  for (const k of keys) await setLayer(page, k, true);
  const ws = () => page.evaluate(() => {
    const est = [], fed = new Set();
    MapView.map.eachLayer(l => {
      const r = l.options && l.options.renderer;
      if (!(l instanceof L.Polyline) || !r || l.options.color !== RAMPS.trafego[4]) return;
      if (r.options.pane === 'l-estaduais') est.push(l.options.weight); else fed.add(l.options.weight);
    });
    return { est, fed: [...fed] };
  });
  const check = async when => {
    const fed = await page.evaluate(() => MapView.maxLineOpacity()), op = await page.evaluate(() => Layers.maxOpacity());
    assert.ok(fed <= 0.35 + 1e-9, `${when}: federal ${fed}`);
    for (const k of keys) assert.ok(op[k] > 0 && op[k] <= 0.35 + 1e-9, `${when}: ${k} ${op[k]}`);
    // estaduais no modo Tráfego: esmaecidas com a federal e ainda × 0,55 da espessura federal na mesma classe
    if (await page.evaluate(() => MapView.colorMode()) === 'trafego') {
      assert.ok(await page.evaluate(() => !!Layers.estTrafego()), when);
      const w = await ws();
      assert.ok(w.est.length === 1 && w.fed.length === 1 && Math.abs(w.est[0] / w.fed[0] - 0.55) < 1e-9, `${when}: ${JSON.stringify(w)}`);
    }
  };
  await check('rotas + Tráfego');
  // trocar de modo com as rotas ligadas (malha estadual verde de volta, depois as classes refeitas) continua esmaecido
  await mode('pesados');
  await check('rotas + Pesados');
  await mode('trafego');
  await check('rotas + Tráfego de novo');
  // desligar e religar uma camada com as rotas ligadas não acumula o fator
  await setLayer(page, 'pracas', false);
  await setLayer(page, 'pracas', true);
  await check('praças religadas');
  // desligar as rotas restaura a opacidade original de tudo
  await rotasBox().uncheck();
  await noBrasil();
  assert.equal(await page.evaluate(() => MapView.maxLineOpacity()), 1);
  const depois = await page.evaluate(() => Layers.maxOpacity());
  assert.equal(depois.estaduais, antes.estaduais);
  for (const k of keys) assert.ok(depois[k] > 0.35, `${k} ${depois[k]}`);
  // valores originais (maior entre traço e preenchimento): praças, portos e SATs com traço opaco
  const st = await page.evaluate(() => ({ ferrovias: LAYER_STYLES.ferrovias.opacity, siade: LAYER_STYLES.siade.opacity,
    obras: LAYER_STYLES.obras.fillOpacity, pracas: 1, portos: 1, sats: 1 }));
  for (const [k, v] of Object.entries(st)) if (keys.includes(k)) assert.equal(depois[k], v, k);
  for (const k of keys) await setLayer(page, k, false);
  await mode('concessoes');
  assert.deepEqual(errors, []);
});

test('rotas em 1366 × 768 e 1280 × 720: nenhum rótulo de rota sob as legendas ou os botões; legenda das rotas recolhida e reabrível', async () => {
  for (const [w, h] of [[1366, 768], [1280, 720]]) {
    const errs = [], ext = [];
    const p = await openPage(errs, ext, null, { width: w, height: h });
    await p.locator('#layers-section input[data-layer="rotas"]').check();
    await naAreaDasRotas(p);
    await p.waitForFunction(() => !document.querySelector('#rotas-legend details').open);
    const map = (await rectOf(p, '#map'))[0];
    const boxes = [...await rectOf(p, '#rotas-legend'), ...await rectOf(p, '#legend'), ...await rectOf(p, '#map-controls')];
    const lr = await rectOf(p, '.leaflet-tooltip.rota-label');
    assert.equal(lr.length, 5);
    for (const l of lr) {
      assert.ok(l.l >= map.l && l.r <= map.r && l.t >= map.t && l.b <= map.b, `${w}: ${l.text} fora do mapa`);
      for (const b of boxes) assert.ok(!overlap(l, b), `${w}: ${l.text} sob uma legenda`);
      for (const o of lr) if (o !== l) assert.ok(!overlap(l, o), `${w}: ${l.text} × ${o.text}`);
    }
    // rótulos dos países: fora dos rótulos de rota e, com 2 px de folga, uns dos outros (Suriname e Guiana Francesa)
    const pr = await rectOf(p, '.leaflet-tooltip.pais-label');
    const folga2 = r => ({ l: r.l - 2, t: r.t - 2, r: r.r + 2, b: r.b + 2 });
    for (const l of pr) {
      for (const o of lr) assert.ok(!overlap(l, o), `${w}: ${l.text} × ${o.text}`);
      for (const o of pr) if (o !== l) assert.ok(!overlap(folga2(l), o), `${w}: ${l.text} × ${o.text}`);
    }
    // recolhida, mas a legenda continua lá: abre com um clique e mostra as 5 rotas
    assert.equal(await p.isVisible('#rotas-legend summary'), true);
    await p.click('#rotas-legend summary');
    assert.equal(await p.isVisible('#rotas-legend [data-rota="3"]'), true);
    assert.deepEqual(errs, []);
    assert.deepEqual(ext, []);
    await p.context().close();
  }
});

test('1366 × 768: a legenda do Tráfego não cobre o Brasil (nenhuma UF sob ela)', async () => {
  const errs = [], ext = [];
  const p = await openPage(errs, ext, null, { width: 1366, height: 768 });
  await p.click('#legend [data-mode="trafego"]');
  await p.waitForFunction(() => MapView.colorMode() === 'trafego');
  await p.evaluate(() => MapView.fitBrasil(false));
  await p.waitForFunction(() => !MapView.zoomAnimando());
  const leg = (await rectOf(p, '#legend'))[0], map = (await rectOf(p, '#map'))[0];
  assert.match(await p.textContent('#legend'), /Tráfego/);
  // caixa de cada UF na tela (dos polígonos do arquivo): à esquerda da legenda e dentro do mapa
  const ufs = await p.evaluate(() => {
    const r = MapView.map.getContainer().getBoundingClientRect();
    return window.SNV.ufs.features.map(f => {
      const b = L.geoJSON(f).getBounds(), nw = MapView.map.latLngToContainerPoint(b.getNorthWest()), se = MapView.map.latLngToContainerPoint(b.getSouthEast());
      return { text: f.properties.sigla, l: r.left + nw.x, t: r.top + nw.y, r: r.left + se.x, b: r.top + se.y };
    });
  });
  assert.equal(ufs.length, 27);
  for (const u of ufs) {
    assert.ok(!overlap(u, leg), `${u.text} sob a legenda: ${JSON.stringify(u)} × ${JSON.stringify(leg)}`);
    assert.ok(u.l >= map.l && u.r <= map.r && u.t >= map.t && u.b <= map.b, `${u.text} fora do mapa`);
  }
  // o Brasil continua grande: zoom ≥ 4
  assert.ok(await p.evaluate(() => MapView.map.getZoom()) >= 4);
  assert.deepEqual(errs, []);
  assert.deepEqual(ext, []);
  await p.context().close();
});

test('1366 × 768: a legenda das rotas reavalia o recolhimento quando a janela muda de tamanho; a escolha do leitor fica', async () => {
  const errs = [], ext = [];
  const p = await openPage(errs, ext, null, { width: 1366, height: 768 });
  const aberta = () => p.evaluate(() => document.querySelector('#rotas-legend details').open);
  const espera = v => p.waitForFunction(v => document.querySelector('#rotas-legend details').open === v, v);
  await p.locator('#layers-section input[data-layer="rotas"]').check();
  await naAreaDasRotas(p);
  await espera(false);
  // janela maior: os rótulos das rotas saem de baixo da legenda, que reabre; de volta a 1366 × 768, recolhe de novo
  await p.setViewportSize({ width: 1920, height: 1080 });
  await espera(true);
  const lr = await rectOf(p, '.leaflet-tooltip.rota-label'), leg = (await rectOf(p, '#rotas-legend'))[0];
  for (const l of lr) assert.ok(!overlap(l, leg), `1920: ${l.text} sob a legenda aberta`);
  await p.setViewportSize({ width: 1366, height: 768 });
  await espera(false);
  // o leitor abre a legenda: mudar o tamanho da janela não a recolhe
  await p.click('#rotas-legend summary');
  assert.equal(await aberta(), true);
  await p.setViewportSize({ width: 1360, height: 760 });
  await p.waitForTimeout(600);
  assert.equal(await aberta(), true);
  // religar a camada volta ao comportamento automático
  await p.locator('#layers-section input[data-layer="rotas"]').uncheck();
  await noBrasil(p);
  await p.locator('#layers-section input[data-layer="rotas"]').check();
  await naAreaDasRotas(p);
  await espera(false);
  await p.setViewportSize({ width: 1920, height: 1080 });
  await espera(true);
  assert.deepEqual(errs, []);
  assert.deepEqual(ext, []);
  await p.context().close();
});

test('fechamento: períodos e constantes impressas seguem os dados (dados alterados na página)', async () => {
  // valores originais (página sem alteração) e os mesmos deslocados 10 anos: nenhum ano esperado fica digitado aqui
  const o = await page.evaluate(() => {
    const c = window.CONC, m = c.mercado, I = window.INTEL;
    return { per: m.periodo_concorrencia.split('–').map(Number), anos: ConcModel.anosPrograma(c), pracas: I.antt.pracas.ano,
      vmda: I.trafego.vmda.ano, pnl: I.carga.ano_base, ap: I.rotas.fonte.find(f => /Apresentação/.test(f.nome)).periodo };
  });
  const D = 10, mais = a => a + D, novo = {
    per: o.per.map(mais).join('–'), anos: o.anos.map(mais), pracas: mais(o.pracas), vmda: mais(o.vmda), pnl: mais(o.pnl),
    ap: o.ap.replace(/(\d{4})$/, a => String(mais(+a))) };
  const errs = [], ext = [];
  // muda, antes de a interface montar, os valores que davam rótulos: nenhum deles pode estar digitado no código
  const inject = html => {
    const i = html.indexOf('</script>', html.indexOf('window.INTEL='));
    return `${html.slice(0, i)};(() => { const c = window.CONC, m = c.mercado, D = ${D}, I = window.INTEL;
      m.desagio_medio_impresso += 1.11; m.fontes.desagio_medio_impresso = [999]; m.periodo_concorrencia = ${JSON.stringify(novo.per)};
      for (const k of ['programa_por_ano', 'gestao', 'leiloes_por_ano']) m[k].forEach(x => { x.ano += D; });
      c.entidades.forEach(e => { if (e.ano_programa) e.ano_programa += D; });
      c.estudos.forEach(e => { e.pagina = 999; });
      I.antt.pracas.ano += D; I.trafego.vmda.ano += D; I.carga.ano_base += D;
      I.rotas.fonte.find(f => /Apresentação/.test(f.nome)).periodo = ${JSON.stringify(novo.ap)}; })();${html.slice(i)}`;
  };
  const p = await openPage(errs, ext, inject);
  const x = await p.evaluate(() => {
    const c = window.CONC, m = c.mercado, per = s => `${Math.min(...s.map(r => r.ano))}–${Math.max(...s.map(r => r.ano))}`;
    const nf2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return { prog: per(m.programa_por_ano), gestao: per(m.gestao), leiloes: per(m.leiloes_por_ano), anos: ConcModel.anosPrograma(c),
      media: nf2.format(m.desagio_medio_impresso), nEstudos: c.estudos.length };
  });
  assert.deepEqual(x.anos, novo.anos);
  await goTab(p, '#mercado');
  assert.equal(await p.textContent('#card-kpis h3'), `Concorrência nos leilões do programa federal, ${novo.per}`);
  assert.ok((await p.textContent('#card-kpis .sub')).includes(`programa federal ${x.prog} do Ministério`));
  assert.ok((await p.textContent('#card-desagio .sub')).endsWith(`(RoadShow, p. 999: ${x.media}%)`));
  assert.equal(await p.textContent('#card-faixas .sub'), `Leilões do programa federal em ${novo.per}, como impresso no RoadShow`);
  assert.ok((await p.textContent('#card-porN .sub')).startsWith(`Leilões do programa federal em ${novo.per}, como impresso no RoadShow;`));
  assert.equal(await p.textContent('#card-programa h3'), `Programa federal de concessões rodoviárias ${x.prog}, por ano`);
  assert.ok((await p.textContent('#card-indic h3')).includes(`programa federal de concessões rodoviárias ${x.prog} (`));
  assert.ok((await p.textContent('#card-leiloes .sub')).endsWith(`, ${x.leiloes}`));
  assert.ok((await p.textContent('#card-gestao .sub')).endsWith(`, ${x.gestao}`));
  await goTab(p, '#projetos');
  assert.deepEqual(await p.$$eval('#page-projetos .chip[data-f="ano"]', bs => bs.map(b => +b.dataset.v)), novo.anos);
  assert.ok((await p.textContent('#page-projetos .page__lead')).includes(`(contratos e programa ${novo.anos[0]}–${novo.anos[novo.anos.length - 1]})`));
  assert.ok((await p.textContent('#estudos-lead')).startsWith(`${x.nEstudos} estudos contratados para futuras concessões rodoviárias federais; o RoadShow (p. 999) só informa as BRs e UFs.`));
  await goTab(p, '#trafego');
  assert.ok((await p.textContent('#kpi-pracas span')).includes(`em ${novo.pracas}`));
  assert.equal(await p.textContent('#card-t-rank h3'), `As 20 praças de pedágio federais de maior VMD em ${novo.pracas}`);
  await goTab(p, '#fontes');
  const prosa = await p.textContent('.fontes-nota');
  assert.ok(prosa.includes(`Infra S.A. (${novo.vmda})`) && prosa.includes(`ano-base ${novo.pnl}`), prosa);
  await p.evaluate(() => { location.hash = '#mapa'; });
  await p.waitForFunction(() => Tabs.current().active === 'mapa');
  assert.deepEqual(await p.$$eval('input[data-cfilter="ano"]', is => is.map(i => +i.value)), novo.anos);
  assert.ok((await p.locator('#layers-section label:has(input[data-layer="rotas"])').getAttribute('title')).includes(`apresentação de ${novo.ap}`));
  assert.deepEqual(errs, []);
  assert.deepEqual(ext, []);
});

// ---------- Aba Debêntures ----------
const fmt2 = v => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const diaMes = d => d.split('-').slice(1).reverse().join('/');
const limpa = t => t.replace(/\s+/g, ' ').trim();
const blocoDeb = p => p.evaluate(() => JSON.parse(JSON.stringify(window.INTEL.debentures)));
// Abre a aba com "ver somado" desligado e o filtro de subsetor em "Todos", qualquer que seja o estado deixado por um teste anterior.
async function abreDeb() {
  await goTab(page, '#debentures');
  if ((await page.getAttribute('#deb-somado', 'aria-checked')) === 'true') await page.click('#deb-somado');
  if ((await page.getAttribute('#deb-em-sub-todos', 'aria-checked')) !== 'true') await page.click('#deb-em-sub-todos');
}
const AFETADOS = ['kpis', 'dia-vol', 'dia-n', 'subsetor', 'emissor', 'ultimo', 'ind-spread'];
// Média ponderada recombinada à mão a partir das linhas cruas (independente do modelo).
const recombina = (linhas, ix) => {
  let a = 0, w = 0;
  for (const l of linhas) if (l && l.volume_taxa && l.volume_taxa[ix]) { a += l.taxa_media[ix] * l.volume_taxa[ix]; w += l.volume_taxa[ix]; }
  return w ? a / w : null;
};
const fotoDeb = p => p.evaluate(afetados => {
  const t = s => [...document.querySelectorAll(s)].map(e => e.textContent.replace(/\s+/g, ' ').trim());
  return { status: t('#deb-status')[0], aria: document.getElementById('deb-somado').getAttribute('aria-checked'),
    rotulos: [...document.querySelectorAll('#page-debentures [data-afetado]')].map(c => `${c.id}|${c.querySelector('.deb-rotulo').textContent}`),
    corpo: Object.fromEntries(afetados.map(id => [id, document.getElementById('chart-d-' + id).innerHTML])),
    kpis: t('#chart-d-kpis .kpi-tile'), volTitulos: t('#chart-d-dia-vol rect.cbar title'), nTitulos: t('#chart-d-dia-n rect.cbar title'),
    tituloN: t('#titulo-d-dia-n')[0], tituloUltimo: t('#titulo-d-ultimo')[0], taxaSub: t('#chart-d-subsetor-taxa g.hrow-tip > title'), spreadSub: t('#chart-d-subsetor-spread g.hrow-tip > title'),
    emissor: t('#deb-emissores tbody tr'), ultimo: t('#deb-ultimo tbody tr'), cabEmissor: t('#deb-emissores thead th'),
    fixos: ['card-d-intencoes', 'card-d-emissoes', 'card-d-macro', 'card-d-ntnb', 'card-d-incentivadas', 'card-d-ind-evolucao', 'card-d-ind-papel'].map(id => document.getElementById(id).innerHTML) };
}, AFETADOS);

test('Debêntures: cartões com fonte, período e legenda; indicadores e curva vêm do bloco; sem NaN', async () => {
  await abreDeb();
  const b = await blocoDeb(page);
  // cartões presentes segundo o modelo: indicadores e curva só com dado; a série do RoadShow só se a base a traz
  const ids = await page.evaluate(() => {
    const b = window.INTEL.debentures;
    return [DebenturesModel.macro(b).length && 'macro', DebenturesModel.curvaNtnb(b).length && 'ntnb', 'emissoes', 'kpis', 'dia-vol', 'dia-n', 'subsetor',
      'emissor', 'ultimo', 'intencoes', 'ind-evolucao', 'ind-spread', 'ind-papel', DebenturesModel.serieIncentivadas(window.CONC.mercado) && 'incentivadas'].filter(Boolean);
  });
  assert.ok(ids.length >= 8, ids.join());
  assert.deepEqual(await page.$$eval('#page-debentures .ccard', cs => cs.map(c => c.id)), ids.map(i => 'card-d-' + i));
  for (const id of ids) {
    const c = page.locator('#card-d-' + id), txt = await c.textContent();
    assert.doesNotMatch(txt, /NaN|undefined|null|Infinity/, id);
    assert.match(await c.locator('.src').last().textContent(), /^Fonte: \S/, id);
    if (await c.locator('svg.chart').count()) assert.ok(await c.locator('.chart-legend').count() >= 1, `${id}: gráfico sem legenda`);
    const tit = await c.locator('svg.chart title').allTextContents();
    assert.ok(!tit.some(t => /NaN|undefined/.test(t)), id);
  }
  // indicadores macro com a data de cada um, na ordem do modelo
  const macro = await page.evaluate(() => DebenturesModel.macro(window.INTEL.debentures).map(m => [m.valor, m.data]));
  const tiles = await page.$$eval('#card-d-macro .kpi-tile', ts => ts.map(t => [t.querySelector('b').textContent, t.querySelector('span').textContent]));
  macro.forEach(([valor, data], i) => { assert.equal(tiles[i][0], valor); assert.ok(tiles[i][1].endsWith(data), `${tiles[i][1]} × ${data}`); });
  assert.equal(tiles.length, macro.length);
  if (b.macro.selic) assert.equal(macro.find(m => m[0].endsWith('a.a.'))[0], `${fmt2(b.macro.selic.valor)}% a.a.`);
  if (macro.length) for (const f of b.fonte.filter(x => /Banco Central/.test(x.nome))) assert.ok((await page.textContent('#card-d-macro')).includes(f.nome.split(' — ')[0]));
  // curva de NTN-B: uma linha por vencimento, com título e taxa; a data da curva no título
  const rows = await page.$$eval('#deb-ntnb tbody tr', trs => trs.map(tr => [...tr.children].map(td => td.textContent)));
  const curva = await page.evaluate(() => DebenturesModel.curvaNtnb(window.INTEL.debentures));
  assert.deepEqual(rows.map(r => r[2]), curva.map(p => fmt2(p.taxa)));
  assert.deepEqual(rows.map(r => r[0]), curva.map(p => p.vencimento.split('-').reverse().join('/')));
  if (curva.length) {
    assert.equal(await page.locator('#chart-d-ntnb-linha circle').count(), curva.length);
    const dataCurva = curva.map(p => p.data).sort().pop().split('-').reverse().join('/');
    assert.ok((await page.textContent('#titulo-d-ntnb')).endsWith(dataCurva));
  }
  // período dos negócios e a explicação do spread, em uma linha
  const per = `${b.secundario.periodo.de.split('-').reverse().join('/')} a ${b.secundario.periodo.ate.split('-').reverse().join('/')}`;
  assert.ok((await page.textContent('#card-d-kpis')).includes(per));
  const sp = limpa(await page.textContent('#deb-spread'));
  assert.match(sp, /spread = taxa do papel − taxa da NTN-B interpolada pelo vencimento/);
  assert.match(sp, /Tesouro Direto, taxa de compra; só para papéis IPCA\+; “—” quando não há curva no dia/);
  // links do glossário: os termos pedidos aparecem e existem no arquivo embutido
  const gl = await page.$$eval('#page-debentures a.glossario-link', as => as.map(a => decodeURIComponent(a.getAttribute('href').replace('#glossario/', ''))));
  for (const t of ['debenture', 'debenture-incentivada', 'debenture-infraestrutura', 'ntn-b', 'spread', 'duration', 'ipca-mais', 'cdi', 'selic', 'focus', 'mercado-secundario',
    'negocio-intencao', 'taxa-media-ponderada', 'rating', 'indexador']) assert.ok(gl.includes(t), t);
  assert.deepEqual(await page.evaluate(l => l.filter(i => !window.GLOSSARIO.some(e => e.id === i)), gl), []);
  assert.equal(new Set(gl).size, gl.length, 'um link por termo');
  // clareza: "tela" é definida na abertura; sem notas de ingestão repetidas; spread sempre dito "sobre a NTN-B"; p.p. explicado
  const aba = limpa(await page.textContent('#page-debentures'));
  assert.match(await page.textContent('#page-debentures .page__lead'), /telas<\/b>|telas das corretoras XP e BTG: as listas de debêntures/);
  assert.doesNotMatch(aba, /traz só a hora|fornecidos pelo usuário|enviad[oa] pelo usuário/);
  assert.match(aba, /pontos percentuais \(p\.p\.\)/);
  // a tabela por papel tem cabeçalhos curtos ("Spread painel (p.p.)"): o título do cartão é que diz "sobre a NTN-B"
  const cabSpread = await page.$$eval('#page-debentures th, #page-debentures h3, #page-debentures h4', es => es.filter(e => !e.closest('#deb-ind-papel')).map(e => e.textContent).filter(t => /pread/.test(t)));
  assert.ok(cabSpread.length >= 5);
  assert.ok(cabSpread.every(t => /NTN-B/.test(t)), cabSpread.join(' | '));
  assert.match(await page.textContent('#titulo-d-ind-papel'), /spread sobre a NTN-B/);
  assert.doesNotMatch(aba, /\bmetrô\)?[,.]? (e|ou) mobilidade|, metrô\)/);
  // curva de NTN-B: o eixo não começa em zero e traz a nota sobre isso
  const eixo = await page.$$eval('#chart-d-ntnb-linha svg text[text-anchor="end"]', ts => ts.map(t => Number(t.textContent.replace(',', '.'))));
  assert.ok(eixo[0] > 0 && eixo.length >= 3, eixo.join());
  assert.ok((await page.textContent('#card-d-ntnb .sub')).includes('não começa em zero'));
  // Resumo: a data-base do bloco é um intervalo de datas, não só o ano
  await goTab(page, '#resumo');
  await page.evaluate(() => document.querySelectorAll('#resumo-sobre details').forEach(d => { d.open = true; }));
  assert.match(await page.textContent('#sobre-table tr[data-fonte="debentures"] td:nth-child(2)'), /^\d{2}\/\d{2}\/\d{4} a \d{2}\/\d{2}\/\d{4}$/);
  await goTab(page, '#debentures');
  // a aba não mostra nenhuma linha de negócio ou intenção: só agregados e o último de cada papel
  assert.ok(await page.locator('#deb-ultimo tbody tr').count() <= b.secundario.ultimo_por_ticker.length);
});

test('Debêntures: tabela de emissões ordenável, com "—" onde a fonte não traz e exportação em CSV', async () => {
  await abreDeb();
  const b = await blocoDeb(page);
  const linhas = () => page.$$eval('#deb-emissoes tbody tr', trs => trs.map(tr => [...tr.children].map(td => td.textContent)));
  const cab = await page.$$eval('#deb-emissoes thead th', ths => ths.map(t => t.textContent.replace(/\s[↑↓]$/, '')));
  for (const c of ['Papel', 'Emissor', 'Subsetor', 'Indexador', 'Taxa na emissão', 'Vencimento', 'Volume emitido', 'Incentivada (Lei 12.431)']) assert.ok(cab.includes(c), c);
  // coluna que a fonte não preenche em nenhum papel fica oculta (e dita na nota); a que tem algum dado aparece
  const ocultas = await page.evaluate(() => DebenturesModel.tabelaEmissoes(window.INTEL.debentures).ocultas);
  assert.deepEqual(ocultas, ['Data de emissão', 'Coordenador líder'].filter(c => !b.emissoes.some(e => e[c === 'Coordenador líder' ? 'coordenador_lider' : 'data_emissao'])));
  for (const c of ocultas) { assert.ok(!cab.includes(c), c); assert.ok((await page.textContent('#card-d-emissoes')).includes(c)); }
  let r = await linhas();
  assert.equal(r.length, b.emissoes.length);
  assert.equal(await page.textContent('#deb-em-n'), `${b.emissoes.length} de ${b.emissoes.length} papéis`);
  const col = n => cab.indexOf(n);
  // campo ausente da fonte: "—"
  assert.equal(r.filter(x => x[col('Volume emitido')] === '—').length, b.emissoes.filter(e => e.volume_emitido == null).length);
  assert.equal(r.filter(x => x[col('Incentivada (Lei 12.431)')] === 'Sim').length, b.emissoes.filter(e => e.incentivada === true).length);
  // ordenar por volume emitido: o primeiro é o maior e os sem volume ficam no fim
  await page.click('#deb-emissoes [data-sort="volume_emitido"]');
  assert.equal(await page.getAttribute('#deb-emissoes th[aria-sort]', 'aria-sort'), 'descending');
  r = await linhas();
  const maior = Math.max(...b.emissoes.map(e => e.volume_emitido || 0));
  assert.equal(r[0][col('Papel')], b.emissoes.find(e => e.volume_emitido === maior).ticker);
  assert.equal(r[r.length - 1][col('Volume emitido')], '—');
  await page.click('#deb-emissoes [data-sort="volume_emitido"]');
  assert.equal(await page.getAttribute('#deb-emissoes th[aria-sort]', 'aria-sort'), 'ascending');
  // CSV: o que está na tela, com cabeçalho (o filtro de subsetor tem teste próprio, abaixo)
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('.csv-btn:has(+ .table-wrap #deb-emissoes)').click()]);
  assert.match(download.suggestedFilename(), /^debentures-emissoes-\d{4}-\d{2}-\d{2}\.csv$/);
  const csv = fs.readFileSync(await download.path(), 'utf8').split('\r\n');
  assert.equal(csv.length, b.emissoes.length + 1);
  assert.ok(csv[0].includes('"Papel";"Emissor"'));
});

test('Debêntures: filtro de subsetor e CSV, nota de incentivadas e datas de emissão', async () => {
  await abreDeb();
  const b = await blocoDeb(page);
  const linhas = () => page.$$eval('#deb-emissoes tbody tr', trs => trs.map(tr => [...tr.children].map(td => td.textContent)));
  const cab = () => page.$$eval('#deb-emissoes thead th', ths => ths.map(t => t.textContent.replace(/\s[↑↓]$/, '')));
  const m = await page.evaluate(() => {
    const e = window.INTEL.debentures.emissoes, D = DebenturesModel;
    return { c: D.contagemSubsetor(e), nota: D.notaIncentivadas(e), rod: D.filtrarSubsetor(e, 'rodovias').map(x => x.ticker), outros: D.filtrarSubsetor(e, 'outros').map(x => x.ticker) };
  });
  // grupo de botões acessível, com a contagem do modelo em cada rótulo
  assert.equal(await page.getAttribute('#deb-em-sub', 'role'), 'radiogroup');
  const rotulos = await page.$$eval('#deb-em-sub [role="radio"]', bs => bs.map(x => x.textContent));
  assert.deepEqual(rotulos, [`Todos (${m.c.todos})`, `Rodovias (${m.c.rodovias})`, `Outros transportes (${m.c.outros})`]);
  assert.equal(m.c.todos, b.emissoes.length);
  assert.equal(await page.getAttribute('#deb-em-sub-todos', 'aria-checked'), 'true');
  assert.equal(m.c.rodovias + m.c.outros, m.c.todos);
  // a nota fica acima da tabela e é a do modelo
  assert.equal(limpa(await page.textContent('#deb-em-incentivadas')), m.nota);
  assert.ok(await page.evaluate(() => document.getElementById('deb-em-incentivadas').compareDocumentPosition(document.getElementById('deb-emissoes')) & Node.DOCUMENT_POSITION_FOLLOWING));
  // datas de emissão em dd/mm/aaaa (a coluna sai sozinha se a fonte não traz nenhuma)
  const c0 = await cab(), iData = c0.indexOf('Data de emissão');
  const esperadas = b.emissoes.filter(e => e.data_emissao).map(e => e.data_emissao.split('-').reverse().join('/')).sort();
  assert.ok(esperadas.length > 0, 'o bloco traz datas de emissão (cadastro SND): sem elas este teste não verificaria nada');
  assert.ok(iData >= 0, 'a coluna "Data de emissão" aparece quando há datas');
  for (const r of await linhas()) assert.match(r[iData], /^(\d{2}\/\d{2}\/\d{4}|—)$/);
  assert.deepEqual((await linhas()).map(r => r[iData]).filter(x => x !== '—').sort(), esperadas);
  assert.ok(!c0.includes('Coordenadores'));
  const iSub = c0.indexOf('Subsetor');
  // cada botão: linhas na tela = modelo, CSV com o mesmo número de linhas e o filtro no nome do arquivo
  for (const [id, filtro, tickers] of [['rodovias', 'rodovias', m.rod], ['outros', 'outros', m.outros], ['todos', 'todos', null]]) {
    await page.click('#deb-em-sub-' + id);
    assert.equal(await page.getAttribute('#deb-em-sub-' + id, 'aria-checked'), 'true');
    assert.equal(await page.locator('#deb-em-sub [aria-checked="true"]').count(), 1);
    const r = await linhas(), esperado = m.c[filtro];
    assert.equal(r.length, esperado);
    assert.equal(await page.textContent('#deb-em-n'), `${esperado} de ${m.c.todos} papéis`);
    if (filtro === 'rodovias') assert.ok(r.every(x => x[iSub] === 'rodovias'));
    if (filtro === 'outros') assert.ok(r.every(x => x[iSub] !== 'rodovias'));
    if (tickers) assert.deepEqual(r.map(x => x[c0.indexOf('Papel')]).sort(), [...tickers].sort());
    const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('.csv-btn:has(+ .table-wrap #deb-emissoes)').click()]);
    assert.match(dl.suggestedFilename(), new RegExp(`^debentures-emissoes${filtro === 'todos' ? '' : '-' + filtro}-\\d{4}-\\d{2}-\\d{2}\\.csv$`));
    const csv = fs.readFileSync(await dl.path(), 'utf8').split('\r\n');
    assert.equal(csv.length, esperado + 1);
  }
  // teclado: seta para a direita escolhe o botão seguinte; End vai ao último e Home ao primeiro
  await page.focus('#deb-em-sub-todos');
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.getAttribute('#deb-em-sub-rodovias', 'aria-checked'), 'true');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'deb-em-sub-rodovias');
  await page.keyboard.press('End');
  assert.equal(await page.getAttribute('#deb-em-sub-outros', 'aria-checked'), 'true');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'deb-em-sub-outros');
  assert.equal((await linhas()).length, m.c.outros);
  await page.keyboard.press('Home');
  assert.equal(await page.getAttribute('#deb-em-sub-todos', 'aria-checked'), 'true');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'deb-em-sub-todos');
  assert.equal(await page.locator('#deb-em-sub [aria-checked="true"]').count(), 1);
  await page.click('#deb-em-sub-todos');
  assert.equal((await linhas()).length, m.c.todos);
  // celular 390 px: o filtro e a tabela não alargam a página
  const errs = [], ext = [];
  const p = await openPage(errs, ext, null, { width: 390, height: 844 });
  await goTab(p, '#debentures');
  await p.click('#deb-em-sub-rodovias');
  const w = await p.evaluate(() => {
    const pg = document.querySelector('.page:not([hidden])');
    return { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, aba: pg.scrollWidth - pg.clientWidth,
      pw: Math.max(...[...pg.querySelectorAll('*')].filter(e => !e.closest('.table-wrap, .chart-box')).map(e => e.scrollWidth - e.clientWidth)) };
  });
  assert.ok(w.sw <= w.cw && w.aba <= 0 && w.pw <= 0, JSON.stringify(w));
  assert.equal(await p.locator('#deb-emissoes tbody tr').count(), m.c.rodovias);
  assert.deepEqual(errs, []);
  assert.deepEqual(ext, []);
  await p.context().close();
});

test('Debêntures: números do mercado secundário batem com o modelo, com e sem somar', async () => {
  await abreDeb();
  const b = await blocoDeb(page);
  const neg = b.secundario.negocios, int = b.secundario.intencoes;
  const ant = await fotoDeb(page);
  assert.equal(ant.aria, 'false');
  assert.equal(ant.tituloUltimo, 'Último negócio de cada papel');
  assert.equal(ant.status, 'Mostrando: negócios fechados');
  // sem somar: um título por dia, direto do bloco
  assert.deepEqual(ant.volTitulos, neg.por_dia.map(d => `${diaMes(d.data)}: ${fmt2(d.volume / 1e6)} R$ mi`));
  assert.deepEqual(ant.nTitulos, neg.por_dia.map(d => `${diaMes(d.data)}: ${d.n} negócios`));
  const k = await page.evaluate(() => DebenturesModel.kpis(window.INTEL.debentures));
  assert.equal(k.n, neg.por_dia.reduce((t, d) => t + d.n, 0));
  assert.equal(ant.kpis[1], `${k.n.toLocaleString('pt-BR')}número de negócios`);
  assert.ok(ant.kpis[4].startsWith(`IPCA + ${fmt2(recombina(neg.por_dia, 'IPCA+'))}%`), ant.kpis[4]);
  assert.deepEqual(ant.ultimo.length, b.secundario.ultimo_por_ticker.filter(e => e.origem === 'negocio').length);
  assert.ok(ant.ultimo.every(l => /Negócio$/.test(l)));
  // somando: dias, volumes e operações recombinados a partir das duas listas, rótulo em todos os cartões afetados
  await page.click('#deb-somado');
  const som = await fotoDeb(page);
  const rotulo = 'negócios + intenções (somados como se fossem negócios)';
  assert.equal(som.aria, 'true');
  assert.equal(som.status, `Mostrando: ${rotulo}`);
  assert.deepEqual(som.rotulos, AFETADOS.map(id => `card-d-${id}|${rotulo}`));
  const dias = [...new Set([...neg.por_dia, ...int.por_dia].map(d => d.data))].sort();
  const dia = (l, d) => l.find(x => x.data === d);
  const soma = (d, c) => ((dia(neg.por_dia, d) || {})[c] || 0) + ((dia(int.por_dia, d) || {})[c] || 0);
  assert.deepEqual(som.volTitulos, dias.map(d => `${diaMes(d)}: ${fmt2(soma(d, 'volume') / 1e6)} R$ mi`));
  assert.deepEqual(som.nTitulos, dias.map(d => `${diaMes(d)}: ${soma(d, 'n')} negócios + intenções`));
  assert.equal(som.tituloN, 'Número de negócios + intenções por dia');
  assert.equal(som.tituloUltimo, 'Último negócio ou intenção de cada papel');
  // o CSV de quem soma leva "-somado" no nome
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('.csv-btn:has(+ .table-wrap #deb-ultimo)').click()]);
  assert.match(dl.suggestedFilename(), /^debentures-ultimo-por-papel-somado-\d{4}-\d{2}-\d{2}\.csv$/);
  const todas = [...neg.por_dia, ...int.por_dia];
  assert.ok(som.kpis[4].startsWith(`IPCA + ${fmt2(recombina(todas, 'IPCA+'))}%`), som.kpis[4]);
  assert.equal(som.kpis[1], `${(neg.por_dia.concat(int.por_dia).reduce((t, d) => t + d.n, 0)).toLocaleString('pt-BR')}número de negócios + intenções`);
  // taxa por subsetor: a mesma recombinação, feita à mão por subsetor
  for (const linha of som.taxaSub) {
    const [, nome, taxa] = linha.match(/^(.+?): ([\d,]+)%/);
    const esperado = recombina([...neg.por_subsetor, ...int.por_subsetor].filter(x => x.subsetor === nome), 'IPCA+');
    assert.equal(taxa, fmt2(esperado), nome);
  }
  assert.equal(som.taxaSub.length, new Set([...neg.por_subsetor, ...int.por_subsetor].map(x => x.subsetor)).size);
  // o último de cada papel agora considera também as intenções
  const tickers = new Set(b.secundario.ultimo_por_ticker.map(e => e.ticker));
  assert.equal(som.ultimo.length, tickers.size);
  assert.ok(som.ultimo.some(l => /Intenção de (compra|venda)$/.test(l)));
  // todos os cartões afetados mudaram; os demais não
  for (const id of AFETADOS) assert.notEqual(som.corpo[id], ant.corpo[id], `${id} não mudou`);
  assert.notDeepEqual(som.emissor, ant.emissor);
  assert.deepEqual(som.fixos, ant.fixos, 'intenções à parte, emissões, indicadores e curva não mudam');
  assert.equal(som.cabEmissor[3], 'Negócios + intenções');
  assert.doesNotMatch(JSON.stringify(som), /NaN|undefined/);
  // o modelo diz o mesmo da tela
  const m = await page.evaluate(() => DebenturesModel.series(window.INTEL.debentures, { somado: true }));
  assert.equal(m.rotulo, rotulo);
  assert.equal(m.porDia.length, dias.length);
  assert.equal(som.emissor.length, m.porEmissor.length);
  // desligar volta exatamente aos negócios
  await page.click('#deb-somado');
  const dep = await fotoDeb(page);
  assert.deepEqual(dep, ant);
  // pelo teclado também (chave acessível)
  await page.focus('#deb-somado');
  assert.equal(await page.getAttribute('#deb-somado', 'role'), 'switch');
  await page.keyboard.press('Space');
  assert.equal(await page.getAttribute('#deb-somado', 'aria-checked'), 'true');
  await page.keyboard.press('Enter');
  assert.deepEqual(await fotoDeb(page), ant);
});

test('Debêntures: as tabelas de emissor e de último negócio ordenam, e a ordem sobrevive a somar', async () => {
  await abreDeb();
  const col = (id, n) => page.$$eval(`#${id} tbody tr`, (trs, n) => trs.map(tr => tr.children[n].textContent), n);
  await page.click('#deb-emissores [data-sort="emissor"]');
  const nomes = await col('deb-emissores', 0);
  assert.deepEqual(nomes, [...nomes].sort((x, y) => x.localeCompare(y, 'pt-BR')));
  await page.click('#deb-somado');
  assert.equal(await page.getAttribute('#deb-emissores th[aria-sort]', 'aria-sort'), 'ascending');
  const depois = await col('deb-emissores', 0);
  assert.deepEqual(depois, [...depois].sort((x, y) => x.localeCompare(y, 'pt-BR')));
  await page.click('#deb-ultimo [data-sort="ticker"]');
  const t = await col('deb-ultimo', 0);
  assert.deepEqual(t, [...t].sort((x, y) => x.localeCompare(y, 'pt-BR')));
  await page.click('#deb-somado');
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('.csv-btn:has(+ .table-wrap #deb-emissores)').click()]);
  assert.match(download.suggestedFilename(), /^debentures-por-emissor-/);
  const csv = fs.readFileSync(await download.path(), 'utf8').split('\r\n');
  assert.ok(csv[0].includes('"Negócios"') && !csv[0].includes('intenções'), csv[0]);
});

test('Debêntures: intenções à parte, por direção, dia e emissor, iguais ao bloco', async () => {
  await abreDeb();
  const b = await blocoDeb(page), int = b.secundario.intencoes;
  const dir = await page.$$eval('#deb-int-direcao tbody tr', trs => trs.map(tr => [...tr.children].map(td => td.textContent)));
  assert.deepEqual(dir.map(r => [r[0], r[2]]), [['Compra', String(int.por_direcao.find(d => d.direcao === 'compra').n)], ['Venda', String(int.por_direcao.find(d => d.direcao === 'venda').n)]]
    .map(([a, n]) => [a, Number(n).toLocaleString('pt-BR')]));
  const dias = await page.$$eval('#chart-d-int-dia rect.cbar title', ts => ts.map(t => t.textContent));
  const esperado = int.por_dia.flatMap(d => ['compra', 'venda'].map(x => [d, x])).filter(([d, x]) => (d.por_direcao[x] || {}).volume > 0)
    .map(([d, x]) => `${diaMes(d.data)} · ${x === 'compra' ? 'Compra' : 'Venda'}: ${fmt2(d.por_direcao[x].volume / 1e6)} R$ mi`);
  assert.deepEqual(dias, esperado);
  assert.equal(await page.locator('#chart-d-int-emissor g.hrow').count(), Math.min(15, int.por_emissor.length));
  assert.ok((await page.textContent('#card-d-intencoes .sub')).includes('não são negócios fechados'));
  assert.equal(await page.locator('#card-d-intencoes .chart-legend').count(), 2);
});

test('Debêntures: celular 390 px, com e sem somar, sem rolagem lateral e sem rede', async () => {
  const errs = [], ext = [];
  const p = await openPage(errs, ext, null, { width: 390, height: 844 });
  await goTab(p, '#debentures');
  for (const somado of [false, true]) {
    if (somado) await p.click('#deb-somado');
    await p.waitForTimeout(100);
    const w = await p.evaluate(() => {
      const pg = document.querySelector('.page:not([hidden])');
      return { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, aba: pg.scrollWidth - pg.clientWidth,
        pw: Math.max(...[...pg.querySelectorAll('*')].filter(e => !e.closest('.table-wrap, .chart-box')).map(e => e.scrollWidth - e.clientWidth)) };
    });
    assert.ok(w.sw <= w.cw, `somado ${somado}: página alargou (${w.sw} > ${w.cw})`);
    assert.ok(w.aba <= 0, `somado ${somado}: a aba rola na horizontal (${w.aba}px)`);
    assert.ok(w.pw <= 0, `somado ${somado}: algo alarga além da tela (${w.pw}px)`);
  }
  assert.doesNotMatch(await p.textContent('#page-debentures'), /NaN|undefined/);
  assert.deepEqual(errs, []);
  assert.deepEqual(ext, []);
  await p.context().close();
});

// ---------- Aba Debêntures: índices IDA e IDEX-Infra ----------
const brData = d => d.split('-').reverse().join('/');
const pct2 = v => `${fmt2(v)}%`;
const pp2 = v => `${fmt2(v)} p.p.`;
const blocosIdx = p => p.evaluate(() => ({ ida: JSON.parse(JSON.stringify(window.INTEL.ida || null)), idex: JSON.parse(JSON.stringify(window.INTEL.idex || null)) }));

test('Debêntures: seção de índices entre o mercado secundário e o RoadShow, com o número de séries do modelo', async () => {
  await abreDeb();
  const { ida, idex } = await blocosIdx(page);
  assert.ok(ida && idex, 'o HTML embute os blocos ida e idex');
  // posição: título depois do mercado secundário e antes da série do RoadShow
  const ordem = await page.$$eval('#page-debentures h2', hs => hs.map(h => h.id));
  assert.ok(ordem.indexOf('deb-h-secundario') < ordem.indexOf('deb-h-indices'), ordem.join());
  if (ordem.includes('deb-h-roadshow')) assert.ok(ordem.indexOf('deb-h-indices') < ordem.indexOf('deb-h-roadshow'));
  assert.equal(await page.textContent('#deb-h-indices'), 'Índices de debêntures (IDA e IDEX-Infra)');
  assert.deepEqual(await page.$$eval('#page-debentures .ccard', cs => cs.map(c => c.id).filter(i => i.startsWith('card-d-ind-'))), ['card-d-ind-evolucao', 'card-d-ind-spread', 'card-d-ind-papel']);
  // a linha de abertura liga os quatro termos ao Glossário (ids que existem no arquivo embutido)
  const links = await page.$$eval('#deb-ind-lead a.glossario-link', as => as.map(a => decodeURIComponent(a.getAttribute('href').replace('#glossario/', ''))));
  assert.deepEqual(links.sort(), ['carteira-teorica', 'ida', 'idex-infra', 'ponto-base']);
  assert.deepEqual(await page.evaluate(l => l.filter(i => !window.GLOSSARIO.some(e => e.id === i)), links), []);
  // gráficos: uma linha por série do modelo
  const m = await page.evaluate(() => ({ ev: DebenturesModel.evolucaoIda(window.INTEL.ida), ret: DebenturesModel.retornosIdex(window.INTEL.idex), sp: DebenturesModel.spreadIdex(window.INTEL.idex),
    per: DebenturesModel.periodoIda(window.INTEL.ida), v: DebenturesModel.variacoesIda(window.INTEL.ida), r12: DebenturesModel.comparacaoRetorno12m(window.INTEL.ida, window.INTEL.idex) }));
  assert.equal(m.ev.length, 4);
  const dias = Math.max(...m.ev.map(s => s.pontos.length));
  if (dias >= 2) {
    assert.equal(await page.locator('#chart-d-ind-ida path.line').count(), m.ev.length);
    assert.equal(await page.locator('#chart-d-ind-ida circle').count(), m.ev.reduce((t, s) => t + s.pontos.length, 0));
    assert.equal(await page.locator('#card-d-ind-evolucao .chart-legend').first().locator('span').count(), m.ev.length);
    assert.deepEqual(await page.locator('#card-d-ind-evolucao .chart-legend').first().locator('span').allTextContents(), m.ev.map(s => s.nome));
    // o primeiro dia de cada série vale 100 e o eixo vertical não começa em zero
    for (const s of m.ev) assert.equal(s.pontos[0].base100, 100);
    const eixo = await page.$$eval('#chart-d-ind-ida svg text[text-anchor="end"]', ts => ts.map(t => Number(t.textContent.replace(',', '.'))));
    assert.ok(eixo[0] > 0, eixo.join());
  } else assert.equal(await page.locator('#chart-d-ind-ida').count(), 0);
  assert.equal(await page.locator('#chart-d-ind-idex-ret path.line').count(), m.ret.length);
  assert.equal(m.ret.length, 2);
  assert.equal(await page.locator('#chart-d-ind-idex-ret circle').count(), m.ret.reduce((t, s) => t + s.pontos.length, 0));
  assert.equal(await page.locator('#chart-d-ind-idex-spread path.line').count(), 1);
  assert.equal(await page.locator('#chart-d-ind-idex-spread circle').count(), m.sp.length);
  // spread diário do IDEX no gráfico = bps do bloco ÷ 100
  assert.deepEqual(await page.$$eval('#chart-d-ind-idex-spread circle title', ts => ts.map(t => t.textContent.split(': ')[1])),
    idex.spread.map(d => `${fmt2(d.spread_medio_bps / 100)} p.p.`));
  // retorno acumulado composto, conferido à mão a partir dos retornos mensais do bloco
  const geral = idex.retornos['Idex-Infra Geral'].slice().sort((a, b) => (a.mes < b.mes ? -1 : 1));
  let f = 1;
  const esperado = geral.map(x => { f *= 1 + x.pct / 100; return fmt2((f - 1) * 100); });
  const tituloGeral = await page.$$eval('#chart-d-ind-idex-ret path.line:first-of-type ~ circle title', ts => ts.map(t => t.textContent));
  assert.deepEqual(tituloGeral.slice(0, geral.length).map(t => t.split(': ')[1].split(' ')[0]), esperado);
  // títulos dos gráficos dizem a cobertura (vinda dos dados); eixos com unidade; cores distintas; linha interrompida nos dias sem ponto
  const cob = await page.evaluate(() => ({ ida: DebenturesModel.coberturaIda(window.INTEL.ida), idex: DebenturesModel.coberturaIdex(window.INTEL.idex), lac: DebenturesModel.lacunasIda(window.INTEL.ida),
    quebras: DebenturesModel.evolucaoIda(window.INTEL.ida).map(s => s.pontos.filter(p => p.quebra).length) }));
  assert.match(cob.ida, /^\d+ dias?, de \d{2}\/\d{2}( a |\/\d{4} a )\d{2}\/\d{2}\/\d{4}$/);
  assert.ok((await page.textContent('#deb-ida-titulo')).includes(cob.ida));
  assert.ok(cob.ida.startsWith(`${m.per.dias} dia`));
  assert.ok((await page.textContent('#deb-idex-ret-titulo')).includes(cob.idex.retornos));
  assert.ok((await page.textContent('#deb-idex-spread-titulo')).includes(cob.idex.spread));
  assert.ok(cob.idex.spread.startsWith(`${idex.spread.length} dias`));
  if (dias >= 2) {
    assert.equal(await page.textContent('#chart-d-ind-ida text.ylabel'), 'Base 100');
    const cores = await page.$$eval('#chart-d-ind-ida path.line', ps => ps.map(p => p.getAttribute('stroke')));
    assert.equal(new Set(cores).size, m.ev.length, `uma cor por subíndice: ${cores.join()}`);
    const legCores = await page.$$eval('#deb-ind-ida .chart-legend rect', rs => rs.map(r => r.getAttribute('fill')));
    assert.deepEqual(legCores, cores, 'a legenda usa as cores das linhas');
    // cada interrupção da linha = um trecho a mais no desenho (M); o aviso diz os dias
    const trechos = await page.$$eval('#chart-d-ind-ida path.line', ps => ps.map(p => (p.getAttribute('d').match(/M/g) || []).length));
    assert.deepEqual(trechos, cob.quebras.map(q => q + 1));
    if (cob.lac.length) assert.ok((await page.textContent('#deb-ida-lacunas')).includes(cob.lac.map(d => brData(d)).join(', ')), 'o aviso diz os dias sem ponto');
    else assert.equal(await page.locator('#deb-ida-lacunas').count(), 0);
  }
  assert.equal(await page.textContent('#chart-d-ind-idex-ret text.ylabel'), '% acumulado');
  assert.equal(await page.textContent('#chart-d-ind-idex-spread text.ylabel'), 'p.p.');
  // série diária do IDA: data de início dita e dos dados
  assert.equal(limpa(await page.textContent('#deb-ida-serie')), `Série diária acumulada desde ${brData(m.per.de)} (primeiro download); cresce a cada atualização.`);
  // variações publicadas pela ANBIMA: uma linha por subíndice, valores do bloco
  const datas = [...new Set(m.v.map(x => x.data))];
  assert.match(await page.textContent('#deb-ind-ida'), /Variação publicada pela ANBIMA/);
  if (datas.length === 1) assert.ok((await page.textContent('#deb-ind-ida')).includes(`Variação publicada pela ANBIMA em ${brData(datas[0])}`));
  const linhas = await page.$$eval('#deb-ida-variacoes tbody tr', trs => trs.map(tr => [...tr.children].map(td => td.textContent)));
  assert.equal(linhas.length, m.v.length);
  linhas.forEach((r, i) => {
    const v = ida.indices[m.v[i].chave].ultimo, off = datas.length > 1 ? 2 : 1;
    assert.equal(r[0], m.v[i].nome);
    assert.deepEqual(r.slice(off), [v.var_mes, v.var_ano, v.var_12m, v.var_24m].map(pct2));
  });
  // retorno em 12 meses lado a lado, com a referência de cada um
  // a janela de cada número está no próprio cartão, em negrito como o número; aviso só quando as datas finais diferem
  const tiles = await page.$$eval('#deb-ind-12m .kpi-tile', ts => ts.map(t => [t.querySelector('b').textContent, t.querySelector('b.kpi-janela').textContent, t.querySelector('b.kpi-janela').getBoundingClientRect().width > 0 && getComputedStyle(t.querySelector('b.kpi-janela')).fontWeight]));
  assert.deepEqual(tiles.map(t => t[0]), m.r12.map(x => pct2(x.pct)));
  assert.equal(pct2(ida.indices.IPCA_INFRAESTRUTURA.ultimo.var_12m), tiles[0][0]);
  assert.equal(pct2(idex.acumulado_12m['Idex-Infra Geral']), tiles[1][0]);
  assert.deepEqual(tiles.map(t => t[1]), m.r12.map(x => x.janela));
  assert.deepEqual(tiles.map(t => t[1]), [`IDA-IPCA Infraestrutura — 12 meses até ${brData(ida.indices.IPCA_INFRAESTRUTURA.ultimo.data)}`,
    `IDEX-Infra Geral — 12 meses até ${await page.evaluate(() => { const r = DebenturesModel.retornosIdex(window.INTEL.idex)[0].pontos; return DebenturesModel.fmtData(r[r.length - 1].mes); })}`]);
  assert.ok(tiles.every(t => Number(t[2]) >= 600), 'a janela tem o peso de um negrito');
  const difere = await page.evaluate(() => DebenturesModel.janelasDiferentes(DebenturesModel.comparacaoRetorno12m(window.INTEL.ida, window.INTEL.idex)));
  assert.equal(await page.locator('#deb-ind-12m-aviso').count(), difere ? 1 : 0);
  if (difere) assert.equal(limpa(await page.textContent('#deb-ind-12m-aviso')), 'Janelas diferentes: os números não são diretamente comparáveis.');
  // fonte e período de cada cartão vêm dos blocos
  const fonte1 = await page.locator('#card-d-ind-evolucao .src').last().textContent();
  assert.ok(fonte1.includes(`${brData(m.per.de)} a ${brData(m.per.ate)}`), fonte1);
  assert.ok(fonte1.includes(`${brData(idex.spread[0].data)} a ${brData(idex.spread[idex.spread.length - 1].data)}`), fonte1);
  for (const id of ['ind-evolucao', 'ind-spread', 'ind-papel']) {
    const c = page.locator('#card-d-' + id);
    assert.match(await c.locator('.src').last().textContent(), /^Fonte: \S/, id);
    assert.doesNotMatch(await c.textContent(), /NaN|undefined|null|Infinity/, id);
    assert.ok(!(await c.locator('svg.chart title').allTextContents()).some(t => /NaN|undefined/.test(t)), id);
    if (await c.locator('svg.chart').count()) assert.ok(await c.locator('.chart-legend').count() >= 1, id);
  }
  assert.equal(await page.locator('#deb-idex-aviso').count(), 0);
  // os dois links do Glossário da seção não repetem os de outras partes da aba
  const gl = await page.$$eval('#page-debentures a.glossario-link', as => as.map(a => a.getAttribute('href')));
  assert.equal(new Set(gl).size, gl.length, 'um link por termo');
});

test('Debêntures: spread comparado bate com o modelo e com os blocos, com "ver somado" desligado e ligado', async () => {
  await abreDeb();
  const { ida, idex } = await blocosIdx(page);
  const ultimoDe = (lista, dia, val) => lista.filter(x => typeof val(x) === 'number').map(x => [dia(x), val(x)]).sort((a, b) => (a[0] < b[0] ? -1 : 1)).pop();
  const leitura = () => page.evaluate(() => {
    const t = s => [...document.querySelectorAll(s)].map(e => e.textContent.replace(/\s+/g, ' ').trim());
    return { barras: t('#chart-d-ind-spread-ultimo g.hrow-tip > title'), comum: t('#chart-d-ind-spread-comum g.hrow-tip > title'),
      rotulosBarras: t('#chart-d-ind-spread-ultimo g.hrow-tip > text:nth-of-type(1)'), rotulosComum: t('#chart-d-ind-spread-comum g.hrow-tip > text:nth-of-type(1)'),
      ordem: [...document.querySelectorAll('#deb-ind-spread > *')].map(e => e.id).filter(Boolean),
      sub: document.querySelector('#card-d-ind-spread .sub').textContent, pond: document.getElementById('deb-ind-ponderacao').textContent,
      alturaComum: (document.querySelector('#chart-d-ind-spread-comum rect.cbar') || { getAttribute: () => 0 }).getAttribute('height'), alturaUltimo: document.querySelector('#chart-d-ind-spread-ultimo rect.cbar').getAttribute('height'),
      tabela: [...document.querySelectorAll('#deb-ind-spread-tabela tbody tr')].map(tr => [tr.querySelector('.deb-nome') ? tr.querySelector('.deb-nome').textContent : tr.children[0].textContent, ...[...tr.children].slice(1).map(td => td.textContent)]),
      rotulo: document.querySelector('#card-d-ind-spread .deb-rotulo').textContent, csv: document.getElementById('deb-ind-spread-tabela').dataset.csvName };
  });
  for (const somado of [false, true]) {
    if (somado) await page.click('#deb-somado');
    const c = await page.evaluate(s => DebenturesModel.comparacaoSpread(window.INTEL.debentures, window.INTEL.ida, window.INTEL.idex, { somado: s }), somado);
    const tela = await leitura();
    assert.equal(c.length, 3);
    assert.equal(c[0].rotulo, `Debêntures de transporte (${somado ? 'negócios + intenções' : 'negócios'})`);
    assert.deepEqual(c.slice(1).map(l => l.rotulo), ['IDA-IPCA Infraestrutura', 'IDEX-Infra Geral']);
    // barras e tabela = modelo
    // todo rótulo de barra traz a data (não só a dica); no último dia, as datas das séries
    assert.deepEqual(tela.rotulosBarras, c.map(l => `${l.rotulo_curto} · ${brData(l.data)}`));
    assert.deepEqual(tela.barras, c.map(l => `${l.rotulo_curto} · ${brData(l.data)}: ${pp2(l.spread_pp)} (em ${brData(l.data)})`));
    assert.equal(c[0].rotulo_curto, somado ? 'Transporte + intenções' : 'Transporte (negócios)');
    assert.deepEqual(tela.tabela.map(r => [r[0], r[1], r[2]]), c.map(l => [l.rotulo, pp2(l.spread_pp), brData(l.data)]));
    // só a linha de transporte leva o rótulo "Mostrando"; o subtítulo do cartão não
    assert.doesNotMatch(tela.sub, /Mostrando/);
    assert.match(tela.sub, /“Ver somado” .* muda só a linha de transporte/);
    assert.equal(await page.locator('#card-d-ind-spread .deb-rotulo').count(), 1);
    assert.equal(await page.locator('#deb-ind-spread-tabela tbody tr:first-child .deb-rotulo').count(), 1);
    assert.equal(tela.pond, 'Transporte: média ponderada pelo volume negociado; IDA e IDEX: ponderada pela participação de cada papel no índice.');
    assert.equal(tela.rotulo, somado ? 'negócios + intenções (somados como se fossem negócios)' : 'negócios fechados');
    assert.equal(tela.csv, somado ? 'debentures-indices-spread-somado' : 'debentures-indices-spread');
    // IDA e IDEX conferidos à mão no bloco: o IDEX em pontos-base ÷ 100; o IDA, no último dia com valor
    const [dIda, vIda] = ultimoDe(ida.indices.IPCA_INFRAESTRUTURA.serie, x => x.data, x => x.spread_medio);
    const [dIdex, vIdex] = ultimoDe(idex.spread, x => x.data, x => x.spread_medio_bps / 100);
    assert.deepEqual([c[1].data, c[1].spread_pp], [dIda, vIda]);
    assert.deepEqual([c[2].data, c[2].spread_pp], [dIdex, vIdex]);
    assert.equal(tela.tabela[2][1], pp2(idex.spread.find(x => x.data === dIdex).spread_medio_bps / 100));
    // média nos dias em comum: ou aparece, igual ao modelo, ou a tela diz que não há dias em comum
    if (c[0].dias_comuns > 0) {
      const n = c[0].dias_comuns, quando = n === 1 ? c[0].periodo_comum : `média de ${n} dias`;
      assert.deepEqual(tela.rotulosComum, c.map(l => `${l.rotulo_curto} · ${quando}`));
      assert.deepEqual(tela.comum, c.map(l => `${l.rotulo_curto} · ${quando}: ${pp2(l.media_comum_pp)} (${n === 1 ? 'dia' : `média de ${n} dias`} ${l.periodo_comum})`));
      assert.deepEqual(tela.tabela.map(r => r[3]), c.map(l => pp2(l.media_comum_pp)));
      // o gráfico dos dias em comum vem primeiro e é o maior
      assert.deepEqual(tela.ordem.filter(i => /^deb-ind-(comum|ultimo)-titulo$/.test(i)), ['deb-ind-comum-titulo', 'deb-ind-ultimo-titulo']);
      assert.ok(Number(tela.alturaComum) > Number(tela.alturaUltimo), `${tela.alturaComum} × ${tela.alturaUltimo}`);
    } else {
      assert.deepEqual(tela.comum, []);
      assert.equal(await page.locator('#deb-ind-comum-nao').count(), 1);
      assert.equal(await page.locator('#chart-d-ind-spread-ultimo').count(), 1);
    }
  }
  // o cartão muda com a opção e volta ao desligar; os outros dois cartões da seção não mudam
  const fixos = () => page.$$eval('#card-d-ind-evolucao, #card-d-ind-papel', cs => cs.map(c => c.innerHTML));
  const ligado = await leitura(), fx = await fixos();
  await page.click('#deb-somado');
  const desligado = await leitura();
  assert.notDeepEqual(ligado.barras[0], desligado.barras[0]);
  assert.deepEqual(ligado.barras.slice(1), desligado.barras.slice(1));
  assert.deepEqual(await fixos(), fx);
  assert.equal(await page.getAttribute('#card-d-ind-spread', 'data-afetado'), '1');
  // série com dias sem curva: o aviso diz até onde há valor
  const c0 = await page.evaluate(() => DebenturesModel.comparacaoSpread(window.INTEL.debentures, window.INTEL.ida, window.INTEL.idex));
  const avisos = limpa(await page.textContent('#deb-ind-spread'));
  for (const l of c0.filter(x => x.ate > x.data)) assert.ok(avisos.includes(`${l.rotulo}: último valor em ${brData(l.data)}; a série vai até ${brData(l.ate)}`), l.rotulo);
});

test('Debêntures: tabela por papel com "—" fora do índice, ordenável e com CSV', async () => {
  await abreDeb();
  const { ida, idex } = await blocosIdx(page);
  const b = await blocoDeb(page);
  const cab = () => page.$$eval('#deb-ind-papel thead th', ths => ths.map(t => t.textContent.replace(/\s[↑↓]$/, '')));
  const linhas = () => page.$$eval('#deb-ind-papel tbody tr', trs => trs.map(tr => [...tr.children].map(td => td.textContent)));
  const c0 = await cab();
  assert.deepEqual(c0, ['Papel', 'Emissor', 'Spread painel (p.p.)', 'Taxa ANBIMA (%)', 'Spread IDEX (p.p.)']);
  // as datas dos índices ficam no subtítulo do cartão
  const sub = await page.textContent('#card-d-ind-papel .sub');
  assert.ok(sub.includes(`taxa ANBIMA de ${brData(Object.values(ida.papeis).map(p => p.data).sort().pop())}`) && sub.includes(`spread IDEX de ${brData(Object.values(idex.papeis).map(p => p.data).sort().pop())}`), sub);
  let r = await linhas();
  assert.equal(r.length, b.emissoes.length);
  // cada célula confere com os blocos: spread IDEX em p.p., taxa ANBIMA se o papel está na carteira do IDA, "—" se não está
  for (const l of r) {
    const x = idex.papeis[l[0]], a = ida.papeis[l[0]];
    assert.equal(l[4], x ? fmt2(x.spread_bps / 100) : '—', l[0]);
    assert.equal(l[3] === '—', !a || typeof a.taxa_indicativa !== 'number', l[0]);
    if (a && typeof a.taxa_indicativa === 'number') assert.ok(l[3].includes(fmt2(a.taxa_indicativa)), `${l[0]}: ${l[3]}`);
  }
  // há ao menos um papel fora de cada índice (a tabela mostra traço) e ao menos um dentro
  const foraIdex = b.emissoes.filter(e => !idex.papeis[e.ticker]).map(e => e.ticker), foraIda = b.emissoes.filter(e => !ida.papeis[e.ticker]).map(e => e.ticker);
  assert.ok(foraIdex.length > 0 && foraIdex.length < b.emissoes.length, `papéis fora do IDEX: ${foraIdex.length}`);
  assert.ok(foraIda.length > 0 && foraIda.length < b.emissoes.length, `papéis fora do IDA: ${foraIda.length}`);
  assert.ok(r.filter(l => foraIdex.includes(l[0])).every(l => l[4] === '—'), 'papel fora do IDEX mostra traço');
  assert.ok(r.filter(l => foraIda.includes(l[0])).every(l => l[3] === '—'), 'papel fora do IDA mostra traço');
  // ordenar por spread IDEX: o maior primeiro e os sem valor no fim
  await page.click('#deb-ind-papel [data-sort="spread_idex_pp"]');
  assert.equal(await page.getAttribute('#deb-ind-papel th[aria-sort]', 'aria-sort'), 'descending');
  r = await linhas();
  const maior = Math.max(...Object.values(idex.papeis).filter(p => b.emissoes.length).map(p => p.spread_bps));
  const noPainel = Math.max(...b.emissoes.filter(e => idex.papeis[e.ticker]).map(e => idex.papeis[e.ticker].spread_bps));
  assert.equal(r[0][4], fmt2(noPainel / 100));
  assert.ok(maior >= noPainel);
  assert.equal(r[r.length - 1][4], '—');
  const lim = r.findIndex(l => l[4] === '—');
  assert.ok(r.slice(lim).every(l => l[4] === '—'), 'os sem valor ficam juntos, no fim');
  // CSV: o que está na tela
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('.csv-btn:has(+ .table-wrap #deb-ind-papel)').click()]);
  assert.match(dl.suggestedFilename(), /^debentures-indices-por-papel-\d{4}-\d{2}-\d{2}\.csv$/);
  const csv = fs.readFileSync(await dl.path(), 'utf8').split('\r\n');
  assert.equal(csv.length, b.emissoes.length + 1);
  assert.ok(csv[0].includes('"Papel";"Emissor"'), csv[0]);
  // a tabela de variações do IDA também exporta
  assert.equal(await page.locator('.csv-btn:has(+ .table-wrap #deb-ida-variacoes)').count(), 1);
});

test('Debêntures: tabela por papel sem corte em 1366 px; em 390 px só a tabela rola na horizontal, não a página', async () => {
  const errs = [], ext = [];
  const geom = p => p.evaluate(() => {
    const t = document.getElementById('deb-ind-papel'), w = t.closest('.table-wrap'), ths = [...t.querySelectorAll('thead th')], wr = w.getBoundingClientRect().right;
    return { ultimoDireita: ths[ths.length - 1].getBoundingClientRect().right, wrapperDireita: wr, tabelaDireita: t.getBoundingClientRect().right, wrapperSw: w.scrollWidth, wrapperCw: w.clientWidth,
      paginaSw: document.documentElement.scrollWidth, paginaCw: document.documentElement.clientWidth,
      overflowX: getComputedStyle(w).overflowX };
  });
  const d = await openPage(errs, ext, null, { width: 1366, height: 900 });
  await goTab(d, '#debentures');
  const g = await geom(d);
  assert.ok(g.ultimoDireita <= g.wrapperDireita + 0.5, `a última coluna passa da borda do quadro: ${g.ultimoDireita} > ${g.wrapperDireita}`);
  assert.ok(g.wrapperSw <= g.wrapperCw, `a tabela é mais larga que o quadro (${g.wrapperSw} > ${g.wrapperCw})`);
  assert.equal(await d.locator('#deb-ind-papel thead th').last().isVisible(), true);
  assert.ok(g.paginaSw <= g.paginaCw);
  await d.context().close();
  const m = await openPage(errs, ext, null, { width: 390, height: 844 });
  await goTab(m, '#debentures');
  const h = await geom(m);
  assert.ok(h.paginaSw <= h.paginaCw, `a página rola na horizontal (${h.paginaSw} > ${h.paginaCw})`);
  assert.ok(h.wrapperSw > h.wrapperCw && /auto|scroll/.test(h.overflowX), 'a rolagem horizontal fica dentro do quadro da tabela');
  // o aviso das janelas e os rótulos de barra do cartão de spread cabem na tela estreita, sem corte
  const rot = await m.$$eval('#chart-d-ind-spread g.hrow-tip > text:nth-of-type(1)', ts => ts.map(t => t.textContent));
  assert.ok(rot.length >= 3 && rot.every(t => !t.includes('…')), rot.join(' | '));
  assert.ok(rot.some(t => t.startsWith('Transporte')));
  await m.click('#deb-somado');
  assert.ok((await m.$$eval('#chart-d-ind-spread g.hrow-tip > text:nth-of-type(1)', ts => ts.map(t => t.textContent))).some(t => t.startsWith('Transporte + intenções · ')), 'o sufixo "+ intenções" aparece no celular');
  assert.deepEqual(errs, []);
  assert.deepEqual(ext, []);
  await m.context().close();
});

test('Debêntures: sem o bloco idex a seção avisa que aguarda os arquivos; sem NaN e sem erros', async () => {
  const errs = [], ext = [];
  const p = await openPage(errs, ext, html => html.replace('window.INTEL=', 'window.INTEL_FULL=').replace('</script>',
    '</script><script>window.INTEL=Object.assign({},window.INTEL_FULL);delete window.INTEL.idex;</script>'));
  await goTab(p, '#debentures');
  const aviso = 'Aguardando os arquivos do IDEX-Infra (planilha de dados e relatório mensal) em data/raw/idex/.';
  assert.equal(limpa(await p.textContent('#deb-idex-aviso')), aviso);
  assert.equal(await p.locator('#chart-d-ind-idex-ret').count(), 0);
  assert.equal(await p.locator('#chart-d-ind-idex-spread').count(), 0);
  // o IDA continua: gráfico e variações
  assert.ok(await p.locator('#deb-ida-variacoes tbody tr').count() >= 1);
  // spread comparado: a linha do IDEX fica sem valor, as outras duas seguem o modelo
  const c = await p.evaluate(() => DebenturesModel.comparacaoSpread(window.INTEL.debentures, window.INTEL.ida, undefined));
  assert.equal(c[2].spread_pp, null);
  const tab = await p.$$eval('#deb-ind-spread-tabela tbody tr', trs => trs.map(tr => [...tr.children].map(td => td.textContent)));
  assert.deepEqual(tab[2].slice(1), ['—', '—', '—']);
  assert.equal(tab[1][1], pp2(c[1].spread_pp));
  assert.equal(await p.locator('#deb-ind-comum-nao').count(), 1);
  assert.ok((await p.textContent('#deb-ind-spread')).includes(aviso));
  // tabela por papel: a coluna do IDEX toda em traço
  const col = await p.$$eval('#deb-ind-papel tbody tr', trs => trs.map(tr => tr.children[4].textContent));
  assert.ok(col.length > 0 && col.every(x => x === '—'));
  assert.equal(await p.locator('#card-d-ind-evolucao .src').last().textContent().then(t => /IDEX/.test(t)), false);
  assert.doesNotMatch(await p.textContent('#page-debentures'), /NaN|undefined|null/);
  await p.click('#deb-somado');
  assert.doesNotMatch(await p.textContent('#card-d-ind-spread'), /NaN|undefined|null/);
  // sem ida nem idex: a seção continua, dizendo o que aguarda
  const q = await openPage(errs, ext, html => html.replace('window.INTEL=', 'window.INTEL_FULL=').replace('</script>',
    '</script><script>window.INTEL=Object.assign({},window.INTEL_FULL);delete window.INTEL.idex;delete window.INTEL.ida;</script>'));
  await goTab(q, '#debentures');
  assert.match(await q.textContent('#deb-ida-aviso'), /^Aguardando o primeiro download do IDA/);
  assert.equal(limpa(await q.textContent('#deb-idex-aviso')), aviso);
  assert.doesNotMatch(await q.textContent('#page-debentures'), /NaN|undefined|null/);
  assert.deepEqual(errs, []);
  assert.deepEqual(ext, []);
  await p.context().close();
  await q.context().close();
});

test('Debêntures: aba Resumo e Fontes listam os blocos ida e idex', async () => {
  await goTab(page, '#resumo');
  await page.evaluate(() => document.querySelectorAll('#resumo-sobre details').forEach(d => { d.open = true; }));
  for (const id of ['ida', 'idex']) {
    assert.equal(await page.locator(`#sobre-table tr[data-fonte="${id}"]`).count(), 1, id);
    assert.match(await page.textContent(`#sobre-table tr[data-fonte="${id}"] td:nth-child(2)`), /\d{2}\/\d{2}\/\d{4}|\d{2}\/\d{4}/, id);
  }
  await goTab(page, '#fontes');
  const t = await page.textContent('#page-fontes');
  assert.ok(/IDA/.test(t) && /IDEX/.test(t));
  const nomes = await page.evaluate(() => [window.INTEL.ida.fonte[0].nome, window.INTEL.idex.fonte[0].nome]);
  for (const n of nomes) assert.ok(t.includes(n), n);
});

test('nenhuma requisição externa', () => assert.deepEqual(external, []));

test('(h) sem erros no console', () => assert.deepEqual(errors, []));
