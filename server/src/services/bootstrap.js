/**
 * Creates the first admin account from ADMIN_EMAIL / ADMIN_PASSWORD at
 * startup, so hosts without shell access (e.g. Render's free plan) can be
 * set up from environment variables alone. An existing account with that
 * email is promoted to admin; its password is left unchanged.
 */
import env from '../config/env.js';
import logger from '../config/logger.js';
import { User } from '../models/index.js';
import { hashPassword } from './passwords.js';

export async function ensureAdmin() {
  const email = env.ADMIN_EMAIL?.toLowerCase();
  if (!email) return;
  const existing = await User.findOne({ email });
  if (existing) {
    if (existing.role !== 'admin') {
      existing.role = 'admin';
      await existing.save();
      logger.info({ email }, 'Promoted existing account to admin');
    }
    return;
  }
  if (!env.ADMIN_PASSWORD || env.ADMIN_PASSWORD.length < 12) {
    logger.warn('ADMIN_EMAIL is set but ADMIN_PASSWORD is missing or shorter than 12 characters; no admin created');
    return;
  }
  await User.create({ email, displayName: 'Admin', role: 'admin', emailVerified: true, passwordHash: await hashPassword(env.ADMIN_PASSWORD) });
  logger.info({ email }, 'Created admin account');
}
