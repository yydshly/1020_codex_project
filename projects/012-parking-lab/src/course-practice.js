import { sampleChapterPose } from './exam-courses.js';
import { BAY, CAR, corners, isParked } from './vehicle.js';
import { getCourseSafetyModel } from './course-safety.js';

// These are model-specific teaching tasks, never an examination score. A gaze
// entry means that an observation view was visited, not that traffic was safe.
const RAD = Math.PI / 180;
const TURN_THRESHOLD = .04;
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const wrap = value => Math.atan2(Math.sin(value), Math.cos(value));
const clone = value => structuredClone(value);
const xy = p => ({ x: finite(p.x), z: finite(p.z) });
const observationNames = { forward: '切回前方观察', 'front-left': '转头扫视前方左侧冲突区', 'front-right': '转头扫视前方右侧冲突区',
  left: '切到左外后视镜观察', right: '切到右外后视镜观察', rear: '切到车内后视镜观察', 'left-back': '转头查看左后方盲区', 'right-back': '转头查看右后方盲区' };
const baseLimitations = ['本轮为模型基础练习，不生成实考分数。', '切换观察视角只记录观察动作，不等于已经确认交通安全。'];
const c1Limit = '挡位和离合仍自动配合；本轮不评价手动换挡、离合脚感、熄火及坡道后溜控制。';
const observe = gaze => ({ id: `observe:${gaze}`, label: observationNames[gaze], gaze });
const task = (id, label) => ({ id, label });
const routeTask = task('route', '沿本项目教学道路驶至出口');
const stableTask = task('stable', '小幅修正，前轮回中并保持方向');
const frontConflictViews = ['front-left', 'front-right', 'forward'];
const roadTurnChapters = ['left-turn', 'right-turn', 'uturn'];
const hasFrontConflictGate = id => id === 'intersection' || roadTurnChapters.includes(id);
function conflictBounds(chapter) {
  const registered = getCourseSafetyModel(chapter).roads.find(road => road.kind === 'rect' && road.right - road.left > 7
    && road.right - road.left < 100 && road.front - road.back < 40);
  return registered ? { left: registered.left, right: registered.right, start: registered.back, end: registered.front } : null;
}
function overlapsBounds(pose, bounds, approach = 0) {
  if (!bounds) return false;
  const car = corners(pose), box = [bounds.left, bounds.right].flatMap(x => [bounds.start - approach, bounds.end].map(z => ({ x, z })));
  const axes = [{ x: 1, z: 0 }, { x: 0, z: 1 }, { x: Math.cos(pose.heading), z: -Math.sin(pose.heading) }, { x: Math.sin(pose.heading), z: Math.cos(pose.heading) }];
  return axes.every(axis => {
    const a = car.map(p => p.x * axis.x + p.z * axis.z), b = box.map(p => p.x * axis.x + p.z * axis.z);
    return Math.max(...a) >= Math.min(...b) - 1e-8 && Math.max(...b) >= Math.min(...a) - 1e-8;
  });
}

/** Lane bounds come from the rendered road registry and its declared lane
 * count, not the demonstration's lateral displacement. +X is the driver's
 * left; the negative-X half contains the two same-direction teaching lanes. */
export function getCoursePracticeLanes(chapter) {
  if (!['lane-change', 'overtake'].includes(chapter.id)) return null;
  const road = getCourseSafetyModel(chapter).roads.find(road => road.kind === 'rect' && road.left < 0 && road.right > 0);
  const count = chapter.scene?.lanes;
  if (!road || !Number.isInteger(count) || count < 4 || count % 2) return null;
  const width = (road.right - road.left) / count, divider = (road.left + road.right) / 2;
  const lanes = Array.from({ length: count / 2 }, (_, index) => ({ left: road.left + index * width, right: road.left + (index + 1) * width, heading: 0 }));
  const x = chapter.poses?.[0]?.x, index = lanes.findIndex(lane => x > lane.left && x < lane.right);
  return index >= 0 && index + 1 < lanes.length && lanes[index + 1].right <= divider ? { source: lanes[index], target: lanes[index + 1] } : null;
}
const wholeCarInLane = (pose, lane) => lane && Math.abs(wrap(pose.heading - lane.heading)) < 8 * RAD
  && corners(pose).every(point => point.x >= lane.left + .025 && point.x <= lane.right - .025);

/** Explicit teaching-zone targets, not legal/examination speed limits. School
 * metadata, the bus bay and junction opening define their physical spans. */
export function getCoursePracticeSpeedZone(chapter) {
  const id = chapter.id, scene = chapter.scene || {};
  const span = id === 'school' ? [finite(scene.schoolStartZ), finite(scene.schoolEndZ, 40)]
    : id === 'bus' ? [finite(scene.busStopZ, 20) - 8, finite(scene.busStopZ, 20) + 8]
      : id === 'intersection' ? [finite(scene.junctionZ, 20) - 8, finite(scene.junctionZ, 20) + 8]
        : id === 'meeting' ? [0, 45] : id === 'night' ? [-5, 65] : null;
  if (!span) return null;
  const roads = getCourseSafetyModel(chapter).roads.filter(road => road.kind === 'rect');
  const main = [...roads].sort((a, b) => b.front - b.back - (a.front - a.back))[0];
  const bounds = (id === 'intersection' ? conflictBounds(chapter)
    : id === 'bus' ? { left: Math.min(...roads.map(road => road.left)), right: main.right } : main) || main;
  return { start: span[0], end: span[1], left: bounds.left, right: bounds.right, limitKmh: id === 'intersection' ? 12 : 16,
    label: id === 'school' ? '学校区域' : id === 'bus' ? '公交站区域' : id === 'intersection' ? '路口区域' : id === 'meeting' ? '会车区域' : '夜间教学路段' };
}

/** All 22 chapters have a concrete, achievable basic-control or observation
 * task. Limitations describe the remaining C1 skill chain explicitly. */
