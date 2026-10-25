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


const factories={baseline:(await import(new URL('cat-v9-body.js',web))).createCat,candidate:(await import(new URL('cat-v10-paw-candidate-body.js',web))).createCat};
const reports=[];
for(const [variant,createCat] of Object.entries(factories))for(const timing of ['30fps','60fps','jitter']){
 const cat=await createCat(THREE);let mesh;const bones=new Map();cat.object.traverse(n=>{if(n.isSkinnedMesh&&!mesh)mesh=n;if(n.isBone)bones.set(n.name,n);});
 const rests=Object.fromEntries([...bones].filter(([name])=>name.endsWith('_paw')).map(([name,b])=>[name,b.getWorldQuaternion(new THREE.Quaternion())]));
 const p=mesh.geometry.attributes.position,vs=Array.from({length:p.count},(_,i)=>new THREE.Vector3().fromBufferAttribute(p,i));
 const padIds=vs.map((v,i)=>v.y<.018?i:-1).filter(i=>i>=0);
 const pawSamples={};const jointIndex=mesh.geometry.attributes.skinIndex,weights=mesh.geometry.attributes.skinWeight;for(const key of ['fore_left','fore_right','hind_left','hind_right']){const boneIndex=mesh.skeleton.bones.findIndex(b=>b.name===key+'_paw');const ids=vs.map((v,i)=>{let influence=0;for(let slot=0;slot<4;slot++)if(jointIndex.getComponent(i,slot)===boneIndex)influence+=weights.getComponent(i,slot);return v.y<.022&&influence>.5?i:-1;}).filter(i=>i>=0);const sorted=ids.sort((a,b)=>vs[a].z-vs[b].z);const size=Math.max(3,Math.round(sorted.length*.2));pawSamples[key]={heel:sorted.slice(0,size),toe:sorted.slice(-size),restPitch:null};}
 function surfacePoint(ids){const out=new THREE.Vector3();for(const id of ids)out.add(mesh.applyBoneTransform(id,vs[id].clone()).applyMatrix4(mesh.matrixWorld));return out.divideScalar(ids.length);}
 const result={variant,timing,frames:0,maxReach:0,maxTargetError:0,maxStanceSlip:0,minLowPawY:1,allFinite:true,maxForePitch:0,maxHindPitch:0,minForePitch:0,minHindPitch:0,minForeSurfacePitch:0,minHindSurfacePitch:0,restLocalPawAxes:Object.fromEntries(Object.entries(rests).map(([n,q])=>[n,new THREE.Vector3(1,0,0).applyQuaternion(q).toArray()])),peakReach:null,sideKeyPoints:[]};
 const intervals=timing==='30fps'?[1/30]:timing==='60fps'?[1/60]:[.0166,.0167,.0168,.0155,.018,.0333,.0083];
 let elapsed=0,frame=0,speed=0,last={};
 for(const segment of [{name:'stand',time:.5,speed:0},{name:'walk',time:3,speed:.36},{name:'run',time:5,speed:.9},{name:'back_to_walk',time:2,speed:.36},{name:'stop',time:1.3,speed:0},{name:'pivot',time:1,speed:0,yaw:2.2},{name:'restart_run',time:3,speed:.9},{name:'final_stop',time:1.3,speed:0}]){
  let segmentTime=0;
  while(segmentTime<segment.time){const dt=intervals[frame++%intervals.length];elapsed+=dt;segmentTime+=dt;speed+=Math.sign(segment.speed-speed)*Math.min(Math.abs(segment.speed-speed),(segment.speed>speed?1:1.8)*dt);cat.object.rotation.y+=(segment.yaw||0)*dt;cat.object.position.x+=Math.sin(cat.object.rotation.y)*speed*dt;cat.object.position.z+=Math.cos(cat.object.rotation.y)*speed*dt;cat.update(dt,{speed,moving:speed>.001,time:elapsed,sampleHeight:()=>0});mesh.skeleton.update();const s=cat.getDebugState();result.frames++;
   if(s.gait.maxReachError>result.maxReach){result.maxReach=s.gait.maxReachError;result.peakReach={elapsed,segment:segment.name,feet:s.feet};}
   for(const foot of s.feet){const point=new THREE.Vector3().fromArray(foot.renderedWorld),planned=new THREE.Vector3().fromArray(foot.world);result.maxTargetError=Math.max(result.maxTargetError,point.distanceTo(planned));if(foot.stance&&last[foot.name]?.stance)result.maxStanceSlip=Math.max(result.maxStanceSlip,Math.hypot(point.x-last[foot.name].point.x,point.z-last[foot.name].point.z));last[foot.name]={stance:foot.stance,point};result.allFinite&&=point.toArray().every(Number.isFinite);
    const name=foot.name+'_paw',q=bones.get(name).getWorldQuaternion(new THREE.Quaternion()).multiply(rests[name].clone().invert());const fwd=new THREE.Vector3(0,0,1).applyQuaternion(q).applyQuaternion(cat.object.quaternion.clone().invert());const pitch=Math.atan2(fwd.y,fwd.z);const field=foot.name.startsWith('fore')?'maxForePitch':'maxHindPitch';const minField=foot.name.startsWith('fore')?'minForePitch':'minHindPitch';result[minField]=Math.min(result[minField],pitch);const samples=pawSamples[foot.name],toe=surfacePoint(samples.toe),heel=surfacePoint(samples.heel),surfaceDirection=toe.clone().sub(heel).applyQuaternion(cat.object.quaternion.clone().invert());const surfacePitch=Math.atan2(surfaceDirection.y,surfaceDirection.z);samples.restPitch??=surfacePitch;const surfaceField=foot.name.startsWith('fore')?'minForeSurfacePitch':'minHindSurfacePitch';if(!foot.stance&&s.gait.runBlend>.95)result[surfaceField]=Math.min(result[surfaceField],surfacePitch-samples.restPitch);if(pitch<-.30&&segment.name==='run'&&result.sideKeyPoints.length<8)result.sideKeyPoints.push({foot:foot.name,phase:s.gait.phase,footPhase:foot.phase,pitch,sole:point.toArray(),toe:toe.toArray(),heel:heel.toArray(),surfacePitch:surfacePitch-samples.restPitch,ankle:bones.get(name).getWorldPosition(new THREE.Vector3()).toArray(),knee:bones.get(foot.name+'_lower').getWorldPosition(new THREE.Vector3()).toArray()});if(pitch>result[field]){result[field]=pitch;if(segment.name==='run')result.sideKeyPoints.push({foot:foot.name,phase:s.gait.phase,footPhase:foot.phase,pitch,sole:point.toArray(),ankle:bones.get(name).getWorldPosition(new THREE.Vector3()).toArray(),knee:bones.get(foot.name+'_lower').getWorldPosition(new THREE.Vector3()).toArray()});}
   }
   if(frame%3===0)for(const i of padIds){const v=mesh.applyBoneTransform(i,vs[i].clone()).applyMatrix4(mesh.matrixWorld);result.minLowPawY=Math.min(result.minLowPawY,v.y);}
  }
 }
 result.sideKeyPoints=result.sideKeyPoints.slice(-6);reports.push(result);cat.dispose();
}
const checks={finite:reports.every(r=>r.allFinite),candidate_reachable:reports.filter(r=>r.variant==='candidate').every(r=>r.maxReach<.015),candidate_support_slip:reports.filter(r=>r.variant==='candidate').every(r=>r.maxStanceSlip<.002),candidate_sole_not_through_ground:reports.filter(r=>r.variant==='candidate').every(r=>r.minLowPawY>-.01)};
await writeFile(new URL('assets/cat-v10-paw-pitch-audit.json',project),JSON.stringify({checks,reports},null,2));console.log(JSON.stringify({checks,reports:reports.map(({peakReach,sideKeyPoints,...r})=>r)},null,2));
