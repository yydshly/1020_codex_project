'use strict';

// Own hidden source-derived renderer only: no desktop capture, OS input, user
// browser profile, or original source-bridge session is accessed here.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const os = require('node:os');
const { app, BrowserWindow, nativeImage } = require('electron');
const MODE_ARGUMENT = '--lijiang-native-bridge';
if (!process.argv.includes(MODE_ARGUMENT)) throw new Error('The native bridge requires its explicit hidden entry argument');
const SERVICE = 'lijiang-native-bridge';
const PORT = 8798;
const ORIGIN = 'http://127.0.0.1:8796';
const SOURCE_URL = ORIGIN + '/projects/014-programmable-worlds/web/lijiang-native/engine.html?embed=1&qa=1&rs=1&t=0&bandpx=60000';
const ARTIFACT_ROOT = 'C:\\Users\\yun68\\CodexTaskArtifacts';
const PROFILE = path.join(ARTIFACT_ROOT, '014-lijiang-native-bridge-profile');
const LOG_DIRECTORY = path.join(ARTIFACT_ROOT, '014-lijiang-native-bridge-logs');
const FLIGHT_DURATION = 45;
const offscreen = process.env.LIJIANG_NATIVE_BRIDGE_OFFSCREEN !== '0';
const NATIVE_PROVENANCE = Object.freeze({ sceneId: 'lijiang-native', renderer: 'source-derived-full-glsl', presentation: 'lossless-live-renderer-frames', flightDuration: FLIGHT_DURATION, sourceURL: SOURCE_URL, streamAdapter: 'source-stream-engine.js', declaration: 'bridge configuration; actual engine provenance is reported separately' });
try { os.setPriority(0, os.constants.priority.PRIORITY_BELOW_NORMAL); } catch { /* Optional scheduler tuning cannot weaken the hidden-window policy. */ }
fs.mkdirSync(PROFILE, { recursive: true }); fs.mkdirSync(LOG_DIRECTORY, { recursive: true });
app.setName('Lijiang Native Background Bridge');
app.setPath('userData', PROFILE); app.setPath('sessionData', PROFILE);
for (const [name, value] of [['use-gl', 'angle'], ['use-angle', 'gl']]) app.commandLine.appendSwitch(name, value);
for (const name of ['disable-renderer-backgrounding', 'disable-background-timer-throttling', 'disable-backgrounding-occluded-windows']) app.commandLine.appendSwitch(name);
const log = (event, data = {}) => fs.appendFileSync(path.join(LOG_DIRECTORY, 'diagnostics.jsonl'), JSON.stringify({ at: new Date().toISOString(), event, pid: process.pid, ...data }) + '\n');
let engine = null, session = null, server = null, polling = false, fatal = null, offscreenPaints = 0, stopping = null, downloads = 0, framePull = null;
const initialStatus = () => ({ phase: 'idle', ready: false, state: null, drive: null, diagnostics: null, stream: null, exportState: null, settings: null, viewport: null, error: null, backend: 'gl', duration: FLIGHT_DURATION, nativeProvenance: NATIVE_PROVENANCE, engineProvenance: null });
let cached = initialStatus();
function bounded(promise, milliseconds, label) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(label + ' timed out')), milliseconds); })]).finally(() => clearTimeout(timer));
}
function assertHidden() {
  if (engine && !engine.isDestroyed() && (engine.isVisible() || engine.isFocused())) throw new Error('Native bridge renderer unexpectedly became visible or focused');
}
async function evaluate(code, label, milliseconds = 30000) {
  assertHidden();
  if (!engine || engine.isDestroyed()) throw new Error('Native Lijiang renderer is not running');
  const value = await bounded(engine.webContents.executeJavaScript(code, false), milliseconds, label);
  assertHidden(); return value;
}
async function readEngine() {
  const readingEngine = engine, readingSession = session;
  const read = await evaluate(`(()=>{const state=window.napaliControl?.getState()||null;return {state,drive:window.napaliDrive?.getState()||null,renderSize:typeof R!=='undefined'&&R?{width:R.w,height:R.h}:null,diagnostics:window.napaliDiagnostics||null,progress:document.getElementById('loadtxt')?.textContent||'',stream:window.__napaliSourceStream?.getState()||null,exportState:window.lijiangNativeExport?.getState()||null,settings:window.lijiangNativeSettings?.getState()||null,viewport:window.lijiangNativeViewport?.getState()||null,documentURL:location.href,engineProvenance:window.lijiangNativeProvenance||window.napaliDiagnostics?.nativeProvenance||state?.nativeProvenance||state?.provenance||null};})()`, 'Read native Lijiang renderer and actual provenance');
  if (engine !== readingEngine || session !== readingSession) return cached;
  const durationError = read.state?.ready && read.state.duration !== FLIGHT_DURATION ? 'Native Lijiang renderer must expose a 45-second flight' : null;
  const entryError = new URL(read.documentURL).pathname !== new URL(SOURCE_URL).pathname ? 'Native Lijiang renderer left its fixed engine document' : null;
  const ready = !!read.state?.ready && read.state.frames >= 2 && !durationError && !entryError;
  cached = { ...read, phase: ready ? 'ready' : read.diagnostics?.phase || 'initializing', ready, error: fatal || read.state?.error || durationError || entryError || (read.progress?.startsWith('Error:') ? read.progress : null), backend: 'gl', duration: FLIGHT_DURATION, nativeProvenance: NATIVE_PROVENANCE, offscreen, offscreenPaints, sessionId: session?.id || null, updatedAt: new Date().toISOString() };
  if (cached.error) cached.phase = 'error';
  return cached;
}
function stopEngine(reason = 'client-stop') {
  if (stopping) return stopping;
  const old = session?.id, retiringEngine = engine, retiringSession = session;
  stopping = (async () => {
    if (retiringEngine && !retiringEngine.isDestroyed()) {
      await evaluate(`(async()=>{const api=window.lijiangNativeExport;if(api)await api.cancel();if(api?.getState().active)throw new Error('Native export is still active');return true;})()`, 'Cancel and await native export before renderer retirement', 180000);
      if (!retiringEngine.isDestroyed()) retiringEngine.destroy();
    }
    if (session === retiringSession && (engine === retiringEngine || engine === null)) { engine = null; session = null; fatal = null; cached = initialStatus(); }
    log('engine-stopped', { reason, sessionId: old });
  })().finally(() => { stopping = null; });
  return stopping;
}
async function startEngine() {
  if (stopping) await stopping;
  if (engine && !engine.isDestroyed() && session) { session.lastActivity = Date.now(); return; }
  fatal = null; session = { id: crypto.randomUUID(), token: crypto.randomBytes(24).toString('hex'), lastActivity: Date.now() };
  cached = { ...initialStatus(), phase: 'opening-native-lijiang', sessionId: session.id }; offscreenPaints = 0;
  engine = new BrowserWindow({ width: 1440, height: 900, show: false, skipTaskbar: true, focusable: false, paintWhenInitiallyHidden: true, autoHideMenuBar: true, backgroundColor: '#030a14', webPreferences: { offscreen, sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, allowRunningInsecureContent: false, webviewTag: false, devTools: false, spellcheck: false, backgroundThrottling: false, partition: 'persist:lijiang-native-video-bridge' } });
  if (offscreen) { engine.webContents.setFrameRate(30); engine.webContents.on('paint', () => { offscreenPaints++; }); }
  engine.webContents.setBackgroundThrottling(false);
  engine.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  engine.webContents.session.setPermissionCheckHandler(() => false);
  engine.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  engine.webContents.on('will-navigate', (event, destination) => { try { if (new URL(destination).origin !== ORIGIN || new URL(destination).pathname !== new URL(SOURCE_URL).pathname) event.preventDefault(); } catch { event.preventDefault(); } });
  engine.webContents.on('will-attach-webview', event => event.preventDefault());
  engine.webContents.on('console-message', details => log('renderer-console', { level: details.level, message: String(details.message || '').slice(0, 4000) }));
  engine.webContents.on('render-process-gone', (_event, details) => { fatal = 'Native renderer exited: ' + details.reason; cached = { ...cached, error: fatal, phase: 'error', ready: false }; log('renderer-exited', details); });
  const startingEngine = engine;
  engine.on('closed', () => { if (engine === startingEngine) engine = null; });
  log('engine-starting', { sessionId: session.id, sourceURL: SOURCE_URL, windowPolicy: { show: false, focusable: false, skipTaskbar: true, offscreen, offscreenFrameRate: offscreen ? 30 : null }, backend: 'gl', nativeProvenance: NATIVE_PROVENANCE });
  engine.loadURL(SOURCE_URL).then(async () => {
    if (engine !== startingEngine) return;
    await evaluate(fs.readFileSync(path.join(__dirname, 'source-stream-engine.js'), 'utf8'), 'Install unchanged source canvas video adapter');
    await readEngine(); log('native-adapter-installed');
  }).catch(error => { if (engine !== startingEngine) return; fatal = error.message; cached = { ...cached, phase: 'error', error: fatal, ready: false }; log('native-start-error', { message: fatal }); });
}
function number(value, min, max) { if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error('Control value out of range'); return value; }
const SETTINGS_LIMITS = Object.freeze({ sunEl: [2, 60], sunAz: [-180, 180], fog: [0, .001], mistH: [10, 350], mistK: [0, 5], expo: [.5, 1.8], sat: [.5, 1.3], waveStrength: [0, 2], waveSpeed: [0, 2], colorTemperature: [-1, 1] });
function validateSettings(partial) {
  if (!partial || typeof partial !== 'object' || Array.isArray(partial)) throw new Error('Native settings must be an object');
  const values = {};
  for (const [key, value] of Object.entries(partial)) { if (!Object.hasOwn(SETTINGS_LIMITS, key)) throw new Error('Unknown native setting: ' + key); values[key] = number(value, ...SETTINGS_LIMITS[key]); }
  return values;
}
const methods = {
  pause: args => `window.napaliControl.pause(${JSON.stringify(Boolean(args.paused))})`,
  seek: args => `window.napaliDrive.setMode('flight');window.napaliControl.seek(${number(args.time, 0, FLIGHT_DURATION)});window.napaliControl.pause(true)`,
  restart: () => `window.napaliDrive.setMode('flight');window.napaliControl.restart()`,
  quality: args => { const scale = number(args.scale, .5, 1); if (![.5, .75, 1].includes(scale)) throw new Error('Quality must be .5, .75, or 1'); return `window.napaliControl.setQuality(${scale})`; },
  mode: args => { if (!['free', 'flight'].includes(args.mode)) throw new Error('Invalid native camera mode'); return `window.napaliDrive.setMode(${JSON.stringify(args.mode)})`; },
  free: args => `window.napaliDrive.setMode(${JSON.stringify(args.enabled === false ? 'flight' : 'free')})`,
  settings: args => { if (Object.hasOwn(args, 'values') && Object.keys(args).length !== 1) throw new Error('Unexpected native settings arguments'); return `window.lijiangNativeSettings.set(${JSON.stringify(validateSettings(Object.hasOwn(args, 'values') ? args.values : args))})`; },
  viewport: args => { if (!args || Object.keys(args).length !== 1 || !Object.hasOwn(args, 'aspect')) throw new Error('Native viewport accepts only aspect'); return `window.lijiangNativeViewport.set({aspect:${number(args.aspect, .1, 8)}})`; },
  move: args => `window.napaliDrive.move(${JSON.stringify({ forward: number(args.forward ?? 0, -200, 200), right: number(args.right ?? 0, -200, 200), up: number(args.up ?? 0, -200, 200) })})`,
  look: args => `window.napaliDrive.look(${JSON.stringify({ yawDelta: number(args.yawDelta ?? 0, -Math.PI, Math.PI), pitchDelta: number(args.pitchDelta ?? 0, -1.4, 1.4) })})`,
  suspend: args => `window.napaliControl.suspend(${JSON.stringify(Boolean(args.suspended))})`
};
function send(response, code, value) { response.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); response.end(JSON.stringify(value)); }
function body(request) { return new Promise((resolve, reject) => { let data = ''; request.on('data', chunk => { data += chunk; if (data.length > 262144) { reject(new Error('Request body too large')); request.destroy(); } }); request.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch { reject(new Error('Invalid JSON body')); } }); request.on('error', reject); }); }
function authorize(value) {
  if (!session || value.sessionId !== session.id || typeof value.token !== 'string' || !/^[a-f0-9]{48}$/.test(value.token) || !crypto.timingSafeEqual(Buffer.from(value.token), Buffer.from(session.token))) throw new Error('Invalid native Lijiang session');
  session.lastActivity = Date.now();
}
function waitForDrain(response) {
  return new Promise((resolve, reject) => {
    const clean = () => { response.off('drain', drained); response.off('close', closed); response.off('error', failed); };
    const drained = () => { clean(); resolve(); }, closed = () => { clean(); reject(new Error('Native download client disconnected')); }, failed = error => { clean(); reject(error); };
    response.once('drain', drained); response.once('close', closed); response.once('error', failed);
  });
}
async function download(response) {
  const downloadingEngine = engine, downloadingSession = session;
  const info = await evaluate('window.lijiangNativeExport.metadata()', 'Read completed native recording metadata');
  if (!Number.isSafeInteger(info.size) || info.size <= 0 || typeof info.exportId !== 'string' || info.mimeType !== 'video/webm') throw new Error('Invalid completed native recording metadata');
  downloads++;
  try {
    const filename = /^lijiang-native-(?:qa-)?\d+x\d+-\d+fps-\d+frames\.webm$/.test(info.filename || '') ? info.filename : 'lijiang-native-export.webm';
    response.writeHead(200, { 'Content-Type': 'video/webm', 'Content-Length': info.size, 'Content-Disposition': 'attachment; filename="' + filename + '"', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Lijiang-Export-Id': info.exportId });
    for (let offset = 0; offset < info.size;) {
      if (response.destroyed || engine !== downloadingEngine || session !== downloadingSession) throw new Error('Native download session was retired');
      downloadingSession.lastActivity = Date.now();
      const chunk = await evaluate(`window.lijiangNativeExport.readChunk(${JSON.stringify({ offset, length: 512 * 1024, exportId: info.exportId })})`, 'Pull one bounded native recording chunk');
      const bytes = Buffer.from(chunk.data || '', 'base64');
      if (chunk.exportId !== info.exportId || chunk.offset !== offset || chunk.encoding !== 'base64' || bytes.length < 1 || bytes.length > 512 * 1024 || bytes.length !== chunk.byteLength || chunk.nextOffset !== offset + bytes.length || chunk.nextOffset > info.size) throw new Error('Invalid native recording chunk');
      if (!response.write(bytes)) await waitForDrain(response);
      offset = chunk.nextOffset;
    }
    response.end();
  } catch (error) { if (response.headersSent) response.destroy(error); throw error; }
  finally { downloads--; }
}
function frameAfter(value) {
  if (value === undefined) return 0;
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('Invalid native completed-frame cursor');
  return value;
}
async function presentFrame(response, value) {
  if (framePull) { send(response, 429, { error: 'A native lossless frame request is already pending' }); return; }
  const afterFrame = frameAfter(value.afterFrame), pullingEngine = engine, pullingSession = session, lock = {};
  framePull = lock;
  const deadline = Date.now() + 30000;
  let outstanding = null, closed = false;
  const onClose = () => { closed = true; };
  response.once('close', onClose);
  try {
    while (Date.now() < deadline) {
      if (closed || response.destroyed) return;
      if (engine !== pullingEngine || session !== pullingSession || !pullingEngine || pullingEngine.isDestroyed() || stopping) throw new Error('Native frame session was retired');
      pullingSession.lastActivity = Date.now(); assertHidden();
      // R is rendered offscreen while cv keeps the last fully presented image.
      // The generator writes this tag in the same synchronous turn as present;
      // toDataURL then completes the GPU readback before returning its bytes.
      outstanding = pullingEngine.webContents.executeJavaScript(`(()=>{const control=window.napaliControl?.getState(),tag=window.lijiangNativeCompletedFrame;if(window.lijiangNativeExport?.getState().active)return {recording:true};if(window.lijiangNativeViewport?.getState().busy)return {viewport:true};if(!control?.ready||!tag||tag.frame<=${afterFrame}||tag.width!==cv.width||tag.height!==cv.height)return {waiting:true};if(tag.sceneId!=='lijiang-native'||tag.renderWidth!==cv.width||tag.renderHeight!==cv.height||control.scale!==1||control.autoQuality)throw new Error('Native lossless frame is not the original-size complete scene');const png=cv.toDataURL('image/png');return {sceneId:tag.sceneId,frame:tag.frame,time:tag.time,width:tag.width,height:tag.height,renderWidth:tag.renderWidth,renderHeight:tag.renderHeight,png};})()`, false);
      const picture = await bounded(outstanding, Math.max(1, deadline - Date.now()), 'Read one synchronous native PNG frame'); outstanding = null; assertHidden();
      if (closed || response.destroyed) return;
      if (engine !== pullingEngine || session !== pullingSession || stopping) throw new Error('Native frame session changed before delivery');
      if (picture.recording) { send(response, 409, { recording: true, deferred: true, error: 'Native live frame is held until export restoration' }); return; }
      if (picture.viewport) { send(response, 409, { viewport: true, deferred: true, error: 'Native live frame is held until viewport restoration' }); return; }
      if (picture.waiting) { await new Promise(resolve => setTimeout(resolve, Math.min(50, Math.max(1, deadline - Date.now())))); continue; }
      if (picture.sceneId !== 'lijiang-native' || !Number.isSafeInteger(picture.frame) || picture.frame <= afterFrame || !Number.isFinite(picture.time) || !Number.isSafeInteger(picture.width) || !Number.isSafeInteger(picture.height) || picture.width < 2 || picture.height < 2 || typeof picture.png !== 'string' || !picture.png.startsWith('data:image/png;base64,')) throw new Error('Invalid native completed-frame snapshot');
      const bytes = Buffer.from(picture.png.slice('data:image/png;base64,'.length), 'base64');
      if (bytes.length < 8 || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error('Native renderer did not return an actual PNG');
      const image = nativeImage.createFromBuffer(bytes), size = image.getSize();
      if (image.isEmpty() || size.width !== picture.width || size.height !== picture.height) throw new Error('Native PNG dimensions disagree with the completed-frame tag');
      response.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': bytes.length, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Native-Scene': picture.sceneId, 'X-Native-Frame': String(picture.frame), 'X-Native-Time': String(picture.time), 'X-Native-Width': String(picture.width), 'X-Native-Height': String(picture.height), 'X-Native-Session': pullingSession.id, 'X-Native-PNG-SHA256': crypto.createHash('sha256').update(bytes).digest('hex'), 'X-Native-Pixel-SHA256': crypto.createHash('sha256').update(image.toBitmap()).digest('hex') });
      await bounded(new Promise((resolve, reject) => {
        const clean = () => { response.off('finish', finish); response.off('close', close); response.off('error', fail); };
        const finish = () => { clean(); resolve(); }, close = () => { clean(); reject(new Error('Native frame receiver disconnected')); }, fail = error => { clean(); reject(error); };
        response.once('finish', finish); response.once('close', close); response.once('error', fail); response.end(bytes);
      }), Math.max(1, deadline - Date.now()), 'Send current native PNG frame');
      return;
    }
    if (!closed && !response.destroyed) { response.writeHead(204, { 'Cache-Control': 'no-store' }); response.end(); }
  } catch (error) {
    if (!closed && !response.destroyed) {
      if (response.headersSent) response.destroy(error);
      else send(response, Date.now() >= deadline ? 504 : 400, { error: error.message });
    }
  } finally {
    response.off('close', onClose);
    // An IPC timeout cannot cancel a synchronous canvas read already executing.
    // Keep its lock until it settles, even after the HTTP response has ended.
    const release = () => { if (framePull === lock) framePull = null; };
    if (outstanding) outstanding.then(release, release); else release();
  }
}
async function requestHandler(request, response) {
  const requestOrigin = request.headers.origin;
  if (requestOrigin && requestOrigin !== ORIGIN) { send(response, 403, { error: 'Origin is not allowed' }); return; }
  if (request.headers.host !== `127.0.0.1:${PORT}`) { send(response, 403, { error: 'Host is not allowed' }); return; }
  if (requestOrigin) response.setHeader('Access-Control-Allow-Origin', ORIGIN);
  response.setHeader('Vary', 'Origin'); response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS'); response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  response.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Disposition, X-Lijiang-Export-Id, X-Native-Scene, X-Native-Frame, X-Native-Time, X-Native-Width, X-Native-Height, X-Native-Session, X-Native-PNG-SHA256, X-Native-Pixel-SHA256');
  if (request.method === 'OPTIONS') { response.writeHead(204); response.end(); return; }
  const url = new URL(request.url, `http://127.0.0.1:${PORT}`);
  try {
    if (request.method === 'GET' && url.pathname === '/health') { send(response, 200, { service: SERVICE, version: 6, capabilities: ['native-paused-dirty-render', 'native-fixed-frame-export', 'authenticated-chunked-download', 'native-live-settings', 'native-lossless-live-frames', 'native-live-viewport'], backend: 'gl', pid: process.pid, sessionActive: !!session, offscreen, offscreenFrameRate: offscreen ? 30 : null, duration: FLIGHT_DURATION, nativeProvenance: NATIVE_PROVENANCE, engineProvenance: cached.engineProvenance || null }); return; }
    if (request.method === 'GET' && url.pathname === '/status') { if (session && url.searchParams.get('sessionId') === session.id) session.lastActivity = Date.now(); send(response, 200, { ...cached, sessionId: session?.id || null }); return; }
    if (request.method !== 'POST') { send(response, 404, { error: 'Unknown native bridge route' }); return; }
    const value = await body(request);
    if (url.pathname === '/session') { await startEngine(); send(response, 200, { sessionId: session.id, token: session.token, status: cached }); return; }
    authorize(value);
    if (url.pathname === '/session/stop') { await stopEngine(); send(response, 200, { stopped: true }); return; }
    if (url.pathname === '/frame') { await presentFrame(response, value); return; }
    if (url.pathname === '/download') { await download(response); return; }
    if (url.pathname === '/offer') {
      if (!cached.ready) { send(response, 409, { error: 'Native Lijiang renderer is still initializing', status: cached }); return; }
      if (value.description?.type !== 'offer' || typeof value.description.sdp !== 'string' || value.description.sdp.length > 200000) throw new Error('Invalid video offer');
      const description = await evaluate(`window.__napaliSourceStream.answer(${JSON.stringify(value.description)})`, 'Connect local native Lijiang canvas video');
      send(response, 200, { sessionId: session.id, description }); log('video-answer-created', { sessionId: session.id }); return;
    }
    if (url.pathname === '/control') {
      if (!cached.ready) { send(response, 409, { error: 'Native Lijiang controls are not ready', status: cached }); return; }
      if (stopping) { send(response, 409, { error: 'Native renderer is being retired' }); return; }
      const viewportBusy = await evaluate('window.lijiangNativeViewport?.getState().busy||false', 'Check native viewport mutation lock');
      if (viewportBusy && !['suspend', 'cancel-record'].includes(value.method)) { send(response, 409, { error: 'Finish the native viewport change before changing the scene' }); return; }
      if (value.method === 'record') {
        if (downloads) throw new Error('Finish the active native download before starting another recording');
        await evaluate(`(()=>{const api=window.lijiangNativeExport;if(!api)throw new Error('Native offline exporter is not installed');if(window.lijiangNativeViewport?.getState().busy)throw new Error('Native viewport is still being changed');if(api.getState().active)throw new Error('Native recording is already active');void api.start().catch(error=>console.error('Native export failed: '+error.message));return api.getState();})()`, 'Start actual fixed-frame native export');
        send(response, 200, await readEngine()); return;
      }
      if (value.method === 'cancel-record') {
        await evaluate('window.lijiangNativeExport?.cancel()', 'Cancel actual native recording and await restoration', 180000);
        send(response, 200, await readEngine()); return;
      }
      if (!Object.hasOwn(methods, value.method)) throw new Error('Unknown native control');
      const activeExport = await evaluate('window.lijiangNativeExport?.getState().active||false', 'Check native recording input lock');
      if (activeExport && value.method !== 'suspend') { send(response, 409, { error: 'Finish or cancel native recording before changing the live scene' }); return; }
      const methodCode = methods[value.method](value.args || {});
      const atomicGuard = value.method === 'suspend' ? '' : `if(window.lijiangNativeViewport?.getState().busy)throw new Error('Native viewport is still being changed');if(window.lijiangNativeExport?.getState().active)throw new Error('Native recording is still active');`;
      await evaluate(atomicGuard + methodCode, 'Drive native Lijiang renderer', value.method === 'viewport' ? 180000 : 30000); send(response, 200, await readEngine()); return;
    }
    send(response, 404, { error: 'Unknown native bridge route' });
  } catch (error) { log('request-error', { path: url.pathname, message: error.message }); if (!response.headersSent) send(response, 400, { error: error.message }); }
}
if (!app.requestSingleInstanceLock()) app.quit();
else app.whenReady().then(() => {
  server = http.createServer((request, response) => { requestHandler(request, response).catch(error => { if (!response.headersSent) send(response, 500, { error: error.message }); }); });
  server.on('error', error => { log('service-error', { message: error.message }); app.exit(1); });
  server.listen(PORT, '127.0.0.1', () => { log('service-ready', { port: PORT, backend: 'gl', nativeProvenance: NATIVE_PROVENANCE }); fs.writeFileSync(path.join(LOG_DIRECTORY, 'service.json'), JSON.stringify({ service: SERVICE, pid: process.pid, port: PORT, backend: 'gl', profileDirectory: PROFILE, startedAt: new Date().toISOString(), nativeProvenance: NATIVE_PROVENANCE }, null, 2)); });
  setInterval(async () => {
    if (!session || !engine || polling) return;
    if (Date.now() - session.lastActivity > 90000) { try { await stopEngine('client-lease-expired'); } catch (error) { log('lease-retirement-error', { message: error.message }); } return; }
    polling = true; const polledSession = session;
    try { await readEngine(); } catch (error) { if (session === polledSession) cached = { ...cached, error: error.message, phase: 'error', ready: false }; } finally { polling = false; }
  }, 500);
  app.on('child-process-gone', (_event, details) => { if (details.type === 'GPU' && ['crashed', 'killed', 'abnormal-exit'].includes(details.reason)) { fatal = 'Native GPU exited: ' + details.reason; cached = { ...cached, phase: 'error', ready: false, error: fatal }; } log('child-process-gone', details); });
  log('app-ready', { electron: process.versions.electron, chrome: process.versions.chrome, service: SERVICE });
}).catch(error => { log('startup-error', { message: error.message }); app.exit(1); });
let quitting = false, quitPrepared = false;
app.on('before-quit', event => {
  if (quitPrepared) return;
  event.preventDefault(); if (quitting) return; quitting = true;
  stopEngine('service-quit').then(() => { server?.close(); quitPrepared = true; app.quit(); }).catch(error => { quitting = false; log('quit-retirement-error', { message: error.message }); });
});
app.on('window-all-closed', () => {});

module.exports = { contracts: { SERVICE, PORT, SOURCE_URL, PROFILE, LOG_DIRECTORY, FLIGHT_DURATION, NATIVE_PROVENANCE, SETTINGS_LIMITS, validateSettings, frameAfter, methods, number, initialStatus }, requestHandler };
