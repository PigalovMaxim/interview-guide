/* node data-sources/build-bank.cjs — пересобрать тематические файлы, не трогая coding.js. */
const fs = require('node:fs');
const path = require('node:path');
const easy = require('./easyoffer-2026-11-16.json');
const extra = require('./kavalchuk-selection-2026-11-16.json');
const project = require('./project-editorial-cases.json');
const editorial = require('./easyoffer-editorial.cjs');
const supplement = require('./kavalchuk-editorial.cjs');
const preserved = require('./coding-preserved.json');
const output = path.resolve(__dirname, '../web/data');
const topics = ['html', 'css', 'javascript', 'typescript', 'react', 'tanstack-query', 'redux', 'architecture-fsd'];
const levels = ['junior', 'middle', 'senior'];
const tabs = [...levels, 'advanced'];
for (const level of Object.keys(easy.levels)) {
  if (!levels.includes(level)) throw Error('Invalid EasyOffer level: ' + JSON.stringify(level));
}
const cards = [];
for (const level of levels) {
  for (const source of easy.levels[level].results.filter(row => row.accepted)) {
    const entry = editorial[source.id];
    if (!entry || !entry.levels[level]) throw Error('Missing editorial: ' + source.id + '/' + level);
    const [detail, confident, transferQuestion, transferExpected] = entry.levels[level];
    cards.push({
      id: `easyoffer:${level}:${source.id}`, topic: entry.topic, tab: level, targetLevel: level, angles: [], kind: 'question',
      title: source.title, question: source.title,
      source: { provider: easy.provider, sourceId: source.id, url: 'https://easyoffer.ru/frontend-developer/question/' + source.slug, level, listUrl: easy.levels[level].url, retrievedAt: easy.retrievedAt },
      editorial: true, shortAnswer: entry.shortAnswer, explanation: entry.explanation + ' ' + detail,
      assessment: { basic: entry.basic, confident, deep: 'Самостоятельно переносит рассуждение: ' + transferExpected },
      followUps: [ { kind: 'support', question: entry.support[0], expected: entry.support[1] }, { kind: 'transfer', question: transferQuestion, expected: transferExpected } ],
      context: 'Редакционный разбор для уровня ' + level + '. JavaScript — современный браузер и строгий режим, если не оговорено иное; React — функциональные компоненты, TypeScript — strict. Уровень взят из списка источника, а не определяется сложностью формулировки.',
      references: entry.references, verifiedAt: '2026-11-17'
    });
  }
}
for (const source of extra.records) {
  if (!source.accepted) continue;
  const entry = supplement[source.id];
  if (!entry) throw Error('Missing editorial: ' + source.id);
  cards.push({
    id: source.id, topic: source.topic, tab: source.level, targetLevel: source.level, angles: [], kind: 'question',
    title: source.title, question: source.title,
    source: { provider: extra.provider, sourceId: source.id, url: source.url, level: source.level, retrievedAt: extra.retrievedAt, commit: extra.commit, path: source.sourcePath, line: source.line },
    editorial: true, ...entry, verifiedAt: '2026-11-17'
  });
}
for (const card of project) {
  if (Object.hasOwn(card, 'source')) throw Error('Источник недопустим у кейса проекта: ' + card.id);
  if (typeof card.id !== 'string' || !card.id.startsWith('project:' + card.topic + ':') || !/^project:[a-z-]+:[a-z0-9-]+$/.test(card.id)) {
    throw Error('Недопустимый ID кейса проекта: ' + card.id);
  }
  const isText = value => typeof value === 'string' && value.trim().length > 0;
  const checks = {
    ...Object.fromEntries(['title', 'question', 'shortAnswer', 'explanation', 'context', 'verifiedAt'].map(field => [field, isText(card[field])])),
    assessment: ['basic', 'confident', 'deep'].every(key => isText(card.assessment?.[key])),
    followUps: Array.isArray(card.followUps) && card.followUps.length === 2 && ['support', 'transfer'].every(kind =>
      card.followUps.some(branch => branch?.kind === kind && isText(branch.question) && isText(branch.expected))),
    references: Array.isArray(card.references) && card.references.length > 0 && card.references.every(url => URL.canParse(url) && new URL(url).protocol === 'https:'),
    angles: Array.isArray(card.angles),
  };
  for (const [field, valid] of Object.entries(checks)) {
    if (!valid) throw Error('Некорректное поле ' + field + ' у кейса проекта: ' + card.id);
  }
  cards.push({ ...card, origin: 'project-editorial', editorial: true });
}

// Проверяем весь банк до записи: неверный вход не должен приводить к потере карточки.
const ids = new Set(preserved.map(card => card.id));
const groups = new Map(topics.flatMap(topic => tabs.map(tab => [topic + '/' + tab, []])));
for (const card of cards) {
  if (!card.id || ids.has(card.id)) throw Error('Повтор или отсутствие ID: ' + card.id);
  ids.add(card.id);
  if (!topics.includes(card.topic)) throw Error('Invalid topic for ' + card.id + ': ' + JSON.stringify(card.topic));
  if (!tabs.includes(card.tab)) throw Error('Invalid level (tab) for ' + card.id + ': ' + JSON.stringify(card.tab));
  const cardLevels = { targetLevel: card.targetLevel, ...(card.source && { 'source.level': card.source.level }) };
  for (const [field, level] of Object.entries(cardLevels)) {
    if (!levels.includes(level)) throw Error('Invalid level (' + field + ') for ' + card.id + ': ' + JSON.stringify(level));
  }
  if (card.tab === 'advanced') {
    if (card.source || !card.angles.length || !card.angles.every(angle => ['engineering', 'nuance'].includes(angle))) {
      throw Error('Некорректная глубина сложного кейса: ' + card.id);
    }
  } else if (card.targetLevel !== card.tab || (card.source && card.source.level !== card.tab)) {
    throw Error('Уровень не соответствует вкладке: ' + card.id);
  }
  if (card.kind !== 'question') throw Error('В тематическом банке ожидается вопрос: ' + card.id);
  groups.get(card.topic + '/' + card.tab).push(card);
}
for (const [name, group] of groups) {
  if (group.length !== 15) throw Error('Ожидалось 15 вопросов в группе ' + name + ', получено ' + group.length);
  group.forEach((card, index) => { card.ordinal = index + 1; });
}
for (const topic of topics) {
  const rows = cards.filter(card => card.topic === topic);
  fs.writeFileSync(path.join(output, topic + '.js'), '/* Редакция 4. Вопросы из подборок и редакционные кейсы проекта. */\n' +
    'window.InterviewContent.materials.push(\n' + rows.map(card => JSON.stringify(card)).join(',\n') + '\n);\n');
}
console.log('Собрано тематических вопросов: ' + cards.length);
