const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { root, loadContent, digestTask } = require('./helpers.cjs');
const baseline = require('./fixtures/bank-compatibility.json');
const content = loadContent();
const nonempty = value => typeof value === 'string' && value.trim().length > 0;

test('Сохранены 540 идентичностей и полнота всех 36 групп', () => {
  assert.equal(content.materials.length, 540);
  assert.equal(new Set(content.materials.map(card => card.id)).size, 540);
  const previous = new Map(baseline.map(card => [card.id, card]));
  for (const card of content.materials) {
    const old = previous.get(card.id);
    assert.ok(old, card.id);
    for (const key of ['topic', 'tab', 'ordinal', 'targetLevel']) assert.equal(card[key], old[key], `${card.id}: ${key}`);
    assert.deepEqual([card.context, card.references, card.verifiedAt], old.source, card.id + ': retained source context');
    if (card.kind === 'task') assert.equal(digestTask(card), old.taskDigest, card.id + ': task contract/solution preserved');
  }
  for (const topic of content.topics) for (const tab of content.tabs) {
    const rows = content.materials.filter(card => card.topic === topic.key && card.tab === tab.key);
    assert.deepEqual(rows.map(card => card.ordinal).sort((a,b) => a-b), Array.from({length:15},(_,i) => i+1));
  }
});

test('У каждой карточки есть основной кейс и две разные подписанные ветки', () => {
  const branchQuestions = new Set();
  for (const card of content.materials) {
    assert.ok(nonempty(card.question), card.id);
    assert.ok(!Object.hasOwn(card, 'questionPoints'), card.id);
    assert.deepEqual(card.followUps.map(branch => branch.kind), ['support', 'transfer'], card.id);
    for (const branch of card.followUps) {
      assert.deepEqual(Object.keys(branch).sort(), ['expected','kind','question']);
      assert.ok(nonempty(branch.question) && nonempty(branch.expected), card.id);
      assert.notEqual(branch.question, card.question, card.id);
      assert.notEqual(branch.question, branch.expected, card.id);
      assert.ok(!branchQuestions.has(branch.question), 'Repeated generic branch: ' + card.id);
      branchQuestions.add(branch.question);
    }
    for (const key of ['basic','confident','deep']) assert.ok(nonempty(card.assessment[key]), card.id + ': '+key);
    if (card.questionCode) assert.ok(nonempty(card.questionCodeLanguage), card.id);
  }
});

test('Методика различает уровни, помощь, перенос и альтернативные решения', () => {
  for (const tab of content.tabs) assert.ok(nonempty(tab.guidance));
  assert.match(content.interviewMethod.assessment, /всего основного задания/);
  assert.match(content.interviewMethod.assessment, /альтернатив/);
  assert.match(content.interviewMethod.followUps, /один вопрос/);
  assert.match(content.tabs.find(tab => tab.key === 'advanced').guidance, /ожидаемый уровень/);
});

test('Код и исправленные формулировки описывают согласованные кейсы', () => {
  const get = id => content.materials.find(card => card.id === id);
  assert.match(get('css:box-model').questionCode, /padding: 16px/);
  assert.doesNotMatch(get('css:box-model').question, /20px/);
  assert.match(get('css:var-invalid').question, /--x/);
  assert.ok(get('css:var-invalid').followUps.every(branch => !JSON.stringify(branch).includes('--tone')));
  assert.match(get('javascript:closure-basic').question, /Предскажите/);
  assert.match(get('javascript:prototype').followUps[1].question, /delete/);
  assert.doesNotMatch(get('coding:topological-order').assessment.confident, /Кана|DFS/);
});

test('Все поставляемые JavaScript-файлы синтаксически корректны', () => {
  const { Script } = require('node:vm');
  for (const directory of ['web', 'web/data']) for (const name of fs.readdirSync(path.join(root,directory)).filter(name => name.endsWith('.js'))) {
    assert.doesNotThrow(() => new Script(fs.readFileSync(path.join(root,directory,name),'utf8'), {filename:name}));
  }
});
