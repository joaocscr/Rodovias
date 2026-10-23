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
    ntnb: [{ vencimento: '2032-08-15', taxa: 6.79, data: '2026-10-15', titulo: 'NTN-B' }, { vencimento: '2029-05-15', taxa: 6.77, data: '2026-10-15', titulo: 'NTN-B Principal' }],
  },
  emissoes: [
    { ticker: 'AAA11', emissor: 'Alfa', subsetor: 'rodovias', grupo: 'G', indexador: 'IPCA+', taxa_emissao: 5.1, vencimento: '2030-01-15', volume_emitido: 450e6, incentivada: true, rating: 'AA', data_emissao: null, coordenadores: null },
    { ticker: 'BBB11', emissor: 'Beta', subsetor: 'ferrovias', grupo: null, indexador: 'PRÉ', taxa_emissao: 13.5, vencimento: '2028-02-15', volume_emitido: null, incentivada: false, rating: null, data_emissao: '2020-03-01', coordenadores: ['X', 'Y'] },
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

test('tabelaEmissoes: "—" onde a fonte não traz, incentivada sim/não, coordenadores em texto', () => {
  const t = D.tabelaEmissoes(bloco);
  const cel = (l, k) => t.colunas.find(c => c.k === k).fmt(l);
  const [a, b] = t.linhas;
  assert.equal(cel(a, 'data_emissao'), '—');
  assert.equal(cel(a, 'coordenadores'), '—');
  assert.equal(cel(a, 'incentivada'), 'Sim');
  assert.equal(cel(b, 'incentivada'), 'Não');
  assert.equal(cel(b, 'volume_emitido'), '—');
  assert.equal(cel(b, 'rating'), '—');
  assert.equal(cel(b, 'grupo'), '—');
  assert.equal(cel(b, 'coordenadores'), 'X, Y');
  assert.equal(cel(a, 'volume_emitido'), 'R$ 450,00 mi');
  assert.equal(cel(a, 'taxa_emissao'), 'IPCA + 5,10%');
  assert.equal(cel(b, 'taxa_emissao'), 'Prefixada 13,50%');
  assert.equal(cel(a, 'vencimento'), '15/01/2030');
  assert.equal(cel(b, 'data_emissao'), '01/03/2020');
  assert.deepEqual(t.subsetores, ['ferrovias', 'rodovias']);
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
  assert.equal(D.notaCurva(bloco), 'O Tesouro Nacional publicou a curva até 15/10/2026: nos negócios dos dias seguintes (até 21/10/2026) o spread aparece como “—”.');
  const completo = JSON.parse(JSON.stringify(bloco));
  completo.secundario.periodo.ate = '2026-10-15';
  assert.equal(D.notaCurva(completo), '');
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
  b.emissoes.forEach(e => { e.data_emissao = null; e.coordenadores = null; e.incentivada = null; });
  const t = D.tabelaEmissoes(b);
  const ks = t.colunas.map(c => c.k);
  assert.ok(!ks.includes('data_emissao') && !ks.includes('coordenadores'));
  assert.ok(ks.includes('incentivada'), 'fixa');
  assert.deepEqual(t.ocultas, ['Data de emissão', 'Coordenadores']);
  b.emissoes[1].coordenadores = ['X'];
  const t2 = D.tabelaEmissoes(b);
  assert.ok(t2.colunas.some(c => c.k === 'coordenadores'));
  assert.deepEqual(t2.ocultas, ['Data de emissão']);
  assert.deepEqual(D.tabelaEmissoes({}).ocultas, []);
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
      { nome: 'Tesouro Nacional — Taxas dos títulos ofertados pelo Tesouro Direto (NTN-B)', periodo: '01/10/2026 a 02/10/2026' },
    ],
    secundario: { periodo: { de: '2026-10-01', ate: '2026-10-05' } },
    macro: { ntnb: [{ vencimento: '2030-08-15', taxa: 6.1, data: '2026-10-02' }] },
  };
  assert.equal(D.fonteCurta(b, { corretoras: ['BTG', 'XP'], periodo: 'dados' }), 'Corretoras BTG e XP, 01/10/2026 a 05/10/2026');
  assert.equal(D.fonteCurta(b, { corretoras: ['BTG', 'XP'], periodo: 'dados', tesouro: true }), 'Corretoras BTG e XP, 01/10/2026 a 05/10/2026; Tesouro Nacional (curva das NTN-B)');
  assert.equal(D.fonteCurta(b, { corretoras: ['XP'], periodo: 'intencoes' }), 'Corretora XP, intenções de 01/10/2026 a 03/10/2026');
  assert.equal(D.fonteCurta(b, { corretoras: ['BTG', 'XP'], periodo: 'tela' }), 'Corretoras BTG e XP, telas de 21/10/2026 a 22/10/2026');
  assert.equal(D.fonteCurta(b, { bcb: true }), 'Banco Central do Brasil');
  assert.equal(D.fonteCurta(b, { tesouro: true, curva: true }), 'Tesouro Nacional, curva de 02/10/2026');
  assert.equal(D.fonteCurta({}, { corretoras: ['XP'], bcb: true }), '—');
});
