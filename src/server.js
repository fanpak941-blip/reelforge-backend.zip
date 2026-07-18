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

const config = require('./config');
const generateRoutes = require('./routes/generate');
const authRoutes = require('./routes/auth');
const paddleRoutes = require('./routes/paddle');
const videoRoutes = require('./routes/videos');

// MongoDB connect
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB error:', err));

// Google OAuth strategy
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
          plan: email === OWNER_EMAIL ? 'owner' : 'free',
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

// Trust Railway's proxy
app.set('trust proxy', 1);

// Security
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: ['https://reelforge2.vercel.app', 'http://localhost:3000'], credentials: true }));

// Rate limiting
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
app.use('/api/', limiter);

// IMPORTANT: Paddle webhook needs raw body BEFORE express.json()
// So we mount paddle route first with its own body parser
app.use('/api/webhook', paddleRoutes);

app.use(express.json());
app.use(session({
  secret: process.env.JWT_SECRET || 'reelforge_secret',
  resave: false,
  saveUninitialized: false,
}));
app.use(passport.initialize());
app.use(passport.session());

app.use('/audio', express.static(path.join(__dirname, '..', 'public', 'audio')));

app.get('/', (req, res) => res.json({ status: 'ok', service: 'ReelForge backend' }));
app.get('/health', (req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api', generateRoutes);
app.use('/api', videoRoutes);

app.listen(config.port, () => {
  console.log(`ReelForge backend running on port ${config.port}`);
});
