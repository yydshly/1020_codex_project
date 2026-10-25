import test from 'node:test';
import assert from 'node:assert/strict';
import { EXAM_COURSES, sampleChapterPose } from './exam-courses.js';
import { createCourseDrivingSession, stepCourseDriving, courseDrivingPose } from './course-driving.js';
import { CAR, corners } from './vehicle.js';
import { evaluateCourseSafety } from './course-safety.js';
import { getCoursePracticePlan, createCoursePractice, stepCoursePractice, recordCourseObservation,
  finishCoursePractice, retryCoursePractice, resumeCoursePractice, getCoursePracticeComparison, getCoursePracticeLanes, getCoursePracticeSpeedZone } from './course-practice.js';

const chapters = Object.values(EXAM_COURSES).flatMap(course => course.chapters);
const chapter = id => chapters.find(item => item.id === id);
function start(id) {
  const c = chapter(id), p = { ...sampleChapterPose(c, 0), speed: 0, gear: 'N' };
  const driving = createCourseDrivingSession(c, p);
  return { c, driving, session: createCoursePractice(c, { driving, initialPose: courseDrivingPose(driving) }) };
}
function look(session, ...views) { return views.reduce((state, view) => recordCourseObservation(state, view), session); }
function followAuthored(id, observeAt = () => []) {
  const fixture = start(id); let session = fixture.session;
  for (let i = 0; i <= fixture.c.duration * 10 && session.phase !== 'review'; i++) {
    const t = Math.min(fixture.c.duration, i / 10), pose = sampleChapterPose(fixture.c, t);
    session = look(session, ...observeAt(t));
    session = stepCoursePractice(session, { pose, dt: .1 });
  }
  return session;
}
function driveZone(id, speedAt, initial = null) {
  const fixture = start(id); let driving = initial ? { ...fixture.driving, ...initial } : fixture.driving;
  let session = initial ? createCoursePractice(fixture.c, { driving, initialPose: courseDrivingPose(driving) }) : fixture.session;
  session = look(session, 'forward', 'front-left', 'front-right', 'right');
  for (let index = 0; index < 1200 && session.phase !== 'review'; index++) {
    const zone = session.speedZone;
    if (zone && driving.z + CAR.length - CAR.rearOverhang >= zone.start - 15 && driving.z - CAR.rearOverhang <= zone.end)
      session = look(session, 'front-left', 'front-right', 'forward');
    const speed = speedAt(driving, index), previousSpeed = driving.speed;
    driving = { ...driving, z: driving.z + speed * .1, speed, elapsed: driving.elapsed + .1, brake: speed < previousSpeed,
      acceleration: (speed - previousSpeed) / .1 };
    session = stepCoursePractice(session, { driving, pose: courseDrivingPose(driving), dt: .1, input: { brake: driving.brake } });
  }
  return { session, driving };
}

test('a mirror-only contact keeps its own part and position through review and error-before retry', () => {
  const { session, driving } = start('straight');
  const point = { x: -2.88, y: 1.05, z: -26.1 };
  const reviewed = stepCoursePractice(session, { driving, pose: courseDrivingPose(driving), dt: 0,
    events: [{ id: 'mirror:right-mirror-stalk:pole', type: 'mirror-contact', severity: 'danger', blocking: true,
      title: '右后视镜支架擦碰风险', detail: '支架与标杆相交，车身和轮胎没有压线。',
      partId: 'right-mirror-stalk', partLabel: '右后视镜支架', side: 'right', actorId: 'pole', position: point }] });
  assert.equal(reviewed.phase, 'review'); assert.equal(reviewed.review.outcome, 'error');
  const error = reviewed.review.errors[0];
  assert.equal(error.type, 'mirror-contact'); assert.equal(error.partId, 'right-mirror-stalk');
  assert.equal(error.side, 'right'); assert.equal(error.actorId, 'pole'); assert.deepEqual(error.position, point);
  assert.strictEqual(resumeCoursePractice(reviewed), reviewed, 'a physical contact cannot be dismissed as merely missing a task');
  const retry = retryCoursePractice(reviewed, { gaze: 'right-back' });
  assert.ok(retry); assert.equal(retry.gaze, 'right-back'); assert.equal(retry.session.errors.length, 0);
  assert.equal(retry.driving.stopReason, null);
});

test('every existing chapter has specific feasible tasks and honest basic-control scope', () => {
  assert.equal(chapters.length, 22);
  for (const c of chapters) {
    const plan = getCoursePracticePlan(c);
    assert.ok(plan.objective && plan.scope && plan.completionHint);
    assert.ok(plan.checks.length >= 2, c.id);
    assert.equal(new Set(plan.checks.map(item => item.id)).size, plan.checks.length, c.id);
    assert.ok(plan.limitations.some(text => text.includes('不生成实考分数')));
    for (const check of plan.checks) if (check.gaze) assert.ok(['forward', 'front-left', 'front-right', 'left', 'right', 'rear', 'left-back', 'right-back'].includes(check.gaze));
  }
  assert.match(getCoursePracticePlan(chapter('gears')).scope, /自动配合/);
  assert.ok(getCoursePracticePlan(chapter('pull-over')).limitations.some(text => text.includes('熄火')));
});

test('waiting through the chapter duration never awards travel or a completed driving lesson', () => {
  let { session, driving } = start('straight');
  const before = structuredClone(session);
  for (let i = 0; i < 1400; i++) session = stepCoursePractice(session, { driving, pose: courseDrivingPose(driving), dt: .1 });
  assert.equal(session.progress.distance, 0); assert.equal(session.stats.travelled, 0);
  assert.equal(session.checks.find(c => c.id === 'route').done, false);
  assert.notEqual(session.phase, 'review');
  assert.equal(before.phase, 'ready'); assert.equal(before.elapsed, 0);
});

test('real keyboard physics can finish the straight basic task by distance, observation and stable control', () => {
  let { session, driving } = start('straight');
  session = look(session, 'forward', 'rear');
  for (let i = 0; i < 1800 && session.phase !== 'review'; i++) {
    driving = stepCourseDriving(driving, { forward: true }, 1 / 60);
    session = stepCoursePractice(session, { driving, pose: courseDrivingPose(driving), input: { forward: true }, dt: 1 / 60 });
  }
  assert.equal(session.phase, 'review'); assert.equal(session.review.outcome, 'complete');
  assert.ok(session.review.metrics.travelled > 110);
  assert.ok(session.review.metrics.maxDeviation < 1e-9);
  assert.ok(session.history.length < 95, 'rollback snapshots remain a bounded recent buffer');
  assert.match(session.review.title, /基础练习/); assert.doesNotMatch(session.review.title, /考试通过/);
});

test('an inherited camera direction does not count as an explicit observation action', () => {
  let { session, driving } = start('straight');
  session = stepCoursePractice(session, { driving, gaze: 'rear', dt: .2 });
  assert.equal(session.checks.find(c => c.gaze === 'rear').done, false);
  const observed = recordCourseObservation(session, 'rear');
  assert.equal(observed.checks.find(c => c.gaze === 'rear').done, true);
  assert.equal(session.observationLog.length, 0);
  const review = finishCoursePractice(observed);
  assert.equal(review.review.outcome, 'incomplete');
  assert.ok(review.review.checks.some(check => !check.done));
});

