/**
 * Demo mode (VITE_DEMO=1): answers every /api/v1 request in the browser with
 * sample data, so the web app can be tried without a server or database.
 * Nothing leaves the page; state lasts until the tab is closed.
 */
import type { Album, Artist, CatalogTrack, MediaItem, Playlist, PlaylistSummary, User } from '../api/types';

const W = 600;

/** Generated cover art: layered shapes on a gradient, unique per seed. */
function cover(seed: number, a: string, b: string, label?: string, round = false) {
  const r = (n: number) => ((Math.sin(seed * 9301 + n * 49297) + 1) / 2);
  const shapes = Array.from({ length: 5 }, (_, i) => {
    const cx = Math.round(r(i) * W);
    const cy = Math.round(r(i + 7) * W);
    const rad = Math.round(80 + r(i + 13) * 220);
    return `<circle cx="${cx}" cy="${cy}" r="${rad}" fill="${i % 2 ? a : b}" fill-opacity="${(0.18 + r(i + 3) * 0.3).toFixed(2)}"/>`;
  }).join('');
  const text = label
    ? `<text x="40" y="${W - 48}" font-family="Helvetica,Arial,sans-serif" font-size="58" font-weight="800" fill="#fff" fill-opacity=".92">${label}</text>`
    : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${W}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="#121212"/></linearGradient>${round ? `<clipPath id="c"><circle cx="300" cy="300" r="300"/></clipPath>` : ''}</defs><g${round ? ' clip-path="url(#c)"' : ''}><rect width="${W}" height="${W}" fill="url(#g)"/>${shapes}${text}</g></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const oid = (prefix: string, n: number) => `${prefix}${String(n).padStart(24 - prefix.length, '0')}`;

// ---- Sample catalog -----------------------------------------------------------
const ARTISTS: (Artist & { palette: [string, string] })[] = [
  { id: oid('a', 1), name: 'Luna Park', bio: 'Dream-pop duo from Lisbon writing songs for late trains and long summers.', genres: ['dream pop', 'indie'], verified: true, imageUrl: null, palette: ['#e8115b', '#ff9f43'] },
  { id: oid('a', 2), name: 'Mira Vale', bio: 'Producer and vocalist mixing Ethiopian jazz scales with warm analog synths.', genres: ['electronic', 'jazz'], verified: true, imageUrl: null, palette: ['#1e3264', '#27856a'] },
  { id: oid('a', 3), name: 'The Licensed Band', bio: 'A four-piece that owns every master it records, which is why you can hear them here.', genres: ['rock'], verified: false, imageUrl: null, palette: ['#509bf5', '#8d67ab'] },
  { id: oid('a', 4), name: 'Abebe & The Tide', bio: 'Brass, bass and big choruses from Addis Ababa.', genres: ['afrobeat', 'funk'], verified: true, imageUrl: null, palette: ['#e1118c', '#f59b23'] },
];
ARTISTS.forEach((a, i) => (a.imageUrl = cover(100 + i, a.palette[0], a.palette[1], undefined, true)));

const ALBUMS: (Album & { artistIdx: number; titles: string[] })[] = [
  { id: oid('b', 1), title: 'First Light', artistIdx: 0, releaseDate: '2025-03-14', label: 'MyMusic Records', artworkUrl: null, titles: ['Midnight Drive', 'Golden Hour', 'Paper Planes', 'Low Tide'] },
  { id: oid('b', 2), title: 'Blue Nile Sessions', artistIdx: 1, releaseDate: '2025-09-02', label: 'Vale Sound', artworkUrl: null, titles: ['Neon Rain', 'Tizita Loop', 'Static Bloom', 'Highland Wires'] },
  { id: oid('b', 3), title: 'Owned Masters', artistIdx: 2, releaseDate: '2024-11-20', label: 'Licensed Band LLC', artworkUrl: null, titles: ['Afterglow', 'Signal Fires', 'Second Wind'] },
  { id: oid('b', 4), title: 'Merkato Nights', artistIdx: 3, releaseDate: '2026-02-07', label: 'Tide Music', artworkUrl: null, titles: ['Horns at Dawn', 'Bole Road', 'Coffee Ceremony', 'Rainy Season'] },
];
ALBUMS.forEach((al, i) => (al.artworkUrl = cover(200 + i, ARTISTS[al.artistIdx].palette[0], ARTISTS[al.artistIdx].palette[1], al.title)));

const TRACKS: CatalogTrack[] = [];
ALBUMS.forEach((al, ai) =>
  al.titles.forEach((title, ti) => {
    const n = TRACKS.length + 1;
    const artist = ARTISTS[al.artistIdx];
    TRACKS.push({
      kind: 'catalog',
      id: oid('t', n),
      title,
      artist: { id: artist.id, name: artist.name },
      album: { id: al.id, title: al.title },
      artworkUrl: al.artworkUrl,
      durationSec: 30, // demo clips are 30 seconds
      explicit: n % 7 === 0,
      genres: artist.genres,
      attribution: ai === 2 ? 'Licensed under CC BY 4.0, The Licensed Band' : null,
      freeTier: true,
      playable: true,
      downloadable: false,
    });
    void ti;
  }),
);
const trackById = new Map(TRACKS.map((t) => [t.id, t]));
const plays = new Map<string, number>(TRACKS.map((t, i) => [t.id, 1000 - i * 37]));

// ---- Per-tab state ------------------------------------------------------------
let user: User = {
  id: oid('u', 1),
  email: 'demo@mymusic.app',
  emailVerified: true,
  displayName: 'Demo listener',
  avatarUrl: null,
  role: 'user',
  providers: { password: true, google: false, apple: false },
  subscription: { plan: 'free', status: 'none', currentPeriodEnd: null, cancelAtPeriodEnd: false },
  preferences: { theme: 'system', allowExplicit: true },
  createdAt: new Date().toISOString(),
};
let signedIn = true;

type Item = { itemId: string; trackId: string; addedAt: string };
type PL = { id: string; name: string; description: string; visibility: 'private' | 'unlisted' | 'public'; isEditorial: boolean; ownerId: string; ownerName: string; items: Item[]; followers: Set<string>; shareId: string; palette: [string, string] };
let seq = 1000;
const nextId = (p: string) => oid(p, ++seq);
const mkItems = (ids: string[]): Item[] => ids.map((trackId) => ({ itemId: nextId('i'), trackId, addedAt: new Date().toISOString() }));

const playlists: PL[] = [
  { id: oid('p', 1), name: 'Road Trip', description: 'Windows down, volume up.', visibility: 'private', isEditorial: false, ownerId: user.id, ownerName: user.displayName, items: mkItems([TRACKS[0].id, TRACKS[13].id, TRACKS[5].id, TRACKS[9].id, TRACKS[2].id]), followers: new Set(), shareId: 'roadtrip01', palette: ['#ff6437', '#e8115b'] },
  { id: oid('p', 2), name: 'Addis After Dark', description: 'Ethio-jazz, horns and late-night grooves.', visibility: 'public', isEditorial: true, ownerId: oid('u', 9), ownerName: 'MyMusic', items: mkItems([TRACKS[11].id, TRACKS[5].id, TRACKS[12].id, TRACKS[6].id, TRACKS[14].id]), followers: new Set(), shareId: 'addisdark1', palette: ['#1e3264', '#e1118c'] },
  { id: oid('p', 3), name: 'Focus Flow', description: 'Steady, wordless, no surprises.', visibility: 'public', isEditorial: true, ownerId: oid('u', 9), ownerName: 'MyMusic', items: mkItems([TRACKS[4].id, TRACKS[7].id, TRACKS[1].id, TRACKS[10].id]), followers: new Set(), shareId: 'focusflow1', palette: ['#27856a', '#509bf5'] },
  { id: oid('p', 4), name: 'Fresh Finds', description: 'New this month from artists who own their masters.', visibility: 'public', isEditorial: true, ownerId: oid('u', 9), ownerName: 'MyMusic', items: mkItems(TRACKS.slice(-6).map((t) => t.id)), followers: new Set(), shareId: 'freshfind1', palette: ['#8d67ab', '#f59b23'] },
];
const favorites: { trackId: string; createdAt: string }[] = [TRACKS[1], TRACKS[11]].map((t) => ({ trackId: t.id, createdAt: new Date().toISOString() }));
const history: { trackId: string; playedAt: string }[] = [TRACKS[11], TRACKS[0], TRACKS[5], TRACKS[13], TRACKS[2], TRACKS[8]].map((t, i) => ({ trackId: t.id, playedAt: new Date(Date.now() - i * 3600_000).toISOString() }));

const coverOf = (p: PL) => cover(300 + Number(p.id.slice(-4)), p.palette[0], p.palette[1], p.name.length <= 14 ? p.name : undefined);
const premium = () => user.subscription.plan !== 'free';
const dto = (t: CatalogTrack): CatalogTrack => ({ ...t, playable: true });

function summary(p: PL): PlaylistSummary {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    coverUrl: coverOf(p),
    visibility: p.visibility,
    isEditorial: p.isEditorial,
    owner: { id: p.ownerId, displayName: p.ownerName },
    itemCount: p.items.length,
    followerCount: p.followers.size + (p.isEditorial ? 1200 + p.items.length * 31 : 0),
    isOwner: p.ownerId === user.id,
    canEdit: p.ownerId === user.id,
    isFollowing: p.followers.has(user.id),
    updatedAt: new Date().toISOString(),
  };
}
function detail(p: PL): Playlist {
  const items = p.items.map((i) => ({ ...dto(trackById.get(i.trackId)!), itemId: i.itemId, addedAt: i.addedAt }));
  return { ...summary(p), items, totalDurationSec: items.reduce((s, i) => s + i.durationSec, 0), shareUrl: p.visibility === 'private' ? null : `https://mymusic.app/p/${p.shareId}` };
}
const albumDto = (al: (typeof ALBUMS)[number]): Album => ({ id: al.id, title: al.title, artworkUrl: al.artworkUrl, releaseDate: al.releaseDate, label: al.label, artist: { id: ARTISTS[al.artistIdx].id, name: ARTISTS[al.artistIdx].name } });
const artistDto = (a: (typeof ARTISTS)[number]): Artist => ({ id: a.id, name: a.name, bio: a.bio, imageUrl: a.imageUrl, genres: a.genres, verified: a.verified });

