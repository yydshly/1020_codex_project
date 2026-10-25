import { CAR, BOUNDS, corners } from './vehicle.js';

// Keyboard driving is a low-speed bicycle model with automatically coordinated
// gears/clutch. It does not model a C1 clutch pedal, engine torque or stalling.
const TICK = 1 / 200, MAX_DT = .25, MAX_FORWARD = 8, MAX_REVERSE = 1.5;
const LATERAL_ACCELERATION = 2.5, STOP_EPSILON = .000001;
const clamp = (x, min, max) => Math.max(min, Math.min(max, x));
const finite = (x, fallback = 0) => Number.isFinite(x) ? x : fallback;
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const lightModes = new Set(['off', 'low', 'high', 'flash', 'hazard', 'parking', 'fog']);
const speedForSteer = steer => Math.abs(steer) < .000001 ? MAX_FORWARD
  : Math.min(MAX_FORWARD, Math.sqrt(LATERAL_ACCELERATION * CAR.wheelbase / Math.abs(Math.tan(steer))));

function boundsFor(chapter, initial) {
  if (chapter.sceneType === 'parking' || chapter.id === 'reverse-parking') return { ...BOUNDS };
  const points = chapter.poses?.length ? chapter.poses : [initial];
  return { left: Math.min(...points.map(p => finite(p.x))) - 20, right: Math.max(...points.map(p => finite(p.x))) + 20,
    back: Math.min(...points.map(p => finite(p.z))) - 20, front: Math.max(...points.map(p => finite(p.z))) + 20 };
}
const inside = (p, bounds) => corners(p).every(c => c.x >= bounds.left && c.x <= bounds.right && c.z >= bounds.back && c.z <= bounds.front);

function roadHeight(state) {
  if (state.sceneType !== 'hill') return { y: state.baseY, pitch: state.basePitch };
  const onRamp = Math.abs(state.x) <= 4 && state.z > 0 && state.z < 73;
  const slope = onRamp ? state.z < 18 ? .1 : state.z > 55 ? -.1 : 0 : 0;
  return { y: onRamp ? state.z < 18 ? state.z * .1 : state.z > 55 ? (73 - state.z) * .1 : 1.8 : 0,
    pitch: -Math.atan(slope * Math.cos(state.heading)) };
}

function forwardGear(previous, speed) {
  if (previous === '3') return speed < 4.7 ? '2' : '3';
  if (previous === '2') return speed > 5.8 ? '3' : speed < 2.7 ? '1' : '2';
  return speed > 5.8 ? '3' : speed > 3.4 ? '2' : '1';
}

function pedals(state, intent, braking, shifting, limiting = false) {
  const moving = Math.abs(state.speed) > .01;
  const clutchState = shifting || braking && Math.abs(state.speed) < .6 ? 'down'
    : intent && !braking && Math.abs(state.speed) < .9 ? 'bite'
      : !moving && state.gear !== 'N' ? 'down' : 'up';
  return { brake: braking, brakeValue: braking ? state.brakingForDirectionChange ? .65 : 1 : 0,
    clutchState, clutch: clutchState === 'down', clutchValue: clutchState === 'down' ? 1 : clutchState === 'bite' ? .5 : 0,
    throttle: intent && !braking && !shifting && !limiting ? Math.abs(state.speed) < state.speedLimit - .05 ? .42 : .18 : 0 };
}

/** Start an independent session at a chapter pose; prior lessons cannot leak in.
 * distance retains the takeover's signed wheel travel so the wheels do not jump.
 * elapsed starts at zero; pose.t continues from the takeover's animation time.
 * A teaching-boundary stop is latched until the caller creates a new session. */
export function createCourseDrivingSession(chapter, pose = chapter.poses?.[0] ?? {}) {
  const steer = clamp(finite(pose.steer), -CAR.maxSteer, CAR.maxSteer), limit = speedForSteer(steer);
  const speed = clamp(finite(pose.speed), -MAX_REVERSE, limit), sourceGear = String(pose.gear ?? 'N');
  const direction = Math.abs(speed) > STOP_EPSILON ? Math.sign(speed) : sourceGear === 'R' ? -1 : 1;
  let state = { chapterId: chapter.id, sceneType: chapter.sceneType, x: finite(pose.x), z: finite(pose.z),
    y: finite(pose.y), pitch: finite(pose.pitch), baseY: finite(pose.y), basePitch: finite(pose.pitch),
    heading: wrap(finite(pose.heading)), speed, steer, distance: finite(pose.distance), elapsed: 0,
    startTime: finite(pose.t, finite(pose.time)), remainder: 0, driveDirection: direction,
    gear: Math.abs(speed) > .01 ? speed < 0 ? 'R' : forwardGear(sourceGear, speed) : ['N', 'R', '1', '2', '3'].includes(sourceGear) ? sourceGear : 'N',
    speedLimit: direction < 0 ? MAX_REVERSE : limit, shiftRemaining: 0,
    leftSignal: Boolean(pose.leftSignal), rightSignal: Boolean(pose.rightSignal),
    lightMode: lightModes.has(pose.lightMode) ? pose.lightMode : 'off', stopReason: null,
    brakingForDirectionChange: false, acceleration: 0, parkingBrake: Boolean(pose.parkingBrake) };
  state.bounds = boundsFor(chapter, state);
  state = { ...state, ...roadHeight(state), ...pedals(state, false, false, false) };
  if (!inside(state, state.bounds)) state = stoppedAtBoundary(state);
  return state;
}

function stoppedAtBoundary(state) {
  return { ...state, speed: 0, acceleration: 0, remainder: 0, stopReason: 'teaching-boundary',
    brake: true, brakeValue: 1, throttle: 0, clutch: true, clutchState: 'down', clutchValue: 1 };
}

