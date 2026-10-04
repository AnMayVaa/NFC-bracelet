// lib/store.js — data store with schema versioning: Supabase or a JSON file.
// Local: ./database.json   Vercel: /tmp/database.json (per instance, not durable).
// Set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY to keep data in Supabase (Postgres) instead.
const fs = require('fs');
const core = require('./core');

const SCHEMA_VERSION = 2;

const DEMO_PROFILES = [
  { uid: 'BEAD_001', name: 'Alex Min-woo', country: 'South Korea', language: 'Korean', dietary: 'No Shellfish', emergencyContact: '+82 10-1234-5678' },
  { uid: 'BEAD_002', name: 'Sarah Chen', country: 'Singapore', language: 'English', dietary: 'Halal', emergencyContact: '+65 9123-4567' },
  { uid: 'BEAD_003', name: 'Kenji Sato', country: 'Japan', language: 'Japanese', dietary: 'Vegetarian', emergencyContact: '+81 90-1234-5678' },
  { uid: 'BEAD_004', name: 'Emma Watson', country: 'UK', language: 'English', dietary: 'Gluten-Free', emergencyContact: '+44 7700-900123' },
  { uid: 'BEAD_005', name: 'Conference Judge', country: 'International', language: 'English', dietary: 'None', emergencyContact: '+1 555-0199' },
  { uid: '04DBCE42CA2A81', name: 'Wish-band Master', country: 'South Korea', language: 'English', dietary: 'None', emergencyContact: '+82 10-1234-5678' },
  { uid: 'FA1D2207', name: 'Jeju Explorer (Blue Fob)', country: 'South Korea', language: 'Korean', dietary: 'None', emergencyContact: '+82 10-1234-5678' },
  { uid: '2E720204', name: 'Jeju Explorer (White Card)', country: 'International', language: 'English', dietary: 'None', emergencyContact: '+1 555-0199' }
];

function demoTourists() {
  const out = {};
  for (const p of DEMO_PROFILES) out[p.uid] = core.newGuest(p.uid, p);
  return out;
}

function emptyDb() {
  return { schemaVersion: SCHEMA_VERSION, tourists: {}, sosAlerts: {} };
}

// v1 files kept tourists at the top level: { "BEAD_001": {...}, ... }
function migrate(raw) {
  if (!raw || typeof raw !== 'object') return emptyDb();
  let db = raw;
  if (raw.schemaVersion !== SCHEMA_VERSION) {
    db = emptyDb();
    const source = raw.tourists || raw;
    for (const [key, val] of Object.entries(source)) {
      if (val && typeof val === 'object' && val.uid) db.tourists[key] = val;
    }
    if (raw.sosAlerts) db.sosAlerts = raw.sosAlerts;
  }
  db.tourists = db.tourists || {};
  db.sosAlerts = db.sosAlerts || {};
  for (const t of Object.values(db.tourists)) core.normalizeTourist(t);
  return db;
}

// ---------------------------------------------------------------- JSON file store
function createJsonStore(file) {
  let db = null;

  function load() {
    if (db) return db;
    try {
      db = fs.existsSync(file) ? migrate(JSON.parse(fs.readFileSync(file, 'utf8'))) : emptyDb();
    } catch (e) {
      console.error('⚠️ Could not read database, starting empty:', e.message);
      db = emptyDb();
    }
    return db;
  }

  async function save() {
    try {
      fs.writeFileSync(file, JSON.stringify(load(), null, 2), 'utf8');
    } catch (e) {
      console.error('⚠️ Could not save database:', e.message);
    }
  }

  async function replace(next) {
    db = next;
    await save();
    return db;
  }

  return { kind: 'json', load, refresh: async () => load(), save, replace };
}

// ---------------------------------------------------------------- Supabase store
// Two tables (see supabase/schema.sql). Each row keeps the full record in `data`
// plus a few plain columns so the Supabase table editor is easy to read.
// Talks to the PostgREST API with fetch, so no extra npm package is needed.
function touristRow(t) {
  return {
    uid: t.uid,
    name: t.name || null,
    country: t.country || null,
    language: t.language || null,
    dietary: t.dietary || null,
    emergency_contact: t.emergencyContact || null,
    stamps: Object.values(t.stamps || {}).filter(Boolean).length,
    voucher_status: t.voucher?.status || 'LOCKED',
    voucher_code: t.voucher?.code || null,
    last_checkin_at: t.lastCheckin?.timestamp || null,
    last_lat: t.lastLocation?.lat ?? null,
    last_lng: t.lastLocation?.lng ?? null,
    registered_at: t.registeredAt || null,
    data: t,
    updated_at: new Date().toISOString()
  };
}

