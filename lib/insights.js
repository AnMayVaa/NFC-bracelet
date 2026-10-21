// lib/insights.js — numbers for the field trial and the admin impact panel.
// Pure functions only, like core.js: no Express, no file access.
const crypto = require('crypto');
const TRIAL = require('./data/trial');
const { STATIONS, MERCHANTS } = require('./data/stations');

const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : null);
const mean = xs => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100 : null);

// ---------------------------------------------------------------- trial membership

// A band counts as a trial band from the moment its owner agreed until they leave the study.
const isTrial = t => !!(t?.trial?.consentAt && !t.trial.withdrawnAt);

function setConsent(tourist, agree, now = Date.now()) {
  const at = new Date(now).toISOString();
  if (agree) {
    tourist.trial = { consentAt: at, consentVersion: TRIAL.version, withdrawnAt: null, survey: tourist.trial?.survey || null };
  } else if (tourist.trial?.consentAt) {
    tourist.trial.withdrawnAt = at;
  } else {
    tourist.trial = { consentAt: null, declinedAt: at };
  }
  return tourist.trial;
}

function recordSurvey(tourist, answers, now = Date.now()) {
  const fail = msg => { const e = new Error(msg); e.status = 400; throw e; };
  if (!isTrial(tourist)) fail('Join the study first');
  const survey = { at: new Date(now).toISOString() };
  for (const q of TRIAL.questions) {
    const v = Number(answers?.[q]);
    if (!Number.isInteger(v) || v < 1 || v > 5) fail(`${q} must be a whole number from 1 to 5`);
    survey[q] = v;
  }
  survey.comment = String(answers?.comment || '').trim().slice(0, 500);
  tourist.trial.survey = survey;
  return survey;
}

// Short stable code in place of the tag UID, so exports carry no name, phone or tag id.
function participantId(uid, salt = 'jeju-wish-band') {
  return 'P-' + crypto.createHash('sha256').update(`${salt}:${uid}`).digest('hex').slice(0, 8).toUpperCase();
}

// Only what happened after the person agreed is trial data.
const since = (t, list) => (list || []).filter(x => (x.timestamp || x.triggeredAt || '') >= t.trial.consentAt);

function bandNumbers(t, sosAlerts) {
  const ev = since(t, t.recEvents);
  const taps = since(t, t.checkinHistory);
  const alerts = Object.values(sosAlerts || {}).filter(a => a.uid === t.uid && a.triggeredAt >= t.trial.consentAt);
  return {
    shown: ev.filter(e => e.action === 'shown').length,
    opened: ev.filter(e => e.action === 'opened').length,
    visited: ev.filter(e => e.action === 'visited').length,
    checkins: taps.length,
    stamps: taps.filter(h => h.isNewStamp).length,
    voucher: t.voucher?.status || 'LOCKED',
    sos: alerts.length,
    sosLocated: alerts.filter(a => a.location).length,
    hasFix: !!(t.lastLocation && t.lastLocation.timestamp >= t.trial.consentAt)
  };
}

// ---------------------------------------------------------------- the four advisor indicators, trial bands only
function trialIndicators(tourists, sosAlerts) {
  const bands = tourists.filter(isTrial);
  const sum = { shown: 0, opened: 0, visited: 0, checkins: 0, stamps: 0, sos: 0, sosLocated: 0, withFix: 0, complete: 0, vouchers: 0, redeemed: 0 };
  for (const t of bands) {
    const n = bandNumbers(t, sosAlerts);
    for (const k of ['shown', 'opened', 'visited', 'checkins', 'stamps', 'sos', 'sosLocated']) sum[k] += n[k];
    if (n.hasFix) sum.withFix++;
    if (STATIONS.every(s => t.stamps?.[s.id])) sum.complete++;
    if (n.voucher !== 'LOCKED') sum.vouchers++;
    if (n.voucher === 'REDEEMED') sum.redeemed++;
  }
  const surveys = bands.map(t => t.trial.survey).filter(Boolean);
  const consents = bands.map(t => t.trial.consentAt).sort();
  return {
    bands: bands.length,
    firstConsent: consents[0] || null,
    lastConsent: consents[consents.length - 1] || null,
    conversion: { shown: sum.shown, opened: sum.opened, visited: sum.visited, rate: pct(sum.visited, sum.shown), openRate: pct(sum.opened, sum.shown) },
    satisfaction: {
      responses: surveys.length,
      responseRate: pct(surveys.length, bands.length),
      overall: mean(surveys.map(s => s.overall)),
      satisfiedShare: pct(surveys.filter(s => s.overall >= 4).length, surveys.length),
      aiPicks: mean(surveys.map(s => s.aiPicks)),
      safety: mean(surveys.map(s => s.safety))
    },
    checkins: {
      total: sum.checkins, stamps: sum.stamps,
      perBand: bands.length ? Math.round((sum.checkins / bands.length) * 10) / 10 : null,
      completedRoute: sum.complete, vouchers: sum.vouchers, redeemed: sum.redeemed
    },
    lastLocation: {
      sosAlerts: sum.sos, located: sum.sosLocated, rate: pct(sum.sosLocated, sum.sos),
      bandsWithFix: sum.withFix, fixRate: pct(sum.withFix, bands.length)
    }
  };
}

// One row per trial band, no name / phone / tag id / medical notes.
function trialRows(tourists, sosAlerts, salt) {
  return tourists.filter(isTrial).map(t => {
    const n = bandNumbers(t, sosAlerts);
    const s = t.trial.survey || {};
    return {
      participant: participantId(t.uid, salt),
      country: t.countryCode || '',
      consented_at: t.trial.consentAt,
      consent_version: t.trial.consentVersion || '',
      rec_shown: n.shown, rec_opened: n.opened, rec_visited: n.visited,
      checkins: n.checkins, new_stamps: n.stamps, voucher: n.voucher,
      survey_overall: s.overall ?? '', survey_ai_picks: s.aiPicks ?? '', survey_safety: s.safety ?? '',
      survey_comment: s.comment || '',
      sos_alerts: n.sos, sos_with_location: n.sosLocated, has_last_location: n.hasFix ? 1 : 0
    };
  });
}

