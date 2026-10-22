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
  // VMDa 2025 (v3.1, DNIT, modelado): total e sentidos por físico, total por linha da malha estadual; sem leves/pesados.
  // Só conta como presente com o array fis.t. Sem ele, Tráfego e veíc·km voltam ao VMDa 2023 (leves + pesados).
  const v25Of = intel => (intel && intel.vmda2025 && intel.vmda2025.fis && Array.isArray(intel.vmda2025.fis.t) ? intel.vmda2025 : null);
  // Total do VMDa 2025 (federal e estadual, mesma regra): 0 = sem dado, como no build do bloco (volume zero fica sem valor).
  // Assim um 0 nunca entra no veíc·km nem na cobertura, e no mapa os dois ficam em "Sem dado".
  const v25Total = x => (has(x) && x > 0 ? x : null);
  const vmda23Fonte = intel => { const v = vmdaOf(intel); return v ? `Infra S.A./DNIT, VMDa ${v.ano} (modelado)` : DASH; };
  const vmda23Ref = intel => { const v = vmdaOf(intel); return v ? `VMDa ${v.ano}, modelado` : DASH; };

  // ref: ano e natureza do dado que colore o modo ("VMDa 2025, modelado"), mostrado na legenda.
  const MODES = {
    trafego: {
      label: 'Tráfego', unidade: 'veíc./dia', tipo: 'modelado',
      fonte: intel => { const v = v25Of(intel); return v ? `DNIT, VMDa ${v.ano} (modelado)` : vmda23Fonte(intel); },
      ref: intel => { const v = v25Of(intel); return v ? `VMDa ${v.ano}, modelado` : vmda23Ref(intel); },
    },
    pesados: {
      label: 'Pesados', unidade: 'veíc. pesados/dia', tipo: 'modelado',
      fonte: vmda23Fonte, ref: vmda23Ref,
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
    if (mode === 'trafego' && v25Of(intel)) {
      const t = v25Of(intel).fis.t;
      for (let j = 0; j < nFis; j++) out[j] = v25Total(t[j]);
      return out;
    }
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

  // Registro principal do físico j (o primeiro de `r`; os demais são BRs coincidentes), ou null.
  function fisRec(snv, j) {
    const f = snv && snv.fis && snv.fis[j];
    return f && f.r && snv.trechos ? (snv.trechos[f.r[0]] || null) : null;
  }

  // Superfície do registro principal do físico j ('PAV', 'N_PAV', 'PLA'); sem dicionário = null.
  const I_SUP = 5; // posição de Model.FIELD.superficie no registro de SNV.trechos
  function fisSup(snv, j) {
    const d = snv && snv.dict && snv.dict.superficie, t = fisRec(snv, j);
    return d && t ? (d[t[I_SUP]] ?? null) : null;
  }

  // Situação (texto do SNV, ex.: 'Duplicada') do registro principal do físico j; sem dicionário = null.
  const I_SIT = 4; // posição de Model.FIELD.situacao
  function fisSit(snv, j) {
    const d = snv && snv.dict && snv.dict.situacao, t = fisRec(snv, j);
    return d && t ? (d[t[I_SIT]] ?? null) : null;
  }

  // Volume total do físico j usado no Tráfego e no veíc·km: VMDa 2025 quando o bloco existe (0 = sem dado), senão
  // leves + pesados 2023.
  function volTotal(intel, j) {
    const v = v25Of(intel);
    if (v) return v25Total(v.fis.t[j]);
    const vm = vmdaOf(intel);
    return vm ? sumNullable(vm.l && vm.l[j], vm.p && vm.p[j]) : null;
  }

  // Participação de pesados no VMDa 2023 do físico j (p ÷ (l + p)); null sem pesados ou com total 0.
  function sharePes(vm, j) {
    if (!vm || !vm.p || !has(vm.p[j])) return null;
    const t = sumNullable(vm.l && vm.l[j], vm.p[j]);
    return t > 0 ? vm.p[j] / t : null;
  }

  // Somas da seleção. kmPav = km pavimentados visíveis; kmVmda e kmCarga = desses, os que têm dado (cobertura).
  // veíc·km com o VMDa 2025 quando existe (anoVmda); pesados = volume × participação de pesados 2023 por físico
  // (pesEstimado = true com 2025: estimativa), somados só onde há participação; vkmBasePes = veíc·km desses físicos
  // (a % de pesados da seleção é vkmPes ÷ vkmBasePes).
  function aggregateIntel(intel, snv, visible) {
    const vm = vmdaOf(intel), v25 = v25Of(intel), ac = acidOf(intel), ca = cargaOf(intel);
    const hasTraf = !!(vm || v25), hasCarga = !!ca, hasMortos = !!(ac && ac.m && ac.m.length);
    const r = {
      vkm: hasTraf ? 0 : null, vkmPes: vm ? 0 : null, vkmBasePes: vm ? 0 : null, kmVmda: hasTraf ? 0 : null, kmPav: 0,
      anoVmda: v25 ? v25.ano : vm ? vm.ano : null, pesEstimado: !!(v25 && vm),
      acidAno: ac && ac.n ? 0 : null, mortosAno: hasMortos ? 0 : null,
      tkm: hasCarga ? 0 : null, kmCarga: hasCarga ? 0 : null,
    };
    const anos = nAnos(ac);
    for (let j = 0; j < snv.fis.length; j++) {
      if (!visible[j]) continue;
      const ext = snv.fis[j].ext, pav = fisSup(snv, j) === 'PAV';
      if (pav) r.kmPav += ext;
      if (hasTraf) {
        const tot = volTotal(intel, j);
        if (tot != null) {
          r.vkm += tot * ext;
          if (pav) r.kmVmda += ext;
          const sh = sharePes(vm, j);
          if (sh != null) {
            // sem 2025, os pesados do próprio 2023 (mesma soma de antes, sem arredondar a participação)
            r.vkmPes += (v25 ? tot * sh : vm.p[j]) * ext;
            r.vkmBasePes += tot * ext;
          }
        }
      }
      if (r.acidAno != null && has(ac.n[j])) r.acidAno += ac.n[j] / anos;
      if (hasMortos && has(ac.m[j])) r.mortosAno += ac.m[j] / anos;
      if (hasCarga && has(ca.gsa[j])) { r.tkm += ca.gsa[j] * ext; if (pav) r.kmCarga += ext; }
    }
    return r;
  }

  // Números de um físico para o cartão; mesmas regras de aggregateIntel (null = sem dado).
  // l, p, tot, pctPes e taxa: VMDa 2023 (leves/pesados). t25, c25, d25 (sentidos crescente/decrescente do SNV), ns25
  // (não simulável, uso restrito) e pes25 (= t25 × % de pesados 2023, estimativa): VMDa 2025. vkm usa o volume de
  // aggregateIntel (2025 quando o bloco existe).
  function fisIntel(intel, snv, j) {
    const vm = vmdaOf(intel), v25 = v25Of(intel), ac = acidOf(intel), ca = cargaOf(intel);
    const at = (arr, k) => (arr && has(arr[k]) ? arr[k] : null);
    const l = vm ? at(vm.l, j) : null, p = vm ? at(vm.p, j) : null;
    const tot = sumNullable(l, p);
    const pctPes = p != null && tot > 0 ? p / tot : null;
    const t25 = v25 ? v25Total(v25.fis.t[j]) : null;
    const vol = volTotal(intel, j);
    const anos = nAnos(ac);
    const n = ac ? at(ac.n, j) : null, m = ac ? at(ac.m, j) : null, ext = snv.fis[j].ext;
    return {
      l, p, tot, pctPes,
      acidAno: n == null ? null : n / anos,
      mortosAno: m == null ? null : m / anos,
      taxa: taxaAcidentes(n, anos, tot, ext),
      gsa: ca ? at(ca.gsa, j) : null,
      vkm: vol == null || !has(ext) ? null : vol * ext,
      acidKmAno: n == null || !(ext > 0) ? null : n / anos / ext,
      cargaTotal: ca ? at(ca.total, j) : null,
      t25,
      c25: t25 != null ? at(v25.fis.c, j) : null,
      d25: t25 != null ? at(v25.fis.d, j) : null,
      ns25: t25 != null && !!(v25.fis.ns && v25.fis.ns[j]),
      pes25: t25 != null && pctPes != null ? t25 * pctPes : null,
      ano25: v25 ? v25.ano : null,
    };
  }

  // VMDa 2025 das linhas da malha estadual, na ordem de estaduais.malha: {ano, t, ns, ext}; null sem um dos blocos
  // ou com tamanhos diferentes (o total vale por posição). t: 0 = sem dado, como na malha federal (v25Total).
  function estTrafego(intel) {
    const v = intel && intel.vmda2025, e = v && v.estaduais, m = intel && intel.estaduais && intel.estaduais.malha;
    if (!e || !Array.isArray(e.t) || !m || !Array.isArray(m.p) || e.t.length !== m.p.length) return null;
    const iExt = Array.isArray(m.campos) ? m.campos.indexOf('ext') : -1, linhas = Array.isArray(m.linhas) ? m.linhas : [];
    return {
      ano: v.ano,
      t: e.t.map(v25Total),
      ns: e.t.map((_, i) => (Array.isArray(e.ns) && e.ns[i] ? 1 : 0)),
      ext: e.t.map((_, i) => (iExt >= 0 && linhas[i] && has(linhas[i][iExt]) ? linhas[i][iExt] : null)),
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

  // Geometria de cada concessão estadual ([[lat, lng], ...] por linha): feições da malha estadual (entEst),
  // trechos físicos do SNV (entFis, ex.: partes RSC/BR) e traçado próprio (entGeo). Índices inválidos são ignorados.
  // Decodificado uma vez por bloco e SNV (o mapa, a seleção e a ficha usam o mesmo resultado).
  const estMemo = new WeakMap();
  function estConcLines(est, snvData) {
    if (!est || !Array.isArray(est.entidades)) return [];
    const c = estMemo.get(est);
    if (c && c.snv === snvData) return c.lines;
    const lines = decodeEstConc(est, snvData);
    estMemo.set(est, { snv: snvData, lines });
    return lines;
  }

  function decodeEstConc(est, snvData) {
    const malha = (est.malha && est.malha.p) || [], fis = (snvData && snvData.fis) || [];
    const ok = l => l.length >= 2;
    return est.entidades.map((_, k) => {
      const out = [];
      for (const ix of (est.entEst && est.entEst[k]) || []) if (malha[ix]) { const l = decodeLine(malha[ix]); if (ok(l)) out.push(l); }
      for (const j of (est.entFis && est.entFis[k]) || []) if (fis[j] && fis[j].p) { const l = decodeLine(fis[j].p); if (ok(l)) out.push(l); }
      for (const p of (est.entGeo && est.entGeo[k]) || []) { const l = decodeLine(p); if (ok(l)) out.push(l); }
      return out;
    });
  }

  // Distância do ponto (px, py) ao segmento a–b, nas mesmas unidades (pixels de tela).
  function distToSegment(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
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

  // Tipos ANTAQ mostrados na camada "Portos e ETCs" (os demais ficam de fora), com o rótulo em português da interface:
  // por extenso, sigla entre parênteses quando o setor a usa. PORTO_FORMA: marcador no mapa (portos organizados e públicos
  // em quadrado; terminais e estações em círculo).
  const PORTO_TIPOS = {
    'Porto Organizado': 'Porto organizado', 'Porto Público': 'Porto público',
    'Terminal de uso privado': 'Terminal de uso privado (TUP)', 'Estação de transbordo de cargas': 'Estação de transbordo de cargas (ETC)',
  };
  const PORTO_FORMA = {
    'Porto Organizado': 'quadrado', 'Porto Público': 'quadrado', 'Terminal de uso privado': 'circulo', 'Estação de transbordo de cargas': 'circulo',
  };
  const portoTipo = t => (t != null && Object.prototype.hasOwnProperty.call(PORTO_TIPOS, t) ? PORTO_TIPOS[t] : null);

  const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  function monthLabel(ym) {
    const m = /^(\d{4})-(\d{2})$/.exec(String(ym));
    return m ? `${MESES[Number(m[2]) - 1]}/${m[1]}` : String(ym);
  }
  // Eixo x mensal dos gráficos de linha: "AAAA-MM" <-> ano + (mês - 1)/12; fmtMesX rotula o x como "mmm/aaaa".
  const mesX = ym => { const [y, m] = String(ym).split('-').map(Number); return y + (m - 1) / 12; };
  const xMes = x => { const y = Math.floor(x + 1e-6); return `${y}-${String(Math.round((x - y) * 12) + 1).padStart(2, '0')}`; };
  const fmtMesX = x => monthLabel(xMes(x));
  // [2024, 2025] -> "2024–25"; um ano só -> "2024"; vazio -> "".
  function anosLabel(anos) {
    if (!Array.isArray(anos) || !anos.length) return '';
    const a = Math.min(...anos), b = Math.max(...anos);
    return a === b ? String(a) : `${a}–${String(b).slice(-2)}`;
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

  // ---------- Rotas de Integração Sul-Americana (v3.1, MPO; traçado esquemático) ----------
  const ROTA_TIPOS = ['rota', 'hidrovia', 'cabotagem', 'pavimentacao', 'estudo'];
  const rotasOf = intel => (intel && intel.rotas && Array.isArray(intel.rotas.rotas) && intel.rotas.rotas.length
    && Array.isArray(intel.rotas.linhas) ? intel.rotas : null);
  const rotaTitulo = r => (r ? `Rota ${r.n} · ${r.nome}` : DASH);

  // Linhas do bloco decodificadas uma vez: [{rota: 'r1' | null, tipo, ll: [[lat, lng], ...]}], sem tipos desconhecidos
  // nem linhas com menos de 2 pontos.
  const rotasMemo = new WeakMap();
  function rotaLinhas(rotas) {
    if (!rotas || !Array.isArray(rotas.linhas)) return [];
    if (!rotasMemo.has(rotas)) {
      rotasMemo.set(rotas, rotas.linhas.filter(l => l && ROTA_TIPOS.includes(l.tipo))
        .map(l => ({ rota: l.rota || null, tipo: l.tipo, ll: decodeLine(l.p) })).filter(l => l.ll.length >= 2));
    }
    return rotasMemo.get(rotas);
  }

  // Anéis de cada país vizinho (um anel externo por parte), [[lat, lng], ...].
  const paisAneis = p => ((p && p.p) || []).map(decodeLine).filter(r => r.length >= 3);

  // Caixa [[s, w], [n, e]] dos países vizinhos e das linhas das rotas (até onde o mapa pode ir); null sem dado.
  // Com soLinhas, só as linhas das rotas (o enquadramento ao ligar a camada: a Patagônia fica de fora, como no mapa do MPO).
  function rotasBounds(rotas, soLinhas = false) {
    if (!rotas) return null;
    const rings = [...(soLinhas ? [] : (rotas.paises || []).flatMap(paisAneis)), ...rotaLinhas(rotas).map(l => l.ll)];
    const [s, w, n, e] = ringsBBox(rings);
    return s === Infinity ? null : [[s, w], [n, e]];
  }

  // Nota da camada com o mês da apresentação do MPO: "Traçado esquemático · fonte MPO, jul/2026".
  function rotasNota(rotas) {
    const f = rotas && (Array.isArray(rotas.fonte) ? rotas.fonte : [rotas.fonte]).find(x => x && /Apresentação/.test(x.nome || ''));
    const m = f && /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(f.periodo || ''));
    return `Traçado esquemático · fonte MPO${m ? `, ${monthLabel(`${m[3]}-${m[2]}`)}` : ''}`;
  }

  // Âncora do rótulo direto de uma rota: o vértice mais extremo das linhas no lado pedido ('n', 's', 'e', 'w' ou diagonal
  // 'nw', 'ne', 'sw', 'se', em graus somados), para o rótulo sair para fora do traçado (mar ou borda do continente). [lat, lng] ou null.
  const LADOS = {
    n: ([lat]) => lat, s: ([lat]) => -lat, e: ([, lng]) => lng, w: ([, lng]) => -lng,
    nw: ([lat, lng]) => lat - lng, ne: ([lat, lng]) => lat + lng, sw: ([lat, lng]) => -lat - lng, se: ([lat, lng]) => lng - lat,
  };
  function rotaLabelAnchor(lines, side = 'w') {
    const score = Object.prototype.hasOwnProperty.call(LADOS, side) ? LADOS[side] : null;
    if (!score) return null;
    let best = null;
    for (const l of lines || []) for (const pt of l) if (!best || score(pt) > score(best)) best = pt;
    return best ? [best[0], best[1]] : null;
  }

  // Posição do rótulo de um país fora das linhas das rotas e dos rótulos já colocados. O rótulo é uma caixa de meia-largura hw e
  // meia-altura hh (graus); `ocupados` são as caixas dos rótulos vizinhos já colocados ({lat, lng, hw, hh}; ex.: SR antes de GF),
  // comparadas com `caixa` ({hw, hh}; padrão, a mesma hw × hh), que pode ser maior para valer também em zoom menor.
  // Se a caixa no polo de inacessibilidade (p.label) não toca nenhuma linha nem rótulo, fica ali; senão, procura numa grade de
  // passo `passo` dentro do país o ponto livre mais próximo do original; sem ponto livre, o de maior folga. [lat, lng] ou null.
  function paisLabelPoint(p, lines, { hw = 3, hh = 0.9, passo = 0.25, ocupados = [], caixa = { hw, hh } } = {}) {
    if (!p || !Array.isArray(p.label)) return null;
    const rings = paisAneis(p), orig = [p.label[1], p.label[0]];
    const [s, w, n, e] = ringsBBox(rings);
    if (!Number.isFinite(s)) return orig;
    // segmentos perto do país, em coordenadas escaladas pela caixa (folga >= 1 = caixa livre)
    const segs = [];
    for (const l of lines || []) {
      for (let k = 1; k < l.length; k++) {
        const [ay, ax] = l[k - 1], [by, bx] = l[k];
        if (Math.max(ay, by) < s - hh || Math.min(ay, by) > n + hh || Math.max(ax, bx) < w - hw || Math.min(ax, bx) > e + hw) continue;
        segs.push([ax / hw, ay / hh, bx / hw, by / hh]);
      }
    }
    // folga (>= 1 = caixa livre): a menor entre a das linhas e a dos rótulos já colocados; a de um rótulo é a separação no eixo
    // mais afastado, em unidades da soma das meias-caixas (contínua, para que, sem ponto livre, o escolhido fique o mais longe possível)
    const folga = (lat, lng) => {
      let m = Infinity;
      for (const o of ocupados) m = Math.min(m, Math.max(Math.abs(lng - o.lng) / (caixa.hw + o.hw), Math.abs(lat - o.lat) / (caixa.hh + o.hh)));
      const x = lng / hw, y = lat / hh;
      for (const g of segs) { const d = distToSegment(x, y, g[0], g[1], g[2], g[3]); if (d < m) m = d; }
      return m;
    };
    if (folga(orig[0], orig[1]) >= 1) return orig;
    // anéis quadrados crescentes em volta do original: o 1º ponto livre (e dentro do país) é o mais próximo, a menos de um passo
    let best = null, bf = -1;
    const maxK = Math.ceil(Math.max(n - s, e - w) / passo);
    for (let k = 1; k <= maxK; k++) {
      let achou = null, ad = Infinity;
      for (let i = -k; i <= k; i++) {
        for (const [di, dj] of [[i, -k], [i, k], [-k, i], [k, i]]) {
          const lat = orig[0] + di * passo, lng = orig[1] + dj * passo;
          if (lat < s || lat > n || lng < w || lng > e) continue;
          const f = folga(lat, lng);
          if (f < 1 && f <= bf) continue;
          if (!pointInRings(lat, lng, rings)) continue;
          if (f >= 1) { const d = Math.hypot(di, dj); if (d < ad) { ad = d; achou = [lat, lng]; } } else { bf = f; best = [lat, lng]; }
        }
      }
      if (achou) { best = achou; break; }
    }
    return best ? [Math.round(best[0] * 1e3) / 1e3, Math.round(best[1] * 1e3) / 1e3] : orig;
  }

  // Rótulo do país no mapa: o nome quando o país tem pelo menos minLarg graus de largura; senão a sigla ISO (Guianas, Uruguai).
  function paisLabel(p, minLarg = 5) {
    if (!p) return DASH;
    const [, w, , e] = ringsBBox(paisAneis(p));
    return Number.isFinite(w) && e - w >= minLarg ? p.nome : (p.iso || p.nome);
  }

  // ---------- Ficha com ANTT, ficha estadual, Projetos com esfera e pipeline (Task 11) ----------
  const anttOf = intel => (intel && intel.antt) || null;
  const capasOf = intel => (anttOf(intel) && anttOf(intel).capas) || {};

  function anttCapa(intel, id) {
    const c = capasOf(intel)[id];
    return c ? Object.assign({ id }, c) : null;
  }

  // Contratos encerrados que passaram o trecho para id (sucessor === id ou sucessores contém id).
  function anttAnteriores(intel, id) {
    return Object.entries(capasOf(intel))
      .filter(([k, c]) => k !== id && c && (c.sucessor === id || (Array.isArray(c.sucessores) && c.sucessores.includes(id))))
      .map(([k, c]) => Object.assign({ id: k }, c));
  }

  // Séries anuais (R$ nominais) do contrato e de cada contrato anterior; só as que têm ao menos um valor.
  function anttSeries(intel, id) {
    const series = (anttOf(intel) && anttOf(intel).series) || {};
    const own = anttCapa(intel, id);
    const list = [{ id, nome: own ? own.nome : null, anterior: false }]
      .concat(anttAnteriores(intel, id).map(c => ({ id: c.id, nome: c.nome, anterior: true })));
    return list.filter(x => series[x.id]).map(x => {
      const s = series[x.id];
      return Object.assign(x, { anos: s.anos || [], receita: s.receita || [], investimento: s.investimento || [], custo: s.custo || [] });
    }).filter(x => ['receita', 'investimento', 'custo'].some(k => x[k].some(has)));
  }

  function pracasDe(intel, id) {
    const linhas = rows(anttOf(intel) && anttOf(intel).pracas).filter(p => p.ent === id)
      .map(p => Object.assign(p, { pctPes: has(p.pesados) && has(p.vmd) && p.vmd > 0 ? p.pesados / p.vmd : null }))
      .sort((a, b) => (has(b.vmd) ? b.vmd : -1) - (has(a.vmd) ? a.vmd : -1));
    const rec = linhas.filter(p => has(p.receita));
    return { linhas, receita: rec.length ? rec.reduce((s, p) => s + p.receita, 0) : null };
  }

  // Obras ANTT da entidade: concluídas (executado ≥ 1), em andamento (0 < executado < 1), não iniciadas (0), sem dado;
  // top = as n de maior previsto ainda não concluídas.
  function obrasResumo(intel, id, n = 10) {
    const list = rows(anttOf(intel) && anttOf(intel).obras).filter(o => o.ent === id);
    const r = { total: list.length, concluidas: 0, andamento: 0, naoIniciadas: 0, semDado: 0, top: [] };
    for (const o of list) {
      if (!has(o.executado)) r.semDado++;
      else if (o.executado >= 1) r.concluidas++;
      else if (o.executado > 0) r.andamento++;
      else r.naoIniciadas++;
    }
    r.top = list.filter(o => !(has(o.executado) && o.executado >= 1))
      .sort((a, b) => (has(b.previsto) ? b.previsto : -1) - (has(a.previsto) ? a.previsto : -1)).slice(0, n);
    return r;
  }

  const pipeOf = intel => (intel && intel.pipeline && Array.isArray(intel.pipeline.itens) ? intel.pipeline : null);

  // Itens do pipeline por data prevista crescente ("AAAA-MM" ou "AAAA-MM-DD"); sem data no fim; empate pelo nome.
  function pipelineRows(intel) {
    const p = pipeOf(intel);
    if (!p) return [];
    return [...p.itens].sort((a, b) => {
      const x = a.data_prevista || '', y = b.data_prevista || '';
      if (!x || !y) return x === y ? String(a.nome).localeCompare(String(b.nome), 'pt-BR') : x ? -1 : 1;
      return x < y ? -1 : x > y ? 1 : String(a.nome).localeCompare(String(b.nome), 'pt-BR');
    });
  }

  function filterPipeline(items, { esfera, status } = {}) {
    return items.filter(i => (!esfera || !esfera.size || esfera.has(i.esfera)) && (!status || !status.size || status.has(i.status)));
  }

  // Contagem por status, na ordem de pipeline.status; só status presentes.
  function pipelineCounts(items, statusList) {
    const n = new Map();
    for (const i of items) n.set(i.status, (n.get(i.status) || 0) + 1);
    const known = (statusList || []).filter(s => n.has(s.key)).map(s => ({ key: s.key, label: s.label, n: n.get(s.key) }));
    const extra = [...n.keys()].filter(k => !(statusList || []).some(s => s.key === k)).map(k => ({ key: k, label: String(k), n: n.get(k) }));
    return known.concat(extra);
  }

  function statusLabel(intel, key) {
    if (key == null || key === '') return DASH;
    const p = pipeOf(intel), s = p && (p.status || []).find(x => x.key === key);
    return s ? s.label : String(key);
  }

  const pipelineDe = (intel, id) => pipelineRows(intel).filter(i => i.ent === id);

  // ---------- Linha do tempo de editais e leilões (Pipeline, aba Projetos) ----------
  // Leilões do ano `desde` em diante (padrão: o ano corrente, no relógio de quem abre o arquivo). Datas "AAAA-MM-DD" ou
  // "AAAA-MM" (mês sem dia); ano sozinho ou texto não são datas.
  // No pipeline, data_prevista é a data do leilão, salvo nestes status (aí é a assinatura do contrato).
  const TL_STATUS_ASSINATURA = new Set(['leiloado', 'contrato']);
  const tlData = s => {
    const m = typeof s === 'string' && /^(\d{4})-(\d{2})(-(\d{2}))?$/.exec(s);
    if (!m || +m[2] < 1 || +m[2] > 12 || (m[4] && (+m[4] < 1 || +m[4] > 31))) return null;
    return s;
  };
  // Dia usado para ordenar; mês sem dia = meio do mês (como é desenhado).
  const tlChave = s => (s.length === 7 ? `${s}-15` : s);
  const tlAno = s => +s.slice(0, 4);

  // Linhas da linha do tempo + o que ficou de fora. Leilão: da entidade (ficha), senão do cronograma, senão a data prevista do
  // pipeline (itens sem ficha, como os estaduais). Edital: da entidade, senão do cronograma. Sem data de leilão: fora e contado
  // em semData; leilão anterior a `desde`: fora do recorte (não conta).
  function linhaDoTempoResumo(conc, pipeline, desde = new Date().getFullYear()) {
    const itens = Array.isArray(pipeline) ? pipeline : pipeline && Array.isArray(pipeline.itens) ? pipeline.itens : [];
    const ents = new Map((conc && Array.isArray(conc.entidades) ? conc.entidades : []).map(e => [e.id, e]));
    const out = [];
    let semData = 0;
    for (const i of itens) {
      const e = i.ent ? ents.get(i.ent) : null;
      const marco = nome => {
        const m = e && Array.isArray(e.cronograma) ? e.cronograma.find(x => x && x.marco === nome) : null;
        return m ? tlData(m.data) : null;
      };
      const leilao = tlData(e && e.leilao) || marco('Leilão') || (TL_STATUS_ASSINATURA.has(i.status) ? null : tlData(i.data_prevista));
      if (!leilao) { semData++; continue; }
      if (tlAno(leilao) < desde) continue;
      out.push({ nome: i.nome, id: i.id, ent: i.ent || null, edital: tlData(e && e.edital) || marco('Edital'), leilao, status: i.status,
        verificado: i.verificado !== false }); // false: item só de imprensa (não oficial)
    }
    out.sort((a, b) => (tlChave(a.leilao) < tlChave(b.leilao) ? -1 : tlChave(a.leilao) > tlChave(b.leilao) ? 1
      : String(a.nome).localeCompare(String(b.nome), 'pt-BR')));
    const anosL = out.map(r => tlAno(r.leilao)), anosTodos = anosL.concat(out.filter(r => r.edital).map(r => tlAno(r.edital)));
    return { rows: out, semData,
      anos: out.length ? { de: Math.min(...anosL), ate: Math.max(...anosL) } : null,
      de: out.length ? Math.min(...anosTodos) : null, ate: out.length ? Math.max(...anosTodos) : null };
  }
  const linhaDoTempo = (conc, pipeline, desde) => linhaDoTempoResumo(conc, pipeline, desde).rows;

  // Qualidade do recorte de concessão estadual: o mesmo rótulo no cartão do mapa e na ficha.
  const QUALIDADE_RECORTE = { ok: 'Recorte ok', aproximado: 'Recorte aproximado', nao_mapeado: 'Não mapeado' };
  const qualidadeRecorte = q => (q == null || q === '' ? DASH : QUALIDADE_RECORTE[q] || String(q));

  const EST_ESTADOS = [{ key: 'estadual_vigente', label: 'Contrato estadual vigente' }, { key: 'estadual_encerrado', label: 'Contrato estadual encerrado' }];
  const estEnts = intel => (intel && intel.estaduais && Array.isArray(intel.estaduais.entidades) ? intel.estaduais.entidades : []);

  // Concessões estaduais no formato de ConcModel.comparatorRows (campos sem equivalente = null).
  function estaduaisRows(intel) {
    return estEnts(intel).map((e, k) => {
      const rod = (e.rodovias || []).filter(Boolean);
      return {
        idx: null, k, esfera: 'estadual', id: e.id, nome: e.nome, brsUfs: rod.length ? `${rod.join('/')}/${e.uf || ''}`.replace(/\/$/, '') : (e.uf || null),
        estado: e.estado === 'encerrado' ? 'estadual_encerrado' : 'estadual_vigente', dataChave: e.assinatura || null,
        km: has(e.km_decl) ? e.km_decl : null, capex: has(e.capex_bi) ? e.capex_bi : null, opex: null, dataBase: e.capex_ref || null,
        capexKm: null, wacc: null, tkm: null, desagio: null, participantes: null, vencedor: e.grupo || null,
        ano: null, tipo: null, ufs: e.uf ? [e.uf] : [], ficha: {},
      };
    });
  }

  const byEsfera = (list, esfera) => (!esfera || !esfera.size ? list : list.filter(r => esfera.has(r.esfera)));
  const estIndex = (intel, id) => estEnts(intel).findIndex(e => e.id === id);

  function trechosLabel(trechos) {
    if (!Array.isArray(trechos)) return [];
    return trechos.filter(t => t && t.rod).map(t => (has(t.km_i) && has(t.km_f) ? `${t.rod}: km ${f1.format(t.km_i)} a ${f1.format(t.km_f)}` : t.rod));
  }

  // ---------- Abas Tráfego, Cargas e Fontes (Task 12) ----------
  // Campos do registro de SNV.trechos usados aqui (mesmas posições de Model.FIELD / Model.T).
  const SNV_I = { br: 1, uf: 2, locIni: 12, locFim: 13 };
  const mainRec = (snv, j) => snv.trechos[snv.fis[j].r[0]];
  const fisUf = (snv, j) => snv.dict.uf[mainRec(snv, j)[SNV_I.uf]];
  const fisBr = (snv, j) => `BR-${snv.dict.br[mainRec(snv, j)[SNV_I.br]]}`;
  const sumOf = arr => { let s = null; for (const v of arr || []) if (has(v)) s = (s || 0) + v; return s; };
  const desc = key => (a, b) => b[key] - a[key];

  // "nome · período · medido|modelado|cadastro" da fonte do bloco que casa com re (tipo da própria fonte, senão o do bloco,
  // senão tipoPadrao).
  function fonteTipo(block, re, tipoPadrao = null) {
    const list = block && block.fonte ? (Array.isArray(block.fonte) ? block.fonte : [block.fonte]) : [];
    const f = list.find(x => x && re.test(x.nome || ''));
    if (!f) return DASH;
    const ok = t => t === 'medido' || t === 'modelado' || t === 'cadastro';
    const tipo = ok(f.tipo) ? f.tipo : ok(block.tipo) ? block.tipo : ok(tipoPadrao) ? tipoPadrao : null;
    return `${f.nome}${f.periodo ? ` · ${fmtPeriodo(f.periodo)}` : ''}${tipo ? ` · ${tipo}` : ''}`;
  }

  // Período de fonte em pt-BR. Intervalo ISO "início/fim" (cada lado AAAA-MM ou AAAA-MM-DD) vira "início a fim"; "AAAA-AAAA-MM"
  // (ano até um mês) vira "AAAA a mmm/aaaa"; "AAAA-MM-DD" vira dd/mm/aaaa; "AAAA-MM" (mês válido, isolado) vira "mmm/aaaa".
  // Anos ("2010-2025"), safras ("2024/2025") e datas já em dd/mm/aaaa ficam como estão.
  const ISO_MES = '\\d{4}-(?:0[1-9]|1[0-2])', ISO_DIA = `${ISO_MES}-(?:0[1-9]|[12]\\d|3[01])`;
  const RE_INTERVALO = new RegExp(`\\b(${ISO_DIA}|${ISO_MES})/(${ISO_DIA}|${ISO_MES})\\b`, 'g');
  function fmtPeriodo(p) {
    if (p == null || p === '') return DASH;
    return String(p)
      .replace(RE_INTERVALO, '$1 a $2')
      .replace(new RegExp(`\\b(\\d{4})-(${ISO_MES})\\b(?!-)`, 'g'), '$1 a $2')
      .replace(/\b(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b(?!-)/g, (_, y, m, d) => `${d}/${m}/${y}`)
      .replace(/\b(\d{4})-(0[1-9]|1[0-2])\b(?!-)/g, (_, y, m) => monthLabel(`${y}-${m}`));
  }

  // t -> Mt com 2 casas; valor positivo que arredondaria para 0,00 vira "< 0,01".
  const fmtMt = t => (!has(t) ? DASH : t > 0 && t < 5000 ? '< 0,01' : nf(2).format(t / 1e6));

  const pracasRows = intel => rows(anttOf(intel) && anttOf(intel).pracas).map((p, i) => Object.assign(p, { i }));

  // Ano do VMD e da receita das praças (antt.pracas.ano); rótulos da interface usam este ano, nunca um digitado.
  const anoPracas = intel => { const p = anttOf(intel) && anttOf(intel).pracas; return p && Number.isFinite(p.ano) ? p.ano : null; };
  // Documentos do MPO nas fontes do bloco rotas: data da apresentação (traçado) e anos dos relatórios (descrições).
  function rotasDocs(rotas) {
    const f = (rotas && Array.isArray(rotas.fonte)) ? rotas.fonte : [];
    const ap = f.find(x => /Apresentação/.test(x.nome || ''));
    return { apresentacao: (ap && ap.periodo) || null,
      relatorios: f.filter(x => /Relatório/.test(x.nome || '') && x.periodo).map(x => String(x.periodo)).sort() };
  }
  // "VMD 2025" com o ano; sem ano, só "VMD".
  const comAno = (txt, ano) => (ano != null ? `${txt} ${ano}` : txt);

  // KPIs da aba Tráfego: praças com contagem no ano das praças (VMD > 0), VMD somado, % pesados ponderado pelo VMD,
  // veíc·km/dia do VMDa em toda a malha federal (anoVkm: 2025 ou, sem o bloco, 2023), veíc·km/dia 2025 da malha estadual
  // (Σ total × extensão; kmEst = km com estimativa de kmEstTotal) e médias anuais da PRF. Bloco ausente = null.
  function trafegoKpis(intel, snv) {
    const pr = anttOf(intel) && anttOf(intel).pracas ? pracasRows(intel) : null;
    const ag = aggregateIntel(intel, snv, new Uint8Array(snv.fis.length).fill(1));
    let nPracas = null, vmdTotal = null, pctPes = null;
    if (pr) {
      const comVmd = pr.filter(p => has(p.vmd) && p.vmd > 0);
      nPracas = comVmd.length;
      vmdTotal = comVmd.length ? comVmd.reduce((s, p) => s + p.vmd, 0) : null;
      const comPes = comVmd.filter(p => has(p.pesados));
      const base = comPes.reduce((s, p) => s + p.vmd, 0);
      pctPes = base > 0 ? comPes.reduce((s, p) => s + p.pesados, 0) / base : null;
    }
    const est = estTrafego(intel);
    let vkmEst = null, kmEst = null, kmEstTotal = null;
    if (est) {
      vkmEst = 0; kmEst = 0; kmEstTotal = 0;
      est.t.forEach((t, i) => {
        const ext = est.ext[i];
        if (!has(ext)) return;
        kmEstTotal += ext;
        if (t != null) { vkmEst += t * ext; kmEst += ext; }
      });
    }
    return { nPracas, vmdTotal, pctPes, vkm: ag.vkm, anoVkm: ag.anoVmda, vkmEst, kmEst, kmEstTotal, acidAno: ag.acidAno, mortosAno: ag.mortosAno };
  }

  const pracasRanking = (intel, n = 20) => pracasRows(intel).filter(p => has(p.vmd) && p.vmd > 0).sort(desc('vmd')).slice(0, n);

  // Série mensal somada só das praças com todos os meses de leves e pesados (painel balanceado).
  // keep (opcional): filtro sobre as praças (objeto de pracasRows, com i), ex.: as de uma concessão; total = praças do filtro.
  function pracasSerie(intel, keep = null) {
    const p = anttOf(intel) && anttOf(intel).pracas;
    if (!p || !Array.isArray(p.serie_meses) || !p.serie_meses.length || !p.serie_l || !p.serie_p) return null;
    const nm = p.serie_meses.length, full = arr => Array.isArray(arr) && arr.length === nm && arr.every(has);
    const sel = keep ? pracasRows(intel).filter(keep).map(r => r.i) : p.serie_l.map((_, i) => i);
    const idx = sel.filter(i => full(p.serie_l[i]) && full(p.serie_p[i]));
    const l = p.serie_meses.map((_, k) => idx.reduce((s, i) => s + p.serie_l[i][k], 0));
    const pe = p.serie_meses.map((_, k) => idx.reduce((s, i) => s + p.serie_p[i][k], 0));
    return { meses: p.serie_meses.slice(), l, p: pe, n: idx.length, total: sel.length };
  }

  // Perfil sazonal: média do índice por mês do calendário (jan..dez).
  function abcrSazonal(abcr, key = 'total') {
    if (!abcr || !Array.isArray(abcr.meses) || !Array.isArray(abcr[key])) return null;
    const s = new Array(12).fill(0), c = new Array(12).fill(0);
    abcr.meses.forEach((ym, k) => {
      const m = /^\d{4}-(\d{2})$/.exec(String(ym)), v = abcr[key][k];
      if (m && has(v)) { s[Number(m[1]) - 1] += v; c[Number(m[1]) - 1]++; }
    });
    return s.map((v, i) => (c[i] ? v / c[i] : null));
  }

  // Acidentes e mortos por ano agregados à UF do registro principal de cada físico.
  function acidentesPorUf(intel, snv) {
    const ac = acidOf(intel);
    if (!ac || !ac.n) return [];
    const anos = nAnos(ac), by = new Map();
    for (let j = 0; j < snv.fis.length; j++) {
      const uf = fisUf(snv, j), o = by.get(uf) || { uf, acidAno: 0, mortosAno: 0 };
      if (has(ac.n[j])) o.acidAno += ac.n[j] / anos;
      if (ac.m && has(ac.m[j])) o.mortosAno += ac.m[j] / anos;
      by.set(uf, o);
    }
    return [...by.values()].filter(o => o.acidAno > 0 || o.mortosAno > 0).sort(desc('acidAno'));
  }

  // Taxa por BR/UF: Σ acidentes/ano ÷ (Σ VMDa × ext × 365) × 10⁶, só físicos com VMDa, fora os planejados (PLA),
  // e grupos com ≥ minKm.
  function taxaPorBrUf(intel, snv, { minKm = 10, n = 15 } = {}) {
    const ac = acidOf(intel), vm = vmdaOf(intel);
    if (!ac || !ac.n || !vm) return [];
    const anos = nAnos(ac), by = new Map();
    for (let j = 0; j < snv.fis.length; j++) {
      const tot = sumNullable(vm.l && vm.l[j], vm.p && vm.p[j]), ext = snv.fis[j].ext;
      if (!(tot > 0) || !(ext > 0) || fisSup(snv, j) === 'PLA') continue;
      const br = fisBr(snv, j), uf = fisUf(snv, j), key = `${br}/${uf}`;
      const o = by.get(key) || { br, uf, km: 0, nTot: 0, vkm: 0 };
      o.km += ext; o.vkm += tot * ext;
      if (has(ac.n[j])) o.nTot += ac.n[j];
      by.set(key, o);
    }
    return [...by.values()].filter(o => o.km >= minKm)
      .map(o => ({ br: o.br, uf: o.uf, km: o.km, acidAno: o.nTot / anos, vkm: o.vkm, taxa: taxaAcidentes(o.nTot, anos, o.vkm, 1) }))
      .sort(desc('taxa')).slice(0, n);
  }

  const expOf = intel => (intel && intel.multimodal && intel.multimodal.exportacao && intel.multimodal.exportacao.linhas ? intel.multimodal.exportacao : null);
  const expRows = (intel, sh4) => rows(expOf(intel)).filter(r => (sh4 == null || String(r.sh4) === String(sh4)) && has(r.kg));

  function cargasKpis(intel) {
    const a = agroOf(intel), pr = k => (a ? sumOf(a.produtos[k]) : null);
    const milho = a ? sumNullable(pr('milho1'), pr('milho2')) : null;
    const exp = sh4 => { const l = expRows(intel, sh4); return l.length ? l.reduce((s, r) => s + r.kg, 0) / 1000 : null; };
    return { soja: pr('soja'), milho, cana: pr('cana'), cap: a && a.armazenagem ? sumOf(a.armazenagem.cap) : null,
      expSoja: expOf(intel) ? exp('1201') : null, expMilho: expOf(intel) ? exp('1005') : null };
  }

  function producaoPorUf(intel) {
    const a = agroOf(intel), mu = intel && intel.municipios;
    if (!a || !mu || !mu.ids) return [];
    const ufOf = new Map(mu.ids.map((id, i) => [String(id), mu.uf[i]])), by = new Map();
    a.ids.forEach((id, k) => {
      const uf = ufOf.get(String(id));
      if (!uf) return;
      const o = by.get(uf) || { uf, soja: 0, milho1: 0, milho2: 0 };
      for (const p of ['soja', 'milho1', 'milho2']) { const v = (a.produtos[p] || [])[k]; if (has(v)) o[p] += v; }
      by.set(uf, o);
    });
    return [...by.values()].sort((x, y) => (y.soja + y.milho1 + y.milho2) - (x.soja + x.milho1 + x.milho2));
  }

  // Maiores municípios de um produto (k = posição em municipios.ids).
  function topMunicipios(intel, prod, n = 20) {
    const a = agroOf(intel), mu = intel && intel.municipios;
    if (!a || !mu || !mu.ids) return [];
    const kOf = new Map(mu.ids.map((id, i) => [String(id), i])), vals = fundoValues(intel, prod) || [];
    const out = [];
    a.ids.forEach((id, i) => {
      const k = kOf.get(String(id)), v = vals[i];
      if (k != null && has(v) && v > 0) out.push({ k, id: String(id), nome: mu.nomes[k], uf: mu.uf[k], v });
    });
    return out.sort(desc('v')).slice(0, n);
  }

  // Produtos SH4 com exportação, maior volume primeiro (t).
  function exportProdutos(intel) {
    const e = expOf(intel);
    if (!e) return [];
    const by = new Map();
    for (const r of expRows(intel)) by.set(String(r.sh4), (by.get(String(r.sh4)) || 0) + r.kg / 1000);
    return [...by.entries()].map(([sh4, t]) => ({ sh4, nome: (e.sh4 && e.sh4[sh4]) || sh4, t })).sort(desc('t'));
  }

  const sumBy = (list, key) => {
    const by = new Map();
    for (const r of list) by.set(r[key], (by.get(r[key]) || 0) + r.kg / 1000);
    return [...by.entries()].sort((a, b) => b[1] - a[1]);
  };

  const exportPorUrf = (intel, sh4, n = 12) => sumBy(expRows(intel, sh4), 'urf').slice(0, n).map(([urf, t]) => ({ urf, t }));

  // Matriz das nUf maiores UFs × nUrf maiores URFs do produto (t; sem fluxo = null).
  function exportMatriz(intel, sh4, nUf = 10, nUrf = 8) {
    const l = expRows(intel, sh4);
    const ufs = sumBy(l, 'uf').slice(0, nUf).map(x => x[0]), urfs = sumBy(l, 'urf').slice(0, nUrf).map(x => x[0]);
    const m = ufs.map(() => urfs.map(() => null));
    for (const r of l) {
      const a = ufs.indexOf(r.uf), b = urfs.indexOf(r.urf);
      if (a >= 0 && b >= 0) m[a][b] = (m[a][b] || 0) + r.kg / 1000;
    }
    return { ufs, urfs, m };
  }

  // Pares origem → destino do SIADE somando os produtos pedidos; parts na ordem de prods.
  function siadePares(intel, prods, n = 15) {
    const list = intel && intel.multimodal && Array.isArray(intel.multimodal.siade) ? intel.multimodal.siade : [];
    const by = new Map();
    for (const s of list) {
      const k = prods.indexOf(s.prod);
      if (k < 0 || !has(s.t)) continue;
      const key = [s.o, s.uo, s.d, s.ud].join('|');
      const o = by.get(key) || { o: s.o, uo: s.uo, d: s.d, ud: s.ud, t: 0, parts: prods.map(() => 0) };
      o.t += s.t; o.parts[k] += s.t;
      by.set(key, o);
    }
    return [...by.values()].sort(desc('t')).slice(0, n);
  }

  // Fretes CONAB. qualidade: 'ok', 'aprox' (origem atribuída por proximidade), 'km_suspeito' (distância da fonte
  // implausível frente à linha reta) ou 'aprox+km_suspeito'. Com distância suspeita, R$/t·km não é calculado.
  function fretesRows(intel) {
    const f = intel && intel.multimodal && intel.multimodal.fretes;
    return rows(f).map(r => {
      const q = String(r.qualidade || '').split('+'), kmSuspeito = q.includes('km_suspeito');
      return Object.assign(r, { rs_tkm: !kmSuspeito && has(r.rs_t) && has(r.km) && r.km > 0 ? r.rs_t / r.km : null,
        aprox: q.includes('aprox'), kmSuspeito });
    });
  }

  // Mantém a ordem e leva as rotas com distância suspeita para o fim.
  const suspeitosNoFim = list => list.filter(r => !r.kmSuspeito).concat(list.filter(r => r.kmSuspeito));

  // Físicos com maior carga agrícola modelada (GSA, t/ano), rotulados pelo registro principal.
  function cargaTop(intel, snv, n = 15) {
    const c = cargaOf(intel);
    if (!c) return [];
    const out = [];
    for (let j = 0; j < snv.fis.length; j++) {
      if (!(has(c.gsa[j]) && c.gsa[j] > 0)) continue;
      const t = mainRec(snv, j);
      out.push({ j, br: fisBr(snv, j), uf: fisUf(snv, j), ini: t[SNV_I.locIni], fim: t[SNV_I.locFim], gsa: c.gsa[j] });
    }
    return out.sort(desc('gsa')).slice(0, n);
  }

  // "AAAA-MM-DD" -> "dd/mm/aaaa"; "AAAA-MM" -> "mmm/aaaa"; outro texto como está; vazio = —.
  function fmtDia(s) {
    if (s == null || s === '') return DASH;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s));
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
    return /^\d{4}-\d{2}$/.test(String(s)) ? monthLabel(s) : String(s);
  }

  function fontesData(intel) {
    const f = intel && intel.fontes;
    if (!f || !Array.isArray(f.fontes)) return null;
    return { fontes: f.fontes, indisponiveis: Array.isArray(f.indisponiveis) ? f.indisponiveis : [], base: Array.isArray(f.base) ? f.base : [] };
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

  return { MODES, has, sumNullable, nAnos, vmdaOf, v25Of, acidOf, cargaOf, fisSup, fisSit, estTrafego,
    rows, metricArray, quantileBreaks, classOf, aggregateIntel, fisIntel, taxaAcidentes, pointsOfFis, decodeTopo,
    rodLabel, decodeLine, estConcLines, distToSegment, pointRadius, lineWeight, PORTO_TIPOS, PORTO_FORMA, portoTipo, monthLabel, mesX, xMes, fmtMesX, anosLabel,
    FUNDOS, PRODUTOS, fundoFonte, fundoValues,
    fundoClasses, munInfo, pointInRings, ringsBBox, fonteRef,
    ROTA_TIPOS, rotasOf, rotaTitulo, rotaLinhas, paisAneis, rotasBounds, rotasNota, rotaLabelAnchor, paisLabel, paisLabelPoint,
    anttCapa, anttAnteriores, anttSeries, pracasDe, obrasResumo, linhaDoTempo, linhaDoTempoResumo, anoPracas, comAno, rotasDocs, pipelineRows, filterPipeline, pipelineCounts, statusLabel, pipelineDe,
    EST_ESTADOS, QUALIDADE_RECORTE, qualidadeRecorte, estaduaisRows, byEsfera, estIndex, trechosLabel,
    trafegoKpis, pracasRanking, pracasSerie, abcrSazonal, acidentesPorUf, taxaPorBrUf,
    cargasKpis, producaoPorUf, topMunicipios, exportProdutos, exportPorUrf, exportMatriz, siadePares, fretesRows, suspeitosNoFim, cargaTop,
    fmtDia, fontesData, fonteTipo, fmtPeriodo, fmtMt,
    fmtInt, fmtDec, fmtVmd, fmtT, fmtPct, fmtBRL, fmtVkm, fmtTkm };
})();

if (typeof module !== 'undefined') module.exports = IntelModel;
