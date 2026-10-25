import { rateLimit } from 'express-rate-limit';
import { HttpError } from '../utils/httpError.js';

const FIFTEEN_MINUTES = 15 * 60 * 1000;

function limiter({ limit, message, ...options }) {
  return rateLimit({
    windowMs: FIFTEEN_MINUTES,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (req, res, next) => next(new HttpError(429, 'RATE_LIMITED', message)),
    ...options,
  });
}

/** Every /api request except the health check: 300 per 15 minutes per IP. */
export const apiLimiter = () =>
  limiter({ limit: 300, message: 'Too many requests. Please wait a few minutes and try again.' });

/** Account creation: 10 per 15 minutes per IP. */
export const registerLimiter = () =>
  limiter({ limit: 10, message: 'Too many sign-up attempts. Please wait 15 minutes and try again.' });

/**
 * Login: 10 failed attempts per 15 minutes per IP. Successful logins do not
 * count, so switching between demo accounts never locks anyone out, while
 * password guessing still stops after 10 tries.
 */
export const loginLimiter = () =>
  limiter({
    limit: 10,
    skipSuccessfulRequests: true,
    message: 'Too many failed login attempts. Please wait 15 minutes and try again.',
  });
