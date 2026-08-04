const express = require('express');
const axios = require('axios');
const { requireAuth } = require('../authMiddleware');

const router = express.Router();

// POST /api/seo/generate
router.post('/seo/generate', requireAuth, async (req, res) => {
  try {
    const { topic, niche } = req.body;
    if (!topic) return res.status(400).json({ error: 'Topic is required.' });

    const GEMINI_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_KEY) return res.status(500).json({ error: 'Gemini API key not set in Railway Variables.' });

    const prompt = `You are a YouTube SEO expert. Generate a complete YouTube SEO package.
Topic: ${topic}
Niche: ${niche || 'General'}
Year: 2026

Respond ONLY with this exact JSON format, no markdown, no extra text:
{"title":"SEO optimized title under 70 chars","description":"Full 300 word YouTube description with hook timestamps hashtags","tags":["tag1","tag2","tag3","tag4","tag5","tag6","tag7","tag8","tag9","tag10","tag11","tag12","tag13","tag14","tag15","tag16","tag17","tag18","tag19","tag20","tag21","tag22","tag23","tag24","tag25","tag26","tag27","tag28","tag29","tag30"],"keywords":[{"keyword":"phrase","volume":"2.4M","competition":"Medium"},{"keyword":"phrase","volume":"890K","competition":"Low"},{"keyword":"phrase","volume":"1.1M","competition":"Low"},{"keyword":"phrase","volume":"3.2M","competition":"High"},{"keyword":"phrase","volume":"670K","competition":"Low"}]}`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${GEMINI_KEY}`;

    const response = await axios.post(url, {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
    }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000,
    });

    const rawText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    let cleanText = rawText.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
    const match = cleanText.match(/\{[\s\S]*\}/);
    if (match) cleanText = match[0];

    const data = JSON.parse(cleanText);
    res.json(data);

  } catch (err) {
    const msg = err.response?.data?.error?.message || err.message;
    console.error('[SEO] Error:', msg);
    res.status(500).json({ error: msg });
  }
});

module.exports = router;
