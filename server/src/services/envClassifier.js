import {
  SECRET_MARKERS,
  SECRET_SUFFIXES,
  splitFrontendPrefix,
} from '../rules/frontendPrefixes.js';
import { SERVICE_RULES, UNKNOWN_SERVICE } from '../rules/serviceRules.js';

export const ENV_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Turns variable names (never values) into a secret inventory: which service
 * each belongs to, what an attacker could do with it, and whether a frontend
 * prefix ships it to every visitor's browser.
 */
export function classifyNames(names) {
  const unique = [...new Set(names)];
  return unique.map(classifyName);
}

export function classifyName(name) {
  const split = splitFrontendPrefix(name);
  // VITE_OPENAI_API_KEY is classified with the OPENAI_API_KEY rule.
  const baseName = split ? split.baseName : name;
  const rule = SERVICE_RULES.find(({ pattern }) => pattern.test(baseName));
  const service = rule ?? UNKNOWN_SERVICE;
  const publicByDesign = Boolean(rule?.publicByDesign);
  const exposedInFrontend = Boolean(split) && !publicByDesign && looksSecret(name, rule);

  return {
    name,
    serviceKey: service.serviceKey,
    serviceLabel: service.serviceLabel,
    capability: service.capability,
    criticality: service.criticality,
    publicByDesign,
    exposedInFrontend,
    exposureReason: exposedInFrontend
      ? `Variables starting with ${split.prefix} are bundled into your website's JavaScript. Anyone can open DevTools and copy this key.`
      : null,
    rotateUrl: rule?.rotateUrl ?? null,
    rotationNotes: rule?.rotationNotes ?? null,
    userOverride: false,
    lastRotatedAt: null,
  };
}

const IMPACT_ORDER = ['critical', 'high', 'medium', 'low'];

/**
 * Services a user can assign to a secret: one entry per serviceKey, described
 * by its most serious rule (Stripe -> "Create charges...", not the webhook rule).
 */
export const OVERRIDE_SERVICES = [
  ...SERVICE_RULES.filter((rule) => !rule.publicByDesign)
    .toSorted((a, b) => IMPACT_ORDER.indexOf(a.criticality) - IMPACT_ORDER.indexOf(b.criticality))
    .reduce((byKey, rule) => {
      if (!byKey.has(rule.serviceKey)) {
        byKey.set(rule.serviceKey, { serviceKey: rule.serviceKey, serviceLabel: rule.serviceLabel, capability: rule.capability });
      }
      return byKey;
    }, new Map())
    .values(),
  { serviceKey: UNKNOWN_SERVICE.serviceKey, serviceLabel: UNKNOWN_SERVICE.serviceLabel, capability: UNKNOWN_SERVICE.capability },
];

/**
 * Applies the user's correction of service and/or criticality. Choosing
 * "public" marks the variable as public by design, which also clears a
 * browser-exposure flag: the user knows their app better than our rules do.
 * The description only changes when the service changes, or when a variable
 * stops being public (its "public by design" text no longer applies).
 */
export function applyOverride(secret, { serviceKey, criticality }) {
  const nextCriticality = criticality ?? secret.criticality;
  const changingService = Boolean(serviceKey) && serviceKey !== secret.serviceKey;
  const leavingPublic = secret.publicByDesign && nextCriticality !== 'public';
  const service =
    changingService || leavingPublic
      ? OVERRIDE_SERVICES.find((entry) => entry.serviceKey === (serviceKey ?? secret.serviceKey))
      : null;

  const next = { ...secret, ...(service ?? {}), criticality: nextCriticality, userOverride: true };
  next.publicByDesign = nextCriticality === 'public';

  const split = splitFrontendPrefix(next.name);
  next.exposedInFrontend =
    Boolean(split) && !next.publicByDesign && looksSecret(next.name, { criticality: next.criticality });
  next.exposureReason = next.exposedInFrontend
    ? `Variables starting with ${split.prefix} are bundled into your website's JavaScript. Anyone can open DevTools and copy this key.`
    : null;
  return next;
}

// A browser-visible variable is only flagged when it is clearly a secret:
// a known high-impact key, or a name that says so. Anything else stays quiet,
// because false alarms break the "calm and correct" promise.
function looksSecret(name, rule) {
  if (rule && (rule.criticality === 'critical' || rule.criticality === 'high')) return true;
  const upper = name.toUpperCase();
  return SECRET_MARKERS.some((marker) => upper.includes(marker)) || SECRET_SUFFIXES.some((suffix) => upper.endsWith(suffix));
}
