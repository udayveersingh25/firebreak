import { parseEnv } from './envSchema.js';

const result = parseEnv(process.env);

if (!result.ok) {
  console.error(
    [
      'Firebreak cannot start because some environment variables are missing or invalid:',
      ...result.problems.map((problem) => `  - ${problem}`),
      '',
      'Local development: copy server/.env.example to server/.env and fill it in.',
      "On Render: add them in the service's Environment settings.",
    ].join('\n'),
  );
  process.exit(1);
}

/** Validated, read-only configuration. Import this instead of reading process.env. */
export const env = result.env;
export const isProduction = env.NODE_ENV === 'production';
