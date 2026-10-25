import test from 'node:test';
import assert from 'node:assert/strict';
import { EXAM_COURSES, EXAM_NARRATION, sampleChapterPose, courseDuration, cueAt } from './exam-courses.js';
import { CAR, corners } from './vehicle.js';

const courses = Object.values(EXAM_COURSES), all = courses.flatMap(course => course.chapters);
const c3 = id => EXAM_COURSES.subject3.chapters.find(chapter => chapter.id === id);
const c2 = id => EXAM_COURSES.subject2.chapters.find(chapter => chapter.id === id);

test('C1 catalog covers five field projects and all sixteen road projects plus separate simulated lights', () => {
  assert.deepEqual(EXAM_COURSES.subject2.chapters.map(c => c.id), ['reverse-parking', 'hill-start', 'side-parking', 'curve-driving', 'right-angle']);
  const roadIds = ['prepare', 'start', 'straight', 'gears', 'lane-change', 'pull-over', 'intersection', 'left-turn',
    'right-turn', 'crosswalk', 'school', 'bus', 'meeting', 'overtake', 'uturn', 'night'];
  for (const id of roadIds) assert.ok(c3(id), `${id} must not be hidden behind another chapter`);
  assert.equal(EXAM_COURSES.subject3.chapters.length, roadIds.length + 1);
  assert.ok(c3('lights'));
  assert.equal(EXAM_COURSES.subject3.chapters.at(-1).id, 'pull-over');
  assert.match(EXAM_COURSES.subject3.scope, /不是当地.*3 公里.*理论题库/);
});

test('every chapter has stable narrated guidance, valid ordered poses and ordered observation cues', () => {
  assert.equal(Object.keys(EXAM_NARRATION).length, 22);
  assert.equal(new Set(all.map(c => c.narrationKey)).size, all.length);
  for (const item of all) {
    assert.ok(item.duration > 0);
    assert.equal(item.poses[0].t, 0);
    assert.equal(item.poses.at(-1).t, item.duration);
    assert.ok(item.cues.length >= 3, item.id);
    assert.ok([...item.narration].length <= 120, `${item.id}: bounded voice introduction`);
    for (const key of ['objective', 'look', 'action', 'risk', 'transition']) assert.ok(item[key]?.length, `${item.id}/${key}`);
    assert.equal(EXAM_NARRATION[item.narrationKey].text, item.narration);
    let before = -Infinity;
    for (const p of item.poses) {
      assert.ok(p.t > before, `${item.id}: timestamps cannot repeat`); before = p.t;
      for (const key of ['x', 'y', 'z', 'heading', 'speed', 'steer', 'pitch']) assert.ok(Number.isFinite(p[key]), `${item.id}/${key}`);
      assert.ok(Math.abs(p.steer) <= CAR.maxSteer + .001, `${item.id}: plausible front steering`);
      assert.ok(['N', 'R', '1', '2', '3', '4', '5'].includes(p.gear));
    }
    assert.ok(item.cues.every((cue, i) => cue.t >= 0 && cue.t <= item.duration && (!i || cue.t >= item.cues[i - 1].t)));
    assert.equal(cueAt(item, item.duration), item.cues.at(-1));
  }
  for (const course of courses) assert.ok(courseDuration(course) > 200);
});

test('moving projects contain substantial motion, static preparation/lights stay stationary and interpolation clamps', () => {
  for (const item of all) {
    let distance = 0;
    for (let i = 1; i < item.poses.length; i++) distance += Math.hypot(item.poses[i].x - item.poses[i - 1].x, item.poses[i].z - item.poses[i - 1].z);
    if (['prepare', 'lights'].includes(item.id)) assert.equal(distance, 0);
    else assert.ok(distance > 15, item.id);
    assert.deepEqual(sampleChapterPose(item, -100), item.poses[0]);
    assert.deepEqual(sampleChapterPose(item, item.duration + 100), item.poses.at(-1));
    const middle = sampleChapterPose(item, item.duration * .437);
    assert.ok(Number.isFinite(middle.heading) && Number.isFinite(middle.x));
  }
  const wrap = { duration: 2, poses: [{ ...all[0].poses[0], t: 0, heading: Math.PI - .1 },
    { ...all[0].poses[0], t: 2, heading: -Math.PI + .1 }] };
  assert.ok(Math.abs(Math.abs(sampleChapterPose(wrap, 1).heading) - Math.PI) < 1e-9);
});

