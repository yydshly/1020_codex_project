import { CAR } from './vehicle.js';
import { createDemonstration } from './lesson.js';
import { createKinematicSampler, keyframePosition, retimedPath } from './course-kinematics.js';

// Teaching chapters have their own named locations. They are not a surveyed
// local test route, and chapter transitions must be shown by the player.
const PI = Math.PI;
const rad = degrees => degrees * PI / 180;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const angle = value => Math.atan2(Math.sin(value), Math.cos(value));
const smooth = t => { t = clamp(t, 0, 1); return t ** 3 * (10 - 15 * t + 6 * t * t); };
const paths = new WeakMap(), samplers = new WeakMap();
const pose = (t, x, z, extra = {}) => ({ t, x, z, y: 0, pitch: 0, heading: 0, speed: 0, steer: 0,
  gear: '1', leftSignal: false, rightSignal: false, brake: false, clutch: false, lightMode: 'off', ...extra });
const cue = (t, title, look, action) => ({ t, title, look, action });

function sampled(duration, position, { reverse = false, gear = '1', decorate = () => ({}) } = {}) {
  const count = Math.ceil(duration * 5);
  const points = Array.from({ length: count + 1 }, (_, i) => {
    const t = duration * i / count;
    const before = position(Math.max(0, t - .02)), point = position(t), after = position(Math.min(duration, t + .02));
    const delta = Math.min(duration, t + .02) - Math.max(0, t - .02);
    const dx = (after.x - before.x) / delta, dz = (after.z - before.z) / delta;
    const heading = Math.atan2(reverse ? -dx : dx, reverse ? -dz : dz);
    return pose(t, point.x, point.z, { ...point, heading, speed: Math.hypot(dx, dz) * (reverse ? -1 : 1), gear,
      ...decorate(t, point) });
  });
  paths.set(points, { position, direction: () => reverse ? -1 : 1 });
  return points;
}
function line(duration, from = -25, to = 65, x = -1.75, extra = {}, speedProfile = null) {
  let position = t => ({ x, z: from + (to - from) * t / duration });
  if (speedProfile) {
    const total = speedProfile.slice(1).reduce((sum, [t, v], i) => sum + (t - speedProfile[i][0]) * (v + speedProfile[i][1]) / 2, 0);
    const scale = (to - from) / total;
    position = t => {
      let distance = 0, velocity = speedProfile.at(-1)[1], acceleration = 0;
      for (let i = 1; i < speedProfile.length; i++) {
        const [at, av] = speedProfile[i - 1], [bt, bv] = speedProfile[i], dt = bt - at;
        const u = clamp((t - at) / dt, 0, 1);
        distance += av * u * dt + (bv - av) * dt * (u - Math.sin(PI * u) / PI) / 2;
        if (t >= at && t <= bt) { velocity = av + (bv - av) * (1 - Math.cos(PI * u)) / 2; acceleration = (bv - av) * PI * Math.sin(PI * u) / (2 * dt); }
      }
      return { x, z: from + distance * scale, dx: 0, dz: velocity * scale, ddx: 0, ddz: acceleration * scale };
    };
  }
  return sampled(duration, position, { decorate: () => extra });
}
function chapter(subject, id, title, sceneType, narration, objective, look, action, risk, poses, cues, scene = {}) {
  const duration = poses.at(-1).t;
  const entry = { id, title, sceneType, kind: id, narrationKey: `course${subject}_${id.replaceAll('-', '_')}`,
    narration, objective, look, action, risk, duration, poses, cues, scene,
    transition: '下一项目切换到独立教学位置；不是原地继续的一条实测考场路线。' };
  if (id !== 'reverse-parking') {
    const path = paths.get(poses) ?? { position: keyframePosition(poses) };
    const sample = createKinematicSampler({ duration, ...path, metadata: t => interpolatePose(poses, duration, t),
      controls: (t, p) => ({
        ...(id === 'hill-start' ? { y: clamp(p.z * .1, 0, 1.8), pitch: p.z > 0 && p.z < 18 ? -Math.atan(.1) : 0 } : {}),
        ...(id === 'gears' ? { clutchState: poses[Math.min(poses.length - 1, Math.floor(t * 5 + 1e-8))].clutch ? 'down' : 'up' } : {}),
        // These two paths keep longitudinal speed steady. A slight decrease
        // in total speed while returning the wheel is lateral motion settling,
        // not an instruction to brake during a normal lane change.
        ...(['lane-change', 'overtake'].includes(id) ? { brake: false, throttle: .18 } : {}),
        ...(id === 'pull-over' ? { rightSignal: t >= 1 && t < 15 } : {}),
      }) });
    entry.poses = poses.map(p => sample(p.t)); samplers.set(entry, sample); samplers.set(entry.poses, sample);
  }
  else {
    const sample = t => interpolatePose(parkingFullPoses, duration, t);
    samplers.set(entry, sample); samplers.set(entry.poses, sample);
  }
  return entry;
}

const demonstration = createDemonstration();
let parkingDistance = 0;
const parkingDistances = demonstration.frames.map((frame, i, frames) => {
  if (i) parkingDistance += Math.sign(frame.speed + frames[i - 1].speed) * Math.hypot(frame.x - frames[i - 1].x, frame.z - frames[i - 1].z);
  return parkingDistance;
});
const parkingFullPoses = demonstration.frames.map((frame, i) => pose(frame.time, frame.x, frame.z, { heading: frame.heading, speed: frame.speed, steer: frame.steer,
    distance: parkingDistances[i],
    gear: frame.speed < -.01 ? 'R' : frame.speed > .01 ? '1' : 'N', brake: Math.abs(frame.speed) < .01,
    clutch: Math.abs(frame.speed) < .1, clutchState: Math.abs(frame.speed) < .01 ? 'down' : 'bite' }));