// ---- Demo audio: a short generated melody per track ---------------------------
const audioCache = new Map<string, string>();
function demoAudio(trackId: string) {
  const hit = audioCache.get(trackId);
  if (hit) return hit;
  const rate = 16000;
  const seconds = 30;
  const n = rate * seconds;
  const data = new Uint8Array(44 + n);
  const view = new DataView(data.buffer);
  const str = (o: number, s: string) => [...s].forEach((c, i) => (data[o + i] = c.charCodeAt(0)));
  str(0, 'RIFF'); view.setUint32(4, 36 + n, true); str(8, 'WAVE'); str(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate, true); view.setUint16(32, 1, true); view.setUint16(34, 8, true);
  str(36, 'data'); view.setUint32(40, n, true);
  // Pentatonic arpeggio over a soft bass note; the seed picks key and pattern.
  const seed = Number(trackId.slice(-4));
  const scale = [0, 2, 4, 7, 9, 12, 14, 16];
  const root = 220 * Math.pow(2, (seed % 7) / 12);
  const step = 0.25 + (seed % 3) * 0.05;
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const k = Math.floor(t / step);
    const note = scale[(k * (seed % 5 + 2) + Math.floor(k / 8)) % scale.length];
    const f = root * Math.pow(2, note / 12);
    const local = t - k * step;
    const env = Math.exp(-local * 6);
    const bass = 0.25 * Math.sin(2 * Math.PI * (root / 2) * t) * (0.6 + 0.4 * Math.sin(Math.PI * t / 2));
    const fade = Math.min(1, t / 1.5, (seconds - t) / 2);
    const v = (0.45 * env * Math.sin(2 * Math.PI * f * t) + 0.15 * env * Math.sin(4 * Math.PI * f * t) + bass) * fade;
    data[44 + i] = Math.max(0, Math.min(255, Math.round(128 + v * 90)));
  }
  const url = URL.createObjectURL(new Blob([data], { type: 'audio/wav' }));
  audioCache.set(trackId, url);
  return url;
}