test('stationary light tasks advance only on the chosen state, work while paused, and retain a wrong answer in review', () => {
  let { session, driving } = start('lights');
  const drive = mode => { driving = { ...driving, lightMode: mode }; session = stepCoursePractice(session, { driving, pose: courseDrivingPose(driving), dt: 0 }); };
  drive('high');
  assert.equal(session.lightIndex, 0); assert.equal(session.errors.length, 1);
  drive('low'); drive('high'); drive('low'); drive('flash'); drive('low'); drive('hazard'); drive('off');
  assert.equal(session.phase, 'review'); assert.ok(session.review.checks.every(c => c.done));
  assert.equal(session.review.outcome, 'error'); assert.match(session.review.title, /目标已完成/);
  assert.match(session.review.errors[0].title, /灯光选择/);
  assert.equal(session.elapsed, 0, 'no scripted clock or playback delay is needed to answer');
});

test('a correctly answered complete light sequence finishes without a fake examination score', () => {
  let { session, driving } = start('lights');
  for (const mode of ['low', 'high', 'low', 'flash', 'low', 'hazard', 'off']) {
    driving = { ...driving, lightMode: mode };
    session = stepCoursePractice(session, { driving, pose: courseDrivingPose(driving), dt: 0 });
  }
  assert.equal(session.review.outcome, 'complete'); assert.equal(session.review.errors.length, 0);
  assert.equal(Object.hasOwn(session.review, 'score'), false);
});

test('a risk review restores the full pre-error physics snapshot and drops later observations and actions', () => {
  let { session, driving } = start('straight');
  session = look(session, 'forward');
  for (let i = 1; i <= 40; i++) {
    driving = { ...driving, x: -1.75, z: -25 + i * .2, elapsed: i * .1, speed: 2, remainder: .003, shiftRemaining: .12 };
    session = stepCoursePractice(session, { driving, pose: courseDrivingPose(driving), dt: .1 });
    if (i === 32) session = look(session, 'right-back');
  }
  const prior = structuredClone(session);
  session = stepCoursePractice(session, { driving, pose: courseDrivingPose(driving), dt: .1,
    events: [{ id: 'edge:left', type: 'road-edge', severity: 'danger', title: '驶出道路', detail: '左侧车轮越过路缘' }] });
  assert.equal(session.phase, 'review'); assert.equal(session.review.outcome, 'error');
  assert.equal(prior.errors.length, 0, 'new error must not mutate the previous session');
  const expected = session.retrySnapshot;
  assert.ok(expected.elapsed <= session.elapsed - 2.5 + 1e-9);
  const retry = retryCoursePractice(session, { gaze: 'right-back' });
  assert.deepEqual(retry.driving, { ...expected.driving, stopReason: null });
  assert.equal(retry.driving.remainder, .003); assert.equal(retry.driving.shiftRemaining, .12);
  assert.equal(retry.session.phase, 'ready'); assert.equal(retry.session.review, null); assert.equal(retry.session.errors.length, 0);
  assert.ok(retry.session.observations.forward); assert.equal(retry.session.observations['right-back'], undefined);
  assert.equal(retry.gaze, 'right-back', 'current viewing preference stays caller-owned');
  assert.ok(retry.session.trajectory.at(-1).elapsed <= expected.elapsed);
  retry.driving.bounds.left = -999; assert.notEqual(session.retrySnapshot.driving.bounds.left, -999);
});

test('a proximity warning remains feedback rather than silently ending an attempt', () => {
  let { session, driving } = start('straight');
  session = stepCoursePractice(session, { driving, dt: .1, events: [{ id: 'near:1', type: 'collision-proximity', severity: 'warning', title: '距离较近' }] });
  assert.notEqual(session.phase, 'review'); assert.equal(session.errors.length, 1);
  assert.equal(session.retrySnapshot, null, 'a benign proximity warning cannot pin a later collision retry to the beginning');
});

test('same-frame edge warnings cannot replace a blocking collision or road departure in the review summary', () => {
  const collision = { id: 'collision:bus', type: 'collision', severity: 'danger', title: '碰撞公交车', detail: '车身与公交车发生接触，先停住确认空间。' };
  const edge = { id: 'road:left', type: 'road-edge', severity: 'danger', title: '驶出道路', detail: '左侧车轮已经越出道路边缘。' };
  const warning = { id: 'line:left', type: 'edge-line', severity: 'warning', title: '接近边线', detail: '注意边线距离。' };
  for (const [events, expected] of [[[collision, edge, warning], collision.detail], [[edge, warning], edge.detail]]) {
    const { session, driving } = start('straight');
    const reviewed = stepCoursePractice(session, { driving, pose: courseDrivingPose(driving), dt: .1, events });
    assert.equal(reviewed.phase, 'review'); assert.equal(reviewed.review.outcome, 'error');
    assert.equal(reviewed.review.summary, expected);
    assert.equal(reviewed.review.errors.length, events.length);
    assert.equal(reviewed.review.errors.at(-1).detail, warning.detail, 'the warning remains in the full record');
  }
});

test('later observation clicks do not erase an earlier unobserved start', () => {
  let { session, driving } = start('start');
  driving = stepCourseDriving(driving, { forward: true, leftSignal: true, parkingBrake: false }, .2);
  session = stepCoursePractice(session, { driving, pose: courseDrivingPose(driving), dt: .2 });
  session = look(session, 'forward', 'left', 'left-back');
  const review = finishCoursePractice(session).review;
  assert.ok(review.errors.some(error => error.id === 'start:observation'));
  assert.equal(review.outcome, 'error');
  assert.equal(review.checks.find(c => c.id === 'start').done, false);
});

test('countersteering within one lane change does not request the opposite indicator', () => {
  const session = followAuthored('lane-change', t => t < .2 ? ['forward', 'left', 'left-back'] : t >= 12 && t < 12.2 ? ['right', 'right-back', 'forward'] : []);
  assert.equal(session.flags.leftChange, true); assert.equal(session.flags.rightChange, true);
  assert.equal(session.flags.leftSignal, true); assert.equal(session.flags.rightSignal, true);
  assert.equal(session.errors.filter(e => /turn-signal/.test(e.id)).length, 0, JSON.stringify(session.errors));
});

test('post-parking shoulder checks are not awarded for views visited before parking', () => {
  let { session } = start('pull-over');
  session = look(session, 'left', 'left-back', 'right', 'right-back', 'forward');
  for (let i = 0; i <= 155; i++) {
    const pose = sampleChapterPose(chapter('pull-over'), i / 10);
    session = stepCoursePractice(session, { pose, dt: .1 });
  }
  assert.equal(session.flags.pullStopped, true);
  assert.equal(session.checks.find(c => c.gaze === 'left-back').done, false);
  session = look(session, 'left', 'left-back');
  assert.equal(session.phase, 'review');
  assert.equal(session.review.checks.find(c => c.gaze === 'left-back').done, true);
});

