import test from 'node:test';
import assert from 'node:assert/strict';
import { createCockpitSettings, setCockpitSetting, createMirrorFrame, sampleMirrorRay } from './cockpit.js';
import { createMirrorOptics, sourceUV } from './mirror-optics.js';

const state = { x: 0, z: 0, heading: 0 };
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const difference = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const frameFor = (side = 'left', settings = createCockpitSettings(), pose = state) => createMirrorFrame(pose, side, settings);

test('finite curved mirrors produce stable orthonormal cameras with bounded near-field approximation', () => {
  for (const side of ['left', 'right']) {
    const optics = createMirrorOptics(frameFor(side));
    assert.ok(Object.values(optics.position).every(Number.isFinite));
    for (const axis of [optics.forward, optics.right, optics.up]) assert.ok(Math.abs(dot(axis, axis) - 1) < 1e-10);
    assert.ok(Math.abs(dot(optics.forward, optics.right)) < 1e-10);
    assert.ok(Math.abs(dot(optics.forward, optics.up)) < 1e-10);
    assert.ok(Math.abs(dot(optics.up, optics.right)) < 1e-10);
    assert.ok(optics.field.horizontal > 15 && optics.field.horizontal < 40);
    assert.ok(optics.field.vertical > 10 && optics.field.vertical < 30);
    assert.ok(optics.maxRayError > 0.001 && optics.maxRayError < 0.04, `${side}: ${optics.maxRayError}`);
    assert.ok(optics.fov < 35, `Finite mirror should not inherit the old 46-degree camera: ${optics.fov}`);
  }
});

test('UV grid follows PlaneGeometry order and covers the physical rays without an extra flip', () => {
  const columns = 12, rows = 8, frame = frameFor('right');
  const optics = createMirrorOptics(frame, { columns, rows });
  assert.equal(optics.uvs.length, (columns + 1) * (rows + 1) * 2);
  for (let row = 0; row <= rows; row++) for (let column = 0; column <= columns; column++) {
    const ray = sampleMirrorRay(frame, -1 + column * 2 / columns, 1 - row * 2 / rows);
    const uv = sourceUV(optics, ray.direction), index = (row * (columns + 1) + column) * 2;
    assert.ok(Math.abs(optics.uvs[index] - uv.u) < 1e-7);
    assert.ok(Math.abs(optics.uvs[index + 1] - uv.v) < 1e-7);
    assert.ok(uv.u > 0 && uv.u < 1 && uv.v > 0 && uv.v < 1);
  }
  const center = sourceUV(optics, sampleMirrorRay(frame, 0, 0).direction);
  assert.ok(Math.abs(center.u - 0.5) < 1e-12 && Math.abs(center.v - 0.5) < 1e-12);
  // Check between grid samples too, so the margin covers the continuous mirror.
  for (let row = 0; row <= 40; row++) for (let column = 0; column <= 60; column++) {
    const uv = sourceUV(optics, sampleMirrorRay(frame, -1 + column / 30, 1 - row / 20).direction);
    assert.ok(uv.u >= 0 && uv.u <= 1 && uv.v >= 0 && uv.v <= 1);
  }
});

test('seat height and fore/aft position both change the reflected view, while left and right differ', () => {
  const settings = createCockpitSettings();
  const left = createMirrorOptics(frameFor('left', settings)), right = createMirrorOptics(frameFor('right', settings));
  assert.ok(Math.abs(left.field.horizontal - right.field.horizontal) > 1);
  for (const [name, value] of [['seatHeight', 1.36], ['seatFore', 1.28]]) {
    const adjustedFrame = frameFor('left', setCockpitSetting(settings, name, value));
    const changed = createMirrorOptics(adjustedFrame);
    assert.ok(difference(left.forward, changed.forward) > 0.005);
    assert.ok(difference(left.position, changed.position) > 0.005);
    // A symmetric source-camera envelope can coincidentally keep its total FOV
    // when the eye moves; the actual reflected field and sight direction change.
    assert.ok(Math.max(Math.abs(left.field.horizontal - changed.field.horizontal), Math.abs(left.field.vertical - changed.field.vertical)) > 0.01);
    const oldForwardInNewSource = sourceUV(changed, left.forward);
    assert.ok(Math.hypot(oldForwardInNewSource.u - 0.5, oldForwardInNewSource.v - 0.5) > 0.01);
    assert.ok(difference(frameFor('left', settings).normal, adjustedFrame.normal) < 1e-12, 'Moving the seat must not automatically retarget the glass.');
  }
});

test('virtual-eye fitting is stable under vehicle translation and rotation', () => {
  const settings = createCockpitSettings(), baseline = createMirrorOptics(frameFor('left', settings));
  const translated = createMirrorOptics(frameFor('left', settings, { ...state, x: 100000, z: -200000 }));
  assert.ok(Math.abs(translated.position.x - 100000 - baseline.position.x) < 1e-7);
  assert.ok(Math.abs(translated.position.z + 200000 - baseline.position.z) < 1e-7);
  assert.ok(Math.abs(translated.position.y - baseline.position.y) < 1e-7);
  assert.ok(Math.abs(translated.fov - baseline.fov) < 1e-7);
  const heading = 1.27, rotated = createMirrorOptics(frameFor('left', settings, { ...state, heading }));
  const rotate = p => ({ x: p.x * Math.cos(heading) + p.z * Math.sin(heading), y: p.y, z: -p.x * Math.sin(heading) + p.z * Math.cos(heading) });
  assert.ok(difference(rotated.position, rotate(baseline.position)) < 1e-9);
  assert.ok(difference(rotated.forward, rotate(baseline.forward)) < 1e-9);
  assert.ok(Math.abs(rotated.fov - baseline.fov) < 1e-9);
});

test('display aspect changes render coverage, not the sampled physical field of view', () => {
  const frame = frameFor('left');
  const narrow = createMirrorOptics(frame, { aspect: 1 }), wide = createMirrorOptics(frame, { aspect: 2.4 });
  assert.deepEqual(narrow.field, wide.field);
  assert.deepEqual(narrow.position, wide.position);
  assert.ok(narrow.fov > wide.fov);
  assert.ok(Math.abs(narrow.tanHorizontal / narrow.tanVertical - 1) < 1e-12);
  assert.ok(Math.abs(wide.tanHorizontal / wide.tanVertical - 2.4) < 1e-12);
  for (const optics of [narrow, wide]) assert.ok([...optics.uvs].every(value => value > 0 && value < 1));
});

test('invalid sampling dimensions and render aspect are rejected before allocating', () => {
  const frame = frameFor();
  for (const options of [{ columns: 0 }, { columns: 1.5 }, { rows: -1 }, { rows: 257 }, { aspect: 0 }, { aspect: Infinity }, { aspect: NaN }]) {
    assert.throws(() => createMirrorOptics(frame, options), RangeError);
  }
});