function sosRow(a) {
  return {
    alert_id: a.alertId,
    uid: a.uid,
    status: a.status,
    tourist_name: a.tourist?.name || null,
    emergency_contact: a.tourist?.emergencyContact || null,
    lat: a.location?.latitude ?? null,
    lng: a.location?.longitude ?? null,
    location_source: a.location?.source || null,
    note: a.note || null,
    triggered_at: a.triggeredAt,
    data: a,
    updated_at: new Date().toISOString()
  };
}

const TABLES = {
  tourists: { name: 'tourists', key: 'uid', toRow: touristRow },
  sosAlerts: { name: 'sos_alerts', key: 'alert_id', toRow: sosRow }
};

function createSupabaseStore({ url, key, minRefreshMs = 0 }) {
  const base = url.trim().replace(/\/+$/, '').replace(/\/rest\/v1$/, '') + '/rest/v1/';
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  let db = emptyDb();
  let synced = { tourists: {}, sosAlerts: {} };   // id -> JSON string last seen in Supabase
  let lastRefresh = 0;

  async function call(path, opts = {}) {
    const res = await fetch(base + path, { ...opts, headers: { ...headers, ...(opts.headers || {}) } });
    if (!res.ok) throw new Error(`Supabase ${opts.method || 'GET'} ${path.split('?')[0]}: ${res.status} ${await res.text()}`);
    return res.status === 204 ? null : res.json().catch(() => null);
  }

  async function refresh({ force = false } = {}) {
    if (minRefreshMs && Date.now() - lastRefresh < minRefreshMs && !force) return db;
    const [tRows, aRows] = await Promise.all([
      call('tourists?select=uid,data&limit=10000'),
      call('sos_alerts?select=alert_id,data&limit=10000')
    ]);
    const next = emptyDb();
    const snap = { tourists: {}, sosAlerts: {} };
    for (const r of tRows) if (r.data) { next.tourists[r.uid] = core.normalizeTourist(r.data); snap.tourists[r.uid] = JSON.stringify(next.tourists[r.uid]); }
    for (const r of aRows) if (r.data) { next.sosAlerts[r.alert_id] = r.data; snap.sosAlerts[r.alert_id] = JSON.stringify(r.data); }
    db = next;
    synced = snap;
    lastRefresh = Date.now();
    return db;
  }

  // Writes only the rows that changed since the last refresh/save.
  async function save() {
    for (const [field, tbl] of Object.entries(TABLES)) {
      const current = db[field];
      const upserts = [];
      for (const [id, rec] of Object.entries(current)) {
        const json = JSON.stringify(rec);
        if (synced[field][id] !== json) upserts.push([id, json, tbl.toRow(rec)]);
      }
      const removed = Object.keys(synced[field]).filter(id => !(id in current));
      if (upserts.length) {
        await call(`${tbl.name}?on_conflict=${tbl.key}`, {
          method: 'POST',
          headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify(upserts.map(u => u[2]))
        });
        for (const [id, json] of upserts) synced[field][id] = json;
      }
      if (removed.length) {
        const list = removed.map(id => `"${id.replace(/"/g, '')}"`).join(',');
        await call(`${tbl.name}?${tbl.key}=in.(${encodeURIComponent(list)})`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
        for (const id of removed) delete synced[field][id];
      }
    }
  }

  async function replace(next) {
    db = next;
    await save();
    return db;
  }

  return { kind: 'supabase', load: () => db, refresh, save, replace };
}

// Supabase when SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set, otherwise the JSON file.
function createStore(file, env = process.env) {
  const url = (env.SUPABASE_URL || '').trim();
  const key = (env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY || '').trim();
  if (url && key) {
    // A long-running local server re-reads at most every 2 s; serverless reads every request.
    return createSupabaseStore({ url, key, minRefreshMs: env.VERCEL ? 0 : 2000 });
  }
  return createJsonStore(file);
}

module.exports = { createStore, createJsonStore, createSupabaseStore, touristRow, sosRow, demoTourists, emptyDb, migrate, SCHEMA_VERSION };