export function getCoursePracticePlan(chapter) {
  const id = chapter.id;
  let checks = [observe('forward'), routeTask], objective = chapter.objective || `完成${chapter.title}的基础练习`;
  let scope = '基础方向、控速与观察练习', limitations = [...baseLimitations, c1Limit];
  if (id === 'prepare') {
    scope = '停车观察视角巡查'; objective = '车辆停住，依次找到前方、三面后视镜与左右后方观察视角。';
    checks = ['forward', 'left', 'right', 'rear', 'left-back', 'right-back'].map(observe);
    limitations.push('本轮不把绕车检查、车门、座椅、安全带的示范动作计为你已亲手完成。');
  } else if (id === 'lights') {
    scope = '静止灯光操作练习'; objective = '按当前情境依次选择灯光，最后关闭复位；选错会提示并保留当前题。';
    checks = lightTasks.map((item, i) => ({ id: `light:${i}`, label: item.label, lightMode: item.mode }));
    limitations = [...baseLimitations, '灯光题顺序为本次教学序列，不代表当地随机考题顺序。'];
  } else if (id === 'gears') {
    scope = '加减速观察练习 · 挡位自动配合'; objective = '看前方与内镜，平稳加速至本段目标，再制动减速，观察挡位的自动配合。';
    checks = [observe('forward'), observe('rear'), task('accelerate', '在本段逐渐加速至约 20 km/h'), task('decelerate', '随后平稳制动减速至约 6 km/h 以下')];
  } else if (id === 'reverse-parking') {
    objective = '通过两侧倒库、库内停稳及驶出返回，观察入库侧镜并主动回正。';
    checks = [observe('right'), observe('left'), observe('forward'), task('reverse', '低速倒车进入库位'), task('bay-stops', '两次确认全车入库并停稳'), routeTask, task('stop', '返回起点后停稳')];
  } else if (id === 'hill-start') {
    objective = '低速到达坡上目标位置，停稳驻车，再解除驻车平稳驶离。';
    checks = [observe('forward'), observe('right'), task('hill-stop', '在坡上目标标线附近停稳并驻车'), task('hill-start', '解除驻车后继续向前驶离'), routeTask];
  } else if (id === 'side-parking') {
    objective = '倒入侧方车位停稳，观察左侧与左后方、打左灯后驶出。';
    checks = [observe('right'), task('side-stop', '全车倒入侧方车位并停稳'), observe('left'), observe('left-back'), task('left-signal', '驶出前确认左转向灯开启'), routeTask];
  } else if (id === 'curve-driving') {
    checks = [observe('forward'), observe('left'), observe('right'), routeTask, stableTask];
  } else if (id === 'right-angle') {
    checks = [observe('forward'), observe('left'), task('turn-left', '低速沿左转出口改变方向'), routeTask, stableTask];
  } else if (id === 'start') {
    checks = [observe('left'), observe('left-back'), observe('forward'), task('left-signal', '起步前开启左转向灯'), task('start', '观察后平稳开始前进'), routeTask, stableTask];
  } else if (id === 'straight') {
    objective = '看远处道路与内后视镜，在车道内稳定驶完本段，避免大幅来回转向。';
    checks = [observe('forward'), observe('rear'), routeTask, stableTask];
  } else if (id === 'lane-change' || id === 'overtake') {
    objective = '先打灯，检查同侧外镜与肩后盲区，确认安全再变道；全车进入目标车道并顺直，返回原车道时同样操作。';
    checks = [observe('left'), observe('left-back'), task('left-signal', '向左变道前开启左转向灯'), task('left-change', '全车进入左侧同向车道并顺直'), observe('right'), observe('right-back'), task('right-signal', '返回前开启右转向灯'), task('right-change', '全车返回原车道并顺直'), routeTask, stableTask];
  } else if (id === 'intersection') {
    objective = '驶入路口前扫视前左方、前右方和正前方，确认通行条件后低速通过；停车等待后，重新起步前再观察。';
    checks = [observe('forward'), observe('front-left'), observe('front-right'), task('slow-zone', '整段路口保持本段教学目标约 12 km/h 以下'), routeTask];
  } else if (id === 'left-turn' || id === 'right-turn' || id === 'uturn') {
    const side = id === 'right-turn' ? 'right' : 'left';
    checks = [observe(side), observe(`${side}-back`), observe('front-left'), observe('front-right'), observe('forward'),
      task(`${side}-signal`, `转向前开启${side === 'left' ? '左' : '右'}转向灯`), task(`turn-${side}`, '观察前方冲突后进入对应出口方向'), routeTask, stableTask];
  } else if (id === 'crosswalk') {
    objective = '接近斑马线前停车让行，切换两侧观察，确认通行条件后再驶过。';
    checks = [observe('forward'), task('yield-stop', '在斑马线停止线前停稳一次'),
      ...['front-left', 'front-right', 'forward'].map(gaze => ({ ...observe(gaze), id: `after-yield:${gaze}`, label: `停稳后${observationNames[gaze]}` })),
      task('restart', '停稳后重新核对两侧与前方，再起步'), routeTask];
  } else if (id === 'school' || id === 'bus') {
    objective = '接近区域时观察前左方、前右方和正前方，持续留意行人和道路变化，完整低速通过；出区后补看不能补记本次目标。';
    checks = ['forward', 'front-left', 'front-right'].map(gaze => ({ ...observe(gaze), label: `接近或通过区域时${observationNames[gaze]}` }));
    checks.push(task('slow-zone', '完整通过风险区域并保持本段教学目标约 16 km/h 以下'), routeTask);
    limitations.push('观察记录只接受接近入口时的近期观察或区域内的观察；只点过视角不代表持续观察或已确认安全。');
  } else if (id === 'meeting') {
    checks = [observe('forward'), observe('right'), task('slow-zone', '整段会车区域保持本段教学目标约 16 km/h 以下并留出空间'), routeTask, stableTask];
  } else if (id === 'night') {
    checks = [observe('forward'), task('night-low', '开启近光观察道路'), task('slow-zone', '整段夜间教学路段保持本段教学目标约 16 km/h 以下'), routeTask];
  } else if (id === 'pull-over') {
    objective = '观察右镜与右后方，打右灯靠边停稳、驻车，再观察下车侧后方。';
    checks = [observe('right'), observe('right-back'), task('right-signal', '靠边前开启右转向灯'), task('pull-stop', '在教学停车区域内顺直停稳'), task('parking-brake', '停稳后拉起驻车制动'), observe('left'), observe('left-back')];
    limitations.push('本轮不评价亲手熄火、解安全带与开门下车，相关顺序继续在示范中学习。');
  }
  if (getCoursePracticeSpeedZone(chapter)) limitations.push('低速参考上限仅为本段教学目标，不是通用实考限速；须完整经过区域，短暂减速一次不算达成。');
  return { chapterId: id, title: chapter.title, objective, scope, limitations,
    completionHint: id === 'prepare' || id === 'lights' || id === 'gears' || id === 'pull-over'
      ? '完成清单后自动进入本章基础练习复盘；也可主动结束查看缺项。'
      : '驶至本段出口后自动复盘；也可主动结束查看已完成与未完成项。',
    checks: checks.map(item => ({ ...item })) };
}

const lightTasks = [
  { mode: 'low', label: '照明良好的道路：使用近光灯' },
  { mode: 'high', label: '照明不良且无其他交通影响：使用远光灯' },
  { mode: 'low', label: '夜间会车：改用近光灯' },
  { mode: 'flash', label: '需示意的弯坡路段：交替远近光' },
  { mode: 'low', label: '同向近距离跟车：使用近光灯' },
  { mode: 'hazard', label: '故障难以移动：示廓灯与危险报警闪光灯' },
  { mode: 'off', label: '本段结束：关闭灯光复位' },
];

function referenceFor(chapter) {
  const count = Math.max(2, Math.ceil(chapter.duration * 4)), result = [];
  let s = 0, previous = null;
  for (let i = 0; i <= count; i++) {
    const p = sampleChapterPose(chapter, chapter.duration * i / count);
    if (previous) s += Math.hypot(p.x - previous.x, p.z - previous.z);
    result.push({ x: p.x, z: p.z, heading: p.heading, steer: p.steer, t: p.t, s }); previous = p;
  }
  return result;
}
function projectToRoute(reference, pose, progress, start = false) {
  let best = { s: progress, distance: Infinity, heading: pose.heading, index: 0 };
  for (let i = 1; i < reference.length; i++) {
    const a = reference[i - 1], b = reference[i];
    if (!start && (b.s < progress - 4 || a.s > progress + 14)) continue;
    const dx = b.x - a.x, dz = b.z - a.z, length2 = dx * dx + dz * dz;
    if (length2 < 1e-12) continue;
    const u = clamp(((pose.x - a.x) * dx + (pose.z - a.z) * dz) / length2, 0, 1);
    const s = a.s + (b.s - a.s) * u, distance = Math.hypot(pose.x - a.x - dx * u, pose.z - a.z - dz * u);
    const score = distance + .001 * Math.abs(s - progress);
    if (score < best.distance + .001 * Math.abs(best.s - progress)) best = { s, distance, heading: a.heading + wrap(b.heading - a.heading) * u, index: i - 1 };
  }
  return best;
}
function sourcePose(driving, initialPose, chapter) {
  const p = initialPose || driving || sampleChapterPose(chapter, 0);
  return { ...p, x: finite(p.x), z: finite(p.z), heading: finite(p.heading), speed: finite(p.speed), steer: finite(p.steer) };
}
function lightState(mode) { return mode === 'hazard' || mode === 'parking-hazard' ? 'hazard' : mode || 'off'; }

