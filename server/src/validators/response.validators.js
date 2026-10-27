import { z } from 'zod';
import { MIN_REASON_LENGTH } from '../services/responseMachine.js';

export const listResponsesQuery = z.object({
  project: z.string().regex(/^[a-f0-9]{24}$/, 'Not a valid project ID').optional(),
});

export const stepParams = z.object({
  id: z.string(),
  stepKey: z.string().min(1).max(160).regex(/^[a-z_]+(:[A-Za-z0-9_]+)?$/, 'Not a valid step'),
});

export const stepBody = z.object({
  done: z.boolean({ error: 'Say whether the step is done (true or false)' }),
});

export const notAffectedBody = z.object({
  reason: z
    .string({ error: 'Explain why this does not apply' })
    .trim()
    .min(MIN_REASON_LENGTH, `Explain why in at least ${MIN_REASON_LENGTH} characters`)
    .max(500, 'Use at most 500 characters'),
});
