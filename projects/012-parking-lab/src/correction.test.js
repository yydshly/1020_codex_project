import test from 'node:test';
import assert from 'node:assert/strict';
import { CAR, initialState, stepVehicle, crossesCourseLine, localToWorld } from './vehicle.js';
import { predictStraightReverse } from './steering-coach.js';
import { createCorrectionDrill, correctionInput, advanceCorrection, correctionGuidance,
  CORRECTION_SPEED, CORRECTION_STEER_LIMIT } from './correction.js';

const dt = 1 / 120;
const correctTurn = side => ({ left: side === 'right', right: side === 'left' });
const practice = side => {
  const drill = { ...createCorrectionDrill(side), phase: 'practice' };
  return { drill, state: { ...drill.start } };
};
function tick(value, controls = {}) {
  const input = correctionInput(value.drill, controls);
  const next = stepVehicle(value.state, input, dt);
  return { drill: advanceCorrection(value.drill, value.state, next, input), state: next };
}
function reachReturn(side) {
  let value = practice(side), sawNarrowSafePath = false;
  for (let i = 0; i < 1200 && value.drill.phase === 'practice'; i++) {
    value = tick(value, correctTurn(side));
    const forecast = predictStraightReverse(value.state);
    if (forecast.safe && forecast.minimumSideClearance >= .035 && forecast.minimumSideClearance < .08) {
      sawNarrowSafePath = true;
      assert.equal(value.drill.phase, 'practice', 'a merely clear path does not yet meet the 8 cm teaching margin');
    }
  }
  assert.equal(value.drill.phase, 'return');
  assert.equal(sawNarrowSafePath, true);
  assert.ok(predictStraightReverse(value.state).minimumSideClearance >= .08);
  return value;
}
function driveUntilResult(side, controls) {
  let value = practice(side);
  for (let i = 0; i < 3000 && value.drill.phase !== 'result'; i++) value = tick(value, controls);
  assert.equal(value.drill.phase, 'result');
  return value;
}

test('both correction observations start stationary, inside the course, with symmetric recoverable deviations', () => {
  const left = createCorrectionDrill('left'), right = createCorrectionDrill('right');
  assert.equal(left.phase, 'observe');
  assert.equal(left.start.x, -right.start.x);
  assert.equal(left.start.heading, -right.start.heading);
  for (const drill of [left, right]) {
    assert.equal(drill.start.speed, 0);
    assert.equal(drill.start.steer, 0);
    assert.equal(crossesCourseLine(drill.start), false);
    assert.equal(drill.before.safe, false);
    assert.equal(drill.result, null);
    assert.match(correctionGuidance(drill).title, /判断哪一侧会越倒越紧/);
  }
  assert.throws(() => createCorrectionDrill('front'), RangeError);
});

test('from straight reverse, rear trajectory bends with the steering while the front swings opposite', () => {
  for (const sign of [1, -1]) {
    let pose = { x: 0, z: 0, heading: 0, steer: 0, speed: -CORRECTION_SPEED, time: 0, distance: 0 };
    const input = { reverse: true, forward: false, left: sign === 1, right: sign === -1,
      speedLimit: CORRECTION_SPEED, steerLimit: CORRECTION_STEER_LIMIT };
    for (let i = 0; i < 100; i++) pose = stepVehicle(pose, input, dt);
    const rear = localToWorld(pose, 0, -CAR.rearOverhang);
    const front = localToWorld(pose, 0, CAR.length - CAR.rearOverhang);
    assert.ok(rear.x * sign > .01, 'rear curves toward the requested vehicle-side direction');
    assert.ok(front.x * sign < -.01, 'front swings in the opposite direction');
    assert.ok(pose.z < 0, 'the vehicle is reversing throughout');
  }
});

test('correct symmetric small turns reach the 8 cm margin and pass only after active centering actually finishes', () => {
  for (const side of ['left', 'right']) for (const stopped of [false, true]) {
    let value = reachReturn(side);
    assert.equal(value.drill.result, null, 'improved clearance alone is not a completed correction');
    assert.ok(Math.abs(value.state.steer) > 0);
    assert.match(correctionGuidance(value.drill).title, /主动回正/);
    if (stopped) value.state = { ...value.state, speed: 0 };
    const returnStart = { ...value.state };
    for (let i = 0; i < 120 && value.drill.phase !== 'result'; i++) {
      value = tick(value, { center: true, brake: stopped });
      if (Math.abs(value.state.steer) > 1e-7) assert.equal(value.drill.result, null);
    }
    assert.equal(value.state.steer, 0);
    assert.equal(value.drill.result.kind, 'good');
    assert.equal(value.drill.result.after.safe, true);
    assert.ok(value.drill.result.after.minimumSideClearance >= .08);
    if (stopped) {
      assert.equal(value.state.x, returnStart.x);
      assert.equal(value.state.z, returnStart.z);
      assert.ok(Math.abs(value.state.heading - returnStart.heading) < 1e-12);
      assert.equal(value.state.distance, returnStart.distance);
    }
  }
});

