// Camadas de sobreposição do mapa (v3): estaduais, praças, SATs, obras, ferrovias, portos/ETCs, fluxos SIADE e fundo municipal.
// Cada camada tem pane e renderer canvas próprios e só é construída quando ligada pela 1ª vez. Os panes não recebem eventos:
// o clique em ponto e em concessão estadual é resolvido aqui por distância em pixels (antes de chegar ao canvas das rodovias)
// e o clique em município pelo evento de clique do mapa quando nenhuma rodovia foi atingida.
const Layers = (() => {
  const IM = IntelModel;
  const PANES = { mun: 300, estaduais: 360, estconc: 405, ferrovias: 410, siade: 430, obras: 440, sats: 450, portos: 460, pracas: 470, lsel: 480 };
  const POINT_KEYS = ['pracas', 'portos', 'sats', 'obras']; // de cima para baixo (prioridade do clique)
  const HIT_PAD = 3, LINE_TOL = 5;
  let map = null, intel = null;
  let pointCb = () => {}, munCb = () => {};
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

  // Definição das camadas: rótulo, disponibilidade, nº de feições e fonte (title do checkbox).
  const DEFS = [
    { key: 'estaduais', label: 'Rodovias estaduais', has: () => !!est(), n: () => est().malha.p.length,
      fonte: () => `${IM.fonteRef(est().fonte, /./)} · concessões estaduais em azul com halo (ARTESP, AGERGS e demais agências)` },
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
  ];
  const def = key => DEFS.find(d => d.key === key) || null;
  const hasLatLng = r => finite(r.lat) && finite(r.lon);

  function rowsOf(key) {
    if (!rowsCache[key]) {
      if (key === 'pracas' || key === 'sats' || key === 'obras') rowsCache[key] = IM.rows(antt(key));
      else if (key === 'portos') rowsCache[key] = (mm('portos') || []).map(p => Object.assign({}, p, { tipoLabel: IM.portoTipo(p.tipo) }));
      else if (key === 'estconc') rowsCache[key] = (est() && est().entidades) || [];
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
    // estaduais: malha em cinza (pane abaixo das rodovias federais); concessões estaduais em Bright Blue com halo, acima delas
    // (entEst -> feições da malha; entFis -> físicos do SNV; entGeo -> traçado próprio), clicáveis.
    const e = est();
    const base = e.malha.p.map(p => IM.decodeLine(p)).filter(l => l.length >= 2);
    if (base.length) group.addLayer(L.polyline(base, polyOpts(renderer(key), LAYER_STYLES.estaduais)));
    const st = LAYER_STYLES.estConc, rc = renderer('estconc');
    const conc = [], all = [];
    IM.estConcLines(e, snv).forEach((lines, k) => {
      for (const ll of lines) { conc.push({ k, ll, bbox: IM.ringsBBox([ll]) }); all.push(ll); }
    });
    if (all.length) {
      group.addLayer(L.polyline(all, polyOpts(rc, { color: st.halo, weight: st.weight + st.haloExtra, opacity: st.haloOpacity })));
      group.addLayer(L.polyline(all, polyOpts(rc, st)));
    }
    return { group, items: [], n: e.malha.p.length, conc, nConc: new Set(conc.map(c => c.k)).size };
  }

  function build(key) { return POINT_KEYS.includes(key) ? buildPoints(key) : buildLines(key); }

  // ---------- Ligar / desligar ----------
  function toggle(key, value) {
    const d = def(key);
    if (!d || !d.has()) return 0;
    const want = value === undefined ? !on[key] : !!value;
    const t0 = performance.now();
    if (want) {
      if (!built[key]) built[key] = build(key);
      if (!map.hasLayer(built[key].group)) built[key].group.addTo(map);
    } else if (built[key]) built[key].group.remove();
    on[key] = want;
    if (!want) hideTip();
    return performance.now() - t0;
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
    } else if (key === 'estconc') {
      const lines = IM.estConcLines(est(), snv)[i] || []; // decodificado uma vez (cache em IntelModel)
      if (!lines.length) return;
      L.polyline(lines, opts(st.halo, st.haloWeight)).addTo(selGroup);
      L.polyline(lines, opts(st.color, st.weight)).addTo(selGroup);
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

  // Concessão estadual sob o cursor: candidatas pela caixa (com tolerância em graus), depois distância ao segmento em pixels.
  function estConcAt(clientX, clientY) {
    if (!on.estaduais || !built.estaduais || !built.estaduais.conc.length) return null;
    const rect = map.getContainer().getBoundingClientRect();
    const x = clientX - rect.left, y = clientY - rect.top;
    const ll = map.containerPointToLatLng([x, y]), ll2 = map.containerPointToLatLng([x + LINE_TOL, y + LINE_TOL]);
    const tLat = Math.abs(ll2.lat - ll.lat), tLng = Math.abs(ll2.lng - ll.lng);
    let best = null, bd = Infinity;
    for (const c of built.estaduais.conc) {
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
    return best && bd <= LINE_TOL ? { key: 'estconc', i: best.k, latlng: ll } : null;
  }

  const hitAt = (cx, cy) => pointAt(cx, cy) || estConcAt(cx, cy);

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
      if (!POINT_KEYS.some(k => on[k]) && !on.estaduais) { hideTip(); return; }
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
      const hit = hitAt(e.clientX, e.clientY);
      if (!hit) return;
      e.stopPropagation();
      hideTip();
      openPoint(hit.key, hit.i);
    }, true);
    el.addEventListener('mousemove', onMove, true);
    el.addEventListener('mouseleave', hideTip);
    map.on('click', e => {
      if (roadPicked) { roadPicked = false; return; }
      if (!fundoKey) return;
      const id = munAt(e.latlng.lat, e.latlng.lng);
      if (id) openPoint('mun', id);
    });
  }

  return {
    init, toggle, setFundo, fundoInfo, fundoAvailable, munAt, select, clearSelection, rowsOf,
    available() { return DEFS.filter(d => d.has()).map(d => ({ key: d.key, label: d.label, title: d.fonte(), n: d.n() })); },
    isOn(key) { return !!on[key]; },
    fundo() { return fundoKey; },
    count(key) {
      if (key === 'mun') return mun ? mun.list.length : 0;
      if (key === 'estconc') return built.estaduais ? built.estaduais.nConc : 0;
      return built[key] ? built[key].n : 0;
    },
    items(key) { return built[key] ? built[key].items.map(x => x.i) : []; },
    open: openPoint,
    // Clique numa rodovia: o clique do mapa que vem em seguida não abre município.
    notePick() { roadPicked = true; setTimeout(() => { roadPicked = false; }, 0); },
    onPoint(cb) { pointCb = cb; },
    onMun(cb) { munCb = cb; },
    selected() { return sel; },
  };
})();