export function createCoursePractice(chapter, { driving = null, initialDriving = driving, initialPose = null, attempt = 1 } = {}) {
  const pose = sourcePose(initialDriving, initialPose, chapter), reference = referenceFor(chapter), plan = getCoursePracticePlan(chapter);
  const timed = reference.reduce((a, p) => Math.abs(p.t - finite(pose.t)) < Math.abs(a.t - finite(pose.t)) ? p : a, reference[0]);
  const start = projectToRoute(reference, pose, timed.s, true);
  const initialProgress = start.distance < 2.5 ? start.s : 0;
  if (initialProgress > 3) plan.limitations = [...plan.limitations, '本次从示范中途接手；未操作的前段不会自动判完成，完整练习请从本项起点重置。'];
  const laneModel = getCoursePracticeLanes(chapter), zone = getCoursePracticeSpeedZone(chapter);
  const session = { chapter, plan, phase: 'ready', attempt, elapsed: 0, sequence: 0, endReviewAcknowledged: false, reference, startProgress: initialProgress,
    laneModel, speedZone: zone ? { ...zone, entered: false, entryFromBefore: Math.max(...corners(pose).map(p => p.z)) < zone.start,
      enteredAt: null, graceEligible: false, overFor: 0, excessTime: 0, insideTime: 0, covered: 0, peakKmh: 0,
      inRegion: false, coverageBroken: false, violated: false, complete: false, observationClosed: false,
      observedViews: Object.fromEntries(frontConflictViews.map(gaze => [gaze, false])) } : null,
    progress: { distance: initialProgress, total: reference.at(-1).s, ratio: 0, remaining: reference.at(-1).s - initialProgress },
    checks: plan.checks.map(item => ({ ...item, done: false })), currentTask: plan.checks[0] || null,
    observations: {}, observationLog: [], errors: [], actionLog: [], trajectory: [{ ...xy(pose), heading: pose.heading, elapsed: 0 }],
    history: [], retrySnapshot: null, review: null, feedback: null, initialPose: clone(pose), lastPose: clone(pose), lastDriving: initialDriving ? clone(initialDriving) : null,
    lastSnapshotTime: -.15, lastTrajectoryTime: 0, stoppedFor: 0, lightIndex: 0, lastLight: lightState(pose.lightMode),
    flags: { started: false, startObserved: false, leftSignal: false, rightSignal: false, leftChange: false, rightChange: false,
      leftManeuverStarted: false, rightManeuverStarted: false, leftManeuverValid: false, rightManeuverValid: false,
      leftLaneReached: false, rightLaneReached: false,
      sourceLaneSeen: wholeCarInLane(pose, laneModel?.source) || false,
      turnLeft: false, turnRight: false, reversed: false, bayStops: 0, bayOccupied: isParked({ ...pose, speed: 0 }), sideApproachSeen: !insideSideBay(pose, chapter), sideStopped: false, sideStopAt: null, sideStopSequence: null, hillStopped: false,
      hillRestarted: false, yieldStopped: false, restarted: false, zoneSlow: false, accelerationReady: Math.abs(pose.speed) < 5.5, accelerated: false, decelerated: false,
      nightLow: false, pullStopped: false, pullStopAt: null, pullStopSequence: null, yieldStopAt: null, yieldStopSequence: null,
      yieldRestartAttempted: false, yieldRestartObserved: false, yieldRestartSequence: null,
      frontConflictChecked: false, frontConflictObserved: false, frontConflictSequence: null, frontConflictViews: null, parkingBrake: false, centered: false },
    stats: { travelled: 0, peakSpeedKmh: 0, maxDeviation: 0, deviationSum: 0, deviationSamples: 0, maxSteer: 0 },
  };
  return withSnapshot(session, initialDriving, pose, true);
}

function lightSnapshot(session) {
  return { elapsed: session.elapsed, sequence: session.sequence, progress: { ...session.progress }, checks: session.checks.map(c => ({ ...c })),
    speedZone: session.speedZone ? clone(session.speedZone) : null,
    observations: clone(session.observations), observationLog: session.observationLog.map(o => ({ ...o, pose: { ...o.pose } })),
    flags: { ...session.flags }, stats: { ...session.stats }, lightIndex: session.lightIndex, lastLight: session.lastLight,
    stoppedFor: session.stoppedFor, actionCount: session.actionLog.length, trajectoryCount: session.trajectory.length };
}
function withSnapshot(session, driving, pose, force = false) {
  if (!driving || !force && session.elapsed - session.lastSnapshotTime < .12) return session;
  const snapshot = { elapsed: session.elapsed, driving: clone(driving), pose: clone(pose), learning: lightSnapshot(session) };
  const history = [...session.history.filter(entry => entry.elapsed >= session.elapsed - 10), snapshot].slice(-160);
  return { ...session, history, lastSnapshotTime: session.elapsed, lastDriving: clone(driving) };
}
function requiredViews(id, side) {
  if (['start', 'left-turn', 'right-turn', 'uturn', 'lane-change', 'overtake', 'pull-over', 'side-parking'].includes(id)) return [side, `${side}-back`];
  return [];
}
function recentlyObserved(session, side, within = 14) {
  return requiredViews(session.chapter.id, side).every(view => session.observations[view] && session.elapsed - session.observations[view].elapsed <= within);
}
function observedAfter(session, gaze, sequence) {
  return sequence !== null && Boolean(session.observations[gaze] && session.observations[gaze].sequence > sequence);
}
function normalizeEvent(event, session, pose) {
  return { id: String(event.id || `${event.type || 'risk'}:${session.errors.length}`), type: String(event.type || 'risk'),
    severity: String(event.severity || 'warning'), title: event.title || '需要注意的操作', detail: event.detail || event.message || '',
    elapsed: session.elapsed, pose: { ...xy(pose), heading: pose.heading }, ...event.position ? { position: { ...event.position } } : {},
    ...event.partId ? { partId: event.partId, partLabel: event.partLabel, side: event.side } : {},
    ...event.actorId ? { actorId: event.actorId } : {} };
}
function addError(session, event, pose = session.lastPose) {
  const normalized = normalizeEvent(event, session, pose);
  if (session.errors.some(item => item.id === normalized.id)) return session;
  const at = Math.max(0, session.elapsed - 2.5);
  // Paused light answers can all share the same simulation time. Their last
  // semantic snapshot, rather than a clock rewind, is the meaningful retry.
  const retry = session.chapter.id === 'lights' ? session.history.at(-1)
    : session.history.reduce((best, snapshot) => snapshot.elapsed <= at && (!best || snapshot.elapsed > best.elapsed) ? snapshot : best, null) || session.history[0] || null;
  const anchor = ['instruction', 'observation'].includes(normalized.type) || ['critical', 'danger', 'error'].includes(normalized.severity)
    || /collision|road-edge|parking-line|off-road|boundary/.test(normalized.type) && !/warning|proximity/.test(normalized.type);
  return { ...session, errors: [...session.errors, normalized], retrySnapshot: session.retrySnapshot || (anchor && retry ? clone(retry) : null),
    feedback: { type: anchor ? 'error' : 'info', title: normalized.title, detail: normalized.detail, eventId: normalized.id } };
}

