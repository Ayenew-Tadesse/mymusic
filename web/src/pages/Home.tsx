import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Catalog } from '../api/endpoints';
import { keys } from '../api/queryClient';
import { errorMessage } from '../api/client';
import { itemArtwork, itemKey } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { PlaylistCard, TrackCard } from '../components/Cards';
import { Artwork, ErrorState, Section, Spinner } from '../components/ui';
import { playList } from '../player/actions';
import { greeting } from '../utils';

export default function Home() {
  const { isPremium } = useAuth();
  const { data, error, isLoading, refetch } = useQuery({ queryKey: keys.home, queryFn: Catalog.home });

  return (
    <>
      <h1 className="page-title">{greeting()}</h1>
      {!isPremium && (
        <div className="banner">
          <div>
            <strong>Go Premium</strong>
            <div className="muted">The full catalog, no limits.</div>
          </div>
          <Link to="/premium" className="btn btn-primary btn-sm">
            See plans
          </Link>
        </div>
      )}
      {isLoading && <Spinner />}
      {error && <ErrorState message={errorMessage(error)} onRetry={refetch} />}
      {data && (
        <>
          {data.recentlyPlayed.length > 0 && (
            <div className="recent-grid" style={{ marginTop: 20 }}>
              {data.recentlyPlayed.slice(0, 8).map((item, i) => (
                <button key={itemKey(item)} className="recent-tile" onClick={() => playList(data.recentlyPlayed, i, { type: 'history' })} disabled={item.unavailable}>
                  <Artwork src={itemArtwork(item)} size={64} className="flat" />
                  <span>{item.title}</span>
                </button>
              ))}
            </div>
          )}
          {data.editorial.length > 0 && (
            <Section title="Made for you">
              <div className="rail">
                {data.editorial.map((p) => (
                  <PlaylistCard key={p.id} playlist={p} />
                ))}
              </div>
            </Section>
          )}
          {data.newReleases.length > 0 && (
            <Section title="New releases">
              <div className="rail">
                {data.newReleases.map((t, i) => (
                  <TrackCard key={t.id} track={t} onPlay={() => playList(data.newReleases, i, { type: 'other' })} />
                ))}
              </div>
            </Section>
          )}
          {data.popular.length > 0 && (
            <Section title="Popular right now">
              <div className="rail">
                {data.popular.map((t, i) => (
                  <TrackCard key={t.id} track={t} onPlay={() => playList(data.popular, i, { type: 'other' })} />
                ))}
              </div>
            </Section>
          )}
          {!data.editorial.length && !data.newReleases.length && !data.recentlyPlayed.length && (
            <p className="muted" style={{ marginTop: 32 }}>
              Nothing here yet. Use <Link to="/search" style={{ textDecoration: 'underline' }}>Search</Link> to find music, including on YouTube.
            </p>
          )}
        </>
      )}
    </>
  );
}
