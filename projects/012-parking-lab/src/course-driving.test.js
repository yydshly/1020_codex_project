import test from 'node:test';
import assert from 'node:assert/strict';
import { CAR, BOUNDS, corners } from './vehicle.js';
import { createCourseDrivingSession, stepCourseDriving, courseDrivingPose } from './course-driving.js';

const road = { id: 'road', sceneType: 'road', poses: [{ t: 0, x: 0, z: -20 }, { t: 60, x: 0, z: 400 }] };
const close = (a, b, tolerance, label) => assert.ok(Math.abs(a - b) <= tolerance, `${label}: ${a} vs ${b}`);
function run(state, input, seconds, fps = 60) {
  const count = Math.ceil(seconds * fps);
  for (let i = 0; i < count; i++) state = stepCourseDriving(state, input, Math.min(1 / fps, seconds - i / fps));
  return state;
}

test('handover and resets are independent and preserve source time / signed wheel travel', () => {
  const pose = { x: 1, z: 12, heading: .1, speed: 0, steer: .12, distance: -8, t: 14, gear: 'N', leftSignal: true, lightMode: 'low' };
  const first = createCourseDrivingSession(road, pose), before = structuredClone(first);
  const driven = run(first, { forward: true }, 1);
  assert.deepEqual(first, before, 'simulation must not mutate a stored retry point');
  assert.ok(driven.distance > -8); assert.ok(driven.z > 12);
  const out = courseDrivingPose(driven);
  close(out.t, 15, 1e-9, 'source timeline plus manual elapsed');
  close(out.elapsed, 1, 1e-9, 'manual clock starts at zero');
  const nextChapter = createCourseDrivingSession({ id: 'other', sceneType: 'lights', poses: [{ x: -1.75, z: -22, t: 0, speed: 0, gear: 'N' }] });
  assert.equal(nextChapter.elapsed, 0); assert.equal(nextChapter.distance, 0);
  assert.equal(nextChapter.leftSignal, false); assert.equal(nextChapter.lightMode, 'off');
  assert.equal(nextChapter.stopReason, null); assert.equal(nextChapter.steer, 0);
});

test('a forward-to-reverse request brakes to rest before engaging R and moving backwards', () => {
  let state = createCourseDrivingSession(road, { x: 0, z: 0, speed: 3, gear: '1' });
  state = run(state, { reverse: true }, .1);
  assert.ok(state.speed > 2.5); assert.notEqual(state.gear, 'R');
  assert.equal(state.brake, true); assert.equal(state.throttle, 0);
  let engaged = false;
  for (let i = 0; i < 200; i++) {
    const previous = state;
    state = stepCourseDriving(state, { reverse: true }, .005);
    if (state.gear === 'R') {
      assert.equal(previous.speed, 0, 'a zero-speed state must precede reverse gear');
      assert.ok(state.speed < 0); assert.equal(state.brake, false);
      assert.equal(state.clutchState, 'bite'); engaged = true; break;
    }
  }
  assert.ok(engaged);
  const reverse = run(state, { reverse: true }, 3);
  close(reverse.speed, -1.5, 1e-10, 'bounded reverse speed');
  assert.ok(reverse.distance < state.distance);
  const changingBack = run(reverse, { forward: true }, .1);
  assert.ok(changingBack.speed < 0); assert.equal(changingBack.gear, 'R'); assert.equal(changingBack.brake, true);
});

test('releasing direction keys holds the front wheels and X actively returns them to centre', () => {
  let state = run(createCourseDrivingSession(road, { x: 0, z: 0, speed: 0, gear: 'N' }), { left: true }, .4);
  assert.ok(state.steer > .4);
  const held = state.steer;
  state = run(state, {}, 1); close(state.steer, held, 1e-12, 'no automatic self-centring');
  state = run(state, { left: true, right: true }, .2); close(state.steer, held, 1e-12, 'opposite simultaneous keys hold steering');
  state = run(state, { center: true }, .15); assert.ok(state.steer > 0 && state.steer < held);
  state = run(state, { center: true }, 1); close(state.steer, 0, 1e-12, 'explicit return to centre');
});

