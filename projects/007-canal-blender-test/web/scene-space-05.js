import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { setupEnvironment } from './scene-space-04-environment.js';
import { applyLighting } from './scene-space-04-lighting.js';
import { createNavigation } from './scene-space-05-navigation.js';

const $=id=>document.getElementById(id);
const views={
  entrance:{position:[-8.5,2.75,13.1],target:[-7.05,2.0,19.0],title:'从临河街走进巷口',text:'在现有两栋房屋之间，打开入口，沿夹巷接入后方小院。'},
  passage:{position:[-7.05,2.4,20.2],target:[-7.5,1.9,24.4],title:'巷道通向小院',text:'穿过两栋房屋与后墙开口，地面连续衔接到小院。'},
  courtyard:{position:[-11.45,2.405,25.28],target:[-7.15,1.55,23.0],title:'从院内寻找回街道的路',text:'院落保持小而完整。沿刚才的巷道返回，出口连到临河街。'},
  overview:{position:[-14.6,10.5,20.4],target:[-9.1,.86,24.2],title:'一个巷口，一处小院',text:'新铺地和围墙局限在这一小块范围，利用既有建筑和后墙形成空间。'},
  outward:{position:[-7.05,2.4,19.0],target:[-7.05,2.1,12.0],title:'从巷中回望临河街',text:'入口保持可辨认的视线，回到主街时还能看到河道。'},
  block:{position:[-35,32,39],target:[-3,1.7,5],title:'保留整片街区',text:'房屋、桥、河道和远景延续上一版，只增加这一段可走空间。'},
};
const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;
$('world').appendChild(renderer.domElement);
const camera=new THREE.PerspectiveCamera(52,1,.08,430);
const controls=new OrbitControls(camera,renderer.domElement);
controls.enableDamping=true;controls.dampingFactor=.10;controls.minDistance=.8;controls.maxDistance=100;controls.maxPolarAngle=Math.PI*.495;
const navigation=createNavigation(),scenes=new Map();
const input=new Set(),touch=new Set(),look={id:null,x:0,y:0};
let current=null,stage='complete',loading=false,mode='inspect',foot=navigation.reset(),yaw=Math.PI,pitch=0;
let tour=null,time=0,lastTime=0,frame=0,lastLocation='';
const eyeHeight=1.55,moveSpeed=1.25;
const isCoarse=matchMedia('(pointer:coarse)').matches;

function resize(){renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();}
addEventListener('resize',resize);resize();
function clearInput(){input.clear();touch.clear();look.id=null;}
function modeUI(){
  const walking=mode!=='inspect';$('scene-app').classList.toggle('walking',walking);
  $('walk').setAttribute('aria-pressed',String(mode==='walk'));$('walk').textContent=mode==='walk'?'退出步行':'开始步行';
  $('tour').setAttribute('aria-pressed',String(mode==='tour'));$('tour').textContent=mode==='tour'?'停止演示':'进院往返演示';
  $('walk-status').hidden=!walking;$('map-card').hidden=!walking;$('walk-pad').hidden=!(mode==='walk'&&isCoarse);
  $('map-mode').textContent=mode==='tour'?'往返演示':'步行中';
  $('hint').textContent=walking?'WASD 移动 · 拖动环顾 · ← → 转向 · Esc 自由查看':'拖动旋转 · 滚轮缩放 · 点“开始步行”进入街道';
}
function stopMotion(){
  if(mode!=='inspect'){
    const direction=new THREE.Vector3();camera.getWorldDirection(direction);controls.target.copy(camera.position).addScaledVector(direction,3);
  }
  mode='inspect';tour=null;clearInput();controls.enabled=true;controls.enableDamping=false;controls.update();controls.enableDamping=true;modeUI();
}
function setView(key){
  stopMotion();const view=views[key];camera.position.fromArray(view.position);controls.target.fromArray(view.target);controls.update();
  document.querySelectorAll('[data-view]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.view===key)));
  $('view-number').textContent=`0${Object.keys(views).indexOf(key)+1} / ${document.querySelector(`[data-view="${key}"]`).textContent}`;
  $('view-title').textContent=view.title;$('view-description').textContent=view.text;
}
document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>setView(button.dataset.view)));
setView('entrance');

