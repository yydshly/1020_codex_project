/** Captions and real MiniMax-generated Mandarin narration share this source. */
import { EXAM_NARRATION } from './exam-courses.js';
import { COURSE_CUE_NARRATION } from './course-coaching.js';
export const NARRATION = Object.freeze({
  ...EXAM_NARRATION,
  ...COURSE_CUE_NARRATION,
  intro: { title: '先调整观察位置', text: '先调整座椅和左右后视镜，让车身和地面边线都能看清。本示范用于理解 C 一倒车入库，实际点位请以你的教练车和教练指导为准。' },
  straight: { title: '直线后退', text: '保持方向回正，按住 S 慢速直倒。先认右镜里的车身和侧后地面，库线进入镜面后再比较间隙；接近模型参照时准备转向。', action: 'S · 慢速倒车' },
  prepare_right: { title: '先看右镜，准备转向', text: '看右镜，直倒，准备右转。', action: 'E · 看右镜，保持直线，等参照再转向' },
  prepare_left: { title: '先看左镜，准备转向', text: '看左镜，直倒，准备左转。', action: 'Q · 看左镜，保持直线，等参照再转向' },
  right_turn: { title: '现在向右打方向', text: '右打方向。', action: 'D · 现在向右打方向' },
  hold_right: { title: '方向到位，看右镜', text: '方向已到位，保持当前转角。先认右镜中的车身和侧后地面，库角进入镜面后再比较间隙，兼顾左镜。', action: '保持方向 · E 看右镜 / Q 兼顾左镜' },
  hold_left: { title: '方向到位，看左镜', text: '方向已到位，保持当前转角。先认左镜中的车身和侧后地面，库角进入镜面后再比较间隙，兼顾右镜。', action: '保持方向 · Q 看左镜 / E 兼顾右镜' },
  right_align: { title: '保持方向，观察间隙', text: '保持当前转角，低速倒车。先认右镜中的车身和侧后地面，库角进入镜面后再比较间隙，兼顾左镜。', action: '保持当前方向 · 交替看镜' },
  prepare_center_right: { title: '看右镜，再对照左镜', text: '看右镜、左镜，准备回正。', action: 'E → Q · 对照边线，接近平行再回正' },
  prepare_center_left: { title: '看左镜，再对照右镜', text: '看左镜、右镜，准备回正。', action: 'Q → E · 对照边线，接近平行再回正' },
  center: { title: '现在回正方向', text: '回正。', action: 'X · 现在回正' },
  park: { title: '直线入库，停车', text: '方向回正后继续慢速直倒，左右镜确认间距。车身全部入库，车尾到达停车参照后，按空格停稳。', action: 'S · 倒车 → 空格 · 刹车' },
  brake: { title: '到停车参照，刹车', text: '刹车。', action: '空格 · 现在刹车' },
  exit_left: { title: '向左出库', text: '换为前进，先直线驶出。车头和库口有足够空间后，再向左打方向，驶向 B 控制线。', action: 'W · 前进 → A · 向左' },
  control_b: { title: '越过 B 控制线', text: '确认两只前轮都越过 B 控制线，再停车准备倒车。接下来练习另一侧入库。', action: '两前轮越线 → 空格 · 刹车' },
  left_straight: { title: '左侧直线后退', text: '从 B 端开始，保持方向回正，按住 S 慢速直倒。先认左镜里的车身和侧后地面，库线进入镜面后再比较间隙；接近模型参照时准备转向。', action: 'S · 慢速倒车' },
  left_turn: { title: '现在向左打方向', text: '左打方向。', action: 'A · 现在向左打方向' },
  left_align: { title: '保持方向，观察间隙', text: '保持当前转角，低速倒车。先认左镜中的车身和侧后地面，库角进入镜面后再比较间隙，兼顾右镜。', action: '保持当前方向 · 交替看镜' },
  exit_right: { title: '向右出库', text: '先直线前进驶出库口，留足空间后再向右打方向，返回 A 控制线。', action: 'W · 前进 → D · 向右' },
  finish: { title: '完整流程结束', text: '完成两侧倒车入库，并返回 A 端。现在可以进入语音跟练，自己控制车辆，按照看镜、转向、回正的顺序练习。' },
  warning_line: { title: '留意车身与边线', text: '先按空格刹车。车身已触及场地边线，暂停观察，再复盘转向时机。', action: '空格 · 刹车 / P · 暂停复盘' },
  warning_sequence: { title: '先完成控制线要求', text: '本次倒车前，尚未确认两只前轮都越过指定控制线。请复盘起步位置和操作顺序。' },
  warning_time: { title: '练习计时已超出', text: '本次练习用时已超过二百一十秒。可以先完成观察和操作，再重练整套流程。' },
  practice_intro: { title: '开始语音跟练', text: '现在由你驾驶，语音会跟随车辆进度提示。W 前进，S 倒车，A 和 D 打方向，X 回正，空格刹车。Q 和 E 看左右镜，P 暂停观察。', action: '自己操作 · 语音随进度提示' },
  takeover_short: { title: '准备接手操作', text: '现在由你操作，先看提示，准备好再继续。', action: '先看提示 · 准备好再继续' },
  stopped: { title: '库内已停车', text: '车辆已在库内停稳。确认方向，接下来先直线前进，再按流程转向出库。', action: 'W · 直线出库' },
  alignment_intro: { title: '练习回正时机', text: '按住 S 慢速倒车，看镜判断车身与边线。接近平行时按 X，亲自体会回正所需的时间。', action: 'S · 倒车 → X · 回正' },
  alignment_early: { title: '这次回正偏早', text: '这次回正偏早，车身仍带着入库角度。复盘镜中的车身和边线，下次稍晚一些开始回正。' },
  alignment_late: { title: '这次回正偏晚', text: '这次回正偏晚，车身已经转过平行方向。下次更早准备，给回正过程留出时间。' },
  alignment_good: { title: '这次回正接近合适', text: '这次回正后车身接近平行。继续通过左右镜比较间距，慢速完成后续入库。' },
  beginner_mirror: { title: '先认右后视镜', text: '先认右后视镜，找到内侧的车身和侧后方地面。库线进入镜面后，再比较车身与库线的夹角和间隙。需要时点镜面教学放大。完成镜面辨认，再进入下一步。', action: '看车身 → 侧后方地面 → 可见库线' },
  beginner_turn: { title: '只练向右打方向', text: '现在只练向右打方向。按住 D，系统帮你低速倒车。观察右镜里的车身与库边位置怎样变化，方向到位会自动停住。', action: '按住 D · 系统控制低速，到位自动暂停' },
  beginner_hold: { title: '松开方向键，继续观察', text: '松开 D，方向会保持，不会自己回正。现在只按住 S 倒车，先认右镜里的车身和侧后地面；库线进入镜面后，再比较车身与库线的夹角，趋于平行时会自动停住。', action: '松开 D，再按住 S · 趋于平行自动暂停' },
  beginner_compare: { title: '车已停住，对照两侧镜', text: '车已经停住。先认右镜里的车身和可见库线，再对照左镜。车身趋于平行时，要给回轮过程留出余量。完成两侧镜面辨认，再进入主动回正。', action: '先看右镜，再看左镜 · 对照车身与边线，留出回轮余量' },
  beginner_center: { title: '按一次 X，主动回正', text: '现在按一次 X，把前轮回正。系统帮你保持低速，回正完成会自动停住。记住，松开方向键不等于回正。', action: '按一次 X · 前轮回正后自动暂停' },
  beginner_finish: { title: '完成方向操作入门', text: '你已经体验了向右打方向、保持方向和主动回正。接下来练习自己判断回正时机，看完示范后亲手操作，再对照两侧镜面。', action: '练习自己判断回正时机' },
  recovery_early: { title: '前轮已正，车身还斜', text: '先刹车停稳。前轮虽然回正，车身仍有夹角。对照两侧镜面，再从回正前重练。', action: '空格刹车 · 对照镜面，重练回正时机' },
  recovery_clearance: { title: '继续直倒的余量不足', text: '先刹车停稳。继续直倒可能碰线。看两侧车身与库线的间隙，暂停复盘，再从错误前重练。', action: '空格刹车 · 暂停检查两侧间隙' },
  recovery_wrong_direction: { title: '先核对转向方向', text: '先刹车停稳。这次转向与当前入库侧相反。核对左右镜和车尾方向，再重新练习。', action: '空格刹车 · 核对入库侧与转向' },
  judgment_intro: { title: '先看示范，再自己判断', text: '先看同一面镜中，车身和库侧线的关系，再核对另一侧。辨认辅助用青色描出可见车身参照，金色标出库侧线。库底的横线不用于判断入库方向。这段示范演到前轮回正就停，再由你判断时机。' },
  judgment_ready: { title: '轮到你自己判断', text: '轮到你了。按住 S 慢慢倒车，看两面镜，自己选择什么时候按 X 回正。这一轮不会提前报操作口令。' },
  alignment_missed: { title: '尚未回正，已错过时机', text: '这一段还没有记录主动回正，车身已经摆过合适位置。先对照两组镜面，再从错过之前重练。' },
  correction_intro: { title: '先判断车尾走势，再小幅纠偏', text: '这次练车尾带小夹角入库。先认本车与库侧线。库口外沿不是库底，没有入镜的线不用找。看同一面镜的间隙走势，再核对另一侧，判断继续直倒时车尾会向哪侧逼线。两面镜的画面宽窄不能直接当成实际距离。系统辅助低速，你只练方向和主动回正。', action: '认车身和库侧线 · 判断车尾逼线趋势' },
  correction_left_tight: { title: '这次车尾向左斜入', text: '这次车尾向左斜入。先看左镜，方向盘向右小幅转，让车尾走势逐渐向右调整。车头会向左外摆，留意前方，也要核对右镜。逼线趋势改善后主动回正；前轮回中不等于车身已直。', action: '方向盘向右 · 车尾逐渐向右调整，留意车头向左摆' },
  correction_right_tight: { title: '这次车尾向右斜入', text: '这次车尾向右斜入。先看右镜，方向盘向左小幅转，让车尾走势逐渐向左调整。车头会向右外摆，留意前方，也要核对左镜。逼线趋势改善后主动回正；前轮回中不等于车身已直。', action: '方向盘向左 · 车尾逐渐向左调整，留意车头向右摆' },
  correction_return: { title: '余量改善，主动回正', text: '余量已经改善，现在主动回正，再交替看两面镜，确认车身与库线的夹角。', action: 'X · 主动回正 → 交替看镜' },
  correction_good: { title: '纠偏后直倒余量改善', text: '这次小幅纠偏后，直倒余量已有改善。对比同一面镜子的前后变化；前轮回正后，仍要核对车身姿态和另一侧余量。', action: '对比同侧镜面前后变化 · 确认另一侧余量' },
  correction_retry: { title: '先停住，重新观察车尾走势', text: '先停住。重新辨认车身与库侧线，别把库口外沿当成库底。看车尾向哪边斜入，对照同一面镜里的变化，再从操作前重练。这题只练斜入纠偏，不是车身平行后的整体偏移。', action: '停住观察车尾走势 · 从操作前重练' },
});

