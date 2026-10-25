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
const {createCat:createV10}=await import(new URL('cat-v10.js',web));
const metadata=JSON.parse(await readFile(new URL('models/cat-v3-rig.json',web),'utf8'));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const sourceHash=await readFile(new URL('models/cat-v3-rig.glb',web)).then(sha);
const boneNames=['head','neck','tail_01','tail_02','tail_03','tail_04'];
const bonePoint=new THREE.Vector3(),rootInverse=new THREE.Quaternion();
function inspect(cat) {
 const bones=new Map();let body,triangles=0;
 cat.object.traverse(n=>{if(n.isBone)bones.set(n.name,n);if(n.isMesh)triangles+=(n.geometry.index?.count??n.geometry.attributes.position.count)/3;if(n.isSkinnedMesh&&!body)body=n;});
 function tailPoint(name,end=false) {
  const b=bones.get(name),i=body.skeleton.bones.indexOf(b);
  if(end)bonePoint.fromArray(metadata.bones[name].tail).applyMatrix4(body.bindMatrix).applyMatrix4(body.skeleton.boneInverses[i]).applyMatrix4(b.matrixWorld);
  else b.getWorldPosition(bonePoint);
  return cat.object.worldToLocal(bonePoint).toArray();
 }
 return {bones,body,triangles,positionsHash:sha(body.geometry.attributes.position.array),pose(){
  cat.object.updateMatrixWorld(true);body.skeleton.update();cat.object.getWorldQuaternion(rootInverse).invert();
  return {headQ:bones.get('head').getWorldQuaternion(new THREE.Quaternion()).premultiply(rootInverse).toArray(),
   head:cat.object.worldToLocal(bones.get('head').getWorldPosition(new THREE.Vector3())).toArray(),
   tail:boneNames.filter(n=>n.startsWith('tail')).map(n=>tailPoint(n)),tip:tailPoint('tail_04',true)};
 }};
}
if(process.argv.includes('--probe')) {
 const cat=await createV10(THREE),rig=inspect(cat),samples=[];
 for(const angle of [0,-.65,-1.0,-1.2,-1.4]) {
  cat.update(0,{reset:true,time:0});const b=rig.bones.get('tail_01'),w=b.getWorldQuaternion(new THREE.Quaternion()),p=b.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
  b.quaternion.copy(p).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),angle)).multiply(w);cat.object.updateMatrixWorld(true);
  samples.push({angle,pose:rig.pose()});
 }
 const report={sourceHash,samples,coordinateSystem:metadata.coordinate_system};
 await writeFile(new URL('assets/cat-v11-rig-probe-audit.json',project),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));cat.dispose();
} else {
 const {createCat:createV11}=await import(new URL('cat-v11.js',web));
 const runtimeFiles=['cat-v10.js','cat-v10-body.js','cat-v10-motion.js','cat-v11.js'];
 const hashes=async()=>Object.fromEntries(await Promise.all(runtimeFiles.map(async f=>[f,sha(await readFile(new URL(f,web)))])));
 const before=await hashes(),results=[],checks={};
 const phases=[{name:'idle',duration:2,speed:0,yaw:0},{name:'walk',duration:4,speed:.36,yaw:0},{name:'run',duration:4,speed:.9,yaw:0},{name:'left_turn',duration:2,speed:.36,yaw:1.2},{name:'right_turn',duration:2,speed:.36,yaw:-1.2},{name:'brake',duration:2,speed:0,yaw:0},{name:'idle_after',duration:3,speed:0,yaw:0}];
 for(const rates of [[1/60],[1/30],[.0166,.0167,.0168,.0155,.018,.0333,.0083]]) {
  const old=await createV10(THREE),cat=await createV11(THREE),a=inspect(old),b=inspect(cat),samples={};
  let time=0,velocity=0,frame=0,finite=true,footDelta=0,reach=0,headStep=0,tailStep=0,last=null,minTailY=Infinity;
  for(const segment of phases) {
   const values=[];let local=0;
   while(local<segment.duration-1e-9) {
    const dt=Math.min(rates[frame++%rates.length],segment.duration-local);time+=dt;local+=dt;
    velocity+=Math.sign(segment.speed-velocity)*Math.min(Math.abs(segment.speed-velocity),(segment.speed>velocity?1:1.8)*dt);
    for(const c of [old,cat]) {c.object.rotation.y+=segment.yaw*dt;c.object.position.x+=Math.sin(c.object.rotation.y)*velocity*dt;c.object.position.z+=Math.cos(c.object.rotation.y)*velocity*dt;c.update(dt,{time,speed:velocity,moving:velocity>.001,sampleHeight:()=>0});}
    const pose=b.pose(),baseline=a.pose(),state=cat.getDebugState();reach=Math.max(reach,state.gait.maxReachError);
    for(const name of Object.keys(metadata.legs))for(const suffix of ['upper','lower','paw']) {
     const m=a.bones.get(name+'_'+suffix).matrixWorld.elements,n=b.bones.get(name+'_'+suffix).matrixWorld.elements;
     for(let i=0;i<16;i++)footDelta=Math.max(footDelta,Math.abs(m[i]-n[i]));
    }
    for(const bone of b.bones.values())finite&&=bone.matrixWorld.elements.every(Number.isFinite);
    minTailY=Math.min(minTailY,...pose.tail.map(p=>p[1]),pose.tip[1]);
    if(last){headStep=Math.max(headStep,new THREE.Quaternion().fromArray(pose.headQ).angleTo(new THREE.Quaternion().fromArray(last.headQ)));tailStep=Math.max(tailStep,new THREE.Vector3().fromArray(pose.tip).distanceTo(new THREE.Vector3().fromArray(last.tip)));}
    if(local>segment.duration-.5)values.push({pose,baseline,secondary:state.secondaryMotion});last=pose;
   }
   samples[segment.name]=values;
  }
  const mean=(name,get)=>samples[name].reduce((s,v)=>s+get(v),0)/samples[name].length;
  const averagePose=name=>({head:mean(name,v=>v.pose.head[1]),tipY:mean(name,v=>v.pose.tip[1]),tipZ:mean(name,v=>v.pose.tip[2]),
   headDifference:mean(name,v=>new THREE.Quaternion().fromArray(v.pose.headQ).normalize().angleTo(new THREE.Quaternion().fromArray(v.baseline.headQ).normalize())),
   headYaw:mean(name,v=>new THREE.Euler().setFromQuaternion(new THREE.Quaternion().fromArray(v.pose.headQ).multiply(new THREE.Quaternion().fromArray(v.baseline.headQ).invert()).normalize(),'YXZ').y),
   tipX:mean(name,v=>v.pose.tip[0])});
  const summary=Object.fromEntries(phases.map(p=>[p.name,averagePose(p.name)]));
  const end=cat.getDebugState();
  const hold=seconds=>{for(let i=0;i<Math.ceil(seconds*60);i++){time+=1/60;cat.update(1/60,{time,speed:0,moving:false,sampleHeight:()=>0});}return b.pose();};
  cat.setAttention({enabled:true,yaw:6,pitch:0});const manualLeft=hold(1.2);
  cat.setAttention({enabled:true,yaw:-6,pitch:0});const manualRight=hold(1.2);
  cat.setAttention({enabled:true,yaw:0,pitch:0});const manualStraight=hold(1.2);
  cat.setAttention({enabled:true,yaw:0,pitch:3});const manualDown=hold(1.2);
  cat.setAttention({enabled:true,mode:'natural'});const naturalAgain=hold(1.5);
  const quaternionDifference=(p,q)=>new THREE.Quaternion().fromArray(p.headQ).multiply(new THREE.Quaternion().fromArray(q.headQ).invert());
  const leftRightYaw=new THREE.Euler().setFromQuaternion(quaternionDifference(manualLeft,manualRight),'YXZ').y;
  const downPitch=new THREE.Euler().setFromQuaternion(quaternionDifference(manualDown,manualStraight),'YXZ').x;
  const manual={leftRightYaw,downPitch,naturalHeadAngle:quaternionDifference(naturalAgain,manualStraight).angleTo(new THREE.Quaternion()),returnedMode:cat.getDebugState().attention?.mode};
  cat.update(0,{reset:true,time:0});const reset1=b.pose();cat.update(0,{reset:true,time:0});const reset2=b.pose();
  const tag=rates.length>1?'jitter':`${Math.round(1/rates[0])}fps`;
  checks[tag+'_finite']=finite;
  checks[tag+'_leg_world_matrices_unchanged']=footDelta<1e-8;
  checks[tag+'_reachable']=reach<.015;
  checks[tag+'_topology_unchanged']=b.triangles===51976&&b.positionsHash===a.positionsHash;
  checks[tag+'_tail_above_ground']=minTailY>.08;
  checks[tag+'_run_tail_lower_than_walk']=summary.run.tipY<summary.walk.tipY-.015;
  checks[tag+'_run_tail_behind']=summary.run.tipZ<-.30;
  checks[tag+'_run_head_visibly_differs']=summary.run.headDifference>.02;
  checks[tag+'_no_head_pop']=headStep<.15;
  checks[tag+'_no_tail_pop']=tailStep<.04;
  checks[tag+'_manual_left_right_physical_response']=leftRightYaw>.08;
  checks[tag+'_manual_down_physical_response']=downPitch>.015;
  checks[tag+'_natural_mode_restored']=manual.returnedMode==='natural'&&manual.naturalHeadAngle<.10;
  checks[tag+'_head_follows_turn_direction']=summary.left_turn.headYaw>.02&&summary.right_turn.headYaw<-.02;
  checks[tag+'_tail_turn_response_visible']=Math.abs(summary.left_turn.tipX-summary.right_turn.tipX)>.02;
  checks[tag+'_reset_idempotent']=new THREE.Quaternion().fromArray(reset1.headQ).normalize().angleTo(new THREE.Quaternion().fromArray(reset2.headQ).normalize())<1e-6&&new THREE.Vector3().fromArray(reset1.tip).distanceTo(new THREE.Vector3().fromArray(reset2.tip))<1e-6;
  results.push({tag,rates,frames:frame,footDelta,maxReach:reach,maxHeadStepRadians:headStep,maxTailStepMetres:tailStep,minTailY,summary,manual,endSecondary:end.secondaryMotion,turnSamples:{left:samples.left_turn.at(-1),right:samples.right_turn.at(-1)},reset1,reset2});old.dispose();cat.dispose();
 }
 const after=await hashes();checks.runtime_frozen=JSON.stringify(before)===JSON.stringify(after);checks.source_unchanged=sourceHash===await readFile(new URL('models/cat-v3-rig.glb',web)).then(sha);
 const tipYs=results.map(r=>r.summary.run.tipY);checks.frame_rates_steady_run_tail_agree=Math.max(...tipYs)-Math.min(...tipYs)<.008;
 const report={checkedAt:new Date().toISOString(),passed:Object.values(checks).every(Boolean),checks,failed:Object.entries(checks).filter(([,v])=>!v).map(([k])=>k),sourceHash,before,after,results,scope:'Matched actual leg world transforms and preserved mesh topology. Secondary pose limits are animation sanity checks, not biological fidelity. Visual review required.'};
 await writeFile(new URL('assets/cat-v11-secondary-motion-audit.json',project),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,checks:report.checks,failed:report.failed,results:results.map(({tag,footDelta,maxReach,maxHeadStepRadians,maxTailStepMetres,minTailY,summary,manual})=>({tag,footDelta,maxReach,maxHeadStepRadians,maxTailStepMetres,minTailY,summary,manual}))},null,2));process.exitCode=report.passed?0:1;
}
