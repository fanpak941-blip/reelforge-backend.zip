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
  
  const result = tts.toStream(text);
  
  // result could be stream directly or {audio: stream}
  const stream = result.audio || result;
  
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', chunk => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

module.exports = { generateTTS };
