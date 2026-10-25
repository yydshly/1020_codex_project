import { CAR } from './vehicle.js';
import { createMirrorFrame, sampleMirrorRay, projectMirrorPoint } from './cockpit.js';
import { GROUND_REFERENCE_Y } from './scene-geometry.js';

const localPose = Object.freeze({ x: 0, z: 0, heading: 0 });
const limits = Object.freeze({ yaw: [-5, 25], pitch: [-38, -5] });
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const degrees = value => value * 180 / Math.PI;
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;

// These are vehicle-relative observation references, not bay corners or an
// intended driving path. The body reference marks an inner edge, not a claimed
// percentage of rendered body pixels. No requirement exposes the whole tire.
function references(side) {
  const sign = side === 'left' ? 1 : -1;
  return [
    { name: 'body', point: { x: sign * (CAR.width / 2 + 0.005), y: 0.65, z: 0.50 },
      x: side === 'left' ? 0.92 : 0.08, y: 0.28, weight: 4 },
    { name: 'near', point: { x: sign * (CAR.width / 2 + 0.50), y: GROUND_REFERENCE_Y, z: -0.35 },
      x: side === 'left' ? 0.55 : 0.45, y: 0.80, weight: 1 },
    { name: 'far', point: { x: sign * (CAR.width / 2 + 0.75), y: GROUND_REFERENCE_Y, z: -2.20 },
      x: 0.50, y: 0.18, weight: 0.15 },
  ];
}

function evaluate(eyeSettings, side, refs, yaw, pitch) {
  const frame = createMirrorFrame(localPose, side, { ...eyeSettings, [side]: { yaw, pitch } });
  let cost = 0, squaredAngle = 0, totalWeight = 0;
  for (const ref of refs) {
    const ray = sampleMirrorRay(frame, ref.x * 2 - 1, 1 - ref.y * 2);
    const target = { x: ref.point.x - ray.origin.x, y: ref.point.y - ray.origin.y, z: ref.point.z - ray.origin.z };
    const distance = Math.hypot(target.x, target.y, target.z);
    const cosine = clamp(dot(ray.direction, target) / distance, -1, 1);
    // Angular residuals remain defined even when a reference is outside the
    // current aperture, unlike a visible-only inverse projection objective.
    cost += ref.weight * (1 - cosine);
    squaredAngle += ref.weight * Math.acos(cosine) ** 2;
    totalWeight += ref.weight;
  }
  return { yaw, pitch, frame, cost, angularErrorDegrees: degrees(Math.sqrt(squaredAngle / totalWeight)) };
}

function projectReference(frame, ref) {
  const projected = projectMirrorPoint(frame, ref.point);
  return { visible: projected.visible, x: projected.visible ? projected.x : null, y: projected.visible ? projected.y : null,
    point: { ...ref.point } };
}

function fitSide(eyeSettings, side) {
  const refs = references(side);
  let best = null;
  const consider = (yaw, pitch) => {
    if (yaw < limits.yaw[0] || yaw > limits.yaw[1] || pitch < limits.pitch[0] || pitch > limits.pitch[1]) return;
    const candidate = evaluate(eyeSettings, side, refs, yaw, pitch);
    if (!best || candidate.cost < best.cost) best = candidate;
  };
  // Absolute bounded search, independent of the previous mirror adjustment.
  for (let yaw = -5; yaw <= 25; yaw += 2) {
    for (let pitch = -38; pitch <= -6; pitch += 2) consider(yaw, pitch);
    consider(yaw, -5);
  }
  for (const step of [0.5, 0.1, 0.02]) {
    const center = best;
    for (let x = -4; x <= 4; x++) for (let y = -4; y <= 4; y++) consider(center.yaw + x * step, center.pitch + y * step);
  }
  // Match the adjustment UI's 0.1-degree increments, then recompute the report
  // from the exact applied values. Repeated application is exactly idempotent.
  best = evaluate(eyeSettings, side, refs, Number(best.yaw.toFixed(1)), Number(best.pitch.toFixed(1)));
  const body = projectReference(best.frame, refs[0]);
  body.innerFraction = body.visible ? side === 'left' ? 1 - body.x : body.x : null;
  body.targetInnerFraction = 0.08;
  const ground = { near: projectReference(best.frame, refs[1]), far: projectReference(best.frame, refs[2]) };
  const reasons = [];
  if (eyeSettings.seatHeight < 1.15 || eyeSettings.seatHeight > 1.38 || eyeSettings.seatFore < 0.90 || eyeSettings.seatFore > 1.30) reasons.push('eye-outside-supported-range');
  if (!body.visible || body.innerFraction < 0.03 || body.innerFraction > 0.14 || body.y < 0.10 || body.y > 0.45) reasons.push('body-reference-outside-target');
  if (!ground.near.visible || ground.near.x < 0.08 || ground.near.x > 0.92 || ground.near.y < 0.55 || ground.near.y > 0.94) reasons.push('near-ground-outside-target');
  if (!ground.far.visible || ground.far.x < 0.08 || ground.far.x > 0.92 || ground.far.y < 0.06 || ground.far.y > 0.42) reasons.push('far-ground-outside-target');
  if (best.angularErrorDegrees > 2.5) reasons.push('large-angular-residual');
  if (best.yaw <= -4.96 || best.yaw >= 24.96 || best.pitch <= -37.96 || best.pitch >= -5.04) reasons.push('adjustment-limit');
  const limited = reasons.length > 0;
  return { yaw: best.yaw, pitch: best.pitch, quality: limited ? 'limited' : 'good', limited, reasons,
    body, ground, angularErrorDegrees: best.angularErrorDegrees };
}

/**
 * Recommend a stationary low-speed parking view for the CURRENT eye position.
 * This is a geometric engineering preset, not a factory calibration or a
 * universal best adjustment. References do not depend on the bay, world pose,
 * route, existing mirror angles, or driving progress. Scene occlusion is outside
 * this pure model: report.visible only means the reference fits the mirror.
 * Apply explicitly; moving the seat afterwards must not trigger tracking.
 */
export function recommendMirrorSettings(settings, { side = 'both' } = {}) {
  if (!['both', 'left', 'right'].includes(side)) throw new RangeError('Mirror side must be both, left, or right.');
  if (!settings || !Number.isFinite(settings.seatHeight) || !Number.isFinite(settings.seatFore)) throw new TypeError('A finite current eye height and fore/aft position are required.');
  const next = { ...settings, left: { ...settings.left }, right: { ...settings.right } };
  const eyeSettings = { seatHeight: settings.seatHeight, seatFore: settings.seatFore };
  const report = {};
  for (const selected of side === 'both' ? ['left', 'right'] : [side]) {
    const result = fitSide(eyeSettings, selected);
    next[selected] = { ...next[selected], yaw: result.yaw, pitch: result.pitch };
    report[selected] = result;
  }
  return { settings: next, report };
}