const parkingPoses = parkingFullPoses.filter((_, i) => i % 24 === 0 || i === parkingFullPoses.length - 1);
// Cues precede the actual inputs. The old stops[] mapping described a turn
// after it was already complete and duplicated the B-end timestamp.
const parkingCues = [
  cue(0, '起点准备', '前轮控制线、车后与两侧', '确认两前轮越线，准备低速倒车'),
  cue(.6, '直倒找参照', '右镜为主，兼顾左镜和车头', '稳定低速，找本车校准的转向参照'),
  cue(3.28, '准备向右打方向', '右镜库角与车尾走势', '参照到位后向右打方向，保持低速'),
  cue(11.8, '观察车身快直', '交替核对两镜中车身与库线', '不要等车身完全平行才回轮'),
  cue(12.4, '主动回正', '两镜车身与库边的夹角', '低速移动中主动回正，随后核对余量'),
  cue(demonstration.frames[demonstration.stops[5]].time, '右侧库内停稳', '车身全部入库与后方余量', '停稳后准备出库'),
  cue(18, '出库换边', '前方、两侧库角与车头外摆', '前进出库，驶向另一端'),
  cue(34.36, 'B 端越线准备', 'B端控制线与两前轮位置', '确认越线，停稳后再换倒挡'),
  cue(35.17, '左倒找参照', '左镜为主，兼顾右镜和车头', '低速直倒，寻找左侧转向参照'),
  cue(38.45, '准备向左打方向', '左镜库角与车尾走势', '参照到位后向左打方向'),
  cue(47.55, '左侧主动回正', '两镜车身与库边的夹角', '车身快直时主动回正，核对两侧余量'),
  cue(demonstration.frames[demonstration.stops[9]].time, '左侧库内停稳', '车身全部入库与后方余量', '确认入库后停稳，再准备驶出'),
  cue(53, '出库回起点', '前方和车头外摆区域', '观察后前进出库，驶回起始端'),
  cue(demonstration.duration, '完整项目结束', '控制线、周围与车辆状态', '回到起始端，停稳结束'),
];

const hillPoses = [pose(0, 0, -14, { clutch: true, clutchState: 'down', brake: true }), pose(2, 0, -14, { clutch: true, clutchState: 'bite' }),
  pose(10, 0, 0, { speed: 1.2, clutchState: 'up' }), pose(20, 0, 12, { y: 1.2, pitch: -Math.atan(.1), speed: 1.2, clutchState: 'up' }),
  pose(21, 0, 12.25, { y: 1.225, pitch: -Math.atan(.1), clutch: true, clutchState: 'down', brake: true, parkingBrake: true }),
  pose(25, 0, 12.25, { y: 1.225, pitch: -Math.atan(.1), clutch: true, clutchState: 'down', brake: true, parkingBrake: true }),
  pose(26, 0, 12.25, { y: 1.225, pitch: -Math.atan(.1), clutch: true, clutchState: 'bite', parkingBrake: true }),
  pose(27, 0, 12.25, { y: 1.225, pitch: -Math.atan(.1), clutch: true, clutchState: 'bite', parkingBrake: false }),
  pose(33, 0, 18, { y: 1.8, speed: 1.2, clutchState: 'up' }), pose(40, 0, 28, { y: 1.8, speed: 1.5, clutchState: 'up' })];

// Parallel-parking S arcs are continuous in position and yaw. Turn changes are
// illustrative front-wheel metadata, not a universal steering-wheel count.
const sideR = 5.3, sideA = .8, sideX = -2 * sideR * (1 - Math.cos(sideA));
const sideArcZ = 4 - 2 * sideR * Math.sin(sideA);
function sidePosition(t) {
  if (t <= 2) return { x: 0, z: 4, heading: 0 };
  if (t <= 8) { const a = sideA * (t - 2) / 6; return { x: -sideR * (1 - Math.cos(a)), z: 4 - sideR * Math.sin(a), heading: a }; }
  if (t <= 14) { const a = sideA * (1 - (t - 8) / 6); return { x: sideX + sideR * (1 - Math.cos(a)), z: sideArcZ + sideR * Math.sin(a), heading: a }; }
  if (t <= 19) return { x: sideX, z: sideArcZ + (-7.2 - sideArcZ) * (t - 14) / 5, heading: 0 };
  if (t <= 22) return { x: sideX, z: -7.2, heading: 0 };
  if (t <= 28) { const a = sideA * (t - 22) / 6; return { x: sideX + sideR * (1 - Math.cos(a)), z: -7.2 + sideR * Math.sin(a), heading: a }; }
  if (t <= 34) { const a = sideA * (1 - (t - 28) / 6); return { x: -sideR * (1 - Math.cos(a)), z: -7.2 + 2 * sideR * Math.sin(sideA) - sideR * Math.sin(a), heading: a }; }
  return { x: 0, z: -7.2 + 2 * sideR * Math.sin(sideA) + (t - 34) * 1.2, heading: 0 };
}
const sidePoses = Array.from({ length: 191 }, (_, i) => {
  const t = i / 5, p = sidePosition(t), moving = t > 2 && t < 19 || t > 22;
  const reverse = t > 2 && t < 19;
  return pose(t, p.x, p.z, { heading: p.heading, speed: moving ? (reverse ? -.71 : .71) : 0,
    steer: t > 2 && t < 8 || t > 28 && t < 34 ? -Math.atan(CAR.wheelbase / sideR) : t > 8 && t < 14 || t > 22 && t < 28 ? Math.atan(CAR.wheelbase / sideR) : 0,
    gear: t <= 19 ? 'R' : t <= 22 ? 'N' : '1', brake: !moving, clutch: !moving, clutchState: moving ? 'bite' : 'down', leftSignal: t >= 19 && t < 34 });
});
const sideTravel = 2 * sideR * sideA + Math.abs(-7.2 - sideArcZ);
paths.set(sidePoses, { direction: t => t < 19 ? -1 : 1,
  position: retimedPath([{ t: 0, s: 0 }, { t: 2, s: 0 }, { t: 8, s: sideR * sideA },
    { t: 14, s: 2 * sideR * sideA }, { t: 19, s: sideTravel }, { t: 22, s: sideTravel },
    { t: 28, s: sideTravel + sideR * sideA }, { t: 34, s: sideTravel + 2 * sideR * sideA },
    { t: 38, s: sideTravel + 2 * sideR * sideA + 4.8 }], sidePosition) });
