import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COCKPIT_STORAGE_KEY, createCockpitSettings, setCockpitSetting, restoreCockpitSettings,
  driverEye, createMirrorFrame, sampleMirrorRay, projectMirrorPoint, mirrorPose, cockpitCue,
} from './cockpit.js';
import { CAR, initialState } from './vehicle.js';

const straight = { ...initialState(), x: 0, z: 0, heading: 0 };
const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const subtract = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const scale = (a, k) => ({ x: a.x * k, y: a.y * k, z: a.z * k });
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const norm = a => Math.hypot(a.x, a.y, a.z);
const unit = a => scale(a, 1 / norm(a));
const rotate = (v, heading) => ({ x: v.x * Math.cos(heading) + v.z * Math.sin(heading), y: v.y, z: -v.x * Math.sin(heading) + v.z * Math.cos(heading) });
function near(actual, expected, tolerance = 1e-9) {
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} differs from ${expected}`);
}
function nearVector(actual, expected, tolerance = 1e-9) {
  for (const key of ['x', 'y', 'z']) near(actual[key], expected[key], tolerance);
}
const targetAlong = (ray, distance = 6) => add(ray.origin, scale(ray.direction, distance));

test('version 2 calibration restores independently; old settings are not silently migrated', () => {
  const original = createCockpitSettings();
  assert.equal(COCKPIT_STORAGE_KEY, 'parking-lab.cockpit.v2');
  assert.deepEqual(original, { seatHeight: 1.28, seatFore: 1.10, left: { yaw: 9, pitch: -18 }, right: { yaw: 10, pitch: -18 } });
  const settings = setCockpitSetting(setCockpitSetting(original, 'seatHeight', 1.35), 'right.yaw', 20);
  assert.deepEqual(restoreCockpitSettings(JSON.stringify({ version: 2, settings })), settings);
  const oldSerialized = JSON.stringify({ version: 1, settings: { seatHeight: 1.48, seatFore: 1.58, left: { yaw: 19, pitch: -17 }, right: { yaw: 19, pitch: -17 } } });
  for (const value of [null, '{bad json', '{}', oldSerialized]) {
    assert.deepEqual(restoreCockpitSettings(value), original);
  }
  assert.equal(JSON.parse(oldSerialized).settings.seatHeight, 1.48);
  const partial = restoreCockpitSettings(JSON.stringify({ version: 2, settings: { seatHeight: 'bad', seatFore: 10, left: { yaw: 999, pitch: null } } }));
  assert.equal(partial.left.yaw, 25);
  assert.equal(partial.left.pitch, -18);
  assert.equal(partial.seatHeight, 1.28);
  assert.equal(partial.seatFore, 1.3);
  assert.equal(partial.right.yaw, 10);
});

test('calibration is immutable and restricted to the physical model adjustment ranges', () => {
  const original = createCockpitSettings();
  for (const [name, minimum, maximum] of [['seatHeight', 1.15, 1.38], ['seatFore', 0.9, 1.3], ['left.yaw', -5, 25], ['right.yaw', -5, 25], ['left.pitch', -38, -5], ['right.pitch', -38, -5]]) {
    const read = settings => name.split('.').reduce((value, key) => value[key], settings);
    near(read(setCockpitSetting(original, name, -100)), minimum);
    near(read(setCockpitSetting(original, name, 100)), maximum);
    assert.deepEqual(setCockpitSetting(original, name, Infinity), original);
  }
  assert.deepEqual(original, createCockpitSettings());
});

test('finite mirror frames and the driver eye use the same vehicle coordinates', () => {
  nearVector(driverEye(straight), { x: 0.39, y: 1.28, z: 1.10 });
  for (const side of ['left', 'right']) {
    const frame = createMirrorFrame(straight, side);
    nearVector(frame.center, { x: (side === 'left' ? 1 : -1) * (CAR.width / 2 + 0.12), y: 1.05, z: 1.86 });
    assert.equal(frame.width, 0.19); assert.equal(frame.height, 0.12); assert.equal(frame.radius, 1.4);
    for (const axis of [frame.normal, frame.right, frame.up]) near(norm(axis), 1);
    near(dot(frame.normal, frame.right), 0); near(dot(frame.normal, frame.up), 0); near(dot(frame.right, frame.up), 0);
    assert.ok(dot(subtract(frame.eye, frame.center), frame.normal) > 0, 'driver sees the reflective face');
    assert.ok(frame.up.y > 0, 'positive mirror v points upwards');
  }
});

test('center ray matches each mirror adjustment at the fixed reference eye', () => {
  for (const side of ['left', 'right']) {
    for (const [yaw, pitch] of [[5, -23], [-5, -38], [25, -5]]) {
      const settings = setCockpitSetting(setCockpitSetting(createCockpitSettings(), `${side}.yaw`, yaw), `${side}.pitch`, pitch);
      const frame = createMirrorFrame(straight, side, settings);
      const ray = sampleMirrorRay(frame, 0, 0);
      const azimuth = yaw * Math.PI / 180, elevation = pitch * Math.PI / 180;
      nearVector(ray.origin, frame.center);
      nearVector(ray.direction, { x: (side === 'left' ? 1 : -1) * Math.sin(azimuth) * Math.cos(elevation), y: Math.sin(elevation), z: -Math.cos(azimuth) * Math.cos(elevation) });
    }
  }
});

test('sampled curved surface rays obey reflection law and equal incidence/reflection angles', () => {
  for (const side of ['left', 'right']) {
    const frame = createMirrorFrame(straight, side);
    const sphereCenter = subtract(frame.center, scale(frame.normal, frame.radius));
    for (const u of [-1, -0.4, 0, 0.7, 1]) for (const v of [-1, 0, 1]) {
      const ray = sampleMirrorRay(frame, u, v);
      const incident = unit(subtract(ray.origin, frame.eye));
      near(norm(subtract(ray.origin, sphereCenter)), frame.radius);
      near(norm(ray.normal), 1); near(norm(ray.direction), 1);
      near(dot(incident, ray.normal), -dot(ray.direction, ray.normal));
      const incidentTangent = subtract(incident, scale(ray.normal, dot(incident, ray.normal)));
      const reflectedTangent = subtract(ray.direction, scale(ray.normal, dot(ray.direction, ray.normal)));
      nearVector(incidentTangent, reflectedTangent);
      assert.ok(dot(ray.direction, ray.normal) > 0);
    }
  }
});

test('moving the seat changes reflected views without secretly re-adjusting either mirror', () => {
  const settings = createCockpitSettings();
  for (const side of ['left', 'right']) {
    const baseline = createMirrorFrame(straight, side, settings);
    const baselineRay = sampleMirrorRay(baseline, 0, 0);
    for (const [name, value] of [['seatHeight', 1.15], ['seatHeight', 1.38], ['seatFore', 0.9], ['seatFore', 1.3]]) {
      const moved = createMirrorFrame(straight, side, setCockpitSetting(settings, name, value));
      for (const key of ['center', 'normal', 'right', 'up']) assert.deepEqual(moved[key], baseline[key]);
      assert.notDeepEqual(moved.eye, baseline.eye);
      assert.ok(norm(subtract(sampleMirrorRay(moved, 0, 0).direction, baselineRay.direction)) > 0.02);
      const projection = projectMirrorPoint(moved, targetAlong(baselineRay, 10));
      assert.ok(!projection.visible || Math.hypot(projection.x - 0.5, projection.y - 0.5) > 0.05, 'same world point moves across or out of the finite mirror');
    }
  }
});

test('left mirror adjustments do not alter the right mirror, seat, or old settings', () => {
  const original = createCockpitSettings();
  const adjusted = setCockpitSetting(setCockpitSetting(original, 'left.yaw', 22), 'left.pitch', -10);
  const left = createMirrorFrame(straight, 'left', original), moved = createMirrorFrame(straight, 'left', adjusted);
  assert.notDeepEqual(moved.normal, left.normal);
  assert.notDeepEqual(sampleMirrorRay(moved, 0, 0).direction, sampleMirrorRay(left, 0, 0).direction);
  assert.deepEqual(createMirrorFrame(straight, 'right', adjusted), createMirrorFrame(straight, 'right', original));
  assert.deepEqual(driverEye(straight, adjusted), driverEye(straight, original));
  assert.deepEqual(original, createCockpitSettings());
});

test('world points along reflected rays project back to the finite mirror, including edges and near field', () => {
  const base = createCockpitSettings();
  const settingsList = [base];
  for (const height of [1.15, 1.38]) for (const fore of [0.9, 1.3]) {
    settingsList.push(setCockpitSetting(setCockpitSetting(base, 'seatHeight', height), 'seatFore', fore));
  }
  for (const side of ['left', 'right']) for (const settings of settingsList) {
    const frame = createMirrorFrame(straight, side, settings);
    for (const u of [-1, -0.6, 0, 0.6, 1]) for (const v of [-1, 0, 1]) for (const distance of [0.3, 1, 5, 50]) {
      const ray = sampleMirrorRay(frame, u, v);
      const projected = projectMirrorPoint(frame, targetAlong(ray, distance));
      assert.equal(projected.visible, true, `${side} ${settings.seatHeight}/${settings.seatFore} ${u}/${v} at ${distance}m`);
      near(projected.x, (u + 1) / 2, 1e-7);
      near(projected.y, (1 - v) / 2, 1e-7);
      nearVector(projected.origin, ray.origin, 1e-7);
      nearVector(projected.direction, ray.direction, 1e-7);
    }
  }
});

test('finite aperture excludes outside rays, points behind the reflected ray, and invalid targets', () => {
  for (const side of ['left', 'right']) {
    const frame = createMirrorFrame(straight, side);
    for (const [u, v] of [[-1.05, 0], [1.05, 0], [0, -1.05], [0, 1.05], [1.1, 1.1]]) {
      const rayOutsideAperture = sampleMirrorRay(frame, u, v);
      assert.equal(projectMirrorPoint(frame, targetAlong(rayOutsideAperture)).visible, false);
    }
    for (const point of [targetAlong(sampleMirrorRay(frame, 0, 0), -5), frame.center, subtract(frame.center, scale(frame.normal, 1)), { x: NaN, y: 0, z: 0 }, null]) {
      assert.equal(projectMirrorPoint(frame, point).visible, false);
    }
  }
});

test('geometry and inverse projection rotate and translate with the vehicle', () => {
  const settings = setCockpitSetting(createCockpitSettings(), 'seatFore', 1.23);
  for (const heading of [-Math.PI * 0.7, 0.25, Math.PI / 2]) {
    const state = { ...straight, x: 9.5, z: -13.7, heading };
    const transform = vector => add(rotate(vector, heading), { x: state.x, y: 0, z: state.z });
    nearVector(driverEye(state, settings), transform(driverEye(straight, settings)));
    for (const side of ['left', 'right']) {
      const frame = createMirrorFrame(straight, side, settings), rotated = createMirrorFrame(state, side, settings);
      for (const key of ['center', 'eye']) nearVector(rotated[key], transform(frame[key]));
      for (const key of ['normal', 'right', 'up']) nearVector(rotated[key], rotate(frame[key], heading));
      const ray = sampleMirrorRay(frame, 0.7, -0.4), rotatedRay = sampleMirrorRay(rotated, 0.7, -0.4);
      nearVector(rotatedRay.origin, transform(ray.origin));
      nearVector(rotatedRay.normal, rotate(ray.normal, heading));
      nearVector(rotatedRay.direction, rotate(ray.direction, heading));
      const projection = projectMirrorPoint(rotated, transform(targetAlong(ray, 4)));
      assert.equal(projection.visible, true); near(projection.x, 0.85, 1e-7); near(projection.y, 0.7, 1e-7);
    }
  }
});

test('valid extreme adjustments remain finite and project visible mirror corners accurately', () => {
  for (const side of ['left', 'right']) for (const yaw of [-5, 25]) for (const pitch of [-38, -5]) for (const height of [1.15, 1.38]) for (const fore of [0.9, 1.3]) {
    let settings = createCockpitSettings();
    for (const [name, value] of [[`${side}.yaw`, yaw], [`${side}.pitch`, pitch], ['seatHeight', height], ['seatFore', fore]]) settings = setCockpitSetting(settings, name, value);
    const frame = createMirrorFrame(straight, side, settings);
    for (const [u, v] of [[0, 0], [-1, -1], [-1, 1], [1, -1], [1, 1]]) {
      const ray = sampleMirrorRay(frame, u, v);
      near(norm(ray.direction), 1);
      const projection = projectMirrorPoint(frame, targetAlong(ray));
      assert.equal(projection.visible, true, `${side} yaw ${yaw}, pitch ${pitch}, eye ${height}/${fore}, uv ${u}/${v}`);
      near(projection.x, (u + 1) / 2, 1e-7); near(projection.y, (1 - v) / 2, 1e-7);
    }
  }
});

test('legacy perspective envelope derives its field of view from actual reflected edge rays', () => {
  const base = createCockpitSettings();
  for (const side of ['left', 'right']) {
    const pose = mirrorPose(straight, side, base), frame = createMirrorFrame(straight, side, base);
    const top = sampleMirrorRay(frame, 0, 1), bottom = sampleMirrorRay(frame, 0, -1);
    near(pose.fov, Math.acos(dot(top.direction, bottom.direction)) * 180 / Math.PI);
    assert.ok(pose.fov > 0 && pose.fov < 90);
    assert.notEqual(pose.fov, mirrorPose(straight, side, setCockpitSetting(base, 'seatFore', 1.3)).fov);
  }
});

test('mirror coaching follows the practiced side and alternates both mirrors near alignment', () => {
  assert.equal(cockpitCue(initialState(), { phase: 0 }).main, 'right');
  assert.equal(cockpitCue(initialState(), { phase: 2 }).main, 'left');
  assert.equal(cockpitCue({ ...initialState(), heading: 0 }, { phase: 0 }).main, 'both');
  assert.equal(cockpitCue(initialState(), { phase: 1 }).main, 'forward');
});
