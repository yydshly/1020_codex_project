import * as THREE from 'three';
import './style.css';
import './compact.css';
import './project-nav.css';
import './lesson.css';
import './cockpit.css';
import './voice.css';
import './review.css';
import './beginner.css';
import './judgment.css';
import './audio-flow.css';
import './mirror-training.css';
import { CAR, BAY, COURSE, clamp, localToWorld, stepVehicle, isParked, crossesCourseLine } from './vehicle.js';
import { LESSON_STEPS, createDemonstration, createProgress, advanceProgress, practiceCue } from './lesson.js';
import { createCockpitSettings, setCockpitSetting, cockpitCue, restoreCockpitSettings, COCKPIT_STORAGE_KEY, driverEye } from './cockpit.js';
import { createMirrorRenderer } from './mirrors.js';
import { alignmentStart, createAlignmentDrill, advanceAlignmentDrill, replayAlignmentDrill } from './alignment.js';
import { NARRATION, createNarrator } from './narration.js';
const PARKING_NARRATION = Object.fromEntries(Object.entries(NARRATION).filter(([key]) => !/^course(?:cue)?[23]_/.test(key)));
import { createVoiceTour, practiceVoiceCue, voiceGuidance, voiceTourObservation } from './voice-guide.js';
import { captureParkingPracticeCursor, captureParkingPracticeReturn, restoreParkingPracticeReturn } from './parking-practice-return.js';
import { analyzePractice, canReviewPractice } from './review.js';
import { renderReviewMap } from './review-map.js';
import { resolveParkingEntry } from './progress-catalog.js';
import { beginnerStart, beginnerInput, advanceBeginner } from './beginner.js';
import { createJudgmentDrill, advanceJudgmentDrill, retryJudgmentDrill } from './judgment.js';
import { loadSpeechCatalog, resolveSpeechClip, warmSpeechClips, LIVE_SPEECH_KEYS } from './speech-catalog.js';
import { finishLecture } from './speech-flow.js';
import { recommendMirrorSettings } from './mirror-fit.js';
import { createTrainingCar, CAR_VISUAL_ROOT_Y } from './vehicle-visuals.js';
import { createDrivingYard } from './driving-yard.js';
import { PAINT_SURFACE_Y, TEACHING_SURFACE_Y } from './scene-geometry.js';
import { driverLookAngles, driverVerticalFov } from './driver-view.js';
import { observationGuide, recognitionChallenge } from './observation-guide.js';
import { createCorrectionDrill, correctionInput, advanceCorrection, correctionGuidance } from './correction.js';
import './realistic-scene.css';
import './learning-loop.css';

const $ = id => document.getElementById(id);
const sceneElement = $('scene');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
} catch (error) {
  $('loading').innerHTML = '<p>浏览器暂时无法开启 3D 加速。</p><p>请在支持 WebGL 2 的浏览器中打开此页面。</p>';
  console.error(error);
  throw error;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
sceneElement.appendChild(renderer.domElement);

const world = new THREE.Scene();
world.background = new THREE.Color('#d7e0e7');
world.fog = new THREE.Fog('#d7e0e7', 55, 145);
const camera = new THREE.PerspectiveCamera(42, 1, 0.08, 180);
world.add(new THREE.HemisphereLight('#eaf2ff', '#777b76', 1.55));
world.add(new THREE.AmbientLight('#c4d0d8', .3));
const sun = new THREE.DirectionalLight('#fff6e9', 3.0);
sun.position.set(-15, 28, 10);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -28, right: 28, top: 28, bottom: -28, far: 85 });
sun.shadow.bias = -0.0003;
sun.shadow.normalBias = 0.035;
sun.shadow.blurSamples = 12;
world.add(sun);

const mat = (color, roughness = 0.85, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, ...extra });
const helpers = new THREE.Group();
world.add(helpers);

function box(w, h, d, material, x = 0, y = 0, z = 0, parent = world, shadow = true) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = shadow;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
function line(points, color, parent = world, opacity = 1) {
  const mesh = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points.map(p => new THREE.Vector3(...p))), new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity }));
  parent.add(mesh);
  return mesh;
}
function label(text, x, y, z, size = 1, color = '#526a4f', rotation = -Math.PI / 2, parent = world) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024; canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.font = '500 110px "Segoe UI", "Microsoft YaHei", sans-serif';
  ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, 512, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size * 4, size), new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
  mesh.position.set(x, y, z); mesh.rotation.x = rotation;
  parent.add(mesh); return mesh;
}

// One metric yard and one shared vehicle structure serve every camera.
const asphaltMap = new THREE.TextureLoader().load(new URL('../assets/textures/yard-asphalt-v1.png', import.meta.url).href);
asphaltMap.colorSpace = THREE.SRGBColorSpace;
asphaltMap.wrapS = asphaltMap.wrapT = THREE.RepeatWrapping;
asphaltMap.repeat.set(31 / 2, 23.2 / 2);
asphaltMap.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
const yard = createDrivingYard({ world, helpers, asphaltMap });
const { bayLines, normalLineMaterial, warningLineMaterial: warningLineMat, grid, targetOutline, turnMarkers, teachingObjects, landmarks: beginnerLandmarks } = yard;
const beginnerCarLabel = beginnerLandmarks.carLabel;
const carModel = createTrainingCar({ world });

// Keep trace buffers allocated once so long practices do not accumulate GPU resources.
const MAX_SAMPLES = 9000;
const traceGroup = new THREE.Group(); world.add(traceGroup);
function createTrace(color, opacity = 0.9, dashed = false) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_SAMPLES * 3), 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setDrawRange(0, 0);
  const material = dashed ? new THREE.LineDashedMaterial({ color, dashSize: 0.25, gapSize: 0.15, transparent: true, opacity }) : new THREE.LineBasicMaterial({ color, transparent: true, opacity });
  const mesh = new THREE.Line(geometry, material); mesh.frustumCulled = false; traceGroup.add(mesh);
  return mesh;
}
const traces = [createTrace('#238b6a'), createTrace('#238b6a'), createTrace('#cc8f4d', 0.8), createTrace('#cc8f4d', 0.8)];
const prediction = createTrace('#5e7861', 0.55, true);
const ghosts = new THREE.Group(); world.add(ghosts); ghosts.visible = false;
const ghostMaterial = new THREE.LineBasicMaterial({ color: '#3e8267', transparent: true, opacity: 0.23 });
for (let i = 0; i < 9; i++) {
  const g = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(CAR.width, 0.12, CAR.length)), ghostMaterial);
  ghosts.add(g);
}

const demonstration = createDemonstration();
const voiceTour = createVoiceTour(demonstration);
let beginner = null, beginnerToken = 0;
let judgment = null, judgmentToken = 0;
const beginnerTurnEnd = demonstration.frames.findIndex((pose, index) => index > demonstration.stops[1] && pose.steer <= -CAR.maxSteer + 1e-6);
const beginnerHoldEnd = demonstration.frames.findIndex((pose, index) => index > beginnerTurnEnd && -pose.heading <= 2.7 * Math.PI / 180);
const beginnerRanges = { turn: [demonstration.stops[1], beginnerTurnEnd + 12], hold: [beginnerTurnEnd + 12, beginnerHoldEnd], center: [beginnerHoldEnd, demonstration.stops[4]] };
let voiceMode = 'off', voiceKey = 'intro', tourStage = 'ready';
let tourIndex = 0, tourToken = 0, tourRunning = false;
let lastVoiceKey = '', lastVoiceAt = 0;
let voicePracticeReady = false;
let voicePracticeAnchor = null;
let voicePracticeReturn = null, reviewResume = null, voicePracticeNotice = '';
let tourObservationIndex = null, tourManualObservation = false, applyingTourObservation = false;
let reviewVisible = false, reviewInCar = false;
let practiceReport = null, reviewAttemptIndex = 0;
let reviewPreviousView = 'driver', reviewPreviousGaze = 'forward';
let reviewPreviousHead = { yaw: 0, pitch: -0.02 };
let reviewPreviousMagnify = false;
let voiceAudioStatus = { state: 'idle' };
let speechCatalog = null, speechState = 'checking', speechMessage = '', speechRequest = 0, speechSession = 0;
const appBase = import.meta.env.BASE_URL;
const narrator = createNarrator({
  resolveClip: key => speechState === 'ready' ? resolveSpeechClip(speechCatalog, key, appBase) : null,
  onStatus: status => {
    voiceAudioStatus = status;
    if (status.state === 'error' && voiceMode === 'practice' && $('voice-enabled').checked && !paused) setPaused(true);
    updateVoiceStatus();
  },
});
let mode = 'practice';
let lessonStep = 0;
let demoCursor = 0;
let demoPlaying = false;
let centering = false;
let progress = createProgress();
let historySeedProgress = createProgress();
const startPose = () => ({ ...demonstration.frames[0], step: undefined });
let state = startPose();
let history = [{ ...state }];
let sampleTime = 0;
let paused = false;
let selectedIndex = 0;
let view = 'orbit';
let cockpitTraining = false;
let cockpitSettings = createCockpitSettings();
try { cockpitSettings = restoreCockpitSettings(localStorage.getItem(COCKPIT_STORAGE_KEY)); } catch { /* Storage may be disabled. */ }
let alignmentDrill = null;
let correctionDrill = null, correctionNotice = '', correctionBefore = null, correctionSettings = null, correctionToken = 0;
let gaze = 'forward';
let headYaw = 0;
let headPitch = -0.02;
let lastDragY = 0;
let activeAdjustment = null;
let mirrorFitUndo = null;
let started = false;
let everMoved = false;
let frameTime = performance.now();
let hudTime = 0;
let pathTime = 0;
let width = 1, height = 1;
let orbitAngle = 0;
let orbitZoom = 1;
let dragging = false;
let dragDistance = 0;
let lastDragX = 0;
const inputs = { left: false, right: false, forward: false, reverse: false, brake: false, center: false };
const keys = new Set();
const pointerControls = new Set();
const carPosition = new THREE.Vector3();
const lookTarget = new THREE.Vector3();
const cameraDestination = new THREE.Vector3();
const up = new THREE.Vector3(0, 1, 0);
const area = document.querySelector('.scene-area');
const ui = Object.fromEntries(['speed', 'gear', 'motion-status', 'steer-angle', 'steering-wheel', 'feedback-text', 'mission-state', 'coach-tip', 'replay-time', 'timeline'].map(id => [id, $(id)]));
const mirrorRenderer = createMirrorRenderer({ renderer, world, carModel });
const recordedPose = () => ({ ...state, reviewCenter: voiceMode === 'practice' && Boolean(inputs.center),
  reviewInput: { reverse: Boolean(inputs.reverse), forward: Boolean(inputs.forward), brake: Boolean(inputs.brake), center: Boolean(inputs.center), speedLimit: inputs.speedLimit } });

function leaveWelcome() {
  document.querySelector('.workspace').classList.remove('welcome-active');
  $('welcome-panel').hidden = true;
  $('other-modes').open = false;
}
function updateSpeechUI() {
  const enabled = $('voice-enabled').checked;
  const failedClip = enabled && voiceAudioStatus.state === 'error';
  $('speech-connection').dataset.state = speechState === 'checking' ? 'checking' : failedClip ? 'error' : speechState;
  $('speech-connection').setAttribute('aria-busy', String(speechState === 'checking'));
  $('speech-provider-label').textContent = !enabled ? '字幕练习模式' : speechState === 'ready' && !failedClip ? 'MiniMax 教练语音已就绪' : speechState === 'checking' ? '正在准备 MiniMax 教练语音' : 'MiniMax 语音暂不可用';
  $('speech-provider-detail').textContent = !enabled ? '按字幕看示范、自己判断；需要时可重新启用语音。' : speechState === 'checking' ? '先准备讲解与操作提醒，车辆保持停住。' : failedClip ? '车辆会停在当前讲解步骤，可以重试语音或选择字幕继续。' : speechState === 'ready' ? `已准备 ${Object.keys(speechCatalog.clips).length} 段真实语音，关键操作提醒已缓存。` : speechMessage || '讲解包尚未准备好，可以先使用字幕练习。';
  $('speech-retry').hidden = !enabled || speechState === 'ready' && !failedClip;
  $('speech-retry').disabled = speechState === 'checking';
  $('speech-retry').textContent = failedClip ? '重试语音' : '重新检查';
  $('speech-subtitles').hidden = !enabled || speechState === 'ready' && !failedClip;
  $('speech-voice').hidden = enabled;
}
async function prepareSpeech(retryCurrent = false) {
  const request = ++speechRequest;
  const anchor = { beginner, beginnerToken, judgment, judgmentToken, voiceMode, tourToken, voicePracticeAnchor, session: speechSession };
  speechState = 'checking'; speechMessage = ''; updateSpeechUI();
  try {
    const catalog = await loadSpeechCatalog(PARKING_NARRATION, { baseUrl: appBase });
    await warmSpeechClips(catalog, [...LIVE_SPEECH_KEYS, ...Object.keys(PARKING_NARRATION)], { baseUrl: appBase });
    if (request !== speechRequest) return;
    speechCatalog = catalog; speechState = 'ready'; updateSpeechUI();
    if (!retryCurrent || !$('voice-enabled').checked || anchor.session !== speechSession) return;
    if (beginner && beginner === anchor.beginner && beginnerToken === anchor.beginnerToken && beginner.phase === 'speech-error') startBeginnerDemo();
    else if (beginner && beginner === anchor.beginner && beginnerToken === anchor.beginnerToken && ['mirror', 'compare'].includes(beginner.step)) beginnerVoice(`beginner_${beginner.step}`);
    else if (beginner && beginner === anchor.beginner && beginnerToken === anchor.beginnerToken && beginner.step === 'center' && beginner.phase === 'complete') beginnerVoice('beginner_finish');
    else if (judgment && judgment === anchor.judgment && judgmentToken === anchor.judgmentToken && judgment.phase === 'speech-error') startJudgmentDemo();
    else if (voiceMode === 'tour' && anchor.voiceMode === 'tour' && tourToken === anchor.tourToken && tourStage === 'speech-error') beginVoiceSegment();
    else if (voiceMode === 'practice' && voicePracticeAnchor === anchor.voicePracticeAnchor && paused) speakVoice(currentVoiceCue().key);
    else if (judgment?.phase === 'result' && judgment === anchor.judgment && judgmentToken === anchor.judgmentToken) beginnerVoice(judgmentFeedbackKey());
  } catch (error) {
    if (request !== speechRequest) return;
    speechCatalog = null; speechState = 'unconfigured'; speechMessage = error.message || 'MiniMax 语音包暂不可读取。'; updateSpeechUI();
  }
}
function chooseSubtitles() {
  $('voice-enabled').checked = false;
  narrator.stop();
  if (beginner && ['narrating', 'speech-error'].includes(beginner.phase)) { beginnerToken++; beginner.phase = 'demo'; paused = false; updateBeginnerUI(); }
  if (judgment && ['narrating', 'speech-error'].includes(judgment.phase)) { judgmentToken++; judgment.phase = 'demo'; paused = false; updateJudgmentUI(); }
  if (voiceMode === 'tour' && ['narrating', 'speech-error'].includes(tourStage)) { tourToken++; tourStage = 'moving'; tourRunning = true; demoPlaying = true; paused = false; }
  if (correctionDrill?.phase === 'preparing') { correctionToken++; correctionDrill = { ...correctionDrill, phase: 'armed' }; paused = true; correctionNotice = '字幕模式。按提示的小幅方向开始练习；关键观察点会教学暂停。'; updateCorrectionUI(); }
  updateSpeechUI(); updateVoiceUI();
}
function beginnerVoice(key) {
  if (!$('voice-enabled').checked) return Promise.resolve('ended');
  return narrator.play(key, { rate: Number($('voice-rate').value), volume: Number($('voice-volume').value) });
}
function loadJudgmentPose(pose) {
  centering = false; releaseControls(); paused = true;
  state = { ...pose, speed: 0 }; started = false; everMoved = true;
  progress = { ...createProgress(), phase: judgment.side === 'left' ? 2 : 0, checkedA: true, passedB: judgment.side === 'left' };
  historySeedProgress = { ...progress }; history = judgment.drill.frames;
  selectedIndex = history.length - 1; sampleTime = state.time;
  updateCar(); updateTrace(); updateTimeline();
}
function enterJudgment(side = 'right') {
  const retainedLook = captureDriverLook();
  stopVoiceExperience(); closeViewAdjustment();
  if (mode !== 'practice') setMode('practice');
  alignmentDrill = null; setCockpitTraining(true);
  judgment = { side, phase: 'ready', drill: createJudgmentDrill(demonstration, side), notice: '', settings: structuredClone(cockpitSettings) };
  document.querySelector('.workspace').classList.add('judgment-active');
  $('judgment-panel').hidden = false; $('judgment-comparison').hidden = true;
  loadJudgmentPose(judgment.drill.startState); restoreDriverLook(retainedLook, side, true);
  updateModeButtons(); updateJudgmentUI();
  $('judgment-panel').scrollIntoView({ block: 'start', behavior: 'smooth' });
}
function exitJudgment() {
  if (!judgment) return;
  judgment = null; judgmentToken++; narrator.stop();
  centering = false; releaseControls(); paused = true; state.speed = 0;
  $('judgment-panel').hidden = true; $('judgment-comparison').hidden = true;
  document.querySelector('.workspace').classList.remove('judgment-active');
  for (const side of ['left', 'right']) for (const role of ['actual', 'reference']) $(`judgment-${role}-${side}`).removeAttribute('src');
}
function startJudgmentDemo() {
  if (!judgment) return;
  const retainedLook = captureDriverLook();
  judgment.phase = 'narrating'; judgment.notice = ''; judgment.cursor = 0;
  const centeredIndex = judgment.drill.referenceFrames.findIndex((pose, index) => index > judgment.drill.referenceDecisionIndex && Math.abs(pose.steer) < 1e-7);
  judgment.demoEnd = centeredIndex < 0 ? judgment.drill.referenceFrames.length - 1 : centeredIndex;
  centering = false; releaseControls(); narrator.stop();
  state = { ...judgment.drill.referenceFrames[0], speed: 0 }; paused = false;
  $('judgment-comparison').hidden = true; restoreDriverLook(retainedLook, judgment.side);
  const token = ++judgmentToken;
  updateJudgmentUI();
  finishLecture(beginnerVoice('judgment_intro'), {
    isCurrent: () => judgment && token === judgmentToken && judgment.phase === 'narrating',
    onReady: () => { judgment.phase = 'demo'; updateJudgmentUI(); },
    onError: () => { judgment.phase = 'speech-error'; paused = true; updateJudgmentUI(); },
  });
}
function prepareJudgmentPractice(retry = false) {
  if (!judgment) return;
  const retainedLook = captureDriverLook();
  speechSession++;
  judgmentToken++; narrator.stop();
  judgment.drill = retry ? retryJudgmentDrill(judgment.drill) : createJudgmentDrill(demonstration, judgment.side, { speedLimit: judgment.drill.speedLimit });
  judgment.phase = 'practice-ready'; judgment.notice = retry ? '已回到这次操作前的位置。旧回正动作已清除，准备好再倒车。' : '';
  judgment.settings = structuredClone(cockpitSettings);
  $('judgment-comparison').hidden = true;
  loadJudgmentPose(judgment.drill.startState); restoreDriverLook(retainedLook, judgment.side);
  updateHUD(); updateJudgmentUI(); sceneElement.focus({ preventScroll: true });
}
function startJudgmentReverse() {
  if (!judgment || !['practice-ready', 'practice'].includes(judgment.phase)) return;
  narrator.stop();
  if (judgment.phase === 'practice-ready') { judgment.phase = 'practice'; judgment.drill = { ...judgment.drill, status: 'running' }; }
  judgment.notice = ''; paused = false; closeViewAdjustment();
  pointerControls.add('reverse'); refreshInputs(); updateJudgmentUI();
}
function centerJudgment() {
  if (!judgment || judgment.phase !== 'practice' || paused) {
    if (judgment) { judgment.notice = '先按住 S 开始倒车，再看镜选择回正时机。'; updateJudgmentUI(); }
    return;
  }
  judgment.notice = ''; centering = true; refreshInputs(); updateJudgmentUI();
}
function nextJudgment() {
  if (!judgment) return;
  if (judgment.phase === 'ready') return startJudgmentDemo();
  if (judgment.phase === 'speech-error') return chooseSubtitles();
  if (judgment.phase === 'narrating') { judgmentToken++; narrator.stop(); judgment.phase = 'demo'; paused = false; }
  else if (judgment.phase === 'demo') return setPaused(!paused);
  else if (judgment.phase === 'demo-done') return prepareJudgmentPractice();
  else if (judgment.phase === 'result') return startJudgmentDemo();
  updateJudgmentUI();
}
function capturePoseMirrors(pose, settings) {
  const previous = state;
  const visibility = [traceGroup, helpers, ghosts, grid].map(object => object.visible);
  const materials = bayLines.map(mesh => mesh.material);
  try {
    state = { ...pose }; updateCar();
    for (const object of [traceGroup, helpers, ghosts, grid]) object.visible = false;
    for (const mesh of bayLines) mesh.material = normalLineMaterial;
    return mirrorRenderer.capture(state, settings);
  } finally {
    state = previous; updateCar();
    [traceGroup, helpers, ghosts, grid].forEach((object, index) => { object.visible = visibility[index]; });
    bayLines.forEach((mesh, index) => { mesh.material = materials[index]; });
  }
}
const captureJudgmentMirrors = pose => capturePoseMirrors(pose, judgment.settings);

