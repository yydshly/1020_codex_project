import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTrainingCar, CAR_VISUAL_ROOT_Y } from './vehicle-visuals.js';
import { createCockpitSettings, createMirrorFrame } from './cockpit.js';
import { createMirrorOptics } from './mirror-optics.js';
import { updateMirrorSurfaceGeometry } from './mirror-surface.js';
import { getCourseMirrorCollisionContext } from './course-mirror-collision.js';

const point = value => new THREE.Vector3(value.x, value.y, value.z);
const key = value => [value.x, value.y, value.z].map(n => Math.round(n * 1e7)).join(',');

function fixture(t) {
  const world = new THREE.Scene(), model = createTrainingCar({ world });
  model.car.position.y = CAR_VISUAL_ROOT_Y;
  t.after(() => {
    const geometries = new Set(), materials = new Set();
    world.traverse(object => {
      if (object.geometry) geometries.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) if (material) materials.add(material);
    });
    geometries.forEach(value => value.dispose()); materials.forEach(value => value.dispose());
  });
  return { world, model };
}

test('every physical housing, open rim and support uses its actual convex mesh vertices, with glass excluded', t => {
  const { model } = fixture(t), context = getCourseMirrorCollisionContext(model);
  assert.equal(context.egoAttachments.length, 14);
  for (const shape of context.egoAttachments) {
    assert.equal(shape.type, 'convex'); assert.ok(shape.vertices.length >= 100);
    assert.equal(shape.vertices.length, new Set(shape.vertices.map(key)).size);
    assert.equal(shape.side, shape.id.startsWith('left') ? 'left' : 'right');
    assert.equal(Math.sign(shape.center.x), shape.side === 'left' ? 1 : -1);
    assert.doesNotMatch(shape.id, /surface/);
    const mesh = model.car.getObjectByName(shape.id), positions = mesh.geometry.getAttribute('position');
    const expected = new Set();
    for (let i = 0; i < positions.count; i++) expected.add(key(new THREE.Vector3().fromBufferAttribute(positions, i).applyMatrix4(mesh.matrix)));
    assert.deepEqual(new Set(shape.vertices.map(key)), expected, `${shape.id}: no copied dimensions or invented solid box`);
    const axes = shape.axes.map(point), half = point(shape.halfSize), center = point(shape.center);
    for (const axis of axes) assert.ok(Math.abs(axis.length() - 1) < 1e-10);
    assert.ok(Math.max(Math.abs(axes[0].dot(axes[1])), Math.abs(axes[1].dot(axes[2])), Math.abs(axes[2].dot(axes[0]))) < 1e-10);
    for (const vertex of shape.vertices) {
      const offset = point(vertex).sub(center);
      for (let axis = 0; axis < 3; axis++) assert.ok(Math.abs(offset.dot(axes[axis])) <= half.getComponent(axis) + 1e-8);
    }
  }
});

test('world transform carries the root lift, yaw and hill pitch exactly once, while local hulls stay cached', t => {
  const { world, model } = fixture(t), initial = getCourseMirrorCollisionContext(model);
  for (const [heading, pitch, height] of [[.8, -.10, 1.2], [-1.45, .09, .5], [Math.PI, 0, 0]]) {
    world.position.set(-2, .23, 5); world.rotation.y = .17;
    model.car.position.set(4, CAR_VISUAL_ROOT_Y + height, -8);
    model.car.quaternion.setFromEuler(new THREE.Euler(pitch, heading, 0, 'YXZ'));
    const context = getCourseMirrorCollisionContext(model);
    const transform = new THREE.Matrix4().compose(point(context.egoTransform.position), new THREE.Quaternion(...['x', 'y', 'z', 'w'].map(k => context.egoTransform.quaternion[k])), new THREE.Vector3(1, 1, 1));
    assert.ok(point(context.egoTransform.position).distanceTo(model.car.getWorldPosition(new THREE.Vector3())) < 1e-10);
    for (let i = 0; i < context.egoAttachments.length; i++) {
      const shape = context.egoAttachments[i];
      assert.equal(shape, initial.egoAttachments[i], 'a vehicle move must not rebuild its fixed attachment hull');
      const mesh = model.car.getObjectByName(shape.id), source = mesh.geometry.getAttribute('position');
      const actual = new Set(shape.vertices.map(v => key(point(v).applyMatrix4(transform))));
      for (let j = 0; j < source.count; j++) assert.ok(actual.has(key(new THREE.Vector3().fromBufferAttribute(source, j).applyMatrix4(mesh.matrixWorld))), 'world hull must coincide with the rendered housing/support under pitch');
    }
  }
});

