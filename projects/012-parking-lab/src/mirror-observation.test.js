import test from 'node:test';
import assert from 'node:assert/strict';
import { BAY, CAR } from './vehicle.js';
import { createCorrectionDrill } from './correction.js';
import { createDemonstration } from './lesson.js';
import { createCockpitSettings, createMirrorFrame, projectMirrorPoint, setCockpitSetting } from './cockpit.js';
import { recommendMirrorSettings } from './mirror-fit.js';
import { mirrorObservation, mirrorRecognition } from './mirror-observation.js';
import { GROUND_REFERENCE_Y, PAINT_SURFACE_Y } from './scene-geometry.js';

const demonstration = createDemonstration();

test('side and back references stay on their real stripes and readable correction references expose a continuous segment', () => {
  for (const settings of [createCockpitSettings(), recommendMirrorSettings(createCockpitSettings()).settings]) {
    for (const scenario of ['left', 'right']) for (const side of ['left', 'right']) {
      const result = mirrorObservation(createCorrectionDrill(scenario).start, side, settings);
      assert.equal(result.lineReadable, true);
      assert.ok(result.sideLine.worldLength >= .3 && result.sideLine.screenSpan >= .07);
      assert.ok(Math.abs(result.sideLine.point.x - (side === 'left' ? BAY.right : BAY.left)) <= .050001);
      assert.ok(Math.abs(result.backLine.point.z - BAY.back) <= .050001);
      assert.ok(result.backLineSamples.every(sample => Math.abs(sample.point.z - BAY.back) <= .050001));
      assert.ok(result.backLineSamples.every(sample => sample.point.z < BAY.entrance));
      assert.ok(result.entranceLineSamples.every(sample => Math.abs(sample.point.z - BAY.entrance) <= .050001));
      assert.ok(result.entranceLineSamples.every(sample => side === 'left' ? sample.point.x >= BAY.right : sample.point.x <= BAY.left));
    }
  }
});

test('a single visible slice or a back stripe cannot stand in for a readable side stripe', () => {
  const pose = { x: 0, z: -3, heading: 0 };
  const seed = mirrorObservation(pose, 'left').sideLine.point.z;
  const result = mirrorObservation(pose, 'left', createCockpitSettings(), {
    acceptReference: sample => Math.abs(sample.point.z - seed) < .00001 || Math.abs(sample.point.z - BAY.back) <= .050001,
  });
  assert.equal(result.lineVisible, true);
  assert.equal(result.lineReadable, false);
  assert.equal(result.sideLine.worldLength, 0);
  assert.equal(result.backLine.readable, true);
});

test('occlusion acceptance applies to body, ground, side and back references without moving points', () => {
  const pose = createCorrectionDrill('right').start;
  const result = mirrorObservation(pose, 'right', createCockpitSettings(), { acceptReference: () => false });
  assert.equal(result.lineVisible, false);
  assert.equal(result.lineReadable, false);
  for (const name of ['body', 'ground', 'sideLine', 'backLine', 'entranceLine']) assert.equal(result[name].visible, false);
  assert.equal(result.cornerVisible, false);
});

test('beginner turn start and end cannot claim a bay corner or line is visible in either mirror', () => {
  const start = demonstration.stops[1];
  const end = demonstration.frames.findIndex((pose, index) => index > start && pose.steer <= -CAR.maxSteer + 1e-6) + 12;
  assert.equal(start, 442); assert.equal(end, 514);
  for (const settings of [createCockpitSettings(), recommendMirrorSettings(createCockpitSettings()).settings]) {
    for (const index of [start, end]) for (const side of ['left', 'right']) {
      const result = mirrorObservation(demonstration.frames[index], side, settings);
      assert.equal(result.lineVisible, false, `${index}/${side}: nonexistent turn-step line cue`);
      assert.equal(result.cornerVisible, false, `${index}/${side}: nonexistent turn-step corner cue`);
      assert.equal(result.ground.visible, true);
      assert.equal(result.occlusionChecked, false);
    }
  }
});

