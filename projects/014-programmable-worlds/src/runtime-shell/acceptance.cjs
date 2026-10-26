'use strict';

// Deterministic tests for this application's own fixed localhost renderer.
// No OS input, desktop capture, remote-debugging port, or other browser is used.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { nativeImage } = require('electron');

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
function timeout(promise, milliseconds, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(label + ' timed out')), milliseconds); })
  ]).finally(() => clearTimeout(timer));
}
function invariant(condition, message) { if (!condition) throw new Error(message); }
function pixelSample(image) {
  const size = image.getSize(), bitmap = image.toBitmap();
  const samples = [];
  let sum = 0, square = 0, nonBlack = 0, range = 0;
  // Sample only the actual scene's central area, avoiding any HTML controls.
  for (let row = 0; row < 64; row++) for (let col = 0; col < 64; col++) {
    const x = Math.min(size.width - 1, Math.floor(size.width * (.08 + .84 * (col + .5) / 64)));
    const y = Math.min(size.height - 1, Math.floor(size.height * (.08 + .72 * (row + .5) / 64)));
    const offset = (y * size.width + x) * 4;
    const b = bitmap[offset], g = bitmap[offset + 1], r = bitmap[offset + 2];
    samples.push(r, g, b);
    const luminance = .2126 * r + .7152 * g + .0722 * b;
    sum += luminance; square += luminance * luminance;
    if (luminance > 6) nonBlack++;
    range += Math.max(r, g, b) - Math.min(r, g, b);
  }
  const count = 64 * 64, mean = sum / count;
  return {
    samples,
    statistics: {
      width: size.width, height: size.height,
      sampledPixels: count, meanLuminance: mean,
      luminanceStdDev: Math.sqrt(Math.max(0, square / count - mean * mean)),
      nonBlackFraction: nonBlack / count,
      meanChannelRange: range / count
    }
  };
}
function pixelDifference(a, b) {
  invariant(a.length === b.length, 'Pixel sample dimensions changed unexpectedly');
  let total = 0, changed = 0;
  for (let i = 0; i < a.length; i++) {
    const delta = Math.abs(a[i] - b[i]); total += delta;
    if (delta >= 3) changed++;
  }
  return { meanAbsoluteDifference: total / a.length, changedChannelFraction: changed / a.length };
}

