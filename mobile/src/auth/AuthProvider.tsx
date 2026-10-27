/**
 * Session state for the whole app.
 *
 * On launch we try to refresh the stored session. If the device is offline we
 * still let a previously signed-in user in (using the cached profile) so they
 * can listen to their downloads.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Auth, Me } from '@/api/endpoints';
import { clearSession, getRefreshToken, NetworkError, refreshSession, setSessionExpiredHandler, storeSession } from '@/api/client';
import type { Session, User } from '@/api/types';
import { queryClient } from '@/api/queryClient';
import { offline } from '@/offline/manager';
import { usePlayer } from '@/player/store';

type Status = 'loading' | 'signedOut' | 'signedIn';

type AuthState = {
  status: Status;
  user: User | null;
  offlineMode: boolean;
  isPremium: boolean;
  completeSignIn: (session: Session) => Promise<void>;
  setUser: (u: User) => void;
  refreshUser: () => Promise<void>;
  signOut: (opts?: { everywhere?: boolean }) => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);
const USER_CACHE = 'mm.user';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUserState] = useState<User | null>(null);
  const [offlineMode, setOfflineMode] = useState(false);

  const setUser = useCallback((u: User) => {
    setUserState(u);
    AsyncStorage.setItem(USER_CACHE, JSON.stringify(u)).catch(() => {});
  }, []);

  const resetLocalState = useCallback(async () => {
    await usePlayer.getState().stop();
    usePlayer.getState().clearQueue();
    queryClient.clear();
    await AsyncStorage.removeItem(USER_CACHE);
    setUserState(null);
    setStatus('signedOut');
  }, []);

  useEffect(() => {
    setSessionExpiredHandler(() => {
      clearSession().then(resetLocalState);
    });

    (async () => {
      try {
        if (!(await getRefreshToken())) return setStatus('signedOut');
        if (!(await refreshSession())) return setStatus('signedOut');
        const { user: me } = await Me.get();
        setUser(me);
        setStatus('signedIn');
        offline.sync().catch(() => {});
      } catch (e) {
        const cached = await AsyncStorage.getItem(USER_CACHE);
        if (e instanceof NetworkError && cached) {
          setUserState(JSON.parse(cached));
          setOfflineMode(true);
          setStatus('signedIn');
        } else {
          setStatus('signedOut');
        }
      }
    })();
  }, [resetLocalState, setUser]);

  const completeSignIn = useCallback(
    async (session: Session) => {
      await storeSession(session);
      setUser(session.user);
      setOfflineMode(false);
      setStatus('signedIn');
    },
    [setUser],
  );

  const refreshUser = useCallback(async () => {
    const { user: me } = await Me.get();
    setUser(me);
    setOfflineMode(false);
  }, [setUser]);

  const signOut = useCallback(
    async ({ everywhere = false } = {}) => {
      const refresh = await getRefreshToken();
      try {
        if (everywhere) await Auth.logoutAll();
        else if (refresh) await Auth.logout(refresh);
      } catch {
        // Signing out locally must work even when offline.
      }
      // Downloads are tied to the account: remove them on sign out.
      await offline.removeAll().catch(() => {});
      await clearSession();
      await resetLocalState();
    },
    [resetLocalState],
  );

  const value = useMemo<AuthState>(
    () => ({
      status,
      user,
      offlineMode,
      isPremium: user?.subscription.plan !== 'free' && Boolean(user),
      completeSignIn,
      setUser,
      refreshUser,
      signOut,
    }),
    [status, user, offlineMode, completeSignIn, setUser, refreshUser, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
