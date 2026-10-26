'use strict';
// Dedicated functional acceptance for the native dirty-render scheduler.
// Operates only the caller's own hidden window; never opens, focuses or sends
// OS input to an application. These measurements do not accept artwork quality.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { nativeImage } = require('electron');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

async function runLijiangNativeIdleAcceptance({ window, backend, record = () => {},
  getFatal = () => null, getPresentation = () => null }) {
  const runId = new Date().toISOString().replace(/[:.]/g, '-'), started = Date.now();
  const output = path.join('C:\\Users\\yun68\\CodexTaskArtifacts\\014-lijiang-native-idle-qa', runId);
  fs.mkdirSync(output, { recursive: true });
  const report = { runId, scene: 'lijiang-native', backend, output, status: 'running',
    scope: 'FUNCTIONAL ONLY: actual GPU-completed native frames, paused canvas retention and invalidation. No visual-quality acceptance.',
    artAccepted: false, tests: [], captures: [], errors: [], gpuUtilizationMeasured: false };
  function progress(phase, state = null) {
    fs.writeFileSync(path.join(output, 'status.json'), JSON.stringify({ runId, output,
      status: report.status, phase, elapsedSeconds: (Date.now() - started) / 1000,
      tests: report.tests.length, errors: report.errors, state }, null, 2));
  }
  async function call(js) {
    if (!window || window.isDestroyed() || window.isVisible() || window.isFocused()) throw new Error('Idle acceptance window must remain hidden and unfocused');
    if (getFatal()) throw new Error(getFatal());
    return window.webContents.executeJavaScript(js, false);
  }
  async function state() {
    return call(`({control:window.napaliControl?.getState()||null,
      completed:window.lijiangNativeCompletedFrame||null,
      load:document.getElementById('loadtxt')?.textContent||null})`);
  }
  async function wait(phase, predicate, timeout = 240000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const value = await state();progress(phase, value);
      if (value.control?.error || /^Error:/.test(value.load || '')) throw new Error(value.control?.error || value.load);
      if (value.control && !Object.hasOwn(value.control, 'idle')) throw new Error('Actual loaded native engine lacks the dirty-render idle patch');
      if (predicate(value)) return value;
      await sleep(200);
    }
    throw new Error(phase + ' timeout');
  }
  const isIdle = value => value.control?.ready && value.control.idle === true
    && value.control.paused && !value.control.suspended && !value.control.rendering;
  function pass(name, evidence) { report.tests.push({ name, passed: true, evidence }); }
  async function capture(name) {
    const value = await call(`({png:document.getElementById('c').toDataURL('image/png'),
      control:napaliControl.getState(),completed:window.lijiangNativeCompletedFrame})`);
    const image = nativeImage.createFromDataURL(value.png), size = image.getSize();
    const png = image.toPNG(), pixels = image.toBitmap();
    if (!size.width || !size.height || pixels.length !== size.width * size.height * 4) throw new Error('Actual canvas decoded pixel size is invalid');
    const file = path.join(output, name + '.png');fs.writeFileSync(file, png);
    const item = { name, path: file, ...size, pngSHA256: hash(png), pixelSHA256: hash(pixels),
      control: value.control, completed: value.completed };
    report.captures.push(item);
    return { item, pixels };
  }
  function compare(a, b) {
    if (a.pixels.length !== b.pixels.length) throw new Error('Compared native canvases have different dimensions');
    let total = 0, changed = 0, maximum = 0;
    for (let offset = 0; offset < a.pixels.length; offset += 4) {
      let largest = 0;
      for (let c = 0; c < 3; c++) { const delta = Math.abs(a.pixels[offset + c] - b.pixels[offset + c]);total += delta;largest = Math.max(largest, delta); }
      if (largest) changed++;maximum = Math.max(maximum, largest);
    }
    return { pixelBytesIdentical: a.pixels.equals(b.pixels), maximumChannelDifference: maximum,
      meanAbsoluteRGBDifference: total / (a.pixels.length / 4 * 3), changedPixelFraction: changed / (a.pixels.length / 4) };
  }
  async function fresh(name, mutation) {
    const before = await state();
    if (!isIdle(before)) throw new Error(name + ' did not start from an actual idle renderer');
    const start = Date.now();await call(mutation);
    const after = await wait(name, value => isIdle(value) && value.control.frames >= before.control.frames + 1);
    if (after.control.frames !== before.control.frames + 1) throw new Error(name + ' pumped more than one completed scene frame');
    if (after.completed?.frame !== after.control.frames) throw new Error(name + ' completed canvas tag does not match the GPU-completed scene frame');
    const result = { before, after, wallMillisecondsToFreshIdleFrame: Date.now() - start };
    return { result, capture: await capture(name) };
  }
  try {
    report.actualEntry = await call('location.href');
    const script = await call(`[...document.scripts].find(s=>s.textContent.includes('const GLSL_COMMON'))?.textContent||''`);
    if (!script) throw new Error('Actual loaded native renderer script missing');
    const file = path.join(output, 'loaded-engine-script.js');fs.writeFileSync(file, script);
    const revision = script.match(/native-paused-dirty-render-(\d+)/);
    if (!revision || Number(revision[1]) < 2) throw new Error('Actual engine lacks the transport-aware idle scheduler');
    report.loadedSource = { path: file, sha256: hash(Buffer.from(script)), bytes: Buffer.byteLength(script),
      idleRevision: revision[0], completionContract: 'startDrone increments frames after the completed presentation gpuWait, never in the idle RAF branch' };
    record('native-idle-acceptance-start', { output, revision: revision[0] });
    const initial = await wait('Actual first two GPU-completed frames and idle', value => isIdle(value) && value.control.frames >= 2, 1200000);
    if (initial.control.frames !== 2) throw new Error('Unchanged paused initialization rendered more than the two readiness frames');
    if (initial.completed?.frame !== initial.control.frames) throw new Error('Initial completed-frame tag mismatch');
    report.graphics = await call(`(()=>{const d=gl.getExtension('WEBGL_debug_renderer_info');return {
      renderer:d?gl.getParameter(d.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),
      vendor:d?gl.getParameter(d.UNMASKED_VENDOR_WEBGL):gl.getParameter(gl.VENDOR),
      contextLost:gl.isContextLost(),glError:gl.getError(),settingsReady:!!window.lijiangNativeSettings};})()`);
    if (report.graphics.contextLost || report.graphics.glError || !report.graphics.settingsReady) throw new Error('Actual native graphics/settings are not healthy');
    const baseline = await capture('initial-paused');
    pass('two-real-readiness-frames-then-idle', initial);
    progress('Hold actual paused canvas for three seconds', initial);await sleep(3000);
    const held = await state(), heldPixels = await capture('paused-held-three-seconds');
    const heldComparison = compare(baseline, heldPixels);
    if (!isIdle(held) || held.control.frames !== initial.control.frames || !heldComparison.pixelBytesIdentical
      || JSON.stringify(held.completed) !== JSON.stringify(initial.completed)) throw new Error('Unchanged paused canvas did not remain held without scene-frame pumping');
    pass('unchanged-paused-scene-holds-pixels-and-completed-counter-for-three-seconds', { initial, held, comparison: heldComparison });

    const exposure = await call('lijiangNativeSettings.getState().values.expo');
    const changedExposure = exposure < 1.7 ? exposure + .1 : exposure - .1;
    const brighter = await fresh('exposure-one-fresh-frame', `lijiangNativeSettings.set({expo:${JSON.stringify(changedExposure)}})`);
    const exposureComparison = compare(baseline, brighter.capture);
    if (exposureComparison.meanAbsoluteRGBDifference <= .1 || exposureComparison.changedPixelFraction <= .02) throw new Error('Exposure control did not visibly affect actual canvas pixels');
    pass('exposure-change-completes-one-actual-frame-and-idles', { ...brighter.result, comparison: exposureComparison });
    const restored = await fresh('exposure-restored', `lijiangNativeSettings.set({expo:${JSON.stringify(exposure)}})`);
    if (await call('lijiangNativeSettings.getState().values.expo') !== exposure) throw new Error('Exposure did not restore');
    const restoreComparison = compare(baseline, restored.capture);
    if (restoreComparison.meanAbsoluteRGBDifference > 5) throw new Error('Restored exposure pixels differ beyond the existing animated film-grain allowance');
    pass('exposure-restoration-completes-one-frame', { ...restored.result, comparison: restoreComparison,
      pixelCaveat: 'The fixed initial time can contain the existing frame-seeded film grain; byte identity is required only for a held canvas.' });

    const terminal = await fresh('seek-45-one-fresh-frame', 'napaliControl.seek(45);napaliControl.pause(true);true');
    if (terminal.result.after.control.time !== 45 || terminal.result.after.completed.time !== 45) throw new Error('Seek did not present the real terminal camera/time');
    pass('seek-45-completes-one-frame-and-idles', terminal.result);
    const explicit = await fresh('explicit-refresh-one-frame', `napaliControl.invalidate('idle-acceptance-explicit-refresh')`);
    const explicitComparison = compare(terminal.capture, explicit.capture);
    if (explicitComparison.meanAbsoluteRGBDifference > .25) throw new Error('Explicit terminal refresh changed a fixed-time zero-grain scene');
    pass('explicit-refresh-completes-one-frame-and-idles', { ...explicit.result, comparison: explicitComparison });

    const beforeSuspend = await state();await call('napaliControl.suspend(true)');await sleep(250);
    const suspended = await state();
    if (!suspended.control.suspended || suspended.control.rendering || suspended.control.frames !== beforeSuspend.control.frames) throw new Error('Suspended idle scene submitted another completed frame');
    await call('napaliControl.suspend(false)');
    const resumed = await wait('Resume completes one actual frame then idles', value => isIdle(value) && value.control.frames > beforeSuspend.control.frames);
    if (resumed.control.frames !== beforeSuspend.control.frames + 1) throw new Error('Resume pumped more than one frame');
    const resumedPixels = await capture('resume-one-fresh-frame');
    pass('suspend-resume-completes-one-fresh-frame', { beforeSuspend, suspended, resumed, comparison: compare(explicit.capture, resumedPixels) });

    if (process.env.LIJIANG_NATIVE_IDLE_FREE === '1') {
      const free = await fresh('free-pose-one-fresh-frame', `napaliDrive.setMode('free');napaliDrive.move({forward:3,right:1,up:0});napaliDrive.look({yawDelta:.015,pitchDelta:.01});true`);
      const a = resumed.completed.camera, b = free.result.after.completed.camera;
      if (Math.hypot(...b.map((v, i) => v - a[i])) < .1) throw new Error('Public free-drive API did not change the actual rendered camera');
      pass('own-window-public-free-pose-api-renders-one-fresh-frame', { ...free.result, comparison: compare(resumedPixels, free.capture) });
      const returned = await fresh('return-flight-one-fresh-frame', `napaliDrive.setMode('flight');napaliControl.seek(45);true`);
      pass('return-to-flight-idles-after-one-fresh-frame', returned.result);
    }
    report.finalIdle = await state();
    await call('napaliControl.suspend(true)');report.finalSuspended = await state();
    report.status = 'passed';
  } catch (error) {
    report.status = 'failed';report.errors.push(String(error.stack || error));
    try { if (await call('!!window.napaliControl')) { await capture('failure');await call('napaliControl.suspend(true)'); } } catch { /* Own crashed/lost context may not allow another capture. */ }
  }
  report.elapsedSeconds = (Date.now() - started) / 1000;report.presentation = getPresentation();
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(report, null, 2));
  progress('finished', report.finalSuspended || null);
  record('native-idle-acceptance-result', { status: report.status, output, tests: report.tests.length, errors: report.errors });
  return report;
}
module.exports = { runLijiangNativeIdleAcceptance };
