/** A playlist opened from a share link. Anyone can view it; listening needs an account. */
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Playlists } from '../api/endpoints';
import { errorMessage } from '../api/client';
import { useAuth } from '../auth/AuthProvider';
import { Hero } from '../components/Hero';
import { TrackList } from '../components/TrackList';
import { ErrorState, Spinner } from '../components/ui';

export default function SharedPlaylist() {
  const { shareId = '' } = useParams();
  const { status } = useAuth();
  const navigate = useNavigate();
  const { data, error, isLoading, refetch } = useQuery({ queryKey: ['shared', shareId], queryFn: () => Playlists.shared(shareId).then((r) => r.playlist) });

  // Signed-in listeners get the full playlist page.
  useEffect(() => {
    if (status === 'signedIn' && data) navigate(`/playlist/${data.id}`, { replace: true });
  }, [status, data, navigate]);

  const page = (children: React.ReactNode) => (
    <div className="auth-page" style={{ placeItems: 'start center' }}>
      <div style={{ width: '100%', maxWidth: 1100 }}>{children}</div>
    </div>
  );

  if (isLoading) return page(<Spinner />);
  if (error || !data) return page(<ErrorState message={errorMessage(error)} onRetry={refetch} />);
  const signUp = () => navigate('/signup', { state: { from: `/shared/${shareId}` } });

  return page(
    <>
      <Hero kind="Playlist" title={data.name} art={data.coverUrl} description={data.description || undefined} meta={`${data.owner.displayName ?? ''} · ${data.itemCount} songs`} onPlay={signUp} />
      <div className="banner" style={{ marginBottom: 24 }}>
        <span>Sign up free to listen to this playlist.</span>
        <span style={{ display: 'flex', gap: 8 }}>
          <Link to="/login" state={{ from: `/shared/${shareId}` }} className="btn btn-secondary btn-sm">
            Log in
          </Link>
          <button className="btn btn-primary btn-sm" onClick={signUp}>
            Sign up free
          </button>
        </span>
      </div>
      <TrackList items={data.items} onPlay={signUp} />
    </>,
  );
}
