import test from 'node:test';
import assert from 'node:assert/strict';
import { CAR, COURSE, initialState, stepVehicle, isParked, outsideBounds, crossesBayLine, frontWheelsPast, localToWorld } from './vehicle.js';

const tick = (s, input, seconds = 1) => { for (let t = 0; t < seconds; t += 1 / 120) s = stepVehicle(s, input, 1 / 120); return s; };
test('wheel assemblies fit inside the body instead of protruding into the mirror view', () => {
  // The visible body is 1.78 m wide; its widest wheel part is the 0.255 m spoke.
  const bodyHalfWidth = 1.78 / 2, wheelAssemblyHalfWidth = 0.255 / 2;
  const tireOuterEdge = CAR.trackWidth / 2 + CAR.tireWidth / 2;
  const wheelOuterEdge = CAR.trackWidth / 2 + wheelAssemblyHalfWidth;
  assert.ok(CAR.trackWidth > 0 && CAR.tireWidth > 0);
  assert.ok(tireOuterEdge <= bodyHalfWidth);
  assert.ok(wheelOuterEdge <= bodyHalfWidth);
  assert.ok(bodyHalfWidth <= CAR.width / 2, 'rendered body remains inside collision footprint');
});

test('control lines use the two front tire contact centers, independently of the body sides', () => {
  for (const [side, line, direction] of [['a', COURSE.controlA, -1], ['b', COURSE.controlB, 1]]) {
    const passed = { ...initialState(), heading: 0, x: line + direction * (CAR.trackWidth / 2 + 0.03) };
    assert.equal(frontWheelsPast(passed, side), true);
    // A body-side test would still reject this valid wheel crossing.
    const innerBodyPoint = localToWorld(passed, -direction * CAR.width / 2, CAR.wheelbase);
    assert.ok(direction * (innerBodyPoint.x - line) < 0);
    const oneWheelShort = { ...passed, x: line + direction * (CAR.trackWidth / 2 - 0.03) };
    assert.equal(frontWheelsPast(oneWheelShort, side), false);
    const onLine = { ...passed, x: line + direction * CAR.trackWidth / 2 };
    assert.equal(frontWheelsPast(onLine, side), false);
  }
});

test('front-wheel control checks transform the actual axle with the vehicle heading', () => {
  for (const [side, line, direction] of [['a', COURSE.controlA, -1], ['b', COURSE.controlB, 1]]) {
    const crossed = { ...initialState(), heading: direction * Math.PI / 2, x: line - direction * (CAR.wheelbase - 0.03) };
    assert.equal(frontWheelsPast(crossed, side), true);
    assert.ok(direction * (crossed.x - line) < 0, 'rear axle has not crossed yet');
    assert.equal(frontWheelsPast({ ...crossed, x: crossed.x - direction * 0.06 }, side), false);
  }
});

test('forward and reverse move in opposite directions from the starting pose', () => {
  const s = initialState();
  assert.ok(tick(s, { forward: true }).x < s.x);
  assert.ok(tick(s, { reverse: true }).x > s.x);
});
test('right steering while reversing turns the tail toward the bay', () => {
  const s = tick(initialState(), { reverse: true, right: true }, 2);
  assert.ok(s.heading > -Math.PI / 2);
  assert.ok(s.z < initialState().z);
  assert.ok(Math.abs(s.steer + CAR.maxSteer) < 1e-7);
});
test('brake stops a reversing car without making it drive forward', () => {
  const s = tick(tick(initialState(), { reverse: true }, 2), { brake: true }, 1);
  assert.equal(s.speed, 0);
});
test('success requires the whole car inside the bay, facing out, and stopped', () => {
  const parked = { ...initialState(), x: 0, z: -5.6, heading: 0 };
  assert.equal(isParked(parked), true);
  assert.equal(isParked({ ...parked, speed: 0.3 }), false);
  assert.equal(isParked({ ...parked, heading: Math.PI }), false);
  assert.equal(isParked({ ...parked, x: 0.8 }), false);
  assert.equal(crossesBayLine(parked), false);
  assert.equal(crossesBayLine({ ...parked, x: 0.8 }), true);
});
test('outer boundary cannot be crossed by the bumper', () => {
  const s = tick({ ...initialState(), x: -10, z: 8, heading: 0 }, { forward: true }, 10);
  assert.equal(outsideBounds(s), false);
  assert.ok(s.z + CAR.length - CAR.rearOverhang <= 12.00001);
});
test('integrating the same inputs at 30 and 120 fps produces consistent motion', () => {
  const integrate = hz => { let s = initialState(); for (let i = 0; i < 3 * hz; i++) s = stepVehicle(s, { reverse: true, right: true }, 1 / hz); return s; };
  const a = integrate(30), b = integrate(120);
  assert.ok(Math.hypot(a.x - b.x, a.z - b.z) < 0.05);
});
test('letting go of steering holds the angle; active centering returns it to zero', () => {
  const turned = tick(initialState(), { right: true }, 1);
  const held = tick(turned, {}, 1);
  assert.equal(held.steer, turned.steer);
  const centered = tick(held, { center: true }, 1);
  assert.equal(centered.steer, 0);
});
