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
    Tabs.goThen('#mapa', () => {
      MapView.invalidate();
      activeSearch = { label, ids, ent: entId };
      MapView.highlight(ids);
      MapView.fitTo(ids);
      renderActiveSearch();
    });
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
      group('ano', 'Ano do programa', `<div class="checks">${ConcModel.anosPrograma(conc).map(a => check('ano', a, String(a))).join('')}</div>`);
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
      <p class="note">Extensão oficial do ${Glossario.link('snv')}. Trechos coincidentes entre BRs contados uma vez (${Glossario.link('trecho-fisico', 'trecho físico')}).</p>
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

  // ---------- Camadas de inteligência ----------
  const vmdaOf = () => IM.vmdaOf(intel), acidOf = () => IM.acidOf(intel), cargaOf = () => IM.cargaOf(intel);
  const prfRef = () => { const a = acidOf(); const y = a && IM.anosLabel(a.anos); return y ? `PRF ${y}` : 'PRF'; };
  const pnlRef = () => { const c = cargaOf(); return c ? `${c.cenario || 'PNL 2035'} ${c.ano_base}` : 'PNL 2035'; };

  // Bloco do painel "Números da seleção": só soma trechos com dado; cada número explica a fonte no title.
  // Cobertura: km pavimentados com dado sobre os km pavimentados da seleção.
  // veíc·km com o VMDa 2025 (sem o bloco, 2023); % de pesados com 2025 = estimativa (participação de pesados de 2023).
  function intelStats(ag) {
    if (!ag) return '';
    const pctPes = ag.vkmBasePes > 0 ? ag.vkmPes / ag.vkmBasePes : null;
    const ref = ag.anoVmda ? `VMDa ${ag.anoVmda}` : 'VMDa', vm = vmdaOf();
    const tile = (id, value, sub, title) => `<div class="ikpi" title="${esc(title)}">
        <span class="ikpi__value" id="${id}">${esc(value)}</span><span class="ikpi__sub">${esc(sub)}</span></div>`;
    const cov = km => (km != null && ag.kmPav > 0 ? ` · ${fmtKmNum.format(km)} km com dado de ${fmtKmNum.format(ag.kmPav)} km pavimentados` : '');
    const pesTitle = ag.pesEstimado
      ? `% de pesados (estimativa) = VMDa ${ag.anoVmda} de cada trecho × participação de pesados no VMDa ${vm.ano} do mesmo trecho, somado e dividido pelo veíc·km dos trechos que têm as duas estimativas (o VMDa ${ag.anoVmda} não separa leves e pesados). Pesados: ${IM.MODES.pesados.fonte(intel)}.`
      : '% de pesados = veíc·km pesados ÷ veíc·km total.';
    return `<div class="ikpis">
      ${tile('kpi-vkm', IM.fmtVkm(ag.vkm),
        `${pctPes == null ? '—' : IM.fmtPct(pctPes)} pesados${ag.pesEstimado ? ` (estimativa: % de ${vm.ano})` : ''} · Tráfego ${ref}, modelado${cov(ag.kmVmda)}`,
        `Soma de ${ref} × extensão nos trechos visíveis que têm estimativa. ${pesTitle} Cobertura: km pavimentados com estimativa sobre os km pavimentados da seleção. Fonte: ${IM.MODES.trafego.fonte(intel)} — estimativa de modelo, não contagem.`)}
      ${tile('kpi-acid', ag.acidAno == null ? '—' : `${IM.fmtInt(ag.acidAno)} acidentes/ano`,
        `${ag.mortosAno == null ? '—' : IM.fmtInt(ag.mortosAno)} mortos/ano · ${prfRef()}, medido`,
        `Média anual de acidentes e de mortos registrados pela PRF nos trechos visíveis. Fonte: ${IM.MODES.acidentes.fonte(intel)} — contagem medida de ocorrências.`)}
      ${tile('kpi-tkm', IM.fmtTkm(ag.tkm),
        `Carga agrícola · ${pnlRef()}, modelado${cov(ag.kmCarga)}`,
        `Soma de carga agrícola (t/ano) × extensão nos trechos visíveis que casaram com a rede do PNL. Cobertura: km pavimentados com carga sobre os km pavimentados da seleção. Fonte: ${IM.MODES.carga.fonte(intel)} — estimativa de modelo.`)}
    </div>`;
  }

  // Bloco "Tráfego e segurança" do cartão (números de IntelModel.fisIntel). Cada grupo omite as linhas sem valor e some
  // quando fica vazio. Com o bloco vmda2025, o grupo VMDa 2025 aparece sempre (Total "—" quando o físico não tem valor),
  // então o bloco só é omitido sem o vmda2025 e sem nenhum dado nos outros grupos.
  // - VMDa 2025 (DNIT): total, sentidos crescente/decrescente do SNV, pesados estimados (total × % de pesados 2023) e veíc·km;
  //   "uso restrito (área urbana)" quando o modelo marca o trecho como não simulável.
  // - VMDa 2023 (leves/pesados): leves, pesados, total e % pesados; o veíc·km fica aqui só sem o bloco 2025.
  // - Acidentes (PRF): por ano, por km e por 10⁶ veíc·km (taxa sobre o VMDa 2023). Carga: modelo PNL.
  // Trecho planejado (superfície PLA): os grupos VMDa 2025, VMDa 2023 e Acidentes vêm marcados "trecho planejado no SNV" e,
  // se algum deles tem valor, uma nota no fim explica de onde vêm os números.
  function intelBlock(j) {
    const vm = vmdaOf(), v25 = IM.v25Of(intel), ac = acidOf(), ca = cargaOf(), f = IM.fisIntel(intel, snv, j);
    const pla = IM.fisSup(snv, j) === 'PLA' ? '<span class="tag-nv">trecho planejado no SNV</span>' : '';
    const groups = [];
    const group = (title, rows, tag = '', extra = '') => {
      const body = rows.filter(([, v]) => v != null).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('');
      if (body) groups.push(`<dt class="card__sub">${esc(title)}${tag}</dt>${body}${extra}`);
    };
    const fmt = (v, fn) => (v == null ? null : fn(v));
    if (v25) {
      const restrito = f.ns25 ? '<dd class="card__flag" data-ns="1"><span class="tag-nv">uso restrito (área urbana)</span> trecho não simulável no modelo</dd>' : '';
      const pesNota = f.pes25 != null && vm ? `<dd class="card__flag">Pesados (estimativa) = total ${v25.ano} × ${IM.fmtPct(f.pctPes)} de pesados no VMDa ${vm.ano} do trecho.</dd>` : '';
      group(`VMDa ${v25.ano} · modelado · total e por sentido`, [
        ['Total', f.t25 == null ? '—' : IM.fmtVmd(f.t25)],
        ['Sentido crescente (SNV)', fmt(f.c25, IM.fmtVmd)], ['Sentido decrescente (SNV)', fmt(f.d25, IM.fmtVmd)],
        ['Pesados (estimativa)', fmt(f.pes25, IM.fmtVmd)],
        ['Veículos × extensão', fmt(f.vkm, IM.fmtVkm)],
      ], pla, pesNota + restrito);
    }
    if (vm) {
      group(`VMDa ${vm.ano} · modelado · leves e pesados`, [
        ['Leves', fmt(f.l, IM.fmtVmd)], ['Pesados', fmt(f.p, IM.fmtVmd)],
        ['Total', fmt(f.tot, IM.fmtVmd)], ['% pesados', fmt(f.pctPes, IM.fmtPct)],
        ['Veículos × extensão', v25 ? null : fmt(f.vkm, IM.fmtVkm)],
      ], pla);
    }
    if (ac) {
      group(`Acidentes · ${prfRef()}, medido`, [
        ['Acidentes/ano', fmt(f.acidAno, x => IM.fmtDec(x, 1))],
        ['Mortos/ano', fmt(f.mortosAno, x => IM.fmtDec(x, 1))],
        ['Acidentes por km por ano', fmt(f.acidKmAno, x => IM.fmtDec(x, 2))],
        [vm ? `Acidentes por 10⁶ veíc·km (VMDa ${vm.ano})` : 'Acidentes por 10⁶ veíc·km', fmt(f.taxa, x => IM.fmtDec(x, 2))],
      ], pla);
    }
    if (ca) {
      group(`Carga · modelo PNL, ${ca.ano_base}`, [
        ['Carga agrícola', fmt(f.gsa, x => `${IM.fmtT(x)}/ano`)],
        ['Carga total (todas as mercadorias)', fmt(f.cargaTotal, x => `${IM.fmtT(x)}/ano`)],
      ]);
    }
    if (!groups.length) return '';
    // VMDa e PRF associam o código e o km da BR planejada à estrada que já existe no traçado (scripts/intel/trafego.py, vmda2025.py)
    const plaNota = pla && [f.t25, f.tot, f.acidAno].some(v => v != null)
      ? '<dd class="card__flag" data-pla="1">Trecho planejado: a rodovia federal ainda não foi implantada aqui. Os números de tráfego ' +
        'e de acidentes são da estrada que já existe nesse traçado (em geral estadual), que o modelo de tráfego e a PRF associam a esta BR.</dd>'
      : '';
    return `<div class="card__intel"><h3 class="section-title">Tráfego e segurança</h3><dl class="card__grid">${groups.join('')}${plaNota}</dl></div>`;
  }

  // ---------- Camadas de sobreposição ----------
  // Texto com links para o glossário na primeira menção de cada termo desta aba
  const layersNote = () => `Medido: ${Glossario.link('praca-de-pedagio', 'praças')}, ${Glossario.link('sat', 'SATs')} (ANTT), ${Glossario.link('pam', 'PAM')}, Estoques. ` +
    `Modelado: ${Glossario.link('vmda', 'VMDa')}, carga ${Glossario.link('pnl', 'PNL')}.`;
  const PROD_LABEL = { soja: 'Soja', milho1: 'Milho 1ª safra', milho2: 'Milho 2ª safra', cana: 'Cana-de-açúcar', algodao: 'Algodão', trigo: 'Trigo', cafe: 'Café' };

  function renderLayers() {
    let sec = $('#layers-section');
    if (!sec) {
      sec = document.createElement('section');
      sec.className = 'panel__section';
      sec.id = 'layers-section';
      $('#filters-section').before(sec);
    }
    const all = Layers.available(), avail = all.filter(d => d.key !== 'rotas'), rot = all.find(d => d.key === 'rotas');
    // Rodovias estaduais: sublegenda distingue a malha das concessões estaduais (clicáveis).
    const sub = d => (d.key === 'estaduais'
      ? `<div class="layer-sub"><span>${layerSwatch('estaduais-malha')}Malha estadual</span><span>${layerSwatch('estconc')}Concessões estaduais</span></div>` : '');
    // A fonte de cada camada fica no title (mouse) e num texto oculto ligado ao checkbox (teclado e leitor de tela).
    const check = (d, sw, label, n) => `<label class="check" title="${esc(d.title)}"><input type="checkbox" data-layer="${d.key}" aria-describedby="layer-src-${d.key}">${sw}` +
      `<span>${esc(label)}</span><span class="muted">${esc(n)}</span></label><span class="visually-hidden" id="layer-src-${d.key}">Fonte: ${esc(d.title)}</span>`;
    const checks = avail.map(d => check(d, layerSwatch(d.key), d.label, fmtInt.format(d.n)) + sub(d)).join('');
    // Rotas de Integração: grupo próprio; ligar enquadra a América do Sul e mostra a legenda da camada.
    const rotas = rot ? `<fieldset class="fundo rotas-group"><legend class="fundo__title">${esc(rot.label)}</legend>
        ${check(rot, rotasSwatch(), 'Rotas e países vizinhos', fmtInt.format(rot.n))}
        <p class="note layers__note">${esc(IM.rotasNota(IM.rotasOf(intel)))}</p></fieldset>` : '';
    const fundo = Layers.fundoAvailable() ? `<fieldset class="fundo"><legend class="fundo__title">Fundo municipal</legend><div class="fundo__opts">
        <label class="check"><input type="radio" name="fundo" value="" checked><span>Nenhum</span></label>
        ${IM.FUNDOS.map(f => { const src = `${IM.fundoFonte(intel, f.key)} · por município, 5 classes por quantil`;
          return `<label class="check" title="${esc(src)}"><input type="radio" name="fundo" value="${f.key}" aria-describedby="fundo-src-${f.key}"><span>${esc(f.label)}</span></label>` +
            `<span class="visually-hidden" id="fundo-src-${f.key}">Fonte: ${esc(src)}</span>`; }).join('')}
      </div></fieldset>` : '';
    sec.innerHTML = `<details class="layers" id="layers" open>
        <summary><span class="section-title">Camadas</span>${ICON.chev}</summary>
        <div class="layers__body">
          ${checks ? `<div class="checks">${checks}</div>` : '<p class="empty">Sem camadas neste arquivo.</p>'}
          ${rotas}
          ${fundo}
          <p class="note layers__note">${layersNote()}</p>
        </div></details>`;
    sec.addEventListener('change', e => {
      const t = e.target;
      if (t.dataset.layer === 'rotas') toggleRotas(t.checked);
      else if (t.dataset.layer) Layers.toggle(t.dataset.layer, t.checked);
      else if (t.name === 'fundo') { Layers.setFundo(t.value || null); renderFundoLegend(); }
    });
  }

  // Legendas das camadas (fundo municipal, rotas) empilhadas no canto inferior esquerdo do mapa.
  function leftLegend(id, cls) {
    let el = document.getElementById(id);
    if (el) return el;
    let stack = $('#legend-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.id = 'legend-stack';
      stack.className = 'legend-stack';
      $('#map').after(stack);
    }
    el = document.createElement('div');
    el.id = id;
    el.className = `legend ${cls}`;
    el.hidden = true;
    if (id === 'rotas-legend') stack.prepend(el); else stack.append(el);
    return el;
  }

  // Liga/desliga as Rotas de Integração: enquadra a área das rotas (ou volta ao Brasil), esmaece a malha federal enquanto
  // a camada está ligada e mostra a legenda da camada.
  function toggleRotas(want) {
    const sel = Layers.selected();
    if (!want && sel && sel.key === 'rotas') closeCard();
    Layers.toggle('rotas', want);
    MapView.setBaseDim(Layers.isOn('rotas'));
    renderRotasLegend();
    if (want) MapView.fitAmericaSul(true, fitRotasLegend); else MapView.fitBrasil();
  }

  // Ao fim do enquadramento das rotas: se um rótulo direto de rota caiu sob a legenda das rotas (mapa estreito, p. ex.
  // 1366 × 768, onde o zoom mínimo deixa a Rota 4 na altura da legenda), a legenda começa recolhida; o leitor pode abri-la.
  // reavaliar (mudança do tamanho da janela): mede de novo com a legenda aberta e abre ou recolhe; se o leitor já abriu ou
  // recolheu a legenda com a mão, a escolha dele fica.
  function fitRotasLegend(reavaliar = false) {
    const el = document.getElementById('rotas-legend'), det = el && el.querySelector('details');
    if (!det || el.hidden || !Layers.isOn('rotas') || !el.getClientRects().length) return;
    if (reavaliar ? el.dataset.manual === '1' : !det.open) return;
    det.open = true;  // a medida vale para a legenda aberta (troca síncrona: não chega a ser desenhada)
    const b = el.getBoundingClientRect();
    const sob = [...document.querySelectorAll('.leaflet-tooltip.rota-label')].some(l => {
      const r = l.getBoundingClientRect();
      return r.left < b.right && b.left < r.right && r.top < b.bottom && b.top < r.bottom;
    });
    det.open = !sob;
  }

  // Mudança do tamanho da janela: reavalia o recolhimento da legenda das rotas quando o redimensionamento para (200 ms).
  let resizeTimer = 0;
  function onResize() {
    clearTimeout(resizeTimer);
    // espera também o quadro em que o Leaflet reposiciona os rótulos no novo tamanho do mapa
    resizeTimer = setTimeout(() => requestAnimationFrame(() => fitRotasLegend(true)), 200);
  }

  function renderRotasLegend() {
    const el = leftLegend('rotas-legend', 'rotas-legend'), R = IM.rotasOf(intel);
    el.hidden = !(R && Layers.isOn('rotas'));
    delete el.dataset.manual;
    if (el.hidden) { el.innerHTML = ''; return; }
    const rows = R.rotas.map((r, i) => `<button type="button" class="legend__row legend__btn" data-rota="${i}" title="Abrir o cartão da ${esc(IM.rotaTitulo(r))}">` +
      `${rotaSwatch(r.id)}<span>${esc(IM.rotaTitulo(r))}</span></button>`).join('');
    const tipos = new Set(IM.rotaLinhas(R).map(l => l.tipo));
    const extras = ['hidrovia', 'cabotagem', 'pavimentacao', 'estudo'].filter(t => tipos.has(t))
      .map(t => `<div class="legend__row">${rotaExtraSwatch(t)}<span>${esc(ROTAS_EXTRA[t].label)}</span></div>`).join('');
    const fonte = IM.fonteRef(R.fonte, /Apresentação/);
    // Recolhível (como "Camadas"), aberta por padrão.
    el.innerHTML = `<details class="legend__det" open><summary><span class="section-title">Rotas de Integração</span>${ICON.chev}</summary>
      <div class="legend__body">${rows}${extras ? `<div class="legend__sep"></div>${extras}` : ''}
      <p class="legend__note" title="Fonte: ${esc(fonte)}">${esc(IM.rotasNota(R))}</p></div></details>`;
    el.querySelectorAll('[data-rota]').forEach(b => b.addEventListener('click', () => Layers.open('rotas', Number(b.dataset.rota))));
    // clique (ou Enter/Espaço) no título: escolha do leitor, que a mudança de tamanho da janela não desfaz
    el.querySelector('summary').addEventListener('click', () => { el.dataset.manual = '1'; });
  }

  function renderFundoLegend() {
    const el = leftLegend('fundo-legend', 'fundo-legend');
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

  // Série mensal leves × pesados da praça i (Charts.linesSvg com x = ano + (mês - 1)/12, rotulado "mmm/aaaa" no eixo e nas dicas).
  function pracaChart(i) {
    const p = intel.antt.pracas, meses = p.serie_meses || [], sl = (p.serie_l || [])[i] || [], sp = (p.serie_p || [])[i] || [];
    const pts = arr => meses.map((ym, k) => ({ x: IM.mesX(ym), y: arr[k] })).filter(q => IM.has(q.y));
    const series = [{ name: 'Leves', points: pts(sl) }, { name: 'Pesados', points: pts(sp) }];
    if (!series[0].points.length && !series[1].points.length) return '';
    // rótulos do eixo: um por ano em séries de 2 anos ou mais; senão 2 ou 3 rótulos (o cartão é estreito)
    const xs = series.flatMap(q => q.points.map(pt => pt.x)), span = Math.round((Math.max(...xs) - Math.min(...xs)) * 12);
    const svg = Charts.linesSvg(series, { width: 312, height: 200, format: v => IM.fmtInt(v), formatX: IM.fmtMesX, unit: ' veíc./dia',
      stepX: (span >= 24 ? 12 : Math.max(1, Math.ceil((span + 1) / 2))) / 12, title: 'Tráfego mensal da praça: leves e pesados' });
    const per = meses.length ? `${IM.monthLabel(meses[0])} a ${IM.monthLabel(meses[meses.length - 1])}` : '';
    return `<div class="card__chart"><h3 class="section-title">Tráfego mensal · ${esc(per)}</h3>
      ${Charts.legendHtml([['Leves', Charts.C.deep], ['Pesados', Charts.C.bright]])}<div class="card__svg">${svg}</div>
      <p class="card__src">Contagem medida · ANTT (média diária do mês, dois sentidos)</p></div>`;
  }

  function openPoint(key, i) {
    const r = Layers.rowsOf(key)[i];
    if (!r) return;
    if (key === 'pracas') {
      const aP = IM.anoPracas(intel);
      showCard(r.nome, `Praça de pedágio · ${rodUf(r)}${kmFmt(r.km) ? ` · km ${kmFmt(r.km)}` : ''}`,
        `<div class="card__badges"><span class="badge">Contagem medida · ANTT</span></div>
        ${grid([
          [IM.comAno('VMD', aP), IM.fmtVmd(r.vmd)], ['Leves', IM.fmtVmd(r.leves)], ['Pesados', IM.fmtVmd(r.pesados)], ['Motos', IM.fmtVmd(r.moto)],
          ['% pesados', IM.fmtPct(pctOf(r.pesados, r.vmd))], ['Eixos médios do comercial', IM.has(r.eixos) ? IM.fmtDec(r.eixos, 1) : null],
          [IM.comAno('Receita', aP), IM.fmtBRL(r.receita)], [`Meses com dado${aP != null ? ` em ${aP}` : ''}`, IM.has(r.meses) ? String(r.meses) : null],
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
    } else if (key === 'rotas') {
      openRota(r);
    } else if (key === 'portos') {
      showCard(r.nome, `${r.tipoLabel || r.tipo} · ${r.uf || '—'}`,
        `${grid([['Tipo', r.tipoLabel || r.tipo], ['UF', r.uf],
          ['Localização', r.aprox ? 'aproximada (centro do município do cadastro; o ponto da ANTAQ estava fora da UF)' : null]])}
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
      `<div class="card__badges"><span class="badge">${layerSwatch('estconc')}${esc(IM.qualidadeRecorte(e.qualidade))}</span></div>
      ${grid([
        ['UF', e.uf], ['Regulador', e.regulador || e.poder], ['Rodovias', (e.rodovias || []).join(', ')],
        ['km declarado × mapeado', `${km(e.km_decl)} × ${km(e.km_map)}`], ['Grupo', e.grupo || e.controlador],
        ['Assinatura / fim', datas], ['Capex', capex],
      ])}${e.nota ? `<p class="card__src card__pad">${esc(e.nota)}</p>` : ''}${link}`, null);
  }

  // Cartão de uma Rota de Integração Sul-Americana (MPO): o traçado no mapa é esquemático.
  function openRota(r) {
    const ap = IM.rotasDocs(intel && intel.rotas).apresentacao;
    const join = a => (Array.isArray(a) && a.length ? a.join(', ') : null);
    const list = (title, items) => (Array.isArray(items) && items.length
      ? `<div class="card__intel"><h3 class="section-title">${esc(title)}</h3><ul class="flist">${items.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : '');
    const cidades = Array.isArray(r.cidades) && r.cidades.length
      ? `<div class="card__intel"><h3 class="section-title">Cidades e nós, na ordem do MPO</h3><p class="rota-cidades">${r.cidades.map(esc).join(' · ')}</p></div>` : '';
    const link = r.fonte_url ? `<p class="card__src card__pad"><a class="link-btn" href="${esc(r.fonte_url)}" target="_blank" rel="noopener">Fonte: MPO${r.fonte_ref ? ` · ${esc(r.fonte_ref)}` : ''}</a></p>` : '';
    showCard(IM.rotaTitulo(r), 'Rota de Integração Sul-Americana · MPO',
      `<div class="card__badges"><span class="badge">${rotaSwatch(r.id, 24)}Traçado esquemático</span></div>
      ${r.descricao ? `<p class="card__desc">${esc(r.descricao)}</p>` : ''}
      ${grid([['Países', join(r.paises)], ['UFs', join(r.ufs)], ['Situação', r.previsao], ['Rodovias', join(r.rodovias)]])}
      ${cidades}${list('Hidrovias', r.hidrovias)}${list('Obras e projetos', r.obras)}
      <p class="card__src card__pad card__aviso">Traçado esquemático: linhas do mapa da apresentação do MPO${ap ? ` de ${esc(ap)}` : ''}, georreferenciadas por cidades; não é o eixo das vias.</p>${link}`, null);
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
      <p class="card__src">${IM.comAno('VMD medido', IM.anoPracas(intel))} · ANTT</p></div>`;
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
        <span class="conc-item__sub">${esc(concLabel(e.estado))}${chave ? ` · ${e.estado === 'vigente' ? 'assinatura' : 'leilão'} ${esc(ConcModel.fmtData(chave))}` : ''}</span>
        <span class="conc-item__sub" data-pista-resumo="${esc(e.id)}">Pista da concessão: ${esc(ConcModel.pistaLinha(ConcModel.pistaSNV(conc, snv, i)))}</span></span>
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
  // Amostra da malha estadual sem dado no modo Tráfego (EST_NONE: cinza fino contínuo; 1 px na amostra para ficar legível).
  function estNoneSwatch(width = 32) {
    const s = EST_NONE;
    return `<svg class="swatch" width="${width}" height="8" viewBox="0 0 ${width} 8" aria-hidden="true">` +
      `<line x1="1" y1="4" x2="${width - 1}" y2="4" stroke="${s.color}" stroke-width="1" stroke-opacity="${s.opacity}"/></svg>`;
  }

  // Legenda de um modo quantitativo. Tráfego com a camada de rodovias estaduais ligada: as mesmas classes (quebras da malha
  // federal) colorem as estaduais; a 1ª e a última faixa passam a cobrir também os valores estaduais.
  function quantLegend(mode) {
    const M = IM.MODES[mode], q = MapView.classes(mode) || { breaks: [], min: null, max: null };
    const est = mode === 'trafego' ? Layers.estTrafego() : null;
    const fmt = RANGE_FMT[mode];
    const both = (a, b, fn) => (a == null ? b : b == null ? a : fn(a, b));
    const min = est ? both(q.min, est.min, Math.min) : q.min, max = est ? both(q.max, est.max, Math.max) : q.max;
    const rows = [];
    if (q.max != null) {
      for (let c = 0; c <= q.breaks.length; c++) {
        const lo = c === 0 ? min : q.breaks[c - 1], hi = c === q.breaks.length ? max : q.breaks[c];
        rows.push(`<div class="legend__row" data-class="${c}">${quantSwatch(c, mode)}<span class="legend__range">${esc(fmt(lo))} – ${esc(fmt(hi))}</span></div>`);
      }
    }
    rows.push(`<div class="legend__row">${quantSwatch(-1, mode)}<span>${est ? 'Sem dado (federal)' : 'Sem dado'}</span></div>`);
    if (est) rows.push(`<div class="legend__row" data-est-none>${estNoneSwatch()}<span>Sem dado (estadual)</span></div>`);
    const ref = M.ref ? M.ref(intel) : '—';
    return `<div class="legend__title">${esc(M.label)} <span>${esc(M.unidade)}${ref !== '—' ? ` · ${esc(ref)}` : ''}</span></div>${rows.join('')}
      <div class="legend__tipo">${esc(TIPO_LABEL[M.tipo] || M.tipo)}</div>
      ${est ? `<p class="legend__note" id="legend-est">Inclui rodovias estaduais (VMDa ${esc(String(est.ano))}), nas mesmas classes da malha federal, com traço mais fino.</p>` : ''}
      <div class="legend__src">Fonte: ${esc(M.fonte(intel))}</div>`;
  }

  // Malha estadual nas classes do Tráfego: só no modo Tráfego (as quebras são as da malha federal).
  function syncEstTrafego() {
    const q = MapView.colorMode() === 'trafego' ? MapView.classes('trafego') : null;
    Layers.setTrafego(q && q.max != null ? q.breaks : null);
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
      items += `<div class="legend__src">Fonte: DNIT · SNV ${esc(snv.versao)}${mode === 'concessoes' ? ` · RoadShow 2026-2027 (${esc(conc.edicaoRoadshow)})` : ''}</div>`;
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
    syncEstTrafego();
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

  // Regras de CSS geradas dos tokens de dado (styles-map.js), para não repetir hex em styles.css.
  function injectTokenCss() {
    if (document.getElementById('data-tokens')) return;
    const st = document.createElement('style');
    st.id = 'data-tokens';
    st.textContent = dataTokenCss();
    document.head.appendChild(st);
  }

  function init(data, idx, concData, intelData = null) {
    snv = data; index = idx; filters = Model.emptyFilters(); intel = intelData;
    injectTokenCss();
    conc = concData; states = ConcModel.stateArray(conc, snv.fis.length); concFilters = ConcModel.emptyConcFilters();
    renderSearch();
    renderLayers();
    renderFilters();
    renderLegend();
    initDrawer();
    MapView.onPick(j => { Layers.notePick(); openCard(j); });
    Layers.onPoint(openPoint);
    Layers.onMun(openMun);
    // Ligar/desligar as estaduais muda a legenda do Tráfego (estaduais incluídas), venha a troca do painel ou da ficha.
    // Desligar a camada da feição aberta no cartão (ex.: concessão estadual ao desligar "Rodovias estaduais") fecha o cartão.
    Layers.onToggle((key, on, lost) => {
      if (lost && !$('#card').hidden) closeCard();
      if (key === 'estaduais' && QUANT_MODES.includes(MapView.colorMode())) renderLegend();
    });
    syncEstTrafego();
    window.addEventListener('resize', onResize);
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !$('#card').hidden) closeCard();
    });
    refresh();
  }

  return { init, refresh, showOnMap, states: () => states };
})();