function applyWalkingCamera(){
  camera.position.set(foot.x,foot.y+eyeHeight,foot.z);camera.rotation.set(pitch,yaw,0,'YXZ');
  const location=foot.z>22.6?'相连小院':foot.z>15.5?'临河夹巷':'临河街';
  if(location!==lastLocation){$('location').textContent=location;lastLocation=location;}
  drawMap();
}
function beginWalk(reset=true){
  if(!current||loading||stage!=='complete')return;
  clearInput();tour=null;mode='walk';controls.enabled=false;
  if(reset){foot=navigation.reset(navigation.spawns?.courtyardEntrance??navigation.spawn);yaw=Math.PI;pitch=0;}
  document.querySelectorAll('[data-view]').forEach(button=>button.setAttribute('aria-pressed','false'));
  modeUI();applyWalkingCamera();$('world').focus({preventScroll:true});
}
function beginTour(){
  if(!current||loading||stage!=='complete')return;
  const points=navigation.routes.courtyard_return;
  const lengths=points.slice(1).map((point,i)=>Math.hypot(point.x-points[i].x,point.z-points[i].z));
  tour={points,lengths,total:lengths.reduce((a,b)=>a+b,0),distance:0};
  mode='tour';clearInput();controls.enabled=false;foot=navigation.reset(points[0]);pitch=0;
  const next=points[1];yaw=Math.atan2(-(next.x-foot.x),-(next.z-foot.z));
  document.querySelectorAll('[data-view]').forEach(button=>button.setAttribute('aria-pressed','false'));
  modeUI();applyWalkingCamera();
}
function sampleRoute(path,distance){
  const d=Math.min(path.total,Math.max(0,distance));let start=0;
  for(let i=0;i<path.lengths.length;i++){
    const length=path.lengths[i];if(d<=start+length+.000001){
      const t=length?THREE.MathUtils.clamp((d-start)/length,0,1):0,a=path.points[i],b=path.points[i+1];
      const x=THREE.MathUtils.lerp(a.x,b.x,t),z=THREE.MathUtils.lerp(a.z,b.z,t);
      return{x,z,y:navigation.sampleHeight(x,z)??.85};
    }start+=length;
  }return path.points.at(-1);
}
$('walk').addEventListener('click',()=>mode==='walk'?stopMotion():beginWalk());
$('tour').addEventListener('click',()=>mode==='tour'?stopMotion():beginTour());
$('reset').addEventListener('click',()=>stage==='complete'?beginWalk():setView('entrance'));
$('help').addEventListener('click',()=>{const expanded=$('help').getAttribute('aria-expanded')!=='true';$('help').setAttribute('aria-expanded',String(expanded));$('help-panel').hidden=!expanded;});

