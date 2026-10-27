/** Modal for choosing (or creating) a playlist to add a song to. */
import { useQuery } from '@tanstack/react-query';
import { create } from 'zustand';
import { errorMessage } from '../api/client';
import { Playlists } from '../api/endpoints';
import { keys, queryClient } from '../api/queryClient';
import type { ItemRef } from '../api/types';
import { prompt, toast } from './overlays';
import { Artwork, Spinner } from './ui';

const useAdd = create<{ item: ItemRef | null }>(() => ({ item: null }));
export const openAddToPlaylist = (item: ItemRef) => useAdd.setState({ item });
const close = () => useAdd.setState({ item: null });

export function AddToPlaylistHost() {
  const item = useAdd((s) => s.item);
  const { data, isLoading } = useQuery({ queryKey: keys.playlists, queryFn: Playlists.mine, enabled: Boolean(item) });
  if (!item) return null;

  async function add(id: string, name: string) {
    close();
    try {
      const { playlist } = await Playlists.addItems(id, [item!]);
      queryClient.setQueryData(keys.playlist(id), playlist);
      queryClient.invalidateQueries({ queryKey: keys.playlists });
      toast(`Added to ${name}`);
    } catch (e) {
      toast(errorMessage(e));
    }
  }

  async function createAndAdd() {
    const name = await prompt('New playlist', 'My playlist', 'Create');
    if (!name) return;
    try {
      const { playlist } = await Playlists.create(name);
      await add(playlist.id, playlist.name);
    } catch (e) {
      toast(errorMessage(e));
    }
  }

  const editable = (data?.items ?? []).filter((p) => p.canEdit);
  return (
    <div className="modal-backdrop" role="dialog" aria-modal aria-label="Add to playlist" onClick={(e) => e.target === e.currentTarget && close()} onKeyDown={(e) => e.key === 'Escape' && close()}>
      <div className="modal" style={{ maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
        <h2>Add to playlist</h2>
        <button className="btn btn-primary btn-sm" style={{ alignSelf: 'flex-start', marginBottom: 12 }} onClick={createAndAdd}>
          New playlist
        </button>
        <div style={{ overflowY: 'auto' }}>
          {isLoading && <Spinner />}
          {editable.map((p) => (
            <button key={p.id} className="lib-item" style={{ width: '100%', textAlign: 'left' }} onClick={() => add(p.id, p.name)}>
              <Artwork src={p.coverUrl} size={44} />
              <span className="meta">
                <span className="title" style={{ display: 'block' }}>
                  {p.name}
                </span>
                <span className="sub">{p.itemCount} songs</span>
              </span>
            </button>
          ))}
        </div>
        <div className="row">
          <button className="btn btn-secondary btn-sm" onClick={close}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
