"""Build a driven live copy of napali without changing any GLSL template.

The preserved upstream is the source of truth. Adaptations are limited to
non-blocking compilation and bounded GPU scheduling, live control/lifecycle
hooks, default full rendering resolution, and controller UI links.
"""
from pathlib import Path
import argparse
import hashlib
import json
import re

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'web/upstream/index.html'
OUTPUT = ROOT / 'web/runtime/index.html'
EXPECTED_SOURCE_SHA256 = '616d20c66e82d070f8c6bff921c8a78b2f04309b8cf279835ce4cdeaa90f4dfd'

DEFERRED_COMPILER = r'''
// Compatibility scheduling only: the complete source renderer stays intact.
// KHR completion polling avoids synchronous compiler-status IPC stalls.
let compileSequence = 0;
function runtimePhase(name, detail = {}) {
  const item = { phase: name, at: Math.round(performance.now()), ...detail };
  window.napaliDiagnostics = item;
  console.info('NAPALI_PHASE ' + JSON.stringify(item));
}
async function progDeferred(fs, label = 'auxiliary') {
  const ext = gl.getExtension('KHR_parallel_shader_compile');
  const started = performance.now();
  const id = ++compileSequence;
  if (id === 1) {
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    runtimePhase('graphics-context', {
      vendor: debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
      renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      version: gl.getParameter(gl.VERSION),
      floatBlend: Boolean(gl.getExtension('EXT_float_blend')),
      parallelCompile: Boolean(ext),
      maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE)
    });
  }
  runtimePhase('compile-start', { id, label, bytes: fs.length });
  const shaders = [[gl.VERTEX_SHADER, VS], [gl.FRAGMENT_SHADER, fs]].map(([type, src]) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    return { shader, src };
  });
  const p = gl.createProgram();
  shaders.forEach(({ shader }) => gl.attachShader(p, shader));
  gl.bindAttribLocation(p, 0, 'aPos');
  gl.linkProgram(p);
  if (ext) {
    for (;;) {
      if (gl.isContextLost()) throw new Error('WebGL context lost while compiling the complete coastal renderer');
      if (gl.getProgramParameter(p, ext.COMPLETION_STATUS_KHR)) break;
      const elapsed = Math.round((performance.now() - started) / 1000);
      const load = document.getElementById('loadtxt');
      if (load) load.textContent = '着色器编译 ' + label + ' · ' + elapsed + ' 秒';
      await new Promise(resolve => setTimeout(resolve, 75));
    }
  } else {
    const load = document.getElementById('loadtxt');
    if (load) load.textContent = '完整海岸着色器编译中';
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  if (gl.isContextLost()) throw new Error('WebGL context lost after complete coastal renderer compilation');
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    const logs = [gl.getProgramInfoLog(p) || '(empty program link log)'];
    shaders.forEach(({ shader, src }) => {
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(shader) || '(empty shader log)';
        const match = /0:(\d+)/.exec(log);
        const line = match ? Number(match[1]) : 0;
        logs.push(log + ' | ' + src.split('\n').slice(Math.max(0, line - 4), line + 2).join(' / '));
      }
    });
    throw new Error(logs.join('\n'));
  }
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(p, i);
    const name = info.name.replace(/\[0\]$/, '');
    u[name] = gl.getUniformLocation(p, name);
  }
  shaders.forEach(({ shader }) => gl.deleteShader(shader));
  runtimePhase('compile-ready', { id, label, ms: Math.round(performance.now() - started) });
  return { p, u };
}
'''

