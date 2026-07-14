const axios = require('axios');
const config = require('../config');

const MODEL = 'gemini-2.5-flash';

/**
 * Turns a short topic into a full narration script suitable for a
 * YouTube-style video voiceover.
 */
async function generateScriptFromTopic({ topic, niche, durationMinutes, language }) {
  // Roughly 150 spoken words per minute
  const targetWords = Math.max(60, Math.round(durationMinutes * 150));

  const prompt = `You are a professional YouTube scriptwriter.
Write a narration script (voiceover only, no scene directions, no speaker labels)
for a video about: "${topic}"

Niche: ${niche || 'general'}
Target length: approximately ${targetWords} words (for a ~${durationMinutes} minute video)
Language: ${language || 'English'}

Rules:
- Return ONLY the spoken narration text, nothing else (no titles, no markdown, no brackets).
- Write in short, clear sentences that sound natural when read aloud.
- Make it engaging: strong hook in the first sentence, clear structure, satisfying ending.`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${config.gemini.apiKey}`;

  const { data } = await axios.post(
    url,
    {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.8, maxOutputTokens: 2048 },
    },
    { headers: { 'Content-Type': 'application/json' } }
  );

  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini did not return a script. Try again.');

  return text.trim();
}

module.exports = { generateScriptFromTopic };
