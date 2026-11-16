const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { loadContent } = require('./helpers.cjs');
const cases = require('./fixtures/task-cases.json');
const cards = loadContent().materials.filter(card => card.kind === 'task');

test('Реестр исполняемых проверок покрывает все 60 новых задач без пропусков', () => {
  assert.equal(cards.length, 60);
  assert.equal(cases.length, 60);
  assert.equal(new Set(cases.map(row => row.id)).size, 60);
  assert.deepEqual(cases.map(row => row.id).sort(), cards.map(card => card.id).sort());
});

for (const row of cases) test(row.id, { timeout: 3000 }, async () => {
  const card = cards.find(card => card.id === row.id);
  const scope = vm.createContext({ assert, URL, URLSearchParams, TextDecoder, TextEncoder, AbortController, structuredClone });
  await new vm.Script('(async () => {\n"use strict";\n' + card.solution.code + '\n' + row.check + '\n})()', { filename: card.id }).runInContext(scope, { timeout: 1000 });
});
