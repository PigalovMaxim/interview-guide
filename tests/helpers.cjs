const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const preservedFields = ['statement', 'examples', 'starterCode', 'solution', 'edgeCases', 'complexity', 'language'];
function digestTask(card) {
  return crypto.createHash('sha256').update(JSON.stringify(preservedFields.map(key => [key, card[key]]))).digest('hex');
}
function digestQuestion({ ordinal, ...card }) {
  return crypto.createHash('sha256').update(JSON.stringify(card)).digest('hex');
}
function loadContent() {
  const scope = { window: {} };
  vm.createContext(scope);
  for (const file of ['catalog.js', ...fs.readdirSync(path.join(root, 'web/data')).filter(file => file !== 'catalog.js').sort()]) {
    vm.runInContext(fs.readFileSync(path.join(root, 'web/data', file), 'utf8'), scope, { filename: file });
  }
  return JSON.parse(JSON.stringify(scope.window.InterviewContent));
}
module.exports = { root, loadContent, digestTask, digestQuestion };
