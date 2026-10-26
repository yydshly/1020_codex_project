import * as THREE from 'three';
import {HDRLoader} from 'three/addons/loaders/HDRLoader.js';

const R5_FINGERPRINT='80836c3f6f8529ef088136e9628e75e100a820760c3c27c148ade87356a01b34';
const ROOT='./assets/lighting-r5/';
const FILES={fullHDR:ROOT+'kloofendal_48d_partly_cloudy_puresky_2k.hdr',deSunHDR:ROOT+'kloofendal_48d_partly_cloudy_puresky_2k-desun.hdr'};
export function stableLightingJSON(value){
 const sort=x=>Array.isArray(x)?x.map(sort):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(key=>[key,sort(x[key])])):x;
 return JSON.stringify(sort(value));
}
async function sha256(bytes){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),byte=>byte.toString(16).padStart(2,'0')).join('');}
async function bytesAt(url){const response=await fetch(new URL(url,import.meta.url),{cache:'no-store'});if(!response.ok)throw new Error('Lighting asset HTTP '+response.status);return response.arrayBuffer();}
async function verifiedHDR(descriptor,key){
 if(descriptor?.url!==FILES[key]||!Number.isSafeInteger(descriptor.bytes)||!/^[a-f0-9]{64}$/.test(descriptor.sha256))throw new Error('Invalid fixed R5 HDR descriptor');
 const bytes=await bytesAt(descriptor.url);if(bytes.byteLength!==descriptor.bytes||await sha256(bytes)!==descriptor.sha256)throw new Error('R5 HDR checksum mismatch');
 const data=new HDRLoader().parse(bytes),texture=new THREE.DataTexture(data.data,data.width,data.height,THREE.RGBAFormat,data.type);
 texture.colorSpace=THREE.LinearSRGBColorSpace;texture.minFilter=texture.magFilter=THREE.LinearFilter;texture.generateMipmaps=false;texture.flipY=true;texture.mapping=THREE.EquirectangularReflectionMapping;texture.needsUpdate=true;texture.name='Verified R5 '+key;return texture;
}
export async function loadR5Lighting(){
 const [configBytes,canonicalBytes]=await Promise.all([bytesAt(ROOT+'lighting-r5.json'),bytesAt(ROOT+'lighting-r5-canonical.json')]);
 const config=JSON.parse(new TextDecoder().decode(configBytes)),canonical=JSON.parse(new TextDecoder().decode(canonicalBytes));
 // Hash the exact producer canonical bytes: Python 1.0 and JavaScript 1 are
 // semantically equal, but must not be silently reserialized before hashing.
 if(config.lightingFingerprint!==R5_FINGERPRINT||await sha256(canonicalBytes)!==R5_FINGERPRINT||stableLightingJSON(config.lighting)!==stableLightingJSON(canonical))throw new Error('R5 lighting fingerprint mismatch');
 const lighting=config.lighting,sun=lighting.sun;
 if(lighting.schema!=='canal-lighting-r5-v1'||lighting.runtimePolicy?.IBL!=='deSunHDR'||lighting.runtimePolicy?.background!=='fullHDR'||lighting.runtimePolicy?.probeBackground!=='deSunHDR')throw new Error('Unknown R5 radiance policy');
 const scalars=[lighting.environmentIntensity,lighting.backgroundIntensity,lighting.environmentRotationYRadians,lighting.backgroundRotationYRadians,lighting.viewExposureEV,lighting.practicalScale,sun?.intensity,sun?.distance];
 if(!scalars.every(Number.isFinite)||lighting.environmentIntensity<=0||lighting.backgroundIntensity<=0||lighting.practicalScale<0||sun.intensity<=0||sun.distance<=0||![sun.directionToLight,sun.colorLinear,sun.target].every(v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite))||Math.abs(Math.hypot(...sun.directionToLight)-1)>1e-5)throw new Error('Invalid R5 physical lighting parameters');
 const [fullHDR,deSunHDR]=await Promise.all([verifiedHDR(lighting.fullHDR,'fullHDR'),verifiedHDR(lighting.deSunHDR,'deSunHDR')]);
 return {lighting,lightingFingerprint:R5_FINGERPRINT,fullHDR,deSunHDR};
}
