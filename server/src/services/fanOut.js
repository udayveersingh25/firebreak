import { Incident } from '../models/Incident.js';
import { IncidentResponse } from '../models/IncidentResponse.js';
import { Notification } from '../models/Notification.js';
import { Project } from '../models/Project.js';
import { matchIncident } from './matcher.js';
import { notifyOnce, responseCreatedMessage, responseNowAffectedMessage } from './notifier.js';
import { buildPlaybook } from './playbook.js';
import { verifyStep } from './responseMachine.js';

const MATCH_FIELDS = 'owner name hostingProvider lockfile dependencies secrets secretsUpdatedAt';

/**
 * Runs the matcher over every project, one at a time through a cursor (memory
 * stays flat however many projects exist). Preview and publish both use this
 * same loop, so the preview count is exactly what publishing creates.
 */
async function forEachMatch(incident, onMatch) {
  const counts = { affected: 0, unknown: 0 };
  const cursor = Project.find({}).select(MATCH_FIELDS).lean().cursor();
  for await (const project of cursor) {
    const match = matchIncident(incident, project);
    if (match.status === 'not_affected') continue;
    counts[match.status] += 1;
    if (onMatch) await onMatch(project, match);
  }
  return counts;
}

/** Dry run: { affected, unknown } with nothing written. */
export function previewIncident(incident) {
  return forEachMatch(incident);
}

/**
 * Creates a response (and one notification) for every affected or unknown
 * project. Safe to run again: existing responses are left alone, and the unique
 * keys on responses and notifications make duplicates impossible. A run that
 * crashed halfway is completed by the next one.
 */
export function fanOutIncident(incident) {
  return forEachMatch(incident, (project, match) => ensureResponse(incident, project, match));
}

async function ensureResponse(incident, project, match) {
  const status = match.status === 'affected' ? 'open' : 'unknown';
  let response;
  try {
    response = await IncidentResponse.findOneAndUpdate(
      { incident: incident._id, project: project._id },
      {
        $setOnInsert: {
          owner: project.owner,
          status,
          affectedReason: match.reason,
          affectedSecrets: match.affectedSecrets,
          // Steps only make sense once we know the project is affected.
          steps: status === 'open' ? buildPlaybook(incident, project, match) : [],
          timeline: [{ at: new Date(), actor: 'system', action: 'Matched to this incident', detail: match.reason }],
        },
      },
      { upsert: true, returnDocument: 'after' },
    );
  } catch (error) {
    // Two fan-outs racing: the unique index let only one insert win.
    if (error?.code !== 11000) throw error;
    response = await IncidentResponse.findOne({ incident: incident._id, project: project._id });
  }

  await notifyOnce({
    user: project.owner,
    dedupeKey: `response-created:${response._id}`,
    link: `/responses/${response._id}`,
    ...responseCreatedMessage(incident, project, response.status),
  });
  return response;
}

/**
 * Late joiners: a project that was created, or whose lockfile or secret names
 * changed, is checked against every published incident.
 * - no response yet and now affected or unknown -> create one, notify
 * - response waiting for information ('unknown') -> becomes 'open' with its
 *   playbook if affected (notify), or 'not_affected' if the new data clears it
 * - open package responses: a lockfile without the affected version completes
 *   the automatic "upload your lockfile" step
 * Everything else about a response being worked on is left to the user.
 */
export async function rematchProject(projectId) {
  const project = await Project.findById(projectId).select(MATCH_FIELDS).lean();
  if (!project) return;
  const incidents = await Incident.find({ status: 'published' });

  for (const incident of incidents) {
    const match = matchIncident(incident, project);
    const existing = await IncidentResponse.findOne({ incident: incident._id, project: project._id });

    if (!existing) {
      if (match.status !== 'not_affected') await ensureResponse(incident, project, match);
      continue;
    }
    // A new lockfile can complete (or undo) the "upload your lockfile" check.
    if (incident.target.type === 'package' && match.status !== 'unknown') {
      const passed = match.status === 'not_affected';
      if (verifyStep(existing, 'verify_lockfile', passed, match.reason)) await existing.save();
    }

    if (existing.status !== 'unknown' || match.status === 'unknown') continue;

    const at = new Date();
    if (match.status === 'affected') {
      existing.status = 'open';
      existing.affectedReason = match.reason;
      existing.affectedSecrets = match.affectedSecrets;
      existing.steps = buildPlaybook(incident, project, match);
      existing.timeline.push({ at, actor: 'system', action: 'Checked again: affected', detail: match.reason });
      await existing.save();
      await notifyOnce({
        user: project.owner,
        dedupeKey: `response-affected:${existing._id}`,
        link: `/responses/${existing._id}`,
        ...responseNowAffectedMessage(incident, project),
      });
    } else {
      existing.status = 'not_affected';
      existing.notAffectedReason = 'Checked after your upload: not affected.';
      existing.timeline.push({ at, actor: 'system', action: 'Checked again: not affected', detail: match.reason });
      await existing.save();
    }
  }
}

/** Removes a project's responses and the notifications that point to them. */
export async function deleteProjectResponses(projectId) {
  const responses = await IncidentResponse.find({ project: projectId }).select('_id').lean();
  const keys = responses.flatMap(({ _id }) => [`response-created:${_id}`, `response-affected:${_id}`]);
  await Notification.deleteMany({ dedupeKey: { $in: keys } });
  await IncidentResponse.deleteMany({ project: projectId });
}

/**
 * Responses created before playbooks existed have no steps. Builds them the
 * first time such a response is opened, so it can still be worked through and
 * resolved. Returns true when the response changed.
 */
export async function ensurePlaybook(response) {
  if (response.steps.length > 0 || !['open', 'in_progress'].includes(response.status)) return false;
  const [incident, project] = await Promise.all([
    Incident.findById(response.incident),
    Project.findById(response.project).select(MATCH_FIELDS).lean(),
  ]);
  if (!incident || !project) return false;
  const match = matchIncident(incident, project);
  if (match.status !== 'affected') return false;

  response.affectedSecrets = match.affectedSecrets;
  response.steps = buildPlaybook(incident, project, match);
  response.timeline.push({ at: new Date(), actor: 'system', action: 'Checklist added', detail: 'Steps were generated for this response.' });
  await response.save();
  return true;
}
