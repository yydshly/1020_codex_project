'use strict';

// Only the caller's invisible Electron client receives native Chromium input.
// All artifacts/profile data are task-owned C: paths. No service is launched by
// this runner, and no original source/A/B document or external session is used.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { nativeImage } = require('electron');
const ROOT = 'C:\\Users\\yun68\\CodexTaskArtifacts\\014-lijiang-native-client-qa';
const ENTRY = 'http://127.0.0.1:8796/projects/014-programmable-worlds/web/lijiang-native/index.html';
const BRIDGE = 'http://127.0.0.1:8798';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const invariant = (value, message) => { if (!value) throw new Error(message); };
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const distance = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
async function bounded(promise, ms, label) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(label + ' timed out')), ms); })]); }
  finally { clearTimeout(timer); }
}
function assertEntry(url) {
  const actual = new URL(url), expected = new URL(ENTRY);
  invariant(actual.origin === expected.origin && actual.pathname === expected.pathname && actual.searchParams.get('qa') === '1' && actual.searchParams.get('embed') === '1' && !actual.searchParams.has('qualityview'), 'Native client QA must use the production client entry with qa=1, deferred embedded startup and no quality-view override');
  return actual.href;
}
function assertMedia(sample) {
  const s = sample.state, m = sample.media;
  invariant(s?.sceneId === 'lijiang-native' && s.ready && s.connected && s.duration === 45 && s.scale === 1 && !s.autoQuality && s.frames >= 3, 'Actual native renderer/client is not ready at original quality');
  invariant(m?.mediaStream && m.liveTracks === 1 && m.width >= 640 && m.height >= 360 && m.readyState >= 2 && s.video?.decodedFrames >= 3 && s.video.decodedCounter === 'requestVideoFrameCallback', 'Actual native MediaStream video/decoded frame evidence is missing');
  const p = s.presentation, c = sample.finalCanvas;
  invariant(p?.kind === 'lossless-live-renderer-frames' && p.ready && p.sessionMatches && p.pixelsVerified && p.actualFrame >= 1 && p.receivedFrames >= 1 && p.width >= 640 && p.height >= 360 && /^[a-f0-9]{64}$/.test(p.pixelSha256 || '') && /^[a-f0-9]{64}$/.test(p.pngSha256 || '') && !p.error, 'The final native presentation is not a verified original-pixel live renderer frame');
  invariant(c && !c.hidden && c.width === p.width && c.height === p.height && Number(c.frame) === p.actualFrame, 'Final native canvas does not match its actual lossless frame tag');
  invariant(!s.viewportTransition && s.viewport?.revision === 'native-live-viewport-1' && s.viewport.busy === false && p.viewportMatches && p.viewportEpoch === s.viewportTarget?.epoch && p.width === s.viewportTarget.width && p.height === s.viewportTarget.height && s.viewport.renderWidth === p.width && s.viewport.renderHeight === p.height, 'Native presentation has not completed its actual renderer viewport transition');
  invariant(!sample.aliases.sourceLive && !sample.aliases.napaliControl && !sample.aliases.napaliDrive, 'Native player incorrectly exposes original-source aliases');
  invariant(s.engineProvenance?.sceneId === 'lijiang-native' && s.engineProvenance.renderer === 'source-derived-full-glsl', 'Native video has no actual engine provenance');
  const rendererEntry = new URL(s.nativeProvenance?.sourceURL || 'about:blank');
  invariant(rendererEntry.pathname.endsWith('/lijiang-native/engine.html') && rendererEntry.searchParams.get('bandpx') === '12000' && !rendererEntry.searchParams.has('qualityview'), 'Native client is connected to a quality-probe camera instead of the production engine path');
  return sample;
}
function assertLayout(layout) {
  invariant(Math.abs(layout.width - 390) <= 1 && Math.abs(layout.height - 844) <= 1 && !layout.overflow, 'Native phone viewport has overflow or exceeds one pixel of OSR rounding');
  const required = ['play', 'replay', 'mode', 'final-shot', 'shot', 'timeline', 'parameters', 'clean', 'record'];
  invariant(required.every(id => layout.controls.some(c => c.id === id && !c.disabled)), 'A required native phone control is missing or disabled');
  invariant(layout.controls.every(c => c.rect.left >= -1 && c.rect.right <= layout.width + 1 && c.rect.top >= -1 && c.rect.bottom <= layout.height + 1 && c.hit), 'Native phone control is clipped or covered');
  invariant(layout.intersections.length === 0, 'Native phone controls overlap');
  return layout;
}
function imageDifference(a, b) {
  const x = a.getSize(), y = b.getSize(); invariant(x.width === y.width && x.height === y.height, 'Native video changed dimensions during pixel comparison');
  const p = a.toBitmap(), q = b.toBitmap(); let total = 0, n = 0;
  for (let row = 0; row < 48; row++) for (let col = 0; col < 64; col++) {
    const px = Math.floor(x.width * (.05 + .9 * (col + .5) / 64)), py = Math.floor(x.height * (.05 + .9 * (row + .5) / 48)), i = (py * x.width + px) * 4;
    for (let channel = 0; channel < 3; channel++) { total += Math.abs(p[i + channel] - q[i + channel]); n++; }
  }
  return total / n;
}
async function runLijiangNativeClientAcceptance({ window, backend, record = () => {}, getFatal = () => null, getPresentation = () => null }) {
  const began = Date.now(), runId = new Date(began).toISOString().replace(/[:.]/g, '-'), output = path.join(ROOT, runId);
  fs.mkdirSync(output, { recursive: true });
  const report = { runId, status: 'running', scene: 'lijiang-native-client', backend, output, tests: [], captures: [], samples: [], errors: [], pixelIntegrityChecks: [], artworkQualityAccepted: false, scope: 'Actual original-pixel lossless native canvas and independent WebRTC evidence, controls, parameter pixels, phone UI, real touch restore and standard 2700-frame export cancellation. No source/A/B changes, completed native full-film claim or artwork-quality acceptance.', windowPolicy: { show: false, focusable: false, skipTaskbar: true, ...getPresentation() }, shortFilmQA: { tested: false, reason: 'Producer six-frame decoding evidence is separate; no additional QA HTTP recording route or second renderer is created.' } };
  const progressPath = path.join(ROOT, 'status.json'), latestPath = path.join(ROOT, 'latest.' + backend + '.json'), canonicalPath = path.join(ROOT, 'acceptance.' + backend + '.json');
  const initTimeout = Math.max(180000, Math.min(1800000, Number(process.env.LIJIANG_NATIVE_CLIENT_TIMEOUT_MS) || 1200000));
  let ownSessionRequested = false, initiallyActive = null, lastSample = 0, lastPixelMetadata = null;
  function policy() { invariant(!window.isDestroyed() && !window.isVisible() && !window.isFocused(), 'Own native-client QA window became destroyed, visible or focused'); }
  async function call(code, label = 'Own hidden native client', timeout = 60000, allowFatal = false) {
    policy(); if (!allowFatal && getFatal()) throw new Error(getFatal());
    const value = await bounded(window.webContents.executeJavaScript(code, false), timeout, label); policy(); return value;
  }
  function progress(phase, state = null) {
    fs.writeFileSync(progressPath, JSON.stringify({ ...report, phase, state, elapsedSeconds: (Date.now() - began) / 1000 }, null, 2));
    record('lijiang-native-client-qa-progress', { phase, seconds: (Date.now() - began) / 1000 });
  }
  function pass(name, evidence) { report.tests.push({ name, passed: true, evidence }); }
  const healthCode = `fetch('${BRIDGE}/health',{cache:'no-store',signal:AbortSignal.timeout(5000)}).then(r=>{if(!r.ok)throw new Error('Native bridge unavailable');return r.json();})`;
  async function read() {
    const sample = await call(`(async()=>{const v=document.getElementById('live-video'),c=document.getElementById('lossless-frame');return {url:location.href,state:window.lijiangWorld?.getState()||null,aliases:{sourceLive:!!window.sourceLive,napaliControl:!!window.napaliControl,napaliDrive:!!window.napaliDrive},finalCanvas:c?{width:c.width,height:c.height,hidden:c.hidden,frame:c.dataset.frame}:null,media:v?{width:v.videoWidth,height:v.videoHeight,readyState:v.readyState,mediaStream:v.srcObject instanceof MediaStream,liveTracks:v.srcObject?.getTracks().filter(t=>t.readyState==='live').length||0}:null,bridge:await ${healthCode}};})()`, 'Read actual lossless canvas, independent media track and bridge');
    assertEntry(sample.url);
    if (Date.now() - lastSample > 1800) {
      const s = sample.state;
      report.samples.push({ ms: Date.now() - began, phase: s?.phase, frames: s?.frames, time: s?.time, paused: s?.paused, mode: s?.drive?.mode, decodedFrames: s?.video?.decodedFrames, actualLosslessFrame: s?.presentation?.actualFrame, losslessReceivedFrames: s?.presentation?.receivedFrames, actualLosslessTime: s?.presentation?.actualTime, fps: s?.fps, recorderPhase: s?.recorder?.phase, submittedFrames: s?.recorder?.frameCount, bridgeActive: sample.bridge.sessionActive, presentation: getPresentation() }); lastSample = Date.now();
    }
    return sample;
  }
  async function wait(predicate, label, timeout = 180000) {
    const until = Date.now() + timeout; let sample, previous = 0;
    while (Date.now() < until) {
      sample = await read();
      if (sample.state?.error) throw new Error(sample.state.error);
      if (predicate(sample)) return sample;
      if (Date.now() - previous > 3000) { progress(label, sample); previous = Date.now(); }
      await sleep(300);
    }
    throw new Error(label + ' timed out: ' + JSON.stringify(sample));
  }
  async function renderedAfter(before, label, frames = 2) {
    const target = before.frames + frames, previous = before.presentation?.receivedFrames || 0;
    return wait(s => s.state?.frames >= target && s.state.ready && !s.state.viewportTransition && s.state.presentation?.ready && s.state.presentation.viewportMatches && s.state.presentation.actualFrame >= target && s.state.presentation.receivedFrames > previous && (!before.paused || Math.abs(s.state.presentation.actualTime - before.time) < 1e-6), label + ' arrives as a verified original-pixel frame');
  }
  async function videoImage() {
    const snapshot = await call(`(()=>{const c=document.getElementById('lossless-frame'),p=window.lijiangWorld.getState().presentation;if(!p?.ready||!p.pixelsVerified||c.hidden||Number(c.dataset.frame)!==p.actualFrame)throw new Error('No verified actual native presentation frame');return {data:c.toDataURL('image/png'),presentation:p};})()`, 'Read final native lossless canvas pixels and exact frame tag');
    const image = nativeImage.createFromDataURL(snapshot.data), size = image.getSize(); invariant(!image.isEmpty() && size.width >= 640 && size.height >= 360, 'Native lossless presentation capture is empty');
    const pixelSha256 = sha(image.toBitmap()); invariant(pixelSha256 === snapshot.presentation.pixelSha256, 'Final canvas pixels differ from the source renderer PNG pixel hash');
    lastPixelMetadata = { ...snapshot.presentation, finalCanvasPixelSha256: pixelSha256 }; report.pixelIntegrityChecks.push({ actualFrame: snapshot.presentation.actualFrame, actualTime: snapshot.presentation.actualTime, sourcePixelSha256: snapshot.presentation.pixelSha256, finalCanvasPixelSha256: pixelSha256, pngTransportSha256: snapshot.presentation.pngSha256, width: size.width, height: size.height }); return image;
  }
  async function capture(name, { page = true, frame = true } = {}) {
    const item = { name, atMs: Date.now() - began };
    if (frame) { const image = await videoImage(), bytes = image.toPNG(), file = path.join(output, name + '-canvas.png'); fs.writeFileSync(file, bytes); item.presentation = { path: file, sha256: sha(bytes), ...image.getSize(), frameMetadata: lastPixelMetadata }; }
    if (page) { policy(); const image = await bounded(window.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true }), 30000, 'Hidden native page capture'); policy(); const bytes = image.toPNG(), file = path.join(output, name + '-page.png'); fs.writeFileSync(file, bytes); item.page = { path: file, sha256: sha(bytes), ...image.getSize() }; }
    item.state = (await read()).state; report.captures.push(item); return item;
  }
  async function nativeDrag() {
    const start = await call(`(()=>{const r=document.getElementById('viewport').getBoundingClientRect();return {x:Math.round(r.left+r.width*.5),y:Math.round(r.top+r.height*.45)};})()`), end = { x: start.x + 66, y: start.y - 20 };
    policy(); window.webContents.sendInputEvent({ type: 'mouseDown', ...start, button: 'left', clickCount: 1 }); await sleep(35);
    policy(); window.webContents.sendInputEvent({ type: 'mouseMove', ...end, button: 'left', buttons: ['left'] }); await sleep(45);
    policy(); window.webContents.sendInputEvent({ type: 'mouseUp', ...end, button: 'left', clickCount: 1 }); policy(); return { start, end, scope: 'native Chromium input to own hidden webContents only' };
  }
  async function nativeTouch() {
    const point = await call(`(()=>{const r=document.getElementById('viewport').getBoundingClientRect();return {x:r.left+r.width*.5,y:r.top+r.height*.5};})()`), protocol = window.webContents.debugger;
    const alreadyAttached = protocol.isAttached(), hadTouch = await call('navigator.maxTouchPoints>0', 'Read own renderer touch capability'); policy(); if (!alreadyAttached) protocol.attach('1.3');
    try {
      if (!hadTouch) { policy(); await bounded(protocol.sendCommand('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 }), 30000, 'Enable touch only in own hidden Chromium target'); }
      policy(); await bounded(protocol.sendCommand('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...point, id: 23, radiusX: 1, radiusY: 1, force: 1 }] }), 30000, 'Own hidden Chromium touch start');
      await sleep(50); policy(); await bounded(protocol.sendCommand('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }), 30000, 'Own hidden Chromium touch end'); policy();
    } finally { try { if (!hadTouch && protocol.isAttached()) await bounded(protocol.sendCommand('Emulation.setTouchEmulationEnabled', { enabled: false }), 30000, 'Restore own hidden renderer touch mode'); } finally { if (!alreadyAttached && protocol.isAttached()) protocol.detach(); } }
    return { point, scope: 'CDP native touch to own hidden webContents; no system mouse/keyboard' };
  }
  async function layout() {
    return call(`(()=>{const controls=[...document.querySelectorAll('.transport button,.transport input,.transport select,.settings button')].filter(e=>e.getClientRects().length&&getComputedStyle(e).display!=='none').map(e=>{const r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return {id:e.id,move:e.dataset.move||null,disabled:e.disabled,rect:r.toJSON(),hit:hit===e||e.contains(hit)};}),intersections=[];for(let i=0;i<controls.length;i++)for(let j=i+1;j<controls.length;j++){const a=controls[i].rect,b=controls[j].rect,area=Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));if(area>.5)intersections.push({a:controls[i].id||controls[i].move,b:controls[j].id||controls[j].move,area});}const p=document.getElementById('settings-panel'),last=document.getElementById('setting-colorTemperature'),r=last.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return {width:innerWidth,height:innerHeight,overflow:document.documentElement.scrollWidth>innerWidth+1,controls,intersections,panel:{hidden:p.hidden,display:getComputedStyle(p).display,rect:p.getBoundingClientRect().toJSON(),scrollHeight:p.scrollHeight,clientHeight:p.clientHeight,scrollTop:p.scrollTop,lastSlider:r.toJSON(),lastSliderHit:hit===last},transport:document.querySelector('.transport').getBoundingClientRect().toJSON()};})()`, 'Measure actual phone controls and settings scroll');
  }
  try {
    report.entry = assertEntry(await call('location.href'));
    const initial = await call(healthCode, 'Check native bridge ownership before starting');
    initiallyActive = !!initial.sessionActive; report.initialBridge = initial;
    invariant(initial.service === 'lijiang-native-bridge' && initial.version >= 5 && initial.capabilities?.includes('native-lossless-live-frames') && initial.capabilities.includes('native-live-viewport') && initial.backend === 'gl', 'Native viewport bridge v5 is not ready; launch it separately before QA');
    invariant(!initiallyActive, 'Native bridge already has another active session; this QA leaves it untouched');
    ownSessionRequested = true; await call('window.lijiangWorld.setVisible(true)', 'Start only own deferred native client');
    let sample = await wait(s => s.state?.ready && s.state.frames >= 3 && s.state.video.decodedFrames >= 3, 'Actual native WebRTC first complete frames', initTimeout);
    assertMedia(sample); pass('actual-production-native-lossless-canvas-with-independent-WebRTC-and-provenance', sample);
    await call(`document.getElementById('final-shot').click()`, 'Actual native 45-second shot button');
    sample = await wait(s => s.state?.time === 45 && s.state.paused && s.state.drive?.mode === 'flight', 'Actual native final shot and pause');
    const held = sample.state; sample = await renderedAfter(held, 'Actual held final pose continues rendering');
    invariant(sample.state.time === 45 && sample.state.paused, 'Native pause did not hold the actual 45-second camera');
    pass('actual-final-shot-pause-and-subsequent-rendered-video', { before: held, after: sample.state });
    await call(`document.getElementById('mode').click()`, 'Actual native free-observation button');
    const free = (await wait(s => s.state?.drive?.mode === 'free', 'Actual native free camera')).state;
    const pointer = await nativeDrag();
    const turned = (await wait(s => Math.abs(s.state?.drive?.yaw - free.drive.yaw) > .001 || Math.abs(s.state?.drive?.pitch - free.drive.pitch) > .001, 'Native pointer drives actual GL camera')).state;
    await call(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'w',code:'KeyW',bubbles:true,cancelable:true}))`, 'Own native client DOM W down');
    try { await sleep(350); } finally { await call(`window.dispatchEvent(new KeyboardEvent('keyup',{key:'w',code:'KeyW',bubbles:true}))`, 'Own native client DOM W up'); }
    const moved = (await wait(s => distance(s.state?.drive?.position || [], turned.drive.position) > .05, 'Held native W changes actual renderer position')).state;
    sample = await renderedAfter(moved, 'Native free camera reaches actual video');
    pass('actual-native-pointer-and-held-W-move-look', { before: free.drive, turned: turned.drive, moved: sample.state.drive, pointer, heldMilliseconds: 350 });
    await call(`(()=>{const s=document.getElementById('shot');s.value='12';s.dispatchEvent(new Event('change',{bubbles:true}));})()`, 'Actual native 12-second shot selector');
    sample = await wait(s => s.state?.time === 12 && s.state.paused && s.state.drive?.mode === 'flight', 'Native selector returns from free mode to held path');
    await call(`document.getElementById('play').click()`, 'Actual native resume button');
    const resumed = await wait(s => !s.state?.paused && s.state.time > 12.05 && s.state.frames > sample.state.frames, 'Native resumed flight advances actual time and rendered frames');
    pass('actual-native-shot-selector-and-resume', { before: sample.state, after: resumed.state });
    await call(`document.getElementById('final-shot').click()`, 'Return to stable production final pose for parameter pixels');
    sample = await wait(s => s.state?.time === 45 && s.state.paused && s.state.settings?.expo !== undefined, 'Native settings and stable final pose available');
    await renderedAfter(sample.state, 'Production final view for pixel baseline');
    const baseline = await videoImage(), originalExpo = (await read()).state.settings.expo;
    await capture('desktop-final', { page: true, frame: true });
    await call(`document.getElementById('parameters').click()`, 'Open actual native parameter panel');
    const changedExpo = originalExpo <= 1.3 ? 1.75 : .65, beforeSetting = (await read()).state;
    await call(`(()=>{const e=document.getElementById('setting-expo');e.value=${JSON.stringify(String(changedExpo))};e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`, 'Actual native exposure slider input/change');
    sample = await wait(s => Math.abs(s.state?.settings?.expo - changedExpo) < 1e-8, 'Exposure roundtrips through authenticated native settings');
    await renderedAfter({ ...beforeSetting, frames: Math.max(beforeSetting.frames, sample.state.frames) }, 'Changed native exposure reaches actual video');
    const changed = await videoImage(), changedDifference = imageDifference(baseline, changed);
    invariant(changedDifference > 1, 'Native exposure control did not change actual video pixels');
    await capture('exposure-changed', { page: false, frame: true });
    const restoreBefore = (await read()).state;
    await call(`window.lijiangWorld.setSettings({expo:${JSON.stringify(originalExpo)}})`, 'Restore original actual native exposure');
    sample = await wait(s => Math.abs(s.state?.settings?.expo - originalExpo) < 1e-8, 'Original exposure restored in actual settings');
    await renderedAfter({ ...restoreBefore, frames: Math.max(restoreBefore.frames, sample.state.frames) }, 'Restored native exposure reaches actual video');
    const restoredDifference = imageDifference(baseline, await videoImage());
    invariant(restoredDifference < Math.max(1.5, changedDifference * .5), 'Native exposure pixels did not return toward the original frame');
    await capture('exposure-restored', { page: false, frame: true });
    pass('actual-native-exposure-slider-roundtrip-changes-and-restores-video-pixels', { originalExpo, changedExpo, meanAbsoluteRGBDifference: changedDifference, restoredDifference, actualSettings: (await read()).state.settings });
    const fps = await wait(s => s.state?.fpsSample?.frameDelta > 0 && s.state.fpsSample.elapsedMs >= 8000 && s.state.fpsSample.windowTargetMs === 10000, 'Actual rolling renderer-frame FPS sample');
    const meter = fps.state.fpsSample; invariant(Math.abs(fps.state.fps - meter.frameDelta * 1000 / meter.elapsedMs) < 1e-6, 'FPS does not match actual renderer frame/time differences');
    pass('FPS-is-measured-from-real-renderer-frames-not-video-callback-count', { fps: fps.state.fps, sample: meter, decodedFrames: fps.state.video.decodedFrames });
    await call(`document.getElementById('settings-close').click()`, 'Close desktop settings before phone control bounds');
    const beforePhone = (await read()).state;
    policy(); window.setContentSize(390, 844); policy(); await call('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r(true))))', 'Phone layout settles');
    const portrait = await wait(s => s.state?.ready && !s.state.viewportTransition && s.state.viewport?.busy === false && s.state.viewportTarget?.mode === 'portrait' && s.state.presentation?.viewportMatches && s.state.presentation.width === s.state.viewportTarget.width && s.state.presentation.height === s.state.viewportTarget.height && s.state.presentation.receivedFrames > beforePhone.presentation.receivedFrames, 'Actual phone renderer portrait dimensions and fresh lossless frame');
    invariant(portrait.state.presentation.height > portrait.state.presentation.width && Math.abs(portrait.state.presentation.width / portrait.state.presentation.height - portrait.state.viewportTarget.aspect) < .003, 'Phone uses a landscape frame or cropped substitute instead of the native portrait renderer');
    pass('actual-phone-native-renderer-portrait-pixel-budget-and-fresh-frame', { before: beforePhone.viewport, after: portrait.state.viewport, target: portrait.state.viewportTarget, presentation: portrait.state.presentation });
    const phone = assertLayout(await layout()); await capture('phone-ui', { page: true, frame: false });
    await call(`document.getElementById('parameters').click()`, 'Open actual phone settings');
    const panelTop = await layout();
    invariant(!panelTop.panel.hidden && panelTop.panel.display !== 'none' && panelTop.panel.rect.height > 45 && panelTop.panel.rect.bottom <= panelTop.transport.top - 10 && panelTop.panel.scrollHeight > panelTop.panel.clientHeight + 1, 'Actual phone settings do not scroll above the main controls');
    await call(`(()=>{const p=document.getElementById('settings-panel');p.scrollTop=p.scrollHeight;return p.scrollTop;})()`, 'Actually scroll native phone parameter panel');
    const panelBottom = assertLayout(await layout());
    invariant(panelBottom.panel.scrollTop > 0 && panelBottom.panel.lastSliderHit && panelBottom.panel.lastSlider.bottom <= panelBottom.panel.rect.bottom + 1, 'Last actual phone slider cannot be reached by scrolling');
    await capture('phone-settings-scrolled', { page: true, frame: false });
    pass('actual-390-phone-controls-fit-and-settings-scroll-without-covering-controls', { phone, panelTop, panelBottom });
    await call(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'h',code:'KeyH',bubbles:true,cancelable:true}))`, 'Actual own client H hides chrome');
    const clean = await call(`({state:window.lijiangWorld.getState(),chrome:[...document.querySelectorAll('.chrome')].map(e=>({display:getComputedStyle(e).display,visible:!!e.getClientRects().length})),fpsVisible:!!document.getElementById('fps').getClientRects().length})`, 'Measure all native clean-frame chrome');
    invariant(clean.state.uiHidden && clean.state.parametersOpen && clean.chrome.every(c => c.display === 'none' && !c.visible) && !clean.fpsVisible, 'H did not hide actual native controls, FPS and open settings');
    await capture('phone-clean', { page: true, frame: false });
    const touch = await nativeTouch();
    await wait(s => !s.state?.uiHidden && s.state.parametersOpen, 'Actual native touch restores prior open parameter panel');
    assertLayout(await layout()); pass('actual-H-and-native-touch-restore-open-panel-and-controls', { clean, touch, after: (await read()).state });
    await call(`window.lijiangWorld.setMode('free')`, 'Hold a distinct free pose for real standard-export cancellation');
    await call(`window.lijiangWorld.drive({forward:6,right:2,up:3,yaw:.08})`, 'Set actual native free pose through real bridge');
    const pose = (await read()).state; await renderedAfter(pose, 'Pre-export actual free pose and original accumulator');
    const beforeExport = (await read()).state, beforePixels = await videoImage();
    invariant(beforeExport.paused && beforeExport.time === 45 && beforeExport.parametersOpen && !beforeExport.uiHidden && beforeExport.drive.mode === 'free', 'Standard cancellation must start from a held free pose with visible open settings');
    await call(`document.getElementById('record').click()`, 'Start actual standard 2700-frame export through DOM');
    const encoding = await wait(s => s.state?.recording && s.state.recorder?.phase === 'encoding' && s.state.recorder.frameCount >= 2, 'Actual standard export submits two real 1080p frames', 300000);
    const captureState = encoding.state.recorder;
    invariant(!captureState.qaTestOnly && captureState.totalFrames === 2700 && captureState.width === 1920 && captureState.height === 1080 && captureState.fps === 60 && captureState.duration === 45 && encoding.state.renderSize.width === 1920 && encoding.state.renderSize.height === 1080, 'Standard export was shortened, reduced or replaced with a QA job');
    const locks = await call(`(async()=>({cameraError:await window.lijiangWorld.seek(12).then(()=>null,e=>e.message),settingsError:await window.lijiangWorld.setSettings({expo:1.1}).then(()=>null,e=>e.message),allSlidersDisabled:[...document.querySelectorAll('[data-setting]')].every(e=>e.disabled),cancelVisible:!!document.getElementById('cancel-record').getClientRects().length}))()`, 'Check actual recording input/parameter lock');
    locks.scope = 'Client API preflight rejections and disabled real controls, plus actual engine settingsState.recordingLocked. Authenticated bridge HTTP 409 rejection is covered by the separate CPU contract, not exercised here.';
    invariant(locks.cameraError && locks.settingsError && locks.allSlidersDisabled && locks.cancelVisible && encoding.state.settingsState?.recordingLocked, 'Native recording failed to lock camera/settings or expose actual Cancel');
    await sleep(250); const cancelAt = performance.now();
    await call(`document.getElementById('cancel-record').click()`, 'Actual standard export Cancel button');
    const cancelled = await wait(s => s.state?.recorder?.phase === 'cancelled' && !s.state.recording, 'Cancel waits for native capture and restores the saved live scene', 180000);
    const afterExport = cancelled.state, restoration = afterExport.recorder.restoration;
    invariant(restoration?.restored && afterExport.time === beforeExport.time && afterExport.paused === beforeExport.paused && afterExport.drive.mode === beforeExport.drive.mode && distance(afterExport.drive.position, beforeExport.drive.position) < 1e-6 && Math.abs(afterExport.drive.yaw - beforeExport.drive.yaw) < 1e-8 && Math.abs(afterExport.drive.pitch - beforeExport.drive.pitch) < 1e-8 && !afterExport.uiHidden && afterExport.parametersOpen, 'Native standard cancellation did not restore time, pause, free pose and UI');
    invariant(afterExport.renderSize.width === beforeExport.renderSize.width && afterExport.renderSize.height === beforeExport.renderSize.height && restoration.canvas.width === restoration.originalCanvas.width && restoration.canvas.height === restoration.originalCanvas.height && restoration.renderSize.width === restoration.originalRenderSize.width && restoration.renderSize.height === restoration.originalRenderSize.height, 'Native cancellation did not restore original canvas/accumulator dimensions');
    sample = await renderedAfter(afterExport, 'Restored native live renderer really continues', 1);
    invariant(sample.state.presentation.width === beforeExport.presentation.width && sample.state.presentation.height === beforeExport.presentation.height && sample.state.presentation.pixelsVerified, 'Actual original-pixel canvas dimensions were not restored after capture');
    const restoredFreePixels = imageDifference(beforePixels, await videoImage());
    invariant(restoredFreePixels < 3, 'Cancelled native export did not restore the held free-view video');
    assertLayout(await layout()); await capture('phone-after-standard-cancel', { page: true, frame: false });
    pass('actual-standard-2700-job-two-submitted-frames-cancel-restores-original-live-view', { before: beforeExport, encoding: encoding.state, locks, after: afterExport, later: sample.state, cancelSeconds: (performance.now() - cancelAt) / 1000, restoredFreePixels, scope: 'Cancellation was requested while the standard encoder remained active after at least two submitted real frames. No completed full-film or exact GPU-command-boundary claim.' });
    report.status = 'passed';
  } catch (error) {
    report.status = 'failed'; report.errors.push(String(error.stack || error));
    try { policy(); const bytes = (await bounded(window.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true }), 30000, 'Hidden native failure page')).toPNG(); policy(); const file = path.join(output, 'failure-page.png'); fs.writeFileSync(file, bytes); report.failurePage = { path: file, sha256: sha(bytes) }; } catch (captureError) { report.errors.push('Failure capture: ' + captureError.message); }
  } finally {
    try {
      await call('window.lijiangWorld?.dispose()', 'Await own client recording/session retirement', 240000, true);
      const deadline = Date.now() + 30000; let health;
      do { health = await call(healthCode, 'Verify own native bridge retirement', 15000, true); if (!ownSessionRequested || !health.sessionActive) break; await sleep(300); } while (Date.now() < deadline);
      const disposed = await call(`(()=>{const c=document.getElementById('lossless-frame');return {state:window.lijiangWorld?.getState(),media:document.getElementById('live-video')?.srcObject||null,canvas:c?{hidden:c.hidden,width:c.width,height:c.height,frame:c.dataset.frame}:null};})()`, 'Verify disposed track and cleared original-pixel canvas', 30000, true);
      invariant(disposed.state?.disposed && !disposed.state.ready && !disposed.media && disposed.canvas?.hidden && disposed.canvas.width === 1 && disposed.canvas.height === 1 && !disposed.canvas.frame, 'Own native client retained media or old-session pixels after awaited dispose');
      if (ownSessionRequested) invariant(!health.sessionActive, 'Own native bridge renderer/session remained active after awaited disposal');
      report.retirement = { health, client: disposed.state, ownSessionRequested, initiallyActive }; pass(ownSessionRequested ? 'awaited-dispose-stops-own-session-and-leaves-bridge-idle' : 'deferred-client-disposed-without-starting-or-stopping-an-external-session', report.retirement);
    } catch (error) { report.status = 'failed'; report.errors.push('Retirement: ' + String(error.stack || error)); }
  }
  report.elapsedSeconds = (Date.now() - began) / 1000; report.presentation = getPresentation(); report.reportPath = path.join(output, 'result.json'); report.progressPath = progressPath;
  const serialized = JSON.stringify(report, null, 2) + '\n'; fs.writeFileSync(report.reportPath, serialized); fs.writeFileSync(latestPath, serialized); if (report.status === 'passed') fs.writeFileSync(canonicalPath, serialized); progress(report.status);
  return report;
}

module.exports = { runLijiangNativeClientAcceptance, contracts: { ROOT, ENTRY, BRIDGE, assertEntry, assertMedia, assertLayout, imageDifference } };
