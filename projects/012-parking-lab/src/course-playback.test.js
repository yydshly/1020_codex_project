import test from 'node:test';
import assert from 'node:assert/strict';
import { createCoursePlayback, selectCourseChapter, beginCourseChapter, finishCourseNarration,
  toggleCoursePlayback, skipCourseNarration, advanceCoursePlayback, courseTimeline, seekCourseTimeline, replayCourseTeachingStep, isCourseOverview } from './course-playback.js';
const course = { chapters: [{ duration: 1 }, { duration: 2 }, { duration: 1 }] };
test('continuous narration and action advance through every chapter and stop at the end', () => {
  let state = beginCourseChapter(createCoursePlayback(course));
  const seen = new Set();
  for (let i = 0; i < 100 && state.phase !== 'ended'; i++) {
    seen.add(state.index);
    if (state.phase === 'narrating') state = finishCourseNarration(state, state.token, 'ended');
    state = advanceCoursePlayback(state, .25);
  }
  assert.deepEqual([...seen], [0, 1, 2]);
  assert.equal(state.phase, 'ended');
  assert.deepEqual(courseTimeline(state), { total: 4, elapsed: 4 });
  assert.equal(toggleCoursePlayback(state).index, 0);
});
test('jumping and skipping invalidate pending narration so old audio cannot start another chapter', () => {
  const old = beginCourseChapter(createCoursePlayback(course));
  const selected = selectCourseChapter(old, 2);
  assert.strictEqual(finishCourseNarration(selected, old.token, 'ended'), selected);
  const skipped = skipCourseNarration(old);
  assert.strictEqual(finishCourseNarration(skipped, old.token, 'error'), skipped);
});
test('lecture pause and action pause freeze different phases and neither advances movement', () => {
  const speaking = beginCourseChapter(createCoursePlayback(course));
  const pause = toggleCoursePlayback(speaking);
  assert.equal(pause.phase, 'lecture-paused');
  assert.strictEqual(advanceCoursePlayback(pause, .25), pause);
  const completedWhilePaused = finishCourseNarration(pause, pause.token, 'ended');
  assert.equal(completedWhilePaused.phase, 'paused');
  assert.equal(toggleCoursePlayback(completedWhilePaused).phase, 'playing');
});
test('chapter checkpoint waits and resumes to the next project rather than replaying the finished one', () => {
  let state = { ...createCoursePlayback(course), voice: false, checkpointPause: true };
  state = beginCourseChapter(state);
  for (let i = 0; i < 4; i++) state = advanceCoursePlayback(state, .25);
  assert.equal(state.phase, 'checkpoint');
  state = toggleCoursePlayback(state);
  assert.equal(state.index, 1); assert.equal(state.time, 0); assert.equal(state.phase, 'playing');
});
test('global seeking selects the correct chapter, stops playback and preserves user settings', () => {
  const state = { ...createCoursePlayback(course), rate: 4, voice: false };
  const seek = seekCourseTimeline(state, 2.5);
  assert.equal(seek.index, 1); assert.equal(seek.time, 1.5); assert.equal(seek.phase, 'paused');
  assert.equal(seek.rate, 4); assert.equal(seek.voice, false);
  assert.equal(seekCourseTimeline(state, 100).index, 2);
  assert.equal(seekCourseTimeline(state, -10).time, 0);
});
test('speech errors require an explicit user choice and cannot silently start motion', () => {
  const state = beginCourseChapter(createCoursePlayback(course));
  const failed = finishCourseNarration(state, state.token, 'error');
  assert.equal(failed.phase, 'speech-error');
  assert.strictEqual(advanceCoursePlayback(failed, .25), failed);
  assert.equal(skipCourseNarration(failed).phase, 'playing');
});

test('muting a paused lecture preserves the learner pause and cancels the old narration token', () => {
  const lecture = beginCourseChapter(createCoursePlayback(course));
  const paused = toggleCoursePlayback(lecture);
  const muted = skipCourseNarration(paused, { paused: true });
  assert.equal(muted.phase, 'paused');
  assert.strictEqual(advanceCoursePlayback(muted, .25), muted);
  assert.strictEqual(finishCourseNarration(muted, lecture.token, 'ended'), muted);
  assert.equal(toggleCoursePlayback(muted).phase, 'playing');
});

