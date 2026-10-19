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

  let snv, index, filters, showAllUf = false, refreshTimer = null;
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

  function updateSuggestions(q) {
    suggestions = Model.search(index, q);
    activeSug = suggestions.length ? 0 : -1;
    const ul = $('#suggestions');
    if (!q.trim()) { closeSuggestions(); return; }
    ul.innerHTML = suggestions.length
      ? suggestions.map((s, k) => `<li role="option" id="sug-${k}" data-k="${k}" aria-selected="${k === activeSug}">
          <span class="s-label">${esc(s.label)}</span>
          <span class="s-sub">${s.kind === 'br' ? '<span class="s-kind">Rodovia inteira</span>' : esc(s.sub)}</span></li>`).join('')
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

  function renderActiveSearch() {
    const el = $('#active-search');
    if (!activeSearch) { el.innerHTML = ''; return; }
    el.innerHTML = `<div class="active-search"><span>Em destaque: ${esc(activeSearch.label)}</span>
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
      ${groupsHtml}`;

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
      const q = Model.normalize(inp.value).replace(/^br[\s-]*/, '');
      inp.parentElement.querySelectorAll('.check').forEach(l => { l.hidden = q && !l.dataset.text.includes(q); });
    }));
    $('#clear-filters').addEventListener('click', () => {
      filters = Model.emptyFilters();
      syncChecks();
      scheduleRefresh(0);
    });
  }

  function syncChecks() {
    document.querySelectorAll('input[data-filter]').forEach(inp => {
      inp.checked = filters[inp.dataset.filter].has(Number(inp.value));
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
      <h3 class="section-title">Por situação</h3>${bars(a.porSituacao, 'situacao')}
      <h3 class="section-title">Por administração</h3>${bars(a.porAdm, 'adm')}
      <h3 class="section-title">Por UF</h3>${bars(ufList, 'uf', 'bars--uf')}${more}`;
    $('#stats-section').querySelectorAll('[data-bar]').forEach(b =>
      b.addEventListener('click', () => toggleFilter(b.dataset.bar, Number(b.dataset.i))));
    const t = $('#toggle-uf');
    if (t) t.addEventListener('click', () => { showAllUf = !showAllUf; renderStats(a); });
  }

  function scheduleRefresh(delay = 30) {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(refresh, delay);
  }

  function refresh() {
    const visible = Model.visibleFis(snv, filters);
    MapView.setVisible(visible);
    renderStats(Model.aggregate(snv, filters, visible));
    let total = 0;
    for (const g of GROUPS) {
      const n = filters[g.key].size;
      total += n;
      const c = document.querySelector(`[data-count="${g.key}"]`);
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
    const main = snv.trechos[iRecPreferred != null && recs.includes(iRecPreferred) ? iRecPreferred : recs[0]];
    const d = snv.dict;
    const brs = recs.map(i => Model.brLabel(snv, snv.trechos[i][F.br]));
    const sit = d.situacao[main[F.situacao]];
    const adm = d.adm[main[F.adm]];
    const row = (k, v) => v ? `<dt>${k}</dt><dd>${esc(v)}</dd>` : '';
    const coinc = recs.length > 1
      ? `<div class="card__coinc"><h3 class="section-title">Trecho coincidente</h3>${recs.map(i => {
          const t = snv.trechos[i];
          return `<div>${Model.brLabel(snv, t[F.br])} · km ${fmtKmNum.format(t[T.kmIni])}–${fmtKmNum.format(t[T.kmFim])} · ${esc(t[T.codigo])}</div>`;
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
      </dl>${coinc}`;
    card.hidden = false;
    $('#card-close').addEventListener('click', closeCard);
  }

  function closeCard() { $('#card').hidden = true; }

  // ---------- Legenda ----------
  function renderLegend() {
    $('#legend').innerHTML = `<h2 class="section-title">Legenda</h2>
      ${LEGEND_ITEMS.map(([sit, label]) => `<div class="legend__row">${styleSwatch(sit)}<span>${label}</span></div>`).join('')}
      <div class="legend__sep"></div>
      <div class="legend__row">${haloSwatch()}<span>Concessão federal</span></div>
      <div class="legend__src">Fonte: DNIT · SNV ${esc(snv.versao)}</div>`;
  }

  function initDrawer() {
    const btn = $('#drawer-toggle'), panel = $('#panel');
    btn.addEventListener('click', () => {
      const open = panel.classList.toggle('is-open');
      btn.setAttribute('aria-expanded', String(open));
    });
  }

  function init(data, idx) {
    snv = data; index = idx; filters = Model.emptyFilters();
    renderSearch();
    renderFilters();
    renderLegend();
    initDrawer();
    MapView.onPick(j => openCard(j));
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !$('#card').hidden) closeCard();
    });
    refresh();
  }

  return { init, refresh };
})();
