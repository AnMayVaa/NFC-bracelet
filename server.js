const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'database.json');

// Default initial state for 5 demo tags
const DEFAULT_TAGS = {
  'BEAD_001': {
    uid: 'BEAD_001',
    name: 'Alex Min-woo',
    country: 'South Korea',
    language: 'Korean',
    dietary: 'No Shellfish',
    emergencyContact: '+82 10-1234-5678',
    depositPaid: true,
    stamps: {
      checkpoint1: false,
      checkpoint2: false
    },
    voucher: {
      unlocked: false,
      code: 'JEJU-4000-BEAD001',
      redeemed: false
    },
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
    stamps: {
      checkpoint1: false,
      checkpoint2: false
    },
    voucher: {
      unlocked: false,
      code: 'JEJU-4000-BEAD002',
      redeemed: false
    },
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
    stamps: {
      checkpoint1: false,
      checkpoint2: false
    },
    voucher: {
      unlocked: false,
      code: 'JEJU-4000-BEAD003',
      redeemed: false
    },
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
    stamps: {
      checkpoint1: false,
      checkpoint2: false
    },
    voucher: {
      unlocked: false,
      code: 'JEJU-4000-BEAD004',
      redeemed: false
    },
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
    stamps: {
      checkpoint1: false,
      checkpoint2: false
    },
    voucher: {
      unlocked: false,
      code: 'JEJU-4000-JUDGE',
      redeemed: false
    },
    lastCheckin: null
  }
};

// In-memory database with persistent backup
let db = {};

function loadDatabase() {
  if (fs.existsSync(DB_FILE)) {
    try {
      db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      console.log('✅ Loaded database from file.');
    } catch (e) {
      console.error('⚠️ Error reading database.json, resetting to defaults:', e.message);
      db = { ...DEFAULT_TAGS };
      saveDatabase();
    }
  } else {
    db = { ...DEFAULT_TAGS };
    saveDatabase();
    console.log('✅ Initialized database with default 5 tags.');
  }
}

function saveDatabase() {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
}

loadDatabase();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Broadcast updates to all connected WebSocket clients (phones and admin screens)
function broadcast(event, payload) {
  const msg = JSON.stringify({ event, payload, timestamp: new Date().toISOString() });
  wss.clients.forEach(client => {
    if (client.readyState === 1) { // OPEN
      client.send(msg);
    }
  });
}

// REST API Endpoints

// 1. Get all bracelets (for Admin portal)
app.get('/api/tourists', (req, res) => {
  res.json(Object.values(db));
});

// 2. Get single tourist by UID
app.get('/api/tourist/:uid', (req, res) => {
  const uid = req.params.uid.toUpperCase();
  if (db[uid]) {
    res.json(db[uid]);
  } else {
    res.status(404).json({ error: 'Tourist tag not registered', uid });
  }
});

// 3. Register or Update tourist profile (used by Admin or directly on Phone)
app.post('/api/register', (req, res) => {
  const { uid, name, country, language, dietary, emergencyContact, depositPaid } = req.body;
  if (!uid) return res.status(400).json({ error: 'UID is required' });

  const cleanUid = uid.toUpperCase().trim();
  const existing = db[cleanUid] || {
    uid: cleanUid,
    stamps: { checkpoint1: false, checkpoint2: false },
    voucher: { unlocked: false, code: `JEJU-4000-${cleanUid.substring(0, 8)}`, redeemed: false },
    lastCheckin: null
  };

  db[cleanUid] = {
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
  broadcast('PROFILE_UPDATED', db[cleanUid]);

  res.json({ success: true, tourist: db[cleanUid] });
});

// 4. Check-in event from ESP32 stations (Checkpoint 1 or Checkpoint 2)
app.post('/api/checkin', (req, res) => {
  const { uid, station } = req.body;
  if (!uid || !station) {
    return res.status(400).json({ error: 'uid and station are required' });
  }

  const cleanUid = uid.toUpperCase().trim();
  let tourist = db[cleanUid];

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
    db[cleanUid] = tourist;
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
    broadcast('CHECKIN_EVENT', {
      uid: cleanUid,
      station,
      tourist
    });

    console.log(`📍 [CHECKIN] Tag ${cleanUid} checked in at ${station}.`);
    return res.json({ success: true, message: `Checked in at ${station}`, tourist });
  } else {
    return res.status(400).json({ error: 'Invalid station. Use checkpoint1 or checkpoint2' });
  }
});

// 5. Admin scan trigger (when Admin PN532 scans a tag)
app.post('/api/admin/scan', (req, res) => {
  const { uid } = req.body;
  if (!uid) return res.status(400).json({ error: 'UID required' });
  const cleanUid = uid.toUpperCase().trim();
  
  broadcast('ADMIN_TAG_SCANNED', { uid: cleanUid });
  console.log(`🔍 [ADMIN SCAN] Tag ${cleanUid} detected at Admin Station.`);
  res.json({ success: true, uid: cleanUid });
});

// 6. Voucher redemption (at Dongmun Traditional Market)
app.post('/api/redeem', (req, res) => {
  const { uid } = req.body;
  if (!uid) return res.status(400).json({ error: 'UID required' });

  const cleanUid = uid.toUpperCase().trim();
  const tourist = db[cleanUid];

  if (!tourist) return res.status(404).json({ error: 'Tourist not found' });
  if (!tourist.voucher.unlocked) return res.status(400).json({ error: 'Voucher is not unlocked yet' });
  if (tourist.voucher.redeemed) return res.status(400).json({ error: 'Voucher has already been redeemed' });

  tourist.voucher.redeemed = true;
  tourist.voucher.redeemedAt = new Date().toISOString();

  saveDatabase();
  broadcast('VOUCHER_REDEEMED', { uid: cleanUid, tourist });

  res.json({ success: true, message: '4,000 KRW Voucher redeemed successfully!', tourist });
});

// 7. Reset demo tag(s)
app.post('/api/reset', (req, res) => {
  const { uid } = req.body;
  if (uid) {
    const cleanUid = uid.toUpperCase().trim();
    if (DEFAULT_TAGS[cleanUid]) {
      db[cleanUid] = JSON.parse(JSON.stringify(DEFAULT_TAGS[cleanUid]));
    } else if (db[cleanUid]) {
      db[cleanUid].stamps = { checkpoint1: false, checkpoint2: false };
      db[cleanUid].voucher.unlocked = false;
      db[cleanUid].voucher.redeemed = false;
    }
  } else {
    db = JSON.parse(JSON.stringify(DEFAULT_TAGS));
  }
  saveDatabase();
  broadcast('RESET_EVENT', { uid: uid || 'ALL' });
  res.json({ success: true, message: 'Reset completed' });
});

// WebSocket connection handling
wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ event: 'CONNECTED', message: 'Connected to Jeju AuraBeads Realtime Stream' }));
});

server.listen(PORT, () => {
  console.log(`\n🌋 Jeju AuraBeads Server running at: http://localhost:${PORT}`);
  console.log(`📱 Tourist Dashboard: http://localhost:${PORT}/?uid=BEAD_001`);
  console.log(`🏢 Admin Portal:      http://localhost:${PORT}/admin.html\n`);
});
