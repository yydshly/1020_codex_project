import * as THREE from 'three';
import { CAR, BAY, COURSE } from './vehicle.js';
import { ROAD_SURFACE_Y as SURFACE_Y, PAINT_SURFACE_Y as PAINT_Y, TEACHING_SURFACE_Y as TEACHING_Y } from './scene-geometry.js';

/** A metric practice yard. The caller owns lighting and the optional texture.
 * asphaltMap is an already-loaded THREE.Texture; its wrapping/repeat/colorSpace
 * are left untouched. No markings change vehicle or course geometry. */
export function createDrivingYard({ world, helpers, asphaltMap = null }) {
  const yard = new THREE.Group();
  yard.name = 'driving-yard';
  world.add(yard);
  const teachingObjects = new THREE.Group();
  teachingObjects.name = 'yard-teaching-aids';
  teachingObjects.visible = false;
  helpers.add(teachingObjects);

  const material = (color, options = {}) => new THREE.MeshStandardMaterial({ color, roughness: .94, metalness: 0, ...options });
  const concrete = material('#a2a29b');
  const wallMaterial = material('#babbb3');
  const wallCap = material('#858b88');
  const steel = material('#626e73', { roughness: .68, metalness: .25 });
  const blue = material('#32647c', { roughness: .82 });
  const dark = material('#3c4142');
  const white = material('#e9e7d9');
  const foliage = material('#53674f');
  const bark = material('#746959');
  const asphaltMaterial = material(asphaltMap ? '#ffffff' : '#767c7e', { map: asphaltMap, roughness: .97 });
  const normalLineMaterial = material('#e1b94c', { roughness: .88 });
  const warningLineMaterial = material('#c8653e', { roughness: .88 });

  function plane(width, depth, mat, x, z, parent = yard, y = PAINT_Y) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  // Repeated architecture shares one cube and one draw call per material.
  const cubeGeometry = new THREE.BoxGeometry(1, 1, 1);
  const boxBatches = new Map();
  function box(width, height, depth, mat, x, y, z, rotationY = 0) {
    if (!boxBatches.has(mat)) boxBatches.set(mat, []);
    boxBatches.get(mat).push({ x, y, z, width, height, depth, rotationY });
  }
  const transform = new THREE.Object3D();
  function finishBoxes() {
    for (const [mat, boxes] of boxBatches) {
      const mesh = new THREE.InstancedMesh(cubeGeometry, mat, boxes.length);
      mesh.name = 'yard-architecture';
      boxes.forEach((value, index) => {
        transform.position.set(value.x, value.y, value.z);
        transform.rotation.set(0, value.rotationY, 0);
        transform.scale.set(value.width, value.height, value.depth);
        transform.updateMatrix(); mesh.setMatrixAt(index, transform.matrix);
      });
      mesh.castShadow = true; mesh.receiveShadow = true;
      mesh.computeBoundingSphere(); yard.add(mesh);
    }
  }

  plane(150, 150, material('#a5aa9d'), 0, 0, yard, -.09);
  plane(34.6, 26.8, concrete, 0, .8, yard, .012);
  const surface = plane(31, 23.2, asphaltMaterial, 0, .8, yard, SURFACE_Y);
  surface.name = 'driving-surface';

  // The boundary centres and widths match the existing course. These are paint,
  // not elevated curb boxes: the whole normal layer is 2 mm above the surface.
  const bayLines = [];
  for (const x of [BAY.left, BAY.right]) {
    bayLines.push(plane(.10, BAY.entrance - BAY.back, normalLineMaterial, x, (BAY.back + BAY.entrance) / 2));
  }
  bayLines.push(plane(BAY.right - BAY.left + .10, .10, normalLineMaterial, 0, BAY.back));
  bayLines.forEach((mesh, index) => { mesh.name = `bay-paint-${index}`; });

  const paintBatches = new Map();
  function paint(width, depth, mat, x, z) {
    if (!paintBatches.has(mat)) paintBatches.set(mat, []);
    paintBatches.get(mat).push({ width, depth, x, z });
  }
  paint(COURSE.roadRight - COURSE.roadLeft, .10, normalLineMaterial, 0, COURSE.roadTop);
  for (const x of [COURSE.roadLeft, COURSE.roadRight]) {
    paint(.10, COURSE.roadTop - BAY.entrance, normalLineMaterial, x, (COURSE.roadTop + BAY.entrance) / 2);
  }
  paint(BAY.left - COURSE.roadLeft, .10, normalLineMaterial, (COURSE.roadLeft + BAY.left) / 2, BAY.entrance);
  paint(COURSE.roadRight - BAY.right, .10, normalLineMaterial, (COURSE.roadRight + BAY.right) / 2, BAY.entrance);
  for (const x of [COURSE.controlA, COURSE.controlB]) {
    for (let z = BAY.entrance + .3; z < COURSE.roadTop; z += .8) paint(.10, .45, white, x, z);
  }
  const paintGeometry = new THREE.PlaneGeometry(1, 1);
  for (const [mat, strips] of paintBatches) {
    const mesh = new THREE.InstancedMesh(paintGeometry, mat, strips.length);
    mesh.name = 'course-paint';
    strips.forEach((strip, index) => {
      transform.position.set(strip.x, PAINT_Y, strip.z);
      transform.rotation.set(-Math.PI / 2, 0, 0);
      transform.scale.set(strip.width, strip.depth, 1);
      transform.updateMatrix(); mesh.setMatrixAt(index, transform.matrix);
    });
    mesh.receiveShadow = true; mesh.computeBoundingSphere(); yard.add(mesh);
  }

  // Low-contrast service joints live on the concrete shoulder, outside the test
  // lane. They establish scale without creating extra steering reference marks.
  const jointPoints = [];
  for (let z = -11.4; z <= 13; z += 3.2) {
    for (const sign of [-1, 1]) jointPoints.push(sign * 15.55, .014, z, sign * 17.25, .014, z);
  }
  const joints = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(jointPoints, 3)), new THREE.LineBasicMaterial({ color: '#747d77', transparent: true, opacity: .27 }));
  joints.name = 'shoulder-joints'; yard.add(joints);

  // All solid scenery is outside BOUNDS (x ±15, z -10..12). A quiet perimeter
  // keeps the mirror background plausible without introducing route obstacles.
  for (const x of [-17.45, 17.45]) {
    box(.28, .22, 27.2, concrete, x, .11, .8);
    box(.22, .65, 27.2, wallMaterial, x, .325, .8);
    box(.30, .08, 27.3, wallCap, x, .69, .8);
  }
  box(35.2, 1.45, .24, wallMaterial, 0, .725, -12.9);
  box(35.3, .08, .32, wallCap, 0, 1.49, -12.9);
  // Two front wall pieces leave an actual open entrance, away from the course.
  for (const x of [-11.7, 11.7]) {
    box(11.4, .65, .24, wallMaterial, x, .325, 14.45);
    box(11.5, .08, .30, wallCap, x, .69, 14.45);
  }

  const fencePoints = [];
  for (const x of [-17.45, 17.45]) {
    for (let z = -12.5; z <= 14.2; z += 2.4) box(.065, 1.45, .065, steel, x, 1.40, z);
    for (const y of [.86, 1.95]) fencePoints.push(x, y, -12.6, x, y, 14.3);
    for (let z = -12.5; z < 14.3; z += .28) fencePoints.push(x, .87, z, x, 1.94, z);
    for (let y = 1.1; y < 1.9; y += .28) fencePoints.push(x, y, -12.6, x, y, 14.3);
  }
  const fence = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(fencePoints, 3)), new THREE.LineBasicMaterial({ color: '#758283', transparent: true, opacity: .7 }));
  fence.name = 'perimeter-wire-fence'; yard.add(fence);

  // Canvas signs are local text, not images standing in for traversable space.
  function textMaterial(title, subtitle = '', { background = null, color = '#f3f5ed' } = {}) {
    if (typeof document === 'undefined') return new THREE.MeshBasicMaterial({ color: background ?? color, transparent: !background, opacity: background ? 1 : 0 });
    const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 256;
    const context = canvas.getContext('2d');
    if (background) { context.fillStyle = background; context.fillRect(0, 0, 1024, 256); }
    context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillStyle = color;
    context.font = `600 ${subtitle ? 83 : 105}px "Microsoft YaHei",sans-serif`;
    context.fillText(title, 512, subtitle ? 95 : 128);
    if (subtitle) { context.font = '400 38px "Microsoft YaHei",sans-serif'; context.fillText(subtitle, 512, 191); }
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshBasicMaterial({ map: texture, transparent: !background, depthWrite: Boolean(background), toneMapped: false, side: THREE.DoubleSide });
  }
  function sign(title, subtitle, x, z, rotationY = 0, width = 3.2) {
    const height = width / 4;
    const group = new THREE.Group(); group.position.set(x, 2.35, z); group.rotation.y = rotationY; yard.add(group);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(width + .09, height + .09, .08), steel); group.add(panel);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(width, height), textMaterial(title, subtitle, { background: '#315c77' }));
    face.position.z = .041; group.add(face);
    for (const offset of [-width * .35, width * .35]) {
      const dx = Math.cos(rotationY) * offset, dz = -Math.sin(rotationY) * offset;
      box(.075, 2.05, .075, steel, x + dx, 1.025, z + dz);
    }
  }
  sign('倒车入库', '科目二训练区', 0, -12.68, 0, 3.8);
  sign('训练场地', '低速行驶 · 注意观察', -17.12, 3, Math.PI / 2, 3.4);

  // A small service building and an open-sided shelter stay well off the road.
  box(6.2, 2.75, 3.8, wallMaterial, 22.1, 1.375, -6.2);
  box(6.45, .16, 4.1, blue, 22.1, 2.83, -6.2);
  box(.05, 1.9, .9, dark, 18.975, .95, -6.55);
  box(.055, .72, 1.15, material('#86969b', { roughness: .4 }), 18.975, 1.75, -4.95);
  for (const z of [3, 8.8]) for (const x of [19.1, 22.6]) box(.10, 2.55, .10, steel, x, 1.275, z);
  box(4.1, .14, 6.5, blue, 20.85, 2.62, 5.9);
  box(4.3, .08, 6.7, concrete, 20.85, .04, 5.9);
  // Two low barriers flank the entrance; none sit beside a bay corner.
  for (const x of [-5.1, 5.1]) {
    box(1.6, .5, .38, white, x, .25, 14.1);
    box(.5, .36, .395, normalLineMaterial, x, .26, 14.1);
  }

  // Restrained distant green belt: smooth, irregular overlapping crowns, batched
  // in one draw call, rather than prominent faceted trees beside every bay.
  box(37, .25, 1.5, material('#737b68'), 0, .08, -15.3);
  box(1.5, .25, 29, material('#737b68'), -20.2, .08, .8);
  const treePositions = [[-15, -16], [-8, -16.4], [1, -16], [10, -16.6], [17, -16], [-21, -6], [-21.5, 5], [-21, 13]];
  const crowns = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 16, 10), foliage, treePositions.length * 3);
  const crownOffsets = [[0, 2.7, 0, 1.5, 1.65, 1.3], [-.75, 3.1, .12, 1.05, 1.2, 1.0], [.7, 2.65, .2, .95, 1.3, 1.0]];
  treePositions.forEach(([x, z], index) => {
    box(.22, 2.1, .22, bark, x, 1.05, z);
    crownOffsets.forEach(([dx, y, dz, sx, sy, sz], crownIndex) => {
      const scale = .9 + (index % 3) * .08;
      transform.position.set(x + dx, y * scale, z + dz);
      transform.rotation.set(0, index * .7, 0); transform.scale.set(sx * scale, sy * scale, sz * scale);
      transform.updateMatrix(); crowns.setMatrixAt(index * 3 + crownIndex, transform.matrix);
    });
  });
  crowns.name = 'distant-green-belt'; crowns.receiveShadow = true; crowns.computeBoundingSphere(); yard.add(crowns);
  finishBoxes();

  // Teaching overlays never become part of the normal physical ground.
  const aidMaterial = new THREE.MeshBasicMaterial({ color: '#6d997d', transparent: true, opacity: .18, depthWrite: false });
  const bayFill = plane(BAY.right - BAY.left, BAY.entrance - BAY.back, aidMaterial, 0, (BAY.back + BAY.entrance) / 2, teachingObjects, TEACHING_Y);
  bayFill.name = 'teaching-bay-fill';
  const grid = new THREE.GridHelper(30, 30, '#687478', '#7b8584');
  grid.position.set(0, TEACHING_Y, .8); grid.material.transparent = true; grid.material.opacity = .16;
  grid.material.depthWrite = false; grid.name = 'teaching-grid'; teachingObjects.add(grid);
  function groundLabel(text, x, z, width, parent = teachingObjects, color = '#385a49') {
    const mesh = plane(width, width / 4, textMaterial(text, '', { color }), x, z, parent, TEACHING_Y);
    mesh.name = `teaching-label-${text}`; mesh.receiveShadow = false;
    return mesh;
  }
  groundLabel('库宽 2.3 m', 0, -4.2, 1.9);
  groundLabel('车道宽 6.7 m', 10.6, 2, 2.7);
  groundLabel('A 控制线', COURSE.controlA, 6.15, 2.7);
  groundLabel('B 控制线', COURSE.controlB, 6.15, 2.7);

  const targetOutline = new THREE.Group(); targetOutline.name = 'teaching-target-outline'; teachingObjects.add(targetOutline);
  const targetMaterial = new THREE.MeshBasicMaterial({ color: '#48816c', transparent: true, opacity: .85, depthWrite: false });
  const bayCenter = (BAY.back + BAY.entrance) / 2;
  for (const x of [-CAR.width / 2, CAR.width / 2]) plane(.035, CAR.length, targetMaterial, x, bayCenter, targetOutline, TEACHING_Y);
  for (const z of [bayCenter - CAR.length / 2, bayCenter + CAR.length / 2]) plane(CAR.width, .035, targetMaterial, 0, z, targetOutline, TEACHING_Y);
  const turnMarkers = new THREE.Group(); turnMarkers.name = 'teaching-turn-markers'; teachingObjects.add(turnMarkers);

  // Orientation labels have their own switch because beginner overview may
  // intentionally run with the optional guides disabled. The parent moves carLabel.
  const landmarks = new THREE.Group(); landmarks.name = 'beginner-yard-landmarks'; landmarks.visible = false; world.add(landmarks);
  landmarks.carLabel = groundLabel('你的车', 0, 0, 3.4, landmarks, '#f0f1ec');
  landmarks.bayLabel = groundLabel('目标车库', 0, bayCenter, 2.2, landmarks, '#f1d679');

  return { bayLines, normalLineMaterial, warningLineMaterial, grid, targetOutline, turnMarkers, teachingObjects, landmarks,
    yard, asphaltMaterial, surfaceY: SURFACE_Y, surfaceSize: { width: 31, depth: 23.2 } };
}