const hasZoneObservation = id => ['school', 'bus'].includes(id);
function validZoneObservation(session, observation) {
  const zone = session.speedZone;
  return Boolean(zone && observation && overlapsBounds(observation.pose, { ...zone, start: zone.start - 15 })
    && (zone.entered && observation.elapsed >= zone.enteredAt || session.elapsed - observation.elapsed <= 14));
}
function updateSpeedZone(session, previous, pose, input, delta) {
  if (!session.speedZone) return session;
  const zone = { ...session.speedZone, observedViews: { ...session.speedZone.observedViews } }, points = corners(pose), rear = Math.min(...points.map(point => point.z)), front = Math.max(...points.map(point => point.z));
  const overlap = overlapsBounds(pose, zone), inCorridor = points.every(point => point.x >= zone.left && point.x <= zone.right);
  const downstream = rear > zone.end && inCorridor && Math.abs(wrap(pose.heading)) < Math.PI / 3;
  if (zone.inRegion && !overlap && !downstream) { zone.coverageBroken = true; zone.complete = false; }
  // Actually backing the entire car before the entrance can establish a fresh
  // complete traversal, including after a mid-zone takeover. Preserve the
  // first entry clock, grace and every recorded excess/violation: this is not
  // a way to erase speeding or receive a second braking allowance.
  if (!overlap && front < zone.start && inCorridor) {
    zone.entryFromBefore = true;
    if (zone.entered) {
      zone.covered = 0; zone.insideTime = 0; zone.coverageBroken = false; zone.complete = false; zone.observationClosed = false;
      zone.observedViews = Object.fromEntries(frontConflictViews.map(gaze => [gaze, false]));
    }
  }
  const braking = Boolean(input.brake || pose.brake) || finite(pose.acceleration) < -.05 || Math.abs(previous.speed) - Math.abs(pose.speed) > .02;
  if (!zone.entered && front < zone.start) zone.entryFromBefore = true;
  if (overlap && !zone.entered) {
    zone.entered = true; zone.enteredAt = session.elapsed;
    // One entry allowance per attempt, only for a real braking approach. A
    // later re-entry cannot reset this clock or erase accumulated excess time.
    zone.graceEligible = zone.entryFromBefore && braking && front <= zone.start + 3;
  }
  if (hasZoneObservation(session.chapter.id) && !zone.observationClosed) {
    for (const gaze of frontConflictViews) zone.observedViews[gaze] ||= validZoneObservation({ ...session, speedZone: zone }, session.observations[gaze]);
    if (zone.entered && zone.inRegion && !overlap && front >= zone.start) {
      zone.observationClosed = true;
      if (frontConflictViews.some(gaze => !zone.observedViews[gaze])) session = addError(session, {
        id: `zone-observation:${session.chapter.id}`, type: 'observation', title: `${zone.label}内前方观察记录不完整`,
        detail: '本练习只记录在接近入口或风险区域内访问前左方、前右方和正前方视角，不等于已确认安全或持续目视。离开后补看不能追认，请从有效观察窗口的位置重练。',
      }, pose);
    }
  }
  if (overlap) {
    zone.insideTime += delta; zone.peakKmh = Math.max(zone.peakKmh, Math.abs(pose.speed) * 3.6);
    const over = Math.abs(pose.speed) * 3.6 > zone.limitKmh + .5;
    const entryBraking = zone.graceEligible && braking && front <= zone.start + 3 && session.elapsed - zone.enteredAt < .6;
    if (over && !entryBraking) { zone.overFor += delta; zone.excessTime += delta; }
    else zone.overFor = 0;
    if (!zone.violated && (zone.overFor >= .3 - 1e-9 || zone.excessTime >= .6 - 1e-9)) {
      zone.violated = true; zone.complete = false;
      session = addError(session, { id: `speed-zone:${session.chapter.id}`, type: 'instruction', severity: 'warning',
        title: `${zone.label}未持续保持本段教学低速`,
        detail: `当前约 ${(Math.abs(pose.speed) * 3.6).toFixed(1)} km/h，持续超出本段教学目标约 ${zone.limitKmh} km/h。先减速并观察前方冲突，复盘后从超速前重练；这是本场景教学参考，不是通用实考限速。` }, pose);
    }
  } else zone.overFor = 0;
  const onRoad = points.every(point => getCourseSafetyModel(session.chapter).roads.some(road => road.kind === 'rect'
    && point.x >= road.left && point.x <= road.right && point.z >= road.back && point.z <= road.front));
  if (zone.entered && !zone.coverageBroken && (overlap || downstream) && pose.speed > .1 && pose.z >= previous.z - .01 && onRoad && Math.abs(wrap(pose.heading)) < Math.PI / 3)
    zone.covered = Math.max(zone.covered, clamp(rear - zone.start, 0, zone.end - zone.start));
  if (zone.entered && downstream && zone.entryFromBefore && !zone.coverageBroken && zone.covered >= zone.end - zone.start - .2 && zone.insideTime >= 1 && !zone.violated) zone.complete = true;
  zone.inRegion = overlap;
  session.flags.zoneSlow = zone.complete && !zone.violated;
  return { ...session, speedZone: zone };
}

function lockFrontConflictObservation(session, pose) {
  const f = session.flags;
  f.frontConflictChecked = true; f.frontConflictSequence = session.sequence;
  f.frontConflictViews = Object.fromEntries(frontConflictViews.map(gaze => {
    const observed = session.observations[gaze];
    return [gaze, Boolean(observed && observed.sequence < f.frontConflictSequence && session.elapsed - observed.elapsed <= 14)];
  }));
  f.frontConflictObserved = Object.values(f.frontConflictViews).every(Boolean);
  if (f.frontConflictObserved) return session;
  const missing = frontConflictViews.filter(gaze => !f.frontConflictViews[gaze]).map(gaze => observationNames[gaze]).join('、');
  return addError(session, { id: `front-conflict:${session.chapter.id}`, type: 'observation',
    title: session.chapter.id === 'intersection' ? '进入路口前未完成前方冲突观察' : '转向前未完成前方冲突观察',
    detail: `操作前缺少近期的${missing}。外后视镜与肩后检查仍各有用途，不能代替前方冲突观察；驶入或转向后再补看不能追认，请从操作前重练。` }, pose);
}

export function recordCourseObservation(session, gaze, pose = session.lastPose) {
  if (session.phase === 'review' || !Object.hasOwn(observationNames, gaze)) return session;
  if (session.chapter.id === 'prepare' && Math.abs(finite(pose.speed)) >= .08) return addError(session, {
    id: 'prepare:moving', type: 'instruction', title: '先停稳，再做停车观察巡查', detail: '上车准备的观察清单只在车辆停住时记录；请先制动停稳。',
  }, pose);
  const sequence = session.sequence + 1;
  const observation = { gaze, elapsed: session.elapsed, sequence, pose: { ...xy(pose), heading: finite(pose.heading) } };
  const next = updateChecks({ ...session, sequence, phase: 'practicing', observations: { ...session.observations, [gaze]: observation },
    observationLog: [...session.observationLog, observation].slice(-120) }, pose);
  return maybeFinish(next, pose);
}

