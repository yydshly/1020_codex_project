import test from 'node:test';
import assert from 'node:assert/strict';
import { EXAM_COURSES, sampleChapterPose } from './exam-courses.js';
import { createCourseDrivingSession, courseDrivingPose } from './course-driving.js';
import { createCoursePractice, stepCoursePractice, finishCoursePractice, recordCourseObservation, retryCoursePractice } from './course-practice.js';
import { getCourseReviewGuidance } from './course-review-guide.js';

const chapters = Object.values(EXAM_COURSES).flatMap(course => course.chapters);
function start(id) {
  const chapter = chapters.find(item => item.id === id), pose = { ...sampleChapterPose(chapter, 0), speed: 0, gear: 'N', lightMode: 'off' };
  const driving = createCourseDrivingSession(chapter, pose);
  return createCoursePractice(chapter, { driving, initialPose: courseDrivingPose(driving) });
}
function tick(session, { events = [], pose = session.lastPose, dt = .2 } = {}) {
  return stepCoursePractice(session, { driving: { ...session.lastDriving, ...pose, elapsed: session.elapsed + dt }, pose, dt, events });
}

test('multiple errors describe the first correctable event and the exact retry point instead of the last event', () => {
  let session = start('straight');
  for (let index = 0; index < 20; index++) session = tick(session);
  session = tick(session, { pose: { ...session.lastPose, speed: 1, steer: .3, z: session.lastPose.z + .2 } });
  for (let index = 0; index < 20; index++) session = tick(session, { pose: { ...session.lastPose, speed: 0 } });
  session = tick(session, { events: [{ id: 'later-observation', type: 'observation', title: '稍后发生的观察错误', detail: '这不是本次回退点对应的首错。' }] });
  session = finishCoursePractice(session);
  const before = structuredClone(session), guidance = getCourseReviewGuidance(session), retry = retryCoursePractice(session);
  assert.match(session.review.summary, /稍后发生/);
  assert.match(guidance.summary, /2 条操作或风险记录/); assert.doesNotMatch(guidance.summary, /稍后发生/);
  assert.equal(guidance.focusLabel, '先改哪项');
  assert.equal(guidance.primaryId, 'straight:large-steering');
  assert.match(guidance.focus, /先改这一项/); assert.doesNotMatch(guidance.focus, /稍后发生/);
  assert.match(guidance.action, /松开方向键会保留转角/); assert.match(guidance.action, /X 主动回正/);
  assert.match(guidance.action, /暂停时按 X 不会回正/);
  assert.match(guidance.action, /X 回中的是前轮，车身方向仍要对照道路判断/);
  assert.ok(guidance.action.indexOf('按 P 恢复控制') < guidance.action.indexOf('按 X 主动回正'), 'resume must precede the corrective steering input');
  assert.match(guidance.retryPoint, /暂停时可先观察或设灯，按 P 恢复控制后再执行转向和踏板操作/);
  assert.doesNotMatch(guidance.retryPoint, /先处理本卡提示再按 P/);
  assert.ok(guidance.retryPoint.includes(retry.session.elapsed.toFixed(1)));
  assert.deepEqual(session, before, 'guidance must not mutate the lesson, retry, metrics or error list');
});

test('a preceding nonblocking clearance warning does not displace the observation error that owns retry', () => {
  let session = start('intersection');
  session = tick(session, { events: [{ id: 'near:car', type: 'proximity', title: '余量提醒', detail: '请保持间距。' }] });
  session = tick(session, { events: [{ id: 'front-conflict:intersection', type: 'observation', title: '路口前方观察未记录', detail: '未记录前方扫描，不等于认定道路有危险。' }] });
  const reviewed = finishCoursePractice(session), guidance = getCourseReviewGuidance(reviewed);
  assert.equal(guidance.primaryId, 'front-conflict:intersection');
  assert.match(guidance.action, /1 看前左方、3 看前右方、C 看正前方/);
  assert.match(guidance.action, /外镜不能代替/); assert.doesNotMatch(guidance.action, /未确认交通安全|道路不安全/);
  assert.equal(reviewed.review.errors.length, 2);
});

test('incomplete and completed reviews suggest different next actions and never invent an error', () => {
  const incomplete = finishCoursePractice(start('prepare'));
  const guide = getCourseReviewGuidance(incomplete);
  assert.equal(guide.focusLabel, '接下来');
  assert.equal(guide.primaryId, null); assert.match(guide.action, /按 C/); assert.match(guide.retryPoint, /继续完成目标/);
  assert.match(guide.retryPoint, /按 P 恢复控制后再执行转向和踏板操作/);
  let complete = start('prepare');
  for (const gaze of ['forward', 'left', 'right', 'rear', 'left-back', 'right-back']) complete = recordCourseObservation(complete, gaze);
  assert.equal(complete.review.outcome, 'complete');
  const completed = getCourseReviewGuidance(complete);
  assert.match(completed.focus, /选择下一章/); assert.doesNotMatch(completed.focus, /错误/);
  assert.match(completed.retryPoint, /从本项起点重练/);
});

