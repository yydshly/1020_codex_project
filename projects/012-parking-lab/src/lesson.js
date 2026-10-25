import { CAR, BAY, COURSE, initialState, stepVehicle, localToWorld, isParked, frontWheelsPast, crossesCourseLine } from './vehicle.js';
import { analyzeSteering } from './steering-coach.js';

// The narration uses observable geometry. Recorded durations only drive the
// animation; they are deliberately never presented as real-car reference points.
export const LESSON_STEPS = [
  { title: '准备：确认前轮越过 A 控制线', action: '调座椅和后视镜，系安全带；在控制线外停稳，确认两个前轮都已越线，再换倒挡。', observe: '先切俯视看 A 控制线与两只前轮。实车点位先在座椅固定后，由教练校准。', risk: '倒车前，两个前轮触地点都应在控制线外。', group: '右倒库' },
  { title: '直线倒车：找到转向参照', action: '半联动稳住低速，方向保持正直。先认入库侧镜中的车身和侧后地面，库线进入后再比较。', observe: '本模型用地面的“转向参照”辅助标记。实车请使用教练按车型、座椅标定的镜沿或肩线点位。', risk: '此时不要照着秒数打方向；确认参照位置。', group: '右倒库' },
  { title: '向右打方向：让车尾进入库口', action: '到达转向参照后，保持低速并向右打足方向。左前角向外摆，车尾向右侧车位靠近。', observe: '先辨认镜内车身与侧后地面。库线或库角进入当前镜域后再比较余量，同时留意外侧车头；俯视用于暂停对照。', risk: '入库侧余量持续缩小时，先停住核对车身与边线，不套用固定距离修方向。', group: '右倒库' },
  { title: '接近顺直：准备主动回正', action: '继续低速倒车，观察两侧车身与库边线的夹角，接近平行时开始回方向。', observe: '判断依据是“车身趋于平行、左右间隙趋于稳定”；不是等车尾到了库底才回。', risk: '回正过晚，车尾还会继续横摆并压向另一侧边线。', group: '右倒库' },
  { title: '回正：前轮归零，直线倒入', action: '主动将方向回正，保持低速倒车。自主练习按 X 或点“回正”；松开 A/D 会保持当前角度。', observe: '观察前轮转角回到 0°，以及两侧车身与库线是否平行；不要只看方向盘图标。', risk: '实车方向盘圈数以所用考试车为准。本原型演示前轮转角。', group: '右倒库' },
  { title: '库内停稳：同时确认车头与车尾', action: '车身全部进入库内后，在停车参照处踩刹车停稳；前端不越库口，后端不越库底线。', observe: '切俯视同时检查前保险杠与库口、后保险杠与库底。侧镜中的停车点位需要实车校准。', risk: '这是规定的库内停车。只完成这一侧，还未完成整个考试项目。', group: '右倒库' },
  { title: '出库到 B 端：先出库，再转向', action: '停稳换前进挡；先直线出库，确认车身与库角有空间后向左出库，前往 B 端。', observe: '观察前轮和车身逐渐离开库口，防止过早转向时后轮或车尾挤线。', risk: '到 B 端后，两前轮都应越过 B 控制线，再停稳换倒挡。', group: '换边' },
  { title: 'B 端准备：确认两前轮越线', action: '确认两个前轮触地点均已驶过 B 控制线，停稳，换倒挡，准备左倒库。', observe: '俯视核对前轮与 B 控制线的位置。方向和左右参照与第一侧互为镜像。', risk: '未越过控制线就倒车，是专项不合格情形。', group: '左倒库' },
  { title: '左倒库：观察、转向、主动回正', action: '低速直倒，到标定参照后向左打方向；车身趋于平行时主动回正，继续直线倒入。', observe: '把右倒库的观察顺序换到左侧，左右镜都要检查。可暂停或拖动时间轴看回正时刻。', risk: '仍以车身和边线关系判断，不机械照搬右侧的屏幕点位。', group: '左倒库' },
  { title: '左侧停稳：检查车身全部入库', action: '车身顺直且完全进入库内后，在停车参照处踩刹车停稳。', observe: '检查两侧余量、车头不突出库口、车尾未越底线。', risk: '库内停稳后还需要出库，回到起始端，整个流程才完整。', group: '左倒库' },
  { title: '出库返回 A 端：完成完整路线', action: '停稳换前进挡，先直出再向右转，前往 A 端并停稳。', observe: '看前后轮与库角的间隙；回正后直行至 A 端控制线外。', risk: '完整倒车入库项目限时 210 秒，进退途中停车每次扣 5 分；教学暂停不表示实考允许这样停。', group: '返回起点' },
  { title: '示范结束：切回自己练习', action: '已展示两侧倒库、换边与回到起点。可重新播放任一步，或切回自主练习从 A 端开始。', observe: '建议先练看镜、库角余量和主动回正，再逐渐关闭轨迹辅助。', risk: 'C1 点位与方向专项。离合脚感、换挡联锁、熄火与真实考场感应不在本原型内模拟。', group: '完成' },
];

