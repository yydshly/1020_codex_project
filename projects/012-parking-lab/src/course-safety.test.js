import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { EXAM_COURSES, sampleChapterPose } from './exam-courses.js';
import { createCourseDrivingSession, stepCourseDriving, courseDrivingPose } from './course-driving.js';
import { getCourseSafetyModel, getCourseTrafficActors, evaluateCourseSafety, courseCarPolygon, courseWheelPolygons } from './course-safety.js';
import { createTrainingCar, CAR_VISUAL_ROOT_Y } from './vehicle-visuals.js';
import { getCourseMirrorCollisionContext } from './course-mirror-collision.js';
import { courseAttachmentDistance, sweepCourseAttachments } from './course-attachment-collision.js';

const chapter = id => Object.values(EXAM_COURSES).flatMap(course => course.chapters).find(chapter => chapter.id === id);
const p = (x, z, heading = 0, extra = {}) => ({ x, z, heading, y: 0, speed: 1, t: 0, ...extra });
const check = (c, previous, pose, actors = [], previousActors = actors) => evaluateCourseSafety({ chapter: c, previous, pose, context: { actors }, previousContext: { actors: previousActors } });
function mirrorFixture(t) {
  const model = createTrainingCar({ world: new THREE.Scene() });
  t.after(() => {
    const geometry = new Set(), materials = new Set();
    model.car.traverse(object => { if (object.geometry) geometry.add(object.geometry); for (const material of Array.isArray(object.material) ? object.material : [object.material]) if (material) materials.add(material); });
    geometry.forEach(value => value.dispose()); materials.forEach(value => value.dispose());
  });
  return { contextAt(pose, actors = [], parts = null) {
    model.car.position.set(pose.x, (pose.y ?? 0) + CAR_VISUAL_ROOT_Y, pose.z);
    model.car.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), pose.heading).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), pose.pitch || 0));
    const context = getCourseMirrorCollisionContext(model);
    return { ...context, actors, ...(parts ? { egoAttachments: parts } : {}) };
  } };
}
const worldPoint = (point, transform) => new THREE.Vector3(point.x, point.y, point.z)
  .applyQuaternion(new THREE.Quaternion(transform.quaternion.x, transform.quaternion.y, transform.quaternion.z, transform.quaternion.w))
  .add(new THREE.Vector3(transform.position.x, transform.position.y, transform.position.z));
const smallObstacle = (point, extra = {}) => ({ id: 'mirror-post', label: '细立柱', type: 'obstacle', x: point.x, z: point.z,
  baseY: point.y - .01, height: .02, width: .02, length: .02, heading: 0, ...extra });

test('all 22 reference chapters remain physically contained and avoid their actual scripted obstacles', () => {
  let count = 0;
  for (const course of Object.values(EXAM_COURSES)) for (const c of course.chapters) {
    let previous = sampleChapterPose(c, 0);
    const times = new Set([0, c.duration, ...c.poses.map(pose => pose.t)]);
    for (let t = .15; t < c.duration; t += .15) times.add(t);
    for (const t of [...times].sort((a, b) => a - b)) {
      const pose = sampleChapterPose(c, t), result = evaluateCourseSafety({ chapter: c, previous, pose });
      assert.equal(result.blocking, false, `${c.id} at ${t.toFixed(2)}: ${result.events.map(e => e.id).join(',')}`);
      previous = pose;
    }
    count++;
  }
  assert.equal(count, 22);
});

