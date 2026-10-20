// Aba Tráfego: praças de pedágio ANTT (contagem medida), VMDa (modelado), acidentes PRF (medido) e Índice ABCR.
// Mesmo padrão da aba Mercado (cartões, gráficos SVG próprios, "Fonte:" em cada cartão). Cada cartão só aparece com o seu bloco.
const Trafego = (() => {
  const IM = IntelModel;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  let intel = null, snv = null, built = false;

  const fonte = IM.fonteTipo;
  // o tipo das praças está em antt.pracas.tipo (as fontes do bloco antt não o repetem)
  const fontePracas = () => fonte(intel.antt, /Praças de pedágio/, intel.antt && intel.antt.pracas && intel.antt.pracas.tipo);

  function card(id, title, sub, o = {}) {
    return `<article class="ccard${o.wide ? ' ccard--wide' : ''}" id="card-${id}">
      <h3>${esc(title)}</h3>${sub ? `<p class="sub">${esc(sub)}</p>` : ''}
      ${o.legend || ''}<div class="chart-box" id="chart-${id}">${o.html || ''}</div>
      ${o.note ? `<p class="src">${esc(o.note)}</p>` : ''}<p class="src">Fonte: ${esc(o.fonte || '—')}</p></article>`;
  }

  const tile = (id, value, label) => `<div class="kpi-tile" id="${id}"><b>${esc(value)}</b><span>${esc(label)}</span></div>`;
  const box = id => document.getElementById('chart-' + id);
  const width = el => Math.max(320, (el && el.clientWidth) || 640);
  const ym = s => { const [y, m] = String(s).split('-').map(Number); return { y, m }; };
  const anosLabel = IM.anosLabel;

  // ---------- Navegação para o mapa ----------
  function openPraca(i) {
    Tabs.goThen('#mapa', () => {
      MapView.invalidate();
      const cb = document.querySelector('#layers-section input[data-layer="pracas"]');
      if (cb) cb.checked = true;
      Layers.toggle('pracas', true);
      const r = Layers.rowsOf('pracas')[i];
      if (r && IM.has(r.lat) && IM.has(r.lon)) {
        // à direita fica o cartão (~360 px): enquadra no espaço livre
        MapView.map.fitBounds(L.latLngBounds([[r.lat - 0.02, r.lon - 0.02], [r.lat + 0.02, r.lon + 0.02]]),
          { paddingTopLeft: [64, 64], paddingBottomRight: [424, 64], maxZoom: 10, animate: false });
      }
      Layers.open('pracas', i);
    });
  }

  // Clique / Enter / Espaço numa linha .hrow[data-k] do gráfico.
  function onRows(el, fn) {
    el.addEventListener('click', ev => { const g = ev.target.closest('.hrow[data-k]'); if (g) fn(Number(g.dataset.k)); });
    el.addEventListener('keydown', ev => {
      const g = ev.target.closest('.hrow[data-k]');
      if (g && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); fn(Number(g.dataset.k)); }
    });
  }

  // ---------- Cartões ----------
  function kpisCard() {
    const k = IM.trafegoKpis(intel, snv), tr = intel.trafego || {}, ac = IM.acidOf(intel), v25 = IM.v25Of(intel);
    const tiles = [];
    if (k.nPracas != null) {
      tiles.push(tile('kpi-pracas', IM.fmtInt(k.nPracas), 'praças com contagem em 2025 (ANTT, medido)'));
      tiles.push(tile('kpi-vmd', IM.fmtInt(k.vmdTotal), 'veíc./dia somados nas praças (VMD 2025, dois sentidos)'));
      tiles.push(tile('kpi-pes', IM.fmtPct(k.pctPes), 'de pesados nas praças, ponderado pelo VMD'));
    }
    // veíc·km/dia: VMDa 2025 (DNIT) na malha federal e na estadual; sem o bloco 2025, o federal com o VMDa 2023
    if (k.vkm != null) tiles.push(tile('kpi-vkm', IM.fmtVkm(k.vkm), `na malha federal (VMDa ${k.anoVkm}, modelado)`));
    if (k.vkmEst != null) tiles.push(tile('kpi-vkm-est', IM.fmtVkm(k.vkmEst), `nas rodovias estaduais (VMDa ${IM.estTrafego(intel).ano}, modelado)`));
    if (ac) {
      tiles.push(tile('kpi-acid', IM.fmtInt(k.acidAno), `acidentes/ano (PRF ${anosLabel(ac.anos)}, medido)`));
      tiles.push(tile('kpi-mortos', IM.fmtInt(k.mortosAno), `mortos/ano (PRF ${anosLabel(ac.anos)}, medido)`));
    }
    if (!tiles.length) return '';
    const fVmda = k.vkm == null && k.vkmEst == null ? null : v25 || k.vkmEst != null ? fonte(intel.vmda2025, /VMDa/) : fonte(tr, /VMDa/);
    const f = [k.nPracas != null && fontePracas(), fVmda, ac && fonte(tr, /PRF/)].filter(Boolean);
    const km = x => IM.fmtInt(x);
    const note = k.vkmEst != null
      ? `Rodovias estaduais: trechos da malha estadual pavimentados, duplicados ou em obras de pavimentação, mais os usados por concessões estaduais; ficam fora os trechos com código ou jurisdição federal e os que se sobrepõem a rodovias federais do SNV em mais de 80% da extensão. ${km(k.kmEst)} km com estimativa de ${km(k.kmEstTotal)} km; veíc·km/dia = Σ VMDa × extensão.`
      : '';
    return card('t-kpis', 'Tráfego e segurança em números',
      `Praças medidas pela ANTT, volume modelado da malha federal${k.vkmEst != null ? ' e da estadual' : ''} e acidentes registrados pela PRF`,
      { wide: true, html: `<div class="kpis">${tiles.join('')}</div>`, fonte: f.join('; '), note });
  }

  function rankingCard() {
    if (!IM.pracasRanking(intel, 1).length) return '';
    return card('t-rank', 'As 20 praças de maior VMD em 2025', 'Veículos por dia, dois sentidos; clique numa praça para abri-la no mapa',
      { legend: Charts.legendHtml([['Leves', Charts.C.deep], ['Pesados', Charts.C.bright], ['Motos', Charts.C.grey]]),
        fonte: fontePracas(), note: 'VMD 2025 = média diária dos meses com dado em 2025; contagem medida.' });
  }

  function serieCard(s) {
    if (!s || !s.n) return '';
    const per = `${IM.monthLabel(s.meses[0])} a ${IM.monthLabel(s.meses[s.meses.length - 1])}`;
    return card('t-serie', `Tráfego mensal nas praças, ${per}`, 'VMD do mês somado (mil veíc./dia), leves × pesados',
      { legend: Charts.legendHtml([['Leves', Charts.C.deep], ['Pesados', Charts.C.bright]]), fonte: fontePracas(),
        note: `Entram só as ${IM.fmtInt(s.n)} praças (de ${IM.fmtInt(s.total)}) com os ${s.meses.length} meses completos, para a série não oscilar com praças que entram ou saem.` });
  }

  const ABCR_NOTE = 'Índice 1999 = 100, rodovias pedagiadas, não é volume.';
  function abcrCards(a) {
    if (!a || !Array.isArray(a.meses) || !a.meses.length) return '';
    const f = fonte(intel.trafego, /ABCR/);
    const per = `${IM.monthLabel(a.meses[0])} a ${IM.monthLabel(a.meses[a.meses.length - 1])}`;
    return card('t-abcr', 'Índice ABCR de fluxo pedagiado', `Série mensal original, Brasil, ${per}`,
      { legend: Charts.legendHtml([['Leves', Charts.C.deep], ['Pesados', Charts.C.bright], ['Total', Charts.C.grey]]), fonte: f, note: ABCR_NOTE }) +
      card('t-saz', 'Perfil sazonal do Índice ABCR', `Média do índice total por mês do calendário, ${per}`, { fonte: f, note: ABCR_NOTE });
  }

  function acidCards() {
    const ac = IM.acidOf(intel);
    if (!ac || !ac.n) return '';
    const f = fonte(intel.trafego, /PRF/), anos = anosLabel(ac.anos);
    let out = card('t-uf', `Acidentes e mortos por UF, média ${anos}`, 'Por ano; cada trecho conta na UF do seu registro principal no SNV',
      { wide: true, fonte: f, html: '<div class="duo"><div><h4 class="duo__title">Acidentes/ano</h4><div id="chart-t-uf-a"></div></div><div><h4 class="duo__title">Mortos/ano</h4><div id="chart-t-uf-m"></div></div></div>' });
    if (IM.vmdaOf(intel)) {
      out += card('t-taxa', 'As 15 BRs/UF com maior taxa de acidentes', `Acidentes por 10⁶ veíc·km, PRF ${anos} ÷ VMDa ${IM.vmdaOf(intel).ano}`,
        { wide: true, fonte: `${f}; ${fonte(intel.trafego, /VMDa/)}`,
          note: 'Só trechos com VMDa (modelado) e BR/UF com pelo menos 10 km somados; trechos planejados no SNV ficam de fora. Acidentes medidos, exposição modelada.' });
    }
    return out;
  }

  // ---------- Desenho ----------
  function draw(s) {
    const rk = box('t-rank');
    if (rk) {
      const list = IM.pracasRanking(intel, 20);
      rk.innerHTML = Charts.hstackSvg(list.map(p => ({ k: p.i, label: `${p.nome} · ${IM.rodLabel(p.br, p.uf)}${p.uf ? `/${p.uf}` : ''}`, parts: [p.leves, p.pesados, p.moto],
        detail: `VMD ${IM.fmtInt(p.vmd)}` })), { width: width(rk), labelWidth: 280, names: ['Leves', 'Pesados', 'Motos'], colors: [Charts.C.deep, Charts.C.bright, Charts.C.grey],
        format: v => IM.fmtInt(v), unit: 'veíc./dia', clickable: true, title: 'As 20 praças de maior VMD em 2025' });
      onRows(rk, openPraca);
    }
    const se = box('t-serie');
    if (se) {
      const lab = m => { const { y, m: mm } = ym(m); return `${MES[mm - 1]}/${String(y).slice(-2)}`; };
      se.innerHTML = Charts.stackedSvg(s.meses.map((m, k) => ({ label: lab(m), tip: IM.monthLabel(m), parts: [s.l[k] / 1000, s.p[k] / 1000] })),
        { width: width(se), names: ['Leves', 'Pesados'], unit: 'mil veíc./dia', format: v => IM.fmtInt(v), title: 'Tráfego mensal nas praças' });
    }
    const a = intel.trafego && intel.trafego.abcr;
    const ab = box('t-abcr');
    if (ab) {
      const pts = key => a.meses.map((m, k) => ({ x: IM.mesX(m), y: a[key] ? a[key][k] : null }));
      // x = ano + (mês - 1)/12, rotulado como "mmm/aaaa"; 120 meses: pontos menores (a dica continua em cada ponto)
      ab.innerHTML = Charts.linesSvg([{ name: 'Leves', points: pts('leves') }, { name: 'Pesados', points: pts('pesados') }, { name: 'Total', points: pts('total'), dash: true }],
        { width: width(ab), format: v => IM.fmtDec(v, 1), formatX: IM.fmtMesX, r: 2.5, title: 'Índice ABCR' });
    }
    const sz = box('t-saz');
    if (sz) {
      const v = IM.abcrSazonal(a, 'total');
      Charts.bars(sz, MES.map((m, i) => ({ label: m, value: v[i] })), { format: x => IM.fmtDec(x, 1), title: 'Perfil sazonal do Índice ABCR' });
    }
    const ua = document.getElementById('chart-t-uf-a'), um = document.getElementById('chart-t-uf-m');
    if (ua && um) {
      const list = IM.acidentesPorUf(intel, snv);
      const one = (el, key, color, name) => {
        el.innerHTML = Charts.hstackSvg(list.map(u => ({ label: u.uf, parts: [u[key]] })),
          { width: width(el), rh: 24, labelWidth: 48, names: [name], colors: [color], format: x => IM.fmtInt(x), title: name });
      };
      one(ua, 'acidAno', Charts.C.deep, 'Acidentes/ano');
      one(um, 'mortosAno', Charts.C.bright, 'Mortos/ano');
    }
    const tx = box('t-taxa');
    if (tx) {
      tx.innerHTML = Charts.hstackSvg(IM.taxaPorBrUf(intel, snv, { minKm: 10, n: 15 }).map(r => ({ label: `${r.br}/${r.uf}`, parts: [r.taxa],
        detail: `${IM.fmtDec(r.km, 1)} km com VMDa · ${IM.fmtDec(r.acidAno, 1)} acidentes/ano` })),
        { width: width(tx), labelWidth: 120, names: ['Taxa'], colors: [Charts.C.deep], format: x => IM.fmtDec(x, 2), unit: 'por 10⁶ veíc·km', title: 'Taxa de acidentes por BR/UF' });
    }
  }

  function render() {
    const el = document.getElementById('page-trafego');
    const s = IM.pracasSerie(intel);
    const cards = [kpisCard(), rankingCard(), serieCard(s), abcrCards(intel.trafego && intel.trafego.abcr), acidCards()].join('');
    el.innerHTML = `<div class="page__inner">
      <h1 class="page__title">Tráfego nas rodovias federais</h1>
      <p class="page__lead">Contagens medidas nas praças de pedágio (ANTT), volume estimado por modelo para toda a malha (VMDa), acidentes registrados pela PRF e o Índice ABCR. Cada cartão diz a fonte, o período e se o dado é medido ou modelado; passe o mouse nos gráficos para ver os valores.</p>
      ${cards ? `<div class="grid-cards">${cards}</div>` : '<p class="empty">Os dados de tráfego (blocos trafego e antt) não estão neste arquivo.</p>'}</div>`;
    if (cards) draw(s);
  }

  function init(intelData, snvData) {
    if (built) return;
    built = true;
    intel = intelData || {}; snv = snvData;
    render();
  }

  return { init };
})();
