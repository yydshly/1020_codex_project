import * as THREE from 'three';

const JUNCTIONS = new Set(['intersection', 'left_turn', 'right_turn']);
const TRAINING = new Set(['hill', 'side', 'curve', 'angle']);

/** Keep decorative objects outside every approach, junction and turning exit.
 * Dimensions are deliberately conservative; the lesson road geometry owns the
 * driving corridor, while this module only fills the land around it. */
export function courseSceneryLayout(sceneType) {
  const junction = JUNCTIONS.has(sceneType), training = TRAINING.has(sceneType);
  const wide = sceneType === 'road_lanes';
  const clear = (x, z) => {
    if (junction && z > 7 && z < 33) return false;
    if (sceneType === 'angle' && x > 0 && z > -7 && z < 16) return false;
    if (sceneType === 'uturn' && x > -15 && x < 19 && z > -8 && z < 35) return false;
    if (sceneType === 'school' && x < 0 && z > 7 && z < 33) return false;
    if (sceneType === 'bus' && x < 0 && z > 10 && z < 31) return false;
    return true;
  };
  const treeX = sceneType === 'uturn' ? 14.2 : training || wide ? 12 : 8.6;
  const trees = [];
  for (let i = 0; i < 15; i++) {
    for (const side of [-1, 1]) {
      const x = side * (treeX + (i % 3) * .34);
      const z = -58 + i * 19 + (side > 0 ? 6 : 0);
      if (clear(x, z)) trees.push({ x, z, scale: .90 + (i % 4) * .075, variant: i + (side > 0 ? 2 : 0) });
    }
  }
  const buildings = [];
  for (let i = 0; i < 7; i++) for (const side of [-1, 1]) {
    const x = side * (training ? 27 : 24 + i % 2 * 2);
    const z = -55 + i * 37 + (side > 0 ? 4 : 0);
    if (clear(x, z)) buildings.push({ x, z, width: 8 + i % 2, depth: 13 + i % 3 * 2,
      height: 5.9 + i % 3 * 2.75, palette: (i + (side > 0 ? 1 : 0)) % 3 });
  }
  if (sceneType === 'school') buildings.push({ x: -11, z: 20, width: 7, depth: 15, height: 6.0, palette: 0 });
  const sidewalks = [];
  if (!training && sceneType !== 'uturn') {
    for (const side of [-1, 1]) for (let z = -100; z < 290; z += 5) {
      if (clear(side * 8, z) && clear(side * 8, z + 5)) {
        sidewalks.push({ x: side * (wide ? 8.35 : 4.85), z: z + 2.5, side, length: 5 });
      }
    }
  }
  return { trees, buildings, sidewalks, training };
}

/** Environment details are grouped into instanced batches, so adding facade
 * windows, kerb joints and layered foliage does not add one draw call each. */