function exitCorrection() {
  const wasActive = Boolean(correctionDrill);
  correctionToken++;
  correctionDrill = null; correctionBefore = null; correctionSettings = null; correctionNotice = '';
  $('correction-panel').hidden = true;
  $('correction-comparison').hidden = true;
  document.querySelector('.workspace').classList.remove('correction-active');
  mirrorRenderer.setRecognitionGuides(false);
  if (wasActive) { centering = false; releaseControls(); state.speed = 0; paused = true; }
}
function enterCorrection(side = 'left', retainLook = false) {
  const look = captureDriverLook();
  stopVoiceExperience(); closeViewAdjustment();
  if (mode !== 'practice') setMode('practice');
  alignmentDrill = null; setCockpitTraining(true);
  correctionDrill = createCorrectionDrill(side); correctionNotice = '';
  state = { ...correctionDrill.start }; centering = false; releaseControls(); paused = true;
  history = [{ ...state }]; selectedIndex = 0; sampleTime = 0; started = false; everMoved = true;
  progress = createProgress(); historySeedProgress = { ...progress };
  correctionSettings = structuredClone(cockpitSettings);
  $('correction-panel').hidden = false;
  $('correction-comparison').hidden = true;
  document.querySelector('.workspace').classList.add('correction-active');
  restoreDriverLook(retainLook ? look : null, side);
  mirrorRenderer.setRecognitionGuides(true);
  updateCar(); updateTrace(); updateModeButtons(); updateHUD(); updateCorrectionUI();
  beginnerVoice('correction_intro');
  $('correction-panel').scrollIntoView({ block: 'start', behavior: 'instant' });
}
function prepareCorrection() {
  if (correctionDrill?.phase !== 'ready') return;
  if (!correctionReferencesReady()) { correctionNotice = '当前两侧参照还不齐全，请先调镜并确认车身与库边线，再开始操作。'; updateCorrectionUI(); return; }
  const token = ++correctionToken;
  correctionSettings = structuredClone(cockpitSettings);
  correctionBefore = capturePoseMirrors(correctionDrill.start, correctionSettings);
  correctionDrill = { ...correctionDrill, phase: 'preparing' }; paused = true; correctionNotice = '';
  updateCorrectionUI();
  finishLecture(beginnerVoice(correctionDrill.side === 'left' ? 'correction_left_tight' : 'correction_right_tight'), {
    isCurrent: () => correctionDrill && correctionToken === token && correctionDrill.phase === 'preparing',
    onReady: () => { correctionDrill = { ...correctionDrill, phase: 'armed' }; paused = true; correctionNotice = '讲解结束。按住提示的方向键开始，系统辅助低速；松开方向键会保持当前转角。'; updateCorrectionUI(); },
    onError: () => { correctionDrill = { ...correctionDrill, phase: 'ready' }; paused = true; correctionNotice = '语音未能播放，车辆保持停住。可重试语音，或在上方选择字幕练习。'; updateCorrectionUI(); },
  });
}
function startCorrectionControl(control) {
  if (!correctionDrill || !['armed', 'practice', 'return'].includes(correctionDrill.phase)) return;
  if (control === 'center' && correctionDrill.phase === 'armed') return;
  if (correctionDrill.phase === 'armed') correctionDrill = { ...correctionDrill, phase: 'practice' };
  paused = false; correctionNotice = '';
  if (control === 'center') { centering = true; pointerControls.delete('left'); pointerControls.delete('right'); }
  else pointerControls.add(control);
  refreshInputs(); updateCorrectionUI(); sceneElement.focus({ preventScroll: true });
}
function updateCorrectionUI() {
  if (!correctionDrill) return;
  const drill = correctionDrill, phase = drill.phase;
  const guidance = correctionGuidance(drill);
  const side = gaze === 'left' ? 'left' : gaze === 'right' ? 'right' : drill.side;
  const visible = observationGuide(side, mirrorRenderer.observe(state, side, cockpitSettings));
  const referencesReady = correctionReferencesReady();
  $('correction-title').textContent = phase === 'preparing' ? '先听操作讲解，再亲手修方向' : phase === 'ready' ? '判断正确，先听这次操作提示' : guidance.title;
  $('correction-instruction').textContent = phase === 'observe' ? visible.text : guidance.text;
  const tightName = drill.side === 'left' ? '左' : '右', turnName = drill.side === 'left' ? '右' : '左';
  $('correction-direction').textContent = phase === 'observe'
    ? '判断只用本车与库侧线。库口外沿向库外延伸；库底线在库尾。没有入镜的线不用找。'
    : phase === 'result' ? '回正只让前轮回中；是否能继续直倒，还要看车身姿态、两侧余量和周围环境。'
    : `本题车尾向${tightName}斜入 → 方向盘向${turnName}小幅转 → 车尾轨迹逐渐向${turnName}弯，车头向${tightName}外摆。`;
  $('correction-stage').textContent = phase === 'result' ? '4 · 对比同一镜面，再从操作前重练' : phase === 'return' ? '3 · 余量改善，主动回正' : ['armed', 'practice', 'preparing'].includes(phase) ? '2 · 小幅转向，观察变化' : '1 · 看镜辨认紧侧';
  $('correction-recognize').hidden = !['observe', 'ready'].includes(phase);
  $('correction-start').hidden = !['ready', 'preparing'].includes(phase);
  $('correction-start').disabled = phase === 'preparing';
  if (phase === 'ready' && !referencesReady) $('correction-start').disabled = true;
  $('correction-start').textContent = phase === 'preparing' ? '先听操作讲解' : '听提示，准备小幅纠偏';
  for (const control of ['left', 'right', 'center']) {
    $('correction-' + control).hidden = !['armed', 'practice', 'return'].includes(phase);
    $('correction-' + control).disabled = control === 'center' && phase === 'armed';
    $('correction-' + control).classList.toggle('held', Boolean(inputs[control]) && !paused);
  }
  $('correction-pause').hidden = !['preparing', 'practice', 'return'].includes(phase);
  $('correction-pause').textContent = phase === 'preparing' ? narrator.status.state === 'paused' ? '继续讲解 P' : '暂停讲解 P' : paused ? '继续观察 P' : '暂停观察 P';
  $('correction-retry').hidden = phase !== 'result';
  $('correction-status').textContent = correctionNotice || (phase === 'preparing' ? 'MiniMax 正在讲解，车辆停住。听完后由你开始操作。' : phase === 'result' ? '已教学暂停。两图使用同一座椅、同一镜面设置；青色描出可见车身参照，金色标同侧库侧线。' : phase === 'return' && paused ? '观察点已教学暂停。确认余量改善后，按 X 回正并继续这一步。' : paused ? '车辆停住，先观察，不会自动起步。' : '系统辅助低速倒车；你控制小幅方向与主动回正。');
  if (phase === 'preparing' && narrator.status.state === 'paused') $('correction-status').textContent = '讲解已暂停，车辆保持停住。点继续讲解或按 P 恢复。';
  for (const button of document.querySelectorAll('[data-tight-side]')) button.disabled = !referencesReady;
  if (['observe', 'ready'].includes(phase) && !referencesReady) $('correction-status').textContent = '先确认两面镜中都能辨认车身与库边线。当前有参照不可见，暂不让你猜紧侧；请先按当前眼位调镜，或回到镜面辨认。';
  for (const button of document.querySelectorAll('[data-correction-side]')) { button.setAttribute('aria-pressed', String(button.dataset.correctionSide === drill.side)); button.disabled = ['practice', 'return', 'preparing'].includes(phase); }
  $('scene-mode').textContent = `小幅纠偏 · ${phase === 'result' ? '对比镜面' : paused ? '停住观察' : '由你修方向'}`;
}
function correctionReferencesReady() {
  return ['left', 'right'].every(side => {
    const observed = mirrorRenderer.observe(state, side, cockpitSettings);
      return observed.body.visible && observed.lineVisible && observed.lineReadable !== false;
  });
}
function advanceCorrectionFrame(dt) {
  if (!correctionDrill || paused || !['practice', 'return'].includes(correctionDrill.phase) || $('help-dialog').open || $('exam-rules-dialog').open) return;
  const input = correctionInput(correctionDrill, inputs);
  const count = Math.max(1, Math.ceil(dt / (1 / 120)));
  for (let i = 0; i < count; i++) {
    const previous = state, previousPhase = correctionDrill.phase;
    state = stepVehicle(state, input, dt / count);
    correctionDrill = advanceCorrection(correctionDrill, previous, state, input);
    if (correctionDrill.phase === 'result') {
      paused = true; state.speed = 0; centering = false; releaseControls(); narrator.stop(); updateCar();
      const after = capturePoseMirrors(state, correctionSettings);
      $('correction-before').src = correctionBefore[correctionDrill.side];
      $('correction-after').src = after[correctionDrill.side];
      $('correction-before-title').textContent = `操作前的${correctionDrill.side === 'left' ? '左' : '右'}镜`;
      $('correction-comparison-note').textContent = `${correctionDrill.result.kind === 'good' ? '重点看本车参照与同侧库侧线的变化；这次按模型预测的直倒余量已改善。' : '重点看本车与同侧库侧线怎样变化，为什么仍需重练。'} 横向的库口外沿不作入库方向参照。两图使用同一镜域。`;
      $('correction-comparison').hidden = false;
      beginnerVoice(correctionDrill.result.kind === 'good' ? 'correction_good' : 'correction_retry');
      updateCorrectionUI(); $('correction-panel').scrollIntoView({ block: 'start', behavior: 'smooth' }); break;
    }
    if (previousPhase === 'practice' && correctionDrill.phase === 'return') {
      paused = true; state.speed = 0; releaseControls();
      beginnerVoice('correction_return'); updateCorrectionUI(); break;
    }
  }
  if (centering && Math.abs(state.steer) < 1e-7) { centering = false; refreshInputs(); }
  history.push({ ...state }); selectedIndex = history.length - 1;
}
function toggleCorrectionPause() {
  if (correctionDrill?.phase === 'preparing') return setPaused(narrator.status.state !== 'paused');
  setPaused(!paused);
}
function showJudgmentResult() {
  judgment.phase = 'result'; paused = true; state.speed = 0;
  centering = false; releaseControls(); narrator.stop();
  const drill = judgment.drill, result = drill.result;
  if (drill.decisionIndex == null) judgment.settings = structuredClone(cockpitSettings);
  $('judgment-actual-title').textContent = drill.decisionIndex == null ? '你错过时机的镜面' : '你开始回正时的镜面';
  $('judgment-reference-title').textContent = '示范开始回正时的镜面';
  const actualIndex = result.decisionIndex ?? drill.decisionIndex ?? result.errorIndex ?? drill.frames.length - 1;
  const actualPose = result.decisionPose ?? drill.frames[actualIndex];
  const referencePose = result.referencePose;
  if (actualPose && referencePose) {
    const actual = captureJudgmentMirrors(actualPose), reference = captureJudgmentMirrors(referencePose);
    for (const side of ['left', 'right']) {
      $(`judgment-actual-${side}`).src = actual[side];
      $(`judgment-reference-${side}`).src = reference[side];
      $(`judgment-actual-${side}`).alt = `你${drill.decisionIndex == null ? '错过回正时' : '开始回正时'}的${side === 'left' ? '左' : '右'}镜面`;
      $(`judgment-reference-${side}`).alt = `同一镜面设置下，示范开始回正时的${side === 'left' ? '左' : '右'}镜面`;
    }
    $('judgment-comparison-note').textContent = `${drill.decisionIndex == null ? '左组：你错过回正时机的画面' : '左组：你开始回正的一刻'}；右组：本片段示范开始回正的一刻。两组使用同一座椅和后视镜设置，比较的是操作时机，不是同一时刻。青色描出可见车身参照，金色标同侧库侧线；遮挡处不画。`;
    $('judgment-comparison').hidden = false;
  }
  history = drill.frames; selectedIndex = history.length - 1;
  updateHUD(); updateJudgmentUI();
  beginnerVoice(judgmentFeedbackKey());
  $('judgment-panel').scrollIntoView({ block: 'start', behavior: 'smooth' });
}
function judgmentFeedbackKey() {
  if (judgment.drill.decisionIndex == null) return judgment.drill.result.kind === 'late' ? 'alignment_missed' : judgment.drill.result.kind === 'line' ? 'recovery_clearance' : 'takeover_short';
  return ({ good: 'alignment_good', early: 'alignment_early', late: 'alignment_late' })[judgment.drill.result.kind] ?? 'recovery_clearance';
}
function updateJudgmentUI() {
  if (!judgment) return;
  const { phase, side, drill } = judgment;
  const practicing = ['practice-ready', 'practice'].includes(phase), result = phase === 'result';
  $('judgment-progress').textContent = `${side === 'left' ? '左' : '右'}倒库短练 · ${result ? '对照镜面，再练一次' : practicing ? judgment.notice ? '回到操作前，准备重练' : '自己判断' : '看一段示范'}`;
  let title = '先看示范：车身快直时，主动回正';
  let instruction = '先辨认镜内侧的车身，再比较它与库边线的夹角和间隙。示范会从保持转角演示到回正；需要时打开辨认辅助或点镜面教学放大。';
  if (phase === 'narrating') { title = '先听观察方法，再看动作'; instruction = '语音讲完会开始慢放；你也可以直接看动作。'; }
  if (phase === 'speech-error') { title = '讲解未能播放，车辆已停住'; instruction = '重试 MiniMax 语音，或选择字幕继续看动作；这次不会自动跳过讲解。'; }
  if (phase === 'demo') { title = '观察示范：回正时，同侧间隙怎样变化'; instruction = $('mirror-labels').checked ? '青色描出可见车身参照，金色标出同侧库侧线。观察同一面镜中两者的关系，再核对另一侧；可暂停观察。' : '对照同一面镜内车身与库侧线的变化，再核对另一侧。可暂停、点镜面教学放大，或打开辨认辅助。'; }
  if (phase === 'demo-done') { title = '接下来由你决定什么时候回正'; instruction = '先按住 S 慢慢倒车，看两面镜，觉得时机合适时按 X。练习不会提前报出回正口令。'; }
  if (practicing) { title = '按住 S 倒车，自己判断后按 X 回正'; instruction = '先看同一面镜中车身与库侧线的关系怎样变化，再核对另一侧。系统只限制低速，回正时机由你选择；按 P 可暂停观察。'; }
  if (result) { title = drill.result.title; instruction = drill.result.text; }
  $('judgment-title').textContent = title; $('judgment-instruction').textContent = instruction;
  $('judgment-next').hidden = practicing;
  $('judgment-next').textContent = result ? '再看示范' : phase === 'ready' ? '播放这段示范' : phase === 'speech-error' ? '字幕继续看动作' : phase === 'narrating' ? '直接看动作' : phase === 'demo' ? paused ? '继续示范' : '暂停看清楚' : '准备好了，我来判断';
  $('judgment-next').classList.toggle('judgment-primary', !result);
  $('judgment-action').hidden = $('judgment-reverse').hidden = !practicing;
  $('judgment-action').disabled = practicing && (phase !== 'practice' || paused);
  $('judgment-reverse').classList.toggle('held', Boolean(inputs.reverse) && !paused);
  $('judgment-pause').hidden = !practicing;
  $('judgment-pause').disabled = phase === 'practice-ready';
  $('judgment-pause').textContent = paused ? '继续观察 / P' : '暂停观察 / P';
  $('judgment-retry').hidden = $('judgment-again').hidden = !result;
  $('judgment-retry').textContent = drill.result?.kind === 'good' ? '从回正前再练' : '从出错前重练';
  $('judgment-full').hidden = !result;
  $('judgment-status').textContent = judgment.notice || (result ? '片段已自动停住。先对照两组镜面，再选择从操作前重练。' : phase === 'narrating' ? voiceAudioStatus.state === 'error' ? '语音暂不可用，可以继续看动作和字幕。' : '正在讲解观察方法' : practicing ? `${paused ? '停住观察' : '自己驾驶'} · ${Math.abs(state.speed * 3.6).toFixed(1)} km/h · 前轮${Math.abs(state.steer) < .01 ? '已回正' : '保持转角'} · 本段低速上限 ${(drill.speedLimit * 3.6).toFixed(1)} km/h` : '先看镜，不用操作；分解示范与短练暂停仅用于学习。');
  const stage = result ? 'compare' : practicing ? judgment.notice ? 'retry' : 'practice' : 'demo';
  for (const item of document.querySelectorAll('[data-judgment-stage]')) { if (item.dataset.judgmentStage === stage) item.setAttribute('aria-current', 'step'); else item.removeAttribute('aria-current'); }
  const speechNames = { loading: 'MiniMax 讲解正在加载，车辆保持停住。', playing: '正在播放 MiniMax 讲解', paused: 'MiniMax 讲解已暂停', error: '讲解未能播放，请重试语音或选择字幕继续。' };
  const speechTiming = ['playing', 'paused'].includes(voiceAudioStatus.state) && Number.isFinite(voiceAudioStatus.duration) ? ` · ${Math.floor(voiceAudioStatus.currentTime || 0)} / ${Math.ceil(voiceAudioStatus.duration)} 秒` : '';
  const speechRest = phase === 'demo' ? paused ? '示范已暂停 · 看清两面镜后再继续。' : '正在慢放示范 · 可暂停对照两面镜。' : result ? '讲解结束后，对照镜面，再从操作前重练。' : phase === 'demo-done' ? '示范已停住 · 准备好后再接手。' : 'MiniMax 教练语音 · 准备好后继续当前步骤。';
  $('judgment-speech-note').textContent = !$('voice-enabled').checked ? '字幕模式 · 可以按字幕继续观察和练习。' : phase === 'practice' ? '独立判断中，不播报回正口令。' : `${speechNames[voiceAudioStatus.state] ?? speechRest}${speechTiming}`;
  $('judgment-speech-note').dataset.state = voiceAudioStatus.state === 'error' && $('voice-enabled').checked ? 'error' : 'normal';
  for (const button of document.querySelectorAll('[data-judgment-side]')) { button.setAttribute('aria-pressed', String(button.dataset.judgmentSide === side)); button.disabled = phase === 'practice' && !paused; }
  for (const mirror of ['left', 'right']) $('mirror-' + mirror).querySelector('.mirror-recommendation').textContent = gaze === mirror ? '正在观察' : '交替确认这一侧';
  $('scene-mode').textContent = practicing ? '回正时机 · 自己判断' : '回正时机 · 示范';
}
function advanceJudgmentFrame(dt) {
  if (!judgment || paused || $('help-dialog').open || $('exam-rules-dialog').open) return;
  if (judgment.phase === 'demo') {
    const frames = judgment.drill.referenceFrames;
    const interval = frames.length > 1 ? frames[1].time - frames[0].time : 1 / 120;
    judgment.cursor = Math.min(judgment.demoEnd, judgment.cursor + dt * .6 / interval);
    state = { ...frames[Math.floor(judgment.cursor)] };
    if (judgment.cursor >= judgment.demoEnd) { judgment.phase = 'demo-done'; paused = true; state.speed = 0; updateJudgmentUI(); beginnerVoice('judgment_ready'); }
    return;
  }
  if (judgment.phase !== 'practice') return;
  const input = { reverse: inputs.reverse, brake: inputs.brake, center: inputs.center, left: false, right: false, forward: false, speedLimit: judgment.drill.speedLimit };
  const count = Math.max(1, Math.ceil(dt / (1 / 120)));
  for (let i = 0; i < count; i++) {
    const previous = state; state = stepVehicle(state, input, dt / count);
    if (judgment.drill.decisionIndex == null && input.center) judgment.settings = structuredClone(cockpitSettings);
    judgment.drill = advanceJudgmentDrill(judgment.drill, previous, state, input);
    if (judgment.drill.status === 'finished') { showJudgmentResult(); break; }
  }
  if (centering && Math.abs(state.steer) < 1e-7) { centering = false; refreshInputs(); }
  history = judgment.drill.frames; selectedIndex = history.length - 1;
}
function loadBeginnerPose(pose) {
  centering = false; releaseControls(); paused = true;
  state = { ...pose, speed: 0 }; started = false; everMoved = true;
  progress = { ...createProgress(), checkedA: true };
  historySeedProgress = { ...progress }; history = [{ ...state }]; selectedIndex = 0; sampleTime = state.time;
  updateCar(); updateTrace(); updateTimeline();
}
function focusBeginnerMirror(side, magnify = true) {
  const workspace = document.querySelector('.workspace');
  workspace.classList.toggle('beginner-focus-right', side === 'right');
  workspace.classList.toggle('beginner-focus-left', side === 'left');
  setView('driver'); setGaze(side, { magnify });
}
function enterBeginner() {
  leaveWelcome(); stopVoiceExperience(); closeViewAdjustment();
  if (mode !== 'practice') setMode('practice');
  alignmentDrill = null; setCockpitTraining(true);
  document.querySelector('.workspace').classList.add('beginner-active');
  $('beginner-panel').hidden = false;
  loadBeginnerPose(beginnerStart(demonstration));
  setBeginnerStep('orientation');
  updateModeButtons();
  $('beginner-panel').scrollIntoView({ block: 'start', behavior: 'instant' });
}
function exitBeginner() {
  if (!beginner) return;
  beginner = null; beginnerToken++; narrator.stop();
  centering = false; releaseControls(); paused = true; state.speed = 0;
  $('beginner-panel').hidden = true;
  document.querySelector('.workspace').classList.remove('beginner-active', 'beginner-focus-right', 'beginner-focus-left');
  $('beginner-scene-guide').hidden = true;
  mirrorRenderer.setRecognitionGuides(false);
  $('beginner-mode').setAttribute('aria-pressed', 'false');
}
function setBeginnerStep(step) {
  beginnerToken++; narrator.stop(); centering = false; releaseControls(); paused = true;
  beginner = { step, phase: 'observe', anchor: { ...state, speed: 0 }, result: null, notice: '' };
  if (step === 'orientation') setView('top');
  else focusBeginnerMirror('right');
  updateBeginnerUI();
  if (step === 'orientation') { $('beginner-panel').scrollIntoView({ block: 'start', behavior: 'instant' }); return; }
  if (step === 'mirror' || step === 'compare') beginnerVoice(`beginner_${step}`);
  else startBeginnerDemo();
  $('beginner-panel').scrollIntoView({ block: 'start', behavior: 'instant' });
}
function startBeginnerDemo() {
  if (!beginner || !beginnerRanges[beginner.step]) return;
  const token = ++beginnerToken;
  const [start, end] = beginnerRanges[beginner.step];
  centering = false; releaseControls(); narrator.stop();
  beginner.phase = 'narrating'; beginner.cursor = start; beginner.end = end; beginner.notice = ''; beginner.result = null;
  state = { ...demonstration.frames[start] }; paused = false;
  focusBeginnerMirror('right'); updateBeginnerUI();
  finishLecture(beginnerVoice(`beginner_${beginner.step}`), {
    isCurrent: () => beginner && token === beginnerToken && beginner.phase === 'narrating',
    onReady: () => { beginner.phase = 'demo'; updateBeginnerUI(); },
    onError: () => { beginner.phase = 'speech-error'; paused = true; updateBeginnerUI(); },
  });
}
function prepareBeginnerAction() {
  beginnerToken++; narrator.stop(); loadBeginnerPose(beginner.anchor);
  beginner.phase = 'ready'; beginner.result = null; beginner.notice = '';
  focusBeginnerMirror('right'); updateHUD(); updateBeginnerUI(); sceneElement.focus({ preventScroll: true });
}
function startBeginnerAction() {
  if (!beginner || beginner.overview || !['ready', 'practice'].includes(beginner.phase)) return;
  beginner.phase = 'practice'; beginner.notice = ''; paused = false;
  const control = { turn: 'right', hold: 'reverse', center: 'center' }[beginner.step];
  if (control === 'center') centering = true;
  else pointerControls.add(control);
  refreshInputs(); updateBeginnerUI();
}
function stopBeginnerAction() {
  if (!beginner || beginner.phase !== 'practice' || beginner.step === 'center') return;
  releaseControls(); state.speed = 0; paused = true; updateBeginnerUI();
}
function nextBeginner() {
  if (!beginner) return;
  if (beginner.overview) { beginner.overview = false; focusBeginnerMirror(beginner.step === 'compare' && beginner.phase === 'left' ? 'left' : 'right'); updateBeginnerUI(); return; }
  if (beginner.step === 'orientation') return setBeginnerStep('mirror');
  if (beginner.phase === 'speech-error') return chooseSubtitles();
  const challenge = recognitionChallenge(beginner.step, mirrorRenderer.observe(state, gaze === 'left' ? 'left' : 'right', cockpitSettings));
  if (challenge && (!challenge.available || beginner.recognition !== challenge.correct)) return;
  if (beginner.step === 'mirror') return setBeginnerStep('turn');
  if (beginner.step === 'compare') {
    if (beginner.phase !== 'left') { beginner.phase = 'left'; focusBeginnerMirror('left'); updateBeginnerUI(); }
    else setBeginnerStep('center');
    return;
  }
  if (beginner.phase === 'narrating') { beginnerToken++; narrator.stop(); beginner.phase = 'demo'; paused = false; }
  else if (beginner.phase === 'demo') paused = !paused;
  else if (beginner.phase === 'demo-done') return prepareBeginnerAction();
  else if (beginner.phase === 'complete') return setBeginnerStep(beginner.step === 'turn' ? 'hold' : 'compare');
  else if (beginner.phase === 'error') return prepareBeginnerAction();
  updateBeginnerUI();
}
function updateBeginnerUI() {
  if (!beginner) return;
  const { step, phase, result } = beginner;
  const orientation = step === 'orientation' || beginner.overview;
  const number = { orientation: 1, mirror: 2, turn: 3, hold: 4, compare: 5, center: 6 }[step];
  const side = gaze === 'left' ? 'left' : 'right';
  const observation = mirrorRenderer.observe(state, side, cockpitSettings);
  const visibleGuide = observationGuide(side, observation);
  const actionLabels = { turn: '按住 D · 向右打方向', hold: '按住 S · 慢慢倒车', center: '按一下 X · 回正方向' };
  const titles = { orientation: '先认位置：白色是你的车，黄线围出车库', mirror: '先认右镜：内侧窄边是本车车身', turn: '先练右打方向，暂时不用找库角', hold: '保持方向倒车，等库线进入右镜', compare: phase === 'left' ? '再看左镜，确认另一边' : '车已停住，先看右镜', center: '现在主动回正方向' };
  const instructions = {
    orientation: '车库在车的侧后方。接下来低速倒车，让车尾转进黄线库框；现在先看清相对位置，不用按键。',
    mirror: '右镜左侧的窄边是本车，旁边灰色区域是路面。现在库侧线还没进入镜子，看不到是正常的。',
    turn: '这一步只把前轮向右打到位。系统代管低速倒车；库线尚未进入镜面，不要求你判断库角。',
    hold: visibleGuide.text,
    compare: visibleGuide.text,
    center: 'X 会把前轮转回正中。松开 D 只是停止继续打方向，前轮不会自己回正。',
  };
  let title = titles[step], instruction = instructions[step], assist = '车辆已停住，可以慢慢观察。';
  if (step === 'mirror') {
    title = `先认${side === 'right' ? '右' : '左'}镜：内侧窄边是本车车身`;
    instruction = `${side === 'right' ? '右镜左侧' : '左镜右侧'}的窄边是本车，旁边灰色区域是路面。${observation.lineVisible ? '库线已进入镜面，再看它与车身的关系。' : '现在库侧线还没进入镜子，看不到是正常的。'}`;
    if (!observation.body.visible) { title = '先调镜，让内侧露出一点车身'; instruction = '当前角度看不到清楚的车身参照。点这面镜下方的“调镜”，再选择按当前眼位推荐。'; }
  }
  let next = step === 'mirror' ? '我认清了，下一步' : step === 'compare' ? phase === 'left' ? '两边看过了，学习回正' : '右镜看清了，再看左镜' : '下一步';
  if (phase === 'narrating') { title = `先听这一小步：${titles[step]}`; next = '直接看动作'; assist = '先听讲解，再看慢动作；此时不用操作键盘。'; }
  if (phase === 'speech-error') { title = `先看示范：${titles[step]}`; next = '用字幕看这段示范'; assist = '语音暂未播出，车辆已停住。可用字幕继续，或点上方重试语音。'; }
  if (phase === 'demo') { title = `看示范：${titles[step]}`; next = paused ? '继续这段示范' : '暂停看清楚'; assist = '这是系统示范。看完会停住，再交给你做同一个动作。'; }
  if (phase === 'demo-done') { title = '这一小段看完了，轮到你'; next = '我来试这一步'; assist = '点击后回到这一步起点；只需操作下方提示的一个键。'; }
  if (phase === 'ready' || phase === 'practice') {
    title = actionLabels[step];
    assist = step === 'hold' ? '你只控制倒车。松手就停；到观察点也会自动停住。' : '这一小段由系统代管低速倒车，你只练方向。完成后自动停住。';
  }
  if (result) { title = result.title; instruction = result.text; assist = '现在保持停住，观察清楚后再继续。'; next = phase === 'error' ? '再练这一步' : step === 'turn' ? '明白了，试试保持方向' : '停住对照两面镜子'; }
  const finished = step === 'center' && phase === 'complete';
  if (finished) { instruction = '你已亲手体验：右打、保持和主动回正。接下来先练自己判断回正时机，再对照镜面重练。'; assist = '短练只限制低速，不会提前报回正口令；完整路线也可从其他练习方式进入。'; }
  if (orientation) { title = titles.orientation; instruction = instructions.orientation; assist = '这是俯视定位辅助，接下来回驾驶位，通过后视镜练习。'; next = step === 'orientation' ? '看清位置了，坐进驾驶位' : '回驾驶位，继续这一步'; }
  $('beginner-progress').textContent = `入门 ${number} / 6 · ${orientation ? '先认车和库的位置' : phase === 'demo' || phase === 'narrating' || phase === 'speech-error' ? '看系统示范' : phase === 'ready' || phase === 'practice' ? '轮到你操作' : '停住观察'}`;
  $('beginner-title').textContent = title;
  $('beginner-instruction').textContent = instruction;
  $('beginner-assist').textContent = assist;
  $('beginner-next').textContent = next;
  const challenge = !orientation ? recognitionChallenge(step, observation) : null;
  $('recognition-check').hidden = !challenge;
  if (challenge) {
    $('recognition-question').textContent = challenge.available ? challenge.question : '先调镜，确认本车车身与需要的库线进入镜面';
    if ($('recognition-options').dataset.key !== challenge.key) {
      $('recognition-options').dataset.key = challenge.key;
      $('recognition-options').replaceChildren(...challenge.options.map(option => {
        const button = document.createElement('button'); button.type = 'button'; button.dataset.recognition = option.value; button.textContent = option.label; return button;
      }));
    }
    for (const button of $('recognition-options').querySelectorAll('button')) {
      button.disabled = !challenge.available; button.setAttribute('aria-pressed', String(beginner.recognition === button.dataset.recognition));
    }
    $('recognition-feedback').textContent = !challenge.available ? visibleGuide.text : beginner.recognition ? beginner.recognition === challenge.correct ? challenge.success : challenge.retry : '先选出你的判断，答对后再进入下一步。';
    $('recognition-feedback').dataset.kind = beginner.recognition && beginner.recognition !== challenge.correct ? 'retry' : 'normal';
  }
  $('beginner-next').disabled = Boolean(challenge && (!challenge.available || beginner.recognition !== challenge.correct));
  $('beginner-next').hidden = !orientation && (finished || ['ready', 'practice'].includes(phase));
  $('beginner-action').hidden = orientation || !['ready', 'practice'].includes(phase);
  $('beginner-action').textContent = actionLabels[step] ?? '操作';
  $('beginner-action').classList.toggle('held', phase === 'practice' && !paused);
  $('beginner-full').hidden = orientation || !finished;
  $('beginner-full').textContent = '下一步：自己判断回正';
  $('beginner-replay').textContent = ['mirror', 'compare'].includes(step) ? '再听一遍' : '重看这一步';
  $('beginner-replay').hidden = orientation;
  $('beginner-orientation').hidden = Boolean(orientation);
  $('beginner-orientation').textContent = beginner.overview ? '回驾驶位继续' : '看车和库的位置';
  $('beginner-scene-guide').hidden = false;
  $('beginner-scene-title').textContent = orientation ? '俯视定位 · 车已停住' : `${side === 'right' ? '右' : '左'}后视镜 · ${observation.lineVisible ? '库侧线已进入视野' : '此时库侧线还不在镜里'}`;
  $('beginner-scene-text').textContent = orientation ? '先找到白色车和黄线库框，再点上方按钮坐进驾驶位。' : observation.lineVisible ? '先认本车与库侧线，看同侧间隙的变化；库底横线不是判断入库方向的参照。' : '内侧窄边＝本车；灰色区域＝路面。放大只帮助看清，镜内视野不变。';
  mirrorRenderer.setRecognitionGuides(!orientation && view === 'driver');
  const angle = Math.abs(state.steer * 180 / Math.PI);
  const direction = angle < 0.5 ? '前轮已回正' : `前轮向${state.steer < 0 ? '右' : '左'} ${Math.round(angle)}°`;
  const status = beginner.notice || (orientation ? '只需观察；车辆保持静止。' : phase === 'narrating' ? '正在讲解；想先看动作，可点右侧按钮。' : `${paused ? '车已停住' : phase === 'demo' ? '系统示范中' : '操作中'} · ${direction}`);
  if ($('beginner-status').textContent !== status) $('beginner-status').textContent = status;
  $('scene-mode').textContent = '新手入门 · 右倒库分解';
  for (const side of ['left', 'right']) {
    $('mirror-' + side).querySelector('.mirror-recommendation').textContent = gaze === side ? '正在看这里' : '点镜面切换观察';
  }
  const presentation = `${step}/${phase}/${Boolean(beginner.overview)}`;
  if (beginner.presentation !== presentation) {
    beginner.presentation = presentation;
    $('beginner-panel').scrollIntoView({ block: 'start', behavior: 'instant' });
  }
}
function advanceBeginnerFrame(dt) {
  if (!beginner || beginner.overview || beginner.step === 'orientation' || paused || $('help-dialog').open || $('exam-rules-dialog').open) return;
  if (beginner.phase === 'demo') {
    beginner.cursor = Math.min(beginner.end, beginner.cursor + dt * (beginner.step === 'hold' ? 0.8 : 0.35) / demonstration.dt);
    state = { ...demonstration.frames[Math.floor(beginner.cursor)] };
    if (beginner.cursor >= beginner.end) { beginner.phase = 'demo-done'; paused = true; state.speed = 0; updateBeginnerUI(); }
    return;
  }
  if (beginner.phase !== 'practice') return;
  const input = beginnerInput(beginner.step, inputs);
  const count = Math.max(1, Math.ceil(dt / (1 / 120)));
  for (let i = 0; i < count; i++) {
    const previous = state; state = stepVehicle(state, input, dt / count);
    const result = advanceBeginner(beginner.step, previous, state);
    if (result) {
      beginner.result = result; beginner.phase = result.kind === 'done' ? 'complete' : 'error';
      paused = true; state.speed = 0; centering = false; releaseControls();
      history.push({ ...state }); selectedIndex = history.length - 1;
      if (beginner.step === 'center' && result.kind === 'done') beginnerVoice('beginner_finish');
      updateBeginnerUI(); break;
    }
  }
  if (state.time - sampleTime >= 0.07) { history.push({ ...state }); sampleTime = state.time; selectedIndex = history.length - 1; }
}

