export function createCoursePlayback(course) {
  return { course, index: 0, time: 0, phase: 'ready', token: 0,
    rate: 1, voice: true, continuous: true, checkpointPause: false,
    stepCoaching: true, cueIndex: -1, pendingCue: null, speechKind: 'intro', chapterBriefed: false };
}
const bound = (x, low, high) => Math.max(low, Math.min(high, x));
const stepsOf = state => state.course.chapters[state.index].teachingSteps ?? [];
/** Ready (including muted ready) and the held chapter-introduction audio share
 * the overview camera/card. Explicit mid-course seeks and single-step replay
 * are already briefed and must not be forced back into this opening stage. */
export const isCourseOverview = state => Boolean(state && !state.chapterBriefed && state.time === 0 && state.speechKind === 'intro'
  && ['ready', 'narrating', 'lecture-paused', 'speech-error'].includes(state.phase));
export const courseCueGate = step => Math.max(0, step.t - .35);
const currentStepAt = (steps, time) => steps.reduce((index, step, i) => step.t <= time + 1e-7 ? i : index, -1);
function beginCue(state, index, time = state.time) {
  return { ...state, time, phase: 'narrating', speechKind: 'cue', pendingCue: index, chapterBriefed: true, token: state.token + 1 };
}
function consumedCue(state) {
  return state.speechKind === 'cue' && Number.isInteger(state.pendingCue)
    ? Math.max(state.cueIndex ?? -1, state.pendingCue) : state.cueIndex ?? -1;
}
export function selectCourseChapter(state, index, time = 0, { skipOverview = false } = {}) {
  const nextIndex = bound(Math.floor(index), 0, state.course.chapters.length - 1);
  const nextTime = bound(time, 0, state.course.chapters[nextIndex].duration);
  const active = currentStepAt(state.course.chapters[nextIndex].teachingSteps ?? [], nextTime);
  return { ...state, index: nextIndex, time: nextTime,
    phase: nextTime > 0 ? 'paused' : 'ready', token: state.token + 1,
    cueIndex: Math.max(-1, active - 1), pendingCue: null, speechKind: 'intro', chapterBriefed: Boolean(skipOverview || nextTime > 0) };
}
export function beginCourseChapter(state) {
  // Muted ready still exposes the visual overview, but pressing play keeps the
  // original silent continuous-demo behaviour rather than adding a timed hold.
  if (!state.voice) return { ...state, chapterBriefed: true, phase: 'playing', pendingCue: null, token: state.token + 1 };
  if (state.phase === 'speech-error' && state.speechKind === 'cue' && Number.isInteger(state.pendingCue)) return beginCue(state, state.pendingCue);
  if (!state.chapterBriefed) return { ...state, phase: 'narrating', speechKind: 'intro', pendingCue: null, token: state.token + 1 };
  const steps = stepsOf(state);
  if (state.stepCoaching && steps.length) {
    const index = (state.cueIndex ?? -1) + 1, next = steps[index];
    return next && courseCueGate(next) <= state.time + 1e-7 ? beginCue(state, index)
      : { ...state, phase: 'playing', pendingCue: null, token: state.token + 1 };
  }
  return { ...state, phase: 'playing', pendingCue: null, token: state.token + 1 };
}
export function replayCourseTeachingStep(state, index) {
  const steps = stepsOf(state), target = bound(Math.floor(index), 0, steps.length - 1);
  if (!steps[target]) return state;
  const selected = selectCourseChapter(state, state.index, state.voice ? courseCueGate(steps[target]) : steps[target].t, { skipOverview: true });
  return beginCourseChapter({ ...selected, stepCoaching: true, cueIndex: target - 1 });
}
export function finishCourseNarration(state, token, outcome) {
  if (state.token !== token || !['narrating', 'lecture-paused'].includes(state.phase)) return state;
  // Completing an intro does not consume its first operation cue. Resume the
  // simulation loop; advance() then gates that cue at the unchanged start time.
  // Returning a second narrating phase directly here would bypass the caller's
  // phase/token edge that starts its next audio clip.
  if (outcome === 'ended') return { ...state, chapterBriefed: true, phase: state.phase === 'lecture-paused' ? 'paused' : 'playing', cueIndex: consumedCue(state), pendingCue: null };
  if (outcome === 'cancelled') return state;
  return { ...state, phase: 'speech-error' };
}
export function toggleCoursePlayback(state) {
  if (state.phase === 'narrating') return { ...state, phase: 'lecture-paused' };
  if (state.phase === 'lecture-paused') return { ...state, phase: 'narrating' };
  if (state.phase === 'playing') return { ...state, phase: 'paused' };
  if (state.phase === 'paused') {
    if (!state.chapterBriefed) return beginCourseChapter(state);
    const steps = stepsOf(state), next = steps[(state.cueIndex ?? -1) + 1];
    return state.voice && state.stepCoaching && next && courseCueGate(next) <= state.time + 1e-7
      ? beginCue(state, (state.cueIndex ?? -1) + 1) : { ...state, phase: 'playing' };
  }
  if (state.phase === 'ended') return beginCourseChapter(selectCourseChapter(state, 0));
  if (state.phase === 'checkpoint') {
    return beginCourseChapter(selectCourseChapter(state, state.index + 1));
  }
  return beginCourseChapter(state);
}
export function skipCourseNarration(state, { paused = false } = {}) {
  return { ...state, chapterBriefed: state.chapterBriefed || state.speechKind === 'intro', phase: paused ? 'paused' : 'playing', token: state.token + 1, cueIndex: consumedCue(state), pendingCue: null };
}
export function advanceCoursePlayback(state, dt) {
  if (state.phase !== 'playing' || !Number.isFinite(dt) || dt <= 0) return state;
  const duration = state.course.chapters[state.index].duration;
  const time = Math.min(duration, state.time + Math.min(dt, .25) * state.rate);
  const steps = stepsOf(state), nextIndex = (state.cueIndex ?? -1) + 1, next = steps[nextIndex];
  if (state.voice && state.stepCoaching && next && courseCueGate(next) <= time + 1e-7) {
    return beginCue(state, nextIndex, Math.max(state.time, courseCueGate(next)));
  }
  const cueIndex = !state.voice || !state.stepCoaching ? Math.max(state.cueIndex ?? -1, currentStepAt(steps, time)) : state.cueIndex;
  if (time < duration) return { ...state, time, cueIndex };
  if (state.index === state.course.chapters.length - 1) return { ...state, time, phase: 'ended' };
  if (!state.continuous || state.checkpointPause) return { ...state, time, phase: 'checkpoint' };
  return beginCourseChapter(selectCourseChapter(state, state.index + 1));
}
export function courseTimeline(state) {
  const durations = state.course.chapters.map(chapter => chapter.duration);
  return { total: durations.reduce((a, b) => a + b, 0),
    elapsed: durations.slice(0, state.index).reduce((a, b) => a + b, 0) + state.time };
}
export function seekCourseTimeline(state, seconds) {
  const { total } = courseTimeline(state);
  let remaining = bound(Number.isFinite(seconds) ? seconds : 0, 0, total);
  for (let index = 0; index < state.course.chapters.length; index++) {
    const duration = state.course.chapters[index].duration;
    if (remaining < duration || index === state.course.chapters.length - 1) {
      return { ...selectCourseChapter(state, index, remaining, { skipOverview: true }), phase: 'paused' };
    }
    remaining -= duration;
  }
  return state;
}
