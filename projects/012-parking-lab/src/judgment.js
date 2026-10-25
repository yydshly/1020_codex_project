import { CAR, BAY, clamp, crossesCourseLine, localToWorld, stepVehicle } from './vehicle.js';
import { assessCentering } from './steering-coach.js';

const DT = 1 / 120;
const radians = degrees => degrees * Math.PI / 180;
const degrees = angle => angle * 180 / Math.PI;
const remaining = (state, side) => Math.atan2(Math.sin(state.heading), Math.cos(state.heading)) * (side === 'left' ? 1 : -1);
const speedFor = speed => clamp(Number.isFinite(speed) ? speed : 1.8 / 3.6, 1.2 / 3.6, 3.6 / 3.6);
const stoppedPose = pose => ({ ...pose, speed: 0, judgmentCenter: false });

/** A model demonstration pose, with a full turn held, reset for this local drill. */
export function judgmentStart(demonstration, side = 'right', { startAngle = 30 } = {}) {
  if (!['left', 'right'].includes(side)) throw new Error('Judgment side must be left or right');
  const first = side === 'left' ? demonstration.stops[7] : demonstration.stops[2];
  const last = side === 'left' ? demonstration.stops[9] : demonstration.stops[3];
  const target = radians(clamp(startAngle, 12, 40));
  const index = demonstration.frames.findIndex((pose, index) => index >= first && index <= last && remaining(pose, side) <= target && remaining(pose, side) > 0 && Math.abs(pose.steer) >= CAR.maxSteer - 0.001);
  if (index < 0) throw new Error('Demonstration has no suitable judgment start pose');
  return { ...demonstration.frames[index], speed: 0, time: 0, distance: 0, step: undefined, judgmentCenter: false };
}

// Re-run the demonstration's approach with the selected speed. The ideal action
// pose comes from the shared physical evaluator, never from a fixed angle band.
function createReference(startState, side, speedLimit) {
  const approach = [{ ...startState }];
  let best = null;
  for (let i = 0; i < 3600; i++) {
    const pose = approach.at(-1);
    const angle = remaining(pose, side);
    if (angle <= radians(5)) {
      const assessment = assessCentering(pose, side, { speedLimit });
      if (assessment.kind === 'good' && assessment.prediction?.safe) {
        const score = Math.abs(assessment.predictedResidualDegrees);
        if (!best || score < best.score) best = { score, index: approach.length - 1 };
      }
    }
    if (angle < radians(-5) || crossesCourseLine(pose)) break;
    approach.push(stepVehicle(pose, { reverse: true, speedLimit }, DT));
  }
  if (!best) throw new Error('No safe physical reference found for this judgment start');
  const frames = approach.slice(0, best.index + 1);
  let centered = false, braking = false;
  for (let i = 0; i < 3600; i++) {
    const pose = frames.at(-1);
    centered ||= Math.abs(pose.steer) < 1e-7;
    braking ||= centered && localToWorld(pose, 0, -CAR.rearOverhang).z <= BAY.back + 0.55;
    const next = stepVehicle(pose, braking ? { brake: true, speedLimit } : { reverse: true, center: !centered, speedLimit }, DT);
    frames.push({ ...next, judgmentCenter: !centered });
    if (braking && next.speed === 0) break;
  }
  return { frames, decisionIndex: best.index };
}

/**
 * Parent UI changes ready -> running when the user starts. frames belongs to
 * this drill; ready/finished are inert and do not accumulate teaching time.
 */
export function createJudgmentDrill(demonstration, side = 'right', options = {}) {
  const speedLimit = speedFor(options.speedLimit);
  const startState = judgmentStart(demonstration, side, options);
  const reference = createReference(startState, side, speedLimit);
  return { side, status: 'ready', speedLimit, startState, frames: [{ ...startState }],
    activeStartIndex: 0, decisionIndex: null, centeredIndex: null, result: null,
    referenceFrames: reference.frames, referenceDecisionIndex: reference.decisionIndex };
}

/** Distance matching is for replay; decision matching compares action moments. */
export function judgmentReferencePose(drill, index = drill.frames.length - 1, { match = 'distance' } = {}) {
  if (match === 'decision') return { ...drill.referenceFrames[drill.referenceDecisionIndex] };
  const pose = drill.frames[clamp(index, 0, drill.frames.length - 1)];
  const distance = pose.distance - drill.frames[0].distance;
  const target = drill.referenceFrames[0].distance + distance;
  let low = 0, high = drill.referenceFrames.length - 1;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (drill.referenceFrames[mid].distance < target) low = mid + 1;
    else high = mid;
  }
  const before = Math.max(0, low - 1);
  const picked = Math.abs(drill.referenceFrames[before].distance - target) < Math.abs(drill.referenceFrames[low].distance - target) ? before : low;
  return { ...drill.referenceFrames[picked] };
}

