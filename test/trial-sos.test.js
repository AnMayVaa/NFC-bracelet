const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const path = require('path');
process.env.PHOTOS_LIVE = '0';
const core = require('../lib/core');
const insights = require('../lib/insights');
const CATALOG = require('../lib/data/catalog');
const { createApp } = require('../lib/app');

function start() {
  const app = createApp({ dbFile: path.join(os.tmpdir(), `wb-trial-${process.pid}-${Date.now()}.json`) });
  return new Promise(resolve => { const s = app.listen(0, () => resolve(s)); });
}

function client(s) {
  const base = `http://127.0.0.1:${s.address().port}`;
  const post = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    .then(async r => ({ ...(await r.json()), http: r.status }));
  const get = p => fetch(base + p).then(r => r.json());
  return { base, post, get };
}

// ------------------------------------------------------------------ band-tap SOS (rules)
test('rapid taps are counted per band and station inside the window', () => {
  const t = core.newGuest('RT1');
  const now = 1_000_000;
  assert.strictEqual(core.countRapidTap(t, 'food', now), 1);
  assert.strictEqual(core.countRapidTap(t, 'food', now + 1000), 2);
  assert.strictEqual(core.countRapidTap(t, 'place', now + 2000), 1, 'another station starts again');
  assert.strictEqual(core.countRapidTap(t, 'place', now + 2000 + core.SOS_TAP_WINDOW_MS), 1, 'old taps fall out of the window');
  for (let i = 1; i < core.SOS_TAPS; i++) core.countRapidTap(t, 'food', now + 30000 + i * 500);
  assert.strictEqual(core.countRapidTap(t, 'food', now + 33000), core.SOS_TAPS);
});

test('band SOS is pinned to the station; a band with no profile shows its label', () => {
  const t = core.newGuest('RT2');
  const a = core.newSosAlert({ uid: t.uid, tourist: t, trigger: 'band', station: 'activity' });
  const st = core.resolveStation('activity');
  assert.strictEqual(a.trigger, 'band');
  assert.strictEqual(a.location.source, 'station-taps');
  assert.deepStrictEqual([a.location.latitude, a.location.longitude], [st.lat, st.lng]);
  assert.strictEqual(a.tourist.medicalNotes, '');
  assert.strictEqual(a.tourist.emergencyContact, '');
  assert.strictEqual(a.tourist.name, core.bandLabel('RT2'));
});

// ------------------------------------------------------------------ band-tap SOS (API)
test('one tap stamps once with no SOS; five quick taps raise one SOS', async () => {
  const s = await start();
  const { post, get } = client(s);
  try {
    await post('/api/register', { uid: 'TAP1', medicalNotes: 'Peanut allergy' });
    const first = await post('/api/checkin', { uid: 'TAP1', station: 'food' });
    assert.strictEqual(first.duplicate, false);
    assert.strictEqual(first.sosTriggered, false);
    let r;
    for (let i = 2; i <= core.SOS_TAPS; i++) r = await post('/api/checkin', { uid: 'TAP1', station: 'food' });
    assert.strictEqual(r.duplicate, true, 'repeats inside the cooldown do not stamp');
    assert.strictEqual(r.sosTriggered, true);

    const st = await get('/api/admin/status');
    const t = st.tourists.find(x => x.uid === 'TAP1');
    assert.strictEqual(t.checkinHistory.length, 1, 'exactly one stamp');
    assert.strictEqual(st.sosAlerts.length, 1);
    const a = st.sosAlerts[0];
    assert.strictEqual(a.trigger, 'band');
    assert.strictEqual(a.stationId, 'food');
    assert.strictEqual(a.tourist.medicalNotes, 'Peanut allergy', 'band SOS carries the saved profile');

    // More taps while help is on the way: same alert, no second one
    for (let i = 0; i < core.SOS_TAPS; i++) r = await post('/api/checkin', { uid: 'TAP1', station: 'food' });
    assert.strictEqual(r.alertId, a.alertId);
    assert.strictEqual((await get('/api/admin/status')).sosAlerts.length, 1);

    // Two taps at a station is still just a check-in
    await post('/api/checkin', { uid: 'TAP2', station: 'place' });
    r = await post('/api/checkin', { uid: 'TAP2', station: 'place' });
    assert.strictEqual(r.sosTriggered, false);
  } finally {
    s.close();
  }
});

test('station-counted SOS (firmware 2.1) and the admin 5-tap demo', async () => {
  const s = await start();
  const { post, get } = client(s);
  try {
    let r = await post('/api/sos/band', { uid: 'FW1', station: 'place', taps: 2 });
    assert.strictEqual(r.http, 400);
    r = await post('/api/sos/band', { uid: 'FW1', station: 'place', taps: 5, ageSec: 60 });
    assert.strictEqual(r.http, 200);
    assert.ok(r.alertId);
    const st = await get('/api/admin/status');
    const a = st.sosAlerts.find(x => x.alertId === r.alertId);
    assert.ok(Date.now() - Date.parse(a.triggeredAt) >= 59000, 'queued SOS keeps its tap time');
    assert.strictEqual(st.tourists.find(x => x.uid === 'FW1').lastLocation.station, 'place');

    r = await post('/api/admin/simulate', { uid: 'SIM1', action: 'sos-taps' });
    assert.match(r.message, /SOS/);
  } finally {
    s.close();
  }
});

