// Aba Fontes: a lista das fontes usadas neste arquivo, montada só a partir dos blocos embutidos. Puro: sem DOM.
// - dados: INTEL.fontes.fontes (uma linha por item `fonte` de cada bloco de data/intel/, gerado por fontes_bloco.py);
// - base: INTEL.fontes.base (malha federal e carteira de concessões, que não passam por data/intel/);
// - documentos: os da verificação dos leilões (CONC.verificacao.fontes) e os da composição dos consórcios (CONC.consorcios);
// - glossário: as fontes citadas nas definições (GLOSSARIO[].fonte), com os termos que as usam;
// - indisponíveis: fontes procuradas que não deram dado (INTEL.fontes.indisponiveis).
// O nome de cada bloco vem de data/fontes_descricao.json (o mesmo do Resumo). Bloco novo com fonte entra sozinho; sem
// descrição, aparece com a própria chave e é apontado em `semDescricao`.
const FontesModel = (() => {
  const lista = x => (Array.isArray(x) ? x : []);

  function listar(intel, conc, glossario, descricoes) {
    const desc = descricoes || {};
    const ordem = Object.keys(desc);
    const posicao = b => (ordem.includes(b) ? ordem.indexOf(b) : ordem.length);
    const rotulo = b => (desc[b] && desc[b].nome) || b;
    const f = (intel && intel.fontes) || {};
    const comRotulo = x => Object.assign({}, x, { rotulo: rotulo(x.bloco) });

    // sort estável: dentro do bloco, a ordem do arquivo; bloco sem descrição no fim
    const dados = lista(f.fontes).map(comRotulo).sort((a, b) => posicao(a.bloco) - posicao(b.bloco));
    const semDescricao = [...new Set(dados.filter(x => !desc[x.bloco]).map(x => x.bloco))];

    const documentos = [], vistos = new Set();
    const addDoc = d => {
      if (!d || vistos.has(d.id)) return;
      vistos.add(d.id);
      documentos.push(d);
    };
    lista(conc && conc.verificacao && conc.verificacao.fontes).forEach(addDoc);
    lista(conc && conc.consorcios).forEach(c => lista(c.fontes).forEach(addDoc));

    const porNome = new Map();
    for (const e of lista(glossario)) {
      const fo = e && e.fonte;
      if (!fo || !fo.nome) continue;
      if (!porNome.has(fo.nome)) porNome.set(fo.nome, { nome: fo.nome, url: fo.url || null, termos: [] });
      porNome.get(fo.nome).termos.push({ id: e.id, termo: e.termo });
    }

    return { dados, base: lista(f.base).map(comRotulo), documentos, glossario: [...porNome.values()],
      indisponiveis: lista(f.indisponiveis), semDescricao };
  }

  return { listar };
})();

if (typeof module !== 'undefined') module.exports = FontesModel;
