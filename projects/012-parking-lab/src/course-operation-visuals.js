import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const clamp01 = value => Math.max(0, Math.min(1, Number(value) || 0));
const finite = value => typeof value === 'number' && Number.isFinite(value);
const UP = new THREE.Vector3(0, 1, 0);
const GEAR_POSITIONS = Object.freeze({
  N: [0, 0], '1': [.036, .042], '2': [.036, -.042],
  '3': [0, .042], '4': [0, -.042], '5': [-.036, .042], R: [-.036, -.042],
});

/** Explicit auxiliary close-ups; these never feed the calibrated driver eye
 * or any mirror camera. Positions are vehicle-local metric coordinates. */
export function courseOperationCamera(target, aspect = 1.6) {
  const light = { position: [.90, 1.15, 1.28], target: [.48, .99, 1.68], fov: 44, minHorizontal: 47 };
  const pedals = { position: [.11, .80, 1.43], target: [.415, .555, 1.91], fov: 42, minHorizontal: 48 };
  const poses = {
    headlight: light, 'turn-signal': light,
    hazard: { position: [-.20, 1.20, 1.23], target: [.18, 1.04, 1.75], fov: 44, minHorizontal: 57 },
    clutch: pedals, brake: pedals, throttle: pedals,
    gear: { position: [-.28, 1.02, 1.16], target: [0, .75, 1.43], fov: 38, minHorizontal: 35 },
    'parking-brake': { position: [-.29, .97, .91], target: [-.07, .68, 1.10], fov: 42, minHorizontal: 40 },
    steering: { position: [.39, 1.28, 1.10], target: [.39, 1.02, 1.55], fov: 52, minHorizontal: 49 },
  };
  const fallbackTargets = { door: [.86, 1.05, 1.29], mirrors: [.77, .98, 1.80], seat: [.38, .61, .99], belt: [.40, .88, .98] };
  const pose = poses[target] || { position: [-.42, 1.21, .86], target: fallbackTargets[target] || [.32, .78, 1.67], fov: 51, minHorizontal: 42 };
  const horizontalFit = 2 * Math.atan(Math.tan(pose.minHorizontal * Math.PI / 360) / Math.max(.5, Number(aspect) || 1.6)) * 180 / Math.PI;
  return { position: [...pose.position], target: [...pose.target], fov: Math.max(pose.fov, Math.min(75, horizontalFit)) };
}

export function isExteriorCourseLamp(object) {
  return Boolean(object?.isMesh && typeof object.material?.clone === 'function'
    && /^(headlight|tail-light)-(-?1)$/.test(object.name));
}

/** One light state drives exterior shells, road beams and cockpit indicators.
 * Hazard in this lesson includes position lights; neither mode casts a beam. */
export function courseLightState(pose = {}) {
  const mode = String(pose.lightMode ?? 'off').toLowerCase();
  const time = Number(pose.t ?? pose.time) || 0, blink = Math.floor(time * 2) % 2 === 0;
  const on = /low|high|flash|近|远|交替/.test(mode);
  const high = /high|远/.test(mode) || /flash|交替/.test(mode) && blink;
  const positionLights = /hazard|parking|position|示廓/.test(mode);
  const hazard = mode === 'hazard';
  const braking = finite(pose.brakeValue) ? pose.brakeValue > 0 : Boolean(pose.brake);
  return { on, high, positionLights, hazard, blink,
    leftSignal: Boolean(pose.leftSignal || hazard), rightSignal: Boolean(pose.rightSignal || hazard),
    beamIntensity: on ? high ? 1600 : 750 : 0,
    frontEmission: on ? high ? 2 : .8 : positionLights ? .12 : 0,
    rearEmission: braking ? 2.2 : on || positionLights ? .35 : 0,
  };
}

/** Stable on seek and independent of render rate. Distance is signed: the
 * wheels unwind in reverse, and a stopped car never spins while its clock runs. */
