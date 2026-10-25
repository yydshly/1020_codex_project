import { createCockpitSettings, createMirrorFrame, sampleMirrorRay, projectMirrorPoint } from './cockpit.js';
import { measureCourseMirrorCalibration } from './course-mirror-recognition.js';

export const COURSE_MIRROR_STORAGE_KEY = 'parking-lab.course-mirrors.v1';
export const COURSE_MIRROR_STORAGE_VERSION = 1;

const sides = ['left', 'right'];
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const limits = { seatHeight: [1.15, 1.38], seatFore: [.9, 1.3], yaw: [-5, 25],
  road: { pitch: [-15, 6] }, parking: { pitch: [-38, -5] } };
// Derived from the same 19x12cm, radius-1.4m finite mirrors. Verified against
// actual closed-door car geometry: ~3.0% / 2.4% inner body pixels, unobstructed
// adjacent rear-lane references at 10m and 30m. No FOV expansion is involved.
const roadPreset = { left: { yaw: 9.9, pitch: -3 }, right: { yaw: 8.4, pitch: -3.1 } };
const finite = (value, fallback, range) => typeof value === 'number' && Number.isFinite(value) ? clamp(value, ...range) : fallback;
const assertProfile = profile => { if (!['road', 'parking'].includes(profile)) throw new RangeError('Mirror profile must be road or parking.'); };
const clonePair = pair => ({ left: { ...pair.left }, right: { ...pair.right } });
const parkingFitCache = new Map();

/** The legacy cockpit is read only as an initial seat / parking-mirror preset.
 * Road defaults remain a fixed calibration; changing the seat does not silently
 * retarget either pair of mirrors. Explicit recommendation is a separate action. */
export function createCourseMirrorSettings(legacySettings = createCockpitSettings()) {
  const standard = createCockpitSettings(), legacy = legacySettings ?? {};
  const parking = Object.fromEntries(sides.map(side => [side, {
    yaw: finite(legacy[side]?.yaw, standard[side].yaw, limits.yaw),
    pitch: finite(legacy[side]?.pitch, standard[side].pitch, limits.parking.pitch),
  }]));
  return { seatHeight: finite(legacy.seatHeight, standard.seatHeight, limits.seatHeight),
    seatFore: finite(legacy.seatFore, standard.seatFore, limits.seatFore),
    road: clonePair(roadPreset), parking };
}

function normalize(config, fallback = createCourseMirrorSettings()) {
  const result = { seatHeight: finite(config?.seatHeight, fallback.seatHeight, limits.seatHeight),
    seatFore: finite(config?.seatFore, fallback.seatFore, limits.seatFore) };
  for (const profile of ['road', 'parking']) result[profile] = Object.fromEntries(sides.map(side => [side, {
    yaw: finite(config?.[profile]?.[side]?.yaw, fallback[profile][side].yaw, limits.yaw),
    pitch: finite(config?.[profile]?.[side]?.pitch, fallback[profile][side].pitch, limits[profile].pitch),
  }]));
  return result;
}

/** Independent course storage: JSON {version:1, settings:config}. Unknown or
 * old schemas fall back to legacy initialization; no writes to either store. */
export function restoreCourseMirrorSettings(serialized, legacySettings = createCockpitSettings()) {
  const fallback = createCourseMirrorSettings(legacySettings);
  try {
    const saved = JSON.parse(serialized);
    if (saved?.version !== COURSE_MIRROR_STORAGE_VERSION || !saved.settings || typeof saved.settings !== 'object') return fallback;
    return normalize(saved.settings, fallback);
  } catch { return fallback; }
}

/** profile scopes mirror angles only; seatHeight/seatFore are shared physical
 * eye coordinates. Seat edits deliberately leave both angle pairs unchanged. */
export function setCourseMirrorSetting(config, profile, name, value) {
  assertProfile(profile);
  const numeric = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  if (!Number.isFinite(numeric)) return normalize(config);
  const next = normalize(config);
  if (name === 'seatHeight' || name === 'seatFore') next[name] = clamp(numeric, ...limits[name]);
  else {
    const [side, axis] = String(name).split('.');
    if (sides.includes(side) && ['yaw', 'pitch'].includes(axis) && name === `${side}.${axis}`)
      next[profile][side][axis] = clamp(numeric, ...(axis === 'yaw' ? limits.yaw : limits[profile].pitch));
  }
  return next;
}

