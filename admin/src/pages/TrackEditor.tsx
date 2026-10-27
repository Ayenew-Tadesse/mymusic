import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, uploadFile, ApiError, type Page } from '../api';
import type { Album, Artist, Rights, Track } from '../types';

type Form = {
  title: string;
  artist: string;
  album: string;
  trackNumber: string;
  durationSec: string;
  genres: string;
  explicit: boolean;
  isrc: string;
  artworkUrl: string;
  audioKey: string;
  audioMimeType: string;
  freeTier: boolean;
  rights: Rights & { territoriesText: string };
};

const empty: Form = {
  title: '',
  artist: '',
  album: '',
  trackNumber: '',
  durationSec: '',
  genres: '',
  explicit: false,
  isrc: '',
  artworkUrl: '',
  audioKey: '',
  audioMimeType: 'audio/mpeg',
  freeTier: true,
  rights: {
    licenseType: 'owned',
    licensor: '',
    licenseReference: '',
    attribution: '',
    territories: ['WW'],
    territoriesText: 'WW',
    streamAllowed: true,
    offlineAllowed: false,
    validFrom: new Date().toISOString().slice(0, 10),
    validUntil: '',
  },
};

/** Read the duration of a local audio file in the browser. */
function audioDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const el = new Audio();
    el.preload = 'metadata';
    el.onloadedmetadata = () => {
      resolve(Math.round(el.duration));
      URL.revokeObjectURL(el.src);
    };
    el.onerror = () => resolve(0);
    el.src = URL.createObjectURL(file);
  });
}

