import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { setupEnvironment } from './shop-study-01-environment.js';
import { createNavigation } from './roam-navigation.js';

const $ = id => document.getElementById(id);
const views = {
  overview: {position:[-35,32,39],target:[-3,1.7,5],title:'两岸、双桥与后巷',text:'沿街房屋通过院落与边界衔接；后方低屋形成第二层街区。'},
  front: {position:[-16,6.2,16],target:[-1,3.8,-1],title:'同一条河，两岸相连',text:'保留原有店面与石桥，观察对岸街道和岸墙如何围合河道。'},
  opposite: {position:[-17,2.5,12.6],target:[-.5,2.9,19],title:'把孤立房屋连成院落',text:'房屋间增加院墙与门口边界，后排低屋接续街区纵深。'},
  rear: {position:[10.9,2.5,-8],target:[-10,2.5,-7.8],title:'从店前走到店后',text:'后墙基脚、檐口和排水结构接续侧巷；外侧小院将后巷与远景分开。'},
  bridge: {position:[9.4,3.9,6.1],target:[-7,2.6,-.2],title:'桥落在街道上',text:'桥头补翼墙与坡脚，保持两岸通路和原有桥面净宽。'},
  west: {position:[-32,4.6,2.6],target:[-19,1.2,6.4],title:'石岸过渡到自然河岸',text:'岸墙端部向折线石边与坡地过渡；河道继续向远处弯转。'},
  reverse: {position:[21,26,-35],target:[-3,1.5,1],title:'绕到背面也能成立',text:'从背面检查院落、后巷、两岸与低层远景是否连贯。'},
};
const renderer = new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.5));
renderer.outputColorSpace = THREE.SRGBColorSpace;
$('world').appendChild(renderer.domElement);
const camera = new THREE.PerspectiveCamera(52,1,.08,430);
const controls = new OrbitControls(camera,renderer.domElement);
controls.enableDamping = true; controls.dampingFactor=.09;
controls.minDistance=1; controls.maxDistance=105; controls.maxPolarAngle=Math.PI*.495;
const navigation=createNavigation();
const scenes=new Map();
let current=null, baseline=false, loading=false, tour=null, time=0, previousTime=0, frame=0;

function resize(){renderer.setSize(window.innerWidth,window.innerHeight);camera.aspect=window.innerWidth/window.innerHeight;camera.updateProjectionMatrix();}
window.addEventListener('resize',resize);resize();
function stopTour(){
  if(tour){const direction=new THREE.Vector3();camera.getWorldDirection(direction);controls.target.copy(camera.position).addScaledVector(direction,4);}
  tour=null;controls.enabled=true;$('stop').hidden=true;
  $('tour-banks').setAttribute('aria-pressed','false');$('tour-rear').setAttribute('aria-pressed','false');
}
function setView(key){
  stopTour();const view=views[key];camera.position.fromArray(view.position);controls.target.fromArray(view.target);controls.update();
  document.querySelectorAll('[data-view]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.view===key)));
  $('view-number').textContent=`0${Object.keys(views).indexOf(key)+1} / ${document.querySelector(`[data-view="${key}"]`).textContent}`;
  $('view-title').textContent=view.title;$('view-description').textContent=view.text;
}
document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>setView(button.dataset.view)));
setView('overview');

