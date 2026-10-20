// Estilo de linha por situação (spec §4.2). Só cores da paleta Galapagos.
const COLORS = {
  deepBlue: '#183C80',
  brightBlue: '#0071BB',
  spacialGrey: '#231F20',
  lightGrey: '#525254',
  snowWhite: '#F7F7F8',
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

// Modos quantitativos (v3): 5 classes por quantil, espessura 1,5 → 6 px e tons de azul por opacidade; classe maior por cima.
const QUANT_MODES = ['trafego', 'pesados', 'carga', 'acidentes'];
const QUANT_STYLES = [
  { color: COLORS.brightBlue, weight: 1.5, dash: null, opacity: 0.45, z: 1 },
  { color: COLORS.brightBlue, weight: 2.625, dash: null, opacity: 0.7, z: 2 },
  { color: COLORS.deepBlue, weight: 3.75, dash: null, opacity: 0.75, z: 3 },
  { color: COLORS.deepBlue, weight: 4.875, dash: null, opacity: 0.9, z: 4 },
  { color: COLORS.deepBlue, weight: 6, dash: null, opacity: 1, z: 5 },
];
const QUANT_NONE = { color: COLORS.lightGrey, weight: 1, dash: '2 4', opacity: 0.5, z: 0 };

function quantStyle(c) { return c < 0 ? QUANT_NONE : QUANT_STYLES[Math.min(c, QUANT_STYLES.length - 1)]; }

function quantSwatch(c, width = 32) {
  const s = quantStyle(c);
  const dash = s.dash ? ` stroke-dasharray="${s.dash}"` : '';
  const pad = Math.max(1, s.weight / 2);
  return `<svg class="swatch" width="${width}" height="8" viewBox="0 0 ${width} 8" aria-hidden="true">` +
    `<line x1="${pad}" y1="4" x2="${width - pad}" y2="4" stroke="${s.color}" stroke-width="${s.weight}"` +
    ` stroke-opacity="${s.opacity}" stroke-linecap="${s.dash ? 'butt' : 'round'}"${dash}/></svg>`;
}

// Camadas de sobreposição (v3, Task 10): só cores da marca; opacidade e espessura variam.
const LAYER_STYLES = {
  estaduais: { color: COLORS.lightGrey, weight: 1, opacity: 0.6 },
  estConc: { color: COLORS.deepBlue, weight: 2.5, opacity: 1 },
  pracas: { fillColor: COLORS.brightBlue, fillOpacity: 0.85, color: COLORS.snowWhite, weight: 1, rmin: 3, rmax: 10, semDadoOpacity: 0.5 },
  sats: { color: COLORS.deepBlue, weight: 1.5, radius: 3 },
  obras: { fillColor: COLORS.spacialGrey, fillOpacity: 0.7, radius: 3 },
  ferrovias: { color: COLORS.spacialGrey, weight: 1.5, dash: '6 3', opacity: 0.7 },
  portos: { fillColor: COLORS.spacialGrey, fillOpacity: 1, color: COLORS.snowWhite, weight: 1, radius: 4 },
  siade: { color: COLORS.brightBlue, opacity: 0.5, wmin: 1, wmax: 8 },
  // Seleção: traço sobre um halo Snow White, para destacar inclusive sobre o fundo municipal escuro.
  selecao: { color: COLORS.deepBlue, weight: 2.5, opacity: 1, halo: COLORS.snowWhite, haloWeight: 6 },
  selecaoMun: { color: COLORS.spacialGrey, weight: 2.5, opacity: 1, halo: COLORS.snowWhite, haloWeight: 6 },
};
// Fundo municipal: Deep Blue com opacidade por classe; sem dado / zero sem preenchimento.
const FUNDO_OPACITY = [0.12, 0.25, 0.4, 0.55, 0.7];
const FUNDO_BORDER = { color: COLORS.lightGrey, weight: 0.3, opacity: 0.3 };
// Portos organizados e públicos em quadrado; TUP e ETC em círculo.
const PORTO_QUADRADO = new Set(['Porto Organizado', 'Porto público']);

// Amostra SVG de cada camada (painel "Camadas").
function layerSwatch(key, size = 24) {
  const c = size / 2, s = LAYER_STYLES;
  const svg = body => `<svg class="swatch" width="${size}" height="16" viewBox="0 0 ${size} 16" aria-hidden="true">${body}</svg>`;
  const line = (st, w, dash) => `<line x1="2" y1="8" x2="${size - 2}" y2="8" stroke="${st.color}" stroke-opacity="${st.opacity}" stroke-width="${w}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;
  switch (key) {
    case 'estaduais': return svg(line(s.estaduais, 1.5) + `<line x1="${c}" y1="8" x2="${size - 2}" y2="8" stroke="${s.estConc.color}" stroke-width="2.5"/>`);
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

// Amostra de preenchimento do fundo municipal (classe c; -1 = sem preenchimento).
function fundoSwatch(c, width = 32) {
  const op = c >= 0 ? FUNDO_OPACITY[Math.min(c, FUNDO_OPACITY.length - 1)] : 0;
  return `<svg class="swatch" width="${width}" height="16" viewBox="0 0 ${width} 16" aria-hidden="true">` +
    `<rect x="0.5" y="0.5" width="${width - 1}" height="15" rx="2" fill="${COLORS.deepBlue}" fill-opacity="${op}" stroke="${COLORS.lightGrey}" stroke-opacity="0.4"/></svg>`;
}
