import test from 'node:test';
import assert from 'node:assert/strict';
import { createCockpitSettings, createMirrorFrame, sampleMirrorRay, projectMirrorPoint } from './cockpit.js';
import { recommendMirrorSettings } from './mirror-fit.js';
import { GROUND_REFERENCE_Y } from './scene-geometry.js';

function assertUsable(report) {
  assert.equal(report.quality, 'good', JSON.stringify(report));
  assert.equal(report.limited, false);
  assert.deepEqual(report.reasons, []);
  assert.ok(report.body.visible && report.ground.near.visible && report.ground.far.visible);
  assert.ok(report.body.innerFraction >= 0.03 && report.body.innerFraction <= 0.14);
  assert.ok(report.ground.near.y >= 0.55 && report.ground.near.y <= 0.94);
  assert.ok(report.ground.far.y >= 0.06 && report.ground.far.y <= 0.42);
  assert.ok(report.angularErrorDegrees < 2.5);
}

test('recommendation fits a small inner body reference and near/far ground for both current-eye mirrors', () => {
  const original = createCockpitSettings(), saved = structuredClone(original);
  const result = recommendMirrorSettings(original);
  assert.deepEqual(original, saved);
  assert.equal(result.settings.seatHeight, original.seatHeight);
  assert.equal(result.settings.seatFore, original.seatFore);
  assertUsable(result.report.left); assertUsable(result.report.right);
  assert.notEqual(result.report.left.yaw, result.report.right.yaw);
  for (const side of ['left', 'right']) {
    const before = createMirrorFrame({ x: 0, z: 0, heading: 0 }, side, original);
    const after = createMirrorFrame({ x: 0, z: 0, heading: 0 }, side, result.settings);
    assert.deepEqual(after.eye, before.eye);
    assert.deepEqual(after.center, before.center);
    assert.equal(after.width, before.width); assert.equal(after.height, before.height); assert.equal(after.radius, before.radius);
    const report = result.report[side];
    assert.equal(report.ground.near.point.y, GROUND_REFERENCE_Y);
    assert.equal(report.ground.far.point.y, GROUND_REFERENCE_Y);
    for (const reference of [report.body, report.ground.near, report.ground.far]) {
      const projected = projectMirrorPoint(after, reference.point);
      assert.equal(reference.visible, projected.visible);
      assert.equal(reference.x, projected.x); assert.equal(reference.y, projected.y);
    }
  }
});

test('the full supported seating rectangle yields bounded, honestly reported usable presets', () => {
  for (let height = 0; height <= 8; height++) for (let fore = 0; fore <= 8; fore++) {
    const settings = { ...createCockpitSettings(), seatHeight: 1.15 + (1.38 - 1.15) * height / 8, seatFore: 0.9 + 0.4 * fore / 8 };
    const result = recommendMirrorSettings(settings);
    assert.equal(result.settings.seatHeight, settings.seatHeight); assert.equal(result.settings.seatFore, settings.seatFore);
    for (const side of ['left', 'right']) {
      const report = result.report[side]; assertUsable(report);
      assert.ok(report.yaw >= -5 && report.yaw <= 25 && report.pitch >= -38 && report.pitch <= -5);
      assert.ok(Math.abs(report.yaw * 10 - Math.round(report.yaw * 10)) < 1e-10);
      assert.ok(Math.abs(report.pitch * 10 - Math.round(report.pitch * 10)) < 1e-10);
    }
  }
});

test('recommendation ignores old wrong mirror angles and vehicle/bay state and is exactly idempotent', () => {
  const settings = createCockpitSettings(), first = recommendMirrorSettings(settings);
  const wrong = { ...settings, left: { yaw: -5, pitch: -38 }, right: { yaw: 25, pitch: -5 } };
  const recovered = recommendMirrorSettings(wrong);
  assert.deepEqual(recovered.settings, first.settings);
  assert.deepEqual(recovered.report, first.report);
  assert.deepEqual(recommendMirrorSettings(first.settings), first);
  const irrelevantWorld = recommendMirrorSettings({ ...wrong, x: 800, z: -600, heading: 2, bay: { x: 99 }, progress: 4 });
  assert.deepEqual(irrelevantWorld.report, first.report);
  assert.deepEqual(irrelevantWorld.settings.left, first.settings.left);
  assert.deepEqual(irrelevantWorld.settings.right, first.settings.right);
});

test('single-side application preserves the other mirror and never changes the seat', () => {
  const settings = { ...createCockpitSettings(), left: { yaw: 24, pitch: -37 }, right: { yaw: -4, pitch: -6 }, seatHeight: 1.21, seatFore: 1.24 };
  for (const side of ['left', 'right']) {
    const other = side === 'left' ? 'right' : 'left';
    const result = recommendMirrorSettings(settings, { side });
    assert.deepEqual(Object.keys(result.report), [side]);
    assert.deepEqual(result.settings[other], settings[other]);
    assert.equal(result.settings.seatHeight, settings.seatHeight); assert.equal(result.settings.seatFore, settings.seatFore);
    assert.notEqual(result.settings[other], settings[other]);
    assertUsable(result.report[side]);
  }
});

test('moving the eye produces a new recommendation and an applied preset stays fixed until requested again', () => {
  const initial = recommendMirrorSettings(createCockpitSettings()).settings;
  const moved = { ...initial, seatHeight: 1.15, seatFore: 0.9 };
  const oldRay = sampleMirrorRay(createMirrorFrame({ x: 0, z: 0, heading: 0 }, 'left', initial), 0, 0).direction;
  const movedRay = sampleMirrorRay(createMirrorFrame({ x: 0, z: 0, heading: 0 }, 'left', moved), 0, 0).direction;
  assert.ok(Math.hypot(oldRay.x - movedRay.x, oldRay.y - movedRay.y, oldRay.z - movedRay.z) > 0.02);
  const fitted = recommendMirrorSettings(moved);
  assert.notDeepEqual(fitted.settings.left, moved.left);
  assert.notDeepEqual(fitted.settings.right, moved.right);
  assert.equal(fitted.settings.seatHeight, moved.seatHeight); assert.equal(fitted.settings.seatFore, moved.seatFore);
});

test('unsupported eyes are explicitly limited, while invalid inputs fail without inventing calibration', () => {
  const result = recommendMirrorSettings({ ...createCockpitSettings(), seatHeight: 2.0, seatFore: -0.2 });
  assert.equal(result.settings.seatHeight, 2.0); assert.equal(result.settings.seatFore, -0.2);
  for (const report of Object.values(result.report)) {
    assert.equal(report.quality, 'limited'); assert.equal(report.limited, true);
    assert.ok(report.reasons.includes('eye-outside-supported-range'));
    assert.ok(Number.isFinite(report.angularErrorDegrees));
  }
  assert.throws(() => recommendMirrorSettings(null), TypeError);
  assert.throws(() => recommendMirrorSettings({ ...createCockpitSettings(), seatHeight: NaN }), TypeError);
  assert.throws(() => recommendMirrorSettings(createCockpitSettings(), { side: 'rear' }), RangeError);
});
