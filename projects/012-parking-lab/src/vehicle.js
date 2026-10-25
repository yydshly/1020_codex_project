// Low-speed bicycle model. State position is the midpoint of the rear axle.
// +Z is forward at heading 0; positive steering turns the car's nose left.
export const CAR = Object.freeze({ length: 4.4, width: 1.8, wheelbase: 2.65, trackWidth: 1.52, tireWidth: 0.23, rearOverhang: 0.86, maxSteer: 34 * Math.PI / 180 });
// GA 1029—2022 table 3, small passenger car: bay 2.3 m wide,
// length = car length + 0.7 m, lane and control-line distance both 6.7 m.
export const BAY = Object.freeze({ left: -1.15, right: 1.15, back: -6.5, entrance: -1.4 });
export const COURSE = Object.freeze({ controlA: -7.85, controlB: 7.85, roadTop: 5.3, roadLeft: -13, roadRight: 13, limitSeconds: 210 });
export const BOUNDS = Object.freeze({ left: -15, right: 15, back: -10, front: 12 });
export const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
export function initialState() { return { x: -6.4, z: 2.0, heading: -Math.PI / 2, speed: 0, steer: 0, time: 0, distance: 0 }; }
export function localToWorld(state, x, z) {
  return { x: state.x + x * Math.cos(state.heading) + z * Math.sin(state.heading), z: state.z - x * Math.sin(state.heading) + z * Math.cos(state.heading) };
}
export function corners(state, margin = 0) {
  return [-CAR.width / 2 - margin, CAR.width / 2 + margin].flatMap(x => [-CAR.rearOverhang - margin, CAR.length - CAR.rearOverhang + margin].map(z => localToWorld(state, x, z)));
}
export function crossesBayLine(state) {
  const points = corners(state);
  // Test all four edges, not just corners: a rotated car may straddle the entrance.
  const polygon = [points[0], points[1], points[3], points[2]];
  const tolerance = 0.025;
  for (let i = 0; i < 4; i++) {
    const a = polygon[i], b = polygon[(i + 1) % 4];
    if (a.z < BAY.back && Math.max(a.x, b.x) > BAY.left && Math.min(a.x, b.x) < BAY.right) return true;
    for (const lineX of [BAY.left, BAY.right]) {
      if (Math.min(a.x, b.x) <= lineX + tolerance && Math.max(a.x, b.x) >= lineX - tolerance) {
        const t = Math.abs(b.x - a.x) < 1e-9 ? 0 : clamp((lineX - a.x) / (b.x - a.x), 0, 1);
        const z = a.z + (b.z - a.z) * t;
        if (z < BAY.entrance - tolerance && z > BAY.back - tolerance) return true;
      }
    }
  }
  return false;
}
export function outsideBounds(state) { return corners(state).some(p => p.x < BOUNDS.left || p.x > BOUNDS.right || p.z < BOUNDS.back || p.z > BOUNDS.front); }
export function frontWheelsPast(state, side) {
  return [-CAR.trackWidth / 2, CAR.trackWidth / 2].map(x => localToWorld(state, x, CAR.wheelbase)).every(p => side === 'a' ? p.x < COURSE.controlA : p.x > COURSE.controlB);
}
export function crossesCourseLine(state) {
  return crossesBayLine(state) || corners(state).some(p => !(
    p.x >= COURSE.roadLeft && p.x <= COURSE.roadRight && p.z >= BAY.entrance && p.z <= COURSE.roadTop ||
    p.x >= BAY.left && p.x <= BAY.right && p.z >= BAY.back && p.z <= BAY.entrance
  ));
}
export function isParked(state) {
  const alignment = Math.atan2(Math.sin(state.heading), Math.cos(state.heading));
  return Math.abs(alignment) < 7 * Math.PI / 180 && Math.abs(state.speed) < 0.06 && corners(state, 0.03).every(p => p.x > BAY.left && p.x < BAY.right && p.z > BAY.back && p.z < BAY.entrance);
}
export function stepVehicle(state, input, dt) {
  dt = clamp(dt, 0, 0.05);
  const next = { ...state };
  const steerLimit = Number.isFinite(input.steerLimit) ? clamp(input.steerLimit, 0, CAR.maxSteer) : CAR.maxSteer;
  const target = input.left === input.right ? state.steer : input.left ? steerLimit : -steerLimit;
  const turnRate = input.center ? 2.5 : 1.2;
  next.steer += clamp((input.center ? 0 : target) - state.steer, -turnRate * dt, turnRate * dt);
  const direction = input.forward === input.reverse ? 0 : input.forward ? 1 : -1;
  if (input.brake || direction === 0) {
    const deceleration = input.brake ? 6 : 1.1;
    const magnitude = Math.max(0, Math.abs(state.speed) - deceleration * dt);
    next.speed = magnitude === 0 ? 0 : Math.sign(state.speed) * magnitude;
  } else {
    const acceleration = state.speed * direction < 0 ? 3.8 : 1.1;
    const speedLimit = input.speedLimit ?? 0.85;
    next.speed = clamp(state.speed + direction * acceleration * dt, -speedLimit, speedLimit);
  }
  const averageSpeed = (state.speed + next.speed) / 2;
  const yaw = averageSpeed / CAR.wheelbase * Math.tan((state.steer + next.steer) / 2) * dt;
  next.x += averageSpeed * Math.sin(state.heading + yaw / 2) * dt;
  next.z += averageSpeed * Math.cos(state.heading + yaw / 2) * dt;
  next.heading = Math.atan2(Math.sin(state.heading + yaw), Math.cos(state.heading + yaw));
  next.time += dt;
  next.distance += Math.abs(averageSpeed * dt);
  if (outsideBounds(next)) { next.x = state.x; next.z = state.z; next.heading = state.heading; next.speed = 0; }
  return next;
}
