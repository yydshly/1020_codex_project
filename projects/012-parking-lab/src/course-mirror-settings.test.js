import test from 'node:test';
import assert from 'node:assert/strict';
import { createCockpitSettings, createMirrorFrame, projectMirrorPoint, sampleMirrorRay } from './cockpit.js';
import { recommendMirrorSettings } from './mirror-fit.js';
import { createMirrorOptics } from './mirror-optics.js';
import { sourceUV } from './mirror-optics.js';
import * as THREE from 'three';
import { createTrainingCar, CAR_VISUAL_ROOT_Y } from './vehicle-visuals.js';
import { createCourseMirrorRenderer } from './course-mirrors.js';
import { createCourseOperationVisuals } from './course-operation-visuals.js';
import { createMirrorClipPlane } from './mirror-clip.js';
import { updateMirrorSurfaceGeometry } from './mirror-surface.js';
import { createCourseDrivingSession, stepCourseDriving, courseDrivingPose } from './course-driving.js';
import { createCourseMirrorSettings, restoreCourseMirrorSettings, setCourseMirrorSetting,
  resolveCourseMirrorSettings, recommendCourseMirrorSettings, COURSE_MIRROR_STORAGE_KEY,
  COURSE_MIRROR_STORAGE_VERSION } from './course-mirror-settings.js';

const origin = { x: 0, z: 0, heading: 0 };
const snapshot = value => structuredClone(value);

test('course initialization preserves legacy seat and parking angles while using an independent road profile', () => {
  const legacy = { seatHeight: 1.34, seatFore: 1.22, left: { yaw: 13.4, pitch: -26.1 }, right: { yaw: 7.2, pitch: -21.4 } };
  const before = snapshot(legacy), config = createCourseMirrorSettings(legacy);
  assert.equal(config.seatHeight, legacy.seatHeight); assert.equal(config.seatFore, legacy.seatFore);
  assert.deepEqual(config.parking, { left: legacy.left, right: legacy.right });
  assert.deepEqual(config.road, { left: { yaw: 9.9, pitch: -3 }, right: { yaw: 8.4, pitch: -3.1 } });
  assert.deepEqual(legacy, before);
  config.parking.left.yaw = 20; assert.equal(legacy.left.yaw, 13.4);
  assert.notEqual(COURSE_MIRROR_STORAGE_KEY, 'parking-lab.cockpit.v2');
});

test('road defaults expose the adjacent rear lane at 10m / 30m and the horizon through the original finite mirror', () => {
  const config = createCourseMirrorSettings();
  for (const side of ['left', 'right']) {
    const settings = resolveCourseMirrorSettings(config, 'road'), sign = side === 'left' ? 1 : -1;
    const frame = createMirrorFrame(origin, side, settings), optics = createMirrorOptics(frame);
    assert.equal(frame.width, .19); assert.equal(frame.height, .12); assert.equal(frame.radius, 1.4);
    assert.ok(optics.fov < 20, 'road visibility must not be supplied by an arbitrary broad-angle source camera');
    for (const z of [-10, -30]) {
      const reference = projectMirrorPoint(frame, { x: sign * 3.5, y: 1, z });
      assert.equal(reference.visible, true, `${side}/${z}: adjacent rear-lane reference`);
      assert.ok(reference.x > .05 && reference.x < .95);
      assert.ok(reference.y > .1 && reference.y < .5);
    }
    const body = projectMirrorPoint(frame, { x: sign * .89, y: .82, z: -.5 });
    assert.equal(body.visible, true);
    const innerFraction = side === 'left' ? 1 - body.x : body.x;
    assert.ok(innerFraction >= .02 && innerFraction <= .14, `${side}: an inner body reference remains visible`);
    const top = sampleMirrorRay(frame, 0, 1).direction, bottom = sampleMirrorRay(frame, 0, -1).direction;
    assert.ok(top.y > 0 && bottom.y < 0, `${side}: horizon crosses the physical aperture`);
    const parkingFrame = createMirrorFrame(origin, side, resolveCourseMirrorSettings(config, 'parking'));
    assert.ok(sampleMirrorRay(parkingFrame, 0, 1).direction.y < 0, 'parking downward view stays distinct');
  }
});