test('crosswalk restart requires fresh observations after the actual stop', () => {
  let { session } = start('crosswalk');
  session = look(session, 'forward', 'front-left', 'front-right');
  for (let i = 0; i <= 120; i++) session = stepCoursePractice(session, { pose: sampleChapterPose(chapter('crosswalk'), i / 10), dt: .1 });
  assert.equal(session.flags.yieldStopped, true);
  assert.ok(session.checks.filter(c => c.id.startsWith('after-yield:')).every(c => !c.done));
  session = look(session, 'left', 'right', 'forward');
  assert.ok(session.checks.filter(c => c.id.startsWith('after-yield:') && c.gaze !== 'forward').every(c => !c.done), 'external mirrors cannot replace the two front conflict views');
  session = look(session, 'front-left', 'front-right', 'forward');
  assert.ok(session.checks.filter(c => c.id.startsWith('after-yield:')).every(c => c.done));
  for (let i = 121; i <= 200; i++) session = stepCoursePractice(session, { pose: sampleChapterPose(chapter('crosswalk'), i / 10), dt: .1 });
  assert.equal(session.flags.restarted, true);
  assert.equal(session.flags.yieldRestartObserved, true);
});

test('observing after driving past the crossing cannot retroactively complete its unobserved restart, and retry restores the stop', () => {
  const c = chapter('crosswalk'); let { session, driving } = start('crosswalk');
  session = look(session, 'forward', 'front-left', 'front-right');
  for (let i = 0; i <= 200; i++) {
    const t = i / 10, pose = sampleChapterPose(c, t); driving = { ...driving, ...pose, elapsed: t };
    session = stepCoursePractice(session, { driving, pose, dt: .1 });
  }
  assert.equal(session.flags.yieldStopped, true); assert.equal(session.flags.yieldRestartAttempted, true);
  assert.equal(session.flags.yieldRestartObserved, false); assert.equal(session.flags.restarted, false);
  assert.ok(session.lastPose.z > c.scene.stopLineZ + 2);
  assert.ok(session.errors.some(error => error.id === 'crosswalk:restart-observation'));
  assert.match(session.feedback.detail, /起步后补看不能追认/);
  session = look(session, 'front-left', 'front-right', 'forward');
  assert.ok(session.checks.filter(check => check.id.startsWith('after-yield:')).every(check => !check.done));
  session = stepCoursePractice(session, { driving, pose: session.lastPose, dt: .1 });
  assert.equal(session.flags.restarted, false);
  const reviewed = finishCoursePractice(session);
  assert.equal(reviewed.review.outcome, 'error'); assert.equal(resumeCoursePractice(reviewed), reviewed);
  const retry = retryCoursePractice(reviewed); assert.ok(retry);
  session = retry.session; driving = retry.driving;
  assert.equal(session.flags.yieldStopped, true); assert.equal(session.flags.yieldRestartAttempted, false);
  assert.ok(Math.abs(driving.speed) < .02); assert.ok(driving.z < c.scene.stopLineZ);
  assert.equal(session.errors.length, 0);
  session = look(session, 'front-left', 'front-right', 'forward');
  const restartAt = driving.elapsed;
  for (let t = restartAt + .1; t <= c.duration + 1e-7 && session.phase !== 'review'; t += .1) {
    const pose = sampleChapterPose(c, Math.min(t, c.duration)); driving = { ...driving, ...pose, elapsed: t };
    session = stepCoursePractice(session, { driving, pose, dt: .1 });
  }
  assert.equal(session.flags.yieldRestartObserved, true); assert.equal(session.flags.restarted, true);
  assert.equal(session.review.outcome, 'complete'); assert.equal(session.errors.length, 0);
});

test('even the first tiny forward creep after yielding locks observation timing rather than waiting for normal driving speed', () => {
  const c = chapter('crosswalk'); let { session } = start('crosswalk');
  for (let i = 0; i <= 120; i++) session = stepCoursePractice(session, { pose: sampleChapterPose(c, i / 10), dt: .1 });
  assert.equal(session.flags.yieldStopped, true);
  const creep = { ...session.lastPose, z: session.lastPose.z + .0001, speed: .005 };
  session = stepCoursePractice(session, { pose: creep, dt: .02 });
  assert.equal(session.flags.yieldRestartAttempted, true); assert.equal(session.flags.yieldRestartObserved, false);
  assert.ok(session.errors.some(error => error.id === 'crosswalk:restart-observation'));
  session = look(session, 'front-left', 'front-right', 'forward');
  assert.ok(session.checks.filter(check => check.id.startsWith('after-yield:')).every(check => !check.done));
});

test('steering feedback compares operation positions, not different driving speeds or elapsed seconds', () => {
  let { session, driving } = start('left-turn');
  session = look(session, 'left', 'left-back', 'forward');
  for (let i = 0; i < 15; i++) {
    driving = stepCourseDriving(driving, { left: true, leftSignal: true }, 1 / 30);
    session = stepCoursePractice(session, { driving, pose: courseDrivingPose(driving), dt: 1 / 30 });
  }
  const result = finishCoursePractice(session).review;
  const first = result.metrics.steering.find(item => item.kind === 'turn');
  assert.ok(first.deltaMeters < -20); assert.match(first.judgment, /早于本模型示范位置/);
  assert.ok(result.limitations.some(text => text.includes('不能把距离差当作实车型号')));
});

test('prepare is an observation-only task, and comparison data keeps real world positions', () => {
  let { session } = start('prepare');
  session = look(session, 'forward', 'left', 'right', 'rear', 'left-back', 'right-back');
  assert.equal(session.review.outcome, 'complete');
  assert.match(session.plan.scope, /观察/); assert.ok(session.review.limitations.some(text => text.includes('安全带')));
  const comparison = getCoursePracticeComparison(session);
  assert.deepEqual(comparison.actual[0], { x: -1.75, z: -22 });
  assert.ok(comparison.reference.every(p => Math.abs(p.x + 1.75) < 1e-9 && Math.abs(p.z + 22) < 1e-9));
  assert.match(comparison.caption, /不是按相同秒数/);
});