DRONE_CONTROLS = r'''function startDrone() {
  if (Q.has('offline')) { window.__ready = true; return; }
  const clampTime = value => Math.max(0, Math.min(FLIGHT_END, Number.isFinite(Number(value)) ? Number(value) : 0));
  const clampScale = value => Math.max(0.25, Math.min(1, Number.isFinite(Number(value)) ? Number(value) : 1));
  let t = clampTime(num('t', 0)), last = performance.now(), paused = false;
  let rs = clampScale(num('rs', 1)), slow = 0, fast = 0, suspended = false, frames = 0, rendering = false;
  let autoQuality = Q.get('auto') === '1', lastError = null;
  let lastFrameMs = 0, totalFrameMs = 0;
  let renderSampleMs = 0, hudMs = 0, presentMs = 0;
  const getState = () => ({ time: t, duration: FLIGHT_END, paused, scale: rs, suspended, rendering, ready: !gl.isContextLost() && !lastError, frames, autoQuality, error: lastError, lastFrameMs, averageFrameMs: frames ? totalFrameMs / frames : 0, renderSampleMs, hudMs, presentMs });
  const control = {
    pause(value = true) { paused = Boolean(value); return getState(); },
    togglePause() { paused = !paused; return getState(); },
    seek(seconds) { t = clampTime(seconds); return getState(); },
    restart() { t = 0; paused = false; last = performance.now(); return getState(); },
    setQuality(scale) { rs = clampScale(scale); autoQuality = false; slow = 0; fast = 0; return getState(); },
    suspend(value = true) { suspended = Boolean(value); last = performance.now(); return getState(); },
    getState
  };
  window.napaliControl = control;
  window.__ready = true;
  addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLElement && /^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(e.target.tagName)) return;
    if (e.code === 'Space') { e.preventDefault(); control.togglePause(); }
    else if (e.key === 'h' || e.key === 'H') hudOn = !hudOn;
    else if (e.key === 'r' || e.key === 'R') control.restart();
    else if (e.key === 'ArrowRight') { e.preventDefault(); control.seek(t + 5); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); control.seek(t - 5); }
    else if (e.key === 'f' || e.key === 'F') (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen());
  });
  addEventListener('resize', () => { cv.width = innerWidth; cv.height = innerHeight; });
  const loop = async (now) => {
    const dt = Math.min(Math.max(0, (now - last) / 1000), 0.1); last = now;
    try { if (!suspended) {
      rendering = true;
      const frameStarted = performance.now();
      if (!paused) { t += dt; if (t > FLIGHT_END) t = 0; }
      if (autoQuality) {
        if (dt > 0.05) { slow++; fast = 0; } else if (dt < 0.03) { fast++; slow = 0; }
        if (slow > 6) { rs = Math.max(0.25, rs - 0.05); slow = 0; }
        if (fast > 40) { rs = Math.min(1, rs + 0.05); fast = 0; }
      }
      resize(Math.max(1, Math.round(cv.width * rs)), Math.max(1, Math.round(cv.height * rs)));
      const cam = flightCam(t);
      const renderStarted = performance.now();
      clearAcc(); await renderSample(cam, t, [0, 0], false);
      const completedRenderSampleMs = performance.now() - renderStarted;
      const hudStarted = performance.now();
      setLook(cam); drawHUD(t, cam); uploadHUD();
      const completedHudMs = performance.now() - hudStarted;
      const presentStarted = performance.now();
      present(true);
      await gpuWait();
      const completedPresentMs = performance.now() - presentStarted;
      lastFrameMs = performance.now() - frameStarted;
      // Wall time through completed work, including CPU/IPC/fence waits. These
      // are stage diagnostics, not hardware GPU timer-query measurements.
      renderSampleMs = completedRenderSampleMs; hudMs = completedHudMs; presentMs = completedPresentMs;
      totalFrameMs += lastFrameMs;
      frames++;
      if (frames === 1) runtimePhase('first-frame-ready', { width: R.w, height: R.h, time: t, frameMs: lastFrameMs });
    } } catch (error) {
      lastError = String(error.message || error); suspended = true;
      runtimePhase('render-error', { message: lastError }); console.error(error.stack || error);
      const load = document.getElementById('loadtxt'); if (load) load.textContent = 'Error: ' + lastError;
    } finally { rendering = false; }
    requestAnimationFrame(loop);
  };
  window.dispatchEvent(new CustomEvent('napali-ready', { detail: getState() }));
  requestAnimationFrame(loop);
}
'''


