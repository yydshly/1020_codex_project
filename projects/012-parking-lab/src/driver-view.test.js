import test from 'node:test';
import assert from 'node:assert/strict';
import { createCockpitSettings, createMirrorFrame, setCockpitSetting } from './cockpit.js';
import { driverLookAngles, driverVerticalFov } from './driver-view.js';

test('looking at either physical mirror aims at its true centre at every supported seat position', () => {
  for (const height of [1.15, 1.28, 1.38]) for (const fore of [.9, 1.1, 1.3]) {
    let settings = setCockpitSetting(createCockpitSettings(), 'seatHeight', height);
    settings = setCockpitSetting(settings, 'seatFore', fore);
    for (const side of ['left', 'right']) {
      const { yaw, pitch } = driverLookAngles(settings, side);
      const frame = createMirrorFrame({ x: 0, z: 0, heading: 0 }, side, settings);
      const target = [frame.center.x - frame.eye.x, frame.center.y - frame.eye.y, frame.center.z - frame.eye.z];
      const length = Math.hypot(...target);
      const forward = [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)];
      assert.ok(forward.reduce((sum, value, i) => sum + value * target[i] / length, 0) > 1 - 1e-12);
    }
  }
});

test('looking ahead keeps a stable slightly downward driving view without changing seat or mirror settings', () => {
  const settings = createCockpitSettings(), before = structuredClone(settings);
  assert.deepEqual(driverLookAngles(settings), { yaw: 0, pitch: -.09 });
  assert.deepEqual(settings, before);
});

test('wide layouts cap horizontal field at 100 degrees while tall layouts keep a 55 degree vertical field', () => {
  for (const aspect of [.7, 1, 1.5, 2.8, 4.2]) {
    const vertical = driverVerticalFov(aspect);
    const horizontal = 2 * Math.atan(Math.tan(vertical * Math.PI / 360) * aspect) * 180 / Math.PI;
    assert.ok(horizontal <= 100 + 1e-10);
    assert.ok(vertical <= 55 && vertical > 0);
  }
  assert.equal(driverVerticalFov(1), 55);
  assert.equal(driverVerticalFov(0), 55);
});
