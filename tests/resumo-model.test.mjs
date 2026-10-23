// Testes do modelo de "Sobre este painel" (aba Resumo): uma linha por fonte embutida, com data-base e acesso lidos dos blocos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const ResumoModel = require('../src/resumo-model.js');
const lerJson = rel => JSON.parse(fs.readFileSync(new URL(rel, import.meta.url), 'utf8'));

const desc = {
  roadshow: { nome: 'Carteira do Ministério', oQue: 'Apresentação a investidores sobre as concessões 2026–2027{edicao}.', termo: 'roadshow' },
  verificacao: { nome: 'Conferência dos leilões', oQue: 'Atas e editais usados para conferir cada leilão.' },
  agro: { nome: 'Produção agrícola', oQue: 'Safras e armazéns.' },
  debentures: { nome: 'Debêntures', oQue: 'Negócios com debêntures.' },
};
const intel = {
  fontes: {
    base: [{ bloco: 'roadshow', nome: 'RoadShow', periodo: '14/10/2026', acesso: '2026-10-20' }],
    fontes: [
      { bloco: 'agro', nome: 'PAM', periodo: '2025', acesso: '2026-10-20' },
      { bloco: 'agro', nome: 'Estoques', periodo: '2º semestre 2025', acesso: '2026-10-22' },
      { bloco: 'agro', nome: 'PAM de novo', periodo: '2025', acesso: '2026-10-20' },
      { bloco: 'debentures', nome: 'Negócios', periodo: '2026-09/2026-10', acesso: '2026-10-22' },
    ],
  },
};
const conc = {
  edicaoRoadshow: 'edição de 14/10/2026',
  verificacao: { fontes: [{ tipo: 'roadshow' }, { tipo: 'oficial', data: '2023-08-25', acesso: '2026-10-21' },
    { tipo: 'imprensa', data: '2007-12-12', acesso: '2026-10-21' }, { tipo: 'oficial', data: '2026-09-30', acesso: '2026-10-20' }] },
};

test('uma linha por fonte embutida, na ordem do arquivo de descrições', () => {
  const r = ResumoModel.sobrePainel(conc, intel, desc);
  assert.deepEqual(r.fontes.map(f => f.id), ['roadshow', 'verificacao', 'agro', 'debentures']);
  assert.deepEqual(r.semDescricao, []);
});

test('data-base e acesso saem dos blocos, em dd/mm/aaaa, sem repetir nem digitar nada', () => {
  const por = id => ResumoModel.sobrePainel(conc, intel, desc).fontes.find(f => f.id === id);
  assert.equal(por('roadshow').dataBase, '14/10/2026');
  assert.equal(por('roadshow').acesso, '20/10/2026');
  // vários períodos do mesmo bloco: só do menor ao maior ano (cada fonte tem o seu período na aba Fontes); acessos: do mais antigo ao mais recente
  assert.equal(por('agro').dataBase, '2025');
  assert.equal(por('agro').acesso, '20/10/2026 a 22/10/2026');
  assert.equal(por('debentures').dataBase, 'set/2026 a out/2026');
  // verificação: intervalo das datas dos documentos e acesso mais antigo a mais recente
  assert.equal(por('verificacao').dataBase, 'documentos de 12/12/2007 a 30/09/2026');
  assert.equal(por('verificacao').acesso, '20/10/2026 a 21/10/2026');
});

test('bloco com fontes de anos diferentes diz que varia por fonte, ignorando códigos de versão', () => {
  const i = { fontes: { fontes: [
    { bloco: 'agro', nome: 'A', periodo: 'jan/2024 a ago/2026', acesso: '2026-10-20' },
    { bloco: 'agro', nome: 'B', periodo: '2010 a 2025', acesso: '2026-10-20' },
    { bloco: 'agro', nome: 'C', periodo: 'versão 202607A (jul/2026)', acesso: '2026-10-20' }] } };
  assert.equal(ResumoModel.sobrePainel({}, i, desc).fontes[0].dataBase, 'varia por fonte (de 2010 a 2026)');
  const sem = { fontes: { fontes: [{ bloco: 'agro', nome: 'A', periodo: 'vigente', acesso: '2026-10-20' }, { bloco: 'agro', nome: 'B', periodo: 'atual', acesso: '2026-10-20' }] } };
  assert.equal(ResumoModel.sobrePainel({}, sem, desc).fontes[0].dataBase, 'vigente; atual');
});

test('ano de dado vem só do período de cada fonte, fora de parênteses: "PNL 2035" numa nota não vira ano de dado', () => {
  const i = { fontes: { fontes: [
    { bloco: 'agro', nome: 'A', periodo: 'ano-base 2017 (cenário-base do PNL 2035)', acesso: '2026-10-20' },
    { bloco: 'agro', nome: 'B', periodo: '2023 (SNV 202401A)', acesso: '2026-10-20' },
    { bloco: 'agro', nome: 'C', periodo: 'arquivos consultados (out/2026)', acesso: '2026-10-20' }] } };
  assert.equal(ResumoModel.sobrePainel({}, i, desc).fontes[0].dataBase, 'varia por fonte (de 2017 a 2026)');
  const so = { fontes: { fontes: [
    { bloco: 'agro', nome: 'A', periodo: 'ano-base 2017 (cenário-base do PNL 2035)', acesso: '2026-10-20' },
    { bloco: 'agro', nome: 'B', periodo: '2019', acesso: '2026-10-20' }] } };
  assert.equal(ResumoModel.sobrePainel({}, so, desc).fontes[0].dataBase, 'varia por fonte (de 2017 a 2019)');
});

