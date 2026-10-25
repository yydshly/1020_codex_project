import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createCockpitSettings, createMirrorFrame, sampleMirrorRay, setCockpitSetting } from './cockpit.js';
import { createMirrorOptics } from './mirror-optics.js';
import { createMirrorSurfaceGeometry, updateMirrorSurfaceGeometry } from './mirror-surface.js';

const localPose = { x: 0, z: 0, heading: 0 };
const vec = value => new THREE.Vector3(value.x, value.y, value.z);

test('physical mirror vertices, outward normals and source UVs match the same finite optical surface', () => {
  for (const side of ['left', 'right']) {
    const frame = createMirrorFrame(localPose, side, createCockpitSettings()), optics = createMirrorOptics(frame);
    const geometry = createMirrorSurfaceGeometry(frame, optics, { rootY: 0.015 });
    const positions = geometry.getAttribute('position'), normals = geometry.getAttribute('normal');
    assert.deepEqual([...geometry.getAttribute('uv').array], [...optics.uvs]);
    for (let row = 0; row <= optics.rows; row++) for (let column = 0; column <= optics.columns; column++) {
      const index = row * (optics.columns + 1) + column;
      const ray = sampleMirrorRay(frame, -1 + 2 * column / optics.columns, 1 - 2 * row / optics.rows);
      const point = new THREE.Vector3().fromBufferAttribute(positions, index); point.y += .015;
      assert.ok(point.distanceTo(vec(ray.origin)) < 1e-6);
      assert.ok(new THREE.Vector3().fromBufferAttribute(normals, index).dot(vec(ray.normal)) > 1 - 1e-6);
    }
    const indices = geometry.index.array;
    for (let index = 0; index < indices.length; index += 3) {
      const a = new THREE.Vector3().fromBufferAttribute(positions, indices[index]);
      const b = new THREE.Vector3().fromBufferAttribute(positions, indices[index + 1]);
      const c = new THREE.Vector3().fromBufferAttribute(positions, indices[index + 2]);
      const normal = b.sub(a).cross(c.sub(a)).normalize();
      assert.ok(normal.dot(vec(frame.normal)) > .99, 'FrontSide triangle winding must face the driver.');
    }
    assert.ok(geometry.boundingBox && geometry.boundingSphere.radius > 0);
    geometry.dispose();
  }
});

test('a vehicle-mounted FrontSide surface is hit at the correct world location after translation and rotation', () => {
  const settings = createCockpitSettings(), pose = { x: 4, z: -2, heading: 1.13 }, rootY = .015;
  for (const side of ['left', 'right']) {
    const localFrame = createMirrorFrame(localPose, side, settings), worldFrame = createMirrorFrame(pose, side, settings);
    const geometry = createMirrorSurfaceGeometry(localFrame, createMirrorOptics(localFrame), { rootY });
    const surface = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.FrontSide }));
    const car = new THREE.Group(); car.position.set(pose.x, rootY, pose.z); car.rotation.y = pose.heading; car.add(surface); car.updateMatrixWorld(true);
    const direction = vec(worldFrame.center).sub(vec(worldFrame.eye)).normalize();
    const ray = new THREE.Raycaster(vec(worldFrame.eye), direction, .08, 10);
    const hits = ray.intersectObject(surface);
    assert.ok(hits.length > 0);
    assert.ok(hits[0].point.distanceTo(vec(worldFrame.center)) < 1e-5);
    geometry.dispose(); surface.material.dispose();
  }
});

test('root-height compensation updates in place; moving only the eye changes UVs without moving physical glass', () => {
  const settings = createCockpitSettings(), frame = createMirrorFrame(localPose, 'left', settings), optics = createMirrorOptics(frame);
  const geometry = createMirrorSurfaceGeometry(frame, optics, { rootY: .015 });
  const positions = geometry.getAttribute('position'), before = [...positions.array], oldUV = [...geometry.getAttribute('uv').array];
  const changedFrame = createMirrorFrame(localPose, 'left', setCockpitSetting(settings, 'seatHeight', 1.38));
  updateMirrorSurfaceGeometry(geometry, changedFrame, createMirrorOptics(changedFrame), { rootY: .015 });
  assert.equal(positions, geometry.getAttribute('position'));
  assert.deepEqual([...positions.array], before);
  assert.notDeepEqual([...geometry.getAttribute('uv').array], oldUV);
  updateMirrorSurfaceGeometry(geometry, frame, optics, { rootY: .10 });
  for (let index = 0; index < positions.count; index++) {
    assert.ok(Math.abs(positions.getY(index) + .10 - before[index * 3 + 1] - .015) < 1e-6);
  }
  geometry.dispose();
});

test('mismatched geometry and invalid root heights cannot silently shift or corrupt the mirror', () => {
  const frame = createMirrorFrame(localPose, 'right'), optics = createMirrorOptics(frame), geometry = new THREE.PlaneGeometry(.19, .12);
  assert.throws(() => updateMirrorSurfaceGeometry(geometry, frame, optics), RangeError);
  assert.throws(() => createMirrorSurfaceGeometry(frame, optics, { rootY: NaN }), RangeError);
  geometry.dispose();
});