GPU_WAIT = r'''// Cooperative task yielding without the nested setTimeout minimum delay.
// Each fence still completes before dependent work is submitted. MessageChannel
// lets input, compositor and GPU IPC tasks run without adding 4 ms to every band.
const runtimeTaskWaiters = [];
const runtimeTaskChannel = new MessageChannel();
runtimeTaskChannel.port1.onmessage = () => {
  const resolve = runtimeTaskWaiters.shift();
  if (resolve) resolve();
};
function runtimeYield() {
  return new Promise(resolve => {
    runtimeTaskWaiters.push(resolve);
    runtimeTaskChannel.port2.postMessage(0);
  });
}
async function gpuWait() {
  if (gl.isContextLost()) throw new Error('WebGL context lost before GPU completion');
  const fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
  if (!fence) throw new Error('GPU completion fence could not be created');
  gl.flush();
  try {
    for (;;) {
      if (gl.isContextLost()) throw new Error('WebGL context lost while awaiting GPU completion');
      const state = gl.getSyncParameter(fence, gl.SYNC_STATUS);
      if (state === gl.SIGNALED) break;
      if (state === null) throw new Error('GPU completion fence became invalid');
      await runtimeYield();
    }
  } finally {
    if (!gl.isContextLost()) gl.deleteSync(fence);
  }
  // Yield even when a tiny pass was already complete before the first poll.
  await runtimeYield();
}'''