test('all 22 basic lessons are reachable with valid observations and spatially correct operations', () => {
  for (const c of chapters) {
    let { session, driving } = start(c.id);
    if (c.id === 'prepare') session = look(session, 'forward', 'left', 'right', 'rear', 'left-back', 'right-back');
    else if (c.id === 'lights') {
      for (const lightMode of ['low', 'high', 'low', 'flash', 'low', 'hazard', 'off']) {
        driving = { ...driving, lightMode };
        session = stepCoursePractice(session, { driving, pose: courseDrivingPose(driving), dt: 0 });
      }
    } else {
      // The reverse-parking source has single-frame stops. Include the exact
      // parked cue positions as well as regular 10 Hz spatial samples.
      let times = Array.from({ length: Math.ceil(c.duration * 10) + 1 }, (_, i) => Math.min(c.duration, i / 10));
      if (c.id === 'reverse-parking') times.push(...c.cues.filter(cue => cue.title.includes('库内停稳')).map(cue => cue.t));
      times = [...new Set(times)].sort((a, b) => a - b);
      let previous = 0;
      for (const t of times) {
        if (session.phase === 'review') break;
        const pose = sampleChapterPose(c, t);
        for (const gaze of ['forward', 'front-left', 'front-right', 'left', 'right', 'rear', 'left-back', 'right-back']) session = recordCourseObservation(session, gaze, pose);
        driving = { ...driving, ...pose, elapsed: t };
        session = stepCoursePractice(session, { driving, pose, input: { brake: pose.acceleration < -.05 || pose.brake }, dt: t - previous });
        previous = t;
      }
    }
    assert.equal(session.phase, 'review', `${c.id}: ${session.checks.filter(check => !check.done).map(check => check.id)}`);
    assert.equal(session.review.outcome, 'complete', `${c.id}: ${session.errors.map(error => error.id)}`);
    assert.equal(session.errors.length, 0, c.id);
  }
});

test('gentle overtaking is checked by actual lateral movement even below the old steering threshold', () => {
  let { session } = start('overtake'), maximumSteer = 0;
  for (let i = 0; i <= 320 && session.phase !== 'review'; i++) {
    const pose = { ...sampleChapterPose(chapter('overtake'), i / 10), leftSignal: false, rightSignal: false };
    maximumSteer = Math.max(maximumSteer, Math.abs(pose.steer));
    session = stepCoursePractice(session, { pose, dt: .1 });
  }
  assert.ok(maximumSteer < .1, 'a valid overtaking path uses genuinely small front-wheel angles');
  for (const side of ['left', 'right']) {
    assert.ok(session.errors.some(error => error.id === `turn-signal:${side}`), side);
    assert.ok(session.errors.some(error => error.id === `turn-observation:${side}`), side);
  }
  assert.equal(session.review.outcome, 'error');
});

test('stationary wheel presets can be followed by observation before a correctly signaled start', () => {
  let { session, driving } = start('start');
  driving = stepCourseDriving(driving, { left: true, leftSignal: true }, .2);
  session = stepCoursePractice(session, { driving, pose: courseDrivingPose(driving), dt: .2 });
  assert.equal(session.errors.length, 0);
  assert.equal(session.flags.leftManeuverStarted, false);
  session = look(session, 'left', 'left-back', 'forward');
  driving = stepCourseDriving(driving, { forward: true, leftSignal: true, parkingBrake: false }, .2);
  session = stepCoursePractice(session, { driving, pose: courseDrivingPose(driving), dt: .2 });
  assert.equal(session.flags.startObserved, true);
  assert.equal(session.errors.length, 0);
});

test('multiple corrected retries do not retain the old moving steering violation in statistics', () => {
  let { session, driving } = start('straight');
  for (let i = 0; i < 35; i++) {
    driving = { ...driving, steer: .5 };
    session = stepCoursePractice(session, { driving, pose: courseDrivingPose(driving), dt: .1 });
  }
  assert.equal(session.stats.maxSteer, 0);
  for (let attempt = 0; attempt < 2; attempt++) {
    driving = { ...driving, z: driving.z + .2, speed: 2, steer: .5 };
    session = stepCoursePractice(session, { driving, pose: courseDrivingPose(driving), dt: .1 });
    assert.ok(session.errors.some(error => error.id === 'straight:large-steering'));
    const retry = retryCoursePractice(finishCoursePractice(session));
    session = retry.session; driving = retry.driving;
    assert.equal(session.stats.maxSteer, 0);
    assert.equal(session.errors.length, 0);
    assert.equal(session.flags.started, false);
  }
  driving = { ...driving, speed: 0, steer: 0 };
  session = stepCoursePractice(session, { driving, pose: courseDrivingPose(driving), dt: 0 });
  session = look(session, 'forward', 'rear');
  for (let i = 0; i < 1800 && session.phase !== 'review'; i++) {
    driving = stepCourseDriving(driving, { forward: true }, 1 / 60);
    session = stepCoursePractice(session, { driving, pose: courseDrivingPose(driving), dt: 1 / 60 });
  }
  assert.equal(session.review.outcome, 'complete');
  assert.equal(session.review.errors.length, 0);
  assert.equal(session.attempt, 3);
});

test('paused light feedback and repeated retries preserve the answered prefix without preserving the mistake', () => {
  let { session, driving } = start('lights');
  const choose = lightMode => {
    driving = { ...driving, lightMode };
    session = stepCoursePractice(session, { driving, pose: courseDrivingPose(driving), dt: 0 });
  };
  choose('low'); choose('high');
  assert.equal(session.feedback.type, 'success');
  for (const wrong of ['fog', 'parking']) {
    choose(wrong);
    assert.equal(session.feedback.type, 'error');
    assert.match(session.feedback.title, /灯光选择/);
    session = finishCoursePractice(session);
    assert.equal(session.review.outcome, 'error');
    assert.match(session.review.title, /操作需要纠正/);
    assert.match(session.review.summary, /灯光选择.*还需要/);
    const retry = retryCoursePractice(session, { gaze: 'rear' });
    session = retry.session; driving = retry.driving;
    assert.equal(session.lightIndex, 2);
    assert.equal(session.checks.filter(check => check.done).length, 2);
    assert.equal(driving.lightMode, 'high');
    assert.equal(session.errors.length, 0);
    assert.equal(session.actionLog.length, 0);
    assert.equal(session.elapsed, 0);
    assert.equal(retry.gaze, 'rear');
  }
  for (const correct of ['low', 'flash', 'low', 'hazard', 'off']) choose(correct);
  assert.equal(session.review.outcome, 'complete');
  assert.equal(session.review.errors.length, 0);
  assert.equal(session.attempt, 3);
});

test('choosing the expected light while rolling explains the stationary requirement rather than a wrong lamp', () => {
  let { session, driving } = start('lights');
  driving = { ...driving, speed: 1, lightMode: 'low' };
  session = stepCoursePractice(session, { driving, pose: courseDrivingPose(driving), dt: .1 });
  assert.equal(session.lightIndex, 0);
  assert.deepEqual(session.errors.map(error => error.id), ['lights:moving']);
  assert.match(session.feedback.title, /未停稳/);
});

test('preparation observations while moving do not fill a stationary preparation checklist', () => {
  const { session } = start('prepare');
  const next = recordCourseObservation(session, 'rear', { ...session.lastPose, speed: .5 });
  assert.equal(next.checks.find(check => check.gaze === 'rear').done, false);
  assert.equal(next.observationLog.length, 0);
  assert.match(next.feedback.title, /先停稳/);
});

