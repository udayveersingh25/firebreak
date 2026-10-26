import mongoose from 'mongoose';
import { Incident } from '../models/Incident.js';
import { IncidentResponse, RESPONSE_STATUSES } from '../models/IncidentResponse.js';
import { fanOutIncident, previewIncident } from '../services/fanOut.js';
import { HttpError } from '../utils/httpError.js';

async function loadIncident(id) {
  const incident = mongoose.isObjectIdOrHexString(id) ? await Incident.findById(id) : null;
  if (!incident) throw new HttpError(404, 'NOT_FOUND', 'We could not find that incident.');
  return incident;
}

/**
 * Counts per response status for each incident. Admins see these totals, never
 * which projects or users are behind them.
 */
async function responseCountsByIncident() {
  const rows = await IncidentResponse.aggregate([
    { $group: { _id: { incident: '$incident', status: '$status' }, count: { $sum: 1 } } },
  ]);
  const counts = new Map();
  for (const { _id, count } of rows) {
    const key = String(_id.incident);
    if (!counts.has(key)) counts.set(key, Object.fromEntries(RESPONSE_STATUSES.map((status) => [status, 0])));
    counts.get(key)[_id.status] = count;
  }
  return counts;
}

const emptyCounts = () => Object.fromEntries(RESPONSE_STATUSES.map((status) => [status, 0]));

export async function listIncidents(req, res) {
  const [incidents, counts] = await Promise.all([Incident.find().sort({ createdAt: -1 }), responseCountsByIncident()]);
  res.json({
    incidents: incidents.map((incident) => ({
      ...incident.toJSON(),
      responseCounts: counts.get(String(incident._id)) ?? emptyCounts(),
    })),
  });
}

export async function getIncident(req, res) {
  const incident = await loadIncident(req.params.id);
  const counts = await responseCountsByIncident();
  res.json({ incident: { ...incident.toJSON(), responseCounts: counts.get(String(incident._id)) ?? emptyCounts() } });
}

export async function createIncident(req, res) {
  const incident = await Incident.create({ ...req.validated.body, createdBy: req.user._id });
  res.status(201).json({ incident });
}

export async function updateIncident(req, res) {
  const incident = await loadIncident(req.params.id);
  if (incident.status !== 'draft') {
    throw new HttpError(409, 'NOT_A_DRAFT', 'Only drafts can be edited. This incident has already been published.');
  }
  incident.set(req.validated.body);
  await incident.save();
  res.json({ incident });
}

export async function previewIncidentMatches(req, res) {
  const incident = await loadIncident(req.params.id);
  res.json({ counts: await previewIncident(incident) });
}

export async function publishIncident(req, res) {
  const incident = await loadIncident(req.params.id);
  if (incident.status === 'archived') {
    throw new HttpError(409, 'ARCHIVED', 'This incident is archived and can no longer be published.');
  }

  // Published first, so projects created during the fan-out are picked up by
  // late-joiner matching. Publishing again re-runs the fan-out, which only
  // fills gaps (for example after a crash) and never duplicates.
  if (incident.status === 'draft') {
    incident.status = 'published';
    incident.publishedAt = new Date();
    await incident.save();
  }
  incident.matchedCounts = await fanOutIncident(incident);
  await incident.save();

  res.json({ incident });
}

export async function archiveIncident(req, res) {
  const incident = await loadIncident(req.params.id);
  incident.status = 'archived';
  await incident.save();
  res.json({ incident });
}
