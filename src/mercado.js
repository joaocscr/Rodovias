// Aba Mercado: séries do RoadShow em gráficos SVG próprios; v4: participantes verificados, série de deságio do
// vencedor 2007–2026 e ranking de grupos econômicos (LeiloesModel).
const Mercado = (() => {
  const nf0 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
  const nf1 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
  const nf2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // deságio com até 2 casas (valores oficiais têm 2): "23,83%", "15,3%", eixo "10%"
  const nfPct = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
  const pages = p => (Array.isArray(p) ? p : [p]).filter(x => x != null).join(', ');
  const plural = (n, um, varios) => `${nf0.format(n)} ${n === 1 ? um : varios}`;
  const MEDIA_IMPRESSA = '12,36%'; // média dos deságios 2023–26 impressa no RoadShow (pp. 25 e 27)
  const SERIE_NOTA = 'Pontos marcados como limitados pelo edital: desconto máximo permitido, desempate por outorga (2021)';

  let m, aliases = [], built = false;
  const rank = { de: null, ate: null, key: null, dir: 'desc' };

  // opts.src substitui o texto da fonte (padrão: páginas do RoadShow da chave); opts.foot entra abaixo do gráfico.
  function card(id, title, sub, opts = {}) {
    const note = m.notas && m.notas[opts.key] ? `<p class="src">Nota: ${esc(m.notas[opts.key])}</p>` : '';
    return `<article class="ccard${opts.wide ? ' ccard--wide' : ''}" id="card-${id}">
      <h3>${esc(title)}</h3>${sub ? `<p class="sub">${esc(sub)}</p>` : ''}
      ${opts.legend || ''}<div class="chart-box" id="chart-${id}">${opts.html || ''}</div>${opts.foot || ''}
      <p class="src">Fonte: ${esc(opts.src || roadshow(opts.key || id))}</p>${note}</article>`;
  }
  const roadshow = key => `RoadShow 2026-2027, p. ${pages(m.fontes[key])}`;

  // Vencedor exibido (verificado); quando o grupo econômico tem outro nome, "nome (grupo)" — sem repetir o grupo que
  // o nome já traz entre parênteses ("… S.A. (OHL Brasil)").
  function vencedorTxt(nome) {
    const g = LeiloesModel.grupoDe(nome, aliases);
    return g && g !== nome && !nome.endsWith(`(${g})`) ? `${nome} (${g})` : nome;
  }

  function proponentesTxt(p) {
    const pct = d => (d == null ? '' : ` (${nf2.format(d)}%)`);
    const inab = (p.inabilitados || []).map(i => `${esc(i.grupo)}${pct(i.desagio)} (inabilitado${i.data ? ` em ${esc(ConcModel.fmtData(i.data))}` : ''})`);
    return [...inab, ...(p.outros || []).map(o => `${esc(o.grupo)}${pct(o.desagio)}`)].join('; ') || '—';
  }

  // v4: o valor do RoadShow que deixou de ser exibido fica abaixo do verificado, como na ficha
  const rsTxt = t => (t != null && t !== '' ? ` <span class="part-rs">RoadShow: ${esc(t)}</span>` : '');

  function participantesTable(anoSel) {
    const rows = m.participantes.filter(p => !anoSel || String(p.ano) === anoSel);
    return `<div class="table-wrap" style="max-height:480px"><table class="grid" data-csv-name="participantes-leiloes"><thead><tr><th>Ano</th><th>Data</th><th>Lote</th><th>Vencedor</th><th class="num">Deságio vencedor</th><th>Fonte</th><th>Demais proponentes (deságio)</th></tr></thead><tbody>${
      rows.map(p => {
        const v = p.verif || {};
        // nome do RoadShow só quando é de outro grupo; deságio diferente sempre aparece
        const rsG0 = v.grupo_vencedor && v.grupo_vencedor.roadshow, rsD = v.desagio && v.desagio.roadshow;
        const rsG = LeiloesModel.rsDiverge(p.vencedor, rsG0, aliases) ? rsG0 : null;
        return `<tr><td>${p.ano}</td><td>${p.data ? esc(ConcModel.fmtData(p.data)) : '—'}</td><td class="wrap">${esc(p.lote)}</td><td class="wrap">${esc(vencedorTxt(p.vencedor))}${rsTxt(rsG)}</td>
        <td class="num">${p.desagio_vencedor == null ? '—' : nf2.format(p.desagio_vencedor) + '%'}${rsTxt(rsD == null ? null : nf2.format(rsD) + '%')}</td><td>${Selo.badge(v.desagio || v.grupo_vencedor) || '—'}</td>
        <td class="wrap wrap--wide">${proponentesTxt(p)}</td></tr>`;
      }).join('')}</tbody></table></div>`;
  }

  // ---- ranking de grupos econômicos ----
  const RANK_COLS = [['grupo', 'Grupo'], ['participacoes', 'Participações', true], ['vitorias', 'Vitórias', true], ['derrotas', 'Derrotas', true],
    ['taxa', 'Êxito (%)', true], ['primeira', '1ª aparição', true], ['ultima', 'Última', true]];
  const periodo = () => ({ de: Math.min(rank.de, rank.ate), ate: Math.max(rank.de, rank.ate) });

  function rankingTable() {
    const base = LeiloesModel.rankingGrupos(m.participantes, aliases, periodo());
    const rows = rank.key ? ConcModel.sortRows(base, rank.key, rank.dir) : base; // sem clique: ordem do modelo
    const seta = k => (k === rank.key ? (rank.dir === 'asc' ? ' ↑' : ' ↓') : '');
    return `<div class="table-wrap" style="max-height:480px"><table class="grid" id="ranking-grupos" data-csv-name="mercado-ranking-grupos"><thead><tr>${
      RANK_COLS.map(([k, l, n]) => `<th class="${n ? 'num' : ''}"${k === rank.key ? ` aria-sort="${rank.dir === 'asc' ? 'ascending' : 'descending'}"` : ''}><button type="button" data-sort="${k}">${esc(l)}${seta(k)}</button></th>`).join('')
    }</tr></thead><tbody>${rows.map(r => `<tr><td>${esc(r.grupo)}</td><td class="num">${r.participacoes}</td><td class="num">${r.vitorias}</td><td class="num">${r.derrotas}</td>
      <td class="num">${nf1.format(r.taxa)}</td><td class="num">${r.primeira}</td><td class="num">${r.ultima}</td></tr>`).join('')}</tbody></table></div>`;
  }

  function rankingAviso() {
    const n = LeiloesModel.leiloesSemLista(m.participantes, periodo());
    return `Em ${plural(n, 'leilão', 'leilões')} do período o RoadShow não lista os demais proponentes: neles só o vencedor é contado.`;
  }

  // "nome → grupo (motivo)", com link para a primeira fonte da junção (só http/https).
  function aliasesHtml() {
    const col = new Intl.Collator('pt-BR');
    const lista = [...aliases].sort((a, b) => col.compare(a.grupo, b.grupo) || col.compare(a.nome, b.nome));
    return `<details class="pipe-obs ranking-aliases" id="ranking-aliases"><summary>Como os nomes foram agrupados</summary><ul>${lista.map(a => {
      const f = (a.fontes || [])[0];
      const link = f && typeof f === 'object' && /^https?:\/\//i.test(f.url || '')
        ? ` · <a class="link-btn" href="${esc(f.url)}" target="_blank" rel="noopener">${esc(Selo.fonteTexto(f))}</a>` : '';
      return `<li>${esc(a.nome)} → ${esc(a.grupo)} (${esc(a.motivo)})${link}</li>`;
    }).join('')}</ul></details>`;
  }

  function render() {
    const el = document.getElementById('page-mercado');
    const anos = [...new Set(m.participantes.map(p => p.ano))].sort();
    rank.de = anos[0];
    rank.ate = anos[anos.length - 1];
    const c = m.concorrencia_2023_26 || {};
    const C = Charts.C;
    const conc = m.concorrentes_desagio.filter(x => x.desagio != null);
    const media = LeiloesModel.mediaDesagio(conc.map(x => x.desagio));
    const semDesagio = m.participantes.filter(p => p.desagio_vencedor == null).length;
    const anoOpts = sel => anos.map(a => `<option${a === sel ? ' selected' : ''}>${a}</option>`).join('');
    const serie = LeiloesModel.serieDesagio(m.participantes);
    const verificado = 'leilões conferidos em fonte oficial ou imprensa, com selo na tabela de participantes (documentos na aba Fontes)';
    el.innerHTML = `<div class="page__inner">
      <h1 class="page__title">Mercado de concessões rodoviárias federais</h1>
      <p class="page__lead">Leilões, concorrência, deságios, grupos econômicos e investimentos, segundo o RoadShow 2026-2027 do Ministério dos Transportes. Passe o mouse sobre os gráficos para ver os valores exatos.</p>
      <div class="grid-cards">
        ${card('kpis', 'Concorrência 2023–26', 'Totais dos leilões do programa (realizados e previstos até 2026)', { key: 'concorrencia_2023_26', wide: true,
          html: `<div class="kpis">${[[c.grupos_novos_entrantes, 'grupos participantes'], [c.km, 'km'], [c.capex, 'R$ bi de capex'], [c.opex, 'R$ bi de opex'], [c.capex_opex, 'R$ bi capex + opex'], [c.empregos_milhoes, 'milhões de empregos']]
            .filter(([v]) => v != null).map(([v, l]) => `<div class="kpi-tile"><b>${nf1.format(v)}</b><span>${l}</span></div>`).join('')}</div>` })}
        ${card('leiloes', 'Leilões por ano', 'Número de leilões de concessões rodoviárias federais, 1993–2030', { key: 'leiloes_por_ano', wide: true,
          legend: Charts.legendHtml([['Realizados', Charts.C.deep], ['Previstos', Charts.C.bright, 0.45]]) })}
        ${card('serie', 'Deságio do vencedor, 2007–2026', 'Desconto sobre a tarifa-teto oferecido pelo vencedor de cada leilão, na data do leilão', { wide: true,
          src: `${verificado}; RoadShow 2026-2027, p. ${pages(m.fontes.participantes)}, onde não há verificação`,
          legend: `<div id="serie-legenda">${Charts.legendHtml([{ label: 'oficial', color: C.deep, shape: 'dot' }, { label: 'RoadShow', color: C.bright, shape: 'dot' },
            { label: 'imprensa — não oficial', color: C.grey, shape: 'ring' },
            { label: 'linha de 18%: aporte de recursos vinculados, Portaria 995/2023, a partir de 2023', color: C.spacial, shape: 'line' }])}${
            serie.some(p => p.limitado) ? Charts.legendHtml([{ label: SERIE_NOTA, color: C.spacial, shape: 'limite' }]) : ''}</div>`,
          foot: `<p class="src" id="serie-sem">${plural(semDesagio, 'leilão', 'leilões')} sem deságio do vencedor localizado</p>` })}
        ${card('programa', 'Programa 2023–2027 por ano', 'Extensão e investimento (capex + opex) dos leilões', { key: 'programa_por_ano',
          legend: Charts.legendHtml([['Capex', Charts.C.deep], ['Opex', Charts.C.bright]]) })}
        ${card('desagio', 'Concorrentes × deságio', `Cada ponto é um dos ${conc.length} leilões de 2023–26${conc.length < m.concorrentes_desagio.length ? ` com deságio localizado (de ${m.concorrentes_desagio.length})` : ''}. ` +
          `Média dos deságios exibidos: ${media == null ? '—' : nf2.format(media) + '%'} (RoadShow, pp. 25 e 27: ${MEDIA_IMPRESSA})`, { key: 'concorrentes_desagio' })}
        ${card('faixas', 'Leilões por faixa de deságio', '2023–26, como impresso no RoadShow', { key: 'faixas_desagio' })}
        ${card('porN', 'Deságio médio por número de concorrentes', '2023–26, como impresso no RoadShow', { key: 'desagio_por_n_concorrentes' })}
        ${card('grupos', 'Grupos econômicos: extensão concedida', 'km sob concessão federal por grupo líder', { key: 'grupos' })}
        ${card('gruposInv', 'Grupos econômicos: investimento', 'Capex + opex contratados por grupo (R$ bi); passe o mouse para ver o detalhe', { key: 'grupos' })}
        ${card('gestao', 'Malha federal: gestão direta × concedida', 'Extensão em km, 2011–2026', { key: 'gestao',
          legend: Charts.legendHtml([['Concedida', Charts.C.deep], ['Gestão direta', Charts.C.bright]]) })}
        ${card('invest', 'Investimentos públicos × privados', 'R$ bi por ano (orçamento federal × capex + opex privado)', { key: 'investimentos',
          legend: Charts.legendHtml([['Público', Charts.C.deep], ['Privado', Charts.C.bright]]) })}
        ${card('diag', 'Diagnóstico da carteira', 'Contratos, extensão e valor concedido', { key: 'diagnostico' })}
        ${card('indic', 'Indicadores dos 40 leilões', 'Obras e equipamentos previstos', { key: 'indicadores_40', wide: true,
          html: `<div class="kpis">${m.indicadores_40.map(i => `<div class="kpi-tile"><b>${nf0.format(i.valor)}</b><span>${esc(i.unidade)} · ${esc(i.rotulo)}</span></div>`).join('')}</div>` })}
        ${card('part', 'Participantes dos leilões 2007–2026', 'Vencedor (adjudicatário que assinou o contrato) e demais proponentes com o deságio ofertado', { key: 'participantes', wide: true,
          src: `${roadshow('participantes')}; vencedor, data e deságio dos ${verificado}`,
          legend: `<div class="toolbar"><label class="sub" for="part-ano">Ano</label><select id="part-ano"><option value="">Todos</option>${anos.map(a => `<option>${a}</option>`).join('')}</select></div>`,
          html: participantesTable('') })}
        ${card('ranking', 'Grupos nos leilões, 2007–2026', 'Participações, vitórias e derrotas por grupo econômico; crédito pelo grupo que disputou na época do leilão. Clique no cabeçalho para ordenar', { wide: true,
          src: `${roadshow('participantes')} (proponentes); vencedor verificado nos ${verificado}`,
          legend: `<div class="toolbar"><label class="sub" for="rank-de">de</label><select id="rank-de">${anoOpts(rank.de)}</select>
            <label class="sub" for="rank-ate">até</label><select id="rank-ate">${anoOpts(rank.ate)}</select></div>
            <p class="sub" id="ranking-aviso">${esc(rankingAviso())}</p>`,
          html: rankingTable(), foot: aliasesHtml() })}
      </div></div>`;

    const box = id => document.getElementById('chart-' + id);
    Charts.bars(box('leiloes'), m.leiloes_por_ano.map(x => ({ label: String(x.ano), value: x.n, alt: x.previsto })), { unit: 'leilões', format: v => nf0.format(v), title: 'Leilões por ano' });
    Charts.stacked(box('programa'), m.programa_por_ano.map(x => ({ label: `${x.ano}${x.previsto ? '*' : ''} · ${nf0.format(x.km)} km`, parts: [x.capex, x.opex] })),
      { names: ['Capex', 'Opex'], unit: 'R$ bi', format: v => nf1.format(v), title: 'Programa por ano' });
    Charts.dots(box('serie'), serie, { refY: 18, refFromX: 2023, formatY: v => nfPct.format(v) + '%', title: 'Deságio do vencedor, 2007–2026' });
    Charts.scatter(box('desagio'), conc.map(x => ({ x: x.n, y: x.desagio, label: `${x.leilao} (${x.ano})` })),
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

    const renderRanking = () => {
      box('ranking').innerHTML = rankingTable();
      document.getElementById('ranking-aviso').textContent = rankingAviso();
    };
    ['de', 'ate'].forEach(k => document.getElementById('rank-' + k).addEventListener('change', ev => {
      rank[k] = Number(ev.target.value);
      if (rank.de > rank.ate) { [rank.de, rank.ate] = [rank.ate, rank.de]; } // de > até: os seletores trocam de lugar
      document.getElementById('rank-de').value = String(rank.de);
      document.getElementById('rank-ate').value = String(rank.ate);
      renderRanking();
    }));
    box('ranking').addEventListener('click', ev => {
      const b = ev.target.closest('[data-sort]');
      if (!b) return;
      const k = b.dataset.sort;
      if (rank.key === k) rank.dir = rank.dir === 'asc' ? 'desc' : 'asc';
      else { rank.key = k; rank.dir = k === 'grupo' ? 'asc' : 'desc'; }
      renderRanking();
      box('ranking').querySelector(`[data-sort="${k}"]`).focus();
    });
  }

  function init(conc) {
    m = conc.mercado;
    aliases = conc.grupos_alias || [];
    if (built) return;
    built = true;
    render();
  }

  return { init };
})();
