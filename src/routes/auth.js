const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const passport = require('passport');
const nodemailer = require('nodemailer');
const User = require('../models/User');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'reelforge_secret';
const OWNER_EMAIL = process.env.OWNER_EMAIL;
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://reelforge2.vercel.app';

function generateToken(user) {
  return jwt.sign(
    { id: user._id, email: user.email, plan: user.plan },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

async function sendVerificationEmail(email, token) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  const verifyUrl = `${process.env.BACKEND_URL || 'https://reelforge-backendzip-production.up.railway.app'}/api/auth/verify-email?token=${token}`;

  await transporter.sendMail({
    from: `"ReelForge" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: 'Verify your ReelForge account',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto;">
        <h2 style="color:#1A56DB;">Welcome to ReelForge! 🎬</h2>
        <p>Click the button below to verify your email address:</p>
        <a href="${verifyUrl}" style="display:inline-block;background:#1A56DB;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;">Verify Email</a>
        <p style="color:#94A3B8;font-size:13px;margin-top:16px;">Link expires in 24 hours.</p>
      </div>
    `,
  });
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { name, password } = req.body;
    const email = (req.body.email || '').trim().toLowerCase();
    if (!name || !email || !password)
      return res.status(400).json({ error: 'All fields are required.' });
    if (password.length < 8)
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });

    const existing = await User.findOne({ email });
    if (existing)
      return res.status(400).json({ error: 'Email already registered.' });

    const verificationToken = crypto.randomBytes(32).toString('hex');
    const plan = email === OWNER_EMAIL ? 'owner' : 'free';

    const user = await User.create({
      name, email, password, verificationToken, plan,
      isVerified: email === OWNER_EMAIL,
    });

    if (email !== OWNER_EMAIL) {
      sendVerificationEmail(email, verificationToken).catch((err) => {
        console.error('Failed to send verification email:', err.message);
      });
    }

    const token = generateToken(user);
    res.json({
      token,
      user: { id: user._id, name: user.name, email: user.email, plan: user.plan, avatar: user.avatar, isVerified: user.isVerified },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { password } = req.body;
    const email = (req.body.email || '').trim().toLowerCase();
    if (!email || !password)
      return res.status(400).json({ error: 'Email and password required.' });

    // FIX: check user exists before calling comparePassword
    const user = await User.findOne({ email });
    if (!user)
      return res.status(400).json({ error: 'Invalid email or password.' });

    const match = await user.comparePassword(password);
    if (!match)
      return res.status(400).json({ error: 'Invalid email or password.' });

    // Always fetch fresh plan from DB so token reflects latest plan
    const token = generateToken(user);
    res.json({
      token,
      user: { id: user._id, name: user.name, email: user.email, plan: user.plan, avatar: user.avatar, isVerified: user.isVerified },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/verify-email
router.get('/verify-email', async (req, res) => {
  try {
    const { token } = req.query;
    const user = await User.findOne({ verificationToken: token });
    if (!user)
      return res.redirect(`${FRONTEND_URL}?verified=false`);

    user.isVerified = true;
    user.verificationToken = undefined;
    await user.save();

    res.redirect(`${FRONTEND_URL}?verified=true`);
  } catch (err) {
    res.redirect(`${FRONTEND_URL}?verified=false`);
  }
});

// GET /api/auth/google
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

// GET /api/auth/google/callback
router.get('/google/callback',
  passport.authenticate('google', { failureRedirect: `${FRONTEND_URL}?error=google_failed` }),
  (req, res) => {
    // FIX: fetch fresh user so plan is always up to date
    const token = generateToken(req.user);
    res.redirect(`${FRONTEND_URL}?token=${token}`);
  }
);

// GET /api/auth/me  — refresh user info (called on page load)
router.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'No token.' });
    const token = authHeader.replace('Bearer ', '');
    const decoded = jwt.verify(token, JWT_SECRET);

    // Always return fresh data from DB — not just what's in the token
    const user = await User.findById(decoded.id).select('-password -verificationToken');
    if (!user) return res.status(404).json({ error: 'User not found.' });

    res.json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        plan: user.plan,
        avatar: user.avatar,
        isVerified: user.isVerified,
        videosGenerated: user.videosGenerated,
      }
    });
  } catch (err) {
    res.status(401).json({ error: 'Invalid token.' });
  }
});

module.exports = router;
