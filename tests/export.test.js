const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { loadContent, root } = require('./helpers.cjs');
const { readOfficeZip, reportFor } = require('./export-helpers.cjs');
const scope = { window: {}, TextEncoder, Uint8Array, DataView };
vm.runInNewContext(fs.readFileSync(path.join(root, 'web/results-export.js'), 'utf8'), scope);
const build = scope.window.InterviewResultsExport.build;
const content = loadContent();

for (const allRated of [false, true]) test('Валидные пакеты Office: ' + (allRated ? 'все 540 оценок' : 'пустое интервью'), () => {
  const ratings = allRated ? Object.fromEntries(content.materials.map((item,i) => [item.id, Object.keys(content.ratingLabels)[i % 4]])) : {};
  const report = reportFor(content, ratings);
  const doc = readOfficeZip(build('docx', report));
  const sheet = readOfficeZip(build('xlsx', report));
  assert.match(doc.get('_rels/.rels'), /Target="word\/document.xml"/);
  assert.match(doc.get('[Content_Types].xml'), /wordprocessingml.document.main/);
  assert.match(doc.get('word/document.xml'), new RegExp('Оценено ' + report.rated + ' из 540'));
  assert.ok(doc.get('word/document.xml').includes(report.generatedAt));
  assert.match(doc.get('word/document.xml'), new RegExp('редакция банка: ' + content.revision));
  assert.match(doc.get('word/styles.xml'), /<w:outlineLvl w:val="0"\/>/);
  if (allRated) {
    assert.match(doc.get('word/document.xml'), /<w:tblBorders>[\s\S]*?<\/w:tblBorders><w:tblLayout/);
    assert.match(doc.get('word/document.xml'), /<w:shd w:val="clear" w:fill="E7EDF4"\/>/);
  } else {
    assert.match(doc.get('word/document.xml'), /Пока нет оценённых материалов\./);
    for (const level of content.tabs) assert.ok(!doc.get('word/document.xml').includes(level.label));
  }
  assert.equal((doc.get('word/document.xml').match(/<w:tbl>/g) || []).length, allRated ? 5 : 0);
  assert.match(sheet.get('xl/workbook.xml'), /name="Сводка"/);
  assert.match(sheet.get('xl/workbook.xml'), /name="Оценённые вопросы"/);
  assert.match(sheet.get('xl/_rels/workbook.xml.rels'), /Target="worksheets\/sheet2.xml"/);
  assert.equal((sheet.get('xl/worksheets/sheet1.xml').match(/<row /g) || []).length, allRated ? 38 : 2);
  assert.equal((sheet.get('xl/worksheets/sheet2.xml').match(/<row /g) || []).length, allRated ? 541 : 1);
  if (allRated) assert.match(sheet.get('xl/worksheets/sheet1.xml'), /<c r="D3"><v>15<\/v><\/c>/);
  for (const part of [...doc.values(), ...sheet.values()]) assert.ok(part.startsWith('<?xml version="1.0" encoding="UTF-8"'));
});

function cellRows(xml, rowTag, cellTag) {
  return [...xml.matchAll(new RegExp('<' + rowTag + '(?: [^>]*)?>([\\s\\S]*?)</' + rowTag + '>', 'g'))].map(row =>
    [...row[1].matchAll(new RegExp('<' + cellTag + '(?: [^>]*)?>([\\s\\S]*?)</' + cellTag + '>', 'g'))].map(cell =>
      cell[1].replace(/<[^>]*>/g, '').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')));
}

for (const onlyNoAnswer of [false, true]) test('Экспорт только оценённых групп: ' + (onlyNoAnswer ? 'одна оценка «Не ответил»' : 'три оценки в двух темах и уровнях'), () => {
  const seniorReact = content.materials.filter(item => item.tab === 'senior' && item.topic === 'react');
  const middleCss = content.materials.find(item => item.tab === 'middle' && item.topic === 'css');
  const ratings = onlyNoAnswer ? { [seniorReact[0].id]: 'no_answer' } : {
    [seniorReact[0].id]: 'no_answer', [seniorReact[1].id]: 'deep', [middleCss.id]: 'basic'
  };
  const report = reportFor(content, ratings);
  const groups = onlyNoAnswer ? [['Senior', 'React', '1', '15', '1', '0', '0', '0']] : [
    ['Middle', 'CSS', '1', '15', '0', '1', '0', '0'], ['Senior', 'React', '2', '15', '1', '0', '0', '1']
  ];
  assert.deepEqual(report.levels.map(level => [level.label, level.total, level.rated]), onlyNoAnswer ? [['Senior', 135, 1]] : [['Middle', 135, 1], ['Senior', 135, 2]]);
  const doc = readOfficeZip(build('docx', report)).get('word/document.xml');
  const sheets = readOfficeZip(build('xlsx', report));
  assert.deepEqual(cellRows(sheets.get('xl/worksheets/sheet1.xml'), 'row', 'c').slice(2), groups);
  assert.deepEqual(cellRows(sheets.get('xl/worksheets/sheet2.xml'), 'row', 'c').slice(1), report.ratedItems.map(item => [item.level, item.topic, item.title, item.rating]));
  const tables = [...doc.matchAll(/<w:tbl>([\s\S]*?)<\/w:tbl>/g)].map(table => cellRows(table[1], 'w:tr', 'w:tc'));
  assert.equal(tables.length, groups.length + 1);
  assert.deepEqual(tables.slice(0, -1).flatMap(table => table.slice(1)), groups.map(group => group.slice(1)));
  assert.deepEqual(tables.at(-1).slice(1), report.ratedItems.map(item => [item.level, item.topic, item.title, item.rating]));
  assert.match(doc, new RegExp('Оценено ' + (onlyNoAnswer ? 1 : 3) + ' из 540'));
  assert.ok(!doc.includes('Junior'));
  assert.ok(!doc.includes('HTML'));
});

test('XML и формулы остаются буквальным текстом без недопустимых управляющих символов', () => {
  const report = reportFor(content);
  const title = '=HYPERLINK("https://example.test","<тест> & данные")\u0000';
  report.ratedItems = [{level:'Senior', topic:'React', title, rating:'Глубоко'}];
  for (const format of ['docx', 'xlsx']) {
    const zip = readOfficeZip(build(format, report));
    const data = zip.get(format === 'docx' ? 'word/document.xml' : 'xl/worksheets/sheet2.xml');
    assert.ok(data.includes('=HYPERLINK(&quot;https://example.test&quot;,&quot;&lt;тест&gt; &amp; данные&quot;)'));
    assert.ok(!data.includes('\u0000'));
    assert.ok(!data.includes('<f>'));
    if (format === 'xlsx') assert.match(data, /<c r="C2" t="inlineStr">/);
  }
});

test('Неизвестный формат отчёта отклоняется', () => {
  assert.throws(() => build('html', reportFor(content)), /Неизвестный формат/);
});
