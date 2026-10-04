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