test('scripted crossing traffic is swept even when the ego is stationary and no render context is supplied', () => {
  const c = chapter('crosswalk'), previous = p(-1.75, 12, 0, { t: 7, speed: 0 }), pose = { ...previous, t: 15 };
  const result = evaluateCourseSafety({ chapter: c, previous, pose });
  assert.equal(result.blocking, true, 'the walker crosses the body between the two safe endpoints');
  assert.ok(result.events.some(event => event.type === 'pedestrian-collision'));
  assert.ok(result.contactPose.t > 8 && result.contactPose.t < 10, 'waiting until t8 is preserved rather than linearly stretching the whole t7..15 interval');
  assert.equal(result.startedUnsafe, false);
  assert.equal(evaluateCourseSafety({ chapter: c, previous: result.lastSafePose, pose: result.lastSafePose }).blocking, false);
  const clockAlias = evaluateCourseSafety({ chapter: c, previous: { x: -1.75, z: 12, heading: 0, time: 7 }, pose: { x: -1.75, z: 12, heading: 0, time: 15 } });
  assert.equal(clockAlias.blocking, true, 'the supported time clock alias must not acquire an artificial t=0');
  assert.ok(Math.abs(clockAlias.contactPose.time - result.contactPose.t) < .001);
});

test('a rotating actor sweeps its corners even if the centre and both endpoint clearances are unchanged', () => {
  const c = chapter('lane-change'), ego = p(-5.25, 0, 0, { speed: 0 });
  const actor = { id: 'turning-long-car', type: 'vehicle', x: -2, z: 1.34, width: 1, length: 5.5, baseY: 0, height: 1.5 };
  const before = { ...actor, heading: 0 }, after = { ...actor, heading: Math.PI };
  assert.equal(check(c, ego, ego, [before]).blocking, false);
  assert.equal(check(c, ego, ego, [after]).blocking, false);
  const result = check(c, ego, { ...ego, t: 1 }, [after], [before]);
  assert.equal(result.blocking, true);
  assert.ok(result.events.some(event => event.actorId === actor.id));
  assert.ok(result.fraction > 0 && result.fraction < .5);
  assert.equal(check(c, result.lastSafePose, result.lastSafePose, [{ ...actor, heading: Math.PI * result.lastSafePose.t }]).blocking, false);
});

test('nearby traffic warnings distinguish closing, constant close following, and leaving the target', () => {
  const c = chapter('straight'), ego = p(-1.75, 0, 0, { speed: 0 });
  const actor = { id: 'ahead', type: 'vehicle', x: -1.75, z: 6.8, width: 1.8, length: 5.5, height: 1.5 };
  assert.equal(check(c, { ...ego, speed: -1 }, { ...ego, z: -.1, speed: -1 }, [actor]).events.some(event => event.type === 'proximity'), false,
    'reversing away from a close vehicle must not say it is approaching');
  assert.equal(check(c, ego, { ...ego, z: .1, speed: 1 }, [actor]).events.some(event => event.type === 'proximity'), true);
  assert.equal(check(c, ego, ego, [{ ...actor, z: 6.7 }], [actor]).events.some(event => event.type === 'proximity'), true,
    'the other vehicle can close the gap even while ego speed is zero');
  assert.equal(check(c, ego, ego, [{ ...actor, z: 7 }], [actor]).events.some(event => event.type === 'proximity'), false);
  const following = check(c, ego, { ...ego, z: .1, speed: 1 }, [{ ...actor, z: 6.9 }], [actor]);
  assert.ok(following.events.some(event => event.type === 'proximity' && /余量较小/.test(event.title)), 'constant close following still gets a clearance reminder rather than claiming the gap is closing');
  const edge = check(c, p(2.6, 0), p(2, 0));
  assert.equal(edge.events.some(event => event.type === 'edge-line'), false, 'leaving an edge-paint warning clears it before returning the frame');
});

test('an already unsafe initial pose does not manufacture a last safe pose or claim to have stopped before contact', () => {
  const c = chapter('straight'), ego = p(-1.75, 0);
  const actor = { id: 'overlap', x: -1.75, z: 1, width: 1.8, length: 4.4, baseY: 0, height: 1.5 };
  const result = check(c, ego, { ...ego, z: .1 }, [actor]);
  assert.equal(result.startedUnsafe, true);
  assert.equal(result.lastSafePose, null);
  assert.equal(result.fraction, 0);
  assert.match(result.events.find(event => event.blocking).detail, /当前位置已存在/);
  assert.doesNotMatch(result.events.find(event => event.blocking).detail, /已暂停在接触前/);
});

