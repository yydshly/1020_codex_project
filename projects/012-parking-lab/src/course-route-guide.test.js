import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { EXAM_COURSES, sampleChapterPose } from './exam-courses.js';
import { BAY, corners } from './vehicle.js';
import { createCourseRouteData, courseRouteCamera, createCourseRouteGuide, COURSE_ROUTE_LAYER } from './course-route-guide.js';

const chapters = Object.values(EXAM_COURSES).flatMap(course => course.chapters);
const vector = p => new THREE.Vector3(p.x, p.y, p.z);
const near = (a, b, epsilon = 1e-8) => Math.abs(a - b) < epsilon;

test('all 22 chapter routes sample the unchanged original motion within a fixed point budget', () => {
  assert.equal(chapters.length, 22);
  for (const chapter of chapters) {
    let calls = 0;
    const original = JSON.stringify(chapter.poses);
    const data = createCourseRouteData(chapter, { sample(c, t) { calls++; return sampleChapterPose(c, t); } });
    assert.ok(calls <= 320 && data.samples.length === calls, chapter.id);
    assert.ok(near(data.samples[0].t, 0)); assert.ok(near(data.samples.at(-1).t, chapter.duration));
    for (const sample of data.samples) {
      const actual = sampleChapterPose(chapter, sample.t);
      assert.ok(near(sample.x, actual.x) && near(sample.z, actual.z), chapter.id);
      assert.ok([sample.x, sample.y, sample.z, sample.heading].every(Number.isFinite));
    }
    assert.equal(JSON.stringify(chapter.poses), original, 'guidance must not edit a demo path or its timing');
    assert.ok(data.labels.length <= 3, 'plus one current-car label leaves at most four labels');
    if (!['reverse-parking', 'side-parking'].includes(chapter.id)) assert.ok(!data.labels.some(label => label.kind === 'target'), 'a generic midpoint must not become a claimed exam parking spot');
  }
});

test('forward and reverse runs split at stationary intervals and arrows follow travel rather than the nose', () => {
  const poses = [0, 2, 4, 6, 8, 10].map(t => ({ t, speed: t < 2 || t >= 8 ? 1 : t < 4 || t >= 6 ? 0 : -1 }));
  const chapter = { id: 'test', duration: 10, poses, sceneType: 'road' };
  const sample = (_, t) => ({ x: 0, y: 0, heading: 0, speed: t < 2 || t >= 8 ? 1 : t < 4 || t >= 6 ? 0 : -1,
    z: t <= 2 ? t : t <= 4 ? 2 : t <= 6 ? 6 - t : t <= 8 ? 0 : t - 8 });
  const data = createCourseRouteData(chapter, { sample });
  assert.deepEqual(data.segments.map(s => s.direction), ['forward', 'reverse', 'forward']);
  assert.ok(near(data.totalLength, 6));
  for (const segment of data.segments) {
    assert.ok(near(segment.length, 2));
    for (let i = 1; i < segment.points.length; i++) assert.ok(vector(segment.points[i]).distanceTo(vector(segment.points[i - 1])) >= .001, 'a stopped interval creates no repeated-vertex path');
  }
  assert.equal(data.arrows.length, 3);
  for (const arrow of data.arrows) assert.equal(Math.sign(arrow.direction.z), arrow.reverse ? -1 : 1);
  assert.ok(data.arrows.every(arrow => near(arrow.position.z, 1)), 'each moving 2m run has only one central arrow, none in stopped periods');
});

test('stationary preparation and lights have no invented driving line or path arrows', () => {
  for (const id of ['prepare', 'lights']) {
    const data = createCourseRouteData(chapters.find(c => c.id === id));
    assert.equal(data.segments.length, 0); assert.equal(data.arrows.length, 0); assert.equal(data.totalLength, 0);
    assert.deepEqual(data.labels.map(label => label.text), ['起点 / 终点']);
  }
});

