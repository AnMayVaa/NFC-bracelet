// lib/core.js — business rules shared by server.js (local) and api/index.js (Vercel).
// Pure functions only: no Express, no file access. Easy to unit test.
const crypto = require('crypto');
const { STATIONS, STATION_KINDS, REWARD } = require('./data/stations');

const RECHECKIN_COOLDOWN_MS = 60 * 1000;   // same tag + same station within 60 s = one visit
const LOCATION_LOG_LIMIT = 50;
const REC_EVENT_LIMIT = 200;

// ---------------------------------------------------------------- stations

const STATION_BY_ID = {};
for (const s of STATIONS) {
  STATION_BY_ID[s.id] = s;
  for (const alias of s.legacy || []) STATION_BY_ID[alias] = s;
}

function resolveStation(id) {
  return STATION_BY_ID[String(id || '').trim().toLowerCase()] || null;
}

function emptyStamps() {
  return Object.fromEntries(STATIONS.map(s => [s.id, false]));
}

// ---------------------------------------------------------------- dietary

const DIETARY_ALIASES = {
  TAG_NO_SHELLFISH: ['no shellfish', 'shellfish allergy', 'shellfish-free', 'shellfish free'],
  TAG_HALAL: ['halal'],
  TAG_VEGAN: ['vegan'],
  TAG_VEGETARIAN: ['vegetarian'],
  TAG_GLUTEN_FREE: ['gluten-free', 'gluten free', 'no gluten', 'celiac']
};

const DIETARY_LABELS = {
  TAG_HALAL: 'Halal', TAG_VEGAN: 'Vegan', TAG_VEGETARIAN: 'Vegetarian',
  TAG_NO_SHELLFISH: 'No Shellfish', TAG_GLUTEN_FREE: 'Gluten-Free'
};

