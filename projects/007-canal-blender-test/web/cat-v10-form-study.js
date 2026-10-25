// Review scene: preserve the motion, camera and lighting while comparing shape.
import * as THREE from 'three';
import { createCat } from './cat-v10.js';

const host=document.getElementById('viewport'),scene=new THREE.Scene();scene.background=new THREE.Color('#e6e8e5');
const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance',preserveDrawingBuffer:true});
renderer.setPixelRatio(1);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.03;
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;host.appendChild(renderer.domElement);
const camera=new THREE.OrthographicCamera(-.6,.6,.345,-.345,.01,30);
scene.add(new THREE.HemisphereLight(0xf3f7ff,0x807464,2));
const key=new THREE.DirectionalLight(0xffeee0,2.6);key.castShadow=true;key.shadow.mapSize.set(2048,2048);
Object.assign(key.shadow.camera,{left:-1.2,right:1.2,top:1.2,bottom:-1.2,near:.2,far:10});key.shadow.normalBias=.002;key.shadow.bias=-.00008;key.shadow.radius=3;scene.add(key,key.target);
const fill=new THREE.DirectionalLight(0xd8e5ff,.85);scene.add(fill,fill.target);
const ground=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.MeshStandardMaterial({color:0xe6e8e5,roughness:1}));ground.rotation.x=-Math.PI/2;ground.position.y=-.001;ground.receiveShadow=true;scene.add(ground);
const labels={baseline:'V9 原表面',field4:'位置场 · 4mm 候选',field8:'位置场 · 8mm 候选',dq:'体积保持候选'};
const poses={side:[2.1,.28,0],threequarter:[1.45,.62,1.65],front:[0,.29,2.1]};
const cats={},availability={field4:'not_selected',dq:'rejected'},boneMaps={},errors=[];
let variant='baseline',view='side',motion='run',targetPhase=0,playing=false,ready=false,candidatesReady=false;
let time=0,speed=0,frames=0,lastTime=performance.now(),raf,simSteps=0;

