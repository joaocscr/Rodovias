// Concessões (RoadShow): estado de cada trecho físico, filtros, comparador e formatos. Puro: sem DOM.
const ConcModel = (() => {
  const PRIORITY = ['agendado2026', 'projeto2027', 'programa', 'vigente', 'snv', 'pos2027', 'nenhum'];
  const RANK = Object.fromEntries(PRIORITY.map((k, i) => [k, i]));
  const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const fmt2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const collator = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true });

  const norm = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

  function entitiesOfFis(conc, j) {
    const list = conc.fisEnt[j] || [];
    return [...list].sort((a, b) => RANK[conc.entidades[a].estado] - RANK[conc.entidades[b].estado] || a - b);
  }

  function stateOfFis(conc, j) {
    const ents = entitiesOfFis(conc, j);
    if (ents.length) return conc.entidades[ents[0]].estado;
    if (conc._snvOnly ? conc._snvOnly.has(j) : conc.snvOnly.includes(j)) return 'snv';
    if (conc.estudos.some(s => s.fis.includes(j))) return 'pos2027';
    return 'nenhum';
  }

  function stateArray(conc, nFis) {
    conc._snvOnly = new Set(conc.snvOnly);
    const estudo = new Set(conc.estudos.flatMap(s => s.fis));
    const out = new Array(nFis);
    for (let j = 0; j < nFis; j++) {
      const ents = conc.fisEnt[j];
      if (ents && ents.length) out[j] = conc.entidades[entitiesOfFis(conc, j)[0]].estado;
      else if (conc._snvOnly.has(j)) out[j] = 'snv';
      else if (estudo.has(j)) out[j] = 'pos2027';
      else out[j] = 'nenhum';
    }
    return out;
  }

  function emptyConcFilters() { return { estado: new Set(), ent: new Set(), ano: new Set() }; }

  function passes(conc, states, j, cf) {
    if (cf.estado.size && !cf.estado.has(states[j])) return false;
    if (cf.ent.size || cf.ano.size) {
      const ents = conc.fisEnt[j] || [];
      if (cf.ent.size && !ents.some(i => cf.ent.has(i))) return false;
      if (cf.ano.size && !ents.some(i => cf.ano.has(conc.entidades[i].ano_programa))) return false;
    }
    return true;
  }

  function kmPorEstado(conc, states, visible, snv) {
    const km = new Map();
    for (let j = 0; j < visible.length; j++) {
      if (visible[j]) km.set(states[j], (km.get(states[j]) || 0) + snv.fis[j].ext);
    }
    return PRIORITY.filter(k => km.get(k) > 0).map(key => ({ key, km: km.get(key) }));
  }

  function brsUfs(e) { return 'BR-' + e.brs.join('/') + '/' + e.ufs.join('/'); }

  function dataChave(e) {
    return e.estado === 'vigente' ? (e.assinatura || e.leilao) : (e.leilao || e.assinatura);
  }

  function comparatorRows(conc) {
    return conc.entidades.map((e, idx) => {
      const f = e.ficha || {};
      return {
        idx, id: e.id, nome: e.nome, brsUfs: brsUfs(e), estado: e.estado, dataChave: dataChave(e) || null,
        km: e.km ?? null, capex: e.capex ?? null, opex: e.opex ?? null, dataBase: e.data_base || null,
        capexKm: e.capex != null && e.km ? e.capex * 1000 / e.km : null,
        wacc: f.wacc ?? null, tkm: f.tkm ?? null, desagio: e.desagio ?? null,
        participantes: e.participantes ?? null, vencedor: e.grupo_vencedor || null,
        ano: e.ano_programa ?? null, tipo: e.tipo, ufs: e.ufs, ficha: f,
      };
    });
  }

  function filterRows(rows, { estado, uf, ano, tipo, q } = {}) {
    const nq = q ? norm(q) : '';
    return rows.filter(r =>
      (!estado || !estado.size || estado.has(r.estado)) &&
      (!uf || !uf.size || r.ufs.some(u => uf.has(u))) &&
      (!ano || !ano.size || ano.has(r.ano)) &&
      (!tipo || !tipo.size || tipo.has(r.tipo)) &&
      (!nq || norm(`${r.nome} ${r.brsUfs} ${r.vencedor || ''}`).includes(nq)));
  }

  function sortRows(rows, key, dir = 'asc') {
    const sign = dir === 'desc' ? -1 : 1;
    return [...rows].sort((a, b) => {
      const x = a[key], y = b[key];
      const xn = x == null || x === '', yn = y == null || y === '';
      if (xn || yn) return xn === yn ? 0 : xn ? 1 : -1;
      const c = typeof x === 'number' && typeof y === 'number' ? x - y : collator.compare(String(x), String(y));
      return sign * c;
    });
  }

  function totals(rows) {
    const t = { km: 0, capex: 0, opex: 0, n: rows.length };
    for (const r of rows) for (const k of ['km', 'capex', 'opex']) if (r[k] != null) t[k] += r[k];
    return t;
  }

  function fmtBi(x) { return x == null ? '—' : `R$ ${fmt2.format(x)} bi`; }
  function fmtPct(x) { return x == null ? '—' : `${fmt2.format(x)}%`; }
  function fmtData(s) {
    if (!s) return '—';
    const [y, m, d] = String(s).split('-');
    if (d) return `${d}/${m}/${y}`;
    if (m) return `${MESES[Number(m) - 1]}/${y}`;
    return y;
  }

  return { PRIORITY, entitiesOfFis, stateOfFis, stateArray, emptyConcFilters, passes, kmPorEstado,
    comparatorRows, filterRows, sortRows, totals, fmtBi, fmtPct, fmtData, brsUfs, dataChave, norm };
})();

if (typeof module !== 'undefined') module.exports = ConcModel;
