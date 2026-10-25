// Real GLB, skeleton and skinned sole review. No browser / GPU, no asset edits.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {register} from 'node:module';
import assert from 'node:assert/strict';
const root=new URL('../',import.meta.url),web=new URL('web/',root);
const threeURL=new URL('vendor/three/build/three.module.min.js',web).href,addonsURL=new URL('vendor/three/examples/jsm/',web).href;
register('data:text/javascript,'+encodeURIComponent(`export async function resolve(s,c,n){if(s==='three')return{url:${JSON.stringify(threeURL)},shortCircuit:true};if(s.startsWith('three/addons/'))return{url:${JSON.stringify(addonsURL)}+s.slice(13),shortCircuit:true};return n(s,c);}`),import.meta.url);
const THREE=await import(threeURL),{GLTFLoader}=await import(new URL('vendor/three/examples/jsm/loaders/GLTFLoader.js',web));
globalThis.ProgressEvent??=class ProgressEvent{constructor(type,values){this.type=type;Object.assign(this,values);}};
GLTFLoader.prototype.loadAsync=async function(url){
 const bytes=await readFile(new URL(url)),size=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+size).toString()),offset=20+size,binSize=bytes.readUInt32LE(offset);
 json.buffers[0].uri='data:application/octet-stream;base64,'+bytes.subarray(offset+8,offset+8+binSize).toString('base64');
 delete json.images;delete json.textures;delete json.materials;delete json.samplers;
 for(const mesh of json.meshes)for(const primitive of mesh.primitives)delete primitive.material;
 return this.parseAsync(JSON.stringify(json),'');
};
const actorFile=process.argv[2]??'cat-a-actor-v2.js';
const {createCat}=await import(new URL(actorFile,web));
const cat=await createCat(THREE);cat.update(0,{reset:true,speed:0,sampleHeight:()=>0});
const body=cat.object.getObjectByName('Cat');
const watch=['Head','Neck','Spine.002','Spine.003','Tail.004','Tail.007','Ear','Ear.006'];
const pawNames={frontL:'Toe_Pointer_L_front',frontR:'Toe_Pointer_L_front.002',rearL:'Toe_back_L_Pointer',rearR:'Toe_back_L_Pointer.002'};
const pawRoots={frontL:'Foot_front_L2',frontR:'Foot_front_L2.002',rearL:'Foot_Back_L',rearR:'Foot_Back_R'};
const bones=Object.fromEntries(body.skeleton.bones.map(b=>[b.name,b]));
for(const [name,bone] of Object.entries(bones))bones[name.replace(/_/g,'.')]=bone;
for(const expected of [...watch,...Object.values(pawNames),...Object.values(pawRoots)])if(!bones[expected])bones[expected]=body.skeleton.bones.find(b=>b.name===expected.replace(/\./g,''));
const updateWorld=()=>{cat.object.updateMatrixWorld(true);body.skeleton.update();};
const vertex=(i)=>body.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(body.matrixWorld);
updateWorld();
const rootSets=Object.fromEntries(Object.entries(pawRoots).map(([label,name])=>{const ids=new Set();bones[name].traverse(b=>{if(b.isBone)ids.add(body.skeleton.bones.indexOf(b));});return[label,ids];}));
const masks=Object.fromEntries(Object.keys(pawNames).map(k=>[k,[]]));
const weights=body.geometry.attributes.skinWeight,joints=body.geometry.attributes.skinIndex;
const chestIDs=new Set(['Spine.003','Spine.004'].map(name=>body.skeleton.bones.indexOf(bones[name]))),chestVertices=[];
for(let i=0;i<body.geometry.attributes.position.count;i++){
 let chestWeight=0;for(let c=0;c<4;c++)if(chestIDs.has(joints.getComponent(i,c)))chestWeight+=weights.getComponent(i,c);
 if(chestWeight>.2)chestVertices.push(i);
 for(const [label,ids] of Object.entries(rootSets)){
  let w=0;for(let c=0;c<4;c++)if(ids.has(joints.getComponent(i,c)))w+=weights.getComponent(i,c);
  if(w>.6)masks[label].push({i,y:vertex(i).y});
 }
}
for(const label in masks){
 const min=Math.min(...masks[label].map(p=>p.y));masks[label]=masks[label].filter(p=>p.y<min+.018).map(p=>p.i);
 assert.ok(masks[label].length>3,`${label} has real sole vertices`);
}
function snapshot(){
 updateWorld();return {
  bones:Object.fromEntries([...watch,...Object.values(pawNames)].map(name=>[name,{p:bones[name].getWorldPosition(new THREE.Vector3()).toArray(),q:bones[name].getWorldQuaternion(new THREE.Quaternion()).toArray()}])),
  soles:Object.fromEntries(Object.entries(masks).map(([label,ids])=>[label,ids.map(vertex).map(v=>v.toArray())])),
  chest:chestVertices.map(vertex).map(v=>v.toArray())
 };
}
const baseline=snapshot(),samples=[];let finite=true;
console.log('INITIAL_DEBUG',JSON.stringify(cat.getDebugState()));
for(let i=0;i<900;i++){
 cat.update(1/60,{speed:0,moving:false,hasIntent:false,turnRate:0,sampleHeight:()=>0});
 if(i%3===0){samples.push(snapshot());for(const b of body.skeleton.bones)finite&&=b.matrixWorld.elements.every(Number.isFinite);}
}
function stats(name){
 const ref=baseline.bones[name],qs=samples.map(s=>new THREE.Quaternion().fromArray(s.bones[name].q));
 const refq=new THREE.Quaternion().fromArray(ref.q);
 return {positionRangeM:[0,1,2].map(a=>Math.max(...samples.map(s=>s.bones[name].p[a]))-Math.min(...samples.map(s=>s.bones[name].p[a]))),maxRotationFromStartDegrees:Math.max(...qs.map(q=>refq.angleTo(q)))*180/Math.PI};
}
const pawReport={};
for(const [label,name] of Object.entries(pawNames)){
 let maxVertexDelta=0,minY=Infinity,maxY=-Infinity;
 for(const s of samples)for(let i=0;i<s.soles[label].length;i++){
  maxVertexDelta=Math.max(maxVertexDelta,new THREE.Vector3().fromArray(s.soles[label][i]).distanceTo(new THREE.Vector3().fromArray(baseline.soles[label][i])));
  minY=Math.min(minY,s.soles[label][i][1]);maxY=Math.max(maxY,s.soles[label][i][1]);
 }
 pawReport[label]={bone:stats(name),soleVertices:masks[label].length,maxVertexDisplacementM:maxVertexDelta,soleRangeY:[minY,maxY]};
}
let chestMeshDisplacement=0;
for(const sample of samples)for(let i=0;i<sample.chest.length;i++)chestMeshDisplacement=Math.max(chestMeshDisplacement,new THREE.Vector3().fromArray(sample.chest[i]).distanceTo(new THREE.Vector3().fromArray(baseline.chest[i])));
const report={actor:actorFile,seconds:15,sampleCount:samples.length,finite,debug:cat.getDebugState(),chest:{vertices:chestVertices.length,maxActualSkinDisplacementM:chestMeshDisplacement},
 upperBody:Object.fromEntries(watch.map(name=>[name,stats(name)])),paws:pawReport,
 interpretation:'Bone and actual skinned lower-foot vertices sampled from shipped GLB. Measures liveness and planted idle stability, not subjective realism or full turn-foot locking.'};
