/**
 * Admin API used by the web dashboard. Every route requires role=admin and
 * every mutating action is written to the audit log.
 */
import { Router } from 'express';
import { z } from 'zod';
import { User, Track, Artist, Album, Playlist, ListeningEvent, OfflineLicense, AuditLog } from '../models/index.js';
import { LICENSE_TYPES } from '../models/Track.js';
import { validate } from '../middleware/validate.js';
import { createUploadUrl, objectSize, AUDIO_TYPES, IMAGE_TYPES } from '../services/storage.js';
import { revokeAllSessions } from '../services/tokens.js';
import { artistDto, albumDto, playlistSummary } from '../services/serializers.js';
import { pageQuery, pageResult } from '../utils/pagination.js';
import { escapeRegex } from '../utils/crypto.js';
import { objectId } from './catalog.js';
import { notFound, badRequest } from '../utils/httpError.js';

const router = Router();
const idParams = z.object({ id: objectId });
const listQuery = pageQuery.extend({ q: z.string().trim().max(100).optional() });
const httpsUrl = z.string().url().startsWith('https://').max(2048);

function audit(req, action, targetType, targetId, meta) {
  return AuditLog.create({ actor: req.user._id, action, targetType, targetId: targetId?.toString(), meta, ip: req.ip });
}

const search = (q, field) => (q ? { [field]: new RegExp(escapeRegex(q), 'i') } : {});

// --- Analytics -------------------------------------------------------------

router.get('/stats', validate({ query: z.object({ days: z.coerce.number().int().min(7).max(365).default(30) }) }), async (req, res) => {
  const since = new Date(Date.now() - req.valid.query.days * 86400_000);
  const dayAgo = new Date(Date.now() - 86400_000);
  const monthAgo = new Date(Date.now() - 30 * 86400_000);

  const [users, newUsers, tracks, playlists, plans, dau, mau, playsByDay, topTracks, sourceSplit, offlineLicenses] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ createdAt: { $gte: since } }),
    Track.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
    Playlist.countDocuments(),
    User.aggregate([
      { $match: { 'subscription.status': { $in: ['active', 'trialing', 'past_due'] } } },
      { $group: { _id: '$subscription.plan', n: { $sum: 1 } } },
    ]),
    ListeningEvent.distinct('user', { playedAt: { $gte: dayAgo } }).then((u) => u.length),
    ListeningEvent.distinct('user', { playedAt: { $gte: monthAgo } }).then((u) => u.length),
    ListeningEvent.aggregate([
      { $match: { playedAt: { $gte: since } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$playedAt' } },
          plays: { $sum: 1 },
          minutes: { $sum: { $divide: ['$msPlayed', 60000] } },
          listeners: { $addToSet: '$user' },
        },
      },
      { $project: { _id: 0, date: '$_id', plays: 1, minutes: { $round: ['$minutes', 0] }, listeners: { $size: '$listeners' } } },
      { $sort: { date: 1 } },
    ]),
    ListeningEvent.aggregate([
      { $match: { playedAt: { $gte: since }, kind: 'catalog' } },
      { $group: { _id: '$track', plays: { $sum: 1 }, listeners: { $addToSet: '$user' } } },
      { $sort: { plays: -1 } },
      { $limit: 10 },
      { $lookup: { from: 'tracks', localField: '_id', foreignField: '_id', as: 'track' } },
      { $unwind: '$track' },
      { $lookup: { from: 'artists', localField: 'track.artist', foreignField: '_id', as: 'artist' } },
      { $project: { _id: 0, id: '$_id', title: '$track.title', artist: { $first: '$artist.name' }, plays: 1, listeners: { $size: '$listeners' } } },
    ]),
    ListeningEvent.aggregate([{ $match: { playedAt: { $gte: since } } }, { $group: { _id: '$kind', plays: { $sum: 1 } } }]),
    OfflineLicense.countDocuments({ revokedAt: null, expiresAt: { $gt: new Date() } }),
  ]);

  res.json({
    totals: {
      users,
      newUsers,
      playlists,
      dau,
      mau,
      offlineLicenses,
      tracks: Object.fromEntries(tracks.map((t) => [t._id, t.n])),
      subscribers: Object.fromEntries(plans.map((p) => [p._id, p.n])),
    },
    playsByDay,
    topTracks,
    sourceSplit: Object.fromEntries(sourceSplit.map((s) => [s._id, s.plays])),
  });
});

// --- Uploads ---------------------------------------------------------------

