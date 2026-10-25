import test from 'node:test';
import assert from 'node:assert/strict';
import { createCockpitSettings } from './cockpit.js';
import { driverLookAngles } from './driver-view.js';
import * as THREE from 'three';
import { courseObservationAngles, courseObservationFrame, COURSE_GAZES, COURSE_INTERIOR_MIRROR_CENTER } from './course-observation.js';
import { createTrainingCar, CAR_VISUAL_ROOT_Y } from './vehicle-visuals.js';

test('course shoulder observation reaches the rear quarter without moving the driver eye', () => {
  const settings = createCockpitSettings();
  for (const [side, x] of [['left-back', 3.5], ['right-back', -3.5]]) {
    const look = courseObservationAngles(settings, side), bearing = Math.atan2(x - .39, -2 - settings.seatFore);
    assert.ok(Math.abs(Math.atan2(Math.sin(bearing - look.yaw), Math.cos(bearing - look.yaw))) < 15 * Math.PI / 180);
    assert.equal(look.yaw, (side === 'left-back' ? 130 : -118) * Math.PI / 180);
  }
  assert.deepEqual(settings, createCockpitSettings());
  assert.deepEqual(COURSE_GAZES, ['forward', 'front-left', 'front-right', 'left', 'right', 'rear', 'left-back', 'right-back']);
});

test('front-left and front-right scan forward road conflicts, independently of mirror aim and rear shoulder checks', () => {
  const settings = createCockpitSettings(), before = structuredClone(settings);
  for (const [gaze, sign] of [['front-left', 1], ['front-right', -1]]) {
    const angles = courseObservationAngles(settings, gaze), frame = courseObservationFrame(settings, gaze);
    assert.equal(angles.yaw, sign * 55 * Math.PI / 180); assert.equal(angles.pitch, 0);
    assert.ok(frame.direction.z > 0 && frame.direction.x * sign > 0, 'this head turn still looks ahead, not behind the car');
    const target = new THREE.Vector3(sign * 8, 0, 5).normalize();
    assert.ok(new THREE.Vector3(frame.direction.x, frame.direction.y, frame.direction.z).angleTo(target) < 5 * Math.PI / 180,
      'a front-side pedestrian or transverse-road target is near the actual view centre');
    assert.notDeepEqual(angles, driverLookAngles(settings, sign > 0 ? 'left' : 'right'), 'mirror views still aim at the physical mirror centre');
    assert.ok(Math.abs(angles.yaw) < Math.PI / 2);
    assert.ok(Math.abs(courseObservationAngles(settings, sign > 0 ? 'left-back' : 'right-back').yaw) > Math.PI / 2);
  }
  assert.deepEqual(settings, before, 'head turns cannot change mirror adjustments or move the seat');
});

test('front conflict scans keep the selected seat eye across legal seat settings', () => {
  for (const [height, fore] of [[1.16, .95], [1.28, 1.10], [1.4, 1.3]]) {
    const settings = { ...createCockpitSettings(), seatHeight: height, seatFore: fore };
    for (const gaze of ['forward', 'front-left', 'front-right', 'left', 'right', 'rear', 'left-back', 'right-back']) {
      assert.deepEqual(courseObservationFrame(settings, gaze).eye, { x: .39, y: height, z: fore });
    }
  }
});

test('rear observation aims at the actual interior mirror and preserves original front/side views', () => {
  const settings = createCockpitSettings(), c = COURSE_INTERIOR_MIRROR_CENTER;
  const look = courseObservationAngles(settings, 'rear');
  assert.equal(look.yaw, Math.atan2(c.x - .39, c.z - settings.seatFore));
  assert.equal(look.pitch, Math.atan2(c.y - settings.seatHeight, Math.hypot(c.x - .39, c.z - settings.seatFore)));
  assert.ok(Math.abs(look.yaw) < Math.PI / 2, 'looking at the forward-mounted rearview mirror is not a rear bumper camera');
  for (const side of ['forward', 'left', 'right']) assert.deepEqual(courseObservationAngles(settings, side), driverLookAngles(settings, side));
});

test('all observation views share a single seat eye, while shoulder views retain the car pillars and expose a usable rear-quarter sightline', t => {
  const settings = createCockpitSettings(), frames = COURSE_GAZES.map(gaze => courseObservationFrame(settings, gaze));
  for (const frame of frames) {
    assert.deepEqual(frame.eye, { x: .39, y: 1.28, z: 1.10 });
    assert.ok(Math.abs(Math.hypot(frame.direction.x, frame.direction.y, frame.direction.z) - 1) < 1e-12);
  }
  const world = new THREE.Scene(), carModel = createTrainingCar({ world }); carModel.car.position.y = CAR_VISUAL_ROOT_Y; world.updateMatrixWorld(true);
  t.after(() => { const gs = new Set(), ms = new Set(); world.traverse(o => { if (o.geometry) gs.add(o.geometry); for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (m) ms.add(m); }); gs.forEach(g => g.dispose()); ms.forEach(m => m.dispose()); });
  const eye = new THREE.Vector3(.39, settings.seatHeight, settings.seatFore);
  function blocked(point) {
    const direction = point.clone().sub(eye), length = direction.length();
    return new THREE.Raycaster(eye, direction.normalize(), .06, length).intersectObject(carModel.car, true)
      .find(hit => !hit.object.material?.transparent);
  }
  for (const [gaze, point] of [['left-back', new THREE.Vector3(3.5, 1.28, -1)], ['right-back', new THREE.Vector3(-3.5, 1.28, -1)]]) {
    const frame = courseObservationFrame(settings, gaze), direction = new THREE.Vector3(frame.direction.x, frame.direction.y, frame.direction.z);
    assert.ok(direction.angleTo(point.clone().sub(eye)) < 20 * Math.PI / 180);
    assert.equal(Boolean(blocked(point)), false, `${gaze}: the shoulder view has an actual clear side/rear window sightline`);
    assert.equal(Boolean(blocked(eye.clone().addScaledVector(direction, 8))), false,
      `${gaze}: its view centre must not aim at a seat or a pillar`);
  }
  for (const gaze of ['front-left', 'front-right']) {
    const frame = courseObservationFrame(settings, gaze), direction = new THREE.Vector3(frame.direction.x, frame.direction.y, frame.direction.z);
    assert.equal(Boolean(blocked(eye.clone().addScaledVector(direction, 12))), false,
      `${gaze}: the forward-side view centre passes through real glazing, not a mirror, pillar or a floating external eye`);
  }
  assert.match(blocked(eye.clone().add(new THREE.Vector3(-Math.sin(Math.PI / 3), 0, Math.cos(Math.PI / 3)).multiplyScalar(8)))?.object.name ?? '', /a-pillar/,
    'the nearby A-pillar remains a real occlusion instead of being removed for front conflict scans');
  assert.match(blocked(new THREE.Vector3(3.5, 1.15, -2))?.object.name ?? '', /b-pillar/,
    'a shoulder check must not magically hide the real pillar or imply every rear-quarter point is visible');
  assert.match(blocked(new THREE.Vector3(-3.5, 1, -2))?.object.name ?? '', /headrest/,
    'lower right-rear objects may remain behind the passenger headrest, rather than becoming a fake unobstructed rear camera');
});
