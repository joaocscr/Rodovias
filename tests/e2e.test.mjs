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

test('realce some com filtro que oculta os trechos realçados', async () => {
  await page.click('#clear-filters').catch(() => {});
  await page.fill('#search-input', '116');
  await page.waitForSelector('#suggestions li');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(100);
  const all = await page.evaluate(() => MapView.highlighted().length);
  await check('uf', 'AC');
  await page.waitForTimeout(150);
  const res = await page.evaluate(() => ({
    hl: MapView.highlighted(),
    allVisible: MapView.highlighted().every(j => MapView.isVisible(j)),
  }));
  assert.ok(res.hl.length < all);
  assert.equal(res.allVisible, true);
  await page.click('#clear-filters');
  await page.click('#clear-search');
});

test('clique num trecho realça o trecho e fechar remove o realce', async () => {
  await page.evaluate(() => MapView.pick(5));
  await page.waitForSelector('#card:not([hidden])');
  assert.deepEqual(await page.evaluate(() => MapView.highlighted()), [5]);
  await page.click('#card-close');
  assert.deepEqual(await page.evaluate(() => MapView.highlighted()), []);
});

test('cartão usa o registro da BR filtrada e não repete BR', async () => {
  const info = await page.evaluate(() => {
    const s = window.SNV;
    const j = s.fis.findIndex(f => f.r.length > 1);
    const iRec = s.fis[j].r[1];
    return { j, br: s.dict.br[s.trechos[iRec][1]], code: s.trechos[iRec][0] };
  });
  await check('br', 'BR-' + info.br);
  await page.waitForTimeout(100);
  await page.evaluate(j => MapView.pick(j), info.j);
  await page.waitForSelector('#card:not([hidden])');
  assert.match(await page.textContent('.card__code'), new RegExp(info.code));
  const title = await page.textContent('.card__title');
  const brs = title.match(/BR-\d{3}/g);
  assert.equal(new Set(brs).size, brs.length);
  await page.click('#card-close');
  await page.click('#clear-filters');
});

// ---------- v2: abas, concessões, ficha, comparador, mercado, regulatório ----------
async function go(hash) {
  await page.evaluate(h => { location.hash = h; }, hash);
  await page.waitForTimeout(250);
}

test('v2: barra de abas (v3: 7 abas) e Mapa ativa', async () => {
  await go('#mapa');
  assert.deepEqual(await page.$$eval('#tabs a', as => as.map(a => a.textContent)), ['Mapa', 'Projetos', 'Tráfego', 'Cargas', 'Mercado', 'Regulatório', 'Fontes']);
  assert.equal(await page.textContent('#tabs a.is-active'), 'Mapa');
});

test('v2: voltar restaura a aba anterior', async () => {
  await go('#mapa'); await go('#projetos');
  assert.equal(await page.isVisible('#page-projetos'), true);
  await page.goBack(); await page.waitForTimeout(250);
  assert.equal(await page.isVisible('#map'), true);
  assert.equal(await page.isVisible('#page-projetos'), false);
});

test('v2: hash inválido cai no mapa', async () => {
  await go('#xyz');
  assert.equal(await page.evaluate(() => location.hash), '#mapa');
  await go('#ficha/nao-existe');
  assert.equal(await page.evaluate(() => location.hash), '#mapa');
  assert.equal(await page.isVisible('#ficha'), false);
});

test('v2: modo concessões é o padrão e a legenda lista os estados', async () => {
  await go('#mapa');
  assert.equal(await page.evaluate(() => MapView.colorMode()), 'concessoes');
  assert.match(await page.textContent('#legend'), /Leilão agendado 2026/);
  await page.click('[data-mode="fisica"]');
  assert.equal(await page.evaluate(() => MapView.colorMode()), 'fisica');
  assert.match(await page.textContent('#legend'), /Duplicada/);
  await page.click('[data-mode="concessoes"]');
});

