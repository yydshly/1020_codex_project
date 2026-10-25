import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createMirrorRenderer } from './mirrors.js';
import { createCockpitSettings, createMirrorFrame, projectMirrorPoint, sampleMirrorRay, setCockpitSetting } from './cockpit.js';
import { createMirrorOptics } from './mirror-optics.js';
import { mirrorObservation, mirrorRecognition } from './mirror-observation.js';
import { createDemonstration } from './lesson.js';
import { CAR, localToWorld } from './vehicle.js';
import { createMirrorClipPlane } from './mirror-clip.js';
import { courseMirrorClipPlane } from './course-mirrors.js';

function fixture(t, { physical = false } = {}) {
  const originalDocument = globalThis.document, originalObserver = globalThis.ResizeObserver;
  const canvases = [], elements = new Map();
  const element = rect => ({ style: {}, hidden: false, rect, children: [], clientWidth: rect.width, clientHeight: rect.height,
    getBoundingClientRect() { return this.rect; }, prepend(child) { this.children.unshift(child); } });
  elements.set('scene', element({ left: 0, top: 0, width: 1000, height: 700 }));
  for (const [index, side] of ['left', 'right'].entries()) {
    elements.set(`${side}-mirror-image`, element({ left: index * 350, top: 20, width: 316, height: 200 }));
    for (const marker of ['wheel', 'corner', 'body', 'ground', 'side-line', 'back-line', 'entrance-line']) elements.set(`${side}-${marker}-marker`, element({ left: 0, top: 0, width: 0, height: 0 }));
  }
  globalThis.document = {
    getElementById: id => elements.get(id),
    createElement(tag) {
      assert.equal(tag, 'canvas');
      const canvas = { style: {}, hidden: false, width: 0, height: 0, strokes: [], texts: [], setAttribute() {},
        getContext: () => context,
        // Test-only token: no production screenshot is fabricated or written.
        toDataURL: () => 'data:image/png;base64,TEST_ONLY',
      };
      const context = { createImageData: (width, height) => ({ data: new Uint8ClampedArray(width * height * 4) }),
        putImageData(data) { canvas.capturedPixels = data.data; },
        beginPath() { this.path = []; }, moveTo(x, y) { this.path.push([x, y]); }, lineTo(x, y) { this.path.push([x, y]); },
        stroke() { canvas.strokes.push({ color: this.strokeStyle, width: this.lineWidth, path: this.path.map(point => [...point]) }); },
        fillRect() {}, fillText(text) { canvas.texts.push(text); },
      };
      canvases.push(canvas); return canvas;
    },
  };
  globalThis.ResizeObserver = class { observe() {} };
  t.after(() => { globalThis.document = originalDocument; globalThis.ResizeObserver = originalObserver; });
  const world = new THREE.Scene(), car = new THREE.Group();
  const carModel = { car, cabin: new THREE.Group(), cockpit: new THREE.Group(), externalMirrors: new THREE.Group() };
  car.add(carModel.cabin, carModel.cockpit, carModel.externalMirrors); world.add(car);
  carModel.cabin.visible = false; carModel.cockpit.visible = true; carModel.externalMirrors.visible = true;
  if (physical) {
    car.position.y = .015;
    carModel.mirrorSurfaces = {};
    for (const side of ['left', 'right']) {
      const surface = new THREE.Mesh(new THREE.PlaneGeometry(.19, .12, 24, 16), new THREE.MeshBasicMaterial());
      carModel.externalMirrors.add(surface); carModel.mirrorSurfaces[side] = surface;
    }
  }
  const calls = [];
  const renderer = {
    autoClear: false, shadowMap: { autoUpdate: false }, target: { name: 'previous-target', width: 77, height: 55 },
    viewport: new THREE.Vector4(3, 4, 501, 302), scissor: new THREE.Vector4(5, 6, 201, 102), scissorTest: true,
    getRenderTarget() { return this.target; },
    setRenderTarget(value) { this.target = value; if (value?.width) this.viewport.set(0, 0, value.width, value.height); },
    getViewport(value) { return value.copy(this.viewport); },
    getScissor(value) { return value.copy(this.scissor); },
    setViewport(...values) { if (values[0]?.isVector4) this.viewport.copy(values[0]); else this.viewport.set(...values); },
    setScissor(...values) { if (values[0]?.isVector4) this.scissor.copy(values[0]); else this.scissor.set(...values); },
    getScissorTest() { return this.scissorTest; }, setScissorTest(value) { this.scissorTest = value; },
    getPixelRatio: () => 1,
    render(scene, camera) {
      scene.updateMatrixWorld(true); camera.updateMatrixWorld(true);
      const kind = scene === world ? 'source' : 'overlay';
      if (this.failRenderKind === kind) { this.failedKind = kind; this.failedClippingPlanes = this.clippingPlanes; throw new Error(`test ${kind} renderer failure`); }
      if (this.failRender) throw new Error('test renderer failure');
      if (scene === world && carModel.mirrorSurfaces) {
        for (const surface of Object.values(carModel.mirrorSurfaces)) {
          let visible = true;
          for (let object = surface; object; object = object.parent) visible &&= object.visible;
          assert.ok(!visible || surface.material.map !== this.target?.texture, 'Cannot sample the same texture that the source pass writes.');
        }
      }
      calls.push({ kind: scene === world ? 'source' : 'overlay', scene, target: this.target,
        position: camera.position.toArray(), up: camera.up.toArray(), direction: camera.getWorldDirection(new THREE.Vector3()).toArray(),
        fov: camera.fov, aspect: camera.aspect,
        clippingPlanes: this.clippingPlanes, localClippingEnabled: this.localClippingEnabled,
        uvs: scene === world ? null : [...scene.children[0].geometry.getAttribute('uv').array],
        map: scene === world ? null : scene.children[0].material.map,
        carVisibility: [carModel.cabin.visible, carModel.cockpit.visible, carModel.externalMirrors.visible],
        surfaceVisibility: Object.values(carModel.mirrorSurfaces ?? {}).map(surface => surface.visible),
      });
    },
    readRenderTargetPixels(target, x, y, width, height, bytes) {
      for (let row = 0; row < height; row++) for (let column = 0; column < width; column++) {
        const index = (row * width + column) * 4;
        bytes[index] = column % 256; bytes[index + 1] = row % 256; bytes[index + 3] = 255;
      }
    },
  };
  const mirrors = createMirrorRenderer({ renderer, world, carModel });
  return { mirrors, renderer, world, carModel, calls, canvases, elements };
}

