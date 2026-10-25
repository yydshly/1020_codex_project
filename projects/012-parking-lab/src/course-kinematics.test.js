import test from 'node:test';
import assert from 'node:assert/strict';
import { EXAM_COURSES, sampleChapterPose } from './exam-courses.js';
import { createDemonstration } from './lesson.js';
import { CAR, corners } from './vehicle.js';

const all = Object.values(EXAM_COURSES).flatMap(course => course.chapters);
const chapter = id => all.find(c => c.id === id);
const at = (id, t) => sampleChapterPose(chapter(id), t);
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const close = (a, b, tolerance, message) => assert.ok(Math.abs(a - b) <= tolerance, `${message}: ${a} vs ${b}`);

test('every chapter has one position / speed / heading / steering / wheel-distance motion at arbitrary seeks', () => {
  const dt = .0001;
  for (const c of all) {
    // Off-grid times catch interpolation errors hidden by keyframe-only tests;
    // cue and keyframe times additionally exercise joins, holds and gear changes.
    const times = [...c.cues.map(cue => cue.t), ...c.poses.map(p => p.t)];
    for (let t = .073; t < c.duration; t += .173) times.push(t);
    for (const t of times) {
      const p = sampleChapterPose(c, t), label = `${c.id}@${t.toFixed(4)}`;
      assert.ok(Number.isFinite(p.distance), `${label}: signed wheel travel`);
      assert.ok(Math.abs(p.steer) <= CAR.maxSteer + .0001, `${label}: front steering limit`);
      if (t < dt || t > c.duration - dt) continue;
      const before = sampleChapterPose(c, t - dt), after = sampleChapterPose(c, t + dt);
      const vx = (after.x - before.x) / (2 * dt), vz = (after.z - before.z) / (2 * dt);
      // The original parking lesson is a preserved 120Hz vehicle integration.
      // Its per-frame chord velocity differs from instantaneous speed by at
      // most half an acceleration tick (~.025m/s). New trajectories are tighter.
      const tolerance = c.id === 'reverse-parking' ? .03 : .0002;
      close(vx, p.speed * Math.sin(p.heading), tolerance, `${label}: longitudinal/lateral velocity`);
      close(vz, p.speed * Math.cos(p.heading), tolerance, `${label}: forward velocity`);
      close((after.distance - before.distance) / (2 * dt), p.speed, tolerance, `${label}: wheel distance derivative`);
      if (Math.abs(p.speed) > .1) close(wrap(after.heading - before.heading) / (2 * dt),
        p.speed / CAR.wheelbase * Math.tan(p.steer), c.id === 'reverse-parking' ? .005 : .0002, `${label}: bicycle yaw`);
    }
  }
});

test('all moving chapters have gears matching travel direction and no moving parking brake or inherited clutch-down', () => {
  for (const c of all) for (let t = .037; t < c.duration; t += .137) {
    const p = sampleChapterPose(c, t), label = `${c.id}@${t}`;
    if (Math.abs(p.speed) <= .01) continue;
    assert.equal(p.gear === 'R', p.speed < 0, `${label}: direction and gear`);
    assert.notEqual(p.gear, 'N', `${label}: not moving in neutral`);
    assert.ok(!p.parkingBrake, `${label}: parking brake released before movement`);
    if (!['gears', 'reverse-parking'].includes(c.id)) assert.notEqual(p.clutchState, 'down', `${label}: driving clutch released or biting`);
    if (c.id !== 'reverse-parking') {
      for (const key of ['clutchValue', 'brakeValue', 'throttle']) assert.ok(p[key] >= 0 && p[key] <= 1, `${label}/${key}`);
      if (p.brake) assert.ok(p.acceleration < -.059, `${label}: a moving brake must accompany slowing`);
      if (p.brake || p.clutchState === 'down') assert.equal(p.throttle, 0, `${label}: no acceleration pedal with braking / disengaged clutch`);
    }
  }
});

