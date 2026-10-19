// Gráficos em SVG próprio (sem biblioteca), só com a paleta Galapagos.
// As funções *Svg devolvem string (testáveis em Node); as demais escrevem num elemento.
const Charts = (() => {
  const C = { deep: '#183C80', bright: '#0071BB', spacial: '#231F20', grey: '#525254', snow: '#F7F7F8' };
  const FONT = 14;
  const nf1 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = v => typeof v === 'number' && isFinite(v);

  function frame(w, h, body, aria) {
    return `<svg class="chart" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(aria || '')}"` +
      ` font-family="Inter, sans-serif" font-size="${FONT}">${body}</svg>`;
  }
  const empty = (w, h) => frame(w, h, `<text x="${w / 2}" y="${h / 2}" text-anchor="middle" fill="${C.grey}">Sem dados</text>`, 'Sem dados');

  function ticks(max, n = 4) {
    if (!(max > 0)) return [0];
    const raw = max / n, p = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map(m => m * p).find(s => s >= raw);
    const out = [];
    for (let v = 0; v <= max + step * 0.001; v += step) out.push(+v.toFixed(10));
    if (out[out.length - 1] < max) out.push(out[out.length - 1] + step);
    return out;
  }

  function yAxis(tk, x0, x1, yOf, fmt) {
    return tk.map(t => `<line x1="${x0}" x2="${x1}" y1="${yOf(t)}" y2="${yOf(t)}" stroke="${C.grey}" stroke-opacity="0.15"/>` +
      `<text x="${x0 - 8}" y="${yOf(t) + 5}" text-anchor="end" fill="${C.grey}">${esc(fmt(t))}</text>`).join('');
  }

  // Barras verticais. item.alt = estilo secundário (ex. previsto).
  function barsSvg(data, o = {}) {
    const w = o.width || 640, h = o.height || 280;
    const vals = data.map(d => (num(d.value) ? d.value : 0));
    if (!data.length) return empty(w, h);
    const fmt = o.format || (v => nf1.format(v)), unit = o.unit ? ' ' + o.unit : '';
    const L = 56, R = 16, T = 16, B = 40, pw = w - L - R, ph = h - T - B;
    const tk = ticks(Math.max(...vals, 0)), max = tk[tk.length - 1] || 1;
    const yOf = v => T + ph - (v / max) * ph, bw = pw / data.length;
    const every = Math.ceil(data.length / Math.max(1, Math.floor(pw / 48)));
    let body = yAxis(tk, L, w - R, yOf, fmt);
    data.forEach((d, i) => {
      const v = vals[i], x = L + i * bw + bw * 0.15, bh = T + ph - yOf(v);
      const fill = d.alt ? C.bright : C.deep, op = d.alt ? 0.45 : 1;
      body += `<rect class="bar" x="${x.toFixed(1)}" y="${yOf(v).toFixed(1)}" width="${(bw * 0.7).toFixed(1)}" height="${Math.max(0, bh).toFixed(1)}" rx="2" fill="${fill}" fill-opacity="${op}">` +
        `<title>${esc(d.label)}: ${num(d.value) ? esc(fmt(d.value)) + esc(unit) : '—'}</title></rect>`;
      if (i % every === 0) body += `<text x="${(L + i * bw + bw / 2).toFixed(1)}" y="${h - B + 24}" text-anchor="middle" fill="${C.grey}">${esc(d.label)}</text>`;
    });
    return frame(w, h, body, o.title);
  }

  // Barras horizontais com rótulo e valor.
  function hbarsSvg(data, o = {}) {
    const rows = o.sort ? [...data].sort((a, b) => (b.value || 0) - (a.value || 0)) : data;
    const w = o.width || 640, rh = 32, h = Math.max(rows.length * rh + 8, 48);
    if (!rows.length) return empty(w, 120);
    const fmt = o.format || (v => nf1.format(v)), unit = o.unit ? ' ' + o.unit : '';
    const L = o.labelWidth || Math.min(240, w * 0.4), R = 104, pw = w - L - R;
    const max = Math.max(...rows.map(r => (num(r.value) ? r.value : 0)), 0) || 1;
    let body = '';
    rows.forEach((r, i) => {
      const v = num(r.value) ? r.value : 0, y = 4 + i * rh, bw = (v / max) * pw;
      body += `<text x="${L - 8}" y="${y + 21}" text-anchor="end" fill="${C.spacial}">${esc(r.label)}</text>` +
        `<rect class="bar" x="${L}" y="${y + 8}" width="${bw.toFixed(1)}" height="16" rx="2" fill="${r.alt ? C.bright : C.deep}">` +
        `<title>${esc(r.label)}: ${num(r.value) ? esc(fmt(r.value)) + esc(unit) : '—'}</title></rect>` +
        `<text x="${(L + bw + 8).toFixed(1)}" y="${y + 21}" fill="${C.grey}">${num(r.value) ? esc(fmt(r.value)) : '—'}</text>`;
    });
    return frame(w, h, body, o.title);
  }

  function scatterSvg(data, o = {}) {
    const w = o.width || 640, h = o.height || 300;
    const pts = data.filter(d => num(d.x) && num(d.y));
    if (!pts.length) return empty(w, h);
    const fx = o.formatX || (v => nf1.format(v)), fy = o.formatY || (v => nf1.format(v) + '%');
    const L = 64, R = 16, T = 16, B = 48, pw = w - L - R, ph = h - T - B;
    const tx = ticks(Math.max(...pts.map(p => p.x))), ty = ticks(Math.max(...pts.map(p => p.y)));
    const mx = tx[tx.length - 1] || 1, my = ty[ty.length - 1] || 1;
    const xOf = v => L + (v / mx) * pw, yOf = v => T + ph - (v / my) * ph;
    let body = yAxis(ty, L, w - R, yOf, fy);
    body += tx.map(t => `<text x="${xOf(t)}" y="${h - B + 24}" text-anchor="middle" fill="${C.grey}">${esc(fx(t))}</text>`).join('');
    if (o.xLabel) body += `<text x="${L + pw / 2}" y="${h - 4}" text-anchor="middle" fill="${C.grey}">${esc(o.xLabel)}</text>`;
    pts.forEach(p => {
      body += `<circle cx="${xOf(p.x).toFixed(1)}" cy="${yOf(p.y).toFixed(1)}" r="6" fill="${C.bright}" fill-opacity="0.7" stroke="${C.deep}" stroke-width="1.5">` +
        `<title>${esc(p.label || '')}: ${esc(fx(p.x))} ${esc(o.xLabel || '')} · ${esc(fy(p.y))}</title></circle>`;
    });
    return frame(w, h, body, o.title);
  }

  function linesSvg(series, o = {}) {
    const w = o.width || 640, h = o.height || 280;
    const all = series.flatMap(s => s.points.filter(p => num(p.x) && num(p.y)));
    if (!all.length) return empty(w, h);
    const fy = o.format || (v => nf1.format(v)), unit = o.unit ? ' ' + o.unit : '';
    const L = 72, R = 16, T = 16, B = 40, pw = w - L - R, ph = h - T - B;
    const xs = all.map(p => p.x), x0 = Math.min(...xs), x1 = Math.max(...xs);
    const ty = ticks(Math.max(...all.map(p => p.y))), my = ty[ty.length - 1] || 1;
    const xOf = v => L + (x1 === x0 ? pw / 2 : ((v - x0) / (x1 - x0)) * pw), yOf = v => T + ph - (v / my) * ph;
    let body = yAxis(ty, L, w - R, yOf, fy);
    const step = Math.max(1, Math.ceil((x1 - x0) / 8));
    for (let x = x0; x <= x1; x += step) body += `<text x="${xOf(x)}" y="${h - B + 24}" text-anchor="middle" fill="${C.grey}">${x}</text>`;
    series.forEach((s, k) => {
      const pts = s.points.filter(p => num(p.x) && num(p.y));
      const color = k === 0 ? C.deep : k === 1 ? C.bright : C.grey;
      const d = pts.map((p, i) => `${i ? 'L' : 'M'}${xOf(p.x).toFixed(1)},${yOf(p.y).toFixed(1)}`).join('');
      body += `<path class="line" d="${d}" fill="none" stroke="${color}" stroke-width="2.5"${s.dash ? ' stroke-dasharray="6 4"' : ''}/>`;
      body += pts.map(p => `<circle cx="${xOf(p.x).toFixed(1)}" cy="${yOf(p.y).toFixed(1)}" r="4" fill="${color}"><title>${esc(s.name)} ${p.x}: ${esc(fy(p.y))}${esc(unit)}</title></circle>`).join('');
    });
    return frame(w, h, body, o.title);
  }

  // Barras empilhadas (até 3 partes: Deep Blue, Bright Blue, Light Grey).
  function stackedSvg(data, o = {}) {
    const w = o.width || 640, h = o.height || 280;
    if (!data.length) return empty(w, h);
    const fmt = o.format || (v => nf1.format(v)), unit = o.unit ? ' ' + o.unit : '', names = o.names || [];
    const colors = [C.deep, C.bright, C.grey];
    const L = 56, R = 16, T = 16, B = 40, pw = w - L - R, ph = h - T - B;
    const sums = data.map(d => d.parts.reduce((a, v) => a + (num(v) ? v : 0), 0));
    const tk = ticks(Math.max(...sums, 0)), max = tk[tk.length - 1] || 1;
    const yOf = v => T + ph - (v / max) * ph, bw = pw / data.length;
    const every = Math.ceil(data.length / Math.max(1, Math.floor(pw / 48)));
    let body = yAxis(tk, L, w - R, yOf, fmt);
    data.forEach((d, i) => {
      let acc = 0;
      d.parts.forEach((v, k) => {
        if (!num(v) || v <= 0) return;
        const y = yOf(acc + v), hh = yOf(acc) - y;
        body += `<rect class="bar" x="${(L + i * bw + bw * 0.15).toFixed(1)}" y="${y.toFixed(1)}" width="${(bw * 0.7).toFixed(1)}" height="${hh.toFixed(1)}" fill="${colors[k % 3]}">` +
          `<title>${esc(d.label)} · ${esc(names[k] || '')}: ${esc(fmt(v))}${esc(unit)}</title></rect>`;
        acc += v;
      });
      if (i % every === 0) body += `<text x="${(L + i * bw + bw / 2).toFixed(1)}" y="${h - B + 24}" text-anchor="middle" fill="${C.grey}">${esc(d.label)}</text>`;
    });
    return frame(w, h, body, o.title);
  }

  function legendHtml(items) {
    return `<div class="chart-legend">${items.map(([label, color, op = 1, dash = false]) =>
      `<span><svg width="24" height="12" aria-hidden="true"><rect x="0" y="2" width="24" height="8" rx="2" fill="${color}" fill-opacity="${op}"${dash ? ' stroke-dasharray="4 2"' : ''}/></svg>${esc(label)}</span>`).join('')}</div>`;
  }

  const into = fn => (el, data, o = {}) => { el.innerHTML = fn(data, Object.assign({ width: Math.max(320, el.clientWidth || 640) }, o)); };

  return { C, barsSvg, hbarsSvg, scatterSvg, linesSvg, stackedSvg, legendHtml,
    bars: into(barsSvg), hbars: into(hbarsSvg), scatter: into(scatterSvg), lines: into(linesSvg), stacked: into(stackedSvg) };
})();

if (typeof module !== 'undefined') module.exports = Charts;
