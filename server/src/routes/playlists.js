/** Playlists: CRUD, ordering, sharing links, collaboration invites and following. */
import { Router } from 'express';
import { z } from 'zod';
import crypto from 'node:crypto';
import { Playlist, Track } from '../models/index.js';
import { MAX_PLAYLIST_ITEMS } from '../models/Playlist.js';
import { validate } from '../middleware/validate.js';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { hydrateItems, playlistSummary } from '../services/serializers.js';
import { signPurposeToken, verifyPurposeToken } from '../services/tokens.js';
import { VIDEO_ID_RE, getPlaylist, parsePlaylistId } from '../services/youtube.js';
import { importLimiter } from '../middleware/rateLimit.js';
import { objectId } from './catalog.js';
import { notFound, forbidden, badRequest, conflict } from '../utils/httpError.js';
import env from '../config/env.js';

const router = Router();
const idParams = z.object({ id: objectId });

const playlistFields = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(300),
  coverUrl: z.string().url().startsWith('https://').max(2048).nullable(),
  visibility: z.enum(['private', 'unlisted', 'public']),
});

export const itemRef = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('catalog'), trackId: objectId }),
  z.object({ kind: z.literal('youtube'), videoId: z.string().regex(VIDEO_ID_RE) }),
]);

const shareUrl = (p) => `${env.PUBLIC_API_URL}/p/${p.shareId}`;

async function load(id, userId, { edit = false, owner = false } = {}) {
  const p = await Playlist.findById(id).populate('owner', 'displayName');
  if (!p || !p.canView(userId)) throw notFound('Playlist');
  if (owner && !p.isOwnedBy(userId)) throw forbidden('Only the owner can do that');
  if (edit && !p.canEdit(userId)) throw forbidden('You can’t edit this playlist');
  return p;
}

async function detail(p, req) {
  const items = await hydrateItems(p.items, { user: req.user, country: req.country });
  const first = items.find((i) => !i.unavailable);
  const firstArt = first?.artworkUrl ?? first?.thumbnailUrl;
  return {
    ...playlistSummary(p, req.user?._id),
    coverUrl: p.coverUrl ?? firstArt ?? null,
    totalDurationSec: items.reduce((s, i) => s + (i.durationSec ?? 0), 0),
    shareUrl: p.visibility === 'private' ? null : shareUrl(p),
    items,
  };
}

// Public share view, usable without signing in.
router.get('/shared/:shareId', optionalAuth, validate({ params: z.object({ shareId: z.string().regex(/^[\w-]{8,32}$/) }) }), async (req, res) => {
  const p = await Playlist.findOne({ shareId: req.valid.params.shareId }).populate('owner', 'displayName');
  if (!p || p.visibility === 'private' || p.hidden) throw notFound('Playlist');
  res.json({ playlist: await detail(p, req) });
});

router.use(requireAuth);

router.get('/', async (req, res) => {
  const uid = req.user._id;
  const playlists = await Playlist.find({ $or: [{ owner: uid }, { collaborators: uid }, { followers: uid }] })
    .populate('owner', 'displayName')
    .sort({ updatedAt: -1 })
    .limit(500);
  res.json({ items: playlists.map((p) => playlistSummary(p, uid)) });
});

router.post('/', validate({ body: playlistFields.partial({ description: true, coverUrl: true, visibility: true }) }), async (req, res) => {
  const count = await Playlist.countDocuments({ owner: req.user._id });
  if (count >= 500) throw badRequest('You have reached the playlist limit');
  const p = await Playlist.create({ ...req.valid.body, owner: req.user._id });
  await p.populate('owner', 'displayName');
  res.status(201).json({ playlist: await detail(p, req) });
});

router.get('/:id', validate({ params: idParams }), async (req, res) => {
  res.json({ playlist: await detail(await load(req.valid.params.id, req.user._id), req) });
});

router.patch('/:id', validate({ params: idParams, body: playlistFields.partial().strict() }), async (req, res) => {
  const p = await load(req.valid.params.id, req.user._id, { edit: true });
  // Collaborators may rename / describe; only the owner can change who can see it.
  if ('visibility' in req.valid.body && !p.isOwnedBy(req.user._id)) throw forbidden('Only the owner can change visibility');
  Object.assign(p, req.valid.body);
  await p.save();
  res.json({ playlist: await detail(p, req) });
});