function updateModeButtons() {
  for (const [id, active] of [['practice-mode', voiceMode === 'off' && mode === 'practice' && !cockpitTraining], ['lesson-mode', voiceMode === 'off' && mode === 'lesson' && !cockpitTraining], ['cockpit-mode', voiceMode === 'off' && cockpitTraining], ['voice-mode', voiceMode !== 'off']]) {
    $(id).classList.toggle('active', active && !beginner && !judgment && !correctionDrill); $(id).setAttribute('aria-pressed', String(active && !beginner && !judgment && !correctionDrill));
  }
  $('beginner-mode').setAttribute('aria-pressed', String(Boolean(beginner)));
  $('judgment-mode').setAttribute('aria-pressed', String(Boolean(judgment)));
  $('correction-mode').setAttribute('aria-pressed', String(Boolean(correctionDrill)));
  updateAlignmentUI();
  updateVoiceUI();
}

function updateVoiceStatus() {
  const names = { idle: '准备就绪', loading: '加载语音', playing: '正在讲解', paused: '语音已暂停', ended: '讲解完毕', error: '语音暂不可用' };
  const timing = voiceAudioStatus.state === 'playing' && Number.isFinite(voiceAudioStatus.duration) ? ` ${Math.floor(voiceAudioStatus.currentTime || 0)} / ${Math.ceil(voiceAudioStatus.duration)} 秒` : '';
  $('voice-status').textContent = !$('voice-enabled').checked ? '字幕模式' : `${names[voiceAudioStatus.state] || ''}${timing}`;
  $('voice-error').hidden = voiceAudioStatus.state !== 'error';
  $('voice-error').textContent = voiceAudioStatus.state === 'error' ? `${voiceAudioStatus.message} 字幕与车辆演示仍可使用，点击“重听讲解”可重试。` : '';
  if (beginner) updateBeginnerUI();
  if (judgment) updateJudgmentUI();
  if (correctionDrill) updateCorrectionUI();
  updateSpeechUI();
}
function updateVoiceUI() {
  const active = voiceMode !== 'off', tour = voiceMode === 'tour';
  document.querySelector('.workspace').classList.toggle('voice-active', active);
  document.querySelector('.workspace').classList.toggle('coaching-active', active && !reviewVisible && !beginner && !judgment);
  $('voice-panel').hidden = !active;
  if (!active) return;
  $('voice-session-label').textContent = tour ? `完整语音示范 · ${tourIndex + 1} / ${voiceTour.length} · ${tourStage === 'ended' ? '已完成' : tourRunning ? tourStage === 'narrating' ? '先听讲解' : '观察车辆动作' : '暂停观察'}` : voicePracticeReady ? '接手准备 · 先看镜，再按当前提示操作' : '语音带练 · 由你驾驶 · 提示跟随车辆状态';
  $('voice-title').textContent = NARRATION[voiceKey].title;
  $('voice-subtitle').textContent = NARRATION[voiceKey].text;
  const guidance = currentVoiceGuidance();
  $('voice-panel').dataset.stage = guidance.stage;
  $('voice-look').textContent = guidance.look;
  $('voice-action-label').textContent = guidance.stage === 'prepare' ? '提前准备' : guidance.stage === 'act' ? '现在操作' : '现在做';
  $('voice-action').textContent = guidance.action;
  $('voice-upcoming').textContent = guidance.next;
  $('voice-play').textContent = tour ? tourStage === 'speech-error' ? '重试本段语音' : tourRunning ? '暂停语音与示范' : tourStage === 'ended' ? '重看完整示范' : tourIndex === 0 && demoCursor === 0 && tourStage === 'ready' ? '开始完整示范' : '继续示范' : voicePracticeReady ? speechState === 'checking' && $('voice-enabled').checked ? '正在准备语音' : '开始这段练习' : paused ? '继续语音带练' : '暂停练习';
  const waitingForSpeech = !tour && paused && $('voice-enabled').checked && (speechState !== 'ready' || ['loading', 'error'].includes(voiceAudioStatus.state));
  $('voice-play').disabled = waitingForSpeech;
  if (waitingForSpeech && speechState !== 'checking' && voiceAudioStatus.state !== 'loading') $('voice-play').textContent = '先准备语音或选择字幕';
  $('voice-prev').hidden = $('voice-next').hidden = $('voice-takeover').hidden = !tour;
  $('voice-return-practice').hidden = !tour || !voicePracticeReturn;
  $('voice-takeover').textContent = voicePracticeReturn ? '从示范另开跟练' : '从这里跟练';
  $('voice-prev').disabled = tourIndex === 0;
  $('voice-next').disabled = tourIndex === voiceTour.length - 1;
  $('voice-retry').hidden = $('voice-review').hidden = tour || !voicePracticeAnchor;
  $('voice-review-entry').hidden = tour;
  $('practice-review-open').disabled = !canReviewPractice(history);
  $('practice-review-open').textContent = paused ? '复盘这次跟练' : isParked(state) && progress.started ? '库内停稳 · 查看复盘' : '暂停并复盘';
  const tourLook = { left: '左镜', right: '右镜', forward: '前方' }[voiceTourObservation(voiceTour[tourIndex])];
  $('voice-guidance-note').textContent = tour ? `${tourManualObservation ? '手动观察保持本段；下一段恢复自动。' : `本段自动看${tourLook}；双镜提示可自行切到另一镜。`} 暂停时镜头不巡回，Q / E / C 可自己选择。` : paused && voicePracticeNotice ? voicePracticeNotice : voicePracticeReady ? '当前姿态已保留，准备期间不计时。Q / E 先看镜；S 倒车、W 前进或点击开始。' : 'Q / E 看镜 · S / W 倒车 / 前进 · A / D 转向 · X 回正 · 空格刹车 · P 暂停';
  if (tour) {
    $('scene-mode').textContent = tourRunning ? tourStage === 'narrating' ? '听讲解 · 教学暂停' : '语音示范 · 动作演示' : '语音示范 · 已暂停';
    $('pause-button').innerHTML = `<svg><use href="#i-${tourRunning ? 'pause' : 'play'}"/></svg><span>${tourRunning ? '暂停示范' : '继续示范'}</span><kbd>P</kbd>`;
  }
  updateVoiceStatus();
}
function markManualTourObservation() {
  if (voiceMode === 'tour' && !applyingTourObservation) {
    tourManualObservation = true; tourObservationIndex = tourIndex;
  }
}
function currentVoiceCue() {
  return practiceVoiceCue(state, progress, demonstration.turnMarker, {
    alignmentDrill, speedLimit: Number($('creep-speed').value) / 3.6, speechRate: Number($('voice-rate').value),
  });
}
function currentVoiceGuidance() {
  const side = (voiceMode === 'tour' ? lessonStep >= 8 && lessonStep <= 9 : progress.phase === 2) ? 'left' : 'right';
  const guidance = voiceGuidance(voiceMode === 'practice' ? currentVoiceCue().key : voiceKey, side);
  if (['left', 'right'].includes(guidance.mirror)) guidance.look = observationGuide(guidance.mirror, mirrorRenderer.observe(state, guidance.mirror, cockpitSettings)).look;
  return guidance;
}
function speakVoice(key) {
  voiceKey = key; updateVoiceUI();
  if (!$('voice-enabled').checked) return Promise.resolve('ended');
  return narrator.play(key, { rate: Number($('voice-rate').value), volume: Number($('voice-volume').value) });
}
function stopVoiceExperience() {
  speechSession++;
  leaveWelcome();
  exitBeginner();
  exitJudgment();
  exitCorrection();
  closePracticeReview(); practiceReport = null; voicePracticeReturn = null; voicePracticeNotice = '';
  if (voiceMode === 'tour') { demoPlaying = false; paused = true; }
  tourToken++; tourRunning = false; voiceMode = 'off'; narrator.stop(); lastVoiceKey = ''; voicePracticeReady = false; voicePracticeAnchor = null;
  tourObservationIndex = null; tourManualObservation = false;
  updateModeButtons();
}
function enterVoiceTour() {
  stopVoiceExperience(); closeViewAdjustment(); alignmentDrill = null;
  $('voice-more').open = false;
  setCockpitTraining(true); setMode('lesson');
  voiceMode = 'tour'; tourIndex = 0; selectVoiceSegment(0); updateModeButtons();
  $('voice-panel').scrollIntoView({ block: 'start', behavior: 'smooth' });
}
function applyVoiceTourObservation() {
  if (voiceMode !== 'tour' || tourObservationIndex === tourIndex) return;
  tourObservationIndex = tourIndex; tourManualObservation = false; applyingTourObservation = true;
  try { setView('driver'); setGaze(voiceTourObservation(voiceTour[tourIndex])); updateCamera(1); }
  finally { applyingTourObservation = false; }
}
function selectVoiceSegment(index, cursor) {
  tourToken++; narrator.stop(); tourRunning = false; demoPlaying = false; paused = true;
  const nextIndex = clamp(index, 0, voiceTour.length - 1);
  if (tourIndex !== nextIndex) { tourObservationIndex = null; tourManualObservation = false; }
  tourIndex = nextIndex; tourStage = 'ready';
  const segment = voiceTour[tourIndex]; voiceKey = segment.key; lessonStep = segment.lessonStep;
  demoCursor = cursor ?? segment.start;
  syncDemoState(); applyVoiceTourObservation(); updateLessonUI(); updateVoiceUI();
}
function finishVoiceSegment() {
  if (tourIndex >= voiceTour.length - 1) {
    tourStage = 'ended'; tourRunning = false; demoPlaying = false; paused = true;
    updateTimeline(); updateTrace(); updateVoiceUI(); return;
  }
  tourIndex++; demoCursor = voiceTour[tourIndex].start;
  beginVoiceSegment();
}
function beginVoiceSegment() {
  const token = ++tourToken;
  narrator.stop(); tourRunning = true; demoPlaying = false;
  const segment = voiceTour[tourIndex]; lessonStep = segment.lessonStep;
  applyVoiceTourObservation();
  syncDemoState(); paused = false; tourStage = 'narrating'; updateLessonUI(); updateVoiceUI();
  finishLecture(speakVoice(segment.key), {
    isCurrent: () => token === tourToken && voiceMode === 'tour' && tourStage === 'narrating',
    onReady: () => {
      if (!tourRunning) { tourStage = 'move-ready'; return; }
      tourStage = 'moving'; demoPlaying = true; paused = false;
      if (demoCursor >= segment.end) finishVoiceSegment();
      updateVoiceUI();
    },
    onError: () => { tourStage = 'speech-error'; tourRunning = false; demoPlaying = false; paused = true; updateVoiceUI(); },
  });
}
function toggleVoiceTour() {
  if (!tourRunning) closeViewAdjustment();
  if (tourRunning) {
    tourRunning = false; demoPlaying = false; paused = true; narrator.pause(); releaseControls();
  } else if (tourStage === 'ready' || tourStage === 'ended' || tourStage === 'speech-error') {
    if (tourStage === 'ended') selectVoiceSegment(0);
    beginVoiceSegment();
  } else {
    closeViewAdjustment(); tourRunning = true; paused = false;
    if (tourStage === 'narrating') narrator.resume();
    else { tourStage = 'moving'; demoPlaying = true; if (demoCursor >= voiceTour[tourIndex].end) finishVoiceSegment(); }
  }
  updateVoiceUI(); sceneElement.focus({ preventScroll: true });
}
function advanceVoiceTour(dt) {
  if (tourStage !== 'moving') return;
  const segment = voiceTour[tourIndex];
  demoCursor = Math.min(segment.end, demoCursor + dt / demonstration.dt);
  selectedIndex = Math.floor(demoCursor); state = { ...demonstration.frames[selectedIndex] }; started = selectedIndex > 0;
  if (demoCursor >= segment.end) { updateTimeline(); updateTrace(); finishVoiceSegment(); }
}
function enterVoicePractice(fromHere = false) {
  voicePracticeReturn = null;
  const retainedLook = captureDriverLook();
  exitBeginner(); exitJudgment();
  $('voice-more').open = false;
  const sourceIndex = fromHere && voiceMode === 'tour' ? tourIndex : 0;
  tourToken++; tourRunning = false; narrator.stop(); voiceMode = 'off';
  if (mode === 'lesson') setMode('practice', fromHere);
  if (!fromHere) reset();
  setCockpitTraining(true);
  voicePracticeAnchor = { state: { ...state, speed: 0 }, progress: { ...progress }, sourceIndex, look: retainedLook };
  restoreDriverLook(retainedLook, progress.phase === 2 ? 'left' : 'right', true);
  prepareVoicePractice();
}
function prepareVoicePractice() {
  voicePracticeNotice = '';
  const retainedLook = captureDriverLook();
  speechSession++;
  closePracticeReview(); practiceReport = null;
  narrator.stop(); voiceMode = 'off'; releaseControls(); centering = false;
  state = { ...voicePracticeAnchor.state }; progress = { ...voicePracticeAnchor.progress };
  started = progress.started; everMoved = started; area.classList.toggle('has-driven', started);
  historySeedProgress = { ...progress }; history = [{ ...state }]; selectedIndex = 0; sampleTime = state.time;
  paused = false; voicePracticeReady = true;
  setPaused(true);
  voiceMode = 'practice';
  lastVoiceKey = currentVoiceCue().key; lastVoiceAt = performance.now();
  updateModeButtons(); speakVoice(lastVoiceKey); updateHUD(); updateCar(); updateTrace();
  restoreDriverLook(retainedLook, progress.phase === 2 ? 'left' : 'right');
  sceneElement.focus({ preventScroll: true });
}
function reviewVoicePractice() {
  if (!voicePracticeAnchor) return;
  const index = voicePracticeAnchor.sourceIndex;
  setPaused(true); narrator.stop(); releaseControls();
  const saved = captureParkingPracticeReturn({ state, progress, history, historySeedProgress, selectedIndex, sampleTime,
    started, everMoved, voicePracticeReady, voicePracticeAnchor, alignmentDrill, practiceReport, reviewAttemptIndex,
    reviewVisible, reviewInCar, reviewResume, reviewPreviousView, reviewPreviousGaze, reviewPreviousHead, reviewPreviousMagnify,
    cockpitTraining, cockpitSettings, mirrorFitUndo, look: captureDriverLook() });
  stopVoiceExperience(); closeViewAdjustment(); setMode('lesson');
  voiceMode = 'tour'; voicePracticeReturn = saved; selectVoiceSegment(index); updateModeButtons();
  sceneElement.focus({ preventScroll: true });
}
function returnVoicePractice() {
  if (voiceMode !== 'tour') return;
  const saved = restoreParkingPracticeReturn(voicePracticeReturn);
  if (!saved) return;
  stopVoiceExperience(); closeViewAdjustment(); setMode('practice');
  ({ state, progress, history, historySeedProgress, selectedIndex, sampleTime, started, everMoved, voicePracticeReady,
    voicePracticeAnchor, alignmentDrill, practiceReport, reviewAttemptIndex, reviewResume, reviewPreviousView,
    reviewPreviousGaze, reviewPreviousHead, reviewPreviousMagnify, cockpitSettings, mirrorFitUndo } = saved);
  voiceMode = 'practice'; voicePracticeReturn = null; paused = true; centering = false; releaseControls();
  setCockpitTraining(saved.cockpitTraining); updateCockpitSettingControls(); saveCockpitSettings();
  setView(saved.look.view);
  if (saved.look.view === 'driver') { setGaze(saved.look.gaze, { magnify: saved.look.magnify }); headYaw = saved.look.yaw; headPitch = saved.look.pitch; }
  reviewVisible = saved.reviewVisible; reviewInCar = saved.reviewInCar;
  $('practice-review').hidden = !reviewVisible;
  document.querySelector('.workspace').classList.toggle('review-active', reviewVisible);
  document.querySelector('.workspace').classList.toggle('review-in-car', reviewVisible && reviewInCar);
  area.classList.toggle('has-driven', everMoved); $('replay-strip').hidden = false;
  voiceKey = currentVoiceCue().key; lastVoiceKey = ''; lastVoiceAt = 0;
  updateModeButtons(); updateTimeline(); updateCar(); updateTrace(); updatePauseControls(); updateHUD(); updatePracticeReview(); updateCamera(1);
  voicePracticeNotice = '已回到刚才跟练：车辆、完整轨迹与看镜状态已恢复。保持暂停，准备好后再继续。';
  updateVoiceUI();
  sceneElement.focus({ preventScroll: true });
  (reviewVisible ? $('practice-review') : $('voice-panel')).scrollIntoView({ block: 'start', behavior: 'smooth' });
}
function openPracticeReview() {
  if (voiceMode !== 'practice' || reviewVisible) return;
  setPaused(true); narrator.stop(); releaseControls(); closeViewAdjustment();
  reviewResume = captureParkingPracticeCursor({ state, progress, selectedIndex, sampleTime });
  practiceReport = analyzePractice(history, demonstration, historySeedProgress);
  const selectedAttempt = practiceReport.attempts.findIndex(attempt => selectedIndex >= attempt.startIndex && selectedIndex <= attempt.endIndex);
  reviewAttemptIndex = selectedAttempt >= 0 ? selectedAttempt : practiceReport.activeAttemptIndex ?? 0;
  reviewPreviousView = view; reviewPreviousGaze = gaze;
  reviewPreviousMagnify = area.classList.contains('mirror-focused');
  reviewPreviousHead = { yaw: headYaw, pitch: headPitch };
  reviewVisible = true; reviewInCar = false;
  $('practice-review').hidden = false;
  document.querySelector('.workspace').classList.add('review-active');
  const attempt = practiceReport.attempts[reviewAttemptIndex];
  if (attempt) seekPracticeReview(attempt.issueIndex ?? attempt.endIndex);
  else updatePracticeReview();
  $('practice-review').scrollIntoView({ block: 'start', behavior: 'smooth' });
}
function closePracticeReview({ restore = true } = {}) {
  if (!reviewVisible) return;
  reviewVisible = false; reviewInCar = false;
  $('practice-review').hidden = true;
  document.querySelector('.workspace').classList.remove('review-active', 'review-in-car');
  if (restore && reviewResume) ({ state, progress, selectedIndex, sampleTime } = structuredClone(reviewResume));
  reviewResume = null;
  setView(reviewPreviousView);
  if (reviewPreviousView === 'driver') {
    setGaze(reviewPreviousGaze, { magnify: reviewPreviousMagnify });
    headYaw = reviewPreviousHead.yaw; headPitch = reviewPreviousHead.pitch;
    updateCamera(1);
  }
  lastVoiceKey = ''; lastVoiceAt = 0;
  updateTimeline(); updateCar(); updateTrace();
}
function seekPracticeReview(index) {
  const attempt = practiceReport?.attempts[reviewAttemptIndex];
  if (!attempt) return;
  selectedIndex = clamp(index, attempt.startIndex, attempt.endIndex);
  centering = false; releaseControls();
  state = { ...history[selectedIndex] }; progress = progressAt(selectedIndex);
  voiceKey = currentVoiceCue().key; lastVoiceKey = ''; lastVoiceAt = 0;
  updateTimeline(); updateCar(); updateTrace(); updateHUD(); updatePracticeReview();
}
function updatePracticeReview() {
  if (!reviewVisible) return;
  const attempt = practiceReport?.attempts[reviewAttemptIndex];
  $('review-attempts').replaceChildren(...(practiceReport?.attempts ?? []).map((entry, index) => {
    const button = document.createElement('button');
    button.textContent = `${entry.side === 'left' ? '左' : '右'}倒库 · ${index + 1}`;
    button.dataset.reviewAttempt = String(index); button.setAttribute('aria-pressed', String(index === reviewAttemptIndex));
    return button;
  }));
  $('review-title').textContent = attempt ? `${attempt.side === 'left' ? '左' : '右'}倒库 · 看清操作时机` : '这次还没有倒库操作记录';
  $('review-summary').textContent = attempt?.summary ?? '从倒库阶段开始跟练，再回来对照打方向和回正；出库中的转向不计为倒库动作。';
  for (const key of ['turn', 'center']) {
    const metric = attempt?.[key];
    $(`review-${key}-card`).dataset.kind = metric?.kind ?? 'unobserved';
    $(`review-${key}-title`).textContent = metric?.title ?? '未记录';
    $(`review-${key}-text`).textContent = metric?.text ?? '没有足够的操作记录，暂不判断早晚。';
    $(`review-${key}-jump`).disabled = metric?.index == null;
    $(`review-${key}-jump`).textContent = metric?.executed === false ? '看错过区间这一刻 ↗' : `看${key === 'turn' ? '打方向' : '回正'}这一刻 ↗`;
  }
  $('review-timeline').min = String(attempt?.startIndex ?? 0);
  $('review-timeline').max = String(attempt?.endIndex ?? 0);
  $('review-timeline').value = String(attempt ? selectedIndex : 0);
  $('review-timeline').disabled = !attempt || attempt.startIndex === attempt.endIndex;
  $('review-position').textContent = attempt ? `${timeText(Math.max(0, state.time - history[attempt.startIndex].time))} / ${timeText(Math.max(0, history[attempt.endIndex].time - history[attempt.startIndex].time))} · 本段记录` : '暂无记录';
  $('review-retry').disabled = !attempt;
  $('review-retry').textContent = attempt?.issueIndex != null ? '从出错前重练' : '重练本段';
  $('review-retry-note').textContent = attempt?.retryNote ?? '重新练习会保留所选点之前的轨迹，替换之后的操作。';
  $('review-camera').textContent = reviewInCar ? '返回轨迹对比' : '驾驶位看当前点';
  if (!reviewInCar) renderReviewMap($('review-map'), {
    frames: attempt ? history.slice(attempt.startIndex, attempt.endIndex + 1) : [],
    referenceFrames: attempt?.referenceFrames ?? [],
    selectedIndex: attempt ? selectedIndex - attempt.startIndex : 0,
    turnIndex: attempt?.turn.executed === true && attempt.turn.index != null ? attempt.turn.index - attempt.startIndex : null,
    centerIndex: attempt?.center.executed === true && attempt.center.index != null ? attempt.center.index - attempt.startIndex : null,
    issueIndex: attempt?.issueIndex == null ? null : attempt.issueIndex - attempt.startIndex,
  });
}
function toggleReviewCamera() {
  if (!reviewVisible) return;
  reviewInCar = !reviewInCar;
  document.querySelector('.workspace').classList.toggle('review-in-car', reviewInCar);
  if (reviewInCar) { setView('driver'); setGaze(practiceReport?.attempts[reviewAttemptIndex]?.side ?? 'forward'); }
  updatePracticeReview(); updateHUD();
}
function retryBeforePracticeIssue() {
  const attempt = practiceReport?.attempts[reviewAttemptIndex];
  if (!attempt) return;
  speechSession++;
  seekPracticeReview(attempt.issueIndex == null ? attempt.startIndex : attempt.retryIndex);
  closePracticeReview({ restore: false }); narrator.stop(); releaseControls(); centering = false;
  // Preserve the correct prefix (including an earlier good turn), discard only
  // the part being retried, and rebuild progress from the original recording seed.
  history = history.slice(0, selectedIndex + 1);
  state = { ...history.at(-1), speed: 0 }; history[history.length - 1] = { ...state };
  sampleTime = state.time; paused = true; voicePracticeReady = true;
  lastVoiceKey = currentVoiceCue().key; lastVoiceAt = performance.now();
  practiceReport = null;
  restoreDriverLook(captureDriverLook(), attempt.side);
  speakVoice(lastVoiceKey); updateTimeline(); updateTrace(); updateCar(); updateHUD();
  sceneElement.focus({ preventScroll: true });
  $('voice-panel').scrollIntoView({ block: 'start', behavior: 'smooth' });
}
function updatePracticeVoice() {
  if (voiceMode !== 'practice' || paused || $('help-dialog').open || $('exam-rules-dialog').open) return;
  const { key } = currentVoiceCue();
  if (key === lastVoiceKey) return;
  const guidance = voiceGuidance(key);
  const urgent = guidance.stage === 'act' || guidance.stage === 'prepare' || key === 'alignment_late' || key.startsWith('warning_') || key.startsWith('recovery_');
  // Preparation and action cues interrupt immediately; descriptive follow-ups
  // let the short action instruction finish instead of cutting it mid-sentence.
  if (!urgent && ['playing', 'loading'].includes(narrator.status.state) && performance.now() - lastVoiceAt < 3000) return;
  lastVoiceKey = key; lastVoiceAt = performance.now(); speakVoice(key);
}
function setCockpitTraining(enabled) {
  if (!enabled) alignmentDrill = null;
  cockpitTraining = enabled;
  document.querySelector('.workspace').classList.toggle('cockpit-active', enabled);
  $('cockpit-panel').hidden = !enabled;
  updateModeButtons();
  if (mode === 'practice') $('scene-mode').textContent = enabled ? paused ? '车内训练 · 暂停' : '车内训练' : paused ? '暂停观察' : '自由练习';
  if (enabled) setView('driver');
  else closeViewAdjustment();
  mirrorRenderer.invalidate();
}
function captureDriverLook() {
  return { view, gaze, yaw: headYaw, pitch: headPitch, magnify: area.classList.contains('mirror-focused'), eye: `${cockpitSettings.seatHeight}:${cockpitSettings.seatFore}` };
}
function restoreDriverLook(saved, fallbackSide = 'right', focusMirror = false) {
  const usable = saved?.view === 'driver' && (!focusMirror || saved.gaze !== 'forward');
  setView('driver');
  setGaze(usable ? saved.gaze : fallbackSide, { magnify: usable && saved.magnify });
  if (usable && saved.eye === `${cockpitSettings.seatHeight}:${cockpitSettings.seatFore}`) { headYaw = saved.yaw; headPitch = saved.pitch; }
  updateCamera(1);
}
function setGaze(next, { magnify = area.classList.contains('mirror-focused') } = {}) {
  markManualTourObservation();
  gaze = next;
  if (beginner) {
    const workspace = document.querySelector('.workspace');
    workspace.classList.toggle('beginner-focus-left', next === 'left');
    workspace.classList.toggle('beginner-focus-right', next === 'right');
  }
  const look = driverLookAngles(cockpitSettings, next);
  headYaw = look.yaw;
  headPitch = look.pitch;
  for (const button of document.querySelectorAll('[data-gaze]')) button.classList.toggle('active', button.dataset.gaze === next);
  for (const side of ['left', 'right']) {
    const expanded = magnify && next === side;
    $('mirror-' + side).classList.toggle('focused', expanded);
    $(side + '-mirror-image').setAttribute('aria-pressed', String(expanded));
  }
  area.classList.toggle('gaze-left', next === 'left');
  area.classList.toggle('gaze-right', next === 'right');
  area.classList.toggle('mirror-focused', magnify && ['left', 'right'].includes(next));
  $('teaching-mirror-toggle').setAttribute('aria-pressed', String(magnify && ['left', 'right'].includes(next)));
  $('teaching-mirror-toggle').textContent = magnify && ['left', 'right'].includes(next) ? '收起教学放大' : '教学放大';
  mirrorRenderer.invalidate();
}
function enterCockpitTraining() {
  if (mode === 'lesson') setMode('practice', true);
  setCockpitTraining(true); updateHUD(); sceneElement.focus({ preventScroll: true });
}
function loadCockpitCheckpoint(checkpoint) {
  alignmentDrill = null;
  if (mode !== 'lesson') setMode('lesson');
  demoPlaying = false; demoCursor = demonstration.stops[checkpoint];
  lessonStep = checkpoint; syncDemoState();
  setMode('practice', true); setCockpitTraining(true);
  sceneElement.focus({ preventScroll: true });
  sceneElement.scrollIntoView({ block: 'center', behavior: 'smooth' });
}
function updateAlignmentUI() {
  $('alignment-drill').hidden = !cockpitTraining || mode !== 'practice';
  const drill = alignmentDrill;
  const finished = drill?.status === 'finished';
  $('alignment-drill').classList.toggle('drill-finished', Boolean(finished));
  $('alignment-drill').classList.toggle('drill-success', drill?.result?.kind === 'aligned');
  $('drill-label').textContent = drill ? `${drill.side === 'left' ? '左' : '右'}倒库 · 回正专项 · 局部练习` : '看镜回正专项';
  $('drill-title').textContent = !drill ? '看镜判断，再亲手回方向' : finished ? drill.result.title : drill.status === 'ready' ? '先看两侧镜，准备好了再开始' : '按住 S 倒车，看准时机按 X 回正';
  $('drill-instruction').textContent = !drill ? '从接近顺直的位置接手；完成后自动教学暂停，对照车身姿态。' : finished ? '保持当前画面观察，或切俯视对照；可以反复练同一侧。' : '方向已向入库侧打足；观察车身与库线趋于平行，主动回方向。松开转向键会保持角度。';
  for (const id of ['drill-right', 'drill-left']) $(id).hidden = Boolean(drill);
  $('drill-go').hidden = !drill || finished || !paused;
  $('drill-go').textContent = drill?.status === 'ready' ? '开始这段' : '继续这段';
  $('drill-retry').hidden = !drill || drill.status === 'ready';
  $('drill-switch').hidden = !drill;
  $('drill-switch').textContent = drill?.side === 'right' ? '换到左倒库' : '换到右倒库';
  $('drill-review').hidden = !drill;
  $('drill-review').textContent = view === 'top' ? '回驾驶位' : '俯视对照';
  $('drill-exit').hidden = !drill;
  $('drill-result').hidden = !finished;
  if (finished) {
    const result = drill.result;
    $('drill-result-text').textContent = result.text;
    const angle = value => `${Math.abs(value).toFixed(1)}°`;
    $('drill-metrics').textContent = `本次结束时：车身与库线夹角 ${angle(result.heading)} · 前轮转角 ${angle(result.steer)}${result.returnHeading === null ? '' : ` · 开始回方向时夹角 ${angle(result.returnHeading)}`}`;
  }
}
function startAlignmentDrill(side) {
  closeViewAdjustment(); alignmentDrill = null;
  if (mode === 'lesson') setMode('practice');
  reset(); setCockpitTraining(true);
  state = alignmentStart(demonstration, side);
  progress = { ...createProgress(), phase: side === 'left' ? 2 : 0, checkedA: true, passedB: side === 'left' };
  historySeedProgress = { ...progress }; history = [{ ...state }]; selectedIndex = 0; sampleTime = 0;
  alignmentDrill = createAlignmentDrill(side, state);
  area.classList.add('has-driven');
  setPaused(true); setGaze('forward'); updateAlignmentUI(); updateCar(); updateCamera(1); updateTrace(); updateHUD();
  sceneElement.focus({ preventScroll: true });
  $('alignment-drill').scrollIntoView({ block: 'start', behavior: 'smooth' });
}
function refreshViewAdjustment() {
  if (!activeAdjustment) return;
  const seat = activeAdjustment === 'seat';
  $('view-adjust-title').textContent = seat ? '调整驾驶座椅' : activeAdjustment === 'left' ? '调节左后视镜' : '调节右后视镜';
  $('view-adjust-a-label').textContent = seat ? '座椅高低' : '向内 / 向外';
  $('view-adjust-b-label').textContent = seat ? '座椅前后' : '向下 / 向上';
  const values = seat ? [cockpitSettings.seatHeight, cockpitSettings.seatFore] : [cockpitSettings[activeAdjustment].yaw, cockpitSettings[activeAdjustment].pitch];
  const limits = seat ? [[1.15, 1.38, 0.01], [0.9, 1.3, 0.01]] : [[-5, 25, 0.1], [-38, -5, 0.1]];
  for (const [index, axis] of ['a', 'b'].entries()) {
    const input = $('view-adjust-' + axis);
    [input.min, input.max, input.step] = limits[index].map(String);
    input.value = String(values[index]);
    $('view-adjust-' + axis + '-output').value = seat ? `${values[index].toFixed(2)} m` : `${values[index]}°`;
  }
  $('view-adjust-tip').textContent = seat ? '固定座椅后，再分别调左右镜；练习过程中保持同一组设置。' : '内侧保留少量车身和后轮附近地面，再观察库角与边线。';
  $('view-adjust-auto').textContent = seat ? '按当前眼位调好两侧镜' : `帮我调好${activeAdjustment === 'left' ? '左' : '右'}镜`;
}
function openViewAdjustment(kind) {
  setPaused(true);
  setGaze(kind === 'seat' ? 'forward' : kind, { magnify: kind !== 'seat' });
  activeAdjustment = kind;
  for (const type of ['left', 'right', 'seat']) area.classList.toggle('adjusting-' + type, type === kind);
  $('view-adjuster').hidden = false; refreshViewAdjustment();
}
function closeViewAdjustment() {
  activeAdjustment = null;
  $('view-adjuster').hidden = true;
  for (const type of ['left', 'right', 'seat']) area.classList.remove('adjusting-' + type);
}

