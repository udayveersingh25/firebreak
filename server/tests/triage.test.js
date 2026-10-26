import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countByPriority, triageFinding, triageFindings } from '../src/services/triage.js';

const finding = (overrides) => ({
  vulnId: 'GHSA-1',
  packageName: 'pkg',
  severity: 'high',
  isDev: false,
  isDirect: true,
  ...overrides,
});

test('production + direct + critical or high: Fix now', () => {
  assert.equal(triageFinding(finding({ severity: 'critical' })).priority, 'fix_now');
  assert.equal(triageFinding(finding({ severity: 'high' })).priority, 'fix_now');
});

test('production + transitive + critical or high: Fix soon, explaining where it came from', () => {
  const result = triageFinding(finding({ isDirect: false }));

  assert.equal(result.priority, 'fix_soon');
  assert.match(result.explanation, /^This comes from a package you installed, not one you installed directly\./);
});

test('production + moderate, low or unknown: Plan a fix', () => {
  for (const severity of ['moderate', 'low', 'unknown']) {
    assert.equal(triageFinding(finding({ severity })).priority, 'plan_fix', severity);
    assert.equal(triageFinding(finding({ severity, isDirect: false })).priority, 'plan_fix', severity);
  }
});

test('dev-only, any severity: Low real-world risk, with the explanation', () => {
  for (const severity of ['critical', 'high', 'moderate', 'low', 'unknown']) {
    const result = triageFinding(finding({ severity, isDev: true }));
    assert.equal(result.priority, 'low_risk');
    assert.equal(
      result.explanation,
      'This package only runs on your computer during development, for example a file watcher. It is not part of what your users interact with.',
    );
  }
});

test('sorts by priority, then severity', () => {
  const sorted = triageFindings([
    finding({ vulnId: 'dev-critical', severity: 'critical', isDev: true }),
    finding({ vulnId: 'plan-low', severity: 'low' }),
    finding({ vulnId: 'now-high', severity: 'high' }),
    finding({ vulnId: 'plan-moderate', severity: 'moderate' }),
    finding({ vulnId: 'soon-critical', severity: 'critical', isDirect: false }),
    finding({ vulnId: 'now-critical', severity: 'critical' }),
  ]);

  assert.deepEqual(sorted.map((f) => f.vulnId), [
    'now-critical',
    'now-high',
    'soon-critical',
    'plan-moderate',
    'plan-low',
    'dev-critical',
  ]);
});

test('counts findings per priority, including zeros', () => {
  const counts = countByPriority(triageFindings([finding({}), finding({ isDev: true })]));

  assert.deepEqual(counts, { fix_now: 1, fix_soon: 0, plan_fix: 0, low_risk: 1 });
});