const DT = 1 / 120;
function buildRightEntry() {
  let state = initialState();
  const frames = [{ ...state, step: 0 }];
  const boundaries = [0];
  function run(step, input, done, maximum = 50) {
    let elapsed = 0;
    do {
      state = stepVehicle(state, { speedLimit: 0.7, ...input }, DT);
      frames.push({ ...state, step });
      elapsed += DT;
      if (elapsed > maximum) throw new Error(`Demonstration segment ${step} could not reach its target`);
    } while (!done(state));
    boundaries.push(frames.length - 1);
  }
  // Overshoot during active return-to-centre is integrated in the same model.
  const remainingYaw = 0.7 / CAR.wheelbase * -Math.log(Math.cos(CAR.maxSteer)) / 2.5;
  run(1, { reverse: true }, s => s.x >= -4.05);
  run(2, { reverse: true, right: true }, s => s.heading >= -Math.PI / 4);
  run(3, { reverse: true, right: true }, s => s.heading >= -remainingYaw);
  run(4, { reverse: true, center: true }, s => Math.abs(s.steer) < 1e-8);
  run(5, { reverse: true }, s => s.z <= -5.22);
  // Include the actual braking distance before the prescribed stop.
  while (Math.abs(state.speed) > 0) {
    state = stepVehicle(state, { brake: true }, DT);
    frames.push({ ...state, step: 5 });
  }
  boundaries[boundaries.length - 1] = frames.length - 1;
  // Calibrate only the model's starting lateral position, so both mirrored
  // manoeuvres meet at the same parked position. No pose is teleported on screen.
  const lateralOffset = state.x;
  for (const frame of frames) frame.x -= lateralOffset;
  return { frames, boundaries };
}

export function createDemonstration() {
  const right = buildRightEntry();
  const frames = right.frames.map(frame => ({ ...frame }));
  const stops = [...right.boundaries];
  const mirror = s => ({ ...s, x: -s.x, heading: -s.heading, steer: -s.steer });
  const append = (source, step, reverseTime = false, mirrored = false) => {
    const list = reverseTime ? [...source].reverse() : source;
    for (let i = 1; i < list.length; i++) {
      const pose = mirrored ? mirror(list[i]) : list[i];
      const prev = frames.at(-1);
      frames.push({ ...pose, speed: (reverseTime ? -1 : 1) * pose.speed, time: prev.time + DT, distance: prev.distance + Math.hypot(pose.x - prev.x, pose.z - prev.z), step });
    }
  };
  append(right.frames, 6, true, true);
  frames.at(-1).speed = 0; frames.at(-1).step = 7; stops.push(frames.length - 1); stops.push(frames.length - 1);
  // Left entry includes the same internal return-to-centre manoeuvre.
  append(right.frames, 8, false, true);
  frames.at(-1).step = 9; frames.at(-1).speed = 0; stops.push(frames.length - 2); stops.push(frames.length - 1);
  append(right.frames, 10, true, false);
  frames.at(-1).speed = 0; stops.push(frames.length - 1); stops.push(frames.length - 1);
  const starts = [0, ...stops.slice(0, -1)];
  return { frames, starts, stops, duration: frames.at(-1).time, turnMarker: right.frames[right.boundaries[1]].x, dt: DT };
}

export function createProgress() { return { phase: 0, started: false, checkedA: false, passedB: false, wrongSequence: false, crossedLine: false, overTime: false }; }
export function advanceProgress(progress, previous, next) {
  const p = { ...progress };
  if (Math.abs(next.speed) > 0.04) p.started = true;
  if (!p.started) return p;
  p.crossedLine ||= crossesCourseLine(next);
  p.overTime ||= next.time > COURSE.limitSeconds;
  if (!p.checkedA && next.speed < -0.04) { p.checkedA = true; p.wrongSequence ||= !frontWheelsPast(next, 'a'); }
  if (p.phase === 0 && isParked(next)) p.phase = 1;
  else if (p.phase === 1) {
    p.passedB ||= frontWheelsPast(next, 'b');
    if (next.speed < -0.04 && previous.speed >= -0.04 && next.z > BAY.entrance + 1) {
      if (p.passedB && frontWheelsPast(next, 'b')) p.phase = 2;
      else p.wrongSequence = true;
    }
  } else if (p.phase === 2 && isParked(next)) p.phase = 3;
  else if (p.phase === 3 && frontWheelsPast(next, 'a') && Math.abs(next.speed) < 0.03) p.phase = 4;
  return p;
}
export function clearance(state) {
  const rear = localToWorld(state, 0, -CAR.rearOverhang);
  const front = localToWorld(state, 0, CAR.length - CAR.rearOverhang);
  return { rear: rear.z - BAY.back, front: BAY.entrance - front.z };
}
export function practiceCue(state, progress, turnMarker, options = {}) {
  if (progress.phase === 1) return frontWheelsPast(state, 'b')
    ? { action: '两前轮已越 B 控制线；停稳后再开始左倒库', observe: '确认两个前轮都在 B 线外，停稳换倒挡，再重新找左侧转向参照。', step: 0 }
    : { action: '右倒库已停稳；先直出再向左，前往 B 控制线', observe: '先让车身离开库角，再向左出库。到 B 端后两前轮均须越线，不能提前倒车。', step: 0 };
  if (progress.phase === 3) return { action: '左倒库已停稳；先直出再向右，返回 A 端', observe: '留意车身与库角的余量，回到 A 线外停稳，才完成整个路线。', step: 0 };
  if (progress.phase === 4) return { action: '两侧倒库与返回起点已完成，可关闭辅助再练', observe: '本轮路线完成不等于完整 C1 实考合格；还需实车练离合、换挡和考试点位。', step: 2 };
  return analyzeSteering(state, { ...options, side: progress.phase === 2 ? 'left' : 'right', turnMarker });
}