function stepTick(state, input) {
  const intent = Boolean(input.forward) === Boolean(input.reverse) ? 0 : input.forward ? 1 : -1;
  const oldSpeed = state.speed, oldSteer = state.steer;
  // Releasing A/D deliberately holds steering. The speed limit constrains only
  // new steering input; increasing speed is separately limited by held angle.
  const steerLimit = Math.min(CAR.maxSteer, Math.atan(LATERAL_ACCELERATION * CAR.wheelbase / Math.max(4, oldSpeed * oldSpeed)));
  let steer = oldSteer;
  if (input.center) steer += clamp(-steer, -1.5 * TICK, 1.5 * TICK);
  else if (Boolean(input.left) !== Boolean(input.right)) {
    const target = input.left ? steerLimit : -steerLimit;
    steer += clamp(target - steer, -1.1 * TICK, 1.1 * TICK);
  }
  const reversing = intent !== 0 && oldSpeed * intent < -STOP_EPSILON;
  const parkingBrake = input.parkingBrake === undefined ? state.parkingBrake : Boolean(input.parkingBrake);
  const braking = Boolean(input.brake) || parkingBrake || reversing, shifting = state.shiftRemaining > TICK / 2;
  let direction = state.driveDirection, speedLimit = direction < 0 ? MAX_REVERSE : speedForSteer(steer), nextSpeed;
  if (braking) {
    nextSpeed = Math.sign(oldSpeed) * Math.max(0, Math.abs(oldSpeed) - (input.brake ? 6.5 : 4.5) * TICK);
  } else if (shifting) nextSpeed = Math.sign(oldSpeed) * Math.max(0, Math.abs(oldSpeed) - .2 * TICK);
  else if (!intent) nextSpeed = Math.sign(oldSpeed) * Math.max(0, Math.abs(oldSpeed) - TICK);
  else {
    direction = intent; speedLimit = direction < 0 ? MAX_REVERSE : speedForSteer(steer);
    const magnitude = Math.abs(oldSpeed), target = speedLimit;
    nextSpeed = direction * (magnitude > target ? Math.max(target, magnitude - TICK) : Math.min(target, magnitude + (direction < 0 ? 1.1 : 1.6) * TICK));
  }
  if (Math.abs(nextSpeed) < STOP_EPSILON) nextSpeed = 0;
  const ds = (oldSpeed + nextSpeed) * TICK / 2, yaw = ds / CAR.wheelbase * Math.tan((oldSteer + steer) / 2);
  const chord = ds * (Math.abs(yaw) < 1e-8 ? 1 : Math.sin(yaw / 2) / (yaw / 2));
  const candidate = { ...state, x: state.x + chord * Math.sin(state.heading + yaw / 2),
    z: state.z + chord * Math.cos(state.heading + yaw / 2), heading: wrap(state.heading + yaw),
    speed: nextSpeed, steer, distance: state.distance + ds, elapsed: state.elapsed + TICK,
    acceleration: (nextSpeed - oldSpeed) / TICK, driveDirection: direction, speedLimit,
    brakingForDirectionChange: reversing, parkingBrake, shiftRemaining: Math.max(0, state.shiftRemaining - TICK) };
  // Keep the last wholly contained pose instead of clamping through a wall.
  if (!inside(candidate, state.bounds)) return stoppedAtBoundary({ ...state, elapsed: candidate.elapsed });
  let gear = candidate.gear;
  if (Math.abs(candidate.speed) > STOP_EPSILON || intent && !braking) gear = candidate.speed < 0 || direction < 0 ? 'R' : forwardGear(state.gear, candidate.speed);
  if (gear !== state.gear && ['1', '2', '3'].includes(gear) && ['1', '2', '3'].includes(state.gear)) candidate.shiftRemaining = .16;
  candidate.gear = gear;
  return { ...candidate, ...roadHeight(candidate), ...pedals(candidate, parkingBrake ? 0 : intent, Boolean(input.brake) || reversing, candidate.shiftRemaining > TICK / 2,
    parkingBrake || Math.abs(nextSpeed) > speedLimit + .01) };
}

/** Pure value-in/value-out control. A long stalled frame advances at most .25s;
 * normal 30/60/120Hz calls share a fixed 200Hz simulation and carried remainder. */
export function stepCourseDriving(state, input = {}, dt = 0) {
  if (state.stopReason) return state;
  if (!Number.isFinite(dt) || dt <= 0) return state;
  let next = { ...state,
    leftSignal: input.leftSignal === undefined ? state.leftSignal : Boolean(input.leftSignal),
    rightSignal: input.rightSignal === undefined ? state.rightSignal : Boolean(input.rightSignal),
    lightMode: lightModes.has(input.lightMode) ? input.lightMode : state.lightMode };
  let remaining = state.remainder + Math.min(MAX_DT, dt);
  while (remaining + 1e-10 >= TICK) {
    next = stepTick(next, input);
    if (next.stopReason) return next;
    remaining -= TICK;
  }
  return { ...next, remainder: Math.max(0, remaining) };
}

export function courseDrivingPose(state) {
  return { x: state.x, y: state.y, z: state.z, heading: state.heading, pitch: state.pitch,
    speed: state.speed, steer: state.steer, distance: state.distance, elapsed: state.elapsed,
    t: state.startTime + state.elapsed, time: state.startTime + state.elapsed,
    gear: state.gear, clutch: state.clutch, clutchState: state.clutchState, clutchValue: state.clutchValue,
    brake: state.brake, brakeValue: state.brakeValue, throttle: state.throttle, parkingBrake: Boolean(state.parkingBrake),
    leftSignal: state.leftSignal, rightSignal: state.rightSignal, lightMode: state.lightMode,
    acceleration: state.acceleration, stopReason: state.stopReason, engineOff: false };
}