function mirrorFitStatus(message, state = 'idle') {
  $('mirror-fit-status').textContent = message;
  $('mirror-fit-status').dataset.state = state;
  $('mirror-fit-undo').hidden = !mirrorFitUndo;
  $('scene-auto-fit').textContent = state === 'ready' ? '已调好 · 再次推荐' : state === 'changed' ? '重新帮我调镜' : state === 'limited' ? '已设参考位 · 可再调' : '帮我调好后视镜';
  $('scene-auto-fit').title = message;
}
function noteMirrorAdjustment(name) {
  mirrorFitUndo = null;
  mirrorFitStatus(name.startsWith('seat') ? '座椅已改变，建议重新调镜。' : '已手动微调，可重新按眼位推荐。', 'changed');
}
function fitMirrors(side = 'both', keepPanel = false) {
  setPaused(true); releaseControls();
  const before = { left: { ...cockpitSettings.left }, right: { ...cockpitSettings.right } };
  const buttons = ['mirror-auto-fit', 'scene-auto-fit', 'view-adjust-auto', 'setup-auto-fit'].map($);
  for (const button of buttons) button.disabled = true;
  try {
    const fitted = recommendMirrorSettings(cockpitSettings, { side });
    const selected = side === 'both' ? ['left', 'right'] : [side];
    const limited = selected.some(name => fitted.report[name].limited);
    mirrorFitUndo = { ...before, selected };
    cockpitSettings = fitted.settings;
    if (!keepPanel) closeViewAdjustment();
    setView('driver');
    setGaze(keepPanel && side !== 'both' ? side : 'forward', { magnify: keepPanel && side !== 'both' });
    updateCockpitSettingControls(); refreshViewAdjustment(); saveCockpitSettings();
    mirrorRenderer.invalidate(); updateCar(); updateCamera(1); updateHUD();
    const label = side === 'both' ? '两侧镜' : side === 'left' ? '左镜' : '右镜';
    const deferred = judgment?.phase === 'result' || reviewVisible;
    mirrorFitStatus(limited ? `已给出${label}参考位置，仍需手动微调。` : `已按当前眼位调好${label}${deferred ? '，用于后续练习。' : '，仍可微调。'}`, limited ? 'limited' : 'ready');
    if (keepPanel) $('view-adjust-tip').textContent = limited ? '已接近调节范围边缘，请观察车身和地面后微调。' : '已保留少量车身与侧后方地面。固定座椅后继续练习。';
    if (!keepPanel) sceneElement.focus({ preventScroll: true });
  } catch {
    mirrorFitStatus('未找到合适镜位，请停住后手动微调。', 'error');
  } finally { for (const button of buttons) button.disabled = false; }
}
function undoMirrorFit() {
  if (!mirrorFitUndo) return;
  setPaused(true); releaseControls();
  for (const side of mirrorFitUndo.selected) cockpitSettings = { ...cockpitSettings, [side]: { ...mirrorFitUndo[side] } };
  mirrorFitUndo = null;
  updateCockpitSettingControls(); refreshViewAdjustment(); saveCockpitSettings(); mirrorRenderer.invalidate();
  updateCamera(1); updateHUD(); mirrorFitStatus('已恢复调镜前的位置，座椅保持不变。');
}

