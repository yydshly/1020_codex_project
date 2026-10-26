import * as THREE from 'three';

// These are physical room bounds, in the same metre/world coordinates as the
// architectural source. Shared atlases can cross rooms and streets, so probe
// selection is per surface point rather than per whole material or mesh.
const VOLUMES=[
 {name:'window-room',uniform:'uCanalRoomProbe',position:[-11.85,2.85,11.5],min:[-14.65,1.08,7.48],max:[-9.02,4.94,15.52]},
 {name:'bookshop',uniform:'uCanalShopProbe',position:[12.05,2.08,6.7],min:[10.40,.80,4.43],max:[14.06,3.56,8.98]}
];
const STREET_VOLUMES=[
 {name:'canal-street',uniform:'uCanalStreetNearProbe',position:[0,3,7],min:[-11.2,-2,-20],max:[11.2,15.5,38]},
 {name:'bridge-street',uniform:'uCanalStreetFarProbe',position:[0,4,-30],min:[-11.2,-2,-76],max:[11.2,15.5,2]}
];

const probeShader=/* glsl */`
 varying vec3 vCanalProbePosition;
 uniform sampler2D uCanalRoomProbe,uCanalShopProbe;
 uniform vec3 uCanalRoomMin,uCanalRoomMax,uCanalRoomPosition;
 uniform vec3 uCanalShopMin,uCanalShopMax,uCanalShopPosition;
 uniform float uCanalLocalProbeEnabled,uCanalIBLGain,uCanalLocalProbeIntensity;
 uniform float uCanalDiffuseGain,uCanalSpecularGain,uCanalEmissionGain;
 #ifdef CANAL_STREET_PROBES
 uniform sampler2D uCanalStreetNearProbe,uCanalStreetFarProbe;
 uniform vec3 uCanalStreetNearMin,uCanalStreetNearMax,uCanalStreetNearPosition;
 uniform vec3 uCanalStreetFarMin,uCanalStreetFarMax,uCanalStreetFarPosition;
 uniform float uCanalStreetProbeEnabled;
 #endif
 #if defined(USE_ENVMAP) && defined(ENVMAP_TYPE_CUBE_UV)
 float canalProbeWeight(vec3 p,vec3 lo,vec3 hi){
  vec3 distanceToBoundary=min(p-lo,hi-p);
  return smoothstep(0.0,.08,min(distanceToBoundary.x,min(distanceToBoundary.y,distanceToBoundary.z)));
 }
 vec3 canalBoxProjectedDirection(vec3 p,vec3 direction,vec3 lo,vec3 hi,vec3 probePosition){
  vec3 inside=clamp(p,lo+vec3(.0001),hi-vec3(.0001));
  vec3 ray=vec3(direction.x>=0.0?max(direction.x,.00001):min(direction.x,-.00001),
                direction.y>=0.0?max(direction.y,.00001):min(direction.y,-.00001),
                direction.z>=0.0?max(direction.z,.00001):min(direction.z,-.00001));
  vec3 hit=(mix(lo,hi,step(vec3(0.0),ray))-inside)/ray;
  float distanceToBox=max(.0001,min(hit.x,min(hit.y,hit.z)));
  return normalize(inside+direction*distanceToBox-probePosition);
 }
 #ifdef CANAL_STREET_PROBES
 float canalStreetWeight(vec3 p,vec3 lo,vec3 hi){
  vec3 distanceToBoundary=min(p-lo,hi-p);
  float horizontal=smoothstep(0.0,.4,distanceToBoundary.x)*smoothstep(0.0,8.0,distanceToBoundary.z);
  // The canyon probe gives way to open sky above the roof line and outside
  // the bounded street. No radiance or Fresnel multiplier is changed.
  return horizontal*smoothstep(0.0,.4,p.y-lo.y)*(1.0-smoothstep(8.0,hi.y,p.y));
 }
 vec3 canalStreetRadiance(vec3 direction,float roughness,vec3 globalRadiance){
  if(uCanalStreetProbeEnabled<=0.0)return globalRadiance;
  float nearWeight=canalStreetWeight(vCanalProbePosition,uCanalStreetNearMin,uCanalStreetNearMax);
  float farWeight=canalStreetWeight(vCanalProbePosition,uCanalStreetFarMin,uCanalStreetFarMax);
  float amount=max(nearWeight,farWeight);if(amount<=0.0)return globalRadiance;
  float nearDistance=vCanalProbePosition.z-uCanalStreetNearPosition.z;
  float farDistance=vCanalProbePosition.z-uCanalStreetFarPosition.z;
  float nearInfluence=nearWeight/(1.0+.015*nearDistance*nearDistance);
  float farInfluence=farWeight/(1.0+.015*farDistance*farDistance);
  vec3 nearRay=canalBoxProjectedDirection(vCanalProbePosition,direction,uCanalStreetNearMin,uCanalStreetNearMax,uCanalStreetNearPosition);
  vec3 farRay=canalBoxProjectedDirection(vCanalProbePosition,direction,uCanalStreetFarMin,uCanalStreetFarMax,uCanalStreetFarPosition);
  vec3 nearRadiance=textureCubeUV(uCanalStreetNearProbe,nearRay,roughness).rgb;
  vec3 farRadiance=textureCubeUV(uCanalStreetFarProbe,farRay,roughness).rgb;
  vec3 localRadiance=mix(nearRadiance,farRadiance,farInfluence/max(.00001,nearInfluence+farInfluence))*uCanalLocalProbeIntensity;
  return mix(globalRadiance,localRadiance,amount);
 }
 #endif
 vec3 canalLocalRadiance(vec3 direction,float roughness,vec3 globalRadiance){
  if(uCanalIBLGain<=0.0)return vec3(0.0);
  if(uCanalLocalProbeEnabled<=0.0)return globalRadiance*uCanalIBLGain;
  float roomWeight=canalProbeWeight(vCanalProbePosition,uCanalRoomMin,uCanalRoomMax);
  float shopWeight=canalProbeWeight(vCanalProbePosition,uCanalShopMin,uCanalShopMax);
  vec3 radiance=globalRadiance;
  #ifdef CANAL_STREET_PROBES
   radiance=canalStreetRadiance(direction,roughness,radiance);
  #endif
  if(roomWeight>0.0){
   vec3 ray=canalBoxProjectedDirection(vCanalProbePosition,direction,uCanalRoomMin,uCanalRoomMax,uCanalRoomPosition);
   radiance=mix(radiance,textureCubeUV(uCanalRoomProbe,ray,roughness).rgb*uCanalLocalProbeIntensity,roomWeight);
  }
  if(shopWeight>0.0){
   vec3 ray=canalBoxProjectedDirection(vCanalProbePosition,direction,uCanalShopMin,uCanalShopMax,uCanalShopPosition);
   radiance=mix(radiance,textureCubeUV(uCanalShopProbe,ray,roughness).rgb*uCanalLocalProbeIntensity,shopWeight);
  }
  return radiance*uCanalIBLGain;
 }
 #endif
`;

