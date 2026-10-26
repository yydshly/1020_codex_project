import { bakeNativeSurfaceColors } from './native-surface-fields.js';

// Runtime-only world-XZ radiance. Height comes from the producer's existing
// CPU field; this collector never reads another native GPU height texture.
const REVISION = 'native-world-radiance-field-1';
const CHUNK_VERTICES = 262144;
let active = false, retainedInputs = null;

function rectangle(value) {
  if ((!Array.isArray(value) && !ArrayBuffer.isView(value)) || value.length < 3) throw new Error('Radiance rect must be [x,z,size] or [x,z,width,height]');
  const [x, z, width, fourth] = Array.from(value), height = fourth > 1 ? fourth : width;
  if (![x, z, width, height].every(Number.isFinite) || width <= 0 || height <= 0) throw new Error('Invalid radiance world rectangle');
  return { x, z, width, height, values: [x, z, width, height] };
}

function heightField(value) {
  if (!value || !ArrayBuffer.isView(value.data) || Object.prototype.toString.call(value.data) !== '[object Float32Array]')
    throw new Error('Radiance height must be {data:Float32Array,width,height,channels}');
  const width = value.width || value.resolution, height = value.height || width;
  const channels = value.channels || value.data.length / (width * height);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 2 || height < 2 || !Number.isInteger(channels)
    || channels < 1 || channels > 4 || value.data.length !== width * height * channels) throw new Error('Radiance source height shape disagrees');
  // Retain the validated data reference independently of the caller's field
  // descriptor, which the displayed renderer may later release or replace.
  return { data: value.data, width, height, channels };
}

function sampleHeight(field, rect, x, z) {
  // Match the native data-texture half-texel convention. Row zero is low Z.
  const u = Math.max(0, Math.min(field.width - 1, (x - rect.x) / rect.width * field.width - .5));
  const v = Math.max(0, Math.min(field.height - 1, (z - rect.z) / rect.height * field.height - .5));
  const ix = Math.floor(u), iy = Math.floor(v), jx = Math.min(ix + 1, field.width - 1), jy = Math.min(iy + 1, field.height - 1);
  const tx = u - ix, ty = v - iy, at = (a, b) => field.data[(b * field.width + a) * field.channels];
  const a = at(ix, iy) * (1 - tx) + at(jx, iy) * tx, b = at(ix, jy) * (1 - tx) + at(jx, jy) * tx;
  return a * (1 - ty) + b * ty;
}

function positionsFor(field, rect, resolution, offset, count) {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const index = offset + i, column = index % resolution, row = Math.floor(index / resolution);
    const x = rect.x + (column + .5) / resolution * rect.width;
    const z = rect.z + (row + .5) / resolution * rect.height;
    const h = sampleHeight(field, rect, x, z);
    if (!Number.isFinite(h)) throw new Error('Radiance source height is not finite at sample ' + index);
    positions[i * 3] = x;positions[i * 3 + 1] = h;positions[i * 3 + 2] = z;
  }
  return positions;
}

export function buildNativeRadiancePositions({ height, rect, resolution = 1024, offset = 0, count = resolution * resolution - offset }) {
  if (!Number.isInteger(resolution) || resolution < 2 || resolution > 4096 || !Number.isInteger(offset) || offset < 0
    || !Number.isInteger(count) || count < 1 || offset + count > resolution * resolution) throw new Error('Invalid radiance sample range');
  return positionsFor(heightField(height), rectangle(rect), resolution, offset, count);
}

async function sha256(bytes) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(value => value.toString(16).padStart(2, '0')).join('');
}