const curvePoses = sampled(46, t => { const u = t / 46; return { x: 5 * Math.sin(2 * PI * u), z: -20 + 52 * u }; }, {
  decorate: t => { const u = t / 46, dx = 10 * PI * Math.cos(2 * PI * u), ddx = -20 * PI * PI * Math.sin(2 * PI * u);
    return { steer: Math.atan(CAR.wheelbase * 52 * ddx / (dx * dx + 52 * 52) ** 1.5) }; },
});
function anglePosition(t) {
  if (t <= 12) return { x: -.7, z: -16 + 16.7 * t / 12, heading: 0 };
  if (t <= 20) { const a = (t - 12) / 8 * PI / 2; return { x: -.7 + 4.05 * (1 - Math.cos(a)), z: .7 + 4.05 * Math.sin(a), heading: a }; }
  return { x: 3.35 + (t - 20) * 1.2, z: 4.75, heading: PI / 2 };
}
const anglePoses = Array.from({ length: 166 }, (_, i) => { const t = i / 5, p = anglePosition(t);
  return pose(t, p.x, p.z, { heading: p.heading, speed: t < 12 ? 16.7 / 12 : t < 20 ? 4.05 * PI / 16 : 1.2,
    steer: t >= 12 && t <= 20 ? Math.atan(CAR.wheelbase / 4.05) : 0, leftSignal: t >= 8 && t <= 20 }); });
paths.set(anglePoses, { position: retimedPath([{ t: 0, s: 0 }, { t: 12, s: 16.7 },
  { t: 20, s: 16.7 + 4.05 * PI / 2 }, { t: 33, s: 16.7 + 4.05 * PI / 2 + 15.6 }], anglePosition) });

const subject2Chapters = [
  chapter(2, 'reverse-parking', '倒车入库 · 两侧完整路线', 'parking',
    '先确认前轮越过控制线，低速右倒库，车身快直时主动回正，全部入库后停稳。出库到另一端，再左倒库，最后回到起始端。镜内点位需按考试车和座椅校准，不照搬固定秒数。',
    '看完整的两侧倒库、换边及返回起点', '入库侧镜为主，核对另一侧及车头外摆', '控速、按参照转向、主动回正、库内停稳，再换边', '一次入库不是完整项目；本演示不代替车型点位标定。', parkingPoses, parkingCues),
  chapter(2, 'hill-start', '坡道定点停车和起步', 'hill',
    '一挡低速上坡，按本车校准参照控制与右边线的距离和停车位置。停稳后协调离合、加速与制动，建立驱动力再解除驻车制动，平稳起步，防止后溜和熄火。',
    '定点停稳并协调离合、制动完成坡起', '前方停车标线、右边线与车身位置', '低速上坡 → 定点停车 → 建立驱动力 → 平稳起步', '离合位置、动力与停车参照因车型而异；本片只演示顺序。', hillPoses,
    [cue(0, '低速上坡', '看前方与右边线', '一挡，稳定离合与车速'), cue(18, '接近停车参照', '按本车标定点判断停车位置', '提前准备制动'), cue(21, '坡上停稳', '核对位置与周围', '稳住车辆，防止后溜'), cue(25, '准备坡起', '前方可行驶区域', '协调离合、加速和驻车制动'), cue(28, '平稳驶离', '继续看前方及右侧余量', '车辆有稳定驱动力后继续上坡')], { rampStart: 0, rampEnd: 18, rise: 1.8, stopZ: 12.25 }),
  chapter(2, 'side-parking', '侧方停车 · 入位与驶出', 'side',
    '驶到侧方车位前方停稳，换倒挡。先观察右镜和车尾走势，配合小幅调整倒入车位，车身顺直后回正并停稳。驶出前打左转向灯，确认左后方安全，再缓慢驶离，留意车头和后轮余量。',
    '观察右侧车位，完整演示倒入、停稳和驶出', '右镜看车身与库边，左镜及车头兼顾', '前方准备 → 倒入 → 回正停稳 → 观察打灯驶出', '不能只盯一面镜；驶出前确认侧后方与车头空间。', sidePoses,
    [cue(0, '车位前方准备', '右镜认车位，确认两侧与后方', '停稳换倒挡'),
      cue(2, '车尾向车位转入', '右镜车尾与侧线', '低速右打方向'),
      cue(8, '调整入位姿态', '交替看两镜与车头', '配合反向回轮，使车身顺直'),
      cue(14, '入库前轮回中', '两镜车身与库边的平行关系', '车身顺直后前轮回中，保持低速直倒'),
      cue(19, '库内停稳并准备驶出', '核对前后与两侧余量，再看左后方', '踩稳制动、确认前轮回正，打左转向灯'),
      cue(22, '观察后驶出', '左镜、左后方和前方', '确认安全后向左转向，缓慢驶离'),
      cue(28, '驶出向右回轮', '前方车道、右镜与车头余量', '向右回轮，使车身逐渐顺直'),
      cue(34, '出库前轮回中', '前方道路与两侧余量', '车身顺直后前轮回中，关闭转向灯')], { bay: { x: -3.2, z: -7, width: 2.6, length: 7 } }),
  chapter(2, 'curve-driving', '曲线行驶 · S 弯', 'curve',
    '低速进入曲线，视线向前看道路走向，兼顾两侧边线和后轮轨迹。转向要连续、适量，随着弯道逐步回轮和换向。车头进入下一弯不代表后轮已经过弯，避免只盯近处和猛打方向。',
    '连续通过左右曲线，理解前后轮轨迹差', '向前看道路走向，核对两侧边线', '稳定低速，随弯道连续转向和回轮', '后轮仍会切向弯内；不要车头一过弯就急着回正。', curvePoses,
    [cue(0, '进入曲线', '向前看第一弯与两侧边线', '稳定低速'), cue(10, '随第一弯转向', '兼顾后轮与内侧线', '连续、适量调整方向'), cue(23, '过渡到另一弯', '先看下一段道路走向', '逐步回轮再换向'), cue(36, '准备驶出', '核对后轮已经离开弯心', '逐渐回正，继续低速')], { centerline: { type: 'sine', amplitude: 5, startZ: -20, endZ: 32 }, width: 3.5 }),
  chapter(2, 'right-angle', '直角转弯', 'angle',
    '低速接近直角，先看出口方向，按本车标定参照开始转向。转弯中留意内侧后轮和外侧车头，确认车身逐渐通过拐角。接近出口方向时主动回轮，车身顺直后沿出口驶离。',
    '看清拐角，避免内轮切线与车头外摆越线', '出口方向、内侧后轮区域及外侧车头', '提前观察 → 按参照转向 → 逐渐回正驶出', '车头已转出不代表后轮已经通过；点位不是统一方向盘圈数。', anglePoses,
    [cue(0, '接近直角', '看出口与内外侧边线', '低速，提前判断转向位置'), cue(10, '准备转向', '使用本车已校准参照', '稳住速度'), cue(12, '沿拐角转弯', '内侧后轮与外侧车头', '适量转向，持续核对空间'), cue(20, '沿出口回正', '前方出口及两侧余量', '主动回方向，顺直驶出')], { radius: 4.05, turnStartX: -.7, turnStartZ: .7, exitCenterZ: 5.1, width: 3.5 }),
];

