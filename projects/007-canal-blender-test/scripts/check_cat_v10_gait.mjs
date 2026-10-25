// CPU-only audit: actual preserved GLB, no GPU or changes to source assets.
import {readFile, writeFile} from 'node:fs/promises';
import {register} from 'node:module';
import {createHash} from 'node:crypto';
const project = new URL('../',import.meta.url), web = new URL('web/',project);
const threeURL = new URL('vendor/three/build/three.module.min.js',web).href;
const addonsURL = new URL('vendor/three/examples/jsm/',web).href;
register('data:text/javascript,'+encodeURIComponent(`export async function resolve(s,c,n){if(s==='three')return{url:${JSON.stringify(threeURL)},shortCircuit:true};if(s.startsWith('three/addons/'))return{url:${JSON.stringify(addonsURL)}+s.slice(13),shortCircuit:true};return n(s,c);}`),import.meta.url);
const THREE = await import(threeURL);
const {GLTFLoader} = await import(new URL('vendor/three/examples/jsm/loaders/GLTFLoader.js',web));
globalThis.ProgressEvent ??= class ProgressEvent {constructor(type,values){this.type=type;Object.assign(this,values);}};
const nativeFetch=globalThis.fetch;
globalThis.fetch=async(resource,options)=>{const url=resource instanceof URL?resource:new URL(typeof resource==='string'?resource:resource.url);return url.protocol==='file:'?new Response(await readFile(url)):nativeFetch(resource,options);};
GLTFLoader.prototype.loadAsync=async function(url){
  const bytes=await readFile(new URL(url)),size=bytes.readUInt32LE(12);
  const json=JSON.parse(bytes.subarray(20,20+size).toString()),offset=20+size,binSize=bytes.readUInt32LE(offset);
  json.buffers[0].uri='data:application/octet-stream;base64,'+bytes.subarray(offset+8,offset+8+binSize).toString('base64');
  delete json.images;delete json.textures;delete json.materials;delete json.samplers;
  for(const mesh of json.meshes)for(const primitive of mesh.primitives)delete primitive.material;
  const loaded=await this.parseAsync(JSON.stringify(json),'');
  loaded.scene.traverse(node=>{if(node.isMesh)node.material.map=new THREE.Texture();});return loaded;
};