test('fixed substeps produce the same driving outcome at 30, 60 and 120 frames per second', () => {
  const drive = fps => {
    let state = createCourseDrivingSession(road, { x: 0, z: 0, speed: 0, gear: 'N' });
    for (const [seconds, input] of [[1.2, { forward: true, left: true }], [.5, { forward: true }],
      [.4, { forward: true, center: true }], [.8, { brake: true }], [1, { reverse: true }]]) state = run(state, input, seconds, fps);
    return state;
  };
  const reference = drive(120);
  for (const fps of [30, 60]) {
    const result = drive(fps);
    for (const key of ['x', 'z', 'heading', 'speed', 'steer', 'distance', 'elapsed']) close(result[key], reference[key], 1e-10, `${fps}Hz/${key}`);
    assert.equal(result.gear, reference.gear); assert.equal(result.stopReason, reference.stopReason);
  }
});

test('bicycle yaw, arc displacement and signed travel agree at a fixed held steering angle', () => {
  const initial = createCourseDrivingSession(road, { x: 0, z: 0, speed: 1, steer: .2, gear: '1', distance: 4 });
  const next = stepCourseDriving(initial, {}, .005), ds = (initial.speed + next.speed) * .005 / 2;
  const radius = CAR.wheelbase / Math.tan(.2), yaw = ds / radius;
  close(next.heading, yaw, 1e-12, 'bicycle heading change');
  close(next.x, radius * (1 - Math.cos(yaw)), 1e-10, 'arc x');
  close(next.z, radius * Math.sin(yaw), 1e-10, 'arc z');
  close(next.distance, 4 + ds, 1e-12, 'signed axle travel');
  assert.equal(next.brake, false, 'natural coasting is not a foot-brake input');
});

test('speed-dependent steering and held-angle speed limits prevent high-speed full-lock turns', () => {
  let state = createCourseDrivingSession(road, { x: 0, z: 0, speed: 8, steer: 0, gear: '3' });
  for (let i = 0; i < 200; i++) {
    state = stepCourseDriving(state, { forward: true, left: true }, .005);
    assert.ok(state.speed <= 8 + 1e-10);
    assert.ok(Math.abs(state.steer) <= CAR.maxSteer);
    assert.ok(state.speed * state.speed * Math.abs(Math.tan(state.steer)) / CAR.wheelbase <= 2.50001);
  }
  assert.ok(state.steer > 0 && state.steer < .12, 'high-speed steering input is small');
  const parkedLock = createCourseDrivingSession(road, { x: 0, z: 0, speed: 0, steer: CAR.maxSteer, gear: '1' });
  const held = run(parkedLock, { forward: true }, 4);
  close(held.steer, CAR.maxSteer, 1e-12, 'speed limits must not silently unwind a held wheel');
  assert.ok(held.speed < 3.2, 'held full-lock steering limits acceleration');
  const straight = run(createCourseDrivingSession(road, { x: 0, z: 0, speed: 0, gear: 'N' }), { forward: true }, 8);
  close(straight.speed, 8, 1e-10, 'road forward speed cap');
});

test('Space braking overrides acceleration and coordinated shifts never show throttle with clutch down', () => {
  const moving = createCourseDrivingSession(road, { x: 0, z: 0, speed: 3, gear: '1' });
  const stopped = run(moving, { forward: true, brake: true }, .6);
  assert.equal(stopped.speed, 0); assert.equal(stopped.brake, true); assert.equal(stopped.throttle, 0);
  assert.equal(stopped.clutchState, 'down');
  let shift = run(createCourseDrivingSession(road, { x: 0, z: 0, speed: 3.39, gear: '1' }), { forward: true }, .05);
  assert.equal(shift.gear, '2'); assert.equal(shift.clutchState, 'down'); assert.equal(shift.throttle, 0);
  shift = run(shift, { forward: true }, .3);
  assert.equal(shift.gear, '2'); assert.equal(shift.clutchState, 'up'); assert.ok(shift.throttle > 0);
  for (const pose of [courseDrivingPose(stopped), courseDrivingPose(shift)]) for (const key of ['clutchValue', 'brakeValue', 'throttle']) assert.ok(pose[key] >= 0 && pose[key] <= 1);
});

