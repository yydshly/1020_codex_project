import test from 'node:test';
import assert from 'node:assert/strict';
import { EXAM_COURSES, EXAM_NARRATION, sampleChapterPose } from './exam-courses.js';
import { COURSE_CUE_NARRATION, getCourseTeachingSteps } from './course-coaching.js';
import { createCoursePlayback, beginCourseChapter, advanceCoursePlayback, finishCourseNarration, courseCueGate, replayCourseTeachingStep,
  toggleCoursePlayback, skipCourseNarration, isCourseOverview } from './course-playback.js';
import { CAR } from './vehicle.js';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { courseObservationPlaybackRate, sampleCourseObservationPlan } from './course-observation-plan.js';

test('production action timing preserves mirror, shoulder and front checks before the next spoken cue at 4x', () => {
  const source = readFileSync(new URL('./full-courses.js', import.meta.url), 'utf8');
  const fn = source.slice(source.indexOf('function actionObservationTiming()'), source.indexOf('function autoObservationInput()'));
  for (const id of ['left-turn', 'uturn']) {
    const original = EXAM_COURSES.subject3.chapters.find(c => c.id === id);
    const chapter = { ...original, teachingSteps: getCourseTeachingSteps(original) };
    let state = replayCourseTeachingStep({ ...createCoursePlayback({ chapters: [chapter] }), rate: 4 }, 0);
    state = finishCourseNarration(state, state.token, 'ended');
    const context = { playback: state, chapter: () => chapter, teachingStep: () => chapter.teachingSteps[0], teachingIndex: () => 0,
      isDriving: () => false, viewFollow: { enabled: true, manualOverride: false }, courseCueGate, courseObservationPlaybackRate };
    const timing = runInNewContext(`${fn}; actionObservationTiming`, context), dwell = new Map();
    const first = timing();
    assert.ok(first.rate < 4); assert.equal(first.duration, courseCueGate(chapter.teachingSteps[1]));
    for (let frame = 0; frame < 1000 && state.phase === 'playing'; frame++) {
      context.playback = state;
      const { duration, rate } = timing();
      const target = sampleCourseObservationPlan(chapter, chapter.teachingSteps[0], { elapsed: state.time, duration, rate });
      dwell.set(target.gaze, (dwell.get(target.gaze) || 0) + .01);
      state = advanceCoursePlayback(state, .01 * rate / state.rate);
    }
    assert.equal(state.phase, 'narrating'); assert.equal(state.pendingCue, 1);
    for (const gaze of ['left', 'left-back', 'forward']) assert.ok(dwell.get(gaze) >= 1, `${id} ${gaze} must remain readable before the next cue`);
    context.viewFollow.manualOverride = true; assert.equal(timing().rate, 4);
    context.viewFollow.manualOverride = false; context.viewFollow.enabled = false; assert.equal(timing().rate, 4);
    context.viewFollow.enabled = true; context.playback = { ...state, voice: false };
    assert.equal(timing().duration, chapter.teachingSteps[1].t);
  }
});

test('both whole courses visit every synchronized instruction exactly once without skipping at 4x', () => {
  const allHeard = [], allIntros = [];
  for (const original of Object.values(EXAM_COURSES)) {
    const course = { ...original, chapters: original.chapters.map(c => ({ ...c, teachingSteps: getCourseTeachingSteps(c) })) };
    const expected = course.chapters.flatMap(c => c.teachingSteps.map(s => s.narrationKey));
    const heard = [], intros = [];
    let state = beginCourseChapter({ ...createCoursePlayback(course), rate: 4 });
    for (let frame = 0; frame < 20000 && state.phase !== 'ended'; frame++) {
      const chapter = course.chapters[state.index];
      if (state.phase === 'narrating') {
        assert.strictEqual(advanceCoursePlayback(state, .25), state);
        if (state.speechKind === 'intro') {
          assert.equal(isCourseOverview(state), true); assert.equal(state.time, 0); assert.equal(state.pendingCue, null);
          assert.ok(EXAM_NARRATION[chapter.narrationKey]?.text);
          intros.push(chapter.narrationKey);
        } else {
          assert.equal(state.speechKind, 'cue');
          const cue = chapter.teachingSteps[state.pendingCue];
          assert.ok(Math.abs(state.time - courseCueGate(cue)) < 1e-7);
          assert.ok(COURSE_CUE_NARRATION[cue.narrationKey]?.text);
          heard.push(cue.narrationKey);
        }
        state = finishCourseNarration(state, state.token, 'ended');
      } else {
        const pose = sampleChapterPose(chapter, state.time);
        assert.ok([pose.x, pose.z, pose.speed, pose.steer, pose.heading].every(Number.isFinite));
        state = advanceCoursePlayback(state, .1);
      }
    }
    assert.equal(state.phase, 'ended');
    assert.deepEqual(heard, expected);
    assert.deepEqual(intros, course.chapters.map(chapter => chapter.narrationKey));
    allHeard.push(...heard);
    allIntros.push(...intros);
  }
  assert.equal(allHeard.length, 121); assert.equal(allIntros.length, 22);
  assert.deepEqual(new Set(allHeard), new Set(Object.keys(COURSE_CUE_NARRATION)));
  assert.deepEqual(new Set(allIntros), new Set(Object.keys(EXAM_NARRATION)));
});