test('the audited A-then-W excursion now warns and blocks before crossing the opposing solid divider', () => {
  const c = chapter('straight');
  let state = createCourseDrivingSession(c, { ...sampleChapterPose(c, 0), speed: 0, gear: 'N' });
  for (let i = 0; i < 130; i++) state = stepCourseDriving(state, { left: true }, .005);
  let result, bodyWarning = false;
  for (let i = 0; i < 1200; i++) {
    const previous = courseDrivingPose(state);
    state = stepCourseDriving(state, { forward: true }, .005);
    result = check(c, previous, courseDrivingPose(state));
    bodyWarning ||= result.events.some(e => e.type === 'solid-line-proximity' && !e.blocking);
    if (result.blocking) break;
  }
  assert.equal(result.blocking, true);
  assert.equal(bodyWarning, true, 'body overhang gets a distinct reminder before the tyre contact check');
  assert.ok(result.events.some(e => e.type === 'opposing-line'));
  assert.ok(courseWheelPolygons(result.lastSafePose).flat().every(point => point.x < -.12));
});

test('road containment tests the whole bumper and concave junction, while legal lane changes and turns remain allowed', () => {
  const straight = chapter('straight');
  const result = check(straight, p(-1.75, 0), p(4, 0));
  assert.equal(result.blocking, true);
  const edge = check(straight, p(2.5, 0), p(4, 0));
  assert.ok(edge.events.some(e => e.type === 'road-edge'));
  assert.ok(courseCarPolygon(edge.lastSafePose).every(point => point.x <= 3.52));
  assert.equal(check(chapter('lane-change'), p(-5.25, 0), p(-1.75, 10)).blocking, false, 'same-direction dashed lane divider is not an opposing solid line');
  assert.equal(check(chapter('lane-change'), p(-1.75, 10), p(-5.25, 20)).blocking, false, 'returning across the same-direction dashed line is also legal');
  for (const id of ['left-turn', 'right-turn']) {
    const c = chapter(id); let previous = sampleChapterPose(c, 15);
    for (let t = 15.1; t <= 22; t += .1) {
      const pose = sampleChapterPose(c, t);
      assert.equal(check(c, previous, pose).blocking, false, 'junction apron really joins both road arms');
      previous = pose;
    }
  }
});

test('a swept box collision cannot tunnel through a bus-sized object at low frame rates, forwards or backwards', () => {
  const c = chapter('straight');
  for (const sign of [1, -1]) {
    const actor = { id: 'bus', type: 'vehicle', label: '公交车', x: -1.75, z: sign * 10, width: 2.3, length: 9.5, baseY: .325, height: 2.25 };
    const result = check(c, p(-1.75, 0), p(-1.75, sign * 25, 0, { speed: sign * 4 }), [actor]);
    assert.equal(result.blocking, true);
    assert.ok(result.events.some(e => e.type === 'collision' && e.actorId === 'bus'));
    assert.ok(Math.abs(result.lastSafePose.z) < Math.abs(result.contactPose.z));
    assert.equal(check(c, result.lastSafePose, result.lastSafePose, [actor]).blocking, false);
  }
});

test('relative actor motion detects a pedestrian crossing the stationary full car between samples', () => {
  const c = chapter('straight'), ego = p(-1.75, 0, 0, { speed: 0 });
  const before = { id: 'person', type: 'pedestrian', label: '行人', x: -4, z: 1.5, radius: .32, baseY: 0, height: 1.75 };
  const after = { ...before, x: 4 };
  const result = check(c, ego, ego, [after], [before]);
  assert.equal(result.blocking, true);
  assert.ok(result.events.some(e => e.type === 'pedestrian-collision'));
  assert.ok(result.fraction > 0 && result.fraction < 1);
});

