'use strict';

// A renderer for this task's own fixed localhost application. QA never opens,
// restores, activates or sends input to a desktop window.
const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const { runAcceptance } = require('./acceptance.cjs');

const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'renderer-config.json'), 'utf8'));
const qa = process.env.NAPALI_QA === '1' || process.argv.includes('--qa');
const qaOffscreen = qa && (process.env.NAPALI_QA_OFFSCREEN === '1' || ['lijiang-native-client','lijiang-native-hub'].includes(process.env.NAPALI_QA_SCENE));
const supportedBackends = ['vulkan', 'gl', 'd3d11'];
const requestedQABackend = qa ? process.env.NAPALI_QA_BACKEND : null;
if (requestedQABackend && !supportedBackends.includes(requestedQABackend)) throw new Error('Unknown hidden QA graphics backend');
const backend = requestedQABackend || (supportedBackends.includes(config.backend) ? config.backend : 'gl');
const workspace = path.resolve(config.workspaceDirectory);
const expectedProfile = path.join(workspace, '.cache', 'napali-electron-hub-profile');
if (!path.isAbsolute(config.profileDirectory) || path.resolve(config.profileDirectory) !== expectedProfile) {
  throw new Error('Renderer profile must be the task-owned .cache/napali-electron-hub-profile directory.');
}
const projectDirectory = path.join(workspace, 'projects', '014-programmable-worlds');
// Keep backend shader caches and single-instance locks separate. The established
// OpenGL QA profile stays intact; experiments never touch the normal app profile.
const qaProfile = path.join(workspace, '.cache', 'napali-electron-qa-profile' + (backend === 'gl' ? '' : '-' + backend));
const scene = qa ? process.env.NAPALI_QA_SCENE || 'source' : 'hub';
const profile = qa && scene === 'lijiang-native-sdf' ? 'C:\\Users\\yun68\\CodexTaskArtifacts\\014-lijiang-native-sdf-profile' : qa && scene === 'lijiang-raster' ? 'C:\\Users\\yun68\\CodexTaskArtifacts\\014-lijiang-raster-profile' : qa && scene === 'lijiang-native-hub' ? 'C:\\Users\\yun68\\CodexTaskArtifacts\\014-lijiang-native-hub-profile' : qa && scene === 'lijiang-native-client' ? 'C:\\Users\\yun68\\CodexTaskArtifacts\\014-lijiang-native-client-profile' : qa && scene === 'lijiang-native' ? 'C:\\Users\\yun68\\CodexTaskArtifacts\\014-lijiang-native-profile' : qa ? qaProfile : expectedProfile;
if(qa&&['lijiang-native-sdf','lijiang-raster','lijiang-native','lijiang-native-client','lijiang-native-hub'].includes(scene)){try{const os=require('node:os');os.setPriority(0,os.constants.priority.PRIORITY_BELOW_NORMAL);}catch{}}
const qaFrameRate=qa&&scene==='lijiang'&&process.env.LIJIANG_QA_FPS==='60'?60:30;
const scenePaths = { 'lijiang-native-sdf':'lijiang-native/engine.html', 'lijiang-raster':'lijiang-native/raster.html', hub: 'index.html', source: 'runtime/index.html', 'source-live': 'runtime/source-live.html', 'canal-real': 'canal-real/index.html', 'shipyard-station':'shipyard-station/index.html',lijiang:'lijiang-flythrough/build/index.html','lijiang-hub':'index.html#lijiang','lijiang-native-hub':'index.html#lijiang','lijiang-native':'lijiang-native/engine.html','lijiang-native-client':'lijiang-native/index.html', window: 'demos/window.html', story: 'demos/story.html', calibration: 'demos/window.html', look: 'demos/window.html', water: 'demos/window.html' };
if (!(scene in scenePaths)) throw new Error('Unknown task renderer scene');
const compileOnly = qa && process.env.NAPALI_QA_COMPILE_ONLY === '1';
if (compileOnly && scene !== 'source') throw new Error('Compile-only acceptance is only available for the preserved source renderer');
const sourceURL = new URL(scenePaths[scene], 'http://127.0.0.1:8796/projects/014-programmable-worlds/web/');
if(qa&&scene==='canal-real'&&process.env.NAPALI_CANAL_EXPORT==='1')sourceURL.searchParams.set('gi','0');
if(qa&&scene==='shipyard-station'&&process.env.NAPALI_STATION_EXPORT==='1')sourceURL.searchParams.set('gi','0');
if(qa&&scene==='canal-real'&&process.env.NAPALI_CANAL_PROBES==='1')sourceURL.searchParams.set('probes','1');
if(qa&&scene==='canal-real'&&process.env.NAPALI_CANAL_STREET_PROBES==='1')sourceURL.searchParams.set('streetProbes','1');
if(qa&&scene==='canal-real'&&['r4','r5'].includes(process.env.NAPALI_CANAL_GI))sourceURL.searchParams.set('giSet',process.env.NAPALI_CANAL_GI);
if(qa&&scene==='canal-real'&&process.env.NAPALI_CANAL_EXPERIENCE){
  if(!['window','story'].includes(process.env.NAPALI_CANAL_EXPERIENCE))throw new Error('Unknown canal experience');
  sourceURL.searchParams.set('experience',process.env.NAPALI_CANAL_EXPERIENCE);
}
if (qa) { sourceURL.searchParams.set('qa', '1'); sourceURL.searchParams.set('rs', '1'); sourceURL.searchParams.set('t', '0'); sourceURL.searchParams.set('qaRun', Date.now().toString()); }
if (compileOnly) sourceURL.searchParams.set('compileonly', '1');
if(qa&&scene==='lijiang-native'){sourceURL.searchParams.set('embed','1');sourceURL.searchParams.set('t','40');sourceURL.searchParams.set('bandpx','12000');sourceURL.searchParams.set('hud','0');if(process.env.LIJIANG_NATIVE_PRODUCTION!=='1')sourceURL.searchParams.set('qualityview','1');if(process.env.LIJIANG_NATIVE_MC2==='1')sourceURL.searchParams.set('mc2','1');if(process.env.LIJIANG_NATIVE_DEBUG==='85')sourceURL.searchParams.set('dbgm','85');}
if(qa&&scene==='lijiang-native-client')sourceURL.searchParams.set('embed','1');
if(qa&&scene==='lijiang-native-sdf'){
  sourceURL.searchParams.set('fieldsonly','1');sourceURL.searchParams.set('sdfpilot','1');sourceURL.searchParams.set('embed','1');
  if(process.env.LIJIANG_SDF_RES){
    const resolution=Number(process.env.LIJIANG_SDF_RES);
    if(!Number.isInteger(resolution)||resolution<64||resolution>512)throw new Error('LIJIANG_SDF_RES must be an integer from 64 to 512');
    sourceURL.searchParams.set('sdfres',String(resolution));
  }
}
if(qa&&scene==='lijiang-native-sdf'&&process.env.LIJIANG_SDF_SURFACE==='1'){sourceURL.searchParams.set('surfacebake','1');sourceURL.searchParams.set('radiancebake','1');}
if(qa&&scene==='lijiang-native-sdf'&&process.env.LIJIANG_COMPARE_SURFACE==='1')sourceURL.searchParams.set('compareSurface','1');
if(qa&&scene==='lijiang-native-sdf'&&process.env.LIJIANG_SURFACE_SPEC==='1')sourceURL.searchParams.set('surfaceSpec','1');
if(qa&&scene==='lijiang-native-sdf'&&process.env.LIJIANG_ROCK_BATCH==='1')sourceURL.searchParams.set('rocks','1');
if(qa&&scene==='lijiang-native-sdf'&&process.env.LIJIANG_NATIVE_MATERIAL==='1')sourceURL.searchParams.set('materialOnly','1');
if(qa&&scene==='lijiang-raster'&&process.env.LIJIANG_RASTER_SURFACE==='1')sourceURL.searchParams.set('surface','1');
if(qa&&scene==='lijiang-raster'&&process.env.LIJIANG_RASTER_MATERIAL==='1')sourceURL.searchParams.set('material','1');
if(qa&&scene==='lijiang-raster'&&process.env.LIJIANG_RASTER_LAYER)sourceURL.searchParams.set('layer',process.env.LIJIANG_RASTER_LAYER);
if(qa&&scene==='lijiang-raster'&&process.env.LIJIANG_RASTER_CACHE==='1')sourceURL.searchParams.set('qaFields','1');
if(qa&&scene==='lijiang-raster'&&process.env.LIJIANG_RASTER_SDF==='1')sourceURL.searchParams.set('sdfPilot','1');
const sourceOrigin = sourceURL.origin;
function allowedExternal(destination) {
  try {
    const parsed = new URL(destination);
    return parsed.protocol === 'https:' && ['github.com', 'x.com'].includes(parsed.hostname) && !parsed.username && !parsed.password && (!parsed.port || parsed.port === '443');
  } catch { return false; }
}
fs.mkdirSync(profile, { recursive: true });
app.setName(qa ? 'Na Pali Hidden Acceptance' : 'Programmable Worlds Research Hub');
app.setPath('userData', profile);
app.setPath('sessionData', profile);
if(qa&&scene==='lijiang-native-hub'){for(const name of ['temp','crashDumps']){const destination=path.join(profile,name);fs.mkdirSync(destination,{recursive:true});app.setPath(name,destination);}process.env.TEMP=path.join(profile,'temp');process.env.TMP=process.env.TEMP;}
app.commandLine.appendSwitch('use-gl', 'angle');
app.commandLine.appendSwitch('use-angle', backend);
if (qa) {
  // Only this task-owned hidden client; retain all disk data and user profiles.
  app.commandLine.appendSwitch('disable-http-cache');
  app.commandLine.appendSwitch('disable-renderer-backgrounding');
  app.commandLine.appendSwitch('disable-background-timer-throttling');
  app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
}

