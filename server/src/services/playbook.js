import { hostingLabel, serviceLabel } from './matcher.js';

const IMPACT_ORDER = ['critical', 'high', 'medium', 'low', 'public'];

/**
 * The ordered checklist for one affected project. Pure: built from the
 * incident, the project and the match result.
 *
 * Steps: { key, title, detail, type: 'manual' | 'auto_verify', order, link }
 * An auto_verify step can only be completed by the system, after a new
 * lockfile shows the affected version is gone.
 */
export function buildPlaybook(incident, project, match) {
  const steps =
    incident.kind === 'vulnerability'
      ? vulnerabilitySteps(incident, project)
      : compromiseSteps(incident, project, match);
  return steps.map((step, index) => ({ link: null, detail: '', ...step, order: index + 1 }));
}

function host(project) {
  return project.hostingProvider === 'other' ? 'your hosting provider' : hostingLabel(project.hostingProvider);
}

function isDirectDependency(project, packageName) {
  return project.dependencies.some((dep) => dep.name === packageName && dep.isDirect);
}

function upgradeStep(incident, project) {
  const { packageName, fixedVersion } = incident.target;
  if (!fixedVersion) {
    return {
      key: 'upgrade',
      title: `Remove ${packageName} or replace it`,
      detail: `No fixed version of ${packageName} has been released yet. Remove it (npm uninstall ${packageName}) or switch to an alternative until a fix is published.`,
      type: 'manual',
    };
  }
  return {
    key: 'upgrade',
    title: `Upgrade ${packageName} to ${fixedVersion} or later`,
    detail: isDirectDependency(project, packageName)
      ? `Run: npm install ${packageName}@^${fixedVersion}`
      : `${packageName} comes from another package you installed. Update that package to a version that uses ${packageName} ${fixedVersion} or later, or add "overrides": { "${packageName}": "^${fixedVersion}" } to your package.json and run npm install.`,
    type: 'manual',
  };
}

function redeployStep(project) {
  return {
    key: 'redeploy',
    title: 'Redeploy your app',
    detail: `Deploy on ${host(project)} so the change is live.`,
    type: 'manual',
  };
}

function verifyLockfileStep(incident) {
  const { packageName, affectedRange } = incident.target;
  return {
    key: 'verify_lockfile',
    title: 'Upload your updated package-lock.json',
    detail: `We check it for you: this step completes by itself once no installed version of ${packageName} is in the affected range (${affectedRange}).`,
    type: 'auto_verify',
  };
}

function vulnerabilitySteps(incident, project) {
  if (incident.target.type === 'package') {
    return [upgradeStep(incident, project), redeployStep(project), verifyLockfileStep(incident)];
  }
  // A vulnerability in a service or host: the provider ships the fix.
  return [
    {
      key: 'apply_fix',
      title: `Apply the fix from ${incident.target.type === 'service' ? serviceLabel(incident.target.serviceKey) : hostingLabel(incident.target.hostingProvider)}`,
      detail: 'Follow the provider\'s instructions for this issue. The source link on this page has the details.',
      type: 'manual',
      link: incident.sourceUrl ?? null,
    },
    redeployStep(project),
  ];
}

function compromiseSteps(incident, project, match) {
  const steps = [];
  const { target } = incident;

  if (target.type === 'package') {
    steps.push({
      key: 'remove_package',
      title: `Remove ${target.packageName} or pin it to a safe version`,
      detail: target.fixedVersion
        ? `Run npm uninstall ${target.packageName}, or pin it to ${target.fixedVersion} or later in package.json and run npm install.`
        : `Run npm uninstall ${target.packageName}. Do not reinstall it until a safe version is announced.`,
      type: 'manual',
    });
  }

  const byName = new Map(project.secrets.map((secret) => [secret.name, secret]));
  const secrets = match.affectedSecrets
    .map((name) => byName.get(name) ?? { name, serviceLabel: 'the service', criticality: 'medium' })
    .sort(
      (a, b) =>
        IMPACT_ORDER.indexOf(a.criticality) - IMPACT_ORDER.indexOf(b.criticality) || a.name.localeCompare(b.name),
    );

  if (secrets.length === 0) {
    steps.push({
      key: 'list_secrets',
      title: 'List the secrets this app uses, then replace each one',
      detail: 'Add your secret names to this project so we can turn this into a step for each key.',
      type: 'manual',
    });
  }

  // New keys go live before old ones are revoked, so the app never goes down mid-rotation.
  for (const secret of secrets) {
    const words = rotationWords(secret);
    steps.push({
      key: `create:${secret.name}`,
      title: words.create,
      detail: [secret.rotateUrl ? null : words.where, secret.rotationNotes].filter(Boolean).join(' '),
      type: 'manual',
      link: secret.rotateUrl ?? null,
    });
    steps.push({
      key: `replace:${secret.name}`,
      title: `Replace ${secret.name} in your ${host(project)} environment settings`,
      detail: 'Paste the new value where the old one was. Do not delete the old key yet.',
      type: 'manual',
    });
  }

  steps.push(redeployStep(project));
  if (target.type === 'package') steps.push(verifyLockfileStep(incident));

  for (const secret of secrets) {
    steps.push({
      key: `revoke:${secret.name}`,
      title: rotationWords(secret).revoke,
      detail: 'Your app is now running on the new value, so removing the old one cannot take it down.',
      type: 'manual',
    });
  }
  for (const secret of secrets.filter((s) => s.criticality === 'critical')) {
    steps.push({
      key: `audit:${secret.name}`,
      title: rotationWords(secret).audit,
      detail: `Look for anything done with ${secret.name} since the incident that you did not do yourself.`,
      type: 'manual',
    });
  }
  return steps;
}

/**
 * Step wording per kind of secret. Your own login secret has no provider
 * dashboard, a database needs new credentials rather than an "API key", and
 * an unrecognised variable gets neutral wording.
 */
function rotationWords(secret) {
  const { name, serviceKey, serviceLabel: label } = secret;
  if (serviceKey === 'app_auth') {
    return {
      create: `Generate a new random value for ${name}`,
      where: 'For example, run: node -p "crypto.randomBytes(48).toString(\'base64url\')"',
      revoke: `Make sure the old ${name} is not used anywhere else`,
      audit: 'Check your app for sign-ins and admin actions you do not recognize',
    };
  }
  if (serviceKey === 'mongodb' || serviceKey === 'database') {
    return {
      create: `Create new database credentials for ${name}`,
      where: "Do this in your database provider's dashboard.",
      revoke: `Delete the old database user or password behind ${name}`,
      audit: 'Check your database for logins and changes you do not recognize',
    };
  }
  if (serviceKey === 'unknown') {
    return {
      create: `Create a new value for ${name}`,
      where: `Do this wherever ${name} was issued.`,
      revoke: `Revoke the old ${name} where it was issued`,
      audit: `Check where ${name} is used for activity you do not recognize`,
    };
  }
  return {
    create: `Create a new ${label} key to replace ${name}`,
    where: `Do this in your ${label} dashboard.`,
    revoke: `Revoke the old ${name} at ${label}`,
    audit: `Check ${label} logs and billing for activity you do not recognize`,
  };
}
