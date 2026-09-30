// lib/uv.js — current UV index for Jeju from Open-Meteo (free, no key), cached 30 min.
const JEJU = { lat: 33.38, lng: 126.55 };
const CACHE_MS = 30 * 60 * 1000;
const FALLBACK_UV = 5;

let cache = { value: null, at: 0, source: 'none' };

async function getUvIndex() {
  if (process.env.UV_OVERRIDE) return { uv: Number(process.env.UV_OVERRIDE), source: 'override' };
  if (cache.value != null && Date.now() - cache.at < CACHE_MS) return { uv: cache.value, source: cache.source };
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${JEJU.lat}&longitude=${JEJU.lng}&current=uv_index&timezone=Asia%2FSeoul`;
    const res = await fetch(url, { signal: AbortSignal.timeout(2500) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const uv = Number(data?.current?.uv_index);
    if (!Number.isFinite(uv)) throw new Error('no uv_index in response');
    cache = { value: Math.round(uv * 10) / 10, at: Date.now(), source: 'open-meteo' };
  } catch (e) {
    if (cache.value == null) return { uv: FALLBACK_UV, source: 'fallback' };
  }
  return { uv: cache.value, source: cache.source };
}

module.exports = { getUvIndex };
