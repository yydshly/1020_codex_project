"""Render a paused native scene only when its actual inputs become dirty.

This transforms the independent native startDrone loop only. The retained
upstream/original renderer and every GLSL string are outside this patch. No
file is generated, no process starts, and no active preview is controlled.
"""
from __future__ import annotations

import hashlib
from lijiang_native_river import _body_end

REVISION = 'native-paused-dirty-render-2'


def _once(source: str, before: str, after: str) -> str:
    if source.count(before) != 1:
        raise ValueError('Native idle patch boundary changed: ' + before[:100])
    return source.replace(before, after, 1)


IDLE_STATE = r'''
  // native-paused-dirty-render-2: RAF may inspect controls while the GPU rests.
  // A completed render, not the RAF count, is the only source of frame numbers.
  let idle = false, lastCompletedSignature = null;
  let invalidationRevision = 0, completedInvalidationRevision = -1;
  let lastInvalidationReason = 'startup';
  const nativeObjectIds = new WeakMap();
  let nativeObjectSequence = 0;
  function nativeObjectId(value) {
    if (value === null || (typeof value !== 'object' && typeof value !== 'function')) return value ?? null;
    let identity = nativeObjectIds.get(value);
    if (!identity) { identity = ++nativeObjectSequence; nativeObjectIds.set(value, identity); }
    return identity;
  }
  function invalidateNativeFrame(reason) {
    invalidationRevision++;
    lastInvalidationReason = String(reason || 'explicit-refresh').slice(0, 120);
    idle = false;
  }
  function nativeFrameSignature(cam, frameTime) {
    // Keep the pre-render signature. If a slider or a control changes during
    // an awaited GPU band, the next RAF sees that change and renders it too.
    // Do not include frames/frameNo/R.n: those are outputs of rendering.
    const transport = window.__napaliSourceStream?.getState?.();
    return JSON.stringify({
      revision: invalidationRevision, time: frameTime,
      camera: { pos: Array.from(cam.pos), mat: Array.from(cam.mat), vfov: cam.vfov,
        settle: cam.settle, speed: cam.speed, thrust: cam.thrust,
        f: cam.f ? Array.from(cam.f) : null, u: cam.u ? Array.from(cam.u) : null,
        r: cam.r ? Array.from(cam.r) : null },
      driveMode: window.napaliDrive?.getState?.().mode || 'flight',
      params: PARAMS, query: Array.from(Q.entries()), sun: Array.from(sunDir),
      // A peer may connect after both initial readiness frames were drawn.
      // Its stable state transitions request a fresh actual canvas present.
      // Encoded/sent/capture counters are outputs and must never feed back.
      transport: [transport?.connectionState || 'idle', transport?.iceConnectionState || 'idle',
        transport?.trackReadyState || null],
      hud: hudOn, quality: [rs, autoQuality], canvas: [cv.width, cv.height],
      target: [nativeObjectId(R), R.w, R.h, nativeObjectId(R.acc), nativeObjectId(R.f),
        ...(R.b || []).map(nativeObjectId), ...(R.bf || []).map(nativeObjectId)],
      programs: [pr, pp, pbr, pbl].map(value => nativeObjectId(value?.p)),
      fields: [world, world.hTex, world.aTex, world.vTex, world.coastTex,
        world.msTex, world.treeB, world.trees?.t, world.bush?.t].map(nativeObjectId)
    });
  }
'''.rstrip()


