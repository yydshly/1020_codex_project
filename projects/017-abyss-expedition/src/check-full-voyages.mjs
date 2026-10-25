// SPDX-License-Identifier: GPL-3.0-only
// CPU acceptance of every authored voyage chapter. Actual scene functions and
// geometry are extracted in memory; browser/WebGL readability is a separate QA.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {getDirectorShots} from '../web/data/director-shots.mjs';
import {narrationManifest} from '../web/assets/narration/manifest.mjs';
import {interpolateTrack} from '../web/core/track.mjs';
import {getDirectorLessonCue} from '../web/rendering/director-lesson-timeline.mjs';
process.setUncaughtExceptionCaptureCallback(error=>{console.error(error.name+': '+error.message);for(const line of (error.stack||'').split('\n').slice(1).filter(line=>!line.includes('data:')).slice(0,5))console.error(line);process.exitCode=1;});

const threeURL=new URL('../web/vendor/three/build/three.module.min.js',import.meta.url),THREE=await import(threeURL.href),cache=new Map();
async function browserModule(relative){
  const url=new URL(relative,import.meta.url);url.search='';url.hash='';if(cache.has(url.href))return cache.get(url.href);
  let source=await readFile(url,'utf8');for(const match of [...source.matchAll(/^import\s+[^;\n]+?\s+from\s+(['"])([^'"]+)\1;?/gm)]){const spec=match[2],dependency=spec==='three'?threeURL.href:spec.startsWith('.')?await browserModule(new URL(spec,url).href):null;assert.ok(dependency,`Unmapped CPU dependency ${spec}`);source=source.replace(match[0],match[0].replace(match[1]+spec+match[1],JSON.stringify(dependency)));}
  const result='data:text/javascript;base64,'+Buffer.from(source).toString('base64');cache.set(url.href,result);return result;
}
const source=await readFile(new URL('../web/scene.js',import.meta.url),'utf8');
function balanced(start){
  const begin=source.indexOf('{',start);let depth=0,quote=null,line=false,block=false;
  for(let i=begin;i<source.length;i++){const c=source[i],next=source[i+1];if(line){if(c==='\n')line=false;continue;}if(block){if(c==='*'&&next==='/'){block=false;i++;}continue;}if(quote){if(c==='\\'){i++;continue;}if(c===quote)quote=null;continue;}if(c==='/'&&next==='/'){line=true;i++;continue;}if(c==='/'&&next==='*'){block=true;i++;continue;}if(c==='"'||c==="'"||c==='`'){quote=c;continue;}if(c==='{')depth++;if(c==='}'&&--depth===0)return source.slice(start,i+1);}
  throw Error('Unclosed scene block');
}
function fn(name){const start=source.indexOf('function '+name+'(');assert.ok(start>=0,`Missing actual scene function ${name}`);const begin=source.indexOf('{',source.indexOf(')',start)+1);return source.slice(start,begin)+balanced(begin);}
const bodyStart=source.indexOf('if(rover&&telemetry?.position){');assert.ok(bodyStart>=0);
const bodyTick=balanced(bodyStart);
let imports=`import * as THREE from ${JSON.stringify(threeURL.href)};\n`;
for(const [names,file] of [['createRovSystem','rov-system'],['createRovLightShaft','ocean-water'],['createVentLife,createSpongeColony','benthic-life'],['createHydrothermalPlume','hydrothermal-plume'],['createResearchVessel,createSeabedContext,createSamplingEquipment','expedition-context'],['createCollisionWorld','collision-world'],['createLearningWorld','learning-world'],['planExpeditionShot','shot-camera'],['getDirectorLessonCue','director-lesson-timeline'],['ROV_COLLISION_PROFILE,ROV_BODY_RADIUS,snapshotSolidColliders','collision-assets']])imports+=`import {${names}} from ${JSON.stringify(await browserModule('../web/rendering/'+file+'.mjs'))};\n`;
imports+=`import {buildBathymetry} from ${JSON.stringify(await browserModule('../web/terrain.js'))};\n`;
const builderNames=['randomFrom','mesh','material','segment','toWorld','vehicleLocation','stagedVehicleLocation','buildVehicle','buildChimneys','buildCorals','buildLander','buildRidge','buildWreck','buildSampling','buildRecoveryBeacon','createStation'];
const runtimeNames=['clearSightline','ensureVisiblePoints','applyDirectorCamera','setDirectorFrame','protectScriptedVehicle','protectCamera'];
const harness=imports+`export function createVoyage(data,viewport){
 const mission=data,SIZE=620,clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),document={createElement:()=>({style:{},setAttribute(){},append(){},addEventListener(){}}),createTextNode:()=>({})},overlay={append(){}},onSelect=()=>{};
 const propGroup=new THREE.Group(),vehicleGroup=new THREE.Group(),effectsGroup=new THREE.Group(),contextGroup=new THREE.Group(),overheadGroup=new THREE.Group(),samplingEquipment=new Map(),entityRoots=new Map(),particleTexture=new THREE.Texture();
 const terrainAdapter=buildBathymetry(mission),heightAt=terrainAdapter.heightAt;
 let rover,roverAdapter,tether,halo,roverBounds,fanRotors=[],vehicleLights=[],stationLabels=[],pickables=[],plumeSystems=[];
 ${builderNames.map(fn).join('\n')}
 buildVehicle();const rng=randomFrom((data.seed||1)+71);data.entities.forEach((entity,index)=>createStation(entity,index,rng));
 const contextAdapter=createSeabedContext({entities:data.entities,toWorld,heightAt,texture:particleTexture,random:randomFrom((data.seed||1)+808)});contextGroup.add(contextAdapter.group);
 const landing=toWorld(data.entities[0].position),surfacePosition=[landing.x-78,430,landing.z+32],vessel=createResearchVessel({position:surfacePosition});overheadGroup.add(vessel.group);
 const surfaceSite={position:new THREE.Vector3(...surfacePosition),anchor:vessel.anchor,deployment:vessel.deployment};
 const colliders=[...snapshotSolidColliders(propGroup,{filter:object=>!samplingEquipment.has(object.userData.entityId)}),...snapshotSolidColliders(contextGroup),...snapshotSolidColliders(overheadGroup,{padding:6})];for(const equipment of samplingEquipment.values())colliders.push(...snapshotSolidColliders(equipment,{padding:2}));
 const scriptedWorld=createCollisionWorld({heightAt,bounds:{minX:-580,maxX:580,minZ:-580,maxZ:580},ceiling:480,colliders}),terrainGeometries=[];terrainAdapter.group.traverse(o=>{if(o.isMesh&&o.geometry.attributes.position.count<100000)terrainGeometries.push({positions:o.geometry.attributes.position.array,index:o.geometry.index?.array});});
 const cameraWorld=createCollisionWorld({heightAt,bounds:{minX:-1900,maxX:1900,minZ:-1900,maxZ:1900},ceiling:1800,colliders,terrainGeometries});
 const cameraProfile={min:{x:-3,y:-3,z:-3},max:{x:3,y:3,z:3}},vehicleCameraWorld=createCollisionWorld({heightAt:()=>-10000,bounds:{minX:-10000,maxX:10000,minZ:-10000,maxZ:10000},ceiling:10000,colliders:[ROV_COLLISION_PROFILE]});
 const centreBounds={minX:-580+ROV_BODY_RADIUS,maxX:580-ROV_BODY_RADIUS,minZ:-580+ROV_BODY_RADIUS,maxZ:580-ROV_BODY_RADIUS},learningWorld=createLearningWorld(),camera=new THREE.PerspectiveCamera(46,viewport.width/viewport.height,.5,2500),controls={target:new THREE.Vector3(),enabled:false};
 camera.position.set(335,405,475);const width=viewport.width,height=viewport.height,presentation='dive',reducedMotion=false,previousRoverPosition=new THREE.Vector3();let directorActive=true,directorFrame=null,directorEntry=null,cameraMode='overview',cameraCut=true,lastSafeCamera=null,lastSafeVehicle=null,scriptedCutPending=true,pilotActive=false,pilotCamera='chase',transition=null,telemetry=mission.frames[0],currentView={state:{playing:false}};
 const applyVisibility=()=>{},setDirectorEnabled=()=>{},applyPilotCamera=()=>{};
 ${runtimeNames.map(fn).join('\n')}
 const start=scriptedWorld.resolveRestoredPose({position:vehicleLocation(telemetry),heading:0},ROV_COLLISION_PROFILE,{centreBounds,maxPushout:64});assertStart(start);rover.position.copy(start.position);lastSafeVehicle={position:{...start.position},heading:start.heading};previousRoverPosition.copy(rover.position);
 function assertStart(p){if(!p.valid)throw new Error('No safe initial ROV');}
 function visibleMeshes(root){const list=[];root.updateWorldMatrix(true,true);function visit(o){if(!o.visible)return;if(o.isMesh)list.push(o);for(const c of o.children)visit(c);}visit(root);return list;}
 return {step(shot,progress,sample,globalTime,dt,jump=false,framing=shot.framing){
   telemetry=sample;currentView.activeEntity=mission.entities.find(e=>e.id===shot.entityId);const frameDelta=dt,visualDelta=dt,visualTime=globalTime;
   const lesson=getDirectorLessonCue(shot,progress*shot.duration);setDirectorFrame({...shot,shotId:shot.id,framing,motionFraming:shot.framing,progress,elapsed:globalTime,shotElapsed:progress*shot.duration,lessonStep:lesson?.step,lessonProgress:lesson?.progress,playing:dt>0,jump});
   ${bodyTick}
   vessel.update(globalTime);applyDirectorCamera();protectCamera();camera.updateMatrixWorld(true);
   const stage=learningWorld.isActive(),pose={position:{x:rover.position.x,y:rover.position.y,z:rover.position.z},heading:-rover.rotation.y},subject=currentView.activeEntity,point=toWorld(subject.position,subject.kind==='vent'?24:subject.kind==='coral'?8:7),projected=point.clone().project(camera),frustum=new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
   const roots=stage?[learningWorld.group]:shot.framing==='establishing'&&progress<.83||shot.framing==='departure'?[rover,...(shot.framing==='establishing'&&progress<.25||shot.framing==='departure'&&progress>.72?[overheadGroup]:[])]:[entityRoots.get(subject.id),...(mission.terrain==='canyon'&&['c-wall','c-sand','c-channel'].includes(subject.id)?[terrainAdapter.group]:[])];
   const meshes=roots.flatMap(visibleMeshes);const boxes=meshes.map(m=>{if(!m.geometry.boundingBox)m.geometry.computeBoundingBox();if(m.isInstancedMesh){m.computeBoundingBox();return m.boundingBox.clone().applyMatrix4(m.matrixWorld);}return m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld);});
   const visible=boxes.filter(b=>!b.isEmpty()&&frustum.intersectsBox(b)).length;let subjectTerrainVisible=null,samplerScreenHeight720=null,samplerVisibleProbes=null;
   if(!stage&&subject.kind==='sampling'){
     const equipment=samplingEquipment.get(subject.id),b=new THREE.Box3().setFromObject(equipment),ys=[];for(const x of [b.min.x,b.max.x])for(const y of [b.min.y,b.max.y])for(const z of [b.min.z,b.max.z])ys.push(new THREE.Vector3(x,y,z).project(camera).y);samplerScreenHeight720=(Math.max(...ys)-Math.min(...ys))*360;
     if(progress===0||progress===1){
       const obstacles=[...visibleMeshes(propGroup),...visibleMeshes(contextGroup),...visibleMeshes(rover)],parts=visibleMeshes(equipment),probes=parts.filter(m=>m.geometry.attributes.position).slice(0,16).map(m=>new THREE.Vector3().fromBufferAttribute(m.geometry.attributes.position,Math.floor(m.geometry.attributes.position.count/3)).applyMatrix4(m.matrixWorld));let clear=0;
       for(const p of probes){const q=p.clone().project(camera);if(Math.abs(q.x)>1||Math.abs(q.y)>1||q.z<-1||q.z>1)continue;const direction=p.clone().sub(camera.position),ray=new THREE.Raycaster(camera.position,direction.clone().normalize(),.1,direction.length()+.5),hit=ray.intersectObjects(obstacles,false)[0];if(hit?.object.userData.entityId===subject.id)clear++;}
       samplerVisibleProbes={visible:clear,total:probes.length};
     }
   }
   if(!stage&&!['establishing','departure'].includes(shot.framing)&&['vent','coral','sampling'].includes(subject.kind)&&progress>=.24&&Math.abs(progress*4-Math.round(progress*4))<.015){
     const probes=[point,...boxes.slice(0,meshes.length-(mission.terrain==='canyon'&&['c-wall','c-sand','c-channel'].includes(subject.id)?2:0)).sort((a,b)=>b.max.y-a.max.y).slice(0,8).map(b=>b.getCenter(new THREE.Vector3()))];
     subjectTerrainVisible=probes.some(p=>{const q=p.clone().project(camera);if(Math.abs(q.x)>1||Math.abs(q.y)>1||q.z<-1||q.z>1)return false;const n=Math.max(12,Math.ceil(camera.position.distanceTo(p)/2));for(let i=1;i<n;i++){const v=camera.position.clone().lerp(p,i/n);if(v.y<heightAt(v.x,v.z)+.25)return false;}return true;});
   }
   return {stage,state:learningWorld.getState(),pose,camera:camera.position.toArray(),target:controls.target.toArray(),fov:camera.fov,bodySafe:stage||scriptedWorld.isPoseClear(pose,ROV_COLLISION_PROFILE),cameraSafe:stage||cameraWorld.isPoseClear({position:camera.position,heading:0},cameraProfile),visibleMeshes:visible,totalMeshes:meshes.length,subjectTerrainVisible,samplerScreenHeight720,samplerVisibleProbes,subjectProjected:[projected.x,projected.y,projected.z],subjectDistance:rover.position.distanceTo(point),surfaceDistance:rover.position.distanceTo(surfaceSite.deployment),depth:rover.position.y};
 },surface:surfaceSite.deployment.clone(),destroy(){const geometries=new Set(),materials=new Set();for(const root of [propGroup,vehicleGroup,effectsGroup,contextGroup,overheadGroup,terrainAdapter.group,learningWorld.group])root.traverse(o=>{if(o.geometry)geometries.add(o.geometry);for(const m of o.material?(Array.isArray(o.material)?o.material:[o.material]):[])materials.add(m);});for(const g of geometries)g.dispose();for(const m of materials)m.dispose();particleTexture.dispose();}};
}`;
const {createVoyage}=await import('data:text/javascript;base64,'+Buffer.from(harness).toString('base64'));
const previousLoad=THREE.TextureLoader.prototype.load;THREE.TextureLoader.prototype.load=function(){return new THREE.Texture();};
const report=[],issues=[];let frames=0;
try{
 for(const id of ['vents','canyon']){
  const mission=JSON.parse(await readFile(new URL('../web/data/'+id+'.json',import.meta.url),'utf8'));
  const shots=getDirectorShots(id).map(s=>{const audio=narrationManifest.clips[s.id];assert.equal(audio.text,s.narration);return {...s,audio,duration:Math.max(s.duration,Math.ceil((audio.duration+1)*10)/10)};});
  const voyage=createVoyage(mission,{width:988,height:827.667}),chapters=[];let globalTime=0;
  for(const [index,shot] of shots.entries()){
   const chapterStart=performance.now(),event=mission.events.find(e=>e.id===shot.eventId);assert.ok(event);const sample=interpolateTrack(mission.frames,event.time),steps=Math.max(40,Math.ceil(shot.duration*24));let start,middle,end,maxDistance=0,unsafe=0,invisible=0,occluded=0,sightlineSamples=0,minSamplerHeight=Infinity;
   for(let i=0;i<=steps;i++){const progress=i/steps,snapshot=voyage.step(shot,progress,sample,globalTime+shot.duration*progress,i?shot.duration/steps:0,index===0&&i===0);const lesson=getDirectorLessonCue(shot,progress*shot.duration);if(lesson&&snapshot.stage)assert.equal(snapshot.state.step,lesson.step,`${shot.id}: 3D lesson step differs from narration cue`);if(!i)start=snapshot;if(i===Math.round(steps/2))middle=snapshot;end=snapshot;maxDistance=Math.max(maxDistance,snapshot.subjectDistance);if(snapshot.samplerScreenHeight720!==null)minSamplerHeight=Math.min(minSamplerHeight,snapshot.samplerScreenHeight720);if(!snapshot.bodySafe||!snapshot.cameraSafe)unsafe++;if(!snapshot.visibleMeshes)invisible++;if(snapshot.subjectTerrainVisible!==null){sightlineSamples++;if(!snapshot.subjectTerrainVisible)occluded++;}frames++;}
   for(let pauseFrame=0;pauseFrame<3;pauseFrame++){const paused=voyage.step(shot,1,sample,globalTime+shot.duration,0);assert.deepEqual(paused.pose,end.pose,`${shot.id}: pause moved the ROV`);for(let i=0;i<3;i++)assert.ok(Math.abs(paused.camera[i]-end.camera[i])<1e-5,`${shot.id}: pause moved the camera`);}
   const samplerReadability=start.samplerScreenHeight720===null?{}:{minSamplerHeight720:+minSamplerHeight.toFixed(1),samplerHeight720:[start,middle,end].map(s=>+s.samplerScreenHeight720.toFixed(1)),samplerCameraPositions:[start,middle,end].map(s=>s.camera.map(n=>+n.toFixed(1))),samplerVisibleProbes:[start,end].map(s=>s.samplerVisibleProbes)};
   const chapter={id:shot.id,kind:shot.explanation||shot.framing,duration:shot.duration,startY:+start.depth.toFixed(1),endY:+end.depth.toFixed(1),startSubjectDistance:+start.subjectDistance.toFixed(1),maxSubjectDistance:+maxDistance.toFixed(1),endSubjectDistance:+end.subjectDistance.toFixed(1),endSurfaceDistance:+end.surfaceDistance.toFixed(1),unsafeFrames:unsafe,invisibleFrames:invisible,sightlineSamples,occludedSamples:occluded,stage:end.stage,...samplerReadability};chapters.push(chapter);
   if(process.env.ABYSS_QA_PROGRESS)console.error(JSON.stringify({shot:shot.id,ms:Math.round(performance.now()-chapterStart),...chapter}));
   if(unsafe)issues.push({shot:shot.id,problem:'unsafe body/camera',frames:unsafe});
   if(invisible>steps*.1)issues.push({shot:shot.id,problem:'principal scene object outside frustum',frames:invisible});
   if(occluded)issues.push({shot:shot.id,problem:'all sampled physical subject points hidden by terrain',samples:occluded});
   if(minSamplerHeight<120)issues.push({shot:shot.id,problem:'sampler below readable 120 px height at 720 reference height',height:samplerReadability.minSamplerHeight720});
   for(const snapshot of [start,end])if(snapshot.samplerVisibleProbes&&snapshot.samplerVisibleProbes.visible/snapshot.samplerVisibleProbes.total<.75)issues.push({shot:shot.id,problem:'sampler obscured by foreground scene geometry',...snapshot.samplerVisibleProbes});
   if(!end.stage&&!['establishing','departure'].includes(shot.framing)&&(start.subjectDistance>90||maxDistance>90))issues.push({shot:shot.id,problem:'observation chapter must start and remain at its safe station after a time cut',startDistance:chapter.startSubjectDistance,maxDistance:chapter.maxSubjectDistance});
   if(shot.framing==='departure'&&end.surfaceDistance>35)issues.push({shot:shot.id,problem:'ROV did not return to the ship-side recovery position',distance:chapter.endSurfaceDistance});
   globalTime+=shot.duration;
  }
  // The UI pauses then cuts only the lens; motionFraming remains the authored
  // chapter action. A camera choice named "departure" must never recall a ROV.
  const overrideShots=shots.filter(s=>!['establishing','departure'].includes(s.framing)&&(!s.explanation||s.explanation==='summary')),overrideFramings=['establishing','approach','orbit','detail','compare','departure'];let overrideSamples=0,maxOverrideShift=0;
  for(const shot of overrideShots){const event=mission.events.find(e=>e.id===shot.eventId),sample=interpolateTrack(mission.frames,event.time);for(const progress of [.1,.5,.9]){const baseline=voyage.step(shot,progress,sample,globalTime,0,true);for(const framing of overrideFramings){const changed=voyage.step(shot,progress,sample,globalTime,0,true,framing),a=baseline.pose.position,b=changed.pose.position,shift=Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);maxOverrideShift=Math.max(maxOverrideShift,shift);assert.ok(shift<1e-6,`${shot.id}: camera ${framing} changed authored ROV motion by ${shift}`);assert.equal(changed.pose.heading,baseline.pose.heading,`${shot.id}: camera ${framing} rotated the ROV`);assert.ok(changed.bodySafe&&changed.cameraSafe,`${shot.id}: unsafe camera override ${framing}`);overrideSamples++;}}}
  voyage.destroy();
  const phone=createVoyage(mission,{width:390,height:745.333});let phoneCuts=0;
  for(const shot of shots){const event=mission.events.find(e=>e.id===shot.eventId),sample=interpolateTrack(mission.frames,event.time);for(const progress of [0,.5,1]){const s=phone.step(shot,progress,sample,progress*shot.duration,0,true);assert.ok(s.bodySafe&&s.cameraSafe,`${shot.id}: unsafe mobile jump`);if(!s.visibleMeshes)issues.push({shot:shot.id,problem:'empty mobile principal object',progress});phoneCuts++;}}
  phone.destroy();report.push({mission:id,duration:+globalTime.toFixed(1),chapters,phoneCuts,framingRegression:{chapters:overrideShots.length,framings:overrideFramings,samples:overrideSamples,maxPositionShift:maxOverrideShift}});
 }
}finally{THREE.TextureLoader.prototype.load=previousLoad;}
const result={schema:'abyss-full-voyage-geometry/v1',passed:issues.length===0,frames,issues,missions:report};
await writeFile(new URL('../notes/full-voyage-geometry.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
assert.equal(issues.length,0,'Full voyage acceptance found a mismatch; see issues above');
