/** Pick a playlist (or create one) to add a song to. */
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, FlatList, Pressable, Text, View } from 'react-native';
import { Playlists } from '@/api/endpoints';
import { keys, queryClient } from '@/api/queryClient';
import { errorMessage } from '@/api/client';
import { itemRef, type MediaItem } from '@/api/types';
import { PromptModal } from '@/components/PromptModal';
import { Artwork, Button, Loading } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/colors';

export default function AddToPlaylist() {
  const { item: raw } = useLocalSearchParams<{ item: string }>();
  const item = JSON.parse(raw) as MediaItem;
  const { colors } = useTheme();
  const [creating, setCreating] = useState(false);
  const { data, isLoading } = useQuery({ queryKey: keys.playlists, queryFn: Playlists.mine });
  const editable = (data?.items ?? []).filter((p) => p.canEdit);

  async function add(playlistId: string) {
    try {
      const { playlist } = await Playlists.addItems(playlistId, [itemRef(item)]);
      queryClient.setQueryData(keys.playlist(playlistId), playlist);
      queryClient.invalidateQueries({ queryKey: keys.playlists });
      router.back();
    } catch (e) {
      Alert.alert('Couldn’t add song', errorMessage(e));
    }
  }

  async function createAndAdd(name: string) {
    setCreating(false);
    try {
      const { playlist } = await Playlists.create(name);
      await add(playlist.id);
    } catch (e) {
      Alert.alert('Couldn’t create playlist', errorMessage(e));
    }
  }

  if (isLoading) return <Loading />;
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <FlatList
        data={editable}
        keyExtractor={(p) => p.id}
        ListHeaderComponent={
          <View style={{ alignItems: 'center', padding: spacing.lg }}>
            <Button title="New playlist" onPress={() => setCreating(true)} />
          </View>
        }
        renderItem={({ item: p }) => (
          <Pressable onPress={() => add(p.id)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, backgroundColor: pressed ? colors.cardPressed : 'transparent' })}>
            <Artwork uri={p.coverUrl} size={56} />
            <View>
              <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>{p.name}</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{p.itemCount} songs</Text>
            </View>
          </Pressable>
        )}
      />
      <PromptModal visible={creating} title="Give your playlist a name" initial="My playlist" confirmLabel="Create" onCancel={() => setCreating(false)} onSubmit={createAndAdd} />
    </View>
  );
}