// The ground markers are teaching aids calibrated to this model, never exam points.
for (const side of [-1, 1]) {
  const x = side * Math.abs(demonstration.turnMarker);
  const marker = new THREE.Mesh(new THREE.PlaneGeometry(.045, 1.4), new THREE.MeshBasicMaterial({ color: '#b69853', depthWrite: false }));
  marker.rotation.x = -Math.PI / 2; marker.position.set(x, TEACHING_SURFACE_Y, 2); turnMarkers.add(marker);
  label('模型转向参照', x, TEACHING_SURFACE_Y + .001, 0.75, 0.64, '#92753b', -Math.PI / 2, turnMarkers);
}

function progressAt(index) {
  let value = { ...historySeedProgress };
  for (let i = 1; i <= index; i++) value = advanceProgress(value, history[i - 1], history[i]);
  return value;
}
function updateLessonUI() {
  const info = LESSON_STEPS[lessonStep];
  $('lesson-counter').textContent = `${info.group} · 步骤 ${String(lessonStep + 1).padStart(2, '0')} / ${LESSON_STEPS.length}`;
  $('lesson-title').textContent = info.title;
  $('lesson-action').textContent = info.action;
  $('lesson-observe').textContent = info.observe;
  updateLessonObservation();
  $('lesson-risk').textContent = info.risk;
  const playLabel = lessonStep === LESSON_STEPS.length - 1 ? '重看示范' : '播放本步';
  $('lesson-play').innerHTML = demoPlaying ? '<svg><use href="#i-pause"/></svg><span>暂停观察</span>' : `<svg><use href="#i-play"/></svg><span>${playLabel}</span>`;
  $('lesson-prev').disabled = lessonStep === 0;
  $('lesson-next').disabled = lessonStep === LESSON_STEPS.length - 1;
  for (const button of document.querySelectorAll('[data-lesson-step]')) button.classList.toggle('current', Number(button.dataset.lessonStep) === lessonStep);
  $('scene-mode').textContent = demoPlaying ? '示范播放中' : '示范 · 暂停观察';
  $('pause-button').innerHTML = demoPlaying ? '<svg><use href="#i-pause"/></svg><span>暂停示范</span><kbd>P</kbd>' : `<svg><use href="#i-play"/></svg><span>${playLabel}</span><kbd>P</kbd>`;
  updateVoiceUI();
}
function updateLessonObservation() {
  if (mode !== 'lesson' || ![1, 2, 3, 4, 8].includes(lessonStep)) return;
  const side = lessonStep === 8 ? 'left' : 'right';
  const guide = observationGuide(side, mirrorRenderer.observe(state, side, cockpitSettings));
  $('lesson-observe').textContent = guide.text;
}
function syncDemoState() {
  selectedIndex = clamp(Math.floor(demoCursor), 0, demonstration.frames.length - 1);
  state = { ...demonstration.frames[selectedIndex] };
  progress = progressAt(selectedIndex);
  started = selectedIndex > 0;
  paused = !demoPlaying;
  updateTimeline(); updateCar(); updateTrace(); updateHUD();
}
function seekLessonStep(index) {
  lessonStep = clamp(index, 0, LESSON_STEPS.length - 1);
  demoPlaying = false;
  demoCursor = demonstration.starts[lessonStep];
  syncDemoState(); updateLessonUI();
}
function setMode(next, takeover = false) {
  if (next === 'practice') voicePracticeReturn = null;
  if (mode === next) return;
  alignmentDrill = null;
  releaseControls(); centering = false;
  const inherited = { ...state, speed: 0 };
  const inheritedProgress = mode === 'lesson' ? progressAt(selectedIndex) : progress;
  mode = next;
  const lesson = mode === 'lesson';
  document.querySelector('.workspace').classList.toggle('lesson-active', lesson);
  $('lesson-controls').hidden = !lesson;
  $('lesson-overlay').hidden = !lesson;
  $('lesson-detail').hidden = !lesson;
  $('practice-guide').hidden = lesson;
  updateModeButtons();
  for (const button of document.querySelectorAll('[data-control]')) button.disabled = lesson;
  $('center-steering').disabled = lesson;
  if (lesson) {
    historySeedProgress = createProgress();
    history = demonstration.frames;
    $('replay-strip').hidden = false;
    $('replay-label').textContent = '示范时间轴';
    $('replay-note').textContent = '关键点自动暂停仅用于教学观察；真实考试途中停车会扣分。可随时接手当前姿态。';
    $('resume-here').innerHTML = '从这里接手练习 <svg><use href="#i-arrow"/></svg>';
    setView(cockpitTraining ? 'driver' : 'top'); seekLessonStep(0);
  } else {
    demoPlaying = false;
    reset();
    if (takeover) {
      state = inherited; progress = inheritedProgress; started = true; everMoved = true;
      historySeedProgress = { ...inheritedProgress };
      history = [{ ...state }]; sampleTime = state.time;
      area.classList.add('has-driven'); updateCar(); updateTrace(); updateHUD();
    }
    $('replay-label').textContent = '暂停观察';
    $('replay-note').textContent = '教学暂停不计作实考停车；从这里继续会重录之后的轨迹。';
    $('resume-here').innerHTML = '从这里继续 <svg><use href="#i-arrow"/></svg>';
    sceneElement.focus({ preventScroll: true });
  }
}
function toggleDemo() {
  if (voiceMode === 'tour') return toggleVoiceTour();
  if (lessonStep === LESSON_STEPS.length - 1) seekLessonStep(0);
  if (demonstration.stops[lessonStep] <= demonstration.starts[lessonStep]) seekLessonStep(lessonStep + 1);
  if (demoCursor >= demonstration.stops[lessonStep] - 0.01) demoCursor = demonstration.starts[lessonStep];
  releaseControls(); demoPlaying = !demoPlaying; paused = !demoPlaying; updateLessonUI();
}
function advanceDemo(dt) {
  demoCursor += dt / demonstration.dt * Number($('lesson-speed').value);
  while (demoCursor >= demonstration.stops[lessonStep]) {
    if ($('lesson-auto-stop').checked || lessonStep >= LESSON_STEPS.length - 2) {
      demoCursor = demonstration.stops[lessonStep]; demoPlaying = false; paused = true;
      if (lessonStep >= LESSON_STEPS.length - 2) lessonStep = LESSON_STEPS.length - 1;
      updateLessonUI(); break;
    }
    lessonStep++; updateLessonUI();
  }
  selectedIndex = clamp(Math.floor(demoCursor), 0, demonstration.frames.length - 1);
  state = { ...demonstration.frames[selectedIndex] };
  started = selectedIndex > 0;
  if (!demoPlaying) { updateTimeline(); updateTrace(); updateHUD(); }
}
for (const [index, step] of LESSON_STEPS.entries()) {
  const item = document.createElement('li');
  const button = document.createElement('button');
  button.dataset.lessonStep = String(index);
  button.textContent = `${index + 1}. ${step.title}`;
  button.addEventListener('click', () => seekLessonStep(index));
  item.appendChild(button); $('lesson-step-list').appendChild(item);
}