const vectorClose = (actual, expected, tolerance = 1e-10) => assert.ok(actual.every((value, index) => Math.abs(value - expected[index]) < tolerance), `${actual} != ${expected}`);
const snapshot = ({ renderer, carModel }) => ({ target: renderer.target, viewport: renderer.viewport.toArray(), scissor: renderer.scissor.toArray(),
  scissorTest: renderer.scissorTest, autoClear: renderer.autoClear, shadowAutoUpdate: renderer.shadowMap.autoUpdate,
  clippingPlanes: renderer.clippingPlanes, localClippingEnabled: renderer.localClippingEnabled,
  visibility: [carModel.cabin.visible, carModel.cockpit.visible, carModel.externalMirrors.visible],
  surfaces: Object.values(carModel.mirrorSurfaces ?? {}).map(surface => surface.visible) });

test('shared mirror clipping rejects virtual-eye-side false objects and preserves true rays / convex edges in world and car coordinates', t => {
  const settings = createCockpitSettings(), pose = { x: 4, z: -3, heading: 1.13 };
  const carMatrix = new THREE.Matrix4().compose(new THREE.Vector3(pose.x, .015, pose.z),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), pose.heading), new THREE.Vector3(1, 1, 1));
  for (const side of ['left', 'right']) {
    const frame = createMirrorFrame(pose, side, settings), optics = createMirrorOptics(frame), plane = createMirrorClipPlane(frame);
    const local = createMirrorFrame({ x: 0, z: 0, heading: 0 }, side, settings);
    const transformed = createMirrorClipPlane(local, { matrix: carMatrix, rootY: .015 });
    const compatible = courseMirrorClipPlane(local, carMatrix);
    assert.ok(plane.normal.distanceTo(transformed.normal) < 1e-10); assert.ok(Math.abs(plane.constant - transformed.constant) < 1e-10);
    assert.ok(compatible.normal.distanceTo(transformed.normal) < 1e-10); assert.equal(compatible.constant, transformed.constant);
    const source = new THREE.Vector3(optics.position.x, optics.position.y, optics.position.z);
    const direction = new THREE.Vector3(optics.forward.x, optics.forward.y, optics.forward.z);
    const cube = new THREE.Mesh(new THREE.BoxGeometry(.025, .025, .025), new THREE.MeshBasicMaterial());
    cube.position.copy(source).addScaledVector(direction, .15); cube.updateMatrixWorld(true);
    t.after(() => { cube.geometry.dispose(); cube.material.dispose(); });
    const phantom = new THREE.Raycaster(source, direction, .04, 5).intersectObject(cube);
    assert.ok(phantom.length > 0, 'the fitted source camera would really see an object before the glass');
    assert.ok(plane.distanceToPoint(phantom[0].point) < -.1, 'shared clipping removes that false source-camera hit');
    const ray = sampleMirrorRay(frame, 0, 0), origin = new THREE.Vector3(ray.origin.x, ray.origin.y, ray.origin.z);
    const reflected = new THREE.Vector3(ray.direction.x, ray.direction.y, ray.direction.z);
    assert.equal(new THREE.Raycaster(origin, reflected, .001, 5).intersectObject(cube).length, 0, 'the actual finite mirror never reflected that object');
    assert.ok(plane.distanceToPoint(origin.clone().addScaledVector(reflected, 5)) > 0, 'true reflected scenery is retained');
    for (const u of [-1, 0, 1]) for (const v of [-1, 0, 1]) {
      const sample = sampleMirrorRay(frame, u, v);
      assert.ok(plane.distanceToPoint(new THREE.Vector3(sample.origin.x, sample.origin.y, sample.origin.z)) > 0, 'full edge sag remains on the retained side');
    }
    const tiltedMatrix = new THREE.Matrix4().compose(new THREE.Vector3(2, 1.215, -7),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(-.1, .7, .025)), new THREE.Vector3(1, 1, 1));
    const tilted = createMirrorClipPlane(local, { matrix: tiltedMatrix, rootY: .015 });
    const badLocal = new THREE.Vector3(createMirrorOptics(local).position.x, createMirrorOptics(local).position.y - .015, createMirrorOptics(local).position.z);
    assert.ok(tilted.distanceToPoint(badLocal.applyMatrix4(tiltedMatrix)) < 0, 'pitch/height must not swap the plane side');
  }
});

