const test = require('node:test');
const assert = require('node:assert');
const { lookup } = require('../lib/photos');

// Fake Wikipedia + Commons answers
function fakeFetch(calls) {
  return async url => {
    calls.push(url);
    const body = url.includes('en.wikipedia.org')
      ? { query: {
          normalized: [{ from: 'Seongsan_Ilchulbong', to: 'Seongsan Ilchulbong' }],
          redirects: [{ from: 'Manjanggul', to: 'Manjanggul Lava Tube' }],
          pages: [
            { title: 'Seongsan Ilchulbong', pageimage: 'Seongsan_Ilchulbong_from_the_air.jpg', thumbnail: { source: 'https://upload.wikimedia.org/a/640px-S.jpg' } },
            { title: 'Manjanggul Lava Tube', pageimage: 'Manjanggul.jpg', thumbnail: { source: 'https://upload.wikimedia.org/b/640px-M.jpg' } },
            { title: 'Nothing', missing: true }
          ] } }
      : { query: {
          normalized: [{ from: 'File:Seongsan_Ilchulbong_from_the_air.jpg', to: 'File:Seongsan Ilchulbong from the air.jpg' }],
          pages: [
            { title: 'File:Seongsan Ilchulbong from the air.jpg', imageinfo: [{ url: 'https://upload.wikimedia.org/a/S.jpg', descriptionurl: 'https://commons.wikimedia.org/wiki/File:S.jpg',
              extmetadata: { Artist: { value: '<a href="x">Jane Doe</a>' }, LicenseShortName: { value: 'CC BY-SA 4.0' }, LicenseUrl: { value: 'https://creativecommons.org/licenses/by-sa/4.0' } } }] }
            // Manjanggul has no Commons info, so it must be skipped (no licence = no photo)
          ] } };
    return { ok: true, json: async () => body };
  };
}

test('photos: Wikipedia lead image + Commons author and licence', async () => {
  const calls = [];
  const items = [
    { id: 'p-seongsan', wiki: ['Seongsan_Ilchulbong'] },
    { id: 'p-manjanggul', wiki: ['Manjanggul'] },
    { id: 'x-none', wiki: ['Nothing'] },
    { id: 'x-empty', wiki: [] }
  ];
  const out = await lookup(items, { fetchImpl: fakeFetch(calls) });
  assert.strictEqual(calls.length, 2);
  assert.deepStrictEqual(Object.keys(out), ['p-seongsan']);
  assert.strictEqual(out['p-seongsan'].author, 'Jane Doe');
  assert.strictEqual(out['p-seongsan'].license, 'CC BY-SA 4.0');
  assert.strictEqual(out['p-seongsan'].src, 'https://upload.wikimedia.org/a/640px-S.jpg');
  assert.match(out['p-seongsan'].article, /wikipedia\.org\/wiki\/Seongsan_Ilchulbong/);
});
