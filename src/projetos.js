// Aba Projetos: comparador ordenável de contratos e projetos do RoadShow, com totais e estudos pós-2027.
// v3: concessões estaduais no comparador (coluna e filtro Esfera) e seção Pipeline (INTEL.pipeline).
const Projetos = (() => {
  const nf1 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const nf2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const nf4 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  const nf0 = new Intl.NumberFormat('pt-BR');
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const dash = '—';
  const n = (f, v) => (v == null ? dash : f(v));

  // [chave, rótulo, formato, numérica?]
  const BASE_COLS = [
    ['nome', 'Nome', null, false], ['brsUfs', 'BRs/UFs', null, false], ['estado', 'Estado', 'estado', false],
    ['dataChave', 'Data-chave', 'data', false], ['km', 'km', 'km', true], ['capex', 'Capex (R$ bi)', 'bi', true],
    ['opex', 'Opex (R$ bi)', 'bi', true], ['dataBase', 'Data-base', null, false], ['capexKm', 'Capex/km (R$ mi)', 'mi', true],
    ['wacc', 'WACC', 'pct', true], ['tkm', 'TKM (R$/km)', 'tkm', true], ['desagio', 'Deságio', 'pct', true],
    ['participantes', 'Participantes', 'int', true], ['vencedor', 'Vencedor', null, false],
  ];
  const FICHA_COLS = [
    ['empregos', 'Empregos', 'int'], ['duplicacao_km', 'Duplicação (km)', 'km'], ['faixa_adicional_km', 'Faixa adicional (km)', 'km'],
    ['contorno_km', 'Contornos (km)', 'km'], ['marginais_km', 'Marginais (km)', 'km'], ['pracas_implantar', 'Praças a implantar', 'int'],
    ['pracas_existentes', 'Praças existentes', 'int'], ['porticos', 'Pórticos', 'int'], ['opex_km', 'Opex/km (R$ mi)', 'mi'],
    ['custo_duplicacao_km', 'Duplicação/km (R$ mi)', 'mi'], ['receita_nominal', 'Receita nominal (R$ bi)', 'bi'],
    ['receita_vpl', 'Receita VPL (R$ bi)', 'bi'], ['cagr_trafego', 'CAGR tráfego', 'pct'], ['capex_receita_vpl', 'Capex/Receita VPL', 'pct'],
    ['veq_dia_praca', 'VEQ/dia/praça', 'int'],
  ];
  const FMT = {
    km: v => nf1.format(v), bi: v => nf2.format(v), mi: v => nf2.format(v), pct: v => nf2.format(v) + '%',
    tkm: v => nf4.format(v), int: v => nf0.format(v), data: v => ConcModel.fmtData(v),
  };

  const IM = IntelModel;
  const ESFERA = { federal: 'Federal', estadual: 'Estadual' };
  const ESFERA_COL = ['esfera', 'Esfera', 'esfera', false];
  let conc, intel = null, rows, sortKey = 'dataChave', sortDir = 'desc', extra = [], built = false, hasEst = false;
  const filt = { estado: new Set(), uf: new Set(), ano: new Set(), tipo: new Set(), q: '', esfera: new Set() };
  let pipe = [];
  const pfilt = { esfera: new Set(), status: new Set() };

  const label = k => (conc.estados.concat(IM.EST_ESTADOS).find(s => s.key === k) || {}).label || k;

  function baseCols() { return hasEst ? [BASE_COLS[0], ESFERA_COL, ...BASE_COLS.slice(1)] : BASE_COLS; }

  function cols() {
    return baseCols().concat(FICHA_COLS.filter(c => extra.includes(c[0])).map(([k, l, f]) => ['f:' + k, l, f, true]));
  }

  function cell(r, [key, , fmt]) {
    if (key.startsWith('f:')) { const v = r.ficha[key.slice(2)]; return n(FMT[fmt] || String, v ?? null); }
    const v = r[key];
    if (fmt === 'esfera') return esc(ESFERA[v] || dash);
    if (fmt === 'estado') {
      const sw = r.esfera === 'estadual' ? (typeof layerSwatch === 'function' ? layerSwatch('estconc', 24) : '') : concStyleSwatch(v, 24);
      return `<span class="estado-tag">${sw}${esc(label(v))}</span>`;
    }
    if (!fmt) return v == null ? dash : esc(v);
    return n(FMT[fmt], v);
  }

  function sortVal(r, key) { return key.startsWith('f:') ? (r.ficha[key.slice(2)] ?? null) : r[key]; }

  function current() {
    const list = ConcModel.filterRows(IM.byEsfera(rows, filt.esfera), filt).map(r => Object.assign({}, r, Object.fromEntries(extra.map(k => ['f:' + k, r.ficha[k] ?? null]))));
    return ConcModel.sortRows(list, sortKey, sortDir).map(r => r);
  }

  function renderTable() {
    const list = current();
    const t = ConcModel.totals(list);
    const cs = cols(), ki = cs.findIndex(c => c[0] === 'km');
    document.getElementById('proj-table').innerHTML = `
      <thead><tr>${cs.map(c => `<th class="${c[3] ? 'num' : ''}"${c[0] === sortKey ? ` aria-sort="${sortDir === 'asc' ? 'ascending' : 'descending'}"` : ''}>
        <button type="button" data-sort="${c[0]}">${esc(c[1])}${c[0] === sortKey ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}</button></th>`).join('')}<th><span class="visually-hidden">Mapa</span></th></tr></thead>
      <tbody>${list.map(r => `<tr tabindex="0" data-id="${esc(r.id)}">${cs.map(c => `<td class="${c[0] === 'nome' ? 'name' : c[3] ? 'num' : ''}">${cell(r, c)}</td>`).join('')}
        <td>${mapBtn(r)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="${ki}" id="proj-total-label">Total da seleção (${nf0.format(t.n)})${mixed(list)}</td>
        <td class="num" id="proj-total-km">${nf1.format(t.km)}</td><td class="num" id="proj-total-capex">${nf2.format(t.capex)}</td>
        <td class="num" id="proj-total-opex">${nf2.format(t.opex)}</td><td colspan="${cs.length - ki - 2}"></td></tr></tfoot>`;
    document.getElementById('proj-count').textContent = `${nf0.format(list.length)} de ${nf0.format(rows.length)}`;
  }

  function mapBtn(r) {
    if (r.esfera === 'estadual') {
      return `<button type="button" class="link-btn" data-estmap="${r.k}" ${Ficha.estHasMap(r.k) ? '' : 'disabled title="Concessão sem traçado no mapa"'}>ver no mapa</button>`;
    }
    return `<button type="button" class="link-btn" data-map="${r.idx}" ${conc.entFis[r.idx].length ? '' : 'disabled title="Sem trecho mapeado"'}>ver no mapa</button>`;
  }

  // Totais com mais de uma data-base de preços somam valores não comparáveis: avisa.
  function mixed(list) {
    const bases = [...new Set(list.map(r => r.dataBase).filter(Boolean))];
    return bases.length > 1 ? ` · <span title="${esc(bases.join(', '))}">bases mistas (${bases.length} datas-base)</span>` : '';
  }

  function toolbar() {
    const ufs = [...new Set(rows.flatMap(r => r.ufs))].sort();
    const chip = (key, value, text) => `<button type="button" class="chip" data-f="${key}" data-v="${esc(value)}" aria-pressed="false">${esc(text)}</button>`;
    return `<div class="toolbar">
        <input class="mini-input" type="search" id="proj-q" placeholder="Buscar nome, BR ou vencedor" aria-label="Buscar projetos">
        <select id="proj-uf" aria-label="Filtrar por UF"><option value="">Todas as UFs</option>${ufs.map(u => `<option>${u}</option>`).join('')}</select>
        ${hasEst ? `<select id="proj-esfera" aria-label="Filtrar por esfera"><option value="">Todas as esferas</option><option value="federal">Federal</option><option value="estadual">Estadual</option></select>` : ''}
        <select id="proj-tipo" aria-label="Filtrar por tipo"><option value="">Todos os tipos</option><option value="nova">Nova concessão</option><option value="otimizacao">Otimização</option><option value="delegada">Delegada</option></select>
        <div class="col-picker"><button type="button" class="btn" id="proj-cols" aria-expanded="false">Colunas da ficha</button>
          <div class="col-picker__menu" id="proj-cols-menu" hidden>${FICHA_COLS.map(([k, l]) => `<label class="check"><input type="checkbox" value="${k}">${esc(l)}</label>`).join('')}</div></div>
        <span class="page__src" id="proj-count"></span>
      </div>
      <div class="toolbar"><div class="chips">${conc.estados.filter(s => !['snv', 'pos2027', 'nenhum'].includes(s.key))
        .concat(IM.EST_ESTADOS.filter(s => rows.some(r => r.estado === s.key))).map(s => chip('estado', s.key, s.label)).join('')}</div>
        <div class="chips">${[2023, 2024, 2025, 2026, 2027].map(a => chip('ano', a, String(a))).join('')}</div></div>`;
  }

  function estudos() {
    return `<h2 class="page__title" style="font-size:22px;margin-top:40px">Estudos pós-2027</h2>
      <p class="page__lead">27 estudos contratados, só com BRs e UFs no RoadShow (p. 121). No mapa, aparecem como a BR inteira na UF.</p>
      <ul class="timeline" id="estudos-list">${conc.estudos.map((s, i) => `<li>BR-${esc(s.brs.join('/'))}/${esc(s.ufs.join('/'))}${s.possivel_2027 ? ' · <b>possível 2027</b>' : ''}
        <button type="button" class="link-btn" data-estudo="${i}" ${s.fis.length ? '' : 'disabled'}>ver no mapa</button></li>`).join('')}</ul>`;
  }

  // ---------- Pipeline (INTEL.pipeline): próximos leilões, consultas e estudos, federais e estaduais ----------
  function pipelineSection() {
    if (!pipe.length) return '';
    const fontes = (intel.pipeline.fonte || []).map(f => f && f.nome).filter(Boolean);
    const acesso = (intel.pipeline.fonte || []).map(f => f && f.acesso).filter(Boolean).sort().pop();
    return `<section id="pipeline" class="pipeline">
      <h2 class="page__title" style="font-size:22px;margin-top:40px">Pipeline</h2>
      <p class="page__lead">Próximos passos de concessões federais e estaduais (estudo, consulta pública, TCU/TCE, edital, leilão), por data prevista; sem data no fim.
        Itens com a etiqueta “não verificado” vêm de uma única fonte secundária. Clique numa linha com ficha para abri-la.</p>
      <div class="toolbar">
        <select id="pipe-esfera" aria-label="Filtrar pipeline por esfera"><option value="">Todas as esferas</option><option value="federal">Federal</option><option value="estadual">Estadual</option></select>
        <span class="page__src" id="pipe-n"></span>
      </div>
      <div class="chips" id="pipe-counts" aria-label="Status (clique para filtrar)"></div>
      <div class="table-wrap"><table class="grid" id="pipe-table"></table></div>
      ${fontes.length ? `<p class="page__src">Fonte: ${esc(fontes.join('; '))}${acesso ? ` · acesso ${esc(ConcModel.fmtData(acesso))}` : ''}.</p>` : ''}
    </section>`;
  }

  function renderPipeline() {
    if (!pipe.length) return;
    const byEsf = IM.filterPipeline(pipe, { esfera: pfilt.esfera });
    const counts = IM.pipelineCounts(byEsf, intel.pipeline.status);
    // Status selecionado que não existe na esfera escolhida sai do filtro (nunca um filtro ativo invisível).
    for (const k of [...pfilt.status]) if (!counts.some(c => c.key === k)) pfilt.status.delete(k);
    document.getElementById('pipe-counts').innerHTML = counts.map(c =>
      `<button type="button" class="chip" data-pstatus="${esc(c.key)}" aria-pressed="${pfilt.status.has(c.key)}">${esc(c.label)} <b>${nf0.format(c.n)}</b></button>`).join('');
    const list = IM.filterPipeline(byEsf, { status: pfilt.status });
    const fonte = i => `${i.fonte_url ? `<a class="link-btn" href="${esc(i.fonte_url)}" target="_blank" rel="noopener" title="${esc(i.fonte_data || '')}">fonte</a>` : dash}${
      i.verificado === false ? ' <span class="tag-nv">não verificado</span>' : ''}`;
    document.getElementById('pipe-table').innerHTML = `
      <thead><tr><th>Nome</th><th>Esfera</th><th>UF</th><th>Rodovias</th><th class="num">km</th><th>Status</th><th>Data prevista</th><th>Fonte</th></tr></thead>
      <tbody>${list.map(i => {
        const ficha = i.ent && Ficha.exists(i.ent);
        return `<tr${ficha ? ` tabindex="0" data-ent="${esc(i.ent)}"` : ' class="is-static"'} data-data="${esc(i.data_prevista || '')}">
          <td class="name">${esc(i.nome)}</td><td>${esc(ESFERA[i.esfera] || dash)}</td><td>${esc((i.uf || []).join('/') || dash)}</td>
          <td class="wrap">${esc((i.rodovias || []).join(', ') || dash)}</td><td class="num">${n(v => nf1.format(v), IM.has(i.km) ? i.km : null)}</td>
          <td>${esc(IM.statusLabel(intel, i.status))}</td><td>${esc(ConcModel.fmtData(i.data_prevista))}</td><td>${fonte(i)}</td></tr>`;
      }).join('')}</tbody>`;
    document.getElementById('pipe-n').textContent = `${nf0.format(list.length)} de ${nf0.format(pipe.length)}`;
  }

  const estudoLabel = s => `Estudo pós-2027 BR-${s.brs.join('/')}/${s.ufs.join('/')}`;

  function init(data, intelData = null) {
    if (built) return;
    built = true;
    conc = data; intel = intelData || null;
    const est = IM.estaduaisRows(intel);
    hasEst = est.length > 0;
    rows = ConcModel.comparatorRows(conc).map(r => Object.assign(r, { esfera: 'federal' })).concat(est);
    pipe = IM.pipelineRows(intel);
    const el = document.getElementById('page-projetos');
    el.innerHTML = `<div class="page__inner">
      <h1 class="page__title">Projetos e contratos</h1>
      <p class="page__lead">Contratos vigentes e projetos do programa 2023–2027${hasEst ? ', e concessões rodoviárias estaduais' : ''}. Capex e opex na base comparável (tabelas em dez/2024 quando existirem; senão, a data-base da ficha, indicada na coluna). Clique numa linha para abrir a ficha.</p>
      ${toolbar()}
      <div class="table-wrap"><table class="grid" id="proj-table"></table></div>
      ${pipelineSection()}
      ${estudos()}</div>`;
    renderTable();
    renderPipeline();

    el.addEventListener('click', ev => {
      const sort = ev.target.closest('[data-sort]');
      if (sort) {
        const k = sort.dataset.sort;
        if (sortKey === k) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
        else { sortKey = k; sortDir = baseCols().concat(FICHA_COLS.map(c => ['f:' + c[0], c[1], c[2], true])).find(c => c[0] === k)[3] ? 'desc' : 'asc'; }
        renderTable();
        return;
      }
      const estBtn = ev.target.closest('[data-estmap]');
      if (estBtn) { ev.stopPropagation(); Ficha.showEstOnMap(Number(estBtn.dataset.estmap)); return; }
      const ps = ev.target.closest('[data-pstatus]');
      if (ps) {
        const k = ps.dataset.pstatus;
        if (pfilt.status.has(k)) pfilt.status.delete(k); else pfilt.status.add(k);
        renderPipeline();
        return;
      }
      if (ev.target.closest('#pipe-table a')) return;
      const pr = ev.target.closest('#pipe-table tbody tr[data-ent]');
      if (pr) { Tabs.go('#ficha/' + pr.dataset.ent); return; }
      const mapBtn = ev.target.closest('[data-map]');
      if (mapBtn) {
        ev.stopPropagation();
        const e = conc.entidades[Number(mapBtn.dataset.map)];
        UI.showOnMap(e.nome, conc.entFis[e.idx], e.id);
        return;
      }
      const est = ev.target.closest('[data-estudo]');
      if (est) { const s = conc.estudos[Number(est.dataset.estudo)]; UI.showOnMap(estudoLabel(s), s.fis); return; }
      const chip = ev.target.closest('[data-f]');
      if (chip) {
        const set = filt[chip.dataset.f], v = chip.dataset.f === 'ano' ? Number(chip.dataset.v) : chip.dataset.v;
        if (set.has(v)) set.delete(v); else set.add(v);
        chip.setAttribute('aria-pressed', String(set.has(v)));
        renderTable();
        return;
      }
      if (ev.target.closest('#proj-cols')) {
        const m = document.getElementById('proj-cols-menu');
        m.hidden = !m.hidden;
        document.getElementById('proj-cols').setAttribute('aria-expanded', String(!m.hidden));
        return;
      }
      const tr = ev.target.closest('tbody tr[data-id]');
      if (tr) Tabs.go('#ficha/' + tr.dataset.id);
    });
    el.addEventListener('keydown', ev => {
      if (ev.key !== 'Enter' || ev.target.closest('a')) return;
      const tr = ev.target.closest('tbody tr[data-id]'), pr = ev.target.closest('#pipe-table tbody tr[data-ent]');
      if (tr) Tabs.go('#ficha/' + tr.dataset.id);
      else if (pr) Tabs.go('#ficha/' + pr.dataset.ent);
    });
    if (hasEst) document.getElementById('proj-esfera').addEventListener('change', ev => { filt.esfera = new Set(ev.target.value ? [ev.target.value] : []); renderTable(); });
    if (pipe.length) document.getElementById('pipe-esfera').addEventListener('change', ev => { pfilt.esfera = new Set(ev.target.value ? [ev.target.value] : []); renderPipeline(); });
    document.getElementById('proj-q').addEventListener('input', ev => { filt.q = ev.target.value; renderTable(); });
    document.getElementById('proj-uf').addEventListener('change', ev => { filt.uf = new Set(ev.target.value ? [ev.target.value] : []); renderTable(); });
    document.getElementById('proj-tipo').addEventListener('change', ev => { filt.tipo = new Set(ev.target.value ? [ev.target.value] : []); renderTable(); });
    document.getElementById('proj-cols-menu').addEventListener('change', ev => {
      extra = [...document.querySelectorAll('#proj-cols-menu input:checked')].map(i => i.value);
      renderTable();
    });
  }

  return { init, rowsShown: () => current() };
})();