test('original parking prepare applies one clip per mirror and restores caller clips before main / teaching views, including legacy fixtures', t => {
  const f = fixture(t, { physical: true }), settings = createCockpitSettings(), pose = { x: 3, z: -2, heading: .7 };
  for (const original of [undefined, [new THREE.Plane(new THREE.Vector3(0, 1, 0), 20)]]) {
    f.renderer.clippingPlanes = original; f.renderer.localClippingEnabled = true; f.calls.length = 0;
    const before = snapshot(f);
    f.mirrors.prepare(pose, settings);
    assert.deepEqual(snapshot(f), before); assert.strictEqual(f.renderer.clippingPlanes, original);
    const sourceCalls = f.calls.filter(call => call.kind === 'source'); assert.equal(sourceCalls.length, 2);
    for (const [i, side] of ['left', 'right'].entries()) {
      const clips = sourceCalls[i].clippingPlanes; assert.equal(clips.length, (original?.length ?? 0) + 1);
      if (original) assert.strictEqual(clips[0], original[0]);
      const optics = createMirrorOptics(createMirrorFrame(pose, side, settings));
      const phantom = new THREE.Vector3(optics.position.x, optics.position.y, optics.position.z)
        .addScaledVector(new THREE.Vector3(optics.forward.x, optics.forward.y, optics.forward.z), .15);
      assert.ok(clips.at(-1).distanceToPoint(phantom) < 0, `${side}: source clipping has the correct reflecting side`);
    }
    f.mirrors.renderOverlay();
    for (const call of f.calls.filter(call => call.kind === 'overlay')) assert.strictEqual(call.clippingPlanes, original, 'teaching overlays must not inherit mirror planes');
    assert.strictEqual(f.renderer.clippingPlanes, original); assert.equal(f.renderer.localClippingEnabled, true);
  }
});