test('actual scene actors override fallback scripts and overhead objects do not collide at road level', () => {
  const c = chapter('bus'), ego = p(-4, 20);
  assert.ok(evaluateCourseSafety({ chapter: c, pose: ego }).events.some(e => e.type === 'collision'));
  assert.equal(check(c, ego, ego, []).blocking, false, 'an authoritative empty scene does not reinsert stale fallback objects');
  const sign = { id: 'overhead-sign', type: 'obstacle', label: '高位标牌', x: -1.75, z: 1.5, width: 2, length: .2, baseY: 3, height: 1 };
  assert.equal(check(chapter('straight'), p(-1.75, 0), p(-1.75, 0), [sign]).blocking, false);
});

test('swept actor heights and ramp elevation separate objects below the road from objects on it', () => {
  const c = chapter('straight'), ego = p(-1.75, 0, 0, { speed: 0 });
  const overhead = { id: 'descending-box', type: 'obstacle', x: -1.75, z: 1.5, width: 1, length: 1, y: 3, height: .1 };
  const below = { ...overhead, y: -1 };
  assert.equal(check(c, ego, ego, [overhead]).blocking, false);
  assert.equal(check(c, ego, ego, [below]).blocking, false);
  const result = check(c, ego, { ...ego, t: 1 }, [below], [overhead]);
  assert.equal(result.blocking, true, 'vertical motion between two clear endpoints must also be sampled');
  assert.ok(result.fraction > 0 && result.fraction < 1);
  const lastActor = { ...overhead, y: 3 - 4 * result.lastSafePose.t };
  assert.equal(check(c, result.lastSafePose, result.lastSafePose, [lastActor]).blocking, false);
  const hill = chapter('hill-start'), raised = sampleChapterPose(hill, hill.duration);
  const lowerCar = { id: 'under-platform', x: raised.x, z: raised.z + 1.34, width: 1.86, length: 4.24, baseY: .01, height: 1.405 };
  assert.equal(check(hill, raised, raised, [lowerCar]).blocking, false, 'ground-level objects below the raised platform are not collisions');
  assert.equal(check(hill, raised, raised, [{ ...lowerCar, baseY: raised.y + .01 }]).blocking, true, 'the same object at road height is a real collision');
});

test('the real bay mouth stays open, but the full body and rear bumper cannot cross closed bay boundaries', () => {
  const c = chapter('reverse-parking');
  assert.equal(check(c, p(0, 1.7), p(0, -5.4)).blocking, false);
  const back = check(c, p(0, -5.4), p(0, -6.2));
  assert.equal(back.blocking, true); assert.ok(back.events.some(e => e.type === 'parking-line'));
  const side = check(c, p(0, -4), p(.4, -4));
  assert.equal(side.blocking, true); assert.ok(side.lastSafePose.x < .3);
  assert.ok(courseCarPolygon(side.lastSafePose).every(point => point.x <= 1.17));
});

test('oriented collision checks do not reject separated parallel cars just because their world AABBs overlap', () => {
  const c = chapter('reverse-parking'), heading = Math.PI / 4, ego = p(-7, 1, heading);
  const center = { x: ego.x + 1.34 * Math.sin(heading), z: ego.z + 1.34 * Math.cos(heading) };
  const other = { id: 'parallel', type: 'vehicle', label: '旁车', x: center.x + 2.5 * Math.cos(heading), z: center.z - 2.5 * Math.sin(heading), width: 1.8, length: 4.4, heading, height: 1.5, baseY: 0 };
  assert.equal(check(c, ego, ego, [other]).blocking, false);
});

