import { useState, type FormEvent } from 'react';
import { api, qs, type Page } from '../api';
import { formatDate, useDebounced, useFetch } from '../hooks';
import { Pagination } from '../components/Pagination';
import type { Playlist } from '../types';

export default function Playlists() {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(1);
  const query = useDebounced(q);
  const path = `/admin/playlists${qs({
    q: query,
    page,
    limit: 25,
    editorial: filter === 'editorial' ? 'true' : undefined,
    visibility: filter === 'public' ? 'public' : undefined,
  })}`;
  const { data, error, reload } = useFetch(() => api<Page<Playlist>>(path), path);
  const [name, setName] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  async function update(p: Playlist, body: Partial<Pick<Playlist, 'isEditorial' | 'hidden'>>) {
    setActionError(null);
    try {
      await api(`/admin/playlists/${p.id}`, { method: 'PATCH', json: body });
      reload();
    } catch (e) {
      setActionError((e as Error).message);
    }
  }

  async function remove(p: Playlist) {
    if (!confirm(`Delete “${p.name}” permanently?`)) return;
    await api(`/admin/playlists/${p.id}`, { method: 'DELETE' }).catch((e) => setActionError(e.message));
    reload();
  }

  async function createEditorial(e: FormEvent) {
    e.preventDefault();
    await api('/admin/playlists', { method: 'POST', json: { name } }).catch((err) => setActionError(err.message));
    setName('');
    reload();
  }

  return (
    <>
      <h1>Playlists</h1>
      <form className="toolbar" onSubmit={createEditorial}>
        <input placeholder="New editorial playlist name" value={name} onChange={(e) => setName(e.target.value)} required />
        <button className="primary">Create editorial playlist</button>
        <span className="muted">Add songs to it from the mobile app while signed in as this admin.</span>
      </form>
      <div className="toolbar">
        <input className="grow" placeholder="Search playlists" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        <select value={filter} onChange={(e) => { setFilter(e.target.value); setPage(1); }} aria-label="Filter">
          <option value="">All</option>
          <option value="editorial">Editorial</option>
          <option value="public">Public</option>
        </select>
      </div>
      {(error || actionError) && <div className="error">{error ?? actionError}</div>}
      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Owner</th>
              <th>Visibility</th>
              <th>Items</th>
              <th>Followers</th>
              <th>Updated</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {data?.items.map((p) => (
              <tr key={p.id}>
                <td>
                  {p.name} {p.isEditorial && <span className="badge green">editorial</span>} {p.hidden && <span className="badge red">hidden</span>}
                  <div className="muted">{p.description}</div>
                </td>
                <td>
                  {p.owner.displayName}
                  <div className="muted">{p.ownerEmail}</div>
                </td>
                <td>{p.visibility}</td>
                <td>{p.itemCount}</td>
                <td>{p.followerCount}</td>
                <td>{formatDate(p.updatedAt)}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button className="small" onClick={() => update(p, { isEditorial: !p.isEditorial })}>
                    {p.isEditorial ? 'Unfeature' : 'Feature'}
                  </button>{' '}
                  <button className="small" onClick={() => update(p, { hidden: !p.hidden })}>
                    {p.hidden ? 'Unhide' : 'Hide'}
                  </button>{' '}
                  <button className="small danger" onClick={() => remove(p)}>
                    Delete
                  </button>
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
