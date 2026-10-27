import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyNames } from '../src/services/envClassifier.js';
import { matchIncident } from '../src/services/matcher.js';
import { buildPlaybook } from '../src/services/playbook.js';

const vibeStore = {
  hostingProvider: 'zeabur',
  lockfile: { packageCount: 2 },
  dependencies: [
    { name: 'lodash', version: '4.17.15', isDev: false, isDirect: true },
    { name: 'qs', version: '6.7.0', isDev: false, isDirect: false },
  ],
  secrets: classifyNames(['VITE_STRIPE_PUBLISHABLE_KEY', 'STRIPE_SECRET_KEY', 'LITELLM_MASTER_KEY', 'RESEND_API_KEY', 'JWT_SECRET']),
  secretsUpdatedAt: new Date(),
};

const playbookFor = (incident, project = vibeStore) => buildPlaybook(incident, project, matchIncident(incident, project));
const keys = (steps) => steps.map((step) => step.key);

describe('vulnerability in a package', () => {
  const lodash = {
    kind: 'vulnerability',
    target: { type: 'package', packageName: 'lodash', affectedRange: '>=3.7.0 <4.17.19', fixedVersion: '4.17.19' },
  };

  test('upgrade, redeploy, then a lockfile check only the system can complete', () => {
    const steps = playbookFor(lodash);

    assert.deepEqual(keys(steps), ['upgrade', 'redeploy', 'verify_lockfile']);
    assert.deepEqual(steps.map((s) => s.order), [1, 2, 3]);
    assert.equal(steps[0].title, 'Upgrade lodash to 4.17.19 or later');
    assert.equal(steps[0].detail, 'Run: npm install lodash@^4.17.19');
    assert.equal(steps[1].detail, 'Deploy on Zeabur so the change is live.');
    assert.equal(steps[2].type, 'auto_verify');
    assert.ok(steps.slice(0, 2).every((step) => step.type === 'manual'));
  });

  test('a transitive dependency explains the parent package and npm overrides', () => {
    const qs = { kind: 'vulnerability', target: { type: 'package', packageName: 'qs', affectedRange: '<6.7.3', fixedVersion: '6.7.3' } };

    assert.match(playbookFor(qs)[0].detail, /comes from another package.*"overrides": \{ "qs": "\^6\.7\.3" \}/);
  });

  test('without a fixed version, it says to remove or replace the package', () => {
    const steps = playbookFor({ ...lodash, target: { ...lodash.target, fixedVersion: null } });

    assert.equal(steps[0].title, 'Remove lodash or replace it');
  });
});

describe('compromise', () => {
  const litellm = { kind: 'compromise', target: { type: 'service', serviceKey: 'litellm' } };
  const zeabur = { kind: 'compromise', target: { type: 'hosting', hostingProvider: 'zeabur' } };

  test('creates and deploys new keys before revoking old ones', () => {
    const steps = playbookFor(litellm);

    assert.deepEqual(keys(steps), [
      'create:LITELLM_MASTER_KEY',
      'replace:LITELLM_MASTER_KEY',
      'redeploy',
      'revoke:LITELLM_MASTER_KEY',
      'audit:LITELLM_MASTER_KEY',
    ]);
    assert.equal(steps[1].title, 'Replace LITELLM_MASTER_KEY in your Zeabur environment settings');
  });

  test('a host breach rotates every server-side secret, most critical first, then by name', () => {
    const steps = playbookFor(zeabur);
    const created = steps.filter((s) => s.key.startsWith('create:')).map((s) => s.key);

    assert.deepEqual(created, [
      'create:JWT_SECRET',
      'create:LITELLM_MASTER_KEY',
      'create:STRIPE_SECRET_KEY',
      'create:RESEND_API_KEY',
    ]);
    assert.ok(!keys(steps).some((key) => key.includes('PUBLISHABLE')), 'public keys need no rotation');
  });

  test('every revoke comes after the redeploy, and audits only for critical secrets', () => {
    const steps = keys(playbookFor(zeabur));
    const redeploy = steps.indexOf('redeploy');

    assert.ok(steps.filter((key) => key.startsWith('create:') || key.startsWith('replace:')).every((key) => steps.indexOf(key) < redeploy));
    assert.ok(steps.filter((key) => key.startsWith('revoke:')).every((key) => steps.indexOf(key) > redeploy));
    assert.ok(!steps.includes('audit:RESEND_API_KEY'));
    assert.ok(steps.includes('audit:STRIPE_SECRET_KEY'));
  });

  test('includes the rotation link and notes', () => {
    const steps = playbookFor(zeabur);
    const stripe = steps.find((s) => s.key === 'create:STRIPE_SECRET_KEY');
    const jwt = steps.find((s) => s.key === 'create:JWT_SECRET');

    assert.equal(stripe.link, 'https://dashboard.stripe.com/apikeys');
    assert.match(jwt.detail, /Rotating this logs every user out\. That is expected and safe\./);
  });

  test('wording fits the kind of secret', () => {
    const steps = playbookFor(zeabur, { ...vibeStore, secrets: classifyNames(['JWT_SECRET', 'MONGODB_URI', 'MY_THING_KEY', 'RESEND_API_KEY']) });
    const title = (key) => steps.find((s) => s.key === key).title;

    assert.equal(title('create:JWT_SECRET'), 'Generate a new random value for JWT_SECRET');
    assert.equal(title('create:MONGODB_URI'), 'Create new database credentials for MONGODB_URI');
    assert.equal(title('create:MY_THING_KEY'), 'Create a new value for MY_THING_KEY');
    assert.equal(title('create:RESEND_API_KEY'), 'Create a new Resend key to replace RESEND_API_KEY');
    assert.equal(title('revoke:RESEND_API_KEY'), 'Revoke the old RESEND_API_KEY at Resend');
    assert.doesNotMatch(JSON.stringify(steps), /Your app's login system key|your Your/);
  });

  test('a compromised package is removed first and verified from the lockfile', () => {
    const steps = playbookFor({ kind: 'compromise', target: { type: 'package', packageName: 'lodash', affectedRange: '4.17.15' } });

    assert.equal(steps[0].key, 'remove_package');
    assert.ok(keys(steps).indexOf('verify_lockfile') === keys(steps).indexOf('redeploy') + 1);
  });

  test('when secret names are unknown, asks for them instead of inventing steps', () => {
    const steps = playbookFor(zeabur, { ...vibeStore, secrets: [], secretsUpdatedAt: null });

    assert.deepEqual(keys(steps), ['list_secrets', 'redeploy']);
  });
});
