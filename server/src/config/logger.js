import pino from 'pino';
import env from './env.js';

/** Structured JSON logger. Auth headers, cookies and tokens are redacted. */
const logger = pino({
  level: env.NODE_ENV === 'test' ? 'silent' : env.LOG_LEVEL,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["stripe-signature"]',
      '*.password',
      '*.refreshToken',
      '*.idToken',
      '*.identityToken',
    ],
    censor: '[redacted]',
  },
});

export default logger;