test('adjusting only the reflector and driver eye never turns or expands the fixed collision housing', t => {
  const { model } = fixture(t), initial = getCourseMirrorCollisionContext(model);
  const settings = createCockpitSettings(); settings.seatHeight = 1.15; settings.seatFore = 1.3;
  settings.left = { yaw: 22, pitch: -30 }; settings.right = { yaw: -3, pitch: 5 };
  for (const side of ['left', 'right']) {
    const frame = createMirrorFrame({ x: 0, z: 0, heading: 0 }, side, settings);
    updateMirrorSurfaceGeometry(model.mirrorSurfaces[side].geometry, frame, createMirrorOptics(frame), { rootY: CAR_VISUAL_ROOT_Y });
  }
  const adjusted = getCourseMirrorCollisionContext(model);
  adjusted.egoAttachments.forEach((shape, i) => assert.equal(shape, initial.egoAttachments[i]));
});

test('mesh changes invalidate the actual hull cache and descendant transforms preserve support angles', t => {
  const { model } = fixture(t), initial = getCourseMirrorCollisionContext(model);
  model.externalMirrors.position.set(.03, -.02, .04); model.externalMirrors.rotation.set(.04, -.08, .02);
  const moved = getCourseMirrorCollisionContext(model);
  const relative = model.externalMirrors.matrix.clone();
  for (let i = 0; i < moved.egoAttachments.length; i++) {
    const a = initial.egoAttachments[i], b = moved.egoAttachments[i]; assert.notEqual(a, b);
    a.vertices.forEach((vertex, j) => assert.ok(point(vertex).applyMatrix4(relative).distanceTo(point(b.vertices[j])) < 1e-10));
  }
  const mesh = model.car.getObjectByName('left-mirror-stalk'); mesh.geometry.translate(.002, 0, 0);
  const modified = getCourseMirrorCollisionContext(model);
  assert.notEqual(modified.egoAttachments.find(s => s.id === mesh.name), moved.egoAttachments.find(s => s.id === mesh.name));
  assert.equal(modified.egoAttachments.find(s => s.id === 'right-mirror-stalk'), moved.egoAttachments.find(s => s.id === 'right-mirror-stalk'));
});

test('rounded corner empty space and height clearances remain outside the real hull instead of becoming an inflated body', t => {
  const { model } = fixture(t), context = getCourseMirrorCollisionContext(model);
  const shape = context.egoAttachments.find(s => s.id === 'left-mirror-backing');
  const axes = shape.axes.map(point), direction = axes.reduce((sum, axis) => sum.add(axis), new THREE.Vector3()).normalize();
  const corner = point(shape.center);
  axes.forEach((axis, i) => corner.addScaledVector(axis, point(shape.halfSize).getComponent(i)));
  const support = Math.max(...shape.vertices.map(v => point(v).dot(direction)));
  assert.ok(corner.dot(direction) - support > .002, 'actual convex hull must leave a real empty region inside the OBB corner');
  const orientation = new THREE.Quaternion(...['x', 'y', 'z', 'w'].map(k => context.egoTransform.quaternion[k]));
  const heights = context.egoAttachments.flatMap(s => s.vertices.map(v => point(v).applyQuaternion(orientation).add(point(context.egoTransform.position)).y));
  const lowest = Math.min(...heights), highest = Math.max(...heights);
  assert.ok(lowest > .88 && highest < 1.25, 'collision height follows the actual elevated mirror assembly');
  assert.ok(.7 < lowest, 'a short bollard below all supports cannot hit a mirror');
  assert.ok(1.4 > highest, 'an overhead object above all mirrors cannot hit them');
  model.externalMirrors.visible = false;
  assert.equal(getCourseMirrorCollisionContext(model).egoAttachments.length, 0);
});
