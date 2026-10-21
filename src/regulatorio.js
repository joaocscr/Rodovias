// Aba Regulatório: resumo navegável do modelo, riscos, garantias, financiamento, otimizações e estudos, com os
// diagramas do fluxo do projeto (p. 61) e do financiamento (pp. 73–77). Os textos dos diagramas vêm todos de
// regulatorio.json (`diagramas`); aqui ficam só forma, cor e posição. As funções *Svg devolvem string (testáveis em Node).
const Regulatorio = (() => {
  const Ch = typeof Charts !== 'undefined' ? Charts : require('./charts.js');
  const nf1 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 });
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const r1 = v => Math.round(v * 10) / 10;
  let built = false;

  // ---- diagramas ----
  const W = 760, LH = 18, LH_DET = 16, PAD = 12;
  const CH_T = 7.4, CH_D = 6.6, IND = 10; // largura média de um caractere (px): título 14px seminegrito, detalhe 13px; recuo do item

  // Quebra o texto em linhas de até `max` caracteres, sem cortar palavras.
  function quebra(txt, max) {
    const out = [];
    let cur = '';
    for (const w of String(txt || '').split(/\s+/).filter(Boolean)) {
      if (cur && (cur + ' ' + w).length > max) { out.push(cur); cur = w; } else cur = cur ? `${cur} ${w}` : w;
    }
    if (cur) out.push(cur);
    return out;
  }

  // Linhas de texto: [{t, peso?, tam?, ind?}] a partir de y0 (linha de base da primeira), alinhadas em x (anchor opcional);
  // `ind` recua a linha (continuação de um item com marcador).
  function textos(linhas, x, y0, cor, anchor = 'start') {
    let y = y0;
    return linhas.map((l, i) => {
      if (i) y += l.tam ? LH_DET : LH;
      return `<text x="${r1(x + (l.ind ? IND : 0))}" y="${r1(y)}" fill="${cor}" text-anchor="${anchor}"${l.peso ? ` font-weight="${l.peso}"` : ''}${l.tam ? ` font-size="${l.tam}"` : ''}>${esc(l.t)}</text>`;
    }).join('');
  }
  // Itens de detalhe com marcador "•" e continuação recuada, em até `largura` px.
  const itens = (lista, largura) => lista.flatMap(item => quebra(item, Math.floor((largura - IND) / CH_D))
    .map((t, k) => (k ? { t, tam: 13, ind: true } : { t: `• ${t}`, tam: 13 })));
  const altura = linhas => linhas.reduce((a, l, i) => a + (i ? (l.tam ? LH_DET : LH) : 14), 0);

  function marcador(id, cor) {
    return `<marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 Z" fill="${cor}"/></marker>`;
  }

  function moldura(d, w, h, defs, body) {
    const id = `dg-${d.id}`;
    return `<svg class="diagrama__svg" viewBox="0 0 ${w} ${r1(h)}" role="img" aria-labelledby="${id}-t ${id}-d" font-family="Inter, sans-serif" font-size="14">` +
      `<title id="${id}-t">${esc(d.titulo)}</title><desc id="${id}-d">${esc(d.descricao)}</desc><defs>${defs}</defs>${body}</svg>`;
  }

  // Fluxo do projeto: etapas em coluna; entre `decisao.apos` e `decisao.para`, o losango da decisão com o ramo "sim"
  // para o aporte, que volta à etapa seguinte.
  function fluxoSvg(d) {
    const C = Ch.C, seta = `dg-${d.id}-seta`, etapas = d.etapas || [], dec = d.decisao;
    const X = 16, BW = 440, GAP = 26, cx = X + BW / 2;
    const linha = (x1, y1, x2, y2) => `<line class="seta" x1="${r1(x1)}" y1="${r1(y1)}" x2="${r1(x2)}" y2="${r1(y2)}" stroke="${C.spacial}" stroke-width="1.5" marker-end="url(#${seta})"/>`;
    let y = 8, body = '', hMax = 0;
    etapas.forEach((e, i) => {
      const ls = quebra(e.titulo, Math.floor((BW - 2 * PAD) / CH_T)).map(t => ({ t, peso: 600 }));
      if (e.responsavel) ls.push({ t: e.responsavel, tam: 13 });
      const h = altura(ls) + 2 * PAD + 4;
      const dica = `${e.titulo}${e.responsavel ? ` — ${e.responsavel}` : ''}${e.detalhe ? `: ${e.detalhe}` : ''}`;
      body += `<g class="etapa" data-etapa="${esc(e.id)}"><title>${esc(dica)}</title>` +
        `<rect x="${X}" y="${r1(y)}" width="${BW}" height="${r1(h)}" rx="6" fill="${C.deep}"/>${textos(ls, X + PAD, y + PAD + 14, C.snow)}</g>`;
      y += h;
      if (i === etapas.length - 1) return;
      if (!(dec && e.id === dec.apos && etapas[i + 1].id === dec.para)) {
        body += linha(cx, y, cx, y + GAP);
        y += GAP;
        return;
      }
      // decisão: losango, "sim" → aporte (à direita), "não" → etapa seguinte
      const top = y + 18, DW = 240, DH = 92, mid = top + DH / 2;
      const pq = quebra(dec.pergunta, 16).map(t => ({ t, peso: 600 }));
      body += linha(cx, y, cx, top) +
        `<g class="decisao"><title>${esc(dec.pergunta)}</title><path d="M${cx},${r1(top)} L${cx + DW / 2},${r1(mid)} L${cx},${r1(top + DH)} L${cx - DW / 2},${r1(mid)} Z" fill="${C.snow}" stroke="${C.bright}" stroke-width="2"/>` +
        `${textos(pq, cx, mid - altura(pq) / 2 + 10, C.spacial, 'middle')}</g>`;
      const AX = 500, AW = 244;
      const al = quebra(dec.sim, Math.floor((AW - 2 * PAD) / CH_T)).map(t => ({ t, peso: 600 }))
        .concat(quebra(dec.sim_detalhe, Math.floor((AW - 2 * PAD) / CH_D)).map(t => ({ t, tam: 13 })));
      const ah = altura(al) + 2 * PAD + 4, ay = mid - ah / 2;
      body += linha(cx + DW / 2, mid, AX, mid) +
        `<text x="${r1((cx + DW / 2 + AX) / 2)}" y="${r1(mid - 8)}" text-anchor="middle" fill="${C.grey}">${esc(dec.rotulo_sim)}</text>` +
        `<g class="aporte"><title>${esc(dec.sim)}${dec.sim_detalhe ? `: ${esc(dec.sim_detalhe)}` : ''}</title>` +
        `<rect x="${AX}" y="${r1(ay)}" width="${AW}" height="${r1(ah)}" rx="6" fill="${C.grey}"/>${textos(al, AX + PAD, ay + PAD + 14, C.snow)}</g>`;
      const prox = Math.max(top + DH + GAP, ay + ah + GAP);
      body += linha(cx, top + DH, cx, prox) +
        `<text x="${cx + 10}" y="${r1(top + DH + 16)}" fill="${C.grey}">${esc(dec.rotulo_nao)}</text>` +
        `<path class="seta" d="M${AX + AW / 2},${r1(ay + ah)} V${r1(prox + 19)} H${X + BW}" fill="none" stroke="${C.spacial}" stroke-width="1.5" marker-end="url(#${seta})"/>`;
      hMax = Math.max(hMax, ay + ah);
      y = prox;
    });
    return moldura(d, W, Math.max(y, hMax) + 8, marcador(seta, C.spacial), body);
  }

  // Financiamento: nós em três colunas (fontes → concessionária → usos e garantias), setas entre lados opostos.
  function colunasSvg(d) {
    const C = Ch.C, id = `dg-${d.id}`, nos = d.nos || [];
    const COL = { fonte: 0, concessionaria: 1, destino: 2, garantia: 2 };
    const GEO = [{ x: 8, w: 256 }, { x: 318, w: 124 }, { x: 496, w: 256 }];
    const EST = { fonte: [C.deep, C.snow], concessionaria: [C.spacial, C.snow], destino: [C.bright, C.snow], garantia: [C.snow, C.spacial] };
    const pos = {}, cols = [[], [], []];
    for (const n of nos) {
      const g = GEO[COL[n.tipo] ?? 2];
      const ls = quebra(n.titulo, Math.floor((g.w - 2 * PAD) / CH_T)).map(t => ({ t, peso: 600 }))
        .concat(itens(n.linhas || [], g.w - 2 * PAD))
        .concat(n.pagina ? [{ t: `p. ${n.pagina}`, tam: 13 }] : []); // página visível no próprio nó
      const p = { n, ls, x: g.x, w: g.w, h: altura(ls) + 2 * PAD + 4 };
      pos[n.id] = p;
      cols[COL[n.tipo] ?? 2].push(p);
    }
    const GAP = 14, alt = c => c.reduce((a, p) => a + p.h, 0) + Math.max(0, c.length - 1) * GAP;
    const H = Math.max(...cols.map(alt), 0) + 16;
    cols.forEach(c => { let y = (H - alt(c)) / 2; for (const p of c) { p.y = y; y += p.h + GAP; } });
    // pontas das setas distribuídas ao longo do lado de cada nó, na ordem vertical do outro extremo
    const arestas = (d.arestas || []).filter(a => pos[a.de] && pos[a.para]);
    const ponta = (p, lista, outro) => {
      const ord = lista.slice().sort((a, b) => pos[outro(a)].y - pos[outro(b)].y);
      return a => p.y + (p.h * (ord.indexOf(a) + 1)) / (ord.length + 1);
    };
    let body = '';
    for (const a of arestas) {
      const s = pos[a.de], t = pos[a.para];
      const ys = ponta(s, arestas.filter(b => b.de === a.de), b => b.para)(a);
      const yt = ponta(t, arestas.filter(b => b.para === a.para), b => b.de)(a);
      const gar = a.tipo === 'garantia';
      body += `<line class="aresta aresta--${esc(a.tipo)}" x1="${s.x + s.w}" y1="${r1(ys)}" x2="${t.x}" y2="${r1(yt)}" stroke="${gar ? C.grey : C.spacial}" stroke-width="1.5"` +
        `${gar ? ' stroke-dasharray="6 4"' : ''} marker-end="url(#${id}-seta${gar ? '-g' : ''})"/>`;
    }
    for (const p of Object.values(pos)) {
      const [fill, cor] = EST[p.n.tipo] || EST.destino, gar = p.n.tipo === 'garantia';
      const dica = `${p.n.titulo}${p.n.pagina ? ` (RoadShow, p. ${p.n.pagina})` : ''}${(p.n.linhas || []).length ? `: ${p.n.linhas.join('; ')}` : ''}`;
      body += `<g class="no" data-no="${esc(p.n.id)}" data-tipo="${esc(p.n.tipo)}"><title>${esc(dica)}</title>` +
        `<rect x="${p.x}" y="${r1(p.y)}" width="${p.w}" height="${r1(p.h)}" rx="6" fill="${fill}"${gar ? ` stroke="${C.grey}" stroke-width="1.5" stroke-dasharray="6 4"` : ''}/>` +
        `${textos(p.ls, p.x + PAD, p.y + PAD + 14, cor)}</g>`;
    }
    return moldura(d, W, H, marcador(`${id}-seta`, C.spacial) + marcador(`${id}-seta-g`, C.grey), body);
  }

  // Rodapé pela origem do diagrama (JSON): "esquema" = montado por nós com o texto das páginas; "adaptado" = figura
  // de uma página (pagina_figura) com acréscimos tirados do texto das demais; sem origem = figura do RoadShow.
  function rodape(d) {
    const pgs = (d.paginas || []).map(String);
    const rs = 'RoadShow 2026-2027';
    if (d.origem === 'esquema') return `Esquema elaborado com o texto do ${rs}, p. ${pgs.join(', ')}`;
    if (d.origem === 'adaptado') {
      const txt = pgs.filter(p => p !== String(d.pagina_figura));
      const lista = txt.length > 1 ? `${txt.slice(0, -1).join(', ')} e ${txt[txt.length - 1]}` : txt[0];
      return `Baseado na figura da p. ${d.pagina_figura}${txt.length ? ` e ${txt.length > 1 ? 'nos textos das pp.' : 'no texto da p.'} ${lista}` : ''} do ${rs}`;
    }
    return `Fonte: ${rs}, p. ${pgs.join(', ')}`;
  }

  // Figura com legenda (rótulos do JSON), o SVG, a nota (redação e o que é leitura nossa) e o rodapé de origem.
  function figuraHtml(d) {
    const C = Ch.C, l = d.legenda || {};
    const fluxo = Array.isArray(d.etapas);
    const legenda = fluxo
      ? [[l.etapa, C.deep], { label: l.decisao, color: C.bright, shape: 'diamond' }, [l.aporte, C.grey], { label: l.seta, color: C.spacial, shape: 'arrow' }]
      : [[l.fonte, C.deep], [l.concessionaria, C.spacial], [l.destino, C.bright], { label: l.garantia, color: C.grey, shape: 'line' },
        { label: l.recursos, color: C.spacial, shape: 'arrow' }];
    const nota = (d.redacoes || []).length || d.nota
      ? `<p class="src diagrama__nota">${(d.redacoes || []).length ? `Redação no RoadShow: ${d.redacoes.map(x => `p. ${esc(x.pagina)}, “${esc(x.texto)}”`).join('; ')}. ` : ''}${esc(d.nota || '')}</p>` : '';
    return `<figure class="diagrama" id="diagrama-${esc(d.id)}"><figcaption>${esc(d.titulo)}</figcaption>
      ${Ch.legendHtml(legenda.filter(it => (Array.isArray(it) ? it[0] : it.label)))}
      <div class="diagrama__box">${fluxo ? fluxoSvg(d) : colunasSvg(d)}</div>${nota}
      <p class="src diagrama__fonte">${esc(rodape(d))}</p></figure>`;
  }

  function blocoHtml(b) {
    if (b.tipo === 'p') return `<p>${esc(b.texto)}</p>`;
    if (b.tipo === 'lista') return `<ul>${b.itens.map(i => `<li>${esc(i)}</li>`).join('')}</ul>`;
    if (b.tipo === 'tabela') {
      return `<div class="table-wrap" style="max-height:none"><table class="grid" data-csv-name="regulatorio-${esc(b.cabecalho[0])}"><thead><tr>${b.cabecalho.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead>` +
        `<tbody>${b.linhas.map(l => `<tr>${l.map(c => `<td style="white-space:normal">${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    }
    return '';
  }

  function otimizacoesTable(list) {
    return `<div class="table-wrap" style="max-height:none"><table class="grid" id="otimizacoes" data-csv-name="regulatorio-otimizacoes"><thead><tr><th>Contrato</th><th>BR/UF</th><th class="num">km</th><th class="num">Capex + opex (R$ bi)</th><th class="num">Prorrogação (anos)</th><th>Relicitação</th><th>Status</th></tr></thead><tbody>${
      list.map(o => `<tr><td>${esc(o.nome)}</td><td>${esc('BR-' + o.brs.join('/') + '/' + o.ufs.join('/'))}</td><td class="num">${o.km == null ? '—' : nf1.format(o.km)}</td>
        <td class="num">${o.capex_opex == null ? '—' : nf1.format(o.capex_opex)}</td><td class="num">${o.prorrogacao_anos ?? '—'}</td>
        <td>${o.relicitacao == null ? '—' : o.relicitacao ? 'Sim' : 'Não'}</td><td>${esc(o.status || '—')}</td></tr>`).join('')}</tbody></table></div>`;
  }

  function estudosList(estudos) {
    return `<ul class="estudos">${estudos.map((s, i) => `<li>BR-${esc(s.brs.join('/'))}/${esc(s.ufs.join('/'))}${s.possivel_2027 ? ' · <b>possível para 2027</b>' : ''}
      <button type="button" class="link-btn" data-estudo="${i}" ${s.fis.length ? '' : 'disabled'}>ver no mapa</button></li>`).join('')}</ul>`;
  }

  function init(conc) {
    if (built) return;
    built = true;
    const r = conc.regulatorio;
    const el = document.getElementById('page-regulatorio');
    el.innerHTML = `<div class="page__inner">
      <h1 class="page__title">Regulatório e financiamento</h1>
      <p class="page__lead">Resumo fiel do RoadShow 2026-2027: modelo regulatório, mitigação de riscos, garantias, financiamento e otimizações contratuais. Sem interpretação jurídica própria; consulte as páginas indicadas.</p>
      <div class="reg">
        <nav class="reg__toc" aria-label="Seções do regulatório">${r.secoes.map(s => `<a href="#regulatorio" data-sec="${esc(s.id)}">${esc(s.titulo)}</a>`).join('')}</nav>
        <div>${r.secoes.map(s => `<section class="reg__sec" id="reg-${esc(s.id)}">
          <h2>${esc(s.titulo)}</h2><p class="page__src">RoadShow, p. ${esc((s.paginas || [s.pagina]).join(', '))}</p>
          ${s.blocos.map(blocoHtml).join('')}
          ${(r.diagramas || []).filter(d => d.secao === s.id).map(figuraHtml).join('')}
          ${s.id === 'otimizacoes' ? otimizacoesTable(r.otimizacoes) : ''}
          ${s.id === 'estudos' ? estudosList(conc.estudos) : ''}
        </section>`).join('')}</div>
      </div></div>`;
    el.querySelectorAll('[data-sec]').forEach(a => a.addEventListener('click', ev => {
      ev.preventDefault();
      document.getElementById('reg-' + a.dataset.sec).scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
    el.querySelectorAll('[data-estudo]').forEach(b => b.addEventListener('click', () => {
      const s = conc.estudos[Number(b.dataset.estudo)];
      UI.showOnMap(`Estudo pós-2027 BR-${s.brs.join('/')}/${s.ufs.join('/')}`, s.fis);
    }));
  }

  return { init, fluxoSvg, colunasSvg, quebra, rodape };
})();

if (typeof module !== 'undefined') module.exports = Regulatorio;
