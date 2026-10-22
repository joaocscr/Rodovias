// Aba Mercado: textos flexionados, ordem dos grupos e tabela do diagnóstico da carteira por ano. Puro: sem DOM.
// A tabela junta o que a apresentação do Ministério dos Transportes imprime (mercado.diagnostico) com anos que as
// bases do painel permitem derivar; cada valor sai com a fonte que o sustenta.
const MercadoModel = (() => {
  const num = v => typeof v === 'number' && isFinite(v);
  const nf0 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
  const nf1 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
  const lista = new Intl.ListFormat('pt-BR', { style: 'long', type: 'conjunction' });
  const NAO_PUBLICADO = 'não publicado';
  // estados de uma concessão que já tem contrato assinado (os demais são projeto ou leilão por vir)
  const CONTRATO = ['vigente', 'programa'];

  const plural = (n, um, varios) => `${nf0.format(n)} ${n === 1 ? um : varios}`;
  const rotuloConcorrentes = (concorrentes, leiloes) => `${plural(concorrentes, 'concorrente', 'concorrentes')} (${plural(leiloes, 'leilão', 'leilões')})`;

  // "p. 37" / "pp. 41 e 45" / "pp. 73, 75 e 77"
  function paginas(p) {
    const l = (Array.isArray(p) ? p : [p]).filter(x => x != null).map(String);
    if (!l.length) return '';
    return l.length > 1 ? `pp. ${lista.format(l)}` : `p. ${l[0]}`;
  }

  // As linhas "Outros N grupos" (agrupamento do resto) vão para o fim; as demais mantêm a ordem recebida.
  const nomeLinha = r => String((r && (r.label ?? r.grupo ?? r.nome)) ?? '');
  function grupoOutrosPorUltimo(rows) {
    const outros = r => nomeLinha(r).startsWith('Outros');
    return [...rows.filter(r => !outros(r)), ...rows.filter(outros)];
  }

  const diaFim = ano => `${ano}-12-31`;
  const dataBr = ano => `31/12/${ano}`;

  // R$ bi investidos no ano segundo as séries da ANTT (soma das concessões com dado); null se nenhuma série cobre o ano
  function investimentoAno(intel, ano) {
    const series = Object.values((intel && intel.antt && intel.antt.series) || {});
    let total = 0, n = 0;
    for (const s of series) {
      const i = (s.anos || []).indexOf(ano);
      const v = i < 0 ? null : (s.investimento || [])[i];
      if (num(v)) { total += v; n++; }
    }
    return n ? total / 1e9 : null;
  }
  const anoSerie = intel => {
    const anos = Object.values((intel && intel.antt && intel.antt.series) || {}).flatMap(s => s.anos || []).filter(Number.isFinite);
    return anos.length ? Math.max(...anos) : null;
  };

  // Linhas do diagnóstico, de ano em ano. Anos impressos na apresentação ficam como estão. Entre eles, um ano só entra se a
  // série de gestão (extensão concedida) o tem; 2028 e 2029, que nenhuma fonte traz, ficam de fora, sem interpolação.
  //   contratos: contratos vigentes hoje assinados até 31/12 (concessões já encerradas não entram, então a conta fica
  //              abaixo da impressa onde houve encerramento);
  //   km: extensão concedida da série de gestão;
  //   invest_executado_acum: último acumulado impresso + investimento do ano seguinte em diante nas séries da ANTT.
  function diagnosticoPorAno(conc, intel) {
    const m = conc.mercado || {};
    const pubs = (m.diagnostico || []).filter(d => Number.isFinite(d.ano));
    if (!pubs.length) return [];
    const pagDiag = paginas(m.fontes && m.fontes.diagnostico), pagGestao = paginas(m.fontes && m.fontes.gestao);
    const gestao = new Map((m.gestao || []).filter(g => num(g.privada_km)).map(g => [g.ano, g]));
    const ultimoReal = anoSerie(intel) ?? (gestao.size ? Math.max(...gestao.keys()) - 1 : -Infinity);
    const de = Math.min(...pubs.map(d => d.ano)), ate = Math.max(...pubs.map(d => d.ano));
    const publicado = new Map(pubs.map(d => [d.ano, d]));
    const out = [];
    for (let ano = de; ano <= ate; ano++) {
      const previsto = ano > ultimoReal;
      const pub = publicado.get(ano);
      if (pub) {
        const rs = v => (num(v) ? `RoadShow, ${pagDiag}` : NAO_PUBLICADO);
        const r = { ano, contratos: pub.contratos ?? null, km: pub.km ?? null, valor: pub.valor ?? null,
          invest_executado_acum: pub.invest_executado_acum ?? null, previsto, derivado: false, fontes: {} };
        for (const k of ['contratos', 'km', 'valor', 'invest_executado_acum']) r.fontes[k] = rs(r[k]);
        out.push(r);
        continue;
      }
      const g = gestao.get(ano);
      if (!g) continue;
      const contratos = (conc.entidades || []).filter(e => CONTRATO.includes(e.estado) && /^\d{4}-\d{2}-\d{2}$/.test(e.assinatura || '') && e.assinatura <= diaFim(ano)).length;
      // base do acumulado: o último ano impresso antes deste que traz o acumulado
      const base = [...pubs].filter(d => d.ano < ano && num(d.invest_executado_acum)).sort((a, b) => b.ano - a.ano)[0];
      let acum = null, fonteInv = NAO_PUBLICADO;
      if (base) {
        const anos = [];
        for (let a = base.ano + 1; a <= ano; a++) anos.push(a);
        const partes = anos.map(a => investimentoAno(intel, a));
        if (partes.every(num)) {
          const soma = partes.reduce((x, y) => x + y, 0);
          acum = base.invest_executado_acum + soma;
          fonteInv = `RoadShow, ${pagDiag} (R$ ${nf1.format(base.invest_executado_acum)} bi acumulados até ${base.ano}) + investimento ${anos.length > 1 ? `de ${anos[0]} a ${ano}` : `de ${ano}`} nas séries da ANTT (R$ ${nf1.format(soma)} bi, valores nominais)`;
        }
      }
      out.push({ ano, contratos, km: g.privada_km, valor: null, invest_executado_acum: acum, previsto, derivado: true,
        fontes: {
          contratos: `Cadastro de concessões do painel: vigentes hoje e assinadas até ${dataBr(ano)} (sem as já encerradas)`,
          km: `RoadShow, ${pagGestao} (extensão concedida em ${ano})`,
          valor: NAO_PUBLICADO,
          invest_executado_acum: fonteInv,
        } });
    }
    return out;
  }

  // Aviso dos anos que ficam fora: dentro do intervalo da tabela, os que nenhuma linha cobre.
  function diagnosticoNota(rows) {
    const anos = (rows || []).map(r => r.ano).filter(Number.isFinite);
    if (!anos.length) return '';
    const tem = new Set(anos), falta = [];
    for (let a = Math.min(...anos); a <= Math.max(...anos); a++) if (!tem.has(a)) falta.push(a);
    if (!falta.length) return '';
    return falta.length === 1
      ? `${falta[0]}: nenhuma fonte publica esse ano; fica fora da tabela, sem interpolação.`
      : `${lista.format(falta.map(String))}: nenhuma fonte publica esses anos; ficam fora da tabela, sem interpolação.`;
  }

  // Aviso dos anos derivados: a conta de contratos só enxerga os vigentes hoje, então pode ficar abaixo da impressa.
  const diagnosticoNotaDerivados = rows => ((rows || []).some(r => r.derivado)
    ? 'Nos anos calculados pelo painel, os contratos são só os vigentes hoje, assinados até o fim do ano; a contagem impressa na apresentação pode incluir concessões já encerradas, e por isso ser maior.' : '');

  return { plural, rotuloConcorrentes, paginas, grupoOutrosPorUltimo, diagnosticoPorAno, diagnosticoNota, diagnosticoNotaDerivados };
})();

if (typeof module !== 'undefined') module.exports = MercadoModel;
