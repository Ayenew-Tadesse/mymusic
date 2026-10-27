import { useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../api';
import { useFetch } from '../hooks';
import type { Stats } from '../types';

const fmt = new Intl.NumberFormat();

function Kpi({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="card kpi">
      <div className="label">{label}</div>
      <div className="value">{typeof value === 'number' ? fmt.format(value) : value}</div>
    </div>
  );
}

/** One measure per chart: plays and listeners have different scales, so they get separate charts. */
function TrendChart({ data, dataKey, title }: { data: Stats['playsByDay']; dataKey: 'plays' | 'listeners' | 'minutes'; title: string }) {
  return (
    <div className="card">
      <h2>{title}</h2>
      <div style={{ height: 220 }}>
        <ResponsiveContainer>
          <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={`fill-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis dataKey="date" tick={{ fill: 'var(--muted)', fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={24} />
            <YAxis tick={{ fill: 'var(--muted)', fontSize: 11 }} tickLine={false} axisLine={false} width={44} allowDecimals={false} />
            <Tooltip
              contentStyle={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)' }}
              labelStyle={{ color: 'var(--muted)' }}
              cursor={{ stroke: 'var(--muted)', strokeDasharray: '3 3' }}
              formatter={(v: number) => [fmt.format(v), title]}
            />
            <Area type="monotone" dataKey={dataKey} stroke="var(--accent)" strokeWidth={2} fill={`url(#fill-${dataKey})`} activeDot={{ r: 4 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [days, setDays] = useState(30);
  const { data, error, loading } = useFetch(() => api<Stats>(`/admin/stats?days=${days}`), String(days));

  return (
    <>
      <div className="toolbar">
        <h1 className="grow" style={{ margin: 0 }}>
          Dashboard
        </h1>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Time range">
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
          <option value={365}>Last year</option>
        </select>
      </div>
      {error && <div className="error">{error}</div>}
      {loading && !data && <div className="muted">Loading…</div>}
      {data && (
        <>
          <div className="grid kpis">
            <Kpi label="Users" value={data.totals.users} />
            <Kpi label={`New (${days}d)`} value={data.totals.newUsers} />
            <Kpi label="Daily active" value={data.totals.dau} />
            <Kpi label="Monthly active" value={data.totals.mau} />
            <Kpi label="Premium" value={(data.totals.subscribers.premium ?? 0) + (data.totals.subscribers.family ?? 0)} />
            <Kpi label="Published tracks" value={data.totals.tracks.published ?? 0} />
            <Kpi label="Playlists" value={data.totals.playlists} />
            <Kpi label="Offline licences" value={data.totals.offlineLicenses} />
          </div>
          <div className="grid two" style={{ marginBottom: 16 }}>
            <TrendChart data={data.playsByDay} dataKey="plays" title="Plays per day" />
            <div className="card">
              <h2>Plays by source</h2>
              <table>
                <tbody>
                  <tr>
                    <td>Licensed catalog</td>
                    <td style={{ textAlign: 'right' }}>{fmt.format(data.sourceSplit.catalog ?? 0)}</td>
                  </tr>
                  <tr>
                    <td>YouTube (embedded)</td>
                    <td style={{ textAlign: 'right' }}>{fmt.format(data.sourceSplit.youtube ?? 0)}</td>
                  </tr>
                </tbody>
              </table>
              <h2 style={{ marginTop: 20 }}>Subscribers by plan</h2>
              <table>
                <tbody>
                  {Object.entries(data.totals.subscribers).map(([plan, n]) => (
                    <tr key={plan}>
                      <td style={{ textTransform: 'capitalize' }}>{plan}</td>
                      <td style={{ textAlign: 'right' }}>{fmt.format(n)}</td>
                    </tr>
                  ))}
                  {!Object.keys(data.totals.subscribers).length && (
                    <tr>
                      <td className="muted">No paying subscribers yet</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <div className="grid two">
            <TrendChart data={data.playsByDay} dataKey="listeners" title="Listeners per day" />
            <div className="card">
              <h2>Top tracks</h2>
              <table>
                <thead>
                  <tr>
                    <th>Track</th>
                    <th style={{ textAlign: 'right' }}>Plays</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topTracks.map((t) => (
                    <tr key={t.id}>
                      <td>
                        <div>{t.title}</div>
                        <div className="muted">{t.artist}</div>
                      </td>
                      <td style={{ textAlign: 'right' }}>{fmt.format(t.plays)}</td>
                    </tr>
                  ))}
                  {!data.topTracks.length && (
                    <tr>
                      <td className="muted">No plays in this period</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  );
}