test('parking observations made before the stop cannot count as after it at the same paused timestamp', () => {
  let { session } = start('side-parking');
  session = look(session, 'left', 'left-back');
  const approach = sampleChapterPose(chapter('side-parking'), 18);
  session = stepCoursePractice(session, { pose: approach, dt: 0 });
  const stop = sampleChapterPose(chapter('side-parking'), 20);
  session = stepCoursePractice(session, { pose: stop, dt: 0 });
  assert.equal(session.flags.sideStopped, true);
  assert.equal(session.flags.sideStopAt, 0);
  assert.ok(session.checks.filter(check => ['left', 'left-back'].includes(check.gaze)).every(check => !check.done));
  session = look(session, 'left', 'left-back');
  assert.ok(session.checks.filter(check => ['left', 'left-back'].includes(check.gaze)).every(check => check.done));
});

test('only an incomplete voluntary review can continue in place and it preserves progress and warning history', () => {
  let { session, driving } = start('straight');
  session = look(session, 'forward', 'rear');
  driving = { ...driving, z: driving.z + 2, speed: 2 };
  session = stepCoursePractice(session, { driving, dt: .2, events: [{ id: 'near:1', type: 'collision-proximity', severity: 'warning', title: '留出空间' }] });
  const reviewed = finishCoursePractice(session), resumed = resumeCoursePractice(reviewed);
  assert.equal(reviewed.review.outcome, 'incomplete');
  assert.equal(resumed.phase, 'practicing'); assert.equal(resumed.review, null);
  assert.deepEqual(resumed.progress, session.progress);
  assert.deepEqual(resumed.lastDriving, session.lastDriving);
  assert.deepEqual(resumed.observationLog, session.observationLog);
  assert.deepEqual(resumed.errors, session.errors);
  assert.equal(resumed.history, session.history);
  assert.equal(resumed.currentTask.id, 'route');
  assert.equal(resumeCoursePractice(resumed), resumed);
  const risk = stepCoursePractice(session, { driving, dt: .1, events: [{ id: 'hit', type: 'collision', severity: 'danger', title: '碰撞' }] });
  assert.equal(resumeCoursePractice(risk), risk);
  const empty = finishCoursePractice(start('straight').session);
  assert.equal(resumeCoursePractice(empty).phase, 'practicing');
});

test('continuing an incomplete endpoint review does not immediately reopen it, but completion and new risks still review', () => {
  const reviewed = followAuthored('straight');
  assert.equal(reviewed.review.outcome, 'incomplete');
  assert.equal(reviewed.endReviewAcknowledged, true);
  let resumed = resumeCoursePractice(reviewed);
  for (let i = 0; i < 5; i++) resumed = stepCoursePractice(resumed, { pose: resumed.lastPose, dt: .016 });
  assert.equal(resumed.phase, 'practicing');
  assert.equal(resumed.review, null);
  const completed = look(resumed, 'forward', 'rear');
  assert.equal(completed.phase, 'review');
  assert.equal(completed.review.outcome, 'complete');
  const hit = stepCoursePractice(resumed, { pose: resumed.lastPose, dt: .016, events: [{ id: 'hit:end', type: 'collision', severity: 'danger', title: '碰撞' }] });
  assert.equal(hit.phase, 'review');
  assert.equal(hit.review.outcome, 'error');
  const restart = retryCoursePractice(finishCoursePractice(start('straight').session));
  assert.equal(restart.session.endReviewAcknowledged, false, 'a new attempt gets a fresh endpoint review');
  let manualAtEnd = { ...resumed, endReviewAcknowledged: false };
  manualAtEnd = resumeCoursePractice(finishCoursePractice(manualAtEnd));
  manualAtEnd = stepCoursePractice(manualAtEnd, { pose: manualAtEnd.lastPose, dt: .016 });
  assert.equal(manualAtEnd.phase, 'practicing', 'manual review at the endpoint must also be continuable');
});

test('a takeover near the endpoint can complete its actual remaining route without an impossible three-meter minimum', () => {
  const c = chapter('straight'), pose = { ...sampleChapterPose(c, c.duration - .3), speed: 0 };
  let driving = createCourseDrivingSession(c, pose), session = createCoursePractice(c, { driving, initialPose: courseDrivingPose(driving) });
  session = look(session, 'forward', 'rear');
  for (let i = 1; i <= 30 && session.phase !== 'review'; i++) {
    const current = sampleChapterPose(c, c.duration - .3 + i / 100);
    driving = { ...driving, ...current };
    session = stepCoursePractice(session, { driving, pose: current, dt: .01 });
  }
  assert.equal(session.review.outcome, 'complete');
  assert.ok(session.stats.travelled < 3 && session.stats.travelled > 1);
  assert.ok(session.plan.limitations.some(text => text.includes('中途接手')));
  const endpoint = sampleChapterPose(c, c.duration);
  let unmoved = createCoursePractice(c, { initialPose: endpoint });
  unmoved = look(unmoved, 'forward', 'rear');
  unmoved = stepCoursePractice(unmoved, { pose: endpoint, dt: .1 });
  assert.equal(finishCoursePractice(unmoved).review.outcome, 'incomplete');
});

test('a takeover never awards already completed turning, lane change, parking or acceleration from an inherited pose', () => {
  const cases = [
    ['left-turn', 30, ['turn-left']], ['right-turn', 30, ['turn-right']], ['uturn', 30, ['turn-left']],
    ['lane-change', 14, ['left-change']], ['overtake', 15, ['left-change']],
    ['side-parking', 20, ['side-stop']], ['hill-start', 23, ['hill-stop']], ['crosswalk', 12, ['yield-stop']],
    ['gears', 17, ['accelerate']],
  ];
  for (const [id, t, checkIds] of cases) {
    const c = chapter(id), pose = sampleChapterPose(c, t), driving = createCourseDrivingSession(c, pose);
    let session = createCoursePractice(c, { driving, initialPose: courseDrivingPose(driving) });
    for (let i = 0; i < 10; i++) session = stepCoursePractice(session, { driving, pose, dt: .1 });
    for (const checkId of checkIds) assert.equal(session.checks.find(check => check.id === checkId).done, false, `${id}:${checkId}`);
    assert.equal(session.flags.started, false, id);
  }
  const c = chapter('reverse-parking'), p = sampleChapterPose(c, c.cues.find(cue => cue.title === '右侧库内停稳').t);
  let session = createCoursePractice(c, { initialPose: p });
  session = stepCoursePractice(session, { pose: p, dt: .2 });
  assert.equal(session.flags.bayStops, 0);
});

test('a 2.55m partial lateral movement cannot claim a whole-car lane change or safe return', () => {
  for (const id of ['lane-change', 'overtake']) {
    const c = chapter(id), origin = sampleChapterPose(c, 0), factor = 2.55 / 3.5;
    let { session } = start(id), maximumX = origin.x;
    const lanes = getCoursePracticeLanes(c);
    for (let index = 0; index <= c.duration * 20 && session.phase !== 'review'; index++) {
      const t = index / 20, p = sampleChapterPose(c, t), a = sampleChapterPose(c, Math.max(0, t - .001)), b = sampleChapterPose(c, Math.min(c.duration, t + .001));
      const pose = { ...p, x: origin.x + (p.x - origin.x) * factor, heading: Math.atan2((b.x - a.x) * factor, b.z - a.z) };
      maximumX = Math.max(maximumX, pose.x);
      session = look(session, 'forward', 'left', 'left-back', 'right', 'right-back');
      session = stepCoursePractice(session, { pose, dt: .05 });
    }
    assert.ok(Math.abs(maximumX + 2.7) < 1e-6);
    assert.ok(maximumX - CAR.width / 2 < lanes.target.left, 'the body still straddles the registered divider');
    assert.equal(session.flags.leftLaneReached, false); assert.equal(session.flags.leftChange, false); assert.equal(session.flags.rightChange, false);
    assert.equal(session.checks.find(check => check.id === 'left-change').done, false);
    assert.notEqual(session.review?.outcome, 'complete', id);
  }
});

