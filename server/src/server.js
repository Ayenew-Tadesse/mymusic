import env from './config/env.js';
import logger from './config/logger.js';
import { connectDb, disconnectDb } from './config/db.js';
import { createApp } from './app.js';

await connectDb();
const server = createApp().listen(env.PORT, () => logger.info({ port: env.PORT }, 'MyMusic API listening'));
// Slightly above typical load balancer idle timeouts to avoid 502s on reused connections.
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'Shutting down');
  server.close(async () => {
    await disconnectDb();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 15_000).unref();
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
process.on('unhandledRejection', (err) => logger.error({ err }, 'Unhandled rejection'));
