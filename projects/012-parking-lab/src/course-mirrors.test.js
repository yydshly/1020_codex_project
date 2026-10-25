import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTrainingCar, CAR_VISUAL_ROOT_Y } from './vehicle-visuals.js';
import { createCourseOperationVisuals } from './course-operation-visuals.js';
import { createMirrorFrame, sampleMirrorRay, projectMirrorPoint } from './cockpit.js';
import { createCourseMirrorSettings, resolveCourseMirrorSettings } from './course-mirror-settings.js';
import { createCourseMirrorRenderer, courseMirrorClipPlane } from './course-mirrors.js';
import { driverLookAngles, driverVerticalFov } from './driver-view.js';

function fixture(t, { course = true } = {}) {
  const world = new THREE.Scene(), carModel = createTrainingCar({ world });
  carModel.car.position.y = CAR_VISUAL_ROOT_Y;
  if (course) createCourseOperationVisuals(carModel).update({ gear: '1' }, null, {});
  const viewport = new THREE.Vector4(0, 0, 900, 500), scissor = new THREE.Vector4(4, 5, 200, 100);
  const initialClip = [new THREE.Plane(new THREE.Vector3(0, 1, 0), 20)];
  const renderer = { target: null, viewport, scissor, scissorTest: false, autoClear: true,
    shadowMap: { autoUpdate: true }, clippingPlanes: initialClip, localClippingEnabled: true, calls: [],
    domElement: { getBoundingClientRect: () => ({ left: 10, top: 20, width: 900, height: 500 }) },
    getPixelRatio: () => 1,
    getRenderTarget() { return this.target; }, setRenderTarget(value) { this.target = value; },
    getViewport(value) { return value.copy(this.viewport); }, setViewport(...value) { if (value[0]?.isVector4) this.viewport.copy(value[0]); else this.viewport.set(...value); },
    getScissor(value) { return value.copy(this.scissor); }, setScissor(...value) { if (value[0]?.isVector4) this.scissor.copy(value[0]); else this.scissor.set(...value); },
    getScissorTest() { return this.scissorTest; }, setScissorTest(value) { this.scissorTest = value; },
    render(scene, camera) {
      this.calls.push({ scene, camera: camera.clone(), clip: this.clippingPlanes, mirrorVisible: carModel.externalMirrors.visible });
      if (this.fail) throw new Error('render interrupted');
    },
  };
  const settings = resolveCourseMirrorSettings(createCourseMirrorSettings(), 'road');
  const mirrors = createCourseMirrorRenderer({ renderer, world, carModel, settings });
  t.after(() => {
    mirrors.dispose();
    const geometries = new Set(), materials = new Set();
    world.traverse(object => { if (object.geometry) geometries.add(object.geometry); if (object.material) materials.add(object.material); });
    geometries.forEach(value => value.dispose()); materials.forEach(value => value.dispose());
  });
  world.updateMatrixWorld(true);
  return { world, carModel, renderer, mirrors, settings, initialClip };
}

test('course sources follow full car transform and refresh on static setting changes, while unchanged frames cache', t => {
  const { carModel, renderer, mirrors, settings } = fixture(t);
  assert.equal(mirrors.prepare(), true); assert.equal(renderer.calls.length, 2);
  assert.equal(mirrors.prepare(), false); assert.equal(renderer.calls.length, 2);
  carModel.car.position.set(15, CAR_VISUAL_ROOT_Y + 1.2, -9);
  carModel.car.quaternion.setFromEuler(new THREE.Euler(-.10, .7, .025)); carModel.car.updateMatrixWorld(true);
  assert.equal(mirrors.prepare(), true);
  const optics = mirrors.opticsFor('left');
  const expected = new THREE.Vector3(optics.position.x, optics.position.y - CAR_VISUAL_ROOT_Y, optics.position.z).applyMatrix4(carModel.car.matrixWorld);
  assert.ok(renderer.calls[2].camera.position.distanceTo(expected) < 1e-9);
  const adjusted = { ...settings, seatHeight: 1.20, left: { ...settings.left, yaw: 12 } };
  mirrors.setSettings(adjusted); assert.equal(mirrors.prepare(), true);
  assert.equal(mirrors.getSettings().seatHeight, 1.20);
  assert.notEqual(mirrors.opticsFor('left').position.y, optics.position.y);
  mirrors.getSettings().left.yaw = 100; assert.equal(mirrors.getSettings().left.yaw, 12);
  mirrors.invalidate(); assert.equal(mirrors.prepare(), true);
});

