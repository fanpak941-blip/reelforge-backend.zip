const express = require('express');
const { requireAuth } = require('../authMiddleware');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const router = express.Router();
 
// POST /api/seo/generate
router.post('/seo/generate', requireAuth, async (req, res) => {
  try {
    const { topic, niche } = req.body;
    if (!topic) return res.status(400).json({ error: 'Topic is required.' });
 
    if (!process.env.GEMINI_API_KEY) {
      console.error('[SEO] GEMINI_API_KEY is not set!');
      return res.status(500).json({ error: 'Gemini API key not configured.' });
    }
 
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
 
    // Try gemini-1.5-flash first, fallback to gemini-pro
    let model;
    try {
      model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    } catch (e) {
      model = genAI.getGenerativeModel({ model: 'gemini-pro' });
    }
 
    const prompt = `You are a YouTube SEO expert. Generate a complete YouTube SEO package for this video.
 
Topic: ${topic}
Niche: ${niche || 'General'}
Year: 2026
 
IMPORTANT: Respond ONLY with a valid JSON object. No markdown, no code blocks, no explanation. Just raw JSON.
 
{
  "title": "SEO-optimized YouTube title under 70 chars with year and power words",
  "description": "Full YouTube description 300-400 words with hook main points call to action timestamps placeholder links placeholder hashtags at end",
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5", "tag6", "tag7", "tag8", "tag9", "tag10", "tag11", "tag12", "tag13", "tag14", "tag15", "tag16", "tag17", "tag18", "tag19", "tag20", "tag21", "tag22", "tag23", "tag24", "tag25", "tag26", "tag27", "tag28", "tag29", "tag30"],
  "keywords": [
    {"keyword": "keyword phrase", "volume": "2.4M", "competition": "Low"},
    {"keyword": "keyword phrase", "volume": "890K", "competition": "Medium"},
    {"keyword": "keyword phrase", "volume": "1.1M", "competition": "Low"},
    {"keyword": "keyword phrase", "volume": "3.2M", "competition": "High"},
    {"keyword": "keyword phrase", "volume": "670K", "competition": "Low"}
  ],
  "hook": "Attention-grabbing first line for the video script"
}`;
 
    const result = await model.generateContent(prompt);
    const rawText = result.response.text();
 
    console.log('[SEO] Raw Gemini response length:', rawText.length);
 
    // Clean the response — remove markdown code blocks if present
    let cleanText = rawText
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/gi, '')
      .trim();
 
    // Extract JSON object if extra text around it
    const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      cleanText = jsonMatch[0];
    }
 
    let data;
    try {
      data = JSON.parse(cleanText);
    } catch (parseErr) {
      console.error('[SEO] JSON parse failed:', parseErr.message);
      console.error('[SEO] Raw text was:', rawText.substring(0, 500));
      return res.status(500).json({ error: 'Failed to parse SEO response. Please try again.' });
    }
 
    // Validate required fields
    if (!data.title || !data.tags || !data.description) {
      console.error('[SEO] Missing required fields in response');
      return res.status(500).json({ error: 'Incomplete SEO response. Please try again.' });
    }
 
    console.log('[SEO] Success — title:', data.title);
    res.json(data);
 
  } catch (err) {
    console.error('[SEO] Error:', err.message);
    console.error('[SEO] Full error:', err);
    res.status(500).json({ error: 'Failed to generate SEO package. Please try again.' });
  }
});
 
module.exports = router;
