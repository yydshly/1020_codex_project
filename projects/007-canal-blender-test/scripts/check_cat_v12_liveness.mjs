// Real GLB / bone-transformed sole and sustained-motion audit. No GPU.
import {readFile,writeFile} from 'node:fs/promises';
import {register} from 'node:module';
import {createHash} from 'node:crypto';
const project=new URL('../',import.meta.url),web=new URL('web/',project);
const threeURL=new URL('vendor/three/build/three.module.min.js',web).href,addonsURL=new URL('vendor/three/examples/jsm/',web).href;
register('data:text/javascript,'+encodeURIComponent(`export async function resolve(s,c,n){if(s==='three')return{url:${JSON.stringify(threeURL)},shortCircuit:true};if(s.startsWith('three/addons/'))return{url:${JSON.stringify(addonsURL)}+s.slice(13),shortCircuit:true};return n(s,c);}`),import.meta.url);
const THREE=await import(threeURL),{GLTFLoader}=await import(new URL('vendor/three/examples/jsm/loaders/GLTFLoader.js',web));
globalThis.ProgressEvent??=class ProgressEvent{constructor(type,values){this.type=type;Object.assign(this,values);}};
const nativeFetch=globalThis.fetch;
globalThis.fetch=async(resource,options)=>{const url=resource instanceof URL?resource:new URL(typeof resource==='string'?resource:resource.url);return url.protocol==='file:'?new Response(await readFile(url)):nativeFetch(resource,options);};
GLTFLoader.prototype.loadAsync=async function(url){
 const bytes=await readFile(new URL(url)),size=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+size).toString()),offset=20+size,binSize=bytes.readUInt32LE(offset);
 json.buffers[0].uri='data:application/octet-stream;base64,'+bytes.subarray(offset+8,offset+8+binSize).toString('base64');
 delete json.images;delete json.textures;delete json.materials;delete json.samplers;
 for(const mesh of json.meshes)for(const primitive of mesh.primitives)delete primitive.material;
 const loaded=await this.parseAsync(JSON.stringify(json),'');loaded.scene.traverse(n=>{if(n.isMesh)n.material.map=new THREE.Texture();});return loaded;
};
const {createCat:createV11}=await import(new URL('cat-v11.js',web)),{createCat:createV12}=await import(new URL('cat-v12.js',web));
const metadata=JSON.parse(await readFile(new URL('models/cat-v3-rig.json',web),'utf8'));
const sha=b=>createHash('sha256').update(b).digest('hex');
const files=['cat-v11.js','cat-v12.js','cat-v12-body.js','cat-v12-face.js','cat-v12-base.js','models/cat-v3-rig.glb'];
const hashes=async()=>Object.fromEntries(await Promise.all(files.map(async p=>[p,sha(await readFile(new URL(p,web)))])));
const before=await hashes(),checks={},results=[],rad=Math.PI/180;
const names=['spine','chest','neck','head','tail_01','tail_02','tail_03','tail_04'];
const quaternionAngle=(a,b)=>new THREE.Quaternion().fromArray(a).normalize().angleTo(new THREE.Quaternion().fromArray(b).normalize());
function inspect(cat){
 const bones=new Map();let body,triangles=0;
 cat.object.traverse(n=>{if(n.isBone)bones.set(n.name,n);if(n.isMesh)triangles+=(n.geometry.index?.count??n.geometry.attributes.position.count)/3;if(n.isSkinnedMesh&&!body)body=n;});
 const pawIds=Object.fromEntries(Object.keys(metadata.legs).map(k=>[k,body.skeleton.bones.indexOf(bones.get(k+'_paw'))]));
 const rig={cat,bones,body,triangles,positionsHash:sha(body.geometry.attributes.position.array),previousFeet:{},stats:{maxReach:0,maxTargetError:0,maxStanceSlip:0,maxGroundError:0,maxContactJump:0,finite:true,minTailY:Infinity,maxHeadStep:0,maxTailStep:0},previousPose:null};
 rig.pose=()=>{
  cat.object.updateMatrixWorld(true);body.skeleton.update();
  const inverse=cat.object.getWorldQuaternion(new THREE.Quaternion()).invert(),qs={},points={};
  for(const name of names){qs[name]=bones.get(name).getWorldQuaternion(new THREE.Quaternion()).premultiply(inverse).normalize().toArray();points[name]=cat.object.worldToLocal(bones.get(name).getWorldPosition(new THREE.Vector3())).toArray();}
  const b=bones.get('tail_04'),i=body.skeleton.bones.indexOf(b),tip=new THREE.Vector3().fromArray(metadata.bones.tail_04.tail).applyMatrix4(body.bindMatrix).applyMatrix4(body.skeleton.boneInverses[i]).applyMatrix4(b.matrixWorld);
  return {qs,points,tip:cat.object.worldToLocal(tip).toArray()};
 };
 rig.measure=()=>{
  const state=cat.getDebugState(),pose=rig.pose(),s=rig.stats;
  s.maxReach=Math.max(s.maxReach,state.gait.maxReachError);s.minTailY=Math.min(s.minTailY,pose.tip[1],...names.filter(n=>n.startsWith('tail')).map(n=>pose.points[n][1]));
  for(const bone of bones.values())s.finite&&=bone.matrixWorld.elements.every(Number.isFinite);
  if(rig.previousPose){s.maxHeadStep=Math.max(s.maxHeadStep,quaternionAngle(pose.qs.head,rig.previousPose.qs.head));s.maxTailStep=Math.max(s.maxTailStep,new THREE.Vector3().fromArray(pose.tip).distanceTo(new THREE.Vector3().fromArray(rig.previousPose.tip)));}rig.previousPose=pose;
  for(const f of state.feet){
   const actual=new THREE.Vector3().fromArray(metadata.legs[f.name].sole).applyMatrix4(body.bindMatrix).applyMatrix4(body.skeleton.boneInverses[pawIds[f.name]]).applyMatrix4(bones.get(f.name+'_paw').matrixWorld),target=new THREE.Vector3().fromArray(f.world),last=rig.previousFeet[f.name];
   const error=actual.distanceTo(target);if(error>s.maxTargetError){s.maxTargetError=error;s.worstTarget={foot:f.name,actual:actual.toArray(),target:target.toArray(),reach:f.reachError};}
   if(f.stance){s.maxGroundError=Math.max(s.maxGroundError,Math.abs(actual.y));if(last?.stance)s.maxStanceSlip=Math.max(s.maxStanceSlip,Math.hypot(actual.x-last.actual.x,actual.z-last.actual.z));else if(last)s.maxContactJump=Math.max(s.maxContactJump,actual.distanceTo(last.actual));}
   rig.previousFeet[f.name]={actual,stance:f.stance};
  }
  return {pose,debug:{gait:state.gait,attention:state.attention,upperBody:state.upperBody,secondaryMotion:state.secondaryMotion}};
 };
 return rig;
}
function ranges(samples){
 const out={samples:samples.length,bones:{},tip:[]};
 for(const name of names){const first=new THREE.Quaternion().fromArray(samples[0].pose.qs[name]),inverse=first.clone().invert(),angles=[[],[],[]];
  for(const s of samples){const q=new THREE.Quaternion().fromArray(s.pose.qs[name]).multiply(inverse).normalize(),e=new THREE.Euler().setFromQuaternion(q,'YXZ');[e.x,e.y,e.z].forEach((v,i)=>angles[i].push(v));}
  out.bones[name]={rotationDegrees:angles.map(a=>(Math.max(...a)-Math.min(...a))/rad),positionMetres:[0,1,2].map(i=>{const a=samples.map(s=>s.pose.points[name][i]);return Math.max(...a)-Math.min(...a);})};
 }
 out.tip=[0,1,2].map(i=>{const a=samples.map(s=>s.pose.tip[i]);return Math.max(...a)-Math.min(...a);});
 return out;
}
const segments=[{name:'idle',seconds:4,speed:0,yaw:0},{name:'walk',seconds:5,speed:.36,yaw:0},{name:'run',seconds:5,speed:.9,yaw:0},{name:'left',seconds:2,speed:.36,yaw:-.65},{name:'right',seconds:2,speed:.36,yaw:.65},{name:'brake',seconds:1.5,speed:0,yaw:0},{name:'settled',seconds:4,speed:0,yaw:0}];
for(const rates of [[1/60],[1/30],[.0166,.0167,.0168,.0155,.018,.0333,.0083]]){
 const previous=await createV11(THREE),current=await createV12(THREE),old=inspect(previous),next=inspect(current),samples={},oldSamples={};
 let t=0,speed=0,frame=0;
 for(const segment of segments){samples[segment.name]=[];oldSamples[segment.name]=[];let local=0;
  while(local<segment.seconds-1e-9){const dt=Math.min(rates[frame++%rates.length],segment.seconds-local);local+=dt;t+=dt;
   speed+=Math.sign(segment.speed-speed)*Math.min(Math.abs(segment.speed-speed),(segment.speed>speed?1:1.8)*dt);
   for(const cat of [previous,current]){cat.object.rotation.y+=segment.yaw*dt;cat.object.position.x+=Math.sin(cat.object.rotation.y)*speed*dt;cat.object.position.z+=Math.cos(cat.object.rotation.y)*speed*dt;cat.update(dt,{time:t,speed,moving:speed>.001,lookAheadYaw:Math.sign(segment.yaw)*.28,sampleHeight:()=>0});}
   const a=old.measure(),b=next.measure();
   if(local>segment.seconds-Math.min(2.6,segment.seconds*.65)){samples[segment.name].push(b);oldSamples[segment.name].push(a);}
  }
 }
 const summary=Object.fromEntries(segments.map(s=>[s.name,ranges(samples[s.name])])),baseline=Object.fromEntries(segments.map(s=>[s.name,ranges(oldSamples[s.name])])),tag=rates.length>1?'jitter':`${Math.round(1/rates[0])}fps`;
 checks[tag+'_finite']=next.stats.finite;
 checks[tag+'_topology_unchanged']=next.triangles===51976&&next.positionsHash===old.positionsHash;
 checks[tag+'_reach_bounded']=next.stats.maxReach<.015;
 checks[tag+'_actual_paw_targets']=next.stats.maxTargetError<.015;
 checks[tag+'_support_slip_under_2mm']=next.stats.maxStanceSlip<.002;
 checks[tag+'_support_clearance_under_15mm']=next.stats.maxGroundError<.015;
 checks[tag+'_contact_jump_under_15mm']=next.stats.maxContactJump<.015;
 checks[tag+'_reach_not_regressed']=next.stats.maxReach<=old.stats.maxReach+.004;
 checks[tag+'_foot_target_not_regressed']=next.stats.maxTargetError<=old.stats.maxTargetError+.004;
 checks[tag+'_tail_clear_of_ground']=next.stats.minTailY>.06;
 checks[tag+'_head_no_pop']=next.stats.maxHeadStep<.18;
 checks[tag+'_tail_no_pop']=next.stats.maxTailStep<.045;
 for(const mode of ['walk','run']){
  const r=summary[mode],b=baseline[mode];
  checks[tag+'_'+mode+'_sustained_head_motion']=Math.max(...r.bones.head.rotationDegrees)>.8;
  checks[tag+'_'+mode+'_sustained_chest_motion']=Math.max(...r.bones.chest.rotationDegrees)>1.0;
  checks[tag+'_'+mode+'_sustained_tail_motion']=Math.max(...r.tip)>.004;
  checks[tag+'_'+mode+'_head_livelier_than_v11']=Math.max(...r.bones.head.rotationDegrees)>Math.max(...b.bones.head.rotationDegrees)+.4;
  checks[tag+'_'+mode+'_body_motion_restrained']=Math.max(...r.bones.chest.rotationDegrees,...r.bones.spine.rotationDegrees)<12;
 }
 checks[tag+'_idle_breathing']=Math.max(...summary.idle.bones.chest.rotationDegrees)>.1||Math.max(...summary.idle.bones.chest.positionMetres)>.0005;
 const hold=(seconds)=>{for(let i=0;i<Math.ceil(seconds*60);i++){t+=1/60;current.update(1/60,{time:t,speed:0,moving:false,sampleHeight:()=>0});}return next.pose();};
 current.setAttention({enabled:true,yaw:-6,pitch:0});const left=hold(1.2);current.setAttention({enabled:true,yaw:6,pitch:0});const right=hold(1.2);current.setAttention({enabled:true,yaw:0,pitch:0});const straight=hold(1.2);current.setAttention({enabled:true,yaw:0,pitch:3});const down=hold(1.2);current.setAttention({enabled:true,mode:'natural'});hold(.5);
 checks[tag+'_manual_head_controls']=quaternionAngle(left.qs.head,right.qs.head)>.08&&quaternionAngle(straight.qs.head,down.qs.head)>.015;
 checks[tag+'_natural_restored']=current.getDebugState().attention.mode==='natural';
 current.update(0,{reset:true,time:0});const reset1=next.pose();current.update(0,{reset:true,time:0});const reset2=next.pose();
 checks[tag+'_reset_idempotent']=names.every(n=>quaternionAngle(reset1.qs[n],reset2.qs[n])<1e-6)&&new THREE.Vector3().fromArray(reset1.tip).distanceTo(new THREE.Vector3().fromArray(reset2.tip))<1e-6;
 results.push({tag,frames:frame,current:next.stats,baselineStats:old.stats,summary,baseline,finalDebug:samples.settled.at(-1).debug});previous.dispose();current.dispose();
}
const after=await hashes();checks.runtime_frozen=JSON.stringify(before)===JSON.stringify(after);checks.source_asset_unchanged=before['models/cat-v3-rig.glb']==='6c8d0f0133805e0727cc6cdfc558456d670e0d33a5158685084413e7786a77f1';
for(const mode of ['walk','run']){
 const variation=get=>{const values=results.map(get);return Math.max(...values)-Math.min(...values);};
 checks[mode+'_frame_rate_head_range_agrees']=variation(r=>Math.max(...r.summary[mode].bones.head.rotationDegrees))<.6;
 checks[mode+'_frame_rate_chest_range_agrees']=variation(r=>Math.max(...r.summary[mode].bones.chest.rotationDegrees))<.6;
 checks[mode+'_frame_rate_tail_range_agrees']=variation(r=>Math.max(...r.summary[mode].tip))<.008;
}
const report={checkedAt:new Date().toISOString(),passed:Object.values(checks).every(Boolean),checks,failed:Object.entries(checks).filter(([,v])=>!v).map(([k])=>k),before,after,results,scope:'Actual bones and sole anchors at 30/60/jitter; flat-ground scene. Steady-motion floors are review criteria, not measured animal kinematics; visual realism still requires watching rendered motion.'};
await writeFile(new URL('assets/cat-v12-liveness-audit.json',project),JSON.stringify(report,null,2));
console.log(JSON.stringify({passed:report.passed,failed:report.failed,checks:Object.keys(checks).length,results:results.map(r=>({tag:r.tag,current:r.current,baselineStats:r.baselineStats,walk:r.summary.walk,run:r.summary.run,idle:r.summary.idle}))},null,2));process.exitCode=report.passed?0:1;