test('source capture restores all renderer/visibility state, including an interrupted draw and existing clipping', t => {
  const { renderer, mirrors, carModel, initialClip } = fixture(t);
  carModel.mirrorSurfaces.right.visible = false; renderer.fail = true;
  const viewport = renderer.viewport.clone(), scissor = renderer.scissor.clone();
  assert.throws(() => mirrors.prepare(), /interrupted/);
  assert.equal(carModel.externalMirrors.visible, true); assert.equal(carModel.mirrorSurfaces.right.visible, false);
  assert.equal(renderer.target, null); assert.deepEqual(renderer.viewport, viewport); assert.deepEqual(renderer.scissor, scissor);
  assert.equal(renderer.scissorTest, false); assert.equal(renderer.autoClear, true); assert.equal(renderer.shadowMap.autoUpdate, true);
  assert.strictEqual(renderer.clippingPlanes, initialClip); assert.equal(renderer.localClippingEnabled, true);
  assert.equal(renderer.calls[0].mirrorVisible, false); assert.equal(renderer.calls[0].clip.length, initialClip.length + 1);
});

test('teaching magnification uses identical physical UVs and restores renderer viewport without flipping or expanding the field', t => {
  const { mirrors, renderer, carModel } = fixture(t);
  const element = { getBoundingClientRect: () => ({ left: 100, top: 70, width: 480, height: 300 }) };
  mirrors.prepare({ zoomSide: 'left', zoomElement: element });
  const optics = mirrors.opticsFor('left'), oldFov = optics.fov, viewport = renderer.viewport.clone();
  mirrors.renderOverlay({ side: 'left', element, projection: 'unfolded' });
  const overlay = renderer.calls.at(-1).scene.children[0];
  assert.deepEqual([...overlay.geometry.getAttribute('uv').array], [...carModel.mirrorSurfaces.left.geometry.getAttribute('uv').array]);
  assert.strictEqual(overlay.material.map, carModel.mirrorSurfaces.left.material.map);
  assert.equal(mirrors.opticsFor('left').fov, oldFov); assert.deepEqual(renderer.viewport, viewport);
});

function independentDriverCamera(settings, side, matrix, width = 900, height = 500) {
  const look = driverLookAngles(settings, side), camera = new THREE.PerspectiveCamera(driverVerticalFov(width / height), width / height, .06, 450);
  camera.position.set(.39, settings.seatHeight - CAR_VISUAL_ROOT_Y, settings.seatFore).applyMatrix4(matrix);
  const forward = new THREE.Vector3(Math.sin(look.yaw), Math.tan(look.pitch), Math.cos(look.yaw)).transformDirection(matrix);
  camera.up.set(0, 1, 0).transformDirection(matrix); camera.lookAt(camera.position.clone().add(forward)); camera.updateMatrixWorld(true);
  return camera;
}

