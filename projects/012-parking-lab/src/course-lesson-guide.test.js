import test from 'node:test';
import assert from 'node:assert/strict';
import { EXAM_COURSES, EXAM_NARRATION } from './exam-courses.js';
import { getCourseTeachingSteps, COURSE_CUE_NARRATION } from './course-coaching.js';
import { getChapterLessonGuide, getStepLessonGuide } from './course-lesson-guide.js';
import { getCourseObservationPlan } from './course-observation-plan.js';

const chapters = Object.values(EXAM_COURSES).flatMap(course => course.chapters);
const chapter = id => chapters.find(item => item.id === id);
const step = (id, key) => getCourseTeachingSteps(chapter(id)).find(item => item.id === `${id}:${key}`);
const lesson = (id, key) => getStepLessonGuide(chapter(id), step(id, key));

test('all 22 chapter briefings separate the goal, completion requirements, full route and watch points', () => {
  assert.equal(chapters.length, 22);
  const goals = [], routes = [];
  for (const item of chapters) {
    const result = getChapterLessonGuide(item);
    assert.deepEqual(Object.keys(result).sort(), ['goal', 'standard', 'route', 'watch', 'briefingText'].sort());
    for (const [key, text] of Object.entries(result)) assert.ok(typeof text === 'string' && text.length >= 12, `${item.id}/${key}`);
    assert.match(result.watch, /全景/, `${item.id}: orient the learner before the driver view`);
    goals.push(result.goal); routes.push(result.route);
  }
  assert.equal(new Set(goals).size, 22);
  assert.equal(new Set(routes).size, 22);
  const parking = getChapterLessonGuide(chapter('reverse-parking'));
  assert.match(parking.standard, /两前轮.*控制线.*全车.*返回/);
  assert.match(parking.standard, /教学暂停不当作实考中途停车/);
  assert.match(parking.route, /A 端.*右倒.*B 端.*左倒.*A 端/);
  assert.match(getChapterLessonGuide(chapter('crosswalk')).standard, /行人正在通过.*停止线前/);
  assert.match(getChapterLessonGuide(chapter('intersection')).standard, /出口不堵才进入/);
});

test('all 121 stable steps have substantive see, act and completion information rather than title-only fallbacks', () => {
  let count = 0;
  for (const item of chapters) for (const teaching of getCourseTeachingSteps(item)) {
    count++;
    const result = getStepLessonGuide(item, teaching);
    assert.deepEqual(Object.keys(result).sort(), ['look', 'see', 'act', 'complete', 'caution'].sort());
    for (const [field, text] of Object.entries(result)) {
      assert.ok(typeof text === 'string' && text.length >= (['see', 'complete', 'caution'].includes(field) ? 10 : 6), `${teaching.id}/${field}`);
      assert.doesNotMatch(text, /未知步骤/, teaching.id);
    }
    assert.notEqual(result.see, result.act, teaching.id);
    assert.notEqual(result.act, result.complete, teaching.id);
    assert.notEqual(result.complete, teaching.action, `${teaching.id}: an observable result, not a repeated button label`);
  }
  assert.equal(count, 121);
});

test('chapter audio text is reused verbatim and the new guide introduces no narration or audio keys', () => {
  const expectedKeys = Object.keys(EXAM_NARRATION), cueKeys = Object.keys(COURSE_CUE_NARRATION);
  for (const item of chapters) {
    const result = getChapterLessonGuide(item);
    assert.equal(result.briefingText, item.narration);
    assert.equal(result.briefingText, EXAM_NARRATION[item.narrationKey].text);
    assert.equal(Object.hasOwn(result, 'narrationKey'), false);
    assert.equal(Object.hasOwn(result, 'score'), false);
    assert.equal(Object.hasOwn(result, 'passed'), false);
  }
  assert.deepEqual(Object.keys(EXAM_NARRATION), expectedKeys);
  assert.deepEqual(Object.keys(COURSE_CUE_NARRATION), cueKeys);
  assert.equal(expectedKeys.length, 22); assert.equal(cueKeys.length, 121);
});