test('seat edits change reflection through the fixed mirrors without automatically retargeting either profile', () => {
  const original = createCourseMirrorSettings(), before = snapshot(original);
  let next = setCourseMirrorSetting(original, 'road', 'seatHeight', 1.36);
  next = setCourseMirrorSetting(next, 'parking', 'seatFore', 1.28);
  assert.deepEqual(next.road, original.road); assert.deepEqual(next.parking, original.parking);
  for (const profile of ['road', 'parking']) {
    const a = createMirrorFrame(origin, 'left', resolveCourseMirrorSettings(original, profile));
    const b = createMirrorFrame(origin, 'left', resolveCourseMirrorSettings(next, profile));
    assert.deepEqual(a.normal, b.normal, 'mirror glass mounting stays fixed when only the eye moves');
    assert.notDeepEqual(sampleMirrorRay(a, 0, 0).direction, sampleMirrorRay(b, 0, 0).direction);
  }
  assert.deepEqual(original, before);
});

test('angle edits, resolving and recommendation keep the two profiles isolated', () => {
  const original = createCourseMirrorSettings(), before = snapshot(original);
  const changed = setCourseMirrorSetting(original, 'road', 'right.pitch', -6.4);
  assert.equal(changed.road.right.pitch, -6.4); assert.deepEqual(changed.parking, before.parking);
  const parking = setCourseMirrorSetting(changed, 'parking', 'left.yaw', 18.2);
  assert.deepEqual(parking.road, changed.road);
  const resolved = resolveCourseMirrorSettings(parking, 'road'); resolved.right.pitch = 5;
  assert.equal(parking.road.right.pitch, -6.4, 'resolved renderer settings are a copy');
  const roadFit = recommendCourseMirrorSettings(parking, 'road');
  assert.deepEqual(roadFit.settings.parking, parking.parking);
  const parkedFit = recommendCourseMirrorSettings(parking, 'parking');
  assert.deepEqual(parkedFit.settings.road, parking.road);
  const expected = recommendMirrorSettings(resolveCourseMirrorSettings(parking, 'parking'));
  assert.notDeepEqual(parkedFit.settings.parking, { left: expected.settings.left, right: expected.settings.right }, 'course parking adds actual housing/body readability beyond the legacy aperture-only fit');
  for (const side of ['left', 'right']) assert.ok(parkedFit.report[side].occlusionChecked && parkedFit.report[side].body.visible
    && parkedFit.report[side].teachingCalibration.body.readable && parkedFit.report[side].ground.visible);
  assert.deepEqual(original, before);
});

test('explicit road recommendation is bounded, repeatable and depends on the eye rather than prior mirror angles', () => {
  const base = createCourseMirrorSettings();
  let perturbed = setCourseMirrorSetting(base, 'road', 'left.yaw', -5);
  perturbed = setCourseMirrorSetting(perturbed, 'road', 'right.pitch', 6);
  const a = recommendCourseMirrorSettings(base, 'road'), b = recommendCourseMirrorSettings(perturbed, 'road');
  assert.deepEqual(a, b);
  assert.deepEqual(recommendCourseMirrorSettings(a.settings, 'road'), a, 'explicit recommendations are idempotent');
  for (const side of ['left', 'right']) {
    const report = a.report[side];
    assert.equal(report.quality, 'good'); assert.equal(report.limited, false);
    assert.ok(report.body.visible && report.rear.near.visible && report.rear.far.visible && report.horizon.visible);
  }
  const moved = setCourseMirrorSetting(base, 'road', 'seatHeight', 1.36);
  assert.notDeepEqual(recommendCourseMirrorSettings(moved, 'road').settings.road, a.settings.road);
  for (const [height, fore] of [[1.15, .9], [1.38, 1.3]]) {
    const next = setCourseMirrorSetting(setCourseMirrorSetting(base, 'road', 'seatHeight', height), 'road', 'seatFore', fore);
    const fitted = recommendCourseMirrorSettings(next, 'road');
    for (const side of ['left', 'right']) {
      assert.ok(fitted.settings.road[side].yaw >= -5 && fitted.settings.road[side].yaw <= 25);
      assert.ok(fitted.settings.road[side].pitch >= -15 && fitted.settings.road[side].pitch <= 6);
      assert.ok(Number.isFinite(fitted.report[side].angularErrorDegrees));
    }
  }
});

