const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const path = require('path');
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
