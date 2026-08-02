const express = require('express');
const { requireAuth } = require('../authMiddleware');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const router = express.Router();

// POST /api/seo/generate
router.post('/seo/generate', requireAuth, async (req, res) => {
  try {
    const { topic, niche } = req.body;
    if (!topic) return res.status(400).json({ error: 'Topic is required.' });

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const prompt = `You are a YouTube SEO expert. Generate a complete YouTube SEO package for this video:

Topic: ${topic}
Niche: ${niche || 'General'}
Year: 2026

Respond ONLY with valid JSON, no markdown, no explanation:
{
  "title": "SEO-optimized YouTube title (under 70 chars, include year, power words)",
  "description": "Full YouTube description (300-400 words). Include: hook, main points, call to action, timestamps placeholder, links placeholder, hashtags at end)",
  "tags": ["tag1", "tag2", ... exactly 30 tags],
  "keywords": [
    {"keyword": "keyword phrase", "volume": "estimated monthly searches like 2.4M or 890K", "competition": "Low|Medium|High"},
    ... exactly 5 keywords
  ],
  "hook": "Attention-grabbing first line for the video script"
}`;

    const result = await model.generateContent(prompt);
    const text = result.response.text().replace(/```json|```/g, '').trim();
    const data = JSON.parse(text);

    res.json(data);
  } catch (err) {
    console.error('[SEO] Error:', err.message);
    res.status(500).json({ error: 'Failed to generate SEO package. Please try again.' });
  }
});

module.exports = router;
