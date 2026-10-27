/** Plans and subscription management through Stripe Checkout / Customer Portal. */
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Billing } from '../api/endpoints';
import { keys } from '../api/queryClient';
import { errorMessage } from '../api/client';
import { useAuth } from '../auth/AuthProvider';
import { Icon } from '../components/Icon';
import { toast } from '../components/overlays';
import { ErrorState, Spinner } from '../components/ui';
import { formatPrice } from '../utils';

const PERKS = ['Every song in the MyMusic catalog', 'Listen without limits on web and mobile', 'Download licensed songs in the mobile app', 'Cancel anytime'];

export default function Premium() {
  const { user, isPremium, refreshUser } = useAuth();
  const [params] = useSearchParams();
  const [busy, setBusy] = useState<string | null>(null);
  const { data, error, isLoading, refetch } = useQuery({ queryKey: keys.plans, queryFn: Billing.plans });

  // Returning from Stripe Checkout: the webhook may take a moment to land.
  useEffect(() => {
    const result = params.get('checkout');
    if (result === 'cancelled') toast('Checkout cancelled, no charge was made');
    if (result !== 'success') return;
    toast('Thanks! Activating your subscription…');
    let tries = 0;
    const t = setInterval(async () => {
      tries += 1;
      await refreshUser().catch(() => {});
      if (tries >= 10) clearInterval(t);
    }, 2000);
    return () => clearInterval(t);
  }, [params, refreshUser]);

  async function go(kind: 'checkout' | 'portal', planId?: string) {
    setBusy(planId ?? kind);
    try {
      const { url } = kind === 'checkout' ? await Billing.checkout(planId!) : await Billing.portal();
      window.location.assign(url);
    } catch (e) {
      toast(errorMessage(e));
      setBusy(null);
    }
  }

  if (isLoading) return <Spinner />;
  if (error || !data) return <ErrorState message={errorMessage(error)} onRetry={refetch} />;
  const sub = user?.subscription;

  return (
    <div style={{ maxWidth: 900 }}>
      <h1 className="page-title">{isPremium ? `You’re on ${sub?.plan === 'family' ? 'Family' : 'Premium'}` : 'Try MyMusic Premium'}</h1>
      {isPremium && sub?.currentPeriodEnd && (
        <p className="muted">
          {sub.cancelAtPeriodEnd ? 'Ends' : 'Renews'} on {new Date(sub.currentPeriodEnd).toLocaleDateString()}.
        </p>
      )}
      <ul className="perks">
        {PERKS.map((p) => (
          <li key={p}>
            <Icon name="check" size={20} /> {p}
          </li>
        ))}
      </ul>
      {isPremium ? (
        <button className="btn btn-secondary" disabled={busy === 'portal'} onClick={() => go('portal')}>
          Manage subscription
        </button>
      ) : !data.canPurchase || !data.plans.length ? (
        <p className="muted">Subscriptions aren’t available yet.</p>
      ) : (
        <div className="plans">
          {data.plans.map((p) => (
            <div key={p.id} className="plan">
              <h3>{p.plan}</h3>
              <div className="muted">
                {formatPrice(p.amount, p.currency)} / {p.interval}
              </div>
              <button className="btn btn-primary" style={{ marginTop: 12 }} disabled={busy === p.id} onClick={() => go('checkout', p.id)}>
                {busy === p.id ? 'Redirecting…' : `Get ${p.plan}`}
              </button>
            </div>
          ))}
        </div>
      )}
      <p className="muted small" style={{ marginTop: 24 }}>
        Payments are processed securely by Stripe. YouTube videos in MyMusic are always free and play in YouTube’s own player; Premium covers the MyMusic catalog.
      </p>
    </div>
  );
}
