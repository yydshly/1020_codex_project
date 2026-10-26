import * as THREE from 'three';
import {HDRLoader} from 'three/addons/loaders/HDRLoader.js';

export const SHIPYARD_LIGHTING_FINGERPRINT='62d64e53da7ccf5775e19ee4c704a2c3c105a7dafa9bae52fbc8cce8d889610c';
export const SHIPYARD_SCENE_ID='shipyard-station';
const HDR_URLS={fullHDR:'../canal-real/assets/lighting-r5/kloofendal_48d_partly_cloudy_puresky_2k.hdr',deSunHDR:'../canal-real/assets/lighting-r5/kloofendal_48d_partly_cloudy_puresky_2k-desun.hdr'};
export function stableLightingJSON(value){
 const sorted=x=>Array.isArray(x)?x.map(sorted):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,sorted(x[k])])):x;
 return JSON.stringify(sorted(value));
}
async function sha256(bytes){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');}
async function bytesAt(url){const response=await fetch(new URL(url,import.meta.url),{cache:'no-store'});if(!response.ok)throw new Error('Shipyard lighting HTTP '+response.status);return response.arrayBuffer();}
async function readHDR(descriptor,key){
 if(descriptor?.url!==HDR_URLS[key]||!Number.isSafeInteger(descriptor.bytes)||!/^[a-f0-9]{64}$/.test(descriptor.sha256))throw new Error('Unknown shipyard HDR asset');
 const bytes=await bytesAt(descriptor.url);if(bytes.byteLength!==descriptor.bytes||await sha256(bytes)!==descriptor.sha256)throw new Error('Shipyard HDR checksum mismatch');
 // The real solar disc exceeds 65504 in the source RGBE. Float32 retains it;
 // the default HalfFloat decoder would clip energy before any light transport.
 const data=new HDRLoader().setDataType(THREE.FloatType).parse(bytes);
 // Pinned Three decodes RGBE mantissas with /255; Cycles/Radiance use /256.
 // Convert this decoder convention, preserving the physical rig's radiance.
 for(let i=0;i<data.data.length;i+=4)for(let c=0;c<3;c++)data.data[i+c]*=255/256;
 const texture=new THREE.DataTexture(data.data,data.width,data.height,THREE.RGBAFormat,data.type);
 texture.colorSpace=THREE.LinearSRGBColorSpace;texture.minFilter=texture.magFilter=THREE.LinearFilter;texture.generateMipmaps=false;texture.flipY=true;texture.mapping=THREE.EquirectangularReflectionMapping;texture.needsUpdate=true;texture.name='Shipyard verified '+key;return texture;
}
export async function loadShipyardLighting(){
 const [configBytes,canonicalBytes]=await Promise.all([bytesAt('./lighting-config.json'),bytesAt('./lighting-canonical.json')]);
 const config=JSON.parse(new TextDecoder().decode(configBytes)),canonical=JSON.parse(new TextDecoder().decode(canonicalBytes));
 if(config.lightingFingerprint!==SHIPYARD_LIGHTING_FINGERPRINT||await sha256(canonicalBytes)!==SHIPYARD_LIGHTING_FINGERPRINT||stableLightingJSON(config.lighting)!==stableLightingJSON(canonical))throw new Error('Shipyard lighting fingerprint mismatch');
 const l=config.lighting,s=l.sun;
 if(l.schema!=='shipyard-station-lighting-v1'||l.sceneId!==SHIPYARD_SCENE_ID||l.runtimePolicy?.IBL!=='deSunHDR'||l.runtimePolicy?.background!=='fullHDR'||l.runtimePolicy?.probeBackground!=='deSunHDR'||l.bakePolicy?.analyticSunScale!==0||l.practicalScale!==1)throw new Error('Wrong world lighting policy');
 if(![l.environmentIntensity,l.backgroundIntensity,l.environmentRotationYRadians,l.backgroundRotationYRadians,l.viewExposureEV,s?.intensity,s?.distance].every(Number.isFinite)||![s.directionToLight,s.colorLinear,s.target].every(v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite))||Math.abs(Math.hypot(...s.directionToLight)-1)>1e-6)throw new Error('Invalid shipyard light parameters');
 const [fullHDR,deSunHDR]=await Promise.all([readHDR(l.fullHDR,'fullHDR'),readHDR(l.deSunHDR,'deSunHDR')]);
 return {sceneId:SHIPYARD_SCENE_ID,lighting:l,lightingFingerprint:SHIPYARD_LIGHTING_FINGERPRINT,fullHDR,deSunHDR};
}