test('original review capture removes the source clip before each image pass and restores clip references on source / overlay failures', t => {
  const f = fixture(t), settings = createCockpitSettings(), pose = { x: 2, z: -3, heading: -.4 };
  for (const original of [undefined, [new THREE.Plane(new THREE.Vector3(0, 1, 0), 20)]]) {
    f.renderer.clippingPlanes = original; f.renderer.localClippingEnabled = false; f.calls.length = 0;
    const before = snapshot(f);
    f.mirrors.capture(pose, settings, { annotations: false });
    assert.deepEqual(f.calls.map(call => call.kind), ['source', 'overlay', 'source', 'overlay']);
    for (const call of f.calls) {
      if (call.kind === 'source') assert.equal(call.clippingPlanes.length, (original?.length ?? 0) + 1);
      else assert.strictEqual(call.clippingPlanes, original, 'mirror clip would wrongly cut a flat review image');
    }
    assert.deepEqual(snapshot(f), before); assert.strictEqual(f.renderer.clippingPlanes, original);
    for (const kind of ['source', 'overlay']) {
      f.renderer.failRenderKind = kind;
      assert.throws(() => f.mirrors.capture(pose, settings, { annotations: false }), new RegExp(`test ${kind} renderer failure`));
      if (kind === 'overlay') assert.strictEqual(f.renderer.failedClippingPlanes, original);
      else assert.equal(f.renderer.failedClippingPlanes.length, (original?.length ?? 0) + 1);
      assert.deepEqual(snapshot(f), before); assert.strictEqual(f.renderer.clippingPlanes, original);
      assert.equal(f.renderer.localClippingEnabled, false);
    }
    f.renderer.failRenderKind = null;
  }
});

test('capture highlights real side-panel height and suppresses annotated references behind solid geometry', t => {
  const f = fixture(t), settings = createCockpitSettings(), state = { x: 0, z: 0, heading: 0 };
  f.mirrors.capture(state, settings);
  const captures = f.canvases.filter(canvas => canvas.width === 480);
  for (const [index, side] of ['left', 'right'].entries()) {
    const cyan = captures[index].strokes.filter(stroke => stroke.color === '#5fc5ff');
    assert.ok(cyan.length, 'a visible side panel has a highlight');
    const frame = createMirrorFrame(state, side, settings), sign = side === 'left' ? 1 : -1;
    const realPanel = Array.from({ length: 401 }, (_, i) => projectMirrorPoint(frame, {
      x: sign * (CAR.width / 2 - .005), y: .65, z: .25 + .85 * i / 400,
    })).filter(point => point.visible).map(point => [point.x * 480, point.y * 304]);
    for (const stroke of cyan) for (const [x, y] of stroke.path) {
      assert.ok(Math.min(...realPanel.map(([px, py]) => Math.hypot(x - px, y - py))) < .5,
        'the highlight must follow a real body surface rather than a line projected on the ground');
    }
    assert.match(captures[index].texts.join(' '), /车身参照.*库侧线/);
    assert.match(captures[index].texts.join(' '), /库口外沿/);
    assert.doesNotMatch(captures[index].texts.join(' '), /库底线/, 'the unseen bay back cannot label a visible mouth edge');
  }
  const wall = new THREE.Mesh(new THREE.BoxGeometry(10, 3, .1), new THREE.MeshBasicMaterial());
  wall.position.set(0, 1.5, 1.4); f.world.add(wall);
  t.after(() => { wall.geometry.dispose(); wall.material.dispose(); });
  f.mirrors.invalidate();
  f.mirrors.capture(state, settings);
  for (const canvas of f.canvases.filter(canvas => canvas.width === 480).slice(-2)) {
    assert.equal(canvas.strokes.length, 0, 'solid geometry must hide both body and paint teaching strokes');
    assert.doesNotMatch(canvas.texts.join(' '), /库口外沿|库底线/, 'hidden stripe labels must also disappear');
  }
});