function makeBoneMap(cat){const map=new Map();cat.object.traverse(n=>{if(n.isBone)map.set(n.name,n);});return map;}
function syncSkeleton(){
 const base=cats.baseline;if(!base)return;
 for(const [name,cat]of Object.entries(cats)){
  if(name==='baseline')continue;
  cat.object.position.copy(base.object.position);cat.object.quaternion.copy(base.object.quaternion);cat.object.scale.copy(base.object.scale);
  const a=base.object.children[0],b=cat.object.children[0];if(a&&b){b.position.copy(a.position);b.quaternion.copy(a.quaternion);b.scale.copy(a.scale);}
  for(const [boneName,source]of boneMaps.baseline){const target=boneMaps[name].get(boneName);if(target){target.position.copy(source.position);target.quaternion.copy(source.quaternion);target.scale.copy(source.scale);}}
  cat.object.updateMatrixWorld(true);
 }
}
function advance(dt,targetSpeed){
 time+=dt;frames++;speed+=Math.sign(targetSpeed-speed)*Math.min(Math.abs(targetSpeed-speed),(targetSpeed>speed?1:1.8)*dt);
 for(const cat of Object.values(cats)){cat.object.position.z+=speed*dt;cat.update(dt,{speed,moving:speed>.001,time,sampleHeight:()=>0});}
 syncSkeleton();
}
function seek(nextMotion=motion,nextPhase=targetPhase){
 motion=nextMotion;targetPhase=Number(nextPhase);playing=false;if(raf)cancelAnimationFrame(raf);raf=undefined;
 time=0;speed=0;frames=0;
 for(const cat of Object.values(cats)){cat.object.position.set(0,0,0);cat.object.rotation.set(0,0,0);cat.update(0,{reset:true,moving:false,speed:0,time:0,sampleHeight:()=>0});}
 // Warm a fixed standing interval, then use the same acceleration for all cats.
 const target=motion==='stand'?0:motion==='walk'?.36:.9;
 for(let i=0;i<270;i++)advance(1/60,i<42?0:target);
 if(target>0){
  for(let i=0;i<180;i++){
   const gait=cats.baseline.getDebugState().gait;
   const remaining=((targetPhase-gait.phase)%1+1)%1;
   if(remaining<1e-8)break;
   const dt=Math.min(1/60,remaining*gait.stride/target);
   if(dt<1e-9)break;advance(dt,target);
  }
 }
 simSteps=frames;draw();
}
function resize(){const w=host.clientWidth,h=Math.max(1,host.clientHeight),extent=.69;camera.left=-extent*w/h/2;camera.right=extent*w/h/2;camera.top=extent/2;camera.bottom=-extent/2;camera.updateProjectionMatrix();renderer.setSize(w,h,false);if(ready)draw();}
function updateLabels(){
 document.querySelectorAll('[data-variant]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.variant===variant)));
 document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===view)));
 document.querySelectorAll('[data-motion]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.motion===motion)));
 document.querySelectorAll('[data-phase]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.phase)===targetPhase&&!playing)));
 document.getElementById('play').setAttribute('aria-pressed',String(playing));document.getElementById('play').textContent=playing?'暂停动作':'播放正常速度';
}
function draw(){
 if(!cats.baseline)return;
 for(const [name,cat]of Object.entries(cats))cat.object.visible=name===variant;
 const z=cats.baseline.object.position.z,p=poses[view];camera.position.set(p[0],p[1],p[2]+z);camera.lookAt(0,.245,z);
 key.position.set(-2,3.5,z+3.5);key.target.position.set(0,0,z);fill.position.set(2,1,z-2);fill.target.position.set(0,0,z);
 renderer.render(scene,camera);updateLabels();
 const phase=cats.baseline.getDebugState().gait.phase;
 document.getElementById('status').textContent=`${labels[variant]} · ${motion==='stand'?'站立':motion==='walk'?'行走 0.36 m/s':'小跑 0.90 m/s'} · ${playing?'正常速度播放':'固定姿态'} · 相位 ${phase.toFixed(4)} · 候选需以外观验收`;
}
function frame(now){const dt=Math.min(.05,Math.max(0,(now-lastTime)/1000));lastTime=now;advance(dt,motion==='stand'?0:motion==='walk'?.36:.9);draw();if(playing)raf=requestAnimationFrame(frame);}
function setPlaying(value){playing=Boolean(value);if(raf)cancelAnimationFrame(raf);raf=undefined;if(playing){lastTime=performance.now();raf=requestAnimationFrame(frame);}draw();}
function setVariant(next){if(cats[next]){variant=next;draw();}}
function setView(next){if(poses[next]){view=next;draw();}}
function boneDifferences(){const base=boneMaps.baseline;if(!base)return{};const result={};cats.baseline.object.updateMatrixWorld(true);for(const [name,map]of Object.entries(boneMaps)){if(name==='baseline')continue;cats[name].object.updateMatrixWorld(true);let max=0;for(const [key,a]of base){const b=map.get(key);if(!b){max=Infinity;break;}for(let i=0;i<16;i++)max=Math.max(max,Math.abs(a.matrixWorld.elements[i]-b.matrixWorld.elements[i]));}result[name]=max;}return result;}
function geometryStats(cat){let triangles=0,invalid=0,meshes=0;cat.object.traverse(n=>{if(!n.isMesh)return;meshes++;triangles+=(n.geometry.index?.count||n.geometry.attributes.position.count)/3;for(const v of n.geometry.attributes.position.array)if(!Number.isFinite(v))invalid++;});return{triangles,invalid,meshes};}
function getState(){return{ready,candidatesReady,variant,view,motion,targetPhase,playing,time,speed,frames,simSteps,timeScale:1,availability:{...availability},errors:[...errors],boneDifferences:boneDifferences(),camera:{position:camera.position.toArray(),projection:camera.projectionMatrix.toArray()},cats:Object.fromEntries(Object.entries(cats).map(([k,c])=>[k,{...c.getDebugState(),geometry:geometryStats(c)}]))};}
window.__catFormStudy=Object.freeze({getState,setVariant,setView,setPlaying,seek});
for(const b of document.querySelectorAll('[data-variant]'))b.addEventListener('click',()=>setVariant(b.dataset.variant));
for(const b of document.querySelectorAll('[data-view]'))b.addEventListener('click',()=>setView(b.dataset.view));
for(const b of document.querySelectorAll('[data-motion]'))b.addEventListener('click',()=>seek(b.dataset.motion,targetPhase));
for(const b of document.querySelectorAll('[data-phase]'))b.addEventListener('click',()=>seek(motion,Number(b.dataset.phase)));
document.getElementById('play').addEventListener('click',()=>setPlaying(!playing));
new ResizeObserver(resize).observe(host);resize();
for(const name of ['baseline','field8']){
 try{
  const cat=await createCat(THREE,{variant:name});cats[name]=cat;boneMaps[name]=makeBoneMap(cat);scene.add(cat.object);cat.object.visible=false;cat.setAttention({enabled:false});cat.setBlink({mode:'open'});availability[name]='ready';
  document.querySelector(`[data-variant="${name}"]`).disabled=false;
  if(name==='baseline'){ready=true;seek();}
 }catch(error){availability[name]='unavailable';errors.push({variant:name,message:error.message});document.querySelector(`[data-variant="${name}"]`).title=error.message;if(name==='baseline'){document.getElementById('status').textContent=`原模型未能载入：${error.message}`;throw error;}}
}
candidatesReady=true;seek();
