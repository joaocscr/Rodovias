// Aba Fontes: exatamente as fontes embutidas neste arquivo (FontesModel.listar): fontes de dados por bloco, bases do painel,
// documentos dos leilões e dos consórcios (com a cobertura por tipo de fonte), fontes das definições do glossário e as
// fontes procuradas que não deram dado. Nada digitado aqui: bloco novo com fonte aparece sozinho.
const Fontes = (() => {
  const IM = IntelModel;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const TIPO = { medido: 'Medido', modelado: 'Modelado', cadastro: 'Cadastro' };
  let built = false;

  const txt = v => (v == null || v === '' ? '—' : esc(v));
  const link = (url, nome) => (/^https?:/i.test(url || '') ? `<a class="link-btn" href="${esc(url)}" target="_blank" rel="noopener">${esc(nome || url)}</a>` : txt(nome));

  // marca(r): atributos data-* da linha (bloco ou documento de origem), para conferir a lista contra os blocos embutidos
  function tabela(id, rows, cols, marca = null) {
    const attrs = r => (marca ? Object.entries(marca(r)).map(([k, v]) => ` data-${k}="${esc(v)}"`).join('') : '');
    return `<div class="table-wrap table-wrap--static"><table class="grid grid--static fontes-table" id="${id}" data-csv-name="${id.replace(/-table$/, '')}">
      <thead><tr>${cols.map(c => `<th>${esc(c[0])}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(r => `<tr${attrs(r)}>${cols.map(c => `<td${c[2] ? ` class="${c[2]}"` : ''}>${c[1](r)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }

  // Documentos dos leilões federais e da composição dos consórcios, com a cobertura dos campos de leilão por tipo de fonte.
  function verificacao(conc, docs) {
    if (!docs.length) return '';
    const v = (conc && conc.verificacao) || {};
    const c = v.cobertura || {};
    const n = k => IM.fmtInt(c[k] || 0);
    const rs = f => f.tipo === 'roadshow';
    const cobertura = v.cobertura ? ` ${n('leiloes')} leilões conferidos${c.so_edital ? ` e ${n('so_edital')} ${c.so_edital === 1 ? 'entrada' : 'entradas'} só com a data do edital` : ''}; campos por origem: ${n('oficial')} oficial, ${n('roadshow')} RoadShow, ${n('imprensa')} imprensa — não oficial e ${n('nao_localizado')} não localizado em fonte oficial${c.nao_se_aplica ? `; ${n('nao_se_aplica')} não se aplica (deságio de leilão por outorga)` : ''}.` : '';
    const consorcios = ((conc && conc.consorcios) || []).length ? ' A composição dos consórcios (aba Mercado) usa documentos desta mesma lista.' : '';
    return `<h2 class="fontes-h2" id="fontes-verificacao">Documentos dos leilões de concessões rodoviárias federais e dos consórcios <span class="page__src">(${IM.fmtInt(docs.length)} ${docs.length === 1 ? 'documento' : 'documentos'})</span></h2>
      <p class="page__src" id="fontes-verif-cobertura">Nos campos de leilão (data, vencedor, deságio, tarifas, prazo, assinatura e início da operação), o valor exibido vem de documento de órgão público quando existe; senão, do RoadShow; por último, de imprensa, marcada como não oficial.${cobertura}${consorcios}</p>
      ${tabela('fontes-verificacao-table', docs, [
        ['Tipo', r => Selo.badge({ tipo: r.tipo, fontes: [] })], ['Órgão/veículo', r => txt(r.orgao || (rs(r) ? 'Ministério dos Transportes' : null)), 'wrap'],
        ['Título', r => txt(r.titulo || (rs(r) ? Selo.fonteTexto(r) : null)), 'wrap fontes-nome'], ['Data', r => txt(r.data ? ConcModel.fmtData(r.data) : null)],
        ['Link', r => (r.url ? link(r.url, 'abrir') : '—')], ['Acesso', r => txt(r.acesso ? ConcModel.fmtData(r.acesso) : null)],
      ], r => ({ doc: r.id }))}`;
  }

  // "(2023)" com o ano do bloco; sem o bloco, nada
  const anoDe = v => (v && Number.isFinite(v) ? ` (${v})` : '');

  // Fontes citadas nas definições do glossário, com os termos que as usam (cada termo leva à aba Glossário).
  function glossarioHtml(g) {
    if (!g.length) return '';
    return `<h2 class="fontes-h2" id="fontes-glossario">Definições do glossário <span class="page__src">(${IM.fmtInt(g.length)} ${g.length === 1 ? 'fonte' : 'fontes'})</span></h2>
      <p class="page__src">Leis, normas e páginas institucionais citadas nas definições da aba Glossário.</p>
      ${tabela('fontes-glossario-table', g, [['Fonte', r => link(r.url, r.nome), 'wrap fontes-nome'],
        ['Termos', r => r.termos.map(t => Glossario.link(t.id, t.termo)).join(', '), 'wrap']])}`;
  }

  function render(intel, conc, glossario, descricoes) {
    const el = document.getElementById('page-fontes');
    const d = FontesModel.listar(intel, conc, glossario, descricoes);
    const vm = (intel && intel.trafego && intel.trafego.vmda) || null, v25 = (intel && intel.vmda2025) || null, cg = (intel && intel.carga) || null;
    const head = `<h1 class="page__title">Fontes dos dados</h1>
      <p class="page__lead">Todas as fontes usadas neste painel, listadas a partir dos dados embutidos neste arquivo, com o período coberto, a data em que cada uma foi baixada e a licença. Nada é consultado na internet ao abrir o arquivo.</p>
      <div class="fontes-nota"><h2 class="fontes-h2">Medido × modelado</h2>
        <p><b>Medido</b> é contagem ou registro do mundo real: veículos que passaram nas praças de pedágio e nos equipamentos SAT da ANTT, acidentes registrados pela PRF, produção declarada ao IBGE, exportações despachadas na Receita, toneladas transportadas nas ferrovias. <b>Modelado</b> é estimativa de um modelo de transporte: o VMDa da Infra S.A.${anoDe(vm && vm.ano)} e o do DNIT${anoDe(v25 && v25.ano)}, volume diário em trechos sem contagem, e a carga agrícola do PNL 2035 (alocação de fluxos na rede${cg && Number.isFinite(cg.ano_base) ? `, ano-base ${cg.ano_base}` : ''}). Os dois servem para comparar trechos, mas só o medido é observação; os cartões e as legendas sempre dizem qual é qual.</p>
        <p><b>Cadastro</b> é registro de infraestrutura ou de contratos, sem número medido nem modelado: a malha municipal do IBGE, a malha e as fichas das concessões estaduais, as páginas das concessões na ANTT, as ferrovias da BaseFerro, as instalações portuárias da ANTAQ e o traçado esquemático das Rotas de Integração Sul-Americana (MPO).</p>
        <p><b>Acesso</b> é a data em que o arquivo foi baixado da fonte para montar este painel (dd/mm/aaaa). O dado pode ter sido atualizado na origem depois disso.</p></div>`;
    const fontes = d.dados.length ? `<h2 class="fontes-h2" id="fontes-lista">Fontes de dados <span class="page__src">(${IM.fmtInt(d.dados.length)})</span></h2>
      ${tabela('fontes-table', d.dados, [
        ['Informação', r => txt(r.rotulo)], ['Fonte', r => link(r.url, r.nome), 'wrap fontes-nome'], ['Período', r => esc(IM.fmtPeriodo(r.periodo)), 'wrap'],
        ['Acesso', r => esc(IM.fmtDia(r.acesso))], ['Licença', r => txt(r.licenca), 'wrap'], ['Tipo', r => txt(TIPO[r.tipo] || null)], ['Nota', r => txt(r.nota), 'wrap fontes-nota-col'],
      ], r => ({ bloco: r.bloco }))}
      <p class="page__src fontes-legenda" id="fontes-legenda">Tipo: <b>Medido</b>, contagem ou registro observado; <b>Modelado</b>, estimativa de modelo; <b>Cadastro</b>, registro de infraestrutura ou de contratos, sem número medido nem modelado; "—": fonte de apoio (carteira ou notícia), sem número próprio.</p>`
      : '<p class="empty">A lista de fontes dos dados (bloco fontes) não está neste arquivo.</p>';
    const base = d.base.length ? `<h2 class="fontes-h2" id="fontes-base">Bases do painel</h2>
      <p class="page__src">A malha rodoviária federal (${Glossario.link('snv')}) e a carteira de concessões do Ministério dos Transportes (${Glossario.link('roadshow')}), sobre as quais o mapa e as fichas são montados.</p>
      ${tabela('fontes-base-table', d.base, [['Fonte', r => link(r.url, r.nome), 'wrap fontes-nome'], ['Período', r => esc(IM.fmtPeriodo(r.periodo)), 'wrap'],
        ['Acesso', r => esc(IM.fmtDia(r.acesso))], ['Licença', r => txt(r.licenca), 'wrap'], ['Nota', r => txt(r.nota), 'wrap fontes-nota-col']], r => ({ bloco: r.bloco }))}` : '';
    const indisp = d.indisponiveis.length ? `<h2 class="fontes-h2" id="fontes-indisp">Fontes procuradas e não obtidas</h2>
      <p class="page__src">Fontes que não responderam ou não têm arquivo aberto quando os dados foram baixados; o que foi usado no lugar está no motivo.</p>
      ${tabela('fontes-indisp-table', d.indisponiveis, [['Fonte', r => link(r.url, r.nome), 'wrap fontes-nome'], ['Motivo', r => txt(r.motivo), 'wrap fontes-nota-col']])}` : '';
    el.innerHTML = `<div class="page__inner">${head}${fontes}${base}${verificacao(conc, d.documentos)}${glossarioHtml(d.glossario)}${indisp}</div>`;
  }

  function init(intel, conc = null, glossario = null, descricoes = null) {
    if (built) return;
    built = true;
    render(intel || null, conc, glossario, descricoes);
  }

  return { init };
})();
