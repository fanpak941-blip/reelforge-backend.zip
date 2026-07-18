const express = require('express');
const { requireAuth } = require('../authMiddleware');
const Video = require('../models/Video');

const router = express.Router();

// GET /api/videos — get all videos for logged-in user
router.get('/videos', requireAuth, async (req, res) => {
  try {
    const videos = await Video.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(50);
    res.json({ videos });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch videos.' });
  }
});

// DELETE /api/videos/:id — delete a video
router.delete('/videos/:id', requireAuth, async (req, res) => {
  try {
    const video = await Video.findOne({ _id: req.params.id, userId: req.user._id });
    if (!video) return res.status(404).json({ error: 'Video not found.' });
    await video.deleteOne();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete video.' });
  }
});

module.exports = router;
