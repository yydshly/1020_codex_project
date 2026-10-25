import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { CAR } from './vehicle.js';
import { createCockpitSettings, createMirrorFrame, sampleMirrorRay } from './cockpit.js';

// Tire bottom .01 + this lift meets the existing road surface at y=.025.
// Optical eye/mirror heights are world heights; optical vertices subtract this.
export const CAR_VISUAL_ROOT_Y = 0.015;

const vector = values => new THREE.Vector3(...values);

function bodyGeometry() {
  const bevel = 0.025, bottom = 0.36 + bevel, radius = 0.375 + bevel;
  const rear = -0.79 + bevel, front = 3.43 - bevel;
  const end = Math.asin((bottom - 0.34) / radius), start = Math.PI - end;
  const shape = new THREE.Shape();
  shape.moveTo(rear, bottom);
  for (const axle of [0, CAR.wheelbase]) {
    shape.lineTo(axle + radius * Math.cos(start), bottom);
    shape.absarc(axle, 0.34, radius, start, end, true);
  }
  shape.lineTo(front, bottom);
  shape.lineTo(front, 0.75);
  shape.lineTo(3.13, 0.83);
  shape.lineTo(2.10, 0.915);
  shape.lineTo(-0.25, 0.915);
  shape.lineTo(rear, 0.80);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 1.78 - 2 * bevel,
    steps: 1, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 24 });
  geometry.rotateY(-Math.PI / 2);
  geometry.translate(1.78 / 2 - bevel, 0, 0);
  return geometry;
}

/** A generic metric training sedan, with one shared cabin/window structure.
 * Procedural engineering reference, not a scan or a named manufacturer's model. */
