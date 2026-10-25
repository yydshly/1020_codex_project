import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CAR } from './vehicle.js';
import { createCockpitSettings, createMirrorFrame, driverEye, sampleMirrorRay } from './cockpit.js';
import { CAR_VISUAL_ROOT_Y, createTrainingCar } from './vehicle-visuals.js';
import { createMirrorOptics } from './mirror-optics.js';
import { updateMirrorSurfaceGeometry } from './mirror-surface.js';
import { recommendMirrorSettings } from './mirror-fit.js';

function fixture(t) {
  const world = new THREE.Scene(), model = createTrainingCar({ world });
  model.car.position.y = CAR_VISUAL_ROOT_Y; world.updateMatrixWorld(true);
  t.after(() => {
    const geometries = new Set(), materials = new Set();
    model.car.traverse(object => {
      if (object.geometry) geometries.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) if (material) materials.add(material);
    });
    geometries.forEach(value => value.dispose()); materials.forEach(value => value.dispose());
  });
  const eye = driverEye({ x: 0, z: 0, heading: 0 }, createCockpitSettings());
  const eyeVector = new THREE.Vector3(eye.x, eye.y, eye.z);
  function visibleHits(target) {
    const offset = target.clone().sub(eyeVector);
    const ray = new THREE.Raycaster(eyeVector, offset.clone().normalize(), 0, offset.length() + .003);
    return ray.intersectObject(model.car, true).filter(hit => {
      const material = hit.object.material;
      return !material.transparent || material.opacity >= .95;
    });
  }
  return { world, model, visibleHits };
}

test('mirror support brackets leave the real driver eye aperture clear in legacy default and recommended parking settings', t => {
  const { model, world } = fixture(t), defaults = createCockpitSettings();
  for (const settings of [defaults, recommendMirrorSettings(defaults).settings]) {
    for (const side of ['left', 'right']) {
      const frame = createMirrorFrame({ x: 0, z: 0, heading: 0 }, side, settings);
      updateMirrorSurfaceGeometry(model.mirrorSurfaces[side].geometry, frame, createMirrorOptics(frame), { rootY: CAR_VISUAL_ROOT_Y });
    }
    world.updateMatrixWorld(true);
    for (const side of ['left', 'right']) {
      const frame = createMirrorFrame({ x: 0, z: 0, heading: 0 }, side, settings), eye = new THREE.Vector3(frame.eye.x, frame.eye.y, frame.eye.z);
      for (const u of [-.98, -.9, -.75, -.5, 0, .5, .75, .9, .98]) for (const v of [-.9, -.5, -.3, 0, .3, .5, .9]) {
        const point = sampleMirrorRay(frame, u, v).origin, direction = new THREE.Vector3(point.x, point.y, point.z).sub(eye);
        const hit = new THREE.Raycaster(eye, direction.clone().normalize(), .015, direction.length() + .003)
          .intersectObject(model.car, true).find(hit => {
            for (let node = hit.object; node; node = node.parent) if (!node.visible) return false;
            return !hit.object.material?.transparent;
          });
        assert.ok(!/mirror-stalk|mirror-rear-support/.test(hit?.object.name || ''), `${side} mirror bracket crossed aperture u=${u}, v=${v}`);
        // Rim occlusion at the very edge is physical. The useful inner strip
        // farther from the bezel must still be actual unobstructed glass.
        if (u === (side === 'left' ? .75 : -.75) && (v === -.3 || v === 0)) assert.equal(hit?.object, model.mirrorSurfaces[side]);
      }
    }
  }
});

test('training sedan keeps the vehicle body, wheelbase, track and tire contact geometry', t => {
  const { model } = fixture(t);
  const shell = new THREE.Box3().setFromObject(model.car.getObjectByName('body-shell'));
  assert.ok(Math.abs(shell.min.x + .89) < 1e-6); assert.ok(Math.abs(shell.max.x - .89) < 1e-6);
  assert.ok(Math.abs(shell.min.z + .79) < 1e-6); assert.ok(Math.abs(shell.max.z - 3.43) < 1e-6);
  assert.equal(model.wheels.length, 4); assert.equal(model.frontPivots.length, 2);
  assert.deepEqual([...new Set(model.wheels.map(wheel => wheel.parent.position.z))], [0, CAR.wheelbase]);
  assert.deepEqual([...new Set(model.wheels.map(wheel => wheel.parent.position.x))], [-CAR.trackWidth / 2, CAR.trackWidth / 2]);
  for (const wheel of model.wheels) {
    assert.ok(Math.abs(new THREE.Box3().setFromObject(wheel.getObjectByName('tire')).min.y - .025) < 1e-6);
    assert.ok(new THREE.Box3().setFromObject(wheel).max.x <= CAR.width / 2 + 1e-6);
    assert.ok(new THREE.Box3().setFromObject(wheel).min.x >= -CAR.width / 2 - 1e-6);
  }
  for (const pivot of model.frontPivots) assert.equal(pivot.position.z, CAR.wheelbase);
});

