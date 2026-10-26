import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const D = require('../src/debentures-model.js');

// Bloco mínimo: dois dias, dois emissores, dois subsetores; um indexador só em um dos lados (DI+ só nas intenções).
const bloco = {
  macro: {
    selic: { valor: 13.75, data: '2026-10-22' }, cdi: { valor: 13.65, data: '2026-10-21' },
    ipca12m: { valor: 4.58, data: '2026-09' }, focus_ipca: { valor: 4.51, data: '2026-10-16' },
    ntnb: [{ vencimento: '2032-08-15', taxa: 6.79, data: '2026-10-15', titulo: 'NTN-B' }, { vencimento: '2029-05-15', taxa: 6.77, data: '2026-10-15', titulo: 'NTN-B' }],
  },
  emissoes: [
    { ticker: 'AAA11', emissor: 'Alfa', subsetor: 'rodovias', grupo: 'G', indexador: 'IPCA+', taxa_emissao: 5.1, vencimento: '2030-01-15', volume_emitido: 450e6, incentivada: true, rating: 'AA', data_emissao: null, coordenador_lider: null },
    { ticker: 'BBB11', emissor: 'Beta', subsetor: 'ferrovias', grupo: null, indexador: 'PRÉ', taxa_emissao: 13.5, vencimento: '2028-02-15', volume_emitido: null, incentivada: false, rating: null, data_emissao: '2020-03-01', coordenador_lider: 'X' },
  ],
  secundario: {
    periodo: { de: '2026-10-01', ate: '2026-10-21' },
    negocios: {
      por_dia: [
        { data: '2026-10-01', volume: 1000, n: 2, taxa_media: { 'IPCA+': 8 }, volume_taxa: { 'IPCA+': 1000 }, spread_medio: 1, volume_spread: 600 },
        { data: '2026-10-02', volume: 500, n: 1, taxa_media: { 'IPCA+': 9 }, volume_taxa: { 'IPCA+': 500 }, spread_medio: null, volume_spread: 0 },
      ],
      por_emissor: [
        { emissor: 'Alfa', subsetor: 'rodovias', grupo: 'G', volume: 1000, n: 2, taxa_media: { 'IPCA+': 8 }, volume_taxa: { 'IPCA+': 1000 }, spread_medio: 1, volume_spread: 600 },
        { emissor: 'Beta', subsetor: 'ferrovias', grupo: null, volume: 500, n: 1, taxa_media: { 'IPCA+': 9 }, volume_taxa: { 'IPCA+': 500 }, spread_medio: null, volume_spread: 0 },
      ],
      por_subsetor: [
        { subsetor: 'rodovias', volume: 1000, n: 2, taxa_media: { 'IPCA+': 8 }, volume_taxa: { 'IPCA+': 1000 }, spread_medio: 1, volume_spread: 600 },
        { subsetor: 'ferrovias', volume: 500, n: 1, taxa_media: { 'IPCA+': 9 }, volume_taxa: { 'IPCA+': 500 }, spread_medio: null, volume_spread: 0 },
      ],
    },
    intencoes: {
      por_dia: [
        { data: '2026-10-01', volume: 3000, n: 4, taxa_media: { 'IPCA+': 7, 'DI+': 0.5 }, volume_taxa: { 'IPCA+': 2000, 'DI+': 1000 }, spread_medio: 2, volume_spread: 1400,
          por_direcao: { compra: { volume: 2000, n: 3 }, venda: { volume: 1000, n: 1 } } },
        { data: '2026-10-05', volume: 400, n: 1, taxa_media: { 'IPCA+': 6 }, volume_taxa: { 'IPCA+': 400 }, spread_medio: null, volume_spread: 0,
          por_direcao: { venda: { volume: 400, n: 1 } } },
      ],
      por_emissor: [
        { emissor: 'Alfa', subsetor: 'rodovias', grupo: 'G', volume: 3000, n: 4, taxa_media: { 'IPCA+': 7, 'DI+': 0.5 }, volume_taxa: { 'IPCA+': 2000, 'DI+': 1000 }, spread_medio: 2, volume_spread: 1400,
          por_direcao: { compra: { volume: 2000, n: 3 }, venda: { volume: 1000, n: 1 } } },
        { emissor: 'Gama', subsetor: 'portos e terminais', grupo: null, volume: 400, n: 1, taxa_media: { 'IPCA+': 6 }, volume_taxa: { 'IPCA+': 400 }, spread_medio: null, volume_spread: 0,
          por_direcao: { venda: { volume: 400, n: 1 } } },
      ],
      por_subsetor: [
        { subsetor: 'rodovias', volume: 3000, n: 4, taxa_media: { 'IPCA+': 7, 'DI+': 0.5 }, volume_taxa: { 'IPCA+': 2000, 'DI+': 1000 }, spread_medio: 2, volume_spread: 1400 },
        { subsetor: 'portos e terminais', volume: 400, n: 1, taxa_media: { 'IPCA+': 6 }, volume_taxa: { 'IPCA+': 400 }, spread_medio: null, volume_spread: 0 },
      ],
      por_direcao: [{ direcao: 'venda', volume: 1400, n: 2 }, { direcao: 'compra', volume: 2000, n: 3 }],
    },
    ultimo_por_ticker: [
      { ticker: 'AAA11', emissor: 'Alfa', subsetor: 'rodovias', indexador: 'IPCA+', vencimento: '2030-01-15', data: '2026-10-02', hora: '10:00', taxa: 8, spread: 1, origem: 'negocio' },
      { ticker: 'AAA11', emissor: 'Alfa', subsetor: 'rodovias', indexador: 'IPCA+', vencimento: '2030-01-15', data: '2026-10-05', hora: '09:00', taxa: 7, spread: null, origem: 'intencao', direcao: 'venda' },
      { ticker: 'BBB11', emissor: 'Beta', subsetor: 'ferrovias', indexador: 'IPCA+', vencimento: '2028-02-15', data: '2026-10-02', hora: '11:00', taxa: 9, spread: null, origem: 'negocio' },
      { ticker: 'BBB11', emissor: 'Beta', subsetor: 'ferrovias', indexador: 'IPCA+', vencimento: '2028-02-15', data: '2026-10-01', hora: '11:00', taxa: 9.5, spread: null, origem: 'intencao', direcao: 'compra' },
      { ticker: 'CCC11', emissor: 'Gama', subsetor: 'portos e terminais', indexador: 'IPCA+', vencimento: '2031-01-15', data: '2026-10-05', hora: '12:00', taxa: 6, spread: null, origem: 'intencao', direcao: 'compra' },
    ],
  },
};

const proximo = (a, b) => Math.abs(a - b) < 1e-9;

test('series sem somar usa só os negócios e diz que são negócios fechados', () => {
  const s = D.series(bloco, { somado: false });
  assert.equal(s.somado, false);
  assert.equal(s.rotulo, 'negócios fechados');
  assert.deepEqual(s.porDia.map(d => [d.data, d.volume, d.n]), [['2026-10-01', 1000, 2], ['2026-10-02', 500, 1]]);
  assert.deepEqual(s.porEmissor.map(e => e.emissor), ['Alfa', 'Beta']);
  assert.deepEqual(s.ultimoPorTicker.map(e => [e.ticker, e.origem]), [['AAA11', 'negocio'], ['BBB11', 'negocio']]);
  assert.deepEqual(D.series(bloco).porDia, s.porDia, 'o padrão é só negócios');
});

