const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');

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

  const tts = new MsEdgeTTS();
  await tts.setMetadata(voiceName, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
  
  return new Promise((resolve, reject) => {
    const chunks = [];
    const readable = tts.toStream(text);
    readable.on('data', chunk => chunks.push(chunk));
    readable.on('end', () => resolve(Buffer.concat(chunks)));
    readable.on('error', reject);
  });
}

module.exports = { generateTTS };