router.post(
  '/uploads',
  validate({
    body: z.object({
      kind: z.enum(['audio', 'image']),
      contentType: z.enum([...Object.keys(AUDIO_TYPES), ...Object.keys(IMAGE_TYPES)]),
    }),
  }),
  async (req, res) => {
    res.json(await createUploadUrl(req.valid.body.kind, req.valid.body.contentType));
  },
);

// --- Artists & albums ------------------------------------------------------

const artistBody = z.object({
  name: z.string().trim().min(1).max(200),
  bio: z.string().max(5000).optional(),
  imageUrl: httpsUrl.optional(),
  genres: z.array(z.string().trim().max(50)).max(10).optional(),
  verified: z.boolean().optional(),
});

router.get('/artists', validate({ query: listQuery }), async (req, res) => {
  const { page, limit, q } = req.valid.query;
  const filter = search(q, 'name');
  const [items, total] = await Promise.all([
    Artist.find(filter).sort({ name: 1 }).skip((page - 1) * limit).limit(limit),
    Artist.countDocuments(filter),
  ]);
  res.json(pageResult(items.map(artistDto), { page, limit }, total));
});

router.post('/artists', validate({ body: artistBody }), async (req, res) => {
  const a = await Artist.create(req.valid.body);
  await audit(req, 'artist.create', 'artist', a._id);
  res.status(201).json({ artist: artistDto(a) });
});

router.patch('/artists/:id', validate({ params: idParams, body: artistBody.partial() }), async (req, res) => {
  const a = await Artist.findByIdAndUpdate(req.valid.params.id, req.valid.body, { new: true, runValidators: true });
  if (!a) throw notFound('Artist');
  await audit(req, 'artist.update', 'artist', a._id, req.valid.body);
  res.json({ artist: artistDto(a) });
});

const albumBody = z.object({
  title: z.string().trim().min(1).max(200),
  artist: objectId,
  artworkUrl: httpsUrl.optional(),
  releaseDate: z.coerce.date().optional(),
  label: z.string().max(200).optional(),
  upc: z.string().max(20).optional(),
});

router.get('/albums', validate({ query: listQuery }), async (req, res) => {
  const { page, limit, q } = req.valid.query;
  const filter = search(q, 'title');
  const [items, total] = await Promise.all([
    Album.find(filter).populate('artist', 'name').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    Album.countDocuments(filter),
  ]);
  res.json(pageResult(items.map(albumDto), { page, limit }, total));
});

router.post('/albums', validate({ body: albumBody }), async (req, res) => {
  if (!(await Artist.exists({ _id: req.valid.body.artist }))) throw badRequest('Unknown artist');
  const al = await Album.create(req.valid.body);
  await audit(req, 'album.create', 'album', al._id);
  res.status(201).json({ album: albumDto(al) });
});

router.patch('/albums/:id', validate({ params: idParams, body: albumBody.partial() }), async (req, res) => {
  const al = await Album.findByIdAndUpdate(req.valid.params.id, req.valid.body, { new: true, runValidators: true });
  if (!al) throw notFound('Album');
  await audit(req, 'album.update', 'album', al._id, req.valid.body);
  res.json({ album: albumDto(al) });
});

// --- Tracks (authorized content) -------------------------------------------

const rightsBody = z.object({
  licenseType: z.enum(LICENSE_TYPES),
  licensor: z.string().trim().min(1).max(200),
  licenseReference: z.string().trim().max(200).optional(),
  attribution: z.string().trim().max(500).optional(),
  territories: z.array(z.string().regex(/^(WW|[A-Z]{2})$/)).min(1).max(250).default(['WW']),
  streamAllowed: z.boolean().default(true),
  offlineAllowed: z.boolean().default(false),
  validFrom: z.coerce.date().optional(),
  validUntil: z.coerce.date().nullable().optional(),
});

const trackBody = z.object({
  title: z.string().trim().min(1).max(200),
  artist: objectId,
  album: objectId.nullable().optional(),
  trackNumber: z.number().int().min(1).max(999).optional(),
  durationSec: z.number().int().min(1).max(6 * 3600),
  genres: z.array(z.string().trim().max(50)).max(10).optional(),
  explicit: z.boolean().optional(),
  isrc: z.string().regex(/^[A-Z]{2}[A-Z0-9]{3}\d{7}$/, 'Invalid ISRC').optional(),
  artworkUrl: httpsUrl.optional(),
  audioKey: z.string().regex(/^audio\/[\w/.-]+$/, 'Upload the audio first'),
  audioMimeType: z.enum(Object.keys(AUDIO_TYPES)).default('audio/mpeg'),
  freeTier: z.boolean().optional(),
  rights: rightsBody,
});

