/** Compact now-playing bar shown above the tab bar. */
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { itemArtwork, itemSubtitle } from '@/api/types';
import { usePlayer } from '@/player/store';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/colors';
import { Artwork, IconButton } from './ui';

export function MiniPlayer() {
  const { colors } = useTheme();
  const item = usePlayer((s) => s.queue[s.index]);
  const status = usePlayer((s) => s.status);
  const progress = usePlayer((s) => (s.duration ? Math.min(1, s.position / s.duration) : 0));
  const togglePlay = usePlayer((s) => s.togglePlay);

  if (!item) return null;
  const playing = status === 'playing' || status === 'loading';
  // YouTube videos only play while their player is visible, so tapping play opens it.
  const onPlay = () => (item.kind === 'youtube' && !playing ? router.push('/player') : togglePlay());

  return (
    <Pressable
      onPress={() => router.push('/player')}
      accessibilityRole="button"
      accessibilityLabel={`Now playing ${item.title}. Open player`}
      style={{ marginHorizontal: spacing.sm, marginBottom: spacing.xs, backgroundColor: colors.card, borderRadius: radius.md, overflow: 'hidden' }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: spacing.sm, gap: spacing.md }}>
        <Artwork uri={itemArtwork(item)} size={40} />
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={{ color: colors.text, fontWeight: '600' }}>
            {item.title}
          </Text>
          <Text numberOfLines={1} style={{ color: colors.textSecondary, fontSize: 13 }}>
            {item.kind === 'youtube' ? `YouTube · ${itemSubtitle(item)}` : itemSubtitle(item)}
          </Text>
        </View>
        <IconButton name={playing ? 'pause' : 'play'} label={playing ? 'Pause' : 'Play'} size={28} onPress={onPlay} />
        <IconButton name="play-skip-forward" label="Next" size={24} onPress={() => usePlayer.getState().next()} />
      </View>
      <View style={{ height: 2, backgroundColor: colors.border, marginHorizontal: spacing.sm }}>
        <View style={{ height: 2, width: `${progress * 100}%`, backgroundColor: colors.text }} />
      </View>
    </Pressable>
  );
}
