import test from 'node:test';
import assert from 'node:assert/strict';
import { finishLecture } from './speech-flow.js';

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const tick = () => new Promise(resolve => setImmediate(resolve));

test('a loading lecture cannot start its action, and ended only signals readiness', { timeout: 1000 }, async () => {
  const playback = deferred();
  const vehicle = { x: 4, paused: true, phase: 'loading' };
  let errors = 0;
  const finished = finishLecture(playback.promise, {
    isCurrent: () => true,
    onReady: () => { vehicle.phase = 'move-ready'; },
    onError: () => { errors++; },
  });
  await tick();
  assert.deepEqual(vehicle, { x: 4, paused: true, phase: 'loading' });
  playback.resolve('ended');
  assert.equal(await finished, 'ended');
  assert.deepEqual(vehicle, { x: 4, paused: true, phase: 'move-ready' });
  assert.equal(errors, 0);
});

test('asynchronous media failure and request rejection report error without advancing', { timeout: 1000 }, async () => {
  for (const reject of [false, true]) {
    const playback = deferred(), calls = [], failure = new Error('speech request failed');
    const finished = finishLecture(playback.promise, {
      isCurrent: () => true,
      onReady: () => calls.push('ready'),
      onError: error => calls.push({ error }),
    });
    await tick();
    if (reject) playback.reject(failure); else playback.resolve('error');
    assert.equal(await finished, 'error');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].error, reject ? failure : undefined);
  }
});

test('cancellation settles without making a stopped lecture look completed', { timeout: 1000 }, async () => {
  const playback = deferred(), calls = [];
  const finished = finishLecture(playback.promise, {
    isCurrent: () => true,
    onReady: () => calls.push('ready'),
    onError: () => calls.push('error'),
  });
  await tick(); playback.resolve('cancelled');
  assert.equal(await finished, 'cancelled');
  assert.deepEqual(calls, []);
});

test('late success or failure from an old session cannot affect the replacement', { timeout: 1000 }, async () => {
  for (const outcome of ['ended', 'error', 'rejected']) {
    const old = deferred(), current = deferred(), calls = [];
    let session = 1;
    const oldFinished = finishLecture(old.promise, {
      isCurrent: () => session === 1,
      onReady: () => calls.push('old-ready'),
      onError: () => calls.push('old-error'),
    });
    session = 2;
    const currentFinished = finishLecture(current.promise, {
      isCurrent: () => session === 2,
      onReady: () => calls.push('new-ready'),
      onError: () => calls.push('new-error'),
    });
    await tick();
    if (outcome === 'rejected') old.reject(new Error('old request failed')); else old.resolve(outcome);
    assert.equal(await oldFinished, 'cancelled');
    assert.deepEqual(calls, []);
    current.resolve('ended');
    assert.equal(await currentFinished, 'ended');
    assert.deepEqual(calls, ['new-ready']);
  }
});

test('a failed lecture can retry successfully without its old error contaminating the new attempt', { timeout: 1000 }, async () => {
  let attempt = 1, phase = 'loading';
  const events = [];
  const handlers = id => ({
    isCurrent: () => attempt === id,
    onReady: () => { phase = 'move-ready'; events.push(`ready-${id}`); },
    onError: () => { phase = 'audio-error'; events.push(`error-${id}`); },
  });
  const failed = deferred();
  const first = finishLecture(failed.promise, handlers(1));
  await tick(); failed.reject(new Error('temporary network failure'));
  assert.equal(await first, 'error');
  assert.equal(phase, 'audio-error');
  attempt = 2; phase = 'loading';
  const retried = deferred(), second = finishLecture(retried.promise, handlers(2));
  await tick();
  assert.equal(phase, 'loading');
  retried.resolve('ended');
  assert.equal(await second, 'ended');
  assert.equal(phase, 'move-ready');
  assert.deepEqual(events, ['error-1', 'ready-2']);
});

test('invalid completion and rejected UI callbacks cannot silently advance or leak a rejected promise', { timeout: 1000 }, async () => {
  let ready = 0, errors = 0;
  assert.equal(await finishLecture(Promise.resolve(undefined), {
    onReady: () => { ready++; },
    onError: error => { assert.ok(error instanceof Error); errors++; },
  }), 'error');
  assert.equal(ready, 0);
  assert.equal(errors, 1);
  const failure = new Error('UI transition failed');
  assert.equal(await finishLecture(Promise.resolve('ended'), {
    onReady: async () => { await tick(); throw failure; },
    onError: async error => { assert.equal(error, failure); await tick(); throw new Error('error display failed'); },
  }), 'error');
});