test('closed start and finish share one label, and real parking targets come from the known bay geometry', () => {
  const reverse = createCourseRouteData(chapters.find(c => c.id === 'reverse-parking'));
  assert.equal(reverse.labels.filter(label => label.kind === 'start-end').length, 1);
  assert.equal(reverse.labels.find(label => label.kind === 'start-end').text, '起点 / 终点 A端');
  assert.ok(!reverse.labels.some(label => label.kind === 'start' || label.kind === 'finish'));
  const target = reverse.labels.find(label => label.kind === 'target');
  assert.equal(target.text, '目标车库'); assert.equal(target.position.x, 0); assert.equal(target.position.z, (BAY.back + BAY.entrance) / 2);
  const side = chapters.find(c => c.id === 'side-parking'), sideTarget = createCourseRouteData(side).labels.find(label => label.kind === 'target');
  assert.equal(sideTarget.text, '目标车位'); assert.equal(sideTarget.position.x, side.scene.bay.x); assert.equal(sideTarget.position.z, side.scene.bay.z);
});

test('B-end label uses the original B preparation cue pose rather than an invented scoring or stop point', () => {
  const chapter = chapters.find(c => c.id === 'reverse-parking');
  const data = createCourseRouteData(chapter), label = data.labels.find(label => label.kind === 'transfer');
  const original = sampleChapterPose(chapter, chapter.cues[7].t);
  assert.equal(label.text, '换边 B端');
  assert.ok(near(label.position.x, original.x) && near(label.position.z, original.z));
  assert.ok(near(label.position.y, original.y + .065));
  assert.equal(data.labels.length, 3, 'A-end, target bay and B-end leave space for at most one current-car label');
});

test('overview bounds include vehicle extents along all chapters and fit wide and narrow canvases, including top view', () => {
  for (const chapter of chapters) {
    const data = createCourseRouteData(chapter), bounds = new THREE.Box3(vector(data.bounds.min), vector(data.bounds.max));
    for (const sample of data.samples) for (const corner of corners(sample)) {
      assert.ok(bounds.containsPoint(new THREE.Vector3(corner.x, sample.y, corner.z)), chapter.id);
      assert.ok(bounds.containsPoint(new THREE.Vector3(corner.x, sample.y + 1.6, corner.z)), chapter.id);
    }
    for (const aspect of [.6, 1.8, 3.2]) for (const top of [false, true]) {
      const fitted = courseRouteCamera(data, { aspect, top });
      const camera = new THREE.PerspectiveCamera(fitted.fov, aspect, .06, 450);
      camera.position.copy(vector(fitted.position)); camera.up.copy(vector(fitted.up)); camera.lookAt(vector(fitted.target)); camera.updateMatrixWorld(true);
      for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
        const projected = new THREE.Vector3(x, y, z).project(camera);
        assert.ok(Math.abs(projected.x) <= .88 && Math.abs(projected.y) <= .88 && projected.z > -1 && projected.z < 1,
          `${chapter.id}/${aspect}/${top}: the complete route must fit before the model moves`);
      }
      assert.deepEqual(courseRouteCamera(data, { aspect, top }), fitted, 'overview depends only on the fixed chapter bounds');
    }
  }
});

test('hill guide follows the actual raised road rather than drawing through its ramp', () => {
  const data = createCourseRouteData(chapters.find(c => c.id === 'hill-start'));
  for (const p of data.samples) {
    const height = p.z <= 0 ? 0 : p.z < 18 ? p.z * .1 : 1.8;
    assert.ok(near(p.y, height + .065));
  }
});