export function createCourseDistanceTrack(poses = []) {
  let distance = 0;
  return poses.map((pose, index) => {
    if (finite(pose.distance)) distance = pose.distance;
    else if (index) {
      const previous = poses[index - 1];
      const dx = (pose.x || 0) - (previous.x || 0), dz = (pose.z || 0) - (previous.z || 0);
      const dy = (pose.y || 0) - (previous.y || 0);
      const heading = Math.atan2(Math.sin(previous.heading || 0) + Math.sin(pose.heading || 0),
        Math.cos(previous.heading || 0) + Math.cos(pose.heading || 0));
      const projection = dx * Math.sin(heading) + dz * Math.cos(heading);
      const sign = Math.abs(projection) > .00001 ? Math.sign(projection) : Math.sign(pose.speed || previous.speed || 1);
      distance += Math.hypot(dx, dy, dz) * sign;
    }
    return { t: Number(pose.t ?? pose.time) || 0, distance };
  });
}

export function sampleCourseDistance(track, time) {
  if (!track.length) return 0;
  if (time <= track[0].t) return track[0].distance;
  if (time >= track.at(-1).t) return track.at(-1).distance;
  let low = 0, high = track.length - 1;
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if (track[middle].t <= time) low = middle; else high = middle;
  }
  const a = track[low], b = track[high];
  const u = clamp01((time - a.t) / Math.max(.000001, b.t - a.t));
  return a.distance + (b.distance - a.distance) * u;
}

/** Pose metadata owns the driving controls. A teaching focus must never make a
 * brake, gear or steering wheel contradict the car travelling through a lesson. */
export function courseControlState(pose = {}, operation = null, { prepare = false } = {}) {
  const progress = clamp01(operation?.progress);
  const lights = courseLightState(pose);
  const clutch = finite(pose.clutchValue) ? clamp01(pose.clutchValue)
    : pose.clutchState === 'down' ? 1 : pose.clutchState === 'bite' ? .5 : pose.clutchState === 'up' ? 0 : pose.clutch ? 1 : 0;
  const brake = finite(pose.brakeValue) ? clamp01(pose.brakeValue) : pose.brake ? 1 : 0;
  const throttle = finite(pose.throttle) ? clamp01(pose.throttle) : 0;
  const gear = String(pose.gear ?? 'N').toUpperCase();
  const door = finite(operation?.doorOpen) ? clamp01(operation.doorOpen)
    : operation?.target === 'door' ? ['close', 'closed'].includes(operation.value) ? 1 - progress : progress : 0;
  const belt = finite(operation?.beltValue) ? clamp01(operation.beltValue)
    : operation?.target === 'belt' ? operation.value === 'release' ? 1 - progress : progress
      : typeof operation?.beltFastened === 'boolean' ? Number(operation.beltFastened) : prepare ? 0 : 1;
  return { clutch, brake, throttle, gear, gearPosition: GEAR_POSITIONS[gear] || GEAR_POSITIONS.N,
    parkingBrake: Boolean(pose.parkingBrake), door, belt,
    seatOffset: operation?.kind === 'prepare' && operation.target === 'seat' ? -.085 * (1 - progress) : 0,
    mirrorAdjust: operation?.kind === 'prepare' && operation.target === 'mirrors' ? Math.sin(progress * Math.PI * 2) * .24 : 0,
    ...lights,
  };
}

/** Subtract an axis-aligned opening from surface triangles. This is local to
 * the course car; the shared original sedan/parking model is never modified. */
