// Aba Mercado: séries do RoadShow em gráficos SVG próprios.
const Mercado = (() => {
  const nf0 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
  const nf1 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
  const nf2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pages = p => (Array.isArray(p) ? p : [p]).filter(x => x != null).join(', ');

  let m, built = false;

  function card(id, title, sub, opts = {}) {
    const note = m.notas && m.notas[opts.key] ? `<p class="src">Nota: ${esc(m.notas[opts.key])}</p>` : '';
    return `<article class="ccard${opts.wide ? ' ccard--wide' : ''}" id="card-${id}">
      <h3>${esc(title)}</h3>${sub ? `<p class="sub">${esc(sub)}</p>` : ''}
      ${opts.legend || ''}<div class="chart-box" id="chart-${id}">${opts.html || ''}</div>
      <p class="src">Fonte: RoadShow 2026-2027, p. ${esc(pages(m.fontes[opts.key || id]))}</p>${note}</article>`;
  }

  function participantesTable(anoSel) {
    const rows = m.participantes.filter(p => !anoSel || String(p.ano) === anoSel);
    return `<div class="table-wrap" style="max-height:480px"><table class="grid" data-csv-name="participantes-leiloes"><thead><tr><th>Ano</th><th>Lote</th><th>Vencedor</th><th class="num">Deságio vencedor</th><th>Demais proponentes (deságio)</th></tr></thead><tbody>${
      rows.map(p => `<tr><td>${p.ano}</td><td>${esc(p.lote)}</td><td>${esc(p.vencedor)}</td><td class="num">${p.desagio_vencedor == null ? '—' : nf2.format(p.desagio_vencedor) + '%'}</td>
        <td style="white-space:normal">${(p.outros || []).map(o => `${esc(o.grupo)}${o.desagio == null ? '' : ` (${nf2.format(o.desagio)}%)`}`).join('; ') || '—'}</td></tr>`).join('')}</tbody></table></div>`;
  }

  function render() {
    const el = document.getElementById('page-mercado');
    const anos = [...new Set(m.participantes.map(p => p.ano))].sort();
    const c = m.concorrencia_2023_26 || {};
    el.innerHTML = `<div class="page__inner">
      <h1 class="page__title">Mercado de concessões rodoviárias federais</h1>
      <p class="page__lead">Leilões, concorrência, deságios, grupos econômicos e investimentos, segundo o RoadShow 2026-2027 do Ministério dos Transportes. Passe o mouse sobre os gráficos para ver os valores exatos.</p>
      <div class="grid-cards">
        ${card('kpis', 'Concorrência 2023–26', 'Totais dos leilões do programa (realizados e previstos até 2026)', { key: 'concorrencia_2023_26', wide: true,
          html: `<div class="kpis">${[[c.grupos_novos_entrantes, 'grupos participantes'], [c.km, 'km'], [c.capex, 'R$ bi de capex'], [c.opex, 'R$ bi de opex'], [c.capex_opex, 'R$ bi capex + opex'], [c.empregos_milhoes, 'milhões de empregos']]
            .filter(([v]) => v != null).map(([v, l]) => `<div class="kpi-tile"><b>${nf1.format(v)}</b><span>${l}</span></div>`).join('')}</div>` })}
        ${card('leiloes', 'Leilões por ano', 'Número de leilões de concessões rodoviárias federais, 1993–2030', { key: 'leiloes_por_ano', wide: true,
          legend: Charts.legendHtml([['Realizados', Charts.C.deep], ['Previstos', Charts.C.bright, 0.45]]) })}
        ${card('programa', 'Programa 2023–2027 por ano', 'Extensão e investimento (capex + opex) dos leilões', { key: 'programa_por_ano',
          legend: Charts.legendHtml([['Capex', Charts.C.deep], ['Opex', Charts.C.bright]]) })}
        ${card('desagio', 'Concorrentes × deságio', 'Cada ponto é um dos 25 leilões de 2023–26', { key: 'concorrentes_desagio' })}
        ${card('faixas', 'Leilões por faixa de deságio', '2023–26', { key: 'faixas_desagio' })}
        ${card('porN', 'Deságio médio por número de concorrentes', '2023–26', { key: 'desagio_por_n_concorrentes' })}
        ${card('grupos', 'Grupos econômicos: extensão concedida', 'km sob concessão federal por grupo líder', { key: 'grupos' })}
        ${card('gruposInv', 'Grupos econômicos: investimento', 'Capex + opex contratados por grupo (R$ bi); passe o mouse para ver o detalhe', { key: 'grupos' })}
        ${card('gestao', 'Malha federal: gestão direta × concedida', 'Extensão em km, 2011–2026', { key: 'gestao',
          legend: Charts.legendHtml([['Concedida', Charts.C.deep], ['Gestão direta', Charts.C.bright]]) })}
        ${card('invest', 'Investimentos públicos × privados', 'R$ bi por ano (orçamento federal × capex + opex privado)', { key: 'investimentos',
          legend: Charts.legendHtml([['Público', Charts.C.deep], ['Privado', Charts.C.bright]]) })}
        ${card('diag', 'Diagnóstico da carteira', 'Contratos, extensão e valor concedido', { key: 'diagnostico' })}
        ${card('indic', 'Indicadores dos 40 leilões', 'Obras e equipamentos previstos', { key: 'indicadores_40', wide: true,
          html: `<div class="kpis">${m.indicadores_40.map(i => `<div class="kpi-tile"><b>${nf0.format(i.valor)}</b><span>${esc(i.unidade)} · ${esc(i.rotulo)}</span></div>`).join('')}</div>` })}
        ${card('part', 'Participantes dos leilões 2007–2026', 'Vencedor e demais proponentes com o deságio ofertado', { key: 'participantes', wide: true,
          legend: `<div class="toolbar"><label class="sub" for="part-ano">Ano</label><select id="part-ano"><option value="">Todos</option>${anos.map(a => `<option>${a}</option>`).join('')}</select></div>`,
          html: participantesTable('') })}
      </div></div>`;

    const box = id => document.getElementById('chart-' + id);
    Charts.bars(box('leiloes'), m.leiloes_por_ano.map(x => ({ label: String(x.ano), value: x.n, alt: x.previsto })), { unit: 'leilões', format: v => nf0.format(v), title: 'Leilões por ano' });
    Charts.stacked(box('programa'), m.programa_por_ano.map(x => ({ label: `${x.ano}${x.previsto ? '*' : ''} · ${nf0.format(x.km)} km`, parts: [x.capex, x.opex] })),
      { names: ['Capex', 'Opex'], unit: 'R$ bi', format: v => nf1.format(v), title: 'Programa por ano' });
    Charts.scatter(box('desagio'), m.concorrentes_desagio.map(x => ({ x: x.n, y: x.desagio, label: `${x.leilao} (${x.ano})` })),
      { xLabel: 'concorrentes', formatX: v => nf0.format(v), formatY: v => nf1.format(v) + '%', title: 'Concorrentes × deságio' });
    Charts.hbars(box('faixas'), m.faixas_desagio.map(x => ({ label: x.faixa, value: x.n })), { unit: 'leilões', format: v => nf0.format(v) });
    Charts.hbars(box('porN'), m.desagio_por_n_concorrentes.map(x => ({ label: `${x.concorrentes} concorrente${x.concorrentes === 1 ? '' : 's'} (${x.leiloes} leilão${x.leiloes === 1 ? '' : 'ões'})`, value: x.desagio_medio })),
      { unit: '%', format: v => nf1.format(v) + '%' });
    Charts.hbars(box('grupos'), m.grupos.map(g => ({ label: g.grupo, value: g.km })), { unit: 'km', format: v => nf0.format(v), sort: true });
    Charts.hbars(box('gruposInv'), m.grupos.map(g => ({ label: g.grupo, value: g.capex_opex ?? (g.capex || 0) + (g.opex || 0),
      detail: `capex ${nf2.format(g.capex)} + opex ${nf2.format(g.opex)}` })), { unit: 'R$ bi', format: v => nf2.format(v), sort: true });
    Charts.lines(box('gestao'), [
      { name: 'Concedida', points: m.gestao.map(g => ({ x: g.ano, y: g.privada_km })) },
      { name: 'Gestão direta', points: m.gestao.map(g => ({ x: g.ano, y: g.direta_km })) },
    ], { unit: 'km', format: v => nf0.format(v) });
    Charts.stacked(box('invest'), m.investimentos.map(x => ({ label: String(x.ano) + (x.previsto ? '*' : ''), parts: [x.publico, x.privado] })), { names: ['Público', 'Privado'], unit: 'R$ bi', format: v => nf1.format(v) });
    box('diag').innerHTML = `<table class="grid" data-csv-name="mercado-diagnostico"><thead><tr><th>Ano</th><th class="num">Contratos</th><th class="num">km concedidos</th><th class="num">Valor (R$ bi)</th><th class="num">Invest. executado acum. (R$ bi)</th></tr></thead><tbody>${
      m.diagnostico.map(d => `<tr><td>${d.ano}</td><td class="num">${d.contratos ?? '—'}</td><td class="num">${d.km == null ? '—' : nf0.format(d.km)}</td><td class="num">${d.valor == null ? '—' : nf1.format(d.valor)}</td><td class="num">${d.invest_executado_acum == null ? '—' : nf1.format(d.invest_executado_acum)}</td></tr>`).join('')}</tbody></table>`;
    document.getElementById('part-ano').addEventListener('change', ev => { box('part').innerHTML = participantesTable(ev.target.value); });
  }

  function init(conc) {
    m = conc.mercado;
    if (built) return;
    built = true;
    render();
  }

  return { init };
})();
