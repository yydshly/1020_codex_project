'use strict';

// This runner only operates the caller's hidden localhost webContents. Native
// Chromium input below never moves the system cursor or focuses a window.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { nativeImage } = require('electron');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const BASE = 'http://127.0.0.1:8796/projects/014-programmable-worlds/web/';
const OLD_MODEL = '819b849b252ff22970c66e6349cf9eb4f470ad1ec775260e355ab2480c7da227';
const WINDOW_LIGHTING = '80836c3f6f8529ef088136e9628e75e100a820760c3c27c148ade87356a01b34';
const STATION_LIGHTING = '62d64e53da7ccf5775e19ee4c704a2c3c105a7dafa9bae52fbc8cce8d889610c';
const STATION_MANIFEST = '97eb5a39b308d200f0011f9732725a812b7794cca48553178a11e4841b0f882e';
const SCENE_ASSET = /\.(?:png|jpe?g|webp|avif|gif|hdr|exr|glb|gltf|obj|fbx|ktx2?|dds|tga)(?:[?#]|$)/i;

function invariant(value, message) { if (!value) throw new Error(message); }
function distance(a, b) { return Math.hypot(...a.map((v, i) => v - b[i])); }
function sha256(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
async function bounded(promise, ms, label) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(label + ' timed out')), ms); })]); }
  finally { clearTimeout(timer); }
}
function statistics(image) {
  const size = image.getSize(), pixels = image.toBitmap();
  invariant(!image.isEmpty() && size.width > 0 && size.height > 0, 'Empty captured image');
  let sum = 0, square = 0, n = 0;
  for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) {
    const px = Math.min(size.width - 1, Math.floor(size.width * (.08 + .84 * (x + .5) / 48)));
    const py = Math.min(size.height - 1, Math.floor(size.height * (.08 + .72 * (y + .5) / 48)));
    const i = (py * size.width + px) * 4, l = .2126 * pixels[i + 2] + .7152 * pixels[i + 1] + .0722 * pixels[i];
    sum += l; square += l * l; n++;
  }
  const mean = sum / n;
  return { ...size, meanLuminance: mean, luminanceStdDev: Math.sqrt(Math.max(0, square / n - mean * mean)) };
}
function assertEntryMap(entries) {
  invariant(Array.isArray(entries) && entries.length === 4, 'Exactly four production hub entries are required');
  const urls = entries.map(entry => new URL(entry, BASE));
  const expected = ['runtime/source-live.html', 'canal-real/index.html', 'shipyard-station/index.html', 'lijiang-flythrough/build/index.html'];
  invariant(urls.every((url, i) => url.origin === new URL(BASE).origin && url.pathname === new URL(expected[i], BASE).pathname), 'Production source/window/station/Lijiang entry paths or origin changed');
  invariant(urls.every(url => url.searchParams.get('embed') === '1'), 'All four inline entries must use embed=1');
  invariant(urls[1].searchParams.get('experience') === 'window' && urls[1].searchParams.get('giSet') === 'r5' && urls[1].searchParams.get('gi') !== '0', 'Canal entry is not the production r5 window world');
  invariant(!urls[2].searchParams.has('experience') && urls[3].searchParams.get('revision') === '3', 'Independent station or production Lijiang revision changed');
  return urls.map(url => url.href);
}
function worldIdentity(preview) {
  const s = preview.state || {}, lighting = s.lighting || {}, station = preview.index === 2;
  const sceneId = station ? 'shipyard-station' : 'canal-street', entry = new URL(preview.href);
  invariant(preview.kind === (station ? 'shipyard-station' : 'canal-real') && s.sceneId === sceneId, 'Actual world API and scene identity disagree');
  invariant(entry.pathname === new URL(station ? 'shipyard-station/index.html' : 'canal-real/index.html', BASE).pathname, 'Actual authored-world document path changed');
  invariant(lighting.mode === 'full-diffuse' && /^[a-f0-9]{64}$/.test(lighting.modelSha256 || ''), 'Authored world has no complete verified diffuse model');
  invariant(lighting.lightingFingerprint === (station ? STATION_LIGHTING : WINDOW_LIGHTING) && s.runtimeLighting?.lightingFingerprint === lighting.lightingFingerprint, 'Authored-world lighting identity changed');
  invariant(station ? lighting.modelSha256 !== OLD_MODEL : lighting.modelSha256 === OLD_MODEL && s.experience === 'window', 'Independent worlds were replaced by modes of the same model');
  if (station) {
    invariant(s.runtimeLighting.sceneId === 'shipyard-station' && lighting.model === 'shipyard-lightmapped.glb', 'Station does not expose its own model and light rig');
    invariant(s.inputRevision === 'station-manual-input-2' && s.runtimeRevision === 'shipyard-oak2048-aftdeck-2', 'Station production runtime changed');
    invariant(lighting.manifestSha256 === STATION_MANIFEST && String(lighting.manifestURL || '').endsWith('/shipyard-station/baked-r1/manifest-oak2048.json') && lighting.sampling?.some(g => g.key === 'ShipyardGI_Station_oiled_oak' && g.samples === 2048), 'Station final oak2048 package is absent');
  }
  const suffix = station ? '/shipyard-station/baked-r1/shipyard-lightmapped.glb' : '/canal-real/baked-r4/canal-lightmapped.glb';
  const modelUrl = (preview.resources || []).find(url => new URL(url).pathname.endsWith(suffix));
  invariant(modelUrl, 'Actual independent authored-world model request was not observed');
  return { sceneId, kind: preview.kind, entryUrl: entry.href, modelUrl, modelSha256: lighting.modelSha256, lightingFingerprint: lighting.lightingFingerprint, ...(station ? { manifestSha256: lighting.manifestSha256, runtimeRevision: s.runtimeRevision, inputRevision: s.inputRevision } : {}) };
}
function lijiangIdentity(preview) {
  const s = preview.state || {}, entry = new URL(preview.href);
  invariant(preview.kind === 'lijiang-flythrough' && s.sceneId === 'lijiang-flythrough' && s.runtimeRevision === 'lijiang-pure-code-3', 'Wrong actual Lijiang scene or runtime revision');
  invariant(entry.pathname === new URL('lijiang-flythrough/build/index.html', BASE).pathname && entry.searchParams.get('revision') === '3', 'Lijiang is not the actual production build entry');
  invariant(s.terrain?.version === 'lijiang-wooded-karst-3' && s.terrain.surfaceDetailRevision === 'short-joints-1', 'Stale Lijiang terrain or rock detail revision');
  invariant(s.externalSceneAssets === 0 && !(preview.resources || []).some(url => SCENE_ASSET.test(url)), 'Lijiang requested an external model, picture, texture or HDR');
  return { sceneId: s.sceneId, runtimeRevision: s.runtimeRevision, terrainVersion: s.terrain.version, surfaceDetailRevision: s.terrain.surfaceDetailRevision, externalSceneAssets: s.externalSceneAssets, entryUrl: entry.href, actualResourceRequests: preview.resources || [] };
}
function assertMobileLayout(layout) {
  invariant(Math.abs(layout.actualViewport.width - layout.requestedViewport.width) <= 1 && Math.abs(layout.actualViewport.height - layout.requestedViewport.height) <= 1, 'Phone viewport exceeds one pixel of Windows OSR rounding');
  invariant(!layout.parentOverflow && !layout.previewOverflow, 'Actual phone page or Lijiang document overflows horizontally');
  invariant(Math.abs(layout.frame.height - 620) <= 1 && layout.preview.height >= 618 && layout.preview.height <= 621, 'Lijiang phone iframe is not the 620px production preview');
  invariant(layout.frame.top >= -1 && layout.frame.bottom <= layout.actualViewport.height + 1, 'Phone Lijiang iframe is not fully in the actual viewport');
  const required = ['play', 'replay', 'mode', 'final-shot', 'parameters', 'clean', 'record', 'timeline'];
  invariant(required.every(id => layout.controls.some(b => b.id === id && !b.disabled)), 'A required actual phone control is missing or disabled');
  invariant(layout.controls.every(b => b.rect.left >= -1 && b.rect.right <= layout.preview.width + 1 && b.rect.top >= -1 && b.rect.bottom <= layout.preview.height + 1 && b.parentHitIsFrame && b.childHitIsControl), 'A phone control is clipped or covered by a parent/child element');
  invariant(layout.controlIntersections.length === 0, 'Actual phone controls overlap each other');
  invariant(!layout.notice, 'Lijiang displayed an action failure on phone');
  return layout;
}

