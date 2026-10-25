export const MAX_LOCKFILE_BYTES = 5 * 1024 * 1024;

/** A lockfile problem the user can fix; `status` is the HTTP status to answer with. */
export class LockfileError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = 'LockfileError';
    this.code = code;
    this.status = status;
  }
}

const ROOT_DEPENDENCY_FIELDS = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];
const NODE_MODULES = 'node_modules/';

/**
 * Reads the raw text of a package-lock.json (npm 7 or newer) and returns every
 * distinct installed package with whether it is a development-only and/or a
 * direct dependency. Throws LockfileError with a plain-language message.
 */
export function parseLockfile(text) {
  if (Buffer.byteLength(text, 'utf8') > MAX_LOCKFILE_BYTES) {
    throw new LockfileError(
      'LOCKFILE_TOO_LARGE',
      'This file is larger than 5 MB. Make sure you picked package-lock.json and not a different file.',
      413,
    );
  }

  let lockfile;
  try {
    lockfile = JSON.parse(text);
  } catch {
    throw new LockfileError(
      'LOCKFILE_INVALID_JSON',
      'This file is not valid JSON, so it is not a package-lock.json. Firebreak supports npm lockfiles only (not yarn.lock or pnpm-lock.yaml).',
    );
  }
  if (lockfile === null || typeof lockfile !== 'object' || Array.isArray(lockfile)) {
    throw new LockfileError('LOCKFILE_NOT_NPM', 'This file does not look like a package-lock.json.');
  }

  const version = lockfile.lockfileVersion;
  if (version === 1) {
    throw new LockfileError(
      'LOCKFILE_V1',
      'This lockfile is from npm 6 or older. Run `npm install` with npm 7 or newer and upload the new file.',
    );
  }
  if (version !== 2 && version !== 3) {
    throw new LockfileError(
      'LOCKFILE_UNSUPPORTED_VERSION',
      'This file does not have a lockfile version we recognise. Upload the package-lock.json that npm 7 or newer creates.',
    );
  }

  const { packages } = lockfile;
  if (packages === null || typeof packages !== 'object' || Array.isArray(packages)) {
    throw new LockfileError(
      'LOCKFILE_NO_PACKAGES',
      'This lockfile has no "packages" section, so we cannot see what is installed. Run `npm install` with npm 7 or newer and upload the new file.',
    );
  }

  const root = packages[''] ?? {};
  const directNames = new Set(ROOT_DEPENDENCY_FIELDS.flatMap((field) => Object.keys(root[field] ?? {})));

  const byPair = new Map();
  for (const [key, entry] of Object.entries(packages)) {
    // Skip the project itself, local workspace folders, and links, which have no installed version.
    const lastIndex = key.lastIndexOf(NODE_MODULES);
    if (key === '' || lastIndex === -1 || entry?.link || typeof entry?.version !== 'string') continue;

    const name = key.slice(lastIndex + NODE_MODULES.length);
    const pair = `${name}@${entry.version}`;
    // Only `dev: true` is development-only. `devOptional` may also be installed
    // in production, so it counts as production: no false calm.
    const isDev = entry.dev === true;
    const isDirect = key === `${NODE_MODULES}${name}` && directNames.has(name);

    const existing = byPair.get(pair);
    if (existing) {
      // The same version can appear at several paths: it is production if any copy
      // is, and direct if any copy is.
      existing.isDev &&= isDev;
      existing.isDirect ||= isDirect;
    } else {
      byPair.set(pair, { name, version: entry.version, isDev, isDirect });
    }
  }

  const dependencies = [...byPair.values()].sort(
    (a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version),
  );
  return { lockfileVersion: version, packageCount: dependencies.length, dependencies };
}
