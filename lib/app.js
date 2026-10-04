// lib/app.js — one Express app used by server.js (local + WebSocket) and api/index.js (Vercel).
const express = require('express');
const core = require('./core');
const { createStore, demoTourists, emptyDb } = require('./store');
const { getUvIndex } = require('./uv');
const CATALOG = require('./data/catalog');
const { STATIONS, STATION_KINDS, REWARD, HELP_POINTS, HOTLINES } = require('./data/stations');

const PUBLIC_URL = process.env.PUBLIC_URL || 'https://smart-nfc-bracelet.vercel.app';
const DEMO_MODE = process.env.DEMO_MODE !== 'false';
const MERCHANT_PIN = process.env.MERCHANT_PIN || '4000';
const STATION_KEY = process.env.STATION_KEY || '';   // empty = stations need no key
const ADMIN_PIN = process.env.ADMIN_PIN || '';       // empty = admin page needs no PIN

// Demo helper: taps from these fobs/cards also stamp the main NFC bracelet.
const DEMO_MIRROR = { FA1D2207: '04DBCE42CA2A81', '2E720204': '04DBCE42CA2A81' };

function cleanUid(uid) {
  return String(uid || '').toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 32);
}

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

function createApp({ dbFile, broadcast = () => {} } = {}) {
  const store = createStore(dbFile);
  const app = express();

  // In-memory admin state (per process / per serverless instance)
  const admin = {
    lastScan: null,
    pendingWrite: null,
    stations: {},   // id -> { lastSeen, ip, rssi, ssid, fw }
    events: [{ type: 'SYSTEM', text: 'Server started.', timestamp: new Date().toISOString() }]
  };

  function emit(type, text, payload) {
    admin.events.unshift({ type, text, timestamp: new Date().toISOString() });
    if (admin.events.length > 50) admin.events.length = 50;
    if (payload !== undefined) broadcast(type, payload);
  }

  function db() { return store.load(); }

  function getOrCreate(uid) {
    const d = db();
    if (!d.tourists[uid]) {
      d.tourists[uid] = core.newGuest(uid);
      emit('DATABASE', `New wish-band ${uid} added.`);
    }
    return d.tourists[uid];
  }

  function markStation(id, info = {}) {
    admin.stations[id] = { ...(admin.stations[id] || {}), ...info, lastSeen: new Date().toISOString() };
  }

  // ------------------------------------------------------------ middleware
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, X-Station-Key, X-Admin-Pin');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });
  app.use(express.json({ limit: '64kb' }));
  app.use(express.urlencoded({ extended: true }));

  // Pull the latest rows before every API call (no-op for the JSON file store).
  app.use('/api', async (req, res, next) => {
    if (req.path === '/health' || req.path === '/config') return next();
    try {
      await store.refresh();
      next();
    } catch (e) {
      console.error('⚠️ Database read failed:', e.message);
      res.status(503).json({ error: 'Database unavailable, please try again.' });
    }
  });

  const requireStation = (req, res, next) =>
    !STATION_KEY || req.get('X-Station-Key') === STATION_KEY ? next() : res.status(401).json({ error: 'Bad station key' });
  const requireAdmin = (req, res, next) =>
    !ADMIN_PIN || req.get('X-Admin-Pin') === ADMIN_PIN ? next() : res.status(401).json({ error: 'Admin PIN required' });
  const requireDemo = (req, res, next) =>
    DEMO_MODE ? next() : res.status(403).json({ error: 'Demo tools are off (DEMO_MODE=false)' });

  const route = fn => async (req, res) => {
    try {
      await fn(req, res);
    } catch (e) {
      if (!e.status) console.error(e);
      res.status(e.status || 500).json({ error: e.message });
    }
  };

  // ------------------------------------------------------------ public config
  app.get('/api/health', (req, res) => res.json({ ok: true, demoMode: DEMO_MODE, storage: store.kind, time: new Date().toISOString() }));

  app.get('/api/config', (req, res) => {
    res.json({
      publicUrl: PUBLIC_URL,
      demoMode: DEMO_MODE,
      adminPinRequired: !!ADMIN_PIN,
      stations: STATIONS.map(({ legacy, ...s }) => s),
      kinds: STATION_KINDS,
      reward: REWARD,
      helpPoints: HELP_POINTS,
      hotlines: HOTLINES,
      dietaryOptions: core.DIETARY_LABELS
    });
  });

  // ------------------------------------------------------------ tourists
  app.get('/api/tourists', (req, res) => res.json(Object.values(db().tourists)));

  app.get('/api/tourist/:uid', route(async (req, res) => {
    const uid = cleanUid(req.params.uid);
    if (!uid) throw httpError(400, 'UID required');
    const existed = !!db().tourists[uid];
    const t = getOrCreate(uid);
    if (!existed) await store.save();
    const active = Object.values(db().sosAlerts)
      .filter(a => a.uid === uid && ['PENDING', 'ACKNOWLEDGED', 'DISPATCHED'].includes(a.status))
      .sort((a, b) => b.triggeredAt.localeCompare(a.triggeredAt))[0] || null;
    res.json({ ...t, activeSos: active });
  }));

  app.post('/api/register', route(async (req, res) => {
    const uid = cleanUid(req.body.uid);
    if (!uid) throw httpError(400, 'UID is required');
    const t = getOrCreate(uid);
    for (const key of ['name', 'country', 'language', 'dietary', 'emergencyContact']) {
      if (typeof req.body[key] === 'string') t[key] = req.body[key].trim().slice(0, 120);
    }
    if (typeof req.body.depositPaid === 'boolean') t.depositPaid = req.body.depositPaid;
    t.lastUpdated = new Date().toISOString();
    await store.save();
    emit('PROFILE', `Profile saved for ${uid}.`, t);
    res.json({ success: true, tourist: t });
  }));

  // ------------------------------------------------------------ station check-in
  async function doCheckin(rawUid, stationId, meta = {}) {
    const uid = cleanUid(rawUid);
    if (!uid || !stationId) throw httpError(400, 'uid and station are required');
    const t = getOrCreate(uid);
    const { station, entry, duplicate, voucherUnlocked } = core.recordCheckin(t, stationId);
    if (!meta.simulated) markStation(station.id, { ip: meta.ip, rssi: meta.rssi });

    if (!duplicate && DEMO_MODE && DEMO_MIRROR[uid]) {
      try { core.recordCheckin(getOrCreate(DEMO_MIRROR[uid]), station.id); } catch (_) {}
    }
    if (!duplicate) {
      await store.save();
      const icon = STATION_KINDS[station.kind].emoji;
      emit('CHECKIN', `${icon} ${uid} stamped at ${station.name}${meta.simulated ? ' (simulated)' : ''}${voucherUnlocked ? ' and unlocked the voucher 🎉' : ''}.`,
        { uid, station: station.id, entry, tourist: t });
    }
    return {
      success: true,
      duplicate,
      station: station.id,
      kind: station.kind,
      isNewStamp: entry.isNewStamp,
      visitSequence: entry.visitSequence,
      stampsCollected: core.stampsCollected(t),
      stampsTotal: STATIONS.length,
      voucherUnlocked,
      tourist: t
    };
  }

  // Called by the food / place / activity ESP32 stations
  app.post('/api/checkin', requireStation, route(async (req, res) => {
    const { tourist, ...result } = await doCheckin(req.body.uid, req.body.station, { ip: req.body.ip, rssi: req.body.rssi });
    res.json(result);
  }));

  // Same as a tap, from the web simulator buttons (no station key needed)
  app.post('/api/demo/tap', requireDemo, route(async (req, res) => {
    res.json(await doCheckin(req.body.uid, req.body.station, { simulated: true }));
  }));

  app.post('/api/stations/heartbeat', requireStation, route(async (req, res) => {
    const id = String(req.body.station || '').toLowerCase();
    const st = core.resolveStation(id);
    if (!st && id !== 'admin') throw httpError(400, 'Unknown station');
    markStation(st ? st.id : 'admin', { ip: req.body.ip, rssi: req.body.rssi, ssid: req.body.ssid, fw: req.body.fw });
    res.json({ success: true });
  }));

  // ------------------------------------------------------------ last location (phone GPS)
  app.post('/api/location', route(async (req, res) => {
    const uid = cleanUid(req.body.uid);
    const lat = Number(req.body.lat), lng = Number(req.body.lng);
    if (!uid || !Number.isFinite(lat) || !Number.isFinite(lng)) throw httpError(400, 'uid, lat and lng are required');
    const t = getOrCreate(uid);
    core.pushLocation(t, { source: 'phone', lat, lng, accuracy: Number(req.body.accuracy) || null, timestamp: new Date().toISOString() });
    await store.save();
    res.json({ success: true });
  }));

  // ------------------------------------------------------------ AI recommendations
  app.get('/api/recommendations', route(async (req, res) => {
    const uid = cleanUid(req.query.uid);
    const t = uid ? getOrCreate(uid) : core.newGuest('GUEST');
    const lat = parseFloat(req.query.lat), lng = parseFloat(req.query.lng);
    const origin = Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : undefined;
    const { uv, source } = await getUvIndex();
    const recommendations = core.recommend(t, CATALOG, { category: req.query.category, uv, origin }).slice(0, 12);
    if (uid) {
      for (const r of recommendations.slice(0, 3)) core.logRecEvent(t, { itemId: r.id, stationId: r.stationId || null, action: 'shown' });
      await store.save();
    }
    res.json({ success: true, uvIndex: uv, uvSource: source, advice: core.uvAdvice(uv), recommendations });
  }));

  app.post('/api/recommendations/event', route(async (req, res) => {
    const uid = cleanUid(req.body.uid);
    if (!uid) throw httpError(400, 'uid required');
    const item = CATALOG.find(i => i.id === req.body.itemId);
    if (!item) throw httpError(404, 'Unknown item');
    core.logRecEvent(getOrCreate(uid), { itemId: item.id, stationId: item.stationId || null, action: req.body.action });
    await store.save();
    res.json({ success: true });
  }));

  // ------------------------------------------------------------ voucher
  app.post('/api/redeem', route(async (req, res) => {
    const uid = cleanUid(req.body.uid);
    const t = db().tourists[uid];
    if (!t) throw httpError(404, 'Tourist not found');
    if (String(req.body.pin || '') !== MERCHANT_PIN) throw httpError(403, 'Wrong merchant PIN');
    try {
      const voucher = core.redeemVoucher(t);
      await store.save();
      emit('VOUCHER', `🎁 ${uid} redeemed the ${REWARD.valueKrw.toLocaleString()} KRW voucher.`, { uid, tourist: t });
      res.json({ success: true, voucher, tourist: t });
    } catch (e) {
      await store.save(); // keeps EXPIRED if it just flipped
      throw e;
    }
  }));

  // ------------------------------------------------------------ SOS
  app.post('/api/sos', route(async (req, res) => {
    const uid = cleanUid(req.body.uid);
    if (!uid) throw httpError(400, 'uid required');
    const t = getOrCreate(uid);
    const num = v => (v == null || v === '' ? undefined : Number(v));
    const alert = core.newSosAlert({
      uid, tourist: t,
      latitude: num(req.body.latitude), longitude: num(req.body.longitude),
      accuracy: num(req.body.accuracy), note: req.body.note
    });
    if (alert.location?.source === 'phone') {
      core.pushLocation(t, { source: 'phone', lat: alert.location.latitude, lng: alert.location.longitude, accuracy: alert.location.accuracy, timestamp: alert.triggeredAt });
    }
    db().sosAlerts[alert.alertId] = alert;
    await store.save();
    emit('SOS', `🚨 SOS from ${t.name} (${uid})`, alert);
    res.json({ success: true, alertId: alert.alertId, alert });
  }));

  const SOS_ACTIONS = { acknowledge: 'ACKNOWLEDGED', dispatch: 'DISPATCHED', resolve: 'RESOLVED', cancel: 'CANCELLED' };
  app.post('/api/sos/:action', route(async (req, res) => {
    const to = SOS_ACTIONS[req.params.action];
    if (!to) throw httpError(404, 'Unknown SOS action');
    if (to !== 'CANCELLED' && ADMIN_PIN && req.get('X-Admin-Pin') !== ADMIN_PIN) throw httpError(401, 'Admin PIN required');
    const alert = db().sosAlerts[req.body.alertId];
    if (!alert) throw httpError(404, 'Alert not found');
    core.advanceSos(alert, to, req.body);
    await store.save();
    emit('SOS', `SOS ${alert.alertId} is now ${alert.status}.`, alert);
    res.json({ success: true, alert });
  }));

  // ------------------------------------------------------------ admin
  app.get('/api/admin/status', requireAdmin, (req, res) => {
    const d = db();
    const tourists = Object.values(d.tourists);
    res.json({
      storage: store.kind,
      lastScan: admin.lastScan,
      pendingWrite: admin.pendingWrite,
      events: admin.events,
      stations: STATIONS.map(s => ({ id: s.id, kind: s.kind, name: s.name, ...(admin.stations[s.id] || {}) }))
        .concat([{ id: 'admin', kind: 'admin', name: 'Admin Desk', ...(admin.stations.admin || {}) }]),
      sosAlerts: Object.values(d.sosAlerts).sort((a, b) => b.triggeredAt.localeCompare(a.triggeredAt)),
      metrics: core.computeMetrics(tourists, d.sosAlerts),
      tourists
    });
  });

  // Admin PN532 reports a tag. Response tells the ESP32 what to write next.
  app.post('/api/admin/scan', requireStation, route(async (req, res) => {
    const uid = cleanUid(req.body.uid);
    if (!uid) throw httpError(400, 'UID required');
    const existed = !!db().tourists[uid];
    const t = getOrCreate(uid);
    if (!existed) await store.save();
    const content = req.body.content || `${PUBLIC_URL}/${uid}`;
    admin.lastScan = { uid, content, timestamp: Date.now() };
    if (req.body.wrote && admin.pendingWrite && req.body.wrote === admin.pendingWrite) admin.pendingWrite = null;
    markStation('admin', { ip: req.body.ip, rssi: req.body.rssi });
    emit('ADMIN_SCAN', `📟 Admin desk read ${uid}: "${content}"`, { uid, content });
    res.json({ success: true, uid, content, tourist: t, pendingWrite: admin.pendingWrite, defaultUrl: `${PUBLIC_URL}/${uid}` });
  }));

  app.get('/api/admin/write-queue', (req, res) => res.json({ pendingWrite: admin.pendingWrite, publicUrl: PUBLIC_URL }));

  app.post('/api/admin/write-queue', requireAdmin, (req, res) => {
    admin.pendingWrite = (req.body.content || '').trim().slice(0, 120) || null;
    if (admin.pendingWrite) emit('QUEUE_WRITE', `✍️ Next tag will be written with "${admin.pendingWrite}"`);
    res.json({ success: true, pendingWrite: admin.pendingWrite });
  });

  app.post('/api/tourist/reset', requireAdmin, route(async (req, res) => {
    const uid = cleanUid(req.body.uid);
    const t = db().tourists[uid];
    if (!t) throw httpError(404, 'Tag not found');
    core.resetProgress(t);
    await store.save();
    emit('RESET', `Stamps reset for ${uid}.`, { uid });
    res.json({ success: true, tourist: t });
  }));

  app.post('/api/tourist/delete', requireAdmin, route(async (req, res) => {
    const uid = cleanUid(req.body.uid);
    if (!db().tourists[uid]) throw httpError(404, 'Tag not found');
    delete db().tourists[uid];
    await store.save();
    emit('DELETE', `Deleted ${uid}.`, { uid });
    res.json({ success: true });
  }));

  app.post('/api/admin/reset-stamps', requireAdmin, route(async (req, res) => {
    for (const t of Object.values(db().tourists)) core.resetProgress(t);
    await store.save();
    emit('RESET_ALL', 'All stamps and vouchers reset.', { uid: 'ALL' });
    res.json({ success: true });
  }));

  app.post('/api/admin/delete-all', requireAdmin, requireDemo, route(async (req, res) => {
    await store.replace(emptyDb());
    emit('FACTORY_RESET', 'Deleted every wish-band and SOS alert.', { uid: 'ALL' });
    res.json({ success: true });
  }));

  app.post('/api/admin/restore-defaults', requireAdmin, requireDemo, route(async (req, res) => {
    const d = emptyDb();
    d.tourists = demoTourists();
    await store.replace(d);
    emit('RESTORE_DEFAULTS', 'Demo wish-bands restored.', { uid: 'ALL' });
    res.json({ success: true, count: Object.keys(d.tourists).length });
  }));

  // Old endpoint kept for the phone's demo reset button
  app.post('/api/reset', requireDemo, route(async (req, res) => {
    const uid = cleanUid(req.body?.uid);
    if (!uid) throw httpError(400, 'uid required');
    const t = db().tourists[uid];
    if (t) { core.resetProgress(t); await store.save(); }
    emit('RESET', `Demo reset for ${uid}.`, { uid });
    res.json({ success: true });
  }));

  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

  return app;
}

module.exports = { createApp, cleanUid };
