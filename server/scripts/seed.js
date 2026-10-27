/**
 * Loads the demo: an admin, two demo users with their projects, and the three
 * simulated incidents (published). Safe to run again: everything is found by
 * a natural key (email, owner + project name, incident title) and only
 * created when missing, and fan-out never duplicates responses.
 *
 * Run: npm run seed (local) or `node server/scripts/seed.js` on Render.
 */
import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { connectDatabase, describeConnectionError } from '../src/config/db.js';
import { Incident } from '../src/models/Incident.js';
import { IncidentResponse } from '../src/models/IncidentResponse.js';
import { Notification } from '../src/models/Notification.js';
import { Project } from '../src/models/Project.js';
import { User } from '../src/models/User.js';
import { hashPassword } from '../src/services/authService.js';
import { classifyNames } from '../src/services/envClassifier.js';
import { fanOutIncident, rematchProject } from '../src/services/fanOut.js';
import { parseLockfile } from '../src/services/lockfileParser.js';
import { startScan } from '../src/services/projectScan.js';

// Shared demo password, printed in the README for evaluators. Override with SEED_PASSWORD.
const PASSWORD = process.env.SEED_PASSWORD || 'firebreak-demo';
const demoDir = path.resolve(import.meta.dirname, '../../demo');

const USERS = [
  { name: 'Maya (demo)', email: 'maya@example.com' },
  { name: 'Ravi (demo)', email: 'ravi@example.com' },
];

const PROJECTS = [
  { owner: 'maya@example.com', name: 'vibe-store', folder: 'vibe-store', hostingProvider: 'zeabur' },
  { owner: 'ravi@example.com', name: 'calm-notes', folder: 'calm-notes', hostingProvider: 'vercel' },
];

// Simulated incidents. Only the lodash range and fix come from a real advisory
// (GHSA-p6mc-m468-83gw on OSV.dev); the other two stay deliberately general.
const INCIDENTS = [
  {
    title: 'LiteLLM proxy compromise',
    description:
      'A self-hosted LiteLLM proxy setup was reported compromised. Anyone holding the proxy master key can use every AI provider key configured behind it. If your app uses a LiteLLM proxy, treat its master key as exposed and rotate it.',
    kind: 'compromise',
    target: { type: 'service', serviceKey: 'litellm' },
    severity: 'critical',
  },
  {
    title: 'Hosting provider breach',
    description:
      "A hosting provider reported unauthorised access to customers' environment settings. Every secret stored in that provider's environment variables should be treated as exposed and replaced.",
    kind: 'compromise',
    target: { type: 'hosting', hostingProvider: 'zeabur' },
    severity: 'high',
  },
  {
    title: 'lodash prototype pollution',
    description:
      'Older versions of lodash, a popular JavaScript helper library, have a flaw that lets crafted input change how objects behave across your app. Upgrading to 4.17.19 or later fixes it.',
    kind: 'vulnerability',
    target: { type: 'package', packageName: 'lodash', affectedRange: '>=3.7.0 <4.17.19', fixedVersion: '4.17.19' },
    severity: 'high',
    sourceUrl: 'https://osv.dev/vulnerability/GHSA-p6mc-m468-83gw',
  },
];

/** Variable names only: the same rule the browser uses, so values are never read into the database. */
function envNames(file) {
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .map((line) => line.trim().replace(/^export\s+/, ''))
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => line.split('=')[0].trim())
    .filter((name) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(name));
}

async function ensureUser({ name, email, role = 'user' }) {
  const existing = await User.findOne({ email });
  if (existing) {
    // Never reset someone's password; only make sure the admin is an admin.
    if (existing.role !== role) {
      existing.role = role;
      await existing.save();
    }
    return { user: existing, created: false };
  }
  const user = await User.create({ name, email, role, passwordHash: await hashPassword(PASSWORD) });
  return { user, created: true };
}

async function ensureProject({ owner, name, folder, hostingProvider }) {
  let project = await Project.findOne({ owner: owner._id, name });
  if (project) return { project, created: false };

  const parsed = parseLockfile(fs.readFileSync(path.join(demoDir, folder, 'package-lock.json'), 'utf8'));
  project = await Project.create({
    owner: owner._id,
    name,
    hostingProvider,
    lockfile: { uploadedAt: new Date(), lockfileVersion: parsed.lockfileVersion, packageCount: parsed.packageCount },
    dependencies: parsed.dependencies,
    secrets: classifyNames(envNames(path.join(demoDir, folder, '.env.example'))),
    secretsUpdatedAt: new Date(),
  });
  await startScan(project, { wait: true });
  await rematchProject(project._id);
  return { project: await Project.findById(project._id), created: true };
}

async function ensureIncident(fields, admin) {
  let incident = await Incident.findOne({ title: fields.title });
  const created = !incident;
  if (!incident) {
    incident = await Incident.create({ ...fields, sourceUrl: fields.sourceUrl ?? '', isSimulated: true, createdBy: admin._id });
  }
  if (incident.status === 'draft') {
    incident.status = 'published';
    incident.publishedAt = new Date();
    await incident.save();
  }
  if (incident.status === 'published') {
    incident.matchedCounts = await fanOutIncident(incident);
    await incident.save();
  }
  return { incident, created };
}

try {
  await connectDatabase(env.MONGODB_URI);
} catch (error) {
  console.error(`Could not connect to MongoDB: ${describeConnectionError(error)}`);
  process.exit(1);
}

try {
  await Promise.all([User, Project, Incident, IncidentResponse, Notification].map((model) => model.init()));

  const adminEmail = env.ADMIN_EMAILS[0];
  if (!adminEmail) throw new Error('ADMIN_EMAILS is empty, so there is no admin to seed.');
  const admin = await ensureUser({ name: 'Firebreak admin', email: adminEmail, role: 'admin' });
  console.log(`admin  ${adminEmail} ${admin.created ? 'created' : 'already there (password unchanged)'}`);

  const users = new Map();
  for (const fields of USERS) {
    const { user, created } = await ensureUser(fields);
    users.set(fields.email, user);
    console.log(`user   ${fields.email} ${created ? 'created' : 'already there'}`);
  }

  for (const fields of PROJECTS) {
    const { project, created } = await ensureProject({ ...fields, owner: users.get(fields.owner) });
    console.log(
      `project ${fields.name} ${created ? 'created' : 'already there'} (scan: ${project.scan.status}, ${project.findings.length} findings)`,
    );
  }

  for (const fields of INCIDENTS) {
    const { incident, created } = await ensureIncident(fields, admin.user);
    const { affected, unknown } = incident.matchedCounts ?? {};
    console.log(`incident "${fields.title}" ${created ? 'created' : 'already there'}, ${incident.status} (affected ${affected}, unknown ${unknown})`);
  }
  console.log('Seed complete.');
} catch (error) {
  console.error(`Seed failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
