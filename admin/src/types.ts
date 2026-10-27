export type User = {
  id: string;
  email: string | null;
  displayName: string;
  role: 'user' | 'admin';
  status?: 'active' | 'suspended';
  emailVerified: boolean;
  providers: { password: boolean; google: boolean; apple: boolean };
  subscription: { plan: string; status: string; currentPeriodEnd: string | null; cancelAtPeriodEnd: boolean };
  createdAt: string;
  lastLoginAt?: string;
  offlineDevices?: number;
  country?: string | null;
  stats?: { playlists: number; plays: number };
};

export type Ref = { id: string; name?: string; title?: string };

export type Rights = {
  licenseType: 'owned' | 'licensed' | 'creative_commons' | 'public_domain';
  licensor: string;
  licenseReference?: string;
  attribution?: string;
  territories: string[];
  streamAllowed: boolean;
  offlineAllowed: boolean;
  validFrom?: string;
  validUntil?: string | null;
};

export type Track = {
  id: string;
  title: string;
  artist: Ref;
  album: Ref | null;
  trackNumber?: number;
  durationSec: number;
  genres: string[];
  explicit: boolean;
  isrc?: string;
  artworkUrl?: string;
  audioMimeType: string;
  fileSizeBytes?: number;
  freeTier: boolean;
  rights: Rights;
  status: 'draft' | 'published' | 'takedown';
  playCount: number;
  createdAt: string;
};

export type Artist = { id: string; name: string; imageUrl: string | null; bio: string | null; genres: string[]; verified: boolean };
export type Album = { id: string; title: string; artworkUrl: string | null; releaseDate: string | null; label: string | null; artist?: { id: string; name: string } };

export type Playlist = {
  id: string;
  name: string;
  description: string;
  visibility: 'private' | 'unlisted' | 'public';
  isEditorial: boolean;
  hidden?: boolean;
  owner: { id: string; displayName?: string };
  ownerEmail?: string;
  itemCount: number;
  followerCount: number;
  updatedAt: string;
};

export type Stats = {
  totals: {
    users: number;
    newUsers: number;
    playlists: number;
    dau: number;
    mau: number;
    offlineLicenses: number;
    tracks: Record<string, number>;
    subscribers: Record<string, number>;
  };
  playsByDay: { date: string; plays: number; minutes: number; listeners: number }[];
  topTracks: { id: string; title: string; artist: string; plays: number; listeners: number }[];
  sourceSplit: Record<string, number>;
};
