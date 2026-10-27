/**
 * Stripe subscriptions.
 *
 * App store rules: Apple and Google require their own in-app purchase systems
 * for digital subscriptions unless the storefront permits an external
 * purchase link (e.g. the US after the Epic rulings, or the reader-app /
 * user-choice billing programs). The ALLOW_*_EXTERNAL_PURCHASE flags decide
 * whether the mobile apps may open Stripe Checkout; when false, users manage
 * their plan on the web and the apps show no purchase buttons or prices.
 */
import Stripe from 'stripe';
import env from '../config/env.js';
import logger from '../config/logger.js';
import { User, OfflineLicense, WebhookEvent } from '../models/index.js';
import { HttpError } from '../utils/httpError.js';

let stripe;
export function getStripe() {
  if (!env.STRIPE_SECRET_KEY) throw new HttpError(503, 'Billing is not configured', 'billing_unconfigured');
  stripe ??= new Stripe(env.STRIPE_SECRET_KEY, { maxNetworkRetries: 2, timeout: 15_000 });
  return stripe;
}

/** Catalogue of sellable plans. Prices live in Stripe; we only store their ids. */
export function planCatalog() {
  return [
    { id: 'premium_monthly', plan: 'premium', interval: 'month', priceId: env.STRIPE_PRICE_PREMIUM_MONTHLY },
    { id: 'premium_yearly', plan: 'premium', interval: 'year', priceId: env.STRIPE_PRICE_PREMIUM_YEARLY },
    { id: 'family_monthly', plan: 'family', interval: 'month', priceId: env.STRIPE_PRICE_FAMILY_MONTHLY },
  ].filter((p) => p.priceId);
}

const planForPrice = (priceId) => planCatalog().find((p) => p.priceId === priceId)?.plan ?? 'premium';

export function purchaseAllowedOn(platform) {
  if (platform === 'ios') return env.ALLOW_IOS_EXTERNAL_PURCHASE;
  if (platform === 'android') return env.ALLOW_ANDROID_EXTERNAL_PURCHASE;
  return true; // web
}

/** Plan details with live prices from Stripe (cached for 10 minutes). */
let priceCache = { at: 0, data: null };
export async function listPlans() {
  if (priceCache.data && Date.now() - priceCache.at < 600_000) return priceCache.data;
  const plans = planCatalog();
  if (!plans.length) return [];
  const s = getStripe();
  const data = await Promise.all(
    plans.map(async (p) => {
      const price = await s.prices.retrieve(p.priceId);
      return { id: p.id, plan: p.plan, interval: p.interval, amount: price.unit_amount, currency: price.currency };
    }),
  );
  priceCache = { at: Date.now(), data };
  return data;
}

async function ensureCustomer(user) {
  if (user.subscription?.stripeCustomerId) return user.subscription.stripeCustomerId;
  const customer = await getStripe().customers.create(
    { email: user.email ?? undefined, name: user.displayName, metadata: { userId: user.id } },
    { idempotencyKey: `customer-${user.id}` },
  );
  await User.updateOne({ _id: user._id }, { $set: { 'subscription.stripeCustomerId': customer.id } });
  user.subscription.stripeCustomerId = customer.id;
  return customer.id;
}

export async function createCheckoutSession(user, planId, platform = 'web') {
  const plan = planCatalog().find((p) => p.id === planId);
  if (!plan) throw new HttpError(400, 'Unknown plan');
  if (user.isPremium()) throw new HttpError(409, 'You already have an active subscription; manage it from the billing portal', 'already_subscribed');
  const customer = await ensureCustomer(user);
  const session = await getStripe().checkout.sessions.create({
    mode: 'subscription',
    customer,
    client_reference_id: user.id,
    line_items: [{ price: plan.priceId, quantity: 1 }],
    allow_promotion_codes: true,
    subscription_data: { metadata: { userId: user.id } },
    // The web app gets users straight back to its Premium page; apps get a page that deep links back.
    success_url: platform === 'web' ? `${env.PUBLIC_API_URL}/premium?checkout=success` : `${env.PUBLIC_API_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: platform === 'web' ? `${env.PUBLIC_API_URL}/premium?checkout=cancelled` : `${env.PUBLIC_API_URL}/billing/cancel`,
  });
  return { url: session.url };
}

export async function createPortalSession(user, platform = 'web') {
  if (!user.subscription?.stripeCustomerId) throw new HttpError(400, 'No billing account yet');
  const session = await getStripe().billingPortal.sessions.create({
    customer: user.subscription.stripeCustomerId,
    return_url: platform === 'web' ? `${env.PUBLIC_API_URL}/premium` : `${env.PUBLIC_API_URL}/billing/return`,
  });
  return { url: session.url };
}

/** Copy the authoritative Stripe subscription state onto the user. */
export async function syncSubscription(sub) {
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;
  const user =
    (await User.findOne({ 'subscription.stripeCustomerId': customerId })) ??
    (sub.metadata?.userId ? await User.findById(sub.metadata.userId) : null);
  if (!user) {
    logger.warn({ customerId, sub: sub.id }, 'Subscription for unknown customer');
    return;
  }
  const item = sub.items?.data?.[0];
  // Newer Stripe API versions report the billing period on the item, older ones on the subscription.
  const periodEnd = item?.current_period_end ?? sub.current_period_end;
  const ended = ['canceled', 'incomplete_expired', 'unpaid'].includes(sub.status);

  user.subscription = {
    ...user.subscription.toObject?.() ?? user.subscription,
    stripeCustomerId: customerId,
    stripeSubscriptionId: sub.id,
    stripePriceId: item?.price?.id,
    plan: ended ? 'free' : planForPrice(item?.price?.id),
    status: sub.status,
    currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
    cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
  };
  await user.save();

  if (!user.isPremium()) {
    // Offline playback is a paid feature: revoke licences so devices delete their files on next sync.
    await OfflineLicense.updateMany(
      { user: user._id, revokedAt: null },
      { $set: { revokedAt: new Date(), revokeReason: 'subscription_ended' } },
    );
  }
}

/** Verify and process a webhook. Duplicate deliveries are ignored. */
export async function handleWebhook(rawBody, signature) {
  if (!env.STRIPE_WEBHOOK_SECRET) throw new HttpError(503, 'Billing is not configured', 'billing_unconfigured');
  let event;
  try {
    event = getStripe().webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
  } catch {
    throw new HttpError(400, 'Invalid webhook signature', 'invalid_signature');
  }

  if (await WebhookEvent.exists({ eventId: event.id })) return { duplicate: true };

  const s = getStripe();
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      if (session.mode === 'subscription' && session.subscription) {
        await syncSubscription(await s.subscriptions.retrieve(session.subscription));
      }
      break;
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
    case 'customer.subscription.paused':
    case 'customer.subscription.resumed':
      // Re-fetch so out-of-order deliveries can't apply stale state.
      await syncSubscription(await s.subscriptions.retrieve(event.data.object.id));
      break;
    case 'invoice.payment_failed':
      logger.info({ customer: event.data.object.customer }, 'Invoice payment failed');
      break;
    default:
      break;
  }

  // Record only after successful processing so failures are retried by Stripe.
  await WebhookEvent.create({ eventId: event.id, type: event.type }).catch((err) => {
    if (err?.code !== 11000) throw err;
  });
  return { received: true };
}
