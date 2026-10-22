// Gráficos em SVG próprio (sem biblioteca), só com a paleta base (interface).
// As funções *Svg devolvem string (testáveis em Node); as demais escrevem num elemento.
const Charts = (() => {
  const C = { deep: '#183C80', bright: '#0071BB', spacial: '#231F20', grey: '#525254', snow: '#F7F7F8' };
  const FONT = 14;
  const nf1 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = v => typeof v === 'number' && isFinite(v);

  function frame(w, h, body, aria, role = 'img') {
    return `<svg class="chart" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="${role}" aria-label="${esc(aria || '')}"` +
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

  // cls: classe opcional das linhas de grade (o `dotsSvg` as marca como "grid")
  function yAxis(tk, x0, x1, yOf, fmt, cls = '') {
    return tk.map(t => `<line${cls ? ` class="${cls}"` : ''} x1="${x0}" x2="${x1}" y1="${yOf(t)}" y2="${yOf(t)}" stroke="${C.grey}" stroke-opacity="0.15"/>` +
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
      body += `<rect class="cbar" x="${x.toFixed(1)}" y="${yOf(v).toFixed(1)}" width="${(bw * 0.7).toFixed(1)}" height="${Math.max(0, bh).toFixed(1)}" rx="2" fill="${fill}" fill-opacity="${op}">` +
        `<title>${esc(d.label)}: ${num(d.value) ? esc(fmt(d.value)) + esc(unit) : '—'}</title></rect>`;
      if (i % every === 0) body += `<text x="${(L + i * bw + bw / 2).toFixed(1)}" y="${h - B + 24}" text-anchor="middle" fill="${C.grey}">${esc(d.label)}</text>`;
    });
    return frame(w, h, body, o.title);
  }

  // Barras horizontais com rótulo e valor, na ordem recebida.
  function hbarsSvg(data, o = {}) {
    const rows = data;
    const w = o.width || 640, rh = 32, h = Math.max(rows.length * rh + 8, 48);
    if (!rows.length) return empty(w, 120);
    const fmt = o.format || (v => nf1.format(v)), unit = o.unit ? ' ' + o.unit : '';
    const L = o.labelWidth || Math.min(240, w * 0.4), R = 104, pw = w - L - R;
    const max = Math.max(...rows.map(r => (num(r.value) ? r.value : 0)), 0) || 1;
    let body = '';
    rows.forEach((r, i) => {
      const v = num(r.value) ? r.value : 0, y = 4 + i * rh, bw = (v / max) * pw;
      // a dica vale para a linha inteira (rótulo, barra, valor e o vazio entre eles): barras curtas seriam difíceis de acertar
      const tip = `${esc(r.label)}: ${num(r.value) ? esc(fmt(r.value)) + esc(unit) : '—'}${r.detail ? ' (' + esc(r.detail) + ')' : ''}`;
      // o.clickable: a linha com k vira <g role="button" data-k> (abre a ficha); sem k (ex.: "Outros N grupos") fica só com a dica
      const link = o.clickable && r.k != null;
      const attrs = link ? ` data-k="${esc(r.k)}" role="button" tabindex="0" aria-label="${esc(o.rowLabel ? o.rowLabel(r) : r.label)}"` : '';
      body += `<g class="hrow-tip${link ? ' hrow' : ''}"${attrs}><title>${tip}</title>` +
        `<rect class="hit${link ? ' hrow__bg' : ''}" x="0" y="${y}" width="${w}" height="${rh}" fill="${C.bright}" fill-opacity="0"/>` +
        `<text x="${L - 8}" y="${y + 21}" text-anchor="end" fill="${C.spacial}">${esc(r.label)}</text>` +
        `<rect class="cbar" x="${L}" y="${y + 8}" width="${bw.toFixed(1)}" height="16" rx="2" fill="${r.alt ? C.bright : C.deep}">` +
        `<title>${tip}</title></rect>` +
        `<text x="${(L + bw + 8).toFixed(1)}" y="${y + 21}" fill="${C.grey}">${num(r.value) ? esc(fmt(r.value)) : '—'}</text></g>`;
    });
    return frame(w, h, body, o.title, o.clickable ? 'group' : 'img');
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

  // Pontos no tempo (deságio por leilão): x = ano decimal (eixo de min a max, não de 0), y a partir de 0.
  // Marca pela fonte (item.tipo): oficial = cheio Deep Blue; roadshow = cheio Bright Blue; imprensa = vazado cinza tracejado.
  // o.refY: linha horizontal de referência, desenhada só de o.refFromX em diante. item.limitado acrescenta nota à dica.
  function dotsSvg(data, o = {}) {
    const w = o.width || 640, h = o.height || 300;
    const pts = (data || []).filter(d => num(d.x) && num(d.y));
    if (!pts.length) return empty(w, h);
    const fy = o.formatY || (v => nf1.format(v) + '%');
    const L = 56, R = 16, T = 16, B = 40, pw = w - L - R, ph = h - T - B;
    const xs = pts.map(p => p.x), x0 = Math.floor(Math.min(...xs)), x1 = Math.max(Math.ceil(Math.max(...xs)), x0 + 1);
    const ty = ticks(Math.max(...pts.map(p => p.y), num(o.refY) ? o.refY : 0)), my = ty[ty.length - 1] || 1;
    const xOf = v => L + ((v - x0) / (x1 - x0)) * pw, yOf = v => T + ph - (v / my) * ph;
    const FONTE = { oficial: 'fonte oficial', roadshow: 'RoadShow', imprensa: 'imprensa — não oficial' };
    let body = yAxis(ty, L, w - R, yOf, fy, 'grid');
    const step = Math.max(1, Math.ceil((x1 - x0) / 8));
    const anos = [];
    for (let x = x0; x <= x1; x += step) anos.push(x);
    // o último ano do eixo sempre é rotulado; se o passo o deixou colado no anterior (rótulos de 4 dígitos), ele toma o lugar
    if (anos[anos.length - 1] !== x1) {
      if (xOf(x1) - xOf(anos[anos.length - 1]) < 44) anos.pop();
      anos.push(x1);
    }
    for (const x of anos) body += `<text x="${xOf(x).toFixed(1)}" y="${h - B + 24}" text-anchor="middle" fill="${C.grey}">${x}</text>`;
    if (num(o.refY) && !(num(o.refFromX) && o.refFromX > x1)) {
      const rx = xOf(Math.max(num(o.refFromX) ? o.refFromX : x0, x0));
      body += `<line class="ref" x1="${rx.toFixed(1)}" x2="${(w - R).toFixed(1)}" y1="${yOf(o.refY).toFixed(1)}" y2="${yOf(o.refY).toFixed(1)}" stroke="${C.spacial}" stroke-width="1.5" stroke-dasharray="6 4"/>`;
    }
    pts.forEach(p => {
      const tipo = FONTE[p.tipo] ? p.tipo : 'roadshow', cx = xOf(p.x).toFixed(1), cy = yOf(p.y).toFixed(1);
      const mark = tipo === 'imprensa'
        ? `fill="none" pointer-events="all" stroke="${C.grey}" stroke-width="2" stroke-dasharray="2 2"`
        : `fill="${tipo === 'oficial' ? C.deep : C.bright}" fill-opacity="0.85"`;
      // limitado pelo edital: anel externo (só visual; a dica fica no ponto)
      if (p.limitado) body += `<circle class="dot-limite" cx="${cx}" cy="${cy}" r="9.5" fill="none" pointer-events="none" stroke="${C.spacial}" stroke-width="1.5"/>`;
      body += `<circle class="dot" data-tipo="${tipo}" cx="${cx}" cy="${cy}" r="5.5" ${mark}>` +
        `<title>${esc(p.label || '')}: ${esc(fy(p.y))} · ${FONTE[tipo]}${p.limitado ? ' · limitado pelo edital (desempate por outorga)' : ''}</title></circle>`;
    });
    return frame(w, h, body, o.title);
  }

  function linesSvg(series, o = {}) {
    const w = o.width || 640, h = o.height || 280;
    const all = series.flatMap(s => s.points.filter(p => num(p.x) && num(p.y)));
    if (!all.length) return empty(w, h);
    const fy = o.format || (v => nf1.format(v)), unit = o.unit ? ' ' + o.unit : '';
    const fx = o.formatX || (x => String(x)), r = o.r || 4;
    const L = 72, R = 16, T = 16, B = 40, pw = w - L - R, ph = h - T - B;
    const xs = all.map(p => p.x), x0 = Math.min(...xs), x1 = Math.max(...xs);
    const ty = ticks(Math.max(...all.map(p => p.y))), my = ty[ty.length - 1] || 1;
    const xOf = v => L + (x1 === x0 ? pw / 2 : ((v - x0) / (x1 - x0)) * pw), yOf = v => T + ph - (v / my) * ph;
    let body = yAxis(ty, L, w - R, yOf, fy);
    // o.stepX: passo dos rótulos do eixo x (ex.: meses em fração de ano); padrão = inteiro, até ~8 rótulos
    const step = o.stepX > 0 ? o.stepX : Math.max(1, Math.ceil((x1 - x0) / 8));
    for (let k = 0, x = x0; x <= x1 + 1e-9; k++, x = x0 + k * step) body += `<text x="${xOf(x)}" y="${h - B + 24}" text-anchor="middle" fill="${C.grey}">${esc(fx(x))}</text>`;
    series.forEach((s, k) => {
      const pts = s.points.filter(p => num(p.x) && num(p.y));
      const color = k === 0 ? C.deep : k === 1 ? C.bright : C.grey;
      const d = pts.map((p, i) => `${i ? 'L' : 'M'}${xOf(p.x).toFixed(1)},${yOf(p.y).toFixed(1)}`).join('');
      body += `<path class="line" d="${d}" fill="none" stroke="${color}" stroke-width="2.5"${s.dash ? ' stroke-dasharray="6 4"' : ''}/>`;
      body += pts.map(p => `<circle cx="${xOf(p.x).toFixed(1)}" cy="${yOf(p.y).toFixed(1)}" r="${r}" fill="${color}"><title>${esc(s.name)} ${esc(fx(p.x))}: ${esc(fy(p.y))}${esc(unit)}</title></circle>`).join('');
    });
    return frame(w, h, body, o.title);
  }

  // Barras empilhadas (até 3 partes: Deep Blue, Bright Blue, Light Grey).
  function stackedSvg(data, o = {}) {
    const w = o.width || 640, h = o.height || 280;
    if (!data.length) return empty(w, h);
    const fmt = o.format || (v => nf1.format(v)), unit = o.unit ? ' ' + o.unit : '', names = o.names || [];
    const colors = [C.deep, C.bright, C.grey];
    const L = o.left || 56, R = 16, T = 16, B = 40, pw = w - L - R, ph = h - T - B; // o.left: margem dos rótulos do eixo y
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
        body += `<rect class="cbar" x="${(L + i * bw + bw * 0.15).toFixed(1)}" y="${y.toFixed(1)}" width="${(bw * 0.7).toFixed(1)}" height="${hh.toFixed(1)}" fill="${colors[k % 3]}">` +
          `<title>${esc(d.tip || d.label)} · ${esc(names[k] || '')}: ${esc(fmt(v))}${esc(unit)}</title></rect>`;
        acc += v;
      });
      if (i % every === 0) body += `<text x="${(L + i * bw + bw / 2).toFixed(1)}" y="${h - B + 24}" text-anchor="middle" fill="${C.grey}">${esc(d.label)}</text>`;
    });
    return frame(w, h, body, o.title);
  }

  // Barras horizontais empilhadas: uma linha por item ({label, parts, k?, detail?}), partes em Deep Blue, Bright Blue e Light Grey
  // (ou o.colors), total à direita. o.clickable: cada linha vira <g role="button" tabindex="0" data-k> e o SVG, role="group".
  function hstackSvg(data, o = {}) {
    const w = o.width || 640, rh = o.rh || 32, bh = Math.min(16, rh - 8);
    if (!data.length) return empty(w, 120);
    const fmt = o.format || (v => nf1.format(v)), unit = o.unit ? ' ' + o.unit : '', names = o.names || [];
    const colors = o.colors || [C.deep, C.bright, C.grey];
    const L = o.labelWidth || Math.min(240, w * 0.4), R = o.valueWidth || 112, pw = Math.max(40, w - L - R);
    const pos = v => (num(v) && v > 0 ? v : 0);
    const sums = data.map(d => d.parts.reduce((a, v) => a + pos(v), 0));
    const max = Math.max(...sums, 0) || 1, maxCh = Math.max(4, Math.floor((L - 8) / 7.5));
    const cut = s => (s.length > maxCh ? `${s.slice(0, maxCh - 1)}…` : s);
    const body = data.map((d, i) => {
      const y = 4 + i * rh, ty = y + rh / 2 + 5, label = String(d.label);
      let x = L, rects = '';
      d.parts.forEach((v, k) => {
        if (!pos(v)) return;
        const bw = (v / max) * pw;
        rects += `<rect class="cbar" x="${x.toFixed(1)}" y="${(y + (rh - bh) / 2).toFixed(1)}" width="${bw.toFixed(1)}" height="${bh}" fill="${colors[k % colors.length]}">` +
          `<title>${esc(label)}${names[k] ? ` · ${esc(names[k])}` : ''}: ${esc(fmt(v))}${esc(unit)}${d.detail ? ` (${esc(d.detail)})` : ''}</title></rect>`;
        x += bw;
      });
      const val = sums[i] > 0 ? fmt(sums[i]) : '—';
      const attrs = o.clickable ? ` data-k="${esc(d.k)}" role="button" tabindex="0" aria-label="${esc(`${label}: ${val}${unit}`)}"` : '';
      return `<g class="hrow"${attrs}><rect class="hrow__bg" x="0" y="${y}" width="${w}" height="${rh}" fill="${C.bright}" fill-opacity="0"/>` +
        `<text x="${L - 8}" y="${ty}" text-anchor="end" fill="${C.spacial}">${esc(cut(label))}</text>${rects}` +
        `<text x="${(x + 8).toFixed(1)}" y="${ty}" fill="${C.grey}">${esc(val)}</text></g>`;
    }).join('');
    return frame(w, data.length * rh + 8, body, o.title, o.clickable ? 'group' : 'img');
  }

  // Linha do tempo de editais e leilões: uma linha por item ({nome, id, edital, leilao, status, k?}), já ordenada. Círculo vazado =
  // edital, losango cheio = leilão, linha entre os dois, cor por status (o.colors: status -> cor, tokens de styles-map.js).
  // Data "AAAA-MM" (mês sem dia) fica no meio do mês e leva "(mês)". Eixo em anos inteiros o.de..o.ate (padrão: dos dados).
  // o.clickable: a linha com k vira <g role="button" data-k> (abre a ficha). o.statusLabel: status -> texto da dica.
  const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const fmtDia = s => {
    const [y, m, d] = String(s).split('-');
    return d ? `${d}/${m}/${y}` : `${MESES[Number(m) - 1]}/${y}`;
  };
  const diaN = s => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d || 15) / 864e5; };
  function timelineSvg(data, o = {}) {
    const w = o.width || 720, rh = 30;
    const rows = (data || []).filter(r => r && typeof r.leilao === 'string' && r.leilao);
    if (!rows.length) return empty(w, 120);
    const anos = rows.flatMap(r => [r.leilao, r.edital].filter(Boolean).map(d => +d.slice(0, 4)));
    const de = num(o.de) ? o.de : Math.min(...anos), ate = Math.max(num(o.ate) ? o.ate : Math.max(...anos), de);
    const fmt = o.formatDate || fmtDia, col = k => (o.colors && o.colors[k]) || C.deep;
    const L = o.labelWidth || Math.min(300, Math.round(w * 0.4)), R = 128, T = 28, pw = Math.max(80, w - L - R);
    const d0 = Date.UTC(de, 0, 1) / 864e5, d1 = Date.UTC(ate + 1, 0, 1) / 864e5;
    const xOf = s => L + Math.min(1, Math.max(0, (diaN(s) - d0) / (d1 - d0))) * pw;
    const h = T + rows.length * rh + 8, maxCh = Math.max(8, Math.floor((L - 16) / 7.5));
    const cut = (t, n = maxCh) => (t.length > n ? `${t.slice(0, Math.max(1, n - 1))}…` : t);
    // item só de imprensa (verificado === false): marca no rótulo, sempre visível (o nome é que encurta), e nas dicas
    const NV = ' (não verificado)', NV_FONTE = 'fonte: imprensa — não oficial';
    const mes = d => (d.length === 7 ? ' (mês)' : '');
    let body = '';
    for (let y = de; y <= ate; y++) {
      const x = xOf(`${y}-01-01`);
      for (const q of [4, 7, 10]) body += `<line class="tl-trim" x1="${xOf(`${y}-${String(q).padStart(2, '0')}-01`).toFixed(1)}" x2="${xOf(`${y}-${String(q).padStart(2, '0')}-01`).toFixed(1)}" y1="${T}" y2="${h - 8}" stroke="${C.grey}" stroke-opacity="0.08"/>`;
      body += `<line class="tl-grid" x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${T - 6}" y2="${h - 8}" stroke="${C.grey}" stroke-opacity="0.3"/>` +
        `<text class="tl-ano" x="${(x + 6).toFixed(1)}" y="${T - 10}" fill="${C.grey}">${y}</text>`;
    }
    body += `<line class="tl-grid" x1="${(L + pw).toFixed(1)}" x2="${(L + pw).toFixed(1)}" y1="${T - 6}" y2="${h - 8}" stroke="${C.grey}" stroke-opacity="0.3"/>`;
    const st = k => (o.statusLabel && o.statusLabel(k)) || '';
    body += rows.map((r, i) => {
      const y = T + i * rh, cy = y + rh / 2, c = col(r.status), nome = String(r.nome), nv = r.verificado === false;
      const fonte = nv ? ` · ${NV_FONTE}` : '';
      const lx = xOf(r.leilao), ex = r.edital ? xOf(r.edital) : null;
      const click = o.clickable && r.k != null;
      const attrs = click ? ` data-k="${esc(r.k)}" role="button" tabindex="0" aria-label="${esc(`${nome}: leilão ${fmt(r.leilao)}${mes(r.leilao)} (abrir ficha)`)}"` : '';
      let marks = '';
      if (ex != null) {
        const a = Math.min(ex, lx), b = Math.max(ex, lx), trim = b - a > 14;
        marks += `<line class="tl-span" x1="${(trim ? a + 5 : a).toFixed(1)}" x2="${(trim ? b - 7 : b).toFixed(1)}" y1="${cy}" y2="${cy}" stroke="${c}" stroke-width="2.5"/>` +
          `<circle class="tl-edital" data-id="${esc(r.id)}" cx="${ex.toFixed(1)}" cy="${cy}" r="5" fill="none" stroke="${c}" stroke-width="2.5"><title>${esc(nome)} · edital: ${esc(fmt(r.edital))}${mes(r.edital)}${fonte}</title></circle>`;
      }
      marks += `<path class="tl-leilao" data-id="${esc(r.id)}" data-leilao-x="${lx.toFixed(1)}" d="M${lx.toFixed(1)},${cy - 8} L${(lx + 8).toFixed(1)},${cy} L${lx.toFixed(1)},${cy + 8} L${(lx - 8).toFixed(1)},${cy} Z" fill="${c}" stroke="${C.snow}" stroke-width="1">` +
        `<title>${esc(nome)} · leilão: ${esc(fmt(r.leilao))}${mes(r.leilao)}${st(r.status) ? ` · ${esc(st(r.status))}` : ''}${fonte}</title></path>`;
      return `<g class="hrow tl-row"${attrs}><rect class="hrow__bg" x="0" y="${y}" width="${w}" height="${rh}" fill="${C.bright}" fill-opacity="0"/>` +
        `<text x="${L - 8}" y="${cy + 5}" text-anchor="end" fill="${C.spacial}">${nv ? `<title>${esc(nome)} (não verificado; ${NV_FONTE})</title>${esc(cut(nome, maxCh - NV.length))}${NV}`
          : `${nome.length > maxCh ? `<title>${esc(nome)}</title>` : ''}${esc(cut(nome))}`}</text>` +
        `${marks}<text x="${L + pw + 16}" y="${cy + 5}" fill="${C.grey}">${esc(fmt(r.leilao))}${mes(r.leilao)}</text></g>`;
    }).join('');
    return frame(w, h, body, o.title, o.clickable ? 'group' : 'img');
  }

  // Legenda. Item = [rótulo, cor, opacidade?, tracejado?] (barra) ou {label, color, shape}, com shape
  // 'dot' (ponto cheio), 'ring' (anel vazado tracejado, como a marca de imprensa), 'line' (linha de referência tracejada),
  // 'limite' (anel do ponto limitado pelo edital), 'arrow' (seta cheia), 'diamond' (losango vazado),
  // 'circle' (círculo vazado) ou 'diamondFill' (losango cheio).
  const SHAPES = {
    dot: c => `<svg width="12" height="12" aria-hidden="true"><circle cx="6" cy="6" r="5" fill="${c}" fill-opacity="0.85"/></svg>`,
    ring: c => `<svg width="12" height="12" aria-hidden="true"><circle cx="6" cy="6" r="4.5" fill="none" stroke="${c}" stroke-width="2" stroke-dasharray="2 2"/></svg>`,
    line: c => `<svg width="24" height="12" aria-hidden="true"><line x1="0" x2="24" y1="6" y2="6" stroke="${c}" stroke-width="1.5" stroke-dasharray="6 4"/></svg>`,
    limite: c => `<svg width="20" height="20" aria-hidden="true"><circle cx="10" cy="10" r="8.5" fill="none" stroke="${c}" stroke-width="1.5"/></svg>`,
    // diagramas: seta cheia (sequência / fluxo) e losango vazado (decisão)
    arrow: c => `<svg width="24" height="12" aria-hidden="true"><line x1="0" x2="18" y1="6" y2="6" stroke="${c}" stroke-width="1.5"/><path d="M17,2 L23,6 L17,10 Z" fill="${c}"/></svg>`,
    diamond: c => `<svg width="14" height="14" aria-hidden="true"><path d="M7,1 L13,7 L7,13 L1,7 Z" fill="none" stroke="${c}" stroke-width="2"/></svg>`,
    // linha do tempo: círculo vazado (edital) e losango cheio (leilão)
    circle: c => `<svg width="14" height="14" aria-hidden="true"><circle cx="7" cy="7" r="5" fill="none" stroke="${c}" stroke-width="2.5"/></svg>`,
    diamondFill: c => `<svg width="16" height="16" aria-hidden="true"><path d="M8,1 L15,8 L8,15 L1,8 Z" fill="${c}"/></svg>`,
  };
  function legendHtml(items) {
    return `<div class="chart-legend">${items.map(it => {
      if (!Array.isArray(it)) return `<span>${(SHAPES[it.shape] || SHAPES.dot)(it.color)}${esc(it.label)}</span>`;
      const [label, color, op = 1, dash = false] = it;
      return `<span><svg width="24" height="12" aria-hidden="true"><rect x="0" y="2" width="24" height="8" rx="2" fill="${color}" fill-opacity="${op}"${dash ? ' stroke-dasharray="4 2"' : ''}/></svg>${esc(label)}</span>`;
    }).join('')}</div>`;
  }

  const into = fn => (el, data, o = {}) => { el.innerHTML = fn(data, Object.assign({ width: Math.max(320, el.clientWidth || 640) }, o)); };

  return { C, barsSvg, hbarsSvg, hstackSvg, scatterSvg, linesSvg, stackedSvg, dotsSvg, timelineSvg, legendHtml,
    bars: into(barsSvg), hbars: into(hbarsSvg), scatter: into(scatterSvg), lines: into(linesSvg), stacked: into(stackedSvg), dots: into(dotsSvg) };
})();

if (typeof module !== 'undefined') module.exports = Charts;