test('whole-car lane entry also requires the correct single indicator and mirror/shoulder observation before the manoeuvre', () => {
  for (const variant of ['front-only', 'hazards']) {
    let { session } = start('lane-change');
    const c = chapter('lane-change');
    for (let i = 0; i <= c.duration * 10 && session.phase !== 'review'; i++) {
      const pose = sampleChapterPose(c, i / 10);
      session = look(session, ...(variant === 'front-only' ? ['forward', 'front-left', 'front-right'] : ['forward', 'left', 'left-back', 'right', 'right-back']));
      session = stepCoursePractice(session, { pose: variant === 'hazards' ? { ...pose, leftSignal: true, rightSignal: true } : pose, dt: .1 });
    }
    assert.equal(session.flags.leftLaneReached, true, 'the physical path really entered the target lane');
    assert.equal(session.flags.leftChange, false); assert.equal(session.review.outcome, 'error');
    assert.ok(session.errors.some(error => error.id === (variant === 'front-only' ? 'turn-observation:left' : 'turn-signal:left')));
  }
});

test('front-conflict tasks cannot be awarded by external mirrors, while rear manoeuvres still require actual mirrors', () => {
  for (const id of ['intersection', 'school', 'bus']) {
    let { session } = start(id);
    if (id !== 'intersection') session = stepCoursePractice(session, { pose: { ...session.lastPose, z: -10 + (id === 'bus' ? 12 : 0), speed: 0 }, dt: 0 });
    session = look(session, 'forward', 'left', 'right');
    assert.ok(session.checks.filter(check => ['front-left', 'front-right'].includes(check.gaze)).every(check => !check.done));
    session = look(session, 'front-left', 'front-right');
    assert.ok(session.checks.filter(check => ['front-left', 'front-right'].includes(check.gaze)).every(check => check.done));
    assert.ok(getCoursePracticePlan(chapter(id)).checks.every(check => !['left', 'right'].includes(check.gaze)));
  }
  let { session } = start('lane-change');
  session = look(session, 'front-left', 'front-right');
  assert.ok(session.checks.filter(check => ['left', 'right'].includes(check.gaze)).every(check => !check.done));
});

test('one slow sample outside a zone cannot light its goal, and 28.8km/h inside leaves explicit review and retry feedback', () => {
  for (const id of ['school', 'bus', 'meeting', 'night', 'intersection']) {
    const zone = getCoursePracticeSpeedZone(chapter(id));
    const { session } = driveZone(id, (driving, index) => index === 0 ? 1 : 8);
    assert.equal(session.speedZone.complete, false, id); assert.equal(session.flags.zoneSlow, false, id);
    assert.equal(session.checks.find(check => check.id === 'slow-zone').done, false);
    const error = session.errors.find(error => error.id === `speed-zone:${id}`);
    assert.ok(error, id); assert.match(error.detail, new RegExp(`${zone.limitKmh} km/h`)); assert.match(error.detail, /不是通用实考限速/);
    assert.equal(finishCoursePractice(session).review.outcome, 'error');
    const retry = retryCoursePractice(finishCoursePractice(session));
    assert.ok(retry); assert.equal(retry.session.errors.length, 0); assert.equal(retry.session.speedZone.violated, false);
  }
});

test('low-speed zone goals wait for the complete spatial span and remain reachable with legal uninterrupted speed', () => {
  for (const id of ['school', 'bus', 'meeting', 'intersection']) {
    const zone = getCoursePracticeSpeedZone(chapter(id));
    const { session } = driveZone(id, () => zone.limitKmh / 3.6 - .2);
    assert.equal(session.review?.outcome, 'complete', `${id}: ${session.errors.map(error => error.id)}`);
    assert.equal(session.speedZone.violated, false); assert.equal(session.flags.zoneSlow, true);
    assert.ok(Math.min(...corners(session.lastPose).map(p => p.z)) > zone.end);
    assert.ok(session.speedZone.covered >= zone.end - zone.start - .2);
  }
  const c = chapter('school'), pose = { ...sampleChapterPose(c, 10), speed: 0 };
  const partial = driveZone('school', () => 3, pose).session;
  assert.equal(partial.flags.zoneSlow, false, 'a mid-zone takeover cannot pretend to have checked the missing approach');
});

test('normal braking entry and an isolated speed spike are tolerated, but renewed entry cannot reset the allowance', () => {
  const c = chapter('school'), zone = getCoursePracticeSpeedZone(c), near = { x: -1.75, z: zone.start - (CAR.length - CAR.rearOverhang) - .3, speed: 6, heading: 0 };
  const braking = driveZone('school', (_, index) => index === 0 ? 5 : 4, near).session;
  assert.equal(braking.review?.outcome, 'complete'); assert.equal(braking.errors.length, 0);
  let spiked = false;
  const isolated = driveZone('school', driving => {
    if (!spiked && driving.z > 10) { spiked = true; return 8; }
    return 4;
  }).session;
  assert.equal(isolated.review?.outcome, 'complete'); assert.equal(isolated.errors.length, 0);
  let { driving } = start('school'); driving = { ...driving, ...near };
  let session = createCoursePractice(c, { driving, initialPose: courseDrivingPose(driving) });
  const firstEntry = { ...driving, z: near.z + .5, speed: 5, brake: true, acceleration: -1 };
  session = stepCoursePractice(session, { pose: firstEntry, dt: .1 });
  const enteredAt = session.speedZone.enteredAt;
  for (let i = 0; i < 10; i++) session = stepCoursePractice(session, { pose: { ...near, speed: 0 }, dt: .1 });
  for (let i = 0; i < 3; i++) session = stepCoursePractice(session, { pose: { ...firstEntry, speed: 8 }, dt: .1 });
  assert.equal(session.speedZone.enteredAt, enteredAt);
  assert.equal(session.speedZone.violated, true, 're-entry after the original allowance cannot create a fresh grace period');
  assert.ok(session.errors.some(error => error.id === 'speed-zone:school'));
});

