import { verifyAccessToken } from '../services/tokens.js';
import { User } from '../models/index.js';
import { unauthorized, forbidden, HttpError } from '../utils/httpError.js';

function bearer(req) {
  const header = req.get('authorization') ?? '';
  const [scheme, token] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : null;
}

async function resolveUser(token) {
  const claims = await verifyAccessToken(token).catch(() => null);
  if (!claims) throw unauthorized('Invalid or expired token');
  const user = await User.findById(claims.sub);
  // tokenVersion lets "sign out everywhere" and suspensions take effect immediately.
  if (!user || user.tokenVersion !== claims.tv) throw unauthorized('Session is no longer valid');
  if (user.status !== 'active') throw new HttpError(403, 'Account suspended', 'account_suspended');
  return user;
}

function attach(req, user) {
  req.user = user;
  // Territory used for licence checks: profile country, else the CDN supplied geo header.
  const geo = req.get('cf-ipcountry') ?? req.get('x-country-code');
  req.country = (user?.country ?? (geo && /^[A-Z]{2}$/i.test(geo) ? geo.toUpperCase() : null)) || null;
}

/** Require a valid access token. */
export async function requireAuth(req, _res, next) {
  const token = bearer(req);
  if (!token) return next(unauthorized());
  try {
    attach(req, await resolveUser(token));
    next();
  } catch (err) {
    next(err);
  }
}

/** Attach the user when a token is present; anonymous otherwise. */
export async function optionalAuth(req, _res, next) {
  const token = bearer(req);
  try {
    attach(req, token ? await resolveUser(token) : null);
    next();
  } catch (err) {
    next(err);
  }
}

export function requireAdmin(req, _res, next) {
  if (req.user?.role !== 'admin') return next(forbidden('Admin access required'));
  next();
}

export function requirePremium(req, _res, next) {
  if (!req.user?.isPremium()) return next(new HttpError(402, 'This feature needs a Premium plan', 'premium_required'));
  next();
}
