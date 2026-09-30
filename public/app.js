// Jeju wish-band · tourist app
// Works from a tag URL (/04DBCE42CA2A81) or ?uid=BEAD_001

// ------------------------------------------------------------------ helpers
const $ = sel => document.querySelector(sel);
const $$ = sel => [...document.querySelectorAll(sel)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function api(path, body) {
  const res = await fetch(path, body === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { status: res.status });
  return data;
}

function toast(msg, kind = '') {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

function confetti() {
  const colors = ['#F28C38', '#2E86AB', '#5E9A62', '#E8B33A', '#D8574A'];
  for (let i = 0; i < 60; i++) {
    const c = document.createElement('div');
    c.className = 'confetti';
    c.style.left = Math.random() * 100 + 'vw';
    c.style.background = colors[i % colors.length];
    c.style.animationDuration = 1.6 + Math.random() * 1.6 + 's';
    c.style.animationDelay = Math.random() * .4 + 's';
    document.body.appendChild(c);
    setTimeout(() => c.remove(), 3800);
  }
}

function chime(type) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const notes = type === 'voucher' ? [523.25, 659.25, 783.99, 1046.5] : [587.33, 880];
    notes.forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime + i * .11;
      o.type = type === 'voucher' ? 'triangle' : 'sine';
      o.frequency.setValueAtTime(f, t);
      g.gain.setValueAtTime(.22, t);
      g.gain.exponentialRampToValueAtTime(.001, t + .35);
      o.connect(g).connect(ctx.destination);
      o.start(t); o.stop(t + .35);
    });
  } catch (_) {}
  if (navigator.vibrate) navigator.vibrate(type === 'voucher' ? [80, 40, 80, 40, 160] : [90, 50, 90]);
}

