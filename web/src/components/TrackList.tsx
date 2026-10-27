/** Spotify-style song table. Double-click or Enter plays; right-click opens the menu. */
import { memo, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { itemArtwork, itemKey, type MediaItem } from '../api/types';
import { useFavorites } from '../hooks/useFavorites';
import { usePlayer } from '../player/store';
import { formatDuration } from '../utils';
import { Icon } from './Icon';
import { Artwork, IconButton } from './ui';
import { openTrackMenu } from './trackMenu';

type Extra = { label: string; onSelect: () => void; danger?: boolean };

type Props = {
  items: MediaItem[];
  onPlay: (index: number) => void;
  showArtwork?: boolean;
  showAlbum?: boolean;
  extraActions?: (item: MediaItem, index: number) => Extra[];
  rowAddon?: (item: MediaItem, index: number) => ReactNode;
};

const Row = memo(function Row({ item, index, onPlay, showArtwork, showAlbum, extra, addon }: { item: MediaItem; index: number; onPlay: (i: number) => void; showArtwork: boolean; showAlbum: boolean; extra?: Extra[]; addon?: ReactNode }) {
  const navigate = useNavigate();
  const { isLiked, toggle } = useFavorites();
  const isCurrent = usePlayer((s) => {
    const c = s.queue[s.index];
    return Boolean(c && itemKey(c) === itemKey(item));
  });
  const isPlaying = usePlayer((s) => s.status === 'playing') && isCurrent;
  const disabled = item.unavailable || (item.kind === 'catalog' && !item.playable);
  const liked = isLiked(item);
  const menu = (e: React.MouseEvent) => openTrackMenu(e, item, { liked, toggleLike: () => toggle(item), navigate, extra });

  return (
    <div
      className={`track ${disabled ? 'unavailable' : ''}`}
      role="row"
      tabIndex={0}
      aria-disabled={disabled}
      onDoubleClick={() => !disabled && onPlay(index)}
      onKeyDown={(e) => e.key === 'Enter' && !disabled && onPlay(index)}
      onContextMenu={menu}
      title={disabled ? (item.kind === 'catalog' && !item.unavailable ? 'Premium only or not available in your region' : 'Unavailable') : undefined}
    >
      <div className="idx">
        <span className="num" style={isCurrent ? { color: 'var(--accent)' } : undefined}>
          {isPlaying ? <Icon name="volume" size={16} /> : index + 1}
        </span>
        <button className="play-on-hover" aria-label={`Play ${item.title}`} onClick={() => !disabled && onPlay(index)} disabled={disabled}>
          <Icon name="play" size={18} />
        </button>
      </div>
      <div className="main-col">
        {showArtwork && <Artwork src={itemArtwork(item)} size={40} />}
        <div style={{ minWidth: 0 }}>
          <div className={`t-title ${isCurrent ? 'playing' : ''}`}>{item.title || 'Unavailable'}</div>
          <div className="t-sub">
            {item.kind === 'catalog' && item.explicit && <span className="tag">E</span>}
            {item.kind === 'youtube' && <span className="tag yt">YouTube</span>}
            {item.kind === 'catalog' ? item.artist && <Link to={`/artist/${item.artist.id}`}>{item.artist.name}</Link> : <span>{item.channelTitle}</span>}
          </div>
        </div>
      </div>
      <div className="album-col">{showAlbum && item.kind === 'catalog' && item.album ? <Link to={`/album/${item.album.id}`}>{item.album.title}</Link> : null}</div>
      <div className="dur">
        <IconButton icon={liked ? 'heart' : 'heartOutline'} label={liked ? 'Remove from Liked Songs' : 'Save to Liked Songs'} active={liked} size={18} className={`hover-only ${liked ? 'active' : ''}`} onClick={() => toggle(item)} />
        {item.durationSec ? formatDuration(item.durationSec) : ''}
      </div>
      <div className="row-actions">
        {addon}
        <IconButton icon="more" label={`More options for ${item.title}`} className="hover-only" onClick={menu} />
      </div>
    </div>
  );
});

export function TrackList({ items, onPlay, showArtwork = true, showAlbum = true, extraActions, rowAddon }: Props) {
  return (
    <div className="tracks" role="table" aria-label="Songs">
      <div className="track-head" role="row">
        <span style={{ textAlign: 'right' }}>#</span>
        <span>Title</span>
        <span>{showAlbum ? 'Album' : ''}</span>
        <span style={{ textAlign: 'right' }}>Time</span>
        <span />
      </div>
      {items.map((item, i) => (
        <Row
          key={`${itemKey(item)}-${item.itemId ?? i}`}
          item={item}
          index={i}
          onPlay={onPlay}
          showArtwork={showArtwork}
          showAlbum={showAlbum}
          extra={extraActions?.(item, i)}
          addon={rowAddon?.(item, i)}
        />
      ))}
    </div>
  );
}
