import semver from 'semver';
import { OVERRIDE_SERVICES } from './envClassifier.js';

const HOSTING_LABELS = {
  vercel: 'Vercel',
  render: 'Render',
  railway: 'Railway',
  netlify: 'Netlify',
  zeabur: 'Zeabur',
  fly: 'Fly.io',
  other: 'another provider',
};

export function serviceLabel(serviceKey) {
  return OVERRIDE_SERVICES.find((service) => service.serviceKey === serviceKey)?.serviceLabel ?? serviceKey;
}

export function hostingLabel(provider) {
  return HOSTING_LABELS[provider] ?? provider;
}

/**
 * Does this incident affect this project? Pure: the same inputs always give
 * the same answer, and nothing is read or written.
 *
 * Returns { status: 'affected' | 'not_affected' | 'unknown', reason, affectedSecrets }.
 * 'unknown' always says what is missing, so the user knows how to find out.
 */
export function matchIncident(incident, project) {
  const { target } = incident;
  if (target.type === 'package') return matchPackage(incident, project);
  if (target.type === 'service') return matchService(incident, project);
  if (target.type === 'hosting') return matchHosting(incident, project);
  throw new Error(`Unknown incident target type: ${target.type}`);
}

function serverSideSecrets(project) {
  return project.secrets.filter((secret) => !secret.publicByDesign).map((secret) => secret.name);
}

function secretsKnown(project) {
  return Boolean(project.secretsUpdatedAt);
}

function matchPackage(incident, project) {
  const { packageName, affectedRange, fixedVersion } = incident.target;
  if (!project.lockfile) {
    return unknown('Upload your package-lock.json so we can check.');
  }

  const installed = project.dependencies.filter((dep) => dep.name === packageName);
  const matches = installed.filter(
    (dep) => semver.valid(dep.version) && semver.satisfies(dep.version, affectedRange, { includePrerelease: true }),
  );

  if (matches.length === 0) {
    return notAffected(
      installed.length === 0
        ? `${packageName} is not installed in this project.`
        : `You have ${packageName} ${listVersions(installed)} installed, which is not affected.`,
    );
  }

  const rangeText = fixedVersion
    ? `Versions below ${fixedVersion} are affected.`
    : `Affected versions: ${affectedRange}. No fixed version has been released yet.`;
  const devOnly = matches.every((dep) => dep.isDev);
  const sentences = [`You have ${packageName} ${listVersions(matches)} installed. ${rangeText}`];

  if (incident.kind === 'vulnerability') {
    if (devOnly) sentences.push('It is only used during development, so the risk to your users is low.');
    return affected(sentences.join(' '), []);
  }

  // A compromised (malicious) package can read process.env wherever it runs.
  sentences.push(
    devOnly
      ? 'It is only installed for development, but it runs on your computer, where your local .env file holds the same secrets. Treat them as exposed.'
      : 'Malicious code in this package can read every environment variable your server has, so treat all server-side secrets as exposed.',
  );
  if (!secretsKnown(project)) sentences.push('Add your secret names so we can list which keys to replace.');
  return affected(sentences.join(' '), serverSideSecrets(project));
}

function matchService(incident, project) {
  const { serviceKey } = incident.target;
  const label = serviceLabel(serviceKey);
  if (!secretsKnown(project)) {
    return unknown(`Add your environment variable names so we can check whether this project uses ${label}.`);
  }

  const secrets = project.secrets.filter((secret) => !secret.publicByDesign && secret.serviceKey === serviceKey);
  if (secrets.length === 0) {
    return notAffected(`None of this project's secrets belong to ${label}.`);
  }

  const names = secrets.map((secret) => secret.name);
  return affected(
    `This project uses ${listNames(names)} (${label}).`,
    incident.kind === 'compromise' ? names : [],
  );
}

function matchHosting(incident, project) {
  const { hostingProvider } = incident.target;
  if (project.hostingProvider !== hostingProvider) {
    return notAffected(
      `This project is hosted on ${hostingLabel(project.hostingProvider)}, not ${hostingLabel(hostingProvider)}.`,
    );
  }

  const sentences = [`This project is hosted on ${hostingLabel(hostingProvider)}.`];
  if (incident.kind === 'compromise') {
    sentences.push('Everything in its environment settings could have been read, so treat all server-side secrets as exposed.');
    if (!secretsKnown(project)) sentences.push('Add your secret names so we can list which keys to replace.');
  }
  return affected(sentences.join(' '), incident.kind === 'compromise' ? serverSideSecrets(project) : []);
}

function affected(reason, affectedSecrets) {
  return { status: 'affected', reason, affectedSecrets };
}

function notAffected(reason) {
  return { status: 'not_affected', reason, affectedSecrets: [] };
}

function unknown(reason) {
  return { status: 'unknown', reason, affectedSecrets: [] };
}

function listVersions(deps) {
  return listNames([...new Set(deps.map((dep) => dep.version))]);
}

function listNames(items) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}