const clamp = (value, min, max, fallback) => Number.isFinite(Number(value)) ? Math.max(min, Math.min(max, Number(value))) : fallback;

/**
 * One audio channel, no queued or overlapping clips. A replacement resolves the
 * previous play promise as cancelled. Inject audioFactory for deterministic tests.
 * status is { state, key, message?, currentTime?, duration? }; rate/volume persist.
 */
export function createNarrator({ onStatus = () => {}, audioFactory = src => new Audio(src), resolveClip = () => null } = {}) {
  let current = null;
  let volume = 0.8;
  let rate = 1;
  let status = { state: 'idle', key: null };

  const publish = (state, key, message) => {
    const timing = {};
    for (const field of ['currentTime', 'duration']) {
      if (key && key === status.key && Number.isFinite(status[field])) timing[field] = status[field];
      if (current?.key === key && Number.isFinite(current.audio[field])) timing[field] = current.audio[field];
    }
    status = { state, key, ...timing, ...(message ? { message } : {}) };
    onStatus({ ...status });
  };
  const detach = item => {
    for (const [event, handler] of Object.entries(item.handlers)) item.audio.removeEventListener(event, handler);
  };
  const release = item => {
    detach(item);
    item.audio.pause();
    // Cancels a pending download too; no old ended/error event can affect a new clip.
    item.audio.removeAttribute?.('src');
    item.audio.load?.();
  };
  const settle = (item, outcome, state, message) => {
    if (current !== item) return;
    current = null;
    release(item);
    publish(state, item.key, message);
    item.resolve(outcome);
  };
  const start = item => {
    const attempt = ++item.attempt;
    let pending;
    try { pending = item.audio.play(); }
    catch (error) { settle(item, 'error', 'error', error?.name === 'NotAllowedError' ? '点击播放以启用语音。' : '语音暂时无法播放，请重试。'); return; }
    Promise.resolve(pending).then(() => {
      if (current !== item || item.attempt !== attempt) return;
      if (item.paused) item.audio.pause();
      else publish('playing', item.key);
    }).catch(error => {
      if (current !== item || item.attempt !== attempt || item.paused && error?.name === 'AbortError') return;
      settle(item, 'error', 'error', error?.name === 'NotAllowedError' ? '点击播放以启用语音。' : '语音暂时无法播放，请重试。');
    });
  };

  return {
    get status() { return { ...status }; },
    play(key, options = {}) {
      if (current) {
        const previous = current;
        current = null;
        release(previous);
        previous.resolve('cancelled');
      }
      if (!NARRATION[key]) {
        publish('error', key, '没有找到这段讲解。');
        return Promise.resolve('error');
      }
      volume = clamp(options.volume ?? volume, 0, 1, volume);
      rate = clamp(options.rate ?? rate, 0.5, 2, rate);
      let audio;
      const clip = resolveClip(key);
      if (!clip?.src || clip.provider !== 'minimax') {
        publish('error', key, 'MiniMax 讲解尚未准备好，请重试语音或选择字幕继续。');
        return Promise.resolve('error');
      }
      try { audio = audioFactory(clip.src); }
      catch { publish('error', key, '当前设备无法播放语音。'); return Promise.resolve('error'); }
      audio.preload = 'auto';
      audio.volume = volume;
      audio.playbackRate = rate;
      audio.preservesPitch = true;
      return new Promise(resolve => {
        const item = { audio, key, resolve, paused: false, attempt: 0, handlers: {} };
        item.handlers.ended = () => settle(item, 'ended', 'ended');
        item.handlers.error = () => settle(item, 'error', 'error', '语音文件未能加载，请重试。');
        item.handlers.timeupdate = () => {
          if (current === item && !item.paused && status.state === 'playing') publish('playing', key);
        };
        current = item;
        for (const [event, handler] of Object.entries(item.handlers)) audio.addEventListener(event, handler);
        publish('loading', key);
        start(item);
      });
    },
    pause() {
      if (!current || current.paused) return;
      current.paused = true;
      current.audio.pause();
      publish('paused', current.key);
    },
    resume() {
      if (!current?.paused) return;
      current.paused = false;
      publish('loading', current.key);
      start(current);
    },
    stop() {
      if (current) {
        const item = current;
        current = null;
        release(item);
        item.resolve('cancelled');
      }
      publish('idle', null);
    },
    setVolume(value) {
      volume = clamp(value, 0, 1, volume);
      if (current) current.audio.volume = volume;
    },
    setRate(value) {
      rate = clamp(value, 0.5, 2, rate);
      if (current) current.audio.playbackRate = rate;
    },
  };
}
