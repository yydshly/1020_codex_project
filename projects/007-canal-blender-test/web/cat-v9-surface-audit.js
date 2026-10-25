// A deterministic review scene only. The normal study and street are unchanged.
import * as THREE from 'three';
import { createCat } from './cat-v9.js';

const host=document.getElementById('viewport'),scene=new THREE.Scene();
scene.background=new THREE.Color('#e6e8e5');
const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance',preserveDrawingBuffer:true});
renderer.setPixelRatio(1);renderer.setSize(1100,640,false);renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.03;
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;host.appendChild(renderer.domElement);
const extent=.69,aspect=1100/640,camera=new THREE.OrthographicCamera(-extent*aspect/2,extent*aspect/2,extent/2,-extent/2,.01,30);
scene.add(new THREE.HemisphereLight(0xf3f7ff,0x807464,2));
const key=new THREE.DirectionalLight(0xffeee0,2.6);key.castShadow=true;key.shadow.mapSize.set(2048,2048);
Object.assign(key.shadow.camera,{left:-1.2,right:1.2,top:1.2,bottom:-1.2,near:.2,far:10});
key.shadow.normalBias=.002;key.shadow.bias=-.00008;key.shadow.radius=3;scene.add(key,key.target);
const fill=new THREE.DirectionalLight(0xd8e5ff,.85);scene.add(fill,fill.target);
const ground=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.MeshStandardMaterial({color:0xe6e8e5,roughness:1}));
ground.rotation.x=-Math.PI/2;ground.position.y=-.001;ground.receiveShadow=true;scene.add(ground);

const before=await createCat(THREE,{surfaceSkin:false}),after=await createCat(THREE,{surfaceSkin:true});
const cats={before,after};
for(const cat of Object.values(cats)){scene.add(cat.object);cat.setAttention({enabled:false});cat.setBlink({mode:'open'});}
let time=0,speed=0,frames=0;
for(let i=0;i<600;i++){
  const dt=1/60;time+=dt;frames++;
  const target=time<.7?0:.9;speed+=Math.sign(target-speed)*Math.min(Math.abs(target-speed),dt);
  for(const cat of Object.values(cats)){
    cat.object.position.z+=speed*dt;
    cat.update(dt,{speed,moving:speed>.001,time,sampleHeight:()=>0});
  }
  if(time>4.5&&after.getDebugState().gait.phase<.035)break;
}
let surface='after',view='side';
const poses={side:[2.1,.28,0],threequarter:[1.45,.62,1.65]};
function draw(){
  for(const [name,cat] of Object.entries(cats))cat.object.visible=name===surface;
  const z=after.object.position.z,p=poses[view];camera.position.set(p[0],p[1],p[2]+z);camera.lookAt(0,.245,z);
  key.position.set(-2,3.5,z+3.5);key.target.position.set(0,0,z);fill.position.set(2,1,z-2);fill.target.position.set(0,0,z);
  renderer.render(scene,camera);
  document.querySelectorAll('[data-surface]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.surface===surface)));
  document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===view)));
  document.getElementById('status').textContent=`${surface==='after'?'修整后':'修整前'} · 同一跑步姿态、镜头与灯光 · 相位 ${after.getDebugState().gait.phase.toFixed(4)}`;
}
function setSurface(next){if(cats[next]){surface=next;draw();}}
function setView(next){if(poses[next]){view=next;draw();}}
document.querySelectorAll('[data-surface]').forEach(b=>b.addEventListener('click',()=>setSurface(b.dataset.surface)));
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
function matrices(cat){const entries={};cat.object.updateMatrixWorld(true);cat.object.traverse(n=>{if(n.isBone)entries[n.name]=n.matrixWorld.toArray();});return entries;}
const beforeBones=matrices(before),afterBones=matrices(after);
const maxBoneMatrixDifference=Math.max(...Object.keys(beforeBones).flatMap(name=>beforeBones[name].map((v,i)=>Math.abs(v-afterBones[name][i]))));
draw();
window.__catSurfaceAudit=Object.freeze({setSurface,setView,getState(){return{ready:true,surface,view,time,frames,speed,maxBoneMatrixDifference,before:before.getDebugState(),after:after.getDebugState(),camera:{position:camera.position.toArray(),projection:camera.projectionMatrix.toArray()}};}});