test('a simulated-light instruction holds the old switch state until the spoken reminder finishes', () => {
  const chapter = EXAM_COURSES.subject3.chapters.find(c => c.id === 'lights');
  const course = { chapters: [{ ...chapter, teachingSteps: getCourseTeachingSteps(chapter) }] };
  let state = beginCourseChapter(createCoursePlayback(course));
  assert.equal(state.speechKind, 'intro'); assert.equal(state.time, 0);
  state = finishCourseNarration(state, state.token, 'ended');
  while (state.phase === 'playing') state = advanceCoursePlayback(state, .1);
  assert.equal(state.pendingCue, 0); assert.equal(state.time, 0, 'the first operation is still held after the overview');
  state = finishCourseNarration(state, state.token, 'ended');
  while (state.phase === 'playing') state = advanceCoursePlayback(state, .1);
  assert.equal(state.pendingCue, 1);
  assert.equal(sampleChapterPose(chapter, state.time).lightMode, 'off');
  state = finishCourseNarration(state, state.token, 'ended');
  while (state.time < 4.1) state = advanceCoursePlayback(state, .1);
  assert.equal(sampleChapterPose(chapter, state.time).lightMode, 'low');
});

test('all actual chapter openings keep the start pose through a paused intro and reach cue zero without moving or dropping its reminder', () => {
  for (const original of Object.values(EXAM_COURSES).flatMap(course => course.chapters)) {
    const chapter = { ...original, teachingSteps: getCourseTeachingSteps(original) }, course = { chapters: [chapter] };
    let state = beginCourseChapter(createCoursePlayback(course));
    const initial = sampleChapterPose(chapter, 0);
    state = toggleCoursePlayback(state);
    assert.equal(isCourseOverview(state), true);
    assert.strictEqual(advanceCoursePlayback(state, .25), state);
    assert.deepEqual(sampleChapterPose(chapter, state.time), initial);
    state = finishCourseNarration(state, state.token, 'ended');
    assert.equal(state.phase, 'paused'); assert.equal(state.cueIndex, -1); assert.equal(state.chapterBriefed, true);
    state = toggleCoursePlayback(state);
    assert.equal(state.speechKind, 'cue'); assert.equal(state.pendingCue, 0); assert.equal(state.time, 0);
    assert.deepEqual(sampleChapterPose(chapter, state.time), initial);
    const skipped = skipCourseNarration(beginCourseChapter(createCoursePlayback(course)));
    const firstCue = advanceCoursePlayback(skipped, .25);
    assert.equal(firstCue.pendingCue, 0); assert.equal(firstCue.time, 0); assert.equal(firstCue.speechKind, 'cue');
    assert.equal(firstCue.cueIndex, -1, `${chapter.id}: skipping an overview must not consume its first reminder`);
  }
});

test('chapters decorated with teaching steps use the same physical sampler as the original runtime chapter', () => {
  for (const [subject, id, t] of [['subject3', 'crosswalk', 14.1], ['subject2', 'hill-start', 2.05], ['subject3', 'lane-change', 6.5]]) {
    const original = EXAM_COURSES[subject].chapters.find(c => c.id === id);
    const decorated = { ...original, teachingSteps: getCourseTeachingSteps(original) };
    const p = sampleChapterPose(decorated, t), a = sampleChapterPose(decorated, t - .001), b = sampleChapterPose(decorated, t + .001);
    const pathSpeed = Math.hypot(b.x - a.x, b.z - a.z) / .002;
    assert.ok(Math.abs(pathSpeed - Math.abs(p.speed)) < .0002, `${id}: teaching metadata must not bypass motion sampling`);
    const yawRate = Math.atan2(Math.sin(b.heading - a.heading), Math.cos(b.heading - a.heading)) / .002;
    assert.ok(Math.abs(yawRate - p.speed / CAR.wheelbase * Math.tan(p.steer)) < .0002, `${id}: wheel and body must agree in the player`);
    assert.deepEqual(p, sampleChapterPose(original, t));
  }
});

test('replaying a chosen light operation speaks before changing its switch, even when overview was selected', () => {
  const original = EXAM_COURSES.subject3.chapters.find(c => c.id === 'lights');
  const chapter = { ...original, teachingSteps: getCourseTeachingSteps(original) };
  let state = replayCourseTeachingStep({ ...createCoursePlayback({ chapters: [chapter] }), stepCoaching: false }, 1);
  assert.equal(state.phase, 'narrating'); assert.equal(state.pendingCue, 1);
  assert.equal(state.time, 3.65); assert.equal(state.stepCoaching, true);
  assert.equal(sampleChapterPose(chapter, state.time).lightMode, 'off');
  state = finishCourseNarration(state, state.token, 'ended');
  for (let i = 0; i < 6; i++) state = advanceCoursePlayback(state, .1);
  assert.equal(sampleChapterPose(chapter, state.time).lightMode, 'low');
});
