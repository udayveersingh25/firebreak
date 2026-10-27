import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  declareNotAffected,
  reopen,
  resolve,
  setStepDone,
  TransitionError,
  verifyStep,
} from '../src/services/responseMachine.js';

function response(status = 'open', steps = defaultSteps()) {
  return { status, steps, timeline: [], notAffectedReason: null, resolvedAt: null };
}

function defaultSteps() {
  return [
    { key: 'upgrade', title: 'Upgrade lodash', type: 'manual', done: false, doneAt: null },
    { key: 'redeploy', title: 'Redeploy your app', type: 'manual', done: false, doneAt: null },
    { key: 'verify_lockfile', title: 'Upload your lockfile', type: 'auto_verify', done: false, doneAt: null },
  ];
}

function rejectsWith(fn, code) {
  assert.throws(fn, (error) => error instanceof TransitionError && error.code === code);
}

function snapshot(r) {
  return JSON.stringify(r);
}

describe('ticking steps', () => {
  test('open -> in_progress when the first step is completed', () => {
    const r = response();

    setStepDone(r, 'upgrade', true);

    assert.equal(r.status, 'in_progress');
    assert.equal(r.steps[0].done, true);
    assert.ok(r.steps[0].doneAt instanceof Date);
    assert.deepEqual(r.timeline.map((e) => [e.actor, e.action]), [
      ['user', 'Step completed'],
      ['user', 'Status: in progress'],
    ]);
  });

  test('a step can be unticked while not resolved, and it is recorded', () => {
    const r = response();
    setStepDone(r, 'upgrade', true);

    setStepDone(r, 'upgrade', false);

    assert.equal(r.steps[0].done, false);
    assert.equal(r.steps[0].doneAt, null);
    assert.equal(r.status, 'in_progress');
    assert.equal(r.timeline.at(-1).action, 'Step unticked');
  });

  test('ticking an already-ticked step changes nothing', () => {
    const r = response();
    setStepDone(r, 'upgrade', true);
    const before = snapshot(r);

    assert.equal(setStepDone(r, 'upgrade', true), false);
    assert.equal(snapshot(r), before);
  });

  test('users cannot tick an auto_verify step', () => {
    const r = response();
    rejectsWith(() => setStepDone(r, 'verify_lockfile', true), 'AUTO_VERIFY_STEP');
    assert.equal(r.steps[2].done, false);
  });

  test('an unknown step is a 404', () => {
    rejectsWith(() => setStepDone(response(), 'nope', true), 'NOT_FOUND');
  });

  for (const status of ['unknown', 'not_affected']) {
    test(`steps cannot change while ${status}`, () => {
      rejectsWith(() => setStepDone(response(status), 'upgrade', true), 'NOT_ACTIVE');
    });
  }

  test('a resolved response is read-only', () => {
    const r = response('resolved');
    const before = snapshot(r);

    rejectsWith(() => setStepDone(r, 'upgrade', true), 'RESOLVED');
    assert.equal(snapshot(r), before);
  });
});

describe('automatic verification', () => {
  test('passing completes the step and starts the response, as the system', () => {
    const r = response();

    verifyStep(r, 'verify_lockfile', true, 'lodash 4.17.21 is not affected.');

    assert.equal(r.steps[2].done, true);
    assert.equal(r.status, 'in_progress');
    assert.equal(r.timeline[0].actor, 'system');
  });

  test('a lockfile that brings the affected version back undoes it', () => {
    const r = response('in_progress');
    verifyStep(r, 'verify_lockfile', true, 'ok');

    verifyStep(r, 'verify_lockfile', false, 'lodash 4.17.15 is back.');

    assert.equal(r.steps[2].done, false);
    assert.equal(r.timeline.at(-1).action, 'Verification undone');
  });

  test('does nothing to resolved or not-affected responses, or to manual steps', () => {
    for (const status of ['resolved', 'not_affected', 'unknown']) {
      assert.equal(verifyStep(response(status), 'verify_lockfile', true, ''), false, status);
    }
    assert.equal(verifyStep(response(), 'upgrade', true, ''), false);
  });
});

