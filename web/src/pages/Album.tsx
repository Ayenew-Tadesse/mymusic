import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { Catalog } from '../api/endpoints';
import { keys } from '../api/queryClient';
import { errorMessage } from '../api/client';
import { Hero } from '../components/Hero';
import { TrackList } from '../components/TrackList';
import { ErrorState, Spinner } from '../components/ui';
import { playList } from '../player/actions';
import { formatLongDuration } from '../utils';

export default function AlbumPage() {
  const { id = '' } = useParams();
  const { data, error, isLoading, refetch } = useQuery({ queryKey: keys.album(id), queryFn: () => Catalog.album(id) });
  if (isLoading) return <Spinner />;
  if (error || !data) return <ErrorState message={errorMessage(error)} onRetry={refetch} />;
  const { album, tracks, totalDurationSec } = data;
  const year = album.releaseDate ? new Date(album.releaseDate).getFullYear() : null;
  const context = { type: 'album' as const, id };

  return (
    <>
      <Hero
        kind="Album"
        title={album.title}
        art={album.artworkUrl}
        meta={
          <>
            <Link to={`/artist/${album.artist.id}`}>{album.artist.name}</Link>
            {year ? ` · ${year}` : ''} · {tracks.length} songs, {formatLongDuration(totalDurationSec)}
          </>
        }
        onPlay={tracks.length ? () => playList(tracks, 0, context, false) : undefined}
        onShuffle={tracks.length ? () => playList(tracks, 0, context, true) : undefined}
      />
      <TrackList items={tracks} onPlay={(i) => playList(tracks, i, context)} showArtwork={false} showAlbum={false} />
      {album.label && <p className="muted small" style={{ marginTop: 24 }}>℗ {album.label}</p>}
    </>
  );
}