test('course storage round-trips separately and rejects malformed or old schemas without touching legacy data', () => {
  const legacy = createCockpitSettings(), before = snapshot(legacy);
  let configured = setCourseMirrorSetting(createCourseMirrorSettings(legacy), 'road', 'left.pitch', -2.2);
  configured = setCourseMirrorSetting(configured, 'parking', 'right.yaw', 14);
  const saved = JSON.stringify({ version: COURSE_MIRROR_STORAGE_VERSION, settings: configured });
  assert.deepEqual(restoreCourseMirrorSettings(saved, legacy), configured);
  for (const invalid of [null, '', 'bad json', '{}', 'null', JSON.stringify({ version: 2, settings: configured }),
    JSON.stringify({ version: 2, settings: legacy }), JSON.stringify(configured)]) {
    assert.deepEqual(restoreCourseMirrorSettings(invalid, legacy), createCourseMirrorSettings(legacy));
  }
  assert.deepEqual(legacy, before);
});

test('clear body reference is explicit, repeatable, eye-dependent and isolated from defaults, legacy storage and the other profile', () => {
  const base = createCourseMirrorSettings(), before = snapshot(base), legacy = createCockpitSettings();
  assert.deepEqual(recommendCourseMirrorSettings(base, 'road'), recommendCourseMirrorSettings(base, 'road', { bodyReference: 'minimal' }));
  assert.deepEqual(recommendCourseMirrorSettings(base, 'parking'), recommendCourseMirrorSettings(base, 'parking', { bodyReference: 'minimal' }));
  for (const profile of ['road', 'parking']) {
    const result = recommendCourseMirrorSettings(base, profile, { bodyReference: 'clear' }), other = profile === 'road' ? 'parking' : 'road';
    assert.deepEqual(result.settings[other], base[other]);
    assert.equal(result.settings.seatHeight, base.seatHeight); assert.equal(result.settings.seatFore, base.seatFore);
    assert.deepEqual(recommendCourseMirrorSettings(result.settings, profile, { bodyReference: 'clear' }), result);
    const saved = JSON.stringify({ version: COURSE_MIRROR_STORAGE_VERSION, settings: result.settings });
    assert.deepEqual(restoreCourseMirrorSettings(saved, legacy), result.settings);
    const perturbed = setCourseMirrorSetting(setCourseMirrorSetting(base, profile, 'left.yaw', 25), profile, 'right.pitch', profile === 'road' ? -15 : -38);
    assert.deepEqual(recommendCourseMirrorSettings(perturbed, profile, { bodyReference: 'clear' }), result, 'recommendation must not chase the prior angle');
    for (const [height, fore] of [[1.15, .9], [1.38, 1.3]]) {
      const moved = setCourseMirrorSetting(setCourseMirrorSetting(base, profile, 'seatHeight', height), profile, 'seatFore', fore);
      const fitted = recommendCourseMirrorSettings(moved, profile, { bodyReference: 'clear' });
      assert.notDeepEqual(fitted.settings[profile], result.settings[profile]);
      for (const side of ['left', 'right']) {
        assert.ok(fitted.report[side].body.visible);
        assert.ok(fitted.report[side].body.innerFraction >= .15 && fitted.report[side].body.innerFraction <= .25);
        if (profile === 'road') assert.ok(fitted.report[side].rear.near.visible && fitted.report[side].rear.far.visible);
        else if (!fitted.report[side].rear.near.visible || !fitted.report[side].rear.far.visible) {
          assert.equal(fitted.report[side].quality, 'limited', 'a high/forward eye can exhaust the parking glass pitch limit');
          assert.ok(fitted.report[side].reasons.some(reason => reason.startsWith('rear-')));
        }
      }
    }
    for (const side of ['left', 'right']) {
      assert.equal(result.report[side].bodyReference, 'clear');
      assert.equal(result.report[side].purpose, 'side-body-and-rear');
      assert.equal(result.report[side].nearGroundLimited, profile === 'parking');
    }
  }
  assert.deepEqual(base, before); assert.deepEqual(createCourseMirrorSettings(), before);
  assert.deepEqual(legacy, createCockpitSettings());
  assert.throws(() => recommendCourseMirrorSettings(base, 'road', { bodyReference: 'half-image' }), RangeError);
});

