// Leilões de concessão rodoviária: ranking de grupos econômicos, série de deságio e os números da aba Resumo. Puro: sem DOM.
// Consome conc.mercado.participantes (já com a camada de verificação aplicada) e conc.grupos_alias.
const LeiloesModel = (() => {
  const num = v => typeof v === 'number' && isFinite(v);
  const collator = new Intl.Collator('pt-BR');

  // Grupo econômico de um nome de proponente (aliases = [{nome, grupo}]); sem alias, o próprio nome.
  function grupoDe(nome, aliases) {
    const a = (aliases || []).find(x => x.nome === nome);
    return a && a.grupo ? a.grupo : nome;
  }

  // Palavras de um nome sem acento, caixa e pontuação, sem o "Consórcio" inicial: "Consórcio Nova BR-040" → nova br 040.
  const palavras = s => {
    const p = String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    return p[0] === 'consorcio' ? p.slice(1) : p;
  };
  const chave = s => palavras(s).join(' ');
  // Grupo de um nome com o alias procurado pela grafia normalizada (o RoadShow grafa "Patria", "CS Infra S. A." etc.).
  function grupoGrafia(nome, aliases) {
    const a = (aliases || []).find(x => x.nome === nome) || (aliases || []).find(x => chave(x.nome) === chave(nome));
    return palavras(a && a.grupo ? a.grupo : nome);
  }
  const comeca = (p, prefixo) => prefixo.length > 0 && prefixo.every((w, i) => p[i] === w);

  // Linha "RoadShow: …" do nome do vencedor: só quando o nome que o RoadShow imprime é de outro grupo econômico. Mesmo
  // grupo: `grupoDe` coincide (pela grafia normalizada), o nome começa pelo grupo ("EcoRodovias Concessões e Ser. S.A"
  // é Ecorodovias) ou, em "Nome (Grupo)", o nome ou o que vem entre parênteses é do grupo. Grupo de outra época
  // ("Arteris (antiga OHL)" × OHL Brasil) continua divergente.
  function rsDiverge(nomeExibido, nomeRoadShow, aliases) {
    if (nomeRoadShow == null || nomeRoadShow === '') return false;
    if (nomeExibido == null || nomeExibido === '') return true;
    const g = grupoGrafia(nomeExibido, aliases);
    const m = /^(.*?)\s*\(([^()]*)\)\s*$/.exec(nomeRoadShow);
    const nomes = m ? [nomeRoadShow, m[1], m[2]] : [nomeRoadShow];
    return !nomes.some(n => { const p = grupoGrafia(n, aliases); return comeca(p, g); });
  }

  const noPeriodo = (p, { de, ate } = {}) => (!num(de) || p.ano >= de) && (!num(ate) || p.ano <= ate);

  // Por grupo: participações (cada grupo conta uma vez por leilão), vitórias, derrotas (inclui inabilitados),
  // taxa de vitória em % e primeiro/último ano. Ordem: participações, vitórias (desc), grupo (pt-BR).
  function rankingGrupos(participantes, aliases, periodo = {}) {
    const acc = new Map();
    for (const p of (participantes || []).filter(r => noPeriodo(r, periodo))) {
      const vencedor = p.vencedor ? grupoDe(p.vencedor, aliases) : null;
      const grupos = new Set(vencedor ? [vencedor] : []);
      for (const o of [...(p.outros || []), ...(p.inabilitados || [])]) if (o.grupo) grupos.add(grupoDe(o.grupo, aliases));
      for (const g of grupos) {
        const r = acc.get(g) || { grupo: g, participacoes: 0, vitorias: 0, derrotas: 0, taxa: 0, primeira: p.ano, ultima: p.ano };
        r.participacoes++;
        if (g === vencedor) r.vitorias++; else r.derrotas++;
        r.primeira = Math.min(r.primeira, p.ano);
        r.ultima = Math.max(r.ultima, p.ano);
        acc.set(g, r);
      }
    }
    const rows = [...acc.values()];
    rows.forEach(r => { r.taxa = (r.vitorias / r.participacoes) * 100; });
    return rows.sort((a, b) => b.participacoes - a.participacoes || b.vitorias - a.vitorias || collator.compare(a.grupo, b.grupo));
  }

  // Leilões sem lista de concorrentes (outros vazio) no período.
  const leiloesSemLista = (participantes, periodo = {}) =>
    (participantes || []).filter(p => noPeriodo(p, periodo) && !(p.outros || []).length).length;

  // Ano decimal de uma data AAAA-MM-DD (fração = dia do ano); null se a data não for válida.
  function anoDecimal(data) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data || '');
    if (!m) return null;
    const [y, mo, d] = [+m[1], +m[2], +m[3]];
    // mês 1–12 e dia dentro do mês (Date.UTC "rola" 2025-02-30 para março: a ida e volta denuncia)
    const u = new Date(Date.UTC(y, mo - 1, d));
    if (mo < 1 || mo > 12 || u.getUTCMonth() !== mo - 1 || u.getUTCDate() !== d) return null;
    const ini = Date.UTC(y, 0, 1), dia = (Date.UTC(y, mo - 1, d) - ini) / 864e5, total = (Date.UTC(y + 1, 0, 1) - ini) / 864e5;
    return y + dia / total;
  }

  // Deságio do vencedor por leilão: x = ano decimal da data (ou meio do ano), tipo = fonte do deságio,
  // limitado = deságio travado pelo teto do edital (critério híbrido). Exclui deságio nulo.
  function serieDesagio(participantes) {
    return (participantes || []).filter(p => num(p.desagio_vencedor)).map(p => {
      const d = (p.verif || {}).desagio || {};
      return { x: anoDecimal(p.data) ?? p.ano + 0.5, y: p.desagio_vencedor, label: `${p.lote} · ${p.vencedor || '—'}`,
        tipo: d.tipo || 'roadshow', limitado: d.limitado_pelo_edital === true };
    });
  }

  function mediaDesagio(valores) {
    const v = (valores || []).filter(num);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  }

  // ---------- Resumo (aba inicial): números-chave e achados calculados dos dados do arquivo ----------
  // Cada número sai de conc.mercado (RoadShow + camada de verificação), do SNV ou do pipeline; nada digitado. Cada item só
  // entra quando os dados dele existem (bloco ausente = item ausente, nunca NaN).
  const nfx = (min, max = min) => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: min, maximumFractionDigits: max });
  const f0 = nfx(0), f1 = nfx(1), f2 = nfx(2);
  const lista = new Intl.ListFormat('pt-BR', { type: 'conjunction' });
  const pct1 = v => `${f1.format(v)}%`, pct2 = v => `${f2.format(v)}%`;
  const qtd = (n, um, varios) => `${f0.format(n)} ${n === 1 ? um : varios}`;
  const arr = x => (Array.isArray(x) ? x : []);
  const periodoAnos = anos => {
    const a = anos.filter(num);
    if (!a.length) return '';
    const de = Math.min(...a), ate = Math.max(...a);
    return de === ate ? String(de) : `${de}–${ate}`;
  };
  const RS = 'RoadShow 2026-2027';
  function rsPaginas(m, key) {
    const p = [].concat((m.fontes || {})[key] ?? []).filter(x => x != null);
    if (!p.length) return RS;
    return p.length === 1 ? `${RS}, p. ${p[0]}` : `${RS}, pp. ${lista.format(p.map(String))}`;
  }
  // Fonte de um campo verificado numa lista de leilões: a camada de verificação pelos tipos presentes; sem verificação,
  // o RoadShow (páginas da chave do mercado).
  function fonteCampo(rows, campo, m, key) {
    const tipos = new Set(rows.map(r => ((r.verif || {})[campo] || {}).tipo || 'roadshow'));
    const partes = [];
    if (tipos.has('oficial')) partes.push('camada de verificação (fontes oficiais)');
    if (tipos.has('roadshow')) partes.push(tipos.size > 1 ? `${rsPaginas(m, key)}, onde não há verificação` : rsPaginas(m, key));
    if (tipos.has('imprensa')) partes.push('imprensa — não oficial');
    return partes.join('; ');
  }
  // Período do programa (anos de programa_por_ano) e as linhas válidas.
  function programa(m) {
    const rows = arr(m.programa_por_ano).filter(p => num(p.ano));
    if (!rows.length) return null;
    const anos = rows.map(p => p.ano);
    return { rows, de: Math.min(...anos), ate: Math.max(...anos), periodo: periodoAnos(anos) };
  }
  const ADM_CONCESSAO = 'Concessão Federal';  // categoria de administração do SNV

  // intel: parte da interface do Resumo (hoje nenhum KPI vem do INTEL).
  function resumoKpis(conc, intel, snv) {
    const out = [];
    const m = (conc && conc.mercado) || {};
    if (snv && Array.isArray(snv.fis) && snv.fis.length && snv.dict && Array.isArray(snv.trechos)) {
      const M = typeof Model !== 'undefined' ? Model : require('./model.js');
      const f = M.emptyFilters(), a = M.aggregate(snv, f, M.visibleFis(snv, f));
      const fonte = snv.versao ? `SNV ${snv.versao} (DNIT)` : 'SNV (DNIT)';
      if (a.km > 0) {
        out.push({ id: 'malha', rotulo: 'Malha rodoviária federal no SNV', valor: a.km, texto: `${f0.format(a.km)} km`, unidade: 'km', fonte });
        const c = a.porAdm.find(x => (snv.dict.adm || [])[x.i] === ADM_CONCESSAO);
        if (c) {
          out.push({ id: 'concessao', rotulo: `Sob concessão federal (${pct1(c.pct * 100)} da malha)`, valor: c.km, texto: `${f0.format(c.km)} km`,
            unidade: 'km', fonte: `${fonte}, administração "${ADM_CONCESSAO}"` });
        }
      }
    }
    const prog = programa(m);
    const part = arr(m.participantes).filter(p => num(p.ano));
    if (prog && prog.rows.every(p => num(p.leiloes))) {
      const total = prog.rows.reduce((s, p) => s + p.leiloes, 0);
      const feitos = part.filter(p => p.ano >= prog.de && p.ano <= prog.ate);
      out.push({ id: 'leiloes', rotulo: `Leilões realizados, de ${f0.format(total)} previstos no programa ${prog.periodo}`, valor: feitos.length,
        texto: f0.format(feitos.length), unidade: 'leilões',
        fonte: `${rsPaginas(m, 'programa_por_ano')} (programa)${feitos.length ? `; realizados: ${fonteCampo(feitos, 'leilao', m, 'participantes')}` : ''}` });
    }
    if (prog && prog.rows.every(p => num(p.capex) && num(p.opex))) {
      const inv = prog.rows.reduce((s, p) => s + p.capex + p.opex, 0);
      out.push({ id: 'investimento', rotulo: `Capex + opex do programa ${prog.periodo}`, valor: inv, texto: `R$ ${f1.format(inv)} bi`,
        unidade: 'R$ bi', fonte: rsPaginas(m, 'programa_por_ano') });
    }
    const cd = arr(m.concorrentes_desagio).filter(x => num(x.desagio));
    if (cd.length) {
      const v = mediaDesagio(cd.map(x => x.desagio));
      out.push({ id: 'desagio', rotulo: `Deságio médio dos leilões de ${periodoAnos(cd.map(x => x.ano))} (${qtd(cd.length, 'leilão', 'leilões')})`, valor: v,
        texto: pct2(v), unidade: '%', fonte: fonteCampo(cd, 'desagio', m, 'concorrentes_desagio') });
    }
    if (prog) {
      const doPrograma = part.filter(p => p.ano >= prog.de && p.ano <= prog.ate && p.vencedor);
      const g = rankingGrupos(doPrograma, conc.grupos_alias).filter(r => r.vitorias > 0).length;
      if (g) {
        out.push({ id: 'grupos', rotulo: `Grupos econômicos vencedores em ${periodoAnos(doPrograma.map(p => p.ano))}`, valor: g, texto: f0.format(g),
          unidade: 'grupos', fonte: `vencedor (adjudicatário) pela ${fonteCampo(doPrograma, 'grupo_vencedor', m, 'participantes')}; grupo da época do leilão` });
      }
    }
    return out;
  }

  const ISO = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const dataBR = s => {
    const [y, mo, d] = s.split('-');
    return d ? `${d}/${mo}/${y}` : `${['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][+mo - 1]}/${y}`;
  };
  const LIMITE_APORTE = 18;  // % de deságio a partir do qual a Portaria MT nº 995/2023 exige aporte de recursos vinculados
  const FORA_DO_CALENDARIO = new Set(['cancelado', 'suspenso']);

  function resumoAchados(conc, intel, hoje = new Date()) {
    const out = [];
    const m = (conc && conc.mercado) || {};
    const aliases = (conc && conc.grupos_alias) || [];

    // 1. Concorrência × deságio
    const cdN = arr(m.concorrentes_desagio).filter(x => num(x.desagio) && num(x.n) && x.n >= 1);
    const um = cdN.filter(x => x.n === 1), mais = cdN.filter(x => x.n >= 2);
    if (um.length && mais.length) {
      const a = mediaDesagio(um.map(x => x.desagio)), b = mediaDesagio(mais.map(x => x.desagio));
      out.push({ id: 'concorrencia', titulo: 'Concorrência e deságio',
        texto: `Em ${periodoAnos(cdN.map(x => x.ano))}, ${qtd(um.length, 'leilão', 'leilões')} com um só proponente ${um.length === 1 ? 'teve' : 'tiveram'} deságio médio de ${pct2(a)}; ` +
          `${qtd(mais.length, 'leilão', 'leilões')} com dois ou mais proponentes, ${pct2(b)}. Diferença de ${f1.format(b - a)} pontos percentuais.`,
        formula: 'Média simples do deságio do vencedor, separando os leilões pelo número de proponentes (1 × 2 ou mais). Leilões sem deságio localizado ficam fora.',
        fonte: `${rsPaginas(m, 'concorrentes_desagio')} (número de proponentes); deságio: ${fonteCampo(cdN, 'desagio', m, 'concorrentes_desagio')}` });
    }

    // 2. Leilões acima de 18% (aporte de recursos vinculados)
    const cd = arr(m.concorrentes_desagio).filter(x => num(x.desagio));
    if (cd.length) {
      const acima = cd.filter(x => x.desagio > LIMITE_APORTE).length;
      out.push({ id: 'aporte', titulo: `Deságios acima de ${LIMITE_APORTE}%`,
        texto: `${f0.format(acima)} dos ${qtd(cd.length, 'leilão', 'leilões')} de ${periodoAnos(cd.map(x => x.ano))} com deságio localizado ${acima === 1 ? 'ficou' : 'ficaram'} acima de ${LIMITE_APORTE}% ` +
          `(${pct1(acima / cd.length * 100)}), patamar a partir do qual o vencedor precisa fazer aporte de recursos vinculados, proporcional ao deságio.`,
        formula: `Contagem dos leilões com deságio do vencedor maior que ${LIMITE_APORTE}%, sobre os leilões com deságio localizado.`,
        fonte: `${fonteCampo(cd, 'desagio', m, 'concorrentes_desagio')}; regra do aporte: Portaria MT nº 995/2023 (aba Regulatório)` });
    }

    // 3. Deságios da primeira rodada × programa
    const prog = programa(m);
    const pd = arr(m.participantes).filter(p => num(p.ano) && num(p.desagio_vencedor));
    if (prog) {
      const antes = pd.filter(p => p.ano < prog.de);
      const ano0 = antes.length ? Math.min(...antes.map(p => p.ano)) : null;
      const r0 = antes.filter(p => p.ano === ano0), r1 = pd.filter(p => p.ano >= prog.de && p.ano <= prog.ate);
      if (r0.length && r1.length) {
        const a = mediaDesagio(r0.map(p => p.desagio_vencedor)), b = mediaDesagio(r1.map(p => p.desagio_vencedor));
        const per1 = periodoAnos(r1.map(p => p.ano));
        const t = (r0.length === 1 ? `o leilão de ${ano0} teve deságio de ${pct2(a)}` : `os ${f0.format(r0.length)} leilões de ${ano0} tiveram deságio médio de ${pct2(a)}`) +
          (r1.length === 1 ? `; no leilão de ${per1}, ${pct2(b)}.` : `; nos ${f0.format(r1.length)} leilões de ${per1}, a média foi de ${pct2(b)}.`);
        out.push({ id: 'desagio-historico', titulo: `Deságios de ${ano0} × programa atual`,
          texto: t.charAt(0).toUpperCase() + t.slice(1),
          formula: `Média simples do deságio do vencedor por leilão, no primeiro ano com deságio localizado (${ano0}) e nos anos do programa (a partir de ${prog.de}).`,
          fonte: fonteCampo(r0.concat(r1), 'desagio', m, 'participantes') });
      }
    }

    // 4. Concentração por grupo econômico (vitórias pelo grupo da época)
    const pv = arr(m.participantes).filter(p => num(p.ano) && p.vencedor);
    if (pv.length) {
      const venc = rankingGrupos(pv, aliases).filter(r => r.vitorias > 0).sort((a, b) => b.vitorias - a.vitorias || collator.compare(a.grupo, b.grupo));
      const top = venc.filter(r => r.vitorias > 1);
      if (top.length) {
        const s = top.reduce((x, r) => x + r.vitorias, 0);
        out.push({ id: 'concentracao', titulo: 'Quem mais vence',
          texto: `Os ${qtd(pv.length, 'leilão', 'leilões')} de ${periodoAnos(pv.map(p => p.ano))} tiveram ${venc.length === 1 ? 'um único grupo vencedor' : `${f0.format(venc.length)} grupos vencedores diferentes`}. ` +
            `${lista.format(top.map(r => `${r.grupo} (${r.vitorias})`))} ${top.length === 1 ? 'venceu mais de uma vez e levou' : 'venceram mais de uma vez e, juntos, levaram'} ` +
            `${f0.format(s)} deles (${pct1(s / pv.length * 100)}).`,
          formula: 'Vitórias por grupo econômico, creditadas ao grupo que disputou na época do leilão (vencedor = adjudicatário); participação = soma das vitórias dos grupos com mais de uma vitória ÷ leilões com vencedor.',
          fonte: `${fonteCampo(pv, 'grupo_vencedor', m, 'participantes')}; ranking completo na aba Mercado` });
      }
    }

    // 5. Calendário dos próximos leilões (pipeline)
    const pipe = intel && intel.pipeline;
    if (pipe && Array.isArray(pipe.itens) && pipe.itens.length) {
      const IM = typeof IntelModel !== 'undefined' ? IntelModel : require('./intel-model.js');
      const h = ISO(hoje);
      const rows = IM.linhaDoTempoResumo(conc, pipe, hoje.getFullYear()).rows
        .filter(r => !FORA_DO_CALENDARIO.has(r.status) && r.leilao >= (r.leilao.length === 7 ? h.slice(0, 7) : h));
      if (rows.length) {
        const porAno = new Map();
        rows.forEach(r => porAno.set(r.leilao.slice(0, 4), (porAno.get(r.leilao.slice(0, 4)) || 0) + 1));
        const anos = porAno.size > 1 ? `: ${lista.format([...porAno].map(([a, n]) => `${f0.format(n)} em ${a}`))}` : ` em ${[...porAno.keys()][0]}`;
        const prox = rows[0];
        const nomesFonte = arr(pipe.fonte).map(f => f && f.nome).filter(Boolean);
        out.push({ id: 'calendario', titulo: 'Próximos leilões',
          texto: `A partir de hoje (${dataBR(h)}), o pipeline tem ${qtd(rows.length, 'leilão', 'leilões')} com data${anos}. ` +
            `O próximo é ${prox.nome}, em ${dataBR(prox.leilao)}.`,
          formula: 'Itens do pipeline (federais e estaduais) com data do leilão a partir de hoje: a data da ficha, senão a do cronograma, senão a prevista no pipeline (mês sem dia conta o mês inteiro). Suspensos e cancelados ficam fora.',
          fonte: `Pipeline da aba Projetos${nomesFonte.length ? `: ${nomesFonte.join('; ')}` : ''}` });
      }
    }

    // 6. Opex na carteira do último ano do programa
    if (prog && prog.rows.length > 1 && prog.rows.every(p => num(p.capex) && num(p.opex))) {
      const ult = prog.rows.find(p => p.ano === prog.ate), antes = prog.rows.filter(p => p.ano < prog.ate);
      const tot = ult.capex + ult.opex, capA = antes.reduce((s, p) => s + p.capex, 0), opA = antes.reduce((s, p) => s + p.opex, 0);
      if (tot > 0 && capA + opA > 0) {
        const n = num(ult.leiloes) ? ` (${qtd(ult.leiloes, 'leilão previsto', 'leilões previstos')})` : '';
        out.push({ id: 'opex', titulo: `Opex na carteira de ${prog.ate}`,
          texto: `Na carteira de ${prog.ate}${n}, o opex soma R$ ${f1.format(ult.opex)} bi, ${pct1(ult.opex / tot * 100)} do capex + opex (R$ ${f1.format(tot)} bi). ` +
            `No programa de ${periodoAnos(antes.map(p => p.ano))}, a parcela do opex foi de ${pct1(opA / (capA + opA) * 100)}.`,
          formula: 'Opex ÷ (capex + opex), em R$ bi; o período anterior soma os anos.',
          fonte: rsPaginas(m, 'programa_por_ano') });
      }
    }
    return out;
  }

  return { grupoDe, rsDiverge, rankingGrupos, leiloesSemLista, serieDesagio, mediaDesagio, resumoKpis, resumoAchados };
})();

if (typeof module !== 'undefined') module.exports = LeiloesModel;
