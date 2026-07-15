const axios = require('axios');
const config = require('../config');

function baseUrl() {
  // 'stage' = free, watermarked, good for testing
  // 'v1' = production/paid, no watermark
  return `https://api.shotstack.io/edit/${config.shotstack.env}`;
}

function resolutionFor(aspectRatio) {
  if (aspectRatio === '16:9') return { size: { width: 1920, height: 1080 } };
  if (aspectRatio === '1:1') return { size: { width: 1080, height: 1080 } };
  if (aspectRatio === '4:5') return { size: { width: 1080, height: 1350 } };
  return { size: { width: 1080, height: 1920 } }; // default: vertical shorts/reels
}

// Royalty-free background music hosted on Shotstack's own public asset bucket.
const MUSIC_PRESETS = {
  none: null,
  energetic: 'https://s3-ap-southeast-2.amazonaws.com/shotstack-assets/music/disco.mp3',
  cinematic: 'https://shotstack-assets.s3-ap-southeast-2.amazonaws.com/music/unminus/lit.mp3',
  ambient: 'https://shotstack-assets.s3-ap-southeast-2.amazonaws.com/music/freepd/motions.mp3',
};

// 10 CapCut-inspired caption presets — font, stroke, background box and
// vertical position of the auto-generated word-by-word captions.
const CAPTION_STYLES = {
  classic_white: {
    font: { color: '#FFFFFF', family: 'Montserrat ExtraBold', size: 44, lineHeight: 1, stroke: '#000000', strokeWidth: 4 },
    margin: { bottom: 0.14 },
  },
  yellow_pop: {
    font: { color: '#FFD400', family: 'Montserrat ExtraBold', size: 46, lineHeight: 1, stroke: '#000000', strokeWidth: 4 },
    margin: { bottom: 0.14 },
  },
  black_box: {
    font: { color: '#FFFFFF', family: 'Montserrat ExtraBold', size: 40, lineHeight: 1 },
    background: { color: '#000000', opacity: 0.75, borderRadius: 12, padding: 20 },
    margin: { bottom: 0.14 },
  },
  neon_green: {
    font: { color: '#39FF14', family: 'Montserrat ExtraBold', size: 44, lineHeight: 1, stroke: '#000000', strokeWidth: 4 },
    margin: { bottom: 0.14 },
  },
  minimal_top: {
    font: { color: '#FFFFFF', family: 'Montserrat', size: 32, lineHeight: 1, stroke: '#000000', strokeWidth: 2 },
    margin: { top: 0.08 },
  },
  bold_red: {
    font: { color: '#FF3B30', family: 'Montserrat ExtraBold', size: 46, lineHeight: 1, stroke: '#000000', strokeWidth: 4 },
    margin: { bottom: 0.14 },
  },
  gradient_blue: {
    font: { color: '#4FC3F7', family: 'Montserrat ExtraBold', size: 44, lineHeight: 1, stroke: '#0D1B2A', strokeWidth: 4 },
    margin: { bottom: 0.14 },
  },
  pink_highlight: {
    font: { color: '#D6006D', family: 'Montserrat ExtraBold', size: 40, lineHeight: 1 },
    background: { color: '#FFFFFF', opacity: 0.9, borderRadius: 10, padding: 16 },
    margin: { bottom: 0.14 },
  },
  large_center: {
    font: { color: '#FFFFFF', family: 'Montserrat ExtraBold', size: 56, lineHeight: 1, stroke: '#000000', strokeWidth: 5 },
    margin: { bottom: 0.4 },
  },
  subtitle_classic: {
    font: { color: '#FFFFFF', family: 'Open Sans', size: 28, lineHeight: 1 },
    background: { color: '#000000', opacity: 0.6, borderRadius: 4, padding: 10 },
    margin: { bottom: 0.08 },
  },
};

/**
 * Builds a Shotstack "edit" JSON:
 *  - background video clips (one per script line), matched to visuals
 *  - one continuous voiceover audio clip (aliased "speech")
 *  - CapCut-style auto-generated word-by-word captions, driven directly off
 *    the voiceover audio via Shotstack's built-in speech-to-text captioning
 *  - optional background music, mixed quietly under the voiceover
 */
function buildEdit({ clips, audioUrl, aspectRatio, totalDurationSeconds, musicStyle, captionStyle }) {
  const validClips = clips.filter((c) => c.videoUrl);
  const segments = validClips.length ? validClips : clips;
  const perClipLength = Math.max(2, totalDurationSeconds / segments.length);

  let cursor = 0;
  const videoClips = [];
  segments.forEach((c) => {
    if (c.videoUrl) {
      videoClips.push({
        asset: { type: 'video', src: c.videoUrl, volume: 0 },
        start: cursor,
        length: perClipLength,
        fit: 'cover',
      });
    }
    cursor += perClipLength;
  });

  const audioClips = [
    {
      alias: 'speech',
      asset: { type: 'audio', src: audioUrl, volume: 1 },
      start: 0,
      length: totalDurationSeconds,
    },
  ];

  const style = CAPTION_STYLES[captionStyle] || CAPTION_STYLES.classic_white;
  const captionClips = [
    {
      asset: {
        type: 'caption',
        src: 'alias://speech',
        font: style.font,
        ...(style.background ? { background: style.background } : {}),
        margin: style.margin,
      },
      start: 0,
      length: totalDurationSeconds,
    },
  ];

  const { size } = resolutionFor(aspectRatio);
  const musicSrc = MUSIC_PRESETS[musicStyle] || null;

  const timeline = {
    background: '#000000',
    tracks: [
      { clips: captionClips }, // top layer
      { clips: videoClips },
      { clips: audioClips },
    ],
  };

  if (musicSrc) {
    timeline.soundtrack = { src: musicSrc, effect: 'fadeOut', volume: 0.15 };
  }

  return { timeline, output: { format: 'mp4', size } };
}

async function submitRender(edit) {
  const { data } = await axios.post(`${baseUrl()}/render`, edit, {
    headers: { 'x-api-key': config.shotstack.apiKey, 'Content-Type': 'application/json' },
  });
  return data.response.id;
}

async function getRenderStatus(renderId) {
  const { data } = await axios.get(`${baseUrl()}/render/${renderId}`, {
    headers: { 'x-api-key': config.shotstack.apiKey },
  });
  return data.response;
}

module.exports = { buildEdit, submitRender, getRenderStatus, CAPTION_STYLES };
