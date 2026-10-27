/** Playlist page: play, shuffle, rename, describe, reorder, remove, share, invite, follow, copy, delete. */
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Playlists } from '../api/endpoints';
import { keys, queryClient } from '../api/queryClient';
import { errorMessage } from '../api/client';
import type { Playlist } from '../api/types';
import { Hero } from '../components/Hero';
import { confirmDialog, openMenu, prompt, toast } from '../components/overlays';
import { TrackList } from '../components/TrackList';
import { Empty, ErrorState, IconButton, Spinner } from '../components/ui';
import { playList } from '../player/actions';
import { formatLongDuration } from '../utils';

async function copyText(text: string, done: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast(done);
  } catch {
    await prompt('Copy this link', text, 'Done');
  }
}

export default function PlaylistPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const { data: p, error, isLoading, refetch } = useQuery({ queryKey: keys.playlist(id), queryFn: () => Playlists.get(id).then((r) => r.playlist) });

  if (isLoading) return <Spinner />;
  if (error || !p) return <ErrorState message={errorMessage(error)} onRetry={refetch} />;

  const apply = (next: Playlist) => {
    queryClient.setQueryData(keys.playlist(id), next);
    queryClient.invalidateQueries({ queryKey: keys.playlists });
  };
  const run = async (fn: () => Promise<{ playlist: Playlist } | void>, message?: string) => {
    try {
      const r = await fn();
      if (r) apply(r.playlist);
      if (message) toast(message);
    } catch (e) {
      toast(errorMessage(e));
      refetch();
    }
  };

  const playable = p.items;
  const context = { type: 'playlist' as const, id };

  async function share() {
    try {
      const url = p!.shareUrl ?? (await Playlists.share(id, 'unlisted')).shareUrl;
      refetch();
      if (navigator.share) await navigator.share({ title: p!.name, text: `Listen to “${p!.name}” on MyMusic`, url }).catch(() => {});
      else await copyText(url, 'Link copied to clipboard');
    } catch (e) {
      toast(errorMessage(e));
    }
  }

  const menu = (e: React.MouseEvent) =>
    openMenu(e, [
      { label: 'Rename', hidden: !p.canEdit, onSelect: async () => { const name = await prompt('Rename playlist', p.name); if (name) run(() => Playlists.update(id, { name })); } },
      { label: 'Edit description', hidden: !p.canEdit, onSelect: async () => { const description = await prompt('Description', p.description || ' ', 'Save'); if (description !== null) run(() => Playlists.update(id, { description: description.trim() })); } },
      { label: p.visibility === 'public' ? 'Make private' : 'Make public', hidden: !p.isOwner, onSelect: () => run(() => Playlists.update(id, { visibility: p.visibility === 'public' ? 'private' : 'public' })) },
      { label: 'Copy link to playlist', hidden: !p.isOwner && !p.shareUrl, onSelect: share },
      { label: 'Invite collaborators', hidden: !p.isOwner, onSelect: async () => { try { const { inviteUrl } = await Playlists.invite(id); await copyText(inviteUrl, 'Invite link copied'); } catch (err) { toast(errorMessage(err)); } } },
      { label: 'Save a copy', hidden: p.isOwner, onSelect: async () => { try { const { playlist } = await Playlists.copy(id); queryClient.invalidateQueries({ queryKey: keys.playlists }); navigate(`/playlist/${playlist.id}`); } catch (err) { toast(errorMessage(err)); } } },
      'divider',
      {
        label: 'Delete',
        danger: true,
        hidden: !p.isOwner,
        onSelect: async () => {
          if (!(await confirmDialog('Delete from Your Library?', `This will delete “${p.name}” for everyone.`, 'Delete', true))) return;
          try {
            await Playlists.remove(id);
            queryClient.invalidateQueries({ queryKey: keys.playlists });
            navigate('/');
          } catch (err) {
            toast(errorMessage(err));
          }
        },
      },
    ]);

  return (
    <>
      <Hero
        kind={p.isEditorial ? 'Editorial playlist' : `${p.visibility[0].toUpperCase()}${p.visibility.slice(1)} playlist`}
        title={p.name}
        art={p.coverUrl}
        description={p.description || undefined}
        meta={`${p.owner.displayName ?? ''} · ${p.itemCount} songs, ${formatLongDuration(p.totalDurationSec)}${p.followerCount ? ` · ${p.followerCount} followers` : ''}`}
        onPlay={playable.length ? () => playList(playable, 0, context, false) : undefined}
        onShuffle={playable.length ? () => playList(playable, 0, context, true) : undefined}
        actions={
          <>
            {!p.isOwner && (p.visibility === 'public' || p.isEditorial) && (
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => run(async () => { await (p.isFollowing ? Playlists.unfollow(id) : Playlists.follow(id)); await refetch(); queryClient.invalidateQueries({ queryKey: keys.playlists }); }, p.isFollowing ? 'Removed from Your Library' : 'Added to Your Library')}
              >
                {p.isFollowing ? 'Following' : 'Follow'}
              </button>
            )}
            {p.canEdit && p.items.length > 1 && <IconButton icon="reorder" label={editing ? 'Done reordering' : 'Reorder songs'} active={editing} size={26} onClick={() => setEditing((v) => !v)} />}
            {p.isOwner && <IconButton icon="share" label="Share" size={26} onClick={share} />}
            <IconButton icon="more" label="More options" size={30} onClick={menu} />
          </>
        }
      />
      {p.items.length ? (
        <TrackList
          items={p.items}
          onPlay={(i) => playList(playable, i, context)}
          extraActions={(item) => (p.canEdit && item.itemId ? [{ label: 'Remove from this playlist', danger: true, onSelect: () => run(() => Playlists.removeItem(id, item.itemId!), 'Removed') }] : [])}
          rowAddon={
            editing
              ? (item, i) => (
                  <>
                    <IconButton icon="up" label="Move up" size={18} disabled={i === 0} onClick={() => run(() => Playlists.moveItem(id, item.itemId!, i - 1))} />
                    <IconButton icon="down" label="Move down" size={18} disabled={i === p.items.length - 1} onClick={() => run(() => Playlists.moveItem(id, item.itemId!, i + 1))} />
                  </>
                )
              : undefined
          }
        />
      ) : (
        <Empty icon="note" title="Let’s find something for your playlist">
          <p>Search for songs, then use “Add to playlist…” from a song’s menu.</p>
        </Empty>
      )}
    </>
  );
}