test('series somando recombina exatamente as médias pelos pesos e traz o rótulo', () => {
  const s = D.series(bloco, { somado: true });
  assert.equal(s.somado, true);
  assert.equal(s.rotulo, 'negócios + intenções (somados como se fossem negócios)');
  assert.equal(D.ROTULO_SOMADO, s.rotulo);
  const d1 = s.porDia.find(d => d.data === '2026-10-01');
  assert.equal(d1.volume, 4000);
  assert.equal(d1.n, 6);
  // IPCA+: (8·1000 + 7·2000) / 3000; o DI+ só existe nas intenções e fica como está
  assert.ok(proximo(d1.taxa_media['IPCA+'], (8 * 1000 + 7 * 2000) / 3000));
  assert.equal(d1.volume_taxa['IPCA+'], 3000);
  assert.equal(d1.taxa_media['DI+'], 0.5);
  assert.equal(d1.volume_taxa['DI+'], 1000);
  // spread: (1·600 + 2·1400) / 2000
  assert.ok(proximo(d1.spread_medio, (1 * 600 + 2 * 1400) / 2000));
  assert.equal(d1.volume_spread, 2000);
  // dia só de negócios, dia só de intenções e dia sem spread dos dois lados
  assert.deepEqual(s.porDia.map(d => d.data), ['2026-10-01', '2026-10-02', '2026-10-05']);
  assert.equal(s.porDia[1].taxa_media['IPCA+'], 9);
  assert.equal(s.porDia[2].taxa_media['IPCA+'], 6);
  assert.equal(s.porDia[2].spread_medio, null);
  // emissores e subsetores só das intenções entram; a ordem é pelo volume somado
  assert.deepEqual(s.porEmissor.map(e => [e.emissor, e.volume]), [['Alfa', 4000], ['Gama', 400], ['Beta', 500]].sort((a, b) => b[1] - a[1]));
  assert.deepEqual(s.porSubsetor.map(e => e.subsetor), ['rodovias', 'ferrovias', 'portos e terminais']);
  // a média recombinada dos dias é a média recombinada de todo o conjunto
  const k = D.kpis(bloco, { somado: true });
  assert.equal(k.volume, 4900);
  assert.equal(k.n, 8);
  assert.ok(proximo(k.taxaIpca, (8 * 1000 + 9 * 500 + 7 * 2000 + 6 * 400) / 3900));
  assert.ok(proximo(k.spread, (1 * 600 + 2 * 1400) / 2000));
});

test('somar e voltar: sem somar os números são exatamente os dos negócios', () => {
  const antes = JSON.stringify(D.series(bloco, { somado: false }));
  D.series(bloco, { somado: true });
  assert.equal(JSON.stringify(D.series(bloco, { somado: false })), antes);
  assert.equal(JSON.stringify(bloco.secundario.negocios.por_dia[0]), JSON.stringify({ data: '2026-10-01', volume: 1000, n: 2, taxa_media: { 'IPCA+': 8 }, volume_taxa: { 'IPCA+': 1000 }, spread_medio: 1, volume_spread: 600 }), 'o bloco de entrada não muda');
});

test('somado: o último de cada papel é o registro mais recente (negócio vence o empate)', () => {
  const u = D.series(bloco, { somado: true }).ultimoPorTicker;
  assert.deepEqual(u.map(e => [e.ticker, e.origem, e.data]), [['AAA11', 'intencao', '2026-10-05'], ['BBB11', 'negocio', '2026-10-02'], ['CCC11', 'intencao', '2026-10-05']]);
  const t = D.tabelaUltimo(D.series(bloco, { somado: true }));
  assert.deepEqual(t.linhas.map(l => l.tipo), ['Intenção de venda', 'Negócio', 'Intenção de compra']);
});

test('kpis sem somar: totais e taxa por indexador, sem misturar', () => {
  const k = D.kpis(bloco);
  assert.equal(k.volume, 1500);
  assert.equal(k.n, 3);
  assert.equal(k.dias, 2);
  assert.equal(k.emissores, 2);
  assert.ok(proximo(k.taxaIpca, (8 * 1000 + 9 * 500) / 1500));
  assert.deepEqual(Object.keys(k.taxa), ['IPCA+']);
  assert.ok(proximo(k.spread, 1));
  const ks = D.kpis(bloco, { somado: true });
  assert.deepEqual(Object.keys(ks.taxa).sort(), ['DI+', 'IPCA+']);
});

test('sem o bloco ou sem mercado secundário, nada quebra', () => {
  for (const b of [null, undefined, {}, { secundario: {} }]) {
    const s = D.series(b, { somado: true });
    assert.deepEqual([s.porDia, s.porEmissor, s.porSubsetor, s.ultimoPorTicker], [[], [], [], []]);
    const k = D.kpis(b);
    assert.equal(k.volume, 0);
    assert.equal(k.taxaIpca, null);
    assert.equal(k.spread, null);
    assert.deepEqual(D.tabelaEmissoes(b).linhas, []);
    assert.deepEqual(D.macro(b), []);
  }
});

test('intenções à parte: por direção, dia e emissor, sempre só as intenções', () => {
  const i = D.intencoes(bloco);
  assert.deepEqual(i.porDirecao.map(d => d.direcao), ['compra', 'venda']);
  assert.deepEqual(i.porDia.map(d => [d.data, d.compra.volume, d.venda.volume]), [['2026-10-01', 2000, 1000], ['2026-10-05', 0, 400]]);
  assert.deepEqual(i.porEmissor.map(e => [e.emissor, e.compra.volume, e.venda.volume]), [['Alfa', 2000, 1000], ['Gama', 0, 400]]);
});

test('tabelaEmissoes: "—" onde a fonte não traz, incentivada sim/não, coordenador líder em texto', () => {
  const t = D.tabelaEmissoes(bloco);
  const cel = (l, k) => t.colunas.find(c => c.k === k).fmt(l);
  const [a, b] = t.linhas;
  assert.equal(cel(a, 'data_emissao'), '—');
  assert.equal(cel(a, 'coordenador_lider'), '—');
  assert.equal(cel(a, 'incentivada'), 'Sim');
  assert.equal(cel(b, 'incentivada'), 'Não');
  assert.equal(cel(b, 'volume_emitido'), '—');
  assert.equal(cel(b, 'rating'), '—');
  assert.equal(cel(b, 'grupo'), '—');
  assert.equal(cel(b, 'coordenador_lider'), 'X');
  assert.equal(cel(a, 'volume_emitido'), 'R$ 450,00 mi');
  assert.equal(cel(a, 'taxa_emissao'), 'IPCA + 5,10%');
  assert.equal(cel(b, 'taxa_emissao'), 'Prefixada 13,50%');
  assert.equal(cel(a, 'vencimento'), '15/01/2030');
  assert.equal(cel(b, 'data_emissao'), '01/03/2020');
  assert.equal(t.subsetores, undefined, 'a lista de subsetores sobrou sem uso e saiu');
  assert.ok(t.colunas.every(c => t.linhas.every(l => !/NaN|undefined|null/.test(c.fmt(l)))));
});

