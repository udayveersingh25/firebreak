import { Project } from '../models/Project.js';
import { applyOverride, classifyNames } from '../services/envClassifier.js';
import { LockfileError, parseLockfile } from '../services/lockfileParser.js';
import { expireStaleScan, secondsUntilNextScan, startScan } from '../services/projectScan.js';
import { countByPriority } from '../services/triage.js';
import { HttpError } from '../utils/httpError.js';

export async function listProjects(req, res) {
  const projects = await Project.find({ owner: req.user._id })
    .select('name hostingProvider lockfile secrets.exposedInFrontend secretsUpdatedAt scan findings.priority createdAt updatedAt')
    .sort({ updatedAt: -1 });
  await Promise.all(projects.map((project) => expireStaleScan(project)));

  res.json({
    projects: projects.map((project) => ({
      id: String(project._id),
      name: project.name,
      hostingProvider: project.hostingProvider,
      packageCount: project.lockfile?.packageCount ?? null,
      secretCount: project.secretsUpdatedAt ? project.secrets.length : null,
      exposedCount: project.secrets.filter((secret) => secret.exposedInFrontend).length,
      scanStatus: project.scan.status,
      findingCounts: project.scan.status === 'succeeded' ? countByPriority(project.findings) : null,
      updatedAt: project.updatedAt,
    })),
  });
}

export async function createProject(req, res) {
  const project = await Project.create({ ...req.validated.body, owner: req.user._id });
  res.status(201).json({ project });
}

export async function getProject(req, res) {
  await expireStaleScan(req.project);
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
  // A new lockfile is always checked straight away; old findings are cleared.
  await startScan(project);

  res.json({ project });
}

export async function scanProject(req, res) {
  const { project } = req;
  if (!project.lockfile) {
    throw new HttpError(409, 'NO_LOCKFILE', 'Upload your package-lock.json first, so we know what to check.');
  }
  const wait = secondsUntilNextScan(project);
  if (wait > 0) {
    throw new HttpError(
      429,
      'SCAN_TOO_SOON',
      `This project was checked moments ago. Please wait ${wait} seconds before checking again.`,
    );
  }

  await startScan(project);
  res.status(202).json({ project });
}

export async function replaceSecrets(req, res) {
  const { project } = req;
  const previous = new Map(project.secrets.map((secret) => [secret.name, secret.toObject()]));

  project.secrets = classifyNames(req.validated.body.names).map((secret) => {
    // Keep what the user already told us about a secret that is still there.
    const known = previous.get(secret.name);
    if (!known) return secret;
    const kept = { ...secret, lastRotatedAt: known.lastRotatedAt };
    return known.userOverride
      ? applyOverride(kept, { serviceKey: known.serviceKey, criticality: known.criticality })
      : kept;
  });
  project.secretsUpdatedAt = new Date();
  await project.save();

  res.json({ project });
}

export async function overrideSecret(req, res) {
  const { project } = req;
  const index = project.secrets.findIndex((secret) => secret.name === req.validated.params.name);
  if (index === -1) throw new HttpError(404, 'NOT_FOUND', 'This project has no variable with that name.');

  project.secrets.set(index, applyOverride(project.secrets[index].toObject(), req.validated.body));
  await project.save();

  res.json({ project });
}
