const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { requireAuth } = require('../authMiddleware');
const User = require('../models/User');

const router = express.Router();

const PRICE_TO_PLAN = {
  [process.env.STRIPE_PRICE_STARTER]: 'starter',
  [process.env.STRIPE_PRICE_PRO]:     'pro',
  [process.env.STRIPE_PRICE_MAX]:     'max',
};

// POST /api/stripe/create-checkout
// Creates a Stripe checkout session and returns the URL
router.post('/create-checkout', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    // Create or retrieve Stripe customer
    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.name,
        metadata: { userId: user._id.toString() },
      });
      customerId = customer.id;
      user.stripeCustomerId = customerId;
      await user.save();
    }

    // Select price based on plan requested
    const planType = req.body.plan || 'starter';
    const priceMap = {
      starter: process.env.STRIPE_PRICE_STARTER,
      pro:     process.env.STRIPE_PRICE_PRO,
      max:     process.env.STRIPE_PRICE_MAX,
    };
    const priceId = priceMap[planType] || process.env.STRIPE_PRICE_STARTER;

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: `${process.env.FRONTEND_URL}?upgraded=true`,
      cancel_url: `${process.env.FRONTEND_URL}?upgraded=false`,
      metadata: { userId: user._id.toString(), plan: planType },
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('[Stripe] Checkout error FULL:', JSON.stringify({
      message: err.message,
      type: err.type,
      code: err.code,
      param: err.param,
      stripeKey: process.env.STRIPE_SECRET_KEY ? 'SET' : 'MISSING',
      priceId: process.env.STRIPE_PRICE_STARTER ? 'SET' : 'MISSING',
      frontendUrl: process.env.FRONTEND_URL ? 'SET' : 'MISSING',
    }));
    res.status(500).json({ 
      error: 'Failed to create checkout session.',
      detail: err.message,
      code: err.code
    });
  }
});

// POST /api/stripe/webhook
// Stripe sends events here — verify signature then update plan
router.post('/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error('[Stripe] Webhook signature failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Always respond 200 quickly
    res.sendStatus(200);

    try {
      const type = event.type;
      console.log(`[Stripe] Event: ${type}`);

      // Payment succeeded — upgrade plan
      if (type === 'checkout.session.completed') {
        const session = event.data.object;
        const customerId = session.customer;
        const priceId = session.line_items?.data?.[0]?.price?.id
          || process.env.STRIPE_PRICE_STARTER;

        const plan = PRICE_TO_PLAN[priceId] || 'starter';

        // Find user by stripeCustomerId or metadata
        let user = await User.findOne({ stripeCustomerId: customerId });
        if (!user && session.metadata?.userId) {
          user = await User.findById(session.metadata.userId);
        }
        if (!user) {
          // Try by email
          const customer = await stripe.customers.retrieve(customerId);
          user = await User.findOne({ email: customer.email });
        }

        if (user) {
          user.plan = plan;
          user.stripeCustomerId = customerId;
          await user.save();
          console.log(`[Stripe] ✅ ${user.email} upgraded to ${plan}`);
        } else {
          console.warn('[Stripe] User not found for customer:', customerId);
        }
      }

      // Subscription cancelled — downgrade to free
      if (type === 'customer.subscription.deleted') {
        const subscription = event.data.object;
        const customerId = subscription.customer;

        const user = await User.findOne({ stripeCustomerId: customerId });
        if (user) {
          user.plan = 'free';
          await user.save();
          console.log(`[Stripe] ⬇️ ${user.email} downgraded to free`);
        }
      }

    } catch (err) {
      console.error('[Stripe] Error processing event:', err.message);
    }
  }
);

// GET /api/stripe/portal
// Opens Stripe billing portal so user can manage/cancel subscription
router.post('/portal', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user?.stripeCustomerId) {
      return res.status(400).json({ error: 'No active subscription found.' });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: process.env.FRONTEND_URL,
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('[Stripe] Portal error:', err.message);
    res.status(500).json({ error: 'Failed to open billing portal.' });
  }
});

module.exports = router;