export function cutCourseCabinOpening(geometry, min, max) {
  const source = geometry.index ? geometry.toNonIndexed() : geometry;
  const position = source.getAttribute('position'), normal = source.getAttribute('normal'), uv = source.getAttribute('uv');
  const output = { position: [], normal: [], uv: [] };
  const emit = polygon => {
    for (let j = 1; j < polygon.length - 1; j++) for (const vertex of [polygon[0], polygon[j], polygon[j + 1]]) {
      output.position.push(...vertex.p); output.normal.push(...vertex.n.clone().normalize()); output.uv.push(...vertex.uv);
    }
  };
  const planes = [0, 1, 2].flatMap(axis => [{ axis, offset: min[axis], sign: 1 }, { axis, offset: max[axis], sign: -1 }]);
  for (let i = 0; i < position.count; i += 3) {
    let polygon = [0, 1, 2].map(j => ({ p: new THREE.Vector3().fromBufferAttribute(position, i + j),
      n: new THREE.Vector3().fromBufferAttribute(normal, i + j), uv: uv ? new THREE.Vector2().fromBufferAttribute(uv, i + j) : new THREE.Vector2() }));
    if ([0, 1, 2].some(axis => polygon.every(v => v.p.getComponent(axis) < min[axis]) || polygon.every(v => v.p.getComponent(axis) > max[axis]))) {
      emit(polygon); continue;
    }
    for (const plane of planes) {
      const inside = [], outside = [];
      for (let j = 0; j < polygon.length; j++) {
        const a = polygon[j], b = polygon[(j + 1) % polygon.length];
        const da = (a.p.getComponent(plane.axis) - plane.offset) * plane.sign;
        const db = (b.p.getComponent(plane.axis) - plane.offset) * plane.sign;
        (da >= -1e-8 ? inside : outside).push(a);
        if (da > 1e-8 && db < -1e-8 || da < -1e-8 && db > 1e-8) {
          const t = da / (da - db), intersection = { p: a.p.clone().lerp(b.p, t), n: a.n.clone().lerp(b.n, t), uv: a.uv.clone().lerp(b.uv, t) };
          inside.push(intersection); outside.push(intersection);
        }
      }
      emit(outside); polygon = inside;
      if (polygon.length < 3) break;
    }
  }
  const result = new THREE.BufferGeometry();
  result.setAttribute('position', new THREE.Float32BufferAttribute(output.position, 3));
  result.setAttribute('normal', new THREE.Float32BufferAttribute(output.normal, 3));
  result.setAttribute('uv', new THREE.Float32BufferAttribute(output.uv, 2));
  result.computeBoundingBox(); result.computeBoundingSphere();
  if (source !== geometry) source.dispose();
  return result;
}

/** Visible control hardware, attached only to this full-course car instance.
 * +X is the driver's left: clutch, brake, throttle run +X to -X. */
