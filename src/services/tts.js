const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');

// Microsoft Edge neural voices are 100% free and have no character quota.
// Pick a reasonable voice per language + gender. Add more languages here
// any time — just find the voice name from Microsoft's voice list.
const VOICE_MAP = {
  english: { male: 'en-US-GuyNeural', female: 'en-US-AriaNeural' },
  urdu: { male: 'ur-PK-AsadNeural', female: 'ur-PK-UzmaNeural' },
  hindi: { male: 'hi-IN-MadhurNeural', female: 'hi-IN-SwaraNeural' },
  spanish: { male: 'es-ES-AlvaroNeural', female: 'es-ES-ElviraNeural' },
  french: { male: 'fr-FR-HenriNeural', female: 'fr-FR-DeniseNeural' },
  german: { male: 'de-DE-ConradNeural', female: 'de-DE-KatjaNeural' },
  arabic: { male: 'ar-SA-HamedNeural', female: 'ar-SA-ZariyahNeural' },
};

function pickVoice(language, gender) {
  const lang = (language || 'english').toLowerCase();
  const g = (gender || 'female').toLowerCase() === 'male' ? 'male' : 'female';
  const set = VOICE_MAP[lang] || VOICE_MAP.english;
  return set[g];
}

/**
 * Converts text into an MP3 audio buffer using Microsoft Edge's free TTS voices.
 * Same function signature as the old ElevenLabs service, so nothing else in
 * the codebase needs to change.
 */
async function textToSpeech({ text, gender, language }) {
  const voice = pickVoice(language, gender);

  const tts = new MsEdgeTTS();
  await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

  const { audioStream } = tts.toStream(text);

  const chunks = [];
  return new Promise((resolve, reject) => {
    audioStream.on('data', (chunk) => chunks.push(chunk));
    audioStream.on('end', () => resolve(Buffer.concat(chunks)));
    audioStream.on('error', reject);
  });
}

module.exports = { textToSpeech };
