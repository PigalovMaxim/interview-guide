const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { root, loadContent, digestTask } = require('./helpers.cjs');
const easy = require('../data-sources/easyoffer-2026-11-16.json');
const extra = require('../data-sources/kavalchuk-selection-2026-11-16.json');
const preserved = require('../data-sources/coding-preserved.json');
const verification = require('../data-sources/technical-verification-2026-11-17.json');
const content = loadContent();
const questions = content.materials.filter(card => card.kind === 'question');
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

test('Редакция 3: ровно 85 вопросов из двух подборок, уникальные ID, архивы отделены', () => {
  assert.equal(content.revision, 3);
  assert.equal(content.ratingsStorageKey, 'interview-guide.ratings.v3');
  assert.equal(content.materials.length, 145);
  assert.equal(questions.length, 85);
  assert.equal(new Set(content.materials.map(card => card.id)).size, 145);
  const expected = [];
  for (const [level, list] of Object.entries(easy.levels)) for (const row of list.results) {
    const id = `easyoffer:${level}:${row.id}`;
    const card = questions.find(card => card.id === id);
    if (!row.accepted) { assert.equal(card, undefined, id + ': отклонённый вопрос'); continue; }
    expected.push(id);
    assert.ok(card, id);
    assert.equal(card.question, row.title, id);
    assert.equal(card.title, row.title, id);
    assert.equal(card.tab, level);
    assert.equal(card.source.sourceId, row.id);
    assert.equal(card.source.level, level);
    assert.equal(card.source.provider, 'EasyOffer');
    assert.equal(card.source.retrievedAt, easy.retrievedAt);
    assert.equal(card.source.url, 'https://easyoffer.ru/frontend-developer/question/' + row.slug);
    assert.equal(card.source.listUrl, list.url);
  }
  for (const row of extra.records.filter(row => row.accepted)) {
    assert.equal(row.title, row.sourceText.replaceAll('`', ''), row.id + ': исходная формулировка');
    assert.equal(row.url, extra.repository + '/blob/' + extra.commit + '/' + row.sourcePath + '#L' + row.line, row.id + ': permalink');
    expected.push(row.id);
    const card = questions.find(card => card.id === row.id);
    assert.ok(card, row.id);
    assert.equal(card.question, row.title);
    assert.equal(card.title, row.title);
    assert.equal(card.topic, row.topic);
    assert.equal(card.tab, row.level);
    assert.equal(card.source.level, row.level);
    assert.equal(card.source.url, row.url);
    assert.equal(card.source.provider, extra.provider);
    assert.equal(card.source.retrievedAt, extra.retrievedAt);
    assert.equal(card.source.commit, extra.commit);
    assert.equal(card.source.path, row.sourcePath);
    assert.equal(card.source.line, row.line);
  }
  assert.deepEqual(questions.map(card => card.id).sort(), expected.sort());
  const easyTitles = new Set(questions.filter(card => card.source.provider === easy.provider).map(card => card.title));
  const extraCards = questions.filter(card => card.source.provider === extra.provider);
  assert.ok(extraCards.every(card => !easyTitles.has(card.title)), 'Дубль названия между источниками');
  assert.equal(new Set(extraCards.map(card => card.title)).size, extraCards.length);
  assert.deepEqual(['junior','middle','senior'].map(tab => questions.filter(card => card.tab === tab).length), [32,28,25]);
});

test('Контрольные суммы 60 задач после согласованной коррекции calendar-date совпадают', () => {
  const tasks = content.materials.filter(card => card.kind === 'task');
  assert.equal(tasks.length, 60);
  assert.deepEqual(tasks.map(card => card.id).sort(), preserved.map(card => card.id).sort());
  for (const row of preserved) {
    const card = tasks.find(card => card.id === row.id);
    assert.equal(digestTask(card), row.digest, row.id + ': контракт/решение');
    assert.equal(hash(JSON.stringify(card)), row.cardDigest, row.id + ': вся карточка');
  }
  assert.equal(hash(fs.readFileSync(path.join(root,'web/data/coding.js'),'utf8').replaceAll('\r\n','\n')), '30cf1f2be9b8574fb6809b474aa4748bf65a9f643cd3eea4278c7b568766de4c');
});

