const EdgeTTS = require('msedge-tts');

const VOICE_MAP = {
  warm_friendly: 'en-US-JennyNeural',
  energetic_male: 'en-US-GuyNeural',
  calm_female: 'en-US-AriaNeural',
  deep_authoritative: 'en-US-DavisNeural',
  professional_female: 'en-US-JaneNeural',
  en: 'en-US-JennyNeural',
  english: 'en-US-JennyNeural',
  hi: 'hi-IN-SwaraNeural',
  ur: 'ur-PK-AsadNeural',
  es: 'es-ES-ElviraNeural',
  fr: 'fr-FR-DeniseNeural',
  de: 'de-DE-KatjaNeural',
  ar: 'ar-SA-ZariyahNeural',
};

async function generateTTS(text, language, tone) {
  const lang = (language || 'en').toLowerCase();
  const voiceName = VOICE_MAP[tone] || VOICE_MAP[lang] || VOICE_MAP['en'];
  
  const tts = new EdgeTTS();
  const { audio } = await tts.ttsPromise(text, voiceName);
  return audio;
}

module.exports = { generateTTS };
