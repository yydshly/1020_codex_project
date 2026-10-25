import { CAR, COURSE, crossesCourseLine, frontWheelsPast } from './vehicle.js';
import { analyzeSteering, centerWindow, observationSpeed, PREVIEW_SECONDS } from './steering-coach.js';

// Shared narration keys let the tour and live coaching use the same recordings.
// These are observation cues for this model, not universal real-car sight points.
export const VOICE_CUES = Object.freeze({
  intro: { title: '准备观察完整路线', text: '先调整座椅和后视镜，确认两个前轮都越过 A 控制线。接下来示范右倒库、换边、左倒库，再返回起点。' },
  straight: { title: '保持方向，直线倒车', text: '方向保持正直，低速倒车。先认右镜中少量车身与侧后地面，库角进入镜面后再比较位置；到本车型校准的转向参照再打方向。' },
  prepare_right: { title: '接近右侧转向参照', text: '接近右侧转向参照，保持方向正直和低速。先认右镜中的车身与侧后地面，库角入镜后再比较，准备向右打方向。' },
  right_turn: { title: '到转向参照，向右打方向', text: '到达模型转向参照，按 D 向右打方向，同时保持低速倒车。先认右镜中的车身与侧后地面，库角入镜后再比较间隙，也留意外侧车头。' },
  hold_right: { title: '右侧方向到位，继续看镜', text: '方向已经到位，保持当前转角，低速倒车。先认右镜中的车身与侧后地面，库角进入镜面后再比较间隙，兼顾左镜和外侧车头。' },
  right_align: { title: '继续看镜，比较两侧间隙', text: '保持当前方向，低速倒入。先认右镜中的车身与侧后地面，库角和库线入镜后再比较间隙，同时对照左镜。' },
  prepare_center_right: { title: '右侧准备回正，交替看镜', text: '准备回正，先看右镜里的车身与库线，再对照左镜。等车身趋于平行，主动回方向。' },
  center: { title: '主动回正，继续观察两侧', text: '车身接近平行，按 X 主动回正。松开转向键会保持转角；回正后低速直倒，继续检查两侧余量。' },
  park: { title: '观察停车参照，库内停稳', text: '继续低速直倒。车身全部入库、车尾到停车参照后，按空格刹车停稳，同时确认车头不突出库口、车尾不越底线。' },
  brake: { title: '到停车位置，刹车停稳', text: '到停车位置了，按空格刹车停稳。确认车头不突出库口，车尾不越底线。' },
  exit_left: { title: '先直出，再向左到 B 端', text: '库内停稳后，按 W 前进。先直线出库，确认车身与库角有空间，再按 A 向左出库，前往 B 控制线。' },
  control_b: { title: '两前轮越过 B 线再倒车', text: '确认两个前轮都已越过 B 控制线，停稳后准备左倒库。前轮没有越线，不能提前倒车。' },
  left_straight: { title: '保持方向，左侧直线倒车', text: '开始左倒库。方向保持正直，低速倒车，先认左镜中少量车身与侧后地面；库角进入镜面后再比较位置，等到本车型校准的转向参照。' },
  prepare_left: { title: '接近左侧转向参照', text: '接近左侧转向参照，保持方向正直和低速。先认左镜中的车身与侧后地面，库角入镜后再比较，准备向左打方向。' },
  left_turn: { title: '到转向参照，向左打方向', text: '到达模型转向参照，按 A 向左打方向，同时保持低速倒车。先认左镜中的车身与侧后地面，库角入镜后再比较间隙，也留意外侧车头。' },
  hold_left: { title: '左侧方向到位，继续看镜', text: '方向已经到位，保持当前转角，低速倒车。先认左镜中的车身与侧后地面，库角进入镜面后再比较间隙，兼顾右镜和外侧车头。' },
  left_align: { title: '继续看镜，比较两侧间隙', text: '保持当前方向，低速倒入。先认左镜中的车身与侧后地面，库角和库线入镜后再比较间隙，同时对照右镜。' },
  prepare_center_left: { title: '左侧准备回正，交替看镜', text: '准备回正，先看左镜里的车身与库线，再对照右镜。等车身趋于平行，主动回方向。' },
  exit_right: { title: '先直出，再向右返回 A 端', text: '左侧库内停稳后，按 W 前进。先直出再按 D 向右出库，前往 A 控制线，回正后驶至线外停稳。' },
  finish: { title: '两侧倒库与返回起点已完成', text: '完整路线已经完成。可以从任一步接手，跟随语音自己操作；练熟后关闭提示，独立判断。' },
  practice_intro: { title: '准备自己操作', text: '用 S 倒车，W 前进，A 和 D 转向，X 主动回正，空格刹车。先确认前轮越过控制线，再看镜低速练习。' },
  warning_line: { title: '车身已经出线', text: '注意，车身已经出线。先刹车，暂停切俯视，检查车身、后轮和库边线的位置，再重练这一段。' },
  warning_sequence: { title: '检查控制线与倒车顺序', text: '这轮出现了未按控制线顺序倒车。先停稳，检查两前轮是否都越过控制线，再重新开始完整路线。' },
  warning_time: { title: '本轮练习已经超时', text: '本轮已经超过倒车入库的二百一十秒限制。教学暂停不计入练习时间；可以复盘后重新练习。' },
  stopped: { title: '车辆已经停稳', text: '车辆已经停稳。观察车身和边线的位置，准备好后再继续操作。' },
  recovery_early: { title: '方向已回正，车身仍有夹角', text: '先按空格停稳。前轮回正了，车身仍然是斜的。看两侧车身与库线，再从回正前重练，不要直接补满方向。' },
  recovery_clearance: { title: '继续直倒的边线余量不足', text: '先按空格停稳。按当前姿态继续直倒，边线余量不足。对照两侧镜和俯视，确认车身位置后再重练。' },
  recovery_wrong_direction: { title: '转向与本次入库方向相反', text: '先按空格停稳。当前转向与入库侧相反。核对正在练哪一侧，再观察车身与库角。' },
  alignment_intro: { title: '看镜判断回正时机', text: '这一段练习主动回正。按 S 低速倒车，观察车身与库边线，接近平行时按 X 回正。' },
  alignment_early: { title: '回正偏早，仍有夹角', text: '这次回正偏早，车身还留着夹角。下次继续观察边线，等车身更接近平行时再回正。' },
  alignment_late: { title: '车身已经摆过头', text: '车身已经摆过头。先刹车并回正，切俯视检查位置。下次在车身趋于平行时更早开始回方向。' },
  alignment_good: { title: '回正后车身接近顺直', text: '这次回正后车身接近顺直。对照两侧间隙，再练另一侧。接下来仍要直倒，判断库内停车位置。' },
});

