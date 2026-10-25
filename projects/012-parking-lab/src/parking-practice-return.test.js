import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { captureParkingPracticeCursor, captureParkingPracticeReturn, restoreParkingPracticeReturn } from './parking-practice-return.js';
import { createDemonstration, createProgress } from './lesson.js';
import { createVoiceTour, voiceTourObservation } from './voice-guide.js';
import { createCockpitSettings } from './cockpit.js';
import { driverLookAngles } from './driver-view.js';

const demo = createDemonstration();
const main = readFileSync(new URL('./main.js', import.meta.url), 'utf8');
const sourceFunction = (name, following) => main.slice(main.indexOf(`function ${name}(`), main.indexOf(`function ${following}(`));

// Execute the production navigation handlers with a small inert DOM boundary.
// Rendering/audio are mocked; the real history/cursor mutations are not.
function fixture() {
  const elements = new Map(), noop = () => {};
  const element = id => {
    if (!elements.has(id)) {
      const classes = new Set();
      elements.set(id, { hidden: false, checked: false, open: false, value: '1', attributes: {},
        classList: { add: (...names) => names.forEach(name => classes.add(name)), remove: (...names) => names.forEach(name => classes.delete(name)),
          toggle: (name, value = !classes.has(name)) => value ? classes.add(name) : classes.delete(name), contains: name => classes.has(name) },
        setAttribute(name, value) { this.attributes[name] = value; }, scrollIntoView: noop, focus: noop });
    }
    return elements.get(id);
  };
  const context = { structuredClone, performance: { now: () => 100 },
    captureParkingPracticeCursor, captureParkingPracticeReturn, restoreParkingPracticeReturn,
    demonstration: demo, voiceTour: createVoiceTour(demo), voiceTourObservation, clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
    state: structuredClone(demo.frames[99]), history: demo.frames.slice(90, 100).map(p => structuredClone(p)),
    progress: { ...createProgress(), started: true, phase: 0 }, historySeedProgress: createProgress(), selectedIndex: 9, sampleTime: demo.frames[99].time,
    started: true, everMoved: true, mode: 'practice', voiceMode: 'practice', voiceKey: 'straight', voicePracticeReady: false,
    voicePracticeAnchor: { state: structuredClone(demo.frames[90]), progress: createProgress(), sourceIndex: 2 },
    voicePracticeReturn: null, reviewResume: null, voicePracticeNotice: '', practiceReport: null, reviewAttemptIndex: 0, reviewVisible: false, reviewInCar: false,
    reviewPreviousView: 'driver', reviewPreviousGaze: 'left', reviewPreviousHead: { yaw: .7, pitch: -.2 }, reviewPreviousMagnify: true,
    view: 'driver', gaze: 'left', headYaw: .7, headPitch: -.2, cockpitTraining: true,
    cockpitSettings: { ...createCockpitSettings(), left: { yaw: 6, pitch: -18 } }, mirrorFitUndo: null,
    beginner: null, judgment: null, correctionDrill: null, alignmentDrill: null, paused: true, centering: false,
    tourToken: 0, tourRunning: false, tourStage: 'ready', tourIndex: 0, lessonStep: 0, demoCursor: 0, demoPlaying: false,
    tourObservationIndex: null, tourManualObservation: false, applyingTourObservation: false,
    lastVoiceKey: '', lastVoiceAt: 0, speechSession: 0, speechState: 'ready', voiceAudioStatus: { state: 'ended' },
    $: element, document: { querySelector: () => element('workspace'), querySelectorAll: () => [] },
    area: element('area'), sceneElement: element('scene'),
    narrator: { stop: noop, pause: noop, resume: noop },
    driverLookAngles, mirrorRenderer: { invalidate: noop },
    analyzePractice: () => ({ attempts: [{ side: 'right', startIndex: 0, endIndex: 9, issueIndex: 2, retryIndex: 1 }] }),
    progressAt: i => ({ ...createProgress(), started: true, phase: 0, recordedIndex: i }),
    currentVoiceCue: () => ({ key: 'straight' }), recordedPose: () => ({ ...context.state }),
    captureDriverLook: () => ({ view: context.view, gaze: context.gaze, yaw: context.headYaw, pitch: context.headPitch, magnify: true }),
    restoreDriverLook: noop, setView: value => { context.view = value; }, setGaze: value => { context.gaze = value; },
    createProgress, setCockpitTraining: value => { context.cockpitTraining = value; },
    reset: () => { context.history = [{ x: 0, z: 0, time: 0, speed: 0 }]; context.state = context.history[0]; context.selectedIndex = 0; },
    seekLessonStep: noop, speakVoice: () => Promise.resolve('ended'), finishLecture: noop,
    syncDemoState: () => { context.state = { ...demo.frames[Math.floor(context.demoCursor)] }; },
  };
  for (const name of ['leaveWelcome', 'exitBeginner', 'exitJudgment', 'exitCorrection', 'updateModeButtons', 'updateVoiceUI',
    'closeViewAdjustment', 'releaseControls', 'updateTimeline', 'updateCar', 'updateTrace', 'updateHUD', 'updatePracticeReview',
    'updateCamera', 'updateCockpitSettingControls', 'saveCockpitSettings', 'updateAlignmentUI', 'updateSpeechUI', 'updateLessonUI', 'finishVoiceSegment']) context[name] = noop;
  vm.createContext(context);
  for (const [name, next] of [['markManualTourObservation', 'currentVoiceCue'], ['stopVoiceExperience', 'enterVoiceTour'],
    ['applyVoiceTourObservation', 'selectVoiceSegment'], ['setGaze', 'enterCockpitTraining'], ['selectVoiceSegment', 'finishVoiceSegment'],
    ['beginVoiceSegment', 'toggleVoiceTour'], ['toggleVoiceTour', 'advanceVoiceTour'], ['reviewVoicePractice', 'returnVoicePractice'],
    ['returnVoicePractice', 'openPracticeReview'], ['openPracticeReview', 'closePracticeReview'],
    ['closePracticeReview', 'seekPracticeReview'], ['seekPracticeReview', 'updatePracticeReview'],
    ['retryBeforePracticeIssue', 'updatePracticeVoice'], ['setMode', 'toggleDemo'], ['updatePauseControls', 'updateHUD'], ['setPaused', 'reset']]) {
    vm.runInContext(sourceFunction(name, next), context);
  }
  return context;
}

