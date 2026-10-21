// Estilo de linha por situação (spec §4.2). Interface e malha federal base: paleta Galapagos (COLORS).
const COLORS = {
  deepBlue: '#183C80',
  brightBlue: '#0071BB',
  spacialGrey: '#231F20',
  lightGrey: '#525254',
  snowWhite: '#F7F7F8',
};

// ---------- Paleta de dados (v3.1, spec §4; valores e saídas do validador em docs/paleta.md) ----------
// Cores de dado só daqui. Toda cor de dado tem legenda ou rótulo; texto nunca na cor da série.
// 8 slots categóricos na ordem validada (scripts/validate_palette.js, adjacente, superfície #F7F7F8).
const DATA = {
  blue: '#2a78d6', orange: '#eb6834', aqua: '#1baf7a', yellow: '#eda100',
  magenta: '#e87ba4', green: '#008300', violet: '#6250d6', red: '#e34948',
};
const DATA_SLOTS = [DATA.blue, DATA.orange, DATA.aqua, DATA.yellow, DATA.magenta, DATA.green, DATA.violet, DATA.red];
// Rotas de Integração Sul-Americana (validadas all-pairs; WARN de CVD aceito com rótulo direto + traço).
const ROTAS = { r1: DATA.yellow, r2: DATA.violet, r3: DATA.green, r4: DATA.red, r5: DATA.aqua };
// Cada rota repete o hex de uma camada temática (Rota 1 = ferrovias, 2 = portos, 3 = malha estadual, 4 = SIADE, 5 = SATs;
// docs/paleta.md). Com as Rotas ligadas, a malha federal e as camadas temáticas de linha e ponto ficam a opacidade × factor
// (estaduais = malha, concessões estaduais e malha colorida pelo Tráfego) e voltam ao normal quando as Rotas desligam.
const ROTAS_DIM = { factor: 0.35, layers: ['estaduais', 'ferrovias', 'siade', 'portos', 'sats', 'obras', 'pracas'] };
// Rampas ordinais de 5 passos (claro → escuro), um tom por modo quantitativo. Mesma escada de OKLCH L
// (0,717 · 0,622 · 0,527 · 0,433 · 0,338) nas quatro; azul = passos 300/400/500/600/700 da rampa documentada;
// as outras mantêm o matiz OKLCH do slot categórico (laranja 40,6°, vermelho 24,9°, violeta 283,4°).
const RAMPS = {
  trafego: ['#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b'],
  pesados: ['#9895ff', '#7c6ef7', '#6250d6', '#4a30b6', '#360396'],
  carga: ['#fb7744', '#da5821', '#b43f00', '#8a2e00', '#621e00'],
  acidentes: ['#ff6f69', '#e34948', '#c1252c', '#9a0016', '#6e000c'],
};
// Elementos das Rotas além das 5 linhas (usados pela camada de rotas): hidrovia em traço-ponto e cabotagem pontilhada no slot azul
// (o traço-ponto não repete o "Em obra" federal, Bright Blue tracejado 6 4); trecho em pavimentação em marrom (passo 4 da rampa
// laranja); trecho em estudos em Spacial Grey, 2,5 px, traço longo 8 3 (não repete o "Leito natural" federal, Light Grey 4 4).
// Toda linha com rótulo na legenda da camada.
const ROTAS_EXTRA = {
  hidrovia: { color: DATA.blue, weight: 2.5, dash: '12 4 2 4', label: 'Hidrovia' },
  cabotagem: { color: DATA.blue, weight: 2, dash: '1 5', cap: 'round', label: 'Cabotagem' },
  pavimentacao: { color: RAMPS.carga[3], weight: 2.5, dash: null, label: 'Trecho em pavimentação' },
  estudo: { color: COLORS.spacialGrey, weight: 2.5, dash: '8 3', label: 'Trecho em estudos' },
};
// Linha de cada rota: 3 px na cor de ROTAS, sobre um contorno Snow White (+3 px) que a separa da malha federal embaixo.
const ROTA_LINHA = { weight: 3, casing: COLORS.snowWhite, casingExtra: 3, casingOpacity: 0.9 };
// Países vizinhos na camada de rotas: preenchimento Snow White e borda Light Grey (interface Galapagos, não é cor de dado).
const ROTAS_PAIS = { fillColor: COLORS.snowWhite, fillOpacity: 1, color: COLORS.lightGrey, weight: 1, opacity: 0.6 };
// Status do pipeline: etapas em rampa ordinal verde-água de 7 passos (avança = mais escuro); suspenso e cancelado com
// as cores de status fixas (alerta / crítico), que não reaproveitam slots categóricos. Sempre com o texto do status.
const PIPE_STATUS = {
  estudo: '#35be88', consulta_publica: '#0eaa75', tcu: '#009565', edital: '#007f56',
  leilao_agendado: '#006a47', leiloado: '#005639', contrato: '#00432b',
  suspenso: '#fab219', cancelado: '#d03b3b',
};

