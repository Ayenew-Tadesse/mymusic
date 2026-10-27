import mongoose from 'mongoose';
import { HttpError } from '../utils/httpError.js';
import logger from '../config/logger.js';
import { isProd } from '../config/env.js';

export function notFoundHandler(req, res) {
  res.status(404).json({ error: { code: 'not_found', message: `No route for ${req.method} ${req.path}` } });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  let status = 500;
  let body = { code: 'internal', message: 'Something went wrong' };

  if (err instanceof HttpError) {
    status = err.status;
    body = { code: err.code, message: err.message, details: err.details };
  } else if (err instanceof mongoose.Error.ValidationError) {
    status = 400;
    body = {
      code: 'bad_request',
      message: 'Invalid data',
      details: Object.values(err.errors).map((e) => ({ path: e.path, message: e.message })),
    };
  } else if (err instanceof mongoose.Error.CastError) {
    status = 400;
    body = { code: 'bad_request', message: `Invalid ${err.path}` };
  } else if (err instanceof mongoose.Error.VersionError) {
    // Two people edited the same playlist at once; the client reloads and retries.
    status = 409;
    body = { code: 'edit_conflict', message: 'This was changed by someone else, please try again' };
  } else if (err?.code === 11000) {
    status = 409;
    body = { code: 'conflict', message: 'Already exists' };
  } else if (err?.type === 'entity.too.large') {
    status = 413;
    body = { code: 'payload_too_large', message: 'Request body too large' };
  } else if (err?.type === 'entity.parse.failed') {
    status = 400;
    body = { code: 'bad_request', message: 'Malformed JSON' };
  }

  if (status >= 500) {
    (req.log ?? logger).error({ err }, 'Unhandled error');
    if (!isProd) body.stack = err?.stack;
  }
  res.status(status).json({ error: body });
}
