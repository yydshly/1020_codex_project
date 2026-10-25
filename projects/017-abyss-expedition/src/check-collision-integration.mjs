// SPDX-License-Identifier: GPL-3.0-only
// Run: node src/check-collision-integration.mjs
// Executes the real scene's geometry builders in a CPU-only, in-memory harness.
// DOM labels are inert stubs; no WebGL, browser, package install or file rewrite.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createCollisionWorld} from '../web/rendering/collision-world.mjs';
import {createPilotController} from '../web/core/pilot-core.mjs';
process.setUncaughtExceptionCaptureCallback(error=>{console.error(error.name+': '+error.message);for(const line of (error.stack||'').split('\n').slice(1).filter(line=>!line.includes('data:')).slice(0,5))console.error(line);process.exitCode=1;});

const threeURL=new URL('../web/vendor/three/build/three.module.min.js',import.meta.url),THREE=await import(threeURL.href),cache=new Map();
async function browserModule(relative){
  const url=new URL(relative,import.meta.url);url.search='';url.hash='';if(cache.has(url.href))return cache.get(url.href);
  let source=await readFile(url,'utf8');for(const match of [...source.matchAll(/^import\s+[^;\n]+?\s+from\s+(['"])([^'"]+)\1;?/gm)]){const spec=match[2],dependency=spec==='three'?threeURL.href:spec.startsWith('.')?await browserModule(new URL(spec,url).href):null;assert.ok(dependency,`Unmapped CPU dependency ${spec}`);source=source.replace(match[0],match[0].replace(match[1]+spec+match[1],JSON.stringify(dependency)));}
  const result='data:text/javascript;base64,'+Buffer.from(source).toString('base64');cache.set(url.href,result);return result;
}
const terrainModule=await import(await browserModule('../web/terrain.js'));
const {ROV_COLLISION_PROFILE:profile,ROV_BODY_RADIUS:radius,snapshotSolidColliders}=await import(await browserModule('../web/rendering/collision-assets.mjs'));
const sceneSource=await readFile(new URL('../web/scene.js',import.meta.url),'utf8');
function extractFunction(name){
  const start=sceneSource.indexOf('function '+name+'(');assert.ok(start>=0,`Scene builder ${name} is missing`);const begin=sceneSource.indexOf('{',sceneSource.indexOf(')',start)+1);let depth=0,quote=null,lineComment=false,blockComment=false;
  for(let i=begin;i<sceneSource.length;i++){const c=sceneSource[i],next=sceneSource[i+1];if(lineComment){if(c==='\n')lineComment=false;continue;}if(blockComment){if(c==='*'&&next==='/'){blockComment=false;i++;}continue;}if(quote){if(c==='\\'){i++;continue;}if(c===quote)quote=null;continue;}if(c==='/'&&next==='/'){lineComment=true;i++;continue;}if(c==='/'&&next==='*'){blockComment=true;i++;continue;}if(c==='"'||c==="'"||c==='`'){quote=c;continue;}if(c==='{')depth++;if(c==='}'&&--depth===0)return sceneSource.slice(start,i+1);}
  throw Error('Unclosed scene function '+name);
}
const dependencies=[['createRovSystem','rov-system'],['createRovLightShaft','ocean-water'],['createVentLife,createSpongeColony','benthic-life'],['createHydrothermalPlume','hydrothermal-plume'],['createResearchVessel,createSeabedContext,createSamplingEquipment','expedition-context'],['createCollisionWorld','collision-world']];
let imports=`import * as THREE from ${JSON.stringify(threeURL.href)};\n`;
for(const [names,file] of dependencies)imports+=`import {${names}} from ${JSON.stringify(await browserModule('../web/rendering/'+file+'.mjs'))};\n`;
const names=['randomFrom','mesh','material','segment','toWorld','buildVehicle','buildChimneys','buildCorals','buildLander','buildRidge','buildWreck','buildSampling','buildRecoveryBeacon','createStation'];
const harness=imports+`export function fixture(data,heightAt){
 const mission=data,SIZE=620,clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),document={createElement:()=>({style:{},setAttribute(){},append(){},addEventListener(){}}),createTextNode:()=>({})},overlay={append(){}},onSelect=()=>{};
 const propGroup=new THREE.Group(),vehicleGroup=new THREE.Group(),effectsGroup=new THREE.Group(),contextGroup=new THREE.Group(),overheadGroup=new THREE.Group(),samplingEquipment=new Map(),entityRoots=new Map(),particleTexture=new THREE.Texture();
 let rover,roverAdapter,tether,halo,roverBounds,fanRotors=[],vehicleLights=[],stationLabels=[],pickables=[],plumeSystems=[];
 ${names.map(extractFunction).join('\n')}
 buildVehicle();const rng=randomFrom((data.seed||1)+71);data.entities.forEach((entity,index)=>createStation(entity,index,rng));
 const texture=new THREE.Texture(),context=createSeabedContext({entities:data.entities,toWorld,heightAt,texture,random:randomFrom((data.seed||1)+808)});contextGroup.add(context.group);
 const landing=toWorld(data.entities[0].position),surface=[landing.x-78,430,landing.z+32],vessel=createResearchVessel({position:surface});overheadGroup.add(vessel.group);
 return {rover,roverAdapter,propGroup,contextGroup,overheadGroup,vessel,surface,texture,samplingEquipment};
}
export function cameraGuard(cameraWorld,rover,profile){
 const camera=new THREE.PerspectiveCamera(54,1,.5,2500),controls={target:rover.position.clone()},cameraProfile={min:{x:-3,y:-3,z:-3},max:{x:3,y:3,z:3}},directorActive=false,learningWorld={isActive:()=>false},pilotActive=true;
 const vehicleCameraWorld=createCollisionWorld({heightAt:()=>-10000,bounds:{minX:-10000,maxX:10000,minZ:-10000,maxZ:10000},ceiling:10000,colliders:[profile]});let lastSafeCamera=null,cameraCut=true,pilotCamera='orbit';
 ${extractFunction('protectCamera')}
 return {run(from,to,mode='orbit'){camera.position.copy(to);lastSafeCamera=from?new THREE.Vector3().copy(from):null;cameraCut=!from;pilotCamera=mode;protectCamera();return camera.position.clone();}};
}
export function scriptedDriver(scriptedWorld,rover,ROV_COLLISION_PROFILE,centreBounds,start){
 const learningWorld={isActive:()=>false};let lastSafeVehicle=start;
 ${extractFunction('protectScriptedVehicle')}
 return {step(desired,dt,cut=false){rover.position.copy(desired.position);rover.rotation.y=-desired.heading;protectScriptedVehicle(dt,{cut});return {position:{x:rover.position.x,y:rover.position.y,z:rover.position.z},heading:-rover.rotation.y};}};
}
export function stageDriver(data,heightAt,surfaceSite){
 const mission=data,SIZE=620,telemetry=data.frames[0],directorActive=true,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));let directorFrame={framing:'establishing',progress:0};
 ${['toWorld','vehicleLocation','stagedVehicleLocation'].map(extractFunction).join('\n')}
 return progress=>{directorFrame.progress=progress;return stagedVehicleLocation();};
}`;
let fixture,cameraGuard,scriptedDriver,stageDriver;try{({fixture,cameraGuard,scriptedDriver,stageDriver}=await import('data:text/javascript;base64,'+Buffer.from(harness).toString('base64')));}catch(error){throw new Error('Scene CPU harness: '+error.message);}
const centreBounds={minX:-580+radius,maxX:580-radius,minZ:-580+radius,maxZ:580-radius},at=(x,y,z,heading=0)=>({position:{x,y,z},heading});
const result=[],originalTextureLoad=THREE.TextureLoader.prototype.load;THREE.TextureLoader.prototype.load=function(){return new THREE.Texture();};
function assertRealVertices(rover,heightAt,pose){rover.position.copy(pose.position);rover.rotation.set(0,-pose.heading,0);rover.updateMatrixWorld(true);let count=0;rover.traverse(object=>{if(!object.isMesh)return;for(let i=0;i<object.geometry.attributes.position.count;i++){const p=new THREE.Vector3().fromBufferAttribute(object.geometry.attributes.position,i).applyMatrix4(object.matrixWorld);assert.ok(p.y>=heightAt(p.x,p.z)-1e-5,'A restored physical ROV vertex intersects terrain');count++;}});return count;}
try{
  for(const missionId of ['vents','canyon']){
    const mission=JSON.parse(await readFile(new URL(`../web/data/${missionId}.json`,import.meta.url),'utf8')),terrain=terrainModule.buildBathymetry(mission),heightAt=terrain.heightAt,scene=fixture(mission,heightAt);
    const colliders=[...snapshotSolidColliders(scene.propGroup,{filter:object=>!scene.samplingEquipment.has(object.userData.entityId)}),...snapshotSolidColliders(scene.contextGroup),...snapshotSolidColliders(scene.overheadGroup,{padding:6})];for(const equipment of scene.samplingEquipment.values())colliders.push(...snapshotSolidColliders(equipment,{padding:2}));
    const world=createCollisionWorld({heightAt,bounds:{minX:-580,maxX:580,minZ:-580,maxZ:580},ceiling:414,colliders}),scripted=createCollisionWorld({heightAt,bounds:{minX:-580,maxX:580,minZ:-580,maxZ:580},ceiling:480,colliders}),triangles=[];
    terrain.group.traverse(o=>{if(o.isMesh&&o.geometry.attributes.position.count<100000)triangles.push({positions:o.geometry.attributes.position.array,index:o.geometry.index?.array});});
    const cameraWorld=createCollisionWorld({heightAt,bounds:{minX:-1900,maxX:1900,minZ:-1900,maxZ:1900},ceiling:1800,colliders,terrainGeometries:triangles}),first=mission.frames[0],x=(first.position[0]-.5)*620+22,z=(first.position[1]-.5)*620+26;
    const initial=world.resolveRestoredPose(at(x,heightAt(x,z)+23,z),profile,{centreBounds,maxPushout:64});assert.ok(initial.valid&&world.isPoseClear(initial,profile));
    const controller=createPilotController({bounds:{minX:-580,maxX:580,minZ:-580,maxZ:580},ceiling:414,minClearance:18,heightAt,bodyRadius:radius,terrainEnvelope:({x,z,heading})=>world.minimumYAt(x,z,heading,profile),isPoseBlocked:pose=>world.isBlockedBySolids(pose,profile),startPose:{position:initial.position,heading:initial.heading}});
    function restore(requested){const previous=controller.getState(),fallbackPose={position:{...previous.position},heading:previous.heading},candidate={position:{...requested.position,y:Math.min(414,requested.position.y)},heading:requested.heading};let safe=world.resolveRestoredPose(candidate,profile,{centreBounds,maxPushout:64,fallbackPose});
      for(let pass=0;pass<3&&safe.valid;pass++){const minimum=heightAt(safe.position.x,safe.position.z)+18;if(safe.position.y>=minimum-1e-7)break;safe=world.resolveRestoredPose({position:{...safe.position,y:minimum},heading:safe.heading},profile,{centreBounds,maxPushout:64,fallbackPose});}
      assert.ok(safe.valid&&world.isPoseClear(safe,profile));controller.setPose({position:safe.position,heading:safe.heading});const pose=controller.getState();assert.ok(world.isPoseClear(pose,profile));assert.ok(pose.position.x>=centreBounds.minX-1e-6&&pose.position.x<=centreBounds.maxX+1e-6&&pose.position.z>=centreBounds.minZ-1e-6&&pose.position.z<=centreBounds.maxZ+1e-6);return pose;
    }
    let vertices=0,legacy=[],currentSafe=null;
    for(const heading of [2.779,0,-Math.PI/2]){const original=at(170.6,-205.3,204.6,heading),safe=restore(original);if(heading===2.779)currentSafe=safe;vertices+=assertRealVertices(scene.rover,heightAt,safe);legacy.push({heading,shift:Number(Math.hypot(safe.position.x-original.position.x,safe.position.z-original.position.z).toFixed(2)),lift:Number((safe.position.y-original.position.y).toFixed(2))});}
    for(const [bx,bz] of [[580,0],[-580,0],[0,580],[0,-580],[580,580],[-580,-580]])vertices+=assertRealVertices(scene.rover,heightAt,restore(at(bx,130,bz,Math.PI/3)));
    const surfacePose={position:{x:scene.vessel.deployment.x,y:scene.vessel.deployment.y,z:scene.vessel.deployment.z},heading:1.95},scriptStart=scripted.resolveRestoredPose(surfacePose,profile,{centreBounds,maxPushout:32,fallbackPose:initial});assert.ok(scriptStart.valid);const pilotFromSurface=restore(surfacePose);assert.ok(pilotFromSurface.position.y<=414);
    const box={min:{x:-3,y:-3,z:-3},max:{x:3,y:3,z:3}};let cameras=0;
    for(const requested of [{x:134,y:-162,z:271},{x:220,y:-162,z:190},{x:scene.surface[0]+100,y:500,z:scene.surface[2]-160}]){const fixed=cameraWorld.clampSweep(requested,requested,3);assert.ok(fixed.valid&&cameraWorld.isPoseClear({position:fixed.position,heading:0},box));cameras++;}
    scene.rover.position.copy(currentSafe.position);scene.rover.rotation.set(0,-currentSafe.heading,0);scene.rover.updateMatrixWorld(true);
    const guard=cameraGuard(cameraWorld,scene.rover,profile),selfWorld=createCollisionWorld({heightAt:()=>-10000,bounds:{minX:-10000,maxX:10000,minZ:-10000,maxZ:10000},ceiling:10000,colliders:[profile]}),local=point=>{const c=Math.cos(currentSafe.heading),s=Math.sin(currentSafe.heading),x=point.x-currentSafe.position.x,z=point.z-currentSafe.position.z;return {x:c*x+s*z,y:point.y-currentSafe.position.y,z:-s*x+c*z};};
    for(const destination of [scene.rover.position.clone(),scene.rover.localToWorld(new THREE.Vector3(0,2,-10)),scene.rover.position.clone().add(new THREE.Vector3(2,2,2))]){const camera=guard.run(null,destination);assert.ok(cameraWorld.isPoseClear({position:camera,heading:0},box));assert.ok(!selfWorld.isBlockedBySolids({position:local(camera),heading:0},box),'Final external camera guard left the camera inside the vehicle');cameras++;}
    const cockpit=scene.rover.localToWorld(new THREE.Vector3(0,8,-16)),cockpitCamera=guard.run(null,cockpit,'cockpit');assert.ok(cameraWorld.isPoseClear({position:cockpitCamera,heading:0},box));cameras++;
    const driver=scriptedDriver(scripted,scene.rover,profile,centreBounds,initial),stage=stageDriver(mission,heightAt,{position:new THREE.Vector3(...scene.surface),deployment:scene.vessel.deployment}),bottom=stage(1);let opening;
    for(let i=0;i<=1200;i++){const position=stage(i/1200),subject=mission.entities[0].position,subjectX=(subject[0]-.5)*620,subjectZ=(subject[1]-.5)*620,heading=Math.atan2(subjectX-position.x,position.z-subjectZ);opening=driver.step({position,heading},20/1200,i===0);assert.ok(scripted.isPoseClear(opening,profile));}
    const paused=driver.step({position:bottom,heading:0},0);assert.deepEqual(paused,opening,'Paused scripted protection changed the vehicle');assert.ok(opening.position.y<430,`${missionId}: opening stayed above water: ${JSON.stringify(opening)}`);
    function containsSnapshot(base,current){for(const box of current){const original=base.get(box.id);assert.ok(original,'Animated collider changed identity');for(const axis of ['x','y','z'])assert.ok(box.min[axis]>=original.min[axis]-2e-5&&box.max[axis]<=original.max[axis]+2e-5,'Animated solid left its conservative padding');}}
    let samplerStates=0;for(const equipment of scene.samplingEquipment.values()){const base=new Map(snapshotSolidColliders(equipment,{padding:2}).map(box=>[box.id,box]));for(let i=0;i<=100;i++){equipment.userData.setSamplingProgress?.(i/100);containsSnapshot(base,snapshotSolidColliders(equipment));samplerStates++;}}
    const vesselBase=new Map(snapshotSolidColliders(scene.overheadGroup,{padding:6}).map(box=>[box.id,box]));for(let i=0;i<=100;i++){scene.vessel.update(i/100*Math.PI*2/.28);containsSnapshot(vesselBase,snapshotSolidColliders(scene.overheadGroup));}
    controller.destroy();result.push({mission:missionId,solidMeshes:colliders.length,legacy,physicalVerticesChecked:vertices,cameraCases:cameras,surfaceTakeover:true,samplerStates,radarStates:101,openingFinalY:Number(opening.position.y.toFixed(1)),scriptedSurface:{shift:Number(Math.hypot(scriptStart.position.x-surfacePose.position.x,scriptStart.position.z-surfacePose.position.z).toFixed(1)),height:Number(scriptStart.position.y.toFixed(1))}});
  }
}finally{THREE.TextureLoader.prototype.load=originalTextureLoad;}
console.log(JSON.stringify({passed:true,missions:result}));
