// Saves the Wish Route along real roads into lib/data/route.json, so the demo
// does not depend on a public routing server. Run once: npm run build-route
const fs = require('fs');
const { fetchOsrm, ROUTE_FILE } = require('../lib/route');

fetchOsrm()
  .then(r => {
    fs.writeFileSync(ROUTE_FILE, JSON.stringify(r) + '\n');
    console.log(`✅ Saved ${r.coordinates.length} points (${r.distanceKm} km) to ${ROUTE_FILE}`);
  })
  .catch(e => {
    console.error('❌ Could not build the route:', e.message);
    process.exit(1);
  });