function timeAgo(iso) {
  if (!iso) return '';
  const s = Math.round((Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString();
}

// ------------------------------------------------------------------ state
function readUid() {
  const q = new URLSearchParams(location.search).get('uid');
  const path = location.pathname.replace(/^\/+|\/+$/g, '');
  const fromPath = path && !/\.(html?|js|css)$/.test(path) && path !== 'admin' ? path : '';
  return (q || fromPath || 'BEAD_001').toUpperCase();
}

const state = {
  uid: readUid(),
  config: null,
  tourist: null,
  category: 'all',
  origin: null,        // phone GPS if the tourist allowed it
  recs: [],
  sunOnBead: false,
  map: null
};

const DIET_TAGS = { TAG_HALAL: 'Halal', TAG_VEGAN: 'Vegan', TAG_VEGETARIAN: 'Vegetarian', TAG_NO_SHELLFISH: 'No Shellfish', TAG_GLUTEN_FREE: 'Gluten-Free' };
const HELP_ICONS = { hospital: '🏥', police: '👮', info: 'ℹ️' };

// ------------------------------------------------------------------ rendering
function renderProfile() {
  const t = state.tourist;
  if (!t) return;
  const first = (t.name || 'traveler').split(/[\s(]/)[0];
  $('#greetName').textContent = `Hello, ${first}!`;
  $('#uidTag').textContent = `wish-band ${t.uid}`;
  $('#meName').textContent = t.name;
  $('#meFrom').textContent = `${t.country || 'Somewhere lovely'} · ${t.language || 'English'}`;
  $('#meDiet').textContent = t.dietary && t.dietary !== 'None' ? t.dietary : 'No restrictions';
  $('#meSos').textContent = t.emergencyContact || 'Not set yet';
  $('#meLang').textContent = t.language || 'English';
  $('#meDeposit').innerHTML = t.depositPaid ? '<span class="chip leaf">10,000₩ held · refunded on return</span>' : '<span class="chip">None</span>';
  const loc = t.lastLocation;
  $('#meLastLoc').textContent = loc
    ? `📍 Last seen ${loc.source === 'station' ? 'at ' + stationName(loc.station) : 'by phone GPS'} · ${timeAgo(loc.timestamp)}`
    : 'No location yet. Tap a station or share your GPS.';
}

function stationName(id) {
  return state.config?.stations.find(s => s.id === id)?.name || id;
}

function renderStamps(justStamped = []) {
  const t = state.tourist, cfg = state.config;
  if (!t || !cfg) return;
  $('#stamps').innerHTML = cfg.stations.map(s => {
    const on = t.stamps?.[s.id];
    const k = cfg.kinds[s.kind];
    return `<div class="stamp ${s.kind} ${on ? 'on' : ''} ${justStamped.includes(s.id) ? 'just' : ''}">
      <div class="ring">${k.emoji}</div>
      <div class="kind">${esc(k.label)} · ${esc(k.label_ko)}</div>
      <div class="name">${esc(s.name)}</div>
    </div>`;
  }).join('');
  const got = cfg.stations.filter(s => t.stamps?.[s.id]).length;
  $('#progressBar').style.width = `${(got / cfg.stations.length) * 100}%`;
  $('#progressText').textContent = `${got} / ${cfg.stations.length} stamps`;
  $('.nav [data-view="stamps"] .i').textContent = got === cfg.stations.length ? '🎉' : '🗿';

  const history = [...(t.checkinHistory || [])].reverse().slice(0, 12);
  $('#timeline').innerHTML = history.length
    ? history.map(h => `<li><span>${cfg.kinds[h.kind]?.emoji || '📍'}</span>${esc(stationName(h.station))}${h.visitSequence > 1 ? ` <span class="chip">visit ${h.visitSequence}</span>` : ''}<span class="t">${timeAgo(h.timestamp)}</span></li>`).join('')
    : '<li class="muted">No taps yet. Find a wish-band station and tap your bracelet!</li>';

  renderVoucher();
}

function renderVoucher() {
  const v = state.tourist?.voucher || { status: 'LOCKED' };
  const box = $('#voucher');
  box.classList.toggle('unlocked', v.status === 'UNLOCKED');
  box.classList.toggle('used', v.status === 'REDEEMED' || v.status === 'EXPIRED');
  const qr = $('#voucherQr');
  const btn = $('#btnRedeem');
  if (v.status === 'UNLOCKED') {
    $('#voucherBadge').textContent = '🎉 Ready to use';
    $('#voucherCode').textContent = v.code;
    $('#voucherDesc').textContent = `Valid until ${new Date(v.expiresAt).toLocaleDateString()}. Show this at any participating Dongmun Market stall.`;
    qr.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=0&data=${encodeURIComponent(v.code)}`;
    qr.classList.remove('hidden');
    btn.disabled = false;
    btn.textContent = 'Show to merchant';
  } else if (v.status === 'REDEEMED') {
    $('#voucherBadge').textContent = '✅ Used';
    $('#voucherCode').textContent = v.code || 'USED';
    $('#voucherDesc').textContent = `Enjoyed on ${new Date(v.redeemedAt || Date.now()).toLocaleString()}. Thank you for supporting local vendors!`;
    qr.classList.add('hidden');
    btn.disabled = true;
    btn.textContent = 'Voucher used';
  } else if (v.status === 'EXPIRED') {
    $('#voucherBadge').textContent = 'Expired';
    qr.classList.add('hidden');
    btn.disabled = true;
  } else {
    const got = Object.values(state.tourist?.stamps || {}).filter(Boolean).length;
    $('#voucherBadge').textContent = `🔒 ${got} / ${state.config?.stations.length || 3} stamps`;
    $('#voucherCode').textContent = '•••• •••• ••••';
    $('#voucherDesc').textContent = 'Collect a food, place and activity stamp to unlock.';
    qr.classList.add('hidden');
    btn.disabled = true;
    btn.textContent = 'Locked';
  }
}

function renderRecs(data) {
  if (data) {
    state.recs = data.recommendations || [];
    $('#uvNum').textContent = data.uvIndex ?? '–';
    const uv = data.uvIndex ?? 0;
    $('#uvLabel').textContent = uv >= 8 ? 'Very high UV' : uv >= 6 ? 'High UV' : uv >= 3 ? 'Moderate UV' : 'Low UV';
    $('#uvAdvice').textContent = data.advice + (data.uvSource === 'fallback' ? ' (estimate)' : '');
    if (!state.sunOnBead) $('#bead').classList.toggle('sun', uv >= 3);
  }
  const list = $('#recList');
  if (!state.recs.length) {
    list.innerHTML = `<div class="empty"><div class="big">🌿</div>Nothing safe to suggest in this category yet.<br>Try another tab or update your diet in <b>Me</b>.</div>`;
    return;
  }
  list.innerHTML = state.recs.slice(0, 8).map((r, i) => `
    <div class="rec ${i === 0 ? 'top' : ''}" data-id="${esc(r.id)}">
      <div class="ico ${r.category}">${r.emoji || '📍'}</div>
      <div class="body">
        ${i === 0 ? '<div class="badge-top">★ Best match right now</div>' : ''}
        <div class="title">${esc(r.title)} <span class="ko">${esc(r.title_ko || '')}</span></div>
        <div class="note">${esc(r.note || '')}</div>
        <div class="reasons">${(r.reasons || []).map(x => `<span class="chip ${r.category === 'food' ? 'tan' : r.category === 'place' ? 'sea' : 'leaf'}">${esc(x)}</span>`).join('')}</div>
      </div>
      <button class="btn small go" data-go="${esc(r.id)}">Go</button>
    </div>`).join('');
}

// ------------------------------------------------------------------ data loading
async function loadTourist({ celebrate = true } = {}) {
  const before = state.tourist;
  const t = await api(`/api/tourist/${encodeURIComponent(state.uid)}`);
  state.tourist = t;

  const newStamps = before ? Object.keys(t.stamps || {}).filter(k => t.stamps[k] && !before.stamps?.[k]) : [];
  const voucherJustUnlocked = before && before.voucher?.status === 'LOCKED' && t.voucher?.status === 'UNLOCKED';

  renderProfile();
  renderStamps(newStamps);
  renderSos(t.activeSos);

  if (celebrate && newStamps.length) {
    chime(voucherJustUnlocked ? 'voucher' : 'stamp');
    toast(voucherJustUnlocked ? '🎉 All stamps! Your market voucher is unlocked' : `🗿 New stamp: ${stationName(newStamps[0])}`, 'good');
    if (voucherJustUnlocked) confetti();
    loadRecs();
  }
}

async function loadRecs() {
  const q = new URLSearchParams({ uid: state.uid, category: state.category });
  if (state.origin) { q.set('lat', state.origin.lat); q.set('lng', state.origin.lng); }
  try {
    renderRecs(await api(`/api/recommendations?${q}`));
  } catch (e) {
    $('#recList').innerHTML = `<div class="empty"><div class="big">📡</div>Could not load suggestions.<br>${esc(e.message)}</div>`;
  }
}

// ------------------------------------------------------------------ live sync
function setLive(on, text) {
  $('#live').classList.toggle('on', on);
  $('#liveText').textContent = text;
}

let pollTimer = null;
function startPolling() {
  if (pollTimer) return;
  setLive(true, 'Live');
  pollTimer = setInterval(() => loadTourist().catch(() => setLive(false, 'Offline')), 2500);
}

function startSync() {
  if (location.hostname.endsWith('vercel.app')) return startPolling();
  try {
    const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`);
    ws.onopen = () => setLive(true, 'Live');
    ws.onmessage = ev => {
      const { event, payload } = JSON.parse(ev.data);
      const uid = payload?.uid || payload?.tourist?.uid;
      if (event === 'CONNECTED') return;
      if (uid === state.uid || uid === 'ALL') loadTourist();
    };
    ws.onclose = ws.onerror = () => startPolling();
  } catch (_) { startPolling(); }
}

// ------------------------------------------------------------------ map
function initMap() {
  if (state.map) return;
  if (!window.L) { $('#map').innerHTML = '<div class="empty"><div class="big">🗺️</div>Map could not load. The help list below still works.</div>'; return; }
  const cfg = state.config;
  const map = L.map('map', { zoomControl: false, attributionControl: true }).setView([33.39, 126.55], 9);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenStreetMap' }).addTo(map);
  const pin = (emoji, color) => L.divIcon({ className: '', iconSize: [34, 34], iconAnchor: [17, 34], popupAnchor: [0, -30],
    html: `<div class="pin" style="background:${color}"><span>${emoji}</span></div>` });

  for (const s of cfg.stations) {
    const k = cfg.kinds[s.kind];
    const done = state.tourist?.stamps?.[s.id];
    L.marker([s.lat, s.lng], { icon: pin(done ? '✅' : k.emoji, k.color) }).addTo(map)
      .bindPopup(`<b>${esc(s.name)}</b><br>${esc(s.name_ko)}<br>${esc(k.label)} station${done ? ' · stamped' : ''}`);
  }
  for (const h of cfg.helpPoints) {
    L.marker([h.lat, h.lng], { icon: pin(HELP_ICONS[h.type] || '🆘', '#D8574A') }).addTo(map)
      .bindPopup(`<b>${esc(h.name)}</b><br><a href="tel:${esc(h.phone)}">Call ${esc(h.phone)}</a>`);
  }
  const me = state.origin || (state.tourist?.lastLocation && { lat: state.tourist.lastLocation.lat, lng: state.tourist.lastLocation.lng });
  if (me) L.circleMarker([me.lat, me.lng], { radius: 9, color: '#fff', weight: 3, fillColor: '#2E86AB', fillOpacity: 1 }).addTo(map).bindPopup('You (last known)');
  state.map = map;
  setTimeout(() => map.invalidateSize(), 150);
}

function renderHelp() {
  const cfg = state.config;
  const hot = cfg.hotlines.map(h => `<a class="hotline" href="tel:${esc(h.number)}"><b>${esc(h.number)}</b><span>${esc(h.label)}</span></a>`).join('');
  $('#hotlines').innerHTML = hot;
  $('#sosHotlines').innerHTML = hot;
  const origin = state.origin || (state.tourist?.lastLocation && { lat: state.tourist.lastLocation.lat, lng: state.tourist.lastLocation.lng });
  const dist = h => origin ? haversine(origin, h) : null;
  const items = [...cfg.helpPoints].sort((a, b) => (dist(a) ?? 0) - (dist(b) ?? 0));
  $('#helpList').innerHTML = items.map(h => {
    const d = dist(h);
    return `<div class="help-item"><span class="e">${HELP_ICONS[h.type] || '🆘'}</span>
      <div><div class="n">${esc(h.name)}</div><div class="d">${d != null ? d.toFixed(1) + ' km · ' : ''}${esc(h.type)}</div></div>
      <a class="btn small sea" href="tel:${esc(h.phone)}">Call</a></div>`;
  }).join('');
}

function haversine(a, b) {
  const R = 6371, r = x => x * Math.PI / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// ------------------------------------------------------------------ GPS
function getPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('GPS not available'));
    navigator.geolocation.getCurrentPosition(
      p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: Math.round(p.coords.accuracy) }),
      e => reject(new Error(e.message || 'Location blocked')),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
    );
  });
}

