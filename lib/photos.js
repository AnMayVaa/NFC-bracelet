// lib/photos.js — real photos for the For You cards, from Wikipedia / Wikimedia Commons
// (openly licensed, credited on every card).
//
// 1. lib/data/photos.json (written by `npm run fetch-photos`) points at files bundled in
//    public/img/places/, so the demo works offline.
// 2. Items not in that file are looked up live once (Wikipedia page image + Commons licence)
//    and kept in memory. If the lookup fails the card simply keeps its emoji.
//    PHOTOS_LIVE=0 turns the live lookup off.
const path = require('path');

const PHOTOS_FILE = path.join(__dirname, 'data', 'photos.json');
const UA = 'JejuWishBand/1.0 (https://github.com/AnMayVaa/NFC-bracelet)';
const RETRY_MS = 10 * 60 * 1000;
const WIDTH = 640;

let bundled = null;
const live = new Map();     // id -> photo | null
let failedAt = 0;
let pending = null;

function loadBundled() {
  if (bundled) return bundled;
  // require() so Vercel bundles the file with the function
  try { bundled = require('./data/photos.json'); } catch (_) { bundled = {}; }
  return bundled;
}

const stripHtml = s => String(s || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
const titleOf = w => decodeURIComponent(w).replace(/_/g, ' ');

async function getJson(fetchImpl, url, timeoutMs) {
  const res = await fetchImpl(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Looks up photos for these catalog items. Returns { id: photo } for the ones it found.
async function lookup(items, { fetchImpl = fetch, timeoutMs = 4000 } = {}) {
  const titles = [...new Set(items.flatMap(i => (i.wiki || []).map(titleOf)))];
  if (!titles.length) return {};

  // Step 1: the lead image of each Wikipedia article (follows redirects).
  const wp = await getJson(fetchImpl, 'https://en.wikipedia.org/w/api.php?action=query&format=json&formatversion=2'
    + `&prop=pageimages&piprop=thumbnail|name&pithumbsize=${WIDTH}&redirects=1&titles=${encodeURIComponent(titles.join('|'))}`, timeoutMs);
  const q = wp.query || {};
  const alias = new Map();
  for (const m of [...(q.normalized || []), ...(q.redirects || [])]) alias.set(m.from, m.to);
  const resolve = t => { let x = t; for (let n = 0; n < 4 && alias.has(x); n++) x = alias.get(x); return x; };
  const byTitle = new Map((q.pages || []).filter(p => p.pageimage && p.thumbnail).map(p => [p.title, p]));

  const picks = {};
  for (const item of items) {
    for (const w of item.wiki || []) {
      const page = byTitle.get(resolve(titleOf(w)));
      if (page) { picks[item.id] = page; break; }
    }
  }
  const files = [...new Set(Object.values(picks).map(p => p.pageimage))];
  if (!files.length) return {};

  // Step 2: author and licence of each file from Commons.
  const cm = await getJson(fetchImpl, 'https://commons.wikimedia.org/w/api.php?action=query&format=json&formatversion=2'
    + '&prop=imageinfo&iiprop=url|extmetadata&iiextmetadatafilter=Artist|LicenseShortName|LicenseUrl'
    + `&titles=${encodeURIComponent(files.map(f => 'File:' + f).join('|'))}`, timeoutMs);
  const cq = cm.query || {};
  const fileAlias = new Map((cq.normalized || []).map(m => [m.to, m.from]));
  const meta = new Map();
  for (const p of cq.pages || []) {
    const ii = p.imageinfo && p.imageinfo[0];
    if (!ii) continue;
    const em = ii.extmetadata || {};
    const name = (fileAlias.get(p.title) || p.title).replace(/^File:/, '');
    meta.set(name.replace(/ /g, '_'), {
      author: stripHtml(em.Artist && em.Artist.value) || 'Unknown author',
      license: stripHtml(em.LicenseShortName && em.LicenseShortName.value) || 'see source',
      licenseUrl: (em.LicenseUrl && em.LicenseUrl.value) || null,
      page: ii.descriptionurl || `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(name)}`,
      original: ii.url
    });
  }

  const out = {};
  for (const [id, page] of Object.entries(picks)) {
    const m = meta.get(page.pageimage.replace(/ /g, '_'));
    if (!m) continue;   // no licence info, so we don't show it
    out[id] = { src: page.thumbnail.source, ...m, article: `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}` };
  }
  return out;
}

// { id: photo } for every item we have a photo for. Never throws.
async function getPhotos(items, opts = {}) {
  const local = loadBundled();
  const result = {};
  const missing = [];
  for (const i of items) {
    if (local[i.id]) result[i.id] = local[i.id];
    else if (live.has(i.id)) { if (live.get(i.id)) result[i.id] = live.get(i.id); }
    else missing.push(i);
  }
  if (missing.length && process.env.PHOTOS_LIVE !== '0' && Date.now() - failedAt > RETRY_MS) {
    try {
      pending = pending || lookup(missing, opts).finally(() => { pending = null; });
      const found = await pending;
      for (const i of missing) live.set(i.id, found[i.id] || null);
      for (const i of missing) if (found[i.id]) result[i.id] = found[i.id];
    } catch (_) {
      failedAt = Date.now();
    }
  }
  return result;
}

function _reset() { bundled = null; live.clear(); failedAt = 0; pending = null; }

module.exports = { getPhotos, lookup, PHOTOS_FILE, _reset };
