// Build tools copy variables with these prefixes into the JavaScript that is
// sent to every visitor's browser. Longest first, so NEXT_PUBLIC_ is found
// before PUBLIC_.
export const FRONTEND_PREFIXES = [
  { prefix: 'NEXT_PUBLIC_', tool: 'Next.js' },
  { prefix: 'NUXT_PUBLIC_', tool: 'Nuxt' },
  { prefix: 'EXPO_PUBLIC_', tool: 'Expo' },
  { prefix: 'REACT_APP_', tool: 'Create React App' },
  { prefix: 'GATSBY_', tool: 'Gatsby' },
  { prefix: 'PUBLIC_', tool: 'SvelteKit and Astro' },
  { prefix: 'VITE_', tool: 'Vite' },
];

/** Words that mark a variable as secret even when no service rule knows it. */
export const SECRET_MARKERS = ['SECRET', 'PRIVATE', 'SERVICE_ROLE', 'PASSWORD'];
export const SECRET_SUFFIXES = ['_TOKEN'];

/** { prefix, baseName } for VITE_OPENAI_API_KEY -> VITE_ and OPENAI_API_KEY, or null. */
export function splitFrontendPrefix(name) {
  const match = FRONTEND_PREFIXES.find(({ prefix }) => name.startsWith(prefix) && name.length > prefix.length);
  return match ? { prefix: match.prefix, baseName: name.slice(match.prefix.length) } : null;
}