async function shareLocation({ quiet = false } = {}) {
  try {
    const pos = await getPosition();
    state.origin = pos;
    await api('/api/location', { uid: state.uid, ...pos });
    if (!quiet) toast('📍 Location saved', 'good');
    return pos;
  } catch (e) {
    if (!quiet) toast(`Location: ${e.message}`, 'warn');
    return null;
  }
}

// ------------------------------------------------------------------ SOS
let activeSos = null;
function renderSos(alert) {
  activeSos = alert || null;
  $('#sosFab').classList.toggle('active', !!activeSos);
  $('#sosIdle').classList.toggle('hidden', !!activeSos);
  $('#sosActive').classList.toggle('hidden', !activeSos);
  if (!activeSos) return;
  const order = ['PENDING', 'ACKNOWLEDGED', 'DISPATCHED', 'RESOLVED'];
  const idx = order.indexOf(activeSos.status);
  $$('.sos-step').forEach((el, i) => el.classList.toggle('on', i <= idx));
  const loc = activeSos.location;
  $('#sosDetail').textContent =
    (activeSos.status === 'DISPATCHED' ? `${activeSos.responder || 'Rescue team'} is coming${activeSos.etaMinutes ? `, about ${activeSos.etaMinutes} min` : ''}. ` : '') +
    (loc ? `Location sent (${loc.source === 'phone' ? 'phone GPS' : 'last wish-band tap'}).` : 'No location yet, please call 119 as well.');
}