function refreshInputs() {
  inputs.forward = keys.has('w') || keys.has('arrowup') || pointerControls.has('forward');
  inputs.reverse = keys.has('s') || keys.has('arrowdown') || pointerControls.has('reverse');
  inputs.left = keys.has('a') || keys.has('arrowleft') || pointerControls.has('left');
  inputs.right = keys.has('d') || keys.has('arrowright') || pointerControls.has('right');
  inputs.brake = keys.has(' ') || pointerControls.has('brake');
  inputs.center = keys.has('x') || centering;
  inputs.speedLimit = Number($('creep-speed').value) / 3.6;
  if (inputs.left || inputs.right) { centering = false; inputs.center = false; }
  for (const button of document.querySelectorAll('[data-control]')) button.classList.toggle('held', inputs[button.dataset.control]);
}
function releaseControls() { keys.clear(); pointerControls.clear(); refreshInputs(); }
function setView(next) {
  markManualTourObservation();
  const previousView = view;
  if (beginner?.step === 'orientation' && next === 'driver') return setBeginnerStep('mirror');
  if (beginner && next !== 'driver') {
    setPaused(true);
    if (beginner.step !== 'orientation') beginner.overview = true;
  } else if (beginner) beginner.overview = false;
  if (alignmentDrill?.status === 'running' && next !== 'driver') setPaused(true);
  if (judgment?.phase === 'practice' && next !== 'driver') setPaused(true);
  if (correctionDrill && ['practice', 'return'].includes(correctionDrill.phase) && next !== 'driver') setPaused(true);
  view = next;
  if (view !== 'driver') closeViewAdjustment();
  area.classList.toggle('driver-view', view === 'driver');
  area.classList.add('has-driven');
  $('mirror-bar').hidden = view !== 'driver';
  $('driver-controls').hidden = view !== 'driver';
  $('mirror-coach').hidden = view !== 'driver';
  if (view === 'driver' && next !== previousView) setGaze('forward');
  mirrorRenderer.invalidate();
  for (const button of document.querySelectorAll('[data-view]')) {
    button.classList.toggle('active', button.dataset.view === view);
    button.setAttribute('aria-pressed', String(button.dataset.view === view));
  }
  updateCamera(1);
  updateAlignmentUI();
}
function updateTrace() {
  const length = mode === 'lesson' || paused ? selectedIndex + 1 : history.length;
  const halfTrack = CAR.trackWidth / 2;
  const offsets = [[-halfTrack, 0], [halfTrack, 0], [-halfTrack, CAR.wheelbase], [halfTrack, CAR.wheelbase]];
  for (let j = 0; j < traces.length; j++) {
    const attribute = traces[j].geometry.getAttribute('position');
    for (let i = 0; i < length; i++) {
      const p = localToWorld(history[i], ...offsets[j]);
      attribute.setXYZ(i, p.x, 0.095 + j * 0.001, p.z);
    }
    attribute.needsUpdate = true; traces[j].geometry.setDrawRange(0, length);
  }
  const attribute = prediction.geometry.getAttribute('position');
  let predicted = { ...state };
  const distance = 0.07;
  const direction = state.speed > 0.04 ? 1 : -1;
  for (let i = 0; i < 55; i++) {
    attribute.setXYZ(i, predicted.x, 0.105, predicted.z);
    const yaw = direction * distance / CAR.wheelbase * Math.tan(state.steer);
    predicted.x += direction * distance * Math.sin(predicted.heading + yaw / 2);
    predicted.z += direction * distance * Math.cos(predicted.heading + yaw / 2);
    predicted.heading += yaw;
  }
  attribute.needsUpdate = true; prediction.geometry.setDrawRange(0, 55); prediction.computeLineDistances();
  ghosts.visible = (paused || mode === 'lesson') && $('show-trail').checked && history.length > 8;
  ghosts.children.forEach((ghost, index) => {
    const i = Math.round((index + 1) / (ghosts.children.length + 1) * (history.length - 1));
    const s = history[i];
    const center = localToWorld(s, 0, CAR.length / 2 - CAR.rearOverhang);
    ghost.position.set(center.x, 0.2, center.z); ghost.rotation.y = s.heading;
    ghost.visible = i <= selectedIndex;
  });
}
function updateCar() {
  const { car, cabin, cockpit, frontPivots, wheels, steering, externalMirrors } = carModel;
  car.position.set(state.x, CAR_VISUAL_ROOT_Y, state.z); car.rotation.y = state.heading;
  cabin.visible = true; cockpit.visible = true; externalMirrors.visible = true;
  for (const pivot of frontPivots) pivot.rotation.y = state.steer;
  for (const wheel of wheels) wheel.rotation.x = state.distance / 0.33;
  steering.rotation.z = state.steer * -12;
}
function updateCamera(blend) {
  const center = localToWorld(state, 0, 1.25);
  carPosition.set(center.x, 0.35, center.z);
  if (view === 'driver') {
    const eye = driverEye(state, cockpitSettings);
    const ahead = localToWorld(state, 0.39 + Math.sin(headYaw) * 18, cockpitSettings.seatFore + Math.cos(headYaw) * 18);
    cameraDestination.set(eye.x, eye.y, eye.z);
    lookTarget.set(ahead.x, cockpitSettings.seatHeight + Math.tan(headPitch) * 18, ahead.z);
    camera.fov = driverVerticalFov(camera.aspect);
  } else if (view === 'top') {
    const focusZ = beginner ? (BAY.back + state.z + 1) / 2 : alignmentDrill ? -2.6 : 0.9;
    const focusX = beginner ? state.x / 2 - .7 : alignmentDrill ? 0 : -.8;
    cameraDestination.set(focusX, (beginner ? 17 : alignmentDrill ? 14.5 : 31) * orbitZoom, focusZ + 0.1);
    lookTarget.set(focusX, 0, focusZ);
    camera.fov = 43;
  } else {
    // Fixed world orientation makes steering and the bay easier to understand.
    const focusX = started ? state.x * 0.18 : -0.8;
    const focusZ = started ? state.z * 0.16 - 0.8 : -0.4;
    const angle = -0.48 + orbitAngle;
    const radius = 27 * orbitZoom;
    cameraDestination.set(focusX + Math.sin(angle) * radius, 21 * orbitZoom, focusZ + Math.cos(angle) * radius);
    lookTarget.set(focusX, 0, focusZ);
    camera.fov = 42;
  }
  camera.position.lerp(cameraDestination, blend);
  camera.up.copy(up); camera.lookAt(lookTarget); camera.updateProjectionMatrix();
}
function updatePauseControls() {
  $('scene-pause').hidden = Boolean(beginner || judgment || correctionDrill);
  $('scene-pause').textContent = paused ? '继续 P' : '暂停 P';
  $('scene-pause').disabled = voiceMode === 'practice' && $('voice-enabled').checked && (speechState !== 'ready' || ['loading', 'error'].includes(voiceAudioStatus.state));
  if (mode === 'practice' && !beginner && !judgment && !correctionDrill) {
    const markup = paused ? '<svg><use href="#i-play"/></svg><span>继续练习</span><kbd>P</kbd>' : '<svg><use href="#i-pause"/></svg><span>暂停 · 看轨迹</span><kbd>P</kbd>';
    if ($('pause-button').innerHTML !== markup) $('pause-button').innerHTML = markup;
  }
}
function updateHUD() {
  updatePauseControls();
  const speed = Math.abs(state.speed * 3.6);
  ui.speed.textContent = speed.toFixed(1);
  ui.gear.textContent = state.speed > 0.025 ? '1' : state.speed < -0.025 ? 'R' : inputs.forward ? '1' : 'R';
  ui['motion-status'].textContent = mode === 'lesson' ? demoPlaying ? '示范播放中' : '教学暂停' : paused ? '教学暂停' : speed > 0.1 ? state.speed > 0 ? '缓慢前进' : '缓慢倒车' : '车辆停稳';
  const degrees = Math.round(-state.steer * 180 / Math.PI);
  ui['steer-angle'].textContent = degrees === 0 ? '0°' : `${degrees < 0 ? '左' : '右'} ${Math.abs(degrees)}°`;
  ui['steering-wheel'].style.transform = `rotate(${degrees * 12}deg)`;
  const crossing = crossesCourseLine(state);
  const parked = isParked(state);
  area.classList.toggle('collision', crossing);
  area.classList.toggle('success', parked);
  for (const mesh of bayLines) mesh.material = crossing ? warningLineMat : normalLineMaterial;
  const phase = mode === 'lesson' ? lessonStep < 6 ? 0 : lessonStep < 8 ? 1 : lessonStep < 10 ? 2 : lessonStep < 11 ? 3 : 4 : progress.phase;
  if (mode === 'lesson') updateLessonObservation();
  if (view === 'driver') {
    const observation = cockpitCue(state, { phase });
    const observedSide = ['left', 'right'].includes(gaze) ? gaze : phase === 2 ? 'left' : 'right';
    const visibleGuide = observationGuide(observedSide, mirrorRenderer.observe(state, observedSide, cockpitSettings));
    if (voiceMode === 'off' && !alignmentDrill) { observation.title = visibleGuide.look; observation.text = visibleGuide.text; }
    if (voiceMode !== 'off') {
      const guidance = currentVoiceGuidance();
      observation.main = guidance.mirror;
      observation.title = guidance.look;
      observation.text = `${guidance.action}；接下来：${guidance.next}`;
    }
    if (alignmentDrill) {
      observation.main = 'both';
      observation.title = alignmentDrill.status === 'finished' ? alignmentDrill.result.title : '交替看两侧镜：车身与库线何时接近平行？';
      observation.text = alignmentDrill.status === 'finished' ? alignmentDrill.result.text : '按住 S 低速倒车，判断时机后按 X 回正。回正完成会自动教学暂停，不需要自己抢着刹车。';
      if (paused && alignmentDrill.status === 'finished' && selectedIndex < history.length - 1) observation.title = '正在回看本次操作；上方反馈记录结束时姿态';
    }
    if (!visibleGuide.bodyVisible || !visibleGuide.lineVisible) { observation.title = visibleGuide.look; observation.text = visibleGuide.text; }
    $('mirror-coach-title').textContent = observation.title;
    $('mirror-coach-text').textContent = observation.text;
    for (const side of ['left', 'right']) {
      $('mirror-' + side).classList.toggle('recommended', observation.main === side || observation.main === 'both');
      $('mirror-' + side).querySelector('.mirror-recommendation').textContent = observation.main === side ? `先看这里 · ${side === 'left' ? 'Q' : 'E'}` : observation.main === 'both' ? '左右交替确认' : '兼顾这一侧';
    }
  }
  const routeTitles = ['A 端 → 右倒库', '右侧停稳 → 出库至 B', 'B 端 → 左倒库', '左侧停稳 → 返回 A', '两侧路线已完成'];
  const routeHints = ['两前轮先越 A 控制线，再开始倒车', '出库到 B 端，两前轮都越线再倒车', '向左打方向，车身近乎平行后主动回正', '出库驶回 A 控制线外并停稳', '继续关闭辅助，练看镜和主动回正'];
  $('route-title').innerHTML = `${routeTitles[phase]}<small>${routeHints[phase]}</small>`;
  $('course-clock').textContent = `${timeText(state.time)} / 03:30`;
  let status = started ? '路线练习进行中' : '两前轮已越 A 控制线';
  const cue = practiceCue(state, progress, demonstration.turnMarker, { speedLimit: Number($('creep-speed').value) / 3.6, speechRate: Number($('voice-rate').value) });
  let feedback = cue.action;
  if (phase === 4) { status = '两侧路线完成 ✓'; feedback = '已完成两侧倒库及返回起点，可重新开始或看分步示范'; }
  if (parked && phase < 4) status = '库内停稳 · 继续后续路线';
  if (crossing) { status = '车身出线提示'; feedback = '当前车身已出考试边线；先教学暂停看原因，再重练这一段'; }
  if (mode === 'practice' && progress.wrongSequence) { status = '控制线 / 路线顺序提示'; feedback = '本轮有未按控制线顺序倒车的情况；重新开始或暂停复盘'; }
  if (mode === 'practice' && progress.overTime) { status = '超过项目时限'; feedback = '本轮练习用时已超过 210 秒；教学暂停和回放不等于实考允许途中停车'; }
  if (mode === 'lesson') { status = `${LESSON_STEPS[lessonStep].group} · ${lessonStep + 1} / ${LESSON_STEPS.length}`; feedback = demoPlaying ? LESSON_STEPS[lessonStep].title : lessonStep === LESSON_STEPS.length - 1 ? '示范已结束 · 可重看示范，或切回自己练习' : '教学暂停 · 换视角观察，点“下一步”或“播放本步”继续'; }
  else if (paused) feedback = '教学暂停 · 切换视角或拖动时间轴；真实考试中途停车每次扣 5 分';
  if (alignmentDrill) {
    status = `回正专项 · ${alignmentDrill.status === 'finished' ? '已教学暂停' : paused ? '暂停观察' : '自己控制'}`;
    feedback = alignmentDrill.status === 'finished' ? alignmentDrill.result.title : paused ? '观察两侧镜，点“开始这段”或按 P；S 倒车，X 主动回正' : '看车身与库线的夹角，按 X 主动回正；松开 A/D 会保持方向角';
    $('course-clock').textContent = `片段 ${timeText(state.time)}`;
    $('route-title').innerHTML = '看镜回正 · 局部练习<small>这段练习不计算完整考试路线结果</small>';
    if (paused && alignmentDrill.status === 'finished' && selectedIndex < history.length - 1) feedback = '回看轨迹 · 上方反馈记录本次结束时的姿态';
  }
  ui['feedback-text'].textContent = feedback;
  ui['mission-state'].innerHTML = `<span></span>${status}`;
  $('step-1').classList.toggle('current', cue.step === 0);
  $('step-2').classList.toggle('current', cue.step === 1);
  $('step-3').classList.toggle('current', cue.step === 2);
  ui['coach-tip'].textContent = alignmentDrill ? alignmentDrill.result?.text ?? '比较车身和库线的夹角；前轮回正后，车身会沿当时的朝向继续倒车。' : mode === 'lesson' ? LESSON_STEPS[lessonStep].risk : crossing ? '考试过程中车身出线属于专项不合格情形。练习时可教学暂停观察原因；重新开始后再完整做一遍。' : cue.requiresStop ? cue.observe : observationGuide(progress.phase === 2 ? 'left' : 'right', mirrorRenderer.observe(state, progress.phase === 2 ? 'left' : 'right', cockpitSettings)).text;
  if (voiceMode !== 'off') {
    updatePracticeVoice();
    if (voiceMode === 'tour') ui['motion-status'].textContent = tourRunning ? tourStage === 'narrating' ? '听讲解 · 教学暂停' : '示范动作' : '教学暂停';
    else if (voicePracticeReady) ui['motion-status'].textContent = '接手准备';
    ui['feedback-text'].textContent = voicePracticeReady ? '先 Q / E 看镜；准备好后按提示操作，或点击“开始这段练习”' : `${voiceMode === 'tour' ? '示范动作' : '当前操作'} · ${currentVoiceGuidance().action}`;
    updateVoiceUI();
  }
  if (judgment) updateJudgmentUI();
  if (correctionDrill) updateCorrectionUI();
}
const timeText = value => `${Math.floor(value / 60).toString().padStart(2, '0')}:${Math.floor(value % 60).toString().padStart(2, '0')}`;
function updateTimeline() {
  ui.timeline.max = String(history.length - 1); ui.timeline.value = String(selectedIndex);
  ui['replay-time'].textContent = `${timeText(state.time)} / ${timeText(history.at(-1).time)}`;
}
function setPaused(value) {
  if (correctionDrill) {
    if (!value && !['practice', 'return', 'preparing'].includes(correctionDrill.phase)) return;
    paused = value;
    if (value) { releaseControls(); state.speed = 0; narrator.pause(); }
    else { closeViewAdjustment(); narrator.resume(); }
    updateCorrectionUI(); return;
  }
  if (judgment) {
    if (judgment.phase === 'result') { if (value) narrator.pause(); else narrator.resume(); return; }
    if (['ready', 'demo-done', 'practice-ready'].includes(judgment.phase)) return;
    paused = value;
    if (value) { releaseControls(); narrator.pause(); if (judgment.phase === 'practice') state.speed = 0; }
    else { closeViewAdjustment(); narrator.resume(); }
    updateJudgmentUI(); return;
  }
  if (beginner) {
    if (!value && (beginner.overview || beginner.step === 'orientation')) return;
    paused = value;
    if (value) { releaseControls(); narrator.pause(); if (beginner.phase === 'practice') state.speed = 0; }
    else narrator.resume();
    updateBeginnerUI(); return;
  }
  if (reviewVisible && !value) closePracticeReview();
  if (voiceMode === 'tour') { if (tourRunning === value) toggleVoiceTour(); return; }
  if (!value && voiceMode === 'practice' && $('voice-enabled').checked && (speechState !== 'ready' || ['loading', 'error'].includes(voiceAudioStatus.state))) {
    paused = true; releaseControls();
    $('voice-guidance-note').textContent = '语音尚未准备好，车辆保持停住。重试语音，或选择字幕继续。';
    updateSpeechUI(); return;
  }
  if (!value) {
    voicePracticeNotice = '';
    voicePracticeReady = false;
    closeViewAdjustment();
    if (alignmentDrill?.status === 'ready') alignmentDrill = { ...alignmentDrill, status: 'running' };
    else if (alignmentDrill?.status === 'finished') alignmentDrill = null;
    updateAlignmentUI();
  }
  if (mode === 'lesson') {
    if (demoPlaying === value) toggleDemo();
    return;
  }
  if (voiceMode === 'practice') { if (value) narrator.pause(); else narrator.resume(); }
  // A browser can reject resume synchronously while the vehicle is still paused.
  if (!value && voiceMode === 'practice' && $('voice-enabled').checked && voiceAudioStatus.state === 'error') {
    paused = true; releaseControls(); updateVoiceUI(); return;
  }
  if (paused === value) return;
  releaseControls();
  if (value) {
    history.push(recordedPose());
    selectedIndex = history.length - 1;
    paused = true;
    updateTimeline();
  } else {
    progress = progressAt(selectedIndex);
    history = history.slice(0, selectedIndex + 1);
    state = { ...history.at(-1), speed: 0 };
    history[history.length - 1] = { ...state };
    sampleTime = state.time;
    paused = false;
  }
  $('replay-strip').hidden = !paused;
  $('scene-mode').textContent = paused ? '暂停观察' : '自由练习';
  if (cockpitTraining) $('scene-mode').textContent = paused ? '车内训练 · 暂停' : '车内训练';
  updatePauseControls();
  updateAlignmentUI(); updateTrace(); updateHUD();
}
function reset() {
  if (correctionDrill) return enterCorrection(correctionDrill.side, true);
  if (beginner) return enterBeginner();
  if (judgment) return enterJudgment(judgment.side);
  closePracticeReview(); practiceReport = null;
  if (voiceMode === 'tour') { selectVoiceSegment(0); return; }
  if (voiceMode === 'practice') return enterVoicePractice(false);
  alignmentDrill = null; closeViewAdjustment(); updateAlignmentUI();
  releaseControls();
  centering = false;
  if (mode === 'lesson') { history = demonstration.frames; seekLessonStep(0); return; }
  progress = createProgress(); historySeedProgress = createProgress();
  state = startPose(); history = [{ ...state }];
  selectedIndex = 0; sampleTime = 0; paused = false; started = false; everMoved = false;
  $('replay-strip').hidden = true;
  $('scene-mode').textContent = '自由练习';
  if (cockpitTraining) $('scene-mode').textContent = '车内训练';
  updatePauseControls();
  area.classList.remove('has-driven');
  updateCar(); updateCamera(1); updateTrace(); updateHUD();
}

