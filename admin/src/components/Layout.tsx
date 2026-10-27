import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth';

const links = [
  ['/', 'Dashboard'],
  ['/tracks', 'Tracks'],
  ['/artists', 'Artists & albums'],
  ['/playlists', 'Playlists'],
  ['/users', 'Users'],
  ['/audit', 'Audit log'],
] as const;

export function Layout() {
  const { user, signOut } = useAuth();
  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">
          My<span>Music</span> admin
        </div>
        <nav className="nav">
          {links.map(([to, label]) => (
            <NavLink key={to} to={to} end={to === '/'}>
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="spacer" />
        <div className="muted" style={{ padding: '0 12px 8px' }}>
          {user?.email}
        </div>
        <button onClick={signOut}>Sign out</button>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
