// Ponto de entrada: liga dados, mapa e interface.
(function main() {
  const snv = window.SNV;
  MapView.init(document.getElementById('map'), snv, document.getElementById('map-controls'));
  if (typeof UI !== 'undefined') UI.init(snv, Model.createIndex(snv));
})();
