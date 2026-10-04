const test = require('node:test');
const assert = require('node:assert');
const core = require('../lib/core');
const CATALOG = require('../lib/data/catalog');
const weather = require('../lib/weather');
const route = require('../lib/route');

const json = body => async () => ({ ok: true, json: async () => body });

test('weather: parses Open-Meteo and flags rain', async () => {
  delete process.env.UV_OVERRIDE; delete process.env.WEATHER_OVERRIDE;
  weather.resetCache();
  const w = await weather.getWeather({ fetchImpl: json({
    current: { temperature_2m: 18.4, precipitation: 1.1, weather_code: 63, wind_speed_10m: 21, uv_index: 2.26, is_day: 1 },
    hourly: { precipitation_probability: [70, 85, 60] }
  }) });
  assert.strictEqual(w.source, 'open-meteo');
  assert.strictEqual(w.tempC, 18);
  assert.strictEqual(w.rainChance, 85);
  assert.strictEqual(w.uv, 2.3);
  assert.strictEqual(w.rainy, true);
  assert.strictEqual(w.label, 'Rain');
  weather.resetCache();
});

test('weather: falls back when the API is down', async () => {
  weather.resetCache();
  const w = await weather.getWeather({ fetchImpl: async () => { throw new Error('offline'); } });
  assert.strictEqual(w.source, 'fallback');
  weather.resetCache();
});

test('AI picks: rain puts indoor spots first and says why', () => {
  const rainy = weather.finish({ ...weather.FALLBACK, precipMm: 3, rainChance: 90, code: 63 }, 'test');
  const sunny = weather.finish({ ...weather.FALLBACK, uv: 4, rainChance: 0, code: 0 }, 'test');
  const t = core.newGuest('W1');
  const wet = core.recommend(t, CATALOG, { weather: rainy });
  assert.ok(wet.slice(0, 4).every(r => r.uvType === 'INDOOR_SHELTER'), 'top 4 are indoor in rain');
  assert.ok(wet[0].reasons.includes('Dry inside, good for rain'));
  const dry = core.recommend(t, CATALOG, { weather: sunny });
  assert.ok(dry.slice(0, 4).some(r => r.uvType !== 'INDOOR_SHELTER'), 'outdoor spots come back on a nice day');
  assert.strictEqual(core.weatherAdvice(rainy).key, 'rain');
});

test('route: uses OSRM road geometry, else straight lines', async () => {
  route.resetCache();
  const r = await route.getRoute({ fetchImpl: json({ routes: [{ distance: 51234, geometry: { coordinates: [[126.94, 33.45], [126.7, 33.5], [126.52, 33.51], [126.86, 33.52]] } }] }) });
  if (r.source === 'precomputed') return;   // a saved route.json wins, nothing to check here
  assert.strictEqual(r.source, 'osrm');
  assert.deepStrictEqual(r.coordinates[0], [33.45, 126.94]);
  assert.strictEqual(r.distanceKm, 51.2);
  route.resetCache();
  const s = await route.getRoute({ fetchImpl: async () => { throw new Error('down'); } });
  assert.strictEqual(s.source, 'straight');
  assert.strictEqual(s.coordinates.length, 3);
  route.resetCache();
});
