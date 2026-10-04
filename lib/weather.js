// lib/weather.js — live Jeju weather from Open-Meteo (free, no key), cached 15 min.
// Feeds the AI picks: UV, temperature, rain and wind all change what is a good idea right now.
const JEJU = { lat: 33.38, lng: 126.55 };
const CACHE_MS = 15 * 60 * 1000;
const FALLBACK = { uv: 5, tempC: 20, precipMm: 0, rainChance: 10, windKmh: 12, code: 1, isDay: true };

let cache = { value: null, at: 0 };

// WMO weather codes -> short label + emoji
function describe(code) {
  if (code == null) return { label: 'Unknown', emoji: '🌤️' };
  if (code === 0) return { label: 'Clear', emoji: '☀️' };
  if (code <= 2) return { label: 'Partly cloudy', emoji: '⛅' };
  if (code === 3) return { label: 'Cloudy', emoji: '☁️' };
  if (code <= 48) return { label: 'Fog', emoji: '🌫️' };
  if (code <= 57) return { label: 'Drizzle', emoji: '🌦️' };
  if (code <= 67) return { label: 'Rain', emoji: '🌧️' };
  if (code <= 77) return { label: 'Snow', emoji: '🌨️' };
  if (code <= 82) return { label: 'Showers', emoji: '🌦️' };
  if (code <= 86) return { label: 'Snow showers', emoji: '🌨️' };
  return { label: 'Thunderstorm', emoji: '⛈️' };
}

function finish(w, source) {
  const d = describe(w.code);
  const rainy = w.precipMm >= 0.2 || w.rainChance >= 60 || (w.code >= 51 && w.code <= 99);
  return {
    ...w,
    label: d.label,
    emoji: d.emoji,
    rainy,
    windy: w.windKmh >= 35,
    hot: w.tempC >= 30,
    cold: w.tempC <= 5,
    source
  };
}

// For demos: WEATHER_OVERRIDE='{"tempC":24,"rainChance":90,"precipMm":3}' and/or UV_OVERRIDE=8
function override() {
  let o = null;
  try { if (process.env.WEATHER_OVERRIDE) o = JSON.parse(process.env.WEATHER_OVERRIDE); } catch (_) {}
  if (process.env.UV_OVERRIDE) o = { ...(o || {}), uv: Number(process.env.UV_OVERRIDE) };
  return o ? finish({ ...FALLBACK, ...o }, 'override') : null;
}

async function getWeather({ fetchImpl = fetch } = {}) {
  const o = override();
  if (o) return o;
  if (cache.value && Date.now() - cache.at < CACHE_MS) return cache.value;
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${JEJU.lat}&longitude=${JEJU.lng}`
      + '&current=temperature_2m,precipitation,weather_code,wind_speed_10m,uv_index,is_day'
      + '&hourly=precipitation_probability&forecast_hours=3&timezone=Asia%2FSeoul';
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const c = data.current || {};
    const probs = data.hourly?.precipitation_probability || [];
    const w = {
      uv: Math.round(Number(c.uv_index ?? FALLBACK.uv) * 10) / 10,
      tempC: Math.round(Number(c.temperature_2m ?? FALLBACK.tempC)),
      precipMm: Number(c.precipitation ?? 0),
      rainChance: probs.length ? Math.max(...probs.map(Number).filter(Number.isFinite)) : 0,
      windKmh: Math.round(Number(c.wind_speed_10m ?? 0)),
      code: c.weather_code ?? null,
      isDay: c.is_day !== 0
    };
    cache = { value: finish(w, 'open-meteo'), at: Date.now() };
    return cache.value;
  } catch (e) {
    return cache.value || finish(FALLBACK, 'fallback');
  }
}

function resetCache() { cache = { value: null, at: 0 }; }

module.exports = { getWeather, describe, finish, resetCache, FALLBACK };
