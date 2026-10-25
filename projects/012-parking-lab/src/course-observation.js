import { driverLookAngles } from './driver-view.js';

export const COURSE_INTERIOR_MIRROR_CENTER = Object.freeze({ x: 0, y: 1.325, z: 1.60 });
export const COURSE_GAZES = Object.freeze(['forward', 'front-left', 'front-right', 'left', 'right', 'rear', 'left-back', 'right-back']);

/** Every observation keeps the actual driving eye. Shoulder views are not a
 * chase camera and rear means looking at the interior mirror in front above. */
export function courseObservationAngles(settings, gaze = 'forward') {
  // Front conflict scans look through the windscreen/side-window openings at
  // transverse roads and pedestrians. They do not aim down at an outer mirror
  // or backwards through a shoulder window. All real pillars remain visible.
  if (gaze === 'front-left' || gaze === 'front-right') return { yaw: (gaze === 'front-left' ? 55 : -55) * Math.PI / 180, pitch: 0 };
  // The driver sits on the left. A symmetric -130° right turn aims straight
  // into the passenger headrest in this sedan; -118° uses its actual side/rear
  // window opening while preserving all pillar/headrest occlusion around it.
  if (gaze === 'left-back' || gaze === 'right-back') return { yaw: (gaze === 'left-back' ? 130 : -118) * Math.PI / 180, pitch: 0 };
  if (gaze === 'rear') {
    const c = COURSE_INTERIOR_MIRROR_CENTER, dx = c.x - .39, dy = c.y - settings.seatHeight, dz = c.z - settings.seatFore;
    return { yaw: Math.atan2(dx, dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) };
  }
  return driverLookAngles(settings, gaze);
}

/** Vehicle-local metric camera frame. Head turns change direction only; the
 * seat remains the common eye for road, shoulder and physical mirror views. */
export function courseObservationFrame(settings, gaze = 'forward') {
  const look = courseObservationAngles(settings, gaze);
  const direction = { x: Math.sin(look.yaw), y: Math.tan(look.pitch), z: Math.cos(look.yaw) };
  const length = Math.hypot(direction.x, direction.y, direction.z);
  return { eye: { x: .39, y: settings.seatHeight, z: settings.seatFore },
    direction: { x: direction.x / length, y: direction.y / length, z: direction.z / length }, up: { x: 0, y: 1, z: 0 } };
}
