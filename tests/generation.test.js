const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const { root, loadContent } = require('./helpers.cjs');
const shipped = loadContent();
const replacements = require('../data-sources/grade-replacements-2026-11-17.json');
const retired = new Set(replacements.map(row => row.retiredId));
const themes = shipped.topics.filter(topic => topic.key !== 'coding').map(topic => topic.key + '.js');

function fixture(t) {
  const parent = fs.realpathSync(os.tmpdir());
  const directory = fs.mkdtempSync(path.join(parent, 'interview-guide-generation-'));
  t.after(() => {
    // Delete only the fixture created directly inside this resolved temporary directory.
    assert.equal(path.dirname(path.resolve(directory)), parent);
    assert.match(path.basename(directory), /^interview-guide-generation-/);
    fs.rmSync(directory, { recursive: true, force: true });
  });
  fs.cpSync(path.join(root, 'data-sources'), path.join(directory, 'data-sources'), { recursive: true });
  const output = path.join(directory, 'web/data');
  fs.mkdirSync(output, { recursive: true });
  for (const name of ['catalog.js', 'coding.js']) fs.copyFileSync(path.join(root, 'web/data', name), path.join(output, name));
  return { directory, output };
}

function generate(directory) {
  return spawnSync(process.execPath, [path.join(directory, 'data-sources/build-bank.cjs')], { cwd: directory, encoding: 'utf8', timeout: 10000 });
}

function readBank(output) {
  const context = vm.createContext({ window: {} });
  for (const name of ['catalog.js', ...fs.readdirSync(output).filter(name => name !== 'catalog.js').sort()]) {
    vm.runInContext(fs.readFileSync(path.join(output, name), 'utf8'), context, { filename: name });
  }
  return JSON.parse(JSON.stringify(context.window.InterviewContent));
}

function readFiles(output) {
  return new Map(fs.readdirSync(output).sort().map(name => [name, fs.readFileSync(path.join(output, name))]));
}

test('Реальный генератор воспроизводит 480 вопросов и сохраняет coding.js побайтно', t => {
  const { directory, output } = fixture(t);
  const coding = fs.readFileSync(path.join(output, 'coding.js'));
  const result = generate(directory);
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(fs.readdirSync(output).sort(), ['catalog.js', 'coding.js', ...themes].sort());
  const generated = readBank(output);
  assert.deepEqual(generated, shipped, 'Редакционные исходники и поставляемые файлы разошлись');
  const questions = generated.materials.filter(card => card.kind === 'question');
  const easy = JSON.parse(fs.readFileSync(path.join(directory, 'data-sources/easyoffer-2026-11-16.json'), 'utf8'));
  const extra = JSON.parse(fs.readFileSync(path.join(directory, 'data-sources/kavalchuk-selection-2026-11-16.json'), 'utf8'));
  assert.equal(questions.length, 480);
  assert.equal(questions.filter(card => card.source?.provider === easy.provider).length, 19);
  assert.equal(questions.filter(card => card.source?.commit).length, 77);
  assert.equal(questions.filter(card => card.origin === 'project-editorial').length, 384);
  for (const topic of generated.topics) for (const tab of generated.tabs) {
    const ordinals = generated.materials.filter(card => card.topic === topic.key && card.tab === tab.key).map(card => card.ordinal);
    assert.deepEqual(ordinals.sort((a, b) => a - b), Array.from({ length: 15 }, (_, index) => index + 1), topic.key + '/' + tab.key);
  }
  for (const [level, list] of Object.entries(easy.levels)) for (const row of list.results.filter(row => row.accepted)) {
    const card = questions.find(card => card.id === `easyoffer:${level}:${row.id}`);
    if (retired.has(`easyoffer:${level}:${row.id}`)) { assert.equal(card, undefined); continue; }
    assert.ok(card, 'Отсутствует EasyOffer ' + row.id + '/' + level);
    assert.equal(card.question, row.title);
    assert.deepEqual(card.source, {
      provider: easy.provider, sourceId: row.id, url: 'https://easyoffer.ru/frontend-developer/question/' + row.slug,
      level, listUrl: list.url, retrievedAt: easy.retrievedAt
    });
  }
  for (const row of extra.records.filter(row => row.accepted)) {
    const card = questions.find(card => card.id === row.id);
    if (retired.has(row.id)) { assert.equal(card, undefined); continue; }
    assert.ok(card, 'Отсутствует GitHub ' + row.id);
    assert.equal(card.question, row.title);
    assert.deepEqual(card.source, {
      provider: extra.provider, sourceId: row.id, url: row.url, level: row.level,
      retrievedAt: extra.retrievedAt, commit: extra.commit, path: row.sourcePath, line: row.line
    });
  }
  assert.equal(result.stdout.trim(), 'Собрано тематических вопросов: ' + questions.length);
  assert.deepEqual(fs.readFileSync(path.join(output, 'coding.js')), coding);
});

