import { CAR, crossesCourseLine } from './vehicle.js';
import { createProgress, advanceProgress } from './lesson.js';
import { assessCentering } from './steering-coach.js';

const radians = degrees => degrees * Math.PI / 180;
const degrees = angle => angle * 180 / Math.PI;
const normalized = angle => Math.atan2(Math.sin(angle), Math.cos(angle));
const scopeNote = '仅比较本模型的观察与操作时机，不是实车点位或考试扣分标准。';
const result = (kind, title, text, index = null, extra = {}) => ({ kind, title, text, index, ...extra });
const pendingTurn = () => result('pending', '还未记录打方向', '继续观察到转向参照后的实际操作，当前记录不足以判断早晚。');
const pendingCenter = () => result('pending', '还未记录回正', '继续观察车身与边线，记录实际回方向后再判断时机。');
const unobservedTurn = () => result('unobserved', '未记录打方向起点', '本段从已有转角或已经进入转弯的位置接手，无法还原此前何时开始打方向。');
const unobservedCenter = () => result('unobserved', '未记录此前回正过程', '本段起点已经越过回正观察区间或方向已回正，无法判断此前的回正时机。');

/** Stationary steering can be the whole mistake, even without any distance. */
export function canReviewPractice(frames) {
  if (!frames || frames.length < 3) return false;
  const first = frames[0];
  return frames.at(-1).distance - first.distance >= .03 || frames.some(pose => Math.abs(pose.steer - first.steer) >= radians(2));
}

function remainingAngle(state, side) { return normalized(state.heading) * (side === 'left' ? 1 : -1); }
function markerGap(state, side, marker) { return (side === 'left' ? state.x : -state.x) - Math.abs(marker); }
function turnWindow(state) {
  // Reference steering builds at 0.7 m/s. Allow its physical build-up distance,
  // a normal response delay, and the recording interval without changing lines.
  const speed = Math.abs(state.speed);
  const speedAdjustment = (speed - 0.7) * 0.25;
  return { early: 0.40 + speedAdjustment, late: -0.30 + speedAdjustment };
}
function judgeTurn(state, side, marker, index) {
  const gap = markerGap(state, side, marker);
  const window = turnWindow(state);
  if (gap > window.early) return result('early', '打方向偏早', '开始打方向时，车身还没有接近模型转向参照。下次先保持直倒，辨认镜中车身与侧后地面，库线入镜后再比较余量。', index, { executed: true, gap });
  if (gap < window.late) return result('late', '打方向偏晚', '开始打方向时，车身已经明显驶过模型转向参照。下次更早辨认入库侧车身与地面，库线进入镜面后再比较余量。', index, { executed: true, gap });
  return result('good', '打方向时机接近模型参照', '开始转向的位置处于本模型的正常操作区间；继续辨认镜中车身，库线入镜后再交替比较两侧余量。', index, { executed: true, gap });
}
const centerRequested = state => state.reviewCenter === true || state.reviewInput?.center === true;
const wheelsCentered = state => Math.abs(state.steer) <= 1e-7;

function observedReturn(frames, startIndex, completedIndex) {
  const poses = frames.slice(startIndex, completedIndex + 1);
  const speeds = poses.map(state => Math.abs(state.speed));
  const limits = poses.map(state => state.reviewInput?.speedLimit).filter(value => Number.isFinite(value) && value > 0);
  let distance = 0;
  for (let i = 1; i < poses.length; i++) distance += Math.hypot(poses[i].x - poses[i - 1].x, poses[i].z - poses[i - 1].z);
  const stationary = distance < 0.01 && speeds.every(speed => speed < 0.04);
  const braking = poses.slice(1).some(state => state.reviewInput?.brake === true);
  const speedChanged = limits.length > 1 && Math.max(...limits) - Math.min(...limits) > 0.01;
  // Old recordings have no input fields. Describe their observed slowdown,
  // without claiming that a brake or a speed-slider change caused it.
  let peakSpeed = speeds[0], slowing = false;
  for (const speed of speeds.slice(1)) { slowing ||= peakSpeed - speed > 0.12; peakSpeed = Math.max(peakSpeed, speed); }
  const kind = stationary ? 'stationary' : speedChanged ? 'speed-change' : braking ? 'braking' : slowing ? 'slowing' : 'continuous';
  return { kind, distance, stationary, braking, speedChanged, slowing,
    crossedLine: poses.some(state => crossesCourseLine(state)) };
}

