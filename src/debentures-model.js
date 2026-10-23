// Aba Debêntures: cálculos puros (sem DOM) sobre o bloco window.INTEL.debentures. O bloco traz só agregados (por dia, emissor
// e subsetor) e o último negócio de cada papel. Taxa média e spread vêm com o peso (volume) de cada média, por indexador:
// médias de indexadores diferentes (IPCA+, CDI+, prefixado) nunca se misturam, e as intenções de compra e venda podem ser
// somadas aos negócios recombinando as médias pelos pesos, sem perder exatidão (series com somado: true).
const DebenturesModel = (() => {
  const DASH = '—';
  const ROTULO_NEGOCIOS = 'negócios fechados';
  const ROTULO_SOMADO = 'negócios + intenções (somados como se fossem negócios)';
  const num = v => typeof v === 'number' && isFinite(v);
  const nf = d => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
  const nf0 = nf(0), nf1 = nf(1), nf2 = nf(2);
  const collator = new Intl.Collator('pt-BR');
  const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const INDEXADORES = ['IPCA+', 'DI+', 'PRÉ'];  // ordem de exibição; outros indexadores vêm depois, em ordem alfabética
  const MEDIDAS = ['volume', 'n', 'taxa_media', 'volume_taxa', 'spread_medio', 'volume_spread', 'por_direcao'];

  // ---------- formatação ----------
  const fmtPct = (v, d = 2) => (num(v) ? `${nf(d).format(v)}%` : DASH);
  const fmtPp = v => (num(v) ? `${nf2.format(v)} p.p.` : DASH);
  const fmtInt = v => (num(v) ? nf0.format(v) : DASH);
  function fmtVolume(v) {
    if (!num(v)) return DASH;
    const a = Math.abs(v);
    if (a >= 1e9) return `R$ ${nf2.format(v / 1e9)} bi`;
    if (a >= 1e6) return `R$ ${nf2.format(v / 1e6)} mi`;
    if (a >= 1e3) return `R$ ${nf1.format(v / 1e3)} mil`;
    return `R$ ${nf0.format(v)}`;
  }
  // AAAA-MM-DD -> dd/mm/aaaa; AAAA-MM -> mmm/aaaa
  function fmtData(s) {
    if (!s) return DASH;
    const [y, m, d] = String(s).split('-');
    if (d) return `${d}/${m}/${y}`;
    return m ? `${MESES[Number(m) - 1]}/${y}` : y;
  }
  const fmtDiaMes = s => (s ? String(s).split('-').slice(1).reverse().join('/') : DASH);

  // Taxa de um papel, escrita como o mercado a escreve: "IPCA + 7,34%", "CDI + 0,50%", "prefixada 13,50%".
  function taxaTexto(indexador, taxa) {
    if (!num(taxa)) return DASH;
    const t = nf2.format(taxa);
    if (indexador === 'IPCA+') return `IPCA + ${t}%`;
    if (indexador === 'DI+') return `CDI + ${t}%`;
    if (indexador === 'PRÉ') return `prefixada ${t}%`;
    return `${indexador || ''} ${t}%`.trim();
  }
  const ordemIndexador = (a, b) => {
    const ia = INDEXADORES.indexOf(a), ib = INDEXADORES.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || collator.compare(a, b);
  };
  // {"IPCA+": 8.35, "DI+": 0.6} -> "IPCA + 8,35%; CDI + 0,60%": uma taxa por indexador, nunca uma média entre eles
  function taxaMediaTexto(dict) {
    const ks = Object.keys(dict || {}).filter(k => num(dict[k])).sort(ordemIndexador);
    return ks.length ? ks.map(k => taxaTexto(k, dict[k])).join('; ') : DASH;
  }
  const taxaIpca = linha => (linha && linha.taxa_media && num(linha.taxa_media['IPCA+']) ? linha.taxa_media['IPCA+'] : null);

  // ---------- recombinação de médias ponderadas ----------
  // Média ponderada de duas médias (a com peso wa, b com peso wb); um lado ausente devolve o outro, sem conta.
  function mediaDe(a, wa, b, wb) {
    const ha = num(a) && num(wa) && wa > 0, hb = num(b) && num(wb) && wb > 0;
    if (ha && hb) return (a * wa + b * wb) / (wa + wb);
    return ha ? a : hb ? b : null;
  }

  // Soma duas linhas de agregado do mesmo grupo (mesmo dia, emissor ou subsetor): volume e número somam; a taxa média de cada
  // indexador e o spread médio são recombinados pelos pesos (volume_taxa por indexador, volume_spread).
  function somaLinha(a, b) {
    const out = {};
    for (const l of [b, a]) if (l) for (const k of Object.keys(l)) if (!MEDIDAS.includes(k)) out[k] = l[k];
    out.volume = ((a && a.volume) || 0) + ((b && b.volume) || 0);
    out.n = ((a && a.n) || 0) + ((b && b.n) || 0);
    const ta = (a && a.taxa_media) || {}, tb = (b && b.taxa_media) || {};
    const wa = (a && a.volume_taxa) || {}, wb = (b && b.volume_taxa) || {};
    out.taxa_media = {};
    out.volume_taxa = {};
    for (const ix of new Set([...Object.keys(wa), ...Object.keys(wb)])) {
      out.volume_taxa[ix] = (wa[ix] || 0) + (wb[ix] || 0);
      const m = mediaDe(ta[ix], wa[ix], tb[ix], wb[ix]);
      if (m != null) out.taxa_media[ix] = m;
    }
    out.volume_spread = ((a && a.volume_spread) || 0) + ((b && b.volume_spread) || 0);
    out.spread_medio = mediaDe(a && a.spread_medio, a && a.volume_spread, b && b.spread_medio, b && b.volume_spread);
    return out;
  }

  // Une duas listas de agregados pela chave (data, emissor, subsetor), somando as linhas que se repetem.
  function mesclar(la, lb, chave) {
    const por = new Map();
    for (const l of [...(la || []), ...(lb || [])]) por.set(l[chave], por.has(l[chave]) ? somaLinha(por.get(l[chave]), l) : l);
    return [...por.values()];
  }

  const porVolume = (a, b) => (b.volume || 0) - (a.volume || 0) || collator.compare(String(a.emissor || a.subsetor || ''), String(b.emissor || b.subsetor || ''));
  const porData = (a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0);
  const quando = e => `${e.data || ''} ${e.hora || ''}`;

  // Séries do mercado secundário. somado: false = só negócios fechados; true = negócios + intenções de compra e venda, tratadas
  // como se fossem negócios (rotulo diz isso). ultimoPorTicker: o último negócio de cada papel; somado, o último registro
  // (negócio ou intenção), com o negócio vencendo o empate.
  function series(bloco, { somado = false } = {}) {
    const s = (bloco && bloco.secundario) || {};
    const neg = s.negocios || {}, int = somado ? (s.intencoes || {}) : {};
    let ultimo = (s.ultimo_por_ticker || []).filter(e => e.origem === 'negocio');
    if (somado) {
      const por = new Map();
      for (const e of s.ultimo_por_ticker || []) {
        const cur = por.get(e.ticker);
        if (!cur || quando(e) > quando(cur) || (quando(e) === quando(cur) && e.origem === 'negocio')) por.set(e.ticker, e);
      }
      ultimo = [...por.values()];
    }
    ultimo = [...ultimo].sort((a, b) => collator.compare(a.emissor, b.emissor) || collator.compare(a.ticker, b.ticker));
    return {
      somado: !!somado,
      rotulo: somado ? ROTULO_SOMADO : ROTULO_NEGOCIOS,
      periodo: s.periodo || null,
      porDia: mesclar(neg.por_dia, int.por_dia, 'data').sort(porData),
      porEmissor: mesclar(neg.por_emissor, int.por_emissor, 'emissor').sort(porVolume),
      porSubsetor: mesclar(neg.por_subsetor, int.por_subsetor, 'subsetor').sort(porVolume),
      ultimoPorTicker: ultimo,
    };
  }

  // Números de abertura da seção: totais do período recombinados a partir das linhas por dia.
  function kpis(bloco, opcoes = {}) {
    const s = series(bloco, opcoes);
    const t = s.porDia.reduce((acc, l) => somaLinha(acc, l), null) || somaLinha(null, null);
    return { somado: s.somado, rotulo: s.rotulo, periodo: s.periodo, volume: t.volume, n: t.n, dias: s.porDia.length,
      emissores: s.porEmissor.length, papeis: s.ultimoPorTicker.length, taxa: t.taxa_media, taxaIpca: taxaIpca(t), spread: t.spread_medio };
  }

  // Intenções de compra e venda, à parte dos negócios: por direção, por dia e por emissor (sempre as intenções, nunca somadas).
  function intencoes(bloco) {
    const i = (bloco && bloco.secundario && bloco.secundario.intencoes) || {};
    const dir = (l, d) => (l.por_direcao && l.por_direcao[d]) || { volume: 0, n: 0 };
    const abre = l => Object.assign({}, l, { compra: dir(l, 'compra'), venda: dir(l, 'venda') });
    const ordem = { compra: 0, venda: 1 };
    return {
      porDirecao: [...(i.por_direcao || [])].sort((a, b) => (ordem[a.direcao] ?? 9) - (ordem[b.direcao] ?? 9)),
      porDia: (i.por_dia || []).map(abre).sort(porData),
      porEmissor: (i.por_emissor || []).map(abre).sort(porVolume),
    };
  }

  // ---------- indicadores macroeconômicos e curva de NTN-B ----------
  const MACRO = [
    ['selic', 'Selic meta', 'a.a.', 'taxa básica de juros definida pelo Copom', 'selic'],
    ['cdi', 'CDI', 'a.a.', 'taxa diária dos empréstimos entre bancos, anualizada', 'cdi'],
    ['ipca12m', 'IPCA em 12 meses', '', 'inflação acumulada nos 12 meses até o mês indicado', 'ipca'],
    ['focus_ipca', 'Expectativa de IPCA (Focus)', '', 'mediana das projeções do mercado para a inflação dos próximos 12 meses', 'focus'],
  ];
  function macro(bloco) {
    const m = (bloco && bloco.macro) || {};
    return MACRO.filter(([k]) => m[k] && num(m[k].valor)).map(([k, rotulo, un, explica, termo]) => ({
      id: k, rotulo, explica, termo, valor: `${nf2.format(m[k].valor)}%${un ? ` ${un}` : ''}`, data: fmtData(m[k].data),
      bruto: m[k].valor }));
  }
  function curvaNtnb(bloco) {
    return [...((bloco && bloco.macro && bloco.macro.ntnb) || [])].filter(p => p.vencimento && num(p.taxa))
      .sort((a, b) => (a.vencimento < b.vencimento ? -1 : a.vencimento > b.vencimento ? 1 : 0));
  }
  // Data da curva de NTN-B (a mais recente publicada) e, se o período dos negócios vai além dela, o aviso de que o spread
  // dos dias seguintes fica sem valor.
  function curvaAte(bloco) {
    return curvaNtnb(bloco).map(p => p.data).filter(Boolean).sort().pop() || null;
  }
  function notaCurva(bloco) {
    const ate = curvaAte(bloco), fim = bloco && bloco.secundario && bloco.secundario.periodo && bloco.secundario.periodo.ate;
    return ate && fim && fim > ate
      ? `O Tesouro Nacional publicou a curva até ${fmtData(ate)}: nos negócios dos dias seguintes (até ${fmtData(fim)}) o spread aparece como “${DASH}”.` : '';
  }
  const periodoTexto = p => (p && p.de && p.ate ? `${fmtData(p.de)} a ${fmtData(p.ate)}` : '');

  // ---------- tabelas ----------
  // Cada coluna: k (chave da linha, também a de ordenação), rotulo, num (alinha à direita) e fmt(linha) -> texto.
  const txt = v => (v == null || v === '' ? DASH : String(v));
  const COLUNAS_EMISSOES = [
    { k: 'ticker', rotulo: 'Papel', fmt: l => txt(l.ticker) },
    { k: 'emissor', rotulo: 'Emissor', fmt: l => txt(l.emissor) },
    { k: 'subsetor', rotulo: 'Subsetor', fmt: l => txt(l.subsetor) },
    { k: 'grupo', rotulo: 'Grupo', fmt: l => txt(l.grupo) },
    { k: 'indexador', rotulo: 'Indexador', fmt: l => txt(l.indexador) },
    { k: 'taxa_emissao', rotulo: 'Taxa na emissão', num: true, fmt: l => taxaTexto(l.indexador, l.taxa_emissao) },
    { k: 'vencimento', rotulo: 'Vencimento', num: true, fmt: l => fmtData(l.vencimento) },
    { k: 'volume_emitido', rotulo: 'Volume emitido', num: true, fmt: l => fmtVolume(l.volume_emitido) },
    { k: 'data_emissao', rotulo: 'Data de emissão', num: true, fmt: l => fmtData(l.data_emissao) },
    { k: 'coordenadores', rotulo: 'Coordenadores', fmt: l => txt(l.coordenadores) },
    { k: 'incentivada', rotulo: 'Incentivada (Lei 12.431)', fixa: true, fmt: l => (l.incentivada === true ? 'Sim' : l.incentivada === false ? 'Não' : DASH) },
    { k: 'rating', rotulo: 'Nota de crédito (rating)', fmt: l => txt(l.rating) },
  ];
  // Emissões de emissores de rodovias e infraestrutura de transporte, uma linha por papel. Campo que a fonte não traz num papel
  // fica "—"; coluna que a fonte não preenche em nenhum papel sai da tabela (e é listada em `ocultas`), e volta sozinha
  // quando uma fonte passar a trazer o dado. "Incentivada" (fixa) fica sempre.
  function tabelaEmissoes(bloco) {
    const linhas = ((bloco && bloco.emissoes) || []).map(e => Object.assign({}, e, {
      coordenadores: Array.isArray(e.coordenadores) ? (e.coordenadores.join(', ') || null) : (e.coordenadores || null) }));
    const vazia = c => !c.fixa && linhas.length > 0 && linhas.every(l => c.fmt(l) === DASH);
    return { colunas: COLUNAS_EMISSOES.filter(c => !vazia(c)), ocultas: COLUNAS_EMISSOES.filter(vazia).map(c => c.rotulo), linhas,
      subsetores: [...new Set(linhas.map(l => l.subsetor).filter(Boolean))].sort(collator.compare) };
  }

  const colunasEmissores = somado => [
    { k: 'emissor', rotulo: 'Emissor', fmt: l => txt(l.emissor) },
    { k: 'subsetor', rotulo: 'Subsetor', fmt: l => txt(l.subsetor) },
    { k: 'volume', rotulo: 'Volume', num: true, fmt: l => fmtVolume(l.volume) },
    { k: 'n', rotulo: somado ? 'Negócios + intenções' : 'Negócios', num: true, fmt: l => fmtInt(l.n) },
    { k: 'taxa_ipca', rotulo: 'Taxa média', fmt: l => taxaMediaTexto(l.taxa_media) },
    { k: 'spread_medio', rotulo: 'Spread médio sobre a NTN-B (IPCA+)', num: true, fmt: l => fmtPp(l.spread_medio) },
  ];
  // Taxa média e spread por emissor, do que series() devolve.
  function tabelaEmissores(s) {
    return { colunas: colunasEmissores(s.somado), linhas: s.porEmissor.map(l => Object.assign({ taxa_ipca: taxaIpca(l) }, l)) };
  }

  const tipoUltimo = e => (e.origem === 'negocio' ? 'Negócio' : e.direcao === 'venda' ? 'Intenção de venda' : 'Intenção de compra');
  const COLUNAS_ULTIMO = [
    { k: 'ticker', rotulo: 'Papel', fmt: l => txt(l.ticker) },
    { k: 'emissor', rotulo: 'Emissor', fmt: l => txt(l.emissor) },
    { k: 'subsetor', rotulo: 'Subsetor', fmt: l => txt(l.subsetor) },
    { k: 'indexador', rotulo: 'Indexador', fmt: l => txt(l.indexador) },
    { k: 'vencimento', rotulo: 'Vencimento', num: true, fmt: l => fmtData(l.vencimento) },
    { k: 'quando', rotulo: 'Data e hora', num: true, fmt: l => `${fmtData(l.data)}${l.hora ? ` ${l.hora}` : ''}` },
    { k: 'taxa', rotulo: 'Taxa', num: true, fmt: l => taxaTexto(l.indexador, l.taxa) },
    { k: 'spread', rotulo: 'Spread sobre a NTN-B (IPCA+)', num: true, fmt: l => fmtPp(l.spread) },
    { k: 'tipo', rotulo: 'Tipo', fmt: l => l.tipo },
  ];
  // Último negócio de cada papel (ou último registro, se somado), do que series() devolve.
  function tabelaUltimo(s) {
    return { colunas: COLUNAS_ULTIMO, linhas: s.ultimoPorTicker.map(e => Object.assign({ quando: quando(e), tipo: tipoUltimo(e) }, e)) };
  }

  // Série de debêntures incentivadas para rodovias do RoadShow (p. 77): anos e valores, como estão em mercado.json.
  function serieIncentivadas(mercado) {
    const d = mercado && mercado.debentures;
    return d && Array.isArray(d.serie) && d.serie.length ? d : null;
  }

  return { ROTULO_NEGOCIOS, ROTULO_SOMADO, DASH, mediaDe, somaLinha, mesclar, series, kpis, intencoes, macro, curvaNtnb, curvaAte, notaCurva, periodoTexto,
    tabelaEmissoes, tabelaEmissores, tabelaUltimo, serieIncentivadas, taxaIpca, taxaTexto, taxaMediaTexto,
    fmtPct, fmtPp, fmtInt, fmtVolume, fmtData, fmtDiaMes };
})();

if (typeof module !== 'undefined') module.exports = DebenturesModel;
