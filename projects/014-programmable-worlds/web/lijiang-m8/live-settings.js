// Live native shader parameters only. Geometry, peaks and seeds are not edited.
const LIMITS = Object.freeze({ sunEl: [2, 60], sunAz: [-180, 180], fog: [0, .001], mistH: [10, 350], mistK: [0, 5], expo: [.5, 1.8], sat: [.5, 1.3], waveStrength: [0, 2], waveSpeed: [0, 2], colorTemperature: [-1, 1] });
const QUERY_DEFAULTS = Object.freeze({ waveStrength: 1, waveSpeed: 1, colorTemperature: 0 });
let installed = false;

function install() {
  if (installed || typeof PARAMS === 'undefined' || typeof Q === 'undefined' || typeof sunDir === 'undefined') return;
  installed = true;
  function getState() {
    const values = {};
    for (const key of Object.keys(LIMITS)) values[key] = Object.hasOwn(QUERY_DEFAULTS, key) ? Q.has(key) ? Number.parseFloat(Q.get(key)) : QUERY_DEFAULTS[key] : PARAMS[key];
    return { ...values, values, limits: Object.fromEntries(Object.entries(LIMITS).map(([key, range]) => [key, [...range]])), sunDirection: [...sunDir], recordingLocked: window.lijiangNativeExport?.getState().active === true, revision: 'native-live-settings-1', scope: 'live light, atmosphere, water and color' };
  }
  function set(partial) {
    if (window.lijiangNativeExport?.getState().active) throw new Error('请先完成或取消导出，再调整画面参数。');
    if (!partial || typeof partial !== 'object' || Array.isArray(partial)) throw new Error('画面参数应为一个对象。');
    const entries = Object.entries(partial);
    for (const [key, value] of entries) {
      const range = LIMITS[key];
      if (!Object.hasOwn(LIMITS, key)) throw new Error('未知的原生画面参数：' + key);
      if (typeof value !== 'number' || !Number.isFinite(value) || value < range[0] || value > range[1]) throw new Error('原生画面参数超出范围：' + key);
    }
    // Validate the whole update first, so an invalid sibling never leaves a
    // partially changed render state.
    for (const [key, value] of entries) {
      if (Object.hasOwn(QUERY_DEFAULTS, key)) Q.set(key, String(value));
      else PARAMS[key] = value;
    }
    if (Object.hasOwn(partial, 'sunEl') || Object.hasOwn(partial, 'sunAz')) {
      const elevation = PARAMS.sunEl * Math.PI / 180, azimuth = PARAMS.sunAz * Math.PI / 180;
      sunDir[0] = -Math.cos(elevation) * Math.cos(azimuth); sunDir[1] = Math.sin(elevation); sunDir[2] = -Math.cos(elevation) * Math.sin(azimuth);
    }
    const state = getState();
    window.dispatchEvent(new CustomEvent('lijiang-native-settings-change', { detail: state }));
    return state;
  }
  window.lijiangNativeSettings = Object.freeze({ getState, set });
  window.dispatchEvent(new CustomEvent('lijiang-native-settings-ready', { detail: getState() }));
}

window.addEventListener('napali-ready', install);
install();
