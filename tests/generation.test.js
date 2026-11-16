const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const { root, loadContent } = require('./helpers.cjs');
const shipped = loadContent();
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

test('Реальный генератор воспроизводит поставляемый банк 45+40 и сохраняет coding.js побайтно', t => {
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
  assert.equal(questions.filter(card => card.source.provider === easy.provider).length, 45);
  assert.equal(questions.filter(card => card.source.provider === extra.provider).length, 40);
  for (const [level, list] of Object.entries(easy.levels)) for (const row of list.results.filter(row => row.accepted)) {
    const card = questions.find(card => card.id === `easyoffer:${level}:${row.id}`);
    assert.ok(card, 'Отсутствует EasyOffer ' + row.id + '/' + level);
    assert.equal(card.question, row.title);
    assert.deepEqual(card.source, {
      provider: easy.provider, sourceId: row.id, url: 'https://easyoffer.ru/frontend-developer/question/' + row.slug,
      level, listUrl: list.url, retrievedAt: easy.retrievedAt
    });
  }
  for (const row of extra.records.filter(row => row.accepted)) {
    const card = questions.find(card => card.id === row.id);
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
  assert.match(result.stderr, new RegExp('Invalid ' + field));
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
