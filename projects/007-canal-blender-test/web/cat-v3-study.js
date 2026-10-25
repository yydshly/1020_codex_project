import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createCat as createPrevious } from "./roam-cat-refine.js";
import { createCat as createCurrent } from "./roam-cat-v3.js";

const host=document.getElementById("viewport");
const scene=new THREE.Scene();scene.background=new THREE.Color("#e6e8e5");
const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:"high-performance"});
renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.03;
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
host.appendChild(renderer.domElement);
const camera=new THREE.OrthographicCamera(-.6,.6,.45,-.45,.01,30);
const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.12;
controls.minZoom=.6;controls.maxZoom=4;controls.maxPolarAngle=Math.PI*.49;
scene.add(new THREE.HemisphereLight(0xf3f7ff,0x807464,2.0));
const key=new THREE.DirectionalLight(0xffeee0,2.6);key.position.set(-2,3.5,3.5);key.castShadow=true;
key.shadow.mapSize.set(2048,2048);Object.assign(key.shadow.camera,{left:-1.2,right:1.2,top:1.2,bottom:-1.2,near:.2,far:10});
key.shadow.normalBias=.002;key.shadow.bias=-.00008;key.shadow.radius=3;scene.add(key,key.target);
const fill=new THREE.DirectionalLight(0xd8e5ff,.85);fill.position.set(2,1,-2);scene.add(fill,fill.target);
const ground=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.MeshStandardMaterial({color:0xe6e8e5,roughness:1}));
ground.rotation.x=-Math.PI/2;ground.position.y=-.001;ground.receiveShadow=true;scene.add(ground);
let cats;
try { cats={current:await createCurrent(THREE),previous:createPrevious(THREE)}; }
catch(error){document.getElementById("status").textContent=`猫模型暂未载入：${error.message}`;console.error(error);throw error;}
for(const cat of Object.values(cats)){scene.add(cat.object);cat.object.visible=false;}
let active=cats.current,mode="current",view="threequarter",walking=false,speed=0,elapsed=0,lastTime=performance.now(),frames=0;
active.object.visible=true;
function reset(){for(const cat of Object.values(cats)){cat.object.position.set(0,0,0);cat.object.rotation.y=0;cat.update(0,{reset:true,moving:false,speed:0,time:elapsed});}speed=0;setView(view);}
const poses={front:[0,.29,2.1],side:[2.1,.28,0],threequarter:[1.45,.62,1.65],rear:[0,.29,-2.1],face:[1.5,.34,1.5]};
function setView(next){view=next;const z=active.object.position.z;camera.zoom=1;const extent=next==="face"?.26:.69;camera.userData.extent=extent;const pose=poses[next];camera.position.set(pose[0],pose[1],pose[2]+z);controls.target.set(next==="face"&&mode==="current"?.025:0,next==="face"?.34:.245,z+(next==="face"?(mode==="current"?.16:.25):0));resize();controls.update();document.querySelectorAll("[data-view]").forEach(button=>button.setAttribute("aria-pressed",String(button.dataset.view===view)));}
function resize(){const width=host.clientWidth,height=host.clientHeight,aspect=width/Math.max(1,height),extent=camera.userData.extent||.69;camera.left=-extent*aspect/2;camera.right=extent*aspect/2;camera.top=extent/2;camera.bottom=-extent/2;camera.updateProjectionMatrix();renderer.setSize(width,height,false);}
new ResizeObserver(resize).observe(host);
document.querySelectorAll("[data-view]").forEach(button=>button.addEventListener("click",()=>setView(button.dataset.view)));
document.getElementById("walk").addEventListener("click",()=>{walking=!walking;document.getElementById("walk").setAttribute("aria-pressed",String(walking));document.getElementById("walk").textContent=walking?"停下来":"走两步";updateStatus();});
document.getElementById("previous").addEventListener("click",()=>{active.object.visible=false;mode=mode==="current"?"previous":"current";active=cats[mode];active.object.visible=true;reset();document.getElementById("previous").setAttribute("aria-pressed",String(mode==="previous"));document.getElementById("previous").textContent=mode==="previous"?"返回新版":"上一版对照";updateStatus();});
function geometryStats(){let meshes=0,triangles=0,invalid=0;active.object.traverse(node=>{if(node.isMesh){meshes++;const p=node.geometry.attributes.position;triangles+=(node.geometry.index?.count||p.count)/3;for(const value of p.array)if(!Number.isFinite(value))invalid++;}});active.object.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(active.object,true);return{meshes,triangles,invalid,bounds:{min:bounds.min.toArray(),max:bounds.max.toArray()}};}
function updateStatus(){document.getElementById("status").textContent=`${mode==="current"?"新版猫":"上一版猫"} · ${walking?"步行观察":"站姿观察"} · 可切换${mode==="current"?"旧":"新"}版对照`;}
setView(view);updateStatus();
function frame(now){const dt=Math.min(.05,Math.max(0,(now-lastTime)/1000));lastTime=now;elapsed+=dt;frames++;
  const desired=walking?.60:0;speed+=Math.sign(desired-speed)*Math.min(Math.abs(desired-speed),(walking?1.8:2.8)*dt);
  const movement=speed*dt;active.object.position.z+=movement;camera.position.z+=movement;controls.target.z+=movement;
  if(active.object.position.z>30){active.object.position.z-=30;camera.position.z-=30;controls.target.z-=30;active.update(0,{reset:true,moving:false,speed:0,time:elapsed});}
  active.update(dt,{speed,moving:speed>.001,time:elapsed,sampleHeight:()=>0});
  key.position.z=active.object.position.z+3.5;key.target.position.z=active.object.position.z;
  fill.position.z=active.object.position.z-2;fill.target.position.z=active.object.position.z;
  controls.update();renderer.render(scene,camera);requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.__catStudy=Object.freeze({getState(){return{ready:true,frames,mode,view,walking,speed,position:active.object.position.toArray(),geometry:geometryStats(),cat:active.getDebugState?.()||null};}});
