import { CAR, crossesCourseLine } from './vehicle.js';
import { assessCentering } from './steering-coach.js';

const degrees = radians => radians * 180 / Math.PI;

// A short exercise taken from the existing continuous demonstration. Left and
// right use symmetric poses; the full-route demonstration remains untouched.
export function alignmentStart(demonstration, side) {
  const frame = demonstration.frames.slice(demonstration.stops[2], demonstration.stops[3] + 1)
    .find(pose => Math.abs(degrees(pose.heading)) <= 18);
  const sign = side === 'left' ? -1 : 1;
  return { ...frame, x: frame.x * sign, heading: frame.heading * sign,
    steer: frame.steer * sign, speed: 0, time: 0, distance: 0, step: undefined };
}

export function createAlignmentDrill(side, state) {
  return { side, status: 'ready', startDistance: state.distance, returnHeading: null, result: null };
}

function finish(drill, state, kind) {
  const messages = {
    aligned: ['这次回正后，车身接近顺直', '切俯视对照两侧间隙，再练另一侧。接下来仍要继续直倒、找停车参照。'],
    early: ['回正偏早，车身还留着夹角', '前轮回到 0° 后，车身会沿当前朝向继续倒。下次多观察两侧车身与库线，等更接近平行再回方向。'],
    late: ['回正偏晚，车身已经摆过头', '保持转角倒车会继续改变车身朝向。下次在两侧边线趋于平行时更早开始回方向。'],
    unsafe: ['方向已回正，继续直倒余量不足', '前轮回正不保证车身能安全倒入。先对照两侧间隙和车身位置，再从更早的姿态重练。'],
    line: ['这段练习出现车身出线', '暂停看后轮、车尾和库边线的关系，再重练这一段。'],
    forward: ['这段需要低速倒车', '按住 S 倒车，观察车身与库线的夹角。想重练可以直接点“再练这侧”。'],
    unfinished: ['这段尚未完成回正', '重新从观察位置开始；按住 S 倒车，判断时机后按 X 主动回正。'],
  };
  const [title, text] = messages[kind];
  return { ...drill, status: 'finished', result: { kind, title, text,
    heading: degrees(state.heading), steer: degrees(state.steer),
    returnHeading: drill.returnHeading === null ? null : degrees(drill.returnHeading) } };
}

export function advanceAlignmentDrill(drill, previous, next, input) {
  if (!drill || drill.status !== 'running') return drill;
  let value = drill;
  if (value.returnHeading === null && (input.center ||
    Math.abs(previous.steer) > Math.PI / 180 && Math.abs(next.steer) < Math.abs(previous.steer) - 1e-6)) {
    value = { ...value, returnHeading: previous.heading };
  }
  if (crossesCourseLine(next)) return finish(value, next, 'line');
  if (next.speed > 0.04) return finish(value, next, 'forward');
  const remaining = degrees(next.heading) * (value.side === 'left' ? 1 : -1);
  if (value.returnHeading !== null && Math.abs(next.steer) < Math.PI / 360) {
    const assessment = assessCentering(next, value.side, { completed: true, speedLimit: input.speedLimit });
    return { ...finish(value, next, assessment.kind === 'good' ? 'aligned' : assessment.kind), assessment };
  }
  if (remaining < -9) return finish(value, next, 'late');
  if (next.distance - value.startDistance > CAR.length || next.time > 45) return finish(value, next, 'unfinished');
  return value;
}

export function replayAlignmentDrill(side, frames, index) {
  let drill = { ...createAlignmentDrill(side, frames[0]), status: 'running' };
  for (let i = 1; i <= index; i++) drill = advanceAlignmentDrill(drill, frames[i - 1], frames[i], {});
  return drill;
}
