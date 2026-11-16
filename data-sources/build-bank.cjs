/* node data-sources/build-bank.cjs — пересобрать тематические файлы, не трогая coding.js. */
const fs = require('node:fs');
const path = require('node:path');
const easy = require('./easyoffer-2026-11-16.json');
const extra = require('./kavalchuk-selection-2026-11-16.json');
const editorial = require('./easyoffer-editorial.cjs');
const supplement = require('./kavalchuk-editorial.cjs');
const output = path.resolve(__dirname, '../web/data');
const topics = ['html', 'css', 'javascript', 'typescript', 'react', 'tanstack-query', 'redux', 'architecture-fsd'];
const levels = ['junior', 'middle', 'senior'];
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
// Validate the complete bank before writing any thematic file: filtering must never drop a source card.
for (const card of cards) {
  if (!topics.includes(card.topic)) throw Error('Invalid topic for ' + card.id + ': ' + JSON.stringify(card.topic));
  for (const [field, level] of Object.entries({ tab: card.tab, targetLevel: card.targetLevel, 'source.level': card.source.level })) {
    if (!levels.includes(level)) throw Error('Invalid level (' + field + ') for ' + card.id + ': ' + JSON.stringify(level));
  }
}
let written = 0;
for (const topic of topics) {
  const rows = cards.filter(card => card.topic === topic);
  for (const level of levels) rows.filter(card => card.tab === level).forEach((card, index) => { card.ordinal = index + 1; });
  fs.writeFileSync(path.join(output, topic + '.js'), '/* Редакция 3. Источники вопросов указаны отдельно от редакционных разборов. */\n' +
    (rows.length ? 'window.InterviewContent.materials.push(\n' + rows.map(card => JSON.stringify(card)).join(',\n') + '\n);\n' : '/* В выбранных источниках нет материалов для этой темы. */\n'));
  written += rows.length;
}
console.log('Собрано тематических вопросов: ' + written);
