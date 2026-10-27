/** Full-screen Now Playing. */
import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { Alert, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { errorMessage } from '@/api/client';
import { itemSubtitle } from '@/api/types';
import { useAuth } from '@/auth/AuthProvider';
import { showActionSheet } from '@/components/ActionSheet';
import { openTrackMenu } from '@/components/TrackMenu';
import { Artwork, Empty, IconButton } from '@/components/ui';
import { useFavorites } from '@/hooks/useFavorites';
import { offline, useDownloads } from '@/offline/manager';
import { usePlayer } from '@/player/store';
import { YouTubeView } from '@/player/YouTubeView';
import { useTheme } from '@/theme/ThemeProvider';
import { font, spacing } from '@/theme/colors';
import { formatDuration } from '@/utils/format';

function SleepTimerLabel() {
  const sleepAt = usePlayer((s) => s.sleepAt);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const { colors } = useTheme();
  if (!sleepAt) return null;
  const label = sleepAt === 'end' ? 'End of track' : formatDuration((sleepAt - now) / 1000);
  return <Text style={{ color: colors.accent, fontSize: 12, fontWeight: '600' }}>{label}</Text>;
}

export default function PlayerScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { isPremium } = useAuth();
  const item = usePlayer((s) => s.queue[s.index]);
  const { status, position, duration, shuffle, repeat, error, context, sleepAt } = usePlayer();
  const { togglePlay, next, previous, seekTo, toggleShuffle, cycleRepeat, setSleepTimer } = usePlayer.getState();
  const { isLiked, toggle } = useFavorites();
  const [scrub, setScrub] = useState<number | null>(null);
  const downloaded = useDownloads((s) => (item?.kind === 'catalog' ? Boolean(s.entries[item.id]) : false));
  const downloading = useDownloads((s) => (item?.kind === 'catalog' ? Boolean(s.inProgress[item.id]) : false));

  if (!item) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
        <IconButton name="chevron-down" label="Close" onPress={() => router.back()} />
        <Empty icon="musical-notes-outline" title="Nothing playing" />
      </View>
    );
  }

  const playing = status === 'playing' || status === 'loading';
  const total = duration || item.durationSec;
  const art = Math.min(width - spacing.xl * 2, 380);

  const sleepMenu = () =>
    showActionSheet('Sleep timer', [
      ...[5, 15, 30, 45, 60].map((m) => ({ label: `${m} minutes`, onPress: () => setSleepTimer(m) })),
      { label: 'End of track', onPress: () => setSleepTimer('end'), selected: sleepAt === 'end' },
      ...(sleepAt ? [{ label: 'Turn off timer', destructive: true, onPress: () => setSleepTimer(null) }] : []),
    ]);

  const download = () => {
    if (item.kind !== 'catalog') return;
    if (downloaded) return offline.remove(item.id);
    if (!isPremium) return router.push('/premium');
    offline.download(item).catch((e) => Alert.alert('Download failed', errorMessage(e)));
  };

  const liked = isLiked(item);
  const contextLabel = context ? { playlist: 'Playing from playlist', album: 'Playing from album', artist: 'Playing from artist', search: 'Playing from search', favorites: 'Playing from Liked Songs', history: 'Playing from history', other: 'Now playing' }[context.type] : 'Now playing';

  return (
    <LinearGradient colors={[colors.gradientTop, colors.background]} locations={[0, 0.7]} style={{ flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom + spacing.md, paddingHorizontal: spacing.xl }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.sm }}>
        <IconButton name="chevron-down" label="Close player" onPress={() => router.back()} />
        <Text style={{ color: colors.text, fontWeight: '700', fontSize: 12, letterSpacing: 1, textTransform: 'uppercase' }}>{contextLabel}</Text>
        <IconButton name="ellipsis-horizontal" label="More options" onPress={() => openTrackMenu(item)} />
      </View>

      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        {item.kind === 'youtube' ? (
          <YouTubeView key={item.videoId} videoId={item.videoId} />
        ) : (
          <Artwork uri={item.artworkUrl} size={art} style={{ shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 24, shadowOffset: { width: 0, height: 12 } }} />
        )}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: spacing.lg }}>
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={[font.h2, { color: colors.text }]}>
            {item.title}
          </Text>
          <Pressable disabled={item.kind !== 'catalog' || !item.artist} onPress={() => item.kind === 'catalog' && item.artist && (router.back(), router.push(`/artist/${item.artist.id}`))}>
            <Text numberOfLines={1} style={{ color: colors.textSecondary, fontSize: 16, marginTop: 2 }}>
              {itemSubtitle(item)}
            </Text>
          </Pressable>
        </View>
        <IconButton name={liked ? 'heart' : 'heart-outline'} label={liked ? 'Remove from Liked Songs' : 'Add to Liked Songs'} size={28} active={liked} onPress={() => toggle(item)} />
      </View>

      {item.kind === 'catalog' && item.attribution && <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: spacing.xs }}>{item.attribution}</Text>}
      {item.kind === 'youtube' && (
        <Pressable onPress={() => WebBrowser.openBrowserAsync(item.watchUrl)} accessibilityRole="link">
          <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: spacing.xs }}>Playing from YouTube · Watch on YouTube ›</Text>
        </Pressable>
      )}
      {error && <Text style={{ color: colors.danger, marginTop: spacing.xs }}>{error}</Text>}

      <Slider
        style={{ marginTop: spacing.md, marginHorizontal: -8 }}
        minimumValue={0}
        maximumValue={Math.max(1, total)}
        value={scrub ?? position}
        onValueChange={setScrub}
        onSlidingComplete={(v) => {
          setScrub(null);
          seekTo(v);
        }}
        minimumTrackTintColor={colors.text}
        maximumTrackTintColor={colors.border}
        thumbTintColor={colors.text}
        accessibilityLabel="Seek"
      />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{formatDuration(scrub ?? position)}</Text>
        <Text style={{ color: colors.textSecondary, fontSize: 12 }}>-{formatDuration(Math.max(0, total - (scrub ?? position)))}</Text>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.md }}>
        <IconButton name="shuffle" label={shuffle ? 'Shuffle on' : 'Shuffle off'} active={shuffle} size={26} onPress={toggleShuffle} />
        <IconButton name="play-skip-back" label="Previous" size={34} onPress={() => previous()} />
        <Pressable
          onPress={() => togglePlay()}
          accessibilityRole="button"
          accessibilityLabel={playing ? 'Pause' : 'Play'}
          style={({ pressed }) => ({ width: 68, height: 68, borderRadius: 34, backgroundColor: colors.text, alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.95 : 1 }] })}
        >
          <Ionicons name={playing ? 'pause' : 'play'} size={34} color={colors.background} style={{ marginLeft: playing ? 0 : 3 }} />
        </Pressable>
        <IconButton name="play-skip-forward" label="Next" size={34} onPress={() => next()} />
        <View>
          <IconButton name="repeat" label={`Repeat ${repeat}`} active={repeat !== 'off'} size={26} onPress={cycleRepeat} />
          {repeat === 'one' && <Text style={{ position: 'absolute', right: -2, top: -2, color: colors.accent, fontSize: 10, fontWeight: '800' }}>1</Text>}
        </View>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <IconButton name="moon-outline" label="Sleep timer" active={Boolean(sleepAt)} size={22} onPress={sleepMenu} />
          <SleepTimerLabel />
        </View>
        {item.kind === 'catalog' && (item.downloadable || downloaded) && (
          <IconButton
            name={downloaded ? 'arrow-down-circle' : downloading ? 'cloud-download-outline' : 'arrow-down-circle-outline'}
            label={downloaded ? 'Remove download' : 'Download'}
            active={downloaded}
            size={24}
            onPress={download}
          />
        )}
        <IconButton name="list" label="Queue" size={24} onPress={() => router.push('/queue')} />
      </View>
    </LinearGradient>
  );
}
