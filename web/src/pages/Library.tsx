/** Library page (used on small screens where the sidebar is hidden). */
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { Playlists } from '../api/endpoints';
import { keys, queryClient } from '../api/queryClient';
import { errorMessage } from '../api/client';
import { Icon } from '../components/Icon';
import { openMenu, prompt, toast } from '../components/overlays';
import { openImportYouTube } from '../components/ImportYouTube';
import { useConfig } from '../hooks/useConfig';
import { Artwork, IconButton } from '../components/ui';

export default function LibraryPage() {
  const navigate = useNavigate();
  const { data } = useQuery({ queryKey: keys.playlists, queryFn: Playlists.mine });
  const config = useConfig();

  async function create() {
    const name = await prompt('Give your playlist a name', 'My playlist', 'Create');
    if (!name) return;
    try {
      const { playlist } = await Playlists.create(name);
      queryClient.invalidateQueries({ queryKey: keys.playlists });
      navigate(`/playlist/${playlist.id}`);
    } catch (e) {
      toast(errorMessage(e));
    }
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="page-title">Your Library</h1>
        <IconButton
          icon="add"
          label="Create playlist or import"
          size={28}
          onClick={(e) =>
            openMenu(e, [
              { label: 'Create playlist', onSelect: create },
              { label: 'Import from YouTube…', hidden: !config?.youtubeEnabled, onSelect: () => openImportYouTube() },
            ])
          }
        />
      </div>
      <Link to="/collection/tracks" className="lib-item">
        <div className="art" style={{ width: 56, height: 56, borderRadius: 4, background: 'linear-gradient(135deg,#450af5,#c4efd9)', color: '#fff' }}>
          <Icon name="heart" />
        </div>
        <div className="meta">
          <div className="title">Liked Songs</div>
          <div className="sub">Playlist</div>
        </div>
      </Link>
      <Link to="/history" className="lib-item">
        <div className="art" style={{ width: 56, height: 56, borderRadius: 4, background: 'linear-gradient(135deg,#e8115b,#5f0b2b)', color: '#fff' }}>
          <Icon name="history" />
        </div>
        <div className="meta">
          <div className="title">Recently played</div>
          <div className="sub">History</div>
        </div>
      </Link>
      {data?.items.map((p) => (
        <Link key={p.id} to={`/playlist/${p.id}`} className="lib-item">
          <Artwork src={p.coverUrl} size={56} />
          <div className="meta">
            <div className="title">{p.name}</div>
            <div className="sub">Playlist · {p.isOwner ? 'You' : p.owner.displayName}</div>
          </div>
        </Link>
      ))}
    </>
  );
}