test('tabelaEmissores: uma taxa por indexador, spread só quando existe', () => {
  const t = D.tabelaEmissores(D.series(bloco, { somado: true }));
  const cel = (l, k) => t.colunas.find(c => c.k === k).fmt(l);
  const alfa = t.linhas.find(l => l.emissor === 'Alfa'), beta = t.linhas.find(l => l.emissor === 'Beta');
  assert.equal(cel(alfa, 'taxa_ipca'), 'IPCA + 7,33%; DI + 0,50%');
  assert.equal(cel(alfa, 'spread_medio'), '1,70 p.p.');
  assert.equal(cel(beta, 'spread_medio'), '—');
  assert.equal(alfa.taxa_ipca, (8 * 1000 + 7 * 2000) / 3000);
});

test('macro, curva de NTN-B e aviso de dias sem curva vêm dos dados', () => {
  const m = D.macro(bloco);
  assert.deepEqual(m.map(x => [x.id, x.valor, x.data]), [['selic', '13,75% a.a.', '22/10/2026'], ['cdi', '13,65% a.a.', '21/10/2026'],
    ['ipca12m', '4,58%', 'set/2026'], ['focus_ipca', '4,51%', '16/10/2026']]);
  assert.deepEqual(D.curvaNtnb(bloco).map(p => p.vencimento), ['2029-05-15', '2032-08-15']);
  assert.equal(D.curvaAte(bloco), '2026-10-15');
  assert.equal(D.notaCurva(bloco), 'A ANBIMA publicou a curva até 15/10/2026: nos negócios dos dias seguintes (até 21/10/2026) o spread aparece como “—”.');
  const completo = JSON.parse(JSON.stringify(bloco));
  completo.secundario.periodo.ate = '2026-10-15';
  assert.equal(D.notaCurva(completo), '');
  // antes do primeiro dia com curva (macro.curva_desde): a nota diz que o spread é "—" e fica fora das médias
  const comInicio = JSON.parse(JSON.stringify(bloco));
  comInicio.macro.curva_desde = '2026-10-14';
  assert.equal(D.notaCurva(comInicio), 'A ANBIMA mantém online só os arquivos recentes: a curva começa em 14/10/2026, e nos negócios e intenções de dias anteriores (desde 01/10/2026) o spread aparece como “—” e fica fora das médias. '
    + D.notaCurva(bloco));
  comInicio.macro.curva_desde = '2026-10-01';                  // a curva cobre o período todo: sem aviso inicial
  assert.equal(D.notaCurva(comInicio), D.notaCurva(bloco));
  assert.equal(D.periodoTexto(bloco.secundario.periodo), '01/10/2026 a 21/10/2026');
});

test('formatação: volumes, percentuais e datas em pt-BR, "—" para vazio', () => {
  assert.equal(D.fmtVolume(184884.04), 'R$ 184,9 mil');
  assert.equal(D.fmtVolume(37.1e6), 'R$ 37,10 mi');
  assert.equal(D.fmtVolume(null), '—');
  assert.equal(D.fmtPct(13.75), '13,75%');
  assert.equal(D.fmtPp(1.2015), '1,20 p.p.');
  assert.equal(D.fmtData('2026-10-01'), '01/10/2026');
  assert.equal(D.fmtDiaMes('2026-10-01'), '01/10');
  assert.equal(D.taxaMediaTexto({ 'PRÉ': 13.5, 'IPCA+': 7.7 }), 'IPCA + 7,70%; Prefixada 13,50%');
  // um vocabulário só para os indexadores; "% DI" é percentual do DI, não soma
  assert.equal(D.taxaTexto('% DI', 105), '105,00% do DI');
  assert.deepEqual(['IPCA+', 'DI+', '% DI', 'PRÉ', 'XYZ'].map(D.rotuloIndexador), ['IPCA+', 'DI+', '% do DI', 'Prefixada', 'XYZ']);
  assert.equal(D.taxaMediaTexto({ '% DI': 105, 'DI+': 1.2 }), 'DI + 1,20%; 105,00% do DI');
  assert.equal(D.taxaMediaTexto({}), '—');
});

test('no bloco real, os totais por dia, emissor e subsetor fecham entre si, somando ou não', { skip: !fs.existsSync(new URL('../data/intel/debentures.json', import.meta.url)) }, () => {
  const real = JSON.parse(fs.readFileSync(new URL('../data/intel/debentures.json', import.meta.url), 'utf8'));
  for (const somado of [false, true]) {
    const s = D.series(real, { somado });
    const soma = (l, k) => l.reduce((t, x) => t + x[k], 0);
    for (const k of ['volume', 'n']) {
      assert.ok(Math.abs(soma(s.porDia, k) - soma(s.porEmissor, k)) < 0.5, `${somado} ${k} dia × emissor`);
      assert.ok(Math.abs(soma(s.porDia, k) - soma(s.porSubsetor, k)) < 0.5, `${somado} ${k} dia × subsetor`);
    }
    const a = D.kpis(real, { somado }).taxaIpca;
    const b = s.porEmissor.reduce((t, x) => t + (D.taxaIpca(x) || 0) * (x.volume_taxa['IPCA+'] || 0), 0) / s.porEmissor.reduce((t, x) => t + (x.volume_taxa['IPCA+'] || 0), 0);
    assert.ok(Math.abs(a - b) < 1e-3,  // as taxas do bloco têm 4 casas
       `${somado}: taxa IPCA+ por dia × por emissor`);
  }
  const puro = D.series(real), soma = D.series(real, { somado: true });
  assert.ok(soma.porDia.reduce((t, x) => t + x.volume, 0) > puro.porDia.reduce((t, x) => t + x.volume, 0));
});

test('tabelaEmissoes: coluna "—" em todos os papéis sai da tabela e volta quando a fonte preenche; "Incentivada" fica', () => {
  const b = JSON.parse(JSON.stringify(bloco));
  b.emissoes.forEach(e => { e.data_emissao = null; e.coordenador_lider = null; e.incentivada = null; });
  const t = D.tabelaEmissoes(b);
  const ks = t.colunas.map(c => c.k);
  assert.ok(!ks.includes('data_emissao') && !ks.includes('coordenador_lider'));
  assert.ok(ks.includes('incentivada'), 'fixa');
  assert.deepEqual(t.ocultas, ['Data de emissão', 'Coordenador líder']);
  b.emissoes[1].coordenador_lider = 'X';
  const t2 = D.tabelaEmissoes(b);
  assert.ok(t2.colunas.some(c => c.k === 'coordenador_lider'));
  assert.deepEqual(t2.ocultas, ['Data de emissão']);
  assert.deepEqual(D.tabelaEmissoes({}).ocultas, []);
});

// Três subsetores: duas rodovias, uma ferrovia, um porto (os "outros transportes" são todo subsetor diferente de rodovias).
const tres = [
  { ticker: 'A1', subsetor: 'rodovias', incentivada: true }, { ticker: 'A2', subsetor: 'rodovias', incentivada: true },
  { ticker: 'B1', subsetor: 'ferrovias', incentivada: true }, { ticker: 'C1', subsetor: 'portos e terminais', incentivada: true },
];

test('contagemSubsetor: todos, rodovias e outros transportes', () => {
  assert.deepEqual(D.contagemSubsetor(tres), { todos: 4, rodovias: 2, outros: 2 });
  assert.deepEqual(D.contagemSubsetor([]), { todos: 0, rodovias: 0, outros: 0 });
  assert.deepEqual(D.contagemSubsetor(undefined), { todos: 0, rodovias: 0, outros: 0 });
});

