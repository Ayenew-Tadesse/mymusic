import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth/AuthProvider';
import { AddToPlaylistHost } from './components/AddToPlaylist';
import { Layout } from './components/Layout';
import { OverlayHost } from './components/overlays';
import { Spinner } from './components/ui';
import { setupMediaSession } from './player/engine';
import { history } from './player/history';
import { checkSleepTimer } from './player/store';
import { useApplyTheme } from './theme';
import { Login, Register, ForgotPassword } from './pages/Auth';
import Home from './pages/Home';
import Search from './pages/Search';
import LibraryPage from './pages/Library';
import PlaylistPage from './pages/Playlist';
import SharedPlaylist from './pages/Shared';
import JoinPlaylist from './pages/Join';
import AlbumPage from './pages/Album';
import ArtistPage from './pages/Artist';
import { Favorites, History } from './pages/Collections';
import Premium from './pages/Premium';
import Settings from './pages/Settings';

function useBackgroundTasks(signedIn: boolean) {
  useEffect(() => {
    setupMediaSession();
    const t = setInterval(checkSleepTimer, 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (!signedIn) return;
    history.flush();
    const flush = () => history.flush();
    window.addEventListener('online', flush);
    return () => window.removeEventListener('online', flush);
  }, [signedIn]);
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();
  if (status !== 'signedIn') return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <>{children}</>;
}

export default function App() {
  const { status } = useAuth();
  useApplyTheme();
  useBackgroundTasks(status === 'signedIn');

  if (status === 'loading') return <Spinner />;

  return (
    <>
      <Routes>
        <Route path="/login" element={status === 'signedIn' ? <Navigate to="/" replace /> : <Login />} />
        <Route path="/signup" element={status === 'signedIn' ? <Navigate to="/" replace /> : <Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/shared/:shareId" element={status === 'signedIn' ? <Layout /> : <SharedPlaylist />}>
          {status === 'signedIn' && <Route index element={<SharedPlaylist />} />}
        </Route>
        <Route
          element={
            <RequireAuth>
              <Layout />
            </RequireAuth>
          }
        >
          <Route index element={<Home />} />
          <Route path="search" element={<Search />} />
          <Route path="library" element={<LibraryPage />} />
          <Route path="playlist/:id" element={<PlaylistPage />} />
          <Route path="join/:token" element={<JoinPlaylist />} />
          <Route path="album/:id" element={<AlbumPage />} />
          <Route path="artist/:id" element={<ArtistPage />} />
          <Route path="collection/tracks" element={<Favorites />} />
          <Route path="history" element={<History />} />
          <Route path="premium" element={<Premium />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      <OverlayHost />
      {status === 'signedIn' && <AddToPlaylistHost />}
    </>
  );
}
