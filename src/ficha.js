// Ficha do projeto/contrato: todos os campos do RoadShow, avisos de divergência, capex anual e cronograma.
// v3: blocos ANTT (capa, séries realizadas, praças, obras) e pipeline na ficha federal; ficha de concessão estadual.
const Ficha = (() => {
  const fmt1 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const fmt2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtInt = new Intl.NumberFormat('pt-BR');
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const F = {
    km: v => Model.fmtKm(v), bi: v => ConcModel.fmtBi(v), pct: v => ConcModel.fmtPct(v), data: v => ConcModel.fmtData(v),
    mi: v => `R$ ${fmt2.format(v)} mi`, mikm: v => `R$ ${fmt2.format(v)} mi/km`, int: v => fmtInt.format(v),
    tkm: v => `R$ ${new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(v)}/km`,
    txt: v => String(v), kmv: v => `${fmt1.format(v)} km`, anos: v => `${fmtInt.format(v)} anos`,
  };
  const fmtNum = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
  const ICON_CLOSE = '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
  const ICON_WARN = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M12 4l9 16H3z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M12 10v4M12 17v.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';

  const IM = IntelModel;
  let conc, intel = null, snv = null, current = null, popover = null;

  const $ = s => document.querySelector(s);
  const isNum = v => typeof v === 'number' && isFinite(v);
  const has = v => v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && !v.length);

  function estadoLabel(k) { return (conc.estados.find(s => s.key === k) || {}).label || k; }

  function flag(e, campo) {
    const d = (e.divergencias || []).find(x => x.campo === campo);
    if (!d) return '';
    const i = e.divergencias.indexOf(d);
    return `<button type="button" class="div-flag" data-div="${i}" aria-label="Divergência entre fontes" title="Divergência entre fontes">${ICON_WARN}</button>`;
  }

  // Linha da ficha: [rótulo, valor, formato, campo (selo de origem e divergência), html extra]
  // v4: campo verificado (`e.verif[campo]`) aparece mesmo sem valor ("—", não localizado em fonte oficial).
  function rows(e, list) {
    const verif = e.verif || {};
    return list.filter(([, v, , campo]) => has(v) || (campo && verif[campo])).map(([label, v, f, campo, extra]) =>
      `<dt>${esc(label)}</dt><dd>${has(v) ? esc((F[f] || F.txt)(v)) : '—'}${campo ? Selo.badge(verif[campo]) + flag(e, campo) : ''}${extra || ''}</dd>`).join('');
  }

  // v4: notas da verificação dos leilões e proponentes inabilitados, cada um com as fontes (selo do tipo + link).
  function notasVerif(e) {
    const fontes = fs => (fs && fs.length ? `<ul class="nota-fontes">${fs.map(f => `<li>${Selo.fonte(f)}</li>`).join('')}</ul>` : '');
    const inab = i => `${i.grupo}: ${[has(i.desagio) ? F.pct(i.desagio) : null, `inabilitado${i.data ? ` em ${F.data(i.data)}` : ''}`].filter(Boolean).join(', ')}`;
    const itens = (e.notas_verif || []).map(n => [n.texto, n.fontes]).concat((e.inabilitados || []).map(i => [inab(i), i.fontes]))
      .map(([t, fs]) => `<li><p class="ftext">${esc(t)}</p>${fontes(fs)}</li>`);
    return itens.length ? `<ul class="flist notas-verif">${itens.join('')}</ul>` : '';
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

  // Pista pelo SNV (ConcModel.pistaSNV): km e % de cada categoria do recorte curado; sem recorte, só o aviso.
  function pistaBlock(e, idx) {
    if (!snv) return '';
    const p = ConcModel.pistaSNV(conc, snv, idx);
    if (p.semRecorte) return '<p class="ftext" data-pista="sem">Sem recorte no SNV: a pista desta concessão não pôde ser calculada.</p>';
    const pct = v => `${fmt1.format(v * 100)}%`;
    const linhas = ConcModel.pistaPartes(p).map(c =>
      `<dt>${esc(c.label)}</dt><dd data-pista="${c.key}">${esc(F.km(c.km))} (${esc(pct(c.pct))})</dd>`).join('');
    return `<dl class="fgrid">${linhas}<dt>Total do recorte</dt><dd data-pista="km">${esc(F.km(p.km))}</dd></dl>
      <p class="ftext fpad">Pelo recorte curado; aproximado quando o recorte é aproximado${e.qualidade === 'aproximado' ? ' (é o caso desta concessão)' : ''}. ` +
      `Cada trecho físico do SNV conta uma vez, pela situação dele. "Sem pavimento ou planejada" reúne leito natural, implantada, travessia, planejada e obras de pavimentação ou implantação.</p>`;
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
    const otim = e.tipo === 'otimizacao';  // otimização: assinatura do contrato original × do termo aditivo
    const leilao = dl(rows(e, [
      ['Situação', e.status_texto, 'txt'], ['Edital', e.edital, 'data', 'edital'], ['Leilão', e.leilao, 'data', 'leilao'],
      ['Participantes', e.participantes, 'int', 'participantes'], ['Deságio', e.desagio, 'pct', 'desagio'],
      ['Vencedor', e.grupo_vencedor, 'txt', 'grupo_vencedor'], ['Tarifa-teto', e.tarifa_teto, 'txt', 'tarifa_teto'],
      ['Tarifa vencedora', e.tarifa_vencedora, 'txt', 'tarifa_vencedora'], [otim ? 'Prazo (a partir do termo aditivo)' : 'Prazo da concessão', e.prazo_anos, 'anos', 'prazo_anos'],
      [otim ? 'Assinatura do contrato original' : 'Assinatura', e.assinatura, 'data', 'assinatura'],
      [otim ? 'Assinatura do termo aditivo (otimização)' : 'Termo aditivo', e.assinatura_aditivo, 'data', 'assinatura_aditivo'],
      ['Início da operação', e.inicio_operacao, 'data', 'inicio_operacao'],
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
    // v4: um só vencedor, o verificado; o que o RoadShow imprime na linha dele fica abaixo, quando difere
    const plist = ConcModel.participantesExibidos(e, conc.grupos_alias);
    const rsTxt = v => (v != null ? ` <span class="part-rs">RoadShow: ${esc(v)}</span>` : '');
    // nome do RoadShow só quando é de outro grupo econômico; deságio diferente sempre aparece
    const rsNome = p => (p.roadshow && LeiloesModel.rsDiverge(p.grupo, p.roadshow.grupo, conc.grupos_alias) ? p.roadshow.grupo : null);
    const part = plist.length ? `<table class="grid" data-csv-name="ficha-participantes"><thead><tr><th>Proponente</th><th class="num">Deságio</th></tr></thead><tbody>${
      plist.map(p => `<tr><td>${esc(p.grupo)}${p.vencedor ? ' <b>(vencedor)</b>' : ''}${p.verificado ? ' ' + Selo.badge(e.verif.grupo_vencedor) : ''}${rsTxt(rsNome(p))}</td>
        <td class="num">${esc(F.pct(p.desagio))}${p.verificado && e.verif.desagio ? ' ' + Selo.badge(e.verif.desagio) : ''}${rsTxt(p.roadshow && p.roadshow.desagio != null ? F.pct(p.roadshow.desagio) : null)}</td></tr>`).join('')}</tbody></table>` : '';
    const rel = (e.relaciona || []).map(id => conc.entidades.find(x => x.id === id)).filter(Boolean);
    const relHtml = rel.length ? `<ul class="timeline">${rel.map(r => `<li><a href="#ficha/${esc(r.id)}">${esc(r.nome)}</a> · ${esc(estadoLabel(r.estado))}</li>`).join('')}</ul>` : '';
    const qual = { ok: 'Conferido: a extensão no mapa difere no máximo 5% (ou 10 km) da extensão informada no RoadShow', aproximado: 'Recorte aproximado', nao_mapeado: 'Trecho não mapeado no SNV', falha: 'Recorte com falha' }[e.qualidade] || '';
    const trecho = dl(rows(e, [['Recorte no mapa', qual, 'txt'], ['km no SNV', e.km_mapeado || null, 'km'], ['Nota', e.nota_trecho, 'txt']]));
    const pista = pistaBlock(e, idx);
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
        ${block('Notas da verificação', notasVerif(e), true)}
        ${block('Itens relacionados', relHtml)}
        ${block('Pista no SNV', pista)}
        ${block('Trecho no mapa', trecho)}
        ${block('Outras informações da ficha', extras, true)}
        ${anttBlocks(e.id)}
        <p class="ficha__foot">Fonte: RoadShow 2026-2027 (${esc(conc.versaoRoadshow)}), Ministério dos Transportes${pages.length ? `, p. ${pages.join(', ')}` : ''}${
  intel && (IM.anttCapa(intel, e.id) || IM.anttAnteriores(intel, e.id).length) ? '; ANTT (dados abertos e páginas das concessões)' : ''}${
  e.verif && Object.keys(e.verif).length ? '; campos de leilão conferidos na verificação dos leilões (selo de origem em cada campo)' : ''}.</p>
      </div>`;

    if (capexChart) Charts.bars($('#ficha-capex'), f.capex_anual.map(a => ({ label: `Ano ${a.ano}`, value: a.valor })),
      { unit: 'R$ mi', format: v => fmt1.format(v), title: 'CAPEX anual' });
    $('#ficha-close').addEventListener('click', () => close());
    $('#ficha-map').addEventListener('click', () => showOnMap(idx));
    $('#ficha').querySelectorAll('[data-div]').forEach(b => b.addEventListener('click', ev => {
      ev.stopPropagation();
      openPopover(b, e.divergencias[Number(b.dataset.div)], e);
    }));
  }

  // ---------- v3: blocos ANTT e pipeline na ficha federal ----------
  const link = (url, text) => (url ? `<a class="link-btn" href="${esc(url)}" target="_blank" rel="noopener">${esc(text)}</a>` : esc(text));
  // Prazo vigente (com prorrogações) em caixa baixa: "30 Anos" vira "30 anos".
  const prazoTxt = v => (has(v) ? String(v).replace(/\b(Anos?|Meses|Dias?)\b/g, m => m.toLowerCase()) : null);
  const NV_TAG = '<span class="tag-nv">não verificado</span>';
  const nfMi = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

  function anttBlocks(id) {
    if (!intel) return '';
    const capa = IM.anttCapa(intel, id), ant = IM.anttAnteriores(intel, id);
    const capaHtml = capa ? dl(rows({}, [
      ['Controladora', capa.controladora, 'txt'], ['Trecho', capa.trecho, 'txt'], ['Extensão', IM.has(capa.extensao_km) ? capa.extensao_km : null, 'km'],
      ['Assinatura', capa.assinatura, 'data'], ['Início', capa.inicio, 'data'], ['Prazo atual (com prorrogações)', prazoTxt(capa.prazo), 'txt'], ['Edital', capa.edital, 'txt'],
      ['Início da cobrança', capa.cobranca, 'data'], ['Data-base de reajuste', capa.database, 'txt'],
    ])) + (capa.url ? `<p class="ftext fpad">${link(capa.url, 'Página da concessão na ANTT')}</p>` : '') : '';
    const antHtml = ant.length ? `<ul class="flist">${ant.map(c => `<li>Contrato anterior: ${link(c.url, c.nome || c.id)} (encerrado)</li>`).join('')}</ul>` : '';
    return block('ANTT', capaHtml + antHtml) + seriesBlock(id) + pracasBlock(id) + obrasBlock(id) + pipelineBlock(id);
  }

  // Receita, investimento e custo realizados (R$ nominais), um gráfico de linhas por contrato (atual e anteriores).
  function seriesBlock(id) {
    const list = IM.anttSeries(intel, id);
    if (!list.length) return '';
    const KEYS = [['receita', 'Receita'], ['investimento', 'Investimento'], ['custo', 'Custo']];
    const charts = list.map(s => {
      const nome = s.nome || id, title = s.anterior ? `Contrato anterior: ${nome} (encerrado)` : nome;
      const val = {};
      const series = KEYS.map(([k, label]) => ({ name: label, points: s.anos.map((a, i) => {
        const v = s[k][i];
        if (IM.has(v)) val[`${label} ${a}`] = v;
        return { x: a, y: IM.has(v) ? v / 1e6 : null };
      }) }));
      const svg = Charts.linesSvg(series, { width: 880, height: 260, format: v => nfMi.format(v), title: `Receita, investimento e custo realizados · ${title}` })
        .replace(/<title>((?:Receita|Investimento|Custo) \d{4}): [^<]*<\/title>/g, (m, k) => (k in val ? `<title>${esc(k)}: ${esc(IM.fmtBRL(val[k]))}</title>` : m));
      return `<div class="fserie">${list.length > 1 || s.anterior ? `<p class="fserie__name">${esc(title)}</p>` : ''}<div class="fchart">${svg}</div></div>`;
    }).join('');
    return block('Receita, investimento e custo realizados', `<div id="ficha-antt-serie">
      ${Charts.legendHtml([['Receita', Charts.C.deep], ['Investimento', Charts.C.bright], ['Custo', Charts.C.grey]])}${charts}
      <p class="page__src">R$ nominais · ANTT. Valores anuais em R$ milhões, só os anos com dado, declarados pelas concessionárias à agência.</p></div>`, true);
  }

  function pracasBlock(id) {
    const { linhas, receita } = IM.pracasDe(intel, id);
    if (!linhas.length) return '';
    return block('Praças da concessão', `<div class="table-wrap table-wrap--static"><table class="grid grid--static" id="ficha-pracas" data-csv-name="ficha-pracas">
      <thead><tr><th>Praça</th><th class="num">VMD 2025 (veíc./dia)</th><th class="num">% pesados</th><th class="num">Receita 2025</th></tr></thead>
      <tbody>${linhas.map(p => `<tr><td>${esc(p.nome || '—')}</td><td class="num">${esc(IM.fmtInt(p.vmd))}</td><td class="num">${esc(IM.fmtPct(p.pctPes))}</td>
        <td class="num">${esc(IM.fmtBRL(p.receita))}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="3">Receita total (${fmtInt.format(linhas.length)} ${linhas.length === 1 ? 'praça' : 'praças'})</td><td class="num">${esc(IM.fmtBRL(receita))}</td></tr></tfoot>
    </table></div><p class="page__src">Contagem medida · ANTT 2025. VMD = média diária dos dois sentidos nos meses com dado; receita em R$ nominais.</p>${pracasSerieHtml(id)}`, true);
  }

  // Tráfego mensal da concessão: VMD do mês somado (leves × pesados) nas praças com todos os meses da janela
  // (mesma regra do painel da aba Tráfego, IntelModel.pracasSerie filtrado pela concessão).
  function pracasSerieHtml(id) {
    const s = IM.pracasSerie(intel, p => p.ent === id);
    if (!s || !s.total) return '';
    const per = `${IM.monthLabel(s.meses[0])} a ${IM.monthLabel(s.meses[s.meses.length - 1])}`;
    const nota = s.n
      ? `Entram ${fmtInt.format(s.n)} de ${fmtInt.format(s.total)} ${s.total === 1 ? 'praça' : 'praças'} da concessão: só as que têm os ${s.meses.length} meses completos (${per}), para a série não oscilar com praças que entram ou saem. Leves incluem motos.`
      : `Nenhuma das ${fmtInt.format(s.total)} ${s.total === 1 ? 'praça' : 'praças'} da concessão tem os ${s.meses.length} meses completos (${per}); sem série mensal somada.`;
    const lab = m => `${IM.monthLabel(m).slice(0, 3)}/${m.slice(2, 4)}`; // eixo "jan/24"; a dica traz "jan/2024"
    const svg = s.n ? Charts.stackedSvg(s.meses.map((m, k) => ({ label: lab(m), tip: IM.monthLabel(m), parts: [s.l[k], s.p[k]] })),
      { width: 880, height: 260, left: 72, names: ['Leves', 'Pesados'], unit: 'veíc./dia', format: v => IM.fmtInt(v), title: 'Tráfego mensal nas praças da concessão' }) : '';
    return `<div id="ficha-pracas-serie"><p class="fserie__name">Tráfego mensal nas praças, ${esc(per)} (VMD do mês somado)</p>
      ${svg ? `${Charts.legendHtml([['Leves', Charts.C.deep], ['Pesados', Charts.C.bright]])}<div class="fchart">${svg}</div>` : ''}
      <p class="page__src">${esc(nota)} Contagem medida · ANTT.</p></div>`;
  }

  function obrasBlock(id) {
    const o = IM.obrasResumo(intel, id, 10);
    if (!o.total) return '';
    const kmTxt = r => {
      const a = IM.has(r.km_i) ? fmt1.format(r.km_i) : null, b = IM.has(r.km_f) && r.km_f !== r.km_i ? fmt1.format(r.km_f) : null;
      return `${IM.rodLabel(r.br, r.uf)}${a ? ` km ${a}${b ? `–${b}` : ''}` : ''}`;
    };
    const counts = dl(rows({}, [['Concluídas', o.concluidas, 'int'], ['Em andamento', o.andamento, 'int'], ['Não iniciadas', o.naoIniciadas, 'int'],
      ['Sem dado de execução', o.semDado || null, 'int']]));
    const top = o.top.length ? `<p class="fserie__name">${o.top.length === 1 ? 'Obra não concluída com maior avanço previsto' : `Obras não concluídas com maior avanço previsto (${fmtInt.format(o.top.length)})`}</p>
      <div class="table-wrap table-wrap--static"><table class="grid grid--static" data-csv-name="ficha-obras"><thead><tr><th>Obra</th><th>Rodovia/km</th><th class="num">Executado</th></tr></thead>
      <tbody>${o.top.map(r => `<tr><td class="wrap">${esc(r.descricao || r.tipo || 'Obra')}</td><td>${esc(kmTxt(r))}</td><td class="num">${esc(IM.fmtPct(r.executado))}</td></tr>`).join('')}</tbody></table></div>` : '';
    return block('Obras acompanhadas pela ANTT', `<div id="ficha-obras">${counts}${top}
      <p class="page__src">${fmtInt.format(o.total)} obras · previsto × executado no ano · ANTT, acompanhamento anual de investimentos. Concluída = executado ≥ 100%.</p></div>`, true);
  }

  function pipelineBlock(id) {
    const items = IM.pipelineDe(intel, id);
    if (!items.length) return '';
    return block('Pipeline', `<div id="ficha-pipeline">${items.map(i => `${dl(rows({}, [
      ['Item', items.length > 1 ? i.nome : null, 'txt'], ['Status', IM.statusLabel(intel, i.status), 'txt'], ['Data prevista', i.data_prevista, 'data'],
    ]) + `<dt>Fonte</dt><dd>${i.fonte_url ? link(i.fonte_url, 'Abrir fonte') : '—'}${i.verificado === false ? ` ${NV_TAG}` : ''}${
      i.fonte_data ? `<span class="base">${esc(i.fonte_data)}</span>` : ''}</dd>`)}${has(i.obs) ? `<p class="ftext fpad">${esc(i.obs)}</p>` : ''}`).join('')}</div>`, true);
  }

  // ---------- v3: ficha de concessão estadual ----------
  const estEnts = () => (intel && intel.estaduais && Array.isArray(intel.estaduais.entidades) ? intel.estaduais.entidades : []);
  // Linhas da concessão estadual k: o mesmo cache de IntelModel.estConcLines usado pela camada do mapa.
  const estLines = k => ((intel && intel.estaduais ? IM.estConcLines(intel.estaduais, snv) : [])[k] || []);
  const estLabel = k => (IM.EST_ESTADOS.find(s => s.key === k) || {}).label || k;

  function renderEst(e, k) {
    const geo = estLines(k).length > 0;
    const km = v => (IM.has(v) ? Model.fmtKm(v) : '—');
    const estado = e.estado === 'encerrado' ? 'estadual_encerrado' : 'estadual_vigente';
    const capex = IM.has(e.capex_bi) ? `${IM.fmtBRL(e.capex_bi * 1e9)}${e.capex_ref ? ` (ref. ${e.capex_ref})` : ''}` : null;
    const grupo = e.grupo && e.controlador && !e.controlador.includes(e.grupo) ? `${e.grupo} · ${e.controlador}` : (e.controlador || e.grupo);
    const trechos = IM.trechosLabel(e.trechos);
    const contrato = dl(rows({}, [
      ['Poder concedente', e.poder, 'txt'], ['Regulador', e.regulador, 'txt'], ['Lote', e.lote, 'txt'], ['Grupo', grupo, 'txt'],
      ['Situação', estLabel(estado), 'txt'], ['Assinatura', e.assinatura, 'data'], ['Início', e.inicio, 'data'],
      ['Fim', e.fim ? `${F.data(e.fim)}${e.fim_estimado ? ' (estimado)' : ''}` : null, 'txt'], ['Prazo atual (com prorrogações)', prazoTxt(e.prazo), 'txt'], ['Capex', capex, 'txt'],
    ]));
    const rod = dl(rows({}, [
      ['Rodovias', (e.rodovias || []).filter(Boolean).join(', '), 'txt'],
      ['km declarado × mapeado', IM.has(e.km_decl) || IM.has(e.km_map) ? `${km(e.km_decl)} × ${km(e.km_map)}` : null, 'txt'],
    ]) + (trechos.length ? `<dt>Trechos</dt><dd>${trechos.map(t => `<span class="base base--dark">${esc(t)}</span>`).join('')}</dd>` : '')) +
      (has(e.trecho_texto) ? `<p class="ftext fpad">${esc(e.trecho_texto)}</p>` : '');
    const noGeo = 'Sem traçado no mapa: o recorte desta concessão não foi desenhado (fonte sem km por trecho ou sem geometria).';
    const mapa = dl(rows({}, [['Qualidade do recorte', e.qualidade ? IM.qualidadeRecorte(e.qualidade) : null, 'txt'], ['Nota', e.nota, 'txt']])) +
      (geo ? '' : `<p class="ftext fpad">${esc(noGeo)}</p>`);
    const fonteEst = intel.estaduais.fonte ? IM.fonteRef(intel.estaduais.fonte, /./) : null;
    $('#ficha').innerHTML = `
      <header class="ficha__head">
        <div>
          <h2 class="ficha__title" id="ficha-title">${esc(e.nome)}</h2>
          <div class="ficha__meta">
            <span class="estado-tag">${typeof layerSwatch === 'function' ? layerSwatch('estconc', 24) : ''}Concessão estadual · ${esc(e.uf || '—')}${e.regulador ? ` · ${esc(e.regulador)}` : ''}</span>
            <span>${esc(estLabel(estado))}</span>
            ${e.assinatura ? `<span>Assinatura: ${esc(F.data(e.assinatura))}</span>` : ''}
          </div>
        </div>
        <div class="ficha__actions">
          <button type="button" class="btn btn--primary" id="ficha-map" ${geo ? '' : `disabled title="Concessão sem traçado no mapa${e.qualidade === 'nao_mapeado' ? ' (não mapeada)' : ''}"`}>Ver no mapa</button>
          <button type="button" class="icon-btn" id="ficha-close" aria-label="Fechar ficha">${ICON_CLOSE}</button>
        </div>
      </header>
      <div class="ficha__body">
        ${block('Contrato', contrato)}
        ${block('Rodovias e trechos', rod)}
        ${block('Trecho no mapa', mapa)}
        ${pipelineBlock(e.id)}
        <p class="ficha__foot">Fonte: ${e.fonte_url ? link(e.fonte_url, `página da concessão (${e.regulador || e.poder || 'órgão estadual'})`) : esc(e.regulador || e.poder || '—')}${
  e.abcr_url ? ` · ${link(e.abcr_url, 'ABCR')}` : ''}${fonteEst && fonteEst !== '—' ? ` · traçado: ${esc(fonteEst)}` : ''}.</p>
      </div>`;
    $('#ficha-close').addEventListener('click', () => close());
    $('#ficha-map').addEventListener('click', () => showEstOnMap(k));
  }

  // Liga "Rodovias estaduais", realça a concessão k (com o cartão dela) e enquadra suas linhas.
  function showEstOnMap(k) {
    close(true);
    // Enquadra só depois que a aba Mapa está exibida (hashchange é assíncrono) e o Leaflet recalculou o tamanho.
    Tabs.goThen('#mapa', () => {
      MapView.invalidate();
      const box = document.querySelector('#layers-section input[data-layer="estaduais"]');
      if (box) box.checked = true;
      Layers.toggle('estaduais', true);
      Layers.open('estconc', k);
      const pts = estLines(k).flat();
      // à direita fica o cartão da concessão (~360 px): enquadra no espaço livre
      if (pts.length) MapView.map.fitBounds(L.latLngBounds(pts), { paddingTopLeft: [64, 64], paddingBottomRight: [424, 64], maxZoom: 11 });
    });
  }

  function concSwatch(key) {
    return typeof concStyleSwatch === 'function' ? concStyleSwatch(key, 24) : '';
  }

  function openPopover(btn, d, e) {
    closePopover();
    popover = document.createElement('div');
    popover.className = 'popover';
    popover.setAttribute('role', 'dialog');
    const alts = (d.alternativas || []).filter(a => has(a.valor) && !/^[-–—]?$/.test(String(a.valor).trim()));
    const origem = a => (a.pagina != null ? `p. ${a.pagina}` : a.fonte || 'RoadShow');
    popover.innerHTML = `<b>Divergência entre fontes</b>
      <p>Exibido: ${esc(valorTxt(d.campo, d.exibido))}${Selo.badge((e.verif || {})[d.campo])}</p>
      ${alts.length ? `<ul>${alts.map(a => `<li>${esc(valorTxt(d.campo, a.valor))} (${esc(origem(a))})</li>`).join('')}</ul>` : ''}
      ${d.nota ? `<p>${esc(d.nota)}</p>` : ''}`;
    document.body.appendChild(popover);
    const r = btn.getBoundingClientRect();
    popover.style.top = `${Math.min(window.innerHeight - popover.offsetHeight - 16, r.bottom + 8)}px`;
    popover.style.left = `${Math.max(16, Math.min(window.innerWidth - popover.offsetWidth - 16, r.left - 160))}px`;
  }
  // Valor de divergência no formato do campo (datas, deságio, listas de BRs/UFs, números pt-BR).
  function valorTxt(campo, v) {
    if (!has(v)) return '—';
    if (Array.isArray(v)) return v.join('/');
    if (campo === 'desagio' && isNum(v)) return F.pct(v);
    if (typeof v === 'string' && /^\d{4}-\d{2}(-\d{2})?$/.test(v)) return F.data(v);
    return isNum(v) ? fmtNum.format(v) : String(v);
  }
  function closePopover() { if (popover) { popover.remove(); popover = null; } }

  function showOnMap(idx) {
    close(true);
    const e = conc.entidades[idx];
    UI.showOnMap(e.nome, conc.entFis[idx], e.id);
  }

  function open(id) {
    const idx = conc.entidades.findIndex(x => x.id === id);
    const k = idx < 0 ? IM.estIndex(intel, id) : -1;
    if (idx < 0 && k < 0) return false;
    closePopover();
    if (idx >= 0) { current = idx; render(conc.entidades[idx], idx); } else { current = { est: k }; renderEst(estEnts()[k], k); }
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

  function init(data, intelData = null, snvData = null) {
    conc = data; intel = intelData || null; snv = snvData || null;
    $('#ficha-backdrop').addEventListener('click', () => close());
    document.addEventListener('click', ev => { if (popover && !popover.contains(ev.target)) closePopover(); });
    document.addEventListener('keydown', ev => {
      if (ev.key !== 'Escape' || current === null) return;
      ev.stopImmediatePropagation();
      if (popover) closePopover(); else close();
    }, true);
  }

  return {
    init, open, close, isOpen: () => current !== null,
    exists: id => conc.entidades.some(x => x.id === id) || IM.estIndex(intel, id) >= 0,
    showEstOnMap, estHasMap: k => estLines(k).length > 0,
  };
})();