function setupHold() {
  const btn = $('#holdSos'), fill = $('#holdFill');
  let start = 0, raf = 0;
  const HOLD_MS = 2000;
  const stop = () => { cancelAnimationFrame(raf); start = 0; fill.style.transform = 'scaleX(0)'; };
  const tick = () => {
    const p = Math.min(1, (performance.now() - start) / HOLD_MS);
    fill.style.transform = `scaleX(${p})`;
    if (p >= 1) { stop(); sendSos(); return; }
    raf = requestAnimationFrame(tick);
  };
  btn.addEventListener('pointerdown', e => { e.preventDefault(); start = performance.now(); if (navigator.vibrate) navigator.vibrate(30); tick(); });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => btn.addEventListener(ev, stop));
}

async function sendSos() {
  if (navigator.vibrate) navigator.vibrate([200, 80, 200]);
  toast('🚨 Sending SOS…', 'warn');
  let pos = null;
  try { pos = await getPosition(); } catch (_) {}
  try {
    const r = await api('/api/sos', {
      uid: state.uid, note: $('#sosNote').value.trim() || undefined,
      latitude: pos?.lat, longitude: pos?.lng, accuracy: pos?.accuracy
    });
    renderSos(r.alert);
    toast('SOS sent. The help desk can see you.', 'good');
  } catch (e) {
    toast(`SOS failed: ${e.message}. Call 119!`, 'warn');
  }
}

