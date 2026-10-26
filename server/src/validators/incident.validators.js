import semver from 'semver';
import { z } from 'zod';
import { INCIDENT_KINDS, INCIDENT_SEVERITIES } from '../models/Incident.js';
import { HOSTING_PROVIDERS } from '../models/Project.js';
import { OVERRIDE_SERVICES } from '../services/envClassifier.js';

const NPM_NAME = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;
const SERVICE_KEYS = OVERRIDE_SERVICES.map((service) => service.serviceKey).filter((key) => key !== 'unknown');

// Empty optional text fields from the form become null.
const optional = (schema) =>
  z.preprocess((value) => (value === '' || value === undefined ? null : value), schema.nullable());

const target = z.discriminatedUnion(
  'type',
  [
    z.object({
      type: z.literal('package'),
      packageName: z
        .string({ error: 'Enter the npm package name' })
        .trim()
        .min(1, 'Enter the npm package name')
        .max(214, 'That package name is too long')
        .regex(NPM_NAME, 'Enter an npm package name, such as lodash or @scope/name'),
      // Checked with semver when saving, so the matcher never meets a bad range.
      affectedRange: z
        .string({ error: 'Enter the affected version range' })
        .trim()
        .min(1, 'Enter the affected version range')
        .max(200, 'That range is too long')
        .refine((range) => semver.validRange(range) !== null, 'Enter a valid range, such as <4.17.21 or >=1.0.0 <1.2.6'),
      fixedVersion: optional(
        z.string().trim().refine((version) => semver.valid(version) !== null, 'Enter a version number, such as 4.17.21'),
      ),
    }),
    z.object({
      type: z.literal('service'),
      serviceKey: z.enum(SERVICE_KEYS, { error: 'Choose the affected service' }),
    }),
    z.object({
      type: z.literal('hosting'),
      hostingProvider: z.enum(HOSTING_PROVIDERS, { error: 'Choose the affected hosting provider' }),
    }),
  ],
  { error: 'Choose what this incident affects' },
);

export const incidentBody = z.object({
  title: z
    .string({ error: 'Enter a title' })
    .trim()
    .min(5, 'Use at least 5 characters')
    .max(120, 'Use at most 120 characters'),
  description: z
    .string({ error: 'Describe the incident in plain language' })
    .trim()
    .min(20, 'Write at least a sentence or two (20 characters)')
    .max(2000, 'Use at most 2000 characters'),
  kind: z.enum(INCIDENT_KINDS, { error: 'Choose vulnerability or compromise' }),
  severity: z.enum(INCIDENT_SEVERITIES, { error: 'Choose a severity' }),
  sourceUrl: optional(z.url({ protocol: /^https?$/, error: 'Enter a full link starting with https://' })),
  isSimulated: z.boolean({ error: 'Say whether this incident is simulated' }),
  target,
});
