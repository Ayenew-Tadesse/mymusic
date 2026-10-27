import { useInfiniteQuery } from '@tanstack/react-query';
import { FlatList, RefreshControl } from 'react-native';
import { Library } from '@/api/endpoints';
import { keys } from '@/api/queryClient';
import { errorMessage } from '@/api/client';
import { TRACK_ROW_HEIGHT, TrackRow } from '@/components/TrackRow';
import { Empty, ErrorView, Loading } from '@/components/ui';
import { playList } from '@/player/actions';
import { useTheme } from '@/theme/ThemeProvider';

export default function Favorites() {
  const { colors } = useTheme();
  const q = useInfiniteQuery({
    queryKey: keys.favorites,
    queryFn: ({ pageParam }) => Library.favorites(pageParam),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
  });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorView message={errorMessage(q.error)} onRetry={q.refetch} />;
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  const playable = items.filter((i) => !i.unavailable);

  return (
    <FlatList
      style={{ backgroundColor: colors.background }}
      data={items}
      keyExtractor={(i, n) => `${i.kind === 'catalog' ? i.id : i.videoId}-${n}`}
      getItemLayout={(_, index) => ({ length: TRACK_ROW_HEIGHT, offset: TRACK_ROW_HEIGHT * index, index })}
      renderItem={({ item }) => <TrackRow item={item} onPress={() => playList(playable, playable.indexOf(item), { type: 'favorites' })} />}
      onEndReached={() => q.hasNextPage && !q.isFetchingNextPage && q.fetchNextPage()}
      onEndReachedThreshold={0.5}
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={q.refetch} tintColor={colors.text} />}
      ListEmptyComponent={<Empty icon="heart-outline" title="Songs you like will appear here" body="Save songs by tapping the heart icon." />}
    />
  );
}