router.delete('/:id', validate({ params: idParams }), async (req, res) => {
  const p = await load(req.valid.params.id, req.user._id, { owner: true });
  await p.deleteOne();
  res.status(204).end();
});

/** Duplicate any playlist the user can see into a new private playlist. */
router.post('/:id/copy', validate({ params: idParams }), async (req, res) => {
  const src = await load(req.valid.params.id, req.user._id);
  const copy = await Playlist.create({
    owner: req.user._id,
    name: `${src.name} (copy)`.slice(0, 100),
    description: src.description,
    items: src.items.map(({ kind, track, videoId }) => ({ kind, track, videoId, addedBy: req.user._id })),
  });
  await copy.populate('owner', 'displayName');
  res.status(201).json({ playlist: await detail(copy, req) });
});

// --- Items -----------------------------------------------------------------

router.post(
  '/:id/items',
  validate({ params: idParams, body: z.object({ items: z.array(itemRef).min(1).max(100), position: z.number().int().min(0).optional() }) }),
  async (req, res) => {
    const p = await load(req.valid.params.id, req.user._id, { edit: true });
    const { items, position } = req.valid.body;
    if (p.items.length + items.length > MAX_PLAYLIST_ITEMS) throw badRequest(`A playlist holds at most ${MAX_PLAYLIST_ITEMS} items`);

    const trackIds = items.filter((i) => i.kind === 'catalog').map((i) => i.trackId);
    if (trackIds.length) {
      const found = await Track.countDocuments({ _id: { $in: trackIds }, status: 'published' });
      if (found !== new Set(trackIds).size) throw badRequest('One or more tracks are unavailable');
    }

    const docs = items.map((i) => ({
      kind: i.kind,
      ...(i.kind === 'catalog' ? { track: i.trackId } : { videoId: i.videoId }),
      addedBy: req.user._id,
    }));
    const at = Math.min(position ?? p.items.length, p.items.length);
    p.items.splice(at, 0, ...docs);
    await p.save();
    res.status(201).json({ playlist: await detail(p, req) });
  },
);

router.delete('/:id/items/:itemId', validate({ params: idParams.extend({ itemId: objectId }) }), async (req, res) => {
  const p = await load(req.valid.params.id, req.user._id, { edit: true });
  const item = p.items.id(req.valid.params.itemId);
  if (!item) throw notFound('Item');
  item.deleteOne();
  await p.save();
  res.json({ playlist: await detail(p, req) });
});

/** Move one item to a new index (drag and drop reordering). */
router.put(
  '/:id/items/order',
  validate({ params: idParams, body: z.object({ itemId: objectId, toIndex: z.number().int().min(0) }) }),
  async (req, res) => {
    const p = await load(req.valid.params.id, req.user._id, { edit: true });
    const from = p.items.findIndex((i) => i._id.toString() === req.valid.body.itemId);
    if (from === -1) throw notFound('Item');
    const to = Math.min(req.valid.body.toIndex, p.items.length - 1);
    const [moved] = p.items.splice(from, 1);
    p.items.splice(to, 0, moved);
    await p.save();
    res.json({ playlist: await detail(p, req) });
  },
);

// --- Sharing ---------------------------------------------------------------

/** Make the playlist shareable and return its link. `rotate` invalidates old links. */
router.post(
  '/:id/share',
  validate({ params: idParams, body: z.object({ visibility: z.enum(['unlisted', 'public']).default('unlisted'), rotate: z.boolean().default(false) }) }),
  async (req, res) => {
    const p = await load(req.valid.params.id, req.user._id, { owner: true });
    p.visibility = req.valid.body.visibility;
    if (req.valid.body.rotate) p.shareId = crypto.randomBytes(9).toString('base64url');
    await p.save();
    res.json({ shareUrl: shareUrl(p), visibility: p.visibility });
  },
);