export async function collectNativeRadianceField({ height = retainedInputs?.height, rect = retainedInputs?.rect,
  resolution = retainedInputs?.resolution || 1024, sunDirection = [.4019, .3090, .86195],
  referenceEye = [-50, 16, 650], footprint = .35, maxBatchPixels = 60000,
  specializeVegetation = false, materialOnly = false, materialSampler = retainedInputs?.materialSampler || null, onProgress = null } = {}) {
  if (active) throw new Error('A native world-radiance collection is already active');
  if (!Number.isInteger(resolution) || resolution < 64 || resolution > 4096) throw new Error('World radiance resolution must be an integer from 64 to 4096');
  const sourceHeight = heightField(height), sourceRect = rectangle(rect);
  if(materialOnly&&materialSampler){
    active=true;
    try{
      const result=await materialSampler.collectTerrain({resolution,onProgress});
      retainedInputs={height:sourceHeight,rect:sourceRect.values,resolution,materialSampler};
      return result;
    }finally{active=false;}
  }
  if (typeof gl === 'undefined' || gl.isContextLost()) throw new Error('Actual native shading context is not ready');
  const maximumTexture = gl.getParameter(gl.MAX_TEXTURE_SIZE);
  if (!Number.isInteger(maximumTexture) || maximumTexture < 512) throw new Error('Native texture limit is too small for radiance chunks');
  // The baker uses a 512-wide atlas. Bound each chunk to both that GPU limit
  // and a modest 512x512 allocation, even for a 2K/4K world field.
  const chunkLimit = Math.min(CHUNK_VERTICES, 512 * maximumTexture);
  const total = resolution * resolution, chunks = Math.ceil(total / chunkLimit);
  const data = new Float32Array(total * 4), started = performance.now(), chunkMetadata = [];
  let minimumHeight = Infinity, maximumHeight = -Infinity, minimumRGB = Infinity, maximumRGB = -Infinity;
  active = true;
  const progress = (phase, completed) => {
    const state = { revision: REVISION, phase, active: !['complete', 'error'].includes(phase), resolution,
      samplesCompleted: completed, samples: total, chunks, chunksCompleted: chunkMetadata.length,
      elapsedMilliseconds: performance.now() - started };
    window.lijiangNativeRadianceStatus = Object.freeze(state);if (onProgress) onProgress(state);
    if (typeof runtimePhase === 'function') { const { phase: stage, ...details } = state;runtimePhase('native-world-radiance', { ...details, stage }); }
    const text = document.getElementById('loadtxt');if (text) text.textContent = `同源山水光照 · ${chunkMetadata.length} / ${chunks}`;
  };
  try {
    progress('sampling', 0);
    for (let offset = 0; offset < total; offset += chunkLimit) {
      const count = Math.min(chunkLimit, total - offset), positions = positionsFor(sourceHeight, sourceRect, resolution, offset, count);
      for (let i = 0; i < count; i++) { minimumHeight = Math.min(minimumHeight, positions[i * 3 + 1]);maximumHeight = Math.max(maximumHeight, positions[i * 3 + 1]); }
      const surface = await bakeNativeSurfaceColors(positions, { sunDirection, referenceEye, footprint, maxBatchPixels, specializeVegetation, materialOnly });
      if (surface.colors.length !== count * 3 || !surface.metadata.noFog || !surface.metadata.noPost) throw new Error('Native radiance chunk violates its source-surface contract');
      for (let i = 0; i < count; i++) {
        const out = (offset + i) * 4, input = i * 3;
        const r = surface.colors[input], g = surface.colors[input + 1], b = surface.colors[input + 2];
        if (![r, g, b].every(Number.isFinite) || Math.min(r, g, b) < 0) throw new Error('Native radiance contains invalid HDR RGB');
        data[out] = r;data[out + 1] = g;data[out + 2] = b;data[out + 3] = 1;
        minimumRGB = Math.min(minimumRGB, r, g, b);maximumRGB = Math.max(maximumRGB, r, g, b);
      }
      chunkMetadata.push({ offset, vertices: count, metadata: surface.metadata });
      progress('sampling', offset + count);
      if (typeof runtimeYield === 'function') await runtimeYield();
    }
    const dataSHA256 = await sha256(new Uint8Array(data.buffer));
    const sourceHeightSHA256 = await sha256(new Uint8Array(sourceHeight.data.buffer, sourceHeight.data.byteOffset, sourceHeight.data.byteLength));
    const first = chunkMetadata[0].metadata;
    const metadata = { schema: 'native-world-radiance-field-v1', revision: REVISION,
      resolution, width: resolution, height: resolution, channels: 4, scalarType: 'float32',
      byteLength: data.byteLength, dataSHA256, rgbaSHA256: dataSHA256,
      rect: sourceRect.values, rowOrder: 'x fastest, row zero at minimum world z', flipY: false,
      sampleConvention: 'World XZ texel centres; bilinear source H with native half-texel sampling',
      firstTexelCentre: [sourceRect.x + sourceRect.width / resolution * .5, sourceRect.z + sourceRect.height / resolution * .5],
      lastTexelCentre: [sourceRect.x + sourceRect.width * (1 - .5 / resolution), sourceRect.z + sourceRect.height * (1 - .5 / resolution)],
      sourceCPUHeight: { width: sourceHeight.width, height: sourceHeight.height, channels: sourceHeight.channels,
        sha256: sourceHeightSHA256, sampler: 'bilinear first channel; no additional native GPU readback' },
      nativeSourceHeightResolution: first.sourceHeightResolution, sourceSurfaceRef: first.sourceSurfaceRef,
      noFog: true, noPost: true, colorSpace: 'linear HDR radiance, opaque alpha one',
      footprintMode: first.footprintMode, referenceProjection: first.referenceProjection,
      sunDirection: first.sunDirection, referenceEye: first.referenceEye, sceneQueryFootprint: footprint,
      specializeVegetation, materialOnly, viewFrozen: true, sunFrozen: true, rebakeRequiredForChangedViewLighting: !materialOnly,
      samples: total, chunkLimit, chunks: chunkMetadata, nativeTextureLimit: maximumTexture,
      sourceProgramCacheHits: chunkMetadata.filter(value => value.metadata.programCache?.hit).length,
      sampledHeightRange: [minimumHeight, maximumHeight], radianceRGBRange: [minimumRGB, maximumRGB],
      elapsedMilliseconds: performance.now() - started, externalAssets: 0, artAccepted: false };
    retainedInputs = { height: sourceHeight, rect: sourceRect.values, resolution };
    progress('complete', total);
    return { data, width: resolution, height: resolution, channels: 4, metadata };
  } catch (error) { progress('error', chunkMetadata.reduce((sum, value) => sum + value.vertices, 0));throw error; }
  finally { active = false; }
}
