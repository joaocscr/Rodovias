// Ficha de grupo e consórcio (aba Mercado): painel acessível com os consórcios de que o grupo fez parte, a composição e a
// participação de cada integrante, os leilões disputados (vitória, derrota ou inabilitação) e as fontes com o selo de origem.
// Tudo vem de LeiloesModel.fichaGrupo (conc.mercado.participantes, conc.grupos_alias e conc.consorcios): nada digitado aqui.
const Consorcios = (() => {
  const nf = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const RESULTADO = { venceu: 'Venceu', perdeu: 'Perdeu', inabilitado: 'Inabilitado', naoVenceu: 'Não venceu' };
  const ICON_CLOSE = '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';

  let conc = null, raiz = null, painel = null, aberto = false, origem = null, inertes = [];

  const botaoGrupo = nome => `<button type="button" class="link-btn cons-open" data-ficha="${esc(nome)}">${esc(nome)}</button>`;
  const selo = (res, txt) => `<span class="cons-res cons-res--${res}">${esc(txt || RESULTADO[res])}</span>`;

  // Um integrante: nome, grupo (botão para a ficha dele; "este grupo" quando é o da ficha), líder e a barra de participação.
  function integranteHtml(i, grupo) {
    const proprio = i.grupo === grupo;
    const quem = proprio ? ' <span class="cons-tag cons-tag--grupo">este grupo</span>'
      : i.grupo && i.grupo !== i.nome ? ` <span class="cons-int__grupo">grupo ${botaoGrupo(i.grupo)}</span>` : '';
    const part = typeof i.participacao === 'number'
      ? `<span class="cons-bar" role="img" aria-label="${esc(nf.format(i.participacao))}% do consórcio"><i style="width:${Math.min(100, Math.max(0, i.participacao))}%"></i></span><b class="cons-int__pct">${esc(nf.format(i.participacao))}%</b>`
      : '<span class="cons-int__nd">participação não informada</span>';
    return `<li class="cons-int${proprio ? ' is-grupo' : ''}"><span class="cons-int__nome">${esc(i.nome)}${quem}${i.lider ? ' <span class="cons-tag">líder</span>' : ''}</span>
      <span class="cons-int__part">${part}</span>${i.nota ? `<span class="cons-int__obs">${esc(i.nota)}</span>` : ''}</li>`;
  }

  // Fontes (com o selo de origem) que sustentam o dado ao lado do qual aparecem
  const fontesHtml = (fontes, rotulo) => `<ul class="cons-fontes" aria-label="${esc(rotulo)}">${fontes.map(x => `<li>${Selo.fonte(x)}</li>`).join('')}</ul>`;

  // Nome do proponente ligado ao grupo por grupos_alias: o motivo e a fonte da ligação
  // (motivo terminado em "por", como "consórcio liderado por", pede o nome do grupo logo depois)
  const atribuicaoHtml = (a, grupo) => (a ? `<p class="cons-atrib">Nome ligado a este grupo${a.motivo ? ` (${esc(a.motivo)}${/ por$/.test(a.motivo) ? ` ${esc(grupo)}` : ''})` : ''}</p>${a.fontes.length ? fontesHtml(a.fontes, 'Fontes da ligação ao grupo') : ''}` : '');

  function consorcioHtml(c, grupo) {
    const composicao = c.composicaoLocalizada
      ? `<ul class="cons-ints">${c.integrantes.map(i => integranteHtml(i, grupo)).join('')}</ul>`
      : '<p class="cons-sem">Composição não localizada.</p>';
    return `<article class="cons-card" data-cons="${esc(`${c.ano}|${c.lote}|${c.nome}`)}"><h4>${esc(c.nome)}</h4>
      <p class="cons-meta">${esc(c.ano)} · ${esc(c.lote)} · ${selo(c.venceu ? 'venceu' : 'perdeu', c.venceu ? 'Venceu o leilão' : 'Não venceu')}</p>
      ${composicao}${c.nota ? `<p class="src">Nota: ${esc(c.nota)}</p>` : ''}${atribuicaoHtml(c.atribuicao, grupo)}
      ${c.fontes.length ? `<p class="cons-fontes__t">Fontes da composição</p>${fontesHtml(c.fontes, `Fontes da composição de ${c.nome}`)}` : ''}</article>`;
  }

  // Linha de um leilão: resultado, ano, lote e como o grupo disputou. Disputa sozinha com outro nome (grafia, troca de nome)
  // diz o nome do leilão e por que ele é deste grupo; a vitória traz, recolhidas, as fontes do resultado.
  function leilaoHtml(l, grupo) {
    const sozinho = !l.consorcio;
    const como = sozinho ? `Participou sozinho${l.proponente && l.proponente !== grupo ? `, como ${esc(l.proponente)}` : ''}` : esc(l.consorcio);
    return `<li class="cons-leilao"><span class="cons-leilao__quando">${selo(l.resultado)} <b>${esc(l.ano)}</b></span>
      <span class="cons-leilao__lote">${esc(l.lote)}</span>
      <span class="cons-leilao__como">${como}</span>
      ${sozinho ? atribuicaoHtml(l.atribuicao, grupo) : ''}
      ${l.fontes.length ? `<details class="cons-leilao__fontes"><summary>Fontes do resultado</summary>${fontesHtml(l.fontes, `Fontes do resultado de ${l.lote}`)}</details>` : ''}</li>`;
  }

  // Corpo da ficha. Os termos do glossário são linkados na primeira menção.
  function corpoHtml(f) {
    const lead = `<p class="cons-lead">Ficha do ${Glossario.link('grupo-economico', 'grupo econômico')} na época dos leilões: os ${Glossario.link('consorcio', 'consórcios')} de que fez parte, a participação de cada integrante e os leilões que disputou.</p>`;
    if (!f.leiloes.length) {
      return `${lead}<p class="empty">Este nome não consta como proponente, nem como integrante de consórcio, nos leilões da base.</p>`;
    }
    const cons = f.consorcios.length
      ? f.consorcios.map(c => consorcioHtml(c, f.grupo)).join('')
      : '<p class="empty">Nenhum consórcio na base: o grupo disputou sozinho os leilões abaixo.</p>';
    const nota = f.foraDoRanking
      ? `<p class="sub" id="cons-nota-ranking">Inclui ${MercadoModel.plural(f.foraDoRanking, 'leilão', 'leilões')} que o ranking não conta para este grupo: ele participou como integrante de consórcio, e o ranking conta só quem disputou com o próprio nome.</p>` : '';
    return `${lead}
      <h3>Consórcios</h3>${cons}
      <h3>Leilões disputados</h3>${nota}
      <ul class="cons-leiloes">${f.leiloes.map(l => leilaoHtml(l, f.grupo)).join('')}</ul>`;
  }

  function montar() {
    if (raiz) return;
    raiz = document.createElement('div');
    raiz.className = 'cons-backdrop';
    raiz.hidden = true;
    raiz.innerHTML = '<div class="cons-ficha" id="cons-ficha" role="dialog" aria-modal="true" aria-labelledby="cons-titulo" tabindex="-1"></div>';
    document.body.appendChild(raiz);
    painel = raiz.firstElementChild;
    raiz.addEventListener('click', ev => {
      if (ev.target === raiz || ev.target.closest('[data-fechar]')) { fechar(); return; }
      const g = ev.target.closest('[data-ficha]');
      if (g) { mostrar(g.dataset.ficha); return; }
      if (ev.target.closest('.glossario-link')) fechar(false);  // o link troca de aba: o foco vai para o termo
    });
  }

  function focaveis() {
    return [...painel.querySelectorAll('a[href], button:not([disabled]), [tabindex="0"]')].filter(e => e.offsetParent !== null);
  }

  // Esc fecha e o Tab gira dentro do painel (o resto da página fica inerte enquanto a ficha está aberta)
  function teclado(ev) {
    if (!aberto) return;
    if (ev.key === 'Escape') { ev.stopImmediatePropagation(); ev.preventDefault(); fechar(); return; }
    if (ev.key !== 'Tab') return;
    const f = focaveis();
    if (!f.length) { ev.preventDefault(); painel.focus(); return; }
    const primeiro = f[0], ultimo = f[f.length - 1];
    if (!painel.contains(document.activeElement)) { ev.preventDefault(); primeiro.focus(); }
    else if (ev.shiftKey && document.activeElement === primeiro) { ev.preventDefault(); ultimo.focus(); }
    else if (!ev.shiftKey && document.activeElement === ultimo) { ev.preventDefault(); primeiro.focus(); }
  }

  function mostrar(nome, alvo) {
    const f = LeiloesModel.fichaGrupo(nome, conc);
    painel.innerHTML = `<div class="cons-head"><h2 id="cons-titulo">${esc(f.grupo)}</h2>
        <button type="button" class="icon-btn" data-fechar aria-label="Fechar ficha">${ICON_CLOSE}</button></div>
      <div class="cons-body">${corpoHtml(f)}</div>`;
    painel.scrollTop = 0;
    painel.querySelector('[data-fechar]').focus();
    // aberta pelo nome de um consórcio: o cartão dele fica à vista e marcado
    const k = alvo && `${alvo.ano}|${alvo.lote}|${alvo.consorcio}`;
    const card = k && [...painel.querySelectorAll('.cons-card')].find(e => e.dataset.cons === k);
    if (card) { card.classList.add('is-alvo'); card.scrollIntoView({ block: 'start' }); }
  }

  // Enquanto a ficha está aberta, o resto da página fica inerte (leitores de tela e Tab não saem do painel)
  function inertar(sim) {
    if (sim) {
      inertes = [...document.body.children].filter(e => e !== raiz && !e.inert && e.tagName !== 'SCRIPT');
      inertes.forEach(e => { e.inert = true; });
    } else {
      inertes.forEach(e => { e.inert = false; });
      inertes = [];
    }
  }

  // nome: grupo ou consórcio (nome do proponente); outras grafias do mesmo grupo caem no grupo (LeiloesModel.resolverGrupo).
  // alvo {ano, lote, consorcio}: o consórcio a destacar na ficha.
  function abrir(nome, alvo) {
    if (!conc) return;
    montar();
    if (!aberto) { origem = document.activeElement; inertar(true); }
    aberto = true;
    raiz.hidden = false;
    mostrar(nome, alvo);
  }

  // restaurarFoco = false quando a ficha fecha porque a página mudou de lugar (link do glossário, botão voltar)
  function fechar(restaurarFoco = true) {
    if (!aberto) return;
    aberto = false;
    raiz.hidden = true;
    inertar(false);
    if (restaurarFoco && origem && document.contains(origem)) origem.focus();
    origem = null;
  }

  function init(dados) {
    conc = dados;
    document.addEventListener('keydown', teclado, true);
    window.addEventListener('hashchange', () => fechar(false));
  }

  return { init, abrir, fechar, isOpen: () => aberto };
})();
