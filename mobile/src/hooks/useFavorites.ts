import { useMutation, useQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { Library } from '@/api/endpoints';
import { keys, queryClient } from '@/api/queryClient';
import { itemRef, type MediaItem } from '@/api/types';

type Ids = { trackIds: string[]; videoIds: string[] };

/** Liked state for every item, with optimistic toggling. */
export function useFavorites() {
  const { data } = useQuery({ queryKey: keys.favoriteIds, queryFn: Library.favoriteIds, staleTime: 5 * 60_000 });

  const isLiked = (item: MediaItem) =>
    item.kind === 'catalog' ? Boolean(data?.trackIds.includes(item.id)) : Boolean(data?.videoIds.includes(item.videoId));

  const toggle = useMutation({
    mutationFn: async (item: MediaItem) => (isLiked(item) ? Library.unlike(itemRef(item)) : Library.like(itemRef(item))),
    onMutate: async (item) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      await queryClient.cancelQueries({ queryKey: keys.favoriteIds });
      const prev = queryClient.getQueryData<Ids>(keys.favoriteIds);
      const liked = isLiked(item);
      queryClient.setQueryData<Ids>(keys.favoriteIds, (old = { trackIds: [], videoIds: [] }) => {
        if (item.kind === 'catalog') {
          return { ...old, trackIds: liked ? old.trackIds.filter((id) => id !== item.id) : [...old.trackIds, item.id] };
        }
        return { ...old, videoIds: liked ? old.videoIds.filter((id) => id !== item.videoId) : [...old.videoIds, item.videoId] };
      });
      return { prev };
    },
    onError: (_e, _item, ctx) => ctx?.prev && queryClient.setQueryData(keys.favoriteIds, ctx.prev),
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.favorites }),
  });

  return { isLiked, toggle: (item: MediaItem) => toggle.mutate(item) };
}
