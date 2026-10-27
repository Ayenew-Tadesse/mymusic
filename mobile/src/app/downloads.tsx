/** Songs stored on this device for offline listening. */
import { Alert, FlatList, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/auth/AuthProvider';
import { TRACK_ROW_HEIGHT, TrackRow } from '@/components/TrackRow';
import { Button, Empty, IconButton } from '@/components/ui';
import { offline, useDownloads } from '@/offline/manager';
import { playList } from '@/player/actions';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/colors';
import { formatBytes } from '@/utils/format';

export default function DownloadsScreen() {
  const { colors } = useTheme();
  const { isPremium } = useAuth();
  const entries = useDownloads((s) => Object.values(s.entries).sort((a, b) => b.downloadedAt.localeCompare(a.downloadedAt)));
  const tracks = entries.map((e) => ({ ...e.track, playable: true }));
  const totalBytes = entries.reduce((n, e) => n + e.sizeBytes, 0);
  const soonest = entries.reduce<string | null>((m, e) => (!m || e.expiresAt < m ? e.expiresAt : m), null);

  const removeAll = () =>
    Alert.alert('Remove all downloads?', 'Songs will no longer be available offline.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => entries.forEach((e) => offline.remove(e.trackId)) },
    ]);

  if (!entries.length) {
    return (
      <Empty
        icon="arrow-down-circle-outline"
        title={isPremium ? 'Download music to listen offline' : 'Listen offline with Premium'}
        body={isPremium ? 'Tap ⋮ › Download on any song marked as downloadable.' : 'Premium lets you download licensed songs to this device.'}
        action={!isPremium ? <Button title="See plans" onPress={() => router.push('/premium')} /> : undefined}
      />
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <FlatList
        data={tracks}
        keyExtractor={(t) => t.id}
        getItemLayout={(_, index) => ({ length: TRACK_ROW_HEIGHT, offset: TRACK_ROW_HEIGHT * index, index })}
        ListHeaderComponent={
          <Text style={{ color: colors.textSecondary, padding: spacing.lg }}>
            {entries.length} songs · {formatBytes(totalBytes)} · encrypted on this device.
            {soonest ? ` Go online before ${new Date(soonest).toLocaleDateString()} to keep them.` : ''}
          </Text>
        }
        renderItem={({ item, index }) => (
          <TrackRow
            item={item}
            onPress={() => playList(tracks, index, { type: 'other' })}
            right={<IconButton name="trash-outline" label="Remove download" color={colors.textSecondary} onPress={() => offline.remove(item.id)} />}
          />
        )}
        ListFooterComponent={<Button title="Remove all downloads" variant="danger" onPress={removeAll} style={{ margin: spacing.xl }} />}
      />
    </View>
  );
}
