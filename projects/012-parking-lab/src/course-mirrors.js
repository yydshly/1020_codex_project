import * as THREE from 'three';
import { createCockpitSettings, createMirrorFrame } from './cockpit.js';
import { createMirrorOptics } from './mirror-optics.js';
import { updateMirrorSurfaceGeometry } from './mirror-surface.js';
import { CAR_VISUAL_ROOT_Y } from './vehicle-visuals.js';
import { createMirrorClipPlane } from './mirror-clip.js';
import { driverVerticalFov } from './driver-view.js';
import { createCourseMirrorRecognizer } from './course-mirror-recognition.js';

const SIDES = ['left', 'right'], COLUMNS = 24, ROWS = 16, ASPECT = 1.58;
const cloneSettings = settings => ({ seatHeight: settings.seatHeight, seatFore: settings.seatFore,
  left: { ...settings.left }, right: { ...settings.right } });

/** Reject scenery between the fitted virtual eye and the actual reflector.
 * Retain the full shallow convex surface, including its maximum edge sag. */
export function courseMirrorClipPlane(frame, carMatrix = new THREE.Matrix4()) {
  return createMirrorClipPlane(frame, { matrix: carMatrix, rootY: CAR_VISUAL_ROOT_Y });
}

/** Course-specific physical mirrors and optional SAME-aperture magnification.
 * Source colour uses the fitted convex-mirror eye, with every reflection/flip
 * encoded once in the per-surface UVs. Full car matrices carry hill pitch and
 * world translation together; root height is subtracted exactly once. */
