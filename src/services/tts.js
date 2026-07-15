const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Where the Piper voice models live (baked into the Docker image — see Dockerfile).
const VOICES_DIR = process.env.PIPER_VOICES_DIR || '/app/voices';

// 5 distinct English tones, using real (confirmed) Piper voice names.
const ENGLISH_VOICE_TONES = {
  warm_friendly: 'en_US-amy-medium',
  energetic_male: 'en_US-ryan-medium',
  calm_female: 'en_US-lessac-medium',
  deep_authoritative: 'en_US-john-medium',
  professional_female: 'en_US-hfc_female-medium',
};

const VOICE_MAP = {
  english: { male: 'en_US-ryan-medium', female: 'en_US-amy-medium' },
  hindi: { male: 'hi_IN-pratham-medium', female: 'hi_IN-priyamvada-medium' },
  spanish: { male: 'es_ES-davefx-medium', female: 'es_ES-sharvard-medium' },
  french: { male: 'fr_FR-tom-medium', female: 'fr_FR-siwis-medium' },
  german: { male: 'de_DE-thorsten-medium', female: 'de_DE-kerstin-low' },
  // Piper currently only ships ONE Arabic voice (male) — used for both.
  arabic: { male: 'ar_JO-kareem-medium', female: 'ar_JO-kareem-medium' },
  // NOTE: Piper does not currently have an Urdu voice. We fall back to the
  // closest available option (Hindi) until a dedicated Urdu model exists.
  // Pronunciation will not be perfect for Urdu-specific sounds/script.
  urdu: { male: 'hi_IN-pratham-medium', female: 'hi_IN-priyamvada-medium' },
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

/**
 * Runs the local `piper` CLI as a subprocess: feeds it text on stdin,
 * gets back a WAV file. No network call, no API key, no billing —
 * this all runs on our own Railway server.
 */
function synthesizeWithPiper(text, voice) {
  return new Promise((resolve, reject) => {
    const tmpFile = path.join(
      os.tmpdir(),
      `piper-${Date.now()}-${Math.random().toString(36).slice(2)}.wav`
    );
    const args = [
      '--model', voice,
      '--data-dir', VOICES_DIR,
      '--download-dir', VOICES_DIR,
      '--output_file', tmpFile,
    ];

    const proc = spawn('piper', args);
    let stderr = '';

    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('error', (err) => {
      reject(new Error(`Failed to start Piper (is it installed?): ${err.message}`));
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`Piper exited with code ${code}: ${stderr.slice(-500) || 'no output'}`));
      }
      fs.readFile(tmpFile, (err, data) => {
        fs.unlink(tmpFile, () => {}); // best-effort cleanup, ignore errors
        if (err) return reject(new Error(`Piper did not produce an audio file: ${err.message}`));
        if (!data || data.length === 0) return reject(new Error('Piper produced an empty audio file.'));
        resolve(data);
      });
    });

    proc.stdin.write(text, 'utf8');
    proc.stdin.end();
  });
}

/**
 * Converts text into a WAV audio buffer using the self-hosted Piper engine.
 * Unlike the old msedge-tts approach, Piper runs locally — no network
 * round-trip, no connection drops, no rate limits, no billing.
 */
async function textToSpeech({ text, gender, language, voiceTone }) {
  const voice = pickVoice(language, gender, voiceTone);
  return synthesizeWithPiper(text, voice);
}

module.exports = { textToSpeech, ENGLISH_VOICE_TONES };
