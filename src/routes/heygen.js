const express = require('express');
const axios = require('axios');
const { requireAuth } = require('../authMiddleware');

const router = express.Router();
const HEYGEN_API_KEY = process.env.HEYGEN_API_KEY;
const HEYGEN_BASE = 'https://api.heygen.com';

// Popular HeyGen public avatars
const DEFAULT_AVATARS = [
  { avatar_id: 'Daisy-inskirt-20220818', name: 'Daisy', gender: 'female', preview: 'https://files2.heygen.ai/avatar/v3/Daisy-inskirt-20220818/preview_target.webp' },
  { avatar_id: 'josh_lite3_20230714', name: 'Josh', gender: 'male', preview: 'https://files2.heygen.ai/avatar/v3/josh_lite3_20230714/preview_target.webp' },
  { avatar_id: 'Monica-inblackdress-20220818', name: 'Monica', gender: 'female', preview: 'https://files2.heygen.ai/avatar/v3/Monica-inblackdress-20220818/preview_target.webp' },
  { avatar_id: 'Wayne_20240711', name: 'Wayne', gender: 'male', preview: 'https://files2.heygen.ai/avatar/v3/Wayne_20240711/preview_target.webp' },
  { avatar_id: 'Abigail_expressive_20230814', name: 'Abigail', gender: 'female', preview: 'https://files2.heygen.ai/avatar/v3/Abigail_expressive_20230814/preview_target.webp' },
  { avatar_id: 'Eric_public_pro2_20230608', name: 'Eric', gender: 'male', preview: 'https://files2.heygen.ai/avatar/v3/Eric_public_pro2_20230608/preview_target.webp' },
];

// Voice IDs from HeyGen
const HEYGEN_VOICES = {
  'english-female': '1bd001e7e50f421d891986aad5158bc8',
  'english-male':   '2d5b0e6cf36f460aa7fc47e3eee4ba54',
  'urdu-male':      'a0e99841-438c-4a64-b679-ae501e7d6091',
  'hindi-female':   '4a14fd85-85ad-4e5e-8f19-d71c49898b5f',
  'arabic-male':    'a0e99841-438c-4a64-b679-ae501e7d6091',
};

// GET /api/heygen/avatars
router.get('/heygen/avatars', requireAuth, async (req, res) => {
  try {
    // Try to get from HeyGen API first
    const response = await axios.get(`${HEYGEN_BASE}/v2/avatars`, {
      headers: { 'X-Api-Key': HEYGEN_API_KEY },
      timeout: 10000,
    });
    const avatars = response.data?.data?.avatars || DEFAULT_AVATARS;
    res.json({ avatars: avatars.slice(0, 20) });
  } catch (err) {
    // Fallback to default avatars
    res.json({ avatars: DEFAULT_AVATARS });
  }
});

// POST /api/heygen/generate — create HeyGen video
router.post('/heygen/generate', requireAuth, async (req, res) => {
  try {
    const { script, avatarId, language, voiceId } = req.body;
    if (!script) return res.status(400).json({ error: 'Script is required.' });

    const selectedAvatar = avatarId || DEFAULT_AVATARS[0].avatar_id;
    const selectedVoice = voiceId || HEYGEN_VOICES['english-female'];

    const payload = {
      video_inputs: [{
        character: {
          type: 'avatar',
          avatar_id: selectedAvatar,
          avatar_style: 'normal',
        },
        voice: {
          type: 'text',
          input_text: script.slice(0, 1500),
          voice_id: selectedVoice,
        },
        background: {
          type: 'color',
          value: '#FAFAFA',
        },
      }],
      aspect_ratio: '9:16',
      test: false,
    };

    const response = await axios.post(`${HEYGEN_BASE}/v2/video/generate`, payload, {
      headers: {
        'X-Api-Key': HEYGEN_API_KEY,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });

    const videoId = response.data?.data?.video_id;
    if (!videoId) throw new Error('No video ID returned from HeyGen');

    res.json({ videoId });
  } catch (err) {
    console.error('[HeyGen] Generate error:', err.response?.data || err.message);
    res.status(500).json({ error: err.response?.data?.message || err.message || 'HeyGen generation failed.' });
  }
});

// GET /api/heygen/status/:videoId
router.get('/heygen/status/:videoId', requireAuth, async (req, res) => {
  try {
    const response = await axios.get(`${HEYGEN_BASE}/v1/video_status.get?video_id=${req.params.videoId}`, {
      headers: { 'X-Api-Key': HEYGEN_API_KEY },
      timeout: 10000,
    });

    const data = response.data?.data;
    res.json({
      status: data?.status,
      videoUrl: data?.video_url,
      thumbnailUrl: data?.thumbnail_url,
      error: data?.error,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get HeyGen status.' });
  }
});

module.exports = router;
