// Aba Debêntures: cálculos puros (sem DOM) sobre o bloco window.INTEL.debentures. O bloco traz só agregados (por dia, emissor
// e subsetor) e o último negócio de cada papel. Taxa média e spread vêm com o peso (volume) de cada média, por indexador:
// médias de indexadores diferentes (IPCA+, DI+, % do DI, prefixada) nunca se misturam, e as intenções de compra e venda podem ser
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
  const INDEXADORES = ['IPCA+', 'DI+', '% DI', 'PRÉ'];  // ordem de exibição; outros indexadores vêm depois, em ordem alfabética
  const CORRETORAS = ['BTG', 'XP'];  // corretoras das telas de emissões e negócios; os cartões citam as que existem no bloco
  const MEDIDAS = ['volume', 'n', 'taxa_media', 'volume_taxa', 'spread_medio', 'volume_spread', 'por_direcao'];

  // ---------- formatação ----------
  const fmtPct = (v, d = 2) => (num(v) ? `${nf(d).format(v)}%` : DASH);
  const fmtPp = v => (num(v) ? `${nf2.format(v)} p.p.` : DASH);
  const fmtNum2 = v => (num(v) ? nf2.format(v) : DASH);
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

  // Um só vocabulário para o indexador, na coluna "Indexador", nas taxas e nos textos: o dado traz IPCA+, DI+, % DI e PRÉ.
  const ROTULO_INDEXADOR = { 'IPCA+': 'IPCA+', 'DI+': 'DI+', '% DI': '% do DI', 'PRÉ': 'Prefixada' };
  const rotuloIndexador = ix => ROTULO_INDEXADOR[ix] || ix || DASH;
  // Taxa de um papel, escrita como o mercado a escreve: "IPCA + 7,34%", "DI + 0,50%", "105,00% do DI", "Prefixada 13,50%".
  function taxaTexto(indexador, taxa) {
    if (!num(taxa)) return DASH;
    const t = nf2.format(taxa);
    if (indexador === 'IPCA+') return `IPCA + ${t}%`;
    if (indexador === 'DI+') return `DI + ${t}%`;
    if (indexador === '% DI') return `${t}% do DI`;
    if (indexador === 'PRÉ') return `Prefixada ${t}%`;
    return `${indexador || ''} ${t}%`.trim();
  }
  const ordemIndexador = (a, b) => {
    const ia = INDEXADORES.indexOf(a), ib = INDEXADORES.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || collator.compare(a, b);
  };
  // {"IPCA+": 8.35, "DI+": 0.6} -> "IPCA + 8,35%; DI + 0,60%": uma taxa por indexador, nunca uma média entre eles
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
    ['selic', 'Selic meta', 'a.a.', 'taxa básica de juros definida pelo Copom'],
    ['cdi', 'CDI', 'a.a.', 'taxa diária dos empréstimos entre bancos, anualizada'],
    ['ipca12m', 'IPCA em 12 meses', '', 'inflação acumulada nos 12 meses até o mês indicado'],
    ['focus_ipca', 'Expectativa de IPCA (Focus)', '', 'mediana das projeções do mercado para a inflação dos próximos 12 meses'],
  ];
  function macro(bloco) {
    const m = (bloco && bloco.macro) || {};
    return MACRO.filter(([k]) => m[k] && num(m[k].valor)).map(([k, rotulo, un, explica]) => ({
      id: k, rotulo, explica, valor: `${nf2.format(m[k].valor)}%${un ? ` ${un}` : ''}`, data: fmtData(m[k].data),
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
  // Linha "Fonte:" curta dos cartões: quem forneceu e o período; nome completo, licença e nota ficam na aba Fontes.
  // o.corretoras: ['BTG', 'XP'] (as que existem no bloco); o.periodo: 'dados' (período dos negócios e intenções), 'tela'
  // (data da tela) ou 'intencoes'; o.bcb: Banco Central; o.tesouro: curva das NTN-B (com o.curva, "curva de dd/mm/aaaa").
  function fonteCurta(bloco, o = {}) {
    const list = bloco && bloco.fonte ? (Array.isArray(bloco.fonte) ? bloco.fonte : [bloco.fonte]) : [];
    const acha = re => list.find(x => x && re.test(x.nome || ''));
    const partes = [];
    const corr = (o.corretoras || []).map(c => [c, acha(new RegExp(`^${c}\\b`))]).filter(([, f]) => f);
    if (corr.length) {
      const nome = corr.length > 1 ? `Corretoras ${corr.map(([c]) => c).join(' e ')}` : `Corretora ${corr[0][0]}`;
      const dePeriodo = (f, rotulo) => { const m = new RegExp(`${rotulo} de ([^;]+)`).exec((f && f.periodo) || ''); return m ? m[1].trim() : ''; };
      const per = o.periodo === 'dados' ? periodoTexto(bloco.secundario && bloco.secundario.periodo)
        : o.periodo === 'tela' ? `telas de ${dePeriodo(corr[0][1], 'tela')}`.replace(/ de $/, '')
        : o.periodo === 'intencoes' ? `intenções de ${dePeriodo(corr[0][1], 'intenções')}`.replace(/ de $/, '') : '';
      partes.push(per ? `${nome}, ${per}` : nome);
    }
    if (o.bcb && (acha(/Banco Central/))) partes.push('Banco Central do Brasil');
    if (o.tesouro && acha(/Tesouro Nacional/)) partes.push(o.curva && curvaAte(bloco) ? `Tesouro Nacional, curva de ${fmtData(curvaAte(bloco))}` : 'Tesouro Nacional (curva das NTN-B)');
    return partes.join('; ') || DASH;
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
    { k: 'indexador', rotulo: 'Indexador', fmt: l => rotuloIndexador(l.indexador) },
    { k: 'taxa_emissao', rotulo: 'Taxa na emissão', num: true, fmt: l => taxaTexto(l.indexador, l.taxa_emissao) },
    { k: 'vencimento', rotulo: 'Vencimento', num: true, fmt: l => fmtData(l.vencimento) },
    { k: 'volume_emitido', rotulo: 'Volume emitido', num: true, fmt: l => fmtVolume(l.volume_emitido) },
    { k: 'data_emissao', rotulo: 'Data de emissão', num: true, fmt: l => fmtData(l.data_emissao) },
    { k: 'coordenador_lider', rotulo: 'Coordenador líder', fmt: l => txt(l.coordenador_lider) },
    { k: 'incentivada', rotulo: 'Incentivada (Lei 12.431)', fixa: true, fmt: l => (l.incentivada === true ? 'Sim' : l.incentivada === false ? 'Não' : DASH) },
    { k: 'rating', rotulo: 'Nota de crédito (rating)', fmt: l => txt(l.rating) },
  ];
  // Emissões de emissores de rodovias e infraestrutura de transporte, uma linha por papel. Campo que a fonte não traz num papel
  // fica "—"; coluna que a fonte não preenche em nenhum papel sai da tabela (e é listada em `ocultas`), e volta sozinha
  // quando uma fonte passar a trazer o dado. "Incentivada" (fixa) fica sempre.
  function tabelaEmissoes(bloco) {
    const linhas = (bloco && bloco.emissoes) || [];
    const vazia = c => !c.fixa && linhas.length > 0 && linhas.every(l => c.fmt(l) === DASH);
    return { colunas: COLUNAS_EMISSOES.filter(c => !vazia(c)), ocultas: COLUNAS_EMISSOES.filter(vazia).map(c => c.rotulo), linhas };
  }

  // Filtro de subsetor da tabela de emissões, [id, rótulo] na ordem de exibição: "outros" é todo subsetor diferente de rodovias.
  const FILTROS_SUBSETOR = [['todos', 'Todos'], ['rodovias', 'Rodovias'], ['outros', 'Outros transportes']];
  const ehRodovia = l => l.subsetor === 'rodovias';
  function contagemSubsetor(emissoes) {
    const ls = emissoes || [], rodovias = ls.filter(ehRodovia).length;
    return { todos: ls.length, rodovias, outros: ls.length - rodovias };
  }
  function filtrarSubsetor(emissoes, filtro = 'todos') {
    const ls = emissoes || [];
    return filtro === 'rodovias' ? ls.filter(ehRodovia) : filtro === 'outros' ? ls.filter(l => !ehRodovia(l)) : [...ls];
  }
  // Indicação acima da tabela: a frase muda sozinha se aparecer uma emissão não incentivada. Papel sem a informação
  // (incentivada nula, "—" na tabela) não conta como "não incentivada": é dito à parte.
  function notaIncentivadas(emissoes) {
    const ls = emissoes || [];
    if (!ls.length) return '';
    const inc = ls.filter(l => l.incentivada === true).length, nao = ls.filter(l => l.incentivada === false).length, sem = ls.length - inc - nao;
    if (inc === ls.length) return 'Somente debêntures incentivadas (Lei 12.431): as telas recebidas são de debêntures isentas.';
    const partes = [];
    if (inc) partes.push(`${inc} ${inc === 1 ? 'incentivada' : 'incentivadas'} (Lei 12.431)`);
    if (nao) partes.push(`${nao} ${nao === 1 ? 'não incentivada' : 'não incentivadas'}`);
    if (sem) partes.push(`${sem} sem a informação`);
    return partes.length > 1 ? `${partes.slice(0, -1).join(', ')} e ${partes[partes.length - 1]}` : partes[0];
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
    { k: 'indexador', rotulo: 'Indexador', fmt: l => rotuloIndexador(l.indexador) },
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

  // ---------- índices de debêntures: IDA (ANBIMA) e IDEX-Infra ----------
  const ORDEM_IDA = ['IPCA_INFRAESTRUTURA', 'IPCA', 'GERAL', 'DI'];
  const NOME_IDA = { IPCA_INFRAESTRUTURA: 'IDA-IPCA Infraestrutura', IPCA: 'IDA-IPCA', GERAL: 'IDA-Geral', DI: 'IDA-DI' };
  const ORDEM_IDEX = ['Idex-Infra Geral', 'Idex-Infra Core'];
  const R_IDA = 'IPCA_INFRAESTRUTURA', R_IDEX = 'Idex-Infra Geral';
  const nomeIdex = k => String(k).replace(/^idex/i, 'IDEX');
  const mesNum = mes => { const [y, m] = String(mes).split('-').map(Number); return y * 12 + (m - 1); };
  const rotuloMes = n => fmtData(`${Math.floor(n / 12)}-${String((n % 12) + 1).padStart(2, '0')}`);
  const diaNum = s => { const [y, m, d] = String(s).split('-').map(Number); return Date.UTC(y, m - 1, d) / 864e5; };
  const ordena = (chaves, ordem) => [...ordem.filter(k => chaves.includes(k)), ...chaves.filter(k => !ordem.includes(k)).sort()];
  const indicesIda = ida => (ida && ida.indices) || {};
  const chavesIda = ida => ordena(Object.keys(indicesIda(ida)), ORDEM_IDA);
  const nomeIda = (k, ix) => (ix && ix.nome) || NOME_IDA[k] || k;
  const serieIda = (ida, k) => [...((indicesIda(ida)[k] || {}).serie || [])].sort(porData);
  const arred = v => +v.toFixed(10);
  const orgDe = (bloco, padrao) => {
    const f = bloco && Array.isArray(bloco.fonte) ? bloco.fonte[0] : bloco && bloco.fonte;
    return (f && f.nome ? String(f.nome).split(' — ')[0] : '') || padrao;
  };

  // Dias úteis (segunda a sexta) sem ponto entre dois dias da série. Só vale no trecho diário: a série guarda todos os dias dos
  // últimos 31 dias e, antes disso, só o último dia útil de cada semana. Feriado também aparece: o dado não distingue
  // feriado de dia sem resultado publicado.
  const isoDe = n => new Date(n * 864e5).toISOString().slice(0, 10);
  function diasSemPonto(de, ate, limite) {
    const out = [];
    if (diaNum(de) < limite) return out;  // os dois dias no trecho diário
    for (let n = diaNum(de) + 1; n < diaNum(ate); n++) { const dow = new Date(n * 864e5).getUTCDay(); if (dow !== 0 && dow !== 6) out.push(isoDe(n)); }
    return out;
  }
  function limiteDiario(ida) {
    const fim = (periodoIda(ida) || {}).ate;
    return fim ? diaNum(fim) - 31 : Infinity;
  }
  // Número-índice de cada subíndice rebaseado em 100 no primeiro dia da série: [{chave, nome, pontos: [{data, base100, quebra?}]}].
  // `quebra: true` marca o ponto que vem depois de dias úteis sem resultado: a linha não liga os dois lados.
  function evolucaoIda(ida) {
    const limite = limiteDiario(ida);
    return chavesIda(ida).map(k => {
      const serie = serieIda(ida, k), base = serie.find(p => num(p.numero_indice) && p.numero_indice !== 0);
      const pontos = serie.map(p => ({ data: p.data, base100: base && num(p.numero_indice) ? (p.numero_indice / base.numero_indice) * 100 : num(p.base100) ? p.base100 : null }))
        .filter(p => num(p.base100));
      pontos.forEach((p, i) => { if (i && diasSemPonto(pontos[i - 1].data, p.data, limite).length) p.quebra = true; });
      return { chave: k, nome: nomeIda(k, indicesIda(ida)[k]), pontos };
    });
  }
  // Variações publicadas pela ANBIMA no último dia de cada subíndice (no mês, no ano, em 12 e em 24 meses, em %).
  function variacoesIda(ida) {
    const v = x => (num(x) ? x : null);
    return chavesIda(ida).filter(k => indicesIda(ida)[k].ultimo).map(k => {
      const u = indicesIda(ida)[k].ultimo;
      return { chave: k, nome: nomeIda(k, indicesIda(ida)[k]), data: u.data || null, var_mes: v(u.var_mes), var_ano: v(u.var_ano), var_12m: v(u.var_12m), var_24m: v(u.var_24m) };
    });
  }
  // Dias da série do IDA (o primeiro e o último), de todos os subíndices.
  function periodoIda(ida) {
    const ds = chavesIda(ida).flatMap(k => serieIda(ida, k).map(p => p.data)).filter(Boolean).sort();
    return ds.length ? { de: ds[0], ate: ds[ds.length - 1], dias: new Set(ds).size } : null;
  }

  // Dias úteis sem ponto no trecho diário da série do IDA (em qualquer subíndice), em ordem.
  function lacunasIda(ida) {
    const limite = limiteDiario(ida), ds = new Set();
    for (const s of evolucaoIda(ida)) s.pontos.forEach((p, i) => { if (i) diasSemPonto(s.pontos[i - 1].data, p.data, limite).forEach(d => ds.add(d)); });
    return [...ds].sort();
  }

  // Retorno acumulado do IDEX-Infra desde o primeiro mês, composto mês a mês: 1% e depois 2% dão 3,02%, não 3%.
  function retornosIdex(idex) {
    const r = (idex && idex.retornos) || {};
    return ordena(Object.keys(r), ORDEM_IDEX).map(k => {
      let fator = 1;
      const pontos = [...r[k]].filter(m => m && m.mes && num(m.pct)).sort((a, b) => (a.mes < b.mes ? -1 : a.mes > b.mes ? 1 : 0))
        .map(m => { fator *= 1 + m.pct / 100; return { mes: m.mes, acumulado_pct: arred((fator - 1) * 100) }; });
      return { chave: k, nome: nomeIdex(k), pontos };
    });
  }
  // Spread médio diário do IDEX-Infra Geral: a fonte traz pontos-base (100 pontos-base = 1 p.p.); aqui já em p.p.
  const bpsParaPp = bps => (num(bps) ? bps / 100 : null);
  function spreadIdex(idex) {
    return [...((idex && idex.spread) || [])].filter(d => d && d.data && num(d.spread_medio_bps)).sort(porData)
      .map(d => ({ data: d.data, spread_pp: bpsParaPp(d.spread_medio_bps), duration: num(d.duration_media) ? d.duration_media : null, n_papeis: d.n_papeis }));
  }
  function periodoIdex(idex) {
    const sp = spreadIdex(idex), ms = retornosIdex(idex).flatMap(r => r.pontos.map(p => p.mes)).sort();
    return { spread: sp.length ? { de: sp[0].data, ate: sp[sp.length - 1].data } : null, retornos: ms.length ? { de: ms[0], ate: ms[ms.length - 1] } : null };
  }
  // Retorno em 12 meses lado a lado: o IDA-IPCA Infraestrutura (variação publicada pela ANBIMA) e o IDEX-Infra Geral (relatório
  // mensal). Cada linha diz a sua janela (`janela`, `ate`: data final em AAAA-MM-DD, o mês valendo até o último dia).
  const fimDoMes = mes => { const [y, m] = mes.split('-').map(Number); return isoDe(Date.UTC(y, m, 0) / 864e5); };
  function comparacaoRetorno12m(ida, idex) {
    const out = [], u = indicesIda(ida)[R_IDA] && indicesIda(ida)[R_IDA].ultimo;
    const linha = (rotulo, pct, ate, ateRotulo, origem) => ({ rotulo, pct, ate, ate_rotulo: ateRotulo, janela: `${rotulo} — 12 meses até ${ateRotulo}`, origem });
    if (u && num(u.var_12m) && u.data) out.push(linha(nomeIda(R_IDA, indicesIda(ida)[R_IDA]), u.var_12m, u.data, fmtData(u.data), 'variação publicada pela ANBIMA'));
    const ac = idex && idex.acumulado_12m && idex.acumulado_12m[R_IDEX], ret = retornosIdex(idex).find(r => r.chave === R_IDEX);
    if (num(ac) && ret && ret.pontos.length) {
      const mes = ret.pontos[ret.pontos.length - 1].mes;
      out.push(linha(nomeIdex(R_IDEX), ac, fimDoMes(mes), fmtData(mes), 'relatório mensal da IDEX Analytics'));
    }
    return out;
  }
  // Verdadeiro quando as janelas de 12 meses terminam em datas diferentes (os números não são diretamente comparáveis).
  const janelasDiferentes = linhas => new Set((linhas || []).map(l => l.ate)).size > 1;

  // Cobertura de cada série, para os títulos dos gráficos: "6 dias, de 14/10 a 22/10/2026".
  function intervaloCurto(de, ate) {
    const [y0] = String(de).split('-'), [y1] = String(ate).split('-');
    return y0 === y1 && String(de).split('-').length === 3 ? `${fmtDiaMes(de)} a ${fmtData(ate)}` : `${fmtData(de)} a ${fmtData(ate)}`;
  }
  const nDias = n => `${n} ${n === 1 ? 'dia' : 'dias'}`;
  function coberturaIda(ida) {
    const p = periodoIda(ida);
    return p ? `${nDias(p.dias)}, de ${intervaloCurto(p.de, p.ate)}` : '';
  }
  function coberturaIdex(idex) {
    const p = periodoIdex(idex), sp = spreadIdex(idex).length, ms = Math.max(0, ...retornosIdex(idex).map(r => r.pontos.length));
    return { spread: p.spread ? `${nDias(sp)}, de ${intervaloCurto(p.spread.de, p.spread.ate)}` : '',
      retornos: p.retornos ? `${ms} ${ms === 1 ? 'mês' : 'meses'}, de ${fmtData(p.retornos.de)} a ${fmtData(p.retornos.ate)}` : '' };
  }

  // Fontes curtas dos cartões (quem forneceu e o período, tirados dos blocos).
  function fonteIda(ida) {
    const p = periodoIda(ida);
    return p ? `${orgDe(ida, 'ANBIMA')}, resultado diário do IDA, ${fmtData(p.de)} a ${fmtData(p.ate)}` : DASH;
  }
  // parte: 'spread' (planilha de dados), 'retornos' (relatório mensal) ou 'ambos'
  function fonteIdex(idex, parte = 'ambos') {
    const p = periodoIdex(idex), org = orgDe(idex, 'IDEX Analytics'), partes = [];
    if (p.spread && parte !== 'retornos') partes.push(`planilha de dados de ${fmtData(p.spread.de)} a ${fmtData(p.spread.ate)}`);
    if (p.retornos && parte !== 'spread') partes.push(`relatório mensal de ${fmtData(p.retornos.de)} a ${fmtData(p.retornos.ate)}`);
    return partes.length ? `${org}, ${partes.join('; ')}` : DASH;
  }

  // Comparação do spread sobre a NTN-B: debêntures de transporte (do painel), IDA-IPCA Infraestrutura e IDEX-Infra Geral. Cada linha
  // traz o último dia com valor (spread_pp, data) e, se as três séries têm dias em comum, a média simples nesses dias
  // (media_comum_pp, dias_comuns, periodo_comum). `ate`: último dia da série, que pode ser posterior ao do valor (dia sem curva do
  // Tesouro não tem spread).
  function comparacaoSpread(bloco, ida, idex, { somado = false } = {}) {
    const pontos = (lista, dia, val) => lista.filter(x => x && dia(x) && num(val(x))).map(x => ({ data: dia(x), v: val(x) })).sort(porData);
    const transporte = series(bloco, { somado }).porDia;
    const defs = [
      { rotulo: `Debêntures de transporte (${somado ? 'negócios + intenções' : 'negócios'})`, curto: somado ? 'Transporte + intenções' : 'Transporte (negócios)', todas: transporte,
        pts: pontos(transporte, x => x.data, x => x.spread_medio), fonte: fonteCurta(bloco, { corretoras: CORRETORAS, periodo: 'dados', tesouro: true }) },
      { rotulo: nomeIda(R_IDA, indicesIda(ida)[R_IDA]), curto: nomeIda(R_IDA, indicesIda(ida)[R_IDA]), todas: serieIda(ida, R_IDA), pts: pontos(serieIda(ida, R_IDA), x => x.data, x => x.spread_medio),
        fonte: fonteIda(ida) },
      { rotulo: nomeIdex(R_IDEX), curto: nomeIdex(R_IDEX), todas: (idex && idex.spread) || [], pts: pontos(spreadIdex(idex), x => x.data, x => x.spread_pp),
        fonte: fonteIdex(idex, 'spread') },
    ];
    const comuns = defs[0].pts.map(p => p.data).filter(dia => defs.every(d => d.pts.some(p => p.data === dia))).sort();
    return defs.map(d => {
      const ult = d.pts[d.pts.length - 1] || null, ate = d.todas.map(x => x && x.data).filter(Boolean).sort().pop() || null;
      const media = comuns.length ? comuns.reduce((t, dia) => t + d.pts.find(p => p.data === dia).v, 0) / comuns.length : null;
      return { rotulo: d.rotulo, rotulo_curto: d.curto, spread_pp: ult ? ult.v : null, data: ult ? ult.data : null, periodo: ult ? fmtData(ult.data) : '', ate, fonte: d.fonte,
        media_comum_pp: media, dias_comuns: comuns.length, periodo_comum: !comuns.length ? '' : comuns.length === 1 ? fmtData(comuns[0]) : `${fmtData(comuns[0])} a ${fmtData(comuns[comuns.length - 1])}` };
    });
  }

  // Um papel por linha: spread do painel (último negócio), taxa indicativa da ANBIMA (carteira do IDA) e spread do IDEX-Infra em p.p.
  // Papel fora de um índice (ou sem curva no dia) fica com null, "—" na tela. Os papéis são os da tabela de emissões.
  function tabelaIndicesPorPapel(bloco, ida, idex) {
    const ult = new Map(series(bloco).ultimoPorTicker.map(e => [e.ticker, e]));
    const base = (bloco && bloco.emissoes && bloco.emissoes.length ? bloco.emissoes : [...ult.values()]).filter(e => e && e.ticker);
    const pa = (ida && ida.papeis) || {}, px = (idex && idex.papeis) || {};
    return base.map(e => ({
      ticker: e.ticker, emissor: e.emissor || (ult.get(e.ticker) || {}).emissor || null,
      spread_painel: num((ult.get(e.ticker) || {}).spread) ? ult.get(e.ticker).spread : null,
      taxa_anbima: pa[e.ticker] && num(pa[e.ticker].taxa_indicativa) ? pa[e.ticker].taxa_indicativa : null,
      spread_idex_pp: px[e.ticker] ? bpsParaPp(px[e.ticker].spread_bps) : null,
    }));
  }
  // A tabela do cartão: as linhas acima, com o indexador (para escrever a taxa como o mercado a escreve). Cabeçalhos curtos; a data
  // de cada índice vai em `datas`, para o texto do cartão.
  function tabelaIndices(bloco, ida, idex) {
    const indexador = new Map(((bloco && bloco.emissoes) || []).map(e => [e.ticker, e.indexador]));
    const linhas = tabelaIndicesPorPapel(bloco, ida, idex).map(l => Object.assign({ indexador: indexador.get(l.ticker) || null }, l));
    const maisRecente = papeis => Object.values(papeis || {}).map(p => p && p.data).filter(Boolean).sort().pop();
    const dA = maisRecente(ida && ida.papeis), dX = maisRecente(idex && idex.papeis);
    return { datas: { anbima: dA || null, idex: dX || null }, linhas, colunas: [
      { k: 'ticker', rotulo: 'Papel', fmt: l => txt(l.ticker) },
      { k: 'emissor', rotulo: 'Emissor', fmt: l => txt(l.emissor) },
      { k: 'spread_painel', rotulo: 'Spread painel (p.p.)', num: true, fmt: l => fmtNum2(l.spread_painel) },
      { k: 'taxa_anbima', rotulo: 'Taxa ANBIMA (%)', num: true, fmt: l => taxaTexto(l.indexador, l.taxa_anbima) },
      { k: 'spread_idex_pp', rotulo: 'Spread IDEX (p.p.)', num: true, fmt: l => fmtNum2(l.spread_idex_pp) },
    ] };
  }

  return { CORRETORAS, lacunasIda, janelasDiferentes, coberturaIda, coberturaIdex, evolucaoIda, variacoesIda, periodoIda, retornosIdex, spreadIdex, periodoIdex, comparacaoRetorno12m, comparacaoSpread, tabelaIndicesPorPapel, tabelaIndices,
    fonteIda, fonteIdex, diaNum, mesNum, rotuloMes, ROTULO_NEGOCIOS, ROTULO_SOMADO, DASH, mediaDe, somaLinha, mesclar, series, kpis, intencoes, macro, curvaNtnb, curvaAte, notaCurva, periodoTexto, fonteCurta,
    FILTROS_SUBSETOR, contagemSubsetor, filtrarSubsetor, notaIncentivadas, tabelaEmissoes, tabelaEmissores, tabelaUltimo, serieIncentivadas, taxaIpca, taxaTexto, taxaMediaTexto, rotuloIndexador,
    fmtPct, fmtPp, fmtInt, fmtVolume, fmtData, fmtDiaMes };
})();

if (typeof module !== 'undefined') module.exports = DebenturesModel;
