// Aba Mercado: séries do RoadShow em gráficos SVG próprios; participantes verificados, série de deságio do
// vencedor e ranking de grupos econômicos (LeiloesModel); diagnóstico por ano (MercadoModel). Períodos, contagens e
// constantes impressas vêm dos dados (mercado.json e bases embutidas), nunca do código.
const Mercado = (() => {
  const nf0 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
  const nf1 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
  const nf2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // deságio com até 2 casas (valores oficiais têm 2): "23,83%", "15,3%", eixo "10%"
  const nfPct = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
  const pages = MercadoModel.paginas;
  const plural = MercadoModel.plural;
  const SERIE_TITULO = 'Deságio do vencedor nos leilões de concessões rodoviárias federais (ANTT)';
  const SERIE_NOTA = 'Pontos marcados como limitados pelo edital: desconto máximo permitido, desempate por outorga (2021)';

  let m, concDados = null, aliases = [], consorcios = [], regra = null, built = false, diagLinhas = [], edicao = '';
  const rank = { de: null, ate: null, key: null, dir: 'desc' };

  // opts.src substitui o texto da fonte (padrão: páginas do RoadShow da chave); opts.foot entra abaixo do gráfico.
  function card(id, title, sub, opts = {}) {
    const note = m.notas && m.notas[opts.key] ? `<p class="src">Nota: ${esc(m.notas[opts.key])}</p>` : '';
    return `<article class="ccard${opts.wide ? ' ccard--wide' : ''}" id="card-${id}">
      <h3>${esc(title)}</h3>${sub || opts.subHtml ? `<p class="sub">${esc(sub || '')}${opts.subHtml || ''}</p>` : ''}
      ${opts.legend || ''}<div class="chart-box" id="chart-${id}">${opts.html || ''}</div>${opts.foot || ''}
      <p class="src">Fonte: ${esc(opts.src || roadshow(opts.key || id))}</p>${note}</article>`;
  }
  // linha de referência da série de deságio: limite do aporte (regulatorio.json) e ano da portaria
  const refLabel = () => `linha de ${nfPct.format(regra.limite)}%: aporte de recursos vinculados, ${LeiloesModel.PORTARIA_APORTE.nome}, a partir de ${LeiloesModel.PORTARIA_APORTE.ano}`;
  const roadshow = key => `RoadShow 2026-2027, ${pages(m.fontes[key])}`;

  // Nome de consórcio vira botão que abre a ficha (composição, participação e leilões); outros nomes seguem como texto.
  // A ficha abre no grupo e destaca o consórcio clicado naquele leilão (data-ano, data-lote).
  const nomeHtml = (nome, p) => (LeiloesModel.ehConsorcio(nome, consorcios)
    ? `<button type="button" class="link-btn cons-open" data-ficha="${esc(nome)}" data-ano="${p.ano}" data-lote="${esc(p.lote)}">${esc(nome)}</button>` : esc(nome));

  // Vencedor exibido (verificado); quando o grupo econômico tem outro nome, "nome (grupo)" — sem repetir o grupo que
  // o nome já traz entre parênteses ("… S.A. (OHL Brasil)").
  function vencedorHtml(nome, p) {
    const g = LeiloesModel.grupoDe(nome, aliases);
    return nomeHtml(nome, p) + (g && g !== nome && !nome.endsWith(`(${g})`) ? esc(` (${g})`) : '');
  }

  function proponentesTxt(p) {
    const pct = d => (d == null ? '' : ` (${nf2.format(d)}%)`);
    const inab = (p.inabilitados || []).map(i => `${nomeHtml(i.grupo, p)}${pct(i.desagio)} (inabilitado${i.data ? ` em ${esc(ConcModel.fmtData(i.data))}` : ''})`);
    return [...inab, ...(p.outros || []).map(o => `${nomeHtml(o.grupo, p)}${pct(o.desagio)}`)].join('; ') || '—';
  }

  // O valor do RoadShow que deixou de ser exibido fica abaixo do verificado, como na ficha
  const rsTxt = t => (t != null && t !== '' ? ` <span class="part-rs">RoadShow: ${esc(t)}</span>` : '');

  function participantesTable(anoSel) {
    const rows = m.participantes.filter(p => !anoSel || String(p.ano) === anoSel);
    return `<div class="table-wrap" style="max-height:480px"><table class="grid" data-csv-name="participantes-leiloes"><thead><tr><th>Ano</th><th>Data</th><th>Lote</th><th>Vencedor</th><th class="num">Deságio vencedor</th><th>Fonte</th><th>Demais proponentes (deságio)</th></tr></thead><tbody>${
      rows.map(p => {
        const v = p.verif || {};
        // nome do RoadShow só quando é de outro grupo; deságio diferente sempre aparece
        const rsG0 = v.grupo_vencedor && v.grupo_vencedor.roadshow, rsD = v.desagio && v.desagio.roadshow;
        const rsG = LeiloesModel.rsDiverge(p.vencedor, rsG0, aliases) ? rsG0 : null;
        return `<tr><td>${p.ano}</td><td>${p.data ? esc(ConcModel.fmtData(p.data)) : '—'}</td><td class="wrap">${esc(p.lote)}</td><td class="wrap">${vencedorHtml(p.vencedor, p)}${rsTxt(rsG)}</td>
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
    }</tr></thead><tbody>${rows.map(r => `<tr><td><button type="button" class="link-btn cons-open" data-ficha="${esc(r.grupo)}">${esc(r.grupo)}</button></td><td class="num">${r.participacoes}</td><td class="num">${r.vitorias}</td><td class="num">${r.derrotas}</td>
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

  // "2010–2024" a partir dos anos da série (menor e maior)
  const periodoSerie = serie => {
    const anos = (serie || []).map(x => x.ano).filter(Number.isFinite);
    return anos.length ? `${Math.min(...anos)}–${Math.max(...anos)}` : '';
  };
  const comPeriodo = (txt, p, sep = ', ') => (p ? `${txt}${sep}${p}` : txt);
  // média dos deságios impressa no RoadShow, com as páginas (pp. 25 e 27 na edição atual)
  function mediaImpressa() {
    if (m.desagio_medio_impresso == null) return '';
    const pp = [].concat(m.fontes.desagio_medio_impresso || []);
    return ` (RoadShow, ${pp.length > 1 ? 'pp.' : 'p.'} ${pp.join(', ').replace(/, ([^,]*)$/, ' e $1')}: ${nf2.format(m.desagio_medio_impresso)}%)`;
  }
  const fmtNum = v => (v == null ? '—' : nfPct.format(v));

  // Comparativos das pp. 41 e 45: período base (realizado) × comparado (previsto), média anual e variação impressas.
  function comparativosTable(lista) {
    const lado = l => `${esc(l.periodo)}${l.previsto ? ' (previsto)' : ''}: ${fmtNum(l.valor)}`;
    return `<div class="table-wrap" style="max-height:none"><table class="grid" id="comparativos" data-csv-name="mercado-comparativos"><thead><tr><th>Comparativo</th><th>Período base</th><th>Período comparado</th><th class="num">Média anual</th><th class="num">Variação</th><th class="num">Página</th></tr></thead><tbody>${
      lista.map(c => `<tr><td class="wrap">${esc(c.rotulo)} (${esc(c.unidade)})</td><td>${lado(c.base)}</td><td>${lado(c.comparado)}</td>
        <td class="num">${c.base.media_anual == null ? '—' : `${fmtNum(c.base.media_anual)} → ${fmtNum(c.comparado.media_anual)}`}</td>
        <td class="num">${fmtNum(c.multiplo)}x (+${fmtNum(c.variacao_pct)}%)</td><td class="num">${esc(c.pagina)}</td></tr>`).join('')}</tbody></table></div>`;
  }

  // ---- diagnóstico por ano (linhas e fontes vêm de MercadoModel.diagnosticoPorAno) ----
  const DIAG_COLS = [['contratos', 'Contratos', v => nf0.format(v)], ['km', 'km concedidos', v => nf0.format(v)],
    ['valor', 'Valor dos contratos (R$ bi)', v => nf1.format(v)], ['invest_executado_acum', 'Investimento executado acumulado (R$ bi)', v => nf1.format(v)]];
  const diagCelula = (d, [k, , fmt]) => `<td class="num" title="${esc(d.fontes[k])}">${d[k] == null ? '—' : fmt(d[k])}</td>`;
  function diagnosticoTable() {
    return `<div class="table-wrap" style="max-height:none"><table class="grid" id="diagnostico" data-csv-name="mercado-diagnostico"><thead><tr><th>Ano</th>${
      DIAG_COLS.map(c => `<th class="num">${esc(c[1])}</th>`).join('')}<th>Fonte de cada valor</th></tr></thead><tbody>${
      diagLinhas.map(d => `<tr data-ano="${d.ano}"><td>${d.ano}${d.previsto ? '*' : ''}</td>${DIAG_COLS.map(c => diagCelula(d, c)).join('')}
        <td class="wrap wrap--wide">${esc(diagFontes(d))}</td></tr>`).join('')}</tbody></table></div>`;
  }
  // Fonte da linha: uma vez só quando todos os valores preenchidos a compartilham (com os nomes das colunas quando
  // algum ficou vazio); fontes diferentes, uma por coluna. Valor vazio é "não publicado" (dica da célula).
  function diagFontes(d) {
    const nome = ([, l]) => l.replace(/ \(R\$ bi\)/, '');
    const cheias = DIAG_COLS.filter(([k]) => d[k] != null), fontes = [...new Set(cheias.map(([k]) => d.fontes[k]))];
    if (fontes.length === 1) return cheias.length === DIAG_COLS.length ? fontes[0] : `${cheias.map(nome).join(', ')}: ${fontes[0]}`;
    return cheias.map(c => `${nome(c)}: ${d.fontes[c[0]]}`).join('; ') || '—';
  }
  function diagNotaHtml() {
    const nota = MercadoModel.diagnosticoNota(diagLinhas);
    return nota ? `<p class="src" id="diagnostico-nota">Nota: ${esc(nota)}</p>` : '';
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
    const pPart = periodoSerie(m.participantes), pConc = periodoSerie(m.concorrentes_desagio), pImp = m.periodo_concorrencia || '';
    const pProg = periodoSerie(m.programa_por_ano);
    const nLeiloesProg = m.programa_por_ano.reduce((t, x) => t + (x.leiloes || 0), 0);
    const nConcessoes = m.grupos.reduce((t, g) => t + (g.n_concessoes || 0), 0);
    const impresso = pImp ? `Leilões do programa federal em ${pImp}, como impresso no RoadShow` : 'Como impresso no RoadShow';
    const verificado = 'leilões conferidos em fonte oficial ou imprensa, com selo na tabela de participantes (documentos na aba Fontes)';
    el.innerHTML = `<div class="page__inner">
      <h1 class="page__title">Mercado de concessões rodoviárias federais</h1>
      <p class="page__lead">Leilões, concorrência, ${Glossario.link('desagio', 'deságios')}, ${Glossario.link('grupo-economico', 'grupos econômicos')} e investimentos das concessões rodoviárias federais, segundo o ${Glossario.link('roadshow', 'RoadShow')}: a apresentação do Ministério dos Transportes a investidores sobre a carteira de concessões${edicao ? ` (${esc(edicao)})` : ''}. Passe o mouse sobre os gráficos para ver os valores exatos.</p>
      <div class="grid-cards">
        ${card('kpis', comPeriodo('Concorrência nos leilões do programa federal', pImp), `Totais dos leilões de concessões rodoviárias do programa federal${pProg ? ` ${pProg}` : ''} do Ministério dos Transportes, realizados e previstos${pImp ? ` em ${pImp}` : ''}`, { key: 'concorrencia_2023_26', wide: true,
          html: `<div class="kpis">${[[c.grupos_novos_entrantes, 'grupos participantes'], [c.km, 'km'], [c.capex, 'R$ bi de capex'], [c.opex, 'R$ bi de opex'], [c.capex_opex, 'R$ bi capex + opex'], [c.empregos_milhoes, 'milhões de empregos']]
            .filter(([v]) => v != null).map(([v, l]) => `<div class="kpi-tile"><b>${nf1.format(v)}</b><span>${l}</span></div>`).join('')}</div>` })}
        ${card('leiloes', 'Leilões por ano', comPeriodo('Número de leilões de concessões rodoviárias federais (ANTT)', periodoSerie(m.leiloes_por_ano)), { key: 'leiloes_por_ano', wide: true,
          legend: Charts.legendHtml([['Realizados', Charts.C.deep], ['Previstos', Charts.C.bright, 0.45]]) })}
        ${card('serie', comPeriodo(SERIE_TITULO, pPart), 'Desconto sobre a tarifa-teto oferecido pelo vencedor de cada leilão, na data do leilão.', { wide: true,
          subHtml: ` Leilões decididos pela maior ${Glossario.link('outorga', 'outorga')} não têm deságio de tarifa e ficam de fora${regra ? `; a linha tracejada marca o limite do ${Glossario.link('aporte-recursos-vinculados', 'aporte de recursos vinculados')}` : ''}.`,
          src: `${verificado}; RoadShow 2026-2027, ${pages(m.fontes.participantes)}, onde não há documento conferido`,
          legend: `<div id="serie-legenda">${Charts.legendHtml([{ label: 'oficial', color: C.deep, shape: 'dot' }, { label: 'RoadShow', color: C.bright, shape: 'dot' },
            { label: 'imprensa — não oficial', color: C.grey, shape: 'ring' },
            ...(regra ? [{ label: refLabel(), color: C.spacial, shape: 'line' }] : [])])}${
            serie.some(p => p.limitado) ? Charts.legendHtml([{ label: SERIE_NOTA, color: C.spacial, shape: 'limite' }]) : ''}</div>`,
          foot: `<p class="src" id="serie-sem">${plural(semDesagio, 'leilão', 'leilões')} sem deságio do vencedor localizado</p>` })}
        ${card('programa', `${comPeriodo('Programa federal de concessões rodoviárias', pProg, ' ')}, por ano`, 'Extensão (km) e investimento contratado (capex = obras e equipamentos; opex = operação e manutenção, em R$ bi) dos leilões de cada ano; * = previsto', { key: 'programa_por_ano',
          legend: Charts.legendHtml([['Capex', Charts.C.deep], ['Opex', Charts.C.bright]]) })}
        ${card('desagio', 'Concorrentes por leilão × deságio do vencedor', `Cada ponto é um dos ${conc.length} leilões do programa federal${pConc ? ` de ${pConc}` : ''}${conc.length < m.concorrentes_desagio.length ? ` com deságio localizado (de ${m.concorrentes_desagio.length})` : ''}. ` +
          `Média dos deságios exibidos: ${media == null ? '—' : nf2.format(media) + '%'}${mediaImpressa()}`, { key: 'concorrentes_desagio' })}
        ${card('faixas', 'Leilões por faixa de deságio', impresso, { key: 'faixas_desagio' })}
        ${card('porN', 'Deságio médio por número de concorrentes', `${impresso}; entre parênteses, quantos leilões tiveram esse número de concorrentes`, { key: 'desagio_por_n_concorrentes' })}
        ${card('grupos', 'Grupos econômicos: extensão concedida', `km sob concessão federal em ${plural(nConcessoes, 'concessão', 'concessões')}, por grupo econômico líder; "Outros" reúne os grupos menores. Clique numa linha para ver os consórcios e os leilões do grupo`, { key: 'grupos' })}
        ${card('gruposInv', 'Grupos econômicos: investimento', `Capex + opex contratados nas ${plural(nConcessoes, 'concessão', 'concessões')} (R$ bi), por grupo econômico; passe o mouse sobre a linha para ver capex e opex separados. Clique nela para ver os consórcios e os leilões do grupo`, { key: 'grupos' })}
        ${card('gestao', 'Malha federal: gestão direta × concedida', comPeriodo('Extensão da malha rodoviária federal pavimentada, em km, administrada diretamente pelo DNIT × concedida à iniciativa privada', periodoSerie(m.gestao)), { key: 'gestao',
          legend: Charts.legendHtml([['Concedida', Charts.C.deep], ['Gestão direta', Charts.C.bright]]) })}
        ${card('invest', 'Investimento em rodovias federais: público × privado', `R$ bi por ano${periodoSerie(m.investimentos) ? `, ${periodoSerie(m.investimentos)}` : ''}: orçamento federal (público) × capex + opex das concessões (privado); * = previsto`, { key: 'investimentos',
          legend: Charts.legendHtml([['Público', Charts.C.deep], ['Privado', Charts.C.bright]]) })}
        ${m.comparativos ? card('comparativos', 'Investimento em rodovias federais: período realizado × previsto', 'Investimento público e privado acumulado no período base (realizado) e no comparado (previsto), em R$ bi; a tabela traz as médias anuais e as variações impressas', { key: 'comparativos', wide: true,
          legend: Charts.legendHtml([['Realizado', C.deep], ['Previsto', C.bright]]), foot: comparativosTable(m.comparativos) }) : ''}
        ${m.abdib ? card('abdib', 'Investimento em infraestrutura (ABDIB)', `${m.abdib.fonte_original}: toda a infraestrutura do país, não só rodovias. R$\u00a0bi por ano, ${periodoSerie(m.abdib.serie)}`, { key: 'abdib',
          legend: Charts.legendHtml([['Público', C.deep], ['Privado', C.bright]]) }) : ''}
        ${m.debentures ? `<p class="grid-linha" id="mercado-debentures-link">Emissões anuais de debêntures incentivadas para rodovias (RoadShow, ${esc(pages(m.fontes.debentures))}): veja na aba <a href="#debentures">Debêntures</a>.</p>` : ''}
        ${m.pavimento ? card('pavimento', 'Custo do transporte de cargas por estado do pavimento', `Aumento do custo operacional do transporte rodoviário de cargas conforme o estado do pavimento. Acréscimo médio no Brasil: ${nf1.format(m.pavimento.acrescimo_medio)}%`, { key: 'pavimento',
          src: `${roadshow('pavimento')} (${m.pavimento.fonte_original})`, legend: Charts.legendHtml([['Aumento do custo operacional', C.deep]]) }) : ''}
        ${card('diag', 'Concessões rodoviárias federais por ano', 'Contratos, extensão concedida (km), valor dos contratos e investimento executado acumulado (R$ bi); * = previsto', { key: 'diagnostico', wide: true,
          src: `RoadShow, ${pages(m.fontes.diagnostico)} (anos impressos) e ${pages(m.fontes.gestao)} (extensão nos demais anos); a fonte de cada valor está na última coluna`,
          foot: diagNotaHtml() })}
        ${card('indic', `Indicadores dos ${nLeiloesProg} leilões do programa federal de concessões rodoviárias${pProg ? ` ${pProg}` : ''} (Ministério dos Transportes)`, 'Obras e equipamentos previstos nos contratos', { key: 'indicadores_40', wide: true,
          html: `<div class="kpis">${m.indicadores_40.map(i => `<div class="kpi-tile"><b>${nf0.format(i.valor)}</b><span>${esc(i.unidade)} · ${esc(i.rotulo)}</span></div>`).join('')}</div>` })}
        ${card('part', comPeriodo('Participantes dos leilões de concessões rodoviárias federais', pPart), 'Vencedor (adjudicatário que assinou o contrato) e demais proponentes com o deságio ofertado. Clique no nome de um consórcio para ver quem o compõe', { key: 'participantes', wide: true,
          src: `${roadshow('participantes')}; vencedor, data e deságio dos ${verificado}`,
          legend: `<div class="toolbar"><label class="sub" for="part-ano">Ano</label><select id="part-ano"><option value="">Todos</option>${anos.map(a => `<option>${a}</option>`).join('')}</select></div>`,
          html: participantesTable('') })}
        ${card('ranking', comPeriodo('Grupos econômicos nos leilões de concessões rodoviárias federais', pPart), 'Participações, vitórias e derrotas por grupo econômico; crédito pelo grupo que disputou na época do leilão. Clique no cabeçalho para ordenar e no nome de um grupo para ver os consórcios e os leilões dele', { wide: true,
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
    Charts.dots(box('serie'), serie, { refY: regra ? regra.limite : null, refFromX: LeiloesModel.PORTARIA_APORTE.ano, formatY: v => nfPct.format(v) + '%', title: comPeriodo(SERIE_TITULO, pPart) });
    Charts.scatter(box('desagio'), conc.map(x => ({ x: x.n, y: x.desagio, label: `${x.leilao} (${x.ano})` })),
      { xLabel: 'concorrentes', formatX: v => nf0.format(v), formatY: v => nf1.format(v) + '%', title: 'Concorrentes × deságio' });
    Charts.hbars(box('faixas'), m.faixas_desagio.map(x => ({ label: x.faixa, value: x.n })), { unit: 'leilões', format: v => nf0.format(v) });
    Charts.hbars(box('porN'), m.desagio_por_n_concorrentes.map(x => ({ label: MercadoModel.rotuloConcorrentes(x.concorrentes, x.leiloes), value: x.desagio_medio })),
      { unit: '%', format: v => nf1.format(v) + '%' });
    // maiores primeiro; a linha "Outros N grupos" fecha o gráfico mesmo quando a soma dela é maior que a de um grupo
    const porValor = rows => MercadoModel.grupoOutrosPorUltimo([...rows].sort((a, b) => (b.value || 0) - (a.value || 0)));
    // cada grupo abre a ficha (k); "Outros N grupos" reúne vários e um grupo sem leilão na base não teria o que mostrar
    const fichaDe = g => (MercadoModel.grupoEhOutros(g) || !LeiloesModel.fichaGrupo(g.grupo, concDados).leiloes.length ? {} : { k: g.grupo });
    const linkGrupo = { clickable: true, rowLabel: r => `Abrir a ficha de ${r.label}` };
    Charts.hbars(box('grupos'), porValor(m.grupos.map(g => ({ label: g.grupo, value: g.km, ...fichaDe(g) }))), { unit: 'km', format: v => nf0.format(v), ...linkGrupo });
    Charts.hbars(box('gruposInv'), porValor(m.grupos.map(g => ({ label: g.grupo, value: g.capex_opex ?? (g.capex || 0) + (g.opex || 0),
      detail: `capex ${nf2.format(g.capex)} + opex ${nf2.format(g.opex)}`, ...fichaDe(g) }))), { unit: 'R$ bi', format: v => nf2.format(v), ...linkGrupo });
    Charts.lines(box('gestao'), [
      { name: 'Concedida', points: m.gestao.map(g => ({ x: g.ano, y: g.privada_km })) },
      { name: 'Gestão direta', points: m.gestao.map(g => ({ x: g.ano, y: g.direta_km })) },
    ], { unit: 'km', format: v => nf0.format(v) });
    Charts.stacked(box('invest'), m.investimentos.map(x => ({ label: String(x.ano) + (x.previsto ? '*' : ''), parts: [x.publico, x.privado] })), { names: ['Público', 'Privado'], unit: 'R$ bi', format: v => nf1.format(v) });
    if (m.comparativos) {
      const bi = m.comparativos.filter(c => c.unidade === m.comparativos[0].unidade); // só os acumulados na mesma unidade
      Charts.hbars(box('comparativos'), bi.flatMap(c => [c.base, c.comparado].map(l => ({ label: `${c.curto} · ${l.periodo}${l.previsto ? '*' : ''}`, value: l.valor, alt: l.previsto }))),
        { unit: bi.length ? bi[0].unidade : '', format: fmtNum, labelWidth: Math.min(260, box('comparativos').clientWidth * 0.45), title: 'Comparativos público × privado' });
    }
    if (m.abdib) {
      Charts.stacked(box('abdib'), m.abdib.serie.map(x => ({ label: String(x.ano), tip: `${x.ano} (total impresso: R$ ${nf1.format(x.total)} bi)`, parts: [x.publico, x.privado] })),
        { names: ['Público', 'Privado'], unit: 'R$ bi', format: v => nf1.format(v), title: 'Investimento em infraestrutura (ABDIB)' });
    }
    if (m.pavimento) {
      Charts.hbars(box('pavimento'), m.pavimento.estados.map(e => ({ label: e.estado, value: e.aumento_pct })), { format: v => nf1.format(v) + '%', title: 'Estado do pavimento' });
    }
    box('diag').innerHTML = diagnosticoTable();
    document.getElementById('part-ano').addEventListener('change', ev => { box('part').innerHTML = participantesTable(ev.target.value); });

    // Ficha de grupo e consórcio: botão do ranking e da tabela de participantes (data-ficha), linha dos gráficos de grupos (data-k)
    const abreFicha = (ev, seletor, attr) => {
      const b = ev.target.closest(seletor);
      if (!b) return false;
      const d = b.dataset;
      Consorcios.abrir(d[attr], d.lote != null ? { ano: Number(d.ano), lote: d.lote, consorcio: d[attr] } : undefined);
      return true;
    };
    ['ranking', 'part'].forEach(id => box(id).addEventListener('click', ev => abreFicha(ev, '[data-ficha]', 'ficha')));
    ['grupos', 'gruposInv'].forEach(id => {
      box(id).addEventListener('click', ev => abreFicha(ev, '.hrow[data-k]', 'k'));
      box(id).addEventListener('keydown', ev => {
        if ((ev.key === 'Enter' || ev.key === ' ') && abreFicha(ev, '.hrow[data-k]', 'k')) ev.preventDefault();
      });
    });

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

  function init(conc, intel) {
    m = conc.mercado;
    concDados = conc;
    edicao = conc.edicaoRoadshow || '';
    diagLinhas = MercadoModel.diagnosticoPorAno(conc, intel);
    aliases = conc.grupos_alias || [];
    consorcios = conc.consorcios || [];
    regra = LeiloesModel.regraAporte(conc);  // limite do aporte: o mesmo do Resumo, de regulatorio.json
    if (built) return;
    built = true;
    render();
  }

  return { init };
})();