const movementKeys=new Set(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight']);
addEventListener('keydown',event=>{
  if(event.code==='Escape'){stopMotion();$('help-panel').hidden=true;$('help').setAttribute('aria-expanded','false');return;}
  if(mode==='tour'&&movementKeys.has(event.code))beginWalk(false);
  if(mode!=='walk'||!movementKeys.has(event.code))return;
  event.preventDefault();input.add(event.code);
});
addEventListener('keyup',event=>input.delete(event.code));addEventListener('blur',clearInput);
document.addEventListener('visibilitychange',()=>{lastTime=0;clearInput();});
const canvas=renderer.domElement;
canvas.addEventListener('pointerdown',event=>{
  if(mode!=='walk'||event.button>0)return;look.id=event.pointerId;look.x=event.clientX;look.y=event.clientY;
  canvas.setPointerCapture(event.pointerId);event.preventDefault();
});
canvas.addEventListener('pointermove',event=>{
  if(mode!=='walk'||look.id!==event.pointerId)return;
  yaw-=(event.clientX-look.x)*.004;pitch=THREE.MathUtils.clamp(pitch-(event.clientY-look.y)*.003,-.85,.85);
  look.x=event.clientX;look.y=event.clientY;
});
for(const name of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(name,event=>{if(look.id===event.pointerId)look.id=null;});
document.querySelectorAll('[data-move]').forEach(button=>{
  button.addEventListener('pointerdown',event=>{if(mode!=='walk')return;touch.add(button.dataset.move);button.setPointerCapture(event.pointerId);event.preventDefault();});
  for(const name of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(name,()=>touch.delete(button.dataset.move));
});

async function loadVersion(key){
  if(scenes.has(key))return scenes.get(key);
  const modelName=key==='previous'?'space-03':'space-05';
  const [gltf,appearance]=await Promise.all([
    new GLTFLoader().loadAsync(`models/${modelName}.glb`),
    fetch('models/space-03-manifest.json').then(response=>{if(!response.ok)throw new Error('Appearance data unavailable');return response.json();}),
  ]);
  const scene=new THREE.Scene();scene.add(gltf.scene);const facade=appearance.refinements.facades;
  const environment=await setupEnvironment(renderer,scene,gltf.scene,{mobile:innerWidth<700,materialAliases:facade.web_material_aliases,windowMaterials:facade.web_window_materials});
  const lighting=applyLighting(scene,renderer);
  scene.traverse(light=>{
    if(light.isDirectionalLight){Object.assign(light.shadow.camera,{left:-38,right:38,top:38,bottom:-38,near:.5,far:105});light.shadow.camera.updateProjectionMatrix();light.shadow.normalBias=.018;}
    // The only moving object here is the camera. Cache static shadow maps.
    if(light.isLight&&light.castShadow){light.shadow.autoUpdate=false;light.shadow.needsUpdate=true;}
  });
  scene.fog.density=.008;const result={scene,environment,lighting};scenes.set(key,result);return result;
}
async function activate(nextStage){
  if(loading)return;loading=true;stopMotion();$('loading').hidden=false;
  document.querySelectorAll('[data-stage]').forEach(button=>button.disabled=true);
  $('load-text').textContent=nextStage==='previous'?'正在载入上一版封闭院门…':'正在载入巷口与小院…';
  try{
    current=await loadVersion(nextStage);stage=nextStage;
    document.querySelectorAll('[data-stage]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.stage===stage)));
    $('walk').disabled=$('tour').disabled=stage==='previous';
    $('version').textContent=stage==='previous'?'上一版 · 院门未开放':'本版 · 可步行进入小院';
    current.environment.update(time,{camera});renderer.render(current.scene,camera);$('loading').hidden=true;
  }catch(error){console.error('Courtyard preview failed',error);$('load-text').textContent='场景未能载入，请重试。';$('retry').hidden=false;
  }finally{loading=false;document.querySelectorAll('[data-stage]').forEach(button=>button.disabled=false);}
}
document.querySelectorAll('[data-stage]').forEach(button=>button.addEventListener('click',()=>{if(button.dataset.stage!==stage)activate(button.dataset.stage);}));
$('retry').addEventListener('click',()=>location.reload());

const map=$('map'),mapContext=map.getContext('2d');
const mapBounds={minX:-21,maxX:13,minZ:-9,maxZ:27};
function drawMap(){
  const ctx=mapContext,w=map.width,h=map.height;
  const sx=x=>12+(x-mapBounds.minX)/(mapBounds.maxX-mapBounds.minX)*(w-24);
  const sz=z=>12+(z-mapBounds.minZ)/(mapBounds.maxZ-mapBounds.minZ)*(h-24);
  ctx.clearRect(0,0,w,h);ctx.fillStyle='#122820';ctx.fillRect(0,0,w,h);
  ctx.fillStyle='#254444';ctx.fillRect(0,sz(1.75),w,sz(10.55)-sz(1.75));
  for(const zone of navigation.zones){ctx.fillStyle=/courtyard|alley|connector/.test(zone.id)?'#66755c':'#435747';ctx.fillRect(sx(zone.minX),sz(zone.minZ),sx(zone.maxX)-sx(zone.minX),sz(zone.maxZ)-sz(zone.minZ));}
  ctx.fillStyle='#1b3028';ctx.strokeStyle='#9aac9360';ctx.lineWidth=2;
  for(const [left,right,near,far]of[[-13.8,-8.2,16.35,21.35],[-5.9,-.1,16.35,21.35],[2,7.6,16.35,21.35],[-9.9,7.9,-6.6,-1.11]]){
    ctx.fillRect(sx(left),sz(near),sx(right)-sx(left),sz(far)-sz(near));ctx.strokeRect(sx(left),sz(near),sx(right)-sx(left),sz(far)-sz(near));
  }
  const route=navigation.routes.courtyard_return;ctx.strokeStyle='#c7b47b';ctx.lineWidth=2;ctx.setLineDash([5,5]);ctx.beginPath();route.forEach((point,i)=>{if(i)ctx.lineTo(sx(point.x),sz(point.z));else ctx.moveTo(sx(point.x),sz(point.z));});ctx.stroke();ctx.setLineDash([]);
  const px=sx(foot.x),pz=sz(foot.z);ctx.fillStyle='#f2d094';ctx.beginPath();ctx.arc(px,pz,5,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle='#f2d094';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(px,pz);ctx.lineTo(px-Math.sin(yaw)*15,pz-Math.cos(yaw)*15);ctx.stroke();
  ctx.font='18px sans-serif';ctx.fillStyle='#d7dfca';ctx.fillText('临河街',sx(-3),sz(12.3));ctx.fillText('小院',sx(-11.6),sz(25.2));
}
function updateWalking(delta){
  yaw+=((input.has('ArrowLeft')?1:0)-(input.has('ArrowRight')?1:0))*delta*1.35;
  let forward=(input.has('KeyW')||input.has('ArrowUp')||touch.has('forward')?1:0)-(input.has('KeyS')||input.has('ArrowDown')||touch.has('backward')?1:0);
  let side=(input.has('KeyD')||touch.has('right')?1:0)-(input.has('KeyA')||touch.has('left')?1:0);
  const amount=Math.hypot(forward,side);if(amount){forward/=amount;side/=amount;
    foot=navigation.move(foot,{x:(-Math.sin(yaw)*forward+Math.cos(yaw)*side)*moveSpeed*delta,z:(-Math.cos(yaw)*forward-Math.sin(yaw)*side)*moveSpeed*delta});
  }applyWalkingCamera();
}
function updateTour(delta){
  const path=tour;path.distance=Math.min(path.total,path.distance+delta*1.1);
  const target=sampleRoute(path,path.distance),ahead=sampleRoute(path,Math.min(path.total,path.distance+.8));
  foot=navigation.move(foot,{x:target.x-foot.x,z:target.z-foot.z});
  if(Math.hypot(ahead.x-foot.x,ahead.z-foot.z)>.025){const heading=Math.atan2(-(ahead.x-foot.x),-(ahead.z-foot.z));yaw+=Math.atan2(Math.sin(heading-yaw),Math.cos(heading-yaw))*(1-Math.exp(-delta*5));}
  applyWalkingCamera();
  if(path.distance>=path.total){beginWalk(false);$('location').textContent='已回到临河街，可继续行走';lastLocation='临河街';}
}
function animate(timestamp){
  frame=requestAnimationFrame(animate);if(document.hidden){lastTime=0;return;}
  if(lastTime&&timestamp-lastTime<1000/30)return;
  const delta=lastTime?Math.min((timestamp-lastTime)/1000,.05):0;lastTime=timestamp;time+=delta;
  if(mode==='walk')updateWalking(delta);else if(mode==='tour')updateTour(delta);else controls.update();
  if(current&&!loading){current.environment.update(time,{camera});renderer.render(current.scene,camera);}
}
frame=requestAnimationFrame(animate);activate('complete');
addEventListener('pagehide',event=>{if(event.persisted)return;cancelAnimationFrame(frame);clearInput();controls.dispose();for(const {scene,environment,lighting}of scenes.values()){lighting.dispose();environment.dispose();scene.traverse(part=>{if(part.isMesh){part.geometry.dispose();for(const material of(Array.isArray(part.material)?part.material:[part.material]))material.dispose();}});}renderer.dispose();});
