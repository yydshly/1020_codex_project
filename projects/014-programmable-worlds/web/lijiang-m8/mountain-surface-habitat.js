// Shared 3D habitat potential: broad connected wooded shoulders and drainage
// ribbons, with smaller irregular openings. No height bands or texture assets.
import { habitatNoise } from './raster-habitat.js?v=20261026-m8';
export const MOUNTAIN_SURFACE_HABITAT_REVISION='m5-ribbons-with-full-legacy-pockets-3';
const smooth=(a,b,v)=>{const t=Math.max(0,Math.min(1,(v-a)/(b-a)));return t*t*(3-2*t);};
export function mountainLegacySurfacePatch(x,y,z){
  return smooth(.37,.68,.64*habitatNoise(x+y*.24,z-y*.17,52,93)+.36*habitatNoise(x-y*.13,z+y*.29,17,37));
}
export function mountainSurfacePatch(x,y,z){
  const warp=(habitatNoise(x,z,190,19)-.5)*52;
  const broad=habitatNoise(x+y*.19+warp,z-y*.12,105,93);
  const drainage=habitatNoise(x+y*.055-warp*.30,z-y*.045,39,57);
  const edge=habitatNoise(x-y*.11,z+y*.23,16,37);
  const ribbon=smooth(.30,.62,.60*broad+.26*drainage+.14*edge);
  const retained=mountainLegacySurfacePatch(x,y,z);
  return Math.max(ribbon,retained);
}
