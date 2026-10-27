/**
 * Background playback service (runs headless on Android). Handles
 * lock-screen / notification / headset controls and advances the queue
 * when a catalog track ends.
 */
import TrackPlayer, { Event, State } from 'react-native-track-player';
import { checkSleepTimer, usePlayer } from './store';

export async function PlaybackService() {
  const s = () => usePlayer.getState();

  TrackPlayer.addEventListener(Event.RemotePlay, () => s().togglePlay());
  TrackPlayer.addEventListener(Event.RemotePause, () => TrackPlayer.pause());
  TrackPlayer.addEventListener(Event.RemoteStop, () => s().stop());
  TrackPlayer.addEventListener(Event.RemoteNext, () => s().next());
  TrackPlayer.addEventListener(Event.RemotePrevious, () => s().previous());
  TrackPlayer.addEventListener(Event.RemoteSeek, ({ position }) => s().seekTo(position));

  // We hold one track at a time in TrackPlayer; when it ends, the store picks the next one.
  TrackPlayer.addEventListener(Event.PlaybackQueueEnded, () => {
    if (s().current()?.kind === 'catalog') void s().next({ auto: true });
  });

  TrackPlayer.addEventListener(Event.PlaybackState, ({ state }) => {
    if (s().current()?.kind !== 'catalog') return;
    const status =
      state === State.Playing ? 'playing' : state === State.Buffering || state === State.Loading ? 'loading' : state === State.Error ? 'error' : state === State.None || state === State.Stopped ? 'idle' : 'paused';
    s().report({ status });
  });

  TrackPlayer.addEventListener(Event.PlaybackProgressUpdated, ({ position, duration }) => {
    if (s().current()?.kind !== 'catalog') return;
    s().report({ position, duration: duration || s().duration });
    void checkSleepTimer();
  });

  TrackPlayer.addEventListener(Event.PlaybackError, ({ message }) => s().report({ status: 'error', error: message }));
}
