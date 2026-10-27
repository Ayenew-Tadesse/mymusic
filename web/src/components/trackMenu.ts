import type { MouseEvent } from 'react';
import { itemRef, type MediaItem } from '../api/types';
import { usePlayer } from '../player/store';
import { openMenu, toast } from './overlays';
import { openAddToPlaylist } from './AddToPlaylist';

type Extra = { label: string; onSelect: () => void; danger?: boolean };

/** Context menu for a song (right-click or "…" button). */
export function openTrackMenu(e: MouseEvent, item: MediaItem, opts: { liked: boolean; toggleLike: () => void; navigate: (to: string) => void; extra?: Extra[] }) {
  e.preventDefault();
  e.stopPropagation();
  openMenu(e, [
    { label: 'Add to queue', onSelect: () => (usePlayer.getState().addToQueue(item), toast('Added to queue')) },
    { label: 'Play next', onSelect: () => (usePlayer.getState().playNext(item), toast('Playing next')) },
    'divider',
    { label: 'Add to playlist…', onSelect: () => openAddToPlaylist(itemRef(item)) },
    { label: opts.liked ? 'Remove from Liked Songs' : 'Save to Liked Songs', onSelect: opts.toggleLike },
    'divider',
    { label: 'Go to artist', hidden: item.kind !== 'catalog' || !item.artist, onSelect: () => item.kind === 'catalog' && item.artist && opts.navigate(`/artist/${item.artist.id}`) },
    { label: 'Go to album', hidden: item.kind !== 'catalog' || !item.album, onSelect: () => item.kind === 'catalog' && item.album && opts.navigate(`/album/${item.album.id}`) },
    { label: 'Watch on YouTube', hidden: item.kind !== 'youtube', onSelect: () => item.kind === 'youtube' && window.open(item.watchUrl, '_blank', 'noopener,noreferrer') },
    ...(opts.extra?.length ? (['divider', ...opts.extra] as const) : []),
  ]);
}