test('stationary lighting retries identify the preserved question, not a meaningless zero-second rewind', () => {
  let session = start('lights');
  session = tick(session, { pose: { ...session.lastPose, lightMode: 'low' }, dt: 0 });
  assert.equal(session.lightIndex, 1);
  session = tick(session, { pose: { ...session.lastPose, lightMode: 'fog' }, dt: 0 });
  session = finishCoursePractice(session);
  const guide = getCourseReviewGuidance(session);
  assert.match(guide.action, /远光灯/); assert.match(guide.retryPoint, /第 2 道灯光题/);
  assert.doesNotMatch(guide.retryPoint, /0\.0 秒/);
  assert.equal(retryCoursePractice(session).session.lightIndex, 1);
});

test('mirror-only risk explains the real component and does not prescribe a steering side', () => {
  let session = start('straight');
  session = tick(session, { events: [{ id: 'mirror:right-mirror-stalk:post', type: 'mirror-contact', severity: 'danger', blocking: true,
    title: '右后视镜支架与标杆擦碰风险', detail: '已暂停在接触前。', partId: 'right-mirror-stalk', partLabel: '右后视镜支架', side: 'right' }] });
  const guide = getCourseReviewGuidance(session);
  assert.match(guide.focus, /支架/); assert.match(guide.action, /E 看右外镜/);
  assert.match(guide.action, /车身和轮胎没压线/); assert.doesNotMatch(guide.action, /向左打|向右打|左打|右打/);
});

test('mid-chapter initial retry and a missing snapshot never promise an earlier safe chapter position', () => {
  const chapter = chapters.find(item => item.id === 'reverse-parking'), pose = sampleChapterPose(chapter, 55);
  const driving = createCourseDrivingSession(chapter, pose);
  let session = createCoursePractice(chapter, { driving, initialPose: pose });
  session = tick(session, { events: [{ id: 'instruction:first', type: 'instruction', title: '接手后的操作需纠正', detail: '请从有效位置重练。' }] });
  const reviewed = finishCoursePractice(session), guide = getCourseReviewGuidance(reviewed);
  assert.match(guide.retryPoint, /本次接手位置，不是整章起点/);
  const missing = getCourseReviewGuidance({ ...reviewed, retrySnapshot: null, history: [], review: { ...reviewed.review, retryAvailable: false } });
  assert.equal(missing.canRetry, false); assert.match(missing.retryPoint, /没有可用的车辆快照/);
});

test('side-specific lane guidance uses the correct controls while ordinary turns do not claim a lane-change task', () => {
  for (const [id, side, key, mirror, blind] of [['lane-change', 'right', 'L', 'E', 'B'], ['left-turn', 'left', 'J', 'Q', 'Z']]) {
    let session = start(id);
    session = tick(session, { events: [{ id: `turn-observation:${side}`, type: 'observation', title: '同侧观察未记录', detail: '请操作前观察。' }] });
    const guide = getCourseReviewGuidance(finishCoursePractice(session));
    for (const letter of [key, mirror, blind]) assert.ok(guide.action.includes(letter));
    if (id === 'left-turn') assert.doesNotMatch(guide.action, /全车入道|变道/);
  }
});

test('low-zone corrections name the actual teaching target and observe-before-exit rule without claiming an exam limit', () => {
  let session = start('school');
  session = tick(session, { events: [{ id: 'speed-zone:school', type: 'instruction', title: '本段教学低速未保持', detail: '请持续低速通过。' }] });
  const speed = getCourseReviewGuidance(finishCoursePractice(session));
  assert.match(speed.action, /教学目标约 16 km\/h/); assert.match(speed.action, /空格平稳减速/); assert.doesNotMatch(speed.action, /实考限速/);
  session = start('school');
  session = tick(session, { events: [{ id: 'zone-observation:school', type: 'observation', title: '区域内观察记录不完整', detail: '离开后补看不能追认。' }] });
  const observation = getCourseReviewGuidance(finishCoursePractice(session));
  assert.match(observation.action, /有效观察窗口/); assert.match(observation.action, /驶出后补看不会补记/);
});

test('successful long drives label the retained recent snapshot honestly instead of claiming it is the attempt start', () => {
  let session = start('straight');
  session = recordCourseObservation(recordCourseObservation(session, 'forward'), 'rear');
  for (let t = .1; t <= session.chapter.duration + .1 && session.phase !== 'review'; t += .1) {
    session = tick(session, { pose: sampleChapterPose(session.chapter, Math.min(t, session.chapter.duration)), dt: .1 });
  }
  assert.equal(session.review.outcome, 'complete'); assert.ok(session.history[0].elapsed > 10);
  const guide = getCourseReviewGuidance(session), retry = retryCoursePractice(session);
  assert.ok(guide.retryButtonLabel.includes(retry.session.elapsed.toFixed(1)));
  assert.doesNotMatch(guide.retryButtonLabel, /起点|出错/);
  assert.match(guide.retryPoint, /想重做整章/);
});