const LINE_STYLES = {
  'Duplicada': { color: COLORS.deepBlue, weight: 3.5, dash: null, opacity: 1, z: 6 },
  'Pavimentada': { color: COLORS.brightBlue, weight: 2.5, dash: null, opacity: 1, z: 5 },
  'Em obra de Duplicação': { color: COLORS.brightBlue, weight: 2.5, dash: '6 4', opacity: 1, z: 4 },
  'Em obra de Pavimentação': { color: COLORS.brightBlue, weight: 2.5, dash: '6 4', opacity: 1, z: 4 },
  'Em obra de Implantação': { color: COLORS.brightBlue, weight: 2.5, dash: '6 4', opacity: 1, z: 4 },
  'Implantada': { color: COLORS.lightGrey, weight: 2, dash: '6 4', opacity: 1, z: 3 },
  'Leito Natural': { color: COLORS.lightGrey, weight: 1.5, dash: '4 4', opacity: 1, z: 2 },
  'Travessia': { color: COLORS.lightGrey, weight: 1.5, dash: '1 8', opacity: 1, z: 2 },
  'Planejada': { color: COLORS.lightGrey, weight: 1.5, dash: '1 4', opacity: 0.6, z: 1 },
};
const DEFAULT_LINE_STYLE = { color: COLORS.lightGrey, weight: 1.5, dash: null, opacity: 1, z: 0 };

// Ordem da legenda: agrupa os três "Em obra" numa entrada só.
const LEGEND_ITEMS = [
  ['Duplicada', 'Duplicada'],
  ['Pavimentada', 'Pavimentada'],
  ['Em obra de Pavimentação', 'Em obra'],
  ['Implantada', 'Implantada'],
  ['Leito Natural', 'Leito natural'],
  ['Travessia', 'Travessia'],
  ['Planejada', 'Planejada'],
];

const CONCESSAO = 'Concessão Federal';
const HALO = { color: COLORS.spacialGrey, extra: 3, opacity: 0.35 };

function lineStyle(situacao) { return LINE_STYLES[situacao] || DEFAULT_LINE_STYLE; }

function zoomFactor(z) { return Math.min(2, Math.max(0.6, 0.6 + 0.15 * (z - 4))); }

// Amostra SVG do estilo, usada na legenda e nas barras do painel.
function styleSwatch(situacao, width = 32) {
  const s = lineStyle(situacao);
  const dash = s.dash ? ` stroke-dasharray="${s.dash}"` : '';
  return `<svg class="swatch" width="${width}" height="8" viewBox="0 0 ${width} 8" aria-hidden="true">` +
    `<line x1="1" y1="4" x2="${width - 1}" y2="4" stroke="${s.color}" stroke-width="${Math.min(s.weight, 4)}"` +
    ` stroke-opacity="${s.opacity}" stroke-linecap="round"${dash}/></svg>`;
}

function haloSwatch(width = 32) {
  return `<svg class="swatch" width="${width}" height="10" viewBox="0 0 ${width} 10" aria-hidden="true">` +
    `<line x1="1" y1="5" x2="${width - 1}" y2="5" stroke="${HALO.color}" stroke-opacity="${HALO.opacity}" stroke-width="7" stroke-linecap="round"/>` +
    `<line x1="1" y1="5" x2="${width - 1}" y2="5" stroke="${COLORS.deepBlue}" stroke-width="3" stroke-linecap="round"/></svg>`;
}

// Modo "Concessões" (spec v2 §5.1): estilo por estado, na ordem de prioridade.
const CONC_STYLES = {
  agendado2026: { label: 'Leilão agendado 2026', color: COLORS.brightBlue, weight: 4, dash: null, opacity: 1, z: 7, halo: { color: COLORS.brightBlue, opacity: 0.3, extra: 5 } },
  projeto2027: { label: 'Projeto 2027', color: COLORS.brightBlue, weight: 3, dash: '6 4', opacity: 1, z: 6 },
  programa: { label: 'Contrato do programa 2023–26', color: COLORS.deepBlue, weight: 3.5, dash: null, opacity: 1, z: 5 },
  vigente: { label: 'Contrato vigente anterior', color: COLORS.deepBlue, weight: 2.5, dash: null, opacity: 1, z: 4, halo: { color: COLORS.spacialGrey, opacity: 0.35, extra: 3 } },
  snv: { label: 'Concessão no SNV, fora do RoadShow', color: COLORS.deepBlue, weight: 1.5, dash: null, opacity: 1, z: 3, halo: { color: COLORS.spacialGrey, opacity: 0.35, extra: 3 } },
  pos2027: { label: 'Estudo pós-2027', color: COLORS.lightGrey, weight: 2, dash: '1 4', opacity: 1, z: 2 },
  nenhum: { label: 'Sem concessão', color: COLORS.lightGrey, weight: 1, dash: null, opacity: 0.5, z: 1 },
};

