// Aba Glossário: termos técnicos e de mercado usados no painel (window.GLOSSARIO, de data/glossario.json), com busca e filtro
// por categoria. As outras abas apontam para cada termo com Glossario.link(id); a rota #glossario/<id> rola até o termo.
// Tudo vem do arquivo embutido: nada é consultado na internet.
const Glossario = (() => {
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // minúsculas e sem acento: "debenture" encontra "Debênture"
  const norm = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const rotulo = e => e.sigla || e.termo;

  let dados = [], porId = new Map();
  const estado = { q: '', cat: '' };
  let built = false, alvo = null;

  // Ordem alfabética por termo (sem acento, pt-BR); o desempate é o id, para a ordem não depender do arquivo.
  function ordenar(lista) {
    return [...lista].sort((a, b) => norm(a.termo).localeCompare(norm(b.termo), 'pt-BR') || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }

  function init(lista) {
    dados = ordenar(Array.isArray(lista) ? lista : []);
    porId = new Map(dados.map(e => [e.id, e]));
    built = false;
    alvo = null;
  }

  // Link para o termo no glossário. Sem `texto`, usa a sigla (ou o nome) do termo; id desconhecido ainda gera o link,
  // com o próprio id como texto (o pytest falha se algum Glossario.link citar um id que não está em data/glossario.json).
  function link(id, texto) {
    const e = porId.get(id);
    return `<a href="#glossario/${encodeURIComponent(id)}" class="glossario-link">${esc(texto != null ? texto : e ? rotulo(e) : id)}</a>`;
  }

  // Termos que casam com a busca (termo, sigla ou definição) e com a categoria; q e cat vazios devolvem tudo.
  function filtrar(lista, q, cat) {
    const n = norm(q).trim();
    return lista.filter(e => (!cat || (e.categorias || []).includes(cat)) &&
      (!n || norm(`${e.termo} ${e.sigla || ''} ${e.definicao}`).includes(n)));
  }

  const categorias = lista => [...new Set(lista.flatMap(e => e.categorias || []))].sort((a, b) => norm(a).localeCompare(norm(b), 'pt-BR'));

  function fonteHtml(f) {
    if (!f || !f.nome) return '';
    const nome = /^https?:\/\//i.test(f.url || '')
      ? `<a class="link-btn" href="${esc(f.url)}" target="_blank" rel="noopener">${esc(f.nome)}</a>` : esc(f.nome);
    return `<p class="src">Fonte: ${nome}</p>`;
  }

  function itemHtml(e) {
    const sigla = e.sigla ? ` <span class="gloss-item__sigla">(${esc(e.sigla)})</span>` : '';
    return `<div class="gloss-item" id="gloss-${esc(e.id)}" data-id="${esc(e.id)}" tabindex="-1">
      <dt>${esc(e.termo)}${sigla}</dt>
      <dd><p>${esc(e.definicao)}</p>${fonteHtml(e.fonte)}
        <p class="gloss-item__cats">${(e.categorias || []).map(c => `<span class="gloss-tag">${esc(c)}</span>`).join('')}</p></dd></div>`;
  }

  const raiz = () => document.getElementById('page-glossario');

  function desenhaLista() {
    const el = raiz();
    if (!el) return;
    const lista = filtrar(dados, estado.q, estado.cat);
    el.querySelector('#gloss-lista').innerHTML = lista.map(itemHtml).join('');
    el.querySelector('#gloss-vazio').hidden = lista.length > 0;
    el.querySelector('#gloss-n').textContent = lista.length === dados.length ? `${dados.length} termos`
      : `${lista.length} de ${dados.length} termos`;
    el.querySelectorAll('.gloss-cat').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.cat === estado.cat)));
    if (alvo) { const a = el.querySelector(`.gloss-item[data-id="${CSS.escape(alvo)}"]`); if (a) a.classList.add('is-alvo'); }
  }

  function render() {
    if (built) return;
    built = true;
    const el = raiz();
    if (!el) return;
    if (!dados.length) {
      el.innerHTML = '<div class="page__inner"><h1 class="page__title">Glossário</h1><p class="empty">O glossário não está neste arquivo.</p></div>';
      return;
    }
    estado.q = '';
    estado.cat = '';
    const cats = categorias(dados);
    el.innerHTML = `<div class="page__inner">
      <h1 class="page__title">Glossário</h1>
      <p class="page__lead">O que significam os termos técnicos e de mercado usados neste painel, em linguagem simples. Os termos sublinhados nas outras abas levam até aqui.</p>
      <div class="toolbar gloss-busca">
        <label class="sub" for="gloss-q">Buscar termo</label>
        <input type="search" id="gloss-q" class="search__input" placeholder="Ex.: VMDa, deságio, spread" autocomplete="off">
        <span class="page__src" id="gloss-n" aria-live="polite"></span>
      </div>
      <div class="chips gloss-cats" role="group" aria-label="Filtrar por categoria">
        <button type="button" class="chip gloss-cat" data-cat="" aria-pressed="true">Todas</button>
        ${cats.map(c => `<button type="button" class="chip gloss-cat" data-cat="${esc(c)}" aria-pressed="false">${esc(c)}</button>`).join('')}
      </div>
      <p class="empty" id="gloss-vazio" hidden>Nenhum termo encontrado. Tente outra palavra ou escolha "Todas" nas categorias.</p>
      <dl class="gloss-lista" id="gloss-lista"></dl>
    </div>`;
    el.querySelector('#gloss-q').addEventListener('input', ev => { estado.q = ev.target.value; alvo = null; desenhaLista(); });
    el.querySelector('.gloss-cats').addEventListener('click', ev => {
      const b = ev.target.closest('.gloss-cat');
      if (!b) return;
      estado.cat = b.dataset.cat;
      alvo = null;
      desenhaLista();
    });
    desenhaLista();
  }

  // Rota #glossario/<id>: limpa busca e categoria (se escondem o termo), rola até ele e o destaca. Id desconhecido não faz nada.
  function focus(id) {
    render();
    const el = raiz();
    if (!el) return;
    alvo = null;
    el.querySelectorAll('.is-alvo').forEach(x => x.classList.remove('is-alvo'));
    if (!id || !porId.has(id)) return;
    alvo = id;
    if (!filtrar(dados, estado.q, estado.cat).some(e => e.id === id)) {
      estado.q = '';
      estado.cat = '';
      const q = el.querySelector('#gloss-q');
      if (q) q.value = '';
    }
    desenhaLista();
    const item = el.querySelector(`.gloss-item[data-id="${CSS.escape(id)}"]`);
    if (item) {
      item.scrollIntoView({ block: 'start' });
      item.focus({ preventScroll: true });
    }
  }

  return { init, link, render, focus, filtrar, ordenar, categorias, norm };
})();

if (typeof module !== 'undefined') module.exports = Glossario;