// Returns { tags, unknown }. Unknown restrictions make the food filter FAIL CLOSED.
function parseDietary(text) {
  const tags = new Set();
  const unknown = [];
  String(text || '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(s => s && s !== 'none')
    .forEach(s => {
      const hit = Object.keys(DIETARY_ALIASES).find(t => DIETARY_ALIASES[t].includes(s));
      if (hit) tags.add(hit); else unknown.push(s);
    });
  return { tags: [...tags], unknown };
}

function isFoodSafe(item, restriction) {
  if (restriction.tags.length === 0 && restriction.unknown.length === 0) return true;
  if (restriction.unknown.length > 0) return false;
  const itemTags = new Set(item.dietaryTags || []);
  if (itemTags.has('TAG_VEGAN')) itemTags.add('TAG_VEGETARIAN');
  return restriction.tags.every(t => itemTags.has(t));
}

// ---------------------------------------------------------------- tourists

function newGuest(uid, overrides = {}) {
  const short = uid.length > 8 ? uid.substring(0, 8) + '…' : uid;
  return {
    uid,
    name: `Wish-band Guest (${short})`,
    country: 'Global Traveler',
    language: 'English',
    dietary: 'None',
    emergencyContact: '',
    depositPaid: true,
    stamps: emptyStamps(),
    checkinHistory: [],
    locationLog: [],
    recEvents: [],
    voucher: { status: 'LOCKED' },
    lastCheckin: null,
    registeredAt: new Date().toISOString(),
    ...overrides
  };
}

// Bring any stored record (old or new shape) up to the current shape.
function normalizeTourist(t) {
  const stamps = emptyStamps();
  for (const [key, val] of Object.entries(t.stamps || {})) {
    const st = resolveStation(key);
    if (st && val) stamps[st.id] = true;
  }
  t.stamps = stamps;
  if (!t.countryCode && t.country) t.countryCode = require('./data/countries').toIso(t.country);
  t.checkinHistory = t.checkinHistory || [];
  t.locationLog = t.locationLog || [];
  t.recEvents = t.recEvents || [];
  const v = t.voucher || {};
  if (!v.status) {
    // v1 shape { unlocked, redeemed, code }
    if (v.redeemed) t.voucher = { status: 'REDEEMED', code: v.code, valueKrw: REWARD.valueKrw, redeemedAt: v.redeemedAt || null };
    else if (v.unlocked) t.voucher = issueVoucher();
    else t.voucher = { status: 'LOCKED' };
  }
  return t;
}

function resetProgress(t) {
  t.stamps = emptyStamps();
  t.checkinHistory = [];
  t.voucher = { status: 'LOCKED' };
  t.lastCheckin = null;
  return t;
}

function stampsCollected(t) {
  return Object.values(t.stamps || {}).filter(Boolean).length;
}

function kindsCollected(t) {
  const kinds = new Set();
  for (const s of STATIONS) if (t.stamps?.[s.id]) kinds.add(s.kind);
  return kinds;
}

// ---------------------------------------------------------------- check-in

function pushLocation(t, entry) {
  t.locationLog = t.locationLog || [];
  t.locationLog.push(entry);
  if (t.locationLog.length > LOCATION_LOG_LIMIT) t.locationLog.splice(0, t.locationLog.length - LOCATION_LOG_LIMIT);
  t.lastLocation = entry;
}

function recordCheckin(tourist, stationId, now = Date.now()) {
  const station = resolveStation(stationId);
  if (!station) {
    const err = new Error(`Unknown station "${stationId}"`);
    err.status = 400;
    throw err;
  }
  normalizeTourist(tourist);

  const previous = tourist.checkinHistory.filter(h => h.station === station.id);
  const last = previous[previous.length - 1];
  if (last && now - Date.parse(last.timestamp) < RECHECKIN_COOLDOWN_MS) {
    return { station, entry: last, duplicate: true, voucherUnlocked: false };
  }

  const isNewStamp = !tourist.stamps[station.id];
  tourist.stamps[station.id] = true;
  const entry = {
    station: station.id,
    kind: station.kind,
    timestamp: new Date(now).toISOString(),
    visitSequence: previous.length + 1,
    isNewStamp
  };
  tourist.checkinHistory.push(entry);
  tourist.lastCheckin = entry;

  // Every tap doubles as a last-known-location fix (used by SOS).
  pushLocation(tourist, {
    source: 'station', station: station.id,
    lat: station.lat, lng: station.lng, accuracy: 30,
    timestamp: entry.timestamp
  });

  // Recommendation conversion: a recommended item at this station was visited.
  const recommended = (tourist.recEvents || []).some(e => e.stationId === station.id && e.action !== 'visited');
  if (recommended) logRecEvent(tourist, { itemId: `station:${station.id}`, stationId: station.id, action: 'visited' }, now);

  const voucherUnlocked = unlockVoucherIfComplete(tourist, now);
  return { station, entry, duplicate: false, voucherUnlocked };
}

// ---------------------------------------------------------------- voucher

function issueVoucher(now = Date.now()) {
  return {
    code: 'JEJU-4000-' + crypto.randomBytes(3).toString('hex').toUpperCase(),
    valueKrw: REWARD.valueKrw,
    status: 'UNLOCKED',
    unlockedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + REWARD.validDays * 864e5).toISOString(),
    redeemedAt: null
  };
}

// One stamp of every required kind -> one voucher, never re-issued on re-check-in.
function unlockVoucherIfComplete(tourist, now = Date.now()) {
  const have = kindsCollected(tourist);
  const complete = REWARD.requiredKinds.every(k => have.has(k));
  if (!complete || (tourist.voucher && tourist.voucher.status !== 'LOCKED')) return false;
  tourist.voucher = issueVoucher(now);
  return true;
}

function redeemVoucher(tourist, now = Date.now()) {
  const v = tourist?.voucher;
  const fail = (status, msg) => { const e = new Error(msg); e.status = status; throw e; };
  if (!v || v.status === 'LOCKED') fail(400, 'Voucher is not unlocked yet');
  if (v.status === 'REDEEMED') fail(409, 'Voucher has already been redeemed');
  if (v.expiresAt && now > Date.parse(v.expiresAt)) { v.status = 'EXPIRED'; fail(410, 'Voucher has expired'); }
  if (v.status !== 'UNLOCKED') fail(409, `Voucher is ${v.status}`);
  Object.assign(v, { status: 'REDEEMED', redeemedAt: new Date(now).toISOString() });
  return v;
}

// ---------------------------------------------------------------- recommendations