function adminTrack(t) {
  return {
    id: t.id,
    title: t.title,
    artist: t.artist?.name ? { id: t.artist.id, name: t.artist.name } : t.artist,
    album: t.album?.title ? { id: t.album.id, title: t.album.title } : t.album ?? null,
    trackNumber: t.trackNumber,
    durationSec: t.durationSec,
    genres: t.genres,
    explicit: t.explicit,
    isrc: t.isrc,
    artworkUrl: t.artworkUrl,
    audioMimeType: t.audioMimeType,
    fileSizeBytes: t.fileSizeBytes,
    freeTier: t.freeTier,
    rights: t.rights,
    status: t.status,
    playCount: t.playCount,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

router.get(
  '/tracks',
  validate({ query: listQuery.extend({ status: z.enum(['draft', 'published', 'takedown']).optional() }) }),
  async (req, res) => {
    const { page, limit, q, status } = req.valid.query;
    const filter = { ...search(q, 'title'), ...(status && { status }) };
    const [items, total] = await Promise.all([
      Track.find(filter).populate('artist', 'name').populate('album', 'title').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
      Track.countDocuments(filter),
    ]);
    res.json(pageResult(items.map(adminTrack), { page, limit }, total));
  },
);

router.get('/tracks/:id', validate({ params: idParams }), async (req, res) => {
  const t = await Track.findById(req.valid.params.id).populate('artist', 'name').populate('album', 'title');
  if (!t) throw notFound('Track');
  res.json({ track: adminTrack(t) });
});

router.post('/tracks', validate({ body: trackBody }), async (req, res) => {
  const body = req.valid.body;
  if (!(await Artist.exists({ _id: body.artist }))) throw badRequest('Unknown artist');
  if (body.album && !(await Album.exists({ _id: body.album }))) throw badRequest('Unknown album');
  const fileSizeBytes = await objectSize(body.audioKey).catch(() => {
    throw badRequest('Audio file not found in storage; upload it first');
  });
  const t = await Track.create({ ...body, fileSizeBytes, createdBy: req.user._id, status: 'draft' });
  await audit(req, 'track.create', 'track', t._id, { title: t.title, rights: body.rights });
  res.status(201).json({ track: adminTrack(t) });
});

router.patch('/tracks/:id', validate({ params: idParams, body: trackBody.partial().extend({ rights: rightsBody.partial().optional() }) }), async (req, res) => {
  const t = await Track.findById(req.valid.params.id).select('+audioKey');
  if (!t) throw notFound('Track');
  const { rights, ...rest } = req.valid.body;
  if (rest.audioKey && rest.audioKey !== t.audioKey) {
    rest.fileSizeBytes = await objectSize(rest.audioKey).catch(() => {
      throw badRequest('Audio file not found in storage; upload it first');
    });
  }
  Object.assign(t, rest);
  if (rights) t.rights = { ...t.rights.toObject(), ...rights };
  await t.save();
  // A narrower licence takes effect on devices at their next licence sync.
  await audit(req, 'track.update', 'track', t._id, req.valid.body);
  await t.populate([{ path: 'artist', select: 'name' }, { path: 'album', select: 'title' }]);
  res.json({ track: adminTrack(t) });
});

/** Publish / unpublish / takedown. Takedowns revoke all offline licences immediately. */
router.post(
  '/tracks/:id/status',
  validate({ params: idParams, body: z.object({ status: z.enum(['draft', 'published', 'takedown']), reason: z.string().max(500).optional() }) }),
  async (req, res) => {
    const t = await Track.findById(req.valid.params.id);
    if (!t) throw notFound('Track');
    const { status, reason } = req.valid.body;
    if (status === 'published' && !(t.rights?.licensor && t.rights?.licenseType)) {
      throw badRequest('Record the licence details before publishing');
    }
    t.status = status;
    await t.save();
    if (status !== 'published') {
      await OfflineLicense.updateMany({ track: t._id, revokedAt: null }, { $set: { revokedAt: new Date(), revokeReason: status } });
    }
    await audit(req, `track.${status}`, 'track', t._id, { reason });
    res.json({ track: adminTrack(t) });
  },
);

// --- Playlists -------------------------------------------------------------

router.get(
  '/playlists',
  validate({ query: listQuery.extend({ editorial: z.enum(['true', 'false']).optional(), visibility: z.enum(['private', 'unlisted', 'public']).optional() }) }),
  async (req, res) => {
    const { page, limit, q, editorial, visibility } = req.valid.query;
    const filter = { ...search(q, 'name'), ...(editorial && { isEditorial: editorial === 'true' }), ...(visibility && { visibility }) };
    const [items, total] = await Promise.all([
      Playlist.find(filter).populate('owner', 'displayName email').sort({ updatedAt: -1 }).skip((page - 1) * limit).limit(limit),
      Playlist.countDocuments(filter),
    ]);
    res.json(pageResult(items.map((p) => ({ ...playlistSummary(p, req.user._id), hidden: p.hidden, ownerEmail: p.owner?.email })), { page, limit }, total));
  },
);

/** Create an editorial playlist owned by the admin. */
router.post(
  '/playlists',
  validate({ body: z.object({ name: z.string().trim().min(1).max(100), description: z.string().max(300).optional(), coverUrl: httpsUrl.optional() }) }),
  async (req, res) => {
    const p = await Playlist.create({ ...req.valid.body, owner: req.user._id, visibility: 'public', isEditorial: true });
    await audit(req, 'playlist.create_editorial', 'playlist', p._id);
    res.status(201).json({ playlist: playlistSummary(p, req.user._id) });
  },
);

router.patch(
  '/playlists/:id',
  validate({ params: idParams, body: z.object({ isEditorial: z.boolean(), hidden: z.boolean(), name: z.string().trim().min(1).max(100), description: z.string().max(300), coverUrl: httpsUrl.nullable() }).partial() }),
  async (req, res) => {
    const p = await Playlist.findByIdAndUpdate(req.valid.params.id, req.valid.body, { new: true, runValidators: true }).populate('owner', 'displayName');
    if (!p) throw notFound('Playlist');
    await audit(req, 'playlist.update', 'playlist', p._id, req.valid.body);
    res.json({ playlist: { ...playlistSummary(p, req.user._id), hidden: p.hidden } });
  },
);

router.delete('/playlists/:id', validate({ params: idParams }), async (req, res) => {
  const p = await Playlist.findByIdAndDelete(req.valid.params.id);
  if (!p) throw notFound('Playlist');
  await audit(req, 'playlist.delete', 'playlist', p._id, { name: p.name, owner: p.owner });
  res.status(204).end();
});

// --- Users -----------------------------------------------------------------

function adminUser(u) {
  return { ...u.toProfile(), status: u.status, lastLoginAt: u.lastLoginAt, offlineDevices: u.offlineDevices.length, country: u.country ?? null };
}

router.get(
  '/users',
  validate({ query: listQuery.extend({ role: z.enum(['user', 'admin']).optional(), status: z.enum(['active', 'suspended']).optional(), plan: z.enum(['free', 'premium', 'family']).optional() }) }),
  async (req, res) => {
    const { page, limit, q, role, status, plan } = req.valid.query;
    const filter = {
      ...(q && { $or: [{ email: new RegExp(escapeRegex(q), 'i') }, { displayName: new RegExp(escapeRegex(q), 'i') }] }),
      ...(role && { role }),
      ...(status && { status }),
      ...(plan && { 'subscription.plan': plan }),
    };
    const [items, total] = await Promise.all([
      User.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
      User.countDocuments(filter),
    ]);
    res.json(pageResult(items.map(adminUser), { page, limit }, total));
  },
);

router.get('/users/:id', validate({ params: idParams }), async (req, res) => {
  const u = await User.findById(req.valid.params.id);
  if (!u) throw notFound('User');
  const [playlists, plays] = await Promise.all([Playlist.countDocuments({ owner: u._id }), ListeningEvent.countDocuments({ user: u._id })]);
  res.json({ user: { ...adminUser(u), stats: { playlists, plays } } });
});

router.patch(
  '/users/:id',
  validate({ params: idParams, body: z.object({ role: z.enum(['user', 'admin']), status: z.enum(['active', 'suspended']) }).partial() }),
  async (req, res) => {
    if (req.valid.params.id === req.user.id) throw badRequest('You can’t change your own role or status');
    const u = await User.findById(req.valid.params.id);
    if (!u) throw notFound('User');
    Object.assign(u, req.valid.body);
    await u.save();
    // Role changes and suspensions apply immediately.
    await revokeAllSessions(u._id);
    await audit(req, 'user.update', 'user', u._id, req.valid.body);
    res.json({ user: adminUser(await User.findById(u._id)) });
  },
);

router.post('/users/:id/revoke-sessions', validate({ params: idParams }), async (req, res) => {
  await revokeAllSessions(req.valid.params.id);
  await audit(req, 'user.revoke_sessions', 'user', req.valid.params.id);
  res.status(204).end();
});

router.get('/audit', validate({ query: pageQuery }), async (req, res) => {
  const { page, limit } = req.valid.query;
  const [items, total] = await Promise.all([
    AuditLog.find().populate('actor', 'displayName email').sort({ at: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    AuditLog.countDocuments(),
  ]);
  res.json(pageResult(items, { page, limit }, total));
});

export default router;