const coached = { chapters: [{ duration: 5, teachingSteps: [{ t: 0 }, { t: 1 }, { t: 3 }] }, { duration: 1, teachingSteps: [{ t: 0 }] }] };
test('synchronized coaching gates each operation before its action, including at four-times speed', () => {
  let state = beginCourseChapter({ ...createCoursePlayback(coached), rate: 4 });
  assert.equal(state.speechKind, 'intro'); assert.equal(state.chapterBriefed, false); assert.equal(state.time, 0);
  state = finishCourseNarration(state, state.token, 'ended');
  state = advanceCoursePlayback(state, .001);
  assert.equal(state.speechKind, 'cue'); assert.equal(state.pendingCue, 0);
  state = finishCourseNarration(state, state.token, 'ended');
  state = advanceCoursePlayback(state, .25);
  assert.equal(state.time, .65); assert.equal(state.pendingCue, 1); assert.equal(state.phase, 'narrating');
  assert.strictEqual(advanceCoursePlayback(state, .25), state);
  state = finishCourseNarration(state, state.token, 'ended');
  state = advanceCoursePlayback(state, .25);
  assert.equal(state.phase, 'playing');
  state = advanceCoursePlayback(state, .25);
  assert.equal(state.time, 2.65); assert.equal(state.pendingCue, 2);
});
test('pausing or muting a synchronized cue never advances the vehicle or replays the consumed cue', () => {
  let state = beginCourseChapter(createCoursePlayback(coached));
  state = advanceCoursePlayback(finishCourseNarration(state, state.token, 'ended'), .001);
  state = toggleCoursePlayback(state);
  state = skipCourseNarration(state, { paused: true });
  assert.equal(state.phase, 'paused'); assert.equal(state.cueIndex, 0);
  state = toggleCoursePlayback(state);
  assert.equal(state.phase, 'playing');
  assert.equal(advanceCoursePlayback(state, .1).time, .1);
});
test('seek resumes with the current operation reminder without rewinding or replaying earlier steps', () => {
  let state = seekCourseTimeline(createCoursePlayback(coached), 2);
  state = toggleCoursePlayback(state);
  assert.equal(state.phase, 'narrating'); assert.equal(state.pendingCue, 1); assert.equal(state.time, 2);
  state = finishCourseNarration(state, state.token, 'ended');
  assert.equal(advanceCoursePlayback(state, .1).time, 2.1);
});
test('voice off runs all actions continuously and original chapter-overview narration remains selectable', () => {
  let state = beginCourseChapter({ ...createCoursePlayback(coached), voice: false, rate: 4 });
  for (let i = 0; i < 8; i++) state = advanceCoursePlayback(state, .25);
  assert.equal(state.phase, 'ended');
  const overview = beginCourseChapter({ ...createCoursePlayback(coached), stepCoaching: false });
  assert.equal(overview.speechKind, 'intro');
  assert.equal(advanceCoursePlayback(finishCourseNarration(overview, overview.token, 'ended'), .25).phase, 'playing');
});
test('cue failure retries the same operation and a late old clip cannot release the hold', () => {
  const intro = beginCourseChapter(createCoursePlayback(coached));
  const start = advanceCoursePlayback(finishCourseNarration(intro, intro.token, 'ended'), .001);
  const failed = finishCourseNarration(start, start.token, 'error');
  const retry = beginCourseChapter(failed);
  assert.equal(retry.pendingCue, 0); assert.equal(retry.speechKind, 'cue');
  assert.strictEqual(finishCourseNarration(retry, start.token, 'ended'), retry);
});
test('a completed cue while lecture-paused stays paused, and the next chapter starts its own intro before its first cue', () => {
  const intro = beginCourseChapter(createCoursePlayback(coached));
  let state = toggleCoursePlayback(advanceCoursePlayback(finishCourseNarration(intro, intro.token, 'ended'), .001));
  state = finishCourseNarration(state, state.token, 'ended');
  assert.equal(state.phase, 'paused'); assert.equal(state.cueIndex, 0);
  state = beginCourseChapter(selectCourseChapter(state, 1));
  assert.equal(state.speechKind, 'intro'); assert.equal(state.chapterBriefed, false);
  assert.equal(state.pendingCue, null); assert.equal(state.cueIndex, -1);
  state = advanceCoursePlayback(finishCourseNarration(state, state.token, 'ended'), .001);
  assert.equal(state.pendingCue, 0); assert.equal(state.cueIndex, -1);
});

test('every fresh chapter overview holds the original start while its intro completes, without consuming step zero', () => {
  let state = createCoursePlayback(coached);
  assert.equal(isCourseOverview(state), true);
  state = beginCourseChapter(state);
  const introToken = state.token;
  assert.equal(isCourseOverview(state), true); assert.equal(state.phase, 'narrating');
  assert.strictEqual(advanceCoursePlayback(state, 100), state);
  state = finishCourseNarration(state, introToken, 'ended');
  assert.equal(isCourseOverview(state), false); assert.equal(state.phase, 'playing'); assert.equal(state.time, 0);
  assert.equal(state.chapterBriefed, true); assert.equal(state.cueIndex, -1); assert.equal(state.pendingCue, null);
  state = advanceCoursePlayback(state, .25);
  assert.equal(state.pendingCue, 0); assert.equal(state.speechKind, 'cue'); assert.equal(state.time, 0);
  assert.strictEqual(finishCourseNarration(state, introToken, 'ended'), state, 'a late intro completion cannot release the new first cue');
});