function instrument(material,shared,streetProbes){
 const before=material.onBeforeCompile,cacheKey=material.customProgramCacheKey;
 const physical=THREE.ShaderChunk.envmap_physical_pars_fragment;
 const irradianceReturn='return PI * envMapColor.rgb * envMapIntensity;';
 const radianceReturn='return envMapColor.rgb * envMapIntensity;';
 if(!physical.includes(irradianceReturn)||!physical.includes(radianceReturn))throw new Error('Pinned IBL shader changed');
 const corrected=physical.replace(irradianceReturn,'return PI * canalLocalRadiance(worldNormal,1.0,envMapColor.rgb*envMapIntensity);')
  .replace(radianceReturn,'return canalLocalRadiance(reflectVec,roughness,envMapColor.rgb*envMapIntensity);');
 material.onBeforeCompile=function(shader,renderer){
  before.call(this,shader,renderer);
  if(streetProbes){shader.defines||={};shader.defines.CANAL_STREET_PROBES=1;}
  Object.assign(shader.uniforms,shared,{uCanalLocalProbeIntensity:{value:material.envMapIntensity??1}});
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vCanalProbePosition;')
   .replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvCanalProbePosition=(modelMatrix*vec4(transformed,1.0)).xyz;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <envmap_physical_pars_fragment>',probeShader+'\n'+corrected)
   .replace('vec3 totalDiffuse = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;','vec3 totalDiffuse = (reflectedLight.directDiffuse + reflectedLight.indirectDiffuse)*uCanalDiffuseGain;')
   .replace('vec3 totalSpecular = reflectedLight.directSpecular + reflectedLight.indirectSpecular;','vec3 totalSpecular = (reflectedLight.directSpecular + reflectedLight.indirectSpecular)*uCanalSpecularGain;')
   .replace('vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;','vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance*uCanalEmissionGain;')
   .replace('outgoingLight * sheenEnergyComp + sheenSpecularDirect + sheenSpecularIndirect;','outgoingLight * sheenEnergyComp + (sheenSpecularDirect + sheenSpecularIndirect)*uCanalSpecularGain;')
   .replace('( clearcoatSpecularDirect + clearcoatSpecularIndirect ) * material.clearcoat;','( clearcoatSpecularDirect + clearcoatSpecularIndirect ) * material.clearcoat*uCanalSpecularGain;');
 };
 material.customProgramCacheKey=function(){return cacheKey.call(this)+'|canal-local-reflections-v2-street-'+Number(streetProbes);};
 material.needsUpdate=true;
}

