const axios = require('axios');
const config = require('../config');

/**
 * Splits a script into sentences.
 */
function splitIntoSentences(script) {
  return script
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Splits a script into a manageable number of "lines" (segments), each of
 * which will get its own matching background video clip + caption.
 *
 * Long scripts (10-30 min videos) can have hundreds of sentences. Making one
 * Pexels API call + one Shotstack clip per sentence would be slow and could
 * hit Pexels' rate limit (200 req/hr on the free tier) or Shotstack's clip
 * limits. So we cap the number of segments and merge consecutive sentences
 * together to hit that cap, while keeping segments reasonably short (good
 * for caption readability).
 */
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

/**
 * Pulls the most "visual" keyword out of a sentence to search Pexels with.
 * Very simple heuristic: strip common stop-words, keep the longest remaining words.
 */
const STOP_WORDS = new Set([
  'the','a','an','is','are','was','were','be','been','to','of','in','on','for',
  'and','or','but','with','this','that','it','its','as','at','by','from','you',
  'your','we','our','they','their','he','she','his','her','not','so','just',
  'if','then','than','will','can','could','would','should','into','about',
]);

function extractKeyword(line, niche) {
  const words = line
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOP_WORDS.has(w));

  words.sort((a, b) => b.length - a.length);
  const keyword = words.slice(0, 2).join(' ');
  return keyword ? `${keyword} ${niche || ''}`.trim() : (niche || 'lifestyle');
}

function orientationFor(aspectRatio) {
  if (aspectRatio === '16:9') return 'landscape';
  if (aspectRatio === '1:1') return 'square';
  return 'portrait'; // 9:16 and 4:5
}

/**
 * Finds one matching real-life stock video clip per script line.
 */
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
