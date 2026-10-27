import { useInfiniteQuery } from '@tanstack/react-query';
import { Alert, FlatList, Text } from 'react-native';
import { Library } from '@/api/endpoints';
import { keys, queryClient } from '@/api/queryClient';
import { errorMessage } from '@/api/client';
import { TRACK_ROW_HEIGHT, TrackRow } from '@/components/TrackRow';
import { Button, Empty, ErrorView, Loading } from '@/components/ui';
import { playList } from '@/player/actions';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/colors';

export default function History() {
  const { colors } = useTheme();
  const q = useInfiniteQuery({
    queryKey: keys.history,
    queryFn: ({ pageParam }) => Library.history(pageParam),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
  });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorView message={errorMessage(q.error)} onRetry={q.refetch} />;
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  const playable = items.filter((i) => !i.unavailable);

  const clear = () =>
    Alert.alert('Clear listening history?', 'This can’t be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: () => Library.clearHistory().then(() => queryClient.invalidateQueries({ queryKey: keys.history }), (e) => Alert.alert('Error', errorMessage(e))),
      },
    ]);

  return (
    <FlatList
      style={{ backgroundColor: colors.background }}
      data={items}
      keyExtractor={(_, n) => String(n)}
      getItemLayout={(_, index) => ({ length: TRACK_ROW_HEIGHT, offset: TRACK_ROW_HEIGHT * index, index })}
      renderItem={({ item }) => <TrackRow item={item} onPress={() => playList(playable, playable.indexOf(item), { type: 'history' })} />}
      onEndReached={() => q.hasNextPage && !q.isFetchingNextPage && q.fetchNextPage()}
      ListHeaderComponent={items.length ? <Text style={{ color: colors.textSecondary, padding: spacing.lg }}>Plays you’ve listened to for at least 30 seconds.</Text> : null}
      ListFooterComponent={items.length ? <Button title="Clear history" variant="danger" onPress={clear} style={{ margin: spacing.xl }} /> : null}
      ListEmptyComponent={<Empty icon="time-outline" title="Nothing here yet" body="Songs you play will show up here." />}
    />
  );
}