function concStyleSwatch(key, width = 32) {
  const s = CONC_STYLES[key] || CONC_STYLES.nenhum;
  const dash = s.dash ? ` stroke-dasharray="${s.dash}"` : '';
  const halo = s.halo ? `<line x1="1" y1="5" x2="${width - 1}" y2="5" stroke="${s.halo.color}" stroke-opacity="${s.halo.opacity}" stroke-width="${Math.min(s.weight + s.halo.extra, 9)}" stroke-linecap="round"/>` : '';
  return `<svg class="swatch" width="${width}" height="10" viewBox="0 0 ${width} 10" aria-hidden="true">${halo}` +
    `<line x1="1" y1="5" x2="${width - 1}" y2="5" stroke="${s.color}" stroke-width="${Math.min(s.weight, 4)}" stroke-opacity="${s.opacity}" stroke-linecap="round"${dash}/></svg>`;
}

// Modos quantitativos: 5 classes por quantil, espessura 1,5 → 6 px e cor sólida da rampa do modo (v3.1); classe maior por cima.
const QUANT_MODES = ['trafego', 'pesados', 'carga', 'acidentes'];
const QUANT_STYLES = [
  { weight: 1.5, dash: null, opacity: 1, z: 1 },
  { weight: 2.625, dash: null, opacity: 1, z: 2 },
  { weight: 3.75, dash: null, opacity: 1, z: 3 },
  { weight: 4.875, dash: null, opacity: 1, z: 4 },
  { weight: 6, dash: null, opacity: 1, z: 5 },
];
const QUANT_NONE = { color: COLORS.lightGrey, weight: 1, dash: '2 4', opacity: 0.5, z: 0 };
// Malha estadual no modo Tráfego (VMDa 2025): cor da classe na rampa do Tráfego, nas quebras da malha federal, com
// espessura × 0,55 da federal na mesma classe (a federal continua lendo como a rede principal). Sem dado (estadual):
// Light Grey fino e contínuo, para não confundir com o "sem dado" federal (QUANT_NONE, tracejado).
const EST_TRAF = { weightFactor: 0.55 };
const EST_NONE = { color: COLORS.lightGrey, weight: 0.75, opacity: 0.5 };
// Estilo completo por modo e classe, montado uma vez: {color, weight, dash, opacity, z}.
const QUANT_MODE_STYLES = Object.fromEntries(QUANT_MODES.map(m =>
  [m, QUANT_STYLES.map((s, c) => Object.assign({ color: RAMPS[m][c] }, s))]));

function quantStyle(c, mode = 'trafego') {
  const st = QUANT_MODE_STYLES[mode];
  if (!st) throw new Error(`quantStyle: modo quantitativo desconhecido "${mode}"`);
  return c < 0 ? QUANT_NONE : st[Math.min(c, st.length - 1)];
}

function quantSwatch(c, mode = 'trafego', width = 32) {
  const s = quantStyle(c, mode);
  const dash = s.dash ? ` stroke-dasharray="${s.dash}"` : '';
  const pad = Math.max(1, s.weight / 2);
  return `<svg class="swatch" width="${width}" height="8" viewBox="0 0 ${width} 8" aria-hidden="true">` +
    `<line x1="${pad}" y1="4" x2="${width - pad}" y2="4" stroke="${s.color}" stroke-width="${s.weight}"` +
    ` stroke-opacity="${s.opacity}" stroke-linecap="${s.dash ? 'butt' : 'round'}"${dash}/></svg>`;
}

