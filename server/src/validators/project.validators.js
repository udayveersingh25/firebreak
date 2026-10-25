import { z } from 'zod';
import { HOSTING_PROVIDERS } from '../models/Project.js';
import { ENV_NAME_PATTERN } from '../services/envClassifier.js';

export const createProjectBody = z.object({
  name: z
    .string({ error: 'Enter a project name' })
    .trim()
    .min(1, 'Enter a project name')
    .max(60, 'Use at most 60 characters'),
  hostingProvider: z.enum(HOSTING_PROVIDERS, { error: 'Choose where this app is hosted' }),
});

export const lockfileBody = z.object({
  lockfile: z.string({ error: 'Upload your package-lock.json' }).min(1, 'The file is empty'),
});

// Names only, never values. The client already strips values in the browser;
// this is the second line of defence. The object is strict, so any extra key
// (such as "values") is rejected rather than silently dropped, and anything
// that is not a bare variable name, like "KEY=value", fails the pattern.
// Messages never repeat the rejected text, in case it was a secret.
export const secretsBody = z.strictObject(
  {
    names: z
      .array(
        z
          .string({ error: 'Each entry must be a variable name' })
          .min(1, 'Each entry must be a variable name')
          .max(100, 'Variable names can be at most 100 characters')
          .regex(ENV_NAME_PATTERN, 'Only variable names like STRIPE_SECRET_KEY are accepted, never values'),
        { error: 'Send a list of variable names' },
      )
      .max(200, 'Send at most 200 variable names'),
  },
  { error: 'Only a list of variable names is accepted' },
);