test('9 тем и 4 вкладки, последовательные ordinal, допустимые пустые группы', () => {
  assert.equal(content.topics.length, 9);
  assert.equal(content.tabs.length, 4);
  for (const topic of content.topics) for (const tab of content.tabs) {
    const rows = content.materials.filter(card => card.topic === topic.key && card.tab === tab.key);
    assert.deepEqual(rows.map(card => card.ordinal).sort((a,b) => a-b), Array.from({length:rows.length},(_,i) => i+1), topic.key+'/'+tab.key);
    if (topic.key === 'coding') assert.equal(rows.length,15);
    else if (tab.key === 'advanced' || topic.key === 'tanstack-query') assert.equal(rows.length,0);
    for (const card of rows) {
      assert.ok(['junior','middle','senior'].includes(card.targetLevel), card.id);
      if (tab.key !== 'advanced') assert.equal(card.targetLevel,tab.key,card.id);
      else assert.ok(card.angles.length > 0 && card.angles.every(angle => ['engineering','nuance'].includes(angle)),card.id);
      assert.equal(card.kind === 'task',topic.key === 'coding',card.id);
    }
  }
});

test('Разборы полны, редакционные, с первичными источниками и двумя ветками', () => {
  const auditedReferences = new Map(verification.references.map(reference => [reference.url, reference]));
  for (const card of content.materials) {
    for (const field of ['question','shortAnswer','explanation','context','verifiedAt']) assert.ok(nonempty(card[field]),card.id+': '+field);
    assert.ok(!Object.hasOwn(card,'questionPoints'),card.id);
    assert.ok(card.references.length > 0 && card.references.every(url=>url.startsWith('https://')),card.id);
    assert.deepEqual(card.followUps.map(branch => branch.kind), ['support', 'transfer'], card.id);
    for (const branch of card.followUps) {
      assert.deepEqual(Object.keys(branch).sort(), ['expected','kind','question']);
      assert.ok(nonempty(branch.question) && nonempty(branch.expected), card.id);
      assert.notEqual(branch.question, card.question, card.id);
      assert.notEqual(branch.question, branch.expected, card.id);
    }
    for (const key of ['basic','confident','deep']) assert.ok(nonempty(card.assessment[key]), card.id+': '+key);
    if (card.kind === 'question') {
      assert.equal(card.editorial,true);
      assert.equal(card.verifiedAt,verification.checkedAt);
      for (const url of card.references) {
        const reference = auditedReferences.get(url);
        assert.ok(reference, card.id + ': нет сверки ' + url);
        assert.equal(reference.checkedAt, card.verifiedAt, card.id + ': дата сверки ' + url);
        assert.match(reference.documentSha256, /^[a-f0-9]{64}$/, card.id + ': хеш первичного документа ' + url);
      }
      assert.ok(!card.references.includes(card.source.url),card.id + ': происхождение отдельно от проверки');
    }
    if (card.questionCode) assert.ok(nonempty(card.questionCodeLanguage),card.id);
    if (card.kind === 'task') {
      for (const field of ['statement','starterCode','language','complexity']) assert.ok(nonempty(card[field]),card.id+': '+field);
      assert.ok(card.examples.length && card.examples.every(nonempty),card.id);
      assert.ok(card.edgeCases.length && card.edgeCases.every(nonempty),card.id);
      assert.ok(nonempty(card.solution.code) && nonempty(card.solution.explanation),card.id);
    }
  }
  for (const id of new Set(questions.filter(card => card.source.provider === 'EasyOffer').map(card => card.source.sourceId))) {
    const rows = questions.filter(card => card.source.provider === 'EasyOffer' && card.source.sourceId === id);
    for (const field of ['explanation','assessment','followUps']) assert.equal(new Set(rows.map(card => JSON.stringify(card[field]))).size, rows.length, id + ': одинаковые уровни ' + field);
  }
});

test('Методика различает самостоятельное решение, помощь и перенос', () => {
  for (const tab of content.tabs) assert.ok(nonempty(tab.guidance));
  assert.match(content.interviewMethod.assessment,/всего основного задания/);
  assert.match(content.interviewMethod.assessment,/альтернатив/);
  assert.match(content.interviewMethod.followUps,/один вопрос/);
});

test('Все поставляемые JavaScript-файлы синтаксически корректны', () => {
  const { Script } = require('node:vm');
  for (const directory of ['web','web/data']) for (const name of fs.readdirSync(path.join(root,directory)).filter(name=>name.endsWith('.js'))) {
    assert.doesNotThrow(()=>new Script(fs.readFileSync(path.join(root,directory,name),'utf8'),{filename:name}));
  }
});
