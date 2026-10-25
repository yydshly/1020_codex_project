import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTrainingCar } from './vehicle-visuals.js';
import { createCockpitSettings } from './cockpit.js';
import { driverLookAngles, driverVerticalFov } from './driver-view.js';
import { createCourseDistanceTrack, sampleCourseDistance, courseControlState, createCourseOperationVisuals, isExteriorCourseLamp, courseOperationCamera, courseLightState } from './course-operation-visuals.js';

function fixture(t) {
  const world = new THREE.Scene(), model = createTrainingCar({ world });
  t.after(() => {
    const geometries = new Set(), materials = new Set();
    world.traverse(object => {
      if (object.geometry) geometries.add(object.geometry);
      if (object.material) materials.add(object.material);
    });
    geometries.forEach(value => value.dispose()); materials.forEach(value => value.dispose());
  });
  return { world, model };
}

test('wheel roll comes from signed path distance and seeks deterministically through stops and reverse', () => {
  const track = createCourseDistanceTrack([
    { t: 0, x: 0, z: 0, heading: 0, speed: 0 }, { t: 2, x: 0, z: 3, heading: 0, speed: 2 },
    { t: 4, x: 0, z: 3, heading: 0, speed: 0 }, { t: 6, x: 0, z: 1, heading: 0, speed: -1 },
    { t: 8, x: 0, z: 4, heading: 0, speed: 2 },
  ]);
  assert.equal(sampleCourseDistance(track, 3), 3);
  assert.equal(sampleCourseDistance(track, 4), 3);
  assert.equal(sampleCourseDistance(track, 5), 2);
  assert.equal(sampleCourseDistance(track, 6), 1);
  assert.equal(sampleCourseDistance(track, 8), 4);
  assert.equal(sampleCourseDistance(track, 3), 3, 'reverse seeking cannot retain a later frame wheel angle');
  const explicit = createCourseDistanceTrack([{ t: 0, distance: 0 }, { t: 2, x: 100, distance: -2 }]);
  assert.equal(sampleCourseDistance(explicit, 1), -1, 'motion metadata takes precedence over geometry sampling');
});

test('teaching focus never overrides pedal, gear or light state from the actual pose', () => {
  const state = courseControlState({ gear: '2', clutchState: 'up', clutchValue: .15, brake: true, brakeValue: .3,
    throttle: .2, parkingBrake: false, lightMode: 'low', leftSignal: true, t: 0 },
  { kind: 'gear', target: 'gear', value: 'R', progress: 1 });
  assert.equal(state.gear, '2'); assert.equal(state.clutch, .15); assert.equal(state.brake, .3); assert.equal(state.throttle, .2);
  assert.equal(state.high, false); assert.equal(state.leftSignal, true); assert.equal(state.rightSignal, false);
  assert.equal(courseControlState({ clutchState: 'bite' }).clutch, .5);
  assert.equal(courseControlState({ clutchState: 'down' }).clutch, 1);
  assert.equal(courseControlState({ lightMode: 'hazard' }).positionLights, true);
  assert.equal(courseControlState({}, { target: 'door', value: 'closed', progress: .25 }).door, .75);
  assert.equal(courseControlState({}, { target: 'seat', doorOpen: 1, beltFastened: true }, { prepare: true }).belt, 1);
});

test('hazard keeps position shells lit without road beams and retains brake-lamp priority', () => {
  for (const t of [0, .6]) {
    const lights = courseLightState({ lightMode: 'hazard', brake: false, t });
    assert.equal(lights.beamIntensity, 0);
    assert.ok(lights.frontEmission > 0 && lights.frontEmission < courseLightState({ lightMode: 'low' }).frontEmission);
    assert.equal(lights.rearEmission, .35);
    assert.ok(lights.positionLights && lights.leftSignal && lights.rightSignal);
    assert.equal(courseControlState({ lightMode: 'hazard', t }).positionLights, lights.positionLights);
  }
  assert.equal(courseLightState({ lightMode: 'hazard', brake: true }).rearEmission, 2.2);
  assert.equal(courseLightState({ lightMode: 'off', brake: false }).frontEmission, 0);
  assert.equal(courseLightState({ lightMode: 'off', brake: false }).rearEmission, 0);
});

