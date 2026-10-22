// "Sobre este painel" (aba Resumo): uma linha por fonte embutida no arquivo, com a data-base dos números e a data de acesso.
// Puro: sem DOM. Tudo vem dos blocos embutidos (INTEL.fontes: fontes por bloco e bases do painel; CONC.verificacao);
// só a frase do que cada fonte é fica em data/fontes_descricao.json, indexada pelo nome do bloco. Bloco novo com fonte
// embutida entra na tabela sozinho; sem descrição curada ele aparece em `semDescricao` (um teste falha listando-o).
const ResumoModel = (() => {
  const IM = typeof IntelModel !== 'undefined' ? IntelModel : require('./intel-model.js');
  const DASH = '—';
  const VERIFICACAO = 'verificacao';

  const unicos = xs => [...new Set(xs)];
  const faixa = (de, ate) => (de === ate ? de : `${de} a ${ate}`);

  // Acesso: a data, ou do mais antigo ao mais recente quando as fontes do bloco foram baixadas em dias diferentes.
  function acessoDe(datas) {
    const ds = unicos(datas.filter(Boolean)).sort();
    return ds.length ? faixa(IM.fmtDia(ds[0]), IM.fmtDia(ds[ds.length - 1])) : DASH;
  }

  // Agrupa as fontes embutidas por bloco: { id, nomes, periodos, acessos }
  function blocos(conc, intel) {
    const por = new Map();
    const bloco = id => {
      if (!por.has(id)) por.set(id, { id, nomes: [], periodos: [], acessos: [], datas: [] });
      return por.get(id);
    };
    const f = intel && intel.fontes;
    const linhas = [...((f && f.base) || []), ...((f && f.fontes) || [])];
    for (const x of linhas) {
      const b = bloco(x.bloco || `base:${x.nome}`);
      b.nomes.push(x.nome);
      if (x.periodo) b.periodos.push(IM.fmtPeriodo(x.periodo));
      b.acessos.push(x.acesso);
    }
    const docs = (conc && conc.verificacao && conc.verificacao.fontes) || [];
    if (docs.length) {
      const b = bloco(VERIFICACAO);
      for (const d of docs) { b.datas.push(d.data); b.acessos.push(d.acesso); }
    }
    return [...por.values()];
  }

  function dataBaseDe(b) {
    if (b.id === VERIFICACAO) {
      const ds = unicos(b.datas.filter(Boolean)).sort();
      return ds.length ? `documentos de ${faixa(IM.fmtDia(ds[0]), IM.fmtDia(ds[ds.length - 1]))}` : DASH;
    }
    const ps = unicos(b.periodos);
    if (ps.length <= 1) return ps.length ? ps[0] : DASH;
    // Bloco com várias fontes: cada uma tem o seu período (veja a aba Fontes); aqui, só de que ano a que ano os números vão.
    const anos = ps.flatMap(p => p.match(/\b(?:19|20)\d{2}\b/g) || []).map(Number);
    if (!anos.length) return ps.join('; ');
    const de = Math.min(...anos), ate = Math.max(...anos);
    return de === ate ? String(de) : `${de} a ${ate}, conforme a fonte`;
  }

  // A descrição pode terminar com "{edicao}", trocado por ", " + a edição do RoadShow (CONC.edicaoRoadshow); sem edição, some.
  const comEdicao = (txt, edicao) => txt.replace(/,?\s*\{edicao\}/, edicao ? `, ${edicao}` : '');

  function sobrePainel(conc, intel, descricoes) {
    const desc = descricoes || (typeof window !== 'undefined' && window.FONTES_DESCRICAO) || {};
    const ordem = Object.keys(desc);
    const posicao = id => (ordem.includes(id) ? ordem.indexOf(id) : ordem.length);
    const lista = blocos(conc, intel).sort((a, b) => posicao(a.id) - posicao(b.id));  // sort estável: bloco novo fica no fim
    const semDescricao = [];
    const fontes = lista.map(b => {
      const d = desc[b.id];
      if (!d) semDescricao.push(b.id);
      return {
        id: b.id,
        nome: d ? d.nome : (b.nomes[0] || b.id),
        oQue: d ? comEdicao(d.oQue, conc && conc.edicaoRoadshow) : null,
        termo: (d && d.termo) || null,
        dataBase: dataBaseDe(b),
        acesso: acessoDe(b.acessos),
      };
    });
    return { fontes, semDescricao };
  }

  return { sobrePainel };
})();

if (typeof module !== 'undefined') module.exports = ResumoModel;
