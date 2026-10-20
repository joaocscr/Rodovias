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
    fmtInt, fmtDec, fmtVmd, fmtT, fmtPct, fmtBRL, fmtVkm, fmtTkm };
})();

if (typeof module !== 'undefined') module.exports = IntelModel;