test('decorating chapters with teaching metadata retains continuous physics through a shallow chapter copy', () => {
  const dt = .0001;
  for (const [id, time] of [['crosswalk', 14.1], ['hill-start', 2.05], ['lane-change', 6.5], ['reverse-parking', 12.72]]) {
    const original = chapter(id), decorated = { ...original, teachingSteps: original.cues.map(cue => ({ ...cue })) };
    const p = sampleChapterPose(decorated, time), before = sampleChapterPose(decorated, time - dt), after = sampleChapterPose(decorated, time + dt);
    assert.deepEqual(p, sampleChapterPose(original, time), `${id}: metadata decoration cannot select a different motion model`);
    const tolerance = id === 'reverse-parking' ? .03 : .0002;
    close((after.x - before.x) / (2 * dt), p.speed * Math.sin(p.heading), tolerance, `${id}: copied chapter vx`);
    close((after.z - before.z) / (2 * dt), p.speed * Math.cos(p.heading), tolerance, `${id}: copied chapter vz`);
    close(wrap(after.heading - before.heading) / (2 * dt), p.speed / CAR.wheelbase * Math.tan(p.steer), id === 'reverse-parking' ? .005 : .0002, `${id}: copied chapter steering`);
    close((after.distance - before.distance) / (2 * dt), p.speed, tolerance, `${id}: copied chapter wheel travel`);
  }
});

test('hill, crosswalk, departure, side parking and final stop have continuous zero-speed holds and restarts', () => {
  const boundaries = [['hill-start', 2], ['hill-start', 21], ['hill-start', 27], ['crosswalk', 9], ['crosswalk', 14],
    ['start', 6], ['side-parking', 2], ['side-parking', 19], ['side-parking', 22], ['pull-over', 12]];
  for (const [id, time] of boundaries) {
    close(at(id, time).speed, 0, .000001, `${id}@${time}: exact rest`);
    for (const offset of [-.001, .001]) assert.ok(Math.abs(at(id, time + offset).speed) < .003, `${id}@${time}: no jump into / out of a hold`);
  }
  for (const [id, times] of [['hill-start', [21, 23, 25]], ['crosswalk', [9, 11, 13.9]], ['side-parking', [19, 20, 21]], ['pull-over', [12, 18, 25]]]) {
    const first = at(id, times[0]);
    for (const t of times) {
      const p = at(id, t); assert.equal(p.speed, 0); assert.equal(p.brake, true);
      close(p.x, first.x, 1e-10, `${id}: held x`); close(p.z, first.z, 1e-10, `${id}: held z`);
    }
  }
  for (const [id, t] of [['crosswalk', 14.1], ['hill-start', 27.1], ['start', 6.1], ['side-parking', 22.1]]) {
    const p = at(id, t); assert.ok(p.speed > 0); assert.equal(p.brake, false);
    assert.equal(p.parkingBrake, false); assert.equal(p.clutchState, 'bite');
  }
  assert.equal(at('hill-start', 26).parkingBrake, true);
  assert.equal(at('hill-start', 26).clutchState, 'bite');
  assert.equal(at('hill-start', 27).parkingBrake, false);
});

test('lane changes and overtaking show turn-in, opposite return-wheel input and straight front wheels in each lane', () => {
  for (const [id, secondStart] of [['lane-change', 16], ['overtake', 23]]) {
    assert.ok(at(id, 6.5).steer > .02, `${id}: left turn-in`);
    assert.ok(at(id, 9.5).steer < -.02, `${id}: right return-wheel`);
    assert.ok(at(id, secondStart + 1.5).steer < -.02, `${id}: right turn-in`);
    assert.ok(at(id, secondStart + 4.5).steer > .02, `${id}: left return-wheel`);
    for (const t of [1, 12, secondStart + 6.1]) close(at(id, t).steer, 0, 1e-5, `${id}: straight wheels`);
    close(at(id, 8).steer, 0, 1e-5, `${id}: mid-manoeuvre direction change`);
  }
  assert.ok(at('pull-over', 4.7).steer < 0);
  close(at('pull-over', 5.786001015).steer, 0, 1e-7, 'pull-over: measured return-wheel time');
  assert.ok(at('pull-over', 7).steer > 0);
  close(at('pull-over', 8).steer, 0, 1e-7, 'pull-over: straight before stopping');
  assert.equal(at('pull-over', .9).rightSignal, false); assert.equal(at('pull-over', 1).rightSignal, true);
});

