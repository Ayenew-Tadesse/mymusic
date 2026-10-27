/** Licensed catalog: browse, search, artist / album pages and streaming URLs. */
import { Router } from 'express';
import { z } from 'zod';
import mongoose from 'mongoose';
import { Track, Artist, Album, Playlist, ListeningEvent } from '../models/index.js';
import { validate } from '../middleware/validate.js';
import { signedAudioUrl } from '../services/storage.js';
import { trackDto, artistDto, albumDto, playlistSummary, hydrateItems, TRACK_POPULATE } from '../services/serializers.js';
import { pageQuery, pageResult } from '../utils/pagination.js';
import { escapeRegex } from '../utils/crypto.js';
import { notFound, HttpError } from '../utils/httpError.js';
import env from '../config/env.js';

const router = Router();
const objectId = z.string().refine((v) => mongoose.isValidObjectId(v), 'Invalid id');
const idParams = z.object({ id: objectId });

/** Filter that only matches tracks whose rights currently allow streaming in `country`. */
export function availableFilter(country, now = new Date()) {
  return {
    status: 'published',
    'rights.streamAllowed': true,
    'rights.validFrom': { $lte: now },
    $and: [
      { $or: [{ 'rights.validUntil': null }, { 'rights.validUntil': { $gt: now } }] },
      { 'rights.territories': { $in: country ? ['WW', country] : ['WW'] } },
    ],
  };
}

const ctx = (req) => ({ user: req.user, country: req.country });

router.get('/home', async (req, res) => {
  const filter = availableFilter(req.country);
  const [editorial, newReleases, popular, recent] = await Promise.all([
    Playlist.find({ isEditorial: true, visibility: 'public', hidden: false }).populate('owner', 'displayName').sort({ updatedAt: -1 }).limit(12),
    Track.find(filter).populate(TRACK_POPULATE).sort({ createdAt: -1 }).limit(15),
    Track.find(filter).populate(TRACK_POPULATE).sort({ playCount: -1 }).limit(15),
    ListeningEvent.aggregate([
      { $match: { user: req.user._id } },
      { $sort: { playedAt: -1 } },
      { $limit: 200 },
      { $group: { _id: { kind: '$kind', track: '$track', videoId: '$videoId' }, playedAt: { $first: '$playedAt' } } },
      { $sort: { playedAt: -1 } },
      { $limit: 10 },
    ]),
  ]);
  res.json({
    editorial: editorial.map((p) => playlistSummary(p, req.user._id)),
    newReleases: newReleases.map((t) => trackDto(t, ctx(req))),
    popular: popular.map((t) => trackDto(t, ctx(req))),
    recentlyPlayed: await hydrateItems(recent.map((r) => ({ ...r._id, playedAt: r.playedAt })), ctx(req)),
  });
});

router.get(
  '/search',
  validate({ query: z.object({ q: z.string().trim().min(1).max(100) }) }),
  async (req, res) => {
    const { q } = req.valid.query;
    // Case-insensitive prefix match is index friendly and good for as-you-type search.
    const rx = new RegExp(`^${escapeRegex(q)}`, 'i');
    const words = new RegExp(escapeRegex(q), 'i');
    const [artists, albums] = await Promise.all([
      Artist.find({ name: words }).limit(10),
      Album.find({ title: words }).populate('artist', 'name').limit(10),
    ]);
    const tracks = await Track.find({
      ...availableFilter(req.country),
      $or: [{ title: words }, { artist: { $in: artists.map((a) => a._id) } }],
    })
      .populate(TRACK_POPULATE)
      .sort({ playCount: -1 })
      .limit(25);
    const playlists = await Playlist.find({ visibility: 'public', hidden: false, name: rx })
      .populate('owner', 'displayName')
      .limit(10);
    res.json({
      tracks: tracks.map((t) => trackDto(t, ctx(req))),
      artists: artists.map(artistDto),
      albums: albums.map(albumDto),
      playlists: playlists.map((p) => playlistSummary(p, req.user._id)),
    });
  },
);

router.get(
  '/tracks',
  validate({ query: pageQuery.extend({ genre: z.string().trim().max(50).optional() }) }),
  async (req, res) => {
    const { page, limit, genre } = req.valid.query;
    const filter = { ...availableFilter(req.country), ...(genre && { genres: genre }) };
    const [items, total] = await Promise.all([
      Track.find(filter).populate(TRACK_POPULATE).sort({ playCount: -1 }).skip((page - 1) * limit).limit(limit),
      Track.countDocuments(filter),
    ]);
    res.json(pageResult(items.map((t) => trackDto(t, ctx(req))), { page, limit }, total));
  },
);

router.get('/tracks/:id', validate({ params: idParams }), async (req, res) => {
  const track = await Track.findOne({ _id: req.valid.params.id, status: 'published' }).populate(TRACK_POPULATE);
  if (!track) throw notFound('Track');
  res.json({ track: trackDto(track, ctx(req)) });
});

/**
 * Short lived signed URL for streaming a licensed track. Checks the licence
 * window, territory and the listener's plan on every request.
 */
router.get('/tracks/:id/stream', validate({ params: idParams }), async (req, res) => {
  const track = await Track.findById(req.valid.params.id).select('+audioKey');
  if (!track || track.status !== 'published') throw notFound('Track');
  if (!track.isAvailable('stream', req.country)) {
    throw new HttpError(451, 'This track is not available in your region', 'not_licensed');
  }
  if (!track.freeTier && !req.user.isPremium()) {
    throw new HttpError(402, 'This track needs a Premium plan', 'premium_required');
  }
  const url = await signedAudioUrl(track.audioKey);
  res.set('Cache-Control', 'no-store');
  res.json({ url, mimeType: track.audioMimeType, expiresAt: new Date(Date.now() + env.STREAM_URL_TTL_SECONDS * 1000) });
});

router.get('/artists/:id', validate({ params: idParams }), async (req, res) => {
  const artist = await Artist.findById(req.valid.params.id);
  if (!artist) throw notFound('Artist');
  const [topTracks, albums] = await Promise.all([
    Track.find({ ...availableFilter(req.country), artist: artist._id }).populate(TRACK_POPULATE).sort({ playCount: -1 }).limit(20),
    Album.find({ artist: artist._id }).sort({ releaseDate: -1 }),
  ]);
  res.json({ artist: artistDto(artist), topTracks: topTracks.map((t) => trackDto(t, ctx(req))), albums: albums.map(albumDto) });
});

router.get('/albums/:id', validate({ params: idParams }), async (req, res) => {
  const album = await Album.findById(req.valid.params.id).populate('artist', 'name imageUrl');
  if (!album) throw notFound('Album');
  const tracks = await Track.find({ ...availableFilter(req.country), album: album._id })
    .populate(TRACK_POPULATE)
    .sort({ trackNumber: 1, createdAt: 1 });
  const items = tracks.map((t) => trackDto(t, ctx(req)));
  res.json({
    album: { ...albumDto(album), artist: artistDto(album.artist) },
    tracks: items,
    totalDurationSec: items.reduce((sum, t) => sum + t.durationSec, 0),
  });
});

export { objectId };
export default router;
