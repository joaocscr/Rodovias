// Ficha do projeto/contrato: todos os campos do RoadShow, avisos de divergência, capex anual e cronograma.
const Ficha = (() => {
  const fmt1 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const fmt2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtInt = new Intl.NumberFormat('pt-BR');
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const F = {
    km: v => Model.fmtKm(v), bi: v => ConcModel.fmtBi(v), pct: v => ConcModel.fmtPct(v), data: v => ConcModel.fmtData(v),
    mi: v => `R$ ${fmt2.format(v)} mi`, mikm: v => `R$ ${fmt2.format(v)} mi/km`, int: v => fmtInt.format(v),
    tkm: v => `R$ ${new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(v)}/km`,
    txt: v => String(v), kmv: v => `${fmt1.format(v)} km`,
  };
  const ICON_CLOSE = '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
  const ICON_WARN = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M12 4l9 16H3z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M12 10v4M12 17v.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';

  let conc, current = null, popover = null;

  const $ = s => document.querySelector(s);
  const isNum = v => typeof v === 'number' && isFinite(v);
  const has = v => v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && !v.length);

  function estadoLabel(k) { return (conc.estados.find(s => s.key === k) || {}).label || k; }

  function flag(e, campo) {
    const d = (e.divergencias || []).find(x => x.campo === campo);
    if (!d) return '';
    const i = e.divergencias.indexOf(d);
    return `<button type="button" class="div-flag" data-div="${i}" aria-label="Divergência entre fontes do RoadShow" title="Divergência entre fontes">${ICON_WARN}</button>`;
  }

  // Linha da ficha: [rótulo, valor, formato, campo-para-divergência, html extra]
  function rows(e, list) {
    return list.filter(([, v]) => has(v)).map(([label, v, f, campo, extra]) =>
      `<dt>${esc(label)}</dt><dd>${esc((F[f] || F.txt)(v))}${campo ? flag(e, campo) : ''}${extra || ''}</dd>`).join('');
  }

  function block(title, inner, wide = false) {
    return inner ? `<section class="fblock${wide ? ' fblock--wide' : ''}"><h3>${esc(title)}</h3>${inner}</section>` : '';
  }
  const dl = html => (html ? `<dl class="fgrid">${html}</dl>` : '');

  function baseNote(e, campo) {
    const n = (e.notas_base || []).find(x => x.campo === campo);
    if (n) return `<span class="base">${esc(F.bi(n.valor))} em ${esc(n.data_base)} (p. ${esc(n.pagina)})</span>`;
    return '';
  }

  function priceRows(e) {
    if (e.ficha && has(e.capex_ficha)) {
      const tableNote = (c, v) => (has(v) && e.data_base && e.data_base !== e.data_base_ficha
        ? `<span class="base">${esc(F.bi(v))} em ${esc(e.data_base)} (p. ${esc((e.fontes || {})[c] || '—')})</span>` : '') || baseNote(e, c);
      return [
        [`Capex (${e.data_base_ficha || 'data-base da ficha'})`, e.capex_ficha, 'bi', 'capex', tableNote('capex', e.capex)],
        [`Opex (${e.data_base_ficha || 'data-base da ficha'})`, e.opex_ficha, 'bi', 'opex', tableNote('opex', e.opex)],
      ];
    }
    return [[`Capex (${e.data_base || '—'})`, e.capex, 'bi', 'capex'], [`Opex (${e.data_base || '—'})`, e.opex, 'bi', 'opex']];
  }

  function render(e, idx) {
    const f = e.ficha || {};
    const fis = conc.entFis[idx] || [];
    const chave = ConcModel.dataChave(e);
    const resumo = dl(rows(e, [
      ['Extensão', e.km, 'km', 'km'], ...priceRows(e),
      ['Capex (VPL)', e.capex_vpl, 'bi', 'capex_vpl'], ['Opex (VPL)', e.opex_vpl, 'bi', 'opex_vpl'],
      ['WACC', f.wacc, 'pct', 'ficha.wacc'], ['Tarifa quilométrica (TKM, pista simples)', f.tkm, 'tkm', 'ficha.tkm'],
      ['Empregos estimados', f.empregos, 'int'], ['Carga predominante', f.carga, 'txt'],
      ['Trecho', f.trecho_inicio && f.trecho_fim ? `${f.trecho_inicio} – ${f.trecho_fim}` : (e.trecho_cidades ? e.trecho_cidades.join(' – ') : null), 'txt'],
    ]));
    const leilao = dl(rows(e, [
      ['Situação', e.status_texto, 'txt'], ['Edital', e.edital, 'data', 'edital'], ['Leilão', e.leilao, 'data', 'leilao'],
      ['Participantes', e.participantes, 'int', 'participantes'], ['Deságio', e.desagio, 'pct', 'desagio'],
      ['Vencedor', e.grupo_vencedor, 'txt', 'grupo_vencedor'], ['Assinatura', e.assinatura, 'data', 'assinatura'],
      ['Termo aditivo', e.assinatura_aditivo, 'data'], ['Início da operação', e.inicio_operacao, 'data'],
      ['Estruturador', e.estruturador, 'txt'], ['Concessionária', e.nome_contrato, 'txt'], ['Atualizado em', e.atualizado_em, 'data'],
    ]));
    const obras = dl(rows(e, [
      ['Duplicação', f.duplicacao_km, 'kmv'], ['Faixa adicional', f.faixa_adicional_km, 'kmv'],
      ['Contornos', f.contorno_km, 'kmv'], ['Marginais', f.marginais_km, 'kmv'], ['Ciclo de obras', f.ciclo_obras, 'txt'],
    ])) + (has(f.obras_relevantes) ? `<p class="ftext">${esc(f.obras_relevantes)}</p>` : '');
    const pedagio = dl(rows(e, [
      ['Praças a implantar', f.pracas_implantar, 'int'], ['Praças existentes', f.pracas_existentes, 'int'],
      ['Pórticos free flow', f.porticos, 'int'], ['VEQ/dia/praça', f.veq_dia_praca, 'int'],
    ]));
    const indic = dl(rows(e, [
      ['CAPEX/km', f.capex_km, 'mikm'], ['OPEX/km', f.opex_km, 'mikm'], ['Custo de duplicação/km', f.custo_duplicacao_km, 'mikm'],
      ['Manutenção (R$ mi/ano/faixa)', f.custo_manutencao, 'mi'], ['Fluxo de caixa acumulado', f.fluxo_caixa_acum, 'bi'],
      ['Receita bruta (nominal)', f.receita_nominal, 'bi'], ['Receita bruta (VPL)', f.receita_vpl, 'bi'],
      ['CAGR de tráfego', f.cagr_trafego, 'pct'], ['CAPEX/Receita (VPL)', f.capex_receita_vpl, 'pct'],
    ]));
    const garantias = dl(rows(e, [
      ['Garantia da proposta', f.garantia_proposta, 'mi'], ['Capital social mínimo', f.capital_minimo, 'mi'],
      ['Garantia de execução', f.garantia_execucao, 'mi'],
    ]));
    const extras = has(f.extras) ? dl(f.extras.map(x => `<dt>${esc(x.rotulo)}</dt><dd>${esc(x.valor)}</dd>`).join('')) : '';
    const capexChart = has(f.capex_anual) ? `<div class="chart-box" id="ficha-capex"></div><p class="page__src">R$ mi por ano de concessão, ciclo de obras${f.data_base ? ` · data-base ${esc(f.data_base)}` : ''}.</p>` : '';
    const crono = has(e.cronograma) ? `<ul class="timeline">${e.cronograma.map(c => `<li><b>${esc(c.marco)}</b>${esc(F.data(c.data))}</li>`).join('')}</ul>` : '';
    const part = has(e.participantes_lista) ? `<table class="grid"><thead><tr><th>Proponente</th><th class="num">Deságio</th></tr></thead><tbody>${
      e.participantes_lista.map(p => `<tr><td>${esc(p.grupo)}${p.vencedor ? ' <b>(vencedor)</b>' : ''}</td><td class="num">${esc(F.pct(p.desagio))}</td></tr>`).join('')}</tbody></table>` : '';
    const rel = (e.relaciona || []).map(id => conc.entidades.find(x => x.id === id)).filter(Boolean);
    const relHtml = rel.length ? `<ul class="timeline">${rel.map(r => `<li><a href="#ficha/${esc(r.id)}">${esc(r.nome)}</a> · ${esc(estadoLabel(r.estado))}</li>`).join('')}</ul>` : '';
    const qual = { ok: 'Recorte conferido (diferença ≤ 5% ou 10 km)', aproximado: 'Recorte aproximado', nao_mapeado: 'Trecho não mapeado no SNV', falha: 'Recorte com falha' }[e.qualidade] || '';
    const trecho = dl(rows(e, [['Recorte no mapa', qual, 'txt'], ['km no SNV', e.km_mapeado || null, 'km'], ['Nota', e.nota_trecho, 'txt']]));
    const pages = [...new Set(Object.values(e.fontes || {}).flat())].filter(isNum).sort((a, b) => a - b);

    $('#ficha').innerHTML = `
      <header class="ficha__head">
        <div>
          <h2 class="ficha__title" id="ficha-title">${esc(e.nome)}</h2>
          <div class="ficha__meta">
            <span>${esc(ConcModel.brsUfs(e))}</span>
            <span class="estado-tag">${concSwatch(e.estado)}${esc(estadoLabel(e.estado))}</span>
            ${chave ? `<span>${e.estado === 'vigente' ? 'Assinatura' : 'Leilão'}: ${esc(F.data(chave))}</span>` : ''}
            ${has(e.desagio) ? `<span>Deságio ${esc(F.pct(e.desagio))}</span>` : ''}
          </div>
        </div>
        <div class="ficha__actions">
          <button type="button" class="btn btn--primary" id="ficha-map" ${fis.length ? '' : 'disabled title="Este item não tem trecho mapeado no SNV"'}>Ver no mapa</button>
          <button type="button" class="icon-btn" id="ficha-close" aria-label="Fechar ficha">${ICON_CLOSE}</button>
        </div>
      </header>
      <div class="ficha__body">
        ${block('Resumo', resumo)}
        ${block('Leilão e contrato', leilao)}
        ${block('Obras', obras)}
        ${block('Pedágio', pedagio)}
        ${block('Indicadores econômicos', indic)}
        ${block('Garantias e capital', garantias)}
        ${block('CAPEX anual', capexChart, true)}
        ${block('Cronograma', crono, true)}
        ${block('Participantes do leilão', part, true)}
        ${block('Itens relacionados', relHtml)}
        ${block('Trecho no mapa', trecho)}
        ${block('Outras informações da ficha', extras, true)}
        <p class="ficha__foot">Fonte: RoadShow 2026-2027 (${esc(conc.versaoRoadshow)}), Ministério dos Transportes${pages.length ? `, p. ${pages.join(', ')}` : ''}.</p>
      </div>`;

    if (capexChart) Charts.bars($('#ficha-capex'), f.capex_anual.map(a => ({ label: `Ano ${a.ano}`, value: a.valor })),
      { unit: 'R$ mi', format: v => fmt1.format(v), title: 'CAPEX anual' });
    $('#ficha-close').addEventListener('click', () => close());
    $('#ficha-map').addEventListener('click', () => showOnMap(idx));
    $('#ficha').querySelectorAll('[data-div]').forEach(b => b.addEventListener('click', ev => {
      ev.stopPropagation();
      openPopover(b, e.divergencias[Number(b.dataset.div)]);
    }));
  }

  function concSwatch(key) {
    return typeof concStyleSwatch === 'function' ? concStyleSwatch(key, 24) : '';
  }

  function openPopover(btn, d) {
    closePopover();
    popover = document.createElement('div');
    popover.className = 'popover';
    popover.setAttribute('role', 'dialog');
    popover.innerHTML = `<b>Divergência no RoadShow</b>
      <p>Exibido: ${esc(d.exibido)}</p>
      <ul>${d.alternativas.map(a => `<li>${esc(a.valor)} (p. ${esc(a.pagina)})</li>`).join('')}</ul>
      ${d.nota ? `<p>${esc(d.nota)}</p>` : ''}`;
    document.body.appendChild(popover);
    const r = btn.getBoundingClientRect();
    popover.style.top = `${Math.min(window.innerHeight - popover.offsetHeight - 16, r.bottom + 8)}px`;
    popover.style.left = `${Math.max(16, Math.min(window.innerWidth - popover.offsetWidth - 16, r.left - 160))}px`;
  }
  function closePopover() { if (popover) { popover.remove(); popover = null; } }

  function showOnMap(idx) {
    close(true);
    Tabs.go('#mapa');
    setTimeout(() => { MapView.fitEntity(idx); MapView.highlightEntity(idx); }, 50);
  }

  function open(id) {
    const idx = conc.entidades.findIndex(x => x.id === id);
    if (idx < 0) return false;
    current = idx;
    render(conc.entidades[idx], idx);
    $('#ficha').hidden = false;
    $('#ficha-backdrop').hidden = false;
    $('#ficha').scrollTop = 0;
    $('#ficha-close').focus();
    return true;
  }

  // silent = só esconde (o roteador já mudou o hash); senão volta para a aba anterior.
  function close(silent = false) {
    if (current === null) return;
    current = null;
    closePopover();
    $('#ficha').hidden = true;
    $('#ficha-backdrop').hidden = true;
    if (!silent) Tabs.back();
  }

  function init(data) {
    conc = data;
    $('#ficha-backdrop').addEventListener('click', () => close());
    document.addEventListener('click', ev => { if (popover && !popover.contains(ev.target)) closePopover(); });
    document.addEventListener('keydown', ev => {
      if (ev.key !== 'Escape' || current === null) return;
      ev.stopImmediatePropagation();
      if (popover) closePopover(); else close();
    }, true);
  }

  return { init, open, close, isOpen: () => current !== null, exists: id => conc.entidades.some(x => x.id === id) };
})();
