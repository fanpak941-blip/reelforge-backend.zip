const express = require('express');
const axios = require('axios');
const { requireAuth } = require('../authMiddleware');
const config = require('../config');

const router = express.Router();
const MODEL = 'gemini-flash-latest';

// POST /api/seo/generate
router.post('/seo/generate', requireAuth, async (req, res) => {
  try {
    const { topic, niche } = req.body;
    if (!topic) return res.status(400).json({ error: 'Topic is required.' });

    if (!config.gemini.apiKey) {
      return res.status(500).json({ error: 'Gemini API key not configured.' });
    }

    const prompt = `You are a YouTube SEO expert. Generate a complete YouTube SEO package.

Topic: ${topic}
Niche: ${niche || 'General'}
Year: 2026

IMPORTANT: Respond ONLY with valid JSON. No markdown, no code blocks, no explanation.

{
  "title": "SEO-optimized YouTube title under 70 chars with year and power words",
  "description": "Full YouTube description 300 words with hook, timestamps placeholder, hashtags",
  "tags": ["tag1","tag2","tag3","tag4","tag5","tag6","tag7","tag8","tag9","tag10","tag11","tag12","tag13","tag14","tag15","tag16","tag17","tag18","tag19","tag20","tag21","tag22","tag23","tag24","tag25","tag26","tag27","tag28","tag29","tag30"],
  "keywords": [
    {"keyword": "phrase 1", "volume": "2.4M", "competition": "Medium"},
    {"keyword": "phrase 2", "volume": "890K", "competition": "Low"},
    {"keyword": "phrase 3", "volume": "1.1M", "competition": "Low"},
    {"keyword": "phrase 4", "volume": "3.2M", "competition": "High"},
    {"keyword": "phrase 5", "volume": "670K", "competition": "Low"}
  ]
}`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${config.gemini.apiKey}`;

    const response = await axios.post(url, {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
    }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000,
    });

    const rawText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    console.log('[SEO] Raw response length:', rawText.length);

    // Clean markdown if present
    let cleanText = rawText.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
    const match = cleanText.match(/\{[\s\S]*\}/);
    if (match) cleanText = match[0];

    const data = JSON.parse(cleanText);

    if (!data.title || !data.tags || !data.description) {
      return res.status(500).json({ error: 'Incomplete response. Please try again.' });
    }

    console.log('[SEO] Success:', data.title);
    res.json(data);

  } catch (err) {
    const msg = err.response?.data?.error?.message || err.message;
    console.error('[SEO] Error:', msg);
    res.status(500).json({ error: 'SEO generation failed: ' + msg });
  }
});

module.exports = router;
