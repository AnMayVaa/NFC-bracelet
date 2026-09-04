// Extract UID from URL query params (e.g. ?uid=BEAD_001) or URL pathname (e.g. /04DBCE42CA2A81)
const urlParams = new URLSearchParams(window.location.search);
let currentUid = urlParams.get('uid');

if (!currentUid) {
  const pathSegment = window.location.pathname.replace(/^\/+|\/+$/g, '');
  if (pathSegment && pathSegment !== 'index.html' && pathSegment !== 'admin.html' && pathSegment !== 'admin') {
    currentUid = pathSegment;
  }
}

if (!currentUid) {
  currentUid = 'BEAD_001';
}
currentUid = currentUid.toUpperCase();

let currentTourist = null;
let isUvHigh = false;
let ws = null;
let pollTimer = null;

// DOM Elements
const displayTagUid = document.getElementById('displayTagUid');
const wsStatusText = document.getElementById('wsStatusText');
const touristName = document.getElementById('touristName');
const touristCountry = document.getElementById('touristCountry');
const touristDietary = document.getElementById('touristDietary');
const touristEmergency = document.getElementById('touristEmergency');

const stampBox1 = document.getElementById('stampBox1');
const stampStatus1 = document.getElementById('stampStatus1');
const stampBox2 = document.getElementById('stampBox2');
const stampStatus2 = document.getElementById('stampStatus2');

const voucherCard = document.getElementById('voucherCard');
const voucherBadge = document.getElementById('voucherBadge');
const voucherCodeBox = document.getElementById('voucherCodeBox');
const voucherDesc = document.getElementById('voucherDesc');
const btnRedeem = document.getElementById('btnRedeem');

const beadPreview = document.getElementById('beadPreview');
const uvStatusTitle = document.getElementById('uvStatusTitle');
const uvStatusDesc = document.getElementById('uvStatusDesc');

// Edit Modal Elements
const editModal = document.getElementById('editModal');
const btnOpenEditModal = document.getElementById('btnOpenEditModal');
const btnCancelEdit = document.getElementById('btnCancelEdit');
const btnSaveEdit = document.getElementById('btnSaveEdit');

const inputName = document.getElementById('inputName');
const inputCountry = document.getElementById('inputCountry');
const selectLanguage = document.getElementById('selectLanguage');
const inputDietary = document.getElementById('inputDietary');
const inputEmergency = document.getElementById('inputEmergency');

// Simulator Elements
const btnSimCP1 = document.getElementById('btnSimCP1');
const btnSimCP2 = document.getElementById('btnSimCP2');
const btnSimUV = document.getElementById('btnSimUV');
const btnSwitchTag = document.getElementById('btnSwitchTag');
const btnSimReset = document.getElementById('btnSimReset');

// Initialize
async function init() {
  displayTagUid.textContent = `UID: ${currentUid}`;
  await fetchTouristData();
  setupSync();
  setupEventListeners();
}

// Fetch Tourist Data from Backend
async function fetchTouristData() {
  try {
    const res = await fetch(`/api/tourist/${currentUid}`);
    if (res.ok) {
      currentTourist = await res.json();
      renderUI();
    } else {
      console.warn('Tag not found, creating new profile...');
      const registerRes = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid: currentUid,
          name: `Guest (${currentUid})`,
          country: 'South Korea',
          language: 'Korean',
          dietary: 'None',
          emergencyContact: '+82 10-0000-0000'
        })
      });
      const data = await registerRes.json();
      currentTourist = data.tourist;
      renderUI();
    }
  } catch (err) {
    console.error('Failed to fetch tourist profile:', err);
  }
}

