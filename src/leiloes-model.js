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
    const ini = Date.UTC(y, 0, 1), dia = (Date.UTC(y, mo - 1, d) - ini) / 864e5, total = (Date.UTC(y + 1, 0, 1) - ini) / 864e5;
    return y + dia / total;
  }

  // Deságio do vencedor por leilão: x = ano decimal da data (ou meio do ano), tipo = fonte do deságio,
  // limitado = deságio travado pelo teto do edital (critério híbrido). Exclui deságio nulo.
  function serieDesagio(participantes) {
    return (participantes || []).filter(p => num(p.desagio_vencedor)).map(p => {
      const d = (p.verif || {}).desagio || {};
      return { x: anoDecimal(p.data) ?? p.ano + 0.5, y: p.desagio_vencedor, label: `${p.lote} · ${p.vencedor}`,
        tipo: d.tipo || 'roadshow', limitado: d.limitado_pelo_edital === true };
    });
  }

  function mediaDesagio(valores) {
    const v = (valores || []).filter(num);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  }

  return { grupoDe, rankingGrupos, leiloesSemLista, serieDesagio, mediaDesagio };
})();

if (typeof module !== 'undefined') module.exports = LeiloesModel;
