/**
 * YouTube metadata search. Returns only public, embeddable music videos.
 * Playback is done by the official embedded player in the app.
 */
import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { importLimiter, searchLimiter } from '../middleware/rateLimit.js';
import { searchMusic, getVideos, getPlaylist, parsePlaylistId, VIDEO_ID_RE } from '../services/youtube.js';
import { badRequest } from '../utils/httpError.js';

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

/**
 * Preview a YouTube playlist before importing it: title, channel and how many
 * songs can be played here. Nothing is stored.
 */
router.get('/playlist', importLimiter, validate({ query: z.object({ url: z.string().trim().min(1).max(500) }) }), async (req, res) => {
  const id = parsePlaylistId(req.valid.query.url);
  if (!id) throw badRequest('Paste a YouTube playlist link (it contains “list=”)');
  const { videoIds, ...preview } = await getPlaylist(id);
  res.json({ ...preview, playableCount: videoIds.length });
});

export default router;