export function createCourseEnvironment({ parent, sceneType, material, night = false }) {
  const layout = courseSceneryLayout(sceneType);
  const batches = new Map(), transform = new THREE.Object3D();
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const trunk = new THREE.CylinderGeometry(.7, 1, 1, 7);
  const foliage = new THREE.SphereGeometry(1, 11, 8);
  const up = new THREE.Vector3(0, 1, 0), delta = new THREE.Vector3();
  const treeBark = material('#75695b', { roughness: 1 });
  const leafColors = ['#526e4c', '#688059', '#7b8c64'];
  const leaves = leafColors.map(color => material(color, { roughness: 1 }));
  const walls = ['#c1b9a7', '#b0b8b3', '#c1b0a0'].map(color => material(color));
  const stone = material('#a6aaa3'), roof = material('#8f9894');
  const windowFrame = material('#747e7b', { roughness: .72, metalness: .12 });
  const window = material('#667e83', { roughness: .28, metalness: .15,
    emissive: night ? '#8c7552' : '#24373c', emissiveIntensity: night ? .16 : .025 });
  const sill = material('#d5d2c7');
  const door = material('#53666a', { roughness: .45 });
  const walkway = material('#b4b6ac');
  const pavingJoint = material('#9ea399');
  const soil = material('#717964');
  const hedges = material('#6e805a');

  function instance(geometry, mat, position, scale, rotation = null, shadow = true) {
    const key = `${geometry.id}/${mat.id}/${shadow}`;
    if (!batches.has(key)) batches.set(key, { geometry, mat, matrices: [], shadow });
    transform.position.set(...position); transform.scale.set(...scale);
    transform.quaternion.identity(); if (rotation) transform.quaternion.copy(rotation);
    transform.updateMatrix(); batches.get(key).matrices.push(transform.matrix.clone());
  }
  function block(mat, x, y, z, w, h, d, shadow = true) {
    instance(cube, mat, [x, y, z], [w, h, d], null, shadow);
  }
  function branch(from, to, radius) {
    delta.set(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
    const length = delta.length();
    const rotation = new THREE.Quaternion().setFromUnitVectors(up, delta.normalize());
    instance(trunk, treeBark, from.map((v, i) => (v + to[i]) / 2), [radius, length, radius], rotation);
  }
  for (const { x, z, scale: s, variant } of layout.trees) {
    branch([x, 0, z], [x + .08 * s, 3.4 * s, z + .04], .16 * s);
    for (let j = 0; j < 4; j++) {
      const angle = j * 2.4 + variant * .7;
      const ox = Math.cos(angle), oz = Math.sin(angle);
      branch([x, (1.85 + j * .16) * s, z],
        [x + ox * .90 * s, (3.2 + j * .23) * s, z + oz * .90 * s], .075 * s);
      instance(foliage, leaves[(j + variant) % 3],
        [x + ox * .67 * s, (3.3 + j * .31) * s, z + oz * .63 * s],
        [(1.10 + j % 2 * .12) * s, (1.13 + j % 3 * .16) * s, (1.05 + j % 2 * .16) * s]);
    }
    instance(foliage, leaves[variant % 3], [x, 4.23 * s, z], [1.02 * s, 1.07 * s, 1.04 * s]);
    // A restrained soil ring reads as a maintained roadside tree, not a prop
    // planted directly into an uninterrupted green plane.
    block(soil, x, .006, z, 1.5 * s, .035, 1.5 * s, false);
  }

  function building({ x, z, width: w, depth: d, height: h, palette = 0 }) {
    const side = x < 0 ? 1 : -1;
    const face = x + side * w / 2;
    block(walls[palette], x, h / 2, z, w, h, d);
    block(stone, x, .22, z, w + .08, .44, d + .08);
    block(sill, x, h + .09, z, w + .32, .18, d + .32);
    block(roof, x, h + .22, z, w - .3, .12, d - .3);
    const floors = Math.max(1, Math.floor(h / 2.7));
    for (let floor = 0; floor < floors; floor++) {
      const y = 1.65 + floor * 2.65;
      if (floor) block(sill, x, y - 1.17, z, w + .08, .075, d + .08);
      for (let row = 0; row < Math.floor((d - 1) / 2); row++) {
        const zz = z - d / 2 + 1.35 + row * 2;
        if (floor === 0 && Math.abs(zz - z) < 1.5) continue;
        for (const facing of [-1, 1]) {
          const xx = x + facing * (w / 2 + .04);
          block(windowFrame, xx, y, zz, .10, 1.24, 1.25);
          block(window, xx + facing * .06, y, zz, .025, 1.07, 1.08, false);
          block(sill, xx + facing * .10, y - .66, zz, .20, .075, 1.4);
          block(windowFrame, xx + facing * .085, y, zz, .025, 1.07, .04, false);
        }
      }
      for (const facing of [-1, 1]) for (let col = 0; col < Math.floor((w - 1) / 2); col++) {
        const xx = x - w / 2 + 1.35 + col * 2, zz = z + facing * (d / 2 + .045);
        block(windowFrame, xx, y, zz, 1.25, 1.24, .10);
        block(window, xx, y, zz + facing * .06, 1.08, 1.07, .025, false);
        block(sill, xx, y - .66, zz + facing * .09, 1.4, .075, .20);
      }
    }
    block(windowFrame, face + side * .06, 1.12, z, .14, 2.24, 1.65);
    block(door, face + side * .14, 1.13, z, .025, 2.07, 1.47, false);
    block(sill, face + side * .72, 2.58, z, 1.6, .13, 2.7);
    block(stone, face + side * .85, .08, z, 1.85, .15, 2.8);
    block(roof, x - side * 1.4, h + .6, z + d * .2, 1.8, .65, 2.0);
    block(sill, x - side * 1.4, h + .95, z + d * .2, 1.9, .08, 2.1);
    // Entrance hardstanding terminates well outside the roadside corridor.
    block(walkway, face + side * 1.5, .012, z, 3.0, .035, 4, false);
  }
  layout.buildings.forEach(building);

  for (const { x, z, side, length } of layout.sidewalks) {
    block(walkway, x, .045, z, 2.15, .09, length, false);
    block(pavingJoint, x, .093, z - length / 2, 2.15, .008, .025, false);
    block(pavingJoint, x + side * .55, .093, z, .025, .008, length, false);
    block(soil, x + side * 1.55, -.008, z, .8, .05, length, false);
    // Low planting stays below the mirrors and cannot hide a crossing person.
    if (Math.round(z * 2) % 20 === 5 && Math.abs(z - 20) > 14) {
      block(hedges, x + side * 1.55, .24, z, .65, .48, 2.4);
    }
  }
  for (const batch of batches.values()) {
    const object = new THREE.InstancedMesh(batch.geometry, batch.mat, batch.matrices.length);
    object.name = 'course-environment-detail';
    batch.matrices.forEach((matrix, i) => object.setMatrixAt(i, matrix));
    object.instanceMatrix.needsUpdate = true; object.castShadow = batch.shadow; object.receiveShadow = true;
    object.computeBoundingSphere(); parent.add(object);
  }
  return layout;
}