test('normal lane changes never mistake settling lateral velocity for a foot-brake instruction', () => {
  for (const id of ['lane-change', 'overtake']) {
    const c = chapter(id);
    for (let t = 0; t <= c.duration; t += .037) {
      const p = sampleChapterPose(c, t);
      assert.equal(p.brake, false, `${id}@${t}: no invented brake input`);
      assert.equal(p.brakeValue, 0, `${id}@${t}: pedal and HUD agree`);
      assert.equal(p.throttle, .18, `${id}@${t}: steady demonstration throttle`);
    }
    assert.ok(at(id, 9.5).acceleration < -.06, `${id}: return-wheel segment still exercises the former false-brake case`);
    assert.equal(at(id, 9.5).brake, false);
  }
});

test('signed wheel travel is seek-independent, decreases in reverse and increases after the forward transfer', () => {
  for (const c of all) {
    const time = c.duration * .713, first = sampleChapterPose(c, time);
    sampleChapterPose(c, c.duration); sampleChapterPose(c, 0);
    assert.deepEqual(sampleChapterPose(c, time), first, c.id);
    close(sampleChapterPose(c, 0).distance, 0, 1e-10, `${c.id}: initial wheel travel`);
  }
  assert.ok(at('side-parking', 18).distance < at('side-parking', 3).distance);
  assert.ok(at('side-parking', 30).distance > at('side-parking', 22).distance);
  assert.ok(at('reverse-parking', 16).distance < at('reverse-parking', 3).distance);
  assert.ok(at('reverse-parking', 30).distance > at('reverse-parking', 18).distance);
});

test('sparse teaching trajectories retain their original anchors, stop positions, road corridor and chapter durations', () => {
  for (const [id, anchors] of [
    ['hill-start', [[0, 0, -14], [10, 0, 0], [21, 0, 12.25], [27, 0, 12.25], [40, 0, 28]]],
    ['start', [[0, -2.3, -25], [6, -2.3, -25], [10, -1.75, -19], [21, -1.75, 20]]],
    ['crosswalk', [[0, -1.75, -25], [9, -1.75, 8.8], [14, -1.75, 8.8], [28, -1.75, 60]]],
    ['pull-over', [[0, -1.75, -25], [4, -1.75, -10], [8, -2.3, 1], [12, -2.3, 7], [26, -2.3, 7]]],
  ]) for (const [t, x, z] of anchors) { const p = at(id, t); close(p.x, x, 1e-9, `${id}@${t}/x`); close(p.z, z, 1e-9, `${id}@${t}/z`); }
  const angle = chapter('right-angle');
  for (let t = 0; t <= angle.duration; t += .073) for (const p of corners(sampleChapterPose(angle, t))) {
    const vertical = Math.abs(p.x) <= 1.75 && p.z <= 6.85;
    const horizontal = p.z >= 3.35 && p.z <= 6.85 && p.x >= -1.75;
    assert.ok(vertical || horizontal, `angle: full car remains in L road at ${t}`);
  }
  for (const id of ['intersection', 'meeting', 'night']) assert.ok(at(id, 2).speed > at(id, 9).speed, `${id}: narrated approach actually slows`);
});

test('parking sampler preserves original 120Hz vehicle frames and cues announce steering before actual input', () => {
  const original = createDemonstration(), c = chapter('reverse-parking');
  for (let i = 0; i < original.frames.length; i += 59) {
    const expected = original.frames[i], p = sampleChapterPose(c, expected.time);
    for (const key of ['x', 'z', 'heading', 'speed', 'steer']) close(p[key], expected[key], 1e-10, `parking frame ${i}/${key}`);
  }
  const turnRight = c.cues.find(c => c.title === '准备向右打方向');
  const returnRight = c.cues.find(c => c.title === '主动回正');
  const turnLeft = c.cues.find(c => c.title === '准备向左打方向');
  const returnLeft = c.cues.find(c => c.title === '左侧主动回正');
  assert.ok(turnRight.t < 3.6834 && 3.6834 - turnRight.t < .6);
  assert.ok(returnRight.t < 12.667 && 12.667 - returnRight.t < .5);
  assert.ok(turnLeft.t < 38.851 && 38.851 - turnLeft.t < .6);
  assert.ok(returnLeft.t < 47.834 && 47.834 - returnLeft.t < .5);
  assert.ok(c.cues.every((cue, i) => !i || cue.t > c.cues[i - 1].t));
});