async function runAcceptance({ window, projectDirectory, workspaceDirectory, record, backend, scene, getFatal }) {
  const started = Date.now();
  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const output = scene === 'source'
    ? path.join(projectDirectory, 'assets', 'runtime-qa', runId)
    : path.join(projectDirectory, 'assets', 'quality-qa', scene, runId);
  fs.mkdirSync(output, { recursive: true });
  const progressPath = path.join(workspaceDirectory, '.cache', 'napali-qa-status.json');
  const resultName = scene === 'source' ? 'runtime-acceptance' : scene + '-acceptance';
  const backendResultName = resultName + '.' + backend;
  const resultPath = path.join(projectDirectory, 'notes', backendResultName + '.json');
  const latestPath = path.join(projectDirectory, 'notes', backendResultName + '.latest.json');
  const baselinePath = path.join(projectDirectory, 'notes', backendResultName + '.baseline.json');
  const legacyResultPath = path.join(projectDirectory, 'notes', resultName + '.json');
  // Keep the established OpenGL entry point for the project. Experimental backend
  // passes/failures only write their own reports, never the accepted OpenGL result.
  const previousPath = fs.existsSync(resultPath) ? resultPath : backend === 'gl' ? legacyResultPath : null;
  let previousPassed = null;
  if (previousPath && fs.existsSync(previousPath)) {
    try {
      const previous = JSON.parse(fs.readFileSync(previousPath, 'utf8'));
      if (previous.status === 'passed' && previous.backend === backend) {
        previousPassed = previous;
        if (!fs.existsSync(baselinePath)) fs.copyFileSync(previousPath, baselinePath);
      }
    } catch { /* A malformed prior report is not accepted as a baseline. */ }
  }
  const result = {
    runId, scene, backend, pid: process.pid, status: 'running',
    startedAt: new Date(started).toISOString(),
    mode: 'hidden-own-application',
    windowPolicy: { show: false, skipTaskbar: true, focusable: false, backgroundThrottling: false, occludedWindowBackgrounding: false },
    security: { sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true },
    tests: [], captures: [], errors: [],
    visualQualityAcceptance: scene === 'source' ? 'original-shader-integrity-plus-rendered-evidence' : 'requires-separate-human-comparison-with-source',
    priorPassedBaseline: previousPassed ? path.relative(projectDirectory, baselinePath).replaceAll('\\', '/') : null
  };
  if (scene === 'source') {
    result.sourceIntegrity = {};
    for (const [key, relative] of [['preservedUpstream', 'web/upstream/index.html'], ['adaptedRuntime', 'web/runtime/index.html']]) {
      const content = fs.readFileSync(path.join(projectDirectory, relative));
      result.sourceIntegrity[key] = { path: relative, bytes: content.length, sha256: crypto.createHash('sha256').update(content).digest('hex') };
    }
  }
  function persistResult() {
    fs.mkdirSync(path.dirname(resultPath), { recursive: true });
    const serialized = JSON.stringify(result, null, 2) + '\n';
    fs.writeFileSync(latestPath, serialized);
    // A failed rerun must not erase a previously passed acceptance baseline.
    if (!previousPassed || result.status === 'passed') fs.writeFileSync(resultPath, serialized);
    if (backend === 'gl') {
      fs.writeFileSync(path.join(projectDirectory, 'notes', resultName + '.latest.json'), serialized);
      if (!previousPassed || result.status === 'passed') fs.writeFileSync(legacyResultPath, serialized);
    }
    fs.writeFileSync(path.join(output, 'acceptance.json'), serialized);
  }
  function progress(phase, data = {}) {
    const item = { ...result, phase, elapsedSeconds: (Date.now() - started) / 1000, ...data };
    fs.writeFileSync(progressPath, JSON.stringify(item, null, 2) + '\n');
    record('qa-progress', { phase, elapsedSeconds: item.elapsedSeconds, ...data });
  }
  function check(name, evidence) { result.tests.push({ name, passed: true, evidence }); }
  let initializationPending = scene !== 'source';
  async function evaluate(code, label = 'Renderer test call', timeoutMilliseconds = 30000, waitingPhase = null) {
    const fatal = getFatal();
    if (fatal) throw new Error(fatal);
    invariant(!window.isDestroyed() && !window.webContents.isDestroyed(), 'Hidden renderer was destroyed');
    const waitStarted = Date.now();
    let heartbeat;
    if (waitingPhase) {
      const update = () => progress(waitingPhase, { waitingFor: label, applicationStatePending: true, stateReadElapsedSeconds: (Date.now() - waitStarted) / 1000, stateReadTimeoutSeconds: timeoutMilliseconds / 1000, mainProcessHeartbeat: true });
      update(); heartbeat = setInterval(update, 2000);
    }
    try { return await timeout(window.webContents.executeJavaScript(code, false), timeoutMilliseconds, label); }
    finally { if (heartbeat) clearInterval(heartbeat); }
  }
  async function readState(maximumWaitMilliseconds = Infinity) {
    const initializing = initializationPending;
    const response = await evaluate(`(() => {
      const c = document.querySelector('canvas');
      const api = window.napaliControl || window.worldAcceptance;
      const load = document.getElementById('loadtxt');
      const error = document.getElementById('error');
      const state = api && typeof api.getState === 'function' ? api.getState() : null;
      if (state && state.ready === undefined) state.ready = !!state.loaded;
      if (state && state.rendering === undefined) state.rendering = false;
      return {
        url: location.href,
        load: load ? load.textContent : null,
        uiStatus: document.getElementById('flight-status')?.textContent || document.getElementById('render-status')?.textContent || document.getElementById('place-label')?.textContent || null,
        visibleError: error && !error.hidden ? error.textContent : null,
        sourceSHA256: document.querySelector('meta[name="upstream-sha256"]')?.content || null,
        canvas: c ? {width:c.width,height:c.height} : null,
        hidden: document.hidden,
        state,
        drive: window.napaliDrive && typeof window.napaliDrive.getState === 'function' ? window.napaliDrive.getState() : null
      };
    })()`, 'Read application state', Math.min(initializing ? 150000 : 30000, maximumWaitMilliseconds), initializing ? 'awaiting-' + scene + '-application-state' : null);
    if (initializing) {
      if (response.state?.ready && response.state.frames >= 2) initializationPending = false;
      progress(initializationPending ? 'initializing-' + scene + '-renderer' : scene + '-renderer-ready', { applicationStatePending: false, application: response });
    }
    return response;
  }
  async function waitState(predicate, label, milliseconds = 45000) {
    const deadline = Date.now() + milliseconds;
    let state;
    while (Date.now() < deadline) {
      // The initialization budget remains a total bound even when the first
      // physical-material compilation blocks the renderer's JS state response.
      state = await readState(Math.max(1, deadline - Date.now()));
      if (predicate(state)) return state;
      if (state.load?.startsWith('Error:')) throw new Error(state.load);
      if (state.visibleError) throw new Error(state.visibleError);
      if (state.state && state.state.ready === false && (state.state.error || state.state.contextLost)) throw new Error(state.state.error || 'WebGL context was lost');
      await pause(300);
    }
    throw new Error(label + ' timed out: ' + JSON.stringify(state));
  }
  async function capture(name) {
    invariant(!window.isVisible() && !window.isFocused(), 'QA window became visible or focused');
    // A completed WebGL frame and current DOM do not guarantee that a hidden
    // compositor has presented their new surface yet. Let two own RAFs finish
    // before saving either evidence image; this never shows or focuses a window.
    await evaluate(`new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))`, 'Present own canvas and HTML UI before capture');
    const dataURL = await evaluate(`document.querySelector('canvas').toDataURL('image/png')`, 'Export actual rendered canvas');
    invariant(/^data:image\/png;base64,/.test(dataURL), 'Canvas export returned no PNG');
    const image = nativeImage.createFromDataURL(dataURL);
    invariant(!image.isEmpty(), 'Canvas export was empty');
    const png = image.toPNG();
    const canvasPath = path.join(output, name + '-canvas.png');
    fs.writeFileSync(canvasPath, png);
    const page = await timeout(window.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true }), 30000, 'Hidden application capture');
    const pagePath = path.join(output, name + '-page.png');
    fs.writeFileSync(pagePath, page.toPNG());
    invariant(!window.isVisible() && !window.isFocused(), 'Capture changed hidden QA visibility');
    const sampled = pixelSample(image);
    const stats = sampled.statistics;
    invariant(stats.width >= 1000 && stats.height >= 600, 'Full-resolution canvas is unexpectedly small');
    invariant(stats.meanLuminance > 3 && stats.luminanceStdDev > 4 && stats.nonBlackFraction > .15, 'Scene canvas is blank or flat');
    const entry = {
      name, canvas: path.relative(projectDirectory, canvasPath).replaceAll('\\', '/'),
      page: path.relative(projectDirectory, pagePath).replaceAll('\\', '/'),
      sha256: crypto.createHash('sha256').update(png).digest('hex'), ...stats,
      capturedAt: new Date().toISOString(), state: await readState()
    };
    result.captures.push(entry);
    return { entry, samples: sampled.samples };
  }
  try {
    invariant(!window.isVisible() && !window.isFocused(), 'Hidden QA policy was not applied');
    check('window-remains-hidden-and-unfocused', { visible: window.isVisible(), focused: window.isFocused() });
    invariant(['source', 'window', 'story', 'calibration', 'look', 'water'].includes(scene), 'Unknown acceptance scene');
    if (scene !== 'source') {
      const runner = scene === 'water' ? require('./water-acceptance.cjs').runWaterAcceptance : scene === 'look' ? require('./look-acceptance.cjs').runLookAcceptance : scene === 'calibration' ? require('./calibration-acceptance.cjs').runCalibrationAcceptance : require('./demo-acceptance.cjs').runDemoAcceptance;
      await runner({ scene, evaluate, readState, waitState, capture, progress, check, invariant, pause, pixelDifference });
      result.status = result.tests.every(test => test.passed) ? 'passed' : 'partial';
      result.finishedAt = new Date().toISOString();
      result.elapsedSeconds = (Date.now() - started) / 1000;
      persistResult(); progress('finished'); return result;
    }
    progress('awaiting-full-source-initialization');
    const initializationTimeout = Math.max(120000, Math.min(1800000, Number(process.env.NAPALI_QA_TIMEOUT_MS) || 600000));
    const deadline = Date.now() + initializationTimeout;
    let state;
    while (Date.now() < deadline) {
      state = await readState();
      progress('source-initializing', { application: state });
      if (state.load?.startsWith('Error:')) throw new Error(state.load);
      if (state.state?.ready) break;
      await pause(2000);
    }
    invariant(state?.state?.ready, 'Full source never became ready');
    check('complete-source-initialized', state);
    invariant(state.sourceSHA256 === result.sourceIntegrity.preservedUpstream.sha256, 'Runtime source hash does not match preserved upstream');
    check('runtime-metadata-matches-preserved-source', { metaSHA256: state.sourceSHA256, fileSHA256: result.sourceIntegrity.preservedUpstream.sha256 });
    await evaluate(`window.napaliControl.setQuality(1);window.napaliControl.suspend(false);window.napaliControl.pause(false);window.napaliControl.seek(0);`);
    state = await waitState(s => s.state?.frames >= 2, 'First rendered frames', 90000);
    check('actual-full-resolution-frames', state);
    progress('testing-motion');
    const start = await capture('01-sea-start');
    const motionStart = start.entry.state.state;
    const motionMeasureStarted = Date.now();
    state = await waitState(s => s.state?.frames >= motionStart.frames + 8 && s.state.time > motionStart.time, 'Advancing live frames', 90000);
    const motionElapsedMs = Date.now() - motionMeasureStarted;
    const motionCompletedFrames = state.state.frames - motionStart.frames;
    check('completed-frame-throughput-sample', { completedFrames: motionCompletedFrames, elapsedMilliseconds: motionElapsedMs, completedFramesPerSecond: motionCompletedFrames / motionElapsedMs * 1000, meanMillisecondsPerCompletedFrame: motionElapsedMs / motionCompletedFrames, applicationLastFrameMs: state.state.lastFrameMs ?? null, applicationAverageFrameMs: state.state.averageFrameMs ?? null, scope: 'One measured interval; not a stable cross-device benchmark.' });
    const moving = await capture('02-sea-moving');
    const motionDifference = pixelDifference(start.samples, moving.samples);
    invariant(motionDifference.meanAbsoluteDifference > .001, 'Advancing live scene produced identical pixels');
    check('live-playback-changes-time-and-pixels', { before: motionStart, after: state.state, pixels: motionDifference });
    progress('testing-pause');
    await evaluate(`window.napaliControl.pause(true)`);
    const pauseFrames = (await readState()).state.frames;
    await waitState(s => s.state?.frames >= pauseFrames + 2 && s.state.paused, 'Pause settles completed frames', 90000);
    const paused = (await readState()).state;
    const pausedA = await capture('02a-paused-noise-baseline');
    await pause(1400);
    const still = (await readState()).state;
    invariant(still.paused && Math.abs(still.time - paused.time) < .0001, 'Pause failed to hold simulation time');
    const pausedB = await capture('02b-paused-noise-baseline');
    const pausedDifference = pixelDifference(pausedA.samples, pausedB.samples);
    invariant(pausedDifference.meanAbsoluteDifference < 8, 'Paused scene changed beyond plausible grain/dither noise');
    check('pause-holds-simulation-time', { before: paused, after: still, pixels: pausedDifference, note: 'Per-frame grain/dither is allowed; pixel identity is not required.' });
    invariant(motionDifference.meanAbsoluteDifference > pausedDifference.meanAbsoluteDifference + .05, 'Playback pixel changes did not exceed measured paused grain/dither');
    check('motion-exceeds-paused-noise', { moving: motionDifference, paused: pausedDifference });
    let previous = moving;
    for (const [seconds, name] of [[35, '03-headland-35s'], [75, '04-valley-75s'], [128, '05-aerial-128s']]) {
      progress('testing-camera-seek', { targetSeconds: seconds });
      const beforeFrames = (await readState()).state.frames;
      await evaluate(`window.napaliControl.seek(${seconds});window.napaliControl.suspend(false);`);
      const after = await waitState(s => s.state?.frames >= beforeFrames + 2 && Math.abs(s.state.time - seconds) < .001, 'Seek ' + seconds, 90000);
      const shot = await capture(name);
      const difference = pixelDifference(previous.samples, shot.samples);
      invariant(difference.meanAbsoluteDifference > 1, 'Camera seek did not visibly change the full scene');
      check('seek-' + seconds + '-changes-camera-and-pixels', { state: after.state, pixels: difference });
      previous = shot;
    }
    const freeAPI = await evaluate(`!!(window.napaliDrive && typeof window.napaliDrive.setMode === 'function' && typeof window.napaliDrive.move === 'function' && typeof window.napaliDrive.look === 'function' && typeof window.napaliDrive.getState === 'function')`);
    if (freeAPI) {
      progress('testing-free-driving');
      await evaluate(`window.napaliDrive.setMode('free')`);
      const before = (await readState()).drive;
      await evaluate(`window.napaliDrive.move({forward:25,right:10,up:12});window.napaliDrive.look({yawDelta:.08,pitchDelta:.02})`);
      const beforeFrames = (await readState()).state.frames;
      await waitState(s => s.state?.frames >= beforeFrames + 2, 'Free-driving rendered frames', 90000);
      const after = (await readState()).drive;
      invariant(JSON.stringify(before) !== JSON.stringify(after), 'Free-driving state did not change');
      const driven = await capture('06-free-driving');
      const difference = pixelDifference(previous.samples, driven.samples);
      invariant(difference.meanAbsoluteDifference > .1, 'Free-driving did not visibly change scene pixels');
      check('free-driving-changes-position-and-pixels', { before, after, pixels: difference });
      await evaluate(`window.napaliDrive.setMode('flight')`);
    } else {
      result.tests.push({ name: 'free-driving', passed: false, pending: true, evidence: 'Controller acceptance API not exposed' });
    }
    progress('testing-resume-and-suspend');
    const beforeResume = (await readState()).state;
    await evaluate(`window.napaliControl.pause(false)`);
    const resumed = await waitState(s => s.state?.time > beforeResume.time && !s.state.paused, 'Resume', 45000);
    check('resume-advances-simulation', { before: beforeResume, after: resumed.state });
    await evaluate(`window.napaliControl.suspend(true)`);
    const suspended = (await waitState(s => s.state?.suspended && s.state.rendering === false, 'In-flight GPU frame finishes before suspension', 90000)).state;
    await pause(1500);
    const suspendedAfter = (await readState()).state;
    invariant(suspendedAfter.suspended && suspendedAfter.frames === suspended.frames && suspendedAfter.time === suspended.time, 'Suspend did not stop GPU rendering');
    check('suspend-stops-time-and-GPU-frame-submission', { before: suspended, after: suspendedAfter });
    progress('measuring-idle-animation-frame-cadence');
    const idleCadence = await evaluate(`new Promise(resolve => {
      const times = [], started = performance.now();
      const tick = now => {
        times.push(now);
        if (times.length < 8) requestAnimationFrame(tick);
        else resolve({ times, elapsedMilliseconds: performance.now() - started, visibilityState: document.visibilityState });
      };
      requestAnimationFrame(tick);
    })`, 'Eight idle animation-frame callbacks');
    const intervals = idleCadence.times.slice(1).map((value, index) => value - idleCadence.times[index]);
    const sortedIntervals = [...intervals].sort((a, b) => a - b);
    const idleAfter = (await readState()).state;
    invariant(idleAfter.suspended && idleAfter.frames === suspended.frames, 'Idle cadence probe unexpectedly submitted source GPU frames');
    check('idle-animation-frame-cadence-with-source-GPU-suspended', {
      ...idleCadence, intervalsMilliseconds: intervals,
      medianIntervalMilliseconds: sortedIntervals[Math.floor(sortedIntervals.length / 2)],
      maximumIntervalMilliseconds: Math.max(...intervals),
      diagnosticOnly: true, sourceGPUFramesSubmitted: idleAfter.frames - suspended.frames,
      note: 'Measures hidden compositor scheduling separately from source rendering; no FPS performance threshold is implied.'
    });
    result.status = result.tests.every(test => test.passed) ? 'passed' : 'partial';
    result.finishedAt = new Date().toISOString();
    result.elapsedSeconds = (Date.now() - started) / 1000;
    persistResult();
    progress('finished');
    return result;
  } catch (error) {
    result.status = 'failed';
    result.errors.push(error.stack || String(error));
    result.finishedAt = new Date().toISOString();
    result.elapsedSeconds = (Date.now() - started) / 1000;
    persistResult();
    progress('failed');
    return result;
  }
}

module.exports = { runAcceptance };
