import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { FlatList, Text, View } from 'react-native';
import { Catalog } from '@/api/endpoints';
import { keys } from '@/api/queryClient';
import { errorMessage } from '@/api/client';
import { CollectionHeader } from '@/components/CollectionHeader';
import { TRACK_ROW_HEIGHT, TrackRow } from '@/components/TrackRow';
import { ErrorView, Loading } from '@/components/ui';
import { playList } from '@/player/actions';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/colors';
import { formatLongDuration } from '@/utils/format';

export default function AlbumScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const { data, error, isLoading, refetch } = useQuery({ queryKey: keys.album(id), queryFn: () => Catalog.album(id) });
  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorView message={errorMessage(error)} onRetry={refetch} />;
  const { album, tracks, totalDurationSec } = data;
  const playable = tracks.filter((t) => t.playable);
  const year = album.releaseDate ? new Date(album.releaseDate).getFullYear() : null;

  return (
    <FlatList
      style={{ backgroundColor: colors.background }}
      data={tracks}
      keyExtractor={(t) => t.id}
      getItemLayout={(_, index) => ({ length: TRACK_ROW_HEIGHT, offset: TRACK_ROW_HEIGHT * index, index })}
      ListHeaderComponent={
        <CollectionHeader
          artwork={album.artworkUrl}
          title={album.title}
          subtitle={
            <Text style={{ color: colors.text, fontWeight: '700' }} onPress={() => router.push(`/artist/${album.artist.id}`)}>
              {album.artist.name}
            </Text>
          }
          meta={`Album${year ? ` · ${year}` : ''} · ${tracks.length} songs · ${formatLongDuration(totalDurationSec)}`}
          onPlay={playable.length ? () => playList(playable, 0, { type: 'album', id }) : undefined}
          onShuffle={playable.length ? () => playList(playable, 0, { type: 'album', id }, true) : undefined}
        />
      }
      renderItem={({ item, index }) => <TrackRow item={item} index={index} showArtwork={false} onPress={() => playList(playable, playable.indexOf(item), { type: 'album', id })} />}
      ListFooterComponent={
        <View style={{ padding: spacing.lg }}>
          {album.label && <Text style={{ color: colors.textMuted, fontSize: 12 }}>℗ {album.label}</Text>}
        </View>
      }
    />
  );
}