test('default magnification keeps the right mirror oblique with isotropic scaling and the original perspective divisor', t => {
  const { mirrors, renderer, carModel, world, settings } = fixture(t);
  const element = { getBoundingClientRect: () => ({ left: 100, top: 70, width: 480, height: 300 }) };
  mirrors.prepare({ zoomSide: 'right', zoomElement: element });
  const surface = carModel.mirrorSurfaces.right, texture = surface.material.map;
  const optics = mirrors.opticsFor('right'), sourceFov = optics.fov;
  mirrors.renderOverlay({ side: 'right', element });
  const draw = renderer.calls.at(-1), zoom = draw.camera;
  assert.strictEqual(draw.scene, world, 'the default redraws the real glass, housing and occluders instead of a flattened UV plane');
  assert.equal(draw.mirrorVisible, true); assert.strictEqual(surface.material.map, texture); assert.equal(mirrors.opticsFor('right').fov, sourceFov);
  const base = independentDriverCamera(settings, 'right', carModel.car.matrixWorld);
  assert.ok(zoom.position.distanceTo(base.position) < 1e-10);
  assert.ok(zoom.quaternion.angleTo(base.quaternion) < 1e-7);
  for (const index of [3, 7, 11, 15]) assert.equal(zoom.projectionMatrix.elements[index], base.projectionMatrix.elements[index], 'clip.w must remain unchanged for perspective-correct UV interpolation');
  const points = [0, 24, 16 * 25].map(index => new THREE.Vector3().fromBufferAttribute(surface.geometry.getAttribute('position'), index).applyMatrix4(surface.matrixWorld));
  const pixels = (point, camera, width, height) => { const value = point.clone().project(camera); return new THREE.Vector2(value.x * width / 2, -value.y * height / 2); };
  const before = points.map(point => pixels(point, base, 900, 500)), after = points.map(point => pixels(point, zoom, 480, 300));
  const scaleX = (after[1].x - after[0].x) / (before[1].x - before[0].x);
  const scaleY = (after[2].y - after[0].y) / (before[2].y - before[0].y);
  assert.ok(Math.abs(scaleX - scaleY) < 1e-9, 'screen magnification must not stretch the slanted physical frame');
  const angle = values => Math.atan2(values[1].y - values[0].y, values[1].x - values[0].x);
  assert.ok(angle(before) < -.03, 'right mirror must have a real sloping upper edge from this eye');
  assert.ok(Math.abs(angle(before) - angle(after)) < 1e-10, 'the actual upper-edge slant must survive magnification');
});

test('each magnified mirror remains tied to the same driver eye on a hill and restores all render state after failure', t => {
  const { mirrors, renderer, carModel, settings, initialClip } = fixture(t);
  const element = { getBoundingClientRect: () => ({ left: 100, top: 70, width: 480, height: 300 }) };
  carModel.car.position.set(15, CAR_VISUAL_ROOT_Y + 1.2, -9);
  carModel.car.quaternion.setFromEuler(new THREE.Euler(-.10, .7, .025)); carModel.car.updateMatrixWorld(true);
  mirrors.prepare();
  const viewport = renderer.viewport.clone(), scissor = renderer.scissor.clone();
  for (const side of ['left', 'right']) {
    mirrors.renderOverlay({ side, element });
    const draw = renderer.calls.at(-1), base = independentDriverCamera(settings, side, carModel.car.matrixWorld);
    assert.ok(draw.camera.position.distanceTo(base.position) < 1e-9);
    assert.ok(draw.camera.getWorldDirection(new THREE.Vector3()).distanceTo(base.getWorldDirection(new THREE.Vector3())) < 1e-9, `${side}: the selected mirror must not use the opposite mirror's head turn`);
    const firstProjection = draw.camera.projectionMatrix.clone();
    mirrors.renderOverlay({ side, element });
    assert.deepEqual(renderer.calls.at(-1).camera.projectionMatrix, firstProjection, 'an unchanged eye and mirror must have stable perspective independent of the main scene camera');
  }
  renderer.fail = true; assert.throws(() => mirrors.renderOverlay({ side: 'right', element }), /interrupted/);
  assert.deepEqual(renderer.viewport, viewport); assert.deepEqual(renderer.scissor, scissor);
  assert.equal(renderer.target, null); assert.equal(renderer.autoClear, true); assert.equal(renderer.scissorTest, false);
  assert.equal(renderer.shadowMap.autoUpdate, true); assert.strictEqual(renderer.clippingPlanes, initialClip); assert.equal(renderer.localClippingEnabled, true);
});

