/**
 * S3 compatible object storage for licensed audio and artwork.
 * The bucket is private; clients only ever receive short lived signed URLs.
 */
import crypto from 'node:crypto';
import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import env from '../config/env.js';
import { HttpError } from '../utils/httpError.js';

const clients = {};
/**
 * `server` talks to storage from this process; `browser` only signs URLs,
 * using the host name browsers can reach (S3_PUBLIC_ENDPOINT when set).
 */
function s3(kind = 'server') {
  if (!env.S3_BUCKET) throw new HttpError(503, 'Object storage is not configured', 'storage_unconfigured');
  const endpoint = kind === 'browser' ? env.S3_PUBLIC_ENDPOINT || env.S3_ENDPOINT : env.S3_ENDPOINT;
  clients[kind] ??= new S3Client({
    region: env.S3_REGION,
    ...(endpoint && { endpoint, forcePathStyle: true }),
    ...(env.S3_ACCESS_KEY_ID && {
      credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
    }),
  });
  return clients[kind];
}

export const AUDIO_TYPES = { 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/aac': 'aac', 'audio/flac': 'flac' };
export const IMAGE_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

/** Presigned PUT so the admin dashboard uploads straight to storage, not through the API. */
export async function createUploadUrl(kind, contentType) {
  const types = kind === 'audio' ? AUDIO_TYPES : IMAGE_TYPES;
  const ext = types[contentType];
  if (!ext) throw new HttpError(400, `Unsupported content type ${contentType}`);
  const key = `${kind === 'audio' ? 'audio' : 'artwork'}/${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}.${ext}`;
  const url = await getSignedUrl(s3('browser'), new PutObjectCommand({ Bucket: env.S3_BUCKET, Key: key, ContentType: contentType }), {
    expiresIn: 900,
  });
  const publicUrl = kind === 'image' && env.ASSET_PUBLIC_BASE_URL ? `${env.ASSET_PUBLIC_BASE_URL.replace(/\/$/, '')}/${key}` : null;
  return { key, url, publicUrl, headers: { 'Content-Type': contentType } };
}

/** Signed GET for streaming or downloading a licensed file. */
export async function signedAudioUrl(key, { download = false, ttl = env.STREAM_URL_TTL_SECONDS } = {}) {
  const cmd = new GetObjectCommand({
    Bucket: env.S3_BUCKET,
    Key: key,
    ...(download && { ResponseContentDisposition: 'attachment' }),
  });
  return getSignedUrl(s3('browser'), cmd, { expiresIn: ttl });
}

export async function objectSize(key) {
  const head = await s3().send(new HeadObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
  return head.ContentLength ?? null;
}

export async function deleteObject(key) {
  await s3().send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
}

/** Origins browsers load storage objects from, for the Content-Security-Policy. */
export function storageOrigins() {
  return [env.S3_PUBLIC_ENDPOINT || env.S3_ENDPOINT, env.ASSET_PUBLIC_BASE_URL]
    .filter(Boolean)
    .map((u) => {
      try {
        return new URL(u).origin;
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}
