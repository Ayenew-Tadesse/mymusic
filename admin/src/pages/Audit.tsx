import { useState } from 'react';
import { api, type Page } from '../api';
import { useFetch } from '../hooks';
import { Pagination } from '../components/Pagination';

type Entry = { _id: string; action: string; targetType?: string; targetId?: string; meta?: unknown; at: string; ip?: string; actor?: { displayName: string; email: string } };

export default function Audit() {
  const [page, setPage] = useState(1);
  const { data, error } = useFetch(() => api<Page<Entry>>(`/admin/audit?page=${page}&limit=50`), String(page));
  return (
    <>
      <h1>Audit log</h1>
      {error && <div className="error">{error}</div>}
      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>When</th>
              <th>Admin</th>
              <th>Action</th>
              <th>Target</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {data?.items.map((e) => (
              <tr key={e._id}>
                <td>{new Date(e.at).toLocaleString()}</td>
                <td>{e.actor?.email ?? '—'}</td>
                <td>
                  <code>{e.action}</code>
                </td>
                <td className="muted">
                  {e.targetType} {e.targetId}
                </td>
                <td className="muted" style={{ maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {e.meta ? JSON.stringify(e.meta) : ''}
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
