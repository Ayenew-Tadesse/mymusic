import nodemailer from 'nodemailer';
import env, { isProd } from '../config/env.js';
import logger from '../config/logger.js';
import { escapeHtml } from '../utils/crypto.js';

const transport = env.SMTP_URL ? nodemailer.createTransport(env.SMTP_URL) : null;

async function send({ to, subject, text, html }) {
  if (!transport) {
    if (isProd) {
      // Never log message bodies in production: they contain sign-in links.
      logger.warn({ subject }, 'Email not sent: SMTP_URL is not configured');
      return;
    }
    // Development fallback: print the email so links can be followed locally.
    logger.info({ to, subject, text }, 'Email (not sent, SMTP_URL unset)');
    return;
  }
  await transport.sendMail({ from: env.MAIL_FROM, to, subject, text, html });
}

const layout = (title, body, link, cta) => `<!doctype html><html><body style="font-family:system-ui,sans-serif;background:#121212;color:#fff;padding:24px">
<h2 style="color:#1ed760">${escapeHtml(title)}</h2><p>${escapeHtml(body)}</p>
<p><a href="${escapeHtml(link)}" style="background:#1ed760;color:#000;padding:12px 20px;border-radius:24px;text-decoration:none;font-weight:600">${escapeHtml(cta)}</a></p>
<p style="color:#aaa;font-size:12px">If you didn't request this, you can ignore this email.</p></body></html>`;

export function sendVerificationEmail(to, link) {
  const body = 'Confirm your email address to finish setting up your MyMusic account.';
  return send({ to, subject: 'Verify your MyMusic email', text: `${body}\n\n${link}`, html: layout('Verify your email', body, link, 'Verify email') });
}

export function sendPasswordResetEmail(to, link) {
  const body = 'Someone asked to reset the password for your MyMusic account. This link is valid for 30 minutes.';
  return send({ to, subject: 'Reset your MyMusic password', text: `${body}\n\n${link}`, html: layout('Reset your password', body, link, 'Choose a new password') });
}
