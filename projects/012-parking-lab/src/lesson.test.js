import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemonstration, LESSON_STEPS, createProgress, advanceProgress, practiceCue } from './lesson.js';
import { COURSE, crossesCourseLine, frontWheelsPast, isParked, initialState, stepVehicle } from './vehicle.js';

const demo = createDemonstration();
test('all twelve teaching steps have valid monotonic timeline checkpoints', () => {
  assert.equal(demo.stops.length, LESSON_STEPS.length);
  for (let i = 0; i < demo.stops.length; i++) {
    assert.ok(demo.starts[i] <= demo.stops[i]);
    assert.ok(demo.frames[demo.starts[i]]);
    assert.ok(demo.frames[demo.stops[i]]);
    if (i) assert.ok(demo.stops[i] >= demo.stops[i - 1]);
  }
});
test('the complete two-sided demonstration stays inside exam field lines', () => {
  for (const state of demo.frames) assert.equal(crossesCourseLine(state), false, `outside course at ${state.time}s`);
  assert.ok(demo.duration < COURSE.limitSeconds);
});
test('both front-wheel contact points pass each control line and both parks fully stop', () => {
  assert.equal(frontWheelsPast(demo.frames[0], 'a'), true);
  assert.equal(frontWheelsPast(demo.frames[demo.stops[7]], 'b'), true);
  assert.equal(isParked(demo.frames[demo.stops[5]]), true);
  assert.equal(isParked(demo.frames[demo.stops[9]]), true);
  assert.equal(frontWheelsPast(demo.frames.at(-1), 'a'), true);
  assert.equal(demo.frames.at(-1).speed, 0);
});
test('demonstration transitions never teleport the car or reset its clock', () => {
  for (let i = 1; i < demo.frames.length; i++) {
    const prev = demo.frames[i - 1], next = demo.frames[i];
    assert.ok(Math.hypot(next.x - prev.x, next.z - prev.z) < 0.015);
    assert.ok(next.time > prev.time);
  }
});
test('practice progression recognizes the full demonstration and detects early reversal', () => {
  let progress = createProgress();
  for (let i = 1; i < demo.frames.length; i++) progress = advanceProgress(progress, demo.frames[i - 1], demo.frames[i]);
  assert.equal(progress.phase, 4);
  assert.equal(progress.wrongSequence, false);
  assert.equal(progress.crossedLine, false);
  const early = { ...initialState(), x: -3 };
  const moving = stepVehicle(early, { reverse: true }, 0.05);
  assert.equal(advanceProgress(createProgress(), early, moving).wrongSequence, true);
});
test('live coaching changes from straight reversing to steering, centering, and stopping', () => {
  const cue = index => practiceCue(demo.frames[index], createProgress(), demo.turnMarker).action;
  assert.match(cue(0), /方向保持正直/);
  assert.match(cue(demo.stops[1]), /D 向右/);
  assert.match(cue(demo.stops[3]), /X 主动回正/);
  assert.match(cue(demo.stops[4]), /方向已回正/);
  assert.match(cue(demo.stops[5]), /刹车停稳/);
});
