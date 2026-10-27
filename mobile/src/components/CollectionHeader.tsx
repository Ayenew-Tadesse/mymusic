/** Big artwork header with title and play / shuffle controls (playlist, album, artist). */
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/ThemeProvider';
import { font, spacing } from '@/theme/colors';
import { Artwork } from './ui';

export function CollectionHeader({
  artwork,
  round,
  title,
  subtitle,
  meta,
  actions,
  onPlay,
  onShuffle,
}: {
  artwork: string | null | undefined;
  round?: boolean;
  title: string;
  subtitle?: ReactNode;
  meta?: string;
  actions?: ReactNode;
  onPlay?: () => void;
  onShuffle?: () => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <LinearGradient colors={[colors.gradientTop, colors.background]} style={{ paddingTop: insets.top + 48, paddingHorizontal: spacing.lg, paddingBottom: spacing.md }}>
      <View style={{ alignItems: 'center', marginBottom: spacing.lg }}>
        <Artwork uri={artwork} size={220} round={round} style={{ shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 20, shadowOffset: { width: 0, height: 8 } }} />
      </View>
      <Text accessibilityRole="header" style={[font.title, { color: colors.text }]} numberOfLines={2}>
        {title}
      </Text>
      {subtitle && <View style={{ marginTop: spacing.xs }}>{typeof subtitle === 'string' ? <Text style={{ color: colors.textSecondary }}>{subtitle}</Text> : subtitle}</View>}
      {meta && <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: spacing.xs }}>{meta}</Text>}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: spacing.md }}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>{actions}</View>
        {onShuffle && (
          <Pressable onPress={onShuffle} accessibilityLabel="Shuffle play" hitSlop={8} style={{ marginRight: spacing.lg }}>
            <Ionicons name="shuffle" size={28} color={colors.accent} />
          </Pressable>
        )}
        {onPlay && (
          <Pressable
            onPress={onPlay}
            accessibilityRole="button"
            accessibilityLabel="Play"
            style={({ pressed }) => ({ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.95 : 1 }] })}
          >
            <Ionicons name="play" size={28} color={colors.accentText} style={{ marginLeft: 3 }} />
          </Pressable>
        )}
      </View>
    </LinearGradient>
  );
}
