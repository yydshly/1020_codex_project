import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTrainingCar, CAR_VISUAL_ROOT_Y } from './vehicle-visuals.js';
import { createCockpitSettings } from './cockpit.js';
import { createCourseInteriorMirror, courseInteriorMirrorFrame } from './course-interior-mirror.js';

function fixture(t) {
  const world = new THREE.Scene(), carModel = createTrainingCar({ world }); carModel.car.position.y = CAR_VISUAL_ROOT_Y;
  const settings = createCockpitSettings(), clipping = [new THREE.Plane(new THREE.Vector3(0, 1, 0), 10)];
  const renderer = { target: null, viewport: new THREE.Vector4(0, 0, 800, 450), scissor: new THREE.Vector4(1, 2, 300, 180), scissorTest: true,
    autoClear: false, shadowMap: { autoUpdate: true }, clippingPlanes: clipping, localClippingEnabled: true, calls: [],
    getRenderTarget() { return this.target; }, setRenderTarget(value) { this.target = value; },
    getViewport(value) { return value.copy(this.viewport); }, setViewport(value) { this.viewport.copy(value); },
    getScissor(value) { return value.copy(this.scissor); }, setScissor(value) { this.scissor.copy(value); },
    getScissorTest() { return this.scissorTest; }, setScissorTest(value) { this.scissorTest = value; },
    render(scene, camera) { this.calls.push({ camera: camera.clone(), clip: this.clippingPlanes, innerVisible: mirror.group.visible, outerVisible: carModel.externalMirrors.visible }); if (this.fail) throw new Error('interrupted interior draw'); },
  };
  const mirror = createCourseInteriorMirror({ renderer, world, carModel, settings }); world.updateMatrixWorld(true);
  t.after(() => { mirror.dispose(); const gs = new Set(), ms = new Set(); world.traverse(o => { if (o.geometry) gs.add(o.geometry); for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (m) ms.add(m); }); gs.forEach(g => g.dispose()); ms.forEach(m => m.dispose()); });
  return { world, carModel, settings, renderer, mirror, clipping };
}

test('interior reflection obeys the plane-mirror virtual-eye law throughout full car yaw and hill pitch', t => {
  const { carModel, mirror, renderer, settings } = fixture(t);
  for (const [heading, pitch, height] of [[0, 0, 0], [.8, -.1, 1.2], [-1.4, .08, .6]]) {
    carModel.car.position.set(10, CAR_VISUAL_ROOT_Y + height, -14);
    carModel.car.quaternion.setFromEuler(new THREE.Euler(pitch, heading, 0, 'YXZ'));
    mirror.prepare({ dirty: true });
    const frame = courseInteriorMirrorFrame(settings), camera = renderer.calls.at(-1).camera;
    const center = frame.center.clone(); center.y -= CAR_VISUAL_ROOT_Y; center.applyMatrix4(carModel.car.matrixWorld);
    const eye = frame.eye.clone(); eye.y -= CAR_VISUAL_ROOT_Y; eye.applyMatrix4(carModel.car.matrixWorld);
    const normal = frame.normal.clone().transformDirection(carModel.car.matrixWorld);
    assert.ok(Math.abs(camera.position.clone().sub(center).dot(normal) + eye.clone().sub(center).dot(normal)) < 1e-9);
    const positions = mirror.surface.geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i++) {
      const glass = new THREE.Vector3().fromBufferAttribute(positions, i).applyMatrix4(mirror.surface.matrixWorld);
      const reflected = glass.clone().sub(eye).normalize().reflect(normal);
      const source = glass.clone().sub(camera.position).normalize();
      assert.ok(reflected.distanceTo(source) < 1e-9, 'same-eye reflection, no extra flip or rear camera offset');
      const projected = glass.clone().project(camera); assert.ok(Math.abs(projected.x) < 1 && Math.abs(projected.y) < 1, 'all real glass corners fit the finite source capture');
    }
    const matrix = mirror.surface.material.uniforms.textureMatrix.value;
    const testPoint = new THREE.Vector3(.06, -.02, 0);
    const shader = new THREE.Vector4(testPoint.x, testPoint.y, 0, 1).applyMatrix4(matrix); shader.multiplyScalar(1 / shader.w);
    const projected = testPoint.clone().applyMatrix4(mirror.surface.matrixWorld).project(camera);
    assert.ok(Math.abs(shader.x - (projected.x + 1) / 2) < 1e-9); assert.ok(Math.abs(shader.y - (projected.y + 1) / 2) < 1e-9);
  }
});