export function resolveCourseMirrorSettings(config, profile) {
  assertProfile(profile);
  const normalized = normalize(config);
  return { seatHeight: normalized.seatHeight, seatFore: normalized.seatFore, ...clonePair(normalized[profile]) };
}

const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const degrees = radians => radians * 180 / Math.PI;
const localState = { x: 0, z: 0, heading: 0 };
function roadReferences(side, { bodyReference = 'minimal', profile = 'road' } = {}) {
  const sign = side === 'left' ? 1 : -1;
  if (bodyReference === 'clear') {
    const parking = profile === 'parking', left = side === 'left';
    const rearY = parking ? (left ? .2 : .12) : (left ? .32 : .27);
    // Explicit inward adjustment makes the real rear-quarter panel readable.
    // A ~20% INNER WIDTH reference is not half the mirror's image area. Rear
    // references stay in the adjacent lane; no duplicate body image is added.
    return [
      { name: 'body', point: { x: sign * .89, y: .82, z: -.5 }, x: left ? .8 : .2, y: parking ? .52 : .65, weight: 12 },
      { name: 'near', point: { x: sign * 3.5, y: 1, z: -10 }, x: left ? .28 : .84, y: rearY, weight: 1 },
      { name: 'far', point: { x: sign * 3.5, y: 1, z: -30 }, x: left ? .56 : .5, y: rearY, weight: 1 },
    ];
  }
  // Rear-quarter paint is a genuine exterior point, not a marker placed beside
  // the body. A road mirror need not expose the low parking tyre/body reference.
  return [
    { name: 'body', point: { x: sign * .89, y: .82, z: -.5 }, x: side === 'left' ? .94 : .06, y: .65, weight: 4 },
    { name: 'near', point: { x: sign * 3.5, y: 1, z: -10 }, x: side === 'left' ? .4 : .6, y: .3, weight: 1 },
    { name: 'far', point: { x: sign * 3.5, y: 1, z: -30 }, x: side === 'left' ? .7 : .3, y: .3, weight: 1 },
  ];
}
function evaluateRoad(settings, side, refs, yaw, pitch) {
  const frame = createMirrorFrame(localState, side, { ...settings, [side]: { yaw, pitch } });
  let cost = 0, squaredAngle = 0, weight = 0;
  for (const ref of refs) {
    const ray = sampleMirrorRay(frame, ref.x * 2 - 1, 1 - ref.y * 2), delta = {
      x: ref.point.x - ray.origin.x, y: ref.point.y - ray.origin.y, z: ref.point.z - ray.origin.z,
    };
    const cosine = clamp(dot(ray.direction, delta) / Math.hypot(delta.x, delta.y, delta.z), -1, 1);
    cost += ref.weight * (1 - cosine); squaredAngle += ref.weight * Math.acos(cosine) ** 2; weight += ref.weight;
  }
  return { yaw, pitch, frame, cost, angularErrorDegrees: degrees(Math.sqrt(squaredAngle / weight)) };
}
const projected = (frame, reference) => {
  const p = projectMirrorPoint(frame, reference.point);
  return { visible: p.visible, x: p.visible ? p.x : null, y: p.visible ? p.y : null, point: { ...reference.point } };
};
function fitRoadSide(settings, side, { bodyReference = 'minimal', profile = 'road' } = {}) {
  const refs = roadReferences(side, { bodyReference, profile }), pitchRange = limits[profile].pitch;
  let best = null;
  const consider = (yaw, pitch) => {
    if (yaw < limits.yaw[0] || yaw > limits.yaw[1] || pitch < pitchRange[0] || pitch > pitchRange[1]) return;
    const next = evaluateRoad(settings, side, refs, yaw, pitch);
    if (!best || next.cost < best.cost) best = next;
  };
  // Absolute search, independent of current adjustment, followed by refinement.
  for (let yaw = -5; yaw <= 25; yaw += 2) for (let pitch = pitchRange[0]; pitch <= pitchRange[1]; pitch += 1) consider(yaw, pitch);
  for (const step of [.2, .05]) {
    const center = best;
    for (let x = -5; x <= 5; x++) for (let y = -5; y <= 5; y++) consider(center.yaw + x * step, center.pitch + y * step);
  }
  best = evaluateRoad(settings, side, refs, Number(best.yaw.toFixed(1)), Number(best.pitch.toFixed(1)));
  const body = projected(best.frame, refs[0]), near = projected(best.frame, refs[1]), far = projected(best.frame, refs[2]);
  body.innerFraction = body.visible ? side === 'left' ? 1 - body.x : body.x : null;
  body.targetInnerFraction = bodyReference === 'clear' ? .2 : .06;
  let minimum = Infinity, maximum = -Infinity;
  for (let row = 0; row <= 8; row++) for (let column = 0; column <= 12; column++) {
    const ray = sampleMirrorRay(best.frame, -1 + column / 6, 1 - row / 4);
    const pitch = degrees(Math.asin(clamp(ray.direction.y, -1, 1)));
    minimum = Math.min(minimum, pitch); maximum = Math.max(maximum, pitch);
  }
  const horizon = { visible: minimum < 0 && maximum > 0, minimumPitch: minimum, maximumPitch: maximum };
  const reasons = [];
  const bodyRange = bodyReference === 'clear' ? [.15, .25] : [.02, .14];
  if (!body.visible || body.innerFraction < bodyRange[0] || body.innerFraction > bodyRange[1]) reasons.push('body-reference-outside-target');
  for (const [name, ref] of [['near', near], ['far', far]]) if (!ref.visible || ref.x < .02 || ref.x > .98 || ref.y < .04 || ref.y > .96) reasons.push(`rear-${name}-outside-target`);
  if (profile === 'road' && !horizon.visible) reasons.push('horizon-outside-field');
  if (best.angularErrorDegrees > 2.5) reasons.push('large-angular-residual');
  return { yaw: best.yaw, pitch: best.pitch, quality: reasons.length ? 'limited' : 'good', limited: reasons.length > 0,
    reasons, body, rear: { near, far }, horizon, angularErrorDegrees: best.angularErrorDegrees,
    ...(bodyReference === 'clear' ? { bodyReference, purpose: 'side-body-and-rear', nearGroundLimited: profile === 'parking' } : {}) };
}

