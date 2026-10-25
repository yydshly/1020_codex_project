// CPU integration audit of the real GLB and full production environment chain.
// GPU captures and image decoding are explicit stubs; no browser is started.
import {readFile,writeFile,access} from 'node:fs/promises';
import {register} from 'node:module';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url),web=new URL('web/',root);
const output=new URL(process.argv[2]??'artifacts/scene-space-04/runtime-validation.json',root);
try{await access(output);throw new Error('Refusing to overwrite existing audit report.');}catch(error){if(error.code!=='ENOENT')throw error;}
const hash=data=>createHash('sha256').update(data).digest('hex');
const hashFile=async path=>hash(await readFile(new URL(path,root)));
const readJSON=async path=>JSON.parse((await readFile(new URL(path,root),'utf8')).replace(/^\uFEFF/,''));
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const checks={},evidence={},started=performance.now();
const threeURL=new URL('vendor/three/build/three.module.min.js',web).href;
const addonsURL=new URL('vendor/three/examples/jsm/',web).href;
const env03URL=new URL('scene-space-03-environment.js',web).href;
const env04URL=new URL('scene-space-04-environment.js',web).href;
const wrapper='data:text/javascript,'+encodeURIComponent(`import {setupEnvironment as actual} from ${JSON.stringify(env03URL)};export async function setupEnvironment(...args){const result=await actual(...args);globalThis.__space04PreviousReady(...args);return result;}`);
register('data:text/javascript,'+encodeURIComponent(`export async function resolve(s,c,n){if(s==='three')return{url:${JSON.stringify(threeURL)},shortCircuit:true};if(s.startsWith('three/addons/'))return{url:${JSON.stringify(addonsURL)}+s.slice(13),shortCircuit:true};if(c.parentURL===${JSON.stringify(env04URL)}&&s==='./scene-space-03-environment.js')return{url:${JSON.stringify(wrapper)},shortCircuit:true};return n(s,c);}`),import.meta.url);
const THREE=await import(threeURL);
const {GLTFLoader}=await import(new URL('loaders/GLTFLoader.js',addonsURL));
const {HDRLoader}=await import(new URL('loaders/HDRLoader.js',addonsURL));
globalThis.ProgressEvent??=class ProgressEvent{constructor(type,values){this.type=type;Object.assign(this,values);}};
const loadedTextures=new Map();
const stubs={imageDecodes:0,hdrDecodes:0,cubeCaptures:0,pmremEquirectangular:0,pmremCubemap:0,gpuCompile:0};
globalThis.fetch=async input=>{
  const url=new URL(input instanceof URL?input.href:typeof input==='string'?input:input.url,web);
  if(url.protocol!=='file:')throw new Error('Unexpected non-local resource: '+url.href);
  return new Response(await readFile(url));
};
async function textureStub(url,hdr=false){
  const resolved=new URL(url,web),bytes=await readFile(resolved);
  if(!bytes.length)throw new Error('Empty texture asset: '+resolved.href);
  loadedTextures.set(resolved.href,{bytes:bytes.length,sha256:hash(bytes)});
  const texture=new THREE.DataTexture(hdr?new Float32Array([.5,.5,.5,1]):new Uint8Array([128,128,255,255]),1,1,THREE.RGBAFormat,hdr?THREE.FloatType:THREE.UnsignedByteType);
  texture.name=resolved.pathname.split('/').pop();texture.userData.auditSource=resolved.href;texture.needsUpdate=true;
  stubs[hdr?'hdrDecodes':'imageDecodes']++;return texture;
}
THREE.TextureLoader.prototype.loadAsync=function(url){return textureStub(url);};
HDRLoader.prototype.loadAsync=function(url){return textureStub(url,true);};
THREE.CubeCamera.prototype.update=function(){stubs.cubeCaptures++;};
for(const [method,counter]of[['fromEquirectangular','pmremEquirectangular'],['fromCubemap','pmremCubemap']]){
  THREE.PMREMGenerator.prototype[method]=function(){stubs[counter]++;const texture=new THREE.Texture();texture.name='CPU stub '+method;texture.userData.auditSource=method;return{texture,dispose(){texture.dispose();}};};
}
const renderer={capabilities:{getMaxAnisotropy:()=>8},shadowMap:{},toneMappingExposure:1,outputColorSpace:THREE.SRGBColorSpace,compile(){stubs.gpuCompile++;}};
const bytesHash=array=>array?hash(Buffer.from(array.buffer,array.byteOffset,array.byteLength)):null;
function geometryState(geometry){return{attributes:Object.fromEntries(Object.entries(geometry.attributes).sort().map(([name,a])=>[name,{count:a.count,itemSize:a.itemSize,type:a.array.constructor.name,hash:bytesHash(a.array)}])),index:geometry.index?{count:geometry.index.count,type:geometry.index.array.constructor.name,hash:bytesHash(geometry.index.array)}:null,groups:geometry.groups,drawRange:{start:geometry.drawRange.start,count:Number.isFinite(geometry.drawRange.count)?geometry.drawRange.count:'Infinity'}};}
function shaderState(material){
  if(material.isShaderMaterial)return{vertex:hash(material.vertexShader),fragment:hash(material.fragmentShader),key:material.customProgramCacheKey()};
  const shader={vertexShader:THREE.ShaderLib.physical.vertexShader,fragmentShader:THREE.ShaderLib.physical.fragmentShader,uniforms:{}};
  material.onBeforeCompile(shader,renderer);
  return{vertex:hash(shader.vertexShader),fragment:hash(shader.fragmentShader),key:material.customProgramCacheKey(),uniforms:Object.fromEntries(Object.entries(shader.uniforms).map(([name,{value}])=>[name,Array.isArray(value)?value.map(v=>v.toArray?.()??v):value?.toArray?.()??value]))};
}
function textureState(texture){if(!texture)return null;return{name:texture.name,source:texture.userData.auditSource??null,repeat:texture.repeat.toArray(),offset:texture.offset.toArray(),wrap:[texture.wrapS,texture.wrapT],colorSpace:texture.colorSpace,mapping:texture.mapping,anisotropy:texture.anisotropy,data:texture.image?.data?bytesHash(texture.image.data):null};}
function materialState(material){
  const fields=['type','name','roughness','metalness','opacity','transparent','depthWrite','side','vertexColors','envMapIntensity','emissiveIntensity','clearcoat','clearcoatRoughness','transmission','ior','forceSinglePass','aoMapIntensity','dithering'];
  return{...Object.fromEntries(fields.filter(k=>material[k]!==undefined).map(k=>[k,material[k]])),color:material.color?.toArray(),emissive:material.emissive?.toArray(),normalScale:material.normalScale?.toArray(),maps:Object.fromEntries(['map','normalMap','roughnessMap','aoMap','envMap'].map(k=>[k,textureState(material[k])])),shader:shaderState(material)};
}
function capture(scene){
  scene.updateMatrixWorld(true);const meshes=[];
  scene.traverse(part=>{if(!part.isMesh)return;const materials=Array.isArray(part.material)?part.material:[part.material];meshes.push({part,name:part.name,geometry:part.geometry,position:part.geometry.attributes.position,index:part.geometry.index,uv:part.geometry.attributes.uv,geometryState:geometryState(part.geometry),transform:[...part.matrixWorld.elements],materials,materialStates:materials.map(materialState)});});
  return meshes;
}
function geometryChanges(previous){return previous.filter(row=>row.part.geometry!==row.geometry||row.part.geometry.attributes.position!==row.position||row.part.geometry.index!==row.index||row.part.geometry.attributes.uv!==row.uv||!equal(geometryState(row.part.geometry),row.geometryState)||!equal(row.part.matrixWorld.elements,row.transform)).map(row=>row.name);}
function materialChanges(previous){return previous.flatMap(row=>{const materials=Array.isArray(row.part.material)?row.part.material:[row.part.material];return materials.map((material,i)=>({mesh:row.name,previous:row.materials[i]?.name,current:material.name,referenceChanged:material!==row.materials[i],stateChanged:!equal(materialState(material),row.materialStates[i])})).filter(v=>v.referenceChanged||v.stateChanged);});}
function lights(scene){const result=[];scene.traverse(light=>{if(light.isLight)result.push({object:light,type:light.type,name:light.name,intensity:light.intensity,color:light.color.toArray(),ground:light.groundColor?.toArray(),position:light.position.toArray(),target:light.target?.position.toArray(),castShadow:light.castShadow,mapSize:light.shadow?.mapSize.toArray()});});return result;}
const plainLights=rows=>rows.map(({object,...row})=>row);
function worldState(scene){return{environment:scene.environment,background:scene.background,environmentIntensity:scene.environmentIntensity,backgroundIntensity:scene.backgroundIntensity,backgroundBlurriness:scene.backgroundBlurriness,fog:scene.fog?{density:scene.fog.density,color:scene.fog.color.toArray()}:null,exposure:renderer.toneMappingExposure};}
function navSamples(navigation){const rows=[];for(const[name,points]of Object.entries(navigation.routes)){for(let j=0;j<points.length-1;j++){const a=points[j],b=points[j+1],count=Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.28);for(let i=0;i<count;i++){const x=a.x+(b.x-a.x)*i/count,z=a.z+(b.z-a.z)*i/count;rows.push({route:name,x,z,walkable:navigation.isWalkable(x,z),height:navigation.sampleHeight(x,z)});}}const p=points.at(-1);rows.push({route:name,x:p.x,z:p.z,walkable:navigation.isWalkable(p.x,p.z),height:navigation.sampleHeight(p.x,p.z)});}return rows;}
async function preservation(record){const failures=[];for(const[path,expected]of Object.entries(record)){try{if((await hashFile(path)).toLowerCase()!==expected.toLowerCase())failures.push(path);}catch{failures.push(path);}}return failures;}
let environment,lighting;
try{
  const preserved=await readJSON('artifacts/scene-space-04/preserved-files.json'),old=await readJSON('artifacts/scene-space-03/preserved-files.json');
  checks.previous130HashesIncluded=Object.keys(old).length===130&&Object.entries(old).every(([k,v])=>preserved[k]?.toLowerCase()===v.toLowerCase());
  const filesBefore=await preservation(preserved);
  const manifest=await readJSON('web/models/space-03-manifest.json');
  const source=await readFile(new URL('models/space-03.glb',web));
  checks.sourceGLBMatchesSpace03Manifest=hash(source)===manifest.sha256;
  const gltf=await new GLTFLoader().parseAsync(source.buffer.slice(source.byteOffset,source.byteOffset+source.byteLength),'');
  const scene=new THREE.Scene();scene.add(gltf.scene);
  let originalTriangles=0;gltf.scene.traverse(o=>{if(o.isMesh)originalTriangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;});
  const {createNavigation}=await import(new URL('roam-navigation.js',web));
  const navigation=createNavigation(),navigationBefore=navSamples(navigation);
  let inherited,inheritedLights,inheritedWorld;
  globalThis.__space04PreviousReady=(_renderer,actualScene,actualModel)=>{if(actualScene!==scene||actualModel!==gltf.scene)throw new Error('Unexpected inherited scene');inherited=capture(scene);inheritedLights=lights(scene);inheritedWorld=worldState(scene);};
  const module=await import(env04URL);
  const facade=manifest.refinements.facades;
  environment=await module.setupEnvironment(renderer,scene,gltf.scene,{mobile:true,materialAliases:facade.web_material_aliases,windowMaterials:facade.web_window_materials});
  if(!inherited)throw new Error('Actual previous environment chain was not captured');
  const afterMaterials=capture(scene),changes=materialChanges(inherited);
  checks.fullPreviousEnvironmentChainExecuted=stubs.hdrDecodes===1&&stubs.cubeCaptures===1&&stubs.pmremEquirectangular===1&&stubs.pmremCubemap===1;
  checks.materialLayerKeepsAllGeometryAttributesIndicesUVAndTransforms=geometryChanges(inherited).length===0&&afterMaterials.length===inherited.length;
  checks.materialLayerOnlyChangesFourIntendedMaterials=changes.length===4&&changes.every(c=>c.previous==='Space 03 / SPACE03_WindowPane'||c.previous==='ROAM01_PBR / SPACE03_WindowRecess'||/^Space 02 \/ ROAM01_PBR \/ plaster(?:_alt)?(?: \/|$)/.test(c.previous));
  const protectedRows=inherited.filter(r=>r.name.startsWith('Bookshop material study /')||r.name==='Refine ten metre street surface'||r.materials.some(m=>/roof|paving|scanned|limestone/i.test(m.name)));
  checks.bookshopStreetRoofMaterialReferencesPropertiesAndShadersPreserved=protectedRows.length>=5&&materialChanges(protectedRows).length===0&&geometryChanges(protectedRows).length===0;
  checks.materialLayerDoesNotChangeLightingWorldExposure=equal(plainLights(lights(scene)),plainLights(inheritedLights))&&equal(worldState(scene),inheritedWorld);
  const newMaterials=[...new Set(afterMaterials.flatMap(r=>r.materials))].filter(m=>m.name.includes('Space 04 /')||m.name.includes('space04 opposite'));
  checks.actualShaderHooksInjectNewCode=newMaterials.length===4&&newMaterials.every(m=>{const s=shaderState(m);return s.key.includes('space04')&&s.fragment!==hash(THREE.ShaderLib.physical.fragmentShader);});
  const pane=newMaterials.find(m=>m.name==='Space 04 / thin neutral window panes');
  checks.panesReuseExistingEnvironmentWithoutTransmission=pane?.envMap===scene.environment&&pane.transparent&&pane.transmission===0&&pane.depthWrite===false&&pane.forceSinglePass;
  const recess=inherited.find(r=>r.materials.some(m=>m.name==='ROAM01_PBR / SPACE03_WindowRecess'));
  const classification={vertices:0,doors:0,windowBackdrops:0,outside:0};
  const p=new THREE.Vector3();
  for(let i=0;i<recess.position.count;i++){
    p.fromBufferAttribute(recess.position,i).applyMatrix4(recess.part.matrixWorld);classification.vertices++;
    if(module.isDoorPanel(p))classification.doors++;
    else if(module.WINDOW_BACKDROPS.some(r=>Math.abs((r.axis==='x'?p.x:p.z)-r.plane)<.012&&Math.abs((r.axis==='x'?p.z:p.x)-r.u)<=r.w/2+.0001&&Math.abs(p.y-r.y)<=r.h/2+.0001))classification.windowBackdrops++;
    else classification.outside++;
  }
  checks.actualRecessVerticesMapToClosedDoorOrWindowSurfaces=classification.outside===0&&classification.doors>0&&classification.windowBackdrops>0;
  const thresholds=[];
  for(const x of[-11,-3,4.8])for(const[side,cx,z]of[['front',x,16.63],['rear',x+.45,21.07]]){
    const ray=new THREE.Raycaster(new THREE.Vector3(cx,1.08,z),new THREE.Vector3(0,-1,0),0,.5);
    const hit=ray.intersectObject(gltf.scene,true)[0];thresholds.push({houseX:x,side,height:hit?.point.y??null,mesh:hit?.object.name??null});
  }
  checks.sixSpace03DoorNotchesStillAt0925=thresholds.every(v=>v.height!==null&&Math.abs(v.height-.925)<.0001);
  const beforeLighting=capture(scene),beforeLights=lights(scene),beforeWorld=worldState(scene);
  const {applyLighting}=await import(new URL('scene-space-04-lighting.js',web));
  lighting=applyLighting(scene,renderer);
  const afterLights=lights(scene),afterWorld=worldState(scene);
  checks.lightingAddsNoLightsOrMeshes=afterLights.length===beforeLights.length&&afterLights.every((r,i)=>r.object===beforeLights[i].object)&&capture(scene).length===beforeLighting.length;
  checks.lightingDoesNotChangeGeometryUVOrMaterialState=geometryChanges(beforeLighting).length===0&&materialChanges(beforeLighting).length===0;
  checks.directionalAndWarmLightsUnchanged=equal(plainLights(afterLights.filter(v=>v.type!=='HemisphereLight')),plainLights(beforeLights.filter(v=>v.type!=='HemisphereLight')));
  checks.skyFillWithinDeclaredConservativeBounds=afterLights.filter(v=>v.type==='HemisphereLight').length===1&&afterLights.find(v=>v.type==='HemisphereLight').intensity===.27&&equal(afterLights.find(v=>v.type==='HemisphereLight').position,[0,1,-.28])&&afterWorld.environmentIntensity===.36;
  checks.lightingKeepsEnvironmentTextureBackgroundFogExposure=beforeWorld.environment===afterWorld.environment&&beforeWorld.background===afterWorld.background&&beforeWorld.exposure===afterWorld.exposure&&beforeWorld.backgroundIntensity===afterWorld.backgroundIntensity&&beforeWorld.backgroundBlurriness===afterWorld.backgroundBlurriness&&equal(beforeWorld.fog,afterWorld.fog);
  checks.repeatedLightingCallIsIdempotent=applyLighting(scene,renderer)===lighting;
  for(const time of[0,.016,1,12,120])environment.update(time,{camera:new THREE.PerspectiveCamera()});
  scene.updateMatrixWorld(true);
  checks.geometryAndProtectedMaterialsStayFrozenDuringUpdates=geometryChanges(inherited).length===0&&materialChanges(protectedRows).length===0;
  checks.original522NavigationSamplesUnchangedAndWalkable=navigationBefore.length===522&&equal(navSamples(navigation),navigationBefore)&&navigationBefore.every(p=>p.walkable&&Number.isFinite(p.height));
  checks.closedInteriorsStayOutsideNavigation=[-11,-3,4.8].every(x=>!navigation.isWalkable(x,18.85));
  const lightingMetadata=lighting.metadata;
  lighting.dispose();lighting.dispose();
  checks.lightingDisposeRestoresOriginalState=equal(plainLights(lights(scene)),plainLights(beforeLights))&&equal(worldState(scene),beforeWorld);
  const controller=await readFile(new URL('scene-space-04.js',web),'utf8');
  checks.controllerStaticallyReferencesOriginalGLBAndManifest=/const modelName\s*=\s*['"]space-03['"]/.test(controller)&&controller.includes('models/space-03-manifest.json')&&!controller.includes('space-04.glb')&&controller.includes('materialAliases:facade?.web_material_aliases')&&controller.includes('windowMaterials:facade?.web_window_materials');
  const absent=[];for(const path of['web/models/space-04.glb','artifacts/rainy-canal-space-04.blend']){try{await access(new URL(path,root));absent.push(false);}catch(e){if(e.code!=='ENOENT')throw e;absent.push(true);}}
  checks.noDuplicatedSpace04ModelFiles=absent.every(Boolean);
  const filesAfter=await preservation(preserved);
  checks.all136ProtectedFilesUnchanged=Object.keys(preserved).length===136&&filesBefore.length===0&&filesAfter.length===0;
  Object.assign(evidence,{sourceGLB:{file:'web/models/space-03.glb',sha256:hash(source),bytes:source.length,triangles:originalTriangles},inheritedMeshCount:inherited.length,changedMaterials:changes,protectedMeshes:protectedRows.map(r=>r.name),recessClassification:classification,doorThresholds:thresholds,lights:{before:plainLights(beforeLights),after:plainLights(afterLights),countIncrease:afterLights.length-beforeLights.length},materialMetadata:environment.metadata,lightingMetadata,navigationSamples:navigationBefore.length,protectedFileCount:Object.keys(preserved).length,changedFiles:[...new Set([...filesBefore,...filesAfter])],geometryChanges:geometryChanges(inherited),loadedLocalTextures:Object.fromEntries(loadedTextures),stubs});
  environment.dispose();environment.dispose();
  checks.environmentDisposeIsRepeatable=true;
}catch(error){checks.runtimeCompleted=false;evidence.error={message:error.message,stack:error.stack};}
const report={checkedUTC:new Date().toISOString(),passed:Object.values(checks).every(Boolean),checks,evidence,seconds:Math.round((performance.now()-started)/10)/100,limitations:['CPU-only integration using the actual GLB, production environment chain, real material objects, geometry buffers, shader callbacks and navigation. No browser or WebGL context was started.','Texture files are read and hashed but image/HDR decoding is stubbed; CubeCamera and PMREM GPU captures are stubbed. This does not verify final texture pixels, shader compilation, transparency sorting, brightness, reflections or visual realism.','Controller GLB/manifest reuse is a static source check. Live stage switching, GPU errors and visual comparisons require the separate browser verification.']};
await writeFile(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({passed:report.passed,failed:Object.keys(checks).filter(k=>!checks[k]),seconds:report.seconds,report:output.href,error:evidence.error},null,2));
process.exitCode=report.passed?0:1;
