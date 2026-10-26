import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyOverride, classifyName, classifyNames } from '../src/services/envClassifier.js';
import { SERVICE_RULES } from '../src/rules/serviceRules.js';

test('vibe-store: flags VITE_OPENAI_API_KEY and not VITE_STRIPE_PUBLISHABLE_KEY', () => {
  const secrets = classifyNames([
    'VITE_OPENAI_API_KEY',
    'VITE_STRIPE_PUBLISHABLE_KEY',
    'STRIPE_SECRET_KEY',
    'MONGODB_URI',
    'JWT_SECRET',
    'LITELLM_MASTER_KEY',
    'RESEND_API_KEY',
  ]);
  const exposed = secrets.filter((secret) => secret.exposedInFrontend).map((secret) => secret.name);

  assert.deepEqual(exposed, ['VITE_OPENAI_API_KEY']);
});

test('a frontend prefix is stripped before classifying', () => {
  const secret = classifyName('VITE_OPENAI_API_KEY');

  assert.equal(secret.serviceKey, 'openai');
  assert.equal(secret.criticality, 'high');
  assert.equal(
    secret.exposureReason,
    "Variables starting with VITE_ are bundled into your website's JavaScript. Anyone can open DevTools and copy this key.",
  );
});

test('public-by-design keys are never flagged, whatever the framework prefix', () => {
  for (const name of [
    'VITE_STRIPE_PUBLISHABLE_KEY',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'NEXT_PUBLIC_SUPABASE_URL',
    'VITE_FIREBASE_API_KEY',
    'REACT_APP_FIREBASE_AUTH_DOMAIN',
    'NEXT_PUBLIC_RAZORPAY_KEY_ID',
  ]) {
    const secret = classifyName(name);
    assert.equal(secret.publicByDesign, true, name);
    assert.equal(secret.exposedInFrontend, false, name);
  }
});

test('flags high-impact keys under every frontend prefix', () => {
  for (const name of [
    'NEXT_PUBLIC_STRIPE_SECRET_KEY',
    'REACT_APP_ANTHROPIC_API_KEY',
    'EXPO_PUBLIC_OPENAI_API_KEY',
    'NUXT_PUBLIC_MONGODB_URI',
    'PUBLIC_SUPABASE_SERVICE_ROLE_KEY',
    'GATSBY_GITHUB_TOKEN',
  ]) {
    assert.equal(classifyName(name).exposedInFrontend, true, name);
  }
});

test('flags unknown browser variables only when the name says they are secret', () => {
  assert.equal(classifyName('VITE_ADMIN_PASSWORD').exposedInFrontend, true);
  assert.equal(classifyName('NEXT_PUBLIC_WEBHOOK_SECRET').exposedInFrontend, true);
  assert.equal(classifyName('VITE_MAPBOX_TOKEN').exposedInFrontend, true);
  assert.equal(classifyName('VITE_API_BASE_URL').exposedInFrontend, false);
  assert.equal(classifyName('NEXT_PUBLIC_ANALYTICS_ID').exposedInFrontend, false);
});

test('server-only variables are never "exposed in the frontend"', () => {
  assert.equal(classifyName('STRIPE_SECRET_KEY').exposedInFrontend, false);
  assert.equal(classifyName('ADMIN_PASSWORD').exposedInFrontend, false);
});

test('specific rules win over wildcards', () => {
  assert.equal(classifyName('FIREBASE_PRIVATE_KEY').serviceKey, 'firebase_admin');
  assert.equal(classifyName('FIREBASE_SERVICE_ACCOUNT_JSON').criticality, 'critical');
  assert.equal(classifyName('FIREBASE_PROJECT_ID').publicByDesign, true);
  assert.equal(classifyName('STRIPE_WEBHOOK_SECRET').criticality, 'high');
  assert.equal(classifyName('LITELLM_MASTER_KEY').serviceKey, 'litellm');
  assert.equal(classifyName('LITELLM_SALT_KEY').serviceKey, 'litellm');
});

test('unrecognised names are medium and say so honestly', () => {
  const secret = classifyName('SOME_INTERNAL_THING');

  assert.equal(secret.serviceKey, 'unknown');
  assert.equal(secret.criticality, 'medium');
  assert.match(secret.capability, /do not recognise/);
});

test('login-system secrets explain that rotating logs users out', () => {
  assert.equal(classifyName('JWT_SECRET').rotationNotes, 'Rotating this logs every user out. That is expected and safe.');
});

test('duplicate names are kept once', () => {
  assert.equal(classifyNames(['JWT_SECRET', 'JWT_SECRET']).length, 1);
});

test('every rule has the fields the playbook needs', () => {
  for (const rule of SERVICE_RULES) {
    assert.ok(rule.serviceKey && rule.serviceLabel && rule.capability && rule.criticality, String(rule.pattern));
    if (rule.rotateUrl) assert.match(rule.rotateUrl, /^https:\/\//);
  }
});

test('correcting only the impact keeps the description', () => {
  const corrected = applyOverride(classifyName('STRIPE_SECRET_KEY'), { serviceKey: 'stripe', criticality: 'high' });

  assert.equal(corrected.criticality, 'high');
  assert.match(corrected.capability, /^Create charges/);
  assert.equal(corrected.userOverride, true);
});

test('marking a flagged variable as public clears the flag', () => {
  const corrected = applyOverride(classifyName('VITE_OPENAI_API_KEY'), { criticality: 'public' });

  assert.equal(corrected.publicByDesign, true);
  assert.equal(corrected.exposedInFrontend, false);
  assert.equal(corrected.exposureReason, null);
});

test('a public variable raised to high gets a real description and can be flagged', () => {
  const corrected = applyOverride(classifyName('VITE_STRIPE_PUBLISHABLE_KEY'), { criticality: 'high' });

  assert.match(corrected.capability, /^Create charges/);
  assert.equal(corrected.exposedInFrontend, true);
});

test('assigning a service to an unknown variable uses that service', () => {
  const corrected = applyOverride(classifyName('PAYMENTS_KEY'), { serviceKey: 'razorpay', criticality: 'critical' });

  assert.equal(corrected.serviceLabel, 'Razorpay');
  assert.equal(corrected.capability, 'Create and refund payments');
});