const stationary = (duration, extra = {}) => [pose(0, -1.75, -22, { gear: 'N', brake: true, parkingBrake: true, ...extra }),
  pose(duration, -1.75, -22, { gear: 'N', brake: true, parkingBrake: true, ...extra })];
const lightsCues = [cue(0, '听完整指令再操作', '仪表与灯光开关', '车辆停稳，等待口令'),
  cue(4, '夜间有路灯、照明良好', '近光指示', '使用近光灯'), cue(8, '照明不良的道路', '远光指示与前方', '确认无影响他人时使用远光'),
  cue(12, '夜间会车', '对向车辆及灯光指示', '及时改用近光'), cue(16, '通过急弯、坡路等', '前方环境与灯光指示', '按需要交替使用远近光示意'),
  cue(20, '同方向近距离跟车', '前车及灯光指示', '使用近光，避免眩目'), cue(24, '故障妨碍交通且难以移动', '危险报警闪光灯与示廓灯', '按规定开启示廓灯和危险报警闪光灯'),
  cue(28, '模拟结束', '仪表与灯光开关', '按口令关闭并复位')];
const lightModes = ['off', 'low', 'high', 'low', 'flash', 'low', 'hazard', 'off'];
const lightsPoses = lightsCues.map((item, i) => pose(item.t, -1.75, -22, { gear: 'N', brake: true, parkingBrake: true, lightMode: lightModes[i] }));
lightsPoses.push(pose(32, -1.75, -22, { gear: 'N', brake: true, parkingBrake: true, lightMode: 'off' }));

const startPoses = [pose(0, -2.3, -25, { gear: 'N', brake: true, clutch: true, clutchState: 'down', parkingBrake: true }),
  pose(3, -2.3, -25, { gear: '1', leftSignal: true, clutch: true, clutchState: 'down', brake: true, parkingBrake: true }),
  pose(6, -2.3, -25, { gear: '1', leftSignal: true, clutch: true, clutchState: 'bite' }),
  pose(10, -1.75, -19, { speed: 2, gear: '1', leftSignal: true, steer: .08, clutchState: 'up' }),
  pose(16, -1.75, 0, { speed: 3.5, gear: '2', clutchState: 'up' }), pose(21, -1.75, 20, { speed: 4.5, gear: '2', clutchState: 'up' })];
const gearSpeedKeys = [[0, 1.6], [5, 3], [10, 5], [18, 5.8], [25, 3], [32, 1.8]];
const gearPoses = Array.from({ length: 161 }, (_, i) => {
  const t = i / 5; let distance = 0, speed = gearSpeedKeys[0][1];
  for (let j = 1; j < gearSpeedKeys.length; j++) {
    const [aT, aV] = gearSpeedKeys[j - 1], [bT, bV] = gearSpeedKeys[j];
    const elapsed = clamp(t - aT, 0, bT - aT), acceleration = (bV - aV) / (bT - aT);
    distance += aV * elapsed + acceleration * elapsed * elapsed / 2;
    if (t >= aT && t <= bT) speed = aV + acceleration * elapsed;
  }
  return pose(t, -1.75, -25 + distance, { speed,
    gear: t < 5 ? '1' : t < 10 ? '2' : t < 18 ? '3' : t < 25 ? '2' : '1',
    clutch: [5, 10, 18, 25].some(at => Math.abs(t - at) < .4) });
});
const lanePoses = sampled(25, t => ({ x: t < 5 ? -5.25 : t < 11 ? -5.25 + 3.5 * smooth((t - 5) / 6) :
  t < 16 ? -1.75 : t < 22 ? -1.75 - 3.5 * smooth((t - 16) / 6) : -5.25, z: -25 + 3.6 * t }),
  { gear: '2', decorate: t => ({ leftSignal: t < 11, rightSignal: t >= 13 && t < 22 }) });
function turnPoses(side) {
  const left = side === 'left', R = left ? 9.5 : 6.25, startZ = left ? 12.25 : 12, sign = left ? 1 : -1;
  const position = t => {
    if (t <= 14) return pose(t, -1.75, -25 + (startZ + 25) * t / 14,
      { speed: 2.66, gear: '2', leftSignal: left, rightSignal: !left, lightMode: 'off' });
    if (t <= 24) { const a = (t - 14) / 10 * PI / 2;
      return pose(t, -1.75 + sign * R * (1 - Math.cos(a)), startZ + R * Math.sin(a),
        { heading: sign * a, speed: R * PI / 20, steer: sign * Math.atan(CAR.wheelbase / R), gear: '2', leftSignal: left, rightSignal: !left }); }
    return pose(t, -1.75 + sign * R + sign * (t - 24) * 2.5, startZ + R,
      { heading: sign * PI / 2, speed: 2.5, gear: '2' });
  };
  const points = Array.from({ length: 181 }, (_, i) => position(i / 5));
  paths.set(points, { position: retimedPath([{ t: 0, s: 0 }, { t: 14, s: startZ + 25 },
    { t: 24, s: startZ + 25 + R * PI / 2 }, { t: 36, s: startZ + 25 + R * PI / 2 + 30 }], position) });
  return points;
}
const crossingPoses = [pose(0, -1.75, -25, { speed: 4.5, gear: '2' }), pose(7, -1.75, 7, { speed: 2, gear: '1', brake: true }),
  pose(9, -1.75, 8.8, { gear: '1', brake: true, clutch: true }), pose(14, -1.75, 8.8, { gear: '1', brake: true, clutch: true }),
  pose(20, -1.75, 25, { speed: 3, gear: '2' }), pose(28, -1.75, 60, { speed: 4.5, gear: '2' })];