test('clear recommendations show a genuine 15-25% inner-width body strip with rear subjects through the unchanged finite mirror', t => {
  const world = new THREE.Scene(), model = createTrainingCar({ world });
  model.car.position.y = CAR_VISUAL_ROOT_Y;
  createCourseOperationVisuals(model).update({ gear: '1' }, null, {});
  model.externalMirrors.visible = false; world.updateMatrixWorld(true);
  t.after(() => {
    const geometries = new Set(), materials = new Set();
    world.traverse(object => { if (object.geometry) geometries.add(object.geometry); if (object.material) materials.add(object.material); });
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
  });
  const opaque = object => {
    for (let node = object; node; node = node.parent) if (!node.visible) return false;
    return !object.material?.transparent;
  };
  for (const profile of ['road', 'parking']) {
    const result = recommendCourseMirrorSettings(createCourseMirrorSettings(), profile, { bodyReference: 'clear' });
    const settings = resolveCourseMirrorSettings(result.settings, profile);
    for (const side of ['left', 'right']) {
      const sign = side === 'left' ? 1 : -1, frame = createMirrorFrame(origin, side, settings), optics = createMirrorOptics(frame);
      assert.equal(frame.width, .19); assert.equal(frame.height, .12); assert.equal(frame.radius, 1.4);
      assert.ok(optics.fov < 20, 'body coverage must come from turning the physical glass, not enlarging its view');
      const source = new THREE.Vector3(optics.position.x, optics.position.y, optics.position.z), clip = createMirrorClipPlane(frame);
      updateMirrorSurfaceGeometry(model.mirrorSurfaces[side].geometry, frame, optics, { rootY: CAR_VISUAL_ROOT_Y });
      const eye = new THREE.Vector3(frame.eye.x, frame.eye.y, frame.eye.z);
      const rowWidths = [], visibleRowWidths = []; let bodyPixels = 0, visibleBodyPixels = 0;
      for (let row = 0; row < 24; row++) {
        let width = 0, count = 0, visibleWidth = 0, visibleCount = 0;
        for (let col = 0; col < 40; col++) {
          const x = (col + .5) / 40, inner = side === 'left' ? 1 - x : x;
          const ray = sampleMirrorRay(frame, 2 * x - 1, 1 - 2 * (row + .5) / 24);
          const hit = new THREE.Raycaster(source, new THREE.Vector3(ray.direction.x, ray.direction.y, ray.direction.z), .04, 80)
            .intersectObject(model.car, true).find(h => opaque(h.object) && clip.distanceToPoint(h.point) >= 0);
          if (hit && /body-shell|front-driver-door-panel/.test(hit.object.name)) {
            count++; width = Math.max(width, inner); assert.ok(inner <= .27, 'only the real inner strip should contain our own body');
            // The source picture alone is insufficient: the actual driver
            // must see those glass pixels before the housing, pillar or arm.
            model.externalMirrors.visible = true;
            const toGlass = new THREE.Vector3(ray.origin.x, ray.origin.y, ray.origin.z).sub(eye);
            const seen = new THREE.Raycaster(eye, toGlass.clone().normalize(), .015, toGlass.length() + .003)
              .intersectObject(model.car, true).find(h => opaque(h.object));
            model.externalMirrors.visible = false;
            if (seen?.object === model.mirrorSurfaces[side]) { visibleCount++; visibleWidth = Math.max(visibleWidth, inner); }
          }
        }
        if (count) { bodyPixels += count; rowWidths.push(width); }
        if (visibleCount) { visibleBodyPixels += visibleCount; visibleRowWidths.push(visibleWidth); }
      }
      rowWidths.sort((a, b) => a - b);
      const medianWidth = rowWidths[Math.floor(rowWidths.length / 2)];
      assert.ok(medianWidth >= .15 && medianWidth <= .25, `${profile}/${side}: actual body width ${medianWidth}`);
      assert.ok(bodyPixels / 960 > .05 && bodyPixels / 960 < .2, '20% inner width must never be presented as 50% image area');
      visibleRowWidths.sort((a, b) => a - b);
      const seenWidth = visibleRowWidths[Math.floor(visibleRowWidths.length / 2)];
      assert.ok(seenWidth >= .15 && seenWidth <= .25, `${profile}/${side}: driver-visible body width ${seenWidth}`);
      assert.ok(visibleBodyPixels / bodyPixels > .65, `${profile}/${side}: most body pixels must remain physically visible through the housing`);
      for (const distance of [10, 30]) {
        const point = { x: sign * 3.5, y: 1, z: -distance }, p = projectMirrorPoint(frame, point);
        assert.equal(p.visible, true, `${profile}/${side}/${distance}: rear subject centre`);
        const start = new THREE.Vector3(p.origin.x, p.origin.y, p.origin.z), delta = new THREE.Vector3(point.x, point.y, point.z).sub(start);
        assert.equal(new THREE.Raycaster(start, delta.clone().normalize(), .015, delta.length() - .02).intersectObject(model.car, true).some(h => opaque(h.object)), false);
        // A 1m-wide / .7m-high subject core, at the front of a 4.4m car centred
        // at this distance. Most of the core must fit; an adjacent car's outer
        // edge can leave the right aperture at 10m, which remains a blind spot.
        let visibleCore = 0;
        for (const x of [-.5, 0, .5]) for (const y of [.45, .8, 1.15])
          if (projectMirrorPoint(frame, { x: sign * (3.5 + x), y, z: -distance + 2.2 }).visible) visibleCore++;
        assert.ok(visibleCore >= 6, `${profile}/${side}/${distance}: at least the subject core remains visible`);
      }
      assert.equal(result.report[side].quality, 'good');
    }
  }
});

