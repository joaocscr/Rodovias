import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const MercadoModel = createRequire(import.meta.url)('../src/mercado-model.js');

test('rotuloConcorrentes: singular e plural de concorrentes e de leilões', () => {
  assert.equal(MercadoModel.rotuloConcorrentes(1, 1), '1 concorrente (1 leilão)');
  assert.equal(MercadoModel.rotuloConcorrentes(2, 5), '2 concorrentes (5 leilões)');
  assert.equal(MercadoModel.rotuloConcorrentes(5, 1), '5 concorrentes (1 leilão)');
  assert.equal(MercadoModel.rotuloConcorrentes(1, 7), '1 concorrente (7 leilões)');
  assert.ok(!/ões{2}|ãoões/.test(MercadoModel.rotuloConcorrentes(3, 8)));
});

test('plural: formata o número em pt-BR e flexiona pelo 1', () => {
  assert.equal(MercadoModel.plural(1, 'leilão', 'leilões'), '1 leilão');
  assert.equal(MercadoModel.plural(0, 'leilão', 'leilões'), '0 leilões');
  assert.equal(MercadoModel.plural(1234, 'km', 'km'), '1.234 km');
});

test('grupoOutrosPorUltimo: a linha "Outros …" vai para o fim e as demais mantêm a ordem', () => {
  const rows = [{ label: 'A', value: 5 }, { label: 'Outros 6 grupos', value: 99 }, { label: 'B', value: 4 }, { label: 'C', value: 1 }];
  const r = MercadoModel.grupoOutrosPorUltimo(rows);
  assert.deepEqual(r.map(x => x.label), ['A', 'B', 'C', 'Outros 6 grupos']);
  assert.deepEqual(rows.map(x => x.label), ['A', 'Outros 6 grupos', 'B', 'C'], 'não altera a entrada');
});

test('grupoOutrosPorUltimo: aceita linhas com "grupo" e não mexe quando não há "Outros"', () => {
  assert.deepEqual(MercadoModel.grupoOutrosPorUltimo([{ grupo: 'Outros 2 grupos' }, { grupo: 'X' }]).map(x => x.grupo), ['X', 'Outros 2 grupos']);
  assert.deepEqual(MercadoModel.grupoOutrosPorUltimo([{ label: 'Z' }, { label: 'Y' }]).map(x => x.label), ['Z', 'Y']);
  assert.deepEqual(MercadoModel.grupoOutrosPorUltimo([]), []);
  // um nome que apenas contém "Outros" no meio não é o agrupamento
  assert.deepEqual(MercadoModel.grupoOutrosPorUltimo([{ label: 'Grupo Outros' }, { label: 'A' }]).map(x => x.label), ['Grupo Outros', 'A']);
});

// ---- diagnóstico por ano ----
const ent = (id, estado, assinatura) => ({ id, estado, assinatura });
const conc = () => ({
  mercado: {
    fontes: { diagnostico: 29, gestao: 37 },
    diagnostico: [
      { ano: 2022, contratos: 24, km: 13022, valor: 198, invest_executado_acum: 129 },
      { ano: 2026, contratos: 41, km: 20739, valor: 489, invest_executado_acum: 170 },
      { ano: 2027, contratos: 50, km: 24459, valor: 575, invest_executado_acum: 195 },
      { ano: 2030, contratos: 77, km: 32959, valor: 770, invest_executado_acum: 430 },
    ],
    gestao: [2021, 2022, 2023, 2024, 2025, 2026].map((ano, i) => ({ ano, privada_km: 10000 + i * 1000, direta_km: 1 })),
  },
  entidades: [
    ent('a', 'vigente', '2008-02-14'), ent('b', 'vigente', '2022-12-31'), ent('c', 'programa', '2024-01-30'),
    ent('d', 'programa', '2025-07-18'), ent('e', 'programa', null), ent('f', 'projeto2027', null), ent('g', 'agendado2026', '2026-05-01'),
  ],
});
const intel = () => ({
  antt: {
    series: {
      x: { anos: [2021, 2022, 2023, 2024, 2025], investimento: [1e9, 2e9, 3e9, 4e9, 5e9] },
      y: { anos: [2023, 2024, 2025], investimento: [null, 1e9, 2e9] },
    },
  },
});
const por = (rows, ano) => rows.find(r => r.ano === ano);

test('diagnosticoPorAno: 2022, 2023–2025, 2026, 2027 e 2030; nunca 2028 nem 2029', () => {
  const rows = MercadoModel.diagnosticoPorAno(conc(), intel());
  assert.deepEqual(rows.map(r => r.ano), [2022, 2023, 2024, 2025, 2026, 2027, 2030]);
});

test('diagnosticoPorAno: anos da apresentação ficam como impressos, com a página', () => {
  const rows = MercadoModel.diagnosticoPorAno(conc(), intel());
  const r = por(rows, 2027);
  assert.deepEqual([r.contratos, r.km, r.valor, r.invest_executado_acum], [50, 24459, 575, 195]);
  for (const k of ['contratos', 'km', 'valor', 'invest_executado_acum']) assert.match(r.fontes[k], /RoadShow, p\. 29/);
  assert.equal(por(rows, 2022).previsto, false);
  assert.equal(por(rows, 2026).previsto, true);
  assert.equal(por(rows, 2030).previsto, true);
});

