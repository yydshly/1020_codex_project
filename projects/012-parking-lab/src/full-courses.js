import './full-courses.css';
import './course-polish.css';
import './course-practice.css';
import './course-lesson.css';
import './project-nav.css';
import { EXAM_COURSES, EXAM_NARRATION, sampleChapterPose } from './exam-courses.js';
import { createFullCoursePlaylist, getPlaylistChapterSubject } from './course-playlist.js';
import { sampleCourseObservationPlan, courseObservationPlaybackRate } from './course-observation-plan.js';
import { createCourseViewFollow, stepCourseViewFollow, overrideCourseViewFollow, setCourseViewFollowEnabled } from './course-view-follow.js';
import { COURSE_CUE_NARRATION, getCourseTeachingSteps } from './course-coaching.js';
import { getChapterLessonGuide, getStepLessonGuide } from './course-lesson-guide.js';
import { courseMirrorReferenceGuide, courseMirrorRecognitionSummary } from './course-reference-guide.js';
import { mirrorObservation } from './mirror-observation.js';
import { createCourseScene } from './course-scene.js';
import { createCourseDrivingSession, stepCourseDriving, courseDrivingPose } from './course-driving.js';
import { evaluateCourseSafety } from './course-safety.js';
import { createCoursePractice, stepCoursePractice, recordCourseObservation, finishCoursePractice, retryCoursePractice, resumeCoursePractice } from './course-practice.js';
import { captureCoursePracticeReturn, resolveCoursePracticeReturn, restoreCoursePracticeView, practiceDemoTime } from './course-practice-view.js';
import { renderCoursePractice, drawCoursePracticeComparison, courseRiskLabel } from './course-practice-ui.js';
import { COCKPIT_STORAGE_KEY, restoreCockpitSettings } from './cockpit.js';
import { COURSE_MIRROR_STORAGE_KEY, COURSE_MIRROR_STORAGE_VERSION, restoreCourseMirrorSettings,
  setCourseMirrorSetting, resolveCourseMirrorSettings, recommendCourseMirrorSettings } from './course-mirror-settings.js';
import { createNarrator } from './narration.js';
import { loadSpeechCatalog, resolveSpeechClip } from './speech-catalog.js';
import { createCoursePlayback, selectCourseChapter, beginCourseChapter, finishCourseNarration,
  toggleCoursePlayback, skipCourseNarration, advanceCoursePlayback, courseTimeline, seekCourseTimeline, replayCourseTeachingStep, isCourseOverview, courseCueGate } from './course-playback.js';

const $ = id => document.getElementById(id);
const setText = (id, value) => { if ($(id).textContent !== value) $(id).textContent = value; };
const COURSES = Object.fromEntries(Object.entries(EXAM_COURSES).map(([id, course]) => [id, {
  ...course, chapters: course.chapters.map(entry => ({ ...entry, teachingSteps: getCourseTeachingSteps(entry) })),
}]));
COURSES.all = createFullCoursePlaylist(COURSES);
const COURSE_SPEECH = { ...EXAM_NARRATION, ...COURSE_CUE_NARRATION };
const initialCourse = new URLSearchParams(location.search).get('course');
const initialChapter = new URLSearchParams(location.search).get('chapter');
const initiallyDriving = new URLSearchParams(location.search).get('mode') === 'drive';
let playback = createCoursePlayback(COURSES[initialCourse] ?? COURSES.subject2);
let speechCatalog = null, speechError = '', speechLoading = true, request = 0;
let scene, view = 'driver', gaze = 'forward', lastFrame = performance.now(), lastHud = 0, destroyed = false;
let defaultPrepareView = false;
let syncedChapterId = null;
let viewFollow = createCourseViewFollow(), observationGeneration = 0, applyingAutoObservation = false;
let routeInspect = false;
let directoryOpen = false, focusMode = false;
let controlMode = 'demo', driving = null, drivingPaused = false, centerRequested = false;
let drivingInput = { forward: false, reverse: false, left: false, right: false, brake: false, leftSignal: false, rightSignal: false, lightMode: 'off', parkingBrake: false };
let practice = null, practiceReturn = null, recentRisk = null, safetyContext = null;
const activeRiskIds = new Set();
const observationKeys = { '1': 'front-left', '3': 'front-right', q: 'left', e: 'right', c: 'forward', m: 'rear', z: 'left-back', b: 'right-back' };
function readLocalSetting(key) { try { return localStorage.getItem(key); } catch { return null; } }
const storedCourseMirrors = readLocalSetting(COURSE_MIRROR_STORAGE_KEY), storedLegacyCockpit = readLocalSetting(COCKPIT_STORAGE_KEY);
let mirrorSettings = restoreCourseMirrorSettings(storedCourseMirrors, restoreCockpitSettings(storedLegacyCockpit));
if (!storedCourseMirrors && !storedLegacyCockpit) mirrorSettings = recommendCourseMirrorSettings(mirrorSettings, 'parking').settings;
let mirrorProfile = 'road', mirrorSubject = null, mirrorZoom = null, mirrorPanelOpen = false, mirrorSnapshot = null, mirrorZoomProjection = 'driver';
const mirrorFields = { leftYaw: 'left.yaw', leftPitch: 'left.pitch', rightYaw: 'right.yaw', rightPitch: 'right.pitch', seatHeight: 'seatHeight', seatFore: 'seatFore' };
const isDriving = () => controlMode === 'drive';
const showingOverview = () => !isDriving() && isCourseOverview(playback);
let referenceCache = { key: null, context: null, value: null, sampledAt: -Infinity };
const narrowLayout = window.matchMedia('(max-width: 1050px)');
const baseUrl = import.meta.env.BASE_URL;
const narrator = createNarrator({
  resolveClip: key => resolveSpeechClip(speechCatalog, key, baseUrl),
  onStatus: () => updatePlaybackStatus(),
});
const chapter = () => playback.course.chapters[playback.index];
function teachingIndex() {
  const steps = chapter().teachingSteps;
  if (playback.speechKind === 'cue' && Number.isInteger(playback.pendingCue)) return playback.pendingCue;
  const current = steps.reduce((index, step, i) => step.t <= playback.time + 1e-7 ? i : index, 0);
  return Math.min(steps.length - 1, Math.max(current, playback.cueIndex ?? -1));
}
const teachingStep = () => chapter().teachingSteps[teachingIndex()];
const speechEntry = () => playback.speechKind === 'cue' ? COURSE_CUE_NARRATION[teachingStep()?.narrationKey] : EXAM_NARRATION[chapter().narrationKey];
function actionObservationTiming() {
  const step = teachingStep(), next = chapter().teachingSteps[teachingIndex() + 1];
  const end = next ? playback.voice && playback.stepCoaching ? courseCueGate(next) : next.t : chapter().duration;
  const duration = Math.max(.1, end - (step?.t ?? 0));
  const rate = !isDriving() && viewFollow.enabled && !viewFollow.manualOverride
    ? courseObservationPlaybackRate(chapter(), step, { duration, rate: playback.rate }) : playback.rate;
  return { duration, rate };
}
function autoObservationInput() {
  if (showingOverview()) return { mode: 'demo', chapterId: `${playback.course.id}/${chapter().id}`, stepId: 'chapter-overview',
    generation: observationGeneration, phase: 'overview', target: { view: 'orbit', gaze: 'forward', label: '全景导览 · 先认路线与完成要求' },
    view, gaze, mirrorPanelOpen, paused: playback.phase !== 'narrating' };
  const step = teachingStep(), status = narrator.status, timing = actionObservationTiming();
  const reminder = playback.speechKind === 'cue' && Number.isInteger(playback.pendingCue)
    && ['narrating', 'lecture-paused', 'speech-error'].includes(playback.phase);
  const audio = reminder && status?.key === step?.narrationKey ? status : null;
  const phase = reminder ? 'reminder' : 'action';
  const duration = reminder ? audio?.duration ?? speechCatalog?.clips?.[step?.narrationKey]?.duration ?? 6
    : timing.duration;
  const elapsed = reminder ? audio?.currentTime ?? 0 : Math.max(0, playback.time - (step?.t ?? 0));
  const target = sampleCourseObservationPlan(chapter(), step, { phase, elapsed, duration, rate: timing.rate });
  return { mode: isDriving() ? 'drive' : 'demo', chapterId: `${playback.course.id}/${chapter().id}`, stepId: step?.id,
    generation: observationGeneration, phase, target, view, gaze, mirrorPanelOpen,
    paused: !['playing', 'narrating'].includes(playback.phase) };
}
function applyAutoObservation() {
  const previous = viewFollow;
  viewFollow = stepCourseViewFollow(viewFollow, autoObservationInput());
  if (!viewFollow.following || isDriving() || mirrorPanelOpen) return;
  applyingAutoObservation = true;
  try {
    if (mirrorZoom && (viewFollow.changed || previous.key !== viewFollow.key)) setMirrorZoom(null);
    if (viewFollow.changed) { setView(viewFollow.view, true); setGaze(viewFollow.gaze, false); }
  } finally { applyingAutoObservation = false; }
}
function noteManualObservation() {
  if (applyingAutoObservation || isDriving()) return;
  viewFollow = stepCourseViewFollow(viewFollow, autoObservationInput());
  viewFollow = overrideCourseViewFollow(viewFollow, { view, gaze });
}
function restoreAutoObservation() {
  viewFollow = setCourseViewFollowEnabled(viewFollow, true); observationGeneration++;
  updateUI();
}
function focusLessonStage() {
  (isDriving() ? document.querySelector('.course-player') : showingOverview() ? $('chapter-briefing') : $('step-lesson-guide'))
    .scrollIntoView({ block: 'start', behavior: 'instant' });
}
function currentMirrorReference() {
  if (showingOverview() || view !== 'driver' || !['left', 'right'].includes(gaze)) return null;
  const pose = currentPose(), settings = resolveCourseMirrorSettings(mirrorSettings, mirrorProfile);
  const displayRect = mirrorZoom === gaze ? $('course-mirror-zoom-image').getBoundingClientRect() : null;
  const canvasRect = $('course-scene').getBoundingClientRect();
  const context = JSON.stringify([chapter().id, isDriving(), teachingStep()?.id, gaze, settings,
    mirrorZoomProjection, displayRect?.width, displayRect?.height, canvasRect.width, canvasRect.height]);
  const key = JSON.stringify([context, pose.x, pose.y, pose.z, pose.heading, pose.pitch, pose.t]);
  if (referenceCache.key !== key) {
    const now = performance.now();
    // Readability is a display hint, never an observation/goal completion
    // signal. Hold the most recent hint between 5Hz samples to avoid flashing;
    // head turns, settings and display changes always sample immediately.
    if (referenceCache.context === context && now - referenceCache.sampledAt < 200) return referenceCache.value;
    const observation = scene?.getMirrorRecognition?.(gaze, { displayRect, projection: mirrorZoomProjection })
      ?? (chapter().id === 'reverse-parking' ? mirrorObservation(pose, gaze, settings) : null);
    referenceCache = { key, context, sampledAt: now, observation, value: courseMirrorReferenceGuide({ chapterId: chapter().id,
      stepId: isDriving() ? null : teachingStep()?.id, side: gaze, observation }) };
  }
  return referenceCache.value;
}
function inspectStepInOverview() {
  if (isDriving() || mirrorPanelOpen) return;
  const speaking = playback.phase === 'narrating';
  if (speaking || playback.phase === 'playing') playback = toggleCoursePlayback(playback);
  if (speaking) narrator.pause();
  routeInspect = true; setMirrorZoom(null); setView('orbit'); updateUI();
  $('course-scene').scrollIntoView({ block: 'center', behavior: 'instant' });
}
const clock = seconds => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
const labels = { ready: '准备观看', narrating: '先听讲解 · 车辆暂停', 'lecture-paused': '讲解已暂停',
  playing: '动作演示中', paused: '暂停观察', checkpoint: '本项完成 · 等待继续', ended: '整科演示已完成', 'speech-error': '讲解暂不可用 · 车辆暂停' };

