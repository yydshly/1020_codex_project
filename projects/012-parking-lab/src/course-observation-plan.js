// Observation is authored by stable teaching IDs. Spoken wording, steering
// sign and the current scene never guess which mirror a learner should see.
const slot = (gaze, label, duration = 1.2) => ({ view: 'driver', gaze, label, duration });
const F = slot('forward', '驾驶位前方 · 核对行驶方向与前方空间', 1.4);
const FL = slot('front-left', '前方左侧扫视 · 看横向道路、行人与遮挡');
const FR = slot('front-right', '前方右侧扫视 · 看横向道路、行人与遮挡');
const L = slot('left', '左外镜 · 看车身参照与左后方');
const R = slot('right', '右外镜 · 看车身参照与右后方');
const I = slot('rear', '车内后视镜 · 看车辆正后方');
const LB = slot('left-back', '左后方盲区 · 转头核对镜外区域');
const RB = slot('right-back', '右后方盲区 · 转头核对镜外区域');
const O = { view: 'orbit', gaze: 'forward', label: '教学辅助全景 · 观察绕车检查的位置与顺序', duration: 1.4 };
const C = label => ({ view: 'controls', gaze: 'forward', label: `教学辅助近景 · ${label}`, duration: 1.4 });
const RF = [R, F], leftCheck = [L, LB, F], rightCheck = [R, RB, F];
const plan = (reminder, action = [F]) => [
  ...reminder.map(item => ({ ...item, phase: 'reminder' })),
  ...action.map(item => ({ ...item, phase: 'action' })),
];
const ahead = () => plan([F]);
const frontScan = () => plan([FL, FR, F]);
const parkRight = (action = [R]) => plan([R, L, R], action);
const parkLeft = (action = [L]) => plan([L, R, L], action);
const parkingEntry = (mirror, outside) => {
  const front = slot('forward', `驾驶位前方 · 核对${outside}前方车头外摆与空间`, 1.4);
  return plan([{ ...mirror, primary: true }, front], [{ ...mirror, primary: true }, front, { ...mirror, primary: true }]);
};
const control = label => plan([C(label)], [C(label)]);

