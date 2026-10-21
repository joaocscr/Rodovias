// v4: selo de origem dos campos de leilão (oficial / RoadShow / imprensa — não oficial / não localizado), com link
// para a fonte e a lista de fontes no title. Só gera HTML (sem DOM): usado pela ficha e pela aba Fontes.
const Selo = (() => {
  const CM = typeof ConcModel !== 'undefined' ? ConcModel : require('./conc-model.js');
  const esc = s => String(s).replace(/[&<>"'\n]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '\n': '&#10;' }[c]));

  const rotulo = tipo => CM.rotuloOrigem(tipo);
  // só http(s) vira link (outro esquema, como javascript:, fica como texto)
  const linkavel = url => typeof url === 'string' && /^https?:/i.test(url);

  // "ANTT — <título> (dd/mm/aaaa)"; RoadShow: "RoadShow, p. N".
  function fonteTexto(f) {
    if (!f) return '';
    if (f.tipo === 'roadshow') return f.pagina != null ? `RoadShow, p. ${f.pagina}` : 'RoadShow';
    const nome = [f.orgao, f.titulo].filter(Boolean).join(' — ');
    return nome + (f.data ? ` (${CM.fmtData(f.data)})` : '');
  }

  // v = verif[campo] ({tipo, nao_localizado, fontes, limitado_pelo_edital?}); '' sem verificação.
  function badge(v) {
    if (!v) return '';
    const tipo = v.nao_localizado || !['oficial', 'roadshow', 'imprensa'].includes(v.tipo) ? null : v.tipo;
    const fontes = (v.fontes || []).filter(Boolean);
    const linhas = fontes.map(fonteTexto).filter(Boolean);
    if (v.limitado_pelo_edital) linhas.push('limitado pelo edital; desempate por outorga');
    const url = tipo && (fontes.find(f => linkavel(f.url)) || {}).url;
    const txt = esc(rotulo(tipo));
    return `<span class="selo selo--${tipo || 'nao-localizado'}"${linhas.length ? ` title="${esc(linhas.join('\n'))}"` : ''}>${
      url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${txt}</a>` : txt}</span>`;
  }

  // Uma fonte com o selo do seu tipo e o texto (link quando há url): notas da verificação na ficha.
  function fonte(f) {
    const txt = esc(fonteTexto(f));
    return `${badge({ tipo: f.tipo, fontes: [f] })} ${linkavel(f.url) ? `<a class="link-btn" href="${esc(f.url)}" target="_blank" rel="noopener">${txt}</a>` : txt}`;
  }

  return { rotulo, fonteTexto, badge, fonte };
})();

if (typeof module !== 'undefined') module.exports = Selo;
