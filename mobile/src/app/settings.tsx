import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import Constants from 'expo-constants';
import { useState, type ReactNode } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Auth, Me } from '@/api/endpoints';
import { errorMessage } from '@/api/client';
import { useAuth } from '@/auth/AuthProvider';
import { PromptModal } from '@/components/PromptModal';
import { offline } from '@/offline/manager';
import { useTheme, type ThemePreference } from '@/theme/ThemeProvider';
import { font, radius, spacing } from '@/theme/colors';

function Section({ title, children }: { title: string; children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ marginTop: spacing.xl }}>
      <Text style={[font.h3, { color: colors.text, marginBottom: spacing.sm, paddingHorizontal: spacing.lg }]}>{title}</Text>
      {children}
    </View>
  );
}

function Item({ label, value, onPress, danger }: { label: string; value?: string; onPress?: () => void; danger?: boolean }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : undefined} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: 14, backgroundColor: pressed ? colors.cardPressed : 'transparent' })}>
      <Text style={{ flex: 1, color: danger ? colors.danger : colors.text, fontSize: 16 }}>{label}</Text>
      {value && <Text style={{ color: colors.textSecondary, marginRight: spacing.sm }}>{value}</Text>}
      {onPress && !danger && <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />}
    </Pressable>
  );
}

export default function Settings() {
  const { colors, preference, setPreference } = useTheme();
  const { user, setUser, signOut } = useAuth();
  const [editingName, setEditingName] = useState(false);
  if (!user) return null;

  const open = (url?: string) => url && WebBrowser.openBrowserAsync(url);

  const choose = (p: ThemePreference) => {
    setPreference(p);
    Me.update({ preferences: { theme: p } }).then((r) => setUser(r.user), () => {});
  };

  const deleteAccount = () =>
    Alert.alert('Delete your account?', 'Your playlists, likes, history and downloads will be permanently deleted and any subscription cancelled.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await Me.delete();
            await offline.removeAll();
            await signOut();
          } catch (e) {
            Alert.alert('Couldn’t delete account', errorMessage(e));
          }
        },
      },
    ]);

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ paddingBottom: spacing.xxl }}>
      <Section title="Account">
        <Item label="Name" value={user.displayName} onPress={() => setEditingName(true)} />
        <Item label="Email" value={user.email ?? 'Hidden'} />
        {user.email && !user.emailVerified && (
          <Item label="Resend verification email" onPress={() => Auth.resendVerification().then(() => Alert.alert('Check your inbox'), (e) => Alert.alert('Error', errorMessage(e)))} />
        )}
        <Item label="Plan" value={user.subscription.plan === 'free' ? 'Free' : user.subscription.plan === 'family' ? 'Family' : 'Premium'} onPress={() => router.push('/premium')} />
      </Section>

      <Section title="Appearance">
        <View style={{ flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg }}>
          {(['system', 'dark', 'light'] as const).map((p) => (
            <Pressable
              key={p}
              onPress={() => choose(p)}
              accessibilityRole="radio"
              accessibilityState={{ selected: preference === p }}
              style={{ flex: 1, paddingVertical: spacing.md, borderRadius: radius.pill, alignItems: 'center', backgroundColor: preference === p ? colors.accent : colors.card }}
            >
              <Text style={{ color: preference === p ? colors.accentText : colors.text, fontWeight: '600', textTransform: 'capitalize' }}>{p}</Text>
            </Pressable>
          ))}
        </View>
      </Section>

      <Section title="Storage">
        <Item label="Downloads" onPress={() => router.push('/downloads')} />
      </Section>

      <Section title="About">
        <Item label="Terms of Use" onPress={() => open(process.env.EXPO_PUBLIC_TERMS_URL)} />
        <Item label="Privacy Policy" onPress={() => open(process.env.EXPO_PUBLIC_PRIVACY_URL)} />
        {/* Required by the YouTube API Services Terms for apps that use YouTube API data. */}
        <Item label="YouTube Terms of Service" onPress={() => open('https://www.youtube.com/t/terms')} />
        <Item label="Google Privacy Policy" onPress={() => open('https://policies.google.com/privacy')} />
        <Item label="Version" value={Constants.expoConfig?.version ?? '1.0.0'} />
      </Section>

      <Section title="Session">
        <Item label="Log out" onPress={() => signOut()} />
        <Item label="Log out of all devices" onPress={() => signOut({ everywhere: true })} />
        <Item label="Delete account" danger onPress={deleteAccount} />
      </Section>

      <PromptModal
        visible={editingName}
        title="Your name"
        initial={user.displayName}
        onCancel={() => setEditingName(false)}
        onSubmit={(displayName) => {
          setEditingName(false);
          Me.update({ displayName }).then((r) => setUser(r.user), (e) => Alert.alert('Error', errorMessage(e)));
        }}
      />
    </ScrollView>
  );
}
