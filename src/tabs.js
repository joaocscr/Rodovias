// Abas (Mapa | Projetos | Tráfego | Cargas | Mercado | Regulatório | Fontes) e ficha, roteadas por #hash (funciona em file://).
const Tabs = (() => {
  const TABS = [['mapa', 'Mapa'], ['projetos', 'Projetos'], ['trafego', 'Tráfego'], ['cargas', 'Cargas'],
    ['mercado', 'Mercado'], ['regulatorio', 'Regulatório'], ['fontes', 'Fontes']];
  const inits = {};
  const started = new Set();
  let active = 'mapa', prevHash = '#mapa', fichaValid = () => false;

  function parse(hash) {
    const h = (hash || '').replace(/^#/, '');
    const [tab, ...rest] = h.split('/');
    if (!rest.length) return { tab, arg: null };
    try {
      return { tab, arg: decodeURIComponent(rest.join('/')) };
    } catch (e) {
      return { tab: 'invalido', arg: null };  // percent-encoding malformado: o roteador cai no mapa
    }
  }

  function show(tab) {
    active = tab;
    document.querySelectorAll('[data-tab]').forEach(s => { s.hidden = s.dataset.tab !== tab; });
    document.querySelectorAll('.tabs [data-go]').forEach(a => {
      const on = a.dataset.go === tab;
      a.classList.toggle('is-active', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    if (!started.has(tab) && inits[tab]) { started.add(tab); inits[tab](); }
    if (tab === 'mapa' && typeof MapView !== 'undefined') setTimeout(() => MapView.invalidate(), 0);
  }

  function route() {
    const { tab, arg } = parse(location.hash);
    if (tab === 'ficha') {
      if (!arg || !fichaValid(arg)) { location.replace('#mapa'); return; }
      if (typeof Ficha !== 'undefined') Ficha.open(arg);
      return;
    }
    if (typeof Ficha !== 'undefined') Ficha.close(true);
    if (!TABS.some(([k]) => k === tab)) {
      if (location.hash && location.hash !== '#') location.replace('#mapa');
      show('mapa');
      return;
    }
    prevHash = '#' + tab;
    show(tab);
  }

  function init({ isFicha } = {}) {
    if (isFicha) fichaValid = isFicha;
    const nav = document.getElementById('tabs');
    nav.innerHTML = TABS.map(([k, label]) => `<a href="#${k}" data-go="${k}">${label}</a>`).join('');
    window.addEventListener('hashchange', route);
    route();
  }

  return {
    init, route,
    on(tab, fn) { inits[tab] = fn; if (active === tab && !started.has(tab) && document.getElementById('tabs').children.length) { started.add(tab); fn(); } },
    go(r) { if (location.hash === r) route(); else location.hash = r; },
    // Vai para a aba e roda fn quando ela está exibida (hashchange é assíncrono); usado para abrir algo no mapa.
    goThen(r, fn) {
      const tab = parse(r).tab;
      this.go(r);
      const wait = (n = 0) => requestAnimationFrame(() => (active === tab || n > 60 ? fn() : wait(n + 1)));
      wait();
    },
    back() { location.hash = prevHash; },
    current() { return Object.assign(parse(location.hash), { active }); },
  };
})();