const schoolPoses = [pose(0, -1.75, -25, { speed: 5.5, gear: '3' }), pose(6, -1.75, -2, { speed: 3, gear: '2', brake: true }),
  pose(17, -1.75, 31, { speed: 3, gear: '2' }), pose(25, -1.75, 65, { speed: 4.5, gear: '2' })];
const busPoses = [pose(0, -1.75, -25, { speed: 4.5, gear: '2' }), pose(8, -1.75, 8, { speed: 2.5, gear: '2', brake: true }),
  pose(14, -1.75, 23, { speed: 2.5, gear: '2' }), pose(24, -1.75, 62, { speed: 4, gear: '2' })];
const overtakePoses = sampled(32, t => ({ x: t < 5 ? -5.25 : t < 11 ? -5.25 + 3.5 * smooth((t - 5) / 6) :
  t < 23 ? -1.75 : t < 29 ? -1.75 - 3.5 * smooth((t - 23) / 6) : -5.25, z: -28 + 4.1 * t }),
  { gear: '3', decorate: t => ({ leftSignal: t < 11, rightSignal: t >= 20 && t < 29 }) });
const uturnPosition = t => {
  if (t <= 12) return pose(t, -1.75, -25 + 33 * t / 12, { speed: 2.75, gear: '2', leftSignal: true });
  if (t <= 25) { const a = (t - 12) / 13 * PI; return pose(t, -1.75 + 4.8 * (1 - Math.cos(a)), 8 + 4.8 * Math.sin(a),
    { heading: a, speed: 4.8 * PI / 13, steer: Math.atan(CAR.wheelbase / 4.8), gear: '1', leftSignal: true }); }
  return pose(t, 7.85, 8 - (t - 25) * 2.7, { heading: PI, speed: 2.7, gear: '2' });
};
const uturnPoses = Array.from({ length: 181 }, (_, i) => uturnPosition(i / 5));
paths.set(uturnPoses, { position: retimedPath([{ t: 0, s: 0 }, { t: 12, s: 33 },
  { t: 25, s: 33 + 4.8 * PI }, { t: 36, s: 33 + 4.8 * PI + 29.7 }], uturnPosition) });
const nightBasePoses = line(32, -25, 95, -1.75, { lightMode: 'low', gear: '2' }, [[0, 4.4], [6, 3.8], [16, 3.2], [20, 3.2], [32, 4.3]]);
const nightPoses = nightBasePoses.map(p => ({ ...p,
  lightMode: p.t < 6 ? 'high' : p.t < 17 ? 'low' : p.t < 19 ? 'flash' : 'low', brake: p.t >= 16 && p.t < 20 }));
paths.set(nightPoses, paths.get(nightBasePoses));
const pullPoses = [pose(0, -1.75, -25, { speed: 4, gear: '2', rightSignal: true }), pose(4, -1.75, -10, { speed: 3, gear: '2', rightSignal: true }),
  pose(8, -2.3, 1, { speed: 2, gear: '1', rightSignal: true, heading: -.08, steer: -.08 }),
  pose(12, -2.3, 7, { gear: '1', rightSignal: true, brake: true, clutch: true }),
  pose(15, -2.3, 7, { gear: 'N', brake: true, parkingBrake: true, clutch: true }),
  pose(20, -2.3, 7, { gear: 'N', brake: true, parkingBrake: true }),
  pose(26, -2.3, 7, { gear: 'N', brake: true, parkingBrake: true, engineOff: true, exitCheck: true })];

