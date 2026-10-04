// lib/route.js — the Wish Route drawn along real roads and footpaths.
// 1) lib/data/route.json if present (run `npm run build-route` once to make it)
// 2) live OSRM foot routing (OpenStreetMap data), cached in memory
// 3) straight lines between stations, so the map always has a route
const fs = require('fs');
const path = require('path');
const { STATIONS } = require('./data/stations');

const ROUTE_FILE = path.join(__dirname, 'data', 'route.json');
const OSRM = process.env.OSRM_URL || 'https://routing.openstreetmap.de/routed-foot/route/v1/foot';

let cache = null;

const ordered = () => [...STATIONS].sort((a, b) => a.order - b.order);
const stationKey = () => ordered().map(s => `${s.id}:${s.lat},${s.lng}`).join('|');

function straight() {
  return { source: 'straight', coordinates: ordered().map(s => [s.lat, s.lng]), distanceKm: null };
}

async function fetchOsrm(fetchImpl = fetch) {
  const pts = ordered().map(s => `${s.lng},${s.lat}`).join(';');
  const res = await fetchImpl(`${OSRM}/${pts}?overview=full&geometries=geojson`, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`OSRM HTTP ${res.status}`);
  const data = await res.json();
  const r = data.routes?.[0];
  if (!r?.geometry?.coordinates?.length) throw new Error('OSRM returned no route');
  // GeoJSON is [lng, lat]; Leaflet wants [lat, lng]. Round to ~1 m to keep it small.
  const coordinates = r.geometry.coordinates.map(([lng, lat]) => [Math.round(lat * 1e5) / 1e5, Math.round(lng * 1e5) / 1e5]);
  return { source: 'osrm', coordinates, distanceKm: Math.round(r.distance / 100) / 10, stations: stationKey() };
}

function readFile() {
  try {
    const r = JSON.parse(fs.readFileSync(ROUTE_FILE, 'utf8'));
    // Ignore a stale file if stations moved since it was built
    if (r.stations === stationKey() && r.coordinates?.length) return { ...r, source: 'precomputed' };
  } catch (_) {}
  return null;
}

async function getRoute({ fetchImpl } = {}) {
  if (cache) return cache;
  const file = readFile();
  if (file) return (cache = file);
  try {
    return (cache = await fetchOsrm(fetchImpl));
  } catch (e) {
    return straight();   // not cached, so the next call tries OSRM again
  }
}

function resetCache() { cache = null; }

module.exports = { getRoute, fetchOsrm, straight, stationKey, resetCache, ROUTE_FILE };
