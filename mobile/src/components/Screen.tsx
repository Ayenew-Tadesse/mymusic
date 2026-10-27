import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/ThemeProvider';

/** Full-screen background with an optional top safe-area inset. */
export function Screen({ children, top = true }: { children: ReactNode; top?: boolean }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: top ? insets.top : 0 }}>{children}</View>;
}