describe('resolving', () => {
  function allDone() {
    const r = response();
    setStepDone(r, 'upgrade', true);
    setStepDone(r, 'redeploy', true);
    return r;
  }

  test('impossible while the auto_verify step has not passed', () => {
    const r = allDone();

    assert.throws(
      () => resolve(r),
      (error) => error.code === 'STEPS_REMAINING' && /1 left, including the lockfile check/.test(error.message),
    );
    assert.equal(r.status, 'in_progress');
  });

  test('impossible with manual steps left', () => {
    const r = response();
    setStepDone(r, 'upgrade', true);
    verifyStep(r, 'verify_lockfile', true, '');

    rejectsWith(() => resolve(r), 'STEPS_REMAINING');
  });

  test('in_progress -> resolved when every step is done and verified', () => {
    const r = allDone();
    verifyStep(r, 'verify_lockfile', true, '');

    resolve(r);

    assert.equal(r.status, 'resolved');
    assert.ok(r.resolvedAt instanceof Date);
    assert.equal(r.timeline.at(-1).action, 'Resolved');
  });

  test('cannot resolve an open response with nothing done, or one without steps', () => {
    rejectsWith(() => resolve(response()), 'STEPS_REMAINING');
    rejectsWith(() => resolve(response('open', [])), 'STEPS_REMAINING');
  });

  for (const status of ['unknown', 'not_affected']) {
    test(`cannot resolve while ${status}`, () => {
      rejectsWith(() => resolve(response(status)), 'NOT_ACTIVE');
    });
  }

  test('cannot resolve twice', () => {
    rejectsWith(() => resolve(response('resolved')), 'RESOLVED');
  });
});

describe('not affected and reopening', () => {
  for (const status of ['open', 'in_progress', 'unknown']) {
    test(`${status} -> not_affected with a reason`, () => {
      const r = response(status);

      declareNotAffected(r, '  We removed LiteLLM last week.  ');

      assert.equal(r.status, 'not_affected');
      assert.equal(r.notAffectedReason, 'We removed LiteLLM last week.');
      assert.deepEqual([r.timeline[0].actor, r.timeline[0].detail], ['user', 'We removed LiteLLM last week.']);
    });
  }

  test('the reason must be at least 10 characters', () => {
    const r = response();
    rejectsWith(() => declareNotAffected(r, ' too short'), 'REASON_TOO_SHORT');
    assert.equal(r.status, 'open');
  });

  test('a resolved response cannot be declared not affected', () => {
    rejectsWith(() => declareNotAffected(response('resolved'), 'Long enough reason here'), 'RESOLVED');
  });

  test('declaring twice is a conflict', () => {
    rejectsWith(() => declareNotAffected(response('not_affected'), 'Long enough reason here'), 'ALREADY_NOT_AFFECTED');
  });

  test('reopening returns to where the work was', () => {
    const untouched = response();
    declareNotAffected(untouched, 'We removed LiteLLM last week.');
    reopen(untouched);
    assert.equal(untouched.status, 'open');
    assert.equal(untouched.notAffectedReason, null);

    const started = response();
    setStepDone(started, 'upgrade', true);
    declareNotAffected(started, 'We removed LiteLLM last week.');
    reopen(started);
    assert.equal(started.status, 'in_progress');

    const waiting = response('unknown', []);
    declareNotAffected(waiting, 'We removed LiteLLM last week.');
    reopen(waiting);
    assert.equal(waiting.status, 'unknown');
  });

  for (const status of ['open', 'in_progress', 'unknown', 'resolved']) {
    test(`cannot reopen when ${status}`, () => {
      rejectsWith(() => reopen(response(status)), 'NOT_REOPENABLE');
    });
  }
});