function uvFit(uvType, uv) {
  const table = uv >= 8 ? { INDOOR_SHELTER: 1.0, SHADED_WALK: 0.6, OUTDOOR_SUN: 0.2 }
    : uv >= 6 ? { INDOOR_SHELTER: 0.8, SHADED_WALK: 0.8, OUTDOOR_SUN: 0.5 }
    : uv >= 3 ? { INDOOR_SHELTER: 0.6, SHADED_WALK: 0.8, OUTDOOR_SUN: 0.9 }
    : { INDOOR_SHELTER: 0.5, SHADED_WALK: 0.7, OUTDOOR_SUN: 1.0 };
  return table[uvType] ?? 0.5;
}

// How well a spot suits the live weather (rain, wind, heat, cold), 0..1.
function weatherFit(uvType, w) {
  if (!w) return 0.7;
  const exposed = uvType === 'OUTDOOR_SUN', indoor = uvType === 'INDOOR_SHELTER';
  let f = 0.8;
  if (w.rainy) f = indoor ? 1 : exposed ? 0.15 : 0.45;
  if (w.windy && exposed) f = Math.min(f, 0.3);
  if (w.hot) f = Math.min(f, indoor ? 1 : uvType === 'SHADED_WALK' ? 0.85 : 0.35);
  if (w.cold) f = Math.min(f, indoor ? 1 : 0.4);
  if (!w.rainy && !w.windy && !w.hot && !w.cold && !indoor) f = 0.95;   // nice day: go outside
  return f;
}

// One short line for the advice strip; key is used by the app for translation.
function weatherAdvice(w) {
  if (!w) return { key: 'unknown', text: 'Weather unknown. Pack sunscreen and a light jacket.' };
  if (w.rainy) return { key: 'rain', text: 'Rain around. Indoor picks like caves and museums come first.' };
  if (w.windy) return { key: 'wind', text: `Windy (${w.windKmh} km/h). Sheltered spots first, careful on the coast.` };
  if (w.hot) return { key: 'hot', text: `Hot (${w.tempC}°C). Shade, water and cool lava caves.` };
  if (w.cold) return { key: 'cold', text: `Cold (${w.tempC}°C). Warm indoor spots and hot food.` };
  if (w.uv >= 8) return { key: 'uvVeryHigh', text: 'Very high UV. Try lava caves or museums from 10:00 to 15:00.' };
  if (w.uv >= 6) return { key: 'uvHigh', text: 'High UV. SPF50 and a hat, please!' };
  if (w.uv >= 3) return { key: 'uvMid', text: 'Nice weather. Sunscreen before your walk.' };
  return { key: 'nice', text: 'Great weather for coast and peak trails.' };
}

function uvAdvice(uv) {
  if (uv == null) return 'UV unknown. Pack sunscreen just in case.';
  if (uv >= 8) return 'Very high UV. Try lava caves or museums from 10:00 to 15:00.';
  if (uv >= 6) return 'High UV. SPF50 and a hat, please!';
  if (uv >= 3) return 'Moderate UV. Sunscreen before your walk.';
  return 'Low UV. Great time for coast and peak trails.';
}