test('fallback actor centres and model extents correspond to scene anchors, including the corrected overtaking gap', () => {
  const meeting = chapter('meeting'), car = getCourseTrafficActors(meeting, 3)[0];
  assert.ok(Math.abs(car.z - (meeting.scene.oncoming.z - 3 * meeting.scene.oncoming.speed - 1.1525)) < 1e-10);
  assert.equal(car.width, 1.86, 'the visible wheels extend beyond the 1.76m car shell');
  assert.equal(car.height, 1.405); assert.equal(car.baseY, .01);
  const wheelOnly = { id: 'wheel-touch', x: -3.56, z: 1.34, width: car.width, length: car.length, height: car.height, baseY: car.baseY };
  assert.equal(check(chapter('straight'), p(-1.75, 0), p(-1.75, 0), [wheelOnly]).blocking, true, 'a wheel overlap must not disappear just because the two body shells are clear');
  assert.equal(check(chapter('straight'), p(-1.75, 0), p(-1.75, 0), [{ ...wheelOnly, width: 1.76 }]).blocking, false);
  const overtake = chapter('overtake'), lead = getCourseTrafficActors(overtake, 0)[0];
  assert.ok(lead.z > 4, 'lead vehicle starts ahead before the lane-change approach');
  const model = getCourseSafetyModel(chapter('right-turn'));
  assert.ok(model.roads.some(road => road.left === -6 && road.right === 6 && road.back === 12 && road.front === 28));
});

test('actual left/right mirror hulls stop before a thin post in forward and reverse sweeps without widening the body', t => {
  const fixture = mirrorFixture(t), c = chapter('lane-change');
  for (const side of ['left', 'right']) for (const direction of [-1, 1]) {
    const previous = p(-5.25, 0, 0, { t: 0 }), pose = p(-5.25, direction * 16, 0, { t: 1, speed: direction });
    const start = fixture.contextAt(previous), shell = start.egoAttachments.find(part => part.id === `${side}-mirror-backing`);
    const point = worldPoint(shell.center, start.egoTransform); point.z += direction * 8;
    const actor = smallObstacle(point), oldContext = fixture.contextAt(previous, [actor]), context = fixture.contextAt(pose, [actor]);
    assert.equal(check(c, previous, pose, [actor]).blocking, false, 'the pole clears the original 1.8m body');
    const result = evaluateCourseSafety({ chapter: c, previous, pose, previousContext: oldContext, context });
    assert.equal(result.blocking, true, `${side} mirror cannot tunnel through a thin post`);
    const event = result.events.find(event => event.type === 'mirror-contact');
    assert.equal(event.side, side); assert.equal(event.actorId, actor.id);
    assert.ok(event.partId.startsWith(`${side}-mirror-`)); assert.match(event.partLabel, /后视镜/);
    assert.ok(Number.isFinite(event.position.y)); assert.ok(Math.abs(event.position.y - point.y) < .03);
    assert.ok(Math.abs(event.position.x - point.x) < .03, 'the contact marker is at the actual shell/pole, not the rear axle');
    assert.equal(result.startedUnsafe, false); assert.ok(result.fraction > 0 && result.fraction < 1);
    const safeContext = fixture.contextAt(result.lastSafePose, [actor]);
    assert.equal(evaluateCourseSafety({ chapter: c, previous: result.lastSafePose, pose: result.lastSafePose, context: safeContext, previousContext: safeContext }).blocking, false);
  }
});