test('stable IDs choose the guide independently of mutable cue wording and returned objects cannot modify the source', () => {
  const c = chapter('reverse-parking'), s = step(c.id, 'right_center');
  const expected = getStepLessonGuide(c, s), originalChapter = getChapterLessonGuide(c);
  const changed = getStepLessonGuide({ ...c, title: '改名', look: '左后方', action: '右转' }, {
    ...s, title: '完全不同', look: '前方', action: '反方向', text: '左左右右', operation: { value: 'right' },
  });
  assert.deepEqual(changed, expected);
  changed.act = '被修改';
  assert.deepEqual(getStepLessonGuide(c, s), expected);
  const overview = getChapterLessonGuide(c); overview.standard = '被修改';
  assert.deepEqual(getChapterLessonGuide(c), originalChapter);
  assert.deepEqual(getStepLessonGuide(c.id, 'right_center'), expected);
});

test('both initial reverse approaches teach waiting for a visible reference instead of inventing a corner at the cue time', () => {
  for (const [id, mirror] of [['straight_back', '右镜'], ['left_straight_back', '左镜']]) {
    const g = lesson('reverse-parking', id);
    assert.match(g.look, new RegExp(mirror));
    assert.match(g.see, /看不到|未进入镜面/);
    assert.match(g.act, /回中.*(低速直倒|直线慢倒)/);
    assert.match(g.act, /未到.*继续.*(观察|等待)/);
    assert.match(g.complete, /本车.*校准/);
    assert.match(g.caution, /不能.*照搬|不要.*时间|不.*照搬/);
  }
  for (const id of ['right_turn', 'left_turn']) {
    const g = lesson('reverse-parking', id);
    assert.match(g.see, /库角可能尚未入镜/);
    assert.match(g.act, /本模型.*校准.*演示.*自己操作前.*参照/);
    assert.match(g.caution, /未看清.*不按播放时刻硬打/);
  }
});

test('the 14 reverse-parking steps distinguish axle crossing, full-car stops, direction changes and returning home', () => {
  const keys = getCourseTeachingSteps(chapter('reverse-parking')).map(item => item.id.split(':')[1]);
  assert.equal(keys.length, 14);
  assert.match(lesson('reverse-parking', 'ready').see, /两前轮.*控制线.*停住/);
  assert.match(lesson('reverse-parking', 'far_ready').see, /两前轮都.*控制线/);
  for (const id of ['right_stop', 'left_stop']) {
    const g = lesson('reverse-parking', id);
    assert.match(g.see, /全车.*库/);
    assert.match(g.complete, /停稳.*全车|全车.*停稳/);
    assert.match(g.look, /车头.*车尾|车尾.*车头/);
  }
  assert.match(lesson('reverse-parking', 'transfer').caution, /车头.*不代表后轮/);
  assert.match(lesson('reverse-parking', 'return').caution, /还要.*返回/);
  assert.match(lesson('reverse-parking', 'finish').complete, /两侧入库停车.*返回起始端/);
});

test('wheel-return guidance follows changing body alignment and stops at wheel center in both reverse directions', () => {
  const approach = lesson('reverse-parking', 'approach_alignment');
  assert.match(approach.see, /夹角逐渐缩小/);
  assert.match(approach.complete, /快直.*而非等到完全平行/);
  const right = lesson('reverse-parking', 'right_center'), left = lesson('reverse-parking', 'left_center');
  assert.match(right.act, /向左回轮.*右转角.*朝正前方后停止/);
  assert.match(left.act, /向右回轮.*左转角.*朝正前方后停止/);
  assert.match(right.caution, /不是再向左.*新转角/);
  assert.match(left.caution, /不等于再.*右转/);
  for (const g of [right, left]) assert.match(g.caution, /不.*等.*完全平行|不要等完全平行/);
});