const PLANS = {
  'reverse-parking': {
    ready: plan([R, L, F], [R]),
    straight_back: parkRight(),
    right_turn: parkingEntry(R, '左'),
    approach_alignment: parkRight(),
    right_center: parkRight([R, L, R]),
    right_stop: plan([R, L, F], [R]),
    transfer: plan([F, L, F]),
    far_ready: plan([F, R, F]),
    left_straight_back: parkLeft(),
    left_turn: parkingEntry(L, '右'),
    left_center: parkLeft([L, R, L]),
    left_stop: plan([L, R, F], [L]),
    return: plan([F, R, F]),
    finish: ahead(),
  },
  'hill-start': {
    approach: plan([F, R, F], [F, R, F]),
    prepare_stop: plan(RF, [R, F]),
    hold: plan([C('制动与驻车操作，车辆保持停稳'), F]),
    bite: plan([F, C('教学展示离合与驻车配合，随后回看前方'), F]),
    leave: ahead(),
  },
  'side-parking': {
    ready: plan([R, L, F], [R]),
    right_turn: parkingEntry(R, '左'),
    countersteer: parkRight([R, L, R]),
    entry_center: parkRight([R, L, R]),
    park: plan(leftCheck, [F]),
    exit: plan(leftCheck),
    exit_countersteer: plan([F, R, F]),
    exit_center: ahead(),
  },
  'curve-driving': {
    enter: plan([F, L, R, F]),
    first_curve: plan([F, R, F], [F, R, F]),
    change_curve: plan([F, L, F], [F, L, F]),
    exit: plan([F, L, R, F]),
  },
  'right-angle': {
    approach: plan([F, L, F]),
    prepare_turn: plan([L, R, F]),
    left_turn: plan([L, slot('forward', '驾驶位前方 · 核对右前方车头外摆与空间', 1.4)], [F, L, F]),
    center: plan([F, L, F]),
  },
  prepare: {
    walkaround: plan([O], [O]),
    open_door: plan([L, LB], [C('观察后开门上车的动作')]),
    close_door: control('车门关闭与门锁确认'),
    seat: control('座椅、方向盘和踏板距离'),
    mirrors: plan([L, R, F], [L, R, F]),
    belt: control('安全带扣牢并理顺带身'),
    check: control('挡位、驻车制动与仪表检查'),
  },
  lights: {
    wait: control('静止等待口令与灯光初始状态'),
    low: control('近光灯操作与仪表指示'),
    high: control('远光灯操作与仪表指示'),
    meeting: control('会车改近光的操作与指示'),
    flash: control('交替远近光的操作与指示'),
    following: control('跟车使用近光的操作与指示'),
    hazard: control('示廓灯与危险报警闪光灯'),
    off: control('灯光关闭并复位'),
  },
  start: {
    ready: plan([C('起步前挡位与制动检查'), F]),
    signal: plan(leftCheck),
    move: ahead(),
    center: ahead(),
  },
  straight: {
    far_reference: ahead(),
    scan: plan([F, I, L, R, F]),
    correct: ahead(),
  },
  gears: {
    first: ahead(),
    second: plan([C('离合与二挡操作，动作时视线回前方'), F]),
    third: plan([C('离合与三挡操作，动作时视线回前方'), F]),
    down_second: plan([F, C('教学展示先减速再减二挡的配合'), F]),
    down_first: plan([C('低速减至一挡的配合'), F]),
  },
  'lane-change': {
    left_signal: plan(leftCheck),
    left_move: plan(leftCheck),
    left_countersteer: ahead(),
    left_center: ahead(),
    right_signal: plan(rightCheck),
    right_move: plan(rightCheck),
    right_countersteer: ahead(),
    right_center: ahead(),
  },
  // Roadside and intersection conflicts are ahead. A side mirror view is not
  // a substitute for looking at crossing pedestrians or oncoming traffic.
  intersection: { approach: plan([F, FL, FR, F]), check: frontScan(), cross: plan([F, FL, FR, F]), leave: ahead() },
  // The signal audio names traffic ahead. Additional side/shoulder checks
  // occur during the following observation action, before the conflict/turn
  // steps. The caller caps its playback speed to retain these brief glances.
  'left-turn': { signal: plan([F], leftCheck), yield: frontScan(), turn: plan([FL, F]), center: ahead() },
  'right-turn': { signal: plan([F, FR, F]), blind_spot: plan([R, RB, FL, FR, F]), turn: plan([FR, F]), center: ahead() },
  crosswalk: { approach: frontScan(), stop: plan([F, FL, FR, F]), wait: plan([FL, FR, F], [FL, FR, F]), restart: frontScan() },
  school: { approach: plan([F, FL, FR, F]), slow: frontScan(), scan: frontScan(), leave: ahead() },
  bus: { approach: plan([F, FR, FL, F]), occlusion: plan([FR, FL, F]), pass: plan([FR, FL, F]), leave: ahead() },
  meeting: { approach: ahead(), space: plan(RF), pass: ahead() },
  overtake: {
    left_signal: plan(leftCheck),
    left_move: plan(leftCheck),
    left_countersteer: ahead(),
    pass: plan(RF),
    right_signal: plan(rightCheck),
    right_move: plan(rightCheck),
    right_countersteer: ahead(),
    center: ahead(),
  },
  uturn: { signal: plan([F], leftCheck), check: frontScan(), turn: plan([FL, F]), center: ahead() },
  night: { high: ahead(), low: ahead(), flash: ahead(), continue: ahead() },
  'pull-over': {
    choose: plan(rightCheck),
    signal: plan(rightCheck),
    right_move: plan(rightCheck),
    countersteer: plan(RF),
    center: plan(RF),
    stop: plan(RF),
    secure: plan([C('停稳后的驻车、空挡与关灯'), F]),
    leave: plan(leftCheck, [C('观察确认后解带、开门的动作')]),
  },
};

/** Return an independent array of explicitly authored reminder/action slots.
 * Unknown steps have no authored plan; the sampler safely keeps the front view.
 * All orbit/controls slots are labeled as teaching aids rather than eye views.
 */
