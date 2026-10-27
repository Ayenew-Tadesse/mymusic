import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import { isTest } from '../config/env.js';

/**
 * In-memory rate limiters. When running more than one instance, plug in a
 * shared store (e.g. rate-limit-redis) so limits apply across instances.
 */
const make = (windowMs, limit, keyByUser = false) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip: () => isTest,
    ...(keyByUser && { keyGenerator: (req) => req.user?.id ?? ipKeyGenerator(req.ip ?? '') }),
    handler: (_req, res) =>
      res.status(429).json({ error: { code: 'rate_limited', message: 'Too many requests, slow down' } }),
  });

export const globalLimiter = make(60_000, 300);
export const authLimiter = make(15 * 60_000, 20); // login / register / reset attempts per IP
// Mount after requireAuth so the limit is per user.
export const searchLimiter = make(60_000, 30, true); // YouTube search costs 100 quota units
// Playlist previews / imports page through YouTube and can add hundreds of items.
export const importLimiter = make(60 * 60_000, 30, true);
