const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const VOICES_DIR = process.env.PIPER_VOICES_DIR || '/root/.local/share/piper/voices';

const ENGLISH_VOICE_TONES = {
  warm_friendly: 'en_US-lessac-medium',
  energetic_male: 'en_US-ryan-medium',
  calm_female: 'en_US-lessac-medium',
  deep_authoritative: 'en_US-john-medium',
  professional_female: 'en_US-hfc_female-medium',
};

const LANGUAGE_VOICES = {
  en: 'en_US-lessac-medium',
  english: 'en_US-lessac-medium',
  hi: 'en_US-lessac-medium',
  ur: 'en_US-lessac-medium',
  es: 'es_ES-mls_10246-low',
  fr: 'fr_FR-mls_1840-low',
  de: 'de_DE-thorsten-low',
  ar: 'ar_JO-kareem-low',
};

function getVoice(language, tone) {
  const lang = (language || 'en').toLowerCase();
  if ((lang === 'en' || lang === 'english') && tone && ENGLISH_VOICE_TONES[tone]) {
    return ENGLISH_VOICE_TONES[tone];
  }
  return LANGUAGE_VOICES[lang] || LANGUAGE_VOICES['en'];
}

async function generateTTS(text, language = 'en', tone = 'warm_friendly') {
  const voice = getVoice(language, tone);
  const tmpFile = path.join(os.tmpdir(), `tts_${Date.now()}.wav`);

  try {
    const cmd = `echo "${text.replace(/"/g, '\\"').replace(/`/g, '\\`')}" | piper --model ${voice} --output_file ${tmpFile}`;
    execSync(cmd, { stdio: 'pipe' });

    const audioBuffer = fs.readFileSync(tmpFile);
    fs.unlinkSync(tmpFile);
    return audioBuffer;
  } catch (err) {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    throw new Error(`TTS failed: ${err.message}`);
  }
}

module.exports = { generateTTS };
