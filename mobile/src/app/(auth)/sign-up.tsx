import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text } from 'react-native';
import { Auth } from '@/api/endpoints';
import { errorMessage } from '@/api/client';
import { useAuth } from '@/auth/AuthProvider';
import { Button, Field } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { font, spacing } from '@/theme/colors';

export default function SignUp() {
  const { colors } = useTheme();
  const { completeSignIn } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (password.length < 10) return setError('Use at least 10 characters for your password.');
    setBusy(true);
    setError(null);
    try {
      await completeSignIn(await Auth.register(email.trim(), password, name.trim()));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const link = (url?: string) => url && WebBrowser.openBrowserAsync(url);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: spacing.xl }} keyboardShouldPersistTaps="handled">
        <Text style={[font.title, { color: colors.text, marginBottom: spacing.xl }]}>Create account</Text>
        <Field label="What should we call you?" value={name} onChangeText={setName} autoComplete="name" textContentType="name" maxLength={60} />
        <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" />
        <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" textContentType="newPassword" placeholder="At least 10 characters" />
        {error && <Text style={{ color: colors.danger, marginBottom: spacing.md }}>{error}</Text>}
        <Text style={{ color: colors.textSecondary, fontSize: 12, marginBottom: spacing.lg }}>
          By creating an account you agree to the{' '}
          <Text style={{ color: colors.accent }} onPress={() => link(process.env.EXPO_PUBLIC_TERMS_URL)}>
            Terms of Use
          </Text>{' '}
          and{' '}
          <Text style={{ color: colors.accent }} onPress={() => link(process.env.EXPO_PUBLIC_PRIVACY_URL)}>
            Privacy Policy
          </Text>
          , and to YouTube’s{' '}
          <Text style={{ color: colors.accent }} onPress={() => link('https://www.youtube.com/t/terms')}>
            Terms of Service
          </Text>{' '}
          for YouTube content.
        </Text>
        <Button title="Create account" onPress={submit} loading={busy} disabled={!name || !email || !password} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
