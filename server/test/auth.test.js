import { start, stop, reset, signUp, models } from './helpers.js';

let api;
beforeAll(async () => { api = await start(); });
afterAll(stop);
beforeEach(reset);

describe('email auth', () => {
  test('register, read profile, login', async () => {
    const s = await signUp(api, { email: 'Ada@Example.com' });
    expect(s.user.email).toBe('ada@example.com');
    expect(s.user.providers.password).toBe(true);
    expect(s.refreshToken).toBeDefined();

    const me = await api.get('/api/v1/me').set(s.auth);
    expect(me.status).toBe(200);
    expect(me.body.user.displayName).toBeDefined();
    expect(me.body.user).not.toHaveProperty('passwordHash');

    const login = await api.post('/api/v1/auth/login').send({ email: 'ada@example.com', password: 'correct horse battery' });
    expect(login.status).toBe(200);
  });

  test('rejects duplicate email, weak password and wrong password', async () => {
    await signUp(api, { email: 'dup@example.com' });
    const dup = await api.post('/api/v1/auth/register').send({ email: 'dup@example.com', password: 'another long pass', displayName: 'x' });
    expect(dup.status).toBe(409);
    const weak = await api.post('/api/v1/auth/register').send({ email: 'w@example.com', password: 'short', displayName: 'x' });
    expect(weak.status).toBe(400);
    const wrong = await api.post('/api/v1/auth/login').send({ email: 'dup@example.com', password: 'nope nope nope' });
    expect(wrong.status).toBe(401);
  });

  test('refresh rotates tokens and detects reuse', async () => {
    const s = await signUp(api);
    const r1 = await api.post('/api/v1/auth/refresh').send({ refreshToken: s.refreshToken });
    expect(r1.status).toBe(200);
    expect(r1.body.refreshToken).not.toBe(s.refreshToken);

    // Replaying the old token revokes the family, including the new token.
    const replay = await api.post('/api/v1/auth/refresh').send({ refreshToken: s.refreshToken });
    expect(replay.status).toBe(401);
    const r2 = await api.post('/api/v1/auth/refresh').send({ refreshToken: r1.body.refreshToken });
    expect(r2.status).toBe(401);
  });

  test('logout-all invalidates existing access tokens', async () => {
    const s = await signUp(api);
    expect((await api.post('/api/v1/auth/logout-all').set(s.auth)).status).toBe(204);
    expect((await api.get('/api/v1/me').set(s.auth)).status).toBe(401);
  });

  test('suspended users are locked out', async () => {
    const s = await signUp(api);
    await models.User.updateOne({ _id: s.user.id }, { status: 'suspended' });
    expect((await api.get('/api/v1/me').set(s.auth)).status).toBe(403);
  });

  test('forgot password does not reveal whether an account exists', async () => {
    const res = await api.post('/api/v1/auth/password/forgot').send({ email: 'nobody@example.com' });
    expect(res.status).toBe(202);
  });

  test('admin routes need the admin role', async () => {
    const s = await signUp(api);
    expect((await api.get('/api/v1/admin/stats').set(s.auth)).status).toBe(403);
    await models.User.updateOne({ _id: s.user.id }, { role: 'admin' });
    expect((await api.get('/api/v1/admin/stats').set(s.auth)).status).toBe(200);
  });

  test('account deletion removes user data', async () => {
    const s = await signUp(api);
    await api.post('/api/v1/playlists').set(s.auth).send({ name: 'Mine' });
    const del = await api.delete('/api/v1/me').set(s.auth).send({ confirm: 'DELETE' });
    expect(del.status).toBe(204);
    expect(await models.User.countDocuments()).toBe(0);
    expect(await models.Playlist.countDocuments()).toBe(0);
  });
});
