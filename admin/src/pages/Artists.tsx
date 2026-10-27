import { useState, type FormEvent } from 'react';
import { api, qs, type Page } from '../api';
import { formatDate, useDebounced, useFetch } from '../hooks';
import { Pagination } from '../components/Pagination';
import type { Album, Artist } from '../types';

export default function Artists() {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const query = useDebounced(q);
  const path = `/admin/artists${qs({ q: query, page, limit: 20 })}`;
  const artists = useFetch(() => api<Page<Artist>>(path), path);
  const albums = useFetch(() => api<Page<Album>>('/admin/albums?limit=50'), 'albums');
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [album, setAlbum] = useState({ title: '', artist: '', artworkUrl: '', releaseDate: '', label: '' });

  async function addArtist(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api('/admin/artists', { method: 'POST', json: { name, imageUrl: imageUrl || undefined } });
      setName('');
      setImageUrl('');
      artists.reload();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function addAlbum(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api('/admin/albums', {
        method: 'POST',
        json: { ...album, artworkUrl: album.artworkUrl || undefined, releaseDate: album.releaseDate || undefined, label: album.label || undefined },
      });
      setAlbum({ title: '', artist: '', artworkUrl: '', releaseDate: '', label: '' });
      albums.reload();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <>
      <h1>Artists & albums</h1>
      {error && <div className="error">{error}</div>}
      <div className="grid two">
        <div className="card table-wrap">
          <div className="toolbar">
            <input className="grow" placeholder="Search artists" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
          </div>
          <table>
            <thead>
              <tr>
                <th></th>
                <th>Artist</th>
                <th>Genres</th>
              </tr>
            </thead>
            <tbody>
              {artists.data?.items.map((a) => (
                <tr key={a.id}>
                  <td>{a.imageUrl ? <img className="thumb" style={{ borderRadius: '50%' }} src={a.imageUrl} alt="" /> : <div className="thumb" />}</td>
                  <td>
                    {a.name} {a.verified && <span className="badge green">verified</span>}
                  </td>
                  <td className="muted">{a.genres.join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {artists.data && <Pagination page={artists.data.page} total={artists.data.total} limit={artists.data.limit} onPage={setPage} />}
        </div>
        <form className="card" onSubmit={addArtist}>
          <h2>New artist</h2>
          <div className="form">
            <label className="full">
              Name
              <input required value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="full">
              Image URL
              <input type="url" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://" />
            </label>
            <button className="primary">Add artist</button>
          </div>
        </form>
      </div>

      <div className="grid two" style={{ marginTop: 16 }}>
        <div className="card table-wrap">
          <h2>Recent albums</h2>
          <table>
            <thead>
              <tr>
                <th></th>
                <th>Album</th>
                <th>Released</th>
              </tr>
            </thead>
            <tbody>
              {albums.data?.items.map((al) => (
                <tr key={al.id}>
                  <td>{al.artworkUrl ? <img className="thumb" src={al.artworkUrl} alt="" /> : <div className="thumb" />}</td>
                  <td>
                    {al.title}
                    <div className="muted">{al.artist?.name}</div>
                  </td>
                  <td>{formatDate(al.releaseDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <form className="card" onSubmit={addAlbum}>
          <h2>New album</h2>
          <div className="form">
            <label className="full">
              Title
              <input required value={album.title} onChange={(e) => setAlbum({ ...album, title: e.target.value })} />
            </label>
            <label className="full">
              Artist
              <select required value={album.artist} onChange={(e) => setAlbum({ ...album, artist: e.target.value })}>
                <option value="">Choose…</option>
                {artists.data?.items.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="full">
              Artwork URL
              <input type="url" value={album.artworkUrl} onChange={(e) => setAlbum({ ...album, artworkUrl: e.target.value })} placeholder="https://" />
            </label>
            <label>
              Release date
              <input type="date" value={album.releaseDate} onChange={(e) => setAlbum({ ...album, releaseDate: e.target.value })} />
            </label>
            <label>
              Label
              <input value={album.label} onChange={(e) => setAlbum({ ...album, label: e.target.value })} />
            </label>
            <button className="primary">Add album</button>
          </div>
        </form>
      </div>
    </>
  );
}
