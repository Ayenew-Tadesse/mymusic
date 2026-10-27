/**
 * Bridges the queue store to the actual players.
 *
 * Catalog tracks go through react-native-track-player (background audio,
 * lock-screen and headset controls). YouTube items are handed to the
 * embedded player component rendered on the Now Playing screen via
 * `youtubeBridge`; this module never touches YouTube media directly.
 */
import TrackPlayer, { AppKilledPlaybackBehavior, Capability, RepeatMode } from 'react-native-track-player';
import { Catalog } from '@/api/endpoints';
import { offline } from '@/offline/manager';
import { history } from './history';
import { usePlayer, type QueueItem } from './store';

let setupPromise: Promise<void> | null = null;

export function setupPlayer() {
  setupPromise ??= (async () => {
    try {
      await TrackPlayer.setupPlayer({ autoHandleInterruptions: true });
    } catch (e) {
      // Already initialised (e.g. after a fast refresh).
      if (!String(e).includes('already been initialized')) throw e;
    }
    await TrackPlayer.updateOptions({
      android: { appKilledPlaybackBehavior: AppKilledPlaybackBehavior.StopPlaybackAndRemoveNotification },
      capabilities: [Capability.Play, Capability.Pause, Capability.SkipToNext, Capability.SkipToPrevious, Capability.SeekTo, Capability.Stop],
      compactCapabilities: [Capability.Play, Capability.Pause, Capability.SkipToNext],
      progressUpdateEventInterval: 1,
    });
  })();
  return setupPromise;
}

type YouTubeController = {
  play: () => void;
  pause: () => void;
  seek: (sec: number) => void;
};

/** The mounted embedded player registers itself here. */
export const youtubeBridge = {
  controller: null as YouTubeController | null,
  /** Whether the current YouTube item should start playing once its player mounts. */
  wantsPlay: false,
};

let currentKind: 'catalog' | 'youtube' | null = null;
let currentItem: QueueItem | null = null;
let loadToken = 0;

// store.ts imports this module too; only touch the store at call time, never at import time.
const store = () => usePlayer;

export const engine = {
  async load(item: QueueItem, autoplay: boolean) {
    const token = ++loadToken;
    currentItem = item;
    currentKind = item.kind;
    history.begin(item, store().getState().context);
    store().getState().report({ status: 'loading', position: 0, duration: item.durationSec, error: null });

    if (item.kind === 'youtube') {
      await TrackPlayer.reset().catch(() => {});
      youtubeBridge.wantsPlay = autoplay;
      // The embedded player (when visible) picks the item up from the store.
      store().getState().report({ status: autoplay ? 'loading' : 'paused' });
      return;
    }

    youtubeBridge.controller?.pause();
    try {
      await setupPlayer();
      // Prefer the encrypted offline copy; fall back to a fresh signed stream URL.
      const url = (await offline.playableUri(item.id)) ?? (await Catalog.stream(item.id)).url;
      if (token !== loadToken) return; // a newer load superseded this one
      await TrackPlayer.reset();
      await TrackPlayer.add({
        id: item.qid,
        url,
        title: item.title,
        artist: item.artist?.name ?? '',
        album: item.album?.title,
        artwork: item.artworkUrl ?? undefined,
        duration: item.durationSec,
      });
      await TrackPlayer.setRepeatMode(store().getState().repeat === 'one' ? RepeatMode.Track : RepeatMode.Off);
      if (autoplay) await TrackPlayer.play();
      else store().getState().report({ status: 'paused' });
    } catch (e) {
      if (token !== loadToken) return;
      store().getState().report({ status: 'error', error: e instanceof Error ? e.message : 'Playback failed' });
    }
  },

  async play() {
    if (currentKind === 'youtube') {
      youtubeBridge.wantsPlay = true;
      youtubeBridge.controller?.play();
    } else {
      await TrackPlayer.play();
    }
  },

  async pause() {
    if (currentKind === 'youtube') {
      youtubeBridge.wantsPlay = false;
      youtubeBridge.controller?.pause();
      store().getState().report({ status: 'paused' });
    } else {
      await TrackPlayer.pause().catch(() => {});
    }
  },

  async seek(sec: number) {
    if (currentKind === 'youtube') youtubeBridge.controller?.seek(sec);
    else await TrackPlayer.seekTo(sec).catch(() => {});
    store().getState().report({ position: sec });
  },

  async stop() {
    youtubeBridge.wantsPlay = false;
    youtubeBridge.controller?.pause();
    await TrackPlayer.reset().catch(() => {});
    currentKind = null;
    currentItem = null;
  },

  setRepeatOne(on: boolean) {
    if (currentKind === 'catalog') TrackPlayer.setRepeatMode(on ? RepeatMode.Track : RepeatMode.Off).catch(() => {});
  },

  /** Report the item that is ending to listening history. */
  reportPlay({ completed = false } = {}) {
    if (!currentItem) return;
    const { position } = store().getState();
    history.end(position, completed);
  },
};
