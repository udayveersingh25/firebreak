import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyNames } from '../src/services/envClassifier.js';
import { matchIncident } from '../src/services/matcher.js';

const project = (overrides = {}) => ({
  hostingProvider: 'zeabur',
  lockfile: { packageCount: 3 },
  dependencies: [
    { name: 'lodash', version: '4.17.15', isDev: false, isDirect: true },
    { name: 'minimist', version: '1.2.5', isDev: true, isDirect: true },
    { name: 'express', version: '4.17.1', isDev: false, isDirect: true },
  ],
  secrets: classifyNames(['VITE_STRIPE_PUBLISHABLE_KEY', 'STRIPE_SECRET_KEY', 'LITELLM_MASTER_KEY', 'JWT_SECRET']),
  secretsUpdatedAt: new Date(),
  ...overrides,
});

const lodashVuln = {
  kind: 'vulnerability',
  target: { type: 'package', packageName: 'lodash', affectedRange: '>=3.7.0 <4.17.19', fixedVersion: '4.17.19' },
};

describe('package targets', () => {
  test('affected when an installed version is in the range', () => {
    assert.deepEqual(matchIncident(lodashVuln, project()), {
      status: 'affected',
      reason: 'You have lodash 4.17.15 installed. Versions below 4.17.19 are affected.',
      affectedSecrets: [],
    });
  });

  test('not affected when the installed version is outside the range', () => {
    const result = matchIncident(lodashVuln, project({ dependencies: [{ name: 'lodash', version: '4.17.21', isDev: false, isDirect: true }] }));

    assert.equal(result.status, 'not_affected');
    assert.equal(result.reason, 'You have lodash 4.17.21 installed, which is not affected.');
  });

  test('not affected when the package is not installed at all', () => {
    const result = matchIncident(lodashVuln, project({ dependencies: [] }));

    assert.equal(result.status, 'not_affected');
    assert.match(result.reason, /not installed/);
  });

  test('unknown without a lockfile, and says how to fix that', () => {
    assert.deepEqual(matchIncident(lodashVuln, project({ lockfile: null, dependencies: [] })), {
      status: 'unknown',
      reason: 'Upload your package-lock.json so we can check.',
      affectedSecrets: [],
    });
  });

  test('a dev-only match says so', () => {
    const minimistVuln = { kind: 'vulnerability', target: { type: 'package', packageName: 'minimist', affectedRange: '<1.2.6', fixedVersion: '1.2.6' } };

    assert.match(matchIncident(minimistVuln, project()).reason, /only used during development/);
  });

  test('lists every affected version when several are installed', () => {
    const result = matchIncident(
      lodashVuln,
      project({
        dependencies: [
          { name: 'lodash', version: '4.17.15', isDev: false, isDirect: true },
          { name: 'lodash', version: '4.17.10', isDev: false, isDirect: false },
        ],
      }),
    );

    assert.match(result.reason, /lodash 4\.17\.15 and 4\.17\.10 installed/);
  });

  test('compromised package in production exposes every server-side secret', () => {
    const result = matchIncident({ ...lodashVuln, kind: 'compromise' }, project());

    assert.equal(result.status, 'affected');
    assert.deepEqual(result.affectedSecrets, ['STRIPE_SECRET_KEY', 'LITELLM_MASTER_KEY', 'JWT_SECRET']);
    assert.match(result.reason, /can read every environment variable/);
  });

  test('compromised dev-only package exposes the local .env, and says so', () => {
    const compromise = { kind: 'compromise', target: { type: 'package', packageName: 'minimist', affectedRange: '1.2.5' } };
    const result = matchIncident(compromise, project());

    assert.equal(result.status, 'affected');
    assert.equal(result.affectedSecrets.length, 3);
    assert.match(result.reason, /local \.env file/);
    assert.match(result.reason, /No fixed version has been released yet/);
  });
});

describe('service targets', () => {
  const litellm = { kind: 'compromise', target: { type: 'service', serviceKey: 'litellm' } };

  test('affected secrets are exactly the ones for that service', () => {
    assert.deepEqual(matchIncident(litellm, project()), {
      status: 'affected',
      reason: 'This project uses LITELLM_MASTER_KEY (LiteLLM proxy).',
      affectedSecrets: ['LITELLM_MASTER_KEY'],
    });
  });

  test('public-by-design keys never count', () => {
    const stripe = { kind: 'compromise', target: { type: 'service', serviceKey: 'stripe' } };
    const onlyPublic = project({ secrets: classifyNames(['VITE_STRIPE_PUBLISHABLE_KEY']) });

    assert.equal(matchIncident(stripe, onlyPublic).status, 'not_affected');
  });

  test('not affected when no secret belongs to the service', () => {
    const result = matchIncident(litellm, project({ secrets: classifyNames(['JWT_SECRET']) }));

    assert.equal(result.status, 'not_affected');
    assert.equal(result.reason, "None of this project's secrets belong to LiteLLM proxy.");
  });

  test('unknown when no secret names were given, and says how to fix that', () => {
    const result = matchIncident(litellm, project({ secrets: [], secretsUpdatedAt: null }));

    assert.equal(result.status, 'unknown');
    assert.match(result.reason, /Add your environment variable names/);
  });

  test('a vulnerability in a service does not mark secrets as exposed', () => {
    assert.deepEqual(matchIncident({ ...litellm, kind: 'vulnerability' }, project()).affectedSecrets, []);
  });
});

describe('hosting targets', () => {
  const zeabur = { kind: 'compromise', target: { type: 'hosting', hostingProvider: 'zeabur' } };

  test('a host breach exposes every server-side secret', () => {
    const result = matchIncident(zeabur, project());

    assert.equal(result.status, 'affected');
    assert.deepEqual(result.affectedSecrets, ['STRIPE_SECRET_KEY', 'LITELLM_MASTER_KEY', 'JWT_SECRET']);
  });

  test('another host is not affected', () => {
    const result = matchIncident(zeabur, project({ hostingProvider: 'vercel' }));

    assert.deepEqual(result, {
      status: 'not_affected',
      reason: 'This project is hosted on Vercel, not Zeabur.',
      affectedSecrets: [],
    });
  });

  test('affected even before secret names are known, with a prompt to add them', () => {
    const result = matchIncident(zeabur, project({ secrets: [], secretsUpdatedAt: null }));

    assert.equal(result.status, 'affected');
    assert.match(result.reason, /Add your secret names/);
  });
});

test('calm-notes is not affected by any of the demo incidents', () => {
  const calmNotes = project({
    hostingProvider: 'vercel',
    dependencies: [{ name: 'express', version: '5.3.0', isDev: false, isDirect: true }],
    secrets: classifyNames(['MONGODB_URI', 'JWT_SECRET', 'ANTHROPIC_API_KEY']),
  });

  for (const incident of [
    lodashVuln,
    { kind: 'compromise', target: { type: 'service', serviceKey: 'litellm' } },
    { kind: 'compromise', target: { type: 'hosting', hostingProvider: 'zeabur' } },
  ]) {
    assert.equal(matchIncident(incident, calmNotes).status, 'not_affected');
  }
});
