import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTrainingCar, CAR_VISUAL_ROOT_Y } from './vehicle-visuals.js';
import { createCourseOperationVisuals } from './course-operation-visuals.js';
import { createCockpitSettings, createMirrorFrame } from './cockpit.js';
import { recommendMirrorSettings } from './mirror-fit.js';
import { createCourseMirrorSettings, recommendCourseMirrorSettings, resolveCourseMirrorSettings, setCourseMirrorSetting } from './course-mirror-settings.js';
import { createCourseMirrorRecognizer } from './course-mirror-recognition.js';
import { EXAM_COURSES, sampleChapterPose } from './exam-courses.js';
import { createDrivingYard } from './driving-yard.js';

function addPaintedYard(world) {
  const helpers = new THREE.Group(); world.add(helpers);
  return createDrivingYard({ world, helpers });
}

function fixture(t) {
  const world = new THREE.Scene(), carModel = createTrainingCar({ world }); carModel.car.position.y = CAR_VISUAL_ROOT_Y;
  createCourseOperationVisuals(carModel).update({ gear: 'R' }, null, {});
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), new THREE.MeshBasicMaterial({ color: '#767c7e', side: THREE.DoubleSide }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = .025; world.add(ground);
  const recognizer = createCourseMirrorRecognizer({ world, carModel });
  t.after(() => {
    const gs = new Set(), ms = new Set(); world.traverse(o => { if (o.geometry) gs.add(o.geometry); if (o.material) ms.add(o.material); });
    gs.forEach(g => g.dispose()); ms.forEach(m => m.dispose());
  });
  return { world, carModel, ground, recognizer };
}
const parking = () => resolveCourseMirrorSettings(recommendCourseMirrorSettings(createCourseMirrorSettings(), 'parking').settings, 'parking');

test('parking calibration improves the real body strip behind the real housing instead of only moving an aperture reference', t => {
  const { carModel, recognizer } = fixture(t), original = recommendMirrorSettings(createCockpitSettings()).settings, settings = parking();
  const fixedParts = [...carModel.externalMirrors.children].filter(o => !o.name.endsWith('surface')).map(o => [o.name, o.matrix.clone(), o.geometry.attributes.position.array.slice()]);
  const old = recognizer.recognize({ side: 'right', settings: original, columns: 80, rows: 48 });
  assert.ok(old.body.coverage > .015 && old.body.coverage < .023);
  assert.ok(old.body.housingBlockedSamples / old.body.sourceSamples > .4, 'the original right strip loses a substantial part behind the actual frame');
  for (const side of ['left', 'right']) {
    const result = recognizer.recognize({ side, settings, columns: 80, rows: 48 });
    assert.ok(result.body.visible && result.body.coverage >= .045 && result.body.coverage < .17, side);
    assert.ok(result.body.visibleSamples / result.body.sourceSamples > .65, side);
    assert.ok(result.ground.visible && result.ground.references.some(r => r.surfaceChecked && r.visible));
    if (side === 'right') assert.ok(result.body.coverage > old.body.coverage * 2.5);
    const frame = createMirrorFrame({ x: 0, z: 0, heading: 0 }, side, settings);
    assert.equal(frame.width, .19); assert.equal(frame.height, .12); assert.equal(frame.radius, 1.4);
  }
  for (const [name, matrix, positions] of fixedParts) {
    const mesh = carModel.car.getObjectByName(name); assert.deepEqual(mesh.matrix, matrix); assert.deepEqual(mesh.geometry.attributes.position.array, positions);
  }
});

