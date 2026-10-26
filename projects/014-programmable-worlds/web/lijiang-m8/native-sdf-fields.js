// Sample the actual native terrSD field, once per voxel, for a local mesh pilot.
// No height approximation or alternate rock noise is introduced. This module
// is inert until collectNativeRockVolume() is explicitly called by its host.
import { buildGeometryPrefix } from './native-geometry-shader.js';

const REVISION = 'm3-rock-volume-pipelined-pack-2';
// M4 fixes terrSD bare=1 and exports with gVeg=false. V and uMC can therefore
// become inactive after legal shader optimization; live uniforms are still
// reflected, resolved and uploaded, with no fallback for missing live bindings.
const VOLUME_CORE_UNIFORMS=['uH','uMS','uRect','uLiSdfOrigin','uLiSdfSpacing','uLiSdfSlice'];
const DEFAULT_RESOLUTION = 192, DEFAULT_SIZE = 576, DEFAULT_ORIGIN = [287, -24, -458];
const volumePrograms = new WeakMap();
const writerSources = new Map();
let collecting = false;

function bodyEnd(source, opening) {
  let depth = 0;
  for (let i = opening; i < source.length; i++) {
    if (source.startsWith('//', i)) { const end = source.indexOf('\n', i + 2);i = end < 0 ? source.length : end;continue; }
    if (source.startsWith('/*', i)) { const end = source.indexOf('*/', i + 2);if (end < 0) throw new Error('Unclosed native shader comment');i = end + 1;continue; }
    if (source[i] === '{') depth++;
    else if (source[i] === '}' && --depth === 0) return i + 1;
  }
  throw new Error('Unclosed native shader main');
}

