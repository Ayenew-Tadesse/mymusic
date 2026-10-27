/** App shell: sidebar with library, sticky top bar, main content, player bar. */
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Playlists } from '../api/endpoints';
import { keys, queryClient } from '../api/queryClient';
import { errorMessage } from '../api/client';
import { useAuth } from '../auth/AuthProvider';
import { PlayerBar } from '../player/PlayerBar';
import { QueuePanel } from '../player/QueuePanel';
import { YouTubeDock } from '../player/YouTubeDock';
import { Icon } from './Icon';
import { openMenu, prompt, toast } from './overlays';
import { openImportYouTube } from './ImportYouTube';
import { useConfig } from '../hooks/useConfig';
import { Artwork, IconButton } from './ui';

function LibraryPanel() {
  const navigate = useNavigate();
  const { data } = useQuery({ queryKey: keys.playlists, queryFn: Playlists.mine });
  const config = useConfig();
  const create = useMutation({
    mutationFn: (name: string) => Playlists.create(name),
    onSuccess: ({ playlist }) => {
      queryClient.invalidateQueries({ queryKey: keys.playlists });
      navigate(`/playlist/${playlist.id}`);
    },
    onError: (e) => toast(errorMessage(e)),
  });

  return (
    <div className="panel library-panel">
      <div className="library-head">
        <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Icon name="library" /> Your Library
        </span>
        <IconButton
          icon="add"
          label="Create playlist or import"
          onClick={(e) =>
            openMenu(e, [
              {
                label: 'Create playlist',
                onSelect: async () => {
                  const name = await prompt('Give your playlist a name', 'My playlist', 'Create');
                  if (name) create.mutate(name);
                },
              },
              { label: 'Import from YouTube…', hidden: !config?.youtubeEnabled, onSelect: () => openImportYouTube() },
            ])
          }
        />
      </div>
      <nav className="library-list" aria-label="Your library">
        <NavLink to="/collection/tracks" className={({ isActive }) => `lib-item ${isActive ? 'active' : ''}`}>
          <div className="art" style={{ width: 48, height: 48, borderRadius: 4, background: 'linear-gradient(135deg,#450af5,#c4efd9)', color: '#fff' }}>
            <Icon name="heart" />
          </div>
          <div className="meta">
            <div className="title">Liked Songs</div>
            <div className="sub">Playlist</div>
          </div>
        </NavLink>
        <NavLink to="/history" className={({ isActive }) => `lib-item ${isActive ? 'active' : ''}`}>
          <div className="art" style={{ width: 48, height: 48, borderRadius: 4, background: 'linear-gradient(135deg,#e8115b,#5f0b2b)', color: '#fff' }}>
            <Icon name="history" />
          </div>
          <div className="meta">
            <div className="title">Recently played</div>
            <div className="sub">History</div>
          </div>
        </NavLink>
        {data?.items.map((p) => (
          <NavLink key={p.id} to={`/playlist/${p.id}`} className={({ isActive }) => `lib-item ${isActive ? 'active' : ''}`}>
            <Artwork src={p.coverUrl} size={48} />
            <div className="meta">
              <div className="title">{p.name}</div>
              <div className="sub">Playlist · {p.isOwner ? 'You' : p.owner.displayName}</div>
            </div>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

function TopBar() {
  const navigate = useNavigate();
  const { user, isPremium, signOut } = useAuth();
  const initial = user?.displayName.trim()[0]?.toUpperCase() ?? '?';
  return (
    <div className="topbar">
      <span className="hide-sm" style={{ display: 'flex', gap: 8 }}>
        <button className="round-btn" aria-label="Go back" onClick={() => navigate(-1)}>
          <Icon name="back" size={20} />
        </button>
        <button className="round-btn" aria-label="Go forward" onClick={() => navigate(1)}>
          <Icon name="forward" size={20} />
        </button>
      </span>
      <div className="grow" />
      {!isPremium && (
        <Link to="/premium" className="btn btn-sm" style={{ background: 'var(--text)', color: 'var(--bg)' }}>
          Explore Premium
        </Link>
      )}
      <button
        className="avatar-btn"
        aria-label="Account menu"
        onClick={(e) =>
          openMenu(e, [
            { label: 'Settings', onSelect: () => navigate('/settings') },
            { label: isPremium ? 'Your plan' : 'Upgrade to Premium', onSelect: () => navigate('/premium') },
            'divider',
            { label: 'Log out', onSelect: () => signOut() },
          ])
        }
      >
        <span className="avatar">{initial}</span>
        <span className="hide-sm">{user?.displayName}</span>
      </button>
    </div>
  );
}

export function Layout() {
  const [queueOpen, setQueueOpen] = useState(false);
  const { pathname } = useLocation();
  // Scroll the main area to the top on navigation, like a normal page load.
  useEffect(() => {
    document.querySelector('.main')?.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className="shell">
      <aside className="sidebar">
        <nav className="panel nav" aria-label="Main">
          <div className="brand">
            <Icon name="note" size={28} /> MyMusic
          </div>
          <NavLink to="/" end>
            <Icon name="home" /> Home
          </NavLink>
          <NavLink to="/search">
            <Icon name="search" /> Search
          </NavLink>
        </nav>
        <LibraryPanel />
      </aside>
      <main className="main" id="main">
        <TopBar />
        <div className="main-inner">
          <Outlet />
        </div>
      </main>
      <PlayerBar queueOpen={queueOpen} onToggleQueue={() => setQueueOpen((o) => !o)} />
      <nav className="mobile-nav" aria-label="Main">
        <NavLink to="/" end>
          <Icon name="home" /> Home
        </NavLink>
        <NavLink to="/search">
          <Icon name="search" /> Search
        </NavLink>
        <NavLink to="/library">
          <Icon name="library" /> Library
        </NavLink>
      </nav>
      {queueOpen && <QueuePanel onClose={() => setQueueOpen(false)} />}
      <YouTubeDock />
    </div>
  );
}
