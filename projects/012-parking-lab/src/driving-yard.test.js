import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createDrivingYard } from './driving-yard.js';
import { BAY, BOUNDS, COURSE } from './vehicle.js';
import { ROAD_SURFACE_Y, PAINT_SURFACE_Y, TEACHING_SURFACE_Y } from './scene-geometry.js';

const EPSILON = 1e-6;
const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < EPSILON, `${message}: ${actual} != ${expected}`);

function withYard(check, options = {}) {
  const world = new THREE.Scene(), helpers = new THREE.Group(); world.add(helpers);
  const yard = createDrivingYard({ world, helpers, ...options });
  world.updateMatrixWorld(true);
  try { check({ ...yard, world, helpers }); }
  finally {
    const geometries = new Set(), materials = new Set(), textures = new Set();
    world.traverse(object => {
      if (object.geometry) geometries.add(object.geometry);
      for (const material of [object.material].flat().filter(Boolean)) {
        materials.add(material);
        if (material.map && material.map !== options.asphaltMap) textures.add(material.map);
      }
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    for (const texture of textures) texture.dispose();
  }
}

function worldBounds(mesh, instance = null) {
  mesh.geometry.computeBoundingBox();
  const transform = mesh.matrixWorld.clone();
  if (instance !== null) {
    const instanceMatrix = new THREE.Matrix4(); mesh.getMatrixAt(instance, instanceMatrix);
    transform.multiply(instanceMatrix);
  }
  return mesh.geometry.boundingBox.clone().applyMatrix4(transform);
}

function instances(mesh) {
  return Array.from({ length: mesh.isInstancedMesh ? mesh.count : 1 }, (_, index) => worldBounds(mesh, mesh.isInstancedMesh ? index : null));
}

function paintMeshes(yard) {
  const result = [];
  yard.traverse(object => {
    if (object.name.startsWith('bay-paint-') || object.name === 'course-paint') result.push(object);
  });
  return result;
}

function actuallyVisible(object) {
  for (let current = object; current; current = current.parent) if (!current.visible) return false;
  return true;
}

test('all bay and course paint is planar at the shared paint surface, not raised boxes', () => {
  withYard(({ yard, normalLineMaterial }) => {
    const markings = paintMeshes(yard);
    assert.ok(markings.length >= 5);
    for (const mesh of markings) {
      assert.equal(mesh.geometry.type, 'PlaneGeometry');
      for (const bounds of instances(mesh)) {
        near(bounds.min.y, PAINT_SURFACE_Y, `${mesh.name} lower face`);
        near(bounds.max.y, PAINT_SURFACE_Y, `${mesh.name} upper face`);
        assert.ok(bounds.getSize(new THREE.Vector3()).x > 0);
        assert.ok(bounds.getSize(new THREE.Vector3()).z > 0);
      }
    }
    assert.ok(PAINT_SURFACE_Y > ROAD_SURFACE_Y);
    assert.ok(PAINT_SURFACE_Y - ROAD_SURFACE_Y <= .003, 'paint is at most 3 mm above the road');
    assert.equal(normalLineMaterial.color.getHexString(), 'e1b94c');
  });
});

test('bay paint preserves the physical bay boundary centres and 10 cm line width', () => {
  withYard(({ bayLines }) => {
    assert.equal(bayLines.length, 3);
    const rectangles = bayLines.map(mesh => worldBounds(mesh));
    for (const x of [BAY.left, BAY.right]) {
      const line = rectangles.find(bounds => Math.abs(bounds.getCenter(new THREE.Vector3()).x - x) < EPSILON);
      assert.ok(line, `side boundary at ${x}`);
      near(line.min.z, BAY.back, 'side begins at bay back');
      near(line.max.z, BAY.entrance, 'side ends at bay entrance');
      near(line.max.x - line.min.x, .10, 'side paint width');
    }
    const back = rectangles.find(bounds => Math.abs(bounds.getCenter(new THREE.Vector3()).z - BAY.back) < EPSILON);
    assert.ok(back);
    near(back.min.x, BAY.left - .05, 'back joins left paint');
    near(back.max.x, BAY.right + .05, 'back joins right paint');
    near(back.max.z - back.min.z, .10, 'back paint width');
  });
});

test('lane boundaries and both dashed control lines retain COURSE coordinates', () => {
  withYard(({ yard, normalLineMaterial }) => {
    const course = paintMeshes(yard).filter(mesh => mesh.name === 'course-paint');
    const boundaries = course.filter(mesh => mesh.material === normalLineMaterial).flatMap(instances);
    const controls = course.filter(mesh => mesh.material !== normalLineMaterial).flatMap(instances);
    assert.equal(boundaries.length, 5);
    const center = bounds => bounds.getCenter(new THREE.Vector3());
    const top = boundaries.find(bounds => Math.abs(center(bounds).z - COURSE.roadTop) < EPSILON);
    assert.ok(top);
    near(top.min.x, COURSE.roadLeft, 'far line left endpoint');
    near(top.max.x, COURSE.roadRight, 'far line right endpoint');
    for (const x of [COURSE.roadLeft, COURSE.roadRight]) {
      const side = boundaries.find(bounds => Math.abs(center(bounds).x - x) < EPSILON);
      assert.ok(side);
      near(side.min.z, BAY.entrance, 'lane side entrance');
      near(side.max.z, COURSE.roadTop, 'lane side far endpoint');
    }
    const mouth = boundaries.filter(bounds => Math.abs(center(bounds).z - BAY.entrance) < EPSILON).sort((a, b) => a.min.x - b.min.x);
    assert.equal(mouth.length, 2);
    near(mouth[0].min.x, COURSE.roadLeft, 'left entrance outer edge');
    near(mouth[0].max.x, BAY.left, 'left entrance leaves bay open');
    near(mouth[1].min.x, BAY.right, 'right entrance leaves bay open');
    near(mouth[1].max.x, COURSE.roadRight, 'right entrance outer edge');
    for (const x of [COURSE.controlA, COURSE.controlB]) {
      const dashes = controls.filter(bounds => Math.abs(center(bounds).x - x) < EPSILON).sort((a, b) => a.min.z - b.min.z);
      assert.ok(dashes.length > 2);
      near(center(dashes[0]).z, BAY.entrance + .3, 'first control dash');
      dashes.forEach((dash, index) => {
        near(dash.max.x - dash.min.x, .10, 'control line width');
        near(dash.max.z - dash.min.z, .45, 'control dash length');
        assert.ok(center(dash).z <= COURSE.roadTop + EPSILON);
        if (index) near(center(dash).z - center(dashes[index - 1]).z, .8, 'control dash spacing');
      });
    }
    assert.ok(controls.every(bounds => [COURSE.controlA, COURSE.controlB].some(x => Math.abs(center(bounds).x - x) < EPSILON)));
  });
});

test('grid, green fill, dimensions and target guides start hidden without hiding real paint', () => {
  withYard(({ helpers, teachingObjects, targetOutline, turnMarkers, grid, landmarks, bayLines }) => {
    assert.equal(teachingObjects.parent, helpers);
    const fill = teachingObjects.getObjectByName('teaching-bay-fill');
    const dimensions = teachingObjects.children.filter(object => object.name.startsWith('teaching-label-'));
    assert.ok(fill); assert.ok(dimensions.length >= 4);
    for (const object of [fill, ...dimensions, grid, targetOutline, turnMarkers]) {
      assert.equal(actuallyVisible(object), false);
    }
    for (const object of [fill, ...dimensions, grid, ...targetOutline.children]) {
      const bounds = worldBounds(object);
      near(bounds.min.y, TEACHING_SURFACE_Y, 'teaching lower surface');
      near(bounds.max.y, TEACHING_SURFACE_Y, 'teaching upper surface');
    }
    assert.equal(actuallyVisible(landmarks), false, 'orientation labels have their own explicit switch');
    assert.ok(bayLines.every(actuallyVisible));
    teachingObjects.visible = true;
    assert.ok([fill, grid, targetOutline, ...dimensions].every(actuallyVisible));
    assert.equal(actuallyVisible(landmarks), false);
    helpers.visible = false;
    assert.equal(actuallyVisible(grid), false);
    assert.ok(bayLines.every(actuallyVisible), 'physical bay paint is independent of teaching aids');
  });
});

test('walls, fences, signs, buildings, barriers and tree geometry remain outside driving bounds', () => {
  withYard(({ yard }) => {
    const drivingSpace = new THREE.Box3(new THREE.Vector3(BOUNDS.left, ROAD_SURFACE_Y, BOUNDS.back), new THREE.Vector3(BOUNDS.right, 5, BOUNDS.front));
    let checkedMeshes = 0, checkedSegments = 0;
    yard.traverse(object => {
      if (object.isMesh) {
        if (object.name === 'course-paint' || object.name.startsWith('bay-paint-')) return;
        // Horizontal base planes are the ground, not facilities. Sign faces are
        // vertical and remain in the check, including their parent transforms.
        if (object.geometry.type === 'PlaneGeometry' && Math.abs(object.rotation.x + Math.PI / 2) < EPSILON) return;
        for (const bounds of instances(object)) {
          assert.equal(bounds.intersectsBox(drivingSpace), false, `${object.name || object.geometry.type} intrudes into the driving space`);
          checkedMeshes++;
        }
      } else if (object.isLineSegments) {
        const positions = object.geometry.getAttribute('position');
        for (let index = 0; index < positions.count; index += 2) {
          const points = [index, index + 1].map(value => new THREE.Vector3().fromBufferAttribute(positions, value).applyMatrix4(object.matrixWorld));
          assert.equal(new THREE.Box3().setFromPoints(points).intersectsBox(drivingSpace), false, `${object.name} crosses the driving space`);
          checkedSegments++;
        }
      }
    });
    assert.ok(checkedMeshes > 10, 'includes instanced facilities, sign faces and distant crowns');
    assert.ok(checkedSegments > 10, 'includes perimeter fence segments');
  });
});

test('the road retains metre dimensions and reuses the caller texture without changing its sampling', () => {
  const texture = new THREE.Texture();
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(31 / 3, 23.2 / 3); texture.colorSpace = THREE.SRGBColorSpace;
  const repeat = texture.repeat.clone();
  try {
    withYard(({ yard, surfaceY, surfaceSize, asphaltMaterial }) => {
      const surface = yard.getObjectByName('driving-surface');
      const bounds = worldBounds(surface);
      assert.deepEqual(surfaceSize, { width: 31, depth: 23.2 });
      near(bounds.max.x - bounds.min.x, 31, 'road width in metres');
      near(bounds.max.z - bounds.min.z, 23.2, 'road depth in metres');
      near(bounds.getCenter(new THREE.Vector3()).z, .8, 'road centre');
      near(bounds.min.y, ROAD_SURFACE_Y, 'road top'); near(bounds.max.y, ROAD_SURFACE_Y, 'flat road');
      assert.equal(surfaceY, ROAD_SURFACE_Y);
      assert.equal(asphaltMaterial.map, texture);
      assert.ok(texture.repeat.equals(repeat));
      assert.equal(texture.wrapS, THREE.RepeatWrapping); assert.equal(texture.wrapT, THREE.RepeatWrapping);
      assert.equal(texture.colorSpace, THREE.SRGBColorSpace);
    }, { asphaltMap: texture });
  } finally { texture.dispose(); }
});
