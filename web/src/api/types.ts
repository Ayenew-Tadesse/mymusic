/** Shapes returned by the MyMusic API. Keep in sync with server/src/services/serializers.js. */

export type Plan = 'free' | 'premium' | 'family';

export type User = {
  id: string;
  email: string | null;
  emailVerified: boolean;
  displayName: string;
  avatarUrl: string | null;
  role: 'user' | 'admin';
  providers: { password: boolean; google: boolean; apple: boolean };
  subscription: { plan: Plan; status: string; currentPeriodEnd: string | null; cancelAtPeriodEnd: boolean };
  preferences: { theme: 'system' | 'dark' | 'light'; allowExplicit: boolean };
  createdAt: string;
};

// On the web the refresh token is set as an httpOnly cookie, not returned in the body.
export type Session = { user: User; accessToken: string; refreshToken?: string };

export type CatalogTrack = {
  kind: 'catalog';
  id: string;
  title: string;
  artist: { id: string; name: string } | null;
  album: { id: string; title: string } | null;
  artworkUrl: string | null;
  durationSec: number;
  explicit: boolean;
  genres?: string[];
  attribution: string | null;
  freeTier: boolean;
  playable: boolean;
  downloadable: boolean;
  unavailable?: boolean;
  itemId?: string;
};

export type YouTubeVideo = {
  kind: 'youtube';
  videoId: string;
  title: string;
  channelTitle: string;
  channelId?: string | null;
  thumbnailUrl: string | null;
  durationSec: number;
  watchUrl: string;
  unavailable?: boolean;
  itemId?: string;
};

export type MediaItem = CatalogTrack | YouTubeVideo;

/** Reference used by playlist / favorite / history endpoints. */
export type ItemRef = { kind: 'catalog'; trackId: string } | { kind: 'youtube'; videoId: string };

export const itemKey = (i: MediaItem) => (i.kind === 'catalog' ? `c:${i.id}` : `y:${i.videoId}`);
export const itemRef = (i: MediaItem): ItemRef => (i.kind === 'catalog' ? { kind: 'catalog', trackId: i.id } : { kind: 'youtube', videoId: i.videoId });
export const itemArtwork = (i: MediaItem) => (i.kind === 'catalog' ? i.artworkUrl : i.thumbnailUrl);
export const itemSubtitle = (i: MediaItem) => (i.kind === 'catalog' ? i.artist?.name ?? '' : i.channelTitle);

export type Artist = { id: string; name: string; imageUrl: string | null; bio: string | null; genres: string[]; verified: boolean };
export type Album = { id: string; title: string; artworkUrl: string | null; releaseDate: string | null; label: string | null; artist?: Artist | { id: string; name: string } };

export type PlaylistSummary = {
  id: string;
  name: string;
  description: string;
  coverUrl: string | null;
  visibility: 'private' | 'unlisted' | 'public';
  isEditorial: boolean;
  owner: { id: string; displayName?: string };
  itemCount: number;
  followerCount: number;
  isOwner: boolean;
  canEdit: boolean;
  isFollowing: boolean;
  updatedAt: string;
};

export type Playlist = PlaylistSummary & { items: (MediaItem & { itemId: string })[]; totalDurationSec: number; shareUrl: string | null };

export type PageOf<T> = { items: T[]; page: number; limit: number; total: number; hasMore: boolean };

export type Home = {
  editorial: PlaylistSummary[];
  newReleases: CatalogTrack[];
  popular: CatalogTrack[];
  recentlyPlayed: MediaItem[];
};

export type BillingPlans = {
  canPurchase: boolean;
  plans: { id: string; plan: Plan; interval: 'month' | 'year'; amount: number; currency: string }[];
  current: User['subscription'];
};

export type OfflineLicenseGrant = {
  license: { id: string; trackId: string; expiresAt: string };
  contentKey: string;
  download: { url: string; mimeType: string; sizeBytes: number | null };
  track: CatalogTrack;
};