test('readability uses contiguous displayed body width; magnification increases pixels without changing visibility or mirror field', t => {
  const { recognizer } = fixture(t), settings = parking();
  const normal = recognizer.recognize({ side: 'right', settings });
  const zoom = recognizer.recognize({ side: 'right', settings, displayRect: { width: 310, height: 196 } });
  assert.equal(normal.pixelMeasurement, 'reference-camera-estimate');
  assert.equal(normal.body.readable, false, 'a 45px-wide physical mirror cannot make its thin body strip readable by assertion');
  assert.ok(zoom.body.readable && zoom.body.pixelSpan > normal.body.pixelSpan * 3);
  assert.equal(zoom.body.coverage, normal.body.coverage); assert.equal(zoom.body.visibleSamples, normal.body.visibleSamples);
  const tiny = recognizer.recognize({ side: 'right', settings, unfolded: true, viewport: { width: 18, height: 12 } });
  assert.equal(tiny.body.readable, false); assert.equal(tiny.body.coverage, normal.body.coverage);
  assert.equal(normal.contrastChecked, false); assert.equal(normal.exactRayTracing, false);
});

test('body geometry masks cache across car yaw, pitch and translation but seat/angle changes rebuild them', t => {
  const { carModel, recognizer } = fixture(t), settings = parking();
  const initial = recognizer.recognize({ side: 'right', settings });
  carModel.car.position.set(3, 1.215, -7); carModel.car.quaternion.setFromEuler(new THREE.Euler(-.1, .7, 0, 'YXZ'));
  const moved = recognizer.recognize({ side: 'right', settings });
  assert.equal(moved.bodyMaskBuilds, initial.bodyMaskBuilds); assert.equal(moved.body.coverage, initial.body.coverage);
  const next = { ...settings, right: { ...settings.right, yaw: settings.right.yaw + .4 } };
  assert.equal(recognizer.recognize({ side: 'right', settings: next }).bodyMaskBuilds, initial.bodyMaskBuilds + 1);
});

test('a real opaque obstruction between the driver eye and glass overrides a positive cached body aperture', t => {
  const { world, recognizer } = fixture(t), settings = parking();
  const before = recognizer.recognize({ side: 'right', settings }); assert.ok(before.body.visible);
  const blocker = new THREE.Mesh(new THREE.BoxGeometry(.7, .6, .6), new THREE.MeshBasicMaterial()); blocker.position.set(-.315, 1.165, 1.48); world.add(blocker);
  const blocked = recognizer.recognize({ side: 'right', settings });
  assert.equal(blocked.body.visible, false); assert.equal(blocked.body.readable, false); assert.equal(blocked.body.reason, 'occluded');
  assert.equal(blocked.bodyMaskBuilds, before.bodyMaskBuilds, 'the sparse real-world path test still runs when the car-only mask is cached');
  blocker.layers.set(1);
  assert.ok(recognizer.recognize({ side: 'right', settings }).body.visible, 'nonphysical teaching layer cannot block the real mirror');
});

test('near-ground references require a captured real surface, not just an unoccluded point in empty space', t => {
  const { world, ground, recognizer } = fixture(t), settings = parking();
  assert.ok(recognizer.recognize({ side: 'right', settings }).ground.visible);
  world.remove(ground);
  assert.equal(recognizer.recognize({ side: 'right', settings }).ground.visible, false);
  world.add(ground);
});

test('both return-wheel chapters retain the real bay side line, and world occluders make it unavailable', t => {
  const { world, carModel, recognizer } = fixture(t), settings = parking(), chapter = EXAM_COURSES.subject2.chapters[0];
  addPaintedYard(world);
  for (const [time, side] of [[12.4, 'right'], [47.55, 'left']]) {
    const pose = sampleChapterPose(chapter, time); carModel.car.position.set(pose.x, CAR_VISUAL_ROOT_Y, pose.z); carModel.car.rotation.y = pose.heading;
    const result = recognizer.recognize({ side, settings, chapterId: chapter.id });
    assert.ok(result.lineVisible && result.lineReadable && result.line.pixelSpan >= 8, `${side}: the actual return-wheel line remains usable`);
  }
  const pose = sampleChapterPose(chapter, 12.4); carModel.car.position.set(pose.x, CAR_VISUAL_ROOT_Y, pose.z); carModel.car.rotation.y = pose.heading;
  const wall = new THREE.Mesh(new THREE.BoxGeometry(.5, 2, 5.2), new THREE.MeshBasicMaterial()); wall.position.set(-1.15, 1, -3.95); world.add(wall);
  const blocked = recognizer.recognize({ side: 'right', settings, chapterId: chapter.id });
  assert.equal(blocked.lineVisible, false); assert.equal(blocked.lineReadable, false); assert.equal(blocked.line.reason, 'occluded');
  assert.equal(recognizer.recognize({ side: 'right', settings, chapterId: 'straight' }).lineVisible, null, 'other chapters never borrow the parking yard bay');
});

