import { buildNativeRockVolumeShader, buildNativeRockUniformBody,
  repairNativeRockUniformLocations, readNativeRockUniformMetadata,
  captureNativeGLState, restoreNativeGLState } from './native-sdf-fields.js';

// One actual native shading evaluation per supplied MC vertex. The result is
// view/light-frozen linear HDR radiance, not an albedo or an external texture.
const REVISION = 'native-surface-radiance-4';
let baking = false;
const programCaches = new WeakMap();

async function surfaceProgram(context, source) {
  let cache = programCaches.get(context);
  if (!cache) { cache = new Map();programCaches.set(context, cache); }
  let entry = cache.get(source);
  if (entry && typeof context.isProgram === 'function' && !context.isProgram(entry.program.p)) {
    cache.delete(source);entry = null;
  }
  if (entry) {
    entry.uses++;
    return { program: entry.program, metadata: { hit: true, compilationMilliseconds: 0,
      originalCompilationMilliseconds: entry.compilationMilliseconds, uses: entry.uses,
      cachedPrograms: cache.size, key: 'exact writer source text per WebGL context' } };
  }
  const started = performance.now();
  const program = await progDeferred(source, 'Actual native surface radiance at MC vertices');
  entry = { program, compilationMilliseconds: performance.now() - started, uses: 1 };
  cache.set(source, entry);
  return { program, metadata: { hit: false, compilationMilliseconds: entry.compilationMilliseconds,
    originalCompilationMilliseconds: entry.compilationMilliseconds, uses: 1,
    cachedPrograms: cache.size, key: 'exact writer source text per WebGL context' } };
}

export function disposeNativeSurfaceBaker(context = typeof gl === 'undefined' ? null : gl) {
  if (baking) throw new Error('Wait for the active native surface bake before disposing its program cache');
  const cache = context ? programCaches.get(context) : null;
  if (!cache) return { disposedPrograms: 0, contextLost: context?.isContextLost?.() || false };
  const lost = context.isContextLost();
  if (!lost) {
    const current = context.getParameter(context.CURRENT_PROGRAM);
    if ([...cache.values()].some(entry => entry.program.p === current)) context.useProgram(null);
    for (const entry of cache.values()) context.deleteProgram(entry.program.p);
  }
  const disposedPrograms = cache.size;cache.clear();programCaches.delete(context);
  return { disposedPrograms, contextLost: lost, scope: 'Only programs owned by this surface-baker cache' };
}

const writerMain = /* glsl */`
uniform sampler2D uLiSurfacePositions;
uniform float uLiSurfaceFootprint;
void main(){
  vec4 samplePosition=texelFetch(uLiSurfacePositions,ivec2(gl_FragCoord.xy),0);
  if(samplePosition.w<.5){o=vec4(0.);return;}
  vec3 p=samplePosition.xyz;
  vec3 eyeToPoint=p-uRo;
  float distance=max(length(eyeToPoint),.0001);
  vec3 direction=eyeToPoint/distance;
  gVeg=false;
  gPix=uLiSurfaceFootprint;
  gEpsM=0.;
  vec4 inf;
  float signedSurfaceDistance=sceneSD(p,inf);
  gCarpHit=gCarpIn;
  // The original function derives its own footprint from physical distance
  // and the reference perspective uniforms, exactly as in the native view.
  vec3 radiance=shadeScene(p,direction,distance,inf);
  // FS_POST/fogApply are deliberately absent. Only unphysical negative RGB is
  // clamped, as required for HDR vertex colors; alpha diagnoses surface error.
  o=vec4(max(radiance,vec3(0.)),signedSurfaceDistance);
}
`;

