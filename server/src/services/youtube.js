/**
 * YouTube Data API v3 client.
 *
 * Policy notes (YouTube API Services Terms & Developer Policies):
 *  - Used only to search for and display metadata of public videos.
 *  - Playback happens exclusively in the official embedded IFrame player on
 *    the device; we never download, proxy, cache or extract audio/video.
 *  - Only embeddable, syndicated videos are returned, so they can play in-app.
 *  - Stored data is limited to video ids; metadata is cached briefly and
 *    re-fetched, never kept longer than the policies allow.
 *  - The API key stays on the server and is never sent to clients.
 */
import env from '../config/env.js';
import logger from '../config/logger.js';
import { YoutubeCache } from '../models/index.js';
import { HttpError } from '../utils/httpError.js';

const API = 'https://www.googleapis.com/youtube/v3';
const MUSIC_CATEGORY_ID = '10';
export const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

async function cached(key, ttlSeconds, load) {
  const hit = await YoutubeCache.findOne({ key, expiresAt: { $gt: new Date() } }).lean();
  if (hit) return hit.value;
  const value = await load();
  await YoutubeCache.updateOne(
    { key },
    { $set: { value, expiresAt: new Date(Date.now() + ttlSeconds * 1000) } },
    { upsert: true },
  );
  return value;
}

async function call(path, params) {
  if (!env.YOUTUBE_API_KEY) throw new HttpError(503, 'YouTube search is not configured', 'youtube_unconfigured');
  const url = new URL(`${API}/${path}`);
  for (const [k, v] of Object.entries({ ...params, key: env.YOUTUBE_API_KEY })) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const reason = body?.error?.errors?.[0]?.reason;
    logger.warn({ status: res.status, reason, path }, 'YouTube API error');
    if (reason === 'quotaExceeded' || reason === 'dailyLimitExceeded') {
      throw new HttpError(503, 'YouTube search is temporarily unavailable', 'youtube_quota');
    }
    throw new HttpError(502, 'YouTube request failed', 'youtube_error');
  }
  return res.json();
}

/** Parse an ISO 8601 duration such as PT1H2M10S into seconds. */
export function parseIsoDuration(iso = '') {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
  if (!m) return 0;
  const [, d = 0, h = 0, min = 0, s = 0] = m.map((x) => Number(x ?? 0));
  return d * 86400 + h * 3600 + min * 60 + s;
}

function bestThumb(thumbnails = {}) {
  return (thumbnails.maxres ?? thumbnails.high ?? thumbnails.medium ?? thumbnails.default)?.url ?? null;
}

function toDto(video) {
  return {
    kind: 'youtube',
    videoId: video.id,
    title: video.snippet?.title ?? '',
    channelTitle: video.snippet?.channelTitle ?? '',
    channelId: video.snippet?.channelId ?? null,
    thumbnailUrl: bestThumb(video.snippet?.thumbnails),
    durationSec: parseIsoDuration(video.contentDetails?.duration),
    // Clients must render YouTube attribution and link back to the watch page.
    watchUrl: `https://www.youtube.com/watch?v=${video.id}`,
  };
}

const isPlayable = (v) =>
  v?.status?.embeddable === true && v?.status?.privacyStatus === 'public' && v?.status?.uploadStatus === 'processed';

/** Fetch metadata for up to any number of ids (batched by 50). Missing / unplayable ids are omitted. */
export async function getVideos(ids) {
  const unique = [...new Set(ids.filter((id) => VIDEO_ID_RE.test(id)))];
  const result = new Map();
  for (let i = 0; i < unique.length; i += 50) {
    const batch = unique.slice(i, i + 50);
    const key = `videos:${batch.slice().sort().join(',')}`;
    const items = await cached(key, env.YOUTUBE_CACHE_TTL_SECONDS, async () => {
      const json = await call('videos', { part: 'snippet,contentDetails,status', id: batch.join(','), maxResults: 50 });
      return (json.items ?? []).filter(isPlayable).map(toDto);
    });
    for (const item of items) result.set(item.videoId, item);
  }
  return result;
}