function updatePlaybackStatus() {
  if (!playback) return;
  if (isDriving()) {
    setText('playback-status', practice?.phase === 'review' ? '本章练习复盘' : driving?.stopReason ? '风险暂停 · 请复盘重练' : drivingPaused ? '驾驶已暂停' : Math.abs(driving?.speed ?? 0) < .02 ? '自己驾驶 · 等待按键' : '自己驾驶中');
    $('playback-status').dataset.phase = drivingPaused ? 'paused' : 'playing';
    return;
  }
  const status = narrator?.status;
  let text = labels[playback.phase] ?? '';
  if (showingOverview()) text = playback.phase === 'ready' ? '先看全景 · 路线与要求' : playback.phase === 'lecture-paused' ? '全景讲解已暂停' : playback.phase === 'speech-error' ? '全景讲解暂不可用' : '全景讲解 · 车辆停住';
  if (playback.course.id === 'all' && playback.phase === 'ended') text = '全量 22 章演示已完成';
  $('playback-status').dataset.phase = playback.phase;
  if (playback.phase === 'narrating' && Number.isFinite(status?.duration)) {
    text = `${playback.speechKind === 'cue' ? '操作前提醒' : '全景介绍'} ${Math.floor(status.currentTime ?? 0)} / ${Math.ceil(status.duration)} 秒`;
  }
  setText('playback-status', text);
}
function renderChapterList() {
  $('chapter-list').replaceChildren(...playback.course.chapters.map((entry, index) => {
    const item = document.createElement('li'), button = document.createElement('button');
    button.type = 'button'; button.dataset.chapterIndex = String(index);
    const number = document.createElement('span'); number.className = 'chapter-number'; number.textContent = String(index + 1).padStart(2, '0');
    const subject = getPlaylistChapterSubject(playback.course, entry);
    const title = document.createElement('span'); title.textContent = subject ? `${subject.label} · ${entry.title}` : entry.title;
    const duration = document.createElement('span'); duration.className = 'chapter-duration'; duration.textContent = clock(entry.duration);
    button.append(number, title, duration); item.append(button); return item;
  }));
}
function syncChapter({ resetView = false } = {}) {
  const changedChapter = syncedChapterId !== chapter().id; syncedChapterId = chapter().id;
  // Legacy chapter defaults also obey camera ownership. Manual driving and
  // an explicitly disabled follow mode retain the learner's actual view.
  if (isDriving() || !viewFollow.enabled) { resetView = false; defaultPrepareView = false; }
  else if (changedChapter && chapter().sceneType === 'prepare') resetView = true;
  const chapterUrl = new URL(location.href);
  chapterUrl.searchParams.set('chapter', chapter().id); history.replaceState(null, '', chapterUrl);
  scene?.setChapter(chapter());
  const subject = getPlaylistChapterSubject(playback.course, chapter());
  const subjectId = subject?.id ?? playback.course.id;
  if (mirrorSubject !== subjectId) {
    mirrorSubject = subjectId;
    mirrorProfile = mirrorSubject === 'subject2' ? 'parking' : 'road';
    applyMirrorSettings();
  }
  if (resetView) {
    setGaze('forward', false);
    defaultPrepareView = chapter().sceneType === 'prepare'; setView(defaultPrepareView ? 'orbit' : 'driver', true);
  }
  else if (defaultPrepareView && chapter().sceneType !== 'prepare') { defaultPrepareView = false; setView('driver', true); }
  scene?.setPose(currentPose());
  $('chapter-title').textContent = chapter().title;
  $('chapter-position').textContent = subject
    ? `全量 ${playback.index + 1} / 22 · ${subject.label} 第 ${subject.number} 项 / ${subject.total}`
    : `${playback.course.id === 'subject2' ? '科目二' : '科目三'} · 第 ${String(playback.index + 1).padStart(2, '0')} 项 / ${playback.course.chapters.length}`;
  $('directory-current').textContent = `${playback.index + 1}/${playback.course.chapters.length}`;
  $('chapter-objective').textContent = `本项目标：${chapter().objective}`;
  $('chapter-risk').textContent = `重点注意：${chapter().risk}`;
  $('chapter-narration').textContent = chapter().narration;
  $('scene-transition').textContent = `第 ${playback.index + 1} 项教学场景 · ${chapter().title}`;
  for (const button of $('chapter-list').querySelectorAll('button')) {
    if (Number(button.dataset.chapterIndex) === playback.index) button.setAttribute('aria-current', 'step');
    else button.removeAttribute('aria-current');
  }
  followCurrentChapter();
  updateUI();
}
function followCurrentChapter() {
  const list = $('chapter-list'), item = list.querySelector('[aria-current="step"]');
  if (!item || (narrowLayout.matches && !directoryOpen) || focusMode) return;
  const bounds = list.getBoundingClientRect(), current = item.getBoundingClientRect();
  if (current.top < bounds.top + 12) list.scrollTop -= bounds.top + 12 - current.top;
  else if (current.bottom > bounds.bottom - 12) list.scrollTop += current.bottom - bounds.bottom + 12;
}
function updateDirectoryLayout() {
  const modal = narrowLayout.matches && directoryOpen && !focusMode;
  const hidden = focusMode || (narrowLayout.matches && !directoryOpen);
  $('course-directory').inert = hidden;
  $('course-directory').setAttribute('aria-hidden', String(hidden));
  if (modal) {
    $('course-directory').setAttribute('aria-modal', 'true');
    $('course-directory').setAttribute('role', 'dialog');
  } else {
    $('course-directory').removeAttribute('aria-modal');
    $('course-directory').removeAttribute('role');
  }
  $('course-directory-toggle').setAttribute('aria-expanded', String(modal));
  $('directory-backdrop').hidden = !modal;
  document.body.classList.toggle('directory-open', modal);
  document.querySelector('.course-player').inert = modal;
  for (const selector of ['.course-header', '.course-intro', '.course-start', '.course-basis', '.course-footer']) document.querySelector(selector).inert = modal;
  followCurrentChapter();
}
function setDirectory(open, { restoreFocus = false } = {}) {
  if (open && isDriving()) pauseDriving();
  directoryOpen = open; updateDirectoryLayout();
  if (open && narrowLayout.matches) $('directory-close').focus({ preventScroll: true });
  else if (restoreFocus) $('course-directory-toggle').focus({ preventScroll: true });
}
function setFocusMode(next) {
  focusMode = next;
  if (next) setDirectory(false);
  document.body.classList.toggle('course-focus-mode', next);
  $('course-focus').setAttribute('aria-pressed', String(next));
  $('course-focus').textContent = next ? '退出专注 Esc' : '专注观看';
  updateDirectoryLayout();
  requestAnimationFrame(() => { scene?.resize(); document.querySelector('.course-player').scrollIntoView({ block: 'start', behavior: 'instant' }); });
}
function currentPose() {
  if (isDriving() && driving) return courseDrivingPose(driving);
  const pose = { ...sampleChapterPose(chapter(), playback.time), t: playback.time, time: playback.time };
  return showingOverview() ? { ...pose, speed: 0, acceleration: 0, throttle: 0, brake: true, brakeValue: 1,
    gear: 'N', clutch: true, clutchState: 'down', clutchValue: 1 } : pose;
}
function currentOperation() {
  if (isDriving()) {
    const target = driving?.brake ? 'brake' : drivingInput.forward || drivingInput.reverse ? 'throttle' : drivingInput.left || drivingInput.right || centerRequested ? 'steering' : 'steering';
    return { kind: target === 'steering' ? 'steering' : 'pedal', target, progress: 1, doorOpen: 0, beltFastened: true };
  }
  const index = teachingIndex(), step = teachingStep();
  if (!step) return null;
  const nextT = chapter().teachingSteps[index + 1]?.t ?? chapter().duration;
  const operationDuration = Math.min(1.2, Math.max(.5, nextT - step.t - .4));
  const progress = Math.max(0, Math.min(1, (playback.time - step.t) / operationDuration));
  const operation = { ...step.operation, progress };
  if (chapter().sceneType === 'prepare') {
    let doorOpen = 0, beltFastened = false;
    for (let i = 0; i <= index; i++) {
      const op = chapter().teachingSteps[i].operation;
      if (op?.target === 'door') doorOpen = op.value === 'open' ? 1 : 0;
      if (op?.target === 'belt') beltFastened = op.value !== 'release';
    }
    if (operation.target === 'door') {
      const opening = operation.value === 'open'; doorOpen = opening ? progress : 1 - progress;
    }
    operation.doorOpen = doorOpen;
    operation.beltFastened = operation.target === 'belt' ? progress > .7 : beltFastened;
  }
  if (chapter().sceneType === 'pull_over' && operation.target === 'door') {
    operation.beltValue = 1 - Math.min(1, progress / .35);
    operation.doorOpen = Math.max(0, (progress - .35) / .65);
  }
  return operation;
}
function updateOperationScene() {
  scene?.setPose(currentPose()); scene?.setOperation?.(currentOperation());
}
function selectTeachingStep(index, { autoplay = false } = {}) {
  autoplay = autoplay && !mirrorPanelOpen;
  const steps = chapter().teachingSteps, target = steps[Math.max(0, Math.min(steps.length - 1, index))];
  if (!target) return;
  stopNarration();
  if (autoplay) playback = replayCourseTeachingStep(playback, index);
  else playback = { ...selectCourseChapter(playback, playback.index, target.t, { skipOverview: true }), phase: 'paused' };
  observationGeneration++;
  updateOperationScene(); updateUI();
  if (playback.phase === 'narrating') void narrateCurrent();
}
function setView(next, automatic = false) {
  if (!['orbit', 'top'].includes(next)) routeInspect = false;
  if (!automatic) defaultPrepareView = false;
  view = next; scene?.setView(next);
  for (const button of document.querySelectorAll('[data-course-view]')) button.setAttribute('aria-pressed', String(button.dataset.courseView === next));
  if (!automatic) noteManualObservation();
}
function clearDrivingKeys() {
  drivingInput = { ...drivingInput, forward: false, reverse: false, left: false, right: false, brake: false };
  centerRequested = false;
}
function pauseDriving() {
  drivingPaused = true; clearDrivingKeys(); updateUI();
}
function resetDriving(pose = sampleChapterPose(chapter(), 0), { paused = true } = {}) {
  clearDrivingKeys();
  driving = createCourseDrivingSession(chapter(), { ...pose, speed: 0, gear: 'N', t: pose.t ?? 0 });
  drivingInput = { ...drivingInput, leftSignal: driving.leftSignal, rightSignal: driving.rightSignal, lightMode: driving.lightMode, parkingBrake: driving.parkingBrake };
  drivingPaused = paused;
  practice = createCoursePractice(chapter(), { driving, initialPose: courseDrivingPose(driving) });
  $('manual-controls').open = ['lights', 'night'].includes(chapter().id);
  recentRisk = null; safetyContext = null; activeRiskIds.clear();
  updateOperationScene(); updateUI();
}
function practiceChanged(previousPhase) {
  if (practice?.phase === 'review' && previousPhase !== 'review') {
    drivingPaused = true; clearDrivingKeys();
    if (!driving?.stopReason) recentRisk = null;
    requestAnimationFrame(() => {
      $('practice-review-title').focus({ preventScroll: true });
      $('manual-panel').scrollIntoView({ block: 'start', behavior: 'instant' });
    });
  }
}
function updatePractice(dt = 0, events = []) {
  if (!isDriving() || !practice || !driving || practice.phase === 'review') return;
  const before = practice.phase;
  practice = stepCoursePractice(practice, { driving, pose: courseDrivingPose(driving), input: drivingInput, gaze, dt, events });
  practiceChanged(before);
}
function finishPractice() {
  if (!practice || !isDriving()) return;
  const before = practice.phase;
  practice = finishCoursePractice(practice); practiceChanged(before); updateUI();
}
function resumePractice() {
  if (!isDriving() || !practice || driving?.stopReason) return;
  const next = resumeCoursePractice(practice); if (next === practice) return;
  practice = next; clearDrivingKeys(); drivingPaused = true;
  safetyContext = null; activeRiskIds.clear(); recentRisk = null;
  updateUI(); $('course-scene').focus({ preventScroll: true });
  $('course-scene').scrollIntoView({ block: 'center', behavior: 'instant' });
}
function restartPractice() {
  if (!isDriving()) setControlMode('drive');
  if (mirrorPanelOpen) setMirrorPanel(false);
  const start = sampleChapterPose(chapter(), 0);
  resetDriving({ ...start, leftSignal: false, rightSignal: false, lightMode: chapter().id === 'night' ? 'low' : 'off' });
  $('course-scene').focus({ preventScroll: true });
}
function retryPractice() {
  if (!practice) return;
  const result = retryCoursePractice(practice, { gaze }); if (!result) return;
  practice = result.session; driving = result.driving;
  drivingInput = { ...drivingInput, leftSignal: driving.leftSignal, rightSignal: driving.rightSignal, lightMode: driving.lightMode, parkingBrake: Boolean(driving.parkingBrake) };
  clearDrivingKeys(); drivingPaused = true; safetyContext = null; activeRiskIds.clear();
  recentRisk = { title: '已回到本次操作前的位置', detail: '车辆、方向和练习进度已恢复；当前看镜方向保留，确认后再继续驾驶。', severity: 'info', elapsed: driving.elapsed };
  updateOperationScene(); updateUI();
  $('course-scene').focus({ preventScroll: true });
  $('course-scene').scrollIntoView({ block: 'center', behavior: 'instant' });
}
function watchPracticeDemo() {
  if (!isDriving()) return;
  const targetTime = practiceDemoTime(practice, playback.time);
  setControlMode('demo');
  if (mirrorPanelOpen) setMirrorPanel(false);
  activateChapter(playback.index, { time: targetTime });
}
function returnToPractice() {
  const destination = resolveCoursePracticeReturn(practiceReturn, COURSES);
  if (!destination) return;
  const saved = practiceReturn;
  if (mirrorPanelOpen) setMirrorPanel(false);
  // Navigating the demonstration must not erase or redefine the saved drive.
  if (playback.course.id !== destination.course.id) setSubject(destination.course.id);
  activateChapter(destination.index, { time: destination.time });
  setControlMode('drive'); practice = saved.session; driving = saved.driving; practiceReturn = null;
  const observed = restoreCoursePracticeView(saved.observation);
  if (observed.mirrorSettings) { mirrorSettings = observed.mirrorSettings; mirrorProfile = observed.mirrorProfile; applyMirrorSettings({ persist: true }); }
  if (observed.interior) scene?.setInteriorMirrorAdjustment?.(observed.interior);
  mirrorZoomProjection = observed.mirrorZoomProjection; scene?.setMirrorZoomProjection?.(mirrorZoomProjection);
  setView(observed.view, true); setGaze(observed.gaze, false); setMirrorZoom(observed.mirrorZoom, false);
  drivingInput = { ...drivingInput, leftSignal: driving.leftSignal, rightSignal: driving.rightSignal, lightMode: driving.lightMode, parkingBrake: Boolean(driving.parkingBrake) };
  clearDrivingKeys(); drivingPaused = true; recentRisk = saved.recentRisk || {
    title: '已回到刚才练习', detail: '车辆、目标进度与观察视角已恢复。车辆保持暂停，确认后再继续。', severity: 'info', elapsed: driving.elapsed,
  }; safetyContext = null; activeRiskIds.clear();
  updateOperationScene(); updateUI(); $('course-scene').focus({ preventScroll: true });
  $('course-scene').scrollIntoView({ block: 'center', behavior: 'instant' });
}
function setControlMode(next) {
  if (next === controlMode) return;
  routeInspect = false;
  if (next === 'drive') {
    const takeover = currentPose(), fromOverview = showingOverview(); stopNarration();
    playback = { ...playback, phase: playback.time > 0 ? 'paused' : 'ready', token: playback.token + 1, pendingCue: null };
    controlMode = 'drive';
    practiceReturn = null;
    if (view === 'controls' || fromOverview) setView('driver');
    resetDriving(takeover, { paused: mirrorPanelOpen });
  } else {
    practiceReturn = captureCoursePracticeReturn({ playback, session: practice, driving, recentRisk,
      observation: { view, gaze, mirrorZoom, mirrorZoomProjection, mirrorProfile, mirrorSettings,
        interior: scene?.getInteriorMirrorAdjustment?.() } }) || practiceReturn;
    observationGeneration++;
    clearDrivingKeys(); controlMode = 'demo'; driving = null; drivingPaused = false;
    updateOperationScene(); updateUI();
  }
  const url = new URL(location.href);
  if (isDriving()) url.searchParams.set('mode', 'drive'); else url.searchParams.delete('mode');
  history.replaceState(null, '', url);
  document.querySelector('.course-player').scrollIntoView({ block: 'start', behavior: 'instant' });
  $('course-scene').focus({ preventScroll: true });
}
function manualSignal(side) {
  if (!isDriving() || !driving || practice?.phase === 'review') return;
  const active = side === 'left' ? !drivingInput.leftSignal : !drivingInput.rightSignal;
  drivingInput = { ...drivingInput, leftSignal: side === 'left' && active, rightSignal: side === 'right' && active };
  driving = { ...driving, leftSignal: drivingInput.leftSignal, rightSignal: drivingInput.rightSignal };
  updateOperationScene(); updatePractice(); updateUI();
}
function manualLight(mode) {
  if (!isDriving() || !driving || practice?.phase === 'review') return;
  drivingInput.lightMode = drivingInput.lightMode === mode ? 'off' : mode;
  driving = { ...driving, lightMode: drivingInput.lightMode };
  updateOperationScene(); updatePractice(); updateUI();
}
function manualParkingBrake() {
  if (!isDriving() || !driving || practice?.phase === 'review') return;
  if (Math.abs(driving.speed) > .08) {
    recentRisk = { title: '请先用脚刹停稳，再操作驻车制动', detail: '空格制动至停车后按 H。', severity: 'warning', elapsed: driving.elapsed };
    updateUI(); return;
  }
  drivingInput.parkingBrake = !drivingInput.parkingBrake;
  driving = { ...driving, parkingBrake: drivingInput.parkingBrake, throttle: 0 };
  updateOperationScene(); updatePractice(); updateUI();
}
function setGaze(next, switchView = true) {
  gaze = next; if (switchView && view !== 'driver') setView('driver'); scene?.setGaze?.(next);
  if (mirrorPanelOpen && next !== 'rear') $('course-mirror-panel').dataset.focus = '';
  for (const button of document.querySelectorAll('[data-course-gaze]')) button.setAttribute('aria-pressed', String(button.dataset.courseGaze === next));
  if (mirrorZoom && ['left', 'right'].includes(next)) setMirrorZoom(next, false);
  else if (mirrorZoom) setMirrorZoom(null);
  if (isDriving() && practice && switchView && !mirrorPanelOpen) {
    const before = practice.phase;
    practice = recordCourseObservation(practice, next, currentPose()); practiceChanged(before); updateUI();
  }
  if (switchView) noteManualObservation();
}
function applyMirrorSettings({ persist = false } = {}) {
  scene?.setMirrorSettings(resolveCourseMirrorSettings(mirrorSettings, mirrorProfile));
  if (persist) {
    try { localStorage.setItem(COURSE_MIRROR_STORAGE_KEY, JSON.stringify({ version: COURSE_MIRROR_STORAGE_VERSION, settings: mirrorSettings })); }
    catch { $('course-mirror-adjust-status').textContent = '已在当前页面应用；浏览器未能保存，下次打开需重新调整。'; }
  }
  $('course-mirror-profile-name').textContent = mirrorProfile === 'road' ? '道路观察镜位' : '低速看线镜位';
  $('course-mirror-profile').value = mirrorProfile;
  $('course-mirror-recommend').textContent = mirrorProfile === 'road' ? '后方视野优先' : '推荐近处看线';
  $('course-mirror-profile-help').textContent = mirrorProfile === 'road'
    ? '先认镜内侧的本车侧身，再看外侧的侧后方道路。侧镜存在盲区，不能代替转头确认；低头看地面不适合道路观察。'
    : '低速倒车时看车身与近处库线。镜面向下后远方视野会减少，上路前请切回道路观察。';
  const cockpit = resolveCourseMirrorSettings(mirrorSettings, mirrorProfile);
  for (const [id, name] of Object.entries(mirrorFields)) {
    const input = $(`mirror-${id}`), isSeat = name.startsWith('seat');
    const [side, axis] = name.split('.');
    const value = isSeat ? cockpit[name] : cockpit[side][axis];
    if (axis === 'pitch') { input.min = mirrorProfile === 'road' ? -15 : -38; input.max = mirrorProfile === 'road' ? 6 : -5; }
    input.value = String(value);
    $(`mirror-${id}-value`).textContent = isSeat ? `${value.toFixed(2)} m` : `${value.toFixed(1)}°`;
  }
}
function setMirrorZoom(side, switchGaze = true) {
  mirrorZoom = side;
  document.body.classList.toggle('course-mirror-zooming', Boolean(side));
  $('course-mirror-zoom').hidden = !side;
  updateMirrorZoomLabels();
  for (const button of document.querySelectorAll('[data-mirror-zoom]')) button.setAttribute('aria-pressed', String(button.dataset.mirrorZoom === side));
  scene?.setMirrorZoom(side);
  if (side && switchGaze) setGaze(side);
}
function updateMirrorZoomLabels() {
  $('course-mirror-projection').value = mirrorZoomProjection;
  const prefix = mirrorZoom === 'right' ? '右镜' : '左镜';
  const innerEdge = mirrorZoom === 'right' ? '左侧' : '右侧';
  $('course-mirror-zoom-title').textContent = `${prefix} · ${mirrorZoomProjection === 'driver' ? '驾驶位放大' : '镜面展开'}`;
  $('course-mirror-zoom-description').textContent = mirrorZoomProjection === 'driver'
    ? `车身参照应在${innerEdge}内缘，黑色粗框是镜壳；同眼位放大，视野不增加。`
    : `车身参照应在${innerEdge}内缘 · 正面展开辅助，镜内视野不增加。`;
}
function setMirrorPanel(open, { restoreFocus = false } = {}) {
  if (open === mirrorPanelOpen) return;
  if (open) {
    $('course-mirror-panel').dataset.focus = '';
    mirrorSnapshot = { settings: structuredClone(mirrorSettings), profile: mirrorProfile, interior: scene?.getInteriorMirrorAdjustment?.() };
    if (isDriving()) pauseDriving();
    else if (['playing', 'narrating'].includes(playback.phase)) {
      const speaking = playback.phase === 'narrating'; playback = toggleCoursePlayback(playback);
      if (speaking) narrator.pause();
    }
    mirrorPanelOpen = true;
    $('course-mirror-adjust-status').textContent = '已暂停，调好后请手动继续。调镜不会改变车辆位置。';
    if (!['left', 'right'].includes(gaze)) setGaze('left');
    setMirrorZoom(gaze === 'right' ? 'right' : 'left');
  }
  mirrorPanelOpen = open;
  document.body.classList.toggle('course-mirror-adjusting', open);
  $('course-mirror-panel').hidden = !open;
  $('course-mirror-adjust').setAttribute('aria-expanded', String(open));
  applyMirrorSettings(); updateUI();
  if (open) requestAnimationFrame(() => $('course-scene').scrollIntoView({ block: 'center', behavior: 'instant' }));
  if (restoreFocus) $('course-mirror-adjust').focus({ preventScroll: true });
}
async function checkSpeech() {
  speechLoading = true; speechError = ''; updateUI();
  try { speechCatalog = await loadSpeechCatalog(COURSE_SPEECH, { baseUrl }); }
  catch (error) { speechCatalog = null; speechError = error.message; }
  finally { speechLoading = false; updateUI(); }
}
function stopNarration() { request++; narrator.stop(); }
async function narrateCurrent() {
  const ownRequest = ++request, token = playback.token;
  if (!speechCatalog) {
    playback = finishCourseNarration(playback, token, 'error'); updateUI(); return;
  }
  const key = playback.speechKind === 'cue' ? teachingStep()?.narrationKey : chapter().narrationKey;
  const wasOverview = showingOverview();
  const result = await narrator.play(key);
  if (destroyed || ownRequest !== request) return;
  playback = finishCourseNarration(playback, token, result);
  updateUI();
  if (wasOverview && !showingOverview() && !isDriving()) focusLessonStage();
}
function activateChapter(index, { autoplay = false, time = 0, resetView = false } = {}) {
  routeInspect = false;
  autoplay = autoplay && !mirrorPanelOpen;
  stopNarration(); playback = selectCourseChapter(playback, index, time);
  observationGeneration++;
  if (isDriving()) resetDriving(sampleChapterPose(chapter(), time));
  syncChapter({ resetView: isDriving() ? false : resetView });
  if (autoplay && !isDriving()) { playback = beginCourseChapter(playback); updateUI(); if (playback.phase === 'narrating') void narrateCurrent(); }
  const url = new URL(location.href); url.searchParams.set('chapter', chapter().id); history.replaceState(null, '', url);
  focusLessonStage();
}
function togglePlay() {
  if (mirrorPanelOpen) return;
  if (isDriving()) {
    if (practice?.phase === 'review') { $('manual-panel').scrollIntoView({ block: 'start', behavior: 'instant' }); $('practice-review-title').focus({ preventScroll: true }); return; }
    if (driving?.stopReason) { resetDriving(); return; }
    drivingPaused = !drivingPaused; clearDrivingKeys(); updateUI(); return;
  }
  const previous = playback.phase;
  if (playback.course.id === 'all' && (previous === 'ended' || previous === 'ready' && playback.index === 0)) return startCompleteDemo();
  if (previous === 'speech-error') return retrySpeech();
  playback = toggleCoursePlayback(playback);
  if (previous === 'narrating') narrator.pause();
  else if (previous === 'lecture-paused') narrator.resume();
  else if (playback.phase === 'narrating') { syncChapter({ resetView: previous === 'ended' }); void narrateCurrent(); }
  else if (['checkpoint', 'ended'].includes(previous)) syncChapter({ resetView: previous === 'ended' });
  updateUI();
  focusLessonStage();
}
function skipLecture({ paused = false } = {}) {
  stopNarration(); playback = skipCourseNarration(playback, { paused: paused || mirrorPanelOpen }); updateUI();
  focusLessonStage();
}
async function retrySpeech() {
  if (mirrorPanelOpen) return;
  stopNarration();
  const ownRequest = request, token = playback.token;
  if (!speechCatalog) await checkSpeech();
  if (destroyed || ownRequest !== request || token !== playback.token || !playback.voice) return;
  playback = beginCourseChapter(playback); updateUI();
  if (playback.phase === 'narrating') void narrateCurrent();
}
function setSubject(id) {
  if (!COURSES[id]) return;
  routeInspect = false;
  const settings = { voice: playback.voice, rate: playback.rate, continuous: playback.continuous, checkpointPause: playback.checkpointPause, stepCoaching: playback.stepCoaching };
  stopNarration(); playback = { ...createCoursePlayback(COURSES[id]), ...settings };
  observationGeneration++;
  if (isDriving()) resetDriving(sampleChapterPose(chapter(), 0));
  const url = new URL(location.href); url.searchParams.set('course', id); url.searchParams.delete('chapter'); history.replaceState(null, '', url);
  $('course-title').textContent = playback.course.name;
  $('course-summary').textContent = playback.course.summary;
  $('course-count').textContent = `${playback.course.chapters.length} 个章节 · 全项目教学串联`;
  $('chapter-count').textContent = `${playback.course.chapters.length} 项`;
  $('course-start-all').textContent = id === 'all' ? '播放科二 + 科三完整 22 章' : id === 'subject2' ? '从头看完整科二' : '从头看完整科三';
  $('course-completed-title').textContent = id === 'all' ? '科二 + 科三完整 22 章演示已结束' : '本整科演示已结束';
  $('course-completed-copy').textContent = id === 'all' ? '已走完科二 5 项与科三 17 章。可以重看某项、接手练习，或从头重播。' : '已走完目录中的全部项目。可以重看某一项，或切换另一科目。';
  $('course-restart').textContent = id === 'all' ? '重新看完整 22 章' : '重新看整科';
  for (const button of document.querySelectorAll('[data-subject]')) button.setAttribute('aria-pressed', String(button.dataset.subject === id));
  renderChapterList(); syncChapter({ resetView: !isDriving() });
}
function startCompleteDemo() {
  if (mirrorPanelOpen) setMirrorPanel(false);
  setControlMode('demo'); setSubject('all');
  playback = { ...playback, continuous: true, checkpointPause: false };
  activateChapter(0, { autoplay: true, resetView: true });
}
function startMirrorContactCase(kind) {
  if (mirrorPanelOpen) setMirrorPanel(false);
  if (!playback.course.chapters.some(entry => entry.id === 'bus')) setSubject('subject3');
  setControlMode('drive');
  activateChapter(playback.course.chapters.findIndex(entry => entry.id === 'bus'), { time: 8 });
  const housing = kind !== 'support', x = housing ? -2.90 : -3.00;
  resetDriving({ ...sampleChapterPose(chapter(), 8), x, z: 12.90, y: 0, pitch: 0, heading: 0, steer: 0,
    leftSignal: false, rightSignal: false, lightMode: 'off', t: 8 });
  setView('driver'); setGaze('right', false);
  recentRisk = { title: `${housing ? '镜壳' : '支架'}净空案例 · 已暂停`, severity: 'info', elapsed: driving.elapsed,
    detail: `车身与公交侧面仍有约 ${housing ? '20' : '10'} 厘米间距，外镜却可能先接触。先观察右镜，再继续驾驶并轻按 W；本次为中途接手，要完整练习可从本项起点重置。` };
  document.querySelector('.course-contact-cases').open = false;
  updateUI(); $('course-scene').focus({ preventScroll: true }); $('course-scene').scrollIntoView({ block: 'center', behavior: 'instant' });
}
function updateUI() {
  if (!playback) return;
  applyAutoObservation();
  const phase = playback.phase;
  const manual = isDriving();
  const overview = showingOverview();
  document.body.classList.toggle('course-overview', overview);
  scene?.setRouteGuide?.(overview || !manual && routeInspect && ['orbit', 'top'].includes(view));
  $('chapter-briefing').hidden = !overview;
  $('step-lesson-guide').hidden = overview;
  const chapterGuide = getChapterLessonGuide(chapter());
  setText('briefing-goal', chapterGuide.goal); setText('briefing-route', chapterGuide.route);
  setText('briefing-standard', chapterGuide.standard); setText('briefing-watch', chapterGuide.watch);
  for (const [id, active] of [['lesson-stage-overview', overview], ['lesson-stage-steps', !overview && !manual], ['lesson-stage-practice', manual]]) {
    if (active) $(id).setAttribute('aria-current', 'step'); else $(id).removeAttribute('aria-current');
  }
  $('course-enter-steps').disabled = mirrorPanelOpen || speechLoading && playback.voice;
  const reviewing = manual && practice?.phase === 'review';
  $('course-auto-observe').checked = viewFollow.enabled;
  $('course-auto-observe-resume').hidden = manual || !viewFollow.enabled || !viewFollow.manualOverride || mirrorPanelOpen;
  const cameraLabel = view === 'driver'
    ? ({ forward: '前方', 'front-left': '前左方路况', 'front-right': '前右方路况', left: '左外镜', right: '右外镜', rear: '内后视镜', 'left-back': '左后方', 'right-back': '右后方' }[gaze] ?? '驾驶位')
    : ({ orbit: '全景', top: '俯视', controls: '操作近景' }[view] ?? '教学视角');
  const followText = mirrorPanelOpen ? '调镜中，自动观察暂停。'
    : !viewFollow.enabled ? '手动观察：开启后会按步骤切换视角。'
      : viewFollow.manualOverride ? '手动观察保持本步；下一步或重看时恢复自动。'
        : `自动观察：${viewFollow.label || cameraLabel}${['ready', 'paused', 'lecture-paused', 'speech-error'].includes(phase) ? '（已停住）' : ''}`;
  setText('course-auto-observe-state', followText);
  $('scene-auto-look').hidden = manual;
  setText('scene-auto-look', `${viewFollow.enabled && !viewFollow.manualOverride && !mirrorPanelOpen ? '自动观察' : '手动观察'} · ${cameraLabel}`);
  const hasSavedPractice = Boolean(!manual && resolveCoursePracticeReturn(practiceReturn, COURSES));
  $('course-return-practice').hidden = !hasSavedPractice;
  setText('course-return-practice', hasSavedPractice && practiceReturn.chapterId !== chapter().id
    ? `返回「${practiceReturn.title}」练习` : '回到刚才练习');
  $('course-takeover-new').hidden = !hasSavedPractice;
  $('course-takeover-new').disabled = mirrorPanelOpen;
  setText('course-mode-drive', hasSavedPractice ? '继续刚才练习' : '自己驾驶');
  $('course-complete-entry').hidden = !manual && playback.course.id === 'all';
  $('course-complete-entry').disabled = mirrorPanelOpen || (speechLoading && playback.voice);
  document.body.classList.toggle('course-driving-mode', manual);
  $('course-mode-demo').setAttribute('aria-pressed', String(!manual));
  $('course-mode-drive').setAttribute('aria-pressed', String(manual));
  $('manual-panel').hidden = !manual;
  setText('manual-status', reviewing
    ? practice.review?.outcome === 'complete'
      ? '本章目标已完成。可以对照轨迹、重新练习，或选择下一章。'
      : practice.review?.outcome === 'incomplete'
        ? '还有目标未完成。可以在当前位置继续完成目标，或从本项起点重练。'
        : '本次练习已暂停。先看错误与缺项，再从出错前或本项起点重练。'
    : driving?.stopReason ? '风险暂停，请复盘后重练。' : drivingPaused ? '已暂停，可先观察和设灯。方向与踏板暂不响应；点“继续驾驶”或按 P 后再操作。' : driving?.parkingBrake ? '驻车制动已拉起。先完成观察；需要起步时停稳按 H 解除驻车。' : 'W/S 控速，A/D 转向，X 回正；1 / 3 看前方左右路况，Q / E 看外镜，C 回前方。');
  if (manual && practice) renderCoursePractice(practice);
  const alert = $('course-risk-alert'), riskText = recentRisk ? `${courseRiskLabel(recentRisk) ? `【${courseRiskLabel(recentRisk)}】` : ''}${recentRisk.title} · ${recentRisk.detail || ''}` : '';
  alert.hidden = !manual || !recentRisk;
  if (alert.textContent !== riskText) alert.textContent = riskText;
  alert.dataset.severity = recentRisk?.severity === 'danger' ? 'critical' : recentRisk?.severity === 'info' ? 'info' : 'warning';
  $('scene-transition').textContent = manual ? `自己驾驶 · ${chapter().title}` : `第 ${playback.index + 1} 项教学场景 · ${chapter().title}`;
  const observationText = view !== 'driver'
    ? `${{ controls: '操作近景', orbit: '全景', top: '俯视' }[view] ?? '场外视角'} · 教学辅助；按 C 回到驾驶位观察。`
    : ({ forward: '正前方 · 看远处道路与车道位置，1 / 3 扫视前方左右路况；Q / E 另看外镜。',
      'front-left': '前左方路况 · 从原驾驶眼位看行人、横向道路与出口；这不是左后视镜。C 回正前方。',
      'front-right': '前右方路况 · 从原驾驶眼位看行人、横向道路与出口；这不是右后视镜。C 回正前方。',
      left: '左外镜 · 从驾驶位看同侧车身与左后方道路；C 回前方。',
      right: '右外镜 · 从驾驶位看同侧车身与右后方道路；C 回前方。',
      rear: '车内后视镜 · 经后窗看车后，保留头枕与窗框遮挡；C 回前方。',
      'left-back': '左后方 · 从原眼位转头看侧后窗，柱体仍会遮挡；C 回前方。',
      'right-back': '右后方 · 从原眼位转头看侧后窗，柱体仍会遮挡；C 回前方。' }[gaze] ?? '驾驶位观察');
  setText('course-observation-status', observationText);
  for (const button of document.querySelectorAll('[data-drive-input]')) {
    button.disabled = manual && (drivingPaused || Boolean(driving?.stopReason));
    button.setAttribute('aria-pressed', String(manual && Boolean(drivingInput[button.dataset.driveInput])));
  }
  $('manual-center').disabled = manual && (drivingPaused || Boolean(driving?.stopReason));
  $('manual-left-signal').setAttribute('aria-pressed', String(manual && drivingInput.leftSignal));
  $('manual-right-signal').setAttribute('aria-pressed', String(manual && drivingInput.rightSignal));
  $('manual-low-light').setAttribute('aria-pressed', String(manual && drivingInput.lightMode === 'low'));
  $('manual-high-light').setAttribute('aria-pressed', String(manual && drivingInput.lightMode === 'high'));
  for (const button of document.querySelectorAll('[data-manual-light]')) {
    button.setAttribute('aria-pressed', String(manual && drivingInput.lightMode === button.dataset.manualLight));
    button.disabled = reviewing;
  }
  $('manual-parking-brake').setAttribute('aria-pressed', String(manual && drivingInput.parkingBrake));
  $('manual-parking-brake').disabled = reviewing;
  $('course-speech').textContent = speechLoading ? '正在检查 MiniMax 讲解' : speechCatalog ? `MiniMax 已就绪 · ${Object.keys(COURSE_CUE_NARRATION).length} 段操作提醒 + 22 段总讲解` : `${speechError || '讲解暂未准备好'} · 可主动选择字幕继续`;
  const names = { ready: '播放本项', narrating: '暂停讲解', 'lecture-paused': '继续讲解', playing: '暂停观察', paused: '继续动作', checkpoint: '继续下一项', ended: '重看整科', 'speech-error': '重试讲解' };
  $('course-play').textContent = manual ? reviewing ? '查看本次复盘' : driving?.stopReason ? '重置本项' : drivingPaused ? '继续驾驶' : '暂停驾驶' : overview && phase === 'ready' ? '播放全景介绍' : names[phase];
  if (!manual && playback.course.id === 'all' && phase === 'ready' && playback.index === 0) $('course-play').textContent = '开始完整 22 章';
  if (!manual && playback.course.id === 'all' && phase === 'ended') $('course-play').textContent = '重看完整 22 章';
  $('course-play').disabled = mirrorPanelOpen || (!manual && speechLoading && playback.voice && ['ready', 'paused'].includes(phase));
  $('course-replay').textContent = manual ? '从本项起点练' : '重看本项 · 含全景';
  $('operation-replay').disabled = mirrorPanelOpen || (speechLoading && playback.voice);
  $('course-start-all').disabled = mirrorPanelOpen || (speechLoading && playback.voice);
  $('course-prev').disabled = playback.index === 0;
  $('course-next').disabled = playback.index === playback.course.chapters.length - 1;
  $('course-skip-speech').hidden = manual || !['narrating', 'lecture-paused'].includes(phase);
  $('course-skip-speech').textContent = playback.speechKind === 'cue' ? '直接看这步动作' : '进入车内分步';
  $('speech-recovery').hidden = phase !== 'speech-error';
  $('course-completed').hidden = phase !== 'ended';
  $('speech-caption').hidden = !['narrating', 'lecture-paused'].includes(phase);
  $('course-caption').textContent = speechEntry()?.text ?? chapter().narration;
  $('course-guidance').value = playback.stepCoaching ? 'steps' : 'overview';
  const observationRate = actionObservationTiming().rate;
  const slowingObservation = !manual && !overview && observationRate < playback.rate - .001;
  $('course-rate-note').hidden = !slowingObservation;
  setText('course-rate-note', slowingObservation ? `本步观察动作约 ${observationRate.toFixed(1)}×，留足看镜时间；讲解语速不变。` : '');
  $('course-play-mode').value = playback.continuous && !playback.checkpointPause ? 'continuous' : 'checkpoint';
  $('course-continuous').checked = playback.continuous;
  $('course-checkpoints').checked = playback.checkpointPause;
  const timeline = courseTimeline(playback);
  $('course-timeline').max = timeline.total;
  $('course-timeline').value = timeline.elapsed;
  $('course-time').textContent = `${clock(timeline.elapsed)} / ${clock(timeline.total)}（动作）`;
  const cue = teachingStep(), index = teachingIndex();
  const stepGuide = getStepLessonGuide(chapter(), cue), reference = currentMirrorReference();
  const mirrorSummary = mirrorZoom === gaze && view === 'driver' && !overview
    ? courseMirrorRecognitionSummary({ chapterId: chapter().id, observation: referenceCache.observation }) : '';
  $('course-mirror-recognition').hidden = !mirrorSummary;
  setText('course-mirror-recognition', mirrorSummary);
  const frontSwing = !manual && viewFollow.following && view === 'driver' && gaze === 'forward' && /车头外摆/.test(viewFollow.label);
  const automaticLook = !manual && viewFollow.following && !viewFollow.manualOverride && !mirrorPanelOpen;
  setText('cue-look-label', automaticLook ? '当前镜头 · 跟随示范' : '当前镜头 · 手动观察');
  setText('cue-look', reference?.look ?? (automaticLook ? viewFollow.label : view === 'driver' ? cameraLabel : `${cameraLabel} · 教学辅助`));
  setText('cue-see-label', reference || frontSwing ? '当前参照：' : '本步判断：');
  setText('cue-see', frontSwing ? '从前风窗核对外摆侧的车头空间；前方不能用另一侧后视镜代替。' : reference?.see ?? stepGuide.see);
  setText('cue-step-watch', `本步完整观察要求：${stepGuide.look}`);
  setText('cue-action', reference?.act ?? stepGuide.act);
  setText('cue-complete', stepGuide.complete);
  setText('cue-caution', [stepGuide.caution, reference?.caution].filter(Boolean).join(' '));
  $('cue-action-label').textContent = phase === 'narrating' && playback.speechKind === 'cue' ? '先听提醒 · 下一步这样操作' : '怎样操作';
  $('course-reference-help').hidden = !reference || overview;
  $('course-reference-status').classList.toggle('sr-only', !manual);
  $('course-reference-overview').hidden = manual;
  $('course-reference-fit').textContent = mirrorProfile === 'parking' ? '按眼位推荐停车镜位' : '暂停辨认与调镜';
  setText('course-reference-status', reference ? `${reference.see} ${reference.caution}` : '');
  $('operation-step').textContent = `操作 ${index + 1} / ${chapter().teachingSteps.length}`;
  $('operation-title').textContent = cue?.title ?? chapter().title;
  $('operation-instruction').textContent = cue?.action ?? chapter().action;
  $('operation-state').textContent = ['narrating', 'lecture-paused', 'speech-error'].includes(phase) ? '先听提醒，再演这步' : phase === 'playing' ? '正在示范' : '停住观察 · 可逐步选择';
  $('operation-prev').disabled = index <= 0;
  $('operation-next').disabled = index >= chapter().teachingSteps.length - 1;
  const closeupNames = { headlight: '灯光拨杆与旋钮 · 对照下方灯光状态', 'turn-signal': '转向灯拨杆 · 对照仪表左右箭头', hazard: '危险报警开关 · 对照双闪指示',
    gear: 'H形挡杆 · 示范布局，挡位见下方', clutch: '三踏板：左离合、中刹车、右油门', brake: '三踏板：左离合、中刹车、右油门', throttle: '三踏板：左离合、中刹车、右油门',
    steering: '方向盘 · 与前轮和车辆轨迹同步', door: '车门动作 · 先观察后开门', seat: '座椅调节动作示意', belt: '安全带与锁扣 · 理顺后扣牢', mirrors: '调镜控制动作示意' };
  $('operation-view-caption').hidden = view !== 'controls';
  const operation = manual ? currentOperation() : cue?.operation;
  const closeupText = operation?.kind === 'observe' ? '本步观察外部环境，可切驾驶位看镜' : closeupNames[operation?.target] ?? '可暂停观察操作部件';
  $('operation-view-caption').textContent = `教学辅助近景 · ${closeupText}`;
  const pose = currentPose();
  $('speed-context').textContent = manual ? drivingPaused ? '暂停时车速' : '当前车速' : overview ? '全景说明 · 停住' : phase === 'playing' ? '演示车速' : '片段车速 · 画面暂停';
  const kmh = Math.abs(pose.speed ?? 0) * 3.6;
  $('hud-speed').textContent = `${kmh > .01 && kmh < 1 ? kmh.toFixed(1) : kmh.toFixed(0)} km/h`;
  $('hud-gear').textContent = `${pose.gear ?? (pose.speed < 0 ? 'R' : 'N')} 挡`;
  $('hud-signal').textContent = pose.lightMode === 'hazard' || pose.leftSignal && pose.rightSignal ? '危险报警闪光灯' : pose.leftSignal ? '左转向灯' : pose.rightSignal ? '右转向灯' : '转向灯关闭';
  const lights = { off: '灯光关闭', low: '近光灯', high: '远光灯', flash: '远近光交替', hazard: '示廓灯与危险报警', parking: '示廓灯', fog: '雾灯' };
  $('hud-lights').textContent = lights[pose.lightMode] ?? pose.lightMode ?? '灯光关闭';
  const clutch = pose.clutchState === 'bite' ? '离合结合点' : pose.clutchState === 'down' || pose.clutch ? '离合踩下' : '离合松开';
  $('hud-clutch').textContent = clutch.replace('离合', '');
  $('hud-brake').textContent = pose.brake ? '制动' : '松开';
  $('hud-parking').textContent = pose.parkingBrake ? '拉起' : '松开';
  $('hud-throttle').textContent = pose.throttle > .03 ? '轻踩' : '松开';
  $('hud-steer').textContent = Math.abs(pose.steer ?? 0) < .004 ? '前轮回正' : `前轮${pose.steer > 0 ? '向左' : '向右'} ${Math.abs(pose.steer * 180 / Math.PI).toFixed(1)}°`;
  $('hud-controls').textContent = `${clutch} · ${pose.brake ? '脚刹制动' : '脚刹松开'} · ${pose.parkingBrake ? '驻车拉起' : '驻车松开'}`;
  updatePlaybackStatus();
}

