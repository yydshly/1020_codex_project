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




const {createCat}=await import(new URL('cat-v9.js',web));
const {createNavigation}=await import(new URL('roam-navigation.js',web));
const {limitApproachSpeed}=await import(new URL('cat-v9-navigation-brake.js',web));
const metadata=JSON.parse(await readFile(new URL('models/cat-v3-rig.json',web),'utf8'));
const controller=await readFile(new URL('shop-study-06-controller.js',web),'utf8');
const moveCatSource=controller.slice(controller.indexOf('function moveCat(delta) {'),controller.indexOf('\nfunction updateCamera('));
if(!moveCatSource.includes('limitApproachSpeed(')||!moveCatSource.trimEnd().endsWith('}'))throw new Error('Cannot extract actual street moveCat controller');
const compileMove=new Function('cat','navigation','velocity','state','keys','followCamera','movementInput','limitApproachSpeed',`
const walkSpeed=.36,slowWalkSpeed=.24,runSpeed=.90;
let tourStuck=0,tourPoints=[];
function setTour(enabled){state.tour=enabled;}
function setMode(mode){state.mode=mode;}
function status(){}
${moveCatSource}
return moveCat;
`);
const sourceFiles=['cat-v9.js','cat-v9-face.js','cat-v9-body.js','cat-v9-navigation-brake.js','shop-study-06-controller.js','models/cat-v3-rig.glb'];
const hashSources=async()=>Object.fromEntries(await Promise.all(sourceFiles.map(async f=>[f,createHash('sha256').update(await readFile(new URL(f,web))).digest('hex')])));
const before=await hashSources();
const scenarios=[
 {name:'default_diagonal_obstacle',yaw:-1.16,heading:-Math.PI/2,segments:[{name:'hold_W_run_toward_planter',seconds:8,h:0,v:1,run:true},{name:'release_all',seconds:2,h:0,v:0,run:false}]},
 {name:'along_street_reverse_release',yaw:-Math.PI/2,heading:Math.PI/2,segments:[{name:'along_street_run',seconds:4,h:0,v:1,run:true},{name:'sharp_180_turn_while_running',seconds:3.5,h:0,v:-1,run:true},{name:'release_shift_keep_moving',seconds:2,h:0,v:-1,run:false},{name:'release_all',seconds:2,h:0,v:0,run:false}]},
 {name:'along_street_90_turn_stop',yaw:-Math.PI/2,heading:Math.PI/2,segments:[{name:'along_street_run',seconds:3,h:0,v:1,run:true},{name:'sharp_90_turn_while_running',seconds:1.2,h:1,v:0,run:true},{name:'release_all_during_turn',seconds:2,h:0,v:0,run:false}]}
];
const result=[];
for(const [timing,rates] of [['60fps',[1/60]],['30fps',[1/30]],['variable',[.0166,.0167,.0168,.0155,.018,.0333,.0083]],['occasional_60ms',[1/60,1/60,.06,1/30]]])for(const scenario of scenarios){
 const cat=await createCat(THREE),navigation=createNavigation(),velocity={x:0,z:0};
 const state={mode:'follow',tour:false,runMode:false,speed:0,distance:0},keys=new Set(),followCamera={yaw:scenario.yaw};let input={horizontal:0,vertical:0};
 cat.object.position.set(-5.8,.85,.55);cat.object.rotation.y=scenario.heading;
 cat.update(0,{reset:true,time:0,sampleHeight:navigation.sampleHeight});
 let body;const bones=new Map();cat.object.traverse(n=>{if(n.isBone)bones.set(n.name,n);if(n.isSkinnedMesh&&!body)body=n;});
 const geometry=body.geometry,position=geometry.attributes.position,weights=geometry.attributes.skinWeight,joints=geometry.attributes.skinIndex;
 const pawIds=Object.fromEntries(Object.keys(metadata.legs).map(key=>[key,body.skeleton.bones.findIndex(b=>b.name===key+'_paw')]));
 const rawSoles=Object.fromEntries(Object.entries(metadata.legs).map(([key,value])=>[key,new THREE.Vector3().fromArray(value.sole)]));
 // Select real lowest paw vertices with a dominant paw influence, retaining their full skinning.
 const soleVertices={};
 for(const [name,pawIndex] of Object.entries(pawIds)){
  const ids=[];for(let i=0;i<position.count;i++){let w=0;for(let k=0;k<4;k++)if(joints.getComponent(i,k)===pawIndex)w+=weights.getComponent(i,k);if(w>.8)ids.push(i);}
  ids.sort((a,b)=>position.getY(a)-position.getY(b));soleVertices[name]=ids.slice(0,16);
  if(soleVertices[name].length<8)throw new Error('Insufficient actual sole mesh points: '+name);
 }
 const run={timing,scenario:scenario.name,frames:0,allFinite:true,allWalkable:true,brakingFrames:0,maxSpeed:0,maxDeceleration:0,maxReachError:0,maxAnchorTargetError:0,maxAnchorStanceSlip:0,maxMeshStanceSlip:0,maxStanceGroundError:0,minMeshGroundClearance:Infinity,maxFootFrameJump:0,maxContactFrameJump:0,sourceSoleVertexCounts:Object.fromEntries(Object.entries(soleVertices).map(([k,v])=>[k,v.length])),segments:{},worst:{},samples:[],diagnosticNoBrake:false};
 let last={},time=0,frame=0,activeSegment,probe;
 const observeBrake=(nav,p,desired,speed)=>{probe=limitApproachSpeed(nav,p,desired,speed);return probe;};
 const move=compileMove(cat,navigation,velocity,state,keys,followCamera,()=>input,observeBrake);
 function recordMax(key,value,details){if(value>run[key]){run[key]=value;run.worst[key]={time,segment:activeSegment,...details};}}
 for(const segment of scenario.segments){
  activeSegment=segment.name;run.segments[activeSegment]={maxReach:0,maxSpeed:0,maxAnchorSlip:0,minMeshClearance:Infinity};
  const segmentStats=run.segments[activeSegment];let local=0;
  input={horizontal:segment.h,vertical:segment.v};keys.clear();if(segment.run)keys.add('ShiftLeft');
  while(local<segment.seconds){
   const dt=rates[frame%rates.length];time+=dt;local+=dt;frame++;
   const previousSpeed=Math.hypot(velocity.x,velocity.z);probe=null;const motion=move(dt);
   cat.update(dt,{speed:state.speed,moving:motion.moving,time,sampleHeight:navigation.sampleHeight});
   const debug=cat.getDebugState();body.skeleton.update();
   run.frames++;run.maxSpeed=Math.max(run.maxSpeed,state.speed);run.maxDeceleration=Math.max(run.maxDeceleration,(previousSpeed-state.speed)/dt);
   run.brakingFrames+=Number(probe?.blocked&&probe.limit<.9);
   run.allWalkable&&=navigation.isWalkable(cat.object.position.x,cat.object.position.z);
   recordMax('maxReachError',debug.gait.maxReachError,{position:cat.object.position.toArray(),speed:state.speed,gait:debug.gait.mode});
   segmentStats.maxReach=Math.max(segmentStats.maxReach,debug.gait.maxReachError);segmentStats.maxSpeed=Math.max(segmentStats.maxSpeed,state.speed);
   for(const foot of debug.feet){
    const actual=rawSoles[foot.name].clone().applyMatrix4(body.bindMatrix).applyMatrix4(body.skeleton.boneInverses[pawIds[foot.name]]).applyMatrix4(bones.get(foot.name+'_paw').matrixWorld);
    const planned=new THREE.Vector3().fromArray(foot.world),previous=last[foot.name];
    const meshPoints=soleVertices[foot.name].map(id=>body.applyBoneTransform(id,new THREE.Vector3().fromBufferAttribute(position,id)).applyMatrix4(body.matrixWorld));
    let minClearance=Infinity;for(const p of meshPoints){const ground=navigation.sampleHeight(p.x,p.z)??cat.object.position.y;minClearance=Math.min(minClearance,p.y-ground);run.allFinite&&=p.toArray().every(Number.isFinite);}
    if(minClearance<run.minMeshGroundClearance){run.minMeshGroundClearance=minClearance;run.worst.minMeshGroundClearance={time,segment:activeSegment,foot:foot.name,stance:foot.stance};}
    segmentStats.minMeshClearance=Math.min(segmentStats.minMeshClearance,minClearance);
    recordMax('maxAnchorTargetError',actual.distanceTo(planned),{foot:foot.name,actual:actual.toArray(),planned:planned.toArray(),stance:foot.stance});
    if(foot.stance)recordMax('maxStanceGroundError',Math.abs(actual.y-(navigation.sampleHeight(actual.x,actual.z)??cat.object.position.y)),{foot:foot.name,actual:actual.toArray()});
    if(previous){
     recordMax('maxFootFrameJump',actual.distanceTo(previous.actual),{foot:foot.name,previousStance:previous.stance,stance:foot.stance});
     if(foot.stance&&!previous.stance)recordMax('maxContactFrameJump',actual.distanceTo(previous.actual),{foot:foot.name,dt,actual:actual.toArray(),previous:previous.actual.toArray()});
     if(foot.stance&&previous.stance){
      const slip=Math.hypot(actual.x-previous.actual.x,actual.z-previous.actual.z);
      recordMax('maxAnchorStanceSlip',slip,{foot:foot.name,actual:actual.toArray(),previous:previous.actual.toArray(),speed:state.speed});segmentStats.maxAnchorSlip=Math.max(segmentStats.maxAnchorSlip,slip);
      let meshSlip=0;for(let i=0;i<meshPoints.length;i++)meshSlip=Math.max(meshSlip,Math.hypot(meshPoints[i].x-previous.meshPoints[i].x,meshPoints[i].z-previous.meshPoints[i].z));
      recordMax('maxMeshStanceSlip',meshSlip,{foot:foot.name,speed:state.speed});
     }
    }
    run.allFinite&&=actual.toArray().every(Number.isFinite)&&planned.toArray().every(Number.isFinite);
    last[foot.name]={actual,planned,stance:foot.stance,meshPoints};
   }
   for(const bone of bones.values())run.allFinite&&=bone.matrixWorld.elements.every(Number.isFinite);
   run.allFinite&&=[state.speed,cat.object.rotation.y,...cat.object.position.toArray()].every(Number.isFinite);
   if(frame%Math.max(1,Math.round(.2/dt))===0)run.samples.push({time,segment:activeSegment,position:cat.object.position.toArray(),speed:state.speed,yaw:cat.object.rotation.y,mode:debug.gait.mode,reach:debug.gait.maxReachError,support:debug.gait.stanceFeet,probe});
  }
  segmentStats.finalSpeed=state.speed;
 }
 run.final={position:cat.object.position.toArray(),speed:state.speed,feet:cat.getDebugState().feet};
 // Thresholds set before execution: keep prior 15 mm reach / 2 mm planted anchor standard.
 run.checks={finite:run.allFinite,walkable:run.allWalkable,reachesRun:run.maxSpeed>.89,reachBelow15mm:run.maxReachError<.015,anchorSlipBelow2mm:run.maxAnchorStanceSlip<.002,meshSlipBelow3mm:run.maxMeshStanceSlip<.003,meshPenetrationBelow10mm:run.minMeshGroundClearance>-.010,stops:run.final.speed<.001};
 if(scenario.name==='default_diagonal_obstacle')run.checks.predictiveBrakeUsed=run.brakingFrames>0;
 run.passed=Object.values(run.checks).every(Boolean);result.push(run);cat.dispose();
}
// Preserve a simple no-brake regression control for the same default diagonal route.
for(const enabled of [false,true]){
 const cat=await createCat(THREE),navigation=createNavigation(),velocity={x:0,z:0},state={mode:'follow',tour:false,runMode:false,speed:0,distance:0},keys=new Set(['ShiftLeft']);
 cat.object.position.set(-5.8,.85,.55);cat.object.rotation.y=-Math.PI/2;cat.update(0,{reset:true,sampleHeight:navigation.sampleHeight});
 const run={scenario:'default_diagonal_brake_comparison',enabled,maxReachError:0,maxDeceleration:0,worst:null};
 const move=compileMove(cat,navigation,velocity,state,keys,{yaw:-1.16},()=>({horizontal:0,vertical:1}),enabled?limitApproachSpeed:()=>{});
 for(let frame=0;frame<600;frame++){
  const speed=Math.hypot(velocity.x,velocity.z),motion=move(1/60);cat.update(1/60,{speed:state.speed,moving:motion.moving,time:frame/60,sampleHeight:navigation.sampleHeight});
  const debug=cat.getDebugState();if(debug.gait.maxReachError>run.maxReachError){run.maxReachError=debug.gait.maxReachError;run.worst={time:frame/60,position:cat.object.position.toArray(),speed:state.speed,feet:debug.feet};}run.maxDeceleration=Math.max(run.maxDeceleration,(speed-state.speed)*60);
 }result.push(run);cat.dispose();
}
const after=await hashSources();
const report={checkedAt:new Date().toISOString(),passed:result.filter(r=>r.checks).every(r=>r.passed),sourcesBefore:before,sourcesAfter:after,sourceHashesStable:JSON.stringify(before)===JSON.stringify(after),scope:'CPU only; actual GLB and extracted production moveCat controller; actual transformed paw anchors plus 16 real low sole vertices per paw with complete skin weights. Tests current flat near-bank, not bridge slopes or visual silhouette.',results:result};
await writeFile(new URL('assets/cat-v9-obstacle-check.json',project),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,sourcesBefore:undefined,sourcesAfter:undefined,results:result.map(({samples,final,sourceSoleVertexCounts,worst,...r})=>r)},null,2));
process.exitCode=report.passed?0:1;
