import {readAssetBytes,readLightmapBytes} from '../packed-assets/loader.js';
// Shared verified diffuse-lightmap binding; independent station model/scene/lighting identity required.
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {stableLightingJSON} from './lighting-config.js?v=r5-cloudbreak-final-1';

// Direct + indirect white-diffuse radiance from the exact Cycles scene replaces
// all live diffuse terms. Direct/IBL specular and clearcoat continue to respond
// to the real-time camera and water. This is the same radiometric conversion
// used by Three's Lambert term: reflected diffuse = albedo * irradiance / PI.
function bindFullDiffuse(material){
 const previousCompile=material.onBeforeCompile,previousCache=material.customProgramCacheKey;
 const maps=THREE.ShaderChunk.lights_fragment_maps.replace('irradiance += lightMapIrradiance;','irradiance = lightMapIrradiance;');
 const original=THREE.ShaderChunk.lights_fragment_end,call='RE_IndirectSpecular( radiance, iblIrradiance, clearcoatRadiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );';
 if(!maps.includes('irradiance = lightMapIrradiance;')||!original.includes(call))throw new Error('Pinned Three diffuse chunks changed');
 const end=original.replace(call,'vec3 preservedBakedDiffuse=reflectedLight.indirectDiffuse;\n'+call+'\nreflectedLight.indirectDiffuse=preservedBakedDiffuse;')+'\nreflectedLight.directDiffuse=vec3(0.);';
 material.onBeforeCompile=function(shader,renderer){previousCompile.call(this,shader,renderer);shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_maps>',maps).replace('#include <lights_fragment_end>',end);};
 material.customProgramCacheKey=function(){return previousCache.call(this)+'|canal-full-diffuse-live-specular-v1';};material.userData.fullDiffuse=true;
}

async function readLightmap(descriptor,root){
 const d=descriptor.runtime||descriptor;
 if(d.type!=='RGBA16F_LE'||d.channels!==4||!Number.isInteger(d.width)||!Number.isInteger(d.height)||d.width<1||d.height<1||d.width>8192||d.height>8192)throw new Error('Invalid GI lightmap format');
 const raw=await readLightmapBytes(new URL(d.file,root),d.sha256);
 if(raw.byteLength!==d.width*d.height*8||d.raw_bytes!=null&&raw.byteLength!==d.raw_bytes)throw new Error('GI lightmap byte count mismatch');
 const t=new THREE.DataTexture(new Uint16Array(raw),d.width,d.height,THREE.RGBAFormat,THREE.HalfFloatType);t.channel=descriptor.uvChannel??1;t.minFilter=t.magFilter=THREE.LinearFilter;t.generateMipmaps=false;t.flipY=false;t.needsUpdate=true;t.name='Cycles diffuse / '+d.file;return t;
}

export async function loadStationGI(scene,{exclude=[],onProgress=()=>{},url='./baked/manifest.json',expectedLighting=null}={}){
 const root=new URL(url,import.meta.url),response=await fetch(root,{cache:'no-store'});
 if(response.status===404){if(expectedLighting)throw new Error('Expected complete candidate GI is unavailable');return {mode:'unbaked',bound:0,accepted:false};}
 if(!response.ok)throw new Error('GI manifest HTTP '+response.status);
 const manifestBytes=await response.arrayBuffer(),manifestDigest=await crypto.subtle.digest('SHA-256',manifestBytes),manifestSha256=Array.from(new Uint8Array(manifestDigest),b=>b.toString(16).padStart(2,'0')).join(''),manifest=JSON.parse(new TextDecoder().decode(manifestBytes));if((manifest.schema!=='shipyard-station-gi-v1'||manifest.sceneId!=='shipyard-station')||manifest.lightingMode!=='full-diffuse')throw new Error('Unsupported GI manifest');
 if(manifest.stage!=='baked'||!Array.isArray(manifest.groups)||!manifest.groups.length)throw new Error('Complete GI lighting has not been published');
 if(expectedLighting&&(manifest.lightingFingerprint!==expectedLighting.lightingFingerprint||stableLightingJSON(manifest.runtimeLighting)!==stableLightingJSON(expectedLighting.lighting)||manifest.lightingCalibration?.practicalScale!==expectedLighting.lighting.practicalScale))throw new Error('GI and runtime lighting fingerprints or calibration differ');
 if(expectedLighting){
  if(manifest.model!=='shipyard-lightmapped.glb'||manifest.runtimeAsset?.file!=='shipyard-lightmapped.glb')throw new Error('Station requires its own independently authored geometry');
  if(manifest.runtimeAsset.sha256==='819b849b252ff22970c66e6349cf9eb4f470ad1ec775260e355ab2480c7da227'||manifest.source?.sha256==='bab33778df0185369750ccd30631ea6c8efa9f24a65a30a768cd0fd6bc39b851')throw new Error('The old street model cannot stand in for the independent station');
  if(manifest.groups.some(group=>!/^lightmaps\/[A-Za-z0-9_.-]+\.rgba16f\.gz$/.test(group.runtime?.file||'')))throw new Error('Station map path left its own lighting package');
 }
 if(new Set(manifest.groups.map(group=>group.meshName)).size!==manifest.groups.length)throw new Error('GI geometry group names are not unique');
 const originals=new Map(),old=[];
 scene.traverse(object=>{if(!object.isMesh||exclude.some(root=>root===object||root.getObjectById(object.id)))return;old.push(object);for(const material of Array.isArray(object.material)?object.material:[object.material])if(material.name)originals.set(material.name,material);});
 const modelBytes=await readAssetBytes(new URL(manifest.model,root)),modelDigest=await crypto.subtle.digest('SHA-256',modelBytes),modelSha256=Array.from(new Uint8Array(modelDigest),b=>b.toString(16).padStart(2,'0')).join('');
 if(manifest.runtimeAsset?.sha256!==modelSha256||manifest.runtimeAsset.bytes!==modelBytes.byteLength)throw Error('Restored GI geometry integrity mismatch');
 const gltf=await new GLTFLoader().parseAsync(modelBytes,new URL('.',root).href),groups=new Map(manifest.groups.map(g=>[g.meshName,g]));let count=0;
 const matches=[];gltf.scene.traverse(object=>{if(!object.isMesh)return;const descriptor=groups.get(object.name);if(descriptor)matches.push([object,descriptor]);
  // The shipping geometry GLB can omit every duplicated scan image. Restore
  // both baked and unbaked material slots from the already verified live scene.
  const restore=material=>{const name=descriptor?.originalMaterialName||material.name,source=originals.get(name)||originals.get(name.replace(/\.\d{3}$/,''));if(!source)throw new Error('Unrecognized baked geometry material: '+name);return source;};
  object.material=Array.isArray(object.material)?object.material.map(restore):restore(object.material);
 });
 if(matches.length!==manifest.groups.length)throw new Error('GI geometry names do not cover manifest groups');
 for(const [object,d]of matches){
  const uv='uv'+(d.uvChannel??1);if(!object.geometry.getAttribute(uv))throw new Error('Baked mesh has no '+uv+': '+object.name);
  const source=originals.get(d.originalMaterialName);if(!source)throw new Error('Original material not found: '+d.originalMaterialName);
  const material=source.clone();material.onBeforeCompile=source.onBeforeCompile;material.customProgramCacheKey=source.customProgramCacheKey;
  material.lightMap=await readLightmap(d,root);material.lightMapIntensity=d.lightMapIntensity??Math.PI;material.name=source.name+' / Cycles diffuse';bindFullDiffuse(material);object.material=material;object.castShadow=object.receiveShadow=true;count++;onProgress(count/manifest.groups.length);
 }
 // Keep original lights and their parent transforms. Exported glTF's punctual
 // lights are removed so the exact same lighting is not introduced twice.
 const lights=[];gltf.scene.traverse(object=>{if(object.isLight)lights.push(object);});lights.forEach(light=>light.removeFromParent());
 for(const object of old){object.removeFromParent();object.geometry?.dispose();}scene.add(gltf.scene);
 return {mode:'full-diffuse',bound:count,accepted:false,manifestURL:root.href,manifestSha256,sampling:manifest.groups.map(g=>({key:g.key,samples:g.samples})),model:manifest.model,modelSha256,proof:manifest.proof||null,lightingFingerprint:manifest.lightingFingerprint||null,lightingCalibration:manifest.lightingCalibration||{practicalScale:1}};
}
