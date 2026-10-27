/** Express application: security middleware, routing and error handling. */
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { pinoHttp } from 'pino-http';
import mongoose from 'mongoose';
import env from './config/env.js';
import logger from './config/logger.js';
import { globalLimiter } from './middleware/rateLimit.js';
import { requireAuth, requireAdmin } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import authRoutes from './routes/auth.js';
import meRoutes from './routes/me.js';
import catalogRoutes from './routes/catalog.js';
import youtubeRoutes from './routes/youtube.js';
import playlistRoutes from './routes/playlists.js';
import libraryRoutes from './routes/library.js';
import downloadRoutes from './routes/downloads.js';
import billingRoutes, { webhookRouter } from './routes/billing.js';
import adminRoutes from './routes/admin.js';
import publicRoutes from './routes/public.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY);

  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/healthz' } }));
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: { defaultSrc: ["'none'"], imgSrc: ['https:', 'data:'], styleSrc: ["'unsafe-inline'"], frameAncestors: ["'none'"] },
      },
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );
  app.use(
    cors({
      // Native apps don't send an Origin header; browsers must be on the allow list.
      origin: (origin, cb) => cb(null, !origin || env.CORS_ORIGINS.includes(origin)),
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
      allowedHeaders: ['Authorization', 'Content-Type', 'X-Client'],
      credentials: true, // refresh cookie for the admin dashboard
      maxAge: 600,
    }),
  );
  app.use(compression());

  app.get('/healthz', (_req, res) => res.json({ ok: true }));
  app.get('/readyz', (_req, res) => {
    const ready = mongoose.connection.readyState === 1;
    res.status(ready ? 200 : 503).json({ ready });
  });

  // Must come before the JSON parser: Stripe signatures are computed over the raw body.
  app.use('/api/v1/billing/webhook', webhookRouter);

  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use(globalLimiter);

  app.use('/', publicRoutes);
  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/me', requireAuth, meRoutes);
  app.use('/api/v1/catalog', requireAuth, catalogRoutes);
  app.use('/api/v1/youtube', requireAuth, youtubeRoutes);
  app.use('/api/v1/playlists', playlistRoutes); // applies auth itself (share view is public)
  app.use('/api/v1/library', requireAuth, libraryRoutes);
  app.use('/api/v1/downloads', requireAuth, downloadRoutes);
  app.use('/api/v1/billing', billingRoutes);
  app.use('/api/v1/admin', requireAuth, requireAdmin, adminRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