test('a bare ground cannot be called a bay line, and hidden or moved paint is not replaced with theoretical BAY coordinates', t => {
  const { world, carModel, recognizer } = fixture(t), settings = parking(), chapter = EXAM_COURSES.subject2.chapters[0];
  const pose = sampleChapterPose(chapter, 12.4); carModel.car.position.set(pose.x, CAR_VISUAL_ROOT_Y, pose.z); carModel.car.rotation.y = pose.heading;
  const query = () => recognizer.recognize({ side: 'right', settings, chapterId: chapter.id });
  assert.equal(query().lineVisible, false); assert.equal(query().line.reason, 'surface-missing');
  const yard = addPaintedYard(world), paint = yard.bayLines[0];
  assert.ok(query().lineVisible); assert.equal(query().line.objectName, 'bay-paint-0');
  paint.visible = false; assert.equal(query().line.reason, 'surface-hidden'); paint.visible = true;
  paint.position.x -= 100; assert.equal(query().lineVisible, false, 'moving actual paint does not leave a ghost line at the old coordinates'); paint.position.x += 100;
  paint.material = paint.material.clone(); paint.material.color.set('#38a65e');
  assert.equal(query().line.materialColor, '#38a65e', 'reference identity carries the actual rendered material, not an assumed yellow palette');
  paint.material.visible = false; assert.equal(query().line.reason, 'surface-hidden'); paint.material.visible = true;
  paint.material.colorWrite = false; assert.equal(query().line.reason, 'surface-hidden');
});

test('left/right references keep actual side-line identities and never borrow the transverse bay bottom', t => {
  const { world, carModel, recognizer } = fixture(t), settings = parking(), yard = addPaintedYard(world);
  carModel.car.position.set(0, CAR_VISUAL_ROOT_Y, -3); carModel.car.rotation.y = 0;
  for (const [side, index] of [['left', 1], ['right', 0]]) {
    const result = recognizer.recognize({ side, settings, chapterId: 'reverse-parking' });
    assert.equal(result.line.objectName, `bay-paint-${index}`);
    assert.ok(result.lineVisible, `${side}: the same physical bay side is visible`);
    assert.ok(result.line.observedPaintNames.includes(`bay-paint-${index}`));
  }
  yard.bayLines[0].visible = false; yard.bayLines[1].visible = false;
  assert.ok(yard.bayLines[2].visible);
  for (const side of ['left', 'right']) {
    const result = recognizer.recognize({ side, settings, chapterId: 'reverse-parking' });
    assert.equal(result.lineVisible, false); assert.equal(result.line.reason, 'surface-hidden');
  }
});

