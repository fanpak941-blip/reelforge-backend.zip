const express = require('express');
const crypto = require('crypto');
const User = require('../models/User');

const router = express.Router();

const PADDLE_WEBHOOK_SECRET = process.env.PADDLE_WEBHOOK_SECRET;

// Plan mapping from Paddle price IDs to internal plan names
// Set these in your Railway environment variables
const PRICE_TO_PLAN = {
  [process.env.PADDLE_PRICE_STARTER]: 'starter',
  [process.env.PADDLE_PRICE_PRO]:     'pro',
};

// Verify Paddle webhook signature
function verifyPaddleSignature(rawBody, signatureHeader) {
  if (!PADDLE_WEBHOOK_SECRET || !signatureHeader) return false;
  try {
    // Paddle sends: ts=...;h1=...
    const parts = {};
    signatureHeader.split(';').forEach(p => {
      const [k, v] = p.split('=');
      parts[k] = v;
    });
    const ts = parts['ts'];
    const h1 = parts['h1'];
    if (!ts || !h1) return false;

    const signed = `${ts}:${rawBody}`;
    const expected = crypto
      .createHmac('sha256', PADDLE_WEBHOOK_SECRET)
      .update(signed)
      .digest('hex');

    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(h1));
  } catch {
    return false;
  }
}

// POST /api/webhook/paddle
// Paddle sends ALL events here — we only act on subscription events
router.post(
  '/paddle',
  express.raw({ type: 'application/json' }), // raw body needed for signature check
  async (req, res) => {
    const sig = req.headers['paddle-signature'];
    const rawBody = req.body.toString('utf8');

    // Always respond 200 quickly so Paddle doesn't retry
    res.sendStatus(200);

    // Verify signature (skip in dev if secret not set)
    if (PADDLE_WEBHOOK_SECRET && !verifyPaddleSignature(rawBody, sig)) {
      console.warn('[Paddle] Invalid signature — ignoring webhook');
      return;
    }

    let event;
    try {
      event = JSON.parse(rawBody);
    } catch {
      console.error('[Paddle] Failed to parse webhook body');
      return;
    }

    const type = event.event_type;
    const data = event.data;
    console.log(`[Paddle] Event: ${type}`);

    try {
      // subscription.activated or subscription.updated → upgrade plan
      if (type === 'subscription.activated' || type === 'subscription.updated') {
        const email = data?.customer?.email || data?.custom_data?.email;
        const priceId = data?.items?.[0]?.price?.id;
        const plan = PRICE_TO_PLAN[priceId];

        if (!email) { console.warn('[Paddle] No email in event'); return; }
        if (!plan)  { console.warn(`[Paddle] Unknown priceId: ${priceId}`); return; }

        await User.findOneAndUpdate(
          { email: email.toLowerCase() },
          { plan },
          { new: true }
        );
        console.log(`[Paddle] ✅ ${email} upgraded to ${plan}`);
      }

      // subscription.canceled or subscription.paused → downgrade to free
      if (type === 'subscription.canceled' || type === 'subscription.paused') {
        const email = data?.customer?.email || data?.custom_data?.email;
        if (!email) { console.warn('[Paddle] No email in cancel event'); return; }

        await User.findOneAndUpdate(
          { email: email.toLowerCase() },
          { plan: 'free' },
          { new: true }
        );
        console.log(`[Paddle] ⬇️ ${email} downgraded to free`);
      }

      // transaction.completed → one-time payment (if you add one-time plans later)
      if (type === 'transaction.completed') {
        const email = data?.customer?.email;
        const priceId = data?.items?.[0]?.price?.id;
        const plan = PRICE_TO_PLAN[priceId];
        if (email && plan) {
          await User.findOneAndUpdate(
            { email: email.toLowerCase() },
            { plan },
            { new: true }
          );
          console.log(`[Paddle] ✅ One-time: ${email} → ${plan}`);
        }
      }

    } catch (err) {
      console.error('[Paddle] Error processing webhook:', err.message);
    }
  }
);

module.exports = router;
