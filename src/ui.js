// Interface: busca, filtros, painel de números, cartão de detalhe e legenda.
const UI = (() => {
  const SUPERFICIE = { PAV: 'Pavimentada', N_PAV: 'Não pavimentada', PLA: 'Planejada' };
  const SIT_ORDER = ['Duplicada', 'Pavimentada', 'Em obra de Duplicação', 'Em obra de Pavimentação',
    'Em obra de Implantação', 'Implantada', 'Leito Natural', 'Travessia', 'Planejada'];
  const SIT_SHORTCUTS = [
    ['Pavimentadas', ['Duplicada', 'Pavimentada']],
    ['Não pavimentadas', ['Implantada', 'Leito Natural']],
    ['Em obra', ['Em obra de Duplicação', 'Em obra de Pavimentação', 'Em obra de Implantação']],
    ['Planejadas', ['Planejada']],
  ];
  const GROUPS = [
    { key: 'situacao', title: 'Situação' },
    { key: 'adm', title: 'Administração' },
    { key: 'uf', title: 'UF', grid: true },
    { key: 'br', title: 'Rodovia (BR)', searchable: true },
    { key: 'superficie', title: 'Superfície' },
    { key: 'jurisdicao', title: 'Jurisdição' },
    { key: 'tipo', title: 'Tipo de trecho' },
  ];
  const UF_TOP = 10;
  const ICON = {
    search: '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><circle cx="11" cy="11" r="6" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M20 20l-4.5-4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    close: '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    chev: '<svg class="chev" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  };
  const fmtInt = new Intl.NumberFormat('pt-BR');
  const fmtKmNum = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const F = Model.FIELD, T = Model.T, I_FIS = 15, I_EST = 14, I_UL = 8;

  const ANOS = [2023, 2024, 2025, 2026, 2027];
  let snv, index, filters, showAllUf = false, refreshTimer = null;
  let conc, states, concFilters, intel = null;
  const IM = IntelModel;
  const MODE_LIST = [['concessoes', 'Concessões'], ['fisica', 'Situação física'], ['trafego', 'Tráfego'],
    ['pesados', 'Pesados'], ['carga', 'Carga agrícola'], ['acidentes', 'Acidentes']];
  const TIPO_LABEL = { modelado: 'Estimativa de modelo', medido: 'Contagem medida' };
  // Faixas da legenda por modo quantitativo.
  const RANGE_FMT = { trafego: IM.fmtInt, pesados: IM.fmtInt, carga: IM.fmtT, acidentes: x => IM.fmtDec(x, 2) };
  let suggestions = [], activeSug = -1, activeSearch = null;

  const $ = sel => document.querySelector(sel);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function displayValue(key, v) {
    if (key === 'br') return 'BR-' + v;
    if (key === 'superficie') return SUPERFICIE[v] || v;
    return v;
  }

  // Índices do dicionário na ordem de exibição, sem valores vazios.
  function orderedValues(key) {
    const vals = snv.dict[key].map((v, i) => ({ v, i })).filter(x => x.v !== '');
    if (key === 'situacao') vals.sort((a, b) => SIT_ORDER.indexOf(a.v) - SIT_ORDER.indexOf(b.v));
    else if (key === 'br') vals.sort((a, b) => Number(a.v) - Number(b.v));
    return vals;
  }

  // ---------- Busca ----------
  function renderSearch() {
    $('#search-section').innerHTML = `
      <h2 class="section-title">Buscar</h2>
      <div class="search">
        <div class="search__field">
          ${ICON.search}
          <input id="search-input" class="search__input" type="search" autocomplete="off" spellcheck="false"
            placeholder="BR, trecho ou localidade" aria-label="Buscar BR, código do trecho ou localidade"
            role="combobox" aria-expanded="false" aria-controls="suggestions" aria-autocomplete="list">
        </div>
        <ul id="suggestions" class="suggestions" role="listbox" hidden></ul>
      </div>
      <p class="search__hint">Ex.: BR-116, 040BMG, Sobradinho</p>
      <div id="active-search"></div>`;
    const input = $('#search-input');
    input.addEventListener('input', () => updateSuggestions(input.value));
    input.addEventListener('keydown', onSearchKey);
    input.addEventListener('blur', () => setTimeout(closeSuggestions, 150));
    input.addEventListener('focus', () => { if (input.value) updateSuggestions(input.value); });
  }

  // Entidades do RoadShow (nome, concessionária, vencedor) vêm antes das sugestões do SNV.
  function searchEntities(q) {
    const nq = Model.normalize(q);
    if (nq.length < 3 || !conc || /^(br)?[\s-]*\d{1,3}$/.test(nq)) return [];
    return conc.entidades.map((e, i) => ({ e, i }))
      .filter(({ e }) => Model.normalize(`${e.nome} ${e.nome_contrato || ''} ${e.grupo_vencedor || ''}`).includes(nq))
      .slice(0, 6)
      .map(({ e, i }) => ({ kind: 'entidade', label: e.nome, sub: `${concLabel(e.estado)} · ${ConcModel.brsUfs(e)}`, iEnt: i }));
  }

  function concLabel(k) { return (conc.estados.find(x => x.key === k) || {}).label || k; }

  function updateSuggestions(q) {
    suggestions = [...searchEntities(q), ...Model.search(index, q)].slice(0, 14);
    activeSug = suggestions.length ? 0 : -1;
    const ul = $('#suggestions');
    if (!q.trim()) { closeSuggestions(); return; }
    ul.innerHTML = suggestions.length
      ? suggestions.map((s, k) => `<li role="option" id="sug-${k}" data-k="${k}" aria-selected="${k === activeSug}">
          <span class="s-label">${esc(s.label)}</span>
          <span class="s-sub">${s.kind === 'br' ? '<span class="s-kind">Rodovia inteira</span>' : s.kind === 'entidade' ? `<span class="s-kind">${esc(s.sub)}</span>` : esc(s.sub)}</span></li>`).join('')
      : '<li class="s-empty" aria-disabled="true">Nada encontrado</li>';
    ul.hidden = false;
    $('#search-input').setAttribute('aria-expanded', 'true');
    ul.querySelectorAll('li[data-k]').forEach(li => li.addEventListener('mousedown', e => {
      e.preventDefault();
      selectSuggestion(suggestions[Number(li.dataset.k)]);
    }));
  }

  function closeSuggestions() {
    const ul = $('#suggestions');
    if (!ul) return;
    ul.hidden = true;
    $('#search-input').setAttribute('aria-expanded', 'false');
  }

  function onSearchKey(e) {
    const ul = $('#suggestions');
    const open = !ul.hidden && suggestions.length;
    if (e.key === 'ArrowDown' && open) { e.preventDefault(); moveSug(1); }
    else if (e.key === 'ArrowUp' && open) { e.preventDefault(); moveSug(-1); }
    else if (e.key === 'Enter' && open && activeSug >= 0) { e.preventDefault(); selectSuggestion(suggestions[activeSug]); }
    else if (e.key === 'Escape') {
      if (!ul.hidden) { e.stopPropagation(); closeSuggestions(); } else clearSearch();
    }
  }

  function moveSug(d) {
    activeSug = (activeSug + d + suggestions.length) % suggestions.length;
    $('#suggestions').querySelectorAll('li[data-k]').forEach((li, k) => li.setAttribute('aria-selected', String(k === activeSug)));
    const li = $(`#sug-${activeSug}`);
    if (li) { li.scrollIntoView({ block: 'nearest' }); $('#search-input').setAttribute('aria-activedescendant', li.id); }
  }

  function selectSuggestion(s) {
    if (!s) return;
    closeSuggestions();
    let ids;
    if (s.kind === 'entidade') {
      ids = conc.entFis[s.iEnt];
      activeSearch = { label: s.label, ids, ent: conc.entidades[s.iEnt].id };
      MapView.highlight(ids);
      MapView.fitTo(ids);
      renderActiveSearch();
      return;
    }
    if (s.kind === 'br') {
      const set = new Set();
      snv.trechos.forEach(t => { if (t[F.br] === s.iBr) set.add(t[I_FIS]); });
      ids = [...set];
    } else {
      ids = [snv.trechos[s.iRec][I_FIS]];
    }
    activeSearch = { label: s.kind === 'br' ? s.label : `${s.label} · ${s.sub}`, ids };
    MapView.highlight(ids);
    MapView.fitTo(ids);
    if (s.kind !== 'br') openCard(ids[0], s.iRec);
    renderActiveSearch();
  }

  // "Ver no mapa" de qualquer aba: vira um destaque como o da busca (chip, limpar, Esc).
  function showOnMap(label, ids, entId = null) {
    Tabs.go('#mapa');
    setTimeout(() => {
      activeSearch = { label, ids, ent: entId };
      MapView.highlight(ids);
      MapView.fitTo(ids);
      renderActiveSearch();
    }, 50);
  }

  function renderActiveSearch() {
    const el = $('#active-search');
    if (!activeSearch) { el.innerHTML = ''; return; }
    el.innerHTML = `<div class="active-search"><span>Em destaque: ${esc(activeSearch.label)}</span>
      ${activeSearch.ent ? `<a class="link-btn" href="#ficha/${esc(activeSearch.ent)}">Ver ficha</a>` : ''}
      <button class="icon-btn" type="button" id="clear-search" aria-label="Limpar destaque">${ICON.close}</button></div>`;
    $('#clear-search').addEventListener('click', clearSearch);
  }

  function clearSearch() {
    activeSearch = null;
    MapView.highlight(null);
    $('#search-input').value = '';
    renderActiveSearch();
  }

  // ---------- Filtros ----------
  function renderFilters() {
    const groupsHtml = GROUPS.map(g => {
      const vals = orderedValues(g.key);
      const items = vals.map(({ v, i }) => {
        const label = displayValue(g.key, v);
        const sw = g.key === 'situacao' ? styleSwatch(v, 24) : '';
        return `<label class="check" data-text="${esc(Model.normalize(label))}"><input type="checkbox" data-filter="${g.key}" data-label="${esc(label)}" value="${i}">${sw}<span>${esc(label)}</span></label>`;
      }).join('');
      const shortcuts = g.key === 'situacao'
        ? `<div class="chips">${SIT_SHORTCUTS.map(([name], k) => `<button type="button" class="chip" data-shortcut="${k}" aria-pressed="false">${name}</button>`).join('')}</div>`
        : '';
      const finder = g.searchable ? `<input class="mini-input" type="search" data-finder="${g.key}" placeholder="Filtrar lista de BRs" aria-label="Filtrar lista de BRs">` : '';
      const listCls = g.grid ? 'checks checks--grid' : g.searchable ? 'checks check-list' : 'checks';
      return `<details class="fgroup" data-group="${g.key}">
        <summary><span>${g.title}<span class="count" data-count="${g.key}" hidden></span></span>${ICON.chev}</summary>
        <div class="fgroup__body">${shortcuts}${finder}<div class="${listCls}">${items}</div></div></details>`;
    }).join('');
    $('#filters-section').innerHTML = `
      <div class="filters-head"><h2 class="section-title">Filtros</h2>
        <button type="button" class="btn" id="clear-filters" disabled>Limpar filtros</button></div>
      ${concGroupsHtml()}${groupsHtml}`;
    $('#filters-section').addEventListener('change', e => {
      const t = e.target;
      if (!t.dataset.cfilter) return;
      const set = concFilters[t.dataset.cfilter];
      const v = t.dataset.cfilter === 'estado' ? t.value : Number(t.value);
      if (t.checked) set.add(v); else set.delete(v);
      scheduleRefresh();
    });

    $('#filters-section').addEventListener('change', e => {
      const t = e.target;
      if (!t.dataset.filter) return;
      const set = filters[t.dataset.filter];
      if (t.checked) set.add(Number(t.value)); else set.delete(Number(t.value));
      scheduleRefresh();
    });
    $('#filters-section').querySelectorAll('[data-shortcut]').forEach(b => b.addEventListener('click', () => {
      const names = SIT_SHORTCUTS[Number(b.dataset.shortcut)][1];
      const ids = names.map(n => snv.dict.situacao.indexOf(n)).filter(i => i >= 0);
      const allOn = ids.every(i => filters.situacao.has(i));
      ids.forEach(i => (allOn ? filters.situacao.delete(i) : filters.situacao.add(i)));
      syncChecks();
      scheduleRefresh();
    }));
    $('#filters-section').querySelectorAll('[data-finder]').forEach(inp => inp.addEventListener('input', () => {
      const q = inp.dataset.finder === 'br' ? Model.normalize(inp.value).replace(/^br[\s-]*/, '') : Model.normalize(inp.value);
      inp.parentElement.querySelectorAll('.check').forEach(l => { l.hidden = q && !l.dataset.text.includes(q); });
    }));
    $('#clear-filters').addEventListener('click', () => {
      filters = Model.emptyFilters();
      concFilters = ConcModel.emptyConcFilters();
      syncChecks();
      scheduleRefresh(0);
    });
  }

  function concGroupsHtml() {
    const check = (key, value, label, sw = '', text = label) => `<label class="check" data-text="${esc(Model.normalize(text))}"><input type="checkbox" data-cfilter="${key}" data-label="${esc(label)}" value="${esc(value)}">${sw}<span>${esc(label)}</span></label>`;
    const group = (key, title, body, extra = '') => `<details class="fgroup" data-group="c-${key}">
      <summary><span>${title}<span class="count" data-count="c-${key}" hidden></span></span>${ICON.chev}</summary>
      <div class="fgroup__body">${extra}${body}</div></details>`;
    const ents = conc.entidades.map((e, i) => ({ e, i })).sort((a, b) => a.e.nome.localeCompare(b.e.nome, 'pt-BR'));
    return group('estado', 'Estado da concessão', `<div class="checks">${conc.estados.map(s => check('estado', s.key, s.label, concStyleSwatch(s.key, 24))).join('')}</div>`) +
      group('ent', 'Projeto / contrato', `<div class="checks check-list">${ents.map(({ e, i }) => check('ent', i, e.nome, '', `${e.nome} ${e.nome_contrato || ''}`)).join('')}</div>`,
        '<input class="mini-input" type="search" data-finder="ent" placeholder="Filtrar projetos" aria-label="Filtrar lista de projetos">') +
      group('ano', 'Ano do programa', `<div class="checks">${ANOS.map(a => check('ano', a, String(a))).join('')}</div>`);
  }

  function syncChecks() {
    document.querySelectorAll('input[data-filter]').forEach(inp => {
      inp.checked = filters[inp.dataset.filter].has(Number(inp.value));
    });
    document.querySelectorAll('input[data-cfilter]').forEach(inp => {
      const k = inp.dataset.cfilter;
      inp.checked = concFilters[k].has(k === 'estado' ? inp.value : Number(inp.value));
    });
    document.querySelectorAll('[data-shortcut]').forEach(b => {
      const ids = SIT_SHORTCUTS[Number(b.dataset.shortcut)][1].map(n => snv.dict.situacao.indexOf(n)).filter(i => i >= 0);
      b.setAttribute('aria-pressed', String(ids.length > 0 && ids.every(i => filters.situacao.has(i))));
    });
  }

  function toggleFilter(key, i) {
    const set = filters[key];
    if (set.has(i)) set.delete(i); else set.add(i);
    syncChecks();
    scheduleRefresh(0);
  }

  // ---------- Números ----------
  function bars(list, key, cls = '') {
    if (!list.length) return '<p class="empty">Nenhum trecho na seleção.</p>';
    return `<ul class="bars ${cls}">${list.map(x => {
      const v = snv.dict[key][x.i];
      const label = displayValue(key, v);
      const sw = key === 'situacao' ? styleSwatch(v, 24) : '';
      const pressed = filters[key].has(x.i);
      return `<li><button type="button" class="bar" data-bar="${key}" data-i="${x.i}" aria-pressed="${pressed}"
        title="${pressed ? 'Remover' : 'Filtrar por'} ${esc(label)}">
        <span class="bar__label">${sw}<span>${esc(label)}</span></span>
        <span class="bar__value">${fmtKmNum.format(x.km)} km</span>
        <span class="bar__track"><span class="bar__fill" style="width:${(x.pct * 100).toFixed(1)}%"></span></span>
      </button></li>`;
    }).join('')}</ul>`;
  }

  function concBars(list, total) {
    if (!list.length) return '<p class="empty">Nenhum trecho na seleção.</p>';
    return `<ul class="bars">${list.map(x => {
      const pressed = concFilters.estado.has(x.key);
      return `<li><button type="button" class="bar" data-cbar="${x.key}" aria-pressed="${pressed}" title="${pressed ? 'Remover' : 'Filtrar por'} ${esc(concLabel(x.key))}">
        <span class="bar__label">${concStyleSwatch(x.key, 24)}<span>${esc(concLabel(x.key))}</span></span>
        <span class="bar__value">${fmtKmNum.format(x.km)} km</span>
        <span class="bar__track"><span class="bar__fill" style="width:${total > 0 ? (x.km / total * 100).toFixed(1) : 0}%"></span></span>
      </button></li>`;
    }).join('')}</ul>`;
  }

  function renderStats(a) {
    const ufList = showAllUf ? a.porUf : a.porUf.slice(0, UF_TOP);
    const more = a.porUf.length > UF_TOP
      ? `<button type="button" class="link-btn" id="toggle-uf">${showAllUf ? 'Mostrar só as 10 maiores' : `Ver todas as ${a.porUf.length} UFs`}</button>`
      : '';
    $('#stats-section').innerHTML = `
      <h2 class="section-title">Números da seleção</h2>
      <div class="kpi"><span class="kpi__value" id="kpi-km">${Model.fmtKm(a.km)}</span>
        <span class="kpi__sub" id="kpi-n">${fmtInt.format(a.n)} ${a.n === 1 ? 'trecho' : 'trechos'}</span></div>
      <p class="note">Extensão oficial do SNV. Trechos coincidentes entre BRs contados uma vez.</p>
      ${intelStats(a.intel)}
      <h3 class="section-title">Por estado da concessão</h3>${concBars(a.porEstado, a.km)}
      <h3 class="section-title">Por situação</h3>${bars(a.porSituacao, 'situacao')}
      <h3 class="section-title">Por administração</h3>${bars(a.porAdm, 'adm')}
      <h3 class="section-title">Por UF</h3>${bars(ufList, 'uf', 'bars--uf')}${more}`;
    $('#stats-section').querySelectorAll('[data-bar]').forEach(b =>
      b.addEventListener('click', () => toggleFilter(b.dataset.bar, Number(b.dataset.i))));
    $('#stats-section').querySelectorAll('[data-cbar]').forEach(b => b.addEventListener('click', () => {
      const k = b.dataset.cbar;
      if (concFilters.estado.has(k)) concFilters.estado.delete(k); else concFilters.estado.add(k);
      syncChecks();
      scheduleRefresh(0);
    }));
    const t = $('#toggle-uf');
    if (t) t.addEventListener('click', () => { showAllUf = !showAllUf; renderStats(a); });
  }

  // ---------- Camadas de inteligência (v3) ----------
  const vmdaOf = () => IM.vmdaOf(intel), acidOf = () => IM.acidOf(intel), cargaOf = () => IM.cargaOf(intel);
  // [2024, 2025] -> "2024–25"; um ano só -> "2024".
  function anosLabel(anos) {
    if (!Array.isArray(anos) || !anos.length) return '';
    const a = Math.min(...anos), b = Math.max(...anos);
    return a === b ? String(a) : `${a}–${String(b).slice(-2)}`;
  }
  const vmdaRef = () => { const v = vmdaOf(); return v ? `VMDa ${v.ano}` : 'VMDa'; };
  const prfRef = () => { const a = acidOf(); const y = a && anosLabel(a.anos); return y ? `PRF ${y}` : 'PRF'; };
  const pnlRef = () => { const c = cargaOf(); return c ? `${c.cenario || 'PNL 2035'} ${c.ano_base}` : 'PNL 2035'; };
  const kmTxt = km => `${fmtKmNum.format(km)} km com dado`;

  // Bloco do painel "Números da seleção": só soma trechos com dado; cada número explica a fonte no title.
  function intelStats(ag) {
    if (!ag) return '';
    const pctPes = ag.vkm > 0 ? ag.vkmPes / ag.vkm : null;
    const tile = (id, value, sub, title) => `<div class="ikpi" title="${esc(title)}">
        <span class="ikpi__value" id="${id}">${esc(value)}</span><span class="ikpi__sub">${esc(sub)}</span></div>`;
    const cov = (km, base) => (km != null && ag.kmPav > 0 ? ` · ${kmTxt(km)} de ${fmtKmNum.format(base)} km` : '');
    return `<div class="ikpis">
      ${tile('kpi-vkm', IM.fmtVkm(ag.vkm),
        `${pctPes == null ? '—' : IM.fmtPct(pctPes)} pesados · Tráfego ${vmdaRef()}, estimado${cov(ag.kmVmda, ag.kmPav)}`,
        `Soma de VMDa × extensão nos trechos visíveis que têm estimativa; % de pesados = veíc·km pesados ÷ veíc·km total. Fonte: ${IM.MODES.trafego.fonte(intel)} — estimativa de modelo, não contagem.`)}
      ${tile('kpi-acid', ag.acidAno == null ? '—' : `${IM.fmtInt(ag.acidAno)} acidentes/ano`,
        `${ag.mortosAno == null ? '—' : IM.fmtInt(ag.mortosAno)} mortos/ano · ${prfRef()}, medido`,
        `Média anual de acidentes e de mortos registrados pela PRF nos trechos visíveis. Fonte: ${IM.MODES.acidentes.fonte(intel)} — contagem medida de ocorrências.`)}
      ${tile('kpi-tkm', IM.fmtTkm(ag.tkm),
        `Carga agrícola · ${pnlRef()}, modelado${cov(ag.kmCarga, ag.kmPav)}`,
        `Soma de carga agrícola (t/ano) × extensão nos trechos visíveis que casaram com a rede do PNL. Fonte: ${IM.MODES.carga.fonte(intel)} — estimativa de modelo.`)}
    </div>`;
  }

  // Bloco "Tráfego e segurança" do cartão (números de IntelModel.fisIntel); omitido se o físico não tem nenhum dado.
  function intelBlock(j) {
    const vm = vmdaOf(), ac = acidOf(), ca = cargaOf(), f = IM.fisIntel(intel, snv, j);
    const groups = [];
    const group = (title, rows) => {
      const body = rows.filter(([, v]) => v != null).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('');
      if (body) groups.push(`<dt class="card__sub">${esc(title)}</dt>${body}`);
    };
    const fmt = (v, fn) => (v == null ? null : fn(v));
    if (vm) {
      group(`VMDa · estimado, ${vm.ano}`, [
        ['Leves', fmt(f.l, IM.fmtVmd)], ['Pesados', fmt(f.p, IM.fmtVmd)],
        ['Total', fmt(f.tot, IM.fmtVmd)], ['% pesados', fmt(f.pctPes, IM.fmtPct)],
      ]);
    }
    if (ac) {
      group(`Acidentes · ${prfRef()}, medido`, [
        ['Acidentes/ano', fmt(f.acidAno, x => IM.fmtDec(x, 1))],
        ['Mortos/ano', fmt(f.mortosAno, x => IM.fmtDec(x, 1))],
        ['Acidentes por 10⁶ veíc·km', fmt(f.taxa, x => IM.fmtDec(x, 2))],
      ]);
    }
    if (ca) group(`Carga agrícola · modelo PNL, ${ca.ano_base}`, [['Carga agrícola', fmt(f.gsa, x => `${IM.fmtT(x)}/ano`)]]);
    if (!groups.length) return '';
    return `<div class="card__intel"><h3 class="section-title">Tráfego e segurança</h3><dl class="card__grid">${groups.join('')}</dl></div>`;
  }

  // ---------- Camadas de sobreposição (v3, Task 10) ----------
  const LAYERS_NOTE = 'Medido: praças, SATs (ANTT), PAM, Estoques. Modelado: VMDa, carga PNL.';
  const PROD_LABEL = { soja: 'Soja', milho1: 'Milho 1ª safra', milho2: 'Milho 2ª safra', cana: 'Cana-de-açúcar', algodao: 'Algodão', trigo: 'Trigo', cafe: 'Café' };
  const QUALIDADE = { ok: 'Recorte ok', aproximado: 'Aproximado', nao_mapeado: 'Não mapeado' };

  function renderLayers() {
    let sec = $('#layers-section');
    if (!sec) {
      sec = document.createElement('section');
      sec.className = 'panel__section';
      sec.id = 'layers-section';
      $('#filters-section').before(sec);
    }
    const avail = Layers.available();
    // Rodovias estaduais: sublegenda distingue a malha das concessões estaduais (clicáveis).
    const sub = d => (d.key === 'estaduais'
      ? `<div class="layer-sub"><span>${layerSwatch('estaduais-malha')}Malha estadual</span><span>${layerSwatch('estconc')}Concessões estaduais</span></div>` : '');
    const checks = avail.map(d => `<label class="check" title="${esc(d.title)}"><input type="checkbox" data-layer="${d.key}">${layerSwatch(d.key)}` +
      `<span>${esc(d.label)}</span><span class="muted">${fmtInt.format(d.n)}</span></label>${sub(d)}`).join('');
    const fundo = Layers.fundoAvailable() ? `<fieldset class="fundo"><legend class="fundo__title">Fundo municipal</legend><div class="fundo__opts">
        <label class="check"><input type="radio" name="fundo" value="" checked><span>Nenhum</span></label>
        ${IM.FUNDOS.map(f => `<label class="check" title="${esc(`${IM.fundoFonte(intel, f.key)} · por município, 5 classes por quantil`)}"><input type="radio" name="fundo" value="${f.key}"><span>${esc(f.label)}</span></label>`).join('')}
      </div></fieldset>` : '';
    sec.innerHTML = `<details class="layers" id="layers" open>
        <summary><h2 class="section-title">Camadas</h2>${ICON.chev}</summary>
        <div class="layers__body">
          ${checks ? `<div class="checks">${checks}</div>` : '<p class="empty">Sem camadas neste arquivo.</p>'}
          ${fundo}
          <p class="note layers__note">${esc(LAYERS_NOTE)}</p>
        </div></details>`;
    sec.addEventListener('change', e => {
      const t = e.target;
      if (t.dataset.layer) Layers.toggle(t.dataset.layer, t.checked);
      else if (t.name === 'fundo') { Layers.setFundo(t.value || null); renderFundoLegend(); }
    });
  }

  function renderFundoLegend() {
    let el = $('#fundo-legend');
    if (!el) {
      el = document.createElement('div');
      el.id = 'fundo-legend';
      el.className = 'legend fundo-legend';
      $('#map').after(el);
    }
    const f = Layers.fundoInfo();
    el.hidden = !f;
    if (!f) { el.innerHTML = ''; return; }
    const rows = [];
    if (f.max != null) {
      for (let c = 0; c <= f.breaks.length; c++) {
        const lo = c === 0 ? f.min : f.breaks[c - 1], hi = c === f.breaks.length ? f.max : f.breaks[c];
        rows.push(`<div class="legend__row" data-class="${c}">${fundoSwatch(c)}<span class="legend__range">${esc(IM.fmtT(lo))} – ${esc(IM.fmtT(hi))}</span></div>`);
      }
    }
    rows.push(`<div class="legend__row">${fundoSwatch(-1)}<span>Sem dado ou zero</span></div>`);
    const sig = f.key === 'armazenagem'
      ? `<p class="legend__note">Sigilo: o IBGE não divulga a capacidade de municípios com poucos informantes (${fmtInt.format(f.sigilo)} municípios); ficam sem preenchimento.</p>`
      : `<p class="legend__note">Produção ${esc(String(f.ano))} por município; sem dado ("...") ou zero ficam sem preenchimento.</p>`;
    el.innerHTML = `<h2 class="section-title">Fundo municipal</h2>
      <div class="legend__title">${esc(f.label)} <span>${f.key === 'armazenagem' ? 't de capacidade útil' : `t · ${esc(String(f.ano))}`}</span></div>
      ${rows.join('')}${sig}<div class="legend__tipo">Dado medido</div><div class="legend__src">Fonte: ${esc(f.fonte)}</div>`;
  }

  // Cartão de ponto (praça, SAT, obra, porto) ou município, no mesmo #card do trecho.
  function showCard(title, code, body, hl) {
    const card = $('#card');
    card.innerHTML = `<div class="card__head">
        <div><h2 class="card__title">${esc(title)}</h2><span class="card__code">${esc(code)}</span></div>
        <button class="icon-btn" type="button" id="card-close" aria-label="Fechar">${ICON.close}</button>
      </div>${body}`;
    card.hidden = false;
    card.scrollTop = 0;
    $('#card-close').addEventListener('click', closeCard);
    const base = activeSearch ? activeSearch.ids : [];
    MapView.highlight(hl != null ? [...base, hl] : base.length ? base : null);
  }

  const grid = rows => {
    const body = rows.filter(([, v]) => v != null && v !== '' && v !== '—').map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('');
    return body ? `<dl class="card__grid">${body}</dl>` : '';
  };

  // Concessão do ponto: nome da entidade do RoadShow (com "Ver ficha" quando há ficha) ou o nome ANTT.
  function pointConc(ent, nomeAntt) {
    const e = ent && conc ? conc.entidades.find(x => x.id === ent) : null;
    const nome = e ? e.nome : nomeAntt;
    if (!nome) return '';
    const link = e && typeof Ficha !== 'undefined' && Ficha.exists(ent) ? `<a class="btn" href="#ficha/${esc(ent)}">Ver ficha</a>` : '';
    return `<div class="card__conc"><h3 class="section-title">Concessão</h3><div class="conc-item">
      <span class="conc-item__name">${esc(nome)}${e && nomeAntt && Model.normalize(nomeAntt) !== Model.normalize(e.nome) ? `<span class="conc-item__sub">ANTT: ${esc(nomeAntt)}</span>` : ''}</span>${link}</div></div>`;
  }

  const kmFmt = v => (IM.has(v) ? fmtKmNum.format(v) : null);
  const rodUf = r => `${IM.rodLabel(r.br, r.uf)}${r.uf ? ` / ${r.uf}` : ''}`;
  const pctOf = (a, b) => (IM.has(a) && IM.has(b) && b > 0 ? a / b : null);
  const periodoFmt = p => {
    const m = /^(\d{4}-\d{2})\/(\d{4}-\d{2})$/.exec(String(p || ''));
    return m ? `${IM.monthLabel(m[1])} a ${IM.monthLabel(m[2])}` : p ? String(p) : null;
  };

  // Série mensal leves × pesados da praça i (Charts.linesSvg com x = ano + mês/12; dicas reescritas como "jan/2024").
  function pracaChart(i) {
    const p = intel.antt.pracas, meses = p.serie_meses || [], sl = (p.serie_l || [])[i] || [], sp = (p.serie_p || [])[i] || [];
    const xOf = ym => { const [y, m] = ym.split('-').map(Number); return y + (m - 1) / 12; };
    const pts = arr => meses.map((ym, k) => ({ x: xOf(ym), y: arr[k] })).filter(q => IM.has(q.y));
    const series = [{ name: 'Leves', points: pts(sl) }, { name: 'Pesados', points: pts(sp) }];
    if (!series[0].points.length && !series[1].points.length) return '';
    const label = x => { const y = Math.floor(x + 1e-6); return IM.monthLabel(`${y}-${String(Math.round((x - y) * 12) + 1).padStart(2, '0')}`); };
    const svg = Charts.linesSvg(series, { width: 312, height: 200, format: v => IM.fmtInt(v), unit: ' veíc./dia', title: 'Tráfego mensal da praça: leves e pesados' })
      .replace(/<title>(Leves|Pesados) ([\d.]+):/g, (_, n, x) => `<title>${n} ${label(Number(x))}:`);
    const per = meses.length ? `${IM.monthLabel(meses[0])} a ${IM.monthLabel(meses[meses.length - 1])}` : '';
    return `<div class="card__chart"><h3 class="section-title">Tráfego mensal · ${esc(per)}</h3>
      ${Charts.legendHtml([['Leves', Charts.C.deep], ['Pesados', Charts.C.bright]])}<div class="card__svg">${svg}</div>
      <p class="card__src">Contagem medida · ANTT (média diária do mês, dois sentidos)</p></div>`;
  }

  function openPoint(key, i) {
    const r = Layers.rowsOf(key)[i];
    if (!r) return;
    if (key === 'pracas') {
      showCard(r.nome, `Praça de pedágio · ${rodUf(r)}${kmFmt(r.km) ? ` · km ${kmFmt(r.km)}` : ''}`,
        `<div class="card__badges"><span class="badge">Contagem medida · ANTT</span></div>
        ${grid([
          ['VMD 2025', IM.fmtVmd(r.vmd)], ['Leves', IM.fmtVmd(r.leves)], ['Pesados', IM.fmtVmd(r.pesados)], ['Motos', IM.fmtVmd(r.moto)],
          ['% pesados', IM.fmtPct(pctOf(r.pesados, r.vmd))], ['Eixos médios do comercial', IM.has(r.eixos) ? IM.fmtDec(r.eixos, 1) : null],
          ['Receita 2025', IM.fmtBRL(r.receita)], ['Meses com dado em 2025', IM.has(r.meses) ? String(r.meses) : null],
        ])}${pointConc(r.ent, r.conc)}${pracaChart(i)}`, r.fis);
    } else if (key === 'sats') {
      showCard(`SAT ${r.id}`, `Equipamento de contagem · ${rodUf(r)}`,
        `<div class="card__badges"><span class="badge">Contagem medida · ANTT</span></div>
        ${grid([
          ['VMD', IM.fmtVmd(r.vmd)], ['% pesados', IM.fmtPct(r.pes)], ['% motos', IM.fmtPct(r.moto)],
          ['Período', periodoFmt(r.periodo)], ['Meses com dado', IM.has(r.meses) ? String(r.meses) : null],
        ])}${pointConc(r.ent, r.conc)}`, r.fis);
    } else if (key === 'obras') {
      const km = kmFmt(r.km_i) ? `km ${kmFmt(r.km_i)}${kmFmt(r.km_f) && r.km_f !== r.km_i ? `–${kmFmt(r.km_f)}` : ''}` : null;
      showCard(r.descricao || r.tipo || 'Obra', `Obra ANTT · ${rodUf(r)}`,
        `${grid([
          ['Tipo', r.tipo], ['Localização', km], ['Ano', IM.has(r.ano) ? String(r.ano) : null],
          ['Previsto', IM.fmtPct(r.previsto)], ['Executado', IM.fmtPct(r.executado)],
        ])}<p class="card__src card__pad">Previsto × executado no ano · ANTT, acompanhamento anual de investimentos</p>${pointConc(r.ent, null)}`, r.fis);
    } else if (key === 'estconc') {
      openEstConc(r);
    } else if (key === 'portos') {
      showCard(r.nome, `${r.tipoLabel || r.tipo} · ${r.uf || '—'}`,
        `${grid([['Tipo', r.tipoLabel || r.tipo], ['Tipo ANTAQ', r.tipoLabel && r.tipoLabel !== r.tipo ? r.tipo : null], ['UF', r.uf]])}
        <p class="card__src card__pad">ANTAQ, instalações portuárias</p>`, null);
    }
  }

  // Cartão de concessão estadual (estaduais.entidades).
  function openEstConc(e) {
    const km = v => (IM.has(v) ? Model.fmtKm(v) : '—');
    const datas = [e.assinatura, e.fim].some(Boolean) ? `${ConcModel.fmtData(e.assinatura)} / ${ConcModel.fmtData(e.fim)}` : null;
    const capex = IM.has(e.capex_bi) ? `${IM.fmtBRL(e.capex_bi * 1e9)}${e.capex_ref ? ` (ref. ${e.capex_ref})` : ''}` : null;
    const link = e.fonte_url ? `<p class="card__src card__pad"><a class="link-btn" href="${esc(e.fonte_url)}" target="_blank" rel="noopener">Fonte: ${esc(e.regulador || e.poder || 'página oficial')}</a></p>` : '';
    showCard(e.nome, `Concessão estadual · ${e.uf || '—'}${e.regulador ? ` · ${e.regulador}` : ''}`,
      `<div class="card__badges"><span class="badge">${layerSwatch('estconc')}${esc(QUALIDADE[e.qualidade] || e.qualidade || '—')}</span></div>
      ${grid([
        ['UF', e.uf], ['Regulador', e.regulador || e.poder], ['Rodovias', (e.rodovias || []).join(', ')],
        ['km declarado × mapeado', `${km(e.km_decl)} × ${km(e.km_map)}`], ['Grupo', e.grupo || e.controlador],
        ['Assinatura / fim', datas], ['Capex', capex],
      ])}${e.nota ? `<p class="card__src card__pad">${esc(e.nota)}</p>` : ''}${link}`, null);
  }

  function openMun(id) {
    const m = IM.munInfo(intel, id);
    if (!m) return;
    const t = v => (IM.has(v) ? `${IM.fmtInt(v)} t` : '—');
    const prod = IM.PRODUTOS.map(p => `<dt>${esc(PROD_LABEL[p])}</dt><dd>${esc(t(m.prod[p]))}</dd>`).join('');
    const arm = m.sigilo ? 'sigilo' : t(m.cap);
    showCard(`${m.nome} / ${m.uf}`, `Município · IBGE ${m.id}`,
      `<dl class="card__grid"><dt class="card__sub">Produção ${esc(String(m.ano || ''))} · IBGE PAM, medido</dt>${prod}
        <dt class="card__sub">Armazenagem · IBGE Estoques ${esc(m.periodoArm || '')}</dt><dt>Capacidade útil</dt><dd>${esc(arm)}</dd></dl>
      ${m.sigilo ? '<p class="card__src card__pad">Sigilo: o IBGE não divulga a capacidade quando há poucos informantes no município.</p>' : ''}`, null);
  }

  // Lista "Medições no trecho" (praças e SATs do físico j), clicável.
  function measBlock(j) {
    const items = [];
    for (const key of ['pracas', 'sats']) {
      const rows = Layers.rowsOf(key);
      for (const i of IM.pointsOfFis(rows, j)) {
        const r = rows[i];
        items.push(`<li><button type="button" class="meas" data-pt="${key}" data-i="${i}">
          <span class="meas__name">${esc(key === 'pracas' ? r.nome : `SAT ${r.id}`)}<span class="meas__kind">${key === 'pracas' ? 'Praça de pedágio' : 'SAT'}</span></span>
          <span class="meas__v">${esc(IM.fmtVmd(r.vmd))}</span></button></li>`);
      }
    }
    if (!items.length) return '';
    return `<div class="card__meas"><h3 class="section-title">Medições no trecho</h3><ul class="meas-list">${items.join('')}</ul>
      <p class="card__src">VMD medido 2025 · ANTT</p></div>`;
  }

  function scheduleRefresh(delay = 30) {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(refresh, delay);
  }

  function visibleMask() {
    const visible = Model.visibleFis(snv, filters);
    if (concFilters.estado.size || concFilters.ent.size || concFilters.ano.size) {
      for (let j = 0; j < visible.length; j++) if (visible[j] && !ConcModel.passes(conc, states, j, concFilters)) visible[j] = 0;
    }
    return visible;
  }

  function refresh() {
    const visible = visibleMask();
    MapView.setVisible(visible);
    const a = Model.aggregate(snv, filters, visible);
    a.porEstado = ConcModel.kmPorEstado(conc, states, visible, snv);
    a.intel = IM.aggregateIntel(intel, snv, visible);
    renderStats(a);
    let total = 0;
    const counts = GROUPS.map(g => [g.key, filters[g.key].size]).concat(['estado', 'ent', 'ano'].map(k => ['c-' + k, concFilters[k].size]));
    for (const [key, n] of counts) {
      total += n;
      const c = document.querySelector(`[data-count="${key}"]`);
      c.hidden = n === 0;
      c.textContent = n;
    }
    const btn = $('#clear-filters');
    btn.disabled = total === 0;
    btn.textContent = total ? `Limpar filtros (${total})` : 'Limpar filtros';
  }

  // ---------- Cartão ----------
  function openCard(j, iRecPreferred) {
    const fis = snv.fis[j];
    const recs = fis.r;
    const passing = recs.find(i => Model.recordPasses(snv, i, filters));
    const iMain = iRecPreferred != null && recs.includes(iRecPreferred) ? iRecPreferred : passing != null ? passing : recs[0];
    const main = snv.trechos[iMain];
    const d = snv.dict;
    const brs = [...new Set(recs.map(i => Model.brLabel(snv, snv.trechos[i][F.br])))];
    const sit = d.situacao[main[F.situacao]];
    const adm = d.adm[main[F.adm]];
    const row = (k, v) => v ? `<dt>${k}</dt><dd>${esc(v)}</dd>` : '';
    const coinc = recs.length > 1
      ? `<div class="card__coinc"><h3 class="section-title">Trecho coincidente</h3>${recs.map(i => {
          const t = snv.trechos[i];
          return `<div>${esc(Model.brLabel(snv, t[F.br]))} · km ${fmtKmNum.format(t[T.kmIni])}–${fmtKmNum.format(t[T.kmFim])} · ${esc(t[T.codigo])}</div>`;
        }).join('')}</div>`
      : '';
    const card = $('#card');
    card.innerHTML = `
      <div class="card__head">
        <div><h2 class="card__title">${esc(brs.join(' · '))} / ${esc(d.uf[main[F.uf]])}</h2>
          <span class="card__code">${esc(main[T.codigo])} · ${esc(d.tipo[main[F.tipo]])}</span></div>
        <button class="icon-btn" type="button" id="card-close" aria-label="Fechar">${ICON.close}</button>
      </div>
      <div class="card__route"><b>${esc(main[T.locIni])}</b><span class="arrow">→</span><b>${esc(main[T.locFim])}</b></div>
      <div class="card__badges"><span class="badge">${styleSwatch(sit, 24)}${esc(sit)}</span>${adm === CONCESSAO ? `<span class="badge">${esc(adm)}</span>` : ''}</div>
      <dl class="card__grid">
        ${row('Extensão', Model.fmtKm(main[T.ext]))}
        ${row('km inicial – final', `${fmtKmNum.format(main[T.kmIni])} – ${fmtKmNum.format(main[T.kmFim])}`)}
        ${row('Superfície', displayValue('superficie', d.superficie[main[F.superficie]]))}
        ${row('Jurisdição', d.jurisdicao[main[F.jurisdicao]])}
        ${row('Administração', adm)}
        ${row('Unidade local DNIT', d.ul[main[I_UL]])}
        ${row('Coincide com estadual', main[I_EST])}
      </dl>${concBlock(j)}${intelBlock(j)}${measBlock(j)}${coinc}`;
    card.hidden = false;
    card.scrollTop = 0;
    $('#card-close').addEventListener('click', closeCard);
    card.querySelectorAll('[data-pt]').forEach(b => b.addEventListener('click', () => Layers.open(b.dataset.pt, Number(b.dataset.i))));
    Layers.clearSelection();
    MapView.highlight([...(activeSearch ? activeSearch.ids : []), j]);
  }

  function concBlock(j) {
    const ents = ConcModel.entitiesOfFis(conc, j);
    const st = states[j];
    const body = ents.length ? ents.map(i => {
      const e = conc.entidades[i];
      const chave = ConcModel.dataChave(e);
      return `<div class="conc-item"><span class="conc-item__name">${concStyleSwatch(e.estado, 24)} ${esc(e.nome)}
        <span class="conc-item__sub">${esc(concLabel(e.estado))}${chave ? ` · ${e.estado === 'vigente' ? 'assinatura' : 'leilão'} ${esc(ConcModel.fmtData(chave))}` : ''}</span></span>
        <a class="btn" href="#ficha/${esc(e.id)}">Ver ficha</a></div>`;
    }).join('') : `<div class="conc-item"><span class="conc-item__name">${concStyleSwatch(st, 24)} ${esc(concLabel(st))}</span></div>`;
    return `<div class="card__conc"><h3 class="section-title">Concessão</h3>${body}</div>`;
  }

  // Fecha o cartão e volta ao realce da busca (ou a nenhum).
  function closeCard() {
    $('#card').hidden = true;
    Layers.clearSelection();
    MapView.highlight(activeSearch ? activeSearch.ids : null);
  }

  // ---------- Legenda ----------
  function quantLegend(mode) {
    const M = IM.MODES[mode], q = MapView.classes(mode) || { breaks: [], min: null, max: null };
    const fmt = RANGE_FMT[mode];
    const rows = [];
    if (q.max != null) {
      for (let c = 0; c <= q.breaks.length; c++) {
        const lo = c === 0 ? q.min : q.breaks[c - 1], hi = c === q.breaks.length ? q.max : q.breaks[c];
        rows.push(`<div class="legend__row" data-class="${c}">${quantSwatch(c)}<span class="legend__range">${esc(fmt(lo))} – ${esc(fmt(hi))}</span></div>`);
      }
    }
    rows.push(`<div class="legend__row">${quantSwatch(-1)}<span>Sem dado</span></div>`);
    return `<div class="legend__title">${esc(M.label)} <span>${esc(M.unidade)}</span></div>${rows.join('')}
      <div class="legend__tipo">${esc(TIPO_LABEL[M.tipo] || M.tipo)}</div>
      <div class="legend__src">Fonte: ${esc(M.fonte(intel))}</div>`;
  }

  function renderLegend() {
    const mode = MapView.colorMode();
    let items;
    if (QUANT_MODES.includes(mode)) items = quantLegend(mode);
    else {
      items = mode === 'concessoes'
        ? conc.estados.map(x => `<div class="legend__row">${concStyleSwatch(x.key)}<span>${esc(x.label)}</span></div>`).join('')
        : LEGEND_ITEMS.map(([sit, label]) => `<div class="legend__row">${styleSwatch(sit)}<span>${label}</span></div>`).join('') +
          `<div class="legend__sep"></div><div class="legend__row">${haloSwatch()}<span>Concessão federal</span></div>`;
      items += `<div class="legend__src">Fonte: DNIT · SNV ${esc(snv.versao)}${mode === 'concessoes' ? ` · RoadShow ${esc(conc.versaoRoadshow)}` : ''}</div>`;
    }
    $('#legend').innerHTML = `<h2 class="section-title">Cor das rodovias</h2>
      <div class="mode-switch" role="radiogroup" aria-label="Cor das rodovias">${MODE_LIST.map(([k, label]) =>
        `<button type="button" role="radio" data-mode="${k}" aria-checked="${mode === k}" tabindex="${mode === k ? 0 : -1}">${label}</button>`).join('')}</div>
      <h2 class="section-title">Legenda</h2>${items}`;
    const group = $('#legend .mode-switch');
    group.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => selectMode(b.dataset.mode)));
    group.addEventListener('keydown', e => {
      const keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
      const i = MODE_LIST.findIndex(([k]) => k === MapView.colorMode());
      let next = null;
      if (e.key in keys) next = (i + keys[e.key] + MODE_LIST.length) % MODE_LIST.length;
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = MODE_LIST.length - 1;
      if (next == null) return;
      e.preventDefault();
      selectMode(MODE_LIST[next][0]);
    });
  }

  // Troca o modo, redesenha a legenda e devolve o foco ao rádio marcado.
  function selectMode(m) {
    MapView.setColorMode(m);
    renderLegend();
    const b = $('#legend [role="radio"][aria-checked="true"]');
    if (b) b.focus();
  }

  function initDrawer() {
    const btn = $('#drawer-toggle'), panel = $('#panel');
    btn.addEventListener('click', () => {
      const open = panel.classList.toggle('is-open');
      btn.setAttribute('aria-expanded', String(open));
    });
  }

  function init(data, idx, concData, intelData = null) {
    snv = data; index = idx; filters = Model.emptyFilters(); intel = intelData;
    conc = concData; states = ConcModel.stateArray(conc, snv.fis.length); concFilters = ConcModel.emptyConcFilters();
    renderSearch();
    renderLayers();
    renderFilters();
    renderLegend();
    initDrawer();
    MapView.onPick(j => { Layers.notePick(); openCard(j); });
    Layers.onPoint(openPoint);
    Layers.onMun(openMun);
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !$('#card').hidden) closeCard();
    });
    refresh();
  }

  return { init, refresh, showOnMap, openPoint, openMun, states: () => states };
})();