export function createTrainingCar({ world }) {
  const car = new THREE.Group(); car.name = 'training-sedan'; world.add(car);
  const cabin = new THREE.Group(); cabin.name = 'shared-cabin'; car.add(cabin);
  const cockpit = new THREE.Group(); cockpit.name = 'interior-fittings'; car.add(cockpit);
  const externalMirrors = new THREE.Group(); externalMirrors.name = 'physical-mirrors'; car.add(externalMirrors);
  const paint = new THREE.MeshPhysicalMaterial({ color: '#edece7', roughness: .30, metalness: .10, clearcoat: .55, clearcoatRoughness: .25, side: THREE.DoubleSide });
  const trim = new THREE.MeshStandardMaterial({ color: '#24282b', roughness: .87, side: THREE.DoubleSide });
  const dashboardMat = new THREE.MeshStandardMaterial({ color: '#303438', roughness: .97, side: THREE.DoubleSide });
  const fabric = new THREE.MeshStandardMaterial({ color: '#42474a', roughness: 1, side: THREE.DoubleSide });
  const headliner = new THREE.MeshStandardMaterial({ color: '#b2b6b4', roughness: 1, side: THREE.DoubleSide });
  const lightTrim = new THREE.MeshStandardMaterial({ color: '#969a99', roughness: .7, metalness: .12 });
  const metal = new THREE.MeshStandardMaterial({ color: '#a7adb0', roughness: .38, metalness: .72 });
  const tireMat = new THREE.MeshStandardMaterial({ color: '#202225', roughness: 1 });
  const glass = new THREE.MeshPhysicalMaterial({ color: '#bdcbd0', roughness: .10, metalness: 0,
    transparent: true, opacity: .16, depthWrite: false, side: THREE.DoubleSide, clearcoat: .2 });
  const lamp = new THREE.MeshStandardMaterial({ color: '#e4e8e5', roughness: .22, metalness: .25 });
  const redLamp = new THREE.MeshStandardMaterial({ color: '#851d22', roughness: .25, metalness: .1 });
  const gaugeFace = new THREE.MeshBasicMaterial({ color: '#11171b', side: THREE.DoubleSide });
  const gaugeMark = new THREE.MeshBasicMaterial({ color: '#d5dfdf', side: THREE.DoubleSide });
  const needleMat = new THREE.MeshBasicMaterial({ color: '#b95b40', side: THREE.DoubleSide });

  function mesh(geometry, material, parent, name) {
    const object = new THREE.Mesh(geometry, material); object.name = name;
    object.castShadow = !material.transparent; object.receiveShadow = true;
    parent.add(object); return object;
  }
  function rounded(name, size, position, material, parent = car, radius = .025) {
    const object = mesh(new RoundedBoxGeometry(...size, 2, radius), material, parent, name);
    object.position.set(...position); return object;
  }
  function beam(name, from, to, width, depth, material, parent = cabin) {
    const a = vector(from), b = vector(to), delta = b.clone().sub(a);
    const object = rounded(name, [width, delta.length(), depth], a.clone().add(b).multiplyScalar(.5).toArray(), material, parent, Math.min(width, depth) * .25);
    object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()); return object;
  }
  function pane(name, points) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(points.flat(), 3));
    geometry.setIndex([0, 1, 2, 0, 2, 3]); geometry.computeVertexNormals();
    const object = mesh(geometry, glass, cabin, name); object.castShadow = false; return object;
  }

  mesh(bodyGeometry(), paint, car, 'body-shell');
  rounded('underbody', [1.44, .10, 3.72], [0, .34, 1.3], trim, car, .035);
  rounded('front-bumper', [1.75, .19, .20], [0, .49, 3.40], paint, car, .065);
  rounded('rear-bumper', [1.75, .18, .16], [0, .48, -.76], paint, car, .055);
  const hood = rounded('sloping-hood', [1.66, .065, 1.22], [0, .915, 2.68], paint, car, .028);
  hood.rotation.x = .085;
  const boot = rounded('boot-lid', [1.63, .055, .58], [0, .887, -.46], paint, car, .025);
  boot.rotation.x = -.08;
  rounded('front-grille', [.66, .115, .025], [0, .65, 3.493], trim, car, .025);
  rounded('front-plate', [.43, .12, .015], [0, .48, 3.508], lightTrim, car, .009);
  rounded('rear-plate', [.43, .12, .015], [0, .58, -.847], lightTrim, car, .009);
  for (const sign of [-1, 1]) {
    rounded(`headlight-${sign}`, [.49, .135, .07], [sign * .56, .762, 3.405], lamp, car, .035);
    rounded(`tail-light-${sign}`, [.37, .14, .065], [sign * .61, .735, -.79], redLamp, car, .025);
    rounded(`sill-${sign}`, [.035, .08, 1.84], [sign * .866, .425, 1.31], paint, car, .016);
    // Door seams and handles stay on the existing side-panel plane.
    beam(`front-door-seam-${sign}`, [sign * .891, .42, .72], [sign * .891, .90, .72], .008, .008, trim, car);
    beam(`rear-door-seam-${sign}`, [sign * .891, .73, -.22], [sign * .891, .90, -.22], .008, .008, trim, car);
    for (const z of [.39, 1.61]) rounded(`door-handle-${sign}-${z}`, [.022, .035, .145], [sign * .888, .83, z], lightTrim, car, .012);
  }

  // All views share these A/B/C pillars, roof, glass and lower window rails.
  // There is no second, enlarged windshield frame for the driver camera.
  rounded('roof', [1.47, .075, 1.48], [0, 1.453, .91], paint, cabin, .035);
  rounded('roof-liner', [1.38, .025, 1.39], [0, 1.412, .91], headliner, cabin, .012);
  for (const sign of [-1, 1]) {
    const aBottom = [sign * .80, .94, 2.08], aTop = [sign * .70, 1.42, 1.59];
    const bBottom = [sign * .81, .94, .75], bTop = [sign * .70, 1.42, .75];
    const cBottom = [sign * .80, .94, -.23], cTop = [sign * .70, 1.42, .23];
    beam(`a-pillar-${sign}`, aBottom, aTop, .065, .07, paint);
    beam(`b-pillar-${sign}`, bBottom, bTop, .055, .06, trim);
    beam(`c-pillar-${sign}`, cBottom, cTop, .10, .085, paint);
    beam(`roof-rail-${sign}`, cTop, aTop, .045, .045, paint);
    beam(`window-sill-${sign}`, cBottom, aBottom, .035, .04, trim);
    pane(`front-door-glass-${sign}`, [[sign * .799, .963, 2.045], [sign * .803, .963, .783], [sign * .703, 1.39, .783], [sign * .703, 1.39, 1.58]]);
    pane(`rear-door-glass-${sign}`, [[sign * .803, .963, .717], [sign * .799, .963, -.19], [sign * .703, 1.39, .235], [sign * .703, 1.39, .717]]);
    rounded(`inner-door-panel-${sign}`, [.065, .37, 1.13], [sign * .764, .73, 1.39], dashboardMat, cockpit, .03);
    rounded(`door-armrest-${sign}`, [.09, .055, .48], [sign * .705, .75, 1.29], trim, cockpit, .02);
    rounded(`inside-door-handle-${sign}`, [.022, .035, .12], [sign * .719, .84, 1.64], metal, cockpit, .012);
  }
  pane('windscreen', [[-.795, .962, 2.071], [.795, .962, 2.071], [.697, 1.415, 1.59], [-.697, 1.415, 1.59]]);
  pane('rear-screen', [[.795, .962, -.221], [-.795, .962, -.221], [-.697, 1.415, .23], [.697, 1.415, .23]]);
  beam('windscreen-upper-seal', [-.70, 1.416, 1.594], [.70, 1.416, 1.594], .025, .025, trim);
  beam('windscreen-lower-seal', [-.80, .955, 2.08], [.80, .955, 2.08], .025, .025, trim);
  beam('rear-screen-lower-seal', [-.80, .955, -.23], [.80, .955, -.23], .025, .025, trim);

  // Matte dashboard with a recessed, forward instrument cluster. The wheel
  // remains closer to the driver than the cluster through its whole rotation.
  const dash = rounded('dashboard', [1.52, .19, .55], [0, .925, 1.97], dashboardMat, cockpit, .065);
  dash.rotation.x = -.06;
  rounded('dashboard-front-trim', [1.43, .025, .04], [0, .947, 1.691], lightTrim, cockpit, .01);
  const cluster = new THREE.Group(); cluster.name = 'instrument-cluster'; cluster.position.set(.39, 1.056, 1.842); cockpit.add(cluster);
  rounded('instrument-hood', [.43, .205, .195], [0, 0, 0], dashboardMat, cluster, .045);
  rounded('instrument-recess', [.365, .15, .008], [0, -.012, -.100], gaugeFace, cluster, .025);
  for (const x of [-.095, .095]) {
    const face = mesh(new THREE.CircleGeometry(.061, 40), gaugeFace, cluster, `dial-${x}`);
    face.position.set(x, -.007, -.106); face.rotation.y = Math.PI;
    const ring = mesh(new THREE.TorusGeometry(.062, .002, 6, 40), lightTrim, cluster, `dial-ring-${x}`);
    ring.position.set(x, -.007, -.109);
    for (let i = 0; i < 11; i++) {
      const angle = (-130 + i * 26) * Math.PI / 180;
      const tick = rounded(`gauge-tick-${x}-${i}`, [.002, i % 2 ? .006 : .009, .001], [x + Math.sin(angle) * .051, -.007 + Math.cos(angle) * .051, -.110], gaugeMark, cluster, .0004);
      tick.rotation.z = -angle;
    }
    const needle = rounded(`gauge-needle-${x}`, [.0025, .046, .001], [x - .016, -.019, -.112], needleMat, cluster, .0004);
    needle.rotation.z = -.95;
  }
  rounded('instrument-display', [.047, .022, .002], [0, -.047, -.111], new THREE.MeshBasicMaterial({ color: '#627c73' }), cluster, .002);
  for (const x of [-.54, -.21, .10, .65]) {
    rounded(`air-vent-${x}`, [.13, .075, .02], [x, .972, 1.685], trim, cockpit, .012);
    for (let i = -1; i <= 1; i++) rounded(`vent-slat-${x}-${i}`, [.112, .004, .008], [x, .972 + i * .017, 1.67], lightTrim, cockpit, .002);
  }
  rounded('center-stack', [.23, .24, .09], [-.10, .80, 1.73], trim, cockpit, .025);
  rounded('radio-panel', [.19, .07, .008], [-.10, .85, 1.68], gaugeFace, cockpit, .006);
  for (const x of [-.16, -.04]) {
    const knob = mesh(new THREE.CylinderGeometry(.025, .025, .016, 16), lightTrim, cockpit, `climate-knob-${x}`);
    knob.rotation.x = Math.PI / 2; knob.position.set(x, .751, 1.674);
  }
  const steering = new THREE.Group(); steering.name = 'steering-wheel';
  steering.position.set(.39, 1.02, 1.55); steering.rotation.x = -.28; cockpit.add(steering);
  mesh(new THREE.TorusGeometry(.17, .018, 12, 48), trim, steering, 'steering-rim');
  rounded('steering-hub', [.115, .095, .045], [0, 0, 0], trim, steering, .03);
  for (const angle of [-Math.PI / 3, Math.PI / 3, Math.PI]) {
    const spoke = rounded(`steering-spoke-${angle}`, [.032, .115, .028], [Math.sin(angle) * .104, Math.cos(angle) * .104, .002], lightTrim, steering, .01);
    spoke.rotation.z = -angle;
  }
  beam('steering-column', [.39, .985, 1.59], [.39, .89, 1.81], .072, .072, trim, cockpit);
  for (const sign of [-1, 1]) {
    rounded(`front-seat-cushion-${sign}`, [.47, .13, .53], [sign * .38, .49, .91], fabric, cockpit, .055);
    const back = rounded(`front-seat-back-${sign}`, [.47, .58, .12], [sign * .38, .82, .60], fabric, cockpit, .05); back.rotation.x = -.12;
    rounded(`headrest-${sign}`, [.25, .18, .105], [sign * .38, 1.185, .565], fabric, cockpit, .04);
  }
  rounded('rear-seat-cushion', [1.32, .12, .42], [0, .49, .05], fabric, cockpit, .04);
  rounded('rear-seat-back', [1.32, .44, .11], [0, .76, -.12], fabric, cockpit, .04);
  rounded('center-console', [.20, .17, .84], [0, .53, 1.12], dashboardMat, cockpit, .03);
  beam('gear-lever', [0, .62, 1.43], [0, .76, 1.41], .017, .017, trim, cockpit);
  const gearKnob = mesh(new THREE.SphereGeometry(.028, 16, 10), trim, cockpit, 'gear-knob'); gearKnob.position.set(0, .775, 1.41);
  rounded('parking-brake-handle', [.035, .045, .18], [-.075, .65, 1.03], trim, cockpit, .018);

  const wheels = [], frontPivots = [];
  for (const z of [0, CAR.wheelbase]) for (const sign of [-1, 1]) {
    const pivot = new THREE.Group(); pivot.name = `wheel-pivot-${sign}-${z}`;
    pivot.position.set(sign * CAR.trackWidth / 2, .34, z); car.add(pivot);
    const wheel = new THREE.Group(); wheel.name = `wheel-${sign}-${z}`; pivot.add(wheel);
    const tire = mesh(new THREE.CylinderGeometry(.33, .33, CAR.tireWidth, 40, 1), tireMat, wheel, 'tire'); tire.rotation.z = Math.PI / 2;
    const rim = mesh(new THREE.CylinderGeometry(.205, .205, CAR.tireWidth + .006, 32), metal, wheel, 'rim'); rim.rotation.z = Math.PI / 2;
    const hub = mesh(new THREE.CylinderGeometry(.059, .059, CAR.tireWidth + .012, 24), trim, wheel, 'hub'); hub.rotation.z = Math.PI / 2;
    // Recessed dark slots suggest a plain steel wheel, without protruding spokes.
    for (const face of [-1, 1]) for (let i = 0; i < 8; i++) {
      const angle = i * Math.PI / 4;
      const slot = mesh(new THREE.CircleGeometry(.025, 10), trim, wheel, 'wheel-slot');
      slot.rotation.y = face * Math.PI / 2;
      slot.position.set(face * (CAR.tireWidth / 2 + .0035), Math.sin(angle) * .135, Math.cos(angle) * .135);
    }
    wheels.push(wheel); if (z > 0) frontPivots.push(pivot);
  }

  const mirrorSurfaces = {};
  for (const side of ['left', 'right']) {
    const sign = side === 'left' ? 1 : -1;
    const frame = createMirrorFrame({ x: 0, z: 0, heading: 0 }, side, createCockpitSettings());
    const center = new THREE.Vector3(frame.center.x, frame.center.y - CAR_VISUAL_ROOT_Y, frame.center.z);
    const normal = new THREE.Vector3(frame.normal.x, frame.normal.y, frame.normal.z);
    const right = new THREE.Vector3(frame.right.x, frame.right.y, frame.right.z);
    const up = new THREE.Vector3(frame.up.x, frame.up.y, frame.up.z);
    const orientation = new THREE.Matrix4().makeBasis(right, up, normal);
    const shell = rounded(`${side}-mirror-backing`, [.212, .139, .040], center.clone().addScaledVector(normal, -.032).toArray(), paint, externalMirrors, .019);
    shell.quaternion.setFromRotationMatrix(orientation);
    // Open rim: no solid plate on the viewer-facing side of the glass.
    for (const edge of [-1, 1]) {
      const horizontal = rounded(`${side}-mirror-rim-h-${edge}`, [.202, .009, .016], center.clone().addScaledVector(up, edge * .064).addScaledVector(normal, -.002).toArray(), trim, externalMirrors, .004);
      horizontal.quaternion.copy(shell.quaternion);
      const vertical = rounded(`${side}-mirror-rim-v-${edge}`, [.009, .12, .016], center.clone().addScaledVector(right, edge * .100).addScaledVector(normal, -.002).toArray(), trim, externalMirrors, .004);
      vertical.quaternion.copy(shell.quaternion);
    }
    // A short folded support meets the underside/rear of the housing. The old
    // diagonal mount crossed the right reflector from the driver's eye.
    const mount = [sign * .81, 1.005 - CAR_VISUAL_ROOT_Y, 1.94];
    const elbow = [sign * 1.005, .945 - CAR_VISUAL_ROOT_Y, 1.93];
    const rearSupport = center.clone().addScaledVector(normal, -.047).addScaledVector(up, -.042).toArray();
    beam(`${side}-mirror-stalk`, mount, elbow, .035, .035, trim, externalMirrors);
    beam(`${side}-mirror-rear-support`, elbow, rearSupport, .035, .035, trim, externalMirrors);
    const geometry = new THREE.PlaneGeometry(frame.width, frame.height, 24, 16);
    const positions = geometry.getAttribute('position');
    for (let row = 0; row <= 16; row++) for (let column = 0; column <= 24; column++) {
      const ray = sampleMirrorRay(frame, -1 + column / 12, 1 - row / 8);
      positions.setXYZ(row * 25 + column, ray.origin.x, ray.origin.y - CAR_VISUAL_ROOT_Y, ray.origin.z);
    }
    positions.needsUpdate = true; geometry.computeVertexNormals(); geometry.computeBoundingSphere();
    const surface = mesh(geometry, new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.DoubleSide, toneMapped: false }), externalMirrors, `${side}-mirror-surface`);
    surface.castShadow = false; surface.receiveShadow = false;
    mirrorSurfaces[side] = surface;
  }
  return { car, cabin, cockpit, wheels, frontPivots, steering, externalMirrors, mirrorSurfaces };
}
