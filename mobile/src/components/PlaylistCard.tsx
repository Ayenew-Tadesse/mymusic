import { router } from 'expo-router';
import { memo } from 'react';
import { Pressable, Text } from 'react-native';
import type { PlaylistSummary } from '@/api/types';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/colors';
import { Artwork } from './ui';

export const PlaylistCard = memo(function PlaylistCard({ playlist, size = 150 }: { playlist: PlaylistSummary; size?: number }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={() => router.push(`/playlist/${playlist.id}`)} style={{ width: size }} accessibilityRole="button" accessibilityLabel={`Playlist ${playlist.name}`}>
      <Artwork uri={playlist.coverUrl} size={size} />
      <Text numberOfLines={2} style={{ color: colors.textSecondary, marginTop: spacing.sm, fontSize: 13 }}>
        <Text style={{ color: colors.text, fontWeight: '700' }}>{playlist.name}</Text>
        {playlist.description ? `\n${playlist.description}` : ''}
      </Text>
    </Pressable>
  );
});
