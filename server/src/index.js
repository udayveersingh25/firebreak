import fs from 'node:fs';
import path from 'node:path';
import { env, isProduction } from './config/env.js';
import { connectDatabase, describeConnectionError, disconnectDatabase } from './config/db.js';
import { createApp } from './app.js';

const clientDistPath = path.resolve(import.meta.dirname, '../../client/dist');
const clientIsBuilt = fs.existsSync(path.join(clientDistPath, 'index.html'));

try {
  await connectDatabase(env.MONGODB_URI);
  console.log('Connected to MongoDB');
} catch (error) {
  console.error(`Could not connect to MongoDB: ${describeConnectionError(error)}`);
  console.error(
    "Check MONGODB_URI, the database user's password, and Atlas Network Access (Render needs 0.0.0.0/0).",
  );
  process.exit(1);
}

if (isProduction && !clientIsBuilt) {
  console.warn('client/dist is missing, so only the API is served. Run "npm run build" first.');
}

const app = createApp({ clientDistPath: clientIsBuilt ? clientDistPath : undefined, logRequests: true });

const server = app.listen(env.PORT, (error) => {
  if (error) {
    console.error(`Could not start the server on port ${env.PORT}: ${error.message}`);
    process.exit(1);
  }
  console.log(`Firebreak is running at http://localhost:${env.PORT} (${env.NODE_ENV})`);
});

// Render sends SIGTERM before replacing an instance: finish in-flight
// requests, close the database connection, then exit. Force-exit after 10 s.
function shutdown(signal) {
  console.log(`${signal} received, shutting down`);
  setTimeout(() => process.exit(1), 10_000).unref();
  server.close(async () => {
    await disconnectDatabase();
    process.exit(0);
  });
}

process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
