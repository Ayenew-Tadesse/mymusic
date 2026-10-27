/** Playlist detail: play, shuffle, edit, reorder, share, collaborate, follow. */
import { useMutation, useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, FlatList, Share, Text, View } from 'react-native';
import { Playlists } from '@/api/endpoints';
import { keys, queryClient } from '@/api/queryClient';
import { errorMessage } from '@/api/client';
import type { Playlist } from '@/api/types';
import { showActionSheet, type SheetAction } from '@/components/ActionSheet';
import { CollectionHeader } from '@/components/CollectionHeader';
import { PromptModal } from '@/components/PromptModal';
import { TRACK_ROW_HEIGHT, TrackRow } from '@/components/TrackRow';
import { Empty, ErrorView, IconButton, Loading } from '@/components/ui';
import { playList } from '@/player/actions';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/colors';
import { formatLongDuration } from '@/utils/format';

export default function PlaylistScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const [editing, setEditing] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const { data, error, isLoading, refetch } = useQuery({ queryKey: keys.playlist(id), queryFn: () => Playlists.get(id).then((r) => r.playlist) });

  const apply = (p: Playlist) => {
    queryClient.setQueryData(keys.playlist(id), p);
    queryClient.invalidateQueries({ queryKey: keys.playlists });
  };
  const onError = (e: unknown) => {
    Alert.alert('Something went wrong', errorMessage(e));
    refetch();
  };

  const removeItem = useMutation({ mutationFn: (itemId: string) => Playlists.removeItem(id, itemId), onSuccess: (r) => apply(r.playlist), onError });
  const moveItem = useMutation({ mutationFn: ({ itemId, to }: { itemId: string; to: number }) => Playlists.moveItem(id, itemId, to), onSuccess: (r) => apply(r.playlist), onError });
  const rename = useMutation({ mutationFn: (name: string) => Playlists.update(id, { name }), onSuccess: (r) => apply(r.playlist), onError });

  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorView message={errorMessage(error)} onRetry={refetch} />;
  const p = data;

  async function share() {
    try {
      const { shareUrl } = p.shareUrl ? { shareUrl: p.shareUrl } : await Playlists.share(id, 'unlisted');
      await Share.share({ message: `Listen to “${p.name}” on MyMusic: ${shareUrl}`, url: shareUrl });
      refetch();
    } catch (e) {
      onError(e);
    }
  }

  function more() {
    const buttons: SheetAction[] = [];
    if (p.isOwner) {
      buttons.push({ label: 'Rename', onPress: () => setRenaming(true) });
      buttons.push({
        label: p.visibility === 'public' ? 'Make private' : 'Make public',
        onPress: () => Playlists.update(id, { visibility: p.visibility === 'public' ? 'private' : 'public' }).then((r) => apply(r.playlist), onError),
      });
      buttons.push({
        label: 'Invite collaborators',
        onPress: () => Playlists.invite(id).then(({ inviteUrl }) => Share.share({ message: `Help me build “${p.name}” on MyMusic: ${inviteUrl}` }), onError),
      });
      buttons.push({
        label: 'Delete playlist',
        destructive: true,
        onPress: () =>
          Alert.alert('Delete playlist?', `“${p.name}” will be deleted for everyone.`, [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete',
              style: 'destructive',
              onPress: () =>
                Playlists.remove(id).then(() => {
                  queryClient.invalidateQueries({ queryKey: keys.playlists });
                  router.back();
                }, onError),
            },
          ]),
      });
    } else {
      buttons.push({ label: 'Save a copy', onPress: () => Playlists.copy(id).then((r) => router.replace(`/playlist/${r.playlist.id}`), onError) });
    }
    showActionSheet(p.name, buttons);
  }

  const toggleFollow = () =>
    (p.isFollowing ? Playlists.unfollow(id) : Playlists.follow(id)).then(() => {
      refetch();
      queryClient.invalidateQueries({ queryKey: keys.playlists });
    }, onError);

  const playable = p.items.filter((i) => !i.unavailable);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <FlatList
        data={p.items}
        keyExtractor={(i) => i.itemId}
        getItemLayout={(_, index) => ({ length: TRACK_ROW_HEIGHT, offset: TRACK_ROW_HEIGHT * index, index })}
        ListHeaderComponent={
          <CollectionHeader
            artwork={p.coverUrl}
            title={p.name}
            subtitle={p.description || undefined}
            meta={`${p.owner.displayName ?? ''} · ${p.itemCount} songs · ${formatLongDuration(p.totalDurationSec)}${p.followerCount ? ` · ${p.followerCount} followers` : ''}`}
            onPlay={playable.length ? () => playList(playable, 0, { type: 'playlist', id }) : undefined}
            onShuffle={playable.length ? () => playList(playable, 0, { type: 'playlist', id }, true) : undefined}
            actions={
              <>
                {!p.isOwner && (p.visibility === 'public' || p.isEditorial) && (
                  <IconButton name={p.isFollowing ? 'checkmark-circle' : 'add-circle-outline'} active={p.isFollowing} label={p.isFollowing ? 'Unfollow' : 'Follow'} onPress={toggleFollow} />
                )}
                {p.canEdit && p.items.length > 0 && <IconButton name={editing ? 'checkmark' : 'swap-vertical'} label={editing ? 'Done editing' : 'Edit order'} active={editing} onPress={() => setEditing((e) => !e)} />}
                {p.isOwner && <IconButton name="share-outline" label="Share" onPress={share} />}
                <IconButton name="ellipsis-horizontal" label="More" onPress={more} />
              </>
            }
          />
        }
        renderItem={({ item, index }) => (
          <TrackRow
            item={item}
            onPress={() => playList(playable, Math.max(0, playable.indexOf(item)), { type: 'playlist', id })}
            right={
              editing ? (
                <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                  <IconButton name="chevron-up" label="Move up" disabled={index === 0} onPress={() => moveItem.mutate({ itemId: item.itemId, to: index - 1 })} />
                  <IconButton name="chevron-down" label="Move down" disabled={index === p.items.length - 1} onPress={() => moveItem.mutate({ itemId: item.itemId, to: index + 1 })} />
                  <IconButton name="remove-circle-outline" label="Remove from playlist" color={colors.danger} onPress={() => removeItem.mutate(item.itemId)} />
                </View>
              ) : undefined
            }
          />
        )}
        ListEmptyComponent={<Empty icon="musical-notes-outline" title="Let’s find something for your playlist" body="Use Search, then tap ⋮ › Add to playlist." />}
        ListFooterComponent={<Text style={{ height: spacing.xxl }} />}
      />
      <PromptModal visible={renaming} title="Rename playlist" initial={p.name} onCancel={() => setRenaming(false)} onSubmit={(name) => { setRenaming(false); rename.mutate(name); }} />
    </View>
  );
}
