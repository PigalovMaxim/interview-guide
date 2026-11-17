const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { root, loadContent } = require('./helpers.cjs');
const previous = require('./fixtures/previous-bank.json').cards;
const content = loadContent();
const currentKey = content.ratingsStorageKey;
const legacyKey = 'interview-guide.ratings';
const oldRatings = Object.fromEntries(previous.map((card,index)=>[card.id,['no_answer','basic','confident','deep'][index%4]]));
const legacyRecord = JSON.stringify({schemaVersion:1,ratingsById:oldRatings});
function storageFor(records) {
  return {getItem:key=>records.get(key)??null,setItem:(key,value)=>records.set(key,value),removeItem:key=>records.delete(key)};
}
function boot(localStorage) {
  const scope = {window:{InterviewContent:content,localStorage}};
  vm.runInNewContext(fs.readFileSync(path.join(root,'web/store.js'),'utf8'),scope);
  return scope.window.InterviewStore;
}
const plain = value => JSON.parse(JSON.stringify(value));

test('Редакция 5: retired оценка не попадает новой карточке, retained восстанавливается', () => {
  const { retiredId, card: replacement } = require('../data-sources/grade-replacements-2026-11-17.json')[0];
  const retained = content.materials.find(card => card.id.startsWith('project:')).id;
  const records = new Map([[currentKey, JSON.stringify({ schemaVersion: 1, ratingsById: { [retiredId]: 'deep', [retained]: 'basic' } })]]);
  const store = boot(storageFor(records));
  assert.deepEqual(plain(store.getState().ratingsById), { [retained]: 'basic' });
  assert.equal(store.getState().ratingsById[replacement.id], undefined);
  assert.match(store.getState().ratingsNotice, /частично/);
  store.rate(replacement.id, 'confident');
  assert.deepEqual(JSON.parse(records.get(currentKey)).ratingsById, { [retained]: 'basic', [replacement.id]: 'confident' });
  assert.equal(boot(storageFor(records)).getState().ratingsById[replacement.id], 'confident');
});

test('Прежние 540 оценок не приписываются новому банку и остаются нетронутыми', () => {
  const records = new Map([[legacyKey,legacyRecord],['interview-guide.theme','light']]);
  const store = boot(storageFor(records));
  assert.deepEqual(plain(store.getState().ratingsById),{});
  assert.equal(store.getState().theme,'light');
  assert.ok(store.getState().legacyNotice);
  store.rate(content.materials[0].id,'deep');
  assert.equal(records.get(legacyKey),legacyRecord);
  assert.equal(boot(storageFor(records)).getState().ratingsById[content.materials[0].id],'deep');
  store.clear();
  assert.equal(records.has(currentKey),false);
  assert.equal(records.get(legacyKey),legacyRecord);
  assert.equal(records.get('interview-guide.theme'),'light');
});

test('Все новые оценки восстанавливаются независимо от старого интервью', () => {
  const ratings = Object.fromEntries(content.materials.map((card,index)=>[card.id,['no_answer','basic','confident','deep'][index%4]]));
  const records = new Map([[legacyKey,legacyRecord],[currentKey,JSON.stringify({schemaVersion:1,ratingsById:ratings})]]);
  const store=boot(storageFor(records));
  assert.deepEqual(plain(store.getState().ratingsById),ratings);
  store.rate(content.materials[0].id,null);
  delete ratings[content.materials[0].id];
  assert.deepEqual(plain(boot(storageFor(records)).getState().ratingsById),ratings);
  assert.equal(records.get(legacyKey),legacyRecord);
});

test('Повреждённый старый архив не мешает новому интервью и не перезаписывается', () => {
  const records=new Map([[legacyKey,'not-json']]);
  const store=boot(storageFor(records));
  store.rate(content.materials[0].id,'basic');
  assert.equal(records.get(legacyKey),'not-json');
  assert.equal(boot(storageFor(records)).getState().ratingsById[content.materials[0].id],'basic');
});

test('Повреждённые новые данные защищены до явной очистки, архив сохраняется', () => {
  const records=new Map([[legacyKey,legacyRecord],[currentKey,'broken']]);
  const store=boot(storageFor(records));
  store.rate(content.materials[0].id,'confident');
  assert.equal(records.get(currentKey),'broken');
  assert.equal(store.getState().ratingsById[content.materials[0].id],'confident');
  store.clear();
  assert.equal(records.has(currentKey),false);
  assert.equal(records.get(legacyKey),legacyRecord);
});

test('При недоступном хранилище новое интервью работает в памяти', () => {
  const storage={getItem(){throw Error('blocked');},setItem(){throw Error('blocked');},removeItem(){throw Error('blocked');}};
  const store=boot(storage);
  store.rate(content.materials[0].id,'confident');
  assert.equal(store.getState().ratingsById[content.materials[0].id],'confident');
  assert.match(store.getState().ratingsNotice,/Не удалось/);
});

test('Архив v2 обнаруживается самостоятельно, не переносится и не меняется при оценке/очистке v3', () => {
  const v2Key='interview-guide.ratings.v2';
  const sharedTask=content.materials.find(card=>card.kind==='task').id;
  for(const archived of [JSON.stringify({schemaVersion:1,ratingsById:{[sharedTask]:'deep'}}),'broken-v2']) {
    const records=new Map([[v2Key,archived],['interview-guide.theme','light']]);
    const store=boot(storageFor(records));
    assert.ok(store.getState().legacyNotice);
    assert.deepEqual(plain(store.getState().ratingsById),{});
    store.rate(sharedTask,'basic');
    assert.equal(records.get(v2Key),archived);
    assert.equal(boot(storageFor(records)).getState().ratingsById[sharedTask],'basic');
    store.clear();
    assert.equal(records.get(v2Key),archived);
    assert.equal(records.has(currentKey),false);
    assert.equal(records.get('interview-guide.theme'),'light');
  }
});
