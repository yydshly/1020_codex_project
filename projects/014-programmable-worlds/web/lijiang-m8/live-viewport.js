const PIXEL_BUDGET = 1440 * 902;
const REVISION = 'native-live-viewport-1';
let installed = false;
function dimensions(aspect) {
  if (typeof aspect !== 'number' || !Number.isFinite(aspect) || aspect < .1 || aspect > 8) throw new Error('无效的原生画幅比例。');
  if (aspect >= .85) return { width: 1440, height: 902, mode: 'desktop' };
  return { width: Math.max(2, Math.round(Math.sqrt(PIXEL_BUDGET * aspect) / 2) * 2), height: Math.max(2, Math.round(Math.sqrt(PIXEL_BUDGET / aspect) / 2) * 2), mode: 'portrait' };
}
function install() {
  if (installed || !window.napaliControl?.getState().ready || typeof cv === 'undefined' || typeof R === 'undefined' || !R) return;
  installed = true;
  const control = window.napaliControl, drive = window.napaliDrive;
  const pause = control.pause.bind(control), seek = control.seek.bind(control), suspend = control.suspend.bind(control);
  let busy = false, requestedAspect = cv.width / cv.height, mutationRevision = 0, error = null, resumeSuspended = null;
  const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
  control.suspend = (value = true) => { if (busy) { resumeSuspended = !!value; return control.getState(); } return suspend(value); };
  function getState() {
    return { revision: REVISION, busy, requestedAspect, width: cv.width, height: cv.height, renderWidth: R?.w || 0, renderHeight: R?.h || 0, target: dimensions(requestedAspect), pixelBudget: PIXEL_BUDGET, mutationRevision, error };
  }
  function disposeTarget(target) {
    if (!target) return;
    for (const framebuffer of [target.f, ...(target.bf || [])]) if (framebuffer) gl.deleteFramebuffer(framebuffer);
    for (const texture of [target.acc, ...(target.b || [])]) if (texture) gl.deleteTexture(texture);
  }
  async function set(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== 1 || !Object.hasOwn(value, 'aspect')) throw new Error('原生画幅只接受 aspect。');
    const target = dimensions(value.aspect);
    if (window.lijiangNativeExport?.getState().active) throw new Error('请先完成或取消导出，再调整画幅。');
    if (busy) throw new Error('原生画幅正在调整。');
    requestedAspect = value.aspect; error = null;
    if (cv.width === target.width && cv.height === target.height && R.w === target.width && R.h === target.height) return getState();
    busy = true; resumeSuspended = null;
    const saved = { control: clone(control.getState()), drive: clone(drive?.getState() || null), width: cv.width, height: cv.height, target: R };
    let fresh = null, committed = false;
    try {
      pause(true); suspend(true);
      const deadline = performance.now() + 180000;
      while (control.getState().rendering) { if (performance.now() >= deadline) throw new Error('实时渲染尚未停稳，画幅未更改。'); await new Promise(resolve => setTimeout(resolve, 15)); }
      await gpuWait();
      if (JSON.stringify(drive?.getState() || null) !== JSON.stringify(saved.drive)) throw new Error('调整画幅期间的自由观察位姿发生了变化。');
      cv.width = target.width; cv.height = target.height; R = null; resize(target.width, target.height); fresh = R;
      if (!fresh?.acc || !fresh.f || fresh.b?.length !== 2 || fresh.bf?.length !== 2 || fresh.w !== target.width || fresh.h !== target.height) throw new Error('原生画幅缓冲未能完成。');
      disposeTarget(saved.target); committed = true; mutationRevision++;
    } catch (problem) {
      if (!committed) { const failed = R; R = saved.target; cv.width = saved.width; cv.height = saved.height; if (failed && failed !== saved.target) disposeTarget(failed); }
      error = problem?.message || String(problem); throw problem;
    } finally {
      try { seek(saved.control.time); pause(saved.control.paused); suspend(resumeSuspended ?? saved.control.suspended); }
      finally { busy = false; }
    }
    const state = getState(); window.dispatchEvent(new CustomEvent('lijiang-native-viewport-change', { detail: state })); return state;
  }
  window.lijiangNativeViewport = Object.freeze({ getState, set });
  window.dispatchEvent(new CustomEvent('lijiang-native-viewport-ready', { detail: getState() }));
}
window.addEventListener('napali-ready', install);
install();