async function runLijiangHubAcceptance({ window, projectDirectory, workspaceDirectory, backend, record = () => {}, getFatal = () => null, getPresentation = () => null }) {
  const started = Date.now(), runId = new Date(started).toISOString().replace(/[:.]/g, '-');
  const output = path.join(projectDirectory, 'assets', 'lijiang-hub-qa', runId), notes = path.join(projectDirectory, 'notes');
  const canonical = path.join(notes, 'lijiang-hub-acceptance.' + backend + '.json');
  const latest = path.join(notes, 'lijiang-hub-acceptance.' + backend + '.latest.json');
  const rawReportPath = path.join(output, 'result.json'), progressPath = path.join(workspaceDirectory, '.cache', 'lijiang-hub-qa-status.json');
  fs.mkdirSync(output, { recursive: true }); fs.mkdirSync(notes, { recursive: true }); fs.mkdirSync(path.dirname(progressPath), { recursive: true });
  const report = {
    runId, scene: 'lijiang-hub', backend, status: 'running', passed: false, tests: [], captures: [], errors: [], activations: [], timingSamples: [], mobileLayoutSamples: [], worldIdentities: {},
    peakObservedLiveSceneDocuments: 0, peakObservedOwnHeavyScenes: 0, externalSourceBridgeInitiallyActive: null,
    windowPolicy: { show: false, focusable: false, skipTaskbar: true, ...getPresentation() }, canonicalReportPath: canonical, latestReportPath: latest, rawReportPath,
    scope: 'Actual four production iframe entries and APIs; serial document/renderer lifecycle; Lijiang native input, controls, 375/390 phone layouts, clean-frame captures and a small cancelled encoder job. Previous full-flight and 1080p60 export reports remain separate. No artwork-quality claim.'
  };
  const activatedIndices = new Set();
  let externalBridge = null, ownSourceStarted = false;
  function policy() {
    invariant(!window.isDestroyed() && !window.isVisible() && !window.isFocused(), 'Own Lijiang hub QA window became destroyed, visible or focused');
  }
  function progress(phase, state = null) {
    fs.writeFileSync(progressPath, JSON.stringify({ ...report, phase, elapsedSeconds: (Date.now() - started) / 1000, application: state }, null, 2));
    record('lijiang-hub-qa-progress', { phase, elapsedSeconds: (Date.now() - started) / 1000 });
  }
  function pass(name, evidence) { report.tests.push({ name, passed: true, evidence }); }
  async function call(code, label = 'Own hidden Lijiang hub call', ms = 30000, allowFatal = false) {
    policy(); if (!allowFatal && getFatal()) throw new Error(getFatal());
    const result = await bounded(window.webContents.executeJavaScript(code, false), ms, label); policy(); return result;
  }
  const child = index => `document.querySelectorAll('iframe.world-frame')[${index}].contentWindow`;
  async function readState(ms = 60000) {
    const state = await call(`(async()=>({url:location.href,hub:window.worldHub?.getState()||null,bridge:await fetch('http://127.0.0.1:8797/health',{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error('Source bridge unavailable');return r.json();}),previews:[...document.querySelectorAll('iframe.world-frame')].map((frame,index)=>{try{const w=frame.contentWindow,doc=frame.contentDocument;w.performance.setResourceTimingBufferSize?.(2000);const kinds=[w.sourceLive&&'source-live',w.canalReal&&'canal-real',w.stationWorld&&'shipyard-station',w.lijiangWorld&&'lijiang-flythrough'].filter(Boolean),api=w.sourceLive||w.canalReal||w.stationWorld||w.lijiangWorld,video=doc?.querySelector('#source-video'),canvas=doc?.querySelector('#world canvas');return {index,source:frame.dataset.src,sourceAttribute:frame.getAttribute('src'),href:w.location.href,active:frame.dataset.active==='true',kind:kinds[0]||null,apiKinds:kinds,apiExposed:!!api,state:api?.getState()||null,resources:w.performance.getEntriesByType('resource').map(r=>r.name),canvasCount:doc?.querySelectorAll('canvas').length||0,canvas:canvas?{width:canvas.width,height:canvas.height,clientWidth:canvas.clientWidth,clientHeight:canvas.clientHeight}:null,media:video?{width:video.videoWidth,height:video.videoHeight,readyState:video.readyState,mediaStream:video.srcObject instanceof w.MediaStream,liveTracks:video.srcObject?.getTracks().filter(t=>t.readyState==='live').length||0}:null};}catch(error){return {index,source:frame.dataset.src,error:error.message};}})}))()`, 'Read four actual production documents/APIs and source bridge', ms);
    const url = new URL(state.url);
    invariant(url.origin === new URL(BASE).origin && url.pathname === new URL('index.html', BASE).pathname, 'Hub left its own fixed production page');
    const live = state.previews.filter(p => p.href && p.href !== 'about:blank');
    const ownWorlds = live.filter(p => ['canal-real', 'shipyard-station', 'lijiang-flythrough'].includes(p.kind) || /\/(?:canal-real|shipyard-station|lijiang-flythrough)\//.test(p.href)).length;
    const ownHeavy = ownWorlds + Number(externalBridge === false && !!state.bridge.sessionActive);
    for (const p of live) activatedIndices.add(p.index);
    report.peakObservedLiveSceneDocuments = Math.max(report.peakObservedLiveSceneDocuments, live.length);
    report.peakObservedOwnHeavyScenes = Math.max(report.peakObservedOwnHeavyScenes, ownHeavy);
    invariant(live.length <= 1, 'Hub retained more than one live scene document');
    invariant(ownHeavy <= 1, 'An authored world started before this QA source GL session retired');
    invariant(live.every(p => p.apiKinds?.length <= 1), 'A document exposed more than one world API');
    if (externalBridge === true) invariant(!live.some(p => p.index === 0), 'QA unexpectedly opened source-live while an external source session was active');
    report.timingSamples.push({ monotonicMs: performance.now(), active: state.hub?.active || null, switching: state.hub?.switching, bridgeActive: state.bridge.sessionActive, ownHeavyScenes: ownHeavy, previews: state.previews.map(p => ({ index: p.index, kind: p.kind, href: p.href, active: p.active, sceneId: p.state?.sceneId ?? null, frames: p.state?.frames ?? null, decodedFrames: p.state?.video?.decodedFrames ?? null, time: p.state?.time ?? null })), presentation: getPresentation() });
    return state;
  }
  async function wait(predicate, label, ms = 180000) {
    const deadline = Date.now() + ms; let state, lastProgress = 0;
    while (Date.now() < deadline) {
      state = await readState(Math.max(1, Math.min(60000, deadline - Date.now())));
      for (const p of state.previews.filter(p => p.active)) {
        if (p.error || p.state?.error || p.state?.errors?.length) throw new Error(p.error || p.state.error || p.state.errors.join('\n'));
      }
      if (predicate(state)) return state;
      if (Date.now() - lastProgress > 2000) { progress(label, state); lastProgress = Date.now(); }
      await sleep(250);
    }
    throw new Error(label + ' timed out: ' + JSON.stringify(state));
  }
  function assertRetiredOthers(state, index) {
    for (const p of state.previews) if (p.index !== index) {
      const blankAttribute = p.sourceAttribute === 'about:blank' || !activatedIndices.has(p.index) && (p.sourceAttribute === null || p.sourceAttribute === '');
      invariant(p.href === 'about:blank' && blankAttribute && !p.apiExposed && p.canvasCount === 0 && !p.media, 'Previous or unstarted scene retained a document, API, canvas or media element');
    }
  }
  async function capture(index, name) {
    await call('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r(true))))'); await sleep(150);
    const data = await call(`(()=>{const w=${child(index)};if(w.sourceLive){const v=w.document.querySelector('#source-video');if(!v?.videoWidth)throw new Error('No decoded source video');const c=document.createElement('canvas');c.width=v.videoWidth;c.height=v.videoHeight;c.getContext('2d').drawImage(v,0,0);return c.toDataURL('image/png');}const c=w.document.querySelector('#world canvas');if(!c)throw new Error('No actual world framebuffer');return c.toDataURL('image/png');})()`, 'Read actual current world framebuffer');
    const image = nativeImage.createFromDataURL(data), stats = statistics(image), canvasBytes = image.toPNG();
    invariant(stats.width >= 300 && stats.height >= 250 && stats.meanLuminance > 3 && stats.luminanceStdDev > 4, 'Captured realtime world is blank or too small');
    policy(); const pageImage = await bounded(window.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true }), 30000, 'Hidden hub page capture'); policy();
    const pageBytes = pageImage.toPNG(), canvasPath = path.join(output, name + '-canvas.png'), pagePath = path.join(output, name + '-page.png');
    fs.writeFileSync(canvasPath, canvasBytes); fs.writeFileSync(pagePath, pageBytes);
    const item = { name, canvas: path.relative(projectDirectory, canvasPath).replaceAll('\\', '/'), page: path.relative(projectDirectory, pagePath).replaceAll('\\', '/'), canvasSha256: sha256(canvasBytes), pageSha256: sha256(pageBytes), canvasBytes: canvasBytes.length, pageBytes: pageBytes.length, ...stats, pageSize: pageImage.getSize(), monotonicMs: performance.now(), state: await readState() };
    report.captures.push(item); return item;
  }
  async function nativePointer(index, { drag = false } = {}) {
    const point = await call(`(()=>{const f=document.querySelectorAll('iframe.world-frame')[${index}],a=f.getBoundingClientRect(),w=f.contentWindow,c=w.document.querySelector('#world canvas'),b=c.getBoundingClientRect(),x=Math.round(a.left+b.left+b.width*.53),y=Math.round(a.top+b.top+b.height*.48);if(document.elementFromPoint(x,y)!==f)throw new Error('Own canvas is covered by the parent');return {x,y};})()`, 'Locate actual child canvas in own hidden webContents');
    const destination = drag ? { x: point.x + 72, y: point.y - 23 } : point;
    policy(); window.webContents.sendInputEvent({ type: 'mouseDown', ...point, button: 'left', clickCount: 1 });
    await sleep(30);
    if (drag) { policy(); window.webContents.sendInputEvent({ type: 'mouseMove', ...destination, button: 'left', buttons: ['left'] }); await sleep(40); }
    policy(); window.webContents.sendInputEvent({ type: 'mouseUp', ...destination, button: 'left', clickCount: 1 }); policy();
    return { start: point, end: destination, target: 'own hidden webContents; no OS input or focus' };
  }
  async function uiState() {
    return call(`(()=>{const w=${child(3)},visible=e=>!!e&&e.getClientRects().length>0&&w.getComputedStyle(e).visibility!=='hidden'&&w.getComputedStyle(e).display!=='none';return {hidden:w.lijiangWorld.getState().uiHidden,chrome:[...w.document.querySelectorAll('.chrome')].map(e=>({tag:e.tagName,className:e.className,display:w.getComputedStyle(e).display,visible:visible(e)})),gui:[...w.document.querySelectorAll('.lil-gui.lil-root')].map(e=>({display:w.getComputedStyle(e).display,visible:visible(e)})),fpsVisible:visible(w.document.getElementById('fps'))};})()`, 'Measure actual chrome/GUI/FPS visibility');
  }
  async function cleanAndRestore(name) {
    await call(`${child(3)}.document.getElementById('clean').click()`, 'Use actual clean-frame H button');
    await wait(s => s.previews[3].state?.uiHidden, 'Actual Lijiang clean frame');
    const hidden = await uiState();
    invariant(hidden.hidden && hidden.chrome.length > 0 && hidden.chrome.every(e => e.display === 'none' && !e.visible) && hidden.gui.every(e => e.display === 'none' && !e.visible) && !hidden.fpsVisible, 'Clean frame retained chrome, parameter GUI or FPS');
    await capture(3, name + '-clean');
    const input = await nativePointer(3);
    await wait(s => !s.previews[3].state?.uiHidden, 'Actual native canvas tap restores UI');
    const restored = await uiState(); invariant(restored.chrome.some(e => e.visible), 'Native canvas tap did not restore actual controls');
    pass(name + '-clean-frame-and-native-tap-restore', { hidden, restored, input });
  }
  async function controls() {
    await call(`${child(3)}.document.getElementById('final-shot').click()`, 'Actual composed-final-view button');
    let state = (await wait(s => s.previews[3].state?.time === 45 && s.previews[3].state.path?.mode === 'path', 'Actual final-shot button reaches 45 seconds')).previews[3].state;
    invariant(state.paused && Math.abs(state.camera.target[1] - 90) < 1e-6, 'Final-shot button did not restore the composed targetY=90 pose');
    pass('actual-final-shot-button-reaches-45-and-target-y-90', { time: state.time, camera: state.camera, path: state.path });
    await call(`${child(3)}.document.getElementById('mode').click()`, 'Actual free-mode button');
    const before = (await wait(s => s.previews[3].state?.path?.mode === 'free', 'Actual Lijiang free mode')).previews[3].state;
    const pointer = await nativePointer(3, { drag: true });
    const turned = (await wait(s => s.previews[3].state?.frames > before.frames && (distance(s.previews[3].state.camera.position, before.camera.position) > .02 || distance(s.previews[3].state.camera.target, before.camera.target) > .02), 'Native own-window Lijiang pointer changes actual pose')).previews[3].state;
    await call(`(()=>{const w=${child(3)};w.dispatchEvent(new w.KeyboardEvent('keydown',{key:'w',code:'KeyW',bubbles:true,cancelable:true}));})()`, 'Own child DOM KeyW down');
    try { await sleep(350); }
    finally { await call(`(()=>{const w=${child(3)};w.dispatchEvent(new w.KeyboardEvent('keyup',{key:'w',code:'KeyW',bubbles:true}));})()`, 'Own child DOM KeyW up'); }
    const moved = (await readState()).previews[3].state;
    invariant(moved.path.mode === 'free' && distance(moved.camera.position, turned.camera.position) > .05 && [...moved.camera.position, ...moved.camera.target].every(Number.isFinite), 'Held actual child DOM KeyW did not move a finite free camera');
    pass('actual-free-mode-native-pointer-and-held-child-DOM-WASD', { before: before.camera, turned: turned.camera, moved: moved.camera, pointer, heldMilliseconds: 350 });
    await call(`(()=>{const w=${child(3)},e=w.document.getElementById('timeline');e.value='12';e.dispatchEvent(new w.Event('input',{bubbles:true}));})()`, 'Use actual timeline input at 12 seconds');
    state = (await wait(s => s.previews[3].state?.time === 12 && s.previews[3].state.path?.mode === 'path', 'Actual timeline seek updates path pose')).previews[3].state;
    invariant(distance(state.camera.position, moved.camera.position) > 1, 'Timeline did not change the actual camera path position');
    pass('actual-timeline-input-seeks-to-12-and-changes-pose', { value: 12, camera: state.camera, path: state.path });
    await call(`${child(3)}.document.getElementById('final-shot').click();${child(3)}.document.getElementById('parameters').click()`, 'Return to final pose and open actual parameter panel');
    let ui = await uiState(); invariant(ui.gui.length === 1 && ui.gui[0].visible, 'Actual lil-gui parameter panel did not open');
    await cleanAndRestore('desktop');
    ui = await uiState(); invariant(ui.gui[0]?.visible, 'Clean-frame restoration lost the previously open parameter panel');
    await call(`${child(3)}.document.getElementById('parameters').click()`, 'Close actual parameter panel');
    ui = await uiState(); invariant(ui.gui.length === 1 && !ui.gui[0].visible, 'Actual lil-gui parameter panel did not close');
    pass('actual-parameter-panel-opens-hides-with-clean-and-closes', ui);
    await capture(3, 'desktop-final-ui');
  }
  async function mobileLayout(width, stage) {
    const layout = await call(`(()=>{const f=document.querySelectorAll('iframe.world-frame')[3],w=f.contentWindow,r=f.getBoundingClientRect(),controls=[...w.document.querySelectorAll('.chrome button,#timeline')].filter(e=>e.getClientRects().length&&w.getComputedStyle(e).display!=='none').map(e=>{const q=e.getBoundingClientRect(),x=r.left+q.left+q.width/2,y=r.top+q.top+q.height/2,hit=w.document.elementFromPoint(q.left+q.width/2,q.top+q.height/2);return {id:e.id,text:e.textContent,disabled:!!e.disabled,rect:q.toJSON(),parentHitIsFrame:document.elementFromPoint(x,y)===f,childHitIsControl:hit===e||e.contains(hit)};}),pairs=[];for(let i=0;i<controls.length;i++)for(let j=i+1;j<controls.length;j++){const a=controls[i].rect,b=controls[j].rect,area=Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));if(area>.5)pairs.push({a:controls[i].id,b:controls[j].id,area});}const n=w.document.getElementById('notice');return {stage:${JSON.stringify(stage)},requestedViewport:{width:${width},height:844},actualViewport:{width:innerWidth,height:innerHeight},documentWidth:document.documentElement.scrollWidth,parentOverflow:document.documentElement.scrollWidth>innerWidth+1,frame:r.toJSON(),preview:{width:w.innerWidth,height:w.innerHeight,scrollWidth:w.document.documentElement.scrollWidth},previewOverflow:w.document.documentElement.scrollWidth>w.innerWidth+1,controls,controlIntersections:pairs,notice:n&&!n.hidden?n.textContent:null,state:w.lijiangWorld.getState()};})()`, 'Measure actual Lijiang phone bounds and parent/child coverage');
    report.mobileLayoutSamples.push({ monotonicMs: performance.now(), ...layout });
    assertMobileLayout(layout); return layout;
  }
  async function mobile() {
    for (const width of [375, 390]) {
      policy(); window.setContentSize(width, 844); policy();
      await call(`document.querySelectorAll('iframe.world-frame')[3].scrollIntoView({behavior:'instant',block:'center'})`, 'Center actual phone Lijiang preview');
      await wait(s => s.previews[3]?.active && s.previews[3].state?.ready && s.previews[3].state.frames >= 3, 'Actual phone Lijiang ready');
      await call(`${child(3)}.document.getElementById('final-shot').click()`, 'Select actual phone final composition');
      const before = (await readState()).previews[3].state;
      await wait(s => s.previews[3].state?.frames >= before.frames + 3, 'Actual phone resized renderer frames');
      const initial = await mobileLayout(width, 'ui');
      await capture(3, 'phone-' + initial.actualViewport.width + '-ui');
      await cleanAndRestore('phone-' + initial.actualViewport.width);
      const restored = await mobileLayout(width, 'native-tap-restored');
      pass('actual-phone-' + initial.actualViewport.width + '-controls-fit-before-and-after-native-tap', { initial, restored });
    }
  }
  async function recordingCancel() {
    await call(`${child(3)}.document.getElementById('final-shot').click()`, 'Hold final pose before cancelled export');
    const beforeState = await readState(), before = beforeState.previews[3];
    invariant(!before.state.uiHidden && !before.state.recording && before.state.paused, 'Cancelled export must start from held visible UI');
    await call(`(()=>{const w=${child(3)};w.__lijiangHubCancelOutcome={settled:false};void w.lijiangWorld.record({duration:10,width:640,height:360,fps:60,download:false}).then(result=>{w.__lijiangHubCancelOutcome={settled:true,cancelled:result?.cancelled===true,hasBlob:!!result?.blob};},error=>{w.__lijiangHubCancelOutcome={settled:true,error:String(error?.stack||error)};});return true;})()`, 'Start small actual 640x360 60fps encoder job without download');
    const encoding = (await wait(s => s.previews[3].state?.recording && s.previews[3].state.recorder?.phase === 'encoding' && s.previews[3].state.recorder.frameCount >= 8, 'Actual encoder submits at least eight rendered frames', 180000)).previews[3];
    invariant(encoding.canvas.width === 640 && encoding.canvas.height === 360 && encoding.state.uiHidden, 'Actual recording did not use the requested capture canvas/UI');
    await call(`(()=>{const w=${child(3)},b=w.document.getElementById('cancel-record');if(b.hidden||!b.getClientRects().length)throw new Error('Actual cancel button is absent');b.click();return true;})()`, 'Click actual encoder Cancel button');
    const restored = (await wait(s => s.previews[3].state?.recorder?.phase === 'cancelled' && !s.previews[3].state.recording && !s.previews[3].state.uiHidden, 'Cancelled encoder restores actual live renderer and UI', 120000)).previews[3];
    const outcome = await call(`${child(3)}.__lijiangHubCancelOutcome`, 'Read settled actual cancelled export result');
    invariant(outcome?.settled && outcome.cancelled && !outcome.hasBlob && !outcome.error, 'Small export did not settle as cancelled without producing a video');
    invariant(restored.state.time === before.state.time && restored.state.paused === before.state.paused && restored.state.path.mode === before.state.path.mode && distance(restored.state.camera.position, before.state.camera.position) < .001 && distance(restored.state.camera.target, before.state.camera.target) < .001, 'Cancelled export did not restore prior time, mode and camera pose');
    invariant(restored.canvas.width === before.canvas.width && restored.canvas.height === before.canvas.height && restored.canvas.clientWidth === before.canvas.clientWidth && restored.canvas.clientHeight === before.canvas.clientHeight, 'Cancelled export did not restore the live renderer dimensions');
    await wait(s => s.previews[3].state?.frames >= restored.state.frames + 3, 'Restored live RAF continues after cancellation');
    const ui = await uiState(); invariant(ui.chrome.some(e => e.visible) && ui.fpsVisible, 'Cancelled export did not restore usable chrome and FPS');
    await capture(3, 'phone-after-cancelled-export');
    pass('actual-small-fixed-frame-export-cancel-button-restores-pose-ui-and-renderer', { options: { duration: 10, width: 640, height: 360, fps: 60, download: false }, before, encoding, restored, outcome, ui, fullFilmReexported: false });
  }
  try {
    // Probe before any source activation. An existing bridge session belongs to
    // somebody else, so this run must not start or stop source-live in that case.
    const probe = await call(`(async()=>{const bridge=await fetch('http://127.0.0.1:8797/health',{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error('Source bridge unavailable');return r.json();}),f=document.querySelectorAll('iframe.world-frame')[0];return {bridge,ownSourceDocument:f?{href:f.contentWindow.location.href,apiExposed:!!f.contentWindow.sourceLive,active:f.dataset.active==='true'}:null};})()`, 'Initial source bridge ownership probe');
    const bridge = probe.bridge;
    invariant(bridge.service === 'napali-source-bridge' && bridge.backend === 'gl', 'Expected separate source GL bridge is absent');
    externalBridge = !!bridge.sessionActive; report.externalSourceBridgeInitiallyActive = externalBridge; report.initialSourceBridge = bridge;
    report.sourceDocumentExistedAtInitialProbe = !!probe.ownSourceDocument?.apiExposed;
    report.initialOwnSourceDocument = probe.ownSourceDocument;
    report.initialSourceOwnership = externalBridge ? report.sourceDocumentExistedAtInitialProbe ? 'ambiguous: own source document already existed before the initial probe; no external-ownership claim' : 'pre-existing bridge session outside this hidden page' : 'bridge idle before any requested source leg';
    report.lifecycleScope = externalBridge ? report.sourceDocumentExistedAtInitialProbe ? 'Initial source ownership is ambiguous; source leg must fail before running any requested activation.' : 'Own hidden hub documents and authored GL scenes only; pre-existing source bridge excluded.' : 'Own hidden hub documents, authored GL scenes and source bridge session.';
    const initial = await wait(s => s.hub && s.previews.length === 4, 'Actual four-entry production hub exists', 30000);
    invariant(new URL(initial.url).hash === '#lijiang', 'QA must start at #lijiang to avoid an unintended source activation');
    pass('actual-four-production-entry-map-without-QA-overrides', { entries: assertEntryMap(initial.previews.map(p => p.source)), initialHash: '#lijiang' });
    if (externalBridge) report.tests.push({ name: 'source-live-media-leg', passed: null, skipped: true, reason: 'Source GL bridge was already active before this run; its owner/session is left untouched.', evidence: bridge });
    const itinerary = externalBridge ? [3, 3, 1, 2, 3] : [3, 0, 3, 1, 2, 3];
    report.requestedItinerary = [3, 0, 3, 1, 2, 3]; report.actualItinerary = itinerary;
    const labels = ['source', 'window', 'station', 'lijiang'];
    const sourceTimeout = Math.max(180000, Math.min(1800000, Number(process.env.NAPALI_QA_TIMEOUT_MS) || 600000));
    for (const [leg, index] of itinerary.entries()) {
      const at = performance.now(), label = labels[index]; progress('activate-' + leg + '-' + label);
      if (index === 0) ownSourceStarted = true;
      await call(`document.querySelectorAll('iframe.world-frame')[${index}].scrollIntoView({behavior:'instant',block:'center'})`, 'Select actual ' + label + ' production preview');
      const ready = await wait(s => { const p = s.previews[index]; return p?.active && !s.hub?.switching && p.state?.ready && (index === 0 ? p.kind === 'source-live' && p.state.video?.decodedFrames >= 3 && p.media?.mediaStream && p.media.liveTracks === 1 : p.state.frames >= 3); }, label + ' actual rendered first frames', index === 0 ? sourceTimeout : 300000);
      assertRetiredOthers(ready, index);
      const preview = ready.previews[index];
      if (index === 0) {
        invariant(preview.state.scale === 1 && !preview.state.autoQuality, 'Source inline entry reduced original scale/quality');
        const next = await wait(s => s.previews[0].state?.frames >= preview.state.frames + 2 && s.previews[0].state.video.decodedFrames >= preview.state.video.decodedFrames + 2, 'Source actual subsequent decoded MediaStream frames');
        pass('source-live-real-decoded-MediaStream-at-original-scale', { before: preview, after: next.previews[0] });
      } else {
        if (!externalBridge) invariant(!ready.bridge.sessionActive, 'Authored world began before the QA source bridge session became idle');
        const identity = index === 3 ? lijiangIdentity(preview) : worldIdentity(preview), prior = report.worldIdentities[label];
        if (prior) invariant(prior.sceneId === identity.sceneId && prior.runtimeRevision === identity.runtimeRevision && prior.modelSha256 === identity.modelSha256, 'Returned world changed its authored identity');
        report.worldIdentities[label] = identity;
      }
      report.activations.push({ leg, index, label, monotonicStartMs: at, monotonicReadyMs: performance.now(), seconds: (performance.now() - at) / 1000, frames: preview.state.frames, decodedFrames: preview.state.video?.decodedFrames ?? null, sourceBridgeActive: ready.bridge.sessionActive });
      if (index !== 3 || leg === itinerary.length - 1) await capture(index, String(leg + 1).padStart(2, '0') + '-' + label);
      pass('leg-' + leg + '-' + label + '-ready-after-other-documents-blanked', { active: preview, retired: ready.previews.filter(p => p.index !== index).map(p => ({ index: p.index, href: p.href, sourceAttribute: p.sourceAttribute, apiExposed: p.apiExposed, canvasCount: p.canvasCount, media: p.media })), bridge: ready.bridge });
    }
    const a = report.worldIdentities.window, b = report.worldIdentities.station;
    invariant(a && b && a.sceneId !== b.sceneId && a.modelUrl !== b.modelUrl && a.modelSha256 !== b.modelSha256 && a.lightingFingerprint !== b.lightingFingerprint, 'Canal and station have not retained independent actual models/lighting');
    pass('two-existing-authored-worlds-retain-independent-resource-identities', { window: a, station: b, lijiang: report.worldIdentities.lijiang });
    await controls(); await mobile(); await recordingCancel();
    const finalState = await readState(); lijiangIdentity(finalState.previews[3]); assertRetiredOthers(finalState, 3);
    invariant(report.peakObservedLiveSceneDocuments === 1 && report.peakObservedOwnHeavyScenes === 1, 'Actual run did not preserve exactly one own active document/heavy scene');
    pass('serialized-four-entry-lifecycle-has-one-own-live-scene', { peakObservedLiveSceneDocuments: report.peakObservedLiveSceneDocuments, peakObservedOwnHeavyScenes: report.peakObservedOwnHeavyScenes, scope: report.lifecycleScope, actualItinerary: itinerary, observations: report.timingSamples.length });
    report.status = 'passed';
  } catch (error) {
    report.status = 'failed'; report.errors.push(String(error.stack || error));
    try {
      policy(); const bytes = (await bounded(window.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true }), 30000, 'Hidden failure capture')).toPNG(); policy();
      const file = path.join(output, 'failure-page.png'); fs.writeFileSync(file, bytes); report.failurePage = { path: path.relative(projectDirectory, file).replaceAll('\\', '/'), sha256: sha256(bytes) };
    } catch (captureError) { report.errors.push('Failure capture: ' + captureError.message); }
  } finally {
    try {
      const cleanup = await call(`(async()=>{const result=[];let sourceStopExplicitlyRequested=false;for(const f of document.querySelectorAll('iframe.world-frame')){const w=f.contentWindow;if(w.sourceLive&&${ownSourceStarted && externalBridge === false}){sourceStopExplicitlyRequested=true;await w.sourceLive.stop();}await w.lijiangWorld?.dispose();await w.stationWorld?.dispose();await w.canalReal?.dispose();f.dataset.active='false';f.src='about:blank';result.push(f.dataset.src);}await new Promise(r=>setTimeout(r,100));return {entries:result,sourceStopExplicitlyRequested};})()`, 'Dispose and blank only own hidden QA documents', 120000, true);
      const retired = await call(`(async()=>({previews:[...document.querySelectorAll('iframe.world-frame')].map(f=>({href:f.contentWindow.location.href,apiExposed:!!(f.contentWindow.sourceLive||f.contentWindow.canalReal||f.contentWindow.stationWorld||f.contentWindow.lijiangWorld),canvasCount:f.contentDocument?.querySelectorAll('canvas').length||0})),bridge:await fetch('http://127.0.0.1:8797/health',{cache:'no-store'}).then(r=>r.json())}))()`, 'Verify own QA retirement', 30000, true);
      invariant(retired.previews.every(p => p.href === 'about:blank' && !p.apiExposed && p.canvasCount === 0), 'Own QA document did not become empty about:blank during final retirement');
      if (externalBridge === false && ownSourceStarted) invariant(!retired.bridge.sessionActive, 'Own source bridge session remained active after retirement');
      report.retirement = retired; pass('finally-disposes-and-blanks-own-QA-documents', { ...retired, sourceStopExplicitlyRequested: cleanup.sourceStopExplicitlyRequested, externalSourceDocumentNeverLoaded: externalBridge === true && !activatedIndices.has(0), sourceStopScope: 'Only the own sourceLive API with its own session token can be called; document pagehide may also retire its own token.' });
    } catch (error) { report.status = 'failed'; report.errors.push('QA retirement: ' + String(error.stack || error)); }
  }
  report.passed = report.status === 'passed'; report.elapsedSeconds = (Date.now() - started) / 1000; report.presentation = getPresentation(); report.activatedIndices = [...activatedIndices];
  const serialized = JSON.stringify(report, null, 2) + '\n';
  fs.writeFileSync(rawReportPath, serialized); fs.writeFileSync(latest, serialized);
  // Failed raw evidence and latest stay available; a prior passed canonical is
  // never replaced by a failure.
  if (report.passed) fs.writeFileSync(canonical, serialized);
  progress(report.status); return report;
}

module.exports = { runLijiangHubAcceptance, contracts: { assertEntryMap, worldIdentity, lijiangIdentity, assertMobileLayout } };