test('filtrarSubsetor: só rodovias, só os outros, ou todos; não altera a lista de entrada', () => {
  assert.deepEqual(D.filtrarSubsetor(tres, 'rodovias').map(l => l.ticker), ['A1', 'A2']);
  assert.deepEqual(D.filtrarSubsetor(tres, 'outros').map(l => l.ticker), ['B1', 'C1']);
  assert.deepEqual(D.filtrarSubsetor(tres, 'todos').map(l => l.ticker), ['A1', 'A2', 'B1', 'C1']);
  assert.equal(D.filtrarSubsetor(tres, 'xyz').length, 4, 'filtro desconhecido = todos');
  assert.equal(tres.length, 4);
  const c = D.contagemSubsetor(tres);
  for (const f of ['todos', 'rodovias', 'outros']) assert.equal(D.filtrarSubsetor(tres, f).length, c[f]);
});

const papeis = [
  { ticker: 'RDV01', emissor: 'Concessionária Rota Verde', subsetor: 'rodovias' },
  { ticker: 'RDV02', emissor: 'Rodovia do Café S.A.', subsetor: 'rodovias' },
  { ticker: 'MTR11', emissor: 'Metrô Linha Sul', subsetor: 'mobilidade urbana' },
  { ticker: 'PRT21', emissor: 'Porto Açu Operações', subsetor: 'portos e terminais' },
  { ticker: 'SEM01', emissor: null, subsetor: null },
];
const tk = ls => ls.map(l => l.ticker);

test('filtrarLinhas: sem filtro devolve tudo (cópia); subsetor e busca se combinam; "outros" é todo subsetor diferente de rodovias', () => {
  assert.deepEqual(tk(D.filtrarLinhas(papeis)), tk(papeis));
  assert.deepEqual(tk(D.filtrarLinhas(papeis, {})), tk(papeis));
  assert.notEqual(D.filtrarLinhas(papeis), papeis, 'cópia, não a mesma lista');
  assert.deepEqual(tk(D.filtrarLinhas(papeis, { subsetor: 'rodovias' })), ['RDV01', 'RDV02']);
  // inclui o subsetor desconhecido ou ausente, como contagemSubsetor
  assert.deepEqual(tk(D.filtrarLinhas(papeis, { subsetor: 'outros' })), ['MTR11', 'PRT21', 'SEM01']);
  const c = D.contagemSubsetor(papeis);
  for (const f of ['todos', 'rodovias', 'outros']) assert.equal(D.filtrarLinhas(papeis, { subsetor: f }).length, c[f], f);
  // os dois filtros juntos: a interseção, na ordem de entrada
  assert.deepEqual(tk(D.filtrarLinhas(papeis, { subsetor: 'rodovias', busca: 'cafe' })), ['RDV02']);
  assert.deepEqual(tk(D.filtrarLinhas(papeis, { subsetor: 'outros', busca: 'rdv' })), []);
  assert.equal(papeis.length, 5, 'a lista de entrada não muda');
  assert.deepEqual(D.filtrarLinhas(undefined, { busca: 'x' }), []);
});

test('filtrarLinhas: busca por papel ou emissor, sem caixa nem acento ("Metrô" acha "metro"), cada palavra tem de aparecer', () => {
  assert.deepEqual(tk(D.filtrarLinhas(papeis, { busca: 'metro' })), ['MTR11']);
  assert.deepEqual(tk(D.filtrarLinhas(papeis, { busca: 'METRÔ' })), ['MTR11']);
  assert.deepEqual(tk(D.filtrarLinhas(papeis, { busca: 'acu' })), ['PRT21']);
  assert.deepEqual(tk(D.filtrarLinhas(papeis, { busca: 'cafe' })), ['RDV02']);
  assert.deepEqual(tk(D.filtrarLinhas(papeis, { busca: 'rdv0' })), ['RDV01', 'RDV02'], 'pelo papel');
  assert.deepEqual(tk(D.filtrarLinhas(papeis, { busca: 'rota verde' })), ['RDV01']);
  assert.deepEqual(tk(D.filtrarLinhas(papeis, { busca: 'verde rota' })), ['RDV01'], 'a ordem das palavras não importa');
  assert.deepEqual(tk(D.filtrarLinhas(papeis, { busca: '  rota   verde  ' })), ['RDV01'], 'espaços sobrando');
  assert.deepEqual(tk(D.filtrarLinhas(papeis, { busca: '   ' })), tk(papeis), 'só espaços = sem busca');
  assert.deepEqual(tk(D.filtrarLinhas(papeis, { busca: 'inexistente' })), []);
  // a busca não olha o subsetor nem outros campos: "rodovias" só acha quem tem a palavra no papel ou no emissor
  assert.deepEqual(tk(D.filtrarLinhas(papeis, { busca: 'mobilidade' })), []);
  // linha sem emissor ou sem papel não quebra
  assert.equal(D.filtrarLinhas([{ emissor: 'Só Emissor', subsetor: 'rodovias' }], { busca: 'emissor' }).length, 1);
  assert.equal(D.filtrarLinhas(papeis, { busca: 'null' }).length, 0, 'campo ausente não vira o texto "null"');
});

test('tabelaIndices: cada linha traz o subsetor do papel, para o filtro da tabela', () => {
  const t = D.tabelaIndices(bloco, ida, idex);
  assert.deepEqual(t.linhas.map(l => [l.ticker, l.subsetor]), bloco.emissoes.map(e => [e.ticker, e.subsetor]));
  const c = D.contagemSubsetor(t.linhas);
  assert.equal(c.todos, bloco.emissoes.length);
  assert.equal(c.rodovias, bloco.emissoes.filter(e => e.subsetor === 'rodovias').length);
});

test('notaIncentivadas: só incentivadas, ou quantas há de cada tipo', () => {
  assert.equal(D.notaIncentivadas(tres), 'Somente debêntures incentivadas (Lei 12.431): as telas recebidas são de debêntures isentas.');
  const mista = [...tres, { ticker: 'D1', subsetor: 'rodovias', incentivada: false }, { ticker: 'D2', subsetor: 'rodovias', incentivada: false }];
  assert.equal(D.notaIncentivadas(mista), '4 incentivadas (Lei 12.431) e 2 não incentivadas');
  assert.equal(D.notaIncentivadas(bloco.emissoes), '1 incentivada (Lei 12.431) e 1 não incentivada');
  // singular e plural em cada parte
  assert.equal(D.notaIncentivadas([{ incentivada: true }, { incentivada: false }, { incentivada: false }]), '1 incentivada (Lei 12.431) e 2 não incentivadas');
  assert.equal(D.notaIncentivadas([{ incentivada: true }, { incentivada: true }, { incentivada: false }]), '2 incentivadas (Lei 12.431) e 1 não incentivada');
  // informação ausente (null) não conta como "não incentivada": é dita à parte, como a tabela mostra "—"
  assert.equal(D.notaIncentivadas([{ incentivada: true }, { incentivada: null }]), '1 incentivada (Lei 12.431) e 1 sem a informação');
  assert.equal(D.notaIncentivadas([{ incentivada: true }, { incentivada: false }, { incentivada: null }, { incentivada: null }]),
    '1 incentivada (Lei 12.431), 1 não incentivada e 2 sem a informação');
  assert.equal(D.notaIncentivadas([]), '');
});