for (const field of ['topic', 'level']) test('Неверный GitHub ' + field + ' отклоняется до записи тематических файлов', t => {
  const { directory, output } = fixture(t);
  // Existing output must also survive a failed rebuild, not merely an initially empty directory.
  for (const name of themes) fs.writeFileSync(path.join(output, name), '// previous output: ' + name + '\n');
  const before = readFiles(output);
  const manifest = path.join(directory, 'data-sources/kavalchuk-selection-2026-11-16.json');
  const data = JSON.parse(fs.readFileSync(manifest, 'utf8'));
  const row = data.records.find(row => row.accepted);
  row[field] = 'unknown';
  fs.writeFileSync(manifest, JSON.stringify(data));
  const result = generate(directory);
  assert.ifError(result.error);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, field === 'level' ? /Invalid level/ : /Invalid topic/);
  assert.ok(result.stderr.includes(row.id));
  assert.match(result.stderr, /unknown/);
  assert.equal(result.stdout, '');
  assert.deepEqual(readFiles(output), before, 'При невалидном источнике записан частичный банк');
});

test('Неверная тема редакционного EasyOffer-разбора не теряет карточки и не создаёт частичный банк', t => {
  const { directory, output } = fixture(t);
  const before = readFiles(output);
  fs.appendFileSync(path.join(directory, 'data-sources/easyoffer-editorial.cjs'), '\nmodule.exports[13086].topic = "unknown";\n');
  const result = generate(directory);
  assert.ifError(result.error);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Invalid topic for easyoffer:junior:13086: "unknown"/);
  assert.equal(result.stdout, '');
  assert.deepEqual(readFiles(output), before);
});

for (const { name, change, error } of [
  { name: 'неизвестный retiredId', change: rows => { rows[0].retiredId = 'missing:id'; }, error: /Неизвестный retiredId/ },
  { name: 'повторная замена', change: rows => { rows.push(rows[0]); }, error: /Повторная замена retiredId/ },
  { name: 'другой topic', change: rows => { rows[0].card.topic = 'css'; }, error: /Замена меняет topic\/tab/ },
  { name: 'другой tab', change: rows => { rows[0].card.tab = 'middle'; }, error: /Замена меняет topic\/tab/ },
  { name: 'прежний ID', change: rows => { rows[0].card.id = rows[0].retiredId; }, error: /Недопустимый новый ID/ },
  { name: 'повтор нового ID', change: rows => { rows[1].card.id = rows[0].card.id; }, error: /Недопустимый новый ID/ },
  { name: 'нет причины', change: rows => { rows[0].reason = ''; }, error: /Нет причины замены/ },
  { name: 'нет ответа', change: rows => { delete rows[0].card.shortAnswer; }, error: /Некорректное поле shortAnswer/ },
  { name: 'нет оценки', change: rows => { delete rows[0].card.assessment.deep; }, error: /Некорректная оценка/ },
  { name: 'нет второй ветки', change: rows => { rows[0].card.followUps.pop(); }, error: /Некорректные followUps/ },
  { name: 'не HTTPS', change: rows => { rows[0].card.references = ['http://example.com']; }, error: /Некорректные references/ },
  { name: 'нет сверки первичной ссылки', change: rows => { rows[0].card.references = ['https://example.com/unverified']; }, error: /Нет сверки references/ },
  { name: 'неподтверждённая дата', change: rows => { rows[0].card.verifiedAt = '2030-01-01'; }, error: /Нет сверки references/ },
  { name: 'неизвестный origin', change: rows => { rows.find(row => !row.card.source).card.origin = 'external'; }, error: /Нет provenance/ },
  ...['commit','path','line','originalQuestion','level','url','sourceId','retrievedAt','provider','adapted'].map(field => ({
    name: 'неверный provenance ' + field,
    change: rows => { rows[0].card.source[field] = field === 'line' ? 7 : 'wrong'; },
    error: /Неверный provenance/
  })),
  { name: 'источник одновременно с origin', change: rows => { rows[0].card.origin = 'project-editorial'; }, error: /Неверный provenance/ },
  ...['title','question'].map(field => ({
    name: 'глобальный повтор ' + field + ' с другой пунктуацией',
    change: rows => { rows[1].card[field] = rows[0].card[field].toUpperCase() + '?!'; },
    error: /Глобальный повтор/
  })),
  { name: 'неверный targetLevel advanced', change: rows => { rows.find(row => row.card.tab === 'advanced' && row.card.source).card.targetLevel = 'middle'; }, error: /Неверный provenance/ },
  { name: 'выдуманный source advanced', change: rows => { rows.find(row => row.card.tab === 'advanced' && row.card.source).card.source.level = 'advanced'; }, error: /Неверный provenance/ },
]) test('Замены: ' + name + ' отклоняется до любых записей', t => {
  const { directory, output } = fixture(t);
  for (const name of themes) fs.writeFileSync(path.join(output, name), '// previous bank\n');
  const before = readFiles(output);
  const manifest = path.join(directory, 'data-sources/grade-replacements-2026-11-17.json');
  const rows = JSON.parse(fs.readFileSync(manifest, 'utf8'));
  change(rows);
  fs.writeFileSync(manifest, JSON.stringify(rows));
  const result = generate(directory);
  assert.ifError(result.error);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, error);
  assert.equal(result.stdout, '');
  assert.deepEqual(readFiles(output), before, 'Невалидные замены не должны менять предыдущую сборку');
});