// ---- Router -------------------------------------------------------------------
class Reply {
  status: number;
  body?: unknown;
  constructor(status: number, body?: unknown) {
    this.status = status;
    this.body = body;
  }
}
const ok = (body?: unknown) => new Reply(body === undefined ? 204 : 200, body);
const err = (status: number, message: string, code = 'error') => new Reply(status, { error: { code, message } });
const session = () => ({ user, accessToken: 'demo-token', tokenType: 'Bearer' });
const findPl = (id: string) => playlists.find((p) => p.id === id);
const page = <T,>(all: T[], q: URLSearchParams) => {
  const p = Number(q.get('page') ?? 1);
  const limit = Number(q.get('limit') ?? 20);
  return { items: all.slice((p - 1) * limit, p * limit), page: p, limit, total: all.length, hasMore: p * limit < all.length };
};

type Route = [string, RegExp, (m: RegExpMatchArray, body: Record<string, unknown>, q: URLSearchParams) => Reply];
const routes: Route[] = [
  ['POST', /^\/auth\/refresh$/, () => (signedIn ? ok({ accessToken: 'demo-token' }) : err(401, 'Signed out'))],
  ['POST', /^\/auth\/(login|register)$/, (_m, b) => {
    signedIn = true;
    if (typeof b.displayName === 'string' && b.displayName) user = { ...user, displayName: b.displayName };
    if (typeof b.email === 'string') user = { ...user, email: b.email };
    return new Reply(200, session());
  }],
  ['POST', /^\/auth\/(logout|logout-all)$/, () => ((signedIn = false), ok())],
  ['POST', /^\/auth\/password\/forgot$/, () => new Reply(202, { message: 'ok' })],
  ['POST', /^\/auth\/email\/resend$/, () => new Reply(202, { sent: false })],
  ['GET', /^\/config$/, () => ok({ googleClientId: null, appleServicesId: null, youtubeEnabled: false, billingEnabled: true })],
  ['GET', /^\/me$/, () => (signedIn ? ok({ user }) : err(401, 'Signed out'))],
  ['PATCH', /^\/me$/, (_m, b) => {
    const { preferences, ...rest } = b as Partial<User>;
    user = { ...user, ...rest, preferences: { ...user.preferences, ...(preferences ?? {}) } };
    return ok({ user });
  }],
  ['DELETE', /^\/me$/, () => err(403, 'Account deletion is turned off in this demo')],
  ['GET', /^\/me\/export$/, () => err(403, 'Data export is turned off in this demo')],

  ['GET', /^\/catalog\/home$/, () => {
    const recent: MediaItem[] = [];
    const seen = new Set<string>();
    for (const h of history) {
      if (seen.has(h.trackId) || recent.length >= 8) continue;
      seen.add(h.trackId);
      recent.push(dto(trackById.get(h.trackId)!));
    }
    return ok({
      editorial: playlists.filter((p) => p.isEditorial).map(summary),
      newReleases: [...TRACKS].reverse().slice(0, 8).map(dto),
      popular: [...TRACKS].sort((a, b) => plays.get(b.id)! - plays.get(a.id)!).slice(0, 8).map(dto),
      recentlyPlayed: recent,
    });
  }],
  ['GET', /^\/catalog\/search$/, (_m, _b, q) => {
    const s = (q.get('q') ?? '').toLowerCase();
    const has = (v: string) => v.toLowerCase().includes(s);
    const artists = ARTISTS.filter((a) => has(a.name) || a.genres.some(has));
    return ok({
      tracks: TRACKS.filter((t) => has(t.title) || artists.some((a) => a.id === t.artist?.id) || has(t.album?.title ?? '')).map(dto),
      artists: artists.map(artistDto),
      albums: ALBUMS.filter((al) => has(al.title) || artists.some((a) => a.id === ARTISTS[al.artistIdx].id)).map(albumDto),
      playlists: playlists.filter((p) => p.visibility === 'public' && has(p.name)).map(summary),
    });
  }],
  ['GET', /^\/catalog\/tracks\/([\w]+)\/stream$/, (m) => (trackById.has(m[1]) ? ok({ url: demoAudio(m[1]), mimeType: 'audio/wav', expiresAt: new Date(Date.now() + 600_000).toISOString() }) : err(404, 'Track not found'))],
  ['GET', /^\/catalog\/artists\/(\w+)$/, (m) => {
    const a = ARTISTS.find((x) => x.id === m[1]);
    if (!a) return err(404, 'Artist not found');
    return ok({ artist: artistDto(a), topTracks: TRACKS.filter((t) => t.artist?.id === a.id).map(dto), albums: ALBUMS.filter((al) => ARTISTS[al.artistIdx].id === a.id).map(albumDto) });
  }],
  ['GET', /^\/catalog\/albums\/(\w+)$/, (m) => {
    const al = ALBUMS.find((x) => x.id === m[1]);
    if (!al) return err(404, 'Album not found');
    const tracks = TRACKS.filter((t) => t.album?.id === al.id).map(dto);
    return ok({ album: { ...albumDto(al), artist: artistDto(ARTISTS[al.artistIdx]) }, tracks, totalDurationSec: tracks.reduce((s, t) => s + t.durationSec, 0) });
  }],

  ['GET', /^\/playlists$/, () => ok({ items: playlists.filter((p) => p.ownerId === user.id || p.followers.has(user.id)).map(summary) })],
  ['POST', /^\/playlists$/, (_m, b) => {
    const p: PL = { id: nextId('p'), name: String(b.name ?? 'My playlist'), description: String(b.description ?? ''), visibility: 'private', isEditorial: false, ownerId: user.id, ownerName: user.displayName, items: [], followers: new Set(), shareId: `s${seq}abcdef`, palette: [['#e8115b', '#509bf5', '#27856a', '#f59b23'][seq % 4], '#1e3264'] };
    playlists.unshift(p);
    return new Reply(201, { playlist: detail(p) });
  }],
  ['POST', /^\/playlists\/join$/, () => err(400, 'Invite links don’t work in this demo')],
  ['GET', /^\/playlists\/shared\/(\w+)$/, (m) => {
    const p = playlists.find((x) => x.shareId === m[1] && x.visibility !== 'private');
    return p ? ok({ playlist: detail(p) }) : err(404, 'Playlist not found');
  }],
  ['GET', /^\/playlists\/(\w+)$/, (m) => {
    const p = findPl(m[1]);
    return p && (p.visibility !== 'private' || p.ownerId === user.id) ? ok({ playlist: detail(p) }) : err(404, 'Playlist not found');
  }],
  ['PATCH', /^\/playlists\/(\w+)$/, (m, b) => {
    const p = findPl(m[1]);
    if (!p || p.ownerId !== user.id) return err(403, 'Only the owner can edit this playlist');
    Object.assign(p, Object.fromEntries(Object.entries(b).filter(([k]) => ['name', 'description', 'visibility'].includes(k))));
    return ok({ playlist: detail(p) });
  }],
  ['DELETE', /^\/playlists\/(\w+)$/, (m) => {
    const i = playlists.findIndex((x) => x.id === m[1] && x.ownerId === user.id);
    if (i === -1) return err(403, 'Only the owner can delete this playlist');
    playlists.splice(i, 1);
    return ok();
  }],
  ['POST', /^\/playlists\/(\w+)\/copy$/, (m) => {
    const src = findPl(m[1]);
    if (!src) return err(404, 'Playlist not found');
    const p: PL = { ...src, id: nextId('p'), name: `${src.name} (copy)`, visibility: 'private', isEditorial: false, ownerId: user.id, ownerName: user.displayName, items: mkItems(src.items.map((i) => i.trackId)), followers: new Set(), shareId: `c${seq}abcdef` };
    playlists.unshift(p);
    return new Reply(201, { playlist: detail(p) });
  }],
  ['POST', /^\/playlists\/(\w+)\/items$/, (m, b) => {
    const p = findPl(m[1]);
    if (!p || p.ownerId !== user.id) return err(403, 'You can’t edit this playlist');
    const refs = (b.items as { kind: string; trackId?: string }[]) ?? [];
    p.items.push(...mkItems(refs.filter((r) => r.trackId && trackById.has(r.trackId)).map((r) => r.trackId!)));
    return new Reply(201, { playlist: detail(p) });
  }],
  ['DELETE', /^\/playlists\/(\w+)\/items\/(\w+)$/, (m) => {
    const p = findPl(m[1]);
    if (!p) return err(404, 'Playlist not found');
    p.items = p.items.filter((i) => i.itemId !== m[2]);
    return ok({ playlist: detail(p) });
  }],
  ['PUT', /^\/playlists\/(\w+)\/items\/order$/, (m, b) => {
    const p = findPl(m[1]);
    if (!p) return err(404, 'Playlist not found');
    const from = p.items.findIndex((i) => i.itemId === b.itemId);
    const [moved] = p.items.splice(from, 1);
    p.items.splice(Math.min(Number(b.toIndex), p.items.length), 0, moved);
    return ok({ playlist: detail(p) });
  }],
  ['POST', /^\/playlists\/(\w+)\/share$/, (m, b) => {
    const p = findPl(m[1]);
    if (!p) return err(404, 'Playlist not found');
    p.visibility = (b.visibility as PL['visibility']) ?? 'unlisted';
    return ok({ shareUrl: `https://mymusic.app/p/${p.shareId}`, visibility: p.visibility });
  }],
  ['POST', /^\/playlists\/(\w+)\/invite$/, () => ok({ inviteUrl: 'https://mymusic.app/invite/demo-invite-link', token: 'demo', expiresInDays: 7 })],
  ['POST', /^\/playlists\/(\w+)\/follow$/, (m) => (findPl(m[1])?.followers.add(user.id), ok())],
  ['DELETE', /^\/playlists\/(\w+)\/follow$/, (m) => (findPl(m[1])?.followers.delete(user.id), ok())],

  ['GET', /^\/library\/favorites\/ids$/, () => ok({ trackIds: favorites.map((f) => f.trackId), videoIds: [] })],
  ['GET', /^\/library\/favorites$/, (_m, _b, q) => ok(page(favorites.map((f) => ({ ...dto(trackById.get(f.trackId)!), addedAt: f.createdAt })), q))],
  ['POST', /^\/library\/favorites$/, (_m, b) => {
    if (b.trackId && !favorites.some((f) => f.trackId === b.trackId)) favorites.unshift({ trackId: String(b.trackId), createdAt: new Date().toISOString() });
    return ok();
  }],
  ['DELETE', /^\/library\/favorites$/, (_m, b) => {
    const i = favorites.findIndex((f) => f.trackId === b.trackId);
    if (i !== -1) favorites.splice(i, 1);
    return ok();
  }],
  ['POST', /^\/library\/history$/, (_m, b) => {
    for (const p of (b.plays as { trackId?: string; playedAt?: string }[]) ?? []) {
      if (p.trackId) {
        history.unshift({ trackId: p.trackId, playedAt: p.playedAt ?? new Date().toISOString() });
        plays.set(p.trackId, (plays.get(p.trackId) ?? 0) + 1);
      }
    }
    return new Reply(202, { recorded: 1 });
  }],
  ['GET', /^\/library\/history$/, (_m, _b, q) => ok(page(history.map((h) => ({ ...dto(trackById.get(h.trackId)!), playedAt: h.playedAt })), q))],
  ['DELETE', /^\/library\/history$/, () => (history.splice(0), ok())],

  ['GET', /^\/billing\/plans$/, () =>
    ok({
      canPurchase: true,
      plans: premium()
        ? []
        : [
            { id: 'premium_monthly', plan: 'premium', interval: 'month', amount: 999, currency: 'usd' },
            { id: 'premium_yearly', plan: 'premium', interval: 'year', amount: 9900, currency: 'usd' },
            { id: 'family_monthly', plan: 'family', interval: 'month', amount: 1699, currency: 'usd' },
          ],
      current: user.subscription,
    })],
  ['POST', /^\/billing\/(checkout|portal)$/, () => err(403, 'Payments are turned off in this demo. In the real app this opens Stripe Checkout.')],
];

export function installDemo() {
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(raw, window.location.href);
    const idx = url.pathname.indexOf('/api/v1');
    if (idx === -1) return realFetch(input, init);
    const path = url.pathname.slice(idx + 7);
    const method = (init?.method ?? 'GET').toUpperCase();
    let body: Record<string, unknown> = {};
    try {
      body = init?.body ? JSON.parse(String(init.body)) : {};
    } catch {
      body = {};
    }
    // A short delay keeps loading states realistic.
    await new Promise((r) => setTimeout(r, 120));
    for (const [m, re, handler] of routes) {
      const match = method === m ? path.match(re) : null;
      if (!match) continue;
      const reply = handler(match, body, url.searchParams);
      return new Response(reply.status === 204 ? null : JSON.stringify(reply.body), { status: reply.status, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ error: { code: 'not_found', message: 'Not available in the demo' } }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  };
}