test('v2: filtro de estado Projeto 2027 bate com o modelo', async () => {
  await go('#mapa');
  await page.click('#clear-filters').catch(() => {});
  const det = page.locator('details[data-group="c-estado"]');
  if (!(await det.evaluate(d => d.open))) await det.locator('summary').click();
  await page.locator('input[data-cfilter="estado"][value="projeto2027"]').check();
  await page.waitForTimeout(150);
  const expected = await page.evaluate(() => {
    const states = UI.states(), cf = ConcModel.emptyConcFilters(); cf.estado.add('projeto2027');
    const vis = Model.visibleFis(window.SNV, Model.emptyFilters());
    for (let j = 0; j < vis.length; j++) if (!ConcModel.passes(window.CONC, states, j, cf)) vis[j] = 0;
    return Model.fmtKm(Model.aggregate(window.SNV, Model.emptyFilters(), vis).km);
  });
  assert.notEqual(expected, '0,0 km');
  assert.equal((await kpi()).trim(), expected);
  await check('uf', 'AC');
  await page.waitForTimeout(150);
  assert.equal((await kpi()).trim(), '0,0 km');
  assert.ok(!/NaN/.test(await page.textContent('#stats-section')));
  await page.click('#clear-filters');
});

test('v2: busca por nome de projeto realça a entidade', async () => {
  await go('#mapa');
  await page.fill('#search-input', 'Rotas Gerais');
  await page.waitForSelector('#suggestions li');
  assert.match(await page.locator('#suggestions li').first().textContent(), /Rotas Gerais/);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  assert.ok(await page.evaluate(() => MapView.highlighted().length) > 0);
  await page.click('#clear-search');
});

test('v2: trecho da Transbrasiliana lista contrato e otimização e leva à ficha', async () => {
  await go('#mapa');
  const j = await page.evaluate(() => {
    const c = window.CONC, a = c.entidades.findIndex(e => e.id === 'transbrasiliana');
    return c.entFis[a].find(f => (c.fisEnt[f] || []).length >= 2);
  });
  await page.evaluate(j => MapView.pick(j), j);
  await page.waitForSelector('#card:not([hidden])');
  assert.equal(await page.locator('#card .conc-item').count(), 2);
  await page.locator('#card .conc-item a').first().click();
  await page.waitForTimeout(250);
  assert.match(await page.evaluate(() => location.hash), /^#ficha\//);
  assert.equal(await page.isVisible('#ficha'), true);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  await page.keyboard.press('Escape');
});

test('v2: ficha da Rotas Gerais', async () => {
  await go('#ficha/rotas-gerais');
  const t = await page.textContent('#ficha');
  for (const s of ['734,9 km', 'R$ 7,34 bi', '13,76%']) assert.ok(t.includes(s), s);
  assert.match(t, /Praças a implantar\s*9/);
  assert.ok(await page.locator('#ficha-capex rect.cbar').count() >= 5);
});

test('v2: ficha da Rota dos Sertões mostra data-base e valor dez/2024', async () => {
  await go('#ficha/rota-dos-sertoes');
  const t = await page.textContent('#ficha');
  for (const s of ['R$ 4,13 bi', 'mar/2023', 'R$ 6,27 bi em dez/2024']) assert.ok(t.includes(s), s);
});

test('v2: aviso de divergência mostra páginas', async () => {
  const id = await page.evaluate(() => window.CONC.entidades.find(e => (e.divergencias || []).length).id);
  await go('#ficha/' + id);
  await page.locator('.div-flag').first().click();
  const t = await page.textContent('.popover');
  assert.match(t, /Divergência entre fontes/);
  assert.match(t, /p\. \d+/);
});

test('v2: ficha de contrato antigo sem undefined/null/NaN', async () => {
  const id = await page.evaluate(() => window.CONC.entidades.find(e => e.estado === 'vigente' && !e.ficha).id);
  await go('#ficha/' + id);
  assert.equal(await page.isVisible('#ficha-title'), true);
  const t = await page.textContent('#ficha');
  assert.ok(t.length > 100);
  assert.ok(!/undefined|null|NaN/.test(t), t.slice(0, 200));
  assert.equal(await page.locator('#ficha .fblock h3 + :empty').count(), 0);
});

test('v2: ver no mapa a partir da ficha', async () => {
  await go('#ficha/rotas-gerais');
  await page.click('#ficha-map');
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => location.hash), '#mapa');
  assert.ok(await page.evaluate(() => MapView.highlighted().length) > 0);
  await page.evaluate(() => MapView.highlight(null));
});