// ------------------------------------------------------------------ profile editing
function openSheet(id) { $(id).classList.add('open'); }
function closeSheets() { $$('.sheet-backdrop').forEach(s => s.classList.remove('open')); }

function openEdit() {
  const t = state.tourist;
  $('#inName').value = t.name || '';
  $('#inCountry').value = t.country || '';
  $('#inLang').value = t.language || 'English';
  $('#inSos').value = t.emergencyContact || '';
  const parts = String(t.dietary || '').split(',').map(s => s.trim()).filter(s => s && s.toLowerCase() !== 'none');
  const known = Object.values(DIET_TAGS).map(s => s.toLowerCase());
  $('#dietPicks').innerHTML = Object.values(DIET_TAGS)
    .map(l => `<button type="button" data-diet="${l}" class="${parts.some(p => p.toLowerCase() === l.toLowerCase()) ? 'on' : ''}">${l}</button>`).join('');
  $('#inDietOther').value = parts.filter(p => !known.includes(p.toLowerCase())).join(', ');
  openSheet('#sheetEdit');
}

async function saveProfile() {
  const picked = $$('#dietPicks .on').map(b => b.dataset.diet);
  const other = $('#inDietOther').value.split(',').map(s => s.trim()).filter(Boolean);
  const dietary = [...picked, ...other].join(', ') || 'None';
  $('#btnSave').disabled = true;
  try {
    const r = await api('/api/register', {
      uid: state.uid, name: $('#inName').value, country: $('#inCountry').value,
      language: $('#inLang').value, dietary, emergencyContact: $('#inSos').value
    });
    state.tourist = { ...state.tourist, ...r.tourist };
    renderProfile();
    closeSheets();
    toast('Saved 💾', 'good');
    loadRecs();
    if (other.length) toast('Unknown allergies keep food picks extra strict', '');
  } catch (e) {
    toast(e.message, 'warn');
  } finally {
    $('#btnSave').disabled = false;
  }
}

// ------------------------------------------------------------------ events
function switchView(name) {
  $$('.view').forEach(v => v.classList.toggle('on', v.id === `view-${name}`));
  $$('#nav button').forEach(b => b.classList.toggle('on', b.dataset.view === name));
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (name === 'map') { initMap(); renderHelp(); setTimeout(() => state.map?.invalidateSize(), 200); }
}

