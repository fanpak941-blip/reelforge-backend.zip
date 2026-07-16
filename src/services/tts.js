const axios = require('axios');
const config = require('../config');

// ElevenLabs "premade" voices — available on every account, no extra setup needed.
const ENGLISH_VOICE_TONES = {
  warm_friendly: 'EXAVITQu4vr4xnSDxMaL',    // Bella — soft, warm female
  energetic_male: 'TxGEqnHWrfWFTfGW9XjX',   // Josh — energetic male
  calm_female: '21m00Tcm4TlvDq8ikWAM',      // Rachel — calm, clear female
  deep_authoritative: 'pNInz6obpgDQGcFmaJgB', // Adam — deep male
  professional_female: 'AZnzlk1XvdvUeBnXmlld', // Domi — confident female
};

// For non-English languages we use the multilingual model with a
// male/female premade voice — ElevenLabs' multilingual model handles
// pronunciation in the target language automatically.
const GENDER_VOICE = {
  female: '21m00Tcm4TlvDq8ikWAM', // Rachel
  male: 'ErXwobaYiN019PkySvjV',   // Antoni
};

function pickVoiceId(language, gender, voiceTone) {
  const lang = (language || 'english').toLowerCase();
  if (lang === 'english' && voiceTone && ENGLISH_VOICE_TONES[voiceTone]) {
    return ENGLISH_VOICE_TONES[voiceTone];
  }
  const g = (gender || 'female').toLowerCase() === 'male' ? 'male' : 'female';
  return GENDER_VOICE[g];
}

function isEnglish(language) {
  return (language || 'english').toLowerCase() === 'english';
}

// Keep individual requests a reasonable size — safe across all ElevenLabs
// plan tiers and keeps a single flaky request from ruining a huge script.
const MAX_CHARS_PER_CHUNK = 2000;
function splitTextForTTS(text) {
  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text];
  const chunks = [];
  let current = '';
  for (const s of sentences) {
    const trimmed = s.trim();
    if (!trimmed) continue;
    if ((current + ' ' + trimmed).length > MAX_CHARS_PER_CHUNK && current) {
      chunks.push(current.trim());
      current = trimmed;
    } else {
      current = current ? `${current} ${trimmed}` : trimmed;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const MAX_RETRIES = 3;

async function synthesizeChunkOnce(text, voiceId, modelId) {
  if (!config.elevenlabs.apiKey) {
    throw new Error('ELEVENLABS_API_KEY is not set in Railway Variables.');
  }

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;
  try {
    const response = await axios.post(
      url,
      {
        text,
        model_id: modelId,
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      },
      {
        headers: {
          'xi-api-key': config.elevenlabs.apiKey,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
        responseType: 'arraybuffer',
      }
    );
    const buffer = Buffer.from(response.data);
    if (!buffer || buffer.length === 0) throw new Error('ElevenLabs returned empty audio.');
    return buffer;
  } catch (err) {
    // ElevenLabs sends JSON error details even though we asked for binary —
    // try to decode them so the real reason shows up in logs/errors.
    let detail = err.message;
    if (err.response?.data) {
      try {
        const decoded = JSON.parse(Buffer.from(err.response.data).toString('utf8'));
        detail = decoded?.detail?.message || decoded?.detail || JSON.stringify(decoded);
      } catch (_) {
        // response wasn't JSON — keep the original message
      }
    }
    const status = err.response?.status;
    const wrapped = new Error(`ElevenLabs request failed${status ? ` (${status})` : ''}: ${detail}`);
    wrapped.isRetryable = status === 429 || status >= 500;
    throw wrapped;
  }
}

async function synthesizeChunk(text, voiceId, modelId) {
  let lastErr;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await synthesizeChunkOnce(text, voiceId, modelId);
    } catch (err) {
      lastErr = err;
      console.warn(`[TTS/ElevenLabs] Attempt ${attempt}/${MAX_RETRIES} failed: ${err.message}`);
      if (!err.isRetryable || attempt === MAX_RETRIES) throw err;
      await sleep(800 * attempt);
    }
  }
  throw lastErr;
}

async function textToSpeech({ text, gender, language, voiceTone }) {
  const voiceId = pickVoiceId(language, gender, voiceTone);
  const modelId = isEnglish(language) ? 'eleven_multilingual_v2' : 'eleven_multilingual_v2';
  const textChunks = splitTextForTTS(text);
  const audioBuffers = [];
  for (let i = 0; i < textChunks.length; i++) {
    try {
      const buf = await synthesizeChunk(textChunks[i], voiceId, modelId);
      audioBuffers.push(buf);
    } catch (err) {
      throw new Error(`Chunk ${i + 1}/${textChunks.length} failed: ${err.message}`);
    }
  }
  return Buffer.concat(audioBuffers);
}

/**
 * Matches the exact call signature used by routes/generate.js:
 *   tts.generateTTS(finalScript, language, voiceTone)
 */
async function generateTTS(text, language, voiceTone) {
  return textToSpeech({ text, gender: 'female', language, voiceTone });
}

module.exports = { generateTTS, textToSpeech };
