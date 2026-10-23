// Aba Debêntures: juros e inflação de referência, curva de NTN-B, emissões, mercado secundário (negócios, com a opção de somar
// as intenções de compra e venda) e a série de debêntures incentivadas para rodovias do RoadShow. Números, períodos e fontes
// vêm do bloco window.INTEL.debentures e de conc.mercado (via DebenturesModel); aqui só a montagem.
const Debentures = (() => {
  const DM = DebenturesModel, IM = IntelModel;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nf1 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
  const nf2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const nf0 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
  const C = Charts.C;
  const WRAP = new Set(['emissor', 'grupo', 'coordenadores', 'rating', 'taxa_ipca', 'tipo', 'subsetor']);
  const NOME_INDEXADOR = { 'IPCA+': 'IPCA+', 'DI+': 'CDI+', 'PRÉ': 'prefixados' };

  let bloco = null, conc = null, built = false;
  const st = {
    somado: false,
    emissoes: { key: 'emissor', dir: 'asc', subsetor: '' },
    emissores: { key: 'volume', dir: 'desc' },
    ultimo: { key: 'quando', dir: 'desc' },
  };
  const box = id => document.getElementById('chart-d-' + id);
  const width = el => Math.max(320, (el && el.clientWidth) || 640);

  // Cartão: título, subtítulo (subHtml já escapado), legenda, conteúdo e fonte. `afetado`: cartão que muda com "ver somado";
  // ele ganha, no subtítulo, o rótulo do que está sendo mostrado (negócios fechados ou negócios + intenções).
  function card(id, title, subHtml, o = {}) {
    const rotulo = o.afetado ? ` <span class="deb-rotulo">${esc(DM.series(bloco, { somado: st.somado }).rotulo)}</span>` : '';
    return `<article class="ccard${o.wide ? ' ccard--wide' : ''}${o.afetado ? ' ccard--afetado' : ''}" id="card-d-${id}"${o.afetado ? ' data-afetado="1"' : ''}>
      <h3 id="titulo-d-${id}">${esc(title)}</h3>${subHtml || rotulo ? `<p class="sub">${subHtml || ''}${o.afetado ? `${subHtml ? ' · ' : ''}Mostrando:${rotulo}` : ''}</p>` : ''}
      ${o.legend || ''}<div class="chart-box" id="chart-d-${id}">${o.html || ''}</div>${o.foot || ''}
      ${o.note ? `<p class="src">${o.note}</p>` : ''}<p class="src">Fonte: ${esc(o.fonte || DM.DASH)}</p></article>`;
  }
  const fonte = re => IM.fonteTipo(bloco, re);
  const fontes = (...res) => [...new Set(res.map(fonte))].join('; ');
  const per = () => DM.periodoTexto(bloco.secundario && bloco.secundario.periodo);
  const tile = (id, valor, rotuloHtml, nota = '') => `<div class="kpi-tile" id="${id}"><b>${esc(valor)}</b><span>${rotuloHtml}</span>${nota ? `<small class="kpi-nota">${esc(nota)}</small>` : ''}</div>`;
  const legenda = (nome, cor) => Charts.legendHtml([[nome, cor]]);
  const legendaCV = Charts.legendHtml([['Intenções de compra', C.deep], ['Intenções de venda', C.bright]]);

  // ---------- cartões fixos ----------
  function macroCard() {
    const m = DM.macro(bloco);
    if (!m.length) return '';
    // o rótulo de cada indicador leva ao termo do glossário (um link por termo)
    const link = x => ({
      selic: Glossario.link('selic', x.rotulo), cdi: Glossario.link('cdi', x.rotulo),
      ipca12m: `${Glossario.link('ipca', 'IPCA')} em 12 meses`, focus_ipca: `Expectativa de IPCA (${Glossario.link('focus', 'Boletim Focus')})`,
    }[x.id] || esc(x.rotulo));
    return card('macro', 'Juros e inflação de referência', 'Últimos valores publicados pelo Banco Central do Brasil; cada número traz a data a que se refere', { wide: true,
      html: `<div class="kpis">${m.map(x => tile('deb-macro-' + x.id, x.valor, `${link(x)} · ${esc(x.data)}`, x.explica)).join('')}</div>`,
      fonte: fontes(/Sistema Gerenciador/, /Focus/) });
  }

  function ntnbCard() {
    const pts = DM.curvaNtnb(bloco);
    if (!pts.length) return '';
    const dataCurva = DM.fmtData(DM.curvaAte(bloco));
    return card('ntnb', `Taxa das NTN-B por vencimento, em ${dataCurva}`, '', { wide: true,
      legend: legenda('Taxa de compra (% ao ano)', C.deep),
      html: '<div id="chart-d-ntnb-linha"></div><div class="table-wrap table-wrap--static" id="deb-ntnb-tabela"></div>',
      note: `A ${Glossario.link('ntn-b', 'NTN-B')} é o título público federal que paga inflação (IPCA) mais uma taxa fixa, vendido a pessoas físicas pelo Tesouro Direto. Sua curva é a referência de juro real sem risco: o spread das debêntures IPCA+ é a taxa delas menos a da NTN-B de mesmo vencimento.`,
      fonte: fonte(/Tesouro Nacional/) });
  }

  function emissoesCard() {
    const t = DM.tabelaEmissoes(bloco);
    if (!t.linhas.length) return '';
    return card('emissoes', 'Emissões de debêntures de rodovias e infraestrutura de transporte',
      `Um papel (série de debênture) por linha, de emissores de rodovias, ferrovias, portos e terminais, aeroportos, hidrovias e metrô que aparecem nas telas das corretoras. Taxa na emissão conforme o ${Glossario.link('indexador', 'indexador')}; “incentivada” = benefício da Lei 12.431 (${Glossario.link('debenture-infraestrutura', 'debênture de infraestrutura')} é a de 2024); “${DM.DASH}” quando a fonte não traz o campo. Clique no cabeçalho para ordenar`, {
        wide: true,
        note: `Nota de crédito (${Glossario.link('rating', 'rating')}) como informada na tela da corretora; data de emissão e coordenadores não constam das telas.`,
        legend: `<div class="toolbar"><label class="sub" for="deb-em-sub">Subsetor</label><select id="deb-em-sub"><option value="">Todos</option>${
          t.subsetores.map(s => `<option>${esc(s)}</option>`).join('')}</select><span class="page__src" id="deb-em-n"></span></div>`,
        html: '<div id="deb-em-tabela"></div>', fonte: fontes(/BTG/, /XP/) });
  }

  // ---------- tabelas ordenáveis ----------
  function tabela(id, csv, t, estado) {
    const arrow = k => (k === estado.key ? (estado.dir === 'asc' ? ' ↑' : ' ↓') : '');
    const linhas = ConcModel.sortRows(t.linhas, estado.key, estado.dir);
    return `<div class="table-wrap" style="max-height:480px"><table class="grid grid--static" id="${id}" data-csv-name="${csv}"><thead><tr>${t.colunas.map(c =>
      `<th class="${c.num ? 'num' : ''}"${c.k === estado.key ? ` aria-sort="${estado.dir === 'asc' ? 'ascending' : 'descending'}"` : ''}><button type="button" data-sort="${c.k}">${esc(c.rotulo)}${arrow(c.k)}</button></th>`).join('')
    }</tr></thead><tbody>${linhas.map(l => `<tr class="is-static">${t.colunas.map(c =>
      `<td class="${c.num ? 'num' : ''}${WRAP.has(c.k) ? ' wrap' : ''}">${esc(c.fmt(l))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }

  // Liga o clique no cabeçalho de uma tabela dentro de `el`: ordena por aquela coluna (a mesma duas vezes inverte) e redesenha.
  function ordenavel(el, estado, redesenha, textoPrimeiro) {
    el.addEventListener('click', ev => {
      const b = ev.target.closest('[data-sort]');
      if (!b) return;
      const k = b.dataset.sort;
      if (estado.key === k) estado.dir = estado.dir === 'asc' ? 'desc' : 'asc';
      else { estado.key = k; estado.dir = textoPrimeiro.has(k) ? 'asc' : 'desc'; }
      redesenha();
      const novo = el.querySelector(`[data-sort="${k}"]`);
      if (novo) novo.focus();
    });
  }
  const TEXTO_EMISSOES = new Set(['ticker', 'emissor', 'subsetor', 'grupo', 'indexador', 'coordenadores', 'incentivada', 'rating']);
  const TEXTO_EMISSORES = new Set(['emissor', 'subsetor']);
  const TEXTO_ULTIMO = new Set(['ticker', 'emissor', 'subsetor', 'indexador', 'tipo']);

  function desenhaEmissoes() {
    const t = DM.tabelaEmissoes(bloco);
    const todas = t.linhas, mostra = Object.assign({}, t, { linhas: todas.filter(l => !st.emissoes.subsetor || l.subsetor === st.emissoes.subsetor) });
    document.getElementById('deb-em-tabela').innerHTML = tabela('deb-emissoes', 'debentures-emissoes', mostra, st.emissoes);
    document.getElementById('deb-em-n').textContent = `${nf0.format(mostra.linhas.length)} de ${nf0.format(todas.length)} papéis`;
  }

  // ---------- mercado secundário ----------
  function mercadoHtml() {
    const sec = bloco.secundario;
    if (!sec) return '';
    const p = per();
    const lead = `<p class="page__lead">O ${Glossario.link('mercado-secundario', 'mercado secundário')} é onde investidores negociam entre si debêntures já emitidas. Os dados vêm de telas e planilhas de corretoras (XP e BTG)${p ? `, de ${esc(p)}` : ''}; aqui aparecem só os totais por dia, emissor e subsetor e o último negócio de cada papel. Um ${Glossario.link('negocio-intencao', 'negócio')} é uma operação fechada; uma intenção é um pedido de compra ou de venda, que pode não ter virado negócio. Taxas são ${Glossario.link('taxa-media-ponderada', 'médias ponderadas pelo volume')}, calculadas separadamente por indexador (IPCA+, CDI+ e prefixado não se misturam).</p>
      <p class="page__lead deb-spread" id="deb-spread">Como o spread é calculado: ${Glossario.link('spread', 'spread')} = taxa do papel − taxa da NTN-B interpolada pelo vencimento (não pela ${Glossario.link('duration', 'duration')}), Tesouro Direto, taxa de compra; só para papéis ${Glossario.link('ipca-mais', 'IPCA+')}; “${DM.DASH}” quando não há curva no dia.${DM.notaCurva(bloco) ? ` ${esc(DM.notaCurva(bloco))}` : ''}</p>`;
    const controle = `<div class="deb-controle" id="deb-controle">
      <button type="button" role="switch" id="deb-somado" class="switch" aria-checked="false" aria-describedby="deb-somado-desc"><span class="switch__trilho" aria-hidden="true"><span class="switch__bola"></span></span><span class="switch__texto">Ver somado</span></button>
      <p class="deb-controle__desc" id="deb-somado-desc">Desligado, os cartões abaixo mostram só os negócios fechados e as intenções ficam à parte, no último cartão. Ligado, as intenções de compra e venda entram nos números e gráficos como se fossem negócios.</p>
      <p class="deb-controle__estado" id="deb-status" aria-live="polite"></p></div>`;
    const cards = [
      card('kpis', 'Mercado secundário em números', `Totais de ${esc(p)} para debêntures de rodovias e infraestrutura de transporte`, { wide: true, afetado: true, html: '', fonte: fontes(/BTG/, /XP/, /Tesouro Nacional/) }),
      card('dia-vol', 'Volume negociado por dia', 'Soma do valor financeiro das operações de cada dia, em R$ milhões', { afetado: true,
        legend: legenda('Volume do dia (R$ milhões)', C.deep), fonte: fontes(/BTG/, /XP/) }),
      card('dia-n', 'Número de operações por dia', 'Quantas operações foram registradas em cada dia', { afetado: true,
        legend: legenda('Operações do dia', C.deep), fonte: fontes(/BTG/, /XP/) }),
      card('subsetor', 'Taxa média e spread por subsetor', 'Média de cada subsetor (rodovias, ferrovias, portos e terminais, aeroportos, hidrovias, metrô), só dos papéis IPCA+, ponderada pelo volume', { wide: true, afetado: true,
        html: `<div class="duo"><div><h4 class="duo__title">Taxa média (% ao ano, IPCA + taxa)</h4>${legenda('Taxa média IPCA+', C.deep)}<div id="chart-d-subsetor-taxa"></div></div>
          <div><h4 class="duo__title">Spread médio sobre a NTN-B (pontos percentuais)</h4>${legenda('Spread médio IPCA+', C.bright)}<div id="chart-d-subsetor-spread"></div></div></div>`,
        fonte: fontes(/BTG/, /XP/, /Tesouro Nacional/) }),
      card('emissor', 'Taxa média e spread por emissor', 'Uma linha por empresa emissora; taxa média por indexador e spread médio dos papéis IPCA+. Clique no cabeçalho para ordenar', { wide: true, afetado: true,
        html: '<div id="deb-emissor-tabela"></div>', fonte: fontes(/BTG/, /XP/, /Tesouro Nacional/) }),
      card('ultimo', 'Último negócio de cada papel', 'Data, hora e taxa do registro mais recente de cada papel no período; o spread só existe para papéis IPCA+ em dias com curva da NTN-B', { wide: true, afetado: true,
        html: '<div id="deb-ultimo-tabela"></div>', fonte: fontes(/BTG/, /XP/, /Tesouro Nacional/) }),
      card('intencoes', 'Intenções de compra e venda, à parte dos negócios', `Pedidos de compra e de venda registrados na tela da corretora XP em ${esc(p)}; não são negócios fechados. Com “ver somado” ligado eles também entram nos cartões acima`, { wide: true,
        html: `<div class="duo"><div><h4 class="duo__title">Por direção</h4><div id="chart-d-int-dir"></div></div>
          <div><h4 class="duo__title">Volume por dia (R$ milhões)</h4>${legendaCV}<div id="chart-d-int-dia"></div></div></div>
          <h4 class="duo__title">Os 15 emissores com mais intenções (R$ milhões)</h4>${legendaCV}<div id="chart-d-int-emissor"></div>`,
        fonte: fonte(/XP/) }),
    ].join('');
    return `<h2 class="resumo-h2" id="deb-h-secundario">Mercado secundário</h2>${lead}${controle}<div class="grid-cards">${cards}</div>`;
  }

  function kpisHtml(k) {
    const op = k.somado ? 'negócios + intenções' : 'negócios';
    const tiles = [
      tile('deb-k-volume', DM.fmtVolume(k.volume), `volume financeiro de ${op}`),
      tile('deb-k-n', DM.fmtInt(k.n), `número de ${op}`),
      tile('deb-k-papeis', DM.fmtInt(k.papeis), 'papéis com operação no período'),
      tile('deb-k-emissores', DM.fmtInt(k.emissores), 'emissores com operação no período'),
      tile('deb-k-taxa', DM.taxaIpca({ taxa_media: k.taxa }) == null ? DM.DASH : DM.taxaTexto('IPCA+', k.taxaIpca), 'taxa média dos papéis IPCA+, ponderada pelo volume'),
      tile('deb-k-spread', DM.fmtPp(k.spread), 'spread médio dos papéis IPCA+ (só dias com curva da NTN-B)'),
      ...Object.keys(k.taxa).filter(ix => ix !== 'IPCA+').sort().map(ix =>
        tile('deb-k-taxa-' + ix.replace(/\W/g, ''), DM.taxaTexto(ix, k.taxa[ix]), `taxa média dos papéis ${NOME_INDEXADOR[ix] || ix}`)),
    ];
    return `<div class="kpis">${tiles.join('')}</div>`;
  }

  const fmtMi = v => nf2.format(v);
  function desenhaMercado() {
    const s = DM.series(bloco, { somado: st.somado }), k = DM.kpis(bloco, { somado: st.somado });
    const op = st.somado ? 'negócios + intenções' : 'negócios';
    // tudo o que depende da opção muda junto: rótulo de cada cartão, título do número de operações, números e gráficos
    document.querySelectorAll('#page-debentures .deb-rotulo').forEach(e => { e.textContent = s.rotulo; });
    const sw = document.getElementById('deb-somado');
    sw.setAttribute('aria-checked', String(st.somado));
    document.getElementById('deb-status').innerHTML = `Mostrando: <b>${esc(s.rotulo)}</b>`;
    document.getElementById('titulo-d-dia-n').textContent = `Número de ${st.somado ? 'negócios + intenções' : 'negócios'} por dia`;
    box('kpis').innerHTML = kpisHtml(k);
    Charts.bars(box('dia-vol'), s.porDia.map(d => ({ label: DM.fmtDiaMes(d.data), value: d.volume / 1e6 })),
      { unit: 'R$ mi', format: fmtMi, title: `Volume por dia, ${s.rotulo}` });
    Charts.bars(box('dia-n'), s.porDia.map(d => ({ label: DM.fmtDiaMes(d.data), value: d.n })),
      { unit: op, format: v => nf0.format(v), title: `Número de ${op} por dia` });
    const sub = campo => s.porSubsetor.map(l => ({ label: l.subsetor, value: campo(l), detail: `${DM.fmtVolume(l.volume)} em ${nf0.format(l.n)} ${op}` }));
    const taxa = document.getElementById('chart-d-subsetor-taxa'), spread = document.getElementById('chart-d-subsetor-spread');
    taxa.innerHTML = Charts.hbarsSvg(sub(DM.taxaIpca), { width: width(taxa), labelWidth: 150, format: v => `${nf2.format(v)}%`, title: 'Taxa média IPCA+ por subsetor' });
    spread.innerHTML = Charts.hbarsSvg(s.porSubsetor.map(l => ({ label: l.subsetor, value: l.spread_medio, alt: true, detail: `${DM.fmtVolume(l.volume_spread)} com spread` })),
      { width: width(spread), labelWidth: 150, format: v => `${nf2.format(v)} p.p.`, title: 'Spread médio por subsetor' });
    document.getElementById('deb-emissor-tabela').innerHTML = tabela('deb-emissores', 'debentures-por-emissor', DM.tabelaEmissores(s), st.emissores);
    document.getElementById('deb-ultimo-tabela').innerHTML = tabela('deb-ultimo', 'debentures-ultimo-por-papel', DM.tabelaUltimo(s), st.ultimo);
  }

  function desenhaIntencoes() {
    const i = DM.intencoes(bloco);
    const dir = document.getElementById('chart-d-int-dir');
    dir.innerHTML = `<table class="grid grid--static" id="deb-int-direcao" data-csv-name="debentures-intencoes-por-direcao"><thead><tr><th>Direção</th><th class="num">Volume</th><th class="num">Intenções</th><th>Taxa média</th><th class="num">Spread médio (IPCA+)</th></tr></thead><tbody>${
      i.porDirecao.map(d => `<tr class="is-static"><td>${d.direcao === 'compra' ? 'Compra' : 'Venda'}</td><td class="num">${esc(DM.fmtVolume(d.volume))}</td><td class="num">${esc(DM.fmtInt(d.n))}</td>
        <td class="wrap">${esc(DM.taxaMediaTexto(d.taxa_media))}</td><td class="num">${esc(DM.fmtPp(d.spread_medio))}</td></tr>`).join('')}</tbody></table>`;
    const dia = document.getElementById('chart-d-int-dia');
    dia.innerHTML = Charts.stackedSvg(i.porDia.map(d => ({ label: DM.fmtDiaMes(d.data), parts: [d.compra.volume / 1e6, d.venda.volume / 1e6] })),
      { width: width(dia), names: ['Compra', 'Venda'], unit: 'R$ mi', format: fmtMi, title: 'Intenções de compra e venda por dia' });
    const em = document.getElementById('chart-d-int-emissor');
    em.innerHTML = Charts.hstackSvg(i.porEmissor.slice(0, 15).map(e => ({ label: e.emissor, parts: [e.compra.volume / 1e6, e.venda.volume / 1e6], detail: `${nf0.format(e.n)} intenções` })),
      { width: width(em), labelWidth: Math.min(280, width(em) * 0.4), names: ['Compra', 'Venda'], unit: 'R$ mi', format: fmtMi, title: 'Intenções por emissor' });
  }

  // ---------- série do RoadShow ----------
  function roadshowCard() {
    const d = DM.serieIncentivadas(conc && conc.mercado);
    if (!d) return '';
    const m = conc.mercado, anos = d.serie.map(x => x.ano);
    const per = anos.length ? `${Math.min(...anos)}–${Math.max(...anos)}` : '';
    const nota = m.notas && m.notas.debentures ? `Nota: ${esc(m.notas.debentures)}` : '';
    return card('incentivadas', 'Debêntures incentivadas para rodovias: emissões por ano',
      `Valor emitido por ano em debêntures incentivadas para financiar rodovias${per ? `, ${per}` : ''}, em R$ bilhões ${esc(d.precos || '')}. Apresentação do Ministério dos Transportes a investidores${conc.edicaoRoadshow ? ` (${esc(conc.edicaoRoadshow)})` : ''}`, {
        legend: legenda('Emissões no ano (R$ bi)', C.deep), note: nota,
        fonte: `RoadShow 2026-2027, ${MercadoModel.paginas(m.fontes && m.fontes.debentures)}` });
  }

  function desenhaIncentivadas() {
    const el = box('incentivadas'), d = DM.serieIncentivadas(conc && conc.mercado);
    if (!el || !d) return;
    Charts.bars(el, d.serie.map(x => ({ label: String(x.ano), value: x.valor })), { unit: 'R$ bi', format: v => nf1.format(v), title: 'Debêntures incentivadas para rodovias' });
  }

  function desenhaNtnb() {
    const pts = DM.curvaNtnb(bloco), el = document.getElementById('chart-d-ntnb-linha');
    if (!el) return;
    el.innerHTML = Charts.linesSvg([{ name: 'NTN-B', points: pts.map(p => ({ x: Number(p.vencimento.slice(0, 4)), y: p.taxa })) }],
      { width: width(el), unit: '% ao ano', format: v => nf2.format(v), formatX: x => String(x), title: 'Taxa das NTN-B por ano de vencimento' });
    document.getElementById('deb-ntnb-tabela').innerHTML = `<table class="grid grid--static" id="deb-ntnb" data-csv-name="debentures-curva-ntnb"><thead><tr><th>Vencimento</th><th>Título</th><th class="num">Taxa de compra (% ao ano)</th><th class="num">Data da taxa</th></tr></thead><tbody>${
      pts.map(p => `<tr class="is-static"><td>${esc(DM.fmtData(p.vencimento))}</td><td>${esc(p.titulo || DM.DASH)}</td><td class="num">${esc(nf2.format(p.taxa))}</td><td class="num">${esc(DM.fmtData(p.data))}</td></tr>`).join('')}</tbody></table>`;
  }

  // ---------- página ----------
  function render() {
    const el = document.getElementById('page-debentures');
    const temBloco = !!(bloco && (bloco.emissoes || bloco.secundario || bloco.macro));
    const rs = roadshowCard();
    const lead = `<p class="page__lead">${Glossario.link('debenture', 'Debêntures')} são títulos de dívida que empresas emitem para se financiar. Esta aba reúne as de concessionárias de rodovias e de outras infraestruturas de transporte (ferrovias, portos e terminais, aeroportos, hidrovias e metrô): o cenário de juros, as emissões, o que se negocia entre investidores e as emissões ${Glossario.link('debenture-incentivada', 'incentivadas')} para rodovias. Passe o mouse sobre os gráficos para ver os valores exatos.</p>`;
    let corpo = '';
    if (temBloco) {
      const macro = [macroCard(), ntnbCard()].join('');
      corpo += `${macro ? `<h2 class="resumo-h2" id="deb-h-juros">Cenário de juros</h2><div class="grid-cards">${macro}</div>` : ''}`;
      const em = emissoesCard();
      corpo += em ? `<h2 class="resumo-h2" id="deb-h-emissoes">Emissões</h2><div class="grid-cards">${em}</div>` : '';
      corpo += mercadoHtml();
    } else {
      corpo = '<p class="empty">Os dados de mercado das debêntures (bloco debentures) não estão neste arquivo.</p>';
    }
    corpo += rs ? `<h2 class="resumo-h2" id="deb-h-roadshow">Debêntures incentivadas para rodovias (RoadShow)</h2><div class="grid-cards">${rs}</div>` : '';
    el.innerHTML = `<div class="page__inner"><h1 class="page__title">Debêntures de rodovias e infraestrutura de transporte</h1>${lead}${corpo}</div>`;
    if (!temBloco) { desenhaIncentivadas(); return; }

    desenhaNtnb();
    if (document.getElementById('deb-em-tabela')) {
      desenhaEmissoes();
      ordenavel(document.getElementById('deb-em-tabela'), st.emissoes, desenhaEmissoes, TEXTO_EMISSOES);
      document.getElementById('deb-em-sub').addEventListener('change', ev => { st.emissoes.subsetor = ev.target.value; desenhaEmissoes(); });
    }
    if (document.getElementById('deb-somado')) {
      desenhaMercado();
      desenhaIntencoes();
      ordenavel(document.getElementById('deb-emissor-tabela'), st.emissores, () => { document.getElementById('deb-emissor-tabela').innerHTML = tabela('deb-emissores', 'debentures-por-emissor', DM.tabelaEmissores(DM.series(bloco, { somado: st.somado })), st.emissores); }, TEXTO_EMISSORES);
      ordenavel(document.getElementById('deb-ultimo-tabela'), st.ultimo, () => { document.getElementById('deb-ultimo-tabela').innerHTML = tabela('deb-ultimo', 'debentures-ultimo-por-papel', DM.tabelaUltimo(DM.series(bloco, { somado: st.somado })), st.ultimo); }, TEXTO_ULTIMO);
      document.getElementById('deb-somado').addEventListener('click', () => { st.somado = !st.somado; desenhaMercado(); });
    }
    desenhaIncentivadas();
  }

  function init(concData, intelData) {
    if (built) return;
    built = true;
    conc = concData;
    bloco = (intelData && intelData.debentures) || null;
    render();
  }

  return { init };
})();