test('live mirrors use fitted world cameras and unflipped ray UVs; magnifying preserves both', t => {
  const f = fixture(t), settings = createCockpitSettings(), state = { x: 3, z: -2, heading: 0.7 };
  f.mirrors.render(state, settings, false);
  const initialSources = f.calls.filter(call => call.kind === 'source');
  const initialOverlays = f.calls.filter(call => call.kind === 'overlay');
  for (const [i, side] of ['left', 'right'].entries()) {
    const optics = createMirrorOptics(createMirrorFrame(state, side, settings));
    vectorClose(initialSources[i].position, [optics.position.x, optics.position.y, optics.position.z]);
    vectorClose(initialSources[i].direction, [optics.forward.x, optics.forward.y, optics.forward.z]);
    vectorClose(initialSources[i].up, [optics.up.x, optics.up.y, optics.up.z]);
    assert.equal(initialSources[i].aspect, 1.58);
    assert.ok(Math.abs(initialSources[i].fov - optics.fov) < 1e-10);
    assert.deepEqual(initialOverlays[i].uvs, [...optics.uvs]);
    assert.deepEqual(initialSources[i].carVisibility, [true, false, false]);
    f.elements.get(`${side}-mirror-image`).rect.width *= 2;
    f.elements.get(`${side}-mirror-image`).rect.height *= 2;
  }
  f.calls.length = 0; f.mirrors.invalidate(); f.mirrors.render(state, settings, false);
  const enlargedSources = f.calls.filter(call => call.kind === 'source'), enlargedOverlays = f.calls.filter(call => call.kind === 'overlay');
  for (let i = 0; i < 2; i++) {
    for (const key of ['position', 'up', 'direction', 'fov', 'aspect']) assert.deepEqual(enlargedSources[i][key], initialSources[i][key]);
    assert.deepEqual(enlargedOverlays[i].uvs, initialOverlays[i].uvs);
  }
  assert.deepEqual([f.carModel.cabin.visible, f.carModel.cockpit.visible, f.carModel.externalMirrors.visible], [false, true, true]);
});

test('review capture uses live optics, only flips pixel rows, and restores renderer/material/car state', t => {
  const f = fixture(t), settings = createCockpitSettings(), state = { x: 0, z: 0, heading: 0 };
  f.mirrors.render(state, settings, false);
  const liveSources = f.calls.filter(call => call.kind === 'source'), liveOverlays = f.calls.filter(call => call.kind === 'overlay');
  f.renderer.viewport.set(7, 8, 333, 222); f.renderer.scissor.set(9, 10, 111, 88); f.renderer.scissorTest = true;
  const before = snapshot(f); f.calls.length = 0;
  const images = f.mirrors.capture(state, settings, { annotations: false });
  assert.deepEqual(Object.keys(images), ['left', 'right']);
  assert.deepEqual(snapshot(f), before);
  const capturedSources = f.calls.filter(call => call.kind === 'source'), capturedOverlays = f.calls.filter(call => call.kind === 'overlay');
  for (let i = 0; i < 2; i++) {
    for (const key of ['position', 'up', 'direction', 'fov', 'aspect']) assert.deepEqual(capturedSources[i][key], liveSources[i][key]);
    assert.deepEqual(capturedOverlays[i].uvs, liveOverlays[i].uvs);
    assert.notEqual(capturedOverlays[i].map, liveOverlays[i].map);
    assert.equal(capturedOverlays[i].scene.children[0].material.map, liveOverlays[i].map);
  }
  for (const canvas of f.canvases.filter(value => value.capturedPixels)) {
    const pixels = canvas.capturedPixels;
    assert.deepEqual([...pixels.slice(0, 4)], [0, 303 % 256, 0, 255]);
    assert.equal(pixels[4], 1, 'X ordering must not be flipped a second time.');
    assert.equal(pixels[(303 * 480) * 4 + 1], 0);
  }
});

test('capture restores renderer and vehicle visibility even if scene rendering throws', t => {
  const f = fixture(t), before = snapshot(f); f.renderer.failRender = true;
  assert.throws(() => f.mirrors.capture({ x: 0, z: 0, heading: 0 }, createCockpitSettings()), /test renderer failure/);
  assert.deepEqual(snapshot(f), before);
});

test('live source and overlay failures both restore every renderer setting and vehicle visibility', t => {
  const f = fixture(t), settings = createCockpitSettings(), state = { x: 0, z: 0, heading: 0 };
  for (const kind of ['source', 'overlay']) {
    f.calls.length = 0; f.renderer.failedKind = null; f.renderer.failRenderKind = kind;
    f.renderer.autoClear = true; f.renderer.shadowMap.autoUpdate = true;
    f.renderer.viewport.set(11, 12, 431, 287); f.renderer.scissor.set(13, 14, 213, 107);
    f.renderer.scissorTest = false;
    const before = snapshot(f);
    assert.throws(() => f.mirrors.render(state, settings, true), new RegExp(`test ${kind} renderer failure`));
    assert.equal(f.renderer.failedKind, kind);
    if (kind === 'overlay') assert.equal(f.calls.filter(call => call.kind === 'source').length, 2, 'Both source passes must finish before the injected overlay failure.');
    assert.deepEqual(snapshot(f), before, `${kind} failure leaked render state`);
  }
});

