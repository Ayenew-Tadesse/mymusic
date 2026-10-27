import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, qs, type Page } from '../api';
import { formatDuration, useDebounced, useFetch } from '../hooks';
import { Pagination } from '../components/Pagination';
import type { Track } from '../types';

const statusBadge = { published: 'green', draft: 'amber', takedown: 'red' } as const;

export default function Tracks() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const query = useDebounced(q);
  const path = `/admin/tracks${qs({ q: query, status, page, limit: 25 })}`;
  const { data, error, reload } = useFetch(() => api<Page<Track>>(path), path);
  const [actionError, setActionError] = useState<string | null>(null);

  async function setTrackStatus(t: Track, next: Track['status']) {
    let reason: string | undefined;
    if (next === 'takedown') {
      reason = prompt(`Reason for taking down “${t.title}” (e.g. DMCA notice id)`) ?? undefined;
      if (reason === undefined) return;
    }
    setActionError(null);
    try {
      await api(`/admin/tracks/${t.id}/status`, { method: 'POST', json: { status: next, reason } });
      reload();
    } catch (e) {
      setActionError((e as Error).message);
    }
  }

  return (
    <>
      <div className="toolbar">
        <h1 className="grow" style={{ margin: 0 }}>
          Tracks
        </h1>
        <Link to="/tracks/new">
          <button className="primary">Add track</button>
        </Link>
      </div>
      <div className="notice">
        Only upload audio you own or are licensed to distribute. Record the licence for every track; takedowns revoke all offline copies on users’ devices at their next sync.
      </div>
      <div className="toolbar">
        <input className="grow" placeholder="Search by title" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label="Status">
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
          <option value="takedown">Taken down</option>
        </select>
      </div>
      {(error || actionError) && <div className="error">{error ?? actionError}</div>}
      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th></th>
              <th>Title</th>
              <th>Licence</th>
              <th>Duration</th>
              <th>Plays</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {data?.items.map((t) => (
              <tr key={t.id}>
                <td>{t.artworkUrl ? <img className="thumb" src={t.artworkUrl} alt="" /> : <div className="thumb" />}</td>
                <td>
                  <Link to={`/tracks/${t.id}`}>{t.title}</Link>
                  <div className="muted">
                    {t.artist?.name} {t.album?.title ? `· ${t.album.title}` : ''}
                  </div>
                </td>
                <td>
                  <div>{t.rights.licensor}</div>
                  <div className="muted">
                    {t.rights.licenseType.replace('_', ' ')} · {t.rights.territories.join(', ')}
                    {t.rights.offlineAllowed ? ' · offline' : ''}
                  </div>
                </td>
                <td>{formatDuration(t.durationSec)}</td>
                <td>{t.playCount}</td>
                <td>
                  <span className={`badge ${statusBadge[t.status]}`}>{t.status}</span>
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {t.status !== 'published' && (
                    <button className="small" onClick={() => setTrackStatus(t, 'published')}>
                      Publish
                    </button>
                  )}{' '}
                  {t.status === 'published' && (
                    <button className="small" onClick={() => setTrackStatus(t, 'draft')}>
                      Unpublish
                    </button>
                  )}{' '}
                  {t.status !== 'takedown' && (
                    <button className="small danger" onClick={() => setTrackStatus(t, 'takedown')}>
                      Take down
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {data && !data.items.length && (
              <tr>
                <td colSpan={7} className="muted">
                  No tracks found
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {data && <Pagination page={data.page} total={data.total} limit={data.limit} onPage={setPage} />}
      </div>
    </>
  );
}
