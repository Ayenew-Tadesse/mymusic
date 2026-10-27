import type { ReactNode } from 'react';
import { Icon } from './Icon';
import { Artwork, IconButton } from './ui';

/** Big header for playlists, albums and artists with play / shuffle controls. */
export function Hero({
  kind,
  title,
  art,
  round,
  description,
  meta,
  onPlay,
  onShuffle,
  actions,
}: {
  kind: string;
  title: string;
  art: string | null | undefined;
  round?: boolean;
  description?: ReactNode;
  meta?: ReactNode;
  onPlay?: () => void;
  onShuffle?: () => void;
  actions?: ReactNode;
}) {
  return (
    <>
      <div className="hero">
        <Artwork src={art} size={232} round={round} />
        <div style={{ minWidth: 0 }}>
          <div className="kind">{kind}</div>
          <h1>{title}</h1>
          {description && <div className="desc">{description}</div>}
          {meta && <div className="small" style={{ fontWeight: 600 }}>{meta}</div>}
        </div>
      </div>
      <div className="actions-row">
        {onPlay && (
          <button className="play-fab" aria-label="Play" onClick={onPlay}>
            <Icon name="play" size={28} />
          </button>
        )}
        {onShuffle && <IconButton icon="shuffle" label="Shuffle play" size={30} onClick={onShuffle} />}
        {actions}
      </div>
    </>
  );
}
