import { createRecorder } from '../lijiang-flythrough/src/recorder.js';

// The classic renderer's lexical bindings are deliberately used directly. Its
// window.renderAt hook posts /frame and is unsuitable for this local exporter.
const FIXED_CAPTURE = Object.freeze({ width: 1920, height: 1080, fps: 60, duration: 45, download: false });
const CHUNK_BYTES = 512 * 1024;
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
let installed = false;

function install() {
  if (installed || !window.napaliControl?.getState().ready) return;
  if (typeof cv === 'undefined' || typeof R === 'undefined' || !R || typeof cineCam !== 'function') return;
  installed = true;
  const control = window.napaliControl, drive = window.napaliDrive;
  const original = Object.fromEntries(['pause', 'seek', 'restart', 'setQuality', 'suspend'].map(key => [key, control[key].bind(control)]));
  const originalDrive = drive ? Object.fromEntries(['setMode', 'move', 'look'].map(key => [key, drive[key].bind(drive)])) : null;
  let locked = false, job = null, snapshot = null, desiredResumeSuspended = null, completed = null, sequence = 0;
  let restoration = null, exportError = null, captureOptions = FIXED_CAPTURE, qaJob = false;
  const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
  function guard() { if (locked) throw new Error('请先完成或取消原生航拍导出。'); }
  for (const key of ['pause', 'seek', 'restart', 'setQuality']) control[key] = (...args) => { guard(); return original[key](...args); };
  control.suspend = value => {
    if (locked) { desiredResumeSuspended = !!value; return control.getState(); }
    return original.suspend(value);
  };
  if (originalDrive) for (const key of ['setMode', 'move', 'look']) drive[key] = (...args) => { guard(); return originalDrive[key](...args); };
  async function quiesce() {
    original.pause(true); original.suspend(true);
    const deadline = performance.now() + 180000;
    while (control.getState().rendering) {
      if (performance.now() > deadline) throw new Error('实时渲染未能停稳，未开始离线航拍。');
      await delay(10);
    }
    await gpuWait();
  }
  function disposeTarget(target) {
    if (!target) return;
    for (const framebuffer of [target.f, ...(target.bf || [])]) if (framebuffer) gl.deleteFramebuffer(framebuffer);
    for (const texture of [target.acc, ...(target.b || [])]) if (texture) gl.deleteTexture(texture);
  }
  async function restore(saved = snapshot) {
    if (!saved) return;
    await quiesce();
    const temporary = R;
    cv.width = saved.canvas.width; cv.height = saved.canvas.height; R = saved.target;
    Object.assign(LOOK, saved.look); frameNo = Math.max(0, saved.frameNo - 1);
    if (temporary !== saved.target) disposeTarget(temporary);
    original.seek(saved.control.time); original.pause(saved.control.paused);
    const currentDrive = clone(drive?.getState() || null);
    if (JSON.stringify(currentDrive) !== JSON.stringify(saved.drive)) throw new Error('原生航拍导出期间的自由观察位姿发生了变化。');
    // The original complete accumulation remains intact. Presenting it restores
    // the exact pre-export free/path image without calling the free camera.
    present(true); await gpuWait(); frameNo = saved.frameNo;
    const suspended = desiredResumeSuspended ?? saved.control.suspended;
    original.suspend(suspended);
    restoration = { restored: true, canvas: { width: cv.width, height: cv.height }, renderSize: { width: R.w, height: R.h }, time: control.getState().time, paused: control.getState().paused, suspended, drive: currentDrive, originalCanvas: saved.canvas, originalRenderSize: saved.renderSize, originalControl: saved.control, originalDrive: saved.drive };
    snapshot = null;
  }
  const recorder = createRecorder({
    canvas: cv,
    getDuration: () => FIXED_CAPTURE.duration,
    async resizeForCapture(width, height) {
      const state = clone(control.getState());
      snapshot = { control: state, drive: clone(drive?.getState() || null), canvas: { width: cv.width, height: cv.height }, renderSize: { width: R.w, height: R.h }, target: R, look: { ...LOOK }, frameNo };
      await quiesce();
      // Capture the completed live target after any in-flight RAF has retired.
      snapshot.target = R; snapshot.renderSize = { width: R.w, height: R.h };
      snapshot.look = { ...LOOK }; snapshot.frameNo = frameNo;
      cv.width = width; cv.height = height;
      // Allocate an independent accumulator even when the live target happens
      // to have the same dimensions. Never overwrite the saved free-view image.
      R = null; resize(width, height);
      return snapshot;
    },
    async renderAt(time) {
      const state = control.getState();
      if (!locked || !state.suspended || state.rendering) throw new Error('离线航拍与实时渲染发生并发。');
      if (cv.width !== captureOptions.width || cv.height !== captureOptions.height || R.w !== captureOptions.width || R.h !== captureOptions.height) throw new Error('原生航拍画布尺寸发生变化。');
      const camera = cineCam(time);
      clearAcc(); await renderSample(camera, time, [0, 0], false);
      setLook(camera); present(false); await gpuWait();
    },
    restoreAfterCapture: restore
  });
  function getState() {
    const state = recorder.getState();
    return { ...state, active: locked || state.active, phase: exportError ? 'error' : locked && !state.active && state.phase === 'idle' ? 'preparing' : state.phase, error: exportError || state.error || null, sceneId: 'lijiang-native', renderer: 'source-derived-full-glsl', candidate: true, supported: typeof VideoEncoder === 'function' && typeof VideoFrame === 'function', fixedCapture: { ...FIXED_CAPTURE, frameCount: 2700 }, capture: { ...captureOptions, frameCount: Math.round(captureOptions.duration * captureOptions.fps) }, qaTestOnly: qaJob, chunkBytes: CHUNK_BYTES, exportId: completed?.id || null, metadata: completed?.metadata || null, restoration };
  }
  function startJob(options, qaTestOnly) {
    if (locked || job) throw new Error('原生航拍导出已在进行。');
    if (!control.getState().ready) throw new Error('原生场景尚未准备完成。');
    locked = true; completed = null; restoration = null; desiredResumeSuspended = null; exportError = null; captureOptions = options; qaJob = qaTestOnly;
    const expectedFrames = Math.round(options.duration * options.fps), expectedDuration = expectedFrames / options.fps;
    const id = 'native-' + Date.now().toString(36) + '-' + (++sequence);
    job = recorder.start(options).then(result => {
      if (result?.blob) {
        if (result.metadata?.width !== options.width || result.metadata?.height !== options.height || result.metadata?.fps !== options.fps || result.metadata?.frameCount !== expectedFrames || result.metadata?.timestampGridVerified !== true || !Number.isFinite(result.metadata.duration) || Math.abs(result.metadata.duration - expectedDuration) > 1 / options.fps + .00001) throw new Error('原生航拍未通过请求尺寸、真帧数量与固定帧率时间轴核对。');
        const metadata = { ...result.metadata, exportId: id, sceneId: 'lijiang-native', renderer: 'source-derived-full-glsl', qaTestOnly, standardFullFlight: !qaTestOnly, nativeProvenance: clone(window.lijiangNativeProvenance || null), chunkBytes: CHUNK_BYTES, filename: 'lijiang-native-' + (qaTestOnly ? 'qa-' : '') + options.width + 'x' + options.height + '-' + options.fps + 'fps-' + expectedFrames + 'frames.webm' };
        completed = { id, blob: result.blob, metadata };
        return { cancelled: false, metadata };
      }
      return { cancelled: true, metadata: null };
    }).catch(error => { exportError = error?.message || String(error); throw error; }).finally(async () => {
      // createRecorder restores after encoding/cancellation. This fallback also
      // covers failure part-way through resizeForCapture, before it returned.
      try { if (snapshot) await restore(snapshot); }
      catch (error) { exportError = error?.message || String(error); throw error; }
      finally { locked = false; job = null; }
    });
    return job;
  }
  const start = () => startJob(FIXED_CAPTURE, false);
  function startQA(options = {}) {
    if (new URLSearchParams(location.search).get('qa') !== '1') throw new Error('原生短片测试接口仅在 qa=1 时可用。');
    if (Object.keys(options).some(key => !['duration', 'width', 'height', 'fps'].includes(key))) throw new Error('未知的原生短片测试参数。');
    const capture = { ...FIXED_CAPTURE, ...options, download: false };
    if (typeof capture.duration !== 'number' || !Number.isFinite(capture.duration) || capture.duration < .01 || capture.duration > 2 || !Number.isInteger(capture.width) || capture.width < 2 || capture.width > 1920 || capture.width % 2 || !Number.isInteger(capture.height) || capture.height < 2 || capture.height > 1080 || capture.height % 2 || !Number.isInteger(capture.fps) || capture.fps < 1 || capture.fps > 60 || Math.round(capture.duration * capture.fps) < 1) throw new Error('无效的原生短片测试尺寸、时长或帧率。');
    return startJob(Object.freeze(capture), true);
  }
  async function cancel() {
    const current = job;
    await recorder.cancel();
    if (current) { try { await current; } catch { /* The state retains encoding/restoration errors. */ } }
    return getState();
  }
  function metadata() {
    if (locked || !completed || recorder.getState().phase !== 'complete') throw new Error('还没有完成的原生航拍文件。');
    return { ...completed.metadata, size: completed.blob.size, mimeType: completed.blob.type };
  }
  async function readChunk({ offset, length = CHUNK_BYTES, exportId } = {}) {
    const info = metadata();
    if (exportId !== info.exportId) throw new Error('航拍文件标识已改变，请重新获取下载信息。');
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > info.size || !Number.isSafeInteger(length) || length < 1 || length > CHUNK_BYTES) throw new Error('无效的航拍分块范围。');
    const end = Math.min(info.size, offset + length), slice = completed.blob.slice(offset, end);
    const base64 = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = () => reject(reader.error || new Error('无法读取航拍分块。')); reader.readAsDataURL(slice); });
    return { exportId, offset, byteLength: end - offset, nextOffset: end, done: end === info.size, encoding: 'base64', data: base64 };
  }
  const api = { start, getState, cancel, metadata, readChunk };
  if (new URLSearchParams(location.search).get('qa') === '1') api.startQA = startQA;
  window.lijiangNativeExport = Object.freeze(api);
  window.dispatchEvent(new CustomEvent('lijiang-native-export-ready', { detail: getState() }));
}

window.addEventListener('napali-ready', install);
install();
