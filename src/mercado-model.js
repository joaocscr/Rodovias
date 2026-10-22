// Aba Mercado: textos flexionados, ordem dos grupos e tabela do diagnóstico da carteira por ano. Puro: sem DOM.
// A tabela junta o que a apresentação do Ministério dos Transportes imprime (mercado.diagnostico) com os anos em que
// só a extensão concedida (série de gestão) é publicada; cada valor sai com a fonte que o sustenta.
const MercadoModel = (() => {
  const num = v => typeof v === 'number' && isFinite(v);
  const nf0 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
  const lista = new Intl.ListFormat('pt-BR', { style: 'long', type: 'conjunction' });
  const NAO_PUBLICADO = 'não publicado';
  const CAMPOS = ['contratos', 'km', 'valor', 'invest_executado_acum'];

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
  const grupoEhOutros = r => nomeLinha(r).startsWith('Outros');
  function grupoOutrosPorUltimo(rows) {
    return [...rows.filter(r => !grupoEhOutros(r)), ...rows.filter(grupoEhOutros)];
  }

  const anoSerie = intel => {
    const anos = Object.values((intel && intel.antt && intel.antt.series) || {}).flatMap(s => s.anos || []).filter(Number.isFinite);
    return anos.length ? Math.max(...anos) : null;
  };

  // Linhas do diagnóstico, de ano em ano. Anos impressos na apresentação ficam como estão (e vencem qualquer linha
  // derivada: uma edição nova que traga um ano passa a mandar nele). Entre eles, um ano sem impressão só entra se a série de
  // gestão (extensão concedida, mesma série da p. 37) o tem, e só com a extensão: contratos, valor e investimento acumulado
  // desses anos não são publicados e ficam nulos, sem reconstrução. Anos que nenhuma fonte traz (2028 e 2029) ficam de fora.
  // `previsto`: ano depois do último com série de investimento da ANTT (sem a série, depois do penúltimo ano da gestão).
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
        const r = { ano, contratos: pub.contratos ?? null, km: pub.km ?? null, valor: pub.valor ?? null,
          invest_executado_acum: pub.invest_executado_acum ?? null, previsto, derivado: false, fontes: {} };
        for (const k of CAMPOS) r.fontes[k] = num(r[k]) ? `RoadShow, ${pagDiag}` : NAO_PUBLICADO;
        out.push(r);
      } else if (gestao.has(ano)) {
        out.push({ ano, contratos: null, km: gestao.get(ano).privada_km, valor: null, invest_executado_acum: null, previsto, derivado: true,
          pagina: pagGestao, fontes: { contratos: NAO_PUBLICADO, km: `RoadShow, ${pagGestao}`, valor: NAO_PUBLICADO, invest_executado_acum: NAO_PUBLICADO } });
      }
    }
    return out;
  }

  // Anos em sequência agrupados: [2023, 2024, 2025] → "2023 a 2025"; [2028, 2029] → "2028 e 2029"; [2023, 2027] → "2023 e 2027".
  function faixasDeAnos(anos) {
    const runs = [];
    for (const a of [...anos].sort((x, y) => x - y)) {
      const r = runs[runs.length - 1];
      if (r && a === r[r.length - 1] + 1) r.push(a); else runs.push([a]);
    }
    return lista.format(runs.map(r => (r.length > 2 ? `${r[0]} a ${r[r.length - 1]}` : r.map(String).join(' e '))));
  }

  // Nota única da tabela: o que os anos calculados trazem (só a extensão) e os anos que nenhuma fonte publica.
  function diagnosticoNota(rows) {
    const anos = (rows || []).map(r => r.ano).filter(Number.isFinite);
    if (!anos.length) return '';
    const tem = new Set(anos), falta = [], partes = [];
    for (let a = Math.min(...anos); a <= Math.max(...anos); a++) if (!tem.has(a)) falta.push(a);
    const der = rows.filter(r => r.derivado);
    if (der.length) {
      partes.push(`${faixasDeAnos(der.map(r => r.ano))}: o RoadShow só publica a extensão concedida (${der[0].pagina}); o número de contratos vigentes, o valor e o investimento acumulado ${der.length > 1 ? 'desses anos não são publicados' : 'desse ano não são publicados'}.`);
    }
    if (falta.length) partes.push(`${faixasDeAnos(falta)}: nenhuma fonte publica ${falta.length > 1 ? 'esses anos' : 'esse ano'}.`);
    return partes.join(' ');
  }

  return { plural, rotuloConcorrentes, paginas, grupoOutrosPorUltimo, grupoEhOutros, diagnosticoPorAno, diagnosticoNota, faixasDeAnos };
})();

if (typeof module !== 'undefined') module.exports = MercadoModel;
