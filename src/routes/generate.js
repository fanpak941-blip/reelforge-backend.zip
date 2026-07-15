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
const upload = multer({ limits: { fieldSize: 2 * 1024 * 1024 } }); // 2MB per field — covers 30,000-char scripts

const AUDIO_DIR = path.join(__dirname, '..', '..', 'public', 'audio');
if (!fs.existsSync(AUDIO_DIR)) fs.mkdirSync(AUDIO_DIR, { recursive: true });

// POST /api/write-script -> "Write Script for Me" button.
// Just generates the script text and returns it — does NOT start a video.
router.post('/write-script', upload.none(), async (req, res) => {
  try {
    const { topic, niche, wordCount, language } = req.body;
    if (!topic) return res.status(400).json({ error: 'Please provide a topic or title.' });

    const script = await gemini.generateScriptFromTopic({
      topic,
      niche: niche || 'general',
      wordCount: Number(wordCount) || 300,
      language: language || 'English',
    });

    res.json({ script });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Failed to write script.' });
  }
});

// POST /api/generate  -> kicks off a video generation job, returns { jobId } immediately
router.post('/generate', upload.none(), async (req, res) => {
  try {
    const {
      scriptText,
      topic,
      niche,
      language,
      gender,
      aspectRatio,
      style,
      voiceTone,
      musicStyle,
      captionStyle,
    } = req.body;

    if (!scriptText && !topic) {
      return res.status(400).json({ error: 'Please provide a script or a topic.' });
    }

    // Phase 1 only supports real-life stock footage. AI Avatar / Image-to-Video /
    // Mixed are planned for Phase 2 — fall back to stock footage instead of failing.
    const usingFallbackStyle = style && style !== 'stock';

    const jobId = uuidv4();
    jobStore.createJob(jobId);

    const publicBaseUrl = `${req.protocol}://${req.get('host')}`;

    processJob(jobId, {
      scriptText,
      topic,
      niche: niche || 'general',
      language: language || 'English',
      gender: gender || 'female',
      aspectRatio: aspectRatio || '9:16',
      voiceTone: voiceTone || null,
      musicStyle: musicStyle || 'none',
      captionStyle: captionStyle || 'classic_white',
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
    scriptText, topic, niche, language, gender, aspectRatio, publicBaseUrl,
    voiceTone, musicStyle, captionStyle, usingFallbackStyle,
  } = params;

  // 1) Script
  jobStore.setProgress(jobId, 'Writing script', 10);
  let finalScript;
  try {
    finalScript = scriptText && scriptText.split(' ').length > 25
      ? scriptText
      : await gemini.generateScriptFromTopic({ topic: topic || scriptText, niche, durationMinutes: 3, language });
  } catch (err) {
    throw new Error(`[Script/Gemini] ${err.message}`);
  }

  // Auto-duration: video length is always derived from the actual script
  // length (≈150 spoken words/minute) — no manual duration picker needed.
  const wordCount = finalScript.split(/\s+/).filter(Boolean).length;
  const totalDurationSeconds = Math.max(20, Math.round((wordCount / 150) * 60));

  // 2) Voiceover
  jobStore.setProgress(jobId, 'Recording voiceover', 30);
  let audioUrl;
  try {
    const audioBuffer = await tts.textToSpeech({ text: finalScript, gender, language, voiceTone });
    const audioFileName = `${jobId}.wav`;
    fs.writeFileSync(path.join(AUDIO_DIR, audioFileName), audioBuffer);
    audioUrl = `${publicBaseUrl}/audio/${audioFileName}`;
  } catch (err) {
    throw new Error(`[Voiceover/TTS] ${err.message}`);
  }

  // 3) Matching stock footage
  jobStore.setProgress(jobId, 'Finding visuals', 55);
  let clips;
  try {
    clips = await pexels.findClipsForScript(finalScript, niche, aspectRatio);
  } catch (err) {
    throw new Error(`[Visuals/Pexels] ${err.message}`);
  }

  // 4) Assemble & render
  jobStore.setProgress(jobId, 'Building your video', 70);
  const edit = shotstack.buildEdit({ clips, audioUrl, aspectRatio, totalDurationSeconds, musicStyle, captionStyle });
  let renderId;
  try {
    renderId = await shotstack.submitRender(edit);
  } catch (err) {
    throw new Error(`[Render/Shotstack] ${err.message}`);
  }

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
      throw new Error(`[Render/Shotstack] ${render.error || 'Video rendering failed.'}`);
    }

    const stageProgress = { queued: 72, fetching: 78, rendering: 88, saving: 95 };
    jobStore.setProgress(jobId, 'Rendering video', stageProgress[status] || 80);
  }

  if (!videoUrl) throw new Error('Video render timed out. Please try again.');

  jobStore.completeJob(jobId, {
    videoPath: videoUrl,
    script: finalScript,
    durationSeconds: totalDurationSeconds,
    note: usingFallbackStyle
      ? 'AI Avatar / Image-to-Video / Mixed styles are coming in Phase 2 — this video was generated using real-life stock footage instead.'
      : undefined,
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = router;