export function createCourseOperationVisuals(model) {
  const { car, cockpit } = model;
  const group = new THREE.Group(); group.name = 'course-operation-hardware'; cockpit.add(group);
  const textures = new Set(), materials = new Set();
  const mat = (color, options = {}) => {
    const value = new THREE.MeshStandardMaterial({ color, roughness: .8, ...options }); materials.add(value); return value;
  };
  const charcoal = mat('#343b3d'), metal = mat('#909d9d', { metalness: .5, roughness: .4 }), rubber = mat('#252c2d');
  const beltMaterial = mat('#3b4140', { roughness: 1 }), buckleMaterial = mat('#9e3732');
  const focusMaterials = new Map();
  const targetMaterial = (target, color = '#42494a') => {
    const value = mat(color, { emissive: '#dfb469', emissiveIntensity: 0 }); focusMaterials.set(target, value); return value;
  };
  function mesh(geometry, material, name, position, parent = group) {
    const object = new THREE.Mesh(geometry, material); object.name = name;
    if (position) object.position.set(...position);
    object.castShadow = true; object.receiveShadow = true; parent.add(object); return object;
  }
  const block = (name, size, position, material = charcoal, parent = group) => mesh(new RoundedBoxGeometry(...size, 2, Math.min(...size) * .18), material, name, position, parent);
  const rod = (name, from, to, width, material, parent = group) => {
    const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to), delta = b.clone().sub(a);
    const object = block(name, [width, delta.length(), width], a.clone().add(b).multiplyScalar(.5).toArray(), material, parent);
    object.quaternion.setFromUnitVectors(UP, delta.normalize()); return object;
  };
  function label(name, text, size, position, parent = group, top = false) {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas'); canvas.width = 192; canvas.height = 128;
    const context = canvas.getContext('2d'); context.fillStyle = '#30393c'; context.fillRect(0, 0, 192, 128);
    context.fillStyle = '#e4e6dc'; context.font = '600 31px sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle';
    text.split('\n').forEach((line, i, lines) => context.fillText(line, 96, 64 + (i - (lines.length - 1) / 2) * 47));
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; textures.add(texture);
    const value = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }); materials.add(value);
    const object = mesh(new THREE.PlaneGeometry(...size), value, name, position, parent); object.castShadow = false;
    if (top) { object.rotation.x = -Math.PI / 2; object.rotateZ(Math.PI); }
    else object.rotation.y = Math.PI;
    return object;
  }

  // Open the monolithic shell's hidden cabin top and driver-door aperture.
  const shell = car.getObjectByName('body-shell');
  if (shell) {
    const original = shell.geometry;
    const cabinOpen = cutCourseCabinOpening(original, [-.73, .385, .40], [.73, 1.07, 2.10]);
    shell.geometry = cutCourseCabinOpening(cabinOpen, [.73, .395, .735], [1.05, 1.05, 2.075]);
    original.dispose(); cabinOpen.dispose();
  }
  block('driver-footwell-mat', [.67, .018, .63], [.40, .405, 1.66], rubber);
  const pedalPivots = {};
  for (const [target, x, width] of [['clutch', .58, .080], ['brake', .405, .080], ['throttle', .23, .052]]) {
    const pivot = new THREE.Group(); pivot.name = `${target}-pedal-pivot`; pivot.position.set(x, .715, 1.99); group.add(pivot);
    rod(`${target}-pedal-arm`, [0, 0, 0], [0, -.17, -.075], .014, metal, pivot);
    const plate = block(`${target}-pedal`, [width, target === 'throttle' ? .15 : .105, .025], [0, -.18, -.09], targetMaterial(target, '#32393a'), pivot);
    plate.rotation.x = -.25;
    for (let i = -1; i <= 1; i++) block(`${target}-pedal-grip-${i}`, [width * .85, .006, .005], [0, -.18 + i * .024, -.106], rubber, pivot);
    pedalPivots[target] = pivot;
  }

  // Replace the static knob with a complete pivoted H-pattern lever.
  for (const name of ['gear-lever', 'gear-knob']) { const object = car.getObjectByName(name); if (object) object.visible = false; }
  const gearPivot = new THREE.Group(); gearPivot.name = 'demonstrated-gear-lever'; gearPivot.position.set(0, .625, 1.43); group.add(gearPivot);
  mesh(new THREE.CylinderGeometry(.052, .061, .035, 16), rubber, 'gear-gaiter', [0, 0, 0], gearPivot);
  rod('gear-shaft', [0, 0, 0], [0, .15, 0], .014, metal, gearPivot);
  mesh(new THREE.SphereGeometry(.032, 16, 10), targetMaterial('gear'), 'demonstrated-gear-knob', [0, .16, 0], gearPivot);
  label('gear-pattern', '1 3 5\n2 4 R', [.052, .037], [0, .19, 0], gearPivot, true);
  const parkingHandle = car.getObjectByName('parking-brake-handle');
  const handbrake = new THREE.Group(); handbrake.name = 'demonstrated-parking-brake'; handbrake.position.set(-.075, .63, 1.13); group.add(handbrake);
  car.updateMatrixWorld(true);
  if (parkingHandle) { handbrake.attach(parkingHandle); parkingHandle.material = targetMaterial('parking-brake'); }

  const stalk = new THREE.Group(); stalk.name = 'indicator-headlight-stalk'; stalk.position.set(.46, .98, 1.60); group.add(stalk);
  rod('indicator-stalk-arm', [0, 0, 0], [.20, 0, -.035], .018, charcoal, stalk);
  const lightSwitch = new THREE.Group(); lightSwitch.position.set(.20, 0, -.035); lightSwitch.rotation.z = -Math.PI / 2; stalk.add(lightSwitch);
  const lightKnob = new THREE.Group(); lightKnob.name = 'headlight-rotary-switch'; lightSwitch.add(lightKnob);
  mesh(new THREE.CylinderGeometry(.023, .023, .055, 12), targetMaterial('headlight'), 'headlight-switch-knob', [0, 0, 0], lightKnob);
  block('headlight-switch-marker', [.005, .041, .006], [.023, 0, 0], metal, lightKnob);
  const hazard = block('hazard-light-button', [.038, .034, .012], [-.10, .941, 1.672], targetMaterial('hazard', '#9c4037'));
  label('hazard-triangle', '△', [.030, .025], [-.10, .941, 1.664]);

  const led = (name, x, color, shape = null) => {
    const material = new THREE.MeshBasicMaterial({ color: '#253332', side: THREE.DoubleSide }); materials.add(material);
    const object = mesh(shape || new THREE.CircleGeometry(.008, 16), material, `${name}-indicator`, [x, 1.125, 1.726]);
    object.castShadow = false; object.userData.onColor = color; return object;
  };
  const arrow = new THREE.Shape(); arrow.moveTo(-.012, 0); arrow.lineTo(-.002, .009); arrow.lineTo(-.002, .004); arrow.lineTo(.011, .004);
  arrow.lineTo(.011, -.004); arrow.lineTo(-.002, -.004); arrow.lineTo(-.002, -.009); arrow.closePath();
  const leds = {
    left: led('left-turn', .495, '#6ccc83', new THREE.ShapeGeometry(arrow)),
    right: led('right-turn', .285, '#6ccc83', new THREE.ShapeGeometry(arrow)),
    high: led('high-beam', .37, '#62aaff'), low: led('low-beam', .405, '#75c992'),
    belt: led('seat-belt', .445, '#e1735c'), park: led('parking-brake', .335, '#e1735c'),
    position: led('position-light', .465, '#75c992'),
  };
  // Viewed from the rear of the panel, driver's left is +X.
  leds.left.rotation.z = Math.PI;

  const doorPivot = new THREE.Group(); doorPivot.name = 'demonstrated-driver-door'; doorPivot.position.set(.84, 0, 2.075); car.add(doorPivot);
  block('front-driver-door-panel', [.075, .50, 1.34], [.012, .67, -.67], shell?.material || charcoal, doorPivot);
  car.updateMatrixWorld(true);
  for (const name of ['front-door-glass-1', 'inner-door-panel-1', 'door-armrest-1', 'inside-door-handle-1', 'door-handle-1-1.61']) {
    const object = car.getObjectByName(name); if (object) doorPivot.attach(object);
  }
  const oldSill = car.getObjectByName('window-sill-1'); if (oldSill) oldSill.visible = false;
  rod('driver-rear-window-sill', [.80, .94, -.23], [.80, .94, .735], .035, charcoal);
  rod('driver-front-window-sill', [-.04, .94, -1.34], [-.04, .94, -.005], .035, charcoal, doorPivot);
  rod('driver-door-rear-window-frame', [-.037, .963, -1.29], [-.137, 1.39, -1.292], .019, charcoal, doorPivot);
  rod('driver-door-upper-window-frame', [-.137, 1.39, -1.292], [-.137, 1.39, -.495], .019, charcoal, doorPivot);
  rod('driver-door-front-window-frame', [-.137, 1.39, -.495], [-.041, .963, -.03], .019, charcoal, doorPivot);
  const mirrorAdjust = new THREE.Group(); mirrorAdjust.name = 'mirror-adjustment-control'; mirrorAdjust.position.set(-.125, .89, -.22); doorPivot.add(mirrorAdjust);
  mesh(new THREE.SphereGeometry(.017, 12, 8), targetMaterial('mirrors'), 'mirror-adjustment-joystick', [0, .021, 0], mirrorAdjust);
  rod('mirror-adjustment-stem', [0, 0, 0], [0, .023, 0], .009, charcoal, mirrorAdjust);
  const driverSeat = new THREE.Group(); driverSeat.name = 'adjustable-driver-seat'; group.add(driverSeat);
  car.updateMatrixWorld(true);
  for (const name of ['front-seat-cushion-1', 'front-seat-back-1', 'headrest-1']) {
    const object = car.getObjectByName(name); if (object) driverSeat.attach(object);
  }
  block('seat-adjustment-handle', [.15, .018, .024], [.39, .435, 1.185], targetMaterial('seat'), driverSeat);
  const beltSegments = [0, 1].map(i => block(`driver-seat-belt-${i}`, [.045, 1, .005], [0, 0, 0], beltMaterial));
  const buckle = block('driver-seat-belt-buckle', [.042, .055, .033], [.13, .58, 1.15], buckleMaterial);
  const tongue = block('driver-seat-belt-tongue', [.031, .038, .014], [.13, .61, 1.15], metal);
  const beltAnchor = new THREE.Vector3(.74, 1.28, .70), hanging = new THREE.Vector3(.76, .54, .76), fastened = new THREE.Vector3(.13, .60, 1.15);
  const endpoint = new THREE.Vector3(), middle = new THREE.Vector3(), direction = new THREE.Vector3();

  let state = courseControlState(), lastKey = '';
  function update(pose, operation, options) {
    state = courseControlState(pose, operation, options);
    const key = JSON.stringify([state, operation?.target, operation?.kind]);
    if (key === lastKey) return false; lastKey = key;
    for (const name of ['clutch', 'brake', 'throttle']) pedalPivots[name].rotation.x = -.36 * state[name];
    gearPivot.rotation.z = -state.gearPosition[0] / .16; gearPivot.rotation.x = state.gearPosition[1] / .16;
    handbrake.rotation.x = state.parkingBrake ? .40 : 0;
    stalk.rotation.z = state.leftSignal && !state.rightSignal ? -.16 : state.rightSignal && !state.leftSignal ? .16 : 0;
    stalk.rotation.y = state.high ? -.18 : 0;
    lightKnob.rotation.y = state.on ? 1.15 : state.positionLights ? .55 : 0;
    hazard.position.z = state.hazard ? 1.677 : 1.672;
    doorPivot.rotation.y = -1.02 * state.door; driverSeat.position.z = state.seatOffset;
    mirrorAdjust.rotation.z = state.mirrorAdjust;
    endpoint.copy(hanging).lerp(fastened, state.belt);
    middle.copy(beltAnchor).lerp(endpoint, .52); middle.z += .21 * state.belt;
    for (const [index, [from, to]] of [[beltAnchor, middle], [middle, endpoint]].entries()) {
      direction.copy(to).sub(from); const length = direction.length();
      const segment = beltSegments[index]; segment.position.copy(from).add(to).multiplyScalar(.5);
      segment.quaternion.setFromUnitVectors(UP, direction.normalize()); segment.scale.y = length;
    }
    tongue.position.copy(endpoint);
    const active = { left: state.leftSignal && state.blink, right: state.rightSignal && state.blink,
      high: state.on && state.high, low: state.on && !state.high, belt: state.belt < .99, park: state.parkingBrake,
      position: state.positionLights };
    for (const [name, object] of Object.entries(leds)) object.material.color.set(active[name] ? object.userData.onColor : '#253332');
    const highlighted = operation?.target === 'mirrors' && operation.kind !== 'prepare' ? null
      : operation?.target === 'turn-signal' ? 'headlight' : operation?.target;
    for (const [name, material] of focusMaterials) material.emissiveIntensity = highlighted === name ? .32 : 0;
    return true;
  }
  return { group, textures, update, pedalPivots, gearPivot, doorPivot, driverSeat, leds,
    cameraPose(target, aspect) { return courseOperationCamera(target, aspect); },
  };
}
