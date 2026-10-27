import { useMutation, useQuery } from '@tanstack/react-query';
import { Library } from '../api/endpoints';
import { keys, queryClient } from '../api/queryClient';
import { itemRef, type MediaItem } from '../api/types';
import { toast } from '../components/overlays';

type Ids = { trackIds: string[]; videoIds: string[] };

/** Liked state for any item, with optimistic toggling. */
export function useFavorites() {
  const { data } = useQuery({ queryKey: keys.favoriteIds, queryFn: Library.favoriteIds, staleTime: 5 * 60_000 });
  const isLiked = (i: MediaItem) => (i.kind === 'catalog' ? Boolean(data?.trackIds.includes(i.id)) : Boolean(data?.videoIds.includes(i.videoId)));

  const m = useMutation({
    mutationFn: (i: MediaItem) => (isLiked(i) ? Library.unlike(itemRef(i)) : Library.like(itemRef(i))),
    onMutate: async (i) => {
      await queryClient.cancelQueries({ queryKey: keys.favoriteIds });
      const prev = queryClient.getQueryData<Ids>(keys.favoriteIds);
      const liked = isLiked(i);
      queryClient.setQueryData<Ids>(keys.favoriteIds, (old = { trackIds: [], videoIds: [] }) =>
        i.kind === 'catalog'
          ? { ...old, trackIds: liked ? old.trackIds.filter((x) => x !== i.id) : [...old.trackIds, i.id] }
          : { ...old, videoIds: liked ? old.videoIds.filter((x) => x !== i.videoId) : [...old.videoIds, i.videoId] },
      );
      toast(liked ? 'Removed from Liked Songs' : 'Added to Liked Songs');
      return { prev };
    },
    onError: (_e, _i, ctx) => ctx?.prev && queryClient.setQueryData(keys.favoriteIds, ctx.prev),
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.favorites }),
  });

  return { isLiked, toggle: (i: MediaItem) => m.mutate(i) };
}
