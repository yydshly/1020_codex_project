import { CAR, crossesCourseLine } from './vehicle.js';

const radians = degrees => degrees * Math.PI / 180;
const ACTIVE_STEPS = new Set(['turn', 'hold', 'center']);
const SPEED_LIMIT = 1.8 / 3.6;
const OBSERVE_ANGLE = radians(2.7);
const CENTER_TOLERANCE = radians(0.5);
const remainingAngle = state => -Math.atan2(Math.sin(state.heading), Math.cos(state.heading));

// This isolated lesson starts at the model's right-entry steering reference.
// Teaching pauses are applied by the caller after each completion; they are not
// an example of continuous exam driving or a real-car sight-point prescription.
export function beginnerStart(demonstration) {
  return { ...demonstration.frames[demonstration.stops[1]], speed: 0, time: 0, distance: 0, step: undefined };
}

export function beginnerInput(step, held = {}) {
  const right = step === 'turn' && Boolean(held?.right);
  const center = step === 'center' && Boolean(held?.center);
  const reverse = right || center || step === 'hold' && Boolean(held?.reverse);
  // Explicit false values matter: stepVehicle compares opposing input values.
  return { reverse, right, center, left: false, forward: false, speedLimit: SPEED_LIMIT };
}

export function advanceBeginner(step, previous, next) {
  if (!ACTIVE_STEPS.has(step)) return null;
  if (crossesCourseLine(next)) return {
    kind: 'line', title: '先停下来，看车身与边线',
    text: '这一步出现车身出线。暂停观察后重新开始这一段，再跟着提示操作。',
  };
  if (step === 'turn' && previous.steer > -CAR.maxSteer + 1e-6 && next.steer <= -CAR.maxSteer + 1e-6 && next.distance > 0.01) return {
    kind: 'done', title: '右方向已经打到位',
    text: '先停住。松开 D 会保持这个转角；下一步只按 S 倒车，等库线进入镜面，再比较它与车身的夹角。',
  };
  if (step === 'hold' && remainingAngle(previous) > OBSERVE_ANGLE && remainingAngle(next) <= OBSERVE_ANGLE && next.distance > previous.distance && next.speed < 0) return {
    kind: 'done', title: '先停住，看看车身快直了吗',
    text: '先看右镜，再看左镜：比较两侧车身和库线是否接近平行。观察清楚后，再按 X 回正。',
  };
  if (step === 'center' && Math.abs(previous.steer) > CENTER_TOLERANCE && Math.abs(next.steer) <= CENTER_TOLERANCE) return {
    kind: 'done', title: '方向已经回正',
    text: '这一步完成了。接下来可以进入完整带练，继续直倒、找停车位置，再练另一侧。',
  };
  return null;
}
