// Camadas de inteligência (v3): métricas por físico, classes de cor, agregados, geometria municipal e formatos. Puro: sem DOM.
const IntelModel = (() => {
  const DASH = '—';
  const NF = {};
  const nf = d => NF[d] || (NF[d] = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }));
  const f0 = nf(0), f1 = nf(1);
  const has = v => v != null && Number.isFinite(v);

  function rows(block) {
    if (!block || !block.campos || !block.linhas) return [];
    const { campos, linhas } = block;
    return linhas.map(l => Object.fromEntries(campos.map((c, i) => [c, l[i] === undefined ? null : l[i]])));
  }

  const nAnos = acid => (acid && acid.anos && acid.anos.length) || 1;
  const vmdaOf = intel => (intel && intel.trafego && intel.trafego.vmda) || null;
  const acidOf = intel => (intel && intel.trafego && intel.trafego.acidentes) || null;
  // Carga só conta como presente com o array GSA (é ele que vira métrica, agregado e cartão).
  const cargaOf = intel => (intel && intel.carga && intel.carga.gsa ? intel.carga : null);

  const MODES = {
    trafego: {
      label: 'Tráfego', unidade: 'veíc./dia', tipo: 'modelado',
      fonte: intel => { const v = vmdaOf(intel); return v ? `Infra S.A./DNIT, VMDa ${v.ano} (modelado)` : DASH; },
    },
    pesados: {
      label: 'Pesados', unidade: 'veíc. pesados/dia', tipo: 'modelado',
      fonte: intel => { const v = vmdaOf(intel); return v ? `Infra S.A./DNIT, VMDa ${v.ano} (modelado)` : DASH; },
    },
    carga: {
      label: 'Carga agrícola', unidade: 't/ano', tipo: 'modelado',
      fonte: intel => { const c = cargaOf(intel); return c ? `ONTL/Infra S.A., PNL 2035, ano-base ${c.ano_base} (modelado)` : DASH; },
    },
    acidentes: {
      label: 'Acidentes', unidade: 'acid./km/ano', tipo: 'medido',
      fonte: intel => {
        const a = acidOf(intel);
        if (!a || !a.n) return DASH;
        const anos = Array.isArray(a.anos) && a.anos.length ? ` ${a.anos.join(' e ')}` : '';
        return `PRF, DATATRAN${anos} (medido)`;
      },
    },
  };

  // Soma de duas séries onde ao menos uma tem valor; os dois ausentes dão null.
  const sumNullable = (a, b) => (has(a) || has(b) ? (has(a) ? a : 0) + (has(b) ? b : 0) : null);

  function metricArray(intel, snv, mode) {
    const nFis = snv.fis.length;
    const none = () => new Array(nFis).fill(null);
    const out = new Array(nFis);
    if (mode === 'trafego' || mode === 'pesados') {
      const v = vmdaOf(intel);
      if (!v) return none();
      const l = v.l || [], p = v.p || [];
      for (let j = 0; j < nFis; j++) out[j] = mode === 'pesados' ? (has(p[j]) ? p[j] : null) : sumNullable(l[j], p[j]);
      return out;
    }
    if (mode === 'carga') {
      const c = cargaOf(intel);
      if (!c) return none();
      for (let j = 0; j < nFis; j++) out[j] = has(c.gsa[j]) ? c.gsa[j] : null;
      return out;
    }
    if (mode === 'acidentes') {
      const a = acidOf(intel);
      if (!a || !a.n) return none();
      const anos = nAnos(a);
      for (let j = 0; j < nFis; j++) {
        const ext = snv.fis[j].ext;
        out[j] = has(a.n[j]) && ext > 0 ? a.n[j] / anos / ext : null;
      }
      return out;
    }
    return none();
  }

  // k-1 cortes crescentes (quantis por posição, 2 algarismos significativos) sobre valores > 0.
  function quantileBreaks(values, k = 5) {
    const v = values.filter(x => has(x) && x > 0).sort((a, b) => a - b);
    const out = [];
    if (!v.length) return out;
    for (let i = 1; i < k; i++) {
      const b = Number(v[Math.min(v.length - 1, Math.floor(i * v.length / k))].toPrecision(2));
      if (!out.length || b > out[out.length - 1]) out.push(b);
    }
    return out;
  }

  // -1 sem dado; senão quantos cortes o valor alcança (corte = limite inferior da classe seguinte).
  function classOf(v, breaks) {
    if (!has(v)) return -1;
    let c = 0;
    while (c < breaks.length && v >= breaks[c]) c++;
    return c;
  }

  function aggregateIntel(intel, snv, visible) {
    const vm = vmdaOf(intel), ac = acidOf(intel), ca = cargaOf(intel);
    const hasCarga = !!ca, hasMortos = !!(ac && ac.m && ac.m.length);
    const r = {
      vkm: vm ? 0 : null, vkmPes: vm ? 0 : null, kmVmda: vm ? 0 : null, kmPav: 0,
      acidAno: ac && ac.n ? 0 : null, mortosAno: hasMortos ? 0 : null,
      tkm: hasCarga ? 0 : null, kmCarga: hasCarga ? 0 : null,
    };
    const anos = nAnos(ac);
    for (let j = 0; j < snv.fis.length; j++) {
      if (!visible[j]) continue;
      const ext = snv.fis[j].ext;
      r.kmPav += ext;
      if (vm) {
        const tot = sumNullable(vm.l && vm.l[j], vm.p && vm.p[j]);
        if (tot != null) {
          r.vkm += tot * ext;
          r.kmVmda += ext;
          if (has(vm.p && vm.p[j])) r.vkmPes += vm.p[j] * ext;
        }
      }
      if (r.acidAno != null && has(ac.n[j])) r.acidAno += ac.n[j] / anos;
      if (hasMortos && has(ac.m[j])) r.mortosAno += ac.m[j] / anos;
      if (hasCarga && has(ca.gsa[j])) { r.tkm += ca.gsa[j] * ext; r.kmCarga += ext; }
    }
    return r;
  }

  // Números de um físico para o cartão; mesmas regras de aggregateIntel (null = sem dado).
  function fisIntel(intel, snv, j) {
    const vm = vmdaOf(intel), ac = acidOf(intel), ca = cargaOf(intel);
    const at = (arr, k) => (arr && has(arr[k]) ? arr[k] : null);
    const l = vm ? at(vm.l, j) : null, p = vm ? at(vm.p, j) : null;
    const tot = sumNullable(l, p);
    const anos = nAnos(ac);
    const n = ac ? at(ac.n, j) : null, m = ac ? at(ac.m, j) : null;
    return {
      l, p, tot,
      pctPes: p != null && tot > 0 ? p / tot : null,
      acidAno: n == null ? null : n / anos,
      mortosAno: m == null ? null : m / anos,
      taxa: taxaAcidentes(n, anos, tot, snv.fis[j].ext),
      gsa: ca ? at(ca.gsa, j) : null,
    };
  }

  // Acidentes por 10^6 veíc·km.
  function taxaAcidentes(nTotal, anos, vmd, ext) {
    if (!has(nTotal) || !has(anos) || !anos || !has(vmd) || !vmd || !has(ext) || !ext) return null;
    return nTotal / anos / (vmd * ext * 365) * 1e6;
  }

  function pointsOfFis(rowList, j) {
    const out = [];
    for (let i = 0; i < rowList.length; i++) if (rowList[i].fis === j) out.push(i);
    return out;
  }

  // TopoJSON -> [{id, rings: [[[lat, lng], ...], ...]}]; todos os anéis (inclusive buracos) achatados.
  function decodeTopo(topo, name = 'mun') {
    const obj = topo && topo.objects && topo.objects[name];
    if (!obj) return [];
    const tf = topo.transform;
    const sx = tf ? tf.scale[0] : 1, sy = tf ? tf.scale[1] : 1;
    const tx = tf ? tf.translate[0] : 0, ty = tf ? tf.translate[1] : 0;
    const arcs = topo.arcs.map(arc => {
      let x = 0, y = 0;
      return arc.map(([dx, dy]) => {
        if (tf) { x += dx; y += dy; } else { x = dx; y = dy; }
        return [y * sy + ty, x * sx + tx];
      });
    });
    const ring = idxs => {
      const pts = [];
      for (const i of idxs) {
        const a = i < 0 ? arcs[~i].slice().reverse() : arcs[i];
        const last = pts[pts.length - 1];
        const start = last && last[0] === a[0][0] && last[1] === a[0][1] ? 1 : 0;
        for (let k = start; k < a.length; k++) pts.push(a[k]);
      }
      return pts;
    };
    return (obj.geometries || []).map(g => {
      const polys = g.type === 'Polygon' ? [g.arcs] : g.type === 'MultiPolygon' ? g.arcs : [];
      return { id: g.properties && g.properties.id != null ? g.properties.id : g.id, rings: polys.flatMap(p => p.map(ring)) };
    });
  }

  // ---------- Camadas de sobreposição e cartões de ponto ----------
  // Rótulo de rodovia de um ponto ANTT: "BR-101" como está; só número vira "<uf>-<n>" (rodovias estaduais do PR); senão o texto.
  function rodLabel(br, uf) {
    if (br == null || br === '') return DASH;
    const s = String(br);
    if (/^BR-/.test(s)) return s;
    if (/^\d+$/.test(s) && uf) return `${uf}-${s}`;
    return s;
  }

  // Linha codificada (ferrovias, estaduais): primeiro par lon,lat absoluto ×1e5, depois deltas -> [[lat, lng], ...].
  function decodeLine(p) {
    const out = [];
    if (!p) return out;
    let x = 0, y = 0;
    for (let i = 0; i + 1 < p.length; i += 2) {
      x += p[i]; y += p[i + 1];
      out.push([y / 1e5, x / 1e5]);
    }
    return out;
  }

  // Raio ∝ √valor (área ∝ valor), limitado a [rmin, rmax]; sem valor = rmin.
  function pointRadius(v, vmax, rmin = 3, rmax = 10) {
    if (!has(v) || v <= 0 || !has(vmax) || vmax <= 0) return rmin;
    return Math.min(rmax, Math.max(rmin, rmax * Math.sqrt(v / vmax)));
  }

  // Espessura ∝ valor, com piso de wmin px.
  function lineWeight(v, vmax, wmin = 1, wmax = 8) {
    if (!has(v) || v <= 0 || !has(vmax) || vmax <= 0) return wmin;
    return Math.min(wmax, Math.max(wmin, wmax * v / vmax));
  }

  // Tipos ANTAQ mostrados na camada "Portos e ETCs" (os demais ficam de fora).
  const PORTO_TIPOS = {
    'Porto Organizado': 'Porto Organizado', 'Terminal de uso privado': 'TUP',
    'Estação de transbordo de cargas': 'ETC', 'Porto Público': 'Porto público',
  };
  const portoTipo = t => (t != null && Object.prototype.hasOwnProperty.call(PORTO_TIPOS, t) ? PORTO_TIPOS[t] : null);

  const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  function monthLabel(ym) {
    const m = /^(\d{4})-(\d{2})$/.exec(String(ym));
    return m ? `${MESES[Number(m[2]) - 1]}/${m[1]}` : String(ym);
  }

  // Fundo municipal: produtos PAM (t) e capacidade de armazenagem (t).
  const FUNDOS = [
    { key: 'soja', label: 'Soja', prods: ['soja'] },
    { key: 'milho', label: 'Milho', prods: ['milho1', 'milho2'] },
    { key: 'cana', label: 'Cana', prods: ['cana'] },
    { key: 'algodao', label: 'Algodão', prods: ['algodao'] },
    { key: 'cafe', label: 'Café', prods: ['cafe'] },
    { key: 'trigo', label: 'Trigo', prods: ['trigo'] },
    { key: 'armazenagem', label: 'Armazenagem', prods: null },
  ];
  const PRODUTOS = ['soja', 'milho1', 'milho2', 'cana', 'algodao', 'trigo', 'cafe'];
  const agroOf = intel => (intel && intel.agro && intel.agro.produtos ? intel.agro : null);
  const fundoDef = key => FUNDOS.find(f => f.key === key) || null;

  function fundoFonte(intel, key) {
    const a = agroOf(intel), f = fundoDef(key);
    if (!a || !f) return DASH;
    if (!f.prods) return a.armazenagem ? `IBGE Estoques ${a.armazenagem.periodo}` : DASH;
    return `IBGE PAM ${a.ano}`;
  }

  // Valores por município (ordem de agro.ids); milho soma as duas safras; null se o bloco ou o fundo não existe.
  function fundoValues(intel, key) {
    const a = agroOf(intel), f = fundoDef(key);
    if (!a || !f) return null;
    if (!f.prods) {
      const cap = a.armazenagem && a.armazenagem.cap;
      return cap ? a.ids.map((_, i) => (has(cap[i]) ? cap[i] : null)) : null;
    }
    const arrs = f.prods.map(p => a.produtos[p] || []);
    return a.ids.map((_, i) => arrs.reduce((acc, arr) => sumNullable(acc, arr[i]), null));
  }

  // Classes por quantil sobre valores > 0; zero e sem dado ficam em -1 (sem preenchimento).
  function fundoClasses(values, k = 5) {
    const breaks = quantileBreaks(values, k);
    const cls = new Int8Array(values.length);
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < values.length; i++) {
      const v = values[i];
      cls[i] = has(v) && v > 0 ? classOf(v, breaks) : -1;
      if (cls[i] >= 0) { min = Math.min(min, v); max = Math.max(max, v); }
    }
    return { breaks, cls, min: min === Infinity ? null : min, max: max === -Infinity ? null : max };
  }

  function munInfo(intel, id) {
    const mu = intel && intel.municipios, a = agroOf(intel);
    if (!mu || !mu.ids) return null;
    const i = mu.ids.indexOf(String(id));
    if (i < 0) return null;
    const k = a ? a.ids.indexOf(String(id)) : -1;
    const at = (arr, j) => (arr && j >= 0 && has(arr[j]) ? arr[j] : null);
    const prod = {};
    for (const p of PRODUTOS) prod[p] = a ? at(a.produtos[p], k) : null;
    const arm = a && a.armazenagem;
    return {
      id: String(id), nome: mu.nomes[i], uf: mu.uf[i], ano: a ? a.ano : null, prod,
      cap: arm ? at(arm.cap, k) : null, sigilo: !!(arm && arm.sigilo && k >= 0 && arm.sigilo[k]),
      periodoArm: arm ? arm.periodo : null,
    };
  }

  // Ponto (lat, lng) dentro dos anéis pela regra par-ímpar (buracos excluídos).
  function pointInRings(lat, lng, rings) {
    let inside = false;
    for (const r of rings) {
      for (let a = 0, b = r.length - 1; a < r.length; b = a++) {
        const [ya, xa] = r[a], [yb, xb] = r[b];
        if ((ya > lat) !== (yb > lat) && lng < (xb - xa) * (lat - ya) / (yb - ya) + xa) inside = !inside;
      }
    }
    return inside;
  }

  function ringsBBox(rings) {
    let s = Infinity, w = Infinity, n = -Infinity, e = -Infinity;
    for (const r of rings) for (const [lat, lng] of r) {
      if (lat < s) s = lat; if (lat > n) n = lat; if (lng < w) w = lng; if (lng > e) e = lng;
    }
    return [s, w, n, e];
  }

  // "nome · período" da primeira fonte cujo nome casa com re.
  function fonteRef(fonte, re) {
    const list = Array.isArray(fonte) ? fonte : fonte ? [fonte] : [];
    const f = list.find(x => x && re.test(x.nome || ''));
    return f ? `${f.nome}${f.periodo ? ` · ${f.periodo}` : ''}` : DASH;
  }

  // Escolhe a unidade depois de arredondar: 999.600 t vira "1,0 Mt", não "1.000 mil t".
  const round = (v, d) => Math.round(v * 10 ** d) / 10 ** d;
  function scaled(x, units) {
    if (!has(x)) return DASH;
    const ax = Math.abs(x);
    let i = 0;
    while (i + 1 < units.length && ax >= units[i + 1][0]) i++;
    while (i + 1 < units.length && round(ax / units[i][0], units[i][1]) >= units[i + 1][0] / units[i][0]) i++;
    const [div, d, pre, suf] = units[i];
    return `${pre}${nf(d).format(x / div)}${suf}`;
  }

  const fmtInt = x => (has(x) ? f0.format(x) : DASH);
  const fmtDec = (x, d = 2) => (has(x) ? nf(d).format(x) : DASH);
  const fmtVmd = x => (has(x) ? `${f0.format(x)} veíc./dia` : DASH);
  const fmtT = x => scaled(x, [[1, 0, '', ' t'], [1e3, 0, '', ' mil t'], [1e6, 1, '', ' Mt']]);
  const fmtPct = x => (has(x) ? `${f1.format(x * 100)}%` : DASH);
  const fmtBRL = x => scaled(x, [[1, 0, 'R$ ', ''], [1e6, 1, 'R$ ', ' mi'], [1e9, 2, 'R$ ', ' bi']]);
  const fmtVkm = x => scaled(x, [[1, 0, '', ' veíc·km/dia'], [1e6, 1, '', ' mi veíc·km/dia'], [1e9, 1, '', ' bi veíc·km/dia']]);
  const fmtTkm = x => scaled(x, [[1, 0, '', ' t·km/ano'], [1e6, 1, '', ' mi t·km/ano'], [1e9, 1, '', ' bi t·km/ano'], [1e12, 1, '', ' tri t·km/ano']]);

  return { MODES, has, sumNullable, nAnos, vmdaOf, acidOf, cargaOf,
    rows, metricArray, quantileBreaks, classOf, aggregateIntel, fisIntel, taxaAcidentes, pointsOfFis, decodeTopo,
    rodLabel, decodeLine, pointRadius, lineWeight, PORTO_TIPOS, portoTipo, monthLabel, FUNDOS, PRODUTOS, fundoFonte, fundoValues,
    fundoClasses, munInfo, pointInRings, ringsBBox, fonteRef,
    fmtInt, fmtDec, fmtVmd, fmtT, fmtPct, fmtBRL, fmtVkm, fmtTkm };
})();

if (typeof module !== 'undefined') module.exports = IntelModel;
