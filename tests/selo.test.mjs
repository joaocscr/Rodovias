import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const Selo = createRequire(import.meta.url)('../src/selo.js');

const antt = { id: 'a', tipo: 'oficial', orgao: 'ANTT', titulo: 'Deliberação nº 1', data: '2025-10-30', url: 'https://www.gov.br/antt/x', pagina: null, acesso: '2026-10-21', trecho: null };
const rs = { id: 'rs-p97', tipo: 'roadshow', orgao: null, titulo: null, data: null, url: null, pagina: 97, acesso: null, trecho: null };

test('rotulo', () => {
  assert.deepEqual(['oficial', 'roadshow', 'imprensa', null].map(Selo.rotulo),
    ['oficial', 'RoadShow', 'imprensa — não oficial', 'não localizado em fonte oficial']);
});
test('fonteTexto', () => {
  assert.equal(Selo.fonteTexto(antt), 'ANTT — Deliberação nº 1 (30/10/2025)');
  assert.equal(Selo.fonteTexto(rs), 'RoadShow, p. 97');
  assert.equal(Selo.fonteTexto({ tipo: 'imprensa', orgao: 'Valor', titulo: null, data: null }), 'Valor');
});
test('badge: vazio sem verificação; link para a primeira fonte com url e title com todas', () => {
  assert.equal(Selo.badge(undefined), '');
  assert.equal(Selo.badge(null), '');
  const h = Selo.badge({ tipo: 'oficial', nao_localizado: false, fontes: [rs, antt] });
  assert.match(h, /^<span class="selo selo--oficial"/);
  assert.match(h, /<a href="https:\/\/www\.gov\.br\/antt\/x" target="_blank" rel="noopener">oficial<\/a>/);
  assert.match(h, /title="RoadShow, p\. 97&#10;ANTT — Deliberação nº 1 \(30\/10\/2025\)"/);
});
test('badge: não localizado, sem link; deságio limitado pelo edital no title', () => {
  const nl = Selo.badge({ tipo: null, nao_localizado: true, fontes: [rs] });
  assert.match(nl, /class="selo selo--nao-localizado"/);
  assert.match(nl, />não localizado em fonte oficial</);
  assert.doesNotMatch(nl, /<a /);
  assert.match(Selo.badge({ tipo: 'oficial', fontes: [antt], limitado_pelo_edital: true }), /limitado pelo edital; desempate por outorga/);
});
test('badge escapa o texto das fontes', () => {
  const h = Selo.badge({ tipo: 'imprensa', fontes: [{ tipo: 'imprensa', orgao: 'A "B" <C>', titulo: null, data: null, url: null }] });
  assert.match(h, /title="A &quot;B&quot; &lt;C&gt;"/);
});
test('badge e fonte só geram link para http(s); outro esquema vira texto', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,x', 'vbscript:x', ' javascript:x']) {
    const f = { tipo: 'imprensa', orgao: 'Valor', titulo: 'T', data: null, url };
    const b = Selo.badge({ tipo: 'imprensa', fontes: [f] });
    assert.doesNotMatch(b, /<a |href=/, url);
    assert.match(b, />imprensa — não oficial</);
    const h = Selo.fonte(f);
    assert.doesNotMatch(h, /<a |href=/, url);
    assert.match(h, /Valor — T$/);
  }
  // pula a fonte com esquema inválido e usa a próxima http(s)
  assert.match(Selo.badge({ tipo: 'oficial', fontes: [{ ...antt, url: 'javascript:x' }, antt] }), /href="https:\/\/www\.gov\.br\/antt\/x"/);
  assert.match(Selo.fonte({ ...antt, url: 'HTTP://www.gov.br/antt/x' }), /class="link-btn" href="HTTP:\/\/www\.gov\.br\/antt\/x"/);
});
