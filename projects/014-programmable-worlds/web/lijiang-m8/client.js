'use strict';
(() => {
  const BASE = 'http://127.0.0.1:8798', SERVICE = 'lijiang-native-bridge', DURATION = 45;
  const parameters = new URLSearchParams(location.search), embedded = parameters.get('embed') === '1', qa = parameters.get('qa') === '1';
  const $ = id => document.getElementById(id), video = $('live-video'), viewport = $('viewport'), canvas = $('lossless-frame');
  const displayContext = canvas.getContext('2d', { alpha: false, colorSpace: 'srgb', willReadFrequently: true }), staging = document.createElement('canvas'), stagingContext = staging.getContext('2d', { alpha: false, colorSpace: 'srgb', willReadFrequently: true });
  if (!displayContext || !stagingContext) throw new Error('无法准备原生无损画面。');
  const keys = new Set(), retirements = new Map(), unretired = new Map(), listeners = new AbortController();
  let session = null, peer = null, generation = 0, stopped = false, starting = false, disposed = false, parentVisible = !embedded;
  let latest = { phase: 'idle', ready: false, state: null, drive: null, error: null };
  let decodedFrames = 0, receivedAt = null, rendererReady = false, uiHidden = false;
  let pollTimer = null, retryTimer = null, sessionCreation = null, stopTask = null, videoCallback = null;
  let controlTail = Promise.resolve(), desiredFree = false, pointer = null, cleanPointer = null, lookX = 0, lookY = 0, motionBusy = false, lastMotion = performance.now();
  let fps = null, fpsHistory = [], fpsSample = null;
  let recordRequested = false, recordUISnapshot = null, downloadBusy = false;
  let frameAbort = null, frameWork = null;
  const emptyPresentation = () => ({ actualFrame: 0, actualTime: null, receivedFrames: 0, width: 0, height: 0, receivedAt: null, pngBytes: 0, pngSha256: null, pixelSha256: null, sessionId: null, viewportEpoch: -1, error: null });
  let presentation = emptyPresentation();
  let viewportEpoch = 0, viewportRequest = null, viewportTimer = null, viewportError = null;
  let viewportTarget = viewportFor(currentAspect()), pendingViewportAspect = viewportTarget.aspect;
  const SETTINGS_LIMITS = Object.freeze({ sunEl: [2, 60], sunAz: [-180, 180], fog: [0, .001], mistH: [10, 350], mistK: [0, 5], expo: [.5, 1.8], sat: [.5, 1.3], waveStrength: [0, 2], waveSpeed: [0, 2], colorTemperature: [-1, 1] });
  let parametersOpen = false, settingsTimer = null, pendingSettings = {}, settingsSending = {}, settingsInFlight = null;
  const finite = (value, fallback = 0) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  const active = () => parentVisible && (qa || !document.hidden) && !stopped && !disposed;
  const presentationReady = () => !!session && presentation.sessionId === session.sessionId && presentation.actualFrame >= 1 && !presentation.error && !canvas.hidden;
  const viewportMatches = () => presentationReady() && presentation.width === viewportTarget.width && presentation.height === viewportTarget.height && presentation.viewportEpoch === viewportEpoch;
  const viewportStable = () => !!latest.viewport && latest.viewport.revision === 'native-live-viewport-1' && !latest.viewport.busy && !latest.viewport.error && latest.viewport.width === viewportTarget.width && latest.viewport.height === viewportTarget.height && latest.viewport.renderWidth === viewportTarget.width && latest.viewport.renderHeight === viewportTarget.height;
  const viewportChanging = () => !!session && !disposed && !stopped && (pendingViewportAspect !== null || !!viewportRequest || !viewportStable() || !viewportMatches());
  const ready = () => !disposed && !stopped && rendererReady && peer?.connectionState === 'connected' && decodedFrames > 0 && video.videoWidth > 0 && presentationReady() && viewportStable() && viewportMatches() && pendingViewportAspect === null && !viewportRequest;
  const recording = () => !disposed && !stopped && (recordRequested || latest.exportState?.active === true);
  const listen = (target, type, listener, options = {}) => target.addEventListener(type, listener, { ...options, signal: listeners.signal });
  const format = value => Math.floor(value / 60) + ':' + String(Math.floor(value) % 60).padStart(2, '0');
  function currentAspect() { return Math.max(.1, Math.min(8, innerWidth > 0 && innerHeight > 0 ? innerWidth / innerHeight : 1440 / 902)); }
  function viewportFor(aspect) {
    const width = aspect < .85 ? Math.max(2, Math.round(Math.sqrt(1440 * 902 * aspect) / 2) * 2) : 1440;
    const height = aspect < .85 ? Math.max(2, Math.round(Math.sqrt(1440 * 902 / aspect) / 2) * 2) : 902;
    return { width, height, aspect, mode: aspect < .85 ? 'portrait' : 'desktop', epoch: viewportEpoch };
  }
  function queueViewport() {
    const aspect = currentAspect(), next = viewportFor(aspect);
    if (next.width !== viewportTarget.width || next.height !== viewportTarget.height) { viewportEpoch++; abortFrame(); }
    viewportTarget = { ...next, epoch: viewportEpoch }; pendingViewportAspect = aspect; viewportError = null;
    clearTimeout(viewportTimer); viewportTimer = setTimeout(() => { viewportTimer = null; maybeViewport(); }, 250);
    updateUI();
  }
  function maybeViewport() {
    if (!active() || !session || !rendererReady || !latest.viewport || viewportRequest || viewportTimer || pendingViewportAspect === null || recording()) return;
    const aspect = pendingViewportAspect, current = generation; pendingViewportAspect = null;
    const work = command('viewport', { aspect }).catch(error => { if (current === generation && !stopped && !disposed) { viewportError = error.message || String(error); fail(error); } throw error; }).finally(() => {
      if (viewportRequest === work) viewportRequest = null;
      if (current === generation && !disposed && !stopped) { updateUI(); if (pendingViewportAspect !== null) maybeViewport(); else maybePresent(); }
    });
    viewportRequest = work; work.catch(() => {}); updateUI();
  }
  async function commitViewport() {
    clearTimeout(viewportTimer); viewportTimer = null; maybeViewport();
    const deadline = performance.now() + 180000;
    while (viewportChanging()) {
      if (viewportError || latest.error) throw new Error(viewportError || latest.error);
      if (performance.now() >= deadline) throw new Error('原生画幅的新画面尚未完成。');
      if (viewportRequest) await viewportRequest;
      else { maybeViewport(); maybePresent(); await new Promise(resolve => setTimeout(resolve, 50)); }
    }
  }
  function resetMotion() { keys.clear(); pointer = null; cleanPointer = null; lookX = lookY = 0; lastMotion = performance.now(); }
  function formatSetting(key, value) {
    if (!Number.isFinite(value)) return '—';
    if (key === 'sunEl') return value.toFixed(1) + '°';
    if (key === 'sunAz') return value.toFixed(0) + '°';
    if (key === 'mistH') return value.toFixed(0) + ' m';
    if (key === 'fog') return value.toFixed(5);
    return (key === 'colorTemperature' && value > 0 ? '+' : '') + value.toFixed(2);
  }
  function layoutSettingsPanel() {
    const panel = $('settings-panel');
    if (!parametersOpen || panel.hidden || uiHidden) return;
    const transport = document.querySelector('.transport').getBoundingClientRect(), box = panel.getBoundingClientRect();
    const top = innerWidth <= 700 ? Math.ceil(Math.max(innerHeight <= 700 ? 92 : 126, document.querySelector('.title').getBoundingClientRect().bottom + 10, document.querySelector('.settings').getBoundingClientRect().bottom + 12)) : 112;
    const intersectsTransport = box.left < transport.right && box.right > transport.left;
    const bottom = intersectsTransport ? Math.min(innerHeight - 16, transport.top - 12) : innerHeight - 18;
    panel.style.top = top + 'px'; panel.style.maxHeight = Math.max(0, Math.floor(bottom - top)) + 'px';
  }
  function updateSettingsUI(isReady, busy) {
    const state = latest.settings, values = state?.values || state || {};
    $('parameters').hidden = !state; $('parameters').disabled = !isReady || busy;
    $('parameters').setAttribute('aria-expanded', String(parametersOpen)); $('settings-close').disabled = busy;
    $('settings-panel').hidden = !parametersOpen || !state;
    document.body.classList.toggle('settings-open', parametersOpen && !!state);
    for (const key of Object.keys(SETTINGS_LIMITS)) {
      const input = $('setting-' + key), value = pendingSettings[key] ?? settingsSending[key] ?? values[key];
      input.disabled = !isReady || busy;
      if (Number.isFinite(value) && (document.activeElement !== input || busy)) input.value = String(value);
      $('setting-value-' + key).textContent = formatSetting(key, value);
    }
    layoutSettingsPanel();
  }
  function setParametersOpen(value) {
    if (recording() || !latest.settings) return getState();
    parametersOpen = !!value; updateUI(); return getState();
  }
  function validateSettings(partial) {
    if (!partial || typeof partial !== 'object' || Array.isArray(partial)) throw new Error('画面参数应为一个对象。');
    const values = {};
    for (const [key, value] of Object.entries(partial)) {
      if (!Object.hasOwn(SETTINGS_LIMITS, key)) throw new Error('未知的原生画面参数：' + key);
      const [min, max] = SETTINGS_LIMITS[key];
      if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error('画面参数超出范围：' + key);
      values[key] = value;
    }
    return values;
  }
  async function setSettings(partial) {
    const values = validateSettings(partial);
    if (!ready() || !latest.settings) throw new Error('原生画面参数尚未就绪。');
    if (recording()) throw new Error('请先完成或取消导出，再调整画面参数。');
    return command('settings', { values });
  }
  function settingsError(error) { if (!disposed && !stopped) $('settings-feedback').textContent = error?.message || String(error); }
  function flushSettings() {
    clearTimeout(settingsTimer); settingsTimer = null;
    if (settingsInFlight) return settingsInFlight;
    if (!Object.keys(pendingSettings).length) return Promise.resolve(getState());
    const values = pendingSettings; pendingSettings = {}; settingsSending = values; const current = generation;
    const work = setSettings(values).then(state => { if (current === generation && !disposed) $('settings-feedback').textContent = '已更新，稍候画面完成这一帧。'; return state; }).finally(() => {
      if (settingsInFlight === work) { settingsInFlight = null; settingsSending = {}; }
      if (current === generation && !disposed && !stopped) { updateUI(); if (Object.keys(pendingSettings).length && !recording()) settingsTimer = setTimeout(() => { flushSettings().catch(settingsError); }, 180); }
    });
    settingsInFlight = work; return work;
  }
  async function commitSettings() {
    clearTimeout(settingsTimer); settingsTimer = null;
    while (settingsInFlight || Object.keys(pendingSettings).length) { if (settingsInFlight) await settingsInFlight; else await flushSettings(); }
  }
  function updateFps(state) {
    const now = performance.now(), frames = finite(state?.frames, -1);
    if (frames < 0) { fps = null; fpsHistory = []; fpsSample = null; return; }
    const previous = fpsHistory.at(-1);
    if (previous && (frames < previous.frames || now < previous.at)) fpsHistory = [];
    if (fpsHistory.at(-1)?.at === now) fpsHistory[fpsHistory.length - 1] = { frames, at: now }; else fpsHistory.push({ frames, at: now });
    // Keep the sample immediately before the 10s cutoff. Normal status polls
    // make this a roughly 10–11s real renderer-frame window, never video FPS.
    while (fpsHistory.length > 2 && fpsHistory[1].at <= now - 10000) fpsHistory.shift();
    const first = fpsHistory[0];
    if (first && now > first.at) {
      const elapsedMs = now - first.at, frameDelta = frames - first.frames;
      fps = frameDelta * 1000 / elapsedMs;
      fpsSample = { frameDelta, elapsedMs, firstFrame: first.frames, lastFrame: frames, measuredAt: now, windowTargetMs: 10000, samples: fpsHistory.length, source: 'rolling actual renderer state.frames delta; video decoded callbacks are excluded' };
    } else { fps = null; fpsSample = null; }
  }
  function abortFrame() { frameAbort?.abort(); }
  function resetPresentation() {
    abortFrame(); presentation = emptyPresentation(); canvas.hidden = true; canvas.width = canvas.height = 1; canvas.dataset.frame = ''; canvas.dataset.time = ''; staging.width = staging.height = 1;
  }
  async function digest(bytes) {
    const result = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(result)].map(value => value.toString(16).padStart(2, '0')).join('');
  }
  function maybePresent() {
    if (!active() || !session || !rendererReady || recording() || viewportRequest || pendingViewportAspect !== null || !viewportStable() || frameWork || finite(latest.state?.frames) <= presentation.actualFrame) return;
    const identity = { ...session }, current = generation, viewEpoch = viewportEpoch, controller = new AbortController(); frameAbort = controller;
    const stillCurrent = () => current === generation && viewEpoch === viewportEpoch && session?.sessionId === identity.sessionId && !disposed && !stopped && !recording() && !viewportRequest && pendingViewportAspect === null && !controller.signal.aborted;
    let bitmap = null, succeeded = false, timedOut = false;
    const work = (async () => {
      const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 40000);
      try {
        const response = await fetch(BASE + '/frame', { method: 'POST', mode: 'cors', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...identity, afterFrame: presentation.actualFrame }), signal: controller.signal });
        if (!stillCurrent()) return;
        if (response.type === 'opaque' || response.type === 'opaqueredirect') throw new Error('无损画面响应不可读取。');
        if (response.status === 204 || response.status === 429) return;
        if (!response.ok) { let detail; try { detail = await response.json(); } catch {} if (!stillCurrent() || detail?.recording || detail?.viewport) return; throw new Error(detail?.error || '原生无损画面暂时不可用。'); }
        const frame = Number(response.headers.get('X-Native-Frame')), time = Number(response.headers.get('X-Native-Time')), width = Number(response.headers.get('X-Native-Width')), height = Number(response.headers.get('X-Native-Height'));
        const pngSha256 = response.headers.get('X-Native-PNG-SHA256'), pixelSha256 = response.headers.get('X-Native-Pixel-SHA256');
        if (response.headers.get('X-Native-Scene') !== 'lijiang-native' || response.headers.get('X-Native-Session') !== identity.sessionId || !Number.isSafeInteger(frame) || frame <= presentation.actualFrame || !Number.isFinite(time) || !Number.isSafeInteger(width) || width < 2 || !Number.isSafeInteger(height) || height < 2 || !/^image\/png(?:;|$)/i.test(response.headers.get('Content-Type') || '') || !/^[a-f0-9]{64}$/.test(pngSha256 || '') || !/^[a-f0-9]{64}$/.test(pixelSha256 || '')) throw new Error('原生无损帧的场景、会话、序号或尺寸不一致。');
        if (width !== viewportTarget.width || height !== viewportTarget.height) return;
        const blob = await response.blob(); if (!stillCurrent()) return;
        if (!blob.size || blob.type !== 'image/png') throw new Error('原生无损画面不是完整 PNG。');
        const bytes = await blob.arrayBuffer(); if (!stillCurrent()) return;
        const actualPNGHash = await digest(bytes); if (!stillCurrent()) return;
        if (actualPNGHash !== pngSha256) throw new Error('无损 PNG 传输校验不一致。');
        bitmap = await createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' }); if (!stillCurrent()) return;
        if (bitmap.width !== width || bitmap.height !== height) throw new Error('无损 PNG 原始尺寸与帧标记不一致。');
        staging.width = width; staging.height = height; stagingContext.imageSmoothingEnabled = false; stagingContext.drawImage(bitmap, 0, 0);
        const pixels = stagingContext.getImageData(0, 0, width, height), bgra = new Uint8Array(pixels.data.length);
        for (let i = 0; i < bgra.length; i += 4) { bgra[i] = pixels.data[i + 2]; bgra[i + 1] = pixels.data[i + 1]; bgra[i + 2] = pixels.data[i]; bgra[i + 3] = pixels.data[i + 3]; }
        const actualPixelHash = await digest(bgra); if (!stillCurrent()) return;
        if (actualPixelHash !== pixelSha256) throw new Error('无损解码后的原始像素校验不一致。');
        if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
        displayContext.putImageData(pixels, 0, 0); canvas.hidden = false; canvas.dataset.frame = String(frame); canvas.dataset.time = String(time);
        presentation = { actualFrame: frame, actualTime: time, receivedFrames: presentation.receivedFrames + 1, width, height, receivedAt: performance.now(), pngBytes: blob.size, pngSha256, pixelSha256, sessionId: identity.sessionId, viewportEpoch: viewEpoch, error: null };
        succeeded = true; updateUI();
      } catch (error) {
        if (current === generation && viewEpoch === viewportEpoch && session?.sessionId === identity.sessionId && !disposed && !stopped && !recording() && (error.name !== 'AbortError' || timedOut)) { presentation.error = timedOut ? '原生无损帧接收超时。' : error.message || String(error); fail(new Error(presentation.error)); }
      } finally { clearTimeout(timer); bitmap?.close(); staging.width = staging.height = 1; }
    })().finally(() => {
      if (frameWork === work) { frameWork = null; if (frameAbort === controller) frameAbort = null; }
      if (succeeded && stillCurrent() && finite(latest.state?.frames) > presentation.actualFrame) maybePresent();
    });
    frameWork = work;
  }
  async function request(route, value, timeout = 12000) {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(BASE + route, { method: value === undefined ? 'GET' : 'POST', mode: 'cors', cache: 'no-store', headers: value === undefined ? undefined : { 'Content-Type': 'application/json' }, body: value === undefined ? undefined : JSON.stringify(value), signal: controller.signal });
      let result;
      try { result = await response.json(); } catch { throw new Error('漓江服务返回了无法读取的状态。'); }
      if (!response.ok) throw new Error(result.error || '漓江实时服务暂时不可用（' + response.status + '）。');
      return result;
    } finally { clearTimeout(timer); }
  }
  function updateUI() {
    const state = latest.state || {}, isReady = ready(), time = finite(state.time), capture = latest.exportState, busy = recording(), viewBusy = viewportChanging();
    document.body.classList.toggle('free', desiredFree);
    document.body.classList.toggle('ui-hidden', uiHidden);
    for (const e of document.querySelectorAll('.transport button,.transport input,.transport select,#clean')) e.disabled = !isReady || busy;
    $('record').hidden = capture?.supported !== true; $('record').disabled = !isReady || busy || downloadBusy;
    $('capture-status').hidden = !busy; document.body.classList.toggle('export-complete', !busy && capture?.phase === 'complete');
    $('capture-progress').value = finite(capture?.progress);
    $('capture-label').textContent = downloadBusy ? '正在读取原生航拍文件…' : !busy && capture?.phase === 'complete' ? '原生航拍已完成。' : capture?.phase === 'cancelling' ? '正在取消并恢复原画面…' : capture?.phase === 'finalizing' ? '正在封装 WebM…' : '正在逐帧制作原生航拍 ' + Math.floor(finite(capture?.progress) * 100) + '%';
    const target = capture?.capture || capture?.fixedCapture || { width: 1920, height: 1080, fps: 60, frameCount: 2700 };
    $('capture-detail').textContent = busy ? finite(capture?.frameCount) + ' / ' + finite(capture?.totalFrames, target.frameCount) + ' 帧 · ' + target.width + '×' + target.height + ' · ' + target.fps + ' 帧/秒' : '1920×1080 · 60 帧/秒 · 45 秒';
    $('cancel-record').hidden = !busy; $('cancel-record').disabled = capture?.phase === 'cancelling';
    $('download-record').hidden = busy || capture?.phase !== 'complete' || !capture?.metadata; $('download-record').disabled = downloadBusy || !isReady;
    $('loading').hidden = isReady || (presentationReady() && viewBusy && !latest.error && !viewportError);
    $('play').textContent = state.paused ? time >= DURATION ? '播放航拍' : time <= .05 ? '开始航拍' : '继续航拍' : '暂停航拍';
    $('play').setAttribute('aria-pressed', String(!!state.paused));
    $('mode').textContent = desiredFree ? '返回航线 · C' : '自由观察 · C';
    $('mode').setAttribute('aria-pressed', String(desiredFree));
    const selectedShot = [0, 12, 25, 45].find(value => Math.abs(value - time) <= .05);
    $('shot').value = desiredFree ? 'free' : selectedShot === undefined ? 'custom' : String(selectedShot);
    if (document.activeElement !== $('timeline')) $('timeline').value = String(time);
    $('clock').textContent = format(time) + ' / 0:45';
    $('fps').textContent = state.idle ? '静止视角' : fps === null ? '-- FPS' : fps.toFixed(1) + ' FPS';
    updateSettingsUI(isReady, busy || viewBusy);
    if (viewBusy) $('status').textContent = viewportError ? '画幅未能完成，请重试' : '正在调整画幅，稍候新画面…';
    if (isReady) {
      $('status').textContent = downloadBusy ? '正在读取原生航拍文件…' : capture?.phase === 'complete' ? capture.metadata?.qaTestOnly ? 'QA 短片已完成，可下载 WebM' : '航拍已完成，可下载 WebM' : capture?.phase === 'error' ? '导出未完成：' + (capture.error || '请重试') : state.suspended ? '已暂停计算，返回时继续' : state.idle ? '画面已停稳 · 播放或操作时继续' : desiredFree ? '自由观察 · 当前实时画面' : '候选航线 · 当前实时画面';
      $('loading-detail').textContent = '';
    } else if (!latest.error) {
      const phase = String(latest.phase || '');
      $('progress').textContent = disposed ? '此候选场景已释放。' : stopped ? '实时场景已停止。' : rendererReady ? '连接当前实时画面…' : /compil/i.test(phase) ? '正在编译原生山水着色器…' : /generat|terrain|eros/i.test(phase) ? '正在生成山体、水面与植被…' : '正在准备漓江原生候选场景…';
      const detail = latest.progress || latest.diagnostics?.message || latest.diagnostics?.text || latest.diagnostics?.loadText;
      $('loading-detail').textContent = typeof detail === 'string' && detail.length < 220 ? detail : '完整场景准备后，才会连接当前实时画面。';
    }
  }
  function applyStatus(value) {
    if (value && typeof value === 'object') latest = { ...latest, ...value };
    const state = latest.state;
    if (latest.ready && state?.ready && (state.duration !== DURATION || state.scale !== 1 || state.autoQuality === true)) throw new Error('候选场景必须使用 45 秒航线、100% 分辨率，并关闭自动降画质。');
    rendererReady = !!latest.ready && !!state?.ready;
    if (latest.drive?.mode) desiredFree = latest.drive.mode === 'free';
    if (latest.exportState?.active) { if (recordUISnapshot === null) recordUISnapshot = uiHidden; uiHidden = true; resetMotion(); abortFrame(); clearTimeout(settingsTimer); settingsTimer = null; pendingSettings = {}; }
    else if (!recordRequested && recordUISnapshot !== null) { uiHidden = recordUISnapshot; recordUISnapshot = null; }
    updateFps(state); updateUI(); maybeViewport(); maybePresent();
  }
  function fail(error) {
    latest.error = error?.message || String(error); rendererReady = false; fps = null; fpsHistory = [];
    document.body.classList.add('failed'); $('loading').hidden = false;
    $('loading-title').textContent = '漓江实时画面尚未连接。'; $('progress').textContent = latest.error;
    $('loading-detail').textContent = '候选画面仍需独立画质核验；连接恢复后可继续操作。';
    $('retry').hidden = false; $('status').textContent = '实时连接中断'; updateUI();
  }
  function command(method, args = {}) {
    if (!session || !rendererReady || disposed) return Promise.resolve(getState());
    if (recording() && !['record', 'cancel-record', 'suspend'].includes(method)) return Promise.reject(new Error('请先完成或取消原生航拍导出。'));
    if (viewportChanging() && !['viewport', 'suspend', 'cancel-record'].includes(method)) return Promise.reject(new Error('请稍候原生画幅调整完成。'));
    const identity = { ...session }, current = generation;
    controlTail = controlTail.catch(() => {}).then(async () => {
      if (current !== generation || !session || disposed) return getState();
      const value = await request('/control', { ...identity, method, args }, ['cancel-record', 'viewport'].includes(method) ? 180000 : 12000);
      if (current === generation && !disposed) applyStatus(value);
      return getState();
    });
    return controlTail;
  }
  function fire(promise) { Promise.resolve(promise).catch(error => { if (!stopped && !disposed) fail(error); }); }
  async function gather(connection) {
    if (connection.iceGatheringState === 'complete') return;
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { connection.removeEventListener('icegatheringstatechange', check); reject(new Error('漓江实时画面的连接协商超时。')); }, 12000);
      function check() { if (connection.iceGatheringState === 'complete') { clearTimeout(timer); connection.removeEventListener('icegatheringstatechange', check); resolve(); } }
      connection.addEventListener('icegatheringstatechange', check); check();
    });
  }
  async function connectVideo(current) {
    if (peer || current !== generation || !session || disposed) return;
    const identity = { ...session }, connection = new RTCPeerConnection({ iceServers: [] }); peer = connection;
    connection.addTransceiver('video', { direction: 'recvonly' });
    connection.ontrack = event => {
      if (current !== generation || disposed || peer !== connection) return;
      video.srcObject = event.streams[0] || new MediaStream([event.track]);
      video.play().catch(() => { if (current === generation && !disposed) $('play-video').hidden = false; });
    };
    connection.onconnectionstatechange = () => { if (current !== generation || disposed) return; updateUI(); if (connection.connectionState === 'failed') fail(new Error('实时画面连接已断开，请重新连接。')); };
    await connection.setLocalDescription(await connection.createOffer()); await gather(connection);
    if (current !== generation || disposed) { connection.close(); return; }
    const answer = await request('/offer', { ...identity, description: connection.localDescription.toJSON() }, 30000);
    if (current !== generation || disposed) { connection.close(); return; }
    await connection.setRemoteDescription(answer.description);
  }
  async function poll(current) {
    if (current !== generation || !session || stopped || disposed) return;
    try {
      const value = await request('/status?sessionId=' + encodeURIComponent(session.sessionId));
      if (current !== generation || stopped || disposed) return;
      applyStatus(value); if (latest.error) throw new Error(latest.error);
      if (rendererReady && !recording() && !!latest.state.suspended !== !active()) await command('suspend', { suspended: !active() });
      if (current === generation && rendererReady && !peer) await connectVideo(current);
    } catch (error) { if (current === generation && !stopped && !disposed) fail(error); }
    if (current === generation && !stopped && !disposed) pollTimer = setTimeout(() => poll(current), 650);
  }
  function nextVideoFrame() {
    if (!disposed && videoCallback === null && typeof video.requestVideoFrameCallback === 'function') videoCallback = video.requestVideoFrameCallback(frameReceived);
  }
  function frameReceived(_time, metadata) {
    videoCallback = null;
    if (!disposed && session && !stopped && video.srcObject) { decodedFrames++; receivedAt = performance.now(); if (metadata) latest.videoMediaTime = metadata.mediaTime; updateUI(); }
    if (!disposed && !stopped) nextVideoFrame();
  }
  async function start() {
    if (disposed) throw new Error('此候选播放器已释放。');
    if (stopTask) await stopTask;
    if (unretired.size) await stop();
    if (starting || session || !parentVisible || (!qa && document.hidden)) return getState();
    starting = true; stopped = false; const current = ++generation;
    latest = { phase: 'connecting', ready: false, state: null, drive: null, error: null };
    decodedFrames = 0; receivedAt = null; rendererReady = false; fps = null; fpsHistory = []; fpsSample = null; resetPresentation();
    clearTimeout(viewportTimer); viewportTimer = null; viewportEpoch++; viewportTarget = viewportFor(currentAspect()); pendingViewportAspect = viewportTarget.aspect; viewportError = null;
    document.body.classList.remove('failed'); $('retry').hidden = true; $('loading-title').textContent = '山水正在准备。'; updateUI(); nextVideoFrame();
    try {
      const health = await request('/health', undefined, 5000);
      if (health.service !== SERVICE || health.version < 5 || !health.capabilities?.includes('native-lossless-live-frames') || !health.capabilities.includes('native-live-viewport') || health.backend !== 'gl' || health.duration !== DURATION) throw new Error('独立的漓江原生画幅服务尚未就绪。');
      if (current !== generation || !active()) return getState();
      if (health.sessionActive) throw new Error('另一处漓江窗口正在使用实时场景，请稍后重试。');
      const creation = request('/session', {}); sessionCreation = creation;
      const value = await creation; if (sessionCreation === creation) sessionCreation = null;
      if (current !== generation || disposed) { if (value.sessionId && value.token) await retire({ sessionId: value.sessionId, token: value.token }); return getState(); }
      if (!value.sessionId || !value.token) throw new Error('漓江实时服务未返回有效场景。');
      session = { sessionId: value.sessionId, token: value.token }; applyStatus(value.status || value);
      if (!active()) await command('suspend', { suspended: true });
      await poll(current);
    } catch (error) {
      if (current === generation && !stopped && !disposed) {
        if (error.name === 'AbortError' || error instanceof TypeError) retryTimer = setTimeout(() => { if (current === generation && active()) { starting = false; fire(start()); } }, 3000);
        fail(error);
      }
    } finally { if (current === generation) starting = false; }
    return getState();
  }
  function retire(identity) {
    if (retirements.has(identity.sessionId)) return retirements.get(identity.sessionId);
    unretired.set(identity.sessionId, identity);
    const operation = (async () => {
      const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 180000);
      try {
        const response = await fetch(BASE + '/session/stop', { method: 'POST', mode: 'cors', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(identity), keepalive: true, signal: controller.signal });
        if (!response.ok) { const health = await request('/health', undefined, 3000); if (health.sessionActive) throw new Error('漓江实时场景尚未释放，请稍后再切换。'); }
        unretired.delete(identity.sessionId);
      } finally { clearTimeout(timer); }
    })();
    retirements.set(identity.sessionId, operation);
    operation.catch(() => { if (retirements.get(identity.sessionId) === operation) retirements.delete(identity.sessionId); });
    return operation;
  }
  function stop() {
    if (stopTask) return stopTask;
    let identity = session; const pending = sessionCreation;
    stopped = true; generation++; starting = false; session = null; rendererReady = false; resetMotion();
    clearTimeout(pollTimer); clearTimeout(retryTimer); pollTimer = retryTimer = null;
    clearTimeout(settingsTimer); settingsTimer = null; pendingSettings = {}; settingsSending = {};
    clearTimeout(viewportTimer); viewportTimer = null; pendingViewportAspect = null; viewportEpoch++;
    peer?.close(); peer = null;
    for (const track of video.srcObject?.getTracks?.() || []) track.stop(); video.srcObject = null;
    if (videoCallback !== null) video.cancelVideoFrameCallback?.(videoCallback); videoCallback = null;
    decodedFrames = 0; receivedAt = null; fps = null; fpsHistory = []; fpsSample = null; resetPresentation();
    latest = { ...latest, ready: false, phase: disposed ? 'disposed' : 'stopped' }; $('play-video').hidden = true; updateUI();
    recordRequested = false; if (recordUISnapshot !== null) uiHidden = recordUISnapshot; recordUISnapshot = null;
    stopTask = (async () => {
      if (!identity && pending) { try { const value = await pending; if (value.sessionId && value.token) identity = { sessionId: value.sessionId, token: value.token }; } catch { /* A failed session creation owns no engine. */ } }
      if (identity) unretired.set(identity.sessionId, identity);
      await Promise.all([...unretired.values()].map(retire));
      if (latest.exportState) latest.exportState = { ...latest.exportState, active: false, phase: disposed ? 'disposed' : 'stopped' };
      updateUI();
      return getState();
    })().finally(() => { stopTask = null; });
    return stopTask;
  }
  function toggleUI(value = !uiHidden) { if (recording()) return getState(); uiHidden = !!value; updateUI(); return getState(); }
  async function record() {
    if (!session || !rendererReady || latest.exportState?.supported !== true) throw new Error('原生离线航拍尚未就绪。');
    if (recording() || downloadBusy) throw new Error('请先完成当前导出或下载。');
    await commitViewport();
    await commitSettings();
    if (!ready() || recording()) throw new Error('原生离线航拍状态已改变，请重试。');
    recordRequested = true; recordUISnapshot = uiHidden; uiHidden = true; resetMotion(); abortFrame(); updateUI();
    try { return await command('record'); }
    finally { recordRequested = false; if (!latest.exportState?.active && recordUISnapshot !== null) { uiHidden = recordUISnapshot; recordUISnapshot = null; } updateUI(); }
  }
  async function cancelRecording() { return recording() ? command('cancel-record') : getState(); }
  async function downloadRecording() {
    if (!session || recording() || downloadBusy || latest.exportState?.phase !== 'complete') throw new Error('还没有可下载的原生航拍。');
    const identity = { ...session }, current = generation; downloadBusy = true; updateUI();
    try {
      const response = await fetch(BASE + '/download', { method: 'POST', mode: 'cors', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(identity) });
      if (!response.ok) { let detail; try { detail = await response.json(); } catch {} throw new Error(detail?.error || '原生航拍下载失败。'); }
      const blob = await response.blob();
      if (current !== generation || disposed || stopped) return { cancelled: true };
      if (!blob.size || blob.type !== 'video/webm') throw new Error('原生航拍文件为空或格式不正确。');
      const url = URL.createObjectURL(blob), anchor = document.createElement('a'); anchor.href = url; anchor.download = latest.exportState.metadata?.filename || 'lijiang-native-1920x1080-60fps-2700frames.webm'; anchor.hidden = true;
      document.body.appendChild(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
      return { size: blob.size, mimeType: blob.type, metadata: latest.exportState.metadata };
    } finally { downloadBusy = false; if (!disposed) updateUI(); }
  }
  async function seek(value) {
    const time = Number(value); if (!Number.isFinite(time) || time < 0 || time > DURATION) throw new Error('航线时间应在 0 至 45 秒之间。');
    desiredFree = false; resetMotion(); return command('seek', { time });
  }
  async function restart() { desiredFree = false; resetMotion(); return command('restart'); }
  async function play(value = true) { if (value && finite(latest.state?.time) >= DURATION) return restart(); return command('pause', { paused: !value }); }
  async function setMode(mode) {
    if (!['free', 'flight', 'path'].includes(mode)) throw new Error('未知的漓江观察模式。');
    desiredFree = mode === 'free'; resetMotion(); updateUI(); return command('mode', { mode: desiredFree ? 'free' : 'flight' });
  }
  async function drive({ forward = 0, right = 0, up = 0, yaw = 0, pitch = 0 } = {}) {
    if (![forward, right, up, yaw, pitch].every(Number.isFinite) || [forward, right, up].some(n => Math.abs(n) > 200)) throw new Error('无效的自由观察位移。');
    if (!desiredFree) await setMode('free');
    if (yaw || pitch) await command('look', { yawDelta: Math.atan2(Math.sin(yaw), Math.cos(yaw)), pitchDelta: Math.max(-1.4, Math.min(1.4, pitch)) });
    if (forward || right || up) await command('move', { forward, right, up });
    return getState();
  }
  function getState() {
    const state = latest.state || {}, time = finite(state.time);
    return { ...state, sceneId: 'lijiang-native', runtimeRevision: 'lijiang-native-client-6-idle-1', candidate: true, disposed, ready: ready(), rendererReady, connected: peer?.connectionState === 'connected', visible: parentVisible, uiHidden, parametersOpen, settings: latest.settings?.values || null, settingsState: latest.settings || null, viewport: latest.viewport || null, viewportTransition: viewportChanging(), viewportTarget: { ...viewportTarget }, recording: recording(), recorder: latest.exportState || null, downloadBusy, phase: latest.phase, error: latest.error || state.error || null, frames: finite(state.frames), fps, fpsSample, time, duration: DURATION, scale: finite(state.scale, 1), autoQuality: state.autoQuality === true, live: true, paused: !!state.paused, suspended: !!state.suspended, renderSize: latest.renderSize || null, nativeProvenance: latest.nativeProvenance || null, engineProvenance: latest.engineProvenance || null, drive: latest.drive || null, path: { mode: latest.drive?.mode === 'free' ? 'free' : 'path', time, duration: DURATION, finished: time >= DURATION }, presentation: { kind: 'lossless-live-renderer-frames', ready: presentationReady(), actualFrame: presentation.actualFrame, actualTime: presentation.actualTime, receivedFrames: presentation.receivedFrames, width: presentation.width, height: presentation.height, receivedAt: presentation.receivedAt, pngBytes: presentation.pngBytes, pngSha256: presentation.pngSha256, pixelSha256: presentation.pixelSha256, pixelsVerified: presentationReady(), sessionMatches: !!session && presentation.sessionId === session.sessionId, viewportMatches: viewportMatches(), viewportEpoch: presentation.viewportEpoch, requestInFlight: !!frameWork, heldForRecording: recording(), backingStore: 'original-size 1:1 verified RGBA pixels', cssFit: 'contain', error: presentation.error }, video: { width: video.videoWidth, height: video.videoHeight, decodedFrames, decodedCounter: typeof video.requestVideoFrameCallback === 'function' ? 'requestVideoFrameCallback' : 'timeupdate fallback', receivedAt, mediaTime: latest.videoMediaTime ?? null, connection: peer?.connectionState || 'new' } };
  }
  function visibility() { resetMotion(); if (!active()) abortFrame(); if (session) fire(command('suspend', { suspended: !active() })); else if (active()) fire(start()); if (active()) maybePresent(); }
  function pointerEnd(event) {
    if (cleanPointer?.id === event.pointerId && event.type === 'pointerup' && uiHidden && performance.now() - cleanPointer.at < 400 && Math.hypot(event.clientX - cleanPointer.x, event.clientY - cleanPointer.y) < 8) toggleUI(false);
    cleanPointer = null; pointer = null;
  }
  listen(video, 'loadedmetadata', updateUI);
  if (typeof video.requestVideoFrameCallback !== 'function') listen(video, 'timeupdate', () => { if (session && !stopped && video.videoWidth) { decodedFrames++; receivedAt = performance.now(); updateUI(); } });
  listen($('play-video'), 'click', () => fire(video.play().then(() => { $('play-video').hidden = true; })));
  listen($('retry'), 'click', () => fire(stop().then(() => start())));
  listen($('play'), 'click', () => fire(play(!!latest.state?.paused)));
  listen($('replay'), 'click', () => fire(restart()));
  listen($('mode'), 'click', () => fire(setMode(desiredFree ? 'flight' : 'free')));
  listen($('timeline'), 'input', () => fire(seek(Number($('timeline').value))));
  listen($('shot'), 'change', () => { const value = $('shot').value; if (value === 'free') fire(setMode('free')); else if (value !== 'custom') fire(seek(Number(value))); });
  listen($('final-shot'), 'click', () => fire(seek(DURATION)));
  listen($('clean'), 'click', () => toggleUI());
  listen($('parameters'), 'click', () => setParametersOpen(!parametersOpen));
  listen($('settings-close'), 'click', () => setParametersOpen(false));
  for (const key of Object.keys(SETTINGS_LIMITS)) {
    const input = $('setting-' + key);
    listen(input, 'input', () => {
      if (!ready() || recording()) return;
      const value = Number(input.value); try { validateSettings({ [key]: value }); } catch (error) { settingsError(error); return; } pendingSettings[key] = value;
      $('setting-value-' + key).textContent = formatSetting(key, value); $('settings-feedback').textContent = '正在等待应用参数…';
      clearTimeout(settingsTimer); settingsTimer = setTimeout(() => { flushSettings().catch(settingsError); }, 180);
    });
    listen(input, 'change', () => { if (!recording()) flushSettings().catch(settingsError); });
  }
  listen($('record'), 'click', () => fire(record()));
  listen($('cancel-record'), 'click', () => fire(cancelRecording()));
  listen($('download-record'), 'click', () => fire(downloadRecording()));
  listen($('fullscreen'), 'click', () => fire(document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()));
  listen(viewport, 'pointerdown', event => {
    if (!ready() || recording()) return;
    if (uiHidden) cleanPointer = { id: event.pointerId, x: event.clientX, y: event.clientY, at: performance.now() };
    if (!desiredFree) return;
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
    viewport.setPointerCapture(event.pointerId); viewport.focus({ preventScroll: true });
  });
  listen(viewport, 'pointermove', event => { if (!pointer || pointer.id !== event.pointerId) return; lookX += (event.clientX - pointer.x) * .003; lookY += (event.clientY - pointer.y) * .003; pointer.x = event.clientX; pointer.y = event.clientY; });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) listen(viewport, type, pointerEnd);
  const keyCode = event => event.code || ({ w: 'KeyW', a: 'KeyA', s: 'KeyS', d: 'KeyD', q: 'KeyQ', e: 'KeyE', c: 'KeyC', r: 'KeyR', h: 'KeyH', v: 'KeyV', shift: 'ShiftLeft', ' ': 'Space', arrowleft: 'ArrowLeft', arrowright: 'ArrowRight' }[String(event.key || '').toLowerCase()] || '');
  listen(window, 'keydown', event => {
    if (event.ctrlKey || event.altKey || event.metaKey || /^(INPUT|SELECT|TEXTAREA)$/.test(event.target?.tagName || '')) return;
    const code = keyCode(event);
    if (recording()) { if (['KeyH', 'KeyC', 'KeyR', 'KeyV', 'Space', 'ArrowLeft', 'ArrowRight'].includes(code)) event.preventDefault(); return; }
    if (code === 'KeyV') { event.preventDefault(); if (!event.repeat && ready() && latest.exportState?.supported) fire(record()); return; }
    if (['KeyH', 'KeyC', 'KeyR'].includes(code)) { event.preventDefault(); if (!event.repeat && ready()) { if (code === 'KeyH') toggleUI(); else if (code === 'KeyC') fire(setMode(desiredFree ? 'flight' : 'free')); else fire(restart()); } return; }
    if (event.target?.tagName === 'BUTTON') return;
    if (code === 'Space') { event.preventDefault(); if (!event.repeat) fire(play(!!latest.state?.paused)); }
    else if (code === 'ArrowLeft' || code === 'ArrowRight') { event.preventDefault(); fire(seek(Math.max(0, Math.min(DURATION, finite(latest.state?.time) + (code === 'ArrowLeft' ? -5 : 5))))); }
    else if (desiredFree && ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ShiftLeft', 'ShiftRight'].includes(code)) { event.preventDefault(); keys.add(code); }
  });
  listen(window, 'keyup', event => keys.delete(keyCode(event)));
  listen(window, 'blur', resetMotion);
  listen(window, 'resize', () => { queueViewport(); layoutSettingsPanel(); });
  for (const button of document.querySelectorAll('[data-move]')) {
    listen(button, 'pointerdown', event => { if (!ready() || recording()) return; if (!desiredFree) fire(setMode('free')); keys.add(button.dataset.move); button.setPointerCapture(event.pointerId); event.preventDefault(); });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) listen(button, type, () => keys.delete(button.dataset.move));
  }
  const motionTimer = setInterval(async () => {
    const now = performance.now(), dt = Math.max(0, Math.min(.15, (now - lastMotion) / 1000)); lastMotion = now;
    if (!active() || !ready() || !desiredFree || motionBusy || recording()) return;
    const speed = keys.has('ShiftLeft') || keys.has('ShiftRight') ? 130 : 38;
    const forward = (Number(keys.has('KeyW')) - Number(keys.has('KeyS'))) * speed * dt, right = (Number(keys.has('KeyD')) - Number(keys.has('KeyA'))) * speed * dt, up = (Number(keys.has('KeyE')) - Number(keys.has('KeyQ'))) * speed * dt;
    const yawDelta = Math.atan2(Math.sin(lookX), Math.cos(lookX)), pitchDelta = Math.max(-1.4, Math.min(1.4, lookY)); lookX = lookY = 0;
    if (!forward && !right && !up && !yawDelta && !pitchDelta) return;
    motionBusy = true;
    try { if (yawDelta || pitchDelta) await command('look', { yawDelta, pitchDelta }); if (forward || right || up) await command('move', { forward, right, up }); }
    catch (error) { if (!stopped && !disposed) fail(error); } finally { motionBusy = false; }
  }, 90);
  listen(document, 'visibilitychange', visibility);
  listen(window, 'message', event => { if (event.source !== parent || event.origin !== location.origin || event.data?.type !== 'worlds-visibility') return; parentVisible = !!event.data.visible; visibility(); });
  listen(window, 'pagehide', () => { stop().catch(() => {}); });
  window.lijiangWorld = Object.freeze({
    getState, start, stop, seek, play, pause: (value = true) => play(!value), restart, setMode, drive, toggleUI, setSettings, record, cancelRecording, downloadRecording,
    setVisible(value) { parentVisible = !!value; visibility(); return getState(); },
    async dispose() { if (disposed && !stopTask && !unretired.size) return getState(); disposed = true; try { return await stop(); } finally { clearInterval(motionTimer); listeners.abort(); } }
  });
  updateUI(); if (!embedded) fire(start());
})();