function toCsv(rows) {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  const cell = v => { const s = String(v ?? ''); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [cols.join(','), ...rows.map(r => cols.map(c => cell(r[c])).join(','))].join('\n') + '\n';
}

// The summary as label,value lines (opens straight in Excel / Google Sheets).
function indicatorsCsv(ind) {
  const rows = [
    ['Trial bands', ind.bands],
    ['First consent', ind.firstConsent || ''], ['Last consent', ind.lastConsent || ''],
    ['1. Recommendation conversion rate (%)', ind.conversion.rate ?? ''],
    ['   AI picks shown', ind.conversion.shown], ['   AI picks opened', ind.conversion.opened], ['   Visited after a pick', ind.conversion.visited],
    ['2. User satisfaction, mean of 5', ind.satisfaction.overall ?? ''],
    ['   Satisfied (4 or 5) (%)', ind.satisfaction.satisfiedShare ?? ''], ['   Survey responses', ind.satisfaction.responses],
    ['   AI picks were useful, mean of 5', ind.satisfaction.aiPicks ?? ''], ['   Felt safe, mean of 5', ind.satisfaction.safety ?? ''],
    ['3. Check-ins', ind.checkins.total], ['   New stamps', ind.checkins.stamps], ['   Check-ins per band', ind.checkins.perBand ?? ''],
    ['   Finished the route', ind.checkins.completedRoute], ['   Vouchers unlocked', ind.checkins.vouchers], ['   Vouchers redeemed', ind.checkins.redeemed],
    ['4. Last-location tracking success (%)', ind.lastLocation.rate ?? ''],
    ['   SOS alerts', ind.lastLocation.sosAlerts], ['   SOS alerts with a location', ind.lastLocation.located],
    ['   Bands with a known last location (%)', ind.lastLocation.fixRate ?? '']
  ];
  return toCsv(rows.map(([indicator, value]) => ({ indicator, value })));
}

// ---------------------------------------------------------------- impact panel
// Where check-ins and AI picks go: local businesses, quiet spots or crowded hotspots.
function crowdBucket(level) {
  const c = level ?? 0.5;
  return c < TRIAL.quietBelow ? 'quiet' : c >= TRIAL.hotspotFrom ? 'hotspot' : 'moderate';
}

function emptyTally() { return { total: 0, local: 0, quiet: 0, moderate: 0, hotspot: 0 }; }

function addTo(tally, item) {
  if (!item) return;
  tally.total++;
  if (item.isLocalBusiness) tally.local++;
  tally[crowdBucket(item.crowdLevel)]++;
}

function withShares(tally) {
  return { ...tally, localShare: pct(tally.local, tally.total), quietShare: pct(tally.quiet, tally.total), hotspotShare: pct(tally.hotspot, tally.total) };
}

function computeImpact(tourists, catalog, { trialOnly = false } = {}) {
  const list = trialOnly ? tourists.filter(isTrial) : tourists;
  const byId = Object.fromEntries(catalog.map(i => [i.id, i]));
  const atStation = Object.fromEntries(catalog.filter(i => i.stationId).map(i => [i.stationId, i]));
  const itemFor = id => byId[id] || (String(id).startsWith('station:') ? atStation[String(id).slice(8)] : null);

  const checkins = emptyTally(), shown = emptyTally(), opened = emptyTally(), visited = emptyTally();
  const perStation = Object.fromEntries(STATIONS.map(s => [s.id, 0]));
  const shops = {};
  for (const t of list) {
    const from = trialOnly ? t.trial.consentAt : '';
    for (const h of t.checkinHistory || []) {
      if (h.timestamp < from) continue;
      addTo(checkins, atStation[h.station]);
      if (h.station in perStation) perStation[h.station]++;
    }
    for (const e of t.recEvents || []) {
      if (e.timestamp < from) continue;
      const tally = { shown, opened, visited }[e.action];
      if (tally) addTo(tally, itemFor(e.itemId));
    }
    if (t.voucher?.status === 'REDEEMED' && (t.voucher.redeemedAt || '') >= from) {
      const key = t.voucher.shop || 'unknown';
      shops[key] = (shops[key] || 0) + 1;
    }
  }
  const redemptions = Object.entries(shops)
    .map(([id, count]) => ({ shop: id, name: MERCHANTS.find(m => m.id === id)?.name || 'Shop not recorded', count }))
    .sort((a, b) => b.count - a.count);

  return {
    scope: trialOnly ? 'trial' : 'all',
    bands: list.length,
    buckets: { quietBelow: TRIAL.quietBelow, hotspotFrom: TRIAL.hotspotFrom },
    checkins: withShares(checkins),
    stations: STATIONS.map(s => {
      const item = atStation[s.id];
      return { id: s.id, name: s.name, checkins: perStation[s.id], local: !!item?.isLocalBusiness, crowd: item ? crowdBucket(item.crowdLevel) : null };
    }),
    picks: { shown: withShares(shown), opened: withShares(opened), visited: withShares(visited) },
    redemptions,
    redeemedTotal: redemptions.reduce((a, r) => a + r.count, 0)
  };
}

module.exports = {
  isTrial, setConsent, recordSurvey, participantId,
  trialIndicators, trialRows, toCsv, indicatorsCsv,
  crowdBucket, computeImpact
};
