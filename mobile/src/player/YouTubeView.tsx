/**
 * The official YouTube IFrame player (via react-native-youtube-iframe).
 *
 * Compliance: the player is always visible at ≥200px, keeps YouTube's own
 * controls and branding, is never overlaid or hidden, and is paused when the
 * app leaves the foreground (no background or audio-only playback).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import YoutubePlayer, { type YoutubeIframeRef } from 'react-native-youtube-iframe';
import { youtubeBridge } from './engine';
import { usePlayer } from './store';

/** Mount with `key={videoId}` so each video starts with fresh player state. */
export function YouTubeView({ videoId }: { videoId: string }) {
  const { width } = useWindowDimensions();
  const ref = useRef<YoutubeIframeRef>(null);
  const [playing, setPlaying] = useState(youtubeBridge.wantsPlay);
  const report = usePlayer((s) => s.report);
  const playerWidth = Math.min(width - 32, 640);
  const height = Math.max(200, Math.round((playerWidth * 9) / 16));

  // Expose imperative controls to the engine (mini player, lock screen, sleep timer).
  useEffect(() => {
    youtubeBridge.controller = {
      play: () => setPlaying(true),
      pause: () => setPlaying(false),
      seek: (sec) => ref.current?.seekTo(sec, true),
    };
    return () => {
      youtubeBridge.controller = null;
      youtubeBridge.wantsPlay = false;
      // Leaving the Now Playing screen hides the player, so playback must stop.
      usePlayer.getState().report({ status: 'paused' });
    };
  }, []);

  // Mirror progress into the store while playing.
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(async () => {
      const position = await ref.current?.getCurrentTime().catch(() => undefined);
      if (position !== undefined) report({ position });
    }, 1000);
    return () => clearInterval(t);
  }, [playing, report]);

  const onChangeState = useCallback(
    async (state: string) => {
      if (state === 'playing') {
        youtubeBridge.wantsPlay = true;
        const duration = await ref.current?.getDuration().catch(() => 0);
        report({ status: 'playing', ...(duration ? { duration } : {}) });
      } else if (state === 'paused') {
        youtubeBridge.wantsPlay = false;
        setPlaying(false);
        report({ status: 'paused' });
      } else if (state === 'buffering') {
        report({ status: 'loading' });
      } else if (state === 'ended') {
        setPlaying(false);
        void usePlayer.getState().next({ auto: true });
      }
    },
    [report],
  );

  return (
    <View style={{ width: playerWidth, height, borderRadius: 8, overflow: 'hidden', backgroundColor: '#000' }}>
      <YoutubePlayer
        ref={ref}
        width={playerWidth}
        height={height}
        videoId={videoId}
        play={playing}
        onChangeState={onChangeState}
        onError={() => report({ status: 'error', error: 'This video can’t be played here' })}
        initialPlayerParams={{ controls: true, rel: false }}
        webViewProps={{ allowsInlineMediaPlayback: true, mediaPlaybackRequiresUserAction: false }}
      />
    </View>
  );
}
