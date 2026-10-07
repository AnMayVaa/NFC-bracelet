const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const path = require('path');
process.env.PHOTOS_LIVE = '0';
const { createApp } = require('../lib/app');

function start() {
  const app = createApp({ dbFile: path.join(os.tmpdir(), `wb-test-${process.pid}.json`) });
  return new Promise(resolve => { const s = app.listen(0, () => resolve(s)); });
}

test('API works through the Vercel rewrite (/api/index.js?__path=...)', async () => {
  const s = await start();
  const base = `http://127.0.0.1:${s.address().port}`;
  try {
    const direct = await (await fetch(`${base}/api/tourist/RW1`)).json();
    const rewritten = await (await fetch(`${base}/api/index.js?__path=tourist/RW1`)).json();
    assert.strictEqual(direct.uid, 'RW1');
    assert.strictEqual(rewritten.uid, 'RW1');
    const recs = await (await fetch(`${base}/api/index.js?__path=recommendations&uid=RW1&category=food`)).json();
    assert.ok(recs.recommendations.every(r => r.category === 'food'));
    const tap = await fetch(`${base}/api/index.js?__path=demo/tap`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uid: 'RW1', station: 'food' })
    });
    assert.strictEqual(tap.status, 200);
  } finally {
    s.close();
  }
});

test('health reports a failing database with 503', async () => {
  const saved = { ...process.env };
  process.env.SUPABASE_URL = 'http://127.0.0.1:9';   // nothing listens here
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'x';
  const s = await start();
  try {
    const r = await fetch(`http://127.0.0.1:${s.address().port}/api/health`);
    const j = await r.json();
    assert.strictEqual(r.status, 503);
    assert.strictEqual(j.database.storage, 'supabase');
    assert.strictEqual(j.database.ok, false);
  } finally {
    s.close();
    process.env = saved;
  }
});

test('demo control: seed story, play a journey, clear', async () => {
  const s = await start();
  const base = `http://127.0.0.1:${s.address().port}`;
  const post = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json());
  try {
    const seeded = await post('/api/admin/seed', { mode: 'replace' });
    assert.strictEqual(seeded.tourists, 11);
    assert.strictEqual(seeded.sosAlerts, 3);
    let st = await (await fetch(`${base}/api/admin/status`)).json();
    assert.strictEqual(st.tourists.find(t => t.uid === 'BEAD_004').voucher.status, 'UNLOCKED');
    assert.ok(st.metrics.conversionRate > 0);

    assert.ok((await post('/api/admin/simulate', { uid: 'BEAD_001', action: 'complete' })).success);
    assert.ok((await post('/api/admin/simulate', { uid: 'BEAD_001', action: 'redeem' })).success);
    assert.ok((await post('/api/admin/simulate', { uid: 'BEAD_001', action: 'sos' })).success);
    st = await (await fetch(`${base}/api/admin/status`)).json();
    assert.strictEqual(st.tourists.find(t => t.uid === 'BEAD_001').voucher.status, 'REDEEMED');
    assert.strictEqual(st.metrics.sosTotal, 4);

    assert.strictEqual((await post('/api/admin/clear', { what: 'sos' })).count, 4);
    await post('/api/admin/clear', { what: 'all' });
    st = await (await fetch(`${base}/api/admin/status`)).json();
    assert.strictEqual(st.tourists.length, 0);
  } finally {
    s.close();
  }
});

test('register: any nationality and an international emergency phone', async () => {
  const s = await start();
  const base = `http://127.0.0.1:${s.address().port}`;
  const post = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  try {
    let r = await post('/api/register', { uid: 'INTL1', name: 'Nguyễn Văn An', countryCode: 'vn', emergencyContact: '+84 912345678', emergencyName: 'Mẹ', emergencyRelation: 'Family' });
    const j = await r.json();
    assert.strictEqual(r.status, 200);
    assert.strictEqual(j.tourist.countryCode, 'VN');
    assert.strictEqual(j.tourist.country, 'Vietnam');
    assert.strictEqual(j.tourist.emergencyName, 'Mẹ');
    r = await post('/api/register', { uid: 'INTL1', emergencyContact: '+1 23' });
    assert.strictEqual(r.status, 400);
    r = await post('/api/register', { uid: 'INTL1', countryCode: 'ZZ' });
    assert.strictEqual(r.status, 400);
    const cfg = await (await fetch(`${base}/api/config`)).json();
    assert.strictEqual(cfg.dialCodes.TH, '66');
  } finally {
    s.close();
  }
});

test('first use: interests, health and mobility are saved and shape the picks', async () => {
  const s = await start();
  const base = `http://127.0.0.1:${s.address().port}`;
  const post = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  try {
    let r = await post('/api/register', { uid: 'OB1', mobility: 'flying' });
    assert.strictEqual(r.status, 400);
    r = await post('/api/register', {
      uid: 'OB1', countryCode: 'TH', interests: ['food', 'market', 'bogus'], mobility: 'wheelchair',
      medicalNotes: 'Asthma', emergencyContact: '+66 812345678', onboarded: true
    });
    const j = await r.json();
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(j.tourist.interests, ['food', 'market']);
    assert.strictEqual(j.tourist.mobility, 'wheelchair');
    assert.ok(j.tourist.onboardedAt);
    const recs = await (await fetch(`${base}/api/recommendations?uid=OB1`)).json();
    assert.ok(recs.recommendations.every(x => x.effort < 2), 'no steep walks for a wheelchair user');
    assert.strictEqual(recs.recommendations[0].category, 'food');
    for (const x of recs.recommendations) {
      assert.ok(x.link && /^https:\/\//.test(x.link.url));
      assert.ok('photo' in x);
    }
    const olle = (await (await fetch(`${base}/api/recommendations?category=activity`)).json()).recommendations.find(x => x.id === 'a-olle-walk');
    assert.deepStrictEqual(olle.link, { kind: 'website', url: 'https://www.jejuolle.org' });
    const maze = (await (await fetch(`${base}/api/recommendations?category=activity`)).json()).recommendations.find(x => x.id === 'a-maze');
    assert.strictEqual(maze.link.kind, 'official');
    const today = await (await fetch(`${base}/api/recommendations?uid=OB1&today=culture,bogus`)).json();
    assert.ok(today.recommendations[0].interests.includes('culture'));
    const cfg = await (await fetch(`${base}/api/config`)).json();
    assert.ok(cfg.interests.includes('nature'));
  } finally {
    s.close();
  }
});
