import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { setupEnvironment as setupPreviousEnvironment } from './scene-space-02-environment.js';
import { setupEnvironment as setupRefinedEnvironment } from './scene-space-03-environment.js';
import { createNavigation } from './roam-navigation.js';

const $ = id => document.getElementById(id);
const views = {
  facades: {position:[-3,4.3,1.4],target:[-3,3.2,18],title:'同一排房屋，更完整的构造',text:'保持原有房屋位置与色彩，细化瓦顶、浅窗洞、窗框和门扇，与书店一侧呼应。'},
  opposite: {position:[-17,2.5,12.6],target:[-.5,2.9,19],title:'沿着对岸近距离看',text:'检查窗洞深度、百叶开合、木门和墙脚细节，比较原来的平面黑板窗。'},
  windows: {position:[-8.4,2.4,13.4],target:[-10.7,2.8,16.4],title:'门窗有了前后层次',text:'窗套、窗台、细窗棂与反射窗片形成浅凹层次，门扇仍保持关闭。'},
  roofs: {position:[-13,10.5,11.4],target:[-3,4.3,18.8],title:'屋顶从薄板变成瓦面',text:'检查屋脊、错缝瓦片、檐口厚度和排水结构，保持原有蓝灰屋顶轮廓。'},
  side: {position:[-17.7,3.0,18.2],target:[-12.0,2.7,18.8],title:'转过街角也有细节',text:'侧墙门窗、墙脚和屋顶端部延续正面的构造，观察不同角度是否自然。'},
  overview: {position:[-35,32,39],target:[-3,1.7,5],title:'细化现有街区的另一岸',text:'本版只细化对岸原有三栋房屋，街区、河道、院落和远景范围沿用上一版。'},
  bridge: {position:[9.4,3.9,6.1],target:[-7,2.6,-.2],title:'回看书店一侧的尺度',text:'两岸使用同一套旧街石材、木构与抹灰质感，对照檐口、窗框和屋顶的细节尺度。'},
  reverse: {position:[-8,8,29],target:[-3,3.0,17.5],title:'从背面检查建筑',text:'背墙和侧墙同样补了浅窗洞与屋顶收口，房屋内部仍未开放。'},
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
  const modelName=key==='previous'?'space-02':'space-03';
  const [gltf,manifest]=await Promise.all([
    new GLTFLoader().loadAsync(`models/${modelName}.glb`),
    key==='complete'?fetch('models/space-03-manifest.json').then(response=>{
      if(!response.ok)throw new Error('The opposite-building detail manifest is unavailable.');
      return response.json();
    }):Promise.resolve(null),
  ]);
  const scene=new THREE.Scene();scene.add(gltf.scene);
  const setup=key==='complete'?setupRefinedEnvironment:setupPreviousEnvironment;
  const facade=manifest?.refinements?.facades;
  const environment=await setup(renderer,scene,gltf.scene,{mobile:window.innerWidth<700,
    materialAliases:facade?.web_material_aliases,windowMaterials:facade?.web_window_materials});
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
  const stageLabels={previous:'上一版',complete:'对岸精修'};
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