function updateChecks(session, pose) {
  const f = session.flags, id = session.chapter.id, total = session.progress.total;
  const remainingRoute = total - session.startProgress;
  const reached = session.progress.ratio >= .96 && session.stats.travelled >= Math.max(.05, remainingRoute * .72);
  const checks = session.plan.checks.map(item => {
    let done = session.checks.find(c => c.id === item.id)?.done || false;
    if (item.gaze) {
      const observation = session.observations[item.gaze];
      if (hasZoneObservation(id) && frontConflictViews.includes(item.gaze)) {
        done = Boolean(session.speedZone?.observedViews?.[item.gaze] || !session.speedZone?.observationClosed && validZoneObservation(session, observation));
        return { ...item, done };
      }
      if (hasFrontConflictGate(id) && frontConflictViews.includes(item.gaze)) {
        done = f.frontConflictChecked ? Boolean(f.frontConflictViews?.[item.gaze])
          : Boolean(observation && session.elapsed - observation.elapsed <= 14);
        return { ...item, done };
      }
      const after = item.id.startsWith('after-yield:') ? f.yieldStopSequence
        : id === 'pull-over' && ['left', 'left-back'].includes(item.gaze) ? f.pullStopSequence
          : id === 'side-parking' && ['left', 'left-back'].includes(item.gaze) ? f.sideStopSequence : -Infinity;
      const beforeRestart = !item.id.startsWith('after-yield:') || !f.yieldRestartAttempted || observation?.sequence < f.yieldRestartSequence;
      done ||= Boolean(observation && after !== null && observation.sequence > after && beforeRestart);
    }
    else if (item.id.startsWith('light:')) done ||= Number(item.id.slice(6)) < session.lightIndex;
    else if (item.id === 'route') done ||= reached;
    else if (item.id === 'stable') done ||= reached && Math.abs(pose.steer) < .045 && Math.abs(wrap(pose.heading - session.reference.at(-1).heading)) < 12 * RAD
      && (id !== 'straight' || session.stats.maxDeviation <= .9 && session.stats.maxSteer <= 12 * RAD);
    else if (item.id === 'stop') done ||= reached && Math.abs(pose.speed) < .08;
    else if (item.id === 'reverse') done ||= f.reversed;
    else if (item.id === 'bay-stops') done ||= f.bayStops >= 2;
    else if (item.id === 'hill-stop') done ||= f.hillStopped;
    else if (item.id === 'hill-start') done ||= f.hillRestarted;
    else if (item.id === 'side-stop') done ||= f.sideStopped;
    else if (item.id === 'left-signal') done ||= f.leftSignal;
    else if (item.id === 'right-signal') done ||= f.rightSignal;
    else if (item.id === 'left-change') done ||= f.leftChange;
    else if (item.id === 'right-change') done ||= f.rightChange;
    else if (item.id === 'turn-left') done ||= f.turnLeft;
    else if (item.id === 'turn-right') done ||= f.turnRight;
    else if (item.id === 'start') done ||= f.started && f.startObserved;
    else if (item.id === 'yield-stop') done ||= f.yieldStopped;
    else if (item.id === 'restart') done ||= f.restarted;
    else if (item.id === 'slow-zone') done = Boolean(f.zoneSlow && !session.speedZone?.violated);
    else if (item.id === 'accelerate') done ||= f.accelerated;
    else if (item.id === 'decelerate') done ||= f.decelerated;
    else if (item.id === 'night-low') done ||= f.nightLow;
    else if (item.id === 'pull-stop') done ||= f.pullStopped;
    else if (item.id === 'parking-brake') done ||= f.pullStopped && f.parkingBrake;
    return { ...item, done };
  });
  return { ...session, checks, currentTask: checks.find(item => !item.done) || null };
}
function insideSideBay(pose, chapter) {
  const bay = chapter.scene?.bay || { x: -3.2, z: -7, width: 2.6, length: 7 };
  return corners(pose).every(p => p.x > bay.x - bay.width / 2 && p.x < bay.x + bay.width / 2 && p.z > bay.z - bay.length / 2 && p.z < bay.z + bay.length / 2);
}
function parkedInSideBay(pose, chapter) {
  return Math.abs(pose.speed) < .08 && Math.abs(wrap(pose.heading)) < 8 * RAD && insideSideBay(pose, chapter);
}

