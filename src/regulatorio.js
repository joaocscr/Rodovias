// Aba Regulatório: resumo navegável do modelo, riscos, garantias, financiamento, otimizações e estudos.
const Regulatorio = (() => {
  const nf1 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 });
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let built = false;

  function blocoHtml(b) {
    if (b.tipo === 'p') return `<p>${esc(b.texto)}</p>`;
    if (b.tipo === 'lista') return `<ul>${b.itens.map(i => `<li>${esc(i)}</li>`).join('')}</ul>`;
    if (b.tipo === 'tabela') {
      return `<div class="table-wrap" style="max-height:none"><table class="grid"><thead><tr>${b.cabecalho.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead>` +
        `<tbody>${b.linhas.map(l => `<tr>${l.map(c => `<td style="white-space:normal">${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    }
    return '';
  }

  function otimizacoesTable(list) {
    return `<div class="table-wrap" style="max-height:none"><table class="grid" id="otimizacoes"><thead><tr><th>Contrato</th><th>BR/UF</th><th class="num">km</th><th class="num">Capex + opex (R$ bi)</th><th class="num">Prorrogação (anos)</th><th>Relicitação</th><th>Status</th></tr></thead><tbody>${
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
          ${s.id === 'otimizacoes' ? otimizacoesTable(r.otimizacoes) : ''}
          ${s.id === 'estudos' ? estudosList(conc.estudos) : ''}
        </section>`).join('')}</div>
      </div></div>`;
    el.querySelectorAll('[data-sec]').forEach(a => a.addEventListener('click', ev => {
      ev.preventDefault();
      document.getElementById('reg-' + a.dataset.sec).scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
    el.querySelectorAll('[data-estudo]').forEach(b => b.addEventListener('click', () => {
      const fis = conc.estudos[Number(b.dataset.estudo)].fis;
      Tabs.go('#mapa');
      setTimeout(() => { MapView.highlight(fis); MapView.fitTo(fis); }, 50);
    }));
  }

  return { init };
})();
