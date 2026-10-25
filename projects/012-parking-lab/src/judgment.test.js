import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemonstration } from './lesson.js';
import { CAR, BAY, crossesCourseLine, isParked, localToWorld, stepVehicle } from './vehicle.js';
import { createJudgmentDrill, advanceJudgmentDrill, finishJudgmentDrill, judgmentReferencePose, retryJudgmentDrill } from './judgment.js';

const demonstration = createDemonstration();
const degrees = angle => angle * 180 / Math.PI;
const remaining = (state, side) => degrees(state.heading) * (side === 'left' ? 1 : -1);
const DT = 1 / 120;

function drive(drill, returnAt) {
  let value = { ...drill, status: 'running' };
  let state = { ...value.startState }, returning = false;
  for (let i = 0; i < 6000 && value.status === 'running'; i++) {
    returning ||= remaining(state, value.side) <= returnAt;
    const input = { reverse: true, center: returning, speedLimit: value.speedLimit };
    const next = stepVehicle(state, input, DT);
    value = advanceJudgmentDrill(value, state, next, input);
    state = next;
  }
  return value;
}

function straightContinuation(start, speedLimit) {
  let state = { ...start }, braking = false, crossing = crossesCourseLine(state);
  for (let i = 0; i < 6000; i++) {
    braking ||= localToWorld(state, 0, -CAR.rearOverhang).z <= BAY.back + 0.55;
    state = stepVehicle(state, braking ? { brake: true, speedLimit } : { reverse: true, speedLimit }, DT);
    crossing ||= crossesCourseLine(state);
    if (braking && state.speed === 0) return { state, crossing };
  }
  return { state, crossing };
}

test('both starts use symmetric stationary demonstration poses with time and distance reset', () => {
  const right = createJudgmentDrill(demonstration, 'right');
  const left = createJudgmentDrill(demonstration, 'left');
  assert.equal(right.speedLimit, 1.8 / 3.6);
  for (const drill of [right, left]) {
    assert.equal(drill.status, 'ready');
    assert.equal(drill.startState.speed, 0);
    assert.equal(drill.startState.time, 0);
    assert.equal(drill.startState.distance, 0);
    assert.ok(Math.abs(remaining(drill.startState, drill.side) - 30) < 0.15);
    assert.ok(Math.abs(Math.abs(drill.startState.steer) - CAR.maxSteer) < 0.001);
    assert.ok(!crossesCourseLine(drill.startState));
    assert.equal(advanceJudgmentDrill(drill, drill.startState, { ...drill.startState, time: 20 }, { reverse: true }), drill);
  }
  assert.equal(right.startState.x, -left.startState.x);
  assert.equal(right.startState.heading, -left.startState.heading);
});

test('same-speed references and successful actual continuations fit the bay throughout the supported speed range', () => {
  for (const side of ['right', 'left']) for (const kph of [1.2, 1.8, 2.5, 3.6]) {
    const drill = createJudgmentDrill(demonstration, side, { speedLimit: kph / 3.6 });
    assert.ok(drill.referenceFrames.every(frame => !crossesCourseLine(frame)), `${side}/${kph}: reference crosses a line`);
    assert.ok(isParked(drill.referenceFrames.at(-1)), `${side}/${kph}: reference must finish wholly inside`);
    const ideal = judgmentReferencePose(drill, 0, { match: 'decision' });
    const done = drive(drill, remaining(ideal, side) + 1e-8);
    assert.equal(done.result.kind, 'good', `${side}/${kph}`);
    assert.equal(done.result.prediction.safe, true);
    assert.ok(done.centeredIndex > done.decisionIndex);
    assert.equal(done.frames[done.centeredIndex].steer, 0);
    assert.equal(done.result.referenceSpeedLimit, kph / 3.6);
    assert.deepEqual(done.result.referencePose, ideal);
    const continuation = straightContinuation(done.frames.at(-1), drill.speedLimit);
    assert.equal(continuation.crossing, false, `${side}/${kph}: actual continuation crosses a line`);
    assert.ok(isParked(continuation.state), `${side}/${kph}: actual continuation must enter wholly`);
  }
});

test('a body angle under four degrees does not pass when straight continuation will cross a line', () => {
  for (const side of ['right', 'left']) {
    const done = drive(createJudgmentDrill(demonstration, side), 4);
    assert.ok(Math.abs(done.result.heading) < 4, 'Reproduces the old angle-only false positive');
    assert.equal(done.frames.at(-1).steer, 0);
    assert.equal(crossesCourseLine(done.frames.at(-1)), false, 'The current pose alone still looks clear');
    assert.equal(done.result.kind, 'early');
    assert.equal(done.result.prediction.safe, false);
    assert.ok(done.result.prediction.crossingDistance > 0);
    assert.equal(straightContinuation(done.frames.at(-1), done.speedLimit).crossing, true);
  }
});

