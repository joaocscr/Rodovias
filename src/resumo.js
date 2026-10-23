// Aba Resumo (página inicial): números-chave, "Leitura em 60 segundos" com achados calculados (fórmula e fonte em cada um)
// e atalhos para as outras abas. Os números vêm de LeiloesModel.resumoKpis/resumoAchados; "Sobre este painel" vem de
// ResumoModel.sobrePainel (fontes, data-base e acesso lidos dos blocos embutidos); aqui só a montagem.
const Resumo = (() => {
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // O que cada aba traz (texto de interface; os rótulos das abas vêm de Tabs).
  const ATALHOS = {
    mapa: 'Malha federal do SNV por situação, administração e concessão; busca, filtros e camadas',
    projetos: 'Contratos, comparador de concessões, linha do tempo dos leilões e pipeline',
    trafego: 'Volume de tráfego, praças de pedágio, índice ABCR e acidentes',
    cargas: 'Produção agrícola, armazenagem, exportação, ferrovia, frete e carga nos trechos',
    mercado: 'Leilões, deságios, concorrência e grupos econômicos',
    debentures: 'Emissões e mercado secundário de debêntures de rodovias e infraestrutura de transporte',
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

  // "Sobre este painel": para que serve, de onde vêm as informações e a data-base de cada uma. As duas listas longas
  // ficam recolhidas para o bloco não empurrar os números-chave para baixo; o resumo de cada uma está no título.
  function sobreHtml(sobre) {
    const nome = f => (f.termo ? Glossario.link(f.termo, f.nome) : esc(f.nome));
    // Frase da fonte, com link do glossário na primeira menção de cada termo declarado em fontes_descricao.json
    const frase = f => ResumoModel.segmentos(f.oQue, f.termos).map(s => (s.id ? Glossario.link(s.id, s.texto) : esc(s.texto))).join('');
    const n = sobre.fontes.length;
    if (!n) return '';
    return `<section class="sobre" id="resumo-sobre" aria-labelledby="resumo-sobre-h">
      <h2 class="resumo-h2" id="resumo-sobre-h">Sobre este painel</h2>
      <h3 class="sobre__h">Para que serve</h3>
      <p class="sobre__texto" id="sobre-serve">Reúne, num único arquivo que funciona sem internet, o que se sabe sobre as ${Glossario.link('concessao', 'concessões')} rodoviárias do Brasil: a malha de rodovias, a carteira de projetos e os contratos (${Glossario.link('roadshow')}), os ${Glossario.link('leilao', 'leilões')} e seus resultados, o tráfego, as cargas e o financiamento. Cada número mostra de onde veio.</p>
      <details class="sobre__det" id="sobre-fontes">
        <summary>De onde vêm as informações <span class="page__src">(${n} ${n === 1 ? 'fonte' : 'fontes'})</span></summary>
        <ul class="sobre__lista">${sobre.fontes.map(f => `<li data-fonte="${esc(f.id)}"><b>${nome(f)}.</b> ${f.oQue ? frase(f) : ''}</li>`).join('')}</ul>
      </details>
      <details class="sobre__det" id="sobre-database">
        <summary>Data-base das informações</summary>
        <div class="table-wrap table-wrap--static"><table class="grid grid--static sobre-table" id="sobre-table" data-csv-name="sobre-painel">
          <thead><tr><th>Informação</th><th>Data-base</th><th>Acesso</th></tr></thead>
          <tbody>${sobre.fontes.map(f => `<tr data-fonte="${esc(f.id)}"><td>${esc(f.nome)}</td><td>${esc(f.dataBase)}</td><td>${esc(f.acesso)}</td></tr>`).join('')}</tbody></table></div>
        <p class="page__src" id="sobre-legenda">Data-base: período a que os números se referem. Quando o bloco reúne várias fontes, "varia por fonte (de AAAA a AAAA)" indica só o menor e o maior ano entre elas, não uma série contínua; o período exato de cada fonte está na aba <a href="#fontes">Fontes</a>. Acesso: dia em que o arquivo foi baixado da fonte; o dado pode ter sido atualizado na origem depois disso. Link e licença de cada fonte também estão na aba Fontes.</p>
      </details>
    </section>`;
  }

  function init(conc, intel, snv) {
    if (built) return;
    built = true;
    const kpis = LeiloesModel.resumoKpis(conc, intel, snv);
    const achados = LeiloesModel.resumoAchados(conc, intel);
    document.getElementById('page-resumo').innerHTML = `<div class="page__inner">
      <h1 class="page__title">Resumo das concessões rodoviárias federais</h1>
      <p class="page__lead">Os números principais da malha federal (${Glossario.link('snv')}), das concessões e dos leilões (com o ${Glossario.link('desagio', 'deságio')} dos vencedores), calculados a partir dos dados deste arquivo.</p>
      ${sobreHtml(ResumoModel.sobrePainel(conc, intel))}
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