function judgeCenter(start, completed, side, index, completedIndex, process) {
  // The return has already happened. Assess the recorded neutral pose instead
  // of inventing a second return with continuous reverse and a default speed.
  const assessment = assessCentering(completed, side, { completed: true });
  const prediction = { ...assessment.prediction, returnCrossedLine: process.crossedLine };
  if (process.crossedLine) { prediction.safe = false; prediction.reason = 'actual_return_crossing'; }
  const extra = { executed: true, heading: degrees(remainingAngle(start, side)),
    completedHeading: degrees(remainingAngle(completed, side)), predictedResidual: assessment.predictedResidualDegrees,
    prediction, reason: prediction.reason === 'actual_return_crossing' ? prediction.reason : assessment.reason,
    startIndex: index - 1, completedIndex, assessmentSource: 'recorded-completion', process };
  if (process.crossedLine) return result('wrong', '回正过程中出现车身出线', '记录显示车身在开始回正时或回方向过程中触及边线。即使结束姿态有余量，也不能把这段回正判为合适；先回看开始回正的一刻和沿途位置。', index, extra);
  if (!prediction.safe && process.kind !== 'continuous') {
    const descriptions = {
      stationary: ['原地回正后，车身仍未对准', '这次在停住时回正，前轮变直并没有让车身摆正。'],
      'speed-change': ['变速回正后，直倒余量不足', '回方向期间低速设定发生变化，实际车身摆动与原来的速度不同。'],
      braking: ['刹车回正后，直倒余量不足', '回方向期间有刹车操作，车身摆动会随实际车速改变。'],
      slowing: ['减速回正后，直倒余量不足', '记录显示回方向期间车速下降，实际车身摆动也随之改变。'],
    };
    const [title, explanation] = descriptions[process.kind];
    const outcome = assessment.kind === 'early' ? '完成后仍有入库夹角' : assessment.kind === 'late' ? '完成后已摆过顺直位置' : '完成后的边线余量不足';
    return result('wrong', title, `${explanation}${outcome}，继续直倒不能安全完成入库；不能只把结果归因于开始时机。先对照实际回正过程，再从操作前重练。`, index, { ...extra, outcomeKind: assessment.kind });
  }
  if (assessment.kind === 'early') return result('early', '回正偏早', '开始回方向时车身仍有明显夹角，回正后继续直倒余量不足。先对照两侧镜，再从回正前重练。', index, extra);
  if (assessment.kind === 'late') return result('late', '回正偏晚', '这次开始回方向偏晚，完成时车身已摆过顺直位置；回方向期间车尾还会继续横摆。下次提前交替观察两侧边线。', index, extra);
  if (assessment.kind === 'unsafe') return result('wrong', '回正后直倒余量不足', '当前回正后的预计路径不能安全完成入库。仅凭这次余量不足不能确定打方向或回正早晚，需对照整段轨迹。', index, extra);
  if (process.kind !== 'continuous') return result('good', '回正完成，当前直倒有余量', `${process.stationary ? '这次在停住时把前轮回正，车身没有因此继续摆动。' : '这次回正过程中车速有变化。'}按记录中的实际完成姿态，继续直倒有余量；这不代表此前所有速度下都适用同一开始时机。仍要观察两侧间隙和停车位置。`, index, extra);
  return result('good', '回正时机接近模型参照', '记录中的回正完成姿态接近顺直，继续直倒有余量；还要继续观察两侧间隙和停车位置。', index, extra);
}

function retryBefore(frames, startIndex, issueIndex) {
  if (issueIndex === null || issueIndex <= startIndex) return startIndex;
  const target = frames[issueIndex].time - 1.8;
  for (let i = issueIndex - 1; i >= startIndex; i--) if (frames[i].time <= target) return i;
  return startIndex;
}

