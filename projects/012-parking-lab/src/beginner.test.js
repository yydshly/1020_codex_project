import test from 'node:test';
import assert from 'node:assert/strict';
import { CAR, stepVehicle, crossesCourseLine, isParked } from './vehicle.js';
import { createDemonstration } from './lesson.js';
import { beginnerStart, beginnerInput, advanceBeginner } from './beginner.js';

const demonstration = createDemonstration();
const heldFor = step => ({ [step === 'turn' ? 'right' : step === 'hold' ? 'reverse' : 'center']: true });

test('the novice starts at the existing right-turn reference with a fresh stationary recording', () => {
  const original = { ...demonstration.frames[demonstration.stops[1]] };
  const state = beginnerStart(demonstration);
  for (const field of ['x', 'z', 'heading', 'steer']) assert.equal(state[field], original[field]);
  for (const field of ['speed', 'time', 'distance']) assert.equal(state[field], 0);
  assert.equal(crossesCourseLine(state), false);
  state.x += 1;
  assert.deepEqual(demonstration.frames[demonstration.stops[1]], original);
});

test('each step permits only its one taught action and takes care of the slow reverse input', () => {
  const allHeld = { right: true, left: true, reverse: true, forward: true, center: true };
  assert.deepEqual(beginnerInput('turn', allHeld), { reverse: true, right: true, center: false, left: false, forward: false, speedLimit: 0.5 });
  assert.deepEqual(beginnerInput('hold', allHeld), { reverse: true, right: false, center: false, left: false, forward: false, speedLimit: 0.5 });
  assert.deepEqual(beginnerInput('center', allHeld), { reverse: true, right: false, center: true, left: false, forward: false, speedLimit: 0.5 });
  for (const step of [undefined, null, '', 'orientation', 'look', 'look-right', 'look-left', 'finished']) {
    const input = beginnerInput(step, allHeld);
    for (const field of ['reverse', 'right', 'left', 'forward', 'center']) assert.equal(input[field], false);
  }
});

test('wrong keys or no held key cannot move or steer a stationary car', () => {
  for (const step of ['turn', 'hold', 'center']) {
    const allowed = Object.keys(heldFor(step))[0];
    for (const key of ['left', 'right', 'forward', 'reverse', 'center', 'brake']) {
      if (key === allowed) continue;
      const state = { ...beginnerStart(demonstration), steer: step === 'turn' ? 0 : -CAR.maxSteer };
      const next = stepVehicle(state, beginnerInput(step, { [key]: true }), 1 / 30);
      for (const field of ['x', 'z', 'heading', 'steer', 'speed', 'distance']) assert.equal(next[field], state[field], `${step}: ${key}, ${field}`);
      assert.equal(advanceBeginner(step, state, next), null);
    }
    for (const held of [undefined, null, {}]) {
      const state = beginnerStart(demonstration);
      const next = stepVehicle(state, beginnerInput(step, held), 1 / 30);
      assert.equal(next.speed, 0);
      assert.equal(next.steer, state.steer);
    }
  }
});

test('the complete paused lesson follows the real model inside the lines at multiple frame rates', () => {
  for (const dt of [1 / 120, 1 / 60, 1 / 30]) {
    let state = beginnerStart(demonstration);
    const completed = [];
    for (const step of ['turn', 'hold', 'center']) {
      let outcome = null;
      for (let i = 0; i < 4000 && !outcome; i++) {
        const next = stepVehicle(state, beginnerInput(step, heldFor(step)), dt);
        assert.equal(crossesCourseLine(next), false, `${step} at ${dt}`);
        assert.ok(Math.abs(next.speed) <= 0.5 + 1e-9);
        outcome = advanceBeginner(step, state, next);
        state = next;
      }
      assert.equal(outcome?.kind, 'done', `${step} did not complete`);
      completed.push(step);
      if (step === 'turn') assert.ok(Math.abs(state.steer + CAR.maxSteer) < 1e-6);
      if (step === 'hold') {
        assert.ok(-state.heading <= 2.7 * Math.PI / 180);
        assert.ok(-state.heading > 2.3 * Math.PI / 180);
        assert.ok(Math.abs(state.steer + CAR.maxSteer) < 1e-6);
      }
      // The UI freezes this exact pose and clears velocity during observation.
      state = { ...state, speed: 0 };
      assert.equal(advanceBeginner(step, state, { ...state }), null);
      for (const observationStep of ['orientation', 'look', 'look-right', 'look-left', 'finished']) {
        const next = stepVehicle(state, beginnerInput(observationStep, { reverse: true, right: true, center: true }), dt);
        assert.equal(advanceBeginner(observationStep, state, next), null);
        for (const field of ['x', 'z', 'heading', 'steer', 'speed', 'distance']) assert.ok(Math.abs(next[field] - state[field]) < 1e-12);
      }
    }
    assert.deepEqual(completed, ['turn', 'hold', 'center']);
    assert.ok(Math.abs(state.steer) <= 0.5 * Math.PI / 180);
    assert.ok(Math.abs(state.heading) < 3 * Math.PI / 180);
    // The handoff pose also leaves enough room to complete the straight reverse.
    let braking = false;
    for (let i = 0; i < 2000 && !isParked(state); i++) {
      braking ||= state.z <= -5.2;
      state = stepVehicle(state, { reverse: true, forward: false, left: false, right: false, center: true, brake: braking, speedLimit: 0.5 }, dt);
      assert.equal(crossesCourseLine(state), false);
    }
    assert.equal(isParked(state), true);
  }
});

test('completion requires the actual taught threshold rather than elapsed time or the wrong step', () => {
  const start = beginnerStart(demonstration);
  const unchanged = { ...start, time: 1000 };
  for (const step of ['turn', 'hold', 'center']) assert.equal(advanceBeginner(step, start, unchanged), null);
  const turning = { ...start, steer: -CAR.maxSteer, distance: 0.02 };
  assert.equal(advanceBeginner('turn', start, turning).kind, 'done');
  assert.equal(advanceBeginner('hold', start, turning), null);
  assert.equal(advanceBeginner('center', start, turning), null);
  assert.equal(advanceBeginner('turn', start, { ...turning, distance: 0 }), null);
  const alreadyCentered = { ...demonstration.frames[demonstration.stops[4]], speed: 0 };
  assert.equal(advanceBeginner('center', alreadyCentered, { ...alreadyCentered }), null);
});

test('crossing the course line takes priority even if a taught action reaches its target', () => {
  const start = beginnerStart(demonstration);
  const outside = { ...start, x: 15, steer: -CAR.maxSteer, distance: 1 };
  for (const step of ['turn', 'hold', 'center']) {
    const outcome = advanceBeginner(step, start, outside);
    assert.equal(outcome.kind, 'line');
    assert.ok(outcome.title && outcome.text);
  }
});
