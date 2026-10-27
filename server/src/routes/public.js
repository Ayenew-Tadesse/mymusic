/**
 * Small server-rendered pages: shared playlist previews (with Open Graph
 * tags for chat apps), invite landing pages, email verification, password
 * reset and Stripe return pages. They contain no scripts.
 */
import express, { Router } from 'express';
import { Playlist } from '../models/index.js';
import { authLimiter } from '../middleware/rateLimit.js';
import { escapeHtml } from '../utils/crypto.js';
import { passwordSchema, resetPasswordWithToken, verifyEmailToken } from './auth.js';
import { HttpError } from '../utils/httpError.js';

const router = Router();

function page({ title, description = '', image, deepLink, webLink, body = '' }) {
  const t = escapeHtml(title);
  const d = escapeHtml(description);
  const img = image ? escapeHtml(image) : '';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${t} · MyMusic</title>
<meta property="og:title" content="${t}"><meta property="og:description" content="${d}">
${img ? `<meta property="og:image" content="${img}">` : ''}<meta name="twitter:card" content="summary_large_image">
<style>body{margin:0;font-family:system-ui,sans-serif;background:#121212;color:#fff;display:grid;place-items:center;min-height:100vh;padding:16px;box-sizing:border-box}
main{max-width:420px;width:100%;text-align:center}img{width:240px;height:240px;object-fit:cover;border-radius:8px;box-shadow:0 8px 24px #0008}
h1{font-size:28px;margin:24px 0 8px}p{color:#b3b3b3}.btn,button{display:inline-block;margin-top:16px;background:#1ed760;color:#000;padding:14px 32px;border-radius:999px;font-weight:700;text-decoration:none;border:0;font-size:16px;cursor:pointer}
input{width:100%;box-sizing:border-box;padding:14px;border-radius:6px;border:1px solid #333;background:#242424;color:#fff;font-size:16px;margin-top:12px}.err{color:#f15e6c}</style>
</head><body><main>${img ? `<img src="${img}" alt="">` : ''}<h1>${t}</h1>${d ? `<p>${d}</p>` : ''}${body}${
    deepLink ? `<a class="btn" href="${escapeHtml(deepLink)}">Open in MyMusic</a>` : ''
  }${webLink ? `<p><a href="${escapeHtml(webLink)}" style="color:#fff">or listen in your browser</a></p>` : ''}</main></body></html>`;
}

const send = (res, status, opts) => res.status(status).type('html').set('Cache-Control', 'no-store').send(page(opts));
const tokenParam = (v) => (typeof v === 'string' && v.length >= 20 && v.length <= 2048 ? v : null);

router.get('/p/:shareId', async (req, res) => {
  const shareId = String(req.params.shareId);
  const p = /^[\w-]{8,32}$/.test(shareId) && (await Playlist.findOne({ shareId }).populate('owner', 'displayName'));
  if (!p || p.visibility === 'private' || p.hidden) return send(res, 404, { title: 'Playlist not found', description: 'This link may have expired.', deepLink: 'mymusic://' });
  res.status(200).type('html').set('Cache-Control', 'public, max-age=300').send(
    page({
      title: p.name,
      description: `${p.description || 'Playlist'} · by ${p.owner?.displayName ?? 'MyMusic'} · ${p.items.length} songs`,
      image: p.coverUrl,
      deepLink: `mymusic://shared/${encodeURIComponent(p.shareId)}`,
      webLink: `/shared/${encodeURIComponent(p.shareId)}`,
    }),
  );
});

router.get('/invite/:token', (req, res) => {
  const token = tokenParam(req.params.token);
  if (!token) return send(res, 400, { title: 'Invalid invite' });
  send(res, 200, {
    title: 'You’re invited to collaborate',
    description: 'Open MyMusic to join this playlist.',
    deepLink: `mymusic://invite/${encodeURIComponent(token)}`,
    webLink: `/join/${encodeURIComponent(token)}`,
  });
});

// --- Email verification ----------------------------------------------------

router.get('/verify-email', authLimiter, async (req, res) => {
  const token = tokenParam(req.query.token);
  try {
    if (!token) throw new HttpError(400, 'This link is invalid or has expired');
    await verifyEmailToken(token);
    send(res, 200, { title: 'Email verified', description: 'Thanks! You can go back to the app.', deepLink: 'mymusic://', webLink: '/' });
  } catch (err) {
    send(res, 400, { title: 'Link expired', description: err instanceof HttpError ? err.message : 'Something went wrong.' });
  }
});

// --- Password reset ----------------------------------------------------------

const resetForm = (token, error) => `<form method="post" action="/reset-password" autocomplete="off">
<input type="hidden" name="token" value="${escapeHtml(token)}">
<input type="password" name="password" placeholder="New password (10+ characters)" minlength="10" maxlength="72" required autocomplete="new-password">
<input type="password" name="confirm" placeholder="Repeat new password" minlength="10" maxlength="72" required autocomplete="new-password">
${error ? `<p class="err">${escapeHtml(error)}</p>` : ''}<button type="submit">Save password</button></form>`;

router.get('/reset-password', (req, res) => {
  const token = tokenParam(req.query.token);
  if (!token) return send(res, 400, { title: 'Link expired', description: 'Request a new reset link from the app.' });
  // Don't leak the token to third parties via the Referer header.
  res.set('Referrer-Policy', 'no-referrer');
  send(res, 200, { title: 'Choose a new password', body: resetForm(token) });
});

router.post('/reset-password', authLimiter, express.urlencoded({ extended: false, limit: '10kb' }), async (req, res) => {
  const token = tokenParam(req.body?.token);
  const { password, confirm } = req.body ?? {};
  if (!token) return send(res, 400, { title: 'Link expired', description: 'Request a new reset link from the app.' });
  if (password !== confirm) return send(res, 400, { title: 'Choose a new password', body: resetForm(token, 'The passwords don’t match.') });
  const parsed = passwordSchema.safeParse(password);
  if (!parsed.success) return send(res, 400, { title: 'Choose a new password', body: resetForm(token, parsed.error.issues[0].message) });
  try {
    await resetPasswordWithToken(token, parsed.data);
    send(res, 200, { title: 'Password updated', description: 'You’ve been signed out everywhere. Log in with your new password.', deepLink: 'mymusic://', webLink: '/login' });
  } catch (err) {
    send(res, 400, { title: 'Link expired', description: err instanceof HttpError ? err.message : 'Something went wrong.' });
  }
});

// --- Stripe return pages -----------------------------------------------------

router.get('/billing/success', (_req, res) =>
  send(res, 200, { title: 'You’re all set', description: 'Your subscription is being activated. Return to MyMusic to start listening.', deepLink: 'mymusic://premium' }),
);
router.get('/billing/cancel', (_req, res) => send(res, 200, { title: 'Checkout cancelled', description: 'No charge was made.', deepLink: 'mymusic://premium' }));
router.get('/billing/return', (_req, res) => send(res, 200, { title: 'Billing updated', description: 'You can go back to MyMusic.', deepLink: 'mymusic://premium' }));

export default router;
