// Loads public/i18n.js (a browser script) to read its translation table
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, '../../public/i18n.js'), 'utf8');
const ctx = { document: { documentElement: { dataset: {} }, querySelector: () => null }, localStorage: undefined };
vm.runInNewContext(`${src}\nthis.I18N = I18N;`, ctx);
module.exports = { I18N: ctx.I18N };
