import { buildNativeMeshData, disposeNativeMeshBuilder } from './native-mesh-builder.js';
import { bakeNativeSurfaceColors } from './native-surface-fields.js';
import { collectNativeRockVolume } from './native-sdf-fields.js';
import { volumeSpec } from './native-pilot-batch.js';

// The full scene used to build a legacy 384^3 primary, then discard it because
// its lattice did not match the batch. Construct the final batch volume first
// so its field, MC arrays and material colors can all be reused unchanged.
export async function collectSharedPrimaryVolume(peak){
  if(!Array.isArray(peak)||peak.length<5)throw new Error('Primary peak specification is required');
  return collectNativeRockVolume(volumeSpec(peak));
}

// MC runs once in a zero-copy dedicated worker. Cache its actual arrays for
// the rock batch, so the primary peak is not extracted and allocated twice.
export async function addNativeSurfaceColors(volume, options = {}) {
  const started=performance.now(),meshStarted=performance.now();
  const built=await buildNativeMeshData(volume,{useWorker:options.useWorker!==false});
  const meshMilliseconds=performance.now()-meshStarted;
  const positions=built.meshData.positions,normals=built.meshData.normals;
  const elevation=18*Math.PI/180,azimuth=25*Math.PI/180,colorStarted=performance.now();
  const surface=options.materialOnly&&options.materialSampler
    ? await options.materialSampler.colorVertices(positions,normals)
    : await bakeNativeSurfaceColors(positions,{
      sunDirection:[Math.sin(azimuth)*Math.cos(elevation),Math.sin(elevation),Math.cos(azimuth)*Math.cos(elevation)],
      maxBatchPixels:60000,...options});
  volume.colors=surface.colors;volume.colorMetadata=surface.metadata;
  volume.meshData=built.meshData;volume.colorGeometryStats=built.stats;
  volume.buildTimings={meshMilliseconds,colorMilliseconds:performance.now()-colorStarted,totalMilliseconds:performance.now()-started,execution:built.stats.execution};
  window.lijiangM3PrimaryBuildTimings={...volume.buildTimings};
  window.lijiangNativeBakeSurface=options.materialOnly&&options.materialSampler
    ? (positions,settings={})=>options.materialSampler.colorVertices(positions,settings.normals,settings)
    : bakeNativeSurfaceColors;
  return volume;
}
export {disposeNativeMeshBuilder};
