import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { Catalog } from '../api/endpoints';
import { keys } from '../api/queryClient';
import { errorMessage } from '../api/client';
import { Hero } from '../components/Hero';
import { TrackList } from '../components/TrackList';
import { Artwork, ErrorState, Section, Spinner } from '../components/ui';
import { playList } from '../player/actions';

export default function ArtistPage() {
  const { id = '' } = useParams();
  const { data, error, isLoading, refetch } = useQuery({ queryKey: keys.artist(id), queryFn: () => Catalog.artist(id) });
  if (isLoading) return <Spinner />;
  if (error || !data) return <ErrorState message={errorMessage(error)} onRetry={refetch} />;
  const { artist, topTracks, albums } = data;
  const context = { type: 'artist' as const, id };

  return (
    <>
      <Hero
        kind={artist.verified ? 'Verified artist' : 'Artist'}
        title={artist.name}
        art={artist.imageUrl}
        round
        meta={artist.genres.join(' · ') || undefined}
        onPlay={topTracks.length ? () => playList(topTracks, 0, context, false) : undefined}
        onShuffle={topTracks.length ? () => playList(topTracks, 0, context, true) : undefined}
      />
      {topTracks.length > 0 && (
        <Section title="Popular">
          <TrackList items={topTracks.slice(0, 10)} onPlay={(i) => playList(topTracks, i, context)} />
        </Section>
      )}
      {albums.length > 0 && (
        <Section title="Discography">
          <div className="grid-cards">
            {albums.map((al) => (
              <Link key={al.id} to={`/album/${al.id}`} className="card">
                <Artwork src={al.artworkUrl} size={156} />
                <div className="card-title">{al.title}</div>
                <div className="card-sub">{al.releaseDate ? new Date(al.releaseDate).getFullYear() : 'Album'}</div>
              </Link>
            ))}
          </div>
        </Section>
      )}
      {artist.bio && (
        <Section title="About">
          <p className="muted" style={{ maxWidth: 720, lineHeight: 1.6, whiteSpace: 'pre-line' }}>
            {artist.bio}
          </p>
        </Section>
      )}
    </>
  );
}
