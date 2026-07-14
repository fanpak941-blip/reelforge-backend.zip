const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const jobStore = require('../jobStore');
const gemini = require('../services/gemini');
const tts = require('../services/tts');
const pexels = require('../services/pexels');
const shotstack = require('../services/shotstack');

const router = express.Router();
const upload = multer(); // parses multipart/form-data (no file uploads needed, just fields)

const AUDIO_DIR = path.join(__dirname, '..', '..', 'public', 'audio');
if (!fs.existsSync(AUDIO_DIR)) fs.mkdirSync(AUDIO_DIR, { recursive: true });

// POST /api/generate  -> kicks off a video generation job, returns { jobId } immediately
router.post('/generate', upload.none(), async (req, res) => {
  try {
    const {
      scriptText,
      topic,
      niche,
      durationMinutes,
      language,
      gender,
      aspectRatio,
      style,
    } = req.body;

    if (!scriptText && !topic) {
      return res.status(400).json({ error: 'Please provide a script or a topic.' });
    }

    // Phase 1 only supports real-life stock footage. AI Avatar / Image-to-Video /
    // Mixed are planned for Phase 2 — fall back to stock footage instead of failing.
    const usingFallbackStyle = style && style !== 'stock';

    const jobId = uuidv4();
    jobStore.createJob(jobId);

    // Figure out the public base URL of THIS server (needed so Shotstack can
    // fetch the voiceover file we generate below).
    const publicBaseUrl = `${req.protocol}://${req.get('host')}`;

    // Run the actual pipeline in the background; respond to the client immediately.
    processJob(jobId, {
      scriptText,
      topic,
      niche: niche || 'general',
      durationMinutes: Number(durationMinutes) || 3,
      language: language || 'English',
      gender: gender || 'female',
      aspectRatio: aspectRatio || '9:16',
      publicBaseUrl,
      usingFallbackStyle,
    }).catch((err) => {
      console.error(`Job ${jobId} crashed:`, err);
      jobStore.failJob(jobId, err.message || 'Unexpected error');
    });

    res.json({ jobId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to start video generation.' });
  }
});

// GET /api/generate/:jobId/status -> polled by the frontend every few seconds
router.get('/generate/:jobId/status', (req, res) => {
  const job = jobStore.getJob(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found.' });
  res.json(job);
});

async function processJob(jobId, params) {
  const {
    scriptText, topic, niche, durationMinutes, language, gender, aspectRatio, publicBaseUrl,
    usingFallbackStyle,
  } = params;

  // 1) Script
  jobStore.setProgress(jobId, 'Writing script', 10);
  const finalScript = scriptText && scriptText.split(' ').length > 25
    ? scriptText
    : await gemini.generateScriptFromTopic({ topic: topic || scriptText, niche, durationMinutes, language });

  // 2) Voiceover
  jobStore.setProgress(jobId, 'Recording voiceover', 30);
  const audioBuffer = await tts.textToSpeech({ text: finalScript, gender, language });
  const audioFileName = `${jobId}.mp3`;
  fs.writeFileSync(path.join(AUDIO_DIR, audioFileName), audioBuffer);
  const audioUrl = `${publicBaseUrl}/audio/${audioFileName}`;

  // 3) Matching stock footage
  jobStore.setProgress(jobId, 'Finding visuals', 55);
  const clips = await pexels.findClipsForScript(finalScript, niche, aspectRatio);

  // 4) Assemble & render
  jobStore.setProgress(jobId, 'Building your video', 70);
  const totalDurationSeconds = Math.max(20, durationMinutes * 60);
  const edit = shotstack.buildEdit({ clips, audioUrl, aspectRatio, totalDurationSeconds });
  const renderId = await shotstack.submitRender(edit);

  // 5) Poll Shotstack until done
  let status = 'queued';
  let videoUrl = null;
  const maxAttempts = 120; // ~10 minutes at 5s intervals
  for (let i = 0; i < maxAttempts; i++) {
    await sleep(5000);
    const render = await shotstack.getRenderStatus(renderId);
    status = render.status;

    if (status === 'done') {
      videoUrl = render.url;
      break;
    }
    if (status === 'failed') {
      throw new Error(render.error || 'Video rendering failed.');
    }

    // Map Shotstack's stages to a friendly progress percentage (70% -> 98%)
    const stageProgress = { queued: 72, fetching: 78, rendering: 88, saving: 95 };
    jobStore.setProgress(jobId, 'Rendering video', stageProgress[status] || 80);
  }

  if (!videoUrl) throw new Error('Video render timed out. Please try again.');

  jobStore.completeJob(jobId, {
    videoPath: videoUrl,
    script: finalScript,
    note: usingFallbackStyle
      ? 'AI Avatar / Image-to-Video / Mixed styles are coming in Phase 2 — this video was generated using real-life stock footage instead.'
      : undefined,
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = router;
