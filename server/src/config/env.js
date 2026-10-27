/**
 * Centralised, validated configuration.
 *
 * Every environment variable the server reads is declared here. The process
 * refuses to start when a required value is missing or malformed, so
 * misconfiguration surfaces at deploy time instead of at the first request.
 */
import { z } from 'zod';

const csv = z
  .string()
  .default('')
  .transform((s) => s.split(',').map((v) => v.trim()).filter(Boolean));

const bool = z
  .enum(['true', 'false', '1', '0', ''])
  .default('false')
  .transform((v) => v === 'true' || v === '1');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  // Public base URL of this API. Share links, email links and Stripe return pages are served from it.
  PUBLIC_API_URL: z.string().url().default('http://localhost:4000'),
  // Comma separated list of browser origins allowed by CORS (admin dashboard, web).
  CORS_ORIGINS: csv,
  TRUST_PROXY: z.coerce.number().int().min(0).default(1),

  MONGODB_URI: z.string().min(1),

  // JWT signing secrets: at least 32 random bytes each, different from each other.
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_TTL: z.string().default('15m'),
  REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(30),

  // OAuth audiences that the server accepts ID tokens for.
  GOOGLE_CLIENT_IDS: csv,
  APPLE_BUNDLE_IDS: csv, // iOS bundle id(s) and/or Services ID(s)
  // Client ids the web app uses for "Sign in with Google" / "Sign in with Apple" (also accepted as audiences).
  GOOGLE_WEB_CLIENT_ID: z.string().default(''),
  APPLE_WEB_SERVICES_ID: z.string().default(''),

  // YouTube Data API v3 key. Server side only; never shipped to clients.
  YOUTUBE_API_KEY: z.string().default(''),
  YOUTUBE_REGION_CODE: z.string().length(2).default('US'),
  YOUTUBE_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(3600),

  // Stripe
  STRIPE_SECRET_KEY: z.string().default(''),
  STRIPE_WEBHOOK_SECRET: z.string().default(''),
  STRIPE_PRICE_PREMIUM_MONTHLY: z.string().default(''),
  STRIPE_PRICE_PREMIUM_YEARLY: z.string().default(''),
  STRIPE_PRICE_FAMILY_MONTHLY: z.string().default(''),
  // App store rules: only enable external purchase links where the storefront allows it.
  ALLOW_IOS_EXTERNAL_PURCHASE: bool,
  ALLOW_ANDROID_EXTERNAL_PURCHASE: bool,

  // S3 compatible object storage for licensed audio and artwork.
  S3_BUCKET: z.string().default(''),
  S3_REGION: z.string().default('us-east-1'),
  S3_ENDPOINT: z.string().default(''), // set for R2 / MinIO / Spaces
  // Host browsers use to reach storage, when it differs from S3_ENDPOINT (e.g. MinIO in docker-compose).
  S3_PUBLIC_ENDPOINT: z.string().default(''),
  S3_ACCESS_KEY_ID: z.string().default(''),
  S3_SECRET_ACCESS_KEY: z.string().default(''),
  STREAM_URL_TTL_SECONDS: z.coerce.number().int().positive().default(600),

  // Offline licences: how long a downloaded file stays playable without a re-check.
  OFFLINE_LICENSE_DAYS: z.coerce.number().int().positive().max(30).default(30),
  MAX_OFFLINE_DEVICES: z.coerce.number().int().positive().default(3),
  // 32 byte hex master key used to derive per-licence content keys.
  OFFLINE_KEY_SECRET: z.string().regex(/^[0-9a-f]{64}$/i, 'must be 64 hex characters'),

  // 32 byte hex key for encrypting secrets at rest (e.g. Apple refresh tokens).
  DATA_ENCRYPTION_KEY: z.string().regex(/^[0-9a-f]{64}$/i, 'must be 64 hex characters').optional(),

  // Sign in with Apple REST API credentials, used to revoke tokens when an account is deleted.
  APPLE_TEAM_ID: z.string().default(''),
  APPLE_KEY_ID: z.string().default(''),
  APPLE_PRIVATE_KEY: z.string().default(''), // contents of the .p8 file; "\\n" escapes allowed
  APPLE_CLIENT_ID: z.string().default(''), // the app bundle id used for the REST API

  // Public CDN base for artwork stored under the `artwork/` prefix of the bucket.
  ASSET_PUBLIC_BASE_URL: z.string().default(''),

  // Outgoing email (verification and password reset). Logged to stdout when unset outside production.
  SMTP_URL: z.string().default(''),
  MAIL_FROM: z.string().default('MyMusic <no-reply@mymusic.app>'),

  // Built web app and admin dashboard served by this process ('' disables).
  WEB_DIST_DIR: z.string().default('../web/dist'),
  ADMIN_DIST_DIR: z.string().default('../admin/dist'),

  MAX_UPLOAD_MB: z.coerce.number().int().positive().default(200),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // Print every problem at once; never echo secret values.
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  console.error(`Invalid environment configuration:\n${issues}`);
  process.exit(1);
}

const env = parsed.data;
// Web client ids are valid audiences for ID tokens too.
if (env.GOOGLE_WEB_CLIENT_ID && !env.GOOGLE_CLIENT_IDS.includes(env.GOOGLE_WEB_CLIENT_ID)) env.GOOGLE_CLIENT_IDS.push(env.GOOGLE_WEB_CLIENT_ID);
if (env.APPLE_WEB_SERVICES_ID && !env.APPLE_BUNDLE_IDS.includes(env.APPLE_WEB_SERVICES_ID)) env.APPLE_BUNDLE_IDS.push(env.APPLE_WEB_SERVICES_ID);

if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) {
  console.error('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must differ');
  process.exit(1);
}

if (env.NODE_ENV === 'production') {
  const missing = ['YOUTUBE_API_KEY', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'S3_BUCKET', 'SMTP_URL', 'DATA_ENCRYPTION_KEY'].filter((k) => !env[k]);
  if (missing.length) {
    console.error(`Missing production configuration: ${missing.join(', ')}`);
    process.exit(1);
  }
}

export const isProd = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
export default env;
