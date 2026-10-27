/** Typed wrappers for every API call the web app makes. */
import { api } from './client';
import type {
  Album,
  Artist,
  BillingPlans,
  CatalogTrack,
  Home,
  ItemRef,
  MediaItem,
  PageOf,
  Playlist,
  PlaylistSummary,
  Session,
  User,
  YouTubeVideo,
} from './types';

const q = (params: Record<string, string | number | undefined>) => {
  const s = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join('&');
  return s ? `?${s}` : '';
};
const platform = 'web';
const deviceName = () => 'Web browser';

export type PublicConfig = { googleClientId: string | null; appleServicesId: string | null; youtubeEnabled: boolean; billingEnabled: boolean };

export const Config = { get: () => api<PublicConfig>('/config') };

export const Auth = {
  register: (email: string, password: string, displayName: string) =>
    api<Session>('/auth/register', { method: 'POST', body: { email, password, displayName, deviceName: deviceName() } }),
  login: (email: string, password: string) =>
    api<Session>('/auth/login', { method: 'POST', body: { email, password, deviceName: deviceName() } }),
  google: (idToken: string) => api<Session>('/auth/google', { method: 'POST', body: { idToken, deviceName: deviceName() } }),
  apple: (body: { identityToken: string; nonce: string; authorizationCode?: string; fullName?: string }) =>
    api<Session>('/auth/apple', { method: 'POST', body: { ...body, deviceName: deviceName() } }),
  logout: () => api('/auth/logout', { method: 'POST', body: {} }),
  logoutAll: () => api('/auth/logout-all', { method: 'POST' }),
  forgotPassword: (email: string) => api('/auth/password/forgot', { method: 'POST', body: { email } }),
  resendVerification: () => api('/auth/email/resend', { method: 'POST' }),
};

export const Me = {
  get: () => api<{ user: User }>('/me'),
  update: (body: Partial<Pick<User, 'displayName' | 'avatarUrl'>> & { preferences?: Partial<User['preferences']> }) =>
    api<{ user: User }>('/me', { method: 'PATCH', body }),
  changePassword: (currentPassword: string | undefined, newPassword: string) =>
    api<Session>('/me/password', { method: 'PUT', body: { currentPassword, newPassword } }),
  delete: () => api('/me', { method: 'DELETE', body: { confirm: 'DELETE' } }),
};

export const Catalog = {
  home: () => api<Home>('/catalog/home'),
  search: (text: string) =>
    api<{ tracks: CatalogTrack[]; artists: Artist[]; albums: Album[]; playlists: PlaylistSummary[] }>(`/catalog/search${q({ q: text })}`),
  tracks: (page = 1, genre?: string) => api<PageOf<CatalogTrack>>(`/catalog/tracks${q({ page, genre })}`),
  stream: (id: string) => api<{ url: string; mimeType: string; expiresAt: string }>(`/catalog/tracks/${id}/stream`),
  artist: (id: string) => api<{ artist: Artist; topTracks: CatalogTrack[]; albums: Album[] }>(`/catalog/artists/${id}`),
  album: (id: string) => api<{ album: Album & { artist: Artist }; tracks: CatalogTrack[]; totalDurationSec: number }>(`/catalog/albums/${id}`),
};

export const YouTube = {
  search: (text: string, pageToken?: string) =>
    api<{ items: YouTubeVideo[]; nextPageToken: string | null }>(`/youtube/search${q({ q: text, pageToken })}`),
};

export const Playlists = {
  mine: () => api<{ items: PlaylistSummary[] }>('/playlists'),
  get: (id: string) => api<{ playlist: Playlist }>(`/playlists/${id}`),
  shared: (shareId: string) => api<{ playlist: Playlist }>(`/playlists/shared/${shareId}`),
  create: (name: string, description?: string) => api<{ playlist: Playlist }>('/playlists', { method: 'POST', body: { name, description } }),
  update: (id: string, body: Partial<Pick<Playlist, 'name' | 'description' | 'visibility'>>) =>
    api<{ playlist: Playlist }>(`/playlists/${id}`, { method: 'PATCH', body }),
  remove: (id: string) => api(`/playlists/${id}`, { method: 'DELETE' }),
  copy: (id: string) => api<{ playlist: Playlist }>(`/playlists/${id}/copy`, { method: 'POST' }),
  addItems: (id: string, items: ItemRef[]) => api<{ playlist: Playlist }>(`/playlists/${id}/items`, { method: 'POST', body: { items } }),
  removeItem: (id: string, itemId: string) => api<{ playlist: Playlist }>(`/playlists/${id}/items/${itemId}`, { method: 'DELETE' }),
  moveItem: (id: string, itemId: string, toIndex: number) =>
    api<{ playlist: Playlist }>(`/playlists/${id}/items/order`, { method: 'PUT', body: { itemId, toIndex } }),
  share: (id: string, visibility: 'unlisted' | 'public' = 'unlisted') =>
    api<{ shareUrl: string; visibility: string }>(`/playlists/${id}/share`, { method: 'POST', body: { visibility } }),
  invite: (id: string) => api<{ inviteUrl: string }>(`/playlists/${id}/invite`, { method: 'POST' }),
  join: (token: string) => api<{ playlist: Playlist }>('/playlists/join', { method: 'POST', body: { token } }),
  follow: (id: string) => api(`/playlists/${id}/follow`, { method: 'POST' }),
  unfollow: (id: string) => api(`/playlists/${id}/follow`, { method: 'DELETE' }),
};

export type PlayReport = ItemRef & {
  msPlayed: number;
  completed: boolean;
  offline: boolean;
  playedAt: string;
  context?: { type: 'playlist' | 'album' | 'artist' | 'search' | 'favorites' | 'history' | 'other'; id?: string };
};

export const Library = {
  favorites: (page = 1) => api<PageOf<MediaItem>>(`/library/favorites${q({ page, limit: 50 })}`),
  favoriteIds: () => api<{ trackIds: string[]; videoIds: string[] }>('/library/favorites/ids'),
  like: (ref: ItemRef) => api('/library/favorites', { method: 'POST', body: ref }),
  unlike: (ref: ItemRef) => api('/library/favorites', { method: 'DELETE', body: ref }),
  history: (page = 1) => api<PageOf<MediaItem & { playedAt: string }>>(`/library/history${q({ page, limit: 50 })}`),
  clearHistory: () => api('/library/history', { method: 'DELETE' }),
  reportPlays: (plays: PlayReport[]) =>
    api<{ recorded: number }>('/library/history', { method: 'POST', body: { plays: plays.map((p) => ({ ...p, platform })) } }),
};

export const Billing = {
  plans: () => api<BillingPlans>(`/billing/plans${q({ platform })}`),
  checkout: (planId: string) => api<{ url: string }>('/billing/checkout', { method: 'POST', body: { planId, platform } }),
  portal: () => api<{ url: string }>('/billing/portal', { method: 'POST', body: { platform } }),
};
