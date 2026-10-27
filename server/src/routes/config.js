/** Public runtime configuration for the web app (no secrets). */
import { Router } from 'express';
import env from '../config/env.js';
import { purchaseAllowedOn } from '../services/billing.js';

const router = Router();

router.get('/', (_req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  res.json({
    googleClientId: env.GOOGLE_WEB_CLIENT_ID || null,
    appleServicesId: env.APPLE_WEB_SERVICES_ID || null,
    youtubeEnabled: Boolean(env.YOUTUBE_API_KEY),
    billingEnabled: Boolean(env.STRIPE_SECRET_KEY) && purchaseAllowedOn('web'),
  });
});

export default router;
