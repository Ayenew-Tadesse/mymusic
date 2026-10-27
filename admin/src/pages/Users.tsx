import { useState } from 'react';
import { api, qs, type Page } from '../api';
import { formatDate, useDebounced, useFetch } from '../hooks';
import { Pagination } from '../components/Pagination';
import { useAuth } from '../auth';
import type { User } from '../types';

export default function Users() {
  const { user: me } = useAuth();
  const [q, setQ] = useState('');
  const [plan, setPlan] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const query = useDebounced(q);
  const path = `/admin/users${qs({ q: query, plan, status, page, limit: 25 })}`;
  const { data, error, reload } = useFetch(() => api<Page<User>>(path), path);
  const [actionError, setActionError] = useState<string | null>(null);

  async function act(u: User, body: Partial<Pick<User, 'role' | 'status'>>, question: string) {
    if (!confirm(question)) return;
    setActionError(null);
    try {
      await api(`/admin/users/${u.id}`, { method: 'PATCH', json: body });
      reload();
    } catch (e) {
      setActionError((e as Error).message);
    }
  }

  async function revoke(u: User) {
    if (!confirm(`Sign ${u.displayName} out of every device?`)) return;
    await api(`/admin/users/${u.id}/revoke-sessions`, { method: 'POST' }).catch((e) => setActionError(e.message));
  }

  return (
    <>
      <h1>Users</h1>
      <div className="toolbar">
        <input className="grow" placeholder="Search name or email" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        <select value={plan} onChange={(e) => { setPlan(e.target.value); setPage(1); }} aria-label="Plan">
          <option value="">All plans</option>
          <option value="free">Free</option>
          <option value="premium">Premium</option>
          <option value="family">Family</option>
        </select>
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label="Status">
          <option value="">Any status</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
        </select>
      </div>
      {(error || actionError) && <div className="error">{error ?? actionError}</div>}
      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>User</th>
              <th>Sign-in</th>
              <th>Plan</th>
              <th>Joined</th>
              <th>Last login</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {data?.items.map((u) => (
              <tr key={u.id}>
                <td>
                  {u.displayName} {u.role === 'admin' && <span className="badge green">admin</span>}
                  <div className="muted">{u.email ?? 'hidden email'}</div>
                </td>
                <td className="muted">
                  {[u.providers.password && 'email', u.providers.google && 'Google', u.providers.apple && 'Apple'].filter(Boolean).join(', ')}
                </td>
                <td>
                  {u.subscription.plan}
                  {u.subscription.cancelAtPeriodEnd && <div className="muted">cancels {formatDate(u.subscription.currentPeriodEnd)}</div>}
                </td>
                <td>{formatDate(u.createdAt)}</td>
                <td>{formatDate(u.lastLoginAt)}</td>
                <td>
                  <span className={`badge ${u.status === 'active' ? 'green' : 'red'}`}>{u.status}</span>
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {u.id !== me?.id && (
                    <>
                      <button
                        className="small"
                        onClick={() => act(u, { role: u.role === 'admin' ? 'user' : 'admin' }, u.role === 'admin' ? `Remove admin rights from ${u.displayName}?` : `Make ${u.displayName} an admin?`)}
                      >
                        {u.role === 'admin' ? 'Revoke admin' : 'Make admin'}
                      </button>{' '}
                      <button className="small" onClick={() => revoke(u)}>
                        Sign out
                      </button>{' '}
                      <button
                        className="small danger"
                        onClick={() =>
                          act(u, { status: u.status === 'active' ? 'suspended' : 'active' }, u.status === 'active' ? `Suspend ${u.displayName}?` : `Reactivate ${u.displayName}?`)
                        }
                      >
                        {u.status === 'active' ? 'Suspend' : 'Reactivate'}
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && <Pagination page={data.page} total={data.total} limit={data.limit} onPage={setPage} />}
      </div>
    </>
  );
}
