// Ponto de entrada: liga dados, mapa, abas e interface.
(function main() {
  const snv = window.SNV, conc = window.CONC, intel = window.INTEL || null;
  const states = ConcModel.stateArray(conc, snv.fis.length);
  MapView.init(document.getElementById('map'), snv, document.getElementById('map-controls'), { states, conc, intel });
  UI.init(snv, Model.createIndex(snv), conc, intel);
  Ficha.init(conc);
  Tabs.on('projetos', () => Projetos.init(conc));
  Tabs.on('mercado', () => Mercado.init(conc));
  Tabs.on('regulatorio', () => Regulatorio.init(conc));
  Tabs.init({ isFicha: id => Ficha.exists(id) });
})();
