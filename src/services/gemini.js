const axios = require('axios');
const config = require('../config');

const MODEL = 'gemini-2.5-flash';

/**
 * Turns a short topic into a full narration script suitable for a
 * YouTube-style video voiceover. Accepts either an exact wordCount
 * (used by the "Write Script for Me" button) or a durationMinutes
 * estimate (used as a fallback).
 */
async function generateScriptFromTopic({ topic, niche, durationMinutes, wordCount, language }) {
  // Roughly 150 spoken words per minute
  const targetWords = wordCount || Math.max(60, Math.round((durationMinutes || 3) * 150));

  const prompt = `You are a professional YouTube scriptwriter.
Write a narration script (voiceover only, no scene directions, no speaker labels)
for a video about: "${topic}"

Niche: ${niche || 'general'}
Target length: approximately ${targetWords} words
Language: ${language || 'English'}

Rules:
- Return ONLY the spoken narration text, nothing else (no titles, no markdown, no brackets).
- Write in short, clear sentences that sound natural when read aloud.
- Make it engaging: strong hook in the first sentence, clear structure, satisfying ending.
- Aim as close as possible to ${targetWords} words.`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${config.gemini.apiKey}`;

  let data;
  try {
    const response = await axios.post(
      url,
      {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.8, maxOutputTokens: 4096 },
      },
      { headers: { 'Content-Type': 'application/json' } }
    );
    data = response.data;
  } catch (err) {
    const upstreamMessage = err.response?.data?.error?.message || err.message;
    throw new Error(`Gemini request failed: ${upstreamMessage}`);
  }

  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini did not return a script. Try again.');

  return text.trim();
}

module.exports = { generateScriptFromTopic };