function fitParkingSide(settings, side, bodyReference) {
  const key = JSON.stringify([settings.seatHeight, settings.seatFore, side, bodyReference]);
  if (parkingFitCache.has(key)) return structuredClone(parkingFitCache.get(key));
  const sign = side === 'left' ? 1 : -1, inner = bodyReference === 'clear' ? .21 : .16;
  const refs = [
    { name: 'body', point: { x: sign * .895, y: .65, z: .5 }, x: side === 'left' ? 1 - inner : inner, y: .32, weight: 4 },
    { name: 'near', point: { x: sign * 1.4, y: .028, z: -.35 }, x: side === 'left' ? .55 : .45, y: .8, weight: 1 },
    { name: 'far', point: { x: sign * 1.65, y: .028, z: -2.2 }, x: .5, y: .18, weight: .2 },
  ];
  let best = null;
  const consider = (yaw, pitch) => {
    if (yaw < -5 || yaw > 25 || pitch < -38 || pitch > -5) return;
    const result = evaluateRoad(settings, side, refs, yaw, pitch);
    if (!best || result.cost < best.cost) best = result;
  };
  for (let yaw = -5; yaw <= 25; yaw += 2) for (let pitch = -38; pitch <= -6; pitch += 2) consider(yaw, pitch);
  for (const step of [.4, .1]) {
    const seed = best;
    for (let x = -4; x <= 4; x++) for (let y = -4; y <= 4; y++) consider(seed.yaw + x * step, seed.pitch + y * step);
  }
  const seed = best, candidates = [[0, 0], [-.7, 0], [.7, 0], [0, -.7], [0, .7]];
  let chosen = null;
  for (const [dy, dp] of candidates) {
    const yaw = Number(clamp(seed.yaw + dy, -5, 25).toFixed(1)), pitch = Number(clamp(seed.pitch + dp, -38, -5).toFixed(1));
    const applied = { ...settings, [side]: { yaw, pitch } }, physical = measureCourseMirrorCalibration(applied, side);
    const body = physical.body, target = bodyReference === 'clear' ? .09 : .065;
    const score = Math.abs(body.coverage - target) + (!body.visible || body.coverage < .03 ? .5 : 0) + (!physical.ground.visible ? 1 : 0)
      + (body.coverage > .17 ? 1 : 0) + (Math.abs(dy) + Math.abs(dp)) * .002;
    if (!chosen || score < chosen.score) chosen = { yaw, pitch, score };
  }
  const applied = { ...settings, [side]: { yaw: chosen.yaw, pitch: chosen.pitch } };
  const physical = measureCourseMirrorCalibration(applied, side, { columns: 40, rows: 24 });
  const teaching = measureCourseMirrorCalibration(applied, side, { columns: 40, rows: 24, displayRect: { width: 310, height: 196 } });
  const frame = createMirrorFrame(localState, side, applied), body = projected(frame, refs[0]);
  body.innerFraction = body.visible ? side === 'left' ? 1 - body.x : body.x : null;
  body.targetInnerFraction = inner;
  const reasons = [];
  if (!physical.body.visible) reasons.push('body-physically-hidden');
  else if (!teaching.body.readable || physical.body.coverage < .03) reasons.push('body-too-small-at-teaching-scale');
  if (!physical.ground.visible) reasons.push('near-ground-physically-hidden');
  const result = { yaw: chosen.yaw, pitch: chosen.pitch, quality: reasons.length ? 'limited' : 'good', limited: reasons.length > 0, reasons,
    body: { ...body, ...physical.body }, ground: { near: projected(frame, refs[1]), far: projected(frame, refs[2]), visible: physical.ground.visible },
    occlusionChecked: true, calibration: physical, teachingCalibration: teaching,
    readableAt: physical.body.readable ? 'reference-native-size' : teaching.body.readable ? 'teaching-magnification' : 'limited',
    angularErrorDegrees: evaluateRoad(settings, side, refs, chosen.yaw, chosen.pitch).angularErrorDegrees,
    purpose: 'parking-body-and-near-ground', bodyReference, nearGroundLimited: !physical.ground.visible };
  parkingFitCache.set(key, structuredClone(result)); if (parkingFitCache.size > 30) parkingFitCache.delete(parkingFitCache.keys().next().value);
  return result;
}

