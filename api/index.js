// Vercel serverless entry. Static files in /public are served by Vercel itself.
// Storage lives in /tmp on Vercel, so it resets when an instance is recycled.
const path = require('path');
const { createApp } = require('../lib/app');

const dbFile = process.env.VERCEL
  ? path.join('/tmp', 'database.json')
  : path.join(__dirname, '..', 'database.json');

const app = createApp({ dbFile });

if (require.main === module) {
  const express = require('express');
  const PORT = process.env.PORT || 3000;
  app.use(express.static(path.join(__dirname, '..', 'public')));
  app.listen(PORT, () => console.log(`🌋 Jeju wish-band (Vercel mode) on http://localhost:${PORT}`));
}

module.exports = app;
