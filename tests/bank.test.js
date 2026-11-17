const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { root, loadContent, digestTask, digestQuestion } = require('./helpers.cjs');
const easy = require('../data-sources/easyoffer-2026-11-16.json');
const extra = require('../data-sources/kavalchuk-selection-2026-11-16.json');
const project = require('../data-sources/project-editorial-cases.json');
const preserved = require('../data-sources/coding-preserved.json');
const verification = require('../data-sources/technical-verification-2026-11-17.json');
const gradeVerification = require('../data-sources/grade-reference-verification-2026-11-17.json');
const replacements = require('../data-sources/grade-replacements-2026-11-17.json');
const baseline = require('../data-sources/grade-baseline-2026-11-17.json');
const upstream = require('../data-sources/grade-upstream-evidence-2026-11-17.json');
const retired = new Set(replacements.map(row => row.retiredId));
const content = loadContent();
const questions = content.materials.filter(card => card.kind === 'question');
const sourced = questions.filter(card => card.source);
const imported = questions.filter(card => card.origin === 'project-editorial');
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

test('Редакция 5: 480 вопросов, 60 задач, уникальные ID и прежний ключ интервью', () => {
  assert.equal(content.revision, 5);
  assert.equal(content.ratingsStorageKey, 'interview-guide.ratings.v3');
  assert.equal(content.materials.length, 540);
  assert.equal(questions.length, 480);
  assert.equal(sourced.length, 96);
  assert.equal(imported.length, 384);
  assert.equal(new Set(content.materials.map(card => card.id)).size, 540);
  assert.equal(sourced.filter(card => card.source.provider === easy.provider).length, 19);
  assert.equal(sourced.filter(card => card.source.commit).length, 77);
});