const subject3Chapters = [
  chapter(3, 'prepare', '上车准备', 'prepare',
    '上车前观察车辆四周和车底，检查车身、轮胎及周围风险。确认安全后上车，关好车门，调整座椅和后视镜，系好安全带，检查仪表、挡位与驻车制动。准备项目按当地考试设备要求完成。',
    '从车外检查到固定驾驶位，建立观察习惯', '车辆四周、车底、轮胎及左右后方', '绕车检查 → 安全上车 → 调整座椅镜面 → 系安全带', '不要机械照搬绕车按钮位置；上车与开门前均需观察。', stationary(22),
    [cue(0, '绕车检查', '车辆四周、车底和轮胎', '观察周围风险，检查车况'),
      cue(7, '安全开门', '来车方向与左后方', '确认安全后规范开门上车'),
      cue(9, '关好车门', '门锁与车门状态', '确认车门已经完全关闭'),
      cue(11, '调整座椅', '踏板距离、方向盘与前方视野', '固定座椅，确认能够踩到底并看清前方'),
      cue(14, '调整后视镜', '左右后视镜的车身与后方道路', '按固定坐姿调整镜面，核对观察范围'),
      cue(17, '系好安全带', '安全带锁扣与肩带位置', '规范系好，确认锁扣扣紧'),
      cue(20, '检查车辆状态', '仪表、挡位与驻车制动', '确认空挡、驻车状态和仪表，无异常再开始')]),
  chapter(3, 'lights', '模拟夜间灯光', 'lights',
    '车辆停稳后听完整指令，再操作灯光。照明良好、会车和近距离跟车用近光；照明不良且不影响他人时按需用远光。按场景交替远近光示意，故障难以移动时按规定示警。模拟结束按口令复位。',
    '看清常见灯光题型的操作与指示变化', '灯光开关、仪表指示和口令场景', '听完整口令 → 选择灯光 → 确认指示 → 结束复位', '本章演示常见类型，不预设当地随机出题顺序。', lightsPoses, lightsCues),
  chapter(3, 'start', '起步', 'start',
    '起步前检查挡位和制动，打左转向灯，观察左镜、左后方及前方，确认安全。踩离合挂一挡，协调离合与加速，解除驻车制动，平稳进入车道，车辆顺直后关闭转向灯。',
    '观察、打灯、挂挡与平稳起步完整衔接', '左镜、左后方及前方车流', '检查 → 左转向灯 → 观察 → 一挡平稳起步', '打灯不等于取得优先权；先让已有正常车流通行。', startPoses,
    [cue(0, '起步前检查', '挡位、制动和仪表', '踩稳制动，准备起步'), cue(3, '打灯并观察', '左镜、左后方和前方', '左转向灯，确认有足够空间'), cue(6, '平稳起步', '前方行驶方向', '一挡，协调离合和加速，解除驻车制动'), cue(12, '进入车道', '前方及两侧环境', '车辆顺直后关闭转向灯')]),
  chapter(3, 'straight', '直线行驶', 'straight',
    '视线放远，兼顾近处道路、左右后视镜和车速。保持车道内稳定行驶，按道路情况合理控制速度和挡位。发现偏移时小幅、及时修正，不死盯方向盘，也不要用大幅来回转向纠偏。',
    '以远方道路建立方向感，小幅及时修正', '远处道路走向、近处风险和后视镜', '视线放远，稳定速度与方向', '不能长时间盯一处；方向盘保持不动不等于能始终直行。', line(26, -25, 95, -1.75, { gear: '2' }),
    [cue(0, '建立远方参照', '看远处道路走向', '稳住车速与挡位'), cue(8, '兼顾近处和后视镜', '前车、路侧及镜中变化', '保持安全距离'), cue(17, '小幅及时修正', '回看行驶方向', '轻微调整后及时回正')]),
  chapter(3, 'gears', '加减挡位操作', 'gears',
    '根据路况和车速合理加减挡。换挡前确认条件，离合踩到底，按正确挡位路径操作，协调离合和加速使车辆平顺。减速后选择匹配挡位，不低头找挡，也不机械追求统一换挡时速。',
    '看懂加挡、减挡及离合配合顺序', '前方道路、车速和发动机状态', '路况允许再加速加挡，需减速时合理减挡', '挡位与车速需按实际车辆匹配；示例不是统一考试换挡表。', gearPoses,
    [cue(0, '一挡起步后', '前方道路和车速', '平稳加速'), cue(5, '升入二挡', '保持观察前方', '离合踩到底，正确换挡'), cue(10, '路况允许再加挡', '前方与速度', '协调离合、加速，平顺接合'), cue(18, '提前减速减挡', '前方变化', '先合理减速，再选匹配挡位'), cue(25, '回到低挡', '低速路段', '不拖挡、不低头看挡')]),
  chapter(3, 'lane-change', '变更车道', 'road_lanes',
    '先观察目标车道和后方，打转向灯，确认安全并留足信号提示时间后，小幅平顺变道。进入目标车道后回正并关闭转向灯。每次只完成一条车道的变更，不连续横跨多条车道。',
    '观察、打灯、确认空间后平顺变更一条车道', '目标车道、对应后视镜与侧后盲区', '先看 → 打灯 → 再确认 → 平顺变道 → 关灯', '转向灯不是变道许可；不能妨碍目标车道正常车辆。', lanePoses,
    [cue(0, '观察目标车道', '左镜、左后方与前方', '打开左转向灯，确认空间'),
      cue(5, '平顺向左变道', '前方与左后方空间', '小幅向左转向，一次只变一条车道'),
      cue(8, '向右回轮', '前方车道走向与车身姿态', '向右回轮，使车身逐渐顺直，不继续向左偏'),
      cue(11, '前轮回中', '前方车道与两侧余量', '车身顺直后前轮回中，关闭左转向灯'),
      cue(13, '再次观察准备返回', '右镜、右后方与前方', '打开右转向灯，确认安全空间'),
      cue(16, '平顺向右变道', '前方与右后方空间', '小幅向右转向返回原车道'),
      cue(19, '向左回轮', '前方车道走向与车身姿态', '向左回轮，使车身逐渐顺直'),
      cue(22, '返回后前轮回中', '前方道路与两侧余量', '车身顺直后前轮回中，关闭右转向灯')], { lanes: 4 }),
  chapter(3, 'intersection', '直行通过路口', 'intersection',
    '提前观察交通信号、标志标线、路口两侧和行人，合理减速，按通行规则进入。绿灯也要确认路口可以安全通过，不抢黄灯、不闯红灯，不在拥堵时贸然驶入路口。通过后继续观察。',
    '观察路口冲突，按信号与优先规则直行', '信号、左右道路、行人及前方出口', '提前观察减速 → 确认通行条件 → 安全通过', '本片是允许通行场景；绿灯不表示可忽略行人或堵住路口。', line(30, -25, 75, -1.75, { gear: '2' }, [[0, 4], [8, 2.4], [15, 2.4], [23, 3.8], [30, 4]]),
    [cue(0, '提前识别路口', '交通信号与路口两侧', '合理减速'), cue(8, '进入前再次确认', '行人、横向车辆及出口空间', '确认允许通行且出口畅通'), cue(15, '稳定通过路口', '看行驶方向，兼顾两侧冲突', '不突然加速、不抢行'), cue(23, '驶离后继续观察', '前方道路与车流', '恢复合理行驶节奏')], { junctionZ: 20, signal: 'green' }),
  chapter(3, 'left-turn', '路口左转弯', 'left_turn',
    '提前进入合适车道，打左转向灯，观察信号、对向车辆、左右道路和行人。确认安全后低速转弯，按标线进入正确车道，不切入对向。车身转向出口后逐渐回正，完成转弯再关闭转向灯。',
    '选择正确通行时机，转入正确方向的车道', '信号、对向来车、行人与转弯出口', '提前打灯观察，按规则让行后左转', '不要只盯出口；对向直行车辆和过街行人仍需让行。', turnPoses('left'),
    [cue(0, '提前准备左转', '信号、车道及对向来车', '打左转向灯，合理减速'), cue(10, '确认冲突已解除', '行人、对向车与出口', '按规则让行'), cue(14, '低速完成左转', '看正确出口车道', '连续转向，不切入对向'), cue(24, '转入出口', '确认车身顺直与前方空间', '主动回正、关闭转向灯')], { junctionZ: 20 }),
  chapter(3, 'right-turn', '路口右转弯', 'right_turn',
    '提前打右转向灯，减速观察信号、右侧非机动车、行人与转弯出口。允许右转也不代表优先通行，先让冲突交通通过，再低速转入正确车道，留意右侧后轮轨迹，顺直后关灯。',
    '右转前观察非机动车与行人并让行', '右镜、右侧盲区、行人及出口', '打灯减速 → 观察让行 → 低速右转 → 回正关灯', '不能因无禁止右转标志而忽略信号或行人优先规则。', turnPoses('right'),
    [cue(0, '提前准备右转', '信号及右侧交通', '右转向灯、合理减速'), cue(10, '核对右侧盲区', '非机动车、行人与出口', '确认安全，必要时停车让行'), cue(14, '低速通过转弯', '右后轮附近与出口方向', '转向平顺，不挤占非机动车'), cue(24, '顺直驶离', '前方车道', '回正后关闭转向灯')], { junctionZ: 20 }),
  chapter(3, 'crosswalk', '通过人行横道线', 'crosswalk',
    '提前识别人行横道，减速观察两侧和被遮挡区域。遇行人正在通过时，在停止线前停稳让行，不能催促或绕行抢过。确认行人安全通过、前方畅通后再平稳起步，并继续留意新的行人。',
    '用一次减速、停车让行和再起步演示人行横道', '斑马线两侧、被遮挡区域及行人', '提前减速，行人通过时停稳让行，确认安全再走', '不要只看一个方向；行人可能从停驶车辆旁出现。', crossingPoses,
    [cue(0, '识别人行横道', '看两侧行人与遮挡处', '提前减速'), cue(7, '有行人通过', '斑马线与行人动向', '停止线前平稳停住'), cue(9, '保持让行', '确认行人及另一侧情况', '不催促、不绕行'), cue(14, '重新确认后起步', '行人已安全通过、前方畅通', '平稳起步继续观察')], { crossingZ: 15, stopLineZ: 12.6, pedestrian: true }),
  chapter(3, 'school', '通过学校区域', 'school',
    '提前识别学校区域，减速并提高观察频率，留意儿童、接送车辆和遮挡处。保持足够空间，随时准备停车让行，不能以没有语音提示或暂时看不到行人为由忽略学校区域。',
    '主动识别学校区域与突发风险', '学校标志、路侧儿童、接送车辆和遮挡处', '提前减速，保持观察，随时准备停车让行', '标志与现场环境都要看；不能只等考试语音。', schoolPoses,
    [cue(0, '发现学校区域', '学校标志与路侧环境', '提前减速'), cue(6, '低速经过区域', '儿童、接送车及遮挡处', '稳住低速，准备制动'), cue(15, '持续观察两侧', '行人与前方冲突点', '必要时停住让行'), cue(21, '驶离区域', '确认后方及前方交通', '按道路条件逐步恢复速度')], { schoolStartZ: 0, schoolEndZ: 40 }),
  chapter(3, 'bus', '通过公共汽车站', 'bus',
    '提前识别公交站并减速，观察公交车起步、上下车乘客和车前车后的遮挡区域。留足侧向空间，必要时停车让行，不与起步公交车争道，也不从其盲区内贸然加速通过。',
    '观察公交起步及乘客盲区', '站牌、公交车前后与上下客区域', '提前减速，保持空间，观察并让行', '公交车遮挡处可能出现行人，不能只看站牌。', busPoses,
    [cue(0, '识别公交站', '站牌、公交车和乘客区域', '提前减速'), cue(8, '接近公交车', '车前后遮挡及转向灯', '留出空间，准备让行'), cue(14, '平稳通过', '继续看乘客与车头盲区', '不抢行、不突然加速'), cue(20, '驶离站点', '确认前方道路', '合理恢复行驶速度')], { busStopZ: 20 }),
  chapter(3, 'meeting', '会车', 'meeting',
    '观察对向车辆、道路宽度及两侧空间，合理控制车速和车道位置，保持安全横向间距。道路狭窄或有障碍时，按规则提前让行，不抢道；会车时仍要留意本侧路边行人和非机动车。',
    '与对向车辆保持各自行驶空间', '对向车辆、本侧路边与两车之间的空间', '合理减速，保持本车道和安全横向距离', '不能为了躲对向车而忽略右侧行人或驶出道路。', line(26, -25, 80, -1.75, { gear: '2' }, [[0, 4.5], [9, 3.2], [16, 3.2], [26, 4.5]]),
    [cue(0, '发现对向车', '对向车与道路宽度', '合理减速，保持车道'), cue(9, '接近会车点', '本侧路边与横向间距', '不抢道、不猛打方向'), cue(16, '平稳完成会车', '看前方并兼顾路侧', '保持安全空间')], { oncoming: { x: 1.75, z: 80, speed: 4 } }),
  chapter(3, 'overtake', '超车', 'road_lanes',
    '先判断是否允许超车，再观察前方和左后方，打左转向灯并确认安全。平顺驶入左侧同向车道，保持足够横向间距通过前车。与被超车辆拉开安全距离后，观察右后方，打右灯再返回。',
    '完整演示观察、变道超越及安全返回', '前方条件、左后方，以及超越后的右镜', '确认允许 → 左灯变道 → 留足间距超越 → 右灯返回', '本片在同向双车道演示；不示范越实线、盲弯或路口超车。', overtakePoses,
    [cue(0, '确认允许超车', '前方道路、标线及左后方', '左转向灯，确认目标车道安全'),
      cue(5, '进入左侧同向车道', '前方与被超车辆', '小幅向左转向，保持横向距离'),
      cue(8, '向右回轮', '前方车道与被超车辆', '向右回轮，使车身逐渐顺直'),
      cue(11, '前轮回中并拉开距离', '前方与右镜中的被超车辆', '车身顺直后回中，继续拉开距离，不急着回切'),
      cue(20, '观察准备返回', '右镜与右后方', '打开右转向灯，确认足够安全距离'),
      cue(23, '平顺返回原车道', '前方与右后方', '小幅向右转向，不妨碍被超车辆'),
      cue(26, '向左回轮', '前方车道与车身姿态', '向左回轮，使车身逐渐顺直'),
      cue(29, '返回后前轮回中', '前方道路与两侧余量', '车身顺直后前轮回中，关闭右转向灯')], { lanes: 4, leadVehicle: { x: -5.25, z: 4, speed: 1.2 } }),
  chapter(3, 'uturn', '掉头', 'uturn',
    '提前选择允许掉头且空间充足的位置，打左转向灯，减速观察对向车、行人与非机动车。确认安全后低速掉头，持续核对车头外摆和后轮轨迹，进入正确返回车道，顺直后关灯。',
    '在明确允许的开口内掉头并进入返回车道', '标志标线、对向车、行人及掉头空间', '提前打灯减速 → 观察让行 → 低速掉头 → 顺直关灯', '本片是宽阔允许掉头的专用开口，不可照搬到窄路或禁止位置。', uturnPoses,
    [cue(0, '确认允许掉头', '标志、开口与对向交通', '左转向灯，提前减速'), cue(10, '进入前再次观察', '行人、非机动车与对向车', '确认安全再进入'), cue(12, '低速完成掉头', '车头外摆与后轮轨迹', '转向连续，控制低速'), cue(25, '进入返回车道', '看正确返回方向', '逐步回正，顺直后关灯')], { opening: { left: -8, right: 12, startZ: 0, endZ: 24 } }),
  chapter(3, 'night', '夜间行驶', 'night',
    '夜间按照明和交通条件正确使用灯光，控制在可安全停车的视距内行驶。接近对向车辆及时改近光，避免眩目；通过需示意的路段按规定交替灯光，并持续观察行人与路侧。没有夜间实考时另做模拟灯光。',
    '在动态夜间道路中观察灯光、视距与会车', '前方可见范围、对向车辆、行人与路侧', '按环境用灯，提前减速，避免眩目', '夜间道路片段与静止模拟灯光分别展示；不把本教学距离当实考里程。', nightPoses,
    [cue(0, '照明不良路段', '前方视距及交通环境', '不影响他人时按需使用远光'), cue(6, '提前改为近光', '远处对向车辆与路侧', '及时改用近光，避免眩目'), cue(16, '前方路段需示意', '前方环境与潜在行人', '减速观察，按规定交替灯光'), cue(20, '继续夜间行驶', '可见范围内的道路与行人', '使用近光，保持可停车视距')], { night: true, oncoming: { x: 1.75, z: 180, speed: 3 } }),
  chapter(3, 'pull-over', '靠边停车与安全结束', 'pull_over',
    '听到停车指令后，先观察右镜、右后方和路边条件，打右转向灯，选择允许停车的位置，减速平顺靠边。停稳后按要求操作挡位和驻车制动，关闭转向灯。结束下车前再次观察侧后方，确认安全再开门。',
    '从行驶到观察、靠边停稳与安全下车完整衔接', '右镜、右后方、路缘及停车位置', '右灯观察 → 减速靠边 → 停稳驻车 → 观察后下车', '停车位置与距离按实际标线及要求判断；不压路缘、不忽略开门风险。', pullPoses,
    [cue(0, '接到停车指令', '右镜、右后方与路边', '选择允许停车位置'),
      cue(1, '打灯减速观察', '右镜、右后方与路缘', '打开右转向灯，减速观察并确认空间'),
      cue(4, '向右减速靠边', '右镜、路缘与侧后方', '确认安全后小幅向右转向，平顺靠边'),
      cue(5.786001015, '向左回轮', '前方道路、右镜与车身姿态', '向左回轮，使车身逐渐与路边平行'),
      cue(8, '靠边前轮回中', '车身与路边的平行关系', '车身顺直后前轮回中，继续减速'),
      cue(12, '车辆停稳', '停车位置与周围', '踩稳制动，按要求驻车'),
      cue(15, '整理车辆状态', '挡位、制动与灯光', '驻车制动、空挡，关闭转向灯'),
      cue(20, '安全结束', '左镜与侧后方', '确认安全后再解带开门下车')]),
];

