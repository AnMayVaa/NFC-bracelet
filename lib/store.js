// lib/store.js — tiny JSON-file store with schema versioning.
// Local: ./database.json   Vercel: /tmp/database.json (per instance, not durable).
// Swap this module for a managed database before a real-visitor pilot.
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

function createStore(file) {
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

  function save() {
    try {
      fs.writeFileSync(file, JSON.stringify(db, null, 2), 'utf8');
    } catch (e) {
      console.error('⚠️ Could not save database:', e.message);
    }
  }

  function replace(next) {
    db = next;
    save();
    return db;
  }

  return { load, save, replace };
}

module.exports = { createStore, demoTourists, emptyDb, migrate, SCHEMA_VERSION };
