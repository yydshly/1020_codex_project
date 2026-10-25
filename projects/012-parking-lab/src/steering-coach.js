import { BAY, CAR, clamp, corners, crossesCourseLine, isParked, localToWorld, stepVehicle } from './vehicle.js';

const radians = degrees => degrees * Math.PI / 180;
const degrees = angle => angle * 180 / Math.PI;
const normalized = angle => Math.atan2(Math.sin(angle), Math.cos(angle));
const sideSign = side => side === 'left' ? 1 : -1;
export const CENTER_RATE = 2.5; // stepVehicle's active return rate, radians/second.
export const PREVIEW_SECONDS = 3.8;
export const observationSpeed = state => Math.abs(state.speed) < 0.08 ? 2 / 3.6 : Math.abs(state.speed);
export const previewSeconds = rate => PREVIEW_SECONDS / (Number.isFinite(rate) && rate > 0 ? clamp(rate, 0.5, 2) : 1);
export const turnTolerance = state => 0.15 + (observationSpeed(state) - 0.7) * 0.25;

/** Model timing, not a real-car sight point or an examination tolerance. */
export function centerWindow(state, speechRate) {
  const speed = observationSpeed(state);
  const yawRate = speed / CAR.wheelbase * Math.tan(Math.min(Math.abs(state.steer), CAR.maxSteer));
  const returnYaw = speed / CAR.wheelbase * -Math.log(Math.cos(CAR.maxSteer)) / CENTER_RATE;
  const responseYaw = speed / CAR.wheelbase * Math.tan(CAR.maxSteer) * 0.2;
  // Retain the full-lock envelope during an active return, so it cannot revert
  // to a preparation instruction halfway through the same action.
  const act = returnYaw + responseYaw + radians(0.25);
  return { act, prepare: act + yawRate * previewSeconds(speechRate), observe: act + yawRate * previewSeconds(speechRate) + radians(10), returnYaw, responseYaw };
}

function sideClearance(state) {
  const inside = corners(state).filter(point => point.z <= BAY.entrance && point.z >= BAY.back);
  return inside.length ? Math.min(...inside.flatMap(point => [point.x - BAY.left, BAY.right - point.x])) : null;
}

/** Translate the complete body along its current heading until the parking
 * reference. A clear pose now is insufficient: every intermediate body matters.
 * Steering is assumed centred; speed affects timing, not this straight path. */
export function predictStraightReverse(state, { targetRearClearance = 0.55, maxDistance = 8 } = {}) {
  const forwardZ = Math.cos(state.heading);
  const rear = localToWorld(state, 0, -CAR.rearOverhang);
  const needed = forwardZ > 0.15 ? Math.max(0, (rear.z - BAY.back - targetRearClearance) / forwardZ) : maxDistance;
  const distance = Math.min(maxDistance, needed);
  let endState = { ...state, steer: 0, speed: 0 };
  let crossingDistance = null, minimumSideClearance = sideClearance(state);
  const steps = Math.max(1, Math.ceil(distance / 0.04));
  for (let i = 0; i <= steps; i++) {
    const travelled = distance * i / steps;
    endState = { ...state, x: state.x - Math.sin(state.heading) * travelled, z: state.z - forwardZ * travelled, steer: 0, speed: 0 };
    const gap = sideClearance(endState);
    if (gap !== null) minimumSideClearance = minimumSideClearance === null ? gap : Math.min(minimumSideClearance, gap);
    if (crossesCourseLine(endState)) { crossingDistance = travelled; break; }
  }
  const fits = isParked(endState);
  const safe = crossingDistance === null && needed <= maxDistance && forwardZ > 0.15 && fits;
  return { safe, crossingDistance, distance, minimumSideClearance, endState,
    reason: crossingDistance !== null ? 'straight_crossing' : safe ? 'clear_straight_path' : 'cannot_finish_straight' };
}

function returnedPose(state, speedLimit) {
  let pose = { ...state };
  let crossedLine = crossesCourseLine(pose);
  const limit = Number.isFinite(speedLimit) && speedLimit > 0 ? speedLimit : observationSpeed(state);
  for (let i = 0; i < 120 && Math.abs(pose.steer) > 1e-7; i++) {
    pose = stepVehicle(pose, { reverse: true, forward: false, left: false, right: false, center: true, speedLimit: limit }, 1 / 120);
    crossedLine ||= crossesCourseLine(pose);
  }
  return { pose, crossedLine };
}

/** Use completed=true after the wheels actually reach neutral. Otherwise model
 * the return from the recorded pre-action pose, including its movement. */
export function assessCentering(state, side = 'right', { speedLimit, completed = false } = {}) {
  const returned = completed ? { pose: { ...state }, crossedLine: crossesCourseLine(state) } : returnedPose(state, speedLimit);
  const pose = returned.pose;
  const remaining = normalized(pose.heading) * sideSign(side);
  const prediction = predictStraightReverse(pose);
  prediction.returnCrossedLine = returned.crossedLine;
  if (returned.crossedLine) { prediction.safe = false; prediction.reason = 'return_crossing'; }
  // These residual-angle descriptions are model feedback, not exam tolerances.
  // Geometry decides whether continuation is safe; an unsafe offset with a
  // nearly parallel body does not establish an early or late steering action.
  const earlyLimit = radians(3);
  // Once neutral, braking must not reclassify an unchanged, safe pose just
  // because its speed fell. Safe geometric continuation takes precedence.
  const kind = prediction.safe ? 'good' : remaining > earlyLimit ? 'early' : remaining < -radians(1.5) ? 'late' : 'unsafe';
  return { kind, reason: kind === 'early' ? 'remaining_angle' : kind === 'late' ? 'past_parallel' : prediction.reason,
    remainingDegrees: degrees(normalized(state.heading) * sideSign(side)), predictedResidualDegrees: degrees(remaining), prediction, endState: pose };
}