test('default perspective magnification retains actual housing occlusion instead of exposing clipped inner glass', t => {
  const { mirrors, renderer, carModel, settings } = fixture(t);
  const element = { getBoundingClientRect: () => ({ left: 100, top: 70, width: 480, height: 300 }) };
  mirrors.prepare(); mirrors.renderOverlay({ side: 'right', element });
  const draw = renderer.calls.at(-1), surface = carModel.mirrorSurfaces.right;
  const frame = createMirrorFrame({ x: 0, z: 0, heading: 0 }, 'right', settings);
  const eye = draw.camera.position.clone(); let housingHits = 0, glassHits = 0;
  for (const u of [-1, -.98, -.94, -.85, -.7, 0, .7, .94, .98, 1]) for (const v of [-1, -.8, 0, .8, 1]) {
    const local = sampleMirrorRay(frame, u, v).origin, point = new THREE.Vector3(local.x, local.y - CAR_VISUAL_ROOT_Y, local.z).applyMatrix4(carModel.car.matrixWorld);
    const direction = point.clone().sub(eye), hit = new THREE.Raycaster(eye, direction.clone().normalize(), .015, direction.length() + .003)
      .intersectObject(draw.scene, true).find(hit => {
        for (let node = hit.object; node; node = node.parent) if (!node.visible) return false;
        return !hit.object.material?.transparent;
      });
    if (hit?.object === surface) glassHits++;
    if (/right-mirror-(rim|backing)/.test(hit?.object.name || '')) housingHits++;
  }
  assert.ok(housingHits > 0, 'real rim/backing must continue to occlude its physical edge');
  assert.ok(glassHits > 10, 'usable glass must remain visible from the fixed eye');
});

test('road mirrors retain a small real inner body strip and reveal actual adjacent rear traffic at 10 and 30 metres', t => {
  const { mirrors, world, carModel, settings } = fixture(t); carModel.externalMirrors.visible = false;
  const opaque = object => { for (let node = object; node; node = node.parent) if (!node.visible) return false; return !object.material?.transparent; };
  world.updateMatrixWorld(true);
  for (const side of ['left', 'right']) {
    const sign = side === 'left' ? 1 : -1, frame = createMirrorFrame({ x: 0, z: 0, heading: 0 }, side, settings), optics = mirrors.opticsFor(side);
    const origin = new THREE.Vector3(optics.position.x, optics.position.y, optics.position.z), clip = courseMirrorClipPlane(frame, carModel.car.matrixWorld);
    let body = 0;
    for (let row = 0; row < 24; row++) for (let col = 0; col < 40; col++) {
      const u = (col + .5) / 40, ray = sampleMirrorRay(frame, -1 + 2 * u, 1 - 2 * (row + .5) / 24);
      const hit = new THREE.Raycaster(origin, new THREE.Vector3(ray.direction.x, ray.direction.y, ray.direction.z), .04, 60)
        .intersectObject(carModel.car, true).find(hit => opaque(hit.object) && clip.distanceToPoint(hit.point) >= 0);
      if (hit && /body-shell|front-driver-door-panel/.test(hit.object.name)) {
        body++; assert.ok(side === 'left' ? u >= .88 : u <= .12, 'body must remain at its own inner edge');
      }
    }
    assert.ok(body / 960 > .015 && body / 960 < .08, `${side}: actual body strip must be nonzero and restrained`);
    for (const distance of [10, 30]) {
      const point = { x: sign * 3.5, y: 1, z: -distance }, projected = projectMirrorPoint(frame, point);
      assert.equal(projected.visible, true);
      const origin = new THREE.Vector3(projected.origin.x, projected.origin.y, projected.origin.z), direction = new THREE.Vector3(point.x, point.y, point.z).sub(origin);
      assert.equal(new THREE.Raycaster(origin, direction.clone().normalize(), .015, direction.length() - .02).intersectObject(carModel.car, true).some(hit => opaque(hit.object)), false);
    }
  }
});

test('the actual driver eye sees both inner mirror references without a support arm crossing the glass', t => {
  const { mirrors, carModel, world, settings } = fixture(t);
  for (const side of ['left', 'right']) mirrors.opticsFor(side);
  world.updateMatrixWorld(true);
  for (const side of ['left', 'right']) {
    const frame = createMirrorFrame({ x: 0, z: 0, heading: 0 }, side, settings);
    const eye = new THREE.Vector3(frame.eye.x, frame.eye.y, frame.eye.z);
    for (const v of [-.45, -.3, 0, .3]) {
      const origin = sampleMirrorRay(frame, side === 'left' ? .88 : -.88, v).origin;
      const direction = new THREE.Vector3(origin.x, origin.y, origin.z).sub(eye);
      const hit = new THREE.Raycaster(eye, direction.clone().normalize(), .015, direction.length() + .003)
        .intersectObject(carModel.car, true).find(hit => hit.object.visible && !hit.object.material?.transparent);
      assert.equal(hit?.object, carModel.mirrorSurfaces[side], `${side} inner reference obstructed by ${hit?.object.name}`);
    }
  }
});

