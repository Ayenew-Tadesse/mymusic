/**
 * Authentication.
 *
 * Every sign-in method ends in the same place: a short lived access token
 * (sent as `Authorization: Bearer`) plus a rotating refresh token that the
 * app stores in the OS keystore.
 */
import { Router } from 'express';
import { z } from 'zod';
import env from '../config/env.js';
import { User } from '../models/index.js';
import { validate } from '../middleware/validate.js';
import { authLimiter } from '../middleware/rateLimit.js';
import { requireAuth } from '../middleware/auth.js';
import { hashPassword, verifyPassword } from '../services/passwords.js';
import {
  issueSession,
  rotateSession,
  revokeRefreshToken,
  revokeAllSessions,
  signPurposeToken,
  verifyPurposeToken,
} from '../services/tokens.js';
import { verifyGoogleIdToken, verifyAppleIdentityToken, exchangeAppleAuthorizationCode } from '../services/socialAuth.js';
import { encryptSecret } from '../services/secrets.js';
import { sendVerificationEmail, sendPasswordResetEmail } from '../services/mailer.js';
import { sha256 } from '../utils/crypto.js';
import { HttpError, unauthorized, badRequest } from '../utils/httpError.js';

const router = Router();

/**
 * Browser clients (the admin dashboard) send `X-Client: web`. They get the
 * refresh token as an httpOnly, SameSite=Strict cookie scoped to the auth
 * routes instead of in the JSON body, so page scripts can never read it.
 * The custom header also forces a CORS preflight, which blocks CSRF.
 */
const REFRESH_COOKIE = 'mm_refresh';
const isWeb = (req) => req.get('x-client') === 'web';

function deliverTokens(req, res, tokens) {
  if (!isWeb(req)) return tokens;
  res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
    httpOnly: true,
    secure: req.secure,
    sameSite: 'strict',
    path: '/api/v1/auth',
    maxAge: env.REFRESH_TTL_DAYS * 86400_000,
  });
  const { refreshToken: _omit, ...rest } = tokens;
  return rest;
}

const refreshFrom = (req) => req.valid.body.refreshToken ?? (isWeb(req) ? req.cookies?.[REFRESH_COOKIE] : undefined);

const email = z.string().trim().toLowerCase().email().max(254);
// NIST 800-63B style: length over composition rules, upper bound guards bcrypt's 72 byte limit.
const password = z
  .string()
  .min(10, 'Use at least 10 characters')
  .max(72)
  .refine((p) => !/^(.)\1+$/.test(p), 'Password is too weak');
const deviceName = z.string().trim().max(120).optional();

async function sessionResponse(req, res, user, status = 200) {
  user.lastLoginAt = new Date();
  await user.save();
  const tokens = await issueSession(user, { deviceName: req.valid.body.deviceName, ip: req.ip });
  res.status(status).json({ user: user.toProfile(), ...deliverTokens(req, res, tokens) });
}

function assertActive(user) {
  if (user.status !== 'active') throw new HttpError(403, 'Account suspended', 'account_suspended');
}

async function sendVerification(user) {
  if (!user.email || user.emailVerified) return;
  const token = await signPurposeToken('verify-email', { sub: user.id, email: user.email }, '2d');
  await sendVerificationEmail(user.email, `${env.PUBLIC_API_URL}/verify-email?token=${encodeURIComponent(token)}`);
}

// --- Email + password ------------------------------------------------------

router.post(
  '/register',
  authLimiter,
  validate({ body: z.object({ email, password, displayName: z.string().trim().min(1).max(60), deviceName }) }),
  async (req, res) => {
    const { email: addr, password: pw, displayName } = req.valid.body;
    if (await User.exists({ email: addr })) {
      throw new HttpError(409, 'An account with this email already exists', 'email_taken');
    }
    const user = await User.create({ email: addr, passwordHash: await hashPassword(pw), displayName });
    await sendVerification(user).catch((err) => req.log.warn({ err }, 'Verification email failed'));
    await sessionResponse(req, res, user, 201);
  },
);

router.post(
  '/login',
  authLimiter,
  validate({ body: z.object({ email, password: z.string().min(1).max(72), deviceName }) }),
  async (req, res) => {
    const { email: addr, password: pw } = req.valid.body;
    const user = await User.findOne({ email: addr }).select('+passwordHash');
    const ok = await verifyPassword(pw, user?.passwordHash);
    if (!user || !user.passwordHash || !ok) throw unauthorized('Incorrect email or password');
    assertActive(user);
    await sessionResponse(req, res, user);
  },
);

// --- Social sign-in --------------------------------------------------------

/**
 * Find or create the user for a verified social identity.
 *
 * Linking by email only happens when the provider verified the address. If
 * that email belongs to a password account whose owner never verified it, the
 * password is removed: whoever registered it first never proved they own the
 * inbox, so they must not keep access to the account.
 */
async function upsertSocialUser(field, identity, fallbackName) {
  let user = await User.findOne({ [field]: identity.providerId }).select('+passwordHash');
  if (user) return user;

  if (identity.email && identity.emailVerified) {
    user = await User.findOne({ email: identity.email }).select('+passwordHash');
    if (user) {
      if (user[field]) throw new HttpError(409, 'This email is linked to a different account', 'identity_conflict');
      user[field] = identity.providerId;
      if (!user.emailVerified) {
        user.passwordHash = undefined;
        user.emailVerified = true;
        user.tokenVersion += 1;
      }
      return user;
    }
  }

  return new User({
    [field]: identity.providerId,
    email: identity.emailVerified ? identity.email : undefined,
    emailVerified: Boolean(identity.email && identity.emailVerified),
    displayName: (fallbackName || identity.email?.split('@')[0] || 'Music lover').slice(0, 60),
    avatarUrl: identity.picture ?? undefined,
  });
}

