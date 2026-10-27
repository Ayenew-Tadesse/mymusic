import { router } from 'expo-router';
import type { MediaItem } from '@/api/types';
import { usePlayer, type PlayContext } from './store';

/** Start playback of a list; YouTube items need the visible player, so open it. */
export async function playList(items: MediaItem[], index: number, context: PlayContext, shuffle = false) {
  const store = usePlayer.getState();
  if (shuffle !== store.shuffle) usePlayer.setState({ shuffle });
  const start = shuffle ? Math.floor(Math.random() * items.length) : index;
  await store.playItems(items, start, context);
  if (usePlayer.getState().current()?.kind === 'youtube') router.push('/player');
}
