import { Project } from '../models/Project.js';
import { classifyNames } from '../services/envClassifier.js';
import { LockfileError, parseLockfile } from '../services/lockfileParser.js';
import { HttpError } from '../utils/httpError.js';

export async function listProjects(req, res) {
  const projects = await Project.find({ owner: req.user._id })
    .select('name hostingProvider lockfile secrets.exposedInFrontend secretsUpdatedAt scan.status createdAt updatedAt')
    .sort({ updatedAt: -1 })
    .lean();

  res.json({
    projects: projects.map((project) => ({
      id: String(project._id),
      name: project.name,
      hostingProvider: project.hostingProvider,
      packageCount: project.lockfile?.packageCount ?? null,
      secretCount: project.secretsUpdatedAt ? project.secrets.length : null,
      exposedCount: project.secrets.filter((secret) => secret.exposedInFrontend).length,
      scanStatus: project.scan.status,
      updatedAt: project.updatedAt,
    })),
  });
}

export async function createProject(req, res) {
  const project = await Project.create({ ...req.validated.body, owner: req.user._id });
  res.status(201).json({ project });
}

export function getProject(req, res) {
  res.json({ project: req.project });
}

export async function deleteProject(req, res) {
  await req.project.deleteOne();
  res.status(204).end();
}

export async function uploadLockfile(req, res) {
  let parsed;
  try {
    parsed = parseLockfile(req.validated.body.lockfile);
  } catch (error) {
    if (error instanceof LockfileError) throw new HttpError(error.status, error.code, error.message);
    throw error;
  }

  const { project } = req;
  project.lockfile = {
    uploadedAt: new Date(),
    lockfileVersion: parsed.lockfileVersion,
    packageCount: parsed.packageCount,
  };
  project.dependencies = parsed.dependencies;
  // Findings from the previous lockfile no longer describe what is installed.
  project.findings = [];
  project.scan = { status: 'never', lastRunAt: null, error: null, packagesScanned: 0 };
  await project.save();

  res.json({ project });
}

export async function replaceSecrets(req, res) {
  const { project } = req;
  const previous = new Map(project.secrets.map((secret) => [secret.name, secret]));

  project.secrets = classifyNames(req.validated.body.names).map((secret) => {
    // Keep what the user already told us about a secret that is still there.
    const known = previous.get(secret.name);
    if (!known) return secret;
    const kept = { ...secret, lastRotatedAt: known.lastRotatedAt };
    if (!known.userOverride) return kept;
    return {
      ...kept,
      userOverride: true,
      serviceKey: known.serviceKey,
      serviceLabel: known.serviceLabel,
      capability: known.capability,
      criticality: known.criticality,
    };
  });
  project.secretsUpdatedAt = new Date();
  await project.save();

  res.json({ project });
}
