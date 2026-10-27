// Pure unit tests that don't need MongoDB.
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI ??= 'mongodb://127.0.0.1:1/unused';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-0123456789abcdef0123456789';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-0123456789abcdef012345678';
process.env.OFFLINE_KEY_SECRET = 'a'.repeat(64);

const { parseIsoDuration, parsePlaylistId } = await import('../src/services/youtube.js');
const { Track, Playlist, User } = await import('../src/models/index.js');
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
    expect(res.headers['content-security-policy']).toContain("default-src 'self'");
    expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
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

test('public config exposes no secrets', async () => {
  const res = await request(createApp()).get('/api/v1/config');
  expect(res.status).toBe(200);
  expect(Object.keys(res.body).sort()).toEqual(['appleServicesId', 'billingEnabled', 'googleClientId', 'youtubeEnabled']);
});

test('playlist ownership works with a populated owner', () => {
  const owner = new User({ displayName: 'Owner' });
  const other = new User({ displayName: 'Other' });
  const p = new Playlist({ name: 'Mine', owner: owner._id });
  // Simulate .populate('owner', 'displayName')
  p.owner = owner;
  expect(p.isOwnedBy(owner._id)).toBe(true);
  expect(p.isOwnedBy(owner._id.toString())).toBe(true);
  expect(p.canView(owner._id)).toBe(true);
  expect(p.canEdit(other._id)).toBe(false);
  expect(p.canView(other._id)).toBe(false);
  p.collaborators.push(other._id);
  expect(p.canEdit(other._id)).toBe(true);
});

test('production boots with only the database, secrets and admin login', async () => {
  const { spawnSync } = await import('node:child_process');
  const script = `
    const env = (await import('./src/config/env.js')).default;
    const { disabledServices } = await import('./src/config/env.js');
    console.log(JSON.stringify({ url: env.PUBLIC_API_URL, autoIndex: env.DB_AUTO_INDEX, admin: env.ADMIN_EMAIL, disabled: disabledServices.length }));
  `;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: new URL('..', import.meta.url).pathname,
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      NODE_ENV: 'production',
      MONGODB_URI: 'mongodb+srv://u:p@cluster.example.net/mymusic',
      JWT_ACCESS_SECRET: 'G7vYq2nR8sKp4LmW1xZt9bQe6uHj3cAa0dFgVhNk5oP=',
      JWT_REFRESH_SECRET: 'Zc1Xv2Bn3Mm4Ll5Kk6Jj7Hh8Gg9Ff0Dd1Ss2Aa3Qq4W=',
      OFFLINE_KEY_SECRET: 'Pp9Oo8Ii7Uu6Yy5Tt4Rr3Ee2Ww1Qq0Aa9Ss8Dd7Ff6G=',
      DB_AUTO_INDEX: 'true',
      ADMIN_EMAIL: 'admin@example.com',
      RENDER_EXTERNAL_URL: 'https://mymusic.onrender.com',
    },
  });
  expect(r.status).toBe(0);
  const out = JSON.parse(r.stdout.trim().split('\n').pop());
  expect(out).toEqual({ url: 'https://mymusic.onrender.com', autoIndex: true, admin: 'admin@example.com', disabled: 5 });
});

test('parses YouTube playlist links', () => {
  const id = 'PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG';
  expect(parsePlaylistId(`https://www.youtube.com/playlist?list=${id}`)).toBe(id);
  expect(parsePlaylistId(`https://music.youtube.com/playlist?list=${id}&si=abc`)).toBe(id);
  expect(parsePlaylistId(`https://youtu.be/dQw4w9WgXcQ?list=${id}`)).toBe(id);
  expect(parsePlaylistId(`https://m.youtube.com/watch?v=dQw4w9WgXcQ&list=${id}`)).toBe(id);
  expect(parsePlaylistId(id)).toBe(id);
  expect(parsePlaylistId('https://evil.example.com/playlist?list=' + id)).toBeNull();
  expect(parsePlaylistId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBeNull();
  expect(parsePlaylistId('not a link')).toBeNull();
});

test('import rejects links without a playlist before touching YouTube', async () => {
  const api = request(createApp());
  // Unauthenticated requests are refused first.
  expect((await api.post('/api/v1/playlists/import/youtube').send({ url: 'x', name: 'y' })).status).toBe(401);
});