def patch(source: str) -> tuple[str, dict]:
    if 'window.lijiangNativeProvenance=' not in source:
        raise ValueError('Paused dirty rendering is restricted to the independent native scene')
    start = source.find('function startDrone() {')
    if start < 0 or source.count('function startDrone() {') != 1:
        raise ValueError('Expected one native startDrone function')
    end = _body_end(source, source.index('{', start))
    original = source[start:end]
    body = original
    body = _once(body,
        '  let renderSampleMs = 0, hudMs = 0, presentMs = 0;',
        '  let renderSampleMs = 0, hudMs = 0, presentMs = 0;\n' + IDLE_STATE)
    body = _once(body,
        'suspended, rendering, ready: !gl.isContextLost()',
        'suspended, rendering, idle: idle && !rendering && !suspended, invalidationRevision, completedInvalidationRevision, lastInvalidationReason, ready: !gl.isContextLost()')
    body = _once(body,
        '    pause(value = true) { paused = Boolean(value); return getState(); },',
        "    pause(value = true) { const next = Boolean(value); if (next !== paused) { paused = next; invalidateNativeFrame('pause-change'); } return getState(); },")
    body = _once(body,
        '    togglePause() { paused = !paused; return getState(); },',
        "    togglePause() { paused = !paused; invalidateNativeFrame('pause-toggle'); return getState(); },")
    body = _once(body,
        '    seek(seconds) { t = clampTime(seconds); return getState(); },',
        "    seek(seconds) { t = clampTime(seconds); invalidateNativeFrame('seek'); return getState(); },")
    body = _once(body,
        '    restart() { t = 0; paused = false; last = performance.now(); return getState(); },',
        "    restart() { t = 0; paused = false; last = performance.now(); invalidateNativeFrame('restart'); return getState(); },")
    body = _once(body,
        '    setQuality(scale) { rs = clampScale(scale); autoQuality = false; slow = 0; fast = 0; return getState(); },',
        "    setQuality(scale) { rs = clampScale(scale); autoQuality = false; slow = 0; fast = 0; invalidateNativeFrame('quality'); return getState(); },")
    body = _once(body,
        '    suspend(value = true) { suspended = Boolean(value); last = performance.now(); return getState(); },',
        "    suspend(value = true) { const next = Boolean(value); if (next !== suspended) { suspended = next; invalidateNativeFrame(next ? 'suspend' : 'resume'); } last = performance.now(); return getState(); },\n"
        "    invalidate(reason = 'explicit-refresh') { invalidateNativeFrame(reason); return getState(); },")
    body = _once(body,
        "  addEventListener('resize', () => { cv.width = innerWidth; cv.height = innerHeight; });",
        "  addEventListener('resize', () => { cv.width = innerWidth; cv.height = innerHeight; invalidateNativeFrame('window-resize'); });")
    body = _once(body,
        '    try { if (!suspended) {\n      rendering = true;\n      const frameStarted = performance.now();',
        "    try { if (!suspended) {\n      if (gl.isContextLost()) throw new Error('WebGL context lost before native frame');\n      const frameStarted = performance.now();")
    body = _once(body,
        '      if (autoQuality) {',
        '      if (autoQuality && (!paused || !idle)) {')
    body = _once(body,
        '      const cam = flightCam(nativeFrameTime);\n      const renderStarted = performance.now();',
        '''      const cam = flightCam(nativeFrameTime);
      const frameSignature = nativeFrameSignature(cam, nativeFrameTime);
      const frameInvalidationRevision = invalidationRevision;
      // First two real frames keep the existing bridge readiness contract.
      // flightCam still runs before this check, so held free-flight keys and
      // mouse/controller pose changes wake the renderer without a frame pump.
      if (paused && frames >= 2 && frameSignature === lastCompletedSignature) {
        idle = true;
        requestAnimationFrame(loop);
        return;
      }
      idle = false;
      rendering = true;
      const renderStarted = performance.now();''')
    body = _once(body,
        '      frames++;\n      if (frames === 1)',
        '      frames++;\n      lastCompletedSignature = frameSignature;\n      completedInvalidationRevision = frameInvalidationRevision;\n      if (frames === 1)')
    body = _once(body,
        '      lastError = String(error.message || error); suspended = true;',
        '      lastError = String(error.message || error); suspended = true; idle = false;')
    patched = source[:start] + body + source[end:]
    return patched, {
        'applied': True, 'revision': REVISION,
        'scope': 'Independent native startDrone CPU scheduling only; all GLSL and the preserved source renderer remain unchanged',
        'startupCompletedFrames': 2,
        'idleOnlyWhenPausedAndInputsIdentical': True,
        'continuesFreeCameraEvaluationWhileIdle': True,
        'newControlMethod': 'napaliControl.invalidate(reason)',
        'transportSignatureFields': ['connectionState', 'iceConnectionState', 'trackReadyState'],
        'transportCountersAffectSignature': False,
        'newStateFields': ['idle', 'invalidationRevision', 'completedInvalidationRevision', 'lastInvalidationReason'],
        'unmodifiedPrefixSHA256': hashlib.sha256(source[:start].encode()).hexdigest(),
        'unmodifiedSuffixSHA256': hashlib.sha256(source[end:].encode()).hexdigest(),
        'startDroneBeforeSHA256': hashlib.sha256(original.encode()).hexdigest(),
        'startDroneAfterSHA256': hashlib.sha256(body.encode()).hexdigest(),
    }