test('mirror clipping removes virtual-eye-side false reflections but keeps reflected scenery and every convex edge', t => {
  const { mirrors, settings, carModel } = fixture(t);
  for (const side of ['left', 'right']) {
    const frame = createMirrorFrame({ x: 0, z: 0, heading: 0 }, side, settings), optics = mirrors.opticsFor(side);
    const plane = courseMirrorClipPlane(frame, carModel.car.matrixWorld);
    const falseObject = new THREE.Vector3(optics.position.x, optics.position.y, optics.position.z)
      .addScaledVector(new THREE.Vector3(optics.forward.x, optics.forward.y, optics.forward.z), .15);
    assert.ok(plane.distanceToPoint(falseObject) < -.10, 'geometry before the real reflector must be discarded');
    const center = sampleMirrorRay(frame, 0, 0), realPoint = new THREE.Vector3(center.origin.x, center.origin.y, center.origin.z)
      .addScaledVector(new THREE.Vector3(center.direction.x, center.direction.y, center.direction.z), 5);
    assert.ok(plane.distanceToPoint(realPoint) > 0);
    for (const u of [-1, 0, 1]) for (const v of [-1, 0, 1]) {
      const ray = sampleMirrorRay(frame, u, v);
      assert.ok(plane.distanceToPoint(new THREE.Vector3(ray.origin.x, ray.origin.y, ray.origin.z)) >= 0);
    }
  }
});

test('recognition measures the actual physical/driver-cropped/unfolded displays, caches an unchanged view and preserves renderer state', t => {
  const { mirrors, renderer, carModel, settings, initialClip } = fixture(t);
  mirrors.prepare();
  const camera = independentDriverCamera(settings, 'right', carModel.car.matrixWorld);
  const canvasRect = { left: 10, top: 20, width: 900, height: 500 }, displayRect = { left: 100, top: 70, width: 310, height: 196 };
  const before = { viewport: renderer.viewport.clone(), scissor: renderer.scissor.clone(), calls: renderer.calls.length };
  const normal = mirrors.recognize({ side: 'right', camera, canvasRect });
  assert.equal(normal.pixelMeasurement, 'actual-camera');
  assert.strictEqual(mirrors.recognize({ side: 'right', camera, canvasRect }), normal, 'unchanged paused recognition returns its cached evidence');
  const zoom = mirrors.recognize({ side: 'right', camera, canvasRect, displayRect });
  assert.equal(zoom.pixelMeasurement, 'actual-camera');
  assert.ok(zoom.body.pixelSpan > normal.body.pixelSpan * 2);
  assert.equal(zoom.body.coverage, normal.body.coverage); assert.equal(zoom.body.visibleSamples, normal.body.visibleSamples);
  const unfolded = mirrors.recognize({ side: 'right', camera, canvasRect, displayRect, projection: 'unfolded' });
  assert.equal(unfolded.pixelMeasurement, 'unfolded-identical-aperture');
  assert.equal(unfolded.body.coverage, normal.body.coverage);
  assert.equal(renderer.calls.length, before.calls, 'recognition performs no hidden GPU render passes');
  assert.deepEqual(renderer.viewport, before.viewport); assert.deepEqual(renderer.scissor, before.scissor);
  assert.strictEqual(renderer.clippingPlanes, initialClip); assert.equal(renderer.target, null); assert.equal(carModel.externalMirrors.visible, true);
});

test('recognition does not claim a body reference visible on screen when the real driver camera looks away', t => {
  const { mirrors, carModel, settings } = fixture(t); mirrors.prepare();
  const camera = independentDriverCamera(settings, 'right', carModel.car.matrixWorld);
  camera.lookAt(camera.position.clone().add(new THREE.Vector3(0, 0, 10))); camera.updateMatrixWorld(true);
  const result = mirrors.recognize({ side: 'right', camera, canvasRect: { width: 900, height: 500 } });
  assert.equal(result.body.visible, false); assert.equal(result.body.readable, false); assert.equal(result.body.reason, 'not-on-screen');
});