test('labels use physical mirror projection and real Three ray occlusion, respecting hidden/transparent objects', t => {
  const f = fixture(t), settings = setCockpitSetting(createCockpitSettings(), 'left.yaw', 3), state = { x: 0, z: 0, heading: 0 };
  f.mirrors.render(state, settings, true);
  const label = f.elements.get('left-wheel-marker');
  const wheel = { ...localToWorld(state, CAR.trackWidth / 2 + CAR.tireWidth / 2, .10), y: .43 };
  const projected = projectMirrorPoint(createMirrorFrame(state, 'left', settings), wheel);
  assert.equal(projected.visible, true); assert.equal(label.hidden, false);
  assert.ok(Math.abs(parseFloat(label.style.left) / 100 - projected.x) < 1e-12);
  assert.ok(Math.abs(parseFloat(label.style.top) / 100 - projected.y) < 1e-12);
  const obstacle = new THREE.Mesh(new THREE.BoxGeometry(.18, .18, .18), new THREE.MeshBasicMaterial());
  obstacle.position.set((projected.origin.x + wheel.x) / 2, (projected.origin.y + wheel.y) / 2, (projected.origin.z + wheel.z) / 2);
  const parent = new THREE.Group(); parent.add(obstacle); f.world.add(parent);
  f.mirrors.render(state, settings, true); assert.equal(label.hidden, true);
  parent.visible = false;
  f.mirrors.render(state, settings, true); assert.equal(label.hidden, false);
  parent.visible = true; obstacle.material.transparent = true; obstacle.material.opacity = .3;
  f.mirrors.render(state, settings, true); assert.equal(label.hidden, false);
  f.mirrors.render(state, settings, false); assert.equal(label.hidden, true);
});

test('recognition guides are opt-in and place body/ground markers only at physically visible unoccluded references', t => {
  const f = fixture(t), settings = createCockpitSettings(), state = { x: 0, z: 0, heading: 0 };
  const guides = ['left', 'right'].flatMap(side => ['body', 'ground'].map(name => ({
    side, name, element: f.elements.get(`${side}-${name}-marker`), reference: mirrorRecognition(state, side, settings)[name],
  })));
  f.mirrors.render(state, settings, false);
  for (const guide of guides) assert.equal(guide.element.hidden, true, 'recognition starts disabled');
  f.mirrors.setRecognitionGuides(true);
  f.mirrors.render(state, settings, false); // Independent of the older wheel/corner label switch.
  for (const { side, element, reference } of guides) {
    const projected = projectMirrorPoint(createMirrorFrame(state, side, settings), reference.point);
    assert.equal(projected.visible, true); assert.equal(element.hidden, false);
    assert.ok(Math.abs(parseFloat(element.style.left) / 100 - projected.x) < 1e-12);
    assert.ok(Math.abs(parseFloat(element.style.top) / 100 - projected.y) < 1e-12);
    const obstacle = new THREE.Mesh(new THREE.BoxGeometry(.18, .18, .18), new THREE.MeshBasicMaterial());
    obstacle.position.set((projected.origin.x + reference.point.x) / 2,
      (projected.origin.y + reference.point.y) / 2, (projected.origin.z + reference.point.z) / 2);
    f.world.add(obstacle);
    t.after(() => { obstacle.geometry.dispose(); obstacle.material.dispose(); });
  }
  // The small cubes cover the original representative points, but a different
  // exposed piece of body/ground is a valid fallback. A full wall hides all of
  // those real references, so none should then be labelled.
  const wall = new THREE.Mesh(new THREE.BoxGeometry(10, 3, .1), new THREE.MeshBasicMaterial());
  wall.position.set(0, 1.5, 1.4); f.world.add(wall);
  t.after(() => { wall.geometry.dispose(); wall.material.dispose(); });
  f.mirrors.render(state, settings, false);
  for (const guide of guides) assert.equal(guide.element.hidden, true, 'solid geometry hides the reference');
  f.mirrors.setRecognitionGuides(false);
  f.mirrors.render({ ...state, x: 10 }, settings, false);
  for (const guide of guides) assert.equal(guide.element.hidden, true, 'turning guides off stays effective after moving');
});

