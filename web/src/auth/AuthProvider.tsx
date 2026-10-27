/**
 * Session state. On load the httpOnly refresh cookie is exchanged for an
 * access token; if that fails the visitor is signed out.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Auth, Me } from '../api/endpoints';
import { refreshSession, setAccessToken, setSessionExpiredHandler } from '../api/client';
import { queryClient } from '../api/queryClient';
import type { Session, User } from '../api/types';
import { usePlayer } from '../player/store';

type Status = 'loading' | 'signedOut' | 'signedIn';

type AuthState = {
  status: Status;
  user: User | null;
  isPremium: boolean;
  completeSignIn: (s: Session) => void;
  setUser: (u: User) => void;
  refreshUser: () => Promise<void>;
  signOut: (opts?: { everywhere?: boolean }) => Promise<void>;
};

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUser] = useState<User | null>(null);

  const reset = useCallback(() => {
    usePlayer.getState().stop();
    usePlayer.getState().clearQueue();
    queryClient.clear();
    setAccessToken(null);
    setUser(null);
    setStatus('signedOut');
  }, []);

  useEffect(() => {
    setSessionExpiredHandler(reset);
    (async () => {
      if (await refreshSession()) {
        try {
          setUser((await Me.get()).user);
          setStatus('signedIn');
          return;
        } catch {
          // fall through to signed out
        }
      }
      setStatus('signedOut');
    })();
  }, [reset]);

  const completeSignIn = useCallback((s: Session) => {
    setAccessToken(s.accessToken);
    setUser(s.user);
    setStatus('signedIn');
  }, []);

  const refreshUser = useCallback(async () => setUser((await Me.get()).user), []);

  const signOut = useCallback(
    async ({ everywhere = false } = {}) => {
      try {
        if (everywhere) await Auth.logoutAll();
        await Auth.logout();
      } catch {
        // Signing out locally still works if the request fails.
      }
      reset();
    },
    [reset],
  );

  const value = useMemo<AuthState>(
    () => ({ status, user, isPremium: Boolean(user) && user!.subscription.plan !== 'free', completeSignIn, setUser, refreshUser, signOut }),
    [status, user, completeSignIn, refreshUser, signOut],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
