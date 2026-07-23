if (!global.crypto) {
  global.crypto = require('crypto').webcrypto;
}

const express = require('express');
const cors = require('cors');
const path = require('path');
const session = require('express-session');
const passport = require('passport');
const mongoose = require('mongoose');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const hpp = require('hpp');

const config = require('./config');
const generateRoutes = require('./routes/generate');
const authRoutes = require('./routes/auth');
const videoRoutes = require('./routes/videos');
const stripeRoutes = require('./routes/stripe');
const avatarRoutes = require('./routes/did');

// MongoDB connect
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB error:', err));

// Google OAuth
const { Strategy: GoogleStrategy } = require('passport-google-oauth20');
const User = require('./models/User');
const OWNER_EMAIL = process.env.OWNER_EMAIL;

passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: '/api/auth/google/callback',
}, async (accessToken, refreshToken, profile, done) => {
  try {
    let user = await User.findOne({ googleId: profile.id });
    if (!user) {
      user = await User.findOne({ email: profile.emails[0].value });
      if (user) {
        user.googleId = profile.id;
        user.isVerified = true;
        await user.save();
      } else {
        const email = profile.emails[0].value;
        user = await User.create({
          name: profile.displayName,
          email,
          googleId: profile.id,
          avatar: profile.photos[0]?.value,
          isVerified: true,
          plan: email === OWNER_EMAIL ? 'owner' : 'starter',
        });
      }
    }
    return done(null, user);
  } catch (err) {
    return done(err);
  }
}));

passport.serializeUser((user, done) => done(null, user._id));
passport.deserializeUser(async (id, done) => {
  const user = await User.findById(id);
  done(null, user);
});

const app = express();

// Trust Railway proxy
app.set('trust proxy', 1);

// ─── SECURITY HEADERS (Helmet) ───────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://js.stripe.com", "https://cdn.jsdelivr.net"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      connectSrc: ["'self'", "https://api.stripe.com", "https://api.d-id.com"],
      frameSrc: ["https://js.stripe.com"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// ─── CORS ────────────────────────────────────────────────────────────────────
// CORS — allow all Vercel previews + localhost
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.options('*', cors());

// ─── RATE LIMITING ───────────────────────────────────────────────────────────
// General API limit
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 100,
  message: { error: 'Too many requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Strict limit for auth routes (prevent brute force)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many login attempts. Please wait 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Strict limit for generate (prevent abuse)
const generateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20,
  message: { error: 'Too many generation requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', generalLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/generate', generateLimiter);

// ─── STRIPE WEBHOOK (raw body before JSON parser) ────────────────────────────
app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }));

// ─── BODY PARSING ────────────────────────────────────────────────────────────
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// ─── MONGO SANITIZE (prevent NoSQL injection) ────────────────────────────────
app.use(mongoSanitize());

// ─── HPP (prevent HTTP param pollution) ─────────────────────────────────────
app.use(hpp());

// ─── SESSION ─────────────────────────────────────────────────────────────────
app.use(session({
  secret: process.env.JWT_SECRET || 'reelforge_secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  },
}));

app.use(passport.initialize());
app.use(passport.session());

// ─── STATIC FILES ────────────────────────────────────────────────────────────
app.use('/audio', express.static(path.join(__dirname, '..', 'public', 'audio')));

// ─── HEALTH CHECK ────────────────────────────────────────────────────────────
app.get('/', (req, res) => res.json({ status: 'ok', service: 'ReelForge API' }));
app.get('/health', (req, res) => res.json({ ok: true, ts: Date.now() }));

// ─── ROUTES ──────────────────────────────────────────────────────────────────
// Voice preview endpoint — returns audio buffer
app.post('/api/voice-preview', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Login required.' });
    
    const { text, voice, language } = req.body;
    const tts = require('./services/tts');
    
    const voiceParts = (voice || 'english-warm_friendly').split('-');
    const lang = voiceParts[0].charAt(0).toUpperCase() + voiceParts[0].slice(1);
    const tone = voiceParts.slice(1).join('_');
    const gender = voice && voice.includes('male') && !voice.includes('female') ? 'male' : 'female';
    
    const sampleText = text || 'Hello! Welcome to ReelForge AI video platform.';
    const audioBuffer = await tts.generateTTS(sampleText.slice(0, 200), lang, tone, gender);
    
    res.set('Content-Type', 'audio/mpeg');
    res.send(audioBuffer);
  } catch (err) {
    console.error('[Voice Preview]', err.message);
    res.status(500).json({ error: 'Voice preview failed.' });
  }
});


app.use('/api/auth', authRoutes);
app.use('/api', generateRoutes);
app.use('/api', videoRoutes);
app.use('/api/stripe', stripeRoutes);
app.use('/api', avatarRoutes);

// ─── GLOBAL ERROR HANDLER ────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[Error]', err.message);
  // Don't leak stack traces in production
  const isProd = process.env.NODE_ENV === 'production';
  res.status(err.status || 500).json({
    error: isProd ? 'Something went wrong.' : err.message,
  });
});

// ─── 404 HANDLER ─────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found.' });
});

app.listen(config.port, () => {
  console.log(`ReelForge backend running on port ${config.port}`);
});