document.addEventListener('keydown', event => {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.target.closest?.('button, a, summary') && [' ', 'Enter'].includes(event.key)) return;
  if ($('help-dialog').open || $('exam-rules-dialog').open || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return;
  if (event.target instanceof HTMLInputElement && !['p', 'r', 'v', '?', 'q', 'e', 'c'].includes(event.key.toLowerCase())) return;
  const key = event.key.toLowerCase();
  if (!$('welcome-panel').hidden && key !== '?') {
    if (['w', 'a', 's', 'd', 'x', 'p', 'r', 'v', 'q', 'e', 'c', ' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) event.preventDefault();
    return;
  }
  if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'p', 'r', 'v', 'x', '?', 'q', 'e', 'c'].includes(key)) event.preventDefault();
  if (event.repeat && ['p', 'r', 'v', '?'].includes(key)) return;
  if (reviewVisible && key === 'v') return toggleReviewCamera();
  if (reviewVisible && ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'x'].includes(key)) return;
  if (correctionDrill) {
    if (key === 'p') return toggleCorrectionPause();
    if (key === 'r') return enterCorrection(correctionDrill.side, true);
    if (key === 'v') return setView(view === 'driver' ? 'top' : 'driver');
    if (['q', 'e', 'c'].includes(key)) return setGaze(key === 'q' ? 'left' : key === 'e' ? 'right' : 'forward');
    if (key === '?') { setPaused(true); return $('help-dialog').showModal(); }
    if (key === ' ' && ['practice', 'return'].includes(correctionDrill.phase)) { keys.add(key); refreshInputs(); return; }
    if (!event.repeat && ['a', 'd', 'arrowleft', 'arrowright', 'x'].includes(key)) return startCorrectionControl(key === 'x' ? 'center' : ['a', 'arrowleft'].includes(key) ? 'left' : 'right');
    return;
  }
  if (judgment) {
    if (key === 'p') return judgment.phase === 'result' ? setPaused(narrator.status.state !== 'paused') : setPaused(!paused);
    if (key === 'r') return enterJudgment(judgment.side);
    if (key === 'v') return setView(view === 'driver' ? 'top' : 'driver');
    if (['q', 'e', 'c'].includes(key)) return setGaze(key === 'q' ? 'left' : key === 'e' ? 'right' : 'forward');
    if (key === '?') { setPaused(true); return $('help-dialog').showModal(); }
    if (key === 's' || key === 'arrowdown') { if (!event.repeat) startJudgmentReverse(); return; }
    if (key === 'x' && !event.repeat) return centerJudgment();
    if (key === ' ' && judgment.phase === 'practice') { keys.add(key); refreshInputs(); return; }
    if (['w', 'a', 'd', 'arrowup', 'arrowleft', 'arrowright'].includes(key)) { judgment.notice = '这段只练回正时机：S 倒车、X 回正，Q / E 交替看镜。'; updateJudgmentUI(); }
    return;
  }
  if (beginner) {
    if (key === 'p') return setPaused(!paused);
    if (key === 'r') return enterBeginner();
    if (key === 'v') return setView(view === 'driver' ? 'top' : 'driver');
    if (['q', 'e'].includes(key)) return focusBeginnerMirror(key === 'q' ? 'left' : 'right', false);
    if (key === 'c') return setGaze('forward');
    if (key === '?') { setPaused(true); return $('help-dialog').showModal(); }
    const expected = { turn: 'd', hold: 's', center: 'x' }[beginner.step];
    if (key === expected && !event.repeat) startBeginnerAction();
    else if (['w', 'a', 's', 'd', 'x', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key) && key !== expected) {
      beginner.notice = expected ? `这一小步只需要 ${expected.toUpperCase()}，先完成眼前这个动作。` : '先观察，点击上方按钮后再操作。';
      updateBeginnerUI();
    }
    return;
  }
  if (key === 'p') return setPaused(!paused);
  if (key === 'r') return reset();
  if (key === 'v') return setView(['orbit', 'driver', 'top'][(['orbit', 'driver', 'top'].indexOf(view) + 1) % 3]);
  if (view === 'driver' && ['q', 'e', 'c'].includes(key)) { closeViewAdjustment(); return setGaze(key === 'q' ? 'left' : key === 'e' ? 'right' : 'forward'); }
  if (key === '?') { releaseControls(); if (voiceMode !== 'off') setPaused(true); return $('help-dialog').showModal(); }
  if (voicePracticeReady && ['w', 's', 'arrowup', 'arrowdown', 'x'].includes(key)) setPaused(false);
  if (mode === 'practice' && !paused) { if (key === 'x') centering = true; keys.add(key); refreshInputs(); }
});
document.addEventListener('keyup', event => {
  const key = event.key.toLowerCase();
  if (judgment && ['s', 'arrowdown'].includes(key)) pointerControls.delete('reverse');
  if (beginner && key === ({ turn: 'd', hold: 's' }[beginner.step])) stopBeginnerAction();
  if (correctionDrill && ['a', 'd', 'arrowleft', 'arrowright'].includes(key)) pointerControls.delete(['a', 'arrowleft'].includes(key) ? 'left' : 'right');
  keys.delete(key); refreshInputs();
});
window.addEventListener('blur', () => { releaseControls(); if (beginner || judgment || correctionDrill) setPaused(true); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden && (everMoved || mode === 'lesson' || voiceMode !== 'off')) {
    setPaused(true); narrator.pause(); releaseControls();
  } else releaseControls();
});
for (const button of document.querySelectorAll('[data-control]')) {
  const control = button.dataset.control;
  button.addEventListener('pointerdown', event => {
    event.preventDefault();
    if (voicePracticeReady && ['forward', 'reverse'].includes(control)) setPaused(false);
    if (paused || mode === 'lesson') return;
    button.setPointerCapture(event.pointerId); pointerControls.add(control); refreshInputs();
  });
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(name, () => { pointerControls.delete(control); refreshInputs(); });
  button.addEventListener('contextmenu', event => event.preventDefault());
}
for (const button of document.querySelectorAll('[data-view]')) button.addEventListener('click', () => setView(button.dataset.view));
$('pause-button').addEventListener('click', () => setPaused(!paused));
$('scene-pause').addEventListener('click', () => setPaused(!paused));
$('reset-button').addEventListener('click', reset);
$('resume-here').addEventListener('click', () => voiceMode === 'tour' ? enterVoicePractice(true) : mode === 'lesson' ? setMode('practice', true) : setPaused(false));
ui.timeline.addEventListener('input', event => {
  if (voiceMode === 'tour') {
    const cursor = Number(event.target.value);
    const index = voiceTour.findIndex(segment => segment.end > cursor);
    selectVoiceSegment(index < 0 ? voiceTour.length - 1 : index, cursor); return;
  }
  if (mode === 'lesson') {
    demoPlaying = false; paused = true; demoCursor = Number(event.target.value);
    lessonStep = demonstration.stops.findIndex(stop => stop >= demoCursor);
    if (lessonStep < 0) lessonStep = LESSON_STEPS.length - 1;
    syncDemoState(); updateLessonUI(); return;
  }
  if (!paused) return;
  if (voiceMode === 'practice') { narrator.stop(); lastVoiceKey = ''; lastVoiceAt = 0; }
  selectedIndex = clamp(Number(event.target.value), 0, history.length - 1);
  centering = false; releaseControls();
  if (alignmentDrill?.status === 'running') {
    // Reconstruct the return-to-centre observation after rewinding so that a
    // previous attempt cannot leak its timing into the resumed attempt.
    alignmentDrill = replayAlignmentDrill(alignmentDrill.side, history, selectedIndex);
    updateAlignmentUI();
  }
  state = { ...history[selectedIndex] }; progress = progressAt(selectedIndex);
  if (voiceMode === 'practice') voiceKey = currentVoiceCue().key;
  updateTimeline(); updateCar(); updateTrace(); updateHUD();
});
$('show-trail').addEventListener('change', event => { traceGroup.visible = event.target.checked; updateTrace(); });
$('show-guide').addEventListener('change', event => { targetOutline.visible = event.target.checked; turnMarkers.visible = event.target.checked; });
$('help-button').addEventListener('click', () => { releaseControls(); if (voiceMode !== 'off' || beginner || judgment || correctionDrill) setPaused(true); $('help-dialog').showModal(); });
$('close-help').addEventListener('click', () => $('help-dialog').close());
$('start-practice').addEventListener('click', () => { $('help-dialog').close(); sceneElement.focus({ preventScroll: true }); });
$('practice-mode').addEventListener('click', () => { stopVoiceExperience(); setCockpitTraining(false); setMode('practice'); });
$('lesson-mode').addEventListener('click', () => { stopVoiceExperience(); setCockpitTraining(false); setMode('lesson'); updateLessonUI(); });
$('cockpit-mode').addEventListener('click', () => { stopVoiceExperience(); enterCockpitTraining(); });
$('voice-mode').addEventListener('click', enterVoiceTour);
$('welcome-start').addEventListener('click', enterBeginner);
$('speech-retry').addEventListener('click', () => prepareSpeech(true));
$('speech-subtitles').addEventListener('click', chooseSubtitles);
$('speech-voice').addEventListener('click', () => { $('voice-enabled').checked = true; if ($('welcome-panel').hidden) setPaused(true); prepareSpeech(true); });
$('welcome-practice').addEventListener('click', () => { leaveWelcome(); enterVoicePractice(false); });
$('beginner-mode').addEventListener('click', enterBeginner);
$('beginner-next').addEventListener('click', nextBeginner);
$('recognition-options').addEventListener('click', event => {
  const button = event.target.closest('[data-recognition]');
  if (!button || !beginner || button.disabled) return;
  beginner.recognition = button.dataset.recognition;
  updateBeginnerUI();
});
$('correction-mode').addEventListener('click', () => enterCorrection());
for (const button of document.querySelectorAll('[data-correction-side]')) button.addEventListener('click', () => enterCorrection(button.dataset.correctionSide));
for (const button of document.querySelectorAll('[data-tight-side]')) button.addEventListener('click', () => {
  if (!correctionDrill || !['observe', 'ready'].includes(correctionDrill.phase)) return;
  if (!correctionReferencesReady()) return;
  if (button.dataset.tightSide === correctionDrill.side) { correctionDrill = { ...correctionDrill, phase: 'ready' }; correctionNotice = '判断正确。先听操作提示，再亲手小幅修方向；两面镜都要确认。'; }
  else { correctionDrill = { ...correctionDrill, phase: 'observe' }; correctionNotice = '先认库侧线，别把库口外沿当作库底。沿同侧车身看向车尾：哪边的走势更朝侧线靠近？再核对另一侧，不直接比较两张镜面的画面宽窄。'; }
  updateCorrectionUI();
});
$('correction-start').addEventListener('click', prepareCorrection);
$('correction-center').addEventListener('click', () => startCorrectionControl('center'));
$('correction-pause').addEventListener('click', toggleCorrectionPause);
$('correction-retry').addEventListener('click', () => enterCorrection(correctionDrill.side, true));
$('correction-recognition').addEventListener('click', () => { enterBeginner(); setBeginnerStep('mirror'); });
$('correction-exit').addEventListener('click', () => { exitCorrection(); enterVoicePractice(false); });
for (const button of document.querySelectorAll('[data-correction-control]')) {
  const control = button.dataset.correctionControl;
  button.addEventListener('pointerdown', event => { event.preventDefault(); button.setPointerCapture(event.pointerId); startCorrectionControl(control); });
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(name, () => { pointerControls.delete(control); refreshInputs(); });
  button.addEventListener('keydown', event => { if (['Enter', ' '].includes(event.key)) { event.preventDefault(); event.stopPropagation(); if (!event.repeat) startCorrectionControl(control); } });
  button.addEventListener('keyup', event => { if (['Enter', ' '].includes(event.key)) { event.preventDefault(); pointerControls.delete(control); refreshInputs(); } });
}
$('beginner-orientation').addEventListener('click', () => {
  if (!beginner) return;
  if (beginner.overview) return nextBeginner();
  setPaused(true); releaseControls(); beginner.overview = true;
  closeViewAdjustment(); setView('top'); updateBeginnerUI();
});
$('beginner-replay').addEventListener('click', () => {
  if (['mirror', 'compare'].includes(beginner?.step)) beginnerVoice(`beginner_${beginner.step}`);
  else startBeginnerDemo();
});
$('beginner-exit').addEventListener('click', () => { exitBeginner(); enterVoicePractice(false); });
$('beginner-full').addEventListener('click', () => enterJudgment());
$('judgment-mode').addEventListener('click', () => enterJudgment());
$('welcome-judgment').addEventListener('click', () => enterJudgment());
$('judgment-next').addEventListener('click', nextJudgment);
$('judgment-action').addEventListener('click', centerJudgment);
$('judgment-pause').addEventListener('click', () => setPaused(!paused));
$('judgment-retry').addEventListener('click', () => prepareJudgmentPractice(true));
$('judgment-again').addEventListener('click', () => prepareJudgmentPractice());
$('judgment-full').addEventListener('click', () => enterVoicePractice(false));
$('judgment-exit').addEventListener('click', () => { exitJudgment(); setCockpitTraining(true); reset(); });
for (const button of document.querySelectorAll('[data-judgment-side]')) button.addEventListener('click', () => enterJudgment(button.dataset.judgmentSide));
$('judgment-reverse').addEventListener('pointerdown', event => { event.preventDefault(); $('judgment-reverse').setPointerCapture(event.pointerId); startJudgmentReverse(); });
for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) $('judgment-reverse').addEventListener(event, () => { pointerControls.delete('reverse'); refreshInputs(); });
$('judgment-reverse').addEventListener('keydown', event => { if (['Enter', ' '].includes(event.key)) { event.preventDefault(); event.stopPropagation(); if (!event.repeat) startJudgmentReverse(); } });
$('judgment-reverse').addEventListener('keyup', event => { if (['Enter', ' '].includes(event.key)) { pointerControls.delete('reverse'); refreshInputs(); } });
$('beginner-action').addEventListener('pointerdown', event => {
  event.preventDefault(); $('beginner-action').setPointerCapture(event.pointerId); startBeginnerAction();
});
for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) $('beginner-action').addEventListener(name, stopBeginnerAction);
$('beginner-action').addEventListener('keydown', event => {
  if (['Enter', ' '].includes(event.key)) { event.preventDefault(); event.stopPropagation(); if (!event.repeat) startBeginnerAction(); }
});
$('beginner-action').addEventListener('keyup', event => { if (['Enter', ' '].includes(event.key)) stopBeginnerAction(); });
$('voice-play').addEventListener('click', () => voiceMode === 'tour' ? toggleVoiceTour() : setPaused(!paused));
$('voice-prev').addEventListener('click', () => selectVoiceSegment(tourIndex - 1));
$('voice-next').addEventListener('click', () => selectVoiceSegment(tourIndex + 1));
$('voice-takeover').addEventListener('click', () => enterVoicePractice(true));
$('voice-practice').addEventListener('click', () => enterVoicePractice(false));
$('voice-retry').addEventListener('click', () => { if (voicePracticeAnchor) prepareVoicePractice(); });
$('voice-review').addEventListener('click', reviewVoicePractice);
$('voice-return-practice').addEventListener('click', returnVoicePractice);
$('practice-review-open').addEventListener('click', openPracticeReview);
$('review-close').addEventListener('click', () => { closePracticeReview(); updateHUD(); sceneElement.focus({ preventScroll: true }); });
$('review-continue').addEventListener('click', () => { closePracticeReview(); setPaused(false); sceneElement.focus({ preventScroll: true }); });
$('review-camera').addEventListener('click', toggleReviewCamera);
$('review-retry').addEventListener('click', retryBeforePracticeIssue);
$('review-judgment').addEventListener('click', () => enterJudgment(practiceReport?.attempts[reviewAttemptIndex]?.side ?? 'right'));
$('review-timeline').addEventListener('input', event => seekPracticeReview(Number(event.target.value)));
for (const key of ['turn', 'center']) $(`review-${key}-jump`).addEventListener('click', () => {
  const index = practiceReport?.attempts[reviewAttemptIndex]?.[key].index;
  if (index != null) seekPracticeReview(index);
});
$('review-attempts').addEventListener('click', event => {
  const button = event.target.closest('[data-review-attempt]');
  if (!button) return;
  reviewAttemptIndex = Number(button.dataset.reviewAttempt);
  const attempt = practiceReport.attempts[reviewAttemptIndex];
  seekPracticeReview(attempt.issueIndex ?? attempt.endIndex);
});
$('voice-repeat').addEventListener('click', () => {
  if (voiceMode === 'tour') { if (tourRunning) toggleVoiceTour(); tourToken++; tourStage = 'ready'; }
  else setPaused(true);
  const key = voiceMode === 'practice' ? currentVoiceCue().key : voiceKey;
  if (voiceMode === 'practice') { lastVoiceKey = key; lastVoiceAt = performance.now(); }
  speakVoice(key); sceneElement.focus({ preventScroll: true });
});
$('voice-enabled').addEventListener('change', () => { if (!$('voice-enabled').checked) chooseSubtitles(); else { setPaused(true); prepareSpeech(true); } updateVoiceStatus(); });
$('voice-volume').addEventListener('input', event => narrator.setVolume(Number(event.target.value)));
$('voice-rate').addEventListener('change', event => narrator.setRate(Number(event.target.value)));
$('lesson-prev').addEventListener('click', () => seekLessonStep(lessonStep - 1));
$('lesson-next').addEventListener('click', () => seekLessonStep(lessonStep + 1));
$('lesson-play').addEventListener('click', toggleDemo);
$('take-over').addEventListener('click', () => voiceMode === 'tour' ? enterVoicePractice(true) : setMode('practice', true));
$('center-steering').addEventListener('click', () => { if (voicePracticeReady) setPaused(false); if (!paused && mode === 'practice') { centering = true; refreshInputs(); sceneElement.focus({ preventScroll: true }); } });
$('creep-speed').addEventListener('input', event => { $('creep-output').value = event.target.value; refreshInputs(); });
$('exam-rules-button').addEventListener('click', () => { releaseControls(); if (voiceMode !== 'off' || beginner || judgment || correctionDrill) setPaused(true); $('exam-rules-dialog').showModal(); });
$('close-exam-rules').addEventListener('click', () => $('exam-rules-dialog').close());
for (const button of document.querySelectorAll('[data-gaze]')) button.addEventListener('click', () => { closeViewAdjustment(); setGaze(button.dataset.gaze); sceneElement.focus({ preventScroll: true }); });
$('teaching-mirror-toggle').addEventListener('click', () => {
  closeViewAdjustment();
  const side = gaze === 'left' ? 'left' : 'right';
  setGaze(side, { magnify: !area.classList.contains('mirror-focused') });
  sceneElement.focus({ preventScroll: true });
});
for (const side of ['left', 'right']) $(`${side}-mirror-image`).addEventListener('click', () => { closeViewAdjustment(); setGaze($('mirror-' + side).classList.contains('focused') ? 'forward' : side, { magnify: true }); sceneElement.focus({ preventScroll: true }); });
for (const id of ['mirror-labels', 'mirror-assist-toggle']) $(id).addEventListener('change', event => {
  $('mirror-labels').checked = $('mirror-assist-toggle').checked = event.target.checked;
  if (beginner) updateBeginnerUI(); if (judgment) updateJudgmentUI();
});
$('cockpit-start').addEventListener('click', () => { if (mode === 'lesson') setMode('practice'); reset(); setCockpitTraining(true); sceneElement.scrollIntoView({ block: 'center', behavior: 'smooth' }); });
$('cockpit-corner').addEventListener('click', () => loadCockpitCheckpoint(2));
$('cockpit-align').addEventListener('click', () => loadCockpitCheckpoint(3));
$('cockpit-demonstrate').addEventListener('click', () => { setCockpitTraining(true); setMode('lesson'); seekLessonStep(0); setView('driver'); sceneElement.scrollIntoView({ block: 'center', behavior: 'smooth' }); });
$('cockpit-review').addEventListener('click', () => { setPaused(true); setView('top'); });
$('drill-right').addEventListener('click', () => startAlignmentDrill('right'));
$('drill-left').addEventListener('click', () => startAlignmentDrill('left'));
$('drill-go').addEventListener('click', () => { setView('driver'); setPaused(false); sceneElement.focus({ preventScroll: true }); });
$('drill-retry').addEventListener('click', () => startAlignmentDrill(alignmentDrill.side));
$('drill-switch').addEventListener('click', () => startAlignmentDrill(alignmentDrill.side === 'right' ? 'left' : 'right'));
$('drill-review').addEventListener('click', () => { setPaused(true); setView(view === 'top' ? 'driver' : 'top'); });
$('drill-exit').addEventListener('click', () => { alignmentDrill = null; updateAlignmentUI(); setView('driver'); setPaused(false); sceneElement.focus({ preventScroll: true }); });
$('cockpit-setup').addEventListener('toggle', () => { if ($('cockpit-setup').open) setPaused(true); });
function saveCockpitSettings() {
  try {
    localStorage.setItem(COCKPIT_STORAGE_KEY, JSON.stringify({ version: 2, settings: cockpitSettings }));
    $('cockpit-save-status').textContent = '已保存到当前浏览器，下次打开自动恢复';
  } catch { $('cockpit-save-status').textContent = '当前浏览器无法保存；本次页面内仍保留调节'; }
}
function updateCockpitSettingControls() {
  for (const input of document.querySelectorAll('[data-cockpit-setting]')) {
    const name = input.dataset.cockpitSetting;
    const [side, axis] = name.split('.');
    const value = axis ? cockpitSettings[side][axis] : cockpitSettings[name];
    input.value = String(value);
    const output = $(name.replace('.', '-') + '-output');
    output.value = axis ? `${value}°` : `${value.toFixed(2)} m`;
  }
}
for (const input of document.querySelectorAll('[data-cockpit-setting]')) input.addEventListener('input', event => {
  setPaused(true);
  cockpitSettings = setCockpitSetting(cockpitSettings, input.dataset.cockpitSetting, event.target.value);
  noteMirrorAdjustment(input.dataset.cockpitSetting);
  updateCockpitSettingControls(); refreshViewAdjustment(); saveCockpitSettings();
});
$('reset-cockpit-settings').addEventListener('click', () => { setPaused(true); cockpitSettings = createCockpitSettings(); mirrorFitUndo = null; mirrorFitStatus('已恢复参考位置，可按当前眼位推荐。'); updateCockpitSettingControls(); refreshViewAdjustment(); setGaze(activeAdjustment && activeAdjustment !== 'seat' ? activeAdjustment : 'forward'); saveCockpitSettings(); });
$('mirror-auto-fit').addEventListener('click', () => fitMirrors());
$('scene-auto-fit').addEventListener('click', () => fitMirrors());
$('setup-auto-fit').addEventListener('click', () => fitMirrors());
$('view-adjust-auto').addEventListener('click', () => fitMirrors(activeAdjustment === 'seat' ? 'both' : activeAdjustment, true));
$('mirror-fit-undo').addEventListener('click', undoMirrorFit);
for (const button of document.querySelectorAll('[data-adjust-mirror]')) button.addEventListener('click', () => openViewAdjustment(button.dataset.adjustMirror));
$('adjust-seat').addEventListener('click', () => openViewAdjustment('seat'));
$('close-view-adjuster').addEventListener('click', () => { closeViewAdjustment(); sceneElement.focus({ preventScroll: true }); });
for (const [index, axis] of ['a', 'b'].entries()) $('view-adjust-' + axis).addEventListener('input', event => {
  if (!activeAdjustment) return;
  const name = activeAdjustment === 'seat' ? index === 0 ? 'seatHeight' : 'seatFore' : `${activeAdjustment}.${index === 0 ? 'yaw' : 'pitch'}`;
  cockpitSettings = setCockpitSetting(cockpitSettings, name, event.target.value);
  noteMirrorAdjustment(name);
  updateCockpitSettingControls(); refreshViewAdjustment(); saveCockpitSettings();
});
const mirrorPickRay = new THREE.Raycaster();
function pickPhysicalMirror(event) {
  if (view !== 'driver') return null;
  const rect = sceneElement.getBoundingClientRect();
  mirrorPickRay.setFromCamera({ x: (event.clientX - rect.left) / rect.width * 2 - 1, y: 1 - (event.clientY - rect.top) / rect.height * 2 }, camera);
  world.updateMatrixWorld(true);
  for (const hit of mirrorPickRay.intersectObjects(world.children, true)) {
    let visible = true;
    for (let node = hit.object; node; node = node.parent) if (!node.visible) visible = false;
    if (!visible || !hit.object.isMesh) continue;
    const side = ['left', 'right'].find(value => carModel.mirrorSurfaces[value] === hit.object);
    if (side) return side;
    const materials = Array.isArray(hit.object.material) ? hit.object.material : [hit.object.material];
    if (materials.some(material => material.visible !== false && (!material.transparent || material.opacity >= .95))) return null;
  }
  return null;
}
sceneElement.addEventListener('pointerdown', event => { if (!['orbit', 'driver'].includes(view)) return; dragging = true; dragDistance = 0; lastDragX = event.clientX; lastDragY = event.clientY; sceneElement.setPointerCapture(event.pointerId); });
sceneElement.addEventListener('pointermove', event => {
  if (!dragging) return;
  dragDistance += Math.hypot(event.clientX - lastDragX, event.clientY - lastDragY);
  if (dragDistance < 4) return;
  if (view === 'driver') {
    if (gaze !== 'free') {
      markManualTourObservation();
      gaze = 'free';
      for (const button of document.querySelectorAll('[data-gaze]')) button.classList.remove('active');
      for (const side of ['left', 'right']) $('mirror-' + side).classList.remove('focused');
      area.classList.remove('gaze-left', 'gaze-right', 'mirror-focused');
      $('teaching-mirror-toggle').setAttribute('aria-pressed', 'false');
      $('teaching-mirror-toggle').textContent = '教学放大';
      mirrorRenderer.invalidate();
    }
    headYaw = clamp(headYaw - (event.clientX - lastDragX) * 0.004, -1.25, 1.25);
    headPitch = clamp(headPitch - (event.clientY - lastDragY) * 0.003, -0.45, 0.22);
  } else orbitAngle -= (event.clientX - lastDragX) * 0.006;
  lastDragX = event.clientX; lastDragY = event.clientY;
});
sceneElement.addEventListener('pointerup', event => {
  const side = dragDistance < 4 ? pickPhysicalMirror(event) : null;
  dragging = false;
  if (side) { setGaze(side, { magnify: true }); sceneElement.focus({ preventScroll: true }); }
});
for (const name of ['pointercancel', 'lostpointercapture']) sceneElement.addEventListener(name, () => { dragging = false; });
sceneElement.addEventListener('wheel', event => { if (view === 'driver') return; event.preventDefault(); orbitZoom = clamp(orbitZoom + event.deltaY * 0.0007, 0.68, 1.35); }, { passive: false });

