/** Your Library: liked songs, downloads, history and playlists. */
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { Playlists } from '@/api/endpoints';
import { keys, queryClient } from '@/api/queryClient';
import { errorMessage } from '@/api/client';
import type { PlaylistSummary } from '@/api/types';
import { PromptModal } from '@/components/PromptModal';
import { Screen } from '@/components/Screen';
import { Artwork, IconButton, type IconName } from '@/components/ui';
import { useDownloads } from '@/offline/manager';
import { useTheme } from '@/theme/ThemeProvider';
import { font, radius, spacing } from '@/theme/colors';

function Row({ title, subtitle, art, onPress }: { title: string; subtitle: string; art: React.ReactNode; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, backgroundColor: pressed ? colors.cardPressed : 'transparent' })}>
      {art}
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>
          {title}
        </Text>
        <Text numberOfLines={1} style={{ color: colors.textSecondary, fontSize: 13, marginTop: 2 }}>
          {subtitle}
        </Text>
      </View>
    </Pressable>
  );
}

function GradientTile({ icon, colorsPair }: { icon: IconName; colorsPair: [string, string] }) {
  return (
    <LinearGradient colors={colorsPair} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 64, height: 64, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name={icon} size={28} color="#fff" />
    </LinearGradient>
  );
}

export default function Library() {
  const { colors } = useTheme();
  const [creating, setCreating] = useState(false);
  const downloads = useDownloads((s) => Object.keys(s.entries).length);
  const { data, refetch, isRefetching } = useQuery({ queryKey: keys.playlists, queryFn: Playlists.mine });

  const create = useMutation({
    mutationFn: (name: string) => Playlists.create(name),
    onSuccess: ({ playlist }) => {
      queryClient.invalidateQueries({ queryKey: keys.playlists });
      router.push(`/playlist/${playlist.id}`);
    },
    onError: (e) => Alert.alert('Couldn’t create playlist', errorMessage(e)),
  });

  const subtitle = (p: PlaylistSummary) => `Playlist · ${p.isOwner ? 'You' : p.owner.displayName ?? 'Shared'}${p.canEdit && !p.isOwner ? ' · Collaborative' : ''}`;

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.lg }}>
        <Text style={[font.title, { color: colors.text }]}>Your Library</Text>
        <IconButton name="add" size={30} label="Create playlist" onPress={() => setCreating(true)} />
      </View>
      <FlatList
        data={data?.items ?? []}
        keyExtractor={(p) => p.id}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.text} />}
        ListHeaderComponent={
          <>
            <Row title="Liked Songs" subtitle="Playlist · Auto" art={<GradientTile icon="heart" colorsPair={['#450af5', '#c4efd9']} />} onPress={() => router.push('/favorites')} />
            <Row title="Downloads" subtitle={`${downloads} songs available offline`} art={<GradientTile icon="arrow-down-circle" colorsPair={['#1ed760', '#0d5c2a']} />} onPress={() => router.push('/downloads')} />
            <Row title="Recently played" subtitle="Your listening history" art={<GradientTile icon="time" colorsPair={['#e8115b', '#5f0b2b']} />} onPress={() => router.push('/history')} />
          </>
        }
        renderItem={({ item }) => <Row title={item.name} subtitle={subtitle(item)} art={<Artwork uri={item.coverUrl} size={64} />} onPress={() => router.push(`/playlist/${item.id}`)} />}
        contentContainerStyle={{ paddingBottom: spacing.xxl }}
      />
      <PromptModal
        visible={creating}
        title="Give your playlist a name"
        initial="My playlist"
        confirmLabel="Create"
        onCancel={() => setCreating(false)}
        onSubmit={(name) => {
          setCreating(false);
          create.mutate(name);
        }}
      />
    </Screen>
  );
}