/** Explicit recommendation for the current eye. Road references cover the
 * adjacent rear lane, not the body-occluded centre behind the vehicle. The pure
 * road/clear fitting report is aperture-only. Default parking additionally
 * tests the same closed-door course car's real housing, body, ground and
 * reference display pixels; live scene occlusion still belongs to recognize.
 * Clear is an explicit, wider inner-body reference; it never replaces defaults
 * or stored settings automatically. Parking clear sacrifices nearby ground
 * coverage for the side/rear view and can reach the parking pitch limit.
 * This does not track the route, vehicle heading or teaching progress. */
export function recommendCourseMirrorSettings(config, profile, { bodyReference = 'minimal' } = {}) {
  assertProfile(profile);
  if (!['minimal', 'clear'].includes(bodyReference)) throw new RangeError('Mirror body reference must be minimal or clear.');
  const next = normalize(config), cockpit = resolveCourseMirrorSettings(next, profile);
  if (profile === 'parking' && bodyReference === 'minimal') {
    const report = Object.fromEntries(sides.map(side => [side, fitParkingSide(cockpit, side, bodyReference)]));
    next.parking = Object.fromEntries(sides.map(side => [side, { yaw: report[side].yaw, pitch: report[side].pitch }]));
    return { settings: next, report };
  }
  const report = Object.fromEntries(sides.map(side => [side, fitRoadSide(cockpit, side, { bodyReference, profile })]));
  next[profile] = Object.fromEntries(sides.map(side => [side, { yaw: report[side].yaw, pitch: report[side].pitch }]));
  return { settings: next, report };
}
