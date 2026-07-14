// Polyfill for older Node versions where global crypto isn't available
if (!global.crypto) {
  global.crypto = require('crypto').webcrypto;
}

const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./config');
const generateRoutes = require('./routes/generate');

const app = express();

// Allow your frontend (and any origin, for now) to call this API
app.use(cors());
app.use(express.json());

// Serves generated voiceover audio files publicly, e.g. /audio/<id>.mp3
app.use('/audio', express.static(path.join(__dirname, '..', 'public', 'audio')));

app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'ReelForge backend', time: new Date().toISOString() });
});

app.get('/health', (req, res) => res.json({ ok: true }));

app.use('/api', generateRoutes);

app.listen(config.port, () => {
  console.log(`ReelForge backend running on port ${config.port}`);
});
