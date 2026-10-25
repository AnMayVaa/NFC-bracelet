const test = require('node:test');
const assert = require('node:assert');
const { COUNTRY_LANG, PHONE_SAMPLE, langForCountry, formatPhone, phoneSample } = require('../public/country.js');
const { DIAL } = require('../lib/data/countries');
const { I18N } = require('./helpers/i18n');

test('nationality picks a translated app language, else English', () => {
  assert.strictEqual(langForCountry('KR'), 'ko');
  assert.strictEqual(langForCountry('BR'), 'pt');
  assert.strictEqual(langForCountry('GB'), 'en');
  assert.strictEqual(langForCountry('XX'), 'en');
  for (const [iso, lang] of Object.entries(COUNTRY_LANG)) {
    assert.ok(DIAL[iso], `${iso} is a known country`);
    assert.ok(I18N[lang], `${lang} is an app language`);
  }
});

test('phone numbers are spaced per country', () => {
  assert.strictEqual(formatPhone('1012345678', 'KR', '82'), '10 1234 5678');
  assert.strictEqual(formatPhone('01012345678', 'KR', '82'), '010 1234 5678');
  assert.strictEqual(formatPhone('0812345678', 'TH', '66'), '081 234 5678');
  assert.strictEqual(formatPhone('612345678', 'FR', '33'), '6 12 34 56 78');
  assert.strictEqual(formatPhone('4155550132', 'CA', '1'), '415 555 0132');   // +1 countries dial like the US
  assert.strictEqual(formatPhone('9123', 'SG', '65'), '9123');                 // partial while typing
  assert.strictEqual(formatPhone('91234', 'SG', '65'), '9123 4');
  assert.strictEqual(formatPhone('9123456789', 'ZZ', '999'), '912 345 6789');  // unknown: groups of three
  assert.strictEqual(formatPhone('81-234 5678x', 'TH', '66'), '81 234 5678');
  assert.strictEqual(formatPhone('', 'TH', '66'), '');
  assert.strictEqual(phoneSample('JM', '1'), PHONE_SAMPLE.US);
});

test('every sample fits E.164 for its country', () => {
  for (const [iso, sample] of Object.entries(PHONE_SAMPLE)) {
    assert.ok(DIAL[iso], `${iso} is a known country`);
    const n = sample.replace(/\D/g, '').length + DIAL[iso].length;
    assert.ok(n >= 6 && n <= 15, `${iso} sample length ${n}`);
  }
});
