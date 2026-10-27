// Pure unit tests that don't need MongoDB.
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI ??= 'mongodb://127.0.0.1:1/unused';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-0123456789abcdef0123456789';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-0123456789abcdef012345678';
process.env.OFFLINE_KEY_SECRET = 'a'.repeat(64);

const { parseIsoDuration } = await import('../src/services/youtube.js');
const { Track } = await import('../src/models/index.js');
const { contentKeyFor } = await import('../src/services/offlineKeys.js');
const { signPurposeToken, verifyPurposeToken } = await import('../src/services/tokens.js');
const { escapeHtml } = await import('../src/utils/crypto.js');
const { default: request } = await import('supertest');
const { createApp } = await import('../src/app.js');

test('parses ISO 8601 durations', () => {
  expect(parseIsoDuration('PT3M25S')).toBe(205);
  expect(parseIsoDuration('PT1H2M')).toBe(3720);
  expect(parseIsoDuration('P1DT1S')).toBe(86401);
  expect(parseIsoDuration('garbage')).toBe(0);
});

test('track availability honours status, window, territory and use', () => {
  const base = { title: 't', artist: '0'.repeat(24), durationSec: 1, audioKey: 'audio/x.mp3', status: 'published' };
  const now = new Date();
  const t = new Track({ ...base, rights: { licenseType: 'licensed', licensor: 'L', territories: ['GB'], offlineAllowed: false, validFrom: new Date(0) } });
  expect(t.isAvailable('stream', 'GB', now)).toBe(true);
  expect(t.isAvailable('stream', 'US', now)).toBe(false);
  expect(t.isAvailable('stream', null, now)).toBe(false);
  expect(t.isAvailable('offline', 'GB', now)).toBe(false);
  t.rights.validUntil = new Date(now.getTime() - 1);
  expect(t.isAvailable('stream', 'GB', now)).toBe(false);
  const draft = new Track({ ...base, status: 'draft', rights: { licenseType: 'owned', licensor: 'L' } });
  expect(draft.isAvailable('stream', 'GB', now)).toBe(false);
});

test('offline content keys are stable per licence and 256-bit', () => {
  const k = contentKeyFor('abc');
  expect(Buffer.from(k, 'base64')).toHaveLength(32);
  expect(contentKeyFor('abc')).toBe(k);
  expect(contentKeyFor('abd')).not.toBe(k);
});

test('purpose tokens cannot cross flows', async () => {
  const token = await signPurposeToken('reset-password', { sub: 'u1' }, '5m');
  expect((await verifyPurposeToken('reset-password', token)).sub).toBe('u1');
  expect(await verifyPurposeToken('verify-email', token)).toBeNull();
});

test('escapes HTML', () => {
  expect(escapeHtml('<a href="x">&\'</a>')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
});

describe('HTTP layer without a database', () => {
  const api = request(createApp());
  test('health check', async () => {
    expect((await api.get('/healthz')).body).toEqual({ ok: true });
  });
  test('validation runs before the database', async () => {
    const res = await api.post('/api/v1/auth/register').send({ email: 'not-an-email', password: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('bad_request');
  });
  test('protected routes need a token', async () => {
    expect((await api.get('/api/v1/me')).status).toBe(401);
    expect((await api.get('/api/v1/admin/stats').set('Authorization', 'Bearer nope')).status).toBe(401);
  });
  test('webhook rejects requests when billing is not configured', async () => {
    expect((await api.post('/api/v1/billing/webhook').set('content-type', 'application/json').send('{}')).status).toBe(503);
  });
  test('security headers are set', async () => {
    const res = await api.get('/healthz');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
  });
  test('unknown routes are JSON 404s', async () => {
    expect((await api.get('/api/v1/nope')).status).toBe(404);
  });
});

describe('server-rendered pages', () => {
  const api = request(createApp());
  test('reset password form escapes the token and rejects mismatches', async () => {
    const token = '"><script>alert(1)</script>' + 'x'.repeat(20);
    const form = await api.get('/reset-password').query({ token });
    expect(form.status).toBe(200);
    expect(form.text).not.toContain('<script>alert(1)');
    expect(form.headers['referrer-policy']).toBe('no-referrer');
    const mismatch = await api.post('/reset-password').type('form').send({ token, password: 'aaaaaaaaaaaa1', confirm: 'bbbbbbbbbbbb1' });
    expect(mismatch.status).toBe(400);
    expect(mismatch.text).toContain('don’t match');
  });
  test('invalid email verification link', async () => {
    const res = await api.get('/verify-email').query({ token: 'not-a-real-token-but-long-enough' });
    expect(res.status).toBe(400);
    expect(res.text).toContain('Link expired');
  });
  test('billing return pages', async () => {
    expect((await api.get('/billing/success')).status).toBe(200);
  });
});