test('a latched parking brake holds a stopped car against acceleration until explicitly released', () => {
  const initial = createCourseDrivingSession(road, { x: -1.75, z: 0, speed: 0, gear: 'N', parkingBrake: true });
  const held = run(initial, { forward: true }, 2);
  assert.equal(held.speed, 0); assert.equal(held.z, initial.z); assert.equal(held.throttle, 0);
  assert.equal(held.brake, false, 'a parking brake must not masquerade as a pressed foot brake');
  assert.equal(courseDrivingPose(held).parkingBrake, true);
  const released = run(held, { forward: true, parkingBrake: false }, 1);
  assert.ok(released.z > held.z); assert.ok(released.speed > 0);
  assert.equal(courseDrivingPose(released).parkingBrake, false);
});

test('the entire car stops inside the teaching bounds and cannot continue indefinitely after a boundary stop', () => {
  const small = { id: 'small', sceneType: 'prepare', poses: [{ x: 0, z: 0, t: 0, speed: 0, gear: 'N' }] };
  let state = createCourseDrivingSession(small);
  assert.deepEqual(state.bounds, { left: -20, right: 20, back: -20, front: 20 });
  state = run(state, { forward: true }, 10);
  assert.equal(state.stopReason, 'teaching-boundary'); assert.equal(state.speed, 0);
  assert.equal(state.brake, true); assert.equal(state.throttle, 0);
  for (const p of corners(state)) assert.ok(p.x >= -20 && p.x <= 20 && p.z >= -20 && p.z <= 20);
  assert.strictEqual(stepCourseDriving(state, { reverse: true }, .1), state, 'boundary stop requires an explicit new session');
  const parking = createCourseDrivingSession({ id: 'reverse-parking', sceneType: 'parking', poses: [{ x: 0, z: 0, t: 0 }] });
  assert.deepEqual(parking.bounds, BOUNDS);
  assert.equal(parking.stopReason, null);
  const reset = createCourseDrivingSession(small); assert.equal(reset.stopReason, null); assert.equal(reset.elapsed, 0);
});

test('signals and lights are explicit persistent controls and hill pose agrees with the finite ramp geometry', () => {
  let state = createCourseDrivingSession(road, { x: 0, z: 0, speed: 0, lightMode: 'low' });
  state = stepCourseDriving(state, { leftSignal: true, rightSignal: false, lightMode: 'high' }, .01);
  state = stepCourseDriving(state, {}, .01);
  assert.equal(state.leftSignal, true); assert.equal(state.rightSignal, false); assert.equal(state.lightMode, 'high');
  state = stepCourseDriving(state, { leftSignal: false, rightSignal: true, lightMode: 'off' }, .01);
  const pose = courseDrivingPose(state); assert.equal(pose.leftSignal, false); assert.equal(pose.rightSignal, true); assert.equal(pose.lightMode, 'off');
  const hill = { id: 'hill-start', sceneType: 'hill', poses: [{ x: 0, z: -14, t: 0 }, { x: 0, z: 80, t: 40 }] };
  for (const [x, z, heading, y, slope] of [[0, 12, 0, 1.2, .1], [0, 30, 0, 1.8, 0], [0, 64, 0, .9, -.1],
    [0, 75, 0, 0, 0], [5, 12, 0, 0, 0], [0, 12, Math.PI / 2, 1.2, .1], [0, 64, Math.PI, .9, -.1]]) {
    const p = courseDrivingPose(createCourseDrivingSession(hill, { x, z, heading, speed: 0, gear: 'N' }));
    close(p.y, y, 1e-10, `hill ${x}/${z}: height`);
    close(p.pitch, -Math.atan(slope * Math.cos(heading)), 1e-10, `hill ${x}/${z}: pitch follows travel direction`);
  }
});
