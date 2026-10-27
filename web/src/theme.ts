import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemePreference = 'system' | 'dark' | 'light';

export const useThemePref = create<{ pref: ThemePreference; set: (p: ThemePreference) => void }>()(
  persist((set) => ({ pref: 'system', set: (pref) => set({ pref }) }), { name: 'mm.theme' }),
);

/** Apply the chosen theme to <html data-theme> and keep following the OS when set to system. */
export function useApplyTheme() {
  const pref = useThemePref((s) => s.pref);
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const on = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  const theme = pref === 'system' ? (systemDark ? 'dark' : 'light') : pref;
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#121212' : '#ffffff');
  }, [theme]);
}
