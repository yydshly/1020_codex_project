import * as THREE from 'three';
import { createMirrorFrame, sampleMirrorRay, projectMirrorPoint } from './cockpit.js';
import { createMirrorOptics, sourceUV } from './mirror-optics.js';
import { createMirrorClipPlane } from './mirror-clip.js';
import { driverVerticalFov } from './driver-view.js';
import { CAR_VISUAL_ROOT_Y } from './vehicle-visuals.js';
import { createTrainingCar } from './vehicle-visuals.js';
import { createCourseOperationVisuals } from './course-operation-visuals.js';

const vec = p => new THREE.Vector3(p.x, p.y, p.z);
const plain = p => ({ x: p.x, y: p.y, z: p.z });
const visible = object => { for (let p = object; p; p = p.parent) if (!p.visible) return false; return true; };
const opaque = hit => {
  const material = Array.isArray(hit.object.material) ? hit.object.material[hit.face?.materialIndex || 0] : hit.object.material;
  return visible(hit.object) && material && material.visible !== false && (!material.transparent || material.opacity >= .95);
};
const below = (object, parent) => { for (let p = object; p; p = p.parent) if (p === parent) return true; return false; };
const bodyName = name => /^(body-shell|front-driver-door-panel)$/.test(name);
const finite = (value, fallback) => Number.isFinite(value) ? value : fallback;
const REFERENCE_VIEW = { width: 915, height: 465 };
export const COURSE_MIRROR_READABILITY = Object.freeze({ bodyCoverage: .01, bodyWidthPixels: 3, bodyAreaPixels: 16, lineSpanPixels: 8,
  lineWidthPixels: .75, lineSourceWidthPixels: 1 });

let calibration;
/** Stationary closed-door instance of the same course car, not a substitute
 * silhouette or a bay-dependent camera. Only explicit recommendations use it;
 * live visibility always belongs to the renderer's actual world instance. */
