import type { MediaItem } from '../api/types';
import { usePlayer, type PlayContext } from './store';

/** Start playback of a list, optionally shuffled. */
export async function playList(items: MediaItem[], index: number, context: PlayContext, shuffle?: boolean) {
  const store = usePlayer.getState();
  if (shuffle !== undefined && shuffle !== store.shuffle) usePlayer.setState({ shuffle });
  const playable = items.filter((i) => !i.unavailable && (i.kind === 'youtube' || i.playable));
  if (!playable.length) return;
  const start = shuffle ? Math.floor(Math.random() * playable.length) : Math.max(0, playable.indexOf(items[index]));
  await store.playItems(playable, start, context);
}