router.post(
  '/google',
  authLimiter,
  validate({ body: z.object({ idToken: z.string().min(20).max(4096), deviceName }) }),
  async (req, res) => {
    const identity = await verifyGoogleIdToken(req.valid.body.idToken);
    const user = await upsertSocialUser('googleId', identity, identity.name);
    assertActive(user);
    await sessionResponse(req, res, user, user.isNew ? 201 : 200);
  },
);

router.post(
  '/apple',
  authLimiter,
  validate({
    body: z.object({
      identityToken: z.string().min(20).max(4096),
      nonce: z.string().min(16).max(128),
      authorizationCode: z.string().max(1024).optional(),
      // Apple only provides the name on the very first authorization, client side.
      fullName: z.string().trim().max(60).optional(),
      deviceName,
    }),
  }),
  async (req, res) => {
    const { identityToken, nonce, authorizationCode, fullName } = req.valid.body;
    const identity = await verifyAppleIdentityToken(identityToken, nonce);
    const user = await upsertSocialUser('appleId', identity, fullName);
    assertActive(user);
    if (authorizationCode) {
      const refresh = await exchangeAppleAuthorizationCode(authorizationCode).catch(() => null);
      const sealed = refresh && encryptSecret(refresh);
      if (sealed) user.appleRefreshToken = sealed;
    }
    await sessionResponse(req, res, user, user.isNew ? 201 : 200);
  },
);

// --- Session management ----------------------------------------------------

const refreshBody = z.object({ refreshToken: z.string().min(20).max(200).optional(), deviceName });

router.post('/refresh', validate({ body: refreshBody }), async (req, res) => {
  const token = refreshFrom(req);
  if (!token) throw unauthorized('Session expired, please sign in again');
  const tokens = await rotateSession(token, { ip: req.ip, deviceName: req.valid.body.deviceName });
  res.json(deliverTokens(req, res, tokens));
});

router.post('/logout', validate({ body: refreshBody }), async (req, res) => {
  const token = refreshFrom(req);
  if (token) await revokeRefreshToken(token);
  if (isWeb(req)) res.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
  res.status(204).end();
});

router.post('/logout-all', requireAuth, async (req, res) => {
  await revokeAllSessions(req.user._id);
  res.status(204).end();
});

// --- Email verification ----------------------------------------------------

router.post('/email/resend', requireAuth, authLimiter, async (req, res) => {
  await sendVerification(req.user);
  res.status(202).json({ sent: !req.user.emailVerified });
});

/** Mark the email verified. Shared with the server-rendered /verify-email page. */
export async function verifyEmailToken(token) {
  const claims = await verifyPurposeToken('verify-email', token);
  if (!claims) throw badRequest('This link is invalid or has expired');
  const result = await User.updateOne({ _id: claims.sub, email: claims.email }, { $set: { emailVerified: true } });
  if (!result.matchedCount) throw badRequest('This link is invalid or has expired');
}

router.post('/email/verify', validate({ body: z.object({ token: z.string().min(20).max(2048) }) }), async (req, res) => {
  await verifyEmailToken(req.valid.body.token);
  res.json({ verified: true });
});

// --- Password reset --------------------------------------------------------

// Binding the token to a fingerprint of the current hash makes it single use:
// once the password changes, older reset links stop working.
const passwordFingerprint = (hash) => sha256(hash ?? 'none').slice(0, 16);

router.post('/password/forgot', authLimiter, validate({ body: z.object({ email }) }), async (req, res) => {
  const user = await User.findOne({ email: req.valid.body.email, status: 'active' }).select('+passwordHash');
  if (user) {
    const token = await signPurposeToken('reset-password', { sub: user.id, pf: passwordFingerprint(user.passwordHash) }, '30m');
    await sendPasswordResetEmail(user.email, `${env.PUBLIC_API_URL}/reset-password?token=${encodeURIComponent(token)}`).catch(
      (err) => req.log.error({ err }, 'Reset email failed'),
    );
  }
  // Same response either way so the endpoint can't be used to discover accounts.
  res.status(202).json({ message: 'If an account exists for that email, a reset link is on its way.' });
});

/** Set a new password from a reset token. Shared with the server-rendered /reset-password page. */
export async function resetPasswordWithToken(token, newPassword) {
  const claims = await verifyPurposeToken('reset-password', token);
  const user = claims && (await User.findById(claims.sub).select('+passwordHash'));
  if (!user || passwordFingerprint(user.passwordHash) !== claims.pf) throw badRequest('This link is invalid or has expired');
  user.passwordHash = await hashPassword(newPassword);
  user.emailVerified = true; // they proved inbox ownership by following the link
  await user.save();
  await revokeAllSessions(user._id);
}

router.post(
  '/password/reset',
  authLimiter,
  validate({ body: z.object({ token: z.string().min(20).max(2048), password }) }),
  async (req, res) => {
    await resetPasswordWithToken(req.valid.body.token, req.valid.body.password);
    res.json({ reset: true });
  },
);

export { password as passwordSchema };
export default router;
