import { QueryClientProvider } from '@tanstack/react-query';
import NetInfo from '@react-native-community/netinfo';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { queryClient } from '@/api/queryClient';
import { AuthProvider, useAuth } from '@/auth/AuthProvider';
import { ActionSheetHost } from '@/components/ActionSheet';
import { TrackMenu } from '@/components/TrackMenu';
import { Loading } from '@/components/ui';
import { offline } from '@/offline/manager';
import { engine, setupPlayer } from '@/player/engine';
import { history } from '@/player/history';
import { checkSleepTimer, usePlayer } from '@/player/store';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';

/** App-wide background work: player setup, offline licence sync, history upload, sleep timer. */
function useBackgroundTasks(signedIn: boolean) {
  useEffect(() => {
    offline.init().catch(() => {});
    setupPlayer().catch(() => {});
    // The sleep timer must also fire for YouTube items, which have no playback service.
    const t = setInterval(checkSleepTimer, 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!signedIn) return;
    const syncAll = () => {
      history.flush();
      offline.sync().catch(() => {});
    };
    syncAll();
    const unsubNet = NetInfo.addEventListener((s) => s.isConnected && syncAll());
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') syncAll();
      // YouTube must not keep playing once the app is no longer in the foreground.
      if (state !== 'active' && usePlayer.getState().current()?.kind === 'youtube') void engine.pause();
    });
    return () => {
      unsubNet();
      sub.remove();
    };
  }, [signedIn]);
}

function RootNavigator() {
  const { status } = useAuth();
  const { colors, isDark } = useTheme();
  useBackgroundTasks(status === 'signedIn');

  if (status === 'loading') return <Loading />;
  const signedIn = status === 'signedIn';

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerShadowVisible: false,
          headerBackButtonDisplayMode: 'minimal',
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        </Stack.Protected>
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="player" options={{ presentation: 'fullScreenModal', headerShown: false, animation: 'slide_from_bottom' }} />
          <Stack.Screen name="queue" options={{ presentation: 'modal', title: 'Queue' }} />
          <Stack.Screen name="add-to-playlist" options={{ presentation: 'modal', title: 'Add to playlist' }} />
          <Stack.Screen name="playlist/[id]" options={{ title: '', headerTransparent: true }} />
          <Stack.Screen name="album/[id]" options={{ title: '', headerTransparent: true }} />
          <Stack.Screen name="artist/[id]" options={{ title: '', headerTransparent: true }} />
          <Stack.Screen name="invite/[token]" options={{ title: 'Join playlist' }} />
          <Stack.Screen name="favorites" options={{ title: 'Liked Songs' }} />
          <Stack.Screen name="history" options={{ title: 'Recently played' }} />
          <Stack.Screen name="downloads" options={{ title: 'Downloads' }} />
          <Stack.Screen name="settings" options={{ title: 'Settings' }} />
          <Stack.Screen name="premium" options={{ presentation: 'modal', title: 'MyMusic Premium' }} />
        </Stack.Protected>
        {/* Shared playlists open for everyone; signed-out users are asked to sign in to play. */}
        <Stack.Screen name="shared/[shareId]" options={{ title: '', headerTransparent: true }} />
      </Stack>
      {signedIn && <TrackMenu />}
      <ActionSheetHost />
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <RootNavigator />
          </AuthProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
