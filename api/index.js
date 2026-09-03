const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();

const DB_FILE = process.env.VERCEL 
  ? path.join('/tmp', 'database.json') 
  : path.join(__dirname, '..', 'database.json');

const DEFAULT_TAGS = {
  'BEAD_001': {
    uid: 'BEAD_001',
    name: 'Alex Min-woo',
    country: 'South Korea',
    language: 'Korean',
    dietary: 'No Shellfish',
    emergencyContact: '+82 10-1234-5678',
    depositPaid: true,
    stamps: { checkpoint1: false, checkpoint2: false },
    voucher: { unlocked: false, code: 'JEJU-4000-BEAD001', redeemed: false },
    lastCheckin: null
  },
  'BEAD_002': {
    uid: 'BEAD_002',
    name: 'Sarah Chen',
    country: 'Singapore',
    language: 'English',
    dietary: 'Halal',
    emergencyContact: '+65 9123-4567',
    depositPaid: true,
    stamps: { checkpoint1: false, checkpoint2: false },
    voucher: { unlocked: false, code: 'JEJU-4000-BEAD002', redeemed: false },
    lastCheckin: null
  },
  'BEAD_003': {
    uid: 'BEAD_003',
    name: 'Kenji Sato',
    country: 'Japan',
    language: 'Japanese',
    dietary: 'Vegetarian',
    emergencyContact: '+81 90-1234-5678',
    depositPaid: true,
    stamps: { checkpoint1: false, checkpoint2: false },
    voucher: { unlocked: false, code: 'JEJU-4000-BEAD003', redeemed: false },
    lastCheckin: null
  },
  'BEAD_004': {
    uid: 'BEAD_004',
    name: 'Emma Watson',
    country: 'UK',
    language: 'English',
    dietary: 'Gluten-Free',
    emergencyContact: '+44 7700-900123',
    depositPaid: true,
    stamps: { checkpoint1: false, checkpoint2: false },
    voucher: { unlocked: false, code: 'JEJU-4000-BEAD004', redeemed: false },
    lastCheckin: null
  },
  'BEAD_005': {
    uid: 'BEAD_005',
    name: 'Conference Judge',
    country: 'International',
    language: 'English',
    dietary: 'None',
    emergencyContact: '+1 555-0199',
    depositPaid: true,
    stamps: { checkpoint1: false, checkpoint2: false },
    voucher: { unlocked: false, code: 'JEJU-4000-JUDGE', redeemed: false },
    lastCheckin: null
  }
};

let db = null;

function getDatabase() {
  if (!db) {
    if (fs.existsSync(DB_FILE)) {
      try {
        db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      } catch (e) {
        db = JSON.parse(JSON.stringify(DEFAULT_TAGS));
        saveDatabase();
      }
    } else {
      db = JSON.parse(JSON.stringify(DEFAULT_TAGS));
      saveDatabase();
    }
  }
  return db;
}

function saveDatabase() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
  } catch (e) {
    console.error('Error saving database to file:', e.message);
  }
}

// Global CORS Middleware so ESP32s and phones from any domain can interact
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Get all tourists
app.get('/api/tourists', (req, res) => {
  const currentDb = getDatabase();
  res.json(Object.values(currentDb));
});

// Get single tourist by UID
app.get('/api/tourist/:uid', (req, res) => {
  const currentDb = getDatabase();
  const uid = req.params.uid.toUpperCase();
  if (currentDb[uid]) {
    res.json(currentDb[uid]);
  } else {
    res.status(404).json({ error: 'Tourist tag not registered', uid });
  }
});

