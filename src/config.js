require('dotenv').config();

module.exports = {
  port: process.env.PORT || 3000,

  gemini: {
    apiKey: process.env.GEMINI_API_KEY,
  },
  elevenlabs: {
    apiKey: process.env.ELEVENLABS_API_KEY,
    defaultVoiceId: process.env.ELEVENLABS_DEFAULT_VOICE_ID || '21m00Tcm4TlvDq8ikWAM', // "Rachel" - default female English voice
  },
  pexels: {
    apiKey: process.env.PEXELS_API_KEY,
  },
  shotstack: {
    apiKey: process.env.SHOTSTACK_API_KEY,
    // 'sandbox' (free, watermarked) or 'v1' (production/paid)
    env: process.env.SHOTSTACK_ENV || 'sandbox',
  },
};
