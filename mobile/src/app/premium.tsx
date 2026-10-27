/**
 * Subscription plans.
 *
 * Purchases go through Stripe Checkout in the system browser, only where the
 * App Store / Play Store rules for this storefront allow it (decided by the
 * server). Otherwise the screen shows the user's plan without prices or links.
 */
import { useQuery } from '@tanstack/react-query';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Billing } from '@/api/endpoints';
import { keys } from '@/api/queryClient';
import { errorMessage } from '@/api/client';
import { useAuth } from '@/auth/AuthProvider';
import { Button, ErrorView, Loading } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { font, radius, spacing } from '@/theme/colors';
import { formatPrice } from '@/utils/format';

const PERKS = ['Every song in the MyMusic catalog', 'Download licensed songs to listen offline', 'Background play for MyMusic songs', 'Cancel anytime'];

export default function Premium() {
  const { colors } = useTheme();
  const { user, isPremium, refreshUser } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  const { data, error, isLoading, refetch } = useQuery({ queryKey: keys.plans, queryFn: Billing.plans });

  async function open(kind: 'checkout' | 'portal', planId?: string) {
    setBusy(planId ?? kind);
    try {
      const { url } = kind === 'checkout' ? await Billing.checkout(planId!) : await Billing.portal();
      await WebBrowser.openBrowserAsync(url);
      // The Stripe webhook updates the subscription; refresh once the browser closes.
      await refreshUser();
      refetch();
    } catch (e) {
      Alert.alert('Something went wrong', errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorView message={errorMessage(error)} onRetry={refetch} />;
  const sub = user?.subscription;

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ padding: spacing.xl, gap: spacing.lg }}>
      <Text style={[font.title, { color: colors.text }]}>{isPremium ? `You’re on ${sub?.plan === 'family' ? 'Family' : 'Premium'}` : 'Try Premium'}</Text>
      {isPremium && sub?.currentPeriodEnd && (
        <Text style={{ color: colors.textSecondary }}>
          {sub.cancelAtPeriodEnd ? 'Ends' : 'Renews'} on {new Date(sub.currentPeriodEnd).toLocaleDateString()}.
        </Text>
      )}
      <View style={{ gap: spacing.md }}>
        {PERKS.map((p) => (
          <View key={p} style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}>
            <Ionicons name="checkmark-circle" size={20} color={colors.accent} />
            <Text style={{ color: colors.text, fontSize: 15 }}>{p}</Text>
          </View>
        ))}
      </View>

      {data.canPurchase ? (
        isPremium ? (
          <Button title="Manage subscription" variant="secondary" loading={busy === 'portal'} onPress={() => open('portal')} />
        ) : (
          data.plans.map((p) => (
            <View key={p.id} style={{ backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.xl, gap: spacing.sm }}>
              <Text style={[font.h2, { color: colors.text, textTransform: 'capitalize' }]}>{p.plan}</Text>
              <Text style={{ color: colors.textSecondary }}>
                {formatPrice(p.amount, p.currency)} / {p.interval}
              </Text>
              <Button title={`Get ${p.plan}`} loading={busy === p.id} onPress={() => open('checkout', p.id)} style={{ marginTop: spacing.sm }} />
            </View>
          ))
        )
      ) : (
        <Text style={{ color: colors.textSecondary }}>{isPremium ? 'Your subscription is active.' : 'Premium isn’t available to purchase in this app.'}</Text>
      )}
      <Text style={{ color: colors.textMuted, fontSize: 12 }}>
        YouTube videos in MyMusic are always free and play in YouTube’s own player; Premium covers MyMusic’s licensed catalog.
      </Text>
    </ScrollView>
  );
}