test('segmentos: cada termo vira link só na primeira ocorrência do seu texto; texto ausente ou sobreposto é ignorado', () => {
  const termos = [{ id: 'dnit', texto: 'DNIT' }, { id: 'prf', texto: 'PRF' }, { id: 'x', texto: 'não está' }, { id: 'sobre', texto: 'NIT mantido' }];
  const seg = ResumoModel.segmentos('Mantido pelo DNIT; o DNIT e a PRF.', termos);
  assert.deepEqual(seg, [{ texto: 'Mantido pelo ' }, { texto: 'DNIT', id: 'dnit' }, { texto: '; o DNIT e a ' }, { texto: 'PRF', id: 'prf' }, { texto: '.' }]);
  assert.equal(seg.map(s => s.texto).join(''), 'Mantido pelo DNIT; o DNIT e a PRF.');
  assert.deepEqual(ResumoModel.segmentos('sem termos', undefined), [{ texto: 'sem termos' }]);
  assert.deepEqual(ResumoModel.segmentos(null, termos), []);
  // a ordem no texto manda, não a ordem em que os termos foram declarados
  assert.deepEqual(ResumoModel.segmentos('A PRF e o DNIT', termos).filter(s => s.id).map(s => s.id), ['prf', 'dnit']);
});

test('sobrePainel devolve os termos declarados da fonte (lista vazia quando não há)', () => {
  const d2 = { ...desc, agro: { ...desc.agro, termos: [{ id: 'pam', texto: 'Safras' }] } };
  const r = ResumoModel.sobrePainel(conc, intel, d2).fontes;
  assert.deepEqual(r.find(f => f.id === 'agro').termos, [{ id: 'pam', texto: 'Safras' }]);
  assert.deepEqual(r.find(f => f.id === 'verificacao').termos, []);
});

test('a edição do RoadShow vem de conc.edicaoRoadshow; sem ela a frase não deixa sobra', () => {
  const com = ResumoModel.sobrePainel(conc, intel, desc).fontes.find(f => f.id === 'roadshow');
  assert.equal(com.oQue, 'Apresentação a investidores sobre as concessões 2026–2027, edição de 14/10/2026.');
  assert.equal(com.termo, 'roadshow');
  const sem = ResumoModel.sobrePainel({}, intel, desc).fontes.find(f => f.id === 'roadshow');
  assert.equal(sem.oQue, 'Apresentação a investidores sobre as concessões 2026–2027.');
});

test('bloco novo (ex.: debêntures) entra sozinho quando tem fonte e descrição; sem descrição, o teste lista', () => {
  const { debentures, ...semDeb } = desc;
  const r = ResumoModel.sobrePainel(conc, intel, semDeb);
  assert.deepEqual(r.semDescricao, ['debentures']);
  const linha = r.fontes.find(f => f.id === 'debentures');
  assert.equal(linha.oQue, null);
  assert.equal(linha.nome, 'Negócios');  // sem descrição, mostra o nome da fonte embutida
  assert.equal(linha.dataBase, 'set/2026 a out/2026');
});

test('sem blocos de dados não há linhas nem erro', () => {
  assert.deepEqual(ResumoModel.sobrePainel(null, null, desc), { fontes: [], semDescricao: [] });
  assert.deepEqual(ResumoModel.sobrePainel({}, { fontes: {} }, desc), { fontes: [], semDescricao: [] });
  assert.deepEqual(ResumoModel.sobrePainel(conc, intel, undefined).semDescricao.sort(), ['agro', 'debentures', 'roadshow', 'verificacao']);
});

test('toda fonte embutida em data/intel/fontes.json tem descrição curada em data/fontes_descricao.json', () => {
  const fontes = lerJson('../data/intel/fontes.json');
  const concReal = { edicaoRoadshow: 'edição de 14/10/2026', verificacao: { fontes: [{ tipo: 'oficial', data: '2023-08-25', acesso: '2026-10-21' }] } };
  const r = ResumoModel.sobrePainel(concReal, { fontes }, lerJson('../data/fontes_descricao.json'));
  assert.deepEqual(r.semDescricao, [], `fontes sem descrição em data/fontes_descricao.json: ${r.semDescricao.join(', ')}`);
  for (const f of r.fontes) {
    assert.ok(f.nome && f.oQue && f.dataBase !== '—' && f.acesso !== '—', JSON.stringify(f));
    assert.doesNotMatch(JSON.stringify(f), /undefined|NaN|\{edicao\}/);
  }
});

test('bloco com várias fontes do mesmo ano: da data mais antiga à mais recente dos períodos, em dd/mm/aaaa', () => {
  const d = { deb: { nome: 'Debêntures', oQue: 'x' } };
  const dataBase = periodos => ResumoModel.sobrePainel({}, { fontes: { fontes: periodos.map((p, i) => ({ bloco: 'deb', nome: `F${i}`, periodo: p, acesso: '2026-10-22' })) } }, d).fontes[0].dataBase;
  assert.equal(dataBase(['tela de 21/10/2026 a 22/10/2026; negócios de 01/10/2026 a 05/10/2026', 'Selic meta: 22/10/2026; CDI: 21/10/2026; IPCA 12 meses: 09/2026', '16/10/2026', '01/10/2026 a 15/10/2026']),
    '01/10/2026 a 22/10/2026');
  // uma só data em todos os períodos, ou períodos sem dia: continua o ano
  assert.equal(dataBase(['22/10/2026', 'tela de 22/10/2026']), '2026');
  assert.equal(dataBase(['2026-09/2026-10', '09/2026']), '2026');
  // anos diferentes: a variação entre fontes, como antes
  assert.equal(dataBase(['01/10/2025 a 05/10/2025', '22/10/2026']), 'varia por fonte (de 2025 a 2026)');
});