test('road turns retain mirror/shoulder checks and lock front conflict observations before turning, never after passing', () => {
  for (const id of ['left-turn', 'right-turn', 'uturn']) {
    const c = chapter(id), side = id === 'right-turn' ? 'right' : 'left';
    let { session, driving } = start(id);
    assert.ok(session.checks.some(check => check.gaze === side)); assert.ok(session.checks.some(check => check.gaze === `${side}-back`));
    for (let i = 0; i <= 260; i++) {
      const t = Math.min(c.duration, i / 10), pose = sampleChapterPose(c, t);
      session = look(session, side, `${side}-back`, 'forward');
      driving = { ...driving, ...pose, elapsed: t };
      session = stepCoursePractice(session, { driving, pose, dt: .1 });
    }
    assert.equal(session.flags.frontConflictChecked, true); assert.equal(session.flags.frontConflictObserved, false);
    assert.equal(session.flags[id === 'right-turn' ? 'turnRight' : 'turnLeft'], false);
    assert.ok(session.errors.some(error => error.id === `front-conflict:${id}`));
    session = look(session, 'front-left', 'front-right', 'forward');
    assert.ok(session.checks.filter(check => ['front-left', 'front-right'].includes(check.gaze)).every(check => !check.done));
    const reviewed = finishCoursePractice(session);
    assert.equal(reviewed.review.outcome, 'error'); assert.equal(resumeCoursePractice(reviewed), reviewed);
    const retry = retryCoursePractice(reviewed); assert.ok(retry);
    session = retry.session; driving = retry.driving;
    assert.equal(session.flags.frontConflictChecked, false); assert.equal(session.errors.length, 0);
    session = look(session, side, `${side}-back`, 'front-left', 'front-right', 'forward');
    const retryTime = driving.elapsed;
    for (let t = retryTime + .1; t <= c.duration + 1e-7 && session.phase !== 'review'; t += .1) {
      const pose = sampleChapterPose(c, Math.min(t, c.duration)); driving = { ...driving, ...pose, elapsed: t };
      session = stepCoursePractice(session, { driving, pose, dt: .1 });
    }
    assert.equal(session.flags.frontConflictObserved, true);
    assert.equal(session.review.outcome, 'complete', `${id}: ${session.errors.map(error => error.id)}`);
  }
});

test('a straight intersection locks forward-side scans at the real conflict opening, so observations after the junction cannot wash entry', () => {
  const c = chapter('intersection'); let { session, driving } = start('intersection');
  const entry = c.scene.junctionZ - 8;
  for (let i = 0; i <= 200; i++) {
    const t = i / 10, pose = sampleChapterPose(c, t); driving = { ...driving, ...pose, elapsed: t };
    session = stepCoursePractice(session, { driving, pose, dt: .1 });
  }
  assert.equal(session.flags.frontConflictChecked, true); assert.equal(session.flags.frontConflictObserved, false);
  assert.ok(session.lastPose.z > c.scene.junctionZ + 8);
  session = look(session, 'front-left', 'front-right', 'forward');
  assert.ok(session.checks.filter(check => ['front-left', 'front-right', 'forward'].includes(check.gaze)).every(check => !check.done));
  const reviewed = finishCoursePractice(session);
  assert.equal(reviewed.review.outcome, 'error'); assert.ok(reviewed.errors.some(error => error.id === 'front-conflict:intersection'));
  const retry = retryCoursePractice(reviewed); assert.ok(retry);
  assert.ok(Math.max(...corners(retry.pose).map(p => p.z)) < entry, 'retry goes before the physical entry, not after the conflict');
  session = look(retry.session, 'front-left', 'front-right', 'forward'); driving = retry.driving;
  const retryTime = driving.elapsed;
  for (let t = retryTime + .1; t <= c.duration + 1e-7 && session.phase !== 'review'; t += .1) {
    const pose = sampleChapterPose(c, Math.min(t, c.duration)); driving = { ...driving, ...pose, elapsed: t };
    session = stepCoursePractice(session, { driving, pose, dt: .1 });
  }
  assert.equal(session.review.outcome, 'complete'); assert.equal(session.errors.length, 0);
});

test('recent front scans before the conflict suffice, while stale or absent scans do not become valid merely because a turn was completed', () => {
  for (const id of ['intersection', 'left-turn', 'right-turn', 'uturn']) {
    const c = chapter(id);
    const normal = followAuthored(id, t => t >= 10 && t < 10.2 ? ['front-left', 'front-right', 'forward', 'left', 'left-back', 'right', 'right-back'] : []);
    assert.equal(normal.review?.outcome, 'complete', `${id}: ${normal.errors.map(error => error.id)}`);
    assert.equal(normal.flags.frontConflictObserved, true);
    let { session } = start(id);
    session = look(session, 'front-left', 'front-right', 'forward');
    for (let i = 0; i < 60; i++) session = stepCoursePractice(session, { pose: session.lastPose, dt: .25 });
    for (let t = 0; t <= c.duration && !session.flags.frontConflictChecked; t += .1) {
      session = look(session, 'left', 'left-back', 'right', 'right-back');
      session = stepCoursePractice(session, { pose: sampleChapterPose(c, t), dt: .1 });
    }
    assert.equal(session.flags.frontConflictChecked, true); assert.equal(session.flags.frontConflictObserved, false);
    assert.ok(session.errors.some(error => error.id === `front-conflict:${id}`));
  }
});

test('small approach corrections and straightening an angled takeover do not prematurely lock a turn or lane change', () => {
  for (const id of ['left-turn', 'right-turn', 'uturn']) {
    const sign = id === 'right-turn' ? -1 : 1, { session: initial } = start(id), pose = initial.lastPose;
    const next = stepCoursePractice(initial, { pose: { ...pose, x: pose.x + sign * .0001, z: pose.z + .1,
      heading: pose.heading + sign * .001, steer: sign * .05, speed: 1 }, dt: .1 });
    assert.equal(next.flags.frontConflictChecked, false, id); assert.equal(next.flags[`${sign > 0 ? 'left' : 'right'}ManeuverStarted`], false);
    assert.equal(next.errors.length, 0);
  }
  const c = chapter('lane-change'), initialPose = { ...sampleChapterPose(c, 0), heading: -.1, speed: 0, leftSignal: false, rightSignal: false };
  let session = createCoursePractice(c, { initialPose });
  session = stepCoursePractice(session, { pose: { ...initialPose, x: initialPose.x - .03, z: initialPose.z + .3, heading: -.08, steer: .1, speed: 1 }, dt: .1 });
  assert.equal(session.flags.leftManeuverStarted, false); assert.equal(session.errors.length, 0);
  const exited = { ...sampleChapterPose(chapter('left-turn'), 30), speed: 0 };
  const exitSession = createCoursePractice(chapter('left-turn'), { initialPose: exited });
  const corrected = stepCoursePractice(exitSession, { pose: { ...exited, x: exited.x + .1, heading: exited.heading + .001, steer: .05, speed: 1 }, dt: .1 });
  assert.equal(corrected.flags.frontConflictChecked, false); assert.equal(corrected.errors.length, 0, 'an exited junction must not reclaim later lane keeping');
});

