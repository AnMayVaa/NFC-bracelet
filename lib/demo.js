// lib/demo.js — mock data for demos: a full story-ready dataset and one-step simulations.
const core = require('./core');
const CATALOG = require('./data/catalog');
const { STATIONS } = require('./data/stations');

const MIN = 60 * 1000;
const byKind = kind => STATIONS.find(s => s.kind === kind);
const recFor = stationId => CATALOG.find(i => i.stationId === stationId) || CATALOG[0];

// Each profile is a different point in the tourist journey, so every screen has something to show.
const STORY = [
  { uid: 'BEAD_001', name: 'Alex Min-woo', country: 'South Korea', language: 'Korean', dietary: 'No Shellfish', emergencyContact: '+82 10-1234-5678', stamps: [], note: 'Just arrived, no stamps' },
  { uid: 'BEAD_002', name: 'Sarah Chen', country: 'Singapore', language: 'English', dietary: 'Halal', emergencyContact: '+65 9123-4567', stamps: ['food'], note: '1 stamp' },
  { uid: 'BEAD_003', name: 'Kenji Sato', country: 'Japan', language: 'Japanese', dietary: 'Vegetarian', emergencyContact: '+81 90-1234-5678', stamps: ['place', 'food'], note: '2 stamps, one to go' },
  { uid: 'BEAD_004', name: 'Emma Watson', country: 'UK', language: 'English', dietary: 'Gluten-Free', emergencyContact: '+44 7700-900123', stamps: ['place', 'food', 'activity'], note: 'Voucher ready to redeem' },
  { uid: 'BEAD_005', name: 'Conference Judge', country: 'International', language: 'English', dietary: 'None', emergencyContact: '+1 555-0199', stamps: ['place', 'food', 'activity'], redeemed: true, note: 'Voucher already used' },
  { uid: 'BEAD_006', name: 'Nong Ploy', country: 'Thailand', language: 'Thai', dietary: 'None', emergencyContact: '+66 81 234 5678', stamps: ['place'], sos: 'PENDING', note: 'Active SOS waiting for staff' },
  { uid: 'BEAD_007', name: 'Li Wei', country: 'China', language: 'Chinese', dietary: 'Vegan', emergencyContact: '+86 138 0013 8000', stamps: ['activity'], sos: 'DISPATCHED', note: 'SOS with rescue on the way' },
  { uid: 'BEAD_008', name: 'Maria Garcia', country: 'Spain', language: 'English', dietary: 'None', emergencyContact: '+34 612 345 678', stamps: ['food', 'place'], sos: 'RESOLVED', note: 'Past SOS, resolved' },
  { uid: '04DBCE42CA2A81', name: 'Wish-band Master', country: 'South Korea', language: 'English', dietary: 'None', emergencyContact: '+82 10-1234-5678', stamps: [], note: 'Real NFC bracelet, fresh' },
  { uid: 'FA1D2207', name: 'Jeju Explorer (Blue Fob)', country: 'South Korea', language: 'Korean', dietary: 'None', emergencyContact: '+82 10-1234-5678', stamps: [], note: 'Real fob, fresh' },
  { uid: '2E720204', name: 'Jeju Explorer (White Card)', country: 'International', language: 'English', dietary: 'None', emergencyContact: '+1 555-0199', stamps: [], note: 'Real card, fresh' }
];

function sosAt(t, status, now) {
  const a = core.newSosAlert({ uid: t.uid, tourist: t, note: status === 'RESOLVED' ? 'Twisted ankle on the trail' : 'Feeling dizzy, need help' });
  a.triggeredAt = new Date(now).toISOString();
  if (status !== 'PENDING') core.advanceSos(a, 'ACKNOWLEDGED', { staffId: 'desk-1' });
  if (status === 'DISPATCHED' || status === 'RESOLVED') core.advanceSos(a, 'DISPATCHED', { responder: 'Seogwipo 119 team', etaMinutes: 12 });
  if (status === 'RESOLVED') core.advanceSos(a, 'RESOLVED', { resolutionNotes: 'Treated on site, tourist OK' });
  return a;
}

// Builds a whole database (tourists + SOS alerts) with realistic, back-dated history.
function buildStory(now = Date.now()) {
  const tourists = {}, sosAlerts = {};
  STORY.forEach((p, i) => {
    const { stamps, redeemed, sos, note, ...profile } = p;
    const t = core.newGuest(p.uid, { ...profile, registeredAt: new Date(now - (300 - i * 10) * MIN).toISOString() });
    // The AI showed picks before each visit, so conversion numbers are non-zero.
    let clock = now - (240 - i * 10) * MIN;
    for (const kind of stamps) {
      const st = byKind(kind);
      const item = recFor(st.id);
      core.logRecEvent(t, { itemId: item.id, stationId: st.id, action: 'shown' }, clock);
      core.logRecEvent(t, { itemId: item.id, stationId: st.id, action: 'opened' }, clock + 2 * MIN);
      core.recordCheckin(t, st.id, clock + 40 * MIN);
      clock += 50 * MIN;
    }
    if (!stamps.length) core.logRecEvent(t, { itemId: CATALOG[i % CATALOG.length].id, stationId: null, action: 'shown' }, clock);
    if (redeemed) core.redeemVoucher(t, clock + 10 * MIN);
    if (sos) {
      const a = sosAt(t, sos, now - (sos === 'RESOLVED' ? 90 : sos === 'DISPATCHED' ? 8 : 2) * MIN);
      sosAlerts[a.alertId] = a;
    }
    tourists[t.uid] = t;
  });
  return { tourists, sosAlerts };
}

// Random spot on Jeju island (rough box over land).
function randomJejuSpot() {
  return { lat: 33.25 + Math.random() * 0.25, lng: 126.3 + Math.random() * 0.55 };
}

module.exports = { STORY, buildStory, randomJejuSpot };
