import { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import type { Colors } from '@/theme/colors';

/** Theme-aware StyleSheet, recomputed only when the color scheme changes. */
export function useStyles<T extends StyleSheet.NamedStyles<T>>(factory: (c: Colors) => T) {
  const { colors } = useTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => StyleSheet.create(factory(colors)), [colors]);
}