function cue(key) { return { key, ...VOICE_CUES[key] }; }

// Preview horizons describe this model's motion, never seconds to count while
// driving. Stopped poses use a modest 2 km/h observation speed. While moving,
// actual reverse speed determines the available distance and angle to observe.
const TURN_TOLERANCE = 0.15;
const radians = degrees => degrees * Math.PI / 180;

export function voiceGuidance(key, side) {
  const fallback = { mirror: 'front', stage: 'observe', look: '先确认车辆与场地位置', action: '保持停稳，准备好再继续', next: '选择示范或自己练习' };
  if (typeof key !== 'string') return { ...fallback };
  const entrySide = /(?:^left_|_left$)/.test(key) ? 'left' : /(?:^right_|_right$)/.test(key) ? 'right' : side === 'left' ? 'left' : 'right';
  const name = entrySide === 'left' ? '左' : '右', other = entrySide === 'left' ? '右' : '左';
  const turnKey = entrySide === 'left' ? 'A' : 'D';
  const data = (mirror, stage, look, action, next) => ({ mirror, stage, look, action, next });
  if (['straight', 'left_straight'].includes(key)) return data(entrySide, 'observe', `先认${name}镜中少量车身与侧后地面`, 'S 低速直倒，保持方向回正', '库角入镜后再比较，接近模型参照准备转向');
  if (['prepare_right', 'prepare_left'].includes(key)) return data(entrySide, 'prepare', `先认${name}镜中的车身与侧后地面`, '保持直倒，手上准备转向', `到模型参照后按 ${turnKey} 向${name}，库角入镜后再比较`);
  if (['right_turn', 'left_turn'].includes(key)) return data(entrySide, 'act', `先认${name}镜中的车身与侧后地面`, `到模型参照，按 ${turnKey} 向${name}打方向`, '方向到位后保持转角，库角入镜后再比较间隙');
  if (['hold_right', 'hold_left'].includes(key)) return data(entrySide, 'hold', `先认${name}镜中的车身与侧后地面，兼顾${other}镜`, '保持当前转角，S 低速倒车', '库角进入镜面后，再比较车身与库边间隙');
  if (['right_align', 'left_align'].includes(key)) return data('both', 'observe', `库线入镜后，先看${name}镜车身与库线，再对照${other}镜`, '保持转角，继续低速倒入', '车身趋于平行时准备回方向');
  if (['prepare_center_right', 'prepare_center_left', 'alignment_intro'].includes(key)) return data('both', 'prepare', `先看${name}镜，再对照${other}镜的车身与库线`, '手上准备回正，稳住低速', '接近平行时按 X 主动回正');
  if (key === 'center') return data('both', 'act', '看车身与两侧库线是否趋于平行', '现在按 X 回正，保持低速', '方向回正后直倒，找停车参照');
  if (key === 'park') return data('both', 'hold', '比较两侧余量，观察车头与车尾', 'S 低速直倒，方向保持回正', '全部入库、到停车参照后刹车');
  if (key === 'brake') return data('both', 'act', '确认车头不出库口、车尾不越底线', '现在按空格刹车停稳', '停稳后按流程出库');
  if (['exit_left', 'exit_right'].includes(key)) return data('front', 'act', '看前方库口，兼顾车身与库角', `W 先直出，留足空间后向${name}转`, key === 'exit_left' ? '两前轮越过 B 线后停稳' : '驶至 A 线外停稳');
  if (key === 'control_b') return data('front', 'observe', '确认两个前轮都在 B 控制线外', '空格停稳，准备换边倒车', '看左镜，重新找转向参照');
  if (['intro', 'practice_intro', 'takeover_short'].includes(key)) return data('both', 'observe', '调整驾驶位，确认两侧镜都看清', '先观察当前位置和方向，再低速操作', '看镜 → 准备 → 转向 → 回正 → 停车');
  if (key === 'warning_line' || key === 'alignment_late') return data('both', 'review', '检查车身、后轮与边线位置', '先刹车，暂停切俯视检查', '复盘转向与回正时机，再练这一段');
  if (key === 'recovery_early') return data('both', 'review', '前轮已回正，再看车身与库线的夹角', '先按空格停稳，暂缓继续直倒', '对照两侧镜，再从回正前重练');
  if (key === 'recovery_clearance') return data('both', 'review', '比较两侧余量，检查车头与车尾', '先按空格停稳，避免继续挤向边线', '切俯视对照位置，再从更早处重练');
  if (key === 'recovery_wrong_direction') return data('both', 'review', `核对本次${name}倒库与前轮方向`, '先按空格停稳，暂缓继续转向', '确认入库侧，再重新观察库角');
  if (key === 'warning_sequence') return data('front', 'review', '检查前轮是否越过指定控制线', '停稳，复盘起步和换边顺序', '从正确控制线外重新开始');
  if (key === 'warning_time') return data('both', 'review', '回看完整路线与停车位置', '暂停复盘操作衔接', '重新练习完整路线');
  if (['alignment_early', 'alignment_good'].includes(key)) return data('both', 'review', '对照两侧夹角与间隙', '暂停观察本次回正结果', '再练同一侧，或换边对照');
  if (key === 'stopped') return data('both', 'observe', '停稳后确认车身和边线', '准备好后继续操作', '按当前路线阶段练习');
  if (key === 'finish') return data('front', 'review', '回看两侧入库与返回起点', '完整路线结束', '接手练习，或关闭提示独立判断');
  return { ...fallback };
}