test('front swing is watched through the front view and is not confused with the opposite rear-facing mirror', () => {
  for (const [c, s, turn, outside] of [
    ['reverse-parking', 'right_turn', '右', '左'], ['reverse-parking', 'left_turn', '左', '右'], ['side-parking', 'right_turn', '右', '左'],
  ]) {
    const g = lesson(c, s);
    assert.match(g.look, new RegExp(`${outside}前方|前方${outside}侧`));
    assert.match(g.act, new RegExp(`向${turn}`));
    assert.ok(getCourseObservationPlan(c, s).some(slot => slot.view === 'driver' && slot.gaze === 'forward'), `${c}/${s}`);
  }
  assert.match(lesson('reverse-parking', 'right_turn').caution, /不能拿左外镜替代/);
  assert.match(lesson('side-parking', 'right_turn').caution, /不能用左外后视镜冒充左前方/);
});

test('side parking and the illustrated left corner retain their distinct steering chains and rear-wheel checks', () => {
  assert.match(lesson('side-parking', 'right_turn').act, /向右.*车尾/);
  assert.match(lesson('side-parking', 'countersteer').act, /向左回轮.*反向调整/);
  assert.match(lesson('side-parking', 'entry_center').act, /向右.*左转角.*回中后停止/);
  assert.match(lesson('side-parking', 'exit').act, /向左驶出/);
  assert.match(lesson('side-parking', 'exit_countersteer').act, /向右回轮修直/);
  assert.match(getChapterLessonGuide(chapter('right-angle')).goal, /左转直角/);
  assert.match(lesson('right-angle', 'left_turn').act, /向左转向/);
  assert.match(lesson('right-angle', 'left_turn').see, /左后部.*右前角/);
  assert.match(lesson('curve-driving', 'change_curve').caution, /不能车头.*忽略.*后轮/);
});

test('lane-change and overtaking correction directions do not invent a new opposite maneuver or indicator', () => {
  for (const c of ['lane-change', 'overtake']) {
    assert.match(lesson(c, 'left_move').act, /向左/);
    assert.match(lesson(c, 'left_countersteer').act, /向右回轮修直/);
    assert.match(lesson(c, 'left_countersteer').caution, /不是.*右变道|不是.*返回原车道/);
    assert.match(lesson(c, 'right_move').act, /向右/);
    assert.match(lesson(c, 'right_countersteer').act, /向左回轮修直/);
    assert.match(lesson(c, 'right_signal').look, /重新看右镜.*盲区/);
  }
  assert.match(lesson('overtake', 'pass').caution, /不等于安全距离.*足够/);
  assert.match(lesson('overtake', 'right_move').see, /不会迫使.*制动或避让/);
  assert.match(lesson('pull-over', 'countersteer').act, /向左回轮修直/);
});

test('roadway conflict and post-stop guidance distinguishes front hazards from mirror scans and requires fresh checks', () => {
  assert.match(lesson('intersection', 'check').look, /前方.*行人.*横向车辆/);
  assert.match(lesson('intersection', 'check').caution, /外镜不能代替横向冲突/);
  assert.match(lesson('right-turn', 'blind_spot').look, /右镜.*右后方盲区.*前方/);
  assert.match(lesson('crosswalk', 'stop').complete, /停止线前.*没有占住斑马线/);
  assert.match(lesson('crosswalk', 'wait').caution, /另一侧/);
  assert.match(lesson('crosswalk', 'restart').look, /重新核对/);
  assert.match(lesson('bus', 'occlusion').caution, /不能用扫右镜替代前方/);
  assert.match(lesson('pull-over', 'leave').look, /重新看左镜.*盲区/);
  assert.match(lesson('side-parking', 'park').caution, /不替代停车后的再次观察/);
});