test('mirror contact uses actual rounded convex corners rather than the enclosing OBB empty space', t => {
  const fixture = mirrorFixture(t), ego = p(-5.25, 0), context = fixture.contextAt(ego);
  const part = context.egoAttachments.find(part => part.id === 'left-mirror-backing');
  const corners = [-1, 1].flatMap(x => [-1, 1].flatMap(y => [-1, 1].map(z => {
    const value = new THREE.Vector3(part.center.x, part.center.y, part.center.z);
    [x, y, z].forEach((sign, index) => value.addScaledVector(new THREE.Vector3(part.axes[index].x, part.axes[index].y, part.axes[index].z), sign * [part.halfSize.x, part.halfSize.y, part.halfSize.z][index]));
    return value;
  })));
  const corner = corners.filter(point => point.x > .95).sort((a, b) => b.x - a.x)[0];
  const actor = smallObstacle(worldPoint(corner, context.egoTransform), { width: .0001, length: .0001, height: .0001,
    baseY: worldPoint(corner, context.egoTransform).y - .00005 });
  const distance = courseAttachmentDistance(part, context.egoTransform, actor);
  assert.ok(distance.distance > .002, 'the physical rounded corner leaves real empty space inside its OBB');
  const boxPart = { ...part, vertices: corners, type: 'convex' };
  assert.ok(courseAttachmentDistance(boxPart, context.egoTransform, actor).distance < 1e-6, 'using the OBB as narrowphase would falsely report this exact case');
  const partial = { ...context, egoAttachments: [part], actors: [actor] };
  assert.equal(evaluateCourseSafety({ chapter: chapter('lane-change'), previous: ego, pose: ego, previousContext: partial, context: partial }).blocking, false);
  const inside = corner.clone().lerp(new THREE.Vector3(part.center.x, part.center.y, part.center.z), .4);
  assert.ok(courseAttachmentDistance(part, context.egoTransform, smallObstacle(worldPoint(inside, context.egoTransform), { width: .001, length: .001, height: .001,
    baseY: worldPoint(inside, context.egoTransform).y - .0005 })).distance < 1e-6);
});

test('positive millimetre obstacle dimensions are not silently widened by attachment narrowphase', () => {
  const part = { id: 'unit-hull', type: 'convex', vertices: [-.1, .1].flatMap(x => [-.1, .1].flatMap(y => [-.1, .1].map(z => ({ x, y, z })))) };
  const transform = { position: { x: 0, y: 0, z: 0 }, quaternion: { x: 0, y: 0, z: 0, w: 1 } };
  const actor = { x: .104, z: 0, width: .002, length: .1, baseY: -.05, height: .1 };
  assert.ok(Math.abs(courseAttachmentDistance(part, transform, actor).distance - .003) < 1e-9, 'a 2mm target 3mm clear of the hull stays clear');
  assert.ok(courseAttachmentDistance(part, transform, { ...actor, x: .1005 }).distance < 1e-8);
  const person = { id: 'cylinder', type: 'pedestrian', x: .14, z: .14, radius: .05, baseY: -.05, height: .1 };
  assert.ok(Math.abs(courseAttachmentDistance(part, transform, person).distance - (Math.hypot(.04, .04) - .05)) < 1e-6,
    'round pedestrian geometry must not become a square at the corner');
  assert.ok(courseAttachmentDistance(part, transform, { ...person, x: .13, z: .13 }).distance < 1e-8);
});

test('both real mirror stalks have independent narrowphase instead of being lost outside the body and housing', t => {
  const fixture = mirrorFixture(t), c = chapter('lane-change'), ego = p(-5.25, 0), source = fixture.contextAt(ego);
  for (const side of ['left', 'right']) {
    const stalk = source.egoAttachments.find(part => part.id === `${side}-mirror-stalk`);
    const point = worldPoint(stalk.center, source.egoTransform), actor = smallObstacle(point, { width: .001, length: .001, height: .001, baseY: point.y - .0005 });
    const previous = p(-5.25, -1), pose = { ...ego, t: 1 };
    assert.equal(check(c, previous, pose, [actor]).blocking, false);
    const previousContext = fixture.contextAt(previous, [actor]), context = fixture.contextAt(pose, [actor]);
    const result = evaluateCourseSafety({ chapter: c, previous, pose, previousContext, context });
    assert.ok(result.events.some(event => event.type === 'mirror-contact' && event.partId === stalk.id && event.side === side));
    assert.ok(result.events.some(event => event.partLabel === `${side === 'left' ? '左' : '右'}后视镜支架`));
    const safe = fixture.contextAt(result.lastSafePose, [actor]);
    assert.equal(evaluateCourseSafety({ chapter: c, previous: result.lastSafePose, pose: result.lastSafePose, previousContext: safe, context: safe }).blocking, false);
  }
});