// Render UI based on current tourist state
function renderUI() {
  if (!currentTourist) return;

  displayTagUid.textContent = `UID: ${currentTourist.uid}`;
  touristName.textContent = currentTourist.name;
  touristCountry.textContent = `${currentTourist.country} • ${currentTourist.language}`;
  touristDietary.textContent = currentTourist.dietary || 'None';
  touristEmergency.textContent = currentTourist.emergencyContact || 'Not Set';

  // Checkpoint 1 (Seongsan Sunrise Peak)
  if (currentTourist.stamps && currentTourist.stamps.checkpoint1) {
    stampBox1.classList.add('active');
    stampStatus1.textContent = '✅ Stamped (Dol Hareubang)';
  } else {
    stampBox1.classList.remove('active');
    stampStatus1.textContent = 'Not Visited';
  }

  // Checkpoint 2 (Dongmun Market)
  if (currentTourist.stamps && currentTourist.stamps.checkpoint2) {
    stampBox2.classList.add('active');
    stampStatus2.textContent = '✅ Stamped (Dol Hareubang)';
  } else {
    stampBox2.classList.remove('active');
    stampStatus2.textContent = 'Not Visited';
  }

  // Voucher Card State
  if (currentTourist.voucher) {
    if (currentTourist.voucher.redeemed) {
      voucherCard.classList.remove('unlocked');
      voucherCard.classList.add('redeemed');
      voucherBadge.textContent = 'Redeemed';
      voucherBadge.style.backgroundColor = '#6B7280';
      voucherCodeBox.textContent = 'REDEEMED AT MARKET';
      voucherDesc.textContent = `Voucher was used at Dongmun Traditional Market on ${new Date(currentTourist.voucher.redeemedAt || Date.now()).toLocaleTimeString()}`;
      btnRedeem.disabled = true;
      btnRedeem.textContent = 'Voucher Used';
    } else if (currentTourist.voucher.unlocked) {
      voucherCard.classList.add('unlocked');
      voucherCard.classList.remove('redeemed');
      voucherBadge.textContent = '🎉 Unlocked & Ready!';
      voucherBadge.style.backgroundColor = 'var(--color-green)';
      voucherCodeBox.textContent = currentTourist.voucher.code || 'JEJU-4000-REWARD';
      voucherDesc.textContent = 'Show this coupon to any participating vendor at Dongmun Market for 4,000 KRW off your local purchases!';
      btnRedeem.disabled = false;
      btnRedeem.textContent = '🎁 Redeem 4,000₩ at Dongmun Market';
    } else {
      voucherCard.classList.remove('unlocked', 'redeemed');
      voucherBadge.textContent = 'Locked (0/2 Stamps)';
      if (currentTourist.stamps.checkpoint1 || currentTourist.stamps.checkpoint2) {
        voucherBadge.textContent = '1/2 Stamps Collected';
      }
      voucherBadge.style.backgroundColor = '#374151';
      voucherCodeBox.textContent = '•••• - •••• - ••••';
      voucherDesc.textContent = 'Complete both Olle checkpoints with your AuraBeads to unlock a 4,000 won coupon at Dongmun Traditional Market!';
      btnRedeem.disabled = true;
      btnRedeem.textContent = 'Locked';
    }
  }
}

