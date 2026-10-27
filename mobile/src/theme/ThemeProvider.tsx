import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import * as SystemUI from 'expo-system-ui';
import { dark, light, type Colors } from './colors';

export type ThemePreference = 'system' | 'dark' | 'light';

type ThemeState = { colors: Colors; isDark: boolean; preference: ThemePreference; setPreference: (p: ThemePreference) => void };

const ThemeContext = createContext<ThemeState>({ colors: dark, isDark: true, preference: 'system', setPreference: () => {} });
const KEY = 'mm.theme';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [preference, setPref] = useState<ThemePreference>('system');

  useEffect(() => {
    AsyncStorage.getItem(KEY).then((v) => {
      if (v === 'dark' || v === 'light' || v === 'system') setPref(v);
    });
  }, []);

  const isDark = preference === 'system' ? system !== 'light' : preference === 'dark';
  const colors = isDark ? dark : light;

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(colors.background).catch(() => {});
  }, [colors.background]);

  const value = useMemo(
    () => ({
      colors,
      isDark,
      preference,
      setPreference: (p: ThemePreference) => {
        setPref(p);
        AsyncStorage.setItem(KEY, p).catch(() => {});
      },
    }),
    [colors, isDark, preference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
