import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, setAccessToken, setSignedOutHandler, tryRestoreSession } from './api';
import type { User } from './types';

type AuthState = {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setSignedOutHandler(() => setUser(null));
    // Restore the session from the httpOnly refresh cookie on page load.
    (async () => {
      if (await tryRestoreSession()) {
        const me = await api<{ user: User }>('/me').catch(() => null);
        if (me?.user.role === 'admin') setUser(me.user);
      }
      setLoading(false);
    })();
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const res = await api<{ user: User; accessToken: string }>('/auth/login', {
      method: 'POST',
      json: { email, password, deviceName: 'Admin dashboard' },
    });
    if (res.user.role !== 'admin') {
      await api('/auth/logout', { method: 'POST', json: {} }).catch(() => {});
      throw new Error('This account does not have admin access');
    }
    setAccessToken(res.accessToken);
    setUser(res.user);
  }, []);

  const signOut = useCallback(async () => {
    await api('/auth/logout', { method: 'POST', json: {} }).catch(() => {});
    setAccessToken(null);
    setUser(null);
  }, []);

  return <AuthContext.Provider value={{ user, loading, signIn, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
