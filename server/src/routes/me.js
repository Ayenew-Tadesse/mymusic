/** The signed-in user's own profile, settings, data export and account deletion. */
import { Router } from 'express';
import { z } from 'zod';
import { User, Playlist, Favorite, ListeningEvent, OfflineLicense, RefreshToken } from '../models/index.js';
import { validate } from '../middleware/validate.js';
import { authLimiter } from '../middleware/rateLimit.js';
import { hashPassword, verifyPassword } from '../services/passwords.js';
import { revokeAllSessions, issueSession } from '../services/tokens.js';
import { revokeAppleToken } from '../services/socialAuth.js';
import { decryptSecret } from '../services/secrets.js';
import { getStripe } from '../services/billing.js';
import { passwordSchema } from './auth.js';
import { unauthorized } from '../utils/httpError.js';

const router = Router();

router.get('/', (req, res) => res.json({ user: req.user.toProfile() }));

router.patch(
  '/',
  validate({
    body: z
      .object({
        displayName: z.string().trim().min(1).max(60),
        avatarUrl: z.string().url().max(2048).startsWith('https://').nullable(),
        country: z.string().regex(/^[A-Z]{2}$/).nullable(),
        preferences: z
          .object({ theme: z.enum(['system', 'dark', 'light']), allowExplicit: z.boolean() })
          .partial(),
      })
      .partial()
      .strict(),
  }),
  async (req, res) => {
    const { preferences, ...rest } = req.valid.body;
    Object.assign(req.user, rest);
    if (preferences) Object.assign(req.user.preferences, preferences);
    await req.user.save();
    res.json({ user: req.user.toProfile() });
  },
);

/** Change (or, for social-only accounts, set) a password. Ends all other sessions. */
router.put(
  '/password',
  authLimiter,
  validate({ body: z.object({ currentPassword: z.string().max(72).optional(), newPassword: passwordSchema }) }),
  async (req, res) => {
    const user = await User.findById(req.user._id).select('+passwordHash');
    if (user.passwordHash && !(await verifyPassword(req.valid.body.currentPassword ?? '', user.passwordHash))) {
      throw unauthorized('Current password is incorrect');
    }
    user.passwordHash = await hashPassword(req.valid.body.newPassword);
    await user.save();
    await revokeAllSessions(user._id);
    const fresh = await User.findById(user._id);
    res.json({ user: fresh.toProfile(), ...(await issueSession(fresh, { ip: req.ip })) });
  },
);

/** GDPR / CCPA data export. */
router.get('/export', async (req, res) => {
  const uid = req.user._id;
  const [playlists, favorites, history] = await Promise.all([
    Playlist.find({ owner: uid }).lean(),
    Favorite.find({ user: uid }).lean(),
    ListeningEvent.find({ user: uid }).sort({ playedAt: -1 }).limit(10_000).lean(),
  ]);
  res.setHeader('Content-Disposition', 'attachment; filename="mymusic-export.json"');
  res.json({ exportedAt: new Date(), profile: req.user.toProfile(), playlists, favorites, history });
});

/**
 * Permanently delete the account and personal data (App Store guideline
 * 5.1.1(v) and Google Play account deletion policy). Active Stripe
 * subscriptions are cancelled and Sign in with Apple tokens revoked.
 */
router.delete('/', validate({ body: z.object({ confirm: z.literal('DELETE') }) }), async (req, res) => {
  const user = await User.findById(req.user._id).select('+appleRefreshToken');
  const subId = user.subscription?.stripeSubscriptionId;
  if (subId && user.isPremium()) {
    await getStripe().subscriptions.cancel(subId).catch((err) => req.log.error({ err }, 'Stripe cancel failed'));
  }
  if (user.appleRefreshToken) await revokeAppleToken(decryptSecret(user.appleRefreshToken)).catch(() => {});

  const uid = user._id;
  await Promise.all([
    Playlist.deleteMany({ owner: uid }),
    Playlist.updateMany({ $or: [{ collaborators: uid }, { followers: uid }] }, { $pull: { collaborators: uid, followers: uid } }),
    Favorite.deleteMany({ user: uid }),
    ListeningEvent.deleteMany({ user: uid }),
    OfflineLicense.deleteMany({ user: uid }),
    RefreshToken.deleteMany({ user: uid }),
  ]);
  await User.deleteOne({ _id: uid });
  res.status(204).end();
});

export default router;
