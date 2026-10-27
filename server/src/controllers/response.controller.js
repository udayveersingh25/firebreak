import { Incident } from '../models/Incident.js';
import { IncidentResponse } from '../models/IncidentResponse.js';
import { Project } from '../models/Project.js';
import { ensurePlaybook } from '../services/fanOut.js';
import {
  declareNotAffected,
  reopen,
  resolve,
  setStepDone,
  TransitionError,
} from '../services/responseMachine.js';
import { HttpError } from '../utils/httpError.js';

const STATUS_ORDER = ['open', 'in_progress', 'unknown', 'not_affected', 'resolved'];
const INCIDENT_FIELDS = 'title description kind severity sourceUrl isSimulated target publishedAt status';

function incidentSummary(incident) {
  if (!incident) return null;
  const { title, description, kind, severity, sourceUrl, isSimulated, target, publishedAt, status } = incident;
  return { id: String(incident._id), title, description, kind, severity, sourceUrl, isSimulated, target, publishedAt, status };
}

/** The response plus what the page needs: the incident, the project, and what each exposed secret unlocks. */
async function detail(response) {
  const [incident, project] = await Promise.all([
    Incident.findById(response.incident).select(INCIDENT_FIELDS).lean(),
    Project.findById(response.project).select('name hostingProvider secrets').lean(),
  ]);
  const secrets = new Map((project?.secrets ?? []).map((secret) => [secret.name, secret]));

  return {
    response,
    incident: incidentSummary(incident),
    project: project && { id: String(project._id), name: project.name, hostingProvider: project.hostingProvider },
    affectedSecrets: response.affectedSecrets.map((name) => {
      const secret = secrets.get(name);
      return {
        name,
        serviceLabel: secret?.serviceLabel ?? null,
        capability: secret?.capability ?? null,
        criticality: secret?.criticality ?? null,
      };
    }),
  };
}

export async function listResponses(req, res) {
  const filter = { owner: req.user._id };
  if (req.validated.query.project) filter.project = req.validated.query.project;

  const responses = await IncidentResponse.find(filter).select('incident project status steps.done updatedAt').lean();
  const [incidents, projects] = await Promise.all([
    Incident.find({ _id: { $in: responses.map((r) => r.incident) } }).select('title kind severity isSimulated').lean(),
    Project.find({ _id: { $in: responses.map((r) => r.project) } }).select('name').lean(),
  ]);
  const incidentById = new Map(incidents.map((incident) => [String(incident._id), incident]));
  const projectById = new Map(projects.map((project) => [String(project._id), project]));

  res.json({
    responses: responses
      .map((r) => {
        const incident = incidentById.get(String(r.incident));
        return {
          id: String(r._id),
          status: r.status,
          stepsDone: r.steps.filter((step) => step.done).length,
          stepsTotal: r.steps.length,
          updatedAt: r.updatedAt,
          project: { id: String(r.project), name: projectById.get(String(r.project))?.name ?? 'Deleted project' },
          incident: incident && {
            title: incident.title,
            kind: incident.kind,
            severity: incident.severity,
            isSimulated: incident.isSimulated,
          },
        };
      })
      .sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || b.updatedAt - a.updatedAt),
  });
}

export async function getResponse(req, res) {
  await ensurePlaybook(req.response);
  res.json(await detail(req.response));
}

/** Runs one state-machine change, saves it, and answers with the updated detail. */
async function applyChange(req, res, change) {
  try {
    change(req.response);
  } catch (error) {
    if (error instanceof TransitionError) throw new HttpError(error.status, error.code, error.message);
    throw error;
  }
  await req.response.save();
  res.json(await detail(req.response));
}

export function updateStep(req, res) {
  const { stepKey } = req.validated.params;
  return applyChange(req, res, (response) => setStepDone(response, stepKey, req.validated.body.done));
}

export function markNotAffected(req, res) {
  return applyChange(req, res, (response) => declareNotAffected(response, req.validated.body.reason));
}

export function reopenResponse(req, res) {
  return applyChange(req, res, (response) => reopen(response));
}

export function resolveResponse(req, res) {
  return applyChange(req, res, (response) => resolve(response));
}
