export const HOSTING_PROVIDERS = [
  { value: 'vercel', label: 'Vercel' },
  { value: 'render', label: 'Render' },
  { value: 'railway', label: 'Railway' },
  { value: 'netlify', label: 'Netlify' },
  { value: 'zeabur', label: 'Zeabur' },
  { value: 'fly', label: 'Fly.io' },
  { value: 'other', label: 'Somewhere else' },
];

export function hostingLabel(value) {
  return HOSTING_PROVIDERS.find((provider) => provider.value === value)?.label ?? value;
}

export function formatDate(value) {
  return new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** "Spend your OpenAI credits" -> "spend your OpenAI credits", for use mid-sentence. */
export function lowerFirst(text) {
  return text ? text[0].toLowerCase() + text.slice(1) : text;
}

/** The blast-radius sentence for one secret, worded for known, unknown and public ones. */
export function leakSentence(secret) {
  if (secret.publicByDesign) return `${secret.capability}.`;
  if (secret.serviceKey === 'unknown') {
    return `We do not recognise ${secret.name}, so we cannot say exactly what it unlocks. Treat it as sensitive, or use "Correct" to tell us what it is.`;
  }
  return `If ${secret.name} leaks, someone could ${lowerFirst(secret.capability)}.`;
}