const {createCat}=await import(new URL('cat-v10.js',web));
const metadata=JSON.parse(await readFile(new URL('models/cat-v3-rig.json',web),'utf8'));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const sourceHash=await readFile(new URL('models/cat-v3-rig.glb',web)).then(sha);
const testedFiles=['cat-v10.js','cat-v10-face.js','cat-v10-body.js','cat-v10-motion.js','cat-v10-continuous-skin.js','cat-v10-thigh-skin.js','cat-v10-hind-restore.js','cat-v8-limb-skin.js','cat-v8-hock-rig.js'];
const hashes=async()=>Object.fromEntries(await Promise.all(testedFiles.map(async f=>[f,sha(await readFile(new URL(f,web)))])));
const sourcesBefore=await hashes();
const runs=[],checks={source_asset_unchanged:sourceHash==='6c8d0f0133805e0727cc6cdfc558456d670e0d33a5158685084413e7786a77f1'};
const desiredOrder=['hind_right','fore_right','hind_left','fore_left'];
const point=new THREE.Vector3();
for(const fps of [30,60])for(const requestedSpeed of [.36,.9]){
 const cat=await createCat(THREE);cat.setAttention({mode:'natural'});cat.setBlink({mode:'auto'});
 let body,lids;const bones=new Map();cat.object.traverse(n=>{if(n.isBone)bones.set(n.name,n);if(n.isSkinnedMesh){if(!body)body=n;else lids=n;}});
 const pos=body.geometry.attributes.position,vertices=Array.from({length:pos.count},(_,i)=>new THREE.Vector3().fromBufferAttribute(pos,i));
 const skinned=vertices.map(v=>v.clone()),indices=body.geometry.index,seen=new Set(),edges=[];
 for(let k=0;k<indices.count;k+=3){const tri=[indices.getX(k),indices.getX(k+1),indices.getX(k+2)];for(let e=0;e<3;e++){
  const a=tri[e],b=tri[(e+1)%3],key=a<b?`${a},${b}`:`${b},${a}`;if(seen.has(key))continue;seen.add(key);
  if(vertices[a].y>.27||vertices[b].y>.27||vertices[a].z>-.025||vertices[b].z>-.025)continue;
  const length=vertices[a].distanceTo(vertices[b]);if(length<.001)continue;edges.push({a,b,length});
 }}
 const regionIds=[...new Set(edges.flatMap(e=>[e.a,e.b]))];
 const pawIds=Object.fromEntries(Object.keys(metadata.legs).map(key=>[key,body.skeleton.bones.findIndex(b=>b.name===key+'_paw')]));
 const rawSoles=Object.fromEntries(Object.entries(metadata.legs).map(([key,value])=>[key,new THREE.Vector3().fromArray(value.sole)]));
 const run={fps,requestedSpeed,frames:0,maxReachError:0,maxActualTargetError:0,maxStanceSlip:0,maxPlannedStanceSlip:0,maxStanceGroundError:0,maxFootFrameJump:0,maxContactFrameJump:0,minActualClearance:Infinity,maxActualClearance:-Infinity,allFinite:true,contacts:[],cycles:{},worstGroin:{ratio:0},maxResetTargetError:0,blinkCount:0,supportCounts:{},minSteadySupport:4,bodyTriangles:indices.count/3,totalTriangles:indices.count/3+lids.geometry.index.count/3,failSamples:[],segments:{}};
 let velocity=0,time=0,previous={},frame=0;
 const dt=1/fps;
 const segments=[{name:'stand',seconds:1,speed:0,yaw:0},{name:'accelerate_and_walk',seconds:6,speed:requestedSpeed,yaw:0},{name:'walk_transition',seconds:2,speed:.36,yaw:0},{name:'run_transition',seconds:2,speed:requestedSpeed,yaw:0},{name:'decelerate_stop',seconds:1.2,speed:0,yaw:0},{name:'turn',seconds:1.2,speed:0,yaw:2.2},{name:'turn_stop',seconds:.8,speed:0,yaw:0},{name:'restart_walk',seconds:2,speed:requestedSpeed,yaw:0},{name:'final_stop',seconds:1.2,speed:0,yaw:0},{name:'reset',seconds:.5,speed:0,yaw:0,reset:true}];
 function finiteArray(values){return values.every(Number.isFinite);}
 for(const segment of segments){
  const segmentStats={maxReachError:0,maxTargetError:0,maxStanceSlip:0,maxGroundError:0,maxFrameJump:0};run.segments[segment.name]=segmentStats;
  for(let s=0;s<Math.round(segment.seconds*fps);s++){
   time+=dt;frame++;velocity+=Math.sign(segment.speed-velocity)*Math.min(Math.abs(segment.speed-velocity),(segment.speed>velocity?1.4:2.2)*dt);
   cat.object.rotation.y+=segment.yaw*dt;cat.object.position.x+=Math.sin(cat.object.rotation.y)*velocity*dt;cat.object.position.z+=Math.cos(cat.object.rotation.y)*velocity*dt;
   const reset=!!segment.reset&&s===0;if(reset){cat.object.position.set(2,0,-1);cat.object.rotation.y=-.7;previous={};}
   cat.update(dt,{speed:velocity,moving:velocity>.001,time,reset,sampleHeight:()=>0});
   const state=cat.getDebugState();body.skeleton.update();
   run.maxReachError=Math.max(run.maxReachError,state.gait.maxReachError);segmentStats.maxReachError=Math.max(segmentStats.maxReachError,state.gait.maxReachError);run.blinkCount=Math.max(run.blinkCount,state.blink.count);
   let actualSupport=0;
   for(const foot of state.feet){
    const actual=rawSoles[foot.name].clone().applyMatrix4(body.bindMatrix).applyMatrix4(body.skeleton.boneInverses[pawIds[foot.name]]).applyMatrix4(bones.get(foot.name+'_paw').matrixWorld);
    const planned=new THREE.Vector3().fromArray(foot.world),error=actual.distanceTo(planned),last=previous[foot.name];
    run.maxActualTargetError=Math.max(run.maxActualTargetError,error);segmentStats.maxTargetError=Math.max(segmentStats.maxTargetError,error);
    run.minActualClearance=Math.min(run.minActualClearance,actual.y);run.maxActualClearance=Math.max(run.maxActualClearance,actual.y);
    if(foot.stance&&Math.abs(actual.y)<.003)actualSupport++;
    if(foot.stance){run.maxStanceGroundError=Math.max(run.maxStanceGroundError,Math.abs(actual.y));segmentStats.maxGroundError=Math.max(segmentStats.maxGroundError,Math.abs(actual.y));}
    if(last&&!reset){
     const jump=actual.distanceTo(last.actual);if(jump>run.maxFootFrameJump)run.maxJumpSample={segment:segment.name,time,foot:foot.name,phase:foot.phase,previousStance:last.stance,stance:foot.stance,previous:last.actual.toArray(),actual:actual.toArray(),planned:planned.toArray()};run.maxFootFrameJump=Math.max(run.maxFootFrameJump,jump);segmentStats.maxFrameJump=Math.max(segmentStats.maxFrameJump,jump);
     if(foot.stance&&last.stance){const slip=Math.hypot(actual.x-last.actual.x,actual.z-last.actual.z),plannedSlip=Math.hypot(planned.x-last.planned.x,planned.z-last.planned.z);run.maxStanceSlip=Math.max(run.maxStanceSlip,slip);run.maxPlannedStanceSlip=Math.max(run.maxPlannedStanceSlip,plannedSlip);segmentStats.maxStanceSlip=Math.max(segmentStats.maxStanceSlip,slip);}
     if(foot.stance&&!last.stance){run.maxContactFrameJump=Math.max(run.maxContactFrameJump,jump);if(segment.name==='accelerate_and_walk'&&s>fps*2)run.contacts.push({foot:foot.name,time,actualY:actual.y,phase:state.gait.phase});}
    }
    if(error>.015&&run.failSamples.length<12)run.failSamples.push({segment:segment.name,time,foot:foot.name,actual:actual.toArray(),planned:planned.toArray(),error,reach:foot.reachError});
    if(reset)run.maxResetTargetError=Math.max(run.maxResetTargetError,error);
    run.allFinite&&=finiteArray(actual.toArray())&&finiteArray(planned.toArray());previous[foot.name]={actual,planned,stance:foot.stance};
   }
   if(segment.name==='accelerate_and_walk'&&s>fps*2){run.minSteadySupport=Math.min(run.minSteadySupport,actualSupport);run.supportCounts[actualSupport]=(run.supportCounts[actualSupport]||0)+1;}
   for(const bone of bones.values())run.allFinite&&=finiteArray(bone.matrixWorld.elements);
   if(frame%Math.max(1,Math.round(fps/10))===0){
    for(const id of regionIds)body.applyBoneTransform(id,skinned[id].copy(vertices[id]));
    for(const edge of edges){const ratio=skinned[edge.a].distanceTo(skinned[edge.b])/edge.length;if(ratio>run.worstGroin.ratio)run.worstGroin={...edge,ratio,time,segment:segment.name};}
    run.allFinite&&=finiteArray(lids.geometry.attributes.position.array)&&finiteArray(lids.geometry.attributes.skinWeight.array);
   }
   run.frames++;
  }
 }
 for(const key of desiredOrder){const times=run.contacts.filter(e=>e.foot===key).map(e=>e.time),periods=times.slice(1).map((v,i)=>v-times[i]);run.cycles[key]={count:times.length,meanSeconds:periods.reduce((a,b)=>a+b,0)/periods.length};}
 // Two contacts sampled in the same frame have no observable sub-frame order.
 const groups=[];for(const event of run.contacts){if(!groups.length||groups.at(-1)[0].time!==event.time)groups.push([]);groups.at(-1).push(event);}
 let possible=new Set([0,1,2,3]);
 for(const group of groups){const next=new Set();for(const start of possible){const expected=Array.from({length:group.length},(_,i)=>desiredOrder[(start+i)%4]);if(group.every(e=>expected.includes(e.foot))&&new Set(group.map(e=>e.foot)).size===group.length)next.add((start+group.length)%4);}possible=next;}
 run.contactOrderCorrect=possible.size>0;run.simultaneousContactGroups=groups.filter(group=>group.length>1).length;
 const tag=`${fps}fps_${requestedSpeed}mps`;
 checks[tag+'_finite']=run.allFinite;checks[tag+'_reachable']=run.maxReachError<.015;checks[tag+'_actual_paw_target_error']=run.maxActualTargetError<.015;
 checks[tag+'_stance_slip_under_2mm']=run.maxStanceSlip<.002;checks[tag+'_stance_clearance_under_15mm']=run.maxStanceGroundError<.015;
 checks[tag+'_contact_jump_under_15mm']=run.maxContactFrameJump<.015;checks[tag+'_reset_correct']=run.maxResetTargetError<.005;
 if(requestedSpeed<.5){checks[tag+'_contact_order']=run.contactOrderCorrect;checks[tag+'_at_least_two_steady_supports']=run.minSteadySupport>=2;}else{const paired=[],pairs=[['hind_right','fore_left'],['hind_left','fore_right']];for(const event of run.contacts){const last=paired.at(-1);if(last&&last.length===1&&event.time-last[0].time<=1/fps+1e-8&&pairs.some(p=>p.includes(last[0].foot)&&p.includes(event.foot)&&last[0].foot!==event.foot))last.push(event);else paired.push([event]);}const pairEvents=paired.slice(1,-1);run.diagonalPairs=pairEvents.filter(group=>pairs.some(pair=>group.length===2&&group.every(e=>pair.includes(e.foot)))).length;run.maxPairContactSkew=Math.max(0,...pairEvents.filter(g=>g.length===2).map(g=>g[1].time-g[0].time));run.contactGroups=pairEvents.map(g=>g.map(e=>e.foot));checks[tag+'_diagonal_support_pairs']=run.diagonalPairs===pairEvents.length;checks[tag+'_paired_contact_within_one_sample']=run.maxPairContactSkew<=1/fps+1e-8;checks[tag+'_aerial_interval']=run.supportCounts[0]>0;}checks[tag+'_geometry_count_unchanged']=run.bodyTriangles===49000&&run.totalTriangles===51976;checks[tag+'_blink_occurs']=run.blinkCount>0;
 runs.push(run);cat.dispose();
}
const sourcesAfter=await hashes();checks.runtime_frozen_during_check=JSON.stringify(sourcesBefore)===JSON.stringify(sourcesAfter);
checks.source_asset_still_unchanged=sourceHash===await readFile(new URL('models/cat-v3-rig.glb',web)).then(sha);
const supportedChecks=Object.entries(checks).filter(([name])=>!name.includes('_0.9mps_'));
const runChecks=Object.entries(checks).filter(([name])=>name.includes('_0.9mps_'));
const report={checkedAt:new Date().toISOString(),passed:Object.values(checks).every(Boolean),sourceAssetSha256:sourceHash,supportedRunning:{speeds:[.9],passed:runChecks.every(([,value])=>value),failed:runChecks.filter(([,value])=>!value).map(([name])=>name)},supportedWalking:{speeds:[.36],passed:supportedChecks.every(([,value])=>value),failed:supportedChecks.filter(([,value])=>!value).map(([name])=>name)},checks,failed:Object.entries(checks).filter(([,v])=>!v).map(([k])=>k),sourcesBefore,sourcesAfter,runs,scope:'Actual bone-transformed sole anchor checks, not only debug feet. Flat-ground tests; mesh skin silhouette still needs visual review. All speeds include acceleration, braking, stationary 2.2rad/s turning and reset.'};
await writeFile(new URL('assets/cat-v10-gait-check.json',project),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:report.passed,supportedWalking:report.supportedWalking,failed:report.failed,runs:runs.map(r=>({fps:r.fps,speed:r.requestedSpeed,reach:r.maxReachError,actualTarget:r.maxActualTargetError,stanceSlip:r.maxStanceSlip,ground:r.maxStanceGroundError,jump:r.maxFootFrameJump,contactJump:r.maxContactFrameJump,reset:r.maxResetTargetError,order:r.contactOrderCorrect,diagonalPairs:r.diagonalPairs,groups:r.contactGroups,support:r.supportCounts,groin:r.worstGroin}))},null,2));

process.exitCode=report.passed?0:1;