test('v2: Esc fecha a ficha e volta ao hash anterior', async () => {
  await go('#projetos'); await go('#ficha/rotas-gerais');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  assert.equal(await page.evaluate(() => location.hash), '#projetos');
  assert.equal(await page.isVisible('#ficha'), false);
});

test('v2: comparador com 54 linhas, ordenação, filtro e totais', async () => {
  await go('#projetos');
  // v3: com concessões estaduais no arquivo, os 39 + 4 + 11 da v2 são a esfera federal
  if (await page.locator('#proj-esfera').count()) await page.selectOption('#proj-esfera', 'federal');
  assert.equal(await page.locator('#proj-table tbody tr').count(), 54);
  await page.click('[data-sort="capexKm"]');
  let vals = await page.evaluate(() => Projetos.rowsShown().map(r => r.capexKm));
  const nn = vals.filter(v => v != null);
  assert.deepEqual(nn, [...nn].sort((a, b) => b - a));
  assert.ok(vals.slice(nn.length).every(v => v == null));
  await page.click('[data-sort="desagio"]');
  vals = await page.evaluate(() => Projetos.rowsShown().map(r => r.desagio).filter(v => v != null));
  assert.deepEqual(vals, [...vals].sort((a, b) => b - a));
  await page.click('[data-f="estado"][data-v="projeto2027"]');
  assert.equal(await page.locator('#proj-table tbody tr').count(), 11);
  const ok = await page.evaluate(() => {
    const t = ConcModel.totals(Projetos.rowsShown());
    return document.getElementById('proj-total-capex').textContent === new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(t.capex);
  });
  assert.equal(ok, true);
  await page.locator('#proj-table tbody tr').first().click();
  await page.waitForTimeout(250);
  assert.match(await page.evaluate(() => location.hash), /^#ficha\//);
  await page.keyboard.press('Escape');
  await page.click('[data-f="estado"][data-v="projeto2027"]');
  assert.equal(await page.locator('#estudos-list li').count(), 27);
  if (await page.locator('#proj-esfera').count()) await page.selectOption('#proj-esfera', '');
});

test('v2: aba Mercado tem gráficos com fonte e tooltip', async () => {
  await go('#mercado');
  assert.ok(await page.locator('#page-mercado svg.chart').count() >= 7);
  const semFonte = await page.$$eval('#page-mercado .ccard', cs => cs.filter(c => ![...c.querySelectorAll('.src')].some(s => s.textContent.startsWith('Fonte:'))).length);
  assert.equal(semFonte, 0);
  assert.match(await page.locator('#chart-leiloes rect.cbar title').first().textContent(), /1993: \d+ leilões/);
});

test('v2: aba Regulatório com índice, otimizações e estudos', async () => {
  await go('#regulatorio');
  assert.equal(await page.locator('.reg__toc a').count(), 8);
  await page.locator('.reg__toc a', { hasText: 'Matriz de riscos' }).click();
  // A rolagem é suave: espera a posição parar (10 quadros iguais seguidos, até 3 s) em vez de um tempo fixo.
  const top = await page.evaluate(() => new Promise(resolve => {
    const el = document.getElementById('reg-riscos'), t0 = performance.now();
    let last = NaN, still = 0;
    (function tick() {
      const t = el.getBoundingClientRect().top;
      still = t === last ? still + 1 : 0;
      last = t;
      if (still >= 10 || performance.now() - t0 > 3000) resolve(t); else requestAnimationFrame(tick);
    })();
  }));
  assert.ok(top < 200, String(top));
  assert.equal(await page.locator('#otimizacoes tbody tr').count(), 11);
  await page.locator('#page-regulatorio [data-estudo]:not([disabled])').first().click();
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => location.hash), '#mapa');
  assert.ok(await page.evaluate(() => MapView.highlighted().length) > 0);
  await page.evaluate(() => MapView.highlight(null));
});

