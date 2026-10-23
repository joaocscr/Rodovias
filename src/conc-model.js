// Concessões (RoadShow): estado de cada trecho físico, filtros, comparador e formatos. Puro: sem DOM.
const ConcModel = (() => {
  const PRIORITY = ['agendado2026', 'projeto2027', 'programa', 'vigente', 'snv', 'pos2027', 'nenhum'];
  const RANK = Object.fromEntries(PRIORITY.map((k, i) => [k, i]));
  const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const fmt2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmt1 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
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

  // Anos do programa (`ano_programa` das entidades), em ordem crescente: filtros e títulos seguem os dados.
  const anosPrograma = conc => [...new Set(((conc && conc.entidades) || []).map(e => e.ano_programa).filter(Number.isFinite))]
    .sort((x, y) => x - y);

  // Data-base mais comum das entidades (a das tabelas do RoadShow): texto do comparador. Empate: a que aparece antes.
  function dataBaseComum(conc) {
    const n = new Map();
    for (const e of (conc && conc.entidades) || []) if (e.data_base) n.set(e.data_base, (n.get(e.data_base) || 0) + 1);
    let best = null;
    for (const [k, v] of n) if (best == null || v > n.get(best)) best = k;
    return best;
  }

  function comparatorRows(conc) {
    return conc.entidades.map((e, idx) => {
      const f = e.ficha || {};
      return {
        idx, id: e.id, nome: e.nome, brsUfs: brsUfs(e), estado: e.estado, dataChave: dataChave(e) || null,
        km: e.km ?? null, capex: e.capex ?? null, opex: e.opex ?? null, dataBase: e.data_base || null,
        capexKm: e.capex != null && e.km ? e.capex * 1000 / e.km : null,
        wacc: f.wacc ?? null, tkm: f.tkm ?? null, desagio: e.desagio ?? null,
        desagioOrigem: origemCampo(e, 'desagio'),
        participantes: e.participantes ?? null, vencedor: e.grupo_vencedor || null,
        ano: e.ano_programa ?? null, tipo: e.tipo, ufs: e.ufs, ficha: f,
      };
    });
  }

  // Origem do valor exibido de um campo de leilão (camada de verificação, `e.verif`), em texto puro.
  const ORIGEM = { oficial: 'oficial', roadshow: 'RoadShow', imprensa: 'imprensa — não oficial' };
  const NAO_LOCALIZADO = 'não localizado em fonte oficial';
  const NAO_SE_APLICA = 'não se aplica (leilão por outorga)';
  // Aceita o tipo da fonte ou o verif do campo ({tipo, nao_localizado, nao_se_aplica}): não se aplica > não localizado.
  function rotuloOrigem(v) {
    if (v && typeof v === 'object') return v.nao_se_aplica ? NAO_SE_APLICA : v.nao_localizado ? NAO_LOCALIZADO : rotuloOrigem(v.tipo);
    return ORIGEM[v] || NAO_LOCALIZADO;
  }
  // Campo verificado: o tipo da fonte (ou "não localizado"/"não se aplica"); sem verificação, o valor é o do RoadShow;
  // sem valor, null.
  function origemCampo(e, campo) {
    const v = e.verif && e.verif[campo];
    if (v) return rotuloOrigem(v);
    return e[campo] == null || e[campo] === '' ? null : ORIGEM.roadshow;
  }

  // Participantes da ficha com um só vencedor, o verificado (`grupo_vencedor` com `verif`). A linha do mesmo proponente
  // (nome igual sem acento/caixa/pontuação/"Consórcio", um nome prefixo do outro, o nome entre parênteses, mesmo grupo
  // em `aliases`; senão, a linha marcada pelo RoadShow com o mesmo deságio) passa a mostrar o nome e o deságio exibidos,
  // com o que o RoadShow imprime em `roadshow` quando difere. Sem essa linha, o vencedor verificado entra no topo; a
  // linha marcada pelo RoadShow sai da lista quando não tem deságio (o nome dela vai para `roadshow.grupo`) ou, com
  // deságio próprio (é um lance), fica sem a marca. Cópia: não altera a entidade.
  const chaveNome = s => norm(s).replace(/^consorcio /, '').replace(/[^a-z0-9]/g, '');
  function chaves(nome) {
    const m = /^(.*?)\s*\(([^()]*)\)\s*$/.exec(nome);
    return (m ? [m[1], m[2]] : [nome]).map(chaveNome).filter(k => k.length >= 3);
  }
  function mesmoNome(a, b, grupo) {
    if (grupo(a) && grupo(a) === grupo(b)) return true;
    const ka = chaves(a), kb = chaves(b);
    return ka.some(x => kb.some(y => x === y || (Math.min(x.length, y.length) >= 4 && (x.startsWith(y) || y.startsWith(x)))));
  }
  const igual = (x, y) => x != null && y != null && Math.abs(x - y) < 0.005;
  function participantesExibidos(e, aliases = []) {
    const lista = (e.participantes_lista || []).map(p => Object.assign({}, p));
    const v = e.verif || {};
    if (!lista.length || !v.grupo_vencedor || !e.grupo_vencedor) return lista;
    const grupos = new Map((aliases || []).map(a => [a.nome, a.grupo]));
    const grupo = n => grupos.get(n) || null;
    const rs = lista.find(p => p.vencedor);
    const porNome = lista.filter(p => p.grupo && mesmoNome(e.grupo_vencedor, p.grupo, grupo));
    const r = porNome.includes(rs) ? rs : porNome[0] || (rs && igual(rs.desagio, e.desagio) ? rs : null);
    lista.forEach(p => { p.vencedor = false; });
    const desagio = v.desagio ? (e.desagio ?? null) : (r && r.desagio != null ? r.desagio : (e.desagio ?? null));
    if (!r) {
      const topo = { grupo: e.grupo_vencedor, desagio, vencedor: true, verificado: true };
      // a linha marcada sem deságio não é um lance: é o rótulo do vencedor no RoadShow, que vira a sublinha do verificado
      if (!rs || rs.desagio != null) return [topo, ...lista];
      return [Object.assign(topo, { roadshow: { grupo: rs.grupo, desagio: null } }), ...lista.filter(p => p !== rs)];
    }
    const roadshow = {
      grupo: chaveNome(r.grupo || '') === chaveNome(e.grupo_vencedor) ? null : r.grupo,
      desagio: r.desagio == null || igual(r.desagio, desagio) ? null : r.desagio,
    };
    Object.assign(r, { grupo: e.grupo_vencedor, desagio, vencedor: true, verificado: true },
      roadshow.grupo || roadshow.desagio != null ? { roadshow } : {});
    return lista;
  }

  // Perfil de pista da concessão pelo SNV: km dos físicos do recorte curado (`conc.entFis[idx]`, cada físico uma vez)
  // por categoria, pela situação do registro principal do físico (IntelModel.fisSit):
  //   duplicada = 'Duplicada'; obraDup = 'Em obra de Duplicação'; simples = 'Pavimentada' (pista simples pavimentada);
  //   naoPav = todo o resto (Implantada, Leito Natural, Travessia, Planejada, Em obra de Pavimentação/Implantação,
  //   situação ausente), para a soma das quatro categorias ser sempre o `km` — nenhum km fica de fora.
  // Sem recorte (sem físicos, qualidade 'falha'/'nao_mapeado' ou sem SNV) = semRecorte true e nenhum número (null, nunca 0).
  // Com recorte 'aproximado' os números valem para o recorte aproximado.
  const PISTA = [
    { key: 'duplicada', label: 'Duplicada' }, { key: 'obraDup', label: 'Em obra de duplicação' },
    { key: 'simples', label: 'Pista simples pavimentada' }, { key: 'naoPav', label: 'Sem pavimento ou planejada' },
  ];
  const PISTA_SIT = { 'Duplicada': 'duplicada', 'Em obra de Duplicação': 'obraDup', 'Pavimentada': 'simples' };
  function pistaSNV(conc, snv, idx) {
    const e = conc.entidades[idx], fis = [...new Set((conc.entFis && conc.entFis[idx]) || [])];
    if (!snv || !snv.fis || !fis.length || !e || e.qualidade === 'falha' || e.qualidade === 'nao_mapeado') {
      return { km: null, duplicada: null, obraDup: null, simples: null, naoPav: null, semRecorte: true };
    }
    const IM = typeof IntelModel !== 'undefined' ? IntelModel : require('./intel-model.js');
    const r = { duplicada: 0, obraDup: 0, simples: 0, naoPav: 0 };
    for (const j of fis) r[PISTA_SIT[IM.fisSit(snv, j)] || 'naoPav'] += snv.fis[j].ext;
    return { km: r.duplicada + r.obraDup + r.simples + r.naoPav, ...r, semRecorte: false };
  }

  // Categorias da pista com km e fração do total (só as que têm km); [] sem recorte.
  function pistaPartes(p) {
    if (!p || p.semRecorte || !(p.km > 0)) return [];
    return PISTA.filter(c => p[c.key] > 0).map(c => ({ ...c, km: p[c.key], pct: p[c.key] / p.km }));
  }

  // Resumo de uma linha da pista (cartão do mapa): "12,3 km no SNV · 80,0% duplicada · 20,0% pista simples pavimentada".
  function pistaLinha(p) {
    if (!p || p.semRecorte) return 'sem recorte no SNV';
    return [`${fmt1.format(p.km)} km no SNV`, ...pistaPartes(p).map(c => `${fmt1.format(c.pct * 100)}% ${c.label.toLowerCase()}`)].join(' · ');
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
    comparatorRows, anosPrograma, dataBaseComum, PISTA, pistaSNV, pistaPartes, pistaLinha, rotuloOrigem, origemCampo, participantesExibidos, filterRows, sortRows, totals, fmtBi, fmtPct, fmtData, brsUfs, dataChave, norm };
})();

if (typeof module !== 'undefined') module.exports = ConcModel;
