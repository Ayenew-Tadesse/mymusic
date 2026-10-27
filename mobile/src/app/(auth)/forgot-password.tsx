import { useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { Auth } from '@/api/endpoints';
import { errorMessage } from '@/api/client';
import { Button, Field } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { font, spacing } from '@/theme/colors';

export default function ForgotPassword() {
  const { colors } = useTheme();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await Auth.forgotPassword(email.trim());
      setSent(true);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.xl }} keyboardShouldPersistTaps="handled">
      <Text style={[font.title, { color: colors.text, marginBottom: spacing.md }]}>Reset password</Text>
      {sent ? (
        <Text style={[font.body, { color: colors.textSecondary }]}>If an account exists for {email}, we’ve emailed a link to reset your password. It’s valid for 30 minutes.</Text>
      ) : (
        <>
          <Text style={[font.body, { color: colors.textSecondary, marginBottom: spacing.xl }]}>Enter your email and we’ll send you a link to choose a new password.</Text>
          <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
          {error && <Text style={{ color: colors.danger, marginBottom: spacing.md }}>{error}</Text>}
          <Button title="Send link" onPress={submit} loading={busy} disabled={!email} />
        </>
      )}
    </ScrollView>
  );
}