/** Only the full narrated demonstration follows this primary observation.
 * Both-mirror instructions start with the entry-side mirror; the learner may
 * inspect the other mirror without an automatic camera fighting that choice. */
export function voiceTourObservation(segment) {
  if (!segment) return 'forward';
  const side = [8, 9].includes(segment.lessonStep) ? 'left' : 'right';
  const mirror = voiceGuidance(segment.key, side).mirror;
  if (['intro', 'finish', 'control_b'].includes(segment.key) || mirror === 'front') return 'forward';
  return mirror === 'both' ? side : ['left', 'right'].includes(mirror) ? mirror : 'forward';
}

export function createVoiceTour(demonstration) {
  const { stops, frames } = demonstration;
  const leftStart = stops[7];
  const first = (start, end, predicate) => {
    for (let i = start; i <= end; i++) if (predicate(frames[i])) return i;
    return end;
  };
  const prepareTurn = first(1, stops[1] - 1, state => -state.x - Math.abs(demonstration.turnMarker) <= TURN_TOLERANCE + observationSpeed(state) * PREVIEW_SECONDS);
  const holdTurn = first(stops[1] + 1, stops[2], state => -state.steer >= CAR.maxSteer - radians(0.05));
  const observeAlignment = first(holdTurn + 1, stops[3] - 2, state => -state.heading <= centerWindow(state).observe);
  const prepareCenter = first(observeAlignment + 1, stops[3] - 1, state => -state.heading <= centerWindow(state).prepare);
  const definitions = [
    ['intro', 0, 0, 0],
    ['straight', 0, prepareTurn, 1],
    ['prepare_right', prepareTurn, stops[1], 1],
    ['right_turn', stops[1], holdTurn, 2],
    ['hold_right', holdTurn, observeAlignment, 2],
    ['right_align', observeAlignment, prepareCenter, 3],
    ['prepare_center_right', prepareCenter, stops[3], 3],
    ['center', stops[3], stops[4], 4],
    ['park', stops[4], stops[5], 5],
    ['exit_left', stops[5], stops[6], 6],
    ['control_b', stops[6], leftStart, 7],
    ['left_straight', leftStart, leftStart + prepareTurn, 8],
    ['prepare_left', leftStart + prepareTurn, leftStart + stops[1], 8],
    ['left_turn', leftStart + stops[1], leftStart + holdTurn, 8],
    ['hold_left', leftStart + holdTurn, leftStart + observeAlignment, 8],
    ['left_align', leftStart + observeAlignment, leftStart + prepareCenter, 8],
    ['prepare_center_left', leftStart + prepareCenter, leftStart + stops[3], 8],
    ['center', leftStart + stops[3], leftStart + stops[4], 8],
    ['park', leftStart + stops[4], stops[9], 9],
    ['exit_right', stops[9], stops[10], 10],
    ['finish', stops[10], frames.length - 1, 11],
  ];
  return definitions.map(([key, start, end, lessonStep]) => ({ key, start, end, lessonStep, title: VOICE_CUES[key].title }));
}

