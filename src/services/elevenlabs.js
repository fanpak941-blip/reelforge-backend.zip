const axios = require('axios');
const config = require('../config');

let voiceCache = null;
let voiceCacheTime = 0;

/**
 * Fetches all voices available on your ElevenLabs account (cached 10 min).
 */
async function listVoices() {
  const now = Date.now();
  if (voiceCache && now - voiceCacheTime < 10 * 60 * 1000) return voiceCache;

  const { data } = await axios.get('https://api.elevenlabs.io/v1/voices', {
    headers: { 'xi-api-key': config.elevenlabs.apiKey },
  });

  voiceCache = data.voices || [];
  voiceCacheTime = now;
  return voiceCache;
}

/**
 * Picks a reasonable voice ID based on requested gender.
 * ElevenLabs' multilingual model (eleven_multilingual_v2) auto-detects
 * language from the text itself, so the same voice can speak many languages.
 */
async function selectVoiceId(gender) {
  try {
    const voices = await listVoices();
    if (!voices.length) return config.elevenlabs.defaultVoiceId;

    const wanted = (gender || '').toLowerCase();
    const match = voices.find(
      (v) => (v.labels?.gender || '').toLowerCase() === wanted
    );
    return (match || voices[0]).voice_id;
  } catch {
    return config.elevenlabs.defaultVoiceId;
  }
}

/**
 * Converts text into an MP3 audio buffer.
 */
async function textToSpeech({ text, gender }) {
  const voiceId = await selectVoiceId(gender);

  const response = await axios.post(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      text,
      model_id: 'eleven_multilingual_v2',
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

  return Buffer.from(response.data);
}

module.exports = { listVoices, textToSpeech };
