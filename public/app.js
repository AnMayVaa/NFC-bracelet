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

function haversine(a, b) {
  const R = 6371, r = x => x * Math.PI / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const directionsUrl = p => `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`;

// ------------------------------------------------------------------ state
function readUid() {
  const q = new URLSearchParams(location.search).get('uid');
  const path = location.pathname.replace(/^\/+|\/+$/g, '');
  const fromPath = path && !/\.(html?|js|css)$/.test(path) && path !== 'admin' ? path : '';
  return (q || fromPath || 'BEAD_001').toUpperCase();
}

const state = {
  uid: readUid(),
  view: 'home',
  config: null,
  tourist: null,
  category: 'all',
  origin: null,        // phone GPS if the tourist allowed it
  recs: [],
  uv: null,
  sunOnBead: false,
  maps: {},            // id -> { map, layer }
  recMarkers: {}
};

const DIET_TAGS = { TAG_HALAL: 'Halal', TAG_VEGAN: 'Vegan', TAG_VEGETARIAN: 'Vegetarian', TAG_NO_SHELLFISH: 'No Shellfish', TAG_GLUTEN_FREE: 'Gluten-Free' };
const HELP_ICONS = { hospital: '🏥', police: '👮', info: 'ℹ️' };
const CAT_COLORS = { place: '#2E86AB', food: '#F28C38', activity: '#5E9A62' };
const JEJU_CENTER = [33.38, 126.55];

function myPosition() {
  if (state.origin) return state.origin;
  const l = state.tourist?.lastLocation;
  return l ? { lat: l.lat, lng: l.lng } : null;
}

function stationName(id) {
  return state.config?.stations.find(s => s.id === id)?.name || id;
}

// ------------------------------------------------------------------ maps
function getMap(id) {
  if (state.maps[id]) return state.maps[id];
  const el = document.getElementById(id);
  if (!window.L) {
    el.innerHTML = '<div class="empty"><div class="big">🗺️</div>Map could not load right now.</div>';
    return null;
  }
  const map = L.map(el, { zoomControl: false, attributionControl: true, tap: true }).setView(JEJU_CENTER, 9);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenStreetMap' }).addTo(map);
  L.control.zoom({ position: 'bottomleft' }).addTo(map);
  const entry = { map, layer: L.layerGroup().addTo(map) };
  state.maps[id] = entry;
  return entry;
}

const pin = (emoji, color, extra = '') => L.divIcon({
  className: '', iconSize: [36, 36], iconAnchor: [18, 36], popupAnchor: [0, -32],
  html: `<div class="pin ${extra}" style="background:${color}"><span>${emoji}</span></div>`
});

function addMe(entry) {
  const me = myPosition();
  if (!me) return null;
  L.circleMarker([me.lat, me.lng], { radius: 9, color: '#fff', weight: 3, fillColor: '#2E86AB', fillOpacity: 1 })
    .addTo(entry.layer).bindPopup(state.origin ? 'You are here' : 'Your last wish-band tap');
  return [me.lat, me.lng];
}

function fit(entry, points) {
  entry.points = points;
  if (!points.length) return;
  if (points.length === 1) entry.map.setView(points[0], 12);
  else entry.map.fitBounds(points, { padding: [36, 36], maxZoom: 13 });
}

function renderHomeMap() {
  const entry = getMap('mapHome');
  if (!entry) return;
  entry.layer.clearLayers();
  state.recMarkers = {};
  const pts = [];
  state.recs.slice(0, 8).forEach((r, i) => {
    const m = L.marker([r.lat, r.lng], { icon: pin(r.emoji || '📍', CAT_COLORS[r.category], i === 0 ? 'best' : ''), zIndexOffset: i === 0 ? 500 : 0 })
      .addTo(entry.layer)
      .bindPopup(`<div class="pop"><b>${esc(r.title)}</b><span>${esc(r.title_ko || '')}</span>
        <small>${esc((r.reasons || []).join(' · '))}</small>
        <button class="btn small" data-go="${esc(r.id)}">Directions</button></div>`);
    state.recMarkers[r.id] = m;
    pts.push([r.lat, r.lng]);
  });
  const me = addMe(entry);
  if (me) pts.push(me);
  fit(entry, pts);
}

function renderSosMap() {
  const entry = getMap('mapSos');
  if (!entry) return;
  entry.layer.clearLayers();
  const pts = state.config.helpPoints.map(h => {
    L.marker([h.lat, h.lng], { icon: pin(HELP_ICONS[h.type] || '🆘', '#D8574A') }).addTo(entry.layer)
      .bindPopup(`<div class="pop"><b>${esc(h.name)}</b><a class="btn small sea" href="tel:${esc(h.phone)}">Call ${esc(h.phone)}</a></div>`);
    return [h.lat, h.lng];
  });
  const me = addMe(entry);
  if (me) pts.push(me);
  fit(entry, pts);
}

function nextStation() {
  const cfg = state.config, t = state.tourist;
  return [...cfg.stations].sort((a, b) => a.order - b.order).find(s => !t?.stamps?.[s.id]) || null;
}

function renderStampsMap() {
  const entry = getMap('mapStamps');
  if (!entry) return;
  entry.layer.clearLayers();
  const cfg = state.config, t = state.tourist;
  const ordered = [...cfg.stations].sort((a, b) => a.order - b.order);
  const next = nextStation();
  L.polyline(ordered.map(s => [s.lat, s.lng]), { color: '#F28C38', weight: 4, opacity: .7, dashArray: '2 10', lineCap: 'round' }).addTo(entry.layer);
  const pts = ordered.map(s => {
    const k = cfg.kinds[s.kind];
    const done = t?.stamps?.[s.id];
    L.marker([s.lat, s.lng], { icon: pin(done ? '✅' : k.emoji, done ? '#9AA39B' : k.color, next?.id === s.id ? 'pulse' : '') }).addTo(entry.layer)
      .bindPopup(`<div class="pop"><b>${esc(s.name)}</b><span>${esc(s.name_ko)}</span>
        <small>${esc(k.label)} station · ${done ? 'stamped ✔' : 'not yet'}</small>
        <a class="btn small" target="_blank" href="${directionsUrl(s)}">Directions</a></div>`);
    return [s.lat, s.lng];
  });
  const me = addMe(entry);
  if (me) pts.push(me);
  fit(entry, pts);

  const box = $('#nextStop');
  if (!next) {
    box.innerHTML = '<span class="e">🎉</span><div><b>Route complete!</b><div class="muted">All stamps collected. Enjoy your market treat.</div></div>';
  } else {
    const me = myPosition();
    const d = me ? haversine(me, next) : null;
    box.innerHTML = `<span class="e">${cfg.kinds[next.kind].emoji}</span>
      <div style="flex:1;min-width:0"><b>Next stop: ${esc(next.name)}</b><div class="muted">${esc(next.blurb || '')}${d != null ? ` · ${d.toFixed(1)} km` : ''}</div></div>
      <a class="btn small" target="_blank" href="${directionsUrl(next)}">Go</a>`;
  }
  box.classList.remove('hidden');
}

function refreshMapSize() {
  const id = { home: 'mapHome', sos: 'mapSos', stamps: 'mapStamps' }[state.view];
  const entry = id && state.maps[id];
  if (!entry) return;
  setTimeout(() => {
    entry.map.invalidateSize();
    if (!entry.sized && entry.points) { entry.sized = true; fit(entry, entry.points); }
  }, 80);
}

// ------------------------------------------------------------------ rendering
function renderProfile() {
  const t = state.tourist;
  if (!t) return;
  const first = !t.name || /^Wish-band Guest/.test(t.name) ? 'traveler' : t.name.split(/[\s(]/)[0];
  $('#greetName').textContent = `Hello, ${first}!`;
  $('#uidTag').textContent = `wish-band ${t.uid}`;
  $('#meName').textContent = t.name;
  $('#meFrom').textContent = `${t.country || 'Somewhere lovely'} · ${t.language || 'English'}`;
  $('#meDiet').textContent = t.dietary && t.dietary !== 'None' ? t.dietary : 'No restrictions';
  $('#meSos').textContent = t.emergencyContact || 'Not set yet';
  $('#meLang').textContent = t.language || 'English';
  $('#meDeposit').innerHTML = t.depositPaid ? '<span class="chip leaf">10,000₩ held · refunded on return</span>' : '<span class="chip">None</span>';
  const loc = t.lastLocation;
  $('#lastLoc').innerHTML = loc
    ? `📍 Last seen ${loc.source === 'station' ? 'at <b>' + esc(stationName(loc.station)) + '</b>' : 'by <b>phone GPS</b>'} · ${timeAgo(loc.timestamp)}`
    : '📍 No location yet. Tap a station or press 📡 on the map.';
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
    : '<li class="muted">No taps yet. Find a wish-band station on the map and tap your bracelet!</li>';

  renderVoucher();
  renderRouteStrip();
  if (state.maps.mapStamps) renderStampsMap();
}

// Small progress bar on For You so nobody has to open Stamps to know what's next.
function renderRouteStrip() {
  const t = state.tourist, cfg = state.config;
  const ordered = [...cfg.stations].sort((a, b) => a.order - b.order);
  const got = ordered.filter(s => t.stamps?.[s.id]).length;
  const v = t.voucher?.status;
  const next = nextStation();
  $('#routeBeads').innerHTML = ordered.map(s => `<i class="${t.stamps?.[s.id] ? 'on' : ''}">${cfg.kinds[s.kind].emoji}</i>`).join('');
  const strip = $('#routeStrip');
  strip.classList.toggle('ready', v === 'UNLOCKED');
  if (v === 'UNLOCKED') {
    $('#routeTitle').textContent = '🎁 Your 4,000₩ voucher is ready';
    $('#routeSub').textContent = 'Tap to show it at Dongmun Market';
  } else if (v === 'REDEEMED') {
    $('#routeTitle').textContent = 'Wish Route complete 💚';
    $('#routeSub').textContent = 'Thanks for supporting local vendors';
  } else {
    $('#routeTitle').textContent = `Wish Route ${got}/${ordered.length}`;
    $('#routeSub').textContent = next ? `Next: ${next.name}` : 'All stamps collected';
  }
}

// ------------------------------------------------------------------ quick start (first visit)
const qsKey = () => `wb-qs-${state.uid}`;
function storeGet(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }
function storeSet(k, v) { try { localStorage.setItem(k, v); } catch (_) {} }

function renderQuickStart() {
  const t = state.tourist;
  const isNew = /^Wish-band Guest/.test(t.name || '') && (!t.dietary || t.dietary === 'None');
  const show = isNew && !storeGet(qsKey());
  $('#quickStart').classList.toggle('hidden', !show);
  if (!show || $('#qsDiet').children.length) return;
  $('#qsDiet').innerHTML = Object.values(DIET_TAGS).map(l => `<button type="button" data-diet="${l}">${l}</button>`).join('');
}

async function saveQuickDiet() {
  const picked = $$('#qsDiet .on').map(b => b.dataset.diet);
  $('#qsDone').textContent = picked.length ? `Done · ${picked.join(', ')}` : 'No restrictions, show me Jeju';
  try {
    const r = await api('/api/register', { uid: state.uid, dietary: picked.join(', ') || 'None' });
    state.tourist = { ...state.tourist, ...r.tourist };
    renderProfile();
    loadRecs();
  } catch (e) { toast(e.message, 'warn'); }
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

function renderUv() {
  const uv = state.uv;
  $('#uvNum').textContent = uv ?? '–';
  const sun = state.sunOnBead || (uv ?? 0) >= 3;
  $('#bead').classList.toggle('sun', sun);
  $('#beadBig').classList.toggle('sun', sun);
}

function renderRecs(data) {
  if (data) {
    state.recs = data.recommendations || [];
    state.uv = data.uvIndex;
    $('#uvAdvice').textContent = data.advice + (data.uvSource === 'fallback' ? ' (estimate)' : '');
    $('#adviceStrip .e').textContent = (data.uvIndex ?? 0) >= 6 ? '🧴' : (data.uvIndex ?? 0) >= 3 ? '😎' : '🌤️';
    renderUv();
  }
  renderHomeMap();
  const list = $('#recList');
  if (!state.recs.length) {
    list.innerHTML = `<div class="empty"><div class="big">🌿</div>Nothing safe to suggest in this category yet.<br>Try another tab or update your diet in <b>Me</b>.</div>`;
    return;
  }
  list.innerHTML = state.recs.slice(0, 8).map((r, i) => `
    <div class="rec ${i === 0 ? 'top' : ''}" data-id="${esc(r.id)}" tabindex="0">
      <div class="ico ${r.category}">${r.emoji || '📍'}<span class="rank">${i + 1}</span></div>
      <div class="body">
        ${i === 0 ? '<div class="badge-top">★ Best match right now</div>' : ''}
        <div class="title">${esc(r.title)} <span class="ko">${esc(r.title_ko || '')}</span></div>
        <div class="note">${esc(r.note || '')}</div>
        <div class="reasons">${(r.reasons || []).slice(0, i === 0 ? 2 : 1).map(x => `<span class="chip ${r.category === 'food' ? 'tan' : r.category === 'place' ? 'sea' : 'leaf'}">${esc(x)}</span>`).join('')}</div>
      </div>
      <button class="btn small go" data-go="${esc(r.id)}" aria-label="Directions">🧭 Go</button>
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
  if (!before) renderQuickStart();
  if (!before || JSON.stringify(before.stamps) !== JSON.stringify(t.stamps) || before.voucher?.status !== t.voucher?.status
      || (before.checkinHistory || []).length !== (t.checkinHistory || []).length) renderStamps(newStamps);
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
  pollTimer = setInterval(() => loadTourist().then(() => setLive(true, 'Live')).catch(() => setLive(false, 'Offline')), 2500);
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

// ------------------------------------------------------------------ SOS tab
function renderHelp() {
  const cfg = state.config;
  $('#hotlines').innerHTML = cfg.hotlines.map(h => `<a class="hotline" href="tel:${esc(h.number)}"><b>${esc(h.number)}</b><span>${esc(h.label)}</span></a>`).join('');
  const origin = myPosition();
  const dist = h => origin ? haversine(origin, h) : null;
  const items = [...cfg.helpPoints].sort((a, b) => (dist(a) ?? 0) - (dist(b) ?? 0));
  $('#helpList').innerHTML = items.map(h => {
    const d = dist(h);
    return `<div class="help-item" data-lat="${h.lat}" data-lng="${h.lng}"><span class="e">${HELP_ICONS[h.type] || '🆘'}</span>
      <div style="flex:1;min-width:0"><div class="n">${esc(h.name)}</div><div class="d">${d != null ? d.toFixed(1) + ' km · ' : ''}${esc(h.type)}</div></div>
      <a class="icon-btn" href="${directionsUrl(h)}" target="_blank" title="Directions">🧭</a>
      <a class="btn small sea" href="tel:${esc(h.phone)}">Call</a></div>`;
  }).join('');
}

let activeSos = null;
function renderSos(alert) {
  activeSos = alert || null;
  $('#sosBadge').classList.toggle('hidden', !activeSos);
  $('.nav-sos').classList.toggle('alert', !!activeSos);
  $('#sosCard').classList.toggle('active', !!activeSos);
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
  const stop = () => { cancelAnimationFrame(raf); start = 0; fill.style.transform = 'scaleX(0)'; btn.classList.remove('holding'); };
  const tick = () => {
    const p = Math.min(1, (performance.now() - start) / HOLD_MS);
    fill.style.transform = `scaleX(${p})`;
    if (p >= 1) { stop(); sendSos(); return; }
    raf = requestAnimationFrame(tick);
  };
  btn.addEventListener('pointerdown', e => { e.preventDefault(); start = performance.now(); btn.classList.add('holding'); if (navigator.vibrate) navigator.vibrate(30); tick(); });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => btn.addEventListener(ev, stop));
  btn.addEventListener('contextmenu', e => e.preventDefault());
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

async function shareLocation() {
  try {
    const pos = await getPosition();
    state.origin = pos;
    await api('/api/location', { uid: state.uid, ...pos });
    toast('📍 Location saved', 'good');
    return pos;
  } catch (e) {
    toast(`Location: ${e.message}`, 'warn');
    return null;
  }
}

// If the phone already allowed location before, use it without asking again.
async function autoLocate() {
  try {
    const perm = await navigator.permissions?.query({ name: 'geolocation' });
    if (perm?.state !== 'granted') return;
    const pos = await getPosition();
    state.origin = pos;
    api('/api/location', { uid: state.uid, ...pos }).catch(() => {});
    $('#recWhy').textContent = 'sorted by what is near you';
    loadRecs();
  } catch (_) {}
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
    if (other.length) toast('Unknown allergies keep food picks extra strict');
  } catch (e) {
    toast(e.message, 'warn');
  } finally {
    $('#btnSave').disabled = false;
  }
}

// ------------------------------------------------------------------ navigation & events
function switchView(name) {
  state.view = name;
  $$('.view').forEach(v => v.classList.toggle('on', v.id === `view-${name}`));
  $$('#nav button').forEach(b => b.classList.toggle('on', b.dataset.view === name));
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (name === 'sos') { renderHelp(); if (!state.maps.mapSos) renderSosMap(); }
  if (name === 'stamps' && !state.maps.mapStamps) renderStampsMap();
  refreshMapSize();
}

function openDirections(id) {
  const r = state.recs.find(x => x.id === id);
  if (!r) return;
  api('/api/recommendations/event', { uid: state.uid, itemId: r.id, action: 'opened' }).catch(() => {});
  window.open(directionsUrl(r), '_blank');
}

function bindEvents() {
  $('#nav').addEventListener('click', e => { const b = e.target.closest('button'); if (b) switchView(b.dataset.view); });

  $('#cats').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b || b.classList.contains('on')) return;
    $$('#cats button').forEach(x => x.classList.toggle('on', x === b));
    state.category = b.dataset.cat;
    $('#recList').innerHTML = '<div class="rec skeleton"></div><div class="rec skeleton"></div>';
    loadRecs();
  });

  // "Go" buttons in the list and in map popups
  document.addEventListener('click', e => {
    const go = e.target.closest('[data-go]');
    if (go) { e.stopPropagation(); openDirections(go.dataset.go); }
  });

  // Tap a card -> show it on the map
  $('#recList').addEventListener('click', e => {
    const card = e.target.closest('.rec[data-id]');
    if (!card || e.target.closest('[data-go]')) return;
    const m = state.recMarkers[card.dataset.id];
    const entry = state.maps.mapHome;
    if (!m || !entry) return;
    $$('.rec.sel').forEach(x => x.classList.remove('sel'));
    card.classList.add('sel');
    window.scrollTo({ top: $('#mapHome').getBoundingClientRect().top + window.scrollY - 70, behavior: 'smooth' });
    entry.map.flyTo(m.getLatLng(), 13, { duration: .6 });
    setTimeout(() => m.openPopup(), 650);
  });

  // Anything with data-open="stamps" etc. jumps to that tab
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-open]');
    if (!b) return;
    switchView(b.dataset.open);
    if (b.id === 'routeStrip' && state.tourist?.voucher?.status === 'UNLOCKED') {
      setTimeout(() => $('#voucher').scrollIntoView({ behavior: 'smooth', block: 'center' }), 350);
    }
  });

  $('#qsDiet').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    b.classList.toggle('on');
    saveQuickDiet();
  });
  $('#qsDone').addEventListener('click', () => {
    storeSet(qsKey(), '1');
    $('#quickStart').classList.add('hidden');
    toast('All set. Enjoy Jeju 🍊', 'good');
  });

  $('#btnLocate').addEventListener('click', async () => {
    const pos = await shareLocation();
    if (pos) { $('#recWhy').textContent = 'sorted by what is near you'; loadRecs(); }
  });
  $('#btnShareLoc').addEventListener('click', async () => {
    await shareLocation();
    await loadTourist({ celebrate: false });
    renderSosMap();
    renderHelp();
  });

  $('#helpList').addEventListener('click', e => {
    const item = e.target.closest('.help-item');
    if (!item || e.target.closest('a')) return;
    state.maps.mapSos?.map.flyTo([+item.dataset.lat, +item.dataset.lng], 14, { duration: .6 });
    window.scrollTo({ top: $('#mapSos').getBoundingClientRect().top + window.scrollY - 70, behavior: 'smooth' });
  });

  $('#btnEdit').addEventListener('click', openEdit);
  $('#btnSave').addEventListener('click', saveProfile);
  $('#dietPicks').addEventListener('click', e => { const b = e.target.closest('button'); if (b) b.classList.toggle('on'); });

  $$('.sheet-backdrop').forEach(s => s.addEventListener('click', e => {
    if (e.target === s || e.target.closest('[data-close]')) closeSheets();
  }));

  setupHold();
  $('#btnSosCancel').addEventListener('click', async () => {
    if (!activeSos) return;
    try { await api('/api/sos/cancel', { alertId: activeSos.alertId, reason: 'Tourist is OK' }); renderSos(null); toast('SOS cancelled. Glad you are OK 💚', 'good'); }
    catch (e) { toast(e.message, 'warn'); }
  });

  $('#btnRedeem').addEventListener('click', () => { $('#inPin').value = ''; openSheet('#sheetRedeem'); setTimeout(() => $('#inPin').focus(), 250); });
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
    renderUv();
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
  $('#demoTaps').innerHTML = cfg.stations.map(s => `<button class="btn small ${s.kind === 'place' ? 'sea' : s.kind === 'activity' ? 'leaf' : ''}" data-tap="${s.id}">${cfg.kinds[s.kind].emoji} Tap ${esc(cfg.kinds[s.kind].label)}</button>`).join('');
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
    await loadRecs();
    startSync();
    autoLocate();
    const start = location.hash.replace('#', '');
    if (['sos', 'stamps', 'me'].includes(start)) switchView(start);
  } catch (e) {
    setLive(false, 'Offline');
    toast(`Could not reach server: ${e.message}`, 'warn');
  }
})();
