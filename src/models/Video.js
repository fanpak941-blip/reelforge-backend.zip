const mongoose = require('mongoose');

const videoSchema = new mongoose.Schema({
  userId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title:    { type: String, default: 'Untitled Video' },
  script:   { type: String },
  videoUrl: { type: String, required: true },
  duration: { type: Number, default: 0 },
  niche:    { type: String, default: 'general' },
  language: { type: String, default: 'English' },
  aspectRatio: { type: String, default: '9:16' },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Video', videoSchema);