// Camadas de sobreposição: cor fixa por entidade (nunca por posição), tabela e validação em docs/paleta.md.
// Atribuição escolhida por busca exaustiva das 8 cores nas 7 camadas, maximizando a separação (normal ≥ 15, CVD ≥ 8)
// dos pares que aparecem juntos (malha × concessões estaduais; ferrovias × SIADE × portos; pontos entre si; linhas × federais).
const LAYER_STYLES = {
  estaduais: { color: DATA.green, weight: 1, opacity: 0.6 },
  // Concessões estaduais: magenta 3 px com halo Spacial Grey (+3 px), distinto das federais (Deep Blue).
  estConc: { color: DATA.magenta, weight: 3, opacity: 1, halo: COLORS.spacialGrey, haloOpacity: 0.35, haloExtra: 3 },
  // Praças de pedágio seguem Bright Blue (contagem medida, mesma família do tráfego federal).
  pracas: { fillColor: COLORS.brightBlue, fillOpacity: 0.85, color: COLORS.snowWhite, weight: 1, rmin: 3, rmax: 10, semDadoOpacity: 0.5 },
  sats: { color: DATA.aqua, weight: 2, radius: 3 },
  obras: { fillColor: DATA.orange, fillOpacity: 0.9, radius: 3 },
  ferrovias: { color: DATA.yellow, weight: 2, dash: '6 3', opacity: 1 },
  portos: { fillColor: DATA.violet, fillOpacity: 1, color: COLORS.snowWhite, weight: 1, radius: 4 },
  siade: { color: DATA.red, opacity: 0.8, wmin: 1, wmax: 8 },
  // Seleção: traço sobre um halo Snow White, para destacar inclusive sobre o fundo municipal escuro.
  selecao: { color: COLORS.deepBlue, weight: 2.5, opacity: 1, halo: COLORS.snowWhite, haloWeight: 6 },
  selecaoMun: { color: COLORS.spacialGrey, weight: 2.5, opacity: 1, halo: COLORS.snowWhite, haloWeight: 6 },
};
// Fundo municipal: Deep Blue com opacidade por classe; sem dado / zero sem preenchimento.
const FUNDO_OPACITY = [0.12, 0.25, 0.4, 0.55, 0.7];
const FUNDO_BORDER = { color: COLORS.lightGrey, weight: 0.3, opacity: 0.3 };
// Portos organizados e públicos em quadrado; TUP e ETC em círculo (rótulos de IntelModel.PORTO_TIPOS).
const PORTO_QUADRADO = new Set(['Porto organizado', 'Porto público']);