test('every rendered route aid stays on layer 1 and out of the physical mirror, driver and zoom cameras', () => {
  const camera = new THREE.PerspectiveCamera();
  for (const chapter of chapters) {
    const guide = createCourseRouteGuide(chapter);
    try {
      guide.setResolution(915, 465);
      assert.equal(guide.group.visible, false, 'scene must explicitly enable teaching aid visibility');
      const labels = [], styles = [];
      guide.group.traverse(object => {
        assert.equal(object.layers.mask, 1 << COURSE_ROUTE_LAYER);
        assert.equal(camera.layers.test(object.layers), false, 'default layer-zero mirror captures cannot see this object');
        assert.equal(object.castShadow, false); assert.equal(object.receiveShadow, false);
        if (object.isSprite) {
          labels.push(object.userData.label); assert.equal(object.material.sizeAttenuation, false, 'overview text must not shrink to a few pixels');
          const projectedHeight = object.scale.y * 465 / (2 * Math.tan(52 * Math.PI / 360));
          assert.ok(near(projectedHeight, 34), 'label height is consistent across full-route distances');
        }
        if (object.isLine2) styles.push({ direction: object.userData.direction, dashed: object.material.dashed, color: object.material.color.getHexString() });
      });
      assert.ok(labels.includes('当前车辆 · 模型位置')); assert.ok(labels.length <= 4);
      for (const style of styles) {
        assert.equal(style.dashed, style.direction === 'reverse');
        assert.equal(style.color, style.direction === 'reverse' ? 'e0a44d' : '398ec9');
      }
      camera.layers.enable(COURSE_ROUTE_LAYER); assert.equal(camera.layers.test(guide.group.layers), true); camera.layers.disable(COURSE_ROUTE_LAYER);
    } finally { guide.dispose(); }
  }
});

test('current vehicle marker follows the actual full car transform without changing route bounds or labels', () => {
  const guide = createCourseRouteGuide(chapters.find(c => c.id === 'hill-start'));
  try {
    const original = JSON.stringify(guide.data), matrix = new THREE.Matrix4().compose(new THREE.Vector3(3, 1.215, 12),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(-.1, .6, 0, 'YXZ')), new THREE.Vector3(1, 1, 1));
    guide.setVehicleTransform(matrix);
    const marker = guide.group.getObjectByName('course-route-current-vehicle');
    assert.ok(marker.position.distanceTo(new THREE.Vector3(0, 1.62, 1.3).applyMatrix4(matrix)) < 1e-10);
    assert.equal(JSON.stringify(guide.data), original, 'a midway comparison uses the same original chapter route');
  } finally { guide.dispose(); }
});

test('current-car text hides near start or finish while the white marker remains, and reappears midway', () => {
  for (const id of ['reverse-parking', 'straight']) {
    const chapter = chapters.find(c => c.id === id), guide = createCourseRouteGuide(chapter);
    try {
      const label = guide.group.getObjectByName('course-route-label-当前车辆 · 模型位置');
      const current = guide.group.getObjectByName('course-route-current-vehicle'), marker = current.children.find(child => child.isMesh);
      for (const sample of [guide.data.samples[0], guide.data.samples.at(-1)]) {
        for (const offset of [0, 1.49]) {
          guide.setVehicleTransform(new THREE.Matrix4().makeTranslation(sample.x + offset, sample.y, sample.z));
          assert.equal(label.visible, false, `${id}: near endpoint text must not cover its existing label or the car`);
          assert.equal(marker.visible, true, 'the distinctive white current-car marker is still shown');
        }
      }
      const middle = guide.data.samples.find(p => [guide.data.samples[0], guide.data.samples.at(-1)].every(end => Math.hypot(p.x - end.x, p.z - end.z) > 2));
      assert.ok(middle, id);
      guide.setVehicleTransform(new THREE.Matrix4().makeTranslation(middle.x, middle.y, middle.z));
      assert.equal(label.visible, true, `${id}: midway comparison must identify the current vehicle`);
      assert.equal(marker.visible, true);
    } finally { guide.dispose(); }
  }
});

test('disposing the guide removes only its own visual resources and remains idempotent', () => {
  const world = new THREE.Scene(), untouched = new THREE.Object3D(); world.add(untouched);
  const guide = createCourseRouteGuide(chapters.find(c => c.id === 'reverse-parking')); world.add(guide.group);
  const resources = new Set();
  // THREE.Sprite owns a shared module-wide quad; disposing this guide must not
  // dispose that global geometry used by unrelated/future sprites.
  guide.group.traverse(object => { if (object.geometry && !object.isSprite) resources.add(object.geometry); if (object.material) resources.add(object.material); });
  let disposals = 0; resources.forEach(item => item.addEventListener('dispose', () => disposals++));
  guide.dispose(); assert.equal(disposals, resources.size); guide.dispose(); assert.equal(disposals, resources.size);
  assert.deepEqual(world.children, [untouched]);
});