def adapt_scheduling(value):
    """Change submission boundaries only, never shader or texture semantics."""
    eol = '\r\n' if '\r\n' in value else '\n'
    value = value.replace('\r\n', '\n')

    def replace(before, after, count=1):
        nonlocal value
        if value.count(before) != count:
            raise ValueError('Scheduling adaptation anchor changed: ' + before[:100])
        value = value.replace(before, after)

    replace("async function gpuWait() { const f = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0); gl.flush(); while (gl.getSyncParameter(f, gl.SYNC_STATUS) !== gl.SIGNALED) await sleep(1); gl.deleteSync(f); }", GPU_WAIT)
    replace('async function tiled(f, W, H, tile, onTile) {',
            "async function tiled(f, W, H, tile, onTile) {\n  tile = Math.min(tile, Math.max(64, Math.floor(num('jobtile', 256))));")
    replace('gl.scissor(x, y, tile, tile); gl.drawArrays(gl.TRIANGLES, 0, 3);',
            'gl.scissor(x, y, Math.min(tile, W - x), Math.min(tile, H - y)); gl.drawArrays(gl.TRIANGLES, 0, 3);')

    # Generation diagnostics identify the exact boundary of a driver failure.
    replace('async function generate() {\n  const T0 = performance.now();',
            "async function generate() {\n  const T0 = performance.now();\n  runtimePhase('generate-start', { hres: HRES, cres: CRES, ares: ARES, erosionIterations: PARAMS.eiters });")
    replace("  world.coastCPU = coastSDF(coast.segs, coast.n, CRES);",
            "  runtimePhase('coast-cpu-start', { segments: coast.n, resolution: CRES });\n  world.coastCPU = coastSDF(coast.segs, coast.n, CRES);\n  runtimePhase('coast-cpu-ready');")
    phase_labels = {
        'Raising the massif': 'base-massif-draw',
        'Eroding valleys': 'erosion-start',
        'Sculpting cliffs': 'height-draw-start',
        'Measuring light and water': 'attributes-draw-start',
        'Growing rainforest': 'vegetation-draw-start',
        'Planting trees': 'plant-placement-start',
    }
    for text, label in phase_labels.items():
        before = "  loadtxt.textContent = '" + text + "';"
        replace(before, before + "\n  runtimePhase('" + label + "');")

    # Initial state and post-erosion finite-volume passes are independent pixels.
    replace('  gl.bindFramebuffer(gl.FRAMEBUFFER, eF[0]); gl.viewport(0, 0, EN, EN); gl.drawArrays(gl.TRIANGLES, 0, 3);',
            '  await tiled(eF[0], EN, EN, 512, null);')
    replace("    if (it % 40 === 39) { await gpuWait(); loadbar.style.width = (12 + 38 * it / EIT) + '%'; }",
            "    if (it % 4 === 3 || it === EIT - 1) { await gpuWait(); loadbar.style.width = (12 + 38 * it / EIT) + '%'; }\n    if (it % 200 === 199 || it === EIT - 1) runtimePhase('erosion-progress', { iteration: it + 1, total: EIT });")
    replace('    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo(vT)); gl.viewport(0, 0, EN, EN); gl.drawArrays(gl.TRIANGLES, 0, 3);',
            '    await tiled(fbo(vT), EN, EN, 512, null);')
    replace('  const plants = (G, kind, dens, rmin, rmax) => {',
            '  const plants = async (G, kind, dens, rmin, rmax) => {')
    replace('    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo(t)); gl.viewport(0, 0, n, n); gl.drawArrays(gl.TRIANGLES, 0, 3);',
            '    await tiled(fbo(t), n, n, 256, null);')
    replace('  world.trees = plants(', '  world.trees = await plants(')
    replace('  world.bush = plants(', '  world.bush = await plants(')
    replace('    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo(world.treeB)); gl.viewport(0, 0, n, n); gl.drawArrays(gl.TRIANGLES, 0, 3); }',
            '    await tiled(fbo(world.treeB), n, n, 256, null); }')
    replace("  console.log('generate ms', (performance.now() - T0).toFixed(0));",
            "  runtimePhase('generate-ready', { ms: Math.round(performance.now() - T0) });\n  console.log('generate ms', (performance.now() - T0).toFixed(0));")

    # Source FFT resolution and all spectrum parameters are unchanged.
    replace('async function oceanInit() {\n  const N = OCEAN_N;',
            "async function oceanInit() {\n  const N = OCEAN_N;\n  runtimePhase('ocean-init-start', { resolution: N });")
    replace('    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo(C.h0)); gl.viewport(0, 0, N, N); gl.drawArrays(gl.TRIANGLES, 0, 3);',
            '    await tiled(fbo(C.h0), N, N, 256, null);')
    replace('    ocean.c.push(C);\n  }\n}\nfunction oceanUpdate(t) {',
            "    ocean.c.push(C);\n  }\n  runtimePhase('ocean-init-ready');\n}\nfunction oceanUpdate(t) {")
    replace('async function readGround() {\n  const N = 512,',
            "async function readGround() {\n  runtimePhase('ground-readback-start');\n  const N = 512,")
    replace('  groundCPU = { N, d };', "  groundCPU = { N, d };\n  runtimePhase('ground-readback-ready');")

    # A full-resolution raymarch is still the exact same shader, coordinates,
    # accumulation and number of samples. Wait between its existing scissor
    # bands instead of queueing the complete expensive frame at once.
    replace('function renderSample(cam, time, jit, oceanReady) {',
            'async function renderSample(cam, time, jit, oceanReady) {')
    replace('num("bandpx", 15000)', 'num("bandpx", 60000)')
    replace('    if (bands > 1) gl.flush();', '    if (bands > 1 && ((b & 3) === 3 || b === bands - 1)) await gpuWait();')
    value = re.sub(r'(?<!function )(?<!await )\brenderSample\(', 'await renderSample(', value)

    # A disabled HUD contributes only transparent pixels in the source. Keep
    # the original enabled-HUD drawing/upload path while avoiding a full-size
    # clear and texture redefinition, and its transparent post sample, when off.
    replace('function drawHUD(t, cam) {\n  const W',
            'function drawHUD(t, cam) {\n  if (!hudOn) return;\n  const W')
    replace('function uploadHUD() {\n  if (!hudTex)',
            'function uploadHUD() {\n  if (!hudOn) return;\n  if (!hudTex)')
    replace('const useHud = withHud && hudTex;', 'const useHud = withHud && hudOn && hudTex;')
    replace("  console.log('render compiled ms', (performance.now() - TC0).toFixed(0));",
            "  runtimePhase('renderer-programs-ready', { ms: Math.round(performance.now() - TC0) });\n  if (Q.get('compileonly') === '1') { await new Promise(() => {}); }\n  console.log('render compiled ms', (performance.now() - TC0).toFixed(0));")
    return value.replace('\n', eol)