export function stepCoursePractice(session, { driving = null, pose = driving, input = {}, gaze, dt = 0, events = [] } = {}) {
  if (session.phase === 'review' || !pose || ![pose.x, pose.z, pose.heading, pose.speed].every(Number.isFinite)) return session;
  const delta = clamp(finite(dt), 0, .25), previous = session.lastPose;
  const ds = Math.hypot(pose.x - previous.x, pose.z - previous.z);
  const projection = projectToRoute(session.reference, pose, session.progress.distance);
  const nextDistance = projection.distance < 4 && Math.abs(wrap(pose.heading - projection.heading)) < 100 * RAD
    ? Math.max(session.progress.distance, projection.s) : session.progress.distance;
  const total = session.progress.total, span = Math.max(.01, total - session.startProgress);
  let next = { ...session, phase: 'practicing', elapsed: session.elapsed + delta, sequence: session.sequence + 1,
    progress: { distance: nextDistance, total, ratio: total > 1 ? clamp((nextDistance - session.startProgress) / span, 0, 1) : 0, remaining: Math.max(0, total - nextDistance) },
    stoppedFor: Math.abs(pose.speed) < .08 ? session.stoppedFor + delta : 0,
    flags: { ...session.flags }, stats: { ...session.stats }, lastPose: clone(pose) };
  const f = next.flags, id = next.chapter.id;
  next.stats.travelled += ds; next.stats.peakSpeedKmh = Math.max(next.stats.peakSpeedKmh, Math.abs(pose.speed) * 3.6);
  if (Number.isFinite(projection.distance)) {
    next.stats.maxDeviation = Math.max(next.stats.maxDeviation, projection.distance);
    if (ds > .01) { next.stats.deviationSum += projection.distance; next.stats.deviationSamples++; }
  }
  // A stationary wheel preset is not a large steering correction in motion.
  // Keeping it in this metric used to make a corrected retry fail forever.
  if (Math.abs(pose.speed) > .5) next.stats.maxSteer = Math.max(next.stats.maxSteer, Math.abs(finite(pose.steer)));
  if (id === 'straight' && Math.abs(pose.steer) > 12 * RAD && Math.abs(pose.speed) > .5) next = addError(next, {
    id: 'straight:large-steering', type: 'instruction', title: '直线行驶中转向幅度过大', detail: '先看远处道路，小幅、及时修正；本次最大转角会保留到复盘，重练可重新检查。',
  }, pose);
  f.reversed ||= pose.speed < -.15 && ds > .0001;
  if (!f.started && Math.abs(pose.speed) > .15 && ds > .0001) {
    f.started = true; f.startObserved = recentlyObserved(next, 'left') && Boolean(next.observations.forward && next.elapsed - next.observations.forward.elapsed <= 14);
    if (id === 'start') {
      f.leftSignal = Boolean(pose.leftSignal);
      if (!f.leftSignal) next = addError(next, { id: 'start:signal', type: 'instruction', title: '起步时没有开启左转向灯', detail: '停住重新确认，先打灯并观察左镜、左后方与前方，再平稳起步。' }, pose);
      if (!f.startObserved) next = addError(next, { id: 'start:observation', type: 'observation', title: '起步前观察动作尚未完成', detail: '本轮尚未记录左镜、左后方盲区及前方视角访问。' }, pose);
    }
  }
  const side = pose.steer > TURN_THRESHOLD ? 'left' : pose.steer < -TURN_THRESHOLD ? 'right' : null;
  const turnEvent = side && Math.abs(finite(previous.steer)) <= TURN_THRESHOLD;
  if (turnEvent) {
    next.actionLog = [...next.actionLog, { kind: 'turn', side, elapsed: next.elapsed, s: nextDistance, pose: { ...xy(pose), heading: pose.heading } }];
  }
  const laneChapter = ['lane-change', 'overtake'].includes(id);
  const forwardMotion = pose.speed > .000001 && ds > .0000001;
  const incomingHeading = next.reference[0].heading, conflict = hasFrontConflictGate(id) ? conflictBounds(next.chapter) : null;
  const turnSign = id === 'right-turn' ? -1 : 1, turnAngle = wrap(pose.heading - incomingHeading) * turnSign;
  const signedYaw = wrap(pose.heading - previous.heading) * turnSign;
  const nearConflict = overlapsBounds(pose, conflict, 2);
  const upstream = conflict && Math.max(...corners(pose).map(point => point.z)) < conflict.start;
  // Small lane-keeping corrections far before (or after) a junction are not
  // its turn. Use the registered incoming road, not an angled takeover eye.
  const actualRoadTurn = roadTurnChapters.includes(id) && forwardMotion && signedYaw > .000001
    && (nearConflict && turnAngle > .015 && (Math.abs(finite(pose.steer)) > .12 || turnAngle > .05) || upstream && turnAngle > .2);
  const resumedConflict = f.frontConflictChecked && f.frontConflictObserved && session.stoppedFor >= .6 && forwardMotion
    && overlapsBounds(pose, conflict);
  if (hasFrontConflictGate(id) && forwardMotion && (!f.frontConflictChecked || resumedConflict)) {
    const entry = id === 'intersection' && Math.max(...corners(pose).map(point => point.z)) >= finite(next.chapter.scene?.junctionZ, 20) - 8;
    if (actualRoadTurn || entry || resumedConflict) next = lockFrontConflictObservation(next, pose);
  }
  const lanePoints = laneChapter ? corners(pose) : [], roadHeading = wrap(pose.heading - (session.laneModel?.source.heading ?? incomingHeading));
  const leftDrift = pose.x > previous.x + .000001, rightDrift = pose.x < previous.x - .000001;
  const leftIntent = laneChapter && leftDrift && (pose.leftSignal && !pose.rightSignal && roadHeading > .015
    || Math.max(...lanePoints.map(point => point.x)) >= (session.laneModel?.source.right ?? Infinity) - .35);
  const rightIntent = laneChapter && rightDrift && (pose.rightSignal && !pose.leftSignal && roadHeading < -.015
    || Math.min(...lanePoints.map(point => point.x)) <= (session.laneModel?.target.left ?? -Infinity) + .35);
  const laneSide = laneChapter && !f.leftManeuverStarted && !f.leftLaneReached && leftIntent ? 'left'
    : laneChapter && f.leftLaneReached && !f.rightManeuverStarted && !f.rightLaneReached && rightIntent ? 'right' : null;
  const roadTurnSide = actualRoadTurn ? id === 'right-turn' ? 'right' : 'left' : null;
  const manoeuvreSide = laneSide || (!laneChapter ? roadTurnChapters.includes(id) ? roadTurnSide : side : null);
  if (manoeuvreSide && Math.abs(pose.speed) > .15 && ds > .0001) {
    const side = manoeuvreSide;
    const expectedSide = ['start', 'left-turn', 'uturn', 'side-parking'].includes(id) ? 'left' : ['right-turn', 'pull-over'].includes(id) ? 'right' : null;
    // Countersteering to straighten the same lane change is not a second
    // manoeuvre and must not demand an opposite indicator or new blind check.
    const laneManoeuvre = Boolean(laneSide);
    const relevant = laneManoeuvre || expectedSide === side && (id !== 'side-parking' || f.sideStopped)
      && !f[`${side}ManeuverStarted`];
    if (relevant) {
      f[`${side}ManeuverStarted`] = true;
      const flag = side === 'left' ? 'leftSignal' : 'rightSignal';
      f[flag] ||= Boolean(pose[`${side}Signal`]);
      if (laneManoeuvre) f[`${side}ManeuverValid`] = Boolean(pose[`${side}Signal`]) && !pose[`${side === 'left' ? 'right' : 'left'}Signal`]
        && recentlyObserved(next, side) && (side === 'left' ? f.sourceLaneSeen : f.leftLaneReached);
      if (!pose[`${side}Signal`] || laneManoeuvre && pose[`${side === 'left' ? 'right' : 'left'}Signal`]) next = addError(next, { id: `turn-signal:${side}`, type: 'instruction', title: `${side === 'left' ? '左' : '右'}转向前未正确开启单侧转向灯`, detail: '转向灯用于提前提示意图；双闪不能代替单侧转向灯，下次先正确打灯并再次观察再进入操作。' }, pose);
      if (!recentlyObserved(next, side)) next = addError(next, { id: `turn-observation:${side}`, type: 'observation', title: `${side === 'left' ? '左' : '右'}侧操作前观察动作不足`, detail: '本轮尚未记录该侧外镜和肩后盲区观察，或观察距离本次操作已过久。' }, pose);
    }
  }
  if (Math.abs(finite(previous.steer)) > .06 && Math.abs(finite(pose.steer)) < .026) {
    next.actionLog = [...next.actionLog, { kind: 'center', side: previous.steer > 0 ? 'left' : 'right', elapsed: next.elapsed, s: nextDistance, pose: { ...xy(pose), heading: pose.heading } }]; f.centered = true;
  }
  const start = session.reference[0], end = session.reference.at(-1);
  const personalHeading = wrap(pose.heading - session.initialPose.heading);
  f.turnLeft ||= personalHeading > .6 && (!roadTurnChapters.includes(id) || f.frontConflictObserved);
  f.turnRight ||= personalHeading < -.6 && (!roadTurnChapters.includes(id) || f.frontConflictObserved);
  if (id === 'lane-change' || id === 'overtake') {
    f.sourceLaneSeen ||= wholeCarInLane(pose, session.laneModel?.source);
    const moving = pose.speed > .15 && ds > .0001;
    for (const side of ['left', 'right']) {
      const firstEntry = !f[`${side}LaneReached`] && moving && (side === 'left' ? f.sourceLaneSeen : f.leftLaneReached)
        && wholeCarInLane(pose, side === 'left' ? session.laneModel?.target : session.laneModel?.source);
      if (!firstEntry) continue;
      f[`${side}LaneReached`] = true;
      const signal = pose[`${side}Signal`] && !pose[`${side === 'left' ? 'right' : 'left'}Signal`], observed = recentlyObserved(next, side);
      f[`${side}Change`] = Boolean(f[`${side}ManeuverValid`] && signal && observed && (side === 'left' || f.leftChange));
      if (!signal || !observed) next = addError(next, { id: `lane-entry:${side}`, type: !observed ? 'observation' : 'instruction',
        title: `${side === 'left' ? '进入目标车道' : '返回原车道'}时操作条件未保持`,
        detail: `${!signal ? '单侧转向灯未保持正确；' : ''}${!observed ? '同侧外镜与肩后观察已缺失或过期；' : ''}在首次全车入道时已记录结果，入道后补灯或补看不能追认，请从操作前重练。` }, pose);
    }
  }
  if (id === 'reverse-parking') {
    const parked = isParked(pose);
    if (parked && !f.bayOccupied && f.reversed) { f.bayStops++; f.bayOccupied = true; }
    if (pose.z > BAY.entrance + 2.5) f.bayOccupied = false;
  }
  if (id === 'side-parking') {
    f.sideApproachSeen ||= !insideSideBay(pose, next.chapter);
    if (!f.sideStopped && f.sideApproachSeen && f.reversed && parkedInSideBay(pose, next.chapter)) { f.sideStopped = true; f.sideStopAt = next.elapsed; f.sideStopSequence = next.sequence; }
  }
  if (id === 'hill-start') {
    const z = finite(next.chapter.scene?.stopZ, 12.25);
    f.hillStopped ||= f.started && Math.abs(pose.z - z) < 1.2 && Math.abs(pose.x) < 1.3 && next.stoppedFor >= .6 && Boolean(pose.parkingBrake || driving?.parkingBrake);
    f.hillRestarted ||= f.hillStopped && pose.z > z + 3 && pose.speed > .2 && !pose.parkingBrake;
  }
  if (id === 'crosswalk') {
    const z = finite(next.chapter.scene?.stopLineZ, 12.6), front = Math.max(...corners(pose).map(p => p.z));
    if (!f.yieldStopped && f.started && front > z - 7 && front < z - .05 && next.stoppedFor >= .6) { f.yieldStopped = true; f.yieldStopAt = next.elapsed; f.yieldStopSequence = next.sequence; }
    // Lock the decision at the FIRST real forward motion. Looking after the
    // crossing can never retroactively make an unobserved restart correct.
    if (f.yieldStopped && !f.yieldRestartAttempted && pose.speed > .000001 && ds > .0000001) {
      f.yieldRestartAttempted = true; f.yieldRestartSequence = next.sequence;
      f.yieldRestartObserved = ['front-left', 'front-right', 'forward'].every(g => observedAfter(next, g, f.yieldStopSequence)
        && next.observations[g].sequence < f.yieldRestartSequence);
      if (!f.yieldRestartObserved) next = addError(next, { id: 'crosswalk:restart-observation', type: 'observation',
        title: '未重新观察就从斑马线前起步',
        detail: '停稳让行后，应先扫视前左方、前右方和正前方，再重新起步。起步后补看不能追认这次操作，请从起步前位置重练。' }, pose);
    }
    f.restarted ||= f.yieldRestartObserved && pose.speed > .3 && pose.z > z + 2;
  }
  next = updateSpeedZone(next, previous, pose, input, delta);
  if (id === 'gears') {
    f.accelerationReady ||= Math.abs(pose.speed) < 5.5;
    f.accelerated ||= f.accelerationReady && Math.abs(pose.speed) >= 5.5 && ds > .0001;
    f.decelerated ||= f.accelerated && Math.abs(pose.speed) <= 1.8 + 1e-6 && Boolean(input.brake || pose.brake);
  }
  f.nightLow ||= pose.lightMode === 'low' && next.stats.travelled > 3;
  if (id === 'pull-over') {
    if (!f.rightManeuverStarted && Math.abs(pose.speed) > .1 && (pose.x < start.x - .04 || wrap(pose.heading - start.heading) < -.015)) {
      f.rightManeuverStarted = true; f.rightSignal = Boolean(pose.rightSignal);
      if (!f.rightSignal) next = addError(next, { id: 'pull-over:signal', type: 'instruction', title: '开始靠边前没有开启右转向灯', detail: '下次先打右灯、看右镜和右后方，再控制车辆靠边。' }, pose);
      if (!recentlyObserved(next, 'right')) next = addError(next, { id: 'pull-over:observation', type: 'observation', title: '开始靠边前观察动作不足', detail: '先看右镜与右后方盲区，再控制车辆靠边。' }, pose);
    }
    if (!f.pullStopped && Math.hypot(pose.x - end.x, pose.z - end.z) < 3 && Math.abs(wrap(pose.heading - end.heading)) < 8 * RAD && next.stoppedFor >= .6 && next.stats.travelled > 15) { f.pullStopped = true; f.pullStopAt = next.elapsed; f.pullStopSequence = next.sequence; }
    f.parkingBrake ||= f.pullStopped && Boolean(pose.parkingBrake || driving?.parkingBrake);
  }
  if (id === 'lights') {
    const currentLight = lightState(pose.lightMode);
    if (Math.abs(pose.speed) >= .08) next = addError(next, { id: 'lights:moving', type: 'instruction', title: '灯光练习时车辆未停稳', detail: '此章先保持车辆静止，再按当前情境选灯。' }, pose);
    if (currentLight !== next.lastLight) {
      if (Math.abs(pose.speed) < .08 && currentLight === lightTasks[next.lightIndex]?.mode) {
        next.lightIndex++;
        next.feedback = { type: 'success', title: '本题灯光操作已记录', detail: lightTasks[next.lightIndex] ? `下一题：${lightTasks[next.lightIndex].label}` : '本段灯光已复位，接下来查看本次复盘。' };
      }
      else if (Math.abs(pose.speed) < .08 && next.lightIndex < lightTasks.length) next = addError(next, { id: `lights:wrong:${next.lightIndex}:${currentLight}`, type: 'instruction', title: '灯光选择与当前情境不符', detail: lightTasks[next.lightIndex].label }, pose);
      next.lastLight = currentLight;
    }
  }
  // Explicit flags rather than current gaze avoid awarding an observation just
  // because the camera happened to be inherited from a previous demonstration.
  if (gaze && input.observationChanged) next = recordCourseObservation(next, gaze, pose);
  for (const event of events || []) next = addError(next, event, pose);
  if (next.elapsed - next.lastTrajectoryTime >= .12 || events?.length) {
    next.trajectory = [...next.trajectory, { ...xy(pose), heading: pose.heading, elapsed: next.elapsed }].slice(-4500);
    next.lastTrajectoryTime = next.elapsed;
  }
  next = updateChecks(next, pose);
  next = withSnapshot(next, driving, pose, id === 'lights' && next.lastLight !== session.lastLight);
  const critical = (events || []).some(event => event.stopRequired || event.stop || event.pause || ['critical', 'danger', 'error'].includes(event.severity)
    || /collision|road-edge|parking-line|off-road|boundary/.test(event.type || '') && !/warning|proximity/.test(event.type || ''));
  if (critical) return finishCoursePractice(next, { reason: 'risk' });
  return maybeFinish(next, pose);
}