// Dual Real-time Sync: WebSockets + Serverless Cloud Polling Fallback
function setupSync() {
  const isVercel = window.location.hostname.includes('vercel.app');

  // If on Vercel, serverless functions don't support persistent WS -> use Smart Cloud Polling immediately
  if (isVercel) {
    startPolling();
    return;
  }

  // Otherwise try WebSocket (for local server)
  try {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${window.location.host}`);

    ws.onopen = () => {
      wsStatusText.textContent = 'Live Cloud Synced';
      wsStatusText.parentElement.querySelector('.pulse-dot').style.backgroundColor = 'var(--color-green)';
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.event === 'CHECKIN_EVENT' && data.payload.uid === currentUid) {
          currentTourist = data.payload.tourist;
          renderUI();
          if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
        } else if (data.event === 'PROFILE_UPDATED' && data.payload.uid === currentUid) {
          currentTourist = data.payload;
          renderUI();
        } else if (data.event === 'VOUCHER_REDEEMED' && data.payload.uid === currentUid) {
          currentTourist = data.payload.tourist;
          renderUI();
        } else if (data.event === 'RESET_EVENT') {
          if (data.payload.uid === 'ALL' || data.payload.uid === currentUid) {
            fetchTouristData();
          }
        }
      } catch (e) {
        console.error('Error handling WS message:', e);
      }
    };

    ws.onerror = () => startPolling();
    ws.onclose = () => startPolling();
  } catch (e) {
    startPolling();
  }
}

// Fast Smart Polling (Runs every 1.5 seconds when deployed on Vercel)
function startPolling() {
  if (pollTimer) return;
  wsStatusText.textContent = 'Cloud Active (1.5s)';
  wsStatusText.parentElement.querySelector('.pulse-dot').style.backgroundColor = 'var(--color-green)';

  pollTimer = setInterval(async () => {
    try {
      const res = await fetch(`/api/tourist/${currentUid}`);
      if (res.ok) {
        const updated = await res.json();
        const oldJson = JSON.stringify(currentTourist);
        const newJson = JSON.stringify(updated);
        if (oldJson !== newJson) {
          const hadCp1 = currentTourist?.stamps?.checkpoint1;
          const hadCp2 = currentTourist?.stamps?.checkpoint2;
          currentTourist = updated;
          renderUI();
          if ((!hadCp1 && updated?.stamps?.checkpoint1) || (!hadCp2 && updated?.stamps?.checkpoint2)) {
            if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
          }
        }
      }
    } catch (e) {}
  }, 1500);
}

// Event Listeners
function setupEventListeners() {
  // Modal Open
  btnOpenEditModal.addEventListener('click', () => {
    if (!currentTourist) return;
    inputName.value = currentTourist.name || '';
    inputCountry.value = currentTourist.country || '';
    selectLanguage.value = currentTourist.language || 'English';
    inputDietary.value = currentTourist.dietary || '';
    inputEmergency.value = currentTourist.emergencyContact || '';
    editModal.classList.add('open');
  });

  // Modal Cancel
  btnCancelEdit.addEventListener('click', () => {
    editModal.classList.remove('open');
  });

  // Modal Save (Direct Profile Edit on Phone)
  btnSaveEdit.addEventListener('click', async () => {
    btnSaveEdit.disabled = true;
    btnSaveEdit.textContent = 'Saving...';

    try {
      const payload = {
        uid: currentUid,
        name: inputName.value.trim(),
        country: inputCountry.value.trim(),
        language: selectLanguage.value,
        dietary: inputDietary.value.trim(),
        emergencyContact: inputEmergency.value.trim()
      };

      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const data = await res.json();
        currentTourist = data.tourist;
        renderUI();
        editModal.classList.remove('open');
      } else {
        alert('Failed to update profile');
      }
    } catch (err) {
      alert('Error updating profile: ' + err.message);
    } finally {
      btnSaveEdit.disabled = false;
      btnSaveEdit.textContent = 'Save to Cloud';
    }
  });

  // Redeem Voucher
  btnRedeem.addEventListener('click', async () => {
    if (!confirm('Dongmun Market Merchant Confirmation:\nAre you ready to redeem this 4,000 KRW voucher?')) return;
    try {
      const res = await fetch('/api/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: currentUid })
      });
      const data = await res.json();
      if (res.ok) {
        currentTourist = data.tourist;
        renderUI();
        alert('🎉 Voucher redeemed successfully! 4,000 KRW discount applied.');
      } else {
        alert(data.error || 'Failed to redeem voucher');
      }
    } catch (err) {
      alert('Error: ' + err.message);
    }
  });

  // Simulator: Checkpoint 1 Tap
  btnSimCP1.addEventListener('click', async () => {
    try {
      await fetch('/api/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: currentUid, station: 'checkpoint1' })
      });
      fetchTouristData();
    } catch (err) {
      console.error(err);
    }
  });

  // Simulator: Checkpoint 2 Tap
  btnSimCP2.addEventListener('click', async () => {
    try {
      await fetch('/api/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: currentUid, station: 'checkpoint2' })
      });
      fetchTouristData();
    } catch (err) {
      console.error(err);
    }
  });

  // Simulator: UV Toggle
  btnSimUV.addEventListener('click', () => {
    isUvHigh = !isUvHigh;
    if (isUvHigh) {
      beadPreview.classList.add('uv-high');
      uvStatusTitle.textContent = '⚠️ UV Sensor Bead: High Exposure';
      uvStatusTitle.style.color = 'var(--color-tangerine)';
      uvStatusDesc.textContent = 'Bead transitioned to Hallabong Tangerine orange! Strong seaside UV detected. Seek shade or apply sunscreen.';
    } else {
      beadPreview.classList.remove('uv-high');
      uvStatusTitle.textContent = 'UV Sensor Bead: Passive Safe';
      uvStatusTitle.style.color = 'var(--text-main)';
      uvStatusDesc.textContent = 'Bead is pearl-white in shade. Expose to seaside sun to see Hallabong tangerine transition.';
    }
  });

  // Simulator: Switch Tag UID
  btnSwitchTag.addEventListener('click', () => {
    const nextTag = prompt('Enter NFC Tag UID to switch to (e.g. BEAD_001, BEAD_002, or real hardware UID):', currentUid);
    if (nextTag && nextTag.trim()) {
      window.location.search = `?uid=${encodeURIComponent(nextTag.trim())}`;
    }
  });

  // Simulator: Reset Demo
  btnSimReset.addEventListener('click', async () => {
    if (confirm('Reset this demo tag stamps and vouchers?')) {
      await fetch('/api/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: currentUid })
      });
      fetchTouristData();
    }
  });
}

init();
