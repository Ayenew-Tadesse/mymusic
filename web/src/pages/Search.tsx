/**
 * Search. The licensed catalog is searched as you type; YouTube only when you
 * press Enter, because every YouTube search costs significant API quota.
 */
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Catalog, Config, YouTube } from '../api/endpoints';
import { keys } from '../api/queryClient';
import { errorMessage } from '../api/client';
import type { YouTubeVideo } from '../api/types';
import { PlaylistCard } from '../components/Cards';
import { Icon } from '../components/Icon';
import { TrackList } from '../components/TrackList';
import { Artwork, Empty, ErrorState, Section, Spinner } from '../components/ui';
import { playList } from '../player/actions';

function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export default function Search() {
  const [params, setParams] = useSearchParams();
  const [text, setText] = useState(params.get('q') ?? '');
  const tab = params.get('tab') === 'youtube' ? 'youtube' : 'catalog';
  const q = useDebounced(text.trim());
  const { data: config } = useQuery({ queryKey: keys.config, queryFn: Config.get, staleTime: Infinity });

  const catalog = useQuery({ queryKey: keys.search(q), queryFn: () => Catalog.search(q), enabled: tab === 'catalog' && q.length > 0 });

  // YouTube results are fetched on submit only; `submitted` is the query that was sent.
  const submitted = params.get('yt') ?? '';
  const [yt, setYt] = useState<{ items: YouTubeVideo[]; next: string | null; loading: boolean; error: string | null }>({ items: [], next: null, loading: false, error: null });

  useEffect(() => {
    if (tab !== 'youtube' || !submitted) return;
    let cancelled = false;
    setYt({ items: [], next: null, loading: true, error: null });
    YouTube.search(submitted).then(
      (r) => !cancelled && setYt({ items: r.items, next: r.nextPageToken, loading: false, error: null }),
      (e) => !cancelled && setYt({ items: [], next: null, loading: false, error: errorMessage(e) }),
    );
    return () => {
      cancelled = true;
    };
  }, [tab, submitted]);

  async function more() {
    if (!yt.next) return;
    setYt((s) => ({ ...s, loading: true }));
    try {
      const r = await YouTube.search(submitted, yt.next);
      setYt((s) => ({ items: [...s.items, ...r.items], next: r.nextPageToken, loading: false, error: null }));
    } catch (e) {
      setYt((s) => ({ ...s, loading: false, error: errorMessage(e) }));
    }
  }

  const setTab = (t: 'catalog' | 'youtube') => {
    const next = new URLSearchParams(params);
    next.set('tab', t);
    if (t === 'youtube' && text.trim()) next.set('yt', text.trim());
    setParams(next, { replace: true });
  };

  return (
    <>
      <form
        className="search-box"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          const next = new URLSearchParams(params);
          next.set('q', text.trim());
          if (tab === 'youtube') next.set('yt', text.trim());
          setParams(next, { replace: true });
        }}
      >
        <Icon name="search" size={20} />
        <input autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="What do you want to listen to?" aria-label="Search" />
        {text && (
          <button type="button" aria-label="Clear search" onClick={() => setText('')}>
            <Icon name="close" size={18} />
          </button>
        )}
      </form>
      <div className="chips" role="tablist">
        <button role="tab" aria-selected={tab === 'catalog'} className={`chip ${tab === 'catalog' ? 'active' : ''}`} onClick={() => setTab('catalog')}>
          MyMusic
        </button>
        {config?.youtubeEnabled !== false && (
          <button role="tab" aria-selected={tab === 'youtube'} className={`chip ${tab === 'youtube' ? 'active' : ''}`} onClick={() => setTab('youtube')}>
            YouTube
          </button>
        )}
      </div>

      {tab === 'catalog' ? (
        !q ? (
          <Empty icon="search" title="Find your next favorite">
            <p>Search songs, artists, albums and playlists.</p>
          </Empty>
        ) : catalog.isLoading ? (
          <Spinner />
        ) : catalog.error ? (
          <ErrorState message={errorMessage(catalog.error)} onRetry={catalog.refetch} />
        ) : catalog.data && !catalog.data.tracks.length && !catalog.data.artists.length && !catalog.data.albums.length && !catalog.data.playlists.length ? (
          <Empty icon="search" title={`No results found for “${q}”`}>
            <p>
              Try the{' '}
              <button style={{ textDecoration: 'underline' }} onClick={() => setTab('youtube')}>
                YouTube tab
              </button>
              .
            </p>
          </Empty>
        ) : (
          catalog.data && (
            <>
              {catalog.data.tracks.length > 0 && (
                <Section title="Songs">
                  <TrackList items={catalog.data.tracks} onPlay={(i) => playList(catalog.data!.tracks, i, { type: 'search' })} />
                </Section>
              )}
              {catalog.data.artists.length > 0 && (
                <Section title="Artists">
                  <div className="rail">
                    {catalog.data.artists.map((a) => (
                      <Link key={a.id} to={`/artist/${a.id}`} className="card">
                        <Artwork src={a.imageUrl} size={156} round />
                        <div className="card-title">{a.name}</div>
                        <div className="card-sub">Artist</div>
                      </Link>
                    ))}
                  </div>
                </Section>
              )}
              {catalog.data.albums.length > 0 && (
                <Section title="Albums">
                  <div className="rail">
                    {catalog.data.albums.map((al) => (
                      <Link key={al.id} to={`/album/${al.id}`} className="card">
                        <Artwork src={al.artworkUrl} size={156} />
                        <div className="card-title">{al.title}</div>
                        <div className="card-sub">{al.artist?.name}</div>
                      </Link>
                    ))}
                  </div>
                </Section>
              )}
              {catalog.data.playlists.length > 0 && (
                <Section title="Playlists">
                  <div className="rail">
                    {catalog.data.playlists.map((p) => (
                      <PlaylistCard key={p.id} playlist={p} />
                    ))}
                  </div>
                </Section>
              )}
            </>
          )
        )
      ) : (
        <>
          <p className="muted small">Results from YouTube. Videos play in YouTube’s own player and are subject to the YouTube Terms of Service.</p>
          {!submitted ? (
            <Empty icon="youtube" title="Search YouTube">
              <p>Type a song or artist and press Enter.</p>
            </Empty>
          ) : yt.error ? (
            <ErrorState message={yt.error} />
          ) : (
            <>
              <TrackList items={yt.items} onPlay={(i) => playList(yt.items, i, { type: 'search' })} showAlbum={false} />
              {yt.loading && <Spinner />}
              {yt.next && !yt.loading && (
                <div style={{ textAlign: 'center', marginTop: 16 }}>
                  <button className="btn btn-secondary btn-sm" onClick={more}>
                    Load more
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}
    </>
  );
}