function analyzeEntry(frames, demonstration, segment) {
  const { side, startIndex, endIndex } = segment;
  const sign = side === 'left' ? 1 : -1;
  const first = frames[startIndex];
  const firstHeading = remainingAngle(first, side);
  const initialTurnMissing = Math.abs(first.steer) > radians(2) || Math.abs(firstHeading) < radians(80);
  const initialPastMarker = markerGap(first, side, demonstration.turnMarker) < turnWindow(first).late;
  const initialReturnInProgress = centerRequested(first) || Math.abs(firstHeading) < radians(10) && Math.abs(first.steer) > radians(2) && Math.abs(first.steer) < CAR.maxSteer - radians(2);
  const initialCenterMissing = initialReturnInProgress || firstHeading < radians(-3) || Math.abs(firstHeading) < radians(75) && Math.abs(first.steer) < radians(2);
  let turn = initialTurnMissing || initialPastMarker ? unobservedTurn() : pendingTurn();
  let center = initialCenterMissing ? unobservedCenter() : pendingCenter();
  let observedTurn = false, observedCenter = false;
  let declineStart = null, explicitCenter = false, returnStartAvailable = !initialReturnInProgress;
  let peakSteer = Math.max(0, sign * first.steer);
  let firstIssue = null, lineIndex = null;
  const markIssue = index => { firstIssue = firstIssue === null ? index : Math.min(firstIssue, index); };
  for (let i = startIndex; i <= endIndex; i++) {
    const state = frames[i];
    if (lineIndex === null && crossesCourseLine(state)) { lineIndex = i; markIssue(i); }
    if (i === startIndex) continue;
    const previous = frames[i - 1];
    // Exclude forward steering even when an incomplete attempt remains phase 0/2.
    if (state.speed > 0.04 || previous.speed > 0.04) {
      if (declineStart !== null && center.kind === 'pending') center = pendingCenter();
      declineStart = null; explicitCenter = false; peakSteer = Math.max(0, sign * state.steer); continue;
    }
    const steer = sign * state.steer, prevSteer = sign * previous.steer;
    if (!observedTurn && !initialTurnMissing) {
      if (steer < -radians(2) && steer < prevSteer - radians(0.1)) {
        turn = result('wrong', '开始转向的方向相反', `这段是${side === 'left' ? '左' : '右'}倒库，但记录里的第一次转向朝了另一侧。先暂停核对镜面和转向方向。`, i, { executed: true });
        observedTurn = true; markIssue(i);
      } else if (steer > radians(2) && steer > prevSteer + radians(0.1)) {
        turn = judgeTurn(previous, side, demonstration.turnMarker, i);
        observedTurn = true;
        if (turn.kind !== 'good') markIssue(i);
      } else if (turn.kind === 'pending' && markerGap(state, side, demonstration.turnMarker) < turnWindow(state).late && state.speed < -0.04) {
        turn = result('late', '已错过转向区间，尚未打方向', '记录内还没有开始打方向，车身已明显驶过模型参照。先停下观察，再从更早的位置重练。', i, { executed: false });
        markIssue(i);
      }
    }
    if (!observedCenter) {
      if (steer > prevSteer + radians(0.1)) {
        declineStart = null; explicitCenter = false;
        peakSteer = Math.max(peakSteer, steer);
        if (steer >= CAR.maxSteer - radians(2)) returnStartAvailable = true;
        if (center.kind === 'pending') center = pendingCenter();
      }
      if (returnStartAvailable && peakSteer >= radians(8)) {
        if (centerRequested(state)) { declineStart ??= i; explicitCenter = true; }
        if (steer < prevSteer - radians(0.1)) declineStart ??= i;
      }
      // A partial correction is not a completed return to centre. Confirm the
      // action only when it reaches neutral; explicit input can mark it pending.
      if (declineStart !== null && wheelsCentered(state)) {
        center = judgeCenter(frames[declineStart - 1], state, side, declineStart, i, observedReturn(frames, declineStart - 1, i));
        observedCenter = true;
        if (center.kind !== 'good') markIssue(declineStart);
      } else if (declineStart !== null && explicitCenter) {
        center = result('pending', '主动回正进行中', '已记录主动回方向的起点，等前轮真正回到零度后，再依据实际完成姿态判断。', declineStart, { executed: true, startIndex: declineStart - 1 });
      } else if (center.kind === 'pending' && remainingAngle(state, side) < radians(-5) && steer > radians(2) && state.speed < -0.04) {
        center = result('late', '已错过回正区间，尚未回正', '记录内没有出现主动回方向，车身已摆过平行位置。先刹车观察，再从顺直前的位置重练。', i, { executed: false });
        markIssue(i);
      }
    }
  }
  const referenceStartIndex = side === 'left' ? demonstration.stops[7] : 0;
  const referenceEndIndex = side === 'left' ? demonstration.stops[9] : demonstration.stops[5];
  const retryIndex = retryBefore(frames, startIndex, firstIssue);
  const retryNote = firstIssue === null ? '本段未识别明确错误，可从录制起点重新练习。' : retryIndex === firstIssue ? '录制从此处开始，没有更早的姿态；只能从本段起点重练。' : frames[firstIssue].time - frames[retryIndex].time < 1.5 ? '错误前的录制较短，已选本段最早姿态。' : '已选错误发生前约 1.8 秒的录制姿态，可重新观察并操作。';
  const summary = `${side === 'left' ? '左' : '右'}倒库：${turn.title}；${center.title}${lineIndex === null ? '。' : '。本段出现车身出线，需另看车身与边线的位置。'}`;
  return { side, startIndex, endIndex, turn, center, issueIndex: firstIssue, retryIndex, retryNote,
    referenceFrames: demonstration.frames.slice(referenceStartIndex, referenceEndIndex + 1).map(frame => ({ ...frame })),
    referenceStartIndex, summary, lineIndex, complete: segment.complete };
}

/** Analyze only the supplied recording; no old review state survives a retry. */
export function analyzePractice(frames, demonstration, seedProgress = createProgress()) {
  if (!frames?.length) return { attempts: [], activeAttemptIndex: null, scopeNote };
  let progress = { ...createProgress(), ...seedProgress };
  const segments = [];
  let current = null;
  const begin = (phase, index) => ({ side: phase === 2 ? 'left' : 'right', startIndex: index, endIndex: index, complete: false });
  if (progress.phase === 0 || progress.phase === 2) current = begin(progress.phase, 0);
  for (let i = 1; i < frames.length; i++) {
    const beforePhase = progress.phase;
    progress = advanceProgress(progress, frames[i - 1], frames[i]);
    if (current) {
      current.endIndex = i;
      if (progress.phase !== beforePhase) { current.complete = progress.phase === 1 || progress.phase === 3; segments.push(current); current = null; }
    }
    if (!current && progress.phase !== beforePhase && (progress.phase === 0 || progress.phase === 2)) current = begin(progress.phase, i);
  }
  if (current) segments.push(current);
  return { attempts: segments.map(segment => analyzeEntry(frames, demonstration, segment)), activeAttemptIndex: current ? segments.length - 1 : null, scopeNote };
}