/**
 * Search public, embeddable music videos.
 * search.list costs 100 quota units per call, so results are cached and the
 * route is rate limited per user.
 */
export async function searchMusic(query, { pageToken, regionCode = env.YOUTUBE_REGION_CODE } = {}) {
  const q = query.trim().slice(0, 100);
  const key = `search:${regionCode}:${pageToken ?? ''}:${q.toLowerCase()}`;
  return cached(key, env.YOUTUBE_CACHE_TTL_SECONDS, async () => {
    const json = await call('search', {
      part: 'snippet',
      type: 'video',
      q,
      videoCategoryId: MUSIC_CATEGORY_ID,
      videoEmbeddable: 'true',
      videoSyndicated: 'true',
      safeSearch: 'moderate',
      regionCode,
      maxResults: 20,
      pageToken,
    });
    const ids = (json.items ?? []).map((i) => i.id?.videoId).filter(Boolean);
    const details = await getVideos(ids);
    return {
      items: ids.map((id) => details.get(id)).filter(Boolean),
      nextPageToken: json.nextPageToken ?? null,
    };
  });
}

// ---- Playlists -----------------------------------------------------------------

export const PLAYLIST_ID_RE = /^[A-Za-z0-9_-]{10,64}$/;
export const MAX_IMPORT_ITEMS = 500;

/**
 * Accepts a YouTube / YouTube Music playlist URL (anything with `list=`) or a
 * bare playlist id. Returns null when no playlist id can be found.
 */
export function parsePlaylistId(input) {
  const text = String(input ?? '').trim();
  if (PLAYLIST_ID_RE.test(text)) return text;
  try {
    const url = new URL(text);
    const host = url.hostname.replace(/^www\.|^m\.|^music\./, '');
    if (!['youtube.com', 'youtu.be'].includes(host)) return null;
    const id = url.searchParams.get('list');
    return id && PLAYLIST_ID_RE.test(id) ? id : null;
  } catch {
    return null;
  }
}

/** Auto-generated mixes (RD…) and personal lists (LL, WL) aren't readable through the API. */
const isUnreadable = (id) => /^(RD|LL$|WL$|LM$)/.test(id);

/**
 * Title and channel for a preview, plus the playable video ids in order
 * (up to MAX_IMPORT_ITEMS). Private, deleted and non-embeddable videos are
 * left out and counted in `skipped`.
 */
export async function getPlaylist(playlistId) {
  if (isUnreadable(playlistId)) {
    throw new HttpError(422, 'YouTube mixes and personal lists can’t be imported. Use a regular public or unlisted playlist.', 'youtube_playlist_unsupported');
  }
  return cached(`playlist:${playlistId}`, env.YOUTUBE_CACHE_TTL_SECONDS, async () => {
    const meta = await call('playlists', { part: 'snippet,contentDetails', id: playlistId, maxResults: 1 });
    const pl = meta.items?.[0];
    if (!pl) throw new HttpError(404, 'That YouTube playlist doesn’t exist or is private', 'youtube_playlist_not_found');

    const ids = [];
    let pageToken;
    // playlistItems.list costs 1 quota unit per page of 50.
    do {
      const page = await call('playlistItems', { part: 'contentDetails', playlistId, maxResults: 50, pageToken });
      for (const it of page.items ?? []) if (it.contentDetails?.videoId) ids.push(it.contentDetails.videoId);
      pageToken = page.nextPageToken;
    } while (pageToken && ids.length < MAX_IMPORT_ITEMS);

    const listed = ids.slice(0, MAX_IMPORT_ITEMS);
    const playable = await getVideos(listed);
    const videoIds = listed.filter((id) => playable.has(id));
    return {
      playlistId,
      title: pl.snippet?.title ?? 'YouTube playlist',
      channelTitle: pl.snippet?.channelTitle ?? '',
      thumbnailUrl: bestThumb(pl.snippet?.thumbnails),
      totalCount: pl.contentDetails?.itemCount ?? ids.length,
      videoIds,
      skipped: listed.length - videoIds.length,
      truncated: (pl.contentDetails?.itemCount ?? ids.length) > MAX_IMPORT_ITEMS,
    };
  });
}
