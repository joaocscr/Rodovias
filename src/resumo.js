// Aba Resumo (página inicial): números-chave, "Leitura em 60 segundos" com achados calculados (fórmula e fonte em cada um)
// e atalhos para as outras abas. Os números vêm de LeiloesModel.resumoKpis/resumoAchados; aqui só a montagem.
const Resumo = (() => {
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // O que cada aba traz (texto de interface; os rótulos das abas vêm de Tabs).
  const ATALHOS = {
    mapa: 'Malha federal do SNV por situação, administração e concessão; busca, filtros e camadas',
    projetos: 'Contratos, comparador de concessões, linha do tempo dos leilões e pipeline',
    trafego: 'Volume de tráfego, praças de pedágio, índice ABCR e acidentes',
    cargas: 'Produção agrícola, armazenagem, exportação, ferrovia, frete e carga nos trechos',
    mercado: 'Leilões, deságios, concorrência e grupos econômicos',
    regulatorio: 'Modelo regulatório, garantias, financiamento e otimizações contratuais',
    fontes: 'Documentos e bases de cada número, com data de acesso',
    glossario: 'O que significam os termos técnicos e de mercado usados no painel',
  };
  let built = false;

  function kpisHtml(kpis) {
    if (!kpis.length) return '';
    return `<div class="kpis resumo-kpis" id="resumo-kpis">${kpis.map(k => `<div class="kpi-tile" data-kpi="${esc(k.id)}">
      <b>${esc(k.texto)}</b><span>${esc(k.rotulo)}</span>${k.nota ? `<small class="kpi-nota">${esc(k.nota)}</small>` : ''}
      <small class="kpi-src">Fonte: ${esc(k.fonte)}</small></div>`).join('')}</div>`;
  }

  function achadosHtml(achados) {
    if (!achados.length) return '<p class="page__src">Os dados dos achados não estão neste arquivo.</p>';
    return `<ol class="achados" id="resumo-achados">${achados.map(a => `<li class="ccard achado" data-achado="${esc(a.id)}">
      <h3>${esc(a.titulo)}</h3><p class="achado__texto">${esc(a.texto)}</p>
      <details class="achado__calc"><summary>Como foi calculado</summary><p>${esc(a.formula)}</p></details>
      <p class="src">Fonte: ${esc(a.fonte)}</p></li>`).join('')}</ol>`;
  }

  function atalhosHtml() {
    const abas = Tabs.abas().filter(t => ATALHOS[t.k]);
    return `<nav class="atalhos" id="resumo-atalhos" aria-label="Atalhos para as abas">${abas.map(t =>
      `<a class="atalho" href="#${esc(t.k)}" data-atalho="${esc(t.k)}"><b>${esc(t.label)}</b><span>${esc(ATALHOS[t.k])}</span></a>`).join('')}</nav>`;
  }

  function init(conc, intel, snv) {
    if (built) return;
    built = true;
    const kpis = LeiloesModel.resumoKpis(conc, intel, snv);
    const achados = LeiloesModel.resumoAchados(conc, intel);
    document.getElementById('page-resumo').innerHTML = `<div class="page__inner">
      <h1 class="page__title">Resumo das concessões rodoviárias federais</h1>
      <p class="page__lead">Os números principais da malha federal (${Glossario.link('snv')}), das concessões e dos leilões (com o ${Glossario.link('desagio')} dos vencedores), calculados a partir dos dados deste arquivo.</p>
      ${kpisHtml(kpis)}
      <h2 class="resumo-h2">Leitura em 60 segundos</h2>
      ${achadosHtml(achados)}
      <h2 class="resumo-h2">Atalhos</h2>
      ${atalhosHtml()}
      <p class="page__src resumo-aviso" id="resumo-aviso">Análise com dados públicos; não é recomendação de investimento.</p>
    </div>`;
  }

  return { init };
})();