const diagnosticFile = path.join(profile, 'diagnostics.jsonl');
function record(event, data = {}) {
  fs.appendFileSync(diagnosticFile, JSON.stringify({ at: new Date().toISOString(), event, backend, qa, pid: process.pid, ...data }) + '\n', 'utf8');
}
function gpuProcesses() {
  try { return app.getAppMetrics().filter(metric => metric.type === 'GPU').map(metric => ({ pid: metric.pid, creationTime: metric.creationTime, sandboxed: metric.sandboxed, integrityLevel: metric.integrityLevel })); }
  catch { return []; }
}
let window;
let fatal = null;
let nativeHubInitialHealth = null;
let offscreenPaints=0,firstPaintAt=null,lastPaintAt=null;
const getPresentation=()=>({offscreen:qaOffscreen,targetFrameRate:qaOffscreen?qaFrameRate:null,paints:offscreenPaints,firstPaintAt,lastPaintAt});
const lock = app.requestSingleInstanceLock();
if (!lock) app.quit();
else {
  app.on('second-instance', () => {
    if (!qa && window) { if (window.isMinimized()) window.restore(); window.show(); window.focus(); }
  });
  app.whenReady().then(async () => {
    record('app-ready', { electron: process.versions.electron, chrome: process.versions.chrome, executable: process.execPath, useGL: 'angle', useAngle: backend, scene, compileOnly, qaOffscreen, url: sourceURL.href });
    window = new BrowserWindow({
      width: 1440, height: 900, minWidth: qa ? 320 : 860, minHeight: qa ? 400 : 600,
      show: !qa, skipTaskbar: qa, focusable: !qa, paintWhenInitiallyHidden: true,
      title: qa ? 'Na Pali · 隐藏验收 · ANGLE ' + backend : '可编程世界 · 创作研究 · ANGLE ' + backend,
      backgroundColor: '#030a14', autoHideMenuBar: true,
      webPreferences: {
        offscreen: qaOffscreen,
        sandbox: true, contextIsolation: true, nodeIntegration: false,
        preload: !qa || ['hub','lijiang-hub','lijiang-native-hub'].includes(scene) ? path.join(__dirname, 'navigation-preload.cjs') : undefined,
        additionalArguments: ['--worlds-host-backend=' + backend],
        webSecurity: true, allowRunningInsecureContent: false,
        webviewTag: false, devTools: false, spellcheck: false,
        backgroundThrottling: !qa,
        partition: qa ? 'persist:napali-hidden-acceptance' : 'persist:napali-local-renderer'
      }
    });
    if(qaOffscreen){window.webContents.setFrameRate(qaFrameRate);window.webContents.on('paint',()=>{const now=Date.now();offscreenPaints++;firstPaintAt??=now;lastPaintAt=now;if(offscreenPaints===1||offscreenPaints%300===0)record('qa-offscreen-paints',getPresentation());});}
    if (qa) window.webContents.setBackgroundThrottling(false);
    window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    window.webContents.session.setPermissionCheckHandler(() => false);
    ipcMain.on('worlds-user-external-link', (event, destination) => {
      if (qa || !window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || !allowedExternal(destination)) return;
      try { if (new URL(event.senderFrame.url).origin !== sourceOrigin) return; } catch { return; }
      shell.openExternal(destination).catch(error => record('external-link-error', { message: error.message }));
    });
    window.webContents.setWindowOpenHandler(({ url }) => {
      if (!qa) {
        try {
          if (new URL(url).origin === sourceOrigin) window.loadURL(url).catch(error => record('local-link-error', { message: error.message }));
        } catch { /* Invalid destinations are denied. */ }
      }
      return { action: 'deny' };
    });
    window.webContents.on('will-navigate', (event, destination) => {
      try { if (new URL(destination).origin !== sourceOrigin) event.preventDefault(); }
      catch { event.preventDefault(); }
    });
    window.webContents.on('will-attach-webview', event => event.preventDefault());
    window.webContents.on('console-message', details => record('renderer-console', {
      level: details.level, message: String(details.message || '').slice(0, 4000),
      lineNumber: details.lineNumber, sourceId: details.sourceId
    }));
    window.webContents.on('did-finish-load', () => record('page-loaded'));
    window.webContents.on('did-fail-load', (_event, code, description, _url, isMainFrame) => {
      if (isMainFrame) { fatal = 'Page load failed: ' + description; record('page-load-failed', { code, description }); }
    });
    window.webContents.on('render-process-gone', (_event, details) => {
      fatal = 'Renderer exited: ' + details.reason;
      record('renderer-exit', { reason: details.reason, exitCode: details.exitCode });
    });
    window.on('closed', () => { window = null; });
    try {
      if(qa&&scene==='lijiang-native-hub')nativeHubInitialHealth=process.env.LIJIANG_RASTER_HUB==='1'?await require('./lijiang-raster-hub-acceptance.cjs').probeLijiangRasterHubIsolation():await require('./lijiang-native-hub-acceptance.cjs').probeNativeHubOwnership();
      await window.loadURL(sourceURL.href);
    }
    catch (error) {
      fatal = error.message; record('load-error', { message: error.message });
      if (!qa) dialog.showErrorBox('Na Pali 本地服务不可用', '请确认本地服务运行在 127.0.0.1:8796，然后重新打开此应用。');
    }
    app.getGPUInfo('basic').then(information => {
      record('gpu-information', { mainGpu: information.gpuDevice?.find(device => device.active) || null, information, status: app.getGPUFeatureStatus(), gpuProcesses: gpuProcesses() });
    }).catch(error => record('gpu-information-error', { message: error.message }));
    if (qa) {
      const runner = scene === 'lijiang-native-sdf' ? require('./lijiang-native-sdf-acceptance.cjs').runLijiangNativeSdfAcceptance : scene === 'lijiang-raster' ? (process.env.LIJIANG_RASTER_INTERACTION==='1'?require('./lijiang-raster-interaction-acceptance.cjs').runLijiangRasterInteractionAcceptance:require('./lijiang-raster-acceptance.cjs').runLijiangRasterAcceptance) : compileOnly ? require('./compile-acceptance.cjs').runCompileAcceptance : scene === 'source-live' ? require('./source-live-acceptance.cjs').runSourceLiveAcceptance : scene === 'canal-real' ? require('./canal-acceptance.cjs').runCanalAcceptance : scene === 'lijiang-native-hub' ? (process.env.LIJIANG_RASTER_HUB==='1'?require('./lijiang-raster-hub-acceptance.cjs').runLijiangRasterHubAcceptance:require('./lijiang-native-hub-acceptance.cjs').runLijiangNativeHubAcceptance) : scene === 'lijiang-native-client' ? (process.env.LIJIANG_NATIVE_IDLE_CLIENT_QA==='1' ? require('./lijiang-native-idle-client-acceptance.cjs').runLijiangNativeIdleClientAcceptance : require('./lijiang-native-client-acceptance.cjs').runLijiangNativeClientAcceptance) : scene === 'lijiang-native' ? (process.env.LIJIANG_NATIVE_IDLE_QA==='1' ? require('./lijiang-native-idle-acceptance.cjs').runLijiangNativeIdleAcceptance : process.env.LIJIANG_NATIVE_PERF==='1' ? require('./lijiang-native-performance.cjs').runLijiangNativePerformance : require('./lijiang-native-acceptance.cjs').runLijiangNativeAcceptance) : scene === 'lijiang-hub' ? require('./lijiang-hub-acceptance.cjs').runLijiangHubAcceptance : scene === 'lijiang' ? require('./lijiang-acceptance.cjs').runLijiangAcceptance : scene === 'shipyard-station' ? require('./station-acceptance.cjs').runStationAcceptance : scene === 'hub' ? require('./hub-acceptance.cjs').runHubAcceptance : runAcceptance;
      const result = await runner({ window, projectDirectory, workspaceDirectory: workspace, record, backend, scene, getFatal: () => fatal, getPresentation, initialBridgeHealth: nativeHubInitialHealth });
      record('qa-result', { status: result.status, tests: result.tests.length, errors: result.errors, presentation:getPresentation() });
      if (window && !window.isDestroyed()) window.destroy();
      app.exit(result.status === 'passed' ? 0 : 1);
    }
  }).catch(error => {
    record('startup-error', { message: error.message, stack: error.stack });
    if (!qa) dialog.showErrorBox('Na Pali 启动失败', error.message);
    app.exit(1);
  });
  app.on('gpu-info-update', () => record('gpu-feature-status', { status: app.getGPUFeatureStatus(), gpuProcesses: gpuProcesses() }));
  app.on('child-process-gone', (_event, details) => {
    if (qa && details.type === 'GPU' && ['crashed', 'killed', 'abnormal-exit'].includes(details.reason)) fatal = 'GPU process exited: ' + details.reason + ' (' + details.exitCode + ')';
    record('child-process-exit', { type: details.type, reason: details.reason, exitCode: details.exitCode });
  });
  app.on('window-all-closed', () => app.quit());
}