test('course-only cabin opening exposes real pedals while leaving the separate shared sedan untouched', t => {
  const { world, model } = fixture(t), shared = fixture(t).model;
  const shell = model.car.getObjectByName('body-shell');
  const sharedGeometry = shared.car.getObjectByName('body-shell').geometry;
  const sharedCount = sharedGeometry.getAttribute('position').count;
  const ray = new THREE.Raycaster(new THREE.Vector3(.39, 1.20, 1.7), new THREE.Vector3(0, -1, 0), 0, .65);
  world.updateMatrixWorld(true); assert.ok(ray.intersectObject(shell).length > 0);
  const visuals = createCourseOperationVisuals(model); visuals.update({ gear: 'N', clutchState: 'up' }, null, {});
  world.updateMatrixWorld(true); assert.equal(ray.intersectObject(shell).length, 0, 'a body roof must not seal the footwell at waist height');
  assert.equal(sharedGeometry.getAttribute('position').count, sharedCount);
  assert.ok(ray.intersectObject(shared.car.getObjectByName('body-shell')).length > 0);
  assert.ok(visuals.pedalPivots.clutch.position.x > visuals.pedalPivots.brake.position.x);
  assert.ok(visuals.pedalPivots.brake.position.x > visuals.pedalPivots.throttle.position.x);
  assert.ok(visuals.leds.left.position.x > visuals.leds.right.position.x, 'left turn indicator belongs on the driver-visible left side');
  const camera = new THREE.Vector3(-.42, 1.21, .86);
  for (const target of ['clutch', 'brake', 'throttle']) {
    const pedal = model.car.getObjectByName(`${target}-pedal`), destination = pedal.getWorldPosition(new THREE.Vector3());
    const direction = destination.clone().sub(camera), ray = new THREE.Raycaster(camera, direction.clone().normalize(), 0, direction.length() + .003);
    const opaque = ray.intersectObject(model.car, true).filter(hit => hit.object.visible && !hit.object.material?.transparent);
    assert.ok(opaque.some(hit => hit.object === pedal), `${target} pedal geometry is in the close-up sightline`);
    assert.equal(opaque[0]?.object, pedal, `${target} pedal must be visible ahead of opaque cabin parts`);
  }
});

test('door, seat and belt actions are reversible on seek and do not move the calibrated mirrors', t => {
  const { world, model } = fixture(t);
  world.updateMatrixWorld(true);
  const mirrorPositions = Object.values(model.mirrorSurfaces).map(surface => [...surface.geometry.getAttribute('position').array]);
  const closedGlass = model.car.getObjectByName('front-door-glass-1').getWorldPosition(new THREE.Vector3());
  const visuals = createCourseOperationVisuals(model);
  visuals.update({ gear: 'N' }, { target: 'door', value: 'open', progress: 1 }, { prepare: true });
  world.updateMatrixWorld(true);
  assert.ok(visuals.doorPivot.rotation.y < -.9, 'door opens outwards on the driver side');
  visuals.update({ gear: 'N' }, { target: 'door', value: 'closed', progress: 1, beltFastened: true }, { prepare: true });
  world.updateMatrixWorld(true);
  assert.ok(Math.abs(visuals.doorPivot.rotation.y) < 1e-9);
  assert.ok(model.car.getObjectByName('front-door-glass-1').getWorldPosition(new THREE.Vector3()).distanceTo(closedGlass) < 1e-6);
  assert.equal(visuals.leds.belt.material.color.getHexString(), '253332');
  Object.values(model.mirrorSurfaces).forEach((surface, i) => assert.deepEqual([...surface.geometry.getAttribute('position').array], mirrorPositions[i]));
});

test('exterior lamp traversal excludes headlight controls and groups without materials', t => {
  const { model } = fixture(t); createCourseOperationVisuals(model);
  const lamps = []; model.car.traverse(object => { if (isExteriorCourseLamp(object)) lamps.push(object); });
  assert.deepEqual(lamps.map(lamp => lamp.name).sort(), ['headlight--1', 'headlight-1', 'tail-light--1', 'tail-light-1']);
  for (const lamp of lamps) assert.doesNotThrow(() => { const clone = lamp.material.clone(); clone.dispose(); });
  assert.equal(isExteriorCourseLamp(model.car.getObjectByName('headlight-rotary-switch')), false);
  assert.equal(isExteriorCourseLamp(model.car.getObjectByName('headlight-switch-knob')), false);
});