// Amostra SVG de cada camada (painel "Camadas").
function layerSwatch(key, size = 24) {
  const c = size / 2, s = LAYER_STYLES;
  const svg = body => `<svg class="swatch" width="${size}" height="16" viewBox="0 0 ${size} 16" aria-hidden="true">${body}</svg>`;
  const line = (st, w, dash) => `<line x1="2" y1="8" x2="${size - 2}" y2="8" stroke="${st.color}" stroke-opacity="${st.opacity}" stroke-width="${w}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;
  switch (key) {
    case 'estaduais': return svg(line(s.estaduais, 1.5) +
      `<line x1="${c + 2}" y1="8" x2="${size - 3}" y2="8" stroke="${s.estConc.halo}" stroke-opacity="${s.estConc.haloOpacity}" stroke-width="${s.estConc.weight + s.estConc.haloExtra}" stroke-linecap="round"/>` +
      `<line x1="${c + 2}" y1="8" x2="${size - 3}" y2="8" stroke="${s.estConc.color}" stroke-width="${s.estConc.weight}" stroke-linecap="round"/>`);
    case 'estaduais-malha': return svg(line(s.estaduais, 1.5));
    case 'estconc': return svg(`<line x1="4" y1="8" x2="${size - 4}" y2="8" stroke="${s.estConc.halo}" stroke-opacity="${s.estConc.haloOpacity}" stroke-width="${s.estConc.weight + s.estConc.haloExtra}" stroke-linecap="round"/>` +
      `<line x1="4" y1="8" x2="${size - 4}" y2="8" stroke="${s.estConc.color}" stroke-width="${s.estConc.weight}" stroke-linecap="round"/>`);
    case 'pracas': return svg(`<circle cx="${c - 4}" cy="8" r="3" fill="${s.pracas.fillColor}" fill-opacity="${s.pracas.fillOpacity}" stroke="${s.pracas.color}"/>` +
      `<circle cx="${c + 4}" cy="8" r="6" fill="${s.pracas.fillColor}" fill-opacity="${s.pracas.fillOpacity}" stroke="${s.pracas.color}"/>`);
    case 'sats': return svg(`<circle cx="${c}" cy="8" r="3.5" fill="none" stroke="${s.sats.color}" stroke-width="${s.sats.weight}"/>`);
    case 'obras': return svg(`<circle cx="${c}" cy="8" r="3" fill="${s.obras.fillColor}" fill-opacity="${s.obras.fillOpacity}"/>`);
    case 'ferrovias': return svg(line(s.ferrovias, s.ferrovias.weight + 0.5, s.ferrovias.dash));
    case 'portos': return svg(`<rect x="${c - 8}" y="4" width="8" height="8" fill="${s.portos.fillColor}"/><circle cx="${c + 5}" cy="8" r="4" fill="${s.portos.fillColor}"/>`);
    case 'siade': return svg(`<line x1="2" y1="12" x2="${size - 2}" y2="4" stroke="${s.siade.color}" stroke-opacity="${s.siade.opacity}" stroke-width="4" stroke-linecap="round"/>`);
    default: return svg('');
  }
}

// Amostras da camada de rotas: linha de uma rota (cor de ROTAS com o contorno), elemento extra (hidrovia etc.)
// e o conjunto das 5 rotas (painel Camadas).
function rotaSwatch(id, width = 32) {
  const c = ROTAS[id] || COLORS.lightGrey, w = ROTA_LINHA.weight;
  return `<svg class="swatch" width="${width}" height="10" viewBox="0 0 ${width} 10" aria-hidden="true">` +
    `<line x1="2" y1="5" x2="${width - 2}" y2="5" stroke="${c}" stroke-width="${w + 1}" stroke-linecap="round"/></svg>`;
}
function rotaExtraSwatch(tipo, width = 32) {
  const s = ROTAS_EXTRA[tipo];
  if (!s) return '';
  const dash = s.dash ? ` stroke-dasharray="${s.dash}"` : '';
  return `<svg class="swatch" width="${width}" height="10" viewBox="0 0 ${width} 10" aria-hidden="true">` +
    `<line x1="2" y1="5" x2="${width - 2}" y2="5" stroke="${s.color}" stroke-width="${s.weight}" stroke-linecap="${s.cap || (s.dash ? 'butt' : 'round')}"${dash}/></svg>`;
}
function rotasSwatch(size = 24) {
  const ids = Object.keys(ROTAS), seg = (size - 4) / ids.length;
  return `<svg class="swatch" width="${size}" height="16" viewBox="0 0 ${size} 16" aria-hidden="true">` +
    ids.map((id, k) => `<line x1="${2 + k * seg}" y1="8" x2="${2 + (k + 1) * seg}" y2="8" stroke="${ROTAS[id]}" stroke-width="4"/>`).join('') + '</svg>';
}

// Amostra de preenchimento do fundo municipal (classe c; -1 = sem preenchimento).
function fundoSwatch(c, width = 32) {
  const op = c >= 0 ? FUNDO_OPACITY[Math.min(c, FUNDO_OPACITY.length - 1)] : 0;
  return `<svg class="swatch" width="${width}" height="16" viewBox="0 0 ${width} 16" aria-hidden="true">` +
    `<rect x="0.5" y="0.5" width="${width - 1}" height="15" rx="2" fill="${COLORS.deepBlue}" fill-opacity="${op}" stroke="${COLORS.lightGrey}" stroke-opacity="0.4"/></svg>`;
}

// Todas as cores permitidas em marcas do mapa (interface Galapagos + tokens de dado), em maiúsculas.
const DATA_TOKENS = [...new Set([
  ...Object.values(COLORS), ...DATA_SLOTS, ...Object.values(ROTAS), ...Object.values(RAMPS).flat(),
  ...Object.values(ROTAS_EXTRA).map(x => x.color), ...Object.values(PIPE_STATUS),
].map(c => c.toUpperCase()))];

// CSS gerado dos tokens: ponto colorido por status nos chips do pipeline e na coluna Status da tabela, com o mesmo token
// (o texto do status continua no chip e na célula).
function dataTokenCss() {
  return Object.entries(PIPE_STATUS).map(([k, c]) =>
    `.chip[data-pstatus="${k}"]::before,.pstatus[data-pdot="${k}"]::before{background:${c}}`).join('\n');
}

if (typeof module !== 'undefined') {
  module.exports = { COLORS, DATA, DATA_SLOTS, ROTAS, ROTAS_DIM, RAMPS, ROTAS_EXTRA, ROTA_LINHA, ROTAS_PAIS, PIPE_STATUS, QUANT_MODES, QUANT_STYLES, QUANT_NONE,
    EST_TRAF, EST_NONE,
    LAYER_STYLES, LINE_STYLES, CONC_STYLES, DATA_TOKENS, quantStyle, quantSwatch, layerSwatch, rotaSwatch, rotaExtraSwatch, rotasSwatch, dataTokenCss };
}