test('v2: troca de aba em menos de 300 ms', async () => {
  await go('#mapa');
  const ms = await page.evaluate(() => new Promise(resolve => {
    const t0 = performance.now();
    location.hash = '#projetos';
    requestAnimationFrame(() => requestAnimationFrame(() => resolve(performance.now() - t0)));
  }));
  assert.equal(await page.isVisible('#page-projetos'), true);
  assert.ok(ms < 300, `levou ${ms.toFixed(0)} ms`);
  await go('#mapa');
});

test('v2: hash com percent-encoding inválido cai no mapa', async () => {
  const before = errors.length;
  await go('#ficha/%E0%A4%A');
  assert.equal(await page.evaluate(() => location.hash), '#mapa');
  assert.equal(errors.length, before);
});

test('v2: ver no mapa vira destaque com chip e pode ser limpo', async () => {
  await go('#mapa');
  await page.fill('#search-input', 'Rotas Gerais');
  await page.waitForSelector('#suggestions li');
  await page.keyboard.press('Enter');
  await go('#ficha/rota-dos-sertoes');
  await page.click('#ficha-map');
  await page.waitForTimeout(300);
  assert.match(await page.textContent('#active-search'), /Rota dos Sertões/);
  await page.click('#clear-search');
  assert.deepEqual(await page.evaluate(() => MapView.highlighted()), []);
});

test('v2: total do comparador avisa bases mistas', async () => {
  await go('#projetos');
  await page.click('[data-f="estado"][data-v="projeto2027"]');
  assert.match(await page.textContent('#proj-table tfoot'), /bases mistas/i);
  await page.click('[data-f="estado"][data-v="projeto2027"]');
  await page.click('[data-f="estado"][data-v="vigente"]');
  assert.doesNotMatch(await page.textContent('#proj-table tfoot'), /bases mistas/i);
  await page.click('[data-f="estado"][data-v="vigente"]');
});

test('v2: gráfico de investimento por grupo usa o nome completo', async () => {
  await go('#mercado');
  const full = await page.evaluate(() => window.CONC.mercado.grupos.map(g => g.grupo));
  const txt = await page.textContent('#chart-gruposInv');
  assert.ok(full.filter(n => n.includes(' ')).every(n => txt.includes(n)), 'nomes completos');
});

test('v4: toda table.grid visível tem botão CSV', async () => {
  for (const hash of ['#projetos', '#mercado', '#fontes']) {
    await go(hash);
    const r = await page.evaluate(() => {
      const vis = [...document.querySelectorAll('table.grid')].filter(t => t.offsetParent !== null);
      const sem = vis.filter(t => {
        const prev = (t.closest('.table-wrap') || t).previousElementSibling;
        return !(prev && prev.classList.contains('csv-btn') && prev.textContent === 'Exportar CSV');
      }).map(t => t.id || t.className);
      return { n: vis.length, sem };
    });
    assert.ok(r.n >= 2, `${hash}: tabelas visíveis`);
    assert.deepEqual(r.sem, [], `${hash}: tabelas sem botão`);
  }
});

test('v4: CSV do comparador respeita filtro', async () => {
  await go('#projetos');
  await page.selectOption('#proj-uf', 'SP');
  await page.waitForTimeout(150);
  const visiveis = await page.locator('#proj-table tbody tr').count();
  assert.ok(visiveis > 0);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('.csv-btn:has(+ .table-wrap #proj-table)').click(),
  ]);
  assert.match(download.suggestedFilename(), /^projetos-comparador-\d{4}-\d{2}-\d{2}\.csv$/);
  const txt = (await import('node:fs')).readFileSync(await download.path(), 'utf8');
  assert.equal(txt.charCodeAt(0), 0xFEFF);
  const linhas = txt.split('\r\n');
  assert.equal(linhas.length, visiveis + 1);
  assert.ok(linhas[0].includes(';') && linhas[0].startsWith('﻿"'));
  assert.ok(!linhas[0].includes('Mapa'), 'coluna de botões fica de fora');
  assert.ok(linhas.slice(1).every(l => l.split('";"').length === linhas[0].split('";"').length));
  await page.selectOption('#proj-uf', '');
});