test('invalid settings are ignored, numeric limits clamp idempotently and unknown fields cannot leak into config', () => {
  const base = createCourseMirrorSettings();
  for (const value of [NaN, Infinity, -Infinity, '', ' ', 'bad', true, null, undefined])
    assert.deepEqual(setCourseMirrorSetting(base, 'road', 'left.yaw', value), base);
  for (const name of ['__proto__.yaw', 'left.invalid', 'seat', 'left.yaw.extra']) assert.deepEqual(setCourseMirrorSetting(base, 'road', name, 9), base);
  for (const [profile, name, value, expected] of [['road', 'left.pitch', 100, 6], ['road', 'right.pitch', -100, -15],
    ['parking', 'left.pitch', 100, -5], ['parking', 'right.pitch', -100, -38], ['road', 'left.yaw', 100, 25],
    ['road', 'seatHeight', 3, 1.38], ['parking', 'seatFore', -1, .9]]) {
    const one = setCourseMirrorSetting(base, profile, name, value), two = setCourseMirrorSetting(one, profile, name, value);
    assert.deepEqual(one, two);
    const [side, axis] = name.split('.');
    assert.equal(axis ? one[profile][side][axis] : one[name], expected);
  }
  const partial = JSON.stringify({ version: 1, settings: { seatHeight: 99, seatFore: '1.1', road: {
    left: { yaw: 100, pitch: '0', extra: true }, right: { yaw: null, pitch: -100 } }, unknown: 'ignored' } });
  const restored = restoreCourseMirrorSettings(partial);
  assert.equal(restored.seatHeight, 1.38); assert.equal(restored.seatFore, base.seatFore);
  assert.equal(restored.road.left.yaw, 25); assert.equal(restored.road.left.pitch, base.road.left.pitch);
  assert.equal(restored.road.right.yaw, base.road.right.yaw); assert.equal(restored.road.right.pitch, -15);
  assert.deepEqual(restored.parking, base.parking); assert.ok(!('unknown' in restored));
  assert.throws(() => resolveCourseMirrorSettings(base, 'other'), RangeError);
  assert.throws(() => recommendCourseMirrorSettings(base, 'other'), RangeError);
});

