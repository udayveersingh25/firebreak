import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

export const BCRYPT_COST = 12;
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

export function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_COST);
}

let dummyHash;

/**
 * Checks a password against a stored hash. When the account does not exist,
 * pass `null`: we still run bcrypt against a throwaway hash, so a login for an
 * unknown email takes as long as one with a wrong password and response times
 * do not reveal which emails have accounts.
 */
export async function verifyPassword(password, passwordHash) {
  if (passwordHash) return bcrypt.compare(password, passwordHash);
  dummyHash ??= bcrypt.hash('not-a-real-password', BCRYPT_COST);
  await bcrypt.compare(password, await dummyHash);
  return false;
}

/** A signed session token whose payload is only the user ID (`sub`), valid for 7 days. */
export function signSessionToken(userId, secret) {
  return jwt.sign({}, secret, {
    subject: String(userId),
    expiresIn: SESSION_TTL_SECONDS,
    algorithm: 'HS256',
  });
}

/** Returns the user ID from a valid token, or null for a missing, tampered or expired one. */
export function readSessionToken(token, secret) {
  if (typeof token !== 'string' || token === '') return null;
  try {
    // Pinning the algorithm stops a forged token from choosing a weaker one (e.g. "none").
    const { sub } = jwt.verify(token, secret, { algorithms: ['HS256'] });
    return typeof sub === 'string' ? sub : null;
  } catch {
    return null;
  }
}

export function isAdminEmail(email, adminEmails) {
  return adminEmails.includes(email.toLowerCase());
}
