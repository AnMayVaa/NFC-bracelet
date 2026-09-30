// Local server: shared app + static files + WebSocket live updates.
// Run: npm start  ->  http://localhost:3000
const http = require('http');
const path = require('path');
const express = require('express');
const { WebSocketServer } = require('ws');
const { createApp } = require('./lib/app');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

let wss = null;
function broadcast(event, payload) {
  if (!wss) return;
  const msg = JSON.stringify({ event, payload, timestamp: new Date().toISOString() });
  wss.clients.forEach(c => c.readyState === 1 && c.send(msg));
}

const app = createApp({ dbFile: path.join(__dirname, 'database.json'), broadcast });

app.use(express.static(PUBLIC_DIR));
app.get('/admin', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'admin.html')));
// Tag URLs look like /04DBCE42CA2A81 -> tourist app
app.get('/:uid', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));

const server = http.createServer(app);
wss = new WebSocketServer({ server });
wss.on('connection', ws => ws.send(JSON.stringify({ event: 'CONNECTED' })));

server.listen(PORT, () => {
  console.log(`\n🌋 Jeju wish-band running at http://localhost:${PORT}`);
  console.log(`📱 Tourist app: http://localhost:${PORT}/BEAD_001`);
  console.log(`🏢 Admin desk:  http://localhost:${PORT}/admin\n`);
});
