import * as THREE from 'three';
import { createSdfPilot } from './raster-sdf-mesh.js';
import { bakeNativeSurfaceColors } from './native-surface-fields.js';

const REVISION = 'native-surface-specialization-comparison-1';
let comparing = false;
async function sha256(array) {
  const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(value => value.toString(16).padStart(2, '0')).join('');
}

async function measuredBake(positions, options, specialized, notify) {
  const started = performance.now();
  const result = await bakeNativeSurfaceColors(positions, { ...options, specializeVegetation: specialized,
    onProgress(state) { notify((specialized ? 'specialized-' : 'baseline-') + state.phase); } });
  const compilationMilliseconds = result.metadata.programCache?.compilationMilliseconds ?? null;
  return { result, timing: { callWallMilliseconds: performance.now() - started,
    bakedMilliseconds: result.metadata.bakedMilliseconds,
    compilationMilliseconds,
    originalCompilationMilliseconds: result.metadata.programCache?.originalCompilationMilliseconds ?? null,
    programCacheHit: result.metadata.programCache?.hit ?? null,
    nonCompileBakeWallMilliseconds: compilationMilliseconds === null ? null
      : Math.max(0, result.metadata.bakedMilliseconds - compilationMilliseconds),
    timingKind: 'Existing baker wall timing, including real GPU completion fences; non-compile time also includes setup, readback and metadata, not hardware GPU timer queries' } };
}

export async function compareNativeSurfaceSpecialization(volume, { maxVertices = 4096,
  maxBatchPixels = 60000, referenceEye = [-50, 16, 650], footprint = .35,
  sunDirection = null } = {}) {
  if (comparing) throw new Error('A native surface-specialization comparison is already running');
  if (!volume?.field || !volume.metadata) throw new Error('Comparison needs the actual generated signed volume');
  if (!Number.isInteger(maxVertices) || maxVertices < 1 || maxVertices > 65536) throw new Error('maxVertices must be 1..65536');
  if (typeof gl === 'undefined' || gl.isContextLost()) throw new Error('Actual native comparison context is unavailable');
  const elevation = 18 * Math.PI / 180, azimuth = 25 * Math.PI / 180;
  const sun = sunDirection || [Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), Math.cos(azimuth) * Math.cos(elevation)];
  const originalField = volume.field, originalFieldBytes = originalField.byteLength, started = performance.now();
  let temporary = null, temporaryMaterial = null;
  comparing = true;
  function progress(phase) {
    const state = { revision: REVISION, phase, elapsedMilliseconds: performance.now() - started, active: phase !== 'complete' && phase !== 'error' };
    window.lijiangNativeSurfaceCompareStatus = Object.freeze(state);
    const text = document.getElementById('loadtxt');if (text) text.textContent = '原生岩壁特化对照 · ' + phase;
  }
  try {
    progress('extract-exact-MC-positions');
    temporaryMaterial = new THREE.MeshStandardMaterial();
    temporary = createSdfPilot({ THREE, field: originalField, metadata: volume.metadata, material: temporaryMaterial });
    const all = temporary.mesh.geometry.getAttribute('position').array, vertices = all.length / 3;
    if (!vertices) throw new Error('Actual signed volume produced no comparison vertices');
    const stride = Math.max(1, Math.ceil(vertices / maxVertices)), count = Math.ceil(vertices / stride);
    const positions = new Float32Array(count * 3);
    for (let i = 0, at = 0; i < vertices; i += stride, at++) positions.set(all.subarray(i * 3, i * 3 + 3), at * 3);
    const positionsSHA256 = await sha256(positions);
    const options = { sunDirection: sun, referenceEye, footprint, maxBatchPixels };
    const baseline = await measuredBake(positions, options, false, progress);
    const specialized = await measuredBake(positions, options, true, progress);
    const a = baseline.result.colors, b = specialized.result.colors;
    if (a.length !== positions.length || b.length !== a.length) throw new Error('Compared native RGB arrays have different vertex counts');
    if (baseline.result.metadata.positionsSHA !== positionsSHA256 || specialized.result.metadata.positionsSHA !== positionsSHA256)
      throw new Error('Compared native bakes did not use the exact same sampled MC positions');
    if (baseline.result.metadata.specializeVegetation !== false || specialized.result.metadata.specializeVegetation !== true)
      throw new Error('Compared native programs did not use the requested source/specialized pair');
    let maximumAbsolute = 0, maximumRelative = 0, absoluteSum = 0, changedComponents = 0, nonFiniteComponents = 0;
    for (let i = 0; i < a.length; i++) {
      if (!Number.isFinite(a[i]) || !Number.isFinite(b[i])) { nonFiniteComponents++;continue; }
      const absolute = Math.abs(a[i] - b[i]), relative = absolute / Math.max(Math.abs(a[i]), Math.abs(b[i]), 1e-6);
      maximumAbsolute = Math.max(maximumAbsolute, absolute);maximumRelative = Math.max(maximumRelative, relative);absoluteSum += absolute;
      if (absolute !== 0) changedComponents++;
    }
    const baselineRGBByteSHA256 = await sha256(a), specializedRGBByteSHA256 = await sha256(b);
    if (baselineRGBByteSHA256 !== baseline.result.metadata.colorsSHA256 || specializedRGBByteSHA256 !== specialized.result.metadata.colorsSHA256)
      throw new Error('Compared RGB bytes failed their actual bake metadata SHA');
    if (nonFiniteComponents) throw new Error('Native comparison contains non-finite RGB components');
    if (volume.field !== originalField || volume.field.byteLength !== originalFieldBytes) throw new Error('Comparison replaced or detached the caller volume');
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    const report = { revision: REVISION, scope: 'Actual native GPU source/specialized RGB comparison only; no artwork-quality acceptance or automatic default change',
      actualGPU: true, artAccepted: false, backend: { renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
        vendor: debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR), contextLost: gl.isContextLost() },
      volumeResolution: volume.metadata.resolution, totalMCVertices: vertices, sampledVertices: count, stride,
      sampling: 'Every stride-th vertex in the exact deterministic MC order; no synthetic points or alternate mountain geometry',
      positionsSHA256, sunDirection: baseline.result.metadata.sunDirection, referenceEye: baseline.result.metadata.referenceEye,
      footprintMode: baseline.result.metadata.footprintMode, referenceProjection: baseline.result.metadata.referenceProjection,
      comparison: { maximumAbsoluteRGBDifference: maximumAbsolute, meanAbsoluteRGBDifference: absoluteSum / a.length,
        maximumRelativeRGBDifference: maximumRelative, relativeDenominatorFloor: 1e-6, changedComponents,
        totalComponents: a.length, baselineRGBByteSHA256, specializedRGBByteSHA256,
        RGBFloat32BytesIdentical: baselineRGBByteSHA256 === specializedRGBByteSHA256,
        byteHashFormat: 'Raw linear HDR RGB Float32 bytes, not display-tonemapped RGB8' },
      baseline: { timing: baseline.timing, metadata: baseline.result.metadata },
      specialized: { timing: specialized.timing, metadata: specialized.result.metadata },
      volumeFieldReferenceAndByteLengthPreserved: true, elapsedMilliseconds: performance.now() - started };
    progress('complete');
    return report;
  } catch (error) { progress('error');throw error; }
  finally {
    temporary?.dispose();temporaryMaterial?.dispose();comparing = false;
  }
}