test('right-entry references appear later on the correct side, followed by the left mirror', () => {
  const settings = createCockpitSettings();
  const earlyTurn = demonstration.frames[750];
  assert.equal(mirrorObservation(earlyTurn, 'right', settings).lineVisible, true);
  assert.equal(mirrorObservation(earlyTurn, 'right', settings).cornerVisible, true);
  assert.equal(mirrorObservation(earlyTurn, 'left', settings).lineVisible, false);
  const lateTurn = demonstration.frames[1250];
  assert.equal(mirrorObservation(lateTurn, 'left', settings).lineVisible, true);
  const aligned = { x: 0, z: -3, heading: 0 };
  for (const side of ['left', 'right']) {
    const result = mirrorObservation(aligned, side, settings);
    assert.equal(result.lineVisible, true);
    assert.equal(result.cornerVisible, false, 'The entrance is now ahead of the rearward mirror.');
  }
});

test('sampling contains only the physical same-side stripe and does not invent a bay entrance cross-line', () => {
  const state = demonstration.frames[750];
  for (const side of ['left', 'right']) {
    const result = mirrorObservation(state, side), x = side === 'left' ? BAY.right : BAY.left;
    assert.deepEqual(result.corner.point, { x, y: PAINT_SURFACE_Y, z: BAY.entrance });
    assert.ok(result.lineSamples.every(sample => Math.abs(sample.point.x - x) <= 0.05000001));
    assert.ok(result.lineSamples.every(sample => sample.point.y === PAINT_SURFACE_Y));
    assert.ok(result.lineSamples.every(sample => sample.point.z >= BAY.back && sample.point.z <= BAY.entrance));
    assert.equal(result.lineVisible, result.lineSamples.some(sample => sample.visible));
  }
});

test('body and ground markers use real vehicle-relative points and the exact current optical projection', () => {
  const settings = recommendMirrorSettings(createCockpitSettings()).settings;
  const state = { x: 0, z: 0, heading: 0 };
  for (const side of ['left', 'right']) {
    const result = mirrorObservation(state, side, settings), sign = side === 'left' ? 1 : -1;
    assert.equal(result.body.visible, true); assert.equal(result.ground.visible, true);
    assert.equal(result.body.point.x, sign * (CAR.width / 2 - 0.005));
    assert.equal(result.body.point.y, 0.65);
    assert.equal(result.ground.point.x, sign * (CAR.width / 2 + 0.50));
    assert.equal(result.ground.point.y, GROUND_REFERENCE_Y);
    for (const reference of [result.body, result.ground]) {
      const projected = projectMirrorPoint(createMirrorFrame(state, side, settings), reference.point);
      assert.equal(reference.x, projected.x); assert.equal(reference.y, projected.y);
      assert.deepEqual(reference.origin, projected.origin);
    }
    const translated = mirrorObservation({ ...state, x: 10, z: -12 }, side, settings);
    assert.ok(Math.abs(translated.body.x - result.body.x) < 1e-10);
    assert.ok(Math.abs(translated.body.y - result.body.y) < 1e-10);
    assert.equal(translated.body.point.x, result.body.point.x + 10);
  }
});

test('manual mirror and eye changes update observations without modifying settings or the other mirror', () => {
  const state = demonstration.frames[750], settings = createCockpitSettings(), saved = structuredClone(settings);
  const original = mirrorObservation(state, 'right', settings);
  const tilted = setCockpitSetting(settings, 'right.pitch', -38);
  const changed = mirrorObservation(state, 'right', tilted);
  assert.equal(original.cornerVisible, true); assert.equal(changed.cornerVisible, false);
  assert.deepEqual(mirrorObservation(state, 'left', tilted), mirrorObservation(state, 'left', settings));
  const raised = mirrorObservation(state, 'right', setCockpitSetting(settings, 'seatHeight', 1.38));
  assert.notDeepEqual(raised.ground, original.ground);
  assert.deepEqual(settings, saved);
  assert.equal(changed.visibility, 'mirror-aperture-only');
  assert.throws(() => mirrorObservation(state, 'rear', settings), RangeError);
});

test('per-frame recognition matches observation points without running a bay-line scan', () => {
  for (const settings of [createCockpitSettings(), recommendMirrorSettings(createCockpitSettings()).settings]) {
    for (const index of [442, 514, 750, 1250]) for (const side of ['left', 'right']) {
      const state = demonstration.frames[index], observation = mirrorObservation(state, side, settings);
      const recognition = mirrorRecognition(state, side, settings);
      assert.deepEqual(Object.keys(recognition), ['body', 'ground']);
      assert.deepEqual(recognition.body, observation.body);
      assert.deepEqual(recognition.ground, observation.ground);
    }
  }
});