$('chapter-list').addEventListener('click', event => {
  const button = event.target.closest('[data-chapter-index]'); if (!button) return;
  activateChapter(Number(button.dataset.chapterIndex));
  setDirectory(false);
  if (narrowLayout.matches) ($('course-play').disabled ? $('chapter-title') : $('course-play')).focus({ preventScroll: true });
});
$('course-directory-toggle').addEventListener('click', () => setDirectory(true));
$('directory-close').addEventListener('click', () => setDirectory(false, { restoreFocus: true }));
$('directory-backdrop').addEventListener('click', () => setDirectory(false, { restoreFocus: true }));
$('course-focus').addEventListener('click', () => setFocusMode(!focusMode));
$('course-mirror-adjust').addEventListener('click', () => setMirrorPanel(!mirrorPanelOpen));
$('course-mirror-adjust-close').addEventListener('click', () => setMirrorPanel(false, { restoreFocus: true }));
$('course-inner-fit').addEventListener('click', () => {
  scene?.recommendInteriorMirror?.(); setGaze('rear');
  $('course-mirror-panel').dataset.focus = 'interior'; $('course-mirror-panel').scrollTop = 0;
  $('course-mirror-adjust-status').textContent = '已按当前眼位调整内镜，可检查后窗视野；不合适可撤销，确认后点“完成”，车辆保持暂停。';
});
$('course-mirror-outer-edit').addEventListener('click', () => { setGaze('left'); setMirrorZoom('left'); });
$('course-mirror-zoom-close').addEventListener('click', () => setMirrorZoom(null));
$('course-mirror-projection').addEventListener('change', event => {
  mirrorZoomProjection = event.target.value === 'unfolded' ? 'unfolded' : 'driver';
  scene?.setMirrorZoomProjection(mirrorZoomProjection); updateMirrorZoomLabels();
});
for (const button of document.querySelectorAll('[data-mirror-zoom]')) button.addEventListener('click', () => setMirrorZoom(mirrorZoom === button.dataset.mirrorZoom ? null : button.dataset.mirrorZoom));
$('course-mirror-profile').addEventListener('change', event => {
  mirrorProfile = event.target.value; applyMirrorSettings();
  $('course-mirror-adjust-status').textContent = '已切换镜位，车辆保持暂停。确认镜中车身和后方视野，再手动继续。';
});
for (const input of document.querySelectorAll('[data-mirror-setting]')) {
  const observeAdjustedSide = () => {
    const side = input.dataset.mirrorSetting.startsWith('left') ? 'left' : input.dataset.mirrorSetting.startsWith('right') ? 'right' : null;
    if (mirrorPanelOpen && side && (gaze !== side || mirrorZoom !== side)) setMirrorZoom(side);
  };
  input.addEventListener('focus', observeAdjustedSide);
  input.addEventListener('input', () => {
    mirrorSettings = setCourseMirrorSetting(mirrorSettings, mirrorProfile, mirrorFields[input.dataset.mirrorSetting], Number(input.value));
    $('course-mirror-adjust-status').textContent = input.dataset.mirrorSetting.startsWith('seat')
      ? '眼位已改变，镜角保持原样。请检查两侧，需要时重新推荐；车辆保持暂停。'
      : '已手动调整镜面，请核对车身内缘与后方参照；车辆保持暂停。';
    applyMirrorSettings({ persist: true }); observeAdjustedSide();
  });
}
$('course-mirror-recommend').addEventListener('click', () => {
  const result = recommendCourseMirrorSettings(mirrorSettings, mirrorProfile);
  mirrorSettings = result.settings;
  const limited = Object.values(result.report).some(entry => entry.quality === 'limited');
  $('course-mirror-adjust-status').textContent = limited
    ? '已应用推荐角度。当前眼位的参照覆盖有限，请结合镜中车身继续微调；车辆保持暂停。'
    : mirrorProfile === 'road'
      ? '已按当前眼位优先保留侧后方视野，车身保留在内缘；需要更清楚的本车参照，可点“看清车身与后方”。车辆保持暂停。'
      : '已按当前眼位推荐近处车身与库线镜位；左镜内缘在右、右镜内缘在左。车辆保持暂停。';
  applyMirrorSettings({ persist: true });
  scene?.recommendInteriorMirror?.();
});
$('course-mirror-body-reference').addEventListener('click', () => {
  mirrorProfile = 'road';
  const result = recommendCourseMirrorSettings(mirrorSettings, 'road', { bodyReference: 'clear' });
  mirrorSettings = result.settings;
  const limited = Object.values(result.report).some(entry => entry.quality === 'limited');
  $('course-mirror-adjust-status').textContent = limited
    ? '已向车身与侧后方调整，当前眼位的参照覆盖有限，请检查两侧并微调。车辆仍暂停；倒库看近线请切回低速看线。'
    : '已切到车身与侧后方镜位：镜内侧看本车后半侧身，外侧看侧后道路。车辆仍暂停；倒库看近线请切回低速看线。';
  applyMirrorSettings({ persist: true });
  scene?.recommendInteriorMirror?.();
  setMirrorZoom(gaze === 'left' ? 'left' : 'right');
});
$('course-mirror-undo').addEventListener('click', () => {
  if (!mirrorSnapshot) return;
  mirrorSettings = structuredClone(mirrorSnapshot.settings); mirrorProfile = mirrorSnapshot.profile;
  $('course-mirror-adjust-status').textContent = '已恢复打开调镜面板前的设置，车辆保持暂停。';
  applyMirrorSettings({ persist: true });
  if (mirrorSnapshot.interior) scene?.setInteriorMirrorAdjustment?.(mirrorSnapshot.interior);
});
$('course-mode-demo').addEventListener('click', watchPracticeDemo);
$('course-mode-drive').addEventListener('click', () => {
  if (resolveCoursePracticeReturn(practiceReturn, COURSES) && !isDriving()) returnToPractice();
  else setControlMode('drive');
});
$('course-takeover-new').addEventListener('click', () => setControlMode('drive'));
$('practice-finish').addEventListener('click', finishPractice);
$('practice-resume').addEventListener('click', resumePractice);
$('practice-restart').addEventListener('click', restartPractice);
$('practice-review-restart').addEventListener('click', restartPractice);
$('practice-retry').addEventListener('click', retryPractice);
$('practice-demo').addEventListener('click', watchPracticeDemo);
$('practice-review-demo').addEventListener('click', watchPracticeDemo);
$('course-return-practice').addEventListener('click', returnToPractice);
$('practice-observe').addEventListener('click', () => { if (practice?.currentTask?.gaze) setGaze(practice.currentTask.gaze); });
$('practice-review').querySelector('details').addEventListener('toggle', event => { if (event.target.open) drawCoursePracticeComparison(practice); });
$('manual-center').addEventListener('click', () => { centerRequested = true; });
$('manual-left-signal').addEventListener('click', () => manualSignal('left'));
$('manual-right-signal').addEventListener('click', () => manualSignal('right'));
for (const button of document.querySelectorAll('[data-manual-light]')) button.addEventListener('click', () => manualLight(button.dataset.manualLight));
$('manual-parking-brake').addEventListener('click', manualParkingBrake);
for (const button of document.querySelectorAll('[data-drive-input]')) {
  button.addEventListener('pointerdown', event => {
    if (!isDriving() || drivingPaused || driving?.stopReason) return;
    event.preventDefault(); button.setPointerCapture(event.pointerId);
    if (['left', 'right'].includes(button.dataset.driveInput)) centerRequested = false;
    drivingInput[button.dataset.driveInput] = true;
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(type, () => { drivingInput[button.dataset.driveInput] = false; });
}
$('operation-prev').addEventListener('click', () => selectTeachingStep(teachingIndex() - 1));
$('operation-next').addEventListener('click', () => selectTeachingStep(teachingIndex() + 1));
$('operation-replay').addEventListener('click', () => selectTeachingStep(teachingIndex(), { autoplay: true }));
for (const button of document.querySelectorAll('[data-subject]')) button.addEventListener('click', () => setSubject(button.dataset.subject));
for (const button of document.querySelectorAll('[data-course-view]')) button.addEventListener('click', () => setView(button.dataset.courseView));
for (const button of document.querySelectorAll('[data-course-gaze]')) button.addEventListener('click', () => setGaze(button.dataset.courseGaze));
$('course-start-all').addEventListener('click', () => { if (playback.course.id === 'all') return startCompleteDemo(); setControlMode('demo'); activateChapter(0, { autoplay: true, resetView: true }); });
$('course-complete-entry').addEventListener('click', startCompleteDemo);
$('course-auto-observe').addEventListener('change', event => {
  viewFollow = setCourseViewFollowEnabled(viewFollow, event.target.checked);
  if (event.target.checked) observationGeneration++;
  updateUI();
});
$('course-auto-observe-resume').addEventListener('click', restoreAutoObservation);
$('course-enter-steps').addEventListener('click', () => { if (!mirrorPanelOpen) skipLecture(); });
$('course-reference-overview').addEventListener('click', inspectStepInOverview);
$('course-reference-detail').addEventListener('click', () => { if (['left', 'right'].includes(gaze)) { setMirrorZoom(gaze); updateUI(); } });
$('course-reference-fit').addEventListener('click', () => {
  setMirrorPanel(true);
  if (mirrorProfile === 'parking') {
    mirrorSettings = recommendCourseMirrorSettings(mirrorSettings, 'parking').settings;
    applyMirrorSettings({ persist: true }); updateUI();
    $('course-mirror-adjust-status').textContent = '已按当前眼位推荐停车镜位。先在放大画面认清内侧车身窄条、近处路面与实际出现的库线；不合适可撤销，车辆保持暂停。';
  } else $('course-mirror-adjust-status').textContent = '先固定坐姿，再辨认镜内侧本车轮廓和后方道路。可试用“看清车身与后方”，不合适可撤销；车辆保持暂停。';
});
$('course-case-housing').addEventListener('click', () => startMirrorContactCase('housing'));
$('course-case-support').addEventListener('click', () => startMirrorContactCase('support'));
$('course-restart').addEventListener('click', () => { if (playback.course.id === 'all') return startCompleteDemo(); setControlMode('demo'); activateChapter(0, { autoplay: true, resetView: true }); });
$('course-play').addEventListener('click', togglePlay);
$('course-skip-speech').addEventListener('click', skipLecture);
$('course-subtitles').addEventListener('click', skipLecture);
$('course-retry-speech').addEventListener('click', () => void retrySpeech());
$('course-prev').addEventListener('click', () => activateChapter(playback.index - 1));
$('course-next').addEventListener('click', () => activateChapter(playback.index + 1));
$('course-replay').addEventListener('click', () => isDriving() ? restartPractice() : activateChapter(playback.index, { autoplay: true }));
$('course-timeline').addEventListener('input', event => {
  stopNarration(); const oldIndex = playback.index;
  playback = seekCourseTimeline(playback, Number(event.target.value));
  observationGeneration++;
  if (oldIndex !== playback.index) syncChapter(); else updateUI();
});
$('course-rate').addEventListener('change', event => { playback = { ...playback, rate: Number(event.target.value) }; });
$('course-guidance').addEventListener('change', event => {
  stopNarration();
  const current = teachingIndex();
  playback = { ...playback, stepCoaching: event.target.value === 'steps', phase: 'ready', cueIndex: Math.max(-1, current - 1), pendingCue: null, speechKind: 'intro' };
  observationGeneration++;
  updateUI();
});
$('course-play-mode').addEventListener('change', event => {
  const continuous = event.target.value === 'continuous';
  playback = { ...playback, continuous, checkpointPause: !continuous }; updateUI();
});
$('course-continuous').addEventListener('change', event => { playback = { ...playback, continuous: event.target.checked }; });
$('course-checkpoints').addEventListener('change', event => { playback = { ...playback, checkpointPause: event.target.checked }; });
$('course-voice').addEventListener('change', event => {
  playback = { ...playback, voice: event.target.checked };
  if (!playback.voice && ['narrating', 'lecture-paused', 'speech-error'].includes(playback.phase)) skipLecture({ paused: playback.phase !== 'narrating' });
  updateUI();
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    if (mirrorPanelOpen) { event.preventDefault(); setMirrorPanel(false, { restoreFocus: true }); }
    else if (mirrorZoom) { event.preventDefault(); setMirrorZoom(null); }
    else if (directoryOpen) { event.preventDefault(); setDirectory(false, { restoreFocus: true }); }
    else if (focusMode) { event.preventDefault(); setFocusMode(false); }
    return;
  }
  if (narrowLayout.matches && directoryOpen) {
    if (event.key === 'Tab') {
      const buttons = [...$('course-directory').querySelectorAll('button:not(:disabled)')];
      const first = buttons[0], last = buttons.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    return;
  }
  if (event.ctrlKey || event.metaKey || event.altKey || event.target.closest('input, select, textarea, [contenteditable]')) return;
  const key = event.key.toLowerCase();
  if (mirrorPanelOpen) {
    if (observationKeys[key]) setGaze(observationKeys[key]);
    return;
  }
  if (isDriving()) {
    const controls = { w: 'forward', s: 'reverse', a: 'left', d: 'right', ' ': 'brake' };
    if (controls[key]) {
      event.preventDefault();
      if (!drivingPaused && !driving?.stopReason) {
        if (key === 'a' || key === 'd') centerRequested = false;
        drivingInput[controls[key]] = true;
      }
      return;
    }
    if (key === 'x') { event.preventDefault(); if (!drivingPaused) centerRequested = true; return; }
    if (key === 'j' && !event.repeat) { manualSignal('left'); return; }
    if (key === 'l' && !event.repeat) { manualSignal('right'); return; }
    if (key === 'h' && !event.repeat) { event.preventDefault(); manualParkingBrake(); return; }
    if (key === 'p' && event.repeat) { event.preventDefault(); return; }
  }
  if (key === ' ' && !event.target.closest('button,a,summary')) { event.preventDefault(); togglePlay(); }
  if (key === 'p') { event.preventDefault(); togglePlay(); }
  if (observationKeys[key]) { event.preventDefault(); setGaze(observationKeys[key]); }
});
document.addEventListener('keyup', event => {
  const controls = { w: 'forward', s: 'reverse', a: 'left', d: 'right', ' ': 'brake' };
  const control = controls[event.key.toLowerCase()];
  if (control) drivingInput[control] = false;
});
window.addEventListener('blur', () => { if (isDriving()) pauseDriving(); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden && isDriving()) { pauseDriving(); return; }
  if (document.hidden && ['playing', 'narrating'].includes(playback.phase)) {
    const wasSpeaking = playback.phase === 'narrating'; playback = toggleCoursePlayback(playback);
    if (wasSpeaking) narrator.pause(); updateUI();
  }
});
window.addEventListener('resize', () => {
  const closedByResize = directoryOpen && !narrowLayout.matches;
  if (closedByResize) directoryOpen = false;
  updateDirectoryLayout(); scene?.resize();
  drawCoursePracticeComparison(practice);
  if (closedByResize) $('chapter-list').querySelector('[aria-current="step"]')?.focus({ preventScroll: true });
});
window.addEventListener('pagehide', event => {
  if (isDriving()) pauseDriving();
  if (event.persisted) {
    if (['playing', 'narrating'].includes(playback.phase)) {
      const speaking = playback.phase === 'narrating'; playback = toggleCoursePlayback(playback);
      if (speaking) narrator.pause();
    }
    return;
  }
  destroyed = true; stopNarration(); scene?.dispose();
});
window.addEventListener('pageshow', event => { if (event.persisted) { lastFrame = performance.now(); updateUI(); } });

try {
  scene = createCourseScene({ container: $('course-scene'), mirrorZoomElement: $('course-mirror-zoom-image') });
  $('scene-loading').hidden = true;
} catch (error) {
  $('scene-loading').textContent = '3D 场景暂未加载成功，请刷新后重试。'; console.error(error);
}
setSubject(playback.course.id);
if (initialChapter) {
  const index = playback.course.chapters.findIndex(c => c.id === initialChapter);
  if (index >= 0) activateChapter(index);
}
if (initiallyDriving) { setControlMode('drive'); setView('driver', true); setGaze('forward', false); updateUI(); }
updateDirectoryLayout();
void checkSpeech();
function frame(now) {
  if (destroyed) return;
  const dt = Math.min(.08, Math.max(0, (now - lastFrame) / 1000)); lastFrame = now;
  const old = playback;
  if (isDriving()) {
    if (!mirrorPanelOpen && !drivingPaused && driving) {
      const previous = courseDrivingPose(driving), previousContext = safetyContext || scene?.getSafetyContext?.();
      const candidate = stepCourseDriving(driving, { ...drivingInput, center: centerRequested }, dt);
      const candidatePose = courseDrivingPose(candidate);
      scene?.setPose(candidatePose);
      const context = scene?.getSafetyContext?.();
      const risk = evaluateCourseSafety({ chapter: chapter(), previous, pose: candidatePose, context, previousContext });
      const events = risk.events.filter(event => event.blocking || !activeRiskIds.has(event.id));
      activeRiskIds.clear(); risk.events.forEach(event => activeRiskIds.add(event.id));
      driving = candidate;
      if (risk.blocking) {
        driving = { ...candidate, ...(risk.lastSafePose || previous), speed: 0, acceleration: 0, remainder: 0, stopReason: 'training-risk',
          brake: true, brakeValue: 1, clutch: true, clutchState: 'down', clutchValue: 1, throttle: 0 };
        drivingPaused = true; clearDrivingKeys();
      }
      if (candidate.stopReason === 'teaching-boundary') events.push({ id: 'practice-boundary', type: 'boundary', severity: 'danger', title: '到达本章练习范围边界', detail: '车辆已在练习范围内停住。请核对本项目标，从操作前重练。' });
      if (events.length) recentRisk = { ...(events.find(event => /collision/.test(event.type || '')) || events.find(event => event.blocking || event.severity === 'danger') || events.at(-1)), elapsed: driving.elapsed };
      else if (recentRisk && !risk.blocking) {
        const sceneWarning = recentRisk.severity === 'warning' && recentRisk.id;
        if (sceneWarning ? !risk.events.some(event => event.id === recentRisk.id) : driving.elapsed - recentRisk.elapsed > 4) recentRisk = null;
      }
      updatePractice(Math.max(0, driving.elapsed - previous.elapsed), events);
      if (practice?.feedback?.type === 'info' && practice.feedback.eventId && !risk.events.some(event => event.id === practice.feedback.eventId)) {
        practice = { ...practice, feedback: null };
      }
      safetyContext = context;
      if (centerRequested && Math.abs(driving.steer) < .003) centerRequested = false;
      if (driving.stopReason) { drivingPaused = true; clearDrivingKeys(); }
      if (risk.blocking || practice?.phase === 'review') updateUI();
    }
  } else if (!mirrorPanelOpen) playback = advanceCoursePlayback(playback, dt * actionObservationTiming().rate / playback.rate);
  if (old.index !== playback.index) syncChapter();
  applyAutoObservation();
  if (playback.phase === 'narrating' && (old.phase !== 'narrating' || old.token !== playback.token)) void narrateCurrent();
  if (old.phase !== playback.phase) updateUI();
  updateOperationScene(); scene?.render(playback.phase === 'playing' ? dt * actionObservationTiming().rate : 0);
  if (now - lastHud > 100) { updateUI(); lastHud = now; }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