function resize() {
  width = Math.max(1, sceneElement.clientWidth); height = Math.max(1, sceneElement.clientHeight);
  renderer.setSize(width, height);
  camera.aspect = width / height; camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(sceneElement);
function prepareMirrors() {
  const ghostsWereVisible = ghosts.visible;
  ghosts.visible = false;
  try {
    mirrorRenderer.setObservationGuides(Boolean(judgment && ['ready', 'narrating', 'demo', 'demo-done'].includes(judgment.phase)));
    mirrorRenderer.prepare(state, cockpitSettings, $('mirror-labels').checked);
  } finally { ghosts.visible = ghostsWereVisible; }
}
function frame(now) {
  requestAnimationFrame(frame);
  const dt = clamp((now - frameTime) / 1000, 0, 0.05); frameTime = now;
  if (!$('welcome-panel').hidden) { /* The welcome screen does not drive the hidden car. */ }
  else if (correctionDrill) advanceCorrectionFrame(dt);
  else if (judgment) advanceJudgmentFrame(dt);
  else if (beginner) advanceBeginnerFrame(dt);
  else if (voiceMode === 'tour' && tourRunning && !$('help-dialog').open && !$('exam-rules-dialog').open) advanceVoiceTour(dt);
  else if (mode === 'lesson' && demoPlaying && !$('help-dialog').open && !$('exam-rules-dialog').open) advanceDemo(dt);
  else if (mode === 'practice' && !paused && !$('help-dialog').open && !$('exam-rules-dialog').open) {
    const previousTime = state.time;
    if (inputs.forward || inputs.reverse) { started = true; everMoved = true; area.classList.add('has-driven'); }
    if (started) {
      // Fixed substeps stabilize turning even when rendering slows down.
      const count = Math.max(1, Math.ceil(dt / (1 / 120)));
      for (let i = 0; i < count; i++) {
        const previous = state;
        state = stepVehicle(state, inputs, dt / count);
        progress = advanceProgress(progress, previous, state);
        alignmentDrill = advanceAlignmentDrill(alignmentDrill, previous, state, inputs);
        if (alignmentDrill?.status === 'finished') { setPaused(true); updateAlignmentUI(); break; }
      }
      if (state.time - sampleTime >= 0.07) {
        history.push(recordedPose()); sampleTime = state.time;
        if (history.length >= MAX_SAMPLES - 1) { selectedIndex = history.length - 1; setPaused(true); }
      }
    } else {
      const previous = state;
      state = stepVehicle(state, inputs, dt); state.time = previousTime;
      alignmentDrill = advanceAlignmentDrill(alignmentDrill, previous, state, inputs);
      if (alignmentDrill?.status === 'finished') { setPaused(true); updateAlignmentUI(); }
    }
    if (centering && Math.abs(state.steer) < 0.001) { centering = false; refreshInputs(); }
  }
  updateCar();
  const hideAssistance = view === 'driver' && !$('mirror-trails').checked;
  traceGroup.visible = $('show-trail').checked && !hideAssistance;
  helpers.visible = !hideAssistance;
  teachingObjects.visible = $('show-guide').checked && !hideAssistance;
  grid.visible = true;
  beginnerLandmarks.visible = Boolean(beginner && view === 'top');
  if (beginnerLandmarks.visible) {
    const center = localToWorld(state, 0, 1.3);
    beginnerCarLabel.position.set(center.x, .16, center.z + 2);
  }
  updateCamera(view === 'driver' || view === 'top' ? 1 : 1 - Math.exp(-dt * 6));
  hudTime += dt; pathTime += dt;
  if (hudTime > 0.08) { updateHUD(); if (beginner) updateBeginnerUI(); if (mode === 'lesson') updateTimeline(); hudTime = 0; }
  if (pathTime > 0.10 && !paused) { updateTrace(); pathTime = 0; }
  if (reviewVisible && !reviewInCar) return;
  prepareMirrors();
  renderer.setViewport(0, 0, width, height);
  renderer.render(world, camera);
  if (view === 'driver') mirrorRenderer.renderOverlay();
}
resize(); updateCar(); updateCamera(1); updateTrace(); updateHUD(); updateCockpitSettingControls(); updateAlignmentUI();
prepareMirrors(); renderer.render(world, camera);
$('loading').hidden = true;
requestAnimationFrame(frame);
prepareSpeech();
const projectEntry = resolveParkingEntry(location.search);
if (projectEntry) {
  leaveWelcome();
  ({ beginner: enterBeginner, voice: enterVoiceTour, practice: () => enterVoicePractice(false), judgment: () => enterJudgment(), correction: () => enterCorrection() })[projectEntry]();
}