/** Owner creates an invite link that makes whoever opens it a collaborator. */
router.post('/:id/invite', validate({ params: idParams }), async (req, res) => {
  const p = await load(req.valid.params.id, req.user._id, { owner: true });
  const token = await signPurposeToken('playlist-invite', { pid: p.id, sid: p.shareId }, '7d');
  res.json({ inviteUrl: `${env.PUBLIC_API_URL}/invite/${token}`, token, expiresInDays: 7 });
});

/**
 * Import a YouTube playlist: adds its playable videos (ids only) to an
 * existing playlist the user can edit, or to a new private playlist named by
 * the user. Videos already in the target playlist are skipped.
 */
router.post(
  '/import/youtube',
  importLimiter,
  validate({
    body: z
      .object({
        url: z.string().trim().min(1).max(500),
        playlistId: objectId.optional(),
        name: z.string().trim().min(1).max(100).optional(),
      })
      .refine((b) => b.playlistId || b.name, 'Choose a playlist or give the new one a name'),
  }),
  async (req, res) => {
    const ytId = parsePlaylistId(req.valid.body.url);
    if (!ytId) throw badRequest('Paste a YouTube playlist link (it contains “list=”)');
    const source = await getPlaylist(ytId);
    if (!source.videoIds.length) throw badRequest('None of the videos in that playlist can be played here');

    let p;
    if (req.valid.body.playlistId) {
      p = await load(req.valid.body.playlistId, req.user._id, { edit: true });
    } else {
      if ((await Playlist.countDocuments({ owner: req.user._id })) >= 500) throw badRequest('You have reached the playlist limit');
      p = new Playlist({ owner: req.user._id, name: req.valid.body.name });
    }

    const existing = new Set(p.items.filter((i) => i.kind === 'youtube').map((i) => i.videoId));
    const fresh = source.videoIds.filter((id) => !existing.has(id));
    const room = MAX_PLAYLIST_ITEMS - p.items.length;
    const toAdd = fresh.slice(0, Math.max(0, room));
    p.items.push(...toAdd.map((videoId) => ({ kind: 'youtube', videoId, addedBy: req.user._id })));
    await p.save();
    await p.populate('owner', 'displayName');

    res.status(req.valid.body.playlistId ? 200 : 201).json({
      playlist: await detail(p, req),
      added: toAdd.length,
      alreadyInPlaylist: source.videoIds.length - fresh.length,
      unavailable: source.skipped,
      overLimit: fresh.length - toAdd.length,
      truncated: source.truncated,
    });
  },
);

router.post('/join', validate({ body: z.object({ token: z.string().min(20).max(2048) }) }), async (req, res) => {
  const claims = await verifyPurposeToken('playlist-invite', req.valid.body.token);
  const p = claims && (await Playlist.findById(claims.pid).populate('owner', 'displayName'));
  // Rotating the share id also invalidates outstanding invites.
  if (!p || p.shareId !== claims.sid) throw badRequest('This invite is invalid or has expired');
  if (!p.canEdit(req.user._id)) {
    if (p.collaborators.length >= 50) throw conflict('This playlist has too many collaborators');
    p.collaborators.addToSet(req.user._id);
    await p.save();
  }
  res.json({ playlist: await detail(p, req) });
});

router.delete('/:id/collaborators/:userId', validate({ params: idParams.extend({ userId: objectId }) }), async (req, res) => {
  const p = await load(req.valid.params.id, req.user._id, { edit: true });
  const self = req.valid.params.userId === req.user.id;
  if (!self && !p.isOwnedBy(req.user._id)) throw forbidden('Only the owner can remove collaborators');
  p.collaborators.pull(req.valid.params.userId);
  await p.save();
  res.status(204).end();
});

router.post('/:id/follow', validate({ params: idParams }), async (req, res) => {
  const p = await load(req.valid.params.id, req.user._id);
  if (p.visibility !== 'public' && !p.isEditorial) throw badRequest('Only public playlists can be followed');
  await Playlist.updateOne({ _id: p._id }, { $addToSet: { followers: req.user._id } });
  res.status(204).end();
});

router.delete('/:id/follow', validate({ params: idParams }), async (req, res) => {
  await Playlist.updateOne({ _id: req.valid.params.id }, { $pull: { followers: req.user._id } });
  res.status(204).end();
});

export default router;
