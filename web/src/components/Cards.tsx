import { Link } from 'react-router-dom';
import type { CatalogTrack, PlaylistSummary } from '../api/types';
import { Icon } from './Icon';
import { Artwork } from './ui';

export function PlaylistCard({ playlist }: { playlist: PlaylistSummary }) {
  return (
    <Link to={`/playlist/${playlist.id}`} className="card">
      <div className="art-wrap">
        <Artwork src={playlist.coverUrl} size={156} className="card-art" />
      </div>
      <div className="card-title">{playlist.name}</div>
      <div className="card-sub">{playlist.description || `By ${playlist.owner.displayName ?? 'MyMusic'}`}</div>
    </Link>
  );
}

export function TrackCard({ track, onPlay }: { track: CatalogTrack; onPlay: () => void }) {
  return (
    <div className="card" style={{ opacity: track.playable ? 1 : 0.5 }}>
      <div className="art-wrap">
        <Artwork src={track.artworkUrl} size={156} />
        <button className="play-fab hover-play" aria-label={`Play ${track.title}`} onClick={onPlay} disabled={!track.playable}>
          <Icon name="play" size={24} />
        </button>
      </div>
      <div className="card-title" title={track.title}>
        {track.title}
      </div>
      <div className="card-sub">{track.artist ? <Link to={`/artist/${track.artist.id}`}>{track.artist.name}</Link> : null}</div>
    </div>
  );
}
