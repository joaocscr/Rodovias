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
  await page.goto('file://' + HTML + '#mapa');  // a página inicial é o Resumo; estes testes partem do mapa
  await page.waitForSelector('#kpi-km');
});
after(async () => { await browser?.close(); });

const kpi = () => page.textContent('#kpi-km');
// v4: linha da ficha (dd) pelo rótulo (dt)
const fichaDd = rotulo => page.evaluate(r => {
  const dt = [...document.querySelectorAll('#ficha dt')].find(x => x.textContent === r);
  return dt ? { html: dt.nextElementSibling.innerHTML, text: dt.nextElementSibling.textContent } : null;
}, rotulo);
// KPI sem filtro calculado pelo modelo na própria página (o valor muda com o SNV; o número conferido está no pytest)
const kpiInicial = () => page.evaluate(() => {
  const f = Model.emptyFilters(), a = Model.aggregate(window.SNV, f, Model.visibleFis(window.SNV, f));
  return { km: Model.fmtKm(a.km), n: new Intl.NumberFormat('pt-BR').format(a.n), total: a.n === window.SNV.fis.length };
});
async function check(group, label) {
  const det = page.locator(`details[data-group="${group}"]`);
  if (!(await det.evaluate(d => d.open))) await det.locator('summary').click();
  await page.locator(`input[data-filter="${group}"][data-label="${label}"]`).check();
}

test('KPI inicial', async () => {
  const k = await kpiInicial();
  assert.ok(k.total, 'sem filtro, todos os trechos físicos');
  assert.equal((await kpi()).trim(), k.km);
  assert.equal((await page.textContent('#kpi-n')).trim(), `${k.n} trechos`);
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
  assert.equal((await kpi()).trim(), (await kpiInicial()).km);
});

