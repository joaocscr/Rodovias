// Ponto de entrada: liga dados, mapa, abas e interface.
(function main() {
  const snv = window.SNV, conc = window.CONC, intel = window.INTEL || null;
  const states = ConcModel.stateArray(conc, snv.fis.length);
  MapView.init(document.getElementById('map'), snv, document.getElementById('map-controls'), { states, conc, intel });
  Layers.init(MapView.map, intel, snv);
  UI.init(snv, Model.createIndex(snv), conc, intel);
  Ficha.init(conc, intel, snv);
  Tabs.on('projetos', () => Projetos.init(conc, intel));
  Tabs.on('trafego', () => Trafego.init(intel, snv));
  Tabs.on('cargas', () => Cargas.init(intel, snv));
  Tabs.on('mercado', () => Mercado.init(conc));
  Tabs.on('regulatorio', () => Regulatorio.init(conc));
  Tabs.on('fontes', () => Fontes.init(intel));
  Tabs.init({ isFicha: id => Ficha.exists(id) });
  Csv.init();  // depois da montagem inicial: botão em cada table.grid, inclusive as criadas depois
})();
