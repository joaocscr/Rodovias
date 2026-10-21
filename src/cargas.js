// Aba Cargas: produção agrícola (IBGE PAM, medido), armazenagem, exportação (Comex Stat), fluxos ferroviários (SIADE),
// fretes rodoviários (CONAB) e carga agrícola modelada por trecho (PNL). Mesmo padrão da aba Mercado; cada cartão só com o seu bloco.
const Cargas = (() => {
  const IM = IntelModel;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fonte = IM.fonteTipo;
  const GRAOS = ['Soja', 'Milho'];
  const FRETE_COLS = [ // [chave, rótulo, numérica]
    ['origem', 'Origem', false], ['uf_o', 'UF', false], ['destino', 'Destino', false], ['uf_d', 'UF', false],
    ['km', 'km', true], ['rs_t', 'R$/t', true], ['rs_tkm', 'R$/t·km', true],
  ];
  let intel = null, snv = null, built = false, sh4 = null;
  const frete = { uf: '', key: 'rs_t', dir: 'desc' };

  function card(id, title, sub, o = {}) {
    return `<article class="ccard${o.wide ? ' ccard--wide' : ''}" id="card-${id}">
      <h3>${esc(title)}</h3>${sub ? `<p class="sub">${esc(sub)}</p>` : ''}
      ${o.legend || ''}<div class="chart-box" id="chart-${id}">${o.html || ''}</div>
      ${o.note ? `<p class="src">${esc(o.note)}</p>` : ''}<p class="src">Fonte: ${esc(o.fonte || '—')}</p></article>`;
  }
  const tile = (id, value, label) => `<div class="kpi-tile" id="${id}"><b>${esc(value)}</b><span>${esc(label)}</span></div>`;
  const box = id => document.getElementById('chart-' + id);
  const width = el => Math.max(320, (el && el.clientWidth) || 640);
  const agro = () => intel.agro || null, mm = () => intel.multimodal || null;
  const pam = () => fonte(agro(), /PAM/), est = () => fonte(agro(), /Estoques/);

  function onRows(el, fn) {
    el.addEventListener('click', ev => { const g = ev.target.closest('[data-k]'); if (g && el.contains(g)) fn(Number(g.dataset.k)); });
    el.addEventListener('keydown', ev => {
      const g = ev.target.closest('[data-k]');
      if (g && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); fn(Number(g.dataset.k)); }
    });
  }

  // ---------- Navegação para o mapa ----------
  // Liga o fundo Soja (pelo rádio do painel, que também desenha a legenda), enquadra e abre o município k.
  function openMun(k) {
    const mu = intel.municipios, id = mu.ids[k], c = mu.centro && mu.centro[k];
    Tabs.goThen('#mapa', () => {
      MapView.invalidate();
      const radio = document.querySelector('#layers-section input[name="fundo"][value="soja"]');
      if (radio) { radio.checked = true; radio.dispatchEvent(new Event('change', { bubbles: true })); } else Layers.setFundo('soja');
      if (c) MapView.map.fitBounds(L.latLngBounds([[c[1] - 0.4, c[0] - 0.4], [c[1] + 0.4, c[0] + 0.4]]),
        { paddingTopLeft: [64, 64], paddingBottomRight: [424, 64], maxZoom: 8, animate: false });
      Layers.open('mun', id);
    });
  }

  function openFis(j) {
    Tabs.goThen('#mapa', () => {
      MapView.invalidate();
      MapView.fitTo([j]);
      MapView.map.panBy([188, 0], { animate: false }); // o cartão ocupa a direita
      MapView.pick(j);
    });
  }

  // ---------- Cartões ----------
  function kpisCard() {
    const k = IM.cargasKpis(intel), a = agro(), tiles = [];
    if (a) {
      tiles.push(tile('kpi-soja', IM.fmtT(k.soja), `de soja em ${a.ano} (PAM)`));
      tiles.push(tile('kpi-milho', IM.fmtT(k.milho), `de milho em ${a.ano}, 1ª + 2ª safra (PAM)`));
      tiles.push(tile('kpi-cana', IM.fmtT(k.cana), `de cana-de-açúcar em ${a.ano} (PAM)`));
      if (a.armazenagem) tiles.push(tile('kpi-arm', IM.fmtT(k.cap), `de capacidade de armazenagem, ${a.armazenagem.periodo} (sem municípios sob sigilo)`));
    }
    const e = mm() && mm().exportacao;
    if (k.expSoja != null) tiles.push(tile('kpi-exp-soja', IM.fmtT(k.expSoja), `de soja exportada em ${e.ano} (Comex Stat)`));
    if (k.expMilho != null) tiles.push(tile('kpi-exp-milho', IM.fmtT(k.expMilho), `de milho exportado em ${e.ano} (Comex Stat)`));
    if (!tiles.length) return '';
    const f = [a && pam(), a && a.armazenagem && est(), e && fonte(mm(), /Comex/)].filter(Boolean);
    return card('c-kpis', 'Cargas agrícolas em números', 'Produção, armazenagem e exportação, todas medidas', { wide: true, html: `<div class="kpis">${tiles.join('')}</div>`, fonte: f.join('; ') });
  }

  function prodCard() {
    if (!IM.producaoPorUf(intel).length) return '';
    return card('c-uf', `Produção de soja e milho por UF, ${agro().ano}`, 'As 15 maiores UFs em cada produto, em toneladas', { wide: true, fonte: pam(),
      html: `<div class="duo"><div><h4 class="duo__title">Soja</h4><div id="chart-c-uf-s"></div></div>
        <div><h4 class="duo__title">Milho</h4>${Charts.legendHtml([['1ª safra', Charts.C.deep], ['2ª safra', Charts.C.bright]])}<div id="chart-c-uf-m"></div></div></div>` });
  }

  function munCard() {
    if (!IM.topMunicipios(intel, 'soja', 1).length) return '';
    return card('c-mun', `Os 20 maiores municípios produtores de soja, ${agro().ano}`, 'Toneladas; clique num município para vê-lo no mapa com o fundo Soja', { fonte: pam() });
  }

  function siadeCard() {
    if (!IM.siadePares(intel, GRAOS, 1).length) return '';
    return card('c-siade', 'Fluxos ferroviários de grãos', 'Os 15 maiores pares origem → destino de soja e milho, toneladas úteis no ano',
      { legend: Charts.legendHtml([['Soja', Charts.C.deep], ['Milho', Charts.C.bright]]), fonte: fonte(mm(), /SIADE/),
        note: 'Pares por estação ferroviária; açúcar, farelo de soja e fertilizantes ficam de fora.' });
  }

  function expCard() {
    const prods = IM.exportProdutos(intel);
    if (!prods.length) return '';
    if (!sh4 || !prods.some(p => p.sh4 === sh4)) sh4 = (prods.find(p => p.sh4 === '1201') || prods[0]).sh4;
    const e = mm().exportacao;
    return card('c-exp', `Exportação ${e.ano} por URF de despacho`, 'As 12 maiores unidades da Receita no despacho do produto escolhido, e de onde vem a mercadoria', {
      wide: true, fonte: fonte(mm(), /Comex/), note: 'A URF é a unidade da Receita onde a exportação foi despachada, não necessariamente o ponto de saída rodoviário; UF = origem da mercadoria.',
      legend: `<div class="toolbar"><label class="sub" for="exp-sh4">Produto</label><select id="exp-sh4">${prods.map(p =>
        `<option value="${esc(p.sh4)}"${p.sh4 === sh4 ? ' selected' : ''}>${esc(p.nome)} (SH4 ${esc(p.sh4)})</option>`).join('')}</select></div>`,
      html: '<div id="chart-c-exp-bars"></div><h4 class="duo__title">Matriz UF de origem × URF de despacho (Mt)</h4><div class="table-wrap table-wrap--x" id="chart-c-exp-mat"></div>' });
  }

  function fretesCard() {
    const r = IM.fretesRows(intel);
    if (!r.length) return '';
    const ufs = [...new Set(r.map(x => x.uf_o).filter(Boolean))].sort();
    return card('c-fretes', `Fretes rodoviários de grãos, ${mm().fretes.mes}`, 'Clique no cabeçalho para ordenar; R$/t·km = R$/t ÷ distância', {
      wide: true, fonte: fonte(mm(), /CONAB/),
      note: '"Origem aproximada": no boletim, a origem vem numa célula mesclada e foi atribuída por proximidade. ' +
        '"Distância suspeita na fonte": o km do boletim é menor que 0,9 vez ou maior que 3 vezes a linha reta entre as sedes dos municípios ' +
        '(ou origem e destino são o mesmo município); nessas rotas o R$/t·km não é calculado e elas ficam no fim da tabela.',
      legend: `<div class="toolbar"><label class="sub" for="frete-uf">UF de origem</label><select id="frete-uf"><option value="">Todas</option>${ufs.map(u => `<option>${esc(u)}</option>`).join('')}</select>
        <span class="page__src" id="frete-n"></span></div>`,
      html: '<div class="table-wrap" style="max-height:480px"><table class="grid" id="frete-table" data-csv-name="fretes"></table></div>' });
  }

  function cargaCard() {
    const c = IM.cargaOf(intel);
    if (!c || !IM.cargaTop(intel, snv, 1).length) return '';
    return card('c-pnl', 'Trechos com maior carga agrícola', `Os 15 trechos físicos com mais granel sólido agrícola por ano (${c.cenario || 'PNL 2035'}, ano-base ${c.ano_base}); clique para ver no mapa`,
      { wide: true, fonte: fonte(c, /PNL/), note: 'Estimativa de modelo de alocação em rede, não contagem.' });
  }

  // ---------- Desenho ----------
  function drawExp() {
    const bars = document.getElementById('chart-c-exp-bars'), mat = document.getElementById('chart-c-exp-mat');
    if (!bars) return;
    const nome = (IM.exportProdutos(intel).find(p => p.sh4 === sh4) || {}).nome || sh4;
    bars.innerHTML = Charts.hstackSvg(IM.exportPorUrf(intel, sh4, 12).map(u => ({ label: u.urf, parts: [u.t] })),
      { width: width(bars), labelWidth: 280, names: [nome], colors: [Charts.C.deep], format: v => IM.fmtT(v), title: `Exportação de ${nome} por URF` });
    bars.dataset.sh4 = sh4;
    const m = IM.exportMatriz(intel, sh4, 10, 8);
    mat.innerHTML = `<table class="grid grid--static" data-csv-name="cargas-matriz-uf-urf"><thead><tr><th>UF</th>${m.urfs.map(u => `<th class="num">${esc(u)}</th>`).join('')}</tr></thead><tbody>${
      m.ufs.map((uf, a) => `<tr><td>${esc(uf)}</td>${m.m[a].map(v => `<td class="num">${IM.fmtMt(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  }

  function drawFretes() {
    const t = document.getElementById('frete-table');
    if (!t) return;
    // rotas com distância suspeita na fonte ficam no fim, qualquer que seja a coluna ordenada
    const all = IM.fretesRows(intel), list = IM.suspeitosNoFim(ConcModel.sortRows(all.filter(r => !frete.uf || r.uf_o === frete.uf), frete.key, frete.dir));
    const num = (v, d) => (IM.has(v) ? IM.fmtDec(v, d) : '—');
    const tkm = r => (r.kmSuspeito ? '— <span class="tag-nv">distância suspeita na fonte</span>' : num(r.rs_tkm, 3));
    t.innerHTML = `<thead><tr>${FRETE_COLS.map(([k, l, n]) => `<th class="${n ? 'num' : ''}"${k === frete.key ? ` aria-sort="${frete.dir === 'asc' ? 'ascending' : 'descending'}"` : ''}>
        <button type="button" data-fsort="${k}">${esc(l)}${k === frete.key ? (frete.dir === 'asc' ? ' ↑' : ' ↓') : ''}</button></th>`).join('')}</tr></thead>
      <tbody>${list.map(r => `<tr class="is-static" data-rst="${IM.has(r.rs_t) ? r.rs_t : ''}"${r.kmSuspeito ? ' data-suspeito="1"' : ''}><td>${esc(r.origem)}${r.aprox ? ' <span class="tag-nv">origem aproximada</span>' : ''}</td><td>${esc(r.uf_o || '—')}</td>
        <td>${esc(r.destino)}</td><td>${esc(r.uf_d || '—')}</td><td class="num">${num(r.km, 0)}</td><td class="num">${num(r.rs_t, 2)}</td><td class="num">${tkm(r)}</td></tr>`).join('')}</tbody>`;
    document.getElementById('frete-n').textContent = `${IM.fmtInt(list.length)} de ${IM.fmtInt(all.length)} rotas`;
  }

  function drawCarga() {
    const el = box('c-pnl');
    if (!el) return;
    const list = IM.cargaTop(intel, snv, 15), max = list.length ? list[0].gsa : 1;
    el.innerHTML = `<div class="table-wrap table-wrap--static"><table class="grid grid--static grid--rows" id="pnl-table" data-csv-name="cargas-pnl"><thead><tr><th>BR/UF</th><th>Trecho (início → fim)</th><th class="num">Carga agrícola por ano</th><th><span class="visually-hidden">Proporção</span></th></tr></thead><tbody>${
      list.map(r => `<tr tabindex="0" data-k="${r.j}" title="Ver no mapa"><td class="name">${esc(r.br)}/${esc(r.uf)}</td><td class="wrap">${esc(r.ini)} → ${esc(r.fim)}</td>
        <td class="num">${IM.fmtT(r.gsa)}</td><td class="bar-cell"><span style="width:${(r.gsa / max * 100).toFixed(1)}%"></span></td></tr>`).join('')}</tbody></table></div>`;
    onRows(el, openFis);
  }

  function draw() {
    const us = document.getElementById('chart-c-uf-s'), um = document.getElementById('chart-c-uf-m');
    if (us && um) {
      const list = IM.producaoPorUf(intel);
      const top = f => [...list].sort((a, b) => f(b) - f(a)).slice(0, 15);
      us.innerHTML = Charts.hstackSvg(top(u => u.soja).map(u => ({ label: u.uf, parts: [u.soja] })),
        { width: width(us), rh: 24, labelWidth: 48, names: ['Soja'], colors: [Charts.C.deep], format: v => IM.fmtT(v), title: 'Soja por UF' });
      um.innerHTML = Charts.hstackSvg(top(u => u.milho1 + u.milho2).map(u => ({ label: u.uf, parts: [u.milho1, u.milho2] })),
        { width: width(um), rh: 24, labelWidth: 48, names: ['1ª safra', '2ª safra'], colors: [Charts.C.deep, Charts.C.bright], format: v => IM.fmtT(v), title: 'Milho por UF' });
    }
    const mu = box('c-mun');
    if (mu) {
      mu.innerHTML = Charts.hstackSvg(IM.topMunicipios(intel, 'soja', 20).map(m => ({ k: m.k, label: `${m.nome}/${m.uf}`, parts: [m.v] })),
        { width: width(mu), labelWidth: 220, names: ['Soja'], colors: [Charts.C.deep], format: v => IM.fmtT(v), clickable: true, title: 'Maiores municípios produtores de soja' });
      onRows(mu, openMun);
    }
    const si = box('c-siade');
    if (si) {
      si.innerHTML = Charts.hstackSvg(IM.siadePares(intel, GRAOS, 15).map(p => ({ label: `${p.o}/${p.uo} → ${p.d}/${p.ud}`, parts: p.parts })),
        { width: width(si), labelWidth: 300, names: GRAOS, colors: [Charts.C.deep, Charts.C.bright], format: v => IM.fmtT(v), title: 'Fluxos ferroviários de grãos' });
    }
    drawExp();
    const sel = document.getElementById('exp-sh4');
    if (sel) sel.addEventListener('change', ev => { sh4 = ev.target.value; drawExp(); });
    drawFretes();
    const ft = document.getElementById('frete-table');
    if (ft) {
      ft.addEventListener('click', ev => {
        const b = ev.target.closest('[data-fsort]');
        if (!b) return;
        const k = b.dataset.fsort, numeric = FRETE_COLS.find(c => c[0] === k)[2];
        if (frete.key === k) frete.dir = frete.dir === 'asc' ? 'desc' : 'asc';
        else { frete.key = k; frete.dir = numeric ? 'desc' : 'asc'; }
        drawFretes();
      });
      document.getElementById('frete-uf').addEventListener('change', ev => { frete.uf = ev.target.value; drawFretes(); });
    }
    drawCarga();
  }

  function render() {
    const el = document.getElementById('page-cargas');
    const cards = [kpisCard(), prodCard(), munCard(), siadeCard(), expCard(), fretesCard(), cargaCard()].join('');
    el.innerHTML = `<div class="page__inner">
      <h1 class="page__title">Cargas agrícolas e logística</h1>
      <p class="page__lead">Onde se produz (IBGE PAM e Estoques), por onde se exporta (Comex Stat), o que vai de trem (SIADE), quanto custa o frete rodoviário (CONAB) e quais trechos federais carregam mais grãos segundo o modelo do PNL. Cada cartão diz a fonte, o período e se o dado é medido ou modelado.</p>
      ${cards ? `<div class="grid-cards">${cards}</div>` : '<p class="empty">Os dados de cargas (blocos agro, multimodal e carga) não estão neste arquivo.</p>'}</div>`;
    if (cards) draw();
  }

  function init(intelData, snvData) {
    if (built) return;
    built = true;
    intel = intelData || {}; snv = snvData;
    render();
  }

  return { init };
})();
