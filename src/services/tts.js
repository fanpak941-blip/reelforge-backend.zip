const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');

// Microsoft Edge neural voices are 100% free and have no character quota.
const ENGLISH_VOICE_TONES = {
  warm_friendly: 'en-US-JennyMultilingualNeural',
  energetic_male: 'en-US-GuyNeural',
  calm_female: 'en-US-AriaNeural',
  deep_authoritative: 'en-US-DavisNeural',
  professional_female: 'en-US-SaraNeural',
};

const VOICE_MAP = {
  english: { male: 'en-US-GuyNeural', female: 'en-US-AriaNeural' },
  urdu: { male: 'ur-PK-AsadNeural', female: 'ur-PK-UzmaNeural' },
  hindi: { male: 'hi-IN-MadhurNeural', female: 'hi-IN-SwaraNeural' },
  spanish: { male: 'es-ES-AlvaroNeural', female: 'es-ES-ElviraNeural' },
  french: { male: 'fr-FR-HenriNeural', female: 'fr-FR-DeniseNeural' },
  german: { male: 'de-DE-ConradNeural', female: 'de-DE-KatjaNeural' },
  arabic: { male: 'ar-SA-HamedNeural', female: 'ar-SA-ZariyahNeural' },
};

function pickVoice(language, gender, voiceTone) {
  const lang = (language || 'english').toLowerCase();
  if (lang === 'english' && voiceTone && ENGLISH_VOICE_TONES[voiceTone]) {
    return ENGLISH_VOICE_TONES[voiceTone];
  }
  const g = (gender || 'female').toLowerCase() === 'male' ? 'male' : 'female';
  const set = VOICE_MAP[lang] || VOICE_MAP.english;
  return set[g];
}

// Edge-TTS can silently cut off long text in a single request. We avoid that
// entirely by splitting the script into safe-sized chunks (by sentence),
// synthesizing each chunk separately, then stitching the MP3 buffers
// together. This is the fix for the "voice stops after ~55 seconds" bug.
const MAX_CHARS_PER_CHUNK = 450;

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

function synthesizeChunk(text, voice) {
  return new Promise(async (resolve, reject) => {
    try {
      const tts = new MsEdgeTTS();
      await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
      const { audioStream } = tts.toStream(text);
      const chunks = [];
      audioStream.on('data', (c) => chunks.push(c));
      audioStream.on('end', () => resolve(Buffer.concat(chunks)));
      audioStream.on('error', reject);
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Converts (potentially long) text into a single MP3 audio buffer, safely,
 * by chunking it internally.
 */
async function textToSpeech({ text, gender, language, voiceTone }) {
  const voice = pickVoice(language, gender, voiceTone);
  const textChunks = splitTextForTTS(text);

  const audioBuffers = [];
  for (const chunk of textChunks) {
    const buf = await synthesizeChunk(chunk, voice);
    audioBuffers.push(buf);
  }
  return Buffer.concat(audioBuffers);
}

module.exports = { textToSpeech, ENGLISH_VOICE_TONES };
