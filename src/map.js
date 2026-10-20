// Camada de mapa: UFs, rótulos, trechos físicos, hover, seleção e modos de cor (inclusive quantitativos). Usa Leaflet em canvas.
const MapView = (() => {
  const BRASIL = [[-34.5, -74.5], [5.8, -32]];
  const DIM = 0.2;
  let map, snv, lines, halos, order, visible, pickCb = () => {}, hlGroup, hlRenderer, hlWanted = null, hlIds = null, ufLayer;
  let mode = 'fisica', states = null, conc = null, haloRenderer, intel = null;
  const quant = {};

  function decode(p) {
    const out = [];
    let x = 0, y = 0;
    for (let i = 0; i < p.length; i += 2) {
      x += p[i]; y += p[i + 1];
      out.push([y / 1e5, x / 1e5]);
    }
    return out;
  }

  function situacaoOf(j) { return snv.dict.situacao[snv.trechos[snv.fis[j].r[0]][Model.FIELD.situacao]]; }
  function admOf(j) { return snv.dict.adm[snv.trechos[snv.fis[j].r[0]][Model.FIELD.adm]]; }

  const isQuant = m => QUANT_MODES.includes(m);

  // Classes por quantil de um modo quantitativo, calculadas uma vez: {values, breaks, cls, min, max}.
  function classes(m) {
    if (!isQuant(m)) return null;
    if (!quant[m]) {
      const values = IntelModel.metricArray(intel, snv, m);
      const breaks = IntelModel.quantileBreaks(values, QUANT_STYLES.length);
      const cls = new Int8Array(values.length);
      let min = Infinity, max = -Infinity;
      for (let j = 0; j < values.length; j++) {
        cls[j] = IntelModel.classOf(values[j], breaks);
        if (cls[j] >= 0) { min = Math.min(min, values[j]); max = Math.max(max, values[j]); }
      }
      quant[m] = { values, breaks, cls, min: min === Infinity ? null : min, max: max === -Infinity ? null : max };
    }
    return quant[m];
  }

  // Estilo base do físico no modo atual: {color, weight, dash, opacity, z, halo?}
  function spec(j) {
    if (mode === 'concessoes' && states) return CONC_STYLES[states[j]] || CONC_STYLES.nenhum;
    if (isQuant(mode)) return quantStyle(classes(mode).cls[j], mode);
    const s = lineStyle(situacaoOf(j));
    return admOf(j) === CONCESSAO ? Object.assign({ halo: HALO }, s) : s;
  }

  function styleFor(j, extra = {}) {
    const s = spec(j);
    const f = zoomFactor(map.getZoom());
    const dim = hlIds && !hlIds.has(j) ? DIM : 1;
    return {
      color: s.color, weight: s.weight * f + (extra.hover ? 2 : 0), opacity: s.opacity * dim,
      dashArray: s.dash, lineCap: s.dash ? 'butt' : 'round', lineJoin: 'round',
    };
  }

  function haloStyle(j) {
    const s = spec(j);
    const dim = hlIds && !hlIds.has(j) ? DIM : 1;
    return { color: s.halo.color, opacity: s.halo.opacity * dim, weight: (s.weight + s.halo.extra) * zoomFactor(map.getZoom()), lineCap: 'round' };
  }

  function haloOf(j) {
    if (!spec(j).halo) return null;
    if (!halos[j]) halos[j] = L.polyline(lines[j].getLatLngs(), Object.assign({ renderer: haloRenderer, interactive: false }, haloStyle(j)));
    return halos[j];
  }

  function computeOrder() {
    const z = snv.fis.map((_, j) => spec(j).z);
    order = snv.fis.map((_, j) => j).sort((a, b) => z[a] - z[b] || a - b);
  }

  // Realce efetivo = pedidos que estão visíveis; sem nenhum visível, nada é esmaecido.
  function applyHighlight() {
    const eff = hlWanted ? [...hlWanted].filter(j => visible[j]) : [];
    hlIds = eff.length ? new Set(eff) : null;
    lines.forEach((l, j) => l.setStyle(styleFor(j)));
    halos.forEach((h, j) => { if (h && spec(j).halo) h.setStyle(haloStyle(j)); });
    hlGroup.clearLayers();
    if (!hlIds) return;
    const w = 10 * zoomFactor(map.getZoom());
    for (const j of hlIds) {
      L.polyline(lines[j].getLatLngs(), { renderer: hlRenderer, interactive: false, color: COLORS.brightBlue, opacity: 0.3, weight: w, lineCap: 'round' }).addTo(hlGroup);
    }
  }

  function buildControls(el) {
    if (!el) return;
    const btn = (label, title, fn, svg) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'icon-btn map-btn'; b.title = title; b.setAttribute('aria-label', title);
      b.innerHTML = svg || label;
      b.addEventListener('click', fn);
      el.appendChild(b);
    };
    const icon = d => `<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    btn('+', 'Aproximar', () => map.zoomIn(), icon('M12 5v14M5 12h14'));
    btn('−', 'Afastar', () => map.zoomOut(), icon('M5 12h14'));
    btn('Brasil', 'Ver o Brasil inteiro', () => fitBrasil(), icon('M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5'));
  }

  function init(el, data, controlsEl, opts = {}) {
    snv = data;
    if (opts.states) { states = opts.states; conc = opts.conc; mode = 'concessoes'; }
    intel = opts.intel || null;
    map = L.map(el, {
      zoomControl: false, attributionControl: false, preferCanvas: true,
      minZoom: 3.5, maxZoom: 13, zoomSnap: 0.5, zoomDelta: 0.5, wheelPxPerZoomLevel: 120,
      maxBounds: L.latLngBounds(BRASIL).pad(0.3), maxBoundsViscosity: 0.8,
    });
    map.createPane('ufs').style.zIndex = 200;
    map.createPane('halo').style.zIndex = 390;
    map.createPane('hl').style.zIndex = 420;
    // O realce fica acima das rodovias: sem isso o canvas dele engole o clique nas rodovias depois do 1º realce.
    map.getPane('hl').style.pointerEvents = 'none';
    map.createPane('ufLabels').style.zIndex = 380;
    map.getPane('ufLabels').style.pointerEvents = 'none';

    const ufRenderer = L.canvas({ pane: 'ufs' });
    ufLayer = L.geoJSON(snv.ufs, {
      renderer: ufRenderer, interactive: false,
      style: { color: COLORS.lightGrey, weight: 0.8, opacity: 0.5, fillColor: COLORS.lightGrey, fillOpacity: 0.08 },
    }).addTo(map);
    for (const f of snv.ufs.features) {
      const [lon, lat] = f.properties.label;
      L.tooltip({ permanent: true, direction: 'center', className: 'uf-label', pane: 'ufLabels', interactive: false })
        .setLatLng([lat, lon]).setContent(f.properties.sigla).addTo(map);
    }

    fitBrasil(false);

    const roadRenderer = L.canvas({ padding: 0.5, tolerance: 6 });
    haloRenderer = L.canvas({ pane: 'halo', padding: 0.5 });
    lines = []; halos = [];
    snv.fis.forEach((f, j) => {
      const latlngs = decode(f.p);
      const line = L.polyline(latlngs, Object.assign({ renderer: roadRenderer, interactive: true, smoothFactor: 1 }, styleFor(j)));
      line.on('mouseover', () => line.setStyle(styleFor(j, { hover: true })));
      line.on('mouseout', () => line.setStyle(styleFor(j)));
      line.on('click', e => pickCb(j, e.latlng));
      lines.push(line);
    });
    computeOrder();
    hlGroup = L.layerGroup().addTo(map);
    hlRenderer = L.canvas({ pane: 'hl', padding: 0.5 });
    map.on('zoomend', applyHighlight);
    buildControls(controlsEl);
    setVisible(new Uint8Array(snv.fis.length).fill(1));
  }

  // Remove tudo e reinsere os visíveis na ordem de z (planejadas embaixo, duplicadas em cima).
  function setVisible(vis) {
    visible = vis;
    for (const j of order) {
      lines[j].remove();
      if (halos[j]) halos[j].remove();
    }
    for (const j of order) {
      if (!vis[j]) continue;
      const h = haloOf(j);
      if (h) h.addTo(map);
      lines[j].addTo(map);
    }
    applyHighlight();
  }

  function highlight(ids) {
    hlWanted = ids && ids.length ? new Set(ids) : null;
    applyHighlight();
  }

  function boundsOf(ids) {
    const b = L.latLngBounds([]);
    for (const j of ids) b.extend(lines[j].getBounds());
    return b;
  }

  // Enquadra os visíveis; se nenhum estiver visível, enquadra os pedidos mesmo assim.
  function fitTo(ids) {
    if (!ids || !ids.length) return;
    const vis = ids.filter(j => visible[j]);
    map.fitBounds(boundsOf(vis.length ? vis : ids), { padding: [64, 64], maxZoom: 11 });
  }

  function fitBrasil(animate = true) {
    map.fitBounds(ufLayer.getBounds(), { padding: [16, 16], animate });
  }

  function setColorMode(m) {
    if (m === mode || (m === 'concessoes' && !states) || !(m === 'concessoes' || m === 'fisica' || isQuant(m))) return;
    mode = m;
    computeOrder();
    setVisible(visible);
  }

  function entityFis(idx) { return (conc && conc.entFis[idx]) || []; }

  return {
    init, setVisible, highlight, fitTo, fitBrasil, setColorMode,
    colorMode() { return mode; },
    classes,
    classesCached(m) { return !!quant[m]; },
    // Para teste: cores (maiúsculas) das linhas visíveis no modo atual, com o nº de físicos de cada uma.
    lineColors() {
      const n = {};
      lines.forEach((l, j) => { if (visible[j]) { const c = String(l.options.color).toUpperCase(); n[c] = (n[c] || 0) + 1; } });
      halos.forEach((h, j) => { if (h && visible[j] && map.hasLayer(h)) { const c = String(h.options.color).toUpperCase(); n[c] = (n[c] || 0) + 1; } });
      return n;
    },
    haloCount() { return halos.filter(h => h && map.hasLayer(h)).length; },
    fitEntity(idx) { fitTo(entityFis(idx)); },
    highlightEntity(idx) { highlight(entityFis(idx)); },
    onPick(cb) { pickCb = cb; },
    pick(j) { pickCb(j, lines[j].getBounds().getCenter()); },
    highlighted() { return hlIds ? [...hlIds] : []; },
    invalidate() { map.invalidateSize(); },
    isVisible(j) { return !!(visible && visible[j]); },
    get map() { return map; },
  };
})();