test('busca 116 realça a BR inteira sem mudar o KPI', async () => {
  await page.fill('#search-input', '116');
  await page.waitForSelector('#suggestions li');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  assert.ok(await page.evaluate(() => MapView.highlighted().length) > 10);
  assert.equal((await kpi()).trim(), (await kpiInicial()).km);
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

test('barra de abas (Resumo primeiro, Glossário por último) e Mapa ativa', async () => {
  await go('#mapa');
  assert.deepEqual(await page.$$eval('#tabs a', as => as.map(a => a.textContent)), ['Resumo', 'Mapa', 'Projetos', 'Tráfego', 'Cargas', 'Mercado', 'Regulatório', 'Fontes', 'Glossário']);
  assert.equal(await page.textContent('#tabs a.is-active'), 'Mapa');
});

test('voltar restaura a aba anterior', async () => {
  await go('#mapa'); await go('#projetos');
  assert.equal(await page.isVisible('#page-projetos'), true);
  await page.goBack(); await page.waitForTimeout(250);
  assert.equal(await page.isVisible('#map'), true);
  assert.equal(await page.isVisible('#page-projetos'), false);
});

test('hash inválido cai no Resumo (página inicial)', async () => {
  await go('#xyz');
  assert.equal(await page.evaluate(() => location.hash), '#resumo');
  assert.equal(await page.isVisible('#page-resumo'), true);
  await go('#ficha/nao-existe');
  assert.equal(await page.evaluate(() => location.hash), '#resumo');
  assert.equal(await page.isVisible('#ficha'), false);
  await go('#mapa');
});

// Glossário: a aba lista os termos do glossario.json (embutido) em ordem alfabética; a busca e as categorias filtram; os links das outras
// abas abrem o termo. As expectativas vêm do próprio Glossario/GLOSSARIO da página, sem textos digitados no teste.
const glossIds = () => page.$$eval('#gloss-lista .gloss-item', es => es.map(e => e.dataset.id));
const glossEsperado = (q, cat) => page.evaluate(([qq, c]) => Glossario.filtrar(Glossario.ordenar(window.GLOSSARIO), qq, c).map(e => e.id), [q, cat]);

test('glossário: a aba existe e lista todos os termos em ordem alfabética, com definição', async () => {
  await go('#mapa');
  await page.click('#tabs a[href="#glossario"]');
  await page.waitForSelector('#gloss-lista .gloss-item');
  assert.equal(await page.textContent('#tabs a.is-active'), 'Glossário');
  assert.equal(await page.isVisible('#page-glossario'), true);
  assert.equal(await page.isVisible('#map'), false);
  const todos = await page.evaluate(() => Glossario.ordenar(window.GLOSSARIO).map(e => e.id));
  assert.ok(todos.length >= 30, `${todos.length} termos`);
  assert.deepEqual(await glossIds(), todos);
  assert.equal((await page.textContent('#gloss-n')).trim(), `${todos.length} termos`);
  const vazios = await page.$$eval('#gloss-lista .gloss-item', es => es.filter(e => e.querySelector('dd p').textContent.trim().length < 20 || !e.querySelector('dt').textContent.trim()).map(e => e.dataset.id));
  assert.deepEqual(vazios, []);
  // fonte de norma vira link externo seguro; sem rede ao abrir a aba (a checagem global vem no fim do arquivo)
  const ext = await page.$$eval('#gloss-lista a[href^="http"]', as => as.map(a => ({ t: a.target, rel: a.rel })));
  assert.ok(ext.length > 0 && ext.every(a => a.t === '_blank' && /noopener/.test(a.rel)));
});

test('glossário: busca por termo, sigla ou definição ignora acento e caixa; categorias filtram; vazio avisa', async () => {
  await go('#glossario');
  const todos = await glossEsperado('', '');
  for (const q of ['deságio', 'DESAGIO', 'vmda', 'ntn']) {
    await page.fill('#gloss-q', q);
    const esperado = await glossEsperado(q, '');
    assert.ok(esperado.length > 0 && esperado.length < todos.length, q);
    assert.deepEqual(await glossIds(), esperado, q);
    assert.equal((await page.textContent('#gloss-n')).trim(), `${esperado.length} de ${todos.length} termos`, q);
  }
  await page.fill('#gloss-q', 'deságio');
  assert.ok((await glossIds()).includes('desagio'));
  await page.fill('#gloss-q', 'zzzxyz');
  assert.deepEqual(await glossIds(), []);
  assert.equal(await page.isVisible('#gloss-vazio'), true);
  await page.fill('#gloss-q', '');
  assert.deepEqual(await glossIds(), todos);
  assert.equal(await page.isVisible('#gloss-vazio'), false);
  // categoria
  const cat = await page.evaluate(() => Glossario.categorias(window.GLOSSARIO).find(c => /Debêntures/.test(c)));
  await page.click(`.gloss-cat[data-cat="${cat}"]`);
  const dosCat = await glossEsperado('', cat);
  assert.ok(dosCat.length > 5 && dosCat.length < todos.length);
  assert.deepEqual(await glossIds(), dosCat);
  assert.equal(await page.getAttribute(`.gloss-cat[data-cat="${cat}"]`, 'aria-pressed'), 'true');
  await page.fill('#gloss-q', 'spread');
  assert.deepEqual(await glossIds(), await glossEsperado('spread', cat));
  await page.click('.gloss-cat[data-cat=""]');
  await page.fill('#gloss-q', '');
  assert.deepEqual(await glossIds(), todos);
});

test('glossário: link em outra aba abre o termo, rola até ele e o destaca; voltar retorna à aba', async () => {
  await go('#mapa');
  const link = page.locator('#layers-section a.glossario-link[href="#glossario/vmda"]');
  assert.equal(await link.count(), 1);
  await link.click();
  await page.waitForFunction(() => Tabs.current().active === 'glossario' && document.querySelector('#gloss-vmda'));
  assert.equal(await page.evaluate(() => location.hash), '#glossario/vmda');
  const item = page.locator('#gloss-vmda');
  assert.equal(await item.isVisible(), true);
  assert.match(await item.getAttribute('class'), /is-alvo/);
  const box = await item.boundingBox();
  const alto = page.viewportSize().height;  // termos do fim da lista não sobem ao topo: basta estar todo à vista
  assert.ok(box.y >= 0 && box.y + box.height <= alto, `termo fora da tela (y=${box.y}, h=${box.height}, tela=${alto})`);
  assert.equal(await page.locator('.is-alvo').count(), 1);
  await page.goBack();
  await page.waitForFunction(() => Tabs.current().active === 'mapa');
  assert.equal(await page.isVisible('#map'), true);
});

test('glossário: termo escondido por busca/categoria reaparece pela rota; id desconhecido não quebra', async () => {
  await go('#glossario');
  await page.fill('#gloss-q', 'zzzxyz');
  assert.deepEqual(await glossIds(), []);
  await go('#glossario/spread');
  assert.equal(await page.inputValue('#gloss-q'), '');
  assert.equal(await page.isVisible('#gloss-spread'), true);
  assert.match(await page.getAttribute('#gloss-spread', 'class'), /is-alvo/);
  await go('#glossario/nao-existe-xyz');
  assert.equal(await page.evaluate(() => Tabs.current().active), 'glossario');
  assert.equal(await page.locator('#gloss-lista .gloss-item').count() > 0, true);
  assert.equal(await page.locator('.is-alvo').count(), 0);
  await go('#mapa');
});

test('glossário: os links das abas apontam só para termos que existem no arquivo embutido', async () => {
  const ausentes = [];
  for (const h of ['#resumo', '#mapa', '#projetos', '#trafego', '#cargas', '#mercado', '#regulatorio']) {
    await go(h);
    const ids = await page.$$eval(`[data-tab="${h.slice(1)}"] a.glossario-link, ${h === '#mapa' ? '#panel a.glossario-link' : '.nada'}`,
      as => [...new Set(as.map(a => decodeURIComponent(a.getAttribute('href').replace('#glossario/', ''))))]);
    const faltam = await page.evaluate(l => l.filter(i => !window.GLOSSARIO.some(e => e.id === i)), ids);
    ausentes.push(...faltam.map(i => `${h}: ${i}`));
    if (h !== '#mapa') assert.ok(ids.length > 0, `${h} sem nenhum link do glossário`);
  }
  assert.deepEqual(ausentes, []);
  await go('#mapa');
});

// Fechamento: Resumo é a página inicial; KPIs e achados iguais ao que o modelo calcula na própria página (sem literais).
test('resumo é a página inicial e o mapa abre por #mapa', async () => {
  const errs = [], ext = [];
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.route('**/*', r => {
    const url = r.request().url();
    if (url.startsWith('file:') || url.startsWith('data:')) return r.continue();
    ext.push(url);
    return r.abort();
  });
  const p = await context.newPage();
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto('file://' + HTML);
  await p.waitForSelector('#page-resumo .page__inner');
  assert.equal(await p.isVisible('#page-resumo'), true);
  assert.equal(await p.isVisible('#map'), false);
  assert.equal(await p.textContent('#tabs a.is-active'), 'Resumo');

  const modelo = await p.evaluate(() => ({
    kpis: LeiloesModel.resumoKpis(window.CONC, window.INTEL, window.SNV)
      .map(k => ({ id: k.id, texto: k.texto, rotulo: k.rotulo, nota: k.nota ?? null, fonte: `Fonte: ${k.fonte}` })),
    achados: LeiloesModel.resumoAchados(window.CONC, window.INTEL)
      .map(a => ({ id: a.id, titulo: a.titulo, texto: a.texto, formula: a.formula, fonte: `Fonte: ${a.fonte}` })),
  }));
  assert.ok(modelo.kpis.length > 0 && modelo.achados.length > 0);
  const tela = await p.evaluate(() => ({
    kpis: [...document.querySelectorAll('#resumo-kpis .kpi-tile')].map(t => ({ id: t.dataset.kpi, texto: t.querySelector('b').textContent,
      rotulo: t.querySelector('span').textContent, nota: t.querySelector('.kpi-nota')?.textContent ?? null, fonte: t.querySelector('.kpi-src').textContent })),
    achados: [...document.querySelectorAll('#resumo-achados .achado')].map(a => ({ id: a.dataset.achado, titulo: a.querySelector('h3').textContent,
      texto: a.querySelector('.achado__texto').textContent, formula: a.querySelector('details p').textContent, fonte: a.querySelector('.src').textContent })),
    resumos: [...document.querySelectorAll('#resumo-achados details > summary')].map(s => s.textContent),
  }));
  assert.deepEqual(tela.kpis, modelo.kpis);
  assert.deepEqual(tela.achados, modelo.achados);
  assert.deepEqual(tela.resumos, modelo.achados.map(() => 'Como foi calculado'));
  // a malha do Resumo é a mesma do KPI do mapa (sem filtro)
  const malha = await p.evaluate(() => {
    const f = Model.emptyFilters();
    return Model.aggregate(window.SNV, f, Model.visibleFis(window.SNV, f)).km;
  });
  assert.equal(await p.evaluate(() => LeiloesModel.resumoKpis(window.CONC, window.INTEL, window.SNV).find(k => k.id === 'malha').valor), malha);
  // a concessão é o último ano da série de gestão que o Mercado desenha (mesma fonte, mesmo número)
  const ges = await p.evaluate(() => {
    const g = window.CONC.mercado.gestao.reduce((x, y) => (y.ano > x.ano ? y : x));
    return { km: g.privada_km, kpi: LeiloesModel.resumoKpis(window.CONC, window.INTEL, window.SNV).find(k => k.id === 'concessao').valor };
  });
  assert.equal(ges.kpi, ges.km);
  assert.doesNotMatch(await p.textContent('#page-resumo'), /undefined|NaN|null|Infinity/);
  assert.match(await p.textContent('#resumo-aviso'), /dados públicos; não é recomendação/);
  // atalhos para todas as outras abas, na ordem da barra
  assert.deepEqual(await p.$$eval('#resumo-atalhos a', as => as.map(a => a.getAttribute('href'))),
    await p.evaluate(() => Tabs.abas().map(t => '#' + t.k).filter(h => h !== '#resumo')));

  // o mapa, montado enquanto o Resumo estava na tela, abre pelo atalho e é desenhado no tamanho do contêiner
  await p.click('#resumo-atalhos a[href="#mapa"]');
  await p.waitForFunction(() => Tabs.current().active === 'mapa');
  await p.waitForTimeout(100);  // invalidateSize roda num setTimeout 0 depois de exibir a aba
  assert.equal(await p.evaluate(() => location.hash), '#mapa');
  assert.equal(await p.isVisible('#map'), true);
  assert.equal(await p.isVisible('#page-resumo'), false);
  assert.equal(await p.textContent('#tabs a.is-active'), 'Mapa');
  const vista = await p.evaluate(() => {
    const s = MapView.map.getSize(), el = document.getElementById('map');
    return { w: s.x, h: s.y, cw: el.clientWidth, ch: el.clientHeight, brasilia: MapView.map.getBounds().contains([-15.8, -47.9]) };
  });
  assert.ok(vista.w > 0 && vista.h > 0);
  assert.deepEqual([vista.w, vista.h], [vista.cw, vista.ch]);
  assert.ok(vista.brasilia, 'vista inicial sobre o Brasil');
  // voltar leva de novo ao Resumo
  await p.goBack();
  await p.waitForFunction(() => Tabs.current().active === 'resumo');
  assert.equal(await p.isVisible('#page-resumo'), true);
  assert.deepEqual(errs, []);
  assert.deepEqual(ext, []);
  await context.close();
});

// "Sobre este painel": as linhas, a data-base e o acesso na tela são os do modelo (lidos dos blocos embutidos), sem texto digitado.
test('resumo: Sobre este painel mostra as fontes, a data-base e o acesso do modelo', async () => {
  const p = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto('file://' + HTML);
  await p.waitForSelector('#resumo-sobre');
  const modelo = await p.evaluate(() => ResumoModel.sobrePainel(window.CONC, window.INTEL, window.FONTES_DESCRICAO));
  assert.deepEqual(modelo.semDescricao, [], `fontes sem descrição: ${modelo.semDescricao.join(', ')}`);
  assert.ok(modelo.fontes.length >= 13);
  assert.deepEqual(await p.$$eval('#resumo-sobre h3, #resumo-sobre summary', es => es.map(e => e.firstChild.textContent.trim())),
    ['Para que serve', 'De onde vêm as informações', 'Data-base das informações']);
  // "De onde vêm": uma linha por fonte do modelo, com a frase curada
  assert.deepEqual(await p.$$eval('#sobre-fontes li', ls => ls.map(l => l.dataset.fonte)), modelo.fontes.map(f => f.id));
  const frases = await p.$$eval('#sobre-fontes li', ls => ls.map(l => l.textContent));
  modelo.fontes.forEach((f, i) => { assert.ok(frases[i].includes(f.nome) && frases[i].includes(f.oQue), f.id); });
  // o RoadShow é explicado, com a edição que vem do dado
  const rs = modelo.fontes.find(f => f.id === 'roadshow');
  assert.match(rs.oQue, /^Apresentação do Ministério dos Transportes a investidores sobre a carteira de concessões rodoviárias 2026–2027, /);
  assert.ok(rs.oQue.includes(await p.evaluate(() => window.CONC.edicaoRoadshow)));
  // "Data-base": a tabela é a do modelo
  assert.deepEqual(await p.$$eval('#sobre-table thead th', hs => hs.map(h => h.textContent)), ['Informação', 'Data-base', 'Acesso']);
  assert.deepEqual(await p.$$eval('#sobre-table tbody tr', rs2 => rs2.map(r => [r.dataset.fonte, ...[...r.cells].map(c => c.textContent)])),
    modelo.fontes.map(f => [f.id, f.nome, f.dataBase, f.acesso]));
  assert.ok(modelo.fontes.every(f => /^(\d{2}\/\d{2}\/\d{4})( a \d{2}\/\d{2}\/\d{4})?$/.test(f.acesso)), 'acesso em dd/mm/aaaa');
  // os recolhidos abrem pelo título; termos técnicos levam ao glossário
  assert.equal(await p.evaluate(() => document.getElementById('sobre-database').open), false);
  await p.click('#sobre-database > summary');
  assert.equal(await p.isVisible('#sobre-table'), true);
  const hrefs = await p.$$eval('#resumo-sobre a.glossario-link', as => as.map(a => a.getAttribute('href')));
  assert.ok(hrefs.includes('#glossario/roadshow'));
  // termos declarados nas descrições viram link na frase da fonte (primeira menção), com o texto declarado
  for (const f of modelo.fontes) for (const t of f.termos) {
    assert.equal(await p.locator(`#sobre-fontes li[data-fonte="${f.id}"] a[href="#glossario/${t.id}"]`).first().textContent(), t.texto, `${f.id}: ${t.id}`);
  }
  assert.ok(modelo.fontes.some(f => f.termos.length > 1), 'alguma linha liga mais de um termo');
  // data-base de bloco com várias fontes não parece série contínua; a legenda explica
  assert.ok(modelo.fontes.some(f => /^varia por fonte \(de \d{4} a \d{4}\)$/.test(f.dataBase)));
  assert.match(await p.textContent('#sobre-legenda'), /varia por fonte.*não uma série contínua.*aba Fontes/);
  const ids = await p.evaluate(() => window.GLOSSARIO.map(e => e.id));
  for (const h of hrefs) assert.ok(ids.includes(decodeURIComponent(h.split('/')[1])), h);
  assert.doesNotMatch(await p.textContent('#resumo-sobre'), /undefined|NaN|null|\{edicao\}/);
  assert.deepEqual(errs, []);
  await p.close();
});

// Celular (390×844): nem o Resumo nem o mapa alargam a página (a barra de abas rola dentro do topo).
test('celular: nenhuma aba (Resumo, mapa, Projetos, Tráfego, Cargas, Mercado, Regulatório, Fontes, Glossário) com rolagem horizontal da página', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.route('**/*', r => (/^(file|data):/.test(r.request().url()) ? r.continue() : r.abort()));
  const p = await context.newPage();
  await p.goto('file://' + HTML);
  await p.waitForSelector('#page-resumo .page__inner');
  for (const h of ['#resumo', '#mapa', '#projetos', '#trafego', '#cargas', '#mercado', '#regulatorio', '#fontes', '#glossario', '#glossario/vmda']) {
    await p.evaluate(x => { location.hash = x; }, h);
    await p.waitForFunction(x => Tabs.current().active === x.slice(1).split('/')[0], h);
    await p.waitForTimeout(100);
    if (h === '#resumo') await p.evaluate(() => document.querySelectorAll('#resumo-sobre details').forEach(d => { d.open = true; }));  // tabela de data-base aberta
    if (h === '#cargas') await p.waitForSelector('#pnl-table');  // a tabela da PNL alargava a página (texto oculto fora da caixa)
    const w = await p.evaluate(() => {
      const pg = document.querySelector('.page:not([hidden])');
      return { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth,
        // a própria aba não rola na horizontal (tabelas e gráficos largos rolam dentro das suas caixas)
        aba: pg ? pg.scrollWidth - pg.clientWidth : 0,
        pw: Math.max(...[...document.querySelectorAll('.page:not([hidden]), .page:not([hidden]) *')].map(e => e.scrollWidth - e.clientWidth)) };
    });
    assert.ok(w.sw <= w.cw, `${h}: scrollWidth ${w.sw} > clientWidth ${w.cw}`);
    assert.ok(w.aba <= 0, `${h}: a aba rola na horizontal (${w.aba}px)`);
    if (h === '#resumo' || h.startsWith('#glossario')) assert.ok(w.pw <= 0, `${h}: algo na aba alarga além da tela (${w.pw}px)`);
    assert.equal(await p.isVisible('#drawer-toggle'), true, h);
  }
  await context.close();
});

test('modo concessões é o padrão e a legenda lista os estados', async () => {
  await go('#mapa');
  assert.equal(await page.evaluate(() => MapView.colorMode()), 'concessoes');
  const rotulos = await page.evaluate(() => window.CONC.estados.filter(s => s.key !== 'nenhum').map(s => s.label));
  const leg = await page.textContent('#legend');
  for (const r of rotulos) assert.ok(leg.includes(r), r);
  await page.click('[data-mode="fisica"]');
  assert.equal(await page.evaluate(() => MapView.colorMode()), 'fisica');
  assert.match(await page.textContent('#legend'), /Duplicada/);
  await page.click('[data-mode="concessoes"]');
});

test('filtro de estado Projeto 2027 bate com o modelo', async () => {
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

test('busca por nome de projeto realça a entidade', async () => {
  await go('#mapa');
  await page.fill('#search-input', 'Rotas Gerais');
  await page.waitForSelector('#suggestions li');
  assert.match(await page.locator('#suggestions li').first().textContent(), /Rotas Gerais/);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  assert.ok(await page.evaluate(() => MapView.highlighted().length) > 0);
  await page.click('#clear-search');
});

test('trecho da Transbrasiliana lista contrato e otimização e leva à ficha', async () => {
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

test('ficha da Rotas Gerais', async () => {
  await go('#ficha/rotas-gerais');
  const t = await page.textContent('#ficha');
  const x = await page.evaluate(() => {
    const e = window.CONC.entidades.find(z => z.id === 'rotas-gerais'), f = e.ficha;
    return { s: [Model.fmtKm(e.km), ConcModel.fmtBi(e.capex_ficha), ConcModel.fmtPct(f.wacc)], pracas: f.pracas_implantar };
  });
  for (const s of x.s) assert.ok(t.includes(s), s);
  assert.equal((await fichaDd('Praças a implantar')).text, String(x.pracas));
  assert.ok(await page.locator('#ficha-capex rect.cbar').count() >= 5);
});

test('ficha: recorte conferido explicado em linguagem simples (sem "≤")', async () => {
  const id = await page.evaluate(() => window.CONC.entidades.find(e => e.qualidade === 'ok').id);
  await go('#ficha/' + id);
  const t = await page.textContent('#ficha');
  assert.match(t, /difere no máximo 5% \(ou 10 km\) da extensão informada no RoadShow/);
  assert.doesNotMatch(t, /≤/);
});

// Pista pelo SNV: a ficha e o cartão do mapa mostram o que o modelo (pistaSNV) calcula na própria página.
const numPt = t => Number(t.replace(/\./g, '').replace(',', '.'));
for (const qualidade of ['ok', 'aproximado']) {
  test(`ficha: bloco "Pista no SNV" bate com o modelo (recorte ${qualidade})`, async () => {
    const { id, p } = await page.evaluate(q => {
      const i = window.CONC.entidades.findIndex((e, k) => e.qualidade === q && window.CONC.entFis[k].length);
      return { id: window.CONC.entidades[i].id, p: ConcModel.pistaSNV(window.CONC, window.SNV, i) };
    }, qualidade);
    assert.equal(p.semRecorte, false);
    await go('#ficha/' + id);
    const bloco = page.locator('#ficha section.fblock', { has: page.locator('h3', { hasText: 'Pista no SNV' }) });
    assert.equal(await bloco.count(), 1);
    let soma = 0;
    for (const k of ['duplicada', 'obraDup', 'simples', 'naoPav']) {
      const dd = bloco.locator(`dd[data-pista="${k}"]`);
      if (p[k] > 0) {
        const m = /^([\d.,]+) km \(([\d.,]+)%\)$/.exec((await dd.textContent()).trim());
        assert.ok(m, k);
        assert.ok(Math.abs(numPt(m[1]) - p[k]) <= 0.05, `${k} km`);
        assert.ok(Math.abs(numPt(m[2]) - 100 * p[k] / p.km) <= 0.05, `${k} %`);
        soma += numPt(m[1]);
      } else assert.equal(await dd.count(), 0, k);
    }
    const tot = numPt(/^([\d.,]+) km$/.exec((await bloco.locator('dd[data-pista="km"]').textContent()).trim())[1]);
    assert.ok(Math.abs(tot - p.km) <= 0.05);
    assert.ok(Math.abs(soma - tot) <= 0.3, 'categorias somam o total (tolerância de arredondamento)');
    assert.match(await bloco.textContent(), /Pelo recorte curado; aproximado quando o recorte é aproximado/);
    // a explicação "Sem pavimento ou planejada" só aparece quando a categoria aparece
    assert.equal(/reúne leito natural/.test(await bloco.textContent()), p.naoPav > 0, `naoPav = ${p.naoPav}`);
    assert.doesNotMatch(await bloco.textContent(), /undefined|null|NaN/);
  });
}

test('ficha: concessão sem recorte mostra "sem recorte", nunca 0 km', async () => {
  // força a qualidade "falha" numa cópia em memória (o dado não muda) e volta ao valor original
  const { id, q } = await page.evaluate(() => {
    const e = window.CONC.entidades.find((x, k) => window.CONC.entFis[k].length);
    const q = e.qualidade; e.qualidade = 'falha';
    return { id: e.id, q };
  });
  try {
    await go('#ficha/' + id);
    assert.match(await page.textContent('#ficha'), /Sem recorte no SNV/);
    assert.equal(await page.locator('#ficha dd[data-pista]').count(), 0);
    assert.doesNotMatch(await page.textContent('#ficha'), /Pista no SNV[\s\S]*\b0 km/);
  } finally {
    await page.evaluate(([i, v]) => { window.CONC.entidades.find(e => e.id === i).qualidade = v; }, [id, q]);
    await go('#mapa');
  }
});

test('cartão do mapa: uma linha resumo da pista da concessão, igual ao modelo', async () => {
  await go('#mapa');
  const { j, linha, id } = await page.evaluate(() => {
    const c = window.CONC, i = c.entidades.findIndex((e, k) => c.entFis[k].length && !ConcModel.pistaSNV(c, window.SNV, k).semRecorte);
    return { j: c.entFis[i][0], id: c.entidades[i].id, linha: ConcModel.pistaLinha(ConcModel.pistaSNV(c, window.SNV, i)) };
  });
  await page.evaluate(j => MapView.pick(j), j);
  await page.waitForSelector('#card:not([hidden])');
  const el = page.locator(`#card [data-pista-resumo="${id}"]`);
  assert.equal(await el.count(), 1);
  assert.equal((await el.textContent()).trim(), `Pista da concessão: ${linha}`);
  assert.match(linha, /^[\d.,]+ km no SNV · [\d.,]+% /);
  await page.keyboard.press('Escape');
});

test('ficha da Rota dos Sertões mostra data-base e valor dez/2024', async () => {
  await go('#ficha/rota-dos-sertoes');
  const t = await page.textContent('#ficha');
  const x = await page.evaluate(() => {
    const e = window.CONC.entidades.find(z => z.id === 'rota-dos-sertoes');
    return { difere: e.data_base !== e.data_base_ficha, s: [ConcModel.fmtBi(e.capex_ficha), e.data_base_ficha, `${ConcModel.fmtBi(e.capex)} em ${e.data_base}`] };
  });
  assert.ok(x.difere, 'a ficha tem data-base própria');
  for (const s of x.s) assert.ok(t.includes(s), s);
});

test('aviso de divergência mostra páginas', async () => {
  const id = await page.evaluate(() => window.CONC.entidades.find(e => (e.divergencias || []).length).id);
  await go('#ficha/' + id);
  await page.locator('.div-flag').first().click();
  const t = await page.textContent('.popover');
  assert.match(t, /Divergência entre fontes/);
  assert.match(t, /p\. \d+/);
});

test('ficha de contrato antigo sem undefined/null/NaN', async () => {
  const id = await page.evaluate(() => window.CONC.entidades.find(e => e.estado === 'vigente' && !e.ficha).id);
  await go('#ficha/' + id);
  assert.equal(await page.isVisible('#ficha-title'), true);
  const t = await page.textContent('#ficha');
  assert.ok(t.length > 100);
  assert.ok(!/undefined|null|NaN/.test(t), t.slice(0, 200));
  assert.equal(await page.locator('#ficha .fblock h3 + :empty').count(), 0);
});

test('ver no mapa a partir da ficha', async () => {
  await go('#ficha/rotas-gerais');
  await page.click('#ficha-map');
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => location.hash), '#mapa');
  assert.ok(await page.evaluate(() => MapView.highlighted().length) > 0);
  await page.evaluate(() => MapView.highlight(null));
});

test('Esc fecha a ficha e volta ao hash anterior', async () => {
  await go('#projetos'); await go('#ficha/rotas-gerais');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  assert.equal(await page.evaluate(() => location.hash), '#projetos');
  assert.equal(await page.isVisible('#ficha'), false);
});

test('comparador com todas as concessões federais, ordenação, filtro e totais', async () => {
  await go('#projetos');
  // v3: com concessões estaduais no arquivo, as entidades do RoadShow são a esfera federal
  if (await page.locator('#proj-esfera').count()) await page.selectOption('#proj-esfera', 'federal');
  const n = await page.evaluate(() => {
    const c = window.CONC;
    return { todas: c.entidades.length, p2027: c.entidades.filter(e => e.estado === 'projeto2027').length, estudos: c.estudos.length };
  });
  assert.ok(n.p2027 > 0 && n.p2027 < n.todas);
  assert.equal(await page.locator('#proj-table tbody tr').count(), n.todas);
  await page.click('[data-sort="capexKm"]');
  let vals = await page.evaluate(() => Projetos.rowsShown().map(r => r.capexKm));
  const nn = vals.filter(v => v != null);
  assert.deepEqual(nn, [...nn].sort((a, b) => b - a));
  assert.ok(vals.slice(nn.length).every(v => v == null));
  await page.click('[data-sort="desagio"]');
  vals = await page.evaluate(() => Projetos.rowsShown().map(r => r.desagio).filter(v => v != null));
  assert.deepEqual(vals, [...vals].sort((a, b) => b - a));
  await page.click('[data-f="estado"][data-v="projeto2027"]');
  assert.equal(await page.locator('#proj-table tbody tr').count(), n.p2027);
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
  assert.equal(await page.locator('#estudos-list li').count(), n.estudos);
  if (await page.locator('#proj-esfera').count()) await page.selectOption('#proj-esfera', '');
});

test('aba Mercado tem gráficos com fonte e tooltip', async () => {
  await go('#mercado');
  assert.ok(await page.locator('#page-mercado svg.chart').count() >= 7);
  const semFonte = await page.$$eval('#page-mercado .ccard', cs => cs.filter(c => ![...c.querySelectorAll('.src')].some(s => s.textContent.startsWith('Fonte:'))).length);
  assert.equal(semFonte, 0);
  const l0 = await page.evaluate(() => window.CONC.mercado.leiloes_por_ano[0]);
  assert.equal(await page.locator('#chart-leiloes rect.cbar title').first().textContent(), `${l0.ano}: ${l0.n} leilões`);
});

test('aba Regulatório com índice, otimizações e estudos', async () => {
  await go('#regulatorio');
  const reg = await page.evaluate(() => ({ secoes: window.CONC.regulatorio.secoes.length, otim: window.CONC.regulatorio.otimizacoes.length }));
  assert.equal(await page.locator('.reg__toc a').count(), reg.secoes);
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
  assert.equal(await page.locator('#otimizacoes tbody tr').count(), reg.otim);
  await page.locator('#page-regulatorio [data-estudo]:not([disabled])').first().click();
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => location.hash), '#mapa');
  assert.ok(await page.evaluate(() => MapView.highlighted().length) > 0);
  await page.evaluate(() => MapView.highlight(null));
});

test('troca de aba em menos de 300 ms', async () => {
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

test('hash com percent-encoding inválido cai no Resumo', async () => {
  const before = errors.length;
  await go('#ficha/%E0%A4%A');
  assert.equal(await page.evaluate(() => location.hash), '#resumo');
  assert.equal(errors.length, before);
});

test('ver no mapa vira destaque com chip e pode ser limpo', async () => {
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

test('total do comparador avisa bases mistas', async () => {
  await go('#projetos');
  await page.click('[data-f="estado"][data-v="projeto2027"]');
  assert.match(await page.textContent('#proj-table tfoot'), /bases mistas/i);
  await page.click('[data-f="estado"][data-v="projeto2027"]');
  await page.click('[data-f="estado"][data-v="vigente"]');
  assert.doesNotMatch(await page.textContent('#proj-table tfoot'), /bases mistas/i);
  await page.click('[data-f="estado"][data-v="vigente"]');
});

test('gráfico de investimento por grupo usa o nome completo', async () => {
  await go('#mercado');
  const full = await page.evaluate(() => window.CONC.mercado.grupos.map(g => g.grupo));
  const txt = await page.textContent('#chart-gruposInv');
  assert.ok(full.filter(n => n.includes(' ')).every(n => txt.includes(n)), 'nomes completos');
});

test('toda table.grid visível tem botão CSV', async () => {
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

test('CSV do comparador respeita filtro', async () => {
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

test('CSV do pipeline exporta só o nome, sem a observação recolhida', async () => {
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

test('CSV protege células que começam como fórmula', async () => {
  await go('#fontes');
  // injeta numa linha visível valores que o Excel leria como fórmula e restaura depois
  const orig = await page.evaluate(() => {
    const tds = document.querySelectorAll('#fontes-verificacao-table tbody tr:first-child td');
    const o = [tds[0].innerHTML, tds[1].innerHTML];
    tds[0].textContent = '=HYPERLINK("http://x")';
    tds[1].textContent = '-5';
    return o;
  });
  try {
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('.csv-btn:has(+ .table-wrap #fontes-verificacao-table)').click(),
    ]);
    const txt = (await import('node:fs')).readFileSync(await download.path(), 'utf8');
    const l1 = txt.split('\r\n')[1];
    assert.ok(l1.startsWith(`"'=HYPERLINK(""http://x"")";"'-5";`), l1);
  } finally {
    await page.evaluate(o => {
      const tds = document.querySelectorAll('#fontes-verificacao-table tbody tr:first-child td');
      tds[0].innerHTML = o[0]; tds[1].innerHTML = o[1];
    }, orig);
  }
});

// lê o CSV baixado ao clicar no botão da tabela (seletor da tabela)
async function exportaCsv(sel) {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator(`.csv-btn:has(+ .table-wrap ${sel})`).click(),
  ]);
  return (await import('node:fs')).readFileSync(await download.path(), 'utf8').split('\r\n');
}

test('fechamento: CSV deixa de fora a linha escondida (display:none) da tabela visível', async () => {
  await go('#mercado');
  const anos = await anosPart();
  await page.selectOption('#rank-de', String(anos[0]));
  await page.selectOption('#rank-ate', String(anos[anos.length - 1]));
  const grupos = await page.$$eval('#ranking-grupos tbody tr', trs => trs.map(tr => tr.firstElementChild.textContent.trim()));
  assert.ok(grupos.length >= 3 && new Set(grupos).size === grupos.length, 'nomes de grupo únicos');
  const linhaDe = g => `"${g.replace(/"/g, '""')}";`;
  const todas = await exportaCsv('#ranking-grupos');
  assert.equal(todas.length, grupos.length + 1);
  const alvo = grupos[1];
  assert.ok(todas.some(l => l.startsWith(linhaDe(alvo))), 'controle: sem esconder, a linha sai');
  await page.evaluate(() => { document.querySelectorAll('#ranking-grupos tbody tr')[1].style.display = 'none'; });
  try {
    const parcial = await exportaCsv('#ranking-grupos');
    assert.equal(parcial.length, grupos.length, 'uma linha a menos');
    assert.ok(!parcial.some(l => l.startsWith(linhaDe(alvo))), `linha escondida (${alvo}) não pode sair no CSV`);
    for (const g of grupos.filter(x => x !== alvo)) assert.ok(parcial.some(l => l.startsWith(linhaDe(g))), `${g} segue no CSV`);
  } finally {
    await page.evaluate(() => { document.querySelectorAll('#ranking-grupos tbody tr')[1].style.display = ''; });
  }
});

test('fechamento: CSV coleta links só do que sai no arquivo (nada de <details> nem texto só de leitor de tela)', async () => {
  await go('#fontes');
  const orig = await page.evaluate(() => {
    const td = document.querySelector('#fontes-verificacao-table tbody tr:first-child td:first-child');
    const o = td.innerHTML;
    td.innerHTML = 'Texto <a href="https://visivel.example/a">ver</a>' +
      '<details><summary>mais</summary><a href="https://dentro-de-details.example/b">oculto</a></details>' +
      '<span class="visually-hidden"><a href="https://so-leitor.example/c">leitor</a></span>';
    return o;
  });
  try {
    const l1 = (await exportaCsv('#fontes-verificacao-table'))[1];
    assert.ok(l1.includes('(https://visivel.example/a)'), l1);
    assert.ok(!l1.includes('dentro-de-details'), l1);
    assert.ok(!l1.includes('so-leitor'), l1);
  } finally {
    await page.evaluate(o => { document.querySelector('#fontes-verificacao-table tbody tr:first-child td:first-child').innerHTML = o; }, orig);
  }
});

const partLinhas = () => page.$$eval('#ficha table[data-csv-name="ficha-participantes"] tbody tr', trs => trs.map(tr => tr.textContent.replace(/\s+/g, ' ').trim()));
const notasVerif = () => page.evaluate(() => {
  const h = [...document.querySelectorAll('#ficha .fblock h3')].find(x => x.textContent === 'Notas da verificação');
  return h ? h.parentElement.textContent.replace(/\s+/g, ' ') : null;
});

// v4: valores esperados lidos do CONC da página (os números conferidos estão em tests/test_dados_conferidos.py).
// Título do selo de um campo verificado, como Selo.badge o monta; texto de um valor como no popover de divergência.
const esperadoFicha = id => page.evaluate(i => {
  const e = window.CONC.entidades.find(z => z.id === i);
  const selo = v => (v.fontes || []).filter(Boolean).map(Selo.fonteTexto).concat(v.limitado_pelo_edital ? ['limitado pelo edital; desempate por outorga'] : []).join('\n');
  const txt = (campo, v) => (campo === 'desagio' && typeof v === 'number' ? ConcModel.fmtPct(v)
    : typeof v === 'string' && /^\d{4}-\d{2}(-\d{2})?$/.test(v) ? ConcModel.fmtData(v)
      : typeof v === 'number' ? new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(v) : String(v));
  const div = campo => {
    const d = (e.divergencias || []).find(z => z.campo === campo);
    return d && { exibido: txt(campo, d.exibido), alts: d.alternativas.filter(a => a.valor != null && !/^[-–—]?$/.test(String(a.valor).trim()))
      .map(a => `${txt(campo, a.valor)} (${a.pagina != null ? `p. ${a.pagina}` : a.fonte})`) };
  };
  return { e, selo: Object.fromEntries(Object.entries(e.verif || {}).map(([k, v]) => [k, selo(v)])),
    div: Object.fromEntries((e.divergencias || []).map(d => [d.campo, div(d.campo)])),
    fmt: { desagio: ConcModel.fmtPct(e.desagio), assinatura: ConcModel.fmtData(e.assinatura), aditivo: ConcModel.fmtData(e.assinatura_aditivo),
      inab: (e.inabilitados || []).map(x => `${x.grupo}: ${ConcModel.fmtPct(x.desagio)}, inabilitado em ${ConcModel.fmtData(x.data)}`) } };
}, id);
const seloDe = rotulo => page.evaluate(r => {
  const dt = [...document.querySelectorAll('#ficha dt')].find(x => x.textContent === r);
  const s = dt && dt.nextElementSibling.querySelector('.selo');
  return s ? { classe: s.className, title: s.getAttribute('title'), target: s.querySelector('a') && s.querySelector('a').getAttribute('target') } : null;
}, rotulo);
const abreDivergencia = rotulo => page.evaluate(r => {
  const dt = [...document.querySelectorAll('#ficha dt')].find(x => x.textContent === r);
  dt.nextElementSibling.querySelector('.div-flag').click();
}, rotulo);

test('ficha do Lote 5 do Paraná mostra selo e RoadShow na divergência', async () => {
  await go('#ficha/rodovias-integradas-do-parana-lote-5');
  const x = await esperadoFicha('rodovias-integradas-do-parana-lote-5');
  assert.equal(x.e.verif.desagio.tipo, 'oficial');
  assert.ok(x.div.desagio.alts.length >= 1, 'o RoadShow imprime outro deságio');
  const d = await fichaDd('Deságio');
  assert.ok(d.text.startsWith(x.fmt.desagio), d.text);
  assert.match(d.html, /class="selo selo--oficial"/);
  const selo = await seloDe('Deságio');
  assert.equal(selo.target, '_blank');
  assert.equal(selo.title, x.selo.desagio);
  await abreDivergencia('Deságio');
  const t = await page.textContent('.popover');
  assert.match(t, /Divergência entre fontes/);
  assert.ok(t.includes(`Exibido: ${x.div.desagio.exibido}`), t);
  for (const a of x.div.desagio.alts) assert.ok(t.includes(a), a);
  assert.ok(await notasVerif(), 'bloco de notas');
  await page.keyboard.press('Escape');
});

test('ficha da Rota da Celulose mostra nota de inabilitação', async () => {
  await go('#ficha/rota-da-celulose');
  const x = await esperadoFicha('rota-da-celulose');
  const n = await notasVerif();
  assert.ok(x.fmt.inab.length >= 1);
  for (const s of x.fmt.inab) assert.ok(n.includes(s), s);
  for (const f of x.e.inabilitados[0].fontes) assert.ok(n.includes(f.titulo), f.titulo);
  assert.ok(await page.locator('#ficha .notas-verif .selo--oficial').count() > 0);
  // início da operação não localizado: linha com "—" e o selo
  assert.equal(x.e.verif.inicio_operacao.nao_localizado, true);
  const ini = await fichaDd('Início da operação');
  assert.match(ini.text, /^—não localizado em fonte oficial/);
  // um só vencedor: o verificado, com o deságio exibido; o que o RoadShow imprime fica abaixo. O nome do RoadShow é do
  // mesmo grupo econômico: sem sublinha de nome
  const linhas = await partLinhas();
  const esperado = await page.evaluate(() => {
    const c = window.CONC, v = ConcModel.participantesExibidos(c.entidades.find(z => z.id === 'rota-da-celulose'), c.grupos_alias)[0];
    return Object.assign(v, { nomeDiverge: !!(v.roadshow && LeiloesModel.rsDiverge(v.grupo, v.roadshow.grupo, c.grupos_alias)) });
  });
  assert.equal(linhas.filter(l => l.includes('(vencedor)')).length, 1);
  assert.ok(esperado.roadshow && esperado.roadshow.desagio != null && !esperado.nomeDiverge, JSON.stringify(esperado));
  const pct = await page.evaluate(v => [ConcModel.fmtPct(v[0]), ConcModel.fmtPct(v[1])], [esperado.desagio, esperado.roadshow.desagio]);
  assert.equal(linhas[0], `${esperado.grupo} (vencedor) oficial ${pct[0]} oficial RoadShow: ${pct[1]}`);
});

test('vencedor verificado fora da lista do RoadShow entra no topo (Transbrasiliana)', async () => {
  await go('#ficha/transbrasiliana');
  const x = await esperadoFicha('transbrasiliana');
  const linhas = await partLinhas();
  assert.equal(linhas.filter(l => l.includes('(vencedor)')).length, 1);
  // o rótulo do vencedor no RoadShow fica na sublinha do verificado, não como proponente derrotado sem lance
  const rs = x.e.participantes_lista.find(p => p.vencedor);
  assert.ok(rs && rs.desagio == null && rs.grupo !== x.e.grupo_vencedor, 'o RoadShow marca outro nome como vencedor, sem lance');
  assert.equal(linhas[0], `${x.e.grupo_vencedor} (vencedor) oficial RoadShow: ${rs.grupo} ${x.fmt.desagio} oficial`);
  assert.ok(!linhas.slice(1).some(l => l.includes(rs.grupo)), linhas.join('\n'));
  const lances = x.e.participantes_lista.filter(p => !p.vencedor && p.desagio != null);
  for (const p of lances) assert.ok(linhas.includes(`${p.grupo} ${await page.evaluate(v => ConcModel.fmtPct(v), p.desagio)}`), p.grupo);
  assert.ok(!linhas.slice(1).some(l => /—$/.test(l)), 'nenhum proponente sem deságio');
  await go('#ficha/autopista-litoral-do-sul');
  const ls = await partLinhas();
  const rsL = await page.evaluate(() => window.CONC.entidades.find(z => z.id === 'autopista-litoral-do-sul').participantes_lista.find(p => p.vencedor).grupo);
  assert.ok(ls[0].includes(`(vencedor) oficial RoadShow: ${rsL} `), ls[0]);
  assert.ok(!ls.slice(1).some(l => l.includes(rsL)), ls.join('\n'));
});

test('otimização distingue contrato original e termo aditivo; popover sem alternativa "-"', async () => {
  await go('#ficha/regis-bittencourt');
  const x = await esperadoFicha('regis-bittencourt');
  assert.equal(x.e.tipo, 'otimizacao');
  assert.ok((await fichaDd('Assinatura do contrato original')).text.startsWith(x.fmt.assinatura));
  assert.ok((await fichaDd('Assinatura do termo aditivo (otimização)')).text.startsWith(x.fmt.aditivo));
  // o prazo verificado de uma otimização conta a partir do termo aditivo
  assert.ok((await fichaDd('Prazo (a partir do termo aditivo)')).text.startsWith(`${x.e.prazo_anos} anos`));
  assert.equal(await fichaDd('Prazo da concessão'), null);
  await go('#ficha/via-liberdade');
  const y = await esperadoFicha('via-liberdade');
  assert.ok(y.e.divergencias.find(d => d.campo === 'assinatura').alternativas.some(a => /^[-–—]$/.test(String(a.valor))), 'há alternativa "-" no dado');
  await abreDivergencia('Assinatura');
  const itens = await page.$$eval('.popover li', lis => lis.map(l => l.textContent));
  assert.deepEqual(itens, y.div.assinatura.alts);
  await page.keyboard.press('Escape');
});

test('comparador tem a fonte do deságio e Fontes lista a verificação', async () => {
  await go('#projetos');
  const ths = await page.$$eval('#proj-table thead th', t => t.map(x => x.textContent.trim().replace(/ [↑↓]$/, '')));
  const i = ths.indexOf('Fonte do deságio');
  assert.equal(ths[i - 1], 'Deságio');
  const vals = await page.$$eval(`#proj-table tbody tr td:nth-child(${i + 1})`, t => [...new Set(t.map(x => x.textContent))]);
  // a Ponte São Borja (leilão por outorga) tem o deságio "não se aplica"; nenhum deságio fica só com o RoadShow
  assert.ok(vals.includes('oficial') && vals.includes('não se aplica (leilão por outorga)'), vals.join());
  assert.ok(!vals.includes('RoadShow'), vals.join());
  await go('#fontes');
  const cob = await page.textContent('#fontes-verif-cobertura');
  // leilões com resultado e, à parte, as entradas só com a data do edital (números do modelo)
  const cobM = await page.evaluate(() => window.CONC.verificacao.cobertura);
  const fmtN = v => v.toLocaleString('pt-BR');
  const soEd = cobM.so_edital ? ` e ${fmtN(cobM.so_edital)} ${cobM.so_edital === 1 ? 'entrada' : 'entradas'} só com a data do edital` : '';
  assert.ok(cob.includes(`${fmtN(cobM.leiloes)} leilões conferidos${soEd}; campos por origem: ${fmtN(cobM.oficial)} oficial`), cob);
  const nsa = cobM.nao_se_aplica;
  assert.ok(nsa > 0);
  assert.ok(cob.includes(`${nsa} não se aplica (deságio de leilão por outorga).`), cob);
  const n = await page.locator('#fontes-verificacao-table tbody tr').count();
  assert.equal(n, await page.evaluate(() => window.CONC.verificacao.fontes.length));
  assert.equal(await page.getAttribute('#fontes-verificacao-table', 'data-csv-name'), 'fontes-verificacao');
  assert.ok(await page.locator('#fontes-verificacao-table .selo--imprensa').count() > 0);
});

// ---------- v4: Mercado — participantes verificados, série de deságio, ranking de grupos ----------
const rankRows = () => page.$$eval('#ranking-grupos tbody tr', trs => trs.map(tr => [...tr.children].map(td => td.textContent.trim())));
// anos com leilão em mercado.participantes, em ordem (os seletores do ranking vão do primeiro ao último)
const anosPart = () => page.evaluate(() => [...new Set(window.CONC.mercado.participantes.map(p => p.ano))].sort((a, b) => a - b));
async function rankPeriodo(de, ate) {
  await page.selectOption('#rank-de', String(de));
  await page.selectOption('#rank-ate', String(ate));
}

test('Mercado mostra ranking com taxa de êxito e filtro de período altera as linhas', async () => {
  await go('#mercado');
  assert.equal(await page.getAttribute('#ranking-grupos', 'data-csv-name'), 'mercado-ranking-grupos');
  const ths = await page.$$eval('#ranking-grupos thead th', t => t.map(x => x.textContent.trim().replace(/ [↑↓]$/, '')));
  assert.deepEqual(ths, ['Grupo', 'Participações', 'Vitórias', 'Derrotas', 'Êxito (%)', '1ª aparição', 'Última']);
  const anos = await anosPart();
  assert.ok(anos.length >= 4, `o teste do período recente precisa de 4 anos com leilão, há ${anos.length}`);
  const de = anos[0], ate = anos[anos.length - 1], recente = anos[anos.length - 4];
  assert.equal(await page.inputValue('#rank-de'), String(de));
  assert.equal(await page.inputValue('#rank-ate'), String(ate));
  const modelo = periodo => page.evaluate(p => {
    const c = window.CONC, rk = LeiloesModel.rankingGrupos(c.mercado.participantes, c.grupos_alias, p);
    return { rk, sem: LeiloesModel.leiloesSemLista(c.mercado.participantes, p) };
  }, periodo);
  const todos = await modelo({ de, ate });
  let rows = await rankRows();
  assert.equal(rows.length, todos.rk.length);
  const r0 = todos.rk[0], nf1 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
  assert.deepEqual(rows[0], [r0.grupo, String(r0.participacoes), String(r0.vitorias), String(r0.derrotas), nf1.format(r0.taxa), String(r0.primeira), String(r0.ultima)]);
  assert.match(await page.textContent('#ranking-aviso'), new RegExp(`^Em ${todos.sem} leilões do período o RoadShow não lista os demais proponentes: neles só o vencedor é contado\\.$`));

  await rankPeriodo(recente, ate);
  const recentes = await modelo({ de: recente, ate });
  rows = await rankRows();
  assert.equal(rows.length, recentes.rk.length);
  assert.notEqual(rows.length, todos.rk.length);
  assert.ok(rows.every(r => +r[5] >= recente && +r[6] <= ate), 'anos dentro do período');
  assert.match(await page.textContent('#ranking-aviso'), new RegExp(`^Em ${recentes.sem} leilões do período`));

  // ordenação por clique no cabeçalho: Vitórias (desc), depois (asc)
  await page.click('#ranking-grupos thead button[data-sort="vitorias"]');
  let v = (await rankRows()).map(r => +r[2]);
  assert.deepEqual(v, [...v].sort((a, b) => b - a));
  assert.equal(await page.getAttribute('#ranking-grupos th[aria-sort]', 'aria-sort'), 'descending');
  await page.click('#ranking-grupos thead button[data-sort="vitorias"]');
  v = (await rankRows()).map(r => +r[2]);
  assert.deepEqual(v, [...v].sort((a, b) => a - b));

  // junções de nomes: "nome → grupo (motivo)" com link para a primeira fonte (uma junção com fonte http)
  const a = await page.evaluate(() => window.CONC.grupos_alias.find(x => (x.fontes || []).length && /^https?:\/\//.test(x.fontes[0].url || '')));
  const li = page.locator('#ranking-aliases li', { hasText: `${a.nome} → ${a.grupo} (${a.motivo})` });
  assert.ok(await li.count() >= 1);
  assert.equal(await li.first().locator('a').getAttribute('href'), a.fontes[0].url);
  assert.equal(await page.locator('#ranking-aliases li').count(), await page.evaluate(() => window.CONC.grupos_alias.length));
  await rankPeriodo(de, ate);
});

test('fechamento: seletores de período trocam de lugar quando de > até', async () => {
  await go('#mercado');
  const anos = await anosPart();
  assert.ok(anos.length >= 4, `precisa de 4 anos com leilão, há ${anos.length}`);
  const a = anos[1], b = anos[anos.length - 2];
  await rankPeriodo(anos[0], anos[anos.length - 1]);
  await page.selectOption('#rank-ate', String(a));
  await page.selectOption('#rank-de', String(b)); // de passa de até: os dois trocam e a tabela segue o período a–b
  assert.equal(await page.inputValue('#rank-de'), String(a));
  assert.equal(await page.inputValue('#rank-ate'), String(b));
  const esperado = await page.evaluate(p => LeiloesModel.rankingGrupos(window.CONC.mercado.participantes, window.CONC.grupos_alias, p).length, { de: a, ate: b });
  assert.equal((await rankRows()).length, esperado);
  await rankPeriodo(anos[0], anos[anos.length - 1]);
});

test('série de deságio desenha um ponto por leilão com deságio, com legenda', async () => {
  await go('#mercado');
  const esperado = await page.evaluate(() => {
    const m = window.CONC.mercado, p = m.participantes, s = LeiloesModel.serieDesagio(p);
    const l5 = p.find(x => x.lote === 'Rodovias Integradas do Paraná - Lote 5');
    const pct = v => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(v) + '%';
    return { pts: s.length, sem: p.filter(x => x.desagio_vencedor == null).length,
      x0: Math.floor(Math.min(...s.map(q => q.x))), x1: Math.floor(Math.max(...s.map(q => q.x))),
      l5: { ini: `${l5.lote} · `, fim: `${pct(l5.desagio_vencedor)} · fonte ${l5.verif.desagio.tipo}` } };
  });
  assert.ok(esperado.pts >= 40);
  assert.equal(await page.locator('#chart-serie circle.dot').count(), esperado.pts);
  const anos = await page.$$eval('#chart-serie text[text-anchor="middle"]', t => t.map(x => x.textContent));
  assert.equal(anos[0], String(esperado.x0));
  assert.ok(+anos[anos.length - 1] >= esperado.x1, anos.join());
  assert.equal(await page.locator('#chart-serie line.ref').count(), 1);
  const tit = await page.$$eval('#chart-serie circle.dot title', t => t.map(x => x.textContent));
  assert.ok(tit.some(t => t.startsWith(esperado.l5.ini) && t.endsWith(esperado.l5.fim)), 'Lote 5 com o valor exibido');
  assert.equal(tit.filter(t => t.includes('limitado pelo edital')).length, await page.locator('#chart-serie circle.dot-limite').count());
  assert.ok(await page.locator('#chart-serie circle.dot-limite').count() >= 1);
  const leg = page.locator('#serie-legenda');
  const txt = await leg.textContent();
  // linha de referência: o limite do aporte vem de regulatorio.json (o mesmo do Resumo), não de número no código
  const ref = await page.evaluate(() => ({ r: LeiloesModel.regraAporte(window.CONC), p: LeiloesModel.PORTARIA_APORTE }));
  const refTxt = `linha de ${ref.r.limite.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%: aporte de recursos vinculados, ${ref.p.nome}, a partir de ${ref.p.ano}`;
  for (const s of ['oficial', 'RoadShow', 'imprensa — não oficial', refTxt])
    assert.ok(txt.includes(s), s);
  assert.equal(await leg.locator('circle[fill="none"][stroke-dasharray]').count(), 1, 'imprensa: anel vazado tracejado');
  assert.equal(await leg.locator('line[stroke-dasharray]').count(), 1, 'linha de 18%');
  assert.match(txt, /Pontos marcados como limitados pelo edital: desconto máximo permitido, desempate por outorga \(2021\)/);
  assert.match(await page.textContent('#serie-sem'), new RegExp(`^${esperado.sem} ${esperado.sem === 1 ? 'leilão' : 'leilões'} sem deságio do vencedor localizado`));
  // Concorrentes × deságio: média dos valores exibidos ao lado da impressa (valor e páginas de mercado.json)
  const x = await page.evaluate(() => {
    const m = window.CONC.mercado, nf2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const pp = [].concat(m.fontes.desagio_medio_impresso);
    return { media: nf2.format(LeiloesModel.mediaDesagio(m.concorrentes_desagio.map(c => c.desagio))),
      impressa: `(RoadShow, ${pp.length > 1 ? 'pp.' : 'p.'} ${pp.join(', ').replace(/, ([^,]*)$/, ' e $1')}: ${nf2.format(m.desagio_medio_impresso)}%)`,
      nota: m.notas.concorrentes_desagio, periodo: m.periodo_concorrencia };
  });
  assert.ok((await page.textContent('#card-desagio .sub')).includes(`Média dos deságios exibidos: ${x.media}% ${x.impressa}`));
  // a nota é o comentário de mercado.json (a coerência dela com a média está no pytest)
  assert.equal(await page.textContent('#card-desagio .src:last-child'), `Nota: ${x.nota}`);
  const impressoSub = `Leilões do programa federal em ${x.periodo}, como impresso no RoadShow`;
  assert.equal(await page.textContent('#card-faixas .sub'), impressoSub);
  assert.equal(await page.textContent('#card-porN .sub'), `${impressoSub}; entre parênteses, quantos leilões tiveram esse número de concorrentes`);
});

// Linha esperada da tabela de participantes do Mercado, calculada do CONC da página (mesmas regras de mercado.js):
// vencedor exibido com o grupo quando o nome é outro; "RoadShow: …" de nome só se o grupo difere; deságio com o do RoadShow
// quando difere. `lote`: trecho do nome do lote.
const linhaPart = lote => page.evaluate(l => {
  const c = window.CONC, al = c.grupos_alias, p = c.mercado.participantes.find(x => x.lote.includes(l));
  const venc = n => { const g = LeiloesModel.grupoDe(n, al); return g && g !== n && !n.endsWith(`(${g})`) ? `${n} (${g})` : n; };
  const v = p.verif || {}, rsG0 = v.grupo_vencedor && v.grupo_vencedor.roadshow, rsD = v.desagio && v.desagio.roadshow;
  const rsG = LeiloesModel.rsDiverge(p.vencedor, rsG0, al) ? rsG0 : null;
  const pct = ConcModel.fmtPct;
  return { ano: String(p.ano), lote: p.lote, data: p.data ? ConcModel.fmtData(p.data) : '—', rsG, rsG0, rsD,
    vencedor: venc(p.vencedor) + (rsG ? ` RoadShow: ${rsG}` : ''),
    desagio: (p.desagio_vencedor == null ? '—' : pct(p.desagio_vencedor)) + (rsD == null ? '' : ` RoadShow: ${pct(rsD)}`),
    tipo: (v.desagio || v.grupo_vencedor || {}).tipo,
    outros: (p.outros || []).map(o => `${o.grupo}${o.desagio == null ? '' : ` (${pct(o.desagio)})`}`),
    inab: (p.inabilitados || []).map(i => `${i.grupo}${i.desagio == null ? '' : ` (${pct(i.desagio)})`} (inabilitado${i.data ? ` em ${ConcModel.fmtData(i.data)}` : ''})`) };
}, lote);
const celulasPart = async x => {
  await page.selectOption('#part-ano', x.ano);
  return page.locator('#chart-part tbody tr', { hasText: x.lote }).locator('td').allTextContents();
};

test('Transbrasiliana aparece com o vencedor verificado e o ranking credita o grupo da época', async () => {
  await go('#mercado');
  const ths = await page.$$eval('#chart-part thead th', t => t.map(x => x.textContent.trim()));
  assert.deepEqual(ths, ['Ano', 'Data', 'Lote', 'Vencedor', 'Deságio vencedor', 'Fonte', 'Demais proponentes (deságio)']);
  const x = await linhaPart('Transbrasiliana');
  assert.ok(x.rsG, 'o RoadShow imprime como vencedor um nome de outro grupo');
  const cells = await celulasPart(x);
  assert.equal(cells[1], x.data);
  // o vencedor como o RoadShow imprime fica na sublinha "RoadShow: …" (não é apagado)
  assert.equal(cells[3], x.vencedor);
  assert.equal(cells[4], x.desagio);
  assert.equal(cells[5].trim(), x.tipo);
  const tr = page.locator('#chart-part tbody tr', { hasText: x.lote });
  assert.match(await tr.locator('td:nth-child(6) .selo--oficial a').getAttribute('href'), /^https:\/\//);
  for (const o of x.outros) assert.ok(cells[6].includes(o), o);
  assert.equal(await tr.locator('td:nth-child(4) .part-rs').count(), 1);
  // nome com grupo econômico diferente aparece como "nome (grupo)"
  const comGrupo = await page.evaluate(() => {
    const c = window.CONC, p = c.mercado.participantes.find(r => { const g = LeiloesModel.grupoDe(r.vencedor, c.grupos_alias); return g && g !== r.vencedor && !r.vencedor.endsWith(`(${g})`); });
    return { ano: String(p.ano), txt: `${p.vencedor} (${LeiloesModel.grupoDe(p.vencedor, c.grupos_alias)})` };
  });
  await page.selectOption('#part-ano', comGrupo.ano);
  assert.ok((await page.locator('#chart-part tbody td', { hasText: comGrupo.txt }).count()) >= 1, 'nome (grupo)');
  const cel = await linhaPart('Rota da Celulose');
  assert.ok(cel.inab.length >= 1);
  const tCel = (await celulasPart(cel))[6];
  for (const i of cel.inab) assert.ok(tCel.includes(i), i);
  await page.selectOption('#part-ano', '');
  // ranking do ano da Transbrasiliana: igual ao modelo (crédito pelo grupo da época; os valores estão no pytest)
  await rankPeriodo(+x.ano, +x.ano);
  const modelo = await page.evaluate(a => LeiloesModel.rankingGrupos(window.CONC.mercado.participantes, window.CONC.grupos_alias, { de: a, ate: a }), +x.ano);
  const rk = Object.fromEntries((await rankRows()).map(r => [r[0], r]));
  assert.equal(Object.keys(rk).length, modelo.length);
  for (const r of modelo) assert.deepEqual([rk[r.grupo][2], rk[r.grupo][3]], [String(r.vitorias), String(r.derrotas)], r.grupo);
  const gVenc = await page.evaluate(n => LeiloesModel.grupoDe(n, window.CONC.grupos_alias), x.vencedor.split(' RoadShow: ')[0]);
  assert.ok(+rk[gVenc][2] >= 1, 'a vitória é do grupo verificado');
  const anos = await anosPart();
  await rankPeriodo(anos[0], anos[anos.length - 1]);
});

test('Mercado mostra abaixo do verificado o vencedor e o deságio que o RoadShow imprime', async () => {
  await go('#mercado');
  // Lote 5: o nome do RoadShow é do mesmo grupo (sem sublinha de nome); o deságio diferente continua
  const l5 = await linhaPart('Rodovias Integradas do Paraná - Lote 5');
  assert.ok(l5.rsG0 && !l5.rsG && l5.rsD != null, JSON.stringify(l5));
  const c5 = await celulasPart(l5);
  assert.equal(c5[3], l5.vencedor);
  assert.equal(c5[4], l5.desagio);
  const cel = await linhaPart('Rota da Celulose');
  assert.ok(cel.rsD != null);
  assert.equal((await celulasPart(cel))[4], cel.desagio);
  // Régis 2007: nome de outro grupo na sublinha; deságio igual ao do RoadShow, sem sublinha
  const regis = await linhaPart('Autopista Régis Bittencourt');
  assert.ok(regis.rsG && regis.rsD == null, JSON.stringify(regis));
  const cr = await celulasPart(regis);
  assert.equal(cr[3], regis.vencedor);
  assert.equal(cr[4], regis.desagio, 'deságio igual ao do RoadShow: sem sublinha');
  await page.selectOption('#part-ano', '');
});

test('fechamento: ficha da Ponte São Borja mostra deságio "não se aplica (leilão por outorga)"', async () => {
  await go('#ficha/ponte-binacional-sao-borja-santo-tome');
  const x = await esperadoFicha('ponte-binacional-sao-borja-santo-tome');
  assert.equal(x.e.verif.desagio.nao_se_aplica, true);
  const d = await fichaDd('Deságio');
  assert.match(d.text, /^—não se aplica \(leilão por outorga\)/);
  assert.match(d.html, /class="selo selo--nao-se-aplica"/);
  assert.equal((await seloDe('Deságio')).title, x.selo.desagio);
  await abreDivergencia('Deságio');
  const nota = x.e.divergencias.find(z => z.campo === 'desagio').nota;
  assert.match(nota, /não se aplica \(leilão por outorga\)/);
  assert.ok((await page.textContent('.popover')).includes(nota));
  await page.keyboard.press('Escape');
});

test('fechamento: prazo da Régis Bittencourt com a B3 como divergência', async () => {
  await go('#ficha/regis-bittencourt');
  const x = await esperadoFicha('regis-bittencourt');
  assert.ok(x.div.prazo_anos && x.div.prazo_anos.alts.length >= 1);
  await abreDivergencia('Prazo (a partir do termo aditivo)');
  const t = await page.textContent('.popover');
  assert.ok(t.includes(`Exibido: ${x.div.prazo_anos.exibido}oficial`), t);
  for (const a of x.div.prazo_anos.alts) assert.ok(t.includes(a), a);
  await page.keyboard.press('Escape');
});

test('fechamento: "RoadShow: …" de nome só quando o grupo econômico difere', async () => {
  await go('#mercado');
  const rg = await linhaPart('Rota Gerais');
  assert.ok(rg.rsG0 && !rg.rsG, 'o RoadShow grafa outro nome do mesmo grupo');
  await page.selectOption('#part-ano', rg.ano);
  const tr = page.locator('#chart-part tbody tr', { hasText: rg.lote });
  assert.equal((await tr.locator('td').allTextContents())[3], rg.vencedor);
  assert.equal(await tr.locator('td:nth-child(4) .part-rs').count(), 0);
  const tb = await linhaPart('Transbrasiliana');
  await page.selectOption('#part-ano', tb.ano);
  assert.equal(await page.locator('#chart-part tbody tr', { hasText: tb.lote }).locator('td:nth-child(4) .part-rs').textContent(), `RoadShow: ${tb.rsG}`);
  await page.selectOption('#part-ano', '');
  // ficha: o RoadShow grafa o vencedor de outro jeito (mesmo grupo): sem sublinha de nome
  await go('#ficha/rotas-gerais');
  const x = await esperadoFicha('rotas-gerais');
  const venc = (await partLinhas()).filter(l => l.includes('(vencedor)'));
  assert.deepEqual(venc, [`${x.e.grupo_vencedor} (vencedor) oficial ${x.fmt.desagio} oficial`]);
  assert.equal(await page.locator('#ficha table[data-csv-name="ficha-participantes"] .part-rs').count(), 0);
  await go('#ficha/transbrasiliana');
  const rs = await page.evaluate(() => window.CONC.entidades.find(z => z.id === 'transbrasiliana').participantes_lista.find(p => p.vencedor).grupo);
  assert.ok((await partLinhas())[0].includes(`RoadShow: ${rs}`));
});

test('fechamento: Mercado tem ABDIB, debêntures, comparativos e pavimento com a página e sem NaN', async () => {
  await go('#mercado');
  const m = await page.evaluate(() => window.CONC.mercado);
  for (const id of ['abdib', 'debentures', 'comparativos', 'pavimento']) {
    const card = page.locator('#card-' + id);
    assert.equal(await card.count(), 1, id);
    const txt = await card.textContent();
    assert.ok(!/NaN|undefined|null/.test(txt), `${id}: ${txt.slice(0, 200)}`);
    const pgs = [].concat(m.fontes[id]).map(String);
    const ref = pgs.length > 1 ? `pp. ${pgs.slice(0, -1).join(', ')} e ${pgs[pgs.length - 1]}` : `p. ${pgs[0]}`;
    assert.ok(txt.includes(`Fonte: RoadShow 2026-2027, ${ref}`), `${id}: ${ref}`);
    assert.equal(await card.locator('svg.chart').count(), 1, id);
    assert.ok(await card.locator('.chart-legend').count() >= 1, `${id}: legenda`);
    const titles = await card.locator('svg.chart title').allTextContents();
    assert.ok(titles.length && !titles.some(t => /NaN|undefined/.test(t)), id);
  }
  const fmt = (v, d = 1) => v.toLocaleString('pt-BR', { maximumFractionDigits: d });
  // ABDIB: público e privado empilhados por ano, total impresso na dica
  const ab = m.abdib.serie, ab0 = ab[0];
  assert.equal(await page.locator('#chart-abdib rect.cbar').count(), 2 * ab.length);
  assert.equal(await page.locator('#chart-abdib rect.cbar title').first().textContent(),
    `${ab0.ano} (total impresso: R$ ${fmt(ab0.total)} bi) · Público: ${fmt(ab0.publico)} R$ bi`);
  // debêntures: uma barra por ano
  const deb = m.debentures.serie;
  assert.deepEqual(await page.locator('#chart-debentures rect.cbar title').allTextContents(), deb.map(x => `${x.ano}: ${fmt(x.valor)} R$ bi`));
  // pavimento: uma barra por estado, com o percentual
  assert.deepEqual(await page.locator('#chart-pavimento rect.cbar title').allTextContents(), m.pavimento.estados.map(e => `${e.estado}: ${fmt(e.aumento_pct)}%`));
  // comparativos: barras dos acumulados na unidade da primeira linha; tabela com todas as linhas e a variação impressa
  const bi = m.comparativos.filter(c => c.unidade === m.comparativos[0].unidade);
  assert.equal(await page.locator('#chart-comparativos rect.cbar').count(), 2 * bi.length);
  const linhas = await page.locator('#comparativos tbody tr').allTextContents();
  assert.equal(linhas.length, m.comparativos.length);
  m.comparativos.forEach((c, i) => assert.ok(linhas[i].includes(`${fmt(c.multiplo, 2)}x (+${fmt(c.variacao_pct, 2)}%)`), linhas[i]));
});

test('fechamento: Regulatório desenha os dois diagramas com título, descrição, legenda e a nota dos 18%', async () => {
  await go('#regulatorio');
  const ds = await page.evaluate(() => window.CONC.regulatorio.diagramas);
  assert.equal(ds.length, 2);
  for (const d of ds) {
    const fig = page.locator(`#reg-${d.secao} #diagrama-${d.id}`);
    assert.equal(await fig.count(), 1, d.id);
    const svg = fig.locator('svg.diagrama__svg');
    assert.equal(await svg.getAttribute('role'), 'img');
    assert.equal(await svg.locator(':scope > title').textContent(), d.titulo);
    assert.equal(await svg.locator(':scope > desc').textContent(), d.descricao);
    assert.ok(await fig.locator('.chart-legend span').count() >= 4, `${d.id}: legenda`);
    const txt = await fig.textContent();
    assert.ok(!/NaN|undefined|null/.test(txt), d.id);
    // rodapé de origem e nota a partir do JSON: nenhum dos dois diagramas se apresenta como figura do RoadShow
    const rod = await fig.locator('.diagrama__fonte').textContent();
    assert.equal(rod, await page.evaluate(x => Regulatorio.rodape(x), d));
    assert.ok(!rod.startsWith('Fonte:'), rod);
    if (d.origem === 'esquema') {
      const pg = d.paginas.map(String);
      const ref = pg.length > 1 ? `pp. ${pg.slice(0, -1).join(', ')} e ${pg[pg.length - 1]}` : `p. ${pg[0]}`;
      assert.equal(rod, `Esquema elaborado com o texto do RoadShow 2026-2027, ${ref}`);
    }
    if (d.origem === 'adaptado') assert.ok(rod.startsWith(`Baseado na figura da p. ${d.pagina_figura} `), rod);
    assert.ok((await fig.locator('.diagrama__nota').textContent()).includes(d.nota), `${d.id}: nota`);
    const box = await svg.boundingBox();
    assert.ok(box.width > 300 && box.height > 200, `${d.id}: ${JSON.stringify(box)}`);
  }
  const f = ds.find(d => d.id === 'fluxo-projeto');
  assert.deepEqual(await page.locator('#diagrama-fluxo-projeto [data-etapa]').evaluateAll(gs => gs.map(g => g.dataset.etapa)), f.etapas.map(e => e.id));
  assert.equal(await page.locator('#diagrama-fluxo-projeto .decisao title').textContent(), f.decisao.pergunta);
  const nota = await page.locator('#diagrama-fluxo-projeto .diagrama__nota').textContent();
  for (const r of f.redacoes) assert.ok(nota.includes(`p. ${r.pagina}, “${r.texto}”`), r.pagina);
  assert.ok(nota.includes(f.nota));
  const g = ds.find(d => d.id === 'fluxo-financiamento');
  assert.equal(await page.locator('#diagrama-fluxo-financiamento [data-no]').count(), g.nos.length);
  for (const n of g.nos.filter(x => x.pagina)) {  // "p. N" visível em cada caixa
    assert.ok((await page.locator(`#diagrama-fluxo-financiamento [data-no="${n.id}"] text`).allTextContents()).includes(`p. ${n.pagina}`), n.id);
  }
  assert.equal(await page.locator('#diagrama-fluxo-financiamento line.aresta').count(), g.arestas.length);
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


// ---------- Mercado: plural, "Outros" por último, dica do investimento e diagnóstico por ano ----------

test('mercado: nenhum texto gerado traz plural quebrado e o rótulo de concorrentes flexiona', async () => {
  await go('#mercado');
  const txt = await page.textContent('#page-mercado');
  assert.ok(!/ãoões|\bleilãos\b|\bconcorrentees\b/.test(txt), 'plural quebrado');
  const m = await page.evaluate(() => window.CONC.mercado.desagio_por_n_concorrentes);
  const rot = x => `${x.concorrentes} ${x.concorrentes === 1 ? 'concorrente' : 'concorrentes'} (${x.leiloes} ${x.leiloes === 1 ? 'leilão' : 'leilões'})`;
  const labels = await page.$$eval('#chart-porN svg text[text-anchor="end"]', ts => ts.map(t => t.textContent));
  assert.deepEqual(labels, m.map(rot));
});

test('mercado: "Outros N grupos" é a última barra nos gráficos de extensão e de investimento', async () => {
  await go('#mercado');
  const outros = await page.evaluate(() => window.CONC.mercado.grupos.filter(g => g.grupo.startsWith('Outros')).map(g => g.grupo));
  assert.equal(outros.length, 1, 'controle: a base tem a linha "Outros"');
  for (const id of ['grupos', 'gruposInv']) {
    const rotulos = await page.$$eval(`#chart-${id} g.hrow-tip text[text-anchor="end"]`, ts => ts.map(t => t.textContent));
    assert.equal(rotulos[rotulos.length - 1], outros[0], `${id}: última linha`);
    assert.equal(rotulos.filter(r => r.startsWith('Outros')).length, 1, id);
    // as demais seguem do maior para o menor
    const vals = await page.$$eval(`#chart-${id} g.hrow-tip rect.cbar`, rs => rs.map(r => +r.getAttribute('width')));
    const semOutros = vals.slice(0, -1);
    assert.deepEqual(semOutros, [...semOutros].sort((a, b) => b - a), `${id}: ordem decrescente`);
  }
  // controle de que a regra faz diferença: sem ela, "Outros" ficaria antes de algum grupo menor
  const antes = await page.evaluate(() => {
    const g = window.CONC.mercado.grupos, o = g.find(x => x.grupo.startsWith('Outros'));
    return g.some(x => x !== o && x.km < o.km) && g.some(x => x !== o && (x.capex_opex ?? x.capex + x.opex) < (o.capex_opex ?? o.capex + o.opex));
  });
  assert.ok(antes, 'controle: o "Outros" é maior que algum grupo nos dois gráficos');
});

test('mercado: a dica do investimento por grupo mostra capex e opex, na barra e na linha inteira', async () => {
  await go('#mercado');
  const gr = await page.evaluate(() => window.CONC.mercado.grupos.find(g => !g.grupo.startsWith('Outros')));
  const nf2 = v => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const esperado = `${gr.grupo}: ${nf2(gr.capex_opex ?? gr.capex + gr.opex)} R$ bi (capex ${nf2(gr.capex)} + opex ${nf2(gr.opex)})`;
  const linha = page.locator('#chart-gruposInv g.hrow-tip', { hasText: gr.grupo }).first();
  assert.equal(await linha.locator(':scope > title').textContent(), esperado);
  assert.equal(await linha.locator('rect.cbar title').textContent(), esperado);
  // área de acerto de largura total: passar o mouse longe da barra, no vazio da linha, ainda cai na linha
  const hit = await linha.locator('rect.hit').boundingBox();
  const caixa = await page.locator('#chart-gruposInv svg').boundingBox();
  assert.ok(hit.width >= caixa.width - 2, 'área de acerto da linha toda');
  assert.ok(!(await page.$$eval('#chart-gruposInv title', ts => ts.some(t => /undefined|NaN/.test(t.textContent)))));
});

test('mercado: o diagnóstico traz os anos do modelo; anos sem impressão só com a extensão (p. 37) e "—" no resto', async () => {
  await go('#mercado');
  const d = await page.evaluate(() => {
    const c = window.CONC, rows = MercadoModel.diagnosticoPorAno(c, window.INTEL);
    return { rows, imp: c.mercado.diagnostico, gestao: c.mercado.gestao, nota: MercadoModel.diagnosticoNota(rows), pag: c.mercado.fontes };
  });
  const anosTela = await page.$$eval('#diagnostico tbody tr', trs => trs.map(tr => +tr.dataset.ano));
  assert.deepEqual(anosTela, d.rows.map(r => r.ano));
  const imp = d.imp.map(x => x.ano);
  for (const a of imp) assert.ok(anosTela.includes(a), `ano impresso ${a}`);
  const lacunas = [];
  for (let a = Math.min(...anosTela); a <= Math.max(...anosTela); a++) if (!anosTela.includes(a)) lacunas.push(a);
  assert.ok(lacunas.length > 0 && lacunas.every(a => !d.gestao.some(g => g.ano === a) && !imp.includes(a)), `lacunas ${lacunas}`);
  assert.ok(!anosTela.includes(2028) && !anosTela.includes(2029));
  // a linha de fonte do cartão só cita o que alimenta alguma célula (nenhum valor vem das séries da ANTT)
  const srcDiag = await page.textContent('#card-diag');
  assert.ok(!/ANTT/.test(srcDiag), 'fonte do diagnóstico cita a ANTT sem que nenhum valor venha dela');
  // uma nota só: o que os anos calculados trazem e os anos sem fonte
  assert.equal(await page.locator('#diagnostico-nota').count(), 1);
  const nota = await page.textContent('#diagnostico-nota');
  assert.ok(nota.includes(d.nota) && /só publica a extensão concedida \(p\. 37\)/.test(nota) && /2028 e 2029: nenhuma fonte publica esses anos/.test(nota), nota);
  // anos sem impressão: extensão = série de gestão (cálculo cru), o resto "—" com "não publicado" na dica; nada reconstruído
  const derivados = anosTela.filter(a => !imp.includes(a));
  assert.ok(derivados.length >= 3, `anos derivados: ${derivados}`);
  for (const a of derivados) {
    const tr = page.locator(`#diagnostico tbody tr[data-ano="${a}"]`);
    const cel = await tr.locator('td').allTextContents();
    assert.equal(cel[2], d.gestao.find(g => g.ano === a).privada_km.toLocaleString('pt-BR'), `${a}: km`);
    assert.deepEqual([cel[1], cel[3], cel[4]], ['—', '—', '—'], `${a}: sem contratos, valor nem investimento`);
    assert.deepEqual(await tr.locator('td.num').evaluateAll(tds => tds.map(td => td.title)),
      ['não publicado', `RoadShow, p. ${d.pag.gestao}`, 'não publicado', 'não publicado'], `${a}: dicas`);
    assert.equal(cel[5], `km concedidos: RoadShow, p. ${d.pag.gestao}`, `${a}: fonte da linha, uma vez só`);
  }
  // anos impressos: valores como no RoadShow e a fonte uma vez por linha
  for (const x of d.imp) {
    const cel = await page.locator(`#diagnostico tbody tr[data-ano="${x.ano}"] td`).allTextContents();
    assert.equal(cel[1], x.contratos.toLocaleString('pt-BR'));
    assert.equal(cel[5], `RoadShow, p. ${d.pag.diagnostico}`, `${x.ano}: fonte`);
  }
  const semFonte = await page.$$eval('#diagnostico tbody td.num', tds => tds.filter(td => !td.title).length);
  assert.equal(semFonte, 0);
  assert.ok(!/NaN|undefined|null/.test(await page.textContent('#card-diag')));
});

test('mercado: títulos pelo critério de clareza, com período e contagens vindos dos dados', async () => {
  await go('#mercado');
  const x = await page.evaluate(() => {
    const m = window.CONC.mercado, per = s => `${Math.min(...s.map(r => r.ano))}–${Math.max(...s.map(r => r.ano))}`;
    return { part: per(m.participantes), prog: per(m.programa_por_ano), n: m.programa_por_ano.reduce((t, r) => t + r.leiloes, 0) };
  });
  const h3 = id => page.textContent(`#card-${id} h3`);
  assert.equal(await h3('serie'), `Deságio do vencedor nos leilões de concessões rodoviárias federais (ANTT), ${x.part}`);
  assert.equal(await h3('indic'), `Indicadores dos ${x.n} leilões do programa federal de concessões rodoviárias ${x.prog} (Ministério dos Transportes)`);
  assert.equal(await h3('programa'), `Programa federal de concessões rodoviárias ${x.prog}, por ano`);
  assert.match(await page.textContent('#page-mercado .page__lead'), /apresentação do Ministério dos Transportes a investidores/);
});

// ---------- Mercado: ficha de grupo e consórcio ----------
// Grupos do ranking escolhidos pelos dados (nada fixo): com consórcios e fonte de imprensa, com composição não localizada e que disputou só.
const fichasDoRanking = () => page.evaluate(() => {
  const c = window.CONC, rk = LeiloesModel.rankingGrupos(c.mercado.participantes, c.grupos_alias);
  const fichas = rk.map(r => LeiloesModel.fichaGrupo(r.grupo, c));
  const nomeDe = f => f && f.grupo;
  return {
    comImprensa: nomeDe(fichas.find(f => f.consorcios.some(k => k.composicaoLocalizada && k.integrantes.some(i => typeof i.participacao === 'number'))
      && f.fontes.some(x => x.tipo === 'imprensa')) || fichas.find(f => f.consorcios.length)),
    semComposicao: nomeDe(fichas.find(f => f.consorcios.some(k => !k.composicaoLocalizada))),
    sozinho: nomeDe(fichas.find(f => !f.consorcios.length && f.leiloes.length)),
    maisConsorcios: nomeDe([...fichas].sort((a, b) => b.consorcios.length - a.consorcios.length)[0]),
  };
});
// texto da coluna "como disputou" (mesma regra de consorcios.js)
const como = grupo => l => l.consorcio || `Participou sozinho${l.proponente && l.proponente !== grupo ? `, como ${l.proponente}` : ''}`;
const abrirDoRanking = async grupo => {
  await go('#mercado');
  await page.locator('#ranking-grupos tbody').getByRole('button', { name: grupo, exact: true }).click();
  await page.waitForSelector('#cons-ficha', { state: 'visible' });
};
const fechaFicha = async () => { if (await page.isVisible('#cons-ficha')) await page.keyboard.press('Escape'); };

test('ficha de grupo: abre pelo ranking, acessível, e o conteúdo é o do modelo', async () => {
  const { comImprensa: grupo } = await fichasDoRanking();
  assert.ok(grupo, 'algum grupo do ranking tem consórcio na base');
  const esperado = await page.evaluate(g => LeiloesModel.fichaGrupo(g, window.CONC), grupo);
  await abrirDoRanking(grupo);
  const botao = page.locator('#ranking-grupos tbody').getByRole('button', { name: grupo, exact: true });
  const dlg = page.locator('#cons-ficha');
  assert.equal(await dlg.getAttribute('role'), 'dialog');
  assert.equal(await dlg.getAttribute('aria-modal'), 'true');
  assert.equal(await page.textContent('#cons-titulo'), esperado.grupo);
  assert.equal(await dlg.getAttribute('aria-labelledby'), 'cons-titulo');
  assert.equal(await page.evaluate(() => document.getElementById('cons-ficha').contains(document.activeElement)), true, 'o foco entra na ficha');
  // consórcios e leilões como no modelo
  assert.deepEqual(await dlg.locator('.cons-card h4').allTextContents(), esperado.consorcios.map(c => c.nome));
  assert.equal(await dlg.locator('.cons-leilao').count(), esperado.leiloes.length);
  const res = { venceu: 'Venceu', perdeu: 'Perdeu', inabilitado: 'Inabilitado', naoVenceu: 'Não venceu' };
  assert.deepEqual(await dlg.locator('.cons-leilao .cons-res').allTextContents(), esperado.leiloes.map(l => res[l.resultado]));
  assert.deepEqual(await dlg.locator('.cons-leilao__como').allTextContents(), esperado.leiloes.map(como(esperado.grupo)));
  // um nome do grupo por lote disputado sozinho: nunca "Venceu" e "Perdeu" no mesmo lote
  const lotes = esperado.leiloes.filter(l => !l.consorcio).map(l => `${l.ano}|${l.lote}`);
  assert.equal(new Set(lotes).size, lotes.length);
  // composição e participação de cada integrante: barra e percentual, ou "não informada"
  for (const [i, c] of esperado.consorcios.entries()) {
    const card = dlg.locator('.cons-card').nth(i);
    assert.equal(await card.locator('.cons-int').count(), c.integrantes.length, c.nome);
    if (!c.composicaoLocalizada) { assert.equal((await card.locator('.cons-sem').textContent()).trim(), 'Composição não localizada.'); continue; }
    for (const [j, it] of c.integrantes.entries()) {
      const li = card.locator('.cons-int').nth(j);
      if (typeof it.participacao === 'number') {
        assert.match(await li.locator('.cons-int__pct').textContent(), new RegExp(`^${it.participacao.toLocaleString('pt-BR', { maximumFractionDigits: 2 }).replace('.', '\\.')}%$`));
        assert.equal(await li.locator('.cons-bar i').evaluate(e => e.style.width), `${it.participacao}%`);
      } else {
        assert.match(await li.textContent(), /participação não informada/);
        assert.equal(await li.locator('.cons-bar').count(), 0);
      }
      assert.equal(await li.locator('.cons-tag', { hasText: 'líder' }).count(), it.lider ? 1 : 0);
    }
  }
  // glossário no primeiro termo; fontes com o selo de origem (imprensa sempre "não oficial")
  assert.deepEqual(await dlg.locator('.cons-lead a.glossario-link').evaluateAll(as => as.map(a => a.getAttribute('href'))), ['#glossario/grupo-economico', '#glossario/consorcio']);
  // fontes de cada consórcio dentro do cartão dele (a participação se rastreia até a fonte), com o selo; sem lista solta no fim
  for (const [i, c] of esperado.consorcios.entries()) {
    const card = dlg.locator('.cons-card').nth(i);
    const lista = card.locator('ul[aria-label^="Fontes da composição"] li');
    assert.equal(await lista.count(), c.fontes.length, c.nome);
    assert.equal(await card.locator('ul[aria-label^="Fontes da composição"] .selo--imprensa').count(), c.fontes.filter(f => f.tipo === 'imprensa').length, c.nome);
  }
  const imprensa = esperado.consorcios.flatMap(c => c.fontes).filter(f => f.tipo === 'imprensa').length;
  assert.ok(imprensa > 0);
  assert.ok((await dlg.locator('.cons-card .selo--imprensa').allTextContents()).every(t => t.trim() === 'imprensa — não oficial'));
  assert.equal(await dlg.locator('.cons-body > .cons-fontes').count(), 0, 'sem lista de fontes solta no fim');
  // fontes do resultado, recolhidas na linha da vitória
  const vitorias = esperado.leiloes.filter(l => l.fontes.length);
  assert.equal(await dlg.locator('.cons-leilao__fontes').count(), vitorias.length);
  if (vitorias.length) assert.equal(await dlg.locator('.cons-leilao__fontes li').count(), vitorias.reduce((n, l) => n + l.fontes.length, 0));
  // a página atrás da ficha fica inerte enquanto ela está aberta
  assert.equal(await page.evaluate(() => document.getElementById('page-mercado').inert), true);
  // o Tab gira dentro da ficha
  for (let n = 0; n < 8; n++) {
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.getElementById('cons-ficha').contains(document.activeElement)), true, `Tab ${n}`);
  }
  await page.keyboard.press('Shift+Tab');
  assert.equal(await page.evaluate(() => document.getElementById('cons-ficha').contains(document.activeElement)), true);
  // Esc fecha e o foco volta ao nome clicado
  await page.keyboard.press('Escape');
  assert.equal(await page.isVisible('#cons-ficha'), false);
  assert.equal(await botao.evaluate(b => b === document.activeElement), true, 'o foco volta ao botão do ranking');
  assert.equal(await page.evaluate(() => document.getElementById('page-mercado').inert), false, 'a página volta a responder');
});

test('ficha de grupo: o grupo de um integrante abre a ficha dele; o fundo e o botão fecham', async () => {
  const { maisConsorcios: grupo } = await fichasDoRanking();
  await abrirDoRanking(grupo);
  const outro = page.locator('#cons-ficha .cons-int__grupo .cons-open').first();
  assert.ok(await outro.count() > 0, 'o grupo tem consórcio com integrante de outro grupo');
  const nome = await outro.getAttribute('data-ficha');
  const esperado = await page.evaluate(g => LeiloesModel.fichaGrupo(g, window.CONC).grupo, nome);
  await outro.click();
  assert.equal(await page.textContent('#cons-titulo'), esperado);
  await page.click('#cons-ficha [data-fechar]');
  assert.equal(await page.isVisible('#cons-ficha'), false);
  await abrirDoRanking(grupo);
  await page.mouse.click(4, 600);  // fora do painel
  assert.equal(await page.isVisible('#cons-ficha'), false);
});

test('ficha de grupo: consórcio sem composição localizada e grupo que disputou sozinho nunca abrem vazios', async () => {
  const { semComposicao, sozinho } = await fichasDoRanking();
  assert.ok(semComposicao, 'algum grupo do ranking tem consórcio sem composição localizada');
  assert.ok(sozinho, 'algum grupo do ranking disputou sozinho');
  let esperado = await page.evaluate(g => LeiloesModel.fichaGrupo(g, window.CONC), semComposicao);
  await abrirDoRanking(semComposicao);
  assert.equal(await page.locator('#cons-ficha .cons-sem').count(), esperado.consorcios.filter(c => !c.composicaoLocalizada).length);
  assert.match(await page.textContent('#cons-ficha'), /Composição não localizada\./);
  await fechaFicha();
  esperado = await page.evaluate(g => LeiloesModel.fichaGrupo(g, window.CONC), sozinho);
  await abrirDoRanking(sozinho);
  assert.match(await page.textContent('#cons-ficha'), /Nenhum consórcio na base: o grupo disputou sozinho/);
  assert.equal(await page.locator('#cons-ficha .cons-card').count(), 0);
  assert.deepEqual(await page.locator('#cons-ficha .cons-leilao__como').allTextContents(), esperado.leiloes.map(como(esperado.grupo)));
  assert.ok((await page.locator('#cons-ficha .cons-leilao__como').allTextContents()).every(t => t.startsWith('Participou sozinho')));
  assert.ok(await page.locator('#cons-ficha .cons-leilao').count() > 0);
  await fechaFicha();
});

test('ficha de grupo: abre pelo nome de consórcio na tabela de participantes; só consórcios são botões', async () => {
  await go('#mercado');
  const alvo = await page.evaluate(() => {
    const c = window.CONC, p = c.mercado.participantes.find(r => c.consorcios.some(k => k.nome === r.vencedor && k.ano === r.ano && k.lote === r.lote && k.integrantes.length));
    return { ano: String(p.ano), lote: p.lote, nome: p.vencedor, ficha: LeiloesModel.fichaGrupo(p.vencedor, c) };
  });
  await page.selectOption('#part-ano', alvo.ano);
  const linha = page.locator('#chart-part tbody tr', { hasText: alvo.lote }).first();
  // todos os botões da tabela são nomes de consórcio (nome de consórcio ou registro na base); empresas isoladas seguem como texto
  const nomes = await page.$$eval('#chart-part tbody button[data-ficha]', bs => bs.map(b => b.dataset.ficha));
  assert.ok(nomes.length > 0);
  assert.ok(await page.evaluate(ns => ns.every(n => LeiloesModel.ehConsorcio(n, window.CONC.consorcios)), nomes));
  await linha.getByRole('button', { name: alvo.nome, exact: true }).first().click();
  await page.waitForSelector('#cons-ficha', { state: 'visible' });
  assert.equal(await page.textContent('#cons-titulo'), alvo.ficha.grupo);
  assert.ok((await page.locator('#cons-ficha .cons-card h4').allTextContents()).includes(alvo.nome));
  // o consórcio clicado, naquele leilão, fica marcado e à vista
  const marcado = page.locator('#cons-ficha .cons-card.is-alvo');
  assert.equal(await marcado.count(), 1);
  assert.equal(await marcado.locator('h4').textContent(), alvo.nome);
  assert.match(await marcado.locator('.cons-meta').textContent(), new RegExp(`^${alvo.ano} · `));
  assert.equal(await marcado.evaluate(e => { const r = e.getBoundingClientRect(), d = document.getElementById('cons-ficha').getBoundingClientRect(); return r.top >= d.top && r.top < d.bottom; }), true);
  await page.keyboard.press('Escape');
  await page.selectOption('#part-ano', '');
});

test('ficha de grupo: linhas dos gráficos de grupos abrem a ficha por clique e teclado; "Outros" não é clicável', async () => {
  await go('#mercado');
  for (const id of ['grupos', 'gruposInv']) {
    const linhas = page.locator(`#chart-${id} .hrow[data-k]`);
    const m = await page.evaluate(() => window.CONC.mercado.grupos.map(g => g.grupo));
    // sem botão: "Outros N grupos" e grupo sem nenhum leilão na base (a ficha não teria o que mostrar)
    const semOutros = await page.evaluate(() => window.CONC.mercado.grupos.map(g => g.grupo)
      .filter(g => !g.startsWith('Outros') && LeiloesModel.fichaGrupo(g, window.CONC).leiloes.length));
    assert.ok(semOutros.length > 0 && semOutros.length <= m.length);
    assert.equal(await linhas.count(), semOutros.length, id);
    assert.equal(await page.locator(`#chart-${id} g.hrow-tip:not([data-k])`).count(), m.length - semOutros.length, `${id}: só as linhas sem ficha ficam sem botão`);
    assert.ok((await page.locator(`#chart-${id} g.hrow-tip:not([data-k]) text`).allTextContents()).some(t => t === m.find(g => g.startsWith('Outros'))));
    // teclado: Enter na linha focada
    const k = await linhas.first().getAttribute('data-k');
    assert.equal(await linhas.first().getAttribute('role'), 'button');
    assert.equal(await linhas.first().getAttribute('tabindex'), '0');
    await linhas.first().focus();
    await page.keyboard.press('Enter');
    await page.waitForSelector('#cons-ficha', { state: 'visible' });
    assert.equal(await page.textContent('#cons-titulo'), await page.evaluate(g => LeiloesModel.fichaGrupo(g, window.CONC).grupo, k), id);
    await page.keyboard.press('Escape');
    assert.equal(await linhas.first().evaluate(e => e === document.activeElement), true, `${id}: foco volta à linha`);
    // clique numa linha do meio
    const ultimo = linhas.last();
    await ultimo.click({ position: { x: 20, y: 10 } });
    await page.waitForSelector('#cons-ficha', { state: 'visible' });
    assert.equal(await page.textContent('#cons-titulo'), await page.evaluate(g => LeiloesModel.fichaGrupo(g, window.CONC).grupo, await ultimo.getAttribute('data-k')), id);
    await page.keyboard.press('Escape');
  }
  // o clique em "Outros" não abre nada
  await page.locator('#chart-grupos g.hrow-tip:not([data-k])').last().click({ position: { x: 20, y: 10 } });  // a última é "Outros"
  assert.equal(await page.isVisible('#cons-ficha'), false);
});

test('ficha de grupo: link do glossário na ficha fecha o painel e leva ao termo', async () => {
  const { comImprensa: grupo } = await fichasDoRanking();
  await abrirDoRanking(grupo);
  await page.click('#cons-ficha .cons-lead a[href="#glossario/consorcio"]');
  await page.waitForTimeout(250);
  assert.equal(await page.isVisible('#cons-ficha'), false);
  assert.equal(await page.evaluate(() => location.hash), '#glossario/consorcio');
  await go('#mercado');
});

test('celular: ficha de grupo sem rolagem horizontal, painel dentro da tela', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.route('**/*', r => (/^(file|data):/.test(r.request().url()) ? r.continue() : r.abort()));
  const p = await context.newPage();
  await p.goto('file://' + HTML + '#mercado');
  await p.waitForSelector('#ranking-grupos tbody button');
  const grupo = await p.evaluate(() => {
    const c = window.CONC, rk = LeiloesModel.rankingGrupos(c.mercado.participantes, c.grupos_alias);
    return rk.map(r => LeiloesModel.fichaGrupo(r.grupo, c)).sort((a, b) => b.consorcios.length - a.consorcios.length)[0].grupo;
  });
  await p.locator('#ranking-grupos tbody').getByRole('button', { name: grupo, exact: true }).click();
  await p.waitForSelector('#cons-ficha', { state: 'visible' });
  const w = await p.evaluate(() => {
    const d = document.getElementById('cons-ficha'), r = d.getBoundingClientRect();
    return { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, left: r.left, right: r.right, vw: innerWidth,
      interno: d.scrollWidth - d.clientWidth };
  });
  assert.ok(w.sw <= w.cw, `a página alargou: ${w.sw} > ${w.cw}`);
  assert.ok(w.left >= 0 && w.right <= w.vw, 'painel fora da tela');
  assert.ok(w.interno <= 0, `algo dentro da ficha alarga além do painel (${w.interno}px)`);
  await context.close();
});

test('ficha de grupo: a contagem de leilões fecha com o ranking, ligação por alias e "não venceu" aparecem', async () => {
  await go('#mercado');
  const x = await page.evaluate(() => {
    const c = window.CONC, rk = LeiloesModel.rankingGrupos(c.mercado.participantes, c.grupos_alias), fichas = rk.map(r => LeiloesModel.fichaGrupo(r.grupo, c));
    const dif = rk.filter((r, i) => new Set(fichas[i].leiloes.map(l => `${l.ano}|${l.lote}`)).size - fichas[i].foraDoRanking !== r.participacoes).map(r => r.grupo);
    const grupoAtrib = fichas.find(f => f.leiloes.some(l => !l.consorcio && l.atribuicao && l.atribuicao.motivo));
    const grupoSoIntegrante = fichas.find(f => f.foraDoRanking > 0);
    const naoVenceu = c.consorcios.filter(k => k.fora_da_camada && !k.venceu && k.integrantes.length).map(k => k.integrantes[0].grupo);
    return { dif, atrib: grupoAtrib && grupoAtrib.grupo, integrante: grupoSoIntegrante && grupoSoIntegrante.grupo, naoVenceu: naoVenceu[0] };
  });
  assert.deepEqual(x.dif, [], 'a ficha conta cada leilão uma vez, como o ranking (fora os de consórcio/ata)');
  // ligação por alias: motivo e fonte na linha do leilão
  assert.ok(x.atrib, 'algum grupo tem nome ligado por alias');
  await abrirDoRanking(x.atrib);
  const esperado = await page.evaluate(g => LeiloesModel.fichaGrupo(g, window.CONC), x.atrib);
  const comAtrib = esperado.leiloes.filter(l => !l.consorcio && l.atribuicao);
  assert.equal(await page.locator('#cons-ficha .cons-leilao > .cons-atrib').count(), comAtrib.length);
  assert.match(await page.locator('#cons-ficha .cons-leilao > .cons-atrib').first().textContent(), new RegExp(`^Nome ligado a este grupo \\(${comAtrib[0].atribuicao.motivo}( ${esperado.grupo})?\\)$`));
  // a nota da contagem só aparece quando a ficha traz leilão que o ranking não conta
  assert.equal(await page.locator('#cons-nota-ranking').count(), esperado.foraDoRanking > 0 ? 1 : 0);
  await fechaFicha();
  assert.ok(x.integrante, 'algum grupo participa só como integrante de consórcio');
  await page.evaluate(g => Consorcios.abrir(g), x.integrante);
  const e2 = await page.evaluate(g => LeiloesModel.fichaGrupo(g, window.CONC), x.integrante);
  assert.match(await page.textContent('#cons-nota-ranking'), new RegExp(`^Inclui ${e2.foraDoRanking} leil(ão|ões) que o ranking não conta para este grupo`));
  await fechaFicha();
  // consórcio que só consta da ata e é marcado como não vencedor: "Não venceu", nunca "Perdeu"
  assert.ok(x.naoVenceu, 'algum consórcio fora da camada tem integrante');
  await page.evaluate(g => Consorcios.abrir(g), x.naoVenceu);
  const f3 = await page.evaluate(g => LeiloesModel.fichaGrupo(g, window.CONC), x.naoVenceu);
  const nv = f3.leiloes.filter(l => l.resultado === 'naoVenceu').length;
  assert.ok(nv > 0);
  assert.equal(await page.locator('#cons-ficha .cons-leilao .cons-res--naoVenceu').count(), nv);
  assert.equal(await page.locator('#cons-ficha .cons-leilao .cons-res--naoVenceu').first().textContent(), 'Não venceu');
  await fechaFicha();
});