test('Дубль нового вопроса с сохранённой карточкой другой темы отклоняется глобально', t => {
  const { directory, output } = fixture(t);
  const before = readFiles(output);
  const manifest = path.join(directory, 'data-sources/grade-replacements-2026-11-17.json');
  const rows = JSON.parse(fs.readFileSync(manifest, 'utf8'));
  rows[0].card.question = shipped.materials.find(card => card.topic === 'html' && card.id.startsWith('project:')).question + '!!!';
  fs.writeFileSync(manifest, JSON.stringify(rows));
  const result = generate(directory);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Глобальный повтор/);
  assert.deepEqual(readFiles(output), before);
});

test('Неизвестный уровень списка EasyOffer не игнорируется', t => {
  const { directory, output } = fixture(t);
  const before = readFiles(output);
  const manifest = path.join(directory, 'data-sources/easyoffer-2026-11-16.json');
  const data = JSON.parse(fs.readFileSync(manifest, 'utf8'));
  data.levels.unknown = data.levels.junior;
  fs.writeFileSync(manifest, JSON.stringify(data));
  const result = generate(directory);
  assert.ifError(result.error);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Invalid EasyOffer level: "unknown"/);
  assert.equal(result.stdout, '');
  assert.deepEqual(readFiles(output), before);
});

for (const { name, change, error } of [
  {
    name: 'Недостающий кейс',
    change: rows => rows.shift(),
    error: /Ожидалось 15 вопросов в группе html\/junior, получено 14/
  },
  {
    name: 'Дублирующийся ID',
    change: rows => { rows[1].id = rows[0].id; },
    error: /Повтор или отсутствие ID: project:html:/
  },
  {
    name: 'Сторонний источник у кейса проекта',
    change: rows => { rows[0].source = { provider: 'EasyOffer', level: rows[0].tab, url: 'https://easyoffer.ru/' }; },
    error: /Источник недопустим у кейса проекта: project:html:/
  },
  ...['references', 'assessment', 'followUps'].map(field => ({
    name: 'Отсутствует обязательное поле ' + field,
    change: rows => { delete rows[0][field]; },
    error: new RegExp('Некорректное поле ' + field + ' у кейса проекта: project:html:')
  })),
]) test(name + ' отклоняется до записи тематических файлов', t => {
  const { directory, output } = fixture(t);
  for (const name of themes) fs.writeFileSync(path.join(output, name), '// Предыдущая сборка: ' + name + '\n');
  const before = readFiles(output);
  const manifest = path.join(directory, 'data-sources/project-editorial-cases.json');
  const rows = JSON.parse(fs.readFileSync(manifest, 'utf8'));
  change(rows);
  fs.writeFileSync(manifest, JSON.stringify(rows));
  const result = generate(directory);
  assert.ifError(result.error);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, error);
  assert.deepEqual(readFiles(output), before);
});
