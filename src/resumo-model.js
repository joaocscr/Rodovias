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

  // Anos de dado de um período. Só vale o que está fora de parênteses (neles vêm notas como "cenário-base do PNL 2035" ou
  // "versão de out/2026"); se fora não há ano, vale o de dentro. Códigos de versão (202607A) não são anos.
  const ANO = /\b(?:19|20)\d{2}\b/g;
  function anosDoPeriodo(p) {
    const fora = String(p).replace(/\([^)]*\)/g, ' ').match(ANO);
    return (fora || String(p).match(ANO) || []).map(Number);
  }

  // Agrupa as fontes embutidas por bloco: { id, nomes, periodos, acessos }
  function blocos(conc, intel) {
    const por = new Map();
    const bloco = id => {
      if (!por.has(id)) por.set(id, { id, nomes: [], periodos: [], anos: [], acessos: [], datas: [] });
      return por.get(id);
    };
    const f = intel && intel.fontes;
    const linhas = [...((f && f.base) || []), ...((f && f.fontes) || [])];
    for (const x of linhas) {
      const b = bloco(x.bloco || `base:${x.nome}`);
      b.nomes.push(x.nome);
      if (x.periodo) { b.periodos.push(IM.fmtPeriodo(x.periodo)); b.anos.push(...anosDoPeriodo(IM.fmtPeriodo(x.periodo))); }
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
    // Bloco com várias fontes: cada uma tem o seu período (aba Fontes). Aqui só o menor e o maior ano, dito como variação
    // entre fontes, para não parecer uma série contínua.
    if (!b.anos.length) return ps.join('; ');
    const de = Math.min(...b.anos), ate = Math.max(...b.anos);
    if (de !== ate) return `varia por fonte (de ${de} a ${ate})`;
    // Fontes do mesmo ano: com datas dd/mm/aaaa nos períodos, vale da mais antiga à mais recente (só o ano esconderia que
    // são poucos dias de dado); sem duas datas diferentes, o ano.
    const iso = d => d.split('/').reverse().join('-');
    const datas = unicos(ps.flatMap(p => p.match(/\b\d{2}\/\d{2}\/\d{4}\b/g) || []).map(iso)).sort();
    return datas.length >= 2 ? faixa(IM.fmtDia(datas[0]), IM.fmtDia(datas[datas.length - 1])) : String(de);
  }

  // A descrição pode terminar com "{edicao}", trocado por ", " + a edição do RoadShow (CONC.edicaoRoadshow); sem edição, some.
  const comEdicao = (txt, edicao) => txt.replace(/,?\s*\{edicao\}/, edicao ? `, ${edicao}` : '');

  // Divide o texto em trechos, marcando os que levam link do glossário: [{ texto, id? }]. Cada termo ({ id, texto }) vira
  // link só na primeira ocorrência do seu texto; termo cujo texto não aparece, ou que cai sobre outro já marcado, é ignorado.
  function segmentos(oQue, termos) {
    const txt = oQue == null ? '' : String(oQue);
    const marcas = [];
    for (const t of termos || []) {
      const i = txt.indexOf(t.texto);
      if (i < 0 || marcas.some(m => i < m.fim && i + t.texto.length > m.ini)) continue;
      marcas.push({ ini: i, fim: i + t.texto.length, id: t.id });
    }
    marcas.sort((a, b) => a.ini - b.ini);
    const saida = [];
    let pos = 0;
    for (const m of marcas) {
      if (m.ini > pos) saida.push({ texto: txt.slice(pos, m.ini) });
      saida.push({ texto: txt.slice(m.ini, m.fim), id: m.id });
      pos = m.fim;
    }
    if (pos < txt.length) saida.push({ texto: txt.slice(pos) });
    return saida;
  }

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
        termos: (d && d.termos) || [],
        dataBase: dataBaseDe(b),
        acesso: acessoDe(b.acessos),
      };
    });
    return { fontes, semDescricao };
  }

  return { sobrePainel, segmentos };
})();

if (typeof module !== 'undefined') module.exports = ResumoModel;
