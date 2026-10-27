import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Playlists } from '../api/endpoints';
import { errorMessage } from '../api/client';
import { keys, queryClient } from '../api/queryClient';
import { Empty, Spinner } from '../components/ui';

/** Accept a collaboration invite, then open the playlist. */
export default function JoinPlaylist() {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Playlists.join(token).then(
      ({ playlist }) => {
        queryClient.invalidateQueries({ queryKey: keys.playlists });
        navigate(`/playlist/${playlist.id}`, { replace: true });
      },
      (e) => setError(errorMessage(e)),
    );
  }, [token, navigate]);

  return error ? (
    <Empty icon="close" title="Couldn’t join playlist">
      <p>{error}</p>
    </Empty>
  ) : (
    <Spinner />
  );
}
