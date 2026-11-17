(function () {
  'use strict';
  const encoder = new TextEncoder();
  const xmlHeader = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const ns = 'http://schemas.openxmlformats.org/';
  const relationNS = ns + 'package/2006/relationships';
  const documentNS = ns + 'officeDocument/2006/relationships/';
  const labels = ['Уровень', 'Тема', 'Оценено', 'Всего'];

  function xml(value) {
    return String(value).replace(/[^\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu, '')
      .replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);
  }

  function join(chunks) {
    const bytes = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
    let cursor = 0;
    for (const chunk of chunks) { bytes.set(chunk, cursor); cursor += chunk.length; }
    return bytes;
  }

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  // ZIP без сжатия: заголовки файлов, центральный каталог и завершающая запись.
  // Фиксированная DOS-дата 1980-01-01 обеспечивает воспроизводимые файлы.
  function zip(files) {
    const local = [];
    const directory = [];
    let offset = 0;
    for (const [name, text] of Object.entries(files)) {
      const filename = encoder.encode(name);
      const data = encoder.encode(xmlHeader + text);
      const crc = crc32(data);
      const header = new Uint8Array(30);
      const view = new DataView(header.buffer);
      view.setUint32(0, 0x04034b50, true);
      view.setUint16(4, 20, true);
      view.setUint16(6, 0x800, true);
      view.setUint16(12, 33, true);
      view.setUint32(14, crc, true);
      view.setUint32(18, data.length, true);
      view.setUint32(22, data.length, true);
      view.setUint16(26, filename.length, true);
      local.push(header, filename, data);
      const central = new Uint8Array(46);
      const info = new DataView(central.buffer);
      info.setUint32(0, 0x02014b50, true);
      info.setUint16(4, 20, true);
      info.setUint16(6, 20, true);
      info.setUint16(8, 0x800, true);
      info.setUint16(14, 33, true);
      info.setUint32(16, crc, true);
      info.setUint32(20, data.length, true);
      info.setUint32(24, data.length, true);
      info.setUint16(28, filename.length, true);
      info.setUint32(42, offset, true);
      directory.push(central, filename);
      offset += header.length + filename.length + data.length;
    }
    const central = join(directory);
    const end = new Uint8Array(22);
    const view = new DataView(end.buffer);
    view.setUint32(0, 0x06054b50, true);
    view.setUint16(8, Object.keys(files).length, true);
    view.setUint16(10, Object.keys(files).length, true);
    view.setUint32(12, central.length, true);
    view.setUint32(16, offset, true);
    return join([...local, central, end]);
  }

  function relationships(entries) {
    return '<Relationships xmlns="' + relationNS + '">' + entries.map(([id, type, target]) =>
      '<Relationship Id="' + id + '" Type="' + documentNS + type + '" Target="' + target + '"/>').join('') + '</Relationships>';
  }

  function contentTypes(parts) {
    return '<Types xmlns="' + ns + 'package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' + parts.map(([name, type]) =>
        '<Override PartName="/' + name + '" ContentType="application/vnd.openxmlformats-officedocument.' + type + '+xml"/>').join('') + '</Types>';
  }

  function summaryRows(report) {
    return report.levels.flatMap(level => level.topics.map(topic =>
      [level.label, topic.label, topic.rated, topic.total, ...topic.counts]));
  }

  function detailRows(report) {
    return report.ratedItems.map(item => [item.level, item.topic, item.title, item.rating]);
  }

  function paragraph(text, heading = false) {
    return '<w:p><w:pPr>' + (heading ? '<w:pStyle w:val="Heading1"/><w:keepNext/>' : '') + '<w:spacing w:after="140"/></w:pPr><w:r>' +
      (heading ? '<w:rPr><w:b/><w:sz w:val="28"/></w:rPr>' : '') + '<w:t xml:space="preserve">' + xml(text) + '</w:t></w:r></w:p>';
  }

  function table(headers, rows, widths) {
    const cells = (values, header) => '<w:tr>' + (header ? '<w:trPr><w:tblHeader/></w:trPr>' : '') + values.map((value, index) =>
      '<w:tc><w:tcPr><w:tcW w:w="' + widths[index] + '" w:type="dxa"/>' + (header ? '<w:shd w:val="clear" w:fill="E7EDF4"/>' : '') + '</w:tcPr>' +
      '<w:p><w:pPr><w:spacing w:after="60" w:before="60"/></w:pPr><w:r><w:rPr>' + (header ? '<w:b/>' : '') +
      '<w:sz w:val="18"/></w:rPr><w:t xml:space="preserve">' + xml(value) + '</w:t></w:r></w:p></w:tc>').join('') + '</w:tr>';
    return '<w:tbl><w:tblPr><w:tblW w:w="9360" w:type="dxa"/><w:tblBorders>' +
      ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(edge => '<w:' + edge + ' w:val="single" w:sz="4" w:color="CDD4DC"/>').join('') +
      '</w:tblBorders><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>' + widths.map(width => '<w:gridCol w:w="' + width + '"/>').join('') + '</w:tblGrid>' +
      cells(headers, true) + rows.map(row => cells(row, false)).join('') + '</w:tbl>' + paragraph('');
  }

  function docx(report) {
    const blocks = [paragraph('Итоги интервью', true), paragraph('Оценено ' + report.rated + ' из ' + report.total + ' материалов.'),
      paragraph('Дата выгрузки: ' + report.generatedAt + ' · редакция банка: ' + report.revision),
      paragraph('Без отметки — материал не оценён. «Не ответил» — отдельная оценка. Итоговое решение остаётся за интервьюером.')];
    for (const level of report.levels) {
      blocks.push(paragraph(level.label + ' · ' + level.rated + '/' + level.total + ' оценено', true));
      blocks.push(table(['Тема', 'Оценено', 'Всего', ...report.ratingLabels],
        level.topics.map(topic => [topic.label, topic.rated, topic.total, ...topic.counts]), [2700, 1000, 780, 1220, 1220, 1220, 1220]));
    }
    blocks.push(paragraph('Оценённые вопросы и задачи', true));
    blocks.push(report.ratedItems.length ? table(['Уровень', 'Тема', 'Вопрос / задача', 'Оценка'], detailRows(report), [1250, 1650, 5260, 1200]) : paragraph('Пока нет оценённых материалов.'));
    const document = '<w:document xmlns:w="' + ns + 'wordprocessingml/2006/main"><w:body>' + blocks.join('') +
      '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1080" w:right="1273" w:bottom="1080" w:left="1273" w:header="360" w:footer="360" w:gutter="0"/></w:sectPr></w:body></w:document>';
    return zip({
      '[Content_Types].xml': contentTypes([['word/document.xml', 'wordprocessingml.document.main'], ['word/styles.xml', 'wordprocessingml.styles']]),
      '_rels/.rels': relationships([['rId1', 'officeDocument', 'word/document.xml']]),
      'word/document.xml': document,
      'word/_rels/document.xml.rels': relationships([['rId1', 'styles', 'styles.xml']]),
      'word/styles.xml': '<w:styles xmlns:w="' + ns + 'wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/><w:lang w:val="ru-RU"/></w:rPr></w:rPrDefault></w:docDefaults><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:pPr><w:keepNext/><w:outlineLvl w:val="0"/></w:pPr></w:style></w:styles>'
    });
  }

  function column(index) {
    let name = '';
    for (index++; index; index = Math.floor((index - 1) / 26)) name = String.fromCharCode(65 + (index - 1) % 26) + name;
    return name;
  }

  function sheet(rows, widths, filterFrom) {
    const cell = (value, row, col) => {
      const address = column(col) + (row + 1);
      const style = row + 1 <= filterFrom ? ' s="1"' : '';
      return typeof value === 'number' ? '<c r="' + address + '"' + style + '><v>' + value + '</v></c>' :
        '<c r="' + address + '"' + style + ' t="inlineStr"><is><t xml:space="preserve">' + xml(value) + '</t></is></c>';
    };
    return '<worksheet xmlns="' + ns + 'spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="' + filterFrom +
      '" topLeftCell="A' + (filterFrom + 1) + '" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>' +
      widths.map((width, index) => '<col min="' + (index + 1) + '" max="' + (index + 1) + '" width="' + width + '" customWidth="1"/>').join('') +
      '</cols><sheetData>' + rows.map((row, index) => '<row r="' + (index + 1) + '">' + row.map((value, col) => cell(value, index, col)).join('') + '</row>').join('') +
      '</sheetData><autoFilter ref="A' + filterFrom + ':' + column(widths.length - 1) + rows.length + '"/></worksheet>';
  }

  function xlsx(report) {
    const summary = [['Итоги интервью', 'Оценено', report.rated, 'Всего', report.total, 'Дата выгрузки', report.generatedAt, 'Редакция ' + report.revision],
      [...labels, ...report.ratingLabels], ...summaryRows(report)];
    const details = [['Уровень', 'Тема', 'Вопрос / задача', 'Оценка'], ...detailRows(report)];
    return zip({
      '[Content_Types].xml': contentTypes([['xl/workbook.xml', 'spreadsheetml.sheet.main'], ['xl/worksheets/sheet1.xml', 'spreadsheetml.worksheet'], ['xl/worksheets/sheet2.xml', 'spreadsheetml.worksheet'], ['xl/styles.xml', 'spreadsheetml.styles']]),
      '_rels/.rels': relationships([['rId1', 'officeDocument', 'xl/workbook.xml']]),
      'xl/workbook.xml': '<workbook xmlns="' + ns + 'spreadsheetml/2006/main" xmlns:r="' + documentNS.slice(0, -1) + '"><bookViews><workbookView/></bookViews><sheets><sheet name="Сводка" sheetId="1" r:id="rId1"/><sheet name="Оценённые вопросы" sheetId="2" r:id="rId2"/></sheets></workbook>',
      'xl/_rels/workbook.xml.rels': relationships([['rId1', 'worksheet', 'worksheets/sheet1.xml'], ['rId2', 'worksheet', 'worksheets/sheet2.xml'], ['rId3', 'styles', 'styles.xml']]),
      'xl/styles.xml': '<styleSheet xmlns="' + ns + 'spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE7EDF4"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>',
      'xl/worksheets/sheet1.xml': sheet(summary, [23, 27, 12, 12, 14, 12, 14, 12], 2),
      'xl/worksheets/sheet2.xml': sheet(details, [23, 27, 100, 16], 1)
    });
  }

  window.InterviewResultsExport = {
    build(format, report) {
      if (format === 'docx') return docx(report);
      if (format === 'xlsx') return xlsx(report);
      throw Error('Неизвестный формат отчёта');
    }
  };
}());