function distanceKm(a, b) {
  const R = 6371, rad = d => d * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// S(i) = N·D·G·M·(0.30P + 0.20R + 0.15U + 0.15L + 0.10X + 0.10I)
// U mixes UV fit with live rain / wind / heat fit; G is the bad-weather gate;
// M is the mobility gate; I is how well it matches the tourist's interests.
// `today` (optional) are the interests picked on For You for today; they replace the profile ones.
function recommend(tourist, items, { category, uv, weather, origin, today } = {}) {
  if (uv == null) uv = weather?.uv ?? 5;
  const interests = today?.length ? today : Array.isArray(tourist?.interests) ? tourist.interests : [];
  const mobility = tourist?.mobility || 'none';
  const visitedStations = new Set(Object.keys(tourist?.stamps || {}).filter(s => tourist.stamps[s]));
  const restriction = parseDietary(tourist?.dietary);
  const lastStation = tourist?.lastCheckin && resolveStation(tourist.lastCheckin.station);
  const here = origin || (lastStation ? { lat: lastStation.lat, lng: lastStation.lng } : null);

  const nextStop = STATIONS
    .filter(s => !visitedStations.has(s.id))
    .sort((a, b) => a.order - b.order)[0]?.id || null;

  return items
    .filter(i => !category || category === 'all' || i.category === category)
    .map(i => {
      const N = i.category === 'place' && i.stationId && visitedStations.has(i.stationId) ? 0 : 1;
      const D = i.category === 'food' && !isFoodSafe(i, restriction) ? 0 : 1;
      const dist = here ? distanceKm(here, i) : null;
      const P = dist == null ? 0.5 : Math.max(0, 1 - dist / 10);
      const R = (i.rating - 1) / 4;
      // U = weather term: half UV fit, half rain / wind / heat fit
      const W = weatherFit(i.uvType, weather);
      const U = weather ? 0.5 * uvFit(i.uvType, uv) + 0.5 * W : uvFit(i.uvType, uv);
      const L = 0.5 * (i.isLocalBusiness ? 1 : 0) + 0.5 * (1 - (i.crowdLevel ?? 0.5));
      const X = i.stationId && i.stationId === nextStop ? 1 : 0;
      // G: bad-weather gate. Rain or strong wind pushes fully exposed spots down the list.
      const G = i.uvType === 'OUTDOOR_SUN' && (weather?.rainy || weather?.windy) ? 0.6 : 1;
      // M: steep or long walks are hidden for wheelchair users and pushed down for limited walking
      const effort = i.effort ?? 0;
      const M = mobility === 'wheelchair' ? [1, 0.5, 0][effort] : mobility === 'limited' ? [1, 0.8, 0.4][effort] : 1;
      // I: 1 when the item matches a chosen interest, 0.5 when no interests are set
      const I = !interests.length ? 0.5 : (i.interests || []).some(x => interests.includes(x)) ? 1 : 0;
      const score = N * D * G * M * (0.30 * P + 0.20 * R + 0.15 * U + 0.15 * L + 0.10 * X + 0.10 * I);
      const reasons = [];
      if (i.category === 'food' && restriction.tags.length) reasons.push('Fits your diet');
      if (I === 1 && interests.length) reasons.push('Matches your interests');
      if (mobility !== 'none' && i.access === 'partial') reasons.push('Accessible route documented');
      else if (mobility !== 'none' && effort === 0) reasons.push('Easy access');
      if (L >= 0.6) reasons.push(i.isLocalBusiness ? 'Local family business' : 'Quiet hidden spot');
      if (weather?.rainy && i.uvType === 'INDOOR_SHELTER') reasons.push('Dry inside, good for rain');
      else if (weather?.windy && i.uvType !== 'OUTDOOR_SUN') reasons.push('Out of the wind');
      else if (weather?.hot && i.uvType !== 'OUTDOOR_SUN') reasons.push('Cool spot for a hot day');
      else if (U >= 0.9) reasons.push(uv >= 6 ? 'Good for high UV' : 'Great weather match');
      if (dist != null && dist < 0.5) reasons.push('Right where you are');
      else if (dist != null && dist < 5) reasons.push(`${dist.toFixed(1)} km away`);
      if (X) reasons.push('Next wish-band stop');
      return {
        ...i,
        score: Math.round(score * 1000) / 1000,
        distanceKm: dist == null ? null : Math.round(dist * 10) / 10,
        isNextStop: !!X,
        reasons: reasons.slice(0, 3)
      };
    })
    .filter(i => i.score > 0)
    .sort((a, b) => (b.score - a.score) || a.id.localeCompare(b.id));
}

function logRecEvent(tourist, { itemId, stationId = null, action }, now = Date.now()) {
  if (!['shown', 'opened', 'visited'].includes(action)) {
    const e = new Error('action must be shown, opened or visited'); e.status = 400; throw e;
  }
  tourist.recEvents = tourist.recEvents || [];
  tourist.recEvents.push({ itemId, stationId, action, timestamp: new Date(now).toISOString() });
  if (tourist.recEvents.length > REC_EVENT_LIMIT) tourist.recEvents.splice(0, tourist.recEvents.length - REC_EVENT_LIMIT);
}

// ---------------------------------------------------------------- SOS

function newSosAlert({ uid, tourist, latitude, longitude, accuracy, note }) {
  const hasFix = Number.isFinite(latitude) && Number.isFinite(longitude);
  const last = tourist?.lastLocation || null;
  return {
    alertId: 'SOS-' + crypto.randomUUID().slice(0, 8).toUpperCase(),
    uid,
    tourist: {
      name: tourist?.name || 'Guest',
      emergencyContact: tourist?.emergencyContact || '',
      emergencyName: tourist?.emergencyName || '',
      medicalNotes: tourist?.medicalNotes || '',
      mobility: tourist?.mobility || 'none',
      countryCode: tourist?.countryCode || null,
      language: tourist?.language || 'English',
      dietary: tourist?.dietary || 'None'
    },
    location: hasFix ? { latitude, longitude, accuracy: accuracy ?? null, source: 'phone' }
      : last ? { latitude: last.lat, longitude: last.lng, accuracy: last.accuracy ?? null, source: `last-${last.source}`, at: last.timestamp }
      : null,
    lastKnownStation: tourist?.lastCheckin?.station || null,
    note: note || 'Emergency assistance requested via wish-band.',
    status: 'PENDING',
    triggeredAt: new Date().toISOString(),
    acknowledgedAt: null, acknowledgedBy: null,
    dispatchedAt: null, responder: null, etaMinutes: null,
    resolvedAt: null, resolutionNotes: null
  };
}

const SOS_FLOW = {
  PENDING: ['ACKNOWLEDGED', 'CANCELLED'],
  ACKNOWLEDGED: ['DISPATCHED', 'RESOLVED', 'CANCELLED'],
  DISPATCHED: ['RESOLVED'],
  RESOLVED: [],
  CANCELLED: []
};

function advanceSos(alert, to, fields = {}) {
  if (!SOS_FLOW[alert.status]?.includes(to)) {
    const err = new Error(`Cannot move ${alert.status} -> ${to}`);
    err.status = 409;
    throw err;
  }
  const now = new Date().toISOString();
  alert.status = to;
  if (to === 'ACKNOWLEDGED') Object.assign(alert, { acknowledgedAt: now, acknowledgedBy: fields.staffId || 'staff' });
  if (to === 'DISPATCHED') Object.assign(alert, { dispatchedAt: now, responder: fields.responder || 'Rescue team', etaMinutes: fields.etaMinutes ?? null });
  if (to === 'RESOLVED' || to === 'CANCELLED') Object.assign(alert, { resolvedAt: now, resolutionNotes: fields.resolutionNotes || fields.reason || '' });
  return alert;
}

// ---------------------------------------------------------------- metrics (evaluation indicators)

function computeMetrics(tourists, sosAlerts) {
  let shown = 0, visited = 0, checkins = 0, stamps = 0, vouchers = 0, redeemed = 0;
  for (const t of tourists) {
    for (const e of t.recEvents || []) {
      if (e.action === 'shown') shown++;
      if (e.action === 'visited') visited++;
    }
    checkins += (t.checkinHistory || []).length;
    stamps += stampsCollected(t);
    if (t.voucher && t.voucher.status !== 'LOCKED') vouchers++;
    if (t.voucher?.status === 'REDEEMED') redeemed++;
  }
  const alerts = Object.values(sosAlerts || {});
  const located = alerts.filter(a => a.location).length;
  return {
    tourists: tourists.length,
    checkins, stamps, vouchers, redeemed,
    recShown: shown, recVisited: visited,
    conversionRate: shown ? Math.round((visited / shown) * 1000) / 10 : 0,
    sosTotal: alerts.length,
    sosActive: alerts.filter(a => ['PENDING', 'ACKNOWLEDGED', 'DISPATCHED'].includes(a.status)).length,
    lastLocationRate: alerts.length ? Math.round((located / alerts.length) * 1000) / 10 : null
  };
}

module.exports = {
  STATIONS, STATION_KINDS, REWARD, DIETARY_LABELS, SOS_FLOW, RECHECKIN_COOLDOWN_MS,
  resolveStation, emptyStamps, parseDietary, isFoodSafe,
  newGuest, normalizeTourist, resetProgress, stampsCollected, kindsCollected,
  recordCheckin, pushLocation, unlockVoucherIfComplete, redeemVoucher,
  uvFit, uvAdvice, weatherFit, weatherAdvice, distanceKm, recommend, logRecEvent,
  newSosAlert, advanceSos, computeMetrics
};
