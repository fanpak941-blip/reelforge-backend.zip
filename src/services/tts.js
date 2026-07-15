const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const VOICES_DIR = process.env.PIPER_VOICES_DIR || '/root/.local/share/piper/voices';

// 5 distinct English tones, using real (confirmed) voices
const ENGLISH_VOICE_TONES = {
  warm_friendly: 'en_US-lessac-medium',
  energetic_male: 'en_US-ryan-medium',
  calm_female: 'en_US-lessac-medium',
  deep_authoritative: 'en_US-john-medium',
  professional_female: 'en_US-hfc_female-medium',
};

const LANGUAGE_VOICES = {
  en: 'en_US-lessac-medium',
  hi: 'hi_IN-dhruva-medium',
  ur: 'hi_IN-dhruva-medium', // fallback
  es: 'es_ES-mls_10246-low',
  fr: 'fr_FR-mls_1840-low',
  de: 'de_DE-thorsten-low',
  ar: 'ar_JO-kareem-low',
};

function getVoice(language, tone) {
  if (language === 'en' && tone && ENGLISH_VOICE_TONES[tone]) {
    return ENGLISH_VOICE_TONES[tone];
  }
  return LANGUAGE_VOICES[language] || LANGUAGE_VOICES['en'];
}

async function generateTTS(text, language = 'en', tone = 'warm_friendly') {
  const voice = getVoice(language, tone);
  const tmpFile = path.join(os.tmpdir(), `tts_${Date.now()}.wav`);

  try {
    const cmd = `echo "${text.replace(/"/g, '\\"')}" | piper --model ${voice} --output_file ${tmpFile}`;
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
