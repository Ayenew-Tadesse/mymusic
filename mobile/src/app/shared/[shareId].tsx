/** A playlist opened from a share link. Visible to everyone; playing requires an account. */
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { FlatList, View } from 'react-native';
import { Playlists } from '@/api/endpoints';
import { errorMessage } from '@/api/client';
import { useAuth } from '@/auth/AuthProvider';
import { CollectionHeader } from '@/components/CollectionHeader';
import { TrackRow } from '@/components/TrackRow';
import { Button, ErrorView, Loading } from '@/components/ui';
import { playList } from '@/player/actions';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/colors';

export default function SharedPlaylist() {
  const { shareId } = useLocalSearchParams<{ shareId: string }>();
  const { status } = useAuth();
  const { colors } = useTheme();
  const { data, error, isLoading, refetch } = useQuery({ queryKey: ['shared', shareId], queryFn: () => Playlists.shared(shareId).then((r) => r.playlist) });

  // Signed-in users get the full playlist screen (follow, copy, etc).
  useEffect(() => {
    if (status === 'signedIn' && data) router.replace(`/playlist/${data.id}`);
  }, [status, data]);

  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorView message={errorMessage(error)} onRetry={refetch} />;
  const signedIn = status === 'signedIn';
  const playable = data.items.filter((i) => !i.unavailable);

  return (
    <FlatList
      style={{ backgroundColor: colors.background }}
      data={data.items}
      keyExtractor={(i) => i.itemId}
      ListHeaderComponent={
        <>
          <CollectionHeader artwork={data.coverUrl} title={data.name} subtitle={data.description || undefined} meta={`${data.owner.displayName ?? ''} · ${data.itemCount} songs`} onPlay={signedIn && playable.length ? () => playList(playable, 0, { type: 'playlist', id: data.id }) : undefined} />
          {!signedIn && (
            <View style={{ padding: spacing.lg }}>
              <Button title="Sign up free to listen" onPress={() => router.replace('/')} />
            </View>
          )}
        </>
      }
      renderItem={({ item }) => <TrackRow item={item} onPress={() => (signedIn ? playList(playable, playable.indexOf(item), { type: 'playlist', id: data.id }) : router.replace('/'))} right={signedIn ? undefined : <View />} />}
    />
  );
}
