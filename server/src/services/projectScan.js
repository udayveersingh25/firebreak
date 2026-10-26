import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { Project } from '../models/Project.js';
import { VulnCache } from '../models/VulnCache.js';
import { createOsvClient, OsvError } from './osvClient.js';
import { scanDependencies } from './scanner.js';

export const SCAN_COOLDOWN_MS = 30_000;
// A scan still "running" after this long was interrupted (e.g. a restart).
export const STALE_SCAN_MS = 3 * 60_000;

const OSV_UNAVAILABLE =
  'We could not reach the vulnerability database (OSV.dev), so your packages were not checked. This says nothing about whether you are affected. Please try again in a minute.';
const UNEXPECTED_FAILURE =
  'Something went wrong while checking your packages, so they were not checked. Please try again.';
const INTERRUPTED =
  'The check was interrupted before it finished, so your packages were not checked. Please try again.';

const osv = createOsvClient({ baseUrl: env.OSV_BASE_URL });

// OSV records shared by all projects, kept for 24 hours.
const cache = {
  async getMany(ids) {
    const docs = await VulnCache.find({ vulnId: { $in: ids } }).lean();
    return new Map(docs.map((doc) => [doc.vulnId, doc.data]));
  },
  async saveMany(records) {
    await VulnCache.bulkWrite(
      records.map((record) => ({
        updateOne: {
          filter: { vulnId: record.id },
          update: { $set: { data: record, fetchedAt: new Date() } },
          upsert: true,
        },
      })),
    );
  },
};

/** Seconds until this project may be scanned again (0 if it may now). */
export function secondsUntilNextScan(project, now = Date.now()) {
  const last = project.scan?.lastRunAt?.getTime();
  return last ? Math.max(0, Math.ceil((last + SCAN_COOLDOWN_MS - now) / 1000)) : 0;
}

/**
 * Marks the project as scanning and starts the scan in the background, so the
 * request returns at once and the page shows "Checking…". Pass { wait: true }
 * to wait for the result (used by tests).
 */
export async function startScan(project, { wait = false } = {}) {
  const runId = crypto.randomUUID();
  project.scan = { status: 'running', lastRunAt: new Date(), error: null, packagesScanned: 0, runId };
  project.findings = [];
  await project.save();

  const dependencies = project.dependencies.map(({ name, version, isDev, isDirect }) => ({ name, version, isDev, isDirect }));
  const job = runScan(project._id, runId, dependencies);
  if (wait) await job;
}

async function runScan(projectId, runId, dependencies) {
  let update;
  try {
    const findings = await scanDependencies(dependencies, { osv, cache });
    update = { 'scan.status': 'succeeded', 'scan.packagesScanned': dependencies.length, findings };
  } catch (error) {
    console.error(`[scan] project ${projectId} failed: ${error.message}`);
    update = {
      'scan.status': 'failed',
      'scan.error': error instanceof OsvError ? OSV_UNAVAILABLE : UNEXPECTED_FAILURE,
      findings: [],
    };
  }

  // Applied only if this is still the latest run. A newer lockfile or a retry
  // starts a new run, and an older run finishing late must not overwrite it.
  try {
    await Project.updateOne({ _id: projectId, 'scan.runId': runId }, { $set: update });
  } catch (error) {
    console.error(`[scan] could not save the result for project ${projectId}: ${error.message}`);
  }
}

/** Turns a scan that has been "running" for too long into a failure the user can retry. */
export async function expireStaleScan(project, now = Date.now()) {
  const startedAt = project.scan?.lastRunAt?.getTime();
  if (project.scan?.status !== 'running' || !startedAt || now - startedAt < STALE_SCAN_MS) return;

  project.scan.status = 'failed';
  project.scan.error = INTERRUPTED;
  await Project.updateOne(
    { _id: project._id, 'scan.runId': project.scan.runId },
    { $set: { 'scan.status': 'failed', 'scan.error': INTERRUPTED } },
  );
}
