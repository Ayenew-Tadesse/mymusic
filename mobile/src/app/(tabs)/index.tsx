/** Home: greeting, recently played, editorial playlists, new releases, popular. */
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { FlatList, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Catalog } from '@/api/endpoints';
import { keys } from '@/api/queryClient';
import { errorMessage } from '@/api/client';
import { itemArtwork, itemKey, type CatalogTrack, type MediaItem } from '@/api/types';
import { useAuth } from '@/auth/AuthProvider';
import { PlaylistCard } from '@/components/PlaylistCard';
import { Screen } from '@/components/Screen';
import { Artwork, ErrorView, IconButton, Loading, SectionTitle } from '@/components/ui';
import { usePlayer } from '@/player/store';
import { useTheme } from '@/theme/ThemeProvider';
import { font, radius, spacing } from '@/theme/colors';
import { greeting } from '@/utils/format';

function play(items: MediaItem[], i: number) {
  usePlayer.getState().playItems(items, i, { type: 'other' });
  if (items[i]?.kind === 'youtube') router.push('/player');
}

function RecentTile({ item, onPress }: { item: MediaItem; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: pressed ? colors.cardPressed : colors.card, borderRadius: radius.sm, overflow: 'hidden', height: 56 })}>
      <Artwork uri={itemArtwork(item)} size={56} style={{ borderRadius: 0 }} />
      <Text numberOfLines={2} style={{ color: colors.text, fontWeight: '700', fontSize: 13, flex: 1, paddingHorizontal: spacing.sm }}>
        {item.title}
      </Text>
    </Pressable>
  );
}

function TrackCard({ track, onPress }: { track: CatalogTrack; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} style={{ width: 150 }} disabled={!track.playable} accessibilityRole="button" accessibilityLabel={`${track.title} by ${track.artist?.name}`}>
      <Artwork uri={track.artworkUrl} size={150} style={{ opacity: track.playable ? 1 : 0.5 }} />
      <Text numberOfLines={1} style={{ color: colors.text, fontWeight: '700', marginTop: spacing.sm }}>
        {track.title}
      </Text>
      <Text numberOfLines={1} style={{ color: colors.textSecondary, fontSize: 13 }}>
        {track.artist?.name}
      </Text>
    </Pressable>
  );
}

export default function Home() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const { data, error, isLoading, refetch, isRefetching } = useQuery({ queryKey: keys.home, queryFn: Catalog.home });

  if (isLoading) return <Loading />;

  const rail = (tracks: CatalogTrack[]) => (
    <FlatList
      horizontal
      data={tracks}
      keyExtractor={(t) => t.id}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.lg }}
      renderItem={({ item, index }) => <TrackCard track={item} onPress={() => play(tracks, index)} />}
      initialNumToRender={4}
    />
  );

  return (
    <Screen>
      <ScrollView refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.text} />} contentContainerStyle={{ paddingBottom: spacing.xxl }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingTop: spacing.lg }}>
          <Text style={[font.title, { color: colors.text }]}>{greeting()}</Text>
          <View style={{ flexDirection: 'row', gap: spacing.md }}>
            <IconButton name="time-outline" label="Recently played" onPress={() => router.push('/history')} />
            <IconButton name="settings-outline" label="Settings" onPress={() => router.push('/settings')} />
          </View>
        </View>
        {user && user.subscription.plan === 'free' && (
          <Pressable onPress={() => router.push('/premium')} style={{ margin: spacing.lg, marginBottom: 0, padding: spacing.lg, borderRadius: radius.md, backgroundColor: colors.card }}>
            <Text style={{ color: colors.text, fontWeight: '700' }}>Go Premium</Text>
            <Text style={{ color: colors.textSecondary, marginTop: 4 }}>Unlock the full catalog and listen offline.</Text>
          </Pressable>
        )}

        {error ? (
          <ErrorView message={errorMessage(error)} onRetry={refetch} />
        ) : (
          data && (
            <>
              {data.recentlyPlayed.length > 0 && (
                <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.lg, gap: spacing.sm }}>
                  {Array.from({ length: Math.ceil(Math.min(6, data.recentlyPlayed.length) / 2) }, (_, row) => (
                    <View key={row} style={{ flexDirection: 'row', gap: spacing.sm }}>
                      {data.recentlyPlayed.slice(row * 2, row * 2 + 2).map((item, i) => (
                        <RecentTile key={itemKey(item)} item={item} onPress={() => play(data.recentlyPlayed, row * 2 + i)} />
                      ))}
                      {data.recentlyPlayed.slice(row * 2, row * 2 + 2).length === 1 && <View style={{ flex: 1 }} />}
                    </View>
                  ))}
                </View>
              )}
              {data.editorial.length > 0 && (
                <>
                  <SectionTitle>Made for you</SectionTitle>
                  <FlatList
                    horizontal
                    data={data.editorial}
                    keyExtractor={(p) => p.id}
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.lg }}
                    renderItem={({ item }) => <PlaylistCard playlist={item} />}
                  />
                </>
              )}
              {data.newReleases.length > 0 && (
                <>
                  <SectionTitle>New releases</SectionTitle>
                  {rail(data.newReleases)}
                </>
              )}
              {data.popular.length > 0 && (
                <>
                  <SectionTitle>Popular right now</SectionTitle>
                  {rail(data.popular)}
                </>
              )}
            </>
          )
        )}
      </ScrollView>
    </Screen>
  );
}
