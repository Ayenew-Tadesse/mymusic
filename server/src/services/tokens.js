/**
 * Access tokens: short lived HS256 JWTs (stateless, carry tokenVersion).
 * Refresh tokens: opaque random strings stored hashed, rotated on every use
 * with reuse detection (a replayed token revokes its whole family).
 */
import crypto from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import env from '../config/env.js';
import { RefreshToken, User } from '../models/index.js';
import { randomToken, sha256 } from '../utils/crypto.js';
import { unauthorized } from '../utils/httpError.js';
import logger from '../config/logger.js';

const ISSUER = 'mymusic-api';
const AUDIENCE = 'mymusic-app';
const accessKey = new TextEncoder().encode(env.JWT_ACCESS_SECRET);
const purposeKey = new TextEncoder().encode(env.JWT_REFRESH_SECRET);

export async function signAccessToken(user) {
  return new SignJWT({ role: user.role, tv: user.tokenVersion })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user._id.toString())
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(env.JWT_ACCESS_TTL)
    .sign(accessKey);
}

export async function verifyAccessToken(token) {
  const { payload } = await jwtVerify(token, accessKey, {
    issuer: ISSUER,
    audience: AUDIENCE,
    algorithms: ['HS256'],
  });
  return payload;
}

/**
 * Single purpose signed tokens (email verification, password reset,
 * playlist invites). `purpose` is bound into the audience so a token minted
 * for one flow can't be replayed in another.
 */
export async function signPurposeToken(purpose, claims, ttl) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(ISSUER)
    .setAudience(`purpose:${purpose}`)
    .setIssuedAt()
    .setExpirationTime(ttl)
    .sign(purposeKey);
}

export async function verifyPurposeToken(purpose, token) {
  try {
    const { payload } = await jwtVerify(token, purposeKey, {
      issuer: ISSUER,
      audience: `purpose:${purpose}`,
      algorithms: ['HS256'],
    });
    return payload;
  } catch {
    return null;
  }
}

async function createRefreshToken(user, { family, deviceName, ip }) {
  const token = randomToken();
  await RefreshToken.create({
    user: user._id,
    tokenHash: sha256(token),
    family: family ?? crypto.randomUUID(),
    deviceName,
    ip,
    expiresAt: new Date(Date.now() + env.REFRESH_TTL_DAYS * 86400_000),
  });
  return token;
}

/** Issue a fresh token pair after a successful login. */
export async function issueSession(user, meta = {}) {
  const [accessToken, refreshToken] = await Promise.all([signAccessToken(user), createRefreshToken(user, meta)]);
  return { accessToken, refreshToken, tokenType: 'Bearer' };
}

/** Exchange a refresh token for a new pair, rotating the refresh token. */
export async function rotateSession(token, meta = {}) {
  const tokenHash = sha256(token);
  const now = new Date();
  // Atomically claim the token so two concurrent refreshes can't both succeed.
  const current = await RefreshToken.findOneAndUpdate(
    { tokenHash, revokedAt: null, replacedAt: null, expiresAt: { $gt: now } },
    { $set: { replacedAt: now } },
    { new: true },
  );

  if (!current) {
    const known = await RefreshToken.findOne({ tokenHash });
    if (known && (known.replacedAt || known.revokedAt)) {
      // Reuse of a rotated token: assume theft and end every session in the family.
      await RefreshToken.updateMany({ family: known.family, revokedAt: null }, { $set: { revokedAt: now } });
      logger.warn({ user: known.user.toString(), family: known.family }, 'Refresh token reuse detected');
    }
    throw unauthorized('Session expired, please sign in again');
  }

  const user = await User.findById(current.user);
  if (!user || user.status !== 'active') throw unauthorized('Session expired, please sign in again');
  return issueSession(user, { family: current.family, deviceName: meta.deviceName ?? current.deviceName, ip: meta.ip });
}

export async function revokeRefreshToken(token) {
  await RefreshToken.updateOne({ tokenHash: sha256(token), revokedAt: null }, { $set: { revokedAt: new Date() } });
}

/** End every session of a user: refresh tokens are deleted and access tokens invalidated. */
export async function revokeAllSessions(userId) {
  await Promise.all([
    RefreshToken.deleteMany({ user: userId }),
    User.updateOne({ _id: userId }, { $inc: { tokenVersion: 1 } }),
  ]);
}
