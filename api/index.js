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
  },
  '04DBCE42CA2A81': {
    uid: '04DBCE42CA2A81',
    name: 'AuraBead Master (04DBCE42CA2A81)',
    country: 'South Korea / Global',
    language: 'English',
    dietary: 'None',
    emergencyContact: '+82 10-1234-5678',
    depositPaid: true,
    stamps: { checkpoint1: false, checkpoint2: false },
    voucher: { unlocked: false, code: 'JEJU-4000-04DBCE42', redeemed: false },
    lastCheckin: null
  },
  'FA1D2207': {
    uid: 'FA1D2207',
    name: 'Jeju Explorer (Blue Fob #1)',
    country: 'South Korea',
    language: 'Korean',
    dietary: 'None',
    emergencyContact: '+82 10-1234-5678',
    depositPaid: true,
    stamps: { checkpoint1: false, checkpoint2: false },
    voucher: { unlocked: false, code: 'JEJU-4000-FA1D2207', redeemed: false },
    lastCheckin: null
  },
  '2E720204': {
    uid: '2E720204',
    name: 'Jeju Explorer (White Card #2)',
    country: 'International',
    language: 'English',
    dietary: 'None',
    emergencyContact: '+1 555-0199',
    depositPaid: true,
    stamps: { checkpoint1: false, checkpoint2: false },
    voucher: { unlocked: false, code: 'JEJU-4000-2E720204', redeemed: false },
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
        db = {};
        saveDatabase();
      }
    } else {
      db = {};
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

// Serve index.html for direct UID paths (e.g. /04DBCE42CA2A81 or /BEAD_001)
app.get('/:uid', (req, res, next) => {
  const { uid } = req.params;
  if (uid === 'api' || uid === 'admin' || uid === 'style.css' || uid === 'app.js' || uid === 'favicon.ico') {
    return next();
  }
  const indexPath = path.join(__dirname, '..', 'public', 'index.html');
  if (fs.existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }
  return res.sendFile(path.join(process.cwd(), 'public', 'index.html'));
});

// Get all tourists
app.get('/api/tourists', (req, res) => {
  const currentDb = getDatabase();
  res.json(Object.values(currentDb));
});

// Get single tourist by UID (auto-provisions if not yet in database)
app.get('/api/tourist/:uid', (req, res) => {
  const currentDb = getDatabase();
  const uid = req.params.uid.toUpperCase().trim();
  if (!currentDb[uid]) {
    currentDb[uid] = {
      uid: uid,
      name: `AuraBead Guest (${uid.length > 8 ? uid.substring(0, 8) + '...' : uid})`,
      country: 'Global Traveler',
      language: 'English',
      dietary: 'None',
      emergencyContact: '+82 10-0000-0000',
      depositPaid: true,
      stamps: { checkpoint1: false, checkpoint2: false },
      voucher: { unlocked: false, code: `JEJU-4000-${uid.substring(0, 8)}`, redeemed: false },
      lastCheckin: null,
      registeredAt: new Date().toISOString()
    };
    saveDatabase();
    addEvent('DATABASE', `Auto-registered bracelet [${uid}] on mobile access.`);
  }
  res.json(currentDb[uid]);
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

let adminState = {
  lastScan: null,
  events: [
    { type: 'SYSTEM', text: 'System initialized and connected to cloud.', timestamp: new Date().toISOString() }
  ]
};

function addEvent(type, text) {
  adminState.events.unshift({ type, text, timestamp: new Date().toISOString() });
  if (adminState.events.length > 30) adminState.events.pop();
}

// Get admin status, live event log, and tourist inventory
app.get('/api/admin/status', (req, res) => {
  const currentDb = getDatabase();
  res.json({
    lastScan: adminState.lastScan,
    events: adminState.events,
    tourists: Object.values(currentDb)
  });
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

    // If check-in comes from RFID fob/card, mirror the stamp to the primary NFC bracelet (04DBCE42CA2A81)
    if (cleanUid === 'FA1D2207' || cleanUid === '2E720204') {
      const primaryBracelet = currentDb['04DBCE42CA2A81'];
      if (primaryBracelet) {
        primaryBracelet.stamps[station] = true;
        primaryBracelet.lastCheckin = { station, timestamp: new Date().toISOString() };
        if (primaryBracelet.stamps.checkpoint1 && primaryBracelet.stamps.checkpoint2) {
          primaryBracelet.voucher.unlocked = true;
        }
        console.log(`✨ [SYNC] Mirrored checkin at ${station} from fob ${cleanUid} to bracelet 04DBCE42CA2A81!`);
      }
    }

    saveDatabase();
    addEvent('CHECKIN', `Checkpoint [${station.toUpperCase()}]: Tag [${cleanUid}] stamped!`);
    console.log(`📍 [CHECKIN] Tag ${cleanUid} checked in at ${station}`);
    return res.json({ success: true, message: `Checked in at ${station}`, tourist });
  } else {
    return res.status(400).json({ error: 'Invalid station. Use checkpoint1 or checkpoint2' });
  }
});

let pendingWrite = null; // Store pending custom content to write to tag

// Admin tag scan notification (records UID + read content + auto-links in DB)
app.post('/api/admin/scan', (req, res) => {
  const { uid, content } = req.body;
  if (!uid) return res.status(400).json({ error: 'UID required' });
  const cleanUid = uid.toUpperCase().trim();
  const tagContent = content || ('https://smart-nfc-bracelet.vercel.app/' + cleanUid);
  
  const currentDb = getDatabase();
  let tourist = currentDb[cleanUid];
  if (!tourist) {
    tourist = {
      uid: cleanUid,
      name: `AuraBead Guest (${cleanUid.length > 8 ? cleanUid.substring(0, 8) + '...' : cleanUid})`,
      country: 'Global Traveler',
      language: 'English',
      dietary: 'None',
      emergencyContact: '+82 10-0000-0000',
      depositPaid: true,
      stamps: { checkpoint1: false, checkpoint2: false },
      voucher: { unlocked: false, code: `JEJU-4000-${cleanUid.substring(0, 8)}`, redeemed: false },
      lastCheckin: null,
      registeredAt: new Date().toISOString()
    };
    currentDb[cleanUid] = tourist;
    saveDatabase();
    addEvent('DATABASE', `Linked new bracelet [${cleanUid}] to tourist database.`);
    console.log(`✨ [DATABASE] Auto-linked new UID ${cleanUid} to tourist inventory`);
  }

  adminState.lastScan = { 
    uid: cleanUid, 
    content: tagContent, 
    timestamp: Date.now() 
  };
  addEvent('ADMIN_SCAN', `PN532 Scanned [${cleanUid}] ➔ Content: "${tagContent}"`);
  console.log(`🔍 [ADMIN SCAN] Tag ${cleanUid} | Content: ${tagContent}`);

  res.json({ 
    success: true, 
    uid: cleanUid, 
    content: tagContent,
    tourist: tourist,
    pendingWrite: pendingWrite // Send pending write to ESP32 if available
  });
});

// Queue a new custom text or URL to write to tag
app.post('/api/admin/write-queue', (req, res) => {
  const { content } = req.body;
  pendingWrite = content || null;
  if (pendingWrite) {
    addEvent('QUEUE_WRITE', `Admin queued write: "${pendingWrite}"`);
  }
  res.json({ success: true, pendingWrite });
});

// Check if any pending write exists
app.get('/api/admin/write-queue', (req, res) => {
  res.json({ pendingWrite });
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

// Reset stamps for a single tag (keeps profile info intact)
app.post('/api/tourist/reset', (req, res) => {
  const { uid } = req.body;
  if (!uid) return res.status(400).json({ error: 'UID required' });
  const currentDb = getDatabase();
  const cleanUid = uid.toUpperCase().trim();
  const tourist = currentDb[cleanUid];

  if (!tourist) return res.status(404).json({ error: 'Tourist tag not found' });

  tourist.stamps = { checkpoint1: false, checkpoint2: false };
  tourist.voucher.unlocked = false;
  tourist.voucher.redeemed = false;
  delete tourist.voucher.redeemedAt;
  tourist.lastCheckin = null;

  saveDatabase();
  addEvent('RESET', `Reset stamps and voucher for Tag [${cleanUid}]`);
  res.json({ success: true, message: `Stamps reset for ${cleanUid}`, tourist });
});

// Delete a single tag from database
app.post('/api/tourist/delete', (req, res) => {
  const { uid } = req.body;
  if (!uid) return res.status(400).json({ error: 'UID required' });
  const currentDb = getDatabase();
  const cleanUid = uid.toUpperCase().trim();

  if (currentDb[cleanUid]) {
    delete currentDb[cleanUid];
    saveDatabase();
    addEvent('DELETE', `Deleted Tag [${cleanUid}] from database`);
    return res.json({ success: true, message: `Deleted tag ${cleanUid}` });
  } else {
    return res.status(404).json({ error: 'Tag not found' });
  }
});

// Reset all stamps across all tourists (ready for fresh demo)
app.post('/api/admin/reset-stamps', (req, res) => {
  const currentDb = getDatabase();
  for (const t of Object.values(currentDb)) {
    t.stamps = { checkpoint1: false, checkpoint2: false };
    if (t.voucher) {
      t.voucher.unlocked = false;
      t.voucher.redeemed = false;
      delete t.voucher.redeemedAt;
    }
    t.lastCheckin = null;
  }
  saveDatabase();
  addEvent('RESET_ALL', 'Reset all tourist stamps and vouchers for fresh demo.');
  res.json({ success: true, message: 'All stamps reset successfully' });
});

// Delete ALL tourists / Factory Reset: completely wipes all UIDs from database
app.post('/api/admin/delete-all', (req, res) => {
  db = {};
  saveDatabase();
  addEvent('FACTORY_RESET', 'Factory reset: Deleted ALL UIDs from database.');
  res.json({ success: true, message: 'All UIDs deleted successfully. Database is now empty.' });
});

// Restore sample demo tags if needed
app.post('/api/admin/restore-defaults', (req, res) => {
  db = JSON.parse(JSON.stringify(DEFAULT_TAGS));
  saveDatabase();
  addEvent('RESTORE_DEFAULTS', 'Restored sample demo tags to database.');
  res.json({ success: true, message: 'Default demo tags restored', count: Object.keys(db).length });
});

// Reset demo or factory reset
app.post('/api/reset', (req, res) => {
  const { uid, restoreDefaults } = req.body || {};
  const currentDb = getDatabase();

  if (uid) {
    const cleanUid = uid.toUpperCase().trim();
    if (DEFAULT_TAGS[cleanUid]) {
      currentDb[cleanUid] = JSON.parse(JSON.stringify(DEFAULT_TAGS[cleanUid]));
    } else if (currentDb[cleanUid]) {
      currentDb[cleanUid].stamps = { checkpoint1: false, checkpoint2: false };
      currentDb[cleanUid].voucher.unlocked = false;
      currentDb[cleanUid].voucher.redeemed = false;
      currentDb[cleanUid].lastCheckin = null;
    }
    addEvent('RESET', `Reset tag [${cleanUid}] to default`);
  } else if (restoreDefaults) {
    db = JSON.parse(JSON.stringify(DEFAULT_TAGS));
    addEvent('RESTORE_DEFAULTS', 'Restored default tags to database.');
  } else {
    // FACTORY RESET = DELETE ALL UIDS!
    db = {};
    addEvent('FACTORY_RESET', 'Factory reset: Deleted ALL UIDs from database.');
  }
  saveDatabase();
  res.json({ success: true, message: 'Reset completed', remaining: Object.keys(db).length });
});

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`🌋 Jeju AuraBeads Server listening on http://localhost:${PORT}`);
  });
}

module.exports = app;
