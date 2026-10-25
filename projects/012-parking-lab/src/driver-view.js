import { createMirrorFrame } from './cockpit.js';

/** Looking at a physical mirror aims at its centre, including its height.
 * This does not move the eye or change the mirror adjustment or field of view. */
export function driverLookAngles(settings, side = 'forward') {
  if (side !== 'left' && side !== 'right') return { yaw: 0, pitch: -.09 };
  const { center, eye } = createMirrorFrame({ x: 0, z: 0, heading: 0 }, side, settings);
  const dx = center.x - eye.x, dy = center.y - eye.y, dz = center.z - eye.z;
  return { yaw: Math.atan2(dx, dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) };
}

/** A short, very wide canvas must not turn the cabin into an ultra-wide lens. */
export function driverVerticalFov(aspect) {
  if (!Number.isFinite(aspect) || aspect <= 0) return 55;
  return Math.min(55, 2 * Math.atan(Math.tan(50 * Math.PI / 180) / aspect) * 180 / Math.PI);
}