test('original reverse parking retains both reverse entries, parked positions and A/B transfer', () => {
  const item = c2('reverse-parking');
  assert.ok(item.poses.some(p => p.x > 6 && p.gear === 'R'));
  assert.ok(item.poses.some(p => p.x < -6 && p.gear === 'R'));
  assert.ok(item.poses.some(p => p.z < -5));
  assert.ok(item.poses.some(p => p.speed > .1));
  assert.ok(Math.abs(item.poses.at(-1).speed) < .01);
});

test('hill chapter includes raised stationary hold and forward restart without a backward roll', () => {
  const item = c2('hill-start');
  const hold = item.poses.filter(p => p.parkingBrake);
  assert.ok(hold.length >= 2 && hold[0].y > 1);
  assert.equal(hold[0].z, hold.at(-1).z);
  assert.ok(hold.at(-1).t - hold[0].t >= 4);
  assert.ok(item.poses.every((p, i) => !i || p.z >= item.poses[i - 1].z));
  assert.equal(item.poses.at(-1).y, 1.8);
  assert.equal(sampleChapterPose(item, 25).clutchState, 'down');
  assert.equal(sampleChapterPose(item, 26).clutchState, 'bite');
  assert.equal(sampleChapterPose(item, 26).parkingBrake, true, 'establish bite before releasing parking brake');
  assert.equal(sampleChapterPose(item, 27).parkingBrake, false);
  assert.equal(sampleChapterPose(item, 27).clutchState, 'bite');
  assert.equal(sampleChapterPose(item, 33).clutchState, 'up');
  assert.equal(sampleChapterPose(c3('start'), 6).clutchState, 'bite');
});

test('side parking reaches a fully contained stationary bay pose and then leaves forwards', () => {
  const item = c2('side-parking'), parked = sampleChapterPose(item, 21), bay = item.scene.bay;
  assert.equal(parked.speed, 0);
  for (const point of corners(parked)) {
    assert.ok(Math.abs(point.x - bay.x) < bay.width / 2);
    assert.ok(Math.abs(point.z - bay.z) < bay.length / 2);
  }
  assert.ok(item.poses.some(p => p.speed < 0));
  assert.ok(item.poses.some(p => p.t > 22 && p.speed > 0 && p.leftSignal));
  assert.ok(Math.abs(item.poses.at(-1).x) < .001);
});

test('right-angle trajectory keeps the full car on the agreed L road rather than a narrow circular ribbon', () => {
  for (const p of c2('right-angle').poses) for (const point of corners(p)) {
    const vertical = Math.abs(point.x) <= 1.75 && point.z <= 6.85;
    const horizontal = point.z >= 3.35 && point.z <= 6.85 && point.x >= -1.75;
    assert.ok(vertical || horizontal, `body outside L at ${p.t}: ${JSON.stringify(point)}`);
  }
});

test('left/right intersections exit in right-hand traffic lanes, not opposing lanes', () => {
  const left = c3('left-turn').poses.at(-1), right = c3('right-turn').poses.at(-1);
  assert.ok(left.x > 20 && Math.abs(left.z - 21.75) < 1e-9);
  assert.ok(Math.abs(left.heading - Math.PI / 2) < 1e-9);
  assert.ok(right.x < -20 && Math.abs(right.z - 18.25) < 1e-9);
  assert.ok(Math.abs(right.heading + Math.PI / 2) < 1e-9);
});

test('simulated lights cover high, low, alternating, hazard and final reset while parked', () => {
  const item = c3('lights'), modes = new Set(item.poses.map(p => p.lightMode));
  for (const mode of ['low', 'high', 'flash', 'hazard', 'off']) assert.ok(modes.has(mode));
  assert.equal(item.poses.at(-1).lightMode, 'off');
  assert.ok(item.poses.every(p => p.speed === 0 && p.brake));
  assert.ok(c3('night').poses.some(p => p.speed > 0));
});

test('crosswalk yields before the crossing and overtaking returns only after passing the lead vehicle', () => {
  const cross = c3('crosswalk');
  for (const t of [9, 11, 14]) {
    const p = sampleChapterPose(cross, t); assert.equal(p.speed, 0);
    assert.ok(Math.max(...corners(p).map(c => c.z)) < cross.scene.stopLineZ - .1);
    assert.ok(Math.max(...corners(p).map(c => c.z)) < cross.scene.crossingZ - 3.3 / 2);
  }
  const overtake = c3('overtake');
  assert.ok(overtake.poses.filter(p => p.t >= 11 && p.t <= 23).every(p => Math.abs(p.x + 1.75) < 1e-9));
  const back = sampleChapterPose(overtake, 29), leadZ = overtake.scene.leadVehicle.z + overtake.scene.leadVehicle.speed * 29;
  assert.ok(back.z - CAR.rearOverhang > leadZ + CAR.length - CAR.rearOverhang + 10);
  assert.equal(back.x, -5.25);
});
