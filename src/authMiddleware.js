const jwt = require('jsonwebtoken');
const User = require('./models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'reelforge_secret';

async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    // Must have Bearer token
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    const token = authHeader.replace('Bearer ', '').trim();

    // Verify token
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Session expired. Please login again.' });
      }
      return res.status(401).json({ error: 'Invalid token.' });
    }

    // Fetch fresh user from DB
    const user = await User.findById(decoded.id).select('-password -verificationToken -resetPasswordToken');
    if (!user) {
      return res.status(401).json({ error: 'Account not found.' });
    }

    req.user = user;
    next();
  } catch (err) {
    console.error('[Auth] Middleware error:', err.message);
    return res.status(500).json({ error: 'Authentication error.' });
  }
}

// Optional auth — doesn't block if no token
async function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return next();
    const token = authHeader.replace('Bearer ', '').trim();
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password -verificationToken');
    if (user) req.user = user;
  } catch {}
  next();
}

module.exports = { requireAuth, optionalAuth };
