import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { courseSceneryLayout, createCourseEnvironment } from './course-environment.js';
import { EXAM_COURSES } from './exam-courses.js';
import { corners } from './vehicle.js';

const chapters = Object.values(EXAM_COURSES).flatMap(course => course.chapters).filter(chapter => chapter.sceneType !== 'parking');
const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.back < b.front && a.front > b.back;
const bounds = points => ({ left: Math.min(...points.map(p => p.x)), right: Math.max(...points.map(p => p.x)),
  back: Math.min(...points.map(p => p.z)), front: Math.max(...points.map(p => p.z)) });

test('all course vehicle envelopes clear scenery, entrances and raised pavement', () => {
  for (const chapter of chapters) {
    const layout = courseSceneryLayout(chapter.sceneType);
    const obstacles = [
      ...layout.trees.map(t => ({ left: t.x - 2 * t.scale, right: t.x + 2 * t.scale, back: t.z - 2 * t.scale, front: t.z + 2 * t.scale })),
      ...layout.buildings.map(b => ({ left: b.x - b.width / 2 - (b.x > 0 ? 3 : .2),
        right: b.x + b.width / 2 + (b.x < 0 ? 3 : .2), back: b.z - b.depth / 2 - .2, front: b.z + b.depth / 2 + .2 })),
      ...layout.sidewalks.map(p => ({ left: p.x - 1.075, right: p.x + 1.075, back: p.z - p.length / 2, front: p.z + p.length / 2 })),
    ];
    for (const pose of chapter.poses) {
      const car = bounds(corners(pose, .12));
      assert.ok(obstacles.every(obstacle => !overlaps(car, obstacle)), `${chapter.id} at ${pose.t}s must keep scenery clear`);
    }
  }
});

test('intersection and right-angle exits remain clear beyond the final demo pose', () => {
  for (const type of ['intersection', 'left_turn', 'right_turn']) {
    const layout = courseSceneryLayout(type);
    assert.ok(layout.trees.every(t => t.z + 2 * t.scale < 16.5 || t.z - 2 * t.scale > 23.5));
    assert.ok(layout.buildings.every(b => b.z + b.depth / 2 < 16.5 || b.z - b.depth / 2 > 23.5));
    assert.ok(layout.sidewalks.every(p => p.z + p.length / 2 <= 7 || p.z - p.length / 2 >= 33));
  }
  const angle = courseSceneryLayout('angle');
  assert.ok(angle.trees.every(t => t.x < 0 || Math.abs(t.z - 5.1) > 2 * t.scale + 1.75));
  assert.ok(angle.buildings.every(b => b.x < 0 || Math.abs(b.z - 5.1) > b.depth / 2 + 1.75));
});

test('detailed environment is batched and supplies finite geometry at bounded draw-call cost', () => {
  const materials = new Map();
  const material = (color, options = {}) => {
    const key = JSON.stringify([color, options]);
    if (!materials.has(key)) materials.set(key, new THREE.MeshStandardMaterial({ color, ...options }));
    return materials.get(key);
  };
  for (const type of new Set(chapters.map(c => c.sceneType))) {
    const parent = new THREE.Group();
    createCourseEnvironment({ parent, sceneType: type, material, night: type === 'night' });
    assert.ok(parent.children.length <= 26, `${type}: detailed scenery must stay batched`);
    assert.ok(parent.children.every(object => object.isInstancedMesh));
    for (const mesh of parent.children) {
      assert.ok(mesh.count > 0 && Number.isFinite(mesh.boundingSphere.radius));
      assert.ok([...mesh.instanceMatrix.array].every(Number.isFinite));
    }
    for (const geometry of new Set(parent.children.map(mesh => mesh.geometry))) geometry.dispose();
  }
  for (const mat of materials.values()) mat.dispose();
});