test('source and display resolution can make a captured long line too thin to identify', t => {
  const { world, carModel, recognizer } = fixture(t), settings = parking(); addPaintedYard(world);
  const pose = sampleChapterPose(EXAM_COURSES.subject2.chapters[0], 12.4);
  carModel.car.position.set(pose.x, CAR_VISUAL_ROOT_Y, pose.z); carModel.car.rotation.y = pose.heading;
  const full = recognizer.recognize({ side: 'right', settings, chapterId: 'reverse-parking', unfolded: true, viewport: { width: 310, height: 196 } });
  assert.ok(full.lineVisible && full.lineReadable); assert.ok(full.line.widthPixels > .75 && full.line.sourceWidthPixels >= 1);
  const lowSource = recognizer.recognize({ side: 'right', settings, chapterId: 'reverse-parking', unfolded: true,
    viewport: { width: 310, height: 196 }, sourceResolution: { width: 8, height: 5 } });
  assert.ok(lowSource.lineVisible); assert.equal(lowSource.lineReadable, false); assert.equal(lowSource.line.reason, 'too-thin');
  const tinyDisplay = recognizer.recognize({ side: 'right', settings, chapterId: 'reverse-parking', unfolded: true, viewport: { width: 8, height: 5 } });
  assert.equal(tinyDisplay.lineReadable, false);
});

test('a partial external screen cannot keep claiming the full cached body width and readability', t => {
  const { world, recognizer } = fixture(t), settings = parking();
  const options = { side: 'right', settings, displayRect: { width: 310, height: 196 } }, before = recognizer.recognize(options);
  assert.ok(before.body.readable);
  const screen = new THREE.Mesh(new THREE.BoxGeometry(.7, .008, .6), new THREE.MeshBasicMaterial()); screen.position.set(-.315, 1.135, 1.48); world.add(screen);
  const after = recognizer.recognize(options);
  assert.ok(after.body.sceneBlockedSamples > 0 && after.body.visibleSamples > 0);
  assert.ok(after.body.coverage < before.body.coverage && after.body.pixelArea < before.body.pixelArea);
  assert.equal(after.body.readable, false); assert.equal(after.body.reason, 'partially-occluded'); assert.equal(after.body.readabilityUncertain, true);
  assert.equal(after.bodyMaskBuilds, before.bodyMaskBuilds, 'world-only rechecks reuse the actual self-occlusion mask');
});

test('near-body broadphase prunes far scenery batches but keeps a real nearby instance occluder', t => {
  const { world, recognizer } = fixture(t), settings = parking();
  const batch = new THREE.InstancedMesh(new THREE.BoxGeometry(.7, .6, .6), new THREE.MeshBasicMaterial(), 101);
  for (let i = 0; i < 101; i++) batch.setMatrixAt(i, new THREE.Matrix4().makeTranslation(i % 2 ? -80 : 80, 1, i - 50));
  world.add(batch);
  assert.ok(recognizer.recognize({ side: 'right', settings }).body.visible);
  batch.setMatrixAt(100, new THREE.Matrix4().makeTranslation(-.315, 1.165, 1.48)); batch.instanceMatrix.needsUpdate = true;
  batch.computeBoundingSphere();
  const result = recognizer.recognize({ side: 'right', settings });
  assert.equal(result.body.visible, false); assert.equal(result.body.reason, 'occluded');
});

test('explicit parking recommendations stay bounded and honest for extreme legal eyes and preserve saved profiles', () => {
  for (const [height, fore] of [[1.15, .9], [1.38, 1.3]]) {
    const saved = setCourseMirrorSetting(setCourseMirrorSetting(createCourseMirrorSettings(), 'parking', 'seatHeight', height), 'parking', 'seatFore', fore);
    const original = structuredClone(saved), result = recommendCourseMirrorSettings(saved, 'parking');
    assert.deepEqual(saved, original); assert.deepEqual(result.settings.road, saved.road);
    assert.deepEqual(recommendCourseMirrorSettings(result.settings, 'parking'), result);
    for (const side of ['left', 'right']) {
      assert.ok(result.settings.parking[side].yaw >= -5 && result.settings.parking[side].yaw <= 25);
      assert.ok(result.settings.parking[side].pitch >= -38 && result.settings.parking[side].pitch <= -5);
      assert.ok(result.report[side].body.visible && result.report[side].ground.visible);
      assert.equal(result.report[side].occlusionChecked, true);
      if (result.report[side].quality === 'good') assert.ok(result.report[side].teachingCalibration.body.readable);
    }
  }
});