// Register or update tourist profile
app.post('/api/register', (req, res) => {
  const { uid, name, country, language, dietary, emergencyContact, depositPaid } = req.body;
  if (!uid) return res.status(400).json({ error: 'UID is required' });

  const currentDb = getDatabase();
  const cleanUid = uid.toUpperCase().trim();
  const existing = currentDb[cleanUid] || {
    uid: cleanUid,
    stamps: { checkpoint1: false, checkpoint2: false },
    voucher: { unlocked: false, code: `JEJU-4000-${cleanUid.substring(0, 8)}`, redeemed: false },
    lastCheckin: null
  };

  currentDb[cleanUid] = {
    ...existing,
    name: name !== undefined ? name : (existing.name || 'Unregistered Guest'),
    country: country !== undefined ? country : (existing.country || 'Global'),
    language: language !== undefined ? language : (existing.language || 'English'),
    dietary: dietary !== undefined ? dietary : (existing.dietary || 'None'),
    emergencyContact: emergencyContact !== undefined ? emergencyContact : (existing.emergencyContact || ''),
    depositPaid: depositPaid !== undefined ? depositPaid : (existing.depositPaid ?? true),
    lastUpdated: new Date().toISOString()
  };

  saveDatabase();
  res.json({ success: true, tourist: currentDb[cleanUid] });
});

// Check-in event from ESP32 stations
app.post('/api/checkin', (req, res) => {
  const { uid, station } = req.body;
  if (!uid || !station) {
    return res.status(400).json({ error: 'uid and station are required' });
  }

  const currentDb = getDatabase();
  const cleanUid = uid.toUpperCase().trim();
  let tourist = currentDb[cleanUid];

  if (!tourist) {
    tourist = {
      uid: cleanUid,
      name: `Guest (${cleanUid})`,
      country: 'Global',
      language: 'English',
      dietary: 'None',
      emergencyContact: '',
      depositPaid: true,
      stamps: { checkpoint1: false, checkpoint2: false },
      voucher: { unlocked: false, code: `JEJU-4000-${cleanUid.substring(0, 8)}`, redeemed: false },
      lastCheckin: null
    };
    currentDb[cleanUid] = tourist;
  }

  if (station === 'checkpoint1' || station === 'checkpoint2') {
    tourist.stamps[station] = true;
    tourist.lastCheckin = {
      station,
      timestamp: new Date().toISOString()
    };

    if (tourist.stamps.checkpoint1 && tourist.stamps.checkpoint2) {
      tourist.voucher.unlocked = true;
    }

    saveDatabase();
    console.log(`📍 [CHECKIN] Tag ${cleanUid} checked in at ${station}`);
    return res.json({ success: true, message: `Checked in at ${station}`, tourist });
  } else {
    return res.status(400).json({ error: 'Invalid station. Use checkpoint1 or checkpoint2' });
  }
});

// Admin tag scan notification
app.post('/api/admin/scan', (req, res) => {
  const { uid } = req.body;
  if (!uid) return res.status(400).json({ error: 'UID required' });
  const cleanUid = uid.toUpperCase().trim();
  res.json({ success: true, uid: cleanUid });
});

// Voucher redemption
app.post('/api/redeem', (req, res) => {
  const { uid } = req.body;
  if (!uid) return res.status(400).json({ error: 'UID required' });

  const currentDb = getDatabase();
  const cleanUid = uid.toUpperCase().trim();
  const tourist = currentDb[cleanUid];

  if (!tourist) return res.status(404).json({ error: 'Tourist not found' });
  if (!tourist.voucher.unlocked) return res.status(400).json({ error: 'Voucher is not unlocked yet' });
  if (tourist.voucher.redeemed) return res.status(400).json({ error: 'Voucher has already been redeemed' });

  tourist.voucher.redeemed = true;
  tourist.voucher.redeemedAt = new Date().toISOString();

  saveDatabase();
  res.json({ success: true, message: '4,000 KRW Voucher redeemed successfully!', tourist });
});

// Reset demo
app.post('/api/reset', (req, res) => {
  const { uid } = req.body;
  const currentDb = getDatabase();

  if (uid) {
    const cleanUid = uid.toUpperCase().trim();
    if (DEFAULT_TAGS[cleanUid]) {
      currentDb[cleanUid] = JSON.parse(JSON.stringify(DEFAULT_TAGS[cleanUid]));
    } else if (currentDb[cleanUid]) {
      currentDb[cleanUid].stamps = { checkpoint1: false, checkpoint2: false };
      currentDb[cleanUid].voucher.unlocked = false;
      currentDb[cleanUid].voucher.redeemed = false;
    }
  } else {
    db = JSON.parse(JSON.stringify(DEFAULT_TAGS));
  }
  saveDatabase();
  res.json({ success: true, message: 'Reset completed' });
});

module.exports = app;
