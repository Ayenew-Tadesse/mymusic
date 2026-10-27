/** Bottom player bar: now playing, transport controls, progress, volume, queue, sleep timer. */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { itemArtwork } from '../api/types';
import { Icon } from '../components/Icon';
import { Artwork, IconButton } from '../components/ui';
import { openMenu } from '../components/overlays';
import { useFavorites } from '../hooks/useFavorites';
import { formatDuration } from '../utils';
import { usePlayer } from './store';

function Range({ value, max, onChange, label, onCommit }: { value: number; max: number; onChange: (v: number) => void; onCommit?: (v: number) => void; label: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <input
      type="range"
      className="range"
      aria-label={label}
      min={0}
      max={max || 1}
      step="any"
      value={Math.min(value, max || 1)}
      style={{ ['--pct' as string]: `${pct}%` }}
      onChange={(e) => onChange(Number(e.target.value))}
      onMouseUp={(e) => onCommit?.(Number((e.target as HTMLInputElement).value))}
      onTouchEnd={(e) => onCommit?.(Number((e.target as HTMLInputElement).value))}
      onKeyUp={(e) => onCommit?.(Number((e.target as HTMLInputElement).value))}
    />
  );
}

function SleepLabel() {
  const sleepAt = usePlayer((s) => s.sleepAt);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!sleepAt) return null;
  return <span className="small" style={{ color: 'var(--accent)' }}>{sleepAt === 'end' ? 'End of track' : formatDuration((sleepAt - now) / 1000)}</span>;
}

export function PlayerBar({ queueOpen, onToggleQueue }: { queueOpen: boolean; onToggleQueue: () => void }) {
  const item = usePlayer((s) => s.queue[s.index]);
  const { status, position, duration, shuffle, repeat, volume, muted, sleepAt, error } = usePlayer();
  const { togglePlay, next, previous, seekTo, toggleShuffle, cycleRepeat, setVolume, toggleMute, setSleepTimer } = usePlayer.getState();
  const { isLiked, toggle } = useFavorites();
  const [scrub, setScrub] = useState<number | null>(null);

  const total = duration || item?.durationSec || 0;
  const playing = status === 'playing' || status === 'loading';
  const shown = scrub ?? position;

  const sleepMenu = (e: React.MouseEvent) =>
    openMenu(
      e,
      [
        ...[5, 15, 30, 45, 60].map((m) => ({ label: `${m} minutes`, onSelect: () => setSleepTimer(m) })),
        { label: 'End of track', onSelect: () => setSleepTimer('end') },
        ...(sleepAt ? ['divider' as const, { label: 'Turn off timer', danger: true, onSelect: () => setSleepTimer(null) }] : []),
      ],
      'Sleep timer',
    );

  return (
    <footer className="player" aria-label="Player">
      <div className="now">
        {item && (
          <>
            <Artwork src={itemArtwork(item)} size={56} />
            <div className="meta">
              <div className="title" title={item.title}>
                {item.title}
              </div>
              <div className="sub">
                {item.kind === 'catalog' ? (
                  item.artist ? <Link to={`/artist/${item.artist.id}`}>{item.artist.name}</Link> : ''
                ) : (
                  <>
                    <span className="tag yt">YouTube</span> {item.channelTitle}
                  </>
                )}
              </div>
              {error && <div className="small error-text">{error}</div>}
            </div>
            <IconButton icon={isLiked(item) ? 'heart' : 'heartOutline'} label={isLiked(item) ? 'Remove from Liked Songs' : 'Save to Liked Songs'} active={isLiked(item)} onClick={() => toggle(item)} className="hide-sm" />
          </>
        )}
      </div>

      <div className="center">
        <div className="controls">
          <IconButton icon="shuffle" label={shuffle ? 'Disable shuffle' : 'Enable shuffle'} active={shuffle} onClick={toggleShuffle} className="hide-sm" />
          <IconButton icon="prev" label="Previous" onClick={() => previous()} disabled={!item} className="hide-sm" />
          <button className="main-play" aria-label={playing ? 'Pause' : 'Play'} onClick={() => togglePlay()} disabled={!item}>
            <Icon name={playing ? 'pause' : 'play'} size={20} />
          </button>
          <IconButton icon="next" label="Next" onClick={() => next()} disabled={!item} />
          <IconButton icon={repeat === 'one' ? 'repeatOne' : 'repeat'} label={`Repeat: ${repeat}`} active={repeat !== 'off'} onClick={cycleRepeat} className="hide-sm" />
        </div>
        <div className="progress">
          <span className="time">{formatDuration(shown)}</span>
          <Range
            label="Seek"
            value={shown}
            max={total}
            onChange={setScrub}
            onCommit={(v) => {
              setScrub(null);
              void seekTo(v);
            }}
          />
          <span className="time">{formatDuration(total)}</span>
        </div>
      </div>

      <div className="right">
        <span className="hide-sm" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <IconButton icon="moon" label="Sleep timer" active={Boolean(sleepAt)} onClick={sleepMenu} />
          <SleepLabel />
        </span>
        <IconButton icon="queue" label="Queue" active={queueOpen} onClick={onToggleQueue} />
        <div className="volume">
          <IconButton icon={muted || volume === 0 ? 'mute' : 'volume'} label={muted ? 'Unmute' : 'Mute'} onClick={toggleMute} />
          <Range label="Volume" value={muted ? 0 : volume} max={1} onChange={setVolume} />
        </div>
      </div>
    </footer>
  );
}