function maybeFinish(session, pose) {
  if (session.phase === 'review') return session;
  const stationary = ['prepare', 'lights', 'gears', 'pull-over'].includes(session.chapter.id);
  const allDone = session.checks.length && session.checks.every(item => item.done);
  const endTravel = Math.min(3, session.progress.total - session.startProgress);
  if (allDone || !session.endReviewAcknowledged && !stationary && session.progress.ratio >= .985 && session.stats.travelled > Math.max(.05, endTravel * .95) && session.chapter.id !== 'reverse-parking') return finishCoursePractice(session, { reason: allDone ? 'complete' : 'end' });
  return session;
}
function referenceActions(reference) {
  const result = []; let active = false, lastSide = null;
  for (const p of reference) {
    if (!active && Math.abs(p.steer) > TURN_THRESHOLD) { lastSide = p.steer > 0 ? 'left' : 'right'; result.push({ kind: 'turn', side: lastSide, s: p.s }); active = true; }
    if (active && Math.abs(p.steer) < .026) { result.push({ kind: 'center', side: lastSide, s: p.s }); active = false; }
  }
  return result;
}
function steeringComparison(session) {
  const expected = referenceActions(session.reference);
  return session.actionLog.slice(0, 12).map(action => {
    const candidates = expected.filter(item => item.kind === action.kind && item.side === action.side);
    const match = candidates.reduce((best, item) => !best || Math.abs(item.s - action.s) < Math.abs(best.s - action.s) ? item : best, null);
    if (!match) return { kind: action.kind, label: action.kind === 'turn' ? '转向操作' : '回正操作', judgment: '无对应示范动作', deltaMeters: null };
    const deltaMeters = action.s - match.s;
    return { kind: action.kind, label: action.kind === 'turn' ? '开始转向的位置' : '前轮回正的位置', deltaMeters,
      judgment: Math.abs(deltaMeters) < .7 ? '接近本模型示范位置' : deltaMeters < 0 ? '早于本模型示范位置' : '晚于本模型示范位置' };
  });
}

