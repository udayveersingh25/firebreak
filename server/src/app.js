import path from 'node:path';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import apiRoutes from './routes/index.js';
import healthRoutes from './routes/health.routes.js';
import { apiNotFound, errorHandler, notFound } from './middlewares/errorHandler.js';
import { apiLimiter } from './middlewares/rateLimits.js';
import { requestLogger } from './middlewares/requestLogger.js';

/**
 * Builds the Express app. One origin serves both the JSON API (/api/*) and the
 * built React client, so the auth cookie stays first-party and no CORS is needed.
 *
 * @param {object} [options]
 * @param {string} [options.clientDistPath] Folder with the built client (must contain index.html).
 * @param {boolean} [options.logRequests] Log one line per API request.
 */
export function createApp({ clientDistPath, logRequests = false } = {}) {
  const app = express();

  // Render runs exactly one proxy in front of the app. Trusting one hop makes
  // req.ip the real client address, which the rate limiters key on.
  app.set('trust proxy', 1);
  app.use(helmet());

  // Mounted before the rate limiter because Render calls it every few seconds.
  app.use('/api/health', healthRoutes);

  const api = express.Router();
  if (logRequests) api.use(requestLogger);
  api.use(apiLimiter());
  // Every body is limited to 100 kb, except the lockfile upload, which reads
  // its own (up to 6 MB) only after the login and ownership checks (see
  // project.routes.js), so nobody can make the server parse 6 MB anonymously.
  const smallJson = express.json({ limit: '100kb' });
  api.use((req, res, next) => (isLockfileUpload(req) ? next() : smallJson(req, res, next)));
  api.use(cookieParser());
  api.use(apiRoutes);
  api.use(apiNotFound);
  app.use('/api', api);

  if (clientDistPath) serveClient(app, clientDistPath);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

// Matches the same paths as router.put('/:id/lockfile') under /projects
// (Express routes ignore case and allow one trailing slash).
const LOCKFILE_UPLOAD = /^\/projects\/[^/]+\/lockfile\/?$/i;

function isLockfileUpload(req) {
  return req.method === 'PUT' && LOCKFILE_UPLOAD.test(req.path);
}

function serveClient(app, distPath) {
  // Vite puts a content hash in every file name under /assets, so those files
  // never change and browsers may cache them for a year. A missing asset is a
  // 404, never the HTML shell (which would fail with a confusing MIME error).
  app.use(
    '/assets',
    express.static(path.join(distPath, 'assets'), { immutable: true, maxAge: '1y', fallthrough: false }),
  );
  app.use(express.static(distPath, { index: false }));

  // Any other page request is a client-side route such as /projects/123:
  // send the app shell and let React Router render it.
  app.get('/{*splat}', (req, res, next) => {
    if (!req.accepts('html')) {
      next();
      return;
    }
    res.set('Cache-Control', 'no-cache');
    res.sendFile(path.join(distPath, 'index.html'));
  });
}
