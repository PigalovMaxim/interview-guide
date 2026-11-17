const assert = require('node:assert/strict');

function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let i = 0; i < 8; i++) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  }
  return (value ^ 0xffffffff) >>> 0;
}

// Независимо проверяем записи ZIP, CRC и центральный каталог, а не только сигнатуру.
function readOfficeZip(input) {
  const buffer = Buffer.from(input);
  const parts = new Map();
  let offset = 0;
  while (buffer.readUInt32LE(offset) === 0x04034b50) {
    assert.equal(buffer.readUInt16LE(offset + 8), 0, 'ZIP store');
    const size = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const name = buffer.toString('utf8', offset + 30, offset + 30 + nameLength);
    const from = offset + 30 + nameLength + extraLength;
    const data = buffer.subarray(from, from + size);
    assert.equal(data.length, size);
    assert.equal(crc32(data), buffer.readUInt32LE(offset + 14), name + ': CRC');
    assert.ok(!parts.has(name));
    parts.set(name, { offset, size, crc: crc32(data), xml: data.toString('utf8') });
    offset = from + size;
  }
  const centralOffset = offset;
  const seen = new Set();
  while (buffer.readUInt32LE(offset) === 0x02014b50) {
    const length = buffer.readUInt16LE(offset + 28);
    const name = buffer.toString('utf8', offset + 46, offset + 46 + length);
    const entry = parts.get(name);
    assert.ok(entry, name);
    assert.ok(!seen.has(name));
    assert.equal(buffer.readUInt32LE(offset + 42), entry.offset);
    assert.equal(buffer.readUInt32LE(offset + 16), entry.crc);
    assert.equal(buffer.readUInt32LE(offset + 20), entry.size);
    seen.add(name);
    offset += 46 + length + buffer.readUInt16LE(offset + 30) + buffer.readUInt16LE(offset + 32);
  }
  assert.equal(seen.size, parts.size);
  assert.equal(buffer.readUInt32LE(offset), 0x06054b50);
  assert.equal(buffer.readUInt16LE(offset + 10), parts.size);
  assert.equal(buffer.readUInt32LE(offset + 12), offset - centralOffset);
  assert.equal(buffer.readUInt32LE(offset + 16), centralOffset);
  assert.equal(offset + 22 + buffer.readUInt16LE(offset + 20), buffer.length);
  return new Map([...parts].map(([name, entry]) => [name, entry.xml]));
}

function reportFor(content, ratings = {}) {
  const keys = Object.keys(content.ratingLabels);
  const ratedItems = [];
  const levels = content.tabs.map(tab => {
    const topics = content.topics.map(topic => {
      const cards = content.materials.filter(item => item.tab === tab.key && item.topic === topic.key).sort((a,b) => a.ordinal-b.ordinal);
      const counts = keys.map(key => cards.filter(item => Object.hasOwn(ratings, item.id) && ratings[item.id] === key).length);
      for (const card of cards) if (Object.hasOwn(ratings, card.id) && keys.includes(ratings[card.id])) {
        ratedItems.push({ level: tab.label, topic: topic.label, title: card.title + ((card.statement || card.question) === card.title ? '' : ' — ' + (card.statement || card.question)), rating: content.ratingLabels[ratings[card.id]] });
      }
      return { label: topic.label, total: cards.length, rated: counts.reduce((sum, value) => sum + value, 0), counts };
    });
    return { label: tab.label, total: topics.reduce((sum,t) => sum+t.total, 0), rated: topics.reduce((sum,t) => sum+t.rated, 0), topics: topics.filter(topic => topic.rated > 0) };
  }).filter(level => level.rated > 0);
  return {generatedAt:'2026-11-17T12:00:00.000Z', revision:content.revision, total:content.materials.length, rated:ratedItems.length, ratingLabels:Object.values(content.ratingLabels), levels, ratedItems};
}
module.exports = { readOfficeZip, reportFor };