test('forward conflict guides name the actual front-side scans and agree with their camera plans', () => {
  for (const [c, s] of [
    ['intersection', 'check'], ['intersection', 'cross'], ['crosswalk', 'approach'], ['crosswalk', 'wait'], ['crosswalk', 'restart'],
    ['school', 'approach'], ['school', 'slow'], ['school', 'scan'], ['bus', 'approach'], ['bus', 'occlusion'], ['bus', 'pass'],
    ['left-turn', 'yield'], ['uturn', 'check'],
  ]) {
    const g = lesson(c, s), observation = getCourseObservationPlan(c, s);
    assert.match(g.look, /前方左侧/, `${c}/${s}`);
    assert.match(g.look, /前方右侧/, `${c}/${s}`);
    for (const gaze of ['front-left', 'front-right']) assert.ok(observation.some(slot => slot.view === 'driver' && slot.gaze === gaze), `${c}/${s}/${gaze}`);
    assert.ok(observation.every(slot => !['left', 'right', 'left-back', 'right-back'].includes(slot.gaze)), 'front-road conflicts cannot silently turn into external-mirror or rear-shoulder checks');
  }
  const blind = lesson('right-turn', 'blind_spot');
  assert.match(blind.look, /右镜.*右后方盲区.*前方右侧.*前方出口/);
  assert.deepEqual(getCourseObservationPlan('right-turn', 'blind_spot').filter(slot => slot.phase === 'reminder').map(slot => slot.gaze),
    ['right', 'right-back', 'front-left', 'front-right', 'forward'], 'side/rear and all three forward conflict views are distinct, necessary checks');
  for (const c of ['left-turn', 'right-turn', 'uturn']) {
    const watch = getChapterLessonGuide(chapter(c)).watch;
    assert.match(watch, /前方左侧.*前方右侧/);
    assert.match(watch, /转弯前|转向前/);
  }
});

test('C1 pedal and gear sequences maintain ordering without claiming the prototype teaches actual clutch mastery', () => {
  assert.match(lesson('hill-start', 'hold').act, /踩稳.*制动.*驻车/);
  assert.match(lesson('hill-start', 'bite').act, /先建立驱动力.*再解除驻车/);
  assert.match(lesson('hill-start', 'bite').caution, /实车练习.*不能.*动画进度/);
  for (const id of ['second', 'third']) assert.match(lesson('gears', id).act, /松.*离合踩到底.*挡.*接合/);
  for (const id of ['down_second', 'down_first']) assert.match(lesson('gears', id).act, /先.*减速.*再踩离合/);
  assert.match(getChapterLessonGuide(chapter('gears')).standard, /不评价真实离合.*手动换挡.*实考分数/);
  assert.match(lesson('gears', 'second').caution, /不要低头找挡.*自动配合.*已练会/);
});

test('lamp scenarios and safe ending remain conditional on context rather than one universal response', () => {
  assert.match(lesson('lights', 'wait').act, /听清后再选择/);
  assert.match(lesson('lights', 'high').see, /照明不良.*不会.*眩目/);
  assert.match(lesson('lights', 'meeting').act, /近光/);
  assert.match(lesson('lights', 'following').act, /近光/);
  assert.match(lesson('lights', 'flash').act, /交替.*远近光/);
  assert.match(lesson('lights', 'hazard').act, /夜间.*示廓灯.*危险报警/);
  assert.match(lesson('lights', 'off').caution, /不.*套到仍在夜间行驶/);
  assert.match(lesson('pull-over', 'secure').act, /驻车制动.*空挡.*关闭转向灯/);
  assert.match(lesson('pull-over', 'leave').act, /确认安全后再解安全带.*开门/);
});

test('guides contain no fixed exam score, universal sight timing, steering count or unmeasured clearance promise', () => {
  const texts = chapters.flatMap(item => [getChapterLessonGuide(item), ...getCourseTeachingSteps(item).map(s => getStepLessonGuide(item, s))]);
  for (const result of texts) {
    const text = Object.values(result).join(' ');
    assert.doesNotMatch(text, /\d+\s*(秒|圈|分|厘米|公里|cm)/);
    assert.doesNotMatch(text, /打死|一圈半|左窄就向右|右窄就向左|考试通过|判定合格|得分|扣\s*\d+\s*分/);
  }
});

test('unknown IDs return safe general text without inherited prototype properties being mistaken for guides', () => {
  for (const c of [null, { id: 'constructor' }, { id: '__proto__' }, { id: 'missing', narration: '原始讲解原样保留。' }]) {
    const overview = getChapterLessonGuide(c);
    assert.ok(overview.goal && overview.standard && overview.route && overview.watch);
    assert.equal(overview.briefingText, c?.narration || '');
    for (const key of ['constructor', '__proto__', 'missing']) {
      const g = getStepLessonGuide(c, { id: key });
      assert.match(g.caution, /未知步骤/);
      assert.ok(g.look && g.see && g.act && g.complete);
    }
  }
});