export function finishCoursePractice(session, { reason = 'manual' } = {}) {
  if (session.phase === 'review') return session;
  const complete = session.checks.length > 0 && session.checks.every(item => item.done), risk = reason === 'risk';
  const needsCorrection = session.errors.some(error => ['instruction', 'observation'].includes(error.type)
    || ['critical', 'danger', 'error'].includes(error.severity) || /collision|road-edge|parking-line|off-road|boundary/.test(error.type) && !/warning|proximity/.test(error.type));
  const outcome = risk || needsCorrection ? 'error' : complete ? 'complete' : 'incomplete';
  const doneCount = session.checks.filter(item => item.done).length, missing = session.checks.filter(item => !item.done);
  // A frame may contain a collision, road departure and a lower-priority edge
  // warning together. Keep every entry, but never let the last warning replace
  // the blocking reason. Prefer an actual impact when multiple risks coexist.
  const blocking = [...session.errors].reverse().filter(error => ['critical', 'danger', 'error'].includes(error.severity)
    || /collision|road-edge|parking-line|off-road|boundary/.test(error.type) && !/warning|proximity/.test(error.type));
  const mainRisk = blocking.find(error => /collision/.test(error.type) && !/warning|proximity/.test(error.type)) || blocking[0];
  const recentCorrection = [...session.errors].reverse().find(error => ['instruction', 'observation'].includes(error.type)) || mainRisk;
  const unfinished = `已完成 ${doneCount} / ${session.checks.length} 项；${missing[0] ? `还需要：${missing[0].label}。` : ''}`;
  const review = { outcome, title: risk ? '先停住，复盘这次风险' : complete && needsCorrection ? '目标已完成，先纠正本次操作' : needsCorrection ? '本次操作需要纠正' : complete ? '本章基础练习达成' : '本次练习尚有未完成项',
    summary: risk ? mainRisk?.detail || mainRisk?.title || '本次出现道路或碰撞风险，先看原因，再从风险前重练。'
      : complete && needsCorrection ? `已完成 ${doneCount} 项目标，但本次仍有操作或观察错误需要纠正；对照原因后重练。`
        : complete ? `已完成 ${doneCount} 项基础任务。这里记录模型内操作，不等于通过实车考试。`
        : needsCorrection ? `${recentCorrection?.title || '本次操作需要纠正'}：${recentCorrection?.detail || '对照本次错误后重新练习。'} ${unfinished}` : unfinished,
    checks: session.checks.map(item => ({ ...item })), errors: clone(session.errors),
    metrics: { duration: session.elapsed, travelled: session.stats.travelled, maxDeviation: session.stats.maxDeviation,
      meanDeviation: session.stats.deviationSamples ? session.stats.deviationSum / session.stats.deviationSamples : 0,
      peakSpeedKmh: session.stats.peakSpeedKmh, observations: session.observationLog.length, steering: steeringComparison(session) },
    limitations: [...session.plan.limitations, '轨迹和转向位置只对照本模型示范；不能把距离差当作实车型号的统一操作点位。'],
    retryAvailable: Boolean(session.retrySnapshot || session.history[0]) };
  return { ...session, phase: 'review', review, currentTask: null, endReviewAcknowledged: session.endReviewAcknowledged || reason === 'end' };
}

/** Restore the complete fixed-tick vehicle snapshot and the learning prefix.
 * The caller keeps its own gaze/mirror settings and leaves driving paused.
 * Clear safety-engine latches in the caller for the new attempt as well. */
export function retryCoursePractice(session, { gaze } = {}) {
  const snapshot = session.retrySnapshot || session.history[0];
  if (!snapshot?.driving) return null;
  const learning = clone(snapshot.learning), driving = clone(snapshot.driving), pose = clone(snapshot.pose);
  driving.stopReason = null;
  let next = { ...session, ...learning, phase: 'ready', attempt: session.attempt + 1, endReviewAcknowledged: false, review: null, errors: [], retrySnapshot: null,
    history: [], lastSnapshotTime: snapshot.elapsed - .15, lastTrajectoryTime: snapshot.elapsed,
    actionLog: session.actionLog.slice(0, learning.actionCount), trajectory: session.trajectory.slice(0, learning.trajectoryCount),
    lastDriving: driving, lastPose: pose, currentTask: learning.checks.find(item => !item.done) || null,
    feedback: { type: 'info', title: '已回到本次操作前', detail: '之前有效的目标进度已保留，确认当前任务后继续。' } };
  delete next.actionCount; delete next.trajectoryCount;
  next = withSnapshot(next, driving, pose, true);
  // Gaze is intentionally not replayed or counted as a new completed check.
  // Keep the passed value for UI convenience only; camera remains caller-owned.
  return { session: next, driving, pose, gaze: gaze || null };
}

/** A voluntary incomplete review can continue in place. Risk/error reviews
 * require a retry, so an unsafe action cannot be dismissed as a new attempt. */
export function resumeCoursePractice(session) {
  if (session?.phase !== 'review' || session.review?.outcome !== 'incomplete') return session;
  const corrected = updateChecks({ ...session, phase: 'practicing', review: null, endReviewAcknowledged: session.endReviewAcknowledged || session.progress.ratio >= .985,
    feedback: { type: 'info', title: '继续完成当前目标', detail: '车辆位置和已完成进度保留；确认观察与操作后继续。' } }, session.lastPose);
  return { ...corrected, currentTask: corrected.checks.find(item => !item.done) || null };
}

export function getCoursePracticeComparison(session) {
  const actual = session.trajectory.map(xy), reference = session.reference.map(xy), all = [...actual, ...reference];
  return { actual, reference, start: actual[0] || null, end: actual.at(-1) || null,
    bounds: { minX: Math.min(...all.map(p => p.x)), maxX: Math.max(...all.map(p => p.x)), minZ: Math.min(...all.map(p => p.z)), maxZ: Math.max(...all.map(p => p.z)) },
    caption: '本次轨迹与本模型示范对照；不是按相同秒数叠放，也不是实考评分。' };
}