test('cabeçalhos de spread dizem sobre o quê', () => {
  const s = D.series(bloco);
  assert.ok(D.tabelaEmissores(s).colunas.some(c => c.rotulo === 'Spread médio sobre a NTN-B (IPCA+)'));
  assert.ok(D.tabelaUltimo(s).colunas.some(c => c.rotulo === 'Spread sobre a NTN-B (IPCA+)'));
});

test('fonteCurta: quem forneceu e o período, sem tipo, licença nem nome completo', () => {
  const b = {
    fonte: [
      { nome: 'BTG — tela de debêntures e negócios fechados no mercado secundário', periodo: 'tela de 21/10/2026 a 22/10/2026; negócios de 01/10/2026 a 05/10/2026', tipo: 'medido' },
      { nome: 'XP — tela de debêntures e intenções de compra e venda', periodo: 'tela de 21/10/2026 a 22/10/2026; intenções de 01/10/2026 a 03/10/2026', tipo: 'medido' },
      { nome: 'Banco Central do Brasil — Sistema Gerenciador de Séries Temporais (Selic, CDI e IPCA)', periodo: 'Selic meta: 02/10/2026' },
      { nome: 'ANBIMA — Taxas indicativas dos títulos públicos (NTN-B)', periodo: '01/10/2026 a 02/10/2026' },
    ],
    secundario: { periodo: { de: '2026-10-01', ate: '2026-10-05' } },
    macro: { ntnb: [{ vencimento: '2030-08-15', taxa: 6.1, data: '2026-10-02' }] },
  };
  assert.equal(D.fonteCurta(b, { corretoras: ['BTG', 'XP'], periodo: 'dados' }), 'Corretoras BTG e XP, 01/10/2026 a 05/10/2026');
  assert.equal(D.fonteCurta(b, { corretoras: ['BTG', 'XP'], periodo: 'dados', anbima: true }), 'Corretoras BTG e XP, 01/10/2026 a 05/10/2026; ANBIMA (curva das NTN-B)');
  assert.equal(D.fonteCurta(b, { corretoras: ['XP'], periodo: 'intencoes' }), 'Corretora XP, intenções de 01/10/2026 a 03/10/2026');
  assert.equal(D.fonteCurta(b, { corretoras: ['BTG', 'XP'], periodo: 'tela' }), 'Corretoras BTG e XP, telas de 21/10/2026 a 22/10/2026');
  assert.equal(D.fonteCurta(b, { bcb: true }), 'Banco Central do Brasil');
  assert.equal(D.fonteCurta(b, { anbima: true, curva: true }), 'ANBIMA, curva de 02/10/2026');
  assert.equal(D.fonteCurta({}, { corretoras: ['XP'], bcb: true }), '—');
});

// Dispersão spread × duration: cinco pontos em quatro subsetores, dois deles declarados fora de ordem; dois IPCA+ ficaram de fora.
const ponto = (ticker, subsetor, d, taxa, spread) => ({ ticker, emissor: `Emissor ${ticker}`, subsetor, duration_anos: d, taxa_indicativa: taxa, spread });
const blocoDisp = {
  fonte: [{ nome: 'BTG — tela de debêntures e negócios fechados no mercado secundário', periodo: 'tela de 22/10/2026; negócios de 01/10/2026 a 05/10/2026' },
    { nome: 'XP — tela de debêntures e intenções de compra e venda', periodo: 'tela de 22/10/2026; intenções de 01/10/2026 a 03/10/2026' }],
  emissoes: [
    { ticker: 'R1', subsetor: 'rodovias', indexador: 'IPCA+' }, { ticker: 'R2', subsetor: 'rodovias', indexador: 'IPCA+' }, { ticker: 'R3', subsetor: 'rodovias', indexador: 'IPCA+' },
    { ticker: 'P1', subsetor: 'portos e terminais', indexador: 'IPCA+' }, { ticker: 'F1', subsetor: 'ferrovias', indexador: 'IPCA+' }, { ticker: 'F2', subsetor: 'ferrovias', indexador: 'IPCA+' },
    { ticker: 'A1', subsetor: 'aeroportos', indexador: 'IPCA+' }, { ticker: 'X1', subsetor: 'ferrovias', indexador: 'DI+' }],
  dispersao: { data: '2026-10-22', excluidos: 2, pontos: [
    ponto('P1', 'portos e terminais', 3.5, 7.1, 0.9), ponto('R1', 'rodovias', 6.21, 7.4306, 1.2345), ponto('A1', 'aeroportos', 5, 7.9, 1.6),
    ponto('R2', 'rodovias', 4.2, 6.9, -0.1), ponto('F1', 'ferrovias', 9.8, 8.2, 1.75)] },
};

test('dispersao: todos os pontos, subsetores na ordem fixa (não na ordem em que aparecem) e dica com ticker, emissor, duration, taxa e spread', () => {
  const d = D.dispersao(blocoDisp, 'todos');
  assert.equal(d.pontos.length, 5);
  assert.deepEqual(d.subsetores, ['rodovias', 'ferrovias', 'portos e terminais', 'aeroportos']);
  assert.deepEqual(D.dispersao(blocoDisp).subsetores, d.subsetores, 'o padrão é "todos"');
  const r1 = d.pontos.find(p => p.ticker === 'R1');
  assert.equal(r1.dica, 'R1 — Emissor R1 · duration 6,21 anos · taxa 7,43% · spread 1,23 p.p.');
  assert.equal(d.pontos.find(p => p.ticker === 'R2').dica, 'R2 — Emissor R2 · duration 4,20 anos · taxa 6,90% · spread -0,10 p.p.');
  assert.equal(r1.spread, 1.2345, 'os números do bloco seguem como vieram: o arredondamento é só do texto');
});

test('dispersao: o filtro de subsetor da tabela reduz os pontos e a legenda', () => {
  const rod = D.dispersao(blocoDisp, 'rodovias'), out = D.dispersao(blocoDisp, 'outros');
  assert.deepEqual(rod.pontos.map(p => p.ticker).sort(), ['R1', 'R2']);
  assert.deepEqual(rod.subsetores, ['rodovias']);
  assert.deepEqual(out.pontos.map(p => p.ticker).sort(), ['A1', 'F1', 'P1']);
  assert.deepEqual(out.subsetores, ['ferrovias', 'portos e terminais', 'aeroportos']);
  // a mesma regra da tabela: o que o filtro deixa nas emissões é o que o gráfico mostra
  for (const f of ['todos', 'rodovias', 'outros']) {
    const nas = new Set(D.filtrarSubsetor(blocoDisp.emissoes, f).map(e => e.ticker));
    assert.deepEqual(D.dispersao(blocoDisp, f).pontos.map(p => p.ticker).sort(), blocoDisp.dispersao.pontos.map(p => p.ticker).filter(t => nas.has(t)).sort(), f);
  }
  assert.equal(blocoDisp.dispersao.pontos.length, 5, 'o bloco não é alterado');
});

