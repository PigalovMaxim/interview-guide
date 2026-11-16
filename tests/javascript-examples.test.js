const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { loadContent } = require('./helpers.cjs');
const cases = require('./fixtures/javascript-output.json');
const cards = loadContent().materials.filter(card => card.topic === 'javascript');
const represent = value => value === undefined ? 'undefined' : typeof value === 'number' && Number.isNaN(value) ? 'NaN' : JSON.stringify(value);

test('Все исполняемые примеры JavaScript зарегистрированы без пропусков', () => {
  assert.deepEqual(cases.map(row => row.id).sort(), cards.filter(card => card.questionCode).map(card => card.id).sort());
  assert.equal(new Set(cases.map(row => row.id)).size, cases.length);
});

for (const row of cases) test(row.id, { timeout: 2000 }, async () => {
  const card = cards.find(card => card.id === row.id);
  const actual = [];
  const scope = vm.createContext({
    console: { log: (...values) => actual.push(values.map(represent).join(' | ')) },
    URL, URLSearchParams, Response, Event, EventTarget, AbortController, structuredClone,
  });
  await new vm.Script('(async () => {\n"use strict";\n' + card.questionCode + '\n})()', { filename: card.id }).runInContext(scope, { timeout: 1000 });
  assert.deepEqual(actual, row.expected, card.title);
});
