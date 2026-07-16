const { EdgeTTS, Constants } = require('@andresaya/edge-tts');

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

// Edge-TTS can be unreliable on long single requests, so we still split the
// script into safe-sized chunks (by sentence), synthesize each separately,
// then stitch the MP3 buffers together.
const MAX_CHARS_PER_CHUNK = 400;
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

// Microsoft's Edge Read Aloud service occasionally drops connections
// (it's not an officially supported API). We retry automatically instead
// of failing the whole video job on one bad connection.
const MAX_RETRIES = 4;

async function synthesizeChunkOnce(text, voice) {
  const tts = new EdgeTTS();
  await tts.synthesize(text, voice, {
    outputFormat: Constants.OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3,
  });
  const buffer = tts.toBuffer();
  if (!buffer || buffer.length === 0) {
    throw new Error('Edge-TTS returned empty audio.');
  }
  return buffer;
}

async function synthesizeChunk(text, voice) {
  let lastErr;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await synthesizeChunkOnce(text, voice);
    } catch (err) {
      lastErr = err;
      console.warn(`[TTS] Attempt ${attempt}/${MAX_RETRIES} failed: ${err.message}`);
      if (attempt < MAX_RETRIES) {
        await sleep(500 * attempt); // 0.5s, 1s, 1.5s backoff
      }
    }
  }
  throw new Error(`TTS failed after ${MAX_RETRIES} attempts: ${lastErr.message}`);
}

/**
 * Converts (potentially long) text into a single MP3 audio buffer, safely,
 * by chunking it internally and retrying flaky chunks automatically.
 */
async function textToSpeech({ text, gender, language, voiceTone }) {
  const voice = pickVoice(language, gender, voiceTone);
  const textChunks = splitTextForTTS(text);
  const audioBuffers = [];
  for (let i = 0; i < textChunks.length; i++) {
    try {
      const buf = await synthesizeChunk(textChunks[i], voice);
      audioBuffers.push(buf);
    } catch (err) {
      throw new Error(`Chunk ${i + 1}/${textChunks.length} failed: ${err.message}`);
    }
  }
  return Buffer.concat(audioBuffers);
}

module.exports = { textToSpeech, ENGLISH_VOICE_TONES };
