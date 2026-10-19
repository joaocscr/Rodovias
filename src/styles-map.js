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
