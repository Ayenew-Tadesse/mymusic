/** Build / update MongoDB indexes. Run on every deploy (autoIndex is off in production). */
import { connectDb, disconnectDb } from '../src/config/db.js';
import * as models from '../src/models/index.js';

await connectDb();
for (const [name, model] of Object.entries(models)) {
  await model.syncIndexes();
  console.log(`Indexes synced: ${name}`);
}
await disconnectDb();
