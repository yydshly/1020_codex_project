import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { setupEnvironment as setupPreviousEnvironment } from './scene-space-03-environment.js';
import { setupEnvironment as setupRefinedEnvironment } from './scene-space-04-environment.js';
import { applyLighting } from './scene-space-04-lighting.js';
import { createNavigation } from './roam-navigation.js';

const $ = id => document.getElementById(id);
const views = {
  facades: {position:[-3,4.3,1.4],target:[-3,3.2,18],title:'阴影里也能读出材料',text:'保留房屋轮廓与细节，让玻璃、木构和抹灰在傍晚各有不同的光线响应。'},
  opposite: {position:[-17,2.5,12.6],target:[-.5,2.9,19],title:'沿街观察光与表面',text:'细看窗片反射、木门色泽、墙面斑驳与原有石路，比较三种阶段。'},
  windows: {position:[-8.4,2.4,13.4],target:[-10.7,2.8,16.4],title:'窗片透出浅层次',text:'减轻不透明蓝色块的读感，保留窗框与深处封闭背板，门扇保持关闭。'},
  roofs: {position:[-13,10.5,11.4],target:[-3,4.3,18.8],title:'保留瓦面的层次',text:'检查天空散射光对屋顶的影响，保持深蓝灰瓦色、错缝与檐口阴影。'},
  side: {position:[-17.7,3.0,18.2],target:[-12.0,2.7,18.8],title:'抹灰有细微起伏',text:'通过微表面和克制旧化表现墙面，检查阴影里的窗台与墙脚是否自然。'},
  overview: {position:[-35,32,39],target:[-3,1.7,5],title:'同一片街区，调整光与材质',text:'本轮沿用上一版全部几何，保持桥、河道、院落和远景范围。'},
  bridge: {position:[9.4,3.9,6.1],target:[-7,2.6,-.2],title:'书店暖光依然是重点',text:'检查天空填光后，暖窗、湿石路和水面反光是否仍保持傍晚的层次。'},
  reverse: {position:[-8,8,29],target:[-3,3.0,17.5],title:'背面也延续同一种质感',text:'从另一侧检查窗片、墙面与屋顶，避免只在正面成立。'},
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
setView('facades');

async function loadVersion(key){
  if(scenes.has(key))return scenes.get(key);
  const modelName='space-03';
  const [gltf,manifest]=await Promise.all([
    new GLTFLoader().loadAsync(`models/${modelName}.glb`),
    fetch('models/space-03-manifest.json').then(response=>{
      if(!response.ok)throw new Error('The opposite-building detail manifest is unavailable.');
      return response.json();
    }),
  ]);
  const scene=new THREE.Scene();scene.add(gltf.scene);
  const setup=key==='previous'?setupPreviousEnvironment:setupRefinedEnvironment;
  const facade=manifest?.refinements?.facades;
  const environment=await setup(renderer,scene,gltf.scene,{mobile:window.innerWidth<700,
    materialAliases:facade?.web_material_aliases,windowMaterials:facade?.web_window_materials});
  const lighting=key==='complete'?applyLighting(scene,renderer,{mobile:window.innerWidth<700}):null;
  // The former 10m study shadow frustum excluded most of the block. Both
  // comparison versions use the same widened frustum, with no extra lights.
  scene.traverse(light=>{
    if(!light.isDirectionalLight)return;
    Object.assign(light.shadow.camera,{left:-38,right:38,top:38,bottom:-38,near:.5,far:105});
    light.shadow.camera.updateProjectionMatrix();light.shadow.needsUpdate=true;
    light.shadow.normalBias=.018;
  });
  scene.fog.density=.008;
  const result={scene,environment,lighting};scenes.set(key,result);return result;
}
async function activate(nextStage){
  if(loading)return;
  loading=true;stopTour();document.querySelectorAll('[data-stage]').forEach(button=>button.disabled=true);$('loading').hidden=false;
  const stageLabels={previous:'上一版',material:'仅调材质',complete:'完整优化'};
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
window.addEventListener('pagehide',event=>{if(event.persisted)return;cancelAnimationFrame(frame);controls.dispose();for(const {scene,environment,lighting} of scenes.values()){lighting?.dispose?.();environment.dispose();scene.traverse(obj=>{if(obj.isMesh){obj.geometry.dispose();for(const material of(Array.isArray(obj.material)?obj.material:[obj.material]))material.dispose();}});}renderer.dispose();});
