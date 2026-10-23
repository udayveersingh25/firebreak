import { z } from 'zod';

// "a@example.com, b@example.com" -> ['a@example.com', 'b@example.com'].
// Lowercased because user emails are lowercased before they are saved.
const adminEmails = z
  .string()
  .transform((value) =>
    value
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  )
  .pipe(
    z
      .array(z.email('contains an invalid email address'))
      .min(1, 'needs at least one email address'),
  );

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  MONGODB_URI: z
    .string()
    .regex(/^mongodb(\+srv)?:\/\//, 'must start with mongodb:// or mongodb+srv://'),
  JWT_SECRET: z.string().min(32, 'must be at least 32 characters (use a long random string)'),
  ADMIN_EMAILS: adminEmails,
  OSV_BASE_URL: z.url({ protocol: /^https?$/ }).default('https://api.osv.dev'),
});

/**
 * Validates environment variables. Empty values count as missing, so optional
 * ones fall back to their defaults. Problems name the variable and the rule it
 * breaks but never the value, so a misconfigured secret is not echoed into logs.
 */
export function parseEnv(source) {
  const input = Object.fromEntries(
    Object.keys(envSchema.shape).map((key) => [key, source[key] === '' ? undefined : source[key]]),
  );

  const result = envSchema.safeParse(input);
  if (result.success) {
    return { ok: true, env: Object.freeze(result.data) };
  }

  const problems = result.error.issues.map((issue) => {
    const name = issue.path[0];
    return `${name}: ${input[name] === undefined ? 'is missing' : issue.message}`;
  });
  return { ok: false, problems: [...new Set(problems)] };
}