export function createLocalReflections({renderer,scene,exclude=[],enabled=false,streetProbes=false,diagnostic='combined',onProgress=()=>{}}){
 const environment=scene.environment;
 if(!environment||environment.mapping!==THREE.CubeUVReflectionMapping)throw new Error('Local probes require the prefiltered scene environment');
 // textureCubeUV uses program-wide dimensions. Matching the HDR's cube size
 // allows local and global PMREM samplers to use those exact same constants.
 const cubeResolution=environment.image.height/4;
 if(!Number.isInteger(cubeResolution)||cubeResolution<16||cubeResolution>1024)throw new Error('Unsupported environment cube-UV dimensions');
 const shared={
  uCanalRoomProbe:{value:environment},uCanalShopProbe:{value:environment},
  uCanalRoomMin:{value:new THREE.Vector3(...VOLUMES[0].min)},uCanalRoomMax:{value:new THREE.Vector3(...VOLUMES[0].max)},uCanalRoomPosition:{value:new THREE.Vector3(...VOLUMES[0].position)},
  uCanalShopMin:{value:new THREE.Vector3(...VOLUMES[1].min)},uCanalShopMax:{value:new THREE.Vector3(...VOLUMES[1].max)},uCanalShopPosition:{value:new THREE.Vector3(...VOLUMES[1].position)},
  uCanalLocalProbeEnabled:{value:0},uCanalIBLGain:{value:1},uCanalDiffuseGain:{value:1},uCanalSpecularGain:{value:1},uCanalEmissionGain:{value:1}
 };
 if(streetProbes)Object.assign(shared,{
  uCanalStreetNearProbe:{value:environment},uCanalStreetFarProbe:{value:environment},uCanalStreetProbeEnabled:{value:0},
  uCanalStreetNearMin:{value:new THREE.Vector3(...STREET_VOLUMES[0].min)},uCanalStreetNearMax:{value:new THREE.Vector3(...STREET_VOLUMES[0].max)},uCanalStreetNearPosition:{value:new THREE.Vector3(...STREET_VOLUMES[0].position)},
  uCanalStreetFarMin:{value:new THREE.Vector3(...STREET_VOLUMES[1].min)},uCanalStreetFarMax:{value:new THREE.Vector3(...STREET_VOLUMES[1].max)},uCanalStreetFarPosition:{value:new THREE.Vector3(...STREET_VOLUMES[1].position)}
 });
 const materials=new Set(),bakedMaterials=new Set(),glazingMaterials=new Set();
 scene.traverse(object=>{if(!object.isMesh)return;for(const material of Array.isArray(object.material)?object.material:[object.material]){
  if(material.userData.fullDiffuse){materials.add(material);bakedMaterials.add(material);}
  else if(material.transmission>0){materials.add(material);glazingMaterials.add(material);}
 }});
 const context=renderer.getContext(),fragmentLimit=context.getParameter(context.MAX_TEXTURE_IMAGE_UNITS),combinedLimit=context.getParameter(context.MAX_COMBINED_TEXTURE_IMAGE_UNITS);
 const probeSamplers=streetProbes?4:2;let shadowSamplers=0,areaLights=false;
 scene.traverse(object=>{if(object.isLight&&object.castShadow)shadowSamplers++;if(object.isRectAreaLight)areaLights=true;});
 const estimates=[...materials].map(material=>({name:material.name,samplers:Object.values(material).filter(value=>value?.isTexture).length+(material.envMap?0:1)+probeSamplers+shadowSamplers+(areaLights?2:0)+(material.transmission>0?1:0)}));
 const estimatedMaximum=Math.max(0,...estimates.map(entry=>entry.samplers));
 if(estimatedMaximum>fragmentLimit)throw new Error('Local reflection samplers exceed the actual fragment texture limit');
 const samplerBudget={fragmentLimit,combinedLimit,probeSamplers,estimatedMaximum,observedProgramMaximum:null};
 for(const material of materials)instrument(material,shared,streetProbes);
 const volumes=streetProbes?[...VOLUMES,...STREET_VOLUMES]:VOLUMES;
 const targets=[];let mode='combined',ready=false,disposed=false;
 function setDiagnostic(value){
  if(!['combined','diffuse','specular','no-ibl'].includes(value))throw new Error('Unknown lighting diagnostic');
  mode=value;shared.uCanalDiffuseGain.value=value==='specular'?0:1;
  shared.uCanalSpecularGain.value=value==='diffuse'?0:1;
  shared.uCanalEmissionGain.value=['diffuse','specular'].includes(value)?0:1;
  shared.uCanalIBLGain.value=value==='no-ibl'?0:1;
  return getState();
 }
 function getState(){return {ready,enabled:shared.uCanalLocalProbeEnabled.value===1,streetProbes:shared.uCanalStreetProbeEnabled?.value===1,cubeResolution,materials:materials.size,bakedMaterials:bakedMaterials.size,glazingMaterials:glazingMaterials.size,diagnostic:mode,volumes,samplerBudget};}
 function observeSamplers(){
  const types=new Set([context.SAMPLER_2D,context.SAMPLER_CUBE,context.SAMPLER_3D,context.SAMPLER_2D_ARRAY,context.SAMPLER_2D_SHADOW,context.SAMPLER_CUBE_SHADOW,context.SAMPLER_2D_ARRAY_SHADOW,context.INT_SAMPLER_2D,context.INT_SAMPLER_CUBE,context.INT_SAMPLER_3D,context.INT_SAMPLER_2D_ARRAY,context.UNSIGNED_INT_SAMPLER_2D,context.UNSIGNED_INT_SAMPLER_CUBE,context.UNSIGNED_INT_SAMPLER_3D,context.UNSIGNED_INT_SAMPLER_2D_ARRAY].filter(value=>value!==undefined));
  let maximum=0;
  for(const entry of renderer.info.programs||[]){const program=entry.program;if(!program||!context.getProgramParameter(program,context.LINK_STATUS))continue;let count=0;const length=context.getProgramParameter(program,context.ACTIVE_UNIFORMS);for(let i=0;i<length;i++){const uniform=context.getActiveUniform(program,i);if(uniform&&types.has(uniform.type))count+=uniform.size;}maximum=Math.max(maximum,count);}
  samplerBudget.observedProgramMaximum=maximum;return samplerBudget;
 }
 function capture(){
  if(disposed||!enabled)return getState();
  const saved={target:renderer.getRenderTarget(),face:renderer.getActiveCubeFace(),mip:renderer.getActiveMipmapLevel(),viewport:renderer.getViewport(new THREE.Vector4()),scissor:renderer.getScissor(new THREE.Vector4()),scissorTest:renderer.getScissorTest(),tone:renderer.toneMapping,xr:renderer.xr.enabled,autoClear:renderer.autoClear,shadowAuto:renderer.shadowMap.autoUpdate};
  const hidden=new Map();for(const object of exclude){hidden.set(object,object.visible);object.visible=false;}
  scene.traverse(object=>{if(!object.isMesh)return;const list=Array.isArray(object.material)?object.material:[object.material];if(list.some(material=>material.transmission>0)){hidden.set(object,object.visible);object.visible=false;}});
  let generator;
  try{
   // Probe images contain actual baked radiance and direct reflections. Global
   // IBL feedback on those surfaces is excluded; outside foliage stays lit.
   shared.uCanalIBLGain.value=0;shared.uCanalLocalProbeEnabled.value=0;
   if(streetProbes)shared.uCanalStreetProbeEnabled.value=0;
   shared.uCanalDiffuseGain.value=shared.uCanalSpecularGain.value=shared.uCanalEmissionGain.value=1;
   renderer.toneMapping=THREE.NoToneMapping;renderer.xr.enabled=false;renderer.autoClear=true;renderer.setScissorTest(false);
   renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;
   scene.updateMatrixWorld(true);generator=new THREE.PMREMGenerator(renderer);
   for(let index=0;index<volumes.length;index++){
    const volume=volumes[index];onProgress(index/volumes.length,volume.name);
    const cubeTarget=new THREE.WebGLCubeRenderTarget(cubeResolution,{type:THREE.HalfFloatType,format:THREE.RGBAFormat,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,generateMipmaps:false,depthBuffer:true});
    cubeTarget.texture.colorSpace=THREE.LinearSRGBColorSpace;
    try{
     const camera=new THREE.CubeCamera(.025,220,cubeTarget);camera.position.fromArray(volume.position);camera.update(renderer,scene);
     if(renderer.getContext().isContextLost())throw new Error('Context lost during local reflection capture');
     const filtered=generator.fromCubemap(cubeTarget.texture);
     if(filtered.width!==environment.image.width||filtered.height!==environment.image.height){filtered.dispose();throw new Error('Local and global PMREM layouts differ');}
     targets.push(filtered);shared[volume.uniform].value=filtered.texture;
    }finally{cubeTarget.dispose();}
   }
   ready=true;shared.uCanalLocalProbeEnabled.value=1;if(streetProbes)shared.uCanalStreetProbeEnabled.value=1;onProgress(1,'ready');
  }finally{
   for(const [object,visible]of hidden)object.visible=visible;
   renderer.toneMapping=saved.tone;renderer.xr.enabled=saved.xr;renderer.autoClear=saved.autoClear;renderer.shadowMap.autoUpdate=saved.shadowAuto;
   renderer.setRenderTarget(saved.target,saved.face,saved.mip);renderer.setViewport(saved.viewport);renderer.setScissor(saved.scissor);renderer.setScissorTest(saved.scissorTest);renderer.shadowMap.needsUpdate=true;
   generator?.dispose();setDiagnostic(mode);
  }
  return getState();
 }
 function dispose(){if(disposed)return;disposed=true;for(const target of targets)target.dispose();shared.uCanalLocalProbeEnabled.value=0;if(streetProbes)shared.uCanalStreetProbeEnabled.value=0;ready=false;}
 setDiagnostic(diagnostic);return {capture,setDiagnostic,getState,observeSamplers,dispose};
}