function bindEvents() {
  $('#nav').addEventListener('click', e => { const b = e.target.closest('button'); if (b) switchView(b.dataset.view); });

  $('#cats').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    $$('#cats button').forEach(x => x.classList.toggle('on', x === b));
    state.category = b.dataset.cat;
    loadRecs();
  });

  $('#recList').addEventListener('click', e => {
    const b = e.target.closest('[data-go]');
    if (!b) return;
    const r = state.recs.find(x => x.id === b.dataset.go);
    api('/api/recommendations/event', { uid: state.uid, itemId: r.id, action: 'opened' }).catch(() => {});
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${r.lat},${r.lng}`, '_blank');
  });

  $('#btnLocate').addEventListener('click', async () => {
    const pos = await shareLocation();
    if (pos) { $('#recWhy').textContent = 'Sorted by what is close to you right now'; loadRecs(); }
  });
  $('#btnShareLoc').addEventListener('click', async () => { await shareLocation(); loadTourist({ celebrate: false }); });

  $('#btnEdit').addEventListener('click', openEdit);
  $('#btnSave').addEventListener('click', saveProfile);
  $('#dietPicks').addEventListener('click', e => { const b = e.target.closest('button'); if (b) b.classList.toggle('on'); });

  $$('.sheet-backdrop').forEach(s => s.addEventListener('click', e => {
    if (e.target === s || e.target.closest('[data-close]')) closeSheets();
  }));

  $('#sosFab').addEventListener('click', () => { renderHelp(); openSheet('#sheetSos'); });
  setupHold();
  $('#btnSosCancel').addEventListener('click', async () => {
    if (!activeSos) return;
    try { await api('/api/sos/cancel', { alertId: activeSos.alertId, reason: 'Tourist is OK' }); renderSos(null); toast('SOS cancelled. Glad you are OK 💚', 'good'); }
    catch (e) { toast(e.message, 'warn'); }
  });

  $('#btnRedeem').addEventListener('click', () => { $('#inPin').value = ''; openSheet('#sheetRedeem'); });
  $('#btnConfirmRedeem').addEventListener('click', async () => {
    try {
      const r = await api('/api/redeem', { uid: state.uid, pin: $('#inPin').value });
      state.tourist = r.tourist;
      renderVoucher();
      closeSheets();
      chime('voucher');
      toast('🎁 Voucher used. Enjoy Dongmun Market!', 'good');
    } catch (e) { toast(e.message, 'warn'); }
  });

  // demo tools
  $('#btnUv').addEventListener('click', () => {
    state.sunOnBead = !state.sunOnBead;
    $('#bead').classList.toggle('sun', state.sunOnBead);
    toast(state.sunOnBead ? '☀️ Bead turns tangerine in direct sun' : '🌥️ Bead back to pearl white in shade');
  });
  $('#btnSwitch').addEventListener('click', () => {
    const next = prompt('Tag UID to open:', state.uid);
    if (next && next.trim()) location.href = `/${encodeURIComponent(next.trim().toUpperCase())}`;
  });
  $('#btnReset').addEventListener('click', async () => {
    if (!confirm('Reset stamps and voucher for this tag?')) return;
    await api('/api/reset', { uid: state.uid }).catch(e => toast(e.message, 'warn'));
    state.tourist = null;
    await loadTourist({ celebrate: false });
    loadRecs();
  });
  $('#demoTaps').addEventListener('click', async e => {
    const b = e.target.closest('[data-tap]');
    if (!b) return;
    try {
      const r = await api('/api/demo/tap', { uid: state.uid, station: b.dataset.tap });
      if (r.duplicate) toast('Already stamped a moment ago ↺');
      await loadTourist();
    } catch (err) { toast(err.message, 'warn'); }
  });
}

function renderDemo() {
  const cfg = state.config;
  if (!cfg.demoMode) return;
  $('#demoTools').classList.remove('hidden');
  $('#demoTaps').innerHTML = cfg.stations.map(s => `<button class="btn small ${s.kind === 'place' ? 'sea' : s.kind === 'activity' ? 'leaf' : ''}" data-tap="${s.id}">${cfg.kinds[s.kind].emoji} Tap ${esc(cfg.kinds[s.kind].label)} station</button>`).join('');
  $('#demoTags').innerHTML = ['04DBCE42CA2A81', 'FA1D2207', '2E720204', 'BEAD_001', 'BEAD_002']
    .map(u => `<a class="chip ${u === state.uid ? 'tan' : ''}" href="/${u}">${u}</a>`).join('');
}

// ------------------------------------------------------------------ boot
(async function init() {
  bindEvents();
  try {
    state.config = await api('/api/config');
    renderDemo();
    await loadTourist({ celebrate: false });
    loadRecs();
    startSync();
  } catch (e) {
    setLive(false, 'Offline');
    toast(`Could not reach server: ${e.message}`, 'warn');
  }
})();