const recovery = {
  recovery_early: { title: '方向已回正，车身仍有夹角', action: '先按空格停稳，观察车身与两侧库线', observe: '前轮回正不等于车身摆正。先对照残余夹角和库角余量，再重练这一段；不要直接补满方向。' },
  recovery_clearance: { title: '继续直倒的边线余量不足', action: '先按空格停稳，检查两侧余量', observe: '按当前姿态继续直倒，车身可能越线或无法完整入库。先对照车头、车尾与库线，再从更早位置重练。' },
  recovery_wrong_direction: { title: '转向与本次入库方向相反', action: '先按空格停稳，核对入库侧和前轮方向', observe: '先确认正在练哪一侧，再观察车身与库角的位置；不要继续保持相反转角倒车。' },
  alignment_late: { title: '车身已经摆过平行位置', action: '先按空格停稳，暂停观察', observe: '车身已摆过平行位置，继续保持原转角会扩大偏差。先对照两侧边线，再重练回正时机。' },
  warning_line: { title: '车身已经出线', action: '先刹车停稳，暂停观察车身与边线', observe: '本次已经出现车身出线。复盘实际操作和边线位置，再从错误前重练。' },
};

/** Shared live decision for ordinary practice and narrated practice. Pure,
 * pose-based analysis: it never drives the car or claims an unseen prior action. */
export function analyzeSteering(state, { side = 'right', turnMarker = 4.05, speedLimit, speechRate } = {}) {
  const left = side === 'left', sign = sideSign(side), name = left ? '左' : '右';
  const remaining = normalized(state.heading) * sign;
  const steering = Math.abs(state.steer), window = centerWindow(state, speechRate);
  const base = { side, remainingDegrees: degrees(remaining), steerDegrees: degrees(state.steer), centerWindow: window, prediction: null };
  const finish = (key, action, observe, step = 1, reason = key, extra = {}) => ({ ...base, key, action, observe, step, requiresStop: Boolean(recovery[key]), reason, ...(recovery[key] ?? {}), ...extra });
  if (crossesCourseLine(state)) return finish('warning_line');
  if (remaining < -radians(3)) return finish('alignment_late');
  if (state.steer * sign < -radians(2) && remaining > 0) return finish('recovery_wrong_direction');
  // A neutral wheel during an established turn is a recovery situation, not
  // permission to command full lock again. Initial straight approach is separate.
  if (steering <= radians(2) && remaining < radians(87.5)) {
    const result = assessCentering(state, side, { completed: true, speedLimit });
    const extra = { prediction: result.prediction, predictedResidualDegrees: result.predictedResidualDegrees };
    if (result.kind === 'early') return finish('recovery_early', null, null, 2, result.reason, extra);
    if (result.kind === 'late') return finish('alignment_late', null, null, 2, result.reason, extra);
    if (!result.prediction.safe) return finish('recovery_clearance', null, null, 2, result.reason, extra);
    const front = BAY.entrance - localToWorld(state, 0, CAR.length - CAR.rearOverhang).z;
    const rear = localToWorld(state, 0, -CAR.rearOverhang).z - BAY.back;
    return front >= 0.10 && rear < 0.70
      ? finish('brake', '到停车位置，踩刹车停稳（空格）', '同时确认车头不突出库口、车尾不越底线。', 2, 'parking_reference', extra)
      : finish('park', '方向已回正；S 低速直倒，继续观察两侧余量', '目前的直倒路径有余量；仍需比较两侧边线，并在停车参照处停稳。', 2, 'clear_straight_path', extra);
  }
  if (remaining <= window.act) return finish('center', '车身接近顺直，现在按 X 主动回正，保持低速', '回方向的过程中车身还会转动；回正后再次核对夹角与两侧余量。', 2);
  if (remaining <= window.prepare) return finish(left ? 'prepare_center_left' : 'prepare_center_right', '交替看两侧镜，准备主动回正', '先看入库侧车身与库线，再对照另一侧；留出回轮过程需要的余量。', 2);
  if (remaining <= window.observe) return finish(left ? 'left_align' : 'right_align', '保持当前转角，观察车身与库线', '比较两侧间隙变化，接近平行时准备回方向。');
  const gap = state.x * sign - Math.abs(turnMarker), tolerance = turnTolerance(state);
  const expectedSpeed = Math.max(observationSpeed(state), Number.isFinite(speedLimit) && speedLimit > 0 ? speedLimit : 0);
  if (remaining > radians(80) && gap > tolerance) return gap <= tolerance + expectedSpeed * previewSeconds(speechRate)
    ? finish(left ? 'prepare_left' : 'prepare_right', `保持直倒，先看${name}镜，准备向${name}打方向`, '接近模型转向参照；保持低速，先观察库角和后轮。', 0)
    : finish(left ? 'left_straight' : 'straight', '方向保持正直，S 低速直倒到模型转向参照', '先核对控制线，再观察入库侧后轮和库角；实车点位需要重新校准。', 0);
  if (state.steer * sign >= CAR.maxSteer - radians(0.05)) return finish(left ? 'hold_left' : 'hold_right', '方向已到位，保持转角低速倒车', `看${name}镜后轮与库角，也留意外侧车头。`);
  return finish(left ? 'left_turn' : 'right_turn', `到达模型转向参照；${left ? 'A 向左' : 'D 向右'}打方向，保持低速`, '本模型标定的转向位置；继续看入库侧后轮与库角，兼顾外侧车头。');
}
