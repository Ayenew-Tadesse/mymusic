/** Welcome screen with every sign-in option. */
import { Ionicons } from '@expo/vector-icons';
import * as AppleAuthentication from 'expo-apple-authentication';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Platform, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { errorMessage } from '@/api/client';
import { useAuth } from '@/auth/AuthProvider';
import { appleAvailable, signInWithApple, useGoogleIdToken } from '@/auth/social';
import { Button } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { font, spacing } from '@/theme/colors';

export default function Welcome() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { completeSignIn } = useAuth();
  const google = useGoogleIdToken();
  const [hasApple, setHasApple] = useState(false);
  const [busy, setBusy] = useState<'google' | 'apple' | null>(null);

  useEffect(() => {
    appleAvailable().then(setHasApple);
  }, []);

  async function social(kind: 'google' | 'apple') {
    setBusy(kind);
    try {
      const session = kind === 'google' ? await google.signIn() : await signInWithApple();
      if (session) await completeSignIn(session);
    } catch (e) {
      Alert.alert('Sign-in failed', errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <LinearGradient colors={[colors.gradientTop, colors.background]} locations={[0, 0.6]} style={{ flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom + spacing.lg }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg, paddingHorizontal: spacing.xl }}>
        <Ionicons name="musical-notes" size={64} color={colors.accent} />
        <Text style={[font.title, { color: colors.text, textAlign: 'center', fontSize: 32 }]}>Millions of songs.{'\n'}Free on MyMusic.</Text>
      </View>
      <View style={{ paddingHorizontal: spacing.xl, gap: spacing.md }}>
        <Button title="Sign up free" onPress={() => router.push('/sign-up')} />
        {google.ready && (
          <Button title="Continue with Google" variant="secondary" loading={busy === 'google'} icon={<Ionicons name="logo-google" size={18} color={colors.text} />} onPress={() => social('google')} />
        )}
        {Platform.OS === 'ios' && hasApple && (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
            buttonStyle={isDark ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
            cornerRadius={999}
            style={{ height: 48 }}
            onPress={() => social('apple')}
          />
        )}
        <Button title="Log in" variant="ghost" onPress={() => router.push('/sign-in')} />
      </View>
    </LinearGradient>
  );
}