test('the sculpted body retains open wheel arches and solid door panels', t => {
  const { model } = fixture(t), shell = model.car.getObjectByName('body-shell');
  const hits = (y, z) => new THREE.Raycaster(new THREE.Vector3(2, y + CAR_VISUAL_ROOT_Y, z), new THREE.Vector3(-1, 0, 0)).intersectObject(shell);
  for (const axle of [0, CAR.wheelbase]) {
    for (const offset of [-.22, 0, .22]) assert.equal(hits(.51, axle + offset).length, 0);
    assert.ok(hits(.81, axle).length > 0);
  }
  assert.ok(hits(.65, CAR.wheelbase / 2).length > 0);
  assert.ok(shell.geometry.parameters.options.bevelEnabled, 'body edges are rounded instead of another rectangular box');
});

test('a single shared cabin has transparent window openings and genuine sloping pillar occlusion', t => {
  const { model, visibleHits } = fixture(t);
  assert.equal(model.cabin.visible, true); assert.equal(model.cockpit.visible, true);
  for (const name of ['windscreen', 'rear-screen', 'front-door-glass--1', 'front-door-glass-1']) {
    const pane = model.car.getObjectByName(name);
    assert.equal(pane.parent, model.cabin); assert.equal(pane.material.transparent, true);
    assert.ok(pane.material.opacity < .3);
  }
  assert.equal(visibleHits(new THREE.Vector3(.39, 1.28, 5)).length, 0, 'forward eye-level sightline passes through the shared windshield');
  const pillar = model.car.getObjectByName('a-pillar-1');
  assert.equal(pillar.parent, model.cabin);
  const bounds = new THREE.Box3().setFromObject(pillar);
  assert.ok(bounds.max.z - bounds.min.z > .45, 'A pillar slopes from the cowl to the roof');
  const target = pillar.getWorldPosition(new THREE.Vector3());
  assert.ok(visibleHits(target).some(hit => hit.object === pillar), 'the real pillar still occludes its own angular region');
  assert.equal(model.cockpit.getObjectByName('a-pillar-1'), undefined, 'interior fittings do not contain a second window frame');
});

test('physical mirror surfaces share the optical frame and remain clear of their backing and pillars', t => {
  const { model, visibleHits } = fixture(t);
  for (const side of ['left', 'right']) {
    const surface = model.mirrorSurfaces[side], frame = createMirrorFrame({ x: 0, z: 0, heading: 0 }, side);
    assert.equal(surface.parent, model.externalMirrors);
    assert.deepEqual(surface.position.toArray(), [0, 0, 0]); assert.deepEqual(surface.scale.toArray(), [1, 1, 1]);
    assert.equal(surface.quaternion.angleTo(new THREE.Quaternion()), 0);
    assert.equal(surface.geometry.parameters.widthSegments, 24); assert.equal(surface.geometry.parameters.heightSegments, 16);
    const attribute = surface.geometry.getAttribute('position');
    for (const [row, column] of [[0, 0], [0, 24], [8, 12], [16, 0], [16, 24]]) {
      const point = new THREE.Vector3().fromBufferAttribute(attribute, row * 25 + column).applyMatrix4(surface.matrixWorld);
      const ray = sampleMirrorRay(frame, -1 + column / 12, 1 - row / 8);
      assert.ok(point.distanceTo(new THREE.Vector3(ray.origin.x, ray.origin.y, ray.origin.z)) < 1e-6);
    }
    for (const [u, v] of [[0, 0], [-.7, -.7], [.7, -.7], [-.7, .7], [.7, .7]]) {
      const target = sampleMirrorRay(frame, u, v).origin;
      const hits = visibleHits(new THREE.Vector3(target.x, target.y, target.z));
      assert.equal(hits[0]?.object, surface, `${side} mirror sample ${u}/${v} must be seen before any backing, rim or pillar`);
    }
  }
});

test('near-side steering wheel stays separate from the instrument cluster over its full rotation', t => {
  const { world, model } = fixture(t);
  assert.deepEqual(model.steering.position.toArray(), [.39, 1.02, 1.55]);
  assert.equal(model.steering.children.filter(child => child.name.startsWith('steering-spoke-')).length, 3);
  const cluster = new THREE.Box3().setFromObject(model.car.getObjectByName('instrument-cluster'));
  const dashboard = new THREE.Box3().setFromObject(model.car.getObjectByName('dashboard'));
  for (let index = 0; index <= 24; index++) {
    model.steering.rotation.z = -12 * CAR.maxSteer + index / 24 * 24 * CAR.maxSteer;
    world.updateMatrixWorld(true);
    const wheel = new THREE.Box3().setFromObject(model.steering);
    assert.equal(wheel.intersectsBox(cluster), false);
    assert.equal(wheel.intersectsBox(dashboard), false);
    assert.ok(wheel.max.z + .04 < cluster.min.z, 'visible physical clearance remains between the wheel and instruments');
  }
});