test('diagnosticoPorAno: contratos = contratos vigentes assinados até 31/12 do ano; km da série de gestão', () => {
  const rows = MercadoModel.diagnosticoPorAno(conc(), intel());
  // 2023: a (2008) e b (31/12/2022); 2024: + c; 2025: + d. "e" sem data, "f"/"g" não são contrato.
  assert.deepEqual([2023, 2024, 2025].map(a => por(rows, a).contratos), [2, 3, 4]);
  assert.deepEqual([2023, 2024, 2025].map(a => por(rows, a).km), [12000, 13000, 14000]);
  assert.match(por(rows, 2024).fontes.km, /RoadShow, p\. 37/);
  assert.match(por(rows, 2024).fontes.contratos, /31\/12\/2024/);
  assert.equal(por(rows, 2024).previsto, false);
});

test('diagnosticoPorAno: investimento executado acumulado = último acumulado impresso + série da ANTT dos anos seguintes (R$ bi)', () => {
  const rows = MercadoModel.diagnosticoPorAno(conc(), intel());
  // 129 (2022) + 3 (2023) = 132; + 4 + 1 (2024) = 137; + 5 + 2 (2025) = 144
  assert.deepEqual([2023, 2024, 2025].map(a => por(rows, a).invest_executado_acum), [132, 137, 144]);
  assert.match(por(rows, 2025).fontes.invest_executado_acum, /RoadShow, p\. 29/);
  assert.match(por(rows, 2025).fontes.invest_executado_acum, /ANTT/);
  assert.match(por(rows, 2025).fontes.invest_executado_acum, /2023 a 2025/);
  assert.match(por(rows, 2023).fontes.invest_executado_acum, /investimento de 2023 nas séries/, 'um ano só: "de 2023", não "de 2023 a 2023"');
});

test('diagnosticoPorAno: valor dos contratos não publicado em 2023–2025 fica nulo com a fonte "não publicado"', () => {
  const r = por(MercadoModel.diagnosticoPorAno(conc(), intel()), 2024);
  assert.equal(r.valor, null);
  assert.equal(r.fontes.valor, 'não publicado');
});

test('diagnosticoPorAno: sem série da ANTT para o ano, o investimento fica nulo ("não publicado"), nunca inventado', () => {
  const sem = { antt: { series: { x: { anos: [2021, 2022, 2023], investimento: [1e9, 2e9, 3e9] } } } };
  const rows = MercadoModel.diagnosticoPorAno(conc(), sem);
  assert.equal(por(rows, 2023).invest_executado_acum, 132);
  assert.equal(por(rows, 2024).invest_executado_acum, null);
  assert.equal(por(rows, 2025).invest_executado_acum, null);
  assert.equal(por(rows, 2025).fontes.invest_executado_acum, 'não publicado');
  const nada = MercadoModel.diagnosticoPorAno(conc(), null);
  assert.deepEqual([2023, 2024, 2025].map(a => por(nada, a).invest_executado_acum), [null, null, null]);
  assert.deepEqual(nada.map(r => r.ano), [2022, 2023, 2024, 2025, 2026, 2027, 2030]);
});

test('diagnosticoPorAno: sem série de gestão para o ano, o ano não aparece (nada interpolado)', () => {
  const c = conc();
  c.mercado.gestao = c.mercado.gestao.filter(g => g.ano !== 2024);
  assert.deepEqual(MercadoModel.diagnosticoPorAno(c, intel()).map(r => r.ano), [2022, 2023, 2025, 2026, 2027, 2030]);
});

test('diagnosticoNota: lista os anos sem publicação dentro do intervalo', () => {
  const rows = MercadoModel.diagnosticoPorAno(conc(), intel());
  assert.equal(MercadoModel.diagnosticoNota(rows), '2028 e 2029: nenhuma fonte publica esses anos; ficam fora da tabela, sem interpolação.');
  assert.equal(MercadoModel.diagnosticoNota([{ ano: 2022 }, { ano: 2023 }]), '');
  assert.equal(MercadoModel.diagnosticoNota([{ ano: 2026 }, { ano: 2028 }]), '2027: nenhuma fonte publica esse ano; fica fora da tabela, sem interpolação.');
});

test('diagnosticoPorAno: números com erro de dado não geram NaN', () => {
  const c = conc();
  c.entidades.push({ id: 'z', estado: 'vigente', assinatura: 'lixo' });
  const rows = MercadoModel.diagnosticoPorAno(c, intel());
  assert.ok(!/NaN|undefined/.test(JSON.stringify(rows)));
});

test('diagnosticoNotaDerivados: só aparece quando há ano calculado pelo painel', () => {
  assert.match(MercadoModel.diagnosticoNotaDerivados(MercadoModel.diagnosticoPorAno(conc(), intel())), /só os vigentes hoje/);
  assert.equal(MercadoModel.diagnosticoNotaDerivados([{ ano: 2022, derivado: false }]), '');
});