test('early, late and missing decisions have distinct feedback with no running action prompts', () => {
  for (const side of ['right', 'left']) {
    assert.equal(drive(createJudgmentDrill(demonstration, side), 15).result.kind, 'early');
    assert.equal(drive(createJudgmentDrill(demonstration, side), -3).result.kind, 'late');
    const absent = drive(createJudgmentDrill(demonstration, side), -100);
    assert.ok(['late', 'line'].includes(absent.result.kind));
    if (absent.result.kind === 'late') assert.match(absent.result.title, /尚未回正/);
    assert.equal(absent.decisionIndex, null);
    assert.equal(absent.centeredIndex, null);
  }
  let drill = createJudgmentDrill(demonstration, 'right');
  drill = { ...drill, status: 'running' };
  const next = stepVehicle(drill.startState, { reverse: true, speedLimit: drill.speedLimit }, DT);
  const running = advanceJudgmentDrill(drill, drill.startState, next, { reverse: true });
  assert.equal(running.result, null);
  assert.equal(running.decisionIndex, null);
  assert.equal(running.status, 'running');
});

test('actual line contact takes priority and interrupted or forward practice stays unfinished', () => {
  const ready = createJudgmentDrill(demonstration, 'right');
  const running = { ...ready, status: 'running' };
  const line = advanceJudgmentDrill(running, ready.startState, { ...ready.startState, x: 15, steer: 0 }, { center: true });
  assert.equal(line.result.kind, 'line');
  assert.equal(line.result.reason, 'actual-line');
  assert.equal(line.result.errorFrameIndex, 1);
  const forward = stepVehicle(ready.startState, { forward: true }, 0.05);
  assert.equal(advanceJudgmentDrill(running, ready.startState, forward, { forward: true }).result.kind, 'unfinished');
  const unfinished = finishJudgmentDrill(running);
  assert.equal(unfinished.result.kind, 'unfinished');
  assert.equal(unfinished.decisionIndex, null);
  assert.equal(advanceJudgmentDrill(unfinished, forward, ready.startState, { center: true }), unfinished);
});

test('retry preserves the recorded prefix and old result but clears decision state before the new attempt', () => {
  for (const side of ['right', 'left']) {
    const original = drive(createJudgmentDrill(demonstration, side), 4);
    const before = JSON.stringify(original.frames);
    const retry = retryJudgmentDrill(original);
    assert.ok(retry.activeStartIndex > 0);
    assert.ok(retry.activeStartIndex < original.decisionIndex);
    const gap = original.frames[original.decisionIndex].time - original.frames[retry.activeStartIndex].time;
    assert.ok(gap >= 1.8 && gap <= 1.8 + 2 * DT);
    assert.deepEqual(retry.frames.slice(0, -1), original.frames.slice(0, retry.activeStartIndex));
    assert.equal(retry.frames.length, retry.activeStartIndex + 1);
    assert.equal(retry.startState.speed, 0);
    assert.equal(retry.startState.judgmentCenter, false);
    assert.equal(retry.status, 'ready');
    assert.equal(retry.decisionIndex, null);
    assert.equal(retry.centeredIndex, null);
    assert.equal(retry.result, null);
    assert.equal(JSON.stringify(original.frames), before);
    assert.equal(original.result.kind, 'early');
    const ideal = judgmentReferencePose(retry, 0, { match: 'decision' });
    const corrected = drive(retry, remaining(ideal, side) + 1e-8);
    assert.equal(corrected.result.kind, 'good');
    assert.ok(corrected.decisionIndex > retry.activeStartIndex);
    assert.equal(corrected.result.prediction.safe, true);
  }
});

test('an immediate decision retries at the earliest available pose without reusing the old X input', () => {
  const done = drive(createJudgmentDrill(demonstration, 'right'), 31);
  assert.equal(done.decisionIndex, 0);
  const retry = retryJudgmentDrill(done);
  assert.equal(retry.activeStartIndex, 0);
  assert.equal(retry.frames.length, 1);
  assert.equal(retry.decisionIndex, null);
  assert.equal(retry.frames[0].judgmentCenter, false);
});

test('distance replay and action-moment comparison are explicit and return independent pose copies', () => {
  const done = drive(createJudgmentDrill(demonstration, 'right'), 15);
  const byDistance = judgmentReferencePose(done, done.decisionIndex);
  const byAction = judgmentReferencePose(done, done.decisionIndex, { match: 'decision' });
  assert.ok(Math.abs(byDistance.distance - done.frames[done.decisionIndex].distance) < 0.01);
  assert.ok(Math.abs(remaining(byDistance, 'right') - remaining(byAction, 'right')) > 10);
  assert.equal(done.result.referenceMatch, 'decision');
  byAction.x = 500;
  assert.notEqual(done.referenceFrames[done.referenceDecisionIndex].x, 500);
});
