import { z } from 'zod';

// Typed strings everywhere: a value like { "$gt": "" } is rejected before it
// can reach a database query (NoSQL operator injection).

const email = z
  .string({ error: 'Enter your email address' })
  .trim()
  .toLowerCase()
  .max(254, 'That email address is too long')
  .pipe(z.email('Enter a valid email address'));

// bcrypt only looks at the first 72 bytes of a password. Longer passwords
// are rejected instead of being silently truncated.
const newPassword = z
  .string({ error: 'Enter a password' })
  .min(8, 'Use at least 8 characters')
  .refine((value) => Buffer.byteLength(value, 'utf8') <= 72, 'Use at most 72 characters');

export const registerBody = z.object({
  name: z
    .string({ error: 'Enter your name' })
    .trim()
    .min(1, 'Enter your name')
    .max(60, 'Use at most 60 characters'),
  email,
  password: newPassword,
});

export const loginBody = z.object({
  email,
  password: z
    .string({ error: 'Enter your password' })
    .min(1, 'Enter your password')
    .max(1024, 'That password is too long'),
});