test('dispersao: a nota diz quantos papéis ficaram de fora (no filtro escolhido) e some quando nenhum ficou', () => {
  // dois IPCA+ ficaram de fora: R3 (rodovias) e F2 (ferrovias)
  assert.equal(D.dispersao(blocoDisp, 'todos').nota, '2 papéis sem duration, taxa ou curva do dia ficaram de fora');
  assert.equal(D.dispersao(blocoDisp, 'rodovias').nota, '1 papel sem duration, taxa ou curva do dia ficou de fora');
  assert.equal(D.dispersao(blocoDisp, 'outros').nota, '1 papel sem duration, taxa ou curva do dia ficou de fora');
  const sem = JSON.parse(JSON.stringify(blocoDisp));
  sem.dispersao.excluidos = 0;
  sem.emissoes = sem.emissoes.filter(e => e.ticker !== 'R3' && e.ticker !== 'F2');
  for (const f of ['todos', 'rodovias', 'outros']) assert.equal(D.dispersao(sem, f).nota, '');
  // sem a lista de emissões, vale o número do bloco
  delete sem.emissoes;
  sem.dispersao.excluidos = 3;
  assert.equal(D.dispersao(sem, 'rodovias').nota, '3 papéis sem duration, taxa ou curva do dia ficaram de fora');
});

test('dispersao: bloco ausente, vazio ou com ponto inválido não quebra nem entra no gráfico', () => {
  for (const b of [undefined, null, {}, { dispersao: null }, { dispersao: { pontos: [] } }]) {
    assert.deepEqual(D.dispersao(b, 'todos'), { pontos: [], subsetores: [], nota: '', data: null });
  }
  const ruim = { dispersao: { data: '2026-10-22', excluidos: 0, pontos: [ponto('A', 'rodovias', 4, 7, 1), ponto('B', 'rodovias', null, 7, 1), ponto('C', 'rodovias', 4, 7, NaN), ponto('D', 'rodovias', 4, 7, null)] } };
  assert.deepEqual(D.dispersao(ruim).pontos.map(p => p.ticker), ['A']);
});

test('dispersao: a data e a fonte vêm dos dados', () => {
  assert.equal(D.dispersao(blocoDisp).data, '2026-10-22');
  assert.equal(D.fonteDispersao(blocoDisp), 'Corretoras BTG e XP, telas de 22/10/2026; ANBIMA, taxas indicativas das NTN-B de 22/10/2026');
  assert.equal(D.fonteDispersao({}), '—');
});

test('filtros de subsetor: uma só lista de [id, rótulo], na ordem da tela', () => {
  assert.deepEqual(D.FILTROS_SUBSETOR, [['todos', 'Todos'], ['rodovias', 'Rodovias'], ['outros', 'Outros transportes']]);
  assert.deepEqual(D.FILTROS_SUBSETOR.map(f => f[0]), Object.keys(D.contagemSubsetor(tres)));
});

// ---------- IDA e IDEX-Infra (blocos sintéticos) ----------
const ida = {
  fonte: [{ nome: 'ANBIMA — Índice de Debêntures ANBIMA (IDA), resultado diário', periodo: '01/10/2026 a 05/10/2026' }],
  indices: {
    DI: { nome: 'IDA-DI', serie: [{ data: '2026-10-01', numero_indice: 4000 }, { data: '2026-10-02', numero_indice: 4040 }],
      ultimo: { data: '2026-10-02', var_mes: 0.5, var_ano: 1.5, var_12m: 2.5, var_24m: 3.5 } },
    IPCA_INFRAESTRUTURA: { nome: 'IDA-IPCA Infraestrutura',
      serie: [{ data: '2026-10-02', numero_indice: 2020, spread_medio: 1.6 }, { data: '2026-10-01', numero_indice: 2000, base100: 100, spread_medio: 1.5 },
        { data: '2026-10-05', numero_indice: 2040, spread_medio: null }],
      ultimo: { data: '2026-10-05', var_mes: 1, var_ano: 2, var_12m: 8.8, var_24m: 4 } },
  },
  papeis: { AAA11: { taxa_indicativa: 7.5, spread: null, data: '2026-10-05' } },
};
const idex = {
  fonte: [{ nome: 'IDEX Analytics — IDEX-Infra (arquivos fornecidos ao projeto)' }],
  spread: [{ data: '2026-10-01', spread_medio_bps: 150, duration_media: 5.3, n_papeis: 10 }, { data: '2026-10-02', spread_medio_bps: 160, duration_media: 5.3, n_papeis: 10 },
    { data: '2026-10-05', spread_medio_bps: 170, duration_media: 5.2, n_papeis: 10 }],
  retornos: {
    'Idex-Infra Core': [{ mes: '2026-01', pct: 0.5 }, { mes: '2026-02', pct: 0.5 }],
    'Idex-Infra Geral': [{ mes: '2026-02', pct: 2 }, { mes: '2026-01', pct: 1 }, { mes: '2026-03', pct: -1 }],
  },
  acumulado_12m: { 'Idex-Infra Geral': 7.75, 'Idex-Infra Core': 6.26 },
  papeis: { AAA11: { spread_bps: 120, data: '2026-10-05' }, CCC11: { spread_bps: 80, data: '2026-10-05' } },
};

test('evolucaoIda: número-índice na base 100 do primeiro dia, subíndices na ordem da tela, dias em ordem', () => {
  const ev = D.evolucaoIda(ida);
  assert.deepEqual(ev.map(s => s.nome), ['IDA-IPCA Infraestrutura', 'IDA-DI']);
  assert.deepEqual(ev[0].pontos.map(p => p.data), ['2026-10-01', '2026-10-02', '2026-10-05']);
  assert.deepEqual(ev[0].pontos.map(p => +p.base100.toFixed(6)), [100, 101, 102]);
  assert.deepEqual(ev[1].pontos.map(p => +p.base100.toFixed(6)), [100, 101]);
  assert.deepEqual(D.evolucaoIda(undefined), []);
  assert.deepEqual(D.evolucaoIda({ indices: {} }), []);
});

test('variacoesIda: as variações publicadas no último dia de cada subíndice', () => {
  assert.deepEqual(D.variacoesIda(ida), [
    { chave: 'IPCA_INFRAESTRUTURA', nome: 'IDA-IPCA Infraestrutura', data: '2026-10-05', var_mes: 1, var_ano: 2, var_12m: 8.8, var_24m: 4 },
    { chave: 'DI', nome: 'IDA-DI', data: '2026-10-02', var_mes: 0.5, var_ano: 1.5, var_12m: 2.5, var_24m: 3.5 }]);
  assert.deepEqual(D.variacoesIda(undefined), []);
  assert.deepEqual(D.periodoIda(ida), { de: '2026-10-01', ate: '2026-10-05', dias: 3 });
  assert.equal(D.periodoIda(undefined), null);
});

test('retornosIdex: retorno composto desde o primeiro mês (1% e 2% dão 3,02%, não 3%)', () => {
  const r = D.retornosIdex(idex);
  assert.deepEqual(r.map(s => s.nome), ['IDEX-Infra Geral', 'IDEX-Infra Core']);
  assert.deepEqual(r[0].pontos.map(p => p.mes), ['2026-01', '2026-02', '2026-03']);
  assert.ok(proximo(r[0].pontos[0].acumulado_pct, 1));
  assert.ok(proximo(r[0].pontos[1].acumulado_pct, 3.02), String(r[0].pontos[1].acumulado_pct));
  assert.ok(proximo(r[0].pontos[2].acumulado_pct, (1.01 * 1.02 * 0.99 - 1) * 100));
  assert.ok(proximo(r[1].pontos[1].acumulado_pct, (1.005 * 1.005 - 1) * 100));
  assert.deepEqual(D.retornosIdex(undefined), []);
});

