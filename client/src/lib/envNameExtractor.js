// Runs in the browser. Takes the text of a .env or .env.example file and keeps
// only the variable NAMES. Each line's value is dropped as soon as the line is
// read and is never stored, logged, or sent anywhere.

const NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Returns unique variable names in the order they first appear. */
export function extractEnvNames(text) {
  const names = new Set();

  for (const rawLine of String(text).split(/\r?\n/)) {
    let line = rawLine.trim();
    if (line === '' || line.startsWith('#')) continue;
    if (line.startsWith('export ')) line = line.slice('export '.length);

    const equalsAt = line.indexOf('=');
    if (equalsAt === -1) continue;
    const name = line.slice(0, equalsAt).trim();
    if (NAME_PATTERN.test(name)) names.add(name);
  }

  return [...names];
}
