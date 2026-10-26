import { Notification } from '../models/Notification.js';

/**
 * Creates a notification once per `dedupeKey`. A repeated call (a retried
 * publish, two requests racing) finds the existing one and does nothing.
 */
export async function notifyOnce({ user, dedupeKey, type, title, body, link }) {
  try {
    await Notification.updateOne(
      { dedupeKey },
      { $setOnInsert: { user, type, title, body, link } },
      { upsert: true },
    );
  } catch (error) {
    // Two upserts racing on the same key: the other one created it.
    if (error?.code !== 11000) throw error;
  }
}

/** Plain-language notification for a project newly matched by an incident. */
export function responseCreatedMessage(incident, project, status) {
  const simulated = incident.isSimulated ? ' (simulated)' : '';
  return {
    type: 'incident',
    title: `${incident.title}${simulated}`,
    body:
      status === 'open'
        ? `${project.name} is affected. Open it to see what is exposed and what to do first.`
        : `We need more information to check whether ${project.name} is affected.`,
  };
}

export function responseNowAffectedMessage(incident, project) {
  return {
    type: 'incident',
    title: `${incident.title}${incident.isSimulated ? ' (simulated)' : ''}`,
    body: `With the information you added, ${project.name} turns out to be affected. Open it to see what to do.`,
  };
}
