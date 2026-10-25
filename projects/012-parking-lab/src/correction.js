import { crossesCourseLine } from './vehicle.js';
import { predictStraightReverse } from './steering-coach.js';

const radians = degrees => degrees * Math.PI / 180;
export const CORRECTION_SPEED = 1.5 / 3.6;
export const CORRECTION_STEER_LIMIT = radians(8);

/** A deliberately small, recoverable deviation before the bay entrance.
 * The learner controls direction and active return; creep speed is assisted. */
export function createCorrectionDrill(side = 'left') {
  if (!['left', 'right'].includes(side)) throw new RangeError('Correction side must be left or right.');
  const sign = side === 'left' ? 1 : -1;
  const start = { x: sign * .14, z: -.2, heading: -sign * radians(3), steer: 0, speed: 0, time: 0, distance: 0 };
  return { side, phase: 'observe', start, before: predictStraightReverse(start), sawTurn: false, result: null };
}

export function correctionInput(drill, controls = {}) {
  const active = Boolean(drill && ['practice', 'return'].includes(drill.phase));
  return { reverse: active, forward: false, brake: !active || Boolean(controls.brake),
    left: active && Boolean(controls.left), right: active && Boolean(controls.right), center: active && Boolean(controls.center),
    speedLimit: CORRECTION_SPEED, steerLimit: CORRECTION_STEER_LIMIT };
}

function finish(drill, kind, title, text, state) {
  return { ...drill, phase: 'result', result: { kind, title, text, after: predictStraightReverse(state) } };
}

export function advanceCorrection(drill, previous, next, input = {}) {
  if (!drill || !['practice', 'return'].includes(drill.phase)) return drill;
  const sign = drill.side === 'left' ? 1 : -1;
  if (crossesCourseLine(next)) return finish(drill, 'line', '先停住，这次碰到边线', '观察车身与紧侧边线，再从同一观察位置重练；不要继续补大方向。', next);
  // Left-side clearance requires the tail to move right, and vice versa.
  if (next.steer * sign > radians(2)) return finish(drill, 'wrong', '这次方向会加重车尾逼线趋势', `当前是车尾向${drill.side === 'left' ? '左' : '右'}斜入，不是车身平行偏移。先停住，看车身与同侧库侧线；倒车时应向另一侧小幅打方向，逐渐改变车尾走势，同时留意车头外摆。`, next);
  const sawTurn = drill.sawTurn || Math.abs(next.steer) > radians(2);
  const forecast = predictStraightReverse(next);
  const hasSpace = forecast.safe && forecast.minimumSideClearance >= .08;
  const value = { ...drill, sawTurn, phase: hasSpace && sawTurn ? 'return' : drill.phase };
  if (input.center && Math.abs(next.steer) <= 1e-7) {
    if (!sawTurn) return finish(value, 'early', '还没有完成小幅纠偏', '前轮原本就在中间，只按回正不会改善车身姿态。先观察紧侧，向另一侧小幅修方向，再判断何时主动回正。', next);
    if (!hasSpace && next.heading * sign > 0) return finish(value, 'late', '回正偏晚，车身已摆向另一侧', '这次保持转角过久，完成回正时车身已反向摆过，直倒余量不足。对比另一侧的间隙变化，下次在余量改善后更早回正。', next);
    return hasSpace
      ? finish(value, 'good', '这次小幅纠偏后，直倒余量改善', '你先让车尾离开紧侧，再主动回正。对比同一面镜子的前后变化；继续倒车前仍要交替确认另一侧。', next)
      : finish(value, 'early', '回正后仍有夹角，直倒余量不足', '这次回方向时余量还没有改善。对照紧侧车身与库线，再从操作前观察；不能只凭前轮回中判断完成。', next);
  }
  if (next.distance - drill.start.distance > 2 || Math.abs(next.heading) > radians(5) || next.time > 20) {
    return finish(value, 'late', '先停住，重新比较夹角和余量', '小幅转向也会继续改变车身朝向。余量改善后应主动回正，避免长时间保持同一转角。', next);
  }
  return value;
}

export function correctionGuidance(drill) {
  const tight = drill.side === 'left' ? '左' : '右';
  const turn = drill.side === 'left' ? '右' : '左';
  const key = drill.side === 'left' ? 'D' : 'A';
  if (drill.phase === 'result') return { title: drill.result.title, text: drill.result.text, look: tight };
  if (drill.phase === 'return') return { title: '余量已经改善，现在主动回正 X', text: '回正过程中仍看夹角；前轮回中后，系统会停住并对比这次变化。', look: tight };
  if (drill.phase === 'observe') return { title: '先看两面镜，判断哪一侧会越倒越紧', text: '这次练车尾带小夹角斜入。先认车身、库侧线和库底线，看同一面镜中的近远间隙与走势，再核对另一侧。不要用两镜画面的宽窄直接比较实际距离。', look: tight };
  return { title: `按住 ${key}，方向盘向${turn}小幅转`, text: `这次车尾向${tight}斜入，向${turn}小幅打方向，是为了让车尾走势逐渐向${turn}调整。车头会向${tight}外摆，留意前方与另一侧。看${tight}镜的逼线趋势改善后主动回正 X；前轮回中不等于车身已直。`, look: tight };
}
