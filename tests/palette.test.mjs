// Paleta de dados (v3.1, spec §4): roda o validador do método dataviz (scripts/validate_palette.js) sobre os tokens de src/styles-map.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { validate, validateOrdinal, contrast } from '../scripts/validate_palette.js';

const S = createRequire(import.meta.url)('../src/styles-map.js');
const SURFACE = '#F7F7F8'; // fundo do mapa (Snow White)
const state = (r, name) => r.report.find(x => x[0] === name)[1];
const HEX = /^#[0-9a-f]{6}$/i;

test('DATA: 8 slots na ordem validada; validador adjacente sem FAIL', () => {
  assert.deepEqual(S.DATA_SLOTS, ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948']);
  const r = validate(S.DATA_SLOTS, { mode: 'light', surface: SURFACE });
  assert.ok(r.ok, JSON.stringify(r.report));
  assert.equal(state(r, 'CVD separation'), 'pass');
  assert.equal(state(r, 'Normal-vision floor'), 'pass');
});

test('ROTAS: cores da spec; all-pairs sem FAIL (WARN aceito com rótulo direto)', () => {
  assert.deepEqual(S.ROTAS, { r1: '#eda100', r2: '#6250d6', r3: '#008300', r4: '#e34948', r5: '#1baf7a' });
  const r = validate(Object.values(S.ROTAS), { mode: 'light', surface: SURFACE, pairs: 'all' });
  assert.ok(r.ok, JSON.stringify(r.report));
  assert.notEqual(state(r, 'CVD separation'), 'fail');
});

test('rampas: uma por modo quantitativo, 5 passos, ordinal válido contra o fundo do mapa', () => {
  assert.deepEqual(Object.keys(S.RAMPS).sort(), [...S.QUANT_MODES].sort());
  for (const [m, ramp] of Object.entries(S.RAMPS)) {
    assert.equal(ramp.length, 5, m);
    assert.ok(ramp.every(c => HEX.test(c)), m);
    const r = validateOrdinal(ramp, { mode: 'light', surface: SURFACE });
    assert.ok(r.ok, `${m}: ${JSON.stringify(r.report)}`);
    assert.equal(state(r, 'Lightness monotone'), true, m);
    // passo mais claro primeiro e >= 2:1 sobre o fundo
    assert.ok(contrast(ramp[0], SURFACE) >= 2, `${m}: ${contrast(ramp[0], SURFACE)}`);
    for (let i = 1; i < ramp.length; i++) assert.ok(contrast(ramp[i], SURFACE) > contrast(ramp[i - 1], SURFACE), `${m} passo ${i}`);
  }
  // âncoras: azul = rampa documentada do método; violeta e vermelho contêm o slot categórico
  assert.deepEqual(S.RAMPS.trafego, ['#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b']);
  assert.ok(S.RAMPS.pesados.includes(S.DATA.violet));
  assert.ok(S.RAMPS.acidentes.includes(S.DATA.red));
});

test('status do pipeline: etapas em rampa ordinal; suspenso/cancelado fora dos slots categóricos', () => {
  const etapas = ['estudo', 'consulta_publica', 'tcu', 'edital', 'leilao_agendado', 'leiloado', 'contrato'].map(k => S.PIPE_STATUS[k]);
  const r = validateOrdinal(etapas, { mode: 'light', surface: SURFACE });
  assert.ok(r.ok, JSON.stringify(r.report));
  const cat = new Set(S.DATA_SLOTS.map(c => c.toLowerCase()));
  for (const k of ['suspenso', 'cancelado']) assert.ok(!cat.has(S.PIPE_STATUS[k].toLowerCase()), k);
  for (const c of Object.values(S.PIPE_STATUS)) assert.ok(!cat.has(c.toLowerCase()), c);
});

test('modos quantitativos: cor sólida da rampa por classe, espessura crescente; sem dado em cinza', () => {
  for (const m of S.QUANT_MODES) {
    const st = [0, 1, 2, 3, 4].map(c => S.quantStyle(c, m));
    assert.deepEqual(st.map(s => s.color), S.RAMPS[m], m);
    assert.ok(st.every(s => s.opacity === 1), m);
    assert.ok(st.every((s, i) => i === 0 || s.weight > st[i - 1].weight), m);
    assert.equal(S.quantStyle(9, m), st[4]);
    assert.equal(S.quantStyle(-1, m), S.QUANT_NONE);
    // amostra da legenda usa a cor do passo
    for (let c = 0; c < 5; c++) assert.match(S.quantSwatch(c, m), new RegExp(`stroke="${S.RAMPS[m][c]}"`), `${m} ${c}`);
  }
  assert.equal(S.QUANT_NONE.color, S.COLORS.lightGrey);
});

test('camadas: cada uma com cor documentada (token), atribuição fixa', () => {
  const tokens = new Set(S.DATA_TOKENS);
  const L = S.LAYER_STYLES;
  const colors = Object.values(L).flatMap(s => [s.color, s.fillColor, s.halo].filter(Boolean));
  for (const c of colors) assert.ok(tokens.has(c.toUpperCase()), c);
  assert.deepEqual({ ferrovias: L.ferrovias.color, portos: L.portos.fillColor, siade: L.siade.color, estConc: L.estConc.color,
    malha: L.estaduais.color, obras: L.obras.fillColor, sats: L.sats.color }, {
    ferrovias: S.DATA.yellow, portos: S.DATA.violet, siade: S.DATA.red, estConc: S.DATA.magenta,
    malha: S.DATA.green, obras: S.DATA.orange, sats: S.DATA.aqua });
  // sete camadas, sete slots distintos
  const slots = [L.ferrovias.color, L.portos.fillColor, L.siade.color, L.estConc.color, L.estaduais.color, L.obras.fillColor, L.sats.color];
  assert.equal(new Set(slots).size, 7);
  // amostras do painel usam as mesmas cores
  for (const [k, c] of [['ferrovias', L.ferrovias.color], ['portos', L.portos.fillColor], ['siade', L.siade.color], ['estconc', L.estConc.color],
    ['estaduais-malha', L.estaduais.color], ['obras', L.obras.fillColor], ['sats', L.sats.color]]) {
    assert.ok(S.layerSwatch(k).includes(c), k);
  }
  // pares que aparecem juntos no mapa passam os pisos (normal >= 15, CVD >= 8): malha × concessões estaduais; ferrovias × SIADE × portos
  for (const group of [[L.estaduais.color, L.estConc.color], [L.ferrovias.color, L.siade.color, L.portos.fillColor],
    [L.portos.fillColor, L.obras.fillColor, L.sats.color]]) {
    const r = validate(group, { mode: 'light', surface: SURFACE, pairs: 'all' });
    assert.ok(r.ok && state(r, 'CVD separation') === 'pass', JSON.stringify(r.report));
  }
});

test('tokens: todos hex válidos; CSS do pipeline gerado dos tokens', () => {
  for (const c of S.DATA_TOKENS) assert.match(c, HEX);
  const css = S.dataTokenCss();
  for (const [k, c] of Object.entries(S.PIPE_STATUS)) assert.ok(css.includes(`.chip[data-pstatus="${k}"]::before{background:${c}}`), k);
});

test('rotas: hidrovia não repete o "Em obra" federal; extras e amostras com tokens; rótulo na legenda', () => {
  const X = S.ROTAS_EXTRA, obra = S.LINE_STYLES['Em obra de Pavimentação'];
  assert.notEqual(X.hidrovia.dash, obra.dash);
  assert.notEqual(X.hidrovia.dash, X.cabotagem.dash);
  assert.notEqual(X.hidrovia.dash, X.estudo.dash);
  assert.equal(X.hidrovia.color, S.DATA.blue);
  assert.equal(X.pavimentacao.color, S.RAMPS.carga[3]);
  const tokens = new Set(S.DATA_TOKENS);
  for (const [k, x] of Object.entries(X)) {
    assert.ok(tokens.has(x.color.toUpperCase()), k);
    assert.ok(x.label && x.label.length > 3, k);
    assert.ok(S.rotaExtraSwatch(k).includes(`stroke="${x.color}"`), k);
    if (x.dash) assert.ok(S.rotaExtraSwatch(k).includes(`stroke-dasharray="${x.dash}"`), k);
  }
  for (const c of [S.ROTA_LINHA.casing, S.ROTAS_PAIS.fillColor, S.ROTAS_PAIS.color]) assert.ok(tokens.has(c.toUpperCase()), c);
  for (const [id, c] of Object.entries(S.ROTAS)) {
    assert.ok(S.rotaSwatch(id).includes(`stroke="${c}"`), id);
    assert.ok(S.rotasSwatch().includes(`stroke="${c}"`), id);
  }
});
