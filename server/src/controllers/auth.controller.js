import { env } from '../config/env.js';
import { SESSION_COOKIE, sessionCookieOptions } from '../config/session.js';
import { User } from '../models/User.js';
import {
  hashPassword,
  isAdminEmail,
  signSessionToken,
  verifyPassword,
} from '../services/authService.js';
import { HttpError } from '../utils/httpError.js';

const EMAIL_TAKEN = () =>
  new HttpError(409, 'EMAIL_TAKEN', 'An account with this email already exists. Try logging in instead.');

function startSession(res, user) {
  res.cookie(SESSION_COOKIE, signSessionToken(user._id, env.JWT_SECRET), sessionCookieOptions);
}

export async function register(req, res) {
  const { name, email, password } = req.validated.body;
  if (await User.exists({ email })) throw EMAIL_TAKEN();

  // The admin role comes only from the ADMIN_EMAILS setting, never from the request.
  const role = isAdminEmail(email, env.ADMIN_EMAILS) ? 'admin' : 'user';

  let user;
  try {
    user = await User.create({ name, email, passwordHash: await hashPassword(password), role });
  } catch (error) {
    // Two sign-ups with the same email at the same moment: the unique index decides.
    if (error?.code === 11000) throw EMAIL_TAKEN();
    throw error;
  }

  startSession(res, user);
  res.status(201).json({ user });
}

export async function login(req, res) {
  const { email, password } = req.validated.body;
  const user = await User.findOne({ email }).select('+passwordHash');

  // Same message for an unknown email and a wrong password, so the response
  // never reveals which emails have accounts.
  const passwordMatches = await verifyPassword(password, user?.passwordHash ?? null);
  if (!user || !passwordMatches) {
    throw new HttpError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
  }

  startSession(res, user);
  res.json({ user });
}

export function logout(req, res) {
  res.clearCookie(SESSION_COOKIE, sessionCookieOptions);
  res.status(204).end();
}

export function me(req, res) {
  res.json({ user: req.user });
}