test('the real driver sees the mirror before its frame and a central rear target through the real rear window', t => {
  const { mirror, carModel, world } = fixture(t), frame = mirror.getFrame();
  const virtualEye = frame.eye.clone().addScaledVector(frame.normal, -2 * frame.eye.clone().sub(frame.center).dot(frame.normal));
  const opaque = hit => { for (let o = hit.object; o; o = o.parent) if (!o.visible) return false; return !hit.object.material?.transparent; };
  function reflectedTarget(point) {
    const direction = point.clone().sub(virtualEye).normalize();
    const distance = frame.center.clone().sub(virtualEye).dot(frame.normal) / direction.dot(frame.normal);
    const glass = virtualEye.clone().addScaledVector(direction, distance), offset = glass.clone().sub(frame.center);
    assert.ok(Math.abs(offset.dot(frame.right)) < frame.width / 2 && Math.abs(offset.dot(frame.up)) < frame.height / 2, 'target must fit actual finite glass');
    const before = new THREE.Raycaster(frame.eye, glass.clone().sub(frame.eye).normalize(), .001, glass.distanceTo(frame.eye) + .003).intersectObject(carModel.car, true).find(opaque);
    assert.equal(before?.object, mirror.surface, 'mirror is mounted clear of roof, stem and rim');
    mirror.group.visible = false; carModel.externalMirrors.visible = false;
    const hits = new THREE.Raycaster(glass, direction, .002, glass.distanceTo(point) - .01).intersectObject(carModel.car, true).filter(opaque);
    mirror.group.visible = true; carModel.externalMirrors.visible = true; return hits;
  }
  world.updateMatrixWorld(true);
  assert.equal(reflectedTarget(new THREE.Vector3(0, 1.14, -10)).length, 0, 'the central rear road is visible through the real rear screen');
  assert.match(reflectedTarget(new THREE.Vector3(2.5, .7, -12))[0]?.object.name ?? '', /headrest/, 'real seats still block lower/side rear rays');
});

test('static interior mirrors cache, seat changes alter the eye but not glass, and interrupted draws restore state', t => {
  const { mirror, carModel, renderer, clipping } = fixture(t);
  assert.equal(mirror.prepare(), true); assert.equal(mirror.prepare(), false);
  const normal = mirror.getFrame().normal.clone(), eye = renderer.calls[0].camera.position.clone();
  mirror.setSettings({ seatHeight: 1.2, seatFore: 1.2 }); assert.equal(mirror.prepare(), true);
  assert.ok(renderer.calls.at(-1).camera.position.distanceTo(eye) > .05); assert.ok(mirror.getFrame().normal.distanceTo(normal) < 1e-12);
  const viewport = renderer.viewport.clone(), scissor = renderer.scissor.clone();
  carModel.externalMirrors.visible = false; renderer.fail = true; mirror.invalidate();
  assert.throws(() => mirror.prepare(), /interrupted interior/);
  assert.equal(mirror.group.visible, true); assert.equal(carModel.externalMirrors.visible, false);
  assert.equal(renderer.target, null); assert.deepEqual(renderer.viewport, viewport); assert.deepEqual(renderer.scissor, scissor);
  assert.equal(renderer.scissorTest, true); assert.equal(renderer.autoClear, false); assert.equal(renderer.shadowMap.autoUpdate, true);
  assert.strictEqual(renderer.clippingPlanes, clipping); assert.equal(renderer.localClippingEnabled, true);
  const call = renderer.calls.at(-1); assert.equal(call.innerVisible, false); assert.equal(call.outerVisible, false); assert.equal(call.clip.length, clipping.length + 1);
  const front = mirror.getFrame().center.clone().addScaledVector(mirror.getFrame().normal, .5);
  assert.ok(call.clip.at(-1).distanceToPoint(front) > 0, 'real reflecting side remains');
  assert.ok(call.clip.at(-1).distanceToPoint(call.camera.position) < 0, 'virtual eye to glass segment is clipped');
});