export function practiceVoiceCue(state, progress, turnMarker, { alignmentDrill, speedLimit, speechRate } = {}) {
  if (alignmentDrill?.status === 'finished') {
    const resultKeys = { aligned: 'alignment_good', early: 'alignment_early', late: 'alignment_late', unsafe: 'recovery_clearance', line: 'warning_line', forward: 'alignment_intro', unfinished: 'alignment_intro' };
    return cue(resultKeys[alignmentDrill.result?.kind] ?? 'stopped');
  }
  if (progress.started) {
    if (crossesCourseLine(state)) return cue('warning_line');
    if (progress.wrongSequence) return cue('warning_sequence');
    if (progress.overTime || state.time > COURSE.limitSeconds) return cue('warning_time');
  }
  if (alignmentDrill?.status === 'ready') return cue('alignment_intro');
  if (progress.phase === 4) return cue('finish');
  if (progress.phase === 1) return cue(frontWheelsPast(state, 'b') ? 'control_b' : 'exit_left');
  if (progress.phase === 3) return cue('exit_right');

  const side = alignmentDrill?.side ?? (progress.phase === 2 ? 'left' : 'right');
  const analysis = analyzeSteering(state, { side, turnMarker, speedLimit, speechRate });
  return { ...cue(analysis.key), analysis };
}
