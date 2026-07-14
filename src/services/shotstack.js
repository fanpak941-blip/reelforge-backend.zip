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
  // default: vertical / shorts / reels (9:16)
  return { size: { width: 1080, height: 1920 } };
}

/**
 * Builds a Shotstack "edit" JSON: background video clips (one per script line)
 * + burned-in captions per line + one continuous voiceover soundtrack.
 *
 * durationMinutes is used to evenly divide the video into per-line segments.
 */
function buildEdit({ clips, audioUrl, aspectRatio, totalDurationSeconds }) {
  const validClips = clips.filter((c) => c.videoUrl);
  const segments = validClips.length ? validClips : clips; // fallback if some searches failed
  const perClipLength = Math.max(2, totalDurationSeconds / segments.length);

  let cursor = 0;
  const videoClips = [];
  const captionClips = [];

  segments.forEach((c) => {
    if (c.videoUrl) {
      videoClips.push({
        asset: { type: 'video', src: c.videoUrl, volume: 0 },
        start: cursor,
        length: perClipLength,
        fit: 'cover',
      });
    }
    captionClips.push({
      asset: {
        type: 'title',
        text: c.line,
        style: 'minimal',
        color: '#ffffff',
        size: 'small',
        background: '#000000',
        position: 'bottom',
      },
      start: cursor,
      length: perClipLength,
    });
    cursor += perClipLength;
  });

  const { size } = resolutionFor(aspectRatio);

  return {
    timeline: {
      background: '#000000',
      tracks: [
        { clips: captionClips },
        { clips: videoClips },
      ],
      soundtrack: { src: audioUrl, effect: 'fadeOut' },
    },
    output: { format: 'mp4', size },
  };
}

async function submitRender(edit) {
  const { data } = await axios.post(`${baseUrl()}/render`, edit, {
    headers: {
      'x-api-key': config.shotstack.apiKey,
      'Content-Type': 'application/json',
    },
  });
  return data.response.id; // renderId
}

async function getRenderStatus(renderId) {
  const { data } = await axios.get(`${baseUrl()}/render/${renderId}`, {
    headers: { 'x-api-key': config.shotstack.apiKey },
  });
  return data.response; // { status, url, ... }
}

module.exports = { buildEdit, submitRender, getRenderStatus };