test('paused intro completion and skipping preserve the pause and still leave the first operation reminder unconsumed', () => {
  for (const finish of [state => finishCourseNarration(state, state.token, 'ended'), state => skipCourseNarration(state, { paused: true })]) {
    const intro = beginCourseChapter(createCoursePlayback(coached)), paused = toggleCoursePlayback(intro);
    assert.equal(isCourseOverview(paused), true);
    let state = finish(paused);
    assert.equal(state.phase, 'paused'); assert.equal(state.chapterBriefed, true); assert.equal(state.cueIndex, -1); assert.equal(state.time, 0);
    assert.strictEqual(advanceCoursePlayback(state, .25), state);
    state = toggleCoursePlayback(state);
    assert.equal(state.speechKind, 'cue'); assert.equal(state.pendingCue, 0); assert.equal(state.time, 0);
  }
  const intro = beginCourseChapter(createCoursePlayback(coached));
  const skipped = skipCourseNarration(intro);
  assert.equal(skipped.phase, 'playing'); assert.equal(skipped.cueIndex, -1);
  assert.equal(advanceCoursePlayback(skipped, .1).pendingCue, 0);
});

test('intro errors retry the intro, retain the overview and reject callbacks from the replaced clip', () => {
  const intro = beginCourseChapter(createCoursePlayback(coached));
  const failed = finishCourseNarration(intro, intro.token, 'error');
  assert.equal(isCourseOverview(failed), true); assert.equal(failed.phase, 'speech-error');
  const retry = beginCourseChapter(failed);
  assert.equal(retry.speechKind, 'intro'); assert.equal(retry.pendingCue, null); assert.equal(retry.chapterBriefed, false);
  assert.strictEqual(finishCourseNarration(retry, intro.token, 'ended'), retry);
  assert.strictEqual(finishCourseNarration(retry, retry.token, 'cancelled'), retry);
});

test('step zero replay, paused step selection and global seeks bypass the chapter overview without changing the requested position', () => {
  const initial = createCoursePlayback(coached);
  const replay = replayCourseTeachingStep(initial, 0);
  assert.equal(replay.chapterBriefed, true); assert.equal(replay.speechKind, 'cue'); assert.equal(replay.pendingCue, 0); assert.equal(replay.time, 0);
  const selected = { ...selectCourseChapter(initial, 0, 0, { skipOverview: true }), phase: 'paused' };
  assert.equal(isCourseOverview(selected), false); assert.equal(toggleCoursePlayback(selected).pendingCue, 0);
  for (const [seconds, index, time] of [[0, 0, 0], [2, 0, 2], [5, 1, 0]]) {
    const sought = seekCourseTimeline(initial, seconds);
    assert.equal(sought.chapterBriefed, true); assert.equal(isCourseOverview(sought), false);
    assert.equal(sought.index, index); assert.equal(sought.time, time);
    assert.equal(toggleCoursePlayback(sought).speechKind, 'cue');
  }
  assert.equal(selectCourseChapter(initial, 0, 2).chapterBriefed, true);
  assert.equal(isCourseOverview(selectCourseChapter(replay, 0)), true, 'explicit chapter replay resets the opening stage');
});

test('overview-only mode plays one intro per chapter and muted complete courses keep their continuous action behaviour', () => {
  let state = beginCourseChapter({ ...createCoursePlayback(coached), stepCoaching: false });
  state = finishCourseNarration(state, state.token, 'ended');
  assert.equal(beginCourseChapter(state).phase, 'playing', 'the completed chapter intro must not be started a second time');
  state = { ...createCoursePlayback(coached), voice: false, rate: 4 };
  assert.equal(isCourseOverview(state), true, 'silent ready still exposes the overview before the learner starts');
  state = beginCourseChapter(state);
  assert.equal(isCourseOverview(state), false); assert.equal(state.chapterBriefed, true); assert.equal(state.phase, 'playing');
  for (let index = 0; index < 10 && state.phase !== 'ended'; index++) {
    state = advanceCoursePlayback(state, .25);
    assert.notEqual(state.phase, 'narrating'); assert.notEqual(state.phase, 'ready');
  }
  assert.equal(state.phase, 'ended');
});