test('turning toward the tight side stops either exercise with a specific direction error', () => {
  for (const side of ['left', 'right']) {
    const value = driveUntilResult(side, { left: side === 'left', right: side === 'right' });
    assert.equal(value.drill.result.kind, 'wrong');
    assert.equal(crossesCourseLine(value.state), false);
    assert.ok(value.state.time < 0.1);
    assert.strictEqual(advanceCorrection(value.drill, value.state, { ...value.state, time: 30 }, {}), value.drill);
  }
});

test('X before any correction and X after a short insufficient correction do not pass', () => {
  for (const side of ['left', 'right']) for (const turnSteps of [0, 12]) {
    let value = practice(side);
    for (let i = 0; i < turnSteps; i++) value = tick(value, correctTurn(side));
    for (let i = 0; i < 120 && value.drill.phase !== 'result'; i++) value = tick(value, { center: true });
    assert.equal(value.state.steer, 0);
    assert.equal(value.drill.result.kind, 'early');
    assert.equal(value.drill.result.after.safe, false);
  }
});

test('an unsafe completed return past the opposite heading is late rather than early', () => {
  for (const side of ['left', 'right']) {
    const sign = side === 'left' ? 1 : -1;
    const value = practice(side);
    value.drill = { ...value.drill, phase: 'return', sawTurn: true };
    // Exercise completion handling directly: normal per-frame supervision would
    // already have stopped such a long-held correction before this pose.
    value.state = { ...value.state, heading: sign * 6 * Math.PI / 180, steer: -sign * Math.PI / 180 };
    const completed = tick(value, { center: true, brake: true });
    assert.equal(completed.state.steer, 0);
    assert.equal(completed.drill.result.kind, 'late');
    assert.equal(completed.drill.result.after.safe, false);
    assert.match(completed.drill.result.text, /反向摆过/);
  }
});

test('inaction reaches a boundary, overholding stops, and a prolonged stationary brake reaches the time limit', () => {
  for (const side of ['left', 'right']) {
    const noAction = driveUntilResult(side, {});
    assert.equal(noAction.drill.result.kind, 'line');
    assert.equal(crossesCourseLine(noAction.state), true);
    const held = driveUntilResult(side, correctTurn(side));
    assert.equal(held.drill.result.kind, 'late');
    assert.ok(held.state.distance > 2);
    const timed = driveUntilResult(side, { brake: true });
    assert.equal(timed.drill.result.kind, 'late');
    assert.ok(timed.state.time > 20);
    assert.equal(timed.state.distance, 0);
    assert.equal(crossesCourseLine(timed.state), false);
  }
});

test('observation and result phases reject motion controls and cannot advance the drill', () => {
  for (const phase of ['observe', 'result']) {
    const drill = { ...createCorrectionDrill('left'), phase };
    const input = correctionInput(drill, { left: true, right: true, center: true });
    const next = stepVehicle(drill.start, input, dt);
    assert.equal(input.reverse, false);
    assert.equal(input.brake, true);
    assert.equal(next.distance, 0);
    assert.equal(next.steer, 0);
    assert.strictEqual(advanceCorrection(drill, drill.start, { ...next, time: 30 }, input), drill);
  }
});

test('the assisted reverse remains low-speed and its brake actually stops the car', () => {
  let value = practice('left');
  for (let i = 0; i < 80; i++) value = tick(value);
  assert.equal(value.state.speed, -CORRECTION_SPEED);
  const brakingStart = value.state.distance;
  for (let i = 0; i < 24; i++) value = tick(value, { brake: true, forward: true });
  assert.equal(value.state.speed, 0);
  assert.ok(value.state.distance - brakingStart < .02);
  assert.equal(value.drill.phase, 'practice');
  assert.equal(correctionInput(value.drill, { forward: true }).forward, false);
});

test('optional steering limits leave ordinary vehicle inputs unchanged and bound the correction turn', () => {
  const inputs = [{ reverse: true, right: true }, {}, { reverse: true, left: true }, { center: true, brake: true }];
  for (const steerLimit of [undefined, null, NaN, Infinity, CAR.maxSteer, CAR.maxSteer * 2]) {
    let ordinary = initialState(), optional = initialState();
    for (const input of inputs) for (let i = 0; i < 90; i++) {
      ordinary = stepVehicle(ordinary, input, dt);
      optional = stepVehicle(optional, { ...input, steerLimit }, dt);
      assert.deepEqual(optional, ordinary);
    }
  }
  for (const side of ['left', 'right']) {
    let value = practice(side), ordinary = { ...value.state };
    for (let i = 0; i < 120; i++) {
      ordinary = stepVehicle(ordinary, { ...correctTurn(side), reverse: true, speedLimit: CORRECTION_SPEED }, dt);
      value = tick(value, correctTurn(side));
      assert.ok(Math.abs(value.state.steer) <= CORRECTION_STEER_LIMIT + 1e-10);
    }
    assert.equal(Math.abs(value.state.steer), CORRECTION_STEER_LIMIT);
    assert.equal(Math.abs(ordinary.steer), CAR.maxSteer);
    assert.ok(Math.abs(ordinary.heading - value.drill.start.heading) > Math.abs(value.state.heading - value.drill.start.heading), 'ordinary full-lock steering still turns more than the assisted small correction');
  }
});
