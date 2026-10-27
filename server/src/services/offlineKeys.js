/**
 * Content keys for offline downloads.
 *
 * Each licence gets its own 256-bit AES key derived from a server secret, so
 * keys never need to be stored and a renewed licence yields the same key (the
 * file on the device stays decryptable). The app encrypts the downloaded file
 * with this key and keeps the key in the OS keystore (Keychain / Android
 * Keystore via expo-secure-store).
 */
import crypto from 'node:crypto';
import env from '../config/env.js';

// 64 hex characters are the key itself; any other secret is hashed to 32 bytes.
const master = /^[0-9a-f]{64}$/i.test(env.OFFLINE_KEY_SECRET)
  ? Buffer.from(env.OFFLINE_KEY_SECRET, 'hex')
  : crypto.createHash('sha256').update(env.OFFLINE_KEY_SECRET).digest();

export function contentKeyFor(licenseId) {
  return crypto.createHmac('sha256', master).update(`offline-license:${licenseId}`).digest('base64');
}
