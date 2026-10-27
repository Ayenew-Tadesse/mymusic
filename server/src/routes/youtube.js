/**
 * YouTube metadata search. Returns only public, embeddable music videos.
 * Playback is done by the official embedded player in the app.
 */
import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { searchLimiter } from '../middleware/rateLimit.js';
import { searchMusic, getVideos, VIDEO_ID_RE } from '../services/youtube.js';

const router = Router();

router.get(
  '/search',
  searchLimiter,
  validate({ query: z.object({ q: z.string().trim().min(1).max(100), pageToken: z.string().max(100).regex(/^[\w-]+$/).optional() }) }),
  async (req, res) => {
    const result = await searchMusic(req.valid.query.q, { pageToken: req.valid.query.pageToken, regionCode: req.country ?? undefined });
    res.json(result);
  },
);

router.get(
  '/videos',
  validate({ query: z.object({ ids: z.string().transform((s) => s.split(',')).pipe(z.array(z.string().regex(VIDEO_ID_RE)).min(1).max(50)) }) }),
  async (req, res) => {
    const map = await getVideos(req.valid.query.ids);
    res.json({ items: req.valid.query.ids.map((id) => map.get(id)).filter(Boolean) });
  },
);

export default router;