export const EXAM_COURSES = Object.freeze({
  subject2: { id: 'subject2', name: '科目二 · C1 五项全量演示', summary: '倒车入库、坡道定点停车和起步、侧方停车、曲线行驶、直角转弯。',
    scope: '通用项目教学串联；各章切换独立教学位置，不是某地实测考场路线。', chapters: subject2Chapters },
  subject3: { id: 'subject3', name: '科目三 · C1 道路项目全量演示', summary: '上车准备、模拟灯光、起步、各道路项目、夜间行驶，直至靠边停车与安全结束。',
    scope: '覆盖 16 项道路驾驶技能并额外演示模拟灯光；不是当地随机项目顺序、完整实考 3 公里路线或安全文明理论题库。', chapters: subject3Chapters },
});
export const EXAM_NARRATION = Object.freeze(Object.fromEntries(Object.values(EXAM_COURSES).flatMap(course => course.chapters)
  .map(item => [item.narrationKey, { title: item.title, text: item.narration, action: item.action }])));
export const courseDuration = course => course.chapters.reduce((total, item) => total + item.duration, 0);
export function sampleChapterPose(chapter, time) {
  // Controllers may decorate a chapter with teaching steps using {...chapter}.
  // The shared pose array retains the continuous sampler through that copy.
  const sampler = samplers.get(chapter) ?? samplers.get(chapter.poses);
  if (sampler) return sampler(Number.isFinite(time) ? time : 0);
  return interpolatePose(chapter.poses, chapter.duration, time);
}
function interpolatePose(points, duration, time) {
  const t = clamp(Number.isFinite(time) ? time : 0, 0, duration);
  let low = 0, high = points.length - 1;
  while (low + 1 < high) { const mid = (low + high) >> 1; if (points[mid].t <= t) low = mid; else high = mid; }
  if (t >= points.at(-1).t) return { ...points.at(-1), t };
  const a = points[low], b = points[high], u = b.t > a.t ? (t - a.t) / (b.t - a.t) : 0;
  const result = { ...a, t };
  for (const key of ['x', 'y', 'z', 'speed', 'steer', 'pitch', ...(a.distance !== undefined ? ['distance'] : [])]) result[key] = (a[key] ?? 0) + ((b[key] ?? 0) - (a[key] ?? 0)) * u;
  result.heading = angle(a.heading + angle(b.heading - a.heading) * u);
  return result;
}
export function cueAt(chapter, time) { return chapter.cues.reduce((current, item) => item.t <= time ? item : current, chapter.cues[0]); }
