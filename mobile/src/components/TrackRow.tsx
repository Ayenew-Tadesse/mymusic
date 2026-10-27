import { Ionicons } from '@expo/vector-icons';
import { memo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { itemArtwork, itemKey, itemSubtitle, type MediaItem } from '@/api/types';
import { useFavorites } from '@/hooks/useFavorites';
import { useStyles } from '@/hooks/useStyles';
import { useDownloads } from '@/offline/manager';
import { usePlayer } from '@/player/store';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/colors';
import { formatDuration } from '@/utils/format';
import { Artwork, IconButton, Tag } from './ui';
import { openTrackMenu } from './TrackMenu';

export const TRACK_ROW_HEIGHT = 64;

type Props = { item: MediaItem; onPress: () => void; index?: number; showArtwork?: boolean; right?: React.ReactNode };

/** One song row. Memoised: lists re-render rows only when their own data changes. */
export const TrackRow = memo(function TrackRow({ item, onPress, showArtwork = true, index, right }: Props) {
  const { colors } = useTheme();
  const { isLiked, toggle } = useFavorites();
  const isCurrent = usePlayer((s) => {
    const cur = s.queue[s.index];
    return Boolean(cur && itemKey(cur) === itemKey(item));
  });
  const downloaded = useDownloads((s) => item.kind === 'catalog' && Boolean(s.entries[item.id]));
  const disabled = item.unavailable || (item.kind === 'catalog' && !item.playable);

  const s = useStyles((c) => ({
    row: { height: TRACK_ROW_HEIGHT, flexDirection: 'row' as const, alignItems: 'center' as const, paddingHorizontal: spacing.lg, gap: spacing.md },
    index: { width: 24, color: c.textSecondary, textAlign: 'center' as const },
    title: { color: c.text, fontSize: 15, fontWeight: '500' as const },
    sub: { color: c.textSecondary, fontSize: 13, flexShrink: 1 },
    meta: { flexDirection: 'row' as const, alignItems: 'center' as const, marginTop: 3 },
  }));

  const liked = isLiked(item);
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      onLongPress={() => openTrackMenu(item)}
      style={({ pressed }) => [s.row, { opacity: disabled ? 0.4 : 1, backgroundColor: pressed ? colors.cardPressed : 'transparent' }]}
      accessibilityRole="button"
      accessibilityLabel={`${item.title}, ${itemSubtitle(item)}`}
      accessibilityHint={disabled ? 'Not available' : 'Plays this song'}
    >
      {index !== undefined && !showArtwork ? <Text style={s.index}>{index + 1}</Text> : null}
      {showArtwork && <Artwork uri={itemArtwork(item)} size={48} />}
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={[s.title, isCurrent && { color: colors.accent }]}>
          {item.title || 'Unavailable'}
        </Text>
        <View style={s.meta}>
          {downloaded && <Ionicons name="arrow-down-circle" size={14} color={colors.accent} style={{ marginRight: 4 }} />}
          {item.kind === 'catalog' && item.explicit && <Tag label="E" />}
          {item.kind === 'youtube' && <Tag label="YouTube" color={colors.youtube} />}
          <Text numberOfLines={1} style={s.sub}>
            {itemSubtitle(item)}
            {item.durationSec ? ` · ${formatDuration(item.durationSec)}` : ''}
          </Text>
        </View>
      </View>
      {right ?? (
        <>
          <IconButton name={liked ? 'heart' : 'heart-outline'} label={liked ? 'Remove from Liked Songs' : 'Add to Liked Songs'} active={liked} size={22} color={liked ? colors.accent : colors.textSecondary} onPress={() => toggle(item)} />
          <IconButton name="ellipsis-vertical" label="More options" size={20} color={colors.textSecondary} onPress={() => openTrackMenu(item)} />
        </>
      )}
    </Pressable>
  );
});
