import { COURSE_GAZES } from './course-observation.js';

export const COURSE_FOLLOW_VIEWS = Object.freeze(['driver', 'orbit', 'top', 'controls']);
const validView = view => COURSE_FOLLOW_VIEWS.includes(view);
const validGaze = gaze => COURSE_GAZES.includes(gaze);
const hasId = value => typeof value === 'string' && value.length > 0;
const keyOf = (chapterId, stepId, generation) => hasId(chapterId) && hasId(stepId)
  ? JSON.stringify([chapterId, stepId, generation]) : null;
const validTarget = target => target && validView(target.view) && validGaze(target.gaze);
const currentCamera = (state, input) => ({ view: validView(input.view) ? input.view : state.view, gaze: validGaze(input.gaze) ? input.gaze : state.gaze });

/** Pure ownership/gating state for an externally sampled observation plan.
 * The caller supplies the semantic target from audio/simulation time. There is
 * no wall clock or timer here, so a stopped demo cannot silently tour mirrors.
 * All functions return the state directly. Only step() can set changed=true,
 * meaning that an AUTOMATIC view/gaze update should be applied by the caller.
 * generation changes only for an explicit seek/replay/restart, never a speech
 * token, phase change, or ordinary pause/resume.
 */
export function createCourseViewFollow({ enabled = true, view = 'driver', gaze = 'forward', chapterId = null, stepId = null, generation = 0 } = {}) {
  return { enabled: Boolean(enabled), view: validView(view) ? view : 'driver', gaze: validGaze(gaze) ? gaze : 'forward',
    chapterId, stepId, generation, key: keyOf(chapterId, stepId, generation), mode: 'demo', phase: null,
    manualOverride: false, manualKey: null, pendingAuto: true, following: false, changed: false, reason: 'waiting', label: '', target: null };
}

/** A user Q/E/C/M/Z/B/V/view button wins for this entire step, including its
 * reminder/action phases and speech retries. Even choosing the already-active
 * camera is an explicit override. Automatic setters must not call this.
 */
export function overrideCourseViewFollow(state, camera = {}) {
  if (!validView(camera.view) && !validGaze(camera.gaze)) return state;
  return { ...state, ...currentCamera(state, camera), manualOverride: true, manualKey: state.key,
    pendingAuto: false, following: false, changed: false, reason: state.mode !== 'demo' ? 'driving' : !state.enabled ? 'disabled' : 'manual-step' };
}

/** Explicitly enabling following resumes the current step's sampled target at
 * the next sync, even when paused. Disabling never changes the actual camera.
 */
export function setCourseViewFollowEnabled(state, enabled) {
  const next = Boolean(enabled);
  if (next === state.enabled) return { ...state, changed: false };
  return { ...state, enabled: next, manualOverride: next ? false : state.manualOverride, manualKey: next ? null : state.manualKey,
    pendingAuto: next ? true : state.pendingAuto, following: false, changed: false, reason: next ? 'waiting' : 'disabled' };
}

/** input: {mode:'demo'|'drive',chapterId,stepId,generation,phase,target,
 *         paused,mirrorPanelOpen,view,gaze}.
 * Same-key pause freezes the previously applied target; an explicit new key
 * selects the newly sampled target even when paused, unless a hard gate wins.
 * A new key deferred by an open mirror panel remains pending until it closes.
 * drive/off/panel never issue a camera change and preserve the supplied actual
 * view/gaze. phase is informational and intentionally absent from the key.
 */
export function stepCourseViewFollow(state, input = {}) {
  const chapterId = input.chapterId ?? state.chapterId, stepId = input.stepId ?? state.stepId, generation = input.generation ?? state.generation;
  const key = keyOf(chapterId, stepId, generation), changedKey = key !== null && key !== state.key;
  const mode = input.mode ?? state.mode, camera = currentCamera(state, input);
  // A click before the first step was bound belongs to that first step. All
  // later step/generation transitions release the previous step's override.
  const bindInitialOverride = state.key === null && state.manualOverride && state.manualKey === null;
  const manualOverride = changedKey && !bindInitialOverride ? false : state.manualOverride;
  const manualKey = changedKey ? manualOverride ? key : null : state.manualKey;
  let next = { ...state, ...camera, chapterId, stepId, generation, key: key ?? state.key, mode, phase: input.phase ?? state.phase,
    manualOverride, manualKey, pendingAuto: state.pendingAuto || changedKey || mode === 'demo' && state.mode !== 'demo',
    changed: false, following: false };
  if (mode !== 'demo') return { ...next, reason: 'driving' };
  if (!next.enabled) return { ...next, reason: 'disabled' };
  if (input.mirrorPanelOpen) return { ...next, reason: 'mirror-panel' };
  if (manualOverride) return { ...next, reason: 'manual-step' };
  if (key === null) return { ...next, reason: 'no-step' };
  if (input.paused && !next.pendingAuto) return { ...next, following: true, reason: 'paused' };
  if (!validTarget(input.target)) return { ...next, reason: 'no-target' };
  const target = { view: input.target.view, gaze: input.target.gaze, label: typeof input.target.label === 'string' ? input.target.label : '', phase: next.phase };
  next = { ...next, ...target, target, pendingAuto: false, following: true, reason: input.paused ? 'paused' : 'following',
    changed: target.view !== camera.view || target.gaze !== camera.gaze };
  return next;
}