test('first whole-car entry locks expired observation or a lost indicator, and later target-lane fixes cannot wash the result', () => {
  for (const problem of ['expired', 'indicator']) {
    const c = chapter('lane-change'), initialPose = { ...sampleChapterPose(c, 0), speed: 0 };
    let session = look(createCoursePractice(c, { initialPose }), 'left', 'left-back');
    session = stepCoursePractice(session, { pose: { ...initialPose, x: initialPose.x + .1, z: initialPose.z + .1, heading: .04, steer: .1, speed: 1, leftSignal: true }, dt: .1 });
    assert.equal(session.flags.leftManeuverValid, true);
    if (problem === 'expired') for (let i = 0; i < 80; i++) session = stepCoursePractice(session, { pose: { ...session.lastPose, speed: 0, steer: 0 }, dt: .25 });
    session = stepCoursePractice(session, { pose: { ...session.lastPose, x: -1.75, z: session.lastPose.z + 1, heading: 0, speed: 1, leftSignal: problem !== 'indicator' }, dt: .1 });
    assert.equal(session.flags.leftLaneReached, true); assert.equal(session.flags.leftChange, false);
    assert.ok(session.errors.some(error => error.id === 'lane-entry:left'));
    session = look(session, 'left', 'left-back');
    session = stepCoursePractice(session, { pose: { ...session.lastPose, z: session.lastPose.z + .1, speed: 1, leftSignal: true }, dt: .1 });
    assert.equal(session.flags.leftChange, false); assert.equal(finishCoursePractice(session).review.outcome, 'error');
  }
});

test('a real stop inside a conflict needs fresh scans before resuming, while frozen teaching time does not age observations', () => {
  for (const refresh of [false, true, 'frozen']) {
    const c = chapter('left-turn'); let { session } = start('left-turn');
    session = look(session, 'left', 'left-back', 'front-left', 'front-right', 'forward');
    session = stepCoursePractice(session, { pose: sampleChapterPose(c, 16), dt: .1 });
    assert.equal(session.flags.frontConflictObserved, true);
    for (let i = 0; i < 64; i++) session = stepCoursePractice(session, { pose: { ...session.lastPose, speed: 0 }, dt: refresh === 'frozen' ? 0 : .25 });
    if (refresh === true) session = look(session, 'front-left', 'front-right', 'forward');
    session = stepCoursePractice(session, { pose: sampleChapterPose(c, 16.1), dt: .1 });
    assert.equal(session.flags.frontConflictObserved, refresh !== false);
    assert.equal(session.errors.some(error => error.id === 'front-conflict:left-turn'), refresh === false);
  }
});

test('leaving a junction sideways stops its two-dimensional speed check without completing the straight corridor', () => {
  const c = chapter('intersection'); let { session } = start('intersection');
  const push = pose => {
    session = look(session, 'front-left', 'front-right', 'forward');
    assert.equal(evaluateCourseSafety({ chapter: c, previous: session.lastPose, pose }).blocking, false);
    session = stepCoursePractice(session, { pose, dt: .1 });
  };
  for (let z = -24.7; z < 17.75; z += .3) push({ ...session.lastPose, x: -1.75, z: Math.min(z, 17.75), heading: 0, speed: 3, steer: 0 });
  push({ ...session.lastPose, x: -1.75, z: 17.75, heading: 0, speed: 3 });
  for (let a = .075; a < Math.PI / 2; a += .075) push({ ...session.lastPose, x: -1.75 + 4 * (1 - Math.cos(a)), z: 17.75 + 4 * Math.sin(a), heading: a, speed: 3, steer: Math.atan(CAR.wheelbase / 4) });
  push({ ...session.lastPose, x: 2.25, z: 21.75, heading: Math.PI / 2, speed: 3, steer: 0 });
  while (session.lastPose.x < 15) push({ ...session.lastPose, x: session.lastPose.x + .3, speed: 3 });
  const insideTime = session.speedZone.insideTime;
  while (session.lastPose.x < 35) {
    const speed = Math.min(8, session.lastPose.speed + .16);
    push({ ...session.lastPose, x: session.lastPose.x + speed * .1, speed });
  }
  assert.equal(session.speedZone.insideTime, insideTime); assert.equal(session.speedZone.complete, false);
  assert.equal(session.speedZone.coverageBroken, true); assert.equal(session.errors.some(error => error.id === 'speed-zone:intersection'), false);
});

test('a mid-zone takeover can actually retreat before the entrance and traverse anew without refreshing grace or erasing excess', () => {
  for (const wasSpeeding of [false, true]) {
    const c = chapter('school'), initialPose = { ...sampleChapterPose(c, 0), z: 1, speed: 0 };
    let session = createCoursePractice(c, { initialPose });
    if (wasSpeeding) for (let i = 0; i < 4; i++) session = stepCoursePractice(session, { pose: { ...session.lastPose, z: session.lastPose.z + .8, speed: 8 }, dt: .1 });
    while (Math.max(...corners(session.lastPose).map(p => p.z)) >= -.1) session = stepCoursePractice(session, { pose: { ...session.lastPose, z: session.lastPose.z - .3, speed: -3 }, dt: .1 });
    const entryTime = session.speedZone.enteredAt, excess = session.speedZone.excessTime;
    assert.equal(session.speedZone.entryFromBefore, true);
    while (session.phase !== 'review' && session.lastPose.z < 65) {
      session = look(session, 'front-left', 'front-right', 'forward');
      session = stepCoursePractice(session, { pose: { ...session.lastPose, z: session.lastPose.z + .32, speed: 3.2 }, dt: .1 });
    }
    assert.equal(session.speedZone.enteredAt, entryTime); assert.ok(session.speedZone.excessTime >= excess);
    assert.equal(session.speedZone.graceEligible, false);
    assert.equal(session.review?.outcome, wasSpeeding ? 'error' : 'complete');
    assert.equal(session.flags.zoneSlow, !wasSpeeding);
  }
});

test('school and bus observations belong to their approach/zone window, not an after-exit completion click', () => {
  for (const id of ['school', 'bus']) {
    const c = chapter(id); let { session, driving } = start(id);
    const lateTime = id === 'school' ? 22 : 18;
    for (let i = 0; i <= lateTime * 10; i++) {
      const t = i / 10, pose = sampleChapterPose(c, t); driving = { ...driving, ...pose, elapsed: t };
      session = look(session, 'forward'); session = stepCoursePractice(session, { driving, pose, dt: .1 });
    }
    assert.equal(session.speedZone.observationClosed, true); assert.ok(session.errors.some(error => error.id === `zone-observation:${id}`));
    session = look(session, 'front-left', 'front-right', 'forward');
    assert.ok(session.checks.filter(check => ['front-left', 'front-right'].includes(check.gaze)).every(check => !check.done));
    const retry = retryCoursePractice(finishCoursePractice(session)); assert.ok(retry);
    session = look(retry.session, 'front-left', 'front-right', 'forward'); driving = retry.driving;
    const at = driving.elapsed;
    for (let t = at + .1; t <= c.duration + 1e-7 && session.phase !== 'review'; t += .1) {
      const pose = sampleChapterPose(c, Math.min(t, c.duration)); driving = { ...driving, ...pose, elapsed: t };
      session = stepCoursePractice(session, { driving, pose, dt: .1 });
    }
    assert.equal(session.review.outcome, 'complete'); assert.equal(session.errors.length, 0);
  }
});
