import { HttpError } from '../utils/httpError.js';

/** Use after requireAuth. The role comes from the database, never from the token. */
export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    throw new HttpError(403, 'FORBIDDEN', 'Only admins can manage incidents.');
  }
  next();
}