test('ordinary review inspection and close restore the entry pose, and resuming retains the complete recording', () => {
  const c = fixture(), end = structuredClone(c.state), frames = structuredClone(c.history);
  c.openPracticeReview();
  assert.equal(c.selectedIndex, 2, 'review starts at the recorded mistake');
  c.seekPracticeReview(1);
  c.closePracticeReview();
  assert.equal(c.selectedIndex, 9); assert.deepEqual(c.state, end); assert.deepEqual(c.history, frames);
  c.setPaused(false);
  assert.equal(c.history.length, 10); assert.equal(c.state.x, end.x); assert.equal(c.state.z, end.z);
});

test('only the explicit error retry adopts the earlier cursor and truncates the future recording', () => {
  const c = fixture(), before = structuredClone(c.history[1]);
  c.openPracticeReview(); c.retryBeforePracticeIssue();
  assert.equal(c.history.length, 2); assert.equal(c.selectedIndex, 1);
  assert.equal(c.state.x, before.x); assert.equal(c.state.z, before.z); assert.equal(c.state.speed, 0);
  assert.equal(c.paused, true); assert.equal(c.voicePracticeReady, true);
});

test('watching a demonstration and returning preserves the complete original review, cursor, settings and resume location', () => {
  const c = fixture(), end = structuredClone(c.state), frames = structuredClone(c.history);
  c.openPracticeReview(); c.reviewVoicePractice();
  assert.equal(c.voiceMode, 'tour'); assert.equal(c.history.length, demo.frames.length);
  assert.ok(c.voicePracticeReturn); c.cockpitSettings.left.yaw = 30; c.gaze = 'right'; c.state.x = 999;
  c.selectVoiceSegment(12);
  c.returnVoicePractice();
  assert.equal(c.voiceMode, 'practice'); assert.equal(c.reviewVisible, true); assert.equal(c.paused, true);
  assert.equal(c.selectedIndex, 2); assert.deepEqual(c.history, frames);
  assert.equal(c.cockpitSettings.left.yaw, 6); assert.equal(c.gaze, 'left');
  assert.equal(c.voicePracticeAnchor.sourceIndex, 2); assert.equal(c.practiceReport.attempts[0].issueIndex, 2);
  assert.match(c.$('pause-button').innerHTML, /继续练习/);
  assert.match(c.$('pause-button').innerHTML, /#i-play/);
  assert.equal(c.$('scene-pause').textContent, '继续 P');
  c.closePracticeReview(); assert.deepEqual(c.state, end); assert.equal(c.selectedIndex, 9);
});

test('a stale return cannot restore into a different mode, and an explicit new practice clears it', () => {
  const c = fixture(); c.reviewVoicePractice(); const demoPose = structuredClone(c.state);
  c.voiceMode = 'off'; c.returnVoicePractice(); assert.deepEqual(c.state, demoPose);
  c.setMode('practice'); assert.equal(c.voicePracticeReturn, null);
  assert.equal(restoreParkingPracticeReturn({ history: [{}], state: {} }), null);
});

test('full tour follows a new segment only, retaining a manual mirror across pause, resume and repeat', () => {
  const c = fixture(); c.voiceMode = 'tour'; c.tourIndex = 2;
  c.beginVoiceSegment(); assert.equal(c.gaze, 'right'); assert.equal(c.tourManualObservation, false);
  c.gaze = 'left'; c.tourManualObservation = true;
  c.toggleVoiceTour(); assert.equal(c.paused, true); assert.equal(c.gaze, 'left');
  c.toggleVoiceTour(); assert.equal(c.gaze, 'left');
  c.beginVoiceSegment(); assert.equal(c.gaze, 'left'); assert.equal(c.tourManualObservation, true);
  c.selectVoiceSegment(3); c.beginVoiceSegment(); assert.equal(c.gaze, 'right'); assert.equal(c.tourManualObservation, false);
  c.selectVoiceSegment(11); c.beginVoiceSegment(); assert.equal(c.gaze, 'left');
  c.selectVoiceSegment(3); c.gaze = 'left'; c.markManualTourObservation();
  c.beginVoiceSegment(); assert.equal(c.gaze, 'left', 'a deliberate look while the segment is still paused also wins');
});

test('selecting a paused left-entry segment immediately changes the actual gaze, eye angles and expanded mirror', () => {
  const c = fixture(); c.voiceMode = 'tour'; c.setGaze('right', { magnify: true });
  assert.equal(c.$('mirror-right').classList.contains('focused'), true);
  c.selectVoiceSegment(12);
  const left = driverLookAngles(c.cockpitSettings, 'left');
  assert.equal(c.voiceTour[c.tourIndex].key, 'prepare_left'); assert.equal(c.paused, true);
  assert.equal(c.gaze, 'left'); assert.equal(c.headYaw, left.yaw); assert.equal(c.headPitch, left.pitch);
  assert.equal(c.$('mirror-left').classList.contains('focused'), true);
  assert.equal(c.$('mirror-right').classList.contains('focused'), false);
  assert.equal(c.$('left-mirror-image').attributes['aria-pressed'], 'true');
  c.setGaze('right', { magnify: true }); const right = driverLookAngles(c.cockpitSettings, 'right');
  c.beginVoiceSegment();
  assert.equal(c.gaze, 'right'); assert.equal(c.headYaw, right.yaw);
  assert.equal(c.$('mirror-right').classList.contains('focused'), true);
  assert.equal(c.tourManualObservation, true, 'playing does not override a deliberate paused observation');
});