test('low kerbs, painted lines, and overhead objects are independent of external-mirror collision height', t => {
  const fixture = mirrorFixture(t), c = chapter('lane-change'), ego = p(-5.25, 0), initial = fixture.contextAt(ego);
  for (const side of ['left', 'right']) {
    const part = initial.egoAttachments.find(part => part.id === `${side}-mirror-backing`), point = worldPoint(part.center, initial.egoTransform);
    for (const actor of [smallObstacle(point, { id: 'low-kerb', baseY: 0, height: .14 }), smallObstacle(point, { id: 'overhead', baseY: 2.7, height: .3 })]) {
      const context = fixture.contextAt(ego, [actor]);
      assert.equal(evaluateCourseSafety({ chapter: c, previous: ego, pose: ego, context, previousContext: context }).blocking, false);
    }
  }
  const paintPose = p(-1.04, 0), context = fixture.contextAt(paintPose);
  assert.ok(context.egoAttachments.some(part => part.vertices.some(vertex => Math.abs(worldPoint(vertex, context.egoTransform).x) < .125)), 'a mirror projects over the opposing paint');
  assert.equal(evaluateCourseSafety({ chapter: chapter('straight'), previous: paintPose, pose: paintPose, context, previousContext: context }).blocking, false,
    'a mirror over a painted line does not mean a wheel pressed it or the body crossed it');
});

test('an external-mirror overlap at the initial position is explicit, while leaving a clear close position is allowed', t => {
  const fixture = mirrorFixture(t), c = chapter('lane-change'), ego = p(-5.25, 0), context = fixture.contextAt(ego);
  const part = context.egoAttachments.find(part => part.id === 'right-mirror-backing');
  const actor = smallObstacle(worldPoint(part.center, context.egoTransform));
  const overlap = fixture.contextAt(ego, [actor]);
  const result = evaluateCourseSafety({ chapter: c, previous: ego, pose: ego, context: overlap, previousContext: overlap });
  assert.equal(result.startedUnsafe, true); assert.equal(result.lastSafePose, null);
  assert.ok(result.events.some(event => event.type === 'mirror-contact' && event.side === 'right'));
  assert.match(result.events.find(event => event.type === 'mirror-contact').detail, /当前位置已存在/);
  const before = p(-5.25, -1), away = p(-5.25, -2, 0, { t: 1, speed: -1 });
  assert.equal(evaluateCourseSafety({ chapter: c, previous: before, pose: away, previousContext: fixture.contextAt(before, [actor]), context: fixture.contextAt(away, [actor]) }).blocking, false);
});

