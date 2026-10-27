// Test environment must be set before any app module is imported.
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI ??= 'mongodb://placeholder';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-0123456789abcdef0123456789';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-0123456789abcdef012345678';
process.env.OFFLINE_KEY_SECRET = 'a'.repeat(64);

const { MongoMemoryServer } = await import('mongodb-memory-server');
const { default: mongoose } = await import('mongoose');
const { default: request } = await import('supertest');
const { createApp } = await import('../src/app.js');
const models = await import('../src/models/index.js');

let mongo;
/**
 * Uses MONGODB_TEST_URI when set (e.g. a CI service container), otherwise
 * starts an in-memory MongoDB (downloads a mongod binary on first run).
 */
export async function start() {
  let uri = process.env.MONGODB_TEST_URI;
  if (!uri) {
    mongo = await MongoMemoryServer.create();
    uri = mongo.getUri();
  }
  await mongoose.connect(uri, { dbName: `mymusic_test_${process.pid}` });
  await Promise.all(Object.values(models).map((m) => m.init()));
  return request(createApp());
}

export async function stop() {
  if (!mongo) await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  await mongo?.stop();
}

export async function reset() {
  await Promise.all(Object.values(models).map((m) => m.deleteMany({})));
}

let n = 0;
export async function signUp(api, overrides = {}) {
  n += 1;
  const res = await api
    .post('/api/v1/auth/register')
    .send({ email: `user${n}@example.com`, password: 'correct horse battery', displayName: `User ${n}`, ...overrides });
  if (res.status !== 201) throw new Error(`signup failed ${res.status} ${JSON.stringify(res.body)}`);
  return { ...res.body, auth: { Authorization: `Bearer ${res.body.accessToken}` } };
}

export { models, mongoose };
