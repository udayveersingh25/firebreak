import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { SESSION_COOKIE, sessionCookieOptions } from '../config/session.js';
import { User } from '../models/User.js';
import { readSessionToken } from '../services/authService.js';
import { HttpError } from '../utils/httpError.js';

/**
 * Loads the logged-in user from the database on every request, so a deleted
 * account or a changed role takes effect immediately rather than when the
 * 7-day token expires.
 */
export async function requireAuth(req, res, next) {
  const token = req.cookies?.[SESSION_COOKIE];
  const userId = readSessionToken(token, env.JWT_SECRET);
  const user = mongoose.isObjectIdOrHexString(userId) ? await User.findById(userId) : null;

  if (!user) {
    if (token) res.clearCookie(SESSION_COOKIE, sessionCookieOptions);
    throw new HttpError(401, 'UNAUTHENTICATED', 'Please log in to continue.');
  }

  req.user = user;
  next();
}
