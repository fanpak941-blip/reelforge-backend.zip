const axios = require('axios');
const config = require('../config');

// ElevenLabs voice IDs — premade voices available on every account
const VOICE_MAP = {
  // English Female
  'warm_friendly':       'EXAVITQu4vr4xnSDxMaL', // Sarah
  'calm_female':         '21m00Tcm4TlvDq8ikWAM', // Rachel
  'professional_female': 'AZnzlk1XvdvUeBnXmlld', // Bella
  'matilda':             'XrExE9yKIg1WjnnlVkGX', // Matilda
  'alice':               'Xb7hH8MSUJpSbSDYk0k2', // Alice
  'grace':               'oWAxZDx7w5VEj9dCyTzz', // Grace
  'charlotte':           'XB0fDUnXU5powFXDhCwa', // Charlotte
  'glinda':              'z9fAnlkpzviPz146aGWa', // Glinda
  // English Male
  'energetic_male':      'TxGEqnHWrfWFTfGW9XjX', // Josh
  'deep_authoritative':  'pNInz6obpgDQGcFmaJgB', // Adam
  'daniel':              'onwK4e9ZLuTAKqWW03F9', // Daniel
  'liam':                'TX3LPaxmHKxFdv7VOQHJ', // Liam
  'callum':              'N2lVS1w4EtoT3dr4eOWO', // Callum
  'fin':                 'D38z5RcWu1voky8WS1ja', // Fin
  'arnold':              'VR6AewLTigWG4xSOukaG', // Arnold
  'sam':                 'yoZ06aMxZJJ28mfd3POQ', // Sam
  'antoni':              'ErXwobaYiN019PkySvjV', // Antoni
};

// Default voices for non-English languages (multilingual model handles pronunciation)
const GENDER_VOICE = {
  female: '21m00Tcm4TlvDq8ikWAM', // Rachel
  male:   'ErXwobaYiN019PkySvjV', // Antoni
};

function pickVoiceId(language, gender, voiceTone) {
  const lang = (language || 'english').toLowerCase();
  
  // English — use specific voice tone
  if (lang === 'english' && voiceTone && VOICE_MAP[voiceTone]) {
    return VOICE_MAP[voiceTone];
  }
  
  // Non-English — use gender-based voice with multilingual model
  const g = (gender || 'female').toLowerCase() === 'male' ? 'male' : 'female';
  return GENDER_VOICE[g];
}

// Parse voice value from frontend (e.g. "english-warm_friendly", "urdu-male")
function parseVoiceValue(voiceVal) {
  if (!voiceVal) return { language: 'English', gender: 'female', voiceTone: 'calm_female' };
  const parts = voiceVal.split('-');
  const language = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
  const rest = parts.slice(1).join('_');
  const gender = rest.includes('female') ? 'female' : rest.includes('male') ? 'male' : 'female';
  const voiceTone = rest;
  return { language, gender, voiceTone };
}

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
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function synthesizeChunk(text, voiceId, modelId, retries = 3) {
  if (!config.elevenlabs.apiKey) {
    throw new Error('ELEVENLABS_API_KEY is not set in Railway Variables.');
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await axios.post(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
        {
          text,
          model_id: modelId,
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        },
        {
          headers: {
            'xi-api-key': config.elevenlabs.apiKey,
            'Content-Type': 'application/json',
            'Accept': 'audio/mpeg',
          },
          responseType: 'arraybuffer',
          timeout: 30000,
        }
      );
      const buffer = Buffer.from(response.data);
      if (!buffer || buffer.length === 0) throw new Error('ElevenLabs returned empty audio.');
      return buffer;
    } catch (err) {
      let detail = err.message;
      if (err.response?.data) {
        try {
          const decoded = JSON.parse(Buffer.from(err.response.data).toString('utf8'));
          detail = decoded?.detail?.message || decoded?.detail || JSON.stringify(decoded);
        } catch (_) {}
      }
      const status = err.response?.status;
      console.warn(`[TTS] Attempt ${attempt}/${retries} failed: ${detail}`);
      
      if (attempt === retries || (status && status < 500 && status !== 429)) {
        throw new Error(`ElevenLabs${status ? ` (${status})` : ''}: ${detail}`);
      }
      await sleep(800 * attempt);
    }
  }
}

async function generateTTS(text, language, voiceTone, gender) {
  const lang = (language || 'English').toLowerCase();
  const isEnglish = lang === 'english';
  const modelId = 'eleven_multilingual_v2';
  
  const voiceId = pickVoiceId(language, gender || 'female', voiceTone);
  const chunks = splitTextForTTS(text);
  const buffers = [];
  
  for (let i = 0; i < chunks.length; i++) {
    console.log(`[TTS] Chunk ${i+1}/${chunks.length}, voice: ${voiceId}`);
    const buf = await synthesizeChunk(chunks[i], voiceId, modelId);
    buffers.push(buf);
  }
  
  return Buffer.concat(buffers);
}

async function textToSpeech({ text, gender, language, voiceTone }) {
  return generateTTS(text, language, voiceTone, gender);
}

module.exports = { generateTTS, textToSpeech, parseVoiceValue };
