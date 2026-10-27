import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Catalog } from '@/api/endpoints';
import { keys } from '@/api/queryClient';
import { errorMessage } from '@/api/client';
import { CollectionHeader } from '@/components/CollectionHeader';
import { TrackRow } from '@/components/TrackRow';
import { Artwork, ErrorView, Loading, SectionTitle } from '@/components/ui';
import { playList } from '@/player/actions';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/colors';

export default function ArtistScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const { data, error, isLoading, refetch } = useQuery({ queryKey: keys.artist(id), queryFn: () => Catalog.artist(id) });
  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorView message={errorMessage(error)} onRetry={refetch} />;
  const { artist, topTracks, albums } = data;
  const playable = topTracks.filter((t) => t.playable);

  return (
    <FlatList
      style={{ backgroundColor: colors.background }}
      data={topTracks.slice(0, 10)}
      keyExtractor={(t) => t.id}
      ListHeaderComponent={
        <>
          <CollectionHeader
            artwork={artist.imageUrl}
            round
            title={artist.name}
            meta={artist.verified ? 'Verified artist' : artist.genres.join(' · ')}
            onPlay={playable.length ? () => playList(playable, 0, { type: 'artist', id }) : undefined}
            onShuffle={playable.length ? () => playList(playable, 0, { type: 'artist', id }, true) : undefined}
          />
          <SectionTitle>Popular</SectionTitle>
        </>
      }
      renderItem={({ item, index }) => <TrackRow item={item} index={index} onPress={() => playList(playable, playable.indexOf(item), { type: 'artist', id })} />}
      ListFooterComponent={
        <>
          {albums.length > 0 && (
            <>
              <SectionTitle>Discography</SectionTitle>
              <FlatList
                horizontal
                data={albums}
                keyExtractor={(a) => a.id}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.lg }}
                renderItem={({ item }) => (
                  <Pressable onPress={() => router.push(`/album/${item.id}`)} style={{ width: 140 }}>
                    <Artwork uri={item.artworkUrl} size={140} />
                    <Text numberOfLines={1} style={{ color: colors.text, fontWeight: '600', marginTop: spacing.sm }}>
                      {item.title}
                    </Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{item.releaseDate ? new Date(item.releaseDate).getFullYear() : 'Album'}</Text>
                  </Pressable>
                )}
              />
            </>
          )}
          {artist.bio && (
            <>
              <SectionTitle>About</SectionTitle>
              <Text style={{ color: colors.textSecondary, paddingHorizontal: spacing.lg, lineHeight: 22 }}>{artist.bio}</Text>
            </>
          )}
          <View style={{ height: spacing.xxl }} />
        </>
      }
    />
  );
}