test('v4: CSV do pipeline exporta só o nome, sem a observação recolhida', async () => {
  await go('#projetos');
  const nomes = await page.$$eval('#pipe-table tbody tr', trs => trs.map(tr => {
    const td = tr.querySelector('td.name');
    const d = td.querySelector('details');
    return { nome: [...td.childNodes].filter(n => n !== d).map(n => n.textContent).join('').replace(/\s+/g, ' ').trim(), obs: !!d };
  }));
  assert.ok(nomes.some(n => n.obs), 'há linha com observação');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('.csv-btn:has(+ .table-wrap #pipe-table)').click(),
  ]);
  assert.match(download.suggestedFilename(), /^pipeline-\d{4}-\d{2}-\d{2}\.csv$/);
  const txt = (await import('node:fs')).readFileSync(await download.path(), 'utf8');
  const linhas = txt.split('\r\n').slice(1);
  assert.equal(linhas.length, nomes.length);
  linhas.forEach((l, i) => assert.equal(l.split('";"')[0], '"' + nomes[i].nome.replace(/"/g, '""'), `linha ${i + 1}`));
  assert.ok(!txt.includes('Observação'), 'sem texto de observação');
});

// v4: linha da ficha (dd) pelo rótulo (dt)
const fichaDd = rotulo => page.evaluate(r => {
  const dt = [...document.querySelectorAll('#ficha dt')].find(x => x.textContent === r);
  return dt ? { html: dt.nextElementSibling.innerHTML, text: dt.nextElementSibling.textContent } : null;
}, rotulo);
const partLinhas = () => page.$$eval('#ficha table[data-csv-name="ficha-participantes"] tbody tr', trs => trs.map(tr => tr.textContent.replace(/\s+/g, ' ').trim()));
const notasVerif = () => page.evaluate(() => {
  const h = [...document.querySelectorAll('#ficha .fblock h3')].find(x => x.textContent === 'Notas da verificação');
  return h ? h.parentElement.textContent.replace(/\s+/g, ' ') : null;
});

test('v4: ficha do Lote 5 do Paraná mostra selo e RoadShow na divergência', async () => {
  await go('#ficha/rodovias-integradas-do-parana-lote-5');
  const d = await fichaDd('Deságio');
  assert.match(d.text, /^23,83%/);
  assert.match(d.html, /class="selo selo--oficial"/);
  assert.equal(await page.getAttribute('#ficha dd .selo--oficial a', 'target'), '_blank');
  assert.match(await page.getAttribute('#ficha dd .selo--oficial', 'title'), /B3 — .*\(30\/10\/2025\)/);
  await page.evaluate(() => {
    const dt = [...document.querySelectorAll('#ficha dt')].find(x => x.textContent === 'Deságio');
    dt.nextElementSibling.querySelector('.div-flag').click();
  });
  const t = await page.textContent('.popover');
  assert.match(t, /Divergência entre fontes/);
  assert.match(t, /Exibido: 23,83%/);
  assert.match(t, /21,83% \(p\. 97\)/);
  assert.ok(await notasVerif(), 'bloco de notas');
  await page.keyboard.press('Escape');
});

test('v4: ficha da Rota da Celulose mostra nota de inabilitação', async () => {
  await go('#ficha/rota-da-celulose');
  const n = await notasVerif();
  assert.match(n, /Consórcio K&G Rota da Celulose: 9,00%, inabilitado em 04\/08\/2025/);
  assert.match(n, /Comunicado — Aviso de decisão de recurso/);
  assert.ok(await page.locator('#ficha .notas-verif .selo--oficial').count() > 0);
  // início da operação não localizado: linha com "—" e o selo
  const ini = await fichaDd('Início da operação');
  assert.match(ini.text, /^—não localizado em fonte oficial/);
  // um só vencedor: o verificado, com o deságio exibido (8%); o que o RoadShow imprime (9%) fica abaixo
  const linhas = await partLinhas();
  assert.equal(linhas.filter(l => l.includes('(vencedor)')).length, 1);
  assert.match(linhas[0], /^Consórcio Caminhos da Celulose \(vencedor\) oficial RoadShow: .*XP infra V.* 8,00% oficial RoadShow: 9,00%$/);
});

test('v4: vencedor verificado fora da lista do RoadShow entra no topo (Transbrasiliana)', async () => {
  await go('#ficha/transbrasiliana');
  const linhas = await partLinhas();
  assert.equal(linhas.filter(l => l.includes('(vencedor)')).length, 1);
  assert.match(linhas[0], /^Consórcio BRVias \(vencedor\) oficial .*39,99%/);
  assert.ok(linhas.some(l => /^TPI – Triunfo .*Antigo Consórcio BRVIAS/.test(l) && !l.includes('(vencedor)')));
});

test('v4: otimização distingue contrato original e termo aditivo; popover sem alternativa "-"', async () => {
  await go('#ficha/regis-bittencourt');
  assert.match((await fichaDd('Assinatura do contrato original')).text, /^14\/02\/2008/);
  assert.match((await fichaDd('Assinatura do termo aditivo (otimização)')).text, /^21\/12\/2026/);
  await go('#ficha/via-liberdade');
  await page.evaluate(() => {
    const dt = [...document.querySelectorAll('#ficha dt')].find(x => x.textContent === 'Assinatura');
    dt.nextElementSibling.querySelector('.div-flag').click();
  });
  const itens = await page.$$eval('.popover li', lis => lis.map(l => l.textContent));
  assert.deepEqual(itens, ['20/01/2026 (p. 97)']);
  await page.keyboard.press('Escape');
});

test('v4: comparador tem a fonte do deságio e Fontes lista a verificação', async () => {
  await go('#projetos');
  const ths = await page.$$eval('#proj-table thead th', t => t.map(x => x.textContent.trim().replace(/ [↑↓]$/, '')));
  const i = ths.indexOf('Fonte do deságio');
  assert.equal(ths[i - 1], 'Deságio');
  const vals = await page.$$eval(`#proj-table tbody tr td:nth-child(${i + 1})`, t => [...new Set(t.map(x => x.textContent))]);
  assert.ok(vals.includes('oficial') && vals.includes('RoadShow'), vals.join());
  await go('#fontes');
  assert.match(await page.textContent('#fontes-verif-cobertura'), /\d+ leilões conferidos; campos por origem: \d+ oficial/);
  const n = await page.locator('#fontes-verificacao-table tbody tr').count();
  assert.equal(n, await page.evaluate(() => window.CONC.verificacao.fontes.length));
  assert.equal(await page.getAttribute('#fontes-verificacao-table', 'data-csv-name'), 'fontes-verificacao');
  assert.ok(await page.locator('#fontes-verificacao-table .selo--imprensa').count() > 0);
});

test('nenhuma requisição externa', () => assert.deepEqual(external, []));

test('sem erros no console', () => assert.deepEqual(errors, []));

test('fonte Inter embutida carregada', async () => {
  assert.equal(await page.evaluate(async () => { await document.fonts.ready; return document.fonts.check('16px Inter'); }), true);
});

test('filtro aplicado em menos de 200 ms', async () => {
  const before = await kpi();
  const det = page.locator('details[data-group="uf"]');
  if (!(await det.evaluate(d => d.open))) await det.locator('summary').click();
  const ms = await page.evaluate(() => new Promise(resolve => {
    const target = document.getElementById('stats-section');
    const input = document.querySelector('input[data-filter="uf"][data-label="MG"]');
    const t0 = performance.now();
    new MutationObserver((_, obs) => { obs.disconnect(); resolve(performance.now() - t0); })
      .observe(target, { childList: true, subtree: true, characterData: true });
    input.click();
  }));
  assert.notEqual(await kpi(), before);
  assert.ok(ms < 200, `levou ${ms.toFixed(0)} ms`);
});
