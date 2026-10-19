// Filtro, agregação e busca sobre window.SNV. Puro: sem DOM, sem Leaflet.
const Model = (() => {
  // Posição de cada campo categórico no registro de `trechos`.
  const FIELD = { br: 1, uf: 2, tipo: 3, situacao: 4, superficie: 5, jurisdicao: 6, adm: 7 };
  const T = { codigo: 0, kmIni: 9, kmFim: 10, ext: 11, locIni: 12, locFim: 13, fis: 15 };
  const BR_RE = /^\s*(br)?[\s-]*(\d{1,3})\s*$/i;

  const fmt1 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  function normalize(s) {
    return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  }

  function brLabel(snv, iBr) { return 'BR-' + snv.dict.br[iBr]; }

  function emptyFilters() {
    const f = {};
    for (const k of Object.keys(FIELD)) f[k] = new Set();
    return f;
  }

  function activeKeys(filters) {
    return Object.keys(FIELD).filter(k => filters[k] && filters[k].size > 0);
  }

  function recordPasses(snv, iRec, filters, keys = activeKeys(filters)) {
    const t = snv.trechos[iRec];
    for (const k of keys) if (!filters[k].has(t[FIELD[k]])) return false;
    return true;
  }

  // Primeiro registro do físico que passa nos filtros, ou -1.
  function firstPassing(snv, fis, filters, keys) {
    for (const i of fis.r) if (recordPasses(snv, i, filters, keys)) return i;
    return -1;
  }

  function visibleFis(snv, filters) {
    const keys = activeKeys(filters);
    const out = new Uint8Array(snv.fis.length);
    snv.fis.forEach((f, j) => { out[j] = firstPassing(snv, f, filters, keys) >= 0 ? 1 : 0; });
    return out;
  }

  function breakdown(map, total) {
    return [...map.entries()]
      .filter(([, km]) => km > 0)
      .map(([i, km]) => ({ i, km, pct: total > 0 ? km / total : 0 }))
      .sort((a, b) => b.km - a.km);
  }

  // Cada físico visível conta uma vez; as quebras usam o primeiro registro que passa.
  function aggregate(snv, filters, visible) {
    const keys = activeKeys(filters);
    const sit = new Map(), adm = new Map(), uf = new Map();
    let km = 0, n = 0;
    snv.fis.forEach((f, j) => {
      if (!visible[j]) return;
      const t = snv.trechos[firstPassing(snv, f, filters, keys)];
      km += f.ext; n += 1;
      sit.set(t[FIELD.situacao], (sit.get(t[FIELD.situacao]) || 0) + f.ext);
      adm.set(t[FIELD.adm], (adm.get(t[FIELD.adm]) || 0) + f.ext);
      uf.set(t[FIELD.uf], (uf.get(t[FIELD.uf]) || 0) + f.ext);
    });
    return { km, n, porSituacao: breakdown(sit, km), porAdm: breakdown(adm, km), porUf: breakdown(uf, km) };
  }

  function createIndex(snv) {
    return {
      snv,
      codes: snv.trechos.map(t => t[T.codigo].toLowerCase()),
      locs: snv.trechos.map(t => [normalize(t[T.locIni]), normalize(t[T.locFim])]),
    };
  }

  function recSub(snv, i) {
    const t = snv.trechos[i];
    return `${brLabel(snv, t[FIELD.br])}/${snv.dict.uf[t[FIELD.uf]]} · km ${fmt1.format(t[T.kmIni])}–${fmt1.format(t[T.kmFim])}`;
  }

  function search(index, query, limit = 12) {
    const { snv } = index;
    const q = normalize(query);
    if (!q) return [];
    const out = [];
    const m = q.match(BR_RE);
    if (m) {
      const iBr = snv.dict.br.indexOf(m[2].padStart(3, '0'));
      if (iBr >= 0) out.push({ kind: 'br', label: brLabel(snv, iBr), sub: 'Rodovia inteira', iBr });
    }
    // Um resultado por trecho físico: coincidentes repetem o mesmo trecho para cada BR.
    const seen = new Set();
    const fresh = i => {
      const j = snv.trechos[i][T.fis];
      if (seen.has(j)) return false;
      seen.add(j);
      return true;
    };
    const compact = q.replace(/[\s-]/g, '');
    if (compact.length >= 3) {
      for (let i = 0; i < index.codes.length && out.length < limit; i++) {
        if (index.codes[i].startsWith(compact) && fresh(i)) {
          out.push({ kind: 'trecho', label: snv.trechos[i][T.codigo], sub: recSub(snv, i), iRec: i });
        }
      }
    }
    if (q.length >= 2) {
      for (let i = 0; i < index.locs.length && out.length < limit; i++) {
        const [a, b] = index.locs[i];
        const hitA = a.includes(q), hitB = !hitA && b.includes(q);
        if ((hitA || hitB) && fresh(i)) {
          const t = snv.trechos[i];
          out.push({ kind: 'local', label: hitA ? t[T.locIni] : t[T.locFim], sub: recSub(snv, i), iRec: i });
        }
      }
    }
    return out.slice(0, limit);
  }

  function fmtKm(x) { return fmt1.format(x) + ' km'; }

  return { FIELD, T, normalize, brLabel, emptyFilters, recordPasses, visibleFis, aggregate, createIndex, search, fmtKm };
})();

if (typeof module !== 'undefined') module.exports = Model;