def build():
    original_bytes = SOURCE.read_bytes()
    source_hash = hashlib.sha256(original_bytes).hexdigest()
    if source_hash != EXPECTED_SOURCE_SHA256:
        raise ValueError('Preserved upstream source SHA-256 changed; inspect before adapting.')
    original = original_bytes.decode('utf-8')
    eol = '\r\n' if '\r\n' in original else '\n'
    helper = DEFERRED_COMPILER.replace('\n', eol)
    drone = DRONE_CONTROLS.replace('\n', eol)
    assert original.count('function prog(fs) {') == 1
    assert original.count('pr = prog(FS_RENDER);') == 1
    adapted = original.replace('function prog(fs) {', helper + eol + 'function prog(fs) {')
    # Label named source programs and await every compilation, including inline
    # read-back helpers. All their callers are asynchronous after oceanInit adapts.
    adapted = re.sub(r'(?<!function )\bprog\((FS_[A-Z0-9_]+)\)',
                     lambda m: 'await progDeferred(' + m[1] + ", '" + m[1] + "')", adapted)
    adapted = adapted.replace('const P = prog(GLSL_COMMON', 'const P = await progDeferred(GLSL_COMMON')
    adapted = adapted.replace('function oceanInit() {', 'async function oceanInit() {')
    adapted = adapted.replace('  oceanInit();', '  await oceanInit();')
    adapted = adapted.replace('await generate(); hdumpPass();', 'await generate(); await hdumpPass();')
    adapted = adapt_scheduling(adapted)
    adapted, count = re.subn(r'function startDrone\(\) \{[\s\S]*?\n\}\r?\n', lambda _: drone, adapted, count=1)
    assert count == 1
    adapted = adapted.replace('<title>Na Pali FPV</title>', '<title>Na Pali · 完整原始渲染交互版</title>')
    adapted = adapted.replace('</head>', '<meta name="upstream-sha256" content="' + source_hash + '">' + eol + '<link rel="stylesheet" href="controller.css">' + eol + '</head>', 1)
    adapted = adapted.replace('</body>', '<script src="controller.js"></script>' + eol + '</body>', 1)
    # Every original template literal, including every GLSL source and its
    # interpolations, is retained exactly. New scheduling/control code adds none.
    templates = lambda value: re.findall(r'`(?:\\.|[^`])*`', value, flags=re.DOTALL)
    before, after = templates(original), templates(adapted)
    if before != after:
        raise ValueError('A source template changed; full shader preservation check failed.')
    return adapted.encode('utf-8'), {
        'source_sha256': source_hash,
        'runtime_sha256': hashlib.sha256(adapted.encode('utf-8')).hexdigest(),
        'preserved_template_literals': len(before),
        'glsl_unchanged': True,
        'adaptations': ['all program compiles deferred', 'quality-preserving GPU work partitioning', 'disabled HUD work elision', 'completed-stage wall-time diagnostics', 'phase diagnostics', 'drone control API', 'explicit quality', 'suspend lifecycle', 'controller UI links'],
    }


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Verify generated runtime matches without writing')
    args = parser.parse_args()
    content, report = build()
    if args.check:
        if not OUTPUT.is_file() or OUTPUT.read_bytes() != content:
            raise SystemExit('Runtime is absent or stale; rerun build_runtime.py')
    else:
        OUTPUT.parent.mkdir(parents=True, exist_ok=True)
        OUTPUT.write_bytes(content)
    print(json.dumps(report, ensure_ascii=False, indent=2))
