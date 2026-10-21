// Leilões de concessão rodoviária: ranking de grupos econômicos e série de deságio. Puro: sem DOM.
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

  return { grupoDe, rsDiverge, rankingGrupos, leiloesSemLista, serieDesagio, mediaDesagio };
})();

if (typeof module !== 'undefined') module.exports = LeiloesModel;
