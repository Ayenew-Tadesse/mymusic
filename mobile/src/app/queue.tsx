import { FlatList, Text, View } from 'react-native';
import { TRACK_ROW_HEIGHT, TrackRow } from '@/components/TrackRow';
import { Button, Empty, IconButton } from '@/components/ui';
import { usePlayer } from '@/player/store';
import { useTheme } from '@/theme/ThemeProvider';
import { font, spacing } from '@/theme/colors';

export default function QueueScreen() {
  const { colors } = useTheme();
  const queue = usePlayer((s) => s.queue);
  const index = usePlayer((s) => s.index);
  const { jumpTo, removeFromQueue, moveInQueue, clearQueue } = usePlayer.getState();
  const current = queue[index];
  const upNext = queue.slice(index + 1);

  if (!current) return <Empty icon="list-outline" title="Your queue is empty" />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <FlatList
        data={upNext}
        keyExtractor={(q) => q.qid}
        getItemLayout={(_, i) => ({ length: TRACK_ROW_HEIGHT, offset: TRACK_ROW_HEIGHT * i, index: i })}
        ListHeaderComponent={
          <>
            <Text style={[font.h3, { color: colors.text, padding: spacing.lg }]}>Now playing</Text>
            <TrackRow item={current} onPress={() => {}} right={<View />} />
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingTop: spacing.xl, paddingBottom: spacing.sm }}>
              <Text style={[font.h3, { color: colors.text }]}>Next up</Text>
              {upNext.length > 0 && <Button title="Clear" variant="ghost" onPress={clearQueue} style={{ paddingVertical: 4, paddingHorizontal: 8 }} />}
            </View>
          </>
        }
        renderItem={({ item, index: i }) => {
          const abs = index + 1 + i;
          return (
            <TrackRow
              item={item}
              onPress={() => jumpTo(abs)}
              right={
                <View style={{ flexDirection: 'row', gap: spacing.xs }}>
                  <IconButton name="chevron-up" label="Move up" size={20} disabled={i === 0} onPress={() => moveInQueue(abs, abs - 1)} />
                  <IconButton name="chevron-down" label="Move down" size={20} disabled={abs === queue.length - 1} onPress={() => moveInQueue(abs, abs + 1)} />
                  <IconButton name="close" label="Remove from queue" size={20} color={colors.textSecondary} onPress={() => removeFromQueue(item.qid)} />
                </View>
              }
            />
          );
        }}
        ListEmptyComponent={<Text style={{ color: colors.textSecondary, paddingHorizontal: spacing.lg }}>Nothing queued. Add songs with ⋮ › Add to queue.</Text>}
      />
    </View>
  );
}