test('spreadIdex: pontos-base viram p.p. (÷ 100)', () => {
  assert.deepEqual(D.spreadIdex(idex).map(d => [d.data, d.spread_pp]), [['2026-10-01', 1.5], ['2026-10-02', 1.6], ['2026-10-05', 1.7]]);
  assert.deepEqual(D.spreadIdex(undefined), []);
});

test('comparacaoRetorno12m: cada número traz a sua janela; janelas que terminam em datas diferentes são avisadas', () => {
  const c = D.comparacaoRetorno12m(ida, idex);
  assert.deepEqual(c.map(x => [x.rotulo, x.pct]), [['IDA-IPCA Infraestrutura', 8.8], ['IDEX-Infra Geral', 7.75]]);
  assert.deepEqual(c.map(x => x.janela), ['IDA-IPCA Infraestrutura — 12 meses até 05/10/2026', 'IDEX-Infra Geral — 12 meses até mar/2026']);
  assert.deepEqual(c.map(x => x.ate), ['2026-10-05', '2026-03-31'], 'o mês vale até o último dia');
  assert.match(c[0].origem, /ANBIMA/);
  assert.match(c[1].origem, /relatório mensal/);
  assert.equal(D.janelasDiferentes(c), true);
  // mesma data final nos dois: sem aviso (IDEX em fevereiro, IDA em 28/02)
  const igual = D.comparacaoRetorno12m({ indices: { IPCA_INFRAESTRUTURA: { ultimo: { data: '2026-03-31', var_12m: 5 } } } }, idex);
  assert.equal(D.janelasDiferentes(igual), false);
  assert.equal(D.janelasDiferentes(D.comparacaoRetorno12m(ida, undefined)), false, 'uma janela só: nada a comparar');
  assert.deepEqual(D.comparacaoRetorno12m(ida, undefined).map(x => x.rotulo), ['IDA-IPCA Infraestrutura']);
  assert.deepEqual(D.comparacaoRetorno12m(undefined, undefined), []);
});

test('avisosIdex: ano que não fecha vira uma frase, só quando o ano está na janela de 12 meses ou no gráfico acumulado', () => {
  const av = (nome, ano) => ({ tipo: 'reconciliacao', nome, ano, produto: 3.5, acumulado_impresso: 2.25, relatorio: '2026-03' });
  const com = { ...idex, avisos: [av('Idex-Infra Geral', '2026'), av('Idex-Infra Core', '2026'), av('Idex-Infra Geral', '2019')] };
  const frase = nome => `O relatório de mar/2026 imprime acumulado de 2,25% em 2026 (${nome}), mas os retornos mensais compõem 3,50%; os valores são mostrados como publicados.`;
  assert.deepEqual(D.avisosIdex(com, 'serie').map(a => a.texto), [frase('IDEX-Infra Geral'), frase('IDEX-Infra Core')], '2019 não tem retorno no gráfico');
  assert.deepEqual(D.avisosIdex(com, '12m').map(a => a.texto), [frase('IDEX-Infra Geral')], 'o cartão de 12 meses é só do Geral');
  // ano fora dos 12 meses do cartão (série longa): aparece no gráfico, não no cartão
  const longa = { ...com, retornos: { 'Idex-Infra Geral': Array.from({ length: 30 }, (_, k) => ({ mes: `${2024 + Math.floor(k / 12)}-${String(k % 12 + 1).padStart(2, '0')}`, pct: 1 })) },
    avisos: [av('Idex-Infra Geral', '2024')] };
  assert.equal(D.avisosIdex(longa, 'serie').length, 1);
  assert.deepEqual(D.avisosIdex(longa, '12m'), []);
  assert.deepEqual(D.avisosIdex(idex, 'serie'), [], 'sem avisos no bloco: nada');
  assert.deepEqual(D.avisosIdex(undefined, '12m'), []);
});

test('lacunas do IDA: dia útil sem ponto no trecho diário interrompe a linha; antes disso (série semanal) não', () => {
  const dia = (d, v) => ({ data: d, numero_indice: v });
  const serie = [dia('2026-08-07', 100), dia('2026-08-14', 101), dia('2026-09-30', 102), dia('2026-10-01', 103), dia('2026-10-05', 104), dia('2026-10-06', 105)];
  const g = { indices: { GERAL: { serie } } };
  const pts = D.evolucaoIda(g)[0].pontos;
  // 01/10 (qui) -> 05/10 (seg): sexta 02/10 falta; fim de semana não conta; 30/09 -> 01/10 e 05 -> 06 seguidos
  assert.deepEqual(pts.map(p => !!p.quebra), [false, false, false, false, true, false]);
  assert.deepEqual(D.lacunasIda(g), ['2026-10-02']);
  assert.deepEqual(D.lacunasIda(ida), [], 'a série de teste não tem dia útil faltando');
  assert.deepEqual(D.lacunasIda(undefined), []);
  assert.equal(D.evolucaoIda(ida)[0].pontos.some(p => p.quebra), false);
});

test('cobertura de cada série, para os títulos dos gráficos', () => {
  assert.equal(D.coberturaIda(ida), '3 dias, de 01/10 a 05/10/2026');
  assert.deepEqual(D.coberturaIdex(idex), { spread: '3 dias, de 01/10 a 05/10/2026', retornos: '3 meses, de jan/2026 a mar/2026' });
  assert.equal(D.coberturaIda(undefined), '');
  assert.deepEqual(D.coberturaIdex(undefined), { spread: '', retornos: '' });
  assert.equal(D.coberturaIda({ indices: { X: { serie: [{ data: '2026-10-01', numero_indice: 1 }] } } }), '1 dia, de 01/10 a 01/10/2026');
});

test('comparacaoSpread: três linhas, último dia com valor de cada uma, IDEX em p.p., média nos dias em comum', () => {
  const c = D.comparacaoSpread(bloco, ida, idex);
  assert.deepEqual(c.map(x => x.rotulo), ['Debêntures de transporte (negócios)', 'IDA-IPCA Infraestrutura', 'IDEX-Infra Geral']);
  assert.deepEqual(c.map(x => x.rotulo_curto), ['Transporte (negócios)', 'IDA-IPCA Infraestrutura', 'IDEX-Infra Geral']);
  // cada série no seu último dia com valor: o dia sem spread (sem curva) não conta
  assert.deepEqual(c.map(x => [x.spread_pp, x.data, x.periodo]), [[1, '2026-10-01', '01/10/2026'], [1.6, '2026-10-02', '02/10/2026'], [1.7, '2026-10-05', '05/10/2026']]);
  assert.deepEqual(c.map(x => x.ate), ['2026-10-02', '2026-10-05', '2026-10-05']);
  // dias em comum às três: só 01/10; média simples nesses dias
  assert.deepEqual(c.map(x => [x.dias_comuns, x.periodo_comum, x.media_comum_pp]), [[1, '01/10/2026', 1], [1, '01/10/2026', 1.5], [1, '01/10/2026', 1.5]]);
  const comFonte = Object.assign({}, bloco, { fonte: [{ nome: 'BTG — tela de debêntures' }, { nome: 'XP — tela de debêntures' }] });
  assert.equal(D.comparacaoSpread(comFonte, ida, idex)[0].fonte, 'Corretoras BTG e XP, 01/10/2026 a 21/10/2026');
  assert.equal(c[1].fonte, 'ANBIMA, resultado diário do IDA, 01/10/2026 a 05/10/2026');
});

