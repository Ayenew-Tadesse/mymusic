/**
 * The official YouTube IFrame player, docked above the player bar whenever
 * the current queue item is a YouTube video.
 *
 * Compliance: always visible (16:9, at least 200px tall), YouTube's own
 * controls and branding are kept, nothing is overlaid on it, and there is no
 * audio-only or hidden playback.
 */
import { useEffect, useRef } from 'react';
import { usePlayer } from './store';
import { youtubeBridge } from './engine';
import { Icon } from '../components/Icon';

type YTPlayer = {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(s: number, allowSeekAhead: boolean): void;
  setVolume(v: number): void;
  getCurrentTime(): number;
  getDuration(): number;
  destroy(): void;
};
type YTNamespace = {
  Player: new (
    el: HTMLElement,
    opts: {
      videoId: string;
      playerVars: Record<string, string | number>;
      events: { onReady?: () => void; onStateChange?: (e: { data: number }) => void; onError?: () => void };
    },
  ) => YTPlayer;
  PlayerState: { ENDED: 0; PLAYING: 1; PAUSED: 2; BUFFERING: 3 };
};
declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<YTNamespace> | null = null;
function loadApi() {
  apiPromise ??= new Promise((resolve) => {
    if (window.YT?.Player) return resolve(window.YT);
    window.onYouTubeIframeAPIReady = () => resolve(window.YT!);
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(s);
  });
  return apiPromise;
}

function Player({ videoId }: { videoId: string }) {
  const host = useRef<HTMLDivElement>(null);
  const report = usePlayer((s) => s.report);

  useEffect(() => {
    let player: YTPlayer | null = null;
    let poll: ReturnType<typeof setInterval> | undefined;
    let disposed = false;

    loadApi().then((YT) => {
      if (disposed || !host.current) return;
      const mount = document.createElement('div');
      host.current.appendChild(mount);
      player = new YT.Player(mount, {
        videoId,
        playerVars: { autoplay: youtubeBridge.wantsPlay ? 1 : 0, playsinline: 1, rel: 0, controls: 1, origin: window.location.origin },
        events: {
          onReady: () => {
            const { volume, muted } = usePlayer.getState();
            player?.setVolume(Math.round((muted ? 0 : volume) * 100));
            youtubeBridge.controller = {
              play: () => player?.playVideo(),
              pause: () => player?.pauseVideo(),
              seek: (s) => player?.seekTo(s, true),
              setVolume: (v) => player?.setVolume(Math.round(v * 100)),
            };
            if (youtubeBridge.wantsPlay) player?.playVideo();
          },
          onStateChange: ({ data }) => {
            clearInterval(poll);
            if (data === YT.PlayerState.PLAYING) {
              youtubeBridge.wantsPlay = true;
              report({ status: 'playing', duration: player?.getDuration() || undefined });
              poll = setInterval(() => report({ position: player?.getCurrentTime() ?? 0 }), 500);
            } else if (data === YT.PlayerState.PAUSED) {
              youtubeBridge.wantsPlay = false;
              report({ status: 'paused' });
            } else if (data === YT.PlayerState.BUFFERING) {
              report({ status: 'loading' });
            } else if (data === YT.PlayerState.ENDED) {
              void usePlayer.getState().next({ auto: true });
            }
          },
          onError: () => report({ status: 'error', error: 'This video can’t be played here' }),
        },
      });
    });

    return () => {
      disposed = true;
      clearInterval(poll);
      youtubeBridge.controller = null;
      player?.destroy();
    };
  }, [videoId, report]);

  return <div className="yt-frame" ref={host} />;
}

export function YouTubeDock() {
  const item = usePlayer((s) => s.queue[s.index]);
  if (item?.kind !== 'youtube') return null;
  return (
    <aside className="yt-dock" aria-label="YouTube player">
      <Player key={item.videoId} videoId={item.videoId} />
      <div className="yt-bar">
        <span>Playing from YouTube</span>
        <a href={item.watchUrl} target="_blank" rel="noopener noreferrer">
          Watch on YouTube <Icon name="external" size={12} />
        </a>
      </div>
    </aside>
  );
}
