const axios = require('axios');
const config = require('../config');

function splitIntoSentences(script) {
  return script
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function splitIntoLines(script, maxSegments = 40) {
  const sentences = splitIntoSentences(script);
  if (sentences.length <= maxSegments) return sentences;
  const groupSize = Math.ceil(sentences.length / maxSegments);
  const lines = [];
  for (let i = 0; i < sentences.length; i += groupSize) {
    lines.push(sentences.slice(i, i + groupSize).join(' '));
  }
  return lines;
}

const STOP_WORDS = new Set([
  'the','a','an','is','are','was','were','be','been','to','of','in','on','for',
  'and','or','but','with','this','that','it','its','as','at','by','from','you',
  'your','we','our','they','their','he','she','his','her','not','so','just',
  'if','then','than','will','can','could','would','should','into','about',
  'have','has','had','what','when','where','who','how','which','there','here',
  'very','more','most','some','many','much','also','even','only','still',
]);

// Topic keywords jo visual se match hon
const TOPIC_VISUAL_MAP = {
  kidney: 'kidney health medical',
  health: 'healthy lifestyle wellness',
  medicine: 'medicine doctor hospital',
  pill: 'medicine pills pharmacy',
  drug: 'pharmacy medication',
  doctor: 'doctor hospital medical',
  heart: 'heart health cardiology',
  brain: 'brain neurology mental',
  cancer: 'cancer treatment hospital',
  diabetes: 'diabetes blood sugar health',
  weight: 'weight loss fitness gym',
  diet: 'healthy food diet nutrition',
  exercise: 'exercise workout fitness',
  sleep: 'sleeping rest bedroom',
  stress: 'stress anxiety mental health',
  money: 'money finance business',
  invest: 'investment stock market',
  crypto: 'cryptocurrency bitcoin trading',
  business: 'business office corporate',
  food: 'food cooking kitchen',
  travel: 'travel adventure landscape',
  nature: 'nature outdoor landscape',
  technology: 'technology computer digital',
  ai: 'artificial intelligence technology',
};

function extractKeyword(line, niche) {
  const lower = line.toLowerCase().replace(/[^a-z0-9\s]/g, '');

  // Topic map se check karo
  for (const [key, visual] of Object.entries(TOPIC_VISUAL_MAP)) {
    if (lower.includes(key)) return visual;
  }

  // Fallback — longest meaningful words
  const words = lower
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOP_WORDS.has(w));
  words.sort((a, b) => b.length - a.length);
  const keyword = words.slice(0, 2).join(' ');
  return keyword ? `${keyword} ${niche || ''}`.trim() : (niche || 'lifestyle');
}

function orientationFor(aspectRatio) {
  if (aspectRatio === '16:9') return 'landscape';
  if (aspectRatio === '1:1') return 'square';
  return 'portrait';
}

async function findClipsForScript(script, niche, aspectRatio) {
  const lines = splitIntoLines(script);
  const orientation = orientationFor(aspectRatio);
  const clips = [];
  for (const line of lines) {
    const query = extractKeyword(line, niche);
    try {
      const { data } = await axios.get('https://api.pexels.com/videos/search', {
        headers: { Authorization: config.pexels.apiKey },
        params: { query, per_page: 3, orientation },
      });
      const video = data.videos?.[0];
      const file =
        video?.video_files?.find((f) => f.quality === 'hd') || video?.video_files?.[0];
      clips.push({
        line,
        query,
        videoUrl: file?.link || null,
      });
    } catch {
      clips.push({ line, query, videoUrl: null });
    }
  }
  return clips;
}

module.exports = { findClipsForScript, splitIntoLines };
