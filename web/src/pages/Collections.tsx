/** Liked Songs and Recently played. */
import { useInfiniteQuery } from '@tanstack/react-query';
import { Library } from '../api/endpoints';
import { keys, queryClient } from '../api/queryClient';
import { errorMessage } from '../api/client';
import { useAuth } from '../auth/AuthProvider';
import { Hero } from '../components/Hero';
import { confirmDialog, toast } from '../components/overlays';
import { TrackList } from '../components/TrackList';
import { Empty, ErrorState, Spinner } from '../components/ui';
import { playList } from '../player/actions';

function LoadMore({ q }: { q: { hasNextPage: boolean; isFetchingNextPage: boolean; fetchNextPage: () => unknown } }) {
  if (!q.hasNextPage) return null;
  return (
    <div style={{ textAlign: 'center', marginTop: 16 }}>
      <button className="btn btn-secondary btn-sm" disabled={q.isFetchingNextPage} onClick={() => q.fetchNextPage()}>
        {q.isFetchingNextPage ? 'Loading…' : 'Load more'}
      </button>
    </div>
  );
}

export function Favorites() {
  const { user } = useAuth();
  const q = useInfiniteQuery({
    queryKey: keys.favorites,
    queryFn: ({ pageParam }) => Library.favorites(pageParam),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
  });
  if (q.isLoading) return <Spinner />;
  if (q.error) return <ErrorState message={errorMessage(q.error)} onRetry={q.refetch} />;
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  const total = q.data?.pages[0]?.total ?? 0;
  const context = { type: 'favorites' as const };

  return (
    <>
      <Hero
        kind="Playlist"
        title="Liked Songs"
        art={null}
        meta={`${user?.displayName} · ${total} songs`}
        onPlay={items.length ? () => playList(items, 0, context, false) : undefined}
        onShuffle={items.length ? () => playList(items, 0, context, true) : undefined}
      />
      {items.length ? (
        <>
          <TrackList items={items} onPlay={(i) => playList(items, i, context)} />
          <LoadMore q={q} />
        </>
      ) : (
        <Empty icon="heartOutline" title="Songs you like will appear here">
          <p>Save songs by tapping the heart icon.</p>
        </Empty>
      )}
    </>
  );
}

export function History() {
  const q = useInfiniteQuery({
    queryKey: keys.history,
    queryFn: ({ pageParam }) => Library.history(pageParam),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
  });
  if (q.isLoading) return <Spinner />;
  if (q.error) return <ErrorState message={errorMessage(q.error)} onRetry={q.refetch} />;
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];

  async function clear() {
    if (!(await confirmDialog('Clear listening history?', 'This can’t be undone.', 'Clear', true))) return;
    try {
      await Library.clearHistory();
      queryClient.invalidateQueries({ queryKey: keys.history });
      queryClient.invalidateQueries({ queryKey: keys.home });
    } catch (e) {
      toast(errorMessage(e));
    }
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="page-title">Recently played</h1>
        {items.length > 0 && (
          <button className="btn btn-danger btn-sm" onClick={clear}>
            Clear history
          </button>
        )}
      </div>
      {items.length ? (
        <>
          <TrackList items={items} onPlay={(i) => playList(items, i, { type: 'history' })} />
          <LoadMore q={q} />
        </>
      ) : (
        <Empty icon="history" title="Nothing here yet">
          <p>Songs you listen to for at least 30 seconds show up here.</p>
        </Empty>
      )}
    </>
  );
}
