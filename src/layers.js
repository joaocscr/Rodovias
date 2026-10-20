// Camadas de sobreposição do mapa (v3): estaduais, praças, SATs, obras, ferrovias, portos/ETCs, fluxos SIADE, fundo municipal
// e (v3.1) Rotas de Integração Sul-Americana (países vizinhos, linhas das 5 rotas com rótulo direto, hidrovias, cabotagem).
// Cada camada tem pane e renderer canvas próprios e só é construída quando ligada pela 1ª vez. Os panes não recebem eventos:
// o clique em ponto e em concessão estadual é resolvido aqui por distância em pixels (antes de chegar ao canvas das rodovias)
// e o clique em município pelo evento de clique do mapa quando nenhuma rodovia foi atingida.
const Layers = (() => {
  const IM = IntelModel;
  const PANES = { paises: 190, mun: 300, estaduais: 360, estconc: 405, ferrovias: 410, rotas: 415, paisLabels: 418, siade: 430, obras: 440,
    sats: 450, portos: 460, pracas: 470, lsel: 480, rotasLabels: 490 };
  // Lado do rótulo direto de cada rota (o rótulo sai do vértice mais extremo desse lado, para fora do traçado): Rota 1 ao norte,
  // no Caribe; Rotas 2 e 3 a oeste, no Pacífico; Rota 4 a noroeste (Iquique), acima da coluna da legenda da esquerda;
  // Rota 5 ao sul, abaixo do Prata (embaixo, à esquerda e à direita, ficam as legendas do mapa).
  const ROTA_LADO = { r1: 'n', r2: 'w', r3: 'w', r4: 'nw', r5: 's' };
  // Rótulo de país: o dado guarda o polo de inacessibilidade; no mapa, o rótulo vai para o ponto livre mais próximo das linhas
  // das rotas (IntelModel.paisLabelPoint), com a caixa do texto medida no zoom do enquadramento (≈ 11,4 px por grau no zoom 4).
  const PX_GRAU = 11.4, pais_hw = t => (t.length * 4.3 + 6) / PX_GRAU, PAIS_HH = 12 / PX_GRAU;
  const LADO_DIR = { n: ['top', [0, -8]], s: ['bottom', [0, 8]], e: ['right', [8, 0]], w: ['left', [-8, 0]],
    nw: ['left', [-8, -8]], sw: ['left', [-8, 8]], ne: ['right', [8, -8]], se: ['right', [8, 8]] };
  const POINT_KEYS = ['pracas', 'portos', 'sats', 'obras']; // de cima para baixo (prioridade do clique)
  const HIT_PAD = 3, LINE_TOL = 5;
  // Malha estadual no modo Tráfego (v3.1): linhas com VMDa 2025 na rampa e nas classes do modo (quebras da malha federal,
  // mesma espessura); sem dado em cinza fino contínuo (o "sem dado" federal é tracejado).
  const EST_NONE = { color: COLORS.lightGrey, weight: 0.75, opacity: 0.5 };
  let map = null, intel = null, trafBreaks = null;
  let pointCb = () => {}, munCb = () => {}, toggleCb = () => {};
  const built = {}, on = {}, rowsCache = {}, fundoCache = {};
  let fundoKey = null, mun = null, sel = null, selGroup = null, selRenderer = null, snv = null;
  let roadPicked = false, down = null, hoverTip = null, hoverRaf = 0;

  const est = () => (intel && intel.estaduais && intel.estaduais.malha && Array.isArray(intel.estaduais.malha.p) ? intel.estaduais : null);
  const antt = k => (intel && intel.antt && intel.antt[k] && intel.antt[k].linhas ? intel.antt[k] : null);
  const mm = k => (intel && intel.multimodal && Array.isArray(intel.multimodal[k]) ? intel.multimodal[k] : null);
  const fonteAntt = re => IM.fonteRef(intel && intel.antt && intel.antt.fonte, re);
  const fonteMm = re => IM.fonteRef(intel && intel.multimodal && intel.multimodal.fonte, re);
  const finite = v => typeof v === 'number' && Number.isFinite(v);
  const ferrovias = () => (mm('ferrovias') || []).filter(f => f.sit === 'Em Operação' && f.p && f.p.length >= 4);
  const rotas = () => IM.rotasOf(intel);

  // Definição das camadas: rótulo, disponibilidade, nº de feições e fonte (title do checkbox).
  const DEFS = [
    { key: 'estaduais', label: 'Rodovias estaduais', has: () => !!est(), n: () => est().malha.p.length,
      fonte: () => `${IM.fonteRef(est().fonte, /./)} · concessões estaduais em magenta com halo (ARTESP, AGERGS e demais agências)` +
        (IM.estTrafego(intel) ? ` · no modo Tráfego, coloridas pelo VMDa ${IM.estTrafego(intel).ano} (DNIT, modelado)` : '') },
    { key: 'pracas', label: 'Praças de pedágio', has: () => !!antt('pracas'), n: () => rowsOf('pracas').filter(hasLatLng).length,
      fonte: () => `${fonteAntt(/Praças de pedágio/)} · VMD 2025, contagem medida; círculo ∝ √VMD` },
    { key: 'sats', label: 'SATs', has: () => !!antt('sats'), n: () => rowsOf('sats').filter(hasLatLng).length,
      fonte: () => `${fonteAntt(/SAT/)} · contagem medida nos equipamentos de contagem` },
    { key: 'obras', label: 'Obras ANTT', has: () => !!antt('obras'), n: () => rowsOf('obras').filter(hasLatLng).length,
      fonte: () => `${fonteAntt(/Acompanhamento/)} · obras com localização` },
    { key: 'ferrovias', label: 'Ferrovias em operação', has: () => ferrovias().length > 0, n: () => ferrovias().length,
      fonte: () => fonteMm(/BaseFerro|Ferro/) },
    { key: 'portos', label: 'Portos e ETCs', has: () => !!mm('portos'), n: () => shownPortos().length,
      fonte: () => `${fonteMm(/ANTAQ/)} · Porto Organizado, Porto público, TUP e ETC` },
    { key: 'siade', label: 'Fluxos ferroviários de grãos', has: () => !!(mm('siade') && mm('siade').length), n: () => mm('siade').length,
      fonte: () => `${fonteMm(/SIADE/)} · origem → destino, espessura ∝ toneladas` },
    { key: 'rotas', label: 'Rotas de Integração Sul-Americana', has: () => !!rotas(), n: () => rotas().rotas.length,
      fonte: () => `${IM.fonteRef(rotas().fonte, /Apresentação/)} · traçado esquemático; descrição e obras dos relatórios 2023–2025 do MPO` },
  ];
  const def = key => DEFS.find(d => d.key === key) || null;
  const hasLatLng = r => finite(r.lat) && finite(r.lon);

  function rowsOf(key) {
    if (!rowsCache[key]) {
      if (key === 'pracas' || key === 'sats' || key === 'obras') rowsCache[key] = IM.rows(antt(key));
      else if (key === 'portos') rowsCache[key] = (mm('portos') || []).map(p => Object.assign({}, p, { tipoLabel: IM.portoTipo(p.tipo) }));
      else if (key === 'estconc') rowsCache[key] = (est() && est().entidades) || [];
      else if (key === 'rotas') rowsCache[key] = (rotas() && rotas().rotas) || [];
      else rowsCache[key] = [];
    }
    return rowsCache[key];
  }
  function shownPortos() { return rowsOf('portos').map((r, i) => i).filter(i => rowsOf('portos')[i].tipoLabel && hasLatLng(rowsOf('portos')[i])); }

  // Marcador quadrado em canvas (mesmo raio/estilo de um circleMarker).
  const SquareMarker = typeof L !== 'undefined' ? L.CircleMarker.extend({
    _updatePath() {
      const R = this._renderer;
      if (!R._drawing || this._empty()) return;
      const p = this._point, r = Math.max(Math.round(this._radius), 1), ctx = R._ctx;
      ctx.beginPath();
      ctx.rect(p.x - r, p.y - r, 2 * r, 2 * r);
      R._fillStroke(ctx, this);
    },
  }) : null;

  const renderer = key => L.canvas({ pane: 'l-' + key, padding: 0.5 });

  // ---------- Construção ----------
  function buildPoints(key) {
    const st = LAYER_STYLES[key], rend = renderer(key), group = L.layerGroup(), rows = rowsOf(key), items = [];
    let idx = rows.map((r, i) => i).filter(i => hasLatLng(rows[i]));
    if (key === 'portos') idx = shownPortos();
    let vmax = 0;
    if (key === 'pracas') {
      for (const i of idx) if (finite(rows[i].vmd) && rows[i].vmd > vmax) vmax = rows[i].vmd;
      // maiores embaixo, menores (e sem VMD) por cima
      idx.sort((a, b) => (rows[b].vmd || 0) - (rows[a].vmd || 0));
    }
    for (const i of idx) {
      const r = rows[i], ll = [r.lat, r.lon];
      let m, rad;
      if (key === 'pracas') {
        const semDado = !(finite(r.vmd) && r.vmd > 0);
        rad = IM.pointRadius(r.vmd, vmax, st.rmin, st.rmax);
        m = L.circleMarker(ll, { renderer: rend, interactive: false, radius: rad, fillColor: st.fillColor, color: st.color, weight: st.weight,
          fillOpacity: semDado ? st.semDadoOpacity : st.fillOpacity, opacity: semDado ? st.semDadoOpacity : 1 });
      } else if (key === 'sats') {
        rad = st.radius;
        m = L.circleMarker(ll, { renderer: rend, interactive: false, radius: rad, fill: false, color: st.color, weight: st.weight, opacity: 1 });
      } else if (key === 'obras') {
        rad = st.radius;
        m = L.circleMarker(ll, { renderer: rend, interactive: false, radius: rad, stroke: false, fillColor: st.fillColor, fillOpacity: st.fillOpacity });
      } else {
        rad = st.radius;
        const Ctor = PORTO_QUADRADO.has(r.tipoLabel) ? SquareMarker : L.CircleMarker;
        m = new Ctor(ll, { renderer: rend, interactive: false, radius: rad, fillColor: st.fillColor, fillOpacity: st.fillOpacity, color: st.color, weight: st.weight });
      }
      group.addLayer(m);
      items.push({ i, lat: r.lat, lng: r.lon, r: rad });
    }
    return { group, items, n: items.length };
  }

  function polyOpts(rend, st, extra = {}) {
    return Object.assign({ renderer: rend, interactive: false, color: st.color, weight: st.weight, opacity: st.opacity,
      dashArray: st.dash || null, lineCap: st.dash ? 'butt' : 'round', lineJoin: 'round', smoothFactor: 1 }, extra);
  }

  function buildLines(key) {
    const group = L.layerGroup();
    if (key === 'ferrovias') {
      const lines = ferrovias().map(f => IM.decodeLine(f.p));
      if (lines.length) group.addLayer(L.polyline(lines, polyOpts(renderer(key), LAYER_STYLES.ferrovias)));
      return { group, items: [], n: lines.length };
    }
    if (key === 'siade') {
      const st = LAYER_STYLES.siade, rend = renderer(key);
      const fl = (mm('siade') || []).filter(s => s.lo && s.ld && finite(s.t)).sort((a, b) => b.t - a.t);
      const tmax = fl.length ? fl[0].t : 0;
      for (const s of fl) {
        group.addLayer(L.polyline([[s.lo[1], s.lo[0]], [s.ld[1], s.ld[0]]], polyOpts(rend, st, { weight: IM.lineWeight(s.t, tmax, st.wmin, st.wmax) })));
      }
      return { group, items: [], n: fl.length };
    }
    // estaduais: malha em verde fino (pane abaixo das rodovias federais); concessões estaduais em magenta com halo, acima delas
    // (entEst -> feições da malha; entFis -> físicos do SNV; entGeo -> traçado próprio), clicáveis.
    const e = est(), rend = renderer(key);
    const dec = e.malha.p.map(p => IM.decodeLine(p)), base = dec.filter(l => l.length >= 2);
    const malha = base.length ? L.polyline(base, polyOpts(rend, LAYER_STYLES.estaduais)) : null;
    if (malha) group.addLayer(malha);
    const st = LAYER_STYLES.estConc, rc = renderer('estconc');
    const conc = [], all = [];
    IM.estConcLines(e, snv).forEach((lines, k) => {
      for (const ll of lines) { conc.push({ k, ll, bbox: IM.ringsBBox([ll]) }); all.push(ll); }
    });
    if (all.length) {
      group.addLayer(L.polyline(all, polyOpts(rc, { color: st.halo, weight: st.weight + st.haloExtra, opacity: st.haloOpacity })));
      group.addLayer(L.polyline(all, polyOpts(rc, st)));
    }
    return { group, items: [], n: e.malha.p.length, conc, nConc: new Set(conc.map(c => c.k)).size, rend, dec, malha, traf: null };
  }

  // ---------- Malha estadual colorida pelo VMDa 2025 (modo Tráfego) ----------
  // Uma polyline por classe (sem dado embaixo, classe maior por cima), montada para as quebras atuais.
  function buildEstTraf(b, breaks) {
    const et = IM.estTrafego(intel), byClass = new Map();
    b.dec.forEach((ll, i) => {
      if (ll.length < 2) return;
      const c = IM.classOf(et.t[i], breaks);
      if (!byClass.has(c)) byClass.set(c, []);
      byClass.get(c).push(ll);
    });
    const group = L.layerGroup(), lines = [];
    let min = Infinity, max = -Infinity, n = 0, semDado = 0;
    et.t.forEach(v => { if (v != null) { n++; if (v < min) min = v; if (v > max) max = v; } else semDado++; });
    for (const c of [...byClass.keys()].sort((x, y) => x - y)) {
      const s = c < 0 ? EST_NONE : quantStyle(c, 'trafego');
      const pl = L.polyline(byClass.get(c), polyOpts(b.rend, { color: s.color, weight: s.weight, opacity: s.opacity }));
      group.addLayer(pl);
      lines.push({ pl, w: s.weight });
    }
    const porClasse = Object.fromEntries([...byClass.entries()].map(([c, ls]) => [c, ls.length]));
    return { group, lines, breaks, ano: et.ano, n, semDado, min: n ? min : null, max: n ? max : null, porClasse };
  }

  const estTrafWanted = () => !!(trafBreaks && built.estaduais && built.estaduais.dec && IM.estTrafego(intel));

  // Espessura das classes acompanha o zoom, como a malha federal (zoomFactor).
  function estTrafWeights() {
    const t = built.estaduais && built.estaduais.traf;
    if (!t || !map.hasLayer(t.group)) return;
    const f = zoomFactor(map.getZoom());
    for (const x of t.lines) x.pl.setStyle({ weight: x.w * f });
  }

  // Troca a malha verde pelas classes do Tráfego (ou volta ao verde), conforme o modo atual e a camada.
  function applyEstMode() {
    const b = built.estaduais;
    if (!b || !b.dec) return;
    if (estTrafWanted()) {
      if (!b.traf || b.traf.breaks !== trafBreaks) {
        if (b.traf) b.group.removeLayer(b.traf.group);
        b.traf = buildEstTraf(b, trafBreaks);
      }
      if (b.malha) b.group.removeLayer(b.malha);
      if (!b.group.hasLayer(b.traf.group)) b.group.addLayer(b.traf.group);
      estTrafWeights();
    } else {
      if (b.traf) b.group.removeLayer(b.traf.group);
      if (b.malha && !b.group.hasLayer(b.malha)) b.group.addLayer(b.malha);
    }
  }

  // Quebras do modo Tráfego (as da malha federal) ou null fora dele.
  function setTrafego(breaks) {
    trafBreaks = Array.isArray(breaks) ? breaks : null;
    applyEstMode();
  }

  // Rotas: países vizinhos (pane abaixo das UFs; rótulo acima das linhas das rotas, com halo claro); as 5 rotas sobre um contorno claro; hidrovias, cabotagem e
  // trechos em pavimentação e em estudos por cima; rótulo direto "Rota N · Nome" (texto na cor de texto, amostra na cor da rota).
  function buildRotas() {
    const R = rotas(), group = L.layerGroup(), ls = IM.rotaLinhas(R), rend = renderer('rotas');
    const P = ROTAS_PAIS, rp = renderer('paises'), todasLinhas = ls.map(l => l.ll);
    for (const p of R.paises || []) {
      const rings = IM.paisAneis(p);
      if (!rings.length) continue;
      group.addLayer(L.polygon(rings.map(r => [r]), { renderer: rp, interactive: false, color: P.color, weight: P.weight, opacity: P.opacity,
        fillColor: P.fillColor, fillOpacity: P.fillOpacity, smoothFactor: 1 }));
      if (Array.isArray(p.label)) {
        const t = document.createElement('span');
        t.textContent = IM.paisLabel(p);
        const at = IM.paisLabelPoint(p, todasLinhas, { hw: pais_hw(t.textContent), hh: PAIS_HH });
        group.addLayer(L.tooltip({ permanent: true, direction: 'center', className: 'uf-label pais-label', pane: 'l-paisLabels', interactive: false })
          .setLatLng(at).setContent(t));
      }
    }
    const lines = (tipo, rota) => ls.filter(l => l.tipo === tipo && (rota === undefined || l.rota === rota)).map(l => l.ll);
    const extra = tipo => {
      const st = ROTAS_EXTRA[tipo], ll = lines(tipo);
      if (ll.length) group.addLayer(L.polyline(ll, polyOpts(rend, { color: st.color, weight: st.weight, opacity: 1, dash: st.dash }, st.cap ? { lineCap: st.cap } : {})));
    };
    const W = ROTA_LINHA, todas = lines('rota');
    if (todas.length) group.addLayer(L.polyline(todas, polyOpts(rend, { color: W.casing, weight: W.weight + W.casingExtra, opacity: W.casingOpacity })));
    for (const r of R.rotas) {
      const ll = lines('rota', r.id);
      if (ll.length && ROTAS[r.id]) group.addLayer(L.polyline(ll, polyOpts(rend, { color: ROTAS[r.id], weight: W.weight, opacity: 1 })));
    }
    // Hidrovias por cima: no mapa do MPO o trecho fluvial também tem a linha da rota, que as esconderia.
    extra('hidrovia');
    extra('cabotagem');
    extra('pavimentacao');
    extra('estudo');
    // Rótulos diretos, clicáveis (abrem o cartão da rota).
    R.rotas.forEach((r, i) => {
      const lado = ROTA_LADO[r.id] || 'w', at = IM.rotaLabelAnchor(lines('rota', r.id), lado);
      if (!at) return;
      const el = document.createElement('span');
      el.dataset.rota = String(i);
      const sw = document.createElement('span');
      sw.className = 'rota-label__sw';
      sw.style.background = ROTAS[r.id] || COLORS.lightGrey;
      el.append(sw, document.createTextNode(IM.rotaTitulo(r)));
      const [direction, offset] = LADO_DIR[lado];
      group.addLayer(L.tooltip({ permanent: true, direction, offset, className: 'rota-label', pane: 'l-rotasLabels', interactive: false })
        .setLatLng(at).setContent(el));
    });
    // Clique e hover: qualquer linha atribuída a uma rota (rota, hidrovia, cabotagem, pavimentação, estudo) abre a rota.
    const idx = new Map(R.rotas.map((r, i) => [r.id, i]));
    const hits = ls.filter(l => idx.has(l.rota)).map(l => ({ k: idx.get(l.rota), ll: l.ll, bbox: IM.ringsBBox([l.ll]) }));
    return { group, items: [], n: ls.length, hits };
  }

  function build(key) { return key === 'rotas' ? buildRotas() : POINT_KEYS.includes(key) ? buildPoints(key) : buildLines(key); }

  // ---------- Ligar / desligar ----------
  function toggle(key, value) {
    const d = def(key);
    if (!d || !d.has()) return 0;
    const want = value === undefined ? !on[key] : !!value;
    const t0 = performance.now();
    const was = !!on[key];
    if (want) {
      if (!built[key]) built[key] = build(key);
      if (!map.hasLayer(built[key].group)) built[key].group.addTo(map);
    } else if (built[key]) built[key].group.remove();
    on[key] = want;
    if (key === 'estaduais') applyEstMode();
    if (!want) hideTip();
    if (!want && sel && sel.key === key) clearSelection();
    const ms = performance.now() - t0;
    if (was !== want) toggleCb(key, want);
    return ms;
  }

  // ---------- Fundo municipal ----------
  function fundoAvailable() { return !!(intel && intel.municipios && intel.municipios.topo && intel.agro && intel.agro.ids); }

  function buildMun() {
    const st = FUNDO_BORDER, rend = renderer('mun'), group = L.layerGroup();
    const kOf = new Map(intel.agro.ids.map((id, k) => [String(id), k]));
    const list = [];
    for (const g of IM.decodeTopo(intel.municipios.topo, 'mun')) {
      if (!g.rings.length) continue;
      const poly = L.polygon(g.rings, { renderer: rend, interactive: false, color: st.color, weight: st.weight, opacity: st.opacity,
        fillColor: COLORS.deepBlue, fillOpacity: 0, smoothFactor: 1 });
      group.addLayer(poly);
      const id = String(g.id);
      list.push({ id, k: kOf.has(id) ? kOf.get(id) : -1, rings: g.rings, bbox: IM.ringsBBox(g.rings), poly });
    }
    mun = { group, list, byId: new Map(list.map(m => [m.id, m])) };
  }

  function fundoQ(key) {
    if (!fundoCache[key]) {
      const values = IM.fundoValues(intel, key) || [];
      fundoCache[key] = Object.assign({ values }, IM.fundoClasses(values, FUNDO_OPACITY.length));
    }
    return fundoCache[key];
  }

  function setFundo(key) {
    const t0 = performance.now();
    const k = key && IM.FUNDOS.some(f => f.key === key) && fundoAvailable() ? key : null;
    if (!k) {
      if (mun) mun.group.remove();
      fundoKey = null;
      if (sel && sel.key === 'mun') clearSelection();
      return performance.now() - t0;
    }
    if (!mun) buildMun();
    const q = fundoQ(k);
    for (const m of mun.list) {
      const c = m.k >= 0 ? q.cls[m.k] : -1;
      m.poly.setStyle({ fillOpacity: c >= 0 ? FUNDO_OPACITY[c] : 0 });
    }
    if (!map.hasLayer(mun.group)) mun.group.addTo(map);
    fundoKey = k;
    return performance.now() - t0;
  }

  function fundoInfo() {
    if (!fundoKey) return null;
    const f = IM.FUNDOS.find(x => x.key === fundoKey), q = fundoQ(fundoKey);
    const a = intel.agro, sigilo = fundoKey === 'armazenagem' && a.armazenagem && a.armazenagem.sigilo
      ? a.armazenagem.sigilo.reduce((s, x) => s + (x ? 1 : 0), 0) : 0;
    return { key: fundoKey, label: f.label, unidade: 't', breaks: q.breaks, min: q.min, max: q.max, fonte: IM.fundoFonte(intel, fundoKey),
      tipo: 'medido', sigilo, ano: a.ano, periodo: a.armazenagem ? a.armazenagem.periodo : null };
  }

  function munAt(lat, lng) {
    if (!mun) return null;
    for (const m of mun.list) {
      const [s, w, n, e] = m.bbox;
      if (lat < s || lat > n || lng < w || lng > e) continue;
      if (IM.pointInRings(lat, lng, m.rings)) return m.id;
    }
    return null;
  }

  // ---------- Seleção (anel / contorno) ----------
  function clearSelection() {
    if (selGroup) selGroup.clearLayers();
    sel = null;
  }

  function select(key, i) {
    clearSelection();
    const st = key === 'mun' ? LAYER_STYLES.selecaoMun : LAYER_STYLES.selecao;
    const opts = (color, weight) => ({ renderer: selRenderer, interactive: false, fill: false, color, weight, opacity: st.opacity });
    if (key === 'mun') {
      const m = mun && mun.byId.get(String(i));
      if (!m) return;
      L.polygon(m.rings, opts(st.halo, st.haloWeight)).addTo(selGroup);
      L.polygon(m.rings, opts(st.color, st.weight)).addTo(selGroup);
    } else if (key === 'estconc' || key === 'rotas') {
      // decodificado uma vez (cache em IntelModel)
      const lines = key === 'estconc' ? IM.estConcLines(est(), snv)[i] || []
        : (rowsOf('rotas')[i] ? IM.rotaLinhas(rotas()).filter(l => l.rota === rowsOf('rotas')[i].id).map(l => l.ll) : []);
      if (!lines.length) return;
      // Rota: a própria cor, mais larga, sobre o halo claro (o azul de seleção a confundiria com a malha federal).
      const c = key === 'rotas' ? ROTAS[rowsOf('rotas')[i].id] || st.color : st.color;
      L.polyline(lines, opts(st.halo, st.haloWeight + (key === 'rotas' ? 3 : 0))).addTo(selGroup);
      L.polyline(lines, opts(c, key === 'rotas' ? ROTA_LINHA.weight + 2 : st.weight)).addTo(selGroup);
    } else {
      const r = rowsOf(key)[i];
      if (!r || !hasLatLng(r)) return;
      const it = built[key] && built[key].items.find(x => x.i === i);
      const radius = (it ? it.r : (LAYER_STYLES[key].radius || 4)) + 4;
      L.circleMarker([r.lat, r.lon], Object.assign(opts(st.halo, st.haloWeight), { radius })).addTo(selGroup);
      L.circleMarker([r.lat, r.lon], Object.assign(opts(st.color, st.weight), { radius })).addTo(selGroup);
    }
    sel = { key, i };
  }

  // ---------- Clique e hover ----------
  function pointAt(clientX, clientY) {
    const rect = map.getContainer().getBoundingClientRect();
    const x = clientX - rect.left, y = clientY - rect.top;
    for (const key of POINT_KEYS) {
      if (!on[key] || !built[key]) continue;
      let best = null, bd = Infinity;
      const items = built[key].items;
      for (let k = items.length - 1; k >= 0; k--) {
        const it = items[k], p = map.latLngToContainerPoint([it.lat, it.lng]);
        const d = Math.hypot(p.x - x, p.y - y);
        if (d <= it.r + HIT_PAD && d < bd) { bd = d; best = it; }
      }
      if (best) return { key, i: best.i };
    }
    return null;
  }

  // Linha sob o cursor (concessão estadual, rota): candidatas pela caixa (com tolerância em graus), depois distância ao segmento em pixels.
  function lineAt(list, key, clientX, clientY) {
    if (!list || !list.length) return null;
    const rect = map.getContainer().getBoundingClientRect();
    const x = clientX - rect.left, y = clientY - rect.top;
    const ll = map.containerPointToLatLng([x, y]), ll2 = map.containerPointToLatLng([x + LINE_TOL, y + LINE_TOL]);
    const tLat = Math.abs(ll2.lat - ll.lat), tLng = Math.abs(ll2.lng - ll.lng);
    let best = null, bd = Infinity;
    for (const c of list) {
      const [s, w, n, e] = c.bbox;
      if (ll.lat < s - tLat || ll.lat > n + tLat || ll.lng < w - tLng || ll.lng > e + tLng) continue;
      let prev = map.latLngToContainerPoint(c.ll[0]);
      for (let k = 1; k < c.ll.length; k++) {
        const cur = map.latLngToContainerPoint(c.ll[k]);
        const d = IM.distToSegment(x, y, prev.x, prev.y, cur.x, cur.y);
        if (d < bd) { bd = d; best = c; }
        prev = cur;
      }
    }
    return best && bd <= LINE_TOL ? { key, i: best.k, latlng: ll } : null;
  }
  const estConcAt = (cx, cy) => (on.estaduais && built.estaduais ? lineAt(built.estaduais.conc, 'estconc', cx, cy) : null);
  const rotaAt = (cx, cy) => (on.rotas && built.rotas ? lineAt(built.rotas.hits, 'rotas', cx, cy) : null);

  // Ordem do clique = ordem de desenho, de cima para baixo: pontos, rotas, concessões estaduais.
  const hitAt = (cx, cy) => pointAt(cx, cy) || rotaAt(cx, cy) || estConcAt(cx, cy);

  // Rótulo direto de rota sob o clique (o rótulo é um elemento HTML acima do mapa).
  function labelHit(target) {
    const lab = target && target.closest ? target.closest('.rota-label') : null;
    const el = lab && lab.querySelector('[data-rota]');
    return el && on.rotas ? { key: 'rotas', i: Number(el.dataset.rota) } : null;
  }

  function openPoint(key, i) {
    if (key === 'mun') { select('mun', i); munCb(String(i)); return; }
    select(key, i);
    pointCb(key, i);
  }

  function labelOf(key, i) {
    const r = rowsOf(key)[i];
    if (!r) return '';
    if (key === 'pracas') return `${r.nome} · ${IM.fmtVmd(r.vmd)}`;
    if (key === 'sats') return `SAT ${r.id} · ${IM.fmtVmd(r.vmd)}`;
    if (key === 'obras') return r.descricao || r.tipo || 'Obra';
    if (key === 'portos') return `${r.nome} · ${r.tipoLabel}`;
    if (key === 'estconc') return `${r.nome} · concessão estadual ${r.uf || ''}`.trim();
    if (key === 'rotas') return `${IM.rotaTitulo(r)} · traçado esquemático`;
    return '';
  }

  function hideTip() {
    if (hoverTip && map.hasLayer(hoverTip)) hoverTip.remove();
    if (map) map.getContainer().classList.remove('layers-hover');
  }

  function onMove(e) {
    if (hoverRaf) return;
    const cx = e.clientX, cy = e.clientY;
    hoverRaf = requestAnimationFrame(() => {
      hoverRaf = 0;
      if (!POINT_KEYS.some(k => on[k]) && !on.estaduais && !on.rotas) { hideTip(); return; }
      const hit = hitAt(cx, cy);
      if (!hit) { hideTip(); return; }
      const r = rowsOf(hit.key)[hit.i];
      map.getContainer().classList.add('layers-hover');
      if (!hoverTip) hoverTip = L.tooltip({ direction: 'top', offset: [0, -8], className: 'pt-tip', interactive: false });
      const text = document.createElement('span');
      text.textContent = labelOf(hit.key, hit.i);
      hoverTip.setLatLng(hit.latlng || [r.lat, r.lon]).setContent(text);
      if (!map.hasLayer(hoverTip)) hoverTip.addTo(map);
    });
  }

  function init(leafletMap, intelData, snvData = null) {
    map = leafletMap; intel = intelData || null; snv = snvData;
    for (const [name, z] of Object.entries(PANES)) {
      const p = map.createPane('l-' + name);
      p.style.zIndex = z;
      p.style.pointerEvents = 'none';
    }
    selRenderer = L.canvas({ pane: 'l-lsel', padding: 0.5 });
    selGroup = L.layerGroup().addTo(map);
    const el = map.getContainer();
    el.addEventListener('mousedown', e => { down = [e.clientX, e.clientY]; }, true);
    el.addEventListener('click', e => {
      if (down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
      const hit = labelHit(e.target) || hitAt(e.clientX, e.clientY);
      if (!hit) return;
      e.stopPropagation();
      hideTip();
      openPoint(hit.key, hit.i);
    }, true);
    el.addEventListener('mousemove', onMove, true);
    el.addEventListener('mouseleave', hideTip);
    map.on('zoomend', estTrafWeights);
    map.on('click', e => {
      if (roadPicked) { roadPicked = false; return; }
      if (!fundoKey) return;
      const id = munAt(e.latlng.lat, e.latlng.lng);
      if (id) openPoint('mun', id);
    });
  }

  return {
    init, toggle, setFundo, fundoInfo, fundoAvailable, munAt, select, clearSelection, rowsOf, setTrafego, EST_NONE,
    // Malha estadual colorida pelo VMDa no modo Tráfego (camada ligada): {ano, n, semDado, min, max, porClasse} (porClasse:
    // nº de linhas desenhadas por classe, -1 = sem dado); senão null.
    estTrafego() {
      const b = built.estaduais;
      if (!on.estaduais || !estTrafWanted() || !b.traf) return null;
      const t = b.traf;
      return { ano: t.ano, n: t.n, semDado: t.semDado, min: t.min, max: t.max, porClasse: Object.assign({}, t.porClasse) };
    },
    // Avisa (key, ligada) quando uma camada liga ou desliga, venha a troca do painel, da ficha ou da aba Tráfego.
    onToggle(cb) { toggleCb = cb; },
    available() { return DEFS.filter(d => d.has()).map(d => ({ key: d.key, label: d.label, title: d.fonte(), n: d.n() })); },
    isOn(key) { return !!on[key]; },
    fundo() { return fundoKey; },
    count(key) {
      if (key === 'mun') return mun ? mun.list.length : 0;
      if (key === 'estconc') return built.estaduais ? built.estaduais.nConc : 0;
      if (key === 'rotasLabels') return built.rotas && on.rotas ? document.querySelectorAll('.leaflet-tooltip.rota-label').length : 0;
      return built[key] ? built[key].n : 0;
    },
    items(key) { return built[key] ? built[key].items.map(x => x.i) : []; },
    open: openPoint,
    // Clique numa rodovia: o clique do mapa que vem em seguida não abre município.
    notePick() { roadPicked = true; setTimeout(() => { roadPicked = false; }, 0); },
    onPoint(cb) { pointCb = cb; },
    onMun(cb) { munCb = cb; },
    selected() { return sel; },
    // Para teste: cores (maiúsculas) de traço e preenchimento das feições desenhadas por camada ligada (inclui a seleção).
    colorsUsed() {
      const out = {};
      const add = (k, c) => { if (c) (out[k] = out[k] || new Set()).add(String(c).toUpperCase()); };
      const walk = (k, g) => g.eachLayer(l => {
        if (l.eachLayer) { walk(k, l); return; }
        const o = l.options || {};
        if (o.stroke !== false) add(k, o.color);
        if (o.fill !== false && (o.fillColor || l instanceof L.Polygon || l instanceof L.CircleMarker)) add(k, o.fillColor || o.color);
      });
      for (const [k, b] of Object.entries(built)) if (on[k] && b) walk(k, b.group);
      if (mun && map.hasLayer(mun.group)) walk('mun', mun.group);
      if (selGroup) walk('selecao', selGroup);
      return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, [...v]]));
    },
  };
})();