function retryIndexBefore(drill, index) {
  const anchor = Math.max(drill.activeStartIndex, Math.min(index, drill.decisionIndex ?? index));
  const targetTime = drill.frames[anchor].time - 1.8;
  for (let i = anchor - 1; i >= drill.activeStartIndex; i--) if (drill.frames[i].time <= targetTime) return i;
  return drill.activeStartIndex;
}

function finish(drill, kind, assessment = null, reason = null) {
  const lastIndex = drill.frames.length - 1;
  const errorIndex = kind === 'good' ? null : kind === 'line' && crossesCourseLine(drill.frames[lastIndex]) ? lastIndex : drill.decisionIndex ?? lastIndex;
  const comparisonIndex = drill.decisionIndex ?? lastIndex;
  const messages = {
    early: ['这次回正偏早', '前轮回正后，车身仍留着入库夹角。对照两次开始回正时的镜面和两侧余量，下次稍晚操作。'],
    good: ['这次回正时机合适', '按当前姿态继续直倒，模型预测整车可以入库且沿途不出线。接下来仍需观察两侧间距，在停车参照处刹车。'],
    late: ['这次回正偏晚', '车身已经摆过合适位置；前轮回正后仍会朝另一侧边线靠近。对照动作时的镜面，下次提前准备。'],
    line: ['这段需要重新观察边线', '当前车身或回正后的直倒路线会触及边线。先比较两侧镜中的余量，再从错误前的位置重新判断。'],
    unfinished: ['这段还没有完成主动回正', '按住 S 低速倒车，自己判断后按一次 X；不要用前进或继续转向替代这次回正练习。'],
  };
  let [title, text] = messages[kind];
  if (reason === 'missed-center' && drill.decisionIndex === null) {
    title = '已错过回正时机，尚未回正';
    text = '这段尚未记录主动回正，车身已经摆过合适位置。比较错过时机与示范回正时的两侧镜面，下次提前准备。';
  }
  return { ...drill, status: 'finished', result: { kind, title, text,
    reason: reason ?? assessment?.reason ?? kind,
    decisionIndex: drill.decisionIndex, centeredIndex: drill.centeredIndex,
    errorIndex, errorFrameIndex: errorIndex, comparisonIndex,
    retryIndex: retryIndexBefore(drill, errorIndex ?? comparisonIndex),
    decisionPose: { ...drill.frames[comparisonIndex] },
    referencePose: judgmentReferencePose(drill, comparisonIndex, { match: 'decision' }),
    referenceMatch: 'decision', referenceSpeedLimit: drill.speedLimit,
    prediction: assessment?.prediction ?? null,
    predictedResidualDegrees: assessment?.predictedResidualDegrees ?? null,
    heading: degrees(drill.frames[lastIndex].heading),
  } };
}

/** Record actual physics, without publishing early "center now" guidance. */
export function advanceJudgmentDrill(drill, previous, next, input = {}) {
  if (!drill || drill.status !== 'running') return drill;
  let value = { ...drill, frames: [...drill.frames, { ...next, judgmentCenter: Boolean(input.center) }] };
  if (value.decisionIndex === null && input.center) value.decisionIndex = value.frames.length - 2;
  if (crossesCourseLine(next)) return finish(value, 'line', null, 'actual-line');
  if (next.speed > 0.04) return finish(value, 'unfinished', null, 'forward');
  if (value.decisionIndex !== null && Math.abs(next.steer) < 1e-7) {
    value.centeredIndex = value.frames.length - 1;
    const assessment = assessCentering(next, value.side, { speedLimit: value.speedLimit, completed: true });
    const kind = assessment.kind === 'unsafe' ? 'line' : assessment.kind;
    return finish(value, kind, assessment);
  }
  if (remaining(next, value.side) < radians(-5)) return finish(value, 'late', assessCentering(next, value.side, { speedLimit: value.speedLimit }), 'missed-center');
  if (next.time - value.startState.time > 45 || next.distance - value.startState.distance > CAR.length + 2) return finish(value, 'unfinished', null, 'limit');
  return value;
}

/** End an interrupted attempt without pretending the user chose a return point. */
export function finishJudgmentDrill(drill) {
  if (!drill || drill.status === 'finished') return drill;
  return finish(drill, 'unfinished', null, 'stopped-before-center');
}

/** Keep the old object intact for comparison; replace only its retried suffix. */
export function retryJudgmentDrill(drill) {
  const index = drill.result?.retryIndex ?? drill.activeStartIndex;
  const startState = stoppedPose(drill.frames[index]);
  const frames = drill.frames.slice(0, index).map(pose => ({ ...pose }));
  frames.push({ ...startState });
  return { ...drill, status: 'ready', startState, frames, activeStartIndex: index,
    decisionIndex: null, centeredIndex: null, result: null };
}