export function getCourseObservationPlan(chapter, step) {
  const chapterId = typeof chapter === 'string' ? chapter : chapter?.id;
  const id = typeof step === 'string' ? step : step?.id;
  const prefix = `${chapterId}:`;
  const stepId = typeof id === 'string' && id.startsWith(prefix) ? id.slice(prefix.length) : id;
  const chapterPlan = Object.hasOwn(PLANS, chapterId) ? PLANS[chapterId] : null;
  const authored = chapterPlan && Object.hasOwn(chapterPlan, stepId) ? chapterPlan[stepId] : [];
  return authored.map(item => ({ ...item }));
}

const MIN_SLOT = 1;
const finite = (value, fallback) => Number.isFinite(value) ? value : fallback;

/** Cap automatic observation action speed without changing the user's chosen
 * playback rate. The caller uses the result for both simulation advancement
 * and sampling, and bypasses it when following is disabled/manual. duration
 * must be the actual visible action span (up to the next reminder gate when
 * voiced steps are enabled), not an audio duration or a wall-clock estimate. */
export function courseObservationPlaybackRate(chapter, step, { duration, rate = 1 } = {}) {
  const requested = Math.max(.1, finite(rate, 1));
  const slots = getCourseObservationPlan(chapter, step).filter(item => item.phase === 'action');
  if (slots.length <= 1 || !Number.isFinite(duration) || duration <= 0) return requested;
  const budget = slots.reduce((sum, item) => sum + Math.max(MIN_SLOT, item.duration), 0);
  return Math.min(requested, duration / budget);
}

/** Pure clock-based sampling, with no timers or wall-clock state.
 * Reminder elapsed/duration come from audio.currentTime/duration. Action uses
 * simulation time-step.t and the available time to the next step. When actions
 * play faster, pass rate to keep each visible slot at least about one real
 * second. The caller freezes clocks/target when paused or adjusting mirrors.
 *
 * Short reminders preserve their prefix (main mirror, then shoulder); the
 * action plan returns to the front. A short action keeps only its primary view
 * instead of flashing through mirrors. Parking-entry primary slots keep the
 * main mirror dominant; their front swing check stays brief. Extra road time
 * goes to front-facing slots, so side glances cannot become long blind drives.
 */
export function sampleCourseObservationPlan(chapter, step, { phase = 'action', elapsed = 0, duration, rate = 1 } = {}) {
  phase = phase === 'reminder' ? 'reminder' : 'action';
  const scale = phase === 'action' && Number.isFinite(rate) && rate > 0 ? rate : 1;
  let slots = getCourseObservationPlan(chapter, step).filter(item => item.phase === phase);
  if (!slots.length) slots = [{ ...F, phase }];
  const recommended = slots.reduce((sum, item) => sum + item.duration, 0);
  const available = Math.max(0, finite(duration, recommended * scale) / scale);
  const capacity = Math.max(1, Math.floor((available + 1e-7) / MIN_SLOT));
  if (slots.length > capacity) slots = phase === 'reminder' ? slots.slice(0, capacity) : slots.slice(0, 1);
  const base = slots.map(item => Math.max(MIN_SLOT, item.duration));
  const total = base.reduce((sum, value) => sum + value, 0), budget = Math.max(available, slots.length * MIN_SLOT);
  let lengths;
  if (budget < total) {
    const extra = total - slots.length * MIN_SLOT;
    lengths = base.map(value => MIN_SLOT + (value - MIN_SLOT) * (budget - slots.length * MIN_SLOT) / Math.max(1e-9, extra));
  } else {
    lengths = [...base];
    const primary = slots.flatMap((item, index) => item.primary ? [index] : []);
    const forwards = slots.flatMap((item, index) => item.view === 'driver' && item.gaze === 'forward' ? [index] : []);
    const stretch = primary.length ? primary : forwards.length ? forwards : [slots.length - 1];
    for (const index of stretch) lengths[index] += (budget - total) / stretch.length;
  }
  const time = Math.max(0, finite(elapsed, 0) / scale);
  let index = 0, start = 0;
  while (index < slots.length - 1 && time >= start + lengths[index] - 1e-7) { start += lengths[index]; index++; }
  return { ...slots[index], phase, index, count: slots.length, slotStart: start * scale, slotDuration: lengths[index] * scale };
}