test('explicit interior adjustment follows the current eye and keeps rear-window visibility without moving its mounting centre', t => {
  const { mirror, carModel, renderer } = fixture(t);
  for (const [seatHeight, seatFore] of [[1.15, .9], [1.38, 1.3]]) {
    const before = mirror.getFrame().normal.clone(); mirror.setSettings({ seatHeight, seatFore });
    assert.ok(mirror.getFrame().normal.distanceTo(before) < 1e-12, 'seat movement alone leaves glass adjustment fixed');
    assert.equal(mirror.recommendForSeat().adjusted, true); mirror.prepare();
    const frame = mirror.getFrame(), glassCenter = mirror.surface.getWorldPosition(new THREE.Vector3());
    assert.ok(glassCenter.distanceTo(frame.center) < 1e-9, 'physical mirror mounting centre does not translate');
    const virtual = renderer.calls.at(-1).camera.position;
    const target = new THREE.Vector3(0, 1.14, -10), direction = target.clone().sub(virtual).normalize();
    const distance = frame.center.clone().sub(virtual).dot(frame.normal) / direction.dot(frame.normal);
    const hit = virtual.clone().addScaledVector(direction, distance), local = mirror.surface.worldToLocal(hit.clone());
    assert.ok(Math.abs(local.x) < frame.width / 2 && Math.abs(local.y) < frame.height / 2, 'rear-road reference remains inside actual adjusted finite glass');
    const normal = new THREE.Vector3(0, 0, 1).transformDirection(mirror.surface.matrixWorld);
    assert.ok(normal.distanceTo(frame.normal) < 1e-9, 'reported normal and rendered glass remain the same plane');
  }
  assert.equal(carModel.car.position.y, CAR_VISUAL_ROOT_Y);
});

test('interior adjustment keeps its roof anchor fixed and can restore an earlier exact mirror state', t => {
  const { mirror, carModel } = fixture(t), original = mirror.getAdjustment();
  const roofMount = new THREE.Vector3(0, 1.401, 1.595);
  const stem = mirror.group.getObjectByName('interior-mirror-stem');
  for (const [seatHeight, seatFore] of [[1.15, .9], [1.38, 1.3]]) {
    mirror.setSettings({ seatHeight, seatFore }); mirror.recommendForSeat(); carModel.car.updateMatrixWorld(true);
    const top = new THREE.Vector3(0, -stem.geometry.parameters.height / 2, 0).applyMatrix4(stem.matrixWorld);
    assert.ok(top.distanceTo(roofMount) < 1e-9, 'adjusting the mirror must not detach its support from the roof');
    assert.ok(mirror.getFrame().normal.distanceTo(courseInteriorMirrorFrame().normal) > .02);
  }
  assert.equal(mirror.setAdjustment(original), true);
  assert.ok(mirror.getFrame().normal.distanceTo(courseInteriorMirrorFrame().normal) < 1e-12);
  assert.deepEqual(mirror.getAdjustment(), original);
  const frozen = mirror.getAdjustment(); frozen.quaternion[0] = 42;
  assert.equal(mirror.setAdjustment(frozen), false);
  assert.equal(mirror.setAdjustment({ quaternion: [NaN, 0, 0, 1] }), false);
  assert.equal(mirror.setAdjustment({ quaternion: [1, 0, 0, 0] }), false);
  assert.deepEqual(mirror.getAdjustment(), original, 'bad or detached caller state cannot mutate the physical reflector');
});
