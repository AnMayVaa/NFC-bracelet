// Jeju wish-band · tourist app
// Works from a tag URL (/04DBCE42CA2A81) or ?uid=BEAD_001. Text lives in i18n.js.

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
      const o = ctx.createOscillator(), g = ctx.createGain(), at = ctx.currentTime + i * .11;
      o.type = type === 'voucher' ? 'triangle' : 'sine';
      o.frequency.setValueAtTime(f, at);
      g.gain.setValueAtTime(.22, at);
      g.gain.exponentialRampToValueAtTime(.001, at + .35);
      o.connect(g).connect(ctx.destination);
      o.start(at); o.stop(at + .35);
    });
  } catch (_) {}
  if (navigator.vibrate) navigator.vibrate(type === 'voucher' ? [80, 40, 80, 40, 160] : [90, 50, 90]);
}

function timeAgo(iso) {
  if (!iso) return '';
  const s = Math.round((Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return t('ago.now');
  if (s < 3600) return t('ago.min', { n: Math.floor(s / 60) });
  if (s < 86400) return t('ago.h', { n: Math.floor(s / 3600) });
  return new Date(iso).toLocaleDateString(locale());
}

function haversine(a, b) {
  const R = 6371, r = x => x * Math.PI / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const directionsUrl = p => `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`;
const mapSearchUrl = q => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;

// Countries: names in the current UI language, flags from the ISO code
const flagOf = code => code && /^[A-Z]{2}$/.test(code)
  ? String.fromCodePoint(...[...code].map(c => 0x1F1E6 + c.charCodeAt(0) - 65)) : '🌏';
function countryName(code, lang = locale()) {
  if (!code) return '';
  try { return new Intl.DisplayNames([lang], { type: 'region' }).of(code); } catch (_) { return code; }
}
function languageName(english) {
  const map = { English: 'en', Korean: 'ko', Chinese: 'zh', Japanese: 'ja', Thai: 'th', Vietnamese: 'vi', Indonesian: 'id', Malay: 'ms',
    Filipino: 'fil', Spanish: 'es', French: 'fr', German: 'de', Russian: 'ru', Arabic: 'ar', Hindi: 'hi', Portuguese: 'pt', Italian: 'it', Mongolian: 'mn' };
  const code = map[english];
  if (!code) return english || '';
  try { return new Intl.DisplayNames([locale()], { type: 'language' }).of(code); } catch (_) { return english; }
}
const SPOKEN = ['English', 'Korean', 'Chinese', 'Japanese', 'Thai', 'Vietnamese', 'Indonesian', 'Malay', 'Filipino', 'Mongolian',
  'Hindi', 'Arabic', 'Russian', 'Spanish', 'Portuguese', 'French', 'German', 'Italian', 'Other'];

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
  weather: null,
  adviceKey: null,
  route: null,         // road geometry for the stamp route
  maps: {},            // id -> { map, layer }
  recMarkers: {}
};

const DIET_TAGS = ['Halal', 'Vegan', 'Vegetarian', 'No Shellfish', 'Gluten-Free'];
const INTEREST_ICONS = { nature: '🌋', food: '🍊', culture: '🗿', activity: '🤿', market: '🛍️', cafe: '☕' };
const MOBILITY = [{ v: 'none', i: '🚶' }, { v: 'limited', i: '🦯' }, { v: 'wheelchair', i: '♿' }];
const interestLabel = k => `${INTEREST_ICONS[k] || '✨'} ${t(`int.${k}`)}`;
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

const dietLabel = d => (DIET_TAGS.includes(d) ? t(`diet.${d}`) : d);
function translateReason(r) {
  const km = /^([\d.]+) km away$/.exec(r);
  if (km) return t('reason.km', { km: km[1] });
  const key = `reason.${r}`;
  const out = t(key);
  return out === key ? r : out;
}

// ------------------------------------------------------------------ maps
function getMap(id) {
  if (state.maps[id]) return state.maps[id];
  const el = document.getElementById(id);
  if (!window.L) {
    el.innerHTML = `<div class="empty"><div class="big">🗺️</div>${esc(t('map.fail'))}</div>`;
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
    .addTo(entry.layer).bindPopup(state.origin ? t('map.you') : t('map.lastTap'));
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
        <small>${esc((r.reasons || []).map(translateReason).join(' · '))}</small>
        <button class="btn small" data-go="${esc(r.id)}">${esc(t('map.directions'))}</button></div>`);
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
      .bindPopup(`<div class="pop"><b>${esc(h.name)}</b><a class="btn small sea" href="tel:${esc(h.phone)}">${esc(t('help.call'))} ${esc(h.phone)}</a></div>`);
    return [h.lat, h.lng];
  });
  const me = addMe(entry);
  if (me) pts.push(me);
  fit(entry, pts);
}

function nextStation() {
  const cfg = state.config, tr = state.tourist;
  return [...cfg.stations].sort((a, b) => a.order - b.order).find(s => !tr?.stamps?.[s.id]) || null;
}

async function loadRoute() {
  try { state.route = await api('/api/route'); } catch (_) { state.route = null; }
  if (state.maps.mapStamps) renderStampsMap();
}

function renderStampsMap() {
  const entry = getMap('mapStamps');
  if (!entry) return;
  entry.layer.clearLayers();
  const cfg = state.config, tr = state.tourist;
  const ordered = [...cfg.stations].sort((a, b) => a.order - b.order);
  const next = nextStation();
  const road = state.route && state.route.source !== 'straight' && state.route.coordinates?.length > 2;
  const line = road ? state.route.coordinates : ordered.map(s => [s.lat, s.lng]);
  // white casing under the orange line keeps it readable on any tile colour
  L.polyline(line, { color: '#fff', weight: road ? 8 : 6, opacity: .85, lineCap: 'round', lineJoin: 'round' }).addTo(entry.layer);
  L.polyline(line, road
    ? { color: '#F28C38', weight: 4.5, opacity: .95, lineCap: 'round', lineJoin: 'round' }
    : { color: '#F28C38', weight: 4, opacity: .8, dashArray: '2 10', lineCap: 'round' }).addTo(entry.layer);
  $('#routeNote').textContent = road
    ? `🛣️ ${t('map.road')}${state.route.distanceKm ? ` · ${state.route.distanceKm} km` : ''}`
    : `↔️ ${t('map.straight')}`;

  const pts = ordered.map(s => {
    const k = cfg.kinds[s.kind];
    const done = tr?.stamps?.[s.id];
    L.marker([s.lat, s.lng], { icon: pin(done ? '✅' : k.emoji, done ? '#9AA39B' : k.color, next?.id === s.id ? 'pulse' : '') }).addTo(entry.layer)
      .bindPopup(`<div class="pop"><b>${esc(s.name)}</b><span>${esc(s.name_ko)}</span>
        <small>${esc(t('stamps.station', { kind: t(`kind.${s.kind}`) }))} · ${esc(done ? t('stamps.stamped') : t('stamps.notYet'))}</small>
        <a class="btn small" target="_blank" rel="noopener" href="${directionsUrl(s)}">${esc(t('map.directions'))}</a></div>`);
    return [s.lat, s.lng];
  });
  const me = addMe(entry);
  if (me) pts.push(me);
  fit(entry, road ? pts.concat(line.filter((_, i) => i % 20 === 0)) : pts);

  const box = $('#nextStop');
  if (!next) {
    box.innerHTML = `<span class="e">🎉</span><div><b>${esc(t('stamps.complete'))}</b><div class="muted">${esc(t('stamps.completeSub'))}</div></div>`;
  } else {
    const here = myPosition();
    const d = here ? haversine(here, next) : null;
    box.innerHTML = `<span class="e">${cfg.kinds[next.kind].emoji}</span>
      <div style="flex:1;min-width:0"><b>${esc(t('stamps.next', { name: next.name }))}</b><div class="muted">${esc(next.blurb || '')}${d != null ? ` · ${d.toFixed(1)} km` : ''}</div></div>
      <a class="btn small" target="_blank" rel="noopener" href="${directionsUrl(next)}">${esc(t('picks.go'))}</a>`;
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

// ------------------------------------------------------------------ profile (hero + Me tab)
const isGuestName = n => !n || /^Wish-band Guest/.test(n);

function renderProfile() {
  const tr = state.tourist;
  if (!tr) return;
  const first = isGuestName(tr.name) ? t('greet.traveler') : tr.name.split(/[\s(]/)[0];
  $('#greetName').textContent = t('greet.hello', { name: first });
  $('#uidTag').textContent = `wish-band ${tr.uid}`;

  const code = tr.countryCode;
  $('#meFlag').textContent = code ? flagOf(code) : '🧳';
  $('#meName').textContent = isGuestName(tr.name) ? t('greet.traveler') : tr.name;
  $('#meFrom').textContent = [code ? countryName(code) : '', tr.language ? t('me.speaks', { lang: languageName(tr.language) }) : '']
    .filter(Boolean).join(' · ');
  $('#meUid').textContent = tr.uid;
  $('#meCountry').innerHTML = code ? `<span class="flag">${flagOf(code)}</span> ${esc(countryName(code))}` : `<span class="muted">${esc(t('me.unknownCountry'))}</span>`;

  const diets = String(tr.dietary || '').split(',').map(s => s.trim()).filter(s => s && s.toLowerCase() !== 'none');
  $('#meDiet').innerHTML = diets.length
    ? diets.map(d => `<span class="chip tan">${esc(dietLabel(d))}</span>`).join('')
    : `<span class="chip leaf">${esc(t('me.noDiet'))}</span>`;

  const ints = tr.interests || [];
  $('#meInterests').innerHTML = ints.length
    ? ints.map(k => `<span class="chip sea">${esc(interestLabel(k))}</span>`).join('')
    : `<button class="btn ghost small" data-act="edit">${esc(t('me.addInterests'))}</button>`;
  const mob = MOBILITY.find(m => m.v === (tr.mobility || 'none'));
  $('#meHealth').innerHTML = `<span class="chip ${mob.v === 'none' ? 'leaf' : 'tan'}">${mob.i} ${esc(t(`mob.${mob.v}`))}</span>`
    + (tr.medicalNotes ? `<span class="chip warn-chip">🩺 ${esc(tr.medicalNotes)}</span>` : `<span class="chip">🩺 ${esc(t('me.noMedical'))}</span>`);

  // Emergency contact card
  const phone = tr.emergencyContact;
  $('#meContact').innerHTML = phone
    ? `<div class="lbl">🆘 ${esc(t('me.emergency'))}</div>
       <div class="contact-row">
         <div class="avatar-sm">${esc((tr.emergencyName || '☎').slice(0, 1).toUpperCase())}</div>
         <div style="flex:1;min-width:0">
           <div class="nm">${esc(tr.emergencyName || t('me.emergency'))}${tr.emergencyRelation ? ` <span class="chip">${esc(relLabel(tr.emergencyRelation))}</span>` : ''}</div>
           <div class="mono muted">${esc(phone)}</div>
         </div>
         <a class="btn small sea" href="tel:${esc(phone.replace(/[^\d+]/g, ''))}">📞 ${esc(t('me.call'))}</a>
       </div>`
    : `<div class="lbl">🆘 ${esc(t('me.emergency'))}</div><button class="btn ghost block small" data-act="edit">${esc(t('me.addContact'))}</button>`;

  const loc = tr.lastLocation;
  $('#lastLoc').textContent = loc
    ? (loc.source === 'station' ? t('loc.seenAt', { place: stationName(loc.station), ago: timeAgo(loc.timestamp) }) : t('loc.seenGps', { ago: timeAgo(loc.timestamp) }))
    : t('loc.none');
  renderEmbassy();
}

function relLabel(rel) {
  const key = { Family: 'rel.family', Partner: 'rel.partner', Friend: 'rel.friend', 'Travel buddy': 'rel.buddy', Other: 'rel.other' }[rel];
  return key ? t(key) : rel;
}

// Embassy / consulate for the tourist's nationality: a live map search keeps address and phone current.
function renderEmbassy() {
  const box = $('#embassyCard');
  if (!box || !state.config) return;
  const code = state.tourist?.countryCode;
  if (!code) { box.innerHTML = `<p class="muted small-p">${esc(t('sos.embassySet'))}</p>`; return; }
  if (code === 'KR') { box.innerHTML = `<p class="small-p"><b>${flagOf(code)}</b> ${esc(t('sos.home'))}</p>`; return; }
  const en = countryName(code, 'en');
  const consulate = state.config.jejuConsulates?.[code];
  const office = consulate || `Embassy of ${en} in Seoul`;
  box.innerHTML = `<div class="emb-row">
      <span class="flag big">${flagOf(code)}</span>
      <div style="flex:1;min-width:0"><b>${esc(office)}</b><div class="muted small-p">${esc(t('sos.embassyHint'))}</div></div>
    </div>
    <div class="emb-acts">
      <a class="btn small sea" target="_blank" rel="noopener" href="${mapSearchUrl(office)}">🗺️ ${esc(t('sos.embassyFind'))}</a>
      ${consulate ? `<a class="btn small ghost" target="_blank" rel="noopener" href="${mapSearchUrl(`Embassy of ${en} in Seoul`)}">🏛️ Seoul</a>` : ''}
      <a class="btn small ghost" href="tel:1330">📞 1330</a>
    </div>`;
}

// ------------------------------------------------------------------ stamps + voucher
function renderStamps(justStamped = []) {
  const tr = state.tourist, cfg = state.config;
  if (!tr || !cfg) return;
  $('#stamps').innerHTML = cfg.stations.map(s => {
    const on = tr.stamps?.[s.id];
    const k = cfg.kinds[s.kind];
    return `<div class="stamp ${s.kind} ${on ? 'on' : ''} ${justStamped.includes(s.id) ? 'just' : ''}">
      <div class="ring">${k.emoji}</div>
      <div class="kind">${esc(t(`kind.${s.kind}`))}</div>
      <div class="name">${esc(s.name)}</div>
    </div>`;
  }).join('');
  const got = cfg.stations.filter(s => tr.stamps?.[s.id]).length;
  $('#progressBar').style.width = `${(got / cfg.stations.length) * 100}%`;
  $('#progressText').textContent = t('stamps.count', { got, total: cfg.stations.length });
  $('.nav [data-view="stamps"] .i').textContent = got === cfg.stations.length ? '🎉' : '🗿';

  const history = [...(tr.checkinHistory || [])].reverse().slice(0, 12);
  $('#timeline').innerHTML = history.length
    ? history.map(h => `<li><span>${cfg.kinds[h.kind]?.emoji || '📍'}</span>${esc(stationName(h.station))}${h.visitSequence > 1 ? ` <span class="chip">${esc(t('trail.visit', { n: h.visitSequence }))}</span>` : ''}<span class="t">${timeAgo(h.timestamp)}</span></li>`).join('')
    : `<li class="muted">${esc(t('trail.empty'))}</li>`;

  renderVoucher();
  renderRouteStrip();
  if (state.maps.mapStamps) renderStampsMap();
}

// Small progress bar on For You so nobody has to open Stamps to know what's next.
function renderRouteStrip() {
  const tr = state.tourist, cfg = state.config;
  const ordered = [...cfg.stations].sort((a, b) => a.order - b.order);
  const got = ordered.filter(s => tr.stamps?.[s.id]).length;
  const v = tr.voucher?.status;
  const next = nextStation();
  $('#routeBeads').innerHTML = ordered.map(s => `<i class="${tr.stamps?.[s.id] ? 'on' : ''}">${cfg.kinds[s.kind].emoji}</i>`).join('');
  $('#routeStrip').classList.toggle('ready', v === 'UNLOCKED');
  if (v === 'UNLOCKED') {
    $('#routeTitle').textContent = t('route.ready');
    $('#routeSub').textContent = t('route.readySub');
  } else if (v === 'REDEEMED') {
    $('#routeTitle').textContent = t('route.done');
    $('#routeSub').textContent = t('route.doneSub');
  } else {
    $('#routeTitle').textContent = t('route.title', { got, total: ordered.length });
    $('#routeSub').textContent = got === 0 ? t('route.sub0') : next ? t('route.next', { name: next.name }) : t('route.all');
  }
}

function renderVoucher() {
  const v = state.tourist?.voucher || { status: 'LOCKED' };
  const box = $('#voucher');
  box.classList.toggle('unlocked', v.status === 'UNLOCKED');
  box.classList.toggle('used', v.status === 'REDEEMED' || v.status === 'EXPIRED');
  const qr = $('#voucherQr');
  const btn = $('#btnRedeem');
  const fmtDate = iso => new Date(iso || Date.now()).toLocaleDateString(locale());
  if (v.status === 'UNLOCKED') {
    $('#voucherBadge').textContent = t('voucher.ready');
    $('#voucherCode').textContent = v.code;
    $('#voucherDesc').textContent = t('voucher.validUntil', { date: fmtDate(v.expiresAt) });
    qr.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=0&data=${encodeURIComponent(v.code)}`;
    qr.classList.remove('hidden');
    btn.disabled = false;
    btn.textContent = t('voucher.show');
  } else if (v.status === 'REDEEMED') {
    $('#voucherBadge').textContent = t('voucher.used');
    $('#voucherCode').textContent = v.code || 'USED';
    $('#voucherDesc').textContent = t('voucher.usedDesc', { date: fmtDate(v.redeemedAt) });
    qr.classList.add('hidden');
    btn.disabled = true;
    btn.textContent = t('voucher.usedBtn');
  } else if (v.status === 'EXPIRED') {
    $('#voucherBadge').textContent = t('voucher.expired');
    qr.classList.add('hidden');
    btn.disabled = true;
    btn.textContent = t('voucher.expired');
  } else {
    const got = Object.values(state.tourist?.stamps || {}).filter(Boolean).length;
    $('#voucherBadge').textContent = t('voucher.locked', { got, total: state.config?.stations.length || 3 });
    $('#voucherCode').textContent = '•••• •••• ••••';
    $('#voucherDesc').textContent = t('voucher.lockedDesc');
    qr.classList.add('hidden');
    btn.disabled = true;
    btn.textContent = t('voucher.lockedBtn');
  }
}

// ------------------------------------------------------------------ weather + picks
function renderWeather() {
  const w = state.weather;
  if (!w) return;
  const label = t(`wx.${w.label}`);
  $('#wxPillEmoji').textContent = w.emoji;
  $('#wxPillTemp').textContent = `${w.tempC}°`;
  $('#wxPillUv').textContent = ` · UV ${w.uv}`;
  $('#wxEmoji').textContent = w.emoji;
  $('#wxTemp').textContent = `${w.tempC}°C`;
  $('#wxLabel').textContent = ` ${label}${w.source === 'fallback' ? ` (${t('wx.estimate')})` : ''}`;
  const stat = (icon, text, warn) => `<span class="${warn ? 'warn' : ''}">${icon} ${esc(text)}</span>`;
  $('#wxStats').innerHTML = [
    stat('☔', t('wx.rain', { p: w.rainChance }), w.rainy),
    stat('💨', t('wx.wind', { w: w.windKmh }), w.windy),
    stat('🕶️', t('wx.uv', { uv: w.uv }), w.uv >= 6)
  ].join('');
  $('#wxCard').classList.toggle('rainy', !!w.rainy);
  $('#wxAdvice').textContent = t(`advice.${state.adviceKey || 'unknown'}`, { wind: w.windKmh, temp: w.tempC });
}

function renderRecs(data) {
  if (data) {
    state.recs = data.recommendations || [];
    if (data.weather) state.weather = data.weather;
    state.adviceKey = data.adviceKey || state.adviceKey;
    renderWeather();
  }
  renderHomeMap();
  const list = $('#recList');
  if (!state.recs.length) {
    list.innerHTML = `<div class="empty"><div class="big">🌿</div>${esc(t('picks.empty'))}</div>`;
    return;
  }
  list.innerHTML = state.recs.slice(0, 8).map((r, i) => recCard(r, i)).join('');
}

// One For You card: real photo (credited) or the emoji, plus website / map / about links.
function recCard(r, i) {
  const chipTone = r.category === 'food' ? 'tan' : r.category === 'place' ? 'sea' : 'leaf';
  const ph = r.photo;
  const pic = ph
    ? `<div class="ph ${i === 0 ? 'wide' : ''}"><img src="${esc(ph.src)}" alt="${esc(r.title)}" loading="lazy" data-emoji="${esc(r.emoji || '📍')}"><span class="rank">${i + 1}</span></div>`
    : `<div class="ico ${r.category}">${r.emoji || '📍'}<span class="rank">${i + 1}</span></div>`;
  const link = r.link || { kind: 'map', url: mapSearchUrl(`${r.title} Jeju`) };
  const about = r.info || ph?.article;
  return `
    <div class="rec ${i === 0 ? 'top' : ''} ${ph ? 'has-ph' : ''} ${ph && i === 0 ? 'big' : ''}" data-id="${esc(r.id)}" tabindex="0">
      ${pic}
      <div class="body">
        ${i === 0 ? `<div class="badge-top">${esc(t('picks.best'))}</div>` : ''}
        <div class="title">${esc(r.title)} <span class="ko">${esc(r.title_ko || '')}</span></div>
        <div class="note">${esc(r.note || '')}</div>
        <div class="reasons">${(r.reasons || []).slice(0, i === 0 ? 3 : 2).map(x => `<span class="chip ${chipTone}">${esc(translateReason(x))}</span>`).join('')}</div>
        <div class="rec-links">
          <a class="lnk" target="_blank" rel="noopener" href="${esc(link.url)}" data-open-link="${esc(r.id)}">${link.kind === 'website' ? '🌐 ' + esc(t('picks.website')) : '🗺️ ' + esc(t('picks.map'))}</a>
          ${about ? `<a class="lnk" target="_blank" rel="noopener" href="${esc(about)}" data-open-link="${esc(r.id)}">ℹ️ ${esc(t('picks.about'))}</a>` : ''}
        </div>
        ${ph ? `<a class="credit" target="_blank" rel="noopener" href="${esc(ph.page)}">📷 ${esc(ph.author)} · ${esc(ph.license)}</a>` : ''}
      </div>
      <button class="btn small go" data-go="${esc(r.id)}" aria-label="${esc(t('map.directions'))}">${esc(t('picks.go'))}</button>
    </div>`;
}

// ------------------------------------------------------------------ data loading
async function loadTourist({ celebrate = true } = {}) {
  const before = state.tourist;
  const tr = await api(`/api/tourist/${encodeURIComponent(state.uid)}`);
  state.tourist = tr;

  const newStamps = before ? Object.keys(tr.stamps || {}).filter(k => tr.stamps[k] && !before.stamps?.[k]) : [];
  const voucherJustUnlocked = before && before.voucher?.status === 'LOCKED' && tr.voucher?.status === 'UNLOCKED';

  renderProfile();
  if (!before || JSON.stringify(before.stamps) !== JSON.stringify(tr.stamps) || before.voucher?.status !== tr.voucher?.status
      || (before.checkinHistory || []).length !== (tr.checkinHistory || []).length) renderStamps(newStamps);
  renderSos(tr.activeSos);

  if (celebrate && newStamps.length) {
    chime(voucherJustUnlocked ? 'voucher' : 'stamp');
    toast(voucherJustUnlocked ? t('toast.allStamps') : t('toast.newStamp', { name: stationName(newStamps[0]) }), 'good');
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
    $('#recList').innerHTML = `<div class="empty"><div class="big">📡</div>${esc(t('picks.error'))}<br>${esc(e.message)}</div>`;
  }
}

function storeGet(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }
function storeSet(k, v) { try { localStorage.setItem(k, v); } catch (_) {} }

// ------------------------------------------------------------------ first use: interests, health, emergency contact
const ob = { step: 1, interests: new Set(), mobility: null };

function showOnboarding() {
  const tr = state.tourist;
  ob.step = 1;
  ob.interests = new Set(tr.interests || []);
  ob.mobility = tr.onboardedAt ? (tr.mobility || 'none') : null;
  const code = tr.countryCode || '';
  $('#obName').value = isGuestName(tr.name) ? '' : tr.name;
  $('#obCountry').innerHTML = countryOptions(code);
  $('#obSosName').value = tr.emergencyName || '';
  $('#obSosRel').value = tr.emergencyRelation || 'Family';
  const ph = splitPhone(tr.emergencyContact, code || 'KR');
  $('#obDial').innerHTML = dialOptions(ph.code || code || 'KR');
  $('#obSos').value = ph.number;
  const parts = String(tr.dietary || '').split(',').map(x => x.trim()).filter(x => x && x.toLowerCase() !== 'none');
  ob.diet = new Set(parts.filter(p => DIET_TAGS.includes(p)));
  $('#obDietOther').value = parts.filter(p => !DIET_TAGS.includes(p)).join(', ');
  $('#obMedical').value = tr.medicalNotes || '';
  renderOnboarding();
  $('#onboard').classList.remove('hidden');
  document.body.classList.add('no-scroll');
}

function renderOnboarding() {
  const root = $('#onboard');
  applyI18n(root);
  $('#obLangShort').textContent = LANG.toUpperCase();
  const keys = state.config?.interests || Object.keys(INTEREST_ICONS);
  $('#obInterests').innerHTML = keys.map(k => `<button type="button" data-int="${k}" class="${ob.interests.has(k) ? 'on' : ''}" aria-pressed="${ob.interests.has(k)}">
      <span class="ob-ic">${INTEREST_ICONS[k] || '✨'}</span><b>${esc(t(`int.${k}`))}</b><small>${esc(t(`int.${k}.sub`))}</small></button>`).join('');
  $('#obMobility').innerHTML = MOBILITY.map(m => `<button type="button" data-mob="${m.v}" class="${ob.mobility === m.v ? 'on' : ''}" aria-pressed="${ob.mobility === m.v}">
      <span class="ob-ic">${m.i}</span>${esc(t(`mob.${m.v}`))}</button>`).join('');
  $('#obDiet').innerHTML = DIET_TAGS.map(d => `<button type="button" data-diet="${d}" class="${ob.diet.has(d) ? 'on' : ''}">${esc(dietLabel(d))}</button>`).join('');
  $$('#onboard .ob-step').forEach(sec => sec.classList.toggle('on', +sec.dataset.step === ob.step));
  $$('#obDots i').forEach((d, n) => d.classList.toggle('on', n < ob.step));
  $('#obBack').style.visibility = ob.step === 1 ? 'hidden' : 'visible';
  $('#obNext').textContent = t(ob.step === 3 ? 'ob.finish' : 'ob.next');
  $('#obErr').textContent = '';
}

function obError(key) { $('#obErr').textContent = t(key); }

async function onboardNext() {
  if (ob.step === 1 && !ob.interests.size) return obError('ob.errInterests');
  if (ob.step === 2 && !ob.mobility) return obError('ob.errMobility');
  if (ob.step < 3) { ob.step++; renderOnboarding(); $('#onboard').scrollTop = 0; return; }

  const country = $('#obCountry').value;
  const number = $('#obSos').value.replace(/[^\d]/g, '').replace(/^0+/, '');
  const dial = state.config.dialCodes[$('#obDial').value];
  if (!country) return obError('ob.errCountry');
  if (!number) return obError('ob.errPhone');
  if (number.length + dial.length < 6 || number.length + dial.length > 15) return obError('edit.badPhone');
  const other = $('#obDietOther').value.split(',').map(x => x.trim()).filter(Boolean);
  const name = $('#obName').value.trim();
  $('#obNext').disabled = true;
  try {
    const r = await api('/api/register', {
      uid: state.uid,
      ...(name ? { name } : {}),
      countryCode: country,
      interests: [...ob.interests],
      mobility: ob.mobility,
      dietary: [...ob.diet, ...other].join(', ') || 'None',
      medicalNotes: $('#obMedical').value.trim(),
      emergencyContact: `+${dial} ${number}`,
      emergencyName: $('#obSosName').value.trim(),
      emergencyRelation: $('#obSosRel').value,
      onboarded: true
    });
    state.tourist = { ...state.tourist, ...r.tourist };
    $('#onboard').classList.add('hidden');
    document.body.classList.remove('no-scroll');
    renderProfile();
    toast(t('ob.done'), 'good');
    loadRecs();
  } catch (e) {
    $('#obErr').textContent = e.message;
  } finally {
    $('#obNext').disabled = false;
  }
}

// ------------------------------------------------------------------ live sync
function setLive(on, key) {
  $('#live').classList.toggle('on', on);
  $('#liveText').dataset.i18n = key;
  $('#liveText').textContent = t(key);
}

let pollTimer = null;
function startPolling() {
  if (pollTimer) return;
  setLive(true, 'live.on');
  pollTimer = setInterval(() => loadTourist().then(() => setLive(true, 'live.on')).catch(() => setLive(false, 'live.off')), 2500);
}

function startSync() {
  if (location.hostname.endsWith('vercel.app')) return startPolling();
  try {
    const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`);
    ws.onopen = () => setLive(true, 'live.on');
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
  $('#hotlines').innerHTML = cfg.hotlines.map(h => `<a class="hotline" href="tel:${esc(h.number)}"><b>${esc(h.number)}</b><span>${esc(t(`hl.${h.number}`) === `hl.${h.number}` ? h.label : t(`hl.${h.number}`))}</span></a>`).join('');
  const origin = myPosition();
  const dist = h => origin ? haversine(origin, h) : null;
  const items = [...cfg.helpPoints].sort((a, b) => (dist(a) ?? 0) - (dist(b) ?? 0));
  $('#helpList').innerHTML = items.map(h => {
    const d = dist(h);
    return `<div class="help-item" data-lat="${h.lat}" data-lng="${h.lng}"><span class="e">${HELP_ICONS[h.type] || '🆘'}</span>
      <div style="flex:1;min-width:0"><div class="n">${esc(h.name)}</div><div class="d">${d != null ? d.toFixed(1) + ' km · ' : ''}${esc(t(`help.${h.type}`))}</div></div>
      <a class="icon-btn" href="${directionsUrl(h)}" target="_blank" rel="noopener" title="${esc(t('map.directions'))}">🧭</a>
      <a class="btn small sea" href="tel:${esc(h.phone)}">${esc(t('help.call'))}</a></div>`;
  }).join('');
  renderEmbassy();
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
    (activeSos.status === 'DISPATCHED' ? t('sos.coming', { who: activeSos.responder || t('sos.rescue'), eta: activeSos.etaMinutes ? t('sos.eta', { m: activeSos.etaMinutes }) : '' }) : '') +
    (loc ? t('sos.locSent', { src: loc.source === 'phone' ? t('sos.srcPhone') : t('sos.srcTap') }) : t('sos.noLoc'));
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
  toast(t('sos.sending'), 'warn');
  let pos = null;
  try { pos = await getPosition(); } catch (_) {}
  try {
    const r = await api('/api/sos', {
      uid: state.uid, note: $('#sosNote').value.trim() || undefined,
      latitude: pos?.lat, longitude: pos?.lng, accuracy: pos?.accuracy
    });
    renderSos(r.alert);
    toast(t('sos.sent'), 'good');
  } catch (e) {
    toast(t('sos.failed', { e: e.message }), 'warn');
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
    toast(t('loc.saved'), 'good');
    return pos;
  } catch (e) {
    toast(t('loc.err', { e: e.message }), 'warn');
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
    $('#recWhy').dataset.i18n = 'picks.near';
    $('#recWhy').textContent = t('picks.near');
    loadRecs();
  } catch (_) {}
}

// ------------------------------------------------------------------ profile editing
function openSheet(id) { $(id).classList.add('open'); }
function closeSheets() { $$('.sheet-backdrop').forEach(s => s.classList.remove('open')); }

function countryOptions(selected) {
  const dial = state.config?.dialCodes || {};
  const codes = Object.keys(dial).sort((a, b) => countryName(a).localeCompare(countryName(b), locale()));
  return `<option value="">${esc(t('edit.pick'))}</option>` +
    codes.map(c => `<option value="${c}" ${c === selected ? 'selected' : ''}>${flagOf(c)} ${esc(countryName(c))}</option>`).join('');
}

function dialOptions(selected) {
  const dial = state.config?.dialCodes || {};
  return Object.keys(dial).sort((a, b) => countryName(a).localeCompare(countryName(b), locale()))
    .map(c => `<option value="${c}" ${c === selected ? 'selected' : ''}>${flagOf(c)} +${dial[c]}</option>`).join('');
}

// "+66 812345678" -> { code: 'TH', number: '812345678' }
function splitPhone(phone, fallbackCode) {
  const dial = state.config?.dialCodes || {};
  const m = /^\+(\d{1,4})\s*(.*)$/.exec(String(phone || '').trim());
  if (!m) return { code: fallbackCode, number: phone || '' };
  const digits = m[1] + m[2].replace(/\D/g, '');
  // longest matching calling code wins; prefer the tourist's own country on ties (e.g. +1)
  let best = null;
  for (const [c, d] of Object.entries(dial)) {
    if (digits.startsWith(d) && (!best || d.length > dial[best].length || (d.length === dial[best].length && c === fallbackCode))) best = c;
  }
  if (!best) return { code: fallbackCode, number: phone };
  return { code: best, number: digits.slice(dial[best].length) };
}

function openEdit() {
  const tr = state.tourist;
  const code = tr.countryCode || '';
  $('#inName').value = isGuestName(tr.name) ? '' : tr.name;
  $('#inCountry').innerHTML = countryOptions(code);
  $('#inLang').innerHTML = SPOKEN.map(l => `<option value="${l}" ${l === (tr.language || 'English') ? 'selected' : ''}>${esc(l === 'Other' ? t('rel.other') : languageName(l))}</option>`).join('');
  $('#inSosName').value = tr.emergencyName || '';
  $('#inSosRel').value = tr.emergencyRelation || 'Family';
  const ph = splitPhone(tr.emergencyContact, code || 'KR');
  $('#inDial').innerHTML = dialOptions(ph.code || code || 'KR');
  $('#inSos').value = ph.number;
  const parts = String(tr.dietary || '').split(',').map(s => s.trim()).filter(s => s && s.toLowerCase() !== 'none');
  const known = DIET_TAGS.map(s => s.toLowerCase());
  $('#dietPicks').innerHTML = DIET_TAGS
    .map(d => `<button type="button" data-diet="${d}" class="${parts.some(p => p.toLowerCase() === d.toLowerCase()) ? 'on' : ''}">${esc(dietLabel(d))}</button>`).join('');
  $('#inDietOther').value = parts.filter(p => !known.includes(p.toLowerCase())).join(', ');
  const ints = new Set(tr.interests || []);
  $('#interestPicks').innerHTML = (state.config?.interests || Object.keys(INTEREST_ICONS))
    .map(k => `<button type="button" data-int="${k}" class="${ints.has(k) ? 'on' : ''}">${esc(interestLabel(k))}</button>`).join('');
  $('#inMobility').value = tr.mobility || 'none';
  $('#inMedical').value = tr.medicalNotes || '';
  applyI18n($('#sheetEdit'));
  openSheet('#sheetEdit');
}

async function saveProfile() {
  const picked = $$('#dietPicks .on').map(b => b.dataset.diet);
  const other = $('#inDietOther').value.split(',').map(s => s.trim()).filter(Boolean);
  const dietary = [...picked, ...other].join(', ') || 'None';
  const number = $('#inSos').value.replace(/[^\d]/g, '').replace(/^0+/, '');   // drop the trunk 0 for international format
  const dial = state.config.dialCodes[$('#inDial').value];
  const phone = number ? `+${dial} ${number}` : '';
  if (number && (number.length + dial.length < 6 || number.length + dial.length > 15)) return toast(t('edit.badPhone'), 'warn');
  const name = $('#inName').value.trim();
  $('#btnSave').disabled = true;
  try {
    const r = await api('/api/register', {
      uid: state.uid,
      ...(name ? { name } : {}),
      countryCode: $('#inCountry').value,
      language: $('#inLang').value, dietary,
      interests: $$('#interestPicks .on').map(b => b.dataset.int),
      mobility: $('#inMobility').value,
      medicalNotes: $('#inMedical').value.trim(),
      emergencyContact: phone, emergencyName: $('#inSosName').value.trim(), emergencyRelation: $('#inSosRel').value
    });
    state.tourist = { ...state.tourist, ...r.tourist };
    renderProfile();
    closeSheets();
    toast(t('edit.saved'), 'good');
    loadRecs();
    if (other.length) toast(t('edit.strict'));
  } catch (e) {
    toast(e.message, 'warn');
  } finally {
    $('#btnSave').disabled = false;
  }
}

// ------------------------------------------------------------------ language + theme
function renderSettings() {
  $('#langShort').textContent = LANG.toUpperCase();
  $('#langSeg').innerHTML = LANGS.map(l => `<button data-lang="${l.code}" class="${l.code === LANG ? 'on' : ''}">${esc(l.label)}</button>`).join('');
  $('#langList').innerHTML = LANGS.map(l => `<button data-lang="${l.code}" class="${l.code === LANG ? 'on' : ''}">${esc(l.label)}</button>`).join('');
  const theme = document.documentElement.dataset.theme;
  $$('#themeSeg button').forEach(b => b.classList.toggle('on', b.dataset.themeBtn === theme));
  $('#btnTheme').textContent = theme === 'dark' ? '☀️' : '🌙';
}

// Re-draw everything that holds translated text
function rerenderAll() {
  applyI18n();
  renderSettings();
  if (!state.tourist || !state.config) return;
  renderProfile();
  renderStamps();
  renderSos(activeSos);
  if (!$('#onboard').classList.contains('hidden')) renderOnboarding();
  renderRecs();
  renderWeather();
  if (state.view === 'sos') renderHelp();
}

function changeLang(code) {
  setLang(code);
  closeSheets();
  rerenderAll();
}

function changeTheme(theme) {
  setTheme(theme);
  renderSettings();
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

  document.addEventListener('click', e => {
    // "Go" buttons in the list and in map popups
    const go = e.target.closest('[data-go]');
    if (go) { e.stopPropagation(); return openDirections(go.dataset.go); }
    // data-open="stamps" jumps to a tab
    const open = e.target.closest('[data-open]');
    if (open) {
      switchView(open.dataset.open);
      if (open.id === 'routeStrip' && state.tourist?.voucher?.status === 'UNLOCKED') {
        setTimeout(() => $('#voucher').scrollIntoView({ behavior: 'smooth', block: 'center' }), 350);
      }
      return;
    }
    const lang = e.target.closest('[data-lang]');
    if (lang) return changeLang(lang.dataset.lang);
    const th = e.target.closest('[data-theme-btn]');
    if (th) return changeTheme(th.dataset.themeBtn);
    if (e.target.closest('[data-act="edit"]')) return openEdit();
  });

  $('#btnLang').addEventListener('click', () => openSheet('#sheetLang'));
  $('#btnTheme').addEventListener('click', () => changeTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));

  // First-use questions
  $('#obInterests').addEventListener('click', e => {
    const b = e.target.closest('[data-int]'); if (!b) return;
    ob.interests.has(b.dataset.int) ? ob.interests.delete(b.dataset.int) : ob.interests.add(b.dataset.int);
    b.classList.toggle('on'); b.setAttribute('aria-pressed', b.classList.contains('on')); $('#obErr').textContent = '';
  });
  $('#obMobility').addEventListener('click', e => {
    const b = e.target.closest('[data-mob]'); if (!b) return;
    ob.mobility = b.dataset.mob;
    $$('#obMobility button').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); });
    $('#obErr').textContent = '';
  });
  $('#obDiet').addEventListener('click', e => {
    const b = e.target.closest('[data-diet]'); if (!b) return;
    ob.diet.has(b.dataset.diet) ? ob.diet.delete(b.dataset.diet) : ob.diet.add(b.dataset.diet);
    b.classList.toggle('on');
  });
  $('#obNext').addEventListener('click', onboardNext);
  $('#obBack').addEventListener('click', () => { if (ob.step > 1) { ob.step--; renderOnboarding(); } });
  $('#obLang').addEventListener('click', () => openSheet('#sheetLang'));
  $('#obCountry').addEventListener('change', () => { if (!$('#obSos').value.trim() && $('#obCountry').value) $('#obDial').value = $('#obCountry').value; });
  $('#interestPicks').addEventListener('click', e => { const b = e.target.closest('button'); if (b) b.classList.toggle('on'); });

  // A photo that fails to load turns back into the emoji tile
  $('#recList').addEventListener('error', e => {
    const img = e.target;
    if (img.tagName !== 'IMG') return;
    const box = img.closest('.ph'), card = img.closest('.rec');
    const r = state.recs.find(x => x.id === card?.dataset.id);
    if (!box || !r) return;
    card.classList.remove('has-ph', 'big');
    card.querySelector('.credit')?.remove();
    box.outerHTML = `<div class="ico ${r.category}">${esc(img.dataset.emoji)}<span class="rank">${box.querySelector('.rank')?.textContent || ''}</span></div>`;
  }, true);

  // Tap a card -> show it on the map
  $('#recList').addEventListener('click', e => {
    const card = e.target.closest('.rec[data-id]');
    const ext = e.target.closest('[data-open-link]');
    if (ext) { api('/api/recommendations/event', { uid: state.uid, itemId: ext.dataset.openLink, action: 'opened' }).catch(() => {}); return; }
    if (!card || e.target.closest('[data-go]') || e.target.closest('a')) return;
    const m = state.recMarkers[card.dataset.id];
    const entry = state.maps.mapHome;
    if (!m || !entry) return;
    $$('.rec.sel').forEach(x => x.classList.remove('sel'));
    card.classList.add('sel');
    window.scrollTo({ top: $('#mapHome').getBoundingClientRect().top + window.scrollY - 70, behavior: 'smooth' });
    entry.map.flyTo(m.getLatLng(), 13, { duration: .6 });
    setTimeout(() => m.openPopup(), 650);
  });

  $('#btnLocate').addEventListener('click', async () => {
    const pos = await shareLocation();
    if (pos) { $('#recWhy').dataset.i18n = 'picks.near'; $('#recWhy').textContent = t('picks.near'); loadRecs(); }
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
  // Picking a nationality also sets the phone country code when the number is still empty
  $('#inCountry').addEventListener('change', () => { if (!$('#inSos').value.trim() && $('#inCountry').value) $('#inDial').value = $('#inCountry').value; });

  $$('.sheet-backdrop').forEach(s => s.addEventListener('click', e => {
    if (e.target === s || e.target.closest('[data-close]')) closeSheets();
  }));

  setupHold();
  $('#btnSosCancel').addEventListener('click', async () => {
    if (!activeSos) return;
    try { await api('/api/sos/cancel', { alertId: activeSos.alertId, reason: 'Tourist is OK' }); renderSos(null); toast(t('sos.cancelled'), 'good'); }
    catch (e) { toast(e.message, 'warn'); }
  });

  $('#btnRedeem').addEventListener('click', () => { $('#inPin').value = ''; openSheet('#sheetRedeem'); setTimeout(() => $('#inPin').focus(), 250); });
  $('#btnConfirmRedeem').addEventListener('click', async () => {
    try {
      const r = await api('/api/redeem', { uid: state.uid, pin: $('#inPin').value });
      state.tourist = r.tourist;
      renderVoucher();
      renderRouteStrip();
      closeSheets();
      chime('voucher');
      toast(t('redeem.done'), 'good');
    } catch (e) { toast(e.message, 'warn'); }
  });
}

// ------------------------------------------------------------------ boot
(async function init() {
  applyI18n();
  renderSettings();
  bindEvents();
  try {
    state.config = await api('/api/config');
    await loadTourist({ celebrate: false });
    if (!state.tourist.onboardedAt) showOnboarding();
    await loadRecs();
    loadRoute();
    startSync();
    autoLocate();
    const start = location.hash.replace('#', '');
    if (['sos', 'stamps', 'me'].includes(start)) switchView(start);
  } catch (e) {
    setLive(false, 'live.off');
    toast(t('toast.server', { e: e.message }), 'warn');
  }
})();
