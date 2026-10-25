import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemonstration } from './lesson.js';
import { stepVehicle, crossesCourseLine } from './vehicle.js';
import { alignmentStart, createAlignmentDrill, advanceAlignmentDrill, replayAlignmentDrill } from './alignment.js';

const demonstration = createDemonstration();
const degrees = value => value * 180 / Math.PI;
function simulate(side, returnAt) {
  let state = alignmentStart(demonstration, side);
  let drill = { ...createAlignmentDrill(side, state), status: 'running' };
  let returning = false;
  for (let i = 0; i < 2400 && drill.status === 'running'; i++) {
    const remaining = degrees(state.heading) * (side === 'left' ? 1 : -1);
    returning ||= remaining <= returnAt;
    const input = { reverse: true, center: returning, speedLimit: 2.5 / 3.6 };
    const next = stepVehicle(state, input, 1 / 120);
    drill = advanceAlignmentDrill(drill, state, next, input);
    state = next;
  }
  return { state, drill };
}

test('both short exercises start stationary, inside the course, with symmetric poses', () => {
  const right = alignmentStart(demonstration, 'right');
  const left = alignmentStart(demonstration, 'left');
  assert.equal(right.speed, 0);
  assert.equal(left.time, 0);
  assert.ok(!crossesCourseLine(right) && !crossesCourseLine(left));
  assert.equal(right.x, -left.x);
  assert.equal(right.heading, -left.heading);
  assert.ok(Math.abs(Math.abs(degrees(right.heading)) - 18) < 0.2);
});

test('timely active centering produces a straight pose on both sides with the actual vehicle model', () => {
  for (const side of ['left', 'right']) {
    const { state, drill } = simulate(side, 1.2);
    assert.equal(drill.result.kind, 'aligned');
    assert.ok(Math.abs(degrees(state.heading)) < 1);
    assert.ok(Math.abs(degrees(state.steer)) < 0.5);
    assert.ok(!crossesCourseLine(state));
    assert.ok(drill.result.returnHeading !== null);
  }
});

test('early centering retains a body angle even though the front wheels reach zero', () => {
  for (const side of ['left', 'right']) {
    const { state, drill } = simulate(side, 15);
    assert.equal(drill.result.kind, 'early');
    assert.ok(Math.abs(degrees(state.heading)) > 10);
    assert.ok(Math.abs(degrees(state.steer)) < 0.5);
  }
});

test('the former four-degree pass band does not pass a pose whose straight continuation crosses a line', () => {
  for (const side of ['left', 'right']) {
    const { state, drill } = simulate(side, 5);
    assert.ok(Math.abs(degrees(state.heading)) < 4);
    assert.equal(crossesCourseLine(state), false);
    assert.equal(drill.result.kind, 'early');
    assert.equal(drill.assessment.prediction.safe, false);
  }
});

test('late and absent centering stop the exercise instead of silently passing', () => {
  for (const side of ['left', 'right']) {
    assert.equal(simulate(side, -6).drill.result.kind, 'late');
    assert.ok(['late', 'line'].includes(simulate(side, -100).drill.result.kind));
  }
});

test('ready and completed exercises stay frozen; a forward input gets specific feedback', () => {
  const state = alignmentStart(demonstration, 'right');
  const ready = createAlignmentDrill('right', state);
  const next = stepVehicle(state, { forward: true }, 0.05);
  assert.equal(advanceAlignmentDrill(ready, state, next, { forward: true }), ready);
  const done = advanceAlignmentDrill({ ...ready, status: 'running' }, state, next, { forward: true });
  assert.equal(done.result.kind, 'forward');
  assert.equal(advanceAlignmentDrill(done, next, state, {}), done);
});

test('crossing the course boundary takes priority over a centering result', () => {
  const state = alignmentStart(demonstration, 'right');
  const drill = { ...createAlignmentDrill('right', state), status: 'running', returnHeading: 0 };
  const result = advanceAlignmentDrill(drill, state, { ...state, x: 15, heading: 0, steer: 0 }, { center: true });
  assert.equal(result.result.kind, 'line');
});

test('rewinding before the return manoeuvre removes its old observation; replaying it restores the result', () => {
  const frames = [alignmentStart(demonstration, 'right')];
  for (let i = 0; i < 280; i++) frames.push(stepVehicle(frames.at(-1), { reverse: true, center: i >= 235, speedLimit: 2.5 / 3.6 }, 1 / 120));
  const before = replayAlignmentDrill('right', frames, 120);
  const after = replayAlignmentDrill('right', frames, 280);
  assert.equal(before.status, 'running');
  assert.equal(before.returnHeading, null);
  assert.equal(after.result.kind, 'aligned');
  assert.notEqual(after.returnHeading, null);
});