export function measureCourseMirrorCalibration(settings, side, { columns = 24, rows = 20, displayRect = null } = {}) {
  if (!calibration) {
    const world = new THREE.Scene(), carModel = createTrainingCar({ world }); carModel.car.position.y = CAR_VISUAL_ROOT_Y;
    createCourseOperationVisuals(carModel).update({ gear: 'R' }, null, {});
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshBasicMaterial({ color: '#767c7e', side: THREE.DoubleSide }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = .025; world.add(ground);
    calibration = createCourseMirrorRecognizer({ world, carModel });
  }
  return calibration.recognize({ side, settings, columns, rows, displayRect });
}

/** Renderer-side recognition. Positive results include real housing/cabin
 * occlusion, not merely an inverse projection into an optical aperture.
 * Body masks are cached in vehicle-local coordinates; moving the whole car
 * never launches a complete grid again. Cached body cells test world-only
 * occluders. Geometry/readability are estimates, not a photometric classifier. */
export function createCourseMirrorRecognizer({ carModel, world = carModel.car.parent }) {
  const raycaster = new THREE.Raycaster(), bodyCache = new Map(); raycaster.layers.set(0);
  let measurements = 0;
  function objects(root, excludeMirrors = false) {
    const result = [];
    root.traverse(object => {
      if (!object.isMesh || !visible(object) || !object.layers.test(raycaster.layers)) return;
      if (Object.values(carModel.mirrorSurfaces).includes(object)) return;
      if (excludeMirrors && below(object, carModel.externalMirrors)) return;
      const material = Array.isArray(object.material) ? object.material[0] : object.material;
      // The shader sky is a far background, never a physical occluder. Its
      // enormous enclosing sphere otherwise costs triangle tests on every ray.
      if (object.renderOrder < 0 && material?.depthWrite === false) return;
      // Three's raycaster only uses a geometry box when it already exists.
      // Computing it once avoids repeatedly testing all cabin/body triangles
      // for rays that pass above or beside their actual bounds.
      if (object.geometry && !object.geometry.boundingBox) object.geometry.computeBoundingBox();
      result.push(object);
    });
    return result;
  }
  function first(origin, direction, far, meshes, clip = null) {
    if (far <= .001) return null;
    raycaster.set(origin, direction); raycaster.near = .001; raycaster.far = far;
    return raycaster.intersectObjects(meshes, false).find(hit => opaque(hit) && (!clip || clip.distanceToPoint(hit.point) >= 0)) || null;
  }
  function nearObjects(meshes, zone) {
    const box = new THREE.Box3(), sphere = new THREE.Sphere(), matrix = new THREE.Matrix4();
    return meshes.filter(mesh => {
      if (!mesh.isInstancedMesh) return box.copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld).intersectsBox(zone);
      // Road scenery may contain thousands of far instances in a batch whose
      // aggregate box spans both road sides. Check each conservative sphere
      // once per query, not once for every accepted body-cell ray.
      if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
      for (let index = 0; index < mesh.count; index++) {
        mesh.getMatrixAt(index, matrix); matrix.premultiply(mesh.matrixWorld);
        sphere.copy(mesh.geometry.boundingSphere).applyMatrix4(matrix);
        if (zone.intersectsSphere(sphere)) return true;
      }
      return false;
    });
  }
  function configuration(side, settings) {
    carModel.car.updateWorldMatrix(true, true);
    const frame = createMirrorFrame({ x: 0, z: 0, heading: 0 }, side, settings), optics = createMirrorOptics(frame);
    const matrix = carModel.car.matrixWorld.clone(), inverse = matrix.clone().invert(), orientation = carModel.car.getWorldQuaternion(new THREE.Quaternion());
    const transform = p => vec(p).add(new THREE.Vector3(0, -CAR_VISUAL_ROOT_Y, 0)).applyMatrix4(matrix);
    return { frame, optics, matrix, inverse, orientation, transform,
      eye: transform(frame.eye), source: transform(optics.position), clip: createMirrorClipPlane(frame, { matrix, rootY: CAR_VISUAL_ROOT_Y }) };
  }
  function bodyMask(side, settings, config, columns, rows) {
    const door = carModel.car.getObjectByName('demonstrated-driver-door'), shell = carModel.car.getObjectByName('body-shell');
    const key = JSON.stringify([side, settings.seatHeight, settings.seatFore, settings[side], columns, rows,
      carModel.car.visible, shell?.visible, shell?.material.visible, shell?.geometry.id, shell?.geometry.getAttribute('position')?.version,
      door?.visible, door?.quaternion.toArray(), carModel.externalMirrors.visible, carModel.externalMirrors.matrix.elements]);
    if (bodyCache.has(key)) return bodyCache.get(key);
    measurements++;
    const sourceMeshes = objects(carModel.car, true), eyeMeshes = objects(carModel.car), cells = [];
    let sourceCount = 0, blocked = 0;
    for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) {
      const u = (col + .5) / columns, v = (row + .5) / rows, ray = sampleMirrorRay(config.frame, 2 * u - 1, 1 - 2 * v);
      const direction = vec(ray.direction).applyQuaternion(config.orientation), hit = first(config.source, direction, 160, sourceMeshes, config.clip);
      if (!hit || !bodyName(hit.object.name)) continue;
      sourceCount++;
      const glass = config.transform(ray.origin), eyeRay = glass.clone().sub(config.eye);
      if (first(config.eye, eyeRay.clone().normalize(), eyeRay.length() - .0005, eyeMeshes)) { blocked++; continue; }
      cells.push({ u, v, point: plain(hit.point.clone().applyMatrix4(config.inverse)) });
    }
    const result = { cells, sourceCount, blocked, total: columns * rows, columns, rows, coverage: cells.length / (columns * rows) };
    bodyCache.set(key, result); if (bodyCache.size > 18) bodyCache.delete(bodyCache.keys().next().value);
    return result;
  }
  function projection(config, camera, viewport, displayRect, unfolded) {
    if (unfolded) {
      const width = Math.min(viewport.width, viewport.height * 1.58), height = width / 1.58;
      return { project: (u, v) => ({ x: u * width, y: v * height, inFront: true }), magnification: 1,
        width, height, measurement: 'unfolded-identical-aperture' };
    }
    let actual = Boolean(camera);
    if (!camera) {
      camera = new THREE.PerspectiveCamera(driverVerticalFov(viewport.width / viewport.height), viewport.width / viewport.height, .06, 450);
      camera.position.copy(config.eye); camera.up.set(0, 1, 0).applyQuaternion(config.orientation); camera.lookAt(config.transform(config.frame.center));
    }
    camera.updateMatrixWorld(true);
    const project = (u, v) => {
      const p = config.transform(sampleMirrorRay(config.frame, u * 2 - 1, 1 - v * 2).origin).project(camera);
      return { x: (p.x + 1) * viewport.width / 2, y: (1 - p.y) * viewport.height / 2,
        inFront: p.z > -1 && p.z < 1 && Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1 };
    };
    const bounds = [project(0, 0), project(1, 0), project(0, 1), project(1, 1)];
    const width = Math.max(...bounds.map(p => p.x)) - Math.min(...bounds.map(p => p.x));
    const height = Math.max(...bounds.map(p => p.y)) - Math.min(...bounds.map(p => p.y));
    const magnification = displayRect?.width > 0 && displayRect?.height > 0 ? .9 * Math.min(displayRect.width / width, displayRect.height / height) : 1;
    return { project, magnification, width: width * magnification, height: height * magnification,
      measurement: actual ? displayRect ? 'actual-camera-magnified-estimate' : 'actual-camera' : 'reference-camera-estimate' };
  }
  function span(cells, projected, columns, rows) {
    // Use a contiguous row's measured interior width, not the bounding box of
    // a thin diagonal/fragmented strip. A single sampled pixel column is not
    // evidence of a readable body width, even if its bounding box is tall.
    const byRow = new Map();
    for (const cell of cells) { if (!byRow.has(cell.v)) byRow.set(cell.v, []); byRow.get(cell.v).push(cell); }
    const widths = [];
    for (const row of byRow.values()) {
      row.sort((a, b) => a.u - b.u);
      let start = row[0], previous = start, width = 0;
      const finish = () => {
        const a = projected.project(start.u, start.v), b = projected.project(previous.u, previous.v);
        if (a.inFront && b.inFront) width = Math.max(width, Math.hypot(a.x - b.x, a.y - b.y) * projected.magnification);
      };
      for (let i = 1; i < row.length; i++) {
        if (row[i].u - previous.u > 1.2 / columns) { finish(); start = row[i]; }
        previous = row[i];
      }
      finish(); widths.push(width);
    }
    widths.sort((a, b) => a - b); return widths[Math.floor(widths.length / 2)] || 0;
  }
  function recognize({ side, settings, chapterId = null, camera = null, viewport = REFERENCE_VIEW, displayRect = null, unfolded = false,
    sourceResolution = { width: 512, height: 324 }, columns = 40, rows = 24 } = {}) {
    if (!['left', 'right'].includes(side)) throw new RangeError('Mirror recognition side must be left or right.');
    world.updateMatrixWorld(true);
    viewport = { width: Math.max(1, finite(viewport?.width, 915)), height: Math.max(1, finite(viewport?.height, 465)) };
    const config = configuration(side, settings), mask = bodyMask(side, settings, config, columns, rows), projected = projection(config, camera, viewport, displayRect, unfolded);
    const eyeMeshes = objects(world), sourceMeshes = objects(world, true);
    let sampleOccluded = 0;
    const zone = new THREE.Box3().expandByPoint(config.eye).expandByPoint(config.source);
    for (const cell of mask.cells) {
      zone.expandByPoint(vec(cell.point).applyMatrix4(config.matrix));
      zone.expandByPoint(config.transform(sampleMirrorRay(config.frame, cell.u * 2 - 1, 1 - cell.v * 2).origin));
    }
    zone.expandByScalar(.015);
    const clearCells = [], outsideCar = nearObjects(sourceMeshes.filter(object => !below(object, carModel.car)), zone);
    // Self-occlusion has already been measured by the full car-only mask.
    // Recheck only its accepted body cells against EXTERNAL geometry, so a
    // partial wall/vehicle cannot borrow the untouched baseline's full width.
    // This avoids repeating 960 rays against all of the car's small fittings.
    for (const cell of mask.cells) {
      const target = vec(cell.point).applyMatrix4(config.matrix), d = target.clone().sub(config.source);
      const glass = config.transform(sampleMirrorRay(config.frame, cell.u * 2 - 1, 1 - cell.v * 2).origin), toGlass = glass.clone().sub(config.eye);
      const eyeBlock = first(config.eye, toGlass.clone().normalize(), toGlass.length() - .0005, outsideCar);
      const sourceBlock = first(config.source, d.clone().normalize(), d.length() - .005, outsideCar, config.clip);
      if (!eyeBlock && !sourceBlock) clearCells.push(cell);
      else sampleOccluded++;
    }
    const coverage = clearCells.length / mask.total;
    const bodyWidth = span(clearCells, projected, columns, rows), area = projected.width * projected.height * coverage;
    const onScreen = clearCells.some(cell => projected.project(cell.u, cell.v).inFront);
    const bodyVisible = clearCells.length > 0 && onScreen;
    const bodyReadable = bodyVisible && sampleOccluded === 0 && coverage >= COURSE_MIRROR_READABILITY.bodyCoverage
      && bodyWidth >= COURSE_MIRROR_READABILITY.bodyWidthPixels && area >= COURSE_MIRROR_READABILITY.bodyAreaPixels;
    const body = { visible: bodyVisible, readable: bodyReadable, occluded: mask.blocked > 0 || sampleOccluded > 0,
      coverage, pixelSpan: bodyWidth, pixelArea: area, sourceSamples: mask.sourceCount, visibleSamples: clearCells.length,
      housingBlockedSamples: mask.blocked, sceneBlockedSamples: sampleOccluded, baselineVisibleSamples: mask.cells.length,
      totalSamples: mask.total, estimated: true, readabilityUncertain: sampleOccluded > 0,
      reason: !clearCells.length ? mask.sourceCount ? 'occluded' : 'not-in-field' : !onScreen ? 'not-on-screen'
        : sampleOccluded > 0 ? 'partially-occluded' : !bodyReadable ? 'too-small' : 'readable' };
    function reference(worldPoint, checkIdealSource = true) {
      const local = vec(worldPoint).applyMatrix4(config.inverse); local.y += CAR_VISUAL_ROOT_Y;
      const p = projectMirrorPoint(config.frame, local);
      if (!p.visible) return { visible: false, inField: false, occluded: false };
      const glass = config.transform(p.origin), eyeRay = glass.clone().sub(config.eye);
      const eyeBlock = first(config.eye, eyeRay.clone().normalize(), eyeRay.length() - .0005, eyeMeshes);
      const delta = vec(worldPoint).sub(glass), sourceBlock = checkIdealSource
        ? first(glass, delta.clone().normalize(), Math.max(0, delta.length() - .015), sourceMeshes, config.clip) : null;
      const screen = projected.project(p.x, p.y);
      return { visible: !eyeBlock && !sourceBlock && screen.inFront, inField: true, occluded: Boolean(eyeBlock || sourceBlock),
        x: p.x, y: p.y, screen: { x: screen.x * projected.magnification, y: screen.y * projected.magnification }, point: worldPoint,
        sourceDirection: plain(vec(sampleMirrorRay(config.frame, p.x * 2 - 1, 1 - p.y * 2).direction).applyQuaternion(config.orientation)),
        sourceUV: sourceUV(config.optics, sampleMirrorRay(config.frame, p.x * 2 - 1, 1 - p.y * 2).direction) };
    }
    const sign = side === 'left' ? 1 : -1;
    const groundReferences = [-.35, -.7, -1.2, -2.2].map(z => {
      const expected = plain(new THREE.Vector3(sign * 1.4, .028 - CAR_VISUAL_ROOT_Y, z).applyMatrix4(config.matrix)), result = reference(expected);
      if (!result.visible) return result;
      const hit = first(config.source, vec(result.sourceDirection), vec(expected).distanceTo(config.source) + .5, sourceMeshes, config.clip);
      const normal = hit?.face?.normal.clone().applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld));
      const onSurface = Boolean(hit && Math.abs(hit.point.y - expected.y) < .2 && normal && Math.abs(normal.y) > .6);
      return { ...result, visible: onSurface, surfaceChecked: true };
    });
    const ground = { visible: groundReferences.some(p => p.visible), readable: groundReferences.some(p => p.visible)
      && projected.width * projected.height >= 16, references: groundReferences };
    let line = null, corner = null;
    if (chapterId === 'reverse-parking') {
      // IDs are authored by the real yard: index 0 is the negative-world-X
      // side, index 1 the positive side. They are not screen-left/screen-right.
      const objectName = side === 'left' ? 'bay-paint-1' : 'bay-paint-0';
      const painted = world.getObjectByName(objectName), paint = sourceMeshes.find(object => object === painted);
      const material = painted && (Array.isArray(painted.material) ? painted.material[0] : painted.material);
      const identity = { objectName, materialColor: material?.color ? `#${material.color.getHexString()}` : null, surfaceChecked: true };
      if (!painted || !painted.geometry || !paint || material?.visible === false || material?.colorWrite === false
        || material?.transparent && material.opacity < .95) {
        line = { ...identity, visible: false, readable: false, pixelSpan: 0, widthPixels: 0, sourceWidthPixels: 0, occluded: false,
          reason: !painted || !painted.geometry ? 'surface-missing' : 'surface-hidden' };
        corner = { visible: false, inField: false, occluded: false, reason: line.reason };
      } else {
      paint.geometry.computeBoundingBox();
      const bounds = paint.geometry.boundingBox, size = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3());
      const axes = ['x', 'y', 'z'].sort((a, b) => size[b] - size[a]), along = axes[0], across = axes[1];
      const samples = [], observedPaintNames = new Set();
      function paintedReference(longCoordinate) {
        const accepted = [], all = [];
        for (const fraction of [-.75, 0, .75]) {
          const local = center.clone(); local[along] = longCoordinate; local[across] += fraction * size[across] / 2;
          const target = local.applyMatrix4(paint.matrixWorld), sample = reference(plain(target), false); all.push(sample);
          if (!sample.visible) continue;
          const hit = first(config.source, vec(sample.sourceDirection), Math.min(160, target.distanceTo(config.source) + .3), sourceMeshes, config.clip);
          if (/^bay-paint-[012]$/.test(hit?.object.name || '')) observedPaintNames.add(hit.object.name);
          if (hit?.object !== paint || !opaque(hit)) { sample.visible = false; sample.captured = false; sample.occluded = Boolean(hit && hit.object !== paint); continue; }
          sample.captured = true; accepted.push(sample);
        }
        const width = accepted.length > 1 ? Math.max(...accepted.flatMap(a => accepted.map(b => Math.hypot(a.screen.x - b.screen.x, a.screen.y - b.screen.y)))) : 0;
        const sourceWidth = accepted.length > 1 ? Math.max(...accepted.flatMap(a => accepted.map(b => Math.hypot((a.sourceUV.u - b.sourceUV.u) * sourceResolution.width,
          (a.sourceUV.v - b.sourceUV.v) * sourceResolution.height)))) : 0;
        return { visible: accepted.length > 0, inField: all.some(p => p.inField), occluded: all.some(p => p.occluded),
          captureMiss: all.some(p => p.inField && p.captured === false), reference: accepted[Math.floor(accepted.length / 2)], width, sourceWidth };
      }
      for (let i = 0; i <= 32; i++) samples.push(paintedReference(bounds.min[along] + .015 + (size[along] - .03) * i / 32));
      let bestSpan = 0, bestWidth = 0, bestSourceWidth = 0, run = [];
      const finish = () => {
        if (run.length > 1) {
          const a = run[0].reference, b = run.at(-1).reference, worldLength = vec(a.point).distanceTo(vec(b.point));
          const length = Math.hypot(a.screen.x - b.screen.x, a.screen.y - b.screen.y);
          if (worldLength >= .3 && length > bestSpan) {
            const widths = run.map(item => item.width).sort((a, b) => a - b), sourceWidths = run.map(item => item.sourceWidth).sort((a, b) => a - b);
            bestSpan = length; bestWidth = widths[Math.floor(widths.length / 2)]; bestSourceWidth = sourceWidths[Math.floor(sourceWidths.length / 2)];
          }
        }
        run = [];
      };
      for (const item of samples) { if (item.visible) run.push(item); else finish(); } finish();
      const lineVisible = samples.some(p => p.visible), inField = samples.some(p => p.inField), occluded = samples.some(p => p.occluded);
      const tooThin = bestWidth < COURSE_MIRROR_READABILITY.lineWidthPixels || bestSourceWidth < COURSE_MIRROR_READABILITY.lineSourceWidthPixels;
      line = { ...identity, visible: lineVisible, readable: lineVisible && bestSpan >= COURSE_MIRROR_READABILITY.lineSpanPixels && !tooThin,
        pixelSpan: bestSpan, widthPixels: bestWidth, sourceWidthPixels: bestSourceWidth, occluded, observedPaintNames: [...observedPaintNames],
        reason: !inField ? 'not-in-field' : !lineVisible ? occluded ? 'occluded' : 'not-captured'
          : bestSpan < COURSE_MIRROR_READABILITY.lineSpanPixels ? 'too-small' : tooThin ? 'too-thin' : 'readable' };
      const entrance = paintedReference(bounds.min[along] + .02);
      corner = { visible: entrance.visible, inField: entrance.inField, occluded: entrance.occluded, surfaceChecked: true, objectName };
      }
    }
    return { side, visibility: 'scene-tested', occlusionChecked: true, pixelMeasurement: projected.measurement, body, ground, line, corner,
      lineVisible: line?.visible ?? null, lineReadable: line?.readable ?? null, cornerVisible: corner?.visible ?? null,
      status: !body.visible || !body.readable ? body.reason : line && !line.readable ? line.reason : 'readable',
      maxRayError: config.optics.maxRayError, exactRayTracing: false, contrastChecked: false, bodyMaskBuilds: measurements };
  }
  return { recognize, invalidate() { bodyCache.clear(); }, get bodyMaskBuilds() { return measurements; } };
}
