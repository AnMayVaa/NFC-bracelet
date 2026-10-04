// Jeju wish-band · admin desk
const $ = sel => document.querySelector(sel);
const $$ = sel => [...document.querySelectorAll(sel)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let adminPin = sessionStorage.getItem('wb-admin-pin') || '';
let config = null;
let status = null;
let lastScanTs = 0;
const flashed = new Set();

async function api(path, body, retried = false) {
  const opts = { headers: { 'X-Admin-Pin': adminPin } };
  if (body !== undefined) Object.assign(opts, { method: 'POST', body: JSON.stringify(body), headers: { ...opts.headers, 'Content-Type': 'application/json' } });
  const res = await fetch(path, opts);
  if (res.status === 401 && config?.adminPinRequired && !retried) {
    adminPin = prompt('Admin PIN') || '';
    sessionStorage.setItem('wb-admin-pin', adminPin);
    return api(path, body, true);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function toast(msg, kind = '') {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

function ago(iso) {
  if (!iso) return '–';
  const s = Math.round((Date.now() - (typeof iso === 'number' ? iso : Date.parse(iso))) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(iso).toLocaleDateString();
}

const tagUrl = uid => `${location.origin}/${encodeURIComponent(uid)}`;

// ------------------------------------------------------------------ render
function renderMetrics(m) {
  const cards = [
    ['tan', m.conversionRate + '%', 'AI pick conversion', `${m.recVisited} visits / ${m.recShown} shown`],
    ['sea', m.checkins, 'Check-ins', `${m.stamps} stamps collected`],
    ['leaf', m.vouchers, 'Vouchers unlocked', `${m.redeemed} redeemed at market`],
    ['sos', m.sosActive, 'Active SOS', `${m.sosTotal} total`],
    ['', m.lastLocationRate == null ? '–' : m.lastLocationRate + '%', 'Last-location success', 'SOS alerts with a position'],
    ['', m.tourists, 'Wish-bands', 'registered']
  ];
  $('#metrics').innerHTML = cards.map(([c, v, l, s]) =>
    `<div class="metric ${c}"><div class="l">${l}</div><div class="v">${v}</div><div class="muted" style="font-size:.74rem;font-weight:700">${s}</div></div>`).join('');
}

function renderSos(alerts) {
  const active = alerts.filter(a => ['PENDING', 'ACKNOWLEDGED', 'DISPATCHED'].includes(a.status));
  $('#sosCount').textContent = `${active.length} active`;
  $('#sosCard').style.borderColor = active.length ? 'var(--sos)' : '';
  if (!alerts.length) {
    $('#sosList').innerHTML = '<p class="muted" style="font-size:.85rem;margin-top:8px">No alerts. Everyone is safe 💚</p>';
    return;
  }
  $('#sosList').innerHTML = alerts.slice(0, 8).map(a => {
    const done = !active.includes(a);
    const loc = a.location;
    const map = loc ? `<a href="https://www.google.com/maps?q=${loc.latitude},${loc.longitude}" target="_blank">📍 ${loc.latitude.toFixed(4)}, ${loc.longitude.toFixed(4)}</a> <span class="chip">${esc(loc.source)}</span>` : '<span class="chip sos">no location</span>';
    const acts = {
      PENDING: `<button class="btn small" data-sos="acknowledge" data-id="${a.alertId}">👀 Acknowledge</button><button class="btn ghost small" data-sos="cancel" data-id="${a.alertId}">False alarm</button>`,
      ACKNOWLEDGED: `<button class="btn sea small" data-sos="dispatch" data-id="${a.alertId}">🚑 Dispatch</button><button class="btn leaf small" data-sos="resolve" data-id="${a.alertId}">Resolve</button>`,
      DISPATCHED: `<button class="btn leaf small" data-sos="resolve" data-id="${a.alertId}">💚 Resolved</button>`
    }[a.status] || '';
    return `<div class="sos-alert ${done ? 'done' : ''}">
      <div class="hd"><b>${esc(a.tourist.name)}</b><span class="chip mono">${esc(a.uid)}</span><span class="chip ${done ? '' : 'sos'}">${a.status}</span><span class="muted" style="font-size:.74rem;margin-left:auto">${ago(a.triggeredAt)}</span></div>
      <div style="font-size:.84rem;margin-top:6px">${esc(a.note)}</div>
      <div style="font-size:.8rem;margin-top:6px">${map}</div>
      <div style="font-size:.8rem;margin-top:4px">☎️ ${esc(a.tourist.emergencyContact || 'no contact')} · 🗣️ ${esc(a.tourist.language)} · 🍽️ ${esc(a.tourist.dietary)}</div>
      ${a.responder ? `<div style="font-size:.8rem;margin-top:4px">🚑 ${esc(a.responder)}${a.etaMinutes ? `, ETA ${a.etaMinutes} min` : ''}</div>` : ''}
      ${acts ? `<div class="acts">${acts}</div>` : ''}
    </div>`;
  }).join('');
}

function renderStations(list) {
  $('#stations').innerHTML = list.map(s => {
    const online = s.lastSeen && Date.now() - Date.parse(s.lastSeen) < 150000;
    const emoji = s.kind === 'admin' ? '📟' : config.kinds[s.kind]?.emoji;
    return `<div class="station ${online ? 'online' : ''}">
      <div class="n">${emoji} ${esc(s.name)}</div>
      <div class="s"><span class="status-dot"></span>${online ? 'Online' : s.lastSeen ? 'Offline' : 'Not seen yet'}${s.lastSeen ? ' · ' + ago(s.lastSeen) : ''}</div>
      <div class="s mono">${esc(s.id)}${s.ssid ? ' · ' + esc(s.ssid) : ''}${s.rssi ? ' · ' + s.rssi + ' dBm' : ''}</div>
    </div>`;
  }).join('');
}

function renderRows(tourists) {
  const q = $('#search').value.trim().toLowerCase();
  const list = tourists
    .filter(t => !q || t.uid.toLowerCase().includes(q) || (t.name || '').toLowerCase().includes(q))
    .sort((a, b) => (b.lastCheckin?.timestamp || b.registeredAt || '').localeCompare(a.lastCheckin?.timestamp || a.registeredAt || ''));
  $('#bandCount').textContent = tourists.length;
  if (!list.length) {
    $('#rows').innerHTML = `<tr><td colspan="6" class="muted" style="text-align:center">No wish-bands yet. Tap one on the desk reader or load demo tags.</td></tr>`;
    return;
  }
  $('#rows').innerHTML = list.map(t => {
    const stamps = config.stations.map(s => `<span class="${t.stamps?.[s.id] ? 'on' : ''}" title="${esc(s.name)}">${config.kinds[s.kind].emoji}</span>`).join('');
    const v = t.voucher?.status || 'LOCKED';
    const vChip = { LOCKED: '<span class="chip">🔒 Locked</span>', UNLOCKED: '<span class="chip tan">🎁 Ready</span>', REDEEMED: '<span class="chip leaf">✅ Used</span>', EXPIRED: '<span class="chip">Expired</span>' }[v];
    const flash = flashed.has(t.uid) ? 'flash' : '';
    return `<tr class="${flash}">
      <td><b>${esc(t.name)}</b><div class="muted" style="font-size:.74rem">${esc(t.country || '')} · ${esc(t.dietary || 'None')}</div></td>
      <td class="mono" style="font-size:.78rem">${esc(t.uid)}</td>
      <td class="mini-stamps">${stamps}</td>
      <td>${vChip}</td>
      <td style="font-size:.78rem">${t.lastCheckin ? ago(t.lastCheckin.timestamp) : '–'}</td>
      <td><div class="row-acts">
        <button class="icon-btn" title="Edit in form" data-act="edit" data-uid="${esc(t.uid)}">✏️</button>
        <button class="icon-btn" title="QR / link" data-act="qr" data-uid="${esc(t.uid)}">📱</button>
        ${config.demoMode ? config.stations.map(s => `<button class="icon-btn" title="Simulate ${esc(s.kind)} tap" data-act="tap" data-station="${s.id}" data-uid="${esc(t.uid)}">${config.kinds[s.kind].emoji}</button>`).join('') : ''}
        <button class="icon-btn" title="Reset stamps" data-act="reset" data-uid="${esc(t.uid)}">↺</button>
        <button class="icon-btn" title="Delete" data-act="delete" data-uid="${esc(t.uid)}">🗑️</button>
      </div></td>
    </tr>`;
  }).join('');
  flashed.clear();
}

const storageLabel = () => status?.storage === 'supabase' ? ' in Supabase' : '';

function renderStorage(kind) {
  const chip = $('#storageChip');
  chip.textContent = kind === 'supabase' ? '🟢 Supabase' : '📁 Local file';
  chip.className = `chip ${kind === 'supabase' ? 'ok' : ''}`;
  chip.title = kind === 'supabase' ? 'Data is saved in Supabase' : 'Data is saved in database.json (resets on Vercel)';
}

// Keep the band picker in sync without losing the current choice.
function renderSimPicker(tourists) {
  const sel = $('#simUid');
  const current = sel.value;
  const sig = tourists.map(t => t.uid + t.name).join('|');
  if (sel.dataset.sig !== sig) {
    sel.dataset.sig = sig;
    sel.innerHTML = tourists.length
      ? [...tourists].sort((a, b) => a.uid.localeCompare(b.uid)).map(t => `<option value="${esc(t.uid)}">${esc(t.uid)} · ${esc(t.name)}</option>`).join('')
      : '<option value="">No wish-bands yet</option>';
    if (tourists.some(t => t.uid === current)) sel.value = current;
  }
  updateSimNote();
}

function updateSimNote() {
  const t = status?.tourists.find(x => x.uid === $('#simUid').value);
  if (!t) return;
  const got = config.stations.filter(s => t.stamps?.[s.id]).length;
  const story = status.demoNotes?.[t.uid];
  $('#simNote').textContent = `${story ? story + ' · ' : ''}${got}/${config.stations.length} stamps · voucher ${String(t.voucher?.status || 'LOCKED').toLowerCase()}`;
}

function renderLog(events) {
  $('#log').innerHTML = events.map(e =>
    `<div><span class="t">${new Date(e.timestamp).toLocaleTimeString()}</span><span>${esc(e.text)}</span></div>`).join('');
}

function renderScan(scan, pendingWrite) {
  if (scan && scan.timestamp !== lastScanTs) {
    const first = lastScanTs === 0;
    lastScanTs = scan.timestamp;
    $('#scanUid').textContent = scan.uid;
    $('#scanContent').textContent = scan.content;
    if (!first) {
      $('#rUid').value = scan.uid;
      fillForm(scan.uid);
      toast(`📟 Tag ${scan.uid} scanned`, 'good');
    }
  }
  $('#queueState').textContent = pendingWrite ? `Queued: "${pendingWrite}" (tap a tag on the desk reader)` : 'Nothing queued.';
}

// ------------------------------------------------------------------ refresh loop
async function refresh() {
  try {
    const before = status;
    status = await api('/api/admin/status');
    if (before) {
      const prev = Object.fromEntries(before.tourists.map(t => [t.uid, (t.checkinHistory || []).length]));
      for (const t of status.tourists) if ((t.checkinHistory || []).length !== prev[t.uid]) flashed.add(t.uid);
      const newSos = status.sosAlerts.filter(a => a.status === 'PENDING' && !before.sosAlerts.find(b => b.alertId === a.alertId));
      if (newSos.length) { toast(`🚨 New SOS from ${newSos[0].tourist.name}`, 'warn'); beep(); }
    }
    renderMetrics(status.metrics);
    renderSos(status.sosAlerts);
    renderStations(status.stations);
    renderRows(status.tourists);
    renderLog(status.events);
    renderStorage(status.storage);
    if (config?.demoMode) renderSimPicker(status.tourists);
    renderScan(status.lastScan, status.pendingWrite);
    $('#live').classList.add('on');
    $('#liveText').textContent = 'Live';
  } catch (e) {
    $('#live').classList.remove('on');
    $('#liveText').textContent = 'Offline';
  }
}

function beep() {
  try {
    const ctx = new AudioContext();
    [880, 660, 880].forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime + i * .18;
      o.frequency.value = f; g.gain.setValueAtTime(.2, t); g.gain.exponentialRampToValueAtTime(.001, t + .16);
      o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + .16);
    });
  } catch (_) {}
}

// ------------------------------------------------------------------ form
const DIETS = ['Halal', 'Vegan', 'Vegetarian', 'No Shellfish', 'Gluten-Free'];

function fillForm(uid) {
  const t = status?.tourists.find(x => x.uid === uid);
  $('#rUid').value = uid;
  if (!t) return;
  $('#rName').value = t.name?.startsWith('Wish-band Guest') ? '' : (t.name || '');
  $('#rCountry').value = t.country === 'Global Traveler' ? '' : (t.country || '');
  $('#rLang').value = t.language || 'English';
  $('#rSos').value = t.emergencyContact || '';
  $('#rDeposit').checked = t.depositPaid !== false;
  const parts = String(t.dietary || '').split(',').map(s => s.trim().toLowerCase());
  $$('#rDiet button').forEach(b => b.classList.toggle('on', parts.includes(b.dataset.diet.toLowerCase())));
}

function bind() {
  $('#rDiet').innerHTML = DIETS.map(d => `<button type="button" data-diet="${d}">${d}</button>`).join('');
  $('#rDiet').addEventListener('click', e => { const b = e.target.closest('button'); if (b) b.classList.toggle('on'); });
  $('#rUid').addEventListener('change', () => fillForm($('#rUid').value.trim().toUpperCase()));

  $('#formReg').addEventListener('submit', async e => {
    e.preventDefault();
    const uid = $('#rUid').value.trim().toUpperCase();
    try {
      await api('/api/register', {
        uid, name: $('#rName').value, country: $('#rCountry').value, language: $('#rLang').value,
        dietary: $$('#rDiet .on').map(b => b.dataset.diet).join(', ') || 'None',
        emergencyContact: $('#rSos').value, depositPaid: $('#rDeposit').checked
      });
      toast(`✅ ${uid} registered`, 'good');
      flashed.add(uid);
      refresh();
      showQr(uid);
    } catch (err) { toast(err.message, 'warn'); }
  });

  $('#btnQueue').addEventListener('click', async () => {
    await api('/api/admin/write-queue', { content: $('#writeText').value }).catch(e => toast(e.message, 'warn'));
    toast($('#writeText').value ? 'Queued for the next tap' : 'Queue cleared');
    refresh();
  });

  $('#search').addEventListener('input', () => status && renderRows(status.tourists));

  $('#rows').addEventListener('click', async e => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const uid = b.dataset.uid;
    try {
      if (b.dataset.act === 'edit') { fillForm(uid); window.scrollTo({ top: 0, behavior: 'smooth' }); }
      if (b.dataset.act === 'qr') showQr(uid);
      if (b.dataset.act === 'tap') {
        const r = await api('/api/demo/tap', { uid, station: b.dataset.station });
        toast(r.duplicate ? 'Already stamped a moment ago' : r.voucherUnlocked ? '🎉 Voucher unlocked!' : 'Stamped', r.duplicate ? '' : 'good');
      }
      if (b.dataset.act === 'reset' && confirm(`Reset stamps for ${uid}?`)) await api('/api/tourist/reset', { uid });
      if (b.dataset.act === 'delete' && confirm(`Delete ${uid}?`)) await api('/api/tourist/delete', { uid });
      refresh();
    } catch (err) { toast(err.message, 'warn'); }
  });

  $('#sosList').addEventListener('click', async e => {
    const b = e.target.closest('[data-sos]');
    if (!b) return;
    const body = { alertId: b.dataset.id, staffId: 'desk' };
    if (b.dataset.sos === 'dispatch') {
      body.responder = prompt('Who is going?', 'Jeju 119 rescue team') || 'Rescue team';
      body.etaMinutes = Number(prompt('ETA in minutes?', '10')) || null;
    }
    if (b.dataset.sos === 'resolve') body.resolutionNotes = prompt('Resolution notes', 'Tourist safe') || '';
    try { await api(`/api/sos/${b.dataset.sos}`, body); refresh(); } catch (err) { toast(err.message, 'warn'); }
  });

  $('#btnResetStamps').addEventListener('click', async () => {
    if (confirm('Reset every stamp and voucher? Profiles stay.')) { await api('/api/admin/reset-stamps', {}); refresh(); }
  });
  // ---- demo control
  $('#demoCtl').addEventListener('click', async e => {
    const seed = e.target.closest('[data-seed]');
    const sim = e.target.closest('[data-sim]');
    const clear = e.target.closest('[data-clear]');
    try {
      if (seed) {
        if (seed.dataset.seed === 'replace' && !confirm(`Delete everything${storageLabel()} and load the demo story?`)) return;
        const r = await api('/api/admin/seed', { mode: seed.dataset.seed });
        toast(`🧪 Loaded ${r.tourists} wish-bands and ${r.sosAlerts} SOS alerts`, 'good');
      } else if (sim) {
        const uid = $('#simUid').value;
        if (!uid) return toast('Load demo data or pick a wish-band first', 'warn');
        const r = await api('/api/admin/simulate', { uid, action: sim.dataset.sim });
        toast(r.message, 'good');
        flashed.add(uid);
      } else if (clear) {
        const what = clear.dataset.clear;
        if (what === 'all') {
          const typed = prompt(`This deletes every wish-band and SOS alert${storageLabel()}. It cannot be undone.\n\nType DELETE to confirm:`);
          if (typed !== 'DELETE') return toast('Nothing deleted');
        } else if (!confirm(what === 'sos' ? 'Remove all SOS alerts?' : 'Remove guest bands that were never set up and have no taps?')) return;
        const r = await api('/api/admin/clear', { what });
        toast(`🧹 Removed ${r.count}`, 'good');
      } else return;
      refresh();
    } catch (err) { toast(err.message, 'warn'); }
  });
  $('#simUid').addEventListener('change', updateSimNote);
  $('#simOpen').addEventListener('click', () => { const uid = $('#simUid').value; if (uid) window.open(tagUrl(uid), '_blank'); });
  $('#btnExport').addEventListener('click', async () => {
    try {
      const res = await fetch('/api/admin/export', { headers: { 'X-Admin-Pin': adminPin } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(await res.blob());
      a.download = `wish-band-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } catch (err) { toast(`Backup failed: ${err.message}`, 'warn'); }
  });

  $('#btnCloseQr').addEventListener('click', () => $('#qrModal').classList.remove('open'));
  $('#qrModal').addEventListener('click', e => { if (e.target.id === 'qrModal') $('#qrModal').classList.remove('open'); });
  $('#btnCopy').addEventListener('click', () => navigator.clipboard.writeText($('#qrUrl').textContent).then(() => toast('Copied')));
}

function showQr(uid) {
  const url = tagUrl(uid);
  $('#qrImg').src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(url)}`;
  $('#qrUrl').textContent = url;
  $('#btnOpen').href = url;
  $('#qrModal').classList.add('open');
}

(async function init() {
  bind();
  try {
    config = await (await fetch('/api/config')).json();
    $('#defaultUrl').textContent = config.publicUrl;
    if (!config.demoMode) $$('.demo-only').forEach(el => el.classList.add('hidden'));
  } catch (_) {}
  await refresh();
  setInterval(refresh, 2000);
})();
