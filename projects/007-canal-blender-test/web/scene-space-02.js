import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { setupEnvironment as setupPreviousEnvironment } from './shop-study-01-environment.js';
import { setupEnvironment as setupUnifiedEnvironment } from './scene-space-02-environment.js';
import { createNavigation } from './roam-navigation.js';

const $ = id => document.getElementById(id);
const views = {
  overview: {position:[-35,32,39],target:[-3,1.7,5],title:'同一片街区，连贯的质感',text:'保留原有空间布局，用平缓河岸和统一尺度的墙面、石路接续整片街区。'},
  front: {position:[-16,6.2,16],target:[-1,3.8,-1],title:'从书店样板延续到两岸',text:'统一雨后石面与墙面的尺度，保留各栋房屋的颜色差异。'},
  opposite: {position:[-17,2.5,12.6],target:[-.5,2.9,19],title:'对岸有了旧街的质感',text:'检查抹灰、墙脚受潮、木窗和石路，减少光滑色块与过大的方格。'},
  rear: {position:[10.9,2.5,-8],target:[-10,2.5,-7.8],title:'后巷也延续同一种材料',text:'粗糙墙面、低调木纹与湿石路延续到店后，观察贴图尺度和表面反光。'},
  bridge: {position:[9.4,3.9,6.1],target:[-7,2.6,-.2],title:'桥落在街道上',text:'桥头补翼墙与坡脚，保持两岸通路和原有桥面净宽。'},
  west: {position:[-32,4.6,2.6],target:[-19,1.2,6.4],title:'河岸平缓地接入远处',text:'从岸端检查坡地过渡，保留河流弯向远处的走向。'},
  reverse: {position:[21,26,-35],target:[-3,1.5,1],title:'从背面检查整体连续性',text:'观察院落、后巷、屋顶与地形如何衔接，场景范围与上一版相同。'},
  distant: {position:[-18,2.5,12.6],target:[-70,1.4,0],title:'让远河岸逐渐抬升',text:'这里可直接看到上一版的陡边。切换“只修地形”，单独比较近岸到内陆的坡形。'},
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
let current=null, stage='complete', loading=false, tour=null, time=0, previousTime=0, frame=0;

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

async function loadVersion(key){
  if(scenes.has(key))return scenes.get(key);
  const modelName=key==='previous'?'space-01':'space-02';
  const gltf=await new GLTFLoader().loadAsync(`models/${modelName}.glb`);
  const scene=new THREE.Scene();scene.add(gltf.scene);
  const setup=key==='complete'?setupUnifiedEnvironment:setupPreviousEnvironment;
  const environment=await setup(renderer,scene,gltf.scene,{mobile:window.innerWidth<700});
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
async function activate(nextStage){
  if(loading)return;
  loading=true;stopTour();document.querySelectorAll('[data-stage]').forEach(button=>button.disabled=true);$('loading').hidden=false;
  const stageLabels={previous:'上一版',terrain:'只修地形',complete:'地形＋材质'};
  $('load-text').textContent=`正在载入${stageLabels[nextStage]}…`;
  try{
    current=await loadVersion(nextStage);stage=nextStage;
    document.querySelectorAll('[data-stage]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.stage===stage)));
    $('version').textContent=`当前：${stageLabels[stage]} · 同一镜头`;
    $('loading').classList.remove('error');$('retry').hidden=true;
    current.environment.update(time,{camera});renderer.render(current.scene,camera);$('loading').hidden=true;
  }catch(error){console.error('Scene preview failed',error);$('loading').classList.add('error');$('load-text').textContent='场景未能载入，请重试。';$('retry').hidden=false;
  }finally{loading=false;document.querySelectorAll('[data-stage]').forEach(button=>button.disabled=false);}
}
document.querySelectorAll('[data-stage]').forEach(button=>button.addEventListener('click',()=>{if(button.dataset.stage!==stage)activate(button.dataset.stage);}));$('retry').addEventListener('click',()=>location.reload());

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
frame=requestAnimationFrame(animate);activate('complete');
window.addEventListener('pagehide',event=>{if(event.persisted)return;cancelAnimationFrame(frame);controls.dispose();for(const {scene,environment} of scenes.values()){environment.dispose();scene.traverse(obj=>{if(obj.isMesh){obj.geometry.dispose();for(const material of(Array.isArray(obj.material)?obj.material:[obj.material]))material.dispose();}});}renderer.dispose();});