const out=new URL('artifacts/cat-a-street-v2/',root);await mkdir(out,{recursive:true});
await writeFile(new URL(actorFile.includes('v2')?'idle-liveness-review.json':'idle-liveness-baseline.json',out),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
assert.ok(finite,'Skeleton stays finite');
if(actorFile.includes('v2')){
 assert.ok(report.upperBody.Head.maxRotationFromStartDegrees>.5,'Head actually moves in world space during idle');
 assert.ok(report.chest.maxActualSkinDisplacementM>.0001,'Chest mesh actually breathes');
 assert.ok(Object.values(pawReport).every(p=>p.maxVertexDisplacementM<.004),'Idle sole meshes stay within 4 mm');
 const stopResults=[];
 for(const requestedSpeed of [.48,1.65]) {
  cat.object.position.set(0,0,0);cat.object.rotation.y=0;
  cat.update(0,{reset:true,speed:0,sampleHeight:()=>0});
  let speed=0,maxCorrection=0,maxFootFrameStep=0,finiteBones=true,previousFeet=null,peakFoot=null,maxIdleCorrection=0;
  const modeFrames={};
  for(let frame=0;frame<420;frame++) {
   const active=frame<180,dt=1/60,targetSpeed=active?requestedSpeed:0;
   speed+=Math.sign(targetSpeed-speed)*Math.min(Math.abs(targetSpeed-speed),(active?1.35:1.8)*dt);
   cat.object.position.z+=speed*dt;
   cat.update(dt,{speed,moving:speed>.001,desiredSpeed:targetSpeed,hasIntent:active,turnRate:0,sampleHeight:()=>0});
   updateWorld();const state=cat.getDebugState(),feet=Object.fromEntries(Object.entries(pawNames).map(([label,name])=>[label,bones[name].getWorldPosition(new THREE.Vector3())]));
   modeFrames[state.gait.mode]=(modeFrames[state.gait.mode]||0)+1;
   if(frame>=180) {
    maxCorrection=Math.max(maxCorrection,state.footCorrectionMax||0);
    if(state.gait.mode==='idle')maxIdleCorrection=Math.max(maxIdleCorrection,state.footCorrectionMax||0);
    if(previousFeet)for(const label in feet) {
     const step=feet[label].distanceTo(previousFeet[label]);
     if(step>maxFootFrameStep){maxFootFrameStep=step;peakFoot={label,frame,mode:state.gait.mode};}
    }
   }
   for(const bone of body.skeleton.bones)finiteBones&&=bone.matrixWorld.elements.every(Number.isFinite);
   previousFeet=feet;
  }
  stopResults.push({requestedSpeed,maxCorrectionM:maxCorrection,maxIdleCorrectionM:maxIdleCorrection,maxFootFrameStepM:maxFootFrameStep,peakFoot,modeFrames,finiteBones});
 }
 await writeFile(new URL('stop-actual-rig-review.json',out),JSON.stringify(stopResults,null,2));
 console.log('STOP_ACTUAL_RIG',JSON.stringify(stopResults));
}
cat.dispose();
