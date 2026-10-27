/**
 * Import a YouTube playlist into MyMusic: paste a link, preview it, choose a
 * new or existing playlist. Only video ids are saved; the playlist name is
 * whatever the user types (YouTube's title is just the suggestion).
 */
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { create } from 'zustand';
import { errorMessage } from '../api/client';
import { Playlists, YouTube, type YouTubePlaylistPreview } from '../api/endpoints';
import { keys, queryClient } from '../api/queryClient';
import { toast } from './overlays';
import { Artwork } from './ui';

type Open = { url?: string; targetId?: string } | null;
const useImport = create<{ open: Open }>(() => ({ open: null }));
export const openImportYouTube = (opts: { url?: string; targetId?: string } = {}) => useImport.setState({ open: opts });
const close = () => useImport.setState({ open: null });

/** True when the text looks like a YouTube link with a playlist in it. */
export const looksLikeYouTubePlaylist = (text: string) => /(youtube\.com|youtu\.be)\/.*[?&]list=[\w-]{10,}/i.test(text);

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function Dialog({ initialUrl, targetId }: { initialUrl: string; targetId?: string }) {
  const navigate = useNavigate();
  const [url, setUrl] = useState(initialUrl);
  const [preview, setPreview] = useState<YouTubePlaylistPreview | null>(null);
  const [mode, setMode] = useState<'new' | 'existing'>(targetId ? 'existing' : 'new');
  const [name, setName] = useState('');
  const [target, setTarget] = useState(targetId ?? '');
  const [busy, setBusy] = useState<'preview' | 'import' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { data: mine } = useQuery({ queryKey: keys.playlists, queryFn: Playlists.mine });
  const editable = (mine?.items ?? []).filter((p) => p.canEdit);

  async function find(e?: FormEvent) {
    e?.preventDefault();
    setBusy('preview');
    setError(null);
    setPreview(null);
    try {
      const p = await YouTube.playlist(url.trim());
      setPreview(p);
      setName((n) => n || p.title.slice(0, 100));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  // Opened with a link (e.g. pasted into Search): look it up straight away.
  useEffect(() => {
    if (initialUrl) void find();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runImport(e: FormEvent) {
    e.preventDefault();
    setBusy('import');
    setError(null);
    try {
      const r = await Playlists.importYouTube({ url: url.trim(), ...(mode === 'existing' ? { playlistId: target } : { name: name.trim() }) });
      queryClient.setQueryData(keys.playlist(r.playlist.id), r.playlist);
      queryClient.invalidateQueries({ queryKey: keys.playlists });
      const notes = [
        r.alreadyInPlaylist && `${plural(r.alreadyInPlaylist, 'song')} already there`,
        r.unavailable && `${plural(r.unavailable, 'video')} unavailable`,
        r.overLimit && `${r.overLimit} over the 1,000-song limit`,
      ].filter(Boolean);
      toast(`Added ${plural(r.added, 'song')}${notes.length ? ` (${notes.join(', ')})` : ''}`);
      close();
      navigate(`/playlist/${r.playlist.id}`);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(null);
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal aria-label="Import from YouTube" onClick={(e) => e.target === e.currentTarget && close()} onKeyDown={(e) => e.key === 'Escape' && close()}>
      <div className="modal" style={{ maxWidth: 520 }}>
        <h2>Import from YouTube</h2>
        <form onSubmit={find} style={{ display: 'flex', gap: 8 }}>
          <label htmlFor="yt-url" className="sr-only">
            YouTube playlist link
          </label>
          <input
            id="yt-url"
            className="input"
            autoFocus={!initialUrl}
            placeholder="https://www.youtube.com/playlist?list=…"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setPreview(null);
            }}
          />
          <button className="btn btn-secondary btn-sm" disabled={!url.trim() || busy !== null}>
            {busy === 'preview' ? 'Finding…' : 'Find'}
          </button>
        </form>
        <p className="muted small">Paste the link of a public or unlisted YouTube or YouTube Music playlist. Up to 500 songs.</p>

        {preview && (
          <form onSubmit={runImport}>
            <div style={{ display: 'flex', gap: 14, alignItems: 'center', padding: '12px 0', borderTop: '1px solid var(--border)', marginTop: 8 }}>
              <Artwork src={preview.thumbnailUrl} size={72} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700 }}>{preview.title}</div>
                <div className="muted small">{preview.channelTitle}</div>
                <div className="small" style={{ marginTop: 4 }}>
                  {plural(preview.playableCount, 'song')} can be played here
                  {preview.skipped ? `, ${preview.skipped} unavailable` : ''}
                  {preview.truncated ? ` (first 500 of ${preview.totalCount})` : ''}
                </div>
              </div>
            </div>

            <fieldset style={{ border: 0, padding: 0, margin: '8px 0 0', display: 'grid', gap: 10 }}>
              <legend className="small" style={{ fontWeight: 700, marginBottom: 6 }}>
                Save to
              </legend>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="radio" name="yt-mode" checked={mode === 'new'} onChange={() => setMode('new')} /> A new playlist
              </label>
              {mode === 'new' && (
                <input id="yt-name" className="input" aria-label="New playlist name" maxLength={100} value={name} onChange={(e) => setName(e.target.value)} required />
              )}
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', opacity: editable.length ? 1 : 0.5 }}>
                <input type="radio" name="yt-mode" checked={mode === 'existing'} disabled={!editable.length} onChange={() => setMode('existing')} /> One of my playlists
              </label>
              {mode === 'existing' && (
                <select id="yt-target" className="input" aria-label="Playlist" value={target} onChange={(e) => setTarget(e.target.value)} required>
                  <option value="">Choose a playlist…</option>
                  {editable.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.itemCount})
                    </option>
                  ))}
                </select>
              )}
            </fieldset>
            {error && <p className="error-text">{error}</p>}
            <div className="row">
              <button type="button" className="btn btn-secondary btn-sm" onClick={close}>
                Cancel
              </button>
              <button className="btn btn-primary btn-sm" disabled={busy !== null || !preview.playableCount || (mode === 'existing' && !target) || (mode === 'new' && !name.trim())}>
                {busy === 'import' ? 'Importing…' : `Import ${plural(preview.playableCount, 'song')}`}
              </button>
            </div>
          </form>
        )}
        {!preview && error && <p className="error-text">{error}</p>}
        {!preview && (
          <div className="row">
            <button type="button" className="btn btn-secondary btn-sm" onClick={close}>
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function ImportYouTubeHost() {
  const open = useImport((s) => s.open);
  if (!open) return null;
  return <Dialog key={open.url ?? ''} initialUrl={open.url ?? ''} targetId={open.targetId} />;
}
