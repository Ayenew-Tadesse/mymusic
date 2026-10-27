/**
 * Bridges the queue store to the actual players.
 *
 * Catalog tracks play in a single HTMLAudioElement using short-lived signed
 * URLs (re-requested if one expires mid-track). YouTube videos are handed to
 * the visible embedded player (YouTubeDock) through `youtubeBridge`; this
 * module never touches YouTube media directly.
 */
import { Catalog } from '../api/endpoints';
import { history } from './history';
import { usePlayer, type QueueItem } from './store';

type YouTubeController = { play: () => void; pause: () => void; seek: (sec: number) => void; setVolume: (v: number) => void };

export const youtubeBridge = {
  controller: null as YouTubeController | null,
  /** Whether the current video should start once its player is ready. */
  wantsPlay: false,
};

// store.ts imports this module too; only touch the store at call time.
const store = () => usePlayer;
const audio = typeof Audio !== 'undefined' ? new Audio() : (null as unknown as HTMLAudioElement);
let currentKind: 'catalog' | 'youtube' | null = null;
let currentItem: QueueItem | null = null;
let loadToken = 0;
let urlRetried = false;

if (audio) {
  audio.preload = 'auto';
  audio.addEventListener('timeupdate', () => currentKind === 'catalog' && store().getState().report({ position: audio.currentTime }));
  audio.addEventListener('durationchange', () => Number.isFinite(audio.duration) && store().getState().report({ duration: audio.duration }));
  audio.addEventListener('playing', () => currentKind === 'catalog' && store().getState().report({ status: 'playing' }));
  audio.addEventListener('pause', () => currentKind === 'catalog' && !audio.ended && store().getState().report({ status: 'paused' }));
  audio.addEventListener('waiting', () => currentKind === 'catalog' && store().getState().report({ status: 'loading' }));
  audio.addEventListener('ended', () => {
    if (currentKind === 'catalog') void store().getState().next({ auto: true });
  });
  audio.addEventListener('error', async () => {
    if (currentItem?.kind !== 'catalog') return;
    // Signed URLs expire after a few minutes; fetch a fresh one once and resume.
    if (!urlRetried) {
      urlRetried = true;
      const at = audio.currentTime;
      try {
        audio.src = (await Catalog.stream(currentItem.id)).url;
        audio.currentTime = at;
        await audio.play();
        return;
      } catch {
        // fall through to the error state
      }
    }
    store().getState().report({ status: 'error', error: 'This track can’t be played right now' });
  });
}

function setMediaSession(item: QueueItem) {
  if (!('mediaSession' in navigator)) return;
  const art = item.kind === 'catalog' ? item.artworkUrl : item.thumbnailUrl;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: item.title,
    artist: item.kind === 'catalog' ? item.artist?.name ?? '' : item.channelTitle,
    album: item.kind === 'catalog' ? item.album?.title ?? '' : 'YouTube',
    artwork: art ? [{ src: art, sizes: '512x512' }] : [],
  });
}

export function setupMediaSession() {
  if (!('mediaSession' in navigator)) return;
  const s = () => store().getState();
  const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
    ['play', () => void s().togglePlay()],
    ['pause', () => void engine.pause()],
    ['nexttrack', () => void s().next()],
    ['previoustrack', () => void s().previous()],
    ['seekto', (d) => d.seekTime !== undefined && void s().seekTo(d.seekTime)],
  ];
  for (const [action, fn] of handlers) {
    try {
      navigator.mediaSession.setActionHandler(action, fn);
    } catch {
      // action not supported by this browser
    }
  }
}

export const engine = {
  async load(item: QueueItem, autoplay: boolean) {
    const token = ++loadToken;
    currentItem = item;
    currentKind = item.kind;
    urlRetried = false;
    history.begin(item, store().getState().context);
    store().getState().report({ status: autoplay ? 'loading' : 'paused', position: 0, duration: item.durationSec, error: null });
    setMediaSession(item);

    if (item.kind === 'youtube') {
      audio.pause();
      audio.removeAttribute('src');
      youtubeBridge.wantsPlay = autoplay;
      // YouTubeDock mounts for the current item and starts it when ready.
      return;
    }

    youtubeBridge.wantsPlay = false;
    youtubeBridge.controller?.pause();
    try {
      const { url } = await Catalog.stream(item.id);
      if (token !== loadToken) return; // superseded by a newer load
      const { volume, muted } = store().getState();
      audio.src = url;
      audio.volume = muted ? 0 : volume;
      audio.loop = store().getState().repeat === 'one';
      if (autoplay) await audio.play();
    } catch (e) {
      if (token !== loadToken) return;
      const blocked = e instanceof DOMException && e.name === 'NotAllowedError';
      // Browsers block autoplay until the user interacts; leave it paused instead of failing.
      store().getState().report(blocked ? { status: 'paused' } : { status: 'error', error: e instanceof Error ? e.message : 'Playback failed' });
    }
  },

  async play() {
    if (currentKind === 'youtube') {
      youtubeBridge.wantsPlay = true;
      youtubeBridge.controller?.play();
    } else if (currentKind === 'catalog') {
      await audio.play().catch(() => {});
    }
  },

  async pause() {
    if (currentKind === 'youtube') {
      youtubeBridge.wantsPlay = false;
      youtubeBridge.controller?.pause();
      store().getState().report({ status: 'paused' });
    } else {
      audio.pause();
    }
  },

  async seek(sec: number) {
    if (currentKind === 'youtube') youtubeBridge.controller?.seek(sec);
    else if (Number.isFinite(sec)) audio.currentTime = sec;
    store().getState().report({ position: sec });
  },

  async stop() {
    youtubeBridge.wantsPlay = false;
    youtubeBridge.controller?.pause();
    audio.pause();
    audio.removeAttribute('src');
    currentKind = null;
    currentItem = null;
  },

  setRepeatOne(on: boolean) {
    audio.loop = on;
  },

  setVolume(v: number) {
    audio.volume = v;
    youtubeBridge.controller?.setVolume(v);
  },

  reportPlay({ completed = false } = {}) {
    if (!currentItem) return;
    history.end(store().getState().position, completed);
  },
};