test('operation cameras frame readable controls and keep switches, lamps and three pedals unoccluded', t => {
  const { world, model } = fixture(t), visuals = createCourseOperationVisuals(model);
  visuals.update({ gear: '2', clutchValue: .5, brakeValue: .3, lightMode: 'high', t: 0 }, { kind: 'light', target: 'headlight', progress: 1 }, {});
  world.updateMatrixWorld(true);
  function cameraFor(target, aspect) {
    const pose = courseOperationCamera(target, aspect), camera = new THREE.PerspectiveCamera(pose.fov, aspect, .06, 30);
    camera.position.fromArray(pose.position); camera.lookAt(...pose.target); camera.updateMatrixWorld(true); camera.updateProjectionMatrix();
    return camera;
  }
  function projected(mesh, camera) {
    const attribute = mesh.geometry.getAttribute('position'), points = [];
    for (let i = 0; i < attribute.count; i++) points.push(new THREE.Vector3().fromBufferAttribute(attribute, i).applyMatrix4(mesh.matrixWorld).project(camera));
    const xs = points.map(p => p.x), ys = points.map(p => p.y);
    return { width: (Math.max(...xs) - Math.min(...xs)) / 2, height: (Math.max(...ys) - Math.min(...ys)) / 2,
      contained: points.every(point => point.x >= -.98 && point.x <= .98 && point.y >= -.98 && point.y <= .98 && point.z > -1 && point.z < 1) };
  }
  function visible(mesh, camera, allowed = []) {
    const destination = mesh.getWorldPosition(new THREE.Vector3()), direction = destination.clone().sub(camera.position);
    const ray = new THREE.Raycaster(camera.position, direction.clone().normalize(), 0, direction.length() + .02);
    const hits = ray.intersectObject(model.car, true).filter(hit => {
      let object = hit.object; while (object) { if (!object.visible) return false; object = object.parent; }
      return !hit.object.material?.transparent;
    });
    assert.ok(hits[0]?.object === mesh || allowed.includes(hits[0]?.object.name), `${mesh.name} blocked by ${hits[0]?.object.name}`);
  }
  for (const aspect of [1.6, 3.1, .9]) {
    const lights = cameraFor('headlight', aspect), knob = model.car.getObjectByName('headlight-switch-knob');
    for (const [mode, signal] of [['off', null], ['low', 'left'], ['low', 'right'], ['high', null], ['flash', null]]) {
      visuals.update({ gear: '2', clutchValue: .5, brakeValue: .3, lightMode: mode, leftSignal: signal === 'left', rightSignal: signal === 'right', t: 0 },
        { kind: 'light', target: 'headlight', progress: 1 }, {}); world.updateMatrixWorld(true);
      const knobFrame = projected(knob, lights);
      assert.ok(knobFrame.contained && knobFrame.height >= .065, `light switch ${mode}/${signal} must occupy at least 6.5% of close-up height, aspect ${aspect}`);
      visible(knob, lights, ['headlight-switch-marker']);
      for (const name of ['high', 'low', 'left', 'right']) {
        const frame = projected(visuals.leds[name], lights);
        assert.ok(frame.contained && frame.height >= .018, `${name} indicator must be in frame and visibly distinct, aspect ${aspect}`);
        visible(visuals.leds[name], lights);
      }
    }
    const pedals = cameraFor('clutch', aspect);
    for (const target of ['clutch', 'brake', 'throttle']) {
      const pedal = model.car.getObjectByName(`${target}-pedal`), frame = projected(pedal, pedals);
      assert.ok(frame.contained && frame.height >= .12, `${target} pedal must occupy at least 12% of close-up height, aspect ${aspect}`);
      visible(pedal, pedals, [-1, 0, 1].map(i => `${target}-pedal-grip-${i}`));
    }
    const gear = cameraFor('gear', aspect), gearKnob = model.car.getObjectByName('demonstrated-gear-knob'), frame = projected(gearKnob, gear);
    assert.ok(frame.contained && frame.height >= .13, `gear knob must occupy at least 13% of close-up height, aspect ${aspect}`);
    visible(gearKnob, gear);
  }
});

test('a positive front-wheel left steer turns the wheel rim left in driver and controls camera projections', t => {
  const { world, model } = fixture(t), settings = createCockpitSettings();
  const camera = new THREE.PerspectiveCamera(55, 1.6, .06, 30);
  for (const view of ['driver', 'controls']) {
    if (view === 'driver') {
      const look = driverLookAngles(settings, 'forward');
      camera.position.set(.39, settings.seatHeight, settings.seatFore);
      camera.lookAt(camera.position.clone().add(new THREE.Vector3(0, Math.tan(look.pitch), 1)));
      camera.fov = driverVerticalFov(camera.aspect);
    } else {
      const closeup = courseOperationCamera('steering', camera.aspect);
      camera.position.fromArray(closeup.position); camera.lookAt(...closeup.target); camera.fov = closeup.fov;
    }
    camera.updateMatrixWorld(true); camera.updateProjectionMatrix();
    model.steering.rotation.z = 0; world.updateMatrixWorld(true);
    const before = new THREE.Vector3(0, .17, 0).applyMatrix4(model.steering.matrixWorld).project(camera);
    model.steering.rotation.z = -.10 * 12; world.updateMatrixWorld(true);
    const after = new THREE.Vector3(0, .17, 0).applyMatrix4(model.steering.matrixWorld).project(camera);
    assert.ok(after.x < before.x, `${view}: top of steering rim must move to screen left`);
    assert.ok(new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), .1).x > 0);
  }
});
