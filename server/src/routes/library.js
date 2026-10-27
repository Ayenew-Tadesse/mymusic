/** Favorites ("Liked songs") and listening history. */
import { Router } from 'express';
import { z } from 'zod';
import { Favorite, ListeningEvent, Track } from '../models/index.js';
import { validate } from '../middleware/validate.js';
import { hydrateItems } from '../services/serializers.js';
import { pageQuery, pageResult } from '../utils/pagination.js';
import { itemRef } from './playlists.js';
import { notFound } from '../utils/httpError.js';

const router = Router();

const refFilter = (ref) => (ref.kind === 'catalog' ? { kind: 'catalog', track: ref.trackId } : { kind: 'youtube', videoId: ref.videoId });

// --- Favorites -------------------------------------------------------------

router.get('/favorites', validate({ query: pageQuery }), async (req, res) => {
  const { page, limit } = req.valid.query;
  const filter = { user: req.user._id };
  const [favs, total] = await Promise.all([
    Favorite.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Favorite.countDocuments(filter),
  ]);
  res.json(pageResult(await hydrateItems(favs, { user: req.user, country: req.country }), { page, limit }, total));
});

/** Compact list of liked ids so the app can render heart states without paging. */
router.get('/favorites/ids', async (req, res) => {
  const favs = await Favorite.find({ user: req.user._id }).select('kind track videoId').lean();
  res.json({
    trackIds: favs.filter((f) => f.kind === 'catalog').map((f) => f.track.toString()),
    videoIds: favs.filter((f) => f.kind === 'youtube').map((f) => f.videoId),
  });
});

router.post('/favorites', validate({ body: itemRef }), async (req, res) => {
  const ref = req.valid.body;
  if (ref.kind === 'catalog' && !(await Track.exists({ _id: ref.trackId, status: 'published' }))) throw notFound('Track');
  await Favorite.updateOne({ user: req.user._id, ...refFilter(ref) }, { $setOnInsert: { user: req.user._id } }, { upsert: true });
  res.status(204).end();
});

router.delete('/favorites', validate({ body: itemRef }), async (req, res) => {
  await Favorite.deleteOne({ user: req.user._id, ...refFilter(req.valid.body) });
  res.status(204).end();
});

// --- Listening history -----------------------------------------------------

const playBody = z.intersection(
  itemRef,
  z.object({
    msPlayed: z.number().int().min(0).max(6 * 3600_000),
    completed: z.boolean().default(false),
    offline: z.boolean().default(false),
    playedAt: z.coerce.date().optional(),
    context: z
      .object({ type: z.enum(['playlist', 'album', 'artist', 'search', 'favorites', 'history', 'other']), id: z.string().max(64).optional() })
      .optional(),
    platform: z.enum(['ios', 'android', 'web', 'other']).default('other'),
  }),
);

/**
 * Record a play. The app reports once a track has played for 30 seconds or
 * finished, and queues reports made offline for later upload (batch of up to 100).
 */
router.post('/history', validate({ body: z.object({ plays: z.array(playBody).min(1).max(100) }) }), async (req, res) => {
  const now = Date.now();
  const docs = req.valid.body.plays.map((p) => {
    const playedAt = p.playedAt && p.playedAt.getTime() <= now && now - p.playedAt.getTime() < 30 * 86400_000 ? p.playedAt : new Date();
    return { user: req.user._id, ...refFilter(p), msPlayed: p.msPlayed, completed: p.completed, offline: p.offline, playedAt, context: p.context, platform: p.platform };
  });
  await ListeningEvent.insertMany(docs, { ordered: false });

  // Count a play for popularity once it has lasted 30 s, like most streaming services.
  const counted = docs.filter((d) => d.kind === 'catalog' && (d.msPlayed >= 30_000 || d.completed));
  if (counted.length) {
    await Track.bulkWrite(counted.map((d) => ({ updateOne: { filter: { _id: d.track }, update: { $inc: { playCount: 1 } } } })));
  }
  res.status(202).json({ recorded: docs.length });
});

router.get('/history', validate({ query: pageQuery }), async (req, res) => {
  const { page, limit } = req.valid.query;
  const filter = { user: req.user._id };
  const [events, total] = await Promise.all([
    ListeningEvent.find(filter).sort({ playedAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    ListeningEvent.countDocuments(filter),
  ]);
  const items = await hydrateItems(events, { user: req.user, country: req.country });
  res.json(pageResult(items.map((it, i) => ({ ...it, playedAt: events[i].playedAt })), { page, limit }, total));
});

router.delete('/history', async (req, res) => {
  await ListeningEvent.deleteMany({ user: req.user._id });
  res.status(204).end();
});

export default router;