export default function TrackEditor() {
  const { id } = useParams();
  const nav = useNavigate();
  const [form, setForm] = useState<Form>(empty);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Page<Artist>>('/admin/artists?limit=100').then((r) => setArtists(r.items));
    api<Page<Album>>('/admin/albums?limit=100').then((r) => setAlbums(r.items));
    if (!id) return;
    api<{ track: Track }>(`/admin/tracks/${id}`).then(({ track: t }) =>
      setForm({
        title: t.title,
        artist: t.artist.id,
        album: t.album?.id ?? '',
        trackNumber: t.trackNumber ? String(t.trackNumber) : '',
        durationSec: String(t.durationSec),
        genres: t.genres.join(', '),
        explicit: t.explicit,
        isrc: t.isrc ?? '',
        artworkUrl: t.artworkUrl ?? '',
        audioKey: '', // keep the existing file unless a new one is uploaded
        audioMimeType: t.audioMimeType,
        freeTier: t.freeTier,
        rights: {
          ...t.rights,
          territoriesText: t.rights.territories.join(', '),
          validFrom: t.rights.validFrom?.slice(0, 10),
          validUntil: t.rights.validUntil?.slice(0, 10) ?? '',
        },
      }),
    );
  }, [id]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const setRights = <K extends keyof Form['rights']>(k: K, v: Form['rights'][K]) => setForm((f) => ({ ...f, rights: { ...f.rights, [k]: v } }));

  async function onAudio(file?: File) {
    if (!file) return;
    setBusy('Uploading audio…');
    setError(null);
    try {
      const [up, duration] = await Promise.all([uploadFile(file, 'audio'), audioDuration(file)]);
      setForm((f) => ({ ...f, audioKey: up.key, audioMimeType: file.type, durationSec: duration ? String(duration) : f.durationSec }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function onArtwork(file?: File) {
    if (!file) return;
    setBusy('Uploading artwork…');
    try {
      const up = await uploadFile(file, 'image');
      if (up.publicUrl) set('artworkUrl', up.publicUrl);
      else setError('Artwork uploaded, but ASSET_PUBLIC_BASE_URL is not configured on the API');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const r = form.rights;
    const body = {
      title: form.title,
      artist: form.artist,
      album: form.album || null,
      trackNumber: form.trackNumber ? Number(form.trackNumber) : undefined,
      durationSec: Number(form.durationSec),
      genres: form.genres.split(',').map((g) => g.trim()).filter(Boolean),
      explicit: form.explicit,
      isrc: form.isrc || undefined,
      artworkUrl: form.artworkUrl || undefined,
      ...(form.audioKey && { audioKey: form.audioKey, audioMimeType: form.audioMimeType }),
      freeTier: form.freeTier,
      rights: {
        licenseType: r.licenseType,
        licensor: r.licensor,
        licenseReference: r.licenseReference || undefined,
        attribution: r.attribution || undefined,
        territories: r.territoriesText.split(',').map((t) => t.trim().toUpperCase()).filter(Boolean),
        streamAllowed: r.streamAllowed,
        offlineAllowed: r.offlineAllowed,
        validFrom: r.validFrom || undefined,
        validUntil: r.validUntil || null,
      },
    };
    setBusy('Saving…');
    try {
      if (id) await api(`/admin/tracks/${id}`, { method: 'PATCH', json: body });
      else await api('/admin/tracks', { method: 'POST', json: body });
      nav('/tracks');
    } catch (err) {
      const details = err instanceof ApiError && err.details ? `: ${err.details.map((d) => `${d.path} ${d.message}`).join('; ')}` : '';
      setError(`${(err as Error).message}${details}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <form onSubmit={submit}>
      <h1>{id ? 'Edit track' : 'Add track'}</h1>
      <div className="card" style={{ marginBottom: 16 }}>
        <h2>Metadata</h2>
        <div className="form">
          <label className="full">
            Title
            <input required value={form.title} onChange={(e) => set('title', e.target.value)} />
          </label>
          <label>
            Artist
            <select required value={form.artist} onChange={(e) => set('artist', e.target.value)}>
              <option value="">Choose…</option>
              {artists.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Album
            <select value={form.album} onChange={(e) => set('album', e.target.value)}>
              <option value="">Single / none</option>
              {albums
                .filter((al) => !form.artist || al.artist?.id === form.artist)
                .map((al) => (
                  <option key={al.id} value={al.id}>
                    {al.title}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Track number
            <input type="number" min={1} value={form.trackNumber} onChange={(e) => set('trackNumber', e.target.value)} />
          </label>
          <label>
            Duration (seconds)
            <input type="number" min={1} required value={form.durationSec} onChange={(e) => set('durationSec', e.target.value)} />
          </label>
          <label>
            Genres (comma separated)
            <input value={form.genres} onChange={(e) => set('genres', e.target.value)} />
          </label>
          <label>
            ISRC
            <input value={form.isrc} onChange={(e) => set('isrc', e.target.value.toUpperCase())} placeholder="USRC17607839" />
          </label>
          <label className="check">
            <input type="checkbox" checked={form.explicit} onChange={(e) => set('explicit', e.target.checked)} /> Explicit
          </label>
          <label className="check">
            <input type="checkbox" checked={form.freeTier} onChange={(e) => set('freeTier', e.target.checked)} /> Available on the free plan
          </label>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h2>Files</h2>
        <div className="form">
          <label>
            Audio file {id && <span className="muted">(leave empty to keep current)</span>}
            <input type="file" accept="audio/mpeg,audio/mp4,audio/aac,audio/flac" onChange={(e) => onAudio(e.target.files?.[0])} required={!id} />
            {form.audioKey && <span className="muted">Uploaded ✓</span>}
          </label>
          <label>
            Artwork
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => onArtwork(e.target.files?.[0])} />
          </label>
          <label className="full">
            Artwork URL
            <input type="url" value={form.artworkUrl} onChange={(e) => set('artworkUrl', e.target.value)} placeholder="https://" />
          </label>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h2>Rights & licence</h2>
        <p className="muted">Required. Tracks can only be streamed and downloaded within these terms.</p>
        <div className="form">
          <label>
            Licence type
            <select value={form.rights.licenseType} onChange={(e) => setRights('licenseType', e.target.value as Rights['licenseType'])}>
              <option value="owned">Owned by us</option>
              <option value="licensed">Licensed from rights holder</option>
              <option value="creative_commons">Creative Commons</option>
              <option value="public_domain">Public domain</option>
            </select>
          </label>
          <label>
            Licensor
            <input required value={form.rights.licensor} onChange={(e) => setRights('licensor', e.target.value)} placeholder="Label / rights holder" />
          </label>
          <label>
            Contract / licence reference
            <input value={form.rights.licenseReference ?? ''} onChange={(e) => setRights('licenseReference', e.target.value)} placeholder="Contract id or CC licence URL" />
          </label>
          <label>
            Territories (ISO codes, WW = worldwide)
            <input value={form.rights.territoriesText} onChange={(e) => setRights('territoriesText', e.target.value)} />
          </label>
          <label>
            Valid from
            <input type="date" value={form.rights.validFrom ?? ''} onChange={(e) => setRights('validFrom', e.target.value)} />
          </label>
          <label>
            Valid until
            <input type="date" value={form.rights.validUntil ?? ''} onChange={(e) => setRights('validUntil', e.target.value)} />
          </label>
          <label className="full">
            Attribution shown to listeners
            <input value={form.rights.attribution ?? ''} onChange={(e) => setRights('attribution', e.target.value)} placeholder="Required for CC BY licences" />
          </label>
          <label className="check">
            <input type="checkbox" checked={form.rights.streamAllowed} onChange={(e) => setRights('streamAllowed', e.target.checked)} /> Streaming allowed
          </label>
          <label className="check">
            <input type="checkbox" checked={form.rights.offlineAllowed} onChange={(e) => setRights('offlineAllowed', e.target.checked)} /> Offline downloads allowed
          </label>
        </div>
      </div>

      {error && <div className="error">{error}</div>}
      <div className="toolbar">
        <button className="primary" disabled={Boolean(busy)}>
          {busy ?? (id ? 'Save changes' : 'Create draft')}
        </button>
        <button type="button" onClick={() => nav('/tracks')}>
          Cancel
        </button>
        {!id && <span className="muted">New tracks start as drafts; publish them from the list.</span>}
      </div>
    </form>
  );
}