test('Вопросы из подборок точно соответствуют принятым записям источников', () => {
  const expected = [];
  for (const [level, list] of Object.entries(easy.levels)) for (const row of list.results) {
    const id = `easyoffer:${level}:${row.id}`;
    const card = questions.find(card => card.id === id);
    if (!row.accepted) { assert.equal(card, undefined, id + ': отклонённый вопрос'); continue; }
    if (retired.has(id)) { assert.equal(card, undefined, id + ': явно заменённый вопрос'); continue; }
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
    const card = questions.find(card => card.id === row.id);
    if (retired.has(row.id)) { assert.equal(card, undefined, row.id); continue; }
    expected.push(row.id);
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
  assert.deepEqual(sourced.filter(card => !card.id.startsWith('curated:')).map(card => card.id).sort(), expected.sort());
  const easyTitles = new Set(sourced.filter(card => card.source.provider === easy.provider).map(card => card.title));
  const extraCards = sourced.filter(card => card.source.provider === extra.provider);
  assert.ok(extraCards.every(card => !easyTitles.has(card.title)), 'Дубль названия между источниками');
  assert.equal(new Set(extraCards.map(card => card.title)).size, extraCards.length);
});

test('Проектные кейсы имеют отдельные ID и сохраняют редакционные исходники целиком', () => {
  const rows = new Map(project.map(card => [card.id, card]));
  assert.equal(rows.size, 395);
  for (const { ordinal, editorial, origin, ...card } of imported.filter(card => card.id.startsWith('project:'))) {
    assert.match(card.id, new RegExp('^project:' + card.topic + ':[a-z0-9-]+$'));
    assert.ok(!Object.hasOwn(card, 'source'), card.id);
    assert.deepEqual(card, rows.get(card.id), card.id);
  }
  for (const row of project) assert.equal(questions.some(card => card.id === row.id), !retired.has(row.id), row.id);
});

test('Все 51 замены явные, с новыми ID; 429 сохранённых вопросов неизменны кроме ordinal', () => {
  assert.equal(replacements.length, 51);
  assert.equal(retired.size, 51);
  assert.equal(baseline.baselineCommit, '0c7b1ea01db87e2e0e562cb96347b826f22a067b');
  assert.equal(baseline.cards.length, 480);
  const oldIds = new Set(baseline.cards.map(card => card.id));
  for (const { retiredId, reason, card } of replacements) {
    assert.ok(oldIds.has(retiredId), retiredId);
    assert.ok(nonempty(reason), retiredId);
    assert.equal(questions.some(card => card.id === retiredId), false, retiredId);
    assert.ok(!oldIds.has(card.id), card.id);
    const { ordinal, ...shipped } = questions.find(row => row.id === card.id);
    assert.deepEqual(shipped, card, card.id);
  }
  const retained = baseline.cards.filter(row => !retired.has(row.id));
  assert.equal(retained.length, 429);
  for (const row of retained) assert.equal(digestQuestion(questions.find(card => card.id === row.id)), row.sha256, row.id);
});

test('38 адаптаций честно ссылаются на исходные строки и грейды закреплённого GitHub', () => {
  const sourceCards = replacements.map(row => row.card).filter(card => card.source);
  assert.equal(sourceCards.length, 38);
  for (const document of upstream.documents) assert.match(document.sha256, /^[a-f0-9]{64}$/, document.path);
  for (const card of sourceCards) {
    const source = card.source;
    const evidence = upstream.records.find(row => row.path === source.path && row.line === source.line);
    const originalQuestion = evidence.sourceText.match(/^- \[(.*)\]\(/)[1];
    const heading = evidence.heading;
    assert.ok(evidence.headingLine < source.line);
    assert.equal(source.originalQuestion, originalQuestion, card.id);
    assert.equal(source.level, heading.match(/Junior|Middle|Senior|Lead/)[0].toLowerCase(), card.id);
    assert.equal(source.commit, upstream.commit);
    assert.equal(source.sourceId, source.path + ':' + source.line);
    assert.equal(source.url, upstream.repository + '/blob/' + upstream.commit + '/' + source.path + '#L' + source.line);
    assert.equal(source.adapted, true);
    assert.equal(source.level, card.targetLevel);
    assert.notEqual(card.question, source.originalQuestion, 'Адаптация отделена от дословного вопроса');
  }
});

test('Нет глобальных буквальных повторов title/question между темами или вкладками', () => {
  const normalized = new Map();
  for (const card of content.materials) for (const field of ['title', 'question']) {
    const key = card[field].normalize('NFKC').toLocaleLowerCase('ru').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    assert.ok(!normalized.has(key) || normalized.get(key) === card.id, card.id + ': повтор ' + field + ' с ' + normalized.get(key));
    normalized.set(key, card.id);
  }
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

test('Во всех 36 группах по 15 материалов; глубина соответствует вкладке', () => {
  assert.equal(content.topics.length, 9);
  assert.equal(content.tabs.length, 4);
  for (const topic of content.topics) for (const tab of content.tabs) {
    const rows = content.materials.filter(card => card.topic === topic.key && card.tab === tab.key).sort((a,b) => a.ordinal-b.ordinal);
    const group = topic.key + '/' + tab.key;
    assert.deepEqual(rows.map(card => card.ordinal), Array.from({length:15},(_,i) => i+1), group);
    if (topic.key !== 'coding') for (const field of ['title', 'question']) {
      const wording = rows.map(card => card[field].toLocaleLowerCase('ru').replace(/[^\p{L}\p{N}]+/gu, ' ').trim());
      assert.equal(new Set(wording).size, rows.length, group + ': повтор ' + field);
    }
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
  const gradeReferences = new Map(gradeVerification.references.map(reference => [reference.url, reference]));
  const projectReferenceHosts = new Set([
    'dom.spec.whatwg.org', 'encoding.spec.whatwg.org', 'feature-sliced.design', 'fetch.spec.whatwg.org',
    'html.spec.whatwg.org', 'react-redux.js.org', 'react.dev', 'redux-toolkit.js.org', 'redux.js.org',
    'tanstack.com', 'tc39.es', 'url.spec.whatwg.org', 'www.typescriptlang.org', 'www.w3.org'
  ]);
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
    }
    if (card.id.startsWith('curated:')) {
      assert.equal(card.verifiedAt, gradeVerification.checkedAt);
      for (const url of card.references) {
        const reference = gradeReferences.get(url);
        assert.ok(reference, card.id + ': нет новой сверки ' + url);
        assert.equal(reference.status, 200, url);
        assert.equal(reference.checkedAt, card.verifiedAt, url);
        assert.match(reference.documentSha256, /^[a-f0-9]{64}$/, url);
      }
    } else if (card.source) {
      assert.equal(card.verifiedAt,verification.checkedAt);
      for (const url of card.references) {
        const reference = auditedReferences.get(url);
        assert.ok(reference, card.id + ': нет сверки ' + url);
        assert.equal(reference.checkedAt, card.verifiedAt, card.id + ': дата сверки ' + url);
        assert.match(reference.documentSha256, /^[a-f0-9]{64}$/, card.id + ': хеш первичного документа ' + url);
      }
      assert.ok(!card.references.includes(card.source.url),card.id + ': происхождение отдельно от проверки');
    }
    if (card.source) assert.ok(!card.references.includes(card.source.url), card.id);
    if (card.origin === 'project-editorial' && !card.id.startsWith('curated:')) {
      assert.equal(card.verifiedAt, '2026-11-16', card.id + ': дата технической сверки проектного банка');
      for (const url of card.references) {
        assert.ok(projectReferenceHosts.has(new URL(url).hostname), card.id + ': первичный документ ' + url);
      }
    }
    if (card.questionCode) assert.ok(nonempty(card.questionCodeLanguage),card.id);
    if (card.kind === 'task') {
      for (const field of ['statement','starterCode','language','complexity']) assert.ok(nonempty(card[field]),card.id+': '+field);
      assert.ok(card.examples.length && card.examples.every(nonempty),card.id);
      assert.ok(card.edgeCases.length && card.edgeCases.every(nonempty),card.id);
      assert.ok(nonempty(card.solution.code) && nonempty(card.solution.explanation),card.id);
    }
  }
  for (const id of new Set(sourced.filter(card => card.source.provider === 'EasyOffer').map(card => card.source.sourceId))) {
    const rows = sourced.filter(card => card.source.provider === 'EasyOffer' && card.source.sourceId === id);
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