export function createCourseMirrorRenderer({ renderer, world, carModel, settings = createCockpitSettings() }) {
  let current = cloneSettings(settings), invalid = true, disposed = false, lastMatrix = '';
  const caches = SIDES.map(() => ({ key: '', frame: null, optics: null }));
  const cameras = SIDES.map(() => new THREE.PerspectiveCamera(25, ASPECT, .04, 160));
  const targets = SIDES.map(() => new THREE.WebGLRenderTarget(512, 324, { colorSpace: THREE.SRGBColorSpace }));
  const geometries = SIDES.map(() => new THREE.PlaneGeometry(2, 2, COLUMNS, ROWS));
  const materials = targets.map(target => new THREE.MeshBasicMaterial({ map: target.texture, toneMapped: false, depthTest: false, depthWrite: false }));
  const overlays = geometries.map((geometry, index) => {
    const scene = new THREE.Scene(); scene.add(new THREE.Mesh(geometry, materials[index])); return scene;
  });
  const overlayCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const driverZoomCamera = new THREE.PerspectiveCamera(52, 1, .06, 450);
  const destination = new THREE.Vector3(), direction = new THREE.Vector3();
  const recognizer = createCourseMirrorRecognizer({ world, carModel }), recognitionCache = new Map();
  let recognitionRevision = 0;
  for (const [index, side] of SIDES.entries()) {
    const surface = carModel.mirrorSurfaces[side]; surface.material.dispose();
    surface.material = new THREE.MeshBasicMaterial({ map: targets[index].texture, toneMapped: false, side: THREE.FrontSide });
    surface.castShadow = false; surface.receiveShadow = false; surface.userData.mirrorSide = side;
  }
  function opticsFor(side) {
    const index = SIDES.indexOf(side); if (index < 0) throw new RangeError('Mirror side must be left or right.');
    const cached = caches[index];
    const key = JSON.stringify([current.seatHeight, current.seatFore, current[side].yaw, current[side].pitch]);
    if (cached.key !== key) {
      cached.frame = createMirrorFrame({ x: 0, z: 0, heading: 0 }, side, current);
      cached.optics = createMirrorOptics(cached.frame, { columns: COLUMNS, rows: ROWS, aspect: ASPECT });
      cached.key = key;
      updateMirrorSurfaceGeometry(carModel.mirrorSurfaces[side].geometry, cached.frame, cached.optics, { rootY: CAR_VISUAL_ROOT_Y });
      const uv = geometries[index].getAttribute('uv'); uv.array.set(cached.optics.uvs); uv.needsUpdate = true;
      cameras[index].fov = cached.optics.fov; cameras[index].aspect = cached.optics.aspect; cameras[index].updateProjectionMatrix();
    }
    return cached.optics;
  }
  function saveRenderer() {
    return { target: renderer.getRenderTarget(), viewport: renderer.getViewport(new THREE.Vector4()),
      scissor: renderer.getScissor(new THREE.Vector4()), scissorTest: renderer.getScissorTest(),
      autoClear: renderer.autoClear, shadowUpdate: renderer.shadowMap.autoUpdate,
      clippingPlanes: renderer.clippingPlanes, localClippingEnabled: renderer.localClippingEnabled };
  }
  function restoreRenderer(previous) {
    renderer.setRenderTarget(previous.target); renderer.setViewport(previous.viewport); renderer.setScissor(previous.scissor);
    renderer.setScissorTest(previous.scissorTest); renderer.autoClear = previous.autoClear;
    renderer.shadowMap.autoUpdate = previous.shadowUpdate;
    renderer.clippingPlanes = previous.clippingPlanes; renderer.localClippingEnabled = previous.localClippingEnabled;
  }
  function prepare({ dirty = false, zoomSide = null, zoomElement = null } = {}) {
    if (disposed) return false;
    carModel.car.updateMatrixWorld(true);
    const matrixKey = carModel.car.matrixWorld.elements.join(',');
    const zoomWidth = zoomElement?.getBoundingClientRect?.().width || 0;
    let resized = false;
    for (const [index, side] of SIDES.entries()) {
      opticsFor(side);
      const width = side === zoomSide ? Math.max(512, Math.min(1280, Math.round(zoomWidth * Math.min(renderer.getPixelRatio(), 1.5)))) : 512;
      if (targets[index].width !== width) { targets[index].setSize(width, Math.round(width / ASPECT)); resized = true; }
    }
    if (!dirty && !invalid && !resized && matrixKey === lastMatrix) return false;
    recognitionRevision++; recognitionCache.clear();
    const previous = saveRenderer();
    const visibility = [...new Set([carModel.externalMirrors, ...Object.values(carModel.mirrorSurfaces)])]
      .map(object => ({ object, visible: object.visible }));
    try {
      renderer.shadowMap.autoUpdate = false; renderer.setScissorTest(false); renderer.autoClear = true;
      for (const { object } of visibility) object.visible = false;
      for (const [index, side] of SIDES.entries()) {
        const optics = opticsFor(side), camera = cameras[index];
        camera.position.set(optics.position.x, optics.position.y - CAR_VISUAL_ROOT_Y, optics.position.z).applyMatrix4(carModel.car.matrixWorld);
        direction.set(optics.forward.x, optics.forward.y, optics.forward.z).applyQuaternion(carModel.car.getWorldQuaternion(new THREE.Quaternion()));
        camera.up.set(optics.up.x, optics.up.y, optics.up.z).applyQuaternion(carModel.car.getWorldQuaternion(new THREE.Quaternion()));
        camera.lookAt(destination.copy(camera.position).add(direction)); camera.updateMatrixWorld(true);
        renderer.clippingPlanes = [...(previous.clippingPlanes || []), courseMirrorClipPlane(caches[index].frame, carModel.car.matrixWorld)];
        renderer.setRenderTarget(targets[index]); renderer.render(world, camera);
      }
    } finally {
      visibility.forEach(({ object, visible }) => { object.visible = visible; }); restoreRenderer(previous);
    }
    lastMatrix = matrixKey; invalid = false; return true;
  }
  function fitDriverZoom(side, rect, canvasRect) {
    const frame = caches[SIDES.indexOf(side)].frame;
    carModel.car.updateMatrixWorld(true);
    // A head turn changes the view direction, never the eye or mirror angle.
    // This independent view stays tied to the chosen mirror when the main view
    // switches to forward/top/orbit, rather than drifting with that camera.
    driverZoomCamera.aspect = canvasRect.width / canvasRect.height;
    driverZoomCamera.fov = driverVerticalFov(driverZoomCamera.aspect);
    driverZoomCamera.position.set(frame.eye.x, frame.eye.y - CAR_VISUAL_ROOT_Y, frame.eye.z).applyMatrix4(carModel.car.matrixWorld);
    driverZoomCamera.up.set(0, 1, 0).transformDirection(carModel.car.matrixWorld);
    driverZoomCamera.lookAt(destination.set(frame.center.x, frame.center.y - CAR_VISUAL_ROOT_Y, frame.center.z).applyMatrix4(carModel.car.matrixWorld));
    driverZoomCamera.updateProjectionMatrix(); driverZoomCamera.updateMatrixWorld(true);
    const names = [`${side}-mirror-backing`, ...[-1, 1].flatMap(edge => [`${side}-mirror-rim-h-${edge}`, `${side}-mirror-rim-v-${edge}`])];
    const objects = [carModel.mirrorSurfaces[side], ...names.map(name => carModel.car.getObjectByName(name)).filter(Boolean)];
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    const point = new THREE.Vector3();
    for (const object of objects) {
      const positions = object.geometry?.getAttribute('position'); if (!positions) continue;
      for (let index = 0; index < positions.count; index++) {
        point.fromBufferAttribute(positions, index).applyMatrix4(object.matrixWorld).project(driverZoomCamera);
        if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
        minX = Math.min(minX, point.x); maxX = Math.max(maxX, point.x);
        minY = Math.min(minY, point.y); maxY = Math.max(maxY, point.y);
      }
    }
    if (![minX, maxX, minY, maxY].every(Number.isFinite) || maxX - minX < 1e-9 || maxY - minY < 1e-9) return false;
    const projectedWidth = (maxX - minX) * canvasRect.width / 2, projectedHeight = (maxY - minY) * canvasRect.height / 2;
    const scale = .9 * Math.min(rect.width / projectedWidth, rect.height / projectedHeight);
    const sx = scale * canvasRect.width / rect.width, sy = scale * canvasRect.height / rect.height;
    // Affine clip-space magnification leaves clip.w untouched. The GPU keeps
    // the original perspective-correct UV interpolation, foreshortening and
    // sloping edges; flattening projected vertices would lose that relation.
    const crop = new THREE.Matrix4().set(sx, 0, 0, -sx * (minX + maxX) / 2,
      0, sy, 0, -sy * (minY + maxY) / 2, 0, 0, 1, 0, 0, 0, 0, 1);
    driverZoomCamera.projectionMatrix.premultiply(crop);
    driverZoomCamera.projectionMatrixInverse.copy(driverZoomCamera.projectionMatrix).invert();
    return true;
  }
  function renderOverlay({ side, element, projection = 'driver' } = {}) {
    if (disposed || !SIDES.includes(side) || !element) return;
    const rect = element.getBoundingClientRect(), canvasRect = renderer.domElement.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    if (projection === 'driver') {
      opticsFor(side);
      if (!fitDriverZoom(side, rect, canvasRect)) return;
      const previous = saveRenderer(), shadowNeedsUpdate = renderer.shadowMap.needsUpdate;
      try {
        // Redraw the physical view itself, including its real housing and
        // occluders. This does not alter either reflection source camera.
        renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = false;
        renderer.autoClear = true; renderer.setScissorTest(true);
        renderer.setViewport(rect.left - canvasRect.left, canvasRect.height - (rect.top - canvasRect.top) - rect.height, rect.width, rect.height);
        renderer.setScissor(rect.left - canvasRect.left, canvasRect.height - (rect.top - canvasRect.top) - rect.height, rect.width, rect.height);
        renderer.render(world, driverZoomCamera);
      } finally { restoreRenderer(previous); renderer.shadowMap.needsUpdate = shadowNeedsUpdate; }
      return;
    }
    // Letterbox preserves the physical mirror aperture in arbitrary UI slots.
    const width = Math.min(rect.width, rect.height * ASPECT), height = width / ASPECT;
    const x = rect.left - canvasRect.left + (rect.width - width) / 2;
    const y = canvasRect.height - (rect.top - canvasRect.top) - rect.height + (rect.height - height) / 2;
    const previous = saveRenderer();
    try {
      renderer.autoClear = false; renderer.setScissorTest(true);
      renderer.setViewport(x, y, width, height); renderer.setScissor(x, y, width, height);
      renderer.render(overlays[SIDES.indexOf(side)], overlayCamera);
    } finally { restoreRenderer(previous); }
  }
  function recognize({ side, chapterId = null, camera = null, canvasRect = null, displayRect = null, projection = 'driver' } = {}) {
    if (disposed || !SIDES.includes(side)) return null;
    opticsFor(side);
    carModel.car.updateWorldMatrix(true, true);
    const canvas = canvasRect || renderer.domElement?.getBoundingClientRect?.() || { width: 915, height: 465 };
    let measurementCamera = camera, viewport = canvas;
    const zoom = displayRect?.width > 0 && displayRect?.height > 0;
    if (zoom && projection !== 'unfolded' && fitDriverZoom(side, displayRect, canvas)) measurementCamera = driverZoomCamera;
    if (zoom) viewport = displayRect;
    measurementCamera?.updateMatrixWorld(true);
    const key = JSON.stringify([recognitionRevision, side, chapterId, current, carModel.car.matrixWorld.elements,
      measurementCamera?.matrixWorld.elements, measurementCamera?.projectionMatrix.elements, viewport.width, viewport.height, zoom, projection]);
    if (recognitionCache.has(key)) return recognitionCache.get(key);
    const result = recognizer.recognize({ side, settings: current, chapterId, camera: measurementCamera, viewport,
      unfolded: zoom && projection === 'unfolded', sourceResolution: { width: targets[SIDES.indexOf(side)].width, height: targets[SIDES.indexOf(side)].height } });
    recognitionCache.set(key, result); if (recognitionCache.size > 8) recognitionCache.delete(recognitionCache.keys().next().value);
    return result;
  }
  return {
    setSettings(settings) {
      const next = cloneSettings(settings);
      if (JSON.stringify(next) !== JSON.stringify(current)) { current = next; invalid = true; }
    },
    getSettings() { return cloneSettings(current); },
    opticsFor, prepare, renderOverlay, recognize,
    invalidate() { invalid = true; recognizer.invalidate(); recognitionCache.clear(); },
    dispose() {
      if (disposed) return; disposed = true;
      targets.forEach(target => target.dispose()); geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose());
    },
  };
}
