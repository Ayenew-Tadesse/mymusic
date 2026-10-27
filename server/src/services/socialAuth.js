/**
 * Verification of third party identity tokens. The mobile app performs the
 * native sign-in and sends us the provider's ID token; we never trust
 * client-supplied profile data without verifying the signed token here.
 */
import { OAuth2Client } from 'google-auth-library';
import { createRemoteJWKSet, jwtVerify, SignJWT, importPKCS8 } from 'jose';
import env from '../config/env.js';
import { sha256 } from '../utils/crypto.js';
import { unauthorized, HttpError } from '../utils/httpError.js';
import logger from '../config/logger.js';

const googleClient = new OAuth2Client();

export async function verifyGoogleIdToken(idToken) {
  if (!env.GOOGLE_CLIENT_IDS.length) throw new HttpError(503, 'Google sign-in is not configured');
  try {
    const ticket = await googleClient.verifyIdToken({ idToken, audience: env.GOOGLE_CLIENT_IDS });
    const p = ticket.getPayload();
    if (!p?.sub) throw new Error('missing subject');
    return {
      providerId: p.sub,
      email: p.email?.toLowerCase() ?? null,
      emailVerified: p.email_verified === true,
      name: p.name ?? null,
      picture: p.picture ?? null,
    };
  } catch (err) {
    logger.info({ err: err.message }, 'Google token rejected');
    throw unauthorized('Google sign-in failed');
  }
}

const APPLE_ISSUER = 'https://appleid.apple.com';
const appleJwks = createRemoteJWKSet(new URL(`${APPLE_ISSUER}/auth/keys`));

/**
 * @param identityToken JWT from expo-apple-authentication
 * @param rawNonce the unhashed nonce the app generated; Apple embeds sha256(rawNonce)
 */
export async function verifyAppleIdentityToken(identityToken, rawNonce) {
  if (!env.APPLE_BUNDLE_IDS.length) throw new HttpError(503, 'Apple sign-in is not configured');
  try {
    const { payload } = await jwtVerify(identityToken, appleJwks, {
      issuer: APPLE_ISSUER,
      audience: env.APPLE_BUNDLE_IDS,
    });
    if (!payload.nonce || payload.nonce !== sha256(rawNonce)) throw new Error('nonce mismatch');
    return {
      providerId: payload.sub,
      email: typeof payload.email === 'string' ? payload.email.toLowerCase() : null,
      // Apple sends booleans as strings in some token versions.
      emailVerified: payload.email_verified === true || payload.email_verified === 'true',
    };
  } catch (err) {
    logger.info({ err: err.message }, 'Apple token rejected');
    throw unauthorized('Apple sign-in failed');
  }
}

const appleRestConfigured = () =>
  Boolean(env.APPLE_TEAM_ID && env.APPLE_KEY_ID && env.APPLE_PRIVATE_KEY && env.APPLE_CLIENT_ID);

async function appleClientSecret() {
  const key = await importPKCS8(env.APPLE_PRIVATE_KEY.replace(/\\n/g, '\n'), 'ES256');
  return new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: env.APPLE_KEY_ID })
    .setIssuer(env.APPLE_TEAM_ID)
    .setSubject(env.APPLE_CLIENT_ID)
    .setAudience(APPLE_ISSUER)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(key);
}

/** Exchange the one-time authorization code for an Apple refresh token (needed for revocation). */
export async function exchangeAppleAuthorizationCode(code) {
  if (!appleRestConfigured() || !code) return null;
  const res = await fetch(`${APPLE_ISSUER}/auth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.APPLE_CLIENT_ID,
      client_secret: await appleClientSecret(),
      code,
      grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) {
    logger.warn({ status: res.status }, 'Apple code exchange failed');
    return null;
  }
  const json = await res.json();
  return json.refresh_token ?? null;
}

/** Revoke Sign in with Apple tokens, as App Store guideline 5.1.1(v) requires on account deletion. */
export async function revokeAppleToken(refreshToken) {
  if (!appleRestConfigured() || !refreshToken) return;
  const res = await fetch(`${APPLE_ISSUER}/auth/revoke`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.APPLE_CLIENT_ID,
      client_secret: await appleClientSecret(),
      token: refreshToken,
      token_type_hint: 'refresh_token',
    }),
  });
  if (!res.ok) logger.warn({ status: res.status }, 'Apple token revocation failed');
}
