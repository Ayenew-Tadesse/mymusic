/** Bottom sheet with actions for a song (long press or "⋮" on any row). */
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Alert, Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';
import { errorMessage } from '@/api/client';
import { itemArtwork, itemSubtitle, type MediaItem } from '@/api/types';
import { useAuth } from '@/auth/AuthProvider';
import { useFavorites } from '@/hooks/useFavorites';
import { offline, useDownloads } from '@/offline/manager';
import { usePlayer } from '@/player/store';
import { useTheme } from '@/theme/ThemeProvider';
import { font, radius, spacing } from '@/theme/colors';
import { Artwork, type IconName } from './ui';

const useMenu = create<{ item: MediaItem | null }>(() => ({ item: null }));
export const openTrackMenu = (item: MediaItem) => useMenu.setState({ item });
const close = () => useMenu.setState({ item: null });

export function TrackMenu() {
  const item = useMenu((s) => s.item);
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { isLiked, toggle } = useFavorites();
  const { isPremium } = useAuth();
  const downloaded = useDownloads((s) => (item?.kind === 'catalog' ? Boolean(s.entries[item.id]) : false));
  const downloading = useDownloads((s) => (item?.kind === 'catalog' ? Boolean(s.inProgress[item.id]) : false));

  if (!item) return null;

  const run = (fn: () => void) => () => {
    close();
    fn();
  };

  const actions: { icon: IconName; label: string; onPress: () => void; hidden?: boolean }[] = [
    { icon: isLiked(item) ? 'heart' : 'heart-outline', label: isLiked(item) ? 'Remove from Liked Songs' : 'Add to Liked Songs', onPress: run(() => toggle(item)) },
    { icon: 'add-circle-outline', label: 'Add to playlist', onPress: run(() => router.push({ pathname: '/add-to-playlist', params: { item: JSON.stringify(item) } })) },
    { icon: 'play-forward-outline', label: 'Play next', onPress: run(() => usePlayer.getState().playNext(item)) },
    { icon: 'list-outline', label: 'Add to queue', onPress: run(() => usePlayer.getState().addToQueue(item)) },
    {
      icon: downloaded ? 'trash-outline' : 'arrow-down-circle-outline',
      label: downloaded ? 'Remove download' : downloading ? 'Downloading…' : 'Download',
      hidden: item.kind !== 'catalog' || (!item.downloadable && !downloaded),
      onPress: run(() => {
        if (item.kind !== 'catalog') return;
        if (downloaded) offline.remove(item.id);
        else if (!isPremium) router.push('/premium');
        else offline.download(item).catch((e) => Alert.alert('Download failed', errorMessage(e)));
      }),
    },
    {
      icon: 'person-outline',
      label: 'Go to artist',
      hidden: item.kind !== 'catalog' || !item.artist,
      onPress: run(() => item.kind === 'catalog' && item.artist && router.push(`/artist/${item.artist.id}`)),
    },
    {
      icon: 'disc-outline',
      label: 'Go to album',
      hidden: item.kind !== 'catalog' || !item.album,
      onPress: run(() => item.kind === 'catalog' && item.album && router.push(`/album/${item.album.id}`)),
    },
    {
      icon: 'logo-youtube',
      label: 'Watch on YouTube',
      hidden: item.kind !== 'youtube',
      onPress: run(() => item.kind === 'youtube' && WebBrowser.openBrowserAsync(item.watchUrl)),
    },
  ];

  return (
    <Modal transparent animationType="slide" visible onRequestClose={close}>
      <Pressable style={{ flex: 1, backgroundColor: colors.overlay }} onPress={close} accessibilityLabel="Close menu" />
      <View style={{ backgroundColor: colors.elevated, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingBottom: insets.bottom + spacing.md }}>
        <View style={{ flexDirection: 'row', gap: spacing.md, padding: spacing.lg, borderBottomWidth: 1, borderColor: colors.border }}>
          <Artwork uri={itemArtwork(item)} size={48} />
          <View style={{ flex: 1, justifyContent: 'center' }}>
            <Text numberOfLines={1} style={[font.h3, { color: colors.text }]}>
              {item.title}
            </Text>
            <Text numberOfLines={1} style={{ color: colors.textSecondary }}>
              {itemSubtitle(item)}
            </Text>
          </View>
        </View>
        {actions
          .filter((a) => !a.hidden)
          .map((a) => (
            <Pressable
              key={a.label}
              onPress={a.onPress}
              accessibilityRole="button"
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: spacing.lg, paddingHorizontal: spacing.lg, paddingVertical: 14, backgroundColor: pressed ? colors.cardPressed : 'transparent' })}
            >
              <Ionicons name={a.icon} size={24} color={colors.textSecondary} />
              <Text style={[font.body, { color: colors.text }]}>{a.label}</Text>
            </Pressable>
          ))}
      </View>
    </Modal>
  );
}
