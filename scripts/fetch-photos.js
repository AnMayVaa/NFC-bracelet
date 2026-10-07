// Downloads one openly licensed photo per For You item from Wikimedia Commons into
// public/img/places/, and saves author + licence to lib/data/photos.json and
// public/img/places/CREDITS.md. Run once (needs internet): npm run fetch-photos
const fs = require('fs');
const path = require('path');
const CATALOG = require('../lib/data/catalog');
const { lookup, PHOTOS_FILE } = require('../lib/photos');

const DIR = path.join(__dirname, '..', 'public', 'img', 'places');
const UA = 'JejuWishBand/1.0 (https://github.com/AnMayVaa/NFC-bracelet)';

(async () => {
  const found = await lookup(CATALOG, { timeoutMs: 20000 });
  fs.mkdirSync(DIR, { recursive: true });
  const saved = {};
  for (const item of CATALOG) {
    const p = found[item.id];
    if (!p) { console.log(`–  ${item.id}: no photo found, card keeps its emoji`); continue; }
    const ext = (path.extname(new URL(p.src).pathname) || '.jpg').toLowerCase();
    const file = `${item.id}${ext}`;
    const res = await fetch(p.src, { headers: { 'User-Agent': UA } });
    if (!res.ok) { console.log(`–  ${item.id}: download failed (HTTP ${res.status})`); continue; }
    fs.writeFileSync(path.join(DIR, file), Buffer.from(await res.arrayBuffer()));
    saved[item.id] = { ...p, src: `/img/places/${file}`, remote: p.src };
    console.log(`✅ ${item.id}: ${p.author} (${p.license})`);
  }
  fs.writeFileSync(PHOTOS_FILE, JSON.stringify(saved, null, 2) + '\n');
  const lines = ['# Photo credits', '', 'Photos from Wikimedia Commons, used under their licences.', '',
    '| Item | Author | Licence | Source |', '|---|---|---|---|',
    ...Object.entries(saved).map(([id, p]) => `| ${id} | ${p.author} | ${p.license} | ${p.page} |`)];
  fs.writeFileSync(path.join(DIR, 'CREDITS.md'), lines.join('\n') + '\n');
  console.log(`\nSaved ${Object.keys(saved).length}/${CATALOG.length} photos. Commit public/img/places and lib/data/photos.json.`);
})().catch(e => { console.error('❌ Could not fetch photos:', e.message); process.exit(1); });
