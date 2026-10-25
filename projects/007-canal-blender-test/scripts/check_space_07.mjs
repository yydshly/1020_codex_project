// CPU integration audit of the real GLB and full production environment chain.
// GPU captures and image decoding are explicit stubs; no browser is started.
import {readFile,writeFile,access} from 'node:fs/promises';
import {register} from 'node:module';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url),web=new URL('web/',root);
const output=new URL(process.argv[2]??'artifacts/scene-space-07/runtime-validation.json',root);
try{await access(output);throw new Error('Refusing to overwrite existing audit report.');}catch(error){if(error.code!=='ENOENT')throw error;}
const hash=data=>createHash('sha256').update(data).digest('hex');
const hashFile=async path=>hash(await readFile(new URL(path,root)));
const readJSON=async path=>JSON.parse((await readFile(new URL(path,root),'utf8')).replace(/^\uFEFF/,''));
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const checks={},evidence={},started=performance.now();
const threeURL=new URL('vendor/three/build/three.module.min.js',web).href;
const addonsURL=new URL('vendor/three/examples/jsm/',web).href;
const env07URL=new URL('scene-space-07-environment.js',web).href;
const wrappers={};
for(const [file,fn,hook] of [
 ['scene-space-06-environment.js','setupEnvironment','Previous'],
 ['scene-space-07-windows.js','applyWindowLights','Windows'],
 ['scene-space-07-lamps.js','applyStreetLights','Lamps'],
]){
 const url=new URL(file,web).href;
 const body=fn==='setupEnvironment'
  ?`export async function ${fn}(...args){const h=await actual(...args);globalThis.__space07Previous(...args);return{...h,dispose(){globalThis.__space07BeforePreviousDispose();h.dispose();}};}`
  :`export function ${fn}(...args){const h=actual(...args);globalThis.__space07${hook}(h,...args);return h;}`;
 wrappers['./'+file]='data:text/javascript,'+encodeURIComponent(`import {${fn} as actual} from ${JSON.stringify(url)};${body}`);
}
register('data:text/javascript,'+encodeURIComponent(`export async function resolve(s,c,n){if(s==='three')return{url:${JSON.stringify(threeURL)},shortCircuit:true};if(s.startsWith('three/addons/'))return{url:${JSON.stringify(addonsURL)}+s.slice(13),shortCircuit:true};const w=${JSON.stringify(wrappers)};if(c.parentURL===${JSON.stringify(env07URL)}&&w[s])return{url:w[s],shortCircuit:true};return n(s,c);}`),import.meta.url);
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
function ownMeshesSince(scene,rows){const known=new Set(rows.map(r=>r.part)),out=[];scene.traverse(p=>{if(p.isMesh&&!known.has(p))out.push(p);});return out;}
function triangles(rows){return rows.reduce((n,p)=>n+(p.geometry.index?.count??p.geometry.attributes.position.count)/3,0);}
function materialOf(hit){return Array.isArray(hit.object.material)?hit.object.material[hit.face?.materialIndex??0]:hit.object.material;}
function warmToken(name){return name.split(' / ').some(s=>s==='SPACE06_WindowWarm'||s==='SPACE03_WindowWarm');}
function sourceShaderPreserved(before,after){
 const shader={vertexShader:THREE.ShaderLib.physical.vertexShader,fragmentShader:THREE.ShaderLib.physical.fragmentShader,uniforms:{}};
 before.onBeforeCompile(shader,renderer);
 const newer={vertexShader:THREE.ShaderLib.physical.vertexShader,fragmentShader:THREE.ShaderLib.physical.fragmentShader,uniforms:{}};
 after.onBeforeCompile(newer,renderer);
 return {oldKey:before.customProgramCacheKey(),newKey:after.customProgramCacheKey(),oldUniforms:Object.keys(shader.uniforms),newUniforms:Object.keys(newer.uniforms),uniformsRetained:Object.keys(shader.uniforms).every(k=>k in newer.uniforms),vertexSourceRetained:shader.vertexShader===newer.vertexShader||shader.vertexShader.split('\n').filter(l=>l.trim()&&!l.trim().startsWith('#include')).every(l=>newer.vertexShader.includes(l)),fragmentSourceRetained:shader.fragmentShader.split('\n').filter(l=>l.trim()&&!l.trim().startsWith('#include')).every(l=>newer.fragmentShader.includes(l))};
}
let environment;
try{
 const preserved=await readJSON('artifacts/scene-space-07/preserved-files.json'),old=await readJSON('artifacts/scene-space-06/preserved-files.json');
 const filesBefore=await preservation(preserved);
 checks.previous148ProtectionIncluded=Object.keys(old).length===148&&Object.entries(old).every(([p,h])=>preserved[p]?.toLowerCase()===h.toLowerCase());
 const manifest=await readJSON('web/models/space-06-manifest.json'),appearance=await readJSON('web/models/space-03-manifest.json');
 const source=await readFile(new URL('models/space-06.glb',web));
 checks.sourceGLBMatchesManifest=hash(source)===manifest.sha256;
 const gltf=await new GLTFLoader().parseAsync(source.buffer.slice(source.byteOffset,source.byteOffset+source.byteLength),'');
 const scene=new THREE.Scene();scene.add(gltf.scene);
 const {createNavigation}=await import(new URL('scene-space-06-navigation.js',web));
 const navigation=createNavigation(),navBefore=navSamples(navigation);
 let inherited,inheritedLights,inheritedWorld,windowRows,windowLights,windowHandle,lampHandle;
 let originals=new Map(),originalDisposals=0,sharedTextureDisposals=0;
 const disposalEvents={materials:0,geometries:0};
 globalThis.__space07Previous=(_r,actualScene,actualModel)=>{
  if(actualScene!==scene||actualModel!==gltf.scene)throw new Error('Unexpected source model');
  inherited=capture(scene);inheritedLights=lights(scene);inheritedWorld=worldState(scene);
  const textures=new Set([scene.environment,scene.background].filter(Boolean));
  for(const row of inherited){
   row.geometry.addEventListener('dispose',()=>originalDisposals++);
   for(const m of row.materials){
    if(!originals.has(m)){originals.set(m,materialState(m));m.addEventListener('dispose',()=>originalDisposals++);}
    for(const key of['map','normalMap','roughnessMap','aoMap','envMap'])if(m[key])textures.add(m[key]);
   }
  }
  for(const t of textures)if(t.isTexture)t.addEventListener('dispose',()=>sharedTextureDisposals++);
 };
 globalThis.__space07Windows=(h)=>{windowHandle=h;windowRows=capture(scene);windowLights=lights(scene);};
 globalThis.__space07Lamps=(h)=>{lampHandle=h;};
 let beforePreviousDisposeCalled=false;
 globalThis.__space07BeforePreviousDispose=()=>{
  beforePreviousDisposeCalled=true;
  checks.nightLayersDisposeRestoreAllOriginalMaterialReferences=inherited.every(r=>{const m=Array.isArray(r.part.material)?r.part.material:[r.part.material];return m.length===r.materials.length&&m.every((v,i)=>v===r.materials[i]);});
  checks.nightLayersDisposeRemoveAllOwnMeshesLights=ownMeshesSince(scene,inherited).length===0&&equal(plainLights(lights(scene)),plainLights(inheritedLights));
  checks.nightLayersDisposeKeepOriginalGeometrySharedTextures=geometryChanges(inherited).length===0&&originalDisposals===0&&sharedTextureDisposals===0;
 };
 const module=await import(env07URL),facade=appearance.refinements.facades;
 environment=await module.setupEnvironment(renderer,scene,gltf.scene,{mobile:true,materialAliases:facade.web_material_aliases,windowMaterials:facade.web_window_materials,neighbourhood:manifest.neighbourhood});
 if(!inherited||!windowHandle||!lampHandle)throw new Error('Full production environment hooks did not execute');
 scene.updateMatrixWorld(true);
 const after=capture(scene),afterLights=lights(scene),sourceRows=inherited;
 checks.production06ThenWindowsThenLampsChainExecuted=stubs.hdrDecodes===1&&stubs.cubeCaptures===1&&stubs.pmremEquirectangular===1&&stubs.pmremCubemap===1;
 checks.allSourceGeometryBuffersUVTransformsPreserved=geometryChanges(sourceRows).length===0;
 checks.originalMaterialObjectsRemainUnmodified=[...originals].every(([m,state])=>equal(materialState(m),state));
 checks.skyFogExposureAndEnvironmentTexturePreserved=equal(worldState(scene),inheritedWorld);
 checks.sourceLightsPreserved=equal(plainLights(afterLights.filter(r=>inheritedLights.some(old=>old.object===r.object))),plainLights(inheritedLights));
 const windowChanges=windowRows.flatMap(row=>{const oldRow=inherited.find(v=>v.part===row.part);return oldRow?row.materials.map((m,i)=>({source:oldRow.materials[i],replacement:m})).filter(r=>r.source!==r.replacement):[];});
 checks.windowsOnlyCloneOriginalWarmMaterials=windowChanges.length>0&&windowChanges.every(r=>warmToken(r.source.name));
 checks.windowsAddNoActualLights=equal(plainLights(windowLights),plainLights(inheritedLights));
 const windowShaderChecks=windowChanges.map(({source,replacement})=>({name:source.name,...sourceShaderPreserved(source,replacement)}));
 checks.windowClonesPreservePriorShaderChain=windowShaderChecks.every(r=>r.newKey.startsWith(r.oldKey)&&r.uniformsRetained&&r.vertexSourceRetained&&r.fragmentSourceRetained);
 const windowGroup=scene.getObjectByName('SPACE07_RecessedWindowLights'),windowMeshes=[];windowGroup?.traverse(p=>{if(p.isMesh)windowMeshes.push(p);});
 const wm=windowHandle.metadata,coverage=wm.coverage??[];
 checks.every17NewHouseAnd3OriginalOppositeHouseHasScatteredLitWindows=manifest.neighbourhood.buildings.houses.every(h=>coverage.some(c=>c.houseId===h.id&&c.litWindows>=1&&c.litWindows<c.totalWindows))&&coverage.filter(c=>c.original).length===3;
 checks.everyNewHouseHasFrontAndRearLitWindows=manifest.neighbourhood.buildings.houses.every(h=>['front','rear'].every(face=>wm.windows.some(w=>w.houseId===h.id&&w.face===face))&&wm.windows.filter(w=>w.houseId===h.id).length<=3);
 checks.windowSheetBudgetAndNoShadowMaps=windowMeshes.length<=3&&windowMeshes.length===wm.addedMeshes&&triangles(windowMeshes)===wm.addedTriangles&&windowMeshes.every(p=>!p.castShadow&&!p.receiveShadow);
 checks.finalWindowPlanHas46UniqueWindows39Sheets=wm.litWindowCount===46&&wm.addedWindowSheets===39&&new Set(wm.windows.map(w=>w.id)).size===46;
 const windowDepth=[];
 for(const w of wm.windows){
  const point=new THREE.Vector3(...w.worldCenter).addScaledVector(new THREE.Vector3(...w.tangent),w.innerWidth*.18);
  point.y+=w.innerHeight*.14;
  const normal=new THREE.Vector3(...w.normal),ray=new THREE.Raycaster(point.clone().addScaledVector(normal,.36),normal.clone().negate(),0,.70);
  const hits=ray.intersectObject(gltf.scene,true);
  const pane=hits.find(h=>/WindowPane|thin neutral window panes|WindowWarm/.test(materialOf(h).name));
  const back=hits.find(h=>/WindowBack|closed window backdrops and inset wooden door panels/.test(materialOf(h).name));
  const sheet=windowGroup?ray.intersectObject(windowGroup,true).find(h=>h.object.userData.windowIds?.includes(w.id)):null;
  windowDepth.push({id:w.id,existingWarm:w.existingWarm,pane:pane?{distance:pane.distance,name:materialOf(pane).name}:null,back:back?{distance:back.distance,name:materialOf(back).name}:null,sheetDistance:sheet?.distance??null,insideOriginalRecess:!!pane&&!!back&&(w.existingWarm?pane.distance<back.distance:!!sheet&&pane.distance<sheet.distance&&sheet.distance<back.distance)});
 }
 checks.actualWindowPlanesSitBehindGlassAndBeforeClosedBacks=windowDepth.every(v=>v.insideOriginalRecess);
 const lightDiff=afterLights.filter(r=>!inheritedLights.some(old=>old.object===r.object));
 checks.maximumEightNewActualLightsNoShadows=lightDiff.length>0&&lightDiff.length<=8&&lightDiff.every(r=>r.type==='PointLight'&&!r.castShadow);
 const lampChanges=windowRows.flatMap(row=>{const now=Array.isArray(row.part.material)?row.part.material:[row.part.material];return now.map((replacement,i)=>({source:row.materials[i],replacement})).filter(v=>v.source!==v.replacement);});
 const lampShaderChecks=lampChanges.map(({source,replacement})=>({name:source.name,...sourceShaderPreserved(source,replacement)}));
 checks.lampSurfaceClonesPreserveAllPriorShaderCallbacks=lampShaderChecks.length>0&&lampShaderChecks.every(r=>r.newKey.startsWith(r.oldKey)&&r.uniformsRetained&&r.vertexSourceRetained&&r.fragmentSourceRetained);
 checks.lampsSkipWindowGlassWarmEmissivesAndWindowSheets=lampChanges.every(r=>!r.source.transparent&&!warmToken(r.source.name)&&!r.source.name.includes('SPACE07_WindowLight'));
 const newMeshes=ownMeshesSince(scene,inherited),newGeometries=new Set(newMeshes.map(p=>p.geometry));
 const ownedMaterials=new Set(after.flatMap(r=>r.materials).filter(m=>!originals.has(m)));
 for(const m of ownedMaterials)m.addEventListener('dispose',()=>disposalEvents.materials++);
 for(const g of newGeometries)g.addEventListener('dispose',()=>disposalEvents.geometries++);
 checks.newRuntimeFixtureAndWindowGeometryWithin15000Triangles=triangles(newMeshes)<=15000;
 // Detailed fixture coverage / physical-clearance results are added below.
 const lm=lampHandle.metadata;
 checks.finalStreetPlanHas29FixturesAndSixActualLights=lm.fixtureCount===29&&lm.fixtures.length===29&&new Set(lm.fixtures.map(f=>f.id)).size===29&&lightDiff.length===6;
 const requiredZones=['near-canal','far-canal','north-backstreet','north-ring','side-streets','south-street','original-courtyard'];
 checks.allDevelopedStreetAndCourtyardZonesHaveFixtures=requiredZones.every(z=>lm.fixtures.some(f=>f.zone===z));
 const emitter=scene.getObjectByName('SPACE07_Lamps_emitter'),ep=emitter?.geometry.attributes.position,emitterCenters=[];
 if(ep)for(let i=0;i<ep.count;i+=36){const box=new THREE.Box3();for(let j=i;j<Math.min(i+36,ep.count);j++)box.expandByPoint(new THREE.Vector3().fromBufferAttribute(ep,j).applyMatrix4(emitter.matrixWorld));emitterCenters.push(box.getCenter(new THREE.Vector3()));}
 checks.actualEmitterGeometryMatchesEveryFixture=emitterCenters.length===lm.fixtures.length&&lm.fixtures.every(f=>emitterCenters.some(p=>p.distanceTo(new THREE.Vector3(...f.worldPosition))<1e-5));
 const poleConflicts=[];
 for(const f of lm.fixtures.filter(f=>f.groundObstruction)){
  const c=f.groundObstruction;
  for(let i=0;i<32;i++){const a=i*Math.PI/16,r=c.radius+navigation.radius;const x=c.x+Math.cos(a)*r,z=c.z+Math.sin(a)*r;if(navigation.isWalkable(x,z))poleConflicts.push({id:f.id,x,z});}
 }
 checks.newLampPostsDoNotEnterNavigableBodyEnvelope=poleConflicts.length===0;
 const coverageByRoute={};
 for(const id of Object.keys(navigation.routes)){
  const points=navBefore.filter(p=>p.route===id),distances=[],outside=[];
  for(const p of points){
   const closest=Math.min(...lm.fixtures.map(f=>Math.hypot(p.x-f.worldPosition[0],p.z-f.worldPosition[2])));distances.push(closest);
   const reached=lm.fixtures.some(f=>{
    const q=f.worldPosition,n=f.outwardNormal,b=f.groundBoundsBlenderXY,w=f.wallAnchor;
    return Math.hypot(p.x-q[0],p.height-q[1],p.z-q[2])<f.fieldRadius&&(!n.some(Boolean)||(p.x-w[0])*n[0]+(p.z-w[2])*n[2]>=-.025)&&p.x>=b[0]&&p.x<=b[2]&&-p.z>=b[1]&&-p.z<=b[3];
   });if(!reached)outside.push({x:p.x,z:p.z,nearestFixtureM:closest});
  }
  coverageByRoute[id]={samples:points.length,maximumNearestFixtureM:Math.max(...distances),outsidePotentialNewLampField:outside.length,outsideFraction:outside.length/points.length,mostDistantPoints:outside.sort((a,b)=>b.nearestFixtureM-a.nearestFixtureM).slice(0,5)};
 }
 evidence.fixtureCoverage={byRoute:coverageByRoute,poleConflicts,note:'Physical emitter distance and conservative support of the new bounded fields; excludes existing source lights and emissive windows. Points inside a field are not guaranteed to be perceptually bright.'};

 const lampModule=await import(new URL('scene-space-07-lamps.js',web));
 checks.repeatedLampApplyIsIdempotent=lampModule.applyStreetLights(scene,gltf.scene,manifest.neighbourhood)===lampHandle;
 const beforeUpdateCount=afterLights.length;
 const fieldMaterial=lampChanges[0]?.replacement,fieldBefore=fieldMaterial?shaderState(fieldMaterial).uniforms:null;
 for(const t of[0,.016,1,12,120])environment.update(t,{camera:new THREE.PerspectiveCamera()});
 scene.updateMatrixWorld(true);
 checks.lampDiffuseFieldsStayFixedWhenCameraUpdates=fieldMaterial&&equal(shaderState(fieldMaterial).uniforms,fieldBefore);
 checks.updatesDoNotChangeGeometryOrCreateLights=geometryChanges(inherited).length===0&&lights(scene).length===beforeUpdateCount;
 checks.allNavigationSamplesAndHeightsPreserved=equal(navSamples(navigation),navBefore)&&navBefore.every(p=>p.walkable&&Number.isFinite(p.height));
 const controller=await readFile(new URL('scene-space-07.js',web),'utf8');
 checks.bothPageStagesReuseOriginal06GLBManifestAndNavigation=/const modelName\s*=\s*['"]space-06['"]/.test(controller)&&controller.includes('models/space-06-manifest.json')&&controller.includes("'./scene-space-06-navigation.js'")&&!controller.includes('space-07.glb');
 const noModels=[];for(const p of['web/models/space-07.glb','artifacts/rainy-canal-space-07.blend']){try{await access(new URL(p,root));noModels.push(false);}catch(e){if(e.code!=='ENOENT')throw e;noModels.push(true);}}
 checks.noRedundant07DiskModelCreated=noModels.every(Boolean);
 Object.assign(evidence,{source:{file:'space-06.glb',sha256:hash(source),bytes:source.length,triangles:manifest.geometry.triangles},windowMetadata:wm,windowDepth,windowShaderChecks,lampMetadata:lm,lampShaderChecks,newLights:plainLights(lightDiff),newMeshes:newMeshes.map(p=>({name:p.name,triangles:triangles([p]),castShadow:p.castShadow,receiveShadow:p.receiveShadow})),newRuntimeTriangles:triangles(newMeshes),sourceMeshes:inherited.length,navigationSamples:navBefore.length,loadedLocalTextures:Object.fromEntries(loadedTextures),stubs});
 environment.dispose();environment.dispose();
 checks.productionDisposeReachedPreviousLayerOnce=beforePreviousDisposeCalled;
 checks.allOwnedNightResourcesDisposedExactlyOnce=disposalEvents.materials===ownedMaterials.size&&disposalEvents.geometries===newGeometries.size;
 evidence.disposals={...disposalEvents,expectedMaterials:ownedMaterials.size,expectedGeometries:newGeometries.size};
 const filesAfter=await preservation(preserved);
 checks.all157OldFilesUnchanged=Object.keys(preserved).length===157&&filesBefore.length===0&&filesAfter.length===0;
 evidence.preservation={count:Object.keys(preserved).length,changed:[...new Set([...filesBefore,...filesAfter])]};
}catch(error){checks.runtimeCompleted=false;evidence.error={message:error.message,stack:error.stack};}
const report={checkedUTC:new Date().toISOString(),passed:Object.values(checks).every(Boolean),checks,evidence,seconds:Math.round((performance.now()-started)/10)/100,limitations:['Actual SPACE06 GLB, complete production 06→07 environment chain, source buffers, shader callbacks, navigation and disposal are exercised without a browser.','Image/HDR decoding and GPU CubeCamera/PMREM are stubbed after reading the real local texture files. This does not verify shader compilation, night brightness, bloom, transparency, light spill or reflections; root performs the actual browser GPU review.','Fixture coverage is spatial sampling, not a radiometric simulation. Existing source geometry and navigation remain unchanged.']};
await writeFile(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({passed:report.passed,failed:Object.keys(checks).filter(k=>!checks[k]),seconds:report.seconds,report:output.href,error:evidence.error},null,2));
process.exitCode=report.passed?0:1;
