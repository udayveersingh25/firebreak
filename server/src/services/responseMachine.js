// The rules for how an incident response may change. Each function checks
// the current state, applies the change to the response object it is given
// (a plain object or a Mongoose document) and appends a timeline entry. A
// change that is not allowed throws a TransitionError and changes nothing.
//
//   unknown ──(system: data arrives)──> open | not_affected
//   open ──(first step done)──> in_progress ──(every step done)──> resolved
//   open | in_progress | unknown ──(user: "not affected" + reason)──> not_affected
//   not_affected ──(user: reopen)──> open | in_progress | unknown
//   resolved: read-only

export class TransitionError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'TransitionError';
    this.status = status;
    this.code = code;
  }
}

export const MIN_REASON_LENGTH = 10;

function record(response, actor, action, detail = '', at = new Date()) {
  response.timeline.push({ at, actor, action, detail });
}

function assertNotResolved(response) {
  if (response.status === 'resolved') {
    throw new TransitionError(409, 'RESOLVED', 'This response is resolved, so it can no longer change.');
  }
}

function findStep(response, stepKey) {
  const step = response.steps.find((candidate) => candidate.key === stepKey);
  if (!step) throw new TransitionError(404, 'NOT_FOUND', 'This response has no such step.');
  return step;
}

function startIfOpen(response, actor, at) {
  if (response.status === 'open') {
    response.status = 'in_progress';
    record(response, actor, 'Status: in progress', 'The first step is done.', at);
  }
}

/** A user ticks or unticks a manual step. */
export function setStepDone(response, stepKey, done, { at = new Date() } = {}) {
  assertNotResolved(response);
  if (response.status !== 'open' && response.status !== 'in_progress') {
    throw new TransitionError(409, 'NOT_ACTIVE', 'Steps can only change while the response is open. Reopen it first.');
  }
  const step = findStep(response, stepKey);
  if (step.type === 'auto_verify') {
    throw new TransitionError(
      409,
      'AUTO_VERIFY_STEP',
      'This step completes by itself when you upload a lockfile without the affected version.',
    );
  }
  if (step.done === done) return false;

  step.done = done;
  step.doneAt = done ? at : null;
  record(response, 'user', done ? 'Step completed' : 'Step unticked', step.title, at);
  if (done) startIfOpen(response, 'user', at);
  return true;
}

/**
 * The system's result for an auto_verify step after a new lockfile. Passing
 * completes it; a lockfile that brings the affected version back undoes it.
 */
export function verifyStep(response, stepKey, passed, detail, { at = new Date() } = {}) {
  if (response.status !== 'open' && response.status !== 'in_progress') return false;
  const step = response.steps.find((candidate) => candidate.key === stepKey);
  if (!step || step.type !== 'auto_verify' || step.done === passed) return false;

  step.done = passed;
  step.doneAt = passed ? at : null;
  record(response, 'system', passed ? 'Verified from your lockfile' : 'Verification undone', detail, at);
  if (passed) startIfOpen(response, 'system', at);
  return true;
}

/** Resolve only when every step, including every auto_verify step, is done. */
export function resolve(response, { at = new Date() } = {}) {
  assertNotResolved(response);
  if (response.status !== 'in_progress' && response.status !== 'open') {
    throw new TransitionError(409, 'NOT_ACTIVE', 'Only an open response can be resolved.');
  }
  const remaining = response.steps.filter((step) => !step.done);
  if (response.steps.length === 0 || remaining.length > 0) {
    const waitingOnCheck = remaining.some((step) => step.type === 'auto_verify');
    throw new TransitionError(
      409,
      'STEPS_REMAINING',
      `Finish every step first: ${remaining.length} left${waitingOnCheck ? ', including the lockfile check' : ''}.`,
    );
  }
  response.status = 'resolved';
  response.resolvedAt = at;
  record(response, 'user', 'Resolved', 'Every step is done and verified.', at);
}

/** The user says this incident does not apply, and why. */
export function declareNotAffected(response, reason, { at = new Date() } = {}) {
  assertNotResolved(response);
  if (!['open', 'in_progress', 'unknown'].includes(response.status)) {
    throw new TransitionError(409, 'ALREADY_NOT_AFFECTED', 'This response is already marked as not affected.');
  }
  const trimmed = String(reason ?? '').trim();
  if (trimmed.length < MIN_REASON_LENGTH) {
    throw new TransitionError(400, 'REASON_TOO_SHORT', `Explain why in at least ${MIN_REASON_LENGTH} characters.`);
  }
  response.status = 'not_affected';
  response.notAffectedReason = trimmed;
  record(response, 'user', 'Marked not affected', trimmed, at);
}

/** Undo "not affected": back to where the work was, or to waiting for information. */
export function reopen(response, { at = new Date() } = {}) {
  if (response.status !== 'not_affected') {
    throw new TransitionError(409, 'NOT_REOPENABLE', 'Only a response marked as not affected can be reopened.');
  }
  if (response.steps.length === 0) response.status = 'unknown';
  else response.status = response.steps.some((step) => step.done) ? 'in_progress' : 'open';
  response.notAffectedReason = null;
  record(response, 'user', 'Reopened', '', at);
}