async function loadVersion(isBaseline){
  const key=isBaseline?'roam-02':'space-01';
  if(scenes.has(key))return scenes.get(key);
  const gltf=await new GLTFLoader().loadAsync(`models/${key}.glb`);
  const scene=new THREE.Scene();scene.add(gltf.scene);
  const environment=await setupEnvironment(renderer,scene,gltf.scene,{mobile:window.innerWidth<700});
  // The former 10m study shadow frustum excluded most of the block. Both
  // comparison versions use the same widened frustum, with no extra lights.
  scene.traverse(light=>{
    if(!light.isDirectionalLight)return;
    Object.assign(light.shadow.camera,{left:-38,right:38,top:38,bottom:-38,near:.5,far:105});
    light.shadow.camera.updateProjectionMatrix();light.shadow.needsUpdate=true;
    light.shadow.normalBias=.018;
  });
  scene.fog.density=.008;
  const result={scene,environment};scenes.set(key,result);return result;
}
async function activate(isBaseline){
  if(loading)return;
  loading=true;stopTour();$('compare').disabled=true;$('loading').hidden=false;
  $('load-text').textContent=isBaseline?'正在载入补齐前的街区…':'正在载入街区…';
  try{
    current=await loadVersion(isBaseline);baseline=isBaseline;
    $('compare').setAttribute('aria-pressed',String(baseline));$('compare').textContent=baseline?'返回补齐后':'对比补齐前';
    $('version').textContent=baseline?'当前：补齐前 · 同一镜头':'当前：街区空间 01';
    current.environment.update(time,{camera});renderer.render(current.scene,camera);$('loading').hidden=true;
  }catch(error){console.error('Scene preview failed',error);$('loading').classList.add('error');$('load-text').textContent='场景未能载入，请重试。';$('retry').hidden=false;
  }finally{loading=false;$('compare').disabled=false;}
}
$('compare').addEventListener('click',()=>activate(!baseline));$('retry').addEventListener('click',()=>location.reload());

function routePoint(route,distance){
  const d=((distance%route.total)+route.total)%route.total;
  let offset=0;
  for(let i=0;i<route.lengths.length;i++){
    const length=route.lengths[i];
    if(d<=offset+length){const t=(d-offset)/length,a=route.points[i],b=route.points[i+1];const x=THREE.MathUtils.lerp(a.x,b.x,t),z=THREE.MathUtils.lerp(a.z,b.z,t);return new THREE.Vector3(x,(navigation.sampleHeight(x,z)??.85)+1.55,z);}
    offset+=length;
  }
  return new THREE.Vector3(route.points[0].x,2.4,route.points[0].z);
}
function beginTour(name){
  if(!current||loading)return;stopTour();
  const points=navigation.routes[name];const lengths=points.slice(1).map((point,i)=>Math.hypot(point.x-points[i].x,point.z-points[i].z));
  tour={points,lengths,total:lengths.reduce((a,b)=>a+b,0),distance:0};
  camera.position.copy(routePoint(tour,0));camera.lookAt(routePoint(tour,2));controls.enabled=false;
  $('stop').hidden=false;$(name==='both_banks_loop'?'tour-banks':'tour-rear').setAttribute('aria-pressed','true');
  document.querySelectorAll('[data-view]').forEach(button=>button.setAttribute('aria-pressed','false'));
  $('view-number').textContent='步行视角 / 眼高约 1.55 米';$('view-title').textContent=name==='both_banks_loop'?'沿两岸与双桥巡看':'沿店后小巷巡看';$('view-description').textContent='以步行速度沿现有通路巡看。点击停止后可自由旋转、缩放检查。';
}
$('tour-banks').addEventListener('click',()=>beginTour('both_banks_loop'));$('tour-rear').addEventListener('click',()=>beginTour('rear_lane_loop'));$('stop').addEventListener('click',stopTour);
window.addEventListener('keydown',event=>{if(event.key==='Escape')stopTour();});
document.addEventListener('visibilitychange',()=>{previousTime=0;});
function animate(timestamp){
  frame=requestAnimationFrame(animate);
  if(document.hidden){previousTime=0;return;}
  const delta=previousTime?Math.min((timestamp-previousTime)/1000,.05):0;previousTime=timestamp;time+=delta;
  if(tour){tour.distance+=delta*1.25;camera.position.copy(routePoint(tour,tour.distance));const target=routePoint(tour,tour.distance+2);camera.lookAt(target);}
  else controls.update();
  if(current&&!loading){current.environment.update(time,{camera});renderer.render(current.scene,camera);}
}
frame=requestAnimationFrame(animate);activate(false);
window.addEventListener('pagehide',event=>{if(event.persisted)return;cancelAnimationFrame(frame);controls.dispose();for(const {scene,environment} of scenes.values()){environment.dispose();scene.traverse(obj=>{if(obj.isMesh){obj.geometry.dispose();for(const material of(Array.isArray(obj.material)?obj.material:[obj.material]))material.dispose();}});}renderer.dispose();});
