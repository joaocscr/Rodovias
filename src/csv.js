// Exportar CSV: um botão antes de cada table.grid. Excel pt-BR: BOM UTF-8, separador ";", CRLF.
// Células que começam como fórmula (=, +, -, @, tab, CR) ganham prefixo ' para não serem executadas.
const Csv = (() => {
  const SEP = ';';
  const BOM = '﻿';

  function cell(v) {
    let s = v == null ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  }

  function build(headers, rows) {
    return BOM + [headers, ...rows].map(r => r.map(cell).join(SEP)).join('\r\n');
  }

  const slug = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

  function filename(base, date = new Date()) {
    const p = n => String(n).padStart(2, '0');
    const d = `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
    return `${slug(base) || 'tabela'}-${d}.csv`;
  }

  // ---- DOM (só no navegador) ----
  const norm = s => String(s || '').replace(/\s+/g, ' ').trim();

  // Texto da célula sem o conteúdo só para leitores de tela; links http(s)/mailto acrescentam " (<href>)".
  function cellText(el) {
    const clone = el.cloneNode(true);
    clone.querySelectorAll('.visually-hidden').forEach(n => n.remove());
    let txt = norm(clone.textContent);
    const hrefs = [...el.querySelectorAll('a[href]')].map(a => a.href).filter(h => /^(https?:|mailto:)/i.test(h));
    for (const h of [...new Set(hrefs)]) txt += ` (${h})`;
    return txt;
  }

  const isHidden = tr => tr.hidden || tr.style.display === 'none' ||
    (typeof getComputedStyle === 'function' && getComputedStyle(tr).display === 'none');

  function fromTable(table) {
    const ths = [...table.querySelectorAll('thead th')];
    // Coluna sem texto visível (ex.: "ver no mapa") fica de fora, no cabeçalho e nas linhas.
    const headers = [], keep = [];
    ths.forEach((th, i) => {
      const clone = th.cloneNode(true);
      clone.querySelectorAll('.visually-hidden').forEach(n => n.remove());
      const t = norm(clone.textContent).replace(/\s[↑↓]$/, '');
      if (t) { headers.push(t); keep.push(i); }
    });
    const rows = [...table.querySelectorAll('tbody tr')].filter(tr => !isHidden(tr)).map(tr => {
      const tds = [...tr.children];
      return keep.map(i => (tds[i] ? cellText(tds[i]) : ''));
    });
    return { headers, rows };
  }

  function baseName(table) {
    if (table.dataset.csvName) return table.dataset.csvName;
    if (table.id) return table.id;
    const box = table.closest('.ccard, .fblock');
    const h = box && box.querySelector('h3');
    return (h && norm(h.textContent)) || 'tabela';
  }

  function download(table) {
    const { headers, rows } = fromTable(table);
    const blob = new Blob([build(headers, rows)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename(baseName(table));
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // O clique lê a tabela na hora (filtros e ordenação atuais). Se a tabela foi recriada dentro do mesmo
  // contêiner, o botão existente é reaproveitado em vez de duplicado.
  function enhance(root = document) {
    root.querySelectorAll('table.grid:not([data-csv])').forEach(table => {
      table.dataset.csv = '1';
      const anchor = table.closest('.table-wrap') || table;
      const prev = anchor.previousElementSibling;
      if (prev && prev.classList.contains('csv-btn')) { prev._csvTable = table; return; }
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'csv-btn';
      btn.textContent = 'Exportar CSV';
      btn._csvTable = table;
      btn.addEventListener('click', () => download(btn._csvTable));
      anchor.parentNode.insertBefore(btn, anchor);
    });
  }

  function init() {
    enhance();
    let pend = false;
    new MutationObserver(() => {
      if (pend) return;
      pend = true;
      queueMicrotask(() => { pend = false; enhance(); });
    }).observe(document.body, { childList: true, subtree: true });
  }

  return { cell, build, fromTable, filename, baseName, enhance, init };
})();

if (typeof module !== 'undefined') module.exports = Csv;