test('comparacaoSpread: com "somado" o rótulo e o valor do transporte mudam; as outras duas linhas não', () => {
  const n = D.comparacaoSpread(bloco, ida, idex), s = D.comparacaoSpread(bloco, ida, idex, { somado: true });
  assert.equal(s[0].rotulo, 'Debêntures de transporte (negócios + intenções)');
  assert.equal(s[0].rotulo_curto, 'Transporte + intenções', 'o sufixo "+ intenções" cabe na tela estreita');
  assert.ok(proximo(s[0].spread_pp, D.series(bloco, { somado: true }).porDia[0].spread_medio));
  assert.ok(proximo(s[0].spread_pp, 1.7));
  assert.notEqual(s[0].spread_pp, n[0].spread_pp);
  // IDA e IDEX têm os mesmos valores do último dia; só a média nos dias em comum pode mudar (as intenções podem trazer dias em comum)
  assert.deepEqual(s.slice(1).map(x => [x.spread_pp, x.data]), n.slice(1).map(x => [x.spread_pp, x.data]));
});

test('comparacaoSpread: sem dias em comum não há média; série ausente fica sem valor, sem quebrar', () => {
  const outroDia = Object.assign({}, idex, { spread: [{ data: '2026-10-09', spread_medio_bps: 190 }] });
  const c = D.comparacaoSpread(bloco, ida, outroDia);
  assert.deepEqual(c.map(x => [x.dias_comuns, x.periodo_comum, x.media_comum_pp]), [[0, '', null], [0, '', null], [0, '', null]]);
  assert.equal(c[2].spread_pp, 1.9);
  const sem = D.comparacaoSpread(bloco, ida, undefined);
  assert.equal(sem.length, 3);
  assert.deepEqual([sem[2].spread_pp, sem[2].data, sem[2].periodo, sem[2].fonte], [null, null, '', '—']);
  assert.equal(sem[2].dias_comuns, 0);
  const nada = D.comparacaoSpread(undefined, undefined, undefined);
  assert.deepEqual(nada.map(x => x.spread_pp), [null, null, null]);
});

test('tabelaIndicesPorPapel: papel fora de um índice fica com null; spread do painel é o do último negócio', () => {
  const t = D.tabelaIndicesPorPapel(bloco, ida, idex);
  assert.deepEqual(t.map(l => l.ticker), ['AAA11', 'BBB11']);
  assert.deepEqual(Object.keys(t[0]), ['ticker', 'emissor', 'spread_painel', 'taxa_anbima', 'spread_idex_pp']);
  assert.deepEqual(t[0], { ticker: 'AAA11', emissor: 'Alfa', spread_painel: 1, taxa_anbima: 7.5, spread_idex_pp: 1.2 });
  // BBB11 não está em nenhum dos dois índices (CCC11 está no IDEX, mas não é papel da tabela de emissões)
  assert.deepEqual(t[1], { ticker: 'BBB11', emissor: 'Beta', spread_painel: null, taxa_anbima: null, spread_idex_pp: null });
  const semIdex = D.tabelaIndicesPorPapel(bloco, ida, undefined);
  assert.deepEqual(semIdex.map(l => l.spread_idex_pp), [null, null]);
  assert.equal(semIdex[0].taxa_anbima, 7.5);
  assert.deepEqual(D.tabelaIndicesPorPapel(undefined, ida, idex), []);
});

test('tabelaIndices: "—" onde o papel está fora do índice, taxa escrita pelo indexador, data do índice no cabeçalho', () => {
  const t = D.tabelaIndices(bloco, ida, idex);
  const cel = (l, k) => t.colunas.find(c => c.k === k).fmt(l);
  assert.deepEqual(t.colunas.map(c => c.k), ['ticker', 'emissor', 'spread_painel', 'taxa_anbima', 'spread_idex_pp']);
  assert.deepEqual([cel(t.linhas[0], 'spread_painel'), cel(t.linhas[0], 'taxa_anbima'), cel(t.linhas[0], 'spread_idex_pp')], ['1,00', 'IPCA + 7,50%', '1,20']);
  assert.deepEqual([cel(t.linhas[1], 'spread_painel'), cel(t.linhas[1], 'taxa_anbima'), cel(t.linhas[1], 'spread_idex_pp')], ['—', '—', '—']);
  // cabeçalhos curtos (a unidade entre parênteses) e as datas dos índices à parte
  assert.deepEqual(t.colunas.map(c => c.rotulo), ['Papel', 'Emissor', 'Spread painel (p.p.)', 'Taxa ANBIMA (%)', 'Spread IDEX (p.p.)']);
  assert.deepEqual(t.datas, { anbima: '2026-10-05', idex: '2026-10-05' });
  const sem = D.tabelaIndices(bloco, undefined, undefined);
  assert.deepEqual(sem.datas, { anbima: null, idex: null });
  assert.ok(sem.linhas.every(l => sem.colunas.every(c => !/NaN|undefined|null/.test(c.fmt(l)))));
});

test('fonteIda e fonteIdex: quem forneceu e o período, tirados dos blocos', () => {
  assert.equal(D.fonteIda(ida), 'ANBIMA, resultado diário do IDA, 01/10/2026 a 05/10/2026');
  assert.equal(D.fonteIdex(idex), 'IDEX Analytics, planilha de dados de 01/10/2026 a 05/10/2026; relatório mensal de jan/2026 a mar/2026');
  assert.equal(D.fonteIdex(idex, 'spread'), 'IDEX Analytics, planilha de dados de 01/10/2026 a 05/10/2026');
  assert.equal(D.fonteIdex(idex, 'retornos'), 'IDEX Analytics, relatório mensal de jan/2026 a mar/2026');
  assert.equal(D.fonteIda(undefined), '—');
  assert.equal(D.fonteIdex(undefined), '—');
});

test('nos blocos reais, os índices são lidos sem NaN e o IDEX vem em p.p.', { skip: !fs.existsSync(new URL('../data/intel/idex.json', import.meta.url)) || !fs.existsSync(new URL('../data/intel/ida.json', import.meta.url)) }, () => {
  const lê = n => JSON.parse(fs.readFileSync(new URL(`../data/intel/${n}.json`, import.meta.url), 'utf8'));
  const b = lê('debentures'), i = lê('ida'), x = lê('idex');
  const c = D.comparacaoSpread(b, i, x);
  assert.equal(c.length, 3);
  assert.ok(proximo(c[2].spread_pp, x.spread[x.spread.length - 1].spread_medio_bps / 100));
  assert.doesNotMatch(JSON.stringify([c, D.evolucaoIda(i), D.retornosIdex(x), D.tabelaIndicesPorPapel(b, i, x), D.variacoesIda(i)]), /NaN|undefined/);
  assert.equal(D.tabelaIndicesPorPapel(b, i, x).length, b.emissoes.length);
});