function movingPose({ reverse = false, turn = null, hill = false } = {}) {
  const chapter = { id: hill ? 'hill-start' : 'reverse-parking', sceneType: hill ? 'hill' : 'parking',
    poses: [{ x: 0, z: -14, t: 0 }, { x: 0, z: hill ? 80 : 5, t: 40 }] };
  let state = createCourseDrivingSession(chapter, { x: 0, z: hill ? 12 : 0, heading: hill ? .65 : 0,
    speed: reverse ? -1 : 1, steer: 0, gear: reverse ? 'R' : '1' });
  for (let i = 0; i < 21; i++) state = stepCourseDriving(state, {
    forward: !reverse, reverse, left: turn === 'left', right: turn === 'right',
  }, 1 / 60);
  return courseDrivingPose(state);
}

function opticalFixture(t, settings) {
  const world = new THREE.Scene(), carModel = createTrainingCar({ world });
  const viewport = new THREE.Vector4(0, 0, 800, 500), scissor = new THREE.Vector4();
  const renderer = { calls: [], target: null, scissorTest: false, autoClear: true,
    shadowMap: { autoUpdate: false }, clippingPlanes: [], localClippingEnabled: false,
    getPixelRatio: () => 1, getRenderTarget() { return this.target; }, setRenderTarget(value) { this.target = value; },
    getViewport(value) { return value.copy(viewport); }, setViewport(value) { viewport.copy(value); },
    getScissor(value) { return value.copy(scissor); }, setScissor(value) { scissor.copy(value); },
    getScissorTest() { return this.scissorTest; }, setScissorTest(value) { this.scissorTest = value; },
    render(scene, camera) { this.calls.push(camera.clone()); },
  };
  const mirrors = createCourseMirrorRenderer({ renderer, world, carModel, settings });
  t.after(() => {
    mirrors.dispose(); const geometries = new Set(), materials = new Set();
    world.traverse(object => { if (object.geometry) geometries.add(object.geometry); if (object.material) materials.add(object.material); });
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
  });
  return { carModel, renderer, mirrors, capture(pose) {
    carModel.car.position.set(pose.x, CAR_VISUAL_ROOT_Y + pose.y, pose.z);
    carModel.car.quaternion.setFromEuler(new THREE.Euler(pose.pitch, pose.heading, 0, 'YXZ'));
    carModel.car.updateMatrixWorld(true); renderer.calls.length = 0; mirrors.prepare({ dirty: true });
    return renderer.calls;
  } };
}

test('manual forward/reverse turns preserve world stripe projection in both mirrors without an extra horizontal flip', t => {
  const config = createCourseMirrorSettings();
  for (const profile of ['road', 'parking']) {
    const settings = resolveCourseMirrorSettings(config, profile), fixture = opticalFixture(t, settings);
    for (const reverse of [false, true]) for (const turn of ['left', 'right']) {
      const pose = movingPose({ reverse, turn }), cameras = fixture.capture(pose);
      assert.equal(Math.sign(pose.heading), (reverse ? -1 : 1) * (turn === 'left' ? 1 : -1), 'bicycle yaw must reverse with travel direction');
      for (const [index, side] of ['left', 'right'].entries()) {
        const optics = fixture.mirrors.opticsFor(side), sign = side === 'left' ? 1 : -1;
        for (const [x, y, z] of [[sign * 1.15, .03, -3.2], [sign * 3.5, 1, -10], [sign * 3.5, 1, -30]]) {
          const point = new THREE.Vector3(x, y, z), gpu = point.clone().project(cameras[index]);
          // Independently express a fixed world reference in the car's optical
          // coordinates, then use the pinhole's scalar dot-product projection.
          const local = point.clone().applyMatrix4(fixture.carModel.car.matrixWorld.clone().invert());
          local.y += CAR_VISUAL_ROOT_Y;
          const expected = sourceUV(optics, { x: local.x - optics.position.x, y: local.y - optics.position.y, z: local.z - optics.position.z });
          assert.ok(Math.abs((gpu.x + 1) / 2 - expected.u) < 1e-9, `${profile}/${side}/${reverse}/${turn}: world-reference horizontal projection`);
          assert.ok(Math.abs((gpu.y + 1) / 2 - expected.v) < 1e-9, `${profile}/${side}/${reverse}/${turn}: world-reference vertical projection`);
        }
      }
    }
  }
  // A fixed near-ground stripe recedes upwards while moving forward and comes
  // down towards the driver while reversing. Test each aperture, not a guessed
  // global screen flip: the driver sits asymmetrically between the two mirrors.
  const parking = resolveCourseMirrorSettings(config, 'parking');
  for (const side of ['left', 'right']) {
    const sign = side === 'left' ? 1 : -1, point = { x: sign * 1.15, y: .03, z: -2 };
    const initial = projectMirrorPoint(createMirrorFrame(origin, side, parking), point);
    const forward = projectMirrorPoint(createMirrorFrame(movingPose(), side, parking), point);
    const reverse = projectMirrorPoint(createMirrorFrame(movingPose({ reverse: true }), side, parking), point);
    assert.ok(initial.visible && forward.visible && reverse.visible, `${side}: reference must actually fit the finite aperture`);
    assert.ok(forward.y < initial.y, `${side}: forward motion takes a fixed rear stripe towards the top`);
    assert.ok(reverse.y > initial.y, `${side}: reversing brings a fixed rear stripe towards the bottom`);
  }
});