function specializeShadeVegetation(prefix) {
  const matches = [...prefix.matchAll(/\bvec3\s+shadeScene\s*\([^;{}]*\)\s*\{/g)];
  if (matches.length !== 1) throw new Error('Expected exactly one source shadeScene definition for vegetation specialization');
  const begin = matches[0].index, opening = prefix.indexOf('{', begin);
  let depth = 0, end = opening;
  for (; end < prefix.length; end++) {
    if (prefix.startsWith('//', end)) { const stop = prefix.indexOf('\n', end + 2);end = stop < 0 ? prefix.length : stop;continue; }
    if (prefix.startsWith('/*', end)) { const stop = prefix.indexOf('*/', end + 2);if (stop < 0) throw new Error('Unclosed shadeScene comment');end = stop + 1;continue; }
    if (prefix[end] === '{') depth++;
    else if (prefix[end] === '}' && --depth === 0) { end++;break; }
  }
  if (depth) throw new Error('Unclosed shadeScene definition');
  const original = prefix.slice(begin, end), statement = 'gVeg=t<uVegRange;';
  if (original.split(statement).length !== 2) throw new Error('Expected one exact shadeScene vegetation assignment');
  let specialized = original.replace(statement, 'gVeg=false;');
  const material = { function: 'shadeScene', scope: 'ground-only native scene material selector',
    originalStatement: 'float mat=inf.w;', specializedStatement: 'float mat=0.;', matchCount: 1,
    proof: 'Writer calls sceneSD with gVeg=false; sceneSD initializes inf=vec4(sw,0.,0.,0.) and its tree/bush guard is false. The shadeScene input inf.w is therefore exactly zero.' };
  if (original.split(material.originalStatement).length !== 2)
    throw new Error('Expected one exact shadeScene ground material selector');
  specialized = specialized.replace(material.originalStatement, material.specializedStatement);
  let specializedPrefix = prefix.slice(0, begin) + specialized + prefix.slice(end);
  const guards = [
    { function: 'terrSD', scope: 'ground-canopy displacement gate',
      originalGuard: '(gVeg&&uDbgM!=85?1.:0.)', specializedGuard: '(false&&uDbgM!=85?1.:0.)' },
    { function: 'sceneSD', scope: 'individual tree/bush distance-field gate',
      originalGuard: 'if(gVeg&&p.y-h<ENV){', specializedGuard: 'if(false&&p.y-h<ENV){' },
    { function: 'shadeScene', scope: 'near-crown tree distance-field occlusion gate',
      originalGuard: 'if(mat<.5&&vegW>.05&&gVeg&&vm.a>.35&&max(occA,occN)>0.){',
      specializedGuard: 'if(mat<.5&&vegW>.05&&false&&vm.a>.35&&max(occA,occN)>0.){' }
  ];
  // Only these three positive gates control expensive vegetation geometry.
  // Preserve the negative !gVeg distant-LOD read and dead shadeWater state
  // save/restore verbatim; neither is a positive tree/canopy geometry gate.
  if ([...prefix.matchAll(/\bgVeg\s*&&/g)].length !== guards.length)
    throw new Error('Expected exactly three source positive vegetation geometry guards');
  for (const guard of guards) {
    if (specializedPrefix.split(guard.originalGuard).length !== 2)
      throw new Error('Expected one exact source vegetation guard in ' + guard.function);
    specializedPrefix = specializedPrefix.replace(guard.originalGuard, guard.specializedGuard);
    if (guard.function === 'shadeScene') {
      if (specialized.split(guard.originalGuard).length !== 2) throw new Error('Vegetation occlusion guard moved outside shadeScene');
      specialized = specialized.replace(guard.originalGuard, guard.specializedGuard);
    }
    guard.matchCount = 1;
  }
  if (/\bgVeg\s*&&/.test(specializedPrefix)) throw new Error('A positive vegetation geometry guard was not specialized');
  return { prefix: specializedPrefix, original, specialized, guards, material };
}

export function buildNativeSurfaceShader(fragmentSource, { specializeVegetation = false } = {}) {
  if (typeof specializeVegetation !== 'boolean') throw new Error('specializeVegetation must be a boolean');
  const parts = buildNativeRockVolumeShader(fragmentSource);
  let prefix = parts.unchangedPrefix, specialization = { enabled: false, applied: false };
  if (specializeVegetation) {
    const result = specializeShadeVegetation(prefix);prefix = result.prefix;
    specialization = { enabled: true, applied: true, function: 'shadeScene',
      originalStatement: 'gVeg=t<uVegRange;', specializedStatement: 'gVeg=false;',
      scope: 'Two shadeScene assignments and three exact positive geometry/occlusion guards in terrSD, sceneSD and shadeScene',
      replacementCount: 5, guardReplacements: result.guards, materialReplacement: result.material,
      proof: 'Writer sets gVeg=false before sceneSD and passes t=max(length(p-eye),.0001)>0 to shadeScene with uVegRange=-1. The shadeScene vegetation assignment is therefore false; no reachable writer/shading call sets gVeg true. All three positive geometry/occlusion guards consequently read false. sceneSD initializes inf=vec4(sw,0.,0.,0.) and its tree/bush gate is false, so shadeScene material is exactly zero. The unused march assignment, negative distant-LOD read and dead water-state save/restore remain unchanged.',
      originalFunction: result.original, specializedFunction: result.specialized };
  }
  return { source: prefix + writerMain + parts.unchangedSuffix,
    unchangedPrefix: specializeVegetation ? null : parts.unchangedPrefix,
    originalFunctionPrefix: parts.unchangedPrefix, sourceFunctionPrefix: prefix,
    unchangedSuffix: parts.unchangedSuffix, originalMain: parts.originalMain, writerMain, specialization };
}

async function digest(bytes) {
  const input = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes;
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', input))].map(value => value.toString(16).padStart(2, '0')).join('');
}
const float32 = value => ArrayBuffer.isView(value) && Object.prototype.toString.call(value) === '[object Float32Array]';
function vector(value, label) {
  if ((!Array.isArray(value) && !ArrayBuffer.isView(value)) || value.length !== 3 || !Array.from(value).every(Number.isFinite)) throw new Error(label + ' must contain three finite coordinates');
  return Array.from(value);
}

export async function bakeNativeSurfaceColors(positions, { sunDirection = [-.504, .309, .806],
  referenceEye = [-50, 16, 650], footprint = .35, maxBatchPixels = 12000,
  specializeVegetation = false, materialOnly = false, onProgress = null } = {}) {
  if (baking) throw new Error('A native surface-radiance bake is already active');
  if (!float32(positions) || !positions.length || positions.length % 3) throw new Error('Native surface positions must be a nonempty XYZ Float32Array');
  for (const value of positions) if (!Number.isFinite(value)) throw new Error('Native surface positions contain a non-finite coordinate');
  // Freeze the bytes that are uploaded and hashed even if the caller reuses
  // its geometry buffer while an awaited compile/GPU fence is outstanding.
  positions = new Float32Array(positions);
  const eye = vector(referenceEye, 'Reference eye'), requestedSun = vector(sunDirection, 'Sun direction');
  const sunLength = Math.hypot(...requestedSun);if (sunLength < .0001) throw new Error('Sun direction is empty');
  const sun = requestedSun.map(value => value / sunLength);
  if (!Number.isFinite(footprint) || footprint < .025 || footprint > 4) throw new Error('Scene-query footprint must be .025..4 metres');
  if (typeof specializeVegetation !== 'boolean') throw new Error('specializeVegetation must be a boolean');
  if (!Number.isInteger(maxBatchPixels) || maxBatchPixels < 512 || maxBatchPixels > 60000) throw new Error('Surface shading batch must be 512..60000 pixels');
  if (typeof gl === 'undefined' || typeof FS_RENDER !== 'string' || !world?.hTex || !world?.aTex || !world?.vTex || !world?.msTex) throw new Error('Actual native H/V/A/MS fields are not available');
  if (typeof HRES === 'undefined' || HRES !== 4096) throw new Error('Native surface shading requires the full generated 4096 height field');
  if (gl.isContextLost() || !gl.getExtension('EXT_color_buffer_float')) throw new Error('Native surface floating-point context is unavailable');
  if (window.lijiangNativeExport?.getState().active || window.lijiangNativeViewport?.getState().busy) throw new Error('Finish the native export/viewport mutation before surface shading');
  baking = true;
  const started = performance.now(), count = positions.length / 3, width = Math.min(512, count), height = Math.ceil(count / width);
  const maximumTexture = gl.getParameter(gl.MAX_TEXTURE_SIZE);
  if (height > maximumTexture) { baking = false;throw new Error('Surface position atlas exceeds the native texture limit'); }
  const control = window.napaliControl || null, previousControl = control?.getState() || null;
  let saved = null, program = null, positionTexture = null, outputTexture = null, framebuffer = null, result = null;
  const stats = { shadedVertices: 0, paddedPixels: width * height - count, gpuCompletedBatches: 0,
    minimumRGB: Infinity, maximumRGB: -Infinity, meanLuminance: 0, zeroVertices: 0, nonFiniteVertices: 0,
    signedSurfaceDistanceMinimum: Infinity, signedSurfaceDistanceMaximum: -Infinity, signedSurfaceDistanceMeanAbsolute: 0 };
  function progress(phase) {
    const state = { revision: REVISION, phase, active: !['complete', 'error'].includes(phase), vertices: count,
      gpuCompletedBatches: stats.gpuCompletedBatches, elapsedMilliseconds: performance.now() - started };
    window.lijiangNativeSurfaceStatus = Object.freeze(state);if (onProgress) onProgress(state);
    if (typeof runtimePhase === 'function') { const { phase: stage, ...detail } = state;runtimePhase('native-surface-radiance', { ...detail, stage }); }
    const text = document.getElementById('loadtxt');if (text) text.textContent = '原生岩壁光照 · ' + phase;
  }
  try {
    progress('quiesce');
    if (control) {
      control.suspend(true);const deadline = performance.now() + 180000;
      while (control.getState().rendering) { if (performance.now() > deadline) throw new Error('Native active frame did not retire before surface bake');await new Promise(resolve => setTimeout(resolve, 15)); }
      if (!control.getState().suspended) throw new Error('Native surface source could not be suspended');
    }
    await gpuWait();saved = captureNativeGLState(gl, [14]);
    const initialError = gl.getError();if (initialError) throw new Error('Native source has an initial surface-bake GL error ' + initialError);
    const shader = buildNativeSurfaceShader(FS_RENDER, { specializeVegetation }), uploadBody = buildNativeRockUniformBody(renderSample.toString());
    if(specializeVegetation){
      const {pruneGroundOnlyShader}=await import('./native-ground-shader.js');
      const pruned=await pruneGroundOnlyShader(shader.sourceFunctionPrefix,{freezeDebug:true});
      shader.sourceFunctionPrefix=pruned.prefix;shader.groundOnlyPruning=pruned.metadata;
      shader.source=pruned.prefix+shader.writerMain+shader.unchangedSuffix;
    }
    if(materialOnly){
      if(!specializeVegetation)throw new Error('Native material baking requires the explicit ground-only mode');
      const {buildNativeMaterialPrefix}=await import('./native-material-shader.js');
      const material=await buildNativeMaterialPrefix(shader.sourceFunctionPrefix);
      shader.sourceFunctionPrefix=material.prefix;shader.nativeMaterial=material.metadata;
      shader.source=material.prefix+shader.writerMain+shader.unchangedSuffix;
    }
    progress('compile');const compiled = await surfaceProgram(gl, shader.source);program = compiled.program;
    const activeUniformLocationDiagnostics = repairNativeRockUniformLocations(gl, program, {
      requiredNames: ['uH', 'uV', 'uA', 'uMS', 'uRect', 'uMC', 'uSun', 'uRo', 'uRes', 'uTan',
        ...(!specializeVegetation ? ['uVegRange'] : []), 'uLiSurfacePositions', 'uLiSurfaceFootprint']
    });
    window.lijiangNativeSurfaceUniformDiagnostics = activeUniformLocationDiagnostics;
    if (activeUniformLocationDiagnostics.missingRequiredNames.length) throw new Error('Native surface bake lacks required bindings: ' + JSON.stringify(activeUniformLocationDiagnostics));
    const packed = new Float32Array(width * height * 4);
    for (let i = 0; i < count; i++) { packed[i * 4] = positions[i * 3];packed[i * 4 + 1] = positions[i * 3 + 1];packed[i * 4 + 2] = positions[i * 3 + 2];packed[i * 4 + 3] = 1; }
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, null);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0);gl.pixelStorei(gl.UNPACK_IMAGE_HEIGHT, 0);
    gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, 0);gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0);gl.pixelStorei(gl.UNPACK_SKIP_IMAGES, 0);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.activeTexture(gl.TEXTURE0 + 14);
    positionTexture = tex(width, height, gl.RGBA32F, gl.RGBA, gl.FLOAT, gl.NEAREST, packed);
    outputTexture = tex(width, height, gl.RGBA32F, gl.RGBA, gl.FLOAT, gl.NEAREST);
    framebuffer = fbo(outputTexture);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Native surface HDR target is incomplete');
    for (const flag of [gl.BLEND, gl.DEPTH_TEST, gl.CULL_FACE, gl.STENCIL_TEST, gl.RASTERIZER_DISCARD]) gl.disable(flag);
    gl.colorMask(true, true, true, true);gl.bindVertexArray(vao);
    gl.pixelStorei(gl.PACK_ALIGNMENT, 4);gl.pixelStorei(gl.PACK_ROW_LENGTH, 0);gl.pixelStorei(gl.PACK_SKIP_PIXELS, 0);gl.pixelStorei(gl.PACK_SKIP_ROWS, 0);
    const upload = new Function('volumeProgram', 'target', 'camera', 'time', 'jitter', uploadBody);
    const sampleTime = previousControl?.time ?? 45;
    upload(program, { w: width, h: height, f: framebuffer },
      { pos: eye, mat: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]), vfov: 58 * Math.PI / 180 }, sampleTime, [0, 0]);
    // Override only this new program. Source shadeScene keeps its physical
    // reference distance and computes its native perspective LOD at 1440x902.
    gl.uniform2f(program.u.uRes, 1440, 902);gl.uniform1f(program.u.uTan, Math.tan(58 * Math.PI / 360));
    gl.uniform3fv(program.u.uRo, eye);gl.uniform3fv(program.u.uSun, sun);
    if (program.u.uVegRange != null) gl.uniform1f(program.u.uVegRange, -1);
    gl.uniform1i(program.u.uDbgM, 0);
    bindTex(14, positionTexture);gl.uniform1i(program.u.uLiSurfacePositions, 14);gl.uniform1f(program.u.uLiSurfaceFootprint, footprint);
    const activeUniforms = readNativeRockUniformMetadata(gl, program, activeUniformLocationDiagnostics);
    const setupError = gl.getError();if (setupError) throw new Error('Native surface uniform setup GL error ' + setupError);
    const rowsPerBatch = Math.min(height, Math.max(1, Math.floor(maxBatchPixels / width)));
    progress('shading');gl.enable(gl.SCISSOR_TEST);
    for (let row = 0; row < height; row += rowsPerBatch) {
      gl.scissor(0, row, width, Math.min(rowsPerBatch, height - row));gl.drawArrays(gl.TRIANGLES, 0, 3);
      await gpuWait();stats.gpuCompletedBatches++;
    }
    const rgba = new Float32Array(width * height * 4), colors = new Float32Array(count * 3);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.FLOAT, rgba);
    const readError = gl.getError();if (readError) throw new Error('Native surface HDR readback GL error ' + readError);
    let perspectiveMinimum = Infinity, perspectiveMaximum = -Infinity;
    const pixelsPerMetre = 2 * Math.tan(58 * Math.PI / 360) / 902;
    for (let i = 0; i < count; i++) {
      const r = rgba[i * 4], g = rgba[i * 4 + 1], b = rgba[i * 4 + 2], d = rgba[i * 4 + 3];
      if (![r, g, b, d].every(Number.isFinite) || r < 0 || g < 0 || b < 0) { stats.nonFiniteVertices++;continue; }
      colors[i * 3] = r;colors[i * 3 + 1] = g;colors[i * 3 + 2] = b;
      stats.minimumRGB = Math.min(stats.minimumRGB, r, g, b);stats.maximumRGB = Math.max(stats.maximumRGB, r, g, b);
      stats.meanLuminance += .2126 * r + .7152 * g + .0722 * b;if (Math.max(r, g, b) <= 1e-8) stats.zeroVertices++;
      stats.signedSurfaceDistanceMinimum = Math.min(stats.signedSurfaceDistanceMinimum, d);
      stats.signedSurfaceDistanceMaximum = Math.max(stats.signedSurfaceDistanceMaximum, d);stats.signedSurfaceDistanceMeanAbsolute += Math.abs(d);
      const dist = Math.hypot(positions[i * 3] - eye[0], positions[i * 3 + 1] - eye[1], positions[i * 3 + 2] - eye[2]);
      perspectiveMinimum = Math.min(perspectiveMinimum, dist * pixelsPerMetre);perspectiveMaximum = Math.max(perspectiveMaximum, dist * pixelsPerMetre);
    }
    if (stats.nonFiniteVertices || stats.maximumRGB <= 1e-8) throw new Error('Native surface shader did not return healthy HDR radiance: ' + JSON.stringify(stats));
    stats.shadedVertices = count;stats.meanLuminance /= count;stats.signedSurfaceDistanceMeanAbsolute /= count;
    const positionsSHA = await digest(new Uint8Array(positions.buffer, positions.byteOffset, positions.byteLength));
    const colorsSHA256 = await digest(new Uint8Array(colors.buffer, colors.byteOffset, colors.byteLength));
    const sourceShaderSHA256 = await digest(FS_RENDER), writerShaderSHA256 = await digest(shader.source);
    result = { colors, metadata: {
      schema: 'native-surface-radiance-v1', revision: REVISION, vertices: count, channels: 3, scalarType: 'float32',
      positionsSHA, positionsSHA256: positionsSHA, colorsSHA256, colorsByteLength: colors.byteLength,
      positionsCoordinateSpace: 'world metres, exact input MC Float32 positions and order',
      inputPositionsCopied: true,
      sourceSurfaceRef: { sceneId: 'lijiang-native', sourceShaderSHA256, writerShaderSHA256, provenance: { ...window.lijiangNativeProvenance } },
      sourceShaderSHA256, writerShaderSHA256, uniformUploadSHA256: await digest(uploadBody),
      unchangedShaderPrefixSHA256: shader.unchangedPrefix === null ? null : await digest(shader.unchangedPrefix),
      originalFunctionPrefixSHA256: await digest(shader.originalFunctionPrefix), sourceFunctionPrefixSHA256: await digest(shader.sourceFunctionPrefix),
      unchangedShaderSuffixSHA256: await digest(shader.unchangedSuffix),
      shaderChangeScope: specializeVegetation
        ? 'Ground-only native lighting: replace main, specialize five constant sites and the fixed-zero debug mode, then physically remove baker-disabled material/debug branches and unreachable function definitions. Local GPU arithmetic can differ from the full shader. Exact pruning ranges, hashes and restoration are recorded separately; artwork acceptance uses actual rendered views.'
        : 'Only replace FS_RENDER main; original geometry, surface normal/albedo/AO/shadow/sky-fill function texts remain byte-identical',
      specializeVegetation,
      materialOnly, nativeMaterial:shader.nativeMaterial||null,
      groundOnlyPruning:shader.groundOnlyPruning||null,
      vegetationSpecialization: specializeVegetation ? {
        enabled: true, applied: true, function: shader.specialization.function,
        originalStatement: shader.specialization.originalStatement, specializedStatement: shader.specialization.specializedStatement,
        scope: shader.specialization.scope, replacementCount: shader.specialization.replacementCount,
        guardReplacements: shader.specialization.guardReplacements,
        materialReplacement: shader.specialization.materialReplacement,
        proof: shader.specialization.proof, originalFunctionSHA256: await digest(shader.specialization.originalFunction),
        specializedFunctionSHA256: await digest(shader.specialization.specializedFunction)
      } : { enabled: false, applied: false },
      sourceHeightResolution: HRES, sourceVegetationResolution: typeof ARES === 'number' ? ARES : null,
      sunDirection: sun, requestedSunDirection: requestedSun, referenceEye: eye,
      footprintMode: 'reference-perspective-projection', referenceProjection: { width: 1440, height: 902, verticalFovDegrees: 58 },
      sceneQueryFootprint: footprint, shadeFootprintRangeMetres: [perspectiveMinimum, perspectiveMaximum],
      independentVegetation: false, vegetationRangeUniform: program.u.uVegRange == null ? null : -1,
      vegetationRangeUniformActive: program.u.uVegRange != null, sceneQueryGVegetation: false, gEpsM: 0,
      noFog: true, noPost: true, colorSpace: 'linear HDR radiance before fog and display transform',
      negativeRadianceClampedToZero: true, viewFrozen: true, sunFrozen: true,
      rebakeRequiredForChangedViewLighting: true, externalAssets: 0, artAccepted: false,
      positionTextureUnit: 14, atlasSize: [width, height], maxBatchPixels, rowsPerBatch, sampleTime,
      activeUniforms, activeUniformLocationDiagnostics, statistics: { ...stats },
      glErrors: { before: initialError, setup: setupError, readback: readError },
      globalProgramAndTargetReassigned: false, previousDeletedTemporaryProgramRetired: saved.programAlreadyDeleted,
      programCache: compiled.metadata,
      bakedMilliseconds: performance.now() - started
    } };
    progress('complete');
  } catch (error) { progress('error');throw error; }
  finally {
    try {
      if (!gl.isContextLost()) {
        if (framebuffer) gl.deleteFramebuffer(framebuffer);if (positionTexture) gl.deleteTexture(positionTexture);
        if (outputTexture) gl.deleteTexture(outputTexture);
        if (saved) restoreNativeGLState(gl, saved);
        if (result) { result.metadata.glStateRestored = true;result.metadata.glErrors.afterRestore = gl.getError(); }
      } else if (result) result.metadata.glStateRestored = false;
    } finally { if (control) control.suspend(previousControl.suspended);baking = false; }
  }
  if (!result.metadata.glStateRestored || result.metadata.glErrors.afterRestore) throw new Error('Native surface bake did not restore its GL state');
  return result;
}
