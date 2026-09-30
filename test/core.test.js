const test = require('node:test');
const assert = require('node:assert');
const core = require('../lib/core');
const CATALOG = require('../lib/data/catalog');
const { migrate } = require('../lib/store');

test('legacy checkpoint ids map onto new stations', () => {
  assert.strictEqual(core.resolveStation('checkpoint1').id, 'place');
  assert.strictEqual(core.resolveStation('checkpoint2').id, 'food');
  assert.strictEqual(core.resolveStation('ACTIVITY').id, 'activity');
  assert.strictEqual(core.resolveStation('nope'), null);
});

test('voucher unlocks only after food, place and activity', () => {
  const t = core.newGuest('T1');
  let now = Date.now();
  assert.strictEqual(core.recordCheckin(t, 'food', now).voucherUnlocked, false);
  assert.strictEqual(core.recordCheckin(t, 'place', now += 1000).voucherUnlocked, false);
  const r = core.recordCheckin(t, 'activity', now += 1000);
  assert.strictEqual(r.voucherUnlocked, true);
  assert.strictEqual(t.voucher.status, 'UNLOCKED');
  const code = t.voucher.code;
  core.recordCheckin(t, 'food', now += 120000);
  assert.strictEqual(t.voucher.code, code, 'no re-issue on re-check-in');
});

test('re-check-in inside cooldown is a duplicate', () => {
  const t = core.newGuest('T2');
  const now = Date.now();
  core.recordCheckin(t, 'food', now);
  assert.strictEqual(core.recordCheckin(t, 'food', now + 5000).duplicate, true);
  assert.strictEqual(t.checkinHistory.length, 1);
  assert.strictEqual(core.recordCheckin(t, 'food', now + 61000).entry.visitSequence, 2);
});

test('check-in writes a last-known location', () => {
  const t = core.newGuest('T3');
  core.recordCheckin(t, 'place');
  assert.strictEqual(t.lastLocation.station, 'place');
  const alert = core.newSosAlert({ uid: 'T3', tourist: t });
  assert.strictEqual(alert.location.source, 'last-station');
});

test('redeem is single use', () => {
  const t = core.newGuest('T4');
  ['food', 'place', 'activity'].forEach(s => core.recordCheckin(t, s));
  core.redeemVoucher(t);
  assert.throws(() => core.redeemVoucher(t), e => e.status === 409);
});

test('halal diner never sees pork or untagged food', () => {
  const t = core.newGuest('T5', { dietary: 'Halal' });
  const foods = core.recommend(t, CATALOG, { category: 'food' });
  assert.ok(foods.length > 0);
  assert.ok(foods.every(f => (f.dietaryTags || []).includes('TAG_HALAL')));
});

test('unknown restriction fails closed for food', () => {
  const t = core.newGuest('T6', { dietary: 'peanut allergy' });
  assert.strictEqual(core.recommend(t, CATALOG, { category: 'food' }).length, 0);
});

test('visited place is removed, UV >= 8 favours indoor', () => {
  const t = core.newGuest('T7');
  core.recordCheckin(t, 'place');
  const places = core.recommend(t, CATALOG, { category: 'place', uv: 9 });
  assert.ok(!places.find(p => p.id === 'p-seongsan'));
  assert.strictEqual(places[0].uvType, 'INDOOR_SHELTER');
});

test('v1 database migrates to v2', () => {
  const db = migrate({ BEAD_001: { uid: 'BEAD_001', name: 'A', stamps: { checkpoint1: true, checkpoint2: false }, voucher: { unlocked: false, redeemed: false } } });
  assert.strictEqual(db.schemaVersion, 2);
  assert.strictEqual(db.tourists.BEAD_001.stamps.place, true);
  assert.strictEqual(db.tourists.BEAD_001.voucher.status, 'LOCKED');
});

test('SOS flow rejects illegal moves', () => {
  const a = core.newSosAlert({ uid: 'X', tourist: null });
  assert.throws(() => core.advanceSos(a, 'DISPATCHED'), e => e.status === 409);
  core.advanceSos(a, 'ACKNOWLEDGED');
  core.advanceSos(a, 'DISPATCHED', { responder: 'Team', etaMinutes: 8 });
  core.advanceSos(a, 'RESOLVED');
  assert.strictEqual(a.status, 'RESOLVED');
});
