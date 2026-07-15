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
// Chunks are kept small (300 chars) because SMALLER requests are also less
// likely to hit the "stream closed before turn.end" connection-drop bug below.
const MAX_CHARS_PER_CHUNK = 300;
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

// msedge-tts is an UNOFFICIAL wrapper around Microsoft Edge's internal
// "Read Aloud" service. Because it's not a real, supported API, Microsoft's
// server occasionally drops the connection mid-stream — especially from
// cloud/datacenter IPs like Railway's. This is NOT something our code can
// prevent outright, so instead we retry automatically with a short backoff.
const MAX_RETRIES = 4;

function synthesizeChunkOnce(text, voice) {
  return new Promise(async (resolve, reject) => {
    let settled = false;
    let receivedAnyData = false;
    const chunks = [];

    // Safety timeout in case neither "end" nor "error" ever fires.
    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error('TTS request timed out (no response after 20s).'));
      }
    }, 20000);

    try {
      const tts = new MsEdgeTTS();
      await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
      const { audioStream } = tts.toStream(text);

      audioStream.on('data', (c) => {
        receivedAnyData = true;
        chunks.push(c);
      });
      audioStream.on('end', () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (!receivedAnyData || Buffer.concat(chunks).length === 0) {
          reject(new Error('Stream closed before the synthesis completed (no audio received).'));
        } else {
          resolve(Buffer.concat(chunks));
        }
      });
      audioStream.on('error', (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        reject(err);
      });
      audioStream.on('close', () => {
        // If "close" fires without "end" or "error" having settled things,
        // treat it as the known "stream closed early" failure.
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (!receivedAnyData || Buffer.concat(chunks).length === 0) {
          reject(new Error('Stream closed before the synthesis completed (no turn.end received).'));
        } else {
          resolve(Buffer.concat(chunks));
        }
      });
    } catch (err) {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        reject(err);
      }
    }
  });
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
