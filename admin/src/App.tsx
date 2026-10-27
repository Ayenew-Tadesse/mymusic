import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth';
import { Layout } from './components/Layout';
import Login from './pages/Login';
import Tracks from './pages/Tracks';
import TrackEditor from './pages/TrackEditor';
import Artists from './pages/Artists';
import Playlists from './pages/Playlists';
import Users from './pages/Users';
import Audit from './pages/Audit';

// The charting library is large, so the dashboard loads in its own chunk.
const Dashboard = lazy(() => import('./pages/Dashboard'));

export default function App() {
  const { user, loading } = useAuth();
  if (loading) return <div className="login muted">Loading…</div>;
  if (!user) return <Login />;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route
          index
          element={
            <Suspense fallback={<div className="muted">Loading…</div>}>
              <Dashboard />
            </Suspense>
          }
        />
        <Route path="tracks" element={<Tracks />} />
        <Route path="tracks/new" element={<TrackEditor />} />
        <Route path="tracks/:id" element={<TrackEditor />} />
        <Route path="artists" element={<Artists />} />
        <Route path="playlists" element={<Playlists />} />
        <Route path="users" element={<Users />} />
        <Route path="audit" element={<Audit />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
