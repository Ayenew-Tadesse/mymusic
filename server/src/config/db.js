import mongoose from 'mongoose';
import env, { isProd } from './env.js';
import logger from './logger.js';

mongoose.set('strictQuery', true);
// Query operator injection is prevented by validating every request with zod
// (see middleware/validate.js) so handlers only ever see typed primitives.

export async function connectDb(uri = env.MONGODB_URI) {
  await mongoose.connect(uri, {
    // In production run `npm run db:indexes` during deploy, or set DB_AUTO_INDEX=true.
    autoIndex: env.DB_AUTO_INDEX ?? !isProd,
    maxPoolSize: 20,
    serverSelectionTimeoutMS: 10_000,
  });
  logger.info({ db: mongoose.connection.name }, 'MongoDB connected');
  return mongoose.connection;
}

export async function disconnectDb() {
  await mongoose.disconnect();
}
