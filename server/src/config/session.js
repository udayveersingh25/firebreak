import { isProduction } from './env.js';
import { SESSION_TTL_SECONDS } from '../services/authService.js';

export const SESSION_COOKIE = 'firebreak_session';

// httpOnly: page JavaScript (and any injected script) cannot read the token.
// secure: sent over HTTPS only in production (local dev runs on plain http).
// sameSite lax: other sites cannot make the browser send it with their
// POST/PATCH/DELETE requests, which is our protection against CSRF.
export const sessionCookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: 'lax',
  path: '/',
  maxAge: SESSION_TTL_SECONDS * 1000,
};
