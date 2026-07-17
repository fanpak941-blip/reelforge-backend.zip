const jwt = require('jsonwebtoken');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'reelforge_secret';

const PLAN_LIMITS = {
  free: 3,
  pro: 50,
  owner: Infinity,
};

async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Login required.' });

    const token = authHeader.replace('Bearer ', '');
    const decoded = jwt.verify(token, JWT_SECRET);

    const user = await User.findById(decoded.id);
    if (!user) return res.status(401).json({ error: 'User not found.' });

    req.user = user;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

async function checkVideoLimit(req, res, next) {
  const user = req.user;

  // Reset monthly count
  const now = new Date();
  const lastReset = new Date(user.lastReset);
  if (now.getMonth() !== lastReset.getMonth() || now.getFullYear() !== lastReset.getFullYear()) {
    user.videosGenerated = 0;
    user.lastReset = now;
    await user.save();
  }

  const limit = PLAN_LIMITS[user.plan] || 3;
  if (user.videosGenerated >= limit) {
    return res.status(403).json({
      error: `Monthly limit reached. You have used ${user.videosGenerated}/${limit} videos. Upgrade to Pro for more.`,
      upgradeRequired: true,
    });
  }

  next();
}

async function incrementVideoCount(userId) {
  await User.findByIdAndUpdate(userId, { $inc: { videosGenerated: 1 } });
}

module.exports = { requireAuth, checkVideoLimit, incrementVideoCount };
