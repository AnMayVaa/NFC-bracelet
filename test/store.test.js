const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const core = require('../lib/core');
const { createSupabaseStore, createStore, emptyDb } = require('../lib/store');

// Minimal stand-in for Supabase's REST API: select, upsert and delete-in.
function fakeSupabase() {
  const tables = { tourists: new Map(), sos_alerts: new Map() };
  const keys = { tourists: 'uid', sos_alerts: 'alert_id' };
  const calls = [];
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const name = url.pathname.replace('/rest/v1/', '');
    const table = tables[name];
    let body = '';
    req.on('data', c => (body += c));
    req.on('end', () => {
      calls.push(`${req.method} ${name}`);
      if (req.headers.apikey !== 'secret') { res.writeHead(401); return res.end('{}'); }
      if (req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify([...table.values()]));
      }
      if (req.method === 'POST') {
        for (const row of JSON.parse(body)) table.set(row[keys[name]], row);
        res.writeHead(201); return res.end();
      }
      if (req.method === 'DELETE') {
        const list = url.searchParams.get(keys[name]).replace(/^in\.\(|\)$/g, '').split(',').map(s => s.replace(/"/g, ''));
        for (const id of list) table.delete(id);
        res.writeHead(204); return res.end();
      }
      res.writeHead(405); res.end();
    });
  });
  return new Promise(resolve => server.listen(0, () => resolve({ server, tables, calls, url: `http://127.0.0.1:${server.address().port}` })));
}

test('createStore picks JSON without Supabase env and Supabase with it', () => {
  assert.strictEqual(createStore('/tmp/x.json', {}).kind, 'json');
  assert.strictEqual(createStore('/tmp/x.json', { SUPABASE_URL: 'https://a.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k' }).kind, 'supabase');
});

test('Supabase store round-trips tourists and SOS alerts and writes only changes', async () => {
  const fake = await fakeSupabase();
  try {
    const a = createSupabaseStore({ url: fake.url, key: 'secret' });
    await a.refresh();
    const t = core.newGuest('BAND1', { name: 'Mina' });
    core.recordCheckin(t, 'food');
    a.load().tourists.BAND1 = t;
    a.load().tourists.BAND2 = core.newGuest('BAND2');
    const alert = core.newSosAlert({ uid: 'BAND1', tourist: t });
    a.load().sosAlerts[alert.alertId] = alert;
    await a.save();

    const row = fake.tables.tourists.get('BAND1');
    assert.strictEqual(row.name, 'Mina');
    assert.strictEqual(row.stamps, 1);
    assert.strictEqual(fake.tables.sos_alerts.get(alert.alertId).status, 'PENDING');

    // A second instance (another serverless function) sees the same data.
    const b = createSupabaseStore({ url: fake.url, key: 'secret' });
    await b.refresh();
    assert.strictEqual(b.load().tourists.BAND1.stamps.food, true);

    // Saving with nothing changed sends no writes.
    fake.calls.length = 0;
    await b.save();
    assert.deepStrictEqual(fake.calls, []);

    // Deletes and replace remove rows.
    delete b.load().tourists.BAND2;
    await b.save();
    assert.ok(!fake.tables.tourists.has('BAND2'));
    await b.replace(emptyDb());
    assert.strictEqual(fake.tables.tourists.size, 0);
    assert.strictEqual(fake.tables.sos_alerts.size, 0);
  } finally {
    fake.server.close();
  }
});
