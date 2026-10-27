/**
 * Converts documents into the JSON shapes the apps consume and hydrates
 * mixed catalog / YouTube item lists.
 */
import { Track } from '../models/index.js';
import { getVideos } from './youtube.js';
import logger from '../config/logger.js';

export function artistDto(a) {
  if (!a) return null;
  return { id: a._id.toString(), name: a.name, imageUrl: a.imageUrl ?? null, bio: a.bio ?? null, genres: a.genres ?? [], verified: !!a.verified };
}

export function albumDto(al) {
  if (!al) return null;
  return {
    id: al._id.toString(),
    title: al.title,
    artworkUrl: al.artworkUrl ?? null,
    releaseDate: al.releaseDate ?? null,
    label: al.label ?? null,
    artist: al.artist?.name ? { id: al.artist._id.toString(), name: al.artist.name } : undefined,
  };
}

/** Track DTO with availability for the requesting user. Expects artist & album populated. */
export function trackDto(t, { user, country } = {}) {
  const streamable = t.isAvailable?.('stream', country) ?? false;
  const premium = user?.isPremium?.() ?? false;
  return {
    kind: 'catalog',
    id: t._id.toString(),
    title: t.title,
    artist: t.artist?.name ? { id: t.artist._id.toString(), name: t.artist.name } : null,
    album: t.album?.title ? { id: t.album._id.toString(), title: t.album.title } : null,
    artworkUrl: t.artworkUrl || t.album?.artworkUrl || null,
    durationSec: t.durationSec,
    explicit: t.explicit,
    genres: t.genres,
    attribution: t.rights?.attribution || null,
    freeTier: t.freeTier,
    // What this user can do right now.
    playable: streamable && (t.freeTier || premium),
    downloadable: premium && (t.isAvailable?.('offline', country) ?? false),
  };
}

export const TRACK_POPULATE = [
  { path: 'artist', select: 'name imageUrl' },
  { path: 'album', select: 'title artworkUrl' },
];

/**
 * Hydrate a list of {kind, track|videoId, ...extra} references into full DTOs.
 * Unavailable entries are kept with `unavailable: true` so the UI can grey them out.
 */
export async function hydrateItems(refs, ctx) {
  const trackIds = refs.filter((r) => r.kind === 'catalog' && r.track).map((r) => r.track._id ?? r.track);
  const videoIds = refs.filter((r) => r.kind === 'youtube').map((r) => r.videoId);

  const [tracks, videos] = await Promise.all([
    trackIds.length ? Track.find({ _id: { $in: trackIds } }).populate(TRACK_POPULATE) : [],
    videoIds.length
      ? getVideos(videoIds).catch((err) => {
          // Degrade gracefully: catalog items still load when YouTube is unavailable.
          logger.warn({ err: err.message }, 'YouTube hydration failed');
          return new Map();
        })
      : new Map(),
  ]);
  const trackMap = new Map(tracks.map((t) => [t._id.toString(), t]));

  return refs.map((ref) => {
    const extra = { itemId: ref._id?.toString(), addedAt: ref.addedAt ?? ref.createdAt ?? ref.playedAt };
    if (ref.kind === 'catalog') {
      const t = trackMap.get((ref.track._id ?? ref.track).toString());
      if (!t || t.status !== 'published') return { kind: 'catalog', id: (ref.track._id ?? ref.track).toString(), unavailable: true, ...extra };
      return { ...trackDto(t, ctx), ...extra };
    }
    const v = videos.get(ref.videoId);
    return v ? { ...v, ...extra } : { kind: 'youtube', videoId: ref.videoId, unavailable: true, ...extra };
  });
}

export function playlistSummary(p, userId) {
  return {
    id: p._id.toString(),
    name: p.name,
    description: p.description,
    coverUrl: p.coverUrl ?? null,
    visibility: p.visibility,
    isEditorial: p.isEditorial,
    owner: p.owner?.displayName ? { id: p.owner._id.toString(), displayName: p.owner.displayName } : { id: p.owner.toString() },
    itemCount: p.items.length,
    followerCount: p.followers?.length ?? 0,
    isOwner: p.isOwnedBy(userId),
    canEdit: p.canEdit(userId),
    isFollowing: Boolean(userId) && (p.followers ?? []).some((f) => f.toString() === userId.toString()),
    updatedAt: p.updatedAt,
  };
}