test('observations respect solid occlusion and keep pose, side, mirror and eye caches separate', t => {
  const f = fixture(t), settings = createCockpitSettings();
  const approaching = createDemonstration().frames[750], inside = { x: 0, z: -3, heading: 0 };
  const geometric = mirrorObservation(approaching, 'right', settings);
  assert.equal(geometric.lineVisible, true); assert.equal(geometric.cornerVisible, true);
  // Static wall separates the approaching mirror from every point on the bay;
  // the inside pose is behind this wall, looking away from it.
  const wall = new THREE.Mesh(new THREE.BoxGeometry(20, 3, .2), new THREE.MeshBasicMaterial());
  wall.position.set(0, 1.5, 0); f.world.add(wall);
  // A second, small static obstacle hides only the first in-aperture sample
  // from the inside pose. A later exposed section must still count as visible.
  const first = mirrorObservation(inside, 'right', settings).lineSamples.find(sample => sample.visible);
  assert.ok(first);
  const partial = new THREE.Mesh(new THREE.BoxGeometry(.1, .1, .1), new THREE.MeshBasicMaterial());
  partial.position.set((first.origin.x + first.point.x) / 2, (first.origin.y + first.point.y) / 2, (first.origin.z + first.point.z) / 2);
  f.world.add(partial);
  t.after(() => { for (const object of [wall, partial]) { object.geometry.dispose(); object.material.dispose(); } });
  f.world.updateMatrixWorld(true);
  const direction = new THREE.Vector3(first.point.x - first.origin.x, first.point.y - first.origin.y, first.point.z - first.origin.z);
  const occlusionRay = new THREE.Raycaster(new THREE.Vector3(first.origin.x, first.origin.y, first.origin.z), direction.normalize());
  assert.ok(occlusionRay.intersectObject(partial).length, 'the first geometric sample is really occluded');
  const before = snapshot(f);
  const blocked = f.mirrors.observe(approaching, 'right', settings);
  assert.equal(blocked.occlusionChecked, true);
  assert.equal(blocked.lineVisible, false); assert.equal(blocked.cornerVisible, false);
  const exposed = f.mirrors.observe(inside, 'right', settings);
  assert.equal(exposed.lineVisible, true, 'moving behind the wall exposes a later line sample');
  assert.equal(exposed.cornerVisible, false, 'the entrance is ahead of the rearward mirror');
  const outward = setCockpitSetting(settings, 'right.yaw', 25);
  assert.equal(f.mirrors.observe(inside, 'right', outward).lineVisible, false, 'mirror-angle changes must invalidate the prior visible result');
  assert.equal(f.mirrors.observe(inside, 'left', outward).lineVisible, true, 'right-mirror changes cannot contaminate the left cache');
  const raised = f.mirrors.observe(inside, 'right', setCockpitSetting(settings, 'seatHeight', 1.38));
  assert.notDeepEqual(raised.ground, exposed.ground, 'a new eye position must re-project references');
  assert.equal(f.mirrors.observe(inside, 'right', settings).lineVisible, true, 'returning to the original settings recomputes the correct view');
  assert.equal(f.mirrors.observe(approaching, 'right', settings).lineVisible, false, 'returning to the earlier pose still sees the wall');
  assert.deepEqual(snapshot(f), before, 'observation must restore car and render state');
});

