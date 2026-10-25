import { COURSE_GAZES } from './course-observation.js';
import { COURSE_FOLLOW_VIEWS } from './course-view-follow.js';

/** An isolated observation snapshot, separate from vehicle/practice progress.
 * Demonstration camera changes and temporary mirror edits cannot mutate the
 * practice the learner left. Restoring this data must use non-recording camera
 * setters, since returning is not another deliberate safety observation. */
export function captureCoursePracticeView(state = {}) {
  return {
    view: COURSE_FOLLOW_VIEWS.includes(state.view) ? state.view : 'driver',
    gaze: COURSE_GAZES.includes(state.gaze) ? state.gaze : 'forward',
    mirrorZoom: ['left', 'right'].includes(state.mirrorZoom) ? state.mirrorZoom : null,
    mirrorZoomProjection: state.mirrorZoomProjection === 'unfolded' ? 'unfolded' : 'driver',
    mirrorProfile: state.mirrorProfile === 'parking' ? 'parking' : 'road',
    mirrorSettings: state.mirrorSettings && typeof state.mirrorSettings === 'object' ? structuredClone(state.mirrorSettings) : null,
    interior: state.interior && typeof state.interior === 'object' ? structuredClone(state.interior) : null,
  };
}

export const restoreCoursePracticeView = snapshot => captureCoursePracticeView(snapshot ?? {});

/** A stopped review detour keeps the original chapter identity even if the
 * demonstration continues into another chapter or another course. Session
 * objects are not mutated while in demo mode; camera settings are isolated. */
export function captureCoursePracticeReturn({ playback, session, driving, observation, recentRisk = null } = {}) {
  const chapter = playback?.course?.chapters?.[playback.index];
  if (!chapter || !session || !driving) return null;
  return { courseId: playback.course.id, chapterId: chapter.id, title: chapter.title,
    time: playback.time, session, driving, observation: captureCoursePracticeView(observation),
    recentRisk: recentRisk ? structuredClone(recentRisk) : null };
}

export function resolveCoursePracticeReturn(saved, courses) {
  const course = courses?.[saved?.courseId];
  if (!course || !saved?.session || !saved?.driving) return null;
  const index = course.chapters.findIndex(chapter => chapter.id === saved.chapterId);
  return index < 0 ? null : { course, index, time: Math.max(0, Math.min(course.chapters[index].duration, saved.time || 0)) };
}

/** The same bay is visited several times. Select by recorded route progress,
 * not the closest XY point, which can send a left-entry review to right entry. */
export function practiceDemoTime(session, fallback = 0, leadSeconds = 2.5) {
  const reference = session?.reference;
  if (!reference?.length || !Number.isFinite(session?.progress?.distance)) return Math.max(0, fallback);
  const progress = session.progress.distance;
  const nearest = reference.reduce((a, b) => Math.abs(b.s - progress) < Math.abs(a.s - progress) ? b : a);
  return Math.max(0, (nearest.t ?? fallback) - Math.max(0, leadSeconds));
}
