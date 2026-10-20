// Aba Fontes: de onde vem cada número (INTEL.fontes), as bases congeladas da v1/v2 e o que não foi possível obter neste ambiente.
const Fontes = (() => {
  const IM = IntelModel;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const BLOCO = { trafego: 'Tráfego', antt: 'ANTT', carga: 'Carga (PNL)', agro: 'Agro', municipios: 'Municípios', multimodal: 'Multimodal',
    pipeline: 'Pipeline', estaduais: 'Estaduais' };
  const TIPO = { medido: 'Medido', modelado: 'Modelado' };
  let built = false;

  const txt = v => (v == null || v === '' ? '—' : esc(v));
  const link = (url, nome) => (url ? `<a class="link-btn" href="${esc(url)}" target="_blank" rel="noopener">${esc(nome || url)}</a>` : txt(nome));

  function tabela(id, rows, cols) {
    return `<div class="table-wrap table-wrap--static"><table class="grid grid--static fontes-table" id="${id}">
      <thead><tr>${cols.map(c => `<th>${esc(c[0])}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(r => `<tr>${cols.map(c => `<td${c[2] ? ` class="${c[2]}"` : ''}>${c[1](r)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }

  function render(intel) {
    const el = document.getElementById('page-fontes');
    const d = IM.fontesData(intel);
    const head = `<h1 class="page__title">Fontes dos dados</h1>
      <p class="page__lead">Cada número do Centro de Inteligência vem de uma fonte pública listada aqui, com o período coberto, a data em que foi baixada e a licença. Tudo está embutido neste arquivo: nada é consultado na internet ao abri-lo.</p>
      <div class="fontes-nota"><h2 class="fontes-h2">Medido × modelado</h2>
        <p><b>Medido</b> é contagem ou registro do mundo real: veículos que passaram nas praças de pedágio e nos equipamentos SAT da ANTT, acidentes registrados pela PRF, produção declarada ao IBGE, exportações despachadas na Receita, toneladas transportadas nas ferrovias. <b>Modelado</b> é estimativa de um modelo de transporte: o VMDa da Infra S.A. (volume diário em trechos sem contagem) e a carga agrícola do PNL 2035 (alocação de fluxos na rede, ano-base 2017). Os dois servem para comparar trechos, mas só o medido é observação; os cartões e as legendas sempre dizem qual é qual.</p>
        <p><b>Acesso</b> é a data em que o arquivo foi baixado da fonte para montar este mapa (dd/mm/aaaa). O dado pode ter sido atualizado na origem depois disso.</p></div>`;
    if (!d) {
      el.innerHTML = `<div class="page__inner">${head}<p class="empty">A lista de fontes (bloco fontes) não está neste arquivo.</p></div>`;
      return;
    }
    const fontes = tabela('fontes-table', d.fontes, [
      ['Bloco', r => txt(BLOCO[r.bloco] || r.bloco)], ['Fonte', r => link(r.url, r.nome), 'wrap fontes-nome'], ['Período', r => esc(IM.fmtPeriodo(r.periodo)), 'wrap'],
      ['Acesso', r => esc(IM.fmtDia(r.acesso))], ['Licença', r => txt(r.licenca), 'wrap'], ['Tipo', r => txt(TIPO[r.tipo] || null)], ['Nota', r => txt(r.nota), 'wrap fontes-nota-col'],
    ]);
    const base = d.base.length ? `<h2 class="fontes-h2" id="fontes-base">Bases da v1/v2</h2>
      <p class="page__src">Malha federal (SNV) e programa de concessões (RoadShow), congelados no arquivo desde as primeiras versões.</p>
      ${tabela('fontes-base-table', d.base, [['Fonte', r => link(r.url, r.nome), 'wrap fontes-nome'], ['Período', r => esc(IM.fmtPeriodo(r.periodo)), 'wrap'],
        ['Acesso', r => esc(IM.fmtDia(r.acesso))], ['Licença', r => txt(r.licenca), 'wrap'], ['Nota', r => txt(r.nota), 'wrap fontes-nota-col']])}` : '';
    const indisp = d.indisponiveis.length ? `<h2 class="fontes-h2" id="fontes-indisp">Não disponíveis neste ambiente</h2>
      <p class="page__src">Fontes procuradas que não responderam ou não têm arquivo aberto; o que foi usado no lugar está no motivo.</p>
      ${tabela('fontes-indisp-table', d.indisponiveis, [['Fonte', r => link(r.url, r.nome), 'wrap fontes-nome'], ['Motivo', r => txt(r.motivo), 'wrap fontes-nota-col']])}` : '';
    el.innerHTML = `<div class="page__inner">${head}
      <h2 class="fontes-h2" id="fontes-lista">Fontes da v3 <span class="page__src">(${IM.fmtInt(d.fontes.length)})</span></h2>${fontes}
      ${d.fontes.some(r => !TIPO[r.tipo]) ? '<p class="page__src fontes-legenda" id="fontes-legenda">Tipo "—": fonte de apoio (cadastro, carteira ou notícia), que não traz número medido nem modelado próprio.</p>' : ''}${base}${indisp}</div>`;
  }

  function init(intel) {
    if (built) return;
    built = true;
    render(intel || null);
  }

  return { init };
})();