test('physical mirrors update with hidden DOM cards and share source textures / UVs without extra flips', t => {
  const f = fixture(t, { physical: true }), settings = createCockpitSettings(), state = { x: 3, z: -2, heading: .7 };
  f.carModel.car.position.set(state.x, .015, state.z); f.carModel.car.rotation.y = state.heading;
  for (const side of ['left', 'right']) f.elements.get(`${side}-mirror-image`).rect = { left: 0, top: 0, width: 0, height: 0 };
  const before = snapshot(f);
  f.mirrors.prepare(state, settings);
  assert.deepEqual(snapshot(f), before);
  assert.equal(f.calls.length, 2);
  for (const [i, side] of ['left', 'right'].entries()) {
    const source = f.calls[i], surface = f.carModel.mirrorSurfaces[side];
    const frame = createMirrorFrame({ x: 0, z: 0, heading: 0 }, side, settings), optics = createMirrorOptics(frame);
    assert.equal(source.kind, 'source'); assert.ok(source.target.width >= 512);
    assert.deepEqual(source.carVisibility, [true, true, false]);
    assert.deepEqual(source.surfaceVisibility, [false, false]);
    assert.equal(surface.material.map, source.target.texture);
    assert.equal(surface.material.side, THREE.FrontSide); assert.equal(surface.material.depthTest, true); assert.equal(surface.material.depthWrite, true);
    assert.equal(surface.material.toneMapped, false);
    assert.deepEqual([...surface.geometry.getAttribute('uv').array], [...optics.uvs]);
    const positions = surface.geometry.getAttribute('position');
    const index = 8 * 25 + 12, center = sampleMirrorRay(frame, 0, 0).origin;
    assert.ok(Math.abs(positions.getX(index) - center.x) < 1e-6);
    assert.ok(Math.abs(positions.getY(index) + .015 - center.y) < 1e-6);
    assert.ok(Math.abs(positions.getZ(index) - center.z) < 1e-6);
  }
  f.mirrors.renderOverlay(); assert.equal(f.calls.length, 2, 'No hidden teaching card may be drawn over the main view.');
  f.mirrors.prepare({ ...state, x: state.x + 1 }, settings); assert.equal(f.calls.length, 4, 'Physical reflections remain live without DOM cards.');
});

test('prepare supports source -> main scene -> teaching overlay ordering and reuses physical geometry until calibration/root changes', t => {
  const f = fixture(t, { physical: true }), settings = createCockpitSettings(), state = { x: 0, z: 0, heading: 0 };
  f.mirrors.prepare(state, settings);
  const surfaces = Object.values(f.carModel.mirrorSurfaces), versions = surfaces.map(surface => surface.geometry.getAttribute('position').version);
  const mainCamera = new THREE.PerspectiveCamera(60, 1, .08, 180);
  f.renderer.render(f.world, mainCamera);
  f.mirrors.renderOverlay();
  assert.deepEqual(f.calls.map(call => call.kind), ['source', 'source', 'source', 'overlay', 'overlay']);
  assert.deepEqual(f.calls[2].surfaceVisibility, [true, true]);
  assert.equal(f.calls[2].target.name, 'previous-target', 'prepare must restore the main framebuffer before the main scene.');
  assert.deepEqual(f.calls[3].uvs, [...surfaces[0].geometry.getAttribute('uv').array]);
  assert.deepEqual(f.calls[4].uvs, [...surfaces[1].geometry.getAttribute('uv').array]);
  f.mirrors.prepare({ ...state, heading: .5 }, settings);
  surfaces.forEach((surface, i) => assert.equal(surface.geometry.getAttribute('position').version, versions[i]));
  f.carModel.car.position.y = .03;
  f.mirrors.prepare(state, settings);
  surfaces.forEach((surface, i) => assert.ok(surface.geometry.getAttribute('position').version > versions[i]));
  const centerIndex = 8 * 25 + 12;
  assert.ok(Math.abs(surfaces[0].geometry.getAttribute('position').getY(centerIndex) + .03 - 1.05) < 1e-6);
});

test('physical prepare/capture failures restore both reflective surfaces and unified interior visibility', t => {
  const f = fixture(t, { physical: true }), settings = createCockpitSettings(), state = { x: 0, z: 0, heading: 0 };
  f.carModel.mirrorSurfaces.right.visible = false;
  const before = snapshot(f);
  f.renderer.failRenderKind = 'source';
  assert.throws(() => f.mirrors.prepare(state, settings), /test source renderer failure/);
  assert.deepEqual(snapshot(f), before);
  assert.throws(() => f.mirrors.capture(state, settings), /test source renderer failure/);
  assert.deepEqual(snapshot(f), before);
  f.renderer.failRenderKind = null;
  f.mirrors.capture(state, settings, { annotations: false });
  for (const call of f.calls.filter(value => value.kind === 'source')) {
    assert.deepEqual(call.carVisibility, [true, true, false]);
    assert.deepEqual(call.surfaceVisibility, [false, false]);
  }
  assert.deepEqual(snapshot(f), before);
  f.mirrors.observe(state, 'left', settings);
  assert.deepEqual(snapshot(f), before, 'observe must also restore surfaces/actual cabin state.');
});
