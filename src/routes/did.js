const express = require('express');
const axios = require('axios');
const multer = require('multer');
const { requireAuth } = require('../authMiddleware');

const router = express.Router();
const upload = multer({ limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB

const DID_API_KEY = process.env.DID_API_KEY;
const DID_BASE = 'https://api.d-id.com';

// Default AI presenter images (professional avatars)
const DEFAULT_PRESENTERS = [
  { id: 'amy', name: 'Amy', gender: 'female', image: 'https://create-images-results.d-id.com/DefaultPresenters/Amalia_f/image.jpeg' },
  { id: 'daniel', name: 'Daniel', gender: 'male', image: 'https://create-images-results.d-id.com/DefaultPresenters/Daniel_m/image.jpeg' },
  { id: 'anna', name: 'Anna', gender: 'female', image: 'https://create-images-results.d-id.com/DefaultPresenters/Anna_f/image.jpeg' },
  { id: 'michael', name: 'Michael', gender: 'male', image: 'https://create-images-results.d-id.com/DefaultPresenters/Michael_m/image.jpeg' },
];

// GET /api/avatar/presenters — list default presenters
router.get('/avatar/presenters', requireAuth, (req, res) => {
  res.json({ presenters: DEFAULT_PRESENTERS });
});

// POST /api/avatar/generate — generate talking avatar video
router.post('/avatar/generate', requireAuth, upload.single('photo'), async (req, res) => {
  try {
    const { script, presenterImage, voiceId, language } = req.body;
    if (!script) return res.status(400).json({ error: 'Script is required.' });

    // Use uploaded photo or default presenter
    let sourceUrl = presenterImage || DEFAULT_PRESENTERS[0].image;

    // If user uploaded a photo, we need to upload it to D-ID first
    if (req.file) {
      const FormData = require('form-data');
      const form = new FormData();
      form.append('image', req.file.buffer, {
        filename: req.file.originalname,
        contentType: req.file.mimetype,
      });

      const uploadRes = await axios.post(`${DID_BASE}/images`, form, {
        headers: {
          ...form.getHeaders(),
          Authorization: `Basic ${DID_API_KEY}`,
        },
      });
      sourceUrl = uploadRes.data.url;
    }

    // Create D-ID talk
    const talkRes = await axios.post(`${DID_BASE}/talks`, {
      source_url: sourceUrl,
      script: {
        type: 'text',
        input: script.slice(0, 1000), // D-ID limit
        provider: {
          type: 'microsoft',
          voice_id: voiceId || (language === 'Urdu' ? 'ur-PK-AsadNeural' : 'en-US-JennyNeural'),
        },
      },
      config: { fluent: true, pad_audio: 0 },
    }, {
      headers: {
        Authorization: `Basic ${DID_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    res.json({ talkId: talkRes.data.id });
  } catch (err) {
    console.error('[D-ID] Error:', err.response?.data || err.message);
    res.status(500).json({ error: err.response?.data?.description || 'Failed to generate avatar video.' });
  }
});

// GET /api/avatar/status/:talkId — poll D-ID for result
router.get('/avatar/status/:talkId', requireAuth, async (req, res) => {
  try {
    const result = await axios.get(`${DID_BASE}/talks/${req.params.talkId}`, {
      headers: { Authorization: `Basic ${DID_API_KEY}` },
    });

    const { status, result_url, error } = result.data;
    res.json({ status, videoUrl: result_url, error });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get avatar status.' });
  }
});

module.exports = router;
