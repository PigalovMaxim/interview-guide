const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { root, loadContent } = require('./helpers.cjs');
const baseline = require('./fixtures/bank-compatibility.json');
const ratingsById = Object.fromEntries(baseline.map((card,index) => [card.id,['no_answer','basic','confident','deep'][index%4]]));
function boot(localStorage) {
  const scope = { window: { InterviewContent: loadContent(), localStorage } };
  vm.runInNewContext(fs.readFileSync(path.join(root,'web/store.js'),'utf8'),scope);
  return scope.window.InterviewStore;
}
test('Прежние оценки восстанавливаются по тем же ID и сохраняются в прежней схеме', () => {
  const records = new Map([['interview-guide.ratings', JSON.stringify({schemaVersion:1,ratingsById})]]);
  const storage = {getItem:key=>records.get(key)??null,setItem:(key,value)=>records.set(key,value),removeItem:key=>records.delete(key)};
  const store = boot(storage);
  assert.deepEqual(JSON.parse(JSON.stringify(store.getState().ratingsById)), ratingsById);
  store.rate(baseline[0].id,'deep');
  const restored = boot(storage).getState();
  assert.equal(restored.ratingsById[baseline[0].id],'deep');
  assert.equal(Object.keys(restored.ratingsById).length,540);
});
test('При недоступном хранилище интервью продолжает работать в памяти', () => {
  const storage = {getItem(){throw Error('blocked');},setItem(){throw Error('blocked');},removeItem(){throw Error('blocked');}};
  const store = boot(storage);
  store.rate(baseline[0].id,'confident');
  assert.equal(store.getState().ratingsById[baseline[0].id],'confident');
  assert.match(store.getState().ratingsNotice,/Не удалось/);
});
