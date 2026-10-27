import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Playlists } from '@/api/endpoints';
import { errorMessage } from '@/api/client';
import { keys, queryClient } from '@/api/queryClient';
import { Button, Empty, Loading } from '@/components/ui';

/** Accept a collaboration invite link, then open the playlist. */
export default function Invite() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Playlists.join(token)
      .then(({ playlist }) => {
        queryClient.invalidateQueries({ queryKey: keys.playlists });
        router.replace(`/playlist/${playlist.id}`);
      })
      .catch((e) => setError(errorMessage(e)));
  }, [token]);

  if (!error) return <Loading />;
  return <Empty icon="link-outline" title="Couldn’t join playlist" body={error} action={<Button title="Go home" variant="secondary" onPress={() => router.replace('/')} />} />;
}
