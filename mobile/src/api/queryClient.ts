import { QueryClient, focusManager, onlineManager } from '@tanstack/react-query';
import NetInfo from '@react-native-community/netinfo';
import { AppState } from 'react-native';
import { ApiError } from './client';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 10 * 60_000,
      retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
    },
  },
});

// Pause queries while offline and refetch when connectivity returns.
onlineManager.setEventListener((setOnline) => NetInfo.addEventListener((s) => setOnline(Boolean(s.isConnected))));
// Treat the app coming to the foreground like a browser tab gaining focus.
AppState.addEventListener('change', (s) => focusManager.setFocused(s === 'active'));

export const keys = {
  home: ['home'] as const,
  playlists: ['playlists'] as const,
  playlist: (id: string) => ['playlist', id] as const,
  favoriteIds: ['favorites', 'ids'] as const,
  favorites: ['favorites', 'list'] as const,
  history: ['history'] as const,
  artist: (id: string) => ['artist', id] as const,
  album: (id: string) => ['album', id] as const,
  search: (q: string) => ['search', q] as const,
  plans: ['plans'] as const,
};