export function buildNativeRockVolumeShader(fragmentSource,{packedSlices=false}={}) {
  if (typeof fragmentSource !== 'string' || !fragmentSource.startsWith('#version 300 es')) throw new Error('Expected the actual native WebGL2 FS_RENDER string');
  const definitions = [...fragmentSource.matchAll(/\bvoid\s+main\s*\(\s*\)\s*\{/g)];
  if (definitions.length !== 1) throw new Error('Expected exactly one native renderer main');
  const start = definitions[0].index, end = bodyEnd(fragmentSource, fragmentSource.indexOf('{', start));
  const writer = /* glsl */`
uniform vec3 uLiSdfOrigin;
uniform float uLiSdfSpacing;
uniform int uLiSdfSlice;
${packedSlices?'uniform int uLiSdfAtlasResolution;':''}
void main(){
  // Inclusive node positions, not voxel centres: x + n * (y + n * z).
  ${packedSlices?`int atlasRow=int(floor(gl_FragCoord.y));
  vec2 xy=vec2(floor(gl_FragCoord.x),float(atlasRow%uLiSdfAtlasResolution));
  float slice=float(uLiSdfSlice+atlasRow/uLiSdfAtlasResolution);`:`vec2 xy=floor(gl_FragCoord.xy);
  float slice=float(uLiSdfSlice);`}
  vec3 p=uLiSdfOrigin+vec3(xy,slice)*uLiSdfSpacing;
  gVeg=false;
  gPix=.25;
  gEpsM=0.;
  float steep;
  float distance=terrSD(p,H(p.xz),steep);
  o=vec4(distance,0.,0.,1.);
}


`;
  return { source: fragmentSource.slice(0, start) + writer + fragmentSource.slice(end),
    originalMain: fragmentSource.slice(start, end), writerMain: writer,
    unchangedPrefix: fragmentSource.slice(0, start), unchangedSuffix: fragmentSource.slice(end) };
}

async function volumeWriter(fragmentSource,{pruneShader,packedSlices}){
  let variants=writerSources.get(fragmentSource);
  if(!variants){variants=new Map();writerSources.set(fragmentSource,variants);}
  const key=Number(pruneShader)+'-'+Number(packedSlices);
  if(!variants.has(key))variants.set(key,(async()=>{
    const shader=buildNativeRockVolumeShader(fragmentSource,{packedSlices});
    if(pruneShader){
      const reduced=await buildGeometryPrefix(shader.unchangedPrefix);
      shader.sourcePrefix=reduced.prefix;shader.pruning=reduced.metadata;
      shader.source=reduced.prefix+shader.writerMain+shader.unchangedSuffix;
    }else{shader.sourcePrefix=shader.unchangedPrefix;shader.pruning={enabled:false};}
    return shader;
  })());
  try{return await variants.get(key);}catch(error){variants.delete(key);throw error;}
}

export function buildNativeRockUniformBody(renderSampleSource) {
  if (typeof renderSampleSource !== 'string' || !/^async\s+function\s+renderSample\s*\(/.test(renderSampleSource)) throw new Error('Expected the actual native renderSample function source');
  const marker = 'gl.enable(gl.BLEND);';
  if (renderSampleSource.split(marker).length !== 2) throw new Error('Native uniform setup boundary changed');
  let prefix = renderSampleSource.slice(renderSampleSource.indexOf('{') + 1, renderSampleSource.indexOf(marker));
  const remove = (pattern, label) => {
    const matches = [...prefix.matchAll(new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g'))];
    if (matches.length !== 1) throw new Error('Native ocean exclusion boundary changed: ' + label);
    prefix = prefix.replace(pattern, '');
  };
  remove(/^[ \t]*if\s*\(\s*!oceanReady\s*\)\s*oceanUpdate\(time\);[ \t]*$/m, 'FFT update');
  remove(/^[ \t]*for\s*\(let c = 0; c < 3; c\+\+\)\s*\{[^\n]*ocean\.c\[c\][^\n]*\}[ \t]*$/m, 'FFT cascade bindings');
  remove(/gl\.uniform3f\(u\.uOL,\s*ocean\.L\[0\],\s*ocean\.L\[1\],\s*ocean\.L\[2\]\);/, 'FFT length uniform');
  if (/\bocean\b|\boceanUpdate\b|\bawait\b|gl\.draw(?:Arrays|Elements)\s*\(/.test(prefix)) throw new Error('Native uniform prefix contains an unexpected ocean dependency or draw');
  if (!prefix.includes('world.hTex') || !prefix.includes('world.vTex') || !prefix.includes('world.msTex') || !prefix.includes('u.uMC')) throw new Error('Native terrain bindings/defaults were not preserved');
  // These local bindings shadow the source renderer's pr/R; globals are never
  // replaced, and every remaining upload is copied from the actual renderer.
  return `const pr=volumeProgram,R=target,cam=camera,jit=jitter;\n${prefix}`;
}

export function repairNativeRockUniformLocations(context, program, { requiredNames = null } = {}) {
  const diagnostics = { activeCount: context.getProgramParameter(program.p, context.ACTIVE_UNIFORMS),
    initiallyMissingNames: [], repairedNames: [], unresolvedNames: [], metadataSkippedNames: [], entries: [] };
  for (let index = 0; index < diagnostics.activeCount; index++) {
    const info = context.getActiveUniform(program.p, index);
    if (!info) throw new Error('Native volume active-uniform reflection returned no entry at ' + index);
    const name = info.name, alias = name.replace(/\[0\]$/, '');
    const isArray = info.size > 1 || /\[0\](?:$|\.)/.test(name);
    let location = program.u[alias], resolvedBy = 'existing-location';
    const entry = { name, alias, size: info.size, type: info.type, isArray,
      initiallyMissing: location == null, attempts: [] };
    if (location == null) {
      diagnostics.initiallyMissingNames.push(alias);
      // Some drivers accept foo[0] but reject foo. Only actual active arrays
      // get an indexed fallback; scalar failures are not hidden as arrays.
      const candidates = [...new Set([name, alias, ...(isArray ? [alias + '[0]'] : [])])];
      for (const candidate of candidates) {
        entry.attempts.push(candidate);
        const found = context.getUniformLocation(program.p, candidate);
        if (found != null) { location = found;resolvedBy = candidate;break; }
      }
      if (location != null) { program.u[alias] = location;diagnostics.repairedNames.push(alias); }
      else { program.u[alias] = null;diagnostics.unresolvedNames.push(alias);resolvedBy = null; }
    }
    entry.resolvedBy = resolvedBy;entry.resolved = location != null;diagnostics.entries.push(entry);
  }
  // These fields are needed to evaluate the intended surface. A missing core
  // binding must fail before drawing, rather than silently sample unit zero.
  const required = requiredNames || VOLUME_CORE_UNIFORMS;
  diagnostics.missingRequiredNames = required.filter(name => program.u[name] == null);
  return diagnostics;
}

export function readNativeRockUniformMetadata(context, program, diagnostics) {
  const values = {};
  for (const [name, location] of Object.entries(program.u)) {
    if (location == null) { diagnostics.metadataSkippedNames.push(name);continue; }
    const value = context.getUniform(program.p, location);
    values[name] = ArrayBuffer.isView(value) ? Array.from(value) : value;
  }
  return values;
}

async function sha256(text) {
  const bytes = new TextEncoder().encode(text);
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(v => v.toString(16).padStart(2, '0')).join('');
}

function captureGLState(context, additionalTextureUnits = []) {
  const active = context.getParameter(context.ACTIVE_TEXTURE), units = new Set([...Array(14).keys(), ...additionalTextureUnits, active - context.TEXTURE0]);
  const textures = [];
  for (const unit of units) { context.activeTexture(context.TEXTURE0 + unit);textures.push([unit, context.getParameter(context.TEXTURE_BINDING_2D)]); }
  context.activeTexture(active);
  const currentProgram = context.getParameter(context.CURRENT_PROGRAM);
  // collectNativeFields() deletes its temporary sampling program while it is
  // still current. WebGL retires it on the next useProgram; it cannot later be
  // rebound. Preserve every live program exactly, and retire that dead handle.
  const programAlreadyDeleted = !!currentProgram && context.getProgramParameter(currentProgram, context.DELETE_STATUS);
  const flags = [context.BLEND, context.SCISSOR_TEST, context.DEPTH_TEST, context.CULL_FACE,
    context.STENCIL_TEST, context.DITHER, context.RASTERIZER_DISCARD].map(flag => [flag, context.isEnabled(flag)]);
  return { active, textures, flags,
    program: programAlreadyDeleted ? null : currentProgram, programAlreadyDeleted,
    vao: context.getParameter(context.VERTEX_ARRAY_BINDING),
    drawFramebuffer: context.getParameter(context.DRAW_FRAMEBUFFER_BINDING),
    readFramebuffer: context.getParameter(context.READ_FRAMEBUFFER_BINDING), readBuffer: context.getParameter(context.READ_BUFFER),
    viewport: Array.from(context.getParameter(context.VIEWPORT)), scissor: Array.from(context.getParameter(context.SCISSOR_BOX)),
    colorMask: Array.from(context.getParameter(context.COLOR_WRITEMASK)),
    packBuffer: context.getParameter(context.PIXEL_PACK_BUFFER_BINDING), unpackBuffer: context.getParameter(context.PIXEL_UNPACK_BUFFER_BINDING),
    packAlignment: context.getParameter(context.PACK_ALIGNMENT), packRowLength: context.getParameter(context.PACK_ROW_LENGTH),
    packSkipPixels: context.getParameter(context.PACK_SKIP_PIXELS), packSkipRows: context.getParameter(context.PACK_SKIP_ROWS),
    unpackSettings: [context.UNPACK_ALIGNMENT, context.UNPACK_ROW_LENGTH, context.UNPACK_IMAGE_HEIGHT,
      context.UNPACK_SKIP_PIXELS, context.UNPACK_SKIP_ROWS, context.UNPACK_SKIP_IMAGES,
      context.UNPACK_FLIP_Y_WEBGL, context.UNPACK_PREMULTIPLY_ALPHA_WEBGL,
      context.UNPACK_COLORSPACE_CONVERSION_WEBGL].map(flag => [flag, context.getParameter(flag)]) };
}

function restoreGLState(context, saved) {
  for (const [unit, texture] of saved.textures) { context.activeTexture(context.TEXTURE0 + unit);context.bindTexture(context.TEXTURE_2D, texture); }
  context.activeTexture(saved.active);
  context.bindFramebuffer(context.DRAW_FRAMEBUFFER, saved.drawFramebuffer);
  context.bindFramebuffer(context.READ_FRAMEBUFFER, saved.readFramebuffer);context.readBuffer(saved.readBuffer);
  context.viewport(...saved.viewport);context.scissor(...saved.scissor);context.colorMask(...saved.colorMask);
  for (const [flag, enabled] of saved.flags) enabled ? context.enable(flag) : context.disable(flag);
  context.bindBuffer(context.PIXEL_PACK_BUFFER, saved.packBuffer);context.bindBuffer(context.PIXEL_UNPACK_BUFFER, saved.unpackBuffer);
  context.pixelStorei(context.PACK_ALIGNMENT, saved.packAlignment);context.pixelStorei(context.PACK_ROW_LENGTH, saved.packRowLength);
  context.pixelStorei(context.PACK_SKIP_PIXELS, saved.packSkipPixels);context.pixelStorei(context.PACK_SKIP_ROWS, saved.packSkipRows);
  for (const [flag, value] of saved.unpackSettings) context.pixelStorei(flag, value);
  context.bindVertexArray(saved.vao);context.useProgram(saved.program);
}

export { captureGLState as captureNativeGLState, restoreGLState as restoreNativeGLState };

export async function collectNativeRockVolume({ resolution = DEFAULT_RESOLUTION, maxBatchPixels = 12000, origin = DEFAULT_ORIGIN, size = DEFAULT_SIZE, centre = [575,-170], clipEllipse = [270,250], onProgress = null, slicesPerReadback = 8, pruneShader = true } = {}) {
  if (collecting) throw new Error('A native rock-volume collection is already active');
  if (!Number.isInteger(resolution) || resolution < 64 || resolution > 512) throw new Error('Rock-volume resolution must be an integer from 64 to 512');
  const RESOLUTION = resolution, SIZE=Number(size), ORIGIN=Array.from(origin);
  if(!Number.isFinite(SIZE)||SIZE<=0||ORIGIN.length!==3||!ORIGIN.every(Number.isFinite)||centre.length!==2||clipEllipse.length!==2||!Array.from(centre).every(Number.isFinite)||!Array.from(clipEllipse).every(v=>Number.isFinite(v)&&v>0))throw new Error('Invalid rock volume world bounds');
  if (typeof gl === 'undefined' || typeof FS_RENDER !== 'string' || typeof renderSample !== 'function' || !world?.hTex || !world?.vTex || !world?.msTex) throw new Error('Actual native generated fields are not available');
  if (typeof HRES === 'undefined' || HRES !== 4096) throw new Error('The rock pilot requires the full actual 4096 native height field');
  if (!Number.isInteger(maxBatchPixels) || maxBatchPixels < RESOLUTION || maxBatchPixels > 60000) throw new Error('Rock-volume batches must be resolution..60000 pixels');
  if(!Number.isInteger(slicesPerReadback)||slicesPerReadback<1||slicesPerReadback>16||typeof pruneShader!=='boolean')throw new Error('Invalid M3 packed readback options');
  if (gl.isContextLost() || !gl.getExtension('EXT_color_buffer_float')) throw new Error('Native WebGL2 floating-point target is unavailable');
  if (window.lijiangNativeExport?.getState().active || window.lijiangNativeViewport?.getState().busy) throw new Error('Finish the native export/viewport mutation before sampling rock geometry');
  collecting = true;
  const start = performance.now(), control = window.napaliControl || null, previousControl = control?.getState() || null;
  const spacing = SIZE / (RESOLUTION - 1), field = new Float32Array(RESOLUTION ** 3);
  const statistics = { evaluations: 0, gpuCompletedBatches: 0, readbackPlanes: 0, submittedDraws:0,readbackCalls:0,
    minimum: Infinity, maximum: -Infinity, negativeSamples: 0, zeroSamples: 0, positiveSamples: 0,
    negativeBoundarySamples: 0, nonFiniteSamples: 0 };
  const timings={quiesce:0,shaderSource:0,programCompile:0,setup:0,drawSubmission:0,GPUWaitAndPolling:0,readPixels:0,scalarPackingAndStatistics:0};
  let saved = null, volumeProgram = null, targetTexture = null, targetFramebuffer = null, result = null;
  function progress(phase, slice = 0) {
    const value = { revision: REVISION, phase, active: !['complete', 'error'].includes(phase),
      slicesCompleted: slice, totalSlices: RESOLUTION, gpuCompletedBatches: statistics.gpuCompletedBatches,
      elapsedMilliseconds: performance.now() - start };
    window.lijiangNativeSDFStatus = Object.freeze(value);
    if (onProgress) onProgress(value);
    const text = document.getElementById('loadtxt');if (text) text.textContent = `原生岩壁体积 · ${phase} · ${slice} / ${RESOLUTION}`;
    if (typeof runtimePhase === 'function' && (slice % 16 === 0 || phase !== 'sampling')) {
      const { phase: stage, ...details } = value;runtimePhase('native-rock-volume', { ...details, stage });
    }
  }
  try {
    progress('quiesce');
    if (control) {
      control.suspend(true);
      const deadline = performance.now() + 180000;
      while (control.getState().rendering) { if (performance.now() > deadline) throw new Error('Native scene did not retire its active frame before rock sampling');await new Promise(resolve => setTimeout(resolve, 15)); }
      if (!control.getState().suspended) throw new Error('Native scene could not be suspended for rock sampling');
    }
    await gpuWait();saved = captureGLState(gl);timings.quiesce=performance.now()-start;
    const initialError = gl.getError();if (initialError) throw new Error('Native context has a pre-existing GL error ' + initialError);
    const sourceStart=performance.now();
    const shader = await volumeWriter(FS_RENDER,{pruneShader,packedSlices:true}), uploadBody = buildNativeRockUniformBody(renderSample.toString());
    timings.shaderSource=performance.now()-sourceStart;
    progress('compile');
    let cached=volumePrograms.get(gl);
    const compileStart=performance.now();
    if(!cached||cached.source!==shader.source||!gl.isProgram(cached.program.p)){
      cached={source:shader.source,program:await progDeferred(shader.source,'Actual native terrSD rock-volume writer')};
      volumePrograms.set(gl,cached);
    }
    timings.programCompile=performance.now()-compileStart;
    volumeProgram=cached.program;
    const setupStart=performance.now();
    const activeUniformLocationDiagnostics = repairNativeRockUniformLocations(gl, volumeProgram,{requiredNames:[...VOLUME_CORE_UNIFORMS,'uLiSdfAtlasResolution']});
    window.lijiangNativeSDFUniformDiagnostics = activeUniformLocationDiagnostics;
    if (activeUniformLocationDiagnostics.missingRequiredNames.length || activeUniformLocationDiagnostics.unresolvedNames.length) {
      throw new Error('Native rock volume lacks required uniform locations: ' + JSON.stringify(activeUniformLocationDiagnostics));
    }
    const upload = new Function('volumeProgram', 'target', 'camera', 'time', 'jitter', uploadBody);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, null);
    const viewportLimit=gl.getParameter(gl.MAX_VIEWPORT_DIMS),textureLimit=gl.getParameter(gl.MAX_TEXTURE_SIZE);
    const packedSlices=Math.max(1,Math.min(slicesPerReadback,Math.floor(textureLimit/RESOLUTION),Math.floor(viewportLimit[1]/RESOLUTION),Math.floor(1048576/(RESOLUTION*RESOLUTION))));
    const atlasHeight=RESOLUTION*packedSlices;
    targetTexture = tex(RESOLUTION, atlasHeight, gl.RGBA32F, gl.RGBA, gl.FLOAT, gl.NEAREST);
    targetFramebuffer = fbo(targetTexture);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Native rock-volume float framebuffer is incomplete');
    for (const flag of [gl.BLEND, gl.DEPTH_TEST, gl.CULL_FACE, gl.STENCIL_TEST, gl.RASTERIZER_DISCARD]) gl.disable(flag);
    gl.colorMask(true, true, true, true);gl.bindVertexArray(vao);
    gl.pixelStorei(gl.PACK_ALIGNMENT, 4);gl.pixelStorei(gl.PACK_ROW_LENGTH, 0);
    gl.pixelStorei(gl.PACK_SKIP_PIXELS, 0);gl.pixelStorei(gl.PACK_SKIP_ROWS, 0);
    const sampleTime = previousControl?.time || 0;
    upload(volumeProgram, { w: RESOLUTION, h: RESOLUTION, f: targetFramebuffer },
      { pos: [575, 64, 650], mat: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]), vfov: 58 * Math.PI / 180 }, sampleTime, [0, 0]);
    gl.uniform3fv(volumeProgram.u.uLiSdfOrigin, ORIGIN);gl.uniform1f(volumeProgram.u.uLiSdfSpacing, spacing);
    // Source resolution/aspect uniforms retain the old square target values.
    // Only integer writer coordinates and viewport use atlas dimensions.
    gl.viewport(0,0,RESOLUTION,atlasHeight);gl.uniform1i(volumeProgram.u.uLiSdfAtlasResolution,RESOLUTION);
    const activeUniforms = readNativeRockUniformMetadata(gl, volumeProgram, activeUniformLocationDiagnostics);
    const setupError = gl.getError();if (setupError) throw new Error('Native rock-volume uniform setup GL error ' + setupError);
    const rowsPerBatch = Math.min(RESOLUTION, Math.max(1, Math.floor(maxBatchPixels / RESOLUTION)));
    const rgba = new Float32Array(RESOLUTION * RESOLUTION * packedSlices * 4);
    gl.enable(gl.SCISSOR_TEST);
    timings.setup=performance.now()-setupStart;
    function submitGroup(z){
      const drawStarted=performance.now(),height=Math.min(packedSlices,RESOLUTION-z)*RESOLUTION;
      gl.uniform1i(volumeProgram.u.uLiSdfSlice, z);
      for (let row = 0; row < height; row += rowsPerBatch) {
        gl.scissor(0, row, RESOLUTION, Math.min(rowsPerBatch, height - row));
        gl.drawArrays(gl.TRIANGLES, 0, 3);statistics.submittedDraws++;
      }
      // Submission of the following group starts only after readPixels has
      // copied the preceding group into its CPU array. The texture may then
      // be reused while CPU unpacking runs; only one group is ever queued.
      gl.flush();timings.drawSubmission+=performance.now()-drawStarted;
    }
    submitGroup(0);
    for (let z = 0; z < RESOLUTION; z+=packedSlices) {
      const count=Math.min(packedSlices,RESOLUTION-z),height=count*RESOLUTION;
      const waitStart=performance.now();await gpuWait();timings.GPUWaitAndPolling+=performance.now()-waitStart;statistics.gpuCompletedBatches++;
      const readStart=performance.now();gl.readPixels(0, 0, RESOLUTION, height, gl.RGBA, gl.FLOAT, rgba);timings.readPixels+=performance.now()-readStart;statistics.readbackCalls++;
      const error = gl.getError();if (error) throw new Error('Native rock-volume slice ' + z + ' GL error ' + error);
      if(z+count<RESOLUTION)submitGroup(z+count);
      const base = z * RESOLUTION * RESOLUTION;
      const packStart=performance.now();
      for (let i = 0; i < RESOLUTION * RESOLUTION*count; i++) {
        const distance = rgba[i * 4];field[base + i] = distance;
        if (!Number.isFinite(distance)) statistics.nonFiniteSamples++;
        else {
          statistics.minimum = Math.min(statistics.minimum, distance);statistics.maximum = Math.max(statistics.maximum, distance);
          if (distance < 0) {
            statistics.negativeSamples++;
            const x = i % RESOLUTION, y = Math.floor(i / RESOLUTION)%RESOLUTION,worldZ=z+Math.floor(i/(RESOLUTION*RESOLUTION));
            if (x === 0 || y === 0 || worldZ === 0 || x === RESOLUTION - 1 || y === RESOLUTION - 1 || worldZ === RESOLUTION - 1) statistics.negativeBoundarySamples++;
          } else if (distance > 0) statistics.positiveSamples++;else statistics.zeroSamples++;
        }
      }
      timings.scalarPackingAndStatistics+=performance.now()-packStart;
      statistics.evaluations += RESOLUTION * RESOLUTION*count;statistics.readbackPlanes+=count;
      progress('sampling', z + count);
    }
    if (statistics.nonFiniteSamples || !statistics.negativeSamples || !statistics.positiveSamples) throw new Error('Native rock volume lacks a finite signed surface: ' + JSON.stringify(statistics));
    result = { field, metadata: {
      schema: 'native-rock-sdf-volume-v1', revision: REVISION, resolution: RESOLUTION,
      origin: ORIGIN.slice(), size: SIZE, spacing, sampleSpacing: spacing,
      dimensions: [RESOLUTION, RESOLUTION, RESOLUTION], indexing: 'x+n*(y+n*z)', inclusiveEndpoints: true,
      bounds: { minimum: ORIGIN.slice(), maximum: ORIGIN.map(value => value + SIZE) },
      centre: Array.from(centre), clipEllipse: Array.from(clipEllipse),
      footprint: { shape: 'ellipse', plane: 'xz', centre: Array.from(centre), axes: Array.from(clipEllipse), appliedToFieldValues: false },
      scalarField: 'Actual native terrSD conservative signed field; not an exact Euclidean distance',
      geometryVegetationCoupling:{revision:'m4-independent-rock-substrate-1',bareWeight:1,gVeg:false,
        dependsOnVegetationField:false,legallyInactiveUniforms:['uV','uMC'],
        liveUniformBindingsStillRequired:true,requiredCoreUniforms:VOLUME_CORE_UNIFORMS.slice()},
      positiveOutside: true, isoLevel: 0, gVeg: false, gPix: .25, gEpsM: 0,
      sourceHeightResolution: HRES, sourceVegetationResolution: typeof ARES === 'number' ? ARES : null,
      sourceTextureKind: 'Existing full-resolution runtime-generated native H/V/A/MS texture objects',
      sourceShaderSHA256: await sha256(FS_RENDER), writerShaderSHA256: await sha256(shader.source),
      sourceMainSHA256: await sha256(shader.originalMain), uniformUploadSHA256: await sha256(uploadBody),
      unchangedShaderPrefixSHA256: await sha256(shader.unchangedPrefix), unchangedShaderSuffixSHA256: await sha256(shader.unchangedSuffix),
      emittedShaderPrefixSHA256:await sha256(shader.sourcePrefix),shaderDependencyPruning:shader.pruning,
      shaderChangeScope: 'M3 atlas writer preserves sample coordinates. Optional dependency pruning preserves retained bodies and globals; GPU scalar equivalence remains to be measured.',
      uniformUpload: 'Actual renderSample prefix, excluding only oceanUpdate, ocean cascade texture bindings and ocean length uniform',
      activeUniforms, activeUniformLocationDiagnostics, statistics: { ...statistics }, maxBatchPixels, rowsPerBatch,
      packedReadback:{slicesPerReadback:packedSlices,atlasWidth:RESOLUTION,atlasHeight,maximumQueuedPixels:RESOLUTION*RESOLUTION*packedSlices,sourceResolutionUniformsChanged:false,overlapNextGroupWithScalarPacking:true},
      phaseTimingsMilliseconds:{...timings},
      usedAirSkipping: false, externalAssets: 0, artAccepted: false,
      glErrors: { before: initialError, setup: setupError, afterReadback: gl.getError() },
      collectedMilliseconds: performance.now() - start, globalProgramAndTargetReassigned: false,
      sharedRuntimeInitiallySuspended: previousControl?.suspended ?? null,
      previousDeletedTemporaryProgramRetired: saved.programAlreadyDeleted,
      provenance: { ...window.lijiangNativeProvenance, geometryExport: REVISION }
    } };
    progress('complete', RESOLUTION);
  } catch (error) {
    progress('error');throw error;
  } finally {
    try {
      if (!gl.isContextLost()) {
        if (targetFramebuffer) gl.deleteFramebuffer(targetFramebuffer);
        if (targetTexture) gl.deleteTexture(targetTexture);
        // This own-context program is reused for subsequent procedural peaks.
        if (saved) restoreGLState(gl, saved);
        if (result) { result.metadata.glStateRestored = true;result.metadata.glErrors.afterRestore = gl.getError(); }
      } else if (result) result.metadata.glStateRestored = false;
    } finally {
      if (control) control.suspend(previousControl.suspended);
      collecting = false;
    }
  }
  if (result.metadata.glErrors.afterReadback || result.metadata.glErrors.afterRestore || !result.metadata.glStateRestored) throw new Error('Native rock-volume collection did not restore a healthy GL state');
  return result;
}
