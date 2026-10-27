import { Link } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text } from 'react-native';
import { Auth } from '@/api/endpoints';
import { errorMessage } from '@/api/client';
import { useAuth } from '@/auth/AuthProvider';
import { Button, Field } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { font, spacing } from '@/theme/colors';

export default function SignIn() {
  const { colors } = useTheme();
  const { completeSignIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await completeSignIn(await Auth.login(email.trim(), password));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: spacing.xl }} keyboardShouldPersistTaps="handled">
        <Text style={[font.title, { color: colors.text, marginBottom: spacing.xl }]}>Log in</Text>
        <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" />
        <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" textContentType="password" onSubmitEditing={submit} />
        {error && <Text style={{ color: colors.danger, marginBottom: spacing.md }}>{error}</Text>}
        <Button title="Log in" onPress={submit} loading={busy} disabled={!email || !password} />
        <Link href="/forgot-password" style={{ color: colors.text, textAlign: 'center', marginTop: spacing.xl, fontWeight: '600' }}>
          Forgot your password?
        </Link>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