test('actual mirror tilt and road pitch transform the hull in 3D, and intermediate yaw/pitch contacts are swept', t => {
  const fixture = mirrorFixture(t), c = chapter('lane-change'), ego = p(-5.25, 0), centerContext = fixture.contextAt(ego);
  const part = centerContext.egoAttachments.find(part => part.id === 'left-mirror-backing');
  const actor = smallObstacle(worldPoint(part.center, centerContext.egoTransform), { width: .006, length: .006, height: .006,
    baseY: worldPoint(part.center, centerContext.egoTransform).y - .003 });
  for (const axis of ['heading', 'pitch']) {
    const before = { ...ego, [axis]: -.2, t: 0 }, after = { ...ego, [axis]: .2, t: 1 };
    const oldContext = fixture.contextAt(before, [actor], [part]), context = fixture.contextAt(after, [actor], [part]);
    assert.ok(courseAttachmentDistance(part, oldContext.egoTransform, actor).distance > .005);
    assert.ok(courseAttachmentDistance(part, context.egoTransform, actor).distance > .005);
    const result = evaluateCourseSafety({ chapter: c, previous: before, pose: after, previousContext: oldContext, context });
    assert.ok(result.events.some(event => event.type === 'mirror-contact'), `${axis} sweep must detect the intermediate hull, despite both safe endpoints`);
    assert.ok(result.fraction > 0 && result.fraction < 1);
    assert.deepEqual(result.lastSafePose, before, 'rollback restores the actual checked frame-start pose rather than mapping SLERP back into a different Euler/ramp pose');
    const safe = fixture.contextAt(result.lastSafePose, [actor], [part]);
    assert.equal(evaluateCourseSafety({ chapter: c, previous: result.lastSafePose, pose: result.lastSafePose, previousContext: safe, context: safe }).blocking, false);
  }
  const raised = p(-5.25, 0, 0, { y: 1.8, pitch: -.1 }), pitched = fixture.contextAt(raised, [], [part]);
  const highActor = smallObstacle(worldPoint(part.center, pitched.egoTransform));
  assert.ok(courseAttachmentDistance(part, pitched.egoTransform, highActor).distance < 1e-6);
  assert.ok(courseAttachmentDistance(part, fixture.contextAt({ ...raised, pitch: 0 }).egoTransform, highActor).distance > .05,
    'flattening the same elevated car would put the mirror at the wrong height');
});

test('almost parallel wall clearance uses the SLERP axis instead of exhausting thousands of pitch steps', t => {
  const fixture = mirrorFixture(t), ego = p(0, 0), initial = fixture.contextAt(ego);
  const part = initial.egoAttachments.find(part => part.id === 'left-mirror-backing');
  const wall = { id: 'wall', x: Math.max(...part.vertices.map(vertex => vertex.x)) + .000027 + .005, z: 1,
    width: .01, length: 5, baseY: -1, height: 5 };
  for (const yaw of [0, .000015, .000016]) {
    const target = fixture.contextAt({ ...ego, heading: yaw, pitch: .1 });
    let samples = 0;
    const result = sweepCourseAttachments({ attachments: [part], previousTransform: initial.egoTransform, transform: target.egoTransform,
      actorsAt() { samples++; return [wall]; }, linearActors: true });
    if (yaw) {
      assert.ok(courseAttachmentDistance(part, target.egoTransform, wall).distance < 1e-6);
      assert.ok(result, `a tiny ${yaw} yaw eventually reaches the wall despite the dominant tangential pitch`);
      assert.ok(result.fraction > 0 && result.fraction < 1);
    } else {
      assert.ok(courseAttachmentDistance(part, target.egoTransform, wall).distance > .00002);
      assert.equal(result, null, 'pure pitch keeps the real positive wall clearance');
    }
    assert.ok(samples < 100, `the separating-axis bound should converge quickly, not spend 8192 samples (${samples})`);
  }
});

test('all 22 complete reference chapters also avoid mirror-housing blocking with actual mesh geometry enabled', t => {
  const fixture = mirrorFixture(t);
  for (const c of Object.values(EXAM_COURSES).flatMap(course => course.chapters)) {
    const actorsAt = time => [...getCourseSafetyModel(c).obstacles, ...getCourseTrafficActors(c, time)];
    const times = new Set([0, c.duration, ...c.poses.map(pose => pose.t)]);
    for (let time = .15; time < c.duration; time += .15) times.add(time);
    let previous = sampleChapterPose(c, 0), previousContext = fixture.contextAt(previous, actorsAt(0));
    for (const time of [...times].sort((a, b) => a - b)) {
      const pose = sampleChapterPose(c, time), context = fixture.contextAt(pose, actorsAt(time));
      const result = evaluateCourseSafety({ chapter: c, previous, pose, previousContext, context });
      assert.equal(result.blocking, false, `${c.id} t${time.toFixed(2)}: ${result.events.map(event => event.type + ':' + event.partId).join(',')}`);
      previous = pose; previousContext = context;
    }
  }
});
