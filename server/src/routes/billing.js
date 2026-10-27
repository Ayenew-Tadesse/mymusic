/** Subscription plans, Stripe Checkout / Customer Portal and the Stripe webhook. */
import express, { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { listPlans, createCheckoutSession, createPortalSession, handleWebhook, purchaseAllowedOn } from '../services/billing.js';
import { HttpError } from '../utils/httpError.js';

const platform = z.enum(['ios', 'android', 'web']).default('web');

/** Webhook needs the raw body for signature verification, so it's mounted before express.json(). */
export const webhookRouter = Router().post('/', express.raw({ type: 'application/json', limit: '1mb' }), async (req, res) => {
  const result = await handleWebhook(req.body, req.get('stripe-signature') ?? '');
  res.json(result);
});

const router = Router();
router.use(requireAuth);

router.get('/plans', validate({ query: z.object({ platform }) }), async (req, res) => {
  const canPurchase = purchaseAllowedOn(req.valid.query.platform);
  // When the store doesn't allow external purchases, don't send prices to the app at all.
  res.json({ canPurchase, plans: canPurchase ? await listPlans() : [], current: req.user.toProfile().subscription });
});

router.post('/checkout', validate({ body: z.object({ planId: z.string().max(40), platform }) }), async (req, res) => {
  if (!purchaseAllowedOn(req.valid.body.platform)) {
    throw new HttpError(403, 'Subscriptions can’t be purchased in this app', 'purchase_not_allowed');
  }
  res.json(await createCheckoutSession(req.user, req.valid.body.planId, req.valid.body.platform));
});

router.post('/portal', validate({ body: z.object({ platform }) }), async (req, res) => {
  res.json(await createPortalSession(req.user, req.valid.body.platform));
});

export default router;
