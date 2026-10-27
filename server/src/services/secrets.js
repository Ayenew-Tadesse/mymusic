/** AES-256-GCM encryption for secrets stored in MongoDB. */
import crypto from 'node:crypto';
import env from '../config/env.js';

const key = env.DATA_ENCRYPTION_KEY ? Buffer.from(env.DATA_ENCRYPTION_KEY, 'hex') : null;

export const canEncrypt = () => Boolean(key);

export function encryptSecret(plain) {
  if (!key) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64url')).join('.');
}

export function decryptSecret(blob) {
  if (!key || !blob) return null;
  const [iv, tag, data] = blob.split('.').map((p) => Buffer.from(p, 'base64url'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}