test('manual hill yaw and pitch obey reflection at the real glass with one root-height compensation', t => {
  const settings = resolveCourseMirrorSettings(createCourseMirrorSettings(), 'road'), fixture = opticalFixture(t, settings);
  for (const reverse of [false, true]) for (const turn of ['left', 'right']) {
    const pose = movingPose({ hill: true, reverse, turn }), cameras = fixture.capture(pose);
    const eye = new THREE.Vector3(.39, settings.seatHeight - CAR_VISUAL_ROOT_Y, settings.seatFore).applyMatrix4(fixture.carModel.car.matrixWorld);
    for (const [index, side] of ['left', 'right'].entries()) {
      const surface = fixture.carModel.mirrorSurfaces[side], optics = fixture.mirrors.opticsFor(side);
      const vertices = surface.geometry.getAttribute('position'), normals = surface.geometry.getAttribute('normal'), uv = surface.geometry.getAttribute('uv');
      const normalMatrix = new THREE.Matrix3().getNormalMatrix(surface.matrixWorld);
      let maximumOriginError = 0;
      for (let i = 0; i < vertices.count; i++) {
        const point = new THREE.Vector3().fromBufferAttribute(vertices, i).applyMatrix4(surface.matrixWorld);
        const normal = new THREE.Vector3().fromBufferAttribute(normals, i).applyNormalMatrix(normalMatrix);
        const physicalRay = point.clone().sub(eye).normalize().reflect(normal).normalize();
        const sourceRay = new THREE.Vector3(uv.getX(i) * 2 - 1, uv.getY(i) * 2 - 1, .5).unproject(cameras[index]).sub(cameras[index].position).normalize();
        assert.ok(physicalRay.distanceTo(sourceRay) < 2e-7, `${side}: full car pose must preserve the optical reflection law`);
        maximumOriginError = Math.max(maximumOriginError, cameras[index].position.clone().sub(point).cross(physicalRay).length());
      }
      assert.ok(Math.abs(maximumOriginError - optics.maxRayError) < 1e-6, `${side}: pitch/height must not add parallax beyond the fitted convex-eye approximation`);
      // A near world marker also detects a misplaced source eye even if its
      // directions remain correct: a doubled root offset changes its UV.
      const point = new THREE.Vector3(side === 'left' ? 2.5 : -2.5, .03, 7), gpu = point.clone().project(cameras[index]);
      const local = point.clone().applyMatrix4(fixture.carModel.car.matrixWorld.clone().invert()); local.y += CAR_VISUAL_ROOT_Y;
      const expected = sourceUV(optics, { x: local.x - optics.position.x, y: local.y - optics.position.y, z: local.z - optics.position.z });
      assert.ok(Math.abs((gpu.x + 1) / 2 - expected.u) < 1e-9);
      assert.ok(Math.abs((gpu.y + 1) / 2 - expected.v) < 1e-9);
    }
  }
});