// ------------------------------------------------------------------ field trial
test('trial: consent, survey, indicators from trial bands only, anonymous export', async () => {
  const s = await start();
  const { base, post, get } = client(s);
  try {
    await post('/api/admin/seed', { mode: 'replace' });   // demo data must not leak into trial numbers
    await post('/api/register', { uid: 'TR1', name: 'Real Person', countryCode: 'TH', emergencyContact: '+66 812345678' });
    let r = await post('/api/trial/survey', { uid: 'TR1', overall: 5, aiPicks: 4, safety: 5 });
    assert.strictEqual(r.http, 400, 'no survey before consent');
    assert.ok((await post('/api/trial/consent', { uid: 'TR1', consent: true })).trial.consentAt);
    assert.ok((await post('/api/trial/consent', { uid: 'TR2', consent: true })).success);

    await get('/api/recommendations?uid=TR1');                 // 3 picks shown
    await post('/api/recommendations/event', { uid: 'TR1', itemId: 'f-dongmun-stalls', action: 'opened' });
    await post('/api/checkin', { uid: 'TR1', station: 'food' }); // opened pick at food -> visited
    r = await post('/api/trial/survey', { uid: 'TR1', overall: 9, aiPicks: 4, safety: 5 });
    assert.strictEqual(r.http, 400);
    r = await post('/api/trial/survey', { uid: 'TR1', overall: 4, aiPicks: 3, safety: 5, comment: 'Nice, "quiet" spots' });
    assert.strictEqual(r.http, 200);
    await post('/api/sos', { uid: 'TR2' });                       // no fix at all

    const ind = (await get('/api/admin/status')).trial;
    assert.strictEqual(ind.bands, 2);
    assert.strictEqual(ind.conversion.shown, 3);
    assert.strictEqual(ind.conversion.visited, 1);
    assert.strictEqual(ind.satisfaction.responses, 1);
    assert.strictEqual(ind.satisfaction.overall, 4);
    assert.strictEqual(ind.checkins.total, 1);
    assert.strictEqual(ind.lastLocation.sosAlerts, 1);
    assert.strictEqual(ind.lastLocation.rate, 0);

    const csv = await (await fetch(`${base}/api/admin/trial-export?part=bands&format=csv`)).text();
    assert.ok(csv.includes('participant'));
    assert.ok(!csv.includes('TR1') && !csv.includes('Real Person') && !csv.includes('812345678'));
    assert.ok(csv.includes('"Nice, ""quiet"" spots"'));
    const summary = await (await fetch(`${base}/api/admin/trial-export?format=csv`)).text();
    assert.match(summary, /Recommendation conversion rate/);
    const json = await get('/api/admin/trial-export');
    assert.strictEqual(json.bands.length, 2);

    await post('/api/trial/consent', { uid: 'TR2', consent: false });
    assert.strictEqual((await get('/api/admin/status')).trial.bands, 1, 'left the study = left out');
  } finally {
    s.close();
  }
});

// ------------------------------------------------------------------ impact panel
test('impact: local vs hotspot shares and redemptions per shop', async () => {
  const s = await start();
  const { post, get } = client(s);
  try {
    let r = await post('/api/admin/simulate', { uid: 'IM1', action: 'complete' });
    r = await post('/api/redeem', { uid: 'IM1', pin: '4000' });
    assert.strictEqual(r.http, 400, 'shop is required');
    r = await post('/api/redeem', { uid: 'IM1', pin: '4000', shop: 'dm-tangerine' });
    assert.strictEqual(r.http, 200);
    assert.strictEqual(r.voucher.shop, 'dm-tangerine');

    const impact = (await get('/api/admin/status')).impact.all;
    assert.strictEqual(impact.checkins.total, 3);
    assert.strictEqual(impact.redeemedTotal, 1);
    assert.deepStrictEqual(impact.redemptions[0], { shop: 'dm-tangerine', name: 'Tangerine & fruit stall', count: 1 });
    assert.strictEqual(impact.stations.length, 3);
  } finally {
    s.close();
  }
});

test('impact buckets follow catalog crowd levels', () => {
  const t = core.newGuest('IM2');
  const quietLocal = CATALOG.find(i => i.isLocalBusiness && i.crowdLevel < 0.4);
  const hotspot = CATALOG.find(i => i.crowdLevel >= 0.7 && !i.isLocalBusiness);
  core.logRecEvent(t, { itemId: quietLocal.id, action: 'shown' });
  core.logRecEvent(t, { itemId: hotspot.id, action: 'shown' });
  const im = insights.computeImpact([t], CATALOG);
  assert.strictEqual(im.picks.shown.total, 2);
  assert.strictEqual(im.picks.shown.local, 1);
  assert.strictEqual(im.picks.shown.quietShare, 50);
  assert.strictEqual(im.picks.shown.hotspotShare, 50);
  assert.strictEqual(insights.computeImpact([t], CATALOG, { trialOnly: true }).bands, 0);
});
