import { databaseStatus } from '../config/db.js';

/**
 * Render calls this every few seconds. It reports healthy only while the
 * database is connected, so Render never sends traffic to an instance that
 * cannot serve it, and restarts one whose connection stays broken.
 */
export function getHealth(req, res) {
  const database = databaseStatus();
  const healthy = database === 'connected';

  res.set('Cache-Control', 'no-store');
  res.status(healthy ? 200 : 503).json({ status: healthy ? 'ok' : 'unavailable', database });
}
