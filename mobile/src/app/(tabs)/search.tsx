/**
 * Search. The licensed catalog is searched as you type; YouTube is searched
 * only on submit because each YouTube search costs significant API quota.
 */
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Catalog, YouTube } from '@/api/endpoints';
import { keys } from '@/api/queryClient';
import { errorMessage } from '@/api/client';
import type { MediaItem, YouTubeVideo } from '@/api/types';
import { Screen } from '@/components/Screen';
import { TRACK_ROW_HEIGHT, TrackRow } from '@/components/TrackRow';
import { Artwork, Empty, ErrorView, Loading, SectionTitle } from '@/components/ui';
import { usePlayer } from '@/player/store';
import { useTheme } from '@/theme/ThemeProvider';
import { font, radius, spacing } from '@/theme/colors';

type Tab = 'catalog' | 'youtube';

function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export default function Search() {
  const { colors } = useTheme();
  const [text, setText] = useState('');
  const [tab, setTab] = useState<Tab>('catalog');
  const [ytQuery, setYtQuery] = useState('');
  const [ytResults, setYtResults] = useState<{ items: YouTubeVideo[]; next: string | null; loading: boolean; error: string | null }>({ items: [], next: null, loading: false, error: null });
  const q = useDebounced(text.trim());

  const catalog = useQuery({ queryKey: keys.search(q), queryFn: () => Catalog.search(q), enabled: q.length > 0 && tab === 'catalog' });

  async function searchYouTube(pageToken?: string) {
    const query = text.trim();
    if (!query) return;
    setYtQuery(query);
    setYtResults((r) => ({ ...r, loading: true, error: null, ...(pageToken ? {} : { items: [] }) }));
    try {
      const res = await YouTube.search(query, pageToken);
      setYtResults((r) => ({ items: pageToken ? [...r.items, ...res.items] : res.items, next: res.nextPageToken, loading: false, error: null }));
    } catch (e) {
      setYtResults((r) => ({ ...r, loading: false, error: errorMessage(e) }));
    }
  }

  const play = (items: MediaItem[], i: number) => {
    usePlayer.getState().playItems(items, i, { type: 'search' });
    if (items[i].kind === 'youtube') router.push('/player');
  };

  const tabButton = (t: Tab, label: string) => (
    <Pressable
      onPress={() => {
        setTab(t);
        if (t === 'youtube' && text.trim() && text.trim() !== ytQuery) searchYouTube();
      }}
      accessibilityRole="tab"
      accessibilityState={{ selected: tab === t }}
      style={{ paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.pill, backgroundColor: tab === t ? colors.accent : colors.card }}
    >
      <Text style={{ color: tab === t ? colors.accentText : colors.text, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );

  return (
    <Screen>
      <View style={{ padding: spacing.lg, gap: spacing.md }}>
        <Text style={[font.title, { color: colors.text }]}>Search</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: radius.md, paddingHorizontal: spacing.md }}>
          <Ionicons name="search" size={20} color={colors.textSecondary} />
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="What do you want to listen to?"
            placeholderTextColor={colors.textMuted}
            returnKeyType="search"
            onSubmitEditing={() => tab === 'youtube' && searchYouTube()}
            style={{ flex: 1, color: colors.text, paddingVertical: 12, paddingHorizontal: spacing.sm, fontSize: 16 }}
            autoCorrect={false}
            accessibilityLabel="Search"
          />
          {text.length > 0 && <Ionicons name="close-circle" size={20} color={colors.textSecondary} onPress={() => setText('')} accessibilityLabel="Clear search" />}
        </View>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          {tabButton('catalog', 'MyMusic')}
          {tabButton('youtube', 'YouTube')}
        </View>
      </View>

      {tab === 'catalog' ? (
        !q ? (
          <Empty icon="musical-notes-outline" title="Find your next favorite" body="Search songs, artists, albums and playlists." />
        ) : catalog.isLoading ? (
          <Loading />
        ) : catalog.error ? (
          <ErrorView message={errorMessage(catalog.error)} onRetry={catalog.refetch} />
        ) : (
          <FlatList
            data={catalog.data?.tracks ?? []}
            keyExtractor={(t) => t.id}
            getItemLayout={(_, index) => ({ length: TRACK_ROW_HEIGHT, offset: TRACK_ROW_HEIGHT * index, index })}
            renderItem={({ item, index }) => <TrackRow item={item} onPress={() => play(catalog.data!.tracks, index)} />}
            keyboardDismissMode="on-drag"
            ListHeaderComponent={
              <>
                {!!catalog.data?.artists.length && (
                  <>
                    <SectionTitle>Artists</SectionTitle>
                    <FlatList
                      horizontal
                      data={catalog.data.artists}
                      keyExtractor={(a) => a.id}
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.lg }}
                      renderItem={({ item }) => (
                        <Pressable onPress={() => router.push(`/artist/${item.id}`)} style={{ alignItems: 'center', width: 100 }}>
                          <Artwork uri={item.imageUrl} size={100} round />
                          <Text numberOfLines={1} style={{ color: colors.text, marginTop: spacing.sm, fontWeight: '600' }}>
                            {item.name}
                          </Text>
                        </Pressable>
                      )}
                    />
                  </>
                )}
                {!!catalog.data?.albums.length && (
                  <>
                    <SectionTitle>Albums</SectionTitle>
                    <FlatList
                      horizontal
                      data={catalog.data.albums}
                      keyExtractor={(a) => a.id}
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.lg }}
                      renderItem={({ item }) => (
                        <Pressable onPress={() => router.push(`/album/${item.id}`)} style={{ width: 130 }}>
                          <Artwork uri={item.artworkUrl} size={130} />
                          <Text numberOfLines={1} style={{ color: colors.text, marginTop: spacing.sm, fontWeight: '600' }}>
                            {item.title}
                          </Text>
                        </Pressable>
                      )}
                    />
                  </>
                )}
                {!!catalog.data?.playlists.length && (
                  <>
                    <SectionTitle>Playlists</SectionTitle>
                    {catalog.data.playlists.map((p) => (
                      <Pressable key={p.id} onPress={() => router.push(`/playlist/${p.id}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm }}>
                        <Artwork uri={p.coverUrl} size={48} />
                        <View>
                          <Text style={{ color: colors.text, fontWeight: '600' }}>{p.name}</Text>
                          <Text style={{ color: colors.textSecondary, fontSize: 13 }}>Playlist · {p.owner.displayName}</Text>
                        </View>
                      </Pressable>
                    ))}
                  </>
                )}
                {!!catalog.data?.tracks.length && <SectionTitle>Songs</SectionTitle>}
              </>
            }
            ListEmptyComponent={
              catalog.data && !catalog.data.artists.length && !catalog.data.albums.length ? (
                <Empty icon="search-outline" title={`No results for “${q}”`} body="Try the YouTube tab to find more music." />
              ) : null
            }
          />
        )
      ) : (
        <FlatList
          data={ytResults.items}
          keyExtractor={(v) => v.videoId}
          getItemLayout={(_, index) => ({ length: TRACK_ROW_HEIGHT, offset: TRACK_ROW_HEIGHT * index, index })}
          renderItem={({ item, index }) => <TrackRow item={item} onPress={() => play(ytResults.items, index)} />}
          keyboardDismissMode="on-drag"
          onEndReachedThreshold={0.5}
          onEndReached={() => ytResults.next && !ytResults.loading && searchYouTube(ytResults.next)}
          ListHeaderComponent={
            <Text style={{ color: colors.textMuted, fontSize: 12, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm }}>
              Results from YouTube. Videos play in YouTube’s player and are subject to YouTube’s Terms of Service.
            </Text>
          }
          ListEmptyComponent={
            ytResults.loading ? (
              <Loading />
            ) : ytResults.error ? (
              <ErrorView message={ytResults.error} onRetry={() => searchYouTube()} />
            ) : (
              <Empty icon="logo-youtube" title="Search YouTube" body={text ? 'Press search on your keyboard.' : 'Type a song or artist, then press search.'} />
            )
          }
        />
      )}
    </Screen>
  );
}
